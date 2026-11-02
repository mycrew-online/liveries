"""Trace the white mark and the opaque outline of a logo PNG into SVG path data
(run-length rows; smooth them with a blur+threshold filter when drawing).

blender -b --factory-startup --python blender/trace.py -- <in.png> <out.json>
"""
import bpy, json, sys
import numpy as np

src, out = sys.argv[sys.argv.index("--") + 1:]
img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # top row first
white = (px[..., 0] > 0.8) & (px[..., 1] > 0.8) & (px[..., 2] > 0.8) & (px[..., 3] > 0.5)
solid = px[..., 3] > 0.5

def runs(mask):
    d = []
    for y in range(h):
        row = mask[y]
        x = 0
        while x < w:
            if row[x]:
                x0 = x
                while x < w and row[x]:
                    x += 1
                d.append(f"M{x0} {y}h{x - x0}v1h{x0 - x}z")
            else:
                x += 1
    return "".join(d)

ys, xs = np.nonzero(solid)
# Colours at the gradient ends, sampled just inside the outline.
def col(y, x):
    r, g, b, _ = px[y, x]
    return "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in (r, g, b))
json.dump({
    "size": [w, h],
    "mark": runs(white),
    "bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
    "top_right": col(int(h * 0.27), int(w * 0.86)),
    "bottom_left": col(int(h * 0.73), int(w * 0.14)),
}, open(out, "w"))
print("OK", w, h, xs.min(), ys.min(), xs.max(), ys.max())
