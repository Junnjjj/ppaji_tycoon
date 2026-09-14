#!/usr/bin/env python3
"""현재 32x16과 검토용 64x32 HD 픽셀 모드를 같은 맵 범위로 비교한다.

라이브 아틀라스와 데이터는 읽기만 한다. HD 시설은 승인된 1024 방향 원본을 기존
physical-to-runtime 배율의 정확히 두 배로 다시 정규화한다.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/hd-pixel-mode-pilot-v1"
ATLAS = ROOT / "public/assets/kairo-atlas.png"
ATLAS_INDEX = ROOT / "public/assets/kairo-atlas.json"
FIT_ROOT = ROOT / "artifacts/asset-concept-sheets/indoor-facilities-v1/runtime-fit-map-v1/runtime-sprites"

MAP_W = 14
MAP_H = 12
CURRENT_FACTOR = 1
HD_FACTOR = 2


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf") if bold else Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") if bold else Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size, index=9 if bold and candidate.suffix == ".ttc" else 0)
            except OSError:
                pass
    return ImageFont.load_default()


def row_span(y: int, tile_h: int) -> tuple[int, int]:
    tile_w = tile_h * 2
    half = y if y < tile_h // 2 else tile_h - 1 - y
    reach = half * 2 + 1
    return tile_w // 2 - reach, tile_w // 2 + reach


def inside(tile_h: int, x: int, y: int, inset: int = 0) -> bool:
    if y < 0 or y >= tile_h:
        return False
    x0, x1 = row_span(y, tile_h)
    return x0 + inset <= x < x1 - inset


def hd_tile(kind: str, alt: int = 0, phase: int = 0) -> Image.Image:
    tile_w, tile_h = 64, 32
    palettes = {
        "lawn": ("#8FBC63", "#9FC973", "#7FAA55", "#5F8D45", "#D4C46B"),
        "verge": ("#78A957", "#91BC68", "#668F49", "#4F733C", "#C7B85D"),
        "sand": ("#E8CF9A", "#F0DCAE", "#DCC088", "#B89560", "#FFF1C7"),
        "stone": ("#C8C5BB", "#E1DDD1", "#A7A59F", "#85878B", "#F2EEE3"),
        "sidewalk": ("#D5D1C6", "#E9E4D8", "#B6B3AA", "#92938F", "#F7F3EA"),
        "floor": ("#D9CDB8", "#EEE4D3", "#BFAF97", "#8E8374", "#FFF7E9"),
        "deck": ("#B88752", "#D2A66E", "#966C42", "#6E4B31", "#E6C18A"),
        "road": ("#66737A", "#7C898E", "#515C62", "#343D43", "#D9C86A"),
        "mountain": ("#81796A", "#9A907E", "#696254", "#47443E", "#B7A98E"),
        "water": ("#57A4C2", "#68B7D1", "#438DAA", "#2C718F", "#CBEFF7"),
        "pool": ("#4BBBD1", "#72D2DF", "#349DB7", "#25758E", "#D9FAFF"),
    }
    base, light, dark, deep, accent = palettes[kind]
    image = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for y in range(tile_h):
        x0, x1 = row_span(y, tile_h)
        draw.line((x0, y, x1 - 1, y), fill=base)

    seed = alt * 17 + phase * 11
    if kind in {"lawn", "verge"}:
        tufts = [(17 + (seed % 5), 13), (39 - (seed % 4), 18), (29, 9 + (alt % 3))]
        for index, (x, y) in enumerate(tufts):
            color = deep if index != 1 else light
            for px, py in ((x, y), (x, y + 1), (x - 1, y + 1), (x + 1, y + 1)):
                if inside(tile_h, px, py, 2):
                    draw.point((px, py), fill=color)
        if alt == 2:
            draw.line((24, 20, 26, 20), fill=accent)
    elif kind == "sand":
        for k in range(16):
            x = 9 + ((k * 13 + seed * 3) % 46)
            y = 7 + ((k * 7 + seed) % 18)
            if inside(tile_h, x, y, 2):
                draw.point((x, y), fill=light if k % 3 else dark)
        draw.line((23, 19, 27, 19), fill=accent)
    elif kind in {"stone", "sidewalk", "floor"}:
        for y in range(7, 27, 6):
            x0, x1 = row_span(y, tile_h)
            draw.line((x0 + 3, y, x1 - 4, y), fill=dark)
        for x in range(16, 52, 9):
            for y in range(10, 25):
                if inside(tile_h, x, y, 2) and (y + x) % 5 < 2:
                    draw.point((x, y), fill=deep)
    elif kind == "deck":
        for y in range(7, 27, 5):
            x0, x1 = row_span(y, tile_h)
            draw.line((x0 + 3, y, x1 - 4, y), fill=dark)
        for x in range(14 + (alt % 2) * 4, 54, 11):
            for y in range(8, 25):
                if inside(tile_h, x, y, 3) and y % 5 != 0:
                    draw.point((x, y), fill=deep)
        draw.line((28, 12, 32, 12), fill=accent)
    elif kind == "road":
        for k in range(12):
            x = 10 + ((k * 17 + seed) % 42)
            y = 8 + ((k * 11 + seed * 2) % 16)
            if inside(tile_h, x, y, 3):
                draw.point((x, y), fill=light if k % 3 else dark)
        if alt == 1:
            draw.line((27, 15, 36, 15), fill=accent)
    elif kind == "mountain":
        clusters = [(18 + alt * 2, 15), (33, 10 + alt), (43 - alt * 2, 20)]
        for k, (x, y) in enumerate(clusters):
            for dx, dy in ((0, 0), (1, 0), (-1, 1), (0, 1), (1, 1), (2, 1)):
                if inside(tile_h, x + dx, y + dy, 3):
                    draw.point((x + dx, y + dy), fill=light if k == 1 and dy == 0 else dark)
        draw.line((24, 21, 29, 21), fill=deep)
    else:
        # 타일마다 위치·길이·명암을 바꿔 긴 하얀 막대가 줄지어 보이지 않게 한다.
        shift = (0, 5, 9, 3)[phase % 4]
        for k in range(5):
            y = 8 + ((k * 5 + alt * 3 + phase) % 17)
            x = 10 + ((k * 13 + alt * 7 + shift) % 39)
            if inside(tile_h, x, y, 4):
                length = 2 + ((k + alt + phase) % 5)
                x1 = min(x + length, row_span(y, tile_h)[1] - 4)
                if x1 > x:
                    draw.line((x, y, x1, y), fill=light if (k + phase) % 3 else dark)

        # 얇은 2단 파도를 일부 타일에만 놓아 흠이 나는 표면으로 보이게 한다.
        if (alt + phase) % 3 == 0:
            crest_y = 14 + ((alt * 2 + phase) % 5)
            crest_x = 17 + shift
            crest_end = min(crest_x + 8 + alt, row_span(crest_y, tile_h)[1] - 4)
            if crest_end - crest_x >= 5:
                draw.line((crest_x + 2, crest_y - 1, crest_end - 2, crest_y - 1), fill=accent)
                draw.line((crest_x, crest_y, crest_end, crest_y), fill=accent)
                draw.line((crest_x + 3, crest_y + 1, crest_end - 1, crest_y + 1), fill=deep)
    return image


def current_tile(atlas: Image.Image, index: dict[str, Any], kind: str, alt: int) -> Image.Image:
    ids = {
        "lawn": f"ground/lawn:a{alt % 3}",
        "sand": f"ground/path_sand:a{alt % 3}",
        "stone": f"ground/path_stone:a{alt % 3}",
        "water": f"ground/water_edge:a{alt % 3}",
    }
    frame = index[ids[kind]]
    return atlas.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("empty facility source")
    return bbox


def bottom_contact(image: Image.Image, threshold: int = 128) -> tuple[float, int]:
    alpha = image.getchannel("A")
    for y in range(alpha.height - 1, -1, -1):
        xs = [x for x in range(alpha.width) if alpha.getpixel((x, y)) >= threshold]
        if xs:
            return sum(xs) / len(xs), y
    raise ValueError("facility source has no opaque contact")


def build_hd_facility(asset_id: str) -> tuple[Image.Image, dict[str, Any]]:
    metrics_path = FIT_ROOT / asset_id / "runtime-footprint-metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    direction = metrics["directions"][0]
    source_path = Path(direction["source"]["path"])
    source = Image.open(source_path).convert("RGBA")
    bbox = alpha_bbox(source)
    contact_x, contact_y = bottom_contact(source)
    crop = source.crop(bbox)
    runtime_scale = float(metrics["runtime_image_scale"]) * HD_FACTOR
    resized_w = max(1, round(crop.width * runtime_scale))
    resized_h = max(1, round(crop.height * runtime_scale))
    resized = crop.resize((resized_w, resized_h), Image.Resampling.LANCZOS)

    canvas_w = int(metrics["current_canvas"][0]) * HD_FACTOR
    canvas_h = int(metrics["current_canvas"][1]) * HD_FACTOR
    contact_in_crop_x = (contact_x - bbox[0]) * resized_w / crop.width
    contact_in_crop_y = (contact_y - bbox[1]) * resized_h / crop.height
    footprint_w = int(metrics["size"][0])
    target_x = footprint_w * 16 * HD_FACTOR - 0.5 * HD_FACTOR
    target_y = canvas_h - HD_FACTOR
    paste_x = round(target_x - contact_in_crop_x)
    paste_y = round(target_y - contact_in_crop_y)
    output = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    output.alpha_composite(resized, (paste_x, paste_y))
    return output, {
        "asset_id": asset_id,
        "source": str(source_path),
        "source_sha256": sha256(source_path),
        "current_canvas": metrics["current_canvas"],
        "hd_canvas": [canvas_w, canvas_h],
        "current_subject_wh": direction["scale"]["resized_subject_wh"],
        "hd_subject_wh": [resized_w, resized_h],
        "footprint": metrics["size"],
        "runtime_scale_hd": runtime_scale,
        "paste_xy": [paste_x, paste_y],
    }


def tile_kind(i: int, j: int) -> str:
    if j >= 9:
        return "water"
    if j == 8:
        return "sand"
    if i == 6 or (j == 5 and 2 <= i <= 11):
        return "stone"
    return "lawn"


def map_canvas(factor: int, atlas: Image.Image, index: dict[str, Any], facilities: dict[str, Image.Image]) -> Image.Image:
    tile_w = 32 * factor
    tile_h = 16 * factor
    step_x = 16 * factor
    step_y = 8 * factor
    margin_x = 54 * factor
    margin_top = 88 * factor
    width = (MAP_W + MAP_H) * step_x + margin_x * 2
    height = (MAP_W + MAP_H) * step_y + margin_top + 46 * factor
    image = Image.new("RGBA", (width, height), "#17313A")
    origin = (MAP_H * step_x + margin_x, margin_top)

    cells = [(i, j) for j in range(MAP_H) for i in range(MAP_W)]
    cells.sort(key=lambda cell: (cell[0] + cell[1], cell[0]))
    for i, j in cells:
        kind = tile_kind(i, j)
        alt = (i * 7 + j * 13) % 3
        tile = hd_tile(kind, alt, phase=(i + j) % 4) if factor == HD_FACTOR else current_tile(atlas, index, kind, alt)
        x = origin[0] + step_x * (i - j) - tile_w // 2
        y = origin[1] + step_y * (i + j)
        image.alpha_composite(tile, (x, y))

    placements = [
        ("icecream", 2, 5, [1, 2]),
        ("cafe", 8, 3, [2, 3]),
    ]
    for asset_id, i, j, size in placements:
        sprite = facilities[asset_id]
        anchor_x = origin[0] + step_x * (i - j) + step_x * (size[0] - size[1]) // 2
        anchor_y = origin[1] + step_y * (i + j + size[0] + size[1])
        image.alpha_composite(sprite, (round(anchor_x - sprite.width / 2), anchor_y - sprite.height))
    return image


def panel_label(image: Image.Image, title: str, subtitle: str, color: str) -> None:
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((22, 20, image.width - 22, 78), radius=16, fill="#0B1B23E8", outline=color, width=2)
    draw.text((42, 29), title, fill=color, font=font(24, True))
    draw.text((42, 55), subtitle, fill="#EAF2E8", font=font(14))


def unique_opaque_colors(image: Image.Image) -> int:
    rgba = image.convert("RGBA")
    return len({pixel[:3] for pixel in rgba.getdata() if pixel[3] > 0})


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "hd-facilities").mkdir(exist_ok=True)
    (OUT / "hd-tiles").mkdir(exist_ok=True)
    atlas = Image.open(ATLAS).convert("RGBA")
    index = json.loads(ATLAS_INDEX.read_text(encoding="utf-8"))

    current_facilities: dict[str, Image.Image] = {}
    hd_facilities: dict[str, Image.Image] = {}
    records: list[dict[str, Any]] = []
    for asset_id in ("icecream", "cafe"):
        metrics = json.loads((FIT_ROOT / asset_id / "runtime-footprint-metrics.json").read_text(encoding="utf-8"))
        current_path = Path(metrics["directions"][0]["recommended"]["path"])
        current_facilities[asset_id] = Image.open(current_path).convert("RGBA")
        hd, record = build_hd_facility(asset_id)
        hd_path = OUT / "hd-facilities" / f"{asset_id}-d0-hd2x.png"
        hd.save(hd_path, optimize=True)
        record.update({"hd_path": str(hd_path), "hd_sha256": sha256(hd_path)})
        hd_facilities[asset_id] = hd
        records.append(record)

    for kind in ("lawn", "sand", "stone", "water"):
        phases = range(4) if kind == "water" else range(3)
        for variant in phases:
            tile = hd_tile(kind, variant if kind != "water" else 0, variant if kind == "water" else 0)
            tile.save(OUT / "hd-tiles" / f"{kind}-{variant}.png", optimize=True)

    current_map_native = map_canvas(CURRENT_FACTOR, atlas, index, current_facilities)
    current_map = current_map_native.resize((current_map_native.width * 2, current_map_native.height * 2), Image.Resampling.NEAREST)
    hd_map = map_canvas(HD_FACTOR, atlas, index, hd_facilities)
    panel_label(current_map, "CURRENT — 32×16", "현재 아틀라스 · 1배 내부 해상도를 2배 확대", "#F0B95C")
    panel_label(hd_map, "HD PILOT — 64×32", "같은 14×12 맵 범위 · 고해상도 원본을 2배 런타임 캔버스로 재정규화", "#66D6F0")
    current_path = OUT / "current-map-2x-nearest.png"
    hd_path = OUT / "hd-map-native-2x.png"
    current_map.save(current_path, optimize=True)
    hd_map.save(hd_path, optimize=True)

    gutter = 24
    footer = 74
    board = Image.new("RGBA", (current_map.width + hd_map.width + gutter, max(current_map.height, hd_map.height) + footer), "#0A171D")
    board.alpha_composite(current_map, (0, 0))
    board.alpha_composite(hd_map, (current_map.width + gutter, 0))
    draw = ImageDraw.Draw(board)
    y = max(current_map.height, hd_map.height) + 16
    draw.text((26, y), "동일한 월드 범위와 화면상 크기 · 왼쪽은 기존 픽셀을 확대, 오른쪽은 실제 2배 픽셀 예산", fill="#F4E8C8", font=font(20, True))
    draw.text((26, y + 28), "검토용 파일럿 — 라이브 아틀라스, 시뮬레이션 데이터, 시설 계약은 변경하지 않음", fill="#91AEB8", font=font(15))
    board_path = OUT / "current-vs-hd-map.png"
    board.convert("RGB").save(board_path, quality=96)

    manifest = {
        "schema_version": 1,
        "status": "HD_PIXEL_MODE_REVIEW_ONLY",
        "live_files_modified": False,
        "world_coverage_tiles": [MAP_W, MAP_H],
        "current": {
            "tile": [32, 16],
            "map_path": str(current_path),
            "map_sha256": sha256(current_path),
            "opaque_rgb_count": unique_opaque_colors(current_map),
        },
        "hd": {
            "tile": [64, 32],
            "map_path": str(hd_path),
            "map_sha256": sha256(hd_path),
            "opaque_rgb_count": unique_opaque_colors(hd_map),
        },
        "comparison": {"path": str(board_path), "sha256": sha256(board_path)},
        "facilities": records,
        "unresolved": [
            "full_renderer_backing_buffer_2x",
            "all_asset_hd_canvases",
            "hd_atlas_memory_and_load_budget",
            "input_and_camera_regression",
            "user_visual_approval",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"board": str(board_path), "current": str(current_path), "hd": str(hd_path), "facilities": records}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
