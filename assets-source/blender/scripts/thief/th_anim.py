"""Sidhel Chor thief - animation library (docs/BLENDER_CHARACTER_SPEC.md §5).

Every clip is authored on the control rig (IK feet always, IK hands where a clip needs hands on
targets), sampled every frame at 30 fps, then baked with Blender's own NLA bake (visual keying) into
an FK action on the deform bones only. Locomotion is in place: during stance a foot moves backward
at exactly the clip's authored speed, which is what the game's speed-synced playback assumes (no
foot sliding). Loops end on the pose they start with.

Rotation convention used below: Euler degrees about the *armature* axes, applied in the parent's
frame. X+ pitches an up-pointing bone forward (a down-pointing bone backward), Y+ lowers the left
arm / tilts toward his left, Z+ turns toward his left. Right-side values are mirrored automatically.
"""
import math

import bpy
from mathutils import Euler, Matrix, Vector

import th_model as M
from th_common import clamp, smoothstep

FPS = 30
TAU = 2 * math.pi

# Clip registry: name -> (frames, loop, authored speed m/s or None, arm IK sides)
CLIPS = {}


def clip(name, frames, loop=True, speed=None, ik_arms=""):
    def deco(fn):
        CLIPS[name] = dict(frames=frames, loop=loop, speed=speed, ik=ik_arms, fn=fn)
        return fn
    return deco


# ------------------------------------------------------------------ math helpers
def seq(p, keys, loop=False):
    """Eased piecewise curve through (time 0..1, value) keys (smoothstep between keys)."""
    if loop:
        keys = list(keys) + [(1.0, keys[0][1])] if keys[-1][0] < 1.0 else keys
    if p <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if p <= t1:
            k = smoothstep(t0, t1, p)
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * k for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * k
    return keys[-1][1]


def wave(p, cycles=1.0, phase=0.0):
    return math.sin(TAU * (p * cycles + phase))


# Where a relaxed hanging left hand sits (arms lowered from the A-pose), for IK clips.
HANG = Vector((0.235, -0.05, 0.8))
ANKLE_FROM_BALL = M.LM["ankle_L"] - M.LM["ball_L"]
ANKLE_FROM_HEEL = M.LM["ankle_L"] - M.LM["heel_L"]


def foot_track(p, stance, stride, lift, heel_lift=30.0, strike=12.0, tiptoe=0.0, kick=0.0):
    """Foot state at phase p (0 = heel strike). Returns (fwd, up, pitch_deg, toe_deg, dy, dz).

    fwd/up: ankle position along the walking direction / height (before roll corrections);
    pitch: foot pitch (+ = toes down); toe: toe bend; dy/dz: ankle offset from rolling about the
    ball (heel lift) or heel (heel strike) so the contact point itself never slides.
    """
    roll = 0.0
    strike_a = 0.0
    if p < stance:
        s = p / stance
        fwd = stride / 2 - stride * s
        up = 0.0
        strike_a = -strike * (1 - smoothstep(0.0, 0.2, s))
        roll = heel_lift * smoothstep(0.55, 1.0, s)
    else:
        s = (p - stance) / (1 - stance)
        e = (1 - math.cos(math.pi * s)) / 2
        fwd = -stride / 2 + stride * e
        up = lift * math.sin(math.pi * min(1.0, s ** 0.85))
        roll = heel_lift * (1 - smoothstep(0.0, 0.45, s)) + kick * math.sin(math.pi * clamp(s * 1.6))
        strike_a = -strike * smoothstep(0.65, 1.0, s)
    roll += tiptoe
    # Ankle offsets: roll pivots about the ball, strike pivots about the heel.
    rb = Matrix.Rotation(math.radians(roll), 3, "X")
    off = rb @ ANKLE_FROM_BALL - ANKLE_FROM_BALL
    rh = Matrix.Rotation(math.radians(strike_a), 3, "X")
    off += rh @ ANKLE_FROM_HEEL - ANKLE_FROM_HEEL
    toe = -roll * (1.0 if p < stance else 0.4) + (12.0 * smoothstep(0.65, 1.0, (p - stance) / (1 - stance)) if p >= stance else 0.0)
    return fwd, up, roll + strike_a, toe, off.y, off.z


# ------------------------------------------------------------------ pose building
class Pose:
    def __init__(self):
        self.rot = {}
        self.loc = {}

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        a = self.rot.get(bone, (0.0, 0.0, 0.0))
        self.rot[bone] = (a[0] + x, a[1] + y, a[2] + z)
        return self

    def s(self, base, x=0.0, y=0.0, z=0.0, side=None):
        """Symmetric rotation (right side mirrored). side='L'/'R' for one side only."""
        for sd in (side,) if side else ("L", "R"):
            m = 1 if sd == "L" else -1
            self.r(f"{base}_{sd}", x, y * m, z * m)
        return self

    def l(self, bone, x=0.0, y=0.0, z=0.0):
        a = self.loc.get(bone, (0.0, 0.0, 0.0))
        self.loc[bone] = (a[0] + x, a[1] + y, a[2] + z)
        return self

    def ls(self, base, x=0.0, y=0.0, z=0.0, side=None):
        for sd in (side,) if side else ("L", "R"):
            m = 1 if sd == "L" else -1
            self.l(f"{base}_{sd}", x * m, y, z)
        return self

    # Feet: offsets from the rest ankle in the walking frame (fwd = toward -Y).
    def foot(self, sd, fwd=0.0, up=0.0, pitch=0.0, toe=0.0, out=0.0, yaw=0.0, dy=0.0, dz=0.0):
        m = 1 if sd == "L" else -1
        self.l(f"ik_foot_{sd}", out * m, -fwd + dy, up + dz)
        self.r(f"ik_foot_{sd}", pitch, 0.0, yaw * m)
        self.r(f"toe_{sd}", toe, 0.0, 0.0)
        return self

    def hand(self, sd, pos, rot=(0.0, 0.0, 0.0)):
        """Hand IK target at an absolute armature-space position (given for the left side)."""
        m = 1 if sd == "L" else -1
        p = Vector((pos[0] * m, pos[1], pos[2]))
        rest = M.LM[f"wrist_{sd}"]
        d = p - rest
        self.l(f"ik_hand_{sd}", d.x, d.y, d.z)
        self.r(f"ik_hand_{sd}", rot[0], rot[1] * m, rot[2] * m)
        return self

    def pole(self, kind, sd, x=0.0, y=0.0, z=0.0):
        self.ls(f"pole_{kind}", x, y, z, side=sd)
        return self


def apply(arm, pose):
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    for name, (x, y, z) in pose.rot.items():
        pb = arm.pose.bones[name]
        R = pb.bone.matrix_local.to_3x3()
        q = Euler((math.radians(x), math.radians(y), math.radians(z)), "XYZ").to_matrix()
        pb.rotation_quaternion = (R.inverted() @ q @ R).to_quaternion()
    for name, v in pose.loc.items():
        pb = arm.pose.bones[name]
        R = pb.bone.matrix_local.to_3x3()
        pb.location = R.inverted() @ Vector(v)


def key_all(arm, frame):
    for pb in arm.pose.bones:
        if pb.name == "root":
            continue
        pb.keyframe_insert("location", frame=frame, group=pb.name)
        pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)


# ------------------------------------------------------------------ shared posture
def stance_base(P, hunch=1.0, arms=True):
    P.r("spine", 6 * hunch).r("chest", 5 * hunch).r("neck", -5 * hunch).r("head", -4 * hunch)
    P.s("shoulder", 0, 0, -6 * hunch)
    if arms:
        P.s("upperarm", -5, 36, 0).s("forearm", -16, 0, 0).s("fingers", 0, 22, 0).s("thumb", 0, 10, 0)
    # His signature asymmetric brows: the left cocked, the right lowered (scheming).
    P.l("brow_L", 0, 0, 0.003).r("brow_L", 0, -4, 0)
    P.l("brow_R", 0, 0, -0.0015).r("brow_R", 0, -6, 0)


def face(P, kind):
    """Facial expression presets on top of the base brows."""
    if kind == "worried":
        P.l("brow_L", 0, 0, 0.006).r("brow_L", 0, 16, 0).l("brow_R", 0, 0, 0.007).r("brow_R", 0, 20, 0)
    elif kind == "shock":
        P.l("brow_L", 0, 0, 0.011).r("brow_L", 0, 10, 0).l("brow_R", 0, 0, 0.012).r("brow_R", 0, 12, 0).r("jaw", 20)
    elif kind == "smug":
        P.l("brow_L", 0, 0, 0.006).r("brow_L", 0, -6, 0).l("brow_R", 0, 0, -0.002).r("brow_R", 0, -8, 0)
    elif kind == "effort":
        P.l("brow_L", 0, 0, -0.003).r("brow_L", 0, -10, 0).l("brow_R", 0, 0, -0.003).r("brow_R", 0, -10, 0).r("jaw", 5)


def gait(P, p, stance, stride, lift, hip_drop, bob, sway, yaw, arm_swing, lean, high_at_stance=True, heel_lift=30,
         strike=12, tiptoe=0.0, kick=0.0, arms=True, cloth=1.0):
    """Biped locomotion cycle. Left foot strikes at p=0, right at p=0.5."""
    fl = foot_track(p % 1.0, stance, stride, lift, heel_lift, strike, tiptoe, kick)
    fr = foot_track((p + 0.5) % 1.0, stance, stride, lift, heel_lift, strike, tiptoe, kick)
    for sd, f in (("L", fl), ("R", fr)):
        P.foot(sd, fwd=f[0], up=f[1], pitch=f[2], toe=f[3], dy=f[4], dz=f[5], out=0.004, yaw=5)
    mid = stance / 2
    k = math.cos(2 * TAU * (p - mid))
    P.l("hips", sway * math.cos(TAU * (p - mid)), 0, hip_drop + (bob * k if high_at_stance else -bob * k))
    P.r("hips", 0, -3 * math.cos(TAU * (p - mid)), -yaw * math.cos(TAU * p))
    P.r("spine", lean * 0.55, 0, yaw * 0.5 * math.cos(TAU * p))
    P.r("chest", lean * 0.45, 1.5 * math.cos(TAU * (p - mid)), yaw * 0.9 * math.cos(TAU * p))
    P.r("neck", -lean * 0.5, 0, -yaw * 0.3 * math.cos(TAU * p))
    P.r("head", -lean * 0.45 - (bob * 60 * k if high_at_stance else 0), 0, 0)
    # Knee poles follow the pelvis so the knees track the toes.
    if arms:
        sw = math.cos(TAU * p)
        P.s("upperarm", arm_swing * sw, 0, 0, side="L").s("upperarm", -arm_swing * sw, 0, 0, side="R")
        P.s("forearm", -10 * max(0.0, -sw), 0, 0, side="L").s("forearm", -10 * max(0.0, sw), 0, 0, side="R")
    # Cloth secondary motion: the lungi panel swings after whichever thigh leads; the gamcha tail lags.
    lead = max(fl[0], fr[0], 0.0) / max(stride / 2, 1e-3)
    P.r("lungi_front", -10 * cloth * lead, 0, 0).r("lungi_back", 6 * cloth * (1 - lead), 0, 0)
    P.r("gamcha_tail", 4 * cloth * math.sin(2 * TAU * (p - mid) - 1.2), 0, 3 * math.sin(TAU * p))
    return fl, fr


# ------------------------------------------------------------------ the clips
@clip("Idle", 72)
def idle(P, p):
    stance_base(P, 1.2)
    P.foot("L", fwd=0.035, out=0.012, yaw=9).foot("R", fwd=-0.03, out=0.012, yaw=9)
    P.l("hips", 0.007 * wave(p), 0, -0.016 + 0.003 * wave(p, 2))
    P.r("hips", 0, 1.5 * wave(p), 0)
    P.r("chest", 1.6 * wave(p, 2, 0.1), -1.2 * wave(p), 0)
    # Shifty glances: hold, dart left, hold, dart right.
    yaw = seq(p, [(0, 0), (0.18, 0), (0.24, 24), (0.42, 24), (0.48, -4), (0.62, -4), (0.68, -20), (0.84, -20), (0.92, 0)], loop=True)
    P.r("head", 2 * wave(p, 2), 3, yaw).r("neck", 0, 0, yaw * 0.25)
    P.s("upperarm", 2.5 * wave(p, 1, 0.2), 0, 0)
    # Fingers drum (left hand) during the second half.
    P.s("fingers", 0, 12 * max(0.0, wave(p, 6)) * smoothstep(0.5, 0.6, p) * (1 - smoothstep(0.85, 0.95, p)), 0, side="L")
    # The eyebrow wiggle (twice) after the first glance.
    wig = max(0.0, wave(p, 8)) * smoothstep(0.26, 0.3, p) * (1 - smoothstep(0.36, 0.4, p))
    P.l("brow_L", 0, 0, 0.007 * wig).l("brow_R", 0, 0, 0.007 * wig)
    P.r("gamcha_tail", 1.5 * wave(p, 2), 0, 0)


@clip("Walk", 22, speed=1.5)
def walk(P, p):
    stance_base(P, 1.0)
    gait(P, p, stance=0.6, stride=1.5 * 22 / FPS * 0.6, lift=0.075, hip_drop=-0.045, bob=0.016, sway=0.012, yaw=7, arm_swing=24, lean=6)
    # A jaunty little head bob and swagger.
    P.r("head", 0, 3 * wave(p), 0)


@clip("Run", 16, speed=4.2)
def run(P, p):
    stance_base(P, 0.6, arms=False)
    gait(P, p, stance=0.34, stride=4.2 * 16 / FPS * 0.34, lift=0.2, hip_drop=-0.055, bob=0.028, sway=0.01, yaw=10, arm_swing=0, lean=20,
         high_at_stance=False, heel_lift=38, strike=8, kick=45, arms=False, cloth=1.6)
    sw = math.cos(TAU * p)
    # Pumping arms, elbows out a little (comic panic sprint), fists.
    P.s("upperarm", 42 * sw, 22, 0, side="L").s("upperarm", -42 * sw, 22, 0, side="R")
    P.s("forearm", -78 - 18 * sw, 0, 0, side="L").s("forearm", -78 + 18 * sw, 0, 0, side="R")
    P.s("hand", 10, 0, 0).s("fingers", 0, 75, 0).s("thumb", 0, 40, 0)
    face(P, "worried")
    P.r("jaw", 7 + 3 * wave(p, 2))


@clip("CrouchWalk", 32, speed=0.9)
def crouch_walk(P, p):
    stance_base(P, 0.5, arms=False)
    gait(P, p, stance=0.65, stride=0.9 * 32 / FPS * 0.65, lift=0.06, hip_drop=-0.3, bob=0.012, sway=0.016, yaw=6, arm_swing=0, lean=34,
         heel_lift=24, strike=6, arms=False, cloth=0.6)
    P.r("neck", -16).r("head", -12)
    sw = math.cos(TAU * p)
    # Sneaky claws held up in front of the chest.
    P.s("upperarm", -34 + 6 * sw, 18, 0, side="L").s("upperarm", -34 - 6 * sw, 18, 0, side="R")
    P.s("forearm", -78, 0, 0).s("hand", 28, 0, 0).s("fingers", 0, 34, 0).s("thumb", 0, 14, 0)
    P.s("shoulder", 0, -8, -8)
    face(P, "smug")


@clip("Sneak", 36, speed=1.1)
def sneak(P, p):
    stance_base(P, 0.8, arms=False)
    gait(P, p, stance=0.5, stride=1.1 * 36 / FPS * 0.5, lift=0.15, hip_drop=-0.05, bob=0.022, sway=0.014, yaw=5, arm_swing=0, lean=10,
         heel_lift=12, strike=0, tiptoe=26, arms=False, cloth=0.8)
    sw = math.cos(TAU * p)
    # Classic tiptoe: shoulders up, elbows bent, limp wrists in front of the chest.
    P.s("shoulder", 0, -12, -6)
    P.s("upperarm", -22 + 4 * sw, 14, 0, side="L").s("upperarm", -22 - 4 * sw, 14, 0, side="R")
    P.s("forearm", -96, 0, 0).s("hand", 42, 0, 0).s("fingers", 0, 20, 0)
    P.r("head", 0, 0, 14 * wave(p, 1, 0.1))
    face(P, "smug")


@clip("CrouchIdle", 60)
def crouch_idle(P, p):
    stance_base(P, 0.5, arms=False)
    P.foot("L", fwd=0.07, out=0.03, yaw=14).foot("R", fwd=-0.05, out=0.03, yaw=12, pitch=8, dz=0.01)
    P.l("hips", 0, 0.03, -0.31 + 0.004 * wave(p, 2))
    P.r("spine", 22).r("chest", 10 + 1.5 * wave(p, 2)).r("neck", -18).r("head", -10)
    yaw = seq(p, [(0, 0), (0.2, 0), (0.28, 28), (0.5, 28), (0.58, -22), (0.8, -22), (0.88, 0)], loop=True)
    P.r("head", 0, 0, yaw).r("neck", 0, 0, yaw * 0.3)
    P.s("upperarm", -38, 22, 0).s("forearm", -52, 0, 0).s("hand", 12, 0, 0).s("fingers", 0, 30, 0)
    face(P, "smug")


@clip("Interact", 24, ik_arms="LR")
def interact(P, p):
    """Digging the sidh (looped): crouched, scraping at the wall base with alternating hands."""
    stance_base(P, 0.5, arms=False)
    P.foot("L", fwd=0.08, out=0.04, yaw=12).foot("R", fwd=-0.06, out=0.04, yaw=10, pitch=10, dz=0.012)
    P.l("hips", 0, 0.04, -0.34 + 0.012 * wave(p, 2))
    P.r("spine", 30 + 4 * wave(p, 2)).r("chest", 14).r("neck", -12).r("head", -6)
    for sd, ph in (("L", 0.0), ("R", 0.5)):
        a = (p + ph) % 1.0
        reach = seq(a, [(0, 0.0), (0.35, 1.0), (0.55, 1.0), (1.0, 0.0)])
        dig = seq(a, [(0, 0.0), (0.35, 0.0), (0.55, 1.0), (1.0, 0.0)])
        P.hand(sd, (0.12, -0.32 - 0.16 * reach, 0.42 - 0.2 * reach - 0.06 * dig), (60 + 30 * dig, 0, 0))
        P.pole("elbow", sd, 0.25, 0.1, -0.1)
    P.s("fingers", 0, 40, 0)
    face(P, "effort")
    P.r("head", 0, 0, 4 * wave(p, 2))


@clip("Pickup", 18, loop=False, ik_arms="R")
def pickup(P, p):
    stance_base(P, 1.0, arms=False)
    P.s("upperarm", -5, 36, 0, side="L").s("forearm", -16, 0, 0, side="L")
    P.foot("L", fwd=0.06, out=0.02, yaw=8).foot("R", fwd=-0.05, out=0.02, yaw=8)
    bend = seq(p, [(0, 0.0), (0.4, 1.0), (0.55, 1.0), (1.0, 0.15)])
    grab = seq(p, [(0, 0.0), (0.45, 0.0), (0.55, 1.0), (1.0, 1.0)])
    lift = seq(p, [(0, 0.0), (0.55, 0.0), (1.0, 1.0)])
    P.l("hips", 0, 0.09 * bend, -0.33 * bend - 0.012)
    P.r("spine", 44 * bend).r("chest", 20 * bend).r("neck", -22 * bend).r("head", -8 * bend)
    ground = Vector((0.12, -0.4, 0.2))
    chest = Vector((0.05, -0.2, 1.08))
    rest = HANG
    pos = rest.lerp(ground, bend) if lift <= 0 else ground.lerp(chest, lift)
    P.hand("R", tuple(pos), (40 * bend + 50 * lift, 0, 0))
    P.pole("elbow", "R", 0.2, 0.2, 0)
    P.s("fingers", 0, 15 + 60 * grab, 0, side="R").s("thumb", 0, 10 + 40 * grab, 0, side="R")
    P.s("upperarm", 14 * bend, 4 * bend, 0, side="L")  # counterbalance
    face(P, "smug")


@clip("Carry", 22, speed=1.5, ik_arms="R")
def carry(P, p):
    stance_base(P, 1.4, arms=False)
    gait(P, p, stance=0.62, stride=1.5 * 22 / FPS * 0.62, lift=0.05, hip_drop=-0.07, bob=0.02, sway=0.016, yaw=5, arm_swing=0, lean=18,
         heel_lift=22, strike=8, arms=False)
    sw = math.cos(TAU * p)
    P.s("upperarm", 14 * sw, 36, 0, side="L").s("forearm", -18 - 6 * max(0.0, -sw), 0, 0, side="L")
    # Right hand over the shoulder gripping the sack (sack is on his back).
    bob = 0.01 * math.cos(2 * TAU * p)
    P.hand("R", (0.13, -0.06, 1.33 + bob), (-120, 0, 30))
    P.pole("elbow", "R", 0.25, -0.1, -0.4)
    P.s("fingers", 0, 85, 0, side="R").s("thumb", 0, 40, 0, side="R")
    P.s("shoulder", 0, -6, 0, side="R")
    face(P, "effort")


@clip("PreparationOil", 40, ik_arms="LR")
def prep_oil(P, p):
    """Rubbing mustard oil into the arms and chest, very pleased with himself."""
    stance_base(P, 0.6, arms=False)
    P.foot("L", fwd=0.03, out=0.02, yaw=10).foot("R", fwd=-0.03, out=0.02, yaw=10)
    P.l("hips", 0.01 * wave(p), 0, -0.02)
    a = TAU * p
    # Right hand rubs the left upper arm, left hand rubs the chest, in circles.
    P.hand("R", (-0.17 + 0.03 * math.cos(a), -0.08 + 0.015 * math.sin(a), 1.18 + 0.05 * math.sin(a)), (0, 0, -60))
    P.hand("L", (0.05 + 0.04 * math.cos(-a * 2), -0.14, 1.12 + 0.04 * math.sin(-a * 2)), (-20, 0, -70))
    P.pole("elbow", "L", 0.3, 0.2, -0.2).pole("elbow", "R", 0.0, 0.2, -0.3)
    P.s("fingers", 0, 6, 0)
    P.r("head", 6, 8, 12 + 4 * wave(p))
    face(P, "smug")
    P.l("brow_L", 0, 0, 0.004 * max(0.0, wave(p, 2)))


@clip("PreparationLungi", 30, ik_arms="LR")
def prep_lungi(P, p):
    """Bend, grab the hem, haul it up and tuck it at the waist (malkochha)."""
    stance_base(P, 0.8, arms=False)
    P.foot("L", fwd=0.05, out=0.05, yaw=14).foot("R", fwd=-0.04, out=0.05, yaw=14)
    bend = seq(p, [(0, 0.0), (0.28, 1.0), (0.4, 1.0), (0.62, 0.0), (1.0, 0.0)])
    up = seq(p, [(0, 0.0), (0.4, 0.0), (0.62, 1.0), (0.85, 1.0), (1.0, 0.0)])
    tuck = seq(p, [(0, 0.0), (0.62, 0.0), (0.72, 1.0), (0.82, 0.0), (1.0, 0.0)])
    P.l("hips", 0, 0.05 * bend, -0.2 * bend - 0.015 - 0.02 * tuck)
    P.r("spine", 32 * bend - 4 * up).r("chest", 12 * bend - 4 * up).r("neck", -16 * bend + 8 * up).r("head", -4 * bend + 10 * up)
    rest = HANG
    knee = Vector((0.17, -0.2, 0.42))
    waist = Vector((0.09, -0.18, 0.99 + 0.02 * tuck))
    for sd in "LR":
        pos = rest.lerp(knee, bend) if up <= 0 else knee.lerp(waist, up)
        P.hand(sd, tuple(pos), (50 * bend - 40 * up, 0, -30 * up))
        P.pole("elbow", sd, 0.25, 0.25, 0)
    P.s("fingers", 0, 20 + 60 * smoothstep(0.25, 0.32, p), 0)
    face(P, "effort")


@clip("PreparationGamcha", 30, ik_arms="LR")
def prep_gamcha(P, p):
    """Tying the gamcha round his head: hands behind the head, tugging the knot tight."""
    stance_base(P, 0.4, arms=False)
    P.foot("L", fwd=0.03, out=0.03, yaw=10).foot("R", fwd=-0.03, out=0.03, yaw=10)
    tug = seq(p, [(0, 0.0), (0.3, 0.0), (0.4, 1.0), (0.5, 0.0), (0.6, 1.0), (0.7, 0.0), (1.0, 0.0)])
    P.l("hips", 0, 0, -0.015)
    P.r("chest", -6).r("neck", 6 + 4 * tug).r("head", 4 + 3 * tug)
    for sd in "LR":
        P.hand(sd, (0.07 + 0.05 * tug, 0.1 + 0.02 * tug, 1.6), (-160, 0, 20))
        P.pole("elbow", sd, 0.6, -0.1, 0.25)
    P.s("shoulder", 0, -10, 0)
    P.s("fingers", 0, 55, 0)
    face(P, "effort")


@clip("Suspicious", 72, ik_arms="R")
def suspicious(P, p):
    """Looks round nervously, chin in hand, plotting."""
    stance_base(P, 1.4, arms=False)
    P.foot("L", fwd=0.04, out=0.03, yaw=10).foot("R", fwd=-0.04, out=0.03, yaw=10)
    P.l("hips", 0, 0.02, -0.07)
    yaw = seq(p, [(0, 0), (0.1, 0), (0.16, 34), (0.36, 34), (0.44, -32), (0.66, -32), (0.74, 6), (0.9, 6)], loop=True)
    P.r("chest", 0, 0, yaw * 0.25).r("neck", 0, 0, yaw * 0.25).r("head", 0, -3, yaw * 0.5)
    P.s("upperarm", -10, 34, 0, side="L").s("forearm", -40, 0, 0, side="L").s("fingers", 0, 30, 0, side="L")
    P.hand("R", (0.03, -0.17, 1.33), (-100, 0, 20))
    P.pole("elbow", "R", 0.1, 0.0, -0.3)
    P.s("fingers", 0, 40 + 20 * max(0.0, wave(p, 4)), 0, side="R")
    face(P, "smug")


@clip("Frightened", 24, loop=False, ik_arms="LR")
def frightened(P, p):
    """Startled: a little jump with hands flung up, then a cower."""
    stance_base(P, 0.6, arms=False)
    jump = seq(p, [(0, 0.0), (0.17, 1.0), (0.3, 0.0)])
    cower = seq(p, [(0, 0.0), (0.3, 0.0), (0.45, 1.0)])
    P.foot("L", fwd=0.02, out=0.02, up=0.07 * jump, pitch=20 * jump).foot("R", fwd=-0.02, out=0.02, up=0.07 * jump, pitch=20 * jump)
    P.l("hips", 0, 0.03 * cower, 0.08 * jump - 0.13 * cower)
    P.r("spine", -8 * jump + 22 * cower).r("chest", -6 * jump + 10 * cower).r("neck", 8 * jump - 6 * cower).r("head", -6 * jump + 6 * cower)
    up = Vector((0.33, -0.02, 1.78))
    chin = Vector((0.06, -0.2, 1.33))
    rest = HANG
    for sd in "LR":
        pos = rest.lerp(up, jump) if cower <= 0 else up.lerp(chin, cower)
        if p > 0.45:
            pos = chin + Vector((0, 0, 0.006 * math.sin(p * 90)))  # trembling
        P.hand(sd, tuple(pos), (-90 * cower, 0, 0))
        P.pole("elbow", sd, 0.1, 0.2 - 0.2 * cower, -0.2)
    P.s("shoulder", 0, -14 * cower, 0)
    P.s("fingers", 0, 5 + 40 * cower, 0)
    face(P, "shock")
    P.r("jaw", -10 * cower)


@clip("ChaseReaction", 18, loop=False, ik_arms="LR")
def chase_reaction(P, p):
    """'Uh-oh': looks back over his shoulder, then leans into a sprint."""
    stance_base(P, 0.6, arms=False)
    look = seq(p, [(0, 0.0), (0.3, 1.0), (0.6, 1.0), (0.85, 0.0)])
    go = seq(p, [(0, 0.0), (0.6, 0.0), (1.0, 1.0)])
    P.foot("L", fwd=0.05 + 0.05 * go, out=0.03).foot("R", fwd=-0.08 * go, out=0.03, pitch=25 * go, dz=0.03 * go)
    P.l("hips", 0, 0.0, -0.03 - 0.05 * go)
    P.r("spine", 4 + 12 * go, 0, 12 * look).r("chest", 4 * go, 0, 18 * look).r("neck", 0, 0, 18 * look).r("head", 4 * look, 0, 32 * look)
    for sd in "LR":
        P.hand(sd, (0.13, -0.17, 1.15 - 0.05 * go), (-80, 0, 0))
        P.pole("elbow", sd, 0.25, 0.25, 0)
    P.s("fingers", 0, 30 + 40 * go, 0)
    face(P, "shock")
    P.r("jaw", -12 * go)


@clip("Caught", 48, ik_arms="LR")
def caught(P, p):
    """Collared: hands up, knees knocking, sheepish grin, trying to look innocent."""
    stance_base(P, 0.8, arms=False)
    knock = 0.03 * wave(p, 4)
    P.foot("L", fwd=0.0, out=-0.02, yaw=-6).foot("R", fwd=0.01, out=-0.02, yaw=-6)
    P.pole("knee", "L", -0.35 + knock * 4, 0, 0).pole("knee", "R", -0.35 - knock * 4, 0, 0)
    P.l("hips", 0.006 * wave(p, 2), 0.0, -0.045 + 0.004 * wave(p, 4))
    P.r("spine", 4).r("chest", -2, 2 * wave(p, 2), 0).r("neck", 8).r("head", 8, 12 + 3 * wave(p, 1), 6)
    for sd, h in (("L", 0.0), ("R", 0.012)):
        P.hand(sd, (0.25, -0.04, 1.6 + h + 0.008 * wave(p, 4, 0.25 if sd == "R" else 0)), (-90, 0, 10))
        P.pole("elbow", sd, 0.35, 0.3, -0.3)
    P.s("shoulder", 0, -14, 0)
    P.s("fingers", 0, -6, 0).s("thumb", 0, -8, 0)
    face(P, "worried")


@clip("Celebrate", 45, loop=False, ik_arms="LR")
def celebrate(P, p):
    """A little hop and fist pump, then the proud pose: hand on hip, twirling the moustache."""
    stance_base(P, 0.4, arms=False)
    ant = seq(p, [(0, 0.0), (0.16, 1.0), (0.26, 0.0)])
    air = seq(p, [(0.16, 0.0), (0.3, 1.0), (0.42, 0.0)])
    pose = seq(p, [(0, 0.0), (0.42, 0.0), (0.6, 1.0)])
    P.foot("L", fwd=0.04, out=0.04, yaw=12, up=0.1 * air, pitch=25 * air).foot("R", fwd=-0.03, out=0.04, yaw=12, up=0.1 * air, pitch=25 * air)
    P.l("hips", 0, 0, -0.09 * ant + 0.1 * air - 0.01 * pose)
    P.r("spine", 12 * ant - 6 * air - 7 * pose).r("chest", 6 * ant - 8 * air - 9 * pose).r("neck", -4 * pose).r("head", -10 * air - 9 * pose, 0, 8 * pose)
    rest = HANG
    fist_up = Vector((0.2, -0.06, 1.95))
    hip = Vector((0.2, 0.0, 1.0))
    mous = Vector((0.13, -0.15, 1.43))
    twirl = TAU * smoothstep(0.62, 1.0, p) * 2.5
    tw = Vector((0.012 * math.cos(twirl), 0, 0.012 * math.sin(twirl))) * pose
    l_pos = rest.lerp(Vector((0.3, -0.04, 1.5)), air).lerp(hip, pose)
    r_pos = rest.lerp(fist_up, air).lerp(mous, pose) + tw
    P.hand("L", tuple(l_pos), (0, 0, -40 * pose))
    P.hand("R", tuple(r_pos), (-110 * pose - 20 * air, 0, 30 * pose))
    P.pole("elbow", "L", 0.4, 0.4 * pose, 0).pole("elbow", "R", 0.2, -0.2, -0.3 * pose)
    P.s("fingers", 0, 80 * air + 50 * pose, 0, side="L").s("fingers", 0, 80 * air + 25 * pose, 0, side="R")
    P.s("thumb", 0, 20, 0)
    face(P, "smug")
    P.r("jaw", 16 * air)
    P.l("brow_L", 0, 0, 0.006 * pose + 0.008 * air)


@clip("Crawl", 30, speed=0.6, ik_arms="LR")
def crawl(P, p):
    """Hands and knees through the sidh. Diagonal gait: left hand moves with the right knee."""
    stride = 0.6 * 30 / FPS * 0.75
    P.l("hips", 0.01 * wave(p), 0.06, -0.42 + 0.01 * wave(p, 2))
    P.r("hips", 62, 0, 4 * wave(p)).r("spine", 14, 0, -3 * wave(p)).r("chest", 6, 0, -4 * wave(p))
    P.r("neck", -38).r("head", -34)
    P.s("shoulder", 0, -6, -6)
    for sd, ph in (("L", 0.0), ("R", 0.5)):
        f = foot_track((p + ph) % 1.0, 0.75, stride, 0.035, heel_lift=0, strike=0)
        P.foot(sd, fwd=-0.42 + f[0], up=f[1] - 0.02, pitch=70, toe=-20, out=0.01)
        h = foot_track((p + ph + 0.5) % 1.0, 0.75, stride, 0.05, heel_lift=0, strike=0)
        P.hand(sd, (0.15, -0.54 - h[0], 0.07 + h[1]), (100, 0, 0))
        P.pole("elbow", sd, 0.2, 0.0, 0.2)
    P.s("fingers", 0, -6, 0)
    face(P, "effort")


# ------------------------------------------------------------------ authoring + bake
def _select_deform(arm):
    for b in arm.data.bones:
        sel = b.use_deform
        for obj in (b, arm.pose.bones[b.name]):
            if hasattr(obj, "select"):
                try:
                    obj.select = sel
                except AttributeError:
                    pass


def set_arm_ik(arm, sides):
    for sd in "LR":
        inf = 1.0 if sd in sides else 0.0
        arm.pose.bones[f"forearm_{sd}"].constraints["IK"].influence = inf
        arm.pose.bones[f"hand_{sd}"].constraints["HandRot"].influence = inf


def author(arm, name):
    spec = CLIPS[name]
    n = spec["frames"]
    ad = arm.animation_data_create()
    ctl = bpy.data.actions.new(f"ctl_{name}")
    ad.action = ctl
    set_arm_ik(arm, spec["ik"])
    for f in range(n + 1):
        P = Pose()
        spec["fn"](P, f / n)
        apply(arm, P)
        key_all(arm, f)
    # Bake the visual (constraint-evaluated) pose into FK keys on the deform bones only.
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    _select_deform(arm)
    bpy.ops.nla.bake(frame_start=0, frame_end=n, step=1, only_selected=True, visual_keying=True, clear_constraints=False,
                     clear_parents=False, use_current_action=False, clean_curves=False, bake_types={"POSE"})
    bpy.ops.object.mode_set(mode="OBJECT")
    baked = ad.action
    assert baked is not None and baked != ctl, "bake produced no action"
    baked.name = name
    baked.use_fake_user = True
    baked.use_frame_range = True
    baked.frame_start, baked.frame_end = 0, n
    baked.use_cyclic = spec["loop"]
    baked["sidhel_loop"] = spec["loop"]
    if spec["speed"]:
        baked["sidhel_speed"] = spec["speed"]
    ad.action = None
    bpy.data.actions.remove(ctl)
    return baked


def build_all(arm, only=None):
    bpy.context.scene.render.fps = FPS
    out = []
    for name in CLIPS:
        if only and name not in only:
            continue
        a = author(arm, name)
        out.append(a)
        print(f"[anim] {name}: {CLIPS[name]['frames']} frames ({CLIPS[name]['frames'] / FPS:.2f} s)")
    return out


def finalize(arm):
    """Drop the authoring controls: constraints and control bones (the clips are already baked)."""
    import th_rig as R
    for pb in arm.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for n in R.CONTROLS:
        eb = arm.data.edit_bones.get(n)
        if eb:
            arm.data.edit_bones.remove(eb)
    bpy.ops.object.mode_set(mode="OBJECT")
    # Clear the rest pose.
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    arm.animation_data.action = None
    # Stash every clip on a muted NLA track so they stay with the armature (and export).
    for t in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(t)
    for name in CLIPS:
        act = bpy.data.actions.get(name)
        if act is None:
            continue
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        tr.mute = True
    speeds = {n: c["speed"] for n, c in CLIPS.items() if c["speed"]}
    import json
    arm["sidhel"] = json.dumps({"version": 2, "clipSpeeds": speeds, "generator": "Blender build_thief.py (Phase 4A)"})
