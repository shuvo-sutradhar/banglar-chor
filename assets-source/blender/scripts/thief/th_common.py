"""Shared helpers for the Sidhel Chor thief build (Blender 4.2+ / 5.x, bpy + bmesh only)."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def gauss(d, s):
    return math.exp(-(d / s) ** 2)


def lerp(a, b, t):
    return a + (b - a) * t


def v3(*a):
    return Vector(a if len(a) == 3 else a[0])


def link(obj, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name, bm, collection=None, smooth=True):
    """bmesh -> new mesh object (bmesh is freed)."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    return link(obj, collection)


def apply_modifiers(obj):
    """Bake the evaluated mesh (all modifiers) back into the object's own mesh data."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)
    return obj


def subdivide(obj, levels=1):
    m = obj.modifiers.new("Subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    m.quality = 3
    return apply_modifiers(obj)


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def src_material(name, color, rough=0.8):
    """A bake-source material (flat colour). Replaced by the atlas materials after baking."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    m["src_rough"] = rough
    return m


def srgb(hexstr):
    """'#rrggbb' -> linear RGB tuple."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# ---------------------------------------------------------------- sweeps
def _frames(points, ups=None):
    """Parallel-transport frames along a polyline. Returns (tangent, normal, binormal) per point."""
    n = len(points)
    tangents = []
    for i in range(n):
        a = points[max(0, i - 1)]
        b = points[min(n - 1, i + 1)]
        t = b - a
        tangents.append(t.normalized() if t.length > 1e-9 else Vector((0, 0, 1)))
    frames = []
    if ups:
        for i in range(n):
            up = Vector(ups[i])
            nrm = (up - tangents[i] * up.dot(tangents[i]))
            if nrm.length < 1e-6:
                nrm = tangents[i].orthogonal()
            nrm.normalize()
            frames.append((tangents[i], nrm, tangents[i].cross(nrm)))
        return frames
    up = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((0, 1, 0))
    nrm = (up - tangents[0] * up.dot(tangents[0])).normalized()
    for i in range(n):
        if i > 0:
            axis = tangents[i - 1].cross(tangents[i])
            if axis.length > 1e-8:
                ang = tangents[i - 1].angle(tangents[i])
                nrm = Matrix.Rotation(ang, 3, axis.normalized()) @ nrm
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
        frames.append((tangents[i], nrm, tangents[i].cross(nrm)))
    return frames


def _perimeter(a, b):
    a, b = abs(a), abs(b)
    return math.pi * (3 * (a + b) - math.sqrt(max(0.0, (3 * a + b) * (a + 3 * b))))


def pattern_uv(bm):
    return bm.loops.layers.uv.get("pattern") or bm.loops.layers.uv.new("pattern")


def sweep(bm, points, radius, segments=8, ups=None, cap=True, twist=0.0, closed=False, profile=None):
    """Sweep an elliptical profile along `points`.

    radius(i, t) -> (ra, rb): half-size along the frame normal (a) and binormal (b); t in 0..1.
    profile(angle, i, t) -> scale multiplier (for folds / twisted cloth).
    Returns (rings, cap_faces) where rings is a list of vertex lists.
    """
    pts = [Vector(p) for p in points]
    fr = _frames(pts, ups)
    n = len(pts)
    rings = []
    for i, (p, (t, nrm, bi)) in enumerate(zip(pts, fr)):
        u = i / (n - 1) if n > 1 else 0
        ra, rb = radius(i, u)
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments + twist * u
            s = profile(a, i, u) if profile else 1.0
            off = nrm * (math.cos(a) * ra * s) + bi * (math.sin(a) * rb * s)
            ring.append(bm.verts.new(p + off))
        rings.append(ring)
    # Pattern UVs in metres: u along the path, v around the profile (cloth checks follow the cloth).
    uvl = pattern_uv(bm)
    acc = [0.0]
    for i in range(1, n + (1 if closed else 0)):
        acc.append(acc[-1] + (pts[i % n] - pts[i - 1]).length)
    per = [_perimeter(*radius(i, i / (n - 1) if n > 1 else 0)) for i in range(n)]
    loops = range(n) if closed else range(n - 1)
    for i in loops:
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(segments):
            k1 = (k + 1) % segments
            f = bm.faces.new((r0[k], r0[k1], r1[k1], r1[k]))
            for lp, (ii, kk) in zip(f.loops, ((i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k))):
                lp[uvl].uv = (acc[ii], kk / segments * per[ii % n])
    caps = []
    if cap and not closed:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / len(ring))
            for k in range(segments):
                k1 = (k + 1) % segments
                f = (c, ring[k1], ring[k]) if rev else (c, ring[k], ring[k1])
                caps.append(bm.faces.new(f))
    return rings, caps


def catmull(points, samples):
    """Centripetal-ish Catmull-Rom resample of control points (open curve)."""
    P = [Vector(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    segs = len(P) - 3
    for s in range(samples):
        g = s / (samples - 1) * segs
        i = min(int(g), segs - 1)
        t = g - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


def recalc_normals(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
