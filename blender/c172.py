"""Shared bits for the MSFS 2024 Cessna 172 G1000 (asobo_c172sp_g1000), working
from the community paint kit's imported exterior (paintkits/c172/blender).

Blender axes in that file: nose towards -Y, +Z up, port side +X. The design
frame is the airliners' one: s = metres aft of the cowl front, z = model Z.
"""
import bpy, os, re
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "paintkits", "c172")
BLEND = os.path.join(KIT, "blender", "c172-g1000-imported.blend")
TEX = os.path.join(KIT, "texture-orig", "asobo_c172sp_g1000", "attachments", "asobo")

# Atlas (material name) -> stock albedo, relative to TEX.
ATLASES = {
    "Fuselage_1": "part_exterior/texture/c172_exterior_fuselage_1_albd.png",
    "Fuselage_2": "part_exterior/texture/c172_exterior_fuselage_2_albd.png",
    "Tail": "part_exterior/texture/c172_exterior_tail_albd.png",
    "Wing_Left": "part_exterior_wing_left/texture/c172_exterior_wing_left_albd.png",
    "Wing_Right": "part_exterior_wing_right/texture/c172_exterior_wing_right_albd.png",
}

# The painted skin: stock objects that carry livery decals, by the livery
# model (model.<part>) they attach to. Small bits that reuse atlas patches
# (locks, handles, wires, grille, gear fairing) keep the stock paint.
PARTS = {
    "airframe": ["x0_FUSELAGE_1", "x0_FUSELAGE_2", "x0_HOOD", "x0_Hood_Cap", "x0_Hood_Oil_Cap",
                 "x0_cargo_door", "x0_Pilot_Door_Out_1", "x0_Pilot_Door_HingeUp_Out", "x0_Pilot_Door_HingeDown_Out"],
    "door_copilot": ["x0_Door_CoPilot_Out", "x0_Door_Copilot_HingeUp_Out", "x0_Door_Copilot_HingeDown_Out"],
    "tail": ["x0_TAIL", "x0_RUDDER", "x0_ELEVATOR", "x0_ELEVATOR_TRIM"],
    "wing_left": ["x0_WING_LEFT", "x0_FLAP_LEFT", "x0_AILERON_LEFT"],
    "wing_right": ["x0_WING_RIGHT", "x0_FLAP_RIGHT", "x0_AILERON_RIGHT"],
}
SKIN = [n for names in PARTS.values() for n in names]
# Fixed airframe skin: its decals sit in model.airframe's root scene, in
# aircraft space, where the kit puts its registration panels. Everything else
# hangs off its stock node (as the kit's palette copies do), which also keeps
# tail and wing decals right whatever origin those part models have.
STATIC = {"x0_FUSELAGE_1", "x0_FUSELAGE_2", "x0_HOOD", "x0_Hood_Cap"}
# Horizontal surfaces take the plan-view artwork; the rest the side view.
PLAN = re.compile(r"WING|FLAP|AILERON|ELEVATOR")

# Face classes in the position maps (B channel).
STBD, PORT, TOP, BOTTOM = 0.0, 1.0, 2.0, 3.0


def open_kit():
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data.action = None  # rest pose: doors shut, surfaces neutral
    bpy.context.view_layer.update()


def nose_y():
    o = bpy.data.objects["x0_FUSELAGE_2"]
    me, mw = o.data, o.matrix_world
    return min((mw @ v.co).y for v in me.vertices)


def face_class(o, centre, normal):
    """Side (port/starboard) or plan (top/bottom) for one face."""
    plan = bool(PLAN.search(o.name))
    # The fixed fin and the stabiliser share x0_TAIL: the stabiliser is
    # everything clear of the fin and its root fillet (the fillet takes the
    # side view, so fin art runs onto it without a seam).
    if o.name == "x0_TAIL":
        plan = abs(centre.x) > 0.3 and abs(normal.z) > 0.35
    if plan:
        return TOP if normal.z >= 0 else BOTTOM
    return PORT if centre.x > 0 else STBD


def face_normals(o):
    """World-space face normals from the custom split normals (the import
    keeps MSFS's clockwise winding, so polygon normals point inwards)."""
    me, mw = o.data, o.matrix_world
    cn = np.empty(len(me.loops) * 3, dtype=np.float32)
    me.corner_normals.foreach_get("vector", cn)
    cn = cn.reshape(-1, 3)
    rot = np.array(mw.to_3x3().inverted().transposed())
    out = []
    for p in me.polygons:
        n = cn[p.loop_start:p.loop_start + p.loop_total].mean(0) @ rot.T
        out.append(n / (np.linalg.norm(n) or 1))
    return out
