# Terrain, grout, boundaries and water

Use the current game world-grid and terrain renderer. A seamless texture preview cannot certify world placement or animated water. Keep existing material/tint identity, cell scale and display registration.

For the current ground implementation:
- Path/indoor grout follows measured source slab edges remapped to one game cell. The current mirrored repeat is8cells; do not merely draw a second visual grid over wrongly scaled grout.
- Region masks group material **and tint**. Inspect mixed grass/sand/path/indoor boundaries, diagonal and concave contacts and single-cell islands; fix seams without erasing ownership/season/food-court tint distinctions.
- Round only exposed natural shoreline corners (current radius0.22cell). Protect rigid deck and elevated-ground contact corners. Do not shrink every tile independently, which opens cracks.
- Keep natural water under decks, layer decks above the water, and hide only duplicated deck cells under the live dock footprint. Move/delete the dock and verify hidden cells return.
- Preserve animated GPU water UVs and pause semantics, and separate water/ripple effects from facility/NPC art.

Verify actual editing lifecycle: tile→water→raised ground→restore, facility/dock move/delete/restore, batched dirty rebuild, abandoned mask removal and scene shutdown. Inspect overlap, hairline gaps and visible water in motion with a grid overlay and at normal zoom. Stills prove only static appearance. Record whether tests exercised actual runtime or just pure-region logic.

Read current `terrain-layers`, `terrain-regions`, grout files and `ImageGenGround` integration. Reuse their tests for affected behavior, then capture the actual game. Do not regenerate all floor art for a boundary algorithm defect.

When capturing an edited test layout, synchronize the scene camera after changing camera state and inspect the saved screenshot. A requested grid overlay that is not visible is a failed capture. For dock hide/restore checks, first assert that both old and new footprints contain the intended deck cells; moving onto natural water gives no evidence of new-deck hiding. Preserve the first failed attempt and rerun with the intended precondition.
