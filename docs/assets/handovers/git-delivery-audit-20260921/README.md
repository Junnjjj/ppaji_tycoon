# Asset Git delivery audit - 2026-09-21

Audited repository: /Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon
HEAD: 5cea8e9bb1677cd023f3d9122419a2b244cc8123

## Finding

Local main working files contain the adopted assets, but Git HEAD does not. No commit, push, or gameplay changes were made by this audit. Other system worktrees were not directly audited. Previous local-main adoption reports must not be interpreted as committed/pushed delivery.

## New facility definitions

| ID | Name | Footprint |
|---|---|---|
| cafe_lv2 | 카페 2단계 | 3x2 |
| cafe_lv3 | 카페 3단계 | 3x2 |
| stage_river_lv1 | 공연무대 1단계 | 4x3 |
| stage_river_lv2 | 공연무대 2단계 | 5x4 |
| stage_river_lv3 | 공연무대 3단계 | 6x5 |
| bungee_jump | 번지점프 | 4x4 |
| pension_1f | 펜션 1층 | 5x4 |
| pension_2f | 펜션 2층 | 5x4 |
| authored_locker_row | 코인락커 (제작본) | 4x2 |
| authored_infirmary | 의무실 (제작본) | 3x2 |
| authored_shower_row | 샤워실 (제작본) | 4x2 |
| authored_changing_row | 탈의실 (제작본) | 3x2 |
| authored_karaoke | 노래방 (제작본) | 3x3 |

Definitions: 201 -> 214. Manifest mappings: 54 -> 81.
Current counts: 76 folders, 24 modified tracked PNGs, 112 untracked PNGs, 223 untracked asset files.
The reported 88 folders / 77 modified images are not the counts of this audited directory.

## New manifest mappings

arcade, authored_changing_row, authored_infirmary, authored_karaoke, authored_locker_row, authored_shower_row, bungee_jump, bungeoppang, cafe_lv2, cafe_lv3, chicken, dry_room, firepit_row, foodcourt_seat, icecream, pension, pension_1f, pension_2f, photozone, playground, rental_tube, sikhye, stage_river_lv1, stage_river_lv2, stage_river_lv3, vending_in, watchtower

## Changed existing mappings

cafe, indoor_shop, info, jjimjilbang, office, pavilion, sauna

## Delivery dependencies

Include the approved-facilities manifest/loader, facility definitions and build filters, facility-attendants, facility-portals, outdoor-facility-contracts, static-facility-visits data; facility-portal, outdoor-activity, static-visit, guest-motion simulation and renderer modules; NPC V8, swim/recovery/course/render fixes and their tests. Images alone are insufficient.

See indoor-open-v2, indoor-service-v1, lodging-food-v2, outdoor-play-v1 and watchtower-v1 handovers. inventory.json records current modified/untracked file hashes, NOT a staging allowlist. Review ownership and diffs before committing; other sessions may share these files. Merge game.ts, guest.ts, scene.ts, facilities.json and build.ts with system changes rather than overwriting them.

Preserve old-save compatibility and construction removals; old office images are not authorization to re-expose the facility.

HD/pixel-lab comparison candidates are NOT adopted and must be excluded. This is a Git/file audit, not a fresh game test run. Prior validation and unresolved mobile green-screen limitations are in outdoor-play-v1/NPC-MOTION-FOLLOWUP.md.

## Next steps

Review and commit the adopted assets together with required runtime dependencies; merge that commit into the system worktree; verify construction inclusion/exclusion, NPC use, save restoration and production build.
