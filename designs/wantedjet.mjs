// WANTED.solutions business jets (FSLTL Learjet 25 and alike): navy, white
// and the logo orange, drawn in the jet's own measured geometry.
//
// body: fuselage and fin. engine: the rear-fuselage nacelles and the tip
// tanks (both stand in front of the fuselage in side view, so they have their
// own layer). Titles ride the nacelles, the registration the tail cone.
import { P, svg, box, title, ribbon, swell, finFit, W_MARK, W_HEX, wantedMark, wantedLogo } from "./common.mjs";

export const name = "WANTED.solutions";
const NAVY = "#0f1420", ORANGE = "#e8622a", G0 = "#ee7202", G1 = "#de2015", WHITE = "#ffffff";
const TILT = 12;

const along = (id, s0, z0, s1, z1, a = G0, b = G1) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${s0}" y1="${-z0}" x2="${s1}" y2="${-z1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const up = ([s, z], dz) => [s, z + dz];

// Fin logos: the fin is small, so less margin and a lower floor than airliners.
const FIN = { margin: 0.08, zMin: 0, topGap: 0.22, rotate: TILT };
const finMark = (g, fill = WHITE, o = {}) => { const [s, z, h] = finFit(g, W_MARK, { ...FIN, zMin: g.crown + 0.3, max: 1.6, ...o }); return wantedMark(s, z, h, fill, TILT); };
const finLogo = (g, hexFill, o = {}) => { const [s, z, h] = finFit(g, W_HEX, { ...FIN, zMin: g.crown + 0.25, max: 1.3, ...o }); return wantedLogo(s, z, h, TILT, hexFill); };
// The fin root sits below the crown where the tail cone drops away.
const finArea = (g, fill) => `<path d="${P`M ${[g.finLE - 0.6, g.crown + 0.12]} L ${[g.L + 1, g.crown - 0.5]} L ${[g.L + 1, g.finTop + 1]} L ${[g.finLE - 0.6, g.finTop + 1]} Z`}" fill="${fill}"/>`;

// Engine layer parts: the nacelle above, the tip tank below (they overlap a
// few centimetres in side view; the split is between them).
const split = (g) => (g.engine.z0 + g.tank.z1) / 2;
const nacelle = (g, fill) => box(g.engine.s0 - 0.5, split(g), g.engine.s1 + 0.5, g.engine.z1 + 0.5, fill);
const tank = (g, fill) => box(g.tank.s0 - 0.5, g.tank.z0 - 0.5, g.tank.s1 + 0.5, split(g), fill);
// Intake lip band and the tank's nose cap.
const lip = (g, fill) => box(g.engine.s0 - 0.5, split(g), g.engine.s0 + 0.22, g.engine.z1 + 0.5, fill);
const tankNose = (g, fill) => box(g.tank.s0 - 0.5, g.tank.z0 - 0.5, g.tank.s0 + 0.55, split(g), fill);
const nacelleTitle = (g, parts, family, stretch = 100, size = 0.26) => {
  const e = g.engine, mid = (e.z0 + e.z1) / 2;
  return title((e.s0 + e.s1) / 2 + 0.1, mid - size * 0.36, size, parts, { family, stretch, anchor: "middle", spacing: 0.005 });
};
const reg = (g, text, fill) => title(g.engine.s1 + 0.95, g.crown - 0.62, 0.24, [[text, fill, 600]], { family: "Plex", anchor: "middle" });
// A small logo just ahead of the door, under the cockpit side window.
const doorLogo = (g, kind = "logo") => kind === "logo" ? wantedLogo(3.05, 0.05, 0.36) : wantedMark(3.05, 0.05, 0.36, kind);

export const variants = {
  // A: navy belly sweeping up into the fin, orange swoosh along its edge,
  // gradient fin with the white W.
  a: {
    label: "Sweep",
    font: "Archivo Expanded",
    body(g) {
      const c = [[0.4, -0.35], [0.45 * g.L, -0.2], [g.finLE - 2.2, -0.05], [g.finLE - 0.35, g.crown + 0.15]];
      const c2 = [c[3], [g.finLE + 0.4, g.crown + 0.55], [g.finLE + 1.2, g.crown + 0.95], [g.L + 1, g.crown + 1.05]];
      const navy = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} C ${c2[1]} ${c2[2]} ${c2[3]} L ${[g.L + 1, -3]} L ${[-1, -3]} Z`;
      const grad = P`M ${[g.finLE - 0.6, g.crown + 0.12]} L ${c[3]} C ${c2[1]} ${c2[2]} ${c2[3]} L ${[g.L + 1, g.finTop + 1]} L ${[g.finLE - 0.6, g.finTop + 1]} Z`;
      return svg(`
<path d="${grad}" fill="url(#hex)"/>
<path d="${navy}" fill="${NAVY}"/>
<path d="${ribbon(...c.map((p) => up(p, 0.1)), swell(0.15, 1, 0.8))}" fill="url(#sw)"/>
<path d="${ribbon(...c2.map((p) => up(p, 0.1)), (t) => 0.15 - 0.09 * t)}" fill="url(#sw)"/>
${finMark(g, WHITE, { high: true, sBias: 0.35, topGap: 0.38, max: 1.2 })}
${doorLogo(g)}
${reg(g, "OK-WJA", WHITE)}`, along("sw", 0, 0, g.finLE, 1, G0, G1));
    },
    engine: (g) => svg(nacelle(g, NAVY) + lip(g, "url(#hex)") + tank(g, NAVY) + tankNose(g, "url(#hex)") +
      nacelleTitle(g, [["WANTED", WHITE, 760], [".solutions", ORANGE, 420]], "Archivo", 125, 0.165)),
  },

  // B: white jet, navy belly with an orange swoosh, full-colour hexagon on
  // the white fin, gradient tip tanks.
  b: {
    label: "Hexagon",
    font: "Sora",
    body(g) {
      const c = [[0.8, -0.5], [4, -0.36], [g.L - 4, -0.3], [g.L + 1, 0.35]];
      const navy = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.L + 1, -3]} L ${[0.8, -3]} Z`;
      return svg(`
<path d="${navy}" fill="${NAVY}"/>
<path d="${ribbon(...c.map((p) => up(p, 0.12)), swell(0.13, 0.75, 0.75))}" fill="url(#sw)"/>
${finLogo(g)}
${doorLogo(g)}
${reg(g, "OK-WJB", NAVY)}`, along("sw", 0, 0, g.L, 0, G0, G1));
    },
    engine: (g) => svg(nacelle(g, WHITE) + lip(g, NAVY) + tank(g, "url(#tk)") +
      nacelleTitle(g, [["WANTED", NAVY, 650], [".", ORANGE, 650], ["solutions", NAVY, 350]], "Sora", 100, 0.21),
      along("tk", g.tank.s0, 0, g.tank.s1, 0, G0, G1)),
  },

  // C: navy jet, gradient fin with the white W, orange swoosh rising to it.
  c: {
    label: "Midnight",
    font: "Red Hat Display",
    body(g) {
      const c = [[0.6, 0.1], [0.45 * g.L, 0.1], [g.finLE - 2, 0.2], [g.finLE - 0.4, g.crown + 0.1]];
      return svg(`
${box(-1, -3, g.L + 1, g.crown + 0.12, NAVY)}
${finArea(g, "url(#hex)")}
<path d="${ribbon(...c, swell(0.12, 0.8))}" fill="url(#sw)"/>
${finMark(g, WHITE, { high: true, topGap: 0.32 })}
${doorLogo(g)}
${reg(g, "OK-WJC", WHITE)}`, along("sw", 0, 0, g.finLE, 1, G0, G1));
    },
    engine: (g) => svg(nacelle(g, NAVY) + lip(g, "url(#hex)") + tank(g, "url(#hex)") +
      nacelleTitle(g, [["wanted", WHITE, 760], [".", ORANGE, 760], ["solutions", WHITE, 380]], "RedHat", 100, 0.24)),
  },

  // D: white front; the logo orange flames up from the belly through the
  // fin, edged in navy; navy hexagon on the fin.
  d: {
    label: "Flame",
    font: "Saira Expanded",
    body(g) {
      const c = [[0.3 * g.L, -1.2], [0.45 * g.L, -0.4], [g.finLE - 3, 0.4], [g.finLE - 1.0, g.crown + 0.5]];
      const flame = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.finLE - 0.3, g.finTop + 1]} L ${[g.L + 1, g.finTop + 1]} L ${[g.L + 1, -3]} L ${[0.3 * g.L, -3]} Z`;
      const edge = c.map(([s, z]) => [s - 0.14, z]);
      return svg(`
<path d="${flame}" fill="url(#flame)"/>
<path d="${ribbon(...edge, swell(0.13, 0.35, 0.55))}" fill="${NAVY}"/>
${finLogo(g, NAVY)}
${doorLogo(g)}
${reg(g, "OK-WJD", WHITE)}`, along("flame", 0.35 * g.L, -1, g.L, g.finTop, G0, G1));
    },
    engine: (g) => svg(nacelle(g, "url(#hex)") + lip(g, NAVY) + tank(g, NAVY) + tankNose(g, "url(#hex)") +
      nacelleTitle(g, [["WANTED", WHITE, 800], [".solutions", NAVY, 500]], "Saira", 125, 0.17)),
  },
};
