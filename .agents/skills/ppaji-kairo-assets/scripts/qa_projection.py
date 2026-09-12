#!/usr/bin/env python3
"""Measure whether visible edge families follow the Ppaji 45°/30° 2:1 projection.

This is a projection diagnostic, not a rotation or geometry-authority validator.
It uses only Pillow and the Python standard library so the skill stays portable.
"""

from __future__ import annotations

import argparse
import json
import math
import tempfile
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw


TARGET_DIAGONAL = math.degrees(math.atan(0.5))
TARGET_VERTICAL = 90.0
MAX_ANALYSIS_SIDE = 360
EDGE_DELTA = 42


def is_magenta(rgb: tuple[int, int, int]) -> bool:
    red, green, blue = rgb
    return (
        red >= 150
        and blue >= 130
        and green <= 125
        and red >= green + 90
        and blue >= green + 70
    )


def color_delta(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return max(abs(a[index] - b[index]) for index in range(3))


def foreground_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(rgb.height):
        for x in range(rgb.width):
            if not is_magenta(pixels[x, y]):
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError("no foreground pixels")
    pad = 3
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(rgb.width, max(xs) + pad + 1),
        min(rgb.height, max(ys) + pad + 1),
    )


def analysis_image(image: Image.Image) -> Image.Image:
    cropped = image.convert("RGB").crop(foreground_bbox(image))
    scale = min(1.0, MAX_ANALYSIS_SIDE / max(cropped.size))
    if scale < 1.0:
        cropped = cropped.resize(
            (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
            Image.Resampling.LANCZOS,
        )
    return cropped


def edge_points(image: Image.Image) -> list[tuple[int, int]]:
    rgb = analysis_image(image)
    pixels = rgb.load()
    points: list[tuple[int, int]] = []
    neighbours = ((-1, 0), (1, 0), (0, -1), (0, 1))
    for y in range(1, rgb.height - 1):
        for x in range(1, rgb.width - 1):
            here = pixels[x, y]
            if is_magenta(here):
                continue
            edge = False
            for dx, dy in neighbours:
                other = pixels[x + dx, y + dy]
                if is_magenta(other) or color_delta(here, other) >= EDGE_DELTA:
                    edge = True
                    break
            if edge:
                points.append((x, y))
    if len(points) > 7000:
        step = math.ceil(len(points) / 7000)
        points = points[::step]
    if len(points) < 40:
        raise ValueError(f"too few edge pixels: {len(points)}")
    return points


def hough_score(points: list[tuple[int, int]], line_angle_deg: float) -> tuple[float, int]:
    angle = math.radians(line_angle_deg)
    normal_x = -math.sin(angle)
    normal_y = math.cos(angle)
    bins: Counter[int] = Counter()
    for x, y in points:
        rho = round(x * normal_x + y * normal_y)
        bins[rho] += 1
    peaks = sorted(bins.values(), reverse=True)[:12]
    if not peaks:
        return 0.0, 0
    score = sum(count * count for count in peaks) / len(points)
    return score, peaks[0]


def best_family(
    points: list[tuple[int, int]],
    target: float,
    radius: float,
    step: float = 0.25,
) -> dict[str, float | int | str]:
    candidates: list[tuple[float, float, int]] = []
    count = round((radius * 2) / step)
    for index in range(count + 1):
        angle = target - radius + index * step
        score, peak = hough_score(points, angle)
        candidates.append((score, angle, peak))
    score, angle, peak = max(candidates)
    error = abs(angle - target)
    if peak < 7:
        verdict = "UNMEASURABLE"
    elif error <= 2.0:
        verdict = "PASS"
    elif error <= 4.0:
        verdict = "WARN"
    else:
        verdict = "FAIL"
    return {
        "target_deg": round(target, 3),
        "measured_deg": round(angle, 3),
        "abs_error_deg": round(error, 3),
        "peak_edge_pixels": peak,
        "score": round(score, 3),
        "verdict": verdict,
    }


def analyze_cell(image: Image.Image) -> dict[str, object]:
    points = edge_points(image)
    families = {
        "diag_negative": best_family(points, -TARGET_DIAGONAL, 12.0),
        "diag_positive": best_family(points, TARGET_DIAGONAL, 12.0),
        "vertical": best_family(points, TARGET_VERTICAL, 9.0),
    }
    verdicts = [str(family["verdict"]) for family in families.values()]
    if "FAIL" in verdicts or "UNMEASURABLE" in verdicts:
        overall = "FAIL"
    elif "WARN" in verdicts:
        overall = "WARN"
    else:
        overall = "PASS"
    return {
        "edge_points": len(points),
        "families": families,
        "overall": overall,
        "warning": (
            "Projection edges only. PASS does not prove rigid rotation, component identity, "
            "camera metadata, scale, anchor, or user approval."
        ),
    }


def cells(image: Image.Image, layout: str) -> dict[str, Image.Image]:
    if layout == "single":
        return {"single": image}
    width, height = image.size
    if width % 2 or height % 2:
        raise ValueError(f"quadrant sheet dimensions must be even, got {width}x{height}")
    half_w = width // 2
    half_h = height // 2
    return {
        "d0": image.crop((0, 0, half_w, half_h)),
        "d1": image.crop((half_w, 0, width, half_h)),
        "d2": image.crop((0, half_h, half_w, height)),
        "d3": image.crop((half_w, half_h, width, height)),
    }


def analyze_path(path: Path, layout: str) -> dict[str, object]:
    image = Image.open(path).convert("RGB")
    results = {name: analyze_cell(cell) for name, cell in cells(image, layout).items()}
    overall = "PASS"
    if any(result["overall"] == "FAIL" for result in results.values()):
        overall = "FAIL"
    elif any(result["overall"] == "WARN" for result in results.values()):
        overall = "WARN"
    return {
        "image": str(path),
        "layout": layout,
        "contract": {
            "projection": "orthographic",
            "camera_yaw_deg": 45,
            "camera_elevation_deg": 30,
            "tile_texels": [32, 16],
            "signed_ground_edge_deg": [-round(TARGET_DIAGONAL, 3), round(TARGET_DIAGONAL, 3)],
            "vertical_deg": 90,
        },
        "cells": results,
        "overall": overall,
    }


def synthetic(path: Path, diagonal: float, vertical: float) -> None:
    image = Image.new("RGB", (640, 480), (255, 0, 255))
    draw = ImageDraw.Draw(image)
    center = (320, 260)
    for angle in (-diagonal, diagonal):
        radians = math.radians(angle)
        dx = math.cos(radians) * 260
        dy = math.sin(radians) * 260
        for offset in (-80, 0, 80):
            draw.line(
                (
                    center[0] - dx,
                    center[1] - dy + offset,
                    center[0] + dx,
                    center[1] + dy + offset,
                ),
                fill=(235, 235, 235),
                width=5,
            )
    radians = math.radians(vertical)
    dx = math.cos(radians) * 180
    dy = math.sin(radians) * 180
    for offset in (-140, 0, 140):
        draw.line(
            (
                center[0] - dx + offset,
                center[1] - dy,
                center[0] + dx + offset,
                center[1] + dy,
            ),
            fill=(235, 235, 235),
            width=5,
        )
    image.save(path)


def selftest() -> int:
    with tempfile.TemporaryDirectory(prefix="ppaji-projection-") as directory:
        positive = Path(directory) / "positive.png"
        negative = Path(directory) / "negative.png"
        synthetic(positive, TARGET_DIAGONAL, TARGET_VERTICAL)
        synthetic(negative, 35.0, 80.0)
        good = analyze_path(positive, "single")
        bad = analyze_path(negative, "single")
        ok = good["overall"] == "PASS" and bad["overall"] == "FAIL"
        print(json.dumps({"positive": good, "negative": bad, "selftest": "PASS" if ok else "FAIL"}, indent=2))
        return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path, nargs="?")
    parser.add_argument("--layout", choices=("single", "quadrants"), default="single")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if args.image is None:
        parser.error("image is required unless --selftest is used")
    print(json.dumps(analyze_path(args.image, args.layout), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
