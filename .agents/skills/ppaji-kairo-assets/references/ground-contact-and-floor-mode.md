# Ground contact and facility floor modes

Read this reference when a facility concept, physical root, sprite or actual-map review contains a floor,
foundation, slab, plinth, deck, mat or broad ground-contact component. The objective is one declared floor
owner and one direction-stable contact rule rather than a different base treatment per asset or facing.

## Declare exactly one mode

Every static facility package must record `floor_mode` before physical reconstruction.

| Mode | Use when | Required result |
|---|---|---|
| `full-footprint-integral` | Enclosed or roofed rooms/buildings whose floor belongs to the facility | One physical floor/foundation fills the canonical local `W×D` footprint beneath the structure and rotates with the complete root |
| `transparent-no-floor` | Standalone fixtures such as vending machines, arcade cabinets, counters or equipment for which the game terrain remains visible | No broad floor, mat, slab, diamond or presentation shadow; pixels outside structural parts are transparent |

An intrinsic raft, pontoon or required operating deck is geometry, not a presentation slab. Record its
physical bounds and gameplay meaning separately; do not classify a decorative support plate as a deck.

Forbidden states include a partial footprint slab, a generic isometric diamond, a disconnected shadow-like
plate, an old canvas mat, a floor that changes size or shape between d0–d3, or a plate added only to center an
asset. If neither allowed mode describes the design, stop for an explicit contract decision.

## Concept gate

A class sheet may show a roofed building without exposing its floor, but it must declare the intended mode.
For `full-footprint-integral`, walls and foundation must read as one complete building with no external floor
patch. For `transparent-no-floor`, the background must reach the structural silhouette with no contact
ellipse, shadow, mat or slab. A concept sheet can pass presentation QA only; it cannot prove physical floor
coverage or exact tile occupancy.

## Physical-root gate

Record the canonical `W×D`, floor mode, floor object names and local ground-plane bounds in the geometry
manifest.

For `full-footprint-integral`:

- the floor/foundation belongs to the complete rotating root;
- its local bounds cover the canonical footprint without holes or direction-specific extensions;
- after ground-fit scale, record per-side shortfall or overflow in tile units; do not hide a mismatch with
  non-uniform scale;
- d0/d2 use `W×D`, while d1/d3 use the same floor physically rotated to `D×W`;
- doors, counters, walls and slots are located relative to the same floor coordinates.
- the owned floor/foundation bounds, not the roof, awning, sign, trim or complete-root XY bbox, own the
  ground-fit scale; record those upper visual projections separately as overhang.
- exact floor coverage does not prove visual size consistency. Record the primary wall/shell bounds and its
  coverage ratio against the floor on both axes before runtime review.

For `transparent-no-floor`:

- no broad ground-plane mesh or floor-like material component exists;
- only structural feet, cabinet bases, posts or equipment contacts touch the ground;
- external background alpha is zero and no post-process may add a contact shadow or placement plate.

Any undeclared, missing, partial or independently rotated floor is `FAIL_FLOOR_MODE`.

## Styled-direction and runtime gate

ImageGen may color an intrinsic floor/foundation but may not add, remove, enlarge or expose it. Reapply the
corresponding physical alpha after uniform registration. The floor/contact mask therefore stays owned by the
physical direction.

Before actual-map review require:

- `floor_mode` and canonical footprint in the package manifest;
- the same physical ground-fit scale for all directions;
- d0/d2 and d1/d3 footprint transposition from one root, not independent image fitting;
- retained physical foreground `1.0` and output clipping `0`;
- no external floor pixels beyond the declared physical root;
- no visible terrain seam caused by an opaque partial mat.

Show at least one checkerboard-alpha preview and one actual-map close-up. Review the base at native logical
size as well as enlarged density output. A map placement that looks centered does not pass a wrong floor
mode.

## Required record

```json
{
  "floor_mode": "full-footprint-integral",
  "canonical_size": [2, 2],
  "rotated_size_d1_d3": [2, 2],
  "floor_objects": ["FacilityFloor"],
  "local_bounds_tiles": [2.0, 2.0],
  "external_ground_allowed": false,
  "physical_root_authoritative": true,
  "concept_presentation_gate": "PASS",
  "physical_floor_gate": "PASS",
  "runtime_floor_gate": "PASS"
}
```

Use `null` floor objects and bounds for `transparent-no-floor`. Keep concept, physical and runtime verdicts
separate so a clean catalog background cannot be mistaken for exact geometry proof.
