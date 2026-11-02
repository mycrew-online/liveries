// MyCrew on the MSFS 2024 Cessna 172 G1000 (asobo_c172sp_g1000). Same house
// style as designs/mycrew.mjs (styleguide navy and gold, Outfit titles, the
// hexagon logo), scaled to a high-wing single: geometry from
// work/ref/c172.json (blender/c172_posmap.py), s = metres aft of the cowl
// front, z = model Z. body is the side view; plan the view from below, nose
// left, port up, z = span (only wings and stabilisers take it).
//
// The art is a decal over the stock white paint: anything left transparent
// shows the stock aircraft. Registrations are painted (placeholders).
import { P, svg, box, title, ribbon, swell, finFit, MC_HEX, mycrewLogo } from "./common.mjs";

export const name = "MyCrew C172";
const NAVY = "#1A2436", GOLD = "#D4AF37", WHITE = "#ffffff";
const ON_NAVY = { line: NAVY };

const side = (g, body) => svg(body, "", g.frames.body);
const plan = (g, body) => svg(body, "", g.frames.plan);

// The logo as large as the fin allows (the fin is about a metre deep). The
// measured fin profile is noisy (rudder hinge, antenna), so each row takes
// the outermost edges within 0.1 m before the straight-line fit.
const finEdges = (g) => ({ ...g, finProfile: g.finProfile.map(([z]) => {
  const near = g.finProfile.filter((r) => Math.abs(r[0] - z) <= 0.1);
  return [z, Math.min(...near.map((r) => r[1])), Math.max(...near.map((r) => r[2]))];
}) });
const finLogo = (g, colours = {}, opts = {}) => {
  const [s, z, h] = finFit(finEdges(g), MC_HEX, { max: 1.2, min: 0.2, step: 0.01, margin: 0.08, zMin: g.finRoot + 0.08, topGap: 0.06, ...opts });
  return mycrewLogo(s, z, h, colours);
};

// Title on the cowl side, as large as the cowl allows and clear of the wing
// strut from the front; registration on the aft fuselage where the kit's
// panel sits.
const cowlTitle = (g, parts) => title(0.26, 0.03, 0.24, parts, { family: "Outfit" });
const reg = (g, text, fill = NAVY, s = 4.35, z = -0.18, size = 0.25) => title(s, z, size, [[text, fill, 600]], { family: "Outfit", spacing: 0.01 });

// A band along the fuselage side between two curves, each four (s, z) Bezier
// points from spinner to tail.
const band = (top, bot) => P`M ${top[0]} C ${top[1]} ${top[2]} ${top[3]} L ${bot[3]} C ${bot[2]} ${bot[1]} ${bot[0]} Z`;

const hexagon = (s, z, r, fill) => {
  const pts = [...Array(6)].map((_, k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return `${(s + r * Math.cos(a)).toFixed(3)},${(-(z + r * Math.sin(a))).toFixed(3)}`; });
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};

// The underside stays stock white on every variant: a navy belly reads as a
// black underside from three-quarter views.
export const variants = {
  // A: a broad navy band with a gold band under it along the side, spinner to
  // tail, the lower side and belly white; logo on the white fin.
  a: {
    label: "Cheatline",
    font: "Outfit",
    body(g) {
      const L = g.L + 0.6;
      const navyTop = [[-0.6, -0.1], [1.8, -0.2], [4.5, -0.24], [L, -0.02]];
      const navyBot = [[-0.6, -0.34], [1.8, -0.5], [4.5, -0.4], [L, -0.1]];
      const goldTop = navyBot.map(([s, z]) => [s, z - 0.02]);
      const goldBot = [[-0.6, -0.42], [1.8, -0.6], [4.5, -0.48], [L, -0.14]];
      return side(g, `
<path d="${band(navyTop, navyBot)}" fill="${NAVY}"/>
<path d="${band(goldTop, goldBot)}" fill="${GOLD}"/>
${finLogo(g)}
${cowlTitle(g, [["My", NAVY, 600], ["Crew", GOLD, 600]])}
${reg(g, "OK-MCA", NAVY, 4.35, -0.12, 0.23)}`);
    },
  },

  // B: navy tail. A thin navy stripe along the side widens aft and sweeps up
  // into the fin, a gold swoosh on its upper edge; navy stabilisers.
  b: {
    label: "Navy Tail",
    font: "Outfit",
    body(g) {
      const lo = [[2.2, -0.38], [4.0, -0.36], [5.6, -0.22], [g.L + 0.6, -0.12]];
      const hi = [[2.2, -0.38], [4.6, -0.3], [5.5, 0.05], [g.finLE + 0.1, g.finRoot + 0.02]];
      const navy = P`M ${lo[0]} C ${lo[1]} ${lo[2]} ${lo[3]} L ${[g.L + 0.6, g.finTop + 0.3]} L ${[g.finLE + 1.45, g.finTop + 0.3]} L ${hi[3]} C ${hi[2]} ${hi[1]} ${hi[0]} Z`;
      return side(g, `
<path d="${navy}" fill="${NAVY}"/>
<path d="${ribbon(...hi.map(([s, z]) => [s - 0.05, z + 0.045]), swell(0.07, 0.8, 0.5))}" fill="${GOLD}"/>
${finLogo(g, ON_NAVY)}
${cowlTitle(g, [["MyCrew", NAVY, 700]])}
${reg(g, "OK-MCB", NAVY, 4.05, 0.08, 0.2)}`);
    },
    plan: (g) => plan(g, box(5.6, -2.2, g.L + 0.6, 2.2, NAVY)),
  },

  // C: hex trail. Navy hexagons scatter aft from the registration and grow
  // into a tessellation over the fin, a few in gold.
  c: {
    label: "Hex Trail",
    font: "Outfit",
    body(g) {
      const R = 0.2, dx = R * Math.sqrt(3), dz = R * 1.5, s0 = 5.5;
      let hexes = "";
      for (let row = -12; row * dz < g.finTop + 0.2; row++) {
        for (let col = 0; s0 + col * dx < g.L + 0.6; col++) {
          const s = s0 + col * dx + (row % 2 ? dx / 2 : 0), z = row * dz;
          const t = Math.min(1, Math.max(0, (s - s0) / (g.finLE + 0.4 - s0)));
          // Pseudo-random thinning so the pattern dissolves forwards.
          const keep = ((Math.sin(s * 12.9898 + z * 78.233) * 43758.5453) % 1 + 1) % 1;
          if (keep > t * 1.25) continue;
          // None on the tailcone under the stabiliser or on the curved fillet
          // ahead of the fin, where the side art breaks up.
          if (s > 6.2 && z < g.finRoot - 0.2) continue;
          if (z < g.finRoot && s < g.finLE + 0.3) continue;
          const gold = ((Math.sin(s * 4.1 + z * 9.7) * 9631.17) % 1 + 1) % 1 < 0.12;
          hexes += hexagon(s, z, R * (0.45 + 0.5 * t), gold ? GOLD : NAVY);
        }
      }
      return side(g, `
<g>${hexes}</g>
${finLogo(g, { bg: WHITE, line: NAVY })}
${cowlTitle(g, [["My", NAVY, 600], ["Crew", GOLD, 600]])}
${reg(g, "OK-MCC")}`);
    },
  },
};
