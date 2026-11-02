// Builds a brand's FlyByWire A32NX livery package (MSFS 2020 format; FBW's
// A32NX is a 2020-format aircraft, so the same package works in MSFS 2024).
//
//   node scripts/build-fbw.mjs <fleet json> [--only a] [--skip-textures]
//
// Needs work/fbw (converted model), work/ref/fbw.json, work/posmap/fbw-4k and
// fbw-2k, work/texfbw (base textures), work/texfbw-w / -w2k (whitened) and
// work/texfbw-ov (FBW decal sheet, PNG, for the thumbnails).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString();
const blender = (script, a) => {
  const out = run(BLENDER, ["-b", "--factory-startup", "--python", p("blender", script), "--", ...a]);
  if (/Traceback|Error:/.test(out)) throw new Error(script + " failed:\n" + out.split("\n").filter((l) => /Error|Trace|line/.test(l)).join("\n"));
  return out;
};

const pkg = p("dist", `${fleet.brand}-fbw-a32nx`);
const air = join(pkg, "SimObjects/AirPlanes");
const NAMES = { a320neo_airframe_fuselage_albd: "A320NEO_AIRFRAME_FUSELAGE_ALBD", a320neo_airframe_engines_albd: "A320NEO_AIRFRAME_ENGINES_ALBD", a320neo_airframe_wings_albd: "A320NEO_AIRFRAME_WINGS_ALBD" };

Object.keys(fleet.variants).forEach((v, i) => {
  if (only && only !== v) return;
  const reg = fleet.fbw.regs[i];
  const design = `${fleet.brand}-${v}`;
  const id = `${fleet.brand}-fbw-${reg.toLowerCase()}`;
  const name = `${fleet.title} ${fleet.variants[v]} ${reg}`;
  console.log(`== ${id} (${name})`);
  const art = p("work/art", `${design}-fbw-hi`);
  const comp = p("work/comp", `${design}-fbw-4k`);
  const comp2 = p("work/comp", `${design}-fbw-2k`);
  const thumbs = p("work/thumbs", id);
  const dds = p("work/dds", id);

  if (!skipTextures) {
    run("node", [p("scripts/render-art.mjs"), design, "fbw", art, "200"]);
    blender("composite.py", [p("work/posmap/fbw-4k"), p("work/texfbw-w"), art, comp, "0.92", "4096"]);
    blender("composite.py", [p("work/posmap/fbw-2k"), p("work/texfbw-w2k"), art, comp2]);
    // Decal sheet: sharklets in the variant colour; texts sheet left empty so
    // FBW's own titles do not show.
    // The decal sheet duplicates parts of the fuselage (tail, rudder, doors);
    // the painted fuselage under it is right, so the sheet starts transparent
    // and only the sharklets are coloured.
    const sheetBase = p("work/texfbw/A320NEO_AIRFRAME_LIVERY_ALBD.png");
    blender("neo_sheet.py", [sheetBase, "-", join(comp, "a320neo_airframe_livery_albd.png"), "blank"]);
    blender("neo_sheet.py", [sheetBase, "-", join(comp2, "a320neo_airframe_livery_albd.png"), "blank"]);
    blender("neo_sheet.py", [sheetBase, p("work/posmap/fbw-wings-4k/a320neo_airframe_livery_albd.png"), join(comp, "a320neo_airframe_livery_albd.png"), fleet.fbw.sharklet[v]]);
    blender("neo_sheet.py", [sheetBase, p("work/posmap/fbw-wings-2k/a320neo_airframe_livery_albd.png"), join(comp2, "a320neo_airframe_livery_albd.png"), fleet.fbw.sharklet[v]]);
    blender("thumbs.py", [p("work/fbw"), thumbs, comp2, p("work/texfbw-w2k"), p("work/texfbw-ov")]);
    rmSync(dds, { recursive: true, force: true });
    mkdirSync(dds, { recursive: true });
    for (const f of readdirSync(comp)) run(TEXCONV, ["-nologo", "-y", "-f", "BC7_UNORM", "-m", "0", "-o", dds, join(comp, f)]);
    // A fully transparent texts sheet.
    const blank = join(dds, "blank.png");
    blender("neo_sheet.py", [sheetBase, "-", blank, "blank"]);
    run(TEXCONV, ["-nologo", "-y", "-f", "BC7_UNORM", "-m", "0", "-w", "512", "-h", "512", "-o", dds, blank]);
  }

  const folder = `${fleet.icao}_A32NX_${reg}`;
  const dir = join(air, folder);
  rmSync(dir, { recursive: true, force: true });
  const tex = join(dir, `TEXTURE.${reg}`);
  mkdirSync(tex, { recursive: true });
  mkdirSync(join(dir, `MODEL.${reg}`), { recursive: true });
  for (const f of readdirSync(dds).filter((f) => f.endsWith(".dds") && f !== "blank.dds")) {
    const key = f.replace(/\.dds$/i, "");
    const texName = NAMES[key] ?? (key === "a320neo_airframe_livery_albd" ? "A320NEO_AIRFRAME_LIVERY_ALBD" : null);
    if (!texName) continue;
    copyFileSync(join(dds, f), join(tex, `${texName}.PNG.DDS`));
    const decal = texName.includes("LIVERY");
    writeFileSync(join(tex, `${texName}.PNG.DDS.json`), decal
      ? JSON.stringify({ Version: 2, SourceFileDate: Number(filetime()), Flags: ["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP"], HasTransp: true })
      : sidecar(["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP"]));
  }
  // Blank decal sheets: the house livery's titles and the door placards.
  for (const name of ["A320NEO_AIRFRAME_LIVERY_TEXTS_ALBD", "DECALS_DOOR_STICKERS_RIBBON_ALBD"]) {
    copyFileSync(join(dds, "blank.dds"), join(tex, `${name}.PNG.DDS`));
    writeFileSync(join(tex, `${name}.PNG.DDS.json`), JSON.stringify({ Version: 2, SourceFileDate: Number(filetime()), Flags: ["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP"], HasTransp: true }));
  }
  run(TEXCONV, ["-nologo", "-y", "-ft", "jpg", "-o", tex, join(thumbs, "thumbnail.png")]);
  run(TEXCONV, ["-nologo", "-y", "-ft", "jpg", "-w", "360", "-h", "172", "-o", dirTmp(tex), join(thumbs, "thumbnail.png")]);
  copyFileSync(join(dirTmp(tex), "thumbnail.jpg"), join(tex, "thumbnail_small.jpg"));
  rmSync(dirTmp(tex), { recursive: true, force: true });
  writeFileSync(join(tex, "texture.cfg"), `[fltsim]
fallback.1=..\\..\\FlyByWire_A320_NEO\\TEXTURE
fallback.2=..\\..\\..\\..\\texture\\DetailMap
fallback.3=..\\..\\..\\..\\texture\\Glass
fallback.4=..\\..\\..\\..\\texture\\Interiors
fallback.5=..\\..\\..\\..\\texture
`);
  writeFileSync(join(dir, `MODEL.${reg}`, "model.cfg"), `[model.options]
withExterior_showInterior=TRUE
withExterior_showInterior_hideFirstLod=TRUE
withInterior_forceFirstLod=TRUE
withInterior_showExterior=TRUE

[models]
normal=../../FlyByWire_A320_NEO/model/A320_NEO.xml
interior=../../FlyByWire_A320_NEO/model/A320_NEO_INTERIOR.xml
`);
  writeFileSync(join(dir, "aircraft.cfg"), `[VERSION]
major = 1
minor = 0

[VARIATION]
base_container = "..\\FlyByWire_A320_NEO"

[FLTSIM.0]
title = "A32NX ${name}"
ui_variation = "${name}"
texture = "${reg}"
model = "${reg}"
atc_id = "${reg}"
atc_airline = "${fleet.callsign}"
icao_airline = "${fleet.icao}"
atc_parking_types = "GATE,RAMP"
atc_parking_codes = "${fleet.icao}"
isAirTraffic = 0
isUserSelectable = 1
`);
});

function dirTmp(tex) { const d = join(tex, "..", "_small"); mkdirSync(d, { recursive: true }); return d; }

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
}
const files = walk(pkg).filter((f) => !/[\\/](layout|manifest)\.json$/.test(f));
const content = files.map((f) => ({ path: relative(pkg, f).replaceAll("\\", "/"), size: statSync(f).size, date: Number(filetime(statSync(f).mtimeMs)) }));
writeFileSync(join(pkg, "layout.json"), JSON.stringify({ content }, null, 2));
writeFileSync(join(pkg, "manifest.json"), JSON.stringify({
  dependencies: [{ name: "flybywire-aircraft-a320-neo", package_version: "0.1.0" }],
  content_type: "LIVERY",
  title: `FlyByWire A32NX ${fleet.title} Liveries`,
  manufacturer: "Airbus",
  creator: fleet.creator,
  package_version: fleet.version,
  minimum_game_version: "1.37.19",
  release_notes: { neutral: { LastUpdate: "", OlderHistory: "" } },
  total_package_size: String(content.reduce((a, c) => a + c.size, 0)).padStart(20, "0"),
}, null, 2));
console.log("package:", pkg);
