"""Sidhel Chor thief - geometry.

Original character design (docs/BLENDER_CHARACTER_SPEC.md §1): a wiry, pot-bellied rural Bengali
thief with a long droopy nose, sly half-lidded eyes, bushy mobile brows, a waxed moustache with
curled tips, sticking-out ears, oiled slicked hair, a checked lungi knotted at the waist, a gamcha
slung round the neck and over the left shoulder, and a tabiz amulet on his right arm.

Blender axes: Z up, the character faces -Y, his left side is +X. Metres. Origin between the feet.
Every part is built procedurally (box modelling with bmesh, a skin-modifier body, swept cloth) so
the whole model is reproducible, then saved as an ordinary editable .blend.
"""
import math

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from th_common import apply_modifiers, catmull, clamp, gauss, mesh_object, smoothstep, subdivide, sweep, v3

# ------------------------------------------------------------------ landmarks (shared with the rig)
SQ = math.sqrt(0.5)
ARM_DIR = Vector((0.70, -0.06, -0.71)).normalized()  # A-pose, a touch forward


def _arm(side):
    s = 1 if side == "L" else -1
    d = Vector((ARM_DIR.x * s, ARM_DIR.y, ARM_DIR.z))
    sh = Vector((0.178 * s, 0.022, 1.292))
    # A slight rest bend at the elbow (back) gives IK a bend direction; a straight chain cannot bend.
    el = sh + d * 0.262 + Vector((0, 0.022, 0))
    wr = sh + d * 0.504
    return sh, el, wr, d


LM = {
    "pelvis": Vector((0, 0.005, 0.895)),
    "spine": Vector((0, 0.0, 0.99)),
    "chest": Vector((0, 0.012, 1.13)),
    "neck": Vector((0, 0.022, 1.318)),
    "head": Vector((0, 0.012, 1.425)),
    "head_top": Vector((0, 0.01, 1.63)),
    "head_c": Vector((0, -0.006, 1.488)),
}
for _s in "LR":
    _k = 1 if _s == "L" else -1
    _sh, _el, _wr, _d = _arm(_s)
    LM[f"clav_{_s}"] = Vector((0.03 * _k, 0.02, 1.30))
    LM[f"shoulder_{_s}"] = _sh
    LM[f"elbow_{_s}"] = _el
    LM[f"wrist_{_s}"] = _wr
    LM[f"knuckle_{_s}"] = _wr + _d * 0.098
    LM[f"fingertip_{_s}"] = _wr + _d * 0.185
    LM[f"hip_{_s}"] = Vector((0.087 * _k, 0.0, 0.862))
    LM[f"knee_{_s}"] = Vector((0.097 * _k, -0.012, 0.472))
    LM[f"ankle_{_s}"] = Vector((0.104 * _k, 0.018, 0.084))
    LM[f"ball_{_s}"] = Vector((0.112 * _k, -0.098, 0.024))
    LM[f"toe_{_s}"] = Vector((0.116 * _k, -0.168, 0.022))
    LM[f"heel_{_s}"] = Vector((0.104 * _k, 0.052, 0.03))

HEAD_R = Vector((0.113, 0.124, 0.137))  # head half-sizes (x, y, z)


# ------------------------------------------------------------------ body (skin modifier)
def build_body(col):
    """One continuous mesh: torso, neck, arms, hands with fingers, legs and feet."""
    verts, edges, radii = [], [], []

    def add(p, r, parent=None):
        verts.append(tuple(p))
        radii.append(r if isinstance(r, tuple) else (r, r))
        i = len(verts) - 1
        if parent is not None:
            edges.append((parent, i))
        return i

    pel = add(LM["pelvis"], (0.15, 0.122))
    ab = add((0, -0.006, 0.985), (0.145, 0.12), pel)
    rib = add((0, 0.004, 1.105), (0.158, 0.118), ab)
    ch = add((0, 0.014, 1.215), (0.168, 0.112), rib)
    nb = add((0, 0.026, 1.305), (0.075, 0.07), ch)
    nm = add((0, 0.02, 1.37), (0.058, 0.058), nb)
    add((0, 0.016, 1.43), (0.055, 0.055), nm)

    for s in "LR":
        k = 1 if s == "L" else -1
        sh, el, wr, d = _arm(s)
        cl = add((0.11 * k, 0.022, 1.28), (0.07, 0.064), ch)
        a0 = add(sh, 0.06, cl)
        a1 = add(sh.lerp(el, 0.45), 0.05, a0)
        a2 = add(sh.lerp(el, 0.86), 0.042, a1)
        e0 = add(el, 0.04, a2)
        f0 = add(el.lerp(wr, 0.18), 0.045, e0)
        f1 = add(el.lerp(wr, 0.55), 0.039, f0)
        w0 = add(wr, 0.031, f1)
        # Hand: palm then four fingers and a thumb (big cartoon hands, +12 %).
        side_ax = Vector((0, 1, 0))  # fingers spread along Y in the A-pose palm plane
        inward = Vector((-k * SQ, 0, -SQ))  # palm faces the thigh
        palm = add(wr + d * 0.048, (0.036, 0.023), w0)
        for j, (off, ln) in enumerate(((-0.031, 0.072), (-0.011, 0.081), (0.009, 0.077), (0.027, 0.062))):
            base = wr + d * 0.094 + side_ax * off + inward * 0.004
            kb = add(base, 0.0145, palm)
            mid = add(base + d * ln * 0.5 + inward * 0.008, 0.0135, kb)
            add(base + d * ln + inward * 0.02, 0.0115, mid)
        t0 = add(wr + d * 0.028 + side_ax * -0.024 + inward * 0.012, 0.0175, palm)
        t1 = add(wr + d * 0.058 + side_ax * -0.052 + inward * 0.022, 0.0145, t0)
        add(wr + d * 0.085 + side_ax * -0.066 + inward * 0.03, 0.0125, t1)

        # Leg and foot.
        hp = add(LM[f"hip_{s}"], 0.09, pel)
        th = add(LM[f"hip_{s}"].lerp(LM[f"knee_{s}"], 0.45) + Vector((0, -0.006, 0)), 0.075, hp)
        k0 = add(LM[f"hip_{s}"].lerp(LM[f"knee_{s}"], 0.86), 0.06, th)
        kn = add(LM[f"knee_{s}"], 0.057, k0)
        cf = add(LM[f"knee_{s}"].lerp(LM[f"ankle_{s}"], 0.28) + Vector((0, 0.012, 0)), (0.058, 0.066), kn)
        sm = add(LM[f"knee_{s}"].lerp(LM[f"ankle_{s}"], 0.62) + Vector((0, 0.008, 0)), 0.044, cf)
        an = add(LM[f"ankle_{s}"], 0.04, sm)
        add(LM[f"heel_{s}"], (0.042, 0.036), an)
        mf = add(LM[f"ankle_{s}"].lerp(LM[f"ball_{s}"], 0.5) + Vector((0, 0, -0.012)), (0.052, 0.033), an)
        bl = add(LM[f"ball_{s}"], (0.058, 0.026), mf)
        add(LM[f"toe_{s}"], (0.052, 0.022), bl)

    me = bpy.data.meshes.new("Body")
    me.from_pydata(verts, edges, [])
    obj = bpy.data.objects.new("Body", me)
    col.objects.link(obj)
    mod = obj.modifiers.new("Skin", "SKIN")
    mod.use_smooth_shade = True
    mod.branch_smoothing = 0.6
    for i, r in enumerate(radii):
        me.skin_vertices[0].data[i].radius = r
    me.skin_vertices[0].data[pel].use_root = True
    obj.modifiers.new("Subsurf", "SUBSURF").levels = 1
    apply_modifiers(obj)
    sculpt_body(obj)
    return obj


def sculpt_body(obj):
    """Procedural sculpt pass: pot belly, chest, collarbones, shoulder blades, knees, calves."""
    me = obj.data
    for v in me.vertices:
        p = v.co
        x, y, z = p
        ax = abs(x)
        n = v.normal
        d = Vector()
        # Pot belly that hangs over the lungi roll.
        front = smoothstep(0.02, -0.06, y)
        d += Vector((0, -1, 0)) * 0.042 * gauss(z - 1.035, 0.065) * gauss(x, 0.085) * front
        d += Vector((0, 0, -1)) * 0.01 * gauss(z - 1.0, 0.04) * gauss(x, 0.09) * front
        # Navel dimple.
        d += Vector((0, 1, 0)) * 0.006 * gauss(z - 1.025, 0.012) * gauss(x, 0.012) * front
        # Skinny chest: soft pecs and a hollow sternum line, ribs at the side.
        d += Vector((0, -1, 0)) * 0.012 * gauss(z - 1.2, 0.04) * gauss(ax - 0.06, 0.04) * front
        d += Vector((0, 1, 0)) * 0.004 * gauss(z - 1.18, 0.06) * gauss(x, 0.015) * front
        # Collarbones.
        d += n * 0.006 * gauss(z - 1.272, 0.012) * smoothstep(0.02, 0.05, ax) * (1 - smoothstep(0.13, 0.17, ax)) * front
        # Shoulder blades and spine groove.
        back = smoothstep(0.0, 0.06, y)
        d += Vector((0, 1, 0)) * 0.012 * gauss(z - 1.2, 0.05) * gauss(ax - 0.07, 0.035) * back
        d += Vector((0, -1, 0)) * 0.005 * gauss(x, 0.012) * smoothstep(1.0, 1.1, z) * (1 - smoothstep(1.25, 1.3, z)) * back
        # Knee caps and calves.
        for s in (1, -1):
            kn = Vector((0.097 * s, -0.012, 0.472))
            d += Vector((0, -1, 0)) * 0.012 * gauss((p - kn - Vector((0, -0.03, 0))).length, 0.03)
            cf = Vector((0.1 * s, 0.03, 0.34))
            d += Vector((0, 1, 0)) * 0.008 * gauss((p - cf).length, 0.05) * smoothstep(0.0, 0.03, y)
        v.co = p + d


def trim_hidden_legs(obj):
    """Remove upper-thigh/pelvis faces that are always covered by the lungi (no hidden waste)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = []
    for f in bm.faces:
        c = f.calc_center_median()
        if 0.6 < c.z < 0.9 and abs(c.x) < 0.185 and abs(c.y) < 0.15 and all(0.585 < v.co.z < 0.935 for v in f.verts):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()


# ------------------------------------------------------------------ head (box modelling)
def _head_cage(cuts=5):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        v.co = v.co.normalized()
    return bm


def head_shape(u, v, w):
    """Deform a point on the unit sphere into the cartoon head (returns local offset in metres)."""
    x, y, z = u * HEAD_R.x, v * HEAD_R.y, w * HEAD_R.z
    lo = max(0.0, -w)
    # Long narrow jaw, big cranium.
    x *= 1.0 - 0.26 * lo ** 1.4 + 0.04 * max(0.0, w)
    # Nape: back of the lower head tucks in.
    y -= 0.32 * HEAD_R.y * max(0.0, v) * lo ** 1.5
    # Prominent chin, lantern jaw.
    front = max(0.0, -v)
    y -= 0.018 * front ** 2 * gauss(w + 0.86, 0.22)
    z -= 0.01 * front * gauss(w + 0.9, 0.2)
    # Muzzle (mouth area) forward.
    y -= 0.006 * front ** 3 * gauss(u, 0.42) * gauss(w + 0.5, 0.25)
    # Cheekbones.
    for s in (1, -1):
        g = gauss(u - 0.72 * s, 0.25) * gauss(v + 0.6, 0.3) * gauss(w + 0.05, 0.25)
        x += 0.009 * s * g
        y -= 0.006 * g
    # Brow ridge and eye sockets.
    y -= 0.011 * front ** 2 * gauss(w - 0.33, 0.1) * gauss(u, 0.62)
    for s in (1, -1):
        y += 0.007 * gauss(u - 0.4 * s, 0.17) * gauss(w - 0.14, 0.12) * front
    # Sloping forehead.
    y += 0.008 * max(0.0, w - 0.45) * front
    # Flat-ish cheeks below the cheekbone (thin face).
    for s in (1, -1):
        x -= 0.005 * s * gauss(u - 0.8 * s, 0.25) * gauss(w + 0.45, 0.2)
    return Vector((x, y, z))


def _extrude(bm, faces, offset, scale=(1, 1, 1), pivot=None):
    r = bmesh.ops.extrude_face_region(bm, geom=faces)
    nv = [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]
    nf = [g for g in r["geom"] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    c = pivot if pivot is not None else sum((v.co for v in nv), Vector()) / len(nv)
    for v in nv:
        q = v.co - c
        v.co = c + Vector((q.x * scale[0], q.y * scale[1], q.z * scale[2])) + Vector(offset)
    return nf, nv


def build_head(col):
    bm = _head_cage(5)
    # Face sets on the cube cage (before shaping): cube-space position of each face centre.
    def fsel(pred):
        out = []
        for f in bm.faces:
            c = f.calc_center_median()
            m = max(abs(c.x), abs(c.y), abs(c.z))
            cc = c / m
            if pred(cc):
                out.append(f)
        return out

    nose = fsel(lambda c: c.y < -0.99 and abs(c.x) < 0.3 and -0.34 < c.z < 0.0)
    ear_l = fsel(lambda c: c.x > 0.99 and 0.0 < c.y < 0.36 and -0.4 < c.z < 0.36)
    ear_r = fsel(lambda c: c.x < -0.99 and 0.0 < c.y < 0.36 and -0.4 < c.z < 0.36)
    # Shape the sphere into the head.
    for v in bm.verts:
        u, vv, w = v.co.normalized()
        v.co = head_shape(u, vv, w)

    # Nose: long, droopy, bulbous (the character's signature with the moustache).
    # The base sits between the eyes; it narrows into a bridge, then droops into a bulb.
    nf, nv = _extrude(bm, nose, (0, -0.012, 0.002), (0.62, 1, 0.8))
    nf, nv = _extrude(bm, nf, (0, -0.014, -0.008), (0.95, 1, 0.95))
    nf, nv = _extrude(bm, nf, (0, -0.013, -0.011), (1.55, 1, 1.35))
    nf, nv = _extrude(bm, nf, (0, -0.008, -0.006), (0.8, 1, 0.8))
    nf, nv = _extrude(bm, nf, (0, -0.004, -0.001), (0.45, 1, 0.45))
    # Ears: stick out sideways (jug ears), rounded rim, hollow bowl.
    for faces, s in ((ear_l, 1), (ear_r, -1)):
        f1, v1 = _extrude(bm, faces, (0.007 * s, 0.002, -0.004), (1, 0.8, 0.8))
        f2, v2 = _extrude(bm, f1, (0.013 * s, 0.006, -0.002), (1, 1.45, 1.5))
        f3, v3_ = _extrude(bm, f2, (0.008 * s, 0.002, 0.0), (1, 1.12, 1.08))
        f4, v4 = _extrude(bm, f3, (0.003 * s, 0.0, 0.0), (1, 0.9, 0.92))
        bmesh.ops.inset_region(bm, faces=f4, thickness=0.006, depth=0.0)
        for f in f4:
            for v in f.verts:
                v.co.x -= 0.012 * s
    bm.normal_update()
    recalc(bm)
    for v in bm.verts:
        v.co += LM["head_c"]
    obj = mesh_object("Head", bm, col)
    subdivide(obj, 1)
    return obj


def recalc(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def head_bvh(head):
    bm = bmesh.new()
    bm.from_mesh(head.data)
    bm.transform(head.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def surface_front(bvh, x, z, y0=-1.0):
    """Ray from the front (-Y) onto the head; returns (point, normal)."""
    hit = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)))
    if hit[0] is None:
        raise RuntimeError(f"head ray missed at x={x} z={z}")
    return hit[0], hit[1]


def surface_dir(bvh, origin_from, direction):
    hit = bvh.ray_cast(Vector(origin_from), Vector(direction).normalized())
    return hit[0], hit[1]


# ------------------------------------------------------------------ hair
def hairline(v, u):
    """Height (unit-sphere w) of the hairline: receding temples, sideburns, low at the nape."""
    au = abs(u)
    hl = 0.42 + 0.5 * max(0.0, -v) - 0.95 * max(0.0, v) ** 1.2
    # Receding temples (an M-shaped hairline: middle-aged and proud of what is left).
    hl += 0.12 * gauss(au - 0.55, 0.16) * smoothstep(-0.3, -0.8, v)
    # Sideburns in front of the ears.
    if au > 0.72:
        hl -= 0.5 * gauss(v + 0.2, 0.12)
    # Clear the ears.
    if au > 0.7 and -0.08 < v < 0.5:
        hl = max(hl, 0.42 - 0.25 * max(0.0, v - 0.25))
    return hl


def build_hair(col):
    """Oiled, slicked hair: a tapered shell over the cranium (thick on top, feathered at the edge)."""
    bm = _head_cage(6)
    keep = []
    for v in bm.verts:
        u, vv, w = v.co.normalized()
        hl = hairline(vv, u)
        m = smoothstep(hl - 0.04, hl + 0.05, w)
        base = head_shape(u, vv, w)
        nrm = Vector((u / HEAD_R.x, vv / HEAD_R.y, w / HEAD_R.z)).normalized()
        thick = 0.0016 + 0.0085 * m * (0.25 + 0.75 * max(0.0, w))
        # Volume swept up and back at the front (an oiled quiff).
        thick += 0.011 * m * gauss(vv + 0.45, 0.3) * gauss(w - 0.66, 0.2) * smoothstep(-0.6, 0.1, -u)
        # The side parting groove on his left.
        thick -= 0.005 * m * gauss(u - 0.4, 0.05) * smoothstep(0.5, -0.4, vv)
        v.co = base + nrm * thick
        keep.append(m)
    mvals = {v.index: m for v, m in zip(bm.verts, keep)}
    dead = [f for f in bm.faces if max(mvals[v.index] for v in f.verts) < 0.12]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    for v in bm.verts:
        v.co += LM["head_c"]
    recalc(bm)
    obj = mesh_object("Hair", bm, col)
    subdivide(obj, 1)
    return obj


# ------------------------------------------------------------------ face features
def build_eyes(col, bvh):
    """Eyeballs, sly upper lids (with a Blink target built later), little under-eye bags."""
    parts = {}
    for s, name in ((1, "L"), (-1, "R")):
        surf, _ = surface_front(bvh, 0.05 * s, 1.514)
        r = 0.032
        c = surf + Vector((0, 0.018, 0))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=9, radius=r)
        for v in bm.verts:
            v.co += c
        parts[f"Eye_{name}"] = (mesh_object(f"Eye_{name}", bm, col), c, r)
        # Upper lid: a cap over the top of the eyeball, tilted (outer corner droops: sly look).
        lid = bmesh.new()
        rl = r + 0.0028
        seg, rings = 16, 6
        top_ang = math.radians(71)
        verts = []
        for i in range(rings + 1):
            th = top_ang * i / rings
            row = []
            for k in range(seg):
                ph = 2 * math.pi * k / seg
                p = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th))) * rl
                row.append(p)
            verts.append(row)
        # Rolled lid edge: the last row tucks back in toward the eyeball.
        edge = [p * (r + 0.0012) / rl + Vector((0, 0, -0.0016)) for p in verts[-1]]
        verts.append(edge)
        bv = [[lid.verts.new(p) for p in row] for row in verts]
        top = lid.verts.new(Vector((0, 0, rl)))
        for i in range(1, len(bv) - 1):
            for k in range(seg):
                k1 = (k + 1) % seg
                lid.faces.new((bv[i][k], bv[i][k1], bv[i + 1][k1], bv[i + 1][k]))
        for k in range(seg):
            lid.faces.new((top, bv[1][k], bv[1][(k + 1) % seg]))
        for v in bv[0]:
            lid.verts.remove(v)
        tilt = math.radians(-9 * s)  # outer corner lower
        from mathutils import Matrix
        rot = Matrix.Rotation(tilt, 4, "Y") @ Matrix.Rotation(math.radians(-6), 4, "X")
        lid.transform(rot)
        for v in lid.verts:
            v.co += c
        recalc(lid)
        parts[f"Lid_{name}"] = (mesh_object(f"Lid_{name}", lid, col), c, rl)
        # Lower lid / eye bag.
        bag = bmesh.new()
        rows = []
        for i in range(5):
            th = math.radians(180 - 58 * i / 4)
            row = []
            for k in range(seg // 2 + 1):
                ph = math.pi + math.pi * k / (seg // 2)  # front half only
                rr = r + 0.0022 + 0.0015 * math.sin(math.pi * i / 4)
                row.append(bag.verts.new(Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th))) * rr))
            rows.append(row)
        for i in range(4):
            for k in range(seg // 2):
                bag.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
        bag.transform(Matrix.Rotation(math.radians(6 * s), 4, "Y"))
        for v in bag.verts:
            v.co += c
        recalc(bag)
        parts[f"Bag_{name}"] = (mesh_object(f"Bag_{name}", bag, col), c, r)
    return parts


def _on_surface(bvh, pts, lift):
    out = []
    for p in pts:
        hp, n = surface_front(bvh, p.x, p.z)
        out.append(hp + n * lift + Vector((0, p.y, 0)))
    return out


def build_brows(col, bvh):
    """Thick, bushy, asymmetric brows (his left one cocked higher). Each rides its own bone."""
    objs = {}
    for s, name, raise_ in ((1, "L", 0.006), (-1, "R", 0.0)):
        ctrl = [Vector((0.016 * s, 0, 1.548)), Vector((0.04 * s, 0, 1.561 + raise_)), Vector((0.066 * s, 0, 1.563 + raise_)), Vector((0.088 * s, 0, 1.55 + raise_ * 0.6))]
        pts = _on_surface(bvh, catmull(ctrl, 12), 0.004)
        n = len(pts)

        def rad(i, t):
            body = math.sin(math.pi * clamp(0.12 + 0.88 * t)) ** 0.6
            return (0.0035 + 0.0045 * body * (1.2 - 0.5 * t), 0.0045 + 0.004 * body)

        bm = bmesh.new()
        ups = [Vector((0, -1, 0.2))] * n
        sweep(bm, pts, rad, segments=8, ups=ups)
        recalc(bm)
        objs[f"Brow_{name}"] = mesh_object(f"Brow_{name}", bm, col)
    return objs


def build_moustache(col, bvh):
    """The proud waxed moustache: thick over the lip, sweeping out and curling up at the tips."""
    bm = bmesh.new()
    for s in (1, -1):
        base = [Vector((0.0, 0, 1.424)), Vector((0.024 * s, 0, 1.418)), Vector((0.048 * s, 0, 1.41)), Vector((0.07 * s, 0, 1.414))]
        pts = _on_surface(bvh, base, 0.008)
        last = pts[-1]
        # Out past the cheek, then a generous upward curl (waxed every morning).
        curl = []
        cx, cz = last.x + 0.036 * s, last.z + 0.022
        for i in range(10):
            a = math.radians(-90 + 310 * i / 9)
            rr = 0.019 * (1 - 0.5 * i / 9)
            curl.append(Vector((cx + s * rr * math.cos(a), last.y - 0.004 + 0.006 * i / 9, cz + rr * math.sin(a))))
        curl[0] = Vector((last.x + 0.02 * s, last.y - 0.003, last.z + 0.0))
        ctrl = pts + curl
        path = catmull(ctrl, 20)

        def rad(i, t):
            body = 1.0 - smoothstep(0.0, 1.0, t) ** 0.75
            return (0.003 + 0.011 * body, 0.003 + 0.0075 * body)

        sweep(bm, path, rad, segments=6, ups=[Vector((0, -1, 0))] * len(path))
    recalc(bm)
    return mesh_object("Moustache", bm, col)


def build_mouth(col, bvh):
    """A lopsided smirk: dark mouth with a strip of teeth; the lower edge rides the jaw bone."""
    bm = bmesh.new()
    cols, rows = 13, 4
    grid = []
    for j in range(rows):
        row = []
        for i in range(cols):
            t = i / (cols - 1)
            x = -0.047 + 0.098 * t
            curve = -0.013 * math.sin(math.pi * t) + 0.011 * t  # smile + the left corner higher
            open_ = 0.016 * math.sin(math.pi * t) ** 0.8
            z = 1.397 + curve - open_ * (j / (rows - 1)) + 0.0025
            hp, n = surface_front(bvh, x, z)
            row.append(bm.verts.new(hp + n * 0.0016))
        grid.append(row)
    faces = []
    for j in range(rows - 1):
        for i in range(cols - 1):
            faces.append(bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])))
    recalc(bm)
    obj = mesh_object("Mouth", bm, col)
    # Rows: 0 = upper lip line (teeth), 1-3 = mouth.
    return obj, cols, rows


# ------------------------------------------------------------------ lungi
LUNGI_TOP = 0.985
LUNGI_HEM = 0.095


def lungi_radius(z, th):
    """Elliptical radius of the lungi tube at height z, angle th (0 = +X, pi/2 = +Y back)."""
    t = clamp((LUNGI_TOP - z) / (LUNGI_TOP - LUNGI_HEM))
    rx = 0.162 + 0.03 * smoothstep(0.0, 0.17, t) - 0.006 * t
    ry = 0.13 + 0.036 * smoothstep(0.0, 0.2, t) + 0.004 * t
    # Fuller at the back (seat) and front (knot pleats).
    ry += 0.006 * smoothstep(0.05, 0.25, t) * (1 - t)
    return rx, ry


def build_lungi(col):
    seg, rings = 30, 18
    bm = bmesh.new()
    grid = []
    zs = []
    for j in range(rings + 1):
        t = j / rings
        zs.append(LUNGI_TOP - (LUNGI_TOP - LUNGI_HEM) * (t ** 1.08))
    for j, z in enumerate(zs):
        row = []
        t = j / rings
        for k in range(seg):
            th = 2 * math.pi * k / seg - math.pi / 2  # k=0 at the front (-Y)
            rx, ry = lungi_radius(z, th)
            # Vertical folds: deeper toward the hem, radiating from the front knot.
            fold = 0.0065 * t * math.sin(7 * th + 1.3) + 0.0035 * t * math.sin(13 * th)
            knot = gauss(th + math.pi / 2, 0.35) * (0.01 * (1 - t) + 0.006 * math.sin(9 * th) * (1 - t))
            # The wrap overlap: a pleat column falling from the knot (slightly to his right).
            knot += 0.011 * gauss(th + math.pi / 2 + 0.2, 0.07) * (0.35 + 0.65 * t) - 0.004 * gauss(th + math.pi / 2 + 0.3, 0.05) * t
            r = 1 + (fold + knot) / max(rx, ry)
            row.append(bm.verts.new((math.cos(th) * rx * r, math.sin(th) * ry * r, z)))
        grid.append(row)
    from th_common import pattern_uv
    uvl = pattern_uv(bm)
    circ = 2 * math.pi * 0.19
    for j in range(rings):
        for k in range(seg):
            k1 = (k + 1) % seg
            f = bm.faces.new((grid[j][k], grid[j][k1], grid[j + 1][k1], grid[j + 1][k]))
            for lp, (jj, kk) in zip(f.loops, ((j, k), (j, k + 1), (j + 1, k + 1), (j + 1, k))):
                lp[uvl].uv = (kk / seg * circ, zs[jj])
    # Inner hem turn-up so the cloth reads as having thickness from below.
    hem = grid[-1]
    inner = [bm.verts.new(Vector((v.co.x * 0.965, v.co.y * 0.965, v.co.z + 0.035))) for v in hem]
    for k in range(seg):
        k1 = (k + 1) % seg
        bm.faces.new((hem[k], hem[k1], inner[k1], inner[k]))
    recalc(bm)
    # Make the normals face outward (the main tube).
    obj = mesh_object("Lungi", bm, col)
    for p in obj.data.polygons:
        c = p.center
        out = Vector((c.x, c.y, 0))
        if p.index < rings * seg and p.normal.dot(out) < 0:
            p.flip()
    obj["rings"] = rings
    obj["seg"] = seg
    return obj


def build_lungi_roll(col):
    """The rolled waistband with the twisted front knot (gant)."""
    bm = bmesh.new()
    pts = []
    n = 30
    z = LUNGI_TOP - 0.004
    for i in range(n):
        th = 2 * math.pi * i / n - math.pi / 2
        rx, ry = lungi_radius(z, th)
        pts.append(Vector((math.cos(th) * (rx + 0.006), math.sin(th) * (ry + 0.006), z - 0.006 * math.sin(th) ** 2 * 0 - 0.008 * gauss(th + math.pi / 2, 0.6))))

    def rad(i, t):
        return (0.0105, 0.0105)

    sweep(bm, pts, rad, segments=6, closed=True, profile=lambda a, i, u: 1 + 0.12 * math.sin(3 * a + i * 1.7))
    # Knot: a twisted bulge at the front, slightly to his right.
    knot = []
    c = Vector((-0.016, -0.134, LUNGI_TOP - 0.018))
    for i in range(9):
        a = 2 * math.pi * i / 8
        knot.append(c + Vector((0.016 * math.cos(a), -0.004 - 0.006 * math.sin(a * 2), 0.012 * math.sin(a))))
    sweep(bm, knot, lambda i, t: (0.0085, 0.008), segments=8)
    # A short tucked flap hanging below the knot.
    flap = [c + Vector((0.002, -0.006, -0.01)), c + Vector((0.006, -0.012, -0.04)), c + Vector((0.004, -0.014, -0.075))]
    sweep(bm, catmull(flap, 6), lambda i, t: (0.004, 0.017 * (1 - 0.4 * t)), segments=6, ups=[Vector((0, -1, 0))] * 6)
    recalc(bm)
    return mesh_object("LungiRoll", bm, col)


def lungi_tuck_target(co, rings_t):
    """Shape-key position for the malkochha tuck: the hem hitched above the knee, cloth bunched."""
    x, y, z = co
    t = clamp((LUNGI_TOP - z) / (LUNGI_TOP - LUNGI_HEM))
    if t < 0.28:
        return Vector(co)
    k = (t - 0.28) / 0.72  # 0 at the gather line, 1 at the hem
    new_z = lerp_(z, 0.80 - 0.33 * (k ** 1.15), 1.0)
    front = smoothstep(0.02, -0.12, y)
    new_z += 0.06 * front * k  # the front is pulled higher (V)
    puff = 1.0 + 0.10 * math.sin(math.pi * clamp(k * 1.1)) + 0.03
    th = math.atan2(y, x)
    puff += 0.03 * math.sin(9 * th) * k
    return Vector((x * puff, y * puff * 1.02, new_z))


def lerp_(a, b, t):
    return a + (b - a) * t


# ------------------------------------------------------------------ gamcha
def build_gamcha(col):
    """Gamcha rolled round the neck, knotted at the front left; one end down the chest, the
    long end over the left shoulder down his back (rides the `gamcha_tail` bone)."""
    bm = bmesh.new()
    n = 28
    loop = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x = 0.093 * math.sin(a)
        y = 0.024 - 0.083 * math.cos(a)
        front = max(0.0, math.cos(a))
        z = 1.318 - 0.04 * front ** 1.5 + 0.012 * (1 - front)
        loop.append(Vector((x, y, z)))
    sweep(bm, loop, lambda i, t: (0.0185, 0.0155), segments=7, closed=True, profile=lambda a, i, u: 1 + 0.16 * math.sin(2 * a + i * 1.45))
    # Knot at the front left.
    kc = Vector((0.045, -0.058, 1.288))
    kn = [kc + Vector((0.015 * math.cos(a), -0.008 * math.sin(a) - 0.006, 0.013 * math.sin(a))) for a in [2 * math.pi * i / 8 for i in range(9)]]
    sweep(bm, kn, lambda i, t: (0.012, 0.011), segments=8)
    # Front end: a flat strip down the chest with a fringed end.
    fr = catmull([kc + Vector((0.004, -0.008, -0.01)), Vector((0.058, -0.088, 1.22)), Vector((0.062, -0.108, 1.13)), Vector((0.066, -0.118, 1.07))], 10)
    sweep(bm, fr, lambda i, t: (0.0035, 0.034 + 0.006 * t), segments=6, ups=[Vector((0, -1, 0))] * 10)
    # Long end: from the knot up over the left shoulder and down the back.
    bk = catmull([kc + Vector((0.01, 0.0, 0.008)), Vector((0.09, -0.02, 1.33)), Vector((0.122, 0.035, 1.338)), Vector((0.128, 0.098, 1.25)), Vector((0.124, 0.114, 1.12)), Vector((0.12, 0.12, 1.0))], 16)
    ups = []
    for p in bk:
        # Wide axis tangent to the body: lies across the shoulder top, then across the back.
        ups.append(Vector((0.0, 0.0, 1.0)) if p.z > 1.31 and p.y < 0.06 else Vector((0, 1, 0.2)))
    sweep(bm, bk, lambda i, t: (0.0035, 0.036 + 0.004 * t), segments=6, ups=ups)
    recalc(bm)
    obj = mesh_object("Gamcha", bm, col)
    return obj


def build_headband(col, bvh_hair, bvh_head=None):
    """Green checked gamcha tied round the head after preparation (toggled by the game)."""
    bm = bmesh.new()
    n = 28
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        d = Vector((math.sin(a), -math.cos(a), 0.0))
        zc = 1.566 + 0.04 * (1 - math.cos(a)) / 2  # across the forehead, higher at the back
        o = Vector((0, -0.004, zc)) + d * 0.3
        # Outermost of hair and skin, so the band sits on whichever is on top.
        hits = [t.ray_cast(o, -d) for t in (bvh_hair, bvh_head) if t is not None]
        hits = [h[0] for h in hits if h[0] is not None]
        p = max(hits, key=lambda q: (q - Vector((0, -0.004, zc))).length) if hits else Vector((0, -0.004, zc)) + d * 0.12
        pts.append(p + d * 0.007)
    sweep(bm, pts, lambda i, t: (0.017, 0.0085), segments=6, closed=True, ups=[Vector((0, 0, 1))] * n,
          profile=lambda a, i, u: 1 + 0.08 * math.sin(3 * a + i))
    # Knot and two short tails at the back.
    back = pts[n // 2]
    kn = [back + Vector((0.014 * math.cos(a), 0.008 + 0.005 * math.sin(a), 0.012 * math.sin(a))) for a in [2 * math.pi * i / 8 for i in range(9)]]
    sweep(bm, kn, lambda i, t: (0.0095, 0.009), segments=8)
    for s in (1, -1):
        tail = catmull([back + Vector((0.005 * s, 0.014, -0.005)), back + Vector((0.03 * s, 0.03, -0.04)), back + Vector((0.042 * s, 0.035, -0.085))], 6)
        sweep(bm, tail, lambda i, t: (0.003, 0.016 * (1 - 0.3 * t)), segments=6, ups=[Vector((0, 1, 0))] * 6)
    recalc(bm)
    return mesh_object("Headband", bm, col)


# ------------------------------------------------------------------ tabiz (amulet)
def build_tabiz(col):
    sh, el, _, d = _arm("R")
    c = sh.lerp(el, 0.42)
    bm = bmesh.new()
    ring = []
    side = d.cross(Vector((0, 1, 0))).normalized()
    fwd = d.cross(side).normalized()
    for i in range(17):
        a = 2 * math.pi * i / 16
        ring.append(c + (side * math.cos(a) + fwd * math.sin(a)) * 0.0445)
    sweep(bm, ring, lambda i, t: (0.0028, 0.0028), segments=6, closed=False, cap=False)
    # The amulet capsule on the outer side.
    p = c + side * 0.049
    caps = [p - d * 0.016, p, p + d * 0.016]
    sweep(bm, caps, lambda i, t: (0.0065, 0.0065) if i == 1 else (0.0045, 0.0045), segments=8)
    recalc(bm)
    return mesh_object("Tabiz", bm, col)


# ------------------------------------------------------------------ head scale (cartoon appeal)
HEAD_PIVOT = Vector((0, 0.01, 1.372))
HEAD_SCALE = 1.12
HEAD_DROP = -0.018


def head_xform(p):
    return HEAD_PIVOT + (Vector(p) - HEAD_PIVOT) * HEAD_SCALE + Vector((0, 0, HEAD_DROP))


def scale_head(objs):
    """Enlarge every head part about the neck (bigger head = more readable, more appealing)."""
    for o in objs:
        for v in o.data.vertices:
            v.co = head_xform(v.co)
