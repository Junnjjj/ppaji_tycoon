# Water platform and tower candidates — 2026-10-03

Five assets / twenty final RGBA PNGs are ready for coordinator review. `review.json` uses the scoped renderer's assets/frames schema, with `main_modified: false`; no main, registration, shared docs, inventory, browser state or other packs were edited.

## Coordinator-requested refinement (task_dbeb01552dfd)

The pre-refinement candidates, boards, source/code, reports and hashes are preserved in `pre-refinement-20261003/`. Only this pack was edited.

The entire watchtower has one canonical 1.08 scale in u/v about tile center; z, logical canvas, anchor and rotation footprint remain fixed. Green leg radius increased .050→.075 before that scale; teal rails .87→1.20; ladder side rails .72→1.05. Cream feet are wider and 1.55 high; caps are wider rounded solids, with height 1.15. A legacy renderer rule incorrectly grouped each cream face individually, filling tiny feet/caps with internal outlines; grouping now follows each physical foot/cap, making the cream paint visible. Orange wood side shading is warmer. The ladder now uses four spaced rounded rungs and retains exact axis attachment tests.

The lifebuoy major/minor radii increased 3.5/.9→3.9/1.0, then share the watchtower ground-plane scale. Its equation is checked in the declared pre-scale canonical coordinates at the original 1e-8 tolerance: this is an affinely widened torus, not a claim that anisotropic ground scaling preserves a perfect circular cross-section. Center/rope attachment and all directions remain common geometry.

Both tower water grips increased physical bar radius .40→.67 and use brighter silver with shaded sides. Sixteen new isolated grip opening samples cover both grips on both facilities across all four directions. Floating modules retain their square corner/seam geometry while materials now use deep blue vertical walls, bright blue tops and pale upper bevels; no RGB downsampling was introduced.

Saved-pixel ladder gap checks found that the first six thick rungs and then the initial thick five-rung version closed rear-view gaps. Evidence is retained in refinement-six-rung-gap-failure.json, refinement-six-rung-apertures.png, refinement-five-rung-thick-gap-failure.json and ladder-sample-diagnostic.png. The subsequent five-rung/grid result is preserved in refinement-five-rung-grid-gap-failure.json. Rung geometry was adjusted to four rungs of radius .70 without changing any aperture, edge or attachment tolerance.

Remaining visual differences: the source remains softer and more irregularly painted; the candidate has discrete two-pixel boundary steps. Watchtower width is now source-sized, while its kept height and enlarged cream caps yield a 6.4–10.7% taller alpha silhouette, explicitly reported rather than per-facing fitted. Ring/ladder can be occluded by the platform or legs in composed rear views. Ladder isolated air is sampled at three gap centers per facing: 9/12 are transparent, while three rear-view center samples hit ink; each of the four views has visible air, and the failed center points remain explicitly recorded in extra-qa.json. Final acceptance and actual map captures remain coordinator-owned.

## Integration

Pack: `assets/generated/kairo-v4-simple-pilot/water-platform-towers-batch-20261003`

| ID | Footprint d0 | Packed canvas | Candidate path |
|---|---|---|---|
| boarding_dock | 2×1 | 512×512 | candidates/boarding_dock/d0.png … d3.png |
| float_deck | 1×1 | 512×512 | candidates/float_deck/d0.png … d3.png |
| rig_jump_tower | 2×2 | 512×512 | candidates/rig_jump_tower/d0.png … d3.png |
| diving | 2×2 | 512×512 | candidates/diving/d0.png … d3.png |
| watchtower | 1×1 | 768×768 | candidates/watchtower/d0.png … d3.png |

Every frame preserves immutable survey left/top, width/height, density4 and footprint. d0–d3 rotate the same declared parts. All floating modules start at z=0. There are no facing-specific translations, fitted screen warps, camera-facing accessories, ImageGen or Blender artifacts. Local geometry was copied from mature helpers and is now self-contained in geometry.py; render.py and line_finish.py are pack-local copies. Only silhouette and line coverage use the required 2-packed-pixel grid; RGB is sampled at full output resolution from the supersampled render.

## What changed

- Eight-module dock with two silver cleats, three small brown connector plates, bolts, modest bevels, physical seams and below-top connectors.
- Plain four-module floating deck, with no added rail or tower.
- Tall jump tower: eight solid yellow steps with fixed traction marks, green round supports/stringers, two open upper guards and stainless water grips. Landing z=34.
- Lower diving platform: eight separately authored treads, forty real narrow riser slots, side infill, broader landing/lip and stout supports. Landing z=23. It is not a recolored copy of the solid jump stair.
- Watchtower: orange wood platform, four green legs with cream feet, three teal guards with three wood balusters each, four-rung inclined wood ladder, and a fixed red-white torus attached by rope. Three balusters per side preserve visible air under the required line finish.

## Validation and review

`verification.json`: PASS. 281 closed parts, 402 declared AABB joints, common physical edge-length invariance, all 20 unchanged registrations/canvases, clipping checks and connected final alpha silhouettes. Eighty saved perimeter-edge measurements pass the unchanged slope tolerance .04 and packed RMS/offset tolerances 1.5px. Fifty-two entries are explicitly unmeasured because of occlusion or short/curved geometry, including watchtower edges; they are not counted as passed lines.

`extra-qa.json`: PASS. Fifty-six isolated renders retain original registration. Sixty-nine transparent point samples cover tower guards, silver water grips, watchtower baluster gaps, the ring center and the ladder across four facings. Eight ladder rung endpoint/rail axis coincidences pass below 1e-8 physical units. Forty diving riser slots have positive geometric separation. The torus equation and finite positive ring hole are checked independently in verification.json.

All five final original/candidate/line boards and all twenty candidate directions were inspected using view_image. Isolated four-facing guards, diving riser, ring and ladder were also visually inspected in aperture-board.png. The scrolling index.html links the same-scale floor-grid boards and reports; report panels use a common registered crop, never a facing-specific asset fit.

Preserved failures: `initial-height-evidence/` contains the oversized first tower results. `initial-guard-gap-failure.json` records blocked watchtower air samples and one blocked ring center from the first narrow spacing/ring. Geometry was corrected (fewer, spaced balusters and larger inner ring opening), not test tolerances.

## Limits and remaining coordinator work

This is local candidate completion, not runtime or artistic approval. AABB contact is not exact collision certification; numerical PASS is not art95 certification. Hidden source forms are authored interpretations. Source facings themselves vary, so exact four-view silhouette agreement is not claimed.

`source-size-review.json` records all twenty comparisons. Dock/floating deck widths are ~.99× source; jump tower widths .923–.980× and heights 1.000–1.060×; diving heights .990–1.134× (d3 largest mismatch); watchtower widths .991–1.009× and heights 1.064–1.107×. The source-inspired candidates remain more discretely outlined than the softly painted originals. Small riser slots and individual guards can be occluded by other final geometry; isolated checks do not certify all apertures visible in a composed runtime scene.

Coordinator still owns actual floor + water map capture, artistic acceptance, any further requested refinement, runtime registration/adoption and main changes. No runtime QA claim is made.

## Reproduction

From this pack directory:

```sh
/tmp/ppaji-angle-survey-venv/bin/python rebuild.py
```

The command builds the common spec, renders all 20 candidates, prepares/renders 56 isolated feature views, runs both QA programs, recreates the report boards and hashes final pack artifacts and all immutable source reads. Both QA commands exit nonzero on failure. `hashes.json` records SHA-256 values; `verification.json` also records each final candidate hash. Sources are read only from ../angle-survey-20261002/full-survey.json and full-images/ID-dN.webp. No write or installation step touches MAIN.
