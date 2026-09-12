# Facility access, direction, and NPC occupancy

Read this reference before producing directional art for a facility that NPCs enter, use from one side,
traverse, sit on, lie on, swim in, or ride. The objective is one agreement between gameplay access,
painted landmarks, directional images, and NPC overlays.

## Classify access before drawing

Use the narrowest useful kind:

| Kind | Meaning | Typical examples |
|---|---|---|
| `service-face` | NPC remains outside and uses one public face | shop counter, vending machine, arcade cabinet, information desk |
| `portal` | Entry and exit share one doorway | toilet, nursing room, karaoke booth, sauna |
| `flow` | Entry and exit are different and traversal order matters | water slide, lazy river, boarding attraction |
| `two-sided` | Two or more opposed use faces must stay distinct | ping-pong table, face-to-face game |
| `occupancy-only` | No meaningful entrance; pose and anchor dominate | sunbed, massage chair |
| `staff-only` | A door or loading side exists but guests do not use it | office, storage |

Do not call every public-facing feature an entrance. A vending machine needs a control/service face, not
an interior entry tile. A ping-pong table has two interaction sides, not one front door.

## One local-space source of truth

- Store the gameplay contract once in the simulation facility definition using local footprint
  coordinates or local faces. Do not hard-code separate d0, d1, d2, and d3 coordinates.
- Rotate access points, slot tiles, and slot facing through the same transform that rotates the footprint.
  The visual asset package may record landmark evidence, but it must not become a second numerical source
  of truth.
- In the Ppaji workspace, placed facilities already carry `facing`. Facilities default to two visual
  directions unless `facings: 4` is declared. Promote an asset to four facings when a painted door,
  counter, controls, loading face, or front/back asymmetry must point to all four map directions.
- Generic facilities currently derive approach from the front faces, while slide-like `ride` facilities
  declare `entryTile` and `exitTile`. Preserve that distinction unless a deliberate simulation design
  changes it.

## Art contract

Before d0–d3 generation, lock a landmark inventory containing:

- access kind;
- exact canonical local side or tile;
- visible door/counter/control/ladder/boarding landmark;
- whether the rear must be closed or plain;
- occupancy slot tiles, poses, and local facing;
- parts allowed to occlude a guest;
- empty-state silhouette.

Paint the access landmark only on its physical side. Natural rear occlusion is correct. A door, public
counter, vending controls, or boarding opening duplicated on the rear is a semantic failure even if the
silhouette and occupied area are stable.

Do not encode access or facility identity in written language on the asset surface. Use the physical
doorway, service opening, equipment and a language-neutral pictogram when one helps. Attach the pictogram
to the same local physical side and rotate it with the complete root; never redraw it on the camera-facing
side. Localized explanatory text belongs to runtime UI.

## Empty base plus NPC overlay

Generate and adopt facility art without baked customers, staff, riders, swimmers, or seated guests.
Render NPCs at runtime from the facility's occupancy slots so the visual count equals the actual count.
Test empty, partially occupied, and full states separately.

For each slot verify:

- correct transformed tile and pose;
- correct facing relative to the facility component;
- feet, seat, hands, body, or tube contact as applicable;
- intentional front/behind layer order;
- no clipping through partitions, counters, tables, rails, or equipment;
- acceptable visibility in every required direction.

For special ride equipment, test `empty base → one rider → partial load → full load` before adopting the
occupied presentation. Do not add a pre-baked rider merely because a concept sheet looks livelier.

## Directional promotion gate

After the user approves the canonical concept:

1. Record the approved image path and SHA-256.
2. Lock the access kind and landmark inventory.
3. Build or refine one physical facility root. Put the door, counter, curtain, controls and use sides at
   declared local positions on that root.
4. Produce physical d0–d3 by rotating only the complete root at `0/90/180/270` under one fixed
   projection, light, canvas, union crop and common scale.
5. For each direction compare the physical landmark, styled visual landmark and transformed simulation
   access/slot overlay in one correspondence artifact.
6. Reject moved, duplicated, mirrored-to-stay-visible, camera-facing redraws, or missing landmarks.
7. Test NPC overlays on the empty art without changing the base pixels.
8. Show the four empty directions, landmark overlays, and at least one occupied-state comparison to the user.
9. Only explicit approval may advance the package toward live adoption.

Keep three decisions separate: directional geometry correctness, NPC contact/occlusion correctness, and
user art approval. Passing one does not imply either of the others.

A prompt-only four-up or independently generated direction set cannot satisfy step 3 or 4. If no physical
root exists, report `UNVERIFIABLE_NO_PHYSICAL_ROOT` rather than inferring access rotation from the
visible panels.
