#!/usr/bin/env python3
"""Prepare the approved 20-facility d0-d3 live pack.

The current atlas is unpacked as the immutable baseline for unrelated assets.
The 20 approved facilities replace their legacy base frame atomically with
four density-2 frames derived from the locked physical-rotation color sources.
The script also writes the two JSON contract changes that must travel with the
sprite replacement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ATLAS = ROOT / "public/assets/kairo-atlas.png"
ATLAS_INDEX = ROOT / "public/assets/kairo-atlas.json"
PACK = ROOT / "assets/generated/kairo"
DATA = ROOT / "src/data/kairo-facilities.json"
RENDER = ROOT / "src/assets/kairo-render-contract.json"
FIT_ROOT = (
    ROOT
    / "artifacts/asset-concept-sheets/indoor-facilities-v1/runtime-fit-map-v1/runtime-sprites"
)
EVIDENCE = (
    ROOT
    / "artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/PREPARED.json"
)

DENSITY = 2
ASSET_IDS = [
    "toilet",
    "shower_row",
    "locker_row",
    "washbasin_row",
    "changing_row",
    "nursing",
    "infirmary",
    "sikhye",
    "snackbar",
    "chicken",
    "icecream",
    "cafe",
    "shop",
    "vending_in",
    "arcade",
    "karaoke",
    "pingpong",
    "info",
    "office",
    "storage",
]

# The four taller contracts are the maximum no-height-clip recommendations in
# runtime-fit-map-v1. Icecream/cafe are the separately user-approved footprints.
CONTRACT_OVERRIDES: dict[str, dict[str, Any]] = {
    "changing_row": {"canvas": [64, 58], "bodyH": 26},
    "locker_row": {"canvas": [80, 72], "bodyH": 32},
    "washbasin_row": {"canvas": [64, 56], "bodyH": 24},
    "sikhye": {"canvas": [48, 42], "bodyH": 18},
    "icecream": {"size": [1, 1], "canvas": [32, 36], "bodyH": 20},
    "cafe": {"size": [2, 2], "canvas": [64, 52], "bodyH": 20},
}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def asset_file(asset_id: str) -> str:
    return asset_id.replace("/", "__", 1).replace(":", "__", 1) + ".png"


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source has no alpha foreground")
    return bbox


def bottom_contact(image: Image.Image, threshold: int = 128) -> tuple[float, int]:
    alpha = image.getchannel("A")
    for y in range(alpha.height - 1, -1, -1):
        xs = [x for x in range(alpha.width) if alpha.getpixel((x, y)) >= threshold]
        if xs:
            return sum(xs) / len(xs), y
    raise ValueError("source has no opaque bottom contact")


def direction_size(size: list[int], direction: int) -> tuple[int, int]:
    return (size[1], size[0]) if direction % 2 else (size[0], size[1])


def normalize(
    source_path: Path,
    logical_canvas: list[int],
    logical_size: list[int],
    direction: int,
    base_scale: float,
    factor: float,
) -> tuple[Image.Image, dict[str, Any]]:
    source = Image.open(source_path).convert("RGBA")
    bbox = alpha_bbox(source)
    contact_x, contact_y = bottom_contact(source)
    crop = source.crop(bbox)
    scale = base_scale * DENSITY * factor
    resized_w = max(1, round(crop.width * scale))
    resized_h = max(1, round(crop.height * scale))
    resized = crop.resize((resized_w, resized_h), Image.Resampling.LANCZOS)

    canvas_w = logical_canvas[0] * DENSITY
    canvas_h = logical_canvas[1] * DENSITY
    footprint_w, footprint_d = direction_size(logical_size, direction)
    contact_in_crop_x = (contact_x - bbox[0]) * resized_w / crop.width
    contact_in_crop_y = (contact_y - bbox[1]) * resized_h / crop.height
    target_x = footprint_w * 16 * DENSITY - 0.5 * DENSITY
    target_y = canvas_h - DENSITY
    paste_x = round(target_x - contact_in_crop_x)
    paste_y = round(target_y - contact_in_crop_y)
    output = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    output.alpha_composite(resized, (paste_x, paste_y))

    alpha_before = sum(value > 0 for value in resized.getchannel("A").getdata())
    alpha_after = sum(value > 0 for value in output.getchannel("A").getdata())
    out_bbox = output.getchannel("A").getbbox()
    return output, {
        "source": str(source_path),
        "source_sha256": sha256(source_path),
        "source_alpha_bbox_xyxy": list(bbox),
        "logical_canvas": logical_canvas,
        "physical_canvas": [canvas_w, canvas_h],
        "logical_footprint": [footprint_w, footprint_d],
        "base_scale": base_scale,
        "fit_factor": factor,
        "effective_density2_scale": scale,
        "subject_wh": [resized_w, resized_h],
        "paste_xy": [paste_x, paste_y],
        "target_contact_xy": [target_x, target_y],
        "alpha_bbox_xyxy": list(out_bbox) if out_bbox else None,
        "retained_foreground_ratio": alpha_after / max(1, alpha_before),
        "clipped": alpha_after != alpha_before,
    }


def fitting_factor(
    sources: list[Path],
    logical_canvas: list[int],
    logical_size: list[int],
    base_scale: float,
) -> float:
    """Find one shared physical scale for all four directions."""

    def fits(factor: float) -> bool:
        return all(
            not normalize(source, logical_canvas, logical_size, direction, base_scale, factor)[1][
                "clipped"
            ]
            for direction, source in enumerate(sources)
        )

    if fits(1.0):
        return 1.0
    low, high = 0.75, 1.0
    if not fits(low):
        raise ValueError("approved subject cannot fit even after a 25% uniform reduction")
    for _ in range(18):
        middle = (low + high) / 2
        if fits(middle):
            low = middle
        else:
            high = middle
    # Stay below rounding discontinuities while keeping the adjustment invisible.
    return max(0.75, low - 0.0005)


def update_contracts() -> dict[str, Any]:
    data = read_json(DATA)
    facilities = data["facilities"]
    for asset_id in ASSET_IDS:
        facility = facilities[asset_id]
        facility["facings"] = 4
        if "size" in CONTRACT_OVERRIDES.get(asset_id, {}):
            facility["size"] = CONTRACT_OVERRIDES[asset_id]["size"]
    write_json(DATA, data)

    render = read_json(RENDER)
    by_sprite = {entry["sprite"]: entry for entry in render["facilities"]}
    changed: dict[str, Any] = {}
    for asset_id in ASSET_IDS:
        entry = by_sprite[f"facility/{asset_id}"]
        override = CONTRACT_OVERRIDES.get(asset_id, {})
        canvas = list(override.get("canvas", entry["canvas"]))
        body_h = int(override.get("bodyH", entry["bodyH"]))
        entry["canvas"] = canvas
        entry["anchorTexel"] = [canvas[0] // 2, canvas[1]]
        entry["bodyH"] = body_h
        changed[asset_id] = {
            "size": facilities[asset_id]["size"],
            "facings": facilities[asset_id]["facings"],
            "canvas": canvas,
            "anchorTexel": entry["anchorTexel"],
            "bodyH": body_h,
        }
    write_json(RENDER, render)
    return changed


def unpack_baseline() -> int:
    index = read_json(ATLAS_INDEX)
    atlas = Image.open(ATLAS).convert("RGBA")
    PACK.mkdir(parents=True, exist_ok=True)
    if PACK.name != "kairo":
        raise ValueError(f"refusing to clean unexpected pack path: {PACK}")
    for old in PACK.glob("*.png"):
        old.unlink()
    for asset_id, frame in index.items():
        crop = atlas.crop(
            (
                frame["x"],
                frame["y"],
                frame["x"] + frame["w"],
                frame["y"] + frame["h"],
            )
        )
        crop.save(PACK / asset_file(asset_id), optimize=True)
    for asset_id in ASSET_IDS:
        base = PACK / asset_file(f"facility/{asset_id}")
        if base.exists():
            base.unlink()
    return len(index)


def build_directional_pack(changed: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for asset_id in ASSET_IDS:
        metrics_path = FIT_ROOT / asset_id / "runtime-footprint-metrics.json"
        metrics = read_json(metrics_path)
        sources = [Path(direction["source"]["path"]) for direction in metrics["directions"]]
        base_scales = {round(float(direction["scale"]["physical_to_runtime"]), 10) for direction in metrics["directions"]}
        if len(base_scales) != 1:
            raise ValueError(f"{asset_id}: directions do not share one physical scale")
        base_scale = base_scales.pop()
        logical_canvas = list(changed[asset_id]["canvas"])
        logical_size = list(changed[asset_id]["size"])
        factor = fitting_factor(sources, logical_canvas, logical_size, base_scale)
        for direction, source in enumerate(sources):
            image, record = normalize(
                source, logical_canvas, logical_size, direction, base_scale, factor
            )
            output = PACK / asset_file(f"facility/{asset_id}:d{direction}")
            image.save(output, optimize=True)
            record.update(
                {
                    "asset_id": asset_id,
                    "direction": f"d{direction}",
                    "output": str(output),
                    "output_sha256": sha256(output),
                }
            )
            if record["clipped"]:
                raise ValueError(f"{asset_id}:d{direction} still clips after fitting")
            records.append(record)
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify an already prepared pack")
    args = parser.parse_args()

    changed = update_contracts()
    baseline_count = unpack_baseline()
    records = build_directional_pack(changed)
    direction_files = list(PACK.glob("facility__*__d[0-3].png"))
    if len(records) != 80 or len(direction_files) < 80:
        raise ValueError(f"expected 80 new directions, got {len(records)} records/{len(direction_files)} files")

    evidence = {
        "schema_version": 1,
        "state": "LIVE_PACK_PREPARED_NOT_YET_VERIFIED",
        "density": DENSITY,
        "asset_count": len(ASSET_IDS),
        "direction_count": len(records),
        "baseline_atlas_frame_count": baseline_count,
        "contracts": changed,
        "directions": records,
        "all_directions_nonempty": all(record["alpha_bbox_xyxy"] for record in records),
        "all_directions_unclipped": all(not record["clipped"] for record in records),
        "minimum_retained_foreground_ratio": min(
            record["retained_foreground_ratio"] for record in records
        ),
    }
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    write_json(EVIDENCE, evidence)
    print(
        json.dumps(
            {
                "pack": str(PACK),
                "assets": len(ASSET_IDS),
                "directions": len(records),
                "unclipped": evidence["all_directions_unclipped"],
                "evidence": str(EVIDENCE),
                "mode": "check" if args.check else "prepare",
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
