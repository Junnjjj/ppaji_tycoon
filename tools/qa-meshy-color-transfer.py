#!/usr/bin/env python3
"""Normalize and fail-closed QA a four-view ImageGen color guide.

The physical Blender renders remain geometry authority.  This tool never edits
geometry: it extracts the generated background, aligns each generated panel by
one uniform scale/translation, reapplies the physical alpha, records metrics,
and builds a user-review board.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


DIRECTIONS = ("d0", "d1", "d2", "d3")
LAYOUT = {"d0": (0, 0), "d1": (1, 0), "d2": (0, 1), "d3": (1, 1)}
QA_PROJECTION = Path(
    "/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/scripts/qa_projection.py"
)
PHYSICAL_SIZE = 1024


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--physical-dir", type=Path, required=True)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--material-reference", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--prompt", type=Path)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise RuntimeError("Empty alpha mask")
    return bbox


def binary_alpha(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value > 8 else 0)


def iou(a: Image.Image, b: Image.Image) -> float:
    intersection = 0
    union = 0
    for av, bv in zip(a.getdata(), b.getdata()):
        af = av > 0
        bf = bv > 0
        intersection += int(af and bf)
        union += int(af or bf)
    return intersection / union if union else 0.0


def derive_border_background_alpha(rgb: Image.Image) -> Image.Image:
    """Remove only bright near-neutral background connected to the border."""
    eligible = Image.new("L", rgb.size)
    eligible.putdata(
        [
            255 if min(pixel) >= 220 and max(pixel) - min(pixel) <= 24 else 0
            for pixel in rgb.getdata()
        ]
    )
    # Mark eligible border regions. Four seeds tolerate a colored corner.
    for seed in ((0, 0), (rgb.width - 1, 0), (0, rgb.height - 1), (rgb.width - 1, rgb.height - 1)):
        if eligible.getpixel(seed) == 255:
            ImageDraw.floodfill(eligible, seed, 128, thresh=0)
    alpha = eligible.point(lambda value: 0 if value == 128 else 255)
    return alpha.filter(ImageFilter.MedianFilter(3))


def align_to_physical(raw_panel: Image.Image, physical: Image.Image):
    raw_bbox = alpha_bbox(raw_panel)
    physical_bbox = alpha_bbox(physical)
    raw_width = raw_bbox[2] - raw_bbox[0]
    raw_height = raw_bbox[3] - raw_bbox[1]
    physical_width = physical_bbox[2] - physical_bbox[0]
    physical_height = physical_bbox[3] - physical_bbox[1]
    scale = math.sqrt((physical_width * physical_height) / (raw_width * raw_height))
    crop = raw_panel.crop(raw_bbox)
    size = (max(1, round(raw_width * scale)), max(1, round(raw_height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    center = (
        (physical_bbox[0] + physical_bbox[2]) / 2.0,
        (physical_bbox[1] + physical_bbox[3]) / 2.0,
    )
    position = (round(center[0] - size[0] / 2.0), round(center[1] - size[1] / 2.0))
    aligned = Image.new("RGBA", physical.size, (0, 0, 0, 0))
    aligned.alpha_composite(crop, position)
    raw_aspect = raw_width / raw_height
    physical_aspect = physical_width / physical_height
    return aligned, {
        "raw_bbox_xyxy": list(raw_bbox),
        "physical_bbox_xyxy": list(physical_bbox),
        "raw_bbox_aspect": round(raw_aspect, 8),
        "physical_bbox_aspect": round(physical_aspect, 8),
        "bbox_aspect_drift_ratio": round(abs(raw_aspect / physical_aspect - 1.0), 8),
        "uniform_alignment_scale": round(scale, 8),
        "alignment_translation_xy": list(position),
        "nonuniform_panel_fit_used": False,
    }


def projection(path: Path) -> dict:
    try:
        completed = subprocess.run(
            ["python3", str(QA_PROJECTION), "--layout", "single", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(completed.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return {"overall": "WARN_MEASUREMENT_FAILED", "error": str(exc)}


def overlay(physical_mask: Image.Image, generated_mask: Image.Image) -> Image.Image:
    result = Image.new("RGBA", physical_mask.size, (18, 22, 29, 255))
    pixels = []
    for physical, generated in zip(physical_mask.getdata(), generated_mask.getdata()):
        p = physical > 0
        g = generated > 0
        if p and g:
            pixels.append((225, 235, 238, 255))
        elif p:
            pixels.append((0, 235, 255, 255))
        elif g:
            pixels.append((255, 64, 74, 255))
        else:
            pixels.append((18, 22, 29, 255))
    result.putdata(pixels)
    return result


def font(size: int):
    path = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default()


def four_up(images: dict[str, Image.Image], path: Path) -> None:
    sheet = Image.new("RGBA", (PHYSICAL_SIZE * 2, PHYSICAL_SIZE * 2), (0, 0, 0, 0))
    for direction, image in images.items():
        column, row = LAYOUT[direction]
        sheet.alpha_composite(image, (column * PHYSICAL_SIZE, row * PHYSICAL_SIZE))
    sheet.save(path, optimize=True)


def main() -> None:
    args = parse_args()
    physical_dir = args.physical_dir.resolve()
    raw_path = args.raw.resolve()
    material_reference = args.material_reference.resolve()
    output_dir = args.output_dir.resolve()
    if not raw_path.is_file() or not material_reference.is_file():
        raise FileNotFoundError("Raw ImageGen output or material reference is missing")
    for direction in DIRECTIONS:
        path = physical_dir / f"{direction}.png"
        if not path.is_file():
            raise FileNotFoundError(path)

    directories = {
        name: output_dir / name
        for name in ("extracted", "aligned", "locked", "overlays", "evidence")
    }
    for directory in directories.values():
        directory.mkdir(parents=True, exist_ok=True)

    source = Image.open(raw_path)
    source_mode = source.mode
    source_bands = source.getbands()
    source_rgba = source.convert("RGBA")
    if source.width % 2 or source.height % 2:
        raise RuntimeError(f"Raw four-up has odd dimensions: {source.size}")
    if "A" not in source_bands or source_rgba.getchannel("A").getextrema() == (255, 255):
        source_rgba.putalpha(derive_border_background_alpha(source.convert("RGB")))
        background_method = "border-connected bright near-neutral flood; median 3x3"
    else:
        background_method = "provider RGBA alpha preserved"

    extracted_sheet_path = directories["extracted"] / f"{args.asset_id}-four-direction-color-guide-alpha.png"
    source_rgba.save(extracted_sheet_path, optimize=True)
    cell_width = source.width // 2
    cell_height = source.height // 2

    results: dict[str, dict[str, object]] = {}
    aligned_images: dict[str, Image.Image] = {}
    locked_images: dict[str, Image.Image] = {}
    overlays: dict[str, Image.Image] = {}
    for direction in DIRECTIONS:
        column, row = LAYOUT[direction]
        box = (
            column * cell_width,
            row * cell_height,
            (column + 1) * cell_width,
            (row + 1) * cell_height,
        )
        raw_panel = source_rgba.crop(box)
        raw_panel_path = directories["extracted"] / f"{direction}.png"
        raw_panel.save(raw_panel_path, optimize=True)
        physical = Image.open(physical_dir / f"{direction}.png").convert("RGBA")
        if physical.size != (PHYSICAL_SIZE, PHYSICAL_SIZE):
            raise RuntimeError(f"Unexpected physical canvas for {direction}: {physical.size}")
        aligned, metrics = align_to_physical(raw_panel, physical)
        aligned_path = directories["aligned"] / f"{direction}.png"
        aligned.save(aligned_path, optimize=True)
        physical_mask = binary_alpha(physical)
        aligned_mask = binary_alpha(aligned)
        raw_iou = iou(physical_mask, aligned_mask)
        silhouette = overlay(physical_mask, aligned_mask)
        overlay_path = directories["overlays"] / f"silhouette-{direction}.png"
        silhouette.save(overlay_path, optimize=True)
        locked = aligned.copy()
        locked.putalpha(physical.getchannel("A"))
        locked_path = directories["locked"] / f"{direction}.png"
        locked.save(locked_path, optimize=True)
        locked_iou = iou(physical_mask, binary_alpha(locked))
        projection_result = projection(raw_panel_path)
        thresholds = {
            "raw_silhouette_iou_at_least_0_90": raw_iou >= 0.90,
            "bbox_aspect_drift_at_most_0_05": metrics["bbox_aspect_drift_ratio"] <= 0.05,
            "locked_physical_alpha_iou_1_000": abs(locked_iou - 1.0) < 1e-9,
        }
        results[direction] = {
            **metrics,
            "raw_silhouette_iou": round(raw_iou, 8),
            "locked_physical_alpha_iou": round(locked_iou, 8),
            "projection": projection_result,
            "thresholds": thresholds,
            "geometry_gate": "PASS" if all(thresholds.values()) else "FAIL",
            "internal_structure_review": "PENDING_USER_REVIEW",
            "paths": {
                "raw_extracted": str(raw_panel_path),
                "aligned": str(aligned_path),
                "locked": str(locked_path),
                "silhouette_overlay": str(overlay_path),
            },
            "hashes": {
                "raw_extracted": sha256_file(raw_panel_path),
                "aligned": sha256_file(aligned_path),
                "locked": sha256_file(locked_path),
                "silhouette_overlay": sha256_file(overlay_path),
            },
        }
        aligned_images[direction] = aligned
        locked_images[direction] = locked
        overlays[direction] = silhouette

    aligned_sheet = directories["aligned"] / f"{args.asset_id}-four-direction-aligned.png"
    locked_sheet = directories["locked"] / f"{args.asset_id}-four-direction-physical-alpha-locked.png"
    overlay_sheet = directories["overlays"] / "silhouette-four-direction.png"
    four_up(aligned_images, aligned_sheet)
    four_up(locked_images, locked_sheet)
    four_up(overlays, overlay_sheet)

    tile = 420
    header = 54
    review = Image.new("RGBA", (tile * 3, (tile + header) * 4), (22, 26, 34, 255))
    draw = ImageDraw.Draw(review)
    label_font = font(22)
    columns = ("PHYSICAL CLAY", "RAW GPT ALIGNED", "PHYSICAL ALPHA LOCK")
    for row, direction in enumerate(DIRECTIONS):
        sources = (
            Image.open(physical_dir / f"{direction}.png").convert("RGBA"),
            aligned_images[direction],
            locked_images[direction],
        )
        y = row * (tile + header)
        for column, (label, image) in enumerate(zip(columns, sources)):
            x = column * tile
            review.alpha_composite(image.resize((tile, tile), Image.Resampling.LANCZOS), (x, y + header))
            draw.text((x + 10, y + 12), f"{direction.upper()}  {label}", font=label_font, fill=(242, 246, 252, 255))
    review_path = directories["evidence"] / "physical-vs-color-guide-review.png"
    review.save(review_path, optimize=True)

    d0_failed = results["d0"]["geometry_gate"] == "FAIL"
    qa = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "state": "COLOR_GUIDE_USER_REVIEW",
        "use_case": "ordinary_four_view_color_transfer_first_pass",
        "built_in_imagegen": True,
        "inputs": {
            "primary_geometry_authority": str(physical_dir.parent / "directional" / "clay-4up-clean.png"),
            "additional_material_reference": str(material_reference),
            "prompt": str(args.prompt.resolve()) if args.prompt else None,
        },
        "raw_output": {
            "path": str(raw_path),
            "sha256": sha256_file(raw_path),
            "size_px": list(source.size),
            "mode": source_mode,
            "bands": list(source_bands),
        },
        "deterministic_background_extraction": {
            "path": str(extracted_sheet_path),
            "method": background_method,
            "generative_cleanup_used": False,
        },
        "directions": results,
        "all_geometric_direction_gates_pass": all(item["geometry_gate"] == "PASS" for item in results.values()),
        "same_view_d0_bias_gate": {
            "d0_geometry_failed": d0_failed,
            "mandatory_adjacent_view_trial": d0_failed,
            "status": "TRIGGER_D0_ADJACENT_REFERENCE_DIAGNOSIS" if d0_failed else "NOT_TRIGGERED_D0_PASSED_GEOMETRY_METRICS",
        },
        "locked_guide": {"path": str(locked_sheet), "sha256": sha256_file(locked_sheet)},
        "review_evidence": {"path": str(review_path), "sha256": sha256_file(review_path)},
        "overall": "COLOR_GUIDE_USER_REVIEW",
        "production_approved": False,
        "runtime_adoption_started": False,
    }
    (output_dir / "qa.json").write_text(json.dumps(qa, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"asset_id": args.asset_id, "overall": qa["overall"], "d0_fallback": qa["same_view_d0_bias_gate"]}, sort_keys=True))


if __name__ == "__main__":
    main()
