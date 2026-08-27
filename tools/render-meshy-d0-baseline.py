#!/usr/bin/env python3
"""Validate and render a generic immutable Meshy GLB as a physical d0 baseline.

Blender arguments belong after ``--``. Probe mode compares the four possible
source-axis corrections; final mode freezes one correction below an unrotated
physical root and stops at ``DENSE_BASELINE_UNREVIEWED``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


CANVAS_PX = 1024
CAMERA_EULER_XYZ_DEG = (60.0, 0.0, 45.0)
CAMERA_POSITION_UNIT_XYZ = (0.612372435696, -0.612372435696, 0.5)
CAMERA_DISTANCE = 14.0
FRAME_MARGIN = 1.16
TARGET_LONGEST_DIM = 6.0
PROBE_YAWS_DEG = (0.0, 90.0, 180.0, 270.0)
GEOMETRY_STATE = "DENSE_BASELINE_UNREVIEWED"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Unable to read {label} JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must contain a JSON object: {path}")
    return value


def checked_sha256(value: str, label: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise RuntimeError(f"{label} must be a 64-digit SHA-256")
    return value.lower()


def resolved_record_path(value: Any, record_path: Path, label: str) -> Path:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"{label} is missing")
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = record_path.parent / path
    try:
        return path.resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} does not exist: {path}") from exc


def first_mapping(record: dict[str, Any], names: Iterable[str]) -> tuple[str, dict[str, Any]]:
    for name in names:
        value = record.get(name)
        if isinstance(value, dict):
            return name, value
    raise RuntimeError(f"Wave0 is missing one of the approved-input records: {', '.join(names)}")


def wave0_identity(record: dict[str, Any]) -> tuple[Any, Any]:
    task = record.get("task") if isinstance(record.get("task"), dict) else {}
    asset = record.get("asset") if isinstance(record.get("asset"), dict) else {}
    asset_id = record.get("asset_id", task.get("asset_id", asset.get("id")))
    wave = record.get("wave", task.get("wave"))
    return asset_id, wave


def validate_inputs(args: argparse.Namespace) -> dict[str, Any]:
    if not re.fullmatch(r"[a-z0-9_]+", args.asset_id):
        raise RuntimeError("asset id must contain only lowercase letters, digits, and underscores")
    approved_expected = checked_sha256(args.approved_sha256, "--approved-sha256")

    provider_path = args.provider_result.expanduser().resolve(strict=True)
    wave0_path = args.wave0_preflight.expanduser().resolve(strict=True)
    approved_path = args.approved_image.expanduser().resolve(strict=True)
    output_dir = args.output_dir.expanduser().resolve()
    if not approved_path.is_file():
        raise RuntimeError(f"Approved image is not a file: {approved_path}")

    provider = load_json_object(provider_path, "provider result")
    if provider.get("status") != "PASS":
        raise RuntimeError("Provider result status must be exactly PASS")
    provider_asset_id = provider.get("asset_id")
    if provider_asset_id is not None and provider_asset_id != args.asset_id:
        raise RuntimeError(
            f"Provider result asset mismatch: expected {args.asset_id}, got {provider_asset_id}"
        )
    mesh_path = resolved_record_path(provider.get("mesh_path"), provider_path, "mesh_path")
    if not mesh_path.is_file():
        raise RuntimeError(f"Provider mesh is not a file: {mesh_path}")
    mesh_expected = checked_sha256(str(provider.get("mesh_sha256", "")), "provider mesh_sha256")
    mesh_stat = mesh_path.stat()
    mesh_actual = sha256_file(mesh_path)
    if mesh_actual != mesh_expected:
        raise RuntimeError(
            f"Immutable GLB SHA-256 mismatch: expected {mesh_expected}, got {mesh_actual}"
        )
    with mesh_path.open("rb") as handle:
        mesh_magic = handle.read(4)
    if mesh_stat.st_size <= 0 or mesh_magic != b"glTF":
        raise RuntimeError("Provider mesh must be a nonempty binary glTF (GLB)")
    if stat.S_IMODE(mesh_stat.st_mode) != 0o444:
        raise RuntimeError(
            f"Immutable GLB mode must be exactly 0444, got {stat.S_IMODE(mesh_stat.st_mode):04o}"
        )
    recorded_bytes = provider.get("mesh_bytes")
    if recorded_bytes is not None and recorded_bytes != mesh_stat.st_size:
        raise RuntimeError(
            f"Provider mesh byte count mismatch: expected {recorded_bytes}, got {mesh_stat.st_size}"
        )

    approved_actual = sha256_file(approved_path)
    if approved_actual != approved_expected:
        raise RuntimeError(
            f"Approved image SHA-256 mismatch: expected {approved_expected}, got {approved_actual}"
        )

    wave0 = load_json_object(wave0_path, "Wave0 preflight")
    if wave0.get("status") != "PREFLIGHT_READY":
        raise RuntimeError("Wave0 status must be exactly PREFLIGHT_READY")
    wave_asset_id, wave_number = wave0_identity(wave0)
    if wave_asset_id != args.asset_id:
        raise RuntimeError(f"Wave0 asset mismatch: expected {args.asset_id}, got {wave_asset_id}")
    if wave_number != 0:
        raise RuntimeError(f"Wave0 record must identify wave 0, got {wave_number}")
    approved_record_key, approved_record = first_mapping(
        wave0, ("approved_input", "approved_source", "immutable_input")
    )
    wave_approved_path = resolved_record_path(
        approved_record.get("path"), wave0_path, f"Wave0 {approved_record_key}.path"
    )
    if wave_approved_path != approved_path:
        raise RuntimeError(
            f"Wave0 approved image mismatch: expected {approved_path}, got {wave_approved_path}"
        )
    wave_expected = checked_sha256(
        str(approved_record.get("expected_sha256", "")),
        f"Wave0 {approved_record_key}.expected_sha256",
    )
    observed_value = next(
        (
            approved_record[name]
            for name in ("actual_sha256", "observed_sha256", "recomputed_sha256")
            if name in approved_record
        ),
        None,
    )
    wave_observed = checked_sha256(
        str(observed_value or ""), f"Wave0 {approved_record_key} observed SHA-256"
    )
    if wave_expected != approved_expected or wave_observed != approved_expected:
        raise RuntimeError("Wave0 approved-input hashes do not match --approved-sha256")
    if approved_record.get("hash_matches") is not True:
        raise RuntimeError("Wave0 approved input must record hash_matches=true")

    return {
        "provider_path": provider_path,
        "provider": provider,
        "provider_sha256": sha256_file(provider_path),
        "wave0_path": wave0_path,
        "wave0_sha256": sha256_file(wave0_path),
        "wave0_approved_record_key": approved_record_key,
        "approved_path": approved_path,
        "approved_sha256": approved_actual,
        "mesh_path": mesh_path,
        "mesh_sha256": mesh_actual,
        "mesh_bytes": mesh_stat.st_size,
        "mesh_mode_octal": oct(stat.S_IMODE(mesh_stat.st_mode)),
        "output_dir": output_dir,
    }


def clear_scene(bpy: Any) -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def hierarchy_objects(root: Any) -> list[Any]:
    result: list[Any] = []
    queue = sorted(root.children, key=lambda item: item.name)
    while queue:
        current = queue.pop(0)
        result.append(current)
        queue.extend(sorted(current.children, key=lambda item: item.name))
    return result


def object_world_points(obj: Any):
    if obj.type != "MESH" or obj.data is None:
        return
    world = obj.matrix_world
    for vertex in obj.data.vertices:
        yield world @ vertex.co


def world_bounds(objects: Iterable[Any], Vector: Any) -> tuple[Any, Any]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    seen = False
    for obj in objects:
        for point in object_world_points(obj) or ():
            seen = True
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
    if not seen:
        raise RuntimeError("Imported GLB contains no mesh vertices")
    return minimum, maximum


def projected_extents(objects: Iterable[Any], camera: Any) -> tuple[float, float, float, float]:
    inverse = camera.matrix_world.inverted()
    min_x, min_y, max_x, max_y = math.inf, math.inf, -math.inf, -math.inf
    for obj in objects:
        for point in object_world_points(obj) or ():
            camera_point = inverse @ point
            min_x = min(min_x, camera_point.x)
            min_y = min(min_y, camera_point.y)
            max_x = max(max_x, camera_point.x)
            max_y = max(max_y, camera_point.y)
    if not math.isfinite(min_x):
        raise RuntimeError("Unable to project imported mesh")
    return min_x, min_y, max_x, max_y


def vector_list(value: Any) -> list[float]:
    return [round(float(component), 8) for component in value]


def configure_render(scene: Any) -> None:
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = CANVAS_PX
    scene.render.resolution_y = CANVAS_PX
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = True
    scene.render.dither_intensity = 0.0
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "SINGLE"
    shading.single_color = (0.42, 0.55, 0.64)
    shading.show_shadows = True
    shading.show_cavity = True
    shading.cavity_type = "WORLD"
    shading.curvature_ridge_factor = 1.0
    shading.curvature_valley_factor = 1.0
    shading.show_specular_highlight = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def create_camera(bpy: Any, scene: Any, target: Any, Vector: Any) -> Any:
    data = bpy.data.cameras.new("CAMERA_GAME_ORTHO_YAW45_PITCH30_ROLL0")
    data.type = "ORTHO"
    data.clip_start = 0.1
    data.clip_end = 1000.0
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    camera.rotation_mode = "XYZ"
    camera.rotation_euler = tuple(math.radians(value) for value in CAMERA_EULER_XYZ_DEG)
    camera.location = target + Vector(CAMERA_POSITION_UNIT_XYZ) * CAMERA_DISTANCE
    scene.camera = camera
    return camera


def add_fixed_screen_lights(bpy: Any, scene: Any, camera: Any, target: Any, Vector: Any) -> list[Any]:
    camera_rotation = camera.matrix_world.to_quaternion()
    right = camera_rotation @ Vector((1.0, 0.0, 0.0))
    up = camera_rotation @ Vector((0.0, 1.0, 0.0))
    forward = camera_rotation @ Vector((0.0, 0.0, -1.0))

    def add_area(name: str, energy: float, size: float, location: Any) -> Any:
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
        return light

    lights = [
        add_area(
            "FIXED_SCREEN_UPPER_LEFT_KEY",
            1100.0,
            6.0,
            target - right * 6.0 + up * 7.0 - forward * 8.0,
        ),
        add_area(
            "FIXED_SCREEN_RIGHT_FILL",
            420.0,
            8.0,
            target + right * 6.0 + up * 2.0 - forward * 4.0,
        ),
    ]
    world = bpy.data.worlds.new("NEUTRAL_WORLD") if scene.world is None else scene.world
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.06, 0.07, 0.08, 1.0)
    background.inputs["Strength"].default_value = 0.28
    return lights


def source_metadata(validated: dict[str, Any]) -> dict[str, Any]:
    return {
        "provider_result": {
            "path": str(validated["provider_path"]),
            "sha256": validated["provider_sha256"],
            "status": "PASS",
        },
        "wave0_preflight": {
            "path": str(validated["wave0_path"]),
            "sha256": validated["wave0_sha256"],
            "status": "PREFLIGHT_READY",
            "approved_record_key": validated["wave0_approved_record_key"],
        },
        "approved_image": {
            "path": str(validated["approved_path"]),
            "sha256": validated["approved_sha256"],
        },
        "source_glb": {
            "path": str(validated["mesh_path"]),
            "sha256": validated["mesh_sha256"],
            "bytes": validated["mesh_bytes"],
            "mode_octal": validated["mesh_mode_octal"],
            "magic": "glTF",
            "immutable_original_preserved": True,
        },
    }


def camera_metadata(camera: Any, lights: list[Any], blender_version: str) -> dict[str, Any]:
    return {
        "blender_version": blender_version,
        "projection": "ORTHOGRAPHIC",
        "game_yaw_deg": 45.0,
        "optical_pitch_down_deg": 30.0,
        "roll_deg": 0.0,
        "blender_rotation_mode": "XYZ",
        "blender_euler_xyz_deg": list(CAMERA_EULER_XYZ_DEG),
        "axis_map": {"game_i": "+X", "game_j": "-Y", "height": "+Z"},
        "position_unit_xyz": list(CAMERA_POSITION_UNIT_XYZ),
        "location_xyz": vector_list(camera.location),
        "ortho_scale": round(float(camera.data.ortho_scale), 8),
        "canvas_px": [CANVAS_PX, CANVAS_PX],
        "rgba": True,
        "fixed_screen_space_lights": [light.name for light in lights],
        "render_engine": "BLENDER_WORKBENCH",
        "lighting_authority": "FIXED_SCREEN_SPACE_STUDIO_PAINT_SL",
        "matrix_world": [vector_list(row) for row in camera.matrix_world],
    }


def topology_metadata(objects: list[Any]) -> dict[str, Any]:
    meshes = [obj for obj in objects if obj.type == "MESH"]
    per_mesh = []
    for obj in sorted(meshes, key=lambda item: item.name):
        obj.data.calc_loop_triangles()
        per_mesh.append(
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "edges": len(obj.data.edges),
                "polygons": len(obj.data.polygons),
                "triangles": len(obj.data.loop_triangles),
            }
        )
    return {
        "mesh_object_count": len(meshes),
        "vertices": sum(item["vertices"] for item in per_mesh),
        "edges": sum(item["edges"] for item in per_mesh),
        "polygons": sum(item["polygons"] for item in per_mesh),
        "triangles": sum(item["triangles"] for item in per_mesh),
        "per_mesh": per_mesh,
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run_blender(args: argparse.Namespace, validated: dict[str, Any]) -> None:
    try:
        import bpy  # type: ignore
        from mathutils import Matrix, Vector  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Rendering must run inside Blender 5.2") from exc

    clear_scene(bpy)
    before = set(bpy.data.objects)
    result = bpy.ops.import_scene.gltf(filepath=str(validated["mesh_path"]))
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB import failed: {sorted(result)}")
    imported = [obj for obj in bpy.data.objects if obj not in before]
    imported_set = set(imported)
    imported_top_level = [obj for obj in imported if obj.parent not in imported_set]
    if not imported or not imported_top_level:
        raise RuntimeError("GLB import produced no complete hierarchy")

    token = args.asset_id.upper()
    root = bpy.data.objects.new(f"{token}_PHYSICAL_ROOT_D0", None)
    bpy.context.scene.collection.objects.link(root)
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0.0, 0.0, 0.0)
    root["asset_id"] = args.asset_id
    root["geometry_state"] = GEOMETRY_STATE
    root["user_approval"] = "UNREVIEWED"
    root["physical_direction"] = "d0"
    root["physical_root_yaw_deg"] = 0.0
    root["root_pitch_yaw_roll_deg"] = [0.0, 0.0, 0.0]
    root["source_glb_sha256"] = validated["mesh_sha256"]

    normalization = bpy.data.objects.new(f"{token}_SOURCE_AXIS_NORMALIZATION", None)
    bpy.context.scene.collection.objects.link(normalization)
    normalization.parent = root
    for obj in imported_top_level:
        preserved_world = obj.matrix_world.copy()
        obj.parent = normalization
        obj.matrix_world = preserved_world

    descendants = hierarchy_objects(root)
    original_min, original_max = world_bounds(descendants, Vector)
    original_size = original_max - original_min
    longest = max(original_size)
    if longest <= 0.0:
        raise RuntimeError("Imported mesh bounds are degenerate")
    uniform_scale = TARGET_LONGEST_DIM / longest
    source_anchor = Vector(
        (
            (original_min.x + original_max.x) / 2.0,
            (original_min.y + original_max.y) / 2.0,
            original_min.z,
        )
    )

    def set_source_yaw(yaw_deg: float) -> None:
        yaw = math.radians(yaw_deg)
        rotation = Matrix.Rotation(yaw, 4, "Z")
        normalization.rotation_mode = "XYZ"
        normalization.rotation_euler = (0.0, 0.0, yaw)
        normalization.scale = (uniform_scale,) * 3
        normalization.location = -(rotation @ source_anchor) * uniform_scale
        root.rotation_euler = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()

    initial_yaw = 0.0 if args.mode == "probe" else args.source_yaw
    set_source_yaw(initial_yaw)
    normalized_min, normalized_max = world_bounds(descendants, Vector)

    source_material_names = sorted(
        {
            slot.material.name
            for obj in descendants
            if obj.type == "MESH"
            for slot in obj.material_slots
            if slot.material is not None
        }
    )
    clay = bpy.data.materials.new("DENSE_BASELINE_CLAY")
    clay.use_nodes = True
    principled = clay.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("Blender did not create a Principled BSDF clay material")
    principled.inputs["Base Color"].default_value = (0.42, 0.55, 0.64, 1.0)
    principled.inputs["Roughness"].default_value = 0.68
    principled.inputs["Metallic"].default_value = 0.0
    for obj in descendants:
        if obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(clay)
    for material in list(bpy.data.materials):
        if material != clay:
            bpy.data.materials.remove(material)

    scene = bpy.context.scene
    configure_render(scene)
    target = Vector((0.0, 0.0, (normalized_min.z + normalized_max.z) / 2.0))
    camera = create_camera(bpy, scene, target, Vector)
    bpy.context.view_layer.update()

    yaws = PROBE_YAWS_DEG if args.mode == "probe" else (args.source_yaw,)
    extents_before: dict[str, tuple[float, float, float, float]] = {}
    for yaw_deg in yaws:
        set_source_yaw(yaw_deg)
        extents_before[str(int(yaw_deg) if yaw_deg.is_integer() else yaw_deg)] = projected_extents(
            descendants, camera
        )
    union = (
        min(value[0] for value in extents_before.values()),
        min(value[1] for value in extents_before.values()),
        max(value[2] for value in extents_before.values()),
        max(value[3] for value in extents_before.values()),
    )
    camera_right = camera.matrix_world.to_quaternion() @ Vector((1.0, 0.0, 0.0))
    camera_up = camera.matrix_world.to_quaternion() @ Vector((0.0, 1.0, 0.0))
    framing_shift = (
        camera_right * ((union[0] + union[2]) / 2.0)
        + camera_up * ((union[1] + union[3]) / 2.0)
    )
    camera.location += framing_shift
    target += framing_shift
    bpy.context.view_layer.update()

    extents: dict[str, list[float]] = {}
    for yaw_deg in yaws:
        set_source_yaw(yaw_deg)
        key = str(int(yaw_deg) if yaw_deg.is_integer() else yaw_deg)
        extents[key] = [round(value, 8) for value in projected_extents(descendants, camera)]
    shared_union = (
        min(value[0] for value in extents.values()),
        min(value[1] for value in extents.values()),
        max(value[2] for value in extents.values()),
        max(value[3] for value in extents.values()),
    )
    camera.data.ortho_scale = max(
        shared_union[2] - shared_union[0], shared_union[3] - shared_union[1]
    ) * FRAME_MARGIN
    lights = add_fixed_screen_lights(bpy, scene, camera, target, Vector)
    bpy.context.view_layer.update()

    if args.mode == "probe":
        probe_dir = validated["output_dir"] / "probe"
        probe_dir.mkdir(parents=True, exist_ok=True)
        outputs: dict[str, dict[str, Any]] = {}
        for yaw_deg in PROBE_YAWS_DEG:
            set_source_yaw(yaw_deg)
            render_path = probe_dir / f"source-yaw-probe-{int(yaw_deg):03d}.png"
            scene.render.filepath = str(render_path)
            bpy.ops.render.render(write_still=True)
            outputs[str(int(yaw_deg))] = {
                "path": str(render_path),
                "sha256": sha256_file(render_path),
            }
        metadata = {
            "recorded_at": utc_now(),
            "asset_id": args.asset_id,
            "status": "SOURCE_AXIS_PROBE_ONLY",
            "geometry_state": "NOT_SELECTED",
            "physical_root": {"direction": "d0", "yaw_deg": 0.0},
            "source_axis_correction_yaws_deg": list(PROBE_YAWS_DEG),
            "shared_framing": True,
            "projected_extents_by_yaw": extents,
            "camera": camera_metadata(camera, lights, bpy.app.version_string),
            "sources": source_metadata(validated),
            "outputs": outputs,
        }
        metadata_path = probe_dir / "source-yaw-probe.json"
        write_json(metadata_path, metadata)
        print(json.dumps({"status": metadata["status"], "metadata": str(metadata_path)}, sort_keys=True))
        return

    set_source_yaw(args.source_yaw)
    blender_dir = validated["output_dir"] / "blender"
    blender_dir.mkdir(parents=True, exist_ok=True)
    render_path = blender_dir / "physical-d0-game-camera.png"
    blend_path = blender_dir / f"{args.asset_id}-dense-baseline-unreviewed.blend"
    metadata_path = blender_dir / "blender-import-render.json"
    scene.render.filepath = str(render_path)
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), check_existing=False)

    descendants = hierarchy_objects(root)
    hierarchy = [root] + descendants
    topology = topology_metadata(descendants)
    sources = source_metadata(validated)
    metadata = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": GEOMETRY_STATE,
        "user_approval": "UNREVIEWED",
        "physical_render": "d0_only",
        "direction_baking": "NOT_STARTED",
        "physical_root": {
            "name": root.name,
            "direction": "d0",
            "euler_xyz_deg": [0.0, 0.0, 0.0],
            "yaw_deg": 0.0,
            "direct_children": [child.name for child in root.children],
        },
        "normalization": {
            "name": normalization.name,
            "source_to_contract_yaw_deg": args.source_yaw,
            "uniform_scale": uniform_scale,
            "proportions_changed": False,
            "source_bounds_min": vector_list(original_min),
            "source_bounds_max": vector_list(original_max),
            "source_bounds_size": vector_list(original_size),
            "source_anchor_xyz": vector_list(source_anchor),
            "normalized_bounds_min": vector_list(normalized_min),
            "normalized_bounds_max": vector_list(normalized_max),
            "world_pivot_xyz": [0.0, 0.0, 0.0],
        },
        "import": {
            "imported_object_count": len(imported),
            "imported_top_level_count": len(imported_top_level),
            "imported_top_level_names": [obj.name for obj in imported_top_level],
            "complete_hierarchy_parented": all(obj in descendants for obj in imported),
            "source_material_count": len(source_material_names),
            "source_material_names": source_material_names,
            "render_material": clay.name,
            "material_datablock_count": len(bpy.data.materials),
            "hierarchy": [
                {
                    "name": obj.name,
                    "type": obj.type,
                    "parent": obj.parent.name if obj.parent else None,
                    "children": sorted(child.name for child in obj.children),
                }
                for obj in hierarchy
            ],
            "topology": topology,
            **topology,
        },
        "camera": camera_metadata(camera, lights, bpy.app.version_string),
        "sources": sources,
        "source_glb": sources["source_glb"],
        "outputs": {
            "blend": str(blend_path),
            "blend_sha256": sha256_file(blend_path),
            "render": str(render_path),
            "render_sha256": sha256_file(render_path),
            "render_bytes": render_path.stat().st_size,
            "metadata": str(metadata_path),
        },
        "forbidden_work": {
            "geometry_repair_started": False,
            "direction_baking_started": False,
            "directional_image_generation_started": False,
            "runtime_adoption_started": False,
        },
    }
    write_json(metadata_path, metadata)
    print(
        json.dumps(
            {
                "status": GEOMETRY_STATE,
                "asset_id": args.asset_id,
                "source_yaw_deg": args.source_yaw,
                "render": str(render_path),
                "blend": str(blend_path),
                "metadata": str(metadata_path),
            },
            sort_keys=True,
        )
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render a validated immutable Meshy GLB as a probe or unreviewed physical d0."
    )
    parser.add_argument("--mode", choices=("probe", "final"), required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--provider-result", required=True, type=Path)
    parser.add_argument("--wave0-preflight", required=True, type=Path)
    parser.add_argument("--approved-image", required=True, type=Path)
    parser.add_argument("--approved-sha256", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--source-yaw", type=float, help="Required in final mode; source-axis correction")
    script_args = argv[argv.index("--") + 1 :] if "--" in argv else argv[1:]
    args = parser.parse_args(script_args)
    if args.mode == "final" and args.source_yaw is None:
        parser.error("--source-yaw is required when --mode=final")
    if args.source_yaw is not None and not math.isfinite(args.source_yaw):
        parser.error("--source-yaw must be finite")
    return args


def main() -> int:
    args = parse_args(sys.argv)
    validated = validate_inputs(args)
    run_blender(args, validated)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as exc:
        raise SystemExit(f"error: {exc}") from exc
