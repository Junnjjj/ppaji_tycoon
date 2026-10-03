# Fence / wall candidates — settled local review

Six assets, 24 final RGBA PNGs. Ready for coordinator map capture and adoption review; `main_modified: false`, runtime QA **NOT RUN**. Only this assigned pack was edited. No shared docs, manifest, browser, main, staging or commits were changed.

Integration IDs: `env_wood_fence`, `env_wood_fence_corner`, `env_wood_fence_end`, `env_stone_wall`, `env_stone_wall_corner`, `env_stone_wall_end`. Each uses `candidates/ID/d0.png` through `d3.png`; `review.json` follows the scoped renderer's existing assets/frames schema. Source links point to immutable `../angle-survey-20261002/full-images/ID-dN.webp`.

`final-hashes.json` records all 24 PNG SHA256, decoded RGBA hashes and immutable source hashes. `SHA256SUMS` is the machine-checkable settled candidate digest list. Capture these pixels; do not call build during adoption since build resets review metadata.

## Authored structure and visual review

One local assembly per ID, rigid quarter-turns, no per-facing recentering. Fence has two stout golden posts with caps and two separate rails; corner adds the perpendicular rail pair and third post. Stone has three running-bond courses, cream block bevel paint, varied warm shading, a closed core and thin coping. End variants retain the full capped segment observed in the originals. No curved identity-critical parts were observed; no curved feature was replaced by a box.

Canonical straight runs from `(0,0)` to `(1,0)`; corner adds `(0,0)` to `(0,1)`. Posts coincide intentionally at shared boundary vertices. Wall bodies meet at boundary planes. Footprint remains 1×1. Original wood logical canvas 66×80 and stone 64×80, offsets (-33,-48)/(-32,-48), density 4 and all four provider registrations are unchanged. Occupied dimensions are deliberately not fitted per-facing: alpha>128 candidate/source width ratios .930–1.023 and height ratios 1.013–1.116. `source-size-review.json` includes both occupied and nonzero-alpha source bounds because several source files contain near-invisible distant pixels.

Viewed all immutable originals before authoring, all six original/candidate/overlay contact boards, all 24 final candidates in `final-candidate-overview.png`, and the multi-segment preview. Initial timber ink made narrow rail openings appear clogged; warm brown 2-packed-px ink and thinner rails restore clear apertures. Stone block paint was refined after coordinator feedback to add top/left highlight, warm lower-edge shading, restrained color variation, and coping joints. Full-resolution RGB remains; only coverage/line decisions use the 2-packed-pixel finish. First timber crop and first stone/chain boards are retained. No subjective art95 or runtime approval is claimed.

`index.html` is one scrolling original→candidate→line-overlay report. `connections-grid.png` contains four independent five-piece chains per family at native density with panel margins. Its placements match the coordinator's `reviewChain=1` arrangement; this image is local Pillow review, not a game capture.

## Local QA

- `verification.json`: PASS; 30 closed parts, 29 AABB joins, quarter-turn edge lengths unchanged, all 24 saved sprites connected and unclipped.
- Pixel lines: 32/32 long upper edges on isolated saved rails/copings pass unchanged slope ±.04, RMS ≤1.5 packed px, outline-adjusted offset ≤1.5 px, coverage ≥90%. Thirty measurable exposed subsets in full sprites also pass. Two stone-corner edge subsets are occluded/too short and explicitly unclaimed. Short post-cap edges, vertical edges, mortar paint and curved lines are outside this slope check.
- `first-pixel-qa-failure.json` preserves the initial 21/32 result. It tried to measure full-sprite alpha boundaries through posts and nearer arms. Final checks use isolated saved edges and their exact visible subset in the full composite; thresholds were not relaxed.
- `connection-qa.json`: PASS; 32 straight/straight, straight/end, straight/corner and corner/perpendicular pairings through all rotations; 256 paired saved opaque-pixel samples at mating ports; 36 actual closed-part port containment checks.
- `registration-qa.json`: PASS; exact 24 source registrations/canvases and 8 distinct midspan rail-opening samples. Corner openings can be occluded by the other arm.
- Separate rails remain distinct parts and straight/end midspan openings are transparent. Each isolated edge part is checked as one connected saved component. Fence shared-post overlap is intentional. AABB is not general exact collision certification; these tests prove declared box structure and sprite continuity only.

## Reproduce

From this pack directory, with `/tmp/ppaji-angle-survey-venv/bin/python` as Python:

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python prepare-isolated.py
/tmp/ppaji-angle-survey-venv/bin/python render.py isolated.json --out isolated
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-connections.py
/tmp/ppaji-angle-survey-venv/bin/python verify-registration.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
shasum -a 256 -c SHA256SUMS
```

Build reads only the `shade`, `face`, and `box` helpers in sibling `complex-template-pilot-20261002/build.py`; renderer/line finish were copied from stage pack and materials are local. Dependencies: Pillow, NumPy. Original sources and helpers are read-only. All expected candidate files exist and settled hashes pass.

Remaining coordinator work: actual game original/candidate chain captures, runtime loading/placement QA, visual acceptance and authorized integration. No unresolved local structural/pixel failures; stated occlusion, short-line and appearance limitations remain.
