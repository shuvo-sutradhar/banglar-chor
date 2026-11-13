"""Sidhel Chor thief - hand props for the fictional cartoon digging challenge (Phase 4B).

Four tools, one per equipment item (docs/ECONOMY_AND_PROGRESSION.md §3): deliberately chunky,
toy-like silhouettes, NOT accurate real tools. Each is a small low-poly mesh parented to the
`hand_R` bone (rigid, no skinning), so the grip authored here is the grip in game. All four share
one material (`Thief_Props`) driven by a vertex colour, so whichever tool is visible costs a
single draw call. The game shows only the equipped tool, and only while digging.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from th_common import srgb

TOOLS = ("Tool_bamboo-khunti", "Tool_soft-khurpi", "Tool_tin-kodal", "Tool_iron-shabol")

BAMBOO = "#b39554"
BAMBOO_DARK = "#7d6332"
WOOD = "#8a5a33"
CLOTH = "#c9b48a"
TIN = "#a9b2b8"
IRON = "#4d4f55"
KNOB = "#35363b"


def props_material():
    m = bpy.data.materials.get("Thief_Props") or bpy.data.materials.new("Thief_Props")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    col = nt.nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


class Builder:
    """Accumulates coloured primitives in tool space: +Z = along the handle, away from the fist."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.color.new("Col")

    def _paint(self, faces, hexcol):
        c = srgb(hexcol)
        lin = (c[0], c[1], c[2], 1.0)
        for f in faces:
            for lp in f.loops:
                lp[self.col] = lin

    def cyl(self, r0, r1, z0, z1, hexcol, seg=8, xy=(0.0, 0.0)):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0,
                                    matrix=Matrix.Translation(Vector((xy[0], xy[1], (z0 + z1) / 2))))
        faces = {f for v in res["verts"] for f in v.link_faces}
        self._paint(faces, hexcol)

    def box(self, size, center, hexcol, rot=None):
        m = Matrix.Translation(Vector(center))
        if rot is not None:
            m = m @ rot
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m @ Matrix.Diagonal(Vector((*size, 1.0))))
        faces = {f for v in res["verts"] for f in v.link_faces}
        self._paint(faces, hexcol)

    def blade(self, w, length, z0, thick, hexcol, curve=0.0, seg=4):
        """A flat, rounded spade blade from z0 along +Z (optionally curved toward -Y)."""
        verts = []
        for i in range(seg + 1):
            t = i / seg
            half = w / 2 * (1 - 0.55 * t * t)
            y = -curve * t * t
            z = z0 + length * t
            verts.append([(-half, y - thick / 2, z), (half, y - thick / 2, z), (half, y + thick / 2, z), (-half, y + thick / 2, z)])
        bv = [[self.bm.verts.new(p) for p in ring] for ring in verts]
        faces = []
        for a, b in zip(bv, bv[1:]):
            for k in range(4):
                faces.append(self.bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k])))
        faces.append(self.bm.faces.new(list(reversed(bv[0]))))
        faces.append(self.bm.faces.new(bv[-1]))
        self._paint(faces, hexcol)

    def to_object(self, name, col, mat):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new(name, me)
        col.objects.link(ob)
        me.materials.append(mat)
        return ob


def build_khunti(b):
    # Bamboo stick with node rings and a flat wooden spatula end.
    b.cyl(0.016, 0.014, -0.09, 0.30, BAMBOO)
    for z in (0.02, 0.16):
        b.cyl(0.018, 0.018, z, z + 0.012, BAMBOO_DARK)
    b.blade(0.07, 0.13, 0.30, 0.012, WOOD)


def build_khurpi(b):
    # Short handle, curved blade wrapped in a cloth bandage (the "quiet" tool).
    b.cyl(0.02, 0.018, -0.07, 0.11, WOOD)
    b.blade(0.06, 0.17, 0.11, 0.014, CLOTH, curve=0.04)
    b.cyl(0.026, 0.026, 0.10, 0.135, CLOTH)


def build_kodal(b):
    # Longer handle, a broad tin blade set at an angle (cartoon hoe).
    b.cyl(0.017, 0.015, -0.12, 0.38, WOOD)
    rot = Matrix.Rotation(math.radians(-62), 4, "X")
    b.box((0.16, 0.012, 0.12), (0.0, -0.05, 0.40), TIN, rot)
    b.cyl(0.024, 0.024, 0.36, 0.42, IRON)


def build_shabol(b):
    # Chunky iron digging bar with a big round knob: heavy-looking, comic.
    b.cyl(0.02, 0.02, -0.16, 0.50, IRON, seg=8)
    b.blade(0.05, 0.11, 0.50, 0.02, IRON)
    b.cyl(0.035, 0.035, -0.20, -0.15, KNOB, seg=8)


BUILDERS = {
    "Tool_bamboo-khunti": build_khunti,
    "Tool_soft-khurpi": build_khurpi,
    "Tool_tin-kodal": build_kodal,
    "Tool_iron-shabol": build_shabol,
}


def build_tools(arm):
    """Create the four tools, parented rigidly to hand_R at the fist (rest pose)."""
    col = bpy.data.collections.get("Thief_Props") or bpy.data.collections.new("Thief_Props")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    mat = props_material()
    bone = arm.data.bones["hand_R"]
    # Bone frame in armature space: Y = toward the fingers, Z = forward (align_roll), X = Y × Z.
    bm = arm.matrix_world @ bone.matrix_local
    yax = (bm.to_3x3() @ Vector((0, 1, 0))).normalized()
    zax = (bm.to_3x3() @ Vector((0, 0, 1))).normalized()
    xax = yax.cross(zax).normalized()
    head = bm.translation
    # Grip: inside the curled fist, a little toward the palm (the palm faces the thigh = +X for R).
    grip = head + yax * 0.062 + xax * 0.008
    # Tool space: +Z along the handle = the bone's forward axis; +Y = toward the fingers' back.
    frame = Matrix((
        (xax.x, yax.x, zax.x, grip.x),
        (xax.y, yax.y, zax.y, grip.y),
        (xax.z, yax.z, zax.z, grip.z),
        (0, 0, 0, 1),
    ))
    out = []
    for name in TOOLS:
        b = Builder()
        BUILDERS[name](b)
        ob = b.to_object(name, col, mat)
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = "hand_R"
        ob.matrix_world = frame
        out.append(ob)
    print("[props] tools:", ", ".join(f"{o.name} ({len(o.data.polygons)} faces)" for o in out))
    return out
