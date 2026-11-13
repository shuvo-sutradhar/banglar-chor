"""Sidhel Chor thief - skin paint, bake-source materials, UV atlases, Cycles bake, final materials."""
import os

import bpy
from mathutils import Vector

from th_common import gauss, smoothstep, srgb
from th_paint import _mix, _ramp, _sock

SKIN_GROUP = {"src_skin", "src_lid", "src_hair", "src_brow", "src_eye_L", "src_eye_R", "src_mouth", "src_teeth", "src_tabiz"}
CLOTH_GROUP = {"src_lungi", "src_gamcha", "src_headband"}


def _lin(h):
    return Vector(srgb(h))


# ====================================================================== skin paint (vertex colours)
def paint_skin(mesh):
    """Per-vertex skin paint used as the bake source: blush, stubble, palms/soles, lash line."""
    import th_model as M
    import th_rig as R

    me = mesh.data
    part = [d.value for d in me.attributes["part"].data]
    basis = me.shape_keys.key_blocks["Basis"].data if me.shape_keys else None
    attr = me.color_attributes.get("paint") or me.color_attributes.new("paint", "FLOAT_COLOR", "POINT")
    skin, blush, stub = _lin("#9a6142"), _lin("#ad5038"), _lin("#4a3a38")
    light, dark, lash = _lin("#c08a6c"), _lin("#7a4a32"), _lin("#1d1310")
    lidc = _lin("#865037")
    cos = [(basis[i].co if basis else v.co).copy() for i, v in enumerate(me.vertices)]
    cols = []
    for i, v in enumerate(me.vertices):
        co = cos[i]
        n = v.normal
        c = skin.copy()
        pid = part[i]
        if pid in (2, 5):
            u, vv, w = R.head_local(co)
            b = 0.35 * gauss(abs(u) - 0.6, 0.22) * gauss(vv + 0.65, 0.3) * gauss(w + 0.12, 0.2)
            b += 0.4 * smoothstep(-1.05, -1.3, vv)  # nose tip
            b += 0.22 * smoothstep(1.0, 1.15, abs(u))  # ears
            c = c.lerp(blush, min(b, 0.55))
            s = smoothstep(-0.2, -0.45, w) * smoothstep(0.35, -0.1, vv) * (1 - smoothstep(1.0, 1.08, abs(u)))
            s = max(s, 0.8 * gauss(w + 0.62, 0.12) * gauss(u, 0.45) * smoothstep(-0.6, -0.95, vv))
            c = c.lerp(stub, 0.42 * s)
            if pid == 5:
                c = lidc.copy()
        elif pid == 1:
            x, y, z = co
            for sd, k in (("L", 1), ("R", -1)):
                wr = M.LM[f"wrist_{sd}"]
                if (co - wr).length < 0.2 and abs(x) > 0.45:
                    palm = Vector((-k, 0, -0.4)).normalized()
                    c = c.lerp(light, 0.55 * smoothstep(0.1, 0.6, n.dot(palm)))
            if z < 0.06:
                c = c.lerp(light, 0.6 * smoothstep(-0.2, -0.7, n.z))
            for k, sd in ((1, "L"), (-1, "R")):
                c = c.lerp(dark, 0.8 * gauss((co - Vector((0.066 * k, -0.095, 1.19))).length, 0.009) * smoothstep(0.0, -0.05, y))
                c = c.lerp(dark, 0.3 * gauss((co - (M.LM[f"knee_{sd}"] + Vector((0, -0.04, 0)))).length, 0.04))
                c = c.lerp(dark, 0.3 * gauss((co - M.LM[f"elbow_{sd}"]).length, 0.04))
        cols.append(c)
    # Lash line: lid vertices on the rolled rim (closest to the eyeball) go dark.
    for side in "LR":
        ec = mesh.get(f"eye_center_{side}")
        er = mesh.get(f"eye_radius_{side}")
        if ec is None:
            continue
        ec = Vector(ec)
        for i in range(len(cos)):
            if part[i] == 5 and (cos[i] - ec).length < er * 1.06 and cos[i].z < ec.z + er * 0.75:
                cols[i] = cols[i].lerp(lash, 0.92)
    flat = []
    for c in cols:
        flat += [c.x, c.y, c.z, 1.0]
    attr.data.foreach_set("color", flat)


# ====================================================================== bake-source materials
def _clear(m):
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL"):
            nt.nodes.remove(n)
    return nt, nt.nodes["Principled BSDF"]


def _math(nt, op, a, b=None, c=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def _band(nt, f, lo, hi, soft=0.006):
    return _math(nt, "SUBTRACT", _ramp(nt, f, lo - soft, lo + soft), _ramp(nt, f, hi - soft, hi + soft))


def _plaid_axis(nt, coord, period, base, bands):
    f = _math(nt, "FRACT", _math(nt, "DIVIDE", coord, period))
    col = None
    for lo, hi, hexc in bands:
        col = _mix(nt, _band(nt, f, lo, hi), base if col is None else col, _lin(hexc).to_tuple())
    return col


def _shade(nt, col, noise, scale):
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Object"], nz.inputs["Vector"])
    sh = _math(nt, "MULTIPLY_ADD", nz.outputs["Fac"], noise * 2, 1 - noise)
    cr = nt.nodes.new("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        nt.links.new(sh, cr.inputs[k])
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    _sock(mul, "Factor_Float").default_value = 1.0
    nt.links.new(col, _sock(mul, "A_Color"))
    nt.links.new(cr.outputs[0], _sock(mul, "B_Color"))
    return _sock(mul, "Result_Color", out=True)


def plaid_material(m, period, base, bands, rough=0.9, noise=0.06):
    nt, bsdf = _clear(m)
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "pattern"
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uvn.outputs["UV"], sep.inputs[0])
    b = _lin(base).to_tuple()
    cu = _plaid_axis(nt, sep.outputs["X"], period, b, bands)
    cv = _plaid_axis(nt, sep.outputs["Y"], period, b, bands)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    _sock(mix, "Factor_Float").default_value = 0.5
    nt.links.new(cu, _sock(mix, "A_Color"))
    nt.links.new(cv, _sock(mix, "B_Color"))
    nt.links.new(_shade(nt, _sock(mix, "Result_Color", out=True), noise, 900.0), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough


def attr_material(m, rough, noise=0.05, scale=220.0):
    nt, bsdf = _clear(m)
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "paint"
    nt.links.new(_shade(nt, ca.outputs["Color"], noise, scale), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough


def hair_material(m):
    nt, bsdf = _clear(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wv = nt.nodes.new("ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "X"
    wv.inputs["Scale"].default_value = 70.0
    wv.inputs["Distortion"].default_value = 4.0
    wv.inputs["Detail"].default_value = 3.0
    nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
    c = _mix(nt, _ramp(nt, wv.outputs["Fac"], 0.3, 0.95), _lin("#120d0b").to_tuple(), _lin("#3a2a22").to_tuple())
    nt.links.new(c, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.34


def setup_sources():
    mats = bpy.data.materials
    attr_material(mats["src_skin"], 0.68)
    attr_material(mats["src_lid"], 0.68)
    hair_material(mats["src_hair"])
    # Lungi: indigo with maroon bands and cream double lines (a common village check).
    plaid_material(mats["src_lungi"], 0.15, "#24326c", [(0.0, 0.2, "#6f1d2a"), (0.205, 0.215, "#e6d8b8"), (0.48, 0.51, "#e6d8b8"),
                                                        (0.55, 0.565, "#121528"), (0.75, 0.78, "#3d5aa8")])
    # Gamcha: red-and-white checks.
    plaid_material(mats["src_gamcha"], 0.05, "#bf3227", [(0.0, 0.16, "#efe6d4"), (0.3, 0.33, "#efe6d4"), (0.6, 0.62, "#5a1410")], noise=0.08)
    plaid_material(mats["src_headband"], 0.045, "#2c7436", [(0.0, 0.14, "#e8e0c4"), (0.4, 0.43, "#d8b03a"), (0.7, 0.72, "#123a1a")], noise=0.08)


# ====================================================================== UVs
def _select_group(obj, names):
    idx = {i for i, m in enumerate(obj.data.materials) if m and m.name in names}
    for p in obj.data.polygons:
        p.select = p.material_index in idx


def unwrap(objs, head_boost=2.0, eye_boost=3.0):
    """Two atlases (skin group, cloth group), each packed into its own 0..1 square. The face and
    eyes get extra texel density before packing."""
    import bmesh
    from bpy_extras import bmesh_utils

    for o in objs:
        if "UVMap" not in o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        o.data.uv_layers.active = o.data.uv_layers["UVMap"]
        o.data.uv_layers["UVMap"].active_render = True
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for group, boost in ((SKIN_GROUP, True), (CLOTH_GROUP, False)):
        bpy.ops.object.mode_set(mode="OBJECT")
        for o in objs:
            _select_group(o, group)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_mode(type="FACE")
        bpy.ops.uv.smart_project(angle_limit=0.75 if boost else 1.15, island_margin=0.003, scale_to_bounds=False)
        if boost:
            bpy.ops.uv.select_all(action="SELECT")
            bpy.ops.uv.average_islands_scale()  # uniform texel density first, then favour the face
            for o in objs:
                bm = bmesh.from_edit_mesh(o.data)
                uvl = bm.loops.layers.uv["UVMap"]
                part = bm.verts.layers.int.get("part")
                if part is None:
                    continue
                for isl in bmesh_utils.bmesh_linked_uv_islands(bm, uvl):
                    isl = [f for f in isl if f.select]
                    if not isl:
                        continue
                    pids = {v[part] for f in isl for v in f.verts}
                    k = eye_boost if 4 in pids else head_boost if pids & {2, 3, 5, 6, 7} else 1.0
                    if k == 1.0:
                        continue
                    loops = [lp for f in isl for lp in f.loops]
                    c = sum((lp[uvl].uv for lp in loops), Vector((0, 0))) / len(loops)
                    for lp in loops:
                        lp[uvl].uv = c + (lp[uvl].uv - c) * k
                bmesh.update_edit_mesh(o.data)
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.003, shape_method="CONCAVE", margin_method="FRACTION")
    bpy.ops.object.mode_set(mode="OBJECT")


# ====================================================================== bake
def _image(name, size):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    return bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)


def _set_target(img, names):
    for m in bpy.data.materials:
        if m.name not in names or not m.use_nodes:
            continue
        nt = m.node_tree
        n = nt.nodes.get("__bake__") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "__bake__"
        n.image = img
        nt.nodes.active = n


def bake(objs, size=1024, samples=24):
    import numpy as np

    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    arm = bpy.data.objects.get("Thief_Rig")
    if arm:
        arm.data.pose_position = "REST"
    for o in objs:
        if o.data.shape_keys:
            for kb in o.data.shape_keys.key_blocks[1:]:
                kb.value = 0.0
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    out = {}
    for tag, group in (("Skin", SKIN_GROUP), ("Cloth", CLOTH_GROUP)):
        col = _image(f"tmp_{tag}_col", size)
        _set_target(col, group)
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8)
        ao = _image(f"tmp_{tag}_ao", size)
        _set_target(ao, group)
        bpy.ops.object.bake(type="AO", margin=8)
        hs = size // 2
        rough = None
        if tag == "Skin":  # cloth roughness is a constant 0.9: no map (saves a texture and ~1.4 MB GPU)
            rough = _image(f"tmp_{tag}_rough", hs)
            _set_target(rough, group)
            bpy.ops.object.bake(type="ROUGHNESS", margin=8)
        c = np.array(col.pixels[:]).reshape(size, size, 4)
        a = np.array(ao.pixels[:]).reshape(size, size, 4)[..., :1]
        floor = 0.55 if tag == "Skin" else 0.5
        c[..., :3] *= floor + (1 - floor) * a
        base = _image(f"Thief_{tag}_BaseColor", size)
        base.pixels.foreach_set(c.astype(np.float32).ravel())
        ormi = None
        if rough is not None:
            r = np.array(rough.pixels[:]).reshape(hs, hs, 4)
            # glTF metallicRoughness: G = roughness relative to the runtime factor (0.72), B = metal 0.
            orm = np.ones_like(r)
            orm[..., 1] = np.clip(r[..., 0] / 0.72, 0.05, 1.0)
            orm[..., 2] = 0.0
            ormi = _image(f"Thief_{tag}_ORM", hs)
            ormi.colorspace_settings.name = "Non-Color"
            ormi.pixels.foreach_set(orm.astype(np.float32).ravel())
        for img in (col, ao, rough):
            if img is not None:
                bpy.data.images.remove(img)
        out[tag] = (base, ormi)
        print(f"[bake] {tag}: base {size}^2" + (f", ORM {hs}^2" if ormi is not None else ", constant roughness"))
    if arm:
        arm.data.pose_position = "POSE"
    return out


def final_materials(objs, images, tex_dir):
    """Replace every bake source with the two runtime materials Thief_Skin / Thief_Cloth."""
    os.makedirs(tex_dir, exist_ok=True)
    mats = {}
    for tag, (base, orm) in images.items():
        for img in (base, orm):
            if img is None:
                continue
            img.filepath_raw = os.path.join(tex_dir, img.name + ".png")
            img.file_format = "PNG"
            img.save()
            img.pack()
        m = bpy.data.materials.get(f"Thief_{tag}") or bpy.data.materials.new(f"Thief_{tag}")
        nt, bsdf = _clear(m)
        tb = nt.nodes.new("ShaderNodeTexImage")
        tb.image = base
        nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 0.0
        if orm is not None:
            to = nt.nodes.new("ShaderNodeTexImage")
            to.image = orm
            sep = nt.nodes.new("ShaderNodeSeparateColor")
            nt.links.new(to.outputs["Color"], sep.inputs[0])
            nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
            nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        else:
            bsdf.inputs["Roughness"].default_value = 0.9
        m.use_backface_culling = tag == "Skin"
        mats[tag] = m
    for o in objs:
        old = [m.name if m else "" for m in o.data.materials]
        tags = sorted({("Skin" if n in SKIN_GROUP else "Cloth") for n in old})
        new_idx = {t: i for i, t in enumerate(tags)}
        remap = [new_idx["Skin" if n in SKIN_GROUP else "Cloth"] for n in old]
        mi = [p.material_index for p in o.data.polygons]
        o.data.materials.clear()
        for t in tags:
            o.data.materials.append(mats[t])
        for p, i in zip(o.data.polygons, mi):
            p.material_index = remap[i]
        if "pattern" in o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers["pattern"])
    for m in list(bpy.data.materials):
        if m.name.startswith("src_") and m.users == 0:
            bpy.data.materials.remove(m)
    return mats
