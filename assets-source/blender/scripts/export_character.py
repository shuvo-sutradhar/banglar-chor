"""
Sidhel Chor - export a character .blend to a runtime GLB that meets docs/BLENDER_CHARACTER_SPEC.md.

    blender -b assets-source/blender/characters/thief.blend \
        -P assets-source/blender/scripts/export_character.py -- \
        --out public/assets/models/characters/thief.glb

UNVERIFIED: written without access to Blender (it was not installed and downloading it was blocked
in the session that produced this file). It uses only long-standing bpy APIs (Blender 3.6+ glTF
exporter options). Run it once, then `npm run validate:glb -- <out>` to check the result.
"""
import json
import sys

import bpy

REQUIRED_BONES = [
    "root", "hips", "spine", "chest", "neck", "head",
    "shoulder_L", "upperarm_L", "forearm_L", "hand_L",
    "shoulder_R", "upperarm_R", "forearm_R", "hand_R",
    "thigh_L", "shin_L", "foot_L", "thigh_R", "shin_R", "foot_R",
]
REQUIRED_CLIPS = ["Idle", "Walk", "Run"]
KNOWN_CLIPS = REQUIRED_CLIPS + [
    "CrouchIdle", "CrouchWalk", "Sneak", "Interact", "Pickup", "Carry",
    "PreparationOil", "PreparationLungi", "PreparationGamcha", "Suspicious",
    "Frightened", "ChaseReaction", "Caught", "Celebrate", "Crawl",
]
DEFAULT_SPEEDS = {"Walk": 1.5, "Run": 4.2, "CrouchWalk": 0.9, "Sneak": 1.1, "Carry": 1.5, "Crawl": 0.6}


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


def fail(msg):
    print("EXPORT FAILED:", msg)
    sys.exit(1)


def main():
    out = arg("--out")
    if not out:
        fail("--out <path.glb> is required")

    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if len(armatures) != 1:
        fail(f"expected exactly one armature, found {len(armatures)}")
    arm = armatures[0]

    missing = [b for b in REQUIRED_BONES if b not in arm.data.bones]
    if missing:
        fail("missing bones: " + ", ".join(missing))

    actions = {a.name: a for a in bpy.data.actions}
    missing_clips = [c for c in REQUIRED_CLIPS if c not in actions]
    if missing_clips:
        fail("missing clips: " + ", ".join(missing_clips))
    unknown = [n for n in actions if n not in KNOWN_CLIPS]
    if unknown:
        print("warning: actions not in the spec (exported anyway):", ", ".join(unknown))

    # Every action becomes its own glTF animation: stash each on a muted NLA track.
    arm.animation_data_create()
    for track in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(track)
    for name, action in actions.items():
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, int(action.frame_range[0]), action)
        track.mute = True
    arm.animation_data.action = None

    # Spec metadata -> glTF extras on the armature node.
    speeds = dict(DEFAULT_SPEEDS)
    if "sidhel" in arm:
        try:
            speeds.update(json.loads(arm["sidhel"]).get("clipSpeeds", {}))
        except (TypeError, ValueError):
            pass
    arm["sidhel"] = json.dumps({"version": 1, "clipSpeeds": speeds})

    # Apply object transforms on meshes so scale is exactly 1 m = 1 unit.
    for o in bpy.data.objects:
        o.select_set(o.type in {"MESH", "ARMATURE"} and not o.hide_get())
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_skins=True,
        export_morph=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )
    print("exported", out)


main()
