import {
  documentSchema,
  type EmailDocument,
  type EmailBlock,
  type Product,
  type FormDocument,
} from "../../shared/src/index.ts";
export const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const interactiveTypes = new Set([
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
  "flip",
  "reveal",
  "spin",
]);
export type RenderContext = {
  baseUrl: string;
  apiUrl: string;
  products: Product[];
  forms: Record<string, FormDocument>;
  links: Record<string, string>;
  tokens: Record<string, string>;
  subscriber?: boolean;
  unsubscribeUrl?: string;
};
export function link(b: EmailBlock, c: RenderContext) {
  return c.links[b.id] || `${c.baseUrl}/experience`;
}
const absolute = (url: string, c: RenderContext) =>
  url.startsWith("/") ? `${c.baseUrl}${url}` : url;
const style = (b: EmailBlock) =>
  `color:${b.style.color};background-color:${b.style.background};padding:${b.style.padding}px;font-size:${b.style.fontSize}px;text-align:${b.style.align};border-radius:${b.style.radius}px;font-family:Arial,sans-serif;line-height:1.5`;
const cta = (url: string, label: string) =>
  `<a href="${escape(url)}" style="display:inline-block;background-color:#173f35;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${escape(label)}</a>`;
type Renderer = (b: EmailBlock, c: RenderContext) => string;
const content: Record<string, Renderer> = {
  heading: (b) =>
    `<h1 style="margin:0;font-size:${b.style.fontSize}px">${escape(b.content)}</h1>`,
  paragraph: (b) =>
    `<p style="margin:0">${escape(b.content).replaceAll("\n", "<br>")}</p>`,
  hero: (b) =>
    `<p style="font-size:12px;letter-spacing:3px">MEADOW &amp; MOSS</p><h1 style="font-family:Georgia,serif;font-size:${Math.max(32, b.style.fontSize)}px;line-height:1.1">${escape(b.content)}</h1>`,
  image: (b, c) =>
    `<img src="${escape(absolute(b.url || "/products/product-0.svg", c))}" alt="${escape(b.content)}" width="${Math.min(600, b.style.height)}" style="max-width:100%;height:auto">`,
  button: (b) => cta(b.url || "https://example.com", b.content),
  divider: () => '<hr style="border:0;border-top:1px solid #dde3db">',
  spacer: (b) => `<div style="height:${b.style.height}px"></div>`,
  columns: (b) =>
    `<table role="presentation" width="100%"><tr>${b.content
      .split("|")
      .map(
        (v) => `<td width="50%" style="padding:12px">${escape(v.trim())}</td>`,
      )
      .join("")}</tr></table>`,
  footer: (b, c) =>
    `<p style="font-size:12px;color:#66736c">${escape(b.content)}</p>${cta(c.unsubscribeUrl || `${c.baseUrl}/preferences`, "Manage email preferences")}`,
  animation: (b) => `<p>${escape(b.content)}</p>`,
};
function commerce(b: EmailBlock, c: RenderContext) {
  const products = c.products.filter((p) => b.productIds.includes(p.id));
  if (["product", "product-grid", "product-carousel", "cart"].includes(b.type))
    return `${products.map((p) => `<table role="presentation" width="100%" style="margin-bottom:16px"><tr><td width="130"><img width="120" src="${escape(absolute(p.image, c))}" alt="${escape(p.title)}"></td><td><h3>${escape(p.title)}</h3><p>$${(p.price / 100).toFixed(2)} · ${p.variants.length} options</p>${cta(link(b, c), p.inventory ? "Choose options" : "See availability")}</td></tr></table>`).join("") || "<p>Select products in the builder.</p>"}${b.type === "cart" ? cta(link(b, c), "Build your cart") : ""}`;
  return `<h2>${escape(b.content)}</h2><p>Make changes to your delivery with a secure confirmation.</p>${cta(link(b, c), "Manage your delivery")}`;
}
function capture(b: EmailBlock, c: RenderContext) {
  return `<h2>${escape(b.content)}</h2><p>${b.type === "sms" ? "Stay in the loop. SMS opt-in requires your explicit consent." : "We would love to hear from you."}</p>${cta(link(b, c), b.type === "review" ? "Write a review" : b.type === "sms" ? "Choose SMS preferences" : "Share your answers")}`;
}
function engagement(b: EmailBlock, c: RenderContext) {
  if (b.type === "image-carousel")
    return c.products
      .slice(0, 3)
      .map(
        (p) =>
          `<img src="${escape(absolute(p.image, c))}" width="150" alt="${escape(p.title)}">`,
      )
      .join("");
  return `<h2>${escape(b.content)}</h2>${cta(link(b, c), b.type === "spin" ? "Discover your reward" : "Reveal your surprise")}`;
}
const registry: Record<string, Renderer> = { ...content };
for (const t of [
  "product",
  "product-grid",
  "product-carousel",
  "cart",
  "subscription",
  "reactivation",
  "swap",
  "action",
])
  registry[t] = commerce;
for (const t of ["form", "quiz", "review", "sms"]) registry[t] = capture;
for (const t of ["image-carousel", "flip", "reveal", "spin"])
  registry[t] = engagement;
export function renderHtml(doc: EmailDocument, c: RenderContext) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(doc.subject)}</title></head><body style="margin:0;background-color:${doc.theme.background}"><div style="display:none;max-height:0;overflow:hidden">${escape(doc.preheader)}</div><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="${doc.theme.width}" style="max-width:100%;background:#fff">${visible(
    doc,
    c,
  )
    .map(
      (b) => `<tr><td style="${style(b)}">${registry[b.type](b, c)}</td></tr>`,
    )
    .join("")}</table></td></tr></table></body></html>`;
}
function visible(doc: EmailDocument, c: RenderContext) {
  return doc.blocks.filter(
    (b) =>
      b.visibility === "all" ||
      (c.subscriber === undefined
        ? false
        : b.visibility === (c.subscriber ? "subscribers" : "non-subscribers")),
  );
}
function fields(b: EmailBlock, c: RenderContext) {
  if (
    ["product", "product-grid", "product-carousel", "cart"].includes(b.type)
  ) {
    const ps = c.products.filter((p) => b.productIds.includes(p.id));
    return `<label>Variant <select name="variantId">${ps.flatMap((p) => p.variants.filter((v) => v.inventory > 0).map((v) => `<option value="${escape(v.id)}">${escape(p.title)} · ${escape(v.title)} · $${(v.price / 100).toFixed(2)}</option>`)).join("")}</select></label><label>Quantity <input type="number" min="1" max="20" name="quantity" value="1" required></label>`;
  }
  if (["subscription", "reactivation", "swap", "action"].includes(b.type))
    return `<label>Action <select name="action"><option value="delay">Delay delivery</option><option value="skip">Skip delivery</option><option value="reactivate">Reactivate</option></select></label><label>Days <input type="number" name="days" value="7" min="1" max="90"></label>`;
  if (b.type === "review")
    return '<label>Rating <select name="rating"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label><label>Title <input name="title" required maxlength="120"></label><label>Review <textarea name="body" required maxlength="5000"></textarea></label>';
  if (b.type === "sms")
    return '<label>Phone <input type="tel" name="phone" required pattern="\\+[1-9][0-9]{7,14}"></label><label><input type="checkbox" name="consent" value="true" required>I agree to receive recurring marketing SMS. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.</label>';
  if (["form", "quiz"].includes(b.type)) {
    const f = c.forms[b.formId || ""];
    if (!f) return "";
    return f.questions
      .filter((q) => !q.showWhen)
      .map(
        (q) =>
          `<label>${escape(q.label)} ${q.type === "single" ? `<select name="${escape(q.id)}" ${q.required ? "required" : ""}>${q.options.map((v) => `<option>${escape(v)}</option>`).join("")}</select>` : q.type === "long" ? `<textarea name="${escape(q.id)}" ${q.required ? "required" : ""}></textarea>` : `<input name="${escape(q.id)}" type="${q.type === "rating" ? "number" : q.type === "phone" ? "tel" : "text"}" ${q.type === "rating" ? 'min="1" max="5"' : ""} ${q.required ? "required" : ""}>`}</label>`,
      )
      .join("");
  }
  return "";
}
export function renderAmp(doc: EmailDocument, c: RenderContext) {
  const body = visible(doc, c)
    .map((b) => {
      let html = registry[b.type](b, c);
      if (b.type === "image" || b.type === "image-carousel")
        html = html.replace(
          /<img ([^>]+)>/g,
          '<amp-img $1 height="150" layout="responsive"></amp-img>',
        );
      else
        html = html.replace(
          /<img ([^>]+)>/g,
          '<amp-img $1 height="120" layout="fixed"></amp-img>',
        );
      if (
        interactiveTypes.has(b.type) &&
        c.tokens[b.id] &&
        c.apiUrl.startsWith("https://")
      ) {
        if (["flip", "reveal"].includes(b.type))
          html = `<amp-selector><div option="reveal" role="button" tabindex="0" on="tap:reward-${escape(b.id)}.show">${escape(b.content)}</div></amp-selector><div id="reward-${escape(b.id)}" hidden>${escape(b.success)}</div>`;
        else if (b.type === "spin")
          html += cta(link(b, c), "Open secure reward experience");
        else if (
          ["form", "quiz"].includes(b.type) &&
          c.forms[b.formId || ""]?.questions.some(
            (q) => q.showWhen || q.type === "multi",
          )
        )
          html += `<p>This form uses branching. Complete it securely in your browser.</p>${cta(link(b, c), "Open full form")}`;
        else {
          const endpoint = `${c.apiUrl}/api/amp/action?token=${encodeURIComponent(c.tokens[b.id])}`;
          html += `<form method="post" action-xhr="${escape(endpoint)}">${fields(b, c)}<label><input type="checkbox" name="confirm" value="true" required>${escape(b.confirmation)}</label><button type="submit">Confirm ${["product", "product-grid", "product-carousel", "cart"].includes(b.type) ? "cart" : "action"}</button><div submit-success><template type="amp-mustache">{{message}}</template></div><div submit-error><template type="amp-mustache">{{error}}</template></div></form>`;
        }
        if (["product", "product-grid", "product-carousel"].includes(b.type))
          html += `<amp-list width="auto" height="100" src="${escape(`${c.apiUrl}/api/amp/data?token=${encodeURIComponent(c.tokens[b.id])}`)}"><template type="amp-mustache"><p>{{title}} · {{priceLabel}}</p></template></amp-list>`;
      }
      if (b.type === "image-carousel")
        html = `<amp-carousel width="600" height="200" layout="responsive" type="slides">${html}</amp-carousel>`;
      return `<section style="${style(b)}">${html}</section>`;
    })
    .join("");
  const needed = [
    "amp-form",
    "amp-list",
    "amp-selector",
    "amp-carousel",
    "amp-bind",
  ].filter((name) =>
    name === "amp-form"
      ? body.includes("<form ")
      : name === "amp-bind"
        ? /\[[a-z]+\]/.test(body)
        : body.includes("<" + name),
  );
  const scripts =
    needed
      .map(
        (name) =>
          `<script async custom-element="${name}" src="https://cdn.ampproject.org/v0/${name}-0.1.js"></script>`,
      )
      .join("") +
    (body.includes("amp-mustache")
      ? '<script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script>'
      : "");
  return `<!doctype html><html amp4email data-css-strict lang="en"><head><meta charset="utf-8"><script async src="https://cdn.ampproject.org/v0.js"></script>${scripts}<style amp4email-boilerplate>body{visibility:hidden}</style><style amp-custom>body{font-family:Arial,sans-serif;background:${doc.theme.background};color:#173f35}main{max-width:${doc.theme.width}px;margin:auto;background:#fff}label{display:block;margin:12px 0}input,select,textarea{padding:8px;max-width:100%}button{background:#173f35;color:#fff;padding:12px;border:0;border-radius:8px}h1{line-height:1.1}</style></head><body><main>${body}</main></body></html>`;
}
export function renderText(doc: EmailDocument, c: RenderContext) {
  return `${doc.subject}\n${doc.preheader}\n\n${visible(doc, c)
    .map(
      (b) =>
        `${b.content}${
          b.productIds.length
            ? "\n" +
              c.products
                .filter((p) => b.productIds.includes(p.id))
                .map((p) => `${p.title}: $${(p.price / 100).toFixed(2)}`)
                .join("\n")
            : ""
        }${interactiveTypes.has(b.type) ? "\n" + link(b, c) : ""}`,
    )
    .join(
      "\n\n",
    )}\n\nPreferences: ${c.unsubscribeUrl || c.baseUrl + "/preferences"}`;
}
export function mime(
  subject: string,
  from: string,
  to: string,
  parts: { html: string; amp: string; text: string },
) {
  if (/[\r\n]/.test(from + to)) throw Error("Invalid email headers");
  const boundary = `inboxflow-${crypto.randomUUID()}`;
  const encode = (s: string) =>
    Buffer.from(s)
      .toString("base64")
      .match(/.{1,76}/g)
      ?.join("\r\n") || "";
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    ...(
      [
        ["text/plain", parts.text],
        ["text/x-amp-html", parts.amp],
        ["text/html", parts.html],
      ] as const
    ).flatMap(([type, value]) => [
      `--${boundary}`,
      `Content-Type: ${type}; charset=UTF-8`,
      "Content-Transfer-Encoding: base64",
      "",
      encode(value),
    ]),
    `--${boundary}--`,
  ].join("\r\n");
}
export function render(document: EmailDocument, c: RenderContext) {
  const doc = documentSchema.parse(document);
  const html = renderHtml(doc, c),
    amp = renderAmp(doc, c),
    text = renderText(doc, c);
  const warnings: string[] = [];
  if (!c.apiUrl.startsWith("https://"))
    warnings.push(
      "Local AMP output uses static hosted links because AMP action endpoints require HTTPS. Dynamic AMP is exercised by the HTTPS renderer fixtures.",
    );
  if (Buffer.byteLength(html) > 102400)
    warnings.push("HTML exceeds 100 KiB; clipping is possible.");
  if (!doc.blocks.some((b) => b.type === "footer"))
    warnings.push("Add a footer with preference management.");
  if (doc.blocks.some((b) => interactiveTypes.has(b.type)))
    warnings.push(
      "AMP needs HTTPS endpoints, ESP AMP support, and sender approval. Browser previews are simulations.",
    );
  if (
    doc.blocks.some((b) => b.visibility !== "all") &&
    c.subscriber === undefined
  )
    warnings.push(
      "Conditional blocks omitted until subscriber context is known.",
    );
  return {
    html,
    amp,
    text,
    warnings,
    size: {
      html: Buffer.byteLength(html),
      amp: Buffer.byteLength(amp),
      text: Buffer.byteLength(text),
    },
    compatibility: {
      amp: "Generated AMP; official validator result reported separately",
      apple:
        "Static HTML with secure hosted actions; richer CSS support is not claimed",
      outlook: "Static HTML with hosted confirmation links",
      hosted: "Functional browser experience",
    },
    htmlValid: !/<script|javascript:|onerror=/i.test(html),
  };
}
