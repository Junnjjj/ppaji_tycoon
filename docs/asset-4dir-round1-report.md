# Facility 4-direction worker report

Generated: 2026-08-22T17:47:24.170Z

Scope: 19 coordinator-approved existing d0 locks. The seven held-out ids are ticket, icecream,
bungeoppang, rent_duck, snow_sled, karaoke, and photozone. No live-pack sprite or facings data
was changed; all candidates remain in the audit workspace.

Metric notation: `vtx` is the ground-contact vertex offset in texels, `IoU` is the footprint
wedge overlap, and `light` is the fixed-screen upper-left score/verdict. `aN/rM` means N image
attempts and M rerolls. PASS still required visual inspection.

| facility | d0 lock (before) | d1 | d2 | d3 | unresolved |
|---|---|---|---|---|---|
| shop | LOCK vtx=0.0 IoU=1.000 light=36.6/upper-left | FAIL vtx=0.0 IoU=0.765 light=-4.5/flat a3/r2 | PASS vtx=0.5 IoU=0.954 light=27.2/upper-left a1/r0 | VISUAL-FAIL vtx=0.5 IoU=0.879 light=42.0/upper-left a3/r2 | d1: geom=iou, light=flat; d3: rear view exposes the front awning/service face |
| snackbar | LOCK vtx=0.0 IoU=1.000 light=38.4/upper-left | FAIL vtx=0.5 IoU=0.833 light=-11.5/flipped a3/r2 | FAIL vtx=0.0 IoU=0.785 light=23.5/upper-left a3/r2 | BLOCKED | d1: geom=pass, light=flipped; d2: geom=iou, light=upper-left; d3: chain predecessor did not pass |
| chicken | LOCK vtx=0.0 IoU=1.000 light=36.6/upper-left | FAIL vtx=1.0 IoU=0.859 light=-3.3/flat a3/r2 | PASS vtx=0.0 IoU=0.841 light=7.8/upper-left a2/r1 | PASS vtx=0.0 IoU=0.808 light=19.4/upper-left a2/r1 | d1: geom=pass, light=flat |
| cafe | LOCK vtx=0.0 IoU=1.000 light=-1.9/flat | FAIL vtx=2.0 IoU=0.853 light=-7.8/flipped a3/r2 | FAIL vtx=7.5 IoU=0.708 light=0.0/flat a3/r2 | BLOCKED | d1: geom=pass, light=flipped; d2: geom=vertex+iou, light=flat; d3: chain predecessor did not pass |
| sikhye | LOCK vtx=0.0 IoU=1.000 light=65.5/upper-left | FAIL vtx=13.5 IoU=0.454 light=8.9/upper-left a3/r2 | PASS vtx=0.5 IoU=0.817 light=55.2/upper-left a2/r1 | FAIL vtx=16.5 IoU=0.381 light=21.3/upper-left a3/r2 | d1: geom=vertex+iou, light=upper-left; d3: geom=vertex+iou, light=upper-left |
| vending_in | LOCK vtx=0.5 IoU=0.576 light=17.9/upper-left | PASS vtx=0.5 IoU=0.582 light=19.6/upper-left a2/r1 | PASS vtx=0.5 IoU=0.632 light=23.2/upper-left a1/r0 | VISUAL-FAIL vtx=0.0 IoU=0.603 light=43.2/upper-left a1/r0 | d3: rear view repeats the product display |
| vending_out | LOCK vtx=0.5 IoU=0.705 light=50.3/upper-left | PASS vtx=1.0 IoU=0.714 light=38.1/upper-left a1/r0 | PASS vtx=0.5 IoU=0.716 light=54.9/upper-left a1/r0 | VISUAL-FAIL vtx=0.0 IoU=0.747 light=70.7/upper-left a2/r1 | d3: rear view repeats the product display |
| info | LOCK vtx=0.5 IoU=0.896 light=25.3/upper-left | PASS vtx=0.5 IoU=0.819 light=25.3/upper-left a1/r0 | PASS vtx=0.5 IoU=0.839 light=31.8/upper-left a1/r0 | VISUAL-FAIL vtx=0.5 IoU=0.834 light=27.2/upper-left a3/r2 | d3: rear view exposes the front awning/service face |
| infirmary | LOCK vtx=0.0 IoU=0.898 light=27.9/upper-left | PASS vtx=0.0 IoU=0.858 light=40.8/upper-left a2/r1 | PASS vtx=0.5 IoU=0.923 light=17.2/upper-left a1/r0 | VISUAL-FAIL vtx=0.5 IoU=0.937 light=29.8/upper-left a1/r0 | d3: rear view repeats the public entrance face |
| rent_kayak | LOCK vtx=0.0 IoU=1.000 light=8.6/upper-left | PASS vtx=0.0 IoU=0.812 light=23.2/upper-left a1/r0 | PASS vtx=0.0 IoU=0.912 light=16.6/upper-left a3/r2 | PASS vtx=1.0 IoU=0.880 light=16.6/upper-left a2/r1 | - |
| rent_pedal | LOCK vtx=0.0 IoU=1.000 light=16.6/upper-left | PASS vtx=0.5 IoU=0.922 light=24.6/upper-left a3/r2 | PASS vtx=1.0 IoU=0.919 light=23.2/upper-left a2/r1 | FAIL vtx=3.0 IoU=0.805 light=15.9/upper-left a3/r2 | d3: geom=vertex, light=upper-left |
| rent_sup | LOCK vtx=0.0 IoU=1.000 light=15.7/upper-left | FAIL vtx=0.5 IoU=0.737 light=22.9/upper-left a3/r2 | FAIL vtx=0.5 IoU=0.748 light=19.9/upper-left a3/r2 | BLOCKED | d1: geom=iou, light=upper-left; d2: geom=iou, light=upper-left; d3: chain predecessor did not pass |
| slide_small | LOCK vtx=2.0 IoU=0.876 light=9.7/upper-left | FAIL vtx=0.0 IoU=0.937 light=1.9/flat a3/r2 | PASS vtx=1.5 IoU=0.897 light=17.5/upper-left a3/r2 | FAIL vtx=0.5 IoU=0.939 light=5.6/flat a3/r2 | d1: geom=pass, light=flat; d3: geom=pass, light=flat |
| slide_large | LOCK vtx=0.0 IoU=1.000 light=19.4/upper-left | FAIL vtx=1.0 IoU=0.946 light=0.0/flat a3/r2 | FAIL vtx=5.5 IoU=0.838 light=29.0/upper-left a3/r2 | BLOCKED | d1: geom=pass, light=flat; d2: geom=vertex+iou, light=upper-left; d3: chain predecessor did not pass |
| slide_tube | LOCK vtx=0.5 IoU=0.911 light=0.0/flat | FAIL vtx=1.5 IoU=0.907 light=0.0/flat a3/r2 | PASS vtx=0.0 IoU=0.929 light=29.0/upper-left a2/r1 | FAIL vtx=0.5 IoU=0.954 light=0.0/flat a3/r2 | d1: geom=pass, light=flat; d3: geom=pass, light=flat |
| diving | LOCK vtx=0.0 IoU=1.000 light=16.9/upper-left | FAIL vtx=2.0 IoU=0.749 light=17.1/upper-left a3/r2 | FAIL vtx=1.0 IoU=0.783 light=8.3/upper-left a3/r2 | BLOCKED | d1: geom=slope+iou, light=upper-left; d2: geom=slope+iou, light=upper-left; d3: chain predecessor did not pass |
| stage_river | LOCK vtx=0.0 IoU=1.000 light=44.6/upper-left | FAIL vtx=17.5 IoU=0.495 light=34.2/upper-left a3/r2 | FAIL vtx=2.5 IoU=0.815 light=35.0/upper-left a3/r2 | BLOCKED | d1: geom=vertex+iou, light=upper-left; d2: geom=vertex+slope+iou, light=upper-left; d3: chain predecessor did not pass |
| dj_booth | LOCK vtx=0.0 IoU=1.000 light=17.5/upper-left | FAIL vtx=22.0 IoU=0.288 light=8.0/upper-left a3/r2 | FAIL vtx=5.5 IoU=0.751 light=7.0/upper-left a3/r2 | BLOCKED | d1: geom=vertex+slope+iou, light=upper-left; d2: geom=vertex+slope+iou, light=upper-left; d3: chain predecessor did not pass |
| arcade | LOCK vtx=0.0 IoU=0.649 light=0.0/flat | FAIL vtx=0.0 IoU=0.648 light=4.9/flat a3/r2 | FAIL vtx=0.5 IoU=0.762 light=0.0/flat a3/r2 | BLOCKED | d1: geom=pass, light=flat; d2: geom=pass, light=flat; d3: chain predecessor did not pass |

## Totals and disposition

- Accepted direction candidates after visual QA: 19/57 (plus 19/19 locked d0 bases).
- Generated direction attempts: 118; rerolls: 69.
- Five automatic d3 passes were moved to `visual-rejected/` because they visibly showed the front/public face from a rear direction.
- Remaining failures exhausted the bounded three-attempt budget or were chain-blocked by a missing accepted d2.
- Palette-off count is zero for every recorded attempt; edge ratios remain recorded in each `accept-N.json` audit file.
- `kairo-gate --geom` and `--light` control checks ran successfully; the unwired live pack still reports its pre-existing 18 geometry warnings and 15 flipped / 16 flat / 1 unmeasurable light warnings.
- Draft rows above use the same geometry and light measurement functions directly, because the contract intentionally remains unwired until all four directions pass.
- Live `assets/generated/kairo/facility__<id>__d*.png` outputs and `facings: 4` wiring were intentionally not installed.

## Artifact paths

- Accepted drafts: `assets/generated/kairo-4dir/accepted/`
- Gate-pass but visually rejected drafts: `assets/generated/kairo-4dir/visual-rejected/`
- Raw images, extracted candidates, prompts, and per-attempt metrics: `assets/generated/kairo-4dir/<id>/<direction>/`
- Nearest-neighbour expanded QA sheets: `assets/generated/kairo-4dir/qa/facilities-4dir-{1,2,3,4}.png`
- Fresh transposed guides: `art-reference/guides/kairo/facility__{ticket,icecream,cafe,sikhye,bungeoppang,slide_large,snow_sled,stage_river,dj_booth}__d1.png`

