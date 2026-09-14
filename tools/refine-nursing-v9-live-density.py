#!/usr/bin/env python3
"""Preserve approved nursing-v9 detail by deriving D=2 from the D=4 runtime source."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_REL = Path(
    "assets/generated/kairo-v4-simple-pilot/nursing/nursing-2x2-remesh-goal-v1/"
    "physical-v1/semantic-repair-v9/color-transfer/strict-v9"
)
CANVAS = [72, 60]


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-worktree", type=Path, required=True)
    args = parser.parse_args()
    source_root = args.source_worktree.resolve() / SOURCE_REL
    approval_path = source_root / "LIVE-ADOPTION-APPROVAL.json"
    qa_path = source_root / "qa-v2/qa.json"
    runtime_path = source_root / "qa-v2/runtime-review.json"
    approval = read_json(approval_path)
    qa = read_json(qa_path)
    runtime = read_json(runtime_path)
    if (
        approval.get("decision") != "APPROVE_NURSING_2X2_COLOR_MAP_FIT_AND_LIVE_REPLACEMENT"
        or approval.get("approved_footprint") != [2, 2]
        or approval.get("approved_logical_canvas") != CANVAS
    ):
        raise ValueError("nursing-v9 approval is not exact")
    if qa.get("state") != "STRICT_COLOR_GUIDE_USER_REVIEW" or qa.get("failures"):
        raise ValueError("nursing-v9 strict QA failed")
    if not all(qa.get("gates", {}).values()):
        raise ValueError("nursing-v9 strict QA gate is false")
    if (
        runtime.get("footprint") != [2, 2]
        or runtime.get("proposed_canvas") != CANVAS
        or runtime.get("all_retained_foreground_exact") is not True
        or runtime.get("zero_clipping") is not True
    ):
        raise ValueError("nursing-v9 runtime contract changed")

    records: list[dict[str, Any]] = []
    target_root = ROOT / "assets/generated/kairo"
    for direction in ("d0", "d1", "d2", "d3"):
        direction_record = runtime["directions"][direction]
        source = Path(direction_record["density_path"])
        if not source.is_file() or sha256(source) != direction_record["density_sha256"]:
            raise ValueError(f"nursing/{direction}: density-4 source hash mismatch")
        with Image.open(source) as opened:
            density_four = opened.convert("RGBA")
        if list(density_four.size) != [CANVAS[0] * 4, CANVAS[1] * 4]:
            raise ValueError(f"nursing/{direction}: density-4 size changed")
        target = target_root / f"facility__nursing__{direction}.png"
        density_four.resize((CANVAS[0] * 2, CANVAS[1] * 2), Image.Resampling.NEAREST).save(
            target,
            optimize=True,
        )
        records.append(
            {
                "direction": direction,
                "density_4_source_sha256": sha256(source),
                "live_density_2_sha256": sha256(target),
            }
        )

    report = {
        "schema_version": 1,
        "state": "LIVE_SOURCE_REFINED_PENDING_ATLAS_VERIFICATION",
        "asset": "nursing",
        "footprint": [2, 2],
        "logical_canvas": CANVAS,
        "change": "derive live D=2 directly from approved D=4 instead of upscaling logical D=1",
        "approval_sha256": sha256(approval_path),
        "strict_qa_sha256": sha256(qa_path),
        "runtime_review_sha256": sha256(runtime_path),
        "directions": records,
    }
    report_path = ROOT / "docs/assets/adoption/nursing-v9-density2-refinement.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": report["state"], "report": str(report_path)}))


if __name__ == "__main__":
    main()
