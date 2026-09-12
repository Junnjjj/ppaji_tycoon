# Human-scale authored facilities with shared B materials

Use when the user chooses new scripted models/shared B materials, especially when prior image-to-mesh
and per-direction coloring cost too much or drift. This is an explicitly authored redesign lane, not
recovery of an approved provider mesh. Preserve existing accepted/live assets and historical failures.

## Start from people, then propose the footprint

Read the live guest canvas, actual sprite renderer, facility definition and camera contract. A sprite
cell's height is not necessarily its opaque height. Measure a current standing sprite with its frame,
pose, facing and anchor and record both. Use an explicit common human height H; record whether H is the
visible sprite, cell envelope or a future character-size proposal. Never silently resize people per asset.

Derive a consistent family of door, counter, sink, seat, screen, eave and ridge heights relative to H.
Choose sensible design values for this project's stylized humans; these are game-art ratios, not building
code or ergonomic certifications. Ground dimensions follow usable room/module space and component counts.
Do not stretch a complete root to fill an inherited `2×1` or `2×2` merely because it is the old live size.

For each asset save current live size, proposed integer placement size, physical body width/depth/height,
owned floor or contact hull, roof bounds/overhang, access-side and H ratios. Keep continuous visual bounds
separate from integer placement. The future adoption must use this recorded proposal after user review;
do not later squeeze the approved model back into the old footprint. Capacity is not decorative module count.

For concept-matched color, texture and detail work, also read
[concept-matched-painted-buildings.md](concept-matched-painted-buildings.md). Human-fit and camera checks
do not establish concept fidelity; declare the visual targets before altering the model.

## Build and review

The current project preference is simple gable, shed or flat roofs. Give buildings functional identity
through doors, windows, service counters, awnings and exterior equipment; avoid exaggerated sawtooth,
stepped or novelty roofs just to make every building different. Preserve genuine shape differences without
turning the set into identical boxes with different roof colors. Read current project interaction deferrals
before extending seats, entries, exits or visible occupants; art acceptance alone does not define gameplay.

1. Reuse identity/color references when adequate; regenerate only missing or unsuitable concepts within
   user scope. Reference pictures do not prove hidden geometry or world size. Preserve raw backgrounds.
2. Declare floor mode and access/landmark inventory before modeling. Author one complete root; side doors,
   public counters, panels, curtains and vents remain on their actual physical sides when turned.
3. Use the reviewed B material family: role palettes, banded lighting/AO, inside edge treatment and a
   geometry-free shared atlas fixed in local/UV coordinates. Use plaster/wood/metal/PVC-specific roles.
   Existing source recipe: `tools/material-recipes/ticket-painted-ink-v2.json` and the matching material
   builder. The towable recipe is an alternative for curved PVC, not a reason to put its texture everywhere.
4. Plain versus B uses exactly the same new geometry. Direct material renders are **geometry/material
   previews**, allowed to expose a roof/size proposal; they do not close `ROOF_PROPORTION_USER_REVIEW`.
   Per-direction ImageGen and production coloring remain gated on approval of the physical proportions.
5. Fix camera/lighting and rotate the entire root at 0/90/180/270. Derive one union canvas and logical
   ground scale. Render 1× evidence and larger pixel-density views directly without per-image auto-fit.
6. Show the current game guest at the same logical scale in the review UI or a separate evidence layer.
   Keep the production-candidate base art empty of NPCs. A geometric mannequin must be labeled as a scale
   proxy, not the real sprite or proof of runtime occupancy. Render all four access-side positions.
7. Reopen the saved scene, verify geometry/camera/root and rerender; inspect every view. Check exact floor,
   body and visual bounds, human ratios, true alpha, clipping and fixed-camera direction landmarks.

Review `old concept / authored B / common-scale human comparison`, all four facings, and a family row
with no per-asset resizing. State `HUMAN_SCALE_PROPOSAL_USER_REVIEW` and keep roof/floor/shape/art/size/
runtime decisions separate. Exact alpha or camera agreement cannot certify human fit or concept fidelity.
Game map, occupied states, slot remapping and live adoption require later scoped verification.

## Reuse and bounded effort

Choose a representative subset when the user asks for several facilities, not automatically all IDs or
only one. Record the exact list and omissions. Existing artifacts should be reused for style-only changes;
new geometry must not inherit old direction, roof or final-art approvals. Reuse the atlas across facilities
and all views; zero additional ImageGen/provider calls is a valid outcome, not a measured token saving.

Project procedure and current pilot: `docs/assets/pipelines/authored-human-scale-facilities.md`.
The project owns numerical recipe/manifest files; keep SKILL.md small and do not load unrelated provider
histories for this route. Use browser comparison when requested, preferably ego-browser when available,
and publish only explicit review dependencies to a requested Tailscale interface.
