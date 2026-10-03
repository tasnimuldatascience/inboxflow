import { z } from "zod";

export const roles = ["owner", "admin", "editor", "analyst", "viewer"] as const;
export const blockTypes = [
  "heading",
  "paragraph",
  "image",
  "button",
  "divider",
  "spacer",
  "columns",
  "hero",
  "footer",
  "product",
  "product-grid",
  "product-carousel",
  "cart",
  "subscription",
  "reactivation",
  "swap",
  "action",
  "form",
  "quiz",
  "review",
  "sms",
  "image-carousel",
  "flip",
  "reveal",
  "spin",
  "animation",
] as const;
const color = z.string().regex(/^#[\da-fA-F]{6}$/);
export const safeUrl = z
  .string()
  .max(2000)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      );
    } catch {
      return v.startsWith("/") && !v.startsWith("//");
    }
  }, "Use an HTTP(S) or relative URL");
export const blockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(blockTypes),
  content: z.string().max(10000).default(""),
  url: safeUrl.optional(),
  productIds: z.array(z.string()).max(24).default([]),
  formId: z.string().optional(),
  style: z
    .object({
      color: color.default("#173f35"),
      background: color.default("#ffffff"),
      padding: z.number().int().min(0).max(80).default(24),
      fontSize: z.number().int().min(10).max(72).default(18),
      radius: z.number().int().min(0).max(40).default(8),
      align: z.enum(["left", "center", "right"]).default("left"),
      height: z.number().int().min(10).max(800).default(160),
    })
    .default({
      color: "#173f35",
      background: "#ffffff",
      padding: 24,
      fontSize: 18,
      radius: 8,
      align: "left",
      height: 160,
    }),
  visibility: z.enum(["all", "subscribers", "non-subscribers"]).default("all"),
  success: z.string().max(500).default("Thanks! Your action is complete."),
  failure: z.string().max(500).default("Please try again."),
  confirmation: z.string().max(500).default("Please confirm this change."),
});
export const documentSchema = z
  .object({
    name: z.string().min(1).max(120),
    subject: z.string().min(1).max(200),
    preheader: z.string().max(250).default(""),
    theme: z
      .object({
        background: color.default("#f1f4f0"),
        accent: color.default("#c7eb70"),
        width: z.number().int().min(320).max(800).default(600),
      })
      .default({ background: "#f1f4f0", accent: "#c7eb70", width: 600 }),
    blocks: z.array(blockSchema).max(100),
  })
  .refine(
    (d) => new Set(d.blocks.map((b) => b.id)).size === d.blocks.length,
    "Block IDs must be unique",
  );
export type EmailDocument = z.infer<typeof documentSchema>;
export type EmailBlock = z.infer<typeof blockSchema>;
export type Role = (typeof roles)[number];
export type Product = {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  price: number;
  inventory: number;
  rank: number;
  variants: { id: string; title: string; price: number; inventory: number }[];
  sellingPlans: { id: string; name: string; discount: number }[];
  collections?: { id: string; title: string }[];
};
export const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update"),
    blockId: z.string(),
    patch: blockSchema.partial().omit({ id: true }).strict(),
  }),
  z.object({
    op: z.literal("add"),
    block: blockSchema,
    index: z.number().int().min(0),
  }),
  z.object({ op: z.literal("remove"), blockId: z.string() }),
  z.object({
    op: z.literal("move"),
    blockId: z.string(),
    index: z.number().int().min(0),
  }),
]);
export type EditorOperation = z.infer<typeof operationSchema>;
export function applyOperations(
  doc: EmailDocument,
  ops: EditorOperation[],
): EmailDocument {
  const next = structuredClone(doc);
  for (const raw of ops) {
    const op = operationSchema.parse(raw);
    if (op.op === "add") next.blocks.splice(op.index, 0, op.block);
    else {
      const i = next.blocks.findIndex((b) => b.id === op.blockId);
      if (i < 0) throw Error("Block does not exist");
      if (op.op === "update")
        next.blocks[i] = { ...next.blocks[i], ...op.patch };
      if (op.op === "remove") next.blocks.splice(i, 1);
      if (op.op === "move") {
        const [block] = next.blocks.splice(i, 1);
        next.blocks.splice(op.index, 0, block);
      }
    }
  }
  return documentSchema.parse(next);
}
export function newBlock(
  type: EmailBlock["type"],
  id: string = crypto.randomUUID(),
): EmailBlock {
  return blockSchema.parse({
    id,
    type,
    content:
      (
        {
          heading: "A little something for you",
          paragraph: "Make your next inbox moment matter.",
          hero: "Good things, delivered.",
          button: "Explore the collection",
          footer:
            "You are receiving this because you opted in. Manage your preferences.",
          subscription: "Your next delivery",
          reactivation: "Welcome back",
          review: "How did we do?",
          form: "Tell us what you think",
          spin: "Discover your reward",
          reveal: "A surprise inside",
          flip: "Turn over a new leaf",
        } as Record<string, string>
      )[type] || type.replaceAll("-", " "),
  });
}
export const questionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  type: z.enum(["single", "multi", "short", "long", "rating", "phone"]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(100)).max(20).default([]),
  showWhen: z.object({ questionId: z.string(), equals: z.string() }).optional(),
  profileProperty: z
    .string()
    .regex(/^[a-zA-Z][\w]{0,63}$/)
    .optional(),
});
export const formSchema = z
  .object({
    name: z.string().min(1).max(120),
    questions: z.array(questionSchema).min(1).max(30),
    success: z.string().max(500).default("Thank you for sharing!"),
    outcomes: z
      .array(
        z.object({
          questionId: z.string(),
          equals: z.string(),
          result: z.string().max(300),
        }),
      )
      .default([]),
  })
  .refine(
    (f) => new Set(f.questions.map((q) => q.id)).size === f.questions.length,
    "Question IDs must be unique",
  )
  .refine(
    (f) =>
      f.questions.every(
        (q, i) =>
          !q.showWhen ||
          f.questions
            .slice(0, i)
            .some((prev) => prev.id === q.showWhen!.questionId),
      ),
    "Conditions must reference an earlier question",
  );
export type FormDocument = z.infer<typeof formSchema>;
export function validateAnswers(
  form: FormDocument,
  answers: Record<string, unknown>,
) {
  const clean: Record<string, unknown> = {};
  for (const q of form.questions) {
    if (q.showWhen && answers[q.showWhen.questionId] !== q.showWhen.equals)
      continue;
    const a = answers[q.id];
    if (a === undefined || a === "" || (Array.isArray(a) && !a.length)) {
      if (q.required) throw Error(`${q.label} is required`);
      continue;
    }
    if (
      q.type === "single" &&
      (typeof a !== "string" || !q.options.includes(a))
    )
      throw Error("Invalid selection");
    if (
      q.type === "multi" &&
      (!Array.isArray(a) ||
        a.some((v) => !q.options.includes(v)) ||
        new Set(a).size !== a.length)
    )
      throw Error("Invalid multiple selection");
    if (
      q.type === "rating" &&
      (typeof a !== "number" || !Number.isInteger(a) || a < 1 || a > 5)
    )
      throw Error("Rating must be 1–5");
    if (
      ["short", "long", "phone"].includes(q.type) &&
      (typeof a !== "string" || a.length > 5000)
    )
      throw Error("Invalid text");
    if (q.type === "phone" && !/^\+[1-9]\d{7,14}$/.test(a as string))
      throw Error("Phone must use international format");
    clean[q.id] = a;
  }
  return clean;
}
