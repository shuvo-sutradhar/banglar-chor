"""
Sidhel Chor - turn the code-generated placeholder GLB into an editable .blend starting point for an
artist: correct skeleton names, scale, forward axis and clip names already set up.

    blender -b -P assets-source/blender/scripts/import_placeholder.py -- \
        --glb public/assets/models/characters/thief_placeholder.glb \
        --out assets-source/blender/characters/thief_placeholder.blend

UNVERIFIED: written without access to Blender (see docs/BLENDER_ASSET_PIPELINE.md).
"""
import sys

import bpy


def arg(name, default=None):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(name) + 1] if name in argv else default


glb = arg("--glb", "public/assets/models/characters/thief_placeholder.glb")
out = arg("--out", "assets-source/blender/characters/thief_placeholder.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
bpy.context.scene.render.fps = 30
bpy.ops.wm.save_as_mainfile(filepath=out)
print("saved", out)
