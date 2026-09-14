import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P56-a2 — 그림 문법이 계획서 §3 의 화면 11 을 전부 덮는지 **정적으로** 센다 (하네스는 화면에서, 여기는 소스에서).
 * 건설·캠페인·소품(독)은 `PictureGrid`, 보상은 `reward-art.ts` 하나, 편지는 `pic`, 지도 FX 넷(price-pop·got-item·buy-pop·band-strip)은 등록부에.
 */
const src = (rel: string): string => readFileSync(resolve(__dirname, rel), 'utf8');

describe('P56-a2 그림 문법 — 화면 전수', () => {
  it('카드 격자 `PictureGrid` 를 쓰는 창: 요리(공방·개조 포함)·장날·투자·건설·캠페인·소품 독·팔찌(수역 정보)', () => {
    for (const f of ['windows/cook.ts', 'windows/shop.ts', 'windows/invest.ts', 'windows/build.ts', 'windows/campaign.ts', 'windows/pool-edit.ts', 'windows/pool-info.ts']) {
      expect(src(f).includes('new PictureGrid('), f).toBe(true);
    }
    // 건설·캠페인·소품에 옛 글자 행·칩이 남아 있지 않다
    expect(src('windows/build.ts').includes('kcatalog-card')).toBe(false);
    expect(src('windows/campaign.ts').includes("'krow kcard-row')")).toBe(false);
    expect(/el\('button', `kchip\$\{this\.pick === it\.id/.test(src('windows/pool-edit.ts'))).toBe(false);
  });

  it('보상 그림은 `reward-art.ts` 하나 — 심사·소원·편지(축하 창)가 같은 함수를 부른다 · 편지는 사건의 `pic` 을 그린다', () => {
    for (const f of ['windows/cert.ts', 'windows/sns.ts', 'windows/celebrate.ts']) expect(src(f).includes("from '../reward-art.js'"), f).toBe(true);
    expect(src('windows/celebrate.ts').includes('ev.pic')).toBe(true);
    expect(src('../sim/events.ts').includes('pic?: { kind: string; id: string }')).toBe(true);
    const game = src('../sim/game.ts');
    expect((game.match(/\{ pic: (\{ kind: |rankPic)/g) ?? []).length).toBeGreaterThanOrEqual(3); // 합격 상품 · 랭크 업 · 달력 편지
  });

  it('지도 위 FX 넷이 등록부에 있고 main 이 sim 사건을 잇는다 (buy → buy-pop · band → band-strip)', () => {
    const reg = src('../render/fx/registry.ts');
    for (const n of ["'price-pop'", "'got-item'", "'buy-pop'", "'band-strip'"]) expect(reg.includes(`${n}: (host, t) =>`), n).toBe(true);
    const main = src('../main.ts');
    expect(main.includes("scene.fx('buy-pop'")).toBe(true);
    expect(main.includes("fx.kind === 'band'")).toBe(true);
    expect(main.includes("scene.fx('band-strip'")).toBe(true);
    expect(src('../sim/game.ts').includes("this.fx.push({ kind: 'band'")).toBe(true);
  });
});
