/** `?assetReview=1` 실제 Phaser 맵의 20종×4방향을 재현 가능하게 검증·캡처한다. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://127.0.0.1:5174';
const OUT = resolve(
  'artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-live-review-v1',
);

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    await page.goto(`${BASE}/?assetReview=1&debug=1`, { waitUntil: 'load' });
    await page.waitForFunction(
      `window.__kairo?.assetReview?.ready === true || window.__kairo?.assetReview?.error`,
      undefined,
      { timeout: 30_000 },
    );

    const initial = await page.evaluate(() => {
      const h = window.__kairo as typeof window.__kairo & {
        assetReview: {
          ready: boolean;
          error: string | null;
          selectedIndex: number;
          groups: Array<{ defId: string; name: string; placements: Array<{ facing: number }> }>;
          placed: Array<{ handle: number; defId: string; facing?: number }>;
          select(index: number): boolean;
          overview(): void;
        };
      };
      const textures = h.assetReview.placed.map((placed) => ({
        defId: placed.defId,
        facing: placed.facing ?? 0,
        texture: h.scene.facilityImageAt(placed.handle)?.texture?.key ?? null,
      }));
      return {
        ready: h.assetReview.ready,
        error: h.assetReview.error,
        groups: h.assetReview.groups.length,
        placed: h.assetReview.placed.length,
        facings: [...new Set(h.assetReview.placed.map((placed) => placed.facing ?? 0))].sort(),
        textures,
        provider: h.provider.name,
        localStorageKeys: Object.keys(localStorage).sort(),
        panelReady: document.getElementById('kairo-asset-review')?.dataset['ready'] ?? null,
      };
    });
    if (!initial.ready || initial.error) throw new Error(initial.error ?? '리뷰 모드 준비 실패');
    if (initial.groups !== 20 || initial.placed !== 80) {
      throw new Error(`수량 불일치: ${initial.groups}종/${initial.placed}개`);
    }
    if (JSON.stringify(initial.facings) !== JSON.stringify([0, 1, 2, 3])) {
      throw new Error(`방향 불일치: ${JSON.stringify(initial.facings)}`);
    }
    for (const texture of initial.textures) {
      if (texture.texture !== `facility/${texture.defId}:d${texture.facing}`) {
        throw new Error(`텍스처 불일치: ${JSON.stringify(texture)}`);
      }
    }

    await page.evaluate(() => {
      const h = window.__kairo as typeof window.__kairo & {
        assetReview: { overview(): void };
      };
      h.assetReview.overview();
    });
    await page.waitForTimeout(300);
    const overview = resolve(OUT, 'all-20-facilities-four-directions-map.png');
    await page.screenshot({ path: overview });

    await page.evaluate(() => {
      const h = window.__kairo as typeof window.__kairo & {
        assetReview: { toggleZoom(): 1 | 2 };
      };
      h.assetReview.toggleZoom();
    });

    const groupShots: Array<{ id: string; name: string; path: string; sha256: string }> = [];
    const groupCount = initial.groups;
    for (let index = 0; index < groupCount; index++) {
      const group = await page.evaluate((selected) => {
        const h = window.__kairo as typeof window.__kairo & {
          assetReview: {
            groups: Array<{ defId: string; name: string }>;
            select(index: number): boolean;
          };
        };
        if (!h.assetReview.select(selected)) throw new Error(`선택 실패 ${selected}`);
        const group = h.assetReview.groups[selected];
        if (!group) throw new Error(`시설 그룹 없음 ${selected}`);
        return group;
      }, index);
      await page.waitForTimeout(90);
      const path = resolve(OUT, `${String(index + 1).padStart(2, '0')}-${group.defId}-d0-d3-map.png`);
      await page.screenshot({ path });
      groupShots.push({ id: group.defId, name: group.name, path, sha256: await sha256(path) });
    }

    // 진짜 DOM 터치 경로로 다음·확대가 살아 있는지 확인한다.
    await page.evaluate(() => {
      const h = window.__kairo as typeof window.__kairo & {
        assetReview: { overview(): void };
      };
      h.assetReview.overview();
    });
    await page.locator('#kairo-asset-review button', { hasText: '다음' }).click();
    const afterNext = await page.evaluate(
      () =>
        (
          window.__kairo as typeof window.__kairo & {
            assetReview: { selectedIndex: number };
          }
        ).assetReview.selectedIndex,
    );
    await page.locator('#kairo-asset-review button', { hasText: '2×' }).click();
    await page.waitForTimeout(120);
    const debugAfterZoom = await page.locator('#kairo-debug').textContent();
    if (afterNext !== 0 || !debugAfterZoom?.includes('S=2')) {
      throw new Error(`탐색 컨트롤 실패: next=${afterNext}, ${debugAfterZoom ?? ''}`);
    }

    await page.waitForTimeout(1_600);
    const after = await page.evaluate(() => ({ localStorageKeys: Object.keys(localStorage).sort() }));
    if (JSON.stringify(after.localStorageKeys) !== JSON.stringify(initial.localStorageKeys)) {
      throw new Error(
        `리뷰 모드가 저장소를 바꾸었습니다: ` +
          `${JSON.stringify(initial.localStorageKeys)} -> ${JSON.stringify(after.localStorageKeys)}`,
      );
    }
    if (errors.length > 0) throw new Error(`브라우저 예외: ${errors.join(' | ')}`);

    const evidence = {
      schemaVersion: 1,
      status: 'FOUR_DIRECTION_LIVE_REVIEW_READY',
      url: `${BASE}/?assetReview=1`,
      provider: initial.provider,
      facilities: initial.groups,
      directions: initial.facings,
      placements: initial.placed,
      texturesMatched: initial.textures.length,
      storageKeysUnchanged: true,
      controls: { next: true, zoom2x: true },
      consoleErrors: errors,
      overview: { path: overview, sha256: await sha256(overview) },
      groups: groupShots,
    };
    const evidencePath = resolve(OUT, 'evidence.json');
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ evidence: evidencePath, ...evidence }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
