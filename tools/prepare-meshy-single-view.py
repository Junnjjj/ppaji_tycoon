#!/usr/bin/env python3
"""Prepare one approved facility crop for Meshy without generative cleanup.

The approved source hash is mandatory. Border-connected neutral sheet pixels are
removed, the largest connected component identifies the facility, and nearby
detached components inside a conservative padded region are preserved. Sheet
titles and neighboring crop fragments outside that region are excluded. The
result is centered on a transparent 1024 px canvas and accompanied by a full
component audit so a human can review it before a paid provider request.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from pathlib import Path

from PIL import Image


CANVAS_SIZE = 1024
OBJECT_MAX = 768
ALPHA_THRESHOLD = 8


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_border_background(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    if a == 0:
        return True
    chroma = max(r, g, b) - min(r, g, b)
    return min(r, g, b) >= 175 and chroma <= 28


def flood_transparent(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    queue: deque[tuple[int, int]] = deque()
    visited = bytearray(width * height)
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index]:
            continue
        visited[index] = 1
        if not is_border_background(pixels[x, y]):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return rgba


def components(image: Image.Image) -> list[dict[str, object]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = alpha.size
    visited = bytearray(width * height)
    found: list[dict[str, object]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] < ALPHA_THRESHOLD:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[index] = 1
            points: list[tuple[int, int]] = []
            min_x = max_x = x
            min_y = max_y = y
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    ni = ny * width + nx
                    if visited[ni] or pixels[nx, ny] < ALPHA_THRESHOLD:
                        continue
                    visited[ni] = 1
                    queue.append((nx, ny))
            found.append(
                {
                    "points": points,
                    "area_px": len(points),
                    "bbox_xyxy": [min_x, min_y, max_x + 1, max_y + 1],
                }
            )
    return sorted(found, key=lambda item: int(item["area_px"]), reverse=True)


def intersects(a: list[int], b: list[int]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    report = args.report.resolve()
    if not source.is_file():
        raise SystemExit(f"approved source is missing: {source}")
    source_hash = sha256_file(source)
    if source_hash != args.expected_sha256:
        raise SystemExit(
            f"approved source SHA-256 mismatch: expected {args.expected_sha256}, got {source_hash}"
        )

    original = Image.open(source).convert("RGBA")
    transparent = flood_transparent(original)
    found = components(transparent)
    if not found:
        raise SystemExit("background removal produced no foreground components")

    main_bbox = list(found[0]["bbox_xyxy"])
    width, height = original.size
    pad_x = max(8, round((main_bbox[2] - main_bbox[0]) * 0.08))
    pad_y = max(8, round((main_bbox[3] - main_bbox[1]) * 0.08))
    selection_region = [
        max(0, main_bbox[0] - pad_x),
        max(0, main_bbox[1] - pad_y),
        min(width, main_bbox[2] + pad_x),
        min(height, main_bbox[3] + pad_y),
    ]
    # Class-sheet crop titles sit in a detached row above the facility.  A
    # loose padded-box intersection can accidentally retain the bottoms of
    # those glyphs.  Keep detached roof/sign details that remain close to the
    # facility, but reject components whose vertical centre is clearly above
    # the main silhouette.
    main_height = main_bbox[3] - main_bbox[1]
    detached_top_center_cutoff = main_bbox[1] - max(4, round(main_height * 0.04))
    main_area = int(found[0]["area_px"])
    main_width = main_bbox[2] - main_bbox[0]
    minimum_area = max(8, round(main_area * 0.00015))
    candidates = [
        item
        for item in found
        if int(item["area_px"]) >= minimum_area
        and intersects(list(item["bbox_xyxy"]), selection_region)
        and (
            int(item["bbox_xyxy"][1]) + int(item["bbox_xyxy"][3])
        ) / 2
        >= detached_top_center_cutoff
    ]
    detached_candidates = [item for item in candidates if item is not found[0]]
    near_top_limit = main_bbox[1] + max(24, round(main_height * 0.08))
    label_row_ids: set[int] = set()
    for item in detached_candidates:
        bbox_item = list(item["bbox_xyxy"])
        item_height = bbox_item[3] - bbox_item[1]
        item_center_y = (bbox_item[1] + bbox_item[3]) / 2
        if item_height > max(32, round(main_height * 0.12)) or item_center_y > near_top_limit:
            continue
        row = []
        for other in detached_candidates:
            other_bbox = list(other["bbox_xyxy"])
            other_height = other_bbox[3] - other_bbox[1]
            other_center_y = (other_bbox[1] + other_bbox[3]) / 2
            if other_height <= max(32, round(main_height * 0.12)) and abs(
                other_center_y - item_center_y
            ) <= 3:
                row.append(other)
        if len(row) >= 3:
            row_left = min(int(other["bbox_xyxy"][0]) for other in row)
            row_right = max(int(other["bbox_xyxy"][2]) for other in row)
            if row_right - row_left >= max(40, round(main_width * 0.12)):
                label_row_ids.update(id(other) for other in row)

    def keep_candidate(item: dict[str, object]) -> bool:
        if item is found[0]:
            return True
        bbox_item = list(item["bbox_xyxy"])
        if id(item) in label_row_ids:
            return False
        if bbox_item[0] <= 0 or bbox_item[1] <= 0 or bbox_item[2] >= width or bbox_item[3] >= height:
            return False
        if bbox_item[3] <= main_bbox[1] and int(item["area_px"]) < round(main_area * 0.003):
            return False
        return True

    selected = [item for item in candidates if keep_candidate(item)]
    selected_points = {point for item in selected for point in item["points"]}
    isolated = Image.new("RGBA", original.size, (0, 0, 0, 0))
    src_pixels = transparent.load()
    dst_pixels = isolated.load()
    for x, y in selected_points:
        dst_pixels[x, y] = src_pixels[x, y]
    bbox = isolated.getchannel("A").getbbox()
    if bbox is None:
        raise SystemExit("component selection produced an empty image")
    isolated = isolated.crop(bbox)
    scale = min(OBJECT_MAX / isolated.width, OBJECT_MAX / isolated.height)
    resized_size = (
        max(1, round(isolated.width * scale)),
        max(1, round(isolated.height * scale)),
    )
    resized = isolated.resize(resized_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    offset = ((CANVAS_SIZE - resized.width) // 2, (CANVAS_SIZE - resized.height) // 2)
    canvas.alpha_composite(resized, offset)

    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() or report.exists():
        raise SystemExit("refusing to overwrite an existing Meshy input or preflight report")
    canvas.save(output, format="PNG", optimize=False)
    alpha_bbox = canvas.getchannel("A").getbbox()
    payload = {
        "schema_version": 1,
        "status": "MESHY_INPUT_UNREVIEWED",
        "method": "border-connected neutral removal + audited component-region selection + Lanczos resize",
        "generative_cleanup": False,
        "source_path": str(source),
        "source_sha256": source_hash,
        "source_size": list(original.size),
        "component_count_total": len(found),
        "component_count_selected": len(selected),
        "main_component_bbox_xyxy": main_bbox,
        "selection_region_xyxy": selection_region,
        "detached_top_center_cutoff_y": detached_top_center_cutoff,
        "near_top_label_row_limit_y": near_top_limit,
        "label_row_component_count_removed": len(label_row_ids),
        "minimum_selected_component_area_px": minimum_area,
        "components": [
            {
                "area_px": int(item["area_px"]),
                "bbox_xyxy": list(item["bbox_xyxy"]),
                "selected": item in selected,
            }
            for item in found
        ],
        "isolated_alpha_bbox_xyxy": list(bbox),
        "output_path": str(output),
        "output_sha256": sha256_file(output),
        "output_size": list(canvas.size),
        "output_alpha_bbox_xyxy": list(alpha_bbox) if alpha_bbox else None,
        "object_resized_size": list(resized_size),
        "object_canvas_offset": list(offset),
        "object_max_canvas_fraction": OBJECT_MAX / CANVAS_SIZE,
        "paid_provider_request_made": False,
        "human_input_review_required": True,
    }
    report.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
