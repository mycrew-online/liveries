// WANTED.solutions livery variants: navy, white and the logo orange.
//
// Each variant has body / engine / sharklet layers; g is the measured
// geometry (see work/ref/<type>.json).
import { P, svg, box, title, ribbon, swell, doors, finFit, W_MARK, W_HEX, wantedMark, wantedLogo, mycrewMark, mycrewTile } from "./common.mjs";

export const name = "WANTED.solutions";
const NAVY = "#0f1420", ORANGE = "#e8622a", G0 = "#ee7202", G1 = "#de2015", WHITE = "#ffffff";
const TILT = 12; // the logo leans with the fin sweep

const fin = (g) => box(g.finLE - 1.5, g.crown + 0.3, g.L + 2, g.finTop + 1, "url(#hex)");
const whole = (g, fill) => box(-1, -6, g.L + 2, g.crown + 0.25, fill);
const up = ([s, z], dz) => [s, z + dz];
// A gradient in user units (svg y = -z).
const along = (id, s0, z0, s1, z1, a = G0, b = G1) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${s0}" y1="${-z0}" x2="${s1}" y2="${-z1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

// Tail logos, sized and placed inside the measured fin outline.
const finMark = (g, opts = {}) => { const [s, z, h] = finFit(g, W_MARK, { rotate: TILT, max: 4.0, ...opts }); return wantedMark(s, z, h, WHITE, TILT); };
const finLogo = (g, hexFill, opts = {}) => { const [s, z, h] = finFit(g, W_HEX, { rotate: TILT, margin: 0.15, ...opts }); return wantedLogo(s, z, h, TILT, hexFill); };

// Small logos beside the passenger doors. kind: "logo" (hexagon), a colour
// (bare W in that colour), or null (none).
function doorDecals(g, fwd = "logo", aft = "logo") {
  const d = doors(g), z = 2.25, h = 0.62;
  const one = (kind, s) => !kind ? "" : kind === "logo" ? wantedLogo(s, z, h) : wantedMark(s, z, h * 0.95, kind);
  return one(fwd, d.fwd[0] - 0.62) + one(aft, d.aft[0] - 0.62);
}

const engineBand = (g, body, band) => {
  const e = g.engine;
  return box(e.s0 - 1, e.z0 - 1, e.s1 + 1, e.z1 + 1, body) + box(e.s0 - 1, e.z0 - 1, e.s0 + 0.42, e.z1 + 1, band);
};
// The hexagon logo on the nacelle side.
const engineLogo = (g, hexFill = "url(#hex)") => wantedLogo(g.engine.s0 + 2.0, -1.1, 1.45, 0, hexFill);
const sharkletFill = (g, fill) => { const k = g.sharklet; return box(k.s0 - 1, k.z0 - 1, k.s1 + 1, k.z1 + 1, fill); };
const sharkletMid = (g) => { const k = g.sharklet; return [k.s0 + 0.62 * (k.s1 - k.s0), k.z0 + 0.55 * (k.z1 - k.z0)]; };

export const variants = {
  // A: navy belly sweeping up into the fin; the orange swoosh carries on up
  // the fin as the edge between navy and the gradient.
  a: {
    label: "Sweep",
    font: "Archivo Expanded",
    body(g) {
      const c1 = [[1.0, -0.35], [0.45 * g.L, 0.0], [g.finLE - 6, 0.1], [g.finLE - 0.6, 3.6]];
      // c2 leaves the fin root along the tangent of c1, then eases aft.
      const c2 = [c1[3], [g.finLE + 0.5, 4.33], [g.finLE + 3.0, 5.05], [g.L + 2, 5.25]];
      const navy = P`M ${c1[0]} C ${c1[1]} ${c1[2]} ${c1[3]} C ${c2[1]} ${c2[2]} ${c2[3]} L ${[g.L + 2, -6]} L ${[-1, -6]} Z`;
      const gradient = P`M ${[g.finLE - 0.6, g.crown + 0.3]} L ${c1[3]} C ${c2[1]} ${c2[2]} ${c2[3]} L ${[g.L + 2, g.finTop + 1]} L ${[g.finLE - 0.6, g.finTop + 1]} Z`;
      return svg(`
<path d="${gradient}" fill="url(#hex)"/>
<path d="${navy}" fill="${NAVY}"/>
<path d="${ribbon(...c1.map((p) => up(p, 0.36)), swell(0.46, 1.0, 0.8))}" fill="url(#sw)"/>
<path d="${ribbon(...c2.map((p) => up(p, 0.36)), (t) => 0.46 - 0.26 * t)}" fill="url(#sw)"/>
${finMark(g, { max: 2.7, zMin: 5.45, topGap: 0.75, high: true, sBias: 0.25 })}
${doorDecals(g, "logo", WHITE)}
${title(7.0, 2.08, 0.92, [["WANTED", NAVY, 760], [".solutions", ORANGE, 420]], { family: "Archivo", stretch: 125, spacing: 0.02 })}`,
        along("sw", 0, 0, g.finLE, 3, G0, G1));
    },
    engine: (g) => svg(engineBand(g, NAVY, "url(#hex)")),
    sharklet: (g) => svg(sharkletFill(g, "url(#hex)") + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },

  // B: white aircraft, full-colour hexagon on a white fin, navy belly with an
  // orange swoosh riding it. Logos only by the front door.
  b: {
    label: "Hexagon",
    font: "Sora",
    body(g) {
      const c = [[2.0, -0.55], [10, -0.32], [g.L - 9, -0.32], [g.L + 2, 1.4]];
      const navy = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.L + 2, -6]} L ${[2.0, -6]} Z`;
      return svg(`
<path d="${navy}" fill="${NAVY}"/>
<path d="${ribbon(...c.map((p) => up(p, 0.42)), swell(0.4, 0.7, 0.75))}" fill="url(#sw)"/>
${finLogo(g)}
${doorDecals(g, "logo", null)}
${title(7.0, 2.06, 1.02, [["WANTED", NAVY, 650], [".", ORANGE, 650], ["solutions", NAVY, 350]], { family: "Sora", spacing: 0.01 })}`,
        along("sw", 0, 0, g.L, 0, G0, G1));
    },
    engine: (g) => svg(engineBand(g, "url(#hex)", NAVY)),
    sharklet: (g) => svg(sharkletFill(g, WHITE) + wantedLogo(...sharkletMid(g), 1.1, TILT)),
  },

  // C: navy aircraft, white lowercase title, orange swoosh rising into the fin.
  c: {
    label: "Midnight",
    font: "Red Hat Display",
    body(g) {
      const c = [[0.8, 0.9], [0.5 * g.L, 0.9], [g.finLE - 5, 1.1], [g.finLE - 0.7, 3.5]];
      return svg(`
${whole(g, NAVY)}
<path d="${ribbon(...c, swell(0.34, 0.8))}" fill="url(#sw)"/>
${fin(g)}${finMark(g, { max: 3.3, topGap: 0.75, high: true })}
${doorDecals(g)}
${title(7.0, 2.04, 1.12, [["wanted", WHITE, 760], [".", ORANGE, 760], ["solutions", WHITE, 380]], { family: "RedHat" })}`,
        along("sw", 0, 0, g.finLE, 3, G0, G1));
    },
    engine: (g) => svg(engineBand(g, "url(#hex)", NAVY)),
    sharklet: (g) => svg(sharkletFill(g, "url(#hex)") + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },

  // D: the logo orange sweeps up from the belly through the fin, edged in
  // navy; navy hexagon under the W on the fin.
  d: {
    label: "Flame",
    font: "Saira Expanded",
    body(g) {
      const c = [[0.36 * g.L, -3], [0.5 * g.L, -0.8], [g.finLE - 8, 1.4], [g.finLE - 3.4, 4.0]];
      const flame = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.finLE - 1.4, g.finTop + 1]} L ${[g.L + 2, g.finTop + 1]} L ${[g.L + 2, -6]} L ${[0.36 * g.L, -6]} Z`;
      const edge = c.map(([s, z]) => [s - 0.45, z]);
      return svg(`
<path d="${flame}" fill="url(#flame)"/>
<path d="${ribbon(...edge, swell(0.4, 0.35, 0.55))}" fill="${NAVY}"/>
${finLogo(g, NAVY)}
${doorDecals(g, "logo", WHITE)}
${title(7.0, 2.06, 1.0, [["WANTED", NAVY, 800], [".solutions", ORANGE, 420]], { family: "Saira", stretch: 125, spacing: 0.02 })}`,
        along("flame", 0.4 * g.L, -2, g.L, g.finTop, G0, G1));
    },
    engine: (g) => svg(engineBand(g, NAVY, "url(#hex)")),
    sharklet: (g) => svg(sharkletFill(g, "url(#hex)") + wantedLogo(...sharkletMid(g), 1.1, TILT, NAVY)),
  },
};

// ---- Round 3: more designs (E–H) and special editions (I–K). ----
const SLATE = "#2b3440", AMBER = "#e0a63a";
const CZ_RED = "#d7141a", CZ_BLUE = "#11457e";
// Window band on the A32x (z 1.54–1.86); cheatlines run just under it.
const WIN = 1.54;
const finMarkIn = (g, fill, opts = {}) => { const [s, z, h] = finFit(g, W_MARK, { rotate: TILT, max: 4.0, ...opts }); return wantedMark(s, z, h, fill, TILT); };
// Straight-line leading / trailing edges of the fin, s at height z.
function finEdges(g) {
  const fit = (col) => {
    const pts = g.finProfile.map((r) => [r[0], r[col]]), n = pts.length;
    const mz = pts.reduce((a, p) => a + p[0], 0) / n, ms = pts.reduce((a, p) => a + p[1], 0) / n;
    const k = pts.reduce((a, p) => a + (p[0] - mz) * (p[1] - ms), 0) / pts.reduce((a, p) => a + (p[0] - mz) ** 2, 0);
    return (z) => ms + k * (z - mz);
  };
  return { LE: fit(1), TE: fit(2) };
}
// A path along the window line that kicks up into the fin, offset by dz.
const kick = (g, z, dz = 0) => [[-1, z + dz], [g.finLE - 1.2, z + dz], [g.finLE + 0.3, z + dz + 0.25], [g.finLE + 2.6 - dz * 0.6, g.crown + 1.4 + dz]];
const hexagon = (s, z, r, fill) => {
  const pts = [...Array(6)].map((_, k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return `${(s + r * Math.cos(a)).toFixed(3)},${(-(z + r * Math.sin(a))).toFixed(3)}`; });
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};

Object.assign(variants, {
  // E: 1970s-style heritage cheatline, three bands under the windows that
  // sweep up the fin; white fin with a navy W.
  e: {
    label: "Heritage",
    font: "Fraunces",
    body(g) {
      const band = (dz, w, fill) => `<path d="${ribbon(...kick(g, WIN - 0.3, dz), () => w)}" fill="${fill}"/>`;
      return svg(`
${band(0, 0.34, NAVY)}${band(-0.42, 0.26, ORANGE)}${band(-0.76, 0.18, G1)}
${finMarkIn(g, NAVY, { max: 3.4, zMin: g.crown + 2.6, topGap: 0.7, high: true })}
${doorDecals(g, NAVY, null)}
${title(7.0, 2.04, 1.1, [["Wanted", NAVY, 700], [".solutions", ORANGE, 400]], { family: "Fraunces" })}`);
    },
    engine: (g) => svg(engineBand(g, WHITE, NAVY)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },

  // F: the whole fuselage in the logo gradient, white titles, navy fin
  // carrying the full-colour hexagon.
  f: {
    label: "Ember",
    font: "Archivo Expanded",
    body(g) {
      return svg(`
${whole(g, "url(#body)")}
${box(-1, -6, g.L + 2, -0.9, NAVY)}
${box(g.finLE - 1.5, g.crown + 0.3, g.L + 2, g.finTop + 1, NAVY)}
${finLogo(g, "url(#hex)", { margin: 0.4 })}
${doorDecals(g, WHITE, WHITE)}
${title(7.0, 2.06, 0.98, [["WANTED", WHITE, 800], [".solutions", NAVY, 420]], { family: "Archivo", stretch: 125, spacing: 0.02 })}`,
        along("body", 0, 0, g.L, 0, G0, G1));
    },
    engine: (g) => svg(engineBand(g, NAVY, "url(#hex)")),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + wantedLogo(...sharkletMid(g), 1.1, TILT)),
  },

  // G: white jet; hexagons scatter aft from the wing and grow into a full
  // tessellation over the tail, in the logo gradient.
  g: {
    label: "Hexfield",
    font: "Sora",
    body(g) {
      const R = 0.62, dx = R * Math.sqrt(3), dz = R * 1.5, s0 = 0.42 * g.L;
      let hexes = "";
      for (let row = -6; row * dz < g.finTop + 2; row++) {
        for (let col = 0; s0 + col * dx < g.L + 2; col++) {
          const s = s0 + col * dx + (row % 2 ? dx / 2 : 0), z = row * dz;
          const t = Math.min(1, Math.max(0, (s - s0) / (g.finLE - s0)));
          // Pseudo-random thinning so the pattern dissolves forwards.
          const keep = ((Math.sin(s * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
          if (keep > t * 1.25) continue;
          hexes += hexagon(s, z, R * (0.45 + 0.5 * t), "url(#hexs)");
        }
      }
      return svg(`
<g>${hexes}</g>
${box(-1, -6, g.L + 2, -0.95, NAVY)}
${finMarkIn(g, WHITE, { max: 3.3, topGap: 0.8, high: true, margin: 0.5 })}
${doorDecals(g, "logo", null)}
${title(7.0, 2.06, 1.0, [["WANTED", NAVY, 650], [".", ORANGE, 650], ["solutions", NAVY, 350]], { family: "Sora", spacing: 0.01 })}`,
        along("hexs", 0.42 * g.L, 0, g.L, g.finTop, G0, G1));
    },
    engine: (g) => svg(engineBand(g, NAVY, "url(#hex)")),
    sharklet: (g) => svg(sharkletFill(g, "url(#hex)") + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },

  // H: minimal corporate; all white, a giant navy W on the fin, gradient
  // engines, one small title.
  h: {
    label: "Minimal",
    font: "Red Hat Display",
    body(g) {
      return svg(`
${finMarkIn(g, NAVY, { max: 4.6, margin: 0.25, topGap: 0.6 })}
${doorDecals(g, "logo", null)}
${title(7.0, 2.1, 0.78, [["wanted", NAVY, 700], [".", ORANGE, 700], ["solutions", NAVY, 350]], { family: "RedHat" })}`);
    },
    engine: (g) => svg(engineBand(g, "url(#hex)", WHITE)),
    sharklet: (g) => svg(sharkletFill(g, WHITE) + wantedLogo(...sharkletMid(g), 1.1, TILT)),
  },

  // I (special): WANTED × MyCrew partner jet. Navy front, MyCrew slate rear,
  // an orange-to-amber seam; the fin carries both marks.
  i: {
    label: "MyCrew Partner",
    font: "Outfit",
    body(g) {
      const c = [[g.L * 0.5, -6], [g.L * 0.56, 0], [g.finLE - 4, 2.6], [g.finLE - 0.8, g.crown + 1.0]];
      const slate = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.finLE + 1.6, g.finTop + 1]} L ${[g.L + 2, g.finTop + 1]} L ${[g.L + 2, -6]} Z`;
      const [ms, mz, mh] = finFit(g, { w: 0.8, h: 0.8 }, { rotate: 0, max: 2.3, margin: 0.45, zMin: g.crown + 0.8, topGap: 4.0 });
      return svg(`
${box(-1, -6, g.L + 2, 0.3, NAVY)}
<path d="${slate}" fill="${SLATE}"/>
<path d="${ribbon(c[0], c[1], c[2], c[3], swell(0.3, 1, 0.6))}" fill="url(#seam)"/>
${finMarkIn(g, WHITE, { max: 2.5, topGap: 0.7, high: true, zMin: g.crown + 3.6 })}
${mycrewMark(ms, mz, mh, AMBER)}
${doorDecals(g, "logo", null)}
${title(7.0, 2.06, 0.92, [["WANTED", NAVY, 760], [".solutions", ORANGE, 420]], { family: "Archivo", stretch: 125 })}
${title(g.finLE - 5.2, 0.45, 0.72, [["× ", AMBER, 300], ["MyCrew", AMBER, 600]], { family: "Outfit" })}`,
        along("seam", 0, -6, 0, g.finTop, ORANGE, AMBER));
    },
    engine: (g) => svg(engineBand(g, SLATE, AMBER)),
    sharklet: (g) => svg(sharkletFill(g, SLATE) + mycrewMark(...sharkletMid(g), 0.95, AMBER)),
  },

  // J (special): Czech edition. The flag on the fin, a tricolour ribbon
  // along the belly, "Made in Czechia" by the rear door.
  j: {
    label: "Czech Edition",
    font: "Saira Expanded",
    body(g) {
      const { LE, TE } = finEdges(g);
      const zb = g.crown + 0.3, zt = g.finTop + 1, zm = (g.crown + g.finTop) / 2 - 0.2;
      const tri = [[LE(zb) - 1.5, zb - 1], [LE(zt) - 0.5, zt], [LE(zm) + 0.55 * (TE(zm) - LE(zm)), zm]];
      const flag = box(g.finLE - 1.5, zm, g.L + 2, zt, WHITE) + box(g.finLE - 1.5, zb - 1, g.L + 2, zm, CZ_RED) +
        `<path d="${P`M ${tri[0]} L ${tri[1]} L ${tri[2]} Z`}" fill="${CZ_BLUE}"/>`;
      const c = [[1.2, -0.7], [10, -0.45], [g.L - 9, -0.45], [g.L + 2, 1.1]];
      const rib = (dz, w, fill) => `<path d="${ribbon(...c.map((p) => up(p, dz)), swell(w, 0.8, 0.75))}" fill="${fill}"/>`;
      const d = doors(g);
      return svg(`
${box(-1, -6, g.L + 2, -0.95, NAVY)}
${rib(0.0, 0.3, CZ_BLUE)}${rib(0.33, 0.3, CZ_RED)}${rib(0.62, 0.2, ORANGE)}
${flag}
${doorDecals(g, "logo", null)}
${title(7.0, 2.06, 1.0, [["WANTED", NAVY, 800], [".solutions", ORANGE, 420]], { family: "Saira", stretch: 125, spacing: 0.02 })}
${title(d.aft[0] - 0.9, 2.15, 0.5, [["Made in Czechia", NAVY, 500]], { family: "Saira", stretch: 110, anchor: "end" })}`);
    },
    engine: (g) => svg(engineBand(g, CZ_BLUE, CZ_RED)),
    sharklet: (g) => svg(sharkletFill(g, CZ_BLUE) + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },

  // K (special): Retro sunset. Stacked bands in the logo colours wrap the
  // aft fuselage and climb the fin like a 70s sunset; serif titles.
  k: {
    label: "Sunset",
    font: "Fraunces",
    body(g) {
      const COLS = ["#f6a01a", G0, ORANGE, G1, "#a3161e", NAVY];
      const edge = (k) => [[0.38 * g.L + k * 0.9, -6], [0.5 * g.L + k * 0.9, -0.5], [g.finLE - 5 + k * 0.6, 1.6], [g.finLE - 1.4 + k * 0.9, g.finTop + 1]];
      const bands = COLS.map((col, k) => {
        const [a, b, c, d] = edge(k);
        return `<path d="${P`M ${a} C ${b} ${c} ${d} L ${[g.L + 2, g.finTop + 1]} L ${[g.L + 2, -6]} Z`}" fill="${col}"/>`;
      }).join("");
      return svg(`
${bands}
${finMarkIn(g, WHITE, { max: 2.8, topGap: 0.8, high: true, sBias: 0.7 })}
${doorDecals(g, "logo", WHITE)}
${title(7.0, 2.04, 1.15, [["Wanted", NAVY, 800], [".solutions", "#a3161e", 400]], { family: "Fraunces" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, "#f6a01a")),
    sharklet: (g) => svg(sharkletFill(g, "url(#hex)") + wantedMark(...sharkletMid(g), 0.95, WHITE, TILT)),
  },
});
