# Approved modular NPC source bundle

Adopted on 2026-10-04 after terrain/NPC reviews v2-v6. The normal game loads this source provider by default; `npcRuntime=legacy` selects the previous atlas for comparison. Provider load failure falls back to the existing V8 atlas.

The 50 gzip RGBA role/color sources retain their manifest SHA-256 checksums. Each source is decompressed and checked before its 30 occupied 64px cells are retained. `.gz.bin` deliberately avoids web servers auto-decoding gzip before `DecompressionStream` reads it. The integer composer preserves protected anatomy and per-role palette swaps.

The displayed canvas is 160 physical pixels at density 4, with the existing 40 logical pixel cell and original pose anchors. There is no extra per-pose body scaling or anatomy generation. 54 runtime presets and 324 valid modular combinations remain distinct.

`source-archive/` references in manifest lineage identify historical authoring records; they are not runtime file dependencies. All runtime bytes are contained in this directory. Golden composition hashes and prior display metadata are in `src/assets/__fixtures__/` for independent regression checks.

See `docs/assets/handovers/2026-10-04-terrain-npc-main-adoption.md` at repository root for scope and validation limits.
