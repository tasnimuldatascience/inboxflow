import type { Queryable } from "../../../packages/database/src/index.ts";
import { fail } from "./services.ts";
export const planLimits = { starter: 10, growth: 100, scale: 1000 };
export async function templateQuota(db: Queryable, org: string) {
  const record = (
    await db.query(
      "SELECT data FROM entities WHERE organization_id=$1 AND kind='billing' LIMIT 1",
      [org],
    )
  ).rows[0];
  const plan = (record?.data.plan as keyof typeof planLimits) || "starter";
  const active = (
    await db.query(
      "SELECT count(*)::int AS n FROM templates WHERE organization_id=$1 AND status='published'",
      [org],
    )
  ).rows[0].n;
  return { plan, limit: planLimits[plan] || 10, active };
}
export async function publishingAllowed(
  db: Queryable,
  org: string,
  id: string,
) {
  await db.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [org]);
  const quota = await templateQuota(db, org);
  const current = (
    await db.query(
      "SELECT status FROM templates WHERE organization_id=$1 AND id=$2",
      [org, id],
    )
  ).rows[0];
  if (current?.status !== "published" && quota.active >= quota.limit)
    fail(
      "Your plan has reached its published-template limit. Archive a published template or change your sandbox plan.",
      422,
    );
}
