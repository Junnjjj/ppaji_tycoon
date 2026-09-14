#!/usr/bin/env python3
"""Cut a keyed asset sheet into the flat PNG files named by the facility prompt contract.

The image generator draws each logical texel at a large scale.  This tool removes the
label band, trims each generated subject, downsamples it into the contract canvas, snaps
its colours back to the sheet palette, and anchors it at bottom-centre.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOC = ROOT / "docs" / "assets" / "maintenance" / "legacy-sheet-prompts.md"
DEFAULT_OUT = ROOT / "assets" / "generated" / "kairo"
SIM_FACILITIES = ROOT / "src" / "data" / "kairo-facilities.json"
RENDER_CONTRACT = ROOT / "src" / "assets" / "kairo-render-contract.json"

GLOBAL_PALETTE = (
    "8fbc63 7faa55 9fc973 e8cf9a dcc088 f0dcae "
    "7fd0e6 5fc6de 2b9ac4 1a7ba8 dcb079 c49a6a b5844a 70522e "
    "fdf3e0 e4d3b4 a0947e e0604f 62a58c 4a90b8 f2b53f 8b3c31 "
    "3d6657 2e5972 967027 ffd23f ef4b4b 3d8fd6 4fbf72 ff8c42 "
    "3a3f4a 4a3826 1e3348 ffd9b8 f0b48c c98963 4a76c8 37599e 26406f"
).split()


@dataclass(frozen=True)
class Asset:
    sprite_id: str
    filename: str
    width: int
    height: int


@dataclass(frozen=True)
class Footprint:
    """The contract geometry a facility sprite has to sit on.

    ``w`` x ``d`` tiles, drawn on a ``(w+d)*16`` x ``(w+d)*8 + body_h`` canvas whose
    bottom ``(w+d)*8`` rows are exactly the ground diamond (see ``tools/ground-geometry.ts``).
    """

    w: int
    d: int
    body_h: int


def facility_footprints() -> dict[str, Footprint]:
    """Read `w x d` (sim) and `bodyH` (render) for every facility sprite.

    Both files are the existing contract; nothing new is declared here.  The gate
    (`tools/kairo-gate.ts`) measures against the very same two numbers, so the extractor
    and the gate cannot drift apart.
    """
    sizes = {
        f["sprite"]: (int(f["size"][0]), int(f["size"][1]))
        for f in json.loads(SIM_FACILITIES.read_text(encoding="utf-8"))["facilities"].values()
    }
    out: dict[str, Footprint] = {}
    for spec in json.loads(RENDER_CONTRACT.read_text(encoding="utf-8"))["facilities"]:
        size = sizes.get(spec["sprite"])
        if size is None:
            continue
        out[spec["sprite"]] = Footprint(size[0], size[1], int(spec["bodyH"]))
    return out


def section_for(doc: str, sheet: str) -> str:
    match = re.search(
        rf"^## Sheet {re.escape(sheet)}\b.*?(?=^## Sheet |\Z)",
        doc,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not match:
        raise ValueError(f"Sheet {sheet!r} not found in document")
    return match.group(0)


def table_rows(section: str) -> list[tuple[str, str]]:
    rows = re.findall(
        r"^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*`([^`]+\.png)`\s*\|",
        section,
        flags=re.MULTILINE,
    )
    if not rows:
        raise ValueError("No asset table rows found")
    return rows


def target_sizes(sheet: str, section: str, count: int) -> list[tuple[int, int]]:
    if re.fullmatch(r"W(?:[1-9]|10|11)", sheet):
        return [(32, 16)] * count
    fixed = {
        "W12": (32, 28),
        "W13": (32, 26),
        "W14": (512, 200),
        "W15": (512, 200),
        "W17": (24, 24),
    }
    if sheet in fixed:
        return [fixed[sheet]] * count

    sizes = [
        (int(w), int(h))
        for w, h in re.findall(
            r"whole\s+sprite\s+(\d+)\s*x\s*(\d+)\s*px", section, flags=re.IGNORECASE
        )
    ]
    if len(sizes) != count:
        raise ValueError(
            f"{sheet}: found {len(sizes)} whole-sprite sizes for {count} assets"
        )
    return sizes


def assets_for(doc: str, sheet: str) -> tuple[str, list[Asset]]:
    section = section_for(doc, sheet)
    rows = table_rows(section)
    sizes = target_sizes(sheet, section, len(rows))
    assets = [
        Asset(sprite_id, filename, size[0], size[1])
        for (sprite_id, filename), size in zip(rows, sizes)
    ]
    return section, assets


def cells_for(sheet: str, width: int, height: int, count: int) -> list[tuple[int, int, int, int]]:
    def grid(cols: int, rows: int) -> list[tuple[int, int, int, int]]:
        cells = []
        overlap = min(32, round(width / cols * 0.08))
        for index in range(count):
            col, row = index % cols, index // cols
            x0 = max(0, round(col * width / cols) - overlap)
            x1 = min(width, round((col + 1) * width / cols) + overlap)
            y0, y1 = round(row * height / rows), round((row + 1) * height / rows)
            # Generators sometimes let a top-row silhouette cross the mathematical
            # halfway line by a few pixels. Give that row an overlapping read window;
            # subject-band detection still rejects the following row's label.
            if rows == 2 and row == 0:
                y1 = min(height, round(height * 0.56))
            cells.append((x0, y0, x1, y1))
        return cells

    regular = {
        "S1": (4, 2), "S2": (3, 2), "S4": (3, 2), "S5": (3, 2), "S6": (3, 2),
        "L1": (2, 2), "L2": (2, 2), "L3": (3, 2), "L4": (3, 2),
        "L5": (2, 2), "L6": (2, 2), "L7": (1, 1), "L8": (2, 1),
        "L9": (2, 1), "L10": (2, 1), "L11": (1, 1), "W13": (4, 2),
        "W14": (1, 2), "W15": (1, 1), "W16": (4, 2), "W17": (5, 3),
    }
    if sheet in regular:
        return grid(*regular[sheet])
    if sheet == "S3":
        cells = []
        overlap = 32
        for col in range(4):
            cells.append((max(0, round(col * width / 4) - overlap), 0,
                          min(width, round((col + 1) * width / 4) + overlap), round(height * 0.56)))
        for col in range(3):
            cells.append((max(0, round(col * width / 3) - overlap), height // 2,
                          min(width, round((col + 1) * width / 3) + overlap), height))
        return cells
    if re.fullmatch(r"W(?:[1-9]|10|11)", sheet):
        band_height = round(height * 0.40)
        return [
            (round(i * width / 3), 0, round((i + 1) * width / 3), band_height)
            for i in range(3)
        ]
    if sheet == "W12":
        return [(0, 0, width // 2, height // 2), (width // 2, 0, width, height // 2)]
    raise ValueError(f"No cell layout declared for {sheet}")


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.removeprefix("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def palette_for(sheet: str, section: str) -> list[tuple[int, int, int]]:
    if re.fullmatch(r"W(?:[1-9]|10|11)", sheet):
        exact = re.search(r"EXACT TONES for this sheet.*?(?=\n\n)", section, re.DOTALL)
        if not exact:
            raise ValueError(f"{sheet}: exact terrain tones not found")
        values = re.findall(r"#[0-9a-fA-F]{6}", exact.group(0))
    elif sheet == "W12":
        exact = re.search(r"EXACT TONES for this sheet:.*?(?=\n\n)", section, re.DOTALL)
        if not exact:
            raise ValueError("W12: exact bridge tones not found")
        values = re.findall(r"#[0-9a-fA-F]{6}", exact.group(0))
    elif sheet == "W13":
        values = ["#8d979b", "#e2eef3", "#c9dae2", "#c3ced3", "#4a3826"]
    elif sheet == "W14":
        values = [
            "#93aec2", "#aac3d3", "#7f9ab1",
            "#5b7f96", "#7496aa", "#48697e", "#4a3826",
        ]
    elif sheet == "W15":
        values = ["#3f6b57", "#548a6c", "#2f5442", "#4a3826"]
    else:
        values = [f"#{value}" for value in GLOBAL_PALETTE]
        if sheet == "W17":
            values.append("#8c5e2b")
    return [hex_rgb(value) for value in dict.fromkeys(value.lower() for value in values)]


def nearest_colour(pixel: tuple[int, int, int], palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    r, g, b = pixel
    # Weighted RGB distance is a useful low-cost approximation for this small fixed palette.
    return min(
        palette,
        key=lambda p: 3 * (r - p[0]) ** 2 + 4 * (g - p[1]) ** 2 + 2 * (b - p[2]) ** 2,
    )


def subject_bbox(cell: Image.Image, label_fraction: float) -> tuple[int, int, int, int]:
    alpha = cell.getchannel("A")
    cut = round(cell.height * label_fraction)
    alpha_pixels = alpha.load()

    # A following row's label can sit just above this cell's nominal bottom boundary.
    # Split the foreground into horizontal bands and select the band with the greatest
    # foreground area: a subject is orders of magnitude larger than a text label. Small
    # internal gaps are merged so rails, legs, rain strokes, and similar separated parts
    # remain in the subject band.
    row_counts = [
        sum(1 for x in range(cell.width) if alpha_pixels[x, y] >= 48)
        for y in range(cut, cell.height)
    ]
    merge_gap = max(3, round(cell.height * 0.025))
    runs: list[tuple[int, int, int]] = []
    start: int | None = None
    last_nonzero: int | None = None
    score = 0
    for local_y, count in enumerate(row_counts):
        y = local_y + cut
        if count:
            if start is None:
                start = y
            elif last_nonzero is not None and y - last_nonzero - 1 > merge_gap:
                runs.append((start, last_nonzero + 1, score))
                start = y
                score = 0
            last_nonzero = y
            score += count
    if start is not None and last_nonzero is not None:
        runs.append((start, last_nonzero + 1, score))
    if not runs:
        raise ValueError("No subject band found below label")
    band_start, band_end, _ = max(runs, key=lambda run: run[2])

    foreground = {
        (x, y)
        for y in range(band_start, band_end)
        for x in range(cell.width)
        if alpha_pixels[x, y] >= 48
    }
    if not foreground:
        raise ValueError("No subject pixels found below label band")

    components: list[tuple[int, tuple[int, int, int, int]]] = []
    unseen = set(foreground)
    neighbours = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
    while unseen:
        seed = unseen.pop()
        queue = deque([seed])
        min_x = max_x = seed[0]
        min_y = max_y = seed[1]
        area = 0
        while queue:
            x, y = queue.popleft()
            area += 1
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for dx, dy in neighbours:
                point = (x + dx, y + dy)
                if point in unseen:
                    unseen.remove(point)
                    queue.append(point)
        components.append((area, (min_x, min_y, max_x + 1, max_y + 1)))

    components.sort(reverse=True)
    main_area, main = components[0]
    mx0, my0, mx1, my1 = main
    pad_x = max(10, round((mx1 - mx0) * 0.10))
    pad_y = max(10, round((my1 - my0) * 0.10))
    selected = [main]
    for area, box in components[1:]:
        if area < max(8, round(main_area * 0.01)):
            continue
        x0, y0, x1, y1 = box
        if x1 >= mx0 - pad_x and x0 <= mx1 + pad_x and y1 >= my0 - pad_y and y0 <= my1 + pad_y:
            selected.append(box)

    return (
        min(box[0] for box in selected),
        min(box[1] for box in selected),
        max(box[2] for box in selected),
        max(box[3] for box in selected),
    )


def ground_vertex_shift(
    image: Image.Image, footprint: Footprint
) -> tuple[int, dict[str, object]]:
    """How many whole pixels sideways the drawing has to move to sit on its own tile.

    ## Position, not geometry

    This is a **lossless integer translation** — every pixel keeps its colour and its
    neighbours, the drawing is never sheared, scaled or resampled.  It corrects *where the
    picture was put down*, which is this tool's own doing (the old code centred the subject
    bounding box), not *how the picture was drawn*, which is the generator's.  Drawings whose
    angle is actually wrong are fixed by re-prompting with a guide and re-running the gate,
    which is a deliberate project decision — so do **not** grow this into a shear/scale
    "geometry correction".  Warping the raster would make the gate green while the sprite
    stops matching the guide it was generated from, and the gate would no longer be measuring
    the drawing at all.

    ## Why bbox-centring is wrong

    The contract puts the footprint's **bottom vertex** at `w/(w+d)` of the canvas width
    (`tools/ground-geometry.ts`), because the canvas is the bounding box of the `w x d`
    diamond.  That equals the middle only when `w == d`.  A 4x1 wants 0.800 and a 2x3 wants
    0.400, so centring a non-square footprint files the drawing onto the wrong tile — up to a
    quarter tile off.  `render_ground_asset` never had this bug because it imposes
    `diamond_mask()`; facilities had no such step, and that is where most of the reported
    "wrong angle" came from.

    ## Never crop

    Many subjects are scaled until they touch both canvas edges, so the full correction does
    not always fit.  The shift is clamped to the empty margin actually available: moving as
    far as the canvas allows stays lossless and strictly reduces the vertex error, while
    cropping would trade one defect for another.  `dx_wanted != dx_applied` in the report
    marks every sprite the canvas held back (`dx_applied == 0` means it could not move at
    all), which is a regeneration list, not a silent pass.

    Returns `(dx, details)`; `dx` is 0 when there is no measurable ground contour, when the
    drawing is already right, or when there is no margin to move into.
    """
    width, height = image.size
    band_top = footprint.body_h
    pixels = image.load()

    # Same estimator as the gate: per-column lowest opaque row inside the ground band.
    contour: list[int | None] = []
    for x in range(width):
        bottom: int | None = None
        for y in range(height - 1, band_top - 1, -1):
            if pixels[x, y][3] >= 128:
                bottom = y
                break
        contour.append(bottom)

    lowest = max((y for y in contour if y is not None), default=None)
    if lowest is None:
        return 0, {"reason": "no ground contour"}
    bottom_xs = [x for x, y in enumerate(contour) if y == lowest]
    mean_x = sum(bottom_xs) / len(bottom_xs)

    # Contract target.  bottomFrac is measured at pixel centres, so
    #   (mean_x + 0.5) / width == w / (w + d)   =>   mean_x == 16w - 0.5
    want_x = footprint.w * 16 - 0.5
    wanted = round(want_x - mean_x)

    columns = [x for x in range(width) if any(pixels[x, y][3] >= 128 for y in range(height))]
    left, right = (columns[0], columns[-1]) if columns else (0, width - 1)
    room_left, room_right = -left, width - 1 - right
    applied = max(room_left, min(room_right, wanted))
    return applied, {
        "footprint": [footprint.w, footprint.d],
        "body_h": footprint.body_h,
        "bottom_frac": round((mean_x + 0.5) / width, 4),
        "want_frac": round(footprint.w / (footprint.w + footprint.d), 4),
        "dx_wanted": wanted,
        "dx_applied": applied,
        "room": [room_left, room_right],
        "limited_by_canvas": applied != wanted,
    }


def render_asset(
    cell: Image.Image,
    asset: Asset,
    palette: list[tuple[int, int, int]],
    label_fraction: float,
    footprint: Footprint | None = None,
) -> tuple[Image.Image, dict[str, object]]:
    bbox = subject_bbox(cell, label_fraction)
    subject = cell.crop(bbox)

    scale = min(asset.width / subject.width, asset.height / subject.height)
    resized_width = max(1, min(asset.width, round(subject.width * scale)))
    resized_height = max(1, min(asset.height, round(subject.height * scale)))
    subject = subject.resize((resized_width, resized_height), Image.Resampling.BOX)

    snapped = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    source_pixels = subject.load()
    target_pixels = snapped.load()
    opaque = 0
    for y in range(subject.height):
        for x in range(subject.width):
            r, g, b, a = source_pixels[x, y]
            if a < 96:
                continue
            nr, ng, nb = nearest_colour((r, g, b), palette)
            target_pixels[x, y] = (nr, ng, nb, 255)
            opaque += 1

    canvas = Image.new("RGBA", (asset.width, asset.height), (0, 0, 0, 0))
    x = (asset.width - resized_width) // 2
    # Vertical anchoring stays bottom-flush: the contract anchor is the lowest row.
    y = asset.height - resized_height
    canvas.alpha_composite(snapped, (x, y))
    details: dict[str, object] = {
        "source_bbox": bbox,
        "resized": [resized_width, resized_height],
        "target": [asset.width, asset.height],
        "opaque_pixels": opaque,
    }
    if footprint is not None:
        # Horizontal placement is decided by the ground vertex, not by the bounding box.
        dx, align = ground_vertex_shift(canvas, footprint)
        if dx:
            canvas = Image.new("RGBA", (asset.width, asset.height), (0, 0, 0, 0))
            canvas.alpha_composite(snapped, (x + dx, y))
        details["ground_align"] = align
    return canvas, details


def diamond_mask(width: int = 32, height: int = 16) -> set[tuple[int, int]]:
    """Return the logical 2:1 ground diamond using pixel-centre coverage."""
    points: set[tuple[int, int]] = set()
    cx, cy = width / 2, height / 2
    for y in range(height):
        for x in range(width):
            if abs((x + 0.5) - cx) / cx + abs((y + 0.5) - cy) / cy <= 1:
                points.add((x, y))
    return points


def render_ground_asset(
    cell: Image.Image,
    asset: Asset,
    palette: list[tuple[int, int, int]],
    label_fraction: float,
    variant_index: int,
    paved: bool,
    directional_foam: bool,
) -> tuple[Image.Image, dict[str, object]]:
    """Convert a generated terrain concept into an exact, flat 32x16 game tile.

    Image models commonly add a bevel or slab thickness even when forbidden.  The
    generated face remains the texture authority, while this renderer supplies the
    exact logical diamond, removes the bevel, and equalises tone counts across variants.
    """
    bbox = subject_bbox(cell, label_fraction)
    subject = cell.crop(bbox)
    # A generated 2:1 top face is the upper 80-ish percent of a beveled subject.
    # Crop an exact 2:1 face from the top, centred horizontally.
    face_height = min(subject.height, max(1, subject.width // 2))
    face_width = min(subject.width, face_height * 2)
    left = max(0, (subject.width - face_width) // 2)
    face = subject.crop((left, 0, left + face_width, face_height)).resize(
        (asset.width, asset.height), Image.Resampling.BOX
    ).convert("RGB")

    mask = diamond_mask(asset.width, asset.height)
    lower_edge: set[tuple[int, int]] = set()
    if paved:
        for y in range(asset.height // 2, asset.height):
            xs = sorted(x for x, yy in mask if yy == y)
            if xs:
                # A logical texel is 2 screen pixels wide in the 2:1 projection.
                lower_edge.update({(xs[0], y), (xs[min(1, len(xs) - 1)], y)})
                lower_edge.update({(xs[-1], y), (xs[max(0, len(xs) - 2)], y)})

    available = sorted(mask - lower_edge)
    target_each = round(len(mask) * 0.20)
    # Rank the model's generated mineral pattern; fixed counts guarantee all three
    # variants have the same exact mean while retaining different arrangements.
    def texture_score(point: tuple[int, int]) -> int:
        x, y = point
        # A stable coordinate hash breaks the many equal-tone ties left by 32x16
        # downsampling.  Each variant gets a different irregular arrangement.
        mixed = (x * 73856093) ^ (y * 19349663) ^ ((variant_index + 1) * 83492791)
        jitter = (mixed & 255) - 128
        return sum(face.getpixel(point)) + jitter

    ranked = sorted(available, key=texture_score)
    if directional_foam:
        # W5 alone is a horizontal-only shoreline.  Its foam must enter and leave
        # every tile at exactly the same screen row so an arbitrary run joins.
        foam_y = asset.height // 2 - 1
        foam = {(x, y) for x, y in mask if y == foam_y}
        # Keep ranked order while reserving the foam pixels for the light tone.
        dark_points = set([point for point in ranked if point not in foam][:target_each])
        light_needed = max(0, target_each - len(foam))
        light_points = foam | set(
            [point for point in reversed(ranked) if point not in foam and point not in dark_points][
                :light_needed
            ]
        )
    else:
        dark_count = max(0, target_each - len(lower_edge))
        dark_points = set(ranked[:dark_count]) | lower_edge
        light_points = set(ranked[-target_each:])
    base, light, dark = palette[:3]
    output = Image.new("RGBA", (asset.width, asset.height), (0, 0, 0, 0))
    pixels = output.load()
    for point in mask:
        colour = light if point in light_points else dark if point in dark_points else base
        pixels[point[0], point[1]] = (*colour, 255)
    counts = {
        "base": len(mask - light_points - dark_points),
        "light": len(light_points),
        "dark": len(dark_points),
    }
    return output, {
        "source_bbox": bbox,
        "source_face": [left, 0, left + face_width, face_height],
        "target": [asset.width, asset.height],
        "tone_counts": counts,
        "paved_lower_joint": paved,
        "directional_foam": directional_foam,
        "opaque_pixels": len(mask),
    }


def render_wall_asset(
    cell: Image.Image,
    asset: Asset,
    palette: list[tuple[int, int, int]],
    label_fraction: float,
    index: int,
) -> tuple[Image.Image, dict[str, object]]:
    """Place a generated wall on the exact half-diamond edge named by W13.

    The generator supplies material and detail.  The contract, not model composition,
    supplies the four deterministic edge positions inside the 32x26 logical canvas.
    """
    bbox = subject_bbox(cell, label_fraction)
    subject = cell.crop(bbox)
    scale = min(16 / subject.width, 18 / subject.height)
    resized_width = max(1, min(16, round(subject.width * scale)))
    resized_height = max(1, min(18, round(subject.height * scale)))
    subject = subject.resize((resized_width, resized_height), Image.Resampling.BOX)

    edge = index % 4
    # Generated walls lean down-right. I+ and I- are the opposing diagonal.
    if edge in {0, 2}:
        subject = subject.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    right_facing = edge in {0, 3}
    pane = hex_rgb("e2eef3" if right_facing else "c9dae2")
    pane_candidates = {hex_rgb("e2eef3"), hex_rgb("c9dae2")}
    snapped = Image.new("RGBA", subject.size, (0, 0, 0, 0))
    source_pixels = subject.load()
    target_pixels = snapped.load()
    opaque = 0
    for y in range(subject.height):
        for x in range(subject.width):
            r, g, b, a = source_pixels[x, y]
            if a < 96:
                continue
            colour = nearest_colour((r, g, b), palette)
            if colour in pane_candidates:
                colour = pane
            target_pixels[x, y] = (*colour, 255)
            opaque += 1

    canvas = Image.new("RGBA", (32, 26), (0, 0, 0, 0))
    x = 16 if edge in {0, 3} else 0
    bottom = 18 if edge in {2, 3} else 26
    y = bottom - resized_height
    canvas.alpha_composite(snapped, (x, y))
    punch_wall_stipple(canvas)
    return canvas, {
        "source_bbox": bbox,
        "resized": [resized_width, resized_height],
        "target": [32, 26],
        "edge": ["I+", "J+", "I-", "J-"][edge],
        "placement": [x, y],
        "opaque_pixels_before_stipple": opaque,
    }


def punch_wall_stipple(image: Image.Image) -> None:
    pane_colours = {hex_rgb("e2eef3"), hex_rgb("c9dae2")}
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and (r, g, b) in pane_colours and (x + y) % 2:
                pixels[x, y] = (r, g, b, 0)


def enforce_horizontal_seam(
    image: Image.Image,
    palette: list[tuple[int, int, int]],
    blend_width: int = 24,
) -> None:
    """Ease the right edge into an exact copy of the left edge for parallax bands."""
    pixels = image.load()
    width, height = image.size
    blend_width = min(blend_width, width // 4)
    left = [pixels[0, y] for y in range(height)]
    for offset in range(blend_width):
        x = width - blend_width + offset
        t = (offset + 1) / blend_width
        for y in range(height):
            r0, g0, b0, a0 = pixels[x, y]
            r1, g1, b1, a1 = left[y]
            alpha = round(a0 * (1 - t) + a1 * t)
            if alpha < 128:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            colour = nearest_colour(
                (
                    round(r0 * (1 - t) + r1 * t),
                    round(g0 * (1 - t) + g1 * t),
                    round(b0 * (1 - t) + b1 * t),
                ),
                palette,
            )
            pixels[x, y] = (*colour, 255)
    # The acceptance invariant is exact, not approximate.
    for y, pixel in enumerate(left):
        pixels[width - 1, y] = pixel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sheet", required=True)
    parser.add_argument("--input", type=Path, required=True, help="RGBA sheet after chroma-key removal")
    parser.add_argument("--doc", type=Path, default=DEFAULT_DOC)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    doc = args.doc.read_text(encoding="utf-8")
    section, assets = assets_for(doc, args.sheet)
    palette = palette_for(args.sheet, section)
    sheet_image = Image.open(args.input).convert("RGBA")
    cells = cells_for(args.sheet, sheet_image.width, sheet_image.height, len(assets))
    if len(cells) != len(assets):
        raise ValueError(f"{args.sheet}: {len(cells)} cells for {len(assets)} assets")

    footprints = facility_footprints()
    args.out.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "sheet": args.sheet,
        "input": str(args.input),
        "input_size": [sheet_image.width, sheet_image.height],
        "palette_size": len(palette),
        "assets": [],
    }
    label_fraction = 0.18 if args.sheet.startswith("W") else 0.13
    for index, (asset, box) in enumerate(zip(assets, cells)):
        destination = args.out / asset.filename
        if destination.exists() and not args.force:
            raise FileExistsError(f"Refusing to overwrite {destination}; pass --force to replace")
        cell = sheet_image.crop(box)
        asset_palette = palette
        if args.sheet == "W14":
            asset_palette = palette[:3] if index == 0 else palette[3:]
        if args.sheet == "W13":
            output, details = render_wall_asset(
                cell, asset, asset_palette, label_fraction, index
            )
        elif re.fullmatch(r"W(?:[1-9]|10|11)", args.sheet):
            output, details = render_ground_asset(
                cell,
                asset,
                asset_palette,
                label_fraction,
                index,
                bool(re.search(r"^PAVED TYPE", section, re.MULTILINE)),
                args.sheet == "W5",
            )
        else:
            # Only facilities carry a footprint contract; deco, UI icons, bridges and
            # backdrops are not measured by the ground gate and keep bbox-centring.
            output, details = render_asset(
                cell, asset, asset_palette, label_fraction, footprints.get(asset.sprite_id)
            )
        if args.sheet in {"W14", "W15"}:
            enforce_horizontal_seam(output, asset_palette)
            details["horizontal_seam_exact"] = True
        output.save(destination)
        report["assets"].append(
            {
                "sprite_id": asset.sprite_id,
                "filename": asset.filename,
                "cell": box,
                **details,
            }
        )

    report_path = args.report or args.input.with_name(f"{args.sheet}-report.json")
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(assets)} assets to {args.out}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
