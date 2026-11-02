// Shared bits for livery artwork.
//
// Artwork is SVG in metres in the design frame: x = s (metres aft of the
// nose), y = -z (model Z up). Draw the port side (nose left). Anything that
// must read correctly (text, logos) goes in a group with class="flip"; for the
// starboard side the renderer mirrors each such group about its own centre,
// so it reads correctly from that side too while the paint shapes stay put.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FRAME = { S0: -1, W: 48, Z0: -4.5, H: 18 };

const b64 = (p) => readFileSync(join(ROOT, p)).toString("base64");
// Title faces (all OFL, variable). Width axis as font-stretch where the face has one.
const FACES = [
  ["Plex", "IBMPlexSans-VF.ttf", "85% 100%"],
  ["Archivo", "Archivo-VF.ttf", "62% 125%"],
  ["Saira", "Saira-VF.ttf", "50% 125%"],
  ["Sora", "Sora-VF.ttf", "100%"],
  ["RedHat", "RedHatDisplay-VF.ttf", "100%"],
  ["Outfit", "Outfit-VF.ttf", "100%"],
  ["Fraunces", "Fraunces-VF.ttf", "100%"],
];
export const FONT_CSS = FACES.map(([f, file, w]) =>
  `@font-face{font-family:"${f}";src:url(data:font/ttf;base64,${b64("brand/fonts/" + file)}) format("truetype");font-weight:100 900;font-stretch:${w}}`).join("");

// frame: the design frame the artwork covers (FRAME unless the aircraft has its own).
export function svg(body, defs = "", frame = FRAME) {
  const { S0, W, Z0, H } = frame;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${S0} ${-(Z0 + H)} ${W} ${H}" width="100%" height="100%">
<defs><style>${FONT_CSS} text{font-family:Plex}</style>${SMOOTH}${HEX_GRADIENT("hex")}${defs}</defs>${body}</svg>`;
}

// Path data in (s, z) pairs: P`M ${[1, 2]} L ${[3, 4]}` -> "M 1 -2 L 3 -4".
export function P(strings, ...pts) {
  return strings.reduce((a, s, i) => a + s + (i < pts.length ? `${pts[i][0].toFixed(3)} ${(-pts[i][1]).toFixed(3)}` : ""), "");
}

// The WANTED.solutions W mark, traced from the 512 px logo (run-length rows).
// Smoothed by the "smooth" filter when drawn. Replace with the vector logo.
const trace = JSON.parse(readFileSync(join(ROOT, "brand/wanted-trace.json"), "utf8"));
export const SMOOTH = `<filter id="smooth" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
<feGaussianBlur stdDeviation="1.6"/><feComponentTransfer><feFuncA type="linear" slope="12" intercept="-5.5"/></feComponentTransfer></filter>`;

// W mark centred at (s, z), `height` metres tall (hexagon height).
export function wantedMark(s, z, height, fill = "#fff", rotate = 0) {
  const k = height / 495; // hexagon is 495 px tall in the trace
  return `<g class="flip"><g transform="translate(${s} ${-z}) rotate(${rotate}) scale(${k}) translate(-255.5 -255.5)">
<path d="${trace.mark}" fill="${fill}" filter="url(#smooth)"/></g></g>`;
}

// The full hexagon logo (gradient hexagon + white W), centred at (s, z).
export function wantedLogo(s, z, height, rotate = 0, hexFill = "url(#hex)") {
  const k = height / 495;
  return `<g class="flip"><g transform="translate(${s} ${-z}) rotate(${rotate}) scale(${k}) translate(-255.5 -255.5)">
<polygon points="255.5,8 470,131.75 470,379.25 255.5,503 41,379.25 41,131.75" fill="${hexFill}"/>
<path d="${trace.mark}" fill="#fff" filter="url(#smooth)"/></g></g>`;
}

export const HEX_GRADIENT = (id = "hexgrad") =>
  `<linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${trace.bottom_left}"/><stop offset="1" stop-color="${trace.top_right}"/></linearGradient>`;

// The MyCrew mark (24-unit viewBox, nose up), centred at (s, z), `height` metres.
const MYCREW = "M12 3.3c.6 0 1 .7 1 1.5v4l5.7 3.3v1.5L13 11.9v3.4l1.6 1.3v1L12 17l-2.6.6v-1l1.6-1.3v-3.4l-5.7 1.7v-1.5L11 8.8v-4c0-.8.4-1.5 1-1.5z";
export function mycrewMark(s, z, height, fill = "#fff", rotate = 0) {
  const k = height / 14.3; // mark spans y 3.3..17.6
  return `<g class="flip"><g transform="translate(${s} ${-z}) rotate(${rotate}) scale(${k}) translate(-12 -10.45)"><path d="${MYCREW}" fill="${fill}"/></g></g>`;
}

// The MyCrew hexagon logo (brand/mycrew-logo.svg, 1000-unit viewBox, hexagon
// 830.5 tall, centred at 500 500), centred at (s, z), `height` metres.
// Colours: bg the grey hexagon ("none" drops it), gold the cube faces, line the navy.
export const MC_HEX = { w: 0.866, h: 1.0 };
const MC_LOGO = readFileSync(join(ROOT, "brand/mycrew-logo.svg"), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");
export function mycrewLogo(s, z, height, { bg = "#A7A7A7", gold = "#CDAA42", line = "#232938", rotate = 0 } = {}) {
  const k = height / 830.5;
  const art = MC_LOGO.replaceAll("fill:#A7A7A7", "fill:" + bg).replaceAll("fill:#CDAA42", "fill:" + gold).replaceAll("fill:#232938", "fill:" + line);
  return `<g class="flip"><g transform="translate(${s} ${-z}) rotate(${rotate}) scale(${k}) translate(-500 -500)">${art}</g></g>`;
}

// A fuselage title. parts: [[text, fill, weight]]. Baseline at (s, z), size in metres.
export function title(s, z, size, parts, { family = "Plex", stretch = 100, spacing = 0, anchor = "start" } = {}) {
  const spans = parts.map(([t, fill, w]) => `<tspan fill="${fill}" font-weight="${w}">${t}</tspan>`).join("");
  return `<g class="flip"><text x="${s}" y="${-z}" font-size="${size}" text-anchor="${anchor}" style="font-family:${family};font-stretch:${stretch}%" letter-spacing="${spacing}">${spans}</text></g>`;
}

// The MyCrew app icon: rounded slate tile with the white mark, centred at (s, z).
export function mycrewTile(s, z, size, tile = "#2b3440", mark = "#fff") {
  const r = size * 0.22;
  return `<g class="flip"><rect x="${s - size / 2}" y="${-z - size / 2}" width="${size}" height="${size}" rx="${r}" fill="${tile}"/></g>${mycrewMark(s, z, size * 0.62, mark)}`;
}

// Rectangle in (s, z): from (s0, z0) to (s1, z1).
export function box(s0, z0, s1, z1, fill, extra = "") {
  return `<rect x="${s0}" y="${-z1}" width="${s1 - s0}" height="${z1 - z0}" fill="${fill}" ${extra}/>`;
}

// A tapered ribbon along a cubic Bezier given as four (s, z) points.
// width(t) is the full width in metres at t in [0, 1].
export function ribbon(p0, p1, p2, p3, width) {
  const N = 96, top = [], bot = [];
  const at = (t) => {
    const u = 1 - t;
    return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
  };
  for (let k = 0; k <= N; k++) {
    const t = k / N, [s, z] = at(t), [s2, z2] = at(Math.min(1, t + 1e-3)), [s1, z1] = at(Math.max(0, t - 1e-3));
    const ds = s2 - s1, dz = z2 - z1, len = Math.hypot(ds, dz) || 1;
    const h = width(t) / 2, ns = -dz / len, nz = ds / len;
    top.push([s + ns * h, z + nz * h]);
    bot.push([s - ns * h, z - nz * h]);
  }
  const pts = top.concat(bot.reverse());
  return "M " + pts.map(([s, z]) => `${s.toFixed(3)} ${(-z).toFixed(3)}`).join(" L ") + " Z";
}

// Width profiles for ribbons: a swoosh that starts as a hairline, swells and
// ends at `end` of its peak.
export const swell = (peak, end = 1, at = 0.7) => (t) =>
  t < at ? peak * Math.sin((t / at) * Math.PI / 2) ** 1.4 : peak * (1 - (1 - end) * ((t - at) / (1 - at)));

// Door positions (fore and aft passenger doors), from the measured geometry.
export const doors = (g) => ({ fwd: [4.55, 5.55], aft: [g.L - 8.55, g.L - 7.55] });

// Shapes of the WANTED logos as fractions of their nominal height:
// the bare W mark, and the W in its hexagon.
export const W_MARK = { w: 0.56, h: 0.55 };
export const W_HEX = { w: 0.87, h: 1.0 };

// Places a logo on the fin: the largest size up to `max` metres that fits
// between the measured leading and trailing edges (straight-line fits of
// g.finProfile) with `margin` metres clear, its bottom above zMin.
// Returns [s, z, size] for wantedMark / wantedLogo.
export function finFit(g, shape, { max = 4.6, rotate = 0, margin = 0.3, zMin = g.crown + 0.6, topGap = 0.4, lead = 0, high = false, sBias = 0.5, min = 0.5, step = 0.05 } = {}) {
  const fit = (col) => {
    const pts = g.finProfile.map((r) => [r[0], r[col]]);
    const n = pts.length, mz = pts.reduce((a, p) => a + p[0], 0) / n, ms = pts.reduce((a, p) => a + p[1], 0) / n;
    const k = pts.reduce((a, p) => a + (p[0] - mz) * (p[1] - ms), 0) / pts.reduce((a, p) => a + (p[0] - mz) ** 2, 0);
    return (z) => ms + k * (z - mz);
  };
  const LE = fit(1), TE = fit(2), r = (rotate * Math.PI) / 180;
  let best = null;
  for (let size = max; size > min && !best; size -= step) {
    const hw = (shape.w * Math.cos(r) + shape.h * Math.sin(r)) * size / 2;
    const hh = (shape.h * Math.cos(r) + shape.w * Math.sin(r)) * size / 2;
    let slack = -1;
    for (let zc = g.finTop - topGap - hh; zc - hh >= zMin; zc -= step) {
      const lo = LE(zc + hh) + margin + lead + hw, hi = TE(zc - hh) - margin - hw;
      // high: the first (highest) spot that fits; otherwise the roomiest one.
      if (hi - lo > slack || (high && hi >= lo && slack < 0)) { slack = hi - lo; best = [lo + (hi - lo) * sBias, zc, size]; if (high && hi >= lo) break; }
    }
    if (slack < 0) best = null;
  }
  return best;
}
