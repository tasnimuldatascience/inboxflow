import type { Queryable } from "../../database/src/index.ts";
import type { Product } from "../../shared/src/index.ts";
/** Caller holds a transaction; only publish after a complete provider read succeeds. */
export async function replaceCatalog(
  db: Queryable,
  org: string,
  products: Product[],
) {
  for (const p of products) {
    await db.query(
      "INSERT INTO products(organization_id,id,provider_id,title,data) VALUES($1,$2,$2,$3,$4) ON CONFLICT(organization_id,id) DO UPDATE SET title=$3,data=$4,synced_at=now()",
      [org, p.id, p.title, JSON.stringify(p)],
    );
    for (const v of p.variants)
      await db.query(
        "INSERT INTO variants VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,id) DO UPDATE SET title=$4,price=$5,inventory=$6",
        [org, v.id, p.id, v.title, v.price, v.inventory],
      );
    await db.query(
      "DELETE FROM variants WHERE organization_id=$1 AND product_id=$2 AND NOT(id=ANY($3::text[]))",
      [org, p.id, p.variants.map((v) => v.id)],
    );
  }
  await db.query(
    "DELETE FROM products WHERE organization_id=$1 AND NOT(id=ANY($2::text[]))",
    [org, products.map((p) => p.id)],
  );
}
