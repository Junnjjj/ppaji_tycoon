# Fixed station staff — geometry and depth handoff

Implemented four stationary existing V8 idle NPC definitions in MAIN `ppaji/src/data/facility-attendants.json`. No GuestStore, capacity, economy, native art, original depth, simulation, rendering code or manifest changed by this worker. Runtime wiring and actual NPC browser QA are owned by the coordinator/render worker.

| Station | Centered local XYZ tiles | Heading | UID | Feet |
|---|---|---|---|---|
| info | [0, 0.12, 0] | -π/2 | -110001 | world terrain |
| indoor_shop | [0, -0.08, 0] | -π/2 | -110002 | Foundation top z=0 |
| rental_tube | [-0.57, 0.22, 0] | -π/2 | -110003 | world terrain |
| watchtower | [0, -0.05, 1.01] | -π/2 | -110004 | Platform_1 top z=1.01 |

All positions and headings rotate with the physical root; coordinates are Blender local XY (+Z up), not game I/J. All use `depthPrefix: staff`; watchtower role is lifeguard, others attendant. Identity is fixed per station definition; runtime must keep fixed staff independent of guest population.

## Provenance and matching display geometry

MAIN approved manifest blueprints identify indoor-open-v2/info and indoor_shop, indoor-service-v1/rental_tube, and watchtower-v1/watchtower. Each immutable blend SHA agrees with its authoritative presentation depth metadata and the new JSON sourceSHA. All 16 MAIN native PNG SHA values agree with manifest frames, source runtime native PNGs, and corresponding presentation metadata. No cutaway-tagged meshes exist in these four actual roots; complete saved display geometry was used, including shop roof, counters, shelving and tower rails.

`audit-export.py` opens each source read-only with two Blender threads and raycasts all 192² pixels in each of four rotations. New full staff depths match authoritative existing depths within 0.001 world unit with identical finite masks; maximum reprojection error is below 0.002 pixel. New support maps exclude only upward-facing Foundation or Platform_* support tops, preserving counters, rails and roof as occluders. No approved PNG was rendered or rewritten. Four immutable blend hashes and 16 native hashes remain unchanged after export. Exact camera vectors, bounds, source paths, per-direction errors and output hashes are in `evidence.json` and each new staff-depth-metadata.json.

## Numeric contact and clearance

Opaque standing height is 22 logical pixels / (cos(30°) × tileWorld) = 1.122683 tiles. Indoor shop head-to-roof clearance at its anchor is 0.279959 tile; other three anchors have no overhead hit. Foundation/platform foot errors are zero or less than 3e-9 tile. Tower original [0,0,1.01] hits the narrow seam between platform boards; a 0.05 tile shift toward the front produces actual supported feet without changing artwork.

With a conservative 0.18 tile horizontal body radius, nearest counter clearances are info 0.10, indoor shop 0.16 and rental 0.11 tile. Counter tops are respectively z=0.69, 0.66, 0.67 tile; these anchors stand behind them facing the public -Y side. This is stationary service presentation, not a hand-contact animation. Nearest guest-route center distances are respectively 1.20, 1.20, 1.05 tiles; subtracting two body radii leaves 0.84, 0.84, 0.69 tile clearance. Tower has no guest route/slot; platform half-width 0.42 leaves 0.24 tile beyond body radius and the side rails remain outside the body envelope. `clearance.json` stores complete obstacle/route measurements.

## Exclusions and limits

`shop` and `snackbar` use selected-facilities-current closed-wall/roof presentations, confirmed in MAIN manifest and native d0 inspection. No exposed authored staff station/contact contract was established, so these are excluded rather than adding a person through a wall or changing their approved art. No new pose, ImageGen, full main tests or model alterations were performed.

Indoor shop's previous optional-staff omission was a review scope choice; current request explicitly adds fixed staff and measured aisle/body/head clearance passes. Its roof/shelves can hide the attendant in some directions; that is physical occlusion and must remain intact. Numeric checks do not certify visual appearance, sprite hand placement, or actual runtime mapping: coordinator must inspect all four facings with the existing V8 sprite and matching staff depth before claiming browser QA. Fixed tower staff has no climb animation; no staff locomotion is introduced.

Validation: `python3 .../attendants/verify.py` passed four anchor contracts, all source/native hashes, 32 depth-buffer lengths/hash/NaN checks, unique negative UIDs, obstacle body clearance and customer-route clearance. `export.log` records all four Blender exports. MAIN additions: one JSON and 36 new per-station depth/support/metadata files.
