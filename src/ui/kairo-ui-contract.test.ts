import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tickerFallbackText } from './kairo-ticker.js';

const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const manageSource = readFileSync(new URL('./kairo-management.ts', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

/**
 * 규칙별 `font-size` — 선택자가 `prefix` 로 시작하는 규칙만 모은다.
 *
 * ⚠ 상속 때문에 정적 검사만으로는 "화면에 몇 px 인가"를 못 말한다. 그래서 이 검사는
 * **규칙에 적힌 값**만 지키고, 그려진 값은 `verify-kairo` 의 `TYPOGRAPHY_SWEEP` 이
 * `getComputedStyle` 로 잰다. 둘 다 있어야 한 쪽이 조용히 갈라지지 않는다.
 */
const fontSizesUnder = (prefix: string): { selector: string; size: number }[] => {
  const body = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { selector: string; size: number }[] = [];
  for (const match of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = (match[1] ?? '').trim();
    if (!selector.split(',').some((part) => part.trim().startsWith(prefix))) continue;
    const size = /font-size:\s*([\d.]+)px/.exec(match[2] ?? '');
    if (size) out.push({ selector, size: Number(size[1]) });
  }
  return out;
};

const rule = (selector: string): string => {
  const re = new RegExp(`\\n${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  return re.exec(cssSource)?.[1] ?? '';
};
const goalsRule = rule('.kgoals');

describe('카이로 홈 화면 계약', () => {
  it('헤더 버튼 0개, 하단 상시 버튼 2개를 유지한다', () => {
    const header = hudSource.slice(
      hudSource.indexOf('── 상단 2단 헤더'),
      hudSource.indexOf('홈 셸 v3'),
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

  /*
   * UI v3 (2026-08-26) — 세로 3장 기둥도, A/B/C 세 칸도 홈에 없다. 밴드에는
   * **현재 행동 한 줄**만 남는다 (계획 §1.1).
   */
  it('홈 밴드는 현재 행동 한 줄이다 — 기둥도 B/C 축약 카드도 없다', () => {
    expect(hudSource).not.toContain("el('div', 'kchipcol')");
    expect(hudSource).not.toContain("el('div', 'kchiplist')");
    expect(hudSource).not.toContain("el('div', 'kgoal-secondary')");
    expect(hudSource).toContain("el('div', 'kgoals')");
    expect(hudSource).toContain("el('div', 'kgoal-primary')");
    expect(hudSource).toContain('this.goalBox.append(this.primaryGoal)');
    // 뜻은 글로 말한다 — 안내(다음 할 일)·이름·상세 셋이 DOM 에 있다
    expect(hudSource).toContain("el('div', 'kgoal-kicker'");
    expect(hudSource).toContain("el('div', 'kgoal-label'");
    expect(hudSource).toContain("el('div', 'kgoal-detail'");
  });

  it('즉시 목표 제목은 말줄임표 계약이 없고 목표 표면은 hidden 정체를 쓴다', () => {
    expect(rule('.kgoal-label')).toMatch(/text-overflow:\s*clip;/);
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
   * ⚠ v2 는 A 60% · B/C 각 20% 였고, 폭 70px 의 B/C 는 label/detail 을 CSS 가
   * `display:none` 으로 감춰 **화면에 하트·별만** 남았다 (2026-08-26 실측).
   * 아이콘만 있는 주요 행동은 금지이므로(§1.3) 그 감추기 규칙 자체가 사라져야 한다.
   */
  it('밴드는 통째로 현재 행동의 것이고 글자를 감추는 규칙이 없다', () => {
    expect(rule('.kgoal-primary')).toMatch(/flex:\s*1\s/);
    expect(cssSource).not.toContain('.kgoal-secondary');
    expect(rule('.kgoal-primary .kgoal')).toMatch(/min-height:\s*var\(--goal-band\)/);
  });

  /*
   * ⚠ 그리고 **경계 상자를 재는 쪽도 같이 고쳐야 한다.** 루트만 통과 상자로 만들면
   * HUD 예산이 A 카드와 B/C 를 아예 안 세게 되어, 예산이 내려간 게 아니라
   * "안 재는 검사"가 된다 (CLAUDE.md 「검사가 조용히 통과」).
   */
  it('HUD 예산은 통과 상자를 뚫고 실제 칠하는 자식을 잰다', () => {
    expect(harnessSource).toMatch(/display\s*===\s*'contents'/);
  });

  /*
   * UI v3 타이포그래피 계약 (계획 §1.3) — 393×852 에서 **9px 사용 금지**.
   *
   * ⚠ 옛 메뉴는 4열을 유지하려고 글자를 줄였다: Today 이유 9px · 상세 9px · 경고 9px ·
   * 그룹 제목 10px. 열 수가 원인이므로 **열을 줄이고 글자를 키우는 것이 한 묶음**이다 —
   * 글자만 키우면 다시 잘리고, 열만 줄이면 다음 사람이 글자를 안 키운다.
   */
  it('홈·메뉴의 행동 글씨에 12px 미만이 없다', () => {
    const tiny = [...fontSizesUnder('.kmanage'), ...fontSizesUnder('.kgoal')]
      .filter((rule) => rule.size < 12);
    expect(tiny).toEqual([]);
  });

  it('이름 15px · 상세 13px · 주요 행동 16px 최소를 규칙이 지킨다', () => {
    expect(rule('.kmanage-label')).toMatch(/font-size:\s*15px/);
    expect(rule('.kmanage-label')).toMatch(/font-weight:\s*800/);
    expect(rule('.kmanage-detail')).toMatch(/font-size:\s*13px/);
    expect(rule('.kmanage-action.primary')).toMatch(/font-size:\s*16px/);
    // 주요 행동은 48px 이상, 나머지는 기존 44px 최소 (§1.3)
    expect(rule('.kmanage-action.primary')).toMatch(/min-height:\s*(6[89]|[7-9]\d)px/);
    expect(rule('.kmanage-action')).toMatch(/min-height:\s*var\(--tap\)/);
    expect(rule('.kgoal-label')).toMatch(/font-size:\s*15px/);
    expect(rule('.kgoal-detail')).toMatch(/font-size:\s*13px/);
  });

  it('시트 제목은 18px·900 이상이다 — 화면 제목을 본문 크기로 내리지 않는다', () => {
    expect(rule('.ksheet-title')).toMatch(/font-size:\s*(?:1[89]|[2-9]\d)px/);
    expect(rule('.ksheet-title')).toMatch(/font-weight:\s*900/);
  });

  it('393px 메뉴는 4열을 쓰지 않는다 — 최대 2열', () => {
    const grid = rule('.kmanage-grid');
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(grid).not.toMatch(/repeat\((?:[34]|[5-9]),/);
    // 운영 그룹만 3열이던 예외도 같이 사라진다 (열 수는 한 곳이 정한다)
    expect(cssSource).not.toMatch(
      /\[data-manage-group='operations'\] \.kmanage-grid\s*\{[^}]*repeat\(3,/s,
    );
  });

  /*
   * `새 판`을 정상 운영 버튼에서 분리한다 (계획 §1.4).
   * 기존 `KairoNewGame` 선택 화면과 그 `window.confirm` 안전장치는 그대로 둔다 —
   * 맵/시나리오 선택 뒤 두 번째 확인이 이미 그 계약이다.
   */
  it('새 게임은 설정 하위 항목이고 배속과 같은 위계가 아니다', () => {
    // ⚠ 주석은 뺀다 — `check-ui-surface.mjs` 와 같은 이유로, 왜 옮겼는지를 코드에 남긴다
    const code = mainSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toContain('kmanage-utility');
    expect(cssSource).not.toContain('.kmanage-utility');
    expect(mainSource).toMatch(/label:\s*'새 게임'/);
    expect(mainSource).toMatch(/label:\s*'새 게임 시작'/);
    expect(mainSource).toMatch(/destructive:\s*true/);
    expect(mainSource).toMatch(/되돌릴 수 없습니다/);
    // 손잡이는 보존한다 — 하네스가 이 id 로 새 판 화면을 연다
    expect(mainSource).toContain("domId: 'kairo-newgame-open'");
    /*
     * 파괴적 확인은 여전히 새 게임 화면이 갖는다 (여기서 다시 만들지 않는다).
     *
     * ⚠ UI v4 부터 **게임 안의 2단 확인**이다. 브라우저 네이티브 확인창은 게임 밖
     * 표면이라 크림 팔레트·44px 터치·한국어 문구 계약이 하나도 안 걸리고, iOS 홈 화면
     * PWA 에서 모양이 또 달랐다 (IA §6.6). 되돌리면 이 검사가 빨간불이 된다.
     */
    const newGameSource = readFileSync(new URL('./kairo-newgame.ts', import.meta.url), 'utf8');
    expect(newGameSource).toContain('kairo-newgame-confirm');
    expect(newGameSource).toContain('지금 판을 지웁니다');
    expect(newGameSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('window.confirm');
  });

  it('메뉴가 홈에서 뺀 중·장기 목표를 실제로 그린다', () => {
    expect(manageSource).toContain('managementGoalRows');
    expect(manageSource).toContain("dataset['goalRole']");
    expect(manageSource).toContain('kmanage-goal-term');
    expect(manageSource).toContain('settingsItemView');
    /*
     * UI v4 — 목적지는 **라우터 표**가 만든다. 예전에는 `settings` 문자열이 조립 코드에
     * 박혀 있었는데, 이제 `MANAGE_ROUTES` 가 정본이고 화면이 그 id 를 그대로 단다.
     * 표를 지우거나 `설정` 을 빼면 이 검사가 빨간불이 된다.
     */
    expect(manageSource).toContain("{ id: 'settings', label: '설정'");
    expect(manageSource).toContain("screen.dataset['manageGroup'] = route.id;");
    expect(manageSource).toContain("screen.dataset['manageScreen'] = route.id;");
    expect(mainSource).toContain('onMenuGoals');
  });

  it('코스 진입점은 하나다 — kairo-course-open id 중복 금지', () => {
    expect(mainSource.match(/'kairo-course-open'/g) ?? []).toHaveLength(1);
    expect(mainSource).toContain("domId: 'kairo-course-open'");
  });

  /*
   * UI v4 — 띠는 **자기 채널의 상태**만 말한다 (UX 감사 P0-7).
   *
   * 옛 계약은 "뉴스가 없으면 다음 즉시 행동을 안내한다"였는데, 그 문구가
   * (a) 화면에 없는 `목표 A` 를 가리켰고 (b) 바로 위 목표 밴드의 복창이었다.
   * 아래 검사는 **되돌리면 빨간불**이 되도록 그 두 형태를 직접 막는다.
   */
  it('뉴스가 없으면 현재 즉시 목표를 다음 행동으로 안내한다', () => {
    const text = tickerFallbackText('물려받은 코스 시험 운행');
    expect(text).toContain('다음 행동');
    expect(text).toContain('물려받은 코스 시험 운행');
    expect(text).not.toContain('목표 A');
    expect(text).not.toContain('다음:');
    expect(text.trim().length).toBeGreaterThan(0);
    // 홈 밴드의 문장을 티커로 흘려보내는 배선이 남아 있으면 채널 중복이 돌아온다
    expect(mainSource).toMatch(/ticker\.setFallback\(immediate\.label\)/);
  });

  it('메뉴 장착 A 행동은 방금 지은 craft 시설의 실제 메뉴 시트를 연다', () => {
    expect(mainSource).toMatch(
      /onboarding\.step === 'equip-menu'[\s\S]*?firstCraftMenuFacility\(\)[\s\S]*?openMenuLab\(target\.handle\)/,
    );
    expect(mainSource).toMatch(
      /firstCraftMenuFacility[\s\S]*?def\?\.menuMode === 'craft'/,
    );
  });

  /*
   * UI v4 — 목적지는 **연다** (IA 재설계 §4.1 · UX 감사 P0-2).
   *
   * 옛 계약은 `scrollMenuTo` + `scrollIntoView` 였다. 그런데 `#kairo-regular-list` 는
   * 열린 소원이 있을 때만 만들어졌고, 새 판에서는 앵커가 없어 `scrollIntoView` 가
   * **조용한 no-op** 이었다 — 온보딩 6·7단계가 그 버튼을 Today 주버튼으로 띄우는데
   * 화면이 아무 반응도 안 했다. 이제 라우터가 자기 화면을 연다.
   */
  it('단골 구매 A 행동은 공용 메뉴 시트를 열고 단골 화면으로 라우팅한다', () => {
    expect(mainSource).toMatch(
      /const openManageScreen[\s\S]*?hud\.showMenu\(\)[\s\S]*?refreshQuests\(\)[\s\S]*?management\.show\(id\)/,
    );
    expect(mainSource).toMatch(
      /onboarding\.step === 'equip-menu'[\s\S]*?openMenuLab\(target\.handle\)[\s\S]*?openManageScreen\('regulars'\)/,
    );
    // 목록으로 튀는 옛 경로가 남아 있으면 같은 no-op 이 돌아온다
    expect(mainSource).not.toContain('scrollIntoView');
    expect(mainSource).not.toContain('scrollMenuTo');
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
    /*
     * ⚠ 슬라이스 경계가 **함수 이름**이다 — 예전에는 `if (SHELL_V2_ONLY)` 부터였는데,
     * 그 블록이 플래그 뒤에만 있는 것 자체가 결함이었다 (기본 verify 경로가 이 36건을
     * 하나도 안 돌렸다). 이제 본문은 `runShellV3Suite()` 이고 플래그는 지름길이다.
     */
    const shellV2 = harnessSource.slice(
      harnessSource.indexOf('async function runShellV3Suite'),
      harnessSource.indexOf('코스 v2 실제 터치'),
    );
    expect(shellV2).toContain('document.elementFromPoint');
    expect(shellV2).toContain("type: 'touchStart'");
    expect(shellV2).toContain('inboxOpened');
  });
});
