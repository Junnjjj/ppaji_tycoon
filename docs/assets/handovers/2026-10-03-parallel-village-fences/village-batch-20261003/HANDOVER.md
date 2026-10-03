# Village batch handover

Candidate pack for `env_village_house`, `env_village_shop`, `env_pension`, four directions each. Main is untouched. Actual game-map capture, provider/HTTP validation, art acceptance and adoption remain coordinator-owned; no runtime QA claim is made.

## Integration

Pack: `assets/generated/kairo-v4-simple-pilot/village-batch-20261003`.
Review: `review.json`, `index.html`. Each frame uses `candidates/ID/dN.png`; originals point to the immutable `../angle-survey-20261002/full-images/ID-dN.webp`. Density 4. House canvas 512×464, shop 544×600, pension 576×632. Original left/top and logical dimensions, 3×3 / 3×3 / 4×3 footprints and their rotated dimensions are unchanged. No per-facing recentering. Each building has exactly one declared assembly in `surface-spec.json` / `assembly.json`.

## Design

House: cream walls, slate tiled gable, teal recessed-panel front-left door, blue framed windows, front flowerbox, corner potted shrub. Shop: taller two-story cream building, teal gable, low front teal storefront awning, opaque door and glass display, upper front flowerboxes. Pension: wider two-story cream building, orange ceramic roof, long front balcony with 29 balusters and two wall returns, raised upper flowerboxes and corner shrub. All roof ridges follow source d0 orientation. Hidden rear windows are a common inferred layout; source views disagree about placement and counts. Exact source-surface recovery is not claimed.

Curved ceramic courses use six-strip closed geometry per tile, foliage uses closed lathe profiles, not billboard cutouts or flattened boxes. Contiguous plaster wall/gable surfaces share a material label to avoid an artificial seam; their individual closed meshes and joins are still verified. RGB paint is evaluated at full resolution; the mature 2-packed-pixel coverage/line finish is reused. Pane/handle fine-feature exceptions are inherited from that renderer, not a whole-sprite RGB downsample.

## Reproduce

Run from this pack directory, using `/tmp/ppaji-angle-survey-venv/bin/python`:

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-extra.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
```

`build.py` reads established food-fire, bbq-rest and complex-template primitive helpers without modifying them. `materials.py` reads food-fire materials. All emitted files stay in this pack. `render.py`, `line_finish.py` and local material extensions are owned copies. `verify-extra.py` writes isolated tile/balcony specs and renders, then evaluates connected saved alpha and non-flat curve profiles.

## Evidence and limitations

`verification.json`: declared AABB joins, closed-part edge pairing, rotation edge-length invariance, no clipping/fragments and saved foundation boundary lines. Each full sprite is one connected alpha component. The saved-pixel scope is 24 exposed foundation segments across 12 facings; short details, curved contours, occluded surfaces, and most internal paint edges remain visual review. Fixed limits are slope error ≤0.04, RMS ≤1.5 packed pixels and mean outline-adjusted offset ≤1.5 packed pixels; thresholds were not relaxed.

`extra-qa.json`: 84 non-flat ceramic roof tiles per building; isolated tile d0–d3 coverage connectivity for every building; isolated pension balcony connectivity d0–d3; original canvas/registration and more than 256 opaque RGB colors in each output. AABB overlap is not exact collision certification. Closed parts and rotation do not certify recovered source geometry. None of these checks is an art95 certification.

`source-size-review.json`: original/candidate bounding boxes, explicit alpha>128 threshold, any-alpha boxes retained separately, width/height ratios. The common building is never stretched differently for individual facings. The originals have inconsistent proportions and tiny faint alpha outliers, so the threshold is disclosed.

`originals.png` and `candidate-overview.png` preserve the initial visual evidence; the latter is intentionally the first, rejected orientation. Final scrolling comparisons are `env_village_house-comparison.png`, `env_village_shop-comparison.png`, `env_pension-comparison.png`, with original, candidate, saved-line overlay rows and registered floor grid. `first-qa-failure.json` preserves the door-handle gap, and `balcony-joint-failure.json` preserves the return-rail gap, both corrected geometrically with unchanged tolerances.

## Final local result

PASS: house 274 joints / 254 closed parts; shop 393 / 355; pension 435 / 369. All 24 sampled foundation lines pass unchanged thresholds. Final 12 candidate images inspected with view_image on all three scrolling comparison boards; file hashes are in visual-review.json. Alpha>128 source/candidate width ratios 0.925–1.069 and height ratios 1.024–1.087; no facing was independently fitted. Main_modified remains false.

## Follow-up: continuous wall/gable plaster

Coordinator-requested diagonal color boundary is fixed. The outward normals already matched, but the closed gable helper assigned generic `#f5e3b5` instead of right-wall `#dfc697` / left-wall `#f5e3b3`. `build.py` now copies each adjoining exterior wall face material and per-facing shade to the coplanar exterior gable faces; canonical world-space plaster evaluation is unchanged. No vertices, roof, door, vegetation, registration, or alpha changed.

Pre-fix three comparison boards, 12 candidate renders, specification and QA are preserved in `pre-gable-paint-fix/`. Refreshed boards were visually inspected in all 12 directions; the pale triangular seam is absent. Existing verify and extra QA both PASS with the same counts and thresholds. `verify-gable-paint.py` / `gable-paint-qa.json` additionally establish 48 exact wall/gable paint comparisons, complete geometry/registration equality, and exact alpha equality in 12 outputs. All 12 candidate hashes in `visual-review.json` are refreshed, and source-size review is refreshed with unchanged dimensions. Run `/tmp/ppaji-angle-survey-venv/bin/python verify-gable-paint.py` after the normal reproduction sequence to repeat this regression check. Main remains untouched; runtime QA and adoption remain coordinator-owned.
