# Physical-alpha-locked color and runtime map review

Read this reference after one physical facility root has valid fixed-camera d0–d3. Use it when ImageGen
adds color/detail and the result must be shown on the real Ppaji Phaser grid. This track is review-only until
the user separately accepts color semantics, footprint, map fit, and production adoption.

## Authority stack

Keep these decisions independent:

```text
physical root and fixed-camera d0–d3       geometry and direction authority
corresponding-direction ImageGen result    color and material candidate
registered result plus physical alpha      outline/contact-locked candidate
physical-ground runtime scale              footprint and world-size authority
actual Phaser map                          placement and facing evidence
user decision                              approval authority
```

A correct map silhouette does not prove that the ImageGen interior is correct. A failed counter, opening,
screen, module count, rear facade, sign, palette, or occlusion remains failed after alpha locking.

## Direction-by-direction color transfer

For each target direction `dN`:

1. Use physical `dN` as the primary editable image. The approved concept may be a secondary palette and
   material reference; d0 art is not the geometry input for d1–d3.
2. Preserve the fixed camera, physical root yaw, canvas, and landmark inventory in the prompt and record.
3. Extract the provider result without generative cleanup that could change geometry.
4. Register the colored subject to physical `dN` with one uniform scale plus translation. Do not stretch,
   rotate, mirror, perspective-warp, or independently reframe it.
5. Measure raw silhouette IoU, bbox-aspect drift, projection edges, structural edges, palette drift, and
   semantic landmarks.
6. Reapply physical `dN` alpha to produce the locked guide. Require locked alpha IoU `1.000`.
7. Reinspect internal structure and landmarks on the locked image. Alpha locking does not repair them.

Preserve every provider original and retry as a distinct file. Recorded call count must equal the number of
preserved provider originals. A mismatch is a provenance failure even when the visible result is good.

For ordinary static-facility fanout, prefer exactly two inputs: corresponding physical `dN` plus a
geometry-free material-role board. Keep the accepted d0 color as palette provenance, but do not pass the
colored d0 image when it causes added outlines, tile seams, or a reconstructed front view. This narrower
input contract has been validated on open-front, closed-rear, and symmetric equipment.

### Interruption-safe color preflight

Before the first ImageGen call, write one `PREFLIGHT.json` beside the new color package. Bind it to the exact
physical-root SHA, corresponding physical d0–d3 image hashes, fixed camera, access landmarks, floor mode,
material-role board, d0 prompt and strict-color contract. Record `call_count: 0`,
`d0_imagegen_authorized: false`, `d1_d3_imagegen_authorized: false`, and the current user-approval gate.

On every resumed session, verify those paths and hashes before loading a previous colored result or calling
ImageGen. A changed physical root or direction hash invalidates all colored descendants. Earlier color
packages may provide offline palette provenance only; never inherit their geometry, alpha, pixels or PASS
state into a new physical root. After explicit roof/geometry approval, change only the approval/authorization
record needed to open d0; do not rebuild or silently substitute the already-reviewed physical inputs.

Run this skill's `scripts/verify_color_preflight.py --preflight <PREFLIGHT.json> --stage waiting-approval`
while stopped at the roof gate. After explicit approval, update the manifest and require the same verifier
with `--stage d0-authorized` before the first d0 call. A failed verifier is a hard stop, not a warning.

After d0 passes, close d0 authorization, open only d1-d3, bind the accepted d0 provider original and retry
prompt when applicable, then require `--stage fanout-authorized`. After all four direction calls and the
actual-map capture, close both call authorizations, bind final QA and current-worktree map evidence, and require
`--stage runtime-review`. These phases prevent a resumed session from repeating an already-consumed call.

### Pre-call physical runtime dry run

Before d0 ImageGen, run the planned runtime fitter against the physical d0 alpha alone. This costs no provider
call and must prove all of the following:

```text
footprint-scale bounds coordinate frame   same source-root frame as the physical render
derived uniform ground-fit scale           recorded separately from those source bounds
native logical foreground                  >= contract minimum
retained foreground ratio                  1.000
clipping                                   0
```

Never store already ground-fitted target bounds in `footprint_scale_bounds_d0_world` and then ask the runtime
packer to derive ground fit from them again. That applies the world scale twice. Record
`FAIL_RUNTIME_DOUBLE_GROUND_SCALE_NATIVE_MINIATURE` and stop before ImageGen if the physical-only dry run falls
below the native minimum. Retained ratio alone is non-diagnostic here: a one-pixel result can retain 100% of
its already tiny foreground.

## Strict pre-fanout and two-way structure gate

Do not generate all four directions before proving that the selected edit inputs can preserve the physical
render. Generate `d0` first and compare physical, provider raw, uniformly registered/alpha-locked, structural
edge, and native-size views. The provider may return a larger standard square; a recorded, uniform,
non-generative normalization back to the physical canvas is allowed. Aspect drift, non-uniform stretching,
rotation, perspective correction, or generative cleanup is not.

Require all of the following before opening `d1`–`d3`:

```text
raw silhouette IoU                              >= 0.90
bbox aspect drift                               <= 0.05
physical-alpha equality after lock              exact
structural edge precision / recall / F1         contract thresholds
signed projection                               PASS
native retained foreground                      1.000
native clipping                                 0
independent visual structure review             PASS
```

Structural-edge recall alone is insufficient because a newly illustrated candidate can retain physical
edges while adding many new edges. Measure precision, recall, and F1 in both directions. Detail exclusions
must be predeclared relative boxes wholly inside an existing display or surface-detail frame. Never exclude
doors, openings, counters, signs, roof edges, walls, foundations, or an entire facade to manufacture a pass.

If the first `d0` is a reconstruction, preserve it with `FAIL_GEOMETRY_REDRAW` and permit at most one targeted
retry. For that retry use physical `d0` as the only object input and a geometry-free material-role board as
the secondary input. The approved concept remains provenance for the palette but is not passed to ImageGen
when it induces redraw. Stop the package if the retry fails. A recorded `D0_STRICT_GATE_PASS` is the only
authorization to generate `d1`–`d3`.

Apply the same two-attempt limit independently to each fanout direction. When a closed rear is replaced by
an open front, the final retry may use a direction-local material board containing only roles actually
visible from that rear direction. The prompt must explicitly forbid front openings, interior fixtures, and
hidden controls. Do not pass a front-facing colored image into that retry.

If both provider attempts fail only because the otherwise correctly oriented first candidate added
micro-edges, a deterministic chroma-only fallback is allowed before rejecting the direction. Require the
source candidate to have acceptable direction and silhouette evidence. Blur only its aligned chroma, take
luminance and alpha from physical `dN`, perform no geometry transform, and rerun silhouette, two-way edge,
projection, native-size, and visual gates. This cannot rescue a wrong-facing or semantically wrong candidate.
Record `provider_call_used: false`, the failed source candidate SHA, blur strength, and output SHA. Use
`scripts/apply_low_frequency_chroma_glaze.py` for this bounded fallback.

After all four directions exist, compare material roles in relative physical regions such as roof, body, and
foundation. Check hue, RGB, saturation, and value drift by role rather than by whole-image average. A
non-generator reviewer must independently compare each colored direction with its corresponding physical
direction for landmark count/side, internal structure, material roles, lighting/style, cross-direction cyclic
identity, and native-size readability. Any one direction failure fails the package.

If a named existing display or control panel must carry identity cues, a frame-only, blank, or solid-color
result is a semantic failure. A corrective call may use a tightly cropped detail reference from the approved
concept only when its source path, crop rectangle, SHA-256, permitted target frame, and `geometry_authority:
false` are recorded. The prompt must forbid copying the reference frame, wall, projection, or geometry, and
the independent reviewer must prove that all new surface detail stays inside the pre-existing physical frame.

Do not regenerate a direction that already passed merely to make a new folder self-contained. It may be
inherited only if the current physical image SHA and material-role contract are unchanged and a preserved
independent review explicitly passed that direction. Record source package and hashes, then rerun current
registration, edge, material, cross-direction, native-size, and independent gates over all four directions.
Package-level failure in the source never becomes package-level approval in the destination; only the named
direction evidence is reusable.

## Runtime packing

Read canonical `size`, render canvas, and anchor from the live data/contracts. If the physical package size
differs, keep it as an explicit proposal instead of replacing the live value. Derive one facility-wide logical
runtime scale from the declared footprint-scale bounds and use it for d0–d3. For
`full-footprint-integral`, those are the owned floor/foundation bounds, not complete-root, roof, awning, sign,
trim or alpha bounds. Never fit each colored direction independently to its alpha bbox.

The bounds must remain in the source physical-root coordinate frame. Record the derived ground-fit multiplier
as a separate field and assert that the measured bound extent matches the physical floor/foundation extent
within package tolerance. If a root has already been destructively scaled, bake or declare that state once;
do not preserve post-fit bounds and multiply them again at runtime.

At integer review density `D`:

```text
physical canvas        = logical review canvas × D
physical runtime scale = logical physical-ground scale × D
physical contact       = logical contact × D
```

Crop only transparent source margins before uniform resizing. Align the resized physical bottom contact to
the rotated footprint contact. Record source/output hashes, alpha bboxes, paste offset, contact delta,
retained foreground ratio, and clip verdict for every direction.

If fitted pixels would clip horizontally, preserve scale and add the smallest symmetric transparent guard
that removes clipping. Shift the canvas center and target contact by the same guard. This changes only the
review canvas, not world size or placement. A validated batch used two logical texels per side at density 4;
remeasure instead of treating that value as universal. Vertical body height follows the same preserve-scale
rule.

Report the smallest required height increase per direction even when it is only one or two logical pixels.
Do not squeeze the candidate into the old canvas. On live adoption, update canvas height and bottom anchor
atomically with the selected sprites; until then keep the result review-only.

After explicit live-adoption approval, the guard becomes a named render-contract field, not invisible image
padding. Derive the full canvas and anchor from the footprint base plus the symmetric guard; run ground
geometry measurement on a logical view with the guard stripped, but serve and hash the full unchanged PNG.
This separates world placement from anti-clipping padding and prevents a gate from misreading transparent
guard pixels as a larger physical footprint.

The runtime pack may advance only when:

```text
one facility-wide physical-ground scale    recorded
d0–d3 output density and dimensions        exact
retained foreground ratio                  1.000 each
native logical foreground                  contract minimum met each
clip count                                 0
live atlas/data/render contract modified   false
production approved                        false
```

Also require recorded structural-body coverage and visual overhang bounds. A package with an undeclared
live/package footprint mismatch, missing visual-mass measurements, or a proposed canvas that differs from the
live contract remains conditional even when retained foreground and clipping pass.

## Actual Phaser review

Use a review-only provider and query. Do not copy candidates into the accepted pack or atlas merely to make
the scene load. The review scene must use the normal placement and `facings: 4` transforms, including slot,
entry, exit, and service-face rotation.

Before capture, query the workspace build-identity endpoint when available and compare its branch/path or
source identity with the current checkout. Do not reuse a sibling worktree's dev server. Confirm the review
manifest is served as JSON rather than a Vite fallback HTML page.

If the visual review map uses water-separated islands, connect every display plaza to the real park gate
with guest-walkable paths. Keep the normal `placement.check()` reachability gate. Do not bypass
`unreachable`; widen the review plaza or path so all four placements remain reachable after earlier
directions occupy their footprints.

Recount expected facilities from the current data rather than hard-coding an old total. For `N` four-facing
facilities require:

```text
groups                   N
placements               4N
facings                   exactly [0,1,2,3]
texture key per placement facility/<id>:d<facing>
storage keys             unchanged before/after review
browser console errors   0
navigation/zoom controls functional
```

Capture one overview and one focused d0–d3 map screenshot per facility. Show automated package state in the
review UI so a well-aligned held candidate cannot be mistaken for an accepted asset.

## Footprint revision after map review

When the user says an asset is too small or too large, do not solve it by arbitrary sprite scaling. Treat a
new `w×d` as a separate footprint proposal:

1. keep the current canonical size unchanged;
2. render current versus proposed footprint at the same physical-root authority;
3. recompute uniform ground fit, rotated d1/d3 footprint, canvas/body height, contact, slots, access, and
   occupied tiles;
4. show both options on the actual map;
5. update data, render contract, directions, slots/access, and atlas only after explicit approval.

A rectangular proposal must prove both orientations. For example, a proposed `2×1` becomes `1×2` in d1 and
d3; a d0-only size preview is insufficient.

## Evidence record

Save a machine-readable manifest containing at least:

```text
source batch and SHA-256
facility/direction count
per-facility automated state
per-direction source and output SHA-256
failed provider attempts and call count
direction-local prompt/provider retry lineage
strict d0 gate and independent-review SHA-256
two-way edge precision, recall, and F1
cross-direction material-role measurements
logical and physical canvas
base canvas and transparent guard
uniform runtime scale
source-coordinate footprint bounds and physical-only dry-run verdict
contact delta
retained foreground ratio and clipping
actual-map URL and current-worktree identity
texture-key count
storage/console/control results
live_files_modified: false
runtime_adoption_started: false
production_approved: false
```

Stop at `RUNTIME_FIT_USER_REVIEW`. Map-fit acceptance may validate this workflow without accepting every
individual colored facility; held facilities remain in their corrective queue.
