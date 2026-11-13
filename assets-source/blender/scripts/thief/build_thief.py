"""
Sidhel Chor - build the thief character from scratch into an editable .blend.

    blender -b --factory-startup -P assets-source/blender/scripts/thief/build_thief.py -- \
        --out assets-source/blender/characters/thief.blend [--stage model|rig|paint|anim]

Stages run in order and stop after --stage (default: all). The saved .blend is an ordinary
Blender file: one skinned body mesh, a Headband mesh, the `Thief_Rig` armature with 18 keyed
actions, shape keys `LungiTuck` and `Blink`, and two atlas materials (`Thief_Skin`,
`Thief_Cloth`). Export it with ../export_character.py.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import th_model as M  # noqa: E402
import th_paint as P  # noqa: E402
from th_common import src_material, srgb  # noqa: E402

STAGES = ["model", "rig", "anim", "paint"]


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


# Bake-source palette (sRGB hex). The atlas bake turns these + procedural detail into textures.
PALETTE = {
    "skin": ("#9a6142", 0.68),
    "hair": ("#16110e", 0.35),
    "brow": ("#1b1410", 0.7),
    "eye": ("#f1ebdf", 0.25),
    "lid": ("#93593b", 0.68),
    "mouth": ("#4a1714", 0.5),
    "lungi": ("#2b3a78", 0.9),
    "gamcha": ("#c23a2e", 0.9),
    "headband": ("#2f7a3a", 0.9),
    "tabiz": ("#b8892e", 0.45),
}


def mats():
    return {k: src_material(f"src_{k}", srgb(c), r) for k, (c, r) in PALETTE.items()}


def stage_model():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    col = bpy.data.collections.new("Thief_Parts")
    bpy.context.scene.collection.children.link(col)
    m = mats()

    body = M.build_body(col)
    head = M.build_head(col)
    bvh = M.head_bvh(head)
    hair = M.build_hair(col)
    eyes = M.build_eyes(col, bvh)
    brows = M.build_brows(col, bvh)
    must = M.build_moustache(col, bvh)
    mouth, _, _ = M.build_mouth(col, bvh)
    lungi = M.build_lungi(col)
    roll = M.build_lungi_roll(col)
    gamcha = M.build_gamcha(col)
    hair_bvh = M.head_bvh(hair)
    headband = M.build_headband(col, hair_bvh, bvh)
    tabiz = M.build_tabiz(col)
    head_parts = [head, hair, must, mouth, headband] + list(brows.values()) + [o for o, _c, _r in eyes.values()]
    M.scale_head(head_parts)
    eyes = {k: (o, M.head_xform(c), r * M.HEAD_SCALE) for k, (o, c, r) in eyes.items()}
    LM_head = M.head_xform(M.LM["head_c"])

    def put(o, key):
        o.data.materials.clear()
        o.data.materials.append(m[key])

    teeth = src_material("src_teeth", srgb("#eee4cf"), 0.35)
    for o, k in ((body, "skin"), (head, "skin"), (hair, "hair"), (must, "brow"), (mouth, "mouth"), (lungi, "lungi"), (roll, "lungi"),
                 (gamcha, "gamcha"), (headband, "headband"), (tabiz, "tabiz")):
        put(o, k)
    for name, (o, c, _r) in eyes.items():
        if name.startswith("Eye"):
            # Gaze converges slightly (looks at a point ~1.5 m ahead).
            gaze = Vector((0, -1.5, 0)) - Vector((c.x, 0, 0))
            o.data.materials.clear()
            o.data.materials.append(P.eye_material(f"src_eye_{name[-1]}", c, gaze))
        else:
            put(o, "lid")
    for o in brows.values():
        put(o, "brow")
    mouth.data.materials.append(teeth)
    for p in mouth.data.polygons[: 12]:
        p.material_index = 1  # the upper row: a strip of teeth in the grin
    bpy.context.scene["head_center"] = list(LM_head)
    # Remember eye centres for the bake shader and the rig.
    for name, (o, c, r) in eyes.items():
        o["eye_center"] = list(c)
        o["eye_radius"] = r
    print("[thief] model built:", ", ".join(o.name for o in col.objects))


def stage_rig():
    import th_rig as R
    col = bpy.data.collections["Thief_Parts"]
    parts = {o.name: o for o in col.objects}
    mesh, headband, arm = R.build(parts)
    print("[thief] rig built:", arm.name, len(arm.data.bones), "bones")


def stage_anim():
    import th_anim as A
    arm = bpy.data.objects["Thief_Rig"]
    only = arg("--clips")
    A.build_all(arm, only.split(",") if only else None)
    A.finalize(arm)
    print("[thief] clips:", ", ".join(a.name for a in bpy.data.actions))


def stage_paint():
    import th_bake as Bk
    mesh = bpy.data.objects["Thief"]
    hb = bpy.data.objects["Headband"]
    Bk.paint_skin(mesh)
    Bk.setup_sources()
    Bk.unwrap([mesh, hb])
    imgs = Bk.bake([mesh, hb], size=int(arg("--tex", "1024")), samples=int(arg("--samples", "24")))
    tex_dir = os.path.abspath(os.path.join(HERE, "..", "..", "characters", "textures"))
    Bk.final_materials([mesh, hb], imgs, tex_dir)
    bpy.context.scene.render.engine = "BLENDER_EEVEE"
    print("[thief] painted:", [m.name for m in mesh.data.materials], [m.name for m in hb.data.materials])


def main():
    out = arg("--out", os.path.join(HERE, "..", "..", "characters", "thief.blend"))
    last = arg("--stage", STAGES[-1])
    bpy.context.scene.render.fps = 30
    for st in STAGES[: STAGES.index(last) + 1]:
        globals()[f"stage_{st}"]()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))
    print("[thief] saved", os.path.abspath(out))


if __name__ == "__main__":
    main()
