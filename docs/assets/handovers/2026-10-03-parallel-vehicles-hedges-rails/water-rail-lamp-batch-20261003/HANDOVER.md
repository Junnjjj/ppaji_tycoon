# Water rails and street lamp — coordinator handover

Ready for coordinator review; `main_modified: false`. This worker changed only `water-rail-lamp-batch-20261003`. No runtime map capture, adoption, shared registry edit, browser action or git staging was performed.

## Integration

IDs: `env_water_rail`, `env_water_rail_corner`, `env_water_rail_end`, `env_street_lamp`. Candidate paths are `candidates/ID/d0.png` through `d3.png`; `review.json` follows the scoped renderer survey schema. Rails remain 264×320 packed pixels, lamp 256×336, all density 4 and 1×1 footprint. Original frame left/top and logical sizes are copied verbatim. Canonical straight/end ports `(0,0)→(1,0)`, corner adds `(0,1)`; rotate with intrinsic translations `(0,0),(0,1),(1,1),(1,0)`. Shared endpoint posts intentionally overlap exactly; no facing-specific recentering.

Open `index.html` for original → candidate → line-overlay registered floor-grid boards and four chain rotations. Boards are 1360×1240 with full source canvases inside each panel. Candidate overview is supplementary; registered boards are authoritative.

## Assembly and appearance

One declared assembly per ID; 37 closed parts and 41 intended joints total. Rails have source-inspired blue-gray metal, square posts/caps and two separate narrow rails with genuinely transparent openings. The original end is a full capped segment, preserved. No timber was visibly present in this assigned source set. Lamp has one fixed +u arm, real hanger, four chamber frame bars, warm amber glass, and seven 16-sided lathed parts: pole, foot, collars, finial, hanger and rounded cap. Per coordinator review, charcoal-olive materials and narrow cylindrical highlights replace the earlier pale khaki pass without changing coverage or height.

Python/Pillow authored geometry and materials; no Blender, ImageGen, billboard, screen warp or per-facing fitted geometry. RGB remains at full packed resolution after SSAA resolve; only coverage/line decisions use the 2-packed-pixel finishing grid.

## Local evidence

- `verification.json`: PASS; 37 closed components, 41 AABB joint overlaps, rotation edge error below 1.2e-16, all 16 candidates unclipped with one connected visible component, 16 saved rail edge checks.
- `connection-qa.json`: PASS; 16 rotated straight/corner/end pairings, 128 opaque saved-pixel pairs, 18 exact box port occupancy checks.
- `extra-qa.json`: PASS; 16 transparent 3×3 opening samples, seven radial profile checks, eight long saved pole edges plus exposed composite subsets, four ground contacts and pole/chamber separation.
- `registration-qa.json`: PASS; exact frame metadata, rectangular canvas sizes, immutable source hashes and candidate hashes.
- `source-size-review.json`: alpha>128 original/candidate bounds and all size differences. Lamp d1 source is taller than the shared lamp; no direction-specific stretching used.
- `final-hashes.json`, `SHA256SUMS`: settled candidate/spec/code/QA/report hashes.

First boards preserve warm outlines, wider caps and pale lamp. `first-extra-qa-failure.json` preserves two pole-line failures caused by the chamber entering the broad pole search window; final measurement uses isolated saved pole edges and only their exposed composite subset, with unchanged .04 slope/1.5px RMS thresholds. `second`/`third`/`fourth-extra-qa-failure.json` preserve crowded opening tests during rail height adjustment; the actual bars were thinned and the lower bar lowered, retaining the exact alpha-zero 3×3 requirement. No thresholds were relaxed.

AABB overlap is not exact collision certification. Short fixture/cap edges, internal painted lines and intentional curves do not receive straight-line certification. Numeric checks are not art95 certification. Geometry is source-inspired reconstruction, not exact recovered source shape. Actual game maps, runtime QA and adoption remain coordinator-owned.

## Reproduction

Run from this pack directory using `/tmp/ppaji-angle-survey-venv/bin/python` as `PY` below:

```sh
PY=/tmp/ppaji-angle-survey-venv/bin/python
$PY build.py
$PY render.py surface-spec.json --out candidates
$PY prepare-isolated.py
$PY render.py isolated.json --out isolated
$PY verify.py
$PY verify-connections.py
$PY verify-extra.py
$PY build-report.py
$PY finalize.py
```

`build.py` resets review state to ready, so do not run after adoption without preserving coordinator receipts. Copied renderer and line-finishing helpers are local; builds depend only on NumPy/Pillow and the immutable sibling source survey/images. No runtime registration has been added by this worker.
