import { KairoTerrain } from './terrain.js';

/**
 * 정류장에 서는 버스 (K36-B③).
 *
 * ## 왜 sim 이 위치를 갖나
 *
 * 버스는 장식이 아니라 **손님이 오는 이유**다. K36-A 가 공원 위에 도시 띠를 깔면서
 * "밖에서 안으로 들어온다"를 지형으로 만들어 뒀는데, 정작 무엇을 타고 오는지는 없었다.
 * 손님이 허공에서 솟으면 정류장은 그냥 회색 칸이다.
 *
 * 그래서 버스 위치는 **렌더 애니메이션이 아니라 시뮬 상태**다. 렌더가 프레임마다 자기
 * 시계로 굴리면 스폰 시점과 화면이 갈라져서, 버스가 떠난 뒤에 손님이 나타난다.
 *
 * ⚠ **여기서 손님을 만들지 않는다.** 이 파일은 "지금 태울 수 있나"만 답한다 —
 * 스폰 배선은 주 루프가 한다. 버스가 `GuestStore` 를 알면 헤드리스 밸런싱에서
 * 버스를 빼고 손님만 재는 실험이 불가능해진다.
 *
 * ## 왜 RNG 를 안 쓰나
 *
 * 쓸 수도 있었지만 **안 썼다.** 버스는 시간표대로 다닌다.
 *
 * 유입 리듬이 RNG 로 흔들리면 결산에서 "이 주가 왜 나빴나"의 답이 하나 늘어난다 —
 * 설계가 날씨를 배수에서 수요 구성 변화로 바꾼 이유(⟪RNG 세금⟫)와 같은 문제다.
 * 시간표가 고정이면 상태가 tick 하나(`t`)뿐이라 결정론이 **구조적으로** 보장되고,
 * 세이브도 정수 하나로 끝난다.
 *
 * 나중에 흔들고 싶어지면 주기를 `BusConfig` 로 주입받는 자리가 이미 있다 —
 * 부르는 쪽이 시드 RNG 로 뽑아 넣으면 된다. 이 파일이 RNG 를 갖는 것과는 다르다.
 */

/** 한 주기 안의 구간 */
export type BusPhase =
  /** 왼쪽 밖에서 정류장으로 다가온다 */
  | 'approach'
  /** 정류장에 서 있다 — 손님이 내리는 구간 */
  | 'stopped'
  /** 정류장에서 오른쪽 밖으로 나간다 */
  | 'depart'
  /** 화면에 버스가 없다 */
  | 'away';

export interface BusConfig {
  /** 한 대가 도는 총 tick. 하루(120tick)의 약수여야 시간표가 매일 같다 */
  period: number;
  approach: number;
  dwell: number;
  depart: number;
  /** 차도 위 몇 칸을 달려 들어오고 나가는가 */
  runTiles: number;
  /** 정류장 칸의 i */
  stopI: number;
  /** 버스가 타는 차선 줄 */
  lane: number;
}

/**
 * 기본 시간표 — 숫자마다 이유가 있다.
 *
 * - **주기 40**: 하루가 120tick(10Hz 고정 timestep, 하루 12초)이라 40 은 약수다.
 *   약수가 아니면 버스 도착이 날마다 밀려서 요일 막대를 볼 때 "토요일이 좋았다"인지
 *   "토요일에 버스가 한 대 더 왔다"인지 구분이 안 된다. 하루 **3대**.
 * - **접근 12 · 정차 8 · 퇴장 12 · 없음 8**: 정차 0.8초는 "지나갔다"가 아니라 "섰다"로
 *   읽히는 최소치다. 더 길면 시간표가 아니라 주차로 보인다.
 * - **없음 8**: 퇴장 끝(정류장 +16칸)에서 접근 시작(−16칸)으로 되돌 때 좌표가 튄다.
 *   그 순간을 화면 밖이 아니라 **버스가 없는 구간**으로 덮는다. 화면 밖으로 충분히
 *   멀리 보내는 방법도 있지만, 그러면 속도를 올려야 해서 버스가 총알이 된다.
 * - **주행 16칸**: 격자 한 걸음의 가로 이동이 16px 이고 폰 화면이 393px 이니 반 폭이
 *   약 12칸이다. 16칸이면 정류장이 화면 한가운데 있어도 양 끝이 화면 밖이다.
 */
export const BUS_DEFAULT: BusConfig = {
  period: 40,
  approach: 12,
  dwell: 8,
  depart: 12,
  runTiles: 16,
  stopI: KairoTerrain.busStop().i,
  /*
   * 차도는 두 줄(`ROAD_ROWS`)이다. 버스는 **정류장에 붙은 아래 차선**을 탄다 —
   * 위 차선은 반대 방향이라, 거기 세우면 손님이 차도를 가로질러 내리는 그림이 된다.
   */
  lane: KairoTerrain.ROAD_ROWS[KairoTerrain.ROAD_ROWS.length - 1] as number,
};

export interface BusState {
  phase: BusPhase;
  /** 지금 정류장에 서 있는가 */
  atStop: boolean;
  /** 격자 좌표. x 는 차선 위를 달리므로 소수, y 는 차선 줄(정수) */
  pos: { x: number; y: number };
  /** 화면에 버스가 있는가 — `false` 면 렌더는 스프라이트를 숨긴다 */
  visible: boolean;
  /** **이번 tick 에 막 섰다.** 손님을 내리는 신호는 이 한 tick 짜리 모서리다 */
  arrived: boolean;
  /** 이번 tick 에 막 출발했다 */
  departed: boolean;
}

export interface BusSnapshot {
  /** 흘러간 tick. 상태가 이것뿐이라 결정론이 구조적으로 보장된다 */
  t: number;
}

/**
 * tick 하나에서 상태를 **계산한다** — 누적하지 않는다.
 *
 * 상태를 프레임마다 갱신하면 "같은 tick 수면 같은 위치"가 갱신 순서에 걸린다.
 * 순수 함수면 그 질문이 애초에 생기지 않고, 코디네이터가 미래 tick 을 미리 물어볼 수도 있다.
 */
export function busStateAt(t: number, cfg: BusConfig = BUS_DEFAULT): BusState {
  const period = Math.max(1, cfg.period);
  // 음수 tick 도 감는다 — 되감기 UI 가 생겨도 조용히 NaN 이 되지 않게
  const c = ((t % period) + period) % period;
  const a = cfg.approach;
  const d = a + cfg.dwell;
  const p = d + cfg.depart;
  const { stopI, lane, runTiles } = cfg;

  let phase: BusPhase;
  let x: number;
  if (c < a) {
    phase = 'approach';
    // 왼쪽 runTiles 칸 밖에서 정류장까지 등속. c=a 에서 정확히 정류장에 닿는다
    x = stopI - runTiles * (1 - c / Math.max(1, a));
  } else if (c < d) {
    phase = 'stopped';
    x = stopI;
  } else if (c < p) {
    phase = 'depart';
    x = stopI + runTiles * ((c - d) / Math.max(1, cfg.depart));
  } else {
    phase = 'away';
    // 없는 버스도 좌표는 준다 — 렌더가 `visible` 을 안 봐도 화면 밖에 있다
    x = stopI - runTiles;
  }

  return {
    phase,
    atStop: phase === 'stopped',
    pos: { x, y: lane },
    visible: phase !== 'away',
    arrived: c === a && cfg.dwell > 0,
    departed: c === d && cfg.depart > 0,
  };
}

export class BusRunner {
  private t = 0;
  readonly cfg: BusConfig;

  constructor(cfg: Partial<BusConfig> = {}) {
    this.cfg = { ...BUS_DEFAULT, ...cfg };
  }

  /** 흘러간 tick */
  get elapsed(): number {
    return this.t;
  }

  /** 한 tick 진행. 상태는 `t` 에서 계산되므로 여기서 하는 일은 이것뿐이다 */
  tick(): void {
    this.t++;
  }

  get state(): BusState {
    return busStateAt(this.t, this.cfg);
  }

  get phase(): BusPhase {
    return this.state.phase;
  }

  get atStop(): boolean {
    return this.state.atStop;
  }

  get pos(): { x: number; y: number } {
    return this.state.pos;
  }

  get visible(): boolean {
    return this.state.visible;
  }

  /** 이번 tick 에 막 섰다 — 주 루프는 이 모서리에서 한 차 분을 태워 내린다 */
  get arrived(): boolean {
    return this.state.arrived;
  }

  get departed(): boolean {
    return this.state.departed;
  }

  /** 다음 도착까지 남은 tick. 0 이면 지금이 도착 tick 이다 */
  get ticksToArrival(): number {
    const period = Math.max(1, this.cfg.period);
    const c = ((this.t % period) + period) % period;
    return c <= this.cfg.approach
      ? this.cfg.approach - c
      : period - c + this.cfg.approach;
  }

  /** `[t0, t1)` 사이의 도착 tick 들 — 헤드리스가 유입 리듬을 미리 짤 때 쓴다 */
  arrivalsIn(t0: number, t1: number): number[] {
    const out: number[] = [];
    for (let t = t0; t < t1; t++) if (busStateAt(t, this.cfg).arrived) out.push(t);
    return out;
  }

  toSnapshot(): BusSnapshot {
    return { t: this.t };
  }

  /**
   * 복원. 설정은 스냅샷에 **안 담는다** — 시간표는 밸런싱이 바꾸는 값이라
   * 세이브에 굳으면 옛 판만 옛 시간표로 돈다.
   */
  static fromSnapshot(s: BusSnapshot | undefined, cfg: Partial<BusConfig> = {}): BusRunner {
    const b = new BusRunner(cfg);
    const t = s?.t;
    b.t = Number.isFinite(t) ? Math.max(0, Math.floor(t as number)) : 0;
    return b;
  }
}
