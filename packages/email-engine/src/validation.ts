import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const validator = require("amphtml-validator");
let instance: Promise<any> | undefined;
export async function validateAmp(amp: string) {
  try {
    instance ??= validator.getInstance(
      process.env.AMP_VALIDATOR_PATH ||
        fileURLToPath(
          new URL("../../../infra/amp/validator.js", import.meta.url),
        ),
    );
    const result = (await instance).validateString(amp, "AMP4EMAIL");
    return {
      status: result.status as string,
      errors: result.errors.map((e: any) => ({
        severity: e.severity,
        line: e.line,
        col: e.col,
        message: e.message,
      })),
    };
  } catch {
    instance = undefined;
    return {
      status: "UNVERIFIED",
      errors: [
        {
          severity: "ERROR",
          line: 0,
          col: 0,
          message:
            "Official AMP validator unavailable; no AMP validation success claimed.",
        },
      ],
    };
  }
}
