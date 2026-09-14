#!/usr/bin/env python3
"""Compose fail-closed physical d0-d3 evidence and ImageGen-ready clay input.

This command does not call ImageGen.  It produces the clean, unlabeled physical
2x2 target that a later approval-gated styling pass may edit panel by panel,
plus a separately labeled user-review board and machine-readable evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFont


STATE = "PHYSICAL_DIRECTIONS_USER_REVIEW"
DIRECTIONS = ("d0", "d1", "d2", "d3")
YAW_BY_DIRECTION = {"d0": 0, "d1": 90, "d2": 180, "d3": 270}
LAYOUT = {"d0": (0, 0), "d1": (1, 0), "d2": (0, 1), "d3": (1, 1)}
CANVAS_PX = 1024
DEFAULT_PROJECTION_TOOL = Path(
    "/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/scripts/qa_projection.py"
)


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


def load_rgba(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    if image.size != (CANVAS_PX, CANVAS_PX):
        raise RuntimeError(f"expected {CANVAS_PX}x{CANVAS_PX} render: {path}, got {image.size}")
    if image.getchannel("A").getbbox() is None:
        raise RuntimeError(f"render has empty alpha: {path}")
    return image


def font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf") if bold else Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def alpha_record(image: Image.Image) -> dict[str, Any]:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError("empty alpha")
    histogram = alpha.histogram()
    return {
        "bbox_xyxy": list(bbox),
        "bbox_width_height": [bbox[2] - bbox[0], bbox[3] - bbox[1]],
        "foreground_pixels_alpha_gt_zero": sum(histogram[1:]),
        "alpha_extrema": list(alpha.getextrema()),
        "silhouette_bottom_center_xy": [round((bbox[0] + bbox[2]) / 2.0, 4), bbox[3] - 1],
    }


def projection_diagnostic(tool: Path, image: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, str(tool), "--layout", "single", str(image)],
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        return {
            "overall": "ERROR",
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        return {
            "overall": "ERROR",
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "parse_error": str(error),
        }
    if not isinstance(payload, dict):
        raise RuntimeError(f"projection tool returned non-object JSON for {image}")
    payload["returncode"] = completed.returncode
    return payload


def input_record(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compose physical d0-d3 review evidence.")
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--import-metadata", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--projection-tool", type=Path, default=DEFAULT_PROJECTION_TOOL)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not re.fullmatch(r"[a-z0-9_]+", args.asset_id):
        raise SystemExit("asset id must contain only lowercase letters, digits, and underscores")
    metadata_path = args.import_metadata.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    physical_dir = output_dir / "physical"
    directional_dir = output_dir / "directional"
    evidence_dir = output_dir / "evidence"
    overlays_dir = output_dir / "overlays"
    for path in (directional_dir, evidence_dir, overlays_dir):
        path.mkdir(parents=True, exist_ok=True)

    rotations_path = output_dir / "physical-rotations.json"
    reopen_path = directional_dir / "directional-reopen-verification.json"
    union_path = output_dir / "union-canvas.json"
    metadata = read_json(metadata_path)
    rotations = read_json(rotations_path)
    reopen = read_json(reopen_path)
    union = read_json(union_path)
    for label, payload in (
        ("d0 metadata", metadata),
        ("physical rotations", rotations),
        ("reopen verification", reopen),
        ("union canvas", union),
    ):
        if payload.get("asset_id") != args.asset_id:
            raise RuntimeError(f"{label} asset id mismatch")
    if rotations.get("geometry_state") != STATE or reopen.get("geometry_state") != STATE:
        raise RuntimeError(f"direction package must remain at {STATE}")
    if reopen.get("status") != "PASS_INDEPENDENT_REOPEN_EXACT":
        raise RuntimeError("independent Blender reopen did not pass exact decoded-pixel verification")
    reopen_checks = mapping(reopen.get("checks"), "reopen checks")
    if not reopen_checks or not all(value is True for value in reopen_checks.values()):
        raise RuntimeError("independent reopen has non-PASS checks")

    rotation_directions = mapping(rotations.get("directions"), "physical rotations directions")
    reopen_directions = mapping(reopen.get("directions"), "reopen directions")
    images: dict[str, Image.Image] = {}
    pixel_evidence: dict[str, dict[str, Any]] = {}
    alpha_evidence: dict[str, dict[str, Any]] = {}
    for direction in DIRECTIONS:
        yaw = YAW_BY_DIRECTION[direction]
        rotation_row = mapping(rotation_directions.get(direction), f"directions.{direction}")
        reopen_row = mapping(reopen_directions.get(direction), f"reopen directions.{direction}")
        if rotation_row.get("root_euler_xyz_deg") != [0.0, 0.0, float(yaw)]:
            raise RuntimeError(f"exact root Euler record is invalid for {direction}")
        original = Path(str(rotation_row.get("path", ""))).expanduser().resolve()
        reopened = Path(str(mapping(reopen_row.get("reopen"), "reopen image").get("path", ""))).expanduser().resolve()
        if sha256_file(original) != rotation_row.get("sha256"):
            raise RuntimeError(f"physical render hash changed for {direction}")
        original_image = load_rgba(original)
        reopen_image = load_rgba(reopened)
        difference = ImageChops.difference(original_image, reopen_image)
        max_abs = max(extrema[1] for extrema in difference.getextrema())
        exact = max_abs == 0
        blender_exact = mapping(
            reopen_row.get("decoded_pixel_comparison"), f"reopen pixel comparison {direction}"
        ).get("decoded_rgba_float_exact")
        if not exact or blender_exact is not True:
            raise RuntimeError(f"decoded RGBA changed after independent reopen for {direction}")
        images[direction] = original_image
        alpha_evidence[direction] = alpha_record(original_image)
        pixel_evidence[direction] = {
            "physical": input_record(original),
            "independent_reopen": input_record(reopened),
            "pillow_decoded_rgba_max_abs_diff": max_abs,
            "pillow_decoded_rgba_exact": exact,
            "blender_decoded_rgba_float_exact": blender_exact,
        }
    if len({row["physical"]["sha256"] for row in pixel_evidence.values()}) != 4:
        raise RuntimeError("physical d0-d3 hashes are not all unique")

    clean = Image.new("RGBA", (CANVAS_PX * 2, CANVAS_PX * 2), (0, 0, 0, 0))
    for direction, image in images.items():
        column, row = LAYOUT[direction]
        clean.alpha_composite(image, (column * CANVAS_PX, row * CANVAS_PX))
    clean_path = directional_dir / "clay-4up-clean.png"
    clean.save(clean_path, optimize=True)

    # Full-resolution labeled evidence remains separate from the clean ImageGen
    # edit target, so labels/guides can never leak into the styled asset.
    header = 112
    board = Image.new(
        "RGBA", (CANVAS_PX * 2, (CANVAS_PX + header) * 2), (23, 28, 36, 255)
    )
    draw = ImageDraw.Draw(board)
    title_font = font(38, bold=True)
    meta_font = font(23)
    for direction, image in images.items():
        column, row = LAYOUT[direction]
        x = column * CANVAS_PX
        y = row * (CANVAS_PX + header)
        board.alpha_composite(image, (x, y + header))
        draw.text(
            (x + 28, y + 16),
            f"{direction.upper()}  COMPLETE ROOT YAW {YAW_BY_DIRECTION[direction]}°",
            font=title_font,
            fill=(247, 250, 255, 255),
        )
        draw.text(
            (x + 28, y + 68),
            "fixed orthographic camera · game yaw 45° · pitch 30° · roll 0°",
            font=meta_font,
            fill=(137, 215, 235, 255),
        )
    review_path = evidence_dir / "physical-d0-d3-review.png"
    board.save(review_path, optimize=True)

    projection_tool = args.projection_tool.expanduser().resolve()
    if not projection_tool.is_file():
        raise RuntimeError(f"projection tool is missing: {projection_tool}")
    projection_results: dict[str, dict[str, Any]] = {}
    for direction, image in images.items():
        # qa_projection expects magenta as background; retain this exact input
        # as an auditable overlay rather than modifying the physical render.
        projection_image = Image.new("RGBA", image.size, (255, 0, 255, 255))
        projection_image.alpha_composite(image)
        projection_path = overlays_dir / f"projection-{direction}.png"
        projection_image.convert("RGB").save(projection_path, optimize=True)
        result = projection_diagnostic(projection_tool, projection_path)
        result["diagnostic_input"] = input_record(projection_path)
        projection_results[direction] = result
    projection_overalls = [str(row.get("overall", "ERROR")) for row in projection_results.values()]
    if "ERROR" in projection_overalls:
        projection_overall = "ERROR"
    elif "FAIL" in projection_overalls:
        projection_overall = "FAIL"
    elif "WARN" in projection_overalls:
        projection_overall = "WARN"
    else:
        projection_overall = "PASS"
    projection_record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "status": projection_overall,
        "diagnostic_only": True,
        "warning": (
            "Edge-family measurement does not prove physical rotation, semantic landmarks, "
            "geometry quality, or user approval. The exact camera metadata is recorded separately."
        ),
        "tool": input_record(projection_tool),
        "directions": projection_results,
    }
    projection_path = output_dir / "projection-validation.json"
    projection_path.write_text(
        json.dumps(projection_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    alpha_union = [CANVAS_PX, CANVAS_PX, 0, 0]
    for record in alpha_evidence.values():
        bbox = record["bbox_xyxy"]
        alpha_union[0] = min(alpha_union[0], bbox[0])
        alpha_union[1] = min(alpha_union[1], bbox[1])
        alpha_union[2] = max(alpha_union[2], bbox[2])
        alpha_union[3] = max(alpha_union[3], bbox[3])
    camera_record = mapping(rotations.get("camera"), "physical rotations camera")
    union.update(
        {
            "recorded_at_evidence_composition": utc_now(),
            "alpha_union_bbox_xyxy": alpha_union,
            "alpha_union_width_height": [
                alpha_union[2] - alpha_union[0],
                alpha_union[3] - alpha_union[1],
            ],
            "directions_alpha": alpha_evidence,
            "shared_physical_ground_anchor_screen_xy": camera_record.get(
                "root_ground_anchor_screen_xy"
            ),
            "alpha_union": "RECORDED",
            "clean_4up": {
                **input_record(clean_path),
                "canvas_px": list(clean.size),
                "layout": "d0 top-left, d1 top-right, d2 bottom-left, d3 bottom-right",
                "labels_or_guides": False,
                "purpose": "later approval-gated ImageGen physical edit target",
            },
        }
    )
    union_path.write_text(json.dumps(union, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    d0_root = metadata_path.parent.parent
    source_landmarks = d0_root / "landmarks-input.json"
    d0_correspondence = d0_root / "evidence" / "landmark-correspondence.json"
    inherited_records = {
        "landmarks_input": input_record(source_landmarks) if source_landmarks.is_file() else None,
        "dense_d0_correspondence": (
            input_record(d0_correspondence) if d0_correspondence.is_file() else None
        ),
    }
    landmark_record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "status": "UNREVIEWED_SEMANTIC_LANDMARK_CORRESPONDENCE",
        "physical_authority": {
            "complete_root": rotations.get("complete_root"),
            "same_complete_hierarchy_all_directions": True,
            "root_yaws_exact": True,
            "camera_fixed": True,
            "independent_reopen_exact": True,
        },
        "inherited_dense_d0_records": inherited_records,
        "directions": {
            direction: {
                "physical_render": pixel_evidence[direction]["physical"],
                "root_euler_xyz_deg": [0.0, 0.0, float(YAW_BY_DIRECTION[direction])],
                "same_physical_landmarks_guaranteed_by_one_root": True,
                "semantic_landmark_visual_review": "UNREVIEWED",
                "styled_candidate_comparison": "NOT_STARTED",
            }
            for direction in DIRECTIONS
        },
        "warning": (
            "Rigid root identity is proven, but access-side/count/occlusion correspondence still "
            "requires the labeled user review and later per-direction styled comparison."
        ),
    }
    landmark_path = output_dir / "landmark-correspondence.json"
    landmark_path.write_text(
        json.dumps(landmark_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    sources = mapping(metadata.get("sources"), "d0 metadata sources")
    approved = mapping(sources.get("approved_image"), "approved image")
    approved_path = Path(str(approved.get("path", ""))).expanduser().resolve()
    if not approved_path.is_file() or sha256_file(approved_path) != approved.get("sha256"):
        raise RuntimeError("approved concept image no longer matches d0 metadata")
    approved_record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "status": "APPROVED_CONCEPT_SOURCE_PRESERVED",
        "approved_image": input_record(approved_path),
        "use_at_this_gate": "palette/material reference only; no ImageGen call has started",
    }
    approved_path_record = output_dir / "approved-source.json"
    approved_path_record.write_text(
        json.dumps(approved_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    geometry_state = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "state": STATE,
        "user_dense_d0_decision": rotations.get("user_decision"),
        "directional_geometry_review": "UNREVIEWED",
        "semantic_landmark_review": "UNREVIEWED",
        "final_geometry_approval": "UNREVIEWED",
        "imagegen_started": False,
        "geometry_repair_started": False,
        "runtime_adoption_started": False,
        "next_allowed_action": "show labeled d0-d3 physical review board and obtain explicit user decision",
    }
    geometry_state_path = output_dir / "geometry-state.json"
    geometry_state_path.write_text(
        json.dumps(geometry_state, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    visual_review = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "status": "UNREVIEWED",
        "review_board": input_record(review_path),
        "required_user_checks": [
            "d0/d1/d2/d3 are the same object at root yaw 0/90/180/270",
            "door, counter, controls, opening, sign, and other asymmetric landmarks move cyclically",
            "rear-only or front-only surfaces are not duplicated to stay visible",
            "no unacceptable fused floor, float, hidden-side invention, or geometry defect is exposed",
        ],
        "user_decision": "UNREVIEWED",
        "imagegen_started": False,
    }
    visual_review_path = output_dir / "visual-review.json"
    visual_review_path.write_text(
        json.dumps(visual_review, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    manifest = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "geometry_state": STATE,
        "status": STATE,
        "physical_render_hashes_unique": True,
        "independent_reopen_exact": True,
        "projection_diagnostic": projection_overall,
        "semantic_landmarks": "UNREVIEWED",
        "user_direction_review": "UNREVIEWED",
        "clean_imagegen_target": input_record(clean_path),
        "labeled_review_board": input_record(review_path),
        "records": {
            "approved_source": input_record(approved_path_record),
            "geometry_state": input_record(geometry_state_path),
            "physical_rotations": input_record(rotations_path),
            "reopen_verification": input_record(reopen_path),
            "projection_validation": input_record(projection_path),
            "landmark_correspondence": input_record(landmark_path),
            "union_canvas": input_record(union_path),
            "visual_review": input_record(visual_review_path),
        },
        "pixel_evidence": pixel_evidence,
        "forbidden_work": {
            "meshy_called": False,
            "imagegen_called": False,
            "geometry_repaired": False,
            "live_game_modified": False,
        },
    }
    manifest_path = directional_dir / "physical-evidence-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": STATE,
                "asset_id": args.asset_id,
                "clean_imagegen_target": str(clean_path),
                "review_board": str(review_path),
                "manifest": str(manifest_path),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
