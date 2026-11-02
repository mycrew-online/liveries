"""Turn a painted base texture into a white template: saturated paint (the
house livery) becomes plain white, unsaturated detail (panel lines, doors,
dirt) stays. Alpha is kept.

With a position map dir, flat grey paint (a grey belly or fin) on the
covered texels is whitened too; thin dark details survive the erosion.

blender -b --factory-startup --python blender/whiten.py -- <in dir> <out dir> [size] [posmap dir]
"""
import bpy, glob, os, sys
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
src, dst = args[:2]
size = int(args[2]) if len(args) > 2 and args[2] else 0
pos_dir = args[3] if len(args) > 3 else None
os.makedirs(dst, exist_ok=True)
WHITE = 0.92


def dilate(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def erode(mask, r):
    return ~dilate(~mask, r)


def pixels(img):
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


for path in sorted(glob.glob(os.path.join(src, "*.png"))):
    img = bpy.data.images.load(path)
    if size and tuple(img.size) != (size, size):
        img.scale(size, size)
    w, h = img.size
    px = pixels(img)
    rgb = px[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    lum = rgb.mean(-1)
    # Paint: clearly coloured, or very dark large areas are not expected on a
    # white template, so only saturation decides. Grow it over anti-aliasing.
    paint = dilate(sat > 0.07, max(1, w // 1024))
    pos = os.path.join(pos_dir, os.path.basename(path).lower()) if pos_dir else None
    if pos and os.path.exists(pos):
        pm = bpy.data.images.load(pos)
        if tuple(pm.size) != (w, h):
            pm.scale(w, h)
        r = max(2, w // 512)
        covered = dilate(pixels(pm)[..., 3] > 0.5, r)
        grey = dilate(erode((lum > 0.3) & (lum < 0.86) & covered, r), r + 1)
        # Windows and intakes: dark and tall; a cheatline is thin vertically
        # and erodes away.
        k = max(4, w // 200)
        dark = lum < 0.3
        for dy in range(-k, k + 1):
            dark = dark & np.roll(lum < 0.3, dy, 0)
        dark = dilate(dark, k + 3)
        paint = (paint | grey) & covered & ~dark
    # Match the white of the unpainted skin so repainted areas do not show.
    keep = ~paint & (lum > 0.6) & (px[..., 3] > 0.5)
    rgb[paint] = np.median(rgb[keep], axis=0) if keep.any() else WHITE
    px[..., :3] = rgb
    out = bpy.data.images.new("W", w, h, alpha=True)
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = os.path.join(dst, os.path.basename(path))
    out.file_format = "PNG"
    out.save()
    print("WHITENED", os.path.basename(path), "%.1f%% repainted" % (100 * paint.mean()))
    bpy.data.images.remove(out)
    bpy.data.images.remove(img)
