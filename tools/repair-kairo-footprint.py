#!/usr/bin/env python3
"""Repair only the ground-contact band of an existing Kairo facility sprite.

The image generator is still the visual authority for the object above ``bodyH``.
This tool performs the small, deterministic Aseprite-like cleanup that image models
cannot reliably do at logical-pixel scale: it clips pixels below the canonical 2:1
footprint and fills holes in that footprint behind the existing object.  It never
resamples, shears, mirrors, or recolours the upper body.

By default the result is written as a candidate.  ``--adopt`` makes a one-time backup
next to the candidate before replacing the pack image.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets" / "generated" / "kairo"
WORK = ROOT / "assets" / "generated" / "kairo-regen"
FACILITIES = ROOT / "src" / "data" / "kairo-facilities.json"
CONTRACT = ROOT / "src" / "assets" / "kairo-render-contract.json"
OUTLINE_WARM = (74, 56, 38)
OUTLINE_COOL = (30, 51, 72)


@dataclass(frozen=True)
class Spec:
    id: str
    sprite: str
    w: int
    d: int
    body_h: int


def specs() -> dict[str, Spec]:
    simulation = json.loads(FACILITIES.read_text(encoding="utf-8"))["facilities"]
    sizes = {
        row["sprite"]: (facility_id, int(row["size"][0]), int(row["size"][1]))
        for facility_id, row in simulation.items()
    }
    out: dict[str, Spec] = {}
    for row in json.loads(CONTRACT.read_text(encoding="utf-8"))["facilities"]:
        found = sizes.get(row["sprite"])
        if found is None:
            continue
        facility_id, w, d = found
        out[facility_id] = Spec(facility_id, row["sprite"], w, d, int(row["bodyH"]))
    return out


def filename(sprite: str) -> str:
    return sprite.replace("/", "__") + ".png"


def canonical_mask(w: int, d: int, body_h: int) -> set[tuple[int, int]]:
    """Port of ``canonicalGroundMask`` using the renderer's integer scanlines."""
    mask: set[tuple[int, int]] = set()
    for i in range(w):
        for j in range(d):
            off_x = 16 * (i - j) + 16 * d - 16
            off_y = 8 * (i + j) + body_h
            for tile_y in range(16):
                half_width = 1 + 2 * min(tile_y, 15 - tile_y)
                x0 = 16 - half_width
                x1 = 16 + half_width
                for tile_x in range(x0, x1):
                    mask.add((off_x + tile_x, off_y + tile_y))
    return mask


def material_colour(image: Image.Image, body_h: int) -> tuple[int, int, int]:
    """Pick the existing lower band's dominant non-outline material colour."""
    colours: Counter[tuple[int, int, int]] = Counter()
    for y in range(body_h, image.height):
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            if a < 128 or (r, g, b) in {OUTLINE_WARM, OUTLINE_COOL}:
                continue
            colours[(r, g, b)] += 1
    if colours:
        return colours.most_common(1)[0][0]
    return (112, 82, 46)


def repair(source: Path, destination: Path, spec: Spec, mirror: bool = False) -> dict[str, object]:
    image = Image.open(source).convert("RGBA")
    expected_size = ((spec.w + spec.d) * 16, spec.body_h + (spec.w + spec.d) * 8)
    if image.size != expected_size:
        raise ValueError(f"{spec.id}: image {image.size}, expected {expected_size}")

    if mirror:
        image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    mask = canonical_mask(spec.w, spec.d, spec.body_h)
    by_column: dict[int, list[int]] = {}
    for x, y in mask:
        by_column.setdefault(x, []).append(y)
    contour = {x: max(ys) for x, ys in by_column.items()}
    base = material_colour(image, spec.body_h)
    outline = OUTLINE_COOL if sum(base[2:]) > sum(base[:2]) else OUTLINE_WARM
    pixels = image.load()
    clipped = 0
    filled = 0

    # Anything below the contract would change the measured footprint and visibly
    # overhang the tile.  Pixels above body_h remain untouched.
    for x in range(image.width):
        bottom = contour.get(x)
        clear_from = spec.body_h if bottom is None else bottom + 1
        for y in range(clear_from, image.height):
            if pixels[x, y][3] >= 128:
                clipped += 1
            pixels[x, y] = (0, 0, 0, 0)

    # Add a base *behind* the existing lower-band art.  Existing opaque pixels always
    # win, so stairs, floats, walls and deck textures are preserved.
    for x, y in mask:
        if pixels[x, y][3] < 128:
            pixels[x, y] = (*base, 255)
            filled += 1

    # A one-logical-pixel lower rim makes the repaired edge read as intentional pixel
    # art and gives every column the exact canonical contour used by the runtime gate.
    for x, y in contour.items():
        pixels[x, y] = (*outline, 255)

    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)
    return {
        "id": spec.id,
        "mode": "mirror+band-repair" if mirror else "band-repair",
        "source": str(source),
        "destination": str(destination),
        "fill": "#" + "".join(f"{v:02x}" for v in base),
        "outline": "#" + "".join(f"{v:02x}" for v in outline),
        "filled": filled,
        "clipped": clipped,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", action="append", default=[], dest="ids")
    parser.add_argument(
        "--all-failing",
        action="store_true",
        help="read the current geometry findings and repair only failing facilities",
    )
    parser.add_argument("--mirror", action="store_true")
    parser.add_argument("--adopt", action="store_true")
    args = parser.parse_args()
    available = specs()
    reports: list[dict[str, object]] = []
    automatic_mirrors: set[str] = set()

    ids = list(args.ids)
    if args.all_failing:
        gate = subprocess.run(
            ["npx", "tsx", "tools/kairo-gate.ts", "--json"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        findings = json.loads(gate.stdout)["findings"]
        for finding in findings:
            if finding["gate"] != "접지기하":
                continue
            facility_id = finding["id"]
            if facility_id not in ids:
                ids.append(facility_id)
            if "발자국 두 축이 바뀐 그림" in finding["detail"]:
                automatic_mirrors.add(facility_id)
    if not ids:
        if args.all_failing:
            print("[]")
            return
        parser.error("pass --id at least once or use --all-failing")

    for facility_id in ids:
        if facility_id not in available:
            raise SystemExit(f"Unknown facility id: {facility_id}")
        spec = available[facility_id]
        source = PACK / filename(spec.sprite)
        work = WORK / facility_id
        mirror = args.mirror or facility_id in automatic_mirrors
        candidate = work / ("footprint-mirror-repair.png" if mirror else "footprint-repair.png")
        report = repair(source, candidate, spec, mirror=mirror)
        if args.adopt:
            backup = work / "pre-footprint-repair.png"
            if not backup.exists():
                shutil.copy2(source, backup)
            shutil.copy2(candidate, source)
            report["adopted"] = True
            report["backup"] = str(backup)
        reports.append(report)

    print(json.dumps(reports, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
