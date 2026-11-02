"""Shared Blender helpers: load converted aircraft parts, texture them from a
folder of albedo PNGs, and render preview views.

Run inside Blender: blender -b --factory-startup --python <script> -- <args>
"""
import bpy, glob, math, os, re
from mathutils import Vector


def norm(name):
    """A319_FUSE_1_ALBD.PNG.KTX2 / A319_fuse_1_Albd.png -> a319_fuse_1_albd"""
    n = os.path.basename(name).lower()
    n = re.sub(r"\.\d{3}$", "", n)  # Blender de-dup suffix
    n = re.sub(r"(\.png)?(\.ktx2|\.dds)?$", "", n)
    return n.replace("albedo", "albd")


# Which fuselage node each Fenix part hangs off (attached_objects.cfg).
# Sharklets / wingtip fences merge into the wing model, so share its node.
ATTACH = {
    "Stabilizers": "Attach_Stabilizers",
    "CFM": "Attach_Engines_CFM",
    "IAE": "Attach_Engines_IAE",
    "Wings": "Attach_Wings",
    "SL": "Attach_Wings",
    "WF": "Attach_Wings",
}


def attach_node(path):
    name = os.path.splitext(os.path.basename(path))[0]
    for key, node in ATTACH.items():
        if name == "Part_Exterior_" + key or name.startswith("Part_Exterior_" + key + "_"):
            return node
    return None


def load_parts(folder):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    files = sorted(glob.glob(os.path.join(folder, "*.gltf")), key=lambda f: attach_node(f) is not None)
    for f in files:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=f)
        node = attach_node(f)
        if not node:
            continue
        anchor = bpy.data.objects.get(node)
        if anchor is None:
            print("WARN no attach node", node, "for", f)
            continue
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.parent = anchor
    # Keep only the painted skin: meshes whose material samples a livery
    # texture. Drops shadow planes, helper boxes, glass and gear.
    keep = []
    flipped = set()
    for o in list(bpy.data.objects):
        if o.type == "MESH" and any(is_livery(albedo_key(s.material)) for s in o.material_slots):
            # MSFS models wind clockwise; flip so normals face out in Blender.
            if o.data not in flipped:
                o.data.flip_normals()
                flipped.add(o.data)
            keep.append(o)
            if o.name not in bpy.context.view_layer.objects:
                bpy.context.scene.collection.objects.link(o)
        elif o.type == "MESH":
            bpy.data.objects.remove(o)
    return keep


LIVERY = re.compile(r"(fuse_\d|tail|stabs|wing_albd|sharklets|wingtip_fence|cowling|airframe_(fuselage|engines|wings|livery)_albd|^faib_\w+_t$|^ailear25$)")


def is_livery(key):
    return bool(key and LIVERY.search(key))


def albedo_key(mat):
    """The livery texture a material samples, e.g. 'a319_fuse_1_albd', or None.
    MSFS names albedos *_ALBD; FSLTL's FAIB models use *_T, found as the image
    feeding the base colour."""
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and "_albd" in norm(n.image.name):
            return norm(n.image.name)
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            for link in n.inputs["Base Color"].links:
                src = link.from_node
                if src.type == "TEX_IMAGE" and src.image:
                    return norm(src.image.name)
    return None


def texture_from(folder):
    files = {norm(p): p for p in glob.glob(os.path.join(folder, "*.png"))}
    cache = {}

    def get(key):
        if key not in files:
            return None
        if key not in cache:
            cache[key] = bpy.data.images.load(files[key], check_existing=True)
        return cache[key]
    return get


def grey():
    m = bpy.data.materials.get("LIV_grey")
    if m is None:
        m = bpy.data.materials.new("LIV_grey")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.36, 0.38, 1)
    return m


def clear():
    m = bpy.data.materials.get("LIV_clear")
    if m is None:
        m = bpy.data.materials.new("LIV_clear")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.0
    return m


def apply_textures(objs, *folders):
    """Plain principled material per livery texture, first folder wins."""
    getters = [texture_from(f) for f in folders]
    made = {}
    for o in objs:
        for slot in o.material_slots:
            key = albedo_key(slot.material)
            if key and "livery_texts" in key:  # FBW titles sheet: our liveries blank it
                slot.material = clear()
                continue
            if key and "ribbons" in key:  # FBW seal/rivet shading, not paint
                slot.material = clear()
                continue
            decal = bool(key and ("decal" in key or "livery_albd" in key))
            img = next((g(key) for g in getters if key and g(key)), None)
            if not is_livery(key) and not decal:
                if img is None:
                    slot.material = grey()
                    continue
                decal = True  # aircraft's own overlay (FBW ribbons): blend by alpha
            if img is None:
                slot.material = clear() if decal else slot.material
                continue
            if key not in made:
                m = bpy.data.materials.new("LIV_" + key)
                m.use_nodes = True
                nt = m.node_tree
                bsdf = nt.nodes["Principled BSDF"]
                tex = nt.nodes.new("ShaderNodeTexImage")
                tex.image = img
                uv = nt.nodes.new("ShaderNodeUVMap")
                uv.uv_map = o.data.uv_layers[0].name if o.data.uv_layers else ""
                nt.links.new(uv.outputs["UV"], tex.inputs["Vector"])
                nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
                bsdf.inputs["Roughness"].default_value = 0.35
                m.use_backface_culling = True  # like the sim; hides cabin-side linings
                if decal:  # decals blend over the skin by their alpha
                    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
                made[key] = m
            slot.material = made[key]


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi


def nose_y(objs):
    """Model Y of the nose tip. The nose points to -Y and +X is the port side."""
    best = 1e9
    atlas = not any("fuse" in (s.material.name if s.material else "") for o in objs for s in o.material_slots)
    for o in objs:
        if not atlas and not any("fuse" in (s.material.name if s.material else "") for s in o.material_slots):
            continue
        for v in o.data.vertices:
            best = min(best, (o.matrix_world @ v.co).y)
    return best


def setup_render(res=(2400, 900), engine="BLENDER_EEVEE"):
    s = bpy.context.scene
    s.render.engine = engine
    if engine == "CYCLES":
        s.cycles.samples = 32
        s.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            s.cycles.device = "GPU"
        except Exception:
            pass
    s.render.resolution_x, s.render.resolution_y = res
    s.render.film_transparent = False
    world = bpy.data.worlds.new("W"); s.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.70, 0.80, 1)
    bg.inputs["Strength"].default_value = 1.0
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    s.collection.objects.link(sun)


def camera(name, loc, target, ortho=None, lens=50):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"; cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens
    cam.data.clip_end = 1000
    return cam


def render(cam, path):
    s = bpy.context.scene
    s.camera = cam
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
