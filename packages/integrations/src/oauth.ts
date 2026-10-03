import { createHmac } from "node:crypto";
import { equal } from "../../shared/src/security.ts";
import { providerRequest } from "./index.ts";
export function validShop(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}
export function shopifyAuthorization(
  shop: string,
  state: string,
  clientId: string,
  redirectUri: string,
) {
  if (!validShop(shop)) throw Error("Invalid Shopify shop domain");
  return `https://${shop}/admin/oauth/authorize?${new URLSearchParams({ client_id: clientId, scope: "read_products,read_inventory", redirect_uri: redirectUri, state })}`;
}
export function verifyOAuth(query: Record<string, string>, key: string) {
  const message = Object.entries(query)
    .filter(([k]) => !["hmac", "signature"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const expected = createHmac("sha256", key).update(message).digest("hex");
  return /^[a-f0-9]{64}$/.test(query.hmac || "") && equal(expected, query.hmac);
}
export async function exchangeShopify(
  shop: string,
  code: string,
  clientId: string,
  clientSecret: string,
) {
  if (!validShop(shop)) throw Error("Invalid Shopify shop domain");
  return providerRequest(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });
}
