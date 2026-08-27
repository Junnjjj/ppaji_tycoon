#!/usr/bin/env python3
"""source-v1 질감을 받을 해안 인접 조각과 높이/절벽 구조 가이드."""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/runtime-transition-guide.png"
CANVAS = (1536, 1024)
CHROMA = "#FF00FF"
OUTLINE = "#203044"


def points(center: tuple[int, int], size: tuple[int, int]) -> list[tuple[int, int]]:
    cx, cy = center
    width, height = size
    return [(cx, cy - height // 2), (cx + width // 2, cy), (cx, cy + height // 2), (cx - width // 2, cy)]


def shoreline(draw: ImageDraw.ImageDraw, center: tuple[int, int], edge: str) -> None:
    top, right, bottom, left = points(center, (320, 160))
    draw.polygon([top, right, bottom, left], fill="#3D9CC7", outline=OUTLINE, width=4)
    segments = []
    if edge in ("i", "ij"):
        segments.append((top, left))
    if edge in ("j", "ij"):
        segments.append((top, right))
    for start, end in segments:
        sx, sy = start
        ex, ey = end
        mid = ((sx + ex) // 2, (sy + ey) // 2 + 5)
        draw.line([start, mid, end], fill="#86D1E7", width=14, joint="curve")
        draw.line([start, mid, end], fill="#F7FCFF", width=7, joint="curve")


def block(draw: ImageDraw.ImageDraw, x: int, baseline: int, level: int) -> None:
    width, height = 220, 110
    depth = level * 70
    cy = baseline - height // 2 - depth
    top, right, bottom, left = points((x, cy), (width, height))
    if depth:
        draw.polygon([left, bottom, (bottom[0], bottom[1] + depth), (left[0], left[1] + depth)], fill="#B97D38", outline=OUTLINE)
        draw.polygon([right, bottom, (bottom[0], bottom[1] + depth), (right[0], right[1] + depth)], fill="#8D572B", outline=OUTLINE)
    draw.polygon([top, right, bottom, left], fill="#83AD2D", outline=OUTLINE, width=4)


def main() -> None:
    image = Image.new("RGB", CANVAS, CHROMA)
    draw = ImageDraw.Draw(image)
    for x, edge in zip((285, 768, 1251), ("i", "j", "ij")):
        shoreline(draw, (x, 240), edge)
    for x, level in zip((190, 570, 950, 1330), range(4)):
        block(draw, x, 865, level)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
