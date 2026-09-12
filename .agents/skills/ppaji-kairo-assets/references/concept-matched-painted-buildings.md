# Concept-matched authored buildings

Use for keeping concept color, texture and distinguishing details while constructing a repeatable human-scale facility. The outcome is a warm illustrated/prerender building with stable physical views. It is not a native-pixel-art certification or a universal blue-roof/wood-box template.

## Establish what the reference owns

Inspect the actual concept, not just its filename. Record path/hash, facility-specific versus shared-family role, crop identity if a sheet is used, and known approval scope. A sheet containing a house does not establish an approved bungalow. `approved` in a filename alone is not evidence of scope. If only family reference exists, preserve the palette/material language while declaring the facility geometry a new proposal. Do not silently choose one ambiguous sheet cell as canonical.

Write a small design declaration before modeling:

- **Keep:** concept-defining silhouette, roof form, wall/frame color roles, openings, equipment counts and relative placement that the requested human-scale design can retain.
- **Adapt:** door/counter heights, usable space and proposed footprint needed for the common human scale. State each resulting difference from the concept.
- **Unspecified:** hidden faces and interaction space; keep these explicit proposals.

When refining an existing facility, keep accepted dimensions/anchors unless the request needs them changed. Distinguish structural shell from attached trim; adding a frame is not permission to resize a wall. Log changes rather than relying on identical overall alpha bounds.

## Color, texture and detail that survive actual display size

Use material roles, not a whole-object tint. From the selected concept identify dark/mid/light accents for plaster, wood, roof, base, metal and glass. Compare the rendered material under the fixed camera/light, not only the recipe's hex values. Screenshot backgrounds and antialiased edge pixels must not drive palette sampling.

For warm timber/cream concepts, a useful starting recipe is [painted-building-starting-recipe.json](painted-building-starting-recipe.json). It is a tunable example, not a user-approved palette for all facilities. A red or teal concept retains its own roof colors.

Reuse the geometry-free shared B atlas with object/UV-local coordinates and fixed period in tile units. Keep plaster variation restrained; avoid large muddy blobs. Give wood directional grain, roof repeatable seams, metal discrete dark/light planes and intentional panel edges. Do not put a facade screenshot onto every side or rotate lighting with the root. Keep geometry, texture and lighting responsibility distinct.

A reusable Blender implementation is `scripts/painted_building_materials.py`:

```python
# Import with importlib.util from the chosen skill directory; no project generator required.
recipe = json.load(open(recipe_path))  # copy and adapt palette roles for the given concept
factory = module.material_factory(root, atlas_image, recipe, tile_world)
for obj in authored_meshes:
    module.prepare_authored_mesh(obj)  # closed procedural meshes need consistent outward normals
    module.assign_shared_uv(obj, obj['role'], recipe, tile_world)
    obj.data.materials.clear()
    obj.data.materials.append(factory(obj['role'], 'B', [d/tile_world for d in obj.dimensions], obj.get('curved', False)))
```

Use `module.configure_painted_render(scene, 'color')` for the enlarged preview and
`module.configure_painted_render(scene, 'native')` for native evidence. They preserve the camera and geometry
and lock the existing B treatment: Standard/None, transparent RGBA, 24 samples, no denoising/dither,
768px with filter 1.5 versus 192px with filter 0.01. Pass the project's logical_size/density if different.
A default wide render filter at 192px can erase thin equipment details. Do not assess readability from it
and then report the established native rendering method reproduced.

Apply object scale before assigning UV/materials. `root` must own all geometry; `tile_world` is the actual project scale. Pass the atlas as a loaded Blender image and pack images into the saved scene. The helper supplies material treatment only: it does not generate correct architecture, choose a concept, infer UV intent on complex meshes, or certify art. It runs in Blender, not ordinary Python. The project must supply the actual material-only atlas; it is not bundled with this skill.

Select details by contribution at native scale:

- **Silhouette/structure:** roof thickness, eaves, exposed corner timbers, deep service opening, attached canopy. Keep the declared roof/body ratio.
- **Function:** door surround, counter lip, equipment housing, panel/screen, dispensing slot, gate and guide rail when present in the concept.
- **Small accents:** handles, hinges, jar lids, wood joints and metal caps only where they remain readable.

Thicken an under-readable physical trim consistently across views; do not draw it independently into four PNGs. At the project's 21px human reference, initial main timber widths around 0.10–0.15 tile and secondary frame widths around 0.05–0.09 tile can be trial values. These are examples to judge in native renders, not universal dimensional gates. Never add complexity by inventing unusual roofs or copying decorative rails to every facility. Keep written words/brands off production surfaces.

## Check one rendered view before repeating four directions

The starting palette can render lighter than the reference because the roof receives the brightest ramp band. Render d0 at enlarged and native sizes before completing the other views. Record representative interior patches for the major material roles (source/candidate coordinates, median RGB or luminance) and compare midtones as well as hue. Avoid seams, edge highlights and transparent background. Measurements support the visual comparison; they do not demand pixel equality between different projections or geometry.

Save `d0-style-review.json` with the source/candidate material patches, native-size findings, and changes made before the four-direction render. For an authorized refinement/test, correct observed visual gaps within a small declared iteration budget (for example two local d0 revisions); do not end at the first known weak render solely because geometry tests pass. Exhausted attempts remain a visual failure with evidence, not a PASS.

If a large roof/metal face is visibly washed out, adjust its role palette or the helper's `role_linear_gain`, not the entire scene exposure or the body dimensions. Gain is linear-light, so 0.68 is subtler than multiplying sRGB by 0.68. Keep plaster light and separate from dark timber/metal. Do not report the starting recipe's RGB entries as proof the final render matches the concept.

For a deep service opening, actually construct a recess: a dark inner back, upper/side reveals and an underside shade, with the bright counter lip in front. A black rectangle painted onto a flush cream wall is not equivalent. Check that the interior contrast survives at native size.

Native visibility is required for functional details named in the concept. Gate arms must be distinct from the cabinet and indicator panels from their surround; preserve the correct physical side rather than moving controls to face the camera. When a native detail disappears, revise its physical width, value contrast or surrounding negative space, then rerender d0. Tiny decorative accents may remain secondary. Do not count the presence of a mesh or a legible 768px render as proof of native readability.

## Evidence before claiming success

Render concept / before / candidate comparison, with before and candidate on exactly the same camera, world scale and union canvas. Label the concept as an art reference when its framing/scale differs. Provide native views and enlarged views; detail only visible at 4× is not proof it reads in-game. Render all four actual root rotations, inspect each, and retain natural occlusion of front-only elements.

Check saved-scene reopen, exact camera, protected original hashes, floor dimensions, body/roof bounds, primary landmarks, important counts, pixel clipping and alpha. Re-render the saved scene in another Blender process and compare decoded RGBA pixels. These technical checks are separate from visual judgments of concept similarity. A physically correct plain box must remain an art candidate.

New rails, larger machines or deep trim can affect access: record their local bounds and check against door/counter approaches before adoption. If gameplay use is deferred, state that limitation instead of certifying pathfinding. Material-only work need not create NPC motion or regenerate people.

## Requested black-box skill tests

Use a fresh, isolated evaluation directory. Supply the skill, selected raw concept, material atlas and a compact scale/footprint/access brief. Do not supply the pilot's model, finished renders, detailed modeling script, repair instructions or expected verdict. An independently generated facility, not a copied Blender file or rerun of the pilot, is the observable result.

For a meaningful requested behavioral test, a fresh-context subagent may implement the bounded request while the main agent inspects the pilot. It may read only the supplied inputs and skill; write only into its test directory; no provider calls, live edits or automatic adoption. Record skill/input hashes before dispatch. Inspect the new saved model and four renders against the declaration and concept. Share the comparison and report technical reproducibility and visual similarity separately; a single facility trial does not prove all facilities.

If it fails, change only the reusable rule/helper implicated by the evidence and run a fresh trial. Do not supply the desired answer to the same evaluator and report that correction as an independent pass. Keep unapproved pilot art labeled as a proposal; the user determines whether its appearance is the desired style.
