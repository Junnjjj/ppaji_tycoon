#!/usr/bin/env python3
"""Independently validate the 19-asset physical/color wave plus changing-row.

This is deliberately fail-closed.  It verifies immutable dense inputs, exact
physical yaw records and decoded reopen equality, current physical hashes, and
pixel-exact physical-alpha locking.  Raw ImageGen silhouette failures remain
visible; they are not converted into production approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops


DIRECTIONS = ("d0", "d1", "d2", "d3")
EXPECTED_YAWS = {"d0": 0.0, "d1": 90.0, "d2": 180.0, "d3": 270.0}
CHANGING_ROW = Path(
    "/Users/jangjunpyo/orca/workspaces/ppaji_tycoon/에셋만들기_스킬/"
    "assets/generated/kairo-v4-simple-pilot/changing_row/physical-meshy-v1"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def exact_alpha(physical_path: Path, locked_path: Path) -> bool:
    physical = Image.open(physical_path).convert("RGBA").getchannel("A")
    locked = Image.open(locked_path).convert("RGBA").getchannel("A")
    return physical.size == locked.size and ImageChops.difference(physical, locked).getbbox() is None


def file_record(path: Path) -> dict[str, object]:
    return {
        "path": str(path),
        "exists": path.is_file(),
        "bytes": path.stat().st_size if path.is_file() else 0,
        "sha256": sha256_file(path) if path.is_file() else None,
    }


def validate_wave_asset(asset: dict) -> dict:
    asset_id = asset["id"]
    dense = Path(asset["dense_d0_directory"])
    directions = dense / "physical-directions-v1"
    rotations_path = directions / "physical-rotations.json"
    reopen_path = directions / "directional/directional-reopen-verification.json"
    worker_report = directions / "WORKER-REPORT.json"
    provenance = directions / "SKILL-PROVENANCE.json"
    color_dir = directions / "color-transfer/v1"
    color_qa_path = color_dir / "qa.json"
    required = (rotations_path, reopen_path, worker_report, provenance, color_qa_path)
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        return {"asset_id": asset_id, "status": "FAIL_MISSING", "missing": missing}

    rotations = load(rotations_path)
    reopen = load(reopen_path)
    color_qa = load(color_qa_path)
    physical_records = {}
    physical_hashes = []
    physical_pass = True
    alpha_lock_pass = True
    raw_pass_count = 0
    for direction in DIRECTIONS:
        rotation = rotations.get("directions", {}).get(direction, {})
        physical_path = Path(rotation.get("path", directions / f"physical/{direction}.png"))
        current_hash = sha256_file(physical_path) if physical_path.is_file() else None
        recorded_hash = rotation.get("sha256")
        yaw = rotation.get("physical_pitch_yaw_roll_deg", [None, None, None])[1]
        reopen_direction = reopen.get("directions", {}).get(direction, {})
        decoded = reopen_direction.get("decoded_pixel_comparison", {})
        locked_path = Path(color_qa.get("directions", {}).get(direction, {}).get("paths", {}).get("locked", ""))
        alpha_exact = locked_path.is_file() and physical_path.is_file() and exact_alpha(physical_path, locked_path)
        alpha_lock_pass = alpha_lock_pass and alpha_exact
        raw_gate = color_qa.get("directions", {}).get(direction, {}).get("geometry_gate")
        raw_pass_count += int(raw_gate == "PASS")
        record_pass = (
            physical_path.is_file()
            and current_hash == recorded_hash
            and yaw == EXPECTED_YAWS[direction]
            and decoded.get("decoded_rgba_float_exact") is True
            and decoded.get("decoded_rgba_max_abs_diff") == 0.0
            and decoded.get("differing_channel_values") == 0
        )
        physical_pass = physical_pass and record_pass
        if current_hash:
            physical_hashes.append(current_hash)
        physical_records[direction] = {
            "expected_yaw_deg": EXPECTED_YAWS[direction],
            "recorded_yaw_deg": yaw,
            "path": str(physical_path),
            "current_sha256": current_hash,
            "recorded_sha256": recorded_hash,
            "hash_match": current_hash == recorded_hash,
            "reopen_decoded_rgba_exact": decoded.get("decoded_rgba_float_exact"),
            "raw_color_geometry_gate": raw_gate,
            "locked_path": str(locked_path),
            "locked_alpha_exact_to_physical": alpha_exact,
        }

    unique_physical = len(physical_hashes) == 4 and len(set(physical_hashes)) == 4
    physical_pass = physical_pass and unique_physical and reopen.get("status") == "PASS_INDEPENDENT_REOPEN_EXACT"

    import_record_path = Path(asset["blender_import_render"]["path"])
    import_hash_current = sha256_file(import_record_path)
    import_record = load(import_record_path)
    glb = import_record["source_glb"]
    glb_path = Path(glb["path"])
    glb_mode = oct(os.stat(glb_path).st_mode & 0o777) if glb_path.is_file() else None
    glb_current_hash = sha256_file(glb_path) if glb_path.is_file() else None
    glb_pass = (
        glb_path.is_file()
        and glb_path.stat().st_size > 0
        and glb_current_hash == glb.get("sha256")
        and glb_mode == glb.get("mode_octal") == "0o444"
        and glb_path.open("rb").read(4) == b"glTF"
        and import_hash_current == asset["blender_import_render"]["sha256"]
    )
    baseline_path = Path(asset["baseline_blend"]["path"])
    baseline_current_hash = sha256_file(baseline_path) if baseline_path.is_file() else None
    baseline_pass = baseline_current_hash == asset["baseline_blend"]["sha256"]

    d0_failed = color_qa["directions"]["d0"]["geometry_gate"] != "PASS"
    validated_adjacent = [
        direction
        for direction in ("d1", "d3")
        if color_qa["directions"][direction]["geometry_gate"] == "PASS"
    ]
    fallback = {
        "required": d0_failed,
        "validated_adjacent_candidates": validated_adjacent,
        "status": "NOT_REQUIRED_D0_PASSED",
    }
    if d0_failed and not validated_adjacent:
        fallback["status"] = "BLOCKED_NO_VALIDATED_ADJACENT_REFERENCE"
    elif d0_failed:
        attempts = []
        for direction in validated_adjacent:
            qa_path = directions / f"color-transfer/d0-from-{direction}-v1/qa.json"
            if qa_path.is_file():
                attempt = load(qa_path)
                attempts.append(
                    {
                        "reference_direction": direction,
                        "qa_path": str(qa_path),
                        "geometry_gate": attempt.get("geometry_gate"),
                        "selection_status": attempt.get("selection_status"),
                        "locked_physical_alpha_iou": attempt.get("locked_physical_alpha_iou"),
                    }
                )
        fallback["attempts"] = attempts
        fallback["status"] = "PERFORMED_PENDING_USER_REVIEW" if attempts else "FAIL_REQUIRED_FALLBACK_MISSING"

    status = "PASS_TECHNICAL_USER_REVIEW_REQUIRED"
    if not (physical_pass and alpha_lock_pass and glb_pass and baseline_pass):
        status = "FAIL_TECHNICAL_VALIDATION"
    if fallback["status"] == "FAIL_REQUIRED_FALLBACK_MISSING":
        status = "FAIL_TECHNICAL_VALIDATION"
    return {
        "asset_id": asset_id,
        "name": asset["name"],
        "status": status,
        "physical": {
            "status": "PASS" if physical_pass else "FAIL",
            "unique_four_hashes": unique_physical,
            "reopen_status": reopen.get("status"),
            "directions": physical_records,
        },
        "immutable_dense_inputs": {
            "source_glb": {
                "path": str(glb_path),
                "bytes": glb_path.stat().st_size if glb_path.is_file() else 0,
                "current_sha256": glb_current_hash,
                "recorded_sha256": glb.get("sha256"),
                "mode": glb_mode,
                "pass": glb_pass,
            },
            "baseline_blend": {
                "path": str(baseline_path),
                "current_sha256": baseline_current_hash,
                "manifest_sha256": asset["baseline_blend"]["sha256"],
                "pass": baseline_pass,
            },
        },
        "color": {
            "state": color_qa.get("state"),
            "raw_geometry_pass_count": raw_pass_count,
            "raw_geometry_fail_count": 4 - raw_pass_count,
            "physical_alpha_exact_count": sum(
                int(record["locked_alpha_exact_to_physical"]) for record in physical_records.values()
            ),
            "physical_alpha_lock_pass": alpha_lock_pass,
            "fallback": fallback,
        },
        "records": {
            "worker_report": file_record(worker_report),
            "skill_provenance": file_record(provenance),
            "color_qa": file_record(color_qa_path),
        },
        "warnings_preserved": asset.get("current_warnings", []),
        "production_approved": False,
        "runtime_adoption_started": False,
    }


def validate_changing_row() -> dict:
    rotations = load(CHANGING_ROW / "physical-rotations.json")
    reopen = load(CHANGING_ROW / "directional/directional-reopen-verification.json")
    selected = load(CHANGING_ROW / "color-transfer/selected-v1/manifest.json")
    records = {}
    hashes = []
    physical_pass = reopen.get("status") in {
        "PASS_INDEPENDENT_REOPEN",
        "PASS_INDEPENDENT_REOPEN_EXACT",
    }
    alpha_pass = True
    for direction in DIRECTIONS:
        rotation = rotations["directions"][direction]
        physical_path = Path(rotation["path"])
        current_hash = sha256_file(physical_path)
        hashes.append(current_hash)
        yaw = rotation["physical_pitch_yaw_roll_deg"][1]
        reopen_path = CHANGING_ROW / f"directional/reopen/{direction}.png"
        reopen_decoded_exact = (
            reopen_path.is_file()
            and Image.open(physical_path).convert("RGBA").size
            == Image.open(reopen_path).convert("RGBA").size
            and ImageChops.difference(
                Image.open(physical_path).convert("RGBA"),
                Image.open(reopen_path).convert("RGBA"),
            ).getbbox()
            is None
        )
        selected_path = Path(selected["directions"][direction]["path"])
        alpha_exact = exact_alpha(physical_path, selected_path)
        alpha_pass = alpha_pass and alpha_exact
        direction_pass = (
            current_hash == rotation["sha256"]
            and yaw == EXPECTED_YAWS[direction]
            and reopen_decoded_exact
        )
        physical_pass = physical_pass and direction_pass
        records[direction] = {
            "yaw_deg": yaw,
            "physical_sha256": current_hash,
            "reopen_path": str(reopen_path),
            "reopen_exact": reopen_decoded_exact,
            "selected_color_path": str(selected_path),
            "selected_alpha_exact_to_physical": alpha_exact,
        }
    unique = len(set(hashes)) == 4
    physical_pass = physical_pass and unique
    return {
        "asset_id": "changing_row",
        "name": "탈의실 열",
        "status": "PASS_TECHNICAL_USER_REVIEW_REQUIRED" if physical_pass and alpha_pass else "FAIL_TECHNICAL_VALIDATION",
        "physical": {"status": "PASS" if physical_pass else "FAIL", "unique_four_hashes": unique, "directions": records},
        "color": {
            "state": selected.get("status"),
            "physical_alpha_exact_count": sum(int(item["selected_alpha_exact_to_physical"]) for item in records.values()),
            "physical_alpha_lock_pass": alpha_pass,
            "fallback": {
                "status": "EXISTING_BOUNDED_FALLBACK_PACKAGE_PENDING_USER_REVIEW",
                "d0": selected.get("d0_fallback"),
                "d2": selected.get("d2_fallback"),
                "d3": selected.get("d3_sequential_fallback"),
            },
        },
        "production_approved": False,
        "runtime_adoption_started": False,
    }


def main() -> None:
    args = parse_args()
    manifest_path = args.asset_manifest.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = load(manifest_path)
    assets = [validate_wave_asset(asset) for asset in manifest["assets"]]
    assets.insert(4, validate_changing_row())

    technical_failures = [asset["asset_id"] for asset in assets if asset["status"].startswith("FAIL")]
    wave_assets = [asset for asset in assets if asset["asset_id"] != "changing_row"]
    raw_pass = sum(asset.get("color", {}).get("raw_geometry_pass_count", 0) for asset in wave_assets)
    alpha_exact = sum(asset.get("color", {}).get("physical_alpha_exact_count", 0) for asset in assets)
    fallback_counts = {}
    for asset in wave_assets:
        status = asset.get("color", {}).get("fallback", {}).get("status", "UNKNOWN")
        fallback_counts[status] = fallback_counts.get(status, 0) + 1

    report = {
        "recorded_at": utc_now(),
        "state": "COLOR_GUIDE_USER_REVIEW",
        "asset_manifest": file_record(manifest_path),
        "asset_count": len(assets),
        "wave_asset_count": len(wave_assets),
        "changing_row_included": True,
        "physical_direction_count": len(assets) * 4,
        "physical_alpha_exact_count": alpha_exact,
        "raw_imagegen_geometry_pass_count_wave19": raw_pass,
        "raw_imagegen_geometry_fail_count_wave19": len(wave_assets) * 4 - raw_pass,
        "fallback_status_counts_wave19": fallback_counts,
        "technical_failures": technical_failures,
        "overall": "PASS_TECHNICAL_USER_REVIEW_REQUIRED" if not technical_failures else "FAIL_TECHNICAL_VALIDATION",
        "assets": assets,
        "production_approved": False,
        "runtime_adoption_started": False,
    }
    json_path = output_dir / "FINAL-VALIDATION.json"
    json_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    lines = [
        "# Physical direction and ImageGen color wave validation",
        "",
        f"- Recorded: {report['recorded_at']}",
        f"- Overall: `{report['overall']}`",
        f"- Assets: {report['asset_count']} (wave 19 + changing_row)",
        f"- Physical directions: {report['physical_direction_count']}",
        f"- Physical-alpha exact locks: {report['physical_alpha_exact_count']}/{report['physical_direction_count']}",
        f"- Raw ImageGen geometry gates, wave 19: {report['raw_imagegen_geometry_pass_count_wave19']} pass / {report['raw_imagegen_geometry_fail_count_wave19']} fail",
        f"- Fallback statuses, wave 19: `{json.dumps(fallback_counts, sort_keys=True)}`",
        "- Production approved: no",
        "- Runtime adoption started: no",
        "",
        "| Asset | Physical | Raw pass | Alpha exact | d0 fallback | State |",
        "|---|---:|---:|---:|---|---|",
    ]
    for asset in assets:
        color = asset.get("color", {})
        lines.append(
            f"| {asset['asset_id']} | {asset.get('physical', {}).get('status', 'FAIL')} | "
            f"{color.get('raw_geometry_pass_count', 'existing')} | "
            f"{color.get('physical_alpha_exact_count', 0)}/4 | "
            f"{color.get('fallback', {}).get('status', 'n/a')} | {asset['status']} |"
        )
    lines.extend(
        [
            "",
            "This is technical evidence only. Geometry, access landmarks, visual fidelity, color choice, footprint fit, and runtime adoption remain user approval gates.",
            "",
        ]
    )
    markdown_path = output_dir / "FINAL-VALIDATION.md"
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({"overall": report["overall"], "json": str(json_path), "markdown": str(markdown_path)}, sort_keys=True))


if __name__ == "__main__":
    main()
