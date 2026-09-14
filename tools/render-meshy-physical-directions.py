#!/usr/bin/env python3
"""Render one preserved Meshy dense-d0 hierarchy as true physical d0-d3.

Run this script inside Blender with the metadata-named baseline blend already
open.  It never imports or edits geometry: it validates the preserved package,
rotates only the complete root, derives one union framing, and saves a separate
review candidate.
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
from typing import Any


STATE = "PHYSICAL_DIRECTIONS_USER_REVIEW"
USER_DECISION = "APPROVED_TO_GENERATE_PHYSICAL_DIRECTIONS"
CAMERA_EULER_XYZ_DEG = (60.0, 0.0, 45.0)
YAW_BY_DIRECTION = {"d0": 0.0, "d1": 90.0, "d2": 180.0, "d3": 270.0}
CANVAS_PX = 1024
FRAMING_MARGIN = 1.16


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"expected a JSON object: {path}")
    return value


def mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def sequence(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise RuntimeError(f"{label} must be an array")
    return value


def close(actual: float, expected: float, tolerance: float = 1e-5) -> bool:
    return abs(float(actual) - float(expected)) <= tolerance


def close_vector(actual: Any, expected: Any, tolerance: float = 1e-5) -> bool:
    try:
        left = [float(value) for value in actual]
        right = [float(value) for value in expected]
    except (TypeError, ValueError):
        return False
    return len(left) == len(right) and all(
        close(value, target, tolerance) for value, target in zip(left, right)
    )


def descendants(root: Any) -> list[Any]:
    result: list[Any] = []
    queue = list(root.children)
    while queue:
        obj = queue.pop(0)
        result.append(obj)
        queue.extend(list(obj.children))
    return result


def hierarchy_records(import_info: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(sequence(import_info.get("hierarchy"), "import.hierarchy")):
        row = mapping(raw, f"import.hierarchy[{index}]")
        name = row.get("name")
        if not isinstance(name, str) or not name or name in result:
            raise RuntimeError(f"invalid or duplicate hierarchy name: {name!r}")
        result[name] = row
    return result


def validate_hierarchy(root: Any, expected: dict[str, dict[str, Any]]) -> list[Any]:
    objects = [root] + descendants(root)
    actual = {obj.name: obj for obj in objects}
    if set(actual) != set(expected):
        raise RuntimeError(
            "complete hierarchy differs from d0 metadata: "
            f"missing={sorted(set(expected) - set(actual))}, "
            f"extra={sorted(set(actual) - set(expected))}"
        )
    for name, row in expected.items():
        obj = actual[name]
        parent = obj.parent.name if obj.parent else None
        children = sorted(child.name for child in obj.children)
        expected_children = sorted(sequence(row.get("children"), f"hierarchy children for {name}"))
        if obj.type != row.get("type") or parent != row.get("parent") or children != expected_children:
            raise RuntimeError(f"hierarchy relation/type drifted for {name}")
    return objects[1:]


def validate_topology(mesh_objects: list[Any], import_info: dict[str, Any]) -> None:
    expected_rows = {
        str(row["name"]): row
        for row in sequence(import_info.get("per_mesh"), "import.per_mesh")
        if isinstance(row, dict) and isinstance(row.get("name"), str)
    }
    if set(expected_rows) != {obj.name for obj in mesh_objects}:
        raise RuntimeError("mesh object names differ from d0 metadata")
    totals = {"vertices": 0, "edges": 0, "polygons": 0, "triangles": 0}
    for obj in mesh_objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        actual = {
            "vertices": len(mesh.vertices),
            "edges": len(mesh.edges),
            "polygons": len(mesh.polygons),
            "triangles": len(mesh.loop_triangles),
        }
        expected = expected_rows[obj.name]
        if any(int(expected.get(key, -1)) != value for key, value in actual.items()):
            raise RuntimeError(f"topology drifted for {obj.name}: {actual}")
        for key, value in actual.items():
            totals[key] += value
    for key, value in totals.items():
        if int(import_info.get(key, -1)) != value:
            raise RuntimeError(f"aggregate {key} drifted: expected {import_info.get(key)}, got {value}")


def set_direction(root: Any, direction: str, bpy: Any) -> None:
    yaw = YAW_BY_DIRECTION[direction]
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0.0, 0.0, math.radians(yaw))
    root["physical_direction"] = direction
    root["physical_pitch_yaw_roll_deg"] = [0.0, yaw, 0.0]
    bpy.context.view_layer.update()


def world_bound_points(objects: list[Any], Vector: Any):
    """Yield conservative world bounds without traversing millions of vertices."""
    for obj in objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        matrix = obj.matrix_world
        for corner in obj.bound_box:
            yield matrix @ Vector(corner)


def projected_extents(objects: list[Any], camera: Any, Vector: Any) -> list[float]:
    inverse = camera.matrix_world.inverted()
    result = [math.inf, math.inf, -math.inf, -math.inf]
    for point in world_bound_points(objects, Vector):
        camera_point = inverse @ point
        result[0] = min(result[0], camera_point.x)
        result[1] = min(result[1], camera_point.y)
        result[2] = max(result[2], camera_point.x)
        result[3] = max(result[3], camera_point.y)
    if not math.isfinite(result[0]):
        raise RuntimeError("complete root contains no mesh bounds")
    return result


def world_bounds(objects: list[Any], Vector: Any) -> list[list[float]]:
    minimum = [math.inf, math.inf, math.inf]
    maximum = [-math.inf, -math.inf, -math.inf]
    for point in world_bound_points(objects, Vector):
        for axis in range(3):
            minimum[axis] = min(minimum[axis], float(point[axis]))
            maximum[axis] = max(maximum[axis], float(point[axis]))
    return [[round(value, 8) for value in minimum], [round(value, 8) for value in maximum]]


def union_extents(rows: list[list[float]]) -> list[float]:
    return [
        min(row[0] for row in rows),
        min(row[1] for row in rows),
        max(row[2] for row in rows),
        max(row[3] for row in rows),
    ]


def rounded(values: Any) -> list[float]:
    return [round(float(value), 8) for value in values]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render true physical d0-d3 from one Meshy d0 blend.")
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--import-metadata", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--margin", type=float, default=FRAMING_MARGIN)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    if not re.fullmatch(r"[a-z0-9_]+", args.asset_id):
        raise SystemExit("asset id must contain only lowercase letters, digits, and underscores")
    if not 1.0 <= args.margin <= 1.5:
        raise SystemExit("margin must be between 1.0 and 1.5")
    try:
        import bpy  # type: ignore
        from bpy_extras.object_utils import world_to_camera_view  # type: ignore
        from mathutils import Vector  # type: ignore
    except ModuleNotFoundError as error:
        raise SystemExit("run this script inside Blender with the baseline .blend open") from error

    metadata_path = args.import_metadata.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    physical_dir = output_dir / "physical"
    directional_dir = output_dir / "directional"
    blender_dir = output_dir / "blender"
    for path in (physical_dir, directional_dir, blender_dir):
        path.mkdir(parents=True, exist_ok=True)

    metadata = read_json(metadata_path)
    if metadata.get("asset_id") != args.asset_id:
        raise RuntimeError(f"asset mismatch: {metadata.get('asset_id')!r}")
    if metadata.get("geometry_state") != "DENSE_BASELINE_UNREVIEWED":
        raise RuntimeError("input must be the preserved DENSE_BASELINE_UNREVIEWED package")
    import_info = mapping(metadata.get("import"), "import")
    camera_info = mapping(metadata.get("camera"), "camera")
    source_info = mapping(metadata.get("source_glb"), "source_glb")
    outputs_info = mapping(metadata.get("outputs"), "outputs")
    normalization_info = mapping(metadata.get("normalization"), "normalization")
    physical_root_info = mapping(metadata.get("physical_root"), "physical_root")

    baseline_blend = Path(str(outputs_info.get("blend", ""))).expanduser().resolve()
    if not baseline_blend.is_file() or Path(bpy.data.filepath).resolve() != baseline_blend:
        raise RuntimeError(f"open the metadata-named baseline blend first: {baseline_blend}")
    baseline_hash = sha256_file(baseline_blend)
    baseline_mode = stat.S_IMODE(baseline_blend.stat().st_mode)
    if baseline_hash != outputs_info.get("blend_sha256"):
        raise RuntimeError("baseline blend SHA-256 differs from d0 metadata")

    source_glb = Path(str(source_info.get("path", ""))).expanduser().resolve()
    if not source_glb.is_file() or source_glb.stat().st_size <= 0:
        raise RuntimeError(f"source GLB is missing or empty: {source_glb}")
    source_mode = stat.S_IMODE(source_glb.stat().st_mode)
    expected_mode = int(str(source_info.get("mode_octal", "0o444")), 8)
    with source_glb.open("rb") as handle:
        source_magic = handle.read(4)
    if (
        sha256_file(source_glb) != source_info.get("sha256")
        or source_glb.stat().st_size != int(source_info.get("bytes", -1))
        or source_magic != b"glTF"
        or source_mode != expected_mode
        or source_mode & 0o222
    ):
        raise RuntimeError("source GLB hash/size/magic/read-only contract failed")

    root_name = str(physical_root_info.get("name", ""))
    normalization_name = str(normalization_info.get("name", ""))
    root = bpy.data.objects.get(root_name)
    normalization = bpy.data.objects.get(normalization_name)
    if root is None or normalization is None:
        raise RuntimeError("metadata-named complete root or normalization Empty is missing")
    if root.parent is not None or normalization.parent != root:
        raise RuntimeError("complete root/normalization parentage drifted")
    if root.rotation_mode != "XYZ" or not close_vector(root.rotation_euler, (0.0, 0.0, 0.0)):
        raise RuntimeError("baseline complete root must begin at exact d0 with zero pitch/roll/yaw")
    expected_source_yaw = float(normalization_info.get("source_to_contract_yaw_deg", 0.0))
    normalization_degrees = [math.degrees(float(value)) for value in normalization.rotation_euler]
    if not close_vector(normalization_degrees, (0.0, 0.0, expected_source_yaw), 1e-4):
        raise RuntimeError("source-axis normalization rotation drifted")

    expected_hierarchy = hierarchy_records(import_info)
    objects = descendants(root)
    validate_hierarchy(root, expected_hierarchy)
    mesh_objects = [obj for obj in objects if obj.type == "MESH" and obj.data is not None]
    if not mesh_objects:
        raise RuntimeError("complete root has no mesh objects")
    validate_topology(mesh_objects, import_info)

    scene = bpy.context.scene
    camera = scene.camera
    if camera is None or camera.data.type != "ORTHO" or camera.rotation_mode != "XYZ":
        raise RuntimeError("fixed orthographic XYZ camera is missing")
    camera_degrees = [math.degrees(float(value)) for value in camera.rotation_euler]
    if not close_vector(camera_degrees, CAMERA_EULER_XYZ_DEG, 1e-4):
        raise RuntimeError(f"camera Euler drifted: {camera_degrees}")
    if not close_vector(camera_info.get("blender_euler_xyz_deg"), CAMERA_EULER_XYZ_DEG, 1e-4):
        raise RuntimeError("d0 metadata does not declare the fixed 60/0/45 Blender camera")
    if camera_info.get("axis_map") != {"game_i": "+X", "game_j": "-Y", "height": "+Z"}:
        raise RuntimeError("axis mapping differs from the game contract")
    for light_name in sequence(camera_info.get("fixed_screen_space_lights"), "camera lights"):
        if not isinstance(light_name, str) or bpy.data.objects.get(light_name) is None:
            raise RuntimeError(f"fixed screen-space light is missing: {light_name!r}")

    scene.render.resolution_x = CANVAS_PX
    scene.render.resolution_y = CANVAS_PX
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True

    # Only the complete root rotates. Camera rotation, light transforms,
    # normalization, hierarchy, geometry and material data remain unchanged.
    initial_by_direction: dict[str, list[float]] = {}
    for direction in YAW_BY_DIRECTION:
        set_direction(root, direction, bpy)
        initial_by_direction[direction] = projected_extents(objects, camera, Vector)
    initial_union = union_extents(list(initial_by_direction.values()))

    camera_rotation = camera.matrix_world.to_quaternion()
    camera_right = camera_rotation @ Vector((1.0, 0.0, 0.0))
    camera_up = camera_rotation @ Vector((0.0, 1.0, 0.0))
    camera.location += camera_right * ((initial_union[0] + initial_union[2]) / 2.0)
    camera.location += camera_up * ((initial_union[1] + initial_union[3]) / 2.0)
    bpy.context.view_layer.update()

    final_by_direction: dict[str, list[float]] = {}
    bounds_by_direction: dict[str, list[list[float]]] = {}
    for direction in YAW_BY_DIRECTION:
        set_direction(root, direction, bpy)
        final_by_direction[direction] = projected_extents(objects, camera, Vector)
        bounds_by_direction[direction] = world_bounds(objects, Vector)
    final_union = union_extents(list(final_by_direction.values()))
    union_width = final_union[2] - final_union[0]
    union_height = final_union[3] - final_union[1]
    camera.data.ortho_scale = max(union_width, union_height) * args.margin
    bpy.context.view_layer.update()

    renders: dict[str, dict[str, Any]] = {}
    for direction, yaw in YAW_BY_DIRECTION.items():
        set_direction(root, direction, bpy)
        render_path = physical_dir / f"{direction}.png"
        scene.render.filepath = str(render_path)
        bpy.ops.render.render(write_still=True)
        if not render_path.is_file() or render_path.stat().st_size <= 0:
            raise RuntimeError(f"render failed: {render_path}")
        renders[direction] = {
            "path": str(render_path),
            "sha256": sha256_file(render_path),
            "bytes": render_path.stat().st_size,
            "root_rotation_mode": "XYZ",
            "root_euler_xyz_deg": [0.0, 0.0, yaw],
            "physical_pitch_yaw_roll_deg": [0.0, yaw, 0.0],
            "projected_conservative_extents_world": rounded(final_by_direction[direction]),
            "world_conservative_bounds_min_max": bounds_by_direction[direction],
        }
    if len({row["sha256"] for row in renders.values()}) != 4:
        raise RuntimeError("d0-d3 render hashes are not all unique")

    root["geometry_state"] = STATE
    root["user_decision"] = USER_DECISION
    root["directional_geometry_review"] = "UNREVIEWED"
    root["final_geometry_approval"] = "UNREVIEWED"
    set_direction(root, "d0", bpy)
    root_anchor_ndc = world_to_camera_view(scene, camera, root.matrix_world.translation)
    root_anchor_screen_xy = [
        round(float(root_anchor_ndc.x * CANVAS_PX), 4),
        round(float((1.0 - root_anchor_ndc.y) * CANVAS_PX), 4),
    ]
    candidate_blend = blender_dir / f"{args.asset_id}-physical-directions-user-review.blend"
    if candidate_blend == baseline_blend:
        raise RuntimeError("candidate blend must not overwrite the preserved baseline")
    bpy.ops.wm.save_as_mainfile(filepath=str(candidate_blend), check_existing=False)

    # Saving the candidate must not change either immutable input.
    if sha256_file(baseline_blend) != baseline_hash or stat.S_IMODE(baseline_blend.stat().st_mode) != baseline_mode:
        raise RuntimeError("baseline blend changed while saving the direction candidate")
    if (
        sha256_file(source_glb) != source_info.get("sha256")
        or stat.S_IMODE(source_glb.stat().st_mode) != source_mode
    ):
        raise RuntimeError("source GLB changed while saving the direction candidate")

    camera_record = {
        "projection": "ORTHOGRAPHIC",
        "game_yaw_deg": 45.0,
        "optical_pitch_down_deg": 30.0,
        "roll_deg": 0.0,
        "blender_rotation_mode": "XYZ",
        "blender_euler_xyz_deg": list(CAMERA_EULER_XYZ_DEG),
        "axis_map": {"game_i": "+X", "game_j": "-Y", "height": "+Z"},
        "location_xyz": rounded(camera.location),
        "ortho_scale": round(float(camera.data.ortho_scale), 8),
        "canvas_px": [CANVAS_PX, CANVAS_PX],
        "pixel_aspect": [1.0, 1.0],
        "root_ground_anchor_screen_xy": root_anchor_screen_xy,
        "fixed_screen_space_lights": camera_info.get("fixed_screen_space_lights"),
    }
    rotations = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "user_decision": USER_DECISION,
        "directional_geometry_review": "UNREVIEWED",
        "final_geometry_approval": "UNREVIEWED",
        "complete_root": root.name,
        "normalization": normalization.name,
        "source_to_contract_yaw_deg": expected_source_yaw,
        "complete_hierarchy_parented": True,
        "mesh_object_count": len(mesh_objects),
        "vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "camera": camera_record,
        "directions": renders,
        "all_render_hashes_unique": True,
        "baseline_blend": {
            "path": str(baseline_blend),
            "sha256": baseline_hash,
            "mode_octal": oct(baseline_mode),
            "preserved": True,
        },
        "source_glb": {
            "path": str(source_glb),
            "sha256": source_info.get("sha256"),
            "bytes": source_glb.stat().st_size,
            "magic": "glTF",
            "mode_octal": oct(source_mode),
            "read_only": source_mode & 0o222 == 0,
            "preserved": True,
        },
        "candidate_blend": {
            "path": str(candidate_blend),
            "sha256": sha256_file(candidate_blend),
            "bytes": candidate_blend.stat().st_size,
        },
        "forbidden_shortcuts": {
            "camera_rotated_per_direction": False,
            "camera_moved_per_direction": False,
            "horizontal_mirroring_used": False,
            "independent_geometry_generation_used": False,
            "root_pitch_or_roll_used": False,
            "geometry_repair_used": False,
            "meshy_called": False,
            "imagegen_called": False,
            "live_game_modified": False,
        },
    }
    rotations_path = output_dir / "physical-rotations.json"
    rotations_path.write_text(json.dumps(rotations, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    union_record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "canvas_px": [CANVAS_PX, CANVAS_PX],
        "framing": "one fixed camera position/scale from the d0-d3 union; only complete root rotates",
        "bounds_method": "conservative transformed mesh object bound-box corners",
        "margin_multiplier": args.margin,
        "initial_union_extents_world": rounded(initial_union),
        "final_union_extents_world": rounded(final_union),
        "union_projected_size_world": [round(union_width, 8), round(union_height, 8)],
        "direction_extents_world": {
            direction: rounded(extents) for direction, extents in final_by_direction.items()
        },
        "camera": camera_record,
        "alpha_union": "PENDING_EVIDENCE_COMPOSER",
    }
    (output_dir / "union-canvas.json").write_text(
        json.dumps(union_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": STATE,
                "asset_id": args.asset_id,
                "physical_rotations": str(rotations_path),
                "candidate_blend": str(candidate_blend),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
