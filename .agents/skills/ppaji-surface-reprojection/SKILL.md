---
name: ppaji-surface-reprojection
description: Correct Ppaji facility sprite angles and rotating placement by reusing original painted surfaces on one canonical textured assembly. Use for planar cabinets, partitions, stalls and roofs whose four facings have bent lines or mismatched parts, especially when the user wants the original ImageGen look without Blender. Includes pixel-line QA and continuous grid/map review.
---

# Painted surface reprojection

Preserve the original art while fixing the geometric relationships. Extract actual painted faces from immutable source images, attach them to one declared assembly, rotate the assembly, then inspect the saved pixels and actual game placement. This is an authored textured-geometry method implemented in Python/Pillow, not an ImageGen redraw or a screen-space warp.

Use this for predominantly planar facilities. Curved hoses, sculpted objects, complex silhouettes and opaque occlusions need additional geometry or faithful cutouts; do not replace them with boxes just to finish. Keep the user's approved scope and direction exceptions (for example, a direction they explicitly preferred as original).

## Workflow

1. Read the repository's current asset status, live provider registration and the relevant survey. Preserve source images, hashes, original framing, footprint, pivot, anchor and density. Do not mistake old survey signals for current measurements.
2. Inspect enlarged originals and same-scale d0–d3 grid views. Inventory identity-critical parts and colors; annotate source quadrilaterals on actual surfaces. Separate angle, geometry, placement, scale and shading problems. A cabinet strip can occupy one edge of its reserved footprint: rotate its offset and empty space, never recenter it automatically.
3. Author one local assembly with surface textures. Read [the render schema](references/render-schema.md). Keep vertex order and texture coordinates corresponding. Inspect texture crops for background, adjacent faces, painted-in shadows and cut-off frames. Reuse complete wood borders and original highlights where possible. Explicitly identify the source for hidden faces; do not invent unseen details and present them as observed.
4. Render all four directions with `scripts/render_surfaces.py SPEC --out OUT`. Runtime density is 4, with 2× supersampling for geometric boundaries. Geometry uses tile units in u/v and logical screen pixels in z. This is a pipeline convention, not a Blender physical-unit calibration.
5. Inspect output at source density and actual game scale. Iterate on concrete faults: bent lines, seams, extra/missing parts, door direction, occluded seats, texture contamination, weak outlines, excessive sharpness and changed cute proportions. The original approval example and failure history are in [the case study](references/locker-changing-case.md).
6. Run `scripts/verify_lines.py OUT --spec SPEC`. Check its line coverage and test count, not only exit status. Separately verify cyclic landmarks, unchanged edge lengths, component count, clipping, rotated contact footprint and original palette. Long straight edges passing does not certify short details, intentional curves, lighting or appearance.
7. Present each facility as original four directions → candidate four directions on the same floor grid → visible-line overlays → actual renderer map image. Use one scrolling report; no mandatory dropdown/detail navigation. Show Tailscale links when available. Record failures, remaining differences and user feedback.

## Quality and adoption

A requested 95-point target is a review rubric, not an objective correctness percentage. Declare the rubric and hard failures before rating, keep subjective appearance separate, and do not tune thresholds or exclude failing landmarks merely to reach 95. An obvious bend, wrong part, bad crop or visibly altered identity fails regardless of total score. User rejection invalidates that candidate; preserve the evidence and restore the approved baseline.

No fabricated certification: this renderer proves its own declared assembly's rotation, not that the assembly is an exact recovered original or that a separate Blender contract passed. In Ppaji, a user-selected non-Blender route can be evaluated on its own evidence. Keep approval of the method separate from approval of each replacement.

On authorized adoption, use the actual running game's asset system (do not assume an obsolete atlas workflow). Stage replacements, back up current files and manifests, preserve dimensions/anchors, verify decoded pixels, update hashes/cache-sensitive filenames if needed, then run relevant contract checks and inspect actual HTTP-loaded frames. Adopt only authorized reviewed assets; other findings remain candidates. Do not require the user to repeat authorization already provided.

Dependencies: Python 3, Pillow, NumPy. Use a task venv if missing; do not change global system Python. Scripts accept paths and do not assume a machine-specific checkout.
