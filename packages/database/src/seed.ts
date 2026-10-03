import { Database, putEntity, uid } from "./index.ts";
import { passwordHash, hash } from "../../shared/src/security.ts";
import { documentSchema, newBlock } from "../../shared/src/index.ts";
export const DEMO_ORG = "org-meadow";
const names = [
  "Daily greens",
  "Golden oat blend",
  "Calm cacao",
  "Citrus hydration",
  "Morning matcha",
  "Vanilla protein",
  "Berry balance",
  "Sleep botanical",
  "Coconut collagen",
  "Ginger tonic",
  "Almond crunch",
  "Cacao bites",
  "Strawberry protein",
  "Mint hydration",
  "Chai ritual",
  "Peach balance",
  "Lemon tonic",
  "Coffee collagen",
  "Maple oat blend",
  "Blueberry greens",
  "Orange hydration",
  "Hazelnut cacao",
  "Lavender calm",
  "Travel essentials",
];
export async function seed(db: Database) {
  if ((await db.query("SELECT id FROM organizations LIMIT 1")).rows.length)
    return;
  await db.transaction(async (tx) => {
    for (const [id, name] of [
      ["org-meadow", "Meadow & Moss"],
      ["org-studio", "Northstar Studio"],
    ])
      await tx.query(
        "INSERT INTO organizations(id,name,settings) VALUES($1,$2,$3)",
        [
          id,
          name,
          JSON.stringify({
            demo: true,
            liveFlowSync: false,
            retentionDays: 365,
          }),
        ],
      );
    const pwd = passwordHash("InboxFlowDemo!2026");
    for (const [id, email, name, role] of [
      ["user-owner", "owner@inboxflow.local", "Jamie Chen", "owner"],
      ["user-editor", "editor@inboxflow.local", "Alex Rivera", "editor"],
      ["user-analyst", "analyst@inboxflow.local", "Sam Taylor", "analyst"],
      ["user-viewer", "viewer@inboxflow.local", "Morgan Reed", "viewer"],
      ["user-admin", "admin@inboxflow.local", "Casey Brooks", "admin"],
    ]) {
      await tx.query(
        "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
        [id, email, name, pwd],
      );
      await tx.query(
        "INSERT INTO memberships(organization_id,user_id,role) VALUES($1,$2,$3)",
        ["org-meadow", id, role],
      );
    }
    await tx.query(
      "INSERT INTO memberships VALUES('org-studio','user-owner','owner')",
    );
    for (let i = 0; i < 24; i++) {
      const id = `product-${i + 1}`;
      const price = 2400 + i * 125;
      const data = {
        id,
        title: names[i],
        description: "Thoughtfully made essentials for your everyday ritual.",
        category: ["Wellness", "Nutrition", "Pantry"][i % 3],
        image: `/products/product-${i % 6}.svg`,
        price,
        inventory: i === 23 ? 0 : 45 + i * 3,
        rank: 100 - i,
        variants: [
          {
            id: `variant-${i + 1}-1`,
            title: "Original · 30 servings",
            price,
            inventory: i === 23 ? 0 : 45 + i * 3,
          },
          {
            id: `variant-${i + 1}-2`,
            title: "Family · 60 servings",
            price: price + 1600,
            inventory: 22,
          },
        ],
        sellingPlans: [
          { id: "monthly", name: "Every 30 days · save 10%", discount: 10 },
          { id: "biweekly", name: "Every 14 days · save 15%", discount: 15 },
        ],
      };
      await tx.query(
        "INSERT INTO products(organization_id,id,provider_id,title,data) VALUES($1,$2,$3,$4,$5)",
        ["org-meadow", id, id, names[i], JSON.stringify(data)],
      );
      for (const v of data.variants)
        await tx.query("INSERT INTO variants VALUES($1,$2,$3,$4,$5,$6)", [
          "org-meadow",
          v.id,
          id,
          v.title,
          v.price,
          v.inventory,
        ]);
    }
    for (let i = 0; i < 12; i++) {
      const id = `profile-${i + 1}`;
      await putEntity(
        tx,
        "org-meadow",
        "profile",
        `Customer ${i + 1}`,
        {
          email: `customer${i + 1}@example.test`,
          properties: { favorite: "Wellness" },
          pseudonym: hash(id),
          suppressed: false,
          consent: true,
        },
        id,
        "active",
      );
      if (i < 8)
        await putEntity(
          tx,
          "org-meadow",
          "subscription",
          `Monthly ritual ${i + 1}`,
          {
            recipientId: id,
            productId: `product-${i + 1}`,
            variantId: `variant-${i + 1}-1`,
            quantity: 1,
            plan: "monthly",
            nextOrder: "2026-10-15",
            paymentStatus: "valid",
            provider: "sandbox",
            oneTimeItems: [],
          },
          `subscription-${i + 1}`,
          i < 6 ? "active" : "cancelled",
        );
    }
    await putEntity(
      tx,
      "org-meadow",
      "form",
      "Find your daily ritual",
      {
        name: "Find your daily ritual",
        questions: [
          {
            id: "goal",
            label: "What would you like more of?",
            type: "single",
            required: true,
            options: ["Energy", "Calm", "Balance"],
            profileProperty: "wellness_goal",
          },
          {
            id: "routine",
            label: "Tell us about your evening routine",
            type: "short",
            required: true,
            options: [],
            showWhen: { questionId: "goal", equals: "Calm" },
            profileProperty: "evening_routine",
          },
          {
            id: "rating",
            label: "How was your last order?",
            type: "rating",
            required: false,
            options: [],
          },
        ],
        success: "Your next ritual starts here. Thank you!",
        outcomes: [
          {
            questionId: "goal",
            equals: "Calm",
            result: "Try our Sleep botanical ritual.",
          },
        ],
      },
      "form-ritual",
      "published",
    );
    const templates = [
      [
        "template-delivery",
        "Your next delivery, your way",
        "subscription",
        "Upcoming order",
      ],
      [
        "template-welcome",
        "A good day starts here",
        "product-grid",
        "Welcome series",
      ],
      [
        "template-review",
        "Little feedback. Big difference.",
        "review",
        "Review request",
      ],
      ["template-winback", "Your ritual is waiting", "reactivation", "Winback"],
      ["template-survey", "Let’s find your daily ritual", "form", "Survey"],
      ["template-cart", "Still thinking about it?", "cart", "Abandoned cart"],
    ];
    for (const [id, name, type, category] of templates) {
      const doc = documentSchema.parse({
        name,
        subject: name,
        preheader: "Make this moment yours.",
        blocks: [
          {
            ...newBlock("hero", `${id}-hero`),
            content: name,
            style: {
              ...newBlock("hero").style,
              background: "#eaf0df",
              fontSize: 38,
            },
          },
          {
            ...newBlock("paragraph", `${id}-text`),
            content:
              "Good things should fit your life. Take a moment to make your next delivery just right.",
          },
          {
            ...newBlock(type as any, `${id}-main`),
            productIds: ["product-1", "product-2", "product-3"],
            formId: "form-ritual",
          },
          newBlock("footer", `${id}-footer`),
        ],
      });
      await tx.query(
        "INSERT INTO templates(organization_id,id,name,document) VALUES($1,$2,$3,$4)",
        ["org-meadow", id, name, JSON.stringify(doc)],
      );
      await tx.query(
        "INSERT INTO template_versions(organization_id,template_id,revision,document) VALUES($1,$2,1,$3)",
        ["org-meadow", id, JSON.stringify(doc)],
      );
      await putEntity(
        tx,
        "org-meadow",
        "campaign",
        category,
        {
          templateId: id,
          trigger: category,
          eligible: { consent: true },
          provider: "sandbox",
          sends: 200 + iOffset(id),
        },
        `campaign-${id}`,
        "draft",
      );
    }
    for (const trigger of [
      "Welcome series",
      "Abandoned cart recovery",
      "Checkout recovery",
      "Replenishment reminder",
      "Upcoming subscription billing",
      "Subscription upgrade",
      "Subscription winback",
      "Review request",
      "Post-purchase survey",
      "SMS opt-in",
    ])
      await putEntity(
        tx,
        "org-meadow",
        "flow",
        trigger,
        {
          trigger,
          templateId: "template-delivery",
          eligibility: { consent: true, status: "active" },
          provider: "sandbox",
        },
        undefined,
        "draft",
      );
    await putEntity(
      tx,
      "org-meadow",
      "experiment",
      "Delivery reminder · interactive vs. static",
      {
        templateId: "template-delivery",
        metric: "subscription_reactivated",
        salt: "demo-2026",
      },
      "experiment-delivery",
      "active",
    );
    for (let i = 0; i < 200; i++) {
      const recipient = `demo-recipient-${i}`;
      const cohort = i % 2 ? "treatment" : "control";
      await tx.query(
        "INSERT INTO experiment_assignments VALUES($1,$2,$3,$4,$5,$6)",
        [
          "org-meadow",
          "experiment-delivery",
          recipient,
          cohort,
          new Date(Date.UTC(2026, 8, 10)),
          i % 7 === 0 ? new Date(Date.UTC(2026, 8, 11)) : null,
        ],
      );
    }
    const types = [
      "email_sent",
      "product_selected",
      "add_to_cart",
      "subscription_delayed",
      "form_submitted",
      "review_submitted",
      "subscription_reactivated",
      "purchase_confirmed",
      "subscription_skipped",
      "product_swapped",
    ];
    for (let day = 0; day < 30; day++)
      for (let i = 0; i < 12; i++) {
        const type = types[(day + i) % types.length];
        await tx.query(
          "INSERT INTO events(organization_id,id,recipient_id,event_type,template_id,message_id,campaign_id,revenue,demo,created_at,cohort) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)",
          [
            "org-meadow",
            `seed-event-${day}-${i}`,
            hash(`profile-${i + 1}`),
            type,
            "template-delivery",
            `message-${day}`,
            "campaign-template-delivery",
            type === "purchase_confirmed" ? 3200 + i * 100 : 0,
            new Date(Date.UTC(2026, 8, day + 3, 10, i)),
            i % 2 ? "treatment" : "control",
          ],
        );
      }
    for (const p of [
      "shopify",
      "klaviyo",
      "recharge",
      "reviews",
      "sms",
      "billing",
    ])
      await tx.query(
        "INSERT INTO connections(organization_id,provider,mode,status,metadata) VALUES($1,$2,$3,$4,$5)",
        [
          "org-meadow",
          p,
          "sandbox",
          "connected",
          JSON.stringify({
            label: "Local sandbox",
            shop: "meadow-demo",
            syncedAt: new Date().toISOString(),
          }),
        ],
      );
    await putEntity(
      tx,
      "org-meadow",
      "billing",
      "Growth trial",
      {
        plan: "growth",
        status: "trialing",
        trialEnds: "2026-10-17",
        mode: "sandbox",
      },
      "billing-main",
      "active",
    );
    await putEntity(
      tx,
      "org-meadow",
      "provider-template",
      "Meadow welcome",
      {
        html: "<h1>Welcome to your daily ritual</h1>",
        version: 1,
        updatedBy: "sandbox",
      },
      "provider-template-1",
      "draft",
    );
    await putEntity(
      tx,
      "org-studio",
      "form",
      "Studio feedback",
      {
        name: "Studio feedback",
        questions: [
          {
            id: "name",
            label: "Your name",
            type: "short",
            required: true,
            options: [],
          },
        ],
        success: "Thanks!",
        outcomes: [],
      },
      "studio-form",
    );
    await tx.query(
      "INSERT INTO audit_logs(organization_id,id,actor_id,action) VALUES($1,$2,$3,$4)",
      ["org-meadow", uid(), "system", "demo.seed"],
    );
  });
}
function iOffset(id: string) {
  return id.length * 17;
}
