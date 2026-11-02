"""Render preview views of an aircraft with a livery.

blender -b --factory-startup --python blender/preview.py -- <parts dir> <out dir> <tex dir> [<tex dir> ...]
Texture dirs are searched in order, so pass the livery output first and the
paint kit templates last.
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
size = hi - lo
print("BOUNDS", tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi))

# The long axis is the fuselage; the camera sits off the other horizontal axis.
long_axis = 1  # fuselage runs along Y after glTF import; span ~ length on an A319
side = 1 - long_axis
scene.setup_render()

def at(along, across, up):
    v = [0, 0, 0]
    v[long_axis] = c[long_axis] + along
    v[side] = c[side] + across
    v[2] = c[2] + up
    return v

L = size[long_axis]
views = {
    "side_right": scene.camera("side_right", at(0, L * 2, 0), c, ortho=L * 1.08),
    "side_left": scene.camera("side_left", at(0, -L * 2, 0), c, ortho=L * 1.08),
    "front34": scene.camera("front34", at(L * 0.75, L * 0.55, L * 0.12), c, lens=45),
    "rear34": scene.camera("rear34", at(-L * 0.75, -L * 0.55, L * 0.18), c, lens=45),
}
only = os.environ.get("VIEWS")
for name, cam in views.items():
    if only and name not in only.split(","):
        continue
    scene.render(cam, os.path.join(out, name + ".png"))
