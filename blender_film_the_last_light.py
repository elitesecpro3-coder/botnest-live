"""
╔══════════════════════════════════════════════════════════════════════════╗
║              "THE LAST LIGHT" — Cinematic Short Film                    ║
║         Blender Python Script | Frame 1 → 300 | 24fps = 12.5s          ║
║                                                                          ║
║  STORY: A lone astronaut on a desolate alien world looks up at the      ║
║  dying sun... and in the last light, reaches out to the cosmos.         ║
║                                                                          ║
║  SHOTS:                                                                  ║
║    F001-060  ESTABLISHING SHOT  — Wide barren landscape                  ║
║    F061-120  MEDIUM SHOT        — Character isolation                    ║
║    F121-180  CLOSE-UP           — Helmet visor / emotional intensity     ║
║    F181-240  TRACKING ORBIT     — Character reaching to the sky          ║
║    F241-300  FINAL EPIC SHOT    — Pull back, light beam, silhouette      ║
╚══════════════════════════════════════════════════════════════════════════╝

HOW TO RUN:
  1. Open Blender (3.6+ or 4.x)
  2. Switch to "Scripting" workspace (top tab)
  3. Click "New" to create a new text block
  4. Paste this entire script
  5. Click "Run Script" (▶) or press Alt+P
  6. Press SPACEBAR in 3D Viewport to preview
  7. Ctrl+F12 to render animation

RENDER SETTINGS (already set by script, but FYI):
  - Engine: Cycles | Samples: 64 + Denoising
  - Resolution: 1920×1080
  - FPS: 24 | Frames: 300
  - Motion Blur: ON | Depth of Field: ON
"""

import bpy
import math
from mathutils import Vector, Euler


# ═══════════════════════════════════════════════════════════
#  UTILITIES
# ═══════════════════════════════════════════════════════════

def clear_scene():
    """Remove all default objects and orphan data."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.lights:
        bpy.data.lights.remove(block)
    for block in bpy.data.cameras:
        bpy.data.cameras.remove(block)
    for block in bpy.data.curves:
        bpy.data.curves.remove(block)


def smooth_keyframes(obj, interp='BEZIER'):
    """Set BEZIER interpolation on all keyframes of an object."""
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = interp
                kp.easing = 'AUTO'


def smooth_data_keyframes(data_block, interp='BEZIER'):
    """Set BEZIER interpolation on a data block (camera.data, light.data, etc.)."""
    if data_block.animation_data and data_block.animation_data.action:
        for fc in data_block.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = interp


def make_material(name, base_color, roughness=0.7, metallic=0.0,
                  emission_color=None, emission_strength=0.0,
                  alpha=1.0, transmission=0.0):
    """Quick Principled BSDF material factory."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (0, 0)

    # Core PBR inputs (handle both Blender 3.x and 4.x naming)
    bsdf.inputs['Base Color'].default_value = (*base_color, alpha)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic

    # Transmission (glass)
    for key in ('Transmission', 'Transmission Weight'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = transmission
            break

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (300, 0)

    if emission_color and emission_strength > 0:
        mix = nodes.new('ShaderNodeMixShader')
        mix.location = (200, 0)
        mix.inputs['Fac'].default_value = 0.3

        emit = nodes.new('ShaderNodeEmission')
        emit.location = (-200, -100)
        emit.inputs['Color'].default_value = (*emission_color, 1.0)
        emit.inputs['Strength'].default_value = emission_strength

        links.new(bsdf.outputs['BSDF'], mix.inputs[1])
        links.new(emit.outputs['Emission'], mix.inputs[2])
        links.new(mix.outputs['Shader'], output.inputs['Surface'])
    else:
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    if alpha < 1.0:
        mat.blend_method = 'BLEND'

    return mat


def emission_material(name, color, strength=3.0):
    """Pure emission material (for stars, titles, glow)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (*color, 1.0)
    emit.inputs['Strength'].default_value = strength

    output = nodes.new('ShaderNodeOutputMaterial')
    links.new(emit.outputs['Emission'], output.inputs['Surface'])
    return mat


# ═══════════════════════════════════════════════════════════
#  RENDER SETTINGS
# ═══════════════════════════════════════════════════════════

def setup_render():
    """Configure Cycles render for cinematic quality (balanced speed)."""
    scene = bpy.context.scene
    rd = scene.render

    # Engine
    rd.engine = 'CYCLES'
    scene.cycles.device = 'GPU'          # falls back to CPU automatically
    scene.cycles.samples = 64
    scene.cycles.preview_samples = 16
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'

    # Output
    rd.resolution_x = 1920
    rd.resolution_y = 1080
    rd.resolution_percentage = 100
    rd.fps = 24
    rd.fps_base = 1.0

    # Timeline
    scene.frame_start = 1
    scene.frame_end = 300
    scene.frame_current = 1

    # Motion blur (subtle, cinematic)
    rd.use_motion_blur = True
    scene.cycles.motion_blur_position = 'CENTER'
    scene.cycles.rolling_shutter_type = 'NONE'

    # Output format
    rd.image_settings.file_format = 'FFMPEG'
    rd.ffmpeg.format = 'MPEG4'
    rd.ffmpeg.codec = 'H264'
    rd.ffmpeg.constant_rate_factor = 'MEDIUM'
    rd.ffmpeg.audio_codec = 'NONE'
    rd.filepath = "//the_last_light_render"

    print("  ✓ Render settings: Cycles 1080p @ 24fps, 64 samples + OIDN")


# ═══════════════════════════════════════════════════════════
#  WORLD / SKY
# ═══════════════════════════════════════════════════════════

def setup_world():
    """Dark alien sky with faint nebula tint."""
    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True

    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    bg = nodes.new('ShaderNodeBackground')
    bg.location = (0, 0)
    bg.inputs['Color'].default_value = (0.01, 0.015, 0.04, 1.0)  # Deep space blue
    bg.inputs['Strength'].default_value = 0.8

    output = nodes.new('ShaderNodeOutputWorld')
    output.location = (300, 0)
    links.new(bg.outputs['Background'], output.inputs['Surface'])

    print("  ✓ World: deep space atmosphere")


# ═══════════════════════════════════════════════════════════
#  ENVIRONMENT: GROUND + ROCKS + PLANET + STARS
# ═══════════════════════════════════════════════════════════

def create_ground():
    """Barren alien desert with subtle displacement feel."""
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "Ground"

    mat = make_material("GroundMat",
                        base_color=(0.14, 0.10, 0.07),
                        roughness=0.95)
    ground.data.materials.append(mat)

    # Subdivide for potential displacement
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.subdivide(number_cuts=8)
    bpy.ops.object.mode_set(mode='OBJECT')

    return ground


def create_rocks():
    """Scatter realistic rocks across the landscape."""
    rock_data = [
        # (x, y, z_offset, scale_x, scale_y, scale_z, rot_z_deg)
        (-3.5, 2.2,  0, 0.6, 0.4, 0.5,  25),
        ( 5.0,-1.5,  0, 0.9, 0.7, 0.6,  70),
        (-6.0,-3.0,  0, 1.2, 0.9, 0.7, 110),
        ( 2.5, 5.0,  0, 0.5, 0.4, 0.4,  15),
        ( 7.5, 3.0,  0, 1.5, 1.0, 0.8, 200),
        (-1.5,-6.0,  0, 0.7, 0.5, 0.5,  90),
        ( 9.0,-4.5,  0, 1.0, 0.8, 0.7, 140),
        (-8.0, 1.0,  0, 1.8, 1.2, 1.0,  55),
        ( 3.5,-8.0,  0, 0.6, 0.5, 0.4, 170),
        (-4.0, 7.0,  0, 1.1, 0.8, 0.6,  30),
    ]

    rock_mat = make_material("RockMat",
                             base_color=(0.18, 0.15, 0.12),
                             roughness=0.92, metallic=0.05)

    for i, (x, y, z, sx, sy, sz, rz) in enumerate(rock_data):
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=0.4,
            location=(x, y, sz * 0.4)
        )
        rock = bpy.context.active_object
        rock.name = f"Rock_{i:02d}"
        rock.scale = (sx, sy, sz)
        rock.rotation_euler = Euler((
            math.radians(rz * 0.3),
            math.radians(rz * 0.2),
            math.radians(rz)
        ), 'XYZ')
        rock.data.materials.append(rock_mat)

    print("  ✓ Rocks: 10 scattered boulders")


def create_distant_planet():
    """Large glowing planet on the horizon."""
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=12,
        location=(25, 35, 18),
        segments=32,
        ring_count=16
    )
    planet = bpy.context.active_object
    planet.name = "DistantPlanet"

    mat = make_material("PlanetMat",
                        base_color=(0.55, 0.25, 0.08),
                        roughness=0.65,
                        emission_color=(0.9, 0.45, 0.1),
                        emission_strength=0.8)
    planet.data.materials.append(mat)
    return planet


def create_stars():
    """Sprinkle 80 glowing stars across the sky dome."""
    import random
    rng = random.Random(2024)

    star_mat = emission_material("StarMat", (1.0, 0.95, 0.88), strength=8.0)
    star_mat_blue = emission_material("StarBlueMat", (0.7, 0.85, 1.0), strength=6.0)

    for i in range(80):
        angle = rng.uniform(0, math.tau)
        radius = rng.uniform(18, 45)
        height = rng.uniform(4, 40)
        size = rng.uniform(0.03, 0.12)

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=size,
            location=(math.cos(angle) * radius,
                      math.sin(angle) * radius,
                      height),
            segments=4,
            ring_count=4
        )
        star = bpy.context.active_object
        star.name = f"Star_{i:02d}"
        star.data.materials.append(star_mat if rng.random() > 0.3 else star_mat_blue)

    print("  ✓ Stars: 80 procedural stars")


# ═══════════════════════════════════════════════════════════
#  CHARACTER — ASTRONAUT (built from primitives)
# ═══════════════════════════════════════════════════════════

def create_character():
    """
    Build a stylised astronaut from Blender primitives.
    Hierarchy: Body (root) → Head, Arms, Legs, Backpack
    Character stands ~2.1u tall at origin.
    """
    parts = []

    # ── SUIT MATERIALS ──────────────────────────────────────
    suit_mat = make_material("SuitMat",
                             base_color=(0.88, 0.87, 0.82),
                             roughness=0.35, metallic=0.15)

    helmet_mat = make_material("HelmetMat",
                               base_color=(0.92, 0.91, 0.88),
                               roughness=0.2, metallic=0.4)

    visor_mat = make_material("VisorMat",
                              base_color=(0.15, 0.35, 0.75),
                              roughness=0.05, metallic=0.9,
                              emission_color=(0.3, 0.6, 1.0),
                              emission_strength=0.5)

    joint_mat = make_material("JointMat",
                              base_color=(0.6, 0.6, 0.6),
                              roughness=0.3, metallic=0.7)

    def add_part(prim_op, name, material, **kwargs):
        prim_op(**kwargs)
        obj = bpy.context.active_object
        obj.name = name
        obj.data.materials.append(material)
        parts.append(obj)
        return obj

    # ── TORSO ───────────────────────────────────────────────
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.28, depth=0.75, location=(0, 0, 1.15))
    torso = bpy.context.active_object
    torso.name = "Char_Torso"
    torso.data.materials.append(suit_mat)
    parts.append(torso)

    # ── CHEST DETAIL (subtle panel) ─────────────────────────
    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0, 0.29, 1.2))
    chest = bpy.context.active_object
    chest.name = "Char_ChestPanel"
    chest.scale = (0.7, 0.15, 0.55)
    chest.data.materials.append(joint_mat)
    parts.append(chest)
    chest.parent = torso

    # ── HELMET ──────────────────────────────────────────────
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.24, location=(0, 0, 1.82), segments=16, ring_count=12)
    helmet = bpy.context.active_object
    helmet.name = "Char_Helmet"
    helmet.data.materials.append(helmet_mat)
    parts.append(helmet)
    helmet.parent = torso

    # ── VISOR (flattened sphere on front of helmet) ─────────
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=0.18, location=(0, 0.12, 1.82), segments=12, ring_count=10)
    visor = bpy.context.active_object
    visor.name = "Char_Visor"
    visor.scale = (0.85, 0.55, 0.7)
    visor.data.materials.append(visor_mat)
    parts.append(visor)
    visor.parent = torso

    # ── NECK RING ───────────────────────────────────────────
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.16, depth=0.1, location=(0, 0, 1.59))
    neck = bpy.context.active_object
    neck.name = "Char_Neck"
    neck.data.materials.append(joint_mat)
    parts.append(neck)
    neck.parent = torso

    # ── SHOULDER PADS ───────────────────────────────────────
    for side, x in [("L", -0.35), ("R", 0.35)]:
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.14, location=(x, 0, 1.45), segments=8, ring_count=8)
        shoulder = bpy.context.active_object
        shoulder.name = f"Char_Shoulder_{side}"
        shoulder.scale = (1.0, 0.8, 0.7)
        shoulder.data.materials.append(joint_mat)
        shoulder.parent = torso
        parts.append(shoulder)

    # ── UPPER ARMS ──────────────────────────────────────────
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.085, depth=0.38, location=(-0.43, 0, 1.2))
    left_upper_arm = bpy.context.active_object
    left_upper_arm.name = "Char_ArmUpper_L"
    left_upper_arm.rotation_euler = Euler((0, math.radians(18), 0), 'XYZ')
    left_upper_arm.data.materials.append(suit_mat)
    left_upper_arm.parent = torso
    parts.append(left_upper_arm)

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.085, depth=0.38, location=(0.43, 0, 1.2))
    right_upper_arm = bpy.context.active_object
    right_upper_arm.name = "Char_ArmUpper_R"
    right_upper_arm.rotation_euler = Euler((0, math.radians(-18), 0), 'XYZ')
    right_upper_arm.data.materials.append(suit_mat)
    right_upper_arm.parent = torso
    parts.append(right_upper_arm)

    # ── LOWER ARMS ──────────────────────────────────────────
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.075, depth=0.32, location=(-0.55, 0, 0.93))
    left_forearm = bpy.context.active_object
    left_forearm.name = "Char_Forearm_L"
    left_forearm.data.materials.append(suit_mat)
    left_forearm.parent = torso
    parts.append(left_forearm)

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.075, depth=0.32, location=(0.55, 0, 0.93))
    right_forearm = bpy.context.active_object
    right_forearm.name = "Char_Forearm_R"
    right_forearm.data.materials.append(suit_mat)
    right_forearm.parent = torso
    parts.append(right_forearm)

    # ── GLOVES ──────────────────────────────────────────────
    for side, x in [("L", -0.55), ("R", 0.55)]:
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.08, location=(x, 0, 0.76), segments=8, ring_count=8)
        glove = bpy.context.active_object
        glove.name = f"Char_Glove_{side}"
        glove.scale = (1.0, 0.9, 0.8)
        glove.data.materials.append(joint_mat)
        glove.parent = torso
        parts.append(glove)

    # ── HIPS ────────────────────────────────────────────────
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.22, depth=0.18, location=(0, 0, 0.73))
    hips = bpy.context.active_object
    hips.name = "Char_Hips"
    hips.data.materials.append(suit_mat)
    hips.parent = torso
    parts.append(hips)

    # ── THIGHS ──────────────────────────────────────────────
    for side, x in [("L", -0.13), ("R", 0.13)]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.095, depth=0.4, location=(x, 0, 0.47))
        thigh = bpy.context.active_object
        thigh.name = f"Char_Thigh_{side}"
        thigh.data.materials.append(suit_mat)
        thigh.parent = torso
        parts.append(thigh)

    # ── LOWER LEGS ──────────────────────────────────────────
    for side, x in [("L", -0.13), ("R", 0.13)]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.085, depth=0.36, location=(x, 0, 0.17))
        shin = bpy.context.active_object
        shin.name = f"Char_Shin_{side}"
        shin.data.materials.append(suit_mat)
        shin.parent = torso
        parts.append(shin)

    # ── BOOTS ───────────────────────────────────────────────
    for side, x in [("L", -0.13), ("R", 0.13)]:
        bpy.ops.mesh.primitive_cube_add(
            size=0.22, location=(x, 0.04, 0.0))
        boot = bpy.context.active_object
        boot.name = f"Char_Boot_{side}"
        boot.scale = (0.85, 1.2, 0.45)
        boot.data.materials.append(joint_mat)
        boot.parent = torso
        parts.append(boot)

    # ── LIFE SUPPORT BACKPACK ────────────────────────────────
    bpy.ops.mesh.primitive_cube_add(size=0.4, location=(0, -0.38, 1.1))
    backpack = bpy.context.active_object
    backpack.name = "Char_Backpack"
    backpack.scale = (0.55, 0.38, 0.88)
    backpack.data.materials.append(joint_mat)
    backpack.parent = torso
    parts.append(backpack)

    print(f"  ✓ Character: {len(parts)} parts, rooted at Char_Torso")
    return torso


# ═══════════════════════════════════════════════════════════
#  LIGHTING — CINEMATIC 4-LIGHT SETUP
# ═══════════════════════════════════════════════════════════

def setup_lighting():
    """
    4-light cinematic rig:
      1. KEY   — Warm sun (dying star), raking from left-high
      2. FILL  — Cold blue nebula bounce from right
      3. RIM   — Hard white backlight separating character from bg
      4. BEAM  — Animated God ray descending from above (starts OFF)
    """

    # 1. KEY LIGHT — warm dying star
    bpy.ops.object.light_add(type='SUN', location=(12, -8, 20))
    key = bpy.context.active_object
    key.name = "Light_Key"
    key.rotation_euler = Euler((
        math.radians(38),
        math.radians(12),
        math.radians(-42)
    ), 'XYZ')
    key.data.energy = 3.5
    key.data.color = (1.0, 0.72, 0.38)    # Orange-gold
    key.data.angle = math.radians(3)       # Sharp shadows

    # 2. FILL LIGHT — cold nebula
    bpy.ops.object.light_add(type='AREA', location=(-8, 4, 7))
    fill = bpy.context.active_object
    fill.name = "Light_Fill"
    fill.rotation_euler = Euler((
        math.radians(55),
        math.radians(0),
        math.radians(50)
    ), 'XYZ')
    fill.data.energy = 80
    fill.data.color = (0.28, 0.48, 1.0)   # Cool blue
    fill.data.size = 6.0
    fill.data.size_y = 4.0

    # 3. RIM LIGHT — white separator
    bpy.ops.object.light_add(type='SPOT', location=(1, -6, 9))
    rim = bpy.context.active_object
    rim.name = "Light_Rim"
    rim.rotation_euler = Euler((
        math.radians(-52),
        math.radians(0),
        math.radians(5)
    ), 'XYZ')
    rim.data.energy = 800
    rim.data.color = (0.85, 0.92, 1.0)
    rim.data.spot_size = math.radians(35)
    rim.data.spot_blend = 0.4

    # 4. DRAMATIC GOD-RAY BEAM — starts at 0 energy, animated in Shot 5
    bpy.ops.object.light_add(type='SPOT', location=(0, 0, 22))
    beam = bpy.context.active_object
    beam.name = "Light_GodRay"
    beam.rotation_euler = Euler((0, 0, 0), 'XYZ')   # Pointing straight down
    beam.data.energy = 0                              # OFF at start
    beam.data.color = (0.95, 0.98, 1.0)
    beam.data.spot_size = math.radians(18)
    beam.data.spot_blend = 0.15
    beam.data.shadow_soft_size = 0.5

    # Ground bounce (subtle warm)
    bpy.ops.object.light_add(type='AREA', location=(0, 0, 0.05))
    bounce = bpy.context.active_object
    bounce.name = "Light_GroundBounce"
    bounce.rotation_euler = Euler((math.radians(180), 0, 0), 'XYZ')
    bounce.data.energy = 15
    bounce.data.color = (0.45, 0.35, 0.22)
    bounce.data.size = 20

    print("  ✓ Lighting: Key + Fill + Rim + GodRay + Bounce")
    return beam


# ═══════════════════════════════════════════════════════════
#  CAMERA
# ═══════════════════════════════════════════════════════════

def create_camera():
    """Create the main cinema camera with DOF enabled."""
    bpy.ops.object.camera_add(location=(0, -18, 7))
    cam = bpy.context.active_object
    cam.name = "Cam_Main"
    bpy.context.scene.camera = cam

    cd = cam.data
    cd.lens = 35.0          # Wide establishing
    cd.clip_start = 0.1
    cd.clip_end = 300.0
    cd.sensor_width = 36.0  # Full-frame sensor

    # Depth of Field
    cd.dof.use_dof = True
    cd.dof.focus_distance = 18.0
    cd.dof.aperture_fstop = 2.8     # Cinematic shallow DOF

    print("  ✓ Camera: 35mm, f/2.8 DOF")
    return cam


# ═══════════════════════════════════════════════════════════
#  ANIMATION — CAMERA
# ═══════════════════════════════════════════════════════════

def animate_camera(cam, char_torso):
    """
    5 distinct cinematic shots with smooth Bezier transitions.

    Shot 1 F001-060  ESTABLISHING   wide, bird's-eye push in
    Shot 2 F061-120  MEDIUM         character centre frame, slow orbit
    Shot 3 F121-180  CLOSE-UP       visor fill-frame, micro push
    Shot 4 F181-240  TRACKING ORBIT 90° arc as arm reaches up
    Shot 5 F241-300  EPIC PULL-BACK silhouette in god ray
    """
    scene = bpy.context.scene
    cd = cam.data

    def kf(frame, loc, rot_deg, lens, focus_dist, fstop=2.8):
        """Insert all camera keyframes at once."""
        scene.frame_set(frame)
        cam.location = Vector(loc)
        cam.rotation_euler = Euler((
            math.radians(rot_deg[0]),
            math.radians(rot_deg[1]),
            math.radians(rot_deg[2])
        ), 'XYZ')
        cam.keyframe_insert(data_path="location", frame=frame)
        cam.keyframe_insert(data_path="rotation_euler", frame=frame)

        cd.lens = lens
        cd.dof.focus_distance = focus_dist
        cd.dof.aperture_fstop = fstop
        cd.keyframe_insert(data_path="lens", frame=frame)
        cd.dof.keyframe_insert(data_path="focus_distance", frame=frame)
        cd.dof.keyframe_insert(data_path="aperture_fstop", frame=frame)

    # ── SHOT 1: ESTABLISHING (F1–60) ─────────────────────────
    # Sweeping wide — character tiny in the wasteland
    kf(  1, (-22, -18, 14), ( 62, 0, -47), lens=24,  focus_dist=32, fstop=5.6)
    kf( 60, (-14, -13, 10), ( 68, 0, -42), lens=28,  focus_dist=22, fstop=4.0)

    # ── SHOT 2: MEDIUM (F61–120) ──────────────────────────────
    # Cut closer — character isolated, slow rightward orbit
    kf( 61, ( -7,  -9,  3), ( 84, 0, -38), lens=50,  focus_dist=10, fstop=2.8)
    kf(120, ( -4, -10,  3), ( 84, 0, -23), lens=50,  focus_dist=10, fstop=2.8)

    # ── SHOT 3: CLOSE-UP (F121–180) ───────────────────────────
    # Tight on visor — very shallow DOF, micro push
    kf(121, (-1.8, -3.8, 1.85), ( 88, 0, -12), lens=85,  focus_dist=3.8, fstop=1.8)
    kf(180, (-1.5, -3.4, 1.90), ( 88, 0,  -8), lens=90,  focus_dist=3.4, fstop=1.6)

    # ── SHOT 4: TRACKING ORBIT (F181–240) ─────────────────────
    # Arc 90° right → left as arm extends skyward
    kf(181, ( 9.0, -5.0, 4.5), ( 74, 0,  58), lens=50,  focus_dist=11, fstop=2.8)
    kf(210, ( 1.0,  9.0, 5.5), ( 68, 0, 178), lens=50,  focus_dist=10, fstop=2.8)
    kf(240, (-7.5,  6.0, 5.0), ( 70, 0,-135), lens=50,  focus_dist=11, fstop=2.8)

    # ── SHOT 5: EPIC PULL-BACK (F241–300) ─────────────────────
    # Slow zoom-out — character silhouetted inside god ray column
    kf(241, ( 0.5, -11,  7), ( 72, 0,   2), lens=40,  focus_dist=13, fstop=4.0)
    kf(300, ( 0.5, -28, 16), ( 58, 0,   2), lens=28,  focus_dist=30, fstop=8.0)

    # Smooth ALL camera curves
    smooth_keyframes(cam)
    smooth_data_keyframes(cd)

    print("  ✓ Camera: 5 shots, 11 keyframes, Bezier easing")


# ═══════════════════════════════════════════════════════════
#  ANIMATION — CHARACTER
# ═══════════════════════════════════════════════════════════

def animate_character(torso):
    """
    Character performance across 5 phases matching camera shots.

    F001-060   Idle — slow breathing sway
    F061-120   Noticing — small body turn leftward
    F121-180   Reaction — head-tilt, weight shift
    F181-240   Reaching — right arm extends skyward
    F241-300   Surrender — arms wide, body upright in beam
    """
    scene = bpy.context.scene

    # ── Find animated child objects ──────────────────────────
    r_upper = bpy.data.objects.get("Char_ArmUpper_R")
    r_fore  = bpy.data.objects.get("Char_Forearm_R")
    r_glove = bpy.data.objects.get("Char_Glove_R")
    l_upper = bpy.data.objects.get("Char_ArmUpper_L")
    helmet  = bpy.data.objects.get("Char_Helmet")

    def kf_obj(obj, frame, loc=None, rot_deg=None):
        if obj is None:
            return
        scene.frame_set(frame)
        if loc is not None:
            obj.location = Vector(loc)
            obj.keyframe_insert(data_path="location", frame=frame)
        if rot_deg is not None:
            obj.rotation_euler = Euler((
                math.radians(rot_deg[0]),
                math.radians(rot_deg[1]),
                math.radians(rot_deg[2])
            ), 'XYZ')
            obj.keyframe_insert(data_path="rotation_euler", frame=frame)

    # ── ROOT TORSO MOVEMENT ────────────────────────────────
    # F1: idle
    kf_obj(torso, 1,   loc=(0,0,0), rot_deg=(0,0,0))
    # Subtle idle sway (breathing)
    kf_obj(torso, 12,  rot_deg=(0.5, 0, 0))
    kf_obj(torso, 24,  rot_deg=(0,   0, 0))
    kf_obj(torso, 36,  rot_deg=(0.5, 0, 0))
    kf_obj(torso, 48,  rot_deg=(0,   0, 0))
    kf_obj(torso, 60,  rot_deg=(0.5, 0, 0))

    # F61–120: Turn body to face direction of light
    kf_obj(torso, 61,  rot_deg=(0.5, 0,  0))
    kf_obj(torso, 90,  rot_deg=(0,   0, 25))
    kf_obj(torso, 120, rot_deg=(-2,  0, 38))

    # F121–180: Head tilts back (looking up through visor)
    kf_obj(torso, 121, rot_deg=(-2,  0, 38))
    kf_obj(torso, 150, rot_deg=(-8,  0, 42))
    kf_obj(torso, 180, rot_deg=(-10, 0, 42))

    # F181–240: Lean back slightly as arm goes up
    kf_obj(torso, 181, rot_deg=(-10, 0, 42))
    kf_obj(torso, 220, rot_deg=(-12, 0, 44))
    kf_obj(torso, 240, rot_deg=(-12, 0, 44))

    # F241–300: Stand tall, arms spread
    kf_obj(torso, 260, rot_deg=(-6, 0, 44))
    kf_obj(torso, 300, rot_deg=(-6, 0, 44))

    smooth_keyframes(torso)

    # ── RIGHT ARM — the reaching gesture ──────────────────
    if r_upper:
        # Default hanging position
        kf_obj(r_upper, 1,   rot_deg=(0,   -18, 0))
        kf_obj(r_upper, 60,  rot_deg=(0,   -18, 0))
        kf_obj(r_upper, 120, rot_deg=(0,   -18, 0))
        # Begin raising (F181)
        kf_obj(r_upper, 181, rot_deg=(0,   -18, 0))
        kf_obj(r_upper, 210, rot_deg=(-60, -15, 0))
        kf_obj(r_upper, 240, rot_deg=(-105,-12, 0))  # Fully raised
        # Spread wide in beam
        kf_obj(r_upper, 270, rot_deg=(-90, -40, 0))
        kf_obj(r_upper, 300, rot_deg=(-90, -50, 0))
        smooth_keyframes(r_upper)

    if r_fore:
        kf_obj(r_fore, 1,   rot_deg=(0, 0, 0))
        kf_obj(r_fore, 180, rot_deg=(0, 0, 0))
        kf_obj(r_fore, 210, rot_deg=(-20, 0, 0))
        kf_obj(r_fore, 240, rot_deg=(-30, 0, 0))
        kf_obj(r_fore, 300, rot_deg=(-20, 0, 0))
        smooth_keyframes(r_fore)

    # ── LEFT ARM — spreads in final shot ──────────────────
    if l_upper:
        kf_obj(l_upper, 1,   rot_deg=(0,  18, 0))
        kf_obj(l_upper, 240, rot_deg=(0,  18, 0))
        kf_obj(l_upper, 270, rot_deg=(-85, 45, 0))
        kf_obj(l_upper, 300, rot_deg=(-90, 55, 0))
        smooth_keyframes(l_upper)

    print("  ✓ Character: 5-phase performance, arms animated")


# ═══════════════════════════════════════════════════════════
#  ANIMATION — GOD RAY LIGHT BEAM
# ═══════════════════════════════════════════════════════════

def animate_beam(beam):
    """Fade in dramatic god-ray from frame 200 → 300."""
    scene = bpy.context.scene
    bd = beam.data

    keyframes = [
        (  1,    0),   # Off
        (180,    0),   # Still off
        (205,  200),   # Flash start
        (220, 1800),   # Dramatic reveal
        (250, 2800),   # Full power
        (300, 3500),   # Climax
    ]

    for frame, energy in keyframes:
        scene.frame_set(frame)
        bd.energy = energy
        bd.keyframe_insert(data_path="energy", frame=frame)

    smooth_data_keyframes(bd)
    print("  ✓ God-ray: fades in F200→300")


# ═══════════════════════════════════════════════════════════
#  TITLE CARDS (3D text in world space)
# ═══════════════════════════════════════════════════════════

def create_titles():
    """
    Two title cards positioned so the camera reads them:
      - Opening: "THE LAST LIGHT"  (F010–F065)
      - Closing:  "FIN"            (F275–F300)
    Both are emission-lit and scale-animated (appear/disappear).
    """
    scene = bpy.context.scene
    title_mat = emission_material("TitleMat", (1.0, 0.88, 0.65), strength=4.0)
    end_mat   = emission_material("EndMat",   (1.0, 0.95, 0.90), strength=5.0)

    # ── OPENING TITLE ─────────────────────────────────────
    # Position: in front of camera Shot 1, slightly low and far
    bpy.ops.object.text_add(location=(-3.5, -10, 4.5))
    opening = bpy.context.active_object
    opening.name = "Title_Opening"
    opening.data.body = "THE LAST LIGHT"
    opening.data.align_x = 'CENTER'
    opening.data.size = 0.55
    opening.data.extrude = 0.04
    opening.data.bevel_depth = 0.01
    opening.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    opening.data.materials.append(title_mat)

    # Animate: scale 0 → 1 → 1 → 0
    for frame, sc in [(1, 0), (15, 1), (50, 1), (65, 0)]:
        scene.frame_set(frame)
        opening.scale = (sc, sc, sc)
        opening.keyframe_insert(data_path="scale", frame=frame)
    smooth_keyframes(opening)

    # Sub-title / date
    bpy.ops.object.text_add(location=(-3.5, -10, 3.85))
    sub = bpy.context.active_object
    sub.name = "Title_SubLine"
    sub.data.body = "A CINEMATIC SHORT"
    sub.data.align_x = 'CENTER'
    sub.data.size = 0.22
    sub.data.extrude = 0.02
    sub.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    sub.data.materials.append(title_mat)

    for frame, sc in [(1, 0), (22, 1), (50, 1), (65, 0)]:
        scene.frame_set(frame)
        sub.scale = (sc, sc, sc)
        sub.keyframe_insert(data_path="scale", frame=frame)
    smooth_keyframes(sub)

    # ── CLOSING TITLE ─────────────────────────────────────
    # Camera in Shot 5 is pulling back — position in frame
    bpy.ops.object.text_add(location=(-0.5, -14, 7.5))
    fin = bpy.context.active_object
    fin.name = "Title_Fin"
    fin.data.body = "FIN"
    fin.data.align_x = 'CENTER'
    fin.data.size = 0.8
    fin.data.extrude = 0.06
    fin.data.bevel_depth = 0.015
    fin.rotation_euler = Euler((math.radians(90), 0, 0), 'XYZ')
    fin.data.materials.append(end_mat)

    for frame, sc in [(270, 0), (282, 1), (300, 1)]:
        scene.frame_set(frame)
        fin.scale = (sc, sc, sc)
        fin.keyframe_insert(data_path="scale", frame=frame)
    smooth_keyframes(fin)

    print("  ✓ Titles: Opening + Sub-title + 'FIN' closing card")


# ═══════════════════════════════════════════════════════════
#  ATMOSPHERIC PARTICLES (dust / debris)
# ═══════════════════════════════════════════════════════════

def create_atmosphere():
    """
    Subtle floating dust motes in a large sphere around the scene.
    Only renders if Cycles is selected and particle rendering is on.
    """
    bpy.ops.mesh.primitive_uv_sphere_add(radius=8, location=(0, 0, 2.5))
    emitter = bpy.context.active_object
    emitter.name = "Atmo_DustEmitter"

    # Make emitter invisible to renders but keep particles
    emitter.hide_render = True
    emitter.display_type = 'WIRE'

    # Particle system
    bpy.ops.object.particle_system_add()
    ps = emitter.particle_systems[0]
    ps.name = "DustParticles"
    s = ps.settings

    s.count = 300
    s.lifetime = 120
    s.lifetime_random = 0.5
    s.emit_from = 'VOLUME'
    s.use_even_distribution = True
    s.physics_type = 'NEWTON'
    s.normal_factor = 0.0
    s.factor_random = 0.08
    s.brownian_factor = 0.02
    s.drag_factor = 0.95
    s.effector_weights.gravity = 0.0

    # Render as tiny halos
    s.render_type = 'HALO'
    s.particle_size = 0.015
    s.size_random = 0.6

    print("  ✓ Atmosphere: 300 dust motes (halo particles)")


# ═══════════════════════════════════════════════════════════
#  VIEWPORT DISPLAY HELPERS
# ═══════════════════════════════════════════════════════════

def configure_viewport():
    """Set viewport to look-dev / rendered for instant preview."""
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'MATERIAL'  # 'RENDERED' is heavier
                    space.overlay.show_extras = False
                    space.overlay.show_relationship_lines = False
            break


# ═══════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════

def main():
    print()
    print("╔══════════════════════════════════════════════╗")
    print("║  THE LAST LIGHT — Scene Generator v1.0      ║")
    print("╚══════════════════════════════════════════════╝")

    # 0. Clear everything
    print("\n[0/9] Clearing scene...")
    clear_scene()

    # 1. Render & world
    print("[1/9] Configuring render settings...")
    setup_render()
    setup_world()

    # 2. Environment
    print("[2/9] Building environment...")
    create_ground()
    create_rocks()
    create_distant_planet()
    create_stars()

    # 3. Character
    print("[3/9] Assembling astronaut character...")
    char = create_character()

    # 4. Lighting
    print("[4/9] Setting up cinematic lighting...")
    beam = setup_lighting()

    # 5. Camera
    print("[5/9] Creating cinema camera...")
    cam = create_camera()

    # 6. Camera animation
    print("[6/9] Keyframing 5 camera shots...")
    animate_camera(cam, char)

    # 7. Character animation
    print("[7/9] Animating character performance...")
    animate_character(char)

    # 8. Beam animation
    print("[8/9] Animating god-ray reveal...")
    animate_beam(beam)

    # 9. Titles + Atmosphere
    print("[9/9] Adding titles and atmosphere...")
    create_titles()
    create_atmosphere()
    configure_viewport()

    # Reset playhead
    bpy.context.scene.frame_set(1)

    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  SCENE READY!                                                ║")
    print("║                                                              ║")
    print("║  ▶  SPACEBAR          → Play animation (viewport preview)   ║")
    print("║  ▶  Ctrl + F12        → Render full animation               ║")
    print("║  ▶  Numpad 0          → Camera view                         ║")
    print("║                                                              ║")
    print("║  RENDER TIPS:                                                ║")
    print("║  • Samples 64 + OIDN = fast but good quality               ║")
    print("║  • Raise to 128 for final render                            ║")
    print("║  • Output path set to //the_last_light_render.mp4          ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print()


if __name__ == "__main__":
    main()
