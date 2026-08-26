import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tickerFallbackText } from './kairo-ticker.js';

const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

const rule = (selector: string): string => {
  const re = new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  return re.exec(cssSource)?.[1] ?? '';
};
const goalsRule = rule('.kgoals');

describe('카이로 홈 화면 계약', () => {
  it('헤더 버튼 0개, 하단 상시 버튼 2개를 유지한다', () => {
    const header = hudSource.slice(
      hudSource.indexOf('── 상단 2단 헤더'),
      hudSource.indexOf('홈 셸 v2:'),
    );
    const bottom = hudSource.slice(
      hudSource.indexOf('── 하단 바 (K47-②)'),
      hudSource.indexOf('── 시트 (건설·메뉴 공용)'),
    );

    expect(header).not.toContain("el('button'");
    expect(bottom.match(/el\('button'/g)).toHaveLength(2);
    expect(bottom).toContain("id = 'kairo-menu-open'");
    expect(bottom).toContain("id = 'kairo-build-open'");
  });

  it('직접 행동 목표의 터치 타깃은 style.css의 44px 토큰을 쓴다', () => {
    expect(cssSource).toMatch(/--tap:\s*44px/);
    expect(cssSource).toMatch(/\.kgoal\.tap\s*\{[^}]*min-height:\s*var\(--tap\)/s);
  });

  it('세로 3장 기둥을 제거하고 A/B/C 한 밴드 DOM을 만든다', () => {
    expect(hudSource).not.toContain("el('div', 'kchipcol')");
    expect(hudSource).not.toContain("el('div', 'kchiplist')");
    expect(hudSource).toContain("el('div', 'kgoals')");
    expect(hudSource).toContain("el('div', 'kgoal-primary')");
    expect(hudSource).toContain("el('div', 'kgoal-secondary')");
    // A 가 DOM 에서도 먼저다 — 읽는 순서와 보이는 순서가 갈리면 안 된다.
    expect(hudSource).toContain('this.goalBox.append(this.primaryGoal, this.secondaryGoals)');
    expect(rule('.kgoal-secondary')).toMatch(/grid-template-columns:\s*repeat\(2,/);
  });

  it('즉시 목표 제목은 말줄임표 계약이 없고 목표 표면은 hidden 정체를 쓴다', () => {
    expect(cssSource).toMatch(/\.kgoal-primary \.kgoal-label\s*\{[^}]*text-overflow:\s*clip;/s);
    expect(cssSource).toMatch(/\.kgoals\[hidden\]\s*\{[^}]*display:\s*none;/s);
    expect(hudSource).toContain("dataset['goalSurface']");
  });

  /*
   * ⚠ 홈 셸 v2 회귀 — 목표 루트가 `position: fixed; inset: 0` 이라 **자기 상자로
   * 화면 전체를 덮었다.** 칠하는 것은 A 카드와 B/C 칩 둘뿐인데, HUD 예산 검사가
   * `document.body.children` 의 **경계 상자**를 재므로 세로·가로 모두 100% 가 됐고
   * "시트를 닫으면 화면이 돌아온다"까지 같이 깨졌다 (닫힘 100% → 열림 46% → 닫힘 100%).
   */
  it('목표 루트는 화면이 아니라 64px 밴드다 — 칠하는 것이 곧 상자다', () => {
    expect(goalsRule).not.toMatch(/inset:\s*0/);
    expect(goalsRule).toMatch(/height:\s*var\(--goal-band\)/);
    expect(goalsRule).toMatch(/display:\s*flex/);
    // 가로에서 852px 현수막이 되지 않도록 폰 한 칸 폭으로 캡한다.
    expect(goalsRule).toMatch(/max-width:\s*var\(--goal-col\)/);
    expect(cssSource).toMatch(/--goal-band:\s*64px/);
    expect(cssSource).toMatch(/--goal-col:\s*377px/);
    // 헤더 실측으로 B/C 를 띄우던 배선은 한 밴드가 되면서 사라진다.
    expect(cssSource).not.toContain('--goal-secondary-top');
    expect(hudSource).not.toContain('--goal-secondary-top');
  });

  /*
   * 한 밴드 안의 몫 — A 약 60% · B/C 각 약 20% (주인님 지시, 2026-08-25).
   * 세 카드 모두 64px 라 터치 44px 계약은 높이로 지켜진다.
   */
  it('밴드 안에서 A가 주역이고 B/C는 아이콘+진행 축약이다', () => {
    expect(rule('.kgoal-primary')).toMatch(/flex:\s*3\s/);
    expect(rule('.kgoal-secondary')).toMatch(/flex:\s*2\s/);
    // 축약 카드의 글자는 CSS 가 감춘다 (aria-label 은 남는다) — 묶음 규칙이라 함께 본다.
    expect(cssSource).toMatch(
      /\.kgoal-secondary \.kgoal-label,\s*\n\.kgoal-secondary \.kgoal-detail\s*\{[^}]*display:\s*none/s,
    );
    expect(rule('.kgoal-primary .kgoal')).toMatch(/min-height:\s*var\(--goal-band\)/);
    expect(rule('.kgoal-secondary .kgoal')).toMatch(/min-height:\s*var\(--goal-band\)/);
  });

  /*
   * ⚠ 그리고 **경계 상자를 재는 쪽도 같이 고쳐야 한다.** 루트만 통과 상자로 만들면
   * HUD 예산이 A 카드와 B/C 를 아예 안 세게 되어, 예산이 내려간 게 아니라
   * "안 재는 검사"가 된다 (CLAUDE.md 「검사가 조용히 통과」).
   */
  it('HUD 예산은 통과 상자를 뚫고 실제 칠하는 자식을 잰다', () => {
    expect(harnessSource).toMatch(/display\s*===\s*'contents'/);
  });

  it('코스 진입점은 하나다 — kairo-course-open id 중복 금지', () => {
    expect(mainSource.match(/'kairo-course-open'/g) ?? []).toHaveLength(1);
    expect(mainSource).toContain("domId: 'kairo-course-open'");
  });

  it('뉴스가 없으면 자리표시자 대신 다음 즉시 행동을 안내한다', () => {
    const text = tickerFallbackText('물려받은 코스 시험 운행');
    expect(text).toContain('물려받은 코스 시험 운행');
    expect(text).not.toContain('소식이 여기 흐릅니다');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('메뉴 장착 A 행동은 방금 지은 craft 시설의 실제 메뉴 시트를 연다', () => {
    expect(mainSource).toMatch(
      /onboarding\.step === 'equip-menu'[\s\S]*?firstCraftMenuFacility\(\)[\s\S]*?openMenuLab\(target\.handle\)/,
    );
    expect(mainSource).toMatch(
      /firstCraftMenuFacility[\s\S]*?def\?\.menuMode === 'craft'/,
    );
  });

  it('단골 구매 A 행동은 닫힌 공용 메뉴 시트를 먼저 열고 실제 목록으로 이동한다', () => {
    expect(mainSource).toMatch(
      /const scrollMenuTo[\s\S]*?hud\.showMenu\(\)[\s\S]*?refreshQuests\(\)[\s\S]*?scrollIntoView/,
    );
    expect(mainSource).toMatch(
      /onboarding\.step === 'equip-menu'[\s\S]*?openMenuLab\(target\.handle\)[\s\S]*?scrollMenuTo\('kairo-regular-list'\)/,
    );
  });

  it('경영 시트는 불투명 크림 토큰을 쓰고 등장 애니메이션도 표면 opacity를 낮추지 않는다', () => {
    const sheetAnimation = cssSource.slice(
      cssSource.indexOf('@keyframes ksheet-in'),
      cssSource.indexOf('.ksheet[hidden]'),
    );
    expect(cssSource).toMatch(/--sheet-bg:\s*rgb\(240 202 138\);/);
    expect(sheetAnimation).not.toContain('opacity');
  });

  it('role button도 감사 대상이며 티커·알림 행은 44px hit surface를 갖는다', () => {
    const hudAudit = harnessSource.slice(
      harnessSource.indexOf('const MEASURE_HUD'),
      harnessSource.indexOf('터치가 없는 키보드'),
    );
    expect(hudAudit).toContain("button, select, input, [role=\"button\"]");
    expect(mainSource).not.toContain('PPAJI_BUILD_WORKTREE');
    expect(cssSource).toMatch(/\.kticker\s*\{[^}]*height:\s*26px/s);
    expect(cssSource).toMatch(/\.kticker\s*\{[^}]*z-index:\s*11[^}]*pointer-events:\s*none/s);
    expect(cssSource).toMatch(
      /\.kticker-hit\s*\{[^}]*left:\s*50%[^}]*width:\s*var\(--tap\)[^}]*min-height:\s*var\(--tap\)[^}]*pointer-events:\s*auto/s,
    );
    expect(cssSource).toMatch(/\.kinbox-row\.open\s*\{[^}]*min-height:\s*var\(--tap\)/s);
    const shellV2 = harnessSource.slice(
      harnessSource.indexOf('if (SHELL_V2_ONLY)'),
      harnessSource.indexOf('코스 v2 실제 터치'),
    );
    expect(shellV2).toContain('document.elementFromPoint');
    expect(shellV2).toContain("type: 'touchStart'");
    expect(shellV2).toContain('inboxOpened');
  });
});
