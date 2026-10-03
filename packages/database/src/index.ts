import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../../configuration/src/index.ts";
export type Row = Record<string, any>;
export interface Queryable {
  query<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export class Database implements Queryable {
  private local?: PGlite;
  private pool?: pg.Pool;
  private queue = Promise.resolve();
  private context = new AsyncLocalStorage<Queryable>();
  constructor(url = config.DATABASE_URL, path = config.DATA_DIR) {
    if (url)
      this.pool = new pg.Pool({
        connectionString: url,
        max: 10,
        statement_timeout: 10000,
      });
    else {
      if (path !== ":memory:")
        mkdirSync(dirname(resolve(path)), { recursive: true });
      this.local = new PGlite(path === ":memory:" ? undefined : resolve(path));
    }
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((r) => (release = r));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async query<T extends Row = Row>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    const active = this.context.getStore();
    if (active) return active.query<T>(sql, params);
    if (this.pool) return this.pool.query(sql, params);
    return this.exclusive(() => this.local!.query<T>(sql, params));
  }
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    if (this.context.getStore()) return fn(this.context.getStore()!);
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const result = await this.context.run(client, () => fn(client));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    return this.exclusive(() =>
      this.local!.transaction((tx) => this.context.run(tx, () => fn(tx))),
    );
  }
  async migrate() {
    const sql = await readFile(
      fileURLToPath(new URL("../migrations/001_initial.sql", import.meta.url)),
      "utf8",
    );
    if (this.pool) await this.pool.query(sql);
    else await this.local!.exec(sql);
  }
  async close() {
    if (this.pool) await this.pool.end();
    else await this.local!.close();
  }
}
export const uid = (): string => crypto.randomUUID();
export async function entity(
  db: Queryable,
  org: string,
  kind: string,
  id: string,
) {
  const row = (
    await db.query(
      "SELECT * FROM entities WHERE organization_id=$1 AND kind=$2 AND id=$3",
      [org, kind, id],
    )
  ).rows[0];
  if (!row) throw Object.assign(Error("Record not found"), { statusCode: 404 });
  return row;
}
export async function putEntity(
  db: Queryable,
  org: string,
  kind: string,
  name: string,
  data: unknown,
  id = uid(),
  status = "draft",
) {
  const row = (
    await db.query(
      "INSERT INTO entities(organization_id,id,kind,name,data,status) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(organization_id,id) DO UPDATE SET name=$4,data=$5,status=$6,revision=entities.revision+1,updated_at=now() WHERE entities.kind=$3 RETURNING *",
      [org, id, kind, name, JSON.stringify(data), status],
    )
  ).rows[0];
  if (!row)
    throw Object.assign(Error("Record identity conflicts with another type"), {
      statusCode: 409,
    });
  return row;
}
