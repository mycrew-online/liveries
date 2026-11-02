"""Preview renders of the C172 with a livery: the kit's imported exterior with
the stock textures (paintkits/c172/texture-orig) and the livery's preview
albedos (blender/c172_composite.py <out>/preview) in place of the atlases.

blender -b -t 4 --python blender/c172_preview.py -- <preview tex dir> <out dir> [views] [engine]
views: comma list of side_port,side_stbd,front34,rear34,top,tail,cowl,door, cowl_/reg_/tail_ + port|stbd (default all)
engine: WORKBENCH (fast, default) or CYCLES (CPU, 4 threads)
"""
import bpy, glob, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(__file__))
import c172

args = sys.argv[sys.argv.index("--") + 1:]
tex_dir, out = args[:2]
only = args[2].split(",") if len(args) > 2 and args[2] else None
engine = args[3] if len(args) > 3 else "WORKBENCH"
os.makedirs(out, exist_ok=True)

c172.open_kit()
NOSE = c172.nose_y()
s = bpy.context.scene

# Stock textures by file name (the .blend points at the kit author's disk).
stock = {}
for p in glob.glob(os.path.join(c172.KIT, "texture-orig", "asobo_c172sp_g1000", "attachments", "**", "*.*"), recursive=True):
    stock.setdefault(os.path.basename(p).lower(), p)
for img in bpy.data.images:
    base = os.path.basename(bpy.path.abspath(img.filepath)).lower()
    if base in stock:
        img.filepath = stock[base]
        img.reload()

# The atlases: a plain material showing the livery preview albedo.
mats = {}
for atlas in c172.ATLASES:
    m = bpy.data.materials.new("PREVIEW_" + atlas)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.35
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(tex_dir, atlas + ".png"))
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs[0], t.inputs[0])
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    mats[atlas] = m

for o in s.objects:
    ext = any(c.name.startswith("part_exterior") for c in o.users_collection) and o.name.startswith("x0_")
    o.hide_render = not ext
    if ext and o.type == "MESH":
        for sl in o.material_slots:
            if sl.material and sl.material.name in mats:
                m = mats[sl.material.name]
                sl.link = "OBJECT"
                sl.material = m

if engine == "CYCLES":
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 24
    s.cycles.use_denoising = True
    s.render.threads_mode = "FIXED"
    s.render.threads = 4
    w = bpy.data.worlds.new("sky"); s.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 0.92, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(-20), math.radians(30))
    s.collection.objects.link(sun)
else:
    s.render.engine = "BLENDER_WORKBENCH"
    s.display.shading.light = "STUDIO"
    s.display.shading.color_type = "TEXTURE"
    s.display.shading.show_cavity = False
s.view_settings.view_transform = "Standard"
s.render.film_transparent = False
s.render.resolution_x, s.render.resolution_y = 1600, 1000
s.render.image_settings.file_format = "PNG"

C = Vector((0, NOSE + 3.9, 0.15))


def view(name, loc, target=C, lens=50, ortho=None):
    if only and name not in only:
        return
    cam = bpy.data.cameras.new(name)
    if ortho:
        cam.type = "ORTHO"; cam.ortho_scale = ortho
    else:
        cam.lens = lens
    co = bpy.data.objects.new(name, cam)
    s.collection.objects.link(co)
    co.location = loc
    co.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    s.camera = co
    s.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
    print("VIEW", name)


y = NOSE + 3.9
view("side_port", (20, y, 0.15), ortho=9.5)
view("side_stbd", (-20, y, 0.15), ortho=9.5)
view("front34", (-8.5, NOSE - 6.0, 2.2), lens=45)                # starboard front, from above
view("rear34", (8.0, NOSE + 13.0, 2.6), lens=45)                 # port rear, from above
view("top", (0, y, 20), (0, y, 0), ortho=12)
view("tail", (3.2, NOSE + 9.5, 1.4), (0, NOSE + 6.9, 0.6), lens=50)    # fin, rudder, stab from port rear
view("cowl", (-2.6, NOSE - 1.6, 0.3), (0, NOSE + 1.3, -0.1), lens=40)   # cowl seams, starboard
view("door", (3.0, NOSE + 2.1, 0.1), (0, NOSE + 2.6, -0.1), lens=40)    # pilot door seams, port
# Square-on close-ups of the title, registration and fin logo, both sides.
for side, x in (("port", 1), ("stbd", -1)):
    view("cowl_" + side, (3.0 * x, NOSE + 0.8, 0.1), (0, NOSE + 0.8, 0.0), lens=35)
    view("reg_" + side, (4.0 * x, NOSE + 4.7, 0.0), (0, NOSE + 4.7, -0.1), lens=40)
    view("tail_" + side, (4.0 * x, NOSE + 6.9, 0.9), (0, NOSE + 6.9, 0.85), lens=40)
