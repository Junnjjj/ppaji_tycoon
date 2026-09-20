# Main portal GuestStore integration — completed 2026-09-20

Target: `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji`.

## Changed files / API

- `src/sim/facility-portal.ts` (new): `facilityPortal(PlacedFacility)`, `portalPosition(PortalVisit)`, `portalLength(FacilityPortal)`, `portalHidden(guest)` and their exported interfaces. Reads coordinator-owned `src/data/facility-portals.json`; no duplicated physical anchor constants. Converts local X/Y to game I/-Y, then approved-facing `(I,J)->(J,-I)`; footprint-center pivots verified against adopted manifest.
- `src/sim/facility.ts`: existing `entryTiles` API returns only the authored front exterior tile for the six IDs, provided walkable and doorway edge crossable. Other facilities retain existing entry behavior.
- `src/sim/guest.ts`: optional serializable `Guest.portal`, entering/inside/exiting phases under existing `use` state. Existing `busyCount` includes entry reservations and inside users, excludes completed exit users; admission calls `capacityOf(def,f)`. One doorway traverser at a time, normal economy/use hooks execute once at inside completion. All simulation positions remain exterior tiles. Existing use/afterUse/economy/upgrade rules remain authoritative.
- `src/render/scene.ts`: uses shared portal polyline positions and threshold height, walk pose during entry/exit, hides inside actor plus emote/HP/friend gauge/speech anchor/hit target. Preserves watercraft/static renderer hidden-actor ownership.
- `src/sim/facility-portal.test.ts` (new): 35 real GuestStore integration tests.
- `src/render/facility-portal.test.ts` (new): invokes actual scene synchronization with a mocked Phaser Scene base, verifies actor and all existing overlays disappear together.

No commits. No edits by this worker to facility data, approved assets, manifests, build UI or existing tests. Coordinator owns facility-portals.json and adopted art/data.

## Behavior and recovery

All six IDs: `pension_1f`, `pension_2f`, `pension`, `cafe`, `cafe_lv2`, `cafe_lv3`; main supports facing 0/1 only. Facing 0 entry is +J exterior; facing 1 is +I exterior. Pension origin teleport is removed. Navigation must actually arrive; unreachable distance fields no longer admit these portals at a random side.

Reservation starts while visibly entering. Runtime capacity reduction does not evict existing admissions. Exits reappear exactly at the same saved physical threshold and reverse the canonical approach. After exiting, existing afterUse logic handles further activity or leaving. No separate economic engine, staff or new NPC sprites.

JSON save/reload preserves progress and completion status with detached nested visit data. Legacy use-state guests acquire a correct portal visit on their first simulation tick; old pension origin positions are moved to the exterior simulation tile and represented as hidden inside guests. Facility deletion, relocation, conversion that changes threshold, doorway/path closure, or cancellation release the visit; invalid/disconnected positions recover to the nearest walkable gate-connected tile. Normal visits do not teleport.

Park closing allows already-admitted visits to finish, exit through the same door, then leave under existing rules. Overnight occupants remain inside during closing; wakeUp queues exits and retains single-file traversal without another economic use charge.

## Validation

Passed:

```
npx vitest run src/sim/facility-portal.test.ts src/render/facility-portal.test.ts src/sim/guest-life.test.ts src/sim/facility.test.ts
# 4 files, 45 tests passed
npm run typecheck
npx eslint src/sim/facility-portal.ts src/sim/facility-portal.test.ts src/render/facility-portal.test.ts src/sim/guest.ts src/sim/facility.ts src/render/scene.ts
git diff --check -- src/sim/guest.ts src/sim/facility.ts src/render/scene.ts
```

Coverage includes all 12 ID/facing combinations, walking from a distant tile, exact thresholds, capacity 4/6 and upgraded capacities, simultaneous reservations, single-file traversal, blocked front versus arbitrary other walls, unreachable components, step-height blocked doorway edges, all three phases serialized/reloaded, deep snapshot isolation, old saves, deletion, move/rotate, closed paths during every phase and queue, park-closing during entering/inside, single and multiple overnight wake-up, and overlay cleanup.

## Remaining coordinator validation / rendering caveat

Coordinator owns final full suite/build/browser verification. Building art is a single facade sprite, with no per-pixel portal depth mask; exterior portal actors and their overlays therefore share the facility front-depth plane until they hide at the threshold. Their position/height uses actual authored physical geometry. This avoids being prematurely covered by the whole building image, but browser visual QA should inspect both main facings and nearby-object overlap. New sessions do not wait for browser validation to acquire correct simulation capacity behavior.
