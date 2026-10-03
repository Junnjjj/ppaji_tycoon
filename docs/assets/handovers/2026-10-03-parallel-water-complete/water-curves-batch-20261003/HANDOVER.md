# Water curves candidates — coordinator handover

Completed four common assemblies and16 source-density PNG candidates, all visually inspected in four directions. Candidate-only: `main_modified=false`; actual game floor/water-map QA and adoption are still coordinator work. No main checkout, shared review app, runtime packs, docs, browser state or source files were edited.

Pack root: `assets/generated/kairo-v4-simple-pilot/water-curves-batch-20261003`.
Integration IDs: `rig_blob`, `rig_iceberg`, `module_trampoline_w`, `module_rig_roller`.
Candidate convention: `candidates/ID/d0.png` through `d3.png`.
`review.json` uses the same assets/frames/original/candidate/selected schema as existing scoped review packs. Native visualSource aliases remain coordinator-owned.

## Review and evidence

Open `index.html`: a scrolling report with all four assets, registered full-canvas original/candidate/line-overlay boards, floor grids, source-size comparisons, candidate close-ups and isolated aperture board. Every registered panel is512×512 (original logical128×128 at density4); no panel is clipped or independently recentered. `candidate-hashes.json` records all16 PNG hashes; `source-hashes.json` records16 immutable originals plus full survey.

Local QA: **PASS** in `verification.json` and `extra-qa.json`.

- 73 closed parts,95 declared contact checks, connected assembly graphs, cyclic edge invariance, original registration and no clipping; all16 saved sprites have one connected opaque component.
- 26 measured saved-pixel base edges PASS;6 short/occluded segments are explicitly unmeasured. Thresholds are unchanged: minimum20packedpx span,12 samples,90%coverage, slope error≤0.04, RMS≤1.5packedpx, offset≤1.5packedpx.
- Actual capsule, torus and roller mesh vertices satisfy their elliptical surface equations to <4e-15. Iceberg summit is offset, the middle ridge is irregular, and all5 holds mount on explicitly named actual mound triangles.
- 30 aperture/mesh samples PASS:4 tower bays,4 isolated open-ring centers,4 opaque recessed-mesh centers,18 front-view ramp-bore samples.18 rear-ramp samples are **UNMEASURED_BACKFACING**, not passes: the inclined physical plate is nearly edge-on from those views.
- The trampoline mesh physically overlaps the inner torus at its recessed height. The roller axle and bearing centers share the same declared axis. All meshes are closed, including each of9 bored plate cells.

These are scoped structural and pixel checks, not art95, exact collision certification, source3D recovery or runtime QA. AABB contacts remain broad checks, with additional exact checks only for the named curve/mount features. The isolated tower-bay test samples the exposed bay face in each direction; a volume-center ray was initially occluded by a post and was not a valid aperture sample. This sample correction and old failure are recorded rather than hidden.

## Final visual interpretation

- Blob: one long rounded green/yellow capsule, squat29.64logicalpx tower, thick four posts and rounded green handrail caps, six yellow ladder rungs, blue tiled float and fixed tip grip. Tower dimensions use one common affine height change; no facing-specific fit. Final width/source is1.004–1.009; height/source1.011–1.106.
- Iceberg: pale irregular faceted mound with an authored asymmetric shoulder, blue perimeter around pale inset deck tiles, five holds on d0's right flank. Front is largely blank; the same hold side rotates behind the mound. Source hold placements change between directions, so all four original patterns cannot coexist on one common model. Width/source0.979–1.000; height/source0.932–1.050.
- Trampoline: eight alternating rich green/warm yellow sectors, actual closed torus with pale crown highlights, dark recessed woven-mesh material, perimeter grips and enlarged fixed blue entry dock. Source d2/d3 ring/dock are smaller than d0/d1; the common model keeps one size. Width/source1.084–1.162; height/source1.045–1.132. This remaining size interpretation is explicit, not a per-facing recenter/scale correction.
- Roller: transverse striped rounded cylinder, stout A-frames with rounded capsule crowns, axle braces/bearings, externally mounted yellow grips, nine small real ramp bores and tiled blue deck. Width/source0.953–0.957; height/source1.011–1.034. Rear plate apertures are naturally hidden at the steep viewing angle.

Initial boards and failures remain in `initial-visual-evidence/`; pre-coordinator refinement boards/build/materials/QA remain in `pre-coordinator-refinement/`. The initial oversized-hole attempt was replaced by a correct2packedpx line finish that draws enclosed-aperture ink onto the material side instead of expanding into holes. Final bore radius is0.060tile, with no1packedpx exception. No thresholds were relaxed.

## Reproduce

```sh
/tmp/ppaji-angle-survey-venv/bin/python assets/generated/kairo-v4-simple-pilot/water-curves-batch-20261003/rebuild.py
```

This runs build, all16 candidate renders, isolated render preparation/all16 isolation renders, both QA scripts and report/hash generation. `build.py`, `geometry.py`, `render.py`, `materials.py`, `line_finish.py`, `surface-spec.json`, `assembly.json` and `features.json` are pack-owned. Helpers were copied from the read-only wave3 slide pack and then scoped locally.

## Reuse in the final compound playground

Reuse actual `surface-spec.json` faces/vertices; never paste completed sprites. All coordinates are canonical tile u/v plus logical-pixel z. `size` and original `frames` define quarter turns; all facings use the same parts. Triangles are serialized as four vertices with the first repeated at the end, which this renderer supports. There are no camera-facing parts or fitted sprites.

`surface-spec.json` vertices are final authoritative geometry. Some `assembly.json` primitive construction records predate a common vertical affine; those parts explicitly carry `construction_to_canonical` so a consumer must not treat old p0/p1/radius fields as final vertices. Reusing final faces avoids ambiguity. Joint names refer to `name.split('/')[0]` groups.

Material dependencies to carry into a compound renderer:

- Per-face `shade` contains four camera-facing shade factors; remap its entries if the component receives a canonical quarter-turn before compound rotation, or recompute from transformed normals.
- `plastic_tiles=[x0,y0,x1,y1,nx,ny,z1]` samples tiled plastic in original component coordinates. `ice_panel=true` paints the pale inset inside the blue rim in those coordinates.
- `inflatable_rim_paint`, `capsule_paint`, and `mesh_paint` are canonical-coordinate shading/paint flags. Roller paint is currently selected by the `striped-roller/` part-name prefix. If component names are prefixed, preserve a material semantic name or adapt that lookup.
- When transforming geometry into a compound, evaluate these materials using the inverse component transform (or consistently transform their coordinate parameters). Do not blindly evaluate them against compound u/v/z.
- Render label grouping merges all `rampcell-*` faces into one plate group, and `frame-*`, `framecap-*`, `framecrown-*` by frame index; this suppresses artificial primitive-boundary ink while preserving true shape. `line_finish.py` uses2packedpx coverage throughout, preserves enclosed voids, and retains full-resolution RGB. No one-pixel exception or whole-RGB nearest downsample is used.

Remaining work: coordinator's actual renderer ground/water-map captures, final visual acceptance and optional adoption. No worker runtime QA claim is made.
