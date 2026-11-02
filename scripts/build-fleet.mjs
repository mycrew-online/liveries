// Builds a brand's Fenix A319/A320/A321 livery packages for MSFS 2024 and
// MSFS 2020 from the designs and the per-type position maps.
//
//   node scripts/build-fleet.mjs <fleet json> [--only a319-a] [--skip-textures]
//
// Needs work/posmap/<type>-8k (blender/posmap.py) and work/ref/<type>.json.
// Writes dist/<brand>-fenix-a32x-2024 and dist/<brand>-fenix-a32x-2020.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { ROOT } from "../designs/common.mjs";
import { ddsToKtx2, filetime, sidecar } from "./ktx2.mjs";

const BLENDER = "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const TEXCONV = join(ROOT, "tools/texconv.exe");
const p = (...a) => join(ROOT, ...a).replaceAll("\\", "/");
const args = process.argv.slice(2);
const fleet = JSON.parse(readFileSync(args[0], "utf8"));
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const skipTextures = args.includes("--skip-textures");

const TYPES = {
  a319: { tag: "A319", base2020: "FNX_319_CFM", fallbacks: ["FNX_319_CFM\\texture", "FNX_320_CFM\\texture", "FNX_320_CFM\\texture.VC", "FNX_320_CFM\\texture.Cabin"] },
  a320: { tag: "A320", base2020: "FNX_320_CFM_SL", fallbacks: ["FNX_320_CFM\\texture", "FNX_320_CFM\\texture.VC", "FNX_320_CFM\\texture.Cabin"] },
  a321: { tag: "A321", base2020: "FNX_321_CFM_SL", fallbacks: ["FNX_321_CFM\\texture", "FNX_320_CFM\\texture", "FNX_320_CFM\\texture.VC", "FNX_320_CFM\\texture.Cabin"] },
};

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString();
const blender = (script, a) => {
  const out = run(BLENDER, ["-b", "--factory-startup", "--python", p("blender", script), "--", ...a]);
  if (/Traceback|Error:/.test(out)) throw new Error(script + " failed:\n" + out.split("\n").filter((l) => /Error|Trace|line/.test(l)).join("\n"));
  return out;
};

// Real texture file names (e.g. A320_STABS_ALBEDO) from the model, by key.
function textureNames(type) {
  const names = {};
  for (const f of readdirSync(p("work", type)).filter((f) => f.endsWith(".gltf"))) {
    for (const im of JSON.parse(readFileSync(p("work", type, f), "utf8")).images ?? []) {
      const base = (im.name || "").replace(/\.PNG\.KTX2$/i, "");
      const key = base.toLowerCase().replace("albedo", "albd");
      if (base) names[key] = base;
    }
  }
  return names;
}

const out2024 = p("dist", `${fleet.brand}-fenix-a32x-2024`);
const out2020 = p("dist", `${fleet.brand}-fenix-a32x-2020`);
const air2024 = join(out2024, "SimObjects/Airplanes/FNX_32X/liveries/fnx");
const air2020 = join(out2020, "SimObjects/Airplanes");

const liveries = [];
let n = 0;
for (const [type, t] of Object.entries(fleet.types)) {
  Object.keys(fleet.variants).forEach((v, i) => {
    liveries.push({ type, v, reg: t.regs[i], selcal: fleet.selcal[n++ % fleet.selcal.length] });
  });
}

for (const l of liveries) {
  if (only && only !== `${l.type}-${l.v}`) continue;
  const T = TYPES[l.type];
  const design = `${fleet.brand}-${l.v}`;
  const id = `${fleet.brand}-${l.type}-${l.reg.toLowerCase()}`;
  const name = `${fleet.title} ${fleet.variants[l.v]} ${l.reg}`;
  console.log(`== ${id} (${name})`);
  const art = p("work/art", `${design}-${l.type}-hi`);
  const comp8 = p("work/comp", `${design}-${l.type}-8k`);
  const comp2 = p("work/comp", `${design}-${l.type}-2k`);
  const thumbs = p("work/thumbs", id);
  const dds = p("work/dds", id);

  if (!skipTextures) {
    run("node", [p("scripts/render-art.mjs"), design, l.type, art, "200"]);
    blender("composite.py", [p("work/posmap", `${l.type}-4k`), p("work/tex8k"), art, comp8]);
    blender("composite.py", [p("work/posmap", `${l.type}-2k`), p("work/tex2k"), art, comp2]);
    blender("thumbs.py", [p("work", l.type), thumbs, comp2, p("work/tex2k")]);
    rmSync(dds, { recursive: true, force: true });
    mkdirSync(dds, { recursive: true });
    for (const f of readdirSync(comp8)) {
      run(TEXCONV, ["-nologo", "-y", "-f", "BC7_UNORM", "-m", "0", "-o", dds, join(comp8, f)]);
    }
  }

  // MSFS 2024: modular livery for FNX_32X.
  const names = textureNames(l.type);
  const d24 = join(air2024, id);
  rmSync(d24, { recursive: true, force: true });
  mkdirSync(join(d24, "texture"), { recursive: true });
  mkdirSync(join(d24, "thumbnail"), { recursive: true });
  // MSFS 2020: variation of the Fenix base container.
  const folder = `${fleet.icao}_${T.base2020}_${l.reg}`;
  const d20 = join(air2020, folder);
  const tex20 = join(d20, `TEXTURE.${l.reg}`);
  rmSync(d20, { recursive: true, force: true });
  mkdirSync(tex20, { recursive: true });

  for (const f of readdirSync(dds).filter((f) => f.endsWith(".dds"))) {
    const key = f.replace(/\.dds$/i, "");
    const tex = names[key];
    if (!tex) { console.log("  no model texture for", key, "- skipped"); continue; }
    const buf = readFileSync(join(dds, f));
    writeFileSync(join(d24, "texture", `${tex}.PNG.KTX2`), ddsToKtx2(buf));
    writeFileSync(join(d24, "texture", `${tex}.PNG.KTX2.json`), sidecar(["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP", "FL_BITMAP_QUALITY_HIGH"]));
    writeFileSync(join(tex20, `${tex}.PNG.DDS`), buf);
    writeFileSync(join(tex20, `${tex}.PNG.DDS.json`), sidecar(["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP"]));
  }
  for (const f of ["thumbnail.png", "thumbnail_button.png", "thumbnail_side.png"]) copyFileSync(join(thumbs, f), join(d24, "thumbnail", f));
  copyFileSync(join(thumbs, "thumbnail_side.png"), join(tex20, "thumbnail_side.png"));
  copyFileSync(join(thumbs, "thumbnail.png"), join(tex20, "thumbnail.png"));

  const fnx = [
    `fnx_selcal_code = "${l.selcal}"`,
    "fnx_registration_panel_enabled = 1",
    "fnx_wifi_antenna_type = 1",
    "fnx_wingbox_type = 1",
    "fnx_efb_mount_type = 1",
  ].join("\n");
  writeFileSync(join(d24, "livery.cfg"), `[SELECTION]
required_tags = "${T.tag},CFM"

[GENERAL]
name = "${name}"

[FLTSIM]
atc_id = "${l.reg}"
atc_airline = "${fleet.callsign}"
icao_airline = "${fleet.icao}"
atc_parking_types = "GATE,RAMP"
atc_parking_codes = "${fleet.icao}"

${fnx}
`);
  writeFileSync(join(d20, "aircraft.cfg"), `[VERSION]
major = 1
minor = 0

[VARIATION]
base_container = "..\\${T.base2020}"

[FLTSIM.0]
title = "${name}"
texture = "${l.reg}"
model = ""
ui_variation = "${name}"
atc_id = "${l.reg}"
atc_airline = "${fleet.callsign}"
icao_airline = "${fleet.icao}"
atc_parking_types = "GATE,RAMP"
atc_parking_codes = "${fleet.icao}"
isAirTraffic = 0
CanBeUsedByAITraffic = 0
${fnx.replaceAll(" = ", "=")}
`);
  writeFileSync(join(tex20, "texture.cfg"), "[fltsim]\n" + T.fallbacks.map((f, k) => `fallback.${k + 1}=..\\..\\${f}`).join("\n") + "\n");
}

// Package files: manifest.json and layout.json for both sims.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}
function finish(dir, manifest) {
  if (!existsSync(dir)) return;
  const files = walk(dir).filter((f) => !/[\\/](layout|manifest)\.json$/.test(f));
  const content = files.map((f) => ({ path: relative(dir, f).replaceAll("\\", "/"), size: statSync(f).size, date: Number(filetime(statSync(f).mtimeMs)) }));
  writeFileSync(join(dir, "layout.json"), JSON.stringify({ content }, null, 2));
  const total = content.reduce((a, c) => a + c.size, 0);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...manifest, total_package_size: String(total).padStart(20, "0") }, null, 2));
}
const common = {
  manufacturer: "Airbus",
  creator: fleet.creator,
  package_version: fleet.version,
  release_notes: { neutral: { LastUpdate: "", OlderHistory: "" } },
};
finish(out2024, { dependencies: [], content_type: "LIVERY", title: `Fenix A319/A320/A321 ${fleet.title} Liveries`, ...common, minimum_game_version: "1.4.20", minimum_compatibility_version: "4.20.0.73", builder: "Microsoft Flight Simulator 2024" });
finish(out2020, { dependencies: [{ name: "fnx320" }], content_type: "AIRCRAFT", title: `Fenix A319/A320/A321 ${fleet.title} Liveries`, ...common, minimum_game_version: "1.7.14" });
console.log("packages:", out2024, out2020);
