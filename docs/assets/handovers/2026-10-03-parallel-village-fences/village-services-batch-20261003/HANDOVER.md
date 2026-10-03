# Village service buildings — candidate handover

This pack owns only `env_small_hotel`, `env_convenience_store`, and `env_maintenance_shed`. It contains twelve direction PNGs, reproducible authored geometry, source-inspired material recipes, a scrolling report and local QA. **main_modified=false; no runtime-map QA, adoption or art95 certification is claimed.**

## Integration

Pack: `assets/generated/kairo-v4-simple-pilot/village-services-batch-20261003`.

- `review.json` follows the scoped renderer asset/frame schema. Candidate paths are `candidates/ID/dN.png`, and original paths use the existing review-server alias `../angle-survey/full-images/ID-dN.webp`.
- `index.html` is self-contained apart from its own PNG/JSON/report files. It contains three original → candidate → line-overlay boards, all four facings on fixed registered floor grids. It does not require a browser taskspace change.
- Hotel: canonical footprint 4×3, logical canvas 144×192, packed PNG 576×768.
- Convenience store: footprint 3×2, logical canvas 120×109, packed PNG 480×436.
- Maintenance shed: footprint 3×2, logical canvas 112×108, packed PNG 448×432.
- Every original direction's left/top and w/h registration is retained. Density 4, supersample 2. No per-facing recentering. Hotel horizontal dimensions use a single .93 contraction around its canonical footprint center, then ordinary rotation.
- The renderer reads per-asset `packed_canvas`. Geometry/material helpers are copied into this pack; no other pack is mutated or dynamically imported.

## Reproduce

From this pack directory, using `/tmp/ppaji-angle-survey-venv/bin/python`:

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-extra.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
```

`build.py` restores the review state to local candidate readiness; do not run it after adoption without preserving coordinator-owned adoption status. Immutable input is sibling `angle-survey-20261002/full-survey.json` and its `full-images/ID-dN.webp`; all twelve source image hashes are checked.

## Identity and intentional interpretations

Hotel: three cream stories, gold wooden trim, two fixed front balconies, opaque teal entrance, blue windows with green flowerboxes, cream blossoms, gray slate gable whose ridge follows u. The source's conflicting window/planter counts are standardized into one shared arrangement. Tiny flower clusters are geometric radial profiles, not camera-facing cutouts.

Convenience store: flat gray-cream roof and HVAC unit, teal sloped awning, central glazed entrance, two display bays with colored product blocks/gold header bands, blue side/rear windows, one round planted pot. No readable source brand was observed, so no invented textual sign is claimed. Product blocks are attached to the display panes.

Shed: teal ribbed gable, solid teal side entrance, slatted gray roller door, nine vent slots and two gold latch arms, fixed side windows and rear high vents, one rounded plant pot. Lower skirts/slats retain source palette. Curved roof ribs and planted foliage remain real multi-face geometry.

## QA scope and evidence

`verification.json`: closed-part edge multiplicity, declared AABB joints, quarter-turn edge-length invariance, separate balcony/display/door pieces, saved canvas dimensions, clipping, source immutability, and 24 actual saved-pixel foundation boundaries. The unchanged limits are slope error ≤ .04, RMS ≤ 1.5 packed px, outline-adjusted residual ≤ 1.5 packed px.

`extra-qa.json`: exact frame registration, no billboard geometry, actual radial-profile vertices, seven-sample roof cross sections, solid-door flags, saved-alpha connectivity and full-resolution RGB color diversity. A bent-line negative control must fail the unchanged RMS threshold.

These long foundation edges do **not** certify occluded/internal/short lines, every roof curve, or aesthetic similarity. AABB contact is not exact collision or penetration certification. Curves are checked against the declared authored assembly, not exact source recovery. `source-size-review.json` compares alpha >128 bounding boxes and records all directional size differences without forcing them to match.

`first-qa-failure.json` retains the original real product-panel gaps (0.006–0.008 tile) and roller-jamb gaps (0.01 tile); vertices were corrected without threshold changes. `first-extra-qa-failure.json` retains the initial radial-profile metadata mismatch for side/back plant transforms; centers were corrected to track the actual rotated geometry. `iteration-1/` retains first visual boards. Gable plaster colors, normals and material groups were unified with their coplanar walls after coordinator review; roof geometry was unaffected by that seam fix.

## Remaining coordinator work

Capture actual scoped game maps, verify HTTP-loaded frames and integration identifiers, assess art acceptance, then adopt according to the coordinator's live authorization. This worker changed no main files, shared documentation, runtime registry, review application, browser state, git staging or commits.

## Final local result

Both `verification.json` and `extra-qa.json`: PASS, zero outstanding failures. All twelve candidate PNGs visually reviewed after the final render; hashes and observations are in `visual-review.json`.

- `env_small_hotel`: 487 joints, 441 closed parts, 209 curved parts; width ratios 0.972–1.017, height ratios 0.991–1.023.
- `env_convenience_store`: 114 joints, 112 closed parts, 6 curved parts; width ratios 0.970–1.019, height ratios 1.032–1.053.
- `env_maintenance_shed`: 118 joints, 110 closed parts, 35 curved parts; width ratios 1.012–1.045, height ratios 1.020–1.040.
