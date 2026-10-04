---
name: ppaji-assets
description: Create, repair and review Ppaji Tycoon assets through one workflow for static facilities, moving watercraft, modular NPCs and terrain. Use for asset-making, directional consistency, painted pixel-like style, grid/contact checks and authorized game adoption.
---

# Ppaji assets — one entrypoint

Resolve the running game and latest accepted assets before choosing a technique. Read the newest relevant project handover and actual provider/manifest, not an entire accumulated history. The repo may contain both an old root app and the active `ppaji/` app. A review server, historical survey or skill example is not the live contract. Use [project discovery](references/project.md).

## Choose the asset method

| Requested output | Read | Current default |
| --- | --- | --- |
| Building, bench, kiosk, fixed water obstacle, vegetation | [Facilities](references/facilities.md) | One authored assembly with painted materials, rotated as a unit into d0–d3; preserve the accepted look |
| Vehicle following a water course | [Watercraft](references/watercraft.md) | One physical assembly, 16 headings and matching depth/seat data |
| Guest appearance, clothes, poses, animation | [NPC](references/npc.md) | Protected original 2D parts, pose-specific garments/hair and deterministic palette composition |
| Ground, grout, shoreline, mixed materials, water effects | [Terrain](references/terrain.md) | World-grid registration, region boundaries and runtime animated water |

Read multiple references for a combined request: a seated rider needs both craft and NPC contacts; a fixed water facility needs terrain placement. A fixed inflatable obstacle is not a moving watercraft. Explicit user-selected methods and accepted assets take precedence over historical defaults. Blender is an available physical modeling tool, not a prerequisite for every asset. ImageGen can supply concepts, materials or new NPC donors, but independently redrawing each direction is not a geometry guarantee.

## Shared production loop

1. Record immutable references/hashes, target IDs, current registration, requested change and existing authorization in a fresh run. Separate observed details from inferred hidden geometry; retain rejected evidence and direction-specific user exceptions.
2. Define observable acceptance checks **before** editing: identity/part count, proportions, angles, contact/gaps, palette, line texture, actual display size and relevant runtime behavior. Numeric geometry checks and visual art judgment are separate. An obvious bend, gap, wrong part or changed identity fails despite a high score.
3. Produce a small representative candidate first. Reuse the accepted recipe and shared materials. Inspect saved pixels at source resolution **and** game size; repair the actual offending structure/part, then rerun affected checks. Do not widen tolerances or quietly omit failures to reach a requested score.
4. Use [review and adoption](references/review.md) for a continuous original/candidate/grid/game report, observable validation and a precise completion state. A successful command is not visual acceptance, and a preview is not live adoption.
5. Complete authorized adoption without asking for permission already given. An experiment request alone does not authorize replacing the live pack. Keep pilot outputs isolated and portable; inspect scripts and symlinks before executing old recipes.

Preserve warm painted colors, cute proportions and readable rounded shading. The accepted pixel-like facility finish quantizes **line/coverage decisions**, retaining detailed RGB paint; do not shrink and nearest-neighbor enlarge the whole sprite. NPC source density and terrain sampling have different contracts—never impose one facility finish on all categories.

For a broad batch, delegate disjoint candidate output directories when requested; one coordinator owns live manifests/adoption. Use the available orchestration skill for supervised Orca workers. Resolve dependencies before deleting or moving old runs or specialized skill resources.

## Reusable starting asset

`assets/facility-seed/` contains the accepted dry-room assembly, materials and line renderer, with provenance. Copy it to a new run; read [facility recipe usage](references/facilities.md) before rendering or adapting it. This is an editable starting recipe, not an automatic arbitrary-image reconstruction tool or a universal curved/transparency renderer.
