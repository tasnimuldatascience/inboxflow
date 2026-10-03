import { type Product } from "../../shared/src/index.ts";
import {
  type Queryable,
  putEntity,
  entity,
  uid,
} from "../../database/src/index.ts";
import { createHmac } from "node:crypto";
import { equal } from "../../shared/src/security.ts";
export async function providerRequest(
  url: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !(
      u.hostname.endsWith(".myshopify.com") ||
      ["a.klaviyo.com", "api.rechargeapps.com", "api.stripe.com"].includes(
        u.hostname,
      )
    )
  )
    throw Error("Provider URL is not allowed");
  const readGraphql =
    options.method === "POST" &&
    u.hostname.endsWith(".myshopify.com") &&
    u.pathname.endsWith("/graphql.json") &&
    typeof options.body === "string" &&
    String(JSON.parse(options.body).query || "")
      .trimStart()
      .startsWith("query ");
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    if (
      (res.status === 429 || res.status >= 500) &&
      attempt < 3 &&
      (!options.method || options.method === "GET" || readGraphql)
    ) {
      const delay = Math.min(
        2000,
        Number(res.headers.get("retry-after") || 0) * 1000 ||
          200 * 2 ** attempt,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (!res.ok)
      throw Object.assign(Error(`Provider returned HTTP ${res.status}`), {
        statusCode: 502,
      });
    return res.json();
  }
  throw Error("Provider retries exhausted");
}
export interface CommerceProvider {
  listProducts(): Promise<Product[]>;
  createCart(
    lines: { variantId: string; quantity: number }[],
  ): Promise<{ id: string; checkoutUrl: string }>;
}
export class SandboxShopify implements CommerceProvider {
  constructor(
    private db: Queryable,
    private org: string,
  ) {}
  async listProducts() {
    const products = (
      await this.db.query(
        "SELECT data FROM products WHERE organization_id=$1 ORDER BY title",
        [this.org],
      )
    ).rows.map((r) => r.data as Product);
    const variants = (
      await this.db.query(
        "SELECT id,price,inventory FROM variants WHERE organization_id=$1",
        [this.org],
      )
    ).rows;
    return products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => {
        const stored = variants.find((s) => s.id === v.id);
        return stored
          ? { ...v, price: stored.price, inventory: stored.inventory }
          : v;
      }),
      inventory: p.variants.reduce(
        (sum, v) => sum + (variants.find((s) => s.id === v.id)?.inventory || 0),
        0,
      ),
    }));
  }
  async createCart(lines: { variantId: string; quantity: number }[]) {
    const row = await putEntity(
      this.db,
      this.org,
      "provider-cart",
      "Sandbox merchant checkout",
      { lines, mode: "sandbox" },
      undefined,
      "open",
    );
    return { id: row.id, checkoutUrl: `/checkout/${row.id}` };
  }
}
export class ShopifyProvider implements CommerceProvider {
  constructor(
    private shop: string,
    private adminToken: string,
    private storefrontToken?: string,
  ) {
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
      throw Error("Invalid Shopify shop");
  }
  async listProducts() {
    const products: Product[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      const res = await providerRequest(
        `https://${this.shop}/admin/api/2026-10/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": this.adminToken,
          },
          body: JSON.stringify({
            query:
              "query Catalog($after:String){products(first:50,after:$after){pageInfo{hasNextPage endCursor}nodes{id title description productType featuredMedia{preview{image{url}}}collections(first:100){pageInfo{hasNextPage}nodes{id title}}sellingPlanGroups(first:20){pageInfo{hasNextPage}nodes{sellingPlans(first:100){pageInfo{hasNextPage}nodes{id name}}}}variants(first:100){pageInfo{hasNextPage endCursor}nodes{id title price inventoryQuantity}}}}}",
            variables: { after: cursor },
          }),
        },
      );
      if (res.errors) throw Error("Shopify GraphQL query failed");
      for (const p of res.data.products.nodes) {
        if (
          p.collections?.pageInfo?.hasNextPage ||
          p.sellingPlanGroups?.pageInfo?.hasNextPage ||
          p.sellingPlanGroups?.nodes.some(
            (g: any) => g.sellingPlans.pageInfo.hasNextPage,
          )
        )
          throw Error(
            "Catalog exceeds collection or selling-plan membership limits. Synchronization stopped before publishing a partial catalog.",
          );
        const variants = [...p.variants.nodes];
        let pageInfo = p.variants.pageInfo;
        let variantPages = 0;
        while (pageInfo?.hasNextPage) {
          if (++variantPages > 100)
            throw Error("Variant pagination exceeded safety limit");
          const next = await providerRequest(
            `https://${this.shop}/admin/api/2026-10/graphql.json`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": this.adminToken,
              },
              body: JSON.stringify({
                query:
                  "query Variants($id:ID!,$after:String){product(id:$id){variants(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id title price inventoryQuantity}}}}",
                variables: { id: p.id, after: pageInfo.endCursor },
              }),
            },
          );
          if (next.errors || !next.data?.product)
            throw Error("Shopify variant query failed");
          variants.push(...next.data.product.variants.nodes);
          pageInfo = next.data.product.variants.pageInfo;
        }
        const vs = variants.map((v: any) => ({
          id: v.id,
          title: v.title,
          price: Math.round(Number(v.price) * 100),
          inventory: Math.max(0, v.inventoryQuantity || 0),
        }));
        products.push({
          id: p.id,
          title: p.title,
          description: p.description,
          category: p.productType,
          image: p.featuredMedia?.preview?.image?.url || "",
          price: vs[0]?.price || 0,
          inventory: vs.reduce((s: number, v: any) => s + v.inventory, 0),
          rank: 0,
          variants: vs,
          sellingPlans: (p.sellingPlanGroups?.nodes || []).flatMap((g: any) =>
            g.sellingPlans.nodes.map((plan: any) => ({
              id: plan.id,
              name: plan.name,
              discount: 0,
            })),
          ),
          collections: p.collections?.nodes || [],
        });
      }
      if (!res.data.products.pageInfo.hasNextPage) return products;
      cursor = res.data.products.pageInfo.endCursor;
    }
    throw Error("Catalog pagination exceeded safety limit");
  }
  async createCart(lines: { variantId: string; quantity: number }[]) {
    if (!this.storefrontToken)
      throw Error("Shopify Storefront token is required for cart handoff");
    const res = await providerRequest(
      `https://${this.shop}/api/2026-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": this.storefrontToken,
        },
        body: JSON.stringify({
          query:
            "mutation Cart($input:CartInput!){cartCreate(input:$input){cart{id checkoutUrl}userErrors{message}}}",
          variables: {
            input: {
              lines: lines.map((l) => ({
                merchandiseId: l.variantId,
                quantity: l.quantity,
              })),
            },
          },
        }),
      },
    );
    if (res.data.cartCreate.userErrors.length)
      throw Error("Shopify cart rejected");
    return res.data.cartCreate.cart;
  }
}
export interface EspProvider {
  listTemplates(): Promise<any[]>;
  exportDraft(
    name: string,
    html: string,
    expectedVersion?: number,
    id?: string,
  ): Promise<any>;
}
export class SandboxKlaviyo implements EspProvider {
  constructor(
    private db: Queryable,
    private org: string,
  ) {}
  async listTemplates() {
    return (
      await this.db.query(
        "SELECT * FROM entities WHERE organization_id=$1 AND kind='provider-template' ORDER BY updated_at DESC",
        [this.org],
      )
    ).rows;
  }
  async exportDraft(
    name: string,
    html: string,
    expectedVersion?: number,
    id?: string,
  ) {
    if (id) {
      const old = await entity(this.db, this.org, "provider-template", id);
      if (old.revision !== expectedVersion)
        throw Object.assign(
          Error(
            "Provider template changed; review and reload before exporting",
          ),
          { statusCode: 409 },
        );
    }
    return putEntity(
      this.db,
      this.org,
      "provider-template",
      name,
      { html, mode: "sandbox", updatedBy: "inboxflow" },
      id,
      "draft",
    );
  }
}
export class KlaviyoProvider implements EspProvider {
  constructor(
    private key: string,
    private revision = "2026-07-15",
  ) {}
  private request(path: string, options: RequestInit = {}) {
    return providerRequest(`https://a.klaviyo.com/api/${path}`, {
      ...options,
      headers: {
        Authorization: `Klaviyo-API-Key ${this.key}`,
        revision: this.revision,
        accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        ...options.headers,
      },
    });
  }
  async listTemplates() {
    const all: any[] = [];
    let next = "templates/";
    for (let i = 0; i < 100; i++) {
      const result = await this.request(next);
      all.push(...result.data);
      if (!result.links?.next) return all;
      const u = new URL(result.links.next);
      if (
        u.origin !== "https://a.klaviyo.com" ||
        !u.pathname.startsWith("/api/templates")
      )
        throw Error("Invalid provider pagination URL");
      next = u.pathname.slice(5) + u.search;
    }
    throw Error("Template pagination exceeded safety limit");
  }
  async exportDraft(
    name: string,
    html: string,
    _expectedVersion?: number,
    id?: string,
  ) {
    if (id)
      throw Error(
        "Live overwrites are disabled; export a new draft to avoid conflicts",
      );
    return this.request("templates/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "template",
          attributes: { name, editor_type: "CODE", html },
        },
      }),
    });
  }
  listFlows() {
    return this.request("flows/");
  }
  listCampaigns() {
    return this.request("campaigns/");
  }
  syncProfile(email: string, properties: Record<string, unknown>) {
    return this.request("profile-import/", {
      method: "POST",
      body: JSON.stringify({
        data: { type: "profile", attributes: { email, properties } },
      }),
    });
  }
}
export type SubscriptionAction =
  | "skip"
  | "delay"
  | "quantity"
  | "swap"
  | "plan"
  | "one-time"
  | "reactivate"
  | "ship-now";
export interface SubscriptionProvider {
  get(id: string): Promise<any>;
  act(
    id: string,
    action: SubscriptionAction,
    params: Record<string, any>,
  ): Promise<any>;
}
export class SandboxRecharge implements SubscriptionProvider {
  constructor(
    private db: Queryable,
    private org: string,
  ) {}
  get(id: string) {
    return entity(this.db, this.org, "subscription", id);
  }
  async act(id: string, action: SubscriptionAction, p: Record<string, any>) {
    const sub = await this.get(id);
    const data = structuredClone(sub.data);
    let status = sub.status;
    if (action === "reactivate") {
      if (data.paymentStatus !== "valid")
        throw Object.assign(
          Error("Update your payment arrangement with the merchant first"),
          { statusCode: 422 },
        );
      status = "active";
    } else {
      if (status !== "active")
        throw Object.assign(Error("Subscription is not active"), {
          statusCode: 422,
        });
      if (action === "delay" || action === "skip") {
        const days = action === "skip" ? 30 : Number(p.days);
        if (!Number.isInteger(days) || days < 1 || days > 90)
          throw Object.assign(Error("Choose 1–90 days"), { statusCode: 400 });
        const date = new Date(`${data.nextOrder}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + days);
        data.nextOrder = date.toISOString().slice(0, 10);
      }
      if (action === "quantity") {
        if (
          !Number.isInteger(Number(p.quantity)) ||
          Number(p.quantity) < 1 ||
          Number(p.quantity) > 20
        )
          throw Object.assign(Error("Quantity must be 1–20"), {
            statusCode: 400,
          });
        data.quantity = Number(p.quantity);
      }
      if (action === "swap" || action === "one-time") {
        const v = (
          await this.db.query(
            "SELECT * FROM variants WHERE organization_id=$1 AND id=$2",
            [this.org, p.variantId],
          )
        ).rows[0];
        if (!v || v.inventory < 1)
          throw Object.assign(Error("Variant is unavailable"), {
            statusCode: 422,
          });
        if (action === "swap") {
          data.productId = v.product_id;
          data.variantId = v.id;
        } else
          data.oneTimeItems = [
            ...(data.oneTimeItems || []),
            { variantId: v.id, quantity: 1 },
          ];
      }
      if (action === "plan") {
        if (!["monthly", "biweekly"].includes(p.plan))
          throw Error("Unknown plan");
        data.plan = p.plan;
      }
      if (action === "ship-now") {
        if (data.paymentStatus !== "valid")
          throw Error("Payment arrangement requires attention");
        data.nextOrder = new Date().toISOString().slice(0, 10);
        data.shipmentRequested = true;
      }
    }
    return putEntity(
      this.db,
      this.org,
      "subscription",
      sub.name,
      data,
      id,
      status,
    );
  }
}
export class RechargeProvider implements SubscriptionProvider {
  constructor(private key: string) {}
  private request(path: string, options: RequestInit = {}) {
    return providerRequest(`https://api.rechargeapps.com/${path}`, {
      ...options,
      headers: {
        "X-Recharge-Access-Token": this.key,
        "X-Recharge-Version": "2021-11",
        "Content-Type": "application/json",
      },
    });
  }
  get(id: string) {
    if (!/^\d+$/.test(id)) throw Error("Invalid Recharge ID");
    return this.request(`subscriptions/${id}`);
  }
  async act(id: string, action: SubscriptionAction, p: Record<string, any>) {
    await this.get(id);
    if (action === "reactivate")
      return this.request(`subscriptions/${id}/activate`, { method: "POST" });
    if (action === "delay")
      return this.request(`subscriptions/${id}/set_next_charge_date`, {
        method: "POST",
        body: JSON.stringify({ date: p.date }),
      });
    if (action === "quantity")
      return this.request(`subscriptions/${id}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: p.quantity }),
      });
    throw Error(
      `Recharge ${action} requires store-specific capability verification; use merchant portal`,
    );
  }
}
export function verifyWebhook(raw: Buffer, signature: string, key: string) {
  return equal(
    createHmac("sha256", key).update(raw).digest("base64"),
    signature,
  );
}
export function recommendations(
  products: Product[],
  mode: string,
  options: {
    ids?: string[];
    category?: string;
    exclude?: string[];
    limit?: number;
  } = {},
) {
  const allowed = [
    "manual",
    "best-sellers",
    "collection",
    "previous",
    "related",
    "abandoned",
    "viewed",
    "rules",
  ];
  if (!allowed.includes(mode))
    throw Error("Unsupported recommendation strategy");
  return products
    .filter(
      (p) =>
        p.variants.some((v) => v.inventory > 0) &&
        !options.exclude?.includes(p.id) &&
        (!options.category ||
          p.category === options.category ||
          p.collections?.some(
            (c) => c.id === options.category || c.title === options.category,
          )) &&
        (!["manual", "previous", "abandoned", "viewed"].includes(mode) ||
          options.ids?.includes(p.id)),
    )
    .sort((a, b) =>
      mode === "best-sellers" ? b.rank - a.rank : a.id.localeCompare(b.id),
    )
    .slice(0, options.limit || 6);
}
export async function providerReceipt(
  db: Queryable,
  org: string,
  kind: "review" | "sms",
  payload: unknown,
  id = uid(),
) {
  return putEntity(
    db,
    org,
    `provider-${kind}`,
    `Sandbox ${kind} receipt`,
    { payload, mode: "sandbox" },
    `${id}-receipt`,
    "received",
  );
}
