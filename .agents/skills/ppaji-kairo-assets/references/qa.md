# Candidate QA and adoption

Read [physical-direction-validation.md](physical-direction-validation.md) before judging d0-d3. A
prompt-only four-up sheet has no physical rotation authority and cannot receive directional PASS.

## 1. Required authority gate

Before visual scoring, require:

- one approved concept path and hash;
- one declared geometry state and complete physical root;
- exact d0/d1/d2/d3 root-yaw metadata at `0/90/180/270`;
- four corresponding fixed-camera physical renders;
- projection, landmark-correspondence and visual-review records.

If any item is missing, report `UNVERIFIABLE_NO_PHYSICAL_ROOT` or the narrower missing-evidence state.
Do not continue to PASS/CONDITIONAL.

## 2. Manual topology gate — authoritative

Create a component table before judging beauty. For every d0–d3 cell record:

- main mass count;
- repeated module count and order;
- direction-marker screen end/side;
- marker relationship to the neighboring module;
- front-only and rear-only details;
- rail openings, attachment points, support intersections, and occlusion.

Reject the set if any component is moved, duplicated, removed, bent, or redesigned to remain visible. Natural occlusion is correct. A rear view that repeats a public counter, product display, entrance, or stage front is a failure.

The failed diving-platform pilot is the regression example: overall area and height were stable, but the ladder moved toward the visible front, the board attachment changed, and rail/brace topology drifted. It is a `FAIL`, not a cleanup candidate.

## 3. Direction gate

For an object with one marked front end, require:

| View | Marker position |
|---|---|
| d0 | screen lower-left |
| d1 | screen lower-right |
| d2 | screen upper-right |
| d3 | screen upper-left |

For a marked side rather than end, write the equivalent side mapping explicitly before inspection. Do not infer it after seeing the generated result.

The marker table is checked against the physical root and transformed local landmark, not against a
plausible four-panel composition. Require visible cyclic movement of asymmetric landmarks and exact
front/rear semantics.

## 4. Projection gate

Run the calibrated signed-edge diagnostic:

```bash
python3 <skill-directory>/scripts/qa_projection.py --selftest
python3 <skill-directory>/scripts/qa_projection.py --layout single <physical-direction.png>
```

The selftest and engine-derived positive control must pass. Every required direction must contain the
`±26.565°` ground-edge families and 90° vertical family within the validator's stated tolerance. A
projection PASS is supporting evidence only; exact Blender camera metadata remains required.

## 5. Occupancy measurement gate — supporting evidence only

Run:

```bash
python3 <skill-directory>/scripts/qa_4up.py path/to/raw-4dir.png
```

Record per-cell foreground bounding boxes and foreground-pixel counts. Large unexplained deviations indicate failure, but small deviation does not indicate success. The known failed diving sheet has an area spread below 1%, proving why manual topology remains authoritative.

Exit code zero from `qa_4up.py` means the canvas was parsed and measured. It must never populate a
semantic, projection, rotation, or production PASS field.

## 6. Palette and scene gate

- Water assets should read as Korean ppaji through cobalt, fluorescent lime, safety yellow, turquoise, white highlights, and navy outlines.
- Reject imported scenery, water surfaces, people, tents, labels, logos, ground diamonds, footprint slabs, or cast shadows.
- Keep screen-upper-left lighting fixed; do not rotate or mirror the shading with the object.
- For global-release facilities, reject readable language, alphabetic or numeric strings, brands and
  generated fake glyph-like marks on the asset surface. Accept simple pictograms only when the facility is
  still understandable from structure and equipment. OCR may support the check but cannot replace manual
  review. Concept-sheet labels pass only when they are outside the crop and absent from production inputs.
- Read [ground-contact-and-floor-mode.md](ground-contact-and-floor-mode.md) when the candidate contains a
  floor, foundation, slab, plinth, mat, deck or broad ground-contact component. Require one declared floor
  mode and reject partial or direction-dependent bases. A class-sheet floor presentation PASS does not prove
  physical floor coverage.

## 7. Raw-candidate disposition

- `PASS`: physical-root rotation, projection, rigid topology, marker correspondence, silhouette and
  palette all have required evidence. May proceed to post-processing.
- `CONDITIONAL`: topology is correct but small seam/highlight pixels require normalization. May proceed only if the fix is local and deterministic.
- `FAIL`: component relocation, topology change, wrong rear semantics, projection error, or material/identity mismatch. Do not spend time on alpha extraction or palette cleanup.
- `UNVERIFIABLE_NO_PHYSICAL_ROOT`: a plausible generated direction set exists but cannot prove one
  rotated object. Treat it as concept evidence only.

Any user visual rejection sets the complete required package to `FAIL_USER_VISUAL_REJECTION` and
invalidates earlier overall PASS counts. Persist the issue in `visual-review.json`.

## 8. Production adoption

Only after user acceptance:

1. preserve the raw, prompt, and QA;
2. extract cells and remove chroma without cutting outlines;
3. normalize only local seam/highlight drift—never reshape a failed structure;
4. downscale with nearest-neighbor and quantize through the project's existing palette tooling;
5. align to the exact canvas, footprint guide, and anchor in `src/assets/kairo-render-contract.json`;
6. run the existing geometry, rotation, atlas, and runtime verification documented in
   `docs/assets/contracts/four-direction.md` and the current repository scripts; use
   `docs/assets/maintenance/legacy-v2-regeneration.md` only for an explicitly scoped V2 ground/light repair;
7. adopt a directional facility atomically: all required d0–d3 images and data/atlas wiring in one approved change.

For the Ppaji V4 workspace, the verified deterministic sequence is:

```bash
python3 tools/process-kairo-v4-fourup.py --all --force
npx tsx tools/repair-kairo-v4-light.ts --apply
npx tsx tools/verify-kairo-v4.ts --strict
npm run bake:atlas -- --density 2
npm run gate
npm run verify
PPAJI_URL=http://127.0.0.1:<current-workspace-port> npm run verify:kairo
npm run build
```

Start the browser server from the current workspace. Do not reuse a sibling worktree's dev server: source-contract imports come from the current checkout while the browser would serve stale code and assets, producing invalid mixed-version results.

V4 mat-free sprites use `tools/kairo-v4-contact.ts` for contact and paired scale. The legacy full-diamond footprint geometry remains diagnostic only. Non-`upper-left` light results pass only when the exact ID, direction, and verdict appear in `tools/kairo-v4-light-contract.ts` with a structural reason.

Do not overwrite the current accepted pack during pilots. The workspace may contain an unfinished V2 migration; preserve unrelated modifications and inspect `git status` before live adoption.
