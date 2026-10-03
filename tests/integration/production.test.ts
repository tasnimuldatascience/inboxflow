import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "../../apps/api/src/app.ts";
import { Database } from "../../packages/database/src/index.ts";
import { hash } from "../../packages/shared/src/security.ts";
import {
  verifyOAuth,
  shopifyAuthorization,
} from "../../packages/integrations/src/oauth.ts";
import type { FastifyInstance } from "fastify";
import {
  StripeTestProvider,
  verifyStripe,
} from "../../packages/integrations/src/stripe.ts";
import { documentSchema, newBlock } from "../../packages/shared/src/index.ts";
let app: FastifyInstance,
  db: Database,
  cookie = "",
  csrf = "";
async function call(
  method: string,
  url: string,
  payload?: unknown,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: { cookie, "x-csrf-token": csrf, ...headers },
  });
}
beforeAll(async () => {
  db = new Database(undefined, ":memory:");
  ({ app } = await buildApp({ db }));
  await app.ready();
  const r = await call("POST", "/api/auth/login", {
    email: "owner@inboxflow.local",
    password: "InboxFlowDemo!2026",
  });
  cookie = String(r.headers["set-cookie"]).split(";")[0];
  csrf = r.json().csrf;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await app.close();
  await db.close();
});
describe("production adapter boundaries", () => {
  it("deletes nested provider review and SMS receipts with their recipient privacy records", async () => {
    const review = (
      await call("POST", "/api/action-tokens", {
        scope: "review",
        targetId: "product-3",
        recipientId: "profile-3",
      })
    ).json();
    expect(
      (
        await call("POST", "/api/experience/action", {
          token: review.token,
          input: {
            confirm: true,
            rating: 5,
            title: "Privacy fixture",
            body: "Remove this feedback",
          },
        })
      ).statusCode,
    ).toBe(200);
    const sms = (
      await call("POST", "/api/action-tokens", {
        scope: "sms",
        targetId: "profile-3",
        recipientId: "profile-3",
      })
    ).json();
    const consent = (
      await call("POST", "/api/experience/action", {
        token: sms.token,
        input: { confirm: true, consent: true, phone: "+12025550193" },
      })
    ).json();
    expect(consent.consentId).toBeTruthy();
    expect(
      (await call("DELETE", "/api/privacy/profile/profile-3")).statusCode,
    ).toBe(200);
    expect(
      (
        await db.query(
          "SELECT id FROM entities WHERE organization_id='org-meadow' AND (data->'payload'->>'recipientId'='profile-3' OR id=$1)",
          [consent.consentId + "-receipt"],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("keeps Stripe checkout test-only and accepts only fresh signed test webhook confirmations", async () => {
    expect(() => new StripeTestProvider("sk_live_forbidden")).toThrow(
      "test keys",
    );
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("STRIPE_PRICE_STARTER", "price_fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fixture");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "cs_test_fixture",
              url: "https://checkout.stripe.com/c/pay/cs_test_fixture",
              livemode: false,
            }),
            { status: 200 },
          ),
      ),
    );
    expect(
      (
        await call(
          "POST",
          "/api/billing/stripe-test-checkout",
          { plan: "starter", confirm: true },
          { "idempotency-key": "test-billing" },
        )
      ).statusCode,
    ).toBe(200);
    vi.unstubAllGlobals();
    const raw = Buffer.from(
      JSON.stringify({
        id: "evt_fixture",
        livemode: false,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_fixture",
            payment_status: "paid",
            customer: "cus_fixture",
            subscription: "sub_fixture",
          },
        },
      }),
    );
    const now = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_fixture")
      .update(`${now}.`)
      .update(raw)
      .digest("hex");
    const header = `t=${now},v1=${sig}`;
    expect(verifyStripe(raw, header, "whsec_fixture", now + 301)).toBe(false);
    expect(
      (
        await call("POST", "/api/webhooks/stripe", raw.toString(), {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=forged",
          cookie: "",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await call("POST", "/api/webhooks/stripe", raw.toString(), {
          "content-type": "application/json",
          "stripe-signature": header,
          cookie: "",
        })
      ).json(),
    ).toEqual({ accepted: true });
    expect(
      (
        await call("POST", "/api/webhooks/stripe", raw.toString(), {
          "content-type": "application/json",
          "stripe-signature": header,
          cookie: "",
        })
      ).json(),
    ).toEqual({ duplicate: true });
    expect(
      (await call("GET", "/api/billing")).json().subscription.data.mode,
    ).toBe("stripe-test");
  });
  it("enforces published template entitlements and retains draft editing access", async () => {
    const document = documentSchema.parse({
      name: "Quota verification",
      subject: "Hello",
      blocks: [newBlock("heading")],
    });
    for (let i = 0; i < 10; i++) {
      const created = (await call("POST", "/api/templates", document)).json();
      expect(
        (
          await call("PUT", `/api/templates/${created.id}`, {
            document,
            revision: 1,
            status: "published",
          })
        ).statusCode,
      ).toBe(200);
    }
    const extra = (await call("POST", "/api/templates", document)).json();
    expect(
      (
        await call("PUT", `/api/templates/${extra.id}`, {
          document,
          revision: 1,
          status: "published",
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (
        await call("PUT", `/api/templates/${extra.id}`, {
          document,
          revision: 1,
          status: "draft",
        })
      ).statusCode,
    ).toBe(200);
  });
  it("previews and confirms retention cleanup without touching other tenants or consent evidence", async () => {
    await db.query(
      "INSERT INTO events(organization_id,id,recipient_id,event_type,created_at) VALUES('org-meadow','expired-event','test','form_submitted',now()-interval '500 days'),('org-studio','foreign-event','test','form_submitted',now()-interval '500 days')",
    );
    expect(
      (
        await call("POST", "/api/maintenance/retention", { dryRun: true })
      ).json().counts.events,
    ).toBe(1);
    expect(
      (await call("POST", "/api/maintenance/retention", { dryRun: false }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await call("POST", "/api/maintenance/retention", {
          dryRun: false,
          confirm: true,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.query("SELECT id FROM events WHERE id='foreign-event'")).rows,
    ).toHaveLength(1);
  });
  it("retains template, block, and message attribution through a personalized cart purchase", async () => {
    const output = (
      await call("POST", "/api/templates/template-cart/render", {
        recipientId: "profile-1",
        validate: false,
      })
    ).json();
    // Select the commerce link rather than the unsubscribe link.
    const commerce = Object.entries(output.links).find(
      ([id]) => id === "template-cart-main",
    )!;
    const scoped = new URL(commerce[1] as string).searchParams.get("token")!;
    const result = (
      await call("POST", "/api/experience/action", {
        token: scoped,
        input: {
          confirm: true,
          lines: [{ variantId: "variant-1-1", quantity: 1 }],
        },
      })
    ).json();
    expect(result.id).toBeTruthy();
    expect(
      (
        await call("POST", `/api/checkout/${result.id}/confirm`, {
          token: scoped,
          confirm: true,
        })
      ).statusCode,
    ).toBe(200);
    const event = (
      await db.query(
        "SELECT * FROM events WHERE event_type='purchase_confirmed' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0];
    expect(event.template_id).toBe("template-cart");
    expect(event.block_id).toBe("template-cart-main");
    expect(event.message_id).toBeTruthy();
    expect(event.demo).toBe(true);
  });
  it("validates image signatures, serves uploaded bytes and denies non-images and unauthenticated uploads", async () => {
    expect(
      (
        await call("POST", "/api/assets", {
          name: "script.svg",
          base64: Buffer.from('<svg onload="alert(1)"></svg>').toString(
            "base64",
          ),
        })
      ).statusCode,
    ).toBe(400);
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    );
    const r = await call("POST", "/api/assets", {
      name: "pixel.png",
      base64: bytes.toString("base64"),
    });
    expect(r.statusCode).toBe(200);
    const saved = await call("GET", `/api/assets/${r.json().id}`, undefined, {
      cookie: "",
    });
    expect(saved.rawPayload).toEqual(bytes);
    expect(saved.headers["content-type"]).toContain("image/png");
    expect(saved.headers["x-content-type-options"]).toBe("nosniff");
    expect(saved.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(
      (
        await call(
          "POST",
          "/api/assets",
          { name: "x", base64: "abc" },
          { cookie: "" },
        )
      ).statusCode,
    ).toBe(401);
  });
  it("binds OAuth state to the initiating session, validates HMAC, consumes it once and encrypts provider credentials", async () => {
    vi.stubEnv("SHOPIFY_CLIENT_ID", "test-client");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "test-client-secret");
    expect(() =>
      shopifyAuthorization(
        "evil.example",
        "state",
        "client",
        "https://app.example",
      ),
    ).toThrow();
    const start = await call("POST", "/api/integrations/shopify/oauth", {
      shop: "fixture.myshopify.com",
    });
    expect(start.statusCode).toBe(200);
    const url = new URL(start.json().url);
    const q = {
      shop: "fixture.myshopify.com",
      state: url.searchParams.get("state")!,
      code: "fake-code",
      timestamp: "12345",
    };
    const message = Object.entries(q)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const hmac = createHmac("sha256", "test-client-secret")
      .update(message)
      .digest("hex");
    expect(verifyOAuth({ ...q, hmac }, "test-client-secret")).toBe(true);
    expect(
      verifyOAuth({ ...q, code: "changed", hmac }, "test-client-secret"),
    ).toBe(false);
    const callback =
      "/api/integrations/shopify/callback?" +
      new URLSearchParams({ ...q, hmac });
    expect(
      (await call("GET", callback, undefined, { cookie: "" })).statusCode,
    ).toBe(403);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              access_token: "fake-provider-key",
              scope: "read_products,read_inventory",
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await call("GET", callback);
    expect(result.statusCode).toBe(302);
    const conn = (
      await db.query(
        "SELECT * FROM connections WHERE organization_id='org-meadow' AND provider='shopify'",
      )
    ).rows[0];
    expect(conn.mode).toBe("live");
    expect(conn.credential).not.toContain("fake-provider-key");
    expect((await call("GET", callback)).statusCode).toBe(403);
    const state = (
      await db.query("SELECT data FROM entities WHERE kind='oauth-state'")
    ).rows[0];
    expect(state.data.hash).toBe(hash(q.state));
    vi.unstubAllGlobals();
  });
  it("accepts exact raw Shopify JSON, deduplicates webhooks, rejects tampering and revokes uninstalled credentials", async () => {
    const raw = '{ "id": 42, "title": "Fixture" }';
    const signature = createHmac("sha256", "test-client-secret")
      .update(raw)
      .digest("base64");
    const headers = {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": signature,
      "x-shopify-shop-domain": "fixture.myshopify.com",
      "x-shopify-webhook-id": "webhook-test-1",
      "x-shopify-topic": "products/update",
      cookie: "",
    };
    expect(
      (
        await call(
          "POST",
          "/api/webhooks/shopify/org-meadow",
          raw.replace("42", "43"),
          headers,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await call("POST", "/api/webhooks/shopify/org-meadow", raw, {
          ...headers,
          "x-shopify-shop-domain": "other.myshopify.com",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call("POST", "/api/webhooks/shopify/org-meadow", raw, headers)
      ).json(),
    ).toEqual({ accepted: true });
    expect(
      (
        await call("POST", "/api/webhooks/shopify/org-meadow", raw, headers)
      ).json(),
    ).toEqual({ duplicate: true });
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM jobs WHERE organization_id='org-meadow'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await call("POST", "/api/webhooks/shopify/org-meadow", raw, {
          ...headers,
          "x-shopify-webhook-id": "uninstall-1",
          "x-shopify-topic": "app/uninstalled",
        })
      ).statusCode,
    ).toBe(200);
    const conn = (
      await db.query(
        "SELECT * FROM connections WHERE organization_id='org-meadow' AND provider='shopify'",
      )
    ).rows[0];
    expect(conn.status).toBe("disconnected");
    expect(conn.credential).toBeNull();
  });
});
