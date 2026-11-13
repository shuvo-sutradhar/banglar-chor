"""Sidhel Chor thief - surface paint.

Bake-source materials are procedural node trees (eyes, skin detail, cloth checks). After UV
unwrapping, `bake_atlases` renders them with Cycles into two texture atlases and replaces every
part's material with the two runtime materials `Thief_Skin` and `Thief_Cloth`.
"""
import math

import bpy
from mathutils import Vector

from th_common import srgb


def _sock(node, ident, out=False):
    coll = node.outputs if out else node.inputs
    for s in coll:
        if s.identifier == ident or s.name == ident:
            if not out and getattr(s, "enabled", True) is False:
                continue
            return s
    raise KeyError(f"{node.bl_idname}: no socket {ident}")


def _mix(nt, fac, a, b):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    nt.links.new(fac, _sock(m, "Factor_Float"))
    for val, ident in ((a, "A_Color"), (b, "B_Color")):
        s = _sock(m, ident)
        if isinstance(val, tuple):
            s.default_value = (*val, 1.0)
        else:
            nt.links.new(val, s)
    return _sock(m, "Result_Color", out=True)


def _ramp(nt, value, lo, hi):
    """smooth 0..1 step of `value` between lo and hi."""
    r = nt.nodes.new("ShaderNodeMapRange")
    r.interpolation_type = "SMOOTHSTEP"
    nt.links.new(value, r.inputs["Value"])
    r.inputs["From Min"].default_value = lo
    r.inputs["From Max"].default_value = hi
    return r.outputs["Result"]


def _vmath(nt, op, a, b=None):
    n = nt.nodes.new("ShaderNodeVectorMath")
    n.operation = op
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (tuple, Vector)):
            n.inputs[i].default_value = tuple(v)
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs["Value"] if op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else n.outputs["Vector"]


def eye_material(name, center, gaze):
    """Eyeball: off-white with a warm-brown iris, dark rim, black pupil and a catch-light."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    d = _vmath(nt, "NORMALIZE", _vmath(nt, "SUBTRACT", geo.outputs["Position"], tuple(center)))
    cosg = _vmath(nt, "DOT_PRODUCT", d, tuple(Vector(gaze).normalized()))
    hl_dir = (Vector(gaze).normalized() + Vector((0.22, 0.0, 0.3))).normalized()
    cosh = _vmath(nt, "DOT_PRODUCT", d, tuple(hl_dir))
    white = srgb("#f3eee4")
    corner = srgb("#d9b8a8")
    iris_out = srgb("#24130a")
    iris_in = srgb("#7a4a22")
    pupil = srgb("#090605")
    c = _mix(nt, _ramp(nt, cosg, 0.55, 0.15), white, corner)
    iris_t = _ramp(nt, cosg, 0.885, 0.955)
    iris = _mix(nt, iris_t, iris_out, iris_in)
    c = _mix(nt, _ramp(nt, cosg, 0.868, 0.878), c, iris)
    c = _mix(nt, _ramp(nt, cosg, 0.968, 0.974), c, pupil)
    c = _mix(nt, _ramp(nt, cosh, 0.988, 0.992), c, (1.0, 1.0, 1.0))
    nt.links.new(c, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.22
    m["src_rough"] = 0.22
    return m
