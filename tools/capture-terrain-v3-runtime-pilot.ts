/** source-v1 기반 terrain-v3 후보를 같은 C 런타임 좌표에서 비교 캡처한다. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://127.0.0.1:5174';
const OUT = resolve('artifacts/asset-concept-sheets/terrain-v3-high-quality-source/runtime-map');

interface HarnessPlaced {
  handle: number;
}

interface Harness {
  scene: {
    setAutoTick(on: boolean): void;
    refreshFacility(handle: number): void;
    refreshTile(i: number, j: number): void;
    focusTile(i: number, j: number): void;
    setUpscale(scale: 1 | 2): void;
    setSurroundVisibleForTest(on: boolean): void;
  };
  setGradeForTest(grade: number): void;
  placement: { all(): HarnessPlaced[]; remove(handle: number): boolean };
  terrain: {
    paint(i: number, j: number, kind: string): boolean;
    setLevel(i: number, j: number, level: number): boolean;
    kindAt(i: number, j: number): string | null;
    levelAt(i: number, j: number): number;
  };
  provider: { name: string };
}

async function waitForKairo(page: Page): Promise<void> {
  await page.waitForFunction('!!window.__kairo', undefined, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function prepareTerrainStage(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const h = window.__kairo as unknown as Harness;
    h.scene.setAutoTick(false);
    h.scene.setSurroundVisibleForTest(false);
    h.setGradeForTest(5);
    for (const placed of [...h.placement.all()]) {
      h.placement.remove(placed.handle);
      h.scene.refreshFacility(placed.handle);
    }

    const assignments: Array<{ i: number; j: number; kind: string; level: number }> = [];
    const shorePattern = [0, 0, 0, 1, 1, 1, 1, 0, 0, -1, -1, -1, -1, 0, 0, 0];
    for (let j = 10; j <= 42; j++) {
      for (let i = 46; i <= 94; i++) {
        const shore = 27 + (shorePattern[(i - 46) % shorePattern.length] ?? 0);
        if (j > shore) {
          assignments.push({ i, j, kind: 'water_edge', level: 0 });
        } else if (j >= shore - 2) {
          assignments.push({ i, j, kind: 'path_sand', level: 0 });
        } else {
          assignments.push({ i, j, kind: 'lawn', level: 0 });
        }
      }
    }

    for (let j = 12; j <= 23; j++) {
      for (let i = 54; i <= 72; i++) assignments.push({ i, j, kind: 'lawn', level: 1 });
    }
    for (let j = 13; j <= 20; j++) {
      for (let i = 58; i <= 69; i++) assignments.push({ i, j, kind: 'lawn', level: 2 });
    }
    for (let j = 14; j <= 17; j++) {
      for (let i = 61; i <= 66; i++) assignments.push({ i, j, kind: 'lawn', level: 3 });
    }

    for (let j = 10; j <= 20; j++) {
      for (const i of [48, 49]) assignments.push({ i, j, kind: 'path_stone', level: 0 });
    }
    for (let j = 20; j <= 21; j++) {
      for (let i = 48; i <= 53; i++) assignments.push({ i, j, kind: 'path_stone', level: 0 });
    }
    for (let j = 22; j <= 24; j++) {
      for (let i = 54; i <= 59; i++) assignments.push({ i, j, kind: 'path_deck', level: 0 });
    }

    const stats: Record<string, number> = {};
    for (const assignment of assignments) {
      h.terrain.paint(assignment.i, assignment.j, assignment.kind);
      h.terrain.setLevel(assignment.i, assignment.j, assignment.level);
      h.scene.refreshTile(assignment.i, assignment.j);
      stats[assignment.kind] = (stats[assignment.kind] ?? 0) + 1;
    }

    h.scene.setUpscale(2);
    h.scene.focusTile(64, 26);
    const debug = document.getElementById('kairo-debug');
    if (debug) debug.style.visibility = 'hidden';
    return {
      stats,
      samples: {
        lawn: [h.terrain.kindAt(74, 18), h.terrain.levelAt(74, 18)],
        terrace: [h.terrain.kindAt(63, 16), h.terrain.levelAt(63, 16)],
        sand: [h.terrain.kindAt(74, 27), h.terrain.levelAt(74, 27)],
        water: [h.terrain.kindAt(74, 34), h.terrain.levelAt(74, 34)],
      },
    };
  });
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    status: 'TERRAIN_V3_SOURCE_RUNTIME_REVIEW_ONLY',
    visualAuthority: 'terrain-master-source-v1.png',
    baseUrl: BASE,
    viewportCss: [1200, 820],
    deviceScaleFactor: 2,
    variants: {},
  };
  const variants = [
    { id: 'c-baseline', query: '?debug=1&hd=1&hdFit=1' },
    { id: 'terrain-v3-source', query: '?debug=1&hd=1&hdFit=1&terrain=v3' },
  ] as const;

  try {
    for (const variant of variants) {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 820 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${BASE}/${variant.query}`, { waitUntil: 'load' });
      await waitForKairo(page);
      const setup = await prepareTerrainStage(page);
      await page.waitForTimeout(600);

      const path = resolve(OUT, `${variant.id}.png`);
      await page.locator('canvas').screenshot({ path });
      const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Phaser canvas 없음');
        const css = canvas.getBoundingClientRect();
        return {
          provider: (window.__kairo as unknown as Harness).provider.name,
          backing: [canvas.width, canvas.height],
          css: [Math.round(css.width), Math.round(css.height)],
          backingPerCss: [canvas.width / css.width, canvas.height / css.height],
        };
      });
      (evidence.variants as Record<string, unknown>)[variant.id] = {
        query: variant.query,
        screenshot: path,
        sha256: await sha256(path),
        setup,
        metrics,
        consoleErrors: errors,
      };
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const evidencePath = resolve(OUT, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ evidence: evidencePath, variants: variants.map(({ id }) => id) }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
