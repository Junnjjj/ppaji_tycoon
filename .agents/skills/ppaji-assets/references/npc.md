# Modular 2D NPC creation and motion

Keep the approved original 2D painted/pixel-like character. Reuse base anatomy and pose-specific hair/garment donor regions; preserve face, neck, hands and legs. Use exact role-local palettes and deterministic integer RGBA composition. Whole-body tinting, donor anatomy replacement and mesh/video conversion do not preserve this method.

New raster poses/donors can use the available ImageGen skill with approved identity references; the installed NPC/sprite-gen skills supply extraction and palette tooling when required. Generate one base/pose before expanding wardrobe. Two original diagonal directions plus mirroring support the existing symmetric four facings; asymmetric clothes/accessories need explicit art and checks.

Read the live source/display contract. At the current checkpoint the original64px parts compose into160 physical pixels at density4 for a40 logical cell. Existing54 runtime looks and324 supported combinations remain; do not infer that all combinations have a new UI or that all contacts are certified. Preserve physical-to-logical conversion everywhere: walking, portraits, staff, sitting, lying, swimming, prep/static facilities and moving craft.

For every changed pose, inspect anatomy/head/body ratios at actual display size, visible garment/skin seams, hair alignment and both mirrored directions. Verify protected pixels and every supported combination affected by the change. Cache keys must include all visual inputs, including frame/pose/appearance/facing. A passing atlas matrix does not verify runtime contact.

Pose anchors are semantic: foot, pelvis, lying-body center and waterline are not one universal point. Check seating and backrest clearance, lying occlusion, grip where actual art exists, water ripple/body interpolation, mounting/dismounting direction and paused animation clocks. Rider seats rotate with the16-heading craft; NPC art can remain4-facing. Do not solve a missing straddle/grip pose by stretching the source.

Default expansion is the requested keyposes/minimal motion. Do not implicitly add sit-down/stand-up transitions or skeletal animation. The current main handover explicitly leaves dedicated straddle/grip/wakeboard poses and exhaustive all-equipment contact certification outside prior acceptance. Report exact coverage.
