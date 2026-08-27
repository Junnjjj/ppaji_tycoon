#!/usr/bin/env python3
"""Prepare an auditable facility-specific ImageGen four-view color prompt."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--legacy-prompt", type=Path, required=True)
    parser.add_argument("--clay-4up", type=Path, required=True)
    parser.add_argument("--approved-colored-d0", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def field(text: str, label: str) -> str:
    match = re.search(rf"^{re.escape(label)}:\s*(.+)$", text, re.MULTILINE)
    if not match:
        raise RuntimeError(f"Missing {label} in legacy prompt")
    return match.group(1).strip()


def main() -> None:
    args = parse_args()
    legacy = args.legacy_prompt.resolve()
    clay = args.clay_4up.resolve()
    colored = args.approved_colored_d0.resolve()
    for path in (legacy, clay, colored):
        if not path.is_file():
            raise FileNotFoundError(path)
    legacy_text = legacy.read_text(encoding="utf-8")
    asset = field(legacy_text, "ASSET")
    inventory = field(legacy_text, "FIXED INVENTORY")
    access = field(legacy_text, "ACCESS")
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    prompt = f"""Use case: style-transfer
Asset type: Ppaji Tycoon static-facility four-direction color/design guide

Input images:
- Image 1 is the PRIMARY EDITABLE IMAGE and ABSOLUTE GEOMETRY AUTHORITY. It is a clean 2x2 sheet rendered from one complete physical Blender root under one fixed orthographic game camera. Preserve its exact four panels, panel positions, camera, silhouette, scale, occlusion, internal part placement, and geometry.
- Image 2 is an ADDITIONAL MATERIAL/COLOR/PIXEL-ART REFERENCE ONLY. It controls palette, semantic material roles, outline language, texture density, and the approved identity. It must never override Image 1 geometry, component count, camera, or hidden-side evidence.

Primary request:
Apply the colorful Korean management-sim pixel-art material language from Image 2 onto the exact four physical views in Image 1. Keep the same {asset} as one rigid object rotating physically:
d0 top-left, complete-root yaw 0 degrees;
d1 top-right, complete-root yaw 90 degrees;
d2 bottom-left, complete-root yaw 180 degrees;
d3 bottom-right, complete-root yaw 270 degrees.

Fixed identity and semantic inventory:
- {inventory}
- Physical component count and all visible/hidden placement come from Image 1. If Image 2 suggests a conflicting count or viewpoint, obey Image 1.
- Access contract: {access}
- Keep every door, portal, counter, control face, use side, entry, exit, opening, sign, fixture, and attachment on its original local physical side as it rotates. A rear or occluded landmark must remain hidden rather than being moved toward the camera.

Style and materials:
- polished Korean management-sim game asset;
- crisp chunky pixel-art material treatment at high-resolution guide scale;
- readable material clusters and outlines without changing structure;
- one coherent palette across all four directions;
- fixed screen-upper-left lighting in every panel;
- genuine transparent background.

Geometry invariants:
Change surface color, material impression, pixel clusters, outline language, and texture detail only. Keep every Image 1 edge, opening, depth relationship, part count, attachment, occlusion, projected angle, panel position, and shared scale. The four views must remain the same one physical object.

Constraints:
No independent panel redesign. No mirroring or direction relabeling. No camera or projection change. No per-panel rescaling or recentering. No facade rotation. No moved, duplicated, removed, or invented parts. No new rear door, portal, counter, controls, sign, opening, roof, wall, platform, or floor slab. Do not copy d0's visible facade onto d1-d3. Do not rotate the screen-upper-left light with the object. No NPC, person, occupant, terrain, water, floor mat, placement diamond, cast shadow, scenery, label, direction caption, arrow, UI, logo, text, or watermark. Preserve genuine transparency outside the objects.
"""
    prompt_path = output_dir / "prompt.txt"
    prompt_path.write_text(prompt, encoding="utf-8")
    record = {
        "recorded_at": utc_now(),
        "asset_id": args.asset_id,
        "mode": "built_in_imagegen_edit",
        "use_case": "style-transfer",
        "referenced_image_paths_ordered": [str(clay), str(colored)],
        "roles": {
            "image_1": "PRIMARY_EDITABLE_ABSOLUTE_GEOMETRY_AUTHORITY",
            "image_2": "ADDITIONAL_MATERIAL_COLOR_PIXEL_ART_REFERENCE_ONLY",
        },
        "inputs": {
            "clay_4up_sha256": sha256_file(clay),
            "approved_colored_d0_sha256": sha256_file(colored),
            "legacy_prompt_sha256": sha256_file(legacy),
        },
        "prompt": {"path": str(prompt_path), "sha256": sha256_file(prompt_path)},
        "imagegen_status": "NOT_STARTED",
        "raw_output": None,
        "runtime_adoption_started": False,
    }
    record_path = output_dir / "imagegen-execution-record.json"
    record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"asset_id": args.asset_id, "prompt": str(prompt_path), "record": str(record_path)}, sort_keys=True))


if __name__ == "__main__":
    main()
