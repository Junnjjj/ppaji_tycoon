#!/usr/bin/env python3
"""컨셉 시안의 큰 픽셀 군집을 64×32 결정론적 지면 타일로 재구성한다.

ImageGen 시트는 색·군집 문법의 시각 정본일 뿐 직접 크롭하지 않는다. 모든 가장자리는
같은 바탕색으로 유지하고, 내부 디테일만 좌표가 고정된 블록으로 그린다.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/kairo-terrain-v2-pilot"
EVIDENCE = ROOT / "artifacts/asset-concept-sheets/terrain-v2-pilot/runtime-pack.json"
REFERENCE = ROOT / "artifacts/asset-concept-sheets/terrain-v2-pilot/attempt-b-map-target.png"
W, H = 64, 32
GROUND_ALT_COUNT = 6


PALETTES = {
    "lawn": ("#88AD2D", "#B1CB42", "#6F9227", "#416B2A", "#D2DF45"),
    "verge": ("#7FA62B", "#A4C63A", "#668925", "#3F6729", "#CBD940"),
    "sand": ("#E7BD5D", "#F5D883", "#C99842", "#9A6F32", "#FFF1B0"),
    "stone": ("#B8B3AA", "#DDD8CD", "#A8A39A", "#77736C", "#F1EDE4"),
    "sidewalk": ("#D5D1C6", "#E9E4D8", "#B6B1A8", "#8E8C87", "#F7F3EA"),
    "floor": ("#D9CDB8", "#EEE4D3", "#BFAF97", "#8E8374", "#FFF7E9"),
    "deck": ("#C8852D", "#E0A33D", "#9E6124", "#643C22", "#F2BA57"),
    "road": ("#58656C", "#6C797F", "#465158", "#303940", "#D9C86A"),
    "mountain": ("#A96D2F", "#D8A34B", "#825025", "#58351F", "#E8BC63"),
    "water": ("#3F99C3", "#58ACD0", "#2E83AE", "#1C6593", "#EFFBFF"),
    "pool": ("#4BBBD1", "#72D2DF", "#349DB7", "#25758E", "#EAFDFF"),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def row_span(y: int) -> tuple[int, int]:
    half = y if y < H // 2 else H - 1 - y
    reach = half * 2 + 1
    return W // 2 - reach, W // 2 + reach


def inside(x: int, y: int, inset: int = 0) -> bool:
    if not 0 <= y < H:
        return False
    x0, x1 = row_span(y)
    return x0 + inset <= x < x1 - inset


def block(draw: ImageDraw.ImageDraw, xy: tuple[int, int], wh: tuple[int, int], color: str, inset: int = 2) -> None:
    x0, y0 = xy
    width, height = wh
    for y in range(y0, y0 + height):
        for x in range(x0, x0 + width):
            if inside(x, y, inset):
                draw.point((x, y), fill=color)


def clipped_line(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    color: str,
    width: int = 1,
    inset: int = 2,
) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    pen.line(points, fill=color, width=width)
    pixels = layer.load()
    for y in range(H):
        for x in range(W):
            if pixels[x, y][3] and inside(x, y, inset):
                draw.point((x, y), fill=pixels[x, y])


def clipped_polygon(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    color: str,
    inset: int = 2,
) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pen = ImageDraw.Draw(layer)
    pen.polygon(points, fill=color)
    pixels = layer.load()
    for y in range(H):
        for x in range(W):
            if pixels[x, y][3] and inside(x, y, inset):
                draw.point((x, y), fill=pixels[x, y])


def pattern_value(alt: int, index: int, salt: int = 0) -> int:
    """플랫폼과 실행 순서에 무관한 작은 정수 해시."""
    value = (alt + 1) * 0x45D9F3B + (index + 11) * 0x119DE1F3 + salt * 0x27D4EB2D
    value = ((value ^ (value >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    return value ^ (value >> 16)


def base_tile(color: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for y in range(H):
        x0, x1 = row_span(y)
        draw.line((x0, y, x1 - 1, y), fill=color)
    return image, draw


def tuft(draw: ImageDraw.ImageDraw, x: int, y: int, light: str, dark: str, deep: str) -> None:
    block(draw, (x - 1, y + 3), (5, 2), deep)
    clipped_line(draw, [(x, y + 3), (x - 3, y)], dark, 1)
    clipped_line(draw, [(x + 1, y + 3), (x + 1, y - 2)], light, 2)
    clipped_line(draw, [(x + 2, y + 3), (x + 5, y)], dark, 1)
    block(draw, (x, y), (2, 2), light)


def grass(style: str, alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES[style]
    image, draw = base_tile(base)
    colors = (light, dark, accent, dark, light, deep)
    patches: list[tuple[int, int, int, int, str]] = []
    for index in range(18):
        value = pattern_value(alt, index, 3 if style == "verge" else 1)
        x = 7 + value % 50
        y = 4 + (value >> 8) % 24
        width = 2 + (value >> 16) % 5
        height = 1 + (1 if index % 7 == 0 else 0)
        patches.append((x, y, width, height, colors[index % len(colors)]))
    for x, y, width, height, color in patches:
        block(draw, (x, y), (width, height), color)
    tuft_positions = [(18, 18), (42, 17), (30, 12), (23, 21), (39, 13), (31, 20)]
    tx, ty = tuft_positions[alt % len(tuft_positions)]
    tuft(draw, tx, ty, accent, dark, deep)
    # 두 번째 작은 갈래는 큰 술과 다른 위치에서 타일 반복감을 끊는다.
    sx = 15 + pattern_value(alt, 23, 5) % 34
    sy = 10 + pattern_value(alt, 29, 7) % 11
    clipped_line(draw, [(sx, sy + 2), (sx - 2, sy)], dark, 1, 3)
    clipped_line(draw, [(sx + 1, sy + 2), (sx + 2, sy - 1)], light, 1, 3)
    return image


def sand(alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES["sand"]
    image, draw = base_tile(base)
    colors = (dark, light, deep, dark, light, accent)
    clusters: list[tuple[int, int, int, int, str]] = []
    for index in range(13):
        value = pattern_value(alt, index, 11)
        x = 7 + value % 49
        y = 4 + (value >> 8) % 24
        width = 2 + (value >> 16) % 4
        height = 1 + (1 if index % 6 == 0 else 0)
        clusters.append((x, y, width, height, colors[index % len(colors)]))
    for x, y, width, height, color in clusters:
        block(draw, (x, y), (width, height), color)
    # B/C의 조개·자갈처럼 읽히는 짧은 명암쌍. 한 점 노이즈가 아니라 2–4px 군집이다.
    for index in range(2):
        value = pattern_value(alt, index, 19)
        x = 17 + value % 29
        y = 9 + (value >> 9) % 13
        block(draw, (x, y), (3, 1), light)
        block(draw, (x + 1, y + 1), (3, 1), deep)
    return image


def pavers(style: str, alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES[style]
    image, draw = base_tile(base)
    stone_sets = [
        [(14, 15, 14, 8), (28, 9, 15, 8), (44, 13, 16, 8), (27, 22, 16, 8), (44, 22, 14, 7)],
        [(17, 12, 17, 8), (35, 10, 14, 7), (48, 16, 13, 9), (23, 21, 14, 7), (38, 22, 17, 8)],
        [(14, 17, 13, 9), (28, 11, 17, 7), (45, 12, 14, 8), (29, 22, 15, 8), (47, 21, 13, 7)],
    ]
    stones = stone_sets[alt % len(stone_sets)]
    for index, (cx, cy, width, height) in enumerate(stones):
        x0, x1 = cx - width // 2, cx + width // 2
        y0, y1 = cy - height // 2, cy + height // 2
        outline = [
            (x0 + 3, y0), (x1 - 3, y0), (x1, y0 + 2), (x1, y1 - 2),
            (x1 - 3, y1), (x0 + 3, y1), (x0, y1 - 2), (x0, y0 + 2),
        ]
        clipped_polygon(draw, outline, deep, 1)
        inner = [
            (x0 + 3, y0 + 1), (x1 - 3, y0 + 1), (x1 - 1, y0 + 2),
            (x1 - 1, y1 - 2), (x1 - 3, y1 - 1), (x0 + 3, y1 - 1),
            (x0 + 1, y1 - 2), (x0 + 1, y0 + 2),
        ]
        clipped_polygon(draw, inner, light if index % 2 == 0 else dark, 1)
        clipped_line(draw, [(x0 + 3, y0 + 2), (x1 - 4, y0 + 2)], accent, 1, 1)
    return image


def deck(alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES["deck"]
    image, draw = base_tile(base)
    for offset in range(-16, 54, 8):
        clipped_line(draw, [(offset, 29), (offset + 48, 5)], deep, 1, 1)
    for offset in range(6 + alt * 3, 31, 11):
        clipped_line(draw, [(5, offset), (58, offset)], dark, 1, 2)
    block(draw, (27 + alt * 3, 15), (7, 2), light)
    block(draw, (39 - alt * 2, 20), (5, 1), accent)
    return image


def quiet_surface(style: str, alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES[style]
    image, draw = base_tile(base)
    for index, (x, y, width) in enumerate([(13, 14, 8), (25, 9, 6), (34, 20, 10), (45, 15, 5)]):
        block(draw, (x + alt * (index % 2), y + (alt - 1),), (width, 1 + index % 2), light if index % 2 else dark)
    if style == "road" and alt == 1:
        block(draw, (27, 15), (11, 2), accent)
    if style == "floor":
        for x in (20, 32, 44):
            clipped_line(draw, [(x - 8, 23), (x + 8, 15)], deep, 1, 2)
    return image


def mountain(alt: int) -> Image.Image:
    base, light, dark, deep, accent = PALETTES["mountain"]
    image, draw = base_tile(base)
    rocks = [(18 + alt, 16, 7, 4), (31, 10 + alt, 9, 5), (42 - alt, 20, 8, 4)]
    for index, (x, y, width, height) in enumerate(rocks):
        block(draw, (x, y), (width, height), dark if index != 1 else accent)
        block(draw, (x + 1, y), (max(2, width - 3), 1), light)
        block(draw, (x, y + height - 1), (width, 1), deep)
    return image


def water(style: str, alt: int) -> Image.Image:
    base, light, dark, deep, crest = PALETTES[style]
    image, draw = base_tile(base)
    # B/C처럼 한 바탕색이 지배하지 않도록 청록·남색 띠를 6개 변형으로 분산한다.
    for index in range(5):
        value = pattern_value(alt, index, 31)
        x = 9 + value % 17
        y = 6 + (value >> 8) % 20
        length = 17 + (value >> 16) % 16
        rise = -1 if index % 2 == 0 else 1
        color = (light, dark, deep, light, dark)[index % 5]
        width = 1 if color == deep else (3 if index == 1 else 2)
        points = [(x, y), (x + length // 2, y + rise), (x + length, y)]
        clipped_line(draw, points, color, width, 3)

    # 긴 마루는 전용 3타일 조각이 맡는다. 기본 타일은 작은 흰 하이라이트만 품는다.
    if alt % 3 == 0:
        value = pattern_value(alt, 41, 37)
        x = 18 + value % 14
        y = 12 + (value >> 8) % 8
        points = [(x, y), (x + 5, y - 1), (x + 10, y + 1), (x + 15, y)]
        clipped_line(draw, [(px, py + 1) for px, py in points], "#73C1DC", 3, 3)
        clipped_line(draw, points, crest, 2, 3)
    elif alt % 3 == 2:
        value = pattern_value(alt, 43, 41)
        x = 17 + value % 24
        y = 11 + (value >> 9) % 10
        block(draw, (x, y), (4 + alt % 3, 1), "#77BED8", 3)
    return image


def shoreline_water(alt: int, edge: str) -> Image.Image:
    image = water("water", alt)
    draw = ImageDraw.Draw(image)
    deep = "#277AA5"
    shallow = "#70C2DF"
    pale = "#D4F0F7"
    foam = "#F7FCFF"
    edges = {
        "i": [[(32, 1), (27, 3), (24, 5), (19, 6), (15, 9), (10, 10), (7, 13), (2, 15)]],
        "j": [[(32, 1), (37, 3), (40, 5), (45, 6), (49, 9), (54, 10), (57, 13), (61, 15)]],
        "ij": [[
            (2, 15), (7, 13), (10, 10), (15, 9), (19, 6), (24, 5), (27, 3), (32, 1),
            (37, 3), (40, 5), (45, 6), (49, 9), (54, 10), (57, 13), (61, 15),
        ]],
    }
    for points in edges[edge]:
        clipped_line(draw, points, deep, 14, 0)
        clipped_line(draw, points, shallow, 11, 0)
        clipped_line(draw, points, pale, 8, 0)
        clipped_line(draw, points, foam, 5, 0)
    return image


def macro_wave(alt: int, part: str) -> Image.Image:
    image = water("water", 1 + (alt % 2))
    draw = ImageDraw.Draw(image)
    paths = {
        "start": [(11, 13), (19, 13), (27, 16), (37, 18), (48, 24)],
        "mid": [(16, 8), (24, 10), (32, 14), (40, 19), (48, 24)],
        "end": [(16, 8), (24, 10), (32, 13), (40, 15), (50, 15)],
    }
    points = paths[part]
    bend = alt % 3 - 1
    points = [
        (x, y if index in (0, len(points) - 1) else y + bend * (1 if index % 2 else -1))
        for index, (x, y) in enumerate(points)
    ]
    clipped_line(draw, [(x, y + 3) for x, y in points], "#287BA7", 9, 1)
    clipped_line(draw, [(x, y + 2) for x, y in points], "#72C3DF", 7, 1)
    clipped_line(draw, points, "#F7FCFF", 3, 1)
    if part == "start":
        block(draw, (16, 12), (5, 2), "#FFFFFF", 1)
    elif part == "end":
        block(draw, (41, 14), (5, 2), "#FFFFFF", 1)
    return image


def rock_swatch(alt: int) -> Image.Image:
    """절벽 혼색용 16×16 논리 스와치.

    KairoScene은 이 텍스처를 직접 지면으로 놓지 않고 불투명 픽셀 평균을 절벽면에
    섞는다. 컨셉의 회색 절벽이 아니라 따뜻한 황갈색 암반을 유지하려는 별도 후보이다.
    """
    base, light, dark, deep, accent = PALETTES["mountain"]
    image = Image.new("RGBA", (32, 32), base)
    draw = ImageDraw.Draw(image)
    blocks = [
        (2 + alt * 2, 4, 11, 6, light),
        (15, 2 + alt, 13, 8, accent),
        (6, 17, 14, 8, dark),
        (21 - alt, 19, 9, 10, deep),
    ]
    for x, y, width, height, color in blocks:
        draw.rectangle((x, y, x + width - 1, y + height - 1), fill=color)
    return image


BUILDERS: dict[str, Callable[[int], Image.Image]] = {
    "path_stone": lambda alt: pavers("stone", alt),
    "path_deck": deck,
    "path_sand": sand,
    "lawn": lambda alt: grass("lawn", alt),
    "water_edge": lambda alt: water("water", alt),
    "floor_indoor": lambda alt: quiet_surface("floor", alt),
    "road": lambda alt: quiet_surface("road", alt),
    "sidewalk": lambda alt: pavers("sidewalk", alt),
    "verge": lambda alt: grass("verge", alt),
    "mountain_rock": mountain,
    "pool_water": lambda alt: water("pool", alt),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    assets: dict[str, object] = {}
    for ground_id, builder in BUILDERS.items():
        for alt in range(GROUND_ALT_COUNT):
            image = builder(alt)
            filename = f"ground__{ground_id}__a{alt}.png"
            path = OUT / filename
            image.save(path, optimize=True)
            asset_id = f"ground/{ground_id}:a{alt}"
            assets[asset_id] = {
                "path": f"assets/kairo-terrain-v2-pilot/{filename}",
                "density": 2,
                "logicalSize": [32, 16],
                "physicalSize": [64, 32],
                "category": "terrain",
                "sha256": sha256(path),
            }

    for alt in range(GROUND_ALT_COUNT):
        image = rock_swatch(alt)
        filename = f"terrain__rock__a{alt}.png"
        path = OUT / filename
        image.save(path, optimize=True)
        assets[f"terrain/rock:a{alt}"] = {
            "path": f"assets/kairo-terrain-v2-pilot/{filename}",
            "density": 2,
            "logicalSize": [16, 16],
            "physicalSize": [32, 32],
            "category": "terrain",
            "sha256": sha256(path),
        }

    for edge in ("i", "j", "ij"):
        for alt in range(GROUND_ALT_COUNT):
            image = shoreline_water(alt, edge)
            filename = f"ground__water_edge_shore_{edge}__a{alt}.png"
            path = OUT / filename
            image.save(path, optimize=True)
            assets[f"ground/water_edge_shore_{edge}:a{alt}"] = {
                "path": f"assets/kairo-terrain-v2-pilot/{filename}",
                "density": 2,
                "logicalSize": [32, 16],
                "physicalSize": [64, 32],
                "category": "terrain",
                "sha256": sha256(path),
            }

    for part in ("start", "mid", "end"):
        for alt in range(GROUND_ALT_COUNT):
            image = macro_wave(alt, part)
            filename = f"ground__water_edge_wave_{part}__a{alt}.png"
            path = OUT / filename
            image.save(path, optimize=True)
            assets[f"ground/water_edge_wave_{part}:a{alt}"] = {
                "path": f"assets/kairo-terrain-v2-pilot/{filename}",
                "density": 2,
                "logicalSize": [32, 16],
                "physicalSize": [64, 32],
                "category": "terrain",
                "sha256": sha256(path),
            }

    manifest = {
        "schemaVersion": 1,
        "status": "TERRAIN_V2_REVIEW_ONLY",
        "liveAtlasModified": False,
        "visualAuthority": {"path": str(REFERENCE), "sha256": sha256(REFERENCE)},
        "assets": assets,
    }
    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(
        json.dumps(
            {
                "status": "TERRAIN_V2_RUNTIME_CANDIDATE",
                "productionApproved": False,
                "manifest": str(manifest_path),
                "manifestSha256": sha256(manifest_path),
                "assetCount": len(assets),
                "unresolved": [
                    "true_four_phase_water_animation",
                    "shoreline_and_macro_wave_visual_review",
                    "user_visual_review",
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"manifest": str(manifest_path), "assets": len(assets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
