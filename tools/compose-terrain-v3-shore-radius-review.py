#!/usr/bin/env python3
"""Compose reduced radius comparison previews without changing source captures."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot"


def font(size: int):
    for path in [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def fit(image: Image.Image, width: int, height: int) -> Image.Image:
    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "#162231")
    canvas.paste(copy, ((width - copy.width) // 2, (height - copy.height) // 2))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cards = [
        ("R = 0.50 TILE", OUT / "r050.png"),
        ("R = 0.75 TILE", OUT / "r075.png"),
        ("R = 1.00 TILE", OUT / "r100.png"),
    ]
    panel_w, panel_h, label_h, gap = 480, 328, 46, 12
    sheet = Image.new("RGB", (panel_w * 3 + gap * 4, panel_h + label_h + gap * 2), "#0d1723")
    draw = ImageDraw.Draw(sheet)
    title_font = font(24)
    for index, (label, path) in enumerate(cards):
        x = gap + index * (panel_w + gap)
        draw.rounded_rectangle((x, gap, x + panel_w, gap + label_h - 5), radius=8, fill="#243851")
        draw.text((x + 16, gap + 8), label, fill="#f4f8f5", font=title_font)
        image = Image.open(path).convert("RGB")
        sheet.paste(fit(image, panel_w, panel_h), (x, gap + label_h))
    preview = OUT / "shore-radius-r050-r075-r100-preview.png"
    sheet.save(preview, optimize=True)

    negative = fit(Image.open(OUT / "r000-negative-control.png").convert("RGB"), 960, 656)
    negative.save(OUT / "r000-negative-control-preview.png", optimize=True)
    print(preview)


if __name__ == "__main__":
    main()
