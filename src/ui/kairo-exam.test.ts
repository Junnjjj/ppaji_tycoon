import { describe, expect, it, afterEach } from 'vitest';
import {
  examItemView,
  examBlockedReason,
  examGateReason,
  setExamFaultForTest,
  type ExamGate,
} from './kairo-exam.js';
import { GRADES } from '../sim/kairo/progress.js';

/**
 * 심사가 **화면에 있는가** (K48).
 *
 * 사용자 보고: "심사로 등급 올리는 부분이 사라졌다, 아니면 못 찾는 건가?" — 못 찾은 게
 * 맞다. `refreshExamBtn` 이 자격 미달이면 메뉴 항목을 `hidden` 으로 만들었고, 평판이
 * 다음 문턱을 넘기 전이 판의 대부분이라 심사는 사실상 없는 기능이었다.
 *
 * ⚠ 이 파일은 **문구 규칙**을 잰다 (숨지 않는가 · 무엇이 모자란다고 말하는가). 실제로
 * 그 글자가 화면에 뜨는지는 브라우저 검사가 본다 — DOM 을 흉내내면 "규칙은 맞는데 화면은
 * 그대로"를 놓친다 (`panels.test.ts` 와 같은 태도).
 *
 * 음성 대조군은 **코드로** 둔다 (`setExamFaultForTest`) — 손으로 주입해 확인한 것은
 * 다음 사람에게 안 남는다 (K38 아키텍처 점검).
 */

const g2 = GRADES.find((g) => g.grade === 2)!;
const g5 = GRADES.find((g) => g.grade === 5)!;

function gate(over: Partial<ExamGate> = {}): ExamGate {
  return {
    next: g2,
    gradeName: '1등급 무허가 빠지',
    reputation: 0,
    pendingWeek: null,
    ...over,
  };
}

afterEach(() => setExamFaultForTest(null));

describe('심사 메뉴 항목', () => {
  it('★ 자격이 없어도 안 숨는다 — 무엇이 모자란지 말한다', () => {
    // 2등급 문턱은 55. 평판 41 이면 응시 자격이 없다 — 예전엔 이 상태가 곧 `hidden` 이었다
    const v = examItemView(gate({ reputation: 41 }), 10_000_000);
    expect(v.hidden).toBe(false); // ← K48 이 고친 것
    expect(v.name).toContain('2등급');
    expect(v.sub).toContain('평판 55 필요');
    expect(v.sub).toContain('지금 41');
  });

  it('★ 자격이 없어도 **누를 수 있다** (K49) — 조건표가 가장 필요한 상태가 여기다', () => {
    /*
     * K48 은 보이게만 하고 못 누르게 했다. 그래서 조건별 점수·커트라인으로 가는 길이
     * 목표 칩 하나뿐이었고, "무엇을 지어야 오르나"를 묻는 사람이 정작 못 열었다.
     * 확인 화면은 **읽는 화면**이지 지출이 아니다 — 막을 것은 신청 버튼뿐이다.
     */
    expect(examItemView(gate({ reputation: 41 }), 10_000_000).disabled).toBe(false);
    // 현금이 0 이어도 마찬가지다 (수수료는 신청만 막는다)
    expect(examItemView(gate({ reputation: 41 }), 0).disabled).toBe(false);
    // 대기 중에도 — 판정 전까지 조건을 더 채울 수 있으므로 지금 점수가 가장 쓸모 있다
    expect(examItemView(gate({ reputation: 90, pendingWeek: 7 }), 0).disabled).toBe(false);
  });

  it('음성 대조군 — K48 처럼 잠그면 잡힌다', () => {
    setExamFaultForTest('lock-when-locked');
    expect(examItemView(gate({ reputation: 41 }), 10_000_000).disabled).toBe(true);
    expect(examItemView(gate({ reputation: 90, pendingWeek: 7 }), 0).disabled).toBe(true);
    // 대조군은 **자격 미달만** 되돌린다 — 자격이 있으면 예전에도 눌렸다
    expect(examItemView(gate({ reputation: 90 }), 10_000_000).disabled).toBe(false);
  });

  it('★ 처방이 방법까지 말한다 — 평판은 퇴장 만족도의 이동평균이다', () => {
    /*
     * "만족도를 올리세요"로는 무엇을 만질지 알 수 없다. 평판의 정의(나갈 때의 만족도)와
     * 그 값을 깎는 두 축(대기 줄·걷는 거리)이 문구에 있어야 다음 행동이 정해진다.
     */
    const sub = examItemView(gate({ reputation: 41 }), 10_000_000).sub;
    expect(sub).toContain('나갈 때');
    expect(sub).toMatch(/대기/);
    expect(sub).toMatch(/걷는 거리/);
  });

  it('음성 대조군 — 예전처럼 숨기면 잡힌다', () => {
    setExamFaultForTest('hide-when-locked');
    expect(examItemView(gate({ reputation: 41 }), 10_000_000).hidden).toBe(true);
    // 자격이 있으면 예전에도 보였다 — 대조군이 *자격 미달만* 되돌리는지 확인한다
    expect(examItemView(gate({ reputation: 80 }), 10_000_000).hidden).toBe(false);
  });

  it('어느 상태에서도 안 숨는다 — 평판 0~100 × 등급 1~5 전부', () => {
    for (let rep = 0; rep <= 100; rep += 5) {
      for (const g of GRADES) {
        const next = GRADES.find((x) => x.grade === g.grade + 1) ?? null;
        const v = examItemView(
          gate({ next, gradeName: `${g.grade}등급 ${g.name}`, reputation: rep }),
          0, // 현금 0 — 수수료가 모자란 상태도 숨김의 이유가 되면 안 된다
        );
        expect(v.hidden).toBe(false);
        expect(v.name.length).toBeGreaterThan(0);
        expect(v.sub.length).toBeGreaterThan(0);
      }
    }
  });

  it('대기 중이면 판정 주차를 말한다', () => {
    const v = examItemView(gate({ reputation: 90, pendingWeek: 7 }), 10_000_000);
    expect(v.hidden).toBe(false);
    expect(v.name).toContain('7주차');
  });

  it('최고 등급이면 그 사실을 말한다 — 빈 칸으로 두지 않는다', () => {
    const v = examItemView(
      gate({ next: null, gradeName: `5등급 ${g5.name}`, reputation: 99 }),
      10_000_000,
    );
    expect(v.hidden).toBe(false);
    expect(v.disabled).toBe(true);
    expect(v.sub).toContain(g5.name);
  });

  it('자격이 차면 활성 — 그리고 "먼저 본다"고 예고한다 (탭이 바로 돈을 안 쓴다)', () => {
    const v = examItemView(gate({ reputation: g2.reqExitSatisfaction }), 10_000_000);
    expect(v.disabled).toBe(false);
    expect(v.name).toContain('심사 신청');
    expect(v.sub).toContain('예상 점수');
  });
});

describe('응시를 막는 이유는 한 곳에서 나온다', () => {
  it('메뉴 항목의 비활성은 **다음 등급이 있나** 하나만 본다 (K49)', () => {
    /*
     * ⚠ K48 까지는 `disabled === (examGateReason !== null)` 이었다 — 자격이 곧 열람
     * 권한이었다. 이제 자격은 **신청**만 막고, 열람을 막는 것은 "보여줄 표가 없다"
     * 하나뿐이다. 규칙이 갈라지면 "메뉴는 되는데 확인 화면은 빈 상자"가 생긴다.
     */
    for (const g of [
      gate({ reputation: 41 }),
      gate({ reputation: 90, pendingWeek: 3 }),
      gate({ next: null, reputation: 99 }),
      gate({ reputation: 90 }),
    ]) {
      expect(examItemView(g, 10_000_000).disabled).toBe(g.next === null);
      // 자격 판정 자체는 그대로 살아 있다 — 신청 버튼이 이걸 본다
      expect(examBlockedReason(g, 10_000_000) !== null).toBe(examGateReason(g) !== null);
    }
  });

  it('★ 가난해도 확인 화면은 열린다 — 조건과 점수는 돈 없이도 봐야 한다', () => {
    /*
     * 현금 부족은 **신청**만 막는다. 못 열게 하면 "무엇을 지어야 하나"부터 뺏기는데,
     * 그게 이 화면의 존재 이유다 (카드의 `optionCertainCash` 와 같은 종류의 구분).
     */
    const g = gate({ reputation: 90 });
    expect(examGateReason(g)).toBeNull();
    expect(examItemView(g, 0).disabled).toBe(false);
    expect(examBlockedReason(g, 0)).toContain('수수료');
  });

  it('자격·현금이 다 되면 막는 이유가 없다', () => {
    expect(examBlockedReason(gate({ reputation: 90 }), 10_000_000)).toBeNull();
  });
});
