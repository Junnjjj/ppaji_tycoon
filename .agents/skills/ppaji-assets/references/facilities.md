# Fixed facilities and scenery

The current accepted replacement method authors a canonical local assembly: roofs, posts, benches, hoses, rounded vests and openings retain their mutual geometry while the whole structure rotates. Warm painted materials and small rounded value changes preserve the reference character. This may use the Python/Pillow surface renderer; Blender is optional. The earlier planar reprojection route is still appropriate when actual source face textures can be reused faithfully. Neither route recovers unseen original geometry automatically.

## Structure, style and registration

- Inventory silhouette, counts, colors, thick/thin ratios, post spacing, roof overhang, seat/back angle and front/rear semantics from enlarged originals. Do not turn a curved dryer, hose or lifejacket into a box; use appropriate profile/mesh or faithful supported artwork.
- Rotation is shared for every vertex, material coordinate and part. No per-direction recentering, shearing, piecewise screen warp or camera-facing directional handles. An off-center locker rotates its occupied strip and reserved empty space together.
- Preserve live canvas, density, footprint, image origin and anchor. In the current Python facility convention, u/v are tile units and z is logical screen height: `x=16*(u-v)`, `y=8*(u+v)-z`. Quarter turns for size[w,d] are `(u,v)`, `(v,w-u)`, `(w-u,d-v)`, `(d-v,u)`. This differs from Blender physical camera calibration; do not claim one proves the other.
- Current facility packing is density4, geometry supersampling2. Final 2-packed-pixel line coverage and selected fine 1px details retain full-resolution painted RGB. Inspect diagonal stair rhythm, internal lines, rounded shading and actual-size legibility. Uniform RGB downsampling is not equivalent.
- Preserve recorded user exceptions. The current adopted set retains original 붕어빵 d1 and earlier accepted locker/changing-room outputs. Do not overwrite these merely to force a batch to one recipe.

## Portable accepted seed

Copy `assets/facility-seed/` to a **fresh** writable directory. Python needs Pillow and NumPy; use an existing suitable venv or a task venv, not global dependency changes.

```
python /new/run/recipe/render.py /new/run/recipe/surface-spec.json --out /new/run/candidate
```

The seed is the dry room with two framed mirrors, two cylindrical dryers, four legs and one counter. All four frames use the same assembly. `materials.py` and `line_finish.py` are recipe-specific, not general-purpose style APIs. `provenance.json` records source file hashes and prior output RGBA hashes; a replay can compare decoded pixels. Copy before adapting names, geometry or materials. The original spec and baseline hashes should remain available alongside revisions.

Faces have `name`, four `vertices`, `material`, optional `shade` per direction and outline metadata. A triangle repeats its first vertex in position4; this renderer supports that convention. Real texture entries have file/quad and optional SHA; a SHA mismatch must fail. This seed has no external texture dependency. Four `frames` carry immutable runtime origins; `packed_canvas` and density govern physical pixels. The renderer emits saved PNGs and geometry/visible-line diagnostics. It does **not** perform complete quality certification. In the bundled seed, `skip_outline_edges` means all four `visible_lines` lists are empty: zero measured edges is **unmeasured**, never a line-QA PASS. Its built-in surface board crops/recenters images and has no grid, so build origin-derived grid boards separately for registration review; do not use that cropped board as placement evidence.

This recipe is a starter for ordinary opaque facilities. General transparent shells, multi-module material transforms and curved complex structures need their tested family renderer; inspect those dependencies rather than pretending this seed covers them.

## Checks

Check cyclic landmarks/part identity, lengths after rotation, closed components, intended contacts and openings, clipping, palette, source-size ratios and saved-pixel connectivity. AABB overlap is only a coarse contact diagnostic. Inspect internal painted lines separately from generated boundaries. Report visible measured edges and short/occluded unmeasured details explicitly. The old surface `verify_lines.py` is a planar painted-edge diagnostic with its own assumptions; do not force its thresholds onto a different line-finish recipe.

A full-render replay proves reproducibility of an existing assembly. A novel shape/style candidate additionally needs source comparison and game placement; report those separately. For a new facility, adapt the canonical seed/closest approved family, render and inspect d0–d3, then complete the shared review loop.
