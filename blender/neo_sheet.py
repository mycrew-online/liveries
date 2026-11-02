"""FBW / Asobo A320neo livery decal sheet, sharklet pass.

The sheet is first composited like the fuselage (doors, rudder, fuselage
decals take the projected paint; the rest goes transparent). The sharklets
are on the wing decal meshes, which are flex-skinned and can't be projected
onto, so here the texels those meshes cover (mask = their position map's
alpha) that the house livery coloured get the brand colour, shaded by the
original brightness.

blender -b --factory-startup --python blender/neo_sheet.py -- <base sheet> <wing mask> <sheet in/out> <#rrggbb>
Passing "-" as the mask and sheet writes a fully transparent sheet to <#rrggbb>'s place:
blender ... -- <base sheet> - <out> blank
"""
import bpy, sys
import numpy as np

base_path, mask_path, sheet_path, colour = sys.argv[sys.argv.index("--") + 1:]


def load(path, cs="sRGB", size=None):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = cs
    if size and tuple(img.size) != size:
        img.scale(*size)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(-1, 4), (w, h)


def save(px, size, path):
    o = bpy.data.images.new("SHEET", size[0], size[1], alpha=True)
    o.pixels.foreach_set(px.ravel())
    o.filepath_raw = path
    o.file_format = "PNG"
    o.save()


if colour == "blank":
    base, size = load(base_path)
    save(np.zeros_like(base), size, sheet_path)
    print("SHEET blank")
    sys.exit(0)

sheet, size = load(sheet_path)
base, _ = load(base_path, size=size)
mask, _ = load(mask_path, "Non-Color", size=size)
rgb = np.array([int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
c = base[:, :3]
mx, mn = c.max(1), c.min(1)
sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
paint = (mask[:, 3] > 0.5) & (sat > 0.07) & (base[:, 3] > 0.05)
if paint.any():
    lum = c @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    shade = np.clip(lum / max(np.percentile(lum[paint], 95), 1e-3), 0.55, 1.0)
    sheet[paint, :3] = rgb * shade[paint, None]
    sheet[paint, 3] = base[paint, 3]
save(sheet, size, sheet_path)
print("SHEET", "%d sharklet texels" % paint.sum())
