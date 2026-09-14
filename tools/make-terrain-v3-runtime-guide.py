#!/usr/bin/env python3
"""source-v1의 질감을 받을 정확한 2:1 런타임 코어 시트 가이드."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/runtime-core-guide.png"
CANVAS = (1536, 1024)
CHROMA = "#FF00FF"
OUTLINE = "#203044"


def diamond(draw: ImageDraw.ImageDraw, center: tuple[int, int], size: tuple[int, int], fill: str) -> None:
    cx, cy = center
    width, height = size
    points = [(cx, cy - height // 2), (cx + width // 2, cy), (cx, cy + height // 2), (cx - width // 2, cy)]
    draw.polygon(points, fill=OUTLINE)
    inset = 4
    inner = [
        (cx, cy - height // 2 + inset),
        (cx + width // 2 - inset * 2, cy),
        (cx, cy + height // 2 - inset),
        (cx - width // 2 + inset * 2, cy),
    ]
    draw.polygon(inner, fill=fill)


def main() -> None:
    image = Image.new("RGB", CANVAS, CHROMA)
    draw = ImageDraw.Draw(image)

    # source-v1 상단 순서: lawn A/B/C, sand, stone path, wood deck.
    top_colors = ["#7FAD2D", "#8DB634", "#78A32B", "#E8BE60", "#C7C2B8", "#C9822D"]
    for x, color in zip((150, 395, 640, 885, 1130, 1375), top_colors):
        diamond(draw, (x, 215), (218, 109), color)

    # source-v1 물 P0–P3. 모두 같은 정확한 크기와 2:1 비율이다.
    for x in (225, 585, 945, 1305):
        diamond(draw, (x, 545), (300, 150), "#3D9CC7")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
