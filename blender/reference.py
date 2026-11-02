"""Render the port side (nose left) orthographically in the livery design frame,
so artwork can be drawn on top of it in metres.

Design frame: s = metres aft of the nose, z = metres up (model Z).
The image covers s in [S0, S0 + W] and z in [Z0, Z0 + H].

blender -b --factory-startup --python blender/reference.py -- <parts dir> <out.png> <tex dir> [<tex dir> ...]
"""
import bpy, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import scene

FRAME = dict(S0=-1.0, W=48.0, Z0=-4.5, H=18.0)
PPM = 50  # pixels per metre for the reference

parts, out, *texdirs = sys.argv[sys.argv.index("--") + 1:]
objs = scene.load_parts(parts)
scene.apply_textures(objs, *texdirs)
nose = scene.nose_y(objs)
scene.setup_render(res=(int(FRAME["W"] * PPM), int(FRAME["H"] * PPM)))
s_mid = FRAME["S0"] + FRAME["W"] / 2
z_mid = FRAME["Z0"] + FRAME["H"] / 2
y_mid = nose + s_mid
cam = scene.camera("port", (100, y_mid, z_mid), (0, y_mid, z_mid), ortho=FRAME["W"])
bpy.context.scene.render.film_transparent = True
scene.render(cam, out)
def verts(match, keep=None):
    for o in objs:
        if any(match in (s.material.name if s.material else "") for s in o.material_slots):
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                if keep is None or keep(w):
                    yield w.y - nose, w.z  # (s, z)

# Single-atlas models (FSLTL): the fuselage is whatever sits within its radius.
ATLAS = not any("fuse" in (s.material.name if s.material else "") for o in objs for s in o.material_slots)
# FSLTL's FAIB materials are LIV_*; the HTAI business jets use "livery".
SKIN = "livery" if any(s.material and s.material.name == "livery" for o in objs for s in o.material_slots) else "LIV_"
# Business jets: fuselage under 25 m, engines on the rear fuselage, tip tanks.
JET = ATLAS and max(s for s, _ in verts(SKIN)) < 25
fuse = list(verts(SKIN, lambda w: abs(w.x) < (0.78 if JET else 2.2))) if ATLAS else list(verts("fuse"))
L = max(s for s, _ in fuse)
mid = [z for s, z in fuse if 0.4 * L < s < 0.5 * L]
# Small nose parts share the tail atlas; the fin is what stands above the crown.
tail = [(s, z) for s, z in verts("tail_") if z > max(mid) + 0.3] or [(s, z) for s, z in fuse if z > max(mid) + 0.02 and s > 0.72 * L]
if JET:
    tail = [(s, z) for s, z in verts(SKIN, lambda w: abs(w.x) < 0.3) if z > max(mid) + 0.1 and s > 0.6 * L]
geom = dict(
    L=round(L, 3),
    crown=round(max(mid), 3), belly=round(min(mid), 3),
    finLE=round(min(s for s, _ in tail), 3), finTE=round(max(s for s, _ in tail), 3),
    finTop=round(max(z for _, z in tail), 3),
)
def box(match):
    pts = list(verts(match))
    if not pts:
        return None
    return dict(s0=round(min(p[0] for p in pts), 3), s1=round(max(p[0] for p in pts), 3),
                z0=round(min(p[1] for p in pts), 3), z1=round(max(p[1] for p in pts), 3))

# Fin outline: leading and trailing edge at a few heights, to fit tail logos.
zs = [max(mid) + 0.4 + k * (geom["finTop"] - max(mid) - 0.6) / 7 for k in range(8)]
# Edges come from the convex hull of the fin's points (side view), so the
# outline is right for low-poly models too.
def hull(pts):
    pts = sorted(set(pts))
    def half(seq):
        h = []
        for p in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(p)
        return h
    lo, up = half(pts), half(reversed(pts))
    return lo[:-1] + up[:-1]

poly = hull([(round(s, 3), round(z, 3)) for s, z in tail])
geom["finProfile"] = []
for zc in zs:
    xs = []
    for (s1, z1), (s2, z2) in zip(poly, poly[1:] + poly[:1]):
        if (z1 - zc) * (z2 - zc) <= 0 and z1 != z2:
            xs.append(s1 + (zc - z1) * (s2 - s1) / (z2 - z1))
    if xs:
        geom["finProfile"].append([round(zc, 3), round(min(xs), 3), round(max(xs), 3)])
geom["engine"] = box("cowling") or box("engines")
if ATLAS:
    pts = list(verts("LIV_", lambda w: 3.2 <= abs(w.x) <= 7.8 and w.z < 0.35 and 0.2 * L < w.y - nose < 0.55 * L))
    if pts:
        geom["engine"] = dict(s0=round(min(p[0] for p in pts), 3), s1=round(max(p[0] for p in pts), 3),
                              z0=round(min(p[1] for p in pts), 3), z1=round(max(p[1] for p in pts), 3))
if JET:
    # Low-poly jets: read the fin edges off the rendered silhouette instead.
    import numpy as np
    im = bpy.data.images.load(out)
    a = np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)[:, :, 3]
    geom["finProfile"] = []
    for zc in zs:
        row = a[int((zc - FRAME["Z0"]) * PPM)]
        cols = [c for c in np.nonzero(row > 0.5)[0] if c / PPM + FRAME["S0"] > 0.7 * L]
        if cols:
            geom["finProfile"].append([round(zc, 3), round(cols[0] / PPM + FRAME["S0"], 3), round(cols[-1] / PPM + FRAME["S0"], 3)])
    geom["finLE"] = min(p[1] for p in geom["finProfile"])

    def boxof(pts):
        return dict(s0=round(min(p[0] for p in pts), 3), s1=round(max(p[0] for p in pts), 3),
                    z0=round(min(p[1] for p in pts), 3), z1=round(max(p[1] for p in pts), 3))
    crown = max(mid)
    geom["engine"] = boxof(list(verts(SKIN, lambda w: 0.8 < abs(w.x) < 2.0 and w.y - nose > 0.55 * L and w.z > crown - 1.0)))
    geom["tank"] = boxof(list(verts(SKIN, lambda w: abs(w.x) > 4.6)))
    geom["jet"] = True
geom["atlas"] = ATLAS
geom["sharklet"] = box("sharklets")
print("GEOM", geom)
with open(os.path.splitext(out)[0] + ".json", "w") as f:
    json.dump(dict(FRAME, nose_y=nose, ppm=PPM, geom=geom), f, indent=2)
print("NOSE_Y", nose)
