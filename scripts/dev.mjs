import { spawn } from "node:child_process";
const bin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [
  spawn(bin, ["start:api"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
  spawn(bin, ["--filter", "@inboxflow/web", "dev"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
];
const stop = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", stop));
