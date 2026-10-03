import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { type Database, uid } from "../../../packages/database/src/index.ts";
import { config } from "../../../packages/configuration/src/index.ts";
import {
  hash,
  secret,
  passwordHash,
  verifyPassword,
} from "../../../packages/shared/src/security.ts";
import { type Role } from "../../../packages/shared/src/index.ts";
import { audit, fail } from "./services.ts";
export type Actor = {
  userId: string;
  org: string;
  role: Role;
  csrf: string;
  sessionId: string;
};
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
export function permit(
  req: FastifyRequest,
  roles: Role[] = ["owner", "admin", "editor"],
) {
  if (!roles.includes(req.actor.role))
    fail("Your role cannot perform this action", 403);
}
const accountSchema = z.object({
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(100),
  organization: z.string().min(1).max(100),
});
export async function authentication(app: FastifyInstance, db: Database) {
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.NODE_ENV === "production",
    maxAge: 86400,
  };
  async function session(reply: FastifyReply, userId: string, org: string) {
    const raw = secret(),
      csrf = secret();
    await db.query(
      "INSERT INTO sessions(id,user_id,organization_id,csrf,expires_at) VALUES($1,$2,$3,$4,$5)",
      [hash(raw), userId, org, csrf, new Date(Date.now() + 86400000)],
    );
    reply.setCookie("inboxflow_session", raw, cookieOptions);
    return csrf;
  }
  app.decorateRequest("actor", null as unknown as Actor);
  app.addHook("preHandler", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      req.method !== "GET" &&
      req.headers.origin &&
      req.headers.origin !== config.APP_URL &&
      !req.url.startsWith("/api/amp/") &&
      !req.url.startsWith("/api/webhooks/")
    )
      fail("Request origin is not allowed", 403);
    if (req.routeOptions.config.public) return;
    const raw = req.cookies.inboxflow_session;
    if (!raw) fail("Sign in to continue", 401);
    const row = (
      await db.query(
        "SELECT s.*,m.role FROM sessions s JOIN memberships m ON m.organization_id=s.organization_id AND m.user_id=s.user_id WHERE s.id=$1 AND s.expires_at>now()",
        [hash(raw)],
      )
    ).rows[0];
    if (!row) fail("Session expired. Please sign in again.", 401);
    req.actor = {
      userId: row.user_id,
      org: row.organization_id,
      role: row.role,
      csrf: row.csrf,
      sessionId: row.id,
    };
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== row.csrf
    )
      fail("Invalid CSRF token", 403);
  });
  app.post(
    "/api/auth/register",
    {
      config: { public: true },
      schema: {
        tags: ["Authentication"],
        summary: "Register and create an organization",
      },
    },
    async (req, reply) => {
      const p = accountSchema.parse(req.body);
      const existing = (
        await db.query("SELECT id FROM users WHERE email=$1", [p.email])
      ).rows[0];
      if (existing) fail("Email is already registered", 409);
      const userId = uid(),
        org = uid();
      await db.transaction(async (tx) => {
        await tx.query(
          "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
          [userId, p.email, p.name, passwordHash(p.password)],
        );
        await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
          org,
          p.organization,
        ]);
        await tx.query("INSERT INTO memberships VALUES($1,$2,$3)", [
          org,
          userId,
          "owner",
        ]);
        await audit(tx, org, userId, "organization.created");
      });
      const csrf = await session(reply, userId, org);
      return { csrf, userId, org };
    },
  );
  app.post(
    "/api/auth/login",
    {
      config: { public: true },
      schema: { tags: ["Authentication"], summary: "Start a secure session" },
    },
    async (req, reply) => {
      const p = z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          password: z.string().max(128),
        })
        .parse(req.body);
      const user = (
        await db.query("SELECT * FROM users WHERE email=$1", [p.email])
      ).rows[0];
      if (!user || !verifyPassword(p.password, user.password_hash))
        fail("Email or password is incorrect", 401);
      const m = (
        await db.query(
          "SELECT organization_id FROM memberships WHERE user_id=$1 ORDER BY organization_id LIMIT 1",
          [user.id],
        )
      ).rows[0];
      if (!m) fail("No organization membership", 403);
      const csrf = await session(reply, user.id, m.organization_id);
      await audit(db, m.organization_id, user.id, "session.login");
      return { csrf, userId: user.id, org: m.organization_id };
    },
  );
  app.get("/api/auth/me", async (req) => {
    const user = (
      await db.query("SELECT id,name,email FROM users WHERE id=$1", [
        req.actor.userId,
      ])
    ).rows[0];
    const organizations = (
      await db.query(
        "SELECT o.id,o.name,o.settings,m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.name",
        [req.actor.userId],
      )
    ).rows;
    return {
      ...req.actor,
      user,
      organizations,
      demo: config.DEMO_MODE === "true",
    };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    await db.query("DELETE FROM sessions WHERE id=$1", [req.actor.sessionId]);
    reply.clearCookie("inboxflow_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/switch", async (req) => {
    const { organizationId } = z
      .object({ organizationId: z.string() })
      .parse(req.body);
    if (
      !(
        await db.query(
          "SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2",
          [req.actor.userId, organizationId],
        )
      ).rows.length
    )
      fail("Organization access denied", 403);
    await db.query("UPDATE sessions SET organization_id=$1 WHERE id=$2", [
      organizationId,
      req.actor.sessionId,
    ]);
    return { ok: true };
  });
  app.post("/api/organizations", async (req) => {
    const { name } = z
      .object({ name: z.string().min(1).max(100) })
      .parse(req.body);
    const org = uid();
    await db.transaction(async (tx) => {
      await tx.query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
        org,
        name,
      ]);
      await tx.query("INSERT INTO memberships VALUES($1,$2,$3)", [
        org,
        req.actor.userId,
        "owner",
      ]);
    });
    return { id: org, name };
  });
  app.post("/api/auth/recover", { config: { public: true } }, async (req) => {
    const { email } = z
      .object({ email: z.email().transform((s) => s.toLowerCase()) })
      .parse(req.body);
    const user = (
      await db.query("SELECT id FROM users WHERE email=$1", [email])
    ).rows[0];
    let token: string | undefined;
    if (user) {
      token = secret();
      await db.query("INSERT INTO recovery_tokens VALUES($1,$2,$3,null)", [
        hash(token),
        user.id,
        new Date(Date.now() + 900000),
      ]);
    }
    return {
      message:
        "If an account exists, a recovery link can be requested through your configured mail provider.",
      ...(config.DEMO_MODE === "true" && token ? { sandboxToken: token } : {}),
      delivery:
        config.DEMO_MODE === "true"
          ? "Local sandbox: use the displayed token"
          : "Mail delivery adapter is not configured",
    };
  });
  app.post("/api/auth/reset", { config: { public: true } }, async (req) => {
    const p = z
      .object({ token: z.string(), password: z.string().min(12).max(128) })
      .parse(req.body);
    await db.transaction(async (tx) => {
      const token = (
        await tx.query(
          "SELECT * FROM recovery_tokens WHERE id=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE",
          [hash(p.token)],
        )
      ).rows[0];
      if (!token) fail("Recovery token expired or invalid", 401);
      await tx.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        passwordHash(p.password),
        token.user_id,
      ]);
      await tx.query("UPDATE recovery_tokens SET used_at=now() WHERE id=$1", [
        token.id,
      ]);
      await tx.query("DELETE FROM sessions WHERE user_id=$1", [token.user_id]);
    });
    return { ok: true };
  });
  app.patch("/api/account", async (req) => {
    const p = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
    await db.query("UPDATE users SET name=$1 WHERE id=$2", [
      p.name,
      req.actor.userId,
    ]);
    return { ok: true };
  });
  app.get("/api/team", async (req) => ({
    members: (
      await db.query(
        "SELECT u.id,u.name,u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.organization_id=$1",
        [req.actor.org],
      )
    ).rows,
    invitations: (
      await db.query(
        "SELECT id,email,role,expires_at,accepted_at FROM invitations WHERE organization_id=$1",
        [req.actor.org],
      )
    ).rows,
  }));
  app.post("/api/team/invite", async (req) => {
    permit(req, ["owner", "admin"]);
    const p = z
      .object({
        email: z.email().transform((s) => s.toLowerCase()),
        role: z.enum(["admin", "editor", "analyst", "viewer"]),
      })
      .parse(req.body);
    if (req.actor.role === "admin" && p.role === "admin")
      fail("Only an owner can invite administrators", 403);
    const token = secret(),
      id = uid();
    await db.query(
      "INSERT INTO invitations(id,organization_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [
        id,
        req.actor.org,
        p.email,
        p.role,
        hash(token),
        new Date(Date.now() + 7 * 86400000),
      ],
    );
    await audit(db, req.actor.org, req.actor.userId, "team.invited", id);
    return {
      id,
      inviteUrl: `${config.APP_URL}/invite?token=${token}`,
      delivery: "Copy invitation link; no email was sent",
    };
  });
  app.post("/api/team/accept", async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    await db.transaction(async (tx) => {
      const invitation = (
        await tx.query(
          "SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (!invitation) fail("Invitation is invalid", 401);
      const user = (
        await tx.query("SELECT email FROM users WHERE id=$1", [
          req.actor.userId,
        ])
      ).rows[0];
      if (user.email !== invitation.email)
        fail("Sign in with the invited email address", 403);
      await tx.query(
        "INSERT INTO memberships VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [invitation.organization_id, req.actor.userId, invitation.role],
      );
      await tx.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
        invitation.id,
      ]);
    });
    return { ok: true };
  });
  app.patch("/api/team/:id", async (req) => {
    permit(req, ["owner"]);
    const id = (req.params as any).id;
    const { role } = z
      .object({ role: z.enum(["admin", "editor", "analyst", "viewer"]) })
      .parse(req.body);
    if (id === req.actor.userId)
      fail("Owner cannot remove their own ownership");
    await db.query(
      "UPDATE memberships SET role=$1 WHERE organization_id=$2 AND user_id=$3 AND role<>'owner'",
      [role, req.actor.org, id],
    );
    await audit(db, req.actor.org, req.actor.userId, "team.role_changed", id);
    return { ok: true };
  });
}
