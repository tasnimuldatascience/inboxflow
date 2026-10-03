import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildApp } from "../../apps/api/src/app.ts";
import { Database } from "../../packages/database/src/index.ts";
import { documentSchema, newBlock } from "../../packages/shared/src/index.ts";
import { hash } from "../../packages/shared/src/security.ts";
import type { FastifyInstance } from "fastify";
let app: FastifyInstance,
  db: Database,
  cookie = "",
  csrf = "",
  created = "";
async function call(
  method: string,
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  const r = await app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: { cookie, "x-csrf-token": csrf, ...headers },
  });
  return { status: r.statusCode, body: r.json(), headers: r.headers };
}
async function token(
  scope: string,
  targetId: string,
  recipientId = "profile-1",
) {
  const r = await call("POST", "/api/action-tokens", {
    scope,
    targetId,
    recipientId,
  });
  expect(r.status).toBe(200);
  return r.body;
}
beforeAll(async () => {
  db = new Database(undefined, ":memory:");
  ({ app } = await buildApp({ db }));
  await app.ready();
  const login = await call("POST", "/api/auth/login", {
    email: "owner@inboxflow.local",
    password: "InboxFlowDemo!2026",
  });
  expect(login.status).toBe(200);
  cookie = String(login.headers["set-cookie"]).split(";")[0];
  csrf = login.body.csrf;
});
afterAll(async () => {
  await app.close();
  await db.close();
});
describe("persistent product workflows", () => {
  it("serves health, secure session, catalog and OpenAPI", async () => {
    expect((await call("GET", "/api/health")).body.database).toBe(
      "embedded-postgresql",
    );
    expect((await call("GET", "/api/auth/me")).body.org).toBe("org-meadow");
    expect((await call("GET", "/api/products")).body.length).toBe(24);
    expect((await call("GET", "/api/openapi.json")).body.openapi).toBe("3.0.3");
  });
  it("creates, updates and reloads a structured template with version conflicts", async () => {
    const document = documentSchema.parse({
      name: "Persistence acceptance",
      subject: "Hello",
      blocks: [
        newBlock("hero"),
        { ...newBlock("product"), productIds: ["product-1"] },
        newBlock("footer"),
      ],
    });
    const r = await call("POST", "/api/templates", document);
    expect(r.status).toBe(200);
    created = r.body.id;
    const changed = {
      ...document,
      blocks: document.blocks.map((b) => ({
        ...b,
        style: { ...b.style, background: "#e6eddc" },
      })),
    };
    expect(
      (
        await call("PUT", `/api/templates/${created}`, {
          document: changed,
          revision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("GET", `/api/templates/${created}`)).body.document.blocks[0]
        .style.background,
    ).toBe("#e6eddc");
    expect(
      (
        await call("PUT", `/api/templates/${created}`, {
          document,
          revision: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (await call("GET", `/api/templates/${created}/versions`)).body.length,
    ).toBe(2);
  });
  it("renders all MIME parts with secure personalized fallback links", async () => {
    const r = await call("POST", `/api/templates/${created}/render`, {
      recipientId: "profile-1",
      validate: false,
    });
    expect(r.status).toBe(200);
    expect(r.body.htmlValid).toBe(true);
    expect(r.body.amp).toContain("amp4email");
    expect(r.body.mime).toContain("text/x-amp-html");
    expect(Object.values(r.body.links)[0]).toContain("/experience?token=");
    expect(r.body.html).not.toContain("<script");
  });
  it("syncs sandbox catalog, creates cart and records idempotent confirmed sandbox purchase", async () => {
    expect((await call("POST", "/api/products/sync")).body.count).toBe(24);
    const t = await token("cart", "product-1");
    const input = {
      confirm: true,
      lines: [{ variantId: "variant-1-1", quantity: 2 }],
    };
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(4800);
    expect(r.body.checkoutUrl).toBe(`/checkout/${r.body.id}`);
    const c = await call("POST", `/api/checkout/${r.body.id}/confirm`, {
      token: t.token,
      confirm: true,
    });
    expect(c.status).toBe(200);
    expect(c.body.total).toBe(4800);
    expect(c.body.mode).toBe("sandbox");
    const repeated = await call("POST", `/api/checkout/${r.body.id}/confirm`, {
      token: t.token,
      confirm: true,
    });
    expect(repeated.body.orderId).toBe(c.body.orderId);
    const count = (
      await db.query(
        "SELECT count(*)::int AS n FROM events WHERE event_type='purchase_confirmed' AND demo=true AND metadata->>'cartId'=$1",
        [r.body.id],
      )
    ).rows[0].n;
    expect(count).toBe(1);
  });
  it("validates stock, quantity, selling plans and applies tier discounts", async () => {
    expect(
      (
        await call(
          "POST",
          "/api/carts",
          {
            recipientId: "profile-1",
            lines: [{ variantId: "variant-24-1", quantity: 1 }],
          },
          { "idempotency-key": "out-of-stock" },
        )
      ).status,
    ).toBe(422);
    const p = {
      recipientId: "profile-1",
      lines: [
        { variantId: "variant-2-1", quantity: 4, sellingPlan: "monthly" },
      ],
    };
    const r = await call("POST", "/api/carts", p, {
      "idempotency-key": "cart-discount",
    });
    expect(r.status).toBe(200);
    expect(r.body.data.discount).toBeGreaterThan(0);
    expect(
      (
        await call("POST", "/api/carts", p, {
          "idempotency-key": "cart-discount",
        })
      ).body.id,
    ).toBe(r.body.id);
    expect(
      (
        await call(
          "POST",
          "/api/carts",
          { ...p, lines: [{ variantId: "variant-2-1", quantity: 5 }] },
          { "idempotency-key": "cart-discount" },
        )
      ).status,
    ).toBe(409);
  });
  it("delays subscriptions with intentional confirmation and rejects changed replay", async () => {
    const t = await token("subscription", "subscription-1");
    expect(
      (
        await call(
          "GET",
          `/api/experience?token=${encodeURIComponent(t.token)}`,
        )
      ).status,
    ).toBe(200);
    const before = (
      await call("GET", "/api/records/subscription/subscription-1")
    ).body.data.nextOrder;
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: t.token,
          input: { action: "delay", days: 7 },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("GET", "/api/records/subscription/subscription-1")).body.data
        .nextOrder,
    ).toBe(before);
    const input = { confirm: true, action: "delay", days: 7 };
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input,
    });
    expect(r.status).toBe(200);
    expect(r.body.subscription.data.nextOrder).toBe("2026-10-22");
    expect(
      (await call("POST", "/api/experience/action", { token: t.token, input }))
        .body.subscription.data.nextOrder,
    ).toBe("2026-10-22");
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: t.token,
          input: { ...input, days: 14 },
        })
      ).status,
    ).toBe(409);
  });
  it("reactivates cancelled subscriptions and preserves idempotency", async () => {
    const t = await token("reactivation", "subscription-7", "profile-7");
    const input = { confirm: true };
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input,
    });
    expect(r.body.subscription.status).toBe("active");
    expect(
      (await call("POST", "/api/experience/action", { token: t.token, input }))
        .body.subscription.id,
    ).toBe("subscription-7");
  });
  it("rolls back an unavailable subscription swap", async () => {
    const t = await token("swap", "subscription-1");
    const before = (
      await call("GET", "/api/records/subscription/subscription-1")
    ).body.data;
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: t.token,
          input: { confirm: true, variantId: "missing" },
        })
      ).status,
    ).toBe(422);
    expect(
      (await call("GET", "/api/records/subscription/subscription-1")).body.data,
    ).toEqual(before);
    expect(
      (await call("GET", `/api/experience?token=${t.token}`)).body.used,
    ).toBe(false);
  });
  it("persists branching form response and syncs sandbox profile property", async () => {
    const t = await token("form", "form-ritual");
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: t.token,
          input: { confirm: true, answers: { goal: "Calm" } },
        })
      ).status,
    ).toBe(400);
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input: {
        confirm: true,
        answers: { goal: "Calm", routine: "Tea and a book", rating: 5 },
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.message).toContain("Sleep botanical");
    const profile = (await call("GET", "/api/records/profile/profile-1")).body;
    expect(profile.data.properties.wellness_goal).toBe("Calm");
    const synced = (
      await db.query(
        "SELECT data FROM entities WHERE organization_id='org-meadow' AND id='profile-1-klaviyo'",
      )
    ).rows[0];
    expect(synced.data.properties.evening_routine).toBe("Tea and a book");
    expect(
      (await call("GET", "/api/forms/form-ritual/responses")).body.length,
    ).toBe(1);
  });
  it("records review provider receipt and prevents duplicate recipient reviews", async () => {
    const t = await token("review", "product-1");
    const input = {
      confirm: true,
      rating: 5,
      title: "A new favorite",
      body: "A thoughtful everyday ritual.",
    };
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input,
    });
    expect(r.status).toBe(200);
    expect(
      (await call("GET", "/api/records/provider-review")).body.some(
        (receipt: any) =>
          receipt.data.payload.body === "A thoughtful everyday ritual.",
      ),
    ).toBe(true);
    const duplicate = await token("review", "product-1");
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: duplicate.token,
          input,
        })
      ).status,
    ).toBe(409);
  });
  it("requires SMS consent, stores evidence and keeps subscription pending until callback", async () => {
    const t = await token("sms", "profile-1");
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: t.token,
          input: { confirm: true, phone: "+12025550123" },
        })
      ).status,
    ).toBe(400);
    const r = await call("POST", "/api/experience/action", {
      token: t.token,
      input: { confirm: true, consent: true, phone: "+12025550123" },
    });
    expect(r.body.status).toBe("pending");
    const consent = (await call("GET", "/api/consent")).body.find(
      (c: any) => c.id === r.body.consentId,
    );
    expect(consent.evidence.intentional).toBe(true);
    expect(
      (await call("POST", `/api/sms/${r.body.consentId}/confirm`)).body.status,
    ).toBe("confirmed");
  });
  it("imports and exports Klaviyo drafts with persisted MIME and provider version conflict detection", async () => {
    const imported = await call(
      "POST",
      "/api/klaviyo/import/provider-template-1",
    );
    expect(imported.status).toBe(200);
    const r = await call(
      "POST",
      `/api/klaviyo/export/${imported.body.id}`,
      {},
      { "idempotency-key": "export-1" },
    );
    expect(r.status).toBe(200);
    const stored = (
      await call("GET", `/api/records/email-export/${r.body.exportId}`)
    ).body;
    expect(stored.data.mime).toContain("text/plain");
    expect(stored.data.amp).toContain("amp4email");
    expect(
      (
        await call(
          "POST",
          `/api/klaviyo/export/${imported.body.id}`,
          { providerId: r.body.providerId, expectedVersion: 0 },
          { "idempotency-key": "export-conflict" },
        )
      ).status,
    ).toBe(409);
  });
  it("records stable experiment assignments, exposures and conversion intervals", async () => {
    const p = { recipientId: "profile-1" };
    const a = await call(
      "POST",
      "/api/experiments/experiment-delivery/assign",
      p,
    );
    expect(
      (await call("POST", "/api/experiments/experiment-delivery/assign", p))
        .body.cohort,
    ).toBe(a.body.cohort);
    expect(
      (await call("POST", "/api/experiments/experiment-delivery/convert", p))
        .status,
    ).toBe(200);
    const result = (
      await call("GET", "/api/experiments/experiment-delivery/results")
    ).body;
    expect(result.cohorts.reduce((s: number, c: any) => s + c.sample, 0)).toBe(
      201,
    );
    expect(result.cohorts[0].high).toBeLessThan(1);
  });
  it("Refine returns typed operations and leaves persisted template unchanged until explicitly saved", async () => {
    const original = (await call("GET", `/api/templates/${created}`)).body;
    const r = await call("POST", `/api/templates/${created}/refine`, {
      command: "headline: A new beginning",
    });
    expect(r.body.operations[0].op).toBe("update");
    expect(
      (await call("GET", `/api/templates/${created}`)).body.document,
    ).toEqual(original.document);
  });
  it("analytics totals match database and assistant has read-only allowlisted queries", async () => {
    const data = (await call("GET", "/api/analytics")).body;
    const actual = (
      await db.query(
        "SELECT COALESCE(sum(revenue),0)::int AS total FROM events WHERE organization_id='org-meadow' AND event_type='purchase_confirmed'",
      )
    ).rows[0].total;
    expect(data.revenue).toBe(actual);
    expect(data.demo).toBe(true);
    const a = await call("POST", "/api/analytics/ask", {
      question: "What is our revenue?",
    });
    expect(a.body.value).toBe(actual);
    expect(a.body.mode).toContain("Rule-based");
  });
  it("simulates workflows and suppresses recipients without marketing consent", async () => {
    const flow = (await call("GET", "/api/records/flow")).body[0];
    expect(
      (
        await call("POST", `/api/flows/${flow.id}/simulate`, {
          recipientId: "profile-1",
        })
      ).body.data.eligible,
    ).toBe(true);
    const t = await token("unsubscribe", "profile-1");
    expect((await call("GET", `/api/experience?token=${t.token}`)).status).toBe(
      200,
    );
    expect(
      (await call("GET", "/api/records/profile/profile-1")).body.data
        .suppressed,
    ).toBe(false);
    await call("POST", "/api/experience/action", {
      token: t.token,
      input: { confirm: true },
    });
    expect(
      (
        await call("POST", `/api/flows/${flow.id}/simulate`, {
          recipientId: "profile-1",
        })
      ).body.data.eligible,
    ).toBe(false);
  });
});
describe("authentication, tenancy and recipient security", () => {
  it("rejects expired, revoked, forged and mis-scoped tokens", async () => {
    const t = await token("cart", "product-1");
    await db.query(
      "UPDATE action_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",
      [t.id],
    );
    expect((await call("GET", `/api/experience?token=${t.token}`)).status).toBe(
      401,
    );
    const r = await token("cart", "product-1");
    await call("DELETE", `/api/action-tokens/${r.id}`);
    expect((await call("GET", `/api/experience?token=${r.token}`)).status).toBe(
      401,
    );
    expect((await call("GET", "/api/experience?token=forged.bad")).status).toBe(
      401,
    );
    expect(
      (
        await call("POST", "/api/action-tokens", {
          recipientId: "profile-2",
          scope: "subscription",
          targetId: "subscription-1",
        })
      ).status,
    ).toBe(403);
  });
  it("denies cross-tenant templates, forms, subscriptions and renders", async () => {
    await call("POST", "/api/auth/switch", { organizationId: "org-studio" });
    expect((await call("GET", `/api/templates/${created}`)).status).toBe(404);
    expect((await call("GET", "/api/records/form/form-ritual")).status).toBe(
      404,
    );
    expect(
      (await call("GET", "/api/records/subscription/subscription-1")).status,
    ).toBe(404);
    expect(
      (await call("POST", `/api/templates/${created}/render`, {})).status,
    ).toBe(404);
    expect((await call("GET", "/api/analytics")).body.revenue).toBe(0);
    await call("POST", "/api/auth/switch", { organizationId: "org-meadow" });
  });
  it("rejects missing CSRF, foreign origins and unauthenticated tenant access", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/api/templates" })).statusCode,
    ).toBe(401);
    expect(
      (await call("POST", "/api/products/sync", {}, { "x-csrf-token": "" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call(
          "POST",
          "/api/products/sync",
          {},
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
  });
  it("restricts viewer writes and editor administration", async () => {
    const ownerCookie = cookie,
      ownerCsrf = csrf;
    for (const [email, path] of [
      ["viewer@inboxflow.local", "/api/products/sync"],
      ["editor@inboxflow.local", "/api/team/invite"],
    ]) {
      const r = await call("POST", "/api/auth/login", {
        email,
        password: "InboxFlowDemo!2026",
      });
      cookie = String(r.headers["set-cookie"]).split(";")[0];
      csrf = r.body.csrf;
      expect(
        (
          await call("POST", path, {
            email: "other@example.test",
            role: "viewer",
          })
        ).status,
      ).toBe(403);
    }
    cookie = ownerCookie;
    csrf = ownerCsrf;
  });
  it("validates AMP sender and both CORS conventions without cookies", async () => {
    const t = await token("cart", "product-1");
    expect(
      (
        await call("GET", `/api/amp/data?token=${t.token}`, undefined, {
          "amp-email-sender": "attacker@example.test",
        })
      ).status,
    ).toBe(403);
    const r = await call("GET", `/api/amp/data?token=${t.token}`, undefined, {
      "amp-email-sender": "demo@inboxflow.example",
      cookie: "",
    });
    expect(r.status).toBe(200);
    expect(r.headers["amp-email-allow-sender"]).toBe("demo@inboxflow.example");
    const v1 = await call(
      "GET",
      `/api/amp/data?token=${t.token}&__amp_source_origin=demo%40inboxflow.example`,
      undefined,
      { origin: "https://mail.google.com", cookie: "" },
    );
    expect(v1.status).toBe(200);
    expect(v1.headers["amp-access-control-allow-source-origin"]).toBe(
      "demo@inboxflow.example",
    );
  });
  it("issues revocable read-only tenant API keys without leaking hashes in listing", async () => {
    const r = await call("POST", "/api/credentials", { name: "QA key" });
    expect(r.body.key).toMatch(/^if_/);
    const metrics = await call("GET", "/api/v1/metrics", undefined, {
      authorization: `Bearer ${r.body.key}`,
      cookie: "",
    });
    expect(metrics.status).toBe(200);
    expect(
      (await call("GET", "/api/credentials")).body[0].data,
    ).toBeUndefined();
    await call("DELETE", `/api/credentials/${r.body.id}`);
    expect(
      (
        await call("GET", "/api/v1/metrics", undefined, {
          authorization: `Bearer ${r.body.key}`,
          cookie: "",
        })
      ).status,
    ).toBe(401);
  });
  it("registers a new tenant and provides local recovery with one-use tokens", async () => {
    const ownerCookie = cookie,
      ownerCsrf = csrf;
    const r = await call("POST", "/api/auth/register", {
      email: "new@example.test",
      name: "New user",
      organization: "New workspace",
      password: "GoodPassword123!",
    });
    expect(r.status).toBe(200);
    cookie = String(r.headers["set-cookie"]).split(";")[0];
    csrf = r.body.csrf;
    expect((await call("GET", "/api/templates")).body).toEqual([]);
    const recover = await call("POST", "/api/auth/recover", {
      email: "new@example.test",
    });
    expect(recover.body.sandboxToken).toBeTruthy();
    expect(
      (
        await call("POST", "/api/auth/reset", {
          token: recover.body.sandboxToken,
          password: "AnotherPassword123!",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("POST", "/api/auth/reset", {
          token: recover.body.sandboxToken,
          password: "AnotherPassword123!",
        })
      ).status,
    ).toBe(401);
    expect((await call("GET", "/api/auth/me")).status).toBe(401);
    cookie = ownerCookie;
    csrf = ownerCsrf;
  });
  it("deletes profile-associated data within the current organization", async () => {
    const id = "profile-12";
    expect((await call("DELETE", `/api/privacy/profile/${id}`)).status).toBe(
      200,
    );
    expect((await call("GET", `/api/records/profile/${id}`)).status).toBe(404);
    expect(
      (
        await db.query(
          "SELECT * FROM events WHERE organization_id=$1 AND recipient_id=$2",
          ["org-meadow", hash(id)],
        )
      ).rows.length,
    ).toBe(0);
  });
});
