"""Check an exported C172 livery (blender/c172_export.py) the way the sim
reads it: every glTF scene's nodes are placed on the stock node its
ASOBO_unique_id names (root scene: aircraft space), and each decal vertex
must land on the stock skin. Optionally renders the decals, alpha-blended
over the plain stock textures, from the preview cameras.

blender -b -t 4 --python blender/c172_verify.py -- <livery dir> [<render out dir>]
"""
import bpy, json, math, os, sys
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(__file__))
import c172

args = sys.argv[sys.argv.index("--") + 1:]
liv = args[0]
render_dir = args[1] if len(args) > 1 else None
c172.open_kit()
obj = bpy.data.objects
YUP = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF -> Blender


def accessor(g, bins, i):
    a = g["accessors"][i]; v = g["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = v.get("byteStride", n * np.dtype(dt).itemsize)
    raw = bins[v["buffer"]]
    return np.array([np.frombuffer(raw, dt, n, off + k * stride) for k in range(a["count"])])


trees = {}


def tree(name):
    if name not in trees:
        o = obj[name]
        co = np.array([o.matrix_world @ v.co for v in o.data.vertices])
        t = KDTree(len(co))
        for k, c in enumerate(co):
            t.insert(c, k)
        t.balance()
        trees[name] = t
    return trees[name]


mats = {}
worst = 0.0
for part in sorted(os.listdir(liv)):
    if not part.startswith("model."):
        continue
    path = os.path.join(liv, part, "LIVERY_LOD00.gltf")
    g = json.load(open(path))
    bins = [open(os.path.join(liv, part, b["uri"]), "rb").read() for b in g["buffers"]]
    for sc in g["scenes"]:
        anchor = sc.get("extensions", {}).get("ASOBO_unique_id", {}).get("id")
        place = obj[anchor].matrix_world if anchor else Matrix.Identity(4)
        for ni in sc["nodes"]:
            nd = g["nodes"][ni]
            src = nd["name"].replace("_MyCrew", "")
            for pr in g["meshes"][nd["mesh"]]["primitives"]:
                P = accessor(g, bins, pr["attributes"]["POSITION"])
                W = np.array([place @ (YUP @ Vector(p)) for p in P])
                t = tree(src)
                d = max(t.find(Vector(w))[2] for w in W[:: max(1, len(W) // 400)])
                worst = max(worst, d)
                print("  %-16s %-36s on %-24s max offset %.4f m" % (part, nd["name"], anchor or "(root)", d))
                if not render_dir:
                    continue
                # Rebuild the decal for the render.
                I = accessor(g, bins, pr["indices"]).reshape(-1, 3)
                UV = accessor(g, bins, pr["attributes"]["TEXCOORD_0"])
                me = bpy.data.meshes.new(nd["name"])
                me.from_pydata([tuple(w) for w in W], [], [tuple(f) for f in I])
                uvl = me.uv_layers.new(name="UVMap")
                uvl.data.foreach_set("uv", np.array([(UV[v][0], 1 - UV[v][1]) for f in I for v in f]).ravel())
                img_name = g["images"][g["textures"][g["materials"][pr["material"]]["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]["uri"]
                if img_name not in mats:
                    m = bpy.data.materials.new("V_" + img_name)
                    nt = m.node_tree
                    b = nt.nodes["Principled BSDF"]
                    tx = nt.nodes.new("ShaderNodeTexImage")
                    tx.image = bpy.data.images.load(os.path.join(liv, "texture", img_name))
                    nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
                    nt.links.new(tx.outputs["Alpha"], b.inputs["Alpha"])
                    b.inputs["Roughness"].default_value = 0.35
                    m.surface_render_method = "BLENDED"
                    mats[img_name] = m
                me.materials.append(mats[img_name])
                o = bpy.data.objects.new(nd["name"] + "_check", me)
                bpy.context.scene.collection.objects.link(o)
print("WORST OFFSET %.4f m" % worst)

if render_dir:
    os.makedirs(render_dir, exist_ok=True)
    # Stock textures, plain material per atlas, decals on top.
    stock = {}
    for atlas, rel in c172.ATLASES.items():
        m = bpy.data.materials.new("STOCK_" + atlas)
        nt = m.node_tree
        tx = nt.nodes.new("ShaderNodeTexImage")
        tx.image = bpy.data.images.load(os.path.join(c172.TEX, rel))
        nt.links.new(tx.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
        nt.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.35
        stock[atlas] = m
    s = bpy.context.scene
    for o in s.objects:
        if o.name.endswith("_check"):
            o.hide_render = False
            # Lift the decal 0.4 mm off the skin so Cycles sees it first (the
            # sim's decal pass needs no offset). Counter-clockwise sources:
            # the computed normals point out.
            for v in o.data.vertices:
                v.co += v.normal * 0.0004
            continue
        ext = any(c.name.startswith("part_exterior") for c in o.users_collection) and o.name.startswith("x0_")
        o.hide_render = not ext
        if ext and o.type == "MESH":
            for sl in o.material_slots:
                if sl.material and sl.material.name in stock:
                    m = stock[sl.material.name]
                    sl.link = "OBJECT"
                    sl.material = m
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 16
    s.cycles.use_denoising = True
    s.render.threads_mode = "FIXED"
    s.render.threads = 4
    w = bpy.data.worlds.new("sky"); s.world = w
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.72, 0.8, 0.9, 1)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(40))
    s.collection.objects.link(sun)
    s.view_settings.view_transform = "AgX"
    s.render.resolution_x, s.render.resolution_y = 1280, 800
    NOSE = c172.nose_y()
    C = Vector((0, NOSE + 3.9, 0.15))
    for name, loc, tgt, lens in [
            ("front34", (-8.5, NOSE - 6.0, 2.2), C, 45),
            ("rear34", (8.0, NOSE + 13.0, 2.6), C, 45),
            ("tail", (3.2, NOSE + 9.5, 1.4), Vector((0, NOSE + 6.9, 0.6)), 50)]:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        cam.data.lens = lens
        s.collection.objects.link(cam)
        cam.location = loc
        cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        s.camera = cam
        s.render.filepath = os.path.join(render_dir, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("VIEW", name)

    # Livery thumbnails, at the kit's sizes: thumbnail.png (front three-
    # quarter on sky), thumbnail_side.png and thumbnail_button.png (port side
    # on transparent).
    th = os.path.join(render_dir, "thumbnail")
    os.makedirs(th, exist_ok=True)
    for name, (w_, h_), transparent, loc, tgt, ortho in [
            ("thumbnail", (720, 344), False, (-7.2, NOSE - 4.6, 1.6), C, None),
            ("thumbnail_side", (930, 340), True, (20, NOSE + 3.8, -0.05), Vector((0, NOSE + 3.8, -0.05)), 9.6),
            ("thumbnail_button", (830, 260), True, (20, NOSE + 3.8, -0.05), Vector((0, NOSE + 3.8, -0.05)), 9.6)]:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        if ortho:
            cam.data.type = "ORTHO"; cam.data.ortho_scale = ortho
        else:
            cam.data.lens = 40
        s.collection.objects.link(cam)
        cam.location = loc
        cam.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        s.camera = cam
        s.render.film_transparent = transparent
        s.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
        s.render.resolution_x, s.render.resolution_y = w_, h_
        s.render.filepath = os.path.join(th, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("THUMB", name)
