// MyCrew livery variants. Palette from MyCrew_Styleguide v1.0: Captain Navy,
// Aviation Gold; the hexagon logo from brand/mycrew-logo.svg; titles in Outfit.
import { P, svg, box, title, ribbon, swell, doors, finFit, MC_HEX, mycrewLogo } from "./common.mjs";

export const name = "MyCrew";
const NAVY = "#1A2436", GOLD = "#D4AF37", SILVER = "#A7A7A7", WHITE = "#ffffff";

const finBox = (g, fill) => box(g.finLE - 1.5, g.crown + 0.3, g.L + 2, g.finTop + 1, fill);
const whole = (g, fill) => box(-1, -6, g.L + 2, g.crown + 0.4, fill);

// The logo as large as the fin allows.
const finLogo = (g, colours = {}, opts = {}) => {
  const [s, z, h] = finFit(g, MC_HEX, { margin: 0.2, max: 4.4, ...opts });
  return mycrewLogo(s, z, h, colours);
};

// Small logos beside the passenger doors.
function doorDecals(g, colours = {}) {
  const d = doors(g), z = 2.25, h = 0.62;
  return mycrewLogo(d.fwd[0] - 0.62, z, h, colours) + mycrewLogo(d.aft[0] - 0.62, z, h, colours);
}

const engineBand = (g, body, band) => {
  const e = g.engine;
  return box(e.s0 - 1, e.z0 - 1, e.s1 + 1, e.z1 + 1, body) + box(e.s0 - 1, e.z0 - 1, e.s0 + 0.42, e.z1 + 1, band);
};
const sharkletFill = (g, fill) => { const k = g.sharklet; return box(k.s0 - 1, k.z0 - 1, k.s1 + 1, k.z1 + 1, fill); };
const sharkletMid = (g) => { const k = g.sharklet; return [k.s0 + 0.62 * (k.s1 - k.s0), k.z0 + 0.55 * (k.z1 - k.z0)]; };
const sharkletLogo = (g, colours = {}) => mycrewLogo(...sharkletMid(g), 1.1, colours);

// On navy paint the logo keeps its gold faces; the grey hexagon reads as a silver badge.
const ON_NAVY = { line: NAVY };

export const variants = {
  // A: navy rear sweeping up from the belly into the fin, gold swoosh.
  a: {
    label: "Sweep",
    font: "Outfit",
    body(g) {
      const c = [[0.40 * g.L, -3], [0.52 * g.L, -0.9], [g.finLE - 9, 1.6], [g.finLE - 3.2, 4.2]];
      const rear = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.finLE - 1.5, g.finTop + 1]} L ${[g.L + 2, g.finTop + 1]} L ${[g.L + 2, -6]} L ${[0.40 * g.L, -6]} Z`;
      const belly = P`M ${[2.0, -0.55]} C ${[8, -0.35]} ${[0.3 * g.L, -0.3]} ${[0.45 * g.L, -0.3]} L ${[0.45 * g.L, -6]} L ${[2.0, -6]} Z`;
      return svg(`
<path d="${belly}" fill="${NAVY}"/><path d="${rear}" fill="${NAVY}"/>
<path d="${ribbon(...c.map(([s, z]) => [s - 0.42, z]), swell(0.34, 0.4, 0.55))}" fill="${GOLD}"/>
${finLogo(g, ON_NAVY)}
${doorDecals(g)}
${title(7.0, 2.04, 1.22, [["My", NAVY, 600], ["Crew", GOLD, 600]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },

  // B: white aircraft wearing the full-colour logo on a white fin, navy belly, gold swoosh.
  b: {
    label: "Badge",
    font: "Outfit",
    body(g) {
      const c = [[2.2, -0.5], [8, -0.25], [g.L - 9, -0.25], [g.L + 2, 1.5]];
      const belly = P`M ${c[0]} C ${c[1]} ${c[2]} ${c[3]} L ${[g.L + 2, -6]} L ${[2.2, -6]} Z`;
      return svg(`
<path d="${belly}" fill="${NAVY}"/>
<path d="${ribbon(...c.map(([s, z]) => [s, z + 0.36]), swell(0.24, 0.8, 0.75))}" fill="${GOLD}"/>
${finLogo(g)}
${doorDecals(g)}
${title(7.0, 2.04, 1.15, [["MyCrew", NAVY, 700]], { family: "Outfit", spacing: -0.01 })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, WHITE) + sharkletLogo(g)),
  },

  // C: navy aircraft, white title, the logo with its grey border on the fin.
  c: {
    label: "Night crew",
    font: "Outfit",
    body(g) {
      const c = [[0.8, 0.9], [0.5 * g.L, 0.9], [g.finLE - 5, 1.1], [g.finLE - 0.7, 3.5]];
      return svg(`
${whole(g, NAVY)}${finBox(g, NAVY)}
<path d="${ribbon(...c, swell(0.3, 0.8))}" fill="${GOLD}"/>
${finLogo(g, ON_NAVY)}
${doorDecals(g, ON_NAVY)}
${title(7.0, 2.04, 1.2, [["My", WHITE, 800], ["Crew", GOLD, 800]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, GOLD) + sharkletLogo(g, ON_NAVY)),
  },

  // D: radar rings behind the logo on a navy fin, twin cheatlines rising aft.
  d: {
    label: "Radar",
    font: "Outfit",
    body(g) {
      // The first ring clears the logo's corners by 0.8 m; the rest follow 1 m apart.
      const [cs, cz, ch] = finFit(g, MC_HEX, { margin: 0.2, max: 3.2 });
      const rings = [0, 1, 2, 3].map((k) => ch / 2 + 0.8 + k).map((r) => `<circle cx="${cs}" cy="${-cz}" r="${r}" fill="none" stroke="${GOLD}" stroke-width="0.07" opacity="0.55"/>`).join("");
      const c = [[0.9, 0.86], [10, 0.78], [0.6 * g.L, 0.78], [g.finLE - 1.0, 3.5]];
      return svg(`
<clipPath id="finclip">${finBox(g, "#000")}</clipPath>
${finBox(g, NAVY)}<g clip-path="url(#finclip)">${rings}</g>
${mycrewLogo(cs, cz, ch, ON_NAVY)}
<path d="${ribbon(...c, swell(0.36, 0.9))}" fill="${NAVY}"/>
<path d="${ribbon(...c.map(([s, z]) => [s, z - 0.36]), swell(0.13, 0.9))}" fill="${GOLD}"/>
${doorDecals(g)}
${title(7.0, 2.06, 0.98, [["MYCREW", NAVY, 700]], { family: "Outfit", spacing: 0.14 })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },
};

// ---- Round 2: more designs (E–J). ----
// Window band on the A32x (z 1.54–1.86); cheatlines run just under it.
const WIN = 1.54;
const SLATE = "#2b3440";
// A path along the window line that kicks up into the fin, offset by dz.
const kick = (g, z, dz = 0) => [[-1, z + dz], [g.finLE - 1.2, z + dz], [g.finLE + 0.3, z + dz + 0.25], [g.finLE + 2.6 - dz * 0.6, g.crown + 1.4 + dz]];
const hexagon = (s, z, r, fill, extra = "") => {
  const pts = [...Array(6)].map((_, k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return `${(s + r * Math.cos(a)).toFixed(3)},${(-(z + r * Math.sin(a))).toFixed(3)}`; });
  return `<polygon points="${pts.join(" ")}" fill="${fill}" ${extra}/>`;
};
// The logo on a gold field: navy hexagon, gold faces, white lines.
const ON_GOLD = { bg: NAVY, gold: GOLD, line: WHITE };

Object.assign(variants, {
  // E: classic pinstripe. A navy cheatline under the windows kicks up into a
  // navy fin, a fine gold pinstripe below it.
  e: {
    label: "Pinstripe",
    font: "Outfit",
    body(g) {
      const band = (dz, w, fill) => `<path d="${ribbon(...kick(g, WIN - 0.25, dz), () => w)}" fill="${fill}"/>`;
      return svg(`
${finBox(g, NAVY)}
${band(0, 0.36, NAVY)}${band(-0.34, 0.08, GOLD)}
${finLogo(g, ON_NAVY, { topGap: 0.6 })}
${doorDecals(g)}
${title(7.0, 2.04, 1.1, [["MyCrew", NAVY, 600]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },

  // F: horizon. Navy lower fuselage up to the window line, a straight gold
  // line along the whole length, navy fin.
  f: {
    label: "Horizon",
    font: "Outfit",
    body(g) {
      const zh = WIN - 0.42;
      return svg(`
${box(-1, -6, g.L + 2, zh, NAVY)}
${box(-1, zh, g.L + 2, zh + 0.14, GOLD)}
${finBox(g, NAVY)}
${finLogo(g, ON_NAVY)}
${doorDecals(g)}
${title(7.0, 2.04, 1.15, [["My", NAVY, 700], ["Crew", GOLD, 700]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },

  // G: gold tail. All-white jet, the fin in Aviation Gold with the logo as a
  // navy badge; thin navy belly line.
  g: {
    label: "Gold Tail",
    font: "Outfit",
    body(g) {
      const c = [[2.2, -0.55], [8, -0.3], [g.L - 9, -0.3], [g.L + 2, 1.4]];
      return svg(`
${finBox(g, GOLD)}
<path d="${ribbon(...c, swell(0.16, 1, 0.6))}" fill="${NAVY}"/>
${finLogo(g, ON_GOLD)}
${doorDecals(g)}
${title(7.0, 2.04, 1.1, [["MyCrew", NAVY, 700]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, WHITE, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, GOLD) + sharkletLogo(g, ON_GOLD)),
  },

  // H: hex trail. White jet; navy hexagons scatter aft from the wing and grow
  // into a full tessellation over the tail, a few in gold.
  h: {
    label: "Hex Trail",
    font: "Outfit",
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
          const gold = ((Math.sin(s * 4.1 + z * 9.7) * 9631.17) % 1 + 1) % 1 < 0.12;
          hexes += hexagon(s, z, R * (0.45 + 0.5 * t), gold ? GOLD : NAVY);
        }
      }
      return svg(`
<g>${hexes}</g>
${box(-1, -6, g.L + 2, -0.95, NAVY)}
${finLogo(g, { bg: WHITE, line: NAVY }, { max: 3.0, margin: 0.5, topGap: 0.8 })}
${doorDecals(g)}
${title(7.0, 2.04, 1.1, [["My", NAVY, 600], ["Crew", GOLD, 600]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },

  // I: big mark. A navy fin with the logo drawn oversized and cropped by the
  // fin edges, navy belly, gold swoosh into the fin.
  i: {
    label: "Big Mark",
    font: "Outfit",
    body(g) {
      const [s, z, h] = finFit(g, MC_HEX, { margin: 0.2, max: 4.4 });
      const c = [[0.42 * g.L, -1.2], [0.6 * g.L, -0.6], [g.finLE - 4, 1.0], [g.finLE - 0.6, g.crown + 0.6]];
      const belly = P`M ${[2.2, -0.6]} C ${[8, -0.35]} ${[0.4 * g.L, -0.3]} ${[g.L + 2, -0.2]} L ${[g.L + 2, -6]} L ${[2.2, -6]} Z`;
      return svg(`
<clipPath id="bigfin">${finBox(g, "#000")}</clipPath>
<path d="${belly}" fill="${NAVY}"/>
${finBox(g, NAVY)}
<g clip-path="url(#bigfin)">${mycrewLogo(s + 1.2, z - 0.6, h * 1.9, { bg: SLATE, gold: GOLD, line: NAVY })}</g>
<path d="${ribbon(...c, swell(0.32, 0.6, 0.65))}" fill="${GOLD}"/>
${doorDecals(g)}
${title(7.0, 2.04, 1.15, [["MyCrew", NAVY, 800]], { family: "Outfit" })}`);
    },
    engine: (g) => svg(engineBand(g, NAVY, GOLD)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },

  // J: heritage. Three cheatlines (navy, gold, silver) under the windows that
  // sweep up the fin; white fin with the full-colour logo.
  j: {
    label: "Heritage",
    font: "Outfit",
    body(g) {
      const band = (dz, w, fill) => `<path d="${ribbon(...kick(g, WIN - 0.3, dz), () => w)}" fill="${fill}"/>`;
      return svg(`
${band(0, 0.34, NAVY)}${band(-0.42, 0.24, GOLD)}${band(-0.74, 0.16, SILVER)}
${finLogo(g, {}, { max: 2.8, zMin: g.crown + 2.2, topGap: 0.5, margin: 0.35 })}
${doorDecals(g)}
${title(7.0, 2.04, 1.1, [["MyCrew", NAVY, 500]], { family: "Outfit", spacing: 0.04 })}`);
    },
    engine: (g) => svg(engineBand(g, WHITE, NAVY)),
    sharklet: (g) => svg(sharkletFill(g, NAVY) + sharkletLogo(g, ON_NAVY)),
  },
});
