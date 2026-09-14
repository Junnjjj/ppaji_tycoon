# Café candidate QA

Review candidate only. Technical reproducibility passes; user art, roof, footprint and runtime acceptance are pending.

- Frozen engine calibration: positive PASS, intentionally wrong elevation FAIL.
- Saved packed scene reopened in separate Blender processes; all 8 color/native RGBA comparisons exact.
- Complete origin root: 328 meshes. Camera Euler 60/0/45, ortho 192, root rotations 0/90/180/270. Fixed lighting.
- Inventory: one each door, counter, machine, case, right window, awning. Semantic selectors name assembly anchor meshes; equipment subparts are also root-owned.
- Exact integral 3x2 floor, z 0–.09. Structural body bounds [[-1.4299999475479126, -0.9199999570846558, 0.0899999588727951], [1.4299999475479126, 0.9199999570846558, 2.2199997901916504]]. Roof bounds [[-1.5704998970031738, -1.0529890060424805, 1.6272608041763306], [1.5744999647140503, 1.0529890060424805, 2.3445000648498535]].
- Roof overhang beyond canonical floor: left 0.0705, right 0.0745, front 0.0530, back 0.0530 tiles. Front awning reaches -1.1915 Y; door approach is outside canopy X interval.
- Native foreground pixels: 4481, 4495, 4481, 4491; minimum declared 3500, no clipping on 8 images.
- Atlas packed; frozen runner protects scene and concept hashes. Source/model scripts and two local correction logs retained.
- Raster projection diagnostics: d0 FAIL (-14.815° negative edge peak, 84.25° vertical peak); d3 FAIL (81° vertical peak); d1/d2 PASS. These are not silently changed. Exact scene matrix/known foundation edge projection passes required ±26.565°/90° in all views; see geometry-projection-check.json and overlays.

## Visual limitations

Concept palette and functional arrangement survive, but model is cleaner and more rectangular. Native case/machine distinction is visible; individual cups, handles and interior jars remain partial or subpixel. Roof/awning candidate patch medians remain lighter than source; cream side is darker. Hidden rear/left closure is a proposal. No scene change, third correction or blanket visual PASS is made after the two-correction budget.

Actual map fit, gameplay access, family-scale comparison and user acceptance remain untested. No providers, labels/NPCs or live modifications.
