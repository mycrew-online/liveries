"""Photo-style hero renders of a livery: Cycles, transparent background,
perspective air-to-air angles in 16:9 and 9:16.

blender -b --factory-startup --python blender/hero.py -- <parts dir> <out dir> <size> <samples> <tex dir> [<tex dir> ...]
size is the long edge in pixels (16:9 = size x size*9/16, 9:16 the other way).
ANGLES=name,name limits the shots.
"""
import bpy, math, os, re, sys
from mathutils import Euler, Quaternion, Vector
sys.path.insert(0, os.path.dirname(__file__))
import scene

parts, out, size, samples, *texdirs = sys.argv[sys.argv.index("--") + 1:]
size, samples = int(size), int(samples)
os.makedirs(out, exist_ok=True)

# Besides the painted skin, keep what a photo needs: glass and engine insides
# (a transparent hole there would show the background).
GLASS = re.compile(r"windshield|^glass|hublot", re.I)
INNER = re.compile(r"cfm_internals|fan_blur_opaque|prop_slow", re.I)


def load(folder):
    import glob
    bpy.ops.wm.read_factory_settings(use_empty=True)
    files = sorted(glob.glob(os.path.join(folder, "*.gltf")), key=lambda f: scene.attach_node(f) is not None)
    for f in files:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        node = scene.attach_node(f)
        anchor = bpy.data.objects.get(node) if node else None
        if anchor:
            for o in set(bpy.data.objects) - before:
                if o.parent is None:
                    o.parent = anchor
    keep, extra, flipped = [], {}, set()
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        names = [s.material.name if s.material else "" for s in o.material_slots]
        skin = any(scene.is_livery(scene.albedo_key(s.material)) for s in o.material_slots)
        kind = "glass" if any(GLASS.search(n) for n in names) else "inner" if any(INNER.search(n) for n in names) else None
        if skin or kind:
            if o.data not in flipped:
                o.data.flip_normals(); flipped.add(o.data)
            keep.append(o)
            if kind and not skin:
                extra[o] = kind
        else:
            bpy.data.objects.remove(o)
    return keep, extra


def material(name, color, rough, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    return m


objs, extra = load(parts)
scene.apply_textures(objs, *texdirs)
# Low-poly traffic models come flat-shaded; smooth them by angle.
if os.environ.get("SMOOTH"):
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(float(os.environ["SMOOTH"])))

if os.environ.get("HIDEOBJ"):  # debug: drop objects by name
    for o in [o for o in objs if re.search(os.environ["HIDEOBJ"], o.name)]:
        objs.remove(o); extra.pop(o, None); bpy.data.objects.remove(o)
HIDE = os.environ.get("HIDE")
if HIDE:
    for o in objs:
        for sl in o.material_slots:
            if sl.material and re.search(HIDE, sl.material.name, re.I):
                sl.material = scene.clear()
glass = material("PH_glass", (0.01, 0.012, 0.016), 0.04, coat=1.0)
inner = material("PH_inner", (0.05, 0.05, 0.055), 0.5, metal=0.6)
for o, kind in extra.items():
    for s in o.material_slots:
        s.material = glass if kind == "glass" else inner
# Paint: glossy clear coat on every livery material. Cycles ignores backface
# culling, so back faces (cabin-side linings, exit door insides) go
# transparent through the shader, like in the sim.
for m in bpy.data.materials:
    if m.name.startswith("LIV_") and m.use_nodes:
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        outn = nt.nodes["Material Output"]
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        mix = nt.nodes.new("ShaderNodeMixShader")
        clear = nt.nodes.new("ShaderNodeBsdfTransparent")
        nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
        nt.links.new(b.outputs["BSDF"], mix.inputs[1])
        nt.links.new(clear.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], outn.inputs["Surface"])
        b.inputs["Roughness"].default_value = 0.28
        if "Coat Weight" in b.inputs:
            b.inputs["Coat Weight"].default_value = 0.35
            b.inputs["Coat Roughness"].default_value = 0.08

# Decal shells (FBW LIVERY_OFFICIAL_*) hover a few millimetres over the skin:
# seen by the camera only, so they neither shadow nor dim the gloss above.
DECAL = re.compile(r"decal|livery_albd|LIV_clear", re.I)
for o in objs:
    if o.material_slots and all(sl.material and DECAL.search(sl.material.name) for sl in o.material_slots):
        o.visible_shadow = o.visible_diffuse = o.visible_glossy = o.visible_transmission = o.visible_volume_scatter = False

lo, hi = scene.bounds(objs)
c = (lo + hi) / 2
L = (hi - lo).y
# Attitude pivot: everything hangs off one empty at the centre.
pivot = bpy.data.objects.new("pivot", None)
bpy.context.scene.collection.objects.link(pivot)
pivot.location = c
for o in bpy.data.objects:
    if o.parent is None and o is not pivot and o.type in ("MESH", "EMPTY"):
        mw = o.matrix_world.copy(); o.parent = pivot; o.matrix_world = mw

s = bpy.context.scene
s.render.engine = "CYCLES"
s.cycles.samples = samples
s.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    s.cycles.device = "GPU"
except Exception as e:
    print("GPU unavailable", e)
s.render.film_transparent = True
s.render.image_settings.file_format = "PNG"
s.render.image_settings.color_mode = "RGBA"
s.render.image_settings.color_depth = "8"
s.view_settings.view_transform = "AgX"
try:
    s.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

# Daylight: bright sky dome for reflections and fill, warm low sun as key.
world = bpy.data.worlds.new("sky"); s.world = world; world.use_nodes = True
nt = world.node_tree
bg = nt.nodes["Background"]
grad = nt.nodes.new("ShaderNodeTexGradient"); grad.gradient_type = "LINEAR"
coord = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.32, 0.30, 0.28, 1)  # ground bounce
ramp.color_ramp.elements[1].color = (0.55, 0.70, 1.0, 1)   # sky
ramp.color_ramp.elements[0].position = 0.45
ramp.color_ramp.elements[1].position = 0.6
map_ = nt.nodes.new("ShaderNodeMapRange")
map_.inputs["From Min"].default_value = -1; map_.inputs["From Max"].default_value = 1
nt.links.new(coord.outputs["Generated"], sep.inputs[0])
nt.links.new(sep.outputs["Z"], map_.inputs["Value"])
nt.links.new(map_.outputs["Result"], ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
bg.inputs["Strength"].default_value = 0.9
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.5; sun.data.angle = math.radians(1.5); sun.data.color = (1.0, 0.95, 0.88)
s.collection.objects.link(sun)

NOSE, STBD, UP = Vector((0, -1, 0)), Vector((-1, 0, 0)), Vector((0, 0, 1))

# name: (azimuth from the nose, + = starboard; elevation; distance in lengths;
#        roll + = right wing down; pitch; sun azimuth/elevation from the nose)
SHOTS = {
    "front34": dict(az=38, el=5, d=2.6, roll=-6, pitch=2, sun=(70, 40)),
    "pass": dict(az=82, el=7, d=3.4, roll=0, pitch=1, sun=(60, 45)),
    "rear34": dict(az=-138, el=20, d=2.8, roll=12, pitch=0, sun=(-80, 50)),
    "bank": dict(az=55, el=-14, d=2.8, roll=-22, pitch=4, sun=(30, 60)),
    "climb": dict(az=20, el=-12, d=2.4, roll=-4, pitch=10, sun=(60, 35)),
    "nose": dict(az=12, el=3, d=2.2, roll=-3, pitch=2, sun=(80, 40)),
    "tail": dict(az=-166, el=10, d=2.4, roll=8, pitch=0, sun=(-60, 45)),
    # From above and abeam while banking; camera rolled so the nose points up.
    "above": dict(az=95, el=62, d=2.6, roll=-28, pitch=0, sun=(40, 65), spin=90),
}
ASPECTS = {
    "16x9": ((size, size * 9 // 16), ["front34", "pass", "rear34", "bank"]),
    "9x16": ((size * 9 // 16, size), ["nose", "climb", "above", "tail"]),
}

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
s.collection.objects.link(cam); s.camera = cam
cam.data.clip_end = 10000


def direction(az, el):
    a, e = math.radians(az), math.radians(el)
    return (math.cos(e) * (math.cos(a) * NOSE + math.sin(a) * STBD) + math.sin(e) * UP).normalized()


def frame(w, h, fill=0.86, span=None):
    """Lens and shift so the aircraft fills the frame, centred. With span, only
    parts within span metres of the centre line count (wingtips bleed off)."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    piv = pivot.matrix_world.inverted()
    xs, ys = [], []
    for o in objs:
        mw = inv @ o.matrix_world
        pm = piv @ o.matrix_world
        vs = o.data.vertices
        for i in range(0, len(vs), max(1, len(vs) // 4000)):
            if span and abs((pm @ vs[i].co).x) > span:
                continue
            p = mw @ vs[i].co
            if p.z < -0.1:
                xs.append(p.x / -p.z); ys.append(p.y / -p.z)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    cd = cam.data
    cd.sensor_fit = "HORIZONTAL" if w >= h else "VERTICAL"
    sensor = 36.0
    cd.sensor_width = cd.sensor_height = sensor
    # half-extent of the frame in tan units for each axis
    ax = max((x1 - x0) / 2, (y1 - y0) / 2 * (w / h)) if w >= h else max((y1 - y0) / 2, (x1 - x0) / 2 * (h / w))
    half = ax / fill
    cd.lens = sensor / 2 / half
    big = 2 * half  # frame size (tan units) along the fitted axis
    cd.shift_x = ((x0 + x1) / 2) / big
    cd.shift_y = ((y0 + y1) / 2) / big


only = os.environ.get("ANGLES")
for aspect, ((w, h), names) in ASPECTS.items():
    s.render.resolution_x, s.render.resolution_y = w, h
    for name in names:
        if only and name not in only.split(","):
            continue
        k = SHOTS[name]
        pivot.rotation_euler = Euler((math.radians(-k["pitch"]), math.radians(-k["roll"]), 0), "XYZ")
        cam.location = c + direction(k["az"], k["el"]) * L * k["d"]
        q = (c - cam.location).to_track_quat("-Z", "Y")
        if k.get("spin"):
            q = q @ Quaternion((0, 0, 1), math.radians(k["spin"]))
        cam.rotation_euler = q.to_euler()
        sun.rotation_euler = (-direction(*k["sun"])).to_track_quat("-Z", "Y").to_euler()
        frame(w, h, fill=0.86 if w >= h else 0.94, span=None if w >= h else L * 0.17)
        s.render.filepath = os.path.join(out, f"{aspect}-{name}.png")
        if os.environ.get("PICK"):  # debug: name the meshes under pixels x,y;x,y
            dg = bpy.context.evaluated_depsgraph_get()
            tr, br, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=s)]
            for xy in os.environ["PICK"].split(";"):
                px, py = (float(v) for v in xy.split(","))
                u, t = px / w, py / h
                p = tl + (tr - tl) * u + (bl - tl) * t
                o0 = cam.matrix_world.translation
                d, start = (p - o0).normalized(), o0
                for _ in range(4):  # first hits along the ray, through clear layers
                    hit, loc, nrm, idx, ob, _ = s.ray_cast(dg, start, d)
                    if not hit:
                        break
                    m = ob.data.polygons[idx].material_index
                    if ob.data.uv_layers:
                        from mathutils.geometry import barycentric_transform, intersect_point_tri
                        uvl = ob.data.uv_layers[0].data
                        poly = ob.data.polygons[idx]
                        lp = ob.matrix_world.inverted() @ loc
                        vs = [ob.data.vertices[ob.data.loops[li].vertex_index].co for li in poly.loop_indices]
                        uvs = [uvl[li].uv.to_3d() for li in poly.loop_indices]
                        best = min(range(1, len(vs) - 1), key=lambda k: (intersect_point_tri(lp, vs[0], vs[k], vs[k + 1]) is None, k))
                        uvh = barycentric_transform(lp, vs[0], vs[best], vs[best + 1], uvs[0], uvs[best], uvs[best + 1])
                        print("PICKUV", xy, round(uvh.x, 4), round(uvh.y, 4))
                    print("PICK", xy, ob.name, ob.material_slots[m].material.name, tuple(round(x, 2) for x in loc))
                    start = loc + d * 1e-3
            continue
        bpy.ops.render.render(write_still=True)
        print("WROTE", s.render.filepath)
