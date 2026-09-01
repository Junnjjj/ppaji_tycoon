#!/usr/bin/env python3
"""Install the seven strict-PASS, footprint-preserving roofed facilities.

The source worktree contains review-only density-4 evidence. This script verifies
that evidence and installs density-2 nearest-neighbour frames into the ignored
live source pack before the tracked atlas is baked.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FACILITIES = {
    "shop": ([74, 72], 5),
    "snackbar": ([72, 74], 4),
    "karaoke": ([70, 75], 3),
    "info": ([64, 71], 0),
    "infirmary": ([68, 78], 2),
    "office": ([68, 73], 2),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON object required: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-worktree", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    review_manifest_path = (
        args.source_worktree.resolve()
        / "public/assets/kairo-roofed-strict-color-wave-v1/manifest.json"
    )
    review = read_json(review_manifest_path)
    if review.get("status") != "KAIRO_ROOFED_STRICT_COLOR_WAVE_RUNTIME_REVIEW_ONLY":
        raise ValueError("unexpected roofed review package")
    if review.get("strictPassed") != 9 or review.get("strictHeld") != 1:
        raise ValueError("roofed review summary changed")

    target_pack = ROOT / "assets/generated/kairo"
    target_pack.mkdir(parents=True, exist_ok=True)
    backup_root = Path(tempfile.mkdtemp(prefix="ppaji-roofed-live-baseline."))
    records: list[dict[str, Any]] = []

    render_path = ROOT / "src/assets/kairo-render-contract.json"
    render = read_json(render_path)
    render_by_sprite = {entry["sprite"]: entry for entry in render["facilities"]}

    for facility_id, (logical_canvas, guard) in FACILITIES.items():
        facility = review["facilities"][facility_id]
        if (
            facility.get("canonicalFootprint") != [2, 2]
            or facility.get("candidateState") != "STRICT_COLOR_GUIDE_USER_REVIEW"
            or facility.get("runtimeState") != "RUNTIME_FIT_USER_REVIEW"
            or facility.get("logicalCanvas") != logical_canvas
            or facility.get("retainedForegroundExact") is not True
            or facility.get("zeroClipping") is not True
        ):
            raise ValueError(f"{facility_id}: review contract is not adoptable")

        strict_path = Path(facility["strictAudit"]["path"])
        runtime_path = Path(facility["runtimeAudit"]["path"])
        independent_path = Path(facility["independentReview"]["path"])
        for label, record, path in (
            ("strict", facility["strictAudit"], strict_path),
            ("runtime", facility["runtimeAudit"], runtime_path),
            ("independent", facility["independentReview"], independent_path),
        ):
            if not path.is_file() or sha256(path) != record["sha256"]:
                raise ValueError(f"{facility_id}: {label} evidence hash mismatch")

        strict = read_json(strict_path)
        runtime = read_json(runtime_path)
        independent = read_json(independent_path)
        if strict.get("state") != "STRICT_COLOR_GUIDE_USER_REVIEW" or strict.get("failures"):
            raise ValueError(f"{facility_id}: strict QA failed")
        if not all(strict.get("gates", {}).values()):
            raise ValueError(f"{facility_id}: a strict QA gate is false")
        if independent.get("status") != "PASS_INDEPENDENT_STRICT_REVIEW":
            raise ValueError(f"{facility_id}: independent review failed")
        if (
            runtime.get("footprint") != [2, 2]
            or runtime.get("proposed_canvas") != logical_canvas
            or runtime.get("transparent_guard_each_side_logical_px") != guard
            or runtime.get("all_retained_foreground_exact") is not True
            or runtime.get("zero_clipping") is not True
        ):
            raise ValueError(f"{facility_id}: runtime-fit contract changed")

        direction_records: list[dict[str, Any]] = []
        for direction in ("d0", "d1", "d2", "d3"):
            source_record = runtime["directions"][direction]
            source = Path(source_record["density_path"])
            if not source.is_file() or sha256(source) != source_record["density_sha256"]:
                raise ValueError(f"{facility_id}/{direction}: density-4 source hash mismatch")
            target = target_pack / f"facility__{facility_id}__{direction}.png"
            if target.is_file():
                shutil.copy2(target, backup_root / target.name)
            with Image.open(source) as opened:
                density_four = opened.convert("RGBA")
            if (
                list(density_four.size) != [logical_canvas[0] * 4, logical_canvas[1] * 4]
                or density_four.getchannel("A").getbbox() is None
            ):
                raise ValueError(f"{facility_id}/{direction}: invalid density-4 source")
            density_two = density_four.resize(
                (logical_canvas[0] * 2, logical_canvas[1] * 2),
                Image.Resampling.NEAREST,
            )
            density_two.save(target, optimize=True)
            direction_records.append(
                {
                    "direction": direction,
                    "density_4_source_sha256": sha256(source),
                    "live_source_sha256": sha256(target),
                    "logical_canvas": logical_canvas,
                    "density": 2,
                }
            )

        render_entry = render_by_sprite[f"facility/{facility_id}"]
        render_entry["canvas"] = logical_canvas
        render_entry["anchorTexel"] = [logical_canvas[0] // 2, logical_canvas[1]]
        render_entry["bodyH"] = logical_canvas[1] - 32
        if guard:
            render_entry["horizontalGuardTexel"] = guard
        else:
            render_entry.pop("horizontalGuardTexel", None)
        records.append(
            {
                "facility": facility_id,
                "footprint": [2, 2],
                "render": dict(render_entry),
                "strict_audit_sha256": sha256(strict_path),
                "runtime_audit_sha256": sha256(runtime_path),
                "independent_review_sha256": sha256(independent_path),
                "directions": direction_records,
            }
        )

    write_json(render_path, render)
    report = {
        "schema_version": 1,
        "state": "LIVE_SOURCE_PACK_INSTALLED_PENDING_ATLAS_VERIFICATION",
        "user_request": "시설 만든 것들과 새 맵을 메인 기본 화면에 적용",
        "included": list(FACILITIES),
        "excluded": {
            "nursing": "already adopted from newer v9 package",
            "cafe": "newer v5 changes footprint from 2x2 to 3x2; separate decision required",
            "toilet": "live geometry gate held d2: left ground slope 0.576 versus 0.500 authority",
            "storage": "FAIL_CLOSED_STRICT_COLOR_VALIDATION / RUNTIME_FIT_HELD",
        },
        "source_manifest_sha256": sha256(review_manifest_path),
        "facilities": records,
    }
    report_path = ROOT / "docs/assets/adoption/roofed-pass-facilities-live-v1.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(report_path, report)
    print(json.dumps({"state": report["state"], "report": str(report_path), "backup": str(backup_root)}))


if __name__ == "__main__":
    main()
