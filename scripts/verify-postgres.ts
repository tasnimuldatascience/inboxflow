import assert from "node:assert/strict";
import { Database, putEntity, uid } from "../packages/database/src/index.ts";
import { seed } from "../packages/database/src/seed.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { sandboxCatalog } from "../packages/database/src/fixtures.ts";
import { replaceCatalog } from "../packages/integrations/src/catalog.ts";
import { S3Storage } from "../packages/integrations/src/storage.ts";
import { config } from "../packages/configuration/src/index.ts";
if (
  !config.DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(new URL(config.DATABASE_URL).hostname)
)
  throw Error(
    "This verification command requires explicitly configured local PostgreSQL",
  );
const db = new Database();
await db.migrate();
await seed(db);
const { app } = await buildApp({ db });
await app.ready();
let cookie = "",
  csrf = "",
  org = "";
async function call(method: string, url: string, payload?: unknown) {
  const r = await app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: { cookie, "x-csrf-token": csrf },
  });
  return { status: r.statusCode, body: r.json(), headers: r.headers };
}
try {
  const login = await call("POST", "/api/auth/login", {
    email: "owner@inboxflow.local",
    password: "InboxFlowDemo!2026",
  });
  assert.equal(login.status, 200);
  cookie = String(login.headers["set-cookie"]).split(";")[0];
  csrf = login.body.csrf;
  const created = await call("POST", "/api/organizations", {
    name: "Verification fixture " + uid(),
  });
  org = created.body.id;
  await call("POST", "/api/auth/switch", { organizationId: org });
  const product = {
    ...sandboxCatalog()[0],
    id: "verification-product",
    variants: [
      {
        id: "verification-variant",
        title: "Last item",
        price: 2400,
        inventory: 1,
      },
    ],
  };
  await db.transaction(async (tx) => {
    await replaceCatalog(tx, org, [product]);
    for (const id of ["recipient-a", "recipient-b"])
      await putEntity(
        tx,
        org,
        "profile",
        id,
        {
          email: `${id}@example.test`,
          consent: true,
          suppressed: false,
          properties: {},
        },
        id,
        "active",
      );
  });
  const tokens = [];
  for (const recipientId of ["recipient-a", "recipient-b"]) {
    const token = await call("POST", "/api/action-tokens", {
      scope: "cart",
      targetId: product.id,
      recipientId,
    });
    assert.equal(token.status, 200);
    const cart = await call("POST", "/api/experience/action", {
      token: token.body.token,
      input: {
        confirm: true,
        lines: [{ variantId: "verification-variant", quantity: 1 }],
      },
    });
    assert.equal(cart.status, 200);
    tokens.push({ token: token.body.token, id: cart.body.id });
  }
  const purchases = await Promise.all(
    tokens.map((t) =>
      call("POST", `/api/checkout/${t.id}/confirm`, {
        token: t.token,
        confirm: true,
      }),
    ),
  );
  assert.deepEqual(purchases.map((r) => r.status).sort(), [200, 422]);
  assert.equal(
    (
      await db.query(
        "SELECT inventory FROM variants WHERE organization_id=$1 AND id=$2",
        [org, "verification-variant"],
      )
    ).rows[0].inventory,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM events WHERE organization_id=$1 AND event_type='purchase_confirmed'",
        [org],
      )
    ).rows[0].n,
    1,
  );
  const winner = tokens[purchases.findIndex((r) => r.status === 200)];
  const repeats = await Promise.all(
    [1, 2, 3].map(() =>
      call("POST", `/api/checkout/${winner.id}/confirm`, {
        token: winner.token,
        confirm: true,
      }),
    ),
  );
  assert.equal(new Set(repeats.map((r) => r.body.orderId)).size, 1);
  const revision = await putEntity(
    db,
    org,
    "form",
    "Concurrent form",
    {
      name: "Concurrent form",
      questions: [
        {
          id: "q1",
          label: "Answer",
          type: "short",
          required: true,
          options: [],
        },
      ],
      success: "Thank you",
      outcomes: [],
    },
    "concurrent-form",
  );
  const updates = await Promise.all(
    ["A", "B"].map((name) =>
      call("PUT", "/api/records/form/concurrent-form", {
        name,
        data: revision.data,
        revision: revision.revision,
        status: "published",
      }),
    ),
  );
  assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
  if (process.env.VERIFY_WORKER === "true") {
    const success = uid(),
      failure = uid();
    await db.query(
      "INSERT INTO jobs(id,organization_id,kind,payload,attempts) VALUES($1,$2,'shopify-sync','{}',0),($3,$2,'unsupported-fixture','{}',3)",
      [success, org, failure],
    );
    let outcomes: any[] = [];
    for (let i = 0; i < 20; i++) {
      outcomes = (
        await db.query(
          "SELECT id,status FROM jobs WHERE organization_id=$1 AND id=ANY($2::text[])",
          [org, [success, failure]],
        )
      ).rows;
      if (
        outcomes.some((r) => r.id === success && r.status === "completed") &&
        outcomes.some((r) => r.id === failure && r.status === "dead-letter")
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(outcomes.find((r) => r.id === success)?.status, "completed");
    assert.equal(outcomes.find((r) => r.id === failure)?.status, "dead-letter");
    console.log(
      "PASS: running PostgreSQL/BullMQ worker completion and exhausted-attempt dead-letter handling.",
    );
  }
  const storage = new S3Storage(
    "inboxflow-verification",
    "http://localhost:9000",
    "inboxflow-local",
    "local-only-object-storage-password",
  );
  await storage.initialize();
  const bytes = Buffer.from("local S3 verification");
  const key = `${uid()}.png`;
  await storage.put(key, bytes, "image/png");
  assert.deepEqual(await storage.get(key), bytes);
  console.log(
    "PASS: real PostgreSQL migrations/seed, competing inventory checkout, replay idempotency, concurrent revision conflict, tenant fixtures, and RustFS S3 put/get.",
  );
} finally {
  if (org) {
    assert.match(org, /^[a-f0-9-]{36}$/);
    await db.query("DELETE FROM organizations WHERE id=$1 AND name LIKE $2", [
      org,
      "Verification fixture %",
    ]);
  }
  await app.close();
  await db.close();
}
