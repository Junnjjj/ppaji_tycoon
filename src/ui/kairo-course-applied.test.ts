import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  courseAppliedLines,
  courseDockActions,
  courseDraftUnchanged,
  type CoursePhase,
} from './kairo-course.js';
import { defaultHandles, presetDef, type CourseEditDraft, type PlacedCourse } from '../sim/kairo/course.js';

/**
 * Task 6 — **적용 결과가 사라지지 않는다** (계획 §1.6).
 *
 * 2026-08-26 실측: 적용 성공 콜백이 2.6초 토스트를 띄우고 패널은 그 자리에서 닫혔다.
 * 3초 뒤에는 "적용됨"이 화면에 **하나도 안 남았고**, 핸들을 안 움직여 변경값이 0이어도
 * 시험 뒤 `적용` 이 떠서 "무엇이 적용됐는가"가 더 불명확했다.
 *
 * 그래서 규칙 셋을 순수 함수로 내린다 — 화면이 아니라 **규칙**을 먼저 잰다:
 * 1. 후보가 정본 현재 코스와 같으면 적용은 `변경 없음` 비활성이다
 * 2. 주버튼 이름은 `적용` 이 아니라 `이 설정 적용` 이다
 * 3. 성공 뒤에는 `applied` 상태가 있고 거기서 나가는 문은 `닫기` 하나뿐이다
 */

const panel = readFileSync(new URL('./kairo-course.ts', import.meta.url), 'utf8');
/** 주석은 역사를 남기는 자리다 — 계약 검사는 **살아 있는 코드**만 봐야 한다. */
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const harness = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

const dock = { x: 8, y: 12 };
const handles = defaultHandles(presetDef('circle')!, dock, { x: 1, y: 0 }, 7);
const current: PlacedCourse = {
  handle: 41,
  presetId: 'circle',
  equipId: 'banana',
  vehicles: 1,
  towBoatId: 'work',
  dock,
  handles,
};

function draft(change: Partial<CourseEditDraft> = {}): CourseEditDraft {
  return {
    presetId: current.presetId,
    equipId: current.equipId,
    vehicles: current.vehicles,
    dock: { ...current.dock },
    handles: current.handles.map((handle) => ({ ...handle })),
    ...(current.towBoatId ? { towBoatId: current.towBoatId } : {}),
    ...change,
  };
}

describe('Task 6 — 후보가 정본과 같으면 적용은 뜻이 없다', () => {
  it('값이 같은 별개 객체도 변경 없음으로 본다 (참조가 아니라 내용이다)', () => {
    expect(courseDraftUnchanged(current, draft())).toBe(true);
  });

  it('핸들 한 점·대수·장비·보트·프리셋 어느 하나만 달라도 변경이다', () => {
    expect(courseDraftUnchanged(current, draft({ vehicles: 3 }))).toBe(false);
    expect(courseDraftUnchanged(current, draft({ equipId: 'wakeboard' }))).toBe(false);
    expect(courseDraftUnchanged(current, draft({ towBoatId: 'sport' }))).toBe(false);
    expect(courseDraftUnchanged(current, draft({ presetId: 'slalom' }))).toBe(false);
    const moved = draft();
    moved.handles[0] = { x: moved.handles[0]!.x + 1, y: moved.handles[0]!.y };
    expect(courseDraftUnchanged(current, moved)).toBe(false);
  });

  it('새 코스 생성은 비교 대상이 없으므로 언제나 변경이다', () => {
    expect(courseDraftUnchanged(null, draft())).toBe(false);
  });
});

describe('Task 6 — 리뷰의 주버튼 정체', () => {
  const ids = (
    phase: CoursePhase,
    o: { canTrial: boolean; trialPassed: boolean; noop: boolean },
  ): string[] => courseDockActions(phase, o).map((a) => `${a.id}:${a.label}`);

  it('무엇을 적용하는지 이름이 말한다 — 모호한 `적용` 을 쓰지 않는다', () => {
    expect(ids('review', { canTrial: true, trialPassed: true, noop: false })).toEqual([
      'settings:다시 조정',
      'primary:이 설정 적용',
    ]);
    for (const phase of ['create', 'info', 'edit', 'trial', 'review', 'applied'] as const) {
      for (const action of courseDockActions(phase, {
        canTrial: true,
        trialPassed: true,
        noop: false,
      })) {
        expect(action.label).not.toBe('적용');
        expect(action.label).not.toMatch(/[A-Za-z]/);
      }
    }
  });

  it('변경이 0이면 `변경 없음` 비활성이다 — 뜻 없는 적용을 허용하지 않는다', () => {
    const actions = courseDockActions('review', { canTrial: true, trialPassed: true, noop: true });
    const primary = actions.find((a) => a.id === 'primary')!;
    expect(primary.label).toBe('변경 없음');
    expect(primary.disabled).toBe(true);
    // 다시 조정은 살아 있어야 한다 — 막다른 길을 만들지 않는다
    expect(actions.find((a) => a.id === 'settings')?.disabled).toBe(false);
  });

  it('시험을 아직 안 지났으면 여전히 비활성이다 (no-op 판정이 그 규칙을 덮지 않는다)', () => {
    expect(
      courseDockActions('review', { canTrial: true, trialPassed: false, noop: false })
        .find((a) => a.id === 'primary')?.disabled,
    ).toBe(true);
  });
});

describe('Task 6 — 적용 완료 상태', () => {
  it('나가는 문은 닫기 하나이고 다시 조정이 같이 산다', () => {
    const actions = courseDockActions('applied', {
      canTrial: false,
      trialPassed: false,
      noop: true,
    });
    expect(actions.map((a) => `${a.id}:${a.label}`)).toEqual([
      'settings:다시 조정',
      'cancel:닫기',
    ]);
    expect(actions.every((a) => !a.disabled)).toBe(true);
    // 닫기가 지금 눌러야 할 것이다 — 강조는 상태마다 다르다
    expect(actions.find((a) => a.id === 'cancel')?.emphasis).toBe(true);
  });

  it('영수증은 무엇을·얼마에·기록까지 한 벌로 낸다', () => {
    const lines = courseAppliedLines({
      presetName: '원형',
      equipName: '바나나보트',
      vehicles: 2,
      charge: 120_000,
      trial: { thrill: 42.4, safety: 88.2 },
      record: { thrill: 42.4 },
    });
    const text = Object.fromEntries(lines.map((l) => [l.key, l.text]));
    expect(text['head']).toBe('적용 완료 · 원형 · 바나나보트 2대');
    expect(text['spend']).toContain('12만');
    expect(text['trial']).toContain('스릴 42');
    expect(text['trial']).toContain('안전 88');
    expect(text['record']).toContain('신기록');
    expect(text['saved']).toBe('저장 완료');
    for (const line of lines) expect(line.text).not.toMatch(/[A-Za-z]/);
  });

  it('돈이 안 나갔으면 그렇게 말하고, 기록이 없으면 없다고 말한다', () => {
    const lines = courseAppliedLines({
      presetName: '원형',
      equipName: '바나나보트',
      vehicles: 2,
      charge: 0,
      trial: { thrill: 10, safety: 90 },
      record: null,
    });
    const text = Object.fromEntries(lines.map((l) => [l.key, l.text]));
    expect(text['spend']).toBe('추가 비용 없음');
    expect(text['record']).toContain('없');
    // 없는 줄을 지우지 않는다 — 자리가 사라지면 "안 나갔다"와 "못 읽었다"를 구분 못 한다
    expect(lines.map((l) => l.key)).toEqual(['head', 'spend', 'trial', 'record', 'saved']);
  });

  it('시험 없이 확정한 경로(도구·생성)는 시험 줄만 빠진다', () => {
    const lines = courseAppliedLines({
      presetName: '원형',
      equipName: '바나나보트',
      vehicles: 2,
      charge: 5_000,
      trial: null,
      record: null,
    });
    expect(lines.map((l) => l.key)).toEqual(['head', 'spend', 'record', 'saved']);
  });
});

describe('Task 6 — 코스 패널 배선', () => {
  it('적용 성공은 패널을 닫지 않고 applied 표면으로 간다', () => {
    // 성공 직후 `hide()` 를 부르면 증거가 토스트 2.6초뿐이 된다 (2026-08-26 실측)
    expect(code).toMatch(/this\.phase\s*=\s*'applied'/);
    const commit = /private commit\([\s\S]*?\n {2}\}/.exec(code)?.[0] ?? '';
    expect(commit).not.toContain('this.hide()');
    expect(commit).toContain('courses.confirmEdit(this.edit, this.deps.spend)');
  });

  it('적용 뒤 정본 현재값을 다시 읽는다 — 확정한 코스가 곧 현재다', () => {
    // 생성 경로도 selectedHandle 을 새 코스로 옮겨야 현재값이 갱신된 값으로 뜬다
    expect(code).toMatch(/this\.selectedHandle\s*=\s*\w+\.handle/);
    expect(code).toContain('courseAppliedLines(');
    expect(code).toContain('courseDraftUnchanged(');
  });

  it('변경 없음이면 주버튼이 commit 으로 흐르지 않는다', () => {
    const primaryAction = /private primaryAction\(\): void \{[\s\S]*?\n {2}\}/.exec(code)?.[0] ?? '';
    expect(primaryAction).toContain('applied');
    expect(primaryAction).toMatch(/noop|Unchanged/);
  });

  it('상태 정체는 루트의 data 속성 하나가 말한다 — CSS 와 하네스가 같은 값을 읽는다', () => {
    expect(code).toContain("dataset['coursePhase']");
  });
});

describe('Task 6 — 표면', () => {
  const rule = (selector: string): string =>
    new RegExp(`${selector.replace(/[.[\]$^*+?()|{}\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 's')
      .exec(css)?.[1] ?? '';

  it('영수증은 코스 독 안의 마지막 상태다 — 새 모달을 만들지 않는다', () => {
    expect(code).toContain("id = 'kairo-course-receipt'");
    expect(code).not.toMatch(/kover|dialog/);
    expect(rule('.kcourse-receipt')).not.toBe('');
  });

  it('영수증 글씨는 본문 대비를 쓰고 성공 신호는 테두리가 진다', () => {
    /*
     * `--good` 은 크림 사면 위에서 3.14:1 이라 본문(4.5:1)에 못 미친다 — 그런데 머리줄은
     * 이 화면에서 가장 중요한 문장이다. 면(3:1)은 통과하므로 색은 테두리로 옮겼다.
     */
    expect(rule('.kcourse-receipt-head')).toMatch(/color:\s*var\(--text\)/);
    expect(rule('.kcourse-receipt-head')).not.toMatch(/color:\s*var\(--good\)/);
    expect(rule('.kcourse-receipt')).toMatch(/border-left:[^;]*var\(--good\)/);
  });

  it('영수증 글씨는 12px 미만이 아니다 (계획 §1.3)', () => {
    const sizes = [
      ...(`${rule('.kcourse-receipt')}${rule('.kcourse-receipt-line')}${rule('.kcourse-receipt-head')}`)
        .matchAll(/font-size:\s*([\d.]+)px/g),
    ].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
  });

  it('독 천장은 토큰 하나가 소유하고 적용 완료만 더 높다', () => {
    expect(css).toMatch(/--course-dock-cap:\s*112px/);
    expect(rule('.kcourse-dock')).toMatch(/max-height:\s*var\(--course-dock-cap\)/);
    expect(css).toMatch(
      /\.kcourse\[data-course-phase='applied'\]\s+\.kcourse-dock\s*\{[^}]*max-height:\s*var\(--course-dock-cap-applied\)/s,
    );
  });

  it('보조 채널(토스트)이 본체(영수증)를 덮지 않는다 — 같은 자를 쓴다', () => {
    expect(css).toMatch(
      /body:has\(\.kcourse:not\(\[hidden\]\)\)\s+\.ktoast\s*\{[^}]*var\(--course-dock-cap\)/s,
    );
    expect(css).toMatch(
      /body:has\(\.kcourse\[data-course-phase='applied'\]\)\s+\.ktoast\s*\{[^}]*var\(--course-dock-cap-applied\)/s,
    );
  });

  it('적용 완료 동안에도 홈 입력층은 코스가 갖는다 (Phase A 소유권)', () => {
    // notifyEditing(false) 는 hide() 에서만 — applied 는 여전히 코스 모드다
    const hide = /hide\(\): void \{[\s\S]*?\n {2}\}/.exec(code)?.[0] ?? '';
    expect(hide).toContain('notifyEditing(false)');
    expect(code.match(/notifyEditing\(false\)/g)?.length).toBe(1);
  });
});

describe('Task 6 — 브라우저 게이트', () => {
  /*
   * 주석은 옛 계약을 **역사로** 남기는 자리다 (그 문장이 지금 코드라고 오독되면 안 된다).
   * 그래서 "이 코드가 없어야 한다" 류는 살아 있는 코드만 보고 잰다. 줄 첫머리 `//` 와
   * 블록 주석만 지운다 — 문자열 안의 `http://` 를 자르면 줄이 붙어 가짜 일치가 난다.
   */
  const harnessCode = harness
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/[^\n]*/gm, '');

  it('실제 드래그·4초 시험·적용까지 사람 경로로만 간다', () => {
    // 핸들은 진짜 손가락으로 옮긴다 (K33: 화면이 되는지는 진짜 터치로 본다)
    expect(harnessCode).toContain("type: 'touchStart', touchPoints:");
    expect(harnessCode).toMatch(/coursePanel\.state\.phase === 'trial'/);
    expect(harnessCode).toMatch(/coursePanel\.state\.phase === 'review'/);
    expect(harnessCode).toContain('이 설정 적용');
    expect(harnessCode).toMatch(/coursePanel\.state\.phase === 'applied'/);
  });

  it('적용 뒤 영수증이 남는 것을 재고, 옛 "즉시 닫힘" 기대를 되살리지 않는다', () => {
    expect(harnessCode).toContain('kairo-course-receipt');
    expect(harnessCode).toContain('적용 완료');
    /*
     * 옛 계약: 확정 버튼을 누르면 그 자리에서 패널이 사라진다. 되돌아오면 성공의
     * 증거가 다시 2.6초 토스트뿐이 된다.
     */
    expect(harnessCode).not.toMatch(
      /touchElement\([A-Za-z0-9]+Page[^;]*'#kairo-course-confirm'\);[\s\S]{0,240}?getElementById\('kairo-course'\)\.hidden/,
    );
  });

  it('닫기는 명시적이고, 그 뒤 재열기·새로고침에서 적용값을 다시 읽는다', () => {
    // 닫기 → 패널이 닫힌다는 것 자체는 여전히 계약이다 (그 문이 하나뿐이라는 뜻)
    expect(harnessCode).toMatch(
      /'#kairo-course-close'\);[\s\S]{0,200}?getElementById\('kairo-course'\)\.hidden/,
    );
    // 재열기는 홈 목표 상태에 안 기댄다 — 경영 메뉴의 코스 행동으로 연다
    expect(harnessCode).toContain('[data-manage-action="course"]');
    expect(harnessCode).toMatch(/coursePage\.reload\(/);
  });

  it('변경 없음은 disabled 만이 아니라 음성 대조군으로 잰다', () => {
    expect(harnessCode).toContain('변경 없음');
    expect(harnessCode).toMatch(/noopReview\.disabled\[1\] === true/);
    /*
     * disabled 만 재면 "화면이 막았다"까지다. 화면의 사실을 치우고 규칙만 남겨야
     * `primaryAction` 의 가드가 실제로 있는지 잰다 (seam --selftest 와 같은 수법).
     */
    expect(harnessCode).toMatch(/button\.disabled = false;[\s\S]{0,80}?button\.click\(\)/);
    expect(harnessCode).toMatch(/noopForced\.cash === appliedCourses\.cash/);
  });
});
