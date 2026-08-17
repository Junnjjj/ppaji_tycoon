import rawStaff from '../../data/kairo-staff.json' with { type: 'json' };
import { PlacementGrid, facilityDef } from './placement.js';
import type { Rng } from '../rng.js';

/**
 * 직원 — 스펙 §11. **여섯 동사 중 "사람을 쓴다"가 이것이다.**
 *
 * ## 왜 필요한가
 *
 * 인건비는 **고정비**다. 겨울에 손님이 없어도 나간다 → 인원 조절이 경영 판단이 된다.
 * 시설은 한 번 지으면 끝이지만 직원은 매주 다시 판단한다 — 그게 "한 주 진행"에 붙는
 * 또 하나의 결정이다 (카드와 같은 목적, 다른 축).
 *
 * ## 배치는 아직 없다 (의도적 축소)
 *
 * 스펙은 "반경 8타일 커버" 처럼 **공간 배치**를 말한다. 여기서는 **고용 인원만** 다룬다.
 * 이유는 둘이다:
 *   · 배치를 넣으려면 직원 스프라이트·배치 브러시·경로가 필요한데, 에셋은 이 골 밖이다
 *   · 경제적 결정("몇 명을 쓸 것인가")이 이 동사의 핵심이고, 공간 배치는 그 위의 층이다
 * 공간 층을 나중에 얹어도 이 인터페이스는 그대로 쓴다 — `coverage()` 가 비율을 주고,
 * 배치가 생기면 그 비율을 타일 거리로 계산하면 된다.
 *
 * ## 부족하면 무슨 일이 일어나나
 *
 * | 직종 | 부족하면 |
 * |---|---|
 * | 안전요원 | 사고 위험이 오른다 (`risk.ts` 의 안전 점수가 줄어든다) |
 * | 운영요원 | 그만큼 수상 시설이 **선다** — 손님이 못 간다 |
 * | 청소부 | 만족도가 내려간다 |
 * | 정비공 | 매주 일부 시설이 **고장 난다** — 그 주 동안 선다 |
 * | 매점직원 | 식음 매출이 떨어진다 |
 *
 * 전부 **비율**로 작동한다 — 0명이면 전멸이 아니라 그만큼 나빠진다. 절벽을 두면
 * "한 명 부족해서 판이 끝났다"가 되고, 그건 v4 에서 없애기로 한 종류의 실패다.
 */

export type StaffRoleId = 'lifeguard' | 'operator' | 'cleaner' | 'mechanic' | 'clerk';

export interface StaffRole {
  id: StaffRoleId;
  name: string;
  /** 주급 */
  wage: number;
  /** 대상 집합 */
  covers: 'risky' | 'water' | 'food' | 'all';
  /** 1명이 감당하는 대상 수 */
  per: number;
  effect: 'safety' | 'operate' | 'clean' | 'repair' | 'serve';
  desc: string;
  short: string;
}

interface StaffTuning {
  /** 청소부가 전무할 때 만족도 하락 */
  cleanPenaltyMax: number;
  /** 매점직원이 전무할 때 식음 매출 하락 비율 */
  servePenaltyMax: number;
  /** 정비공이 못 덮은 시설 1개당 주간 고장 확률 */
  breakdownPerUncovered: number;
  /** 안전요원 1명이 더하는 안전 점수 */
  safetyPerStaff: number;
  /** 한 번에 설 수 있는 시설의 비율 상한 — 회복 불가 나선을 막는다 */
  maxIdleRatio: number;
}

const DATA = rawStaff as unknown as { roles: StaffRole[]; tuning: StaffTuning };

export const STAFF_ROLES: readonly StaffRole[] = DATA.roles;
export const STAFF_TUNING: StaffTuning = DATA.tuning;

export type StaffCounts = Record<StaffRoleId, number>;

export const EMPTY_STAFF: StaffCounts = {
  lifeguard: 0,
  operator: 0,
  cleaner: 0,
  mechanic: 0,
  clerk: 0,
};

/** 스릴·놀이 = 안전요원이 봐야 하는 대상 */
const RISKY_NEEDS = new Set(['thrill', 'play']);

/** 그 역할이 감당해야 하는 대상 수 */
export function demandFor(role: StaffRole, placement: PlacementGrid): number {
  let n = 0;
  for (const item of placement.all()) {
    const def = facilityDef(item.defId);
    if (!def) continue;
    const need = (def as { need?: string }).need;
    if (role.covers === 'all') n += 1;
    else if (role.covers === 'risky' && need !== undefined && RISKY_NEEDS.has(need)) n += 1;
    else if (role.covers === 'water' && (def.layer === 'water' || def.ride)) n += 1;
    else if (role.covers === 'food' && need === 'food') n += 1;
  }
  return n;
}

/** 그 역할을 다 채우려면 몇 명이 필요한가 */
export function neededFor(role: StaffRole, placement: PlacementGrid): number {
  return Math.ceil(demandFor(role, placement) / role.per);
}

/** 0..1 — 1 이면 충분하다. 대상이 없으면 1 (없는 걸 못 덮었다고 벌하지 않는다) */
export function coverageOf(
  role: StaffRole,
  hired: number,
  placement: PlacementGrid,
): number {
  const need = neededFor(role, placement);
  if (need === 0) return 1;
  return Math.min(1, hired / need);
}

export interface StaffEffects {
  /** 주간 인건비 */
  wages: number;
  /** 역할별 충족도 0..1 */
  coverage: Record<StaffRoleId, number>;
  /** 안전 점수 가산 — `assessRisk` 에 넘긴다 */
  safetyPoints: number;
  /** 만족도 델타 (음수) */
  satisfactionDelta: number;
  /** 식음 매출 배율 */
  foodMult: number;
  /** 운영요원이 못 덮어 서는 수상 시설 수 */
  idleWater: number;
  /** 정비공이 못 덮은 시설 수 — 고장 판정의 기반 */
  unmaintained: number;
}

/**
 * 고용 인원을 소유한다. **지갑은 안 갖는다** — 인건비는 계산해서 돌려주고,
 * 실제 차감은 러너가 한다 (카드와 같은 규칙: 돈의 주인은 하나여야 한다).
 */
export class StaffStore {
  private counts: StaffCounts = { ...EMPTY_STAFF };

  get all(): StaffCounts {
    return { ...this.counts };
  }

  count(role: StaffRoleId): number {
    return this.counts[role];
  }

  /** 고용·해고. 음수로 내려가지 않는다 */
  set(role: StaffRoleId, n: number): void {
    this.counts[role] = Math.max(0, Math.floor(n));
  }

  hire(role: StaffRoleId, delta = 1): void {
    this.set(role, this.counts[role] + delta);
  }

  get total(): number {
    return STAFF_ROLES.reduce((a, r) => a + this.counts[r.id], 0);
  }

  weeklyWage(): number {
    return STAFF_ROLES.reduce((a, r) => a + this.counts[r.id] * r.wage, 0);
  }

  /** 이번 주 효과. 전부 **비율**이라 한 명 부족이 절벽이 되지 않는다 */
  effects(placement: PlacementGrid): StaffEffects {
    const coverage = {} as Record<StaffRoleId, number>;
    for (const r of STAFF_ROLES) coverage[r.id] = coverageOf(r, this.counts[r.id], placement);

    const lifeguard = STAFF_ROLES.find((r) => r.effect === 'safety') as StaffRole;
    const operator = STAFF_ROLES.find((r) => r.effect === 'operate') as StaffRole;
    const mechanic = STAFF_ROLES.find((r) => r.effect === 'repair') as StaffRole;

    const waterDemand = demandFor(operator, placement);
    const covered = Math.min(waterDemand, this.counts.operator * operator.per);
    const maintained = Math.min(
      demandFor(mechanic, placement),
      this.counts.mechanic * mechanic.per,
    );

    return {
      wages: this.weeklyWage(),
      coverage,
      safetyPoints: this.counts[lifeguard.id] * STAFF_TUNING.safetyPerStaff,
      // `|| 0` 은 −0 을 0 으로 만든다 — 스냅샷 왕복·비교에서 −0 은 성가시기만 하다
      satisfactionDelta: -Math.round((1 - coverage.cleaner) * STAFF_TUNING.cleanPenaltyMax) || 0,
      foodMult: 1 - (1 - coverage.clerk) * STAFF_TUNING.servePenaltyMax,
      idleWater: Math.max(0, waterDemand - covered),
      unmaintained: Math.max(0, demandFor(mechanic, placement) - maintained),
    };
  }

  /**
   * 이번 주에 서는 시설 handle 들.
   *
   * 운영요원이 모자라면 **수상 시설부터** 선다 (가장 손이 많이 가는 쪽이라는 설정).
   * 정비공이 모자라면 남은 시설 중 일부가 고장 난다 — 확률이지만 **덮은 만큼은 안전하다**
   * (순수 확률이면 "정비공을 왜 쓰나"가 된다).
   *
   * ⚠ `rng` 는 전용 스트림이어야 한다. 손님·날씨와 섞으면 시설 하나를 더 짓는 것만으로
   * 날씨가 밀린다 (불변식 2).
   */
  idleHandles(placement: PlacementGrid, rng: Rng): Set<number> {
    const out = new Set<number>();
    const eff = this.effects(placement);

    /*
     * ⚠ **한 번에 설 수 있는 시설에 상한이 있다.**
     *
     * 상한이 없으면 돈이 마른 판에서 운영요원 0 → 수상 시설 전멸, 정비공 0 → 고장 다발로
     * 손님이 갈 곳을 잃고 만족도가 0 이 된다. 그러면 매출이 0 이라 직원을 다시 쓸 수도
     * 없어 **돌아올 길이 없다** (312주 실측: 12판 중 7판이 현금 16만~160만 · 직원 1.7~6.9명
     * · 만족도 0 · 만석 100% 로 끝났다).
     *
     * 이 파일 머리말에 "부족은 절벽이 아니라 비율"이라고 적어놓고 **합계에는 상한이
     * 없었다** — 개별 효과는 비율인데 합치면 전멸이었다.
     */
    const cap = Math.max(1, Math.floor(placement.count * STAFF_TUNING.maxIdleRatio));


    // 운영요원 부족 — 수상·라이드 시설이 선다. handle 순으로 결정론적으로 고른다
    if (eff.idleWater > 0) {
      const water = placement
        .all()
        .filter((it) => {
          const def = facilityDef(it.defId);
          return !!def && (def.layer === 'water' || !!def.ride);
        })
        .sort((a, b) => a.handle - b.handle);
      for (let k = 0; k < eff.idleWater && k < water.length && out.size < cap; k++) {
        out.add((water[k] as { handle: number }).handle);
      }
    }

    // 정비공 부족 — 못 덮은 수만큼 고장 확률을 굴린다
    if (eff.unmaintained > 0 && out.size < cap) {
      const rest = placement
        .all()
        .filter((it) => !out.has(it.handle))
        .sort((a, b) => a.handle - b.handle);
      for (let k = 0; k < eff.unmaintained && k < rest.length && out.size < cap; k++) {
        if (rng.next() < STAFF_TUNING.breakdownPerUncovered) {
          out.add((rest[k] as { handle: number }).handle);
        }
      }
    }
    return out;
  }

  toSnapshot(): StaffCounts {
    return { ...this.counts };
  }

  static fromSnapshot(s: Partial<StaffCounts>): StaffStore {
    const st = new StaffStore();
    for (const r of STAFF_ROLES) st.set(r.id, s[r.id] ?? 0);
    return st;
  }
}

/** 데이터 검증 */
export function validateStaff(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const effects = new Set<string>();
  for (const r of STAFF_ROLES) {
    if (ids.has(r.id)) problems.push(`중복 ID: ${r.id}`);
    ids.add(r.id);
    if (effects.has(r.effect)) problems.push(`${r.id} — 효과 ${r.effect} 가 중복이다`);
    effects.add(r.effect);
    if (r.wage <= 0) problems.push(`${r.id} — 주급이 0 이하`);
    if (r.per <= 0) problems.push(`${r.id} — 담당 수가 0 이하`);
  }
  if (STAFF_ROLES.length !== 5) problems.push(`직종이 5개가 아니다: ${STAFF_ROLES.length}`);
  const t = STAFF_TUNING;
  if (t.servePenaltyMax < 0 || t.servePenaltyMax >= 1) {
    problems.push('식음 하락 비율이 0~1 밖이다 — 1 이상이면 매출이 음수가 된다');
  }
  if (t.breakdownPerUncovered < 0 || t.breakdownPerUncovered > 1) {
    problems.push('고장 확률이 0~1 밖이다');
  }
  if (t.maxIdleRatio <= 0 || t.maxIdleRatio >= 1) {
    problems.push('설 수 있는 비율 상한이 0~1 밖이다 — 1 이면 전멸이 가능해진다');
  }
  return problems;
}
