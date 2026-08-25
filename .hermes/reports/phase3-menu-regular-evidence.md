# Phase 3 menu / regular-NPC vertical slice evidence

Date: 2026-08-25

## Delivered contract

- Added JSON-backed definitions for exactly 8 ingredients and 8 recipes (shop 4, cafe 4). Six ingredients and two recipes are available at the start; the remaining definitions are unlocked through the named request chains.
- Reused the existing eight wish characters and gave only Minji and Sooyeon persistent regular state. Each has a deterministic three-request chain, affinity rewards, ingredient/recipe/facility unlocks, and weekly/report linkage.
- Added sim-owned menu development, unordered ingredient-pair discovery, paid failed attempts with persisted clue/progress, 1/2/3 menu slots by facility level, actual ephemeral guest purchases, and renderer-independent named-guest identity.
- Kept the save schema at v7 because all new fields are optional and no existing field changed meaning. Old v7 saves deterministically receive starting recipes/ingredients and craft facilities derive their starting mounted menu; only menu development and the two named regulars are persisted, never the bulk guest population.
- UI panels render `MenuStore`, `PlacementGrid`, `GuestStore`, and weekly report state. No inventory quantities, logistics, ordering, consumption, or currency were added.

## TDD and static verification

- RED first: the five new Phase 3 suites initially failed because `src/sim/kairo/menu.ts` and `src/ui/kairo-menu-lab.ts` did not exist.
- A later regression test, `never buys mounted undiscovered recipe`, failed against a malformed placement snapshot before the guest claim path was hardened; it then passed after the sim-side eligibility fix.
- Focused final run: 9 files, 90 tests passed.
- Broad run excluding three known environment/flaky files: 81 files, 1,293 tests passed.
- TypeScript: `npx tsc --noEmit` passed.
- ESLint: `npm run lint` passed.
- Whitespace: `git diff --check` passed.
- Unfiltered test context: 1,329 passed and 1 skipped; remaining failures were the pre-existing missing `facility__shower_row.png`, missing `facility__slide_large.png`, and a concurrent-load timeout in `accident.test.ts`.

## Browser true-touch evidence

`PPAJI_URL=http://127.0.0.1:5174 npm run verify:kairo` reached the Phase 3 path through a real map `touchscreen.tap` and Playwright touch gestures for UI controls:

- facility touch opened menu development: 6 ingredients, 1 slot, 44 px minimum target;
- ice + milk produced a persisted Cup Ramen clue and 25% progress;
- rice + seaweed discovered `shop_gimbap`, mounted it immediately, and left 3 recipes in permanent discovered state.

All four Phase 3 browser assertions passed. The complete harness finished 313/315; its only failures were the existing wall/facility pixel-overlap checks, unrelated to this slice.

## Headless determinism and balance

- `npm run sim:kairo -- --determinism`: same-seed result matched.
- `npm run sim:kairo -- --seeds 8 --weeks 12`: 0 balance alerts and 0/8 bankrupt runs.
- Across those runs: menu purchases 90–701, named regular purchases 3–19, regular affinity 45–160; median exit satisfaction was 69 and median give-up rate was 0%.

## Documentation and worktree note

The design/schema contract is in `docs/design.md` §15.12 and the phased implementation record is K57 in `docs/kairo-phases.md`. This was a shared dirty worktree containing concurrent Phase 2 edits, so evidence and file attribution are scoped to the Phase 3 changes and no commit was created.
