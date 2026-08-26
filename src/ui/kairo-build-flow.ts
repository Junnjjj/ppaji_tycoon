/**
 * 건설 상태 머신 (UI v3 Task 5) — **1회 설치가 기본이다.**
 *
 * ## 왜 따로 떼어냈나
 *
 * 붓·조준·이동 선택은 `main.ts` 의 지역 변수 넷(`brush`·`brushFacility`·`moveSel`·`aim`)
 * 이었고, 정리는 호출부마다 손으로 했다. 그래서 성공 뒤 무엇이 남는지가 붓마다 달랐다
 * (2026-08-26 실측):
 *
 * · 시설 — `endAim()` 만 하고 **붓은 남긴다.** 다음 지도 탭이 다시 조준을 연다
 * · 바닥·철거 — 성공 뒤 `refreshAim()` 으로 **확정 바까지 되살린다** (연속 배치)
 * · 이동 — `moveSel` 만 풀고 붓은 남긴다
 *
 * 실제 터치로 재보니 석재 보도 확정 한 번 뒤 조준이 그대로 남아 다음 칸이 즉시
 * 활성화됐고, 현금이 `500만 → 499.3만 → 498.6만` 으로 **두 번** 빠졌다. 사용자는
 * 한 번 놓았다고 생각한다.
 *
 * 그래서 상태를 한 곳에 모으고 **끝내는 문을 셋**만 둔다:
 *
 * ```text
 * HOME → (pick) → 조준 → ┬ finish  성공. repeat 가 켜져 있을 때만 붓·조준이 남는다
 *                        ├ cancel  확정 바의 취소 — 붓까지 놓는다
 *                        └ abandon 메뉴·패널·코스가 열렸다
 * ```
 *
 * 셋 다 같은 `end()` 로 내려가므로 "한쪽만 고쳐진" 상태가 구조적으로 안 생긴다.
 *
 * ## 화면을 모른다
 *
 * 이 파일에는 DOM 이 없다. 씬·HUD·티커·토스트는 전부 `BuildSessionHost` 콜백이다 —
 * 그래야 헤드리스 단위 검사가 "확정 뒤 돈이 또 나가나"를 직접 물을 수 있다.
 */

import type { FacilityFacing } from '../sim/kairo/placement.js';

/** 이동 붓의 선택 시설 (K42) — 1단계에서 잡고 확정·취소에서 푼다 */
export interface MoveSelection {
  handle: number;
  defId: string;
  i: number;
  j: number;
  facing: FacilityFacing;
}

/** 조준 상태 (K47-③) — **이것이 배치 좌표의 정본**이다 */
export interface AimState {
  i: number;
  j: number;
  facing: FacilityFacing;
}

/**
 * 세션이 지금 어디에 있나.
 *
 * · `idle` — 붓이 없다. 지도 탭은 시설 정보를 연다 (K50-②)
 * · `selecting` — 붓은 들었지만 조준을 안 쓴다 (출입구 · 이동 1단계)
 * · `aiming` — 조준 중이고 확정하면 **끝난다**
 * · `repeating` — 조준 중이고 확정해도 붓·조준이 남는다 (사용자가 켰을 때만)
 */
export type BuildMode = 'idle' | 'selecting' | 'aiming' | 'repeating';

export interface BuildSessionHost {
  /** 붓 라벨을 화면에 알린다 (`null` = 붓 없음). 정본은 티커다 (K47-①) */
  label(text: string | null): void;
  /** 조준을 처음 연다 — 레티클 밑 칸을 잡고 고스트·확정 바를 띄운다 */
  openAim(): void;
  /** 같은 붓으로 같은 자리를 다시 잰다 (연속 설치에서만) */
  reaim(): void;
  /** 조준·고스트·레티클·확정 콜백·투시를 한꺼번에 내린다 */
  closeAim(): void;
  /** 내 행동의 대답 — 무엇을 놓았고 얼마가 나갔는가 (토스트, K47-① 채널 계약) */
  receipt(text: string): void;
}

/** 조준을 안 쓰는 붓 — 배치가 아니라 **대상 지정**이라 고스트가 없다 (K47-③) */
const TAP_ONLY = new Set(['door']);

/**
 * 연속 설치를 켤 수 있는 붓.
 *
 * ⚠ 이동은 빠진다 — 옮길 시설을 다시 고르는 것부터가 다음 이동이고, 같은 시설을
 * 두 번 옮기는 것은 뜻이 없다.
 */
const REPEATABLE = (brush: string): boolean => brush !== 'move' && !TAP_ONLY.has(brush);

export class BuildSession {
  private brushId: string | null = null;
  private brushLabel = '';
  private defId = '';
  private selection: MoveSelection | null = null;
  private aimState: AimState | null = null;
  private repeatOn = false;

  constructor(private readonly host: BuildSessionHost) {}

  /** 지금 든 붓. 하네스가 `__kairoBrush()` 로 읽는 그 값이다 */
  get brush(): string | null {
    return this.brushId;
  }

  /** 시설 붓의 대상 ID (`brush === 'facility'` 일 때만 뜻이 있다) */
  get facilityId(): string {
    return this.defId;
  }

  get move(): MoveSelection | null {
    return this.selection;
  }

  get aim(): AimState | null {
    return this.aimState;
  }

  get repeat(): boolean {
    return this.repeatOn;
  }

  get mode(): BuildMode {
    if (this.brushId === null) return 'idle';
    if (this.aimState === null) return 'selecting';
    return this.repeatOn ? 'repeating' : 'aiming';
  }

  /**
   * 지금 붓이 조준을 쓰나 — 출입구와 이동 1단계만 탭으로 남는다.
   * `main.tapTile` 이 "조준으로 흘릴까"를 이 하나로 묻는다.
   */
  get usesAim(): boolean {
    if (this.brushId === null) return false;
    if (TAP_ONLY.has(this.brushId)) return false;
    return this.brushId !== 'move' || this.selection !== null;
  }

  /** 연속 설치를 켤 수 있는 붓인가 */
  get canRepeat(): boolean {
    return this.brushId !== null && REPEATABLE(this.brushId);
  }

  /**
   * 지금 무슨 모드인지 **글자로** 말한다 (계획 §1.3: 아이콘만으로 뜻을 두지 않는다).
   * 확정 바의 모드 줄과 티커의 붓 라벨이 같은 문장을 쓴다.
   */
  get modeLabel(): string {
    if (this.brushId === null) return '';
    const head = this.repeatOn ? '연속 설치 중' : '배치 중';
    return this.brushLabel === '' ? head : `${head} · ${this.brushLabel}`;
  }

  /** 연속 설치 토글의 이름 — 현재 상태를 이름 자체가 말한다 */
  get repeatLabel(): string {
    return this.repeatOn ? '연속 설치 켬' : '연속 설치 끔';
  }

  /**
   * 건설 시트에서 붓을 골랐다. **이전 세션은 여기서 끝난다** —
   * 안 끝내면 확정 바가 옛 시설을 가리킨 채 새 붓이 물린다.
   */
  pick(brush: string, label: string, opts?: { facilityId?: string }): void {
    this.end({ silent: true });
    this.brushId = brush;
    this.brushLabel = label;
    this.defId = opts?.facilityId ?? '';
    this.host.label(this.modeLabel);
    if (this.usesAim) this.host.openAim();
  }

  /**
   * 이동 1단계 — 옮길 시설을 물었다 (K42). 여기서부터 조준 + 확정이다.
   * 입구가 둘(이동 붓 탭 · 시설 정보의 `이동`)이라 같은 문을 쓴다.
   */
  beginMove(sel: MoveSelection, label: string): void {
    this.end({ silent: true });
    this.brushId = 'move';
    this.brushLabel = label;
    this.selection = { ...sel };
    this.host.label(this.modeLabel);
    this.host.openAim();
  }

  /** 조준 자리를 처음 잡는다 (`startAim` 의 두 번 재기가 부른다) */
  setAim(i: number, j: number, facing: FacilityFacing = 0): void {
    if (!this.usesAim) return;
    this.aimState = { i, j, facing };
  }

  /**
   * 조준을 이 칸으로 옮긴다 (탭 · 팬).
   * 방향은 유지한다 — 회전해 둔 것이 탭 한 번에 풀리면 ↻ 가 소용없다.
   */
  aimTo(i: number, j: number): void {
    if (!this.usesAim) return;
    this.aimState = { i, j, facing: this.aimState?.facing ?? 0 };
  }

  /** 회전 — 몇 방향인지는 데이터가 안다. 여기는 값만 받는다 */
  setFacing(facing: FacilityFacing): void {
    if (this.aimState === null) return;
    this.aimState.facing = facing;
  }

  /** 이동 확정이 새 handle 을 만들면 선택도 따라간다 (프로브 복원) */
  retagMove(handle: number): void {
    if (this.selection !== null) this.selection.handle = handle;
  }

  /**
   * 연속 설치 (계획 §1.5) — **사용자가 직접 켤 때만** 붓이 남는다.
   * 못 켜는 붓에서는 조용히 무시한다 (토글 자체를 안 만드는 것이 정본이다).
   */
  setRepeat(on: boolean): void {
    if (on && !this.canRepeat) return;
    if (this.repeatOn === on) return;
    this.repeatOn = on;
    this.host.label(this.modeLabel);
  }

  /**
   * 배치 성공 — **원자적 종료**다.
   *
   * 영수증을 먼저 내고, 그 다음에 상태를 지운다. 순서를 뒤집으면 영수증이
   * "무엇을 놓았는지"를 이미 잃은 상태에서 만들어진다.
   */
  finish(receipt: string): void {
    if (this.brushId === null) return;
    this.host.receipt(receipt);
    if (this.repeatOn && this.canRepeat) {
      // 붓·조준을 남긴다. 같은 자리를 다시 재서 라벨(값·판정)만 새로 고친다
      this.host.reaim();
      return;
    }
    this.end();
  }

  /** 확정 바의 취소 — 세션이 끝난다. 붓을 남기면 다음 탭이 다시 조준을 연다 */
  cancel(): void {
    this.end();
  }

  /** 메뉴·시트·패널·코스가 열렸다 — 화면을 뺏겼으면 세션은 끝이다 */
  abandon(): void {
    if (this.mode === 'idle') return;
    this.end();
  }

  /** 하네스의 `__kairoClearBrush` — 잔해 위에서 재지 않기 위한 뒷정리 */
  reset(): void {
    this.end();
  }

  /**
   * 유일한 종료 경계. 여기 없는 정리는 **어디에도 없다** —
   * 호출부마다 `setBrush(null)` 을 복제하면 언젠가 한쪽만 고쳐진다 (계획 §1.5).
   */
  private end(opts?: { silent: boolean }): void {
    const wasIdle = this.mode === 'idle';
    this.brushId = null;
    this.brushLabel = '';
    this.defId = '';
    this.selection = null;
    this.aimState = null;
    this.repeatOn = false;
    if (wasIdle) return; // 이미 빈 세션 — 화면을 두 번 건드리지 않는다
    if (opts?.silent !== true) this.host.label(null);
    this.host.closeAim();
  }
}
