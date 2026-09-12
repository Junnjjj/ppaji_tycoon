# Candidate generation

## 1. Select a generation lane

### Lane A — prompt-only four-up diagnostic

Use one 2×2 sheet only to test whether a deliberately simple design reads from several sides. Label the
result `CONCEPT_DIAGNOSTIC_ONLY`; it cannot prove projection or rigid rotation. This lane is limited to:

- one closed or solid main mass;
- at most three repeated secondary modules;
- one clearly colored direction marker;
- no more than four visually important material colors;
- no internal open-frame topology whose visibility changes under rotation.

Good demonstrated forms: a compact kiosk, a 2×1 kiosk, and a 2×1 inflatable base with two identical arches and one entry pad.

Do not assign directional PASS from the sheet, even when topology appears stable. Before promotion,
rebuild the selected object as one physical root and follow
[physical-direction-validation.md](physical-direction-validation.md).

### Lane B — simplify before physical reconstruction

Reduce medium-complexity objects to a shared family archetype. Keep the footprint and gameplay identity but remove ornamental roofs, uneven annexes, loose props, floor mats, labels, and micro-inventory. A decorated kiosk may retain a clerk and two or three grouped product cues if its shell is already stable.

Build the simplified result as scripted Blender geometry. Do not send the simplified concept back through
four independent direction-generation panels.

### Lane C — refined physical root required

Do not trust prompt-only four-up generation for open-frame or multi-level structures such as diving
platforms, large slides, stages, or exposed scaffolding. Build a deterministic scripted root or a
concept-faithful image-to-mesh/refined root. Image generation may style its corresponding locked physical
directions but must not decide component positions.

Also use Lane C for component-dense open-top interiors when rotation must preserve several independent
furniture positions, a seating array, or one exact door/curtain threshold. A footprint/camera guide alone
does not lock those local coordinates: it can leave tables camera-near in rear views or redraw a portal on
the visible face. Put the counter, seats, bed, cabinets, and access landmark into the deterministic
four-view physical root before asking image generation to style it.

## 2. Reference roles

Label every input image in the prompt.

- Real Korean ppaji photo: palette, inflatable PVC, and material mood only.
- Approved V4 pilot: chunky pixel language, simplification, and sheet layout only.
- Existing accepted sprite: subject identity only; explicitly forbid copying its ground slab, inconsistent camera, or excess detail.
- Structural guide: projection and component coordinates; attach last when the generation system supports ordered references.

Recommended workspace references:

- Water equipment style: `assets/generated/kairo-v4-simple-pilot/water-obstacle-2x1/raw/simple-inflatable-arch-obstacle-2x1-4dir.png`
- Kiosk shell: `assets/generated/kairo-v4-simple-pilot/shop-2x1/raw/simple-kiosk-2x1-4dir.png`
- Decorated kiosk interior: `assets/generated/kairo-v4-simple-pilot/shop-2x1-decorated/raw/simple-kiosk-2x1-decorated-4dir.png`
- Known failure, inspection only: `assets/generated/kairo-v4-simple-pilot/diving-2x2/raw/simple-diving-platform-2x2-4dir.png`

## 3. Shared visual contract

- Orthographic projection at camera yaw 45° and elevation 30°; no perspective convergence.
- Ground-plane edge families must measure `±atan(0.5) = ±26.565°`; verticals must remain 90°.
- One tile is 32×16 texels and the screen steps are `(+16,+8)` and `(-16,+8)`.
- Screen-upper-left light stays fixed in d0–d3.
- Vertical members remain vertical; ground-plane edges use only the two isometric diagonals.
- Keep identical scale, elevation, component count, spacing, and colors.
- Draw no placement diamond, footprint label, decorative floor mat, terrain slab, water tile, cast shadow, text, arrows, or UI.
- For a global-release facility, draw no written language, alphabetic or numeric string, brand, or fake
  glyph-like sign on the asset surface. Use structure, attached equipment and simple language-neutral
  pictograms. Put localized names, prices, menus and instructions in runtime UI instead of sprite pixels.
- An intrinsic object base is allowed: inflatable raft body, building floor/deck inside the shell, or actual floating pontoon. It must not resemble a generic placement tile.
- Use a solid magenta-family chroma background for the raw diagnostic sheet. Alpha is produced during post-processing.

## 4. Korean ppaji palette block

Apply this block to water facilities and water equipment, not automatically to indoor, winter, or accommodation assets.

```text
COLOR PALETTE — KOREAN PPAJI:
Use energetic summer colors inspired by Korean floating leisure parks: deep cobalt-blue floating pontoons, vivid fluorescent lime-green inflatable bodies, sunny safety yellow structures, turquoise connector accents, clean white highlight pixels, and warm dark navy outlines. Keep colors identical across all directions. Use blocky highlight bands to suggest padded inflatable PVC; do not import water, mountains, tents, people, or the photographic layout.
```

The project palette quantization remains authoritative after raw generation. Treat these as color roles, not permission to add arbitrary new final colors.

## 5. Diagnostic four-up direction block

For a long 2×1 object whose marked end defines the front:

```text
d0 top-left: front marker at screen lower-left
d1 top-right: front marker at screen lower-right
d2 bottom-left: front marker at screen upper-right
d3 bottom-right: front marker at screen upper-left
```

For square objects, define a marked physical side and use the same screen sequence. State that rear markers may be occluded naturally and must never be moved to stay visible.

This direction block is a prompt constraint, not evidence. Production direction metadata is always:

```text
d0 root yaw 0 degrees
d1 root yaw 90 degrees
d2 root yaw 180 degrees
d3 root yaw 270 degrees
```

Do not use a horizontal mirror, a transposed footprint guide, or a repeated panel as a substitute for
those physical root rotations.

## 6. Prompt order

Keep the prompt ordered as:

1. reference roles;
2. one-sentence asset identity and footprint;
3. exact fixed component inventory;
4. direction-marker relationship;
5. d0–d3 screen positions;
6. projection and fixed light;
7. style and applicable palette block;
8. layout/background;
9. avoid list focused on known failure modes.

Do not ask the model for section labels, footprint text, direction captions, or a visible tile. Those elements damage extraction and do not enforce geometry.

External labels may appear in a class-level concept catalog when they are clearly outside every object and
will be removed during isolated cropping. Never use them as part of the approved facility identity.

For production color/detail transfer, do not use this multi-panel prompt order. Use each corresponding
physical render as the primary editable image and the approved concept only as the additional
palette/material reference, then run the projection, silhouette and landmark gates in
[physical-direction-validation.md](physical-direction-validation.md).
