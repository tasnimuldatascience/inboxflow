import {
  type Database,
  type Queryable,
  entity,
  putEntity,
  uid,
} from "../../../packages/database/src/index.ts";
import {
  hash,
  secret,
  sign,
  equal,
} from "../../../packages/shared/src/security.ts";
import { config } from "../../../packages/configuration/src/index.ts";
import {
  formSchema,
  validateAnswers,
} from "../../../packages/shared/src/index.ts";
import {
  SandboxRecharge,
  SandboxShopify,
  providerReceipt,
  type SubscriptionAction,
} from "../../../packages/integrations/src/index.ts";
export function fail(message: string, statusCode = 400): never {
  throw Object.assign(Error(message), { statusCode });
}
export async function audit(
  db: Queryable,
  org: string,
  actor: string,
  action: string,
  target?: string,
) {
  await db.query(
    "INSERT INTO audit_logs(organization_id,id,actor_id,action,target_id) VALUES($1,$2,$3,$4,$5)",
    [org, uid(), actor, action, target || null],
  );
}
export async function event(
  db: Queryable,
  org: string,
  recipient: string,
  type: string,
  metadata: Record<string, any> = {},
  revenue = 0,
) {
  const id = uid();
  await db.query(
    "INSERT INTO events(organization_id,id,recipient_id,event_type,template_id,message_id,campaign_id,block_id,provider_action_id,revenue,demo,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    [
      org,
      id,
      hash(recipient),
      type,
      metadata.templateId || null,
      metadata.messageId || null,
      metadata.campaignId || null,
      metadata.blockId || null,
      metadata.actionId || id,
      revenue,
      config.DEMO_MODE === "true" || metadata.mode !== "live",
      JSON.stringify(metadata),
    ],
  );
  return id;
}
export async function mintToken(
  db: Queryable,
  org: string,
  recipient: string,
  scope: string,
  target: string,
  minutes = 30,
  metadata: Record<string, unknown> = {},
) {
  const raw = secret(),
    signed = `${raw}.${sign(raw, config.SESSION_SECRET)}`,
    id = uid();
  await db.query(
    "INSERT INTO action_tokens(id,organization_id,recipient_id,scope,target_id,token_hash,expires_at,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      org,
      recipient,
      scope,
      target,
      hash(signed),
      new Date(Date.now() + minutes * 60000),
      JSON.stringify(metadata),
    ],
  );
  return {
    id,
    token: signed,
    url: `${config.APP_URL}/experience?token=${encodeURIComponent(signed)}`,
    expiresIn: minutes * 60,
  };
}
export async function readToken(db: Queryable, token: string, lock = false) {
  const [raw, sig] = token.split(".");
  if (!raw || !sig || !equal(sign(raw, config.SESSION_SECRET), sig))
    fail("Invalid interaction link", 401);
  const row = (
    await db.query(
      `SELECT * FROM action_tokens WHERE token_hash=$1${lock ? " FOR UPDATE" : ""}`,
      [hash(token)],
    )
  ).rows[0];
  if (
    !row ||
    row.revoked_at ||
    new Date(row.expires_at).getTime() <= Date.now()
  )
    fail("This interaction link has expired or been revoked", 401);
  return row;
}
export async function idempotent(
  db: Database,
  org: string,
  key: string,
  payload: unknown,
  fn: (tx: Queryable) => Promise<any>,
) {
  if (!key || key.length > 150) fail("A valid Idempotency-Key is required");
  const fingerprint = hash(JSON.stringify(payload));
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
      org,
    ]);
    const old = (
      await tx.query(
        "SELECT * FROM idempotency WHERE organization_id=$1 AND key=$2",
        [org, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== fingerprint)
        fail("Idempotency key was used for different input", 409);
      return old.response;
    }
    const result = await fn(tx);
    await tx.query("INSERT INTO idempotency VALUES($1,$2,$3,$4,now())", [
      org,
      key,
      fingerprint,
      JSON.stringify(result),
    ]);
    return result;
  });
}
export async function submitForm(
  db: Queryable,
  org: string,
  recipient: string,
  id: string,
  answers: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
) {
  const row = await entity(db, org, "form", id);
  const form = formSchema.parse(row.data);
  const clean = validateAnswers(form, answers);
  const profile = await entity(db, org, "profile", recipient);
  const properties = { ...profile.data.properties };
  for (const q of form.questions)
    if (q.profileProperty && clean[q.id] !== undefined)
      properties[q.profileProperty] = clean[q.id];
  const responseId = uid();
  await db.query("INSERT INTO submissions VALUES($1,$2,$3,$4,$5,now())", [
    org,
    responseId,
    id,
    recipient,
    JSON.stringify(clean),
  ]);
  await putEntity(
    db,
    org,
    "profile",
    profile.name,
    { ...profile.data, properties },
    recipient,
    profile.status,
  );
  await putEntity(
    db,
    org,
    "provider-profile",
    profile.name,
    { email: profile.data.email, properties, mode: "sandbox" },
    recipient + "-klaviyo",
    "synced",
  );
  await event(db, org, recipient, "form_submitted", {
    ...metadata,
    formId: id,
    responseId,
  });
  const outcome = form.outcomes.find((o) => clean[o.questionId] === o.equals);
  return {
    id: responseId,
    message: outcome?.result || form.success,
    profileSynced: "sandbox",
  };
}
export async function cart(
  db: Queryable,
  org: string,
  recipient: string,
  lines: { variantId: string; quantity: number; sellingPlan?: string }[],
  metadata: Record<string, unknown> = {},
) {
  if (!lines.length || lines.length > 24) fail("Choose 1–24 cart items");
  let subtotal = 0;
  const items = [];
  for (const line of lines) {
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    )
      fail("Quantity must be 1–20");
    const v = (
      await db.query(
        "SELECT * FROM variants WHERE organization_id=$1 AND id=$2",
        [org, line.variantId],
      )
    ).rows[0];
    if (!v || v.inventory < line.quantity)
      fail("Variant is unavailable or out of stock", 422);
    const product = (
      await db.query(
        "SELECT data FROM products WHERE organization_id=$1 AND id=$2",
        [org, v.product_id],
      )
    ).rows[0].data;
    const plan = line.sellingPlan
      ? product.sellingPlans.find((p: any) => p.id === line.sellingPlan)
      : null;
    if (line.sellingPlan && !plan) fail("Unknown selling plan");
    const price = Math.round(v.price * (1 - (plan?.discount || 0) / 100));
    subtotal += price * line.quantity;
    items.push({ ...line, title: product.title, price });
  }
  const discount =
    lines.reduce((s, l) => s + l.quantity, 0) >= 4
      ? Math.round(subtotal * 0.1)
      : 0;
  const data = {
    recipientId: recipient,
    lines: items,
    subtotal,
    discount,
    total: subtotal - discount,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    mode: "sandbox",
  };
  const row = await putEntity(
    db,
    org,
    "cart",
    "Your daily ritual",
    data,
    undefined,
    "open",
  );
  await event(db, org, recipient, "add_to_cart", {
    ...metadata,
    cartId: row.id,
  });
  const provider = await new SandboxShopify(db, org).createCart(lines);
  return {
    ...row,
    providerCartId: provider.id,
    checkoutUrl: `/checkout/${row.id}`,
  };
}
export async function executeToken(
  db: Database,
  token: string,
  input: Record<string, any>,
) {
  return db.transaction(async (tx) => {
    const t = await readToken(tx, token, true);
    if (t.used_at) {
      if (t.result && t.result.inputHash === hash(JSON.stringify(input)))
        return t.result.value;
      fail("This link has already been used", 409);
    }
    if (input.confirm !== true && input.confirm !== "true")
      fail("Intentional confirmation is required");
    const org = t.organization_id,
      r = t.recipient_id;
    // Serialize separate recipient tokens for the same profile across database processes.
    await tx.query(
      "SELECT id FROM entities WHERE organization_id=$1 AND kind='profile' AND id=$2 FOR UPDATE",
      [org, r],
    );
    let result: any;
    const scope = t.scope;
    if (
      scope === "subscription" ||
      scope === "reactivation" ||
      scope === "swap"
    ) {
      const sub = await entity(tx, org, "subscription", t.target_id);
      if (sub.data.recipientId !== r)
        fail("Subscription does not belong to recipient", 403);
      const action = (
        scope === "reactivation"
          ? "reactivate"
          : scope === "swap"
            ? "swap"
            : input.action
      ) as SubscriptionAction;
      if (
        ![
          "skip",
          "delay",
          "quantity",
          "swap",
          "plan",
          "one-time",
          "reactivate",
          "ship-now",
        ].includes(action)
      )
        fail("Unsupported subscription action");
      const updated = await new SandboxRecharge(tx, org).act(
        sub.id,
        action,
        input,
      );
      const types: Record<string, string> = {
        delay: "subscription_delayed",
        skip: "subscription_skipped",
        reactivate: "subscription_reactivated",
        swap: "product_swapped",
        quantity: "subscription_quantity_updated",
        plan: "subscription_plan_updated",
        "one-time": "subscription_upsell",
        "ship-now": "shipment_requested",
      };
      await event(tx, org, r, types[action], {
        ...t.metadata,
        subscriptionId: sub.id,
        actionId: t.id,
      });
      result = {
        message: "Your subscription has been updated in the sandbox.",
        subscription: updated,
      };
    } else if (scope === "cart") {
      result = await cart(
        tx,
        org,
        r,
        input.lines || [
          {
            variantId: input.variantId,
            quantity: Number(input.quantity || 1),
            sellingPlan: input.sellingPlan,
          },
        ],
        t.metadata,
      );
      result.message = "Cart is ready. Continue to secure sandbox checkout.";
    } else if (scope === "form") {
      const form = await entity(tx, org, "form", t.target_id);
      const answers =
        input.answers ||
        Object.fromEntries(
          Object.entries(input)
            .filter(([k]) => form.data.questions.some((q: any) => q.id === k))
            .map(([k, v]) => [
              k,
              form.data.questions.find((q: any) => q.id === k).type === "rating"
                ? Number(v)
                : v,
            ]),
        );
      result = await submitForm(tx, org, r, t.target_id, answers, t.metadata);
    } else if (scope === "review") {
      const rating = Number(input.rating);
      if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        typeof input.body !== "string" ||
        !input.body.trim() ||
        input.body.length > 5000 ||
        typeof input.title !== "string" ||
        input.title.length > 120
      )
        fail("A rating, title, and review are required");
      const duplicate = (
        await tx.query(
          "SELECT id FROM entities WHERE organization_id=$1 AND kind='review' AND data->>'recipientId'=$2 AND data->>'productId'=$3",
          [org, r, t.target_id],
        )
      ).rows[0];
      if (duplicate) fail("You have already reviewed this product", 409);
      const data = {
        recipientId: r,
        productId: t.target_id,
        rating,
        title: input.title,
        body: input.body,
      };
      const row = await putEntity(
        tx,
        org,
        "review",
        input.title,
        data,
        undefined,
        "submitted",
      );
      await providerReceipt(tx, org, "review", data, row.id);
      await event(tx, org, r, "review_submitted", {
        ...t.metadata,
        reviewId: row.id,
      });
      result = {
        message:
          "Your review was saved and received by the sandbox review provider.",
        reviewId: row.id,
      };
    } else if (scope === "sms") {
      if (input.consent !== true && input.consent !== "true")
        fail("Explicit SMS consent is required");
      if (
        typeof input.phone !== "string" ||
        !/^\+[1-9]\d{7,14}$/.test(input.phone)
      )
        fail("Use an international phone number");
      const wording =
        "I agree to receive recurring marketing SMS. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.";
      const id = uid();
      const saved = (
        await tx.query(
          "INSERT INTO consent(organization_id,id,recipient_id,channel,address,status,wording,evidence) VALUES($1,$2,$3,'sms',$4,'pending',$5,$6) ON CONFLICT(organization_id,channel,address) DO NOTHING RETURNING id",
          [
            org,
            id,
            r,
            input.phone,
            wording,
            JSON.stringify({
              intentional: true,
              tokenId: t.id,
              timestamp: new Date().toISOString(),
            }),
          ],
        )
      ).rows[0];
      if (!saved) fail("This number already has an opt-in record", 409);
      await providerReceipt(
        tx,
        org,
        "sms",
        { phone: input.phone, status: "pending" },
        id,
      );
      await event(tx, org, r, "sms_consent_pending", {
        ...t.metadata,
        consentId: id,
      });
      result = {
        message:
          "Consent recorded. Double opt-in is pending; no marketing SMS has been sent.",
        consentId: id,
        status: "pending",
      };
    } else if (scope === "unsubscribe") {
      const profile = await entity(tx, org, "profile", r);
      await putEntity(
        tx,
        org,
        "profile",
        profile.name,
        { ...profile.data, suppressed: true, consent: false },
        r,
        "suppressed",
      );
      await tx.query(
        "UPDATE consent SET status='revoked' WHERE organization_id=$1 AND recipient_id=$2 AND channel='email'",
        [org, r],
      );
      result = { message: "You have been unsubscribed from marketing email." };
    } else if (scope === "engagement") {
      const reward =
        Number.parseInt(hash(`${r}:${t.target_id}`).slice(0, 8), 16) % 3;
      const offers = [
        "A little joy: 5% sandbox reward",
        "A brighter day: 10% sandbox reward",
        "A fresh start: 15% sandbox reward",
      ];
      await event(tx, org, r, "engagement_revealed", {
        ...t.metadata,
        blockId: t.target_id,
        reward,
      });
      result = { message: offers[reward], reward };
    } else fail("Unsupported action scope");
    await tx.query(
      "UPDATE action_tokens SET used_at=now(),result=$2 WHERE id=$1",
      [
        t.id,
        JSON.stringify({
          inputHash: hash(JSON.stringify(input)),
          value: result,
        }),
      ],
    );
    await audit(tx, org, hash(r), "recipient." + scope, t.target_id);
    return result;
  });
}
