import { createHash } from "node:crypto";
import type { Queryable } from "../../database/src/index.ts";
export function assign(experiment: string, recipient: string, salt: string) {
  return createHash("sha256")
    .update(`${experiment}:${salt}:${recipient}`)
    .digest()
    .readUInt32BE(0) % 2
    ? "treatment"
    : "control";
}
export function wilson(success: number, total: number) {
  if (!total) return { rate: 0, low: 0, high: 1 };
  const p = success / total,
    z = 1.96,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / d;
  return { rate: p, low: c - h, high: c + h };
}
export async function metrics(db: Queryable, org: string) {
  const events = (
    await db.query(
      "SELECT * FROM events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 10000",
      [org],
    )
  ).rows;
  const sums: Record<string, number> = {};
  const series: Record<
    string,
    { date: string; interactions: number; revenue: number }
  > = {};
  const campaigns: Record<
    string,
    { id: string; interactions: number; conversions: number; revenue: number }
  > = {};
  let revenue = 0;
  const blocks: Record<
    string,
    { id: string; interactions: number; revenue: number }
  > = {};
  for (const e of events) {
    sums[e.event_type] = (sums[e.event_type] || 0) + 1;
    const date = new Date(e.created_at).toISOString().slice(0, 10);
    series[date] ??= { date, interactions: 0, revenue: 0 };
    const interactive = ![
      "email_sent",
      "email_opened",
      "email_clicked",
    ].includes(e.event_type);
    if (interactive) series[date].interactions++;
    const amount = e.event_type === "purchase_confirmed" ? e.revenue : 0;
    revenue += amount;
    series[date].revenue += amount;
    const id = e.campaign_id || "Unassigned";
    campaigns[id] ??= { id, interactions: 0, conversions: 0, revenue: 0 };
    campaigns[id].interactions += interactive ? 1 : 0;
    campaigns[id].conversions += [
      "purchase_confirmed",
      "subscription_reactivated",
    ].includes(e.event_type)
      ? 1
      : 0;
    campaigns[id].revenue += amount;
    if (e.block_id) {
      blocks[e.block_id] ??= { id: e.block_id, interactions: 0, revenue: 0 };
      blocks[e.block_id].interactions += interactive ? 1 : 0;
      blocks[e.block_id].revenue += amount;
    }
  }
  const sent = events.filter((e) => e.event_type === "email_sent");
  const delivered = new Set(
    sent.map((e) => `${e.message_id}:${e.recipient_id}`),
  );
  const engaged = new Set(
    events
      .filter(
        (e) =>
          !["email_sent", "email_opened", "email_clicked"].includes(
            e.event_type,
          ) && delivered.has(`${e.message_id}:${e.recipient_id}`),
      )
      .map((e) => `${e.message_id}:${e.recipient_id}`),
  );
  return {
    demo: events.some((e) => e.demo),
    eventCount: events.length,
    interactions: events.filter(
      (e) =>
        !["email_sent", "email_opened", "email_clicked"].includes(e.event_type),
    ).length,
    revenue,
    currency: "USD",
    engagementRate: delivered.size ? engaged.size / delivered.size : null,
    sends: sent.length,
    counts: sums,
    blocks: Object.values(blocks),
    series: Object.values(series).sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: Object.values(campaigns).sort(
      (a, b) => b.conversions - a.conversions,
    ),
    recent: events.slice(0, 20),
    window: "Most recent 10,000 events; seeded demo range: September 2026",
  };
}
export function analyticsAnswer(
  question: string,
  data: Awaited<ReturnType<typeof metrics>>,
) {
  const q = question.toLowerCase();
  if (/revenue|sales/.test(q))
    return {
      answer: `Confirmed ${data.demo ? "sandbox " : ""}transaction revenue is $${(data.revenue / 100).toFixed(2)} USD across the loaded event window. This is attribution, not causal lift.`,
      metric: "revenue",
      value: data.revenue,
      rows: data.campaigns,
    };
  if (/reactivat/.test(q))
    return {
      answer: `${data.counts.subscription_reactivated || 0} subscription reactivations were recorded.`,
      metric: "subscription_reactivated",
      value: data.counts.subscription_reactivated || 0,
      rows: data.campaigns,
    };
  if (/campaign|conversion|compare/.test(q))
    return {
      answer:
        "Campaigns are ranked by confirmed purchase and subscription reactivation events.",
      metric: "conversions",
      rows: data.campaigns,
    };
  return {
    answer: `${data.interactions} interactions were recorded. Available questions cover revenue, campaigns, conversions, and reactivations in the loaded event window.`,
    metric: "interactions",
    value: data.interactions,
    rows: data.campaigns,
  };
}
