// Type specimen: both fuselage titles in every candidate face.
//   node scripts/specimen.mjs <out dir>
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FONT_CSS } from "../designs/common.mjs";
const require = createRequire(pathToFileURL("C:/msfs-development/playwright/package.json"));
const { chromium } = require("playwright");

const out = process.argv[2];
const FACES = [
  ["IBM Plex Sans", "Plex", 100], ["Archivo Expanded", "Archivo", 125], ["Saira Expanded", "Saira", 125],
  ["Sora", "Sora", 100], ["Red Hat Display", "RedHat", 100], ["Outfit", "Outfit", 100], ["Fraunces", "Fraunces", 100],
];
const rows = (html) => FACES.map(([label, fam, st]) =>
  `<div class="row"><span class="l">${label}</span><span class="t" style="font-family:${fam};font-stretch:${st}%">${html}</span></div>`).join("");
const page = (bg, html) => `<style>${FONT_CSS}
body{margin:0;background:${bg};padding:24px 36px;font-family:Plex}
.row{display:flex;align-items:baseline;gap:32px;padding:12px 0;border-bottom:1px solid #0001}
.l{width:230px;font:500 20px Plex;color:#7a8592;flex:none}.t{font-size:64px;line-height:1}</style>${rows(html)}`;

const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1600, height: 200 } });
const shots = {
  "specimen-wanted.png": page("#ffffff", `<b style="color:#0f1420;font-weight:760">WANTED</b><span style="color:#e8622a;font-weight:400">.solutions</span>`),
  "specimen-mycrew.png": page("#ffffff", `<b style="color:#2b3440;font-weight:700">My</b><b style="color:#e0a63a;font-weight:700">Crew</b>`),
};
for (const [file, html] of Object.entries(shots)) {
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(out, file), fullPage: true, type: "png" });
}
await b.close();
