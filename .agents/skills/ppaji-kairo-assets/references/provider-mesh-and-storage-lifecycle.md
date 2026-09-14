# Provider mesh and storage lifecycle

Read this reference before a paid image-to-mesh call and when generated facility packages consume enough
disk space to require cleanup. The objective is to preserve auditable authorities while removing only
regenerable or byte-identical redundancy.

## Separate provider success from geometry approval

A provider `PASS` means that the validated adapter submitted the exact hashed input and received a real,
non-empty mesh with a recorded hash. It does not approve its topology, hidden faces, projection, footprint,
access semantics or art quality. Import the complete hierarchy, preserve the provider GLB read-only, render
all four provider-local yaw probes, and stop at `DENSE_BASELINE_UNREVIEWED` until the user reviews d0.

Concept-versus-dense silhouette metrics are diagnostic at this gate. They may reveal wrong depth or mass,
but they are not the later strict-color silhouette gate. If the user accepts the topology, record that
decision while keeping footprint fit, depth proportion and runtime scale as separate open checks. Never use
non-uniform scaling to hide a provider aspect error.

## Immutable keep-set

Keep these files for every submitted provider attempt:

- approved input, approval record and SHA-256;
- request parameters, adapter path/hash, redacted provider response and task identifier;
- the original provider GLB, non-empty, hashed and mode `0444`;
- typed provider failure or user-rejection record when applicable;
- the selected physical root and exact fixed-camera/render metadata once a candidate advances;
- compact review boards and manifests required to understand the decision lineage.

Do not delete a rejected provider GLB merely because a replacement looks better. It is billing and failure
evidence. Archive it outside active review instead.

## Safe cleanup candidates

Cleanup may remove only files that are either byte-identical to a preserved authority or reproducible from
preserved inputs and are not referenced as required evidence. Typical candidates are:

- Blender automatic backups such as `*.blend1` and `*.blend2` after the primary `.blend` opens successfully;
- caches, temporary downloads, zero-byte files and obsolete local render caches;
- byte-identical duplicate exports after one authoritative path and all referring manifests are updated;
- a superseded working `.blend` only after a successor physical-root file has been independently reopened,
  its hierarchy/root/camera hashes are recorded, and the successor is the declared authority.

Source-yaw probe images, provider originals, rejected comparison evidence, corresponding-direction physical
renders, ImageGen provider originals, and files named by current JSON manifests are not disposable caches.
Lossy recompression is not a cleanup substitute for required pixel evidence.

## Cleanup procedure

1. Measure the package and list large files before deletion.
2. Resolve each exact target; never delete through a broad root, unresolved variable or recursive glob.
3. Verify the authoritative successor or matching SHA-256 and search manifests for references.
4. Delete only the confirmed redundant target and record its byte count and recoverability.
5. Re-run JSON/hash/reopen validation for the active package.
6. Save `storage-cleanup.json` with removed paths, reasons, bytes reclaimed and the preserved keep-set.

Before another paid call, leave enough free working space for the provider GLB, an imported Blender root,
four full-resolution renders and temporary export overhead. Estimate this from the latest real package rather
than hard-coding a universal reserve.
