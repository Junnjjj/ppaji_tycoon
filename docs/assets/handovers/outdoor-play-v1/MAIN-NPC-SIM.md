# Main outdoor real-visitor simulation

Implemented in the live project `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji`:

- `src/sim/outdoor-activity.ts`: numeric contracts, stable shared renderer API, authored LOCAL XYZ sampling, finite serializable visit segments, designated rotated exterior gates.
- `src/sim/guest.ts`: real GuestStore admission/reservation/advance/finish/cancel, stable seating and exclusive aisles, safe recovery, detached snapshots.
- `src/sim/facility.ts`: physical capacity clamp and authored entry/exit accessibility.
- `src/sim/outdoor-activity.test.ts`: focused simulation and actual Game integration tests.

Only the four assigned simulation files and this report were edited. Preexisting portal lifecycle work in guest/facility was preserved. No definitions, economics, render code, UI, images, models, manifests, or upgrade system were changed by this worker.

## Shared renderer contract

`outdoorContract(id): OutdoorContract | null` preserves all authored slots, including performer roles. `sampleOutdoorGuest({ outdoor }): OutdoorSample | null` is authoritative progress, never an independent repeating timeline. It returns centered LOCAL XYZ tiles (`X=I`, `Y=-J`, `Z=up`) and local heading radians; renderer applies facility rotation and world origin once. Poses include `walk`, `idle`, `sit`, `ride`, `cheer_jump`.

`Guest.outdoor` includes `uid`, `defId`, `slotId`, `facing`, `i`, `j`, `segment`, `elapsed`, serializable `segments`, `holdTicks`, `exitTile`, and cohort `draining`. Reservations derive exclusively from actual guest visits; there is no second mutable occupancy table. Stable slot IDs do not depend on guest array order. Photoflash effects occur only during the real subject hold. Stage music effects are optional and currently omitted; the fixed performer slot remains available to the renderer.

## Behavior and deliberate scope

| Live ID | Physical capacity | Real activity |
| --- | ---: | --- |
| playground | 4 | One exclusive rider plus up to three real guests in the existing exterior queue; each admitted rider climbs, sits, slides, lands, holds, exits once |
| pavilion | 4 | Authored approach to stable seated foot anchor, normal hold, serialized exit |
| photozone | 2 | Right subject first, left second; real hold/flash; right-first serialized departure |
| stage_river_lv1 | 4 | Stable audience slots; authored approaches and reverse ordered exit |
| stage_river_lv2 | 8 | Explicit admissionOrder / exitOrder |
| stage_river_lv3 | 12 | Explicit admissionOrder / exitOrder |
| bungee_jump | 1 | Ground entry, hidden ascent, platform walk, preparation, cheer_jump drop, damped rebound, winch, recovery walk, exterior exit |

The legacy `stage_river` is untouched. Performer slots never consume audience capacity. Level and chain capacity multipliers cannot exceed these physical limits.

Seated facilities reserve one aisle at a time. Hold timing pauses during other guests' traversals; once departure begins the cohort drains before a new cohort enters, preventing refilling an inner seat through an occupied outer seat. Tests measure traverser-versus-occupied-seat clearance at every tick using 0.35 tiles for stage lv2 and 0.24 tiles for other seated contracts. Normal authored holds are preserved in addition to traversal time. Outdoor queue patience is finite (4096 ticks), long enough for authored multi-seat traversal; closing cancels the exterior queue immediately.

Bungee interpolation follows the supplied activity.mjs cosine drop, successive damped rebound heights, and cosine winch. The cable attaches at exactly `[.38, 0, .48]` relative to the actor feet and stays attached through pickup. Ground recovery uses a safe walking speed rather than compressing the remaining route into the old short recover interval. Slide landing remains in the seated ride pose until reaching ground.

Guest simulation coordinates remain on the entry tile while local motion is sampled; completion places the guest on the exact authored exterior exit tile whose center is also the final local route point. Walking uses 0.65–0.8 tiles/second (8 sim ticks/second). Movement/deletion/rotation, target changes, blocked gates, and state interruption release visits without rewarding. Completed visits call the existing finishUse exactly once, preserving HP, satisfaction, photos, use counters, fees and hooks for the actual guest. Outdoor leisure does not become an overnight sleeping reservation. Disconnected completion exits use existing gate-connected recovery.

## Verification

Executed against main live files:

```sh
npx vitest run src/sim/outdoor-activity.test.ts src/sim/facility-portal.test.ts
npx tsc --noEmit --pretty false
npx eslint src/sim/outdoor-activity.ts src/sim/outdoor-activity.test.ts src/sim/guest.ts src/sim/facility.ts
```

Result: **89 tests passed** (54 outdoor + 35 portal regression), TypeScript passed, scoped ESLint passed. No whole-project test suite was run.

Coverage includes all seven facilities in both facings through GuestStore and Game, actual target guest/reward identity, exact-once Game completion and fee hook accounting, full physical seated capacities in both facings using normal holds, occupied-seat clearance, stable slots, exit order, queued slide exclusivity, all bungee phases and rope/harness offset, detached mid-seat/mid-slide/mid-bounce JSON snapshots, full Game mid-bungee reload, deletion/move/rotation/path closure during both seating and bungee, inaccessible entry refusal, closing departure, and legacy stage exclusion.

## Reproducible browser fixture for coordinator

Open a fresh disposable main QA session with `?fresh=1&kit=0&layout=reference&events=0&freeze=1&debug=1`. The following uses the existing `window.__pj` debug API and **real Game/GuestStore visitors**; it creates no render-only actors. Re-run `outdoorFixture` to reset the disposable session for another ID/facing. Do not paste into a valuable save session.

```js
window.outdoorFixture = (id = 'bungee_jump', facing = 0) => {
  const a = window.__pj;
  a.flow.frozen = true;
  a.newGame(5189);
  const game = a.game;
  game.grid.floor.fill(2); // existing FLOOR.path
  game.grid.levels.fill(0);
  game.guests.flush();
  const facility = game.facilities.place(id, 44, 24, facing);
  const entry = game.facilities.entryTiles(facility, game.guests.walkable)[0];
  if (!entry) throw new Error('Fixture has no authored walkable entry');
  const visitor = game.guests.spawn();
  Object.assign(visitor, {
    i: entry.i, j: entry.j, fromI: entry.i, fromJ: entry.j,
    progress: 1, state: 'walk', stateTicks: 0,
    target: { kind: 'facility', uid: facility.uid }
  });
  game.guests.invalidate();
  a.skip(1); // GuestStore creates and reserves the actual visit
  a.scene.focusTile(46, 26);
  window.outdoorQA = { facility, visitor,
    step(n = 1) { a.skip(n); return this.inspect(); },
    inspect() {
      const v = visitor.outdoor;
      return { uid: visitor.uid, facilityUid: facility.uid,
        slotId: v?.slotId, phase: v?.segments[v.segment]?.phase,
        elapsed: v?.elapsed, state: visitor.state,
        uses: visitor.uses, facilityUses: facility.usesTotal,
        spent: visitor.spentToday, income: facility.incomeToday,
        tile: [visitor.i, visitor.j] };
    }
  };
  return outdoorQA.inspect();
};
outdoorFixture('bungee_jump', 0);
// Step 1–8 ticks per screenshot; never assign outdoor/pose/route progress manually.
outdoorQA.step(8);
// Or let the real Game clock run, then freeze again:
// __pj.flow.frozen = false;
// __pj.flow.frozen = true;
```

Repeat with `playground`, `pavilion`, `photozone`, `stage_river_lv1`, `stage_river_lv2`, `stage_river_lv3`, and `bungee_jump`, each facing 0 and 1. `uses` and `facilityUses` remain zero until the finite exterior exit completes and then become one. During bungee `ascent` only the body is hidden; `jump`, `bounce`, and `winch` supply the dynamic rope and harness. `playground` uses one slide reservation, not four overlapping riders.

For full seating, spawn the next real visitor at `entryTiles(...)[0]` after the previous visitor reaches phase `hold`; normal hold timers pause during admitted traversal. For slide queue QA spawn four real visitors at the authored entry before the first step: one becomes the active visitor and three retain GuestStore `queue` state. Save/reload via `game.toSnapshot()` retains route and seat progress, as covered by the tests.

Remaining coordinator scope: browser visual pose/contact/depth QA with the renderer worker, final build/integration checks, and approved artifact delivery. This worker did not perform browser rendering QA or validate sprite pixel occlusion.
