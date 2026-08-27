#!/usr/bin/env python3
"""Compose lossless, labeled review pages from the facility dense-d0 boards."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = (
    ROOT
    / "artifacts"
    / "asset-concept-sheets"
    / "indoor-facilities-v1"
    / "dense-d0-review-pages-v1"
)

PAGES = [
    (
        "HYGIENE",
        [
            ("toilet", "toilet/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("shower_row", "shower_row/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("locker_row", "locker_row/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("washbasin_row", "washbasin_row/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
        ],
    ),
    (
        "CARE + FOOD",
        [
            ("nursing", "nursing/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("infirmary", "infirmary/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("sikhye", "sikhye/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("snackbar", "snackbar/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
        ],
    ),
    (
        "RETAIL + FOOD",
        [
            ("chicken", "chicken/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("icecream", "icecream/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("cafe", "cafe/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("shop", "shop/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
        ],
    ),
    (
        "ENTERTAINMENT",
        [
            ("vending_in | WARN: fused mat risk", "vending_in/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("arcade | HOLD: fused floor slab", "arcade/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("karaoke", "karaoke/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("pingpong | HOLD: fused floor slab", "pingpong/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
        ],
    ),
    (
        "OPERATIONS",
        [
            ("info", "info/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("office", "office/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("storage", "storage/physical-meshy-batch-v1/dense-d0-v1/evidence/approved-vs-dense-d0-landmarks.png"),
            ("changing_row | existing 4-dir pilot", "changing_row/physical-meshy-v1/evidence/approved-vs-dense-d0-landmarks.png"),
        ],
    ),
]

ASSET_ROOT = ROOT / "assets" / "generated" / "kairo-v4-simple-pilot"
HEADER_HEIGHT = 120
LABEL_HEIGHT = 64
COLS = 2
ROWS = 2


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/System/Library/Fonts/SFNS.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    title_font = font(44, bold=True)
    subtitle_font = font(30, bold=True)
    label_font = font(28, bold=True)
    source_records: list[dict[str, object]] = []
    page_records: list[dict[str, object]] = []

    for page_index, (category, entries) in enumerate(PAGES, start=1):
        loaded: list[tuple[str, Path, Image.Image]] = []
        for label, relative_path in entries:
            source = ASSET_ROOT / relative_path
            if not source.is_file():
                raise FileNotFoundError(source)
            image = Image.open(source).convert("RGB")
            loaded.append((label, source, image))

        cell_width = max(item[2].width for item in loaded)
        image_height = max(item[2].height for item in loaded)
        cell_height = LABEL_HEIGHT + image_height
        page = Image.new(
            "RGB",
            (COLS * cell_width, HEADER_HEIGHT + ROWS * cell_height),
            (14, 20, 29),
        )
        draw = ImageDraw.Draw(page)
        draw.text(
            (24, 15),
            f"DENSE d0 REVIEW  |  {category}  |  PAGE {page_index}/{len(PAGES)}",
            font=title_font,
            fill=(245, 248, 252),
        )
        draw.text(
            (24, 70),
            "D0 ONLY - DENSE_BASELINE_UNREVIEWED - NOT d1/d2/d3",
            font=subtitle_font,
            fill=(255, 188, 76),
        )

        for entry_index, (label, source, image) in enumerate(loaded):
            row, col = divmod(entry_index, COLS)
            x = col * cell_width
            y = HEADER_HEIGHT + row * cell_height
            warning = "WARN" in label or "HOLD" in label
            label_fill = (109, 29, 36) if warning else (28, 41, 56)
            draw.rectangle((x, y, x + cell_width, y + LABEL_HEIGHT), fill=label_fill)
            draw.text((x + 22, y + 15), label, font=label_font, fill=(255, 255, 255))
            image_x = x + (cell_width - image.width) // 2
            image_y = y + LABEL_HEIGHT
            page.paste(image, (image_x, image_y))
            source_records.append(
                {
                    "page": page_index,
                    "label": label,
                    "absolute_path": str(source.resolve()),
                    "sha256": sha256(source),
                    "width": image.width,
                    "height": image.height,
                }
            )

        output = OUTPUT_DIR / f"dense-d0-review-page-{page_index:02d}.png"
        page.save(output, format="PNG", compress_level=6)
        page_records.append(
            {
                "page": page_index,
                "category": category,
                "absolute_path": str(output.resolve()),
                "sha256": sha256(output),
                "width": page.width,
                "height": page.height,
            }
        )

    manifest = {
        "schema_version": 1,
        "status": "DENSE_BASELINE_UNREVIEWED",
        "scope": "d0 comparison only; not d1/d2/d3 direction evidence",
        "source_count": len(source_records),
        "page_count": len(page_records),
        "sources": source_records,
        "pages": page_records,
    }
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
