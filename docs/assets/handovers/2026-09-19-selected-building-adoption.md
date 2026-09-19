# Selected roofed buildings: MAIN integration, 2026-09-19

The user requested the roofed facilities selected in the asset-v3 session instead of legacy facility rendering. MAIN now loads the selected native PNGs through ApprovedFacilityProvider, including the initial indoor shop.

## Finding

The MAIN legacy atlas already contained all 60 selected building images: after removing transparent packing margins, RGBA pixels match the selected pack exactly. Therefore this was not 15 missing artworks. The active game still used generic bottom-centre placement for cropped atlas frames, without the authored per-facility camera anchor. More visibly, the new system ID `indoor_shop` had no authored mapping and fell through to the small procedural shop.

## Applied

| Facilities | Footprint |
|---|---|
| 매점, 의무실, 창고, 화장실, 수유실, 분식점, 노래방, 안내소, 사무실 | 2 × 2 |
| 카페 (검정 기와, 파란 차양) | 3 × 2 |
| 사우나, 방갈로, 몽골텐트 | 3 × 3 |
| 찜질방 | 4 × 4 |
| 그늘막 | 2 × 2 |

- Exact selected native images, 15 facilities × four physical directions. No recoloring, resizing, new model or roof redesign.
- `indoor_shop` shares `shop` art at the same 2 × 2 footprint; its indoor-only placement, menus, income and guest behavior remain intact.
- Native canvas 192 × 192, camera target Z 0.6, anchor (96, 107.75755076535926). Simulation pivot is footprint centre, with width/depth transposed by facing.
- The existing scene's approved-image path serves both placed images and placement ghosts. Images receive existing terrain lift and facility depth.
- Build/menu thumbnails trim transparent padding in their DOM copies only. The native sprite, cached provider image, scale and world anchor stay unchanged.
- Buildings are marked `renderOnly`: they retain the game's existing entry/use behavior; they do not load aquatic NPC depth masks or routes.
- Building definitions, prices, size, saved instance IDs, terrain, height and initial layout were not changed by this building adoption. The accompanying standalone-module work has its own gameplay changes documented separately.

## Source and reproduction

Source selection: asset-v3 `artifacts/asset-concept-sheets/selected-facilities-current/review-data.json` and `assets/generated/kairo-selected-review-pack/<id>/selection.json`. Per-direction lineage, original contracts, source QA caveats, hashes and anchors are retained in `ppaji/public/assets/approved-facilities/building-provenance.json`.

The source reports include raster projection warnings/failures; these are not re-labelled as fresh geometric approval. This task applies the user's previously selected artworks and current explicit adoption request. The importer checks their unchanged physical camera, four root yaw angles, zero recorded clipping, exact current footprint and all selected hashes.

```sh
python3 tools/assets/adopt-selected-buildings.py /path/to/asset-worktree-v3
cd ppaji
npm run build
```

The importer is repeatable and changes only selected facility manifest entries, image copies and provenance. Main 5189 serves `ppaji/dist`, so rebuilding updates the active game. It does not run the old root game.

## Verification

Evidence: `docs/assets/qa/selected-buildings-20260919/`.

- `legacy-pixel-audit.json`: all 60 existing atlas artworks match their selected native opaque pixels.
- `browser.json`: all 64 building/alias frames load from the priority approved provider with exact hashes; 32 game-facing placements use the authored world position and anchor. Minimum nontransparent pixels: 2083. Local storage unchanged during verification.
- `main.png`: actual MAIN game after the indoor shop correction.
- `before-indoor-shop.png`: before the alias was connected (other selected roofs already loaded).
- `four-directions.jpg`: old atlas d0 on the left, selected d0–d3 on the right. Same artwork; different transparent packing.
- Build includes TypeScript validation. Full simulation regression, lint and UI checks are recorded with the standalone-module evidence.

Final validation: **114 test files / 589 tests passed**, TypeScript, ESLint, UI checks and 16 negative controls passed; production build passed and is served by MAIN 5189. `git diff --check` passed. Browser evidence uses the active MAIN server and isolated fresh state.

## Follow-up: show selected buildings before unlock

At the user's request, all 15 selected building IDs bypass the two-locked-card teaser limit in their existing build tabs. Other facilities retain the existing teaser policy. Locked cards remain disabled; no unlock, economy, placement or map data changes. MAIN browser checked all 15 plus the indoor-shop alias: none missing, every lock state matches isUnlocked, and opening all tabs leaves the simulation snapshot unchanged. Evidence: build-visibility.json/png. Build/typecheck, lint, UI controls and the two relevant test files pass.
