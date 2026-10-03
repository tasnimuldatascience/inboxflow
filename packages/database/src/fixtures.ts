import type { Product } from "../../shared/src/index.ts";
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
/** Immutable fictional catalog. Importing it never reads another tenant's records. */
export function sandboxCatalog(): Product[] {
  return names.map((title, i) => {
    const price = 2400 + i * 125;
    return {
      id: `product-${i + 1}`,
      title,
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
  });
}
