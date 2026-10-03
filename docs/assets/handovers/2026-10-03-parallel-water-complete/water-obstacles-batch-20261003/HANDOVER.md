# Water obstacles: seven common assemblies

Reviewable candidate pack only. `main_modified: false`; no runtime registration, main repository, aliases, shared reports, or browser state changed. Coordinator owns actual game floor/water captures, adoption, native visualSource aliases, and runtime checks.

## Integration identifiers

Pack: `water-obstacles-batch-20261003`.

- `rig_bridge`: two thick open yellow arches, four mounting flanges, eight blue floats.
- `rig_stepstone`: squat green/yellow rounded cushion over nine blue floats.
- `module_rig_beam`: narrow thick yellow beam with sloped entry noses and bolt heads, green underside, four short guards, two separate end docks.
- `module_rig_seesaw`: static level yellow plank, three green pads, two open handles, round green pivot with yellow axle caps, two yellow end stops, blue end banks and connecting spine.
- `module_rig_totem`: green cylinder, substantial yellow crown/foot, five levels of four fixed radial peg columns (20 total), each with a rounded spherical end. Source shows about two columns at a time; hidden columns are inferred consistently, never changed per facing.
- `module_rig_disc`: six alternating closed wedges, deep yellow rim, raised green radial welds and hub, six stout open handles, one blue side dock.
- `module_rig_kids_park`: fixed tall left/back and shorter right/front gates in d0, yellow crowns, hanging blue grips, low half-elliptical yellow cushion with two green curved side cheeks. The rejected full-cylinder interpretation is preserved.

Runtime input matches the earlier scoped packs: `review.json.assets`, original survey frame fields, `frames[].original`, and `frames[].candidate = candidates/ID/dN.png`. All 28 candidates are PNG RGBA, retaining full-resolution RGB. Original logical width AND height, packed density 4, footprint, left/top registration, and rotation origins are preserved. No per-facing recentering. The packed canvases for these seven assets are 512×512, as dictated by their own source frames.

## Reproduce

Run from any working directory:

```sh
/tmp/ppaji-angle-survey-venv/bin/python /Users/jangjunpyo/orca/workspaces/ppaji_tycoon/에셋만들기_v3/assets/generated/kairo-v4-simple-pilot/water-obstacles-batch-20261003/rebuild.py
```

Requires Pillow and NumPy. `rebuild.py` calls build, main render, structural/saved-pixel QA, isolated feature preparation/render/QA, report construction, and hash summary generation. It stops on a failed check and writes only this pack. Original source files are read-only inputs under `../angle-survey-20261002/`.

## Review and evidence

Open `index.html` for one scrolling report. Each `ID-board.png` contains original d0–d3, candidate d0–d3, and measured-line overlays on a floor grid at identical registered scale. A common crop is used for the entire asset board, with padding around the union of all original/candidate extents. `ID-candidate-detail.png` provides 2× nearest-neighbor inspection. `aperture-board.png` shows independently rendered arch geometry and transparent-hole test locations, with floor grids.

- `local-qa-summary.json`: exact final counts and source width/height ratios.
- `verification.json`: closed edge topology, all declared joint screens, quarter-turn edge invariance, registration, clipping, connected saved alpha, separate deck pieces, measured straight edges and all exclusions.
- `extra-qa.json`: swept circular-section radius at actual mesh vertices, analytic peg-root embedding/protrusion, pivot-cylinder equation, half-ellipse cushion and mounted curved cheeks, six closed wedges and their isolated saved colors, isolated aperture transparency and actual saved centerline coverage.
- `resolution-qa.json`: saved alpha lies on the two-packed-pixel coverage grid while full-resolution RGB varies within opaque 2×2 blocks.
- `source-size-review.json`: honest per-facing size differences. Source facings contradict one another; these are not separately fitted replicas.
- `candidate-hashes.json`, `source-hashes.json`: final candidate and immutable input SHA-256 values.
- `visual-review.json`: final direct image inspection and remaining interpretation differences.

Saved-line tolerances remain slope error ≤0.04, RMS ≤1.5 packed pixels, positional offset ≤1.5 packed pixels, visible coverage ≥90%, and minimum full span 20 packed pixels. Short/occluded segments are explicitly unmeasured. These tests measure exposed float edges and do not certify curves by proxy.

Isolated aperture tests retain the 3×3 clear alpha sample and ≥95% saved centerline coverage. Eight near-edge-on disc-handle projections are explicitly unmeasured for opening clearance; their horizontal leg separation is below 12 packed pixels. The first diagnostic incorrectly used Euclidean projected leg-center distance, which includes vertical displacement that cannot open a gap between vertical legs; its failures remain in `second-evidence/`. Wedge-color samples use isolated wedge surfaces because one original full-assembly sample was physically occluded by a handle; the original failure remains recorded. No failed full-assembly sample is counted as a passing visible wedge sample.

## Reusable model and material dependencies

`surface-spec.json` is actual common 3D geometry, not fitted sprites or camera-facing billboards. `size` is the canonical logical footprint, `vertices` use tile u/v and logical z, and physical geometry metric is `[32*u, 32*v, z]`. Closed meshes use quads or solid-color triangular quads with repeated final vertex. Quarter-turn projection is the existing Ppaji convention. `assembly.json` declares parts and intended joints; `features.json` declares curved paths and geometric test landmarks.

There are no external texture patches. Hex base colors and four-facing normal-based `shade` values live on the faces. `materials.py` adds full-resolution subtle paint and stronger molded-blue top/side lighting. Blue float faces carry `plastic_bounds`; cushion faces carry `cushion_bounds` (descriptive only). `line_finish.py` quantizes only coverage/ink to two packed pixels and retains supersampled full-resolution RGB; no fine/one-pixel exceptions are enabled. Peg core and rounded-tip names are intentionally grouped together for ink so their intersecting mount does not gain a false seam.

For a later compound playground, transform these vertices together, preserving part name groups. For an imported quarter-turn k, remap existing shade values by `(d+k)%4`. For arbitrary rotations, derive outward normals from the authored primitive semantics before recomputing light; face winding is not guaranteed to encode outwardness on every solid-color cap. If translating/scaling/rotating blue floats, transform `plastic_bounds` consistently or apply inverse subassembly coordinates before `materials.finish`; otherwise lighting accents will be sampled at the wrong location. A translation alone can update each bounds coordinate. A rotated non-axis-aligned imported float needs inverse local-coordinate evaluation rather than an AABB substitution. Parent compound footprint/frames own final registration. Never paste the completed dN sprites as geometry.

## Iterations and limits

`initial-evidence/` preserves the long-axis bridge interpretation and initial six structural failures (axle/crown gaps and spine spacing). `second-evidence/` preserves pre-size-refinement boards and first aperture/color diagnostic failures. `pre-coordinator-refinement/` preserves the reviewed thin beam/handles, full low cylinder, and prior peg inventory before coordinator feedback. Later changes restored thick sloped beam ends, stops, stronger floats, thicker disc rim and handles, source-consistent gate layout, and low curved cushion.

Generic AABB joint overlap is only an attachment screen, not exact collision certification. The peg mount proof is narrowly analytic for the declared cylinder. Numerical PASS is not an art95 score, exact original reconstruction, operational/accessibility certification, or runtime QA. Differences in source framing, painted white highlights, hidden details, peg visibility and gate height across source facings remain documented interpretation differences. Actual game placement and adoption remain with the coordinator.
