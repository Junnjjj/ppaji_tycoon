# Roof proportion and visual-mass gate

Read this reference for every enclosed or roofed static facility before any direction-specific coloring. The
floor footprint, structural body and roof are three different contracts. An exact tile floor does not prove
that the building or roof has the right visible scale.

## Required order

Use this order and do not merge the gates:

```text
floor/footprint contract
→ structural-body and roof proportion
→ physical d0–d3 and access landmarks
→ ROOF_PROPORTION_USER_APPROVED
→ strict d0 color pilot
→ colored d1–d3 fanout
```

Color, alpha locking, canvas packing and a successful map placement cannot rescue an undersized, elongated or
family-inconsistent roof. Do not invoke ImageGen while the roof gate is unreviewed or failed.

## Measure one physical root

Measure the complete Blender root after the owned floor or declared contact hull has been fit to the proposed
simulation footprint with one uniform world scale. Never derive these measurements from a cropped sprite or an
ImageGen alpha box.

Record at least:

- canonical live size and any separate proposed size;
- floor/contact bounds in tile units;
- structural wall/shell width, depth and height;
- roof width, depth, ridge/eave height and per-side overhang;
- roof-to-body width and depth ratios;
- body coverage against the owned floor on both axes;
- complete-root visual overhang separately from footprint occupancy;
- physical-root SHA and fixed-camera d0–d3 image hashes.

Construct an integral floor from one canonical tile unit. For footprint `w x d`, choose one admissible
physical unit from the available envelope and set floor dimensions to exactly `(unit*w, unit*d)`. Never derive
floor X and Y independently from imperfect inferred mesh bounds; even a visually subtle fractional aspect
error invalidates the footprint gate. Verify the declared ratio before any native-scale render.

For compact enclosed roofed rooms, inherit the family wall/shell diagnostic target from
`runtime-fit-and-batch-orchestration.md`: `0.90 ±0.03` per ground axis and within-family spread no greater than
`0.04`, unless an approved design records another target. Do not invent a universal roof ratio. Select one or
more explicitly accepted same-family facilities as the roof-mass references, record their hashes and measure
the candidate against that declared range.

## Same-scale review evidence

Create both of the following without per-asset or per-direction resizing:

1. a d0 comparison containing the candidate, its earlier rejected version when applicable, and the accepted
   same-family references at the same physical ground-fit scale;
2. a d0–d3 board from the candidate's one complete root at yaw `0/90/180/270`, one camera, one union framing
   and one bottom anchor.

Render the candidate and family references again at the shared native world scale (currently 256 px canvas,
orthographic scale 256, and the live `tileWorld`). Do not compare independently framed review renders. The
native-scale pass must measure total height in tile units, structural-body coverage, roof-to-body ratio and
per-side roof overhang. This gate is intentionally before ImageGen: a well-framed 1024 px render can hide a
facility that becomes miniature, oversized or too tall on the actual map scale.

If a dense result has a usable roof but wrong wall/body mass, a separately hashed component-level derivative
may adjust the wall band, roof-height band or below-eave ground coverage. Record every factor and keep the
complete root uniformly scaled to the owned floor. Never use nonuniform complete-root scaling, never modify
the read-only provider GLB, and invalidate all earlier color descendants after such a correction.

Show the proposed footprint grid or calibrated tile diamond. A roof may overhang the footprint and enlarge the
review canvas, but its overhang does not change the canonical tile size. Do not change `2×3` to `2×4`, shrink
the floor, or non-uniformly stretch the root merely to make the roof look large enough.

The review must answer separately:

- does the wall/shell occupy the intended footprint mass;
- does the roof length and width match the accepted family scale;
- are ridge height, eaves and awning projections intentional;
- do all four rotations preserve the same roof and access-side relationships;
- is any footprint change still only a proposal rather than a live decision.

## Gate and invalidation

Write `roof-proportion.json` and stop at `ROOF_PROPORTION_USER_REVIEW`. Only an explicit user decision over
the same-scale evidence may set `ROOF_PROPORTION_USER_APPROVED` and authorize the strict d0 color call.

If the floor, body, roof, attachments, hierarchy or physical-root SHA changes after approval, invalidate every
colored descendant with `COLOR_GUIDE_SUPERSEDED_PHYSICAL_CHANGED` and reopen the roof and physical-direction
gates. Old color images remain provenance only; they may not be inherited into the new package.

Minimum record:

```json
{
  "state": "ROOF_PROPORTION_USER_REVIEW",
  "physical_root_sha256": "...",
  "canonical_live_size": [2, 2],
  "proposed_size": [3, 2],
  "floor_bounds_tiles": [3.0, 2.0],
  "body_coverage": [0.90, 0.90],
  "roof_to_body_ratio": [1.12, 1.14],
  "roof_overhang_tiles": {"-x": 0.10, "+x": 0.10, "-y": 0.12, "+y": 0.12},
  "family_references": [{"asset_id": "shop", "physical_sha256": "..."}],
  "same_scale_resizing": "NONE",
  "imagegen_calls": 0,
  "live_files_modified": false
}
```

The numbers above illustrate fields only; use measured values and the declared family target.
