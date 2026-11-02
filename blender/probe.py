import bpy, sys, collections
argv = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
tex = collections.Counter()
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    for s in o.material_slots:
        m = s.material
        if not m or not m.use_nodes:
            continue
        imgs = sorted({n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image})
        for i in imgs:
            tex[i] += 1
print("OBJECTS", len(bpy.data.objects), "MESHES", sum(o.type == 'MESH' for o in bpy.data.objects))
for k, v in sorted(tex.items()):
    print("TEX", v, k)
