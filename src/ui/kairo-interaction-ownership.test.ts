import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { homeInputOwnership, type InputSurface } from './panels.js';

/**
 * 한 순간에 한 입력층만 눌린다 (UI v3 Task 3).
 *
 * ⚠ 여기서 재는 것은 **소유권 규칙과 그 규칙이 배선된 흔적**뿐이다. "실제로 그 자리에서
 * 눌리는가"는 `tools/verify-kairo.ts` 의 `elementFromPoint` 5점 소유권 절이 잰다 —
 * 단위 검사에서 DOM 을 흉내내면 "규칙은 맞는데 화면은 그대로"를 놓친다
 * (`panels.test.ts`·`kairo-report.test.ts` 와 같은 경계).
 */
const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const tickerSource = readFileSync(new URL('./kairo-ticker.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

const NON_HOME: readonly InputSurface[] = ['menu', 'build', 'panel', 'course'];

describe('홈 입력층 소유권', () => {
  it('홈 표면에서만 목표·티커·하단 바가 입력을 소유한다', () => {
    expect(homeInputOwnership('home')).toEqual({ goals: true, ticker: true, bar: true });
    for (const surface of NON_HOME) {
      expect(homeInputOwnership(surface)).toEqual({ goals: false, ticker: false, bar: false });
    }
  });

  it('소유권은 세 표면을 한 번에 정한다 — 한 곳만 내리는 부분 상태가 없다', () => {
    for (const surface of ['home', ...NON_HOME] as const) {
      const own = homeInputOwnership(surface);
      expect(new Set(Object.values(own)).size).toBe(1);
    }
  });
});

describe('소유권 배선', () => {
  it('HUD가 표면마다 목표·바·티커 소유권을 함께 적용한다', () => {
    expect(hudSource).toContain('homeInputOwnership');
    expect(hudSource).toMatch(/this\.goalBox\.hidden\s*=\s*!own\.goals/);
    expect(hudSource).toMatch(/this\.bar\.hidden\s*=\s*!own\.bar/);
    // 티커는 HUD 소유가 아니므로 같은 소유권 값을 콜백 하나로 흘린다.
    expect(hudSource).toMatch(/onSurface\?\.\(/);
  });

  it('티커는 소유권을 잃으면 26px 띠와 44px hit surface를 함께 내린다', () => {
    expect(tickerSource).toMatch(/setInputOwned\(owned: boolean\): void/);
    expect(tickerSource).toMatch(/this\.strip\.hidden\s*=\s*!owned/);
  });

  it('내린 표면은 CSS에서도 display:none이다 — 클래스가 UA 기본값을 이긴다', () => {
    expect(cssSource).toMatch(/\.kbar\[hidden\]\s*\{[^}]*display:\s*none/s);
    expect(cssSource).toMatch(/\.kticker\[hidden\]\s*\{[^}]*display:\s*none/s);
  });

  it('시트는 하단 바 위에 얹지 않고 그 자리를 대신한다', () => {
    expect(hudSource).toMatch(/dataset\['homeInput'\]/);
    expect(cssSource).toMatch(
      /\[data-home-input='off'\] \.ksheet\s*\{[^}]*bottom:\s*0/s,
    );
  });

  /*
   * ⚠ 가림을 z-index 로 덮으면 다른 화면에서 역가림이 재발한다 (계획 §4).
   * 층 번호는 K47 그대로여야 하고, 달라지는 것은 **누가 살아 있는가**뿐이다.
   */
  it('z-index 경쟁으로 풀지 않는다 — 시트 10 · 티커 11 · 바 10 그대로다', () => {
    expect(cssSource).toMatch(/\.ksheet\s*\{[^}]*z-index:\s*10;/s);
    expect(cssSource).toMatch(/\.kbar\s*\{[^}]*z-index:\s*10;/s);
    expect(cssSource).toMatch(/\.kticker\s*\{[^}]*z-index:\s*11;/s);
  });
});

describe('브라우저 게이트가 실제 소유권을 잰다', () => {
  it('시트 안 보이는 enabled 컨트롤을 중앙+네 inset 5점으로 훑는다', () => {
    expect(harnessSource).toContain('const OWNERSHIP_SWEEP');
    const sweep = harnessSource.slice(
      harnessSource.indexOf('const OWNERSHIP_SWEEP'),
      harnessSource.indexOf('const OWNERSHIP_SWEEP') + 3000,
    );
    expect(sweep).toContain('document.elementFromPoint');
    // 중앙 1점 + 네 모서리 inset = 5점. 한 점만 재면 가장자리 가림을 놓친다.
    const points = /const points = \[([\s\S]*?)\];/.exec(sweep)?.[1] ?? '';
    expect(points.match(/\[/g) ?? []).toHaveLength(5);
    expect(points).toContain('r.left + r.width / 2');
    expect(points).toContain('r.right - px');
    expect(points).toContain('r.bottom - py');
    expect(sweep).toContain('disabled');
    // 화면에 반만 걸친 버튼은 "보이는 버튼"이 아니다 (계획 §1.2).
    expect(sweep).toContain('contained');
  });

  it('메뉴 마지막 항목까지 실제 CDP 터치로 연다', () => {
    expect(harnessSource).toContain('메뉴 v3');
    expect(harnessSource).toMatch(/lastMenuAction/);
  });

  it('타이포그래피 최소값을 실제 computed font-size로 잰다', () => {
    expect(harnessSource).toContain('TYPOGRAPHY_SWEEP');
    const gate = harnessSource.slice(
      harnessSource.indexOf('const TYPOGRAPHY_SWEEP'),
      harnessSource.indexOf('const TYPOGRAPHY_SWEEP') + 2500,
    );
    expect(gate).toContain('getComputedStyle');
    expect(gate).toContain('fontSize');
  });
});
