# Toilet skill black-box candidate

One fresh authored model using only the supplied concept, brief, atlas and frozen skill. No providers, game edits or external model inputs. All meshes belong to FacilityRoot and the atlas is packed in toilet.blend.

The 2x2 integral foundation is exact; wall coverage is 0.93 on both axes. Flat roof is 2.08x2.08 tiles, top 2.065 tiles. Door leaves are 1.28 tiles tall (door surround 1.40), compared with H=1.07165. The declared nominal 1.36 door height is the design envelope, not the measured leaf height. Hidden rear/left faces are explicit closed-wall proposals.

Four untouched 768 renders and four directly rendered native 192 images use the supplied camera and 0/90/180/270 root yaw. Independent Blender reopening checks hierarchy, camera, counts, packed images, and rerenders all eight images; decoded RGBA equality is in rgba-reproducibility.json. Projection diagnostics and positive/negative controls are in projection-validation.json. Controls were run after construction rather than before.

Visual judgment: main palette, flat parapet, two contrasting doors, tiled dado, clerestories and side vent are preserved. Atlas variation is subtle. Regular geometry and fine seams are cleaner than the painted concept; micro pictograms are only small white cues at native size. No corrections were needed for the requested practical detail level. No independent artist approval is claimed.

Review-only states: PHYSICAL_DIRECTIONS_USER_REVIEW, ROOF_PROPORTION_USER_REVIEW and HUMAN_SCALE_PROPOSAL_USER_REVIEW. Family assets and game/NPC evidence were excluded by black-box isolation; runtime and gameplay use remain unvalidated.

Projection qualification: d0 image-line detection is WARN (vertical 87.75°, error 2.25°); both signed ground diagonals pass. d1–d3 pass. Analytic projection from independently reopened camera proves screen steps I=(16,8), J=(-16,8) and true vertical 90°. The detector warning is retained and no unqualified package PASS is claimed.
