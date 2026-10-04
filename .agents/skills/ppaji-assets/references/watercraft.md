# Moving watercraft and riders

Start from live equipment identity, capacity, craft manifest, seats and depth renderer. Course-following boats/towables use **h00–h15 at 22.5 degrees**; d0–d3 or four cardinals are only a pilot subset. The cardinal headings are h00/h04/h08/h12. NPC pose art may have four facings without reducing the vehicle to four headings.

For new authored shape/style pilots, reuse one editable physical model and accepted shared painted materials. For an explicitly chosen provider/image-to-mesh baseline, retain that method and its approved source; do not silently substitute an authored model. Consult the installed legacy watercraft skill's physical/provider references and current `docs/assets/pipelines/watercraft.md` for those operations. Do not copy hypothetical provider credentials or submit extra paid work just to complete a local test.

The current physical contract uses game +I=Blender+X, game+J=Blender−Y, height=+Z; orthographic yaw45/pitch-down30/roll0 (Blender Euler60,0,45). Canonical forward is game+J; root Z rotation h*22.5 maps h00/h04/h08/h12 to screen lower-left/lower-right/upper-right/upper-left. Verify against the current runtime and actual render before labeling a heading.

Keep camera/light/canvas/scale/root/waterline fixed, rotate all components and seats together, and render matching depth for every heading. Check all16, not only the cardinal subset: asymmetric parts, heading wrap, silhouettes, clipping, waterline, actual rider contacts, overlap/occlusion, capacity and motion interpolation. `craftHeading` selects16; current `craftFacing` chooses the nearest NPC facing. This mapping is not evidence of dedicated16-direction NPC art.

A geometry/motion preview does not certify new straddle, handle grip or wakeboard poses. Use the NPC reference for those; state missing pose work. Report image/depth/seat completeness and visible motion/rider evidence separately. Never invent GLB/provider success, hidden geometry recovery or all16-heading review from four images.

At the current checkpoint, the default visible craft can come from the separate `imagegenArt` 4× WebP heading provider, while native PNG/depth supplies depth geometry and fallback. Audit both registrations: replacing only native PNGs need not change the visible craft. A standalone native pack also requires depth-origin metadata; a one-craft overlay must retain the rest of the catalog. Verify the selected live provider rather than assuming the file you edited is displayed.
