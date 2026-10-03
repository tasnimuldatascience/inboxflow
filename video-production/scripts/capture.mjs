import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

process.on("uncaughtException", error => {
  console.error(`Capture stopped: ${String(error.message).split("Call log:")[0].replace(/https?:\/\/[^\s"']+/g,"[local URL]")}`);
  process.exit(1);
});

const origin = "http://localhost:3000";
const root = resolve("video-production");
const org = "film-meadow-20261003";
const previous = process.argv.includes("--resume") ? JSON.parse(await readFile(`${root}/assets/capture-manifest.json`,"utf8").catch(()=>"{}")) : {};
const shots = previous.shots || {};
await mkdir(`${root}/.cache/recordings`, { recursive: true });
const browser = await chromium.launch();
const auth = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const prep = await auth.newPage();
await prep.goto(`${origin}/login`);
assert(process.env.INBOXFLOW_DEMO_EMAIL && process.env.INBOXFLOW_DEMO_PASSWORD,"Supply local demo credentials through environment variables.");
await prep.getByLabel("Email address").fill(process.env.INBOXFLOW_DEMO_EMAIL);
await prep.getByLabel("Password", { exact: true }).fill(process.env.INBOXFLOW_DEMO_PASSWORD);
await prep.getByRole("button", { name: "Sign in", exact: true }).click();
await expect(prep).toHaveURL(`${origin}/app`);
await prep.getByLabel("Switch organization").selectOption(org);
await expect(prep.getByLabel("Switch organization")).toHaveValue(org);
await prep.waitForTimeout(1200);
const csrf = await prep.evaluate(() => sessionStorage.getItem("inboxflow-csrf"));
const state = await auth.storageState(); // In memory only: never written into assets.
async function post(path, data = {}) {
  const result = await prep.request.post(`${origin}/api${path}`, {data, headers:{"X-CSRF-Token":csrf,"Idempotency-Key":crypto.randomUUID()}});
  assert.equal(result.ok(),true,`Local request failed: ${path}`);
  return result.json();
}
async function get(path) {
  const result = await prep.request.get(`${origin}/api${path}`);
  assert.equal(result.ok(),true,`Local read failed: ${path}`);
  return result.json();
}
const baseline = previous.baseline || await get("/analytics");
if (process.argv.includes("--resume") && !shots.builder) {
  const template=await get("/templates/template-film-welcome");
  template.document.blocks=template.document.blocks.filter(block=>block.type!=="product");
  const restored=await prep.request.put(`${origin}/api/templates/template-film-welcome`,{data:{document:template.document,revision:template.revision,status:template.status},headers:{"X-CSRF-Token":csrf}});
  assert.equal(restored.ok(),true);
}
const discovery = [];
for (const [route, title] of [["/app","Good things ahead"],["/app/integrations","Better, connected."],["/app/products","Good things to discover."],["/app/templates","Email templates"],["/app/forms","Forms & quizzes"],["/app/analytics","Meaningful moments, measured."],["/app/ai","Ask a good question."]]) {
  await prep.goto(origin+route);
  await expect(prep.locator("main.dashboard-content h1")).toBeVisible();
  discovery.push({route, actualHeading:await prep.locator("main.dashboard-content h1").innerText(),expectedContext:title});
}
await writeFile(`${root}/assets/discovery.json`, JSON.stringify({origin,syntheticTenant:org,discovery,verifiedAt:new Date().toISOString()},null,2));
console.log("Inspected the running dashboard, integrations, catalog, templates, forms, analytics, and local assistant.");

async function film(name, route, action, {mobile=false,ready}={}) {
  if (shots[name] && (name!=="shopping" || shots.checkout)) {console.log(`Retaining successful take: ${name}`);return;}
  const viewport = mobile ? {width:540,height:1000} : {width:1600,height:900};
  const ctx = await browser.newContext({storageState:state,viewport,recordVideo:{dir:`${root}/.cache/recordings`,size:viewport}});
  await ctx.addInitScript(value => {
    if (window !== window.top) return;
    sessionStorage.setItem("inboxflow-csrf",value);
    document.addEventListener("DOMContentLoaded",()=>{
      const cursor=document.createElement("div");cursor.id="film-cursor";
      cursor.style.cssText="position:fixed;left:-100px;top:-100px;width:22px;height:22px;border:3px solid #183d34;background:#d5ed9b;border-radius:50%;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 6px #d5ed9b40;transform:translate(-50%,-50%);transition:width .14s,height .14s";
      document.body.append(cursor);
      document.addEventListener("pointermove",e=>{cursor.style.left=e.clientX+"px";cursor.style.top=e.clientY+"px";});
      document.addEventListener("pointerdown",()=>{cursor.style.width=cursor.style.height="32px";});
      document.addEventListener("pointerup",()=>{cursor.style.width=cursor.style.height="22px";});
    });
  },csrf);
  const page=await ctx.newPage();
  const opened=Date.now();
  const marks={};
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  let start=0,end=0;
  const mark=label=>{marks[label]=(Date.now()-opened)/1000-start;};
  const pause=ms=>page.waitForTimeout(ms);
  const click=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();if(box)await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:18});await pause(160);await locator.click();await pause(420);};
  try {
    await page.goto(origin+route);
    if(ready)await ready(page);else await expect(page.locator("h1").first()).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    await pause(900);
    start=(Date.now()-opened)/1000;
    await page.screenshot({path:`${root}/assets/screenshots/${name}-before.png`});
    await action({page,click,pause,mark});
    await pause(900);
    end=(Date.now()-opened)/1000;
    await page.screenshot({path:`${root}/assets/screenshots/${name}-after.png`});
    assert.deepEqual(errors,[],`Browser exceptions during ${name}`);
  } finally {
    const video=page.video();
    await ctx.close();
    await video.saveAs(`${root}/assets/footage/${name}.webm`);
  }
  shots[name]={file:`assets/footage/${name}.webm`,start,end,duration:end-start,width:viewport.width,height:viewport.height,marks};
  await writeFile(`${root}/assets/capture-manifest.json`,JSON.stringify({shots,baseline,fixture:org,containsCredentials:false},null,2));
  console.log(`Captured ${name}: ${(end-start).toFixed(1)} seconds of usable product footage.`);
}

try {
  await film("dashboard","/app",async({page,pause,click})=>{await pause(1800);await click(page.getByRole("link",{name:/Explore your templates/}));await pause(900);});
  await film("integrations","/app/integrations",async({page,click,pause,mark})=>{
    for(const provider of ["Shopify","Klaviyo"]){const card=page.locator(".integration-card").filter({has:page.getByRole("heading",{name:provider,exact:true})});await click(card.getByRole("button",{name:"Connect / configure"}));await expect(page.getByLabel("Connection mode")).toHaveValue("sandbox");mark(provider+"-connect");await click(page.getByRole("button",{name:`Connect ${provider.toLowerCase()}`,exact:true}));await expect(card.getByText("connected",{exact:true})).toBeVisible();await pause(600);}
  });
  await film("catalog","/app/products",async({page,click,pause,mark})=>{await click(page.getByRole("button",{name:"Sync catalog"}));await expect(page.getByText("Catalog synchronized")).toBeVisible();mark("sync-complete");await pause(1400);await click(page.getByRole("button",{name:/Daily greens.*In stock/}));await expect(page.getByRole("cell",{name:"Family · 60 servings"})).toBeVisible();mark("variants-visible");await pause(1600);});
  await film("templates","/app/templates",async({page,click,pause})=>{await pause(1100);await click(page.locator('a[href="/app/builder/template-film-welcome"]').first());await expect(page.locator(".canvas-block").first()).toBeVisible();await pause(1400);});
  await film("builder","/app/builder/template-film-welcome",async({page,click,pause,mark})=>{
    const library=page.getByRole("button",{name:"Add product block",exact:true});
    const from=await library.boundingBox(),to=await page.locator(".email-canvas .canvas-block").first().boundingBox();
    await page.mouse.move(from.x+from.width/2,from.y+from.height/2,{steps:15});await page.mouse.down();await page.mouse.move(from.x+from.width/2+15,from.y+from.height/2,{steps:5});await pause(140);await page.mouse.move(to.x+100,to.y+to.height-20,{steps:35});await pause(280);await page.mouse.up();
    await expect(page.getByLabel("product block",{exact:true})).toBeVisible();mark("product-dropped");
    await click(page.getByLabel("product block",{exact:true}));await pause(1100);
    await click(page.getByRole("button",{name:"Styling",exact:true}));
    await page.getByLabel("background",{exact:true}).fill("#e6eddc");const size=page.getByRole("slider",{name:/Font size/});await size.focus();await size.press("ArrowRight");await size.press("ArrowRight");mark("style-updated");await pause(1300);
    await click(page.getByRole("button",{name:"Save",exact:true}));await pause(1100);
  },{ready:page=>expect(page.locator(".email-canvas .canvas-block").first()).toBeVisible()});
  await film("carousel","/app/builder/template-film-welcome",async({page,click,pause,mark})=>{await click(page.getByRole("button",{name:"Add product-carousel block",exact:true}));await page.getByLabel("product-carousel block",{exact:true}).scrollIntoViewIfNeeded();await click(page.getByLabel("product-carousel block",{exact:true}));mark("carousel-added");await pause(1300);await click(page.getByRole("button",{name:"Save",exact:true}));},{ready:page=>expect(page.locator(".email-canvas .canvas-block").first()).toBeVisible()});
  await film("subscription-block","/app/builder/template-film-delivery",async({page,click,pause})=>{await click(page.getByLabel("subscription block",{exact:true}));await pause(1700);await click(page.getByRole("button",{name:"Styling",exact:true}));await page.getByLabel("background",{exact:true}).fill("#f5e4d7");await pause(1100);await click(page.getByRole("button",{name:"Save",exact:true}));},{ready:page=>expect(page.getByLabel("subscription block",{exact:true})).toBeVisible()});
  await film("preview-export","/app/builder/template-film-welcome",async({page,click,pause,mark})=>{await click(page.getByRole("button",{name:"Preview",exact:true}));await expect(page.locator('iframe[title="Email preview"]')).toBeVisible();mark("html-preview");await pause(2000);await page.frameLocator('iframe[title="Email preview"]').locator("body").screenshot({path:`${root}/assets/screenshots/email-html-preview.png`});await click(page.getByRole("button",{name:"Export sandbox draft"}));await expect(page.getByText(/Sandbox Klaviyo draft exported/)).toBeVisible();mark("export-complete");await pause(1300);},{ready:page=>expect(page.locator(".email-canvas .canvas-block").first()).toBeVisible()});
  const cart = await post("/action-tokens",{scope:"cart",targetId:"product-1",recipientId:"profile-1"});
  let checkoutPath="";
  await film("shopping",new URL(cart.url).pathname+new URL(cart.url).search,async({page,click,pause,mark})=>{await page.getByLabel("Choose your product").scrollIntoViewIfNeeded();await page.getByLabel("Choose your product").selectOption("variant-1-2");mark("variant-chosen");await pause(650);await page.getByLabel("Quantity",{exact:true}).fill("2");await pause(750);await click(page.getByRole("button",{name:"Add to your cart"}));mark("added-to-cart");await click(page.getByRole("button",{name:"Review your cart"}));await pause(700);await click(page.getByRole("button",{name:"Confirm action",exact:true}));await expect(page.getByRole("heading",{name:"Your cart is ready."})).toBeVisible();mark("cart-confirmed");checkoutPath=await page.getByRole("link",{name:"Continue to sandbox checkout"}).getAttribute("href");await pause(1500);},{mobile:true,ready:page=>expect(page.getByLabel("Choose your product")).toBeVisible()});
  await film("checkout",checkoutPath,async({page,click,pause,mark})=>{await click(page.getByRole("button",{name:"Confirm sandbox order",exact:true}));await pause(700);await click(page.getByRole("button",{name:"Confirm action",exact:true}));await expect(page.getByText("Sandbox order confirmed. No payment was collected.")).toBeVisible();mark("confirmed-order");await pause(1800);},{mobile:true});
  const subscription=await post("/action-tokens",{scope:"subscription",targetId:"subscription-1",recipientId:"profile-1"});
  await film("subscription",new URL(subscription.url).pathname+new URL(subscription.url).search,async({page,click,pause,mark})=>{await page.getByLabel("What would you like to change?").selectOption("delay");await pause(700);await click(page.getByRole("button",{name:"Review change"}));await expect(page.getByRole("dialog")).toContainText("Delay by 7 days");mark("confirmation-shown");await pause(950);await click(page.getByRole("button",{name:"Confirm action",exact:true}));await expect(page.getByText("Next delivery: 2026-10-22 · active")).toBeVisible();mark("delivery-updated");await pause(1800);},{mobile:true,ready:page=>expect(page.getByLabel("What would you like to change?")).toBeVisible()});
  const review=await post("/action-tokens",{scope:"review",targetId:"product-1",recipientId:"profile-1"});
  await film("review",new URL(review.url).pathname+new URL(review.url).search,async({page,click,pause,mark})=>{await click(page.getByRole("button",{name:"5 stars",exact:true}));await page.getByLabel("Review title").pressSequentially("My new daily favorite",{delay:42});await page.getByLabel("Your review",{exact:true}).pressSequentially("A thoughtful start to my morning.",{delay:30});mark("review-written");await click(page.getByRole("button",{name:"Review submission"}));await click(page.getByRole("button",{name:"Confirm action",exact:true}));await expect(page.locator(".success-screen")).toContainText("saved and received");mark("review-saved");await pause(1400);},{mobile:true,ready:page=>expect(page.getByLabel("Review title")).toBeVisible()});
  const form=await post("/action-tokens",{scope:"form",targetId:"form-ritual",recipientId:"profile-1"});
  await film("form",new URL(form.url).pathname+new URL(form.url).search,async({page,click,pause,mark})=>{await page.getByLabel("What would you like more of?").selectOption("Calm");mark("branch-revealed");await pause(700);await page.getByLabel("Tell us about your evening routine").pressSequentially("Reading and a warm cup of tea",{delay:35});await click(page.getByRole("button",{name:"Review your answers"}));await click(page.getByRole("button",{name:"Confirm action",exact:true}));await expect(page.locator(".success-screen")).toContainText("Sleep botanical");mark("form-saved");await pause(1600);},{mobile:true,ready:page=>expect(page.getByLabel("What would you like more of?")).toBeVisible()});
  await film("responses","/app/forms/form-ritual",async({page,click,pause})=>{await click(page.getByRole("button",{name:"Responses",exact:true}));await expect(page.getByRole("dialog")).toContainText("Reading and a warm cup of tea");await pause(1800);});
  await film("analytics","/app/analytics",async({page,pause,click})=>{await pause(2000);await page.locator(".dashboard-content").evaluate(element=>element.scrollIntoView());await pause(1200);await click(page.getByRole("link",{name:"Overview",exact:true}));await pause(1400);});
  await film("assistant","/app/ai",async({page,click,pause})=>{await click(page.getByRole("button",{name:"What is our confirmed revenue?"}));await expect(page.getByText(/Rule-based analytics assistant/)).toBeVisible();await expect(page.getByRole("heading",{name:/Confirmed sandbox transaction revenue/})).toBeVisible();await pause(2200);});
  const after=await get("/analytics");
  assert.equal(after.revenue-baseline.revenue,8000);
  for(const type of ["purchase_confirmed","subscription_delayed","review_submitted","form_submitted"])assert.equal((after.counts[type]||0)-(baseline.counts[type]||0),1);
  const profiles=await get("/records/profile");assert.equal(profiles[0].data.properties.wellness_goal,"Calm");
  await writeFile(`${root}/assets/verification.json`,JSON.stringify({synthetic:true,observedRevenueDeltaCents:after.revenue-baseline.revenue,observedActions:["purchase_confirmed","subscription_delayed","review_submitted","form_submitted"],subscriptionNextDelivery:"2026-10-22",profilePreference:"Calm",realPaymentCollected:false,allRecordedBrowserExceptions:0},null,2));
  console.log("Verified real persisted sandbox order, delivery delay, provider review receipt, branching response, profile mapping, and analytics deltas.");
  await prep.goto(origin+"/app/builder/template-film-welcome");
  await prep.getByRole("button",{name:"Preview",exact:true}).click();
  await expect(prep.locator('iframe[title="Email preview"]')).toBeVisible();
  const html=await prep.frameLocator('iframe[title="Email preview"]').locator('html').evaluate(element=>element.outerHTML);
  const emailView=await browser.newPage({viewport:{width:640,height:1000}});
  await emailView.setContent(html);
  await emailView.waitForTimeout(600);
  await emailView.screenshot({path:`${root}/assets/screenshots/email-html-preview.png`});
  await emailView.close();
} finally {await auth.close();await browser.close();}
