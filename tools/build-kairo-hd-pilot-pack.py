#!/usr/bin/env python3
"""실제 Phaser `?hd=1` 검토가 읽는 2× 지면/시설 팩을 결정론적으로 만든다."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_OUT = ROOT / "public/assets/kairo-hd-pilot-v1"
ARTIFACT_OUT = ROOT / "artifacts/hd-pixel-mode-pilot-v1/runtime-pack"
COMPOSER = ROOT / "tools/compose-hd-pixel-mode-pilot.py"
FIT_ROOT = ROOT / "artifacts/asset-concept-sheets/indoor-facilities-v1/runtime-fit-map-v1/runtime-sprites"
ATLAS = ROOT / "public/assets/kairo-atlas.png"
ATLAS_INDEX = ROOT / "public/assets/kairo-atlas.json"

DENSITY = 2
APPROVED = {
    "icecream": {"size": [1, 1], "canvas": [32, 36]},
    "cafe": {"size": [2, 2], "canvas": [64, 52]},
}
GROUND = {
    "path_stone": "stone",
    "path_deck": "deck",
    "path_sand": "sand",
    "lawn": "lawn",
    "water_edge": "water",
    "floor_indoor": "floor",
    "road": "road",
    "sidewalk": "sidewalk",
    "verge": "verge",
    "mountain_rock": "mountain",
    "pool_water": "pool",
}


def load_composer() -> ModuleType:
    spec = importlib.util.spec_from_file_location("kairo_hd_composer", COMPOSER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {COMPOSER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def save_asset(
    image: Image.Image,
    filename: str,
    asset_id: str,
    group: str,
    logical: list[int],
    assets: dict[str, Any],
    composer: ModuleType,
) -> None:
    physical = [logical[0] * DENSITY, logical[1] * DENSITY]
    if list(image.size) != physical:
        raise ValueError(f"{asset_id}: {image.size} != {physical}")
    path = PUBLIC_OUT / filename
    image.save(path, optimize=True)
    assets[asset_id] = {
        "path": f"assets/kairo-hd-pilot-v1/{filename}",
        "group": group,
        "density": DENSITY,
        "logicalSize": logical,
        "physicalSize": physical,
        "category": "terrain" if group == "ground" else "facility",
        "sha256": composer.sha256(path),
    }


def approved_direction(
    asset_id: str,
    direction: dict[str, Any],
    logical_canvas: list[int],
    footprint: list[int],
    composer: ModuleType,
) -> tuple[Image.Image, dict[str, Any]]:
    source_path = Path(direction["source"]["path"])
    source = Image.open(source_path).convert("RGBA")
    bbox = composer.alpha_bbox(source)
    contact_x, contact_y = composer.bottom_contact(source)
    crop = source.crop(bbox)
    runtime_scale = float(direction["scale"]["physical_to_runtime"]) * DENSITY
    resized_w = max(1, round(crop.width * runtime_scale))
    resized_h = max(1, round(crop.height * runtime_scale))
    resized = crop.resize((resized_w, resized_h), Image.Resampling.LANCZOS)

    canvas_w = logical_canvas[0] * DENSITY
    canvas_h = logical_canvas[1] * DENSITY
    contact_crop_x = (contact_x - bbox[0]) * resized_w / crop.width
    contact_crop_y = (contact_y - bbox[1]) * resized_h / crop.height
    target_x = footprint[0] * 16 * DENSITY - 0.5 * DENSITY
    target_y = canvas_h - DENSITY
    paste_x = round(target_x - contact_crop_x)
    paste_y = round(target_y - contact_crop_y)
    output = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    output.alpha_composite(resized, (paste_x, paste_y))
    retained = output.getchannel("A").getbbox() is not None
    return output, {
        "source": str(source_path),
        "source_sha256": composer.sha256(source_path),
        "subject_wh": [resized_w, resized_h],
        "paste_xy": [paste_x, paste_y],
        "target_contact_xy": [target_x, target_y],
        "nonempty": retained,
    }


def main() -> None:
    composer = load_composer()
    PUBLIC_OUT.mkdir(parents=True, exist_ok=True)
    ARTIFACT_OUT.mkdir(parents=True, exist_ok=True)
    assets: dict[str, Any] = {}
    records: list[dict[str, Any]] = []

    for ground_id, style in GROUND.items():
        for alt in range(3):
            phase = alt if style in {"water", "pool"} else 0
            image = composer.hd_tile(style, alt, phase)
            save_asset(
                image,
                f"ground__{ground_id}__a{alt}.png",
                f"ground/{ground_id}:a{alt}",
                "ground",
                [32, 16],
                assets,
                composer,
            )

    atlas = Image.open(ATLAS).convert("RGBA")
    atlas_index = json.loads(ATLAS_INDEX.read_text(encoding="utf-8"))
    for bridge_id in ("bridge_x", "bridge_z"):
        frame = atlas_index[f"ground/{bridge_id}"]
        crop = atlas.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
        image = crop.resize((frame["w"] * DENSITY, frame["h"] * DENSITY), Image.Resampling.NEAREST)
        save_asset(
            image,
            f"ground__{bridge_id}.png",
            f"ground/{bridge_id}",
            "ground",
            [frame["w"], frame["h"]],
            assets,
            composer,
        )

    # 해상도만 비교하는 B 화면: 현재 풋프린트/캔버스의 base ID를 유지한다.
    for asset_id in ("icecream", "cafe"):
        current, record = composer.build_hd_facility(asset_id)
        save_asset(
            current,
            f"facility__{asset_id}__current-fit.png",
            f"facility/{asset_id}",
            "facility-current-fit",
            list(record["current_canvas"]),
            assets,
            composer,
        )
        records.append({"asset_id": asset_id, "mode": "current-fit", **record})

    # 승인 풋프린트 C 화면: 같은 잠긴 물리 방향을 새 캔버스에 d0-d3 모두 정규화한다.
    for asset_id, approved in APPROVED.items():
        metrics = json.loads((FIT_ROOT / asset_id / "runtime-footprint-metrics.json").read_text(encoding="utf-8"))
        for direction in metrics["directions"]:
            name = direction["direction"]
            image, record = approved_direction(
                asset_id,
                direction,
                list(approved["canvas"]),
                list(approved["size"]),
                composer,
            )
            final_id = f"facility/{asset_id}:{name}"
            save_asset(
                image,
                f"facility__{asset_id}__{name}__approved-fit.png",
                final_id,
                "facility-approved-fit",
                list(approved["canvas"]),
                assets,
                composer,
            )
            records.append({"asset_id": asset_id, "direction": name, "mode": "approved-fit", **record})

    manifest = {
        "schemaVersion": 1,
        "status": "HD_PIXEL_MODE_REVIEW_ONLY",
        "liveAtlasModified": False,
        "logicalTile": [32, 16],
        "renderDensity": DENSITY,
        "assets": assets,
    }
    manifest_path = PUBLIC_OUT / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evidence = {
        "status": "RUNTIME_HD_PILOT_READY",
        "live_files_modified": False,
        "public_manifest": str(manifest_path),
        "public_manifest_sha256": composer.sha256(manifest_path),
        "asset_count": len(assets),
        "records": records,
    }
    (ARTIFACT_OUT / "build-evidence.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"manifest": str(manifest_path), "assets": len(assets)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
