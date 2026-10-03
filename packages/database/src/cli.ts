import { Database } from "./index.ts";
import { seed } from "./seed.ts";
const db = new Database();
await db.migrate();
if (process.argv[2] === "seed") await seed(db);
console.log(
  process.argv[2] === "seed"
    ? "Seed ready. owner@inboxflow.local / InboxFlowDemo!2026"
    : "Migrations applied",
);
await db.close();
