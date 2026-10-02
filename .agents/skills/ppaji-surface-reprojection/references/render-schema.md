# Render input and verification

`render_surfaces.py spec.json --out generated` reads:

- `version: 1`, `density: 4`, `supersample: 2`, `packed_canvas: [768,768]` (canvas can differ).
- `assets`: objects with unique `id`, canonical `size: [w,d]`, four `frames`, `textures`, `faces`, and `outline_color` RGBA.
- Each frame supplies `left`, `top`: logical image origin relative to the tile origin, derived from the live provider. Keep logical canvas, pad, pivot and anchor authoritative. Do not fit each facing by its alpha bounding box.
- Texture names map to `{file, quad: [[x,y],...four corners], sha256?}`. File paths resolve relative to the specification. Source coordinates are packed source pixels. A supplied hash mismatch stops rendering.
- Faces are planar quadrilaterals `{name, vertices: [[u,v,z],...four corners], material, skip_outline_edges?}`. Material is a texture name or a Pillow color. Vertex order corresponds exactly to source quad order. Omit outline edges only for a semantic reason, such as a curtain fold or a white bevel; never to hide a QA failure.

All four directions use one assembly:

```
d0 (u,v,z)
d1 (v,w-u,z)
d2 (w-u,d-v,z)
d3 (d-v,u,z)
x = 16*(u-v)
y = 8*(u+v)-z
```

Here z is projected logical height. Pixel packing multiplies by density. Rendering uses depth-tested polygons and outlines; RGB is sampled from the original surface. Source painted lighting is preserved and therefore is not physically relit when rotated.

The current helper supports quadrilateral planar faces. Validate planarity and nondegenerate texture quads before rendering. It is not a general mesh renderer and cannot automatically recover geometry or texture landmarks from an arbitrary screenshot.

Outputs include d0–d3 PNGs per asset, face geometry JSON, source-density boards and `surface-lines.json`. The line verifier produces `pixel-line-qa.json` and overlays. Default measurements are RMS ≤0.25 logical px, max residual ≤0.6 logical px, dark-edge coverage ≥90%, on visible long geometry edges. These are diagnostic tolerances, not universal art approval thresholds. Check separate internal painted lines, curved surfaces and unmeasured regions visually.

Meaningful validation includes replaying a reviewed fixture to decoded RGBA equality, deliberately bending a long edge to ensure rejection, source-hash refusal, identical 3D edge lengths after quarter-turns and unchanged runtime registration. Pixel palette proximity alone does not prove texture/style preservation.

Optional `camera_facing: {center:[u,v,z], width, height}` keeps a flat decoration facing the camera while its center rotates. Width/height are logical pixels. This is suitable only for intentionally camera-facing, approximately axisymmetric decorative cutouts. It is not rigid rotation evidence; never use it for a directional tap, handle, seat or other orientation-critical part. Such a trial must remain rejected until replaced with proper geometry or direction-specific artwork.
