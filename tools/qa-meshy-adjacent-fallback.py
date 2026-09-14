#!/usr/bin/env python3
"""Fail-closed QA for one adjacent-view ImageGen color fallback.

The target physical render remains the sole silhouette authority.  The
adjacent colored direction supplies material/color cues only.  This tool does
not approve a candidate: it extracts the generated background, applies one
uniform scale/translation, locks the target physical alpha, records texture
diagnostics, and emits a user-review board.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


QA_PROJECTION = Path(
    "/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/scripts/qa_projection.py"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--target-direction", required=True)
    parser.add_argument("--reference-direction", required=True)
    parser.add_argument("--physical", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--initial", type=Path, required=True)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--generation-source", type=Path, required=True)
    parser.add_argument("--prompt", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def binary_alpha(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value > 8 else 0)


def derive_border_background_alpha(rgb: Image.Image) -> Image.Image:
    eligible = Image.new("L", rgb.size)
    eligible.putdata(
        [
            255 if min(pixel) >= 220 and max(pixel) - min(pixel) <= 24 else 0
            for pixel in rgb.getdata()
        ]
    )
    for seed in (
        (0, 0),
        (rgb.width - 1, 0),
        (0, rgb.height - 1),
        (rgb.width - 1, rgb.height - 1),
    ):
        if eligible.getpixel(seed) == 255:
            ImageDraw.floodfill(eligible, seed, 128, thresh=0)
    return eligible.point(lambda value: 0 if value == 128 else 255).filter(ImageFilter.MedianFilter(3))


def iou(a: Image.Image, b: Image.Image) -> float:
    intersection = union = 0
    for av, bv in zip(a.getdata(), b.getdata()):
        af = av > 0
        bf = bv > 0
        intersection += int(af and bf)
        union += int(af or bf)
    return intersection / union if union else 0.0


def align(source: Image.Image, physical: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    source_bbox = binary_alpha(source).getbbox()
    physical_bbox = binary_alpha(physical).getbbox()
    if source_bbox is None or physical_bbox is None:
        raise RuntimeError("Cannot align empty silhouette")
    sw = source_bbox[2] - source_bbox[0]
    sh = source_bbox[3] - source_bbox[1]
    pw = physical_bbox[2] - physical_bbox[0]
    ph = physical_bbox[3] - physical_bbox[1]
    scale = math.sqrt((pw * ph) / (sw * sh))
    crop = source.crop(source_bbox)
    size = (max(1, round(sw * scale)), max(1, round(sh * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    center = ((physical_bbox[0] + physical_bbox[2]) / 2, (physical_bbox[1] + physical_bbox[3]) / 2)
    position = (round(center[0] - size[0] / 2), round(center[1] - size[1] / 2))
    aligned = Image.new("RGBA", physical.size, (0, 0, 0, 0))
    aligned.alpha_composite(crop, position)
    source_aspect = sw / sh
    physical_aspect = pw / ph
    return aligned, {
        "source_bbox_xyxy": list(source_bbox),
        "physical_bbox_xyxy": list(physical_bbox),
        "source_bbox_aspect": round(source_aspect, 8),
        "physical_bbox_aspect": round(physical_aspect, 8),
        "bbox_aspect_drift_ratio": round(abs(source_aspect / physical_aspect - 1.0), 8),
        "uniform_scale": round(scale, 8),
        "translation_xy": list(position),
        "nonuniform_fit_used": False,
    }


def projection(path: Path) -> dict[str, object]:
    try:
        result = subprocess.run(
            ["python3", str(QA_PROJECTION), "--layout", "single", str(path)],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return {"overall": "WARN_MEASUREMENT_FAILED", "error": str(exc)}


def silhouette_overlay(physical: Image.Image, candidate: Image.Image) -> Image.Image:
    p_mask = binary_alpha(physical)
    c_mask = binary_alpha(candidate)
    output = Image.new("RGBA", physical.size, (18, 22, 29, 255))
    pixels = []
    for p, c in zip(p_mask.getdata(), c_mask.getdata()):
        if p and c:
            pixels.append((230, 237, 240, 255))
        elif p:
            pixels.append((0, 235, 255, 255))
        elif c:
            pixels.append((255, 58, 70, 255))
        else:
            pixels.append((18, 22, 29, 255))
    output.putdata(pixels)
    return output


def texture_stats(image: Image.Image) -> dict[str, float | int]:
    rgba = image.convert("RGBA")
    opaque_rgb = [pixel[:3] for pixel in rgba.getdata() if pixel[3] > 8]
    if not opaque_rgb:
        raise RuntimeError("No opaque pixels for texture diagnostics")
    quantized = {(r >> 3, g >> 3, b >> 3) for r, g, b in opaque_rgb}
    saturation = value = 0.0
    for red, green, blue in opaque_rgb:
        _, sat, val = colorsys.rgb_to_hsv(red / 255.0, green / 255.0, blue / 255.0)
        saturation += sat
        value += val
    grayscale = rgba.convert("L")
    edges = grayscale.filter(ImageFilter.FIND_EDGES)
    alpha = rgba.getchannel("A")
    edge_values = [edge for edge, a in zip(edges.getdata(), alpha.getdata()) if a > 8]
    return {
        "opaque_pixels": len(opaque_rgb),
        "quantized_5bit_colors": len(quantized),
        "mean_saturation": round(saturation / len(opaque_rgb), 8),
        "mean_value": round(value / len(opaque_rgb), 8),
        "strong_edge_share": round(sum(1 for edge in edge_values if edge >= 32) / len(edge_values), 8),
        "mean_edge_energy": round(sum(edge_values) / len(edge_values), 8),
    }


def relative_change(target: dict[str, float | int], reference: dict[str, float | int]) -> dict[str, float]:
    keys = ("quantized_5bit_colors", "mean_saturation", "mean_value", "strong_edge_share", "mean_edge_energy")
    return {
        key: round(float(target[key]) / float(reference[key]) - 1.0, 8) if reference[key] else 0.0
        for key in keys
    }


def font(size: int):
    path = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default()


def main() -> None:
    args = parse_args()
    paths = {
        "physical": args.physical.resolve(),
        "reference": args.reference.resolve(),
        "initial": args.initial.resolve(),
        "raw": args.raw.resolve(),
        "generation_source": args.generation_source.resolve(),
        "prompt": args.prompt.resolve(),
    }
    for path in paths.values():
        if not path.is_file():
            raise FileNotFoundError(path)

    output_dir = args.output_dir.resolve()
    directories = {name: output_dir / name for name in ("extracted", "aligned", "locked", "overlays", "evidence")}
    for directory in directories.values():
        directory.mkdir(parents=True, exist_ok=True)

    physical = Image.open(paths["physical"]).convert("RGBA")
    reference = Image.open(paths["reference"]).convert("RGBA")
    initial = Image.open(paths["initial"]).convert("RGBA")
    source = Image.open(paths["raw"])
    source_mode = source.mode
    source_bands = source.getbands()
    extracted = source.convert("RGBA")
    if "A" not in source_bands or extracted.getchannel("A").getextrema() == (255, 255):
        extracted.putalpha(derive_border_background_alpha(source.convert("RGB")))
        background_method = "border-connected bright near-neutral flood; median 3x3"
    else:
        background_method = "provider RGBA alpha preserved"

    stem = f"{args.target_direction}-from-{args.reference_direction}"
    extracted_path = directories["extracted"] / f"{stem}.png"
    aligned_path = directories["aligned"] / f"{stem}.png"
    locked_path = directories["locked"] / f"{stem}.png"
    overlay_path = directories["overlays"] / f"silhouette-{stem}.png"
    extracted.save(extracted_path, optimize=True)
    aligned, bbox = align(extracted, physical)
    aligned.save(aligned_path, optimize=True)
    locked = aligned.copy()
    locked.putalpha(physical.getchannel("A"))
    locked.save(locked_path, optimize=True)
    overlay = silhouette_overlay(physical, aligned)
    overlay.save(overlay_path, optimize=True)

    raw_iou = iou(binary_alpha(physical), binary_alpha(aligned))
    locked_iou = iou(binary_alpha(physical), binary_alpha(locked))
    projection_result = projection(extracted_path)
    thresholds = {
        "raw_silhouette_iou_at_least_0_90": raw_iou >= 0.90,
        "bbox_aspect_drift_at_most_0_05": bbox["bbox_aspect_drift_ratio"] <= 0.05,
        "locked_physical_alpha_iou_1_000": abs(locked_iou - 1.0) < 1e-9,
    }
    geometry_gate = "PASS" if all(thresholds.values()) else "FAIL"

    candidate_texture = texture_stats(locked)
    reference_texture = texture_stats(reference)
    initial_texture = texture_stats(initial)
    texture = {
        "fallback_locked": candidate_texture,
        "validated_adjacent_reference": reference_texture,
        "failed_initial_target": initial_texture,
        "relative_to_adjacent_reference": relative_change(candidate_texture, reference_texture),
        "relative_to_initial_target": relative_change(candidate_texture, initial_texture),
        "status": "DIAGNOSTIC_ONLY_PENDING_NATIVE_SCALE_USER_REVIEW",
    }

    tile = 320
    header = 64
    labels_and_images = (
        (f"{args.target_direction.upper()} PHYSICAL", physical),
        ("INITIAL LOCKED", initial),
        ("FALLBACK ALIGNED", aligned),
        ("FALLBACK ALPHA LOCK", locked),
        (f"VALIDATED {args.reference_direction.upper()} COLOR", reference),
    )
    review = Image.new("RGBA", (tile * len(labels_and_images), tile + header), (22, 26, 34, 255))
    draw = ImageDraw.Draw(review)
    label_font = font(18)
    for column, (label, image) in enumerate(labels_and_images):
        x = column * tile
        review.alpha_composite(image.resize((tile, tile), Image.Resampling.LANCZOS), (x, header))
        draw.text((x + 10, 18), label, font=label_font, fill=(244, 247, 252, 255))
    review_path = directories["evidence"] / "adjacent-fallback-review.png"
    review.save(review_path, optimize=True)

    imagegen_record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "built_in_imagegen": True,
        "mode": "image_edit_two_inputs",
        "target_geometry_authority": str(paths["physical"]),
        "validated_adjacent_color_authority": str(paths["reference"]),
        "prompt": str(paths["prompt"]),
        "provider_output_preserved": str(paths["generation_source"]),
        "workspace_copy": str(paths["raw"]),
        "hashes": {key: sha256_file(path) for key, path in paths.items()},
    }
    (output_dir / "imagegen-execution-record.json").write_text(
        json.dumps(imagegen_record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    qa = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "state": "COLOR_GUIDE_USER_REVIEW",
        "use_case": "bounded_adjacent_view_color_fallback",
        "target_direction": args.target_direction,
        "reference_direction": args.reference_direction,
        "original_failed_candidate_preserved": True,
        "reference_was_prevalidated_geometry": True,
        "geometry_authority": str(paths["physical"]),
        "color_authority_only": str(paths["reference"]),
        "raw_output": {
            "path": str(paths["raw"]),
            "sha256": sha256_file(paths["raw"]),
            "mode": source_mode,
            "bands": list(source_bands),
            "size_px": list(source.size),
        },
        "background_extraction": {"method": background_method, "generative_cleanup_used": False},
        "bbox": bbox,
        "raw_silhouette_iou": round(raw_iou, 8),
        "locked_physical_alpha_iou": round(locked_iou, 8),
        "projection": projection_result,
        "thresholds": thresholds,
        "geometry_gate": geometry_gate,
        "texture_diagnostics": texture,
        "paths": {
            "extracted": str(extracted_path),
            "aligned": str(aligned_path),
            "locked": str(locked_path),
            "silhouette_overlay": str(overlay_path),
            "review": str(review_path),
        },
        "hashes": {
            "extracted": sha256_file(extracted_path),
            "aligned": sha256_file(aligned_path),
            "locked": sha256_file(locked_path),
            "silhouette_overlay": sha256_file(overlay_path),
            "review": sha256_file(review_path),
        },
        "selection_status": "PENDING_USER_REVIEW",
        "production_approved": False,
        "runtime_adoption_started": False,
    }
    (output_dir / "qa.json").write_text(json.dumps(qa, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"asset_id": args.asset_id, "geometry_gate": geometry_gate, "selection_status": qa["selection_status"]}, sort_keys=True))


if __name__ == "__main__":
    main()
