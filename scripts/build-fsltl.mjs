// Builds a brand's FSLTL AI-traffic liveries (A319, A320, A321, A20N, LJ25) as one
// package on top of fsltl-traffic-base. MSFS 2020 format; works in 2024.
//
//   node scripts/build-fsltl.mjs <fleet json> [--only fsltl-a320[-a]] [--skip-textures]
//
// Each type gets one SimObject folder with a [FLTSIM.n] per design variant,
// titled FSLTL_<BRAND>_<TYPE>_<Variant> so traffic tools can match them.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "../designs/common.mjs";
import { filetime, sidecar } from "./ktx2.mjs";

const BLENDER = "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const TEXCONV = join(ROOT, "tools/texconv.exe");
const p = (...a) => join(ROOT, ...a).replaceAll("\\", "/");
const args = process.argv.slice(2);
const fleet = JSON.parse(readFileSync(args[0], "utf8"));
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const skipTextures = args.includes("--skip-textures");

// type: base container, model xml, atlas name, texture fallbacks, ICAO type.
const TYPES = {
  "fsltl-a319": { base: "FSLTL_A319", model: "model.CFM\\FAIB_A319_CFM.xml", atlas: "FAIB_A319_CFM_T", fallbacks: ["TEXTURE.CFM", "TEXTURE"], icao: "A319" },
  "fsltl-a320": { base: "FSLTL_A320", model: "model.CFM_S\\FAIB_A320S_CFM.xml", atlas: "FAIB_A320_CFM_T", fallbacks: ["TEXTURE.CFM", "TEXTURE"], icao: "A320" },
  "fsltl-a321": { base: "FSLTL_A321", model: "model.CFM_S\\FAIB_A321S_CFM.xml", atlas: "FAIB_A321S_CFM_T", fallbacks: ["TEXTURE.CFM_S", "TEXTURE"], icao: "A321" },
  "fsltl-a20n": { base: "FSLTL_A20N", model: "model.CFML_S\\FAIB_A320S_CFML.xml", atlas: "FAIB_A320_CFML_T", fallbacks: ["TEXTURE.CFML_S", "TEXTURE"], icao: "A20N" },
  // Business jet: own design module, whitened template, 2K atlas, painted registrations.
  "fsltl-lj25": { base: "FSLTL_LJ25", model: "model\\HTAI_LEARJET_25_FSX.xml", atlas: "AILEAR25", fallbacks: ["texture"], icao: "LJ25",
    design: "wantedjet", posmap: "fsltl-lj25-2k", tpl: "texlj25-w", regs: ["OK-WJA", "OK-WJB", "OK-WJC", "OK-WJD"],
    maker: "Learjet", uiType: "Learjet 25", role: "Business Jet", parking: "RAMP" },
};

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString();
const blender = (script, a) => {
  const out = run(BLENDER, ["-b", "--factory-startup", "--python", p("blender", script), "--", ...a]);
  if (/Traceback|Error:/.test(out)) throw new Error(script + " failed:\n" + out.split("\n").filter((l) => /Error|Trace|line/.test(l)).join("\n"));
  return out;
};

const pkg = p("dist", `${fleet.brand}-fsltl-traffic`);
const air = join(pkg, "SimObjects/Airplanes");
const brandTag = fleet.brand.toUpperCase();

for (const [type, T] of Object.entries(TYPES)) {
  // fleet.fsltl lists the types a brand has designs for (all when absent).
  if (fleet.fsltl && !fleet.fsltl.includes(type)) continue;
  const folder = `FSLTL_${T.icao}_${fleet.icao}`;
  const dir = join(air, folder);
  const variants = Object.entries(fleet.variants).filter(([v]) => !only || only === type || only === `${type}-${v}`);
  if (!variants.length) continue;
  const flts = [];
  for (const [v, label] of variants) {
    const design = `${T.design || fleet.brand}-${v}`;
    const code = `${fleet.icao}_${v.toUpperCase()}`;
    console.log(`== ${type} ${label}`);
    const art = p("work/art", `${design}-${type}`);
    const comp = p("work/comp", `${design}-${type}`);
    const comp2 = p("work/comp", `${design}-${type}-2k`);
    const thumbs = p("work/thumbs", `${design}-${type}`);
    const dds = p("work/dds", `${design}-${type}`);
    if (!skipTextures) {
      run("node", [p("scripts/render-art.mjs"), design, type, art, "150"]);
      blender("composite.py", [p("work/posmap", T.posmap || `${type}-4k`), p("work", T.tpl || "texfsltl"), art, comp]);
      blender("composite.py", [p("work/posmap", T.posmap || `${type}-2k`), p("work", T.tpl || "texfsltl"), art, comp2, "0.92"]);
      blender("thumbs.py", [p("work", type), thumbs, comp, p("work", T.tpl || "texfsltl")]);
      rmSync(dds, { recursive: true, force: true });
      mkdirSync(dds, { recursive: true });
      for (const f of readdirSync(comp)) run(TEXCONV, ["-nologo", "-y", "-f", "BC7_UNORM", "-m", "0", "-o", dds, join(comp, f)]);
    }
    const tex = join(dir, `TEXTURE.${code}`);
    rmSync(tex, { recursive: true, force: true });
    mkdirSync(tex, { recursive: true });
    const src = join(dds, `${T.atlas.toLowerCase()}.dds`);
    writeFileSync(join(tex, `${T.atlas}.PNG.DDS`), readFileSync(src));
    writeFileSync(join(tex, `${T.atlas}.PNG.DDS.json`), sidecar(["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP"]));
    writeFileSync(join(tex, "texture.cfg"), "[fltsim]\n" + T.fallbacks.map((f, k) => `fallback.${k + 1}=..\\..\\${T.base}\\${f}`).join("\n") + "\n");
    run(TEXCONV, ["-nologo", "-y", "-ft", "jpg", "-o", tex, join(thumbs, "thumbnail.png")]);
    flts.push({ code, label, reg: T.regs?.[Object.keys(fleet.variants).indexOf(v)] });
  }
  mkdirSync(join(dir, `MODEL.${fleet.icao}`), { recursive: true });
  writeFileSync(join(dir, `MODEL.${fleet.icao}`, "model.cfg"), `[model.options]
withExterior_showInterior=FALSE
withExterior_showInterior_hideFirstLod=FALSE
withInterior_forceFirstLod=FALSE
withInterior_showExterior=FALSE

[models]
normal=..\\..\\${T.base}\\${T.model}
`);
  writeFileSync(join(dir, "aircraft.cfg"), `[GENERAL]
icao_type_designator = "${T.icao}"

[VERSION]
major = 1
minor = 0

[VARIATION]
base_container = "..\\${T.base}"
` + flts.map(({ code, label, reg }, n) => `
[FLTSIM.${n}]
title = "FSLTL_${brandTag}_${T.icao}_${label}"
model = "${fleet.icao}"
texture = "${code}"
atc_airline = "${fleet.callsign}"
ui_manufacturer = "${T.maker || "Airbus"}"
ui_type = "${T.uiType || "Airbus " + T.icao}"
ui_variation = "${fleet.title} ${label}"
ui_typerole = "${T.role || "Commercial Airliner"}"
ui_createdby = "${fleet.creator}"
atc_parking_codes = "${fleet.icao}"
atc_parking_types = "${T.parking || "GATE,RAMP"}"
atc_heavy = 0
isairtraffic = 1
isuserselectable = 0
atc_id_enable = 1
icao_airline = "${fleet.icao}"${reg ? `
atc_id = "${reg}"` : ""}
`).join(""));
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}
const files = walk(pkg).filter((f) => !/[\\/](layout|manifest)\.json$/.test(f));
const content = files.map((f) => ({ path: relative(pkg, f).replaceAll("\\", "/"), size: statSync(f).size, date: Number(filetime(statSync(f).mtimeMs)) }));
writeFileSync(join(pkg, "layout.json"), JSON.stringify({ content }, null, 2));
writeFileSync(join(pkg, "manifest.json"), JSON.stringify({
  dependencies: [{ name: "fsltl-traffic-base", package_version: "1.0.0" }],
  content_type: "AIRCRAFT",
  title: `FSLTL ${fleet.title} Traffic Liveries`,
  manufacturer: "Airbus",
  creator: fleet.creator,
  package_version: fleet.version,
  minimum_game_version: "1.37.19",
  release_notes: { neutral: { LastUpdate: "", OlderHistory: "" } },
  total_package_size: String(content.reduce((a, c) => a + c.size, 0)).padStart(20, "0"),
}, null, 2));
console.log("package:", pkg);
