import { Database } from "../../../packages/database/src/index.ts";
import { config } from "../../../packages/configuration/src/index.ts";
import { ShopifyProvider } from "../../../packages/integrations/src/index.ts";
import { decrypt } from "../../../packages/shared/src/security.ts";
import { Queue, Worker } from "bullmq";
import { replaceCatalog } from "../../../packages/integrations/src/catalog.ts";
import { retention } from "../../../packages/database/src/maintenance.ts";
const db = new Database();
if (!config.DATABASE_URL)
  throw Error(
    "Standalone worker requires PostgreSQL. Embedded demo processes sandbox jobs inline.",
  );
await db.migrate();
async function processJob(id: string) {
  const job = (await db.query("SELECT * FROM jobs WHERE id=$1", [id])).rows[0];
  if (!job || job.status === "completed") return;
  try {
    if (job.kind === "shopify-sync") {
      const conn = (
        await db.query(
          "SELECT * FROM connections WHERE organization_id=$1 AND provider='shopify' AND status='connected'",
          [job.organization_id],
        )
      ).rows[0];
      if (conn?.mode === "live") {
        const products = await new ShopifyProvider(
          conn.metadata.shop,
          decrypt(conn.credential, config.CREDENTIAL_KEY),
        ).listProducts();
        await db.transaction(async (tx) => {
          await replaceCatalog(tx, job.organization_id, products);
        });
      }
    } else throw Error("Unsupported job kind");
    await db.query(
      "UPDATE jobs SET status='completed',updated_at=now() WHERE id=$1",
      [id],
    );
  } catch {
    await db.query(
      "UPDATE jobs SET status=CASE WHEN attempts>=4 THEN 'dead-letter' ELSE 'queued' END,last_error='Provider synchronization failed',run_at=now()+interval '30 seconds',updated_at=now() WHERE id=$1",
      [id],
    );
    throw Error("Provider synchronization failed");
  }
}
let busy = false;
let lastRetention = 0;
const redis = config.REDIS_URL ? new URL(config.REDIS_URL) : null;
const connection = redis
  ? {
      host: redis.hostname,
      port: Number(redis.port || 6379),
      password: redis.password || undefined,
    }
  : null;
const queue = connection ? new Queue("inboxflow", { connection }) : null;
const worker = connection
  ? new Worker("inboxflow", (job) => processJob(job.data.id), {
      connection,
      concurrency: 2,
    })
  : null;
worker?.on("error", (e) => console.error(e.message));
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const jobs = await db.transaction(async (tx) => {
      const rows = (
        await tx.query(
          "SELECT id FROM jobs WHERE status='queued' AND run_at<=now() ORDER BY run_at LIMIT 10 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const r of rows)
        await tx.query(
          "UPDATE jobs SET status='running',attempts=attempts+1,updated_at=now() WHERE id=$1",
          [r.id],
        );
      return rows;
    });
    for (const job of jobs) {
      if (queue)
        await queue.add(
          "sync",
          { id: job.id },
          {
            jobId: job.id,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      else
        try {
          await processJob(job.id);
        } catch {
          /* Persisted in jobs; next poll retries. */
        }
    }
    await db.query(
      "UPDATE jobs SET status='queued' WHERE status='running' AND updated_at<now()-interval '10 minutes'",
    );
    if (Date.now() - lastRetention > 86400000) {
      for (const row of (await db.query("SELECT id FROM organizations")).rows)
        await db.transaction((tx) => retention(tx, row.id, false));
      lastRetention = Date.now();
    }
  } catch {
    console.error("Worker polling failed; persisted jobs will be retried.");
  } finally {
    busy = false;
  }
}, 3000);
console.log(
  "InboxFlow worker started with PostgreSQL outbox" +
    (queue ? " and BullMQ" : " polling"),
);
const stop = async () => {
  clearInterval(timer);
  await worker?.close();
  await queue?.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
