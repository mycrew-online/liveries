// Writes a bake job for blender/bake.py and prints its path.
//   node scripts/job.mjs <design> <type> <size> [targets]
// size 2048 bakes drafts on the 2K template copies, anything else uses the
// full-resolution paint kit templates.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../designs/common.mjs";

const [design, type, size = "8192", targets = `${type}_fuse_|tail|stabs|cowling|sharklets`] = process.argv.slice(2);
const p = (...a) => join(ROOT, ...a).replaceAll("\\", "/");
const draft = size === "2048";
const job = {
  parts: p("work", type),
  ref: p("work/ref", type + ".json"),
  art: p("work/art", `${design}-${type}`),
  base: draft ? p("work/tex2k") : p("work/tex8k"),
  out: p("work/bake", `${design}-${type}-${draft ? "2k" : "8k"}`),
  size: Number(size),
  targets,
};
mkdirSync(p("work/jobs"), { recursive: true });
const file = p("work/jobs", `${design}-${type}-${size}.json`);
writeFileSync(file, JSON.stringify(job, null, 2));
console.log(file);
