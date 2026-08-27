#!/usr/bin/env python3
"""Compose fail-closed, d0-only evidence for an unreviewed Meshy baseline."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat


GEOMETRY_STATE = "DENSE_BASELINE_UNREVIEWED"
YAW_VALUES = (0, 90, 180, 270)
ALPHA_THRESHOLD = 8
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
IMAGE_SUFFIXES = {".png", ".webp", ".jpg", ".jpeg"}
ACCESS_WORDS = ("access", "portal", "door", "opening", "entrance", "entry", "exit")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compose calibration, same-scale, silhouette, and explicit landmark "
            "evidence for one unreviewed Meshy dense d0 render."
        )
    )
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--approved-image", required=True, type=Path)
    parser.add_argument("--approved-sha256", required=True)
    parser.add_argument("--render", required=True, type=Path)
    parser.add_argument("--import-metadata", required=True, type=Path)
    parser.add_argument("--reopen-verification", required=True, type=Path)
    parser.add_argument("--probe-dir", required=True, type=Path)
    parser.add_argument("--source-yaw-selection", required=True, type=Path)
    parser.add_argument("--wave0-preflight", required=True, type=Path)
    parser.add_argument("--landmarks-json", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def fail(message: str) -> None:
    raise SystemExit(message)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        fail(f"{label} is missing or is not a file: {resolved}")
    return resolved


def read_json(path: Path, label: str) -> dict[str, Any]:
    resolved = require_file(path, label)
    try:
        payload = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        fail(f"cannot read {label} as JSON: {resolved}: {error}")
    if not isinstance(payload, dict):
        fail(f"{label} must contain a JSON object: {resolved}")
    return payload


def require_asset_id(payload: dict[str, Any], expected: str, label: str) -> None:
    observed = payload.get("asset_id")
    if observed is not None and observed != expected:
        fail(f"{label} asset_id mismatch: expected {expected!r}, got {observed!r}")


def checks_pass(payload: dict[str, Any], label: str, *, required: bool) -> None:
    checks = payload.get("checks")
    if checks is None:
        if required:
            fail(f"{label} is missing a checks object")
        return
    if not isinstance(checks, dict) or not checks:
        fail(f"{label} checks must be a non-empty object")
    failures = [
        str(key)
        for key, value in checks.items()
        if value is not True and str(value).upper() not in {"PASS", "PASSED"}
    ]
    if failures:
        fail(f"{label} has non-PASS checks: {', '.join(failures)}")


def require_pass_status(payload: dict[str, Any], label: str) -> None:
    status = str(payload.get("status", ""))
    if status != "PASS" and not status.startswith("PASS_"):
        fail(f"{label} status must be PASS, got {status or '<missing>'!r}")


def require_geometry_state(payload: dict[str, Any], label: str) -> None:
    state = payload.get("geometry_state", payload.get("state"))
    if state != GEOMETRY_STATE:
        fail(f"{label} geometry state must be {GEOMETRY_STATE}, got {state!r}")


def declared_hash_records(payload: Any, base_dir: Path) -> list[tuple[Path, str, str]]:
    """Collect conventional {path,sha256} and foo/foo_sha256 records."""
    records: list[tuple[Path, str, str]] = []

    def add(path_value: Any, hash_value: Any, source: str) -> None:
        if not isinstance(path_value, str) or not isinstance(hash_value, str):
            return
        if not SHA256_RE.fullmatch(hash_value):
            fail(f"invalid SHA-256 in {source}: {hash_value!r}")
        path = Path(path_value).expanduser()
        if not path.is_absolute():
            path = base_dir / path
        records.append((path.resolve(), hash_value.lower(), source))

    def walk(node: Any, where: str) -> None:
        if isinstance(node, dict):
            add(node.get("path"), node.get("sha256"), f"{where}.path/sha256")
            for key, value in node.items():
                if key.endswith("_sha256"):
                    stem = key[: -len("_sha256")]
                    add(node.get(stem), value, f"{where}.{stem}/{key}")
            for key, value in node.items():
                walk(value, f"{where}.{key}")
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{where}[{index}]")

    walk(payload, "root")
    return records


def require_declared_file_hash(
    path: Path,
    payload: dict[str, Any],
    metadata_path: Path,
    label: str,
) -> str:
    actual = sha256_file(path)
    matches = [
        (expected, source)
        for declared_path, expected, source in declared_hash_records(payload, metadata_path.parent)
        if declared_path == path.resolve()
    ]
    if not matches:
        fail(f"{label} does not declare a SHA-256 for {path}")
    for expected, source in matches:
        if expected != actual:
            fail(f"{label} hash mismatch at {source}: expected {expected}, got {actual}")
    return actual


def validate_wave0(
    payload: dict[str, Any], path: Path, asset_id: str, approved_path: Path
) -> None:
    require_asset_id(payload, asset_id, "wave0 preflight")
    if payload.get("status") not in {"PREFLIGHT_READY", "PASS", "PASS_PREFLIGHT_READY"}:
        fail(f"wave0 preflight is not ready: {payload.get('status')!r}")
    checks_pass(payload, "wave0 preflight", required=False)
    source = payload.get("approved_source")
    if not isinstance(source, dict):
        fail("wave0 preflight is missing approved_source")
    expected = source.get("expected_sha256")
    observed = next(
        (
            source[name]
            for name in ("actual_sha256", "observed_sha256", "recomputed_sha256")
            if name in source
        ),
        None,
    )
    if not isinstance(expected, str) or not SHA256_RE.fullmatch(expected):
        fail("wave0 preflight approved_source.expected_sha256 is invalid")
    if observed != expected or source.get("hash_matches") is not True:
        fail("wave0 preflight approved-source hash metadata is not PASS")
    declared_source = source.get("path")
    if isinstance(declared_source, str):
        candidate = Path(declared_source).expanduser()
        if not candidate.is_absolute():
            candidate = path.parent / candidate
        candidate = candidate.resolve()
        if candidate.is_file() and sha256_file(candidate) != expected.lower():
            fail(f"wave0 approved source no longer matches its declared hash: {candidate}")
        if candidate == approved_path and sha256_file(approved_path) != expected.lower():
            fail("approved image does not match wave0 approved_source hash")
    scope = payload.get("scope", {})
    if not isinstance(scope, dict):
        fail("wave0 preflight scope must be an object")
    forbidden_true = [
        key
        for key in (
            "meshy_call_made",
            "imagegen_call_made",
            "sprite_extraction_run",
            "live_adoption_started",
            "live_files_modified",
            "atlas_modified",
        )
        if scope.get(key) is True
    ]
    if forbidden_true:
        fail(f"wave0 preflight records forbidden later work: {', '.join(forbidden_true)}")


def validate_import(payload: dict[str, Any], asset_id: str) -> None:
    require_asset_id(payload, asset_id, "import metadata")
    require_geometry_state(payload, "import metadata")
    checks_pass(payload, "import metadata", required=False)
    forbidden = payload.get("forbidden_work")
    if not isinstance(forbidden, dict) or not forbidden:
        fail("import metadata is missing forbidden_work declarations")
    started = [key for key, value in forbidden.items() if value is not False]
    if started:
        fail(f"import metadata does not keep all later stages false: {', '.join(started)}")


def validate_reopen(payload: dict[str, Any], asset_id: str) -> None:
    require_asset_id(payload, asset_id, "reopen verification")
    require_pass_status(payload, "reopen verification")
    require_geometry_state(payload, "reopen verification")
    checks_pass(payload, "reopen verification", required=True)
    if payload.get("stop_gate") not in {None, GEOMETRY_STATE}:
        fail(f"reopen verification has an invalid stop_gate: {payload.get('stop_gate')!r}")


def find_selected_yaw(payload: dict[str, Any]) -> int:
    candidates: list[Any] = []
    for key in ("selected_source_yaw_deg", "selected_yaw_deg", "source_yaw_deg", "yaw_deg"):
        candidates.append(payload.get(key))
    selected = payload.get("selected")
    if isinstance(selected, dict):
        candidates.extend(selected.get(key) for key in ("source_yaw_deg", "yaw_deg"))
    for candidate in candidates:
        if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
            yaw = int(candidate) % 360
            if float(candidate).is_integer() and yaw in YAW_VALUES:
                return yaw
    fail("source-yaw selection must declare one selected yaw in 0/90/180/270")
    raise AssertionError("unreachable")


def yaw_from_name(path: Path) -> int | None:
    stem = path.stem.lower()
    matches = re.findall(r"(?<!\d)(000|090|180|270|0|90)(?!\d)", stem)
    if not matches:
        return None
    yaw = int(matches[-1])
    return yaw if yaw in YAW_VALUES else None


def find_probe_files(probe_dir: Path) -> dict[int, Path]:
    directory = probe_dir.expanduser().resolve()
    if not directory.is_dir():
        fail(f"probe directory is missing: {directory}")
    found: dict[int, list[Path]] = {yaw: [] for yaw in YAW_VALUES}
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
            yaw = yaw_from_name(path)
            if yaw is not None:
                found[yaw].append(path.resolve())
    ambiguous = {yaw: paths for yaw, paths in found.items() if len(paths) != 1}
    if ambiguous:
        summary = ", ".join(f"{yaw}={len(paths)}" for yaw, paths in ambiguous.items())
        fail(f"probe directory must contain exactly one image for each source yaw: {summary}")
    return {yaw: paths[0] for yaw, paths in found.items()}


def probe_hash_for_yaw(payload: Any, yaw: int, path: Path, base_dir: Path) -> str | None:
    for declared_path, expected, _ in declared_hash_records(payload, base_dir):
        if declared_path == path:
            return expected

    yaw_keys = {str(yaw), f"{yaw:03d}", f"yaw_{yaw}", f"yaw_{yaw:03d}"}

    def walk(node: Any) -> str | None:
        if isinstance(node, dict):
            node_yaw = node.get("yaw_deg", node.get("source_yaw_deg"))
            if isinstance(node_yaw, (int, float)) and int(node_yaw) % 360 == yaw:
                value = node.get("sha256")
                if isinstance(value, str) and SHA256_RE.fullmatch(value):
                    return value.lower()
            for key, value in node.items():
                if str(key).lower() in yaw_keys:
                    if isinstance(value, str) and SHA256_RE.fullmatch(value):
                        return value.lower()
                    if isinstance(value, dict):
                        digest = value.get("sha256")
                        if isinstance(digest, str) and SHA256_RE.fullmatch(digest):
                            return digest.lower()
                result = walk(value)
                if result:
                    return result
        elif isinstance(node, list):
            for value in node:
                result = walk(value)
                if result:
                    return result
        return None

    return walk(payload)


def load_rgba(path: Path, label: str) -> Image.Image:
    try:
        with Image.open(path) as source:
            source.load()
            return source.convert("RGBA")
    except (OSError, ValueError) as error:
        fail(f"cannot read {label} image {path}: {error}")
    raise AssertionError("unreachable")


def binary_alpha(image: Image.Image, label: str) -> Image.Image:
    mask = image.getchannel("A").point(
        lambda value: 255 if value >= ALPHA_THRESHOLD else 0, mode="L"
    )
    bbox = mask.getbbox()
    if bbox is None:
        fail(f"{label} has no foreground alpha")
    if bbox == (0, 0, image.width, image.height) and ImageStat.Stat(mask).mean[0] == 255:
        fail(f"{label} has no transparent background for silhouette evidence")
    return mask


def opaque_count(mask: Image.Image) -> int:
    return int(round(ImageStat.Stat(mask).sum[0] / 255.0))


def translate_mask(mask: Image.Image, dx: int, dy: int) -> Image.Image:
    shifted = Image.new("L", mask.size, 0)
    shifted.paste(mask, (dx, dy))
    return shifted


def get_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    names = (
        ("DejaVuSans-Bold.ttf", "Arial Bold.ttf")
        if bold
        else ("DejaVuSans.ttf", "Arial.ttf")
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


def on_background(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    background = Image.new("RGBA", image.size, color + (255,))
    background.alpha_composite(image)
    return background.convert("RGB")


def fit_panel(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    fitted = image.copy()
    fitted.thumbnail(size, Image.Resampling.LANCZOS)
    panel = Image.new("RGBA", size, (229, 234, 239, 255))
    panel.alpha_composite(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    return panel


def compose_probe_sheet(
    probes: dict[int, Image.Image], selected_yaw: int, output: Path
) -> None:
    panel_w = panel_h = 512
    header_h, label_h = 100, 54
    sheet = Image.new("RGB", (panel_w * 2, header_h + (panel_h + label_h) * 2), (218, 224, 230))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((0, 0, sheet.width, header_h), fill=(112, 24, 30))
    draw.text((24, 16), "CALIBRATION ONLY", fill="white", font=get_font(34, True))
    draw.text(
        (24, 58),
        "SOURCE-YAW PROBES — NOT PHYSICAL d0–d3 DIRECTION EVIDENCE",
        fill=(255, 222, 222),
        font=get_font(21, True),
    )
    for index, yaw in enumerate(YAW_VALUES):
        x = (index % 2) * panel_w
        y = header_h + (index // 2) * (panel_h + label_h)
        sheet.paste(fit_panel(probes[yaw], (panel_w, panel_h)).convert("RGB"), (x, y + label_h))
        selected = yaw == selected_yaw
        draw.rectangle(
            (x, y, x + panel_w, y + label_h),
            fill=(35, 112, 65) if selected else (25, 33, 43),
        )
        label = f"SOURCE YAW {yaw}° / CALIBRATION PROBE"
        if selected:
            label += " / SELECTED"
        draw.text((x + 16, y + 14), label, fill="white", font=get_font(20, True))
        draw.rectangle(
            (x, y, x + panel_w - 1, y + panel_h + label_h - 1),
            outline=(92, 222, 126) if selected else (72, 82, 94),
            width=5 if selected else 2,
        )
    sheet.save(output, optimize=True)


def compose_same_scale(
    approved: Image.Image,
    render: Image.Image,
    output: Path,
    footer: str,
) -> tuple[int, int]:
    header_h, footer_h = 104, 72
    width, height = approved.size
    sheet = Image.new("RGB", (width * 2, header_h + height + footer_h), (230, 235, 240))
    sheet.paste(on_background(approved, (245, 247, 249)), (0, header_h))
    sheet.paste(on_background(render, (230, 235, 240)), (width, header_h))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((0, 0, sheet.width, header_h), fill=(22, 29, 38))
    draw.text((24, 16), "APPROVED SOURCE vs DENSE d0", fill="white", font=get_font(30, True))
    draw.text(
        (24, 58),
        "SAME CANVAS / NO RESCALE / D0 GEOMETRY UNREVIEWED",
        fill=(190, 208, 222),
        font=get_font(21),
    )
    draw.rectangle((0, header_h, width, header_h + 44), fill=(250, 250, 250))
    draw.rectangle((width, header_h, width * 2, header_h + 44), fill=(220, 229, 236))
    draw.text((16, header_h + 10), "APPROVED / ART AUTHORITY", fill=(20, 35, 48), font=get_font(19, True))
    draw.text((width + 16, header_h + 10), "DENSE d0 / UNREVIEWED", fill=(20, 35, 48), font=get_font(19, True))
    draw.line((width, header_h, width, header_h + height), fill=(55, 68, 80), width=3)
    draw.rectangle((0, header_h + height, sheet.width, sheet.height), fill=(22, 29, 38))
    draw.text((24, header_h + height + 22), footer, fill=(220, 229, 236), font=get_font(18))
    sheet.save(output, optimize=True)
    return header_h, footer_h


def compose_overlay(
    approved_mask: Image.Image, render_mask: Image.Image, output: Path
) -> None:
    both = ImageChops.multiply(approved_mask, render_mask)
    approved_only = ImageChops.subtract(approved_mask, both)
    render_only = ImageChops.subtract(render_mask, both)
    visual = Image.new("RGB", approved_mask.size, (31, 38, 46))
    visual.paste((220, 235, 238), mask=both)
    visual.paste((0, 220, 220), mask=approved_only)
    visual.paste((236, 72, 72), mask=render_only)
    header_h = 60
    sheet = Image.new("RGB", (visual.width, visual.height + header_h), (22, 29, 38))
    sheet.paste(visual, (0, header_h))
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (18, 17),
        "CYAN source-only | RED dense-only | LIGHT overlap",
        fill="white",
        font=get_font(21, True),
    )
    sheet.save(output, optimize=True)


def coordinate(entry: dict[str, Any], keys: Iterable[str], label: str) -> list[float]:
    for key in keys:
        value = entry.get(key)
        if (
            isinstance(value, list)
            and len(value) == 2
            and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value)
        ):
            return [float(value[0]), float(value[1])]
    fail(f"landmark {label} must be an explicit [x,y] coordinate pair")
    raise AssertionError("unreachable")


def normalize_landmarks(
    payload: dict[str, Any], asset_id: str, approved_size: tuple[int, int], render_size: tuple[int, int]
) -> list[dict[str, Any]]:
    require_asset_id(payload, asset_id, "landmarks JSON")
    raw = payload.get("landmarks", payload.get("entries"))
    if not isinstance(raw, list) or len(raw) < 4:
        fail("landmarks JSON must contain at least four landmark entries")
    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_numbers: set[int] = set()
    access_present = False
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            fail(f"landmark entry {index} must be an object")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not identifier.strip() or identifier in seen_ids:
            fail(f"landmark entry {index} has a missing or duplicate id")
        number = item.get("number", index)
        if not isinstance(number, int) or isinstance(number, bool) or number < 1 or number in seen_numbers:
            fail(f"landmark {identifier!r} has an invalid or duplicate number")
        approved_xy = coordinate(item, ("approved_xy", "source_xy", "concept_xy"), f"{identifier}.approved_xy")
        render_xy = coordinate(item, ("render_xy", "dense_xy", "physical_xy"), f"{identifier}.render_xy")
        for label, xy, size in (
            ("approved", approved_xy, approved_size),
            ("render", render_xy, render_size),
        ):
            if not (0 <= xy[0] < size[0] and 0 <= xy[1] < size[1]):
                fail(f"landmark {identifier!r} {label} coordinate is outside {size}: {xy}")
        semantic = item.get("semantic", item.get("role", ""))
        access_role = item.get("access_role", "")
        if semantic is not None and not isinstance(semantic, str):
            fail(f"landmark {identifier!r} semantic must be a string")
        if access_role is not None and not isinstance(access_role, str):
            fail(f"landmark {identifier!r} access_role must be a string")
        semantic_text = str(semantic or "").lower()
        access_text = str(access_role or "").lower()
        if any(word in semantic_text for word in ACCESS_WORDS) or (
            access_text not in {"", "none", "not_applicable", "n/a"}
        ):
            access_present = True
        normalized.append(
            {
                "number": number,
                "id": identifier,
                "semantic": semantic or None,
                "access_role": access_role or None,
                "approved_xy": approved_xy,
                "render_xy": render_xy,
                "expected_count": item.get("expected_count"),
                "observation": item.get("observation"),
                "status": "UNREVIEWED_D0_CORRESPONDENCE",
            }
        )
        seen_ids.add(identifier)
        seen_numbers.add(number)
    if not access_present:
        fail("landmarks JSON must include at least one explicit access/portal semantic")
    return sorted(normalized, key=lambda item: int(item["number"]))


def annotate_marker(
    draw: ImageDraw.ImageDraw,
    offset_x: int,
    offset_y: int,
    number: int,
    xy: list[float],
    color: tuple[int, int, int],
) -> None:
    x = offset_x + round(xy[0])
    y = offset_y + round(xy[1])
    radius = 16
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline="white", width=3)
    text = str(number)
    bbox = draw.textbbox((0, 0), text, font=get_font(17, True))
    draw.text(
        (x - (bbox[2] - bbox[0]) / 2, y - (bbox[3] - bbox[1]) / 2 - 1),
        text,
        fill="white",
        font=get_font(17, True),
    )


def compose_landmark_sheet(
    approved: Image.Image,
    render: Image.Image,
    landmarks: list[dict[str, Any]],
    output: Path,
) -> None:
    header_h, footer_h = 104, 72
    width, height = approved.size
    sheet = Image.new("RGB", (width * 2, header_h + height + footer_h), (230, 235, 240))
    sheet.paste(on_background(approved, (245, 247, 249)), (0, header_h))
    sheet.paste(on_background(render, (230, 235, 240)), (width, header_h))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle((0, 0, sheet.width, header_h), fill=(22, 29, 38))
    draw.text((24, 16), "NUMBERED d0 LANDMARK CORRESPONDENCE", fill="white", font=get_font(29, True))
    draw.text(
        (24, 58),
        "EXPLICIT APPROVED↔DENSE COORDINATE PAIRS / USER REVIEW STILL REQUIRED",
        fill=(190, 208, 222),
        font=get_font(20),
    )
    for item in landmarks:
        annotate_marker(draw, 0, header_h, int(item["number"]), item["approved_xy"], (0, 145, 180))
        annotate_marker(draw, width, header_h, int(item["number"]), item["render_xy"], (45, 140, 82))
    draw.line((width, header_h, width, header_h + height), fill=(55, 68, 80), width=3)
    draw.rectangle((0, header_h + height, sheet.width, sheet.height), fill=(22, 29, 38))
    draw.text(
        (24, header_h + height + 22),
        f"{len(landmarks)} paired landmarks / cyan=approved / green=dense d0 / diagnostic only",
        fill=(220, 229, 236),
        font=get_font(18),
    )
    sheet.save(output, optimize=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    asset_id = args.asset_id.strip()
    if not asset_id:
        fail("--asset-id must not be empty")
    if not SHA256_RE.fullmatch(args.approved_sha256):
        fail("--approved-sha256 must be exactly 64 hexadecimal characters")

    approved_path = require_file(args.approved_image, "approved image")
    render_path = require_file(args.render, "dense d0 render")
    import_path = require_file(args.import_metadata, "import metadata")
    reopen_path = require_file(args.reopen_verification, "reopen verification")
    selection_path = require_file(args.source_yaw_selection, "source-yaw selection")
    wave0_path = require_file(args.wave0_preflight, "wave0 preflight")
    landmarks_path = require_file(args.landmarks_json, "landmarks JSON")

    approved_hash = sha256_file(approved_path)
    if approved_hash != args.approved_sha256.lower():
        fail(
            f"approved image SHA-256 mismatch: expected {args.approved_sha256.lower()}, got {approved_hash}"
        )

    import_metadata = read_json(import_path, "import metadata")
    reopen_metadata = read_json(reopen_path, "reopen verification")
    yaw_selection = read_json(selection_path, "source-yaw selection")
    wave0 = read_json(wave0_path, "wave0 preflight")
    landmark_input = read_json(landmarks_path, "landmarks JSON")

    validate_import(import_metadata, asset_id)
    validate_reopen(reopen_metadata, asset_id)
    require_asset_id(yaw_selection, asset_id, "source-yaw selection")
    require_pass_status(yaw_selection, "source-yaw selection")
    checks_pass(yaw_selection, "source-yaw selection", required=False)
    selected_yaw = find_selected_yaw(yaw_selection)
    validate_wave0(wave0, wave0_path, asset_id, approved_path)

    render_hash = require_declared_file_hash(render_path, import_metadata, import_path, "import metadata")
    require_declared_file_hash(render_path, reopen_metadata, reopen_path, "reopen verification")

    probe_paths = find_probe_files(args.probe_dir)
    probe_hashes: dict[int, str] = {}
    for yaw, path in probe_paths.items():
        actual = sha256_file(path)
        expected = probe_hash_for_yaw(yaw_selection, yaw, path, selection_path.parent)
        if expected is None:
            fail(f"source-yaw selection does not declare a SHA-256 for yaw {yaw}: {path}")
        if actual != expected:
            fail(f"source-yaw probe hash mismatch for yaw {yaw}: expected {expected}, got {actual}")
        probe_hashes[yaw] = actual

    approved = load_rgba(approved_path, "approved")
    render = load_rgba(render_path, "dense d0")
    if approved.size != render.size:
        fail(
            "same-scale evidence requires identical approved/render canvases; "
            f"got {approved.size} and {render.size}"
        )
    approved_mask = binary_alpha(approved, "approved image")
    render_mask = binary_alpha(render, "dense d0 render")
    approved_bbox = approved_mask.getbbox()
    render_bbox = render_mask.getbbox()
    assert approved_bbox is not None and render_bbox is not None

    approved_width = approved_bbox[2] - approved_bbox[0]
    approved_height = approved_bbox[3] - approved_bbox[1]
    render_width = render_bbox[2] - render_bbox[0]
    render_height = render_bbox[3] - render_bbox[1]
    dx = round(((approved_bbox[0] + approved_bbox[2]) - (render_bbox[0] + render_bbox[2])) / 2)
    dy = approved_bbox[3] - render_bbox[3]
    aligned_render_mask = translate_mask(render_mask, dx, dy)
    intersection = ImageChops.multiply(approved_mask, aligned_render_mask)
    union = ImageChops.lighter(approved_mask, aligned_render_mask)
    intersection_pixels = opaque_count(intersection)
    union_pixels = opaque_count(union)
    iou = intersection_pixels / union_pixels if union_pixels else 0.0
    approved_aspect = approved_width / approved_height
    render_aspect = render_width / render_height
    width_drift = abs(render_width / approved_width - 1) * 100
    aspect_drift = abs(render_aspect / approved_aspect - 1) * 100

    landmarks = normalize_landmarks(landmark_input, asset_id, approved.size, render.size)
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    probe_sheet_path = output_dir / "source-yaw-probe-sheet.png"
    comparison_path = output_dir / "approved-vs-dense-d0-same-scale.png"
    overlay_path = output_dir / "dense-d0-silhouette-overlay.png"
    landmark_sheet_path = output_dir / "approved-vs-dense-d0-landmarks.png"
    metrics_path = output_dir / "same-scale-metrics.json"
    correspondence_path = output_dir / "landmark-correspondence.json"
    geometry_state_path = output_dir / "geometry-state.json"

    probes = {yaw: load_rgba(path, f"source-yaw {yaw}") for yaw, path in probe_paths.items()}
    compose_probe_sheet(probes, selected_yaw, probe_sheet_path)
    footer = (
        f"width drift {width_drift:.2f}% | aspect drift {aspect_drift:.2f}% | "
        f"silhouette IoU {iou:.3f} (diagnostic, not approval)"
    )
    compose_same_scale(approved, render, comparison_path, footer)
    compose_overlay(approved_mask, aligned_render_mask, overlay_path)
    compose_landmark_sheet(approved, render, landmarks, landmark_sheet_path)

    recorded_at = utc_now()
    common_inputs = {
        "approved_image": {"path": str(approved_path), "sha256": approved_hash},
        "dense_d0_render": {"path": str(render_path), "sha256": render_hash},
        "import_metadata": {"path": str(import_path), "sha256": sha256_file(import_path)},
        "reopen_verification": {"path": str(reopen_path), "sha256": sha256_file(reopen_path)},
        "source_yaw_selection": {"path": str(selection_path), "sha256": sha256_file(selection_path)},
        "wave0_preflight": {"path": str(wave0_path), "sha256": sha256_file(wave0_path)},
        "landmarks_json": {"path": str(landmarks_path), "sha256": sha256_file(landmarks_path)},
    }
    output_records = {
        "source_yaw_probe_sheet": {
            "path": str(probe_sheet_path),
            "sha256": sha256_file(probe_sheet_path),
            "classification": "CALIBRATION_ONLY",
        },
        "same_scale_comparison": {
            "path": str(comparison_path),
            "sha256": sha256_file(comparison_path),
        },
        "silhouette_overlay": {"path": str(overlay_path), "sha256": sha256_file(overlay_path)},
        "landmark_sheet": {"path": str(landmark_sheet_path), "sha256": sha256_file(landmark_sheet_path)},
    }
    metrics = {
        "schema_version": 1,
        "recorded_at": recorded_at,
        "asset_id": asset_id,
        "status": "DIAGNOSTIC_NOT_USER_APPROVAL",
        "geometry_state": GEOMETRY_STATE,
        "inputs": common_inputs,
        "metadata_gates": {
            "wave0_preflight": str(wave0.get("status")),
            "source_yaw_selection": str(yaw_selection.get("status")),
            "reopen_verification": str(reopen_metadata.get("status")),
        },
        "source_yaw_calibration": {
            "classification": "CALIBRATION_ONLY_NOT_DIRECTION_EVIDENCE",
            "selected_source_yaw_deg": selected_yaw,
            "probes": {
                str(yaw): {"path": str(probe_paths[yaw]), "sha256": probe_hashes[yaw]}
                for yaw in YAW_VALUES
            },
        },
        "approved": {
            "canvas_px": list(approved.size),
            "bbox_xyxy": list(approved_bbox),
            "bbox_size_px": [approved_width, approved_height],
            "bbox_aspect": approved_aspect,
        },
        "dense_d0": {
            "canvas_px": list(render.size),
            "bbox_xyxy": list(render_bbox),
            "bbox_size_px": [render_width, render_height],
            "bbox_aspect": render_aspect,
            "no_edge_clipping": all(
                value > 0
                for value in (
                    render_bbox[0],
                    render_bbox[1],
                    render.width - render_bbox[2],
                    render.height - render_bbox[3],
                )
            ),
        },
        "same_scale": {
            "canvas_sizes_identical": True,
            "image_rescaling_applied": False,
            "foreground_width_drift_percent": width_drift,
            "bbox_aspect_drift_percent": aspect_drift,
            "translation_only_alignment_px": [dx, dy],
            "silhouette_iou_after_translation_only": iou,
            "intersection_pixels": intersection_pixels,
            "union_pixels": union_pixels,
        },
        "outputs": output_records,
        "stop_gate": GEOMETRY_STATE,
    }
    write_json(metrics_path, metrics)

    correspondence = {
        "schema_version": 1,
        "recorded_at": recorded_at,
        "asset_id": asset_id,
        "geometry_state": GEOMETRY_STATE,
        "status": "D0_LANDMARK_EVIDENCE_UNREVIEWED",
        "user_approval": "UNREVIEWED",
        "review_scope": "physical_d0_and_source_yaw_calibration_only",
        "requirements": {
            "minimum_landmark_count": 4,
            "landmark_count": len(landmarks),
            "explicit_coordinate_pairs": True,
            "access_or_portal_semantic_present": True,
        },
        "entries": landmarks,
        "outputs": {"landmark_sheet": output_records["landmark_sheet"]},
        "missing_or_unproven": [
            "user visual approval of dense d0 geometry",
            "physical d1-d3 root-rotation evidence",
            "full cyclic landmark movement and occlusion",
            "color transfer and runtime fit",
        ],
        "stop_gate": GEOMETRY_STATE,
    }
    write_json(correspondence_path, correspondence)

    geometry_state = {
        "schema_version": 1,
        "recorded_at": recorded_at,
        "asset_id": asset_id,
        "state": GEOMETRY_STATE,
        "user_approval": "UNREVIEWED",
        "dense_d0_evidence_composed": True,
        "later_stages": {
            "geometry_refinement_started": False,
            "physical_direction_baking_started": False,
            "physical_d1_d3_started": False,
            "color_transfer_started": False,
            "sprite_postprocessing_started": False,
            "runtime_adoption_started": False,
            "live_game_files_modified": False,
        },
        "refinement_started": False,
        "physical_direction_baking_started": False,
        "color_transfer_started": False,
        "runtime_adoption_started": False,
        "next_allowed_transition": (
            "REFINED_GEOMETRY_CANDIDATE only after explicit dense d0 geometry review"
        ),
        "stop_gate": GEOMETRY_STATE,
    }
    write_json(geometry_state_path, geometry_state)

    print(
        json.dumps(
            {
                "status": "PASS_D0_DIAGNOSTIC_EVIDENCE_CREATED",
                "asset_id": asset_id,
                "geometry_state": GEOMETRY_STATE,
                "selected_source_yaw_deg": selected_yaw,
                "landmark_count": len(landmarks),
                "silhouette_iou": iou,
                "output_dir": str(output_dir),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
