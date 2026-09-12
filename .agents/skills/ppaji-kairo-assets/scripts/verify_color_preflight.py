#!/usr/bin/env python3
"""Verify an interruption-safe facility color PREFLIGHT.json before ImageGen."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DIRECTIONS = {"d0": 0, "d1": 90, "d2": 180, "d3": 270}


def options() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", required=True, type=Path)
    parser.add_argument(
        "--stage",
        choices=("resume", "waiting-approval", "d0-authorized", "fanout-authorized", "runtime-review"),
        default="resume",
        help="Optional state gate in addition to hash and invariant verification.",
    )
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hashed_paths(value: Any) -> list[tuple[Path, str]]:
    found: list[tuple[Path, str]] = []
    if isinstance(value, dict):
        path_value = value.get("path")
        digest_value = value.get("sha256")
        if isinstance(path_value, str) and isinstance(digest_value, str):
            found.append((Path(path_value), digest_value))
        for child in value.values():
            found.extend(hashed_paths(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(hashed_paths(child))
    return found


def verify(preflight: Path, stage: str) -> dict[str, Any]:
    errors: list[str] = []
    manifest = json.loads(preflight.read_text(encoding="utf-8"))
    if int(manifest.get("schema_version", 0)) < 3:
        errors.append("FAIL_PREFLIGHT_SCHEMA_VERSION")

    hash_rows = hashed_paths(manifest)
    if not hash_rows:
        errors.append("FAIL_PREFLIGHT_HAS_NO_HASHED_INPUTS")
    seen: dict[Path, str] = {}
    checked: list[dict[str, Any]] = []
    for path, expected in hash_rows:
        resolved = path.expanduser().resolve()
        if not path.is_absolute():
            errors.append(f"FAIL_NON_ABSOLUTE_PATH:{path}")
        previous = seen.get(resolved)
        if previous is not None and previous != expected:
            errors.append(f"FAIL_CONFLICTING_EXPECTED_HASH:{resolved}")
            continue
        seen[resolved] = expected
        if not resolved.is_file():
            errors.append(f"FAIL_MISSING_FILE:{resolved}")
            checked.append({"path": str(resolved), "expected": expected, "actual": None})
            continue
        actual = sha256(resolved)
        checked.append({"path": str(resolved), "expected": expected, "actual": actual})
        if actual != expected:
            errors.append(f"FAIL_SHA256_MISMATCH:{resolved}")

    authority = manifest.get("authority", {})
    directions = authority.get("physical_directions", {})
    if set(directions) != set(DIRECTIONS):
        errors.append("FAIL_PHYSICAL_DIRECTION_SET")
    else:
        for direction, yaw in DIRECTIONS.items():
            if directions[direction].get("yaw_deg") != yaw:
                errors.append(f"FAIL_ROOT_YAW:{direction}")

    camera = authority.get("fixed_camera", {})
    if str(camera.get("projection", "")).upper() != "ORTHOGRAPHIC":
        errors.append("FAIL_CAMERA_PROJECTION")
    if camera.get("game_yaw_deg") != 45:
        errors.append("FAIL_CAMERA_GAME_YAW")
    if camera.get("optical_pitch_down_deg") != 30:
        errors.append("FAIL_CAMERA_PITCH")
    if camera.get("roll_deg") != 0:
        errors.append("FAIL_CAMERA_ROLL")

    lineage = manifest.get("lineage_policy", {})
    if lineage.get("inherit_colored_pixels") is not False:
        errors.append("FAIL_OLD_COLOR_PIXEL_INHERITANCE_NOT_FORBIDDEN")
    if lineage.get("inherit_geometry_or_alpha") is not False:
        errors.append("FAIL_OLD_COLOR_GEOMETRY_INHERITANCE_NOT_FORBIDDEN")

    for field in ("live_files_modified", "runtime_adoption_started", "production_approved"):
        if manifest.get(field) is not False:
            errors.append(f"FAIL_REVIEW_ONLY_INVARIANT:{field}")

    gates = manifest.get("gates", {})
    provider = manifest.get("provider", {})
    call_count = provider.get("call_count")
    if not isinstance(call_count, int) or call_count < 0:
        errors.append("FAIL_PROVIDER_CALL_COUNT")
    if call_count == 0 and provider.get("calls_started") is not False:
        errors.append("FAIL_ZERO_CALL_STATE")
    if gates.get("d1_d3_imagegen_authorized") is True and gates.get("d0_strict_gate") != "PASS":
        errors.append("FAIL_D1_D3_AUTHORIZED_BEFORE_D0_PASS")

    if stage == "waiting-approval":
        if manifest.get("state") != "WAITING_ROOF_PROPORTION_USER_APPROVAL":
            errors.append("FAIL_WAITING_APPROVAL_STATE")
        if gates.get("roof_proportion_user_approval") != "UNREVIEWED":
            errors.append("FAIL_WAITING_APPROVAL_GATE")
        if gates.get("d0_imagegen_authorized") is not False:
            errors.append("FAIL_D0_AUTHORIZED_BEFORE_USER_APPROVAL")
        if gates.get("d1_d3_imagegen_authorized") is not False:
            errors.append("FAIL_FANOUT_AUTHORIZED_BEFORE_USER_APPROVAL")
        if call_count != 0:
            errors.append("FAIL_IMAGEGEN_CALLED_BEFORE_USER_APPROVAL")
    elif stage == "d0-authorized":
        if gates.get("roof_proportion_user_approval") != "APPROVED":
            errors.append("FAIL_MISSING_ROOF_USER_APPROVAL")
        if gates.get("d0_imagegen_authorized") is not True:
            errors.append("FAIL_D0_NOT_AUTHORIZED")
        if gates.get("d1_d3_imagegen_authorized") is not False:
            errors.append("FAIL_FANOUT_OPEN_BEFORE_D0_PASS")
    elif stage == "fanout-authorized":
        if gates.get("roof_proportion_user_approval") != "APPROVED":
            errors.append("FAIL_MISSING_ROOF_USER_APPROVAL")
        if gates.get("d0_strict_gate") != "PASS":
            errors.append("FAIL_D0_STRICT_GATE_NOT_PASS")
        if gates.get("d0_imagegen_authorized") is not False:
            errors.append("FAIL_D0_RETRY_STILL_AUTHORIZED")
        if gates.get("d1_d3_imagegen_authorized") is not True:
            errors.append("FAIL_FANOUT_NOT_AUTHORIZED")
        if not isinstance(call_count, int) or call_count < 1:
            errors.append("FAIL_NO_ACCEPTED_D0_CALL")
    elif stage == "runtime-review":
        if manifest.get("state") != "RUNTIME_FIT_USER_REVIEW":
            errors.append("FAIL_RUNTIME_REVIEW_STATE")
        if gates.get("d0_strict_gate") != "PASS":
            errors.append("FAIL_D0_STRICT_GATE_NOT_PASS")
        if gates.get("d0_imagegen_authorized") is not False:
            errors.append("FAIL_D0_CALL_STILL_AUTHORIZED")
        if gates.get("d1_d3_imagegen_authorized") is not False:
            errors.append("FAIL_FANOUT_CALLS_STILL_AUTHORIZED")
        if gates.get("runtime_map_review") != "PASS_CURRENT_WORKTREE":
            errors.append("FAIL_CURRENT_WORKTREE_MAP_REVIEW")
        if not isinstance(call_count, int) or call_count < 4:
            errors.append("FAIL_DIRECTION_CALL_COUNT_TOO_SMALL")

    return {
        "schema_version": 1,
        "preflight": str(preflight.resolve()),
        "requested_stage": stage,
        "asset_id": manifest.get("asset_id"),
        "state": manifest.get("state"),
        "checked_unique_files": len(seen),
        "checked_hash_records": len(hash_rows),
        "provider_call_count": call_count,
        "d0_imagegen_authorized": gates.get("d0_imagegen_authorized"),
        "d1_d3_imagegen_authorized": gates.get("d1_d3_imagegen_authorized"),
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "hash_checks": checked,
    }


def main() -> None:
    args = options()
    path = args.preflight.expanduser().resolve()
    result = verify(path, args.stage)
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    raise SystemExit(0 if result["status"] == "PASS" else 1)


if __name__ == "__main__":
    main()
