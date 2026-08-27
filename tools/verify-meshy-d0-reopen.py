#!/usr/bin/env python3
"""Verify and rerender an opened Meshy dense-baseline Blender package."""

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


GEOMETRY_STATE = "DENSE_BASELINE_UNREVIEWED"
USER_APPROVAL = "UNREVIEWED"
PHYSICAL_DIRECTION = "d0"
CAMERA_EULER_XYZ_DEG = (60.0, 0.0, 45.0)
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


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise RuntimeError(f"{label} must be an array")
    return value


def close(actual: float, expected: float, tolerance: float = 1e-5) -> bool:
    return abs(float(actual) - float(expected)) <= tolerance


def close_vector(actual: Any, expected: tuple[float, ...] | list[float], tolerance: float = 1e-5) -> bool:
    try:
        values = [float(value) for value in actual]
    except (TypeError, ValueError):
        return False
    return len(values) == len(expected) and all(
        close(value, target, tolerance) for value, target in zip(values, expected)
    )


def descendants(root: Any) -> list[Any]:
    result: list[Any] = []
    queue = list(root.children)
    while queue:
        obj = queue.pop(0)
        result.append(obj)
        queue.extend(list(obj.children))
    return result


def metadata_scene_names(import_info: dict[str, Any]) -> tuple[str, str, dict[str, dict[str, Any]]]:
    rows = require_list(import_info.get("hierarchy"), "import.hierarchy")
    records: dict[str, dict[str, Any]] = {}
    for index, raw in enumerate(rows):
        row = require_mapping(raw, f"import.hierarchy[{index}]")
        name = row.get("name")
        if not isinstance(name, str) or not name:
            raise RuntimeError(f"import.hierarchy[{index}].name must be nonempty")
        if name in records:
            raise RuntimeError(f"duplicate hierarchy name in import metadata: {name}")
        records[name] = row

    roots = [row for row in records.values() if row.get("parent") is None]
    if len(roots) != 1:
        raise RuntimeError("import metadata must name exactly one hierarchy root")
    root_name = str(roots[0]["name"])
    top_level_names = require_list(
        import_info.get("imported_top_level_names"), "import.imported_top_level_names"
    )
    if not top_level_names or not all(isinstance(name, str) and name for name in top_level_names):
        raise RuntimeError("import.imported_top_level_names must contain object names")

    normalization_candidates = [
        row
        for row in records.values()
        if row.get("parent") == root_name
        and row.get("type") == "EMPTY"
        and sorted(require_list(row.get("children"), f"hierarchy children for {row['name']}"))
        == sorted(top_level_names)
    ]
    if len(normalization_candidates) != 1:
        raise RuntimeError(
            "import metadata must identify one normalization Empty between the root and imported top levels"
        )
    return root_name, str(normalization_candidates[0]["name"]), records


def decoded_pixels(bpy: Any, path: Path) -> tuple[tuple[int, int], array]:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        size = (int(image.size[0]), int(image.size[1]))
        pixels = array("f", [0.0]) * len(image.pixels)
        image.pixels.foreach_get(pixels)
        return size, pixels
    finally:
        bpy.data.images.remove(image)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify a saved, reopened Meshy d0 dense-baseline .blend and rerender it."
    )
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--provider-result", required=True, type=Path)
    parser.add_argument("--import-metadata", required=True, type=Path)
    parser.add_argument("--original-render", required=True, type=Path)
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
        raise SystemExit("this verifier must run inside Blender after opening the saved .blend") from error

    provider_path = args.provider_result.resolve()
    metadata_path = args.import_metadata.resolve()
    original_render = args.original_render.resolve()
    output_dir = args.output_dir.resolve()
    blender_dir = output_dir / "blender"
    blender_dir.mkdir(parents=True, exist_ok=True)
    reopen_render = blender_dir / "physical-d0-reopen.png"
    report_path = blender_dir / "blender-reopen-verification.json"

    provider = read_json(provider_path)
    metadata = read_json(metadata_path)
    import_info = require_mapping(metadata.get("import"), "import")
    source_info = require_mapping(metadata.get("source_glb"), "source_glb")
    camera_info = require_mapping(metadata.get("camera"), "camera")
    normalization_info = require_mapping(metadata.get("normalization"), "normalization")
    outputs_info = require_mapping(metadata.get("outputs"), "outputs")

    root_name, normalization_name, expected_hierarchy = metadata_scene_names(import_info)
    root = bpy.data.objects.get(root_name)
    normalization = bpy.data.objects.get(normalization_name)
    scene = bpy.context.scene
    camera = scene.camera
    if root is None or normalization is None or camera is None:
        raise RuntimeError("opened package is missing the metadata-named root, normalization, or scene camera")

    source_glb = Path(str(source_info.get("path", ""))).resolve()
    provider_glb = Path(str(provider.get("mesh_path", ""))).resolve()
    if not source_glb.is_file():
        raise RuntimeError(f"source GLB is missing: {source_glb}")
    if not original_render.is_file():
        raise RuntimeError(f"original render is missing: {original_render}")

    actual_glb_sha256 = sha256_file(source_glb)
    actual_glb_bytes = source_glb.stat().st_size
    actual_glb_mode = stat.S_IMODE(source_glb.stat().st_mode)
    with source_glb.open("rb") as handle:
        glb_magic = handle.read(4)

    hierarchy = [root] + descendants(root)
    actual_by_name = {obj.name: obj for obj in hierarchy}
    imported_objects = [
        obj for obj in hierarchy if obj.name not in {root_name, normalization_name}
    ]
    mesh_objects = [obj for obj in imported_objects if obj.type == "MESH" and obj.data is not None]
    actual_top_level_names = [obj.name for obj in normalization.children]

    expected_rows_valid = set(actual_by_name) == set(expected_hierarchy)
    if expected_rows_valid:
        for name, row in expected_hierarchy.items():
            obj = actual_by_name[name]
            actual_parent = obj.parent.name if obj.parent else None
            actual_children = sorted(child.name for child in obj.children)
            expected_children = sorted(require_list(row.get("children"), f"hierarchy children for {name}"))
            if obj.type != row.get("type") or actual_parent != row.get("parent") or actual_children != expected_children:
                expected_rows_valid = False
                break

    expected_camera_degrees = require_list(
        camera_info.get("blender_euler_xyz_deg"), "camera.blender_euler_xyz_deg"
    )
    actual_camera_degrees = [math.degrees(float(value)) for value in camera.rotation_euler]
    root_property_rotation = root.get("root_pitch_yaw_roll_deg")
    metadata_source_yaw = normalization_info.get("source_to_contract_yaw_deg")
    actual_normalization_degrees = [
        math.degrees(float(value)) for value in normalization.rotation_euler
    ]

    provider_sha256 = provider.get("mesh_sha256")
    metadata_sha256 = source_info.get("sha256")
    metadata_original_path = Path(str(outputs_info.get("render", ""))).resolve()
    original_sha256 = sha256_file(original_render)

    checks = {
        "provider_status_pass": provider.get("status") == "PASS",
        "provider_asset_id_matches": provider.get("asset_id") == args.asset_id,
        "import_asset_id_matches": metadata.get("asset_id") == args.asset_id,
        "source_glb_path_matches_provider": source_glb == provider_glb,
        "source_glb_sha256_exact": (
            isinstance(provider_sha256, str)
            and provider_sha256 == metadata_sha256 == actual_glb_sha256
            and root.get("source_glb_sha256") == actual_glb_sha256
        ),
        "source_glb_nonempty": actual_glb_bytes > 0,
        "source_glb_bytes_match": (
            provider.get("mesh_bytes") == source_info.get("bytes") == actual_glb_bytes
        ),
        "source_glb_gltf_magic": glb_magic == b"glTF",
        "source_glb_mode_0444": actual_glb_mode == 0o444 and source_info.get("mode_octal") == "0o444",
        "source_glb_marked_immutable": source_info.get("immutable_original_preserved") is True,
        "metadata_geometry_state_unreviewed": metadata.get("geometry_state") == GEOMETRY_STATE,
        "metadata_user_approval_unreviewed": metadata.get("user_approval") == USER_APPROVAL,
        "metadata_physical_render_d0_only": metadata.get("physical_render") == "d0_only",
        "metadata_direction_baking_not_started": metadata.get("direction_baking") == "NOT_STARTED",
        "root_geometry_state_unreviewed": root.get("geometry_state") == GEOMETRY_STATE,
        "root_user_approval_unreviewed": root.get("user_approval") == USER_APPROVAL,
        "root_physical_direction_d0": root.get("physical_direction") == PHYSICAL_DIRECTION,
        "root_rotation_mode_xyz": root.rotation_mode == "XYZ",
        "root_pitch_yaw_roll_zero": close_vector(root.rotation_euler, (0.0, 0.0, 0.0)),
        "root_rotation_property_zero": close_vector(root_property_rotation, (0.0, 0.0, 0.0)),
        "normalization_parented_to_root": normalization.parent == root,
        "normalization_pitch_roll_zero": close(actual_normalization_degrees[0], 0.0, 2e-4)
        and close(actual_normalization_degrees[1], 0.0, 2e-4),
        "normalization_yaw_matches_metadata": isinstance(metadata_source_yaw, (int, float))
        and close(actual_normalization_degrees[2], float(metadata_source_yaw), 2e-4),
        "normalization_uniform_scale_matches_metadata": isinstance(
            normalization_info.get("uniform_scale"), (int, float)
        )
        and close_vector(
            normalization.scale,
            [float(normalization_info["uniform_scale"])] * 3,
        ),
        "normalization_preserves_proportions": normalization_info.get("proportions_changed") is False,
        "complete_hierarchy_matches_metadata": expected_rows_valid,
        "complete_hierarchy_parented": import_info.get("complete_hierarchy_parented") is True
        and normalization.parent == root
        and all(obj in descendants(normalization) for obj in imported_objects),
        "imported_object_count_matches": len(imported_objects) == import_info.get("imported_object_count"),
        "imported_top_level_count_matches": len(actual_top_level_names)
        == import_info.get("imported_top_level_count"),
        "imported_top_level_names_match": sorted(actual_top_level_names)
        == sorted(require_list(import_info.get("imported_top_level_names"), "import.imported_top_level_names")),
        "mesh_object_count_matches": len(mesh_objects) == import_info.get("mesh_object_count"),
        "mesh_vertex_count_matches": sum(len(obj.data.vertices) for obj in mesh_objects)
        == import_info.get("vertices"),
        "mesh_edge_count_matches": sum(len(obj.data.edges) for obj in mesh_objects)
        == import_info.get("edges"),
        "mesh_polygon_count_matches": sum(len(obj.data.polygons) for obj in mesh_objects)
        == import_info.get("polygons"),
        "camera_orthographic": camera.type == "CAMERA" and camera.data.type == "ORTHO",
        "camera_metadata_orthographic": camera_info.get("projection") == "ORTHOGRAPHIC",
        "camera_rotation_mode_xyz": camera.rotation_mode == "XYZ"
        and camera_info.get("blender_rotation_mode") == "XYZ",
        "camera_euler_xyz_60_0_45": close_vector(actual_camera_degrees, CAMERA_EULER_XYZ_DEG, 2e-4)
        and close_vector(expected_camera_degrees, CAMERA_EULER_XYZ_DEG, 2e-4),
        "camera_game_angles_exact": close(float(camera_info.get("game_yaw_deg", math.inf)), 45.0)
        and close(float(camera_info.get("optical_pitch_down_deg", math.inf)), 30.0)
        and close(float(camera_info.get("roll_deg", math.inf)), 0.0),
        "render_canvas_1024": scene.render.resolution_x == CANVAS_PX
        and scene.render.resolution_y == CANVAS_PX
        and scene.render.resolution_percentage == 100,
        "render_png_rgba": scene.render.image_settings.file_format == "PNG"
        and scene.render.image_settings.color_mode == "RGBA",
        "render_transparent": scene.render.film_transparent is True,
        "render_pixel_aspect_square": close(scene.render.pixel_aspect_x, 1.0)
        and close(scene.render.pixel_aspect_y, 1.0),
        "original_render_matches_metadata": original_render == metadata_original_path
        and outputs_info.get("render_sha256") == original_sha256
        and outputs_info.get("render_bytes") == original_render.stat().st_size,
    }

    hierarchy_payload = [
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "children": [child.name for child in obj.children],
        }
        for obj in hierarchy
    ]
    base_payload: dict[str, Any] = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": GEOMETRY_STATE,
        "user_approval": USER_APPROVAL,
        "physical_direction": PHYSICAL_DIRECTION,
        "checks": checks,
        "hierarchy": hierarchy_payload,
        "mesh": {
            "objects": len(mesh_objects),
            "vertices": sum(len(obj.data.vertices) for obj in mesh_objects),
            "edges": sum(len(obj.data.edges) for obj in mesh_objects),
            "polygons": sum(len(obj.data.polygons) for obj in mesh_objects),
        },
        "normalization": {
            "name": normalization_name,
            "euler_xyz_deg": [round(value, 8) for value in actual_normalization_degrees],
            "scale_xyz": [round(float(value), 8) for value in normalization.scale],
        },
        "camera": {
            "name": camera.name,
            "projection": camera.data.type,
            "rotation_mode": camera.rotation_mode,
            "euler_xyz_deg": [round(value, 8) for value in actual_camera_degrees],
            "ortho_scale": float(camera.data.ortho_scale),
        },
        "source_glb": {
            "path": str(source_glb),
            "sha256": actual_glb_sha256,
            "bytes": actual_glb_bytes,
            "mode_octal": oct(actual_glb_mode),
        },
        "inputs": {
            "provider_result": str(provider_path),
            "import_metadata": str(metadata_path),
            "original_render": str(original_render),
        },
        "stop_gate": GEOMETRY_STATE,
    }

    failures = [name for name, passed in checks.items() if not passed]
    if failures:
        base_payload.update({"status": "FAIL", "failures": failures})
        report_path.write_text(json.dumps(base_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        raise RuntimeError(f"reopen checks failed: {failures}; report: {report_path}")

    scene.render.filepath = str(reopen_render)
    bpy.ops.render.render(write_still=True)
    reopen_sha256 = sha256_file(reopen_render)
    original_size, original_pixels = decoded_pixels(bpy, original_render)
    reopen_size, reopen_pixels = decoded_pixels(bpy, reopen_render)
    same_length = len(original_pixels) == len(reopen_pixels)
    max_abs_pixel_diff = (
        max((abs(left - right) for left, right in zip(original_pixels, reopen_pixels)), default=0.0)
        if same_length
        else None
    )
    pixels_identical = original_size == reopen_size and same_length and original_pixels == reopen_pixels
    checks["reopen_render_1024"] = reopen_size == (CANVAS_PX, CANVAS_PX)
    checks["reopen_render_decoded_pixels_identical"] = pixels_identical

    failures = [name for name, passed in checks.items() if not passed]
    base_payload.update(
        {
            "status": "PASS" if not failures else "FAIL",
            "failures": failures,
            "renders": {
                "original": str(original_render),
                "original_sha256": original_sha256,
                "reopen": str(reopen_render),
                "reopen_sha256": reopen_sha256,
                "byte_identical": original_sha256 == reopen_sha256,
                "decoded_pixels_identical": pixels_identical,
                "max_abs_decoded_pixel_diff": max_abs_pixel_diff,
            },
        }
    )
    report_path.write_text(json.dumps(base_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if failures:
        raise RuntimeError(f"reopened render changed: {failures}; report: {report_path}")

    print(
        json.dumps(
            {
                "asset_id": args.asset_id,
                "status": "PASS",
                "output": str(report_path),
                "render_sha256": reopen_sha256,
                "decoded_pixels_identical": True,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
