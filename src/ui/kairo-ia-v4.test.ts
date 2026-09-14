/**
 * UI v4 — **IA 라우터 · 성장 목록 · 낱말 · 돈 · 사건 상자**의 단위 계약.
 *
 * 이 저장소의 검사 관례를 따른다: DOM 이 없는 환경이므로 **순수 함수와 소스 계약**을 잰다.
 * 화면에서만 드러나는 것(그려진 높이·터치 소유권)은 `tools/verify-kairo.ts` 의 브라우저
 * 절이 맡는다 — 좌표만 재는 검사로는 못 잡는 종류가 있다는 것을 이 저장소가 두 번 밟았다
 * (P3-C④ · UX 감사 P0-1).
 *
 * ⚠ 각 검사는 **되돌리면 빨간불**이 되는 형태로 쓴다. "지금 구현이 통과한다"만으로는
 * 아무것도 안 재는 검사가 된다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BAND_CELLS,
  MANAGE_LISTS,
  MANAGE_SCREENS,
  actionsForRoute,
  type ManagementMenuAction,
} from './kairo-management.js';
import { MANAGEMENT_GROUPS } from '../sim/kairo/meta.js';
import { certList, questList, regularList, wishList } from './kairo-growth.js';
import { conditionLine, conditionSubject, rewardLine, REPUTATION_NAME } from './kairo-terms.js';
import { won } from './money.js';
import { eventShellPlan } from './kairo-event-shell.js';
import { tickerFallbackText } from './kairo-ticker.js';
import type { QuestCondition } from '../sim/kairo/progress.js';

const cond = (over: Partial<QuestCondition> = {}): QuestCondition =>
  ({ kind: 'needSupply', value: 3, need: 'hygiene', ...over }) as QuestCondition;

const cssSource = readFileSync('src/ui/style.css', 'utf8');
const hudSource = readFileSync('src/ui/kairo-hud.ts', 'utf8');
const mainSource = readFileSync('src/main.ts', 'utf8');
const manageSource = readFileSync('src/ui/kairo-management.ts', 'utf8');
const courseSource = readFileSync('src/ui/kairo-course.ts', 'utf8');
const cardData = readFileSync('src/data/kairo-cards.json', 'utf8');

describe('밴드 — 목적지는 지도 위 일곱 칸이다 (P1)', () => {
  it('밴드는 일곱 칸이고 순서가 고정이며 건설만 그룹 밖이다', () => {
    expect(BAND_CELLS.map((c) => c.id)).toEqual([
      'build', 'course', 'kitchen', 'store', 'manage', 'goals', 'records',
    ]);
    // `건설` 만 `MANAGEMENT_GROUPS` 밖의 네이티브 칸이다
    expect(BAND_CELLS.filter((c) => c.id === 'build')).toHaveLength(1);
    expect(MANAGEMENT_GROUPS.map((g) => g.id)).toEqual(
      BAND_CELLS.filter((c) => c.id !== 'build').map((c) => c.id),
    );
  });

  it('항목이 하나인 그룹은 화면을 안 끼우고 바로 행동을 연다', () => {
    for (const cell of BAND_CELLS) {
      if (cell.id === 'build') continue;
      const group = MANAGEMENT_GROUPS.find((g) => g.id === cell.id)!;
      // 한 줄짜리 목록 화면을 한 겹 끼우면 탭이 공짜로 하나 는다
      expect(cell.direct === null).toBe(group.items.length > 1);
    }
  });

  it('깊이는 최대 2다 — 설정만 정보 아래 3단이다', () => {
    for (const screen of MANAGE_SCREENS) {
      if (screen.id === 'settings') {
        expect(screen.back).toBe('records');
        continue;
      }
      // 나머지는 밴드에서 바로 온다 — 시트 안에 인덱스가 없다
      expect(screen.back).toBeNull();
    }
    expect(MANAGE_SCREENS.map((s) => s.id)).not.toContain('index');
  });

  it('목적지의 행동은 sim 상수(MANAGEMENT_GROUPS)에서만 온다 — 화면이 만들어내지 않는다', () => {
    const actions: ManagementMenuAction[] = [
      { id: 'price', label: '가격', run: () => undefined },
      { id: 'course', label: '코스', run: () => undefined },
      { id: 'exam', label: '심사', run: () => undefined },
      { id: 'report', label: '결산', run: () => undefined },
      { id: 'quests', label: '의뢰', run: () => undefined },
      // 밴드의 네이티브 칸 — 어느 목적지에도 안 뜨는 것이 계약이다
      { id: 'build', label: '건설', run: () => undefined },
    ];
    const manage = actionsForRoute('manage', actions).map((a) => a.id);
    const goals = actionsForRoute('goals', actions).map((a) => a.id);
    const records = actionsForRoute('records', actions).map((a) => a.id);
    const course = actionsForRoute('course', actions).map((a) => a.id);
    expect(manage).toContain('price');
    expect(goals).toContain('quests');
    expect(records).toContain('report');
    expect(course).toEqual(['course']);
    // 어느 목적지에도 두 번 나오지 않는다 — 같은 행동이 두 화면에 있으면 어느 쪽이 진짜인지 모른다
    const all = [...manage, ...goals, ...records, ...course];
    expect(new Set(all).size).toBe(all.length);
    // `build` 는 그룹 밖이라 어디에도 안 뜬다
    expect(all).not.toContain('build');
  });

  it('의뢰·소원·인증·단골은 목표 화면의 섹션이고 목록 머리 id 를 보존한다', () => {
    expect(MANAGE_LISTS.map((l) => l.id)).toEqual(['quests', 'wishes', 'certs', 'regulars']);
    // 하네스가 닫힌 시트에서 읽는 손잡이 — 잃으면 조용히 빈 문자열을 읽는다
    for (const id of ['kairo-quests-list', 'kairo-cert-list', 'kairo-regular-list']) {
      expect(manageSource).toContain(id);
    }
    // 목록 호스트는 DOM 에서 빼지 않고 hidden 으로만 감춘다 (textContent 는 hidden 을 무시한다)
    expect(manageSource).toContain("this.listHost.hidden = def.id !== 'goals';");
    // 넷은 `목표` 안에서 **전부 같이** 보인다 — 종류로 갈라 놓으면 "어디였더라"가 다시 생긴다
    expect(manageSource).toContain('for (const node of this.listSections.values()) node.hidden = false;');
  });

  it('오늘 할 일은 메뉴가 다시 그리지 않는다 — 홈 밴드의 복창을 만들지 않는다', () => {
    // 노드는 남지만 DOM 에 안 붙는다. 붙이면 홈과 두 곳에서 같은 문장을 말한다
    expect(manageSource).toContain('this.todayButton = el(');
    expect(manageSource).not.toContain('today.append(this.todayButton)');
  });
});

describe('성장 목록 — 조건에 주어가 붙고 빈 상태가 언제나 있다', () => {
  it('조건 줄이 주어를 낸다 — 무엇이 3개인지 화면이 말한다', () => {
    expect(conditionSubject(cond())).toBe('위생 시설');
    expect(conditionSubject(cond({ kind: 'exitSatisfaction' }))).toBe(REPUTATION_NAME);
    expect(conditionSubject(cond({ kind: 'swimAreaMax' }))).toBe('가장 큰 물놀이 구역');
    // 선행 `·` 를 붙이지 않는다 — 마커는 호출자가 갖는다
    expect(conditionLine(cond(), '1 / 3개')).toBe('위생 시설 1 / 3개');
    expect(conditionLine(cond(), '1 / 3개').startsWith('·')).toBe(false);
  });

  it('목록 안의 유일한 반말 서술을 목록 문체로 바꾼다', () => {
    expect(conditionLine(cond({ kind: 'maxTurnedAway' }), '아직 한 주를 안 돌렸다'))
      .toContain('첫 결산 뒤 판정');
  });

  it('보상어가 한 낱말이다 — `정원`은 시설 정원과 헷갈린다', () => {
    expect(rewardLine({ capacity: 6, permitArea: 40 })).toBe('동시 입장 +6명 · 수면 허가 +40칸');
  });

  it('의뢰는 전량이다 — 6개로 잘라내지 않는다', () => {
    const items = Array.from({ length: 16 }, (_, i) => ({
      id: `q${i}`, name: `의뢰 ${i}`, desc: '설명', detail: '0 / 3개',
      cond: cond(), progress: 0, done: false, reward: 100_000, claimed: false,
    }));
    const list = questList(items, '2등급');
    expect(list.rows).toHaveLength(16);
    expect(list.count).toBe('0 / 16');
    expect(list.rows[0]?.lines.some((l) => l.includes('위생 시설'))).toBe(true);
  });

  it('네 목록 전부 빈 상태가 사실 + 방법이다 — `없음` 한 단어가 없다', () => {
    const lists = [
      questList([], '2등급'),
      wishList([]),
      certList([], '가장 가까운 것은 위생 인증입니다'),
      regularList([]),
    ];
    for (const list of lists) {
      expect(list.empty.fact.length).toBeGreaterThan(4);
      expect(list.empty.how.length).toBeGreaterThan(4);
      expect(list.empty.fact).not.toBe('없음');
      expect(list.empty.how).not.toBe('—');
    }
  });

  it('단골은 안 만난 인물도 행으로 남는다 — 버튼이 조용한 no-op 이 되지 않는다', () => {
    const list = regularList([
      { id: 'minji', name: '민지', met: false, stage: 0, stages: 3, want: '', how: '', done: false },
      { id: 'suyeon', name: '수연', met: true, stage: 1, stages: 3, want: '“식혜 주세요”', how: '', done: false },
    ]);
    expect(list.rows).toHaveLength(2);
    expect(list.rows[0]?.name).toContain('아직 안 만났습니다');
    expect(list.count).toBe('1 / 2');
  });

  it('모든 행이 자기 사건 상자 내용을 갖는다 — 목록은 훑고 상세는 장면으로 읽는다', () => {
    const list = certList(
      [{
        id: 'c1', name: '위생 인증', desc: '깨끗한 빠지',
        reqs: [{ detail: '1 / 3개', done: false, cond: cond() }],
        progress: 0.3, earned: false, reward: { capacity: 6 },
      }],
      '힌트',
    );
    const row = list.rows[0];
    expect(row?.event.title).toBe('위생 인증');
    expect(row?.event.body).toContain('위생 시설 1 / 3개');
    expect(row?.event.body).toContain('동시 입장 +6명');
  });
});

describe('돈 눈금은 하나다', () => {
  it('0 은 단위가 있다 — 뜻 모를 0 을 내지 않는다', () => {
    expect(won(0)).toBe('0원');
  });

  it('만 미만은 원으로 떨어진다 — 유지비 2,700원을 `0만`이라 쓰지 않는다', () => {
    expect(won(2700)).toBe('2,700원');
    expect(won(310_000)).toBe('31만');
    expect(won(128_000_000)).toBe('1억 2,800만');
    expect(won(-250_000, { signed: true })).toBe('−25만');
  });

  it('코스 독과 결산이 같은 포맷터를 쓴다 — 사본을 다시 만들지 않는다', () => {
    expect(courseSource).toContain("import { won } from './money.js';");
    expect(courseSource).not.toMatch(/^function won\(/m);
    expect(readFileSync('src/ui/kairo-report.ts', 'utf8')).not.toMatch(/^function won\(/m);
  });
});

describe('사건 상자 — 배경 슬롯이 자기 상태를 말한다', () => {
  it('그림이 없으면 무대가 `placeholder` 다 (있다고 주장하지 않는다)', () => {
    const plan = eventShellPlan({
      kind: 'growth:quests', mood: 'quest', title: '먹거리를 갖추자', choices: [],
    });
    expect(plan.stage).toBe('placeholder');
    expect(plan.figureText).toBe('📜');
  });

  it('첫 선택지가 주버튼이고, 명시하면 그것이 이긴다', () => {
    const plan = eventShellPlan({
      kind: 'new-game-confirm', mood: 'alert', title: '지금 판을 지웁니다',
      choices: [
        { id: 'cancel', label: '취소', run: () => undefined },
        { id: 'wipe', label: '지우고 시작', danger: true, run: () => undefined },
      ],
    });
    expect(plan.choices[0]?.primary).toBe(true);
    expect(plan.choices[1]?.primary).toBe(false);
    // 되돌릴 수 없는 쪽이 주버튼이면 안 된다
    expect(plan.choices.find((c) => c.danger)?.primary).toBe(false);
  });

  it('자리표시 무대는 토큰만 쓴다 — TS 에 색이 없고 CSS 에 상태 선택자가 있다', () => {
    expect(readFileSync('src/ui/kairo-event-shell.ts', 'utf8')).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(cssSource).toContain("[data-stage-state='placeholder']");
    expect(cssSource).toContain('.kevent-choices');
  });

  it('축하·주간 카드·새 게임 확인이 같은 상자를 쓴다 — 표면을 늘리지 않는다', () => {
    for (const file of ['kairo-unlock.ts', 'kairo-card.ts', 'kairo-newgame.ts']) {
      expect(readFileSync(`src/ui/${file}`, 'utf8')).toContain('kairo-event-shell.js');
    }
    // 브라우저 네이티브 확인창은 게임 밖 표면이라 팔레트·44px·한국어 계약이 안 걸린다
    expect(readFileSync('src/ui/kairo-newgame.ts', 'utf8')).not.toContain('window.confirm');
  });
});

describe('문구가 지금 상태를 말한다', () => {
  it('티커는 화면에 없는 `목표 A`를 가리키지 않는다', () => {
    expect(tickerFallbackText('첫 코스 열기')).not.toContain('목표 A');
  });

  it('심사 접수가 sim 원 키를 세 표면에 뿌리지 않는다', () => {
    expect(mainSource).not.toContain('`${c.kind} ${c.value}`');
    expect(mainSource).toContain('conditionSubject(c)');
  });

  it('카드 detail 이 돈을 다시 적지 않는다 — 실효값은 화면이 만든다', () => {
    const data = JSON.parse(cardData) as { cards: { options: { detail: string }[] }[] };
    const restated = data.cards
      .flatMap((c) => c.options)
      .filter((o) => /만원|주급|주 \d+만/.test(o.detail));
    expect(restated).toEqual([]);
  });

  it('코스의 세 선택 행이 같은 구조다 — 하나만 감싸면 나머지가 2px 로 접힌다', () => {
    expect(courseSource).toContain('presetRow.append(this.presetBar)');
    expect(courseSource).toContain('boatRow.append(this.boatBar)');
    /*
     * 스크롤 줄은 **접히지도 넘치지도 않는다** — 축이 둘이라 규칙도 둘이다.
     *
     * ⚠ 예전 가드는 `flex: 0 0 auto` **하나**를 요구했다. 그건 P3-C④(`.ksheet-body >
     * .kchips` 가 **세로** flex 에서 2px 로 접힘)의 처방인데, 이 줄들의 부모는
     * `.kcourse-row` 라 **가로** flex 다. 가로에서 `0 0 auto` 는 "줄어들지 마라"라
     * 377px 줄 안에서 스크롤러가 **450px 로 벌어져** 칩이 화면 밖 566px 까지 나갔다
     * (실측, 사용자 스크린샷 2026-08-27). 축을 안 보고 처방만 옮긴 것이 원인이다.
     *
     * 그래서 지금은 둘 다 잰다 — `min-width: 0` 이 넘침을, `min-height` 가 접힘을 막는다.
     * 자동 최소 크기가 0 으로 떨어지는 성질 자체는 두 축에 다 있고, 스크롤 축이 아닌 쪽을
     * 명시적으로 받쳐야 한다.
     */
    const presets = /\.kcourse-presets,\s*\n\.kcourse-options\s*\{([^}]*)\}/s.exec(cssSource);
    expect(presets).not.toBeNull();
    const decl = presets?.[1] ?? '';
    expect(decl).toMatch(/min-width:\s*0/);
    expect(decl).toMatch(/min-height:\s*calc\(var\(--tap\)/);
    expect(decl).toMatch(/overflow-x:\s*auto/);
    // ⚠ 가로 축에서 `flex: 0 0 auto` 로 되돌리지 말 것 — 그것이 넘침의 원인이었다
    expect(decl).not.toMatch(/flex:\s*0 0 auto/);
  });
});

/**
 * ── Q6: 건설 시트의 두 줄은 **같은 층이 아니다** ────────────────────────────
 *
 * ⚠ 실측(2026-08-28): 머리(58px)와 필터 줄(52px)이 거의 같은 무게라 **컨트롤 8개가
 * 2줄**로 읽혔다 (사용자 지적: *"건설 ui도 2줄로 보이고 건설 종류 배치도 좀 애매한 것 같아"*).
 * 계층이 **색으로만** 있었기 때문이다 (노랑 탭 vs 파랑 칩).
 */
describe('Q6 — 건설 시트의 계층', () => {
  it('2차 필터가 낱말로 자기 층을 말한다', () => {
    expect(hudSource).toContain("el('div', 'kchips sub')");
    expect(hudSource).toContain("el('span', 'kchips-label', '분류')");
  });

  it('★ 2차 줄이 탭보다 가볍다 — 색이 아니라 크기가 계층을 말한다', () => {
    const sub = /\.kchips\.sub \.kbtn\s*\{([^}]*)\}/s.exec(cssSource);
    expect(sub).not.toBeNull();
    // 글씨가 한 급 작다
    expect(sub?.[1]).toMatch(/font-size:\s*var\(--fs-tiny\)/);
    const label = /\.kchips-label\s*\{([^}]*)\}/s.exec(cssSource);
    expect(label?.[1]).toMatch(/font-size:\s*var\(--fs-tiny\)/);
  });

  it('⚠ 터치 타깃은 안 줄인다 — 줄여야 하는 것은 무게이지 표적이 아니다', () => {
    const sub = /\.kchips\.sub \.kbtn\s*\{([^}]*)\}/s.exec(cssSource);
    // 높이/min-height 를 건드리지 않았는지 — `.kbtn` 의 44px 하한이 그대로 산다
    expect(sub?.[1]).not.toMatch(/min-height|height:/);
  });

  it('⚠ 선택 채움 계약은 안 건드린다 (노랑 = 메인 · 파랑 = 2차)', () => {
    // 이 줄들이 사라지면 K46 의 「선택됨은 채움이다」가 무너진다
    expect(cssSource).toMatch(/--select-fill/);
    expect(cssSource).toMatch(/--select-sub/);
  });
});
