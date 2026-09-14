#!/usr/bin/env python3
"""terrain-v3 곡선 해안 오버레이의 연결·크로마·음성 대조군 QA."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "public/assets/kairo-terrain-v3-source"
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/macro-shore-qa.json"


def pink(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, a = pixel
    return bool(a and r > g * 1.1 and b > g * 0.85 and r + b > 180)


def load(name: str) -> Image.Image:
    path = PACK / f"overlay__shore_curve_{name}.png"
    image = Image.open(path).convert("RGBA")
    if image.size != (128, 64):
        raise ValueError(f"{name}: {image.size} != (128, 64)")
    return image


def components(images: list[tuple[Image.Image, int, int]]) -> int:
    min_x = min(x for _, x, _ in images)
    min_y = min(y for _, _, y in images)
    max_x = max(x + image.width for image, x, _ in images)
    max_y = max(y + image.height for image, _, y in images)
    width, height = max_x - min_x, max_y - min_y
    alpha = bytearray(width * height)
    for image, ox, oy in images:
        for y in range(image.height):
            for x in range(image.width):
                if image.getpixel((x, y))[3] > 0:
                    alpha[(oy - min_y + y) * width + (ox - min_x + x)] = 1

    seen = bytearray(width * height)
    count = 0
    for start, value in enumerate(alpha):
        if not value or seen[start]:
            continue
        count += 1
        seen[start] = 1
        queue = deque([start])
        while queue:
            index = queue.popleft()
            x, y = index % width, index // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbor = ny * width + nx
                if alpha[neighbor] and not seen[neighbor]:
                    seen[neighbor] = 1
                    queue.append(neighbor)
    return count


def main() -> None:
    names = (
        "i_start",
        "i_mid",
        "i_end",
        "j_start",
        "j_mid",
        "j_end",
        "outer_corner",
        "inner_corner",
    )
    images = {name: load(name) for name in names}
    fringe = {
        name: sum(1 for pixel in image.getdata() if pink(pixel))
        for name, image in images.items()
    }
    i_sequence = components(
        [
            (images["i_start"], 128, 0),
            (images["i_mid"], 64, 32),
            (images["i_end"], 0, 64),
        ]
    )
    j_sequence = components(
        [
            (images["j_start"], 0, 0),
            (images["j_mid"], 64, 32),
            (images["j_end"], 128, 64),
        ]
    )
    broken_control = components(
        [
            (images["j_start"], 0, 0),
            (images["j_mid"], 76, 32),
            (images["j_end"], 140, 64),
        ]
    )
    fails: list[str] = []
    for name, count in fringe.items():
        if count:
            fails.append(f"{name}: pink fringe {count}px")
    if i_sequence != 1:
        fails.append(f"i start-mid-end components={i_sequence}")
    if j_sequence != 1:
        fails.append(f"j start-mid-end components={j_sequence}")
    if broken_control <= 1:
        fails.append("negative control did not break the sequence")
    report = {
        "schemaVersion": 1,
        "status": "PASS_TECHNICAL" if not fails else "FAIL_TECHNICAL",
        "productionApproved": False,
        "assetCount": len(images),
        "physicalSize": [128, 64],
        "pinkFringePixels": fringe,
        "connectionComponents": {"iStartMidEnd": i_sequence, "jStartMidEnd": j_sequence},
        "negativeControl": {"midAndEndShiftX": 12, "components": broken_control, "caught": broken_control > 1},
        "runtimeSelection": {
            "innerCornerPackaged": True,
            "innerCornerEnabled": False,
            "reason": "diagonal-only heuristic produced detached sand islands",
        },
        "visualReview": "FAIL_USER_VISUAL_REJECTION",
        "disposition": "TECHNICAL_DIAGNOSTIC_ONLY_ARCHIVE",
        "fails": fails,
        "nextGate": "REPLACEMENT_MACRO_SHORE_SOURCE_REVIEW",
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(1 if fails else 0)


if __name__ == "__main__":
    main()
