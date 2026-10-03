# Water rest batch — coordinator handover

Four authored common assemblies, 16 candidate PNGs, ready for coordinator source/actual-game review. This pack modifies no MAIN files, provider registration, native aliases, shared inventory, browser state, or other packs. `review.json` retains `main_modified: false`; runtime QA and adoption remain coordinator-owned. No art95 certification is claimed.

## Integration identifiers

- `module_waterwalk` → `candidates/module_waterwalk/d0.png` … `d3.png`
- `module_rig_hammock` → `candidates/module_rig_hammock/d0.png` … `d3.png`
- `module_rig_sunbed` → `candidates/module_rig_sunbed/d0.png` … `d3.png`
- `module_rig_led_buoy` → `candidates/module_rig_led_buoy/d0.png` … `d3.png`

All candidates use their original 512 × 512 RGBA canvas, density 4, full-resolution RGB and 2-packed-pixel coverage/line finish. `review.json` uses the existing scoped renderer schema, including copied survey metadata, selected frames, original/candidate relative paths, original footprint, logical dimensions, and unmodified per-direction left/top registration. No facing-specific fitting or recentering occurs. `candidate-hashes.json` records file and decoded RGBA hashes; `source-hashes.json` records the immutable survey and all 16 originals. Native visualSource aliases are not changed here.

## Reproduce

From any working directory:

```sh
/tmp/ppaji-angle-survey-venv/bin/python /Users/jangjunpyo/orca/workspaces/ppaji_tycoon/에셋만들기_v3/assets/generated/kairo-v4-simple-pilot/water-rest-batch-20261003/rebuild.py
```

This runs build, full renders, isolated feature renders, structural/saved-line QA, curve/aperture/transparency QA, scrolling report, and final hashes. Python, NumPy and Pillow are the only dependencies. Immutable originals/survey are read from the neighboring `angle-survey-20261002`. No Blender, image generation, fitted screenshot patches, screen-facing billboards, external API or browser is used.

## Review evidence

Open `index.html` for scrolling source → candidate → saved edge comparisons. Panels use one shared registered crop and scale, floor grids and complete source/candidate panels. Each asset has an original/candidate board and all4 enlarged candidate detail. `aperture-board.png` shows isolated frames, cloth and sphere; `transparency-board.png` composites the exact same saved sphere PNG over dark/light gridded floors plus diagnostic samples. `source-size-review.json` reports all4 occupied bounds and size ratios without recentering.

`verification.json` checks closed meshes, AABB attachment screening, rotation edge invariance, absence of billboards, source registration/canvas, unclipped saved alpha, whole-assembly pixel connectivity, separate deck pieces and visible saved straight edges. Saved line criteria are fixed: ≥90% exposed/ink coverage, RMS ≤1.0 packed px, maximum residual ≤2.4 packed px, expected slope difference ≤0.04 and offset ≤1.5 packed px. Occluded/short segments are explicitly unmeasured, not passed. Curved members are tested separately; these long edges do not certify curves or source fidelity.

`feature-qa.json` independently checks 20 isolated arch aperture patches, actual cloth parabola/thickness, four cord-to-cloth exact endpoints and cord-to-support swept-axis distances, 520 saved curved-hem samples, actual back-cushion hinge transform, pale lamp globe pixels and curved geometry, and sphere equation/alpha/transmitted rear-member contrast/foreground depth ordering/no interior pinholes in all4. `qa-summary.json` holds exact final counts: 198 closed parts, 239 AABB joints, 120 saved straight edges / 1,996 samples, 88 explicit occluded/short-line limitations and 58 feature checks. `negative-control-qa.json` additionally rejects a saved opaque-shell mutation and a saved bent-edge fixture while accepting the straight fixture. AABB overlap is not exact collision certification; no gameplay access or runtime placement is asserted.

## Source interpretation and refinements

- Waterwalk: tiled blue deck, one yellow gate, two green side arches, yellow entry pad and a real translucent light-blue ellipsoid. The sphere is reduced to match d0 gate-relative proportions. Two depth-sorted shell intersections preserve rear structural members and background alpha. Front opaque members stay in front. This is alpha transmission, not physical refraction.
- Hammock: d0 establishes a short front frame (22 logical px), taller rear frame (30), real suspension cords and yellow cloth with different endpoint heights (17 and 24) and shallow 5.2-px sag below linear interpolation. The source changes apparent support proportions in d2; this candidate deliberately rotates one fixed asymmetric structure. Cloth has actual thickness, spreaders, sewn hems and attached cord endpoints.
- Sunbed: one low split rounded yellow cushion, green frame/legs, and a fixed 43-degree back, shortened from 0.63 to 0.50 tile cushion length after all4 source comparison. Source d0/d1 shows an inconsistently lower back than d2/d3; this is not fitted per facing. A single canonical 180-degree rotation puts the raised back at the d0 source-facing end; the changed deck attachment IDs are updated accordingly. The back is always in the same physical location and angle.
- Buoy: small tiled blue base, yellow stem, dark collar, pale rounded globe and green cap. Globe mesh faces share one line group to avoid accidental per-face dark ink.

The revised palette uses olive green and warm yellow, thick blue float sides, and smooth painted RGB variation. Geometry is authored and source-inspired, not exact recovery of unseen or inconsistent source shapes. Source facings have different silhouettes; numeric size ratios document those remaining differences.

## Reuse by the final compound playground task

`surface-spec.json` contains actual canonical quad/triangle-as-quad vertices; transform these common parts, never paste finished sprites. `assembly.json` declares parts/joints and `features.json` declares feature parameters. The copied `geometry.py`, local `build.py`, `materials.py`, `render.py` and `line_finish.py` are self-contained in this owned pack.

For opaque parts, reuse vertices/material/shade and the shared 2px line groups. `plastic_bounds` must be transformed with geometry, or evaluated through the inverse compound transform, to retain blue painted edge highlights. `shade` is indexed by physical quarter-turn; compose the source turn with the compound turn. The hammock uses vertex-authored sag and thickness; no runtime deformation is needed. The sunbed's hinge is baked into actual vertices.

The sphere requires this pack's explicit `translucent` face path, two-layer depth compositing, and alpha-preserving line finish. `sphere_center`, `sphere_radius` and `sphere_rz` in each face drive the material and must be transformed consistently (or material coordinates inverse-transformed) with the shell vertices. Do not send it through the old opaque-only renderer or expand its alpha to 255. The supplied convex-shell compositor supports this one convex shell; several overlapping transparent shells need per-shell layers and global depth order rather than merging their nearest/farthest intersections.

## Preserved findings

`initial-evidence/` retains first-pass boards/code/QA: structures passed, but visual review rejected thin/neon supports, generic equal-height hammock supports, overly large sphere and per-face lamp ink. `pre-asymmetric-refinement/` retains the intermediate appearance. `sunbed-rotation-joint-metadata-failure.json` records four stale attachment IDs after the canonical seat rotation; the model/metadata were corrected, not the tolerances. `sphere-pole-tolerance-failure.json` records the small pole-cap equation failure; the cap radius was reduced from 0.001 to 0.0005 tile without relaxing the equation threshold.

Final PNGs must be reviewed in the actual game by the coordinator before any runtime approval claim. This handover does not authorize or claim registration/adoption, exact collision, hidden-source reconstruction, or subjective 95-point artwork acceptance.
