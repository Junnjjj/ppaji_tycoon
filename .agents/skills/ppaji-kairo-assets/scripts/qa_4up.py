#!/usr/bin/env python3
"""Measure occupancy consistency in a 2x2 magenta-background asset sheet.

This intentionally does not decide semantic/topology acceptance.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image


def is_magenta_background(rgb: tuple[int, int, int]) -> bool:
    red, green, blue = rgb
    return (
        # ImageGen occasionally emits a dark magenta gradient instead of exact
        # #FF00FF (observed corners as low as rgb(169, 36, 153)).  Hue
        # dominance is a safer discriminator than absolute brightness here;
        # coral/yellow/blue sprite pixels still fail at least one clause.
        red >= 150
        and blue >= 130
        and green <= 125
        and red >= green + 90
        and blue >= green + 70
    )


def measure_cell(image: Image.Image, bounds: tuple[int, int, int, int]) -> dict[str, object]:
    cell = image.crop(bounds)
    xs: list[int] = []
    ys: list[int] = []
    for y in range(cell.height):
        for x in range(cell.width):
            if not is_magenta_background(cell.getpixel((x, y))):
                xs.append(x)
                ys.append(y)

    if not xs:
        raise ValueError(f"no foreground pixels in cell {bounds}")

    bbox = [min(xs), min(ys), max(xs) + 1, max(ys) + 1]
    return {
        "bbox": bbox,
        "width": bbox[2] - bbox[0],
        "height": bbox[3] - bbox[1],
        "foreground_pixels": len(xs),
    }


def component_cells(image: Image.Image) -> dict[str, dict[str, object]]:
    """Find four sprites even when they cross the mathematical quadrant boundary."""
    width, height = image.size
    size = width * height
    foreground = bytearray(size)
    pixels = image.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            foreground[row + x] = not is_magenta_background(pixels[x, y])

    visited = bytearray(size)
    components: list[dict[str, float | int | list[int]]] = []
    neighbours = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
    for seed in range(size):
        if not foreground[seed] or visited[seed]:
            continue
        visited[seed] = 1
        queue = deque([seed])
        sx = sy = area = 0
        seed_y, seed_x = divmod(seed, width)
        min_x = max_x = seed_x
        min_y = max_y = seed_y
        while queue:
            index = queue.popleft()
            y, x = divmod(index, width)
            area += 1
            sx += x
            sy += y
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for dx, dy in neighbours:
                nx, ny = x + dx, y + dy
                if nx < 0 or nx >= width or ny < 0 or ny >= height:
                    continue
                neighbour = ny * width + nx
                if foreground[neighbour] and not visited[neighbour]:
                    visited[neighbour] = 1
                    queue.append(neighbour)
        if area >= 8:
            components.append({
                "area": area,
                "bbox": [min_x, min_y, max_x + 1, max_y + 1],
                "cx": sx / area,
                "cy": sy / area,
            })

    if len(components) < 4:
        raise ValueError(f"expected at least four foreground components, found {len(components)}")

    components.sort(key=lambda item: int(item["area"]), reverse=True)
    groups = [dict(component) for component in components[:4]]

    # Keep detached signs or props with the closest main sprite without letting one
    # large sprite leak across the row/column divider into another.
    for component in components[4:]:
        x0, y0, x1, y1 = component["bbox"]  # type: ignore[misc]
        best_index = -1
        best_distance = float("inf")
        for index, group in enumerate(groups):
            gx0, gy0, gx1, gy1 = group["bbox"]  # type: ignore[misc]
            dx = max(gx0 - x1, x0 - gx1, 0)
            dy = max(gy0 - y1, y0 - gy1, 0)
            distance = dx * dx + dy * dy
            if distance < best_distance:
                best_index = index
                best_distance = distance
        if best_distance > 48 * 48:
            continue
        group = groups[best_index]
        old_area = int(group["area"])
        add_area = int(component["area"])
        total = old_area + add_area
        gx0, gy0, gx1, gy1 = group["bbox"]  # type: ignore[misc]
        group["bbox"] = [min(gx0, x0), min(gy0, y0), max(gx1, x1), max(gy1, y1)]
        group["cx"] = (float(group["cx"]) * old_area + float(component["cx"]) * add_area) / total
        group["cy"] = (float(group["cy"]) * old_area + float(component["cy"]) * add_area) / total
        group["area"] = total

    by_y = sorted(groups, key=lambda group: float(group["cy"]))
    ordered = sorted(by_y[:2], key=lambda group: float(group["cx"])) + sorted(
        by_y[2:], key=lambda group: float(group["cx"])
    )
    result: dict[str, dict[str, object]] = {}
    for name, group in zip(("d0", "d1", "d2", "d3"), ordered):
        x0, y0, x1, y1 = group["bbox"]  # type: ignore[misc]
        result[name] = {
            "bbox": [x0, y0, x1, y1],
            "width": x1 - x0,
            "height": y1 - y0,
            "foreground_pixels": int(group["area"]),
        }
    return result


def spread(values: list[int]) -> float:
    mean = sum(values) / len(values)
    return 0.0 if mean == 0 else (max(values) - min(values)) / mean * 100.0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--layout", choices=("components", "quadrants"), default="components")
    args = parser.parse_args()

    source = Image.open(args.image)
    has_alpha = "A" in source.getbands()
    image = source.convert("RGB")
    width, height = image.size
    if width % 2 or height % 2:
        raise ValueError(f"sheet dimensions must be even, got {width}x{height}")

    if args.layout == "components":
        cells = component_cells(image)
    else:
        half_w = width // 2
        half_h = height // 2
        bounds = {
            "d0": (0, 0, half_w, half_h),
            "d1": (half_w, 0, width, half_h),
            "d2": (0, half_h, half_w, height),
            "d3": (half_w, half_h, width, height),
        }
        cells = {name: measure_cell(image, cell_bounds) for name, cell_bounds in bounds.items()}
    widths = [int(cell["width"]) for cell in cells.values()]
    heights = [int(cell["height"]) for cell in cells.values()]
    areas = [int(cell["foreground_pixels"]) for cell in cells.values()]
    result = {
        "image": str(args.image),
        "canvas": [width, height],
        "has_alpha": has_alpha,
        "layout": args.layout,
        "measurement_status": "COMPLETED",
        "semantic_status": "NOT_EVALUATED",
        "projection_status": "NOT_EVALUATED",
        "physical_rotation_status": "NOT_EVALUATED",
        "cells": cells,
        "spread_percent": {
            "width": round(spread(widths), 2),
            "height": round(spread(heights), 2),
            "foreground_area": round(spread(areas), 2),
        },
        "warning": (
            "Occupancy measurement only. Exit code zero means parsing completed; it is never "
            "semantic, projection, physical-rotation, or production PASS."
        ),
    }

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"canvas: {width}x{height}  alpha: {result['has_alpha']}")
        for name, cell in cells.items():
            print(
                f"{name}: bbox={cell['bbox']} size={cell['width']}x{cell['height']} "
                f"foreground={cell['foreground_pixels']}"
            )
        values = result["spread_percent"]
        print(
            "spread: "
            f"width={values['width']}% height={values['height']}% "
            f"foreground_area={values['foreground_area']}%"
        )
        print(f"WARNING: {result['warning']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
