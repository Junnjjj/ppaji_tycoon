# Water slides — plastic refinement handover

2026-10-03, dispatch ctx_d5efc504062c. **Complete scoped structural/line/refinement QA PASS** after correcting geometric edge selection for all beveled floats. The refined16candidate PNGs are pixel-identical to the prior dispatch; no geometry, material, registration or tolerance changes. No art95, exact collision or runtime acceptance claim. `main_modified:false`; only this pack changed. Previous full candidate set, boards, spec, scripts, QA and handover are preserved in `rejected-thin-plastic/`.

## Concrete improvements

- Blue floats: physical depth2.8→5.2logical pixels, darker blue sidewalls, continuous tile seams on sides and stronger rounded upper bevel highlights. Top remains z2.8 and bottom extends to z−2.4; slide/step/contact heights are unchanged. Coordinator should inspect new underwater depth on actual water maps.
- Green cylindrical tower posts: radius2.55→3.85physical units (51%wider). ppaji arch posts changed from narrow square columns to radius4.2rounded columns, and rounded crown radius2.9→4.2. Its yellow cap now paints actual crown-top surfaces, avoiding an embedded cap invisible behind the thickened crown.
- Yellow tower handles: radius1→1.7, with center lowered0.7 so upper envelope stays exactly unchanged. Openings remain open. Small dock grips radius0.52→0.95.
- Green curved rails: bright pale-green top crown, intermediate shoulder highlight, dark green side/underside shading, all on the same closed continuous curve geometry.
- Yellow beds: broad subtle pale-yellow transverse bands at shared curve t≈0.18and0.84; no white stripes, screen-space overlays or timber grain. Saved-image bed-band pixels are verified brighter than intervening yellow, in unobstructed views.

## Files and integration

Pack `water-slides-batch-20261003`. IDs `ppaji_slide`, `module_rig_slide`, `module_rig_mini_slide`, `module_rig_slidedock`; each has `candidates/ID/d0.png`–`d3.png`. `review.json` uses existing scoped-renderer schema with original frames and selected candidate paths. `surface-spec.json` rotates one canonical assembly per asset. Density4, canvas1024²for ppaji and512²for others; footprints8×6,2×3,2×2,3×1respectively. Original per-facing left/top, pivot, size, canvas and canonical upper heights are unchanged versus rejected-thin-plastic spec, checked numerically. No metadata or per-facing fitted geometry changes.

`index.html` scrolls through original/candidate/line-overlay registered floor boards. `*-registered-board.png` uses full unclipped canvases at the same scale; `candidates/*-surface-board.png` is detail-only. All16original facings and final16same-scale candidate facings were viewed with view_image. `candidate-hashes.json` contains final16PNG hashes. `source-hashes.json` protects immutable source inputs. `visual-review.json` records current review/QA limitations.

## Validation and honest remaining evidence

`refinement-qa.json` PASS: unchanged registrations/footprints/canvases/upper heights,5.2depth on every float, and8unobstructed saved-image view checks covering16pale bands. Dock d1 sampling was obstructed by the near green rail; that failed observation is recorded in `refinement-band-occlusion.md`, and d0/d3unobstructed bed pixels are tested instead.

`verification.json`: PASS across all assets:81closed parts,112contacts,328actual bed/rail seam samples, explicit entry/exit contacts, connected contact graphs, exact quarter-turn edge invariance,16single-component saved alpha masks and no clipping.21saved-pixel base lines PASS,0FAIL,59short/occluded/joined lines unmeasured. Curved rails/beds and sloping handrails are not horizontal iso-line candidates. AABB contacts are not exact collision certification.

The previous failure was a **sampler geometry error**: footprint AABB corners were treated as real float corners although the mesh has0.045tile chamfers. For ppaji d0 tower-float, projected AABB span is21.76px but actual straight mesh span is16px (2.88px chamfer removed at each end). Old14samples included the bevel/corner flat run in the2px coverage outline. The actual middle saved raster has regular4px horizontal/2px vertical staircase runs; no bent authored straight segment was found.

Sampler now finds collinear ground edges from the named float's actual closed mesh, selects the longest real segment, and runs unchanged criteria globally: minimum projected span20px, minimum12samples,90%coverage/exposure, slope error≤0.04, RMS≤1.5px and outline-adjusted offset≤1.5px. The16px edge is **unmeasured**, not asserted PASS; the same correction reclassifies other sub20px beveled edges. No failing edge-specific exemption, shape shift, material or pixel edit was used.21eligible saved lines pass, and all81closed meshes retain exact quarter-turn edge lengths including the unmeasured short pieces.

Evidence: `pre-bevel-sampler-verification.json`, `pre-bevel-sampler-verify.py`, original `refinement-first-line-failure.json`, `short-line-failure-raw.png`, `short-line-failure-closeup.png`, `short-line-corrected-exposure.png`, and machine-readable `short-line-diagnostic.json`. Original failure is preserved rather than overwritten. Final boards include actual-mesh line overlays and the report directly shows the corrected close-up. Final candidate hashes match every hash from prior refined delivery.

Source differences remain: ppaji's four original facings contradict deck aspect/tower relation and curvature, so the fixed source-d0-inspired assembly cannot match all silhouettes; mini remains somewhat narrower, and dock somewhat wider. Curved rail facets and broad plastic illumination are authored interpretation, not exact source3D or original-pixel recovery. Actual floor/water review and adoption remain coordinator-owned.

## Reproduce

From this pack directory:

```sh
/tmp/ppaji-angle-survey-venv/bin/python build.py
/tmp/ppaji-angle-survey-venv/bin/python render.py surface-spec.json --out candidates
/tmp/ppaji-angle-survey-venv/bin/python verify.py
/tmp/ppaji-angle-survey-venv/bin/python verify-refinement.py
/tmp/ppaji-angle-survey-venv/bin/python build-report.py
```

Expected verify.py exit0 and verify-refinement.py exit0. No candidate rerender is needed for this sampler-only change; reproducible rendering commands remain supplied above. Build resets review state, so do not run after adoption without preserving coordinator metadata. Full-resolution RGB retained, line/coverage-only2packedpxfinish. Geometry/material/render helpers are local to this pack, with immutable sibling source reads only.
