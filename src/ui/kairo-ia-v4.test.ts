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
  MANAGE_LISTS,
  MANAGE_ROUTES,
  MANAGE_SCREENS,
  actionsForRoute,
  manageScreen,
  type ManagementMenuAction,
} from './kairo-management.js';
import { certList, questList, regularList, wishList } from './kairo-growth.js';
import { conditionLine, conditionSubject, rewardLine, REPUTATION_NAME } from './kairo-terms.js';
import { won } from './money.js';
import { eventShellPlan } from './kairo-event-shell.js';
import { tickerFallbackText } from './kairo-ticker.js';
import type { QuestCondition } from '../sim/kairo/progress.js';

const cond = (over: Partial<QuestCondition> = {}): QuestCondition =>
  ({ kind: 'needSupply', value: 3, need: 'hygiene', ...over }) as QuestCondition;

const cssSource = readFileSync('src/ui/style.css', 'utf8');
const mainSource = readFileSync('src/main.ts', 'utf8');
const manageSource = readFileSync('src/ui/kairo-management.ts', 'utf8');
const courseSource = readFileSync('src/ui/kairo-course.ts', 'utf8');
const cardData = readFileSync('src/data/kairo-cards.json', 'utf8');

describe('L1 라우터 — 메뉴는 목적지를 고르는 한 장이다', () => {
  it('인덱스는 네 목적지만 갖고 설정이 마지막이다', () => {
    expect(MANAGE_ROUTES.map((r) => r.id)).toEqual([
      'operations', 'growth', 'records', 'settings',
    ]);
    // `설정` 이 중간에 있으면 아무도 못 찾는다 (실측: 옛 메뉴에서 전체 스크롤의 66% 지점)
    expect(MANAGE_ROUTES[MANAGE_ROUTES.length - 1]?.id).toBe('settings');
  });

  it('깊이는 최대 3이다 — 목록 넷만 성장 아래 3단이다', () => {
    for (const screen of MANAGE_SCREENS) {
      if (screen.id === 'index') {
        expect(screen.back).toBeNull();
        continue;
      }
      expect(screen.back).not.toBeNull();
      // 3단(목록)의 부모는 반드시 `growth`, 2단의 부모는 반드시 `index`
      const parent = manageScreen(screen.back!);
      expect(parent.back === null || parent.back === 'index').toBe(true);
    }
    for (const list of MANAGE_LISTS) {
      expect(manageScreen(list.id).back).toBe('growth');
    }
  });

  it('목적지의 행동은 sim 상수(MANAGEMENT_GROUPS)에서만 온다 — 화면이 만들어내지 않는다', () => {
    const actions: ManagementMenuAction[] = [
      { id: 'price', label: '가격', run: () => undefined },
      { id: 'course', label: '코스', run: () => undefined },
      { id: 'exam', label: '심사', run: () => undefined },
      { id: 'report', label: '결산', run: () => undefined },
    ];
    const ops = actionsForRoute('operations', actions).map((a) => a.id);
    const growth = actionsForRoute('growth', actions).map((a) => a.id);
    const records = actionsForRoute('records', actions).map((a) => a.id);
    expect(ops).toContain('price');
    expect(growth).toContain('exam');
    expect(records).toContain('report');
    // 어느 목적지에도 두 번 나오지 않는다 — 같은 행동이 두 화면에 있으면 어느 쪽이 진짜인지 모른다
    const all = [...ops, ...growth, ...records];
    expect(new Set(all).size).toBe(all.length);
  });

  it('의뢰·소원·인증·단골이 각자 화면을 갖고 목록 머리 id 를 보존한다', () => {
    expect(MANAGE_LISTS.map((l) => l.id)).toEqual(['quests', 'wishes', 'certs', 'regulars']);
    // 하네스가 닫힌 시트에서 읽는 손잡이 — 잃으면 조용히 빈 문자열을 읽는다
    for (const id of ['kairo-quests-list', 'kairo-cert-list', 'kairo-regular-list']) {
      expect(manageSource).toContain(id);
    }
    // 목록 호스트는 DOM 에서 빼지 않고 hidden 으로만 감춘다 (textContent 는 hidden 을 무시한다)
    expect(manageSource).toContain('this.listHost.hidden = list === undefined;');
  });

  it('메뉴는 언제나 인덱스에서 열린다 — 지난 목적지에서 시작하지 않는다', () => {
    expect(manageSource).toContain('reset(): void {');
    expect(mainSource).toContain('resetManagementScreen()');
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
      { id: 'minji', name: '민지', met: false, stage: 0, stages: 3, want: '', done: false },
      { id: 'suyeon', name: '수연', met: true, stage: 1, stages: 3, want: '“식혜 주세요”', done: false },
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
    // 스크롤 컨테이너의 자동 최소 크기 0 을 막는 한 줄 (P3-C④ 의 재발 방지)
    expect(cssSource).toMatch(/\.kcourse-presets\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(cssSource).toMatch(/\.kcourse-options\s*\{[^}]*flex:\s*0 0 auto/s);
  });
});
