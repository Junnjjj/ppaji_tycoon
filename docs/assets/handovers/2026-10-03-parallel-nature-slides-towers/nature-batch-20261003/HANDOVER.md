# Nature batch — coordinator review candidates

Six IDs: `env_pine`, `env_deciduous`, `env_willow`, `env_shrubs`, `env_rocks`, `env_flower_pot`. Each has `candidates/ID/d0.png` through `d3.png`. Integration entry is `review.json`, with the same per-asset/per-frame schema as the hedge-flowerbed pack. `main_modified: false`; runtime QA **NOT RUN**. No main, shared inventory, review app, registration, or other pack was changed.

Open `index.html`: one scrolling page of six native-density original/candidate/line-overlay boards. Each panel uses its complete rectangular canvas, the same floor grid and the original frame origin; the report does not crop or independently fit panels. `original-inspection.png` is a separate overview used for initial source observation.

## Identity and method

The immutable all-four source images were visually inspected before authoring. The pine is a Korean rounded-pad pine with exposed orange branching, not a cone. Seven fixed asymmetric pads surround the branch scaffold; the broadleaf tree has seven connected irregular crown lobes. The willow has five upper crowns, ten descending stems and ten long lower profiles tapered toward their tips; fixed lanceolate leaves add hanging streaks. Shrubs have three unequal rooted lobes. Rocks are four unequal, irregular closed faceted solids with twelve moss pockets. The small pot is golden slatted wood with thick rim, dark soil and green foliage; no colored flowers were visible in the sources.

`build.py` authors common geometry, using copied read-only example helpers in `geometry.py`. Crown meshes have deterministic angular irregularity; each leaf root is placed inside the conservative intersection of the actual core face halfspaces. All parts rotate together. No ImageGen, Blender, screen warp, camera-facing billboard, or per-facing fit is used. Full RGB is rendered at SSAA2 and resolved to packed density4; only line/coverage decisions use the 2-packed-pixel grid. The renderer preserves `logical_w`, `logical_h`, `left`, `top`, `w`, `h`, footprint and full original frames.

One fixed canonical proportion correction broadens trees 1.14 in u/v and reduces height to .94, scales the small pot .84 in u/v and .90 in height, and scales rocks .94 in u/v and .80 in height. These changes apply to the entire common assembly around its canonical footprint center and never alter the registration. Source directional sizes are inconsistent; `source-size-review.json` records all 24 actual final bbox ratios without fitting each view.

## Validation and limits

- `verification.json`: closed-edge incidence, declared AABB joints, all-quarter-turn edge-length invariance, complete saved canvas/registration, clipping, connected alpha components and crown distribution checks.
- `plant-root-qa.json`: 3,088 leaf roots inside the conservative kernel of actual core triangle halfspaces, beyond an AABB-only assertion. Irregular cores may be nonconvex; this does not certify global convexity or exact collision.
- `organic-qa.json`: asymmetric scaffold/crown counts, ten descending willow stems and elongated cores, four distinct rocks, three shrub roots, saved RGB diversity and rotated silhouettes.
- Straight-line scope is deliberately narrow: only the pot's genuine bottom edges. All 16 projected pot edges are too short or occluded to meet the unchanged long-edge fit thresholds; **zero long straight lines are certified**. Pink overlays show guides, not passes. Organic boundaries are not forced onto a straight isometric axis. Coverage/short-line evidence is retained in verification.json.
- AABB contact is not exact collision certification; numeric QA is not art95. Local visual review is not coordinator acceptance or runtime review. Actual map capture/adoption is coordinator-owned.

`first-qa-failures.json`, `first-sparse-willow.png`, and `rejected-round-crowns/` preserve the initial grounded-trunk/joint failures and coordinator-rejected smooth round-crown evidence. The later changes correct geometry/attachments rather than relax pass thresholds. The old exact ellipsoid-shell diagnostic was replaced by a declared irregular radial-envelope sanity check plus the stronger actual-face leaf-root test because the authored core is no longer an ellipsoid.

## Reproduce

From this pack directory, using `/tmp/ppaji-angle-survey-venv/bin/python` as PY:

```sh
$PY build.py
$PY render.py surface-spec.json --out candidates
$PY verify.py
$PY verify-plant-roots.py
$PY verify-organic.py
$PY build-report.py
$PY hash-pack.py
```

Build resets `review.json` to candidate review state; do not run it after adoption without preserving coordinator receipts. `final-hashes.json` and `SHA256SUMS` cover the final local files and candidate PNGs. The copied bootstrap/setup helpers are historical construction utilities, not part of the reproduce command sequence.

Final local result: structural/pixel scope PASS for all 24 frames; 3,185 closed parts, 3,176 AABB joint checks and 3,088 actual-face leaf-root checks. All 24 candidate views were visually inspected with view_image. The d3 detached willow scaffold tip was corrected by shortening common stem ends inside the leaves; failure evidence is retained in willow-fine-stem-pixel-failure.json. Final tree width/source ratios are approximately .96–1.03 and height ratios .99–1.12; small source asymmetries remain documented, not independently fitted.
