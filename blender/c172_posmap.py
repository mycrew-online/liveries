"""C172 position maps and reference geometry, straight from the paint kit's
imported exterior: no bake, the UV triangles are rasterized here.

For every texel of each exterior atlas: R = s, G = z (side faces) or span x
(plan faces), B = face class (c172.STBD/PORT/TOP/BOTTOM), A = 1 where a skin
face covers it. Saved as float32 .npy (metres, not normalised).

Also writes the geometry the designs use (<ref dir>/c172.json) and orthographic
reference renders (c172.png side, c172_plan.png top) in the design frames.

blender -b -t 4 --python blender/c172_posmap.py -- <posmap dir> <ref dir> [size]
"""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
import c172

args = sys.argv[sys.argv.index("--") + 1:]
pos_dir, ref_dir = args[:2]
size = int(args[2]) if len(args) > 2 else 2048
os.makedirs(pos_dir, exist_ok=True)
os.makedirs(ref_dir, exist_ok=True)

c172.open_kit()
NOSE = c172.nose_y()
obj = bpy.data.objects


def world_verts(o):
    me, mw = o.data, o.matrix_world
    co = np.empty(len(me.vertices) * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    m = np.array(mw)
    return co @ m[:3, :3].T + m[:3, 3]


def bbox(names):
    pts = np.concatenate([world_verts(obj[n]) for n in names])
    lo, hi = pts.min(0), pts.max(0)
    return {"s0": lo[1] - NOSE, "s1": hi[1] - NOSE, "z0": lo[2], "z1": hi[2], "x0": lo[0], "x1": hi[0]}


# ---- geometry for the designs ----
fus = world_verts(obj["x0_FUSELAGE_1"])
fus2 = world_verts(obj["x0_FUSELAGE_2"])
allfus = np.concatenate([fus, fus2])
s_all = allfus[:, 1] - NOSE
# Fin: the x0_TAIL/x0_RUDDER vertices on the centre plane, binned by height.
fin = np.concatenate([world_verts(obj["x0_TAIL"]), world_verts(obj["x0_RUDDER"])])
fin = fin[np.abs(fin[:, 0]) < 0.12]
rud = world_verts(obj["x0_RUDDER"])
fuse_top = allfus[:, 2].max()
prof = []
tailcone_top = fus[fus[:, 1] - NOSE > 5.6][:, 2].max()  # fin root
for z in np.arange(tailcone_top + 0.03, fin[:, 2].max() - 0.02, 0.05):
    band = fin[np.abs(fin[:, 2] - z) < 0.03]
    if len(band):
        prof.append([round(float(z), 3), round(float(band[:, 1].min() - NOSE), 3), round(float(band[:, 1].max() - NOSE), 3)])
# Fuselage outline in side view: top and bottom z every 10 cm along s.
outline = []
for s in np.arange(0, s_all.max() + 0.05, 0.1):
    band = allfus[np.abs(s_all - s) < 0.06]
    if len(band):
        outline.append([round(float(s), 2), round(float(band[:, 2].min()), 3), round(float(band[:, 2].max()), 3)])

geom = {
    "L": float(rud[:, 1].max() - NOSE),
    "nose_y": NOSE,
    "crown": float(fuse_top),
    "finRoot": float(tailcone_top),
    "belly": float(allfus[:, 2].min()),
    "finLE": prof[0][1] if prof else None,
    "finTop": float(fin[:, 2].max()),
    "finProfile": prof,
    "outline": outline,
    "hood": bbox(["x0_HOOD"]),
    "pilotDoor": bbox(["x0_Pilot_Door_Out_1"]),
    "copilotDoor": bbox(["x0_Door_CoPilot_Out"]),
    "cargoDoor": bbox(["x0_cargo_door"]),
    "windows": bbox(["x0_WINDOWS"]),
    "wing": bbox(["x0_WING_LEFT"]),
    "stab": bbox(["x0_ELEVATOR"]),
    "rudder": bbox(["x0_RUDDER"]),
    "fuselage2": bbox(["x0_FUSELAGE_2"]),
    "fuselage1": bbox(["x0_FUSELAGE_1"]),
    "kitReg": bbox(["RegistrationNumber"]) if "RegistrationNumber" in obj else None,
}
frames = {
    "body": {"S0": -0.5, "W": 9.0, "Z0": -1.6, "H": 3.6},
    "plan": {"S0": -0.5, "W": 9.0, "Z0": -5.8, "H": 11.6},  # Z = span x (port +)
}
json.dump({"geom": geom, "frames": frames, "nose_y": NOSE}, open(os.path.join(ref_dir, "c172.json"), "w"), indent=1)
print("GEOM L %.2f crown %.2f belly %.2f finLE %s finTop %.2f" % (geom["L"], geom["crown"], geom["belly"], geom["finLE"], geom["finTop"]))


# ---- position maps ----
def raster(px, owner, cls_map, o, slots, cls_code):
    me = o.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2, dtype=np.float64)
    me.uv_layers["UVMap"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) * size
    wv = world_verts(o)
    normals = c172.face_normals(o)
    centres = {}
    lv = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    hits = 0
    for t in me.loop_triangles:
        if t.material_index not in slots:
            continue
        p = t.polygon_index
        if p not in centres:
            c = Vector(wv[[lv[l] for l in me.polygons[p].loop_indices]].mean(0))
            centres[p] = c172.face_class(o, c, Vector(normals[p]))
        cls = centres[p]
        a, b, c = (uv[l] for l in t.loops)
        wa, wb, wc = (wv[lv[l]] for l in t.loops)
        x0, y0 = max(int(min(a[0], b[0], c[0])), 0), max(int(min(a[1], b[1], c[1])), 0)
        x1, y1 = min(int(max(a[0], b[0], c[0])) + 2, size), min(int(max(a[1], b[1], c[1])) + 2, size)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if x0 >= x1 or y0 >= y1 or abs(d) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        l0 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
        l1 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
        l2 = 1 - l0 - l1
        e = -0.75 / max(x1 - x0, y1 - y0)  # edge texels too
        inside = (l0 >= e) & (l1 >= e) & (l2 >= e)
        if not inside.any():
            continue
        w = l0[..., None] * wa + l1[..., None] * wb + l2[..., None] * wc
        s = w[..., 1] - NOSE
        v = w[..., 0] if cls >= c172.TOP else w[..., 2]
        blk = px[y0:y1, x0:x1]
        prev = cls_map[y0:y1, x0:x1]
        clash = inside & (blk[..., 3] > 0) & (prev != cls) & (prev >= 0)
        owner["clash"] += int(clash.sum())
        blk[inside] = np.stack([s, v, np.full_like(s, cls), np.ones_like(s)], -1)[inside]
        prev[inside] = cls
        hits += int(inside.sum())
    return hits


for atlas in c172.ATLASES:
    px = np.zeros((size, size, 4), dtype=np.float32)
    cls_map = np.full((size, size), -1.0, dtype=np.float32)
    owner = {"clash": 0}
    # Big skin last so it wins texels a small part shares.
    users = []
    for n in c172.SKIN:
        o = obj[n]
        slots = [i for i, sl in enumerate(o.material_slots) if sl.material and sl.material.name == atlas]
        if slots:
            users.append((len(o.data.polygons), o, slots))
    for _, o, slots in sorted(users, key=lambda u: u[0]):
        n = raster(px, owner, cls_map, o, slots, None)
        print("  ", atlas, o.name, n, "texels")
    # Grow into the gutter a few texels so mipmaps don't pull in empty texels.
    for _ in range(6):
        hole = px[..., 3] == 0
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = np.roll(px, (dy, dx), axis=(0, 1))
            take = hole & (nb[..., 3] > 0)
            px[take] = nb[take]
            px[take, 3] = 0.5  # gutter: painted, but not a face texel
            hole &= ~take
    np.save(os.path.join(pos_dir, atlas + ".npy"), px)
    print("POSMAP", atlas, "covered %.1f%%" % (100 * (px[..., 3] == 1).mean()), "class clashes", owner["clash"])


# ---- reference renders in the design frames ----
s = bpy.context.scene
for o in s.objects:
    keep = any(c.name.startswith("part_exterior") for c in o.users_collection) and o.name.startswith("x0_")
    o.hide_render = not keep
s.render.engine = "BLENDER_WORKBENCH"
s.display.shading.light = "STUDIO"
s.display.shading.color_type = "MATERIAL"
s.display.shading.show_cavity = True
s.render.film_transparent = True
s.render.image_settings.file_format = "PNG"
s.render.image_settings.color_mode = "RGBA"


def ortho(name, frame, loc, rot, ppm=200):
    cam = bpy.data.cameras.new(name)
    cam.type = "ORTHO"
    cam.ortho_scale = frame["W"]
    cam.sensor_fit = "HORIZONTAL"
    co = bpy.data.objects.new(name, cam)
    s.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = rot
    s.camera = co
    s.render.resolution_x = int(frame["W"] * ppm)
    s.render.resolution_y = int(frame["H"] * ppm)
    s.render.filepath = os.path.join(ref_dir, name + ".png")
    bpy.ops.render.render(write_still=True)


b, p = frames["body"], frames["plan"]
# Port side, nose left: camera on +X looking -X, frame centre in (s, z).
ortho("c172", b, (20, NOSE + b["S0"] + b["W"] / 2, b["Z0"] + b["H"] / 2), (math.pi / 2, 0, math.pi / 2))
# Plan, nose left, port wing (+X) up: that is the view from below.
ortho("c172_plan", p, (p["Z0"] + p["H"] / 2, NOSE + p["S0"] + p["W"] / 2, -20), (math.pi, 0, math.pi / 2))
print("DONE")
