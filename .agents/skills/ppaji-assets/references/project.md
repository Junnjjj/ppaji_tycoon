# Locate the actual contract

1. Identify the Git root, branch/worktree, package scripts, dev-server cwd/build identity and current asset imports. Prefer the newest relevant handover and current provider over old `CURRENT.md` sections. Record the checkout and commit used.
2. In the current project the active game is `<repo>/ppaji`. Key paths below are relative to that app; verify they still exist. Do not replace its data with old root-app registrations.

| Domain | Current implementation to inspect |
| --- | --- |
| Facilities | `src/assets/` provider imports; `public/assets/` manifests; `src/data/facilities.json`; native visualSource aliases as well as WebP provider |
| Moving craft | `src/assets/watercraft.ts`, `public/assets/approved-watercraft/manifest.json`, `src/render/watercraft-composite.ts`, `src/data/watercraft-seats.json` |
| NPC | `src/assets/npc-source.ts`, `assets/npc-source/manifest.json`, `src/assets/spec.ts`, density consumers under `src/render/` |
| Terrain | `src/render/terrain-layers.ts`, `terrain-regions.ts`, `grout-patch.ts`, `grout-lines.json`, and their caller `ImageGenGround` |

As of the 2026-10-04 adoption (`7022103`), the repo handover `docs/assets/handovers/2026-10-04-terrain-npc-main-adoption.md` records density4 NPCs, 16-heading craft, terrain boundary/lifecycle evidence and remaining pose limitations. This is a checkpoint, not a permanent path/version lock.

Historical facility recipes live under `assets/generated/kairo-v4-simple-pilot/` in the asset workspace. Useful accepted families: `dry-rental-line-20261002`, `indoor-shop-line-20261003`, `cafe-shop-batch-20261003`, `water-curves-batch-20261003`, `water-playground-batch-20261003`. Their `build.py` may use absolute paths, execute fragments from other runs or reset review state. Inspect imports/writes; copy/adapt into the new run. Do not execute a reviewed build in place. Absence of these ignored outputs in a fresh checkout is expected; use the bundled seed or explicitly locate required inputs, never claim they were bundled.

Legacy specialized skills retain advanced resources: `ppaji-surface-reprojection` (texture crops/line diagnostics), `ppaji-kairo-assets` (authored Blender and ImageGen tracks), `ppaji-watercraft-pipeline` (physical/provider stages), `ppaji-npc-assets` (donor extraction/palette assembly). Find them in available skills only when the selected method needs those details. Their old project paths, defaults and approval gates do not supersede current user choices or authorization. Missing advanced machinery is a disclosed dependency, not a reason to silently select another method.
