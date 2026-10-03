# Hedge / flowerbed candidate handover

Four assets / 16 PNGs are ready for coordinator review. Local structural, saved-pixel, leaf-root and adjacency QA PASS. **Main modified: false. Runtime QA: not run.** No shared registry, docs, other packs, browser, main, staging or commits were changed.

## Integration

Pack: `hedge-flowerbed-batch-20261003` under the existing `assets/generated/kairo-v4-simple-pilot` root.

IDs: `env_hedge`, `env_hedge_corner`, `env_hedge_end`, `env_long_flowerbed`.
Candidate paths: `candidates/ID/d0.png` through `d3.png`. `review.json` retains the scoped renderer registration schema; `surface-spec.json` declares one fixed assembly per ID. Each hedge has a 256×320 packed canvas, logical 64×80, density 4 and footprint 1×1. Flowerbed has a 320×352 packed canvas, logical 80×88, density 4, canonical size 2×1 and alternating 2×1 / 1×2 registrations. Every original `left`, `top`, `w`, `h` and frame field is preserved exactly; no facing-specific repositioning.

Hedge canonical line: `(0,0) -> (1,0)`; corner has the additional arm to `(0,1)`. Intrinsic rotation shifts are `[(0,0),(0,1),(1,1),(1,0)]`, matching coordinator `reviewChain=1`. Base contact cross-section is ±0.15 tile wide and z=0..1.7. End is a full-length closed, capped segment as in the source. Straight and end intentionally share the same closed assembly; the visible end cap supplies terminal closure.

## Geometry and appearance

Each hedge run has five overlapping, irregular leafy clumps; the corner has nine. Flowerbed has five larger clumps, a raised pale gray/cream planter, soil, rim and orange-brown shoots. Each clump has a closed dark core and 96 individually authored closed thick leaves, deterministic size/angle/color variation and a real inward root. All faces and leaves rotate together; no camera-facing patches, cubic foliage slabs, texture warps or direction-fitted sprites. The coordinator clarified that the orange source band reads as stems, so no invented colored blossoms remain.

Own copies of the accepted quad renderer and line-finishing helper are included. Paint is evaluated in canonical coordinates at full RGB resolution; only boundary coverage is quantized to 2 packed px. The normal 2× geometric supersample resolves to the original density-4 packed canvas, without whole-sprite RGB pixelation.

## Evidence

- `index.html`: one scrolling page, all four original / candidate / line-overlay boards, and the seven-module connection preview. Boards show a registered two-axis floor grid at identical scale and retain the entire source canvas plus panel margins.
- `verification.json`: 2,377 closed parts, 2,373 AABB joint checks, 24 curved leaf shells, distinct clump-center checks, real base ground contacts, all four rotations with unchanged edge lengths, all 16 registrations/canvases, no clipping, one connected saved alpha component per sprite.
- Saved final-composite planter/base bottom edges: **22 PASS; 26 occluded or too short, not passed**. Fixed thresholds are slope error ≤0.04, RMS ≤1.5 packed px, guide-offset error ≤1.5 packed px, coverage ≥90%, ≥16 samples and ≥20 packed px span. The 10 packed px endpoint trim excludes rounded 2 px endpoint coverage. Foliage, stems, short vertical/end edges and hidden rear base edges have no straight-line claim.
- `plant-root-qa.json`: all **2,304** leaf roots lie inside every outward half-space of their actual convex core triangles. This is actual mesh containment for leaf roots, separate from the general AABB checks.
- `connection-qa.json`: **16** direction/pair cases; **64** saved opaque pixel contact samples at z=.5,3,5,7; **7** actual closed base-cap cross-sections. All PASS.
- `source-size-review.json`: alpha>128 silhouette comparison, source tiny-alpha noise excluded. Width ratios **0.907–1.073**, height ratios **0.971–1.068**; original canvas and anchor remain exact. Narrower corner side views and slightly wider flowerbed are authored shared-volume differences, not registration changes.
- `visual-review.json`: all 16 final frames reviewed through full original/candidate boards with `view_image`, plus four connection previews. Numeric QA is not art95 certification.
- `final-hashes.json`: per-file candidate byte and decoded RGBA hashes; `SHA256SUMS`: settled pack files. `source-hashes.json`: immutable source reference hashes.

Retained failure evidence: `first-smooth-foliage-rejected.png` and `first-detail-review.png` show the rejected buried/small regularly spaced leaves and overexposed stems. `first-joint-failures.json` records leaves missing the faceted core bounds and two unsupported clumps; roots were deepened and real trunks added without loosening thresholds. Those first images are deliberately not current candidates.

## Reproduce

From this pack directory, use `/tmp/ppaji-angle-survey-venv/bin/python` for each command:

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-plant-roots.py
/tmp/ppaji-angle-survey-venv/bin/python verify-connections.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
/tmp/ppaji-angle-survey-venv/bin/python hash-pack.py
```

The builder resets `review.json` to ready/unadopted. Do not rerun it over an integration receipt. The only external read dependency is immutable `../angle-survey-20261002`; all helper/render/material code is local to this pack.

Coordinator still owns actual game-map loading/capture, runtime visual approval, registration and adoption. AABB checks and alpha contact do not certify exact collision, and no appearance score or runtime PASS is claimed.
