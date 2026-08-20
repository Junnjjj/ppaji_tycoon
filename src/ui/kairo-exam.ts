import { el } from './dom.js';
import { panelHost } from './panels.js';
import { NEED_NAME } from './kairo-report.js';
import type { ExamScore } from '../sim/kairo/exam.js';
import type { GradeDef, QuestCondition } from '../sim/kairo/progress.js';
import type { NeedKind } from '../sim/kairo/week.js';

/**
 * 등급 심사 — 메뉴 항목의 문구와 **응시 확인 화면** (K48).
 *
 * ## 왜 만들었나 — 심사가 화면에서 사라져 있었다
 *
 * 사용자 보고: "심사로 등급 올리는 부분이 사라졌다, 아니면 못 찾는 건가?" — 못 찾은 게
 * 맞다. `refreshExamBtn` 이 **자격 미달이면 항목을 `hidden`** 으로 만들었고, 평판이 다음
 * 문턱을 넘기 전까지가 판의 대부분이라 심사는 사실상 존재하지 않는 기능이었다.
 * 승급은 토지·시설 해금·정원 상한이 전부 걸린 유일한 성장 축인데, "무엇을 해야 오르는지"를
 * 말하는 곳이 화면 어디에도 없었다.
 *
 * 그래서 규칙을 뒤집는다: **자격이 없을수록 더 보여야 한다.** 없으면 무엇이 모자란지를
 * 말한다 — 이 저장소의 "못 놓는 이유는 시트에서 미리 보여준다 · 처방은 방법까지 말한다"
 * 규칙의 심사판이다.
 *
 * ## 왜 확인 화면인가
 *
 * K42 의 신청 버튼은 **누르는 즉시 수수료를 쓰고 접수**했다. 조건도 예상 점수도 안 보여준
 * 채다. PSS 부정 리뷰 1위 계열(`docs/research/pss-hermes-research.md` §3.1: "심사 전에
 * 예상 점수와 부족 조건 표시 · 재도전 짧게 · 부분 달성 보상")이 정확히 이 형태다.
 * 부분 점수가 보이면 — "21/30, 3점 모자람" — 다음에 뭘 지을지가 그 자리에서 정해진다.
 *
 * ## 새 표면을 안 만든다
 *
 * 카드(`.kover.dialog`)가 이미 "선택을 묻는 모달"이고, 속은 `.kstat`·`.krow`·`.kitem.wide`
 * 한 벌로 충분했다. 색은 `style.css` 가 소유한다 — 여기 hex 0.
 */

/** 조건 종류별 이름표 — sim 은 표시를 모르므로 이름은 화면이 붙인다 */
function reqLabel(c: QuestCondition): string {
  switch (c.kind) {
    case 'needSupply':
      return `${NEED_NAME[(c.need ?? '') as NeedKind] ?? c.need} 시설`;
    case 'exitSatisfaction':
      return '퇴장 만족도';
    case 'weekVisitors':
      return '주간 방문객';
    case 'weekProfit':
      return '주간 수익';
    case 'activeCombos':
      return '발동 중인 콤보';
    case 'comboTier':
      return `${c.tier ?? ''} 콤보`;
    case 'facilityCount':
      return '지정 시설';
    case 'facilityKinds':
      return '시설 종류';
    case 'facilityTotalAndSat':
      return '시설 수와 만족도';
    case 'maxTurnedAway':
      return '만석으로 돌려보낸 손님';
    case 'avgFacilityLevel':
      return '평균 개선 단계';
    case 'swimAreaMax':
      return '가장 큰 물놀이 구역';
    case 'courseCount':
      return '코스';
    case 'questsDone':
      return '완료한 의뢰';
    default:
      return '조건';
  }
}

/** 만원 단위 — 게임 전체가 이 눈금으로 말한다 (헤더 현금과 같다) */
function man(won: number): string {
  return `${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
}

/**
 * 음성 대조군 (K48) — **코드로 둔 되돌리기**.
 *
 * 손으로 주입해 확인한 것은 다음 사람에게 안 남는다 (K38 아키텍처 점검). `seam --selftest`
 * 가 픽셀에 위반을 주입하듯, 여기서는 **고친 규칙 자체**를 되돌려 검사가 잡는지 본다.
 *
 * · `hide-when-locked` — 자격 미달이면 메뉴에서 숨긴다 (이 버그의 원형)
 * · `spend-on-open` — 확인 없이 여는 즉시 신청한다 (K42 의 동작)
 */
export type ExamFault = 'hide-when-locked' | 'spend-on-open';
let fault: ExamFault | null = null;
export function setExamFaultForTest(f: ExamFault | null): void {
  fault = f;
}

/** 메뉴 항목이 무엇을 말할지 — 상태를 안 바꾸는 순수 함수라 단위 검사가 직접 잰다 */
export interface ExamGate {
  /** 다음 등급 (없으면 최고 등급이다) */
  next: GradeDef | null;
  /** 지금 등급 이름 — 최고 등급일 때 그 사실을 말하려면 필요하다 */
  gradeName: string;
  /** 평판 = 퇴장 만족도의 이동평균 */
  reputation: number;
  /** 심사 대기 중이면 판정 주차, 아니면 null */
  pendingWeek: number | null;
}

export interface ExamItemView {
  /**
   * ★ **언제나 false** 다 (K48). 자격이 없어도 화면에 남아야 한다 —
   * 숨기면 "심사로 등급 올리는 부분이 사라졌다"가 그대로 돌아온다.
   */
  hidden: boolean;
  disabled: boolean;
  name: string;
  sub: string;
}

/**
 * **응시 자격**이 없는 이유 (없으면 null) — `ExamStore.eligible` 의 화면판이다.
 * 대기 중 · 최고 등급 · 평판 미달 셋뿐이고, **돈은 여기 없다** (아래 참고).
 */
export function examGateReason(g: ExamGate): string | null {
  if (g.pendingWeek !== null) return `이미 접수했습니다 — ${g.pendingWeek}주차 주말 판정`;
  if (!g.next) return `${g.gradeName} — 더 오를 등급이 없습니다`;
  if (g.reputation < g.next.reqExitSatisfaction) {
    return `평판 ${g.next.reqExitSatisfaction} 필요 · 지금 ${Math.round(g.reputation)}`;
  }
  return null;
}

/**
 * **신청**을 막는 이유 (없으면 null) — 자격에 수수료를 더한 것. 확인 화면의 신청 버튼이 본다.
 *
 * ⚠ 현금 부족은 **메뉴 항목을 잠그지 않는다.** 확인 화면의 존재 이유가 "돈을 내기 전에
 * 조건과 점수를 본다"인데, 가난하면 아예 못 열게 하면 그 정보부터 뺏긴다. 카드가
 * `optionCertainCash` 로 "확정 지출만 센다"고 갈라 둔 것과 같은 종류의 구분이다.
 */
export function examBlockedReason(g: ExamGate, cash: number): string | null {
  const gate = examGateReason(g);
  if (gate !== null) return gate;
  const fee = g.next?.examFee ?? 0;
  if (fee > cash) return `수수료가 부족합니다 — ${man(fee)}`;
  return null;
}

export function examItemView(g: ExamGate, cash: number): ExamItemView {
  const locked = examGateReason(g) !== null;
  // ⚠ 음성 대조군 — 이 한 줄이 예전 동작이다. 검사가 이걸 켜고 잡히는지 본다
  const hidden = fault === 'hide-when-locked' ? locked : false;

  if (g.pendingWeek !== null) {
    return {
      hidden,
      disabled: true,
      name: `심사 대기 — ${g.pendingWeek}주차 주말`,
      sub: '판정 전까지 조건을 더 채울 수 있습니다',
    };
  }
  if (!g.next) {
    return {
      hidden,
      disabled: true,
      name: '심사 — 최고 등급',
      sub: `${g.gradeName} · 더 오를 곳이 없습니다`,
    };
  }
  const title = `${g.next.grade}등급 ${g.next.name}`;
  if (g.reputation < g.next.reqExitSatisfaction) {
    return {
      hidden,
      disabled: true,
      name: `심사 — ${title}`,
      /*
       * 처방은 **방법까지** 말한다 (저장소 규칙). 평판은 손님이 나갈 때의 만족도
       * 이동평균이라 "만족도를 올리세요"로는 무엇을 만질지 알 수 없다 — 대기 줄과
       * 걷는 거리가 그 값을 깎는 두 축이다 (`guests.ts` 의 하향 압력).
       */
      sub:
        `평판 ${g.next.reqExitSatisfaction} 필요 · 지금 ${Math.round(g.reputation)}` +
        ' — 평판은 손님이 나갈 때의 만족도 평균입니다. 대기 줄과 걷는 거리를 줄이세요',
    };
  }
  const fee = g.next.examFee ?? 0;
  return {
    hidden,
    disabled: false,
    name: `심사 신청 — ${title}`,
    // 가난해도 열린다 — 조건과 예상 점수는 돈 없이도 봐야 다음에 뭘 지을지가 정해진다
    sub:
      fee > cash
        ? `수수료 ${man(fee)} · 현금이 모자랍니다 — 조건과 예상 점수는 먼저 볼 수 있습니다`
        : `수수료 ${man(fee)} · 조건과 예상 점수를 먼저 봅니다`,
  };
}

/**
 * 메뉴 항목에 상태를 입힌다 — 문구 규칙은 `examItemView` 하나가 갖고, 여기는 칠하기만.
 * `main.ts` 가 DOM 을 직접 조립하면 규칙이 두 곳으로 갈라진다.
 */
export function paintExamItem(btn: HTMLButtonElement, v: ExamItemView): void {
  btn.hidden = v.hidden;
  btn.disabled = v.disabled;
  /*
   * ⚠ 1.5초 폴링이 부른다 — 매번 DOM 을 갈아치우면 그 주기로 깜빡인다
   * (`setChips` 가 서명으로 거르는 것과 같은 이유). 글이 같으면 손대지 않는다.
   */
  const sig = `${v.name} ${v.sub}`;
  if (btn.dataset['sig'] === sig) return;
  btn.dataset['sig'] = sig;
  btn.replaceChildren(el('div', 'kitem-name', v.name), el('div', 'kitem-sub', v.sub));
}

/** 확인 화면이 받는 것 — 전부 바깥에서 잰 값이다 (화면은 sim 을 안 부른다) */
export interface ExamViewModel {
  gate: ExamGate;
  /** 지금 응시하면 몇 점인가. 최고 등급이면 null */
  score: ExamScore | null;
  cash: number;
  /** 지금 신청하면 판정할 주차 (`examJudgeWeek`) */
  judgeWeek: number;
}

export class KairoExamView {
  private readonly root: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private onApply: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'kover dialog');
    this.root.id = 'kairo-exam';
    this.root.hidden = true;
    this.box = el('div', 'kdialog-box');
    this.root.append(this.box);
    parent.append(this.root);
  }

  /** ⚠ `hidden` 을 읽는다 — 인라인 `display` 를 읽으면 표면이 클래스로 옮길 때 거짓이 된다 */
  get visible(): boolean {
    return !this.root.hidden;
  }

  show(vm: ExamViewModel, onApply: () => void): void {
    this.onApply = onApply;
    if (!panelHost.open(this)) return; // 모달(주간 카드)이 열려 있으면 밀고 들어가지 않는다
    this.root.hidden = false;
    this.render(vm);
    /*
     * ⚠ 음성 대조군 — 예전 동작(탭 = 즉시 지출)을 되살린다. 확인 화면을 띄운 **뒤**
     * 바로 신청해 버리므로, "확인 전에는 현금이 안 준다"를 재는 검사가 잡아야 한다.
     */
    if (fault === 'spend-on-open') this.apply();
  }

  hide(): void {
    this.root.hidden = true;
    this.onApply = null;
    panelHost.closed(this);
  }

  /** 도구용 — 사람이 누르는 것과 **같은 경로**를 탄다 */
  applyForTest(): boolean {
    if (!this.visible || !this.onApply) return false;
    this.apply();
    return true;
  }

  private apply(): void {
    const fn = this.onApply;
    this.hide();
    fn?.();
  }

  private render(vm: ExamViewModel): void {
    const { gate, score } = vm;
    const blocked = examBlockedReason(gate, vm.cash);
    this.box.replaceChildren();
    this.box.append(el('div', 'kcaption', '등급 심사'));
    this.box.append(
      el('div', 'kcard-title', gate.next ? `${gate.next.grade}등급 ${gate.next.name}` : gate.gradeName),
    );

    if (!gate.next || !score) {
      this.box.append(el('div', 'kcard-desc', '최고 등급입니다 — 더 오를 곳이 없습니다.'));
      this.box.append(this.closeRow());
      return;
    }

    this.box.append(
      el(
        'div',
        'kcard-desc',
        `조건 ${score.perReq.length}개 · 조건당 ${score.max / Math.max(1, score.perReq.length)}점 · ` +
          `${score.cut}점 이상이면 통과합니다. 부분 점수라 모자란 만큼만 채우면 됩니다.`,
      ),
    );

    // 지표 셋 — 예상 점수 · 커트라인 · 수수료. 열 수는 **데이터**라 인라인이다 (K34)
    const stats = el('div', 'kstats');
    stats.style.setProperty('--stat-cols', '3');
    const stat = (label: string, value: string, tone = ''): HTMLDivElement => {
      const b = el('div', 'kstat');
      b.append(el('div', 'kstat-label', label), el('div', `kstat-value${tone}`, value));
      return b;
    };
    stats.append(
      stat('예상 점수', `${score.score}/${score.max}`, score.passed ? ' good' : ' warn'),
      stat('커트라인', `${score.cut}점`),
      stat('수수료', man(score.fee)),
    );
    stats.id = 'kairo-exam-stats';
    this.box.append(stats);

    // 조건별 점수 — **이게 요지다.** 무엇이 몇 점 모자란지가 다음에 지을 것을 정한다
    const rows = el('div', 'kstack');
    rows.id = 'kairo-exam-reqs';
    for (const r of score.perReq) {
      const row = el('div', `krow${r.done ? '' : ' warn'}`);
      row.dataset['req'] = r.req.kind;
      const main = el('div', 'krow-main');
      main.append(
        el('div', 'kitem-name', `${r.done ? '✓ ' : ''}${reqLabel(r.req)}`),
        el('div', 'kcaption', r.detail),
      );
      row.append(main, el('div', 'kstat-value', `${r.score}점`));
      rows.append(row);
    }
    this.box.append(rows);

    if (!score.passed) {
      this.box.append(
        el(
          'div',
          'kcallout',
          `지금 응시하면 ${score.cut - score.score}점 모자랍니다 — ` +
            '탈락해도 수수료만 잃고 바로 다시 응시할 수 있습니다.',
        ),
      );
    }
    /*
     * ⚠ 막힌 이유는 **버튼 위에만** 쓴다. 알림 상자로 한 번 더 내면 같은 문장이 100px
     * 간격으로 두 번 나온다 (실측 스크린샷). 이유는 누르는 자리에 붙어 있는 편이 맞다.
     */
    const applyBtn = el('button', 'kitem wide');
    applyBtn.id = 'kairo-exam-apply';
    applyBtn.disabled = blocked !== null;
    applyBtn.append(
      el('div', 'kitem-name', `신청 — 수수료 ${man(score.fee)}`),
      el(
        'div',
        'kitem-sub',
        blocked !== null ? blocked : `${vm.judgeWeek}주차 주말에 심사관이 판정합니다`,
      ),
    );
    applyBtn.addEventListener('click', () => this.apply());

    const stack = el('div', 'kstack');
    stack.append(applyBtn, this.closeRow());
    this.box.append(stack);
  }

  private closeRow(): HTMLButtonElement {
    const close = el('button', 'kbtn', '닫기');
    close.id = 'kairo-exam-close';
    close.addEventListener('click', () => this.hide());
    return close;
  }
}
