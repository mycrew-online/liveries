"""Shrink hero shots for email: long side to <size> px, WebP (lossy, keeps
the transparent background).

blender -b --factory-startup --python blender/shrink.py -- <in dir> <out dir> <size> <quality>
"""
import bpy, os, sys

src, dst, size, quality = sys.argv[sys.argv.index("--") + 1:][:4]
size, quality = int(size), int(quality)
s = bpy.context.scene
s.render.image_settings.file_format = "WEBP"
s.render.image_settings.color_mode = "RGBA"
s.render.image_settings.quality = quality
s.view_settings.view_transform = "Standard"
for root, _, files in os.walk(src):
    for f in sorted(files):
        if not f.endswith(".png"):
            continue
        im = bpy.data.images.load(os.path.join(root, f))
        w, h = im.size
        k = size / max(w, h)
        if k < 1:
            im.scale(round(w * k), round(h * k))
        out = os.path.join(dst, os.path.relpath(root, src), f[:-4] + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save_render(out, scene=s)
        bpy.data.images.remove(im)
        print("WROTE", out)
