import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

// A browser smoke check against the running local container demo.
const origin = "http://localhost:3000";
const output = "test-results/container-smoke";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const health = await page.request.get(`${origin}/api/health`);
  assert.equal(health.status(), 200);
  await page.goto(origin);
  await expect(
    page
      .getByRole("link", { name: "Build your first email", exact: true })
      .first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${output}/marketing-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${output}/marketing-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/login`);
  await page.getByLabel("Email address").fill("owner@inboxflow.local");
  await page.getByLabel("Password", { exact: true }).fill("InboxFlowDemo!2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/app`);
  await expect(
    page.getByRole("heading", { name: /Good things ahead/ }),
  ).toBeVisible();
  await expect(page.getByText("Loading your workspace…")).toHaveCount(0);
  // Recharts animates on mount; let it settle before visual capture.
  await page.waitForTimeout(1800);
  await page.screenshot({
    path: `${output}/dashboard-desktop.png`,
    fullPage: true,
  });
  await page.goto(`${origin}/app/builder/template-delivery`);
  await expect(
    page.locator(".email-canvas .canvas-block").first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/editor-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("AMP validator: PASS")).toBeVisible();
  await expect(
    page.getByText(/All client previews are simulations/),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: container health through web proxy, responsive marketing, owner login, persistent dashboard/editor, official AMP preview, and no browser exceptions.",
  );
} finally {
  await browser.close();
}
