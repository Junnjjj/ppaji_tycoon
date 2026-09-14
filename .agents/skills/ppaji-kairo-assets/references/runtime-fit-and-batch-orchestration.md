# Runtime fit and supervised facility batches

Read this reference after physical d0–d3 passes when a facility must be shown on the game grid, or before
coordinating several facility packages in parallel. It does not authorize paid provider calls, retries, or
live adoption; those remain explicit task scope and approval decisions.

## Contract preflight and proposal separation

Read the current facility `size` from `src/data/kairo-facilities.json` and its canvas/anchor from
`src/assets/kairo-render-contract.json` before consuming package metadata. Compare those values with the
physical package's declared footprint.

- Exact match: continue with `canonical_live_size` equal to `package_size`.
- Intended size change: preserve the live value as `canonical_live_size`, record the candidate as
  `proposed_size`, and stop preflight at `PREFLIGHT_FOOTPRINT_PROPOSAL_READY` until current-versus-proposed
  four-facing map evidence is shown.
- Undeclared mismatch: stop with `FAIL_FOOTPRINT_CONTRACT_MISMATCH_UNDECLARED`.

Never let a worker, concept note, Blender custom property, or review canvas silently replace the live size.
A proposal may be rendered and reviewed without changing live data, but its result must remain namespaced as a
proposal through physical, color, runtime and map records.

## Ground scale is authoritative

Read the facility's canonical `size` from `src/data/kairo-facilities.json`. Do not infer it from the concept,
name, module count, old prose, or sprite canvas. For canonical footprint `w × d`:

```text
d0, d2 footprint    w × d
d1, d3 footprint    d × w
tile diamond        32 × 16 texels
tileWorld           22.627417 Blender units
base canvas width   (w+d) × 16 texels
base ground height  (w+d) × 8 texels
```

Declare three different bound classes before rendering:

```text
footprint_scale_bounds   owned integral floor/foundation, or the declared structural ground-contact hull
structural_body_bounds   wall/shell or primary equipment body, excluding roof and decorative attachments
visual_overhang_bounds   complete visible root, including roof, awning, sign, trim and upper projections
```

For `full-footprint-integral`, `footprint_scale_bounds` are the owned floor/foundation bounds. Roofs,
awnings, signs, trim and upper projections never participate in ground scale. For `transparent-no-floor`,
declare the structural feet/base/contact hull that owns placement; do not substitute the complete roof or
alpha bbox. Use one uniform ground-fit scale:

```text
scale = min(w × tileWorld / footprintWidth, d × tileWorld / footprintDepth)
occupiedWidthTiles = footprintWidth × scale / tileWorld
occupiedDepthTiles = footprintDepth × scale / tileWorld
```

`footprintWidth` and `footprintDepth` must be measured in the same source-root coordinate frame as the
physical render. Store this source measurement separately from `scale` and the fitted target bounds. Before a
colored provider call, run physical d0 alpha through this exact calculation and reject a native-size miniature
even when retained foreground is `1.0`; that ratio says nothing about absolute visible size.

Do not non-uniformly stretch a root to hide an aspect mismatch. Record occupied dimensions and per-side
shortfall or overflow. Also record structural-body coverage on both ground axes and visual overhang on all
four sides in tile units. A footprint guide, matching canvas width, centered alpha bbox, or exact floor alone
does not prove that several same-family buildings have consistent visible mass.

Before modeling a batch, declare one visual-mass target per facility family. For compact enclosed roofed
rooms, use a default target wall/shell coverage of `0.90` per ground axis with diagnostic tolerance `±0.03`
unless the approved concept or gameplay requires a different declared value. Keep the within-family coverage
spread at or below `0.04` per axis. These are pre-user-review diagnostics, not permission to stretch geometry.
Record exceptions and show them at the same map scale. Missing measurements or undeclared threshold failures
block runtime fit with `FAIL_VISUAL_MASS_CONTRACT`.

Before measuring, apply the facility's declared floor contract from
[ground-contact-and-floor-mode.md](ground-contact-and-floor-mode.md). A `full-footprint-integral` root must
measure its owned floor/foundation against the same canonical bounds. A `transparent-no-floor` root must not
gain a broad mat merely to make the alpha bbox fill the simulation footprint. Preserve this mode through all
four directions and the actual-map review.

## Derive the review canvas

Render all four physical directions with the fixed game camera and the ground-fit scale. Keep one union
framing and bottom anchor. Let projected total height be the union alpha height at native game texel scale:

```text
bodyH candidate  = ceil(projectedTotalHeight - baseGroundHeight)
canvas candidate = ((w+d)×16, baseGroundHeight + bodyH candidate)
anchor candidate = (canvasWidth/2, canvasHeight)
```

Compare this candidate with the current `src/assets/kairo-render-contract.json` entry. If the old canvas is
shorter, show two grid previews:

1. current-canvas fit, which exposes how much the footprint would shrink;
2. footprint fit, which preserves ground scale and exposes the canvas/body-height change.

Generate both previews whenever width, height, anchor, body height, or guard differs, not only when the old
height is shorter. A proposed canvas that avoids clipping does not pass the current contract; keep it at
`RUNTIME_FIT_PROPOSAL_USER_REVIEW` until the user chooses the contract.

Preserve the fitted silhouette. Do not translate it until alpha is clipped merely to force the contact
vertex onto a target pixel. Record contact delta and edge touching separately. A deterministic local trim or
minimal symmetric transparent guard may be proposed only after the physical fit is accepted. The guard must
move the canvas center and target contact by the same amount so world placement does not move. Record the
base contract canvas, guard per side, expanded review canvas, and retained foreground ratio. Do not reduce
the ground-fit scale to avoid clipping. Runtime-fit status remains
`CONDITIONAL` until the user approves the footprint, visual height, contact, and every required direction.

If the user later approves a guarded candidate for live adoption, encode the guard explicitly instead of
pretending the footprint-derived base canvas became wider:

```text
live canvas width = base canvas width + 2 × guard per side
live anchor x     = base anchor x + guard per side
```

The runtime draws the complete guarded canvas, while geometry/contact QA removes exactly that many logical
transparent texels from both sides before measuring the footprint diamond. Keep the live PNG unchanged for
that measurement. Add a contract regression test for canvas, anchor, body height, and guard. If the engine
cannot represent or validate the guard, stop adoption rather than shrinking the asset or hiding the mismatch.

For a high-density review provider, apply the same logical transform at the chosen integer density. A
density-4 review therefore multiplies canvas, contact, and uniform runtime scale by four; it does not derive
a new fit from each colored alpha bbox. Require retained foreground ratio `1.0` and clip count `0` before
opening the actual-map gate.

Save at least:

```text
placement-preview/
├── runtime-footprint-metrics.json
├── <asset>-runtime-footprint-preview.png
└── runtime-preview/d0...d3.png
```

The metrics must state the simulation footprint, rotated footprint, physical bounds, uniform scale, occupied
tiles, current and proposed canvas/bodyH/anchor, contact deltas, source/output hashes, and
`live_files_modified: false`.

The physical bounds section must separately include `footprint_scale_bounds`, `structural_body_bounds`, and
`visual_overhang_bounds`, plus body-coverage ratios and per-side overhang in tile units. Do not use a field
named `root_ground_width_depth_world` when it actually contains the complete root or roof extents.

Read [physical-alpha-locked-runtime-review.md](physical-alpha-locked-runtime-review.md) for the complete
review-provider and actual Phaser map evidence contract.

## Geometry lane before a paid call

Classify each facility independently:

- Prefer scripted Blender geometry for repeated stalls, locker banks, counters, cabinets, tables, doors,
  partitions, and simple room shells when component counts and access semantics can be modeled explicitly.
- Use dense image-to-mesh when irregular massing or concept-defining curved/sculpted relationships make a
  scripted root uneconomical.
- Preserve a user-approved dense pilot as its chosen lane. Do not silently replace it with a simpler root.
- Record `geometry_lane`, justification, input hash, and expected stop gate before invoking a provider.

## Supervised batch topology

Use Orca orchestration when the user requests a coordinated parallel wave. Load Orca's version-matched
orchestration guide before commands. Create one Run, then one independent Task per facility for the current
wave. Workers may share the active worktree only because their output folders are disjoint; do not create new
worktrees merely for convenience.

Use an explicit concurrency limit. Start with three workers for paid Meshy or built-in ImageGen stages unless
the user chooses another limit or known provider capacity supports it. Create all independent tasks before
waiting. The coordinator processes `question`, `escalation`, and `worker_done`, then releases or reuses every
settled worker according to the Orca guide.

Only the coordinator writes the batch manifest and review board. Each worker may write only:

```text
assets/generated/kairo-v4-simple-pilot/<asset-id>/<run-id>/...
```

Workers read approved crops and contracts but may not edit them. They must record absolute skill/reference
paths and SHA-256, use a credential only through the validated adapter, redact provider responses, validate a
real nonempty GLB before PASS, preserve the original GLB read-only, and never fabricate provider success.

## Approval-gated waves

Keep the DAG shallow and use user decisions between expensive or irreversible stages:

| Wave | Worker outcome | Required stop |
|---|---|---|
| 0 | input/hash/data/render-contract preflight and geometry-lane record | `PREFLIGHT_READY` |
| 1 | scripted root or real provider GLB, imported dense d0 and same-scale evidence | `DENSE_BASELINE_UNREVIEWED` or `SEMANTIC_BLOCKOUT_UNREVIEWED` |
| 2 | accepted physical root rendered d0–d3 with projection and landmarks | `PHYSICAL_DIRECTIONS_USER_REVIEW` |
| 2R | same-scale body/roof family comparison and measured overhang | `ROOF_PROPORTION_USER_REVIEW` |
| 3 | only a roof-approved root receives ImageGen color guides | `COLOR_GUIDE_USER_REVIEW` |
| 4 | native-size grid/contact/footprint preview | `RUNTIME_FIT_USER_REVIEW` |
| 5 | approved atomic live adoption, atlas bake, runtime and build verification | `PRODUCTION_REVIEW` |

Do not let a worker continue into the next wave because an earlier automated gate passed. A provider failure,
wrong direction, moved landmark, texture warning, or background failure remains in that facility's package;
do not hide it with a later worker or silently retry a paid call. Adjacent-direction ImageGen fallback follows
`physical-direction-validation.md`: target physical geometry remains the sole authority, the reference
direction must have independently passed, and the corrected intermediate must pass before a sequential reuse.
For enclosed or roofed facilities, Wave 3 also requires `ROOF_PROPORTION_USER_APPROVED` for the exact current
physical-root SHA. Read `roof-proportion-and-visual-mass-gate.md`; an older approval cannot be inherited after a
roof, shell, floor, attachment or hierarchy change.

## Batch completion criteria

A wave is ready for user review only when every dispatched facility has either the exact expected stop status
or an explicit typed failure. Missing workers are not counted as PASS. The coordinator review board must show
facility ID, footprint, access kind, geometry lane, current gate, primary evidence path, and failure/warning.

Live adoption is deliberately serial at the shared-data boundary. Even if facilities were produced in
parallel, `facings`, slot/access transforms, accepted sprite copies, atlas bake, and global verification happen
only after explicit per-facility acceptance and coordinator conflict review.
