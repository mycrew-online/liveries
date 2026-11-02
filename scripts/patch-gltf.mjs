// Rewrites an MSFS (ASOBO_asset_optimized) glTF into a plain glTF that stock
// Blender imports: UVs decoded from half floats to float32, packed normals,
// tangents and colours dropped (Blender recomputes normals), MSFS extensions
// removed, everything written to one new .bin beside the output.
//
//   node scripts/patch-gltf.mjs <src.gltf> <dst.gltf>
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const [src, dst] = process.argv.slice(2);
const g = JSON.parse(readFileSync(src, "utf8"));
const bins = g.buffers.map((b) => readFileSync(resolve(dirname(src), b.uri)));

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function half(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

// Reads an accessor into a plain array of numbers, honouring byteStride.
function read(i, asHalf = false) {
  const a = g.accessors[i], v = g.bufferViews[a.bufferView], buf = bins[v.buffer];
  const n = COUNT[a.type], sz = SIZE[a.componentType];
  const stride = v.byteStride || n * sz, base = (v.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Array(a.count * n);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const o = base + k * stride + c * sz;
    switch (a.componentType) {
      case 5120: out[k * n + c] = buf.readInt8(o); break;
      case 5121: out[k * n + c] = buf.readUInt8(o); break;
      case 5122: out[k * n + c] = asHalf ? half(buf.readUInt16LE(o)) : buf.readInt16LE(o); break;
      case 5123: out[k * n + c] = asHalf ? half(buf.readUInt16LE(o)) : buf.readUInt16LE(o); break;
      case 5125: out[k * n + c] = buf.readUInt32LE(o); break;
      case 5126: out[k * n + c] = buf.readFloatLE(o); break;
    }
  }
  return out;
}

const chunks = [];
let offset = 0;
const views = [], accessors = [];
function push(arr, type, componentType, target) {
  const sz = SIZE[componentType], b = Buffer.alloc(arr.length * sz);
  arr.forEach((x, k) => componentType === 5126 ? b.writeFloatLE(x, k * sz) : b.writeUInt32LE(x, k * sz));
  const pad = (4 - (b.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, ...(target ? { target } : {}) });
  chunks.push(b, Buffer.alloc(pad));
  offset += b.length + pad;
  const acc = { bufferView: views.length - 1, componentType, count: arr.length / COUNT[type], type };
  if (type === "VEC3" && componentType === 5126) {
    acc.min = [Infinity, Infinity, Infinity];
    acc.max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < arr.length; k++) {
      acc.min[k % 3] = Math.min(acc.min[k % 3], arr[k]);
      acc.max[k % 3] = Math.max(acc.max[k % 3], arr[k]);
    }
  }
  accessors.push(acc);
  return accessors.length - 1;
}

const cache = new Map();
function once(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

// Primitives of one mesh share a single vertex and index accessor; the real
// ranges live in extras.ASOBO_primitive (StartIndex, PrimitiveCount triangles,
// BaseVertexIndex, VertexCount), with indices relative to BaseVertexIndex.
// Each primitive gets its own sliced vertex and index arrays.
// Skinned meshes are moved to model space here: their vertices are in the
// space of the skin's skeleton root's parent (identity when the root is a
// top-level joint, e.g. the Fenix wings and slats; the flap arm chain for
// the Fenix LOD00 outboard flaps).
// Column-major 4x4: c[col * 4 + row].
const mul = (a, b) => Array.from({ length: 16 }, (_, k) => [0, 1, 2, 3].reduce((s, j) => s + a[j * 4 + (k & 3)] * b[(k >> 2) * 4 + j], 0));
function local(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1];
}
const parentOf = {};
(g.nodes ?? []).forEach((n, i) => (n.children ?? []).forEach((c) => (parentOf[c] = i)));
const world = (i) => (parentOf[i] === undefined ? local(g.nodes[i]) : mul(world(parentOf[i]), local(g.nodes[i])));
const skinned = new Set((g.nodes ?? []).map((n, i) => (n.skin !== undefined && n.mesh !== undefined ? i : -1)).filter((i) => i >= 0));
const skinOfMesh = new Map([...skinned].map((i) => [g.nodes[i].mesh, g.nodes[i].skin]));
function pose(pos, s, base, vcount) {
  const sk = g.skins[s].skeleton, m = sk === undefined || parentOf[sk] === undefined ? local({}) : world(parentOf[sk]);
  const out = new Array(vcount * 3);
  for (let v = 0; v < vcount; v++) {
    const k = base + v, x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    for (let r = 0; r < 3; r++) out[v * 3 + r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r];
  }
  return out;
}

for (const [mi, m] of g.meshes.entries()) for (const p of m.primitives) {
  const ap = p.extras?.ASOBO_primitive;
  const pos = once("p" + p.attributes.POSITION, () => read(p.attributes.POSITION));
  const base = ap?.BaseVertexIndex ?? 0;
  const vcount = ap?.VertexCount ?? pos.length / 3;
  const at = {};
  const skin = skinOfMesh.get(mi);
  const posed = skin !== undefined;
  at.POSITION = push(posed ? pose(pos, skin, base, vcount) : pos.slice(base * 3, (base + vcount) * 3), "VEC3", 5126, 34962);
  for (const uv of ["TEXCOORD_0", "TEXCOORD_1"]) if (p.attributes[uv] !== undefined) {
    const i = p.attributes[uv], a = g.accessors[i];
    const asHalf = a.componentType === 5122 || a.componentType === 5123;
    const all = once("t" + i, () => read(i, asHalf));
    at[uv] = push(all.slice(base * 2, (base + vcount) * 2), "VEC2", 5126, 34962);
  }
  p.attributes = at;
  if (p.indices !== undefined) {
    const idx = once("i" + p.indices, () => read(p.indices));
    const start = ap?.StartIndex ?? 0;
    const n = ap ? ap.PrimitiveCount * 3 : idx.length;
    p.indices = push(idx.slice(start, start + n), "SCALAR", 5125, 34963);
  }
  delete p.extensions; delete p.extras;
}

// Skins and animations are not needed for UV work; drop them with their
// accessors. Skinned vertices were moved to model space above and a
// skinned mesh's node transform is ignored by glTF, so move such nodes to the
// scene root with no transform.
delete g.animations;
if (skinned.size) {
  for (const n of g.nodes) if (n.children) n.children = n.children.filter((c) => !skinned.has(c));
  for (const sc of g.scenes ?? []) sc.nodes = [...new Set([...(sc.nodes ?? []), ...skinned])];
  for (const i of skinned) { const n = g.nodes[i]; delete n.translation; delete n.rotation; delete n.scale; delete n.matrix; }
}
delete g.skins;
for (const n of g.nodes ?? []) { delete n.skin; delete n.extensions; }
for (const t of g.textures ?? []) {
  const dds = t.extensions?.MSFT_texture_dds;
  if (dds && t.source === undefined) t.source = dds.source;
  delete t.extensions;
}
for (const m of g.materials ?? []) delete m.extensions;
// Images point at KTX2 files Blender can't read; keep names, drop the files.
for (const im of g.images ?? []) { im.name = basename(im.uri ?? im.name ?? ""); delete im.uri; im.uri = "missing.png"; }
delete g.extensionsRequired; delete g.extensionsUsed;

const binName = basename(dst).replace(/\.gltf$/i, ".bin");
g.buffers = [{ uri: binName, byteLength: offset }];
g.bufferViews = views;
g.accessors = accessors;
writeFileSync(resolve(dirname(dst), binName), Buffer.concat(chunks));
writeFileSync(dst, JSON.stringify(g));
