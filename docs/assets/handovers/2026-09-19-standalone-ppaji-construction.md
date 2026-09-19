# Standalone ppaji construction - 2026-09-19

User explicitly reversed the composite-only decision and requested individual construction of all 14 small modules. The two composites remain. The ppaji tab now shows all 35 cards, including locked ones. Approved decks, composites and modules appear first. Other tabs retain two locked teasers.

| Name | New construction ID | Size | Unlock |
|---|---|---|---|
| 플로팅 슬라이드 | `module_rig_slide` | 2x3 | start |
| 수상 트램폴린 | `module_trampoline_w` | 3x3 | rank 2 |
| 밸런스 빔 | `module_rig_beam` | 1x3 | start |
| 워터 롤러 | `module_rig_roller` | 2x2 | rank 1 |
| 시소 플로트 | `module_rig_seesaw` | 3x2 | start |
| 워터 토템 | `module_rig_totem` | 2x2 | rank 3 |
| 회전 원반 | `module_rig_disc` | 3x3 | rank 5 |
| 미니 슬라이드 | `module_rig_mini_slide` | 2x2 | start |
| 미끄럼 도크 | `module_rig_slidedock` | 3x1 | rank 2 |
| 키즈 워터 놀이터 | `module_rig_kids_park` | 3x3 | rank 2 |
| 워터워크볼 | `module_waterwalk` | 2x3 | rank 3 |
| 해먹 라운지 | `module_rig_hammock` | 2x3 | start |
| 선베드 플로트 | `module_rig_sunbed` | 1x2 | rank 1 |
| LED 조명 부표 | `module_rig_led_buoy` | 1x1 | rank 3 |

## Save and gameplay contracts

- New module_* IDs preserve legacy placed instances and their old footprints. Example: legacy roller remains 1x1; new construction is the authored 2x2. No silent expansion into neighbouring facilities.
- Five modules unlock at start; others at ranks 1/2/3/5. Removed wish/investment/workshop rewards are not required. Existing high-rank saves receive them through the existing rank-unlock reconciliation.
- New floating modules formerly restricted to shallow water now use any depth: their authored 3-tile depth / 3x3 footprint cannot fit the natural two-row shallows. The three originally deep modules (trampoline, totem, disc) retain deep-water and vest requirements. Terrain is unchanged.
- Enlarged modules retain the existing minimum popularity density 2.8 per tile and 90G cost / 5.3G maintenance per popularity formulas. Capacity equals authored visitor tracks; chains and upgrades cannot multiply physical seats. LED is a zero-capacity decoration.
- Ring LED decorations count toward pool grade and night lighting, but not usable ride count.

## Rendering and motion

- Original four native frames, full depth, pose support masks and waterwalk empty base/front glass are copied without regenerating art.
- Thirteen route samplers match the originals at 0.05 second intervals; maximum positional difference below 4e-15 tiles. LED has no visitor route.
- Actual Guest UID/useTicks drives each visit, poses, slide occlusion, splash and swim return. Simultaneous seesaw visitors receive separate source tracks.
- Hardware rotation/tilt/deformation and limb IK remain unsupported as in the source. Authored swimming return routes do not reroute around arbitrary neighbouring placements.

## Moving equipment audit

- All 29 authored passenger equipment IDs appear in the actual course picker; all 29 cards use approved-asset images. Missing IDs: zero. tow_work is an operating tow-boat profile, not a passenger equipment card. The rejected turtle stays excluded.
- Added a set-equality regression between the authored manifest and COURSE_EQUIPMENT.

## Verification

- 14 modules x 2 game facings: public placeFacility, save round-trip, unlock, legacy footprint and physical capacity checks.
- MAIN 5189 browser: 35 build cards, 14 new modules, 13 occupied modules x 2 facings x 7 times = 182 visible-NPC samples. Loaded 116 static depths, 56 pose masks and four front overlays.
- Clicking the standalone beam card enters placement; other tabs still show only two locked teasers.
- Source hashes: public/assets/approved-facilities/module-provenance.json. Sampler evidence: module-route-verification.json. Browser and test evidence: docs/assets/qa/standalone-modules-20260919/.

- Small rest modules now allow the course-aware 64-day bot to complete paths (four observed), while noPath completes zero. The obsolete turtle-only 80-tile pool expectation was replaced with actual course completion checks.
- Golden 16-day runs were repeated for three seeds. Initial floor and every height-array fixture remain unchanged; later bot-construction floors and economy hashes were remeasured for the expanded catalog.
- Selected roofed buildings and the indoor shop mapping were also integrated; see [building adoption](2026-09-19-selected-building-adoption.md).

- LED decoration lighting is verified on a ring edge adjacent to the owned pool in both facings. It increases active night sales and has no effect when the night is off.
- Verification hit disk ENOSPC from accumulated UI self-test source copies. Removed only completed `wp-ui-*` temporary copies older than one hour (~1.8 GiB); the checker now removes each copy after running. Original assets and saves were untouched. Full tests were restarted after reclaiming space.

Final validation: **114 test files / 589 tests passed**, TypeScript, ESLint, UI checks and 16 negative controls passed; production build passed and is served by MAIN 5189. `git diff --check` passed. Browser evidence uses the active MAIN server and isolated fresh state.
