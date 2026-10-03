# Decorative bus and car candidates

Completed `env_bus` and `env_car`, four facings each, within `decor-vehicles-batch-20261003` only. `review.json` is `READY_FOR_REVIEW`, `main_modified: false`; actual game capture, runtime validation, approval and adoption remain coordinator-owned. No shared registry, main files, inventory, browser, staging or commits were changed.

## Integration identifiers

- Suggested scoped pack key / report route: `decor-vehicles-batch`.
- Pack directory: `assets/generated/kairo-v4-simple-pilot/decor-vehicles-batch-20261003`.
- `review.json` uses the existing asset/frame schema with source `left`, `top`, `logical_w`, `logical_h`, `w`, `h`, original URL, candidate URL and selected flag.
- Candidates: `candidates/env_bus/d0.png` through `d3.png`, and `candidates/env_car/d0.png` through `d3.png`.
- Bus packed canvas **448×352**, logical **112×88**, footprint **5×2**, directions swap footprint as in source.
- Car packed canvas **192×224**, logical **48×56**, footprint **2×1**, directions swap footprint as in source.
- Density 4; 2× SSAA; only line/coverage decisions use a 2-packed-pixel grid. Full-resolution painted RGB remains unquantized (2,131–4,524 distinct visible RGB colors per final frame).
- Source: immutable `../angle-survey-20261002/full-survey.json` and its `full-images/{ID}-d{N}.webp`. Source/candidate byte and decoded RGBA hashes: `candidate-hashes.json`.

## Common assembly and appearance

Both vehicles have one fixed assembly with front at **u-**, rear at **u+**, four closed 24-segment beveled tires, two axles, circular hubs and common body geometry. Each complete assembly rotates rigidly; there are no direction-specific pieces, screen warps, camera-facing surfaces or per-facing recentering.

Bus: rounded cream body corners, dark blue lower band, two softened rectangular roof vents, six passenger panes and two doors on v+, seven passenger panes on v-, front windshield/headlights/grille, rear glass/red lamps. Window gaps were authored around the two doors rather than stacking windows through them. A common height correction brings the body back to source proportions while keeping tire radius and z=0 contact intact.

Car: rounded cream lower shell, beveled sloping cabin and roof shoulders, two blue side windows per side, sloped front/rear glass, mirrors with real support stalks, front cream lamps/grille and rear red lamps. Original facings repeat front-facing clues inconsistently; the candidate intentionally gives d0/d3 a rear view and d1/d2 a front view. Hidden rear details are an authored source-inspired interpretation, not a recovered original model.

The original images, first candidates and final comparison boards were inspected using `view_image`. Final `env_bus-comparison.png` and `env_car-comparison.png` show all four source directions, candidates and line overlays at exactly the same native scale and registration on floor grids. The whole canvas is preserved with margins; no panel crops or per-frame fitting. The HTML is a scrolling report; no browser was opened by this worker.

## Local verification

`verification.json`: **PASS**. Bus 46 closed parts / 45 AABB joints; car 38 closed parts / 37 AABB joints. Closed edges have multiplicity two, common rotation edge error below 5e-16, registered canvas and frame metadata unchanged, one connected opaque component and no clipping in every frame. Tire radius rings and all four minimum-z contacts are checked numerically; each pair of tires has a real separating axis.

Eight saved-pixel roof edges, **802 samples**, pass the fixed slope-error ≤0.04, RMS ≤1.5 packed px and outline-adjusted residual ≤1.5 packed px limits. Dark-edge coverage is **100%**, and all selected samples remain visible in the assembled sprite. The short car roof still provides 23–24 samples per direction; shorter window/bumper segments and curved corners are explicitly outside the straight-line claim. Intentional windshield slopes are not expected to follow ground-grid angles.

`extra-qa.json`: **PASS**. The whole declared joint graph is connected; genuine rounded body rings are present; fixed rear-lamp identity is preserved; 16 saved-pixel patches confirm the two near-side wheel contacts in each facing. Far-side tires may be occluded, so their contact evidence is geometry-only. All ten HTML image references exist.

`source-size-review.json` records both all-alpha and alpha>128 source/candidate boxes. All-alpha width ratio is 0.973–1.029 for bus and 0.967–0.978 for car; height ratio 0.945–1.032 for bus and 1.016–1.065 for car. Original faint shadows affect all-alpha bounds; these are review observations, not fitted limits.

Limits: AABB joints plus a connected graph do not certify exact mesh intersection or collision. Numeric QA does not certify art95. Saved-pixel straight-edge tests do not cover every internal edge, curved corner, short detail or occluded tire. No actual runtime QA, game map capture or adoption claim is made.

## Preserved iteration evidence

- `first-render-evidence/`: initial eight candidates, including too-tall car cabin / buried rear glass.
- `bus-height-review-before.png`: same-scale board exposing excessive initial bus body height.
- `first-qa-failure.json`: shallow window attachments, door seams, initial mirror gaps and a tire-validator bug. The tire checker originally counted the zero-radius cap-center vertices as an unexpected third radius; it now explicitly checks exactly allowed cap center / bevel radius / outer radius without changing tolerances.
- `mirror-joint-failure.json` and `mirror-stalk-short-failure.json`: real missing/short mirror attachments; corrected by solid support stalks rather than relaxed joint tolerances.

## Reproduce

From this pack directory, run the commands below with Python/Pillow/NumPy. The only read-only helper dependency is the `shade`, `face` and `box` definition block in `../complex-template-pilot-20261002/build.py`. The renderer and line finish were copied into this pack; `materials.py` is owned here.

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python prepare-isolated.py
/tmp/ppaji-angle-survey-venv/bin/python render.py isolated.json --out isolated
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
/tmp/ppaji-angle-survey-venv/bin/python verify-extra.py
/tmp/ppaji-angle-survey-venv/bin/python verify-refinement.py
```

`build.py` resets the local review status, so do not rerun it over coordinator adoption receipts without preserving them. `candidate-hashes.json` is regenerated by `verify.py`. `final-files-sha256.json` records the settled scripts, specs, evidence summaries and candidate files. Visual inspection and `visual-review.json` are manual evidence, not a browser or runtime test.

## Coordinator visual refinement — task_89963b04f982

Refined only the bus in response to the roof-vent and underbody volume review. Both roof vents now reach z=30.13 above roof z=28.18 (1.95 logical px / 7.8 packed px raised height), with four monotonically ordered bevel rings and a visible vertical side band. The previous short body had overlapping bevel heights; reducing the bevel radius and increasing actual height resolves that shallow appearance. Muted gray-green side material, a darker lower rim and a lighter top separate the vent surfaces without adding black outlines.

Bus-only material tags give the cream side walls modest warm shading, deepen the lower blue band toward the underside, and shade bumper/axle and lower tire surfaces. Nonvent geometry, common proportions, registration, outlines and line-finish implementation are unchanged. All four car candidate PNGs remain **byte-identical** to the accepted preceding candidates.

Before-refinement scripts, spec, hashes, complete candidates, board and QA are preserved in `before-vent-shading-refinement/`. The exact final `env_bus-comparison.png` was inspected with `view_image`, including all four originals, final candidates and line overlays. `verification.json` and `extra-qa.json` were rerun and PASS; `refinement-qa.json` additionally passes unchanged-registration/nonvent-geometry checks, car byte equality, monotonic vent-ring checks and eight saved-pixel side-shade probes. Vent tops are 50–70 RGB-average levels lighter than their side samples. No threshold was loosened, no main files or shared browser state were changed, and runtime review remains coordinator-owned.
