# Water playground — settled candidate pack

Asset `ppaji_playground` only. Pack `water-playground-batch-20261003`. Four final candidates are `candidates/ppaji_playground/d0.png` through `d3.png`; all are 2560×2560 RGBA, density4 with full-resolution RGB and 2packedpx coverage/line finish. `review.json` is ready for scoped registration; `main_modified=false`, runtime QA pending coordinator. Open `index.html` for scrollable, same-scale registered source/candidate/line-overlay boards with floor grids. `contact-board.png` gives the overview. All4 final candidate composites and contact board were visually inspected with view_image.

## Assembly and source interpretation

One canonical 20×12 water assembly rotates into all four directions; d1/d3 footprints are12×20. Source d0 anchors layout. Other painted source facings contain small inconsistent module offsets and step orientations; those inconsistencies are not reproduced by per-facing fitting. Original per-facing left/top and logical640 square canvas are retained exactly: d0(-240,-196.7373), d1(-368,-212.7373), d2(-272,-212.7373), d3(-400,-196.7373). The shared raster viewport only saves memory, and its pixels are pasted back at one unchanged canvas origin.

Thirteen fixed module instances: waterwalk, hammock, sunbed, disc, trampoline, kids gates, mini slide, slide dock, beam, roller, totem, seesaw, LED buoy. Coordinator expressly confirmed the visible sunbed as the thirteenth instance. No blob tower or iceberg. The blue perimeter, broad entrance lane/spur, central connecting strip and detached stepping pads preserve large transparent water voids. Grid pitch is0.5 tile, floor thickness4 physical pixels. Rounded float tiles and actual low coupler plates are closed geometry. Distinct module convex ground hulls are disjoint; minimum conservative clearance0.06816 tile. Their intended contacts run through declared floor plates.

`module-provenance.json` records every source dependency SHA256 and every uniform instance matrix/inverse, material family, source feature declaration, scale and quarter turn. Settled READ-ONLY sources are water-rest, water-obstacles, water-curves and water-slides packs. All source vertices are copied into this pack's spec and transformed uniformly in u/v/z; source material coordinates are recovered through the inverse matrix. Slides receive a whole-instance lift to put their original -2.4 floor bottoms on water0. No prerendered sprite compositing, billboard or facing-specific recentering is used.

## Renderer/material reconciliation

Local materials_rest/curves/obstacles/slides.py retain source material code. `materials.py` dispatches using source material names, inverse-transformed coordinates and local-facing shade remapping. Plastic bounds/tiles, model_transform, cloth, slide/capsule/rim/mesh and sphere feature parameters are preserved. Curved frame/ramp and peg ink groups preserve their source grouping. The sphere retains depth-tested front/rear alpha compositing; RGB is not preblended into an opaque water background. Enclosed openings receive material-side ink, preventing exterior dilation from filling small bores. Curved hammock and open handles/gates remain meshes, not flat boxes.

## Local QA

- `verification.json`: PASS. 1,313 closed parts;1,628 joint AABB screens;473 low deck couplers with positive convex XY section intersection and vertical overlap;78 disjoint instance hull pairs;13 exact inverse vertex/material transfers; rotation edge invariance; all dependency hashes unchanged; exact source registration; no clipping.
- Saved straight edges:462 measured (d0 119,d1 125,d2 111,d3 107),118 unmeasured combined/route-occluded edges. Maximum RMS0.626 packedpx; maximum mean positional error0.632 packedpx. Unchanged tolerances: slope0.04, RMS1.5 packedpx, position1.5 packedpx, coverage90%, minimum horizontal span20 packedpx. Pixel centers are compared directly with the true0.4-physical-pixel bevel-inset bottom face edge, without an assumed outline shift. An independent projected route-face polygon/depth test identifies connector occlusion before fitting.
- `feature-qa.json`: PASS,99 measured checks. Saved isolated gate/handle openings; parabolic hammock thickness and520 hem samples; exact ellipsoid; alpha over air, rear green-member transmission, foreground depth and absence of shell pinholes; roller bores and trampoline ring openings.
- Explicit unmeasured cases:8 edge-on disc handle projections whose whole mesh width is below20 packedpx;18 roller bore observations on back-facing views; d3 sphere background-alpha in the full compound (only1 available interior air sample versus required301). The isolated d3 shell-alpha test still passes and full d3 rear-member transmission/depth checks pass. These exclusions are recorded rather than counted as pixel passes.
- `additional-qa.json`: PASS,10 checks. Four hammock cord endpoint/curved-frame distances beyond AABBs, all4 full-resolution RGB checks, opaque-sphere and bent-line negative controls.
-28 saved3×3 transparent water-space probes pass across4 views;4 projected geometry/rim occlusions are unmeasured.
- `source-size-review.json`: every original occupied bbox[320,834,2239,1811], every candidate bbox[322,836,2238,1810]. Candidate width1916/1919 and height974/977 preserve source scale closely.

AABB joints are screening evidence, not exact collision certification. Convex sections certify the declared low deck coupler intersections, not global mesh collision/gameplay paths. Shading, material appeal and art95 are not certified by numeric checks. Two-layer sphere rendering does not simulate refraction. Source-inspired proportions/materials visibly differ in some module details from the painted source; all four directions remain a coherent common assembly. Actual game water/floor maps, native visualSource alias, integration and adoption are coordinator-owned and have not been claimed here.

Failure evidence is retained: `initial-layout/` shows the earlier buoy-lane and stepping-pad layout; `initial-line-offset-failure.json` preserves463 failures caused by an inherited unsupported+2 pixel expectation; `initial-background-coverage-failure.json` preserves the d3 insufficient-background-sample result. No QA tolerances were loosened to produce passes.

## Reproduce

Run from this pack (read-only dependency packs must remain at recorded hashes):

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python prepare-extra.py
/tmp/ppaji-angle-survey-venv/bin/python render.py isolated-spec.json --out isolated
/tmp/ppaji-angle-survey-venv/bin/python prepare-curves.py
/tmp/ppaji-angle-survey-venv/bin/python render.py curve-isolated-spec.json --out isolated
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-features.py
/tmp/ppaji-angle-survey-venv/bin/python verify-additional.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
/tmp/ppaji-angle-survey-venv/bin/python finalize.py
```

`final-hashes.json` binds final candidate PNGs, provenance, implementation and local reports. Only this pack was modified; no main, shared registry, browser state, docs, other pack, staging or commit operations were performed.
