#!/usr/bin/env python3
"""승인된 source-v1 계열 이미지에서 review-only terrain-v3 팩을 만든다.

ImageGen 원본의 실제 픽셀 군집을 유지하되, 런타임 경계는 정확한 2:1 마스크로 정규화한다.
라이브 아틀라스나 기본 공급자는 수정하지 않는다.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source"
CORE = SOURCE_ROOT / "runtime-core-source-v1.png"
TRANSITION = SOURCE_ROOT / "runtime-transition-source-v1.png"
MACRO_GUIDE = SOURCE_ROOT / "macro-shore-guide.png"
MACRO_SOURCE = SOURCE_ROOT / "macro-shore-source-v1.png"
OUT = ROOT / "public/assets/kairo-terrain-v3-source"
EVIDENCE = SOURCE_ROOT / "runtime-pack.json"
TILE_SIZE = (128, 64)
DENSITY = 4


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chroma(pixel: tuple[int, int, int] | tuple[int, int, int, int]) -> bool:
    r, g, b = pixel[:3]
    return r >= 220 and b >= 220 and g <= 90


def magenta_fringe(pixel: tuple[int, int, int] | tuple[int, int, int, int]) -> bool:
    r, g, b = pixel[:3]
    return r > g * 1.35 and b > g * 1.35 and r + b > 150


def macro_magenta_fringe(pixel: tuple[int, int, int] | tuple[int, int, int, int]) -> bool:
    """모래와 마젠타가 섞여 생긴 분홍 안티앨리어싱까지 잡는다."""
    r, g, b = pixel[:3]
    return magenta_fringe(pixel) or (r > 190 and r > g * 1.1 and b > 100 and b > g * 0.82)


def exact_diamond(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = source.crop(box).convert("RGB").resize(TILE_SIZE, Image.Resampling.NEAREST)
    src = crop.load()
    out = Image.new("RGBA", TILE_SIZE, (0, 0, 0, 0))
    dst = out.load()
    width, height = TILE_SIZE
    for y in range(height):
        half = y if y < height // 2 else height - 1 - y
        reach = half * 2 + 1
        x0, x1 = width // 2 - reach, width // 2 + reach
        # 시트의 짙은 외곽선은 카탈로그에서는 좋지만 반복 타일에선 격자 밴딩이 된다.
        # 내부 source-v1 픽셀을 4px 안쪽에서 다시 투영해 색·질감은 보존하고 선만 제외한다.
        sample_y = round(4 + (y / max(1, height - 1)) * (height - 9))
        valid = [x for x in range(width) if not chroma(src[x, sample_y])]
        if not valid:
            continue
        left, right = valid[0], valid[-1]
        source_inset = min(4, max(0, (right - left) // 4))
        left += source_inset
        right -= source_inset
        for x in range(x0, x1):
            u = (x - x0) / max(1, x1 - x0 - 1)
            sample_x = round(left + u * (right - left))
            color = src[sample_x, sample_y]
            if chroma(color):
                color = src[left if x < (left + right) // 2 else right, sample_y]
            if magenta_fringe(color):
                color = (35, 49, 66)
            dst[x, y] = (*color, 255)
    return out


def overlay_material(pixel: tuple[int, int, int] | tuple[int, int, int, int]) -> str | None:
    """가이드/생성본의 모래·포말·얕은 물을 분류한다."""
    if chroma(pixel) or macro_magenta_fringe(pixel):
        return None
    r, g, b = pixel[:3]
    if min(r, g, b) >= 205 and max(r, g, b) - min(r, g, b) <= 65:
        return "foam"
    if b > r * 1.08 and g > r * 1.03:
        return "shallow"
    return "sand"


def exact_overlay(
    source: Image.Image,
    guide: Image.Image,
    box: tuple[int, int, int, int],
) -> Image.Image:
    """ImageGen 색은 보존하고 exact guide가 알파·접속점을 소유하게 한다."""
    src = source.crop(box).convert("RGB").resize(TILE_SIZE, Image.Resampling.NEAREST)
    mask = guide.crop(box).convert("RGB").resize(TILE_SIZE, Image.Resampling.NEAREST)
    src_px = src.load()
    mask_px = mask.load()
    out = Image.new("RGBA", TILE_SIZE, (0, 0, 0, 0))
    dst = out.load()
    candidates: dict[str, list[tuple[int, int]]] = {"sand": [], "foam": [], "shallow": []}
    for y in range(TILE_SIZE[1]):
        for x in range(TILE_SIZE[0]):
            material = overlay_material(src_px[x, y])
            if material:
                candidates[material].append((x, y))

    for y in range(TILE_SIZE[1]):
        for x in range(TILE_SIZE[0]):
            material = overlay_material(mask_px[x, y])
            if material is None:
                continue
            color = src_px[x, y]
            if overlay_material(color) is None:
                pool = candidates[material]
                if pool:
                    sx, sy = min(pool, key=lambda point: abs(point[0] - x) + abs(point[1] - y))
                    color = src_px[sx, sy]
                elif material == "sand":
                    color = (232, 184, 94)
                elif material == "foam":
                    color = (248, 253, 255)
                else:
                    color = (121, 203, 228)
            dst[x, y] = (*color, 255)
    return out


def face_swatch(source: Image.Image, side: str) -> Image.Image:
    """level-3 블록의 실제 면을 128×192 직사각 스와치로 펼친다."""
    if side == "j":
        top_a, top_b = (1220.0, 600.0), (1330.0, 655.0)
        bot_a, bot_b = (1220.0, 810.0), (1330.0, 865.0)
    else:
        top_a, top_b = (1330.0, 655.0), (1440.0, 600.0)
        bot_a, bot_b = (1330.0, 865.0), (1440.0, 810.0)
    src = source.convert("RGB")
    out = Image.new("RGBA", (128, 192), (0, 0, 0, 0))
    pixels = out.load()
    for y in range(out.height):
        v = y / max(1, out.height - 1)
        for x in range(out.width):
            u = x / max(1, out.width - 1)
            tx = top_a[0] * (1 - u) + top_b[0] * u
            ty = top_a[1] * (1 - u) + top_b[1] * u
            bx = bot_a[0] * (1 - u) + bot_b[0] * u
            by = bot_a[1] * (1 - u) + bot_b[1] * u
            sx = round(tx * (1 - v) + bx * v)
            sy = round(ty * (1 - v) + by * v)
            color = src.getpixel((sx, sy))
            pixels[x, y] = (*color, 255)

    # ImageGen 분리 배경의 자홍색 안티앨리어싱이 블록 외곽에 1~3px 남을 수 있다.
    # 면의 각 가로줄에서 가장 가까운 실제 흙/암석 픽셀로만 메워 원본 질감은 유지한다.
    for y in range(out.height):
        safe_x = [x for x in range(out.width) if not magenta_fringe(pixels[x, y])]
        if not safe_x:
            continue
        for x in range(out.width):
            if not magenta_fringe(pixels[x, y]):
                continue
            nearest = min(safe_x, key=lambda candidate: abs(candidate - x))
            pixels[x, y] = pixels[nearest, y]
    return out


def canonical_edge(image: Image.Image, band: int = DENSITY) -> Image.Image:
    """반복 타일의 최외곽만 source 내부 대표색으로 맞춘다."""
    out = image.copy()
    pixels = out.load()
    interior: list[tuple[int, int, int]] = []
    rows: dict[int, tuple[int, int]] = {}
    for y in range(out.height):
        opaque = [x for x in range(out.width) if pixels[x, y][3] > 0]
        if not opaque:
            continue
        rows[y] = (opaque[0], opaque[-1])
        left, right = rows[y]
        for x in range(left + band * 2, right - band * 2 + 1):
            interior.append(pixels[x, y][:3])
    if not interior:
        return out
    base = tuple(round(median(channel)) for channel in zip(*interior))
    for y, (left, right) in rows.items():
        for x in range(left, right + 1):
            if min(x - left, right - x) < band:
                pixels[x, y] = (*base, 255)
    return out


def save_asset(
    assets: dict[str, object],
    asset_id: str,
    filename: str,
    image: Image.Image,
    logical_size: tuple[int, int] = (32, 16),
) -> None:
    path = OUT / filename
    image.save(path, optimize=True)
    assets[asset_id] = {
        "path": f"assets/kairo-terrain-v3-source/{filename}",
        "density": DENSITY,
        "logicalSize": list(logical_size),
        "physicalSize": list(image.size),
        "category": "terrain",
        "sha256": sha256(path),
    }


def main() -> None:
    core = Image.open(CORE)
    transition = Image.open(TRANSITION)
    macro_guide = Image.open(MACRO_GUIDE)
    macro_source = Image.open(MACRO_SOURCE)
    OUT.mkdir(parents=True, exist_ok=True)
    assets: dict[str, object] = {}

    top_centers = (150, 395, 640, 885, 1130, 1375)
    top_ids = ("lawn:a0", "lawn:a1", "lawn:a2", "path_sand:a0", "path_stone:a0", "path_deck:a0")
    top_images: dict[str, Image.Image] = {}
    for cx, ground_id in zip(top_centers, top_ids):
        tile = exact_diamond(core, (cx - 109, 160, cx + 109, 270))
        if ground_id == "path_sand:a0":
            tile = canonical_edge(tile)
        top_images[ground_id] = tile
        save_asset(assets, f"ground/{ground_id}", f"ground__{ground_id.replace(':', '__')}.png", tile)

    # 잔디·돌길 파생 종류도 source-v1 실제 픽셀을 공유하되 별도 ID로 기록한다.
    for alt in range(3):
        save_asset(assets, f"ground/verge:a{alt}", f"ground__verge__a{alt}.png", top_images[f"lawn:a{alt}"])
    save_asset(assets, "ground/sidewalk:a0", "ground__sidewalk__a0.png", top_images["path_stone:a0"])

    for alt, cx in enumerate((225, 585, 945, 1305)):
        tile = exact_diamond(core, (cx - 150, 470, cx + 150, 620))
        save_asset(assets, f"ground/water_edge:a{alt}", f"ground__water_edge__a{alt}.png", tile)
        save_asset(assets, f"ground/pool_water:a{alt}", f"ground__pool_water__a{alt}.png", tile)

    for edge, cx in zip(("i", "j", "ij"), (285, 768, 1251)):
        tile = exact_diamond(transition, (cx - 160, 160, cx + 160, 320))
        for alt in range(4):
            save_asset(
                assets,
                f"ground/water_edge_shore_{edge}:a{alt}",
                f"ground__water_edge_shore_{edge}__a{alt}.png",
                tile,
            )

    for side in ("i", "j"):
        swatch = face_swatch(transition, side)
        save_asset(assets, f"terrain/cliff_{side}", f"terrain__cliff_{side}.png", swatch, (32, 48))

    macro_ids = (
        "shore_curve_i_start",
        "shore_curve_i_mid",
        "shore_curve_i_end",
        "shore_curve_j_start",
        "shore_curve_j_mid",
        "shore_curve_j_end",
        "shore_curve_outer_corner",
        "shore_curve_inner_corner",
    )
    macro_centers = (
        (210, 260),
        (582, 260),
        (954, 260),
        (1326, 260),
        (210, 760),
        (582, 760),
        (954, 760),
        (1326, 760),
    )
    for asset_id, (cx, cy) in zip(macro_ids, macro_centers):
        overlay = exact_overlay(
            macro_source,
            macro_guide,
            (cx - 160, cy - 80, cx + 160, cy + 80),
        )
        save_asset(
            assets,
            f"overlay/{asset_id}",
            f"overlay__{asset_id}.png",
            overlay,
        )

    manifest = {
        "schemaVersion": 1,
        "status": "TERRAIN_V3_SOURCE_REVIEW_ONLY",
        "productionApproved": False,
        "liveAtlasModified": False,
        "visualAuthority": {"path": str(SOURCE_ROOT / "terrain-master-source-v1.png"), "sha256": sha256(SOURCE_ROOT / "terrain-master-source-v1.png")},
        "sourceSheets": [
            {"path": str(CORE), "sha256": sha256(CORE)},
            {"path": str(TRANSITION), "sha256": sha256(TRANSITION)},
            {"path": str(MACRO_SOURCE), "sha256": sha256(MACRO_SOURCE)},
            {"path": str(MACRO_GUIDE), "sha256": sha256(MACRO_GUIDE)},
        ],
        "assets": assets,
    }
    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    EVIDENCE.write_text(
        json.dumps(
            {
                "status": "TERRAIN_V3_SOURCE_RUNTIME_CANDIDATE",
                "productionApproved": False,
                "assetCount": len(assets),
                "manifest": str(manifest_path),
                "manifestSha256": sha256(manifest_path),
                "unresolved": ["macro_shore_runtime_visual_review", "water_phase_animation", "production_adoption"],
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
