"""Export one C172 livery's decal meshes as MSFS 2024 source glTF.

For every painted stock skin object (c172.PARTS) a copy is made that keeps
the stock exterior UVs (UVMap = atlas, UVMap.001 = detail), loses the faces
on other materials and the faces whose texels the livery leaves transparent,
and gets a geometry-decal material showing the livery texture of its atlas.
One glTF per livery model: <out>/model.<part>/LIVERY_LOD00.gltf, textures in
<out>/texture.

Decals on moving parts go each in their own glTF scene tagged with the stock
node's ASOBO_unique_id, as Asobo's exporter writes parented objects: the sim
attaches the decal to that node, so it follows doors, rudder, elevator,
flaps and ailerons; their vertices stay in the stock object's own space.
Decals on fixed skin (c172.STATIC) go in the root scene in model space, the
way the kit places its registration panels.

Written with Blender's own glTF exporter and the MSFS extensions added
afterwards: Asobo's exporter (SDK 1.8.1) does not load here, its
_addons_common package has no sources. The kit's livery glTFs are the
reference for the compiled result (clockwise winding, scenes per parent node).

The decal sets only the base colour: the roughness, metallic, normal,
emissive and occlusion blend factors are 0, so the stock panel lines, rivets
and gloss stay on the paint.

blender -b -t 4 --factory-startup --python blender/c172_export.py -- <livery tex dir> <out dir> [prefix]
"""
import bmesh, bpy, json, os, shutil, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import c172

args = sys.argv[sys.argv.index("--") + 1:]
tex_dir, out = (os.path.abspath(a) for a in args[:2])
prefix = args[2] if len(args) > 2 else "MYCREW_C172"

c172.open_kit()


def painted_mask(png, grow=4):
    img = bpy.data.images.load(png)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    m = px.reshape(h, w, 4)[..., 3] > 0.01
    for _ in range(grow):  # keep faces next to paint: filtering reaches them
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    # Summed-area table: painted texels in any UV box in O(1).
    sat = np.zeros((h + 1, w + 1), dtype=np.int64)
    sat[1:, 1:] = m.astype(np.int64).cumsum(0).cumsum(1)
    return sat, w, h


def any_paint(sat, w, h, uvs):
    x0 = int(np.clip(uvs[:, 0].min() * w, 0, w - 1)); x1 = int(np.clip(uvs[:, 0].max() * w, 0, w - 1)) + 1
    y0 = int(np.clip(uvs[:, 1].min() * h, 0, h - 1)); y1 = int(np.clip(uvs[:, 1].max() * h, 0, h - 1)) + 1
    return sat[y1, x1] - sat[y0, x1] - sat[y1, x0] + sat[y0, x0] > 0


masks, mats, pngs = {}, {}, {}
for atlas in c172.ATLASES:
    name = "%s_%s_ALBD.png" % (prefix, atlas.upper())
    png = os.path.join(tex_dir, name)
    masks[atlas] = painted_mask(png)
    pngs[atlas] = name
    m = bpy.data.materials.new("%s_%s" % (prefix, atlas.upper()))
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(png)
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Metallic"].default_value = 0.0
    mats[atlas] = m

decals = {}
for part, names in c172.PARTS.items():
    decals[part] = []
    for n in names:
        src = bpy.data.objects[n]
        me = src.data.copy()
        slot_atlas = {i: sl.material.name for i, sl in enumerate(src.material_slots) if sl.material and sl.material.name in mats}
        uv = np.empty(len(me.loops) * 2, dtype=np.float64)
        me.uv_layers["UVMap"].data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        drop = [p.index for p in me.polygons
                if slot_atlas.get(p.material_index) is None
                or not any_paint(*masks[slot_atlas[p.material_index]], uv[p.loop_start:p.loop_start + p.loop_total])]
        bm = bmesh.new(); bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in drop], context="FACES")
        bm.to_mesh(me); bm.free()
        if not me.polygons:
            bpy.data.meshes.remove(me)
            print("  skip", n, "(nothing painted)")
            continue
        for i, sm in enumerate(me.materials):
            if sm and sm.name in mats:
                me.materials[i] = mats[sm.name]
        # Leftover stock materials have no faces any more; drop their slots.
        used = {p.material_index for p in me.polygons}
        for i in sorted(range(len(me.materials)), reverse=True):
            if i not in used:
                me.materials.pop(index=i)
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        o = bpy.data.objects.new(n + "_MyCrew", me)
        bpy.context.scene.collection.objects.link(o)
        if n in c172.STATIC:
            me.transform(src.matrix_world)  # model root space, like the kit's registration panels
            o["attach"] = ""
        else:
            o["attach"] = n
        decals[part].append(o)
        print("  %s %s: %d faces" % (part, o.name, len(me.polygons)))

DECAL = {"mode": "default", "baseColorBlendFactor": 1.0, "metallicBlendFactor": 0.0, "roughnessBlendFactor": 0.0,
         "normalBlendFactor": 0.0, "emissiveBlendFactor": 0.0, "occlusionBlendFactor": 0.0,
         "decalChan0": True, "decalChan1": False, "decalChan2": True}
ATLAS_OF = {m.name: a for a, m in mats.items()}


def msfs(path, objs):
    """Blender glTF -> MSFS livery glTF: scenes per stock node, unique ids,
    geometry-decal materials, image URIs by file name, counter-clockwise winding."""
    g = json.load(open(path))
    attach = {o.name: o["attach"] for o in objs}
    root = [i for i, nd in enumerate(g["nodes"]) if attach.get(nd["name"]) == ""]
    g["scenes"] = ([{"nodes": root}] if root else []) + [
        {"nodes": [i], "extensions": {"ASOBO_unique_id": {"id": attach[nd["name"]]}}}
        for i, nd in enumerate(g["nodes"]) if attach.get(nd["name"])]
    g["scene"] = 0
    for nd in g["nodes"]:
        nd.setdefault("extensions", {})["ASOBO_unique_id"] = {"id": nd["name"]}
    for m in g["materials"]:
        m["alphaMode"] = "BLEND"
        m.pop("doubleSided", None)
        m.setdefault("extensions", {})["ASOBO_material_geometry_decal"] = dict(DECAL)
        img = g["textures"][m["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]
        g["images"][img] = {"name": os.path.splitext(pngs[ATLAS_OF[m["name"]]])[0], "uri": pngs[ATLAS_OF[m["name"]]], "mimeType": "image/png"}
    used = set(g.get("extensionsUsed", [])) | {"ASOBO_unique_id", "ASOBO_material_geometry_decal", "ASOBO_normal_map_convention"}
    g["extensionsUsed"] = sorted(used)
    g["asset"]["extensions"] = {"ASOBO_normal_map_convention": {"tangent_space_convention": "DirectX"}}
    # Winding: sources must be counter-clockwise as seen from the normal side.
    # The compiler reverses it to the clockwise order the sim draws; a clockwise
    # source comes out back-facing and the paint is invisible from outside.
    bin_path = os.path.join(os.path.dirname(path), g["buffers"][0]["uri"])
    buf = bytearray(open(bin_path, "rb").read())

    def acc(i):
        a = g["accessors"][i]; v = g["bufferViews"][a["bufferView"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dt = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(bytes(buf[off:off + a["count"] * n * np.dtype(dt).itemsize]), dt).reshape(a["count"], n), off, dt
    flips = 0
    for mesh in g["meshes"]:
        for pr in mesh["primitives"]:
            P = acc(pr["attributes"]["POSITION"])[0]; N = acc(pr["attributes"]["NORMAL"])[0]
            I, off, dt = acc(pr["indices"])
            t = I.reshape(-1, 3)
            fn = np.cross(P[t[:, 1]] - P[t[:, 0]], P[t[:, 2]] - P[t[:, 0]])
            ccw = (np.einsum("ij,ij->i", fn, N[t[:, 0]]) > 0).mean()
            if ccw < 0.5:
                t = t[:, [0, 2, 1]].copy()
                buf[off:off + t.nbytes] = t.astype(dt).tobytes()
                flips += 1
    open(bin_path, "wb").write(buf)
    json.dump(g, open(path, "w"), indent=1)
    return flips


tex_out = os.path.join(out, "texture")
os.makedirs(tex_out, exist_ok=True)
used_atlases = {ATLAS_OF[s.material.name] for objs in decals.values() for o in objs for s in o.material_slots if s.material}
for atlas, name in pngs.items():
    if atlas not in used_atlases:
        continue  # nothing painted on it (e.g. the wings)
    shutil.copyfile(os.path.join(tex_dir, name), os.path.join(tex_out, name))
    # Same bitmap slot as the kit's palette texture: a decal albedo with alpha.
    open(os.path.join(tex_out, name + ".xml"), "w").write(
        "<BitmapConfiguration><BitmapSlot>MTL_BITMAP_DECAL0</BitmapSlot></BitmapConfiguration>")
for part, objs in decals.items():
    if not objs:
        continue
    d = os.path.join(out, "model." + part)
    os.makedirs(d, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    path = os.path.join(d, "LIVERY_LOD00.gltf")
    bpy.ops.export_scene.gltf(use_selection=True, filepath=path, export_format="GLTF_SEPARATE",
        export_yup=True, export_apply=False, export_extras=False, export_tangents=True,
        export_image_format="AUTO", export_animations=False, export_texcoords=True, export_normals=True)
    flips = msfs(path, objs)
    for f in os.listdir(d):
        if f.lower().endswith(".png"):
            os.remove(os.path.join(d, f))
    print("EXPORTED", part, len(objs), "objects", "(winding flipped on %d primitives)" % flips if flips else "")
