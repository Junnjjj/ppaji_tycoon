# Compact authored review route

For one authored material-preview candidate with a supplied concept, material atlas and numeric brief, this is the self-contained execution route. Do not preload provider, extraction, live adoption, NPC or archived project documents. Read project CURRENT only to resolve missing current scope; an isolated test's supplied brief replaces unavailable project context. Production adoption still requires the full project gates.

## Preserve the visual and physical contract

Inspect the actual concept. Declare Keep / Adapt / Unspecified, reference role and hash; a filename does not prove approval. Retain its roof form, material colors, functional openings/counts and physical sides. Hidden faces are proposals. Existing accepted geometry changes require explicit recording. Measure doors and fixtures relative to the supplied opaque human height, not sprite-cell size.

One origin root owns all meshes. Fixed orthographic camera Euler XYZ (60,0,45), position target + (.612372435696,-.612372435696,.5)*distance, target z from brief; +I=+X,+J=-Y. Camera and lighting do not rotate with the root. Use the given world tile, ortho scale and canvas without per-view fitting. Record floor/body/roof bounds separately; full-footprint-integral floor covers the exact declared placement; transparent-no-floor has no presentation slab. Simple roofs and functional architecture, no NPCs or written branding baked into art. Pictograms allowed. Declare access side/anchors; gameplay remains deferred unless requested.

Read `concept-matched-painted-buildings.md` for the material/style workflow, then import `scripts/painted_building_materials.py` rather than rewriting it. Apply mesh scale, fix outward normals, use the supplied packed geometry-free atlas and role-specific palettes. Its example palette is not a universal building template.

## Deterministic runner (do not rewrite its implementation)

Requires Blender plus a host Python with Pillow. Write a small `review-contract.json` beside the model; paths resolve relative to that JSON. Example schema (replace object names and numbers with the actual brief/design):

```json
{
  "blend":"facility.blend", "concept":"../concept.png", "root":"FacilityRoot",
  "tile_world":22.62741699796952, "ortho_scale":192, "camera_target_z_tiles":0.6,
  "logical_size":192, "density":4, "size":[2,2],
  "floor_mode":"full-footprint-integral", "minimum_native_foreground":2000,
  "inventory":{"doors":{"prefix":"DoorLeaf_","count":2}},
  "groups":{"floor":{"names":["Foundation"]},"body":{"names":["Shell"]},"roof":{"prefix":"Roof_"}},
  "landmarks":{"entry":[0,-1,0]}
}
```

Inventory selectors count actual mesh objects, not declared capacity. Each bounds group selects all relevant structural pieces, excluding incidental trim. Use names or prefix, never an empty broad prefix. Visible-mass minimum is a declared review threshold, not proof of scale or permission to resize. The runner supports static unconstrained scenes; articulated/animated facilities require the detailed physical-direction route.

Run commands using absolute skill/tool paths and fresh output folders:

```bash
python <skill>/scripts/authored_review.py --contract review-contract.json --out calibration --blender <blender> --calibrate
# Above runs engine positive/negative projection controls; can run before model exists.
# Build and save packed facility.blend (your model script need not render).
python <skill>/scripts/authored_review.py --contract review-contract.json --out pilot --blender <blender> --pilot
# Inspect d0 color/native with concept; record d0-style-review.json and material patch medians.
# Up to two meaningful local corrections if needed, then full output:
python <skill>/scripts/authored_review.py --contract review-contract.json --out review --blender <blender>
```

Full mode renders both resolutions at all four root rotations, reopens/rerenders in another process, checks exact RGBA, alpha/clipping, visible mass, camera/root, texture packing, floor/counts/bounds, and projects landmarks. It retains projection diagnostics and produces `summary.json`, detailed JSON, `review.html`, and native four-view board. It never changes the source blend or publishes a server. Read summary and inspect all views; open detailed logs only for failures. Use the existing review HTML and serve only its review directory for remote requests, rather than rebuilding a page. Pair before/candidate at identical canvas scale if comparing to an existing asset.

Automatic checks do not establish semantic selector correctness, hidden-side plausibility, occlusion, art similarity, family fit or access usability. Inspect those visually, use detailed references only when needed, and retain warnings. No blanket artist/runtime approval. Requested fresh-context black-box trials receive only this skill plus raw concept/atlas/brief, never old models/scripts/renders. Ordinary production does not need repeated black-box trials unless requested or a material skill change warrants one.
