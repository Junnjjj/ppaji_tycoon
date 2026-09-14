import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../sim/kairo/cards.js';

const viewSource = readFileSync(new URL('./kairo-card.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const harnessSource = readFileSync(
  new URL('../../tools/verify-kairo.ts', import.meta.url),
  'utf8',
);

describe('Phase 6 일반 사건 카드', () => {
  it('카드 데이터가 공유 이미지 슬롯용 8개 테마를 모두 쓴다', () => {
    const themes = new Set(CARDS.map((card) => card.theme));
    expect(themes.size).toBe(8);
    expect([...themes].every((theme) => typeof theme === 'string' && theme.length > 0)).toBe(true);
    expect(viewSource).toContain("dataset['sprite']");
  });

  it('393px에서 선택지 2~3개가 44px 한 줄이며 글자가 가로로 넘치지 않는다', () => {
    expect(viewSource).toContain("'kcard-options'");
    expect(viewSource).toContain('kcard-choice');
    expect(cssSource).toMatch(/\.kcard-options\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)/s);
    /*
     * ⚠ 높이는 **터치 토큰에서 유도**하기만 하면 된다 — 리터럴 `var(--tap)` 을 요구하면
     * 「더 크게」가 금지된다. P8 이 이 버튼을 `calc(var(--tap) * 2)` 로 키웠다: 그 주의
     * 유일한 결정이고 시간이 멈춰 있으므로 **터치 타깃이 아니라 읽는 상자**다.
     * 지키려는 것은 「44px 아래로 안 내려간다」이지 「정확히 44px」가 아니다.
     */
    expect(cssSource).toMatch(/\.kcard-choice\s*\{[^}]*min-width:\s*0[^}]*min-height:[^;]*var\(--tap\)/s);
    // 리터럴 px 로 되돌리면 빨간불 — 토큰에서 유도한다는 것이 계약이다
    expect(cssSource).not.toMatch(/\.kcard-choice\s*\{[^}]*min-height:\s*\d+px/s);
    expect(cssSource).toMatch(/\.kcard-choice \.kitem-(?:name|sub)\s*\{[^}]*overflow:\s*hidden/s);
  });

  it('실제 393 터치 하네스가 카드를 고르고 모달·뉴스·토스트 중복을 확인한다', () => {
    expect(harnessSource).toContain("viewport: { width: 393, height: 852 }");
    expect(harnessSource).toContain('page.touchscreen.tap(cardFlow.touchX, cardFlow.touchY)');
    expect(harnessSource).toContain('일반 카드는 모달 한 채널만 쓴다');
    expect(harnessSource).toContain('tickerBefore');
    expect(harnessSource).toContain('toastBefore');
  });
});
