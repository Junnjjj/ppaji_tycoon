#!/usr/bin/env python3
"""Apply aligned color chroma to physical luminance/alpha without geometry edits."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--physical", required=True, type=Path)
    parser.add_argument("--aligned-color", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--blur-radius", type=float, default=1.5)
    parser.add_argument("--chroma-strength", type=float, default=0.88)
    args = parser.parse_args()
    if not 0.0 <= args.chroma_strength <= 1.0:
        raise ValueError("chroma strength must be within [0, 1]")

    physical_path = args.physical.resolve()
    color_path = args.aligned_color.resolve()
    physical = Image.open(physical_path).convert("RGBA")
    color = Image.open(color_path).convert("RGBA")
    if physical.size != color.size:
        raise ValueError(f"canvas mismatch: physical={physical.size}, color={color.size}")

    neutral = Image.new("RGBA", physical.size, (128, 128, 128, 255))
    neutral.alpha_composite(color)
    blurred = neutral.convert("RGB").filter(ImageFilter.GaussianBlur(args.blur_radius))
    physical_y, _, _ = physical.convert("RGB").convert("YCbCr").split()
    _, source_cb, source_cr = blurred.convert("YCbCr").split()
    strength = args.chroma_strength
    source_cb = source_cb.point(lambda value: round(128 + (value - 128) * strength))
    source_cr = source_cr.point(lambda value: round(128 + (value - 128) * strength))
    rgb = Image.merge("YCbCr", (physical_y, source_cb, source_cr)).convert("RGB")
    result = Image.merge("RGBA", (*rgb.split(), physical.getchannel("A")))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, optimize=True)
    alpha_exact = ImageChops.difference(physical.getchannel("A"), result.getchannel("A")).getbbox() is None
    if not alpha_exact or result.size != physical.size:
        raise RuntimeError("physical alpha/canvas invariant failed")
    payload = {
        "schema_version": 1,
        "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "operation": "deterministic_low_frequency_chroma_glaze",
        "physical": {"path": str(physical_path), "sha256": sha256(physical_path)},
        "aligned_color_evidence": {"path": str(color_path), "sha256": sha256(color_path)},
        "output": {"path": str(args.output.resolve()), "sha256": sha256(args.output.resolve())},
        "blur_radius_px": args.blur_radius,
        "chroma_strength": args.chroma_strength,
        "physical_luminance_authority": True,
        "physical_alpha_byte_exact": True,
        "geometry_transform_used": False,
        "generative_cleanup_used": False,
        "provider_call_used": False,
    }
    args.report.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
