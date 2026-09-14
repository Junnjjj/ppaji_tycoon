/** Capture the review-only continuous shoreline at fixed radii on one identical map/camera. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://127.0.0.1:5174';
const OUT = resolve('artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot');

interface HarnessPlaced {
  handle: number;
}

interface Harness {
  scene: {
    setAutoTick(on: boolean): void;
    refreshFacility(handle: number): void;
    refreshRoundedShoreForTest(): void;
    roundedShoreProbeForTest(): {
      radius: number | null;
      contours: number;
      segments: number;
      curvedSegments: number;
      simulationGridUnchanged: true;
    };
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
  };
  provider: { name: string };
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function waitForKairo(page: Page): Promise<void> {
  await page.waitForFunction('!!window.__kairo', undefined, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

async function prepareStage(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const h = window.__kairo as unknown as Harness;
    h.scene.setAutoTick(false);
    h.scene.setSurroundVisibleForTest(false);
    h.setGradeForTest(5);
    for (const placed of [...h.placement.all()]) {
      h.placement.remove(placed.handle);
      h.scene.refreshFacility(placed.handle);
    }

    // Long runs plus one convex peninsula and one concave bay. The same exact
    // logical cells are used for every radius; only the visual boundary changes.
    const shoreline = [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
      -5, -5, -5, -5, -5, -5, -5, -5, -5, -5,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ] as const;
    for (let j = 8; j <= 44; j++) {
      for (let i = 46; i <= 94; i++) {
        const coast = 27 + (shoreline[i - 46] ?? 0);
        const kind = j > coast ? 'water_edge' : j >= coast - 2 ? 'path_sand' : 'lawn';
        h.terrain.paint(i, j, kind);
        h.terrain.setLevel(i, j, 0);
      }
    }

    // Keep source-v1 stone/deck/height families in frame so color continuity is visible.
    for (let j = 10; j <= 21; j++) {
      for (const i of [48, 49]) h.terrain.paint(i, j, 'path_stone');
    }
    for (let j = 20; j <= 21; j++) {
      for (let i = 48; i <= 54; i++) h.terrain.paint(i, j, 'path_stone');
    }
    for (let j = 22; j <= 24; j++) {
      for (let i = 55; i <= 61; i++) h.terrain.paint(i, j, 'path_deck');
    }
    for (let j = 12; j <= 18; j++) {
      for (let i = 56; i <= 72; i++) h.terrain.setLevel(i, j, 1);
    }
    for (let j = 13; j <= 16; j++) {
      for (let i = 60; i <= 68; i++) h.terrain.setLevel(i, j, 2);
    }

    h.scene.refreshRoundedShoreForTest();
    h.scene.setUpscale(2);
    h.scene.focusTile(67, 27);
    const debug = document.getElementById('kairo-debug');
    if (debug) debug.style.visibility = 'hidden';
    return {
      probe: h.scene.roundedShoreProbeForTest(),
      semanticSamples: {
        peninsulaLand: h.terrain.kindAt(54, 28),
        bayWater: h.terrain.kindAt(74, 25),
        deepWater: h.terrain.kindAt(74, 35),
      },
    };
  });
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const variants = [
    { id: 'r000-negative-control', radius: 0 },
    { id: 'r050', radius: 0.5 },
    { id: 'r075', radius: 0.75 },
    { id: 'r100', radius: 1 },
  ] as const;
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    status: 'ROUNDED_SHORE_RADIUS_USER_REVIEW',
    liveModified: false,
    materialAuthority: 'terrain-master-source-v1.png',
    curveAuthority: 'attempt-b-map-target.png',
    rejectedOverlayV1Reused: false,
    variants: {},
  };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const variant of variants) {
      const context = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      const query = `?debug=1&hd=1&hdFit=1&terrain=v3&shoreRadius=${variant.radius}`;
      await page.goto(`${BASE}/${query}`, { waitUntil: 'load' });
      await waitForKairo(page);
      const setup = await prepareStage(page);
      await page.waitForTimeout(400);
      const path = resolve(OUT, `${variant.id}.png`);
      await page.locator('canvas').screenshot({ path });
      const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Phaser canvas missing');
        const css = canvas.getBoundingClientRect();
        const h = window.__kairo as unknown as Harness;
        return {
          provider: h.provider.name,
          probe: h.scene.roundedShoreProbeForTest(),
          backing: [canvas.width, canvas.height],
          css: [Math.round(css.width), Math.round(css.height)],
        };
      });
      (evidence.variants as Record<string, unknown>)[variant.id] = {
        radius: variant.radius,
        query,
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
  console.log(JSON.stringify({ evidence: evidencePath, variants: variants.map((variant) => variant.id) }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
