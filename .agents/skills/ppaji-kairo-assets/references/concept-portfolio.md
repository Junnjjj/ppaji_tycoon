# Class-level concept portfolios

Use this lane before isolated production when the user wants to discover a facility family, compare
footprints or colors, or judge whether several asset categories belong to the same Ppaji Tycoon world.
It is an image-generation exploration lane, not a geometry or runtime lane.

## Separate the three questions

1. **Concept sheet:** Which silhouettes, functions, materials, and color roles belong in the game?
2. **Footprint proof:** Does the selected object occupy its exact `W×D` tiles at one shared world scale?
3. **Production candidate:** Does the approved object preserve geometry, direction, anchor, palette, and
   native-size readability through the required production track?

A class sheet can answer only the first question. A mixed-footprint sheet is useful evidence for the
second question, but image generators often enlarge every item to fill its cell. Never promote a sheet
because the footprint labels look correct.

## Sheet design

- Generate category-level families before isolated A/B/C candidates when art direction is unsettled.
  Useful groups are entrance/operations, food, service/safety, fixed water attractions,
  rental/towable equipment, lodging/rest/landscape, and terrain/deck/props.
- Use one coherent projection, light, outline language, material system, and pixel-cluster density across
  a sheet. Vary structure and role, not overall art style.
- Use the exact item count requested. Choose a filled grid; explicitly forbid invented items when a row
  is intentionally short.
- Require language-independent, sign-hidden readability. Written language, letters, numbers, brands and
  generated fake glyphs do not belong on a production asset surface. Universal pictograms may support the
  structure but cannot be the only identity cue. Concept-sheet margin labels are review metadata only and
  must stay outside the extractable object.
- For a footprint-family validation sheet, use equal-sized cells and one common world scale. State the
  expected 32×16-tile base widths explicitly:

  ```text
  2×1 = 48 px, 2×2 = 64 px, 3×3 = 96 px
  normalized width ratio = 0.75 : 1.00 : 1.50
  ```

- A thin diagnostic plinth and section labels are allowed on a concept/footprint review sheet only.
  They must be removed from isolated production inputs and final sprites.

## Controlled roof and canopy diversity

The Korean ppaji identity does not require every roof to be the same color. Keep shared walls, wood,
pontoon blues, outlines, and upper-left lighting stable while assigning roof/canopy colors by role.

For four items in a comparison row, a useful starting set is:

```text
golden or safety yellow
terracotta or warm red
teal or turquoise
navy, cobalt, or charcoal
```

Use these as color roles, not a forced sequence. Do not let one roof hue dominate a category unless the
user requests a uniform branded district. Color variation does not replace structural variation: each
facility still needs a distinct roofline, opening, counter, doorway, canopy, or functional attachment.

## Reusable ImageGen prompt

Fill the inventory before calling the built-in `imagegen` workflow. Keep the negative constraints near
the end and do not ask for extra alternatives in the same call.

```text
Goal: Create one polished class-level concept sheet for Ppaji Tycoon, a Korean riverside water-leisure
park management game. This is GPT_CONCEPT_ONLY art-direction exploration, not production sprite art.

Canvas: 1536×1024 landscape. Clean neutral background. Exactly three horizontal sections with these
headings: 2×1 FACILITIES, 2×2 FACILITIES, 3×3 FACILITIES. Exactly four isolated facilities per section,
twelve total. Use equal-width cells and do not invent a thirteenth item.

Projection and style: chunky high-quality pixel art, orthographic 2:1 dimetric isometric, camera yaw
45 degrees and elevation 30 degrees, verticals perfectly upright, fixed light from screen upper-left,
warm dark outlines, two or three deliberate value bands per material, readable management-sim
silhouettes, no smooth 3D rendering and no photographic texture.

World-scale comparison: keep one common world scale across all twelve items; do not enlarge each object
to fill its cell. One 32×16 ground tile is the common unit. A 2×1 base is 48×24, a 2×2 base is 64×32,
and a 3×3 base is 96×48 before display enlargement, so their base-width ratio must read as
0.75 : 1.00 : 1.50. Make 2×1 long and shallow, 2×2 compact and square-ish, and 3×3 visibly broad.

Art direction: coherent Korean ppaji summer palette and material language across the sheet. Keep cream
walls, warm wood, deep blue structural bases, and outline treatment consistent. Deliberately diversify
roof and canopy hues across golden-yellow, terracotta/red, teal/turquoise, and navy/charcoal. Also vary
roofline and functional silhouette; do not create the same box with recolored roofs.

Inventory, left to right:
2×1: [four user-supplied facility identities]
2×2: [four user-supplied facility identities]
3×3: [four user-supplied facility identities]

Each facility must remain understandable with its sign hidden. Emphasize its functional opening,
counter, doorway, canopy, equipment, or activity surface. Keep props attached and countable.

Global-release signage: do not place written language, alphabetic or numeric strings, brand names, menu
words, prices or fake glyph-like text on any facility. Use language-neutral pictograms and physical
equipment cues. Keep any catalog labels outside the facility silhouette so production crops can exclude
them. Runtime UI owns localized facility names, menus and prices.

Avoid: people, vehicles, water, terrain scenery, mountains, UI chrome, cast shadows, overlapping cells,
cropped objects, repeated facilities, fake extra labels, per-cell scale fitting, uniform roof color,
perspective convergence, tiny unreadable inventory, or claims of runtime readiness.
```

If the requested categories or footprints differ, preserve the contract but replace the section plan and
inventory. If exact scale is the main validation target, generate a separate deterministic footprint
guide and compare the selected item after extraction or reconstruction; do not keep rerolling a concept
sheet as if prose could establish geometry.

## QA and disposition

Record each gate independently:

| Gate | What passes |
|---|---|
| Inventory | Exact requested count, order, and section membership |
| Category readability | Each item reads without relying on its sign |
| Global-release surface | No language-specific text or fake glyphs on the asset; pictograms and structure carry meaning |
| Family coherence | Projection, light, outline, materials, and detail density agree |
| Color diversity | Roof/canopy roles vary without breaking the common palette |
| Footprint archetype | Long/shallow, compact, and broad forms are visibly distinct |
| Common world scale | Measured base ratio agrees with the requested contract |
| Runtime geometry | Never passed by the concept sheet itself |

Use `PASS`, `WARN`, `FAIL`, or `NOT_TESTED` per gate. The overall status remains
`GPT_CONCEPT_ONLY` even when every visual gate passes. A world-scale `FAIL` does not erase a useful
silhouette or palette study, but it blocks footprint approval.

## Archive and approval contract

Store each version under the workspace's `artifacts/asset-concept-sheets/` or another user-approved
portfolio location. Preserve earlier versions.

```text
<sheet-slug>.png
<sheet-slug>-prompt.md
<sheet-slug>-qa.md
<sheet-slug>-manifest.json
```

The manifest must record the status, source filename, SHA-256, ordered inventory, intended footprints,
generation method, user-review state, production-approved boolean, and unresolved gates. If the exact
historical prompt is unavailable, say `prompt_record: unavailable`; do not recreate text and present it
as the original.

After the user selects an item, carry the exact image path and hash into the next package. Use
[generation.md](generation.md) for an eligible isolated static candidate, a deterministic structural
guide or scripted 3D for complex geometry, and `$ppaji-watercraft-pipeline` for moving/path-following
watercraft. Only explicit user approval can move a visual direction forward; it still does not prove
runtime geometry.
