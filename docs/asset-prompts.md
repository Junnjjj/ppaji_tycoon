# 에셋 생성 프롬프트 — 전체 작업지시서

**2026-08-22.** GPT 이미지 생성에 그대로 붙여 넣는 영어 프롬프트 모음이다.
시트 **34장 · 그림 144장**으로 게임의 AI 에셋 전부를 덮는다.

| 무엇 | 수 | 어디 |
|---|---|---|
| 시설 | 75 | A·B |
| 지면 타일 (11종 × 3변형) | 33 | C |
| 다리 | 2 | C |
| 벽·문 (4방씩) | 8 | C |
| 배경 3겹 | 3 | C |
| 데코 | 8 | C |
| UI 아이콘 | 15 | C |

**쓰는 법:** 시트 하나 = 코드블록 하나. 통째로 복사해 붙이고, 그 시트가 지정한
레퍼런스 이미지를 첨부한다. 시트를 합치지 말 것 — 아래 §시트 크기 산식의 이유.

**산출물을 어디에 두나:** 시트가 돌아오면 셀을 잘라 `assets/generated/kairo/<파일명>`
에 **평면으로** 둔다. 파일명은 각 시트 머리의 대조표가 정본이다 — 스프라이트 ID 의
`/` 를 `__` 로 바꾸고, 변형이 있으면 뒤에 `__a0` 를 붙인다
(`facility/shop` → `facility__shop.png`, `ground/lawn:a0` → `ground__lawn__a0.png`).
⚠ 기존 `assets/generated/sprites/` 와 **섞지 말 것** — 그쪽은 sprite-gen 런 폴더
94개이고 (한 런이 `raw/`·`frames/`·`prompts/`·`palette.lock.json` 을 가진 디렉터리다)
여기 필요한 것은 계약 ID 로 이름 붙은 최종 PNG 한 장씩이라 규칙이 다르다.

⚠ **수치는 전부 실측 정본에서 왔다** (`src/assets/kairo-render-contract.json` ·
`src/data/kairo-facilities.json`). 계약이 바뀌면 이 문서도 다시 생성할 것 —
발자국·캔버스는 `캔버스 = ((W+D)×16) × ((W+D)×8 + bodyH)` 로 75/75 검증했다.

⚠ 스타일 블록은 34장 전부에서 **축자 동일**함을 기계로 대조했다 (34/34, UI 아이콘
시트만 투영 문단이 평면 아이콘으로 교체된다 — 그 시트 안에 이유가 적혀 있다).
한 장만 고치면 그 장의 결과가 조용히 갈라진다 — 고칠 일이 있으면 **전부** 고칠 것.

## 시트 목록

- Sheet S1 — Small 1x1 props (8 items, 4x2)
- Sheet S2 — Carts, counters and canopies (6 items, 3x2)
- Sheet S3 — Indoor service rooms (7 items, 4 top / 3 bottom)
- Sheet S4 — Indoor shops and game rooms (6 items, 3x2)
- Sheet S5 — Outdoor rest, warmth and park landmarks (6 items, 3x2)
- Sheet S6 — Waterfront rentals and water play (6 items, 3x2)
- Sheet L1 — Waterfront service rooms (4 items, 2x2)
- Sheet L2 — Open-air rows & scenery (4 items, 2x2) — GREEN chroma key
- Sheet L3 — Roofed structures & stays (6 items, 3x2)
- Sheet L4 — Open-air play & water (6 items, 3x2)
- Sheet L5 — Big flat plots & camps (4 items, 2x2)
- Sheet L6 — Big flat plots & frames (4 items, 2x2)
- Sheet L7 — Tube slide (1 item, own generation)
- Sheet L8 — Lodging & lazy river (2 items, 2x1)
- Sheet L9 — Big slides (2 items, 2x1)
- Sheet L10 — Air bounce & duplex pension (2 items, 2x1)
- Sheet L11 — Turtle island (1 item, own generation)
- Sheet W1 — ground/path_stone · 석재 보도 (3 items, 3 cells + proof block)
- Sheet W2 — ground/path_deck · 목재 데크길 (3 items, 3 cells + proof block)
- Sheet W3 — ground/path_sand · 모래길 (3 items, 3 cells + proof block)
- Sheet W4 — ground/lawn · 잔디 (3 items, 3 cells + proof block)
- Sheet W5 — ground/water_edge · 물가 (3 items, 3 cells + proof block)
- Sheet W6 — ground/floor_indoor · 실내 바닥 (3 items, 3 cells + proof block)
- Sheet W7 — ground/road · 차도 (3 items, 3 cells + proof block)
- Sheet W8 — ground/sidewalk · 보도 (3 items, 3 cells + proof block)
- Sheet W9 — ground/verge · 가로수 (3 items, 3 cells + proof block)
- Sheet W10 — ground/mountain_rock · 암반 (3 items, 3 cells + proof block)
- Sheet W11 — ground/pool_water · 수영장 물 (3 items, 3 cells + proof block)
- Sheet W12 — ground/bridge_x · bridge_z · 다리 (2 items, 2 cells + run proofs)
- Sheet W13 — wall/edge ×4 · wall/door ×4 · 유리벽과 문 (8 items, 4x2)
- Sheet W14 — backdrop/mountain · backdrop/ridge (2 items, 1x2 @ 2x)
- Sheet W15 — backdrop/farbank (1 item, 1x1 @ 3x)
- Sheet W16 — deco ×8 · 콤보 데코 (8 items, 4x2)
- Sheet W17 — ui/icon ×15 · HUD 아이콘 (15 items, 5x3)

# SHARED STYLE BLOCK — paste verbatim at the top of every sheet prompt

> Do not paraphrase this block. It is the contract; the sheet body below it only says
> *what* to draw, never *how*.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.
```

---

# HOW THE SHEETS ARE SIZED (read before generating)

Generate at **1536 x 1024**.

The trap: this repository already measured that packing many objects into one canvas
destroys them. A 4-up building strip dropped each building to a quarter of the
resolution, and after the 8x downscale to logical size the awning red bled to orange and
the detail turned to mush. Single-object generation was clearly better.

So the sheets below are grouped **by footprint size**, and the cell count is set so that
every object gets at least **6x its logical pixel width** on the sheet:

| logical width | grid | cell width | objects per sheet |
|---|---|---|---|
| 32 px | 4 x 2 | 384 | 8 |
| 48 px | 3 x 2 | 512 | 6 |
| 64 px | 3 x 2 (or 4/3 for 7) | 512 | 6-7 |
| 80 px | 2 x 2 | 768 | 4 |
| 96 px | 3 x 2 | 512 | 6 |
| 112-128 px | 2 x 2 | 768 | 4-5 |
| 144-176 px | 2 x 1 | 768 | 2-4 |
| 224 px | 1 x 1 | 1536 | 1 (own generation) |

Do not merge two sheets to save calls. The resolution loss is not recoverable.

⚠ **Never leave a dangling empty cell.** A 4-column grid holding 6 objects leaves half a
row empty, and the generator fills it with an invented seventh object. Pick the grid that
the item count fills exactly, and when it cannot (7 items), spell the split out in words:
"four on the top row, three on the bottom row, do not add an eighth object."

---

# SHEET PROMPT TEMPLATE

```
[SHARED STYLE BLOCK — pasted verbatim]

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. <SHEET THEME>.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. <COLUMNS> columns by
<ROWS> rows of evenly spaced cells. Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Items — exactly <N>, one per cell, in this order:
1. <label> — footprint <W>x<D> tiles — base diamond <(W+D)*16>x<(W+D)*8> px, body about
   <bodyH> px tall, whole sprite <canvasW>x<canvasH> px — <what it is, what it is made
   of, the one detail that makes its silhouette unmistakable>
...

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

# REFERENCE IMAGES TO ATTACH

All paths are under `art-reference/crops/`. Attach 2 per sheet; the first is primary.

| sheet kind | attach |
|---|---|
| buildings, huts, kiosks, indoor rooms | `iso-shower-hut.png` + `iso-vest-hut.png` |
| docks, decks, jetties, waterfront structures | `building-dock.png` + `dock-huts.png` |
| inflatable water rides, slides, floats | `iso-inflatable-a.png` + `iso-inflatable-b.png` |
| boats, rentals, paddle craft | `boats-water.png` + `iso-inflatable-c.png` |
| safety props, lifeguard gear | `iso-lifeguard.png` + `iso-vest-hut.png` |
| trees, planters, scenery, terrain | `foliage-hills.png` + `shore-trees-houses.png` |

Whole-scene references (`art-reference/ref-1.png`, `ref-2.png`) set the overall look —
attach one of them as a third image when a sheet feels like it is drifting off-style.

---

# MATERIALS THAT CROSS SHEET BOUNDARIES

Sheets are generated one at a time, so nothing forces two sheets to agree. These
materials appear on many sheets and **must be identical everywhere** — they physically
touch each other in the game (a slide stands on a floating deck; a deck butts against a
jetty). Fix them here and repeat the same words in every sheet that uses them.

| material | colors | say it like this |
|---|---|---|
| deck / jetty planking | `#dcb079` base, `#c49a6a` shadow, `#b5844a` edge boards | "warm tan wooden planking, boards running along the long axis" |
| pontoon float under anything on water | `#4a76c8` base, `#37599e` shadow, `#26406f` outline | "royal-blue plastic pontoon float, rounded ends" |
| building walls | `#fdf3e0` base, `#e4d3b4` shadow, `#a0947e` trim | "cream painted wall panels" |
| water held inside a pool or tub | `#7fd0e6` `#5fc6de` `#2b9ac4` `#1a7ba8` | "the water belongs to this object and stops at its rim" |

⚠ If two sheets disagree on plank tone, the seam shows in game the moment a slide is
placed on a deck. Regenerate the cheaper sheet rather than trying to recolor by hand —
the fixed palette means a wrong tone is a wrong palette entry, not a slight tint.

---

# WHAT IS **NOT** ON THIS LIST, AND WHY

- **Visitors / guests.** Drawn by code, permanently. The contract puts a whole face in an
  11-pixel head with 1-pixel eyes and 1-pixel mouth, across 4 facings x 7 poses x 8
  palettes. Image generation cannot hold that budget, and this is the single most
  identity-defining sprite in the game.
- **Water, ripples, boat wakes, shadows, ground shading.** Procedural forever.
- **The second facing of each facility.** The engine mirrors facing 0 horizontally
  (flipX). Only draw one view per facility.

---

# A. 시설 — 작은 것 (32·48·64 px)

# Sheet prompts — small facilities (canvas width 32 / 48 / 64)

39 facilities, 6 sheets. Each `## Sheet` heading is followed by exactly one code block:
the shared style contract verbatim + that sheet's body. Copy one block, attach the listed
reference images, generate at 1536 x 1024.

| sheet | items | grid | canvas w | chroma | references |
|---|---|---|---|---|---|
| S1 | 8 | 4x2 | 32 | green | `iso-lifeguard.png` + `building-dock.png` |
| S2 | 6 | 3x2 | 48 | green | `iso-shower-hut.png` + `iso-vest-hut.png` |
| S3 | 7 | 4/3 | 64 | magenta | `iso-shower-hut.png` + `iso-vest-hut.png` |
| S4 | 6 | 3x2 | 64 | green | `iso-shower-hut.png` + `iso-vest-hut.png` + `ref-1.png` |
| S5 | 6 | 3x2 | 64 | magenta | `iso-vest-hut.png` + `foliage-hills.png` |
| S6 | 6 | 3x2 | 64 | magenta | `boats-water.png` + `building-dock.png` |

**운영 메모 — 격자 선택.** 크기 표는 64px 에 4열(셀 384)을 적어 두었지만, 6개짜리 시트는
3열 2행(셀 512)으로 잡았다. 4열에 6개를 넣으면 아랫줄이 비어 생성기가 빈 칸을 채우려 들고,
3x2 는 셀이 512px 라 "논리 폭의 6배" 기준(384)을 오히려 넉넉히 넘긴다. S3 만 7개라
윗줄 4 · 아랫줄 3 으로 명시했다 (빈 셀을 남기면 생성기가 8번째 오브젝트를 만든다).

**운영 메모 — 크로마 키.** S1·S2·S4 는 초록. 구명환(적백)·자판기 전면·붕어빵 카트·
아이스크림·떡볶이 팬·치킨 간판처럼 **빨강/분홍이 실루엣의 핵심인 항목**이 그 세 시트에
몰려 있다. 팔레트의 초록은 전부 탁한 올리브(#8fbc63 / #7faa55)라 순수 #00FF00 과 안 겹친다.
나머지 셋은 기본 마젠타.

---

## Sheet S1 — Small 1x1 props (8 items, 4x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/arcade` | `facility__arcade.png` | Arcade cabinet |
| 2 | `facility/dock` | `facility__dock.png` | Jetty head |
| 3 | `facility/float_deck` | `facility__float_deck.png` | Floating deck panel |
| 4 | `facility/flowerbed` | `facility__flowerbed.png` | Flower planter |
| 5 | `facility/lifering` | `facility__lifering.png` | Life ring station |
| 6 | `facility/parasol` | `facility__parasol.png` | Beach parasol with chairs |
| 7 | `facility/vending_in` | `facility__vending_in.png` | Vending machine, indoor |
| 8 | `facility/vending_out` | `facility__vending_out.png` | Vending machine, outdoor |

**Attach:** `art-reference/crops/iso-lifeguard.png` (primary) + `art-reference/crops/building-dock.png`

**메모:** 이 시트는 절반이 작은 소품(구명함·파라솔·자판기·화단), 절반이 물가 바닥
(선착장·플로팅덱)이다. 그래서 소품 레퍼런스 하나 + 잔교 레퍼런스 하나를 붙인다.
자판기 두 종은 **실내/야외가 같은 크기·같은 실루엣**이라 색 + 비가림 후드 + 쓰레기통으로
갈랐다 — 안 갈라 놓으면 둘 중 하나가 무의미해진다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the small single-tile
props: two kinds of vending machine, a parasol, a flower planter, a lifesaving station,
an arcade cabinet, and two waterfront floor pieces.

Canvas: 1536 x 1024 landscape. Flat #00FF00 green background — this sheet uses GREEN, not
magenta, because the red-and-white life ring, the red vending fronts and the flower heads
would bleed into a magenta key. 4 columns by 2 rows of evenly spaced cells. Small dark
pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Items — exactly 8, one per cell, in this order:

1. Arcade cabinet — footprint 1x1 tiles — base diamond 32x16 px, body about 20 px tall,
   whole sprite 32x36 px — one upright coin-operated arcade machine standing indoors.
   Dark charcoal plastic cabinet #3a3f4a, a bright blue screen panel tilted back toward
   the viewer, a control shelf below it with one red and two yellow buttons and a short
   joystick, a coin slot strip on the front-right face. Open top, interior visible from
   above, no closed roof — this is a bare machine, nothing covers it. The tilted glowing
   screen is the detail that makes it unmistakable.

2. Jetty head — footprint 1x1 tiles — base diamond 32x16 px, body about 12 px tall, whole
   sprite 32x28 px — a small boat-mooring jetty made of pale plank timber #dcb079 on four
   short dark pilings #70522e, with two stubby mooring bollards on the far corners, a
   coiled rope loop lying flat on the planks, and a short ladder hooked over the
   lower-right edge. Drawn dry and complete, lifted out of the water, nothing cropped.
   The two bollards plus the overhanging ladder are the silhouette.

3. Floating deck panel — footprint 1x1 tiles — base diamond 32x16 px, body about 6 px
   tall, whole sprite 32x22 px — one square floating pontoon walkway tile: a thin slab of
   pale wood planking #dcb079 sitting on a solid blue plastic float block #4a76c8, with a
   darker blue #37599e edge band and small connector lugs on two corners. Very flat, only
   6 px of body. No railing, no post, no water. Use the cool outline #1e3348. Drawn dry
   and complete as if lifted out of the water.

4. Flower planter — footprint 1x1 tiles — base diamond 32x16 px, body about 8 px tall,
   whole sprite 32x24 px — a low raised planter box with timber sleeper sides #b5844a and
   a dark soil top, packed with a chunky cluster of blossom blocks — yellow #ffd23f, warm
   white #fdf3e0 and a few red #ef4b4b heads — sitting on dull olive foliage #7faa55.
   Blossoms are big single pixel blocks, not fine dots. Low and wide; the flower cluster
   should overhang the timber rim slightly.

5. Life ring station — footprint 1x1 tiles — base diamond 32x16 px, body about 12 px
   tall, whole sprite 32x28 px — a waterside safety post: a short timber post-and-board
   rack, with a big red-and-white ring buoy #ef4b4b hanging flat on it, a coil of white
   rope hooked beside the ring, and one spare blue swim tube leaning against the base.
   The circular ring buoy read from the front-right face is the whole silhouette — make
   it large and clearly round, not a small badge.

6. Beach parasol with chairs — footprint 1x1 tiles — base diamond 32x16 px, body about
   20 px tall, whole sprite 32x36 px — one open round parasol on a thin pole, canopy
   panelled in alternating cream #fdf3e0 and teal #62a58c wedges with a small scalloped
   rim, and two small folding chairs with pale sand #e8cf9a seats tucked under it. The
   chairs must touch the pole or its base so the whole thing stays one connected shape.

7. Vending machine, indoor — footprint 1x1 tiles — base diamond 32x16 px, body about
   20 px tall, whole sprite 32x36 px — one upright drinks vending machine in a cool blue
   cabinet #3d8fd6, with a tall lit product window on the front-right face showing three
   neat rows of tiny cans, a coin slot and button column down the right side, and a cream
   delivery flap at the bottom. Clean, indoor, nothing weatherproofing it. Open top,
   interior visible from above, no closed roof. Pair it visually with item 8 but keep the
   blue clearly distinct from that one's orange.

8. Vending machine, outdoor — footprint 1x1 tiles — base diamond 32x16 px, body about
   20 px tall, whole sprite 32x36 px — the same size machine but built for the roadside:
   an orange cabinet #ff8c42, a small sloped sheet-metal rain hood jutting out over the
   top edge, and a small dark waste bin bolted to its right side and touching the body.
   The rain hood plus the bolted-on bin are exactly what separates it from the indoor
   machine — make both unmistakable at a glance.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item.
```

---

## Sheet S2 — Carts, counters and canopies (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/bungeoppang` | `facility__bungeoppang.png` | Fish pastry cart |
| 2 | `facility/dj_booth` | `facility__dj_booth.png` | DJ booth |
| 3 | `facility/icecream` | `facility__icecream.png` | Ice cream counter |
| 4 | `facility/nursing` | `facility__nursing.png` | Baby care room |
| 5 | `facility/shade_net` | `facility__shade_net.png` | Shade sail |
| 6 | `facility/sikhye` | `facility__sikhye.png` | Sweet rice punch and egg corner |

**Attach:** `art-reference/crops/iso-shower-hut.png` (primary) + `art-reference/crops/iso-vest-hut.png`

**메모:** 전부 2x1(또는 1x2) 이라 **정사각으로 뭉개질 위험이 가장 큰 시트**다. 항목마다
"두 타일 길이"를 말로 못 박았고, 아이스크림만 **1x2 라 반대 방향(왼쪽 아래)** 으로 뻗는다는
문장을 따로 넣었다. 한국 고유 둘(붕어빵·식혜계란)은 이름을 번역하지 않고 "무엇을 파는
기계인가"로 풀었다 — 영어 이름만으로는 절대 안 그려진다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the two-tile-long carts,
counters and fabric canopies — small food stands and light shelters.

Canvas: 1536 x 1024 landscape. Flat #00FF00 green background — this sheet uses GREEN, not
magenta, because the soft-serve ice cream, the red awning and the warm red-brown pastry
cart would bleed into a magenta key. 3 columns by 2 rows of evenly spaced cells. Small
dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Every item on this sheet is TWO TILES LONG AND ONE TILE DEEP. That means a long narrow
base diamond, twice as long as it is deep — never a square kiosk.

Items — exactly 6, one per cell, in this order:

1. Fish pastry cart — footprint 2x1 tiles — base diamond 48x24 px, body about 20 px tall,
   whole sprite 48x44 px — a Korean street cart that bakes fish-shaped red-bean pastries
   in a hinged cast-iron mould. The cart body runs two tiles toward the LOWER RIGHT, so it
   is a long cart, not a square kiosk: a dark iron griddle plate on top holding one long
   row of fish-shaped mould wells, the hinged upper mould plate propped open above it, a
   gas bottle strapped under the cart between the wheels, a paper cup stack at the near
   end, and a small warm red-brown #8b3c31 fabric awning over the top that visibly touches
   the cart frame. The open hinged mould with the row of fish shapes is the silhouette.

2. DJ booth — footprint 2x1 tiles — base diamond 48x24 px, body about 18 px tall, whole
   sprite 48x42 px — an outdoor poolside DJ station: a two-tile-long console table running
   toward the lower right, dark charcoal #3a3f4a front face, twin turntable discs and a
   yellow-buttoned mixer laid out flat on the top surface, and one chunky speaker box
   standing at each end of the table so the two speakers bracket the console. A short
   string of festival bulbs runs along the front edge, attached to the table at both ends.
   Low and wide; no roof.

3. Ice cream counter — footprint 1x2 tiles — base diamond 48x24 px, body about 20 px tall,
   whole sprite 48x44 px — NOTE: this one is 1x2, so it is the MIRRORED long row — it runs
   two tiles toward the LOWER LEFT, not the lower right. A soft-serve ice cream counter:
   pale mint-cream counter front #fdf3e0 with a teal #62a58c base band, a chrome soft-serve
   machine with two nozzles standing on the counter top, an open chilled well beside it
   with three tubs of pale-pink, cream and pale-brown ice cream, and a big cone-shaped sign
   on a short post at the far end, touching the counter. Open top, interior visible from
   above, no closed roof.

4. Baby care room — footprint 2x1 tiles — base diamond 48x24 px, body about 20 px tall,
   whole sprite 48x44 px — a small quiet nursing and nappy-changing room, two tiles long
   toward the lower right, one tile deep. Cream plaster walls #fdf3e0 with a soft green
   #62a58c trim band along the bottom, a curtained cubicle closed off at the far end, and
   an open doorway at the near end with a small plaque beside it. Open top, interior
   visible from above, no closed roof — you can see a padded changing table against the
   back wall and a low pale sofa opposite it. Calm pastel, no signage clutter.

5. Shade sail — footprint 2x1 tiles — base diamond 48x24 px, body about 20 px tall, whole
   sprite 48x44 px — the cheapest patch of shade in the park: four thin pale timber poles
   carrying ONE taut rectangular fabric sail that spans two tiles toward the lower right,
   cream #f0dcae fabric with a teal #62a58c border stripe and a slight sag in the middle,
   corners lashed to the pole tops. A plain woven mat lies on the ground between the poles,
   touching their bases. The single big flat sail plane is the whole silhouette — do not
   turn it into a tent or a hut.

6. Sweet rice punch and egg corner — footprint 2x1 tiles — base diamond 48x24 px, body
   about 16 px tall, whole sprite 48x40 px — a small kiosk in a Korean sauna lobby selling
   sweet rice punch in cups and steamed eggs in baskets. Two tiles long toward the lower
   right, low at only 16 px: a warm wood counter #c49a6a with cream tile facing, a chilled
   drink dispenser on top holding pale golden rice punch with a spout and a stack of small
   cups beside it, and two stacked wire baskets heaped with brown steamed eggs at the other
   end of the counter. The dispenser plus the egg baskets side by side is the silhouette.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item.
```

---

## Sheet S3 — Indoor service rooms (7 items, 4 top / 3 bottom)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/changing_row` | `facility__changing_row.png` | Changing booth row |
| 2 | `facility/toilet` | `facility__toilet.png` | Restroom block |
| 3 | `facility/washbasin_row` | `facility__washbasin_row.png` | Wash basin row |
| 4 | `facility/infirmary` | `facility__infirmary.png` | First aid room |
| 5 | `facility/info` | `facility__info.png` | Information office |
| 6 | `facility/office` | `facility__office.png` | Staff office |
| 7 | `facility/storage` | `facility__storage.png` | Store room |

**Attach:** `art-reference/crops/iso-shower-hut.png` (primary) + `art-reference/crops/iso-vest-hut.png`

**메모:** 7종 전부 **크림 벽 + 열린 지붕의 실내 방**이라 시트 하나로 묶었을 때 레퍼런스가
완벽히 일치한다 — 그래서 7개짜리(가장 빽빽한) 시트를 이쪽에 몰았다. 대신 **지붕/트림 색을
7종 다르게 배분**했다 (청록·밝은 파랑·강철·흰색+적십자·노랑·슬레이트·갈색). 안 그러면
같은 크림 상자 일곱 개가 된다. `openTop` 이 전부 yes 라 "지붕 없음 + 안이 보임"을 각 항목에
넣었고, 3x1 두 종은 "한 줄에 셋"을 말로 적었다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the indoor service rooms —
washrooms, changing booths, first aid, information, staff office and store room. They are
all open-top rooms: the walls are built but there is no closed roof, so the interior is
seen from above.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. 7 cells total, arranged as
FOUR cells in the top row and THREE cells in the bottom row, evenly spaced and centered.
Do not add an eighth object. Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

All seven share the same construction — cream plaster walls #fdf3e0 with a warm #e4d3b4
shadow tone, open top, tiled or plank floor visible from above. They are told apart by
their trim colour and by the one prop inside each, so keep those seven trim colours
clearly different from each other.

Items — exactly 7, one per cell, in this order:

1. Changing booth row — footprint 3x1 tiles — base diamond 64x32 px, body about 20 px
   tall, whole sprite 64x52 px — a row of THREE changing booths standing side by side in
   one line marching toward the lower right, only one tile deep, sharing one continuous
   teal #62a58c top rail and one continuous back wall. Each booth has its own louvered
   half-door on the front-right face and its own small bench visible inside, because the
   booths are open top with no closed roof. Three identical repeated units, countable at a
   glance — this repetition is the silhouette. Not one wide cabin.

2. Restroom block — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — a square-ish public toilet block. Cream tiled walls with a
   bright blue #4a90b8 band running around the base, two doorways side by side on the
   front-right face each with a small pictogram plaque above it, and a pale tiled floor.
   Open top, interior visible from above, no closed roof — inside you see two partition
   stalls and a small basin against the far wall. The paired doorways with plaques are the
   detail that names it instantly.

3. Wash basin row — footprint 3x1 tiles — base diamond 64x32 px, body about 12 px tall,
   whole sprite 64x44 px — a row of THREE wash basins in one line toward the lower right,
   one tile deep, all sitting on one continuous pale counter slab with a steel-grey #a0947e
   splashback panel behind. Each basin has its own bowl, its own upright tap and its own
   small square mirror on the splashback. Very low, only 12 px tall, no walls and no roof.
   Three repeated bowl-and-tap units is the whole read.

4. First aid room — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — a small infirmary. Cream walls with a crisp white #fdf3e0 door
   frame and a small red cross plaque #ef4b4b mounted beside the doorway on the front-right
   face. Open top, interior visible from above, no closed roof — inside there is a
   treatment bed with a white sheet, a folding privacy screen standing beside it, and a
   small supply cabinet with a green cross on its door. Clinical, cooler and cleaner than
   the other rooms.

5. Information office — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px
   tall, whole sprite 64x52 px — where visitors ask directions and prices. Cream walls, a
   wide open service window cut into the front-right face with a counter sill and a small
   yellow #f2b53f canopy jutting over it and touching the wall, and a large park map board
   mounted flat on the front-left wall. Open top, interior visible from above, no closed
   roof — inside, a counter with two brochure racks. The window plus the yellow canopy is
   the silhouette.

6. Staff office — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — the back-office room visitors never enter. Cream walls with a
   dark slate blue #2e5972 trim band and a plain closed door with a small blank staff
   plaque — deliberately no service window, which is what separates it from the
   information office. Open top, interior visible from above, no closed roof — inside,
   two desks pushed together with a monitor, a swivel chair, a filing cabinet and a round
   wall clock.

7. Store room — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall, whole
   sprite 64x52 px — the equipment store. Plain timber-clad walls #b5844a instead of
   plaster, with a wide corrugated roll-up shutter door filling the front-right face,
   rolled halfway up. Open top, interior visible from above, no closed roof — inside,
   a leaning stack of swim rings, wooden crates and folded parasols bundled in a corner.
   The big shutter and the stack of rings is the read.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item — items 1 and 3 are LONG THIN three-unit rows, not squares.
```

---

## Sheet S4 — Indoor shops and game rooms (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/shop` | `facility__shop.png` | Convenience kiosk |
| 2 | `facility/snackbar` | `facility__snackbar.png` | Snack bar |
| 3 | `facility/chicken` | `facility__chicken.png` | Fried chicken shop |
| 4 | `facility/karaoke` | `facility__karaoke.png` | Karaoke room |
| 5 | `facility/pingpong` | `facility__pingpong.png` | Table tennis table |
| 6 | `facility/massage_row` | `facility__massage_row.png` | Massage chair row |

**Attach:** `art-reference/crops/iso-shower-hut.png` (primary) + `art-reference/crops/iso-vest-hut.png`
+ `art-reference/ref-1.png` (third — whole-scene look for the food stalls)

**메모:** S3 와 같은 "열린 실내 방" 구조라 레퍼런스를 공유하되, **음식 매대의 차양·간판
색감**이 필요해 전경 레퍼런스 한 장을 3번째로 붙인다. 크로마는 초록 — 떡볶이 팬(빨강)과
분식 차양, 치킨 간판이 이 시트에 몰려 있다. 탁구대(bodyH 12)와 안마의자 열(16)은 벽이 없는
낮은 물건이라 같은 시트에서 실루엣이 자동으로 갈린다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the indoor food stalls and
game rooms — the places visitors eat, sing and play when they are out of the water. Every
item is open top: walls but no closed roof, so the interior is seen from above.

Canvas: 1536 x 1024 landscape. Flat #00FF00 green background — this sheet uses GREEN, not
magenta, because the red awning, the pan of red rice cakes and the fried-chicken signage
would bleed into a magenta key. 3 columns by 2 rows of evenly spaced cells. Small dark
pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Items — exactly 6, one per cell, in this order:

1. Convenience kiosk — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — the little shop that sells instant cup noodles, crisps and
   drinks; the most-visited building in the park. Cream walls #fdf3e0 with a teal #62a58c
   awning over an open serving counter on the front-right face, the awning visibly joined
   to the wall. Open top, interior visible from above, no closed roof — inside, a shelf
   wall of stacked cup-noodle pots and snack bags, a tall glass drinks fridge glowing pale
   blue, and a hot-water dispenser standing on the counter. The counter shelf of stacked
   noodle pots is the detail that names it.

2. Snack bar — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall, whole
   sprite 64x52 px — a Korean bunsik stand selling spicy rice cakes and fritters. Cream
   walls under a red-and-cream striped #e0604f awning across the open front-right counter.
   Open top, interior visible from above, no closed roof — on the counter sits one wide
   shallow steel pan full of bright red rice-cake stew, and beside it a wire fryer basket
   heaped with golden battered fritters and a jar of skewers. The wide red pan is the one
   detail that makes it unmistakable — make it big and clearly red.

3. Fried chicken shop — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px
   tall, whole sprite 64x52 px — the evening queue. Cream walls with a wide amber #f2b53f
   sign board running along the top of the front-right face, no lettering on it, just a
   flat painted panel. Open top, interior visible from above, no closed roof — inside, a
   lit glass warming cabinet stacked with golden fried chicken pieces, a deep fryer with a
   raised basket beside it, and a short stack of takeaway boxes on the counter. The lit
   warmer cabinet full of golden blocks is the read.

4. Karaoke room — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — a Korean noraebang room where groups end the evening. Dark
   slate blue walls #2e5972 with warm #967027 trim, much darker than the other rooms on
   this sheet. Open top, interior visible from above, no closed roof — inside, an L-shaped
   sofa along two walls, a low table with a tambourine, a bright screen panel mounted on
   the back wall, and two microphones on short stands rising from the table. A small
   mirrored ball hangs on a short stem off the back wall so it stays connected to the body.

5. Table tennis table — footprint 2x2 tiles — base diamond 64x32 px, body about 12 px
   tall, whole sprite 64x44 px — one single ping-pong table, no walls, no room, no roof.
   A dark green #3d6657 playing surface with a white centre line and a white edge stripe,
   a white mesh net standing across the middle, and dark folding legs #3a3f4a underneath.
   One red paddle and one small white ball rest on the surface. Very low at 12 px — this
   is furniture, not a building, and that is what separates it from its neighbours.

6. Massage chair row — footprint 3x1 tiles — base diamond 64x32 px, body about 16 px
   tall, whole sprite 64x48 px — a row of THREE coin-operated reclining massage chairs
   side by side in one line marching toward the lower right, only one tile deep, all
   standing on one continuous low plinth. Each chair is a chunky black-charcoal recliner
   #3a3f4a with a cream #f0dcae headrest pad, tilted back, footrest raised, and a small
   yellow coin box on the right armrest. Three identical repeated units, countable at a
   glance. No walls, no roof.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item — item 6 is a LONG THIN three-unit row, not a square.
```

---

## Sheet S5 — Outdoor rest, warmth and park landmarks (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/firepit_row` | `facility__firepit_row.png` | Fire pit row |
| 2 | `facility/footbath` | `facility__footbath.png` | Warm foot bath row |
| 3 | `facility/mongol_tent` | `facility__mongol_tent.png` | Round rental tent |
| 4 | `facility/fountain` | `facility__fountain.png` | Fountain |
| 5 | `facility/photozone` | `facility__photozone.png` | Photo spot |
| 6 | `facility/lookout` | `facility__lookout.png` | Lookout tower |

**Attach:** `art-reference/crops/iso-vest-hut.png` (primary) + `art-reference/crops/foliage-hills.png`

**메모:** 전부 야외(`land`/`season`)에 서는 물건이라 한 시트로 묶었다. 구조물 레퍼런스 +
경관 레퍼런스를 섞은 이유는 전망대·포토존·몽골텐트는 건물 결이 필요하고, 분수·화로대·족욕은
공원 소품 결이 필요해서다. 몽골텐트는 이 프로젝트에서 **가장 번역이 어려운 항목** —
"yurt" 라고만 쓰면 몽골 초원 게르가 나오므로 "한국 강변 리조트에서 자리를 통째로 빌려 주는
흰 원형 텐트"로 용도를 함께 적었다. 마젠타 크로마 (빨강·분홍 지배 항목 없음).

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the open-air rest spots,
warm-season comforts and park landmarks — the pieces that make the park look like
somewhere worth photographing.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. 3 columns by 2 rows of
evenly spaced cells. Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Items — exactly 6, one per cell, in this order:

1. Fire pit row — footprint 3x1 tiles — base diamond 64x32 px, body about 8 px tall,
   whole sprite 64x40 px — a row of THREE low charcoal fire pits in one line marching
   toward the lower right, only one tile deep, evenly spaced along a shared strip of pale
   flagstone. Each pit is a round steel brazier #3a3f4a on three stubby legs with a dark
   grill grate laid across the top and a bed of glowing orange #ff8c42 charcoal blocks
   under the grate. Very low, only 8 px tall. No flames rising free, no smoke — nothing
   detached from the body. Three identical repeated units, countable at a glance.

2. Warm foot bath row — footprint 3x1 tiles — base diamond 64x32 px, body about 8 px
   tall, whole sprite 64x40 px — a row of THREE long shallow foot-soaking tubs in one line
   toward the lower right, one tile deep, for cool-season visitors who only put their feet
   in. Each tub is a stone basin with a broad timber sitting rim #c49a6a around it, filled
   with pale blue #7fd0e6 water and a few smooth grey pebbles on the bottom. The water is
   part of the tub, contained inside its rim — it is not a pool on the ground. No steam,
   nothing floating free. Very low at 8 px; three repeated basins is the silhouette.

3. Round rental tent — footprint 2x2 tiles — base diamond 64x32 px, body about 24 px
   tall, whole sprite 64x56 px — the signature shelter of Korean riverside resorts: a
   white round yurt-style tent that a group rents for the whole day. A circular white
   canvas drum #fdf3e0 with a shallow domed roof, a scalloped valance skirt around the
   roof edge, a warm red-brown #8b3c31 trim band at the base, and one rolled-up door flap
   tied open on the front-right face showing a dark interior. Guy ropes must touch the
   tent body or be left out entirely. Round and soft — no square walls, no gable roof.

4. Fountain — footprint 2x2 tiles — base diamond 64x32 px, body about 12 px tall, whole
   sprite 64x44 px — a low ornamental fountain that anchors a plaza. An eight-sided pale
   sandstone basin #e8cf9a with a darker #dcc088 coping rim, a short stubby pillar rising
   from its centre, and a chunky plume of pale blue-white water #7fd0e6 blocks bursting
   from the pillar top and falling back into the basin, drawn as solid connected blocks
   touching the pillar. The water inside the basin belongs to the object, not the ground.
   Low and wide at 12 px.

5. Photo spot — footprint 2x2 tiles — base diamond 64x32 px, body about 24 px tall, whole
   sprite 64x56 px — the corner visitors stop to photograph. A big empty picture frame
   standing upright on two sturdy posts, the frame painted cream #f0dcae with teal
   #62a58c corner blocks, and a plain blank painted sign plank fixed across the top of the
   frame with no lettering on it. A single low timber step platform sits in front of the
   frame, touching both posts. You can see straight through the empty frame — that hollow
   rectangle is the silhouette.

6. Lookout tower — footprint 2x2 tiles — base diamond 64x32 px, body about 40 px tall,
   whole sprite 64x72 px — a timber viewing deck that overlooks the river; the tallest
   thing on this sheet at 40 px. Four stout dark posts #70522e carry a railed platform of
   pale planking #dcb079, with a straight open staircase climbing the front-right side to
   the platform, and a small pitched shade roof #3d6657 on four thin corner posts over the
   deck. Tall, open and skeletal — you can see through under the platform between the
   posts.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item — items 1 and 2 are LONG THIN three-unit rows, not squares.
```

---

## Sheet S6 — Waterfront rentals and water play (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/diving` | `facility__diving.png` | Diving platform |
| 2 | `facility/waterwalk` | `facility__waterwalk.png` | Water walking balls |
| 3 | `facility/rent_duck` | `facility__rent_duck.png` | Duck boat dock |
| 4 | `facility/rent_kayak` | `facility__rent_kayak.png` | Kayak rental |
| 5 | `facility/rent_pedal` | `facility__rent_pedal.png` | Pedal boat rental |
| 6 | `facility/rent_sup` | `facility__rent_sup.png` | Paddleboard rental |

**Attach:** `art-reference/crops/boats-water.png` (primary) + `art-reference/crops/building-dock.png`

**메모:** 6종 전부 `water` 레이어. 레퍼런스는 매핑 표의 "보트·대여" 1순위에 "잔교" 를 짝지어
붙였다 — 대여소 넷은 **보트 + 발판(폰툰)** 이 한 몸이라 두 결이 다 필요하다.
⚠ 이 시트의 진짜 위험은 **대여소 네 종이 똑같이 보이는 것**이다. 그래서 실루엣을 네 갈래로
못 박았다: 오리 머리 / 비스듬한 카약 거치대 / 네모난 페달보트 + 차양 / **세로로 세운 납작한
보드**. 물은 절대 안 그린다 (엔진이 그린다) — 전부 "물에서 들어 올린 마른 상태".

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. This sheet is the waterfront: a diving
platform, a water-walking ball pen, and four boat rental stations. Every one of them
normally sits on the river, so draw each one DRY and COMPLETE, as if lifted out of the
water — no waterline, no ripples, no reflection, nothing cropped at the bottom.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. 3 columns by 2 rows of
evenly spaced cells. Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

All six stand on floating pontoon platforms of blue plastic float blocks #4a76c8 /
#37599e under pale plank decking #dcb079, and all six may use the cool outline #1e3348.
The four rental stations are the same size and would look identical if you are careless —
their four silhouettes are deliberately different and must stay different.

Items — exactly 6, one per cell, in this order:

1. Diving platform — footprint 2x2 tiles — base diamond 64x32 px, body about 36 px tall,
   whole sprite 64x68 px — a timber diving tower on a floating deck, the tall item on this
   sheet. Four dark posts #70522e carry a small railed top platform of pale planks, a
   straight ladder climbs the front-left face, and one single springboard sticks out
   horizontally from the platform toward the lower right with its tip cantilevered well
   past the base, blue-white #4a90b8 with a grippy pale tread. The overhanging board is
   the silhouette — make the overhang obvious.

2. Water walking balls — footprint 2x2 tiles — base diamond 64x32 px, body about 16 px
   tall, whole sprite 64x48 px — a small square pen of inflatable pontoon tubes with TWO
   big transparent walking balls resting inside it. Each ball is a fat sphere of pale cyan
   #7fd0e6 with a paler #f0dcae highlight arc on the upper left, a white zip seam running
   over the top, and a slightly darker #5fc6de shadow band on the lower right. The two
   round balls sitting in a square frame is the read. Low at 16 px.

3. Duck boat dock — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — the rental point for slow swan-shaped pedal boats. A pontoon
   platform with a short sign post at the back, and TWO duck-shaped pedal boats moored
   alongside it — white #fdf3e0 tub hulls with a tall rounded duck neck and head rising at
   the bow, orange #ff8c42 beak, a single dark eye dot, and a shaped tail at the stern. The
   raised duck necks are the one thing that separates this station from the other three —
   make them tall and obvious.

4. Kayak rental — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px tall,
   whole sprite 64x52 px — a pontoon platform carrying an A-frame timber rack that holds
   THREE long slim kayak hulls stacked on it at a slant, one above the other — orange
   #ff8c42, teal #62a58c and yellow #ffd23f, each a narrow pointed hull with a single open
   cockpit hole. A barrel beside the rack holds a bundle of long double-bladed paddles
   standing upright. The slanted rack of long thin pointed hulls is the silhouette.

5. Pedal boat rental — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px
   tall, whole sprite 64x52 px — a pontoon platform with TWO boxy pedal boats moored
   alongside: broad square-cornered tub hulls in blue #3d8fd6 and white, two moulded seats
   side by side, a low back rail, and one of the two carrying a small flat sun canopy on
   four thin corner posts. A rail of hanging orange life vests runs along the platform
   edge, touching the deck. Deliberately blunt and rectangular with NO animal head — that
   is what tells it apart from the duck boats.

6. Paddleboard rental — footprint 2x2 tiles — base diamond 64x32 px, body about 20 px
   tall, whole sprite 64x52 px — a pontoon platform with a vertical storage frame holding
   FOUR stand-up paddleboards stood on end, upright and leaning against the frame, seen
   edge-on as tall flat slabs — teal, yellow, cream and orange, each with a dark grip pad
   patch and a rounded nose at the top. Long single-blade paddles lean in a bundle beside
   them. Tall flat upright boards in a row is the silhouette, completely unlike the three
   other rental stations, where the boats lie flat.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.

Do not turn any footprint into a square box. Obey the base diamond pixel sizes written
above for every single item.
```

---

# Coverage check — 39 of 39

**32 px (8):** arcade · dock · float_deck · flowerbed · lifering · parasol · vending_in ·
vending_out → **S1**

**48 px (6):** bungeoppang · dj_booth · icecream · nursing · shade_net · sikhye → **S2**

**64 px (25):**
- **S3 (7)** changing_row · toilet · washbasin_row · infirmary · info · office · storage
- **S4 (6)** shop · snackbar · chicken · karaoke · pingpong · massage_row
- **S5 (6)** firepit_row · footbath · mongol_tent · fountain · photozone · lookout
- **S6 (6)** diving · waterwalk · rent_duck · rent_kayak · rent_pedal · rent_sup

---

# B. 시설 — 큰 것 (80 px 이상)

# Ppaji Tycoon — asset sheet prompts, LARGE group (canvas width ≥ 80 px)

36 facilities, 11 sheets. Grouped by footprint size first (resolution budget), then by
reference-image compatibility inside each size band.

| sheet | items | grid | key | references |
|---|---|---|---|---|
| L1 Waterfront service rooms (80) | 4 | 2x2 | magenta | `iso-shower-hut.png` + `iso-vest-hut.png` |
| L2 Open-air rows & scenery (80) | 4 | 2x2 | **green** | `building-dock.png` + `foliage-hills.png` |
| L3 Roofed structures & stays (96) | 6 | 3x2 | magenta | `iso-shower-hut.png` + `shore-trees-houses.png` |
| L4 Open-air play & water (96) | 6 | 3x2 | magenta | `building-dock.png` + `dock-huts.png` |
| L5 Big flat plots & camps (112) | 4 | 2x2 | magenta | `building-dock.png` + `iso-shower-hut.png` |
| L6 Big flat plots & frames (128) | 4 | 2x2 | magenta | `building-dock.png` + `dock-huts.png` |
| L7 Tube slide (128, solo) | 1 | 1x1 | magenta | `building-dock.png` + `dock-huts.png` |
| L8 Lodging & lazy river (144) | 2 | 2x1 | magenta | `iso-shower-hut.png` + `shore-trees-houses.png` |
| L9 Big slides (144) | 2 | 2x1 | magenta | `building-dock.png` + `dock-huts.png` |
| L10 Air bounce & duplex (176) | 2 | 2x1 | magenta | `iso-inflatable-a.png` + `iso-shower-hut.png` |
| L11 Turtle island (224, solo) | 1 | 1x1 | magenta | `building-dock.png` + `iso-inflatable-b.png` |

**운영 메모 — 레퍼런스 배정 원칙**
- 인플레이터블 레퍼런스는 **실제 인플레이터블만 있는 시트**에만 붙였다. 실측 2회로
  "레퍼런스가 프롬프트를 이긴다"가 확인됐고, 목조/프레임 구조물에 튜브 링 베이스가 생겼다.
  그래서 L4 의 수상 트램폴린과 L5 의 점프쿠션은 레퍼런스 없이 **말로만** 인플레이터블로
  지정했다 (같은 시트의 리지드 5종을 지키는 쪽을 택했다).
- L10 만 인플레이터블 레퍼런스를 쓴다 (에어바운스). 같은 시트의 복층 펜션에는 항목 안에
  "이 레퍼런스를 따르지 말 것" 을 명시했다 — 그래도 튜브 베이스가 나오면 **두 항목을
  따로 생성**할 것. 176 폭이라 각자 한 장씩 써도 해상도 손해가 없다.
- 슬라이드 4종(소·대·튜브·눈썰매)은 `src/data/kairo-facilities.json` 의 `ride` 실측:
  `entryTile = (w-1, d-1)` = 발자국의 **앞(아래) 꼭지점**, `exitTile = (0,0)` = **뒤(위)
  꼭지점**. 즉 계단은 화면 아래쪽 가까운 모서리, 미끄러져 나오는 출구 레인은 화면 위쪽
  먼 모서리다. 네 프롬프트 전부 이 방향으로 적었다.
- `bodyH = 0` 인 풀 3종(유아풀·온수풀·유수풀)은 지면과 같은 높이의 **가라앉은 수조**다.
  스타일 블록의 "물을 그리지 마라" 는 지형 물이고 수조 안의 물은 오브젝트 자체이므로,
  항목마다 "타일 테두리 **안쪽에만** 물, 바깥엔 한 픽셀도 없음" 을 따로 적었다.

---

## Sheet L1 — Waterfront service rooms (4 items, 2x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/cafe` | `facility__cafe.png` | CAFE |
| 2 | `facility/locker_row` | `facility__locker_row.png` | LOCKER ROW |
| 3 | `facility/shower_row` | `facility__shower_row.png` | SHOWER ROW |
| 4 | `facility/ticket` | `facility__ticket.png` | TICKET BOOTH |

Attach: `art-reference/crops/iso-shower-hut.png` (primary) + `art-reference/crops/iso-vest-hut.png`

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: service rooms and the park
gate — three open-topped indoor fittings and one roofed ticket booth.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (no subject on this sheet
is pink or red, so the magenta key is safe). 2 columns by 2 rows of evenly spaced cells,
each cell about 768 x 512 px. Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

OPEN TOP — read this before drawing items 1, 2 and 3.
Three of these four objects are indoor fittings that the game places inside a room the
player has already built. They have NO roof slab. Draw them open from above so the
interior floor and every fitting inside is visible, because the engine draws its own
visitors standing inside them. Use the reference huts for material and outline weight
only, not for "put a roof on it".

Items — exactly 4, one per cell, in this order:

1. CAFE — footprint 2x3 tiles (2 wide toward the lower right, 3 deep toward the lower
   left, so it is a deep rectangle, half again as deep as it is wide) — base diamond
   80x40 px, body about 20 px tall, whole sprite 80x60 px — an open-top cafe fitting.
   An L-shaped service counter of warm wood #b5844a with a cream #fdf3e0 front panel
   runs along the back-left edge; on the counter sit a chunky espresso machine #3a3f4a
   and a shelf of cups; two small round tables of #c49a6a wood stand on the open floor.
   The one detail that makes the silhouette unmistakable: a tall dark #3a3f4a chalkboard
   menu board standing upright at the end of the counter, blank (no lettering), the only
   thing on this object that rises above counter height. Open top, interior visible from
   above. No roof, no awning.

2. LOCKER ROW — footprint 4x1 tiles (a row of FOUR locker cabinets marching away toward
   the lower right, only one unit deep — a long thin diamond, not a square building) —
   base diamond 80x40 px, body about 20 px tall, whole sprite 80x60 px — a continuous
   bank of four coin lockers sharing one top rail. Steel-blue #4a90b8 doors with #2e5972
   shadow tone, each door carrying a small #ffd23f coin slot and a cream number plate.
   The one detail that makes the silhouette unmistakable: exactly four countable door
   panels in a straight receding row, all the same width. Open top, interior visible from
   above — the top of the bank is an open tray, not a roof.

3. SHOWER ROW — footprint 4x1 tiles (a row of FOUR shower stalls marching away toward
   the lower right, only one unit deep) — base diamond 80x40 px, body about 20 px tall,
   whole sprite 80x60 px — four open-top shower cubicles divided by cream tiled
   partitions #e4d3b4 with #a0947e shadow tone, a tiled floor with a drain in each stall,
   and a teal #62a58c curtain hanging on one side of each stall (curtains must touch the
   partitions). The one detail that makes the silhouette unmistakable: four chrome
   #a0947e gooseneck shower heads on pipes, one per stall, standing above open cubicles
   you can see straight down into. Open top, interior visible from above.

4. TICKET BOOTH — footprint 3x2 tiles (3 wide toward the lower right, 2 deep toward the
   lower left, a wide shallow rectangle) — base diamond 80x40 px, body about 24 px tall,
   whole sprite 80x64 px — this one IS roofed: a small wooden gatehouse with cream
   #fdf3e0 walls, a warm yellow #f2b53f gabled roof with #967027 shadow tone, and a wide
   open serving window on the lower-right face with a dark #3a3f4a counter shelf and a
   roll of tickets on it. The one detail that makes the silhouette unmistakable: a low
   turnstile rail of #b5844a wood standing out from the booth on the lower-right side,
   attached to and touching the booth wall, so the object reads as a gate you pass
   through. A small blank sign plaque hangs under the roof edge — no lettering on it.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L2 — Open-air rows & scenery (4 items, 2x2) — GREEN chroma key

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/pyeongsang_row` | `facility__pyeongsang_row.png` | PYEONGSANG ROW |
| 2 | `facility/sunbed_row` | `facility__sunbed_row.png` | SUNBED ROW |
| 3 | `facility/maple_walk` | `facility__maple_walk.png` | MAPLE WALK |
| 4 | `facility/stage_river` | `facility__stage_river.png` | RIVER STAGE |

Attach: `art-reference/crops/building-dock.png` (primary, for the three timber objects) +
`art-reference/crops/foliage-hills.png` (for the maple trees)

**녹색 키를 쓰는 이유:** 단풍 산책로의 잎이 팔레트의 빨강 `#e0604f` · 주황 `#ff8c42`
계열이라 마젠타 키와 색상이 가까워 크로마 제거 때 가장자리가 먹힌다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: open-air rows and scenery —
three low timber structures and one line of autumn trees.

Canvas: 1536 x 1024 landscape. THIS SHEET USES THE GREEN KEY: flat solid #00FF00 green
filling the whole canvas behind the sprites, because item 3's autumn maple canopy is red
and orange and would be eaten by a magenta key. Do not use magenta on this sheet.
2 columns by 2 rows of evenly spaced cells, each cell about 768 x 512 px. Small dark
pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
The dock reference governs items 1, 2 and 4 (timber). The foliage reference governs
item 3 (trees) only.

Items — exactly 4, one per cell, in this order:

1. PYEONGSANG ROW — footprint 4x1 tiles (a row of FOUR platforms marching away toward
   the lower right, only one unit deep — a long thin diamond) — base diamond 80x40 px,
   body about 8 px tall, whole sprite 80x48 px — a row of raised wooden platforms
   (Korean "pyeongsang"): no chairs, no backrests, people sit on the floor. Each unit is
   a low slatted deck of #dcb079 planks with visible plank lines, standing on four stubby
   legs of #b5844a, and carries one flat square cushion #62a58c. The one detail that
   makes the silhouette unmistakable: four completely flat empty tops in a receding row,
   only 8 px tall — nothing at all rises above the deck surface except the thin cushions.

2. SUNBED ROW — footprint 4x1 tiles (a row of FOUR sunbeds marching away toward the
   lower right, only one unit deep) — base diamond 80x40 px, body about 8 px tall, whole
   sprite 80x48 px — four reclining sunbeds in a straight line, each a cream #fdf3e0
   canvas sling on a #c49a6a wooden frame with #b5844a shadow tone. The one detail that
   makes the silhouette unmistakable: four slanted backrests raised at the same angle,
   giving a stepped saw-tooth rhythm along the row — this is what separates it from the
   flat pyeongsang row above it. Open top, interior visible from above.

3. MAPLE WALK — footprint 4x1 tiles (a row of FOUR maple trees marching away toward the
   lower right along one narrow path strip, only one unit deep) — base diamond 80x40 px,
   body about 20 px tall, whole sprite 80x60 px — an autumn maple walking path with a red
   and orange canopy. A narrow paved strip of #e4d3b4 stone runs the whole length of the
   footprint, and four maple trees stand along it, trunks #70522e, chunky rounded canopies
   in red #e0604f with orange #ff8c42 as the lit tone. The one detail that makes the
   silhouette unmistakable: the continuous pale path strip threading under all four
   crowns, so it reads as a path and not as four separate trees. A few fallen leaves as
   single pixel blocks on the path, touching it.

4. RIVER STAGE — footprint 3x2 tiles (3 wide toward the lower right, 2 deep toward the
   lower left, a wide shallow rectangle) — base diamond 80x40 px, body about 22 px tall,
   whole sprite 80x62 px — a raised timber performance stage: a plank deck of #c49a6a
   with a #b5844a fascia board around the edge and a low step down at the lower-right
   front edge, a dark #3a3f4a back wall standing along the upper-left edge. The one
   detail that makes the silhouette unmistakable: two chunky black speaker stacks #3a3f4a
   flanking the deck at the back corners, with a simple horizontal lighting truss bridging
   them — draw the truss as an open lattice frame you can see through, with every bar at
   least 2 pixel blocks thick so it does not disappear. The truss must touch both speaker
   stacks so the whole object stays one connected silhouette.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L3 — Roofed structures & stays (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/bungalow` | `facility__bungalow.png` | BUNGALOW |
| 2 | `facility/caravan` | `facility__caravan.png` | CARAVAN |
| 3 | `facility/pavilion` | `facility__pavilion.png` | PAVILION (JEONGJA) |
| 4 | `facility/jjimjilbang` | `facility__jjimjilbang.png` | JJIMJILBANG |
| 5 | `facility/sauna` | `facility__sauna.png` | SAUNA |
| 6 | `facility/camp_site` | `facility__camp_site.png` | CAMP SITE |

Attach: `art-reference/crops/iso-shower-hut.png` (primary) +
`art-reference/crops/shore-trees-houses.png`

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: roofed structures and
overnight stays — lodging, a traditional pavilion, two hot rooms and a camp pitch.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (no subject on this sheet
is pink; the darkest red used is the dull tile #8b3c31, far from the key hue). 3 columns
by 2 rows of evenly spaced cells, each cell about 512 x 512 px. Small dark pixel-font
English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

ROOF COLOR — every item on this sheet gets a DIFFERENT roof or shell color so the six
read apart at a glance. The colors are stated per item; do not swap them.

Items — exactly 6, one per cell, in this order:

1. BUNGALOW — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body about
   32 px tall, whole sprite 96x80 px — a Korean riverside guesthouse: boxy, balconies,
   exterior stairs. One small cabin with cream #fdf3e0 walls and #e4d3b4 shadow tone, a
   blue #4a90b8 hipped roof with #2e5972 shadow tone, one door and two square windows on
   the visible faces. The one detail that makes the silhouette unmistakable: a short
   exterior wooden stair of #b5844a climbing the lower-right face to a narrow front
   balcony with a slatted rail — the stair and rail must touch the wall.

2. CARAVAN — footprint 4x2 tiles (4 units long toward the lower right, only 2 deep — a
   long low box, twice as long as it is deep) — base diamond 96x48 px, body about 28 px
   tall, whole sprite 96x76 px — a wheeled trailer home: cream #fdf3e0 body with a
   #3d8fd6 stripe running the whole length, a rounded roof cap, a door with two steps and
   a band of small windows. The one detail that makes the silhouette unmistakable: two
   chunky black #3a3f4a wheels tucked under the lower-right side, plus a fold-out striped
   awning in #f2b53f and cream that is clearly attached to and touching the side wall.

3. PAVILION (JEONGJA) — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px,
   body about 28 px tall, whole sprite 96x76 px — a Korean pavilion: tiled curved roof on
   wooden posts, open on all sides. Dark red-brown tile roof #8b3c31 with #70522e shadow
   tone and clearly upturned corner eaves, six stout posts #70522e, a raised plank floor
   deck #dcb079 with a low slatted rail between the posts. The one detail that makes the
   silhouette unmistakable: you can see straight through the building between the posts —
   there are no walls at all, only the floating-looking roof carried on posts.

4. JJIMJILBANG — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body
   about 20 px tall, whole sprite 96x68 px — an open-top Korean dry sauna room: low walls
   only, a warm ochre #967027 heated floor with #b5844a shadow tone, a stack of rolled
   towels and two flat floor mats. The one detail that makes the silhouette unmistakable:
   a rounded clay dome kiln in the far corner, built of #a0947e stone blocks, with a small
   arched mouth glowing #ff8c42 — the only rounded form in the room. Open top, interior
   visible from above; no roof slab, the engine draws its own visitors lying inside.

5. SAUNA — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body about
   20 px tall, whole sprite 96x68 px — an open-top wooden hot room: log-plank walls
   #b5844a with #70522e shadow tone and strong horizontal plank lines, a #dcb079 slat
   floor. The one detail that makes the silhouette unmistakable: two stepped tiers of
   bench slats running along two of the walls like a staircase, with a grey stone stove
   #a0947e and a wooden bucket and ladle in the corner. Open top, interior visible from
   above; no roof slab. This must read as WOOD where item 4 reads as CLAY.

6. CAMP SITE — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body
   about 20 px tall, whole sprite 96x68 px — a marked camping pitch: one pitched A-frame
   tent with a yellow #f2b53f fly sheet, #967027 shadow tone and a cream #e4d3b4 inner
   door triangle, plus a small folding table #c49a6a and a ring of grey stones #a0947e
   for a fire. The one detail that makes the silhouette unmistakable: the sharp triangular
   tent ridge — the only pointed roof on the sheet. Do NOT draw guy ropes; nothing thinner
   than one pixel block is allowed, and detached lines get lost when the sprite is cut out.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L4 — Open-air play & water (6 items, 3x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/bbq_zone` | `facility__bbq_zone.png` | BBQ ZONE |
| 2 | `facility/fishing` | `facility__fishing.png` | FISHING SPOT |
| 3 | `facility/minigolf` | `facility__minigolf.png` | MINIGOLF |
| 4 | `facility/playground` | `facility__playground.png` | PLAYGROUND |
| 5 | `facility/slide_small` | `facility__slide_small.png` | WATER SLIDE (SMALL) |
| 6 | `facility/trampoline_w` | `facility__trampoline_w.png` | WATER TRAMPOLINE |

Attach: `art-reference/crops/building-dock.png` (primary) + `art-reference/crops/dock-huts.png`

**인플레이터블 레퍼런스를 안 붙인다.** 이 시트의 6종 중 5종(BBQ·낚시·미니골프·놀이터·
워터슬라이드)은 목조/강재 리지드 구조물이다. 인플레이터블 크롭을 붙이면 실측대로
레퍼런스가 프롬프트를 이겨 리지드 5종에 튜브 링 베이스가 생긴다. 6번 수상 트램폴린만
말로 인플레이터블을 지정했다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: open-air play plots and two
water attractions.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (nothing on this sheet is
pink or red — flags and slides are deliberately yellow and blue). 3 columns by 2 rows of
evenly spaced cells, each cell about 512 x 512 px. Small dark pixel-font English label
above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

RIGID VS INFLATABLE — read this before drawing.
Items 1 to 5 are RIGID structures of timber, steel and turf. They must NOT have any
inflatable form, air tube, rounded vinyl bolster or ring-shaped base. Only item 6 is
inflatable, and the wording for item 6 says so explicitly.

FLOATING ITEMS — items 5 and 6 sit on the river, and item 2 sits at the water's edge.
Draw them with NO water, no ripples, no reflection, no waterline — as if lifted out of
the water, dry and complete.

Items — exactly 6, one per cell, in this order:

1. BBQ ZONE — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body about
   16 px tall, whole sprite 96x64 px — a grilling area: one long picnic table of #b5844a
   planks with bench boards on both sides running along the lower-right diagonal. The one
   detail that makes the silhouette unmistakable: three chunky charcoal grill drums
   #3a3f4a standing in a short row beside the table, each with a grey #a0947e grate on top
   and glowing #ff8c42 coals visible through the grate. No smoke — the engine adds its own
   effects.

2. FISHING SPOT — footprint 4x2 tiles (4 units long toward the lower right, only 2 deep —
   a long shallow platform) — base diamond 96x48 px, body about 8 px tall, whole sprite
   96x56 px — a waterside fishing ground: a very low plank platform #c49a6a with a plain
   rail post at each of the two front corners, a bait bucket #4fbf72 and a folding stool
   #3a3f4a on the deck. The one detail that makes the silhouette unmistakable: four
   fishing rods in a row, each drawn as a straight diagonal at least 2 pixel blocks thick
   angling out over the lower-right edge from #70522e rod holders. NO water, no ripples,
   no waterline — the rods hang over empty space.

3. MINIGOLF — footprint 4x2 tiles (4 units long toward the lower right, only 2 deep) —
   base diamond 96x48 px, body about 8 px tall, whole sprite 96x56 px — a two-hole putting
   course: strips of green turf #7faa55 with #8fbc63 as the lit tone, edged all around by
   a cream #e4d3b4 kerb one block wide. The one detail that makes the silhouette
   unmistakable: two dark hole cups each with a short yellow #f2b53f pennant flag on a
   pole, plus one small wooden ramp obstacle #b5844a straddling the middle of the course.
   The whole thing is almost flat — only the flags and the ramp rise.

4. PLAYGROUND — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px, body
   about 20 px tall, whole sprite 96x68 px — a children's playground: a small slide with a
   yellow #f2b53f chute and a green #4fbf72 ladder frame, plus a two-seat swing set on an
   A-frame. Both frames are open lattice frames you can see through, and every bar and
   post must be at least 2 pixel blocks thick so nothing disappears. The one detail that
   makes the silhouette unmistakable: the two hanging swing seats #3a3f4a under the
   A-frame crossbar. Slide, swing frame and ground bar must touch so it stays one
   connected silhouette. Rigid steel and plastic — no inflatable forms.

5. WATER SLIDE (SMALL) — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px,
   body about 48 px tall, whole sprite 96x96 px — a short, gentle rigid fibreglass water
   slide standing on a plank deck of #c49a6a that covers the whole footprint. GUEST FLOW
   IS PART OF THE SHAPE: the climbing stair is at the FRONT corner of the footprint — the
   bottom corner of the base diamond, nearest the viewer — and the slide runs up from
   there, then the flume descends away from the viewer and finishes in a wide run-out lane
   at the BACK corner, the top corner of the base diamond. Blue #3d8fd6 flume with #2b9ac4
   shadow tone on an open timber tower, tower posts at least 2 pixel blocks thick, you can
   see through the tower frame. The one detail that makes the silhouette unmistakable: the
   short stair with countable steps at the near corner and the flared splash-out lip at the
   far corner. RIGID fibreglass and timber — not inflatable, no air tubes, no ring base.
   NO water, no ripples, drawn as if lifted out of the water.

6. WATER TRAMPOLINE — footprint 3x3 tiles (a square-ish plot) — base diamond 96x48 px,
   body about 16 px tall, whole sprite 96x64 px — THIS one is inflatable: a circular
   air-filled doughnut ring of glossy blue #3d8fd6 vinyl with #26406f shadow tone and
   chunky dark welded seam lines radiating around it, with a taut cream #e4d3b4 jump mat
   stretched flat inside the ring. The one detail that makes the silhouette unmistakable:
   a short yellow #ffd23f climbing ramp attached to the lower-right side of the ring,
   touching it. Cool outline #1e3348 for this floating item. NO water, no ripples, no
   waterline — drawn as if lifted out of the water, dry and complete.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L5 — Big flat plots & camps (4 items, 2x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/footvolley` | `facility__footvolley.png` | JOKGU COURT |
| 2 | `facility/glamping` | `facility__glamping.png` | GLAMPING |
| 3 | `facility/jump_cushion` | `facility__jump_cushion.png` | JUMP CUSHION |
| 4 | `facility/pool_kids` | `facility__pool_kids.png` | KIDS POOL (INDOOR) |

Attach: `art-reference/crops/building-dock.png` (primary) + `art-reference/crops/iso-shower-hut.png`

**인플레이터블 레퍼런스 없음** — 같은 이유. 점프쿠션만 말로 지정한다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: large 4x3 plots — a court,
a glamping tent, an inflatable jump cushion and a shallow indoor pool.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (no pink or red subject
on this sheet). 2 columns by 2 rows of evenly spaced cells, each cell about 768 x 512 px.
Small dark pixel-font English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

RIGID VS INFLATABLE — items 1, 2 and 4 are rigid: sand, canvas on timber, and tile. They
must have no inflatable form, no air tube and no ring-shaped base. Only item 3 is
inflatable and its wording says so.

Items — exactly 4, one per cell, in this order:

1. JOKGU COURT — footprint 4x3 tiles (4 units wide toward the lower right, 3 deep toward
   the lower left — a wide rectangle, clearly longer than it is deep) — base diamond
   112x56 px, body about 4 px tall, whole sprite 112x60 px — a jokgu court (Korean
   foot-volleyball): a flat rectangular playing surface of packed sand #e8cf9a with
   #dcc088 as the shadow tone, a cream #fdf3e0 painted boundary line one block wide inset
   from the edge and a centre line, and a low kerb board around the outside. This object
   is essentially a flat plate — the ONLY things that stand up are two short posts
   #3a3f4a at the middle of the two long sides carrying a LOW net between them, drawn as
   a band of dark cross-hatch at least 2 pixel blocks thick so it survives. That low net
   across the middle is the one detail that makes the silhouette unmistakable.

2. GLAMPING — footprint 4x3 tiles (4 units wide toward the lower right, 3 deep toward the
   lower left) — base diamond 112x56 px, body about 32 px tall, whole sprite 112x88 px — a
   pre-pitched safari tent standing on a raised wooden platform: a big rounded cream
   #fdf3e0 canvas bell tent with #e4d3b4 shadow tone and vertical seam lines, one central
   ridge pole bump on top, and a rolled-open door flap tied to one side. The platform is
   a plank deck #c49a6a with a #b5844a fascia skirt that clearly extends past the tent on
   the lower-right side to form a small porch with two steps. The one detail that makes
   the silhouette unmistakable: the big soft canvas dome sitting on a hard rectangular
   deck — soft on top, straight-edged underneath.

3. JUMP CUSHION — footprint 4x3 tiles (4 units long toward the lower right, 3 deep) —
   base diamond 112x56 px, body about 20 px tall, whole sprite 112x76 px — THIS one is
   inflatable: a long tapered air-filled water pillow (a "blob"), thick and fat and
   rounded, low at the lower-right end where a jumper lands on it and rising to a high
   rounded hump at the upper-left end. Top surface orange #ff8c42 with #b5844a shadow
   tone, side panels blue #3d8fd6, and chunky dark welded seam ribs crossing the body at
   even intervals. The one detail that makes the silhouette unmistakable: the wedge
   profile — one end flat on the base, the other end swollen and lifted. Cool outline
   #1e3348 for this floating item. NO water, no ripples, no waterline — drawn as if
   lifted out of the water, dry and complete.

4. KIDS POOL (INDOOR) — footprint 4x3 tiles (4 units wide toward the lower right, 3 deep
   toward the lower left) — base diamond 112x56 px, body 0 px tall, whole sprite
   112x56 px — body height ZERO: this object is flush with the ground, a sunken basin seen
   from above, not a box. Draw a cream tile rim #fdf3e0 exactly one block wide running
   right around the outside of the diamond with #e4d3b4 as its shadow tone, and inside the
   rim a still, flat fill of light #7fd0e6 with a single band of #5fc6de along the
   upper-left inner edge to read as depth. Waist-deep at most. The one detail that makes
   the silhouette unmistakable: three broad shallow entry steps cut into the near corner
   of the basin. Open top, interior visible from above. IMPORTANT: the water belongs to
   this object and lives ONLY inside the tile rim — not one pixel of water, ripple,
   reflection, spray or splash anywhere outside the rim.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L6 — Big flat plots & frames (4 items, 2x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/ice_fishing` | `facility__ice_fishing.png` | ICE FISHING GROUND |
| 2 | `facility/parking` | `facility__parking.png` | PARKING LOT |
| 3 | `facility/pool_warm` | `facility__pool_warm.png` | WARM POOL (INDOOR) |
| 4 | `facility/junglegym_w` | `facility__junglegym_w.png` | JUNGLE GYM (FLOATING) |

Attach: `art-reference/crops/building-dock.png` (primary) + `art-reference/crops/dock-huts.png`

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: four large 4x4 plots — a
frozen fishing ground, a car park, a warm indoor pool and a floating climbing frame.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (no pink or red subject
on this sheet; the barrier arm is deliberately orange and cream, not red). 2 columns by
2 rows of evenly spaced cells, each cell about 768 x 512 px. Small dark pixel-font
English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

SURFACES THAT ARE THE OBJECT — items 1, 2 and 3 are surfaces (ice, asphalt, a tiled
basin). That surface IS the object, not a terrain plate: give each one a clearly outlined
edge all the way around its 4x4 diamond so it reads as a placed object with a border, and
draw nothing at all outside that border.

Items — exactly 4, one per cell, in this order:

1. ICE FISHING GROUND — footprint 4x4 tiles (a square-ish plot) — base diamond 128x64 px,
   body about 8 px tall, whole sprite 128x72 px — a frozen-lake smelt fishing ground:
   holes cut in the ice, small tents. A pale ice sheet of #fdf3e0 with #e4d3b4 shadow tone
   and a few straight crack lines, with a raised lip of packed snow around the outer edge.
   The one detail that makes the silhouette unmistakable: four round dark holes cut
   through the ice, filled flat with deep #1a7ba8, each ringed by a block of chipped ice —
   plus two small pitched pup tents at the back edge, one blue #4a90b8 and one yellow
   #f2b53f, and a low stool and a hand auger #3a3f4a beside a hole. The holes are inside
   the ice plate; no water anywhere outside the plate.

2. PARKING LOT — footprint 4x4 tiles (a square-ish plot) — base diamond 128x64 px, body
   about 4 px tall, whole sprite 128x68 px — a paved car park: a dark asphalt surface
   #3a3f4a with #a0947e as its lit tone, bordered by a low cream #e4d3b4 kerb one block
   high. The one detail that makes the silhouette unmistakable: six countable cream
   #fdf3e0 painted parking bays marching in one direction across the asphalt, with a
   chunky wheel stop at the head of each bay. At the lower-right entrance corner stands a
   short barrier arm striped orange #ff8c42 and cream on a squat post, the only thing on
   the object that rises. Draw NO cars and no vehicles — the engine spawns its own.

3. WARM POOL (INDOOR) — footprint 4x4 tiles (a square-ish plot) — base diamond 128x64 px,
   body 0 px tall, whole sprite 128x64 px — body height ZERO: flush with the ground, a
   sunken basin seen from above, not a box. A stone-look rim #a0947e one block wide runs
   right around the outside with #70522e as its shadow tone, and inside it a still flat
   fill of deeper #5fc6de with a band of #2b9ac4 along the upper-left inner edge. The one
   detail that makes the silhouette unmistakable: a broad submerged bench ledge, drawn as
   a lighter #7fd0e6 shelf one tile wide, running the whole length of the upper-left inner
   edge — that ledge is what tells it apart from the small pale kids' pool. Open top,
   interior visible from above. The water lives ONLY inside the rim: no ripples, no steam,
   no reflection, and not one pixel of water outside the rim.

4. JUNGLE GYM (FLOATING) — footprint 4x4 tiles (a square-ish plot) — base diamond
   128x64 px, body about 32 px tall, whole sprite 128x96 px — a climbing frame standing
   on a floating pontoon base. The base is a low pontoon raft of #4a76c8 with #37599e
   shadow tone and #26406f under the lip, topped by a plank deck #c49a6a. Above it stands
   a cube climbing frame of yellow #ffd23f bars — an OPEN LATTICE FRAME, you can see
   straight through it to the magenta background between the bars, and every bar must be
   at least 2 pixel blocks thick so it does not vanish. The one detail that makes the
   silhouette unmistakable: the clean open cube of bars with two horizontal cross levels
   inside it, sitting on a solid blue raft. Frame and raft must touch. Cool outline
   #1e3348. NO water, no ripples, no waterline — drawn as if lifted out of the water,
   dry and complete.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size, and for N x 1
rows say the repeat count in words ("a row of four ...").

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L7 — Tube slide (1 item, own generation)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/slide_tube` | `facility__slide_tube.png` | TUBE SLIDE |

Attach: `art-reference/crops/building-dock.png` (primary) + `art-reference/crops/dock-huts.png`

**단독 생성하는 이유:** 128 폭 5종 중 이것만 본체가 124 px 로 높다. 2x2 그리드(셀
768x512)에 넣으면 세로가 먼저 걸려 폭 배율이 6배에서 2.7배로 떨어진다 — 시트를 쪼개는
비용이 해상도 손실보다 싸다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One single 2D pixel-art asset, drawn in the 2:1 dimetric isometric view described
above, for a Korean riverside water park.

Canvas: 1536 x 1024 landscape, ONE object only, centred, filling the canvas height with a
generous empty margin all around. Flat #FF00FF magenta background (the subject is blue
and yellow, so the magenta key is safe). Small dark pixel-font English label in the top
margin, not touching the object.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
Note the references show TIMBER waterfront structures — this object is rigid timber,
steel and fibreglass. It is NOT inflatable: no air tubes, no rounded vinyl bolsters, no
ring-shaped base.

Item — exactly 1:

1. TUBE SLIDE — footprint 4x4 tiles (a square-ish plot) — base diamond 128x64 px, body
   about 60 px tall, whole sprite 128x124 px — a tall enclosed tube water slide standing
   on a plank deck of #c49a6a with a #b5844a fascia that covers the whole 4x4 footprint
   and is edged by a low rail.
   GUEST FLOW IS PART OF THE SHAPE. The climbing tower stands at the FRONT corner of the
   footprint — the bottom corner of the base diamond, nearest the viewer. Its switchback
   stair has countable steps and a rail, and the tower is an OPEN LATTICE FRAME of timber
   posts and cross-braces you can see straight through, every member at least 2 pixel
   blocks thick. From the top platform the flume descends away from the viewer in one wide
   S-curve and finishes in a wide flared run-out lane at the BACK corner — the top corner
   of the base diamond.
   The flume is a fat closed tube, blue #3d8fd6 on top with #2b9ac4 as the shadow tone and
   evenly spaced darker joint bands along its length, supported by two slim timber props
   under its mid-span (props also at least 2 pixel blocks thick, touching both flume and
   deck).
   The one detail that makes the silhouette unmistakable: a stack of three yellow #ffd23f
   ring tubes leaning against the tower at deck level, next to the foot of the stair — this
   is the tube slide, and the tubes say so.
   Cool outline #1e3348 for this floating structure. NO water, no ripples, no splash, no
   reflection, no waterline anywhere — drawn as if lifted out of the water, dry and
   complete.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size.

The object faces this way: its front-right face toward the lower right, its front-left
face toward the lower left, top surface visible.
```

---

## Sheet L8 — Lodging & lazy river (2 items, 2x1)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/pension` | `facility__pension.png` | PENSION (THREE STOREYS) |
| 2 | `facility/pool_lazy` | `facility__pool_lazy.png` | LAZY RIVER (INDOOR) |

Attach: `art-reference/crops/iso-shower-hut.png` (primary) +
`art-reference/crops/shore-trees-houses.png`

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: two big indoor-scale
objects — a three-storey guesthouse and an indoor lazy river.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (no pink or red subject).
2 columns by 1 row — two tall cells, each about 768 x 1024 px. Small dark pixel-font
English label above each cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.

Items — exactly 2, one per cell, in this order:

1. PENSION (THREE STOREYS) — footprint 5x4 tiles (5 units wide toward the lower right,
   4 deep toward the lower left — a broad rectangle, slightly wider than deep) — base
   diamond 144x72 px, body about 64 px tall, whole sprite 144x136 px — a Korean riverside
   guesthouse: boxy, balconies, exterior stairs. Three clearly stacked floors of equal
   height, cream #fdf3e0 walls with #e4d3b4 shadow tone, a shallow hipped roof in dark
   blue #2e5972 with a #26406f shadow tone and a plain parapet band under it. Each floor
   carries a continuous balcony with a slatted #b5844a rail running the full width of the
   lower-right face, and a countable grid of square windows — five per floor on the wide
   face, four on the deep face, all the same size and evenly spaced. The one detail that
   makes the silhouette unmistakable: an external zigzag staircase of #70522e timber
   climbing the whole height at the right-hand corner, its landings breaking the box
   outline at every floor — that stair must touch the wall the whole way up. Rigid
   building, no soft or inflatable forms anywhere.

2. LAZY RIVER (INDOOR) — footprint 6x3 tiles (6 units long toward the lower right, only
   3 deep toward the lower left — a LONG hall shape, twice as long as it is deep) — base
   diamond 144x72 px, body 0 px tall, whole sprite 144x72 px — body height ZERO: flush
   with the ground, a sunken channel seen from above, not a box. Draw a closed loop: a
   cream tile rim #fdf3e0 one block wide around the outside of the long diamond, a
   continuous channel of still flat #7fd0e6 water inside it with a band of #5fc6de along
   the upper-left inner edge, and a SOLID tiled island filling the middle of the loop —
   the island is the same cream tile as the rim, with a few #a0947e stone blocks and a
   small potted shrub #7faa55 on it. The one detail that makes the silhouette
   unmistakable: the closed oval circuit — you can trace the channel all the way around
   the island and back. Two broad entry steps cut into the rim at the near corner. Open
   top, interior visible from above. Do NOT draw current arrows, ripples, foam or
   reflections, and not one pixel of water outside the tile rim.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size. Item 2 is 6x3 —
it must come out clearly long and shallow, not square.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L9 — Big slides (2 items, 2x1)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/slide_large` | `facility__slide_large.png` | WATER SLIDE (LARGE) |
| 2 | `facility/snow_sled` | `facility__snow_sled.png` | SNOW SLED HILL |

Attach: `art-reference/crops/building-dock.png` (primary) + `art-reference/crops/dock-huts.png`

**두 항목을 한 시트에 묶은 이유:** 둘 다 발자국 4x5 이고 게임 규칙상 **입구=앞 꼭지점 계단,
출구=뒤 꼭지점 런아웃** 이 실루엣에 보여야 하는 유일한 두 대형 시설이다. 같은 규칙을 한
프롬프트에 한 번만 쓰면 어긋날 여지가 준다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: the park's two biggest
slides — a summer water slide tower and a winter sledding hill.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (flumes are deliberately
orange and yellow rather than red, so the magenta key stays clean). 2 columns by 1 row —
two tall cells, each about 768 x 1024 px. Small dark pixel-font English label above each
cell.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
Both objects are RIGID timber, steel and fibreglass. Neither is inflatable: no air tubes,
no rounded vinyl bolsters, no ring-shaped base anywhere.

GUEST FLOW — the same rule governs both items and it must be visible in the silhouette:
the climbing stair is at the FRONT corner of the footprint (the bottom corner of the base
diamond, nearest the viewer), and the ride descends AWAY from the viewer, finishing in a
wide run-out lane at the BACK corner (the top corner of the base diamond). Never put the
stair at the far corner.

FRAMES — every tower, truss and support here is an OPEN LATTICE FRAME you can see
straight through, and every member must be at least 2 pixel blocks thick so it does not
disappear at logical size.

Items — exactly 2, one per cell, in this order:

1. WATER SLIDE (LARGE) — footprint 4x5 tiles (4 units wide toward the lower right, 5 deep
   toward the lower left — deeper than it is wide, so the long axis runs toward the lower
   LEFT) — base diamond 144x72 px, body about 72 px tall, whole sprite 144x144 px — the
   tallest structure in the whole park, meant to be seen from far away. A plank deck of
   #c49a6a with a #b5844a fascia covers the whole footprint. At the front corner stands a
   tall open timber tower with a switchback stair of countable steps and a rail, topped by
   a small square start platform with a low #f2b53f canopy that touches the tower. From
   that platform TWO parallel rigid fibreglass flumes sweep down and away toward the back
   corner — one orange #ff8c42 with #967027 shadow tone, one yellow #f2b53f with #b5844a
   shadow tone — held up by slim lattice props at mid-span. The one detail that makes the
   silhouette unmistakable: two flumes running side by side, ending in two flared
   run-out lips at the back corner. Cool outline #1e3348. NO water, no splash, no ripples,
   no waterline — drawn as if lifted out of the water, dry and complete.

2. SNOW SLED HILL — footprint 4x5 tiles (4 units wide toward the lower right, 5 deep
   toward the lower left — long axis toward the lower LEFT) — base diamond 144x72 px, body
   about 32 px tall, whole sprite 144x104 px — a winter snow sledding hill with a wooden
   ramp and a lift track. A packed snow slope of cream #fdf3e0 with #e4d3b4 in shadow
   rises from the back corner to a timber start ramp #b5844a with #70522e shadow tone at
   the front corner, where a short stair with countable steps and a rail climbs to the
   launch platform. The slope runs down and away and ends at the back corner in a flat
   run-out with a barrier of stacked straw bales #dcc088. The one detail that makes the
   silhouette unmistakable: a narrow grey #a0947e conveyor lift track running parallel to
   the slope all the way from the run-out back up to the ramp, with countable cleat bars
   across it — no other object in the park has a lift track. Two stacked sleds #3d8fd6
   lean against the ramp at the top. Snow only on the slope itself; no snow, ground plate
   or shadow outside the object.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size. Both items are
4x5 — deeper than wide.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L10 — Air bounce & duplex pension (2 items, 2x1)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/airbounce` | `facility__airbounce.png` | AIR BOUNCE PARK |
| 2 | `facility/pension_duplex` | `facility__pension_duplex.png` | DUPLEX PENSION |

Attach: `art-reference/crops/iso-inflatable-a.png` (governs item 1 ONLY) +
`art-reference/crops/iso-shower-hut.png` (governs item 2)

⚠ **이 시트만 인플레이터블 레퍼런스를 쓴다.** 실측된 실패 모드(레퍼런스가 프롬프트를 이겨
목조물에 튜브 링 베이스가 생김)를 막으려고 항목 2 에 "이 레퍼런스를 따르지 말 것" 을
명시했다. **그래도 복층 펜션 밑에 튜브 베이스가 나오면 두 항목을 각각 단독 생성할 것** —
176 폭이라 한 장씩 써도 해상도 손해가 없다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labeled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Sheet theme: the two largest 6x5 objects
— a floating inflatable obstacle course and a duplex guesthouse.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background — the inflatable modules
deliberately avoid the red #ef4b4b and use yellow, blue, green and orange instead, so the
magenta key stays clean. 2 columns by 1 row — two tall cells, each about 768 x 1024 px.
Small dark pixel-font English label above each cell.

Reference: two references are attached and they govern DIFFERENT items. The inflatable
reference governs item 1 only. The hut reference governs item 2 only. Item 2 is a rigid
building: do not carry any inflatable form, air tube, rounded vinyl bolster or ring-shaped
base over to it from the inflatable reference. Match pixel density, palette and outline
weight from both.

Items — exactly 2, one per cell, in this order:

1. AIR BOUNCE PARK — footprint 6x5 tiles (6 units long toward the lower right, 5 deep
   toward the lower left — a big broad rectangle, longer than deep) — base diamond
   176x88 px, body about 24 px tall, whole sprite 176x112 px — a large inflatable water
   obstacle course: a chain of four linked play modules sitting on ONE continuous inflated
   base mat, so the whole thing is a single connected shape. From the lower-right end to
   the upper-left end: a low climbing wall in yellow #ffd23f, a fat balance-beam log in
   green #4fbf72, a short slide module in blue #3d8fd6, and a rounded arch in orange
   #ff8c42. Every form is fat, rounded and glossy vinyl with chunky dark welded seam lines
   and a visible air-valve nub, and the base mat carries a raised bolster edge all the way
   round. The one detail that makes the silhouette unmistakable: four clearly different
   module shapes in a countable row on one shared mat. Cool outline #1e3348. NO water, no
   ripples, no splash, no waterline — drawn as if lifted out of the water, dry and
   complete.

2. DUPLEX PENSION — footprint 6x5 tiles (6 units wide toward the lower right, 5 deep
   toward the lower left) — base diamond 176x88 px, body about 64 px tall, whole sprite
   176x152 px — a Korean riverside guesthouse: boxy, balconies, exterior stairs, taken by
   a whole group at once. Two full storeys plus a loft under the roof, cream #fdf3e0 walls
   with #e4d3b4 shadow tone, a dark green #3d6657 roof with #26406f shadow tone and one
   gable dormer window poking out of the roof slope for the loft. The ground floor has
   three countable unit doors along the lower-right face, each with its own window; the
   first floor has a continuous walkway balcony with a slatted #b5844a rail running the
   full width above them. The one detail that makes the silhouette unmistakable: a straight
   external staircase of #70522e timber running up the lower-left end of the building to
   that first-floor walkway, plus the dormer breaking the roof line. RIGID building —
   straight walls, hard corners, no soft or inflatable forms, no air tubes, no ring base.
   Ignore the inflatable reference completely for this item.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Always write the tile footprint AND the base diamond pixel size. Both items are
6x5 — clearly longer than deep.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, roof or top surface visible.
```

---

## Sheet L11 — Turtle island (1 item, own generation)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `facility/turtle_island` | `facility__turtle_island.png` | TURTLE ISLAND |

Attach: `art-reference/crops/building-dock.png` (primary, for the pontoon and ladder
timber) + `art-reference/crops/iso-inflatable-b.png` (for the rounded floating volume)

**단독 생성:** 224 폭. 표에서 유일하게 캔버스 한 장을 통째로 쓰는 항목이다.

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One single 2D pixel-art asset, drawn in the 2:1 dimetric isometric view described
above, for a Korean riverside water park. This is the largest object in the whole game.

Canvas: 1536 x 1024 landscape, ONE object only, centred, filling most of the canvas width
with a generous empty margin all around. Flat #FF00FF magenta background (the subject is
green, brown and blue — the magenta key is safe). Small dark pixel-font English label in
the top margin, not touching the object.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here. The
dock reference governs the timber ladder and deck boards; the floating reference governs
the rounded buoyant volume. This object is a rigid moulded float, not an air-filled toy:
no welded vinyl seams, no air valve.

Item — exactly 1:

1. TURTLE ISLAND — footprint 8x6 tiles (8 units long toward the lower right, 6 deep toward
   the lower left — a very large rectangle, clearly longer along the lower-right axis than
   along the lower-left one) — base diamond 224x112 px, body about 28 px tall, whole
   sprite 224x140 px — a floating rest island shaped like a giant turtle that swimmers
   climb up onto and sit on.
   The base is a broad low pontoon collar hugging the whole footprint, blue #4a76c8 on top
   with #37599e as its shadow tone and a darker #26406f band along the bottom lip — this
   is the buoyant rim, and it stays a flat wide platform, not a rounded tube.
   On top of it sits a domed turtle shell filling most of the footprint: green #62a58c with
   #3d6657 as the shadow tone, its curved surface divided into big chunky hexagonal scute
   plates — no more than about ten plates in total, each large enough to read clearly, with
   a one-block darker groove between them.
   A stylised turtle head of the same green pokes out at the lower-right end, blunt and
   rounded with two single-pixel-block dark eyes; four stubby flippers push out from the
   pontoon collar at the four sides, and a short tail at the upper-left end.
   The one detail that makes the silhouette unmistakable: a flat sunbathing deck of pale
   #dcb079 planks let into the very top of the shell like an open hatch, ringed by a low
   rope rail, with a short timber ladder of #c49a6a running down the lower-right flank from
   that deck to the pontoon collar — the ladder must touch both. That deck is where the
   engine draws its visitors sitting, so leave it open and clearly visible from above.
   Cool outline #1e3348 for this floating object. NO water, no ripples, no wake, no
   reflection, no waterline anywhere — drawn as if lifted clean out of the river, dry and
   complete.

⚠ The generator will flatten every footprint into a square unless the numbers are in the
prompt. Write the tile footprint AND the base diamond pixel size: 8x6 tiles, base diamond
224x112 px — it must come out long toward the lower right, not square and not round.

The object faces this way: its front-right face toward the lower right, its front-left
face toward the lower left, top surface visible.
```

---

# C. 세계 — 지면·다리·벽·배경·데코·UI

# prompts-world.md — 시설이 아닌 것 전부 (지면 · 다리 · 벽 · 배경 · 데코 · UI 아이콘)

모든 수치는 `src/assets/kairo-render-contract.json` 과 `src/assets/kairo-procedural.ts`
**실측**이다. 스타일 계약은 `prompt-core.md` 의 SHARED STYLE BLOCK 을 그대로 쓴다.

| # | 시트 | 항목 | 배치 | 논리 크기 |
|---|---|---|---|---|
| W1 | ground/path_stone | 3 변형 + 타일링 증명 | 3셀 + 8×8 패치 | 32×16 |
| W2 | ground/path_deck | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W3 | ground/path_sand | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W4 | ground/lawn | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W5 | ground/water_edge | 3 + **가로 증명만** | 3셀 + 1×8 줄 | 32×16 |
| W6 | ground/floor_indoor | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W7 | ground/road | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W8 | ground/sidewalk | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W9 | ground/verge | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W10 | ground/mountain_rock | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W11 | ground/pool_water | 3 + 증명 | 3셀 + 패치 | 32×16 |
| W12 | ground/bridge_x · bridge_z | 2 + 런 증명 | 2셀 + 2런 | 32×28 |
| W13 | wall/edge ×4 · wall/door ×4 | 8 | 4×2 | 32×26 |
| W14 | backdrop/mountain · ridge | 2 | 1×2 (2×) | 512×200 |
| W15 | backdrop/farbank | 1 | 1×1 (3×) | 512×200 |
| W16 | deco ×8 | 8 | 4×2 | 32×(24~36) |
| W17 | ui/icon ×15 | 15 | 5×3 | 24×24 |

합계 **69 항목 / 17 시트**. 우선순위: W13 벽 → W1·W4·W8 (화면 면적 최대) → 나머지 지면
→ W16 데코 → W17 아이콘 → W12 다리 → **W14·W15 배경은 맨 마지막** (§배경 메모 참조).

---

## 지면 시트를 종류별로 나눈 근거

`prompt-core.md` 의 크기 산식은 **한 셀에 물체 하나**를 전제한 표다. 지면 타일은 물체가
아니라 **텍스처**라서 실패 모드가 다르고, 그래서 표를 그대로 쓰면 안 된다.

1. **3변형은 나란히 있어야만 판정된다.** 합격 조건이 "서로 다르되 평균 톤이 같다"인데,
   이건 세 장을 따로 뽑으면 원리적으로 맞출 수 없다 (생성기는 이전 장의 평균 밝기를
   모른다). 한 캔버스에 셋을 넣으면 생성기가 스스로 맞추고, 사람도 한눈에 본다.
2. **종류마다 이음새 규칙이 반대다.** 포장류 6종은 타일 이음선을 **그려야** 하고
   (`PAVED` 집합), 자연 재질 5종은 **절대 그리면 안 된다**. 한 캔버스에 섞으면 생성기가
   둘을 평균 내어 양쪽 다 틀린다. 실측 근거가 코드 주석에 있다 — 가로수는 유기적으로
   그렸을 때 이음새 대비가 2.9배로 튀어 PAVED 로 옮겼고, 암반은 PAVED 로 뒀을 때
   테두리가 2.66배로 튀어 유기적으로 되돌렸다.
3. **`water_edge` 는 방향성 타일이라 증명 도형 자체가 다르다** (8×8 패치가 아니라 1×8 줄).
4. 타일 하나는 논리 32×16 이라 한 종류 3장 + 8×8 증명을 넣어도 1536×1024 안에서
   **한 변형당 448px = 14배**가 나온다. 6배 하한을 두 배 이상 넘는다.

**타일링 증명 블록은 진단용이다** — 추출 파이프라인은 위쪽 3셀만 잘라 쓴다. 증명 블록에
격자무늬가 보이면 그 장은 버리고 다시 뽑는다 (변형 간 평균 톤이 어긋났다는 뜻).

---
## Sheet W1 — ground/path_stone · 석재 보도 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/path_stone:a0` | `ground__path_stone__a0.png` | VAR A |
| 2 | `ground/path_stone:a1` | `ground__path_stone__a1.png` | VAR B |
| 3 | `ground/path_stone:a2` | `ground__path_stone__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Stone paving (path_stone) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #c4c1b7
  light #d8d4c9
  dark  #b0aea5

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Stone paving (path_stone):
Cut stone paving — the main walkway of the park, and the single most-laid tile in the
game. A pale warm grey slab of dressed granite: mostly one flat tone with a sparse,
irregular mineral fleck. Slightly warm, never blue. Clean and swept, not cracked, not
mossy, not cobbled — this is a modern resort walkway, not a medieval street. Keep the
fleck sparse: this tile covers more screen area than anything else in the game, so a busy
speckle here makes the whole screen buzz.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/ref-1.png + art-reference/crops/shore-trees-houses.png
```

---

## Sheet W2 — ground/path_deck · 목재 데크길 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/path_deck:a0` | `ground__path_deck__a0.png` | VAR A |
| 2 | `ground/path_deck:a1` | `ground__path_deck__a1.png` | VAR B |
| 3 | `ground/path_deck:a2` | `ground__path_deck__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Wood deck path (path_deck) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #ab8557
  light #bc9260
  dark  #9a784e

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Wood deck path (path_deck):
Wooden decking — sun-bleached boardwalk planks over the riverside walkways. Long
straight planks with a visible woodgrain streak along them, small dark gaps between
boards.

  ⚠ Plank direction is part of the contract. In ALL THREE variants the planks run along
  the same screen diagonal: from the tile's LEFT corner down toward its BOTTOM corner and
  on toward the lower right — the same direction as the W axis in the contract above.
  Every plank in every variant runs parallel to that. If one variant runs its planks the
  other way, a laid boardwalk turns into a herringbone and the run is destroyed. The three
  variants differ only in where the board gaps and the grain streaks fall, never in
  direction.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/building-dock.png + art-reference/crops/dock-huts.png
```

---

## Sheet W3 — ground/path_sand · 모래길 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/path_sand:a0` | `ground__path_sand__a0.png` | VAR A |
| 2 | `ground/path_sand:a1` | `ground__path_sand__a1.png` | VAR B |
| 3 | `ground/path_sand:a2` | `ground__path_sand__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Sand path (path_sand) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #d9c493
  light #efd8a2
  dark  #c3b084

ORGANIC TYPE — no joint line at all, on any edge. This is a natural material and its
grain is what hides the seam; a drawn edge line here reads as a fence. Do not outline,
do not edge-darken, do not frame.

WHAT THIS TYPE IS — Sand path (path_sand):
Compacted sand path — the cheap walkway, warm pale beach sand trodden flat. Fine even
grain with a few slightly darker damp patches and a very occasional lighter dry drift.
No footprints, no tyre tracks, no pebbles big enough to read as objects, no beach litter.
The drift patches must be soft-edged blobs of the dark tone, not shapes.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/foliage-hills.png + art-reference/ref-2.png
```

---

## Sheet W4 — ground/lawn · 잔디 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/lawn:a0` | `ground__lawn__a0.png` | VAR A |
| 2 | `ground/lawn:a1` | `ground__lawn__a1.png` | VAR B |
| 3 | `ground/lawn:a2` | `ground__lawn__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Lawn (lawn) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #79a94f
  light #85ba57
  dark  #6d9847

ORGANIC TYPE — no joint line at all, on any edge. This is a natural material and its
grain is what hides the seam; a drawn edge line here reads as a fence. Do not outline,
do not edge-darken, do not frame.

WHAT THIS TYPE IS — Lawn (lawn):
Mown lawn — the park's default surface, so it must be the calmest tile on this whole
list. Short, dense, freshly cut turf: an even mid green with a gentle irregular mottling
of the lighter and darker tones, as if the mower left soft patches.

  ⚠ Do NOT draw individual grass blades, tufts, clumps, flowers, clover, daisies or mowing
  stripes. Blades read as noise at this size and mowing stripes are directional, which
  destroys the tiling. Soft mottling only.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/foliage-hills.png + art-reference/crops/shore-trees-houses.png
```

---

## Sheet W5 — ground/water_edge · 물가 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/water_edge:a0` | `ground__water_edge__a0.png` | VAR A |
| 2 | `ground/water_edge:a1` | `ground__water_edge__a1.png` | VAR B |
| 3 | `ground/water_edge:a2` | `ground__water_edge__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Waterside (water_edge) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else. This sheet's proof block is a ROW, not a field,
because the tile is directional:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF ROW, the lower 55%: a single horizontal run of 8 tiles, each 176 px wide and 88 px
  tall, placed corner to corner in a straight horizontal line (each tile's right corner
  touching the next tile's left corner, all at the same height), variants mixed in an
  irregular order. One label, "SHORELINE RUN x8", above the row. The foam line must cross
  every join at exactly the same height so the eight tiles read as ONE unbroken shore.
  Do NOT stack a second row above or below it — this tile never tiles vertically.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #57a4c2
  light #60b4d5
  dark  #4e94af

ORGANIC TYPE — no joint line at all, on any edge. This is a natural material and its
grain is what hides the seam; a drawn edge line here reads as a fence. Do not outline,
do not edge-darken, do not frame.

WHAT THIS TYPE IS — Waterside (water_edge):
Riverside shoreline — the strip where the river meets the shore. River water: a muted
natural blue-green, calmer and greyer than a swimming pool, with a soft foam line where
it laps the shore.

  ⚠ THIS TILE IS DIRECTIONAL, AND THAT CHANGES THE PROOF BLOCK (see the layout section).
  The tile is built top-to-bottom: the pale foam line sits high on the tile, near its TOP
  corner, and the open water fills everything below it. The foam line enters at the tile's
  LEFT corner and leaves at its RIGHT corner at exactly the same height, so that a row of
  these forms one continuous unbroken shoreline running left to right across the screen.

  The tile therefore tiles HORIZONTALLY ONLY. It is never stacked vertically. Do not
  centre the foam line, do not draw a second foam line lower down, do not curve the foam
  line up or down — a curve breaks the join with the tile beside it, and a second line
  makes the shore read as doubled. Below the foam, quiet water: gentle darker bands
  running left-to-right, no sparkle, no highlight star, no reflection, no ripple ring,
  no boat wake. The engine animates the water; this tile is the still base.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/boats-water.png + art-reference/ref-2.png
```

> 운영 메모 — W5 는 유일한 방향성 타일이라 증명 도형이 다르다 (8×8 패치가 아니라
> 가로 1×8 줄). 패치로 뽑으면 거품선이 세로로도 반복되어 이중선이 된다.

---

## Sheet W6 — ground/floor_indoor · 실내 바닥 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/floor_indoor:a0` | `ground__floor_indoor__a0.png` | VAR A |
| 2 | `ground/floor_indoor:a1` | `ground__floor_indoor__a1.png` | VAR B |
| 3 | `ground/floor_indoor:a2` | `ground__floor_indoor__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Indoor floor (floor_indoor) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #dbe3e8
  light #f1faff
  dark  #c5ccd1

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Indoor floor (floor_indoor):
Indoor wet-room floor — the tiled floor of the changing rooms, showers and toilets. A
very pale cool blue-grey ceramic tile, clean and slightly glossy-looking, with a fine
regular grid of small square tiles inside the diamond: about four small ceramic squares
across the tile face, joints a touch darker.

  ⚠ This is the only type whose internal grid is regular. Keep the small ceramic grid
  aligned to the same 2:1 diagonals as the tile itself, so that the small squares of one
  tile line up with the small squares of the next. A rotated or offset inner grid makes
  the floor look shattered when laid.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/iso-shower-hut.png + art-reference/ref-1.png
```

---

## Sheet W7 — ground/road · 차도 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/road:a0` | `ground__road__a0.png` | VAR A |
| 2 | `ground/road:a1` | `ground__road__a1.png` | VAR B |
| 3 | `ground/road:a2` | `ground__road__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Road (road) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #5f6570
  light #696f7b
  dark  #565b65

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Road (road):
City asphalt — the road OUTSIDE the park, where the bus arrives. Cool dark grey asphalt
with a fine even aggregate grain.

  ⚠ Deliberately desaturated. This belongs to the city strip beyond the player's land, and
  the eye has to be able to tell instantly where the player's property ends. Keep it grey
  and dull. Do NOT warm it, do not add a colour cast, do not make it interesting.

  ⚠ No painted lane markings, no centre line, no crosswalk, no manhole, no drain, no patch
  repair. Every one of those is directional or centred, and both break the tiling — a
  dashed centre line laid over a field becomes a broken ladder.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/ref-1.png + art-reference/crops/shore-trees-houses.png
```

---

## Sheet W8 — ground/sidewalk · 보도 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/sidewalk:a0` | `ground__sidewalk__a0.png` | VAR A |
| 2 | `ground/sidewalk:a1` | `ground__sidewalk__a1.png` | VAR B |
| 3 | `ground/sidewalk:a2` | `ground__sidewalk__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Sidewalk (sidewalk) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #b9bcc0
  light #cccfd3
  dark  #a7a9ad

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Sidewalk (sidewalk):
City pavement — the footway beside the road, where guests get off the bus and walk to
the park gate. Light cool grey concrete slabs, clean, with a subtle joint grid.

  ⚠ It must read as clearly LIGHTER than the road tile and clearly COOLER (bluer, greyer)
  than the park's stone paving, so that the three paved surfaces stay separable at a
  glance. Desaturated for the same reason as the road: this is outside the player's land.
  No kerb, no tactile paving strip, no drain grate — the kerb is a different edge and would
  tile as a stripe through the middle of the pavement.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/ref-1.png + art-reference/crops/shore-trees-houses.png
```

---

## Sheet W9 — ground/verge · 가로수 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/verge:a0` | `ground__verge__a0.png` | VAR A |
| 2 | `ground/verge:a1` | `ground__verge__a1.png` | VAR B |
| 3 | `ground/verge:a2` | `ground__verge__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Street planting (verge) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #4f7742
  light #578349
  dark  #476b3b

PAVED TYPE — this type shows its tile joint, because the reference's paving does and
because the grid is what makes the 2:1 angle readable. Draw a single 1-texel line in the
dark tone along the tile's two LOWER edges only — the lower-left and the lower-right.
Do NOT draw it on the two upper edges: the neighbour above already draws those, and
drawing both makes a double-thick 2-texel grid line.

WHAT THIS TYPE IS — Street planting (verge):
Municipal street planting bed — the strip of low shrubs between the road and the
pavement. Dark, dense, dull green planting: much deeper and greyer than the park lawn,
because this is outside the player's land and must not compete with it.

  ⚠ This type carries the joint line even though it is greenery, and that is deliberate,
  not an oversight. A city planting strip is a bed divided into concrete cells, so the
  grid is correct here. It is also measured: drawn organically, this tile's seam contrast
  spiked to 2.9x the threshold. Keep the joint line.

  Inside each cell, low clipped shrub mass — soft irregular dark and light patches, no
  individual leaves, no flowers, no tree trunk, no mulch texture.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/foliage-hills.png + art-reference/crops/shore-trees-houses.png
```

---

## Sheet W10 — ground/mountain_rock · 암반 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/mountain_rock:a0` | `ground__mountain_rock__a0.png` | VAR A |
| 2 | `ground/mountain_rock:a1` | `ground__mountain_rock__a1.png` | VAR B |
| 3 | `ground/mountain_rock:a2` | `ground__mountain_rock__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Bedrock (mountain_rock) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #8d8474
  light #9b9180
  dark  #7f7768

ORGANIC TYPE — no joint line at all, on any edge. This is a natural material and its
grain is what hides the seam; a drawn edge line here reads as a fence. Do not outline,
do not edge-darken, do not frame.

WHAT THIS TYPE IS — Bedrock (mountain_rock):
Mountain bedrock — the rim and summit of the hills that ring the map. Exposed WARM grey
stone with a natural broken grain: irregular fractured facets, a few darker crevices, a
few lighter weathered faces.

  ⚠ It must read WARM against the road's cool grey asphalt. If bedrock and asphalt look
  alike, the mountain reads as paving outside the park, which is exactly the wrong story.

  ⚠ This one is NOT paved, and that is measured too. Drawn with a joint line the interior
  went too uniform and the border contrast spiked to 2.66x; drawn with natural grain it
  produced zero seam violations. Natural material needs grain for the seam to hide in —
  the same rule as the street planting, applied in the opposite direction.

  No boulders sitting on the surface, no scree pile, no grass tuft, no snow.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/foliage-hills.png + art-reference/ref-2.png
```

---

## Sheet W11 — ground/pool_water · 수영장 물 (3 items, 3 cells + proof block)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/pool_water:a0` | `ground__pool_water__a0.png` | VAR A |
| 2 | `ground/pool_water:a1` | `ground__pool_water__a1.png` | VAR B |
| 3 | `ground/pool_water:a2` | `ground__pool_water__a2.png` | VAR C |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — terrain sheet. These four entries replace the matching entries in
the contract above. Everything else in the contract stands unchanged.

- OUTLINE — REPLACED. A ground tile carries NO outline of any kind. A dark line around a
  tile becomes a black grid the instant tiles are laid edge to edge, and thousands of
  these get laid. Some types below carry a joint line instead; that line is stated per
  type and it is never a full ring.
- PALETTE — EXTENDED. Ground uses the measured in-engine terrain ramp given per type
  below, which adds neutral greys the 39-colour object palette does not carry (the object
  palette was built for objects, and a grey road is not an object). Use ONLY the three
  hex values printed for this sheet. Do not substitute the nearest palette colour, do not
  add a fourth tone, do not tint.
- NO GROUND / NO WATER — REPLACED. This sheet IS the ground layer, so the ground itself
  is the subject. Still: no props, no plants, no pebble that reads as an object, no
  shadows, no ripples, no reflections, nothing standing on the tile, and nothing crossing
  the tile border.
- ISOLATION AND LABELS — PARTLY REPLACED. The top band is isolated labelled cells as
  usual. The proof block at the bottom is the opposite: those tiles MUST touch, with zero
  gap, zero margin and no line drawn between them.

Goal: One labelled 2D pixel-art TERRAIN TILE sheet for a Korean riverside water park,
drawn in the 2:1 dimetric isometric view described above. This sheet defines ONE ground
type — Pool water (pool_water) — in its three random variants, plus a tiling proof.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).

Layout — exactly this, nothing else:

  TOP BAND, the upper 40% of the canvas: three cells side by side, labelled "VAR A",
  "VAR B" and "VAR C" in a small dark pixel font above each cell. Each cell holds ONE
  isolated diamond tile drawn 448 px wide and 224 px tall — an exact 2:1 diamond, flat
  on the screen, generous magenta margin all round.

  PROOF BLOCK, the lower 55%: the same three variants laid into ONE continuous isometric
  field, 8 tiles by 8 tiles, each tile 96 px wide and 48 px tall, butted edge to edge with
  no gaps and no lines between them, the three variants mixed in an irregular order (not
  a repeating ABC stripe). One label, "TILED 8x8", above the block. This block is a
  diagnostic: if a grid, a checkerboard or any repeating pattern is visible in it, the
  sheet is wrong.

THE TILE ITSELF.
One ground tile is 32 x 16 logical pixels: a flat diamond with corners at top (16,0),
right (32,8), bottom (16,16) and left (0,8). It is a flat piece of ground seen from above
at the 2:1 angle. It is NOT a cube, NOT a slab with visible side faces, NOT a raised
block, and it has no thickness. Nothing sticks up out of it.

SEAMLESS — the hardest requirement on this sheet, and the one that fails most often.
These tiles get laid next to each other by the thousand, so:

  - The texture runs straight off every edge and continues into the neighbour. The tile's
    upper-left edge continues into the neighbour's lower-right edge, and its upper-right
    edge into the neighbour's lower-left edge. Nothing may stop, fade, darken or lighten
    at an edge.
  - NO vignette. No corner-to-corner gradient. No lighting falloff inside the tile. The
    face is lit dead flat and evenly, because any gradient becomes a visible waffle
    pattern the moment the tile repeats.
  - Nothing is centred and nothing is symmetric about the tile's centre. A centred feature
    repeats into a polka-dot grid.
  - The three variants must share exactly the SAME average colour and the SAME average
    brightness. Only the arrangement of the speckle differs between them. A variant that
    is even slightly darker than the other two turns a mixed field into a visible
    checkerboard — that is an automatic rejection.
  - And yet each variant must still be individually distinguishable when the three are
    compared side by side in the top band. Different arrangement, identical average.

TEXTURE DENSITY — quiet and chunky. This is measured, not a preference.
The brightness standard deviation of clean ground in this project's style reference is
only 9 to 11 out of 255. The ground is almost flat. All the visual information in this
game comes from the objects standing on the ground, never from the ground itself. An
earlier attempt pushed ground noise up to a deviation of 16.6 and the grass turned into
gravel. So:

  - Three tones only — the base and the two given below. No fourth tone.
  - Chunky speckle: blobs of roughly 4 x 2 logical texels, with a finer 2 x 1 texel grain
    inside them. The blobs are wider than they are tall, because ground stretches
    horizontally in this projection.
  - Nothing finer than one logical texel. One logical texel is 14 px in the top band and
    3 px in the proof block, so no hairlines and no single-pixel confetti.
  - Roughly 60% base, 20% light, 20% dark, scattered irregularly.
  - No photographic texture, no noise filter, no dither ramp, no gradient, no
    anti-aliased edge.

EXACT TONES for this sheet — these three and nothing else:
  base  #5fc6d4
  light #69dae9
  dark  #56b2bf

ORGANIC TYPE — no joint line at all, on any edge. This is a natural material and its
grain is what hides the seam; a drawn edge line here reads as a fence. Do not outline,
do not edge-darken, do not frame.

WHAT THIS TYPE IS — Pool water (pool_water):
Outdoor swimming pool water — chlorinated, bright, artificial cyan. Calm turquoise with
a very gentle caustic shimmer: soft irregular lighter patches, nothing sharp.

  ⚠ It must be clearly BRIGHTER and more artificial than the river tile. A treated pool and
  a natural river must never read as the same water, or "I dug a pool" is not legible on
  the map.

  No lane markings, no pool coping, no tiled edge, no ladder, no drain, no float, no
  sparkle star, no reflection of anything. The coping edge is drawn by the engine
  separately; this tile is only the open water in the middle.

Reference: match the pixel density, palette discipline and texture calm of the attached
reference image(s). The references are the style authority — follow them over any wording
here. Note that the references show ground WITH objects on it; you are drawing only the
ground, so ignore every object in them and copy only the surface.
Attach: art-reference/crops/boats-water.png + art-reference/crops/waterpark-inflatables.png
```

---

## Sheet W12 — ground/bridge_x · bridge_z · 다리 (2 items, 2 cells + run proofs)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ground/bridge_x` | `ground__bridge_x.png` | BRIDGE X |
| 2 | `ground/bridge_z` | `ground__bridge_z.png` | BRIDGE Z |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — bridge sheet. Two entries of the contract above are replaced;
everything else stands.

- PALETTE — EXTENDED. Use the measured in-engine bridge ramp given below.
- NO GROUND — REPLACED. A bridge tile IS a piece of walkable ground, so the deck itself is
  the subject. Still no water under it, no shadow, no ripple, no bank, no piling below the
  waterline, nothing standing on the deck.

Goal: One labelled 2D pixel-art sheet for a Korean riverside water park, drawn in the 2:1
dimetric isometric view described above. This sheet defines the two BRIDGE tiles — the
same footbridge seen running along each of the two ground axes.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background.

Layout — exactly this, nothing else:

  TOP BAND, the upper half: two cells side by side, labelled "BRIDGE X" and "BRIDGE Z".
  Each holds ONE isolated bridge tile drawn 448 px wide and 392 px tall, generous magenta
  margin all round.

  PROOF BLOCK, the lower half: two horizontal rows, labelled "RUN X x4" and "RUN Z x4".
  Each row is four copies of the tile above it, butted end to end along its own axis with
  no gap, at exactly half the size of the cell above (224 px wide each). The four copies
  must read as ONE continuous bridge: the deck planks, the gaps between them and the
  handrail must all line up across every join.

THE TILE ITSELF.
Each bridge tile is 32 x 28 logical pixels and stands on a 1 x 1 tile footprint, so its
deck is the same 32 x 16 diamond as a ground tile, sitting at the BOTTOM of the canvas
(occupying the lower 16 logical pixels). The remaining 12 logical pixels above the deck
are the handrail. Anchor point is bottom-centre: the deck's bottom corner.

  - BRIDGE X (bridge_x) runs along the W axis: the deck's planks and its handrail run
    toward the LOWER RIGHT of the screen, +16 px right and +8 px down per step.
  - BRIDGE Z (bridge_z) runs along the D axis: the same bridge mirrored, planks and rail
    running toward the LOWER LEFT, -16 px left and +8 px down per step.

  These two are mirror images of each other. Draw them as the same bridge, not as two
  different bridges.

WHAT IT IS.
A simple riverside timber footbridge, plain and sturdy. Warm brown deck boards laid ACROSS
the direction of travel (so you see a ladder of short boards marching away along the run),
a slightly darker gap between each board, and one continuous light-topped handrail running
the full length of the tile along the far side, about 10 logical texels above the deck,
carried on slim posts. Kairosoft plainness: no lattice, no truss, no arch, no rope, no
lantern, no signage, no rust, no moss.

EXACT TONES for this sheet:
  deck boards   #a67c4a
  board gaps    #8a6238
  handrail top  #c9a06a
  outline       #4a3826 (baked, 1 texel, on the outer silhouette)

⚠ The handrail must NOT stop at the tile edge with a post cap or an end knob. It runs
straight off both ends of the tile and continues into the next one. An end cap turns a
four-tile run into four separate short bridges. The outline is baked on the outer
silhouette as usual, but keep the plank rhythm continuous across the joins so the run
still reads as one bridge.

⚠ The deck is a flat diamond, not a box. Do not give the deck a visible thick side face,
do not draw pilings or piers dropping below it, and do not curve or arch it. The engine
places these on the water and draws everything below the deck itself.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
Attach: art-reference/crops/building-dock.png + art-reference/crops/boats-water.png
```

> 운영 메모 — 다리는 계약상 `ground/` 접두사지만 지면 타일과 달리 **아웃라인을 굽는다**
> (`drawGround` 의 bridge 가지가 `bakeOutline` 을 부른다). 그래서 W1~W11 의 "아웃라인
> 없음" 오버라이드를 쓰지 않는다.

---

## Sheet W13 — wall/edge ×4 · wall/door ×4 · 유리벽과 문 (8 items, 4x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `wall/edge:a0` | `wall__edge__a0.png` | EDGE I+ |
| 2 | `wall/edge:a1` | `wall__edge__a1.png` | EDGE J+ |
| 3 | `wall/edge:a2` | `wall__edge__a2.png` | EDGE I- |
| 4 | `wall/edge:a3` | `wall__edge__a3.png` | EDGE J- |
| 5 | `wall/door:a0` | `wall__door__a0.png` | EDGE I+ + door |
| 6 | `wall/door:a1` | `wall__door__a1.png` | EDGE J+ + door |
| 7 | `wall/door:a2` | `wall__door__a2.png` | EDGE I- + door |
| 8 | `wall/door:a3` | `wall__door__a3.png` | EDGE J- + door |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — wall sheet. One entry is replaced, one is added.

- PALETTE — EXTENDED. Use the measured in-engine glass ramp given below.
- FOOTPRINT — ADDED CASE. A wall does NOT stand on a footprint. It stands ON THE BORDER
  BETWEEN two ground tiles: a thin strip along ONE edge of one 32 x 16 diamond. It never
  fills a tile, never occupies a tile, and never sits in the middle of one.

Goal: One labelled 2D pixel-art sheet for a Korean riverside water park, drawn in the 2:1
dimetric isometric view described above. This sheet defines the building envelope: four
glass wall segments, one for each of the four tile edges, and the four matching segments
with a doorway cut through them.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. 4 columns by 2 rows of
evenly spaced cells, 384 px per column. Small dark pixel-font English label above each
cell. Row 1 is the four plain walls, row 2 is the same four with a door.

THE PIECE ITSELF — read this twice, it is the part that goes wrong.
Every one of the eight is 32 x 26 logical pixels. Inside that canvas, imagine the 32 x 16
ground diamond sitting at the BOTTOM (corners: top (16,10), right (32,18), bottom (16,26),
left (0,18)). The wall is a thin strip standing on ONE of that diamond's four edges:

  - It follows that one edge exactly, at the 2:1 angle, so it is a leaning strip — never
    a rectangle, never a flat front-facing panel, never a box.
  - It rises 10 logical texels straight UP from that edge. Vertical edges stay vertical.
  - It is 3 logical texels thick, and that thickness is visible as a narrow top surface
    along the whole run.
  - It occupies only HALF the canvas width: the two right-hand edges live in the right
    half, the two left-hand edges in the left half. The rest of the canvas is empty
    magenta. That emptiness is correct — do not centre the wall, do not fill the canvas.

The wall is LOW. 10 texels is shorter than a visitor, who is 24 texels tall. You are
drawing a waist-high glazed screen, not a building wall. If it looks like a room wall it
is too tall.

THE FOUR EDGES — on screen these are only two diagonals, plus their mirrors:

  1. "EDGE I+"  — the LOWER-RIGHT edge of the diamond (from the bottom corner up to the
     right corner). Right half of the canvas. The face you see is its outer, right-facing
     side, lit slightly brighter.
  2. "EDGE J+"  — the LOWER-LEFT edge (from the left corner down to the bottom corner).
     Left half. Its visible face is left-facing, slightly darker.
  3. "EDGE I-"  — the UPPER-LEFT edge (from the top corner down to the left corner). Left
     half, sitting higher in the canvas than J+. Same left-facing tone as J+.
  4. "EDGE J-"  — the UPPER-RIGHT edge (from the top corner across to the right corner).
     Right half, sitting higher than I+. Same right-facing tone as I+.

  So I+ and I- are parallel to each other (both run down-right), and J+ and J- are
  parallel (both run down-left). The difference between a "+" and a "-" edge is only WHERE
  IN THE CANVAS it sits — the near edge low, the far edge high. Draw them as the same
  wall in four positions, not as four different walls.

MATERIAL — glazed screen, and the glass is NOT drawn as glass.
Bottom to top, every segment is built of exactly four flat opaque parts:

  - PLINTH — the bottom 5 texels of the height. Flat opaque grey-blue #8d979b. Solid.
  - PANE — the middle. Flat opaque pale tint: #e2eef3 on the right-facing segments
    (I+ and J-), #c9dae2 on the left-facing ones (J+ and I-). One flat fill, nothing else.
  - MULLION — a slim opaque upright post every 4 texels along the run, full height,
    in the cap colour #c3ced3. These are what make the wall line readable.
  - CAP — the top 2 texels of the height, plus the 3-texel-wide top surface. Flat opaque
    #c3ced3.

  ⚠ THE PANE IS PAINTED FLAT AND OPAQUE. Do NOT draw transparency. Do NOT draw a
  checkerboard, a half-tone, a stipple or a dither. Do NOT draw a reflection, a highlight
  streak, a sky gradient, a diagonal glint, or anything showing through. Do NOT tint the
  pane toward its neighbours.

  The reason is mechanical, not aesthetic. The engine makes this glass see-through by
  punching a 50% checkerboard into the pane AFTER the sprite is reduced to its logical
  size — a checker that has to land exactly on the texel grid. A checker drawn into a
  generated image cannot land on that grid, and painted transparency would blend colours
  that do not exist in this game's palette, which is exactly what the stipple was chosen
  to avoid. So: the pane must be ONE flat fill in ONE exact colour, distinct from plinth,
  mullion and cap, so the tool can find it and perforate it. Everything you paint that is
  NOT the pane colour survives as solid.

THE DOOR ROW.
Row 2 repeats the four segments with a doorway. The doorway is a rectangular opening about
11 texels wide, centred along the run, cut from the TOP OF THE PLINTH up to 2 texels below
the cap. Inside the opening there is no glass, no frame, no door leaf, no handle, no
curtain and no darkness — it is a genuine hole, so fill it with the flat #FF00FF magenta
background so it keys out cleanly. The plinth continues UNDER the opening (there is a low
threshold), and the cap continues OVER it (there is a lintel), so the segment stays one
connected silhouette. Keep the mullions on both sides of the opening.

OUTLINE.
Baked 1-texel #4a3826 outline on the outer silhouette, exactly as the contract says, and
also around the door opening. This is the one place the outline is mandatory: without it
the pale glass dissolves into the pale ground.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
Attach: art-reference/crops/iso-shower-hut.png + art-reference/crops/iso-vest-hut.png
```

> 운영 메모 — 스티플을 "그리라"고 쓰지 않았다. 이유는 프롬프트 안에 적어 뒀다:
> ① 체커는 축소 후 텍셀 격자에 정확히 떨어져야 하는데 생성 이미지는 그걸 보장 못 하고,
> ② 알파 블렌딩은 39색 팔레트에 없는 중간색을 만든다 (계약이 스티플을 고른 바로 그 이유).
> 그래서 **판유리는 단색 평면 하나**로 받고, 파이프라인이 그 색을 찾아 뚫는다.
> 판유리 색이 갓·굽·멀리온과 반드시 달라야 하는 것은 이 때문이다 — 마스크의 근거다.

---

## Sheet W14 — backdrop/mountain · backdrop/ridge (2 items, 1x2 @ 2x)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `backdrop/mountain` | `backdrop__mountain.png` | MOUNTAIN (far) |
| 2 | `backdrop/ridge` | `backdrop__ridge.png` | RIDGE (mid) |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — backdrop sheet. Four entries are replaced.

- PERSPECTIVE — REPLACED. A backdrop band is NOT isometric. It is a flat, far-away
  silhouette band seen head-on, like a stage flat behind the map. No tiles, no diamonds,
  no 2:1 anything.
- OUTLINE — REPLACED. The mountain band carries NO dark outline at all; it is edged only
  in its own darker tone. A dark line on the farthest layer destroys the aerial
  perspective and drags the mountain forward. The ridge band carries a 1-texel dark line
  along its crest ONLY — never around its sides or its bottom.
- PALETTE — EXTENDED. Use the measured atmospheric ramps below.
- NO GROUND / NO SHADOW / NO WATER — KEPT AND TIGHTENED. No sky, no sun, no cloud, no
  river, no bank, no reflection, no bird, no building, no road, no fence.

Goal: Two labelled 2D pixel-art BACKDROP BANDS for a Korean riverside resort — the far
mountains of Gapyeong seen across the river. These are flat distance layers that scroll
behind the isometric map.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. Two bands stacked
vertically, each 1024 px wide and 400 px tall, horizontally centred, with a clear magenta
gap between them and a small dark pixel-font label above each: "MOUNTAIN (far)" on top,
"RIDGE (mid)" below.

Each band is 512 x 200 logical pixels, drawn here at 2x. Everything below the skyline is
solid; everything above the skyline is flat magenta and keys out.

HORIZONTALLY SEAMLESS — the requirement that decides whether this asset is usable.
The camera pans sideways and the band repeats. So the LEFT EDGE MUST CONTINUE EXACTLY
INTO THE RIGHT EDGE. The skyline height at the far left pixel and the far right pixel must
match, and the shapes must flow through the join. Do not put a peak, a valley bottom or
any feature hard against either edge — put them in the middle, and let the edges fall on
an ordinary stretch of slope.

TWO TONES PER BAND, PLUS ONE CREST TONE. Aerial perspective is the entire point:
the farther the layer, the paler, bluer and flatter it is.

  MOUNTAIN (far) — high, pointed, hazy blue-grey, almost dissolving into the sky.
    body  #93aec2   lit (upper 18%)  #aac3d3   shadow (lower 28%)  #7f9ab1
    Silhouette: tall and sharp. Several peaks of clearly DIFFERENT heights, the tallest
    reaching near the top of the band, so it reads as rising behind the ridge in front of
    it. Simple silhouette shading only: a paler strip along the top, the body, a darker
    mass at the bottom. No individual trees, no rock detail, no snow cap, no ridgelines
    drawn inside the mass.

  RIDGE (mid) — lower, rounder, distinctly darker and bluer.
    body  #5b7f96   lit (upper 18%)  #7496aa   shadow (lower 28%)  #48697e
    Silhouette: rolling hills, roughly half the height of the mountain band, softer and
    broader. A 1-texel #4a3826 line along the crest only. Same flat 3-band shading, no
    interior detail.

  ⚠ The two must read as two clearly separate steps of distance. If the mountain is not
  visibly paler and hazier than the ridge, the layers collapse into one and the whole
  reason for having three of them is gone. Compare them on this sheet before finishing.

Reference: match the palette and the flat, low-detail silhouette treatment of the attached
reference image(s). Ignore any foreground objects in them.
Attach: art-reference/crops/foliage-hills.png + art-reference/crops/shore-trees-houses.png
```

> ⚠ **배경은 우선순위 최하다.** 이 저장소는 "그려진 원경 배경을 세우지 말 것"을 두 번
> 어겼다 (K38). 실제 게임은 지도 바깥을 **같은 지형 스프라이트**로 덮고
> (`bakeSurroundTexture`), 그 굽기가 성공하면 절차적 배경 3겹은 **아예 만들어지지도
> 않는다** — 타일스프라이트 3장이 텍스처 9.6MB 를 붙들고 있었기 때문이다.
> 이 두 시트(W14·W15)는 그 안전망의 교체품이므로 **다른 65개를 다 뽑은 뒤에** 뽑는다.
> 근거: `art-reference/competitor/README.md` — Pool Slide Story 는 경계를 아예 안 보여
> 주고, Terra Nil 은 플레이 영역 밖을 같은 스케일 지형으로 덮는다.

---

## Sheet W15 — backdrop/farbank (1 item, 1x1 @ 3x)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `backdrop/farbank` | `backdrop__farbank.png` | FARBANK (near) |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

SHEET OVERRIDES — backdrop sheet. Four entries are replaced.

- PERSPECTIVE — REPLACED. A backdrop band is NOT isometric. It is a flat, far-away
  silhouette band seen head-on. No tiles, no diamonds, no 2:1 anything.
- OUTLINE — REPLACED. A 1-texel #4a3826 line along the crest ONLY — never around the
  sides, never along the bottom, never around the individual trees.
- PALETTE — EXTENDED. Use the measured ramp below.
- NO GROUND / NO SHADOW / NO WATER — KEPT AND TIGHTENED. No sky, no sun, no cloud, no
  river, no waterline, no reflection, no boat, no house, no road, no fence.

Goal: One labelled 2D pixel-art BACKDROP BAND for a Korean riverside resort — the wooded
FAR BANK of the river, the nearest and greenest of the three distance layers.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background. One band, 1536 px wide and
600 px tall, horizontally centred, sitting in the middle of the canvas with magenta above
and below. Small dark pixel-font label above it: "FARBANK (near)".

The band is 512 x 200 logical pixels, drawn here at 3x. Everything below the skyline is
solid; everything above it is flat magenta and keys out.

HORIZONTALLY SEAMLESS — the requirement that decides whether this asset is usable.
The camera pans sideways and the band repeats, so the LEFT EDGE MUST CONTINUE EXACTLY INTO
THE RIGHT EDGE: same skyline height at the first and last pixel, shapes flowing through the
join. No tree may be cut in half by either edge, and no peak or valley bottom may sit hard
against an edge.

WHAT IT IS.
A long low wooded riverbank: a gentle green landform filling roughly the lower quarter to
third of the band, with a ragged TREE LINE standing along its top. About 24 trees across
the full width, evenly spaced but of visibly varying height, each a simple blunt conifer
or rounded broadleaf blob 8 to 17 logical texels tall — a silhouette, not a drawn tree.
Two tones per tree: the lighter tone on its upper third, the darker on the rest. The trees
must merge into a continuous ragged line, not stand as separated lollipops.

  body  #3f6b57   lit (upper 18% / tree tops)  #548a6c   shadow (lower 28%)  #2f5442

This is the NEAREST of the three layers, so it is the darkest, greenest and least hazy —
clearly more saturated than the blue-grey ridge behind it. But it is still distant: no
trunk, no branch, no leaf, no texture inside the landform, no building, no jetty.

Reference: match the palette and the flat, low-detail silhouette treatment of the attached
reference image(s). Ignore any foreground objects in them.
Attach: art-reference/crops/shore-trees-houses.png + art-reference/crops/foliage-hills.png
```

> 운영 메모 — farbank 만 3배로 따로 뽑는 이유: 세 겹 중 유일하게 **내부 형체(나무 24그루)**
> 가 있어 해상도가 필요하다. mountain·ridge 는 2단 실루엣이라 2배로 충분하고, 둘을 한
> 캔버스에 넣어야 "대기 원근 두 단계가 실제로 갈라지는가"를 눈으로 볼 수 있다.
> 밴드 종횡비 512:200 은 절대 늘이지 말 것 — 늘여서 뽑으면 되돌릴 때 봉우리가 뭉개진다.

---

## Sheet W16 — deco ×8 · 콤보 데코 (8 items, 4x2)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `deco/ring_rack` | `deco__ring_rack.png` | RING RACK |
| 2 | `deco/safety_sign` | `deco__safety_sign.png` | SAFETY SIGN |
| 3 | `deco/guard_stand` | `deco__guard_stand.png` | GUARD STAND |
| 4 | `deco/first_aid` | `deco__first_aid.png` | FIRST AID BOX |
| 5 | `deco/sculpture` | `deco__sculpture.png` | SCULPTURE |
| 6 | `deco/banner` | `deco__banner.png` | BANNER |
| 7 | `deco/planter_row` | `deco__planter_row.png` | PLANTER ROW |
| 8 | `deco/night_light` | `deco__night_light.png` | NIGHT LIGHT |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — this is the one thing that must never drift.
2:1 dimetric isometric, the "Kairosoft / RollerCoaster Tycoon" view. Camera yaw 45°,
elevation 30°. One ground tile is a 32x16 pixel diamond. Vertical edges of every object
stay perfectly vertical on screen. Horizontal edges run at exactly 2:1 — two pixels
across for every one pixel down. NEVER draw a front-facing or side-on RPG view. NEVER
use vanishing-point perspective. NEVER tilt an object's vertical axis.

FOOTPRINT — the second thing that must never drift.
Every object stands on a footprint of W x D ground tiles, and that footprint decides its
whole shape. The base is NOT a square. Build it like this:

  - The W axis runs toward the LOWER RIGHT of the screen. Each step is +16 px right,
    +8 px down.
  - The D axis runs toward the LOWER LEFT of the screen. Each step is -16 px left,
    +8 px down.
  - So the base diamond is exactly (W + D) x 16 px wide and (W + D) x 8 px tall, and the
    object's body rises straight up from it.

Each item below states its footprint and the exact pixel size of that base diamond.
Draw the base to those numbers. A 4x1 footprint is a LONG THIN diamond — a row of four
repeated units marching away toward the lower right, only one unit deep. It is not a
wide box and it is definitely not a square building. A 1x4 is the same row mirrored,
marching toward the lower left. A 2x2 is a small square-ish diamond. A 6x3 is a long
hall, twice as long as it is deep.

When a footprint is N x 1 or 1 x N, draw N repeated units in a row — four shower stalls,
three changing booths, four sunbeds — sharing one continuous roof or frame. The repeat
count must be countable at a glance; that repetition IS the silhouette.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labelled 2D pixel-art asset sheet for a Korean riverside water park, drawn in
the 2:1 dimetric isometric view described above. Eight small standalone props that the
player drops between facilities: four SAFETY props and four SCENERY props.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green — half
of these props are green or blue). 4 columns by 2 rows of evenly spaced cells, 384 px per
column. Small dark pixel-font English label above each cell.

These are the smallest objects in the game. Every one stands on a 1 x 1 tile footprint, so
its base diamond is exactly 32 x 16 px, and the body rises straight up from it to the
height given. Draw them BIG on this sheet (about 12x) but design them to read at their
logical size: a prop that is 12 texels tall has room for one idea and nothing else.

⚠ THE TWO GROUPS MUST BE TELLABLE APART ACROSS A CROWDED SCREEN.
  - The four SAFETY props are HOT and high-contrast: signal red #ef4b4b, warning yellow
    #ffd23f, white #fdf3e0. They are equipment, so they look official, plain and blunt.
  - The four SCENERY props are COOL and decorative: blue #4a90b8, teal #62a58c, gold
    #f2b53f, foliage green #8fbc63. They are ornament, so they may be shapely.
  A player scanning the map has to see at a glance which of their props are safety and
  which are decoration. Do not give a scenery prop a red accent, and do not give a safety
  prop a decorative one.

Items — exactly 8, one per cell, in this order:

ROW 1 — SAFETY (hot colours)
1. RING RACK (ring_rack) — footprint 1x1 — base diamond 32x16 px, body 16 px tall, whole
   sprite 32x32 px — a short A-frame timber rack holding TWO orange-red life rings hung
   side by side, each ring with white cross-bands. The two rings are the silhouette; make
   them big and circular and let them overlap the frame so it stays one connected shape.
2. SAFETY SIGN (safety_sign) — footprint 1x1 — base diamond 32x16 px, body 20 px tall,
   whole sprite 32x36 px — a single slim post carrying one square warning board at the
   top, angled to face the lower right. Red border, white field, one blunt black
   pictogram-blob inside. No readable text, no letters.
3. GUARD STAND (guard_stand) — footprint 1x1 — base diamond 32x16 px, body 20 px tall,
   whole sprite 32x36 px — a small raised lifeguard platform: a boxy timber step-up with a
   low white rail on top and a red pennant on a short mast at one corner. Empty — the game
   draws its own staff, so no person on it.
4. FIRST AID BOX (first_aid) — footprint 1x1 — base diamond 32x16 px, body 12 px tall,
   whole sprite 32x28 px — the shortest prop here. A white cabinet on two stubby legs, a
   bold red cross on its front-right face, a dark handle line. Chunky and squat; at 12
   texels the cross is the only detail there is room for.

ROW 2 — SCENERY (cool colours)
5. SCULPTURE (sculpture) — footprint 1x1 — base diamond 32x16 px, body 20 px tall, whole
   sprite 32x36 px — a small abstract resort sculpture: two or three smooth stacked
   teal-and-blue forms (a leaning ring above a block works) on a pale stone plinth. Must
   read as art from its outline alone, and must NOT resemble any of the safety props.
6. BANNER (banner) — footprint 1x1 — base diamond 32x16 px, body 20 px tall, whole sprite
   32x36 px — two slim poles with a cloth banner slung between them, the cloth sagging
   slightly and gold-and-blue striped. No readable text on the cloth — a couple of blunt
   decorative blocks instead. The cloth must visibly touch both poles.
7. PLANTER ROW (planter_row) — footprint 1x1 — base diamond 32x16 px, body 8 px tall,
   whole sprite 32x24 px — the shortest prop in the game. A row of THREE low terracotta
   planters side by side along the lower-right axis, sharing one continuous base, each
   with a rounded green shrub mound on top. At 8 texels of body the three mounds are the
   whole silhouette — no flowers, no leaves, no trunk.
8. NIGHT LIGHT (night_light) — footprint 1x1 — base diamond 32x16 px, body 20 px tall,
   whole sprite 32x36 px — a slim resort lamp post: a dark tapered pole on a small square
   base with a single warm-gold globe lamp at the top under a small teal shade. The globe
   is the silhouette. No light beam, no glow halo, no cast pool of light on the ground —
   the engine handles the evening lighting.

Every object faces the same way: its front-right face toward the lower right, its
front-left face toward the lower left, top surface visible.

Reference: match the pixel density, palette and outline weight of the attached reference
image(s). The references are the style authority — follow them over any wording here.
Attach: art-reference/crops/iso-lifeguard.png + art-reference/crops/iso-vest-hut.png
```

> 운영 메모 — 데코 8종은 계약에 `kind: safety` 넷 · `scenery` 넷으로 나뉘어 있고,
> 절차적 플레이스홀더도 그 둘을 색으로만 가른다 (safety #d9694f · scenery #7ea9c9).
> 그래서 "두 무리가 눈으로 구분된다"를 색 대비로 프롬프트에 못박았다.
> 캔버스는 전부 `[32, 16 + bodyH]` 실측이다 (`kairo-contract.ts`).

---

## Sheet W17 — ui/icon ×15 · HUD 아이콘 (15 items, 5x3)

| cell | sprite id | 파일명 | label in sheet |
|---|---|---|---|
| 1 | `ui/icon-weather-clear` | `ui__icon-weather-clear.png` | CLEAR |
| 2 | `ui/icon-weather-cloudy` | `ui__icon-weather-cloudy.png` | CLOUDY |
| 3 | `ui/icon-weather-rain` | `ui__icon-weather-rain.png` | RAIN |
| 4 | `ui/icon-weather-heat` | `ui__icon-weather-heat.png` | HEAT |
| 5 | `ui/icon-weather-cold` | `ui__icon-weather-cold.png` | COLD |
| 6 | `ui/icon-coin` | `ui__icon-coin.png` | COIN |
| 7 | `ui/icon-satisfaction` | `ui__icon-satisfaction.png` | SATISFACTION |
| 8 | `ui/icon-visitors` | `ui__icon-visitors.png` | VISITORS |
| 9 | `ui/icon-grade` | `ui__icon-grade.png` | GRADE |
| 10 | `ui/icon-report` | `ui__icon-report.png` | REPORT |
| 11 | `ui/icon-menu` | `ui__icon-menu.png` | MENU |
| 12 | `ui/icon-build` | `ui__icon-build.png` | BUILD |
| 13 | `ui/icon-day` | `ui__icon-day.png` | DAY |
| 14 | `ui/icon-quest` | `ui__icon-quest.png` | QUEST |
| 15 | `ui/icon-exam` | `ui__icon-exam.png` | EXAM |

```
STYLE CONTRACT — Ppaji Tycoon (Korean riverside water-leisure park, Kairosoft-like)

PERSPECTIVE — flat front-facing icon. This sheet is the one exception in the game.
These are user-interface icons, not world objects. Draw them flat and head-on, square to
the screen, like the icons on a phone status bar. No 2:1 angle, no diamond, no footprint,
no ground plane, no depth, no vanishing point, no isometric anything.

Why this sheet is the exception: everything else in this game is a sprite standing on an
isometric map, so the projection is the contract. These fifteen live on the cream HUD
panels that sit ON TOP of the map, in the same plane as the screen. An isometric icon on
a flat panel reads as a tiny building someone dropped into the toolbar.

There is no FOOTPRINT rule on this sheet — icons do not stand on tiles.

PIXEL DENSITY — chunky, not fine.
Every object must read clearly at its stated logical pixel size. No detail smaller than
one pixel block. Large flat color areas, few blocks, strong silhouette. If you are unsure,
draw fewer and bigger blocks. Do not render smooth gradients, dithered photo textures,
or anti-aliased edges.

OUTLINE.
Every object carries a baked 1-pixel dark warm outline #4a3826. Floating/pontoon items
may use the cool outline #1e3348 instead. The outline is part of the sprite.

LIGHTING.
Single light from the upper left. Two tones per material only — a base tone and one
shadow tone. Shadows are WARM BROWN, never blue-grey. No cast shadows on the ground.

PALETTE — use only these 39 colors.
grass   #8fbc63 #7faa55 #9fc973
sand    #e8cf9a #dcc088 #f0dcae
water   #7fd0e6 #5fc6de #2b9ac4 #1a7ba8
wood    #dcb079 #c49a6a #b5844a #70522e
wall    #fdf3e0 #e4d3b4 #a0947e
roof    #e0604f #62a58c #4a90b8 #f2b53f #8b3c31 #3d6657 #2e5972 #967027
gear    #ffd23f #ef4b4b #3d8fd6 #4fbf72 #ff8c42 #3a3f4a
outline #4a3826 #1e3348
skin    #ffd9b8 #f0b48c #c98963
pontoon #4a76c8 #37599e #26406f

BACKGROUND — chroma key, not white.
Flat solid magenta #FF00FF filling the whole canvas behind the sprites. If a sheet's
subjects are themselves pink, magenta or red, use flat green #00FF00 instead (the sheet
below states which). No white, no gradient, no vignette, no texture.

NO GROUND, NO SHADOW, NO WATER.
The game engine draws terrain, water, ripples and shadows itself. Never draw a grass
patch, dirt plate, water pool, ripple, reflection or drop shadow under an object.
Anything that floats must be drawn as if lifted out of the water — dry, complete,
nothing cropped by a waterline.

ONE CONNECTED SILHOUETTE.
Each object must be a single connected shape. Awnings, canopies, curtains, banners and
roofs must visibly touch the body. Detached floating parts get lost when the sprite is
cut out.

ISOLATION AND LABELS.
One object per cell, centered, with generous empty margin. Nothing overlaps, nothing is
cropped by a cell edge or the canvas edge. Put a small dark pixel-font English label in
the margin ABOVE each cell — the label must never touch the object's bounding box.

DO NOT INCLUDE.
People or characters (the game draws its own visitors), watermarks, UI mockups, title
text, arrows, measurement guides, drop shadows, ground plates, photographic textures,
or any decorative background element.

Goal: One labelled 2D pixel-art ICON sheet for a Korean riverside water park management
game. Fifteen tiny flat interface icons for the game's HUD.

Canvas: 1536 x 1024 landscape. Flat #FF00FF magenta background (magenta, not green).
5 columns by 3 rows of evenly spaced square cells, about 300 px each. Small dark
pixel-font English label above each cell.

THE SIZE IS THE WHOLE PROBLEM.
Each icon is 24 x 24 logical pixels, and a 1-texel dark outline eats the border, so the
usable interior is about 22 x 22 texels. Drawn here at roughly 12x, one logical texel is
a 12 px block. So:

  - ONE idea per icon. No scene, no composition, no secondary object, no background shape.
  - Three fill colours plus the outline, maximum. Two is better.
  - Every shape must be at least 2 texels (24 px) across. No hairlines, no 1-texel detail,
    no thin rays, no small gaps between shapes.
  - No text, no numbers, no letters, no gradients, no glow, no drop shadow, no rounded
    3D bevel, no glassy highlight, no badge, no frame, no circular button plate behind
    the icon.

WHERE THEY LIVE — this decides the colours.
These sit on the game's CREAM UI: panel #fbe7c3, bar #f8d9a2, with a warm brown outline
#8c5e2b. So:

  - Outline every icon in warm dark brown #8c5e2b (not black, not the object outline).
  - Fill with SATURATED, DARKER colours that carry against cream: #ef4b4b red,
    #ff8c42 orange, #f2b53f gold, #3d8fd6 blue, #4fbf72 green, #3a3f4a near-black,
    #fdf3e0 white.
  - ⚠ Never fill an icon body with cream, beige, pale yellow or white-on-white. It will
    vanish into the panel. White is allowed only as a small inner detail bounded by the
    outline.

⚠ THE FIVE WEATHER ICONS ARE ONE MATCHED SET (items 1 to 5). The sun disc in "clear" and
"heat" must be the same size and the same gold. The cloud in "cloudy" and "rain" must be
the identical cloud shape, so that rain reads as "the cloudy one, plus rain". They sit
side by side in the same HUD slot and swap between weeks, so any drift in size or weight
looks like a bug.

Items — exactly 15, one per cell, in this order:

ROW 1 — WEATHER
1. CLEAR (ui/icon-weather-clear) — a plain gold sun: a solid filled disc with a ring of
   short blunt triangular rays, each ray at least 2 texels wide. Cheerful, simple.
2. CLOUDY (ui/icon-weather-cloudy) — a single chunky white cloud with three rounded lobes,
   brown-outlined, one grey shadow tone along its underside. No sun behind it.
3. RAIN (ui/icon-weather-rain) — the SAME cloud as icon 2, with three short thick blue
   rain strokes falling below it. The strokes are blunt slabs, not thin lines, and they
   must not touch each other.
4. HEAT (ui/icon-weather-heat) — the SAME sun disc as icon 1 but red-orange instead of
   gold, with two thick wavy heat-shimmer bars beneath it. It must read as "too hot", not
   as fire and not as a second sun.
5. COLD (ui/icon-weather-cold) — a six-armed snowflake in pale ice blue on a darker blue
   core. Thick arms, three simple bars crossing at the centre with a blunt fork at each
   tip. No fine crystal branching — it will disappear.

ROW 2 — RESOURCES AND STATE
6. COIN (ui/icon-coin) — one gold coin seen face-on: a filled disc with a darker rim ring
   and a single blunt mark stamped in its centre. No stack, no pile, no sparkle, no
   currency letter.
7. SATISFACTION (ui/icon-satisfaction) — a round smiling face: gold disc, two square dark
   eyes at least 2 texels each, one thick upward-curved mouth. Warm and plain. No blush,
   no eyebrows, no nose.
8. VISITORS (ui/icon-visitors) — two overlapping guest silhouettes, head-and-shoulders,
   the front one blue and the one behind it darker so the overlap reads. Solid blobs, no
   faces, no limbs, no detail.
9. GRADE (ui/icon-grade) — one five-pointed gold star, thick-armed and solid, filling most
   of the cell, with a lighter tone on its upper-left arms. No sparkle, no second star, no
   ribbon.
10. REPORT (ui/icon-report) — a sheet of paper seen face-on with a rising bar chart on it:
    three bars of increasing height in blue, and one blunt up-arrow above them. The paper
    is white, the chart is the silhouette. No text lines, no folded corner.

ROW 3 — ACTIONS
11. MENU (ui/icon-menu) — one gear: a thick dark ring with SIX blunt square teeth and a
    large open hole in the middle. Six teeth, not twelve — twelve will smear into a disc.
12. BUILD (ui/icon-build) — a hammer crossed with a hard hat: a yellow safety helmet in
    front, a brown-handled grey hammer angled behind it. Two objects only, clearly
    overlapping so they form one connected shape.
13. DAY (ui/icon-day) — a double chevron pointing right, like a fast-forward button: two
    thick solid arrowheads one after the other, dark on nothing else. This means "advance
    a day". No clock, no calendar, no circle behind it.
14. QUEST (ui/icon-quest) — a clipboard seen face-on: a brown board, a white sheet on it,
    a grey clip at the top, and two thick horizontal marks on the sheet standing in for
    written lines. The marks are blunt slabs, not text.
15. EXAM (ui/icon-exam) — an official certificate: a white sheet with a red wax seal disc
    at its lower right and a short ribbon tail under the seal. The seal is what
    distinguishes it from icon 14, so make the seal big and unmistakable.

Reference: match the warm cream palette, the brown outline weight and the chunky pixel
density of the attached reference image(s). The references show the actual HUD panels
these icons will sit on — read them for colour contrast, not for layout.
Attach: art-reference/ui-concept/concept-28-quest-chips.png +
art-reference/ui-concept/concept-29-build-carousel.png
```

> 운영 메모 — **UI 시트만 투영 규칙이 예외다.** 프롬프트 맨 위에 PERSPECTIVE 문단을
> "flat front-facing icon, not isometric" 으로 갈아 끼우고, **왜 예외인지**를 그 자리에
> 한 줄로 적었다 (다른 것은 전부 지도 위에 서는 스프라이트지만 이 15개는 지도 **위에**
> 덮이는 크림 HUD 패널 위, 화면과 같은 평면에 산다).
> 나머지 계약(팔레트·아웃라인·청키·크로마 키·격리 셀)은 그대로 적용된다.
> 아웃라인만 물체용 #4a3826 이 아니라 크림 UI 의 #8c5e2b 다 (계약 `uiIcons.style`).
> ⚠ 크림 배경(#fbe7c3) 위라 **밝은 색으로 채우면 사라진다** — 이 제약을 명시했다.

---

## 미결 · 이 시트로 못 푸는 것

1. **4방 이음새는 계약이 "미해결"로 표시해 둔 항목이다** (`ground.tilingQA` ·
   `wall.tilingQA`). 프롬프트는 이음새를 **말로** 요구할 뿐이고, 합격 판정은 여전히
   `npm run seam` (4방 이음새 QA, `--selftest` 로 음성 대조군)이 한다. 뽑은 타일은
   **반드시 seam 을 통과시킨 뒤에** 아틀라스에 넣을 것. 통과 문턱은 코드 주석 기준
   대비 ~2.5배이고, 실측 사례가 둘 있다 — 가로수는 유기적일 때 2.9배, 암반은 포장일 때
   2.66배로 튀었다.
2. **판유리 스티플은 파이프라인 단계가 아직 없다.** 프롬프트는 판유리를 "단색 평면 하나"로
   받게 해 뒀지만, 그 색을 찾아 50% 체커로 뚫는 후처리는 누군가 써야 한다. 순서도
   계약에 있다 — **아웃라인을 구운 뒤에** 뚫는다 (순서를 바꾸면 투과율이 0%가 된다,
   CLAUDE.md 불변식).
3. **문 구멍의 실제 규격이 절차적 코드와 다르다.** 계약(높이 10 · 굽 5)에서 지금 코드가
   뚫는 구멍은 **세로 3텍셀**뿐이라 "지나갈 수 있는 문"으로 안 읽힌다. 프롬프트에는
   **의도한 것**(굽 위부터 갓 아래 2텍셀까지, 폭 11텍셀)을 적었다. 교체할 때 이 차이를
   확인할 것 — 그림이 코드보다 크게 뚫린다.
4. **지면 3변형의 alt 배정 규칙을 확인하지 않았다.** 엔진은 `hash2(x, y, alt*977 + …)` 로
   변형을 고른다. 시트에서 잘라낸 A/B/C 를 어떤 순서로 alt 0/1/2 에 넣든 결과는 같아야
   하지만(평균 톤이 같다는 요구사항이 그것을 보장한다), 만약 톤이 어긋난 채로 넣으면
   **격자무늬가 시드에 따라 달라져** 원인을 못 찾는다. 증명 블록을 먼저 볼 것.
5. **배경 3겹은 우선순위 최하이고, 아예 안 쓰일 수도 있다** (W14 메모 참조). 굽기
   (`bakeSurroundTexture`)가 성공하면 절차적 배경은 만들어지지도 않는다 — 검사가
   "3겹이 있다"가 아니라 **"둘 중 하나가 성립한다"**를 본다.
6. **UI 아이콘은 아직 DOM 이모지다** (`uiIcons.note`). 교체 지점은 `kcap`/`kbtn` 안의
   `<img>` 이고, 스프라이트 계약(`specs`)에는 안 들어간다 — 절차적 드로어 강제 검사
   (`missingDrawers`)가 캔버스 에셋에만 해당하기 때문이다. 즉 **이 목록 자체가
   작업지시서**다 (manifest 의 이중 역할과 같은 장치).
7. **겨울 지면이 없다.** 계약의 `palette.mustAdd` 가 "눈·얼음 계열 (겨울 4종)"을 적어
   뒀는데 `ground.types` 에는 11종뿐이다. 사계절 중 여름만 MVP 라 지금은 맞지만,
   비수기를 채우면 지면 시트가 늘어난다.
8. **`#2b1d12`(손님 아웃라인)도 `mustAdd` 다.** 손님은 코드가 굽는 영역이라 이 시트들과
   무관하지만, 39색 팔레트 파일 자체가 아직 41색이 아니라는 뜻이다 — 팔레트 파일을
   고칠 때 스타일 블록의 "use only these 39 colors" 문장도 같이 고칠 것.

---

## 이 시트에 **없는** 것과 이유

- **시설 75종 · 코스 장비 19종** — 다른 몫이다 (`facilities` 키).
- **손님** — 영구히 코드가 굽는다. 11픽셀 머리 안에 1픽셀 눈·입이 4방향 × 7자세 × 8팔레트다.
- **물결 · 항적 · 그림자 · 절벽 치마 · 지도 바깥 굽기** — `source: 'procedural'`.
  절벽 치마는 윗면과 **한 장으로** 굽는 것이 계약이라(따로 두면 깊이가 동률이 된다)
  AI 로 뽑을 대상이 아니다.
- **지면 타일의 4번째 이후 변형** — 계약이 종류당 `alts: 3` 으로 고정했다.
