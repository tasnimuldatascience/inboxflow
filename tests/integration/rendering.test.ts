import { it, expect, beforeAll, afterAll } from "vitest";
import { Database } from "../../packages/database/src/index.ts";
import { seed } from "../../packages/database/src/seed.ts";
import { render } from "../../packages/email-engine/src/index.ts";
import { validateAmp } from "../../packages/email-engine/src/validation.ts";
import {
  newBlock,
  documentSchema,
  blockTypes,
} from "../../packages/shared/src/index.ts";
let db: Database;
beforeAll(async () => {
  db = new Database(undefined, ":memory:");
  await db.migrate();
  await seed(db);
});
afterAll(async () => {
  await db.close();
});
it("all supported block types produce officially valid AMP4EMAIL documents", async () => {
  const products = (
    await db.query(
      "SELECT data FROM products WHERE organization_id='org-meadow'",
    )
  ).rows.map((p) => p.data);
  const form = (
    await db.query(
      "SELECT data FROM entities WHERE organization_id='org-meadow' AND id='form-ritual'",
    )
  ).rows[0].data;
  for (const type of blockTypes) {
    const b = {
      ...newBlock(type, "block-test"),
      productIds: ["product-1", "product-2"],
      formId: "form-ritual",
    };
    const doc = documentSchema.parse({
      name: type,
      subject: "Test email",
      blocks: [b, newBlock("footer")],
    });
    const result = render(doc, {
      baseUrl: "https://inboxflow.example",
      apiUrl: "https://api.inboxflow.example",
      products,
      forms: { "form-ritual": form },
      links: { "block-test": "https://inboxflow.example/experience?token=x" },
      tokens: { "block-test": "x" },
      subscriber: true,
    });
    const validation = await validateAmp(result.amp);
    expect(
      validation.status,
      `${type}: ${JSON.stringify(validation.errors)}`,
    ).toBe("PASS");
    expect(result.htmlValid).toBe(true);
  }
});
