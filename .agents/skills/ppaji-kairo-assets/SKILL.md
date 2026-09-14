---
name: ppaji-kairo-assets
description: Explore, build and QA Ppaji Tycoon static facilities using human-scale authored Blender models with shared painted materials, or concept/image-to-mesh tracks. Use for facility redesigns, footprint and roof proportions, four-facing pilots, candidate review and approved live-pack adoption; use ppaji-watercraft-pipeline for path-following vehicles.
---

# Ppaji Kairo Assets

Use this skill for the Ppaji Tycoon workspace whose root contains `src/data/kairo-facilities.json`,
`src/assets/kairo-render-contract.json`, and `docs/assets/README.md`.

## Compact authored candidate execution

For an authored material-preview candidate with supplied concept/atlas and scale brief, start with
[references/authored-review-runner.md](references/authored-review-runner.md) and its material reference.
This self-contained route replaces the broad reference checklist below for review-only authored work;
load other references only for missing contracts, exceptional geometry, gameplay or actual adoption.
Use its deterministic runner for calibration, rendering, saved-scene QA and review-page generation.
Keep all visual/physical gates; reduce repeated code and context, not evidence. Other routes below are unchanged.

## Current project default

Start with the project's short `docs/assets/CURRENT.md` or `codex-output/NEXT-SESSION-PROMPT.md`.
For continuing the approved **method**, use authored human-scale geometry and shared B painted
materials. Read `references/authored-human-scale.md` and the current recipe/index; do not reload mesh
provider histories or run per-direction ImageGen unless the requested track needs them. An existing
method approval is not automatic approval of every facility, footprint or live-pack replacement.

Keep roofs ordinary: simple gable, shed or flat forms. Distinguish buildings through doors, counters,
windows, awnings and exterior equipment, not increasingly strange roofs or roof-color-only clones.
The project owns the chosen common human scale; measure opaque people separately from cell bounds.
For people/hair/clothing/poses use `$ppaji-npc-assets`, not the facility modeling route. Facility-specific
interaction work remains subject to the current project deferral, even when the building art is accepted.

## Route the request

- For concept-matched authored colors, texture, architectural details, or repeatable style tests, read
  [references/concept-matched-painted-buildings.md](references/concept-matched-painted-buildings.md)
  together with `authored-human-scale.md`. Distinguish a facility-specific concept from a shared family
  sheet before declaring which proportions or details the model must preserve.

- For “새 시험 모델”, “공유 B 재질”, human-relative proportions or a low-call-count authored redesign,
  read [references/authored-human-scale.md](references/authored-human-scale.md). This route directly
  renders one editable model with shared materials; it does not require per-direction ImageGen calls.
  Continue to use the physical-direction, floor, roof, access and world-size contracts below.
- For a jet ski, tow boat, banana boat, flyfish, or another path-following vehicle that needs physical
  4/16-heading renders, stop and use `$ppaji-watercraft-pipeline` plus the workspace's
  `docs/assets/pipelines/watercraft.md`.
- For art-direction exploration, a category catalog, a `Goal:` asset sheet, footprint-family comparison,
  or roof/palette variation, read [references/concept-portfolio.md](references/concept-portfolio.md).
- For an NPC-used facility with a door, counter, service side, separate entrance/exit, opposing use sides,
  or visible occupied state, read [references/access-and-occupancy.md](references/access-and-occupancy.md)
  before creating directional art or changing simulation data.
- For any d0-d3 asset that must depict one real object, read
  [references/physical-direction-validation.md](references/physical-direction-validation.md) before
  generation or review. It owns the fixed 45°/30° projection, physical-root rotation, landmark evidence,
  and user-rejection gate.
- For an image-generation candidate or prompt, read [references/generation.md](references/generation.md).
- For candidate review, extraction readiness, or adoption, read [references/qa.md](references/qa.md).
- For corresponding-direction ImageGen coloring, physical-alpha locking, density-4 sprite packing, or an
  actual Phaser map review, read
  [references/physical-alpha-locked-runtime-review.md](references/physical-alpha-locked-runtime-review.md)
  after `physical-direction-validation.md`.
- For any floor, foundation, slab, plinth, mat, deck or broad ground-contact component, read
  [references/ground-contact-and-floor-mode.md](references/ground-contact-and-floor-mode.md) before concept
  approval or physical reconstruction.
- For an enclosed or roofed facility, read
  [references/roof-proportion-and-visual-mass-gate.md](references/roof-proportion-and-visual-mass-gate.md)
  after the floor contract and before any direction-specific coloring.
- For world-size placement, canvas/body-height normalization, or a supervised multi-facility wave, read
  [references/runtime-fit-and-batch-orchestration.md](references/runtime-fit-and-batch-orchestration.md).
- Before a paid image-to-mesh call, or whenever large generated packages must be cleaned up, read
  [references/provider-mesh-and-storage-lifecycle.md](references/provider-mesh-and-storage-lifecycle.md).
  It separates provider transport success from geometry approval and defines the immutable keep-set,
  safe deletion candidates, and reclaimed-byte record.
- For a full static-facility replacement wave, read both references plus the workspace's
  `docs/assets/README.md`, `docs/assets/contracts/camera-direction.md`,
  `docs/assets/contracts/four-direction.md`, and current render/data contracts. Recount IDs from JSON
  instead of trusting old prose totals.
- Read `docs/assets/maintenance/legacy-v2-regeneration.md` only when maintaining the old V2 live-pack
  ground/light pipeline. It is not a geometry or direction contract for new physical d0-d3 production.

## Operating rules

1. Preserve the existing live pack until a candidate passes semantic QA and the user accepts it. Save experiments under `assets/generated/kairo-v4-simple-pilot/<asset-slug>/`; do not overwrite `assets/generated/kairo-v2/accepted/` or rebake the atlas during exploration.
2. When image generation is needed, use the built-in `imagegen` workflow by default. Do not use the repository API/CLI or a billed GPT Image API unless the user explicitly requests that path. Authored shared-material pilots may need zero image calls.
3. Generate only the requested scope. A requested ImageGen pilot uses one initial built-in call; an authored pilot does not imply a call. One requested class-level sheet may contain its stated inventory, but do not silently add another sheet or category.
4. Classify the object before prompting. A prompt-only four-up sheet is always
   `CONCEPT_DIAGNOSTIC_ONLY`, even for a simple archetype. If d0-d3 must prove the same physical
   facility, build or refine one Blender root and rotate only that complete root at
   `0/90/180/270`; ImageGen may style the corresponding physical directions but may not author their
   geometry independently.
5. Lock a fixed component inventory and one unambiguous direction marker. The marker must be allowed to become partly occluded in rear views; never move it toward the camera for readability.
6. Treat Korean ppaji photography as palette/material reference only. Do not import the photographic scene, perspective, lake, mountains, tents, people, or dock layout.
7. A successful raw candidate is not a final sprite. Keep its prompt and QA beside the PNG. Do not begin
   alpha extraction, normalization, downscale, quantization, or runtime fitting until projection,
   physical rotation and landmark correspondence pass.
8. Numerical occupancy similarity, four unique panel hashes, footprint transposition, or mirror
   similarity never proves rigid rotation. Require exact root-yaw metadata, corresponding physical
   renders and cyclic landmark movement.
9. Keep concept selection, footprint proof, and production approval as separate gates. A class-level sheet may establish category silhouettes and color direction, but it cannot prove world scale, tile occupancy, anchors, hidden geometry, or runtime readiness.
10. Treat roof color as an authored family variable, not a universal default. Keep wall, wood, pontoon, outline, and lighting contracts coherent while distributing roof/canopy hues by facility role; do not recolor identical boxes and call them distinct concepts.
11. Keep the base facility art empty of NPCs. Store canonical access and occupancy semantics in local facility coordinates, rotate them through the same `facing` transform as the footprint, and use d0–d3 evidence to prove that the painted door, counter, control face, entry/exit, or opposing use sides stay aligned.
12. A user rejection of any required angle, rotation, landmark, art direction or map placement invalidates
    every earlier package-level PASS. Persist `FAIL_USER_VISUAL_REJECTION` in `visual-review.json`;
    only a newly shown replacement and explicit acceptance may close the gate.
13. Fit physical geometry to the simulation footprint before fitting its height to a sprite canvas. Use
    one uniform scale, measure residual width/depth error, and derive a review canvas/body height from the
    fixed-camera projection. Never shrink the ground footprint merely to preserve an old canvas height.
14. In a parallel wave, workers own disjoint per-facility folders and stop at the named gate. Only the
    coordinator may update batch manifests or review boards; no worker may edit live data, accepted art,
    the shared atlas, or another worker's package.
15. When ImageGen styles physical d0–d3, use the corresponding physical direction as the primary image,
    register with uniform scale plus translation only, then reapply the corresponding physical alpha. A
    locked silhouette proves outline/contact preservation only; it does not rescue changed internal
    structure, duplicated rear details, palette drift, or a failed landmark review.
16. For map review, preserve the physical ground-fit scale across all four directions. If the fitted alpha
    touches the canvas, add a measured symmetric transparent guard and record it; do not shrink the facility
    to protect an old canvas. Keep the provider and query review-only until the user accepts map fit.
17. Before browser evidence, verify that the server belongs to the current worktree. A passing page served
    by a sibling checkout is invalid even when the URL and port look correct.
18. Declare every static facility as `full-footprint-integral` or `transparent-no-floor`. Reject partial
    slabs, presentation diamonds, disconnected shadows and direction-dependent floors. A clean concept can
    pass only floor-presentation QA; exact coverage must be proved on the complete rotating physical root
    and again at native-size runtime.
19. For global-release assets, keep written language, letters, numbers, brands and generated fake glyphs off
    the facility surface. Convey identity through structure, attached equipment and language-neutral
    pictograms; keep localized names, prices and menus in runtime UI. Concept-sheet margin labels are review
    metadata only and must be excluded from approved production crops.
20. Before spending the remaining three ImageGen calls, run a strict `d0` pre-fanout pilot. A first
    geometry-redrawn result is preserved as failed evidence; make at most one targeted `d0` retry. Require
    silhouette/aspect/projection checks, two-way structural-edge precision/recall/F1, exact physical alpha,
    native-size zero-clipping, and an independent non-generator visual review. Only a recorded
    `D0_STRICT_GATE_PASS` authorizes `d1`–`d3`.
21. In strict recolor mode, prefer the corresponding physical `dN` plus a geometry-free material-role board.
    If an approved concept image causes reconstruction, remove it from edit inputs and retain it only as the
    offline source used to author the swatches. After all four directions exist, require cross-direction
    material-role regions and another independent review; automated alpha or edge agreement cannot approve
    a direction whose door, display, sign, counter, rear closure, or material assignment moved.
22. When a required cue is missing inside an existing physical panel, permit a tightly cropped concept-detail
    reference only for that named panel. Record the source/crop/hash and forbid copying its frame or geometry.
    A blank or solid required display fails even when its physical frame and alpha pass. A previously generated
    direction may be inherited into a corrective package only when its physical SHA, material-role contract,
    and independent per-direction PASS are unchanged; record lineage and rerun the complete current-package
    numeric, cross-direction, independent, and native-size gates.
23. At runtime-fit preflight, compare the package footprint with the current live `size`. A mismatch is never a
    new canonical size by implication: either stop with `FAIL_FOOTPRINT_CONTRACT_MISMATCH_UNDECLARED`, or record
    the candidate as a separate current-versus-proposed footprint review that leaves live data unchanged.
24. Keep footprint scale bounds, structural-body bounds, and visual-overhang bounds separate. For a
    `full-footprint-integral` facility the owned floor/foundation controls ground scale; a roof, awning, sign,
    trim, or upper-storey projection may enlarge the review canvas but may not shrink the canonical floor.
    Declare a facility-family visual-mass target before modeling, then measure wall/body coverage and roof or
    attachment overhang per side. Exact floor coverage alone cannot pass visual size consistency.
25. For every enclosed or roofed facility, create same-ground-scale d0 family evidence and a one-root d0-d3
    roof board, then stop at `ROOF_PROPORTION_USER_REVIEW`. Require explicit user acceptance of body coverage,
    roof length/width, ridge/eaves and footprint proposal before the strict d0 ImageGen call. Any later physical
    root or hierarchy SHA change invalidates colored descendants as
    `COLOR_GUIDE_SUPERSEDED_PHYSICAL_CHANGED`.
26. When the footprint-fit canvas differs from the live render contract, keep runtime fit conditional and show
    both the current-canvas shrink/clipping result and the footprint-preserving result for d0-d3 on the actual
    Phaser grid. Do not call size validated until footprint, visible mass, height, contact, overhang, slots and
    all four facings have an explicit user decision.
27. Before the first strict-color ImageGen call, dry-run the physical d0 alpha through the planned runtime
    ground fit. Require the contract's minimum native logical foreground, retained foreground `1.000`, and
    zero clipping. Store footprint-scale bounds in the same source-root coordinate frame used by the physical
    render; store the derived uniform ground-fit scale separately. Post-fit bounds must never be fed back into
    the fitter, because that applies the world scale twice and can reduce a valid facility to a few pixels.
28. Treat retained-foreground ratio as a preservation check, not a size check. A tiny image can retain 100% of
    its pixels. Every d0 pre-fanout gate and final four-direction pack must also enforce a declared minimum
    native logical foreground or equivalent visible-mass threshold before provider fan-out or map review.
29. Keep retry lineage direction-local. A d0 retry prompt and provider original may replace only d0 after it
    passes the complete strict gate; d1-d3 continue from their own corresponding-direction prompts. Never
    rebuild already-passed directions merely to make a retry folder uniform.
30. Normalize supported evidence aliases at validator boundaries without weakening the contract: current
    workspaces may expose `fixed_camera` or `camera`, and `root_rotations` or `directions`. Regression-test both
    forms. A schema spelling mismatch is a tooling failure, not permission to skip camera or root-yaw checks.
31. Treat a provider `PASS` as proof only that a real non-empty result passed the adapter contract. Imported
    geometry remains `DENSE_BASELINE_UNREVIEWED` until fixed-camera source-yaw probes, complete hierarchy,
    counts, hidden faces and explicit user review pass. Apply the storage lifecycle reference before deleting
    any large provider, Blender, render or rejection artifact.

## Required project records

For each prompt-only four-up diagnostic save:

```text
assets/generated/kairo-v4-simple-pilot/<asset-slug>/
├── prompt.txt
├── qa.md
└── raw/<descriptive-name>-4dir.png
```

The QA report may state a diagnostic `PASS`, `CONDITIONAL`, or `FAIL`, but must label that result
`CONCEPT_DIAGNOSTIC_ONLY`. It must list each fixed component and expected direction-marker location for
d0–d3 and separate occupancy measurement from projection, physical rotation, semantics, and user review.
No prompt-only report may use an unqualified directional or production `PASS`.

This folder cannot by itself receive directional or production PASS. A true four-direction package must
also contain the physical-root and overlay evidence required by
[references/physical-direction-validation.md](references/physical-direction-validation.md), including
`physical-rotations.json`, `projection-validation.json`, `landmark-correspondence.json`, and
`visual-review.json`.

For class-level concept sheets use the archive contract in
[references/concept-portfolio.md](references/concept-portfolio.md). Keep the explicit status
`GPT_CONCEPT_ONLY` until a chosen item completes its production track. Preserve the original PNG and its
SHA-256; do not keep the only copy under a transient image-generation cache path.

Use `scripts/qa_4up.py` for occupancy measurements. Exit code zero means only that the sheet was parsed.
Use `scripts/qa_projection.py` for signed 2:1 edge diagnostics. Neither script proves physical rotation
or semantic acceptance; compare every colored direction with the corresponding fixed-camera physical
render and landmark overlay.

## Verified V4 workspace pipeline

When the workspace contains the V4 tools below, use them instead of rebuilding extraction logic ad hoc:

```bash
python3 tools/process-kairo-v4-fourup.py --all --force
npx tsx tools/repair-kairo-v4-light.ts --apply
npx tsx tools/verify-kairo-v4.ts --strict
```

- `process-kairo-v4-fourup.py` owns chroma cleanup, component-based direction grouping, one shared scale per facility, palette reduction, and placement mode.
- `kairo-v4-contact.ts` owns V4 contact and paired-scale acceptance. Do not require the legacy full-footprint diamond from simplified mat-free assets.
- `kairo-v4-light-contract.ts` may accept only its exact ID/direction/verdict tuples. Never turn a listed holdout into a family-wide or verdict-wide exception.
- `verify-kairo-v4.ts --strict` must pass before copying all four directions of a facility into the live pack.
- When the workspace provides strengthened color-review tools, use their batch validator, runtime packer,
  and actual-map capture harness instead of ad hoc cropping. Require corresponding physical inputs,
  locked-alpha IoU `1.000`, one facility-wide runtime scale, zero output clipping, exact direction texture
  keys, unchanged storage, and zero browser errors. Read
  [references/physical-alpha-locked-runtime-review.md](references/physical-alpha-locked-runtime-review.md)
  for the evidence contract.
- After approved live adoption, bake with `npm run bake:atlas -- --density 2`, then run `npm run gate`, `npm run verify`, the current-workspace browser harness, and `npm run build`.

Keep the raw semantic QA authoritative: these tools cannot rescue relocated ladders, changed rail topology, or a front counter repeated on the rear.
