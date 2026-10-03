import { describe, it, expect } from "vitest";
import {
  documentSchema,
  newBlock,
  applyOperations,
  formSchema,
  validateAnswers,
} from "../../packages/shared/src/index.ts";
import { render, mime } from "../../packages/email-engine/src/index.ts";
import { DeterministicRefine } from "../../packages/interactive-blocks/src/refine.ts";
import {
  assign,
  wilson,
  analyticsAnswer,
} from "../../packages/analytics/src/index.ts";
import {
  encrypt,
  decrypt,
  verifyPassword,
  passwordHash,
} from "../../packages/shared/src/security.ts";
import {
  recommendations,
  verifyWebhook,
  KlaviyoProvider,
  ShopifyProvider,
  providerRequest,
} from "../../packages/integrations/src/index.ts";
import { createHmac } from "node:crypto";
const doc = documentSchema.parse({
  name: "Test",
  subject: "Hello",
  blocks: [newBlock("heading", "headline"), newBlock("footer", "footer")],
});
const context = {
  baseUrl: "https://inboxflow.example",
  apiUrl: "https://api.inboxflow.example",
  products: [],
  forms: {},
  links: {},
  tokens: {},
};
describe("document and renderer contracts", () => {
  it("rejects invalid URL schemes, CSS values, and duplicate IDs", () => {
    expect(() =>
      documentSchema.parse({
        ...doc,
        blocks: [{ ...newBlock("image"), url: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      documentSchema.parse({
        ...doc,
        blocks: [
          {
            ...newBlock("heading"),
            style: {
              ...newBlock("heading").style,
              color: "red;position:fixed",
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      documentSchema.parse({ ...doc, blocks: [doc.blocks[0], doc.blocks[0]] }),
    ).toThrow();
  });
  it("renders safe HTML, AMP, plaintext and correctly encoded MIME parts", () => {
    const unsafe = {
      ...doc,
      blocks: [
        { ...doc.blocks[0], content: '<script>alert("x")</script>' },
        doc.blocks[1],
      ],
    };
    const out = render(unsafe, context);
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.htmlValid).toBe(true);
    expect(out.amp).toContain("amp4email");
    expect(out.text).toContain("<script>");
    const eml = mime("Hello", "sender@example.test", "buyer@example.test", out);
    expect(eml).toContain("multipart/alternative");
    expect(eml).toContain("text/x-amp-html");
    expect(eml).toContain("text/plain");
    expect(eml).toContain("text/html");
    expect(() =>
      mime("Hi", "sender\r\nBCC: stolen@example.test", "x@example.test", out),
    ).toThrow();
  });
  it("does not expose subscriber-only blocks without resolved context", () => {
    const out = render(
      {
        ...doc,
        blocks: [
          {
            ...doc.blocks[0],
            visibility: "subscribers",
            content: "PRIVATE OFFER",
          },
          doc.blocks[1],
        ],
      },
      context,
    );
    expect(out.html).not.toContain("PRIVATE OFFER");
    expect(out.warnings.some((w) => w.includes("Conditional"))).toBe(true);
  });
  it("validates typed operations and supports inverse restore", () => {
    const changed = applyOperations(doc, [
      { op: "update", blockId: "headline", patch: { content: "New headline" } },
      { op: "move", blockId: "footer", index: 0 },
    ]);
    expect(changed.blocks[0].id).toBe("footer");
    expect(changed.blocks[1].content).toBe("New headline");
    expect(doc.blocks[0].content).not.toBe("New headline");
    expect(() =>
      applyOperations(doc, [{ op: "remove", blockId: "missing" }]),
    ).toThrow();
  });
  it("produces useful deterministic Refine suggestions without pretending to use a model", async () => {
    const p = await new DeterministicRefine().suggest(
      "headline: New day",
      doc,
      "headline",
    );
    expect(p.mode).toContain("Deterministic");
    expect(applyOperations(doc, p.operations).blocks[0].content).toBe(
      "New day",
    );
  });
});
describe("forms, analytics and security primitives", () => {
  it("paginates Shopify variants and keeps selling-plan/collection contracts without claiming computed live discounts", async () => {
    const old = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      const pageInfo = { hasNextPage: false, endCursor: null };
      return new Response(
        JSON.stringify(
          calls === 1
            ? {
                data: {
                  products: {
                    pageInfo,
                    nodes: [
                      {
                        id: "gid://shopify/Product/1",
                        title: "Provider fixture",
                        description: "Test",
                        productType: "Nutrition",
                        variants: {
                          nodes: [
                            {
                              id: "first",
                              title: "First",
                              price: "24.00",
                              inventoryQuantity: 2,
                            },
                          ],
                          pageInfo: { hasNextPage: true, endCursor: "next" },
                        },
                        collections: {
                          nodes: [{ id: "collection-1", title: "Essentials" }],
                          pageInfo,
                        },
                        sellingPlanGroups: {
                          pageInfo,
                          nodes: [
                            {
                              sellingPlans: {
                                nodes: [{ id: "plan-1", name: "Monthly" }],
                                pageInfo,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              }
            : {
                data: {
                  product: {
                    variants: {
                      nodes: [
                        {
                          id: "second",
                          title: "Second",
                          price: "35.00",
                          inventoryQuantity: 3,
                        },
                      ],
                      pageInfo,
                    },
                  },
                },
              },
        ),
        { status: 200 },
      );
    }) as any;
    try {
      const products = await new ShopifyProvider(
        "fixture.myshopify.com",
        "fake-key",
      ).listProducts();
      expect(calls).toBe(2);
      expect(products[0].variants).toHaveLength(2);
      expect(products[0].inventory).toBe(5);
      expect(products[0].sellingPlans[0].discount).toBe(0);
      expect(
        recommendations(products, "collection", { category: "collection-1" }),
      ).toHaveLength(1);
    } finally {
      globalThis.fetch = old;
    }
  });
  const form = formSchema.parse({
    name: "Quiz",
    questions: [
      {
        id: "goal",
        label: "Goal",
        type: "single",
        required: true,
        options: ["Calm", "Energy"],
      },
      {
        id: "why",
        label: "Why",
        type: "short",
        required: true,
        showWhen: { questionId: "goal", equals: "Calm" },
      },
    ],
  });
  it("applies branching and removes hidden responses", () => {
    expect(validateAnswers(form, { goal: "Energy", why: "hidden" })).toEqual({
      goal: "Energy",
    });
    expect(() => validateAnswers(form, { goal: "Calm" })).toThrow("required");
    expect(() => validateAnswers(form, { goal: "Unknown" })).toThrow();
  });
  it("rejects circular and forward question conditions", () => {
    expect(() =>
      formSchema.parse({
        ...form,
        questions: [
          {
            ...form.questions[0],
            showWhen: { questionId: "why", equals: "x" },
          },
          form.questions[1],
        ],
      }),
    ).toThrow();
  });
  it("assigns stable cohorts and bounds confidence intervals for empty and full samples", () => {
    expect(assign("test", "buyer", "salt")).toBe(
      assign("test", "buyer", "salt"),
    );
    for (const n of [0, 1, 100]) {
      const ci = wilson(n, n);
      expect(ci.low).toBeGreaterThanOrEqual(-1e-10);
      expect(ci.high).toBeLessThanOrEqual(1 + 1e-10);
    }
    expect(wilson(10, 100).rate).toBe(0.1);
  });
  it("hashes passwords and authenticates encrypted credentials", () => {
    const stored = passwordHash("SecurePassword123!");
    expect(verifyPassword("SecurePassword123!", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
    const enc = encrypt("provider-secret", "key-for-testing");
    expect(enc).not.toContain("provider-secret");
    expect(decrypt(enc, "key-for-testing")).toBe("provider-secret");
    expect(() => decrypt(enc, "wrong-key")).toThrow();
  });
  it("requires verified raw webhook signatures", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = createHmac("sha256", "key").update(raw).digest("base64");
    expect(verifyWebhook(raw, sig, "key")).toBe(true);
    expect(verifyWebhook(Buffer.from('{"a":2}'), sig, "key")).toBe(false);
  });
  it("rejects provider SSRF and records real adapter contracts", async () => {
    await expect(providerRequest("http://127.0.0.1/admin")).rejects.toThrow(
      "not allowed",
    );
    expect(() => new ShopifyProvider("evil.example/path", "key")).toThrow();
    const calls: any[] = [];
    const old = globalThis.fetch;
    globalThis.fetch = (async (url: any, options: any) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({ data: [{ id: "template-x" }], links: { next: null } }),
        { status: 200 },
      );
    }) as any;
    try {
      const adapter = new KlaviyoProvider("test-key");
      expect(await adapter.listTemplates()).toEqual([{ id: "template-x" }]);
      expect(calls[0].options.headers.revision).toBe("2026-07-15");
      expect(calls[0].options.headers.Authorization).toBe(
        "Klaviyo-API-Key test-key",
      );
      await expect(
        adapter.exportDraft("name", "<p>x</p>", 1, "existing"),
      ).rejects.toThrow("overwrites");
    } finally {
      globalThis.fetch = old;
    }
  });
  it("filters unavailable recommendations and honors exclusions deterministically", () => {
    const ps = [
      { id: "a", rank: 2, category: "Wellness", variants: [{ inventory: 1 }] },
      { id: "b", rank: 5, category: "Wellness", variants: [{ inventory: 0 }] },
      { id: "c", rank: 1, category: "Pantry", variants: [{ inventory: 1 }] },
    ] as any;
    expect(
      recommendations(ps, "best-sellers", { exclude: ["c"] }).map((p) => p.id),
    ).toEqual(["a"]);
  });
  it("read-only analytics never executes user SQL", () => {
    const data = {
      interactions: 1,
      revenue: 1200,
      demo: true,
      counts: { subscription_reactivated: 2 },
      campaigns: [],
    } as any;
    expect(analyticsAnswer("DROP TABLE users", data).metric).toBe(
      "interactions",
    );
    expect(analyticsAnswer("revenue", data).answer).toContain("$12.00");
  });
});
