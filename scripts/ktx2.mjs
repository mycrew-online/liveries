// Wraps a BC7 DDS (texconv output, full mip chain) as an MSFS 2024 KTX2 and
// writes its .json sidecar, matching what the MSFS 2024 package tool emits
// for albedo textures (vkFormat 145 BC7_UNORM, ASOBO key/values).
//
//   node scripts/ktx2.mjs <in.dds> <out.PNG.KTX2>
import { readFileSync, writeFileSync } from "node:fs";

// Data format descriptor and key/value block copied from a fuselage albedo
// built by the MSFS 2024 SDK (flags: COMPRESSION MIPMAP QUALITY_HIGH).
const DFD = "2c00000000000000020028008601010003030000100000000000000000007f000000000000000000ffffffff";
const KVD = "5100000041534f424f5f666c6167730042494c494e45415200434f4d5052455353494f4e004d49504d4150005245445543455f4c45535300504c4154464f524d5f464f524d4154005155414c4954595f48494748000000001000000041534f424f5f6f7061636974696573000e00000041534f424f5f7472616e7370000000001400000041534f424f74657876657273696f6e00010000001a0000004b54587772697465720041534f424f5f466c6967687453696d000000";
const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const align16 = (n) => (n + 15) & ~15;

export function ddsToKtx2(dds) {
  if (dds.toString("latin1", 0, 4) !== "DDS ") throw new Error("not a DDS");
  const h = dds.readUInt32LE(12), w = dds.readUInt32LE(16);
  const mips = Math.max(1, dds.readUInt32LE(28));
  const fourcc = dds.toString("latin1", 84, 88);
  if (fourcc !== "DX10") throw new Error("expected a DX10 (BC7) DDS");
  const dxgi = dds.readUInt32LE(128);
  if (dxgi !== 98) throw new Error("expected BC7_UNORM (DXGI 98), got " + dxgi);
  let off = 4 + 124 + 20;
  const levels = [];
  for (let i = 0; i < mips; i++) {
    const lw = Math.max(1, w >> i), lh = Math.max(1, h >> i);
    const size = Math.max(1, Math.ceil(lw / 4)) * Math.max(1, Math.ceil(lh / 4)) * 16;
    levels.push(dds.subarray(off, off + size));
    off += size;
  }
  const dfd = Buffer.from(DFD, "hex"), kvd = Buffer.from(KVD, "hex");
  const dfdOff = 80 + mips * 24, kvdOff = dfdOff + dfd.length;
  let pos = align16(kvdOff + kvd.length);
  // Levels are stored smallest first.
  const offsets = new Array(mips);
  for (let i = mips - 1; i >= 0; i--) { offsets[i] = pos; pos = align16(pos + levels[i].length); }
  const out = Buffer.alloc(pos);
  Buffer.from(ID).copy(out, 0);
  const u32 = [145, 1, w, h, 0, 0, 1, mips, 0, dfdOff, dfd.length, kvdOff, kvd.length];
  u32.forEach((v, i) => out.writeUInt32LE(v, 12 + i * 4));
  out.writeBigUInt64LE(0n, 64); out.writeBigUInt64LE(0n, 72);
  for (let i = 0; i < mips; i++) {
    const o = 80 + i * 24;
    out.writeBigUInt64LE(BigInt(offsets[i]), o);
    out.writeBigUInt64LE(BigInt(levels[i].length), o + 8);
    out.writeBigUInt64LE(BigInt(levels[i].length), o + 16);
    levels[i].copy(out, offsets[i]);
  }
  dfd.copy(out, dfdOff); kvd.copy(out, kvdOff);
  return out;
}

// Windows FILETIME (100 ns ticks since 1601) for sidecars and layout.json.
export const filetime = (ms = Date.now()) => BigInt(Math.round(ms)) * 10000n + 116444736000000000n;

export const sidecar = (flags) => JSON.stringify({ Version: 2, SourceFileDate: Number(filetime()), Flags: flags });

if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`) {
  const [src, dst] = process.argv.slice(2);
  writeFileSync(dst, ddsToKtx2(readFileSync(src)));
  writeFileSync(dst + ".json", sidecar(["FL_BITMAP_COMPRESSION", "FL_BITMAP_MIPMAP", "FL_BITMAP_QUALITY_HIGH"]));
}
