# Main outdoor NPC renderer integration

Completed 2026-09-20 in `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji`.

## Owned changes

- `src/render/outdoor-facilities.ts`: dedicated native RGBA/depth compositor and resource loader; real outdoor visitors plus one stage fixture performer and the four explicitly approved fixed attendants.
- `src/render/static-facilities.ts`: load the dedicated resources even though manifest entries remain `renderOnly`, merge hidden facility/guest sets, pass elevation, and dispose textures/effects on shutdown.
- `src/render/scene.ts`: only this worker's change is passing `liftAt` to the existing static renderer update; pre-existing portal/other session edits preserved.
- `src/assets/npc-v8.ts`: explicit `cheer_jump` pose and underscore-safe key parsing. No idle substitution for bungee cheer.
- `src/render/outdoor-facilities.test.ts`: 12 focused renderer/resource tests; existing NPC suite contributes 4 more passing tests.

No simulation, numeric contract, manifest, definition, public art, economic, or upgrade rules were edited by this worker.

## Shared API actually consumed

`outdoorContract(id): OutdoorContract | null` and `sampleOutdoorGuest(g: { outdoor?: OutdoorVisit }): OutdoorSample | null` from `src/sim/outdoor-activity.ts`.

A visitor must have an actual facility `Guest.target` matching `outdoor.uid`, and matching placed `defId`, `facing`, `i`, and `j`. The renderer does not allocate, advance, repeat, or fill any guest slot. Stable reservations and serializable progress remain simulation-owned. Only samples that successfully composite cause normal guest sprites and their existing scene overlays to be hidden. `hidden` samples suppress body, rope, harness, and all effects; no replacement crowd exists.

Sample position, rope endpoints, harness points, and effect points remain centered LOCAL XYZ tiles (`X=I`, `Y=-J`, `Z` up). Heading is radians. Renderer rotates them by the physical facility facing and never treats them as world coordinates. Scene game rotation support remains 0/1; resource/math support for four authored frames introduces no new gameplay rotation.

`stand` maps to authored idle, `sit_chair` to sit, and `slide` to ride; other accepted poses are idle/walk/sit/lie/ride/swim/float/jump/cheer_jump. Unknown poses or missing authored NPC frames surface a console error and restore ordinary rendering, rather than silently substituting idle. NPC native size, contact anchor and uid-selected V8 look remain intact; sitting and standing changes are instantaneous.

One stage performer is read from the contract `role=performer` slot with fixed negative presentation uid `-110005`; it never enters GuestStore or guest capacity. Attendants are read from the separately owned `facility-attendants.json` for info, indoor_shop, rental_tube and watchtower, including their fixed negative uids and corrected tower anchor. Standing attendants use the audited full staff depth and authored foot positions, retaining roofs/counters/rails. Seated visitor poses use support masks.

## Camera, depth and cleanup

All 28 outdoor physical views load `depth-dN.bin`, `support-dN.bin` and per-facility camera metadata. The four attendant facilities load 16 staff physical view pairs using `staff-depth-dN.bin`, `staff-support-dN.bin` and `staff-depth-metadata.json`. Each buffer must have exactly nativeWidth² Float32 values; NaN and negative infinity are rejected. Failed facilities remain on base art and ordinary guest rendering, while other facilities still composite.

Depth is the dot product `(localPoint * tileWorld - camera.C) · camera.F`, not the craft camera's hardcoded 0.65-target formula. Native screen target comes from the approved manifest anchor. Tests confirm distinct 250-unit pavilion versus 300-unit bungee camera distances. Body pixels use the reviewed billboard depth slope; seated/lying/ride poses use support masks and preserve front-edge/post/roof occlusion. Actor depths also occlude one another.

Sample rope uses RGB [43,135,181], harness [38,205,215], and flash/music sample effects use the same physical depth test. Music is rendered when emitted by the sample; renderer does not synthesize gameplay effects independently. All pixels, including effects, share the composed frame's terrain elevation. Existing generic static water effects now also share their facility elevation.

Visit frames/textures are removed when the last visitor leaves unless the facility has its permitted fixed performer/attendant; those fixture frames disappear when the facility is removed. Masks remain immutable shared resources. Scene shutdown disposes compositor textures and effects. A composition failure removes any stale custom frame and leaves both ordinary guest and base visible.

## Verification

- `npm run typecheck`: PASS.
- `npx eslint src/render/outdoor-facilities.ts src/render/outdoor-facilities.test.ts src/render/static-facilities.ts src/assets/npc-v8.ts`: PASS.
- `npx vitest run src/render/outdoor-facilities.test.ts src/assets/npc-v8.test.ts`: PASS, 16 tests.
- `npm run build`: PASS; Vite emitted its normal large-chunk advisory.
- Resource checks: 28 outdoor depth files + 28 support masks, 16 attendant depth files + 16 support masks, metadata and all 54 V8 identities × 4 cheer facings.
- Behavioral checks: exact sample effect colors, hidden ascent overlays, roof/post versus support pixels, moved/retargeted visitor rejection, terrain lift, departure cleanup, failure fallback, fixture independence from guests and removal cleanup.

Actual browser visual acceptance belongs to the coordinator and was not claimed by this worker. In particular, inspect pavilion roof/post contacts, stage 8/12-seat crowd contacts, slide front edge, bungee ascent/cheer/rope/harness and the four attendants; rear roof views may correctly hide indoor attendants. No art approval or gameplay upgrade policy is inferred from these technical tests.
