/**
 * 견인 운항의 사고 **결정** — 에셋 워크트리의 재사용 모듈
 * (`assets/generated/watercraft-pilots/ppaji-moving-wave-v1/runtime/core/incidents.mjs`)를
 * 한 줄씩 그대로 TypeScript 로 옮겼다. 알고리즘·상수·이름은 바꾸지 않았다 —
 * 인계 문서(`docs/assets/handovers/2026-09-19-ppaji-watercraft-merge.md`)가 이 모듈을
 * 「공통 동작/사건」의 정본으로 지정한다.
 *
 * ⚠ 이 파일은 **결정만** 한다. 돈·통계·하루 상한·부상 처리는 호스트(`Game`)의 몫이다.
 * ⚠ 난수는 `Rng` 가 아니라 **시드 해시**(`stableRandom`)다 — 불변식 2 를 지키면서
 *   (Math.random 0 · Date 0) 저장·복원 뒤에도 같은 운항이 같은 결정을 내야 하기 때문이다.
 *   운항 id + 시드가 열쇠라 뽑기 순서가 다른 스트림을 밀지 않는다.
 */

export interface RideGuest {
  id: string;
  role?: string;
  canFall?: boolean;
}

/** `evaluateCourse` 의 0~100 지표 */
export interface CourseMetricsLike {
  thrill: number;
  safety: number;
}

/** `sim/accident.ts` 의 `AccidentInput` 에서 thrill·safe 를 뺀 나머지 — 호스트가 만든다 */
export interface AccidentContext {
  vest: boolean;
  guarded: boolean;
  rescued: boolean;
  briefed: boolean;
  cold: boolean;
  busy: number;
  cap: number;
}

export interface RideAccidentInput extends AccidentContext {
  /** 0..4 */
  thrill: number;
  /** 0..4 */
  safe: number;
}

/** 운항 경로의 한 점 — 낙수가 **언제** 가능한지를 정한다 */
export interface RouteSample {
  /** 출항부터의 tick */
  time: number;
  phase: string;
  /** 0..1 */
  progress: number;
  speed: number;
  peakSpeed: number;
}

export interface FallEvent {
  id: string;
  guestId: string;
  time: number;
  progress: number;
  injured: boolean;
  /** 강제(QA) 낙수가 아니다 — 손해·통계에 반영한다 */
  economic: boolean;
}

export interface Decision {
  version: 1;
  rideId: string;
  seed: number | string;
  event: FallEvent | null;
  forced: boolean;
  decided: true;
}

export interface IncidentInput {
  rideId: string;
  seed: number | string;
  guests: readonly RideGuest[];
  probabilities: Record<string, number>;
  samples: readonly RouteSample[];
  forced?: boolean;
  injuryProbability?: number;
}

export interface LedgerSnapshot {
  version: 1;
  rides: [string, Decision][];
  applied: string[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const finite = (v: number, name: string): number => {
  if (!Number.isFinite(v)) throw new TypeError(name);
  return v;
};

/** 안전도 0~100 → safe 0~4 · 스릴 0~100 → thrill 0~4. **한 곳에서만** 변환한다 (인계 §5) */
export function courseAccidentInput(result: CourseMetricsLike, context: AccidentContext): RideAccidentInput {
  return { ...context, thrill: clamp(finite(result.thrill, 'thrill') / 25, 0, 4), safe: clamp(finite(result.safety, 'safety') / 25, 0, 4) };
}

/** 속도는 `equipment.speed × boat.speedMult` **한 번만** (인계 §5) */
export function effectiveSpeed(equipment: { speed: number }, boat?: { speedMult: number } | null): number {
  const speed = finite(equipment.speed, 'speed');
  const mult = finite(boat?.speedMult ?? 1, 'speedMult');
  if (speed <= 0 || mult <= 0) throw new RangeError('Speed and multiplier must be positive');
  return speed * mult;
}

/** FNV-1a + 혼합 — 시드·열쇠에서 [0,1). 상태가 없어 저장·복원에 안전하다 */
export function stableRandom(seed: string | number, key: string): number {
  let h = 2166136261;
  for (const c of String(seed) + '\0' + key) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 낙수 가능 구간 — 주행 중 · 진행 0.35~0.70 · 최고 속도의 70% 이상. **출발 직후는 영원히 아니다** */
export function eligibleForFall({ phase, progress, speed, peakSpeed }: Omit<RouteSample, 'time'>): boolean {
  return phase === 'towing' && progress >= 0.35 && progress <= 0.7 && speed > 0 && peakSpeed > 0 && speed / peakSpeed >= 0.7;
}

export function planIncident({ rideId, seed, guests, probabilities, samples, forced = false, injuryProbability = 0 }: IncidentInput): Decision {
  if (!rideId || !Array.isArray(guests) || new Set(guests.map((g) => g.id)).size !== guests.length) throw new TypeError('unique guest IDs and rideId required');
  const eligible = samples.filter(eligibleForFall).sort((a, b) => a.time - b.time);
  const candidates = guests.filter((g) => g.canFall !== false && g.role !== 'operator').sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const passed = candidates.filter((g) => forced || stableRandom(seed, `${rideId}:roll:${g.id}`) < clamp(finite(probabilities[g.id] ?? 0, 'probability'), 0, 1));
  // 운항 한 번에 사고는 최대 하나. 옛 선착장 사고 뽑기와 **같이 돌리지 않는다**.
  const chosen = passed.sort((a, b) => stableRandom(seed, `${rideId}:pick:${a.id}`) - stableRandom(seed, `${rideId}:pick:${b.id}`))[0];
  if (!chosen || eligible.length === 0) return { version: 1, rideId, seed, event: null, forced, decided: true };
  const point = eligible[Math.floor(stableRandom(seed, `${rideId}:time`) * eligible.length)] as RouteSample;
  const injured = !forced && stableRandom(seed, `${rideId}:injury`) < clamp(finite(injuryProbability, 'injuryProbability'), 0, 1);
  return { version: 1, rideId, seed, forced, decided: true, event: { id: `${rideId}:fall:${chosen.id}`, guestId: chosen.id, time: point.time, progress: point.progress, injured, economic: !forced } };
}

/** 운항별 결정 장부 — 같은 운항은 몇 번을 물어도 같은 답, 같은 사건은 **한 번만** 소비된다 */
export class IncidentLedger {
  readonly version = 1;
  private readonly rides: Map<string, Decision>;
  private readonly applied: Set<string>;

  constructor(snapshot?: LedgerSnapshot) {
    if (snapshot && snapshot.version !== 1) throw new Error('Unsupported incident save');
    this.rides = new Map(snapshot?.rides ?? []);
    this.applied = new Set(snapshot?.applied ?? []);
  }

  decide(input: IncidentInput): Decision {
    if (!this.rides.has(input.rideId)) this.rides.set(input.rideId, planIncident(input));
    return structuredClone(this.rides.get(input.rideId) as Decision);
  }

  /** 사건을 **처음** 소비할 때만 돌려준다 — 저장·복원 뒤 재적용이 구조적으로 불가능하다 */
  consume(event: FallEvent | null): (FallEvent & { applyInjury: boolean }) | null {
    if (!event || this.applied.has(event.id)) return null;
    this.applied.add(event.id);
    return { ...event, applyInjury: event.economic && event.injured };
  }

  /** 끝난 운항의 결정을 버린다 — 장부가 판 전체에 걸쳐 무한히 자라지 않게. 소비 기록은 남긴다 */
  forget(rideId: string): void {
    this.rides.delete(rideId);
  }

  snapshot(): LedgerSnapshot {
    return { version: 1, rides: structuredClone([...this.rides]), applied: [...this.applied] };
  }
}
