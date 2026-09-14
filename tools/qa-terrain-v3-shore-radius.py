#!/usr/bin/env python3
"""Technical gate for the review-only radius shoreline pilot."""
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot"
EVIDENCE = OUT / "evidence.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def magenta_pixels(path: Path) -> int:
    image = Image.open(path).convert("RGB")
    return sum(1 for r, g, b in image.getdata() if r > 230 and b > 210 and g < 80)


def main() -> None:
    evidence = json.loads(EVIDENCE.read_text())
    variants = evidence["variants"]
    checks = {}
    failures = []

    checks["review_only"] = evidence.get("liveModified") is False
    checks["rejected_overlay_not_reused"] = evidence.get("rejectedOverlayV1Reused") is False
    checks["console_clean"] = all(not variant["consoleErrors"] for variant in variants.values())
    checks["negative_control_is_axis_aligned"] = variants["r000-negative-control"]["metrics"]["probe"]["curvedSegments"] == 0

    curved = [variants[key]["metrics"]["probe"]["curvedSegments"] for key in ["r050", "r075", "r100"]]
    checks["radius_candidates_are_curved"] = all(value > 0 for value in curved)
    checks["curve_sampling_increases_with_radius"] = curved[0] < curved[1] < curved[2]
    checks["single_continuous_contour"] = all(
        variant["metrics"]["probe"]["contours"] == 1 for variant in variants.values()
    )
    checks["simulation_grid_unchanged"] = all(
        variant["metrics"]["probe"]["simulationGridUnchanged"] is True for variant in variants.values()
    )
    semantic = [variant["setup"]["semanticSamples"] for variant in variants.values()]
    checks["same_semantic_samples"] = all(item == semantic[0] for item in semantic[1:])
    checks["semantic_sample_roles"] = semantic[0] == {
        "peninsulaLand": "lawn",
        "bayWater": "water_edge",
        "deepWater": "water_edge",
    }

    png_rows = {}
    hashes = []
    for key, variant in variants.items():
        path = Path(variant["screenshot"])
        actual_hash = sha256(path)
        hashes.append(actual_hash)
        png_rows[key] = {"path": str(path), "sha256": actual_hash, "magentaPixels": magenta_pixels(path)}
        if actual_hash != variant["sha256"]:
            failures.append(f"{key}: screenshot hash mismatch")
    checks["candidate_images_are_distinct"] = len(set(hashes)) == len(hashes)
    checks["no_magenta_in_runtime"] = all(row["magentaPixels"] == 0 for row in png_rows.values())

    for name, passed in checks.items():
        if not passed:
            failures.append(name)
    status = "PASS_TECHNICAL_USER_REVIEW_PENDING" if not failures else "FAIL_TECHNICAL"
    qa = {
        "schemaVersion": 1,
        "status": status,
        "userVisualGate": "PENDING",
        "productionApproved": False,
        "checks": checks,
        "screenshots": png_rows,
        "failures": failures,
    }
    (OUT / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n")
    lines = [
        "# Terrain v3 rounded shoreline radius QA",
        "",
        f"Status: `{status}`",
        "",
        "This is a review-only visual pilot. Technical PASS does not authorize live adoption.",
        "",
        "## Checks",
        "",
    ]
    lines.extend(f"- {'PASS' if passed else 'FAIL'} — `{name}`" for name, passed in checks.items())
    lines.extend([
        "",
        "## Gate",
        "",
        "- source-v1 materials remain authoritative.",
        "- rejected eight-overlay v1 remains excluded.",
        "- radius 0 is the negative control; R=0.5/0.75/1.0 await user visual selection.",
        "- simulation occupancy, building, click and NPC path semantics remain cell-based.",
    ])
    (OUT / "qa.md").write_text("\n".join(lines) + "\n")
    visual_review = {
        "schemaVersion": 1,
        "status": "PENDING_USER_REVIEW",
        "candidates": ["r050", "r075", "r100"],
        "negativeControl": "r000-negative-control",
        "liveAdoptionAuthorized": False,
    }
    (OUT / "visual-review.json").write_text(json.dumps(visual_review, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": status, "failures": failures, "qa": str(OUT / "qa.json")}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
