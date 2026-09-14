#!/usr/bin/env python3
"""source-v1 → 보조 소스 → 실제 맵을 한 장의 검토판으로 합성한다."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source"
OUT = ART / "terrain-v3-source-review-board.png"


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def panel(canvas: Image.Image, xy: tuple[int, int], title: str, path: Path) -> None:
    x, y = xy
    width, height = 920, 580
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=18, fill=(248, 246, 238), outline=(55, 72, 82), width=3)
    draw.text((x + 20, y + 15), title, fill=(31, 45, 55), font=font(25))
    image = Image.open(path).convert("RGB")
    fitted = ImageOps.contain(image, (width - 32, height - 70), method=Image.Resampling.NEAREST)
    px = x + (width - fitted.width) // 2
    py = y + 57 + (height - 65 - fitted.height) // 2
    canvas.paste(fitted, (px, py))


def main() -> None:
    canvas = Image.new("RGB", (1920, 1300), (31, 45, 55))
    draw = ImageDraw.Draw(canvas)
    draw.text((40, 24), "TERRAIN V3 · SOURCE-V1 RUNTIME REVIEW", fill=(255, 245, 206), font=font(34))
    draw.text(
        (40, 66),
        "Visual authority → exact supplemental sources → actual terrain=v3 map (review-only)",
        fill=(190, 215, 219),
        font=font(20),
    )
    panel(canvas, (30, 105), "A · SELECTED VISUAL AUTHORITY · SOURCE-V1", ART / "terrain-master-source-v1.png")
    panel(canvas, (970, 105), "B · SUPPLEMENTAL CORE MATERIAL SOURCE", ART / "runtime-core-source-v1.png")
    panel(canvas, (30, 705), "C · SUPPLEMENTAL SHORE + CLIFF SOURCE", ART / "runtime-transition-source-v1.png")
    panel(canvas, (970, 705), "D · ACTUAL MAP · HD D=4 · terrain=v3", ART / "runtime-map/terrain-v3-source.png")
    canvas.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
