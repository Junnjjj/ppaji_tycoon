#!/usr/bin/env python3
"""B 목표·ImageGen 원본·8종 추출물·실제 맵을 검토판으로 합친다."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source"
PACK = ROOT / "public/assets/kairo-terrain-v3-source"
OUT = ART / "macro-shore-runtime-review.png"
PREVIEW = ART / "macro-shore-runtime-review-preview.png"
RUNTIME_PREVIEW = ART / "runtime-map/terrain-v3-macro-shore-preview.png"


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        Path("/System/Library/Fonts/Helvetica.ttc"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def fit(path: Path, size: tuple[int, int]) -> Image.Image:
    return ImageOps.contain(Image.open(path).convert("RGB"), size, method=Image.Resampling.NEAREST)


def frame(canvas: Image.Image, box: tuple[int, int, int, int], title: str) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=14, fill=(248, 246, 238), outline=(63, 82, 91), width=3)
    draw.text((x0 + 16, y0 + 12), title, fill=(31, 45, 55), font=font(22))
    return (x0 + 14, y0 + 48, x1 - 14, y1 - 14)


def paste_center(canvas: Image.Image, path: Path, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    image = fit(path, (x1 - x0, y1 - y0))
    canvas.paste(image, (x0 + (x1 - x0 - image.width) // 2, y0 + (y1 - y0 - image.height) // 2))


def overlay_sheet(size: tuple[int, int]) -> Image.Image:
    width, height = size
    sheet = Image.new("RGB", size, (38, 116, 157))
    draw = ImageDraw.Draw(sheet)
    names = (
        "i_start",
        "i_mid",
        "i_end",
        "j_start",
        "j_mid",
        "j_end",
        "outer_corner",
        "inner_corner",
    )
    cell_w, cell_h = width // 4, height // 2
    for index, name in enumerate(names):
        x = (index % 4) * cell_w
        y = (index // 4) * cell_h
        for yy in range(y, y + cell_h, 12):
            for xx in range(x, x + cell_w, 12):
                if ((xx - x) // 12 + (yy - y) // 12) % 2:
                    draw.rectangle((xx, yy, min(xx + 11, x + cell_w - 1), min(yy + 11, y + cell_h - 1)), fill=(45, 132, 171))
        source = Image.open(PACK / f"overlay__shore_curve_{name}.png").convert("RGBA")
        source = source.resize((256, 128), Image.Resampling.NEAREST)
        px = x + (cell_w - source.width) // 2
        py = y + 18 + (cell_h - 18 - source.height) // 2
        sheet.paste(source, (px, py), source)
        draw.text((x + 8, y + 4), name, fill=(255, 252, 229), font=font(15))
    return sheet


def main() -> None:
    canvas = Image.new("RGB", (1600, 1120), (31, 45, 55))
    draw = ImageDraw.Draw(canvas)
    draw.text((32, 20), "TERRAIN V3 · B-LIKE MACRO SHORE · RUNTIME REVIEW", fill=(255, 245, 206), font=font(30))
    draw.text((32, 58), "Review-only · source-v1 materials · phase-independent overlays", fill=(190, 215, 219), font=font(17))
    boxes = (
        (22, 92, 790, 590),
        (810, 92, 1578, 590),
        (22, 610, 790, 1098),
        (810, 610, 1578, 1098),
    )
    a = frame(canvas, boxes[0], "A · USER-APPROVED B CURVE TARGET")
    b = frame(canvas, boxes[1], "B · BUILT-IN IMAGEGEN SOURCE · 8 SHAPES")
    c = frame(canvas, boxes[2], "C · EXACT D=4 OVERLAYS · 128×64 EACH")
    d = frame(canvas, boxes[3], "D · ACTUAL MAP · terrain=v3")
    paste_center(canvas, ROOT / "artifacts/asset-concept-sheets/terrain-v2-pilot/attempt-b-map-target.png", a)
    paste_center(canvas, ART / "macro-shore-source-v1.png", b)
    contact = overlay_sheet((c[2] - c[0], c[3] - c[1]))
    canvas.paste(contact, (c[0], c[1]))
    paste_center(canvas, ART / "runtime-map/terrain-v3-source.png", d)
    canvas.save(OUT, optimize=True)
    ImageOps.contain(canvas, (960, 960), method=Image.Resampling.NEAREST).save(PREVIEW, optimize=True)
    runtime = Image.open(ART / "runtime-map/terrain-v3-source.png").convert("RGB")
    ImageOps.contain(runtime, (960, 700), method=Image.Resampling.NEAREST).save(RUNTIME_PREVIEW, optimize=True)
    print(OUT)
    print(PREVIEW)
    print(RUNTIME_PREVIEW)


if __name__ == "__main__":
    main()
