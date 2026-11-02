"""C172 livery textures from position maps (blender/c172_posmap.py) and the
artwork (scripts/render-art.mjs): one decal texture per exterior atlas.

Each covered texel looks up the artwork at its (s, z) in the side view (port
or starboard image by face class) or at its (s, span) in the plan view. The
decal texture is the art colour with the art's alpha: transparent wherever
the stock white paint should show. The sim draws it over the stock skin,
which keeps its own normal map and occlusion (the decal material's blend
factors leave those alone), so no stock shading is baked in here.

Also writes <out>/preview/<atlas>.png: the stock albedo with the decal laid
over it, for local previews only (never shipped).

blender -b -t 4 --factory-startup --python blender/c172_composite.py -- <posmap dir> <ref.json> <art dir> <out dir> [prefix]
"""
import bpy, json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import c172

args = sys.argv[sys.argv.index("--") + 1:]
pos_dir, ref_path, art_dir, out_dir = args[:4]
prefix = args[4] if len(args) > 4 else "MYCREW_C172"
frames = json.load(open(ref_path))["frames"]
os.makedirs(os.path.join(out_dir, "preview"), exist_ok=True)


def load(path, colorspace="sRGB"):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def art(name):
    p = os.path.join(art_dir, name + ".png")
    return load(p) if os.path.exists(p) else None


def sample(img, u, v):
    """Bilinear lookup of img (h, w, 4) at frame coords u, v in [0, 1]."""
    h, w = img.shape[:2]
    x = np.clip(u * (w - 1), 0, w - 1.001)
    y = np.clip(v * (h - 1), 0, h - 1.001)
    x0 = x.astype(np.int32); y0 = y.astype(np.int32)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    out = a * (1 - fy) + b * fy
    out[~((u >= 0) & (u <= 1) & (v >= 0) & (v <= 1))] = 0
    return out


def save(px, path):
    h, w = px.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


layers = {c172.PORT: (art("body_port"), frames["body"]), c172.STBD: (art("body_stbd"), frames["body"]),
          c172.TOP: (art("plan_port"), frames["plan"]), c172.BOTTOM: (art("plan_port"), frames["plan"])}

for atlas, rel in c172.ATLASES.items():
    pos = np.load(os.path.join(pos_dir, atlas + ".npy"))
    size = pos.shape[0]
    flat = pos.reshape(-1, 4)
    dec = np.zeros((size * size, 4), dtype=np.float32)
    for cls, (img, F) in layers.items():
        if img is None:
            continue
        idx = np.flatnonzero((flat[:, 3] > 0) & (flat[:, 2] == cls))
        u = (flat[idx, 0] - F["S0"]) / F["W"]
        v = (flat[idx, 1] - F["Z0"]) / F["H"]
        dec[idx] = sample(img, u, v)
    dec = dec.reshape(size, size, 4)  # straight alpha, as Edge renders it
    painted = dec[..., 3] > 0.002
    print("TEX", atlas, "%.1f%% painted" % (100 * painted.mean()))
    save(dec, os.path.join(out_dir, "%s_%s_ALBD.png" % (prefix, atlas.upper())))
    # Preview albedo: stock with the decal laid over (colours in sRGB, as the
    # PNGs store them; close enough for a look).
    stock = load(os.path.join(c172.TEX, rel))
    if stock.shape[0] != size:
        raise SystemExit("stock %s is %d px, posmap %d" % (atlas, stock.shape[0], size))
    a = dec[..., 3:4]
    prev = stock.copy()
    prev[..., :3] = stock[..., :3] * (1 - a) + dec[..., :3] * a
    prev[..., 3] = 1
    save(prev, os.path.join(out_dir, "preview", atlas + ".png"))
print("DONE")
