"""Bake position maps: for every texel of each livery texture, where it sits
on the aircraft in the design frame. R = s (frame u), G = z (frame v),
B = 1 on the port side (model X > 0), A = 1 where a mesh covers the texel.

Done once per aircraft type; liveries are then plain image composites
(blender/composite.py), so a design change never needs another bake.

blender -b --factory-startup --python blender/posmap.py -- <parts dir> <ref.json> <out dir> <size> <targets regex>
"""
import bpy, json, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import scene

args = sys.argv[sys.argv.index("--") + 1:]
parts, ref_path, out_dir, size, targets = args[:5]
# Optional object name filters: only objects matching / none matching.
only_objs = re.compile(args[5]) if len(args) > 5 and args[5] else None
skip_objs = re.compile(args[6]) if len(args) > 6 and args[6] else None
FIRST = re.compile(r"Wingroot")
LAST = re.compile(r"Gear_\w*Door")
ref = json.load(open(ref_path))
size = int(size)
target = re.compile(targets)
os.makedirs(out_dir, exist_ok=True)

objs = scene.load_parts(parts)


def split_atlas(objs):
    """Single-atlas models (FSLTL): split each mesh into fuselage/tail and
    engine pieces by position; wings and gear are dropped so they keep the
    template. Returns the new objects, each tagged with ["cls"]."""
    import bmesh
    g = ref["geom"]; L = g["L"]; nose = ref["nose_y"]

    def classify_jet(c):
        # Nacelles on the rear fuselage and tip tanks take the engine art;
        # wings, the T-tail stabiliser and gear keep the template.
        s, ax = c.y - nose, abs(c.x)
        if ax > 0.3 and c.z > g["crown"] + 0.8:
            return None  # T-tail stabiliser
        if ax > 4.6 or (0.8 < ax < 2.0 and s > 0.55 * L and c.z > g["crown"] - 1.0):
            return "engine"
        if ax > 0.8 or (ax > 0.3 and c.z > g["crown"] + 0.8):
            return None
        return "body"

    def classify(c):
        s, ax = c.y - nose, abs(c.x)
        if g.get("jet"):
            return classify_jet(c)
        if 3.2 <= ax <= 7.8 and c.z < 0.35 and 0.2 * L < s < 0.55 * L:
            return "engine"
        if ax > 2.3 and s < g["finLE"] - 4:
            return None  # wing
        if c.z < g["belly"] - 0.4 and ax < 3.5:
            return None  # gear
        return "body"

    out = []
    for o in objs:
        mw = o.matrix_world
        for cls in ("body", "engine"):
            dup = o.copy(); dup.data = o.data.copy()
            bpy.context.scene.collection.objects.link(dup)
            bm = bmesh.new(); bm.from_mesh(dup.data)
            drop = [f for f in bm.faces if classify(mw @ f.calc_center_median()) != cls]
            bmesh.ops.delete(bm, geom=drop, context="FACES")
            bm.to_mesh(dup.data); bm.free()
            if len(dup.data.polygons):
                dup["cls"] = cls
                out.append(dup)
            else:
                bpy.data.objects.remove(dup)
        bpy.data.objects.remove(o)
    return out


if ref.get("geom", {}).get("atlas"):
    objs = split_atlas(objs)

s = bpy.context.scene
s.render.engine = "CYCLES"
s.cycles.samples = 1
s.cycles.use_denoising = False
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    s.cycles.device = "GPU"
except Exception as e:
    print("GPU unavailable, CPU bake:", e)


def math(nt, op, a, b):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = op
    for i, v in enumerate((a, b)):
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def posmap_material(key, target_img, engine=False):
    m = bpy.data.materials.new("POS_" + key + ("_engine" if engine else ""))
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], xyz.inputs[0])
    u = math(nt, "DIVIDE", math(nt, "SUBTRACT", math(nt, "SUBTRACT", xyz.outputs["Y"], ref["nose_y"]), ref["S0"]), ref["W"])
    v = math(nt, "DIVIDE", math(nt, "SUBTRACT", xyz.outputs["Z"], ref["Z0"]), ref["H"])
    port = math(nt, "GREATER_THAN", xyz.outputs["X"], 0.0)
    if engine:
        # Engine texels on a shared atlas: B = 0.375 port / 0.625 starboard
        # (body stays 1 / 0), so the compositor picks the engine artwork.
        port = math(nt, "ADD", math(nt, "MULTIPLY", port, -0.25), 0.625)
    co = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(u, co.inputs[0]); nt.links.new(v, co.inputs[1]); nt.links.new(port, co.inputs[2])
    nt.links.new(co.outputs[0], emit.inputs["Color"])
    tgt = nt.nodes.new("ShaderNodeTexImage"); tgt.image = target_img
    nt.nodes.active = tgt
    return m


def uv_density(o, slots):
    """UV area per world square metre over the faces using the given slots."""
    me, mw = o.data, o.matrix_world
    uv = me.uv_layers["UVMap"].data
    ua = wa = 0.0
    for p in me.polygons:
        if p.material_index not in slots:
            continue
        pts = [uv[l].uv for l in p.loop_indices]
        ua += abs(sum(pts[k].x * pts[k - 1].y - pts[k - 1].x * pts[k].y for k in range(len(pts)))) / 2
        vs = [mw @ me.vertices[v].co for v in p.vertices]
        for k in range(1, len(vs) - 1):
            wa += (vs[k] - vs[0]).cross(vs[k + 1] - vs[0]).length / 2
    return ua / wa if wa > 1e-9 else 0.0


def uv_mask(users, size):
    """Texels covered by the UV faces of the given (object, slot) pairs."""
    mask = np.zeros((size, size), dtype=bool)
    for o, i in users:
        uv = o.data.uv_layers["UVMap"].data
        for p in o.data.polygons:
            if p.material_index != i:
                continue
            pts = [(uv[l].uv.x * size, uv[l].uv.y * size) for l in p.loop_indices]
            # Edges too: faces squashed to a line in UV still sample texels.
            for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
                n = int(max(abs(bx - ax), abs(by - ay))) + 2
                t = np.linspace(0, 1, n)
                xs = np.clip((ax + (bx - ax) * t).astype(int), 0, size - 1)
                ys = np.clip((ay + (by - ay) * t).astype(int), 0, size - 1)
                mask[ys, xs] = True
            for k in range(1, len(pts) - 1):
                (ax, ay), (bx, by), (cx, cy) = pts[0], pts[k], pts[k + 1]
                x0, x1 = max(int(min(ax, bx, cx)), 0), min(int(max(ax, bx, cx)) + 1, size)
                y0, y1 = max(int(min(ay, by, cy)), 0), min(int(max(ay, by, cy)) + 1, size)
                d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
                if x0 >= x1 or y0 >= y1 or abs(d) < 1e-12:
                    continue
                gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
                w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / d
                w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / d
                e = 1.5 / max(x1 - x0, y1 - y0)  # include edge texels
                mask[y0:y1, x0:x1] |= (w0 >= -e) & (w1 >= -e) & (w0 + w1 <= 1 + e)
    return mask


def fill_unbaked(users, px, size):
    """Faces the bake leaves empty (FBW rudder hinge strip) would keep the
    plain base or, after gap filling, a neighbour's position: rasterize their
    own positions into the texels they cover that are still empty."""
    def pos(w):
        return ((w[..., 1] - ref["nose_y"] - ref["S0"]) / ref["W"], (w[..., 2] - ref["Z0"]) / ref["H"], (w[..., 0] > 0).astype(np.float32))
    for o, i in users:
        me, mw = o.data, o.matrix_world
        uv = me.uv_layers["UVMap"].data
        for p in me.polygons:
            if p.material_index != i:
                continue
            pts = np.array([(uv[l].uv.x * size, uv[l].uv.y * size) for l in p.loop_indices])
            x0, y0 = np.maximum(pts.min(0).astype(int), 0)
            x1, y1 = np.minimum(pts.max(0).astype(int) + 2, size)
            if x0 >= x1 or y0 >= y1 or px[y0:y1, x0:x1, 3].min() > 0:
                continue
            ws = np.array([tuple(mw @ me.vertices[me.loops[l].vertex_index].co) for l in p.loop_indices])
            for k in range(1, len(pts) - 1):
                (ax, ay), (bx, by), (cx, cy) = pts[0], pts[k], pts[k + 1]
                tx0, ty0 = max(int(min(ax, bx, cx)), 0), max(int(min(ay, by, cy)), 0)
                tx1, ty1 = min(int(max(ax, bx, cx)) + 2, size), min(int(max(ay, by, cy)) + 2, size)
                d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
                if tx0 >= tx1 or ty0 >= ty1 or abs(d) < 1e-9:
                    continue
                gx, gy = np.meshgrid(np.arange(tx0, tx1) + 0.5, np.arange(ty0, ty1) + 0.5)
                l0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / d
                l1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / d
                l2 = 1 - l0 - l1
                e = -1.0 / max(tx1 - tx0, ty1 - ty0)  # edge texels too
                inside = (l0 >= e) & (l1 >= e) & (l2 >= e) & (px[ty0:ty1, tx0:tx1, 3] == 0)
                if not inside.any():
                    continue
                w = l0[..., None] * ws[0] + l1[..., None] * ws[k] + l2[..., None] * ws[k + 1]
                r, g, b = pos(w)
                blk = px[ty0:ty1, tx0:tx1]
                blk[inside] = np.stack([r, g, b, np.ones_like(r)], -1)[inside]


groups = {}
for o in objs:
    if (only_objs and not only_objs.search(o.name)) or (skip_objs and skip_objs.search(o.name)):
        continue
    for i, slot in enumerate(o.material_slots):
        key = scene.albedo_key(slot.material)
        if key and target.search(key):
            groups.setdefault(key, []).append((o, i))

s.render.bake.margin = max(2, size // 1024)
s.render.bake.margin_type = "EXTEND"
s.render.bake.use_clear = False

for key, users in sorted(groups.items()):
    print("POSMAP", key, len(users), "material slots")
    tgt = bpy.data.images.new("POS_" + key, size, size, alpha=True, float_buffer=True)
    tgt.colorspace_settings.name = "Non-Color"
    tgt.pixels.foreach_set(np.zeros(size * size * 4, dtype=np.float32))
    mat = posmap_material(key, tgt)
    emat = posmap_material(key, tgt, engine=True)
    saved = [(o, i, o.material_slots[i].material) for o, i in users]
    for o, i in users:
        o.material_slots[i].material = emat if o.get("cls") == "engine" else mat
    for o, _ in users:
        for sl in o.material_slots:
            if sl.material not in (mat, emat) and sl.material and sl.material.use_nodes:
                for n in sl.material.node_tree.nodes:
                    n.select = False
                sl.material.node_tree.nodes.active = None
    # Small parts (hatches, latches) often reuse a patch of the skin texture:
    # bake them first and the big skin meshes last, so the skin wins there.
    # Parts that squeeze most of the texture onto a sliver are skipped.
    faces = {}
    for o, i in users:
        faces[o] = faces.get(o, 0) + sum(1 for p in o.data.polygons if p.material_index == i)
    total = sum(faces.values())
    main = {o for o, n in faces.items() if n > 0.1 * total}
    dens = {o: uv_density(o, [i for oo, i in users if oo is o]) for o in faces}
    ref_d = max((dens[o] for o in main), default=0) or 1
    for o in list(faces):
        if o not in main and dens[o] > 50 * ref_d:
            print("  skip", o.name, "uv density x%.0f" % (dens[o] / ref_d))
            del faces[o]
    # Fenix wing-root fairings reuse belly and gear door texels on faces that
    # stay hidden: they bake first, so everything else wins shared texels,
    # and the gear doors bake last of all.
    first = {o for o in faces if FIRST.search(o.name)}
    last = {o for o in faces if LAST.search(o.name)}
    rest = set(faces) - first - last
    for batch in (first, rest - main, rest & main, last):
        if not batch:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in batch:
            o.select_set(True)
        bpy.context.view_layer.objects.active = next(iter(batch))
        bpy.ops.object.bake(type="EMIT", use_clear=False)
    # Grow the baked texels into the empty gutter around them, never into
    # texels another part samples: thin UV strips (FBW rudder nose) pick up
    # the gutter through mipmaps and would show the plain base as a line.
    px = np.empty(size * size * 4, dtype=np.float32)
    tgt.pixels.foreach_get(px)
    px = px.reshape(size, size, 4)
    fill_unbaked([(o, i) for o, i in users if o in faces and o.get("cls") != "engine"], px, size)
    others = [(o, k) for o in objs for k, sl in enumerate(o.material_slots)
              if scene.albedo_key(sl.material) == key and (o, k) not in users]
    others += [(o, i) for o, i in users if o not in faces]
    free = ~uv_mask(others, size)
    for _ in range(size // 64):
        hole = (px[..., 3] == 0) & free
        if not hole.any():
            break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb = np.roll(px, (dy, dx), axis=(0, 1))
            take = hole & (nb[..., 3] > 0)
            px[take] = nb[take]
            hole &= ~take
    tgt.pixels.foreach_set(px.ravel())
    # 16-bit PNG: 1/65535 of the frame is under a millimetre on the aircraft.
    s.view_settings.view_transform = "Standard"
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.image_settings.color_depth = "16"
    tgt.save_render(os.path.join(out_dir, key + ".png"), scene=s)
    for o, i, m in saved:
        o.material_slots[i].material = m
    bpy.data.images.remove(tgt)
    print("SAVED", key)
