# Reviewed Ppaji case, 2026-10-02

Repository evidence: `assets/generated/kairo-v4-simple-pilot/locker-changing-line-review-20261002/` contains `surface-spec.json`, `surface-render.py`, `verify-pixels.py`, `verify-assembly.py`, original/candidate grid report, map captures and QA JSON. Source originals live in sibling `angle-survey-20261002/full-images/`. Resolve these from the current repository; do not hardcode the original developer's home directory. A historical report was served at `http://100.114.231.15:62140/line-review/`; confirm the current server rather than assuming it still runs.

The user rejected central placement and two-column screen warping for compact_locker / compact_changing. A piecewise warp can bend a wall that crosses its arbitrary seam even when two ground edges are numerically correct. Whole-image affine correction avoids new seams but leaves source-specific angle differences and inconsistent parts.

The accepted replacement method uses original surface samples on one assembly: four locker banks with two doors each; three changing-room partitions, rear wall, two seats, two curtain entrances and rails. Rotate the locker strip's offset and empty footprint together. Seats stay at the closed end rather than moving toward the camera in a rear image. This changes some inconsistent original facing details; disclose that correction.

Iterations corrected missing/delicate outlines, occluded seats, source curtains contaminated by the neighboring wall, clipped wood frames, jagged bottom texture bands and raster edge sampling. Straightness was checked on 158 deduplicated long visible edges: maximum RMS 0.127 logical px, maximum residual 0.505 logical px. These are results for that candidate, never inherited by a new asset.

The 95/100 internal score included subjective appearance and did not itself authorize adoption. The subsequent user said the result was good and requested a reusable skill and application of the investigated fixes. Preserve that conversational authorization for these reviewed outputs without treating it as acceptance of unseen replacements.

## Broader survey lesson

The expanded 100-facility screen separated planar buildings (20), planar-part assemblies (27), assembly-first cases (15), mixed curved objects (32), and organic shapes to preserve (6). These are method routes, not pass counts. Twelve additional trials passed their measured long-edge checks but several still failed appearance review: cropped taps, flat directional urn cutouts, missing grill handles, thin table edges, or wrong side seams. Record such failures as held, even when every numerical edge check passes. Only the two user-accepted facilities were adopted in main commit `6ef64e9`; 392 of 400 surveyed packed source frames remained unchanged.
