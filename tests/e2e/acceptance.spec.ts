import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "owner@inboxflow.local") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: /Good things ahead/ }),
  ).toBeVisible();
}
async function request(page: Page, path: string, data: unknown = {}) {
  const csrf = await page.evaluate(() =>
    sessionStorage.getItem("inboxflow-csrf"),
  );
  const res = await page.request.post(`/api${path}`, {
    data,
    headers: {
      "X-CSRF-Token": csrf || "",
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return res.json();
}
async function recipientLink(
  page: Page,
  scope: string,
  targetId: string,
  recipientId = "profile-1",
) {
  return (
    await request(page, "/action-tokens", { scope, targetId, recipientId })
  ).url;
}
test("01 registration creates an isolated organization and opens dashboard", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("Your name").fill("Test Founder");
  await page
    .getByLabel("Organization", { exact: true })
    .fill("Acceptance Studio");
  await page
    .getByLabel("Email address")
    .fill(`founder-${Date.now()}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("BrowserPassword123!");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: /Good things ahead, Test/ }),
  ).toBeVisible();
});
test("02 visual email builder persists product block and styling after reload", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/templates");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Browser builder acceptance");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/builder\//);
  await page
    .getByRole("button", { name: "Add product block", exact: true })
    .click();
  await page.getByLabel("product block", { exact: true }).last().click();
  await page.getByRole("button", { name: "Styling", exact: true }).click();
  await page.getByLabel("background", { exact: true }).fill("#d9e9c3");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved.*v[2-9]/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("product block", { exact: true })).toBeVisible();
  await page.getByLabel("product block", { exact: true }).click();
  await page.getByRole("button", { name: "Styling", exact: true }).click();
  await expect(page.getByLabel("background", { exact: true })).toHaveValue(
    "#d9e9c3",
  );
});
test("03 rendering validates AMP and exports MIME while labeling client simulations", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/builder/template-delivery");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("AMP validator: PASS")).toBeVisible();
  await expect(
    page.getByText(/All client previews are simulations/),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download MIME" }).click();
  expect((await dl).suggestedFilename()).toBe("email.eml");
  await page
    .locator(".modal-content .tabs")
    .getByRole("button", { name: "Plain text", exact: true })
    .click();
  await expect(page.locator(".source-preview")).toContainText(
    "Your next delivery",
  );
});
test("04 sandbox Shopify sync and product variant details use persisted catalog", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/products");
  await page.getByRole("button", { name: "Sync catalog" }).click();
  await expect(page.getByText("Catalog synchronized")).toBeVisible();
  await page.getByRole("button", { name: /Daily greens.*In stock/ }).click();
  await expect(
    page.getByRole("cell", { name: "Original · 30 servings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Family · 60 servings" }),
  ).toBeVisible();
});
test("05 recipient shopping creates a cart and idempotent sandbox purchase", async ({
  page,
}) => {
  await login(page);
  const url = await recipientLink(page, "cart", "product-1");
  await page.goto(url);
  await page.getByLabel("Choose your product").selectOption("variant-1-1");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add to your cart" }).click();
  await page.getByRole("button", { name: "Review your cart" }).click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your cart is ready." }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Continue to sandbox checkout" })
    .click();
  await page
    .getByRole("button", { name: "Confirm sandbox order", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page.getByText("Sandbox order confirmed. No payment was collected."),
  ).toBeVisible();
});
test("06 subscription delay requires confirmation and updates provider state", async ({
  page,
}) => {
  await login(page);
  const url = await recipientLink(
    page,
    "subscription",
    "subscription-2",
    "profile-2",
  );
  await page.goto(url);
  await page.getByLabel("What would you like to change?").selectOption("delay");
  await page.getByRole("button", { name: "Review change" }).click();
  await expect(page.getByRole("dialog")).toContainText("Delay by 7 days");
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page.getByText("Next delivery: 2026-10-22 · active"),
  ).toBeVisible();
});
test("07 cancelled subscription reactivation succeeds once in sandbox", async ({
  page,
}) => {
  await login(page);
  await page.goto(
    await recipientLink(page, "reactivation", "subscription-8", "profile-8"),
  );
  await page
    .getByRole("button", { name: "Reactivate subscription", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page.getByText("Next delivery: 2026-10-15 · active"),
  ).toBeVisible();
});
test("08 branching form persists response and sandbox profile mapping", async ({
  page,
}) => {
  await login(page);
  await page.goto(
    await recipientLink(page, "form", "form-ritual", "profile-3"),
  );
  await page.getByLabel("What would you like more of?").selectOption("Calm");
  await page
    .getByLabel("Tell us about your evening routine")
    .fill("Reading and tea");
  await page.getByRole("button", { name: "Review your answers" }).click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page
      .locator(".success-screen")
      .getByText("Try our Sleep botanical ritual."),
  ).toBeVisible();
  await page.goto("/app/forms/form-ritual");
  await page.getByRole("button", { name: "Responses", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Reading and tea");
});
test("09 review submission reaches persistent sandbox review provider", async ({
  page,
}) => {
  await login(page);
  await page.goto(
    await recipientLink(page, "review", "product-2", "profile-4"),
  );
  await page.getByLabel("Review title").fill("A thoughtful favorite");
  await page
    .getByLabel("Your review", { exact: true })
    .fill("My new daily ritual.");
  await page.getByRole("button", { name: "Review submission" }).click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page
      .locator(".success-screen")
      .getByText(
        "Your review was saved and received by the sandbox review provider.",
      ),
  ).toBeVisible();
});
test("10 SMS requires explicit consent and reports pending double opt-in", async ({
  page,
}) => {
  await login(page);
  await page.goto(await recipientLink(page, "sms", "profile-5", "profile-5"));
  await page.getByLabel("Phone number").fill("+12025550149");
  await expect(
    page.getByRole("button", { name: "Review SMS opt-in" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review SMS opt-in" }).click();
  await page
    .getByRole("button", { name: "Confirm action", exact: true })
    .click();
  await expect(
    page
      .locator(".success-screen")
      .getByText(
        "Consent recorded. Double opt-in is pending; no marketing SMS has been sent.",
      ),
  ).toBeVisible();
});
test("11 imports Klaviyo template and exports a sandbox draft", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/integrations");
  await page.getByRole("button", { name: "Import & edit" }).first().click();
  await expect(page).toHaveURL(/\/app\/builder\//);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Export sandbox draft" }).click();
  await expect(page.getByText(/Sandbox Klaviyo draft exported/)).toBeVisible();
});
test("12 A/B results display samples and confidence intervals from stable assignments", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/experiments");
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Wilson 95%");
  await expect(
    page.getByRole("cell", { name: "control", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assign demo recipient" }).click();
  await expect(page.getByText("Stable assignment recorded")).toBeVisible();
});
test("13 Refine previews typed edits, applies them and supports undo", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/builder/template-welcome");
  await page.getByRole("button", { name: "Refine", exact: true }).click();
  await page
    .getByLabel("Your edit command")
    .fill("headline: A better morning starts here");
  await page.getByRole("button", { name: "Preview suggestion" }).click();
  await expect(page.locator(".proposal")).toContainText('"op": "update"');
  await page.getByRole("button", { name: "Apply operations" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A better morning starts here",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A good day starts here", exact: true }),
  ).toBeVisible();
});
test("14 analytics and rule-based assistant use stored events and CSV export", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/analytics");
  await expect(
    page.getByRole("heading", { name: "Meaningful moments, measured." }),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV", exact: true }).click();
  expect((await dl).suggestedFilename()).toBe("inboxflow-analytics.csv");
  await page.goto("/app/ai");
  await page
    .getByRole("button", { name: "What is our confirmed revenue?" })
    .click();
  await expect(page.getByText(/Rule-based analytics assistant/)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Confirmed sandbox transaction revenue/,
    }),
  ).toBeVisible();
});
test("15 viewer controls deny mutations and tenant switch hides foreign templates", async ({
  page,
}) => {
  await login(page, "viewer@inboxflow.local");
  await page.goto("/app/templates");
  await expect(
    page.getByRole("button", { name: "Create template", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login(page);
  await page.getByLabel("Switch organization").selectOption("org-studio");
  await expect(page.getByLabel("Switch organization")).toHaveValue(
    "org-studio",
  );
  await page.goto("/app/builder/template-delivery");
  await expect(page.locator(".feedback.error")).toContainText(
    "Template not found",
  );
});
test("16 responsive marketing and production route controls have functional navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good things.*happen/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "See it in action" }).click();
  await expect(page).toHaveURL(/\/examples$/);
  await page.getByRole("button", { name: "Reviews", exact: true }).click();
  await expect(page.locator(".example-card")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/marketing-mobile.png",
    fullPage: true,
  });
});
test("17 no-dead-control smoke audit opens every major dashboard screen", async ({
  page,
}) => {
  await login(page);
  for (const route of [
    "templates",
    "forms",
    "products",
    "feeds",
    "campaigns",
    "flows",
    "blocks",
    "integrations",
    "analytics",
    "experiments",
    "reports",
    "ai",
    "team",
    "billing",
    "settings",
    "account",
  ]) {
    await page.goto(`/app/${route}`);
    await expect(page.locator("main.dashboard-content h1")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");
  }
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Good things ahead/ }),
  ).toBeVisible();
  await expect(page.getByText("Loading your workspace…")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
});
test("18 library dragging, keyboard reorder, and image upload persist on the canvas", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/templates");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Drag and upload fixture");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await expect(page.locator(".email-canvas .canvas-block")).toHaveCount(3);
  const library = page.getByRole("button", {
    name: "Add image block",
    exact: true,
  });
  const source = await library.boundingBox();
  const target = await page
    .locator(".email-canvas .canvas-block")
    .first()
    .boundingBox();
  expect(source && target).toBeTruthy();
  await page.mouse.move(
    source!.x + source!.width / 2,
    source!.y + source!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source!.x + source!.width / 2 + 12,
    source!.y + source!.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(target!.x + 100, target!.y + 60, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator(".email-canvas .canvas-block")).toHaveCount(4);
  await page.getByLabel("image block", { exact: true }).click();
  const imageData = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#89a666";
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload image").setInputFiles({
    name: "pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(imageData, "base64"),
  });
  await expect(
    page.getByText("Image uploaded and added to this block."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-image")).toHaveAttribute(
    "src",
    /\/api\/assets\//,
  );
  await expect
    .poll(() =>
      page
        .locator(".canvas-image")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  const handle = page.getByRole("button", {
    name: "Drag image block",
    exact: true,
  });
  const orderBefore = await page
    .locator(".email-canvas .canvas-block")
    .evaluateAll((blocks) =>
      blocks.map((block) => block.getAttribute("aria-label")),
    );
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  const announcementBefore = await page.getByRole("status").textContent();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => page.getByRole("status").textContent())
    .not.toEqual(announcementBefore);
  await page.keyboard.press("Space");
  await expect
    .poll(() =>
      page
        .locator(".email-canvas .canvas-block")
        .evaluateAll((blocks) =>
          blocks.map((block) => block.getAttribute("aria-label")),
        ),
    )
    .not.toEqual(orderBefore);
  const orderAfter = await page
    .locator(".email-canvas .canvas-block")
    .evaluateAll((blocks) =>
      blocks.map((block) => block.getAttribute("aria-label")),
    );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.locator(".canvas-image")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".email-canvas .canvas-block")
        .evaluateAll((blocks) =>
          blocks.map((block) => block.getAttribute("aria-label")),
        ),
    )
    .toEqual(orderAfter);
});
test("19 manual feed controls persist, preview selection, and honor exclusions", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/feeds");
  await page.getByRole("button", { name: "Create feed", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Selected daily essentials");
  await page.getByLabel("Recommendation strategy").selectOption("manual");
  await page
    .getByLabel("Product IDs", { exact: true })
    .fill("product-1, product-2");
  await page
    .getByLabel("Exclude product IDs", { exact: true })
    .fill("product-2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create feed", exact: true })
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Selected daily essentials" })
    .getByRole("button", { name: "Preview", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Daily greens");
  await expect(page.getByRole("dialog")).not.toContainText("Golden oat blend");
});
test("20 customer privacy deletion requires a reviewable confirmation", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/settings");
  await page.getByLabel("Customer profile").selectOption("profile-12");
  await page.getByRole("button", { name: "Delete selected profile" }).click();
  await expect(page.getByRole("dialog")).toContainText("This cannot be undone");
  await expect(
    page.getByLabel("Customer profile").locator('option[value="profile-12"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm customer deletion" }).click();
  await expect(
    page.getByText("Profile and associated local records deleted"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Customer profile").locator('option[value="profile-12"]'),
  ).toHaveCount(0);
});

test("21 publishing survives preview and subsequent edits without redundant versions", async ({
  page,
}) => {
  await login(page);
  await page.goto("/app/templates");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Publication lifecycle fixture");
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await expect(page.locator(".email-canvas .canvas-block")).toHaveCount(3);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".editor-name small")).toContainText("published");
  const id = new URL(page.url()).pathname.split("/").pop();
  const before = await (await page.request.get(`/api/templates/${id}`)).json();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("AMP validator: PASS")).toBeVisible();
  const after = await (await page.request.get(`/api/templates/${id}`)).json();
  expect(after.status).toBe("published");
  expect(after.revision).toBe(before.revision);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Publication lifecycle updated");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Publication lifecycle updated",
  );
  await expect(page.locator(".editor-name small")).toContainText("published");
});
