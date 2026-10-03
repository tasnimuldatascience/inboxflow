import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().default(4000),
  APP_URL: z.url().default("http://localhost:3000"),
  PUBLIC_API_URL: z.url().default("http://localhost:4000"),
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default(".data/postgres"),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("local-only-change-before-production-0123456789"),
  CREDENTIAL_KEY: z
    .string()
    .min(32)
    .default("local-only-encryption-change-before-production-012345"),
  DEMO_MODE: z.enum(["true", "false"]).default("true"),
  EMAIL_SENDER: z.email().default("demo@inboxflow.example"),
  REDIS_URL: z.string().optional(),
});
export const config = schema.parse(process.env);
if (
  config.NODE_ENV === "production" &&
  (config.SESSION_SECRET.startsWith("local-only") ||
    config.CREDENTIAL_KEY.startsWith("local-only") ||
    !config.DATABASE_URL ||
    config.DEMO_MODE === "true" ||
    !config.APP_URL.startsWith("https://"))
)
  throw Error(
    "Production requires independent secrets, PostgreSQL, HTTPS, and DEMO_MODE=false",
  );
