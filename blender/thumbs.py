"""Render the livery thumbnails MSFS shows in the aircraft selector.

blender -b --factory-startup --python blender/thumbs.py -- <parts dir> <out dir> <tex dir> [<tex dir> ...]

Writes thumbnail.png (720x344, opaque), thumbnail_button.png (830x260,
transparent) and thumbnail_side.png (930x340, transparent): the sizes of
Fenix's own ThumbnailPreset.xml.
"""
import bpy, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import scene

parts, out, *texdirs = sys.argv[sys.argv.index("--") + 1:]
os.makedirs(out, exist_ok=True)
objs = scene.load_parts(parts)
scene.apply_textures(objs, *texdirs)
lo, hi = scene.bounds(objs)
c = (lo + hi) / 2
L = hi.y - lo.y
scene.setup_render()
s = bpy.context.scene
s.eevee.taa_render_samples = 64 if hasattr(s, "eevee") else 0


def shot(name, res, cam, transparent):
    s.render.resolution_x, s.render.resolution_y = res
    s.render.film_transparent = transparent
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    scene.render(cam, os.path.join(out, name))


# Nose points to -Y; +X is the port side.
front = scene.camera("front", (L * 0.95, c.y - L * 1.05, c.z + L * 0.16), (c.x, c.y + L * 0.04, c.z - 0.6), lens=40)
button = scene.camera("button", (L * 0.62, c.y - L * 1.15, c.z + L * 0.05), (c.x, c.y + L * 0.04, c.z - 0.9), lens=36)
side = scene.camera("side", (L * 2, c.y, c.z + 0.4), (0, c.y, c.z + 0.4), ortho=L * 1.06)
shot("thumbnail.png", (720, 344), front, False)
shot("thumbnail_button.png", (830, 260), button, True)
shot("thumbnail_side.png", (930, 340), side, True)
