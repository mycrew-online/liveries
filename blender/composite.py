"""Composite a livery from position maps (blender/posmap.py) and side-view
artwork (scripts/render-art.mjs): no baking, plain image maths.

For every covered texel: look up the artwork at its (s, z), port or
starboard image by side, and paint it over the template keeping the
template's shading:  result = mix(base, art * base / white, art.alpha).
Texels no mesh covers keep the template.

blender -b --factory-startup --python blender/composite.py -- <posmap dir> <template dir> <art dir> <out dir> [white]
"""
import bpy, glob, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import scene

args = sys.argv[sys.argv.index("--") + 1:]
pos_dir, tpl_dir, art_dir, out_dir = args[:4]
white = float(args[4]) if len(args) > 4 else 0.92
min_size = int(args[5]) if len(args) > 5 else 0  # upscale small templates
os.makedirs(out_dir, exist_ok=True)
templates = scene.texture_from(tpl_dir)

# Artwork layer per texture: engines and sharklets overlap the fuselage in
# side view, so they have their own artwork in the same frame.
LAYERS = [("cowling", "engine"), ("engines", "engine"), ("sharklets", "sharklet"), ("", "body")]


def load(path, colorspace):
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = colorspace
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def sample(art, u, v):
    """Bilinear lookup of art (h, w, 4) at frame coords u, v in [0, 1]."""
    h, w = art.shape[:2]
    x = np.clip(u * (w - 1), 0, w - 1.001)
    y = np.clip(v * (h - 1), 0, h - 1.001)
    x0 = x.astype(np.int32); y0 = y.astype(np.int32)
    fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    a = art[y0, x0] * (1 - fx) + art[y0, x0 + 1] * fx
    b = art[y0 + 1, x0] * (1 - fx) + art[y0 + 1, x0 + 1] * fx
    out = a * (1 - fy) + b * fy
    inside = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    out[~inside] = 0
    return out


art_cache = {}


def art(layer, side):
    k = (layer, side)
    if k not in art_cache:
        p = os.path.join(art_dir, "%s_%s.png" % (layer, side))
        art_cache[k] = load(p, "sRGB") if os.path.exists(p) else None
    return art_cache[k]


for pos_path in sorted(glob.glob(os.path.join(pos_dir, "*.png"))):
    key = scene.norm(pos_path)
    layer = next(l for m, l in LAYERS if m in key)
    port, stbd = art(layer, "port"), art(layer, "stbd")
    tpl = templates(key)
    if port is None or tpl is None:
        print("SKIP", key, "no artwork" if port is None else "no template")
        continue
    # Position maps may be baked smaller than the template; positions are
    # smooth across each UV island, so scaling them up is exact enough.
    tpl_img = bpy.data.images.load(tpl.filepath)
    if tpl_img.size[0] < min_size:
        tpl_img.scale(min_size, min_size)
    w, h = tpl_img.size
    pimg = bpy.data.images.load(pos_path)
    pimg.colorspace_settings.name = "Non-Color"
    if tuple(pimg.size) != (w, h):
        pimg.scale(w, h)
    pos = np.empty(w * h * 4, dtype=np.float32)
    pimg.pixels.foreach_get(pos)
    bpy.data.images.remove(pimg)
    pos = pos.reshape(h, w, 4)
    base = np.empty(w * h * 4, dtype=np.float32)
    tpl_img.pixels.foreach_get(base)
    bpy.data.images.remove(tpl_img)
    base = base.reshape(h, w, 4)

    flat_pos = pos.reshape(-1, 4)
    idx = np.flatnonzero(flat_pos[:, 3] > 0.5)
    # B: 1 port / 0 starboard; on shared atlases engine texels are tagged
    # 0.375 port / 0.625 starboard and take the engine artwork.
    u, v, b = flat_pos[idx, 0], flat_pos[idx, 1], flat_pos[idx, 2]
    eng = (b > 0.25) & (b < 0.75)
    side = np.where(eng, b < 0.5, b > 0.5)
    a = np.where(side[:, None], sample(port, u, v), sample(stbd, u, v))
    e_port, e_stbd = art("engine", "port"), art("engine", "stbd")
    if eng.any() and e_port is not None:
        ae = np.where(side[eng][:, None], sample(e_port, u[eng], v[eng]), sample(e_stbd, u[eng], v[eng]))
        a[eng] = ae
    flat_base = base.reshape(-1, 4)
    b_lin = to_linear(flat_base[idx, :3])
    paint = to_linear(a[:, :3]) * b_lin / white
    alpha = a[:, 3:4]
    flat_base[idx, :3] = to_srgb(b_lin * (1 - alpha) + paint * alpha)
    if "livery_albd" in key:
        # A decal sheet (FBW / Asobo neo): show only what the artwork paints,
        # so the house decals of the base livery disappear.
        flat_base[:, 3] = 0.0
        flat_base[idx, 3] = alpha[:, 0]
    else:
        flat_base[:, 3] = 1.0

    out = bpy.data.images.new("OUT_" + key, w, h, alpha="livery_albd" in key)
    out.pixels.foreach_set(flat_base.ravel())
    out.filepath_raw = os.path.join(out_dir, key + ".png")
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    print("SAVED", key, "%d texels painted" % len(idx))
