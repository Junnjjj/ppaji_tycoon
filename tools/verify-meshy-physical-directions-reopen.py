#!/usr/bin/env python3
"""Independently reopen and rerender a Meshy physical d0-d3 candidate."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import stat
import sys
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STATE = "PHYSICAL_DIRECTIONS_USER_REVIEW"
CAMERA_EULER_XYZ_DEG = (60.0, 0.0, 45.0)
YAW_BY_DIRECTION = {"d0": 0.0, "d1": 90.0, "d2": 180.0, "d3": 270.0}
CANVAS_PX = 1024


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


def expected_hierarchy(import_info: dict[str, Any]) -> dict[str, dict[str, Any]]:
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
        raise RuntimeError("reopened hierarchy names differ from d0 metadata")
    for name, row in expected.items():
        obj = actual[name]
        parent = obj.parent.name if obj.parent else None
        children = sorted(child.name for child in obj.children)
        if (
            obj.type != row.get("type")
            or parent != row.get("parent")
            or children != sorted(sequence(row.get("children"), f"children for {name}"))
        ):
            raise RuntimeError(f"reopened hierarchy relation/type drifted for {name}")
    return objects[1:]


def validate_topology(mesh_objects: list[Any], import_info: dict[str, Any]) -> None:
    rows = {
        str(row["name"]): row
        for row in sequence(import_info.get("per_mesh"), "import.per_mesh")
        if isinstance(row, dict) and isinstance(row.get("name"), str)
    }
    if set(rows) != {obj.name for obj in mesh_objects}:
        raise RuntimeError("reopened mesh object names differ from d0 metadata")
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
        if any(int(rows[obj.name].get(key, -1)) != value for key, value in actual.items()):
            raise RuntimeError(f"reopened topology drifted for {obj.name}")
        for key, value in actual.items():
            totals[key] += value
    for key, value in totals.items():
        if int(import_info.get(key, -1)) != value:
            raise RuntimeError(f"reopened aggregate {key} drifted")


def set_direction(root: Any, direction: str, bpy: Any) -> None:
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0.0, 0.0, math.radians(YAW_BY_DIRECTION[direction]))
    bpy.context.view_layer.update()


def decoded_pixels(bpy: Any, path: Path) -> tuple[tuple[int, int], array]:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        size = (int(image.size[0]), int(image.size[1]))
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        return size, pixels
    finally:
        bpy.data.images.remove(image)


def pixel_comparison(bpy: Any, original: Path, reopened: Path) -> dict[str, Any]:
    original_size, original_pixels = decoded_pixels(bpy, original)
    reopened_size, reopened_pixels = decoded_pixels(bpy, reopened)
    identical = original_size == reopened_size and original_pixels == reopened_pixels
    max_abs = 0.0
    differing_values = 0
    if original_size == reopened_size and len(original_pixels) == len(reopened_pixels) and not identical:
        for left, right in zip(original_pixels, reopened_pixels):
            difference = abs(float(left) - float(right))
            if difference:
                differing_values += 1
                max_abs = max(max_abs, difference)
    elif original_size != reopened_size or len(original_pixels) != len(reopened_pixels):
        max_abs = 1.0
        differing_values = max(len(original_pixels), len(reopened_pixels))
    return {
        "original_size": list(original_size),
        "reopen_size": list(reopened_size),
        "decoded_rgba_float_exact": identical,
        "decoded_rgba_max_abs_diff": max_abs,
        "differing_channel_values": differing_values,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a freshly reopened physical d0-d3 candidate.")
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--import-metadata", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    if not re.fullmatch(r"[a-z0-9_]+", args.asset_id):
        raise SystemExit("asset id must contain only lowercase letters, digits, and underscores")
    try:
        import bpy  # type: ignore
    except ModuleNotFoundError as error:
        raise SystemExit("run this verifier inside Blender with the candidate .blend open") from error

    metadata_path = args.import_metadata.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    rotations_path = output_dir / "physical-rotations.json"
    reopen_dir = output_dir / "directional" / "reopen"
    reopen_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "directional" / "directional-reopen-verification.json"

    metadata = read_json(metadata_path)
    rotations = read_json(rotations_path)
    if metadata.get("asset_id") != args.asset_id or rotations.get("asset_id") != args.asset_id:
        raise RuntimeError("asset id mismatch across arguments and records")
    if rotations.get("geometry_state") != STATE:
        raise RuntimeError(f"physical rotations must stop at {STATE}")
    import_info = mapping(metadata.get("import"), "import")
    camera_info = mapping(rotations.get("camera"), "physical-rotations.camera")
    source_info = mapping(rotations.get("source_glb"), "physical-rotations.source_glb")
    baseline_info = mapping(rotations.get("baseline_blend"), "physical-rotations.baseline_blend")
    candidate_info = mapping(rotations.get("candidate_blend"), "physical-rotations.candidate_blend")

    candidate_blend = Path(str(candidate_info.get("path", ""))).expanduser().resolve()
    if Path(bpy.data.filepath).resolve() != candidate_blend or not candidate_blend.is_file():
        raise RuntimeError(f"open the recorded candidate blend first: {candidate_blend}")
    candidate_hash = sha256_file(candidate_blend)
    candidate_mode = stat.S_IMODE(candidate_blend.stat().st_mode)
    if candidate_hash != candidate_info.get("sha256"):
        raise RuntimeError("reopened candidate blend hash differs from physical-rotations.json")

    baseline_blend = Path(str(baseline_info.get("path", ""))).expanduser().resolve()
    source_glb = Path(str(source_info.get("path", ""))).expanduser().resolve()
    if (
        not baseline_blend.is_file()
        or sha256_file(baseline_blend) != baseline_info.get("sha256")
        or stat.S_IMODE(baseline_blend.stat().st_mode) != int(str(baseline_info.get("mode_octal")), 8)
    ):
        raise RuntimeError("preserved baseline blend integrity failed during independent reopen")
    source_mode = stat.S_IMODE(source_glb.stat().st_mode) if source_glb.is_file() else -1
    with source_glb.open("rb") as handle:
        source_magic = handle.read(4)
    if (
        sha256_file(source_glb) != source_info.get("sha256")
        or source_glb.stat().st_size != int(source_info.get("bytes", -1))
        or source_magic != b"glTF"
        or source_mode != int(str(source_info.get("mode_octal")), 8)
        or source_mode & 0o222
    ):
        raise RuntimeError("preserved source GLB integrity/read-only check failed during reopen")

    root_name = str(rotations.get("complete_root", ""))
    root = bpy.data.objects.get(root_name)
    if root is None or root.parent is not None:
        raise RuntimeError("complete root is missing or unexpectedly parented after reopen")
    if root.rotation_mode != "XYZ" or not close_vector(root.rotation_euler, (0.0, 0.0, 0.0)):
        raise RuntimeError("candidate must reopen saved at exact d0")
    objects = descendants(root)
    validate_hierarchy(root, expected_hierarchy(import_info))
    mesh_objects = [obj for obj in objects if obj.type == "MESH" and obj.data is not None]
    validate_topology(mesh_objects, import_info)

    scene = bpy.context.scene
    camera = scene.camera
    if camera is None or camera.data.type != "ORTHO" or camera.rotation_mode != "XYZ":
        raise RuntimeError("fixed orthographic camera is missing after reopen")
    camera_degrees = [math.degrees(float(value)) for value in camera.rotation_euler]
    if (
        not close_vector(camera_degrees, CAMERA_EULER_XYZ_DEG, 1e-4)
        or not close_vector(camera.location, camera_info.get("location_xyz"), 1e-4)
        or not close(float(camera.data.ortho_scale), float(camera_info.get("ortho_scale")), 1e-5)
    ):
        raise RuntimeError("fixed camera rotation/location/scale drifted after reopen")
    if camera_info.get("axis_map") != {"game_i": "+X", "game_j": "-Y", "height": "+Z"}:
        raise RuntimeError("reopened axis mapping record is invalid")
    for light_name in sequence(camera_info.get("fixed_screen_space_lights"), "camera lights"):
        if not isinstance(light_name, str) or bpy.data.objects.get(light_name) is None:
            raise RuntimeError(f"fixed screen-space light is missing after reopen: {light_name!r}")

    scene.render.resolution_x = CANVAS_PX
    scene.render.resolution_y = CANVAS_PX
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True

    direction_records = mapping(rotations.get("directions"), "physical-rotations.directions")
    results: dict[str, dict[str, Any]] = {}
    for direction, yaw in YAW_BY_DIRECTION.items():
        original_info = mapping(direction_records.get(direction), f"directions.{direction}")
        if not close_vector(original_info.get("root_euler_xyz_deg"), (0.0, 0.0, yaw), 1e-6):
            raise RuntimeError(f"recorded root Euler is invalid for {direction}")
        original_path = Path(str(original_info.get("path", ""))).expanduser().resolve()
        if not original_path.is_file() or sha256_file(original_path) != original_info.get("sha256"):
            raise RuntimeError(f"recorded original physical render changed for {direction}")
        set_direction(root, direction, bpy)
        actual_degrees = [math.degrees(float(value)) for value in root.rotation_euler]
        if not close_vector(actual_degrees, (0.0, 0.0, yaw), 1e-5):
            raise RuntimeError(f"root failed to reach exact {direction} Euler")
        reopen_path = reopen_dir / f"{direction}.png"
        scene.render.filepath = str(reopen_path)
        bpy.ops.render.render(write_still=True)
        comparison = pixel_comparison(bpy, original_path, reopen_path)
        results[direction] = {
            "root_rotation_mode": "XYZ",
            "root_euler_xyz_deg": [0.0, 0.0, yaw],
            "physical_pitch_yaw_roll_deg": [0.0, yaw, 0.0],
            "original": {
                "path": str(original_path),
                "sha256": original_info.get("sha256"),
            },
            "reopen": {
                "path": str(reopen_path),
                "sha256": sha256_file(reopen_path),
                "bytes": reopen_path.stat().st_size,
            },
            "decoded_pixel_comparison": comparison,
        }

    set_direction(root, "d0", bpy)
    original_unique = len({row["original"]["sha256"] for row in results.values()}) == 4
    reopen_unique = len({row["reopen"]["sha256"] for row in results.values()}) == 4
    pixels_exact = all(
        row["decoded_pixel_comparison"]["decoded_rgba_float_exact"] for row in results.values()
    )
    candidate_unchanged = (
        sha256_file(candidate_blend) == candidate_hash
        and stat.S_IMODE(candidate_blend.stat().st_mode) == candidate_mode
    )
    checks = {
        "candidate_blend_hash_and_mode_preserved": candidate_unchanged,
        "baseline_blend_hash_and_mode_preserved": sha256_file(baseline_blend) == baseline_info.get("sha256"),
        "source_glb_hash_and_read_only_mode_preserved": (
            sha256_file(source_glb) == source_info.get("sha256")
            and stat.S_IMODE(source_glb.stat().st_mode) == source_mode
            and source_mode & 0o222 == 0
        ),
        "complete_hierarchy_exact": True,
        "topology_exact": True,
        "fixed_camera_exact": True,
        "root_pitch_roll_zero_and_yaws_exact": True,
        "four_original_hashes_unique": original_unique,
        "four_reopen_hashes_unique": reopen_unique,
        "independent_reopen_decoded_pixels_exact": pixels_exact,
    }
    passed = all(checks.values())
    report = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "status": "PASS_INDEPENDENT_REOPEN_EXACT" if passed else "FAIL_INDEPENDENT_REOPEN",
        "blend": {
            "path": str(candidate_blend),
            "sha256": candidate_hash,
            "mode_octal": oct(candidate_mode),
        },
        "root": root.name,
        "mesh_object_count": len(mesh_objects),
        "vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
        "polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        "camera": {
            "projection": "ORTHOGRAPHIC",
            "blender_euler_xyz_deg": camera_degrees,
            "location_xyz": [round(float(value), 8) for value in camera.location],
            "ortho_scale": round(float(camera.data.ortho_scale), 8),
            "canvas_px": [CANVAS_PX, CANVAS_PX],
        },
        "directions": results,
        "checks": checks,
        "forbidden_work": {
            "meshy_called": False,
            "imagegen_called": False,
            "geometry_repaired": False,
            "live_game_modified": False,
        },
    }
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(report_path)}, sort_keys=True))
    if not passed:
        raise RuntimeError(f"independent reopen verification failed; see {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
