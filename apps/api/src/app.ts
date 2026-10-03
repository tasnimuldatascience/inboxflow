import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import formbody from "@fastify/formbody";
import { z } from "zod";
import {
  Database,
  entity,
  putEntity,
  uid,
  type Row,
} from "../../../packages/database/src/index.ts";
import { seed } from "../../../packages/database/src/seed.ts";
import { sandboxCatalog } from "../../../packages/database/src/fixtures.ts";
import { retention } from "../../../packages/database/src/maintenance.ts";
import { replaceCatalog } from "../../../packages/integrations/src/catalog.ts";
import { config } from "../../../packages/configuration/src/index.ts";
import {
  documentSchema,
  blockSchema,
  formSchema,
  newBlock,
  applyOperations,
  operationSchema,
  type Product,
} from "../../../packages/shared/src/index.ts";
import {
  hash,
  secret,
  encrypt,
  decrypt,
} from "../../../packages/shared/src/security.ts";
import {
  render,
  mime,
  interactiveTypes,
  type RenderContext,
} from "../../../packages/email-engine/src/index.ts";
import { validateAmp } from "../../../packages/email-engine/src/validation.ts";
import {
  metrics,
  analyticsAnswer,
  assign,
  wilson,
} from "../../../packages/analytics/src/index.ts";
import {
  SandboxShopify,
  SandboxKlaviyo,
  ShopifyProvider,
  KlaviyoProvider,
  recommendations,
} from "../../../packages/integrations/src/index.ts";
import { DeterministicRefine } from "../../../packages/interactive-blocks/src/refine.ts";
import { authentication, permit } from "./auth.ts";
import { productionModules } from "./production.ts";
import {
  templateQuota,
  publishingAllowed,
  planLimits,
} from "./entitlements.ts";
import {
  audit,
  fail,
  mintToken,
  readToken,
  executeToken,
  idempotent,
  cart,
  event,
  submitForm,
} from "./services.ts";

const genericSchemas: Record<string, z.ZodType> = {
  form: formSchema,
  campaign: z.object({
    templateId: z.string(),
    trigger: z.string().min(1),
    eligible: z.object({ consent: z.boolean() }).default({ consent: true }),
    sends: z.number().int().min(0).default(0),
  }),
  flow: z.object({
    trigger: z.string().min(1),
    templateId: z.string(),
    eligibility: z
      .object({
        consent: z.boolean(),
        status: z.string(),
        properties: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      })
      .default({ consent: true, status: "active" }),
    providerFlowId: z.string().optional(),
  }),
  feed: z.object({
    strategy: z.enum([
      "manual",
      "best-sellers",
      "collection",
      "previous",
      "related",
      "abandoned",
      "viewed",
      "rules",
    ]),
    ids: z.array(z.string()).default([]),
    category: z.string().optional(),
    exclude: z.array(z.string()).default([]),
    limit: z.number().int().min(1).max(24).default(6),
  }),
  experiment: z.object({
    templateId: z.string(),
    metric: z.enum([
      "purchase_confirmed",
      "subscription_reactivated",
      "form_submitted",
    ]),
    salt: z.string().min(1).default("inboxflow"),
  }),
  report: z.object({
    metric: z.enum([
      "interactions",
      "revenue",
      "subscription_reactivated",
      "conversions",
    ]),
    description: z.string().max(500).default(""),
  }),
  theme: z.object({
    accent: z.string().regex(/^#[a-f\d]{6}$/i),
    background: z.string().regex(/^#[a-f\d]{6}$/i),
    width: z.number().int().min(320).max(800),
  }),
  "saved-block": blockSchema,
};
export async function buildApp(
  options: { db?: Database; seed?: boolean; logger?: boolean } = {},
) {
  const db = options.db || new Database();
  await db.migrate();
  if (options.seed !== false && config.DEMO_MODE === "true") await seed(db);
  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers.x-csrf-token",
          ],
          serializers: {
            req: (r: any) => ({
              method: r.method,
              url: r.url?.split("?")[0],
              id: r.id,
            }),
          },
        }
      : false,
    bodyLimit: 3 * 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: [
      config.APP_URL,
      "https://mail.google.com",
      "https://mail.yahoo.com",
    ],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token",
      "Idempotency-Key",
      "AMP-Email-Sender",
    ],
    exposedHeaders: [
      "AMP-Email-Allow-Sender",
      "AMP-Access-Control-Allow-Source-Origin",
    ],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (req) =>
      req.cookies.inboxflow_session
        ? hash(req.cookies.inboxflow_session)
        : req.ip,
  });
  await app.register(formbody);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "InboxFlow API",
        version: "0.1.0",
        description:
          "Session authentication and X-CSRF-Token are required for tenant mutations. Recipient routes use scoped signed tokens. Sandbox providers never send or charge.",
      },
      components: {
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "inboxflow_session" },
        },
      },
      security: [{ session: [] }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: { docExpansion: "list" },
  });
  app.setErrorHandler((err, req, reply) => {
    const e = err as any;
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        error: "Validation failed",
        details: e.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`),
      });
    const status = e.statusCode || 400;
    if (status >= 500) req.log.error({ err: e }, "request failed");
    reply.code(status).send({
      error:
        status >= 500
          ? "The service could not complete this request"
          : e.message,
    });
  });
  await authentication(app, db);
  app.get(
    "/api/health",
    { config: { public: true }, schema: { summary: "Database health" } },
    async () => {
      await db.query("SELECT 1");
      return {
        status: "ok",
        database: config.DATABASE_URL ? "postgresql" : "embedded-postgresql",
        demo: config.DEMO_MODE === "true",
      };
    },
  );
  app.get("/api/openapi.json", { config: { public: true } }, async () =>
    app.swagger(),
  );
  app.post("/api/contact", { config: { public: true } }, async (req) => {
    const p = z
      .object({
        email: z.email(),
        name: z.string().min(1).max(100),
        message: z.string().min(1).max(2000),
      })
      .parse(req.body);
    if (config.DEMO_MODE !== "true")
      fail("Contact delivery is not configured", 503);
    const org = (
      await db.query("SELECT id FROM organizations ORDER BY id LIMIT 1")
    ).rows[0]?.id;
    if (!org) fail("Contact service unavailable", 503);
    await putEntity(db, org, "contact", p.name, p);
    return {
      message:
        "Your request has been saved locally. No external message was sent.",
    };
  });
  app.get(
    "/api/templates",
    async (req) =>
      (
        await db.query(
          "SELECT * FROM templates WHERE organization_id=$1 ORDER BY updated_at DESC",
          [req.actor.org],
        )
      ).rows,
  );
  app.post("/api/templates", async (req) => {
    permit(req);
    const document = documentSchema.parse(req.body);
    const id = uid();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO templates(organization_id,id,name,document) VALUES($1,$2,$3,$4)",
        [req.actor.org, id, document.name, JSON.stringify(document)],
      );
      await tx.query("INSERT INTO template_versions VALUES($1,$2,1,$3,now())", [
        req.actor.org,
        id,
        JSON.stringify(document),
      ]);
      await audit(tx, req.actor.org, req.actor.userId, "template.created", id);
    });
    return { id, revision: 1, document };
  });
  async function template(org: string, id: string) {
    const row = (
      await db.query(
        "SELECT * FROM templates WHERE organization_id=$1 AND id=$2",
        [org, id],
      )
    ).rows[0];
    if (!row) fail("Template not found", 404);
    return row;
  }
  app.get("/api/templates/:id", async (req) =>
    template(req.actor.org, (req.params as any).id),
  );
  app.put("/api/templates/:id", async (req) => {
    permit(req);
    const id = (req.params as any).id;
    const p = z
      .object({
        document: documentSchema,
        revision: z.number().int().min(1),
        status: z.enum(["draft", "published"]).default("draft"),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      if (p.status === "published")
        await publishingAllowed(tx, req.actor.org, id);
      const row = (
        await tx.query(
          "UPDATE templates SET document=$3,name=$4,revision=revision+1,status=$5,updated_at=now() WHERE organization_id=$1 AND id=$2 AND revision=$6 RETURNING *",
          [
            req.actor.org,
            id,
            JSON.stringify(p.document),
            p.document.name,
            p.status,
            p.revision,
          ],
        )
      ).rows[0];
      if (!row) {
        await template(req.actor.org, id);
        fail("Template changed in another session. Reload before saving.", 409);
      }
      await tx.query(
        "INSERT INTO template_versions VALUES($1,$2,$3,$4,now())",
        [req.actor.org, id, row.revision, JSON.stringify(p.document)],
      );
      await audit(tx, req.actor.org, req.actor.userId, "template.saved", id);
      return row;
    });
  });
  app.get("/api/templates/:id/versions", async (req) => {
    await template(req.actor.org, (req.params as any).id);
    return (
      await db.query(
        "SELECT * FROM template_versions WHERE organization_id=$1 AND template_id=$2 ORDER BY revision DESC",
        [req.actor.org, (req.params as any).id],
      )
    ).rows;
  });
  app.delete("/api/templates/:id", async (req) => {
    permit(req);
    const id = (req.params as any).id;
    await template(req.actor.org, id);
    await db.query("DELETE FROM templates WHERE organization_id=$1 AND id=$2", [
      req.actor.org,
      id,
    ]);
    await audit(db, req.actor.org, req.actor.userId, "template.deleted", id);
    return { ok: true };
  });
  async function context(
    org: string,
    doc: Row,
    recipient?: string,
    createLinks = false,
    templateId?: string,
  ) {
    const products = await new SandboxShopify(db, org).listProducts();
    const forms = Object.fromEntries(
      (
        await db.query(
          "SELECT id,data FROM entities WHERE organization_id=$1 AND kind='form'",
          [org],
        )
      ).rows.map((r) => [r.id, r.data]),
    );
    const c: RenderContext = {
      baseUrl: config.APP_URL,
      apiUrl: config.PUBLIC_API_URL,
      products,
      forms,
      links: {},
      tokens: {},
    };
    if (recipient) {
      await entity(db, org, "profile", recipient);
      const subs = (
        await db.query(
          "SELECT * FROM entities WHERE organization_id=$1 AND kind='subscription' AND data->>'recipientId'=$2",
          [org, recipient],
        )
      ).rows;
      c.subscriber = subs.some((s) => s.status === "active");
      if (createLinks) {
        const messageId = uid();
        const unsub = await mintToken(
          db,
          org,
          recipient,
          "unsubscribe",
          recipient,
        );
        c.unsubscribeUrl = unsub.url;
        for (const b of doc.blocks) {
          if (!interactiveTypes.has(b.type)) continue;
          let scope = "engagement",
            target = b.id;
          if (
            ["product", "product-grid", "product-carousel", "cart"].includes(
              b.type,
            )
          )
            scope = "cart";
          if (["subscription", "reactivation", "swap"].includes(b.type)) {
            scope = b.type;
            target = (
              b.type === "reactivation"
                ? subs.find((s) => s.status === "cancelled")
                : subs.find((s) => s.status === "active")
            )?.id;
            if (!target) continue;
          }
          if (["form", "quiz"].includes(b.type)) {
            scope = "form";
            target = b.formId;
            if (!forms[target]) continue;
          }
          if (b.type === "review") {
            scope = "review";
            target = b.productIds[0] || products[0]?.id;
            if (!target) continue;
          }
          if (b.type === "sms") {
            scope = "sms";
            target = recipient;
          }
          const t = await mintToken(db, org, recipient, scope, target, 30, {
            templateId,
            messageId,
            blockId: b.id,
          });
          c.links[b.id] = t.url;
          c.tokens[b.id] = t.token;
        }
      }
    }
    return c;
  }
  app.post("/api/templates/:id/render", async (req) => {
    permit(req);
    const t = await template(req.actor.org, (req.params as any).id);
    const p = z
      .object({
        recipientId: z.string().optional(),
        validate: z.boolean().default(true),
      })
      .parse(req.body || {});
    const c = await context(
      req.actor.org,
      t.document,
      p.recipientId,
      !!p.recipientId,
      t.id,
    );
    const parts = render(t.document, c);
    const ampValidation = p.validate
      ? await validateAmp(parts.amp)
      : { status: "UNVERIFIED", errors: [] };
    const profile = p.recipientId
      ? await entity(db, req.actor.org, "profile", p.recipientId)
      : undefined;
    const eml = mime(
      t.document.subject,
      config.EMAIL_SENDER,
      profile?.data.email || "preview@example.test",
      parts,
    );
    const exported = await putEntity(
      db,
      req.actor.org,
      "email-export",
      t.name,
      {
        templateId: t.id,
        revision: t.revision,
        ...parts,
        ampValidation,
        mime: eml,
        links: c.links,
      },
      undefined,
      "preview",
    );
    return {
      ...parts,
      ampValidation,
      mime: eml,
      links: c.links,
      exportId: exported.id,
    };
  });
  app.post("/api/templates/:id/refine", async (req) => {
    permit(req);
    const p = z
      .object({
        command: z.string().min(1).max(1000),
        selected: z.string().optional(),
        document: documentSchema.optional(),
      })
      .parse(req.body);
    const t = await template(req.actor.org, (req.params as any).id);
    const proposal = await new DeterministicRefine().suggest(
      p.command,
      p.document || t.document,
      p.selected,
    );
    await putEntity(db, req.actor.org, "ai-operation", p.command, {
      templateId: t.id,
      ...proposal,
    });
    return proposal;
  });
  app.post("/api/templates/:id/operations", async (req) => {
    permit(req);
    const p = z
      .object({ operations: z.array(operationSchema).max(100) })
      .parse(req.body);
    const t = await template(req.actor.org, (req.params as any).id);
    return {
      document: applyOperations(t.document, p.operations),
      baseRevision: t.revision,
    };
  });
  app.get("/api/products", async (req) =>
    new SandboxShopify(db, req.actor.org).listProducts(),
  );
  app.get("/api/products/:id", async (req) => {
    const row = (
      await db.query(
        "SELECT data FROM products WHERE organization_id=$1 AND id=$2",
        [req.actor.org, (req.params as any).id],
      )
    ).rows[0];
    if (!row) fail("Product not found", 404);
    return row.data;
  });
  app.post("/api/products/sync", async (req) => {
    permit(req);
    const provider = new SandboxShopify(db, req.actor.org);
    const conn = (
      await db.query(
        "SELECT * FROM connections WHERE organization_id=$1 AND provider='shopify' AND status='connected'",
        [req.actor.org],
      )
    ).rows[0];
    if (conn?.mode === "live") {
      const live = await new ShopifyProvider(
        conn.metadata.shop,
        decrypt(conn.credential, config.CREDENTIAL_KEY),
      ).listProducts();
      await db.transaction(async (tx) => {
        await replaceCatalog(tx, req.actor.org, live);
      });
      await audit(
        db,
        req.actor.org,
        req.actor.userId,
        "products.live_read_sync",
      );
      return { count: live.length, mode: "live-read" };
    }
    const products = await provider.listProducts();
    if (!products.length && config.DEMO_MODE === "true") {
      // Import the sandbox catalog through the same product contract for a new tenant.
      const source = sandboxCatalog();
      await db.transaction(async (tx) => {
        for (const p of source) {
          await tx.query(
            "INSERT INTO products(organization_id,id,provider_id,title,data) VALUES($1,$2,$2,$3,$4) ON CONFLICT DO NOTHING",
            [req.actor.org, p.id, p.title, JSON.stringify(p)],
          );
          for (const v of p.variants)
            await tx.query(
              "INSERT INTO variants VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
              [req.actor.org, v.id, p.id, v.title, v.price, v.inventory],
            );
        }
        await putEntity(
          tx,
          req.actor.org,
          "profile",
          "Sandbox customer",
          {
            email: "customer@example.test",
            properties: {},
            pseudonym: hash("profile-1"),
            suppressed: false,
            consent: true,
            mode: "sandbox",
          },
          "profile-1",
          "active",
        );
      });
    }
    await db.query(
      "UPDATE products SET synced_at=now() WHERE organization_id=$1",
      [req.actor.org],
    );
    await audit(db, req.actor.org, req.actor.userId, "products.synced");
    return { count: (await provider.listProducts()).length, mode: "sandbox" };
  });
  const publicKinds = new Set([
    "form",
    "campaign",
    "flow",
    "feed",
    "experiment",
    "report",
    "theme",
    "saved-block",
    "subscription",
    "profile",
    "review",
    "billing",
    "provider-template",
    "email-export",
    "execution",
    "ai-operation",
    "provider-review",
    "provider-sms",
  ]);
  app.get("/api/records/:kind", async (req) => {
    const kind = (req.params as any).kind;
    if (!publicKinds.has(kind)) fail("Unknown record type", 404);
    return (
      await db.query(
        "SELECT * FROM entities WHERE organization_id=$1 AND kind=$2 ORDER BY updated_at DESC",
        [req.actor.org, kind],
      )
    ).rows;
  });
  app.get("/api/records/:kind/:id", async (req) => {
    const { kind, id } = req.params as any;
    if (!publicKinds.has(kind)) fail("Unknown record type", 404);
    return entity(db, req.actor.org, kind, id);
  });
  app.post("/api/records/:kind", async (req) => {
    permit(req);
    const kind = (req.params as any).kind;
    const schema = genericSchemas[kind];
    if (!schema) fail("This record type cannot be created", 403);
    const p = z
      .object({
        name: z.string().min(1).max(120),
        data: z.unknown(),
        status: z.enum(["draft", "active", "published"]).default("draft"),
      })
      .parse(req.body);
    const data = schema.parse(p.data) as any;
    if (["campaign", "flow", "experiment"].includes(kind))
      await template(req.actor.org, data.templateId);
    const row = await putEntity(
      db,
      req.actor.org,
      kind,
      p.name,
      data,
      undefined,
      p.status,
    );
    await audit(db, req.actor.org, req.actor.userId, kind + ".created", row.id);
    return row;
  });
  app.put("/api/records/:kind/:id", async (req) => {
    permit(req);
    const { kind, id } = req.params as any;
    const schema = genericSchemas[kind];
    if (!schema) fail("This record type cannot be edited", 403);
    const p = z
      .object({
        name: z.string().min(1).max(120),
        data: z.unknown(),
        revision: z.number().int(),
        status: z.enum(["draft", "active", "published"]).default("draft"),
      })
      .parse(req.body);
    const data = schema.parse(p.data) as any;
    if (["campaign", "flow", "experiment"].includes(kind))
      await template(req.actor.org, data.templateId);
    return db.transaction(async (tx) => {
      await tx.query(
        "SELECT id FROM entities WHERE organization_id=$1 AND id=$2 FOR UPDATE",
        [req.actor.org, id],
      );
      const locked = await entity(tx, req.actor.org, kind, id);
      if (locked.revision !== p.revision)
        fail("Record changed. Reload before editing.", 409);
      return putEntity(tx, req.actor.org, kind, p.name, data, id, p.status);
    });
  });
  app.delete("/api/records/:kind/:id", async (req) => {
    permit(req);
    const { kind, id } = req.params as any;
    if (!genericSchemas[kind]) fail("This record type cannot be deleted", 403);
    await entity(db, req.actor.org, kind, id);
    await db.query("DELETE FROM entities WHERE organization_id=$1 AND id=$2", [
      req.actor.org,
      id,
    ]);
    return { ok: true };
  });
  app.post("/api/feeds/:id/preview", async (req) => {
    const f = await entity(db, req.actor.org, "feed", (req.params as any).id);
    return recommendations(
      await new SandboxShopify(db, req.actor.org).listProducts(),
      f.data.strategy,
      f.data,
    );
  });
  app.get(
    "/api/integrations",
    async (req) =>
      (
        await db.query(
          "SELECT provider,mode,status,metadata,updated_at FROM connections WHERE organization_id=$1",
          [req.actor.org],
        )
      ).rows,
  );
  app.post("/api/integrations/:provider/connect", async (req) => {
    permit(req, ["owner", "admin"]);
    const provider = (req.params as any).provider;
    if (
      !["shopify", "klaviyo", "recharge", "reviews", "sms", "billing"].includes(
        provider,
      )
    )
      fail("Unsupported provider");
    const p = z
      .object({
        mode: z.enum(["sandbox", "live"]).default("sandbox"),
        credential: z.string().max(5000).optional(),
        shop: z.string().optional(),
      })
      .parse(req.body || {});
    if (p.mode === "live") {
      if (!p.credential) fail("Provider credential is required");
      if (!["shopify", "klaviyo", "recharge"].includes(provider))
        fail("Live adapter is not configured for this provider", 422);
      if (provider === "shopify")
        await new ShopifyProvider(p.shop || "", p.credential).listProducts();
      if (provider === "klaviyo")
        await new KlaviyoProvider(p.credential).listTemplates();
      if (provider === "recharge")
        fail(
          "Recharge live connection requires store-specific capability review; credential not saved",
          422,
        );
    }
    await db.query(
      "INSERT INTO connections VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(organization_id,provider) DO UPDATE SET mode=$3,status=$4,credential=$5,metadata=$6,updated_at=now()",
      [
        req.actor.org,
        provider,
        p.mode,
        "connected",
        p.credential ? encrypt(p.credential, config.CREDENTIAL_KEY) : null,
        JSON.stringify({
          label:
            p.mode === "sandbox" ? "Local sandbox" : "Verified read access",
          shop: p.shop,
        }),
      ],
    );
    await audit(
      db,
      req.actor.org,
      req.actor.userId,
      "integration.connected",
      provider,
    );
    return { provider, mode: p.mode, status: "connected" };
  });
  app.delete("/api/integrations/:provider", async (req) => {
    permit(req, ["owner", "admin"]);
    await db.query(
      "UPDATE connections SET status='disconnected',credential=null WHERE organization_id=$1 AND provider=$2",
      [req.actor.org, (req.params as any).provider],
    );
    await audit(
      db,
      req.actor.org,
      req.actor.userId,
      "integration.disconnected",
      (req.params as any).provider,
    );
    return { ok: true };
  });
  app.get("/api/klaviyo/templates", async (req) => {
    const conn = (
      await db.query(
        "SELECT * FROM connections WHERE organization_id=$1 AND provider='klaviyo' AND status='connected'",
        [req.actor.org],
      )
    ).rows[0];
    if (conn?.mode !== "live")
      return new SandboxKlaviyo(db, req.actor.org).listTemplates();
    const rows = await new KlaviyoProvider(
      decrypt(conn.credential, config.CREDENTIAL_KEY),
    ).listTemplates();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.attributes.name,
      revision: 1,
      mode: "live-read",
      data: { html: r.attributes.html || "" },
    }));
  });
  app.post("/api/klaviyo/import/:id", async (req) => {
    permit(req);
    let provider;
    const conn = (
      await db.query(
        "SELECT * FROM connections WHERE organization_id=$1 AND provider='klaviyo' AND status='connected'",
        [req.actor.org],
      )
    ).rows[0];
    if (conn?.mode === "live") {
      const rows = await new KlaviyoProvider(
        decrypt(conn.credential, config.CREDENTIAL_KEY),
      ).listTemplates();
      const found = rows.find((r: any) => r.id === (req.params as any).id);
      if (!found) fail("Provider template not found", 404);
      provider = {
        name: found.attributes.name,
        data: { html: found.attributes.html || "" },
      };
    } else
      provider = await entity(
        db,
        req.actor.org,
        "provider-template",
        (req.params as any).id,
      );
    const text = provider.data.html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const document = documentSchema.parse({
      name: provider.name + " · interactive",
      subject: provider.name,
      blocks: [
        { ...newBlock("heading"), content: text.slice(0, 200) },
        newBlock("product"),
        newBlock("footer"),
      ],
    });
    const id = uid();
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO templates(organization_id,id,name,document) VALUES($1,$2,$3,$4)",
        [req.actor.org, id, document.name, JSON.stringify(document)],
      );
      await tx.query("INSERT INTO template_versions VALUES($1,$2,1,$3,now())", [
        req.actor.org,
        id,
        JSON.stringify(document),
      ]);
    });
    return {
      id,
      revision: 1,
      document,
      importMode:
        "Sanitized text import; proprietary builder layouts are not reconstructed",
    };
  });
  app.post("/api/klaviyo/export/:id", async (req) => {
    permit(req);
    const conn = (
      await db.query(
        "SELECT mode FROM connections WHERE organization_id=$1 AND provider='klaviyo' AND status='connected'",
        [req.actor.org],
      )
    ).rows[0];
    if (conn?.mode === "live")
      fail(
        "Live connection is read-only. Download HTML/MIME or reconnect the sandbox to export a local draft.",
        422,
      );
    const p = z
      .object({
        providerId: z.string().optional(),
        expectedVersion: z.number().optional(),
      })
      .parse(req.body || {});
    const t = await template(req.actor.org, (req.params as any).id);
    return idempotent(
      db,
      req.actor.org,
      String(req.headers["idempotency-key"] || ""),
      { template: t.id, revision: t.revision, ...p },
      async (tx) => {
        const parts = render(
          t.document,
          await context(req.actor.org, t.document),
        );
        const provider = await new SandboxKlaviyo(
          tx,
          req.actor.org,
        ).exportDraft(t.name, parts.html, p.expectedVersion, p.providerId);
        const output = await putEntity(
          tx,
          req.actor.org,
          "email-export",
          t.name,
          {
            templateId: t.id,
            revision: t.revision,
            providerId: provider.id,
            providerVersion: provider.revision,
            ...parts,
            mime: mime(
              t.document.subject,
              config.EMAIL_SENDER,
              "draft@example.test",
              parts,
            ),
          },
          undefined,
          "draft",
        );
        await audit(
          tx,
          req.actor.org,
          req.actor.userId,
          "klaviyo.draft_exported",
          t.id,
        );
        return {
          providerId: provider.id,
          providerVersion: provider.revision,
          exportId: output.id,
          status: "draft",
          mode: "sandbox",
          ampDelivery:
            "MIME stored locally; live Klaviyo AMP account enablement must be confirmed separately",
        };
      },
    );
  });
  app.get("/api/analytics", async (req) => metrics(db, req.actor.org));
  app.get("/api/analytics.csv", async (req, reply) => {
    const data = await metrics(db, req.actor.org);
    const csv = [
      "date,interactions,revenue_cents",
      ...data.series.map((s) => `${s.date},${s.interactions},${s.revenue}`),
    ].join("\r\n");
    return reply
      .header(
        "Content-Disposition",
        'attachment; filename="inboxflow-analytics.csv"',
      )
      .type("text/csv")
      .send(csv);
  });
  app.post("/api/analytics/ask", async (req) => {
    const { question } = z
      .object({ question: z.string().min(1).max(1000) })
      .parse(req.body);
    const data = await metrics(db, req.actor.org);
    return {
      mode: "Rule-based analytics assistant · no generative model",
      ...analyticsAnswer(question, data),
      series: data.series,
      suggestions: [
        "Which campaigns have the most conversions?",
        "How many subscriptions were reactivated?",
      ],
      window: data.window,
    };
  });
  app.post("/api/experiments/:id/assign", async (req) => {
    permit(req);
    const p = z.object({ recipientId: z.string() }).parse(req.body);
    const exp = await entity(
      db,
      req.actor.org,
      "experiment",
      (req.params as any).id,
    );
    const cohort = assign(exp.id, p.recipientId, exp.data.salt);
    await db.query(
      "INSERT INTO experiment_assignments(organization_id,experiment_id,recipient_id,cohort) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [req.actor.org, exp.id, hash(p.recipientId), cohort],
    );
    return (
      await db.query(
        "SELECT cohort,exposed_at FROM experiment_assignments WHERE organization_id=$1 AND experiment_id=$2 AND recipient_id=$3",
        [req.actor.org, exp.id, hash(p.recipientId)],
      )
    ).rows[0];
  });
  app.post("/api/experiments/:id/convert", async (req) => {
    permit(req);
    const p = z.object({ recipientId: z.string() }).parse(req.body);
    const exp = await entity(
      db,
      req.actor.org,
      "experiment",
      (req.params as any).id,
    );
    const updated = (
      await db.query(
        "UPDATE experiment_assignments SET converted_at=COALESCE(converted_at,now()) WHERE organization_id=$1 AND experiment_id=$2 AND recipient_id=$3 RETURNING cohort",
        [req.actor.org, exp.id, hash(p.recipientId)],
      )
    ).rows[0];
    if (!updated) fail("Record exposure before conversion", 409);
    return { ok: true, cohort: updated.cohort };
  });
  app.get("/api/experiments/:id/results", async (req) => {
    const exp = await entity(
      db,
      req.actor.org,
      "experiment",
      (req.params as any).id,
    );
    const rows = (
      await db.query(
        "SELECT cohort,count(*)::int AS sample,count(converted_at)::int AS conversions FROM experiment_assignments WHERE organization_id=$1 AND experiment_id=$2 GROUP BY cohort",
        [req.actor.org, exp.id],
      )
    ).rows;
    return {
      cohorts: rows.map((r) => ({ ...r, ...wilson(r.conversions, r.sample) })),
      method:
        "Wilson 95% confidence interval; conversion association is not proof of causal lift",
      metric: exp.data.metric,
    };
  });
  app.post("/api/flows/:id/simulate", async (req) => {
    permit(req);
    const p = z.object({ recipientId: z.string() }).parse(req.body);
    const flow = await entity(
      db,
      req.actor.org,
      "flow",
      (req.params as any).id,
    );
    const profile = await entity(db, req.actor.org, "profile", p.recipientId);
    await template(req.actor.org, flow.data.templateId);
    const rules = flow.data.eligibility || { status: "active" };
    const eligible =
      !!profile.data.consent &&
      !profile.data.suppressed &&
      (rules.status === "any" || profile.status === rules.status) &&
      Object.entries(rules.properties || {}).every(
        ([key, value]) => profile.data.properties?.[key] === value,
      );
    const steps = [
      { step: "trigger", status: "matched", detail: flow.data.trigger },
      {
        step: "eligibility",
        status: eligible ? "passed" : "suppressed",
        detail: "Marketing consent and suppression checked",
      },
      { step: "template", status: "resolved", detail: flow.data.templateId },
      {
        step: "delivery",
        status: "simulated",
        detail: "ESP scheduling and real delivery are not performed",
      },
    ];
    const log = await putEntity(
      db,
      req.actor.org,
      "execution",
      flow.name,
      { flowId: flow.id, recipientId: p.recipientId, eligible, steps },
      undefined,
      eligible ? "completed" : "suppressed",
    );
    return log;
  });
  app.post("/api/forms/:id/submit", async (req) => {
    permit(req);
    const p = z
      .object({
        recipientId: z.string(),
        answers: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    return idempotent(
      db,
      req.actor.org,
      String(req.headers["idempotency-key"] || ""),
      p,
      (tx) =>
        submitForm(
          tx,
          req.actor.org,
          p.recipientId,
          (req.params as any).id,
          p.answers,
        ),
    );
  });
  app.get("/api/forms/:id/responses", async (req) => {
    await entity(db, req.actor.org, "form", (req.params as any).id);
    return (
      await db.query(
        "SELECT * FROM submissions WHERE organization_id=$1 AND form_id=$2 ORDER BY created_at DESC",
        [req.actor.org, (req.params as any).id],
      )
    ).rows;
  });
  app.post("/api/action-tokens", async (req) => {
    permit(req);
    const p = z
      .object({
        recipientId: z.string(),
        scope: z.enum([
          "cart",
          "subscription",
          "reactivation",
          "swap",
          "form",
          "review",
          "sms",
          "engagement",
          "unsubscribe",
        ]),
        targetId: z.string(),
      })
      .parse(req.body);
    await entity(db, req.actor.org, "profile", p.recipientId);
    if (["subscription", "reactivation", "swap"].includes(p.scope)) {
      const sub = await entity(db, req.actor.org, "subscription", p.targetId);
      if (sub.data.recipientId !== p.recipientId)
        fail("Recipient does not own subscription", 403);
    }
    if (p.scope === "form") await entity(db, req.actor.org, "form", p.targetId);
    if (
      p.scope === "review" &&
      !(
        await db.query(
          "SELECT id FROM products WHERE organization_id=$1 AND id=$2",
          [req.actor.org, p.targetId],
        )
      ).rows.length
    )
      fail("Product not found", 404);
    const t = await mintToken(
      db,
      req.actor.org,
      p.recipientId,
      p.scope,
      p.targetId,
    );
    await audit(db, req.actor.org, req.actor.userId, "token.created", t.id);
    return t;
  });
  app.get(
    "/api/action-tokens",
    async (req) =>
      (
        await db.query(
          "SELECT id,recipient_id,scope,target_id,expires_at,revoked_at,used_at FROM action_tokens WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100",
          [req.actor.org],
        )
      ).rows,
  );
  app.delete("/api/action-tokens/:id", async (req) => {
    permit(req);
    await db.query(
      "UPDATE action_tokens SET revoked_at=now() WHERE organization_id=$1 AND id=$2",
      [req.actor.org, (req.params as any).id],
    );
    return { ok: true };
  });
  async function tokenData(token: string) {
    const t = await readToken(db, token);
    const result: any = {
      scope: t.scope,
      targetId: t.target_id,
      used: !!t.used_at,
      result: t.result?.value,
      mode: "sandbox",
      products: await new SandboxShopify(db, t.organization_id).listProducts(),
      recipientId: t.recipient_id,
    };
    if (["subscription", "reactivation", "swap"].includes(t.scope)) {
      result.subscription = await entity(
        db,
        t.organization_id,
        "subscription",
        t.target_id,
      );
      if (result.subscription.data.recipientId !== t.recipient_id)
        fail("Recipient does not own subscription", 403);
    }
    if (t.scope === "form")
      result.form = await entity(db, t.organization_id, "form", t.target_id);
    return result;
  }
  app.get("/api/experience", { config: { public: true } }, async (req) =>
    tokenData(z.object({ token: z.string().max(200) }).parse(req.query).token),
  );
  app.post(
    "/api/experience/action",
    { config: { public: true } },
    async (req) => {
      const p = z
        .object({
          token: z.string().max(200),
          input: z.record(z.string(), z.unknown()),
        })
        .parse(req.body);
      return executeToken(db, p.token, p.input);
    },
  );
  function ampHeaders(req: any, reply: any) {
    const v2 = req.headers["amp-email-sender"];
    const v1 = req.query.__amp_source_origin;
    const sender = v2 || v1;
    if (sender !== config.EMAIL_SENDER)
      fail("AMP sender is not authorized", 403);
    reply.header("Vary", "Origin, AMP-Email-Sender");
    if (v2) reply.header("AMP-Email-Allow-Sender", sender);
    else {
      const origin = req.headers.origin;
      if (
        ![
          "https://mail.google.com",
          "https://mail.yahoo.com",
          config.APP_URL,
        ].includes(origin)
      )
        fail("AMP origin is not allowed", 403);
      reply
        .header("Access-Control-Allow-Origin", origin)
        .header("AMP-Access-Control-Allow-Source-Origin", sender)
        .header(
          "Access-Control-Expose-Headers",
          "AMP-Access-Control-Allow-Source-Origin",
        );
    }
  }
  app.get("/api/amp/data", { config: { public: true } }, async (req, reply) => {
    ampHeaders(req, reply);
    const d = await tokenData((req.query as any).token);
    return {
      items: d.products.map((p: Product) => ({
        id: p.id,
        title: p.title,
        priceLabel: `$${(p.price / 100).toFixed(2)}`,
        available: p.inventory > 0,
      })),
    };
  });
  app.post(
    "/api/amp/action",
    { config: { public: true } },
    async (req, reply) => {
      ampHeaders(req, reply);
      return executeToken(db, (req.query as any).token, req.body as any);
    },
  );
  app.post("/api/carts", async (req) => {
    permit(req);
    const p = z
      .object({
        recipientId: z.string(),
        lines: z.array(
          z.object({
            variantId: z.string(),
            quantity: z.number().int(),
            sellingPlan: z.string().optional(),
          }),
        ),
      })
      .parse(req.body);
    await entity(db, req.actor.org, "profile", p.recipientId);
    return idempotent(
      db,
      req.actor.org,
      String(req.headers["idempotency-key"] || ""),
      p,
      (tx) => cart(tx, req.actor.org, p.recipientId, p.lines),
    );
  });
  app.post(
    "/api/checkout/:id/confirm",
    { config: { public: true } },
    async (req) => {
      const p = z
        .object({ token: z.string(), confirm: z.literal(true) })
        .parse(req.body);
      return db.transaction(async (tx) => {
        const token = await readToken(tx, p.token, true);
        if (token.scope !== "cart") fail("Invalid checkout scope", 403);
        const record = await entity(
          tx,
          token.organization_id,
          "cart",
          (req.params as any).id,
        );
        if (
          record.data.recipientId !== token.recipient_id ||
          token.result?.value?.id !== record.id
        )
          fail("Cart does not belong to this interaction", 403);
        if (record.status === "completed")
          return {
            message: "Sandbox order already confirmed",
            orderId: record.data.orderId,
          };
        if (Date.parse(record.data.expiresAt) <= Date.now())
          fail("Cart expired", 410);
        for (const line of record.data.lines) {
          const v = (
            await tx.query(
              "UPDATE variants SET inventory=inventory-$3 WHERE organization_id=$1 AND id=$2 AND inventory>=$3 RETURNING id",
              [token.organization_id, line.variantId, line.quantity],
            )
          ).rows[0];
          if (!v)
            fail("Inventory changed. Please choose available items.", 422);
        }
        const orderId = uid();
        await putEntity(
          tx,
          token.organization_id,
          "cart",
          record.name,
          { ...record.data, orderId },
          record.id,
          "completed",
        );
        await event(
          tx,
          token.organization_id,
          token.recipient_id,
          "purchase_confirmed",
          {
            ...token.metadata,
            cartId: record.id,
            actionId: orderId,
            mode: "sandbox",
          },
          record.data.total,
        );
        return {
          message: "Sandbox order confirmed. No payment was collected.",
          orderId,
          total: record.data.total,
          mode: "sandbox",
        };
      });
    },
  );
  app.post("/api/sms/:id/confirm", async (req) => {
    permit(req);
    if (config.DEMO_MODE !== "true")
      fail("SMS callback must be verified by a configured provider", 422);
    const row = (
      await db.query(
        "UPDATE consent SET status='confirmed',confirmed_at=now() WHERE organization_id=$1 AND id=$2 AND status='pending' RETURNING *",
        [req.actor.org, (req.params as any).id],
      )
    ).rows[0];
    if (!row) fail("Pending consent not found", 404);
    await event(db, req.actor.org, row.recipient_id, "sms_consent_completed", {
      consentId: row.id,
    });
    return {
      status: "confirmed",
      mode: "sandbox",
      message: "Simulated provider double opt-in callback; no SMS sent",
    };
  });
  app.get(
    "/api/consent",
    async (req) =>
      (
        await db.query("SELECT * FROM consent WHERE organization_id=$1", [
          req.actor.org,
        ])
      ).rows,
  );
  app.get(
    "/api/settings",
    async (req) =>
      (
        await db.query("SELECT * FROM organizations WHERE id=$1", [
          req.actor.org,
        ])
      ).rows[0],
  );
  app.patch("/api/settings", async (req) => {
    permit(req, ["owner", "admin"]);
    const p = z
      .object({
        name: z.string().min(1).max(100),
        settings: z.object({
          liveFlowSync: z.boolean(),
          retentionDays: z.number().int().min(7).max(3650),
        }),
      })
      .parse(req.body);
    await db.query("UPDATE organizations SET name=$1,settings=$2 WHERE id=$3", [
      p.name,
      JSON.stringify(p.settings),
      req.actor.org,
    ]);
    await audit(db, req.actor.org, req.actor.userId, "settings.updated");
    return { ok: true };
  });
  app.get("/api/audit", async (req) => {
    permit(req, ["owner", "admin", "analyst"]);
    return (
      await db.query(
        "SELECT * FROM audit_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 200",
        [req.actor.org],
      )
    ).rows;
  });
  app.get("/api/billing", async (req) => {
    const record = (
      await db.query(
        "SELECT * FROM entities WHERE organization_id=$1 AND kind='billing' LIMIT 1",
        [req.actor.org],
      )
    ).rows[0];
    const count = (
      await db.query(
        "SELECT event_type,count(*)::int AS count FROM events WHERE organization_id=$1 GROUP BY event_type",
        [req.actor.org],
      )
    ).rows;
    const subs = (
      await db.query(
        "SELECT count(*)::int AS count FROM entities WHERE organization_id=$1 AND kind='subscription' AND status='active'",
        [req.actor.org],
      )
    ).rows[0].count;
    const quota = await templateQuota(db, req.actor.org);
    return {
      quota,
      stripeTestAvailable:
        !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"),
      subscription: record || {
        data: { plan: "starter", status: "trialing", mode: "sandbox" },
      },
      plans: [
        { id: "starter", name: "Starter", price: 49, templates: 10 },
        { id: "growth", name: "Growth", price: 149, templates: 100 },
        { id: "scale", name: "Scale", price: 399, templates: 1000 },
      ],
      usage: { activeSubscribers: subs, events: count },
      mode: "Local billing simulator",
    };
  });
  app.post("/api/billing/change", async (req) => {
    permit(req, ["owner"]);
    const p = z
      .object({
        plan: z.enum(["starter", "growth", "scale"]),
        confirm: z.literal(true),
      })
      .parse(req.body);
    return db.transaction(async (tx) => {
      await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        req.actor.org,
      ]);
      const quota = await templateQuota(tx, req.actor.org);
      if (quota.active > planLimits[p.plan])
        fail(
          "Unpublish templates above the new plan limit before downgrading",
          422,
        );
      return putEntity(
        tx,
        req.actor.org,
        "billing",
        p.plan,
        {
          plan: p.plan,
          status: "active",
          mode: "sandbox",
          changedAt: new Date().toISOString(),
        },
        "billing-main",
        "active",
      );
    });
  });
  app.post("/api/credentials", async (req) => {
    permit(req, ["owner", "admin"]);
    const { name } = z
      .object({ name: z.string().min(1).max(100) })
      .parse(req.body);
    const key = `if_${secret()}`;
    const row = await putEntity(
      db,
      req.actor.org,
      "api-credential",
      name,
      { keyHash: hash(key), scope: "analytics:read" },
      undefined,
      "active",
    );
    await audit(
      db,
      req.actor.org,
      req.actor.userId,
      "credential.created",
      row.id,
    );
    return {
      id: row.id,
      key,
      scope: "analytics:read",
      message: "Shown once. Store securely.",
    };
  });
  app.get("/api/credentials", async (req) => {
    permit(req, ["owner", "admin"]);
    return (
      await db.query(
        "SELECT id,name,status,created_at FROM entities WHERE organization_id=$1 AND kind='api-credential'",
        [req.actor.org],
      )
    ).rows;
  });
  app.delete("/api/credentials/:id", async (req) => {
    permit(req, ["owner", "admin"]);
    await db.query(
      "UPDATE entities SET status='revoked' WHERE organization_id=$1 AND id=$2 AND kind='api-credential'",
      [req.actor.org, (req.params as any).id],
    );
    return { ok: true };
  });
  app.get("/api/v1/metrics", { config: { public: true } }, async (req) => {
    const key = String(req.headers.authorization || "").replace(/^Bearer /, "");
    const row = (
      await db.query(
        "SELECT organization_id FROM entities WHERE kind='api-credential' AND status='active' AND data->>'keyHash'=$1",
        [hash(key)],
      )
    ).rows[0];
    if (!row) fail("Invalid API credential", 401);
    return metrics(db, row.organization_id);
  });
  app.get("/api/privacy/export", async (req) => {
    permit(req, ["owner", "admin"]);
    return {
      organization: req.actor.org,
      profiles: (
        await db.query(
          "SELECT * FROM entities WHERE organization_id=$1 AND kind='profile'",
          [req.actor.org],
        )
      ).rows,
      consent: (
        await db.query("SELECT * FROM consent WHERE organization_id=$1", [
          req.actor.org,
        ])
      ).rows,
      responses: (
        await db.query("SELECT * FROM submissions WHERE organization_id=$1", [
          req.actor.org,
        ])
      ).rows,
    };
  });
  app.delete("/api/privacy/profile/:id", async (req) => {
    permit(req, ["owner", "admin"]);
    const id = (req.params as any).id;
    await entity(db, req.actor.org, "profile", id);
    await db.transaction(async (tx) => {
      const consent = (
        await tx.query(
          "DELETE FROM consent WHERE organization_id=$1 AND recipient_id=$2 RETURNING id",
          [req.actor.org, id],
        )
      ).rows;
      if (consent.length)
        await tx.query(
          "DELETE FROM entities WHERE organization_id=$1 AND kind='provider-sms' AND id=ANY($2::text[])",
          [req.actor.org, consent.map((row) => row.id + "-receipt")],
        );
      await tx.query(
        "DELETE FROM experiment_assignments WHERE organization_id=$1 AND recipient_id=$2",
        [req.actor.org, hash(id)],
      );
      await tx.query(
        "DELETE FROM submissions WHERE organization_id=$1 AND recipient_id=$2",
        [req.actor.org, id],
      );
      await tx.query(
        "DELETE FROM action_tokens WHERE organization_id=$1 AND recipient_id=$2",
        [req.actor.org, id],
      );
      await tx.query(
        "DELETE FROM events WHERE organization_id=$1 AND recipient_id=$2",
        [req.actor.org, hash(id)],
      );
      await tx.query(
        "DELETE FROM entities WHERE organization_id=$1 AND (id=$2 OR data->>'recipientId'=$2 OR data->'payload'->>'recipientId'=$2 OR id=$3)",
        [req.actor.org, id, id + "-klaviyo"],
      );
      await audit(
        tx,
        req.actor.org,
        req.actor.userId,
        "privacy.profile_deleted",
        hash(id),
      );
    });
    return { ok: true };
  });
  await productionModules(app, db);
  app.post("/api/maintenance/retention", async (req) => {
    permit(req, ["owner", "admin"]);
    const p = z
      .object({
        dryRun: z.boolean().default(true),
        confirm: z.boolean().default(false),
      })
      .parse(req.body || {});
    if (!p.dryRun && !p.confirm) fail("Confirm retention cleanup");
    return db.transaction(async (tx) => {
      const result = await retention(tx, req.actor.org, p.dryRun);
      if (!p.dryRun)
        await audit(tx, req.actor.org, req.actor.userId, "retention.cleaned");
      return result;
    });
  });
  app.addHook("onClose", async () => {
    if (!options.db) await db.close();
  });
  return { app, db };
}
