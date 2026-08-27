#!/usr/bin/env python3
"""Compose final multi-page approved/physical/color four-direction review boards."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path("/Users/jangjunpyo/orca/workspaces/ppaji_tycoon/에셋만들기_스킬")
ORDER = (
    "toilet", "shower_row", "locker_row", "washbasin_row",
    "changing_row", "nursing", "infirmary", "sikhye",
    "snackbar", "chicken", "icecream", "cafe",
    "shop", "vending_in", "arcade", "karaoke",
    "pingpong", "info", "office", "storage",
)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def font(size: int, bold: bool = False):
    name = "Arial Bold.ttf" if bold else "Arial.ttf"
    path = Path("/System/Library/Fonts/Supplemental") / name
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default()


def contain(image: Image.Image, size: tuple[int, int], background=(19, 24, 31, 255)) -> Image.Image:
    rgba = image.convert("RGBA")
    ratio = min(size[0] / rgba.width, size[1] / rgba.height)
    resized = rgba.resize((max(1, round(rgba.width * ratio)), max(1, round(rgba.height * ratio))), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", size, background)
    result.alpha_composite(resized, ((size[0] - resized.width) // 2, (size[1] - resized.height) // 2))
    return result


def clay_four_up(physical_dir: Path) -> Image.Image:
    sheet = Image.new("RGBA", (2048, 2048), (0, 0, 0, 0))
    layout = {"d0": (0, 0), "d1": (1, 0), "d2": (0, 1), "d3": (1, 1)}
    for direction, (column, row) in layout.items():
        path = physical_dir / f"{direction}.png"
        image = Image.open(path).convert("RGBA")
        if image.size != (1024, 1024):
            raise RuntimeError(f"unexpected physical size: {path} {image.size}")
        sheet.alpha_composite(image, (column * 1024, row * 1024))
    return sheet


def main() -> None:
    options = args()
    manifest_path = options.asset_manifest.resolve()
    output_dir = options.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = {row["id"]: row for row in manifest["assets"]}
    changing_prompt = json.loads((ROOT / "artifacts/asset-concept-sheets/indoor-facilities-v1/00-manifest.json").read_text(encoding="utf-8"))
    del changing_prompt  # Existence/hash authority is covered by the approved crop below.

    resolved = []
    for asset_id in ORDER:
        if asset_id == "changing_row":
            approved = ROOT / "artifacts/asset-concept-sheets/indoor-facilities-v1/approved-crops/changing_row-approved.png"
            physical_dir = ROOT / "assets/generated/kairo-v4-simple-pilot/changing_row/physical-meshy-v1/physical"
            color = ROOT / "assets/generated/kairo-v4-simple-pilot/changing_row/physical-meshy-v1/color-transfer/selected-v1/changing-row-selected-color-guide-4up.png"
            qa_path = ROOT / "assets/generated/kairo-v4-simple-pilot/changing_row/physical-meshy-v1/color-transfer/selected-v1/manifest.json"
            entry = {"name": "탈의실 연립", "footprint": "3x1", "access_kind": "portal"}
            qa_summary = "conditional selected guide; physical alpha locked"
        else:
            entry = entries[asset_id]
            approved = Path(entry["approved_colored_d0_source"]["path"])
            dense_dir = Path(entry["dense_d0_directory"])
            directions = dense_dir / "physical-directions-v1"
            physical_dir = directions / "physical"
            color = directions / "color-transfer/v1/locked" / f"{asset_id}-four-direction-physical-alpha-locked.png"
            qa_path = directions / "color-transfer/v1/qa.json"
            qa = json.loads(qa_path.read_text(encoding="utf-8"))
            passes = sum(row["geometry_gate"] == "PASS" for row in qa["directions"].values())
            qa_summary = f"raw geometry gate {passes}/4; physical alpha lock 4/4; user review pending"
        for path in (approved, color, qa_path):
            if not path.is_file():
                raise FileNotFoundError(path)
        for direction in ("d0", "d1", "d2", "d3"):
            if not (physical_dir / f"{direction}.png").is_file():
                raise FileNotFoundError(physical_dir / f"{direction}.png")
        resolved.append({
            "id": asset_id,
            "entry": entry,
            "approved": approved,
            "physical_dir": physical_dir,
            "color": color,
            "qa": qa_path,
            "qa_summary": qa_summary,
        })

    page_records = []
    page_width = 1600
    page_header = 118
    row_height = 560
    label_width = 220
    approved_width = 300
    four_width = 500
    gap = 18
    title_font = font(34, True)
    head_font = font(23, True)
    label_font = font(25, True)
    body_font = font(18)
    for page_index in range(math.ceil(len(resolved) / 4)):
        rows = resolved[page_index * 4 : page_index * 4 + 4]
        page = Image.new("RGBA", (page_width, page_header + row_height * len(rows)), (13, 17, 23, 255))
        draw = ImageDraw.Draw(page)
        draw.text((26, 20), f"INDOOR FACILITIES — PHYSICAL + IMAGEGEN FOUR-DIRECTION REVIEW {page_index + 1}/5", font=title_font, fill=(244, 247, 252, 255))
        draw.text((label_width + gap, 72), "APPROVED COLOR d0", font=head_font, fill=(255, 209, 117, 255))
        draw.text((label_width + approved_width + gap * 2, 72), "PHYSICAL d0–d3", font=head_font, fill=(138, 220, 239, 255))
        draw.text((label_width + approved_width + four_width + gap * 3, 72), "IMAGEGEN COLOR d0–d3 (ALPHA LOCKED)", font=head_font, fill=(176, 237, 170, 255))
        for row_index, item in enumerate(rows):
            y = page_header + row_index * row_height
            if row_index:
                draw.line((18, y, page_width - 18, y), fill=(54, 63, 75, 255), width=2)
            entry = item["entry"]
            draw.text((22, y + 28), item["id"], font=label_font, fill=(248, 250, 255, 255))
            draw.text((22, y + 67), str(entry.get("name", "")), font=body_font, fill=(207, 217, 231, 255))
            draw.text((22, y + 100), f"footprint {entry.get('footprint')}\naccess {entry.get('access_kind')}", font=body_font, fill=(133, 201, 224, 255), spacing=8)
            draw.multiline_text((22, y + 178), item["qa_summary"], font=body_font, fill=(248, 184, 110, 255), spacing=7)
            approved = contain(Image.open(item["approved"]), (approved_width, 500))
            physical = contain(clay_four_up(item["physical_dir"]), (four_width, 500))
            color = contain(Image.open(item["color"]), (four_width, 500))
            x1 = label_width + gap
            x2 = x1 + approved_width + gap
            x3 = x2 + four_width + gap
            page.alpha_composite(approved, (x1, y + 28))
            page.alpha_composite(physical, (x2, y + 28))
            page.alpha_composite(color, (x3, y + 28))
        page_path = output_dir / f"direction-color-review-page-{page_index + 1:02d}.png"
        page.save(page_path, optimize=True)
        page_records.append({"path": str(page_path), "sha256": sha256_file(page_path), "assets": [row["id"] for row in rows]})

    record = {
        "generated_at": utc_now(),
        "state": "COLOR_GUIDE_USER_REVIEW",
        "asset_count": len(resolved),
        "page_count": len(page_records),
        "layout": "approved color d0 | physical clay d0-d3 | ImageGen color d0-d3 physical-alpha-locked",
        "pages": page_records,
        "source_manifest": {"path": str(manifest_path), "sha256": sha256_file(manifest_path)},
        "production_approved": False,
        "runtime_adoption_started": False,
    }
    record_path = output_dir / "manifest.json"
    record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"asset_count": len(resolved), "pages": page_records}, sort_keys=True))


if __name__ == "__main__":
    main()
