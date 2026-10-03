import { buildApp } from "./app.ts";
import { config } from "../../../packages/configuration/src/index.ts";
const { app } = await buildApp({ logger: true });
await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
const close = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
