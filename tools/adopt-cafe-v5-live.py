#!/usr/bin/env python3
"""Adopt the approved cafe-v5 3x2 package into the live Kairo atlas source.

The source package remains review-only on disk. This tool proves the exact
review/evidence hashes, preserves the four simulation slots, derives live D=2
frames directly from the approved D=4 runtime frames, and updates the sim and
render contracts atomically. Run again with ``--finalize`` after baking the
atlas to close the adoption record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REVIEW_REL = Path("public/assets/kairo-cafe-v5-map-review-v1/manifest.json")
FACILITY_ID = "cafe"
SPRITE = "facility/cafe"
OLD_FOOTPRINT = [2, 2]
FOOTPRINT = [3, 2]
CANVAS = [106, 78]
ANCHOR = [53, 78]
BODY_H = 38
GUARD = 13
DIRECTIONS = ("d0", "d1", "d2", "d3")
APPROVAL = "카페는 적용안되었네"
# The locked v5 runtime packer centered the lowest contact point. That is only
# correct for square footprints. A 3x2 canonical diamond bottoms at x=48/80
# in d0/d2 and x=32/80 in d1/d3, so register the already approved pixels by
# eight logical texels without changing their shape or palette.
REGISTRATION_X_LOGICAL = {"d0": 8, "d1": -8, "d2": 8, "d3": -8}


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


def verified_record(record: dict[str, Any], label: str) -> tuple[Path, dict[str, Any]]:
    path = Path(record["path"])
    if not path.is_file() or sha256(path) != record["sha256"]:
        raise ValueError(f"{label}: evidence hash mismatch")
    return path, read_json(path)


def validate_source(source_worktree: Path) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    manifest_path = source_worktree / REVIEW_REL
    review = read_json(manifest_path)
    if (
        review.get("packageId") != "kairo-cafe-v5-map-review-v1"
        or review.get("status") != "KAIRO_CAFE_V5_MAP_REVIEW_ONLY"
        or review.get("candidateFacilityIds") != [FACILITY_ID]
        or review.get("candidateState") != "STRICT_COLOR_GUIDE_USER_REVIEW"
        or review.get("reviewState") != "RUNTIME_FIT_USER_REVIEW"
        or review.get("canonicalLiveFootprint") != OLD_FOOTPRINT
        or review.get("proposedFootprint") != FOOTPRINT
        or review.get("proposedCanvas") != CANVAS
        or review.get("transparentGuardEachSideLogicalPx") != GUARD
        or review.get("productionApproved") is not False
        or review.get("runtimeAdoptionStarted") is not False
        or review.get("userMapFitApprovalClaimed") is not False
    ):
        raise ValueError("unexpected cafe-v5 review contract")

    candidate = review["facilities"][FACILITY_ID]
    if (
        candidate.get("reviewRole") != "candidate"
        or candidate.get("candidateState") != "STRICT_COLOR_GUIDE_USER_REVIEW"
        or candidate.get("runtimeState") != "RUNTIME_FIT_USER_REVIEW"
        or candidate.get("canonicalLiveFootprint") != OLD_FOOTPRINT
        or candidate.get("proposedFootprint") != FOOTPRINT
        or candidate.get("logicalCanvas") != CANVAS
        or candidate.get("retainedForegroundExact") is not True
        or candidate.get("zeroClipping") is not True
    ):
        raise ValueError("cafe-v5 candidate is not adoptable")

    evidence: dict[str, Any] = {}
    for key in (
        "strictAudit",
        "runtimeAudit",
        "physicalEvidence",
        "colorEvidence",
        "independentReview",
        "independentGeometryReview",
        "provenance",
    ):
        record = candidate[key]
        path = Path(record["path"])
        if not path.is_file() or sha256(path) != record["sha256"]:
            raise ValueError(f"{key}: evidence hash mismatch")
        evidence[key] = {"path": str(path), "sha256": sha256(path)}

    strict = read_json(Path(candidate["strictAudit"]["path"]))
    runtime = read_json(Path(candidate["runtimeAudit"]["path"]))
    independent = read_json(Path(candidate["independentReview"]["path"]))
    geometry = read_json(Path(candidate["independentGeometryReview"]["path"]))
    if strict.get("state") != "STRICT_COLOR_GUIDE_USER_REVIEW" or strict.get("failures"):
        raise ValueError("cafe-v5 strict QA failed")
    if not all(strict.get("gates", {}).values()):
        raise ValueError("cafe-v5 strict QA gate is false")
    if independent.get("status") != "PASS_INDEPENDENT_STRICT_REVIEW":
        raise ValueError("cafe-v5 independent color review failed")
    if geometry.get("status") != "PASS" or not all(geometry.get("checks", {}).values()):
        raise ValueError("cafe-v5 independent geometry review failed")
    if (
        runtime.get("footprint") != FOOTPRINT
        or runtime.get("proposed_canvas") != CANVAS
        or runtime.get("transparent_guard_each_side_logical_px") != GUARD
        or runtime.get("all_retained_foreground_exact") is not True
        or runtime.get("zero_clipping") is not True
    ):
        raise ValueError("cafe-v5 runtime-fit contract changed")
    return manifest_path, review, evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-worktree", type=Path, required=True)
    parser.add_argument("--finalize", action="store_true")
    parser.add_argument("--gate-output", type=Path)
    args = parser.parse_args()
    source_worktree = args.source_worktree.resolve()
    manifest_path, review, evidence = validate_source(source_worktree)
    candidate = review["facilities"][FACILITY_ID]
    runtime = read_json(Path(candidate["runtimeAudit"]["path"]))

    sim_path = ROOT / "src/data/kairo-facilities.json"
    render_path = ROOT / "src/assets/kairo-render-contract.json"
    sim = read_json(sim_path)
    render = read_json(render_path)
    facility = sim["facilities"][FACILITY_ID]
    if facility.get("size") not in (OLD_FOOTPRINT, FOOTPRINT):
        raise ValueError(f"unexpected live cafe footprint: {facility.get('size')}")
    if facility.get("facings") != 4:
        raise ValueError("live cafe must retain four facings")
    expected_slots = [[0, 0], [1, 0], [0, 1], [1, 1]]
    actual_slots = [slot.get("tile") for slot in facility.get("slots", [])]
    if actual_slots != expected_slots:
        raise ValueError(f"cafe slots changed: {actual_slots}")
    if not all(0 <= i < FOOTPRINT[0] and 0 <= j < FOOTPRINT[1] for i, j in actual_slots):
        raise ValueError("cafe slot falls outside proposed footprint")

    facility["size"] = FOOTPRINT
    render_entry = next(entry for entry in render["facilities"] if entry["sprite"] == SPRITE)
    render_entry.update(
        {
            "canvas": CANVAS,
            "anchorTexel": ANCHOR,
            "bodyH": BODY_H,
            "horizontalGuardTexel": GUARD,
        }
    )

    target_root = ROOT / "assets/generated/kairo"
    target_root.mkdir(parents=True, exist_ok=True)
    direction_records: list[dict[str, Any]] = []
    for direction in DIRECTIONS:
        source_record = runtime["directions"][direction]
        source = Path(source_record["density_path"])
        if not source.is_file() or sha256(source) != source_record["density_sha256"]:
            raise ValueError(f"cafe/{direction}: D=4 source hash mismatch")
        with Image.open(source) as opened:
            density_four = opened.convert("RGBA")
        if list(density_four.size) != [CANVAS[0] * 4, CANVAS[1] * 4]:
            raise ValueError(f"cafe/{direction}: invalid D=4 source size")
        if density_four.getchannel("A").getbbox() is None:
            raise ValueError(f"cafe/{direction}: empty source")
        density_two = density_four.resize(
            (CANVAS[0] * 2, CANVAS[1] * 2),
            Image.Resampling.NEAREST,
        )
        shift_x = REGISTRATION_X_LOGICAL[direction] * 2
        registered = Image.new("RGBA", density_two.size, (0, 0, 0, 0))
        registered.alpha_composite(density_two, (shift_x, 0))
        if registered.getchannel("A").getbbox() is None:
            raise ValueError(f"cafe/{direction}: registration produced an empty frame")
        if sum(1 for value in density_two.getchannel("A").getdata() if value) != sum(
            1 for value in registered.getchannel("A").getdata() if value
        ):
            raise ValueError(f"cafe/{direction}: registration clipped foreground")
        target = target_root / f"facility__cafe__{direction}.png"
        registered.save(target, optimize=True)
        direction_records.append(
            {
                "direction": direction,
                "density_4_source_sha256": sha256(source),
                "live_density_2_sha256": sha256(target),
                "logical_canvas": CANVAS,
                "physical_size": [CANVAS[0] * 2, CANVAS[1] * 2],
                "runtime_registration_x_logical_texels": REGISTRATION_X_LOGICAL[direction],
                "retained_foreground_ratio": source_record["retained_foreground_ratio"],
                "clipped": source_record["clipped"],
            }
        )

    write_json(sim_path, sim)
    write_json(render_path, render)
    report = {
        "schema_version": 1,
        "state": "LIVE_SOURCE_PACK_INSTALLED_PENDING_ATLAS_VERIFICATION",
        "asset": FACILITY_ID,
        "source_package": candidate["sourcePackage"],
        "source_review_manifest": str(manifest_path),
        "source_review_manifest_sha256": sha256(manifest_path),
        "user_approval": {
            "text": APPROVAL,
            "decision": "APPROVE_CAFE_V5_3X2_FOUR_DIRECTION_LIVE_ADOPTION",
            "interpreted_scope": "adopt the separately held latest cafe-v5 package into live main",
        },
        "rejected_package_excluded": "kairo-cafe-3x2-strict-color-v2",
        "previous_footprint": OLD_FOOTPRINT,
        "approved_footprint": FOOTPRINT,
        "render_contract": {
            "logical_canvas": CANVAS,
            "anchor_texel": ANCHOR,
            "body_h": BODY_H,
            "horizontal_guard_texel": GUARD,
        },
        "runtime_registration": {
            "reason": "locked packer centered contact; non-square 3x2 canvas requires facing-aware bottom-vertex registration",
            "x_logical_texels": REGISTRATION_X_LOGICAL,
            "geometry_changed": False,
            "palette_changed": False,
        },
        "slot_contract": {
            "preserved": True,
            "tiles": expected_slots,
            "all_inside_approved_footprint": True,
        },
        "evidence": evidence,
        "directions": direction_records,
    }

    if args.finalize:
        if args.gate_output is None or not args.gate_output.is_file():
            raise ValueError("--finalize requires the captured live --geom gate output")
        gate_text = args.gate_output.read_text(encoding="utf-8")
        gate_rows: dict[str, str] = {}
        for direction in DIRECTIONS:
            matching = [line.strip() for line in gate_text.splitlines() if f"cafe:{direction}" in line]
            passed = [line for line in matching if line.startswith("·")]
            if len(passed) != 1 or any(line.startswith("✕") for line in matching):
                raise ValueError(f"cafe/{direction}: live geometry gate did not pass exactly once")
            gate_rows[direction] = passed[0]
        atlas_path = ROOT / "public/assets/kairo-atlas.png"
        index_path = ROOT / "public/assets/kairo-atlas.json"
        index = read_json(index_path)
        for direction in DIRECTIONS:
            item = index.get(f"facility/cafe:{direction}")
            if item is None or [item.get("w"), item.get("h")] != [212, 156] or item.get("density") != 2:
                raise ValueError(f"cafe/{direction}: live atlas entry is not D=2 212x156")
        report["state"] = "USER_APPROVED_AND_LIVE_ADOPTED"
        report["atlas"] = {
            "png_sha256": sha256(atlas_path),
            "index_sha256": sha256(index_path),
            "frame_count": len(index),
            "cafe_frames": {
                direction: index[f"facility/cafe:{direction}"] for direction in DIRECTIONS
            },
        }
        report["live_geometry_gate"] = {
            "command": "npx tsx tools/kairo-gate.ts --geom",
            "captured_output_sha256": sha256(args.gate_output),
            "all_four_directions_pass": True,
            "rows": gate_rows,
        }

    report_path = ROOT / "docs/assets/adoption/cafe-v5-3x2-live.json"
    write_json(report_path, report)
    print(json.dumps({"state": report["state"], "report": str(report_path)}))


if __name__ == "__main__":
    main()
