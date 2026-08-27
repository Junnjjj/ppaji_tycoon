#!/usr/bin/env python3
"""B형 곡선 해안 8종의 exact 2:1 연결 가이드를 만든다."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/macro-shore-guide.png"
CANVAS = (1536, 1024)
CHROMA = "#FF00FF"
SAND = "#E8B85E"
SHALLOW = "#79CBE4"
FOAM = "#F8FDFF"
CELL = (320, 160)
CENTERS = (
    (210, 260),
    (582, 260),
    (954, 260),
    (1326, 260),
    (210, 760),
    (582, 760),
    (954, 760),
    (1326, 760),
)


def diamond(center: tuple[int, int]) -> tuple[tuple[int, int], ...]:
    cx, cy = center
    return ((cx, cy - 80), (cx + 160, cy), (cx, cy + 80), (cx - 160, cy))


def band(
    draw: ImageDraw.ImageDraw,
    boundary: list[tuple[int, int]],
    curve: list[tuple[int, int]],
) -> None:
    draw.polygon(boundary + list(reversed(curve)), fill=SAND)
    draw.line(curve, fill=SHALLOW, width=34, joint="curve")
    draw.line(curve, fill=FOAM, width=16, joint="curve")


def i_curve(draw: ImageDraw.ImageDraw, center: tuple[int, int], phase: int) -> None:
    top, _, _, left = diamond(center)
    cx, cy = center
    bows = ((-14, 14), (-2, 26), (10, 16))
    dx, dy = bows[phase]
    curve = [
        top,
        (cx - 35 + dx, cy - 55 + dy // 3),
        (cx - 78 + dx, cy - 34 + dy),
        (cx - 124 + dx // 2, cy - 12 + dy // 2),
        left,
    ]
    band(draw, [top, left], curve)


def j_curve(draw: ImageDraw.ImageDraw, center: tuple[int, int], phase: int) -> None:
    top, right, _, _ = diamond(center)
    cx, cy = center
    bows = ((14, 14), (2, 26), (-10, 16))
    dx, dy = bows[phase]
    curve = [
        top,
        (cx + 35 + dx, cy - 55 + dy // 3),
        (cx + 78 + dx, cy - 34 + dy),
        (cx + 124 + dx // 2, cy - 12 + dy // 2),
        right,
    ]
    band(draw, [top, right], curve)


def outer_corner(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    top, right, _, left = diamond(center)
    cx, cy = center
    curve = [
        left,
        (cx - 112, cy - 2),
        (cx - 68, cy + 12),
        (cx - 18, cy + 8),
        (cx + 28, cy + 14),
        (cx + 82, cy + 11),
        (cx + 126, cy - 3),
        right,
    ]
    band(draw, [left, top, right], curve)


def inner_corner(draw: ImageDraw.ImageDraw, center: tuple[int, int]) -> None:
    top, _, _, _ = diamond(center)
    cx, cy = center
    left_edge = (cx - 72, cy - 36)
    right_edge = (cx + 72, cy - 36)
    curve = [
        left_edge,
        (cx - 52, cy - 25),
        (cx - 28, cy - 1),
        (cx, cy + 8),
        (cx + 30, cy - 2),
        (cx + 54, cy - 25),
        right_edge,
    ]
    band(draw, [left_edge, top, right_edge], curve)


def main() -> None:
    image = Image.new("RGB", CANVAS, CHROMA)
    draw = ImageDraw.Draw(image)
    for phase, center in enumerate(CENTERS[:3]):
        i_curve(draw, center, phase)
    for phase, center in enumerate(CENTERS[3:6]):
        j_curve(draw, center, phase)
    outer_corner(draw, CENTERS[6])
    inner_corner(draw, CENTERS[7])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, optimize=True)
    print(OUT)


if __name__ == "__main__":
    main()
