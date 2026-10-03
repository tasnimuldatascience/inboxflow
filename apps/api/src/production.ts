import { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  trace,
  SpanStatusCode,
  metrics as otelMetrics,
  type Span,
} from "@opentelemetry/api";
import {
  type Database,
  uid,
  putEntity,
} from "../../../packages/database/src/index.ts";
import { config } from "../../../packages/configuration/src/index.ts";
import {
  secret,
  hash,
  encrypt,
} from "../../../packages/shared/src/security.ts";
import {
  objectStorage,
  imageType,
  S3Storage,
} from "../../../packages/integrations/src/storage.ts";
import {
  shopifyAuthorization,
  verifyOAuth,
  exchangeShopify,
} from "../../../packages/integrations/src/oauth.ts";
import { verifyWebhook } from "../../../packages/integrations/src/index.ts";
import {
  StripeTestProvider,
  verifyStripe,
} from "../../../packages/integrations/src/stripe.ts";
import { permit } from "./auth.ts";
import { audit, fail } from "./services.ts";
export async function productionModules(app: FastifyInstance, db: Database) {
  app.post("/api/billing/stripe-test-checkout", async (req) => {
    permit(req, ["owner"]);
    const p = z
      .object({
        plan: z.enum(["starter", "growth", "scale"]),
        confirm: z.literal(true),
      })
      .parse(req.body);
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (!key.startsWith("sk_test_"))
      fail("Configure a Stripe test key to enable test checkout", 422);
    const price = process.env[`STRIPE_PRICE_${p.plan.toUpperCase()}`] || "";
    const idempotency = z
      .string()
      .min(1)
      .max(100)
      .parse(req.headers["idempotency-key"]);
    const result = await new StripeTestProvider(key).checkout(
      req.actor.org,
      p.plan,
      price,
      config.APP_URL,
      idempotency,
    );
    await putEntity(
      db,
      req.actor.org,
      "stripe-checkout",
      p.plan,
      { ...result, plan: p.plan },
      result.id,
      "pending",
    );
    await audit(
      db,
      req.actor.org,
      req.actor.userId,
      "billing.test_checkout_created",
      result.id,
    );
    return result;
  });
  const spans = new WeakMap<object, Span>();
  const durations = otelMetrics
    .getMeter("inboxflow-api")
    .createHistogram("http.server.request.duration", { unit: "ms" });
  const started = new WeakMap<object, number>();
  app.addHook("onRequest", async (req) => {
    started.set(req, performance.now());
    spans.set(
      req,
      trace
        .getTracer("inboxflow-api")
        .startSpan(`${req.method} ${req.routeOptions.url}`, {
          attributes: {
            "http.request.method": req.method,
            "http.route": req.routeOptions.url || "unknown",
          },
        }),
    );
  });
  app.addHook("onResponse", async (req, reply) => {
    const elapsed = performance.now() - (started.get(req) || performance.now());
    durations.record(elapsed, {
      "http.route": req.routeOptions.url || "unknown",
      "http.response.status_code": reply.statusCode,
    });
    const span = spans.get(req);
    span?.setAttribute("http.response.status_code", reply.statusCode);
    if (reply.statusCode >= 500)
      span?.setStatus({ code: SpanStatusCode.ERROR });
    span?.end();
  });
  const storage = objectStorage();
  app.post("/api/assets", async (req) => {
    permit(req);
    const p = z
      .object({
        name: z.string().min(1).max(100),
        base64: z.string().max(2700000),
      })
      .parse(req.body);
    const bytes = Buffer.from(p.base64, "base64");
    if (!bytes.length || bytes.length > 2000000)
      fail("Upload must be 1 byte to 2 MB");
    let info;
    try {
      info = imageType(bytes);
    } catch {
      fail("Only PNG, JPEG, and WebP images can be uploaded");
    }
    const id = uid(),
      key = `${id}.${info.extension}`;
    if (storage instanceof S3Storage) await storage.initialize();
    await storage.put(key, bytes, info.type);
    await putEntity(
      db,
      req.actor.org,
      "asset",
      p.name,
      { key, type: info.type, size: bytes.length },
      id,
      "available",
    );
    await audit(db, req.actor.org, req.actor.userId, "asset.uploaded", id);
    return {
      id,
      url: `${config.PUBLIC_API_URL}/api/assets/${id}`,
      size: bytes.length,
      type: info.type,
    };
  });
  app.get(
    "/api/assets/:id",
    { config: { public: true } },
    async (req, reply) => {
      const id = z.uuid().parse((req.params as any).id);
      const asset = (
        await db.query(
          "SELECT data FROM entities WHERE id=$1 AND kind='asset' AND status='available'",
          [id],
        )
      ).rows[0];
      if (!asset) fail("Asset not found", 404);
      return reply
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .header("Cache-Control", "public,max-age=86400")
        .type(asset.data.type)
        .send(await storage.get(asset.data.key));
    },
  );
  app.post("/api/integrations/shopify/oauth", async (req) => {
    permit(req, ["owner", "admin"]);
    if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET)
      fail(
        "Configure a Shopify development app client ID and secret to use OAuth. Sandbox needs neither.",
        422,
      );
    const { shop } = z.object({ shop: z.string().max(200) }).parse(req.body);
    const state = secret();
    const row = await putEntity(
      db,
      req.actor.org,
      "oauth-state",
      "Shopify authorization",
      {
        hash: hash(state),
        shop,
        userId: req.actor.userId,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
      undefined,
      "pending",
    );
    return {
      url: shopifyAuthorization(
        shop,
        state,
        process.env.SHOPIFY_CLIENT_ID,
        `${config.PUBLIC_API_URL}/api/integrations/shopify/callback`,
      ),
      authorizationId: row.id,
    };
  });
  app.get(
    "/api/integrations/shopify/callback",
    { config: { public: true } },
    async (req, reply) => {
      const query = z.record(z.string(), z.string()).parse(req.query);
      if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET)
        fail("Shopify OAuth is not configured", 422);
      if (!verifyOAuth(query, process.env.SHOPIFY_CLIENT_SECRET))
        fail("Invalid Shopify callback signature", 403);
      const row = (
        await db.query(
          "SELECT * FROM entities WHERE kind='oauth-state' AND status='pending' AND data->>'hash'=$1",
          [hash(query.state || "")],
        )
      ).rows[0];
      if (
        !row ||
        row.data.shop !== query.shop ||
        Date.parse(row.data.expiresAt) <= Date.now()
      )
        fail("OAuth state expired or invalid", 403);
      const rawSession = req.cookies.inboxflow_session;
      const session = rawSession
        ? (
            await db.query(
              "SELECT user_id FROM sessions WHERE id=$1 AND expires_at>now()",
              [hash(rawSession)],
            )
          ).rows[0]
        : null;
      if (session?.user_id !== row.data.userId)
        fail(
          "OAuth callback must return to the initiating browser session",
          403,
        );
      const grant = await exchangeShopify(
        query.shop,
        query.code,
        process.env.SHOPIFY_CLIENT_ID,
        process.env.SHOPIFY_CLIENT_SECRET,
      );
      if (
        typeof grant.access_token !== "string" ||
        !String(grant.scope).split(",").includes("read_products")
      )
        fail("Shopify did not grant the required read_products scope", 403);
      await db.transaction(async (tx) => {
        const claimed = (
          await tx.query(
            "UPDATE entities SET status='consumed' WHERE organization_id=$1 AND id=$2 AND status='pending' RETURNING id",
            [row.organization_id, row.id],
          )
        ).rows[0];
        if (!claimed) fail("OAuth state already used", 409);
        await tx.query(
          "INSERT INTO connections VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(organization_id,provider) DO UPDATE SET mode=$3,status=$4,credential=$5,metadata=$6,updated_at=now()",
          [
            row.organization_id,
            "shopify",
            "live",
            "connected",
            encrypt(grant.access_token, config.CREDENTIAL_KEY),
            JSON.stringify({
              shop: query.shop,
              scopes: grant.scope,
              label: "Shopify OAuth read connection",
            }),
          ],
        );
        await audit(
          tx,
          row.organization_id,
          row.data.userId,
          "shopify.oauth_connected",
        );
      });
      return reply.redirect(`${config.APP_URL}/app/integrations`);
    },
  );
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );
    hooks.post(
      "/api/webhooks/stripe",
      { config: { public: true } },
      async (req) => {
        const raw = req.body,
          key = process.env.STRIPE_WEBHOOK_SECRET;
        if (
          !key ||
          !Buffer.isBuffer(raw) ||
          !verifyStripe(raw, String(req.headers["stripe-signature"] || ""), key)
        )
          fail("Invalid Stripe webhook signature", 401);
        const payload = z
          .object({
            id: z.string().max(200),
            livemode: z.literal(false),
            type: z.string(),
            data: z.object({ object: z.record(z.string(), z.unknown()) }),
          })
          .parse(JSON.parse(raw.toString()));
        if (payload.type !== "checkout.session.completed")
          return { ignored: true };
        const checkout = payload.data.object;
        const record = (
          await db.query(
            "SELECT * FROM entities WHERE kind='stripe-checkout' AND id=$1",
            [checkout.id],
          )
        ).rows[0];
        if (!record) fail("Unknown test checkout", 404);
        if (checkout.payment_status !== "paid") return { ignored: true };
        return db.transaction(async (tx) => {
          const inserted = (
            await tx.query(
              "INSERT INTO webhook_events VALUES($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING RETURNING event_id",
              [
                "stripe",
                payload.id,
                record.organization_id,
                hash(raw.toString()),
              ],
            )
          ).rows[0];
          if (!inserted) return { duplicate: true };
          await putEntity(
            tx,
            record.organization_id,
            "billing",
            record.data.plan,
            {
              plan: record.data.plan,
              status: "active",
              mode: "stripe-test",
              customerId: checkout.customer,
              subscriptionId: checkout.subscription,
            },
            "billing-main",
            "active",
          );
          await tx.query(
            "UPDATE entities SET status='completed' WHERE organization_id=$1 AND id=$2",
            [record.organization_id, record.id],
          );
          await audit(
            tx,
            record.organization_id,
            "stripe-test",
            "billing.test_checkout_confirmed",
            record.id,
          );
          return { accepted: true };
        });
      },
    );
    hooks.post(
      "/api/webhooks/shopify/:org",
      { config: { public: true } },
      async (req) => {
        const org = (req.params as any).org;
        const connection = (
          await db.query(
            "SELECT metadata FROM connections WHERE organization_id=$1 AND provider='shopify' AND status='connected' AND mode='live'",
            [org],
          )
        ).rows[0];
        if (!connection || !process.env.SHOPIFY_CLIENT_SECRET)
          fail("Webhook integration is not configured", 401);
        const raw = req.body;
        if (!Buffer.isBuffer(raw)) fail("Raw JSON body required");
        if (
          !verifyWebhook(
            raw,
            String(req.headers["x-shopify-hmac-sha256"] || ""),
            process.env.SHOPIFY_CLIENT_SECRET,
          )
        )
          fail("Invalid webhook signature", 401);
        if (req.headers["x-shopify-shop-domain"] !== connection.metadata.shop)
          fail("Webhook shop mismatch", 403);
        const eventId = z
          .string()
          .min(1)
          .max(200)
          .parse(req.headers["x-shopify-webhook-id"]);
        JSON.parse(raw.toString("utf8"));
        return db.transaction(async (tx) => {
          const duplicate = (
            await tx.query(
              "INSERT INTO webhook_events VALUES($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING RETURNING event_id",
              ["shopify", eventId, org, hash(raw.toString())],
            )
          ).rows[0];
          if (!duplicate) return { duplicate: true };
          if (req.headers["x-shopify-topic"] === "app/uninstalled")
            await tx.query(
              "UPDATE connections SET status='disconnected',credential=null WHERE organization_id=$1 AND provider='shopify'",
              [org],
            );
          else
            await tx.query(
              "INSERT INTO jobs(id,organization_id,kind,payload) VALUES($1,$2,$3,$4)",
              [
                uid(),
                org,
                "shopify-sync",
                JSON.stringify({
                  eventId,
                  topic: req.headers["x-shopify-topic"],
                }),
              ],
            );
          return { accepted: true };
        });
      },
    );
  });
}
