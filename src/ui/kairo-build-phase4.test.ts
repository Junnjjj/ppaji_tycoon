import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildItemView, carouselNeedsNav, type BuildItem } from './kairo-hud.js';

const hud = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const harness = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

const item = (extra: Partial<BuildItem> = {}): BuildItem => ({
  kind: 'facility',
  tab: 'facility',
  id: 'shop',
  name: '매점',
  cost: 120_000,
  role: '먹거리',
  sprite: 'facility/shop',
  ...extra,
});

describe('Phase 4 모바일 건설 선택 표면', () => {
  it('카드 모델은 비용과 역할 배지 하나를 별도 필드로 낸다', () => {
    const view = buildItemView(item());
    expect(view.cost).toBe('12만');
    expect(view.role).toBe('먹거리');
    expect(view.blockedReason).toBeUndefined();
    expect(view.unlockMethod).toBeUndefined();
    expect(view.selectable).toBe(true);
  });

  it('막힌 이유와 푸는 방법을 선택 전에 함께 낸다', () => {
    const blocked = buildItemView(
      item({ locked: '실내 빈자리 없음', unlock: '건물 바닥을 넓히세요' }),
    );
    expect(blocked.blockedReason).toBe('실내 빈자리 없음');
    expect(blocked.unlockMethod).toBe('건물 바닥을 넓히세요');
    expect(blocked.selectable).toBe(false);

    const teaser = buildItemView(item({ teaser: '2등급 심사 통과' }));
    expect(teaser.blockedReason).toBe('아직 잠김');
    expect(teaser.unlockMethod).toBe('2등급 심사 통과');
    expect(teaser.selectable).toBe(false);
  });

  it('터치 기기에는 화살표를 만들지 않고 비터치에는 이름 있는 폴백을 둔다', () => {
    expect(carouselNeedsNav(5)).toBe(false);
    expect(carouselNeedsNav(1)).toBe(false);
    expect(carouselNeedsNav(0)).toBe(true);
    expect(hud).toContain("aria-label', '이전 건설 카드'");
    expect(hud).toContain("aria-label', '다음 건설 카드'");
  });

  it('한 레이아웃에서 세 카드·가로 스와이프·두 줄 이름을 허용한다', () => {
    expect(css).toMatch(/\.kcarousel\s*\{[^}]*touch-action:\s*pan-x/s);
    expect(css).toMatch(/\.kcard\s*\{[^}]*calc\(\(100%\s*-\s*16px\)\s*\/\s*3\)/s);
    expect(css).toMatch(/\.kcard-name\s*\{[^}]*-webkit-line-clamp:\s*2/s);
  });

  it('확정 바는 썸네일·실제 비용·배치 판정 결과를 구조로 보존한다', () => {
    expect(hud).toContain("'kconfirm-thumb'");
    expect(hud).toContain("'kconfirm-cost'");
    expect(hud).toContain("'kconfirm-check'");
  });

  it('브라우저 하네스는 두 방향에서 진짜 터치 스와이프와 계측 스크린샷을 남긴다', () => {
    expect(harness).toContain("[393, 852, '세로'");
    expect(harness).toContain("[852, 393, '가로'");
    expect(harness).toContain("Input.dispatchTouchEvent");
    expect(harness).toContain('kairo-build-phase4-${tag}.png');
    expect(harness).toContain('Phase 4 건설 카드 스와이프');
  });
});
