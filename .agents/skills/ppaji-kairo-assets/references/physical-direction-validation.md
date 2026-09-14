# Physical direction and projection validation

Use this reference for every static facility whose d0-d3 images must depict one actual object. The objective
is fail-closed proof of the Ppaji projection and rigid rotation, not a plausible-looking four-panel sheet.

## Production invariant

A prompt-only multi-panel image, four independently generated directions, or a d0-to-d1 image chain can
be used only as `CONCEPT_DIAGNOSTIC_ONLY`. None can become directional geometry evidence because the
generator is free to change camera elevation, edge axes, hidden surfaces, component positions, and access
landmarks between panels.

Production directions require this authority stack:

```text
approved concept and immutable hash               art/identity authority
one Blender root containing the complete hierarchy physical geometry authority
fixed-camera root renders d0/d1/d2/d3              direction authority
per-direction styled render or authored repaint    color/detail candidate
physical masks, depth, landmarks and overlays       validation authority
explicit user decision                              art approval authority
```

A clean image may still fail physical proof. A physical render may still fail concept fidelity. Keep those
statuses separate.

## Choose the geometry lane

- Use scripted Blender geometry for repeatable stalls, locker banks, counters, cabinets, tables, room
  shells, doors, partitions and other component-defined facilities.
- Use a dense image-to-mesh baseline plus refinement for irregular massing, sculpted profiles, curved
  shells, or concepts whose relationships cannot be preserved economically with primitives.
- Keep a simple blockout at `SEMANTIC_BLOCKOUT` until same-scale d0 concept evidence proves the
  concept-defining profiles, openings, counts, spacing and contacts.
- Never downgrade a complexity-locked dense lane because a provider is unavailable. Stop at the blocked
  state or obtain explicit approval for a lane change.

Read the Hermes
`concept-faithful-refined-geometry-gate.md` and
`single-view-image-to-mesh-four-direction-pilot.md` when the selected lane requires them.

## Immutable Ppaji projection contract

Read the live workspace contract instead of trusting prompt prose. The current Kairo values are:

```text
projection            orthographic
game-view yaw          45 degrees toward the +I/+J near corner
optical pitch          30 degrees down from horizontal
camera roll            0 degrees
tile diamond          32 x 16 texels
screen step +I        (+16, +8)
screen step +J        (-16, +8)
ground edge families  +/-atan(0.5) = +/-26.565 degrees
vertical family       90 degrees
camera zoom           1.0
```

Do not send only the verbal 45/30 values to Blender. Lock this axis and object-rotation convention from
the live render contract:

```text
game +I               Blender +X
game +J               Blender -Y
game height           Blender +Z
camera position unit  (+0.612372435696, -0.612372435696, +0.5)
camera rotation mode  XYZ
camera Euler XYZ      (60, 0, 45) degrees
camera quaternion     (w=0.800103145191, x=0.461939766256,
                       y=0.191341716183, z=0.331413574036)
```

The Blender Euler X value of 60 degrees is the object representation of a camera whose local `-Z`
optical axis pitches 30 degrees below horizontal. It is not a second elevation. Never substitute a
camera at Blender `(+X,+Y,+Z)` unless the asset's axes are explicitly normalized to the same game
`I=+X, J=-Y` mapping and the signed screen steps are revalidated.

Before asset work, render an engine-derived calibration box and run a positive and deliberate negative
control. Record the camera matrix or exact Blender camera metadata. A footprint guide is useful but does
not prove that generated art followed it.

Run the projection diagnostic:

```bash
python3 <skill-directory>/scripts/qa_projection.py --selftest
python3 <skill-directory>/scripts/qa_projection.py --layout single <physical-render.png>
python3 <skill-directory>/scripts/qa_projection.py --layout quadrants <diagnostic-sheet.png>
```

It measures signed diagonal and vertical edge families. A PASS supports projection only; it does not prove
root rotation, component identity, scale, anchor, or art approval. A FAIL blocks the direction.

## True d0-d3 proof

For an imported image-to-mesh result, do not assume the provider's local yaw is canonical d0. Before saving
the physical root, render provider-local yaw `0/90/180/270` under the fixed camera and select the one whose
public facade and asymmetric side landmarks match the approved concept. Record all four probe hashes and the
selected source-normalization yaw. This is an axis-normalization step below the physical root, not permission
to relabel d0-d3, mirror the mesh, or rotate the production camera. The normalized physical root must still
start at exact yaw zero.

1. Put every evaluated object and imported Empty under one documented asset root.
2. Freeze camera, target, orthographic scale, canvas, ground anchor and screen-space light.
3. Rotate only the complete root. Root pitch and roll remain zero:
   - d0 = 0 degrees
   - d1 = 90 degrees
   - d2 = 180 degrees
   - d3 = 270 degrees
4. Render untouched full canvases and record root-yaw metadata and four unique hashes.
5. Compute one union alpha bbox and preserve one bottom-center contact point.
6. Reopen the Blender file independently and rerun hierarchy, bounds, camera and rotation checks.

Do not relabel directions, rotate the camera, horizontally mirror art, or infer rotation from footprint
transposition. The workspace's legacy `rotation-check.ts` compares mirror similarity and can diagnose an
old placeholder convention; it cannot prove true physical `0/90/180/270` rotation.

The game offset transform must match those physical root rotations. For canonical local tile `(di,dj)`
inside footprint `w x d`, require:

```text
d0  (di, dj)
d1  (dj, w-1-di)
d2  (w-1-di, d-1-dj)
d3  (d-1-dj, di)
```

The old d1 formula `(dj,di)` has determinant `-1`; it is a reflection, not a 90-degree rotation. It may
remain only on an explicitly legacy two-facing save-compatibility path. A new four-facing asset cannot
PASS if its visual root uses physical yaw while slots, entrances, exits or occupancy use the reflection.

## Landmark correspondence

Create `geometry-landmarks.json` before modeling. For every count-critical part record semantic name,
count, owning component, local position or bounds, visible sides, access role, and permitted occlusion.

After rendering, create `landmark-correspondence.json`. Each direction must compare the same physical
landmarks against the corresponding physical render and colored candidate. Require:

- exact repeated-module count and order;
- cyclic screen movement of asymmetric landmarks;
- unchanged local relationships and attachment contacts;
- front-only features absent from the physical rear;
- closed/plain rear where required;
- no part moved toward the camera to stay readable;
- transformed access/slot overlay aligned with the painted door, counter, controls or use side.

Inspect every hidden face explicitly. A provider that copies a window, door, counter, sign, display or other
public feature onto an unapproved rear/opposite face fails as a typed semantic error, for example
`FAIL_DUPLICATED_WINDOW_ON_UNAPPROVED_HIDDEN_FACES`; it is not a harmless texture warning. Preserve the
provider GLB read-only. A repair must be a separately hashed derivative with typed face selection or a new
provider result, followed by fresh d0-d3, landmark, projection, native-scale and independent-reopen evidence.
Do not color a candidate while this failure is open.

A manual sentence such as "looks coherent" is not correspondence evidence. Include projected centers or
bounds and an overlay for every important landmark.

## Color and pixel-art stage

Use the corresponding physical direction as the primary editable image. Use the approved concept only as
an additional palette/material/detail reference. Never use d0 art as the primary edit target for d1-d3.

For each colored direction:

1. compare raw colored alpha against the matching physical alpha;
2. record silhouette IoU and bbox-aspect drift;
3. show a cyan/red silhouette overlay;
4. reapply the physical alpha/depth/silhouette when producing a locked guide;
5. inspect internal edges and landmarks after alpha locking;
6. keep projection, silhouette lock, internal structure, runtime fit and art approval as separate statuses.

Registration may use one uniform scale and translation for that direction. Do not warp, stretch, rotate,
mirror, or independently crop the styled result to make it appear closer. The physical direction remains
the geometry authority after registration.

Physical-alpha locking intentionally discards ImageGen's outer silhouette. It stabilizes projection,
ground contact, and apparent rotation in the runtime sprite, but cannot correct invented or relocated
interior lines, changed component counts, a public facade copied onto the rear, a dark/empty interior, or
palette drift. Inspect the locked interior and landmarks again; a map placement that looks aligned does not
turn a semantic failure into PASS.

Candidate thresholds are diagnostic, not automatic art approval:

```text
physical camera/root metadata     exact
required landmark coverage        100%
count-critical components         exact
silhouette IoU                    >= 0.90 before physical lock
bbox aspect drift                 <= 5%
locked physical alpha IoU         1.000
projection edge families          PASS
floating/fused critical parts     0
```

## Required package evidence

A directional package cannot be `PASS` unless all of these exist and validate:

```text
approved-source.json
geometry-landmarks.json
geometry-state.json
physical-rotations.json
projection-validation.json
landmark-correspondence.json
union-canvas.json
visual-review.json
physical/d0.png ... physical/d3.png
overlays/projection-*.png
overlays/landmarks-*.png
```

`qa_4up.py` only checks canvas parsing and occupancy spread. Exit code zero means that measurement ran,
not that the asset passed. Do not convert its result into semantic, projection, rotation or production
approval.

## User rejection gate

Any user rejection of angle, rotation, landmark placement, art quality or map fit immediately makes the
whole required direction package `FAIL_USER_VISUAL_REJECTION`. Persist the issue and named examples in
`visual-review.json`; invalidate earlier overall PASS counts. Only newly shown replacements followed by
explicit acceptance may close the gate.
