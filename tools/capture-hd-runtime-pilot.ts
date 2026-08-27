/**
 * HD 픽셀 모드 파일럿을 실제 Phaser 맵에서 같은 좌표로 캡처한다.
 *
 * A = 현재 기본 경로
 * B = 2× 렌더/소스, 현재 풋프린트
 * C = 2× 렌더/소스, 승인 풋프린트 + 4방향
 *
 * 기본 저장소나 라이브 아틀라스는 바꾸지 않는다. 각 브라우저 컨텍스트는 빈 저장소에서
 * 시작하고, 화면 검토에 필요한 시설만 테스트 손잡이로 놓는다.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://127.0.0.1:5174';
const LIVE_ADOPTION = process.env['PPAJI_LIVE_ADOPTION'] === '1';
const OUT = resolve(
  LIVE_ADOPTION
    ? 'artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/runtime-map'
    : 'artifacts/hd-pixel-mode-pilot-v1/runtime-map',
);

interface Variant {
  id: 'A' | 'B' | 'C' | 'LIVE';
  label: string;
  query: string;
}

interface HarnessPlaced {
  handle: number;
  defId: string;
  i: number;
  j: number;
  facing?: number;
  menuIds?: string[];
}

interface HarnessImage {
  texture?: { key?: string };
  x: number;
  y: number;
  displayWidth: number;
  displayHeight: number;
  scaleX: number;
}

interface HarnessRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RuntimeHarness {
  scene: {
    setAutoTick(on: boolean): void;
    refreshFacility(handle: number): void;
    refreshTile(i: number, j: number): void;
    focusTile(i: number, j: number): void;
    setUpscale(scale: 1 | 2): void;
    facilityImageAt(handle: number): HarnessImage | undefined;
    tileScreenRect(i: number, j: number): HarnessRect;
  };
  setGradeForTest(grade: number): void;
  placement: {
    all(): HarnessPlaced[];
    remove(handle: number): boolean;
    place(
      terrain: unknown,
      walls: unknown,
      gate: { i: number; j: number },
      id: string,
      i: number,
      j: number,
      options: { land: HarnessLand; facing: number },
    ): { ok: boolean; fail?: string; placed?: HarnessPlaced };
  };
  terrain: {
    paint(i: number, j: number, kind: string): boolean;
    setLevel(i: number, j: number, level: number): boolean;
  };
  walls: unknown;
  gate: { i: number; j: number };
  land(): HarnessLand;
  provider: { name: string };
  facilityPanel: { visible: boolean; hide(): void };
}

interface HarnessLand {
  i0: number;
  j0: number;
  w: number;
  h: number;
}

declare global {
  interface Window {
    __kairo: RuntimeHarness;
    __kairoClearBrush(): void;
  }
}

const VARIANTS: readonly Variant[] = LIVE_ADOPTION
  ? [{ id: 'LIVE', label: '라이브 D=2 · 채택 풋프린트/4방향', query: '?debug=1' }]
  : [
      { id: 'A', label: '기본 D=1 · 현재 풋프린트', query: '?debug=1' },
      { id: 'B', label: 'HD D=2 · 현재 풋프린트', query: '?debug=1&hd=1' },
      { id: 'C', label: 'HD D=2 · 승인 풋프린트/4방향', query: '?debug=1&hd=1&hdFit=1' },
    ];

async function waitForKairo(page: Page): Promise<void> {
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(500);
}

async function prepareMainComparison(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const h = window.__kairo;
    h.scene.setAutoTick(false);
    h.setGradeForTest(5);

    for (const old of [...h.placement.all()]) {
      h.placement.remove(old.handle);
      h.scene.refreshFacility(old.handle);
    }

    // 실제 맵의 우측 평지를 작은 쇼룸으로 바꾼다. 입구에서 이어지는 통로도 함께 칠한다.
    for (let i = 48; i <= 60; i++) {
      h.terrain.paint(i, 8, 'path_stone');
      h.terrain.setLevel(i, 8, 0);
      h.scene.refreshTile(i, 8);
    }
    for (let j = 8; j <= 12; j++) {
      h.terrain.paint(60, j, 'path_stone');
      h.terrain.setLevel(60, j, 0);
      h.scene.refreshTile(60, j);
    }
    for (let j = 12; j <= 30; j++) {
      for (let i = 60; i <= 86; i++) {
        h.terrain.paint(i, j, 'floor_indoor');
        h.terrain.setLevel(i, j, 0);
        h.scene.refreshTile(i, j);
      }
    }

    const placed: Record<string, unknown>[] = [];
    for (const request of [
      { id: 'icecream', i: 68, j: 19, facing: 0 },
      { id: 'cafe', i: 73, j: 19, facing: 0 },
    ]) {
      const result = h.placement.place(h.terrain, h.walls, h.gate, request.id, request.i, request.j, {
        land: h.land(),
        facing: request.facing,
      });
      if (!result.ok || !result.placed) {
        throw new Error(`${request.id} 배치 실패: ${String(result.fail)}`);
      }
      h.scene.refreshFacility(result.placed.handle);
      const image = h.scene.facilityImageAt(result.placed.handle);
      placed.push({
        ...result.placed,
        texture: image?.texture?.key ?? null,
        display: image
          ? { x: image.x, y: image.y, w: image.displayWidth, h: image.displayHeight, scaleX: image.scaleX }
          : null,
      });
    }

    h.scene.focusTile(73, 21);
    return { placed, land: h.land() };
  });
}

async function prepareDirectionComparison(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const h = window.__kairo;
    h.scene.setAutoTick(false);
    h.setGradeForTest(5);
    for (const old of [...h.placement.all()]) {
      h.placement.remove(old.handle);
      h.scene.refreshFacility(old.handle);
    }
    for (let i = 48; i <= 58; i++) {
      h.terrain.paint(i, 8, 'path_stone');
      h.terrain.setLevel(i, 8, 0);
      h.scene.refreshTile(i, 8);
    }
    for (let j = 8; j <= 12; j++) {
      h.terrain.paint(58, j, 'path_stone');
      h.terrain.setLevel(58, j, 0);
      h.scene.refreshTile(58, j);
    }
    for (let j = 12; j <= 34; j++) {
      for (let i = 58; i <= 93; i++) {
        h.terrain.paint(i, j, 'floor_indoor');
        h.terrain.setLevel(i, j, 0);
        h.scene.refreshTile(i, j);
      }
    }

    const requests = [
      ...[0, 1, 2, 3].map((facing, n) => ({ id: 'icecream', i: 62 + n * 4, j: 17, facing })),
      ...[0, 1, 2, 3].map((facing, n) => ({ id: 'cafe', i: 62 + n * 7, j: 24, facing })),
    ];
    const placed: Record<string, unknown>[] = [];
    for (const request of requests) {
      const result = h.placement.place(h.terrain, h.walls, h.gate, request.id, request.i, request.j, {
        land: h.land(),
        facing: request.facing,
      });
      if (!result.ok || !result.placed) {
        throw new Error(`${request.id} d${request.facing} 배치 실패: ${String(result.fail)}`);
      }
      h.scene.refreshFacility(result.placed.handle);
      const image = h.scene.facilityImageAt(result.placed.handle);
      placed.push({
        ...result.placed,
        texture: image?.texture?.key ?? null,
        display: image ? { x: image.x, y: image.y, w: image.displayWidth, h: image.displayHeight } : null,
      });
    }
    h.scene.focusTile(76, 23);
    return { placed };
  });
}

async function collectMetrics(page: Page, setup: unknown, errors: readonly string[]): Promise<unknown> {
  return page.evaluate(
    ({ setup, errors }) => {
      const h = window.__kairo;
      const canvas = document.querySelector('canvas');
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Phaser canvas 없음');
      const css = canvas.getBoundingClientRect();
      const center = h.scene.tileScreenRect(73, 21);
      return {
        provider: h.provider.name,
        debug: document.getElementById('kairo-debug')?.textContent ?? '',
        devicePixelRatio: window.devicePixelRatio,
        canvas: {
          backing: [canvas.width, canvas.height],
          css: [Math.round(css.width), Math.round(css.height)],
          backingPerCss: [canvas.width / css.width, canvas.height / css.height],
        },
        centerTileRect: center,
        setup,
        consoleErrors: errors,
      };
    },
    { setup, errors },
  );
}

async function tapIcecreamThroughCanvas(page: Page): Promise<unknown> {
  const point = await page.evaluate(() => {
    const h = window.__kairo;
    window.__kairoClearBrush();
    const canvas = document.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Phaser canvas 없음');
    const css = canvas.getBoundingClientRect();
    const rect = h.scene.tileScreenRect(68, 19);
    const sx = css.width / canvas.width;
    const sy = css.height / canvas.height;
    return {
      x: css.left + (rect.x + rect.w / 2) * sx,
      y: css.top + (rect.y + rect.h / 2) * sy,
      tileRect: rect,
      backingToCss: [sx, sy],
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(420);
  const panelOpened = await page.evaluate(() => {
    const h = window.__kairo;
    const visible = h.facilityPanel.visible;
    h.facilityPanel.hide();
    return visible;
  });
  if (!panelOpened) throw new Error(`캔버스 실좌표 탭이 아이스크림 패널을 열지 못함: ${JSON.stringify(point)}`);
  return { ...point, panelOpened };
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    status: LIVE_ADOPTION ? 'LIVE_ADOPTION_RUNTIME_EVIDENCE' : 'HD_RUNTIME_MAP_REVIEW_ONLY',
    baseUrl: BASE,
    viewportCss: [1100, 760],
    deviceScaleFactor: 2,
    variants: {},
  };

  try {
    for (const variant of VARIANTS) {
      const context = await browser.newContext({
        viewport: { width: 1100, height: 760 },
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
      const setup = await prepareMainComparison(page);
      await page.waitForTimeout(500);
      const screenshot = resolve(OUT, `${variant.id.toLowerCase()}-actual-map.png`);
      await page.screenshot({ path: screenshot });
      const metrics = await collectMetrics(page, setup, errors);
      const inputHit = await tapIcecreamThroughCanvas(page);
      await page.evaluate(() => {
        const h = window.__kairo;
        h.scene.setUpscale(2);
        h.scene.focusTile(73, 21);
        const debug = document.getElementById('kairo-debug');
        if (debug) debug.style.visibility = 'hidden';
      });
      await page.waitForTimeout(350);
      const closeup = resolve(OUT, `${variant.id.toLowerCase()}-actual-map-s2.png`);
      await page.screenshot({ path: closeup });
      (evidence.variants as Record<string, unknown>)[variant.id] = {
        label: variant.label,
        query: variant.query,
        screenshot,
        sha256: await sha256(screenshot),
        closeup,
        closeupSha256: await sha256(closeup),
        inputHit,
        metrics,
      };
      await context.close();
    }

    const directionContext = await browser.newContext({
      viewport: { width: 1280, height: 820 },
      deviceScaleFactor: 2,
    });
    const directionPage = await directionContext.newPage();
    const directionErrors: string[] = [];
    directionPage.on('console', (message) => {
      if (message.type() === 'error') directionErrors.push(message.text());
    });
    directionPage.on('pageerror', (error) => directionErrors.push(error.message));
    await directionPage.goto(
      `${BASE}/${LIVE_ADOPTION ? '?debug=1' : '?debug=1&hd=1&hdFit=1'}`,
      { waitUntil: 'load' },
    );
    await waitForKairo(directionPage);
    const directionSetup = await prepareDirectionComparison(directionPage);
    await directionPage.waitForTimeout(500);
    const directionScreenshot = resolve(
      OUT,
      LIVE_ADOPTION ? 'live-four-directions-actual-map.png' : 'c-approved-four-directions-actual-map.png',
    );
    await directionPage.screenshot({ path: directionScreenshot });
    await directionPage.evaluate(() => {
      const h = window.__kairo;
      h.scene.setUpscale(2);
      h.scene.focusTile(76, 23);
      const debug = document.getElementById('kairo-debug');
      if (debug) debug.style.visibility = 'hidden';
    });
    await directionPage.waitForTimeout(350);
    const directionCloseup = resolve(
      OUT,
      LIVE_ADOPTION
        ? 'live-four-directions-actual-map-s2.png'
        : 'c-approved-four-directions-actual-map-s2.png',
    );
    await directionPage.screenshot({ path: directionCloseup });
    evidence['fourDirections'] = {
      screenshot: directionScreenshot,
      sha256: await sha256(directionScreenshot),
      closeup: directionCloseup,
      closeupSha256: await sha256(directionCloseup),
      metrics: await collectMetrics(directionPage, directionSetup, directionErrors),
    };
    await directionContext.close();
  } finally {
    await browser.close();
  }

  const evidencePath = resolve(OUT, 'evidence.json');
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ evidence: evidencePath, variants: VARIANTS.map((v) => v.id) }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
