#!/usr/bin/env python3
"""Render labelled nearest-neighbour contact sheets for Kairo facility visual QA."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets" / "generated" / "kairo"
FACILITIES = ROOT / "src" / "data" / "kairo-facilities.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=ROOT / "assets" / "generated" / "kairo-qa")
    parser.add_argument("--per-sheet", type=int, default=25)
    parser.add_argument(
        "--four-dir-root",
        type=Path,
        help="Render accepted facility__<id>__d0..d3 drafts from this directory.",
    )
    parser.add_argument("--ids", help="Comma-separated facility ids for --four-dir-root.")
    args = parser.parse_args()

    if args.four_dir_root is not None:
        render_four_dir(args)
        return

    rows = list(json.loads(FACILITIES.read_text(encoding="utf-8"))["facilities"].items())
    args.out.mkdir(parents=True, exist_ok=True)
    columns = 5
    cell_w, cell_h = 240, 190
    image_box = (16, 28, cell_w - 16, cell_h - 12)

    for page, offset in enumerate(range(0, len(rows), args.per_sheet), start=1):
        group = rows[offset : offset + args.per_sheet]
        line_count = math.ceil(len(group) / columns)
        sheet = Image.new("RGB", (columns * cell_w, line_count * cell_h), (30, 32, 36))
        draw = ImageDraw.Draw(sheet)
        for index, (facility_id, row) in enumerate(group):
            col, line = index % columns, index // columns
            ox, oy = col * cell_w, line * cell_h
            draw.rectangle((ox, oy, ox + cell_w - 1, oy + cell_h - 1), outline=(72, 76, 84))
            size = row["size"]
            draw.text((ox + 8, oy + 7), f"{facility_id}  {size[0]}x{size[1]}", fill=(235, 238, 242))
            path = PACK / (row["sprite"].replace("/", "__") + ".png")
            sprite = Image.open(path).convert("RGBA")
            max_w = image_box[2] - image_box[0]
            max_h = image_box[3] - image_box[1]
            scale = max(1, min(4, max_w // sprite.width, max_h // sprite.height))
            sprite = sprite.resize((sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST)
            x = ox + image_box[0] + (max_w - sprite.width) // 2
            y = oy + image_box[1] + (max_h - sprite.height) // 2
            sheet.paste(sprite, (x, y), sprite)
        destination = args.out / f"facilities-{page}.png"
        sheet.save(destination)
        print(destination)


def render_four_dir(args: argparse.Namespace) -> None:
    """Render one facility per row without altering any source sprite pixels."""
    root = args.four_dir_root.resolve()
    ids = [item for item in (args.ids or "").split(",") if item]
    if not ids:
        ids = sorted(
            {
                path.name.removeprefix("facility__").removesuffix("__d0.png")
                for path in root.glob("facility__*__d0.png")
            }
        )
    args.out.mkdir(parents=True, exist_ok=True)
    directions = ("d0", "d1", "d2", "d3")
    cell_w, cell_h = 280, 230
    per_sheet = max(1, args.per_sheet)

    for page, offset in enumerate(range(0, len(ids), per_sheet), start=1):
        group = ids[offset : offset + per_sheet]
        sheet = Image.new("RGB", (len(directions) * cell_w, len(group) * cell_h), (30, 32, 36))
        draw = ImageDraw.Draw(sheet)
        for row_index, facility_id in enumerate(group):
            for col_index, direction in enumerate(directions):
                ox, oy = col_index * cell_w, row_index * cell_h
                draw.rectangle((ox, oy, ox + cell_w - 1, oy + cell_h - 1), outline=(72, 76, 84))
                draw.text((ox + 8, oy + 7), f"{facility_id}  {direction}", fill=(235, 238, 242))
                path = root / f"facility__{facility_id}__{direction}.png"
                if not path.exists():
                    draw.text((ox + 8, oy + 35), "MISSING", fill=(240, 100, 100))
                    continue
                sprite = Image.open(path).convert("RGBA")
                max_w, max_h = cell_w - 24, cell_h - 40
                scale = max(1, min(6, max_w // sprite.width, max_h // sprite.height))
                enlarged = sprite.resize(
                    (sprite.width * scale, sprite.height * scale), Image.Resampling.NEAREST
                )
                x = ox + (cell_w - enlarged.width) // 2
                y = oy + 30 + (max_h - enlarged.height) // 2
                sheet.paste(enlarged, (x, y), enlarged)
        destination = args.out / f"facilities-4dir-{page}.png"
        sheet.save(destination)
        print(destination)


if __name__ == "__main__":
    main()
