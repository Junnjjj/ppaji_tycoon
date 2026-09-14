#!/usr/bin/env python3
"""Build review-only Kairo map placement evidence for the 20 facility wave.

The accepted sprite pack, atlas, simulation data, and render contract are read
only.  Each high-resolution ImageGen color guide is scaled from its physical
mesh bounds to the canonical simulation footprint, aligned to the exact
32x16 Kairo grid contact, and shown on a four-facing review map.

This is Wave 4 evidence only.  It deliberately does not adopt the candidates.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


WORKSPACE = Path(__file__).resolve().parents[1]
PORTFOLIO = WORKSPACE / "artifacts/asset-concept-sheets/indoor-facilities-v1"
OUT = PORTFOLIO / "runtime-fit-map-v1"
PILOT_ROOT = WORKSPACE / "assets/generated/kairo-v4-simple-pilot"
FACILITY_DATA = WORKSPACE / "src/data/kairo-facilities.json"
RENDER_CONTRACT = WORKSPACE / "src/assets/kairo-render-contract.json"
ACCESS_MANIFEST = PORTFOLIO / "four-direction-manifest.json"

ASSET_IDS = [
    "toilet",
    "shower_row",
    "locker_row",
    "washbasin_row",
    "changing_row",
    "nursing",
    "infirmary",
    "sikhye",
    "snackbar",
    "chicken",
    "icecream",
    "cafe",
    "shop",
    "vending_in",
    "arcade",
    "karaoke",
    "pingpong",
    "info",
    "office",
    "storage",
]

TILE_W = 32
TILE_H = 16
STEP_X = 16
STEP_Y = 8
PANEL_W = 300
PANEL_H = 214
BOARD_COLS = 4
BOARD_ROWS = 5
BOARD_HEADER = 100
BOARD_PAD = 20
BOARD_SCALE = 2
STATE = "RUNTIME_FIT_USER_REVIEW"
FOOTPRINT_DECISION_STATE = "USER_APPROVED_FOR_ATOMIC_ADOPTION"
FOOTPRINT_APPROVED_ON = "2026-08-27"
FOOTPRINT_DECISIONS = {
    "icecream": {
        "approved_size": [1, 1],
        "current_live_size": [1, 2],
        "approved_canvas": [32, 36],
        "approved_anchor_texel": [16, 36],
        "slot_contract": "existing tile [0,0] remains in bounds",
    },
    "cafe": {
        "approved_size": [2, 2],
        "current_live_size": [2, 3],
        "approved_canvas": [64, 52],
        "approved_anchor_texel": [32, 52],
        "slot_contract": "all existing [0..1,0..1] seating slots remain in bounds",
    },
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(file_path: Path) -> dict[str, Any]:
    value = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected object: {file_path}")
    return value


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
        if bold
        else Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
        if bold
        else Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            try:
                index = 9 if bold and candidate.suffix == ".ttc" else 0
                return ImageFont.truetype(str(candidate), size=size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source image has no alpha foreground")
    return bbox


def bottom_contact(image: Image.Image, threshold: int = 128) -> tuple[float, int]:
    alpha = image.getchannel("A")
    for y in range(alpha.height - 1, -1, -1):
        xs = [x for x in range(alpha.width) if alpha.getpixel((x, y)) >= threshold]
        if xs:
            return sum(xs) / len(xs), y
    raise ValueError("source image has no opaque contact")


def direction_size(size: list[int], direction: int) -> tuple[int, int]:
    return (size[1], size[0]) if direction % 2 else (size[0], size[1])


def quarter_turn_offset(
    size: list[int], offset: list[int], direction: int
) -> tuple[int, int]:
    w, d = size
    di, dj = offset
    if direction == 0:
        return di, dj
    if direction == 1:
        return dj, w - 1 - di
    if direction == 2:
        return w - 1 - di, d - 1 - dj
    return d - 1 - dj, di


FACING_CYCLE = ["+Z", "+X", "-Z", "-X"]


def rotated_facing(value: str, direction: int) -> str:
    try:
        start = FACING_CYCLE.index(value)
    except ValueError:
        return value
    return FACING_CYCLE[(start + direction) % 4]


def source_package(asset_id: str) -> tuple[Path, Path, Path, dict[str, Path]]:
    if asset_id == "changing_row":
        package = PILOT_ROOT / asset_id / "physical-meshy-v1"
        source_dir = package / "color-transfer/selected-v1/directions"
    else:
        package = (
            PILOT_ROOT
            / asset_id
            / "physical-meshy-batch-v1/dense-d0-v1/physical-directions-v1"
        )
        source_dir = package / "color-transfer/v1/locked"
    sources = {f"d{direction}": source_dir / f"d{direction}.png" for direction in range(4)}
    return package, package / "physical-rotations.json", package / "union-canvas.json", sources


def bounds_size(rotation: dict[str, Any]) -> list[float]:
    d0 = rotation["directions"]["d0"]
    bounds = d0.get("world_conservative_bounds_min_max") or d0.get("world_bounds_min_max")
    if not isinstance(bounds, list) or len(bounds) != 2:
        raise ValueError("missing d0 world bounds")
    return [float(bounds[1][axis]) - float(bounds[0][axis]) for axis in range(3)]


def normalize_direction(
    *,
    asset_id: str,
    direction: int,
    source_path: Path,
    canvas: list[int],
    body_h: int,
    size: list[int],
    runtime_scale: float,
    output_dir: Path,
) -> dict[str, Any]:
    source = Image.open(source_path).convert("RGBA")
    bbox = alpha_bbox(source)
    source_contact_x, source_contact_y = bottom_contact(source)
    crop = source.crop(bbox)

    resized_w = max(1, round(crop.width * runtime_scale))
    resized_h = max(1, round(crop.height * runtime_scale))
    resized = crop.resize((resized_w, resized_h), Image.Resampling.LANCZOS)
    scale_x = resized_w / crop.width
    scale_y = resized_h / crop.height
    contact_in_crop_x = (source_contact_x - bbox[0]) * scale_x
    contact_in_crop_y = (source_contact_y - bbox[1]) * scale_y

    footprint_w, footprint_d = direction_size(size, direction)
    target_contact_x = footprint_w * STEP_X - 0.5
    required_h = max(canvas[1], math.ceil(contact_in_crop_y + 1))

    def place(target_h: int, label: str) -> tuple[Image.Image, dict[str, Any]]:
        paste_x = round(target_contact_x - contact_in_crop_x)
        paste_y = round((target_h - 1) - contact_in_crop_y)
        sprite = Image.new("RGBA", (canvas[0], target_h), (0, 0, 0, 0))
        sprite.alpha_composite(resized, (paste_x, paste_y))
        normalized_bbox = sprite.getchannel("A").getbbox()
        normalized_contact_x, normalized_contact_y = bottom_contact(sprite)
        alpha_before = sum(1 for value in resized.getchannel("A").getdata() if value > 0)
        alpha_after = sum(1 for value in sprite.getchannel("A").getdata() if value > 0)
        return sprite, {
            "mode": label,
            "canvas": [canvas[0], target_h],
            "paste_xy": [paste_x, paste_y],
            "normalized_alpha_bbox_xyxy": list(normalized_bbox) if normalized_bbox else None,
            "normalized_contact_xy": [round(normalized_contact_x, 4), normalized_contact_y],
            "target_contact_xy": [target_contact_x, target_h - 1],
            "contact_delta_xy": [
                round(normalized_contact_x - target_contact_x, 4),
                normalized_contact_y - (target_h - 1),
            ],
            "retained_foreground_ratio": round(alpha_after / max(1, alpha_before), 8),
            "clipped": alpha_after < alpha_before,
            "edge_touch": {
                "left": normalized_bbox is not None and normalized_bbox[0] == 0,
                "top": normalized_bbox is not None and normalized_bbox[1] == 0,
                "right": normalized_bbox is not None and normalized_bbox[2] == canvas[0],
                "bottom": normalized_bbox is not None and normalized_bbox[3] == target_h,
            },
        }

    current_sprite, current_record = place(canvas[1], "current_canvas")
    recommended_sprite, recommended_record = place(required_h, "footprint_fit_recommended")

    current_path = output_dir / f"d{direction}-current-{canvas[0]}x{canvas[1]}.png"
    recommended_path = output_dir / f"d{direction}-recommended-{canvas[0]}x{required_h}.png"
    current_sprite.save(current_path, optimize=True)
    recommended_sprite.save(recommended_path, optimize=True)
    current_record.update({"path": str(current_path), "sha256": sha256_file(current_path)})
    recommended_record.update(
        {"path": str(recommended_path), "sha256": sha256_file(recommended_path)}
    )

    return {
        "asset_id": asset_id,
        "direction": f"d{direction}",
        "footprint": [footprint_w, footprint_d],
        "source": {
            "path": str(source_path),
            "sha256": sha256_file(source_path),
            "canvas": list(source.size),
            "alpha_bbox_xyxy": list(bbox),
            "bottom_contact_xy": [round(source_contact_x, 4), source_contact_y],
        },
        "scale": {
            "physical_to_runtime": round(runtime_scale, 10),
            "resized_subject_wh": [resized_w, resized_h],
            "effective_xy": [round(scale_x, 10), round(scale_y, 10)],
        },
        "current": current_record,
        "recommended": recommended_record,
        "recommended_image": recommended_sprite,
    }


def grid_to_screen(i: float, j: float) -> tuple[float, float]:
    return STEP_X * (i - j), STEP_Y * (i + j)


def tile_polygon(i: int, j: int, origin: tuple[int, int]) -> list[tuple[int, int]]:
    points = [
        grid_to_screen(i, j),
        grid_to_screen(i + 1, j),
        grid_to_screen(i + 1, j + 1),
        grid_to_screen(i, j + 1),
    ]
    return [(round(origin[0] + x), round(origin[1] + y)) for x, y in points]


def tile_center(i: int, j: int, origin: tuple[int, int]) -> tuple[int, int]:
    x, y = grid_to_screen(i + 0.5, j + 0.5)
    return round(origin[0] + x), round(origin[1] + y)


def footprint_anchor(
    i: int, j: int, w: int, d: int, origin: tuple[int, int]
) -> tuple[int, int]:
    return (
        round(origin[0] + STEP_X * (i - j) + STEP_X * (w - d) / 2),
        round(origin[1] + STEP_Y * (i + j + w + d)),
    )


def arrow_vector(facing: str) -> tuple[int, int]:
    return {
        "+X": (8, 4),
        "+Z": (-8, 4),
        "-X": (-8, -4),
        "-Z": (8, -4),
    }.get(facing, (0, 0))


def draw_arrow(
    draw: ImageDraw.ImageDraw, start: tuple[int, int], facing: str, color: tuple[int, int, int, int]
) -> None:
    dx, dy = arrow_vector(facing)
    end = (start[0] + dx, start[1] + dy)
    draw.line((start, end), fill=color, width=2)
    if dx == 0 and dy == 0:
        return
    norm = math.hypot(dx, dy)
    ux, uy = dx / norm, dy / norm
    px, py = -uy, ux
    left = (round(end[0] - ux * 4 + px * 3), round(end[1] - uy * 4 + py * 3))
    right = (round(end[0] - ux * 4 - px * 3), round(end[1] - uy * 4 - py * 3))
    draw.polygon((end, left, right), fill=color)


def panel_for_asset(asset: dict[str, Any], direction: int) -> Image.Image:
    panel = Image.new("RGBA", (PANEL_W, PANEL_H), (18, 29, 36, 255))
    draw = ImageDraw.Draw(panel, "RGBA")
    draw.rounded_rectangle(
        (1, 1, PANEL_W - 2, PANEL_H - 2),
        radius=8,
        fill=(24, 39, 47, 255),
        outline=(58, 85, 96, 255),
        width=2,
    )
    draw.text((12, 9), f"{asset['name']}  ·  {asset['id']}", font=font(15, True), fill=(244, 248, 250))
    draw.text(
        (12, 30),
        f"{asset['size'][0]}×{asset['size'][1]}  ·  {asset['access_kind']}  ·  d{direction}",
        font=font(11),
        fill=(157, 202, 214),
    )

    origin = (PANEL_W // 2, 51)
    grid_size = 7
    for i in range(grid_size):
        for j in range(grid_size):
            fill = (63, 88, 84, 255) if (i + j) % 2 == 0 else (57, 81, 78, 255)
            draw.polygon(tile_polygon(i, j, origin), fill=fill, outline=(92, 119, 111, 210))

    placement_i, placement_j = 2, 2
    w, d = direction_size(asset["size"], direction)
    occupied = {
        (placement_i + di, placement_j + dj) for di in range(w) for dj in range(d)
    }
    for i, j in occupied:
        draw.polygon(
            tile_polygon(i, j, origin),
            fill=(30, 172, 190, 120),
            outline=(96, 239, 244, 255),
        )

    sprite = asset["directions"][direction]["recommended_image"]
    anchor = footprint_anchor(placement_i, placement_j, w, d, origin)
    panel.alpha_composite(sprite, (anchor[0] - sprite.width // 2, anchor[1] - sprite.height))
    draw = ImageDraw.Draw(panel, "RGBA")

    for i, j in occupied:
        polygon = tile_polygon(i, j, origin)
        draw.line(polygon + [polygon[0]], fill=(100, 240, 245, 220), width=1)

    for slot in asset["slots"]:
        di, dj = quarter_turn_offset(asset["size"], list(slot["tile"]), direction)
        cx, cy = tile_center(placement_i + di, placement_j + dj, origin)
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), fill=(255, 91, 172, 245), outline=(255, 235, 248, 255))
        draw_arrow(draw, (cx, cy), rotated_facing(str(slot["facing"]), direction), (255, 222, 94, 255))

    rec = asset["directions"][direction]["recommended"]
    current = asset["directions"][direction]["current"]
    clip_label = "CLIP" if rec["clipped"] else "NO CLIP"
    height_delta = rec["canvas"][1] - asset["current_canvas"][1]
    status_color = (255, 111, 93) if rec["clipped"] else (100, 231, 195)
    draw.rounded_rectangle((10, PANEL_H - 36, PANEL_W - 10, PANEL_H - 10), 5, fill=(9, 18, 23, 225))
    draw.text(
        (17, PANEL_H - 31),
        f"fit {asset['occupied_tiles'][0]:.2f}×{asset['occupied_tiles'][1]:.2f} tiles · {clip_label}",
        font=font(10, True),
        fill=status_color,
    )
    draw.text(
        (17, PANEL_H - 18),
        f"canvas {asset['current_canvas'][0]}×{asset['current_canvas'][1]} → {rec['canvas'][0]}×{rec['canvas'][1]} (ΔH {height_delta:+d})",
        font=font(9),
        fill=(202, 213, 218),
    )
    if current["clipped"] and not rec["clipped"]:
        draw.text((PANEL_W - 74, 10), "HEIGHT FIX", font=font(9, True), fill=(250, 187, 74))
    return panel


def compose_board(assets: list[dict[str, Any]], direction: int) -> Path:
    board_w = BOARD_PAD * 2 + PANEL_W * BOARD_COLS
    board_h = BOARD_HEADER + BOARD_PAD + PANEL_H * BOARD_ROWS + BOARD_PAD
    board = Image.new("RGB", (board_w, board_h), (12, 20, 26))
    draw = ImageDraw.Draw(board)
    draw.text(
        (BOARD_PAD, 16),
        f"PPAJI TYCOON — RUNTIME FIT TEST MAP · d{direction}",
        font=font(27, True),
        fill=(244, 248, 250),
    )
    draw.text(
        (BOARD_PAD, 51),
        "Exact 32×16 tile projection · cyan=footprint · pink=runtime slot · yellow=slot facing · accepted pack unchanged",
        font=font(14),
        fill=(143, 196, 207),
    )
    draw.text(
        (BOARD_PAD, 73),
        "Footprint-fit scale from physical mesh bounds. This is review evidence, not production adoption.",
        font=font(12),
        fill=(241, 178, 72),
    )

    for index, asset in enumerate(assets):
        row, col = divmod(index, BOARD_COLS)
        panel = panel_for_asset(asset, direction).convert("RGB")
        x = BOARD_PAD + col * PANEL_W
        y = BOARD_HEADER + BOARD_PAD + row * PANEL_H
        board.paste(panel, (x, y))

    output = OUT / f"runtime-fit-test-map-d{direction}.png"
    board.resize((board_w * BOARD_SCALE, board_h * BOARD_SCALE), Image.Resampling.NEAREST).save(
        output, optimize=True
    )
    return output


def compose_footprint_options(assets: list[dict[str, Any]]) -> tuple[Path, list[dict[str, Any]]]:
    by_id = {asset["id"]: asset for asset in assets}
    option_specs = [
        ("icecream", [1, 1], "1×1 CONTRACT OPTION"),
        ("cafe", [2, 2], "2×2 CONTRACT OPTION"),
    ]
    variants: list[tuple[dict[str, Any], dict[str, Any], str]] = []
    option_records: list[dict[str, Any]] = []
    tile_world = float(read_json(RENDER_CONTRACT)["projection"]["tileWorld"])

    for asset_id, option_size, option_label in option_specs:
        current = by_id[asset_id]
        rotation = read_json(Path(current["physical_rotations"]["path"]))
        mesh_size = current["mesh_bounds_size_world"]
        ground_scale = min(
            option_size[0] * tile_world / mesh_size[0],
            option_size[1] * tile_world / mesh_size[1],
        )
        source_pixels_per_world = float(rotation["camera"]["canvas_px"][0]) / float(
            rotation["camera"]["ortho_scale"]
        )
        runtime_scale = ground_scale / source_pixels_per_world
        body_h = current["current_body_h"]
        option_canvas = [(option_size[0] + option_size[1]) * STEP_X, (option_size[0] + option_size[1]) * STEP_Y + body_h]
        option_out = OUT / "footprint-options" / f"{asset_id}-{option_size[0]}x{option_size[1]}"
        option_out.mkdir(parents=True, exist_ok=True)
        directions = []
        for direction, current_direction in enumerate(current["directions"]):
            directions.append(
                normalize_direction(
                    asset_id=asset_id,
                    direction=direction,
                    source_path=Path(current_direction["source"]["path"]),
                    canvas=option_canvas,
                    body_h=body_h,
                    size=option_size,
                    runtime_scale=runtime_scale,
                    output_dir=option_out,
                )
            )
        occupied_tiles = [
            mesh_size[0] * ground_scale / tile_world,
            mesh_size[1] * ground_scale / tile_world,
        ]
        option = {
            **current,
            "name": f"{current['name']} · 후보",
            "size": option_size,
            "current_canvas": option_canvas,
            "occupied_tiles": occupied_tiles,
            "runtime_image_scale": runtime_scale,
            "directions": directions,
        }
        missing_axis_factor = max(
            current["size"][0] / current["occupied_tiles"][0],
            current["size"][1] / current["occupied_tiles"][1],
        )
        scale_only_tiles = [
            current["occupied_tiles"][0] * missing_axis_factor,
            current["occupied_tiles"][1] * missing_axis_factor,
        ]
        variants.append((current, option, option_label))
        option_records.append(
            {
                "asset_id": asset_id,
                "current_size": current["size"],
                "current_occupied_tiles": current["occupied_tiles"],
                "option_size": option_size,
                "option_occupied_tiles": [round(value, 8) for value in occupied_tiles],
                "scale_only_attempt_to_fill_current_footprint": {
                    "uniform_factor": round(missing_axis_factor, 8),
                    "resulting_occupied_tiles": [round(value, 8) for value in scale_only_tiles],
                    "verdict": "INVALID_OVERSHOOTS_OTHER_AXIS",
                },
                "decision": FOOTPRINT_DECISION_STATE,
                "user_approved_on": FOOTPRINT_APPROVED_ON,
                "live_adoption_pending": True,
                "production_data_modified": False,
            }
        )

    board_w = BOARD_PAD * 2 + PANEL_W * 4
    board_h = 132 + PANEL_H * 4 + BOARD_PAD
    board = Image.new("RGB", (board_w, board_h), (12, 20, 26))
    draw = ImageDraw.Draw(board)
    draw.text((BOARD_PAD, 15), "FOOTPRINT OPTIONS — ICECREAM / CAFE", font=font(27, True), fill=(244, 248, 250))
    draw.text(
        (BOARD_PAD, 50),
        "Current contract vs user-approved footprint. Same physical mesh and uniform scale rule; live adoption pending.",
        font=font(14),
        fill=(143, 196, 207),
    )
    draw.text(
        (BOARD_PAD, 74),
        "Scale-only fill is invalid: icecream would become 5.74×2.00 tiles; cafe would become 4.53×3.00 tiles.",
        font=font(13, True),
        fill=(255, 121, 105),
    )
    draw.text(
        (BOARD_PAD, 99),
        "Rows: icecream current 1×2 / option 1×1 / cafe current 2×3 / option 2×2. Columns: d0–d3.",
        font=font(12),
        fill=(241, 178, 72),
    )

    row_assets = [variants[0][0], variants[0][1], variants[1][0], variants[1][1]]
    for row, asset in enumerate(row_assets):
        for direction in range(4):
            panel = panel_for_asset(asset, direction).convert("RGB")
            board.paste(panel, (BOARD_PAD + direction * PANEL_W, 132 + row * PANEL_H))

    output = OUT / "focused-footprint-options-icecream-cafe.png"
    board.resize((board_w * BOARD_SCALE, board_h * BOARD_SCALE), Image.Resampling.NEAREST).save(
        output, optimize=True
    )
    return output, option_records


def compose_source_quality_reference(assets: list[dict[str, Any]]) -> Path:
    """Compose an unscaled 1024px-source board; never use it as runtime-size proof."""
    by_id = {asset["id"]: asset for asset in assets}
    source_size = 1024
    header_h = 112
    board = Image.new("RGBA", (source_size * 4, header_h + source_size * 2), (12, 20, 26, 255))
    draw = ImageDraw.Draw(board)
    draw.text(
        (28, 18),
        "SOURCE-QUALITY REFERENCE — ICECREAM / CAFE · d0–d3",
        font=font(34, True),
        fill=(244, 248, 250, 255),
    )
    draw.text(
        (28, 64),
        "Each panel embeds the locked 1024×1024 color-transfer source at 1:1. Quality review only; not runtime scale.",
        font=font(18),
        fill=(143, 196, 207, 255),
    )

    for row, asset_id in enumerate(("icecream", "cafe")):
        asset = by_id[asset_id]
        for direction in range(4):
            source_path = Path(asset["directions"][direction]["source"]["path"])
            source = Image.open(source_path).convert("RGBA")
            if source.size != (source_size, source_size):
                raise ValueError(f"expected 1024x1024 quality source: {source_path}")
            x = direction * source_size
            y = header_h + row * source_size
            board.alpha_composite(source, (x, y))
            draw.rectangle((x, y, x + source_size - 1, y + source_size - 1), outline=(54, 97, 108, 255), width=3)
            draw.rounded_rectangle((x + 18, y + 18, x + 278, y + 68), 8, fill=(9, 18, 23, 220))
            draw.text(
                (x + 34, y + 29),
                f"{asset['name']} · {asset_id} · d{direction}",
                font=font(20, True),
                fill=(244, 248, 250, 255),
            )

    output = OUT / "source-quality-4dir-icecream-cafe.png"
    board.convert("RGB").save(output, optimize=True)
    return output


def write_footprint_decision_ledger(
    focus_path: Path,
    quality_path: Path,
    option_records: list[dict[str, Any]],
) -> Path:
    output = OUT / "FOOTPRINT-DECISIONS.json"
    payload = {
        "schema_version": 1,
        "recorded_at": utc_now(),
        "decision_state": FOOTPRINT_DECISION_STATE,
        "user_approved_on": FOOTPRINT_APPROVED_ON,
        "scope": "footprint contract only; sprite production approval and live adoption remain separate gates",
        "live_files_modified": False,
        "decisions": option_records,
        "adoption_contracts": FOOTPRINT_DECISIONS,
        "evidence": {
            "runtime_fit_board": {"path": str(focus_path), "sha256": sha256_file(focus_path)},
            "source_quality_board": {"path": str(quality_path), "sha256": sha256_file(quality_path)},
        },
        "atomic_adoption_checklist": [
            "update src/data/kairo-facilities.json size and facings together with accepted d0-d3 sprites",
            "update src/assets/kairo-render-contract.json canvas and anchorTexel in the same adoption change",
            "preserve and revalidate every service/seating slot after footprint rotation",
            "replace the complete d0-d3 sprite family and remove the obsolete base sprite per the four-facing contract",
            "bake the atlas, then run gate, verify, browser harness, and build",
            "never stretch a direction to fill the old footprint and never partially adopt live data",
        ],
    }
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return output


def html_gallery(
    board_paths: list[Path],
    focus_path: Path,
    quality_path: Path,
    assets: list[dict[str, Any]],
) -> Path:
    rows = []
    for asset in assets:
        height_values = [
            row["recommended"]["canvas"][1] - asset["current_canvas"][1]
            for row in asset["directions"]
        ]
        clipped = any(row["recommended"]["clipped"] for row in asset["directions"])
        rows.append(
            "<tr>"
            f"<td><code>{html.escape(asset['id'])}</code></td>"
            f"<td>{html.escape(asset['name'])}</td>"
            f"<td>{asset['size'][0]}×{asset['size'][1]}</td>"
            f"<td>{asset['occupied_tiles'][0]:.3f}×{asset['occupied_tiles'][1]:.3f}</td>"
            f"<td>{max(height_values):+d}px</td>"
            f"<td class={'bad' if clipped else 'good'}>{'CLIP' if clipped else 'PASS'}</td>"
            "</tr>"
        )
    cards = "\n".join(
        f'<section><h2>d{index}</h2><a href="{html.escape(path.name)}"><img src="{html.escape(path.name)}" alt="d{index} runtime map"></a></section>'
        for index, path in enumerate(board_paths)
    )
    doc = f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>빠지 타이쿤 시설 런타임 배치 검토</title>
<style>
:root{{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;background:#0c141a;color:#edf5f7}}
body{{margin:0;padding:24px;max-width:1500px;margin-inline:auto}} h1{{margin:0 0 8px}} p{{color:#9cc4ce}}
.notice{{border:1px solid #37616c;background:#12232b;padding:14px 16px;border-radius:10px;margin:18px 0}}
.maps{{display:grid;grid-template-columns:1fr 1fr;gap:18px}} section{{background:#111e25;border:1px solid #29434c;border-radius:12px;padding:12px}} section h2{{margin:0 0 8px}}
img{{display:block;width:100%;height:auto;image-rendering:pixelated;border-radius:8px}} table{{width:100%;border-collapse:collapse;margin-top:24px;background:#111e25}} th,td{{padding:8px 10px;border-bottom:1px solid #29434c;text-align:left}} .good{{color:#66e7c2}} .bad{{color:#ff7969}}
.quality img{{image-rendering:auto}}
@media(max-width:900px){{.maps{{grid-template-columns:1fr}}}}
</style></head><body>
<h1>빠지 타이쿤 시설 20종 — 런타임 배치 검토</h1>
<p>실제 게임의 32×16 아이소메트릭 타일, 발자국 회전, bottom-center 앵커와 슬롯 회전을 사용한 Wave 4 검토 화면입니다.</p>
<div class="notice"><strong>{STATE}</strong> · accepted pack/atlas/시설 JSON 미수정 · 이미지 클릭 시 원본 크기로 열립니다.</div>
<section class="focus"><h2>아이스크림·카페 발자국 옵션</h2><a href="{html.escape(focus_path.name)}"><img src="{html.escape(focus_path.name)}" alt="아이스크림 카페 발자국 옵션"></a></section>
<section class="quality"><h2>아이스크림·카페 1024px 원본 품질</h2><p>런타임 배치표와 달리 원본을 축소하지 않은 품질 검수 전용 자료입니다.</p><a href="{html.escape(quality_path.name)}"><img src="{html.escape(quality_path.name)}" alt="아이스크림 카페 원본 품질"></a></section>
<main class="maps">{cards}</main>
<table><thead><tr><th>ID</th><th>시설</th><th>계약</th><th>메시 점유</th><th>최대 높이 증가</th><th>권장 캔버스</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</body></html>
"""
    output = OUT / "index.html"
    output.write_text(doc, encoding="utf-8")
    return output


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    runtime_root = OUT / "runtime-sprites"
    runtime_root.mkdir(parents=True, exist_ok=True)

    facility_root = read_json(FACILITY_DATA)["facilities"]
    render_rows = read_json(RENDER_CONTRACT)["facilities"]
    render_by_id = {str(row["sprite"]).split("/")[-1]: row for row in render_rows}
    access_rows = read_json(ACCESS_MANIFEST)["items"]
    access_by_id = {row["id"]: row for row in access_rows}
    tile_world = float(read_json(RENDER_CONTRACT)["projection"]["tileWorld"])

    assets: list[dict[str, Any]] = []
    for asset_id in ASSET_IDS:
        facility = facility_root[asset_id]
        render = render_by_id[asset_id]
        access = access_by_id[asset_id]
        package, rotations_path, union_path, source_paths = source_package(asset_id)
        rotation = read_json(rotations_path)
        union = read_json(union_path)
        mesh_size = bounds_size(rotation)
        size = list(facility["size"])
        ground_scale = min(size[0] * tile_world / mesh_size[0], size[1] * tile_world / mesh_size[1])
        occupied_tiles = [
            mesh_size[0] * ground_scale / tile_world,
            mesh_size[1] * ground_scale / tile_world,
        ]
        source_canvas = rotation["camera"]["canvas_px"]
        source_pixels_per_world = float(source_canvas[0]) / float(rotation["camera"]["ortho_scale"])
        runtime_scale = ground_scale / source_pixels_per_world

        asset_out = runtime_root / asset_id
        asset_out.mkdir(parents=True, exist_ok=True)
        direction_records = []
        for direction in range(4):
            direction_records.append(
                normalize_direction(
                    asset_id=asset_id,
                    direction=direction,
                    source_path=source_paths[f"d{direction}"],
                    canvas=list(render["canvas"]),
                    body_h=int(render["bodyH"]),
                    size=size,
                    runtime_scale=runtime_scale,
                    output_dir=asset_out,
                )
            )

        record = {
            "id": asset_id,
            "name": access["name"],
            "size": size,
            "access_kind": access["access_kind"],
            "slots": facility["slots"],
            "current_canvas": list(render["canvas"]),
            "current_anchor": list(render["anchorTexel"]),
            "current_body_h": int(render["bodyH"]),
            "physical_package": str(package),
            "physical_rotations": {"path": str(rotations_path), "sha256": sha256_file(rotations_path)},
            "union_canvas": {"path": str(union_path), "sha256": sha256_file(union_path)},
            "mesh_bounds_size_world": [round(value, 8) for value in mesh_size],
            "uniform_ground_fit_scale": round(ground_scale, 10),
            "occupied_tiles": [round(value, 8) for value in occupied_tiles],
            "runtime_image_scale": round(runtime_scale, 10),
            "directions": direction_records,
        }
        metrics_path = asset_out / "runtime-footprint-metrics.json"
        serializable = {
            **record,
            "directions": [
                {key: value for key, value in direction.items() if key != "recommended_image"}
                for direction in direction_records
            ],
            "state": STATE,
            "live_files_modified": False,
            "production_approved": False,
        }
        metrics_path.write_text(
            json.dumps(serializable, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        record["metrics"] = {"path": str(metrics_path), "sha256": sha256_file(metrics_path)}
        assets.append(record)

    board_paths = [compose_board(assets, direction) for direction in range(4)]
    focus_path, footprint_options = compose_footprint_options(assets)
    quality_path = compose_source_quality_reference(assets)
    decision_path = write_footprint_decision_ledger(focus_path, quality_path, footprint_options)
    gallery_path = html_gallery(board_paths, focus_path, quality_path, assets)

    manifest_assets = []
    for asset in assets:
        manifest_assets.append(
            {
                key: value
                for key, value in asset.items()
                if key not in {"directions", "slots"}
            }
            | {
                "slot_count": len(asset["slots"]),
                "direction_results": [
                    {
                        "direction": row["direction"],
                        "current_canvas": row["current"]["canvas"],
                        "current_clipped": row["current"]["clipped"],
                        "recommended_canvas": row["recommended"]["canvas"],
                        "recommended_clipped": row["recommended"]["clipped"],
                        "recommended_path": row["recommended"]["path"],
                        "recommended_sha256": row["recommended"]["sha256"],
                    }
                    for row in asset["directions"]
                ],
            }
        )

    manifest = {
        "schema_version": 1,
        "recorded_at": utc_now(),
        "state": STATE,
        "asset_count": len(assets),
        "direction_count": len(assets) * 4,
        "method": "physical mesh ground bounds -> uniform canonical footprint fit -> exact Kairo 32x16 grid and bottom-contact alignment",
        "accepted_pack_modified": False,
        "atlas_modified": False,
        "simulation_data_modified": False,
        "render_contract_modified": False,
        "production_approved": False,
        "runtime_adoption_started": False,
        "boards": [
            {"direction": f"d{index}", "path": str(path), "sha256": sha256_file(path)}
            for index, path in enumerate(board_paths)
        ],
        "focused_footprint_options": {
            "path": str(focus_path),
            "sha256": sha256_file(focus_path),
            "options": footprint_options,
        },
        "source_quality_reference": {
            "path": str(quality_path),
            "sha256": sha256_file(quality_path),
            "source_canvas": [1024, 1024],
            "runtime_scale_evidence": False,
        },
        "footprint_decision_ledger": {
            "path": str(decision_path),
            "sha256": sha256_file(decision_path),
            "decision_state": FOOTPRINT_DECISION_STATE,
        },
        "gallery": {"path": str(gallery_path), "sha256": sha256_file(gallery_path)},
        "assets": manifest_assets,
    }
    manifest_path = OUT / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "state": STATE,
                "assets": len(assets),
                "directions": len(assets) * 4,
                "boards": [str(path) for path in board_paths],
                "gallery": str(gallery_path),
                "manifest": str(manifest_path),
                "recommended_clip_count": sum(
                    int(row["recommended"]["clipped"])
                    for asset in assets
                    for row in asset["directions"]
                ),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
