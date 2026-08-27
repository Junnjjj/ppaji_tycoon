#!/usr/bin/env python3
"""Copy one built-in ImageGen result into a project run and record provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    record_path = output_dir / "imagegen-execution-record.json"
    if not source.is_file() or not record_path.is_file():
        raise FileNotFoundError(source if not source.is_file() else record_path)
    record = json.loads(record_path.read_text(encoding="utf-8"))
    if record.get("asset_id") != args.asset_id or record.get("imagegen_status") != "NOT_STARTED":
        raise RuntimeError("record asset/status does not permit a first output")
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    destination = raw_dir / f"{args.asset_id}-four-direction-color-guide.png"
    if destination.exists():
        raise FileExistsError(destination)
    shutil.copy2(source, destination)
    with Image.open(destination) as image:
        size = list(image.size)
        mode = image.mode
        bands = list(image.getbands())
    record["imagegen_status"] = "BUILT_IN_RESULT_COPIED_TO_PROJECT"
    record["completed_at"] = utc_now()
    record["built_in_default_output"] = str(source)
    record["raw_output"] = {
        "path": str(destination),
        "sha256": sha256_file(destination),
        "bytes": destination.stat().st_size,
        "size_px": size,
        "mode": mode,
        "bands": bands,
    }
    record_path.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"asset_id": args.asset_id, "raw_output": record["raw_output"]}, sort_keys=True))


if __name__ == "__main__":
    main()
