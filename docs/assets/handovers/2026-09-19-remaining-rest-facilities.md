# Remaining rest facilities: nine authored artworks

User requested adoption of the nine previously authored facilities still using legacy single-frame artwork. Six authored footprints differ from live footprints. The user explicitly chose new construction entries at the authored sizes while preserving existing placed facilities.

## Applied inventory

| Facility | Build tab | Previous size | Applied size | Result / ID |
|---|---|---|---|---|
| 정자 | 자리 | 3×3 | 3×3 | Existing artwork replaced: `pavilion` |
| 글램핑 | 숙박 | 4×3 | 4×3 | Existing artwork replaced: `glamping` |
| 카라반 | 숙박 | 4×2 | 4×2 | Existing artwork replaced: `caravan` |
| 파라솔 | 자리 | 1×1 | 2×2 | New: `authored_parasol` |
| BBQ존 | 먹거리 | 3×3 | 4×3 | New: `authored_bbq_zone` |
| 선베드 열 | 자리 | 4×1 | 4×2 | New: `authored_sunbed_row` |
| 평상 연립 | 자리 | 4×1 | 4×2 | New: `authored_pyeongsang_row` |
| 안마의자 열 | 자리 | 3×1 | 3×2 | New: `authored_massage_row` |
| 온수 족욕 | 놀이 | 3×1 | 3×2 | New: `authored_footbath` |

All nine use four original native PNGs, the source camera anchor and uniform original world scale. No new image generation, model change, per-direction resize or mirrored legacy sprite. All nine are visible before unlock in their existing tabs. The six added names end in `(제작본)`; original construction entries also remain available under their previous names and unlock rules.

## Compatibility and deferred system work

- Old IDs, sizes, positions and save records are unchanged. There is no forced migration, expansion or relocation.
- Each new definition has `variantOf` pointing to its original. `Game.isUnlocked` accepts either its explicit ID or its original's unlocked ID, so shop purchase / rank reward unlocks both sizes without a second purchase or extra reward. Variants do not add independent initial unlock state.
- Prices, maintenance, popularity, capacity, use duration, fees and placement class are copied from the original. Future balance changes were not introduced. The larger footprint itself affects placement space.
- BBQ's menu compatibility table is copied so food service stays usable under the new ID.
- Automated bot construction continues to select the original economic catalog, excluding authored size variants pending system design. The existing three-seed 16-day golden snapshots were not rebaselined and pass unchanged.
- Facilities use existing guest behavior. Dedicated authored seat contact, reclining/sitting alignment, door landmarks, cutaways and per-pixel guest occlusion for these nine remain future integration work. Source contact proposals are not labelled as working runtime animation.

## Source and provenance

Source inventory: asset-v3 `codex-output/restored-asset-review-20260912/codex-output/npc-pose-map-v1/map-manifest.json`.
Actual originals were absent from the active generated folder, so 333 required PNG/Blender/JSON files (~82 MiB) were selectively restored to `codex-output/remaining-nine-restored-20260919/` from `asset-worktree-backups/ppaji-assets-20260912-100929/workspace.tar.gz`. Every restored file matched the backup SHA-256 index. Nothing was restored over MAIN.

`ppaji/public/assets/approved-facilities/rest-facility-provenance.json` retains per-frame source hashes, physical camera/root yaw, model hash, original review status, physical metrics and legacy/new size mapping. Original diagnostic/proposal statuses are retained, not rewritten as fresh production approvals; adoption follows the user's explicit request. The fixed camera and root yaw records and all native hashes are checked by the importer.

Importer: `python3 tools/assets/adopt-remaining-rest-facilities.py /path/to/asset-worktree-v3` after restoring the source subset. It refuses mismatched live sizes and preserves all other manifest entries. Runtime definitions and variant unlock behavior are versioned in MAIN.

## User review and verification

- Active MAIN 5189: `/asset-reviews/rest-facilities-20260919.html` lists replacement vs new entries, sizes and all 36 live images.
- `docs/assets/qa/remaining-rest-facilities-20260919/browser.json`: all nine entries visible, locks match the game's unlock state, all four frames resolved by the approved provider, opening tabs leaves the simulation unchanged. All nine also placed via public game API and use authored scene anchors.
- `authored-rest-variants.test.ts`: six variants × two game facings, shared unlock/economy, real placement, save round-trip, original instance preservation, no terrain or height changes.
- Frame hashes, source/live footprint, root pivots, build tabs, menu data and unlock-source contracts pass targeted tests.

Final validation: **115 test files / 590 tests passed**. Existing golden snapshots unchanged. Production build (including TypeScript), ESLint, UI checks and 16 negative controls pass. The live review page loads all nine sections and 36 images with zero missing images.
