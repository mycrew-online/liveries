// Renders livery artwork SVG to PNG with Edge (Playwright), port and starboard.
//
//   node scripts/render-art.mjs <design> <type> <out dir> [ppm] [--proof]
//
// design: designs/<design>.mjs, type: a319|a320|a321 (geometry from
// work/ref/<type>.json). Writes body_port.png and body_stbd.png (RGBA). With
// --proof also writes proof.png: the artwork multiplied over the reference
// render, a quick look before baking.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FRAME, ROOT } from "../designs/common.mjs";

const require = createRequire(pathToFileURL("C:/msfs-development/playwright/package.json"));
const { chromium } = require("playwright");

const [design, type, out, ppmArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const proof = process.argv.includes("--proof");
const ppm = Number(ppmArg || 100);
const ref = JSON.parse(readFileSync(join(ROOT, "work/ref", type + ".json"), "utf8"));
// design is "<module>-<variant>", e.g. wanted-a.
const [modName, variant] = design.split("-");
const all = await import(pathToFileURL(join(ROOT, "designs", modName + ".mjs")));
const mod = variant ? all.variants[variant] : all;
mkdirSync(out, { recursive: true });

// Aircraft with their own frames (work/ref/<type>.json "frames", e.g. the
// C172) draw each layer in its frame; the plan layer is the view from below,
// nose left, port up.
const frames = ref.frames || {};
const geom = ref.frames ? { ...ref.geom, frames } : ref.geom;
let w, h;
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
async function size(layer) {
  const F = frames[layer] || frames.body || FRAME;
  w = Math.round(F.W * ppm); h = Math.round(F.H * ppm);
  await page.setViewportSize({ width: w, height: h });
}

// Mirror each .flip group about its own centre (starboard side).
const FLIP = `for (const g of document.querySelectorAll('.flip')) {
  const b = g.getBBox(), cx = b.x + b.width / 2;
  g.setAttribute('transform', 'translate(' + 2 * cx + ' 0) scale(-1 1)');
}`;

async function shot(markup, file, flip, background = "", mask = "") {
  const m = mask ? `;-webkit-mask-image:url(${mask});-webkit-mask-size:100% 100%` : "";
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${background}
<div style="position:absolute;inset:0${background ? ";mix-blend-mode:multiply" : ""}${m}">${markup}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  if (flip) await page.evaluate(FLIP);
  await page.screenshot({ path: file, omitBackground: !background, clip: { x: 0, y: 0, width: w, height: h } });
}

// Designs are drawn for the Fenix fuselage (crown at z = 3.215). Other models
// sit higher or lower in their own space, so the design gets the geometry moved
// by the difference and the drawing is moved back by the same amount.
const CROWN = 3.215;
function shifted(fn, g) {
  const dz = g.crown - CROWN;
  if (g.jet || g.frames || Math.abs(dz) < 1e-3) return fn(g); // bizjet designs use their own geometry
  const mv = (b) => b && { ...b, z0: b.z0 - dz, z1: b.z1 - dz };
  const g2 = { ...g, crown: CROWN, belly: g.belly - dz, finTop: g.finTop - dz,
    finProfile: g.finProfile.map(([z, a, b]) => [z - dz, a, b]), engine: mv(g.engine), sharklet: mv(g.sharklet) };
  return fn(g2).replace(/viewBox="(\S+) (\S+) /, (_, x, y) => `viewBox="${x} ${Number(y) + dz} `);
}

// Each layer the design exports (body, engine, sharklet) renders on its own.
for (const layer of ["body", "engine", "sharklet", "plan"]) {
  if (typeof mod[layer] !== "function") continue;
  if (layer === "sharklet" && !ref.geom.sharklet) continue; // e.g. FBW: sharklets on the decal sheet
  await size(layer);
  const markup = shifted(mod[layer], geom);
  writeFileSync(join(out, layer + ".svg"), markup);
  await shot(markup, join(out, layer + "_port.png"), false);
  await shot(markup, join(out, layer + "_stbd.png"), true);
}
if (proof) {
  await size("body");
  const img = readFileSync(join(ROOT, "work/ref", type + ".png")).toString("base64");
  const bg = `<div style="position:absolute;inset:0;background:#b9c3cf"></div><img src="data:image/png;base64,${img}" style="position:absolute;inset:0;width:${w}px;height:${h}px">`;
  const layers = ["body", "engine", "sharklet"].filter((l) => typeof mod[l] === "function").map((l) => mod[l](geom));
  const stack = layers.map((m) => `<div style="position:absolute;inset:0">${m}</div>`).join("");
  await shot(stack, join(out, "proof.png"), false, bg, "data:image/png;base64," + img);
}
await browser.close();
console.log("rendered", design, type, `${w}x${h}`);
