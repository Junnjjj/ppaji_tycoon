import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P57-e — 태블릿·가로 화면: 창·독·튜토리얼·사건 태그는 가운데 `--ui-max`(520px) 열에 모이고 지도만 화면 전체를 쓴다.
 * P59-c H-7: 상단 띠·티커·하단 바·오른쪽 밴드는 **전폭** — 폰 바를 키운 것처럼 지도 가운데 떠 보였다(실측 820px).
 * 폰(393)에선 `--ui-side` 가 0 이라 그대로다. 실측(2026-09-15 iPad 가로 1180): 건설 창이 전폭으로 늘어 카드 한 장이 400px, 탭 줄이 길게 퍼졌다.
 * 하네스는 폰 한 기기라 여기서 정적으로 센다(새 전폭 표면을 만들면 `--ui-side` 를 붙일 것).
 */
const css = readFileSync(resolve(__dirname, 'style.css'), 'utf8');
const block = (sel: string): string => { const i = css.indexOf(`\n${sel} {`); expect(i, sel).toBeGreaterThan(0); return css.slice(i, css.indexOf('}', i)); };

describe('P57-e 태블릿 열', () => {
  it('토큰 --ui-max 520px · --ui-side = max(0, (100vw − ui-max)/2)', () => {
    expect(css).toMatch(/--ui-max: 520px;/);
    expect(css).toMatch(/--ui-side: max\(0px, calc\(\(100vw \/ var\(--ui-zoom\) - var\(--ui-max\)\) \/ 2\)\);/); // P57-g: 배율 안에서 쓰이므로 100vw 를 --ui-zoom 으로 나눈다
    expect(css).toMatch(/--ui-zoom: 1;/);
  });
  it('창·독·튜토리얼은 좌우에 --ui-side · HUD 띠·티커·바는 전폭(H-7)', () => {
    for (const sel of ['#hud-top', '#hud-ticker', '#hud-bottom']) { const b = block(sel); expect(b, sel).toMatch(/left: 0;/); expect(b, sel).toMatch(/right: 0;/); }
    for (const sel of ['.kwin', '.kdock', '.ktut']) { const b = block(sel); expect(b, sel).toMatch(/left: (var\(--ui-side\)|calc\(var\(--ui-side\))/); expect(b, sel).toMatch(/right: (var\(--ui-side\)|calc\(var\(--ui-side\))/); }
    expect(block('#hud-right')).toMatch(/right: 4px;/);
    expect(css).toMatch(/\.kevent-tag \{ position: fixed; left: calc\(var\(--ui-side\) \+ 10px\)/);
  });
});
