"""Bake side-view livery artwork onto the aircraft's UV textures.

Every mesh that samples one of the target textures gets an emission material:
    base   = paint kit template at the mesh UV
    art    = artwork projected from the side: port image where X > 0, starboard
             where X < 0, at (s, z) = (Y - nose, Z) in the design frame
    result = mix(base, art * base / white, art.alpha)
so panel lines and shading of the template survive under the paint. The
result is baked into a copy of the template, so texels no mesh covers stay
as they were.

blender -b --factory-startup --python blender/bake.py -- <job.json>

job.json:
  parts      converted glTF folder
  ref        work/ref/<type>.json (frame + nose)
  art        folder with body_port.png / body_stbd.png
  base       folder of template PNGs (full resolution)
  out        output folder
  size       texture size (e.g. 8192, 2048 for drafts)
  targets    regex of texture keys to bake (e.g. "fuse_|tail|stabs")
  white      template white point (default 0.92)
"""
import bpy, json, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import scene

job = json.load(open(sys.argv[sys.argv.index("--") + 1]))
ref = json.load(open(job["ref"]))
size = int(job.get("size", 8192))
white = float(job.get("white", 0.92))
target = re.compile(job["targets"])
os.makedirs(job["out"], exist_ok=True)

objs = scene.load_parts(job["parts"])
base_tex = scene.texture_from(job["base"])
# Artwork layer per texture: engines and sharklets overlap the fuselage in
# side view, so they get their own artwork in the same frame.
LAYERS = [("cowling", "engine"), ("engines", "engine"), ("sharklets", "sharklet"), ("", "body")]


def art_for(key):
    layer = next(l for m, l in LAYERS if m in key)
    imgs = []
    for side in ("port", "stbd"):
        p = os.path.join(job["art"], "%s_%s.png" % (layer, side))
        imgs.append(bpy.data.images.load(p, check_existing=True) if os.path.exists(p) else None)
    return imgs

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


def link(nt, a, b):
    nt.links.new(a, b)


def math(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            link(nt, v, n.inputs[i])
    return n.outputs[0]


def bake_material(key, base_img, target_img, art_port, art_stbd):
    m = bpy.data.materials.new("BAKE_" + key)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    link(nt, emit.outputs[0], out.inputs["Surface"])

    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"
    base = nt.nodes.new("ShaderNodeTexImage"); base.image = base_img; base.interpolation = "Closest"
    link(nt, uv.outputs[0], base.inputs[0])

    geo = nt.nodes.new("ShaderNodeNewGeometry")
    xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    link(nt, geo.outputs["Position"], xyz.inputs[0])
    u = math(nt, "DIVIDE", math(nt, "SUBTRACT", math(nt, "SUBTRACT", xyz.outputs["Y"], ref["nose_y"]), ref["S0"]), ref["W"])
    v = math(nt, "DIVIDE", math(nt, "SUBTRACT", xyz.outputs["Z"], ref["Z0"]), ref["H"])
    co = nt.nodes.new("ShaderNodeCombineXYZ")
    link(nt, u, co.inputs[0]); link(nt, v, co.inputs[1])

    port = nt.nodes.new("ShaderNodeTexImage"); port.image = art_port; port.extension = "CLIP"
    stbd = nt.nodes.new("ShaderNodeTexImage"); stbd.image = art_stbd; stbd.extension = "CLIP"
    link(nt, co.outputs[0], port.inputs[0]); link(nt, co.outputs[0], stbd.inputs[0])
    is_port = math(nt, "GREATER_THAN", xyz.outputs["X"], 0.0)

    col = nt.nodes.new("ShaderNodeMix"); col.data_type = "RGBA"
    link(nt, is_port, col.inputs["Factor"])
    link(nt, stbd.outputs["Color"], col.inputs[6]); link(nt, port.outputs["Color"], col.inputs[7])
    alpha = nt.nodes.new("ShaderNodeMix"); alpha.data_type = "FLOAT"
    link(nt, is_port, alpha.inputs["Factor"])
    link(nt, stbd.outputs["Alpha"], alpha.inputs[2]); link(nt, port.outputs["Alpha"], alpha.inputs[3])

    # Paint keeps the template's shading: art * base / white.
    shade = nt.nodes.new("ShaderNodeMix"); shade.data_type = "RGBA"; shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    link(nt, col.outputs[2], shade.inputs[6]); link(nt, base.outputs["Color"], shade.inputs[7])
    gain = nt.nodes.new("ShaderNodeMix"); gain.data_type = "RGBA"; gain.blend_type = "MULTIPLY"
    gain.inputs["Factor"].default_value = 1.0; gain.clamp_result = True
    link(nt, shade.outputs[2], gain.inputs[6])
    gain.inputs[7].default_value = (1 / white, 1 / white, 1 / white, 1)

    final = nt.nodes.new("ShaderNodeMix"); final.data_type = "RGBA"
    link(nt, alpha.outputs[0], final.inputs["Factor"])
    link(nt, base.outputs["Color"], final.inputs[6]); link(nt, gain.outputs[2], final.inputs[7])
    link(nt, final.outputs[2], emit.inputs["Color"])

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


groups = {}
for o in objs:
    for i, slot in enumerate(o.material_slots):
        key = scene.albedo_key(slot.material)
        if key and target.search(key):
            groups.setdefault(key, []).append((o, i))

for key, users in sorted(groups.items()):
    src = base_tex(key)
    if src is None:
        print("SKIP no template for", key)
        continue
    print("BAKE", key, len(users), "material slots")
    tgt = bpy.data.images.new("OUT_" + key, size, size, alpha=False)
    tgt.colorspace_settings.name = "sRGB"
    # Start from the template so uncovered texels keep it.
    if tuple(src.size) != (size, size):
        src.scale(size, size)
    px = np.empty(size * size * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    tgt.pixels.foreach_set(px)
    del px
    port_img, stbd_img = art_for(key)
    if port_img is None:
        print("SKIP no artwork layer for", key)
        continue
    mat = bake_material(key, src, tgt, port_img, stbd_img)
    saved = [(o, i, o.material_slots[i].material) for o, i in users]
    for o, i in users:
        o.material_slots[i].material = mat
    # Other slots on these objects must not bake into this texture.
    for o, _ in users:
        for sl in o.material_slots:
            if sl.material is not mat and sl.material and sl.material.use_nodes:
                for n in sl.material.node_tree.nodes:
                    n.select = False
                sl.material.node_tree.nodes.active = None
    # Small parts (hatches, latches) often reuse a patch of the skin texture.
    # Bake them first and the big skin meshes last, so the skin wins there.
    faces = {}
    for o, i in users:
        faces[o] = faces.get(o, 0) + sum(1 for p in o.data.polygons if p.material_index == i)
    total = sum(faces.values())
    main = {o for o, n in faces.items() if n > 0.1 * total}
    # Some hatches map a sliver of geometry across most of the texture; baking
    # them would smear their colour everywhere. Skip parts whose UV area per
    # square metre is far above the main skin's.
    dens = {o: uv_density(o, [i for oo, i in users if oo is o]) for o in faces}
    ref_d = max((dens[o] for o in main), default=0) or 1
    for o in list(faces):
        if o not in main and dens[o] > 50 * ref_d:
            print("  skip", o.name, "uv density x%.0f" % (dens[o] / ref_d))
            del faces[o]
    s.render.bake.margin = max(2, size // 2048)
    s.render.bake.margin_type = "EXTEND"
    s.render.bake.use_clear = False
    for batch in (set(faces) - main, main):
        if not batch:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in batch:
            o.select_set(True)
        bpy.context.view_layer.objects.active = next(iter(batch))
        bpy.ops.object.bake(type="EMIT", use_clear=False)
    print("  main skin:", sorted(o.name for o in main))
    tgt.filepath_raw = os.path.join(job["out"], key + ".png")
    tgt.file_format = "PNG"
    tgt.save()
    for o, i, m in saved:
        o.material_slots[i].material = m
    print("SAVED", tgt.filepath_raw)
