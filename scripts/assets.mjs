import { mkdirSync, writeFileSync } from "node:fs";
const dir = new URL("../apps/web/public/products/", import.meta.url);
mkdirSync(dir, { recursive: true });
const colors = [
  ["#dbe5bf", "#496333", "DAILY", "GREENS"],
  ["#f0d6b6", "#a96b35", "GOLDEN", "OAT BLEND"],
  ["#e0d5eb", "#786482", "CALM", "CACAO"],
  ["#e2e5b5", "#8d963c", "CITRUS", "HYDRATION"],
  ["#d2dfc2", "#547a42", "MORNING", "MATCHA"],
  ["#f0dbc4", "#947354", "VANILLA", "PROTEIN"],
];
for (let i = 0; i < colors.length; i++) {
  const [color, ink, a, b] = colors[i];
  writeFileSync(
    new URL(`product-${i}.svg`, dir),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280"><defs><linearGradient id="body" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${color}"/><stop offset=".45" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="${color}"/></linearGradient><filter id="shadow"><feGaussianBlur stdDeviation="5"/></filter></defs><ellipse cx="124" cy="257" rx="70" ry="10" fill="${ink}" opacity=".12" filter="url(#shadow)"/><path d="M58 44L64 22Q120 13 176 22L182 44 178 230Q174 250 120 253Q64 250 62 230Z" fill="url(#body)" stroke="${ink}" stroke-opacity=".14"/><path d="M60 42Q120 51 180 42" fill="none" stroke="${ink}" stroke-opacity=".25"/><rect x="61" y="47" width="119" height="9" rx="2" fill="${ink}" opacity=".08"/><text x="120" y="93" font-family="Georgia,serif" font-size="13" fill="${ink}" text-anchor="middle">meadow</text><text x="120" y="109" font-family="Georgia,serif" font-size="11" fill="${ink}" text-anchor="middle">&amp; moss</text><path d="M99 131Q120 117 141 131M105 137Q120 126 135 137" fill="none" stroke="${ink}" stroke-width="1" opacity=".6"/><text x="120" y="169" font-family="Arial,sans-serif" font-weight="700" font-size="18" letter-spacing="2" fill="${ink}" text-anchor="middle">${a}</text><text x="120" y="187" font-family="Arial,sans-serif" font-size="11" letter-spacing="1.7" fill="${ink}" text-anchor="middle">${b}</text><text x="120" y="219" font-family="Arial,sans-serif" font-size="7" letter-spacing="1.8" fill="${ink}" text-anchor="middle">YOUR EVERYDAY RITUAL</text><text x="120" y="235" font-family="Arial,sans-serif" font-size="6" fill="${ink}" text-anchor="middle">30 SERVINGS · FICTIONAL DEMO PRODUCT</text><path d="M68 28Q120 35 172 28" fill="none" stroke="${ink}" stroke-opacity=".15"/><path d="M66 228Q120 238 174 228" fill="none" stroke="${ink}" stroke-opacity=".1"/></svg>`,
  );
}
console.log("Six original SVG product illustrations created.");
