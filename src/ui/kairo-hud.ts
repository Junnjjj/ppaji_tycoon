/**
 * 카이로 HUD — **상단 캡슐 둘 + 하단 바 하나**, 나머지는 전부 시트 안 (K28).
 *
 * ## 왜 갈아엎었나 (실측)
 *
 * 폰 세로에서 재보니 **화면의 40% 가 UI** 였고 **상시 컨트롤이 15개**였다
 * (바닥 붓 6 + 시설 드롭다운 + 우측 버튼 5 + 주 진행 + …). 레퍼런스(Pool Slide Story)
 * 스크린샷을 같은 방법으로 재면 **약 14%, 버튼 2개**다. 가운데는 100% 게임이고 UI 는
 * 위에 떠 있는 캡슐 둘과 아래 한 줄뿐이다.
 *
 * ## 읽는 것은 위, 누르는 것은 아래 (K47-②)
 *
 * 폰 상단은 엄지 사각지대다. 그래서 헤더 두 줄은 **읽기 전용**(버튼 0개)이고 하단 바에는
 * **상시 컨트롤 2개**(메뉴·건설)만 남는다. 걷어낸 것들의 행선지:
 *   · `하루 »`/주 스킵 — **없앴다.** 시간은 흐르는 낮으로 이미 자동이고(하루 24초),
 *     스킵을 누르고 싶은 순간은 "할 게 없다"는 신호라 스킵으로 가릴 게 아니다 (계획 §2)
 *   · 위험도 — 헤더 2줄째로. 상시 표시는 규칙이지 컨트롤이 아니다
 *   · 붓 라벨 — 티커로 (K47-①)
 *   · 리포트 버튼 — 알림함의 "결산 도착" 행을 탭하면 열린다
 *   · 목표 ▾ 버튼 — 칩 기둥 자신의 머리 행으로
 *
 * 그리고 시설 73종을 `<select>` 드롭다운으로 고르고 있었다. 카이로에는 드롭다운이
 * 없다 — **아이콘 격자**다. "직관적이지 않다"의 대부분이 이 둘이었다.
 *
 * ## 스타일은 `style.css` 가 소유한다
 *
 * ⚠ 인라인 스타일을 쓰지 않는다. `style.css` 에 이미 토큰(`--panel`/`--accent`/
 * `--tap`/`--safe-b`)과 컴포넌트가 있었는데 **폐기된 v1 씬만 쓰고 있었고**, 카이로 씬은
 * `main.ts` 안에서 전부 인라인으로 다시 만들었다. 그래서 카이로 쪽만 투박했다.
 * 여기서 또 인라인으로 쓰면 체계가 셋이 된다.
 *
 * ## 방향 두 개를 한 레이아웃으로
 *
 * 세로(393×852)와 가로(852×393)를 같은 DOM·같은 CSS 로 낸다. 미디어 쿼리로 레이아웃을
 * 두 벌 만들면 검증도 두 배가 되고, 어긋나는 쪽은 언제나 안 본 쪽이다.
 */

import { el } from './dom.js';
import {
  homeInputOwnership,
  panelHost,
  type HomeInputOwnership,
  type InputSurface,
  type Panel,
} from './panels.js';
import { won } from './money.js';

export type BuildKind = 'ground' | 'facility' | 'erase' | 'door' | 'move';

/**
 * 시트 탭 (K31). `kind` 와 따로 두는 이유: **건물 바닥은 지형(`ground`)이지만 탭은
 * `building`** 이다. 확장이 카이로의 핵심 동사라 자기 탭을 줘야 보인다 — 바닥 탭에
 * 섞여 있을 때는 "이게 건물을 넓히는 것"임을 아무도 몰랐다 (직접 플레이하다 막혔다).
 */
export type BuildTab = 'facility' | 'building' | 'ground' | 'course';

export interface BuildItem {
  kind: BuildKind;
  tab: BuildTab;
  id: string;
  name: string;
  /** 카드에 보이는 명목 비용. 실제 배치 비용은 확정 바에서 다시 계산한다. */
  cost: number;
  /** 카드당 정확히 하나인 역할 배지 (먹거리/위생/통행/확장/…). */
  role: string;
  /** 정액이 아닌 비용 표기(칸당/건설비 비율). 없으면 `cost`를 만원 단위로 표시한다. */
  costLabel?: string;
  /** 둘째 줄 — 값·크기 같은 것 */
  sub?: string;
  /** 아직 못 짓는다 (자리 없음 등). 이유를 대신 보여준다 */
  locked?: string;
  /** `locked`를 해소하는 다음 행동. 막힌 이유와 분리해 선택 전에 같이 보여준다. */
  unlock?: string;
  /** 다음에 올 것 예고 (K40) — 누를 수 없고, 언제 열리는지만 말한다 */
  teaser?: string;
  /** 카드 썸네일용 계약 ID — 게임과 같은 그림을 쓴다 */
  sprite?: string;
  /** 시설 탭 안에서 묶는 이름 (실내/야외/…) */
  group?: string;
}

export interface BuildItemView {
  cost: string;
  role: string;
  blockedReason?: string;
  unlockMethod?: string;
  selectable: boolean;
}

/** 카드 표시 모델. DOM이 잠금 규칙이나 돈 단위를 다시 추론하지 않게 한 곳에서 만든다. */
export function buildItemView(item: BuildItem): BuildItemView {
  const blockedReason = item.locked ?? (item.teaser !== undefined ? '아직 잠김' : undefined);
  const unlockMethod = item.unlock ?? item.teaser;
  return {
    cost:
      item.costLabel ??
      (item.cost === 0 ? '무료' : won(item.cost)),
    role: item.role,
    ...(blockedReason !== undefined ? { blockedReason } : {}),
    ...(unlockMethod !== undefined ? { unlockMethod } : {}),
    selectable: blockedReason === undefined,
  };
}

/** 터치에서는 스와이프가 기본, 포인팅 기기에는 이름 있는 페이지 버튼이 폴백이다. */
export function carouselNeedsNav(maxTouchPoints: number): boolean {
  return maxTouchPoints === 0;
}

export interface BuildConfirmView {
  kind: BuildKind;
  name: string;
  cost: string;
  result: string;
  sprite?: string;
  /**
   * 지금 무슨 모드인가 — `배치 중 · 화장실` / `연속 설치 중 · 석재 보도` (UI v3).
   * 정본은 `BuildSession.modeLabel` 이다. 확정 바가 이 글자를 그대로 보여 준다.
   */
  mode?: string;
}

/**
 * 연속 설치 토글 (UI v3, 계획 §1.5) — **기본은 꺼짐**이고 켜는 것은 사용자다.
 *
 * `undefined` 면 토글 자체가 안 뜬다 (이동처럼 반복이 뜻 없는 붓).
 */
export interface RepeatToggle {
  on: boolean;
  label: string;
  toggle: () => void;
}

export type GoalRole = 'immediate' | 'mid' | 'long';

/**
 * 목표 한 칸의 내용. 역할(A/B/C)은 `createGoalSlots` 가 붙인다.
 *
 * `action` 은 선택이 아니다. 진행률만 보여 주는 목표는 "그래서 뭘 하지"를 다시 만들기
 * 때문이다. 각 칸이 자기 목적지를 직접 여는 것이 Phase 1의 계약이다.
 */
export interface GoalSlotInput {
  icon: string;
  label: string;
  detail?: string;
  /** 0..1 */
  progress: number;
  tone?: 'won' | 'lost';
  action: () => void;
}

/** 의뢰 칩 하나 (K40) — 아이콘은 임시 글리프다 (ui/* 에셋 슬롯, 계획 §1-1) */
export interface GoalChip extends GoalSlotInput {
  role: GoalRole;
  badge: 'A' | 'B' | 'C';
}

/**
 * 카이로식 세 시간축을 언제나 같은 순서·같은 정체로 만든다.
 * 이 값은 저장하지 않고 기존 시스템 상태가 바뀔 때 다시 파생한다.
 */
export function createGoalSlots(input: {
  immediate: GoalSlotInput;
  mid: GoalSlotInput;
  long: GoalSlotInput;
}): GoalChip[] {
  return [
    { ...input.immediate, role: 'immediate', badge: 'A' },
    { ...input.mid, role: 'mid', badge: 'B' },
    { ...input.long, role: 'long', badge: 'C' },
  ];
}

/**
 * 첫 즉시 목표. 새 온보딩 플래그를 만들지 않고 **지금 존재하는 첫 코스**에서 파생한다.
 * handle 을 callback까지 전달해 Phase 2가 기존 코스 편집을 구현할 때 이 파일을 바꾸지 않는다.
 */
export function inheritedCourseGoal(
  courses: readonly { handle: number }[],
  openCourse: (handle?: number) => void,
): GoalChip {
  const handle = courses[0]?.handle;
  return {
    role: 'immediate',
    badge: 'A',
    icon: '🚤',
    label: handle === undefined ? '첫 코스 만들기' : '물려받은 코스 시험 운행',
    detail: handle === undefined ? '선착장에서 코스를 시작하세요' : '탭해서 시작 코스를 바로 엽니다',
    progress: 0,
    action: () => openCourse(handle),
  };
}

/**
 * sim이 고른 Today 추천을 홈의 A 슬롯 모양으로만 바꾼다. 단계·목적지·우선순위는
 * 여기서 다시 계산하지 않고, 호출자가 넘긴 presentation과 production callback을 쓴다.
 */
export function recommendedActionGoal(
  presentation: { icon: string; label: string; detail: string },
  action: () => void,
): GoalChip {
  return {
    role: 'immediate',
    badge: 'A',
    icon: presentation.icon,
    label: presentation.label,
    detail: presentation.detail,
    progress: 0,
    action,
  };
}

/** 홈 밴드가 읽는 것 — 아이콘이 아니라 **글 셋**이다 (계획 §1.1, §1.3). */
export interface CurrentActionView {
  kicker: string;
  icon: string;
  label: string;
  detail: string;
}

/** 홈 밴드에 남는 목표 — 지금 할 일 하나뿐이다. */
export function homeGoalChips(chips: readonly GoalChip[]): GoalChip[] {
  return chips.filter((chip) => chip.role === 'immediate');
}

/**
 * 홈에서 뺀 중·장기 목표. 없애는 게 아니라 **메뉴의 `목표` 절로 옮긴다** —
 * 홈에서는 하트·별 아이콘만 남아 뜻을 말하지 못했다 (2026-08-26 실측).
 */
export function menuGoalChips(chips: readonly GoalChip[]): GoalChip[] {
  return chips.filter((chip) => chip.role !== 'immediate');
}

/**
 * 카이로의 직원 메시지 바처럼 **현재 행동 한 개**를 말한다.
 * 상세가 없어도 이름은 남는다 — 뜻을 아이콘에만 두면 화면이 다시 벙어리가 된다.
 */
export function currentActionView(chip: GoalChip): CurrentActionView {
  return {
    kicker: '다음 할 일',
    icon: chip.icon,
    label: chip.label,
    detail: chip.detail ?? '',
  };
}

/**
 * 홈에만 보이는 목표를 메뉴·건설·패널·코스 전환과 같은 언어로 표현한다.
 *
 * 표면의 정본은 `panels.ts` 의 `InputSurface` 다 — 목표 가시성은 그 소유권의
 * **한 항목**이지 별도 축이 아니다 (계획 §1.2).
 */
export type GoalSurfaceMode = InputSurface;

/** 홈 목표가 패널 DOM의 세부 구현을 모르도록 모드를 한 곳에서 가시성으로 바꾼다. */
export class GoalSurfaceState {
  private current: GoalSurfaceMode = 'home';

  get mode(): GoalSurfaceMode {
    return this.current;
  }

  get visible(): boolean {
    return this.current === 'home';
  }

  set(mode: GoalSurfaceMode): void {
    this.current = mode;
  }
}

export type RiskTone = 'safe' | 'watch' | 'caution' | 'danger';

export interface HudOptions {
  onPick: (item: BuildItem) => void;
  /** 카드 썸네일 공급 — 에셋 제공자의 캔버스를 그대로 (없으면 글리프) */
  thumbFor?: (spriteId: string) => HTMLCanvasElement | null;
  /**
   * 코스 탭 — 견인기구 루트는 **짓는 것**이지 관리 메뉴가 아니다 (K32).
   * 메뉴 시트 안에 있을 때는 버튼이 안 보여서 "코스 기능이 없다"로 읽혔다.
   */
  onCourse: () => void;
  /**
   * 붓 라벨이 바뀔 때 (K47-①). **정본은 티커**로 옮겼다 — 하단 바는 누르는 곳이고
   * 읽는 것은 위(헤더)와 티커다. 시트에서 카드를 고르는 순간은 hud 안에서 일어나므로
   * (`itemCard`) 바깥이 알 방법이 이 콜백뿐이다.
   */
  onBrush?: (label: string | null) => void;
  /**
   * 시트가 **열리는 순간** (P3-E). 메뉴 안의 목록(의뢰·소원·인증)은 시트가 닫혀 있는
   * 동안에는 그릴 이유가 없는데, 1.5초 폴링이 매번 다시 그리고 있었다 — 인증이 그
   * 폴링에 `evaluateCombos` 를 한 번 더 얹으므로(실측 시설 53채에 2.2ms) 열릴 때
   * 한 번 그리는 쪽으로 옮겼다. 폰이 1순위라는 게 이 콜백의 이유다.
   */
  onSheetOpen?: (which: 'build' | 'menu') => void;
  /**
   * 입력 소유권이 바뀔 때 (UI v3). HUD 는 목표·하단 바만 소유하므로 **티커처럼 HUD 밖에
   * 사는 홈 입력층**은 같은 소유권 값을 이 콜백으로 받아 자기 표면을 내린다.
   * 각자 z-index 를 올려 싸우는 대신 한 값이 세 표면을 함께 정한다.
   */
  onSurface?: (surface: InputSurface, ownership: HomeInputOwnership) => void;
  /**
   * 홈에서 뺀 중·장기 목표의 새 집 (UI v3). 홈이 이걸 그리지 않는 대신, 목적지를
   * 아는 쪽(메뉴)에게 같은 chip 을 넘긴다 — 새 sim 상태를 만들지 않는다.
   */
  onMenuGoals?: (chips: GoalChip[]) => void;
}

export class KairoHud {
  /** 메뉴 시트 안 — 호출자가 도감·감상·코스·경영·새 판 버튼을 여기에 넣는다 */
  readonly menuSlot: HTMLDivElement;
  /** 의뢰 목록 — 예전엔 우상단을 상시로 덮었다 */
  readonly quests: HTMLDivElement;

  private readonly statusCap: HTMLDivElement;
  private readonly cashCap: HTMLDivElement;
  private readonly weatherChip: HTMLDivElement;
  private readonly satCap: HTMLDivElement;
  private readonly visCap: HTMLDivElement;
  private readonly gradeCap: HTMLDivElement;
  private readonly goalBox: HTMLDivElement;
  private readonly primaryGoal: HTMLDivElement;
  private readonly goalSurface = new GoalSurfaceState();
  private readonly riskBox: HTMLDivElement;
  /** 홈 입력층의 나머지 절반 — 소유권을 잃으면 통째로 내린다 (계획 §1.2) */
  private readonly bar: HTMLDivElement;
  /** 소유권 정체를 CSS 가 읽는 자리. HUD 밖 표면(티커·시트 바닥)이 같은 값을 본다 */
  private readonly surfaceRoot: HTMLElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly buildBtn: HTMLButtonElement;
  private readonly sheet: HTMLDivElement;
  /** 시트의 패널 얼굴 — `panelHost` 가 이걸 안다 */
  readonly sheetPanel: Panel;
  private readonly sheetTitle: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly buildBody: HTMLDivElement;
  private readonly menuBody: HTMLDivElement;
  private readonly context: HTMLDivElement;

  private readonly confirmBar: HTMLDivElement;
  private readonly confirmLabel: HTMLDivElement;
  private readonly confirmThumb: HTMLDivElement;
  private readonly confirmName: HTMLDivElement;
  private readonly confirmCost: HTMLDivElement;
  private readonly confirmCheck: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  /** 모드 줄 — "지금 배치 중" + 연속 설치 토글 (UI v3) */
  private readonly confirmMode: HTMLDivElement;
  private readonly confirmModeLabel: HTMLDivElement;
  private readonly repeatBtn: HTMLButtonElement;
  private onConfirm: (() => void) | null = null;
  private onCancel: (() => void) | null = null;
  private onRotate: (() => void) | null = null;
  private onRepeat: (() => void) | null = null;

  private readonly opts: HudOptions;
  private items: BuildItem[] = [];
  private tab: BuildTab = 'facility';
  private open: '' | 'build' | 'menu' = '';

  constructor(parent: HTMLElement, opts: HudOptions) {
    this.opts = opts;
    this.surfaceRoot = parent;

    /*
     * ── 상단 2단 헤더 (K46, 레퍼런스 구조) ──────────────────────────────
     * 1줄: 날씨 칩 + 날짜·시각 + 현금. 2줄: 지표 셋(만족·방문·등급) + **위험도**.
     * 아이콘은 임시 글리프 — ui/* 에셋 슬롯이 채워지면 교체된다 (계약의 uiIcons).
     *
     * ⚠ 헤더에는 **버튼이 하나도 없다** (K47-②). 여기 버튼을 다시 넣으면 엄지가 못 닿는
     * 곳에 컨트롤이 생기고, 상시 컨트롤 2개 불변식도 같이 깨진다.
     */
    const top = el('div', 'ktop');
    top.id = 'kairo-top';
    // 줄 하나 = 면 하나, 그리고 두 줄이 **한 패널**이다 (레퍼런스 실측 — 헤더는
    // 떠 있는 줄 둘이 아니라 구분선으로 나뉜 한 덩어리로 읽힌다)
    const row1 = el('div', 'khdr-row');
    this.weatherChip = el('div', 'kwx');
    this.weatherChip.id = 'kairo-weather';
    this.weatherChip.textContent = '☀';
    this.statusCap = el('div', 'grow');
    this.statusCap.id = 'kairo-status';
    this.cashCap = el('div', 'kcash');
    this.cashCap.id = 'kairo-cash';
    row1.append(this.weatherChip, this.statusCap, this.cashCap);

    const row2 = el('div', 'khdr-row');
    row2.id = 'kairo-stats';
    const stat = (icon: string, id: string): HTMLDivElement => {
      const box = el('div', 'kstat-mini');
      box.id = id;
      box.append(el('span', 'kico-s', icon), el('span', 'kstat-v', '—'));
      return box;
    };
    /*
     * 😊 는 그대로 두되 **뜻을 접근성에 남긴다** — 아이콘만으로는 "만족도"인지 "평판"인지
     * 안 읽힌다. 정본 이름은 `평판` 이고 눈금은 0~100 정수다 (UX 감사 P0-5).
     */
    this.satCap = stat('😊', 'kairo-sat');
    this.satCap.setAttribute('aria-label', '평판');
    this.satCap.title = '평판 — 손님이 나갈 때의 만족 평균';
    this.visCap = stat('👥', 'kairo-visitors');
    this.gradeCap = stat('⭐', 'kairo-grade');
    /*
     * 위험도 — 하단 바에서 올라왔다 (K47-②). **상시 표시가 규칙**이라(사고가 RNG 로
     * 느껴지면 안 된다) 시트에 넣을 수 없고, 누르는 것이 아니므로 헤더가 제자리다.
     * ⚠ `id="kairo-risk"` 는 하네스가 "위험도 상시 표시"를 재는 손잡이다 — 바꾸지 말 것.
     */
    this.riskBox = el('div', 'krisk safe', '위험도 —');
    this.riskBox.id = 'kairo-risk';
    row2.append(this.satCap, this.visCap, this.gradeCap, this.riskBox);
    top.append(row1, row2);
    parent.append(top);
    /*
     * 홈 셸 v3 (계획 §1.1): 하단 뉴스 띠 위의 **현재 행동 한 줄**이다.
     *
     * ⚠ v2 는 여기에 A/B/C 세 칸을 넣었다. 폭이 각각 20% 뿐인 B/C 는 글자가 잘려
     * CSS 가 label/detail 을 아예 감췄고, 화면에는 하트·별만 남아 **뜻을 말하지 못했다**
     * (실측). 중·장기는 메뉴의 `목표` 절로 옮긴다 — 밴드의 자리·폭·높이는 여전히
     * `style.css` 가 소유한다.
     */
    this.goalBox = el('div', 'kgoals');
    this.goalBox.id = 'kairo-goal';
    this.primaryGoal = el('div', 'kgoal-primary');
    this.goalBox.append(this.primaryGoal);
    parent.append(this.goalBox);

    /*
     * ── 하단 바 (K47-②) ──────────────────────────────────────────────────
     * **버튼 둘뿐이다.** 위험도는 헤더로, 붓 라벨은 티커로 갔고 `하루 »` 는 없앴다.
     * 여기에 뭔가를 더 놓고 싶어지면 시트 안이 제자리인지 먼저 볼 것.
     */
    const bar = el('div', 'kbar');
    bar.id = 'kairo-bar';
    this.bar = bar;

    this.menuBtn = el('button', 'kbtn', '메뉴');
    this.menuBtn.id = 'kairo-menu-open';
    this.menuBtn.addEventListener('click', () => this.toggle('menu'));

    this.buildBtn = el('button', 'kbtn', '건설');
    this.buildBtn.id = 'kairo-build-open';
    this.buildBtn.addEventListener('click', () => this.toggle('build'));

    // 좌우로 벌린다 — 사이의 빈 칸이 지도를 가리지 않는 유일한 채움이다
    bar.append(this.menuBtn, this.buildBtn);
    parent.append(bar);
    // 목표·바가 둘 다 존재해야 소유권을 한 번에 적용할 수 있다 (부분 상태를 만들지 않는다)
    this.setGoalSurface('home');

    // ── 시트 (건설·메뉴 공용) ────────────────────────────────────────────
    this.sheet = el('div', 'ksheet');
    this.sheet.id = 'kairo-sheet';
    this.sheet.hidden = true;

    const head = el('div', 'ksheet-head');
    this.sheetTitle = el('div', 'ksheet-title');
    this.tabs = el('div', 'tab-bar');
    const close = el('button', 'kbtn', '닫기');
    close.id = 'kairo-sheet-close';
    close.addEventListener('click', () => this.hide());
    head.append(this.sheetTitle, this.tabs, close);

    const body = el('div', 'ksheet-body');
    this.buildBody = el('div', 'ksheet-build');
    this.menuBody = el('div', 'ksheet-menu');
    this.menuSlot = el('div', 'kgrid');
    this.quests = el('div', 'kquests');
    this.quests.id = 'kairo-quests';
    /*
     * 메뉴에서 패널을 열면 시트를 닫는다.
     *
     * 안 닫으면 패널을 닫은 뒤에도 시트가 화면 아래 절반을 덮은 채 남아 **지도 탭을
     * 먹는다** — 검증에서 탭 5칸 중 2칸이 반응 없음으로 잡혔다. UX 로도 버그다.
     */
    this.menuSlot.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.hide();
    });
    this.context = el('div', 'kcontext');
    this.context.id = 'kairo-context';
    // 경영 IA가 같은 판 정보를 자기 문맥 줄에 표시한다. 이 레거시 손잡이는 검증용 text만 보존한다.
    this.context.hidden = true;
    this.menuBody.append(this.context, this.menuSlot, this.quests);
    body.append(this.buildBody, this.menuBody);

    this.sheet.append(head, body);
    parent.append(this.sheet);

    /*
     * 시트를 **패널로 등록한다** (K37). 호스트는 `hide()` 만 본다.
     *
     * `KairoHud` 자체를 `Panel` 로 만들지 않은 이유: HUD 는 시트만이 아니라 상단 캡슐과
     * 하단 바까지 소유한다. HUD 를 패널로 읽히게 두면 "패널을 닫았다"가 "바를
     * 지웠다"로 오해된다.
     */
    this.sheetPanel = { hide: () => this.hide() };
    panelHost.register(this.sheetPanel);
    /*
     * ⚠ `panelHost.onChange` 는 **등록 즉시 한 번 부른다** (`panels.ts`). 그 콜백이
     * `this.confirming` 을 읽으므로 확정 바가 만들어진 **뒤에** 등록해야 한다 —
     * 여기 두면 `confirmBar` 가 아직 `undefined` 라 부팅이 통째로 죽는다
     * (2026-08-26 브라우저 게이트가 잡았다: `Cannot read properties of undefined`,
     * 캔버스는 떴는데 `window.__kairo` 가 영원히 안 생겼다). 등록은 생성자 끝에 있다.
     */

    /*
     * ── 확정 바 (K32) ──
     *
     * 시설은 탭하면 바로 안 놓인다. 고스트를 보고 확정한다 — 회전과 "장비 탄 손님"이
     * 나중에 들어오므로 **놓기 전에 만질 수 있는 상태**가 필요하다.
     */
    this.confirmBar = el('div', 'kconfirm');
    this.confirmBar.id = 'kairo-confirm';
    this.confirmBar.hidden = true;
    /*
     * ── 모드 줄 (UI v3) ──
     *
     * "지금 배치 중이다"와 "연속 설치가 켜져 있나"를 **글자로** 말한다. 아이콘만
     * 남기면 뜻을 못 읽는다 (계획 §1.3, B/C 목표가 그렇게 벙어리가 됐다).
     *
     * ⚠ 토글을 `취소 | ↻ | 확정` 과 **같은 줄에 넣지 않는다.** 확정 바 한 줄은 377px
     * 이라 44px 넷이 안 들어간다 — K47-③ 이 십자 화살표를 뺀 것과 같은 산수다.
     */
    this.confirmMode = el('div', 'kconfirm-mode');
    this.confirmModeLabel = el('div', 'kconfirm-mode-label', '배치 중');
    this.repeatBtn = el('button', 'kbtn kconfirm-repeat', '연속 설치 끔');
    this.repeatBtn.id = 'kairo-place-repeat';
    this.repeatBtn.type = 'button';
    this.repeatBtn.setAttribute('aria-pressed', 'false');
    this.repeatBtn.addEventListener('click', () => this.onRepeat?.());
    this.confirmMode.append(this.confirmModeLabel, this.repeatBtn);

    const confirmSummary = el('div', 'kconfirm-summary');
    this.confirmLabel = el('div', 'place-label');
    this.confirmThumb = el('div', 'kconfirm-thumb');
    const confirmText = el('div', 'kconfirm-text');
    this.confirmName = el('div', 'kconfirm-name', '배치');
    this.confirmCost = el('div', 'kconfirm-cost', '비용 확인');
    this.confirmCheck = el('div', 'kconfirm-check', '자리를 확인하세요');
    confirmText.append(this.confirmName, this.confirmCost, this.confirmCheck);
    confirmSummary.append(this.confirmThumb, confirmText);
    const btns = el('div', 'place-buttons');
    const cancel = el('button', 'place-btn cancel', '취소');
    cancel.id = 'kairo-place-cancel';
    cancel.addEventListener('click', () => this.cancelConfirm());
    // 회전 — 방향 스프라이트가 생기면 켠다. 자리를 지금 잡아 둬야 나중에 배치가 안 흔들린다
    this.rotateBtn = el('button', 'place-btn rotate', '↻');
    this.rotateBtn.id = 'kairo-place-rotate';
    this.rotateBtn.disabled = true;
    this.rotateBtn.title = '회전 (방향 변경)';
    this.rotateBtn.addEventListener('click', () => this.onRotate?.());
    this.confirmBtn = el('button', 'place-btn confirm', '확정');
    this.confirmBtn.id = 'kairo-place-confirm';
    this.confirmBtn.addEventListener('click', () => {
      const cb = this.onConfirm;
      this.hideConfirm();
      cb?.();
    });
    btns.append(cancel, this.rotateBtn, this.confirmBtn);
    this.confirmBar.append(this.confirmMode, confirmSummary, this.confirmLabel, btns);
    parent.append(this.confirmBar);

    this.setBrush(null);

    /*
     * 패널 소유권 구독 — **확정 바까지 다 만든 뒤**다 (위 경고). 등록 즉시 한 번
     * 불리므로 이 시점의 초기 표면(`home`)도 여기서 확정된다.
     */
    panelHost.onChange((open) => {
      // 패널이 다 닫혔는데 조준이 살아 있으면 화면 주인은 여전히 배치다 (UI v3)
      if (!open) this.setGoalSurface(this.confirming ? 'aiming' : 'home');
      else if (this.open === 'menu' || this.open === 'build') this.setGoalSurface(this.open);
      else this.setGoalSurface('panel');
    });
  }

  /**
   * 배치 확정 바를 띄운다. `ok` 가 false 면 확정을 막고 라벨을 경고색으로 —
   * 왜 안 되는지(`label`)를 같이 보여준다.
   */
  showConfirm(
    label: string,
    ok: boolean,
    on: { confirm: () => void; cancel: () => void; rotate?: () => void; repeat?: RepeatToggle },
    view?: BuildConfirmView,
  ): void {
    this.confirmLabel.className = ok ? 'place-label' : 'place-label bad';
    // `.place-label`은 K47 하네스와 접근성의 기존 판정 문장 손잡이라 그대로 보존한다.
    this.confirmLabel.textContent = label;
    this.confirmName.textContent = view?.name ?? '배치';
    this.confirmCost.textContent = `비용 ${view?.cost ?? '확인'}`;
    this.confirmCheck.textContent = view?.result ?? label;
    this.confirmLabel.setAttribute(
      'aria-label',
      `${this.confirmName.textContent}, ${this.confirmCost.textContent}, ${this.confirmCheck.textContent}`,
    );
    this.drawThumb(this.confirmThumb, view?.sprite, view?.kind);
    this.confirmBtn.disabled = !ok;
    this.onConfirm = on.confirm;
    this.onCancel = on.cancel;
    // 회전 (K45/K53) — 비정사각 2방향 또는 방향 그림이 있는 4방향 시설에서 켠다
    this.onRotate = on.rotate ?? null;
    this.rotateBtn.disabled = on.rotate === undefined;
    /*
     * 모드 줄 (UI v3) — 반복이 뜻 없는 붓(이동)에서는 토글 자체를 안 만든다.
     * 라벨은 언제나 남는다: "지금 무엇을 배치 중인가"가 이 바의 첫 질문이다.
     */
    this.confirmModeLabel.textContent = view?.mode ?? '배치 중';
    this.onRepeat = on.repeat?.toggle ?? null;
    this.repeatBtn.hidden = on.repeat === undefined;
    if (on.repeat !== undefined) {
      this.repeatBtn.textContent = on.repeat.label;
      this.repeatBtn.classList.toggle('on', on.repeat.on);
      this.repeatBtn.setAttribute('aria-pressed', on.repeat.on ? 'true' : 'false');
    }
    this.confirmBar.hidden = false;
    /*
     * 조준은 **모드**다 (계획 §1.2). 홈 목표·티커·하단 바가 살아 있으면 그 hit surface
     * 가 확정 버튼 위를 지나간다 — 실측: 티커의 44px hit(z 11)이 `.kconfirm`(z 10)의
     * 확정 버튼 아래쪽 27px 를 먹는다. 시트가 열려 있는 동안은 그쪽이 소유자이므로
     * 건드리지 않고, 시트가 닫히는 순간 `onChange` 가 다시 여기를 반영한다.
     */
    if (!panelHost.anyOpen) this.setGoalSurface('aiming');
  }

  hideConfirm(): void {
    this.confirmBar.hidden = true;
    this.onConfirm = null;
    this.onCancel = null;
    this.onRotate = null;
    this.onRepeat = null;
    // 조준이 끝났으면 화면은 홈으로 돌아온다 (패널이 열려 있으면 그쪽이 정한다)
    if (!panelHost.anyOpen) this.setGoalSurface('home');
  }

  /**
   * 확정 바를 **취소로** 닫는다 (K47-③) — 취소 버튼과 "시트를 열었다"가 같은 길을 쓴다.
   *
   * ⚠ 확정 바는 `PanelHost` 패널이 **아니다.** 스크림 없는 바라 배타 규칙이 시트·결산과
   * 부딪힌다 (등록하면 시트를 열 때마다 서로를 닫는 싸움이 된다). 대신 시트가 열릴 때
   * 여기를 부른다 — 안 부르면 시트를 다시 열어도 확정 바가 남아, 옛 조준이 화면에 뜬 채
   * 새 붓을 고르게 된다.
   */
  cancelConfirm(): void {
    if (this.confirmBar.hidden) return;
    const cb = this.onCancel;
    this.hideConfirm();
    cb?.();
  }

  get confirming(): boolean {
    return !this.confirmBar.hidden;
  }

  /**
   * 확정 바가 가리는 화면 아래 높이 (CSS px). 조준 레티클을 그만큼 위로 올린다 —
   * 안 올리면 조준점이 바 밑에 숨어 "고스트가 안 보인다"가 된다 (K33 규칙:
   * 가려진 높이는 상수로 박지 말고 **재서** 쓴다. 바가 두 줄이 되면 상수는 어긋난다).
   *
   * 숨은 상태에서도 답해야 하므로(첫 조준은 바가 뜨기 전에 자리를 정한다) 잠깐
   * 펼쳐서 잰다 — 같은 프레임 안이라 화면에는 안 나타난다.
   */
  get confirmInset(): number {
    const wasHidden = this.confirmBar.hidden;
    if (wasHidden) this.confirmBar.hidden = false;
    const top = this.confirmBar.getBoundingClientRect().top;
    if (wasHidden) this.confirmBar.hidden = true;
    return Math.max(0, Math.round(window.innerHeight - top));
  }

  /**
   * 헤더 2줄 (K46) — 날씨·지표. 1.5초 폴링이 부르므로 **값만** 갈아 끼운다
   * (엘리먼트를 다시 만들면 그 주기로 깜빡인다). 목표는 폴링이 아니라 상태 변경
   * 경계에서만 다시 파생하므로 이 경로와 다르다.
   *
   * K47-②: `reportNew` 배지는 없앴다. 지난 결산은 **알림함의 "결산 도착" 행**에서 연다 —
   * 배지가 가리키던 것이 어차피 그 사건 하나였고, 헤더에 버튼을 두지 않기로 했다.
   */
  setHeader(h: { weather: string; sat: string; visitors: string; grade: string }): void {
    this.weatherChip.textContent = h.weather;
    (this.satCap.querySelector('.kstat-v') as HTMLElement).textContent = h.sat;
    (this.visCap.querySelector('.kstat-v') as HTMLElement).textContent = h.visitors;
    (this.gradeCap.querySelector('.kstat-v') as HTMLElement).textContent = h.grade;
  }

  setStatus(text: string): void {
    this.statusCap.textContent = text;
  }

  setCash(won: number): void {
    this.cashCap.textContent = `◎ ${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
  }

  setRisk(tone: RiskTone, text: string): void {
    this.riskBox.className = `krisk ${tone}`;
    this.riskBox.textContent = text;
  }

  /**
   * 목표 갱신 (UI v3). 홈은 **현재 행동 한 줄**만 그리고, 중·장기는 `onMenuGoals` 로
   * 메뉴에 넘긴다 — 어느 목표도 사라지지 않고 읽는 자리만 바뀐다.
   */
  setChips(chips: GoalChip[]): void {
    // 목표는 상태 변경 시점에만 다시 파생된다. callback은 JSON 서명에 남지 않으므로
    // DOM 캐시를 두면 같은 문구에 예전 코스 handle이 남을 수 있다.
    this.primaryGoal.replaceChildren();
    for (const c of homeGoalChips(chips)) {
      const view = currentActionView(c);
      const chip = el('div', `kgoal kgoal-current tap${c.tone !== undefined ? ` ${c.tone}` : ''}`);
      chip.dataset['goalRole'] = c.role;
      chip.setAttribute('aria-label', `${view.kicker}, ${view.label}`);
      chip.append(el('span', 'kgoal-ico', view.icon));
      const txt = el('div', 'kgoal-txt');
      txt.append(el('div', 'kgoal-kicker', view.kicker));
      txt.append(el('div', 'kgoal-label', view.label));
      if (view.detail !== '') txt.append(el('div', 'kgoal-detail', view.detail));
      chip.append(txt);
      // 카이로의 직원 메시지 바처럼 "여기를 누르면 그리로 간다"를 글자로 말한다
      chip.append(el('span', 'kgoal-go', '〉'));
      const act = c.action;
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        act();
      });
      chip.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // Space 로 화면이 스크롤되면 지도가 밀린다
        e.stopPropagation();
        act();
      });
      this.primaryGoal.append(chip);
    }
    this.opts.onMenuGoals?.(menuGoalChips(chips));
  }

  /**
   * 홈/패널/편집 호출부가 DOM을 직접 만지지 않는 **유일한 입력 소유권 경계** (UI v3).
   *
   * 예전에는 목표만 내렸다. 그래서 시트가 열려 있어도 티커 hit surface(44px)와 하단
   * 바가 살아 있었고, 실측에서 시트 아래쪽 버튼 네 개의 중심 `elementFromPoint` 가
   * 시트가 아니라 하단 바를 돌려줬다. 이제 세 표면을 **한 값으로 함께** 정한다.
   */
  setGoalSurface(mode: GoalSurfaceMode): void {
    this.goalSurface.set(mode);
    const own = homeInputOwnership(mode);
    this.goalBox.dataset['goalSurface'] = mode;
    this.goalBox.hidden = !own.goals;
    this.bar.hidden = !own.bar;
    // CSS 는 이 정체 하나만 읽는다 — 시트가 바 자리를 대신하는 것도 같은 값이 정한다
    this.surfaceRoot.dataset['uiSurface'] = mode;
    this.surfaceRoot.dataset['homeInput'] = own.goals ? 'on' : 'off';
    this.opts.onSurface?.(mode, own);
  }

  /** 메뉴 상단의 판 설정 줄 — 맵·시나리오 이름 (목표란에서 옮겨 왔다, K40) */
  setContext(text: string): void {
    this.context.textContent = text;
  }

  /**
   * 지금 든 붓. null 이면 아무것도 안 들었다.
   *
   * K47-①에서 표시의 **정본이 티커**로 갔고, K47-②에서 바의 `.kbrush` 요소를 걷어냈다.
   * 여기서는 콜백만 흘린다 — 두 곳에 같은 글이 뜨면 어느 쪽이 진짜인지 알 수 없다.
   */
  setBrush(label: string | null): void {
    this.opts.onBrush?.(label);
  }

  /** 등급이 오르면 잠금이 풀리므로 다시 만든다 */
  setBuildItems(items: BuildItem[]): void {
    this.items = items;
    if (this.open === 'build') this.renderBuild();
  }

  hide(): void {
    this.open = '';
    this.sheet.hidden = true;
    this.menuBtn.classList.remove('on');
    this.buildBtn.classList.remove('on');
    panelHost.closed(this.sheetPanel);
  }

  get visible(): boolean {
    return this.open !== '';
  }

  /** 메뉴 시트가 열려 있나 — 안 보이는 목록을 다시 그리지 않기 위해 (P3-E) */
  get menuOpen(): boolean {
    return this.open === 'menu';
  }

  /** 목표 B/C callback용 — 해당 목표만 메뉴 목적지를 연다. */
  showMenu(): void {
    if (this.open !== 'menu') this.toggle('menu');
  }

  /** 결산 처방용 — 같은 건설 시트를 직접 열되 현재 탭/필터 선택은 보존한다. */
  showBuild(): void {
    if (this.open !== 'build') this.toggle('build');
  }

  private toggle(which: 'build' | 'menu'): void {
    if (this.open === which) {
      this.hide();
      return;
    }
    // 한 번에 하나 (K37) — 도감·경영 같은 패널이 열려 있으면 그쪽이 닫힌다
    if (!panelHost.open(this.sheetPanel)) return;
    // 시트를 열면 진행 중이던 조준은 취소한다 (K47-③ — 확정 바는 패널이 아니다)
    this.cancelConfirm();
    this.open = which;
    this.setGoalSurface(which);
    this.sheet.hidden = false;
    this.buildBody.hidden = which !== 'build';
    this.menuBody.hidden = which !== 'menu';
    this.tabs.hidden = which !== 'build';
    this.sheetTitle.textContent = which === 'build' ? '건설' : '메뉴';
    this.menuBtn.classList.toggle('on', which === 'menu');
    this.buildBtn.classList.toggle('on', which === 'build');
    if (which === 'build') this.renderBuild();
    this.opts.onSheetOpen?.(which);
  }

  private renderBuild(): void {
    this.tabs.replaceChildren();
    for (const [key, name] of [
      ['facility', '시설'],
      ['building', '건물'],
      ['ground', '바닥'],
      ['course', '코스'],
    ] as const) {
      const b = el('button', `tab-btn${this.tab === key ? ' on' : ''}`, name);
      b.dataset['tab'] = key;
      b.addEventListener('click', () => {
        if (key === 'course') {
          // 코스는 목록이 아니라 전용 편집 화면이다 — 시트를 닫고 넘긴다
          this.hide();
          this.opts.onCourse();
          return;
        }
        this.tab = key;
        this.renderBuild();
      });
      this.tabs.append(b);
    }

    this.buildBody.replaceChildren();
    const mine = this.items.filter((x) => x.tab === this.tab);

    /*
     * 유형 칩 (K40, concept-29 의 서브탭) — 시설 탭에만. 존이 하나뿐이면 안 낸다.
     * 티저는 필터와 무관하게 항상 끝에 남는다 — "다음"은 어느 존에서도 보여야 한다.
     */
    let list = mine;
    const zones = [...new Set(mine.map((x) => x.group).filter((g): g is string => g !== undefined))];
    if (this.tab === 'facility' && zones.length > 1) {
      const chips = el('div', 'kchips');
      const chip = (label: string, val: string | null): void => {
        const c = el('button', `kbtn${this.zone === val ? ' on' : ''}`, label);
        c.addEventListener('click', () => {
          this.zone = val;
          this.renderBuild();
        });
        chips.append(c);
      };
      chip('전체', null);
      for (const z of zones) chip(z, z);
      this.buildBody.append(chips);
      if (this.zone !== null) {
        list = mine.filter((x) => x.group === this.zone || x.teaser !== undefined);
      }
    }

    /*
     * Phase 4 카드 레일 — 터치에서는 화면 폭에 카드 약 3장을 두고 **스와이프만** 쓴다.
     * 화살표가 카드 두 장 자리를 먹던 것이 문제였다. 비터치에는 키보드/마우스용 이름 있는
     * 페이지 버튼을 그대로 만든다. CSS 레이아웃은 둘 다 한 벌이며 미디어 쿼리로 갈리지 않는다.
     */
    const wrap = el('div', 'kcar-wrap');
    const car = el('div', 'kcarousel');
    car.setAttribute('role', 'region');
    car.setAttribute('aria-label', '건설 카드 목록');
    car.tabIndex = 0;
    for (const it of list) car.append(this.itemCard(it));
    const page = (dir: number): void => {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      car.scrollBy({ left: dir * car.clientWidth * 0.8, behavior: still ? 'auto' : 'smooth' });
    };
    if (carouselNeedsNav(navigator.maxTouchPoints)) {
      const prev = el('button', 'kbtn kcar-nav', '◀');
      prev.setAttribute('aria-label', '이전 건설 카드');
      prev.addEventListener('click', () => page(-1));
      const next = el('button', 'kbtn kcar-nav', '▶');
      next.setAttribute('aria-label', '다음 건설 카드');
      next.addEventListener('click', () => page(1));
      wrap.append(prev, car, next);
    } else {
      wrap.append(car);
    }
    this.buildBody.append(wrap);
  }

  /** 시설 탭 유형 칩의 현재 필터 (null = 전체) */
  private zone: string | null = null;

  private itemCard(it: BuildItem): HTMLButtonElement {
    const b = el('button', 'kcard');
    b.dataset['pick'] = `${it.kind}:${it.id}`;
    const view = buildItemView(it);
    const blocked = !view.selectable;
    b.disabled = blocked;
    if (it.teaser !== undefined) b.classList.add('teaser');

    // 썸네일 — 게임과 같은 계약 그림. 그림 계약이 없는 것(바닥 붓·철거·문)은 글리프
    const thumb = el('div', 'kcard-thumb');
    this.drawThumb(thumb, it.sprite, it.kind);
    b.append(thumb);

    b.append(el('span', 'kcard-name', it.name));
    const meta = el('span', 'kcard-meta');
    meta.append(el('span', 'kcard-cost', view.cost), el('span', 'kcard-role', view.role));
    b.append(meta);
    if (it.sub !== undefined) b.append(el('span', 'kcard-sub', it.sub));
    if (view.blockedReason !== undefined) {
      b.append(el('span', 'kcard-block', `막힘 · ${view.blockedReason}`));
    }
    if (view.unlockMethod !== undefined) {
      b.append(el('span', 'kcard-unlock', `해제 · ${view.unlockMethod}`));
    }
    b.setAttribute(
      'aria-label',
      [it.name, `비용 ${view.cost}`, `역할 ${view.role}`, view.blockedReason, view.unlockMethod]
        .filter((x): x is string => x !== undefined)
        .join(', '),
    );
    b.addEventListener('click', () => {
      if (blocked) return;
      /*
       * ⚠ 여기서 붓 라벨을 **다시 쓰지 않는다** (UI v3). 예전엔 `onPick` 뒤에
       * `setBrush(이름)` 을 한 번 더 불렀는데, 이제 `onPick` 이 `BuildSession.pick()`
       * 으로 흘러 `배치 중 · 화장실` 같은 모드 문장을 이미 심는다 — 여기서 또 쓰면
       * 그 문장을 raw 이름으로 덮어써 "연속 설치 중"이 화면에서 사라진다.
       * 라벨의 주인은 세션 하나다.
       */
      this.opts.onPick(it);
      this.hide();
    });
    return b;
  }

  /** 카드와 확정 바가 같은 에셋 공급자/글리프 폴백을 쓰게 한다. */
  private drawThumb(host: HTMLElement, sprite: string | undefined, kind: BuildKind | undefined): void {
    host.replaceChildren();
    const src = sprite !== undefined ? (this.opts.thumbFor?.(sprite) ?? null) : null;
    if (src) {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
      host.append(c);
      return;
    }
    host.textContent = kind === undefined ? '■' : (GLYPH[kind] ?? '■');
  }
}

/** 그림 계약이 없는 붓들의 글리프 — ui/* 에셋 슬롯이 채워지면 교체된다 (계획 §1-1) */
const GLYPH: Partial<Record<BuildKind, string>> = {
  ground: '▤',
  erase: '✕',
  door: '⇄',
  move: '✥',
};
