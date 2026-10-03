import type { Queryable } from "./index.ts";
/** Consent evidence and audit records are retained until an explicit privacy request. */
export async function retention(db: Queryable, org: string, dryRun = true) {
  const tables = ["events", "submissions", "idempotency"] as const;
  const result: Record<string, number> = {};
  const row = (
    await db.query("SELECT settings FROM organizations WHERE id=$1", [org])
  ).rows[0];
  if (!row) throw Error("Organization not found");
  const days = Math.max(
    7,
    Math.min(3650, Number(row.settings.retentionDays) || 365),
  );
  for (const table of tables) {
    const clause =
      "organization_id=$1 AND created_at<now()-($2::int*interval '1 day')";
    result[table] = (
      await db.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${clause}`,
        [org, days],
      )
    ).rows[0].n;
    if (!dryRun)
      await db.query(`DELETE FROM ${table} WHERE ${clause}`, [org, days]);
  }
  result.tokens = (
    await db.query(
      "SELECT count(*)::int AS n FROM action_tokens WHERE organization_id=$1 AND expires_at<now()-interval '1 day'",
      [org],
    )
  ).rows[0].n;
  if (!dryRun)
    await db.query(
      "DELETE FROM action_tokens WHERE organization_id=$1 AND expires_at<now()-interval '1 day'",
      [org],
    );
  return { organization: org, days, dryRun, counts: result };
}
