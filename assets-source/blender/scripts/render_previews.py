"""
Sidhel Chor - render review images of a character .blend (EEVEE, headless).

    blender -b assets-source/blender/characters/thief.blend -P assets-source/blender/scripts/render_previews.py -- \
        --out docs/screenshots/phase4a [--shots front,back,side,threequarter,face,walk,run,crouch] [--res 720]

Each shot = (view, action, frame-fraction, tuck). Adds its own lights/camera/ground and does not
save the file.
"""
import math
import os
import sys

import bpy
from mathutils import Vector


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


# name: (yaw deg (0 = front), pitch deg, distance, focus z, action, frame fraction, tuck, headband)
SHOTS = {
    "front": (0, 4, 3.3, 0.86, "Idle", 0.0, 0, False),
    "back": (180, 6, 3.3, 0.86, "Idle", 0.0, 0, False),
    "side": (90, 4, 3.3, 0.86, "Idle", 0.0, 0, False),
    "threequarter": (35, 8, 3.3, 0.86, "Idle", 0.0, 0, False),
    "face": (22, 4, 0.95, 1.47, "Idle", 0.0, 0, False),
    "face_front": (0, 2, 0.85, 1.47, "Idle", 0.0, 0, False),
    "tucked": (35, 8, 3.3, 0.86, "Idle", 0.0, 1, True),
    "walk": (90, 4, 3.3, 0.86, "Walk", 0.0, 0, False),
    "walk_passing": (90, 4, 3.3, 0.86, "Walk", 0.25, 0, False),
    "walk_3q": (40, 6, 3.3, 0.86, "Walk", 0.12, 0, False),
    "run": (70, 5, 3.4, 0.86, "Run", 0.12, 1, True),
    "run_side": (90, 3, 3.4, 0.86, "Run", 0.4, 0, False),
    "crouch": (40, 10, 3.0, 0.6, "CrouchIdle", 0.0, 0, False),
    "crouchwalk": (60, 8, 3.0, 0.6, "CrouchWalk", 0.2, 1, True),
    "sneak": (60, 6, 3.2, 0.8, "Sneak", 0.25, 1, True),
    "carry": (60, 6, 3.2, 0.8, "Carry", 0.25, 1, True),
    "crawl": (70, 10, 3.0, 0.4, "Crawl", 0.25, 1, True),
    "pickup": (50, 6, 3.0, 0.7, "Pickup", 0.5, 1, True),
    "interact": (50, 8, 3.0, 0.6, "Interact", 0.3, 1, True),
    "oil": (30, 5, 3.0, 0.86, "PreparationOil", 0.3, 0, False),
    "lungi": (30, 5, 3.0, 0.86, "PreparationLungi", 0.5, 0.5, False),
    "gamcha": (30, 5, 3.0, 0.86, "PreparationGamcha", 0.5, 1, True),
    "suspicious": (30, 5, 3.0, 0.86, "Suspicious", 0.3, 1, True),
    "frightened": (30, 5, 3.0, 0.9, "Frightened", 0.35, 1, True),
    "chase": (40, 5, 3.0, 0.86, "ChaseReaction", 0.6, 1, True),
    "caught": (25, 5, 3.0, 0.9, "Caught", 0.3, 1, True),
    "celebrate": (25, 5, 3.0, 0.9, "Celebrate", 0.9, 1, True),
}


def setup(res):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = res
    sc.render.resolution_y = int(res * 1.125)
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    try:
        sc.eevee.taa_render_samples = 32
        sc.eevee.use_shadows = True
    except AttributeError:
        pass
    w = sc.world or bpy.data.worlds.new("W")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.05, 0.065, 0.1, 1)
    bg.inputs[1].default_value = 1.0

    def light(name, kind, energy, color, rot, size=0.3):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if hasattr(ld, "angle"):
            ld.angle = math.radians(size * 20)
        ob = bpy.data.objects.new(name, ld)
        ob.rotation_euler = [math.radians(a) for a in rot]
        sc.collection.objects.link(ob)
        return ob

    light("Key", "SUN", 3.2, (1.0, 0.93, 0.84), (50, 0, -35))
    light("Fill", "SUN", 0.9, (0.7, 0.8, 1.0), (60, 0, 60))
    light("Rim", "SUN", 2.2, (0.75, 0.85, 1.0), (115, 0, 160))
    bpy.ops.mesh.primitive_plane_add(size=8)
    g = bpy.context.object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.12, 0.085, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
    g.data.materials.append(gm)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 50
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def pose(action_name, frac, tuck, headband):
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    sc = bpy.context.scene
    if arm is not None:
        act = bpy.data.actions.get(action_name)
        arm.animation_data_create()
        if arm.animation_data.nla_tracks:
            for t in arm.animation_data.nla_tracks:
                t.mute = True
        arm.animation_data.action = act
        if act is not None:
            try:
                arm.animation_data.action_slot = act.slots[0]
            except (AttributeError, IndexError):
                pass
            a, b = act.frame_range
            sc.frame_set(int(round(a + (b - a) * frac)))
        else:
            for pb in arm.pose.bones:
                pb.location = (0, 0, 0)
                pb.rotation_quaternion = (1, 0, 0, 0)
                pb.rotation_euler = (0, 0, 0)
            sc.frame_set(1)
    for o in bpy.data.objects:
        if o.type == "MESH" and o.data.shape_keys:
            kb = o.data.shape_keys.key_blocks.get("LungiTuck")
            if kb:
                kb.value = tuck
        if o.name == "Headband":
            o.hide_render = not headband


def aim(cam, yaw, pitch, dist, fz):
    y, p = math.radians(yaw), math.radians(pitch)
    # yaw 0 = in front of the character (he faces -Y).
    cam.location = Vector((math.sin(y) * math.cos(p) * dist, -math.cos(y) * math.cos(p) * dist, fz + math.sin(p) * dist))
    d = Vector((0, 0, fz)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def main():
    out = os.path.abspath(arg("--out", "previews"))
    os.makedirs(out, exist_ok=True)
    res = int(arg("--res", "640"))
    names = arg("--shots", "front,back,side,threequarter,face").split(",")
    prefix = arg("--prefix", "")
    cam = setup(res)
    for n in names:
        yaw, pitch, dist, fz, act, frac, tuck, hb = SHOTS[n]
        pose(act, frac, tuck, hb)
        aim(cam, yaw, pitch, dist, fz)
        bpy.context.scene.render.filepath = os.path.join(out, f"{prefix}{n}.png")
        bpy.ops.render.render(write_still=True)
        print("[render]", n)


main()
