"""Sidhel Chor thief - armature, skin weights, shape keys, join.

Skeleton = docs/BLENDER_CHARACTER_SPEC.md §4 plus face/hand/toe bones (32 deform bones):
root > hips > spine > chest > neck > head > (jaw, brow_L, brow_R)
chest > shoulder_* > upperarm_* > forearm_* > hand_* > (fingers_*, thumb_*), chest > gamcha_tail
hips > thigh_* > shin_* > foot_* > toe_*, hips > lungi_front, lungi_back

Animation-only control bones (ik_foot_*, pole_knee_*, ik_hand_*, pole_elbow_*) exist while the
clips are authored and are deleted after baking (th_anim.finalize).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import th_model as M
from th_common import clamp, gauss, smoothstep

FWD = Vector((0, -1, 0))  # character forward in Blender


def _hx(p):
    return M.head_xform(Vector(p))


def bone_table():
    L = M.LM
    t = {
        "root": (Vector((0, 0, 0)), Vector((0, -0.25, 0)), None),
        "hips": (Vector((0, 0.004, 0.875)), Vector((0, 0.004, 0.99)), "root"),
        "spine": (Vector((0, 0.004, 0.99)), Vector((0, 0.008, 1.13)), "hips"),
        "chest": (Vector((0, 0.008, 1.13)), Vector((0, 0.02, 1.305)), "spine"),
        "neck": (Vector((0, 0.02, 1.305)), _hx((0, 0.016, 1.425)), "chest"),
        "head": (_hx((0, 0.016, 1.425)), _hx((0, 0.01, 1.64)), "neck"),
        "jaw": (_hx((0, 0.035, 1.452)), _hx((0, -0.085, 1.372)), "head"),
        "gamcha_tail": (Vector((0.125, 0.07, 1.31)), Vector((0.122, 0.12, 1.04)), "chest"),
        "lungi_front": (Vector((0, -0.12, 0.86)), Vector((0, -0.165, 0.32)), "hips"),
        "lungi_back": (Vector((0, 0.13, 0.86)), Vector((0, 0.17, 0.32)), "hips"),
    }
    for s in "LR":
        k = 1 if s == "L" else -1
        t[f"brow_{s}"] = (_hx((0.052 * k, -0.105, 1.556)), _hx((0.052 * k, -0.135, 1.556)), "head")
        t[f"shoulder_{s}"] = (Vector((0.028 * k, 0.018, 1.29)), L[f"shoulder_{s}"], "chest")
        t[f"upperarm_{s}"] = (L[f"shoulder_{s}"], L[f"elbow_{s}"], f"shoulder_{s}")
        t[f"forearm_{s}"] = (L[f"elbow_{s}"], L[f"wrist_{s}"], f"upperarm_{s}")
        t[f"hand_{s}"] = (L[f"wrist_{s}"], L[f"knuckle_{s}"], f"forearm_{s}")
        t[f"fingers_{s}"] = (L[f"knuckle_{s}"], L[f"fingertip_{s}"], f"hand_{s}")
        _, _, wr, d = M._arm(s)
        inward = Vector((-k * M.SQ, 0, -M.SQ))
        tb = wr + d * 0.028 + Vector((0, -0.024, 0)) + inward * 0.012
        tt = wr + d * 0.085 + Vector((0, -0.066, 0)) + inward * 0.03
        t[f"thumb_{s}"] = (tb, tt, f"hand_{s}")
        t[f"thigh_{s}"] = (L[f"hip_{s}"], L[f"knee_{s}"], "hips")
        t[f"shin_{s}"] = (L[f"knee_{s}"], L[f"ankle_{s}"], f"thigh_{s}")
        t[f"foot_{s}"] = (L[f"ankle_{s}"], L[f"ball_{s}"], f"shin_{s}")
        t[f"toe_{s}"] = (L[f"ball_{s}"], L[f"toe_{s}"], f"foot_{s}")
    return t


CONTROLS = ["ik_foot_L", "ik_foot_R", "pole_knee_L", "pole_knee_R", "ik_hand_L", "ik_hand_R", "pole_elbow_L", "pole_elbow_R"]


def build_armature():
    arm_data = bpy.data.armatures.new("Thief_Rig")
    arm = bpy.data.objects.new("Thief_Rig", arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    table = bone_table()
    for name, (h, tl, _p) in table.items():
        b = eb.new(name)
        b.head, b.tail = h, tl
    for name, (_h, _t, p) in table.items():
        b = eb[name]
        if p:
            b.parent = eb[p]
            b.use_connect = False
        # Consistent rolls: Z axis toward the character's front (up for horizontal bones).
        d = (b.tail - b.head).normalized()
        b.align_roll(Vector((0, 0, 1)) if abs(d.y) > 0.8 else FWD)
    # Control bones for authoring (deleted after baking).
    for s in "LR":
        k = 1 if s == "L" else -1
        a, bl = M.LM[f"ankle_{s}"], M.LM[f"ball_{s}"]
        c = eb.new(f"ik_foot_{s}")
        c.head, c.tail = a, bl
        c.align_roll(Vector((0, 0, 1)))
        c.roll = eb[f"foot_{s}"].roll
        p = eb.new(f"pole_knee_{s}")
        p.head = M.LM[f"knee_{s}"] + Vector((0, -0.6, 0))
        p.tail = p.head + Vector((0, -0.08, 0))
        w = M.LM[f"wrist_{s}"]
        h = eb.new(f"ik_hand_{s}")
        h.head, h.tail = w, M.LM[f"knuckle_{s}"]
        h.roll = eb[f"hand_{s}"].roll
        pe = eb.new(f"pole_elbow_{s}")
        pe.head = M.LM[f"elbow_{s}"] + Vector((0.0, 0.5, 0.0))
        pe.tail = pe.head + Vector((0, 0.08, 0))
    bpy.ops.object.mode_set(mode="OBJECT")
    for b in arm_data.bones:
        b.use_deform = b.name not in CONTROLS and b.name != "root"
    arm.show_in_front = True
    arm_data.display_type = "STICK"
    return arm


def add_ik(arm):
    """IK legs (always on while authoring) and IK arms (influence set per clip)."""
    pb = arm.pose.bones
    for s in "LR":
        c = pb[f"shin_{s}"].constraints.new("IK")
        c.name = "IK"
        c.target, c.subtarget = arm, f"ik_foot_{s}"
        c.pole_target, c.pole_subtarget = arm, f"pole_knee_{s}"
        c.chain_count = 2
        c.pole_angle = math.radians(-90)
        r = pb[f"foot_{s}"].constraints.new("COPY_ROTATION")
        r.name = "FootRot"
        r.target, r.subtarget = arm, f"ik_foot_{s}"
        c2 = pb[f"forearm_{s}"].constraints.new("IK")
        c2.name = "IK"
        c2.target, c2.subtarget = arm, f"ik_hand_{s}"
        c2.pole_target, c2.pole_subtarget = arm, f"pole_elbow_{s}"
        c2.chain_count = 2
        c2.pole_angle = math.radians(-90)
        c2.influence = 0.0
        r2 = pb[f"hand_{s}"].constraints.new("COPY_ROTATION")
        r2.name = "HandRot"
        r2.target, r2.subtarget = arm, f"ik_hand_{s}"
        r2.influence = 0.0
    for b in pb:
        b.rotation_mode = "QUATERNION"


def calibrate_poles(arm):
    """Pick the pole angle that leaves each chain exactly at rest (no knee/elbow twist)."""
    for chain, tip in (("shin", "foot"), ("forearm", "hand")):
        for s in "LR":
            con = arm.pose.bones[f"{chain}_{s}"].constraints["IK"]
            old_inf = con.influence
            con.influence = 1.0
            best = None
            for deg in range(-180, 180, 5):
                con.pole_angle = math.radians(deg)
                bpy.context.view_layer.update()
                pb = arm.pose.bones[f"{chain}_{s}"]
                par = pb.parent
                err = sum((pb.matrix.col[i].to_3d() - pb.bone.matrix_local.col[i].to_3d()).length for i in range(3))
                err += sum((par.matrix.col[i].to_3d() - par.bone.matrix_local.col[i].to_3d()).length for i in range(3))
                if best is None or err < best[0]:
                    best = (err, deg)
            con.pole_angle = math.radians(best[1])
            con.influence = old_inf
            print(f"[rig] {chain}_{s} pole angle {best[1]} (rest error {best[0]:.4f})")


# ------------------------------------------------------------------ weights
def vgroups(obj, names):
    for n in names:
        if n not in obj.vertex_groups:
            obj.vertex_groups.new(name=n)
    return {n: obj.vertex_groups[n] for n in names}


def assign(obj, weights_fn):
    """weights_fn(co) -> {bone: w}. Normalised here."""
    groups = {}
    for v in obj.data.vertices:
        w = {k: x for k, x in weights_fn(v.co).items() if x > 1e-4}
        tot = sum(w.values()) or 1.0
        for k, x in w.items():
            if k not in groups:
                groups[k] = obj.vertex_groups.get(k) or obj.vertex_groups.new(name=k)
            groups[k].add([v.index], x / tot, "REPLACE")


def auto_weights(body, arm, bones):
    """Heat-map weights for the body against the body bones only."""
    keep = {b.name: b.use_deform for b in arm.data.bones}
    for b in arm.data.bones:
        b.use_deform = b.name in bones
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for b in arm.data.bones:
        b.use_deform = keep[b.name]
    body.parent = None
    body.modifiers.clear()
    missing = [v.index for v in body.data.vertices if not v.groups]
    print(f"[rig] body auto-weights: {len(body.data.vertices)} verts, {len(missing)} unweighted")
    return missing


def head_local(co):
    """Undo the head scale and return unit-sphere-ish coords (u, v, w) of the original head."""
    p = M.HEAD_PIVOT + (Vector(co) - Vector((0, 0, M.HEAD_DROP)) - M.HEAD_PIVOT) / M.HEAD_SCALE
    q = p - M.LM["head_c"]
    return q.x / M.HEAD_R.x, q.y / M.HEAD_R.y, q.z / M.HEAD_R.z


def head_weights(co):
    u, v, w = head_local(co)
    jaw = smoothstep(-0.4, -0.64, w) * smoothstep(0.45, -0.15, v)
    return {"head": 1 - jaw, "jaw": jaw}


def lungi_weights(co):
    """Hips at the waist, thighs below (by proximity to each thigh axis), so the cloth travels with
    a lifted knee instead of letting it poke through; centre panels split 50/50 between the legs."""
    x, y, z = co
    t = clamp((M.LUNGI_TOP - z) / (M.LUNGI_TOP - M.LUNGI_HEM))
    pL = gauss(math.hypot(x - 0.092, y * 0.8), 0.11)
    pR = gauss(math.hypot(x + 0.092, y * 0.8), 0.11)
    sL = pL / (pL + pR)
    legness = 0.95 * smoothstep(0.03, 0.38, t)
    shin = 0.45 * smoothstep(0.5, 0.25, z)  # below the knee part of each leg's share rides the shin
    w = {"hips": 1 - legness, "thigh_L": legness * sL * (1 - shin), "thigh_R": legness * (1 - sL) * (1 - shin),
         "shin_L": legness * sL * shin, "shin_R": legness * (1 - sL) * shin}
    front = smoothstep(0.0, -0.1, y) * smoothstep(0.3, 1.0, t) * 0.3
    back = smoothstep(0.0, 0.1, y) * smoothstep(0.3, 1.0, t) * 0.3
    for k in list(w):
        w[k] *= 1 - front - back
    w["lungi_front"] = front
    w["lungi_back"] = back
    return w


def gamcha_weights(co):
    x, y, z = co
    tail = smoothstep(1.3, 1.12, z) * smoothstep(0.04, 0.09, y) * smoothstep(0.06, 0.1, x)
    neck = smoothstep(1.27, 1.34, z) * (1 - tail) * 0.5
    sh = smoothstep(0.07, 0.13, x) * smoothstep(1.26, 1.32, z) * (1 - tail) * 0.35
    rest = max(0.0, 1 - tail - neck - sh)
    return {"gamcha_tail": tail, "neck": neck, "shoulder_L": sh, "chest": rest}


def mouth_weights(obj, cols, rows):
    for v in obj.data.vertices:
        j = v.index // cols
        jw = [0.0, 0.0, 0.65, 1.0][min(j, 3)]
        yield v.index, {"head": 1 - jw, "jaw": jw}


# ------------------------------------------------------------------ shape keys
def add_lungi_tuck(lungi):
    lungi.shape_key_add(name="Basis", from_mix=False)
    sk = lungi.shape_key_add(name="LungiTuck", from_mix=False)
    for i, v in enumerate(lungi.data.vertices):
        sk.data[i].co = M.lungi_tuck_target(v.co, None)


def add_blink(lid, center):
    lid.shape_key_add(name="Basis", from_mix=False)
    sk = lid.shape_key_add(name="Blink", from_mix=False)
    c = Vector(center)
    rot = Matrix.Rotation(math.radians(68), 3, "X")
    for i, v in enumerate(lid.data.vertices):
        sk.data[i].co = c + rot @ (v.co - c)


# ------------------------------------------------------------------ assemble
PART_IDS = {"Body": 1, "Head": 2, "Hair": 3, "Eye": 4, "Lid": 5, "Bag": 5, "Brow": 6, "Moustache": 6, "Mouth": 7,
            "Lungi": 10, "LungiRoll": 11, "Gamcha": 12, "Headband": 13, "Tabiz": 14}


def build(parts):
    """parts: dict name -> object (from the model stage). Returns (mesh, headband, armature)."""
    arm = build_armature()
    body = parts["Body"]
    body_bones = [n for n in bone_table() if n not in ("root", "jaw", "brow_L", "brow_R", "gamcha_tail", "lungi_front", "lungi_back")]
    auto_weights(body, arm, body_bones)
    M.trim_hidden_legs(body)

    for n in ("Head", "Hair", "Moustache", "Eye_L", "Eye_R", "Lid_L", "Lid_R", "Bag_L", "Bag_R", "Headband"):
        o = parts[n]
        assign(o, head_weights if n in ("Head",) else (lambda co: {"head": 1.0}))
    for s in "LR":
        assign(parts[f"Brow_{s}"], lambda co, s=s: {f"brow_{s}": 1.0})
    mouth = parts["Mouth"]
    for idx, w in mouth_weights(mouth, 13, 4):
        for k, x in w.items():
            g = mouth.vertex_groups.get(k) or mouth.vertex_groups.new(name=k)
            if x > 0:
                g.add([idx], x, "REPLACE")
    assign(parts["Lungi"], lungi_weights)
    assign(parts["LungiRoll"], lambda co: {"hips": 1.0})
    assign(parts["Gamcha"], gamcha_weights)
    assign(parts["Tabiz"], lambda co: {"upperarm_R": 1.0})

    add_lungi_tuck(parts["Lungi"])
    for s in "LR":
        add_blink(parts[f"Lid_{s}"], parts[f"Eye_{s}"]["eye_center"])

    # Part ids (a point attribute, not exported) for QA checks such as lungi clipping.
    for n, o in parts.items():
        pid = PART_IDS.get(n, PART_IDS.get(n.split("_")[0], 0))
        a = o.data.attributes.new("part", "INT", "POINT")
        a.data.foreach_set("value", [pid] * len(o.data.vertices))

    eyes = {s: (list(parts[f"Eye_{s}"]["eye_center"]), parts[f"Eye_{s}"]["eye_radius"]) for s in "LR"}
    # Join everything except the headband into one skinned mesh.
    join = [o for n, o in parts.items() if n != "Headband"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in join:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts["Lungi"]  # has shape keys
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    mesh.name = "Thief"
    mesh.data.name = "Thief"
    for k in list(mesh.keys()):
        del mesh[k]
    for sd, (c, r) in eyes.items():
        mesh[f"eye_center_{sd}"] = c
        mesh[f"eye_radius_{sd}"] = r
    headband = parts["Headband"]
    for o in (mesh, headband):
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        o.parent = arm
        mod = o.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    # Shape keys must survive the join.
    for kb in mesh.data.shape_keys.key_blocks[1:]:
        kb.value = 0.0  # shape_key_add leaves new keys at 1.0; the runtime drives them from 0
    keys = [k.name for k in mesh.data.shape_keys.key_blocks] if mesh.data.shape_keys else []
    print("[rig] shape keys:", keys)
    assert "LungiTuck" in keys and "Blink" in keys, keys
    unweighted = [v.index for v in mesh.data.vertices if not v.groups]
    print(f"[rig] joined mesh {len(mesh.data.vertices)} verts, unweighted {len(unweighted)}")
    add_ik(arm)
    calibrate_poles(arm)
    return mesh, headband, arm
