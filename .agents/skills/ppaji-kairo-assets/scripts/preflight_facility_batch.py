#!/usr/bin/env python3
"""Fail-closed local preflight for a Ppaji static-facility batch.

The script performs no provider request and never reads a credential value.  It
verifies approved crop hashes, simulation footprints, render-contract coverage,
and the presence of local execution prerequisites, then writes a JSON record.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def keychain_service_present(service: str) -> bool:
    security = Path("/usr/bin/security")
    if not security.is_file():
        return False
    completed = subprocess.run(
        [str(security), "find-generic-password", "-a", getpass.getuser(), "-s", service],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return completed.returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--adapter", required=True, type=Path)
    parser.add_argument("--keychain-service", default="ppaji-meshy-api")
    args = parser.parse_args()

    workspace = args.workspace.resolve()
    manifest_path = args.manifest.resolve()
    output_path = args.output.resolve()
    adapter = args.adapter.resolve()
    manifest = read_json(manifest_path)
    facility_data = read_json(workspace / "src/data/kairo-facilities.json")
    facilities = facility_data.get("facilities", facility_data)
    render_contract = read_json(workspace / "src/assets/kairo-render-contract.json")
    render_by_sprite = {item["sprite"]: item for item in render_contract["facilities"]}

    records = []
    for item in manifest["items"]:
        facility = facilities.get(item["id"])
        crop = (manifest_path.parent / item["approved_crop"]["path"]).resolve()
        actual_hash = sha256_file(crop) if crop.is_file() else None
        expected_footprint = item["footprint"].lower().replace("×", "x")
        actual_footprint = "missing"
        sprite = None
        if facility:
            actual_footprint = "x".join(str(value) for value in facility["size"])
            sprite = facility["sprite"]
        checks = {
            "approved_crop_exists": crop.is_file(),
            "approved_crop_hash_matches": actual_hash == item["approved_crop"]["sha256"],
            "facility_definition_exists": facility is not None,
            "footprint_matches": actual_footprint == expected_footprint,
            "render_contract_exists": sprite in render_by_sprite,
        }
        records.append(
            {
                "id": item["id"],
                "name": item["name"],
                "footprint": expected_footprint,
                "rotated_footprint": "x".join(reversed(expected_footprint.split("x"))),
                "access_kind": item["access_kind"],
                "approved_crop_path": str(crop),
                "approved_crop_sha256": actual_hash,
                "geometry_lane": "UNASSIGNED_WORKER_PREFLIGHT",
                "checks": checks,
                "status": "PREFLIGHT_READY" if all(checks.values()) else "PREFLIGHT_FAIL",
            }
        )

    prerequisites = {
        "blender_path": shutil.which("blender"),
        "orca_path": shutil.which("orca"),
        "node_path": shutil.which("node"),
        "provider_adapter_path": str(adapter),
        "provider_adapter_exists": adapter.is_file() and adapter.stat().st_size > 0,
        "provider_adapter_sha256": sha256_file(adapter) if adapter.is_file() else None,
        "meshy_keychain_service": args.keychain_service,
        "meshy_keychain_service_present": keychain_service_present(args.keychain_service),
        "credential_value_recorded": False,
    }
    inputs_ready = all(record["status"] == "PREFLIGHT_READY" for record in records)
    execution_ready = bool(
        prerequisites["blender_path"]
        and prerequisites["orca_path"]
        and prerequisites["provider_adapter_exists"]
        and prerequisites["meshy_keychain_service_present"]
    )
    result = {
        "schema_version": 1,
        "recorded_at": utc_now(),
        "workspace": str(workspace),
        "source_manifest": str(manifest_path),
        "source_manifest_sha256": sha256_file(manifest_path),
        "items": records,
        "summary": {
            "item_count": len(records),
            "preflight_ready_count": sum(record["status"] == "PREFLIGHT_READY" for record in records),
            "inputs_ready": inputs_ready,
            "local_execution_prerequisites_ready": execution_ready,
            "paid_request_made": False,
            "live_files_modified": False,
            "status": "BATCH_PREFLIGHT_READY" if inputs_ready and execution_ready else "BATCH_PREFLIGHT_BLOCKED",
        },
        "prerequisites": prerequisites,
        "next_gate": "USER_AUTHORIZATION_TO_CREATE_ORCA_RUN_AND_START_WAVE_0",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))
    return 0 if result["summary"]["status"] == "BATCH_PREFLIGHT_READY" else 1


if __name__ == "__main__":
    raise SystemExit(main())
