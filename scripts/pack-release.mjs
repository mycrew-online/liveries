#!/usr/bin/env node
// Packs dist/ for the MyCrew app's livery installer: per-item store-only zips
// (textures do not compress) and catalog.json, in work/release/. Publishes
// nothing: upload the folder's files to a GitHub release yourself.
//
//   node scripts/pack-release.mjs                   every package
//   node scripts/pack-release.mjs --only <id,id>    just these items (dry runs)
//   node scripts/pack-release.mjs --catalog-only    sizes and checksums, no zips kept
//
// Zip entries take their paths from each package's layout.json, so case and
// bytes match what was built. The output is deterministic: a fixed date, files
// sorted, so an unchanged livery keeps its checksum and is not downloaded again.
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "work", "release");
const LIMIT = 2_000_000_000; // A GitHub release file stays under 2 GB.

const FENIX = { name: "Fenix A319/A320/A321", folders: ["fnx-aircraft"] };
const FBW = { name: "FlyByWire A32NX", folders: ["flybywire-aircraft-a320-neo"] };
const FSLTL = { name: "FSLTL traffic base", folders: ["fsltl-traffic-base"] };

// Each built package. itemOf splits it by a file's path: one item per livery, or
// null for one item for the whole package (FSLTL's aircraft.cfg lists all the
// variants of a type, so its variants cannot be installed apart). Only 2024
// packages are listed: the app installs into MSFS 2024 only.
const byFolder = (re) => (p) => p.match(re)?.[1] ?? null;
const PACKAGES = [
  { dist: "mycrew-fenix-a32x-2024", folder: "mycrew-fenix-a32x-liveries", sim: "2024", requires: [FENIX], itemOf: byFolder(/\/liveries\/fnx\/([^/]+)\//i), cfg: (i) => `SimObjects/Airplanes/FNX_32X/liveries/fnx/${i}/livery.cfg` },
  { dist: "wanted-fenix-a32x-2024", folder: "wanted-fenix-a32x-liveries", sim: "2024", requires: [FENIX], itemOf: byFolder(/\/liveries\/fnx\/([^/]+)\//i), cfg: (i) => `SimObjects/Airplanes/FNX_32X/liveries/fnx/${i}/livery.cfg` },
  { dist: "mycrew-fbw-a32nx", folder: "mycrew-fbw-a32nx-liveries", sim: "2024", requires: [FBW], itemOf: byFolder(/^SimObjects\/Airplanes\/([^/]+)\//i), cfg: (i) => `SimObjects/AirPlanes/${i}/aircraft.cfg` },
  { dist: "wanted-fbw-a32nx", folder: "wanted-fbw-a32nx-liveries", sim: "2024", requires: [FBW], itemOf: byFolder(/^SimObjects\/Airplanes\/([^/]+)\//i), cfg: (i) => `SimObjects/AirPlanes/${i}/aircraft.cfg` },
  { dist: "mycrew-fsltl-traffic", folder: "mycrew-fsltl-traffic", sim: "2024", requires: [FSLTL], itemOf: () => "traffic" },
  { dist: "wanted-fsltl-traffic", folder: "wanted-fsltl-traffic", sim: "2024", requires: [FSLTL], itemOf: () => "traffic" },
];

const args = process.argv.slice(2);
const flag = (name) => args.indexOf(name);
const only = flag("--only") >= 0 ? new Set(args[flag("--only") + 1].split(",")) : null;
const catalogOnly = flag("--catalog-only") >= 0;

// The fixed date, MS-DOS format: 1 January 2020, midnight.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const CHUNK = 1 << 24;

// writeZip writes a store-only zip of files [{name, from, size}], returning its
// bytes and sha256. Sizes and CRCs are in the local headers, no data descriptors.
function writeZip(to, files) {
  const hash = createHash("sha256");
  const fd = to ? openSync(to, "w") : null;
  let at = 0;
  const put = (buf) => {
    hash.update(buf);
    if (fd !== null) writeSync(fd, buf);
    at += buf.length;
  };
  const central = [];
  const buf = Buffer.allocUnsafe(CHUNK);
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    // The CRC needs the whole file first: read it twice rather than hold it.
    let crc = 0;
    const src = openSync(f.from, "r");
    let got = 0;
    for (;;) {
      const n = readSync(src, buf, 0, CHUNK, null);
      if (n === 0) break;
      crc = zlib.crc32(buf.subarray(0, n), crc);
      got += n;
    }
    if (got !== f.size) throw new Error(`${f.from}: ${got} bytes, layout.json says ${f.size}`);
    const offset = at;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(10, 4); // version needed
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(0, 8); // stored
    head.writeUInt16LE(DOS_TIME, 10);
    head.writeUInt16LE(DOS_DATE, 12);
    head.writeUInt32LE(crc >>> 0, 14);
    head.writeUInt32LE(got, 18);
    head.writeUInt32LE(got, 22);
    head.writeUInt16LE(name.length, 26);
    put(head);
    put(name);
    for (let pos = 0; pos < got; ) {
      const n = readSync(src, buf, 0, CHUNK, pos);
      put(buf.subarray(0, n));
      pos += n;
    }
    closeSync(src);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(10, 4); // version made by
    c.writeUInt16LE(10, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt16LE(DOS_TIME, 12);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(got, 20);
    c.writeUInt32LE(got, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    if (at > LIMIT) throw new Error(`${to}: over the 2 GB limit`);
  }
  const cdAt = at;
  for (const b of central) put(b);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  if (files.length > 0xffff) throw new Error(`${to}: too many files`);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(at - cdAt, 12);
  end.writeUInt32LE(cdAt, 16);
  put(end);
  if (fd !== null) closeSync(fd);
  if (at > LIMIT) throw new Error(`${to}: ${at} bytes is over the 2 GB limit`);
  return { size: at, sha256: hash.digest("hex") };
}

// describe reads a livery's name from its config.
function describe(file) {
  const out = {};
  if (!file || !existsSync(file)) return out;
  const text = readFileSync(file, "latin1");
  const name = text.match(/^\s*(?:name|title)\s*=\s*"?([^"\r\n]+)"?/im);
  const reg = text.match(/^\s*atc_id\s*=\s*"?([^"\r\n]+)"?/im);
  const req = text.match(/^\s*required_tags\s*=\s*"?([A-Z0-9]+)/im);
  if (name) out.title = name[1].trim();
  if (reg) out.registration = reg[1].trim();
  if (req) out.type = req[1].trim();
  return out;
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
mkdirSync(OUT, { recursive: true });
const catalog = { version: 1, packages: [] };
let written = 0;

for (const def of PACKAGES) {
  const dir = join(DIST, def.dist);
  const layout = JSON.parse(readFileSync(join(dir, "layout.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const groups = new Map();
  for (const e of layout.content) {
    const id = def.itemOf(e.path);
    if (!id) throw new Error(`${def.dist}: no item for ${e.path}`);
    if (!/^simobjects\//i.test(e.path)) throw new Error(`${def.dist}: ${e.path} is outside SimObjects, the installer refuses it`);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ name: e.path, from: join(dir, e.path), size: e.size });
  }
  const pkg = { folder: def.folder, title: manifest.title, sim: def.sim, version: manifest.package_version, requires: def.requires, manifest, items: [] };
  for (const [id, files] of [...groups].sort((a, b) => compare(a[0], b[0]))) {
    const itemId = groups.size === 1 ? def.dist : id.toLowerCase();
    if (only && !only.has(itemId)) continue;
    files.sort((a, b) => compare(a.name, b.name));
    const zipName = `${def.dist}--${itemId}.zip`;
    const { size, sha256 } = writeZip(catalogOnly ? null : join(OUT, zipName), files);
    const info = def.cfg ? describe(join(dir, files.find((f) => f.name.toLowerCase() === def.cfg(id).toLowerCase())?.name ?? "\0")) : {};
    const title = info.title ?? manifest.title;
    pkg.items.push({ id: itemId, title, registration: info.registration, type: info.type, size, unpacked: files.reduce((a, f) => a + f.size, 0), sha256, url: zipName });
    written += size;
    console.log(`${zipName}  ${(size / 1e6).toFixed(1)} MB`);
  }
  if (pkg.items.length) catalog.packages.push(pkg);
}

if (only) {
  const found = new Set(catalog.packages.flatMap((p) => p.items.map((i) => i.id)));
  for (const id of only) if (!found.has(id)) throw new Error(`--only: no item ${id}`);
}
writeFileSync(join(OUT, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`catalog.json: ${catalog.packages.length} packages, ${(written / 1e9).toFixed(2)} GB in ${OUT}`);
