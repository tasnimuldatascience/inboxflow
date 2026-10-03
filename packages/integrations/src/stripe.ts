import { createHmac } from "node:crypto";
import { equal } from "../../shared/src/security.ts";
import { providerRequest } from "./index.ts";
export class StripeTestProvider {
  constructor(private key: string) {
    if (!key.startsWith("sk_test_"))
      throw Error("Only Stripe test keys are accepted");
  }
  async checkout(
    org: string,
    plan: string,
    price: string,
    appUrl: string,
    idempotencyKey: string,
  ) {
    if (!/^price_[a-zA-Z0-9]+$/.test(price))
      throw Error("Configure the corresponding Stripe test price ID");
    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: `${appUrl}/app/billing?checkout=returned`,
      cancel_url: `${appUrl}/app/billing?checkout=cancelled`,
      "metadata[organization]": org,
      "metadata[plan]": plan,
    });
    const result = await providerRequest(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": idempotencyKey,
        },
        body: body.toString(),
      },
    );
    if (result.livemode !== false || !String(result.id).startsWith("cs_test_"))
      throw Error("Stripe returned a non-test session");
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
      throw Error("Invalid Stripe checkout URL");
    return { id: result.id, url: result.url, mode: "stripe-test" };
  }
}
export function verifyStripe(
  raw: Buffer,
  header: string,
  key: string,
  now = Math.floor(Date.now() / 1000),
) {
  const parts = header.split(",").map((s) => s.split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > 300)
    return false;
  const expected = createHmac("sha256", key)
    .update(`${timestamp}.`)
    .update(raw)
    .digest("hex");
  return parts
    .filter(([k]) => k === "v1")
    .some(([, value]) => equal(expected, value || ""));
}
