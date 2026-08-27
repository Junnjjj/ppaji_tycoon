#!/usr/bin/env python3
"""Run the validated Meshy adapter with a Keychain-backed credential.

The wrapper never prints or records the credential. It requires an exact input
hash, delegates all HTTP/polling/redaction/GLB validation to the existing
provider adapter, renames the verified result per asset, and preserves it as a
read-only original.
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path


DEFAULT_ADAPTER_DIR = Path(
    "/Users/jangjunpyo/Documents/jet-ski-skill-full-pilot-01/codex-output/provider-pipeline"
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def keychain_password(service: str) -> str:
    completed = subprocess.run(
        [
            "/usr/bin/security",
            "find-generic-password",
            "-a",
            getpass.getuser(),
            "-s",
            service,
            "-w",
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    value = completed.stdout.rstrip("\n")
    if not value:
        raise SystemExit("Keychain returned an empty Meshy credential")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--adapter-dir", type=Path, default=DEFAULT_ADAPTER_DIR)
    parser.add_argument("--keychain-service", default="ppaji-meshy-api")
    args = parser.parse_args()

    if not re.fullmatch(r"[a-z0-9_]+", args.asset_id):
        raise SystemExit("asset id must contain only lowercase letters, digits, and underscores")
    source = args.input.resolve()
    output_dir = args.output_dir.resolve()
    adapter_dir = args.adapter_dir.resolve()
    adapter_path = adapter_dir / "provider_pipeline.py"
    if not source.is_file():
        raise SystemExit(f"input is missing: {source}")
    actual_hash = sha256_file(source)
    if actual_hash != args.expected_sha256:
        raise SystemExit(
            f"input SHA-256 mismatch: expected {args.expected_sha256}, got {actual_hash}"
        )
    if not adapter_path.is_file():
        raise SystemExit(f"validated provider adapter is missing: {adapter_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / f"{args.asset_id}-meshy-ultra-dense-baseline.glb"
    result_path = output_dir / "provider-result.json"
    if destination.exists() or result_path.exists():
        raise SystemExit("refusing to overwrite an existing provider result")

    sys.path.insert(0, str(adapter_dir))
    from provider_pipeline import MeshyAdapter, ProviderContext, sha256_file as adapter_sha256  # type: ignore  # noqa: E402

    os.environ["MESHY_API_KEY"] = keychain_password(args.keychain_service)
    try:
        result = MeshyAdapter().run(
            ProviderContext(source, output_dir, poll_seconds=5.0, timeout_seconds=1800)
        )
    finally:
        os.environ.pop("MESHY_API_KEY", None)

    if result.get("status") == "PASS":
        generated = Path(str(result["mesh_path"])).resolve()
        if generated != destination.resolve():
            if destination.exists():
                raise SystemExit(f"refusing to overwrite dense baseline: {destination}")
            generated.rename(destination)
        destination.chmod(0o444)
        result.update(
            {
                "mesh_path": str(destination.resolve()),
                "mesh_sha256": adapter_sha256(destination),
                "mesh_bytes": destination.stat().st_size,
            }
        )

    result.update(
        {
            "asset_id": args.asset_id,
            "credential_source": f"macOS Keychain service {args.keychain_service}",
            "credential_value_recorded": False,
            "adapter_path": str(adapter_path),
            "adapter_sha256": sha256_file(adapter_path),
            "official_api_contract_checked": "2026-08-26",
            "read_only_original_required": True,
        }
    )
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "asset_id": args.asset_id,
                "status": result.get("status"),
                "mesh_path": result.get("mesh_path"),
                "mesh_sha256": result.get("mesh_sha256"),
                "mesh_bytes": result.get("mesh_bytes"),
                "error_type": result.get("error_type"),
                "result_path": str(result_path),
            },
            sort_keys=True,
        )
    )
    return 0 if result.get("status") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
