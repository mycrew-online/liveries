// Copies the fin outline measured on a Fenix model onto another model of the
// same type (FBW, FSLTL): same airframe, so only the tail end and crown move.
//   node scripts/fin-from.mjs <fenix type> <target type>
import { readFileSync, writeFileSync } from "node:fs";
const [src, dst] = process.argv.slice(2);
const a = JSON.parse(readFileSync(`work/ref/${src}.json`, "utf8"));
const b = JSON.parse(readFileSync(`work/ref/${dst}.json`, "utf8"));
const ds = b.geom.L - a.geom.L, dz = b.geom.crown - a.geom.crown;
b.geom.finProfile = a.geom.finProfile.map(([z, le, te]) => [+(z + dz).toFixed(3), +(le + ds).toFixed(3), +(te + ds).toFixed(3)]);
b.geom.finLE = +(a.geom.finLE + ds).toFixed(3);
b.geom.finTE = +(a.geom.finTE + ds).toFixed(3);
b.geom.finTop = +(a.geom.finTop + dz).toFixed(3);
b.geom.finFrom = src;
writeFileSync(`work/ref/${dst}.json`, JSON.stringify(b, null, 2));
console.log(dst, "fin from", src, "LE", b.geom.finLE, "TE", b.geom.finTE, "top", b.geom.finTop);
