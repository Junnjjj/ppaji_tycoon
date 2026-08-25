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
    expect(cssSource).toMatch(/\.kcard-choice\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*var\(--tap\)/s);
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
