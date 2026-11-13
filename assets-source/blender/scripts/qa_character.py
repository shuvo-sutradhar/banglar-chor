"""
Sidhel Chor - automated character QA on the built .blend (no rendering):

1. Lungi clipping: for every clip, every 2nd frame, lungi long (tuck 0) and tucked (tuck 1), count
   leg vertices that should be under the cloth but end up outside it.
2. Foot sliding: for each locomotion clip, the speed of the planted foot's ball joint along the
   walking axis, compared with the clip's authored speed (in-place clips: a planted foot must move
   backward at exactly that speed).

    blender -b assets-source/blender/characters/thief.blend -P assets-source/blender/scripts/qa_character.py [-- --json out.json]
"""
import json
import math
import sys

import bpy
from mathutils.bvhtree import BVHTree


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


ob = bpy.data.objects["Thief"]
arm = bpy.data.objects["Thief_Rig"]
me = ob.data
part = [d.value for d in me.attributes["part"].data]
basis = me.shape_keys.key_blocks["Basis"]
tuck_kb = me.shape_keys.key_blocks["LungiTuck"]
rest = [basis.data[i].co.copy() for i in range(len(me.vertices))]
LUNGI_HEM = min(rest[i].z for i in range(len(rest)) if part[i] == 10)
lungi_polys = [p for p in me.polygons if all(part[v] == 10 for v in p.vertices) and min(rest[v].z for v in p.vertices) > LUNGI_HEM + 0.05]
legs = [i for i in range(len(rest)) if part[i] == 1 and 0.1 < rest[i].z < 0.86 and abs(rest[i].x) < 0.2]
sc = bpy.context.scene


def play(action):
    arm.animation_data.action = action
    try:
        arm.animation_data.action_slot = action.slots[0]
    except (AttributeError, IndexError):
        pass


def deformed():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    co = [v.co.copy() for v in m.vertices]
    ev.to_mesh_clear()
    return co


def clipping(action, tuck):
    tuck_kb.value = tuck
    a, b = (int(x) for x in action.frame_range)
    cover_z = 0.16 if tuck < 0.5 else 0.66
    worst = (0, None)
    total = 0
    frames = 0
    for f in range(a, b + 1, 2):
        sc.frame_set(f)
        co = deformed()
        verts = co
        polys = [[v for v in p.vertices] for p in lungi_polys]
        bvh = BVHTree.FromPolygons(verts, polys)
        n = 0
        for i in legs:
            if rest[i].z < cover_z:
                continue
            loc, nrm, _idx, dist = bvh.find_nearest(co[i])
            if loc is None:
                continue
            # Outward-facing cloth: a leg point in front of the surface is poking through.
            if (co[i] - loc).dot(nrm) > 0.004:
                n += 1
        total += n
        frames += 1
        if n > worst[0]:
            worst = (n, f)
    return {"worst_verts": worst[0], "worst_frame": worst[1], "mean_verts": round(total / max(frames, 1), 1)}


def sliding(action, speed):
    """Planted-foot speed error (m/s) for an in-place loop with authored `speed`."""
    a, b = (int(x) for x in action.frame_range)
    fps = sc.render.fps
    worst = 0.0
    errs = []
    for side in "LR":
        pts = []
        for f in range(a, b + 1):
            sc.frame_set(f)
            # The ball of the foot is the stance pivot in every gait (heel-toe walks and tiptoe).
            pts.append(arm.matrix_world @ arm.pose.bones[f"foot_{side}"].tail)
        zmin = min(q.z for q in pts)
        for i in range(len(pts) - 1):
            p0, p1 = pts[i], pts[i + 1]
            if max(p0.z, p1.z) < zmin + 0.004:  # on the ground on both frames
                vy = (p1.y - p0.y) * fps  # backward = +Y
                e = abs(vy - speed)
                errs.append(e)
                worst = max(worst, e)
    return {"planted_samples": len(errs), "max_err_ms": round(worst, 3), "mean_err_ms": round(sum(errs) / max(len(errs), 1), 3)}


report = {"leg_verts_checked": len(legs), "clipping": {}, "sliding": {}}
meta = json.loads(arm.get("sidhel", "{}")) if isinstance(arm.get("sidhel"), str) else {}
speeds = meta.get("clipSpeeds", {})
for act in sorted(bpy.data.actions, key=lambda a: a.name):
    play(act)
    report["clipping"][act.name] = {"long": clipping(act, 0.0), "tuck08": clipping(act, 0.8), "tucked": clipping(act, 1.0)}
    if act.name in speeds and act.name != "Crawl":
        report["sliding"][act.name] = sliding(act, speeds[act.name])
tuck_kb.value = 0.0
for k, v in report["clipping"].items():
    print(f"[qa] clip {k:18s} long worst {v['long']['worst_verts']:3d} (mean {v['long']['mean_verts']:5.1f})  tuck0.8 worst {v['tuck08']['worst_verts']:3d}  tucked worst {v['tucked']['worst_verts']:3d} (mean {v['tucked']['mean_verts']:5.1f})")
for k, v in report["sliding"].items():
    print(f"[qa] slide {k:12s} planted samples {v['planted_samples']:3d}  max err {v['max_err_ms']:.3f} m/s  mean {v['mean_err_ms']:.3f} m/s")
out = arg("--json")
if out:
    with open(out, "w") as fh:
        json.dump(report, fh, indent=2)
