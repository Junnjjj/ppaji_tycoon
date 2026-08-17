import rawGroups from '../../data/kairo-groups.json' with { type: 'json' };
import type { Rng } from '../rng.js';
import type { Season } from './week.js';

/**
 * 손님 그룹 유형 — 스펙 §10.4.
 *
 * ## 왜 일행 단위인가
 *
 * 손님을 한 명씩 넣으면 "단체 예약 40인" 같은 카드·의뢰가 **숫자로만 존재하고 화면에서는
 * 아무 일도 안 일어난다.** 일행 단위로 들어와야 무리가 몰려 다니는 게 보이고, "평상 6개가
 * 왜 필요한가"가 눈으로 설명된다.
 *
 * ## 무엇을 바꾸나
 *
 * 유형은 세 가지를 바꾼다:
 *   · **지갑** — 객단가. 친구·단체가 크게 쓴다
 *   · **인내** — 목적지를 못 찾았을 때 버티는 시간. 커플·단체는 짧다
 *   · **수요 편향(`needBias`)** — 목표 선택에서 거리에 곱한다. 1.0 미만이면 "멀어도 간다".
 *     가족은 놀이·위생을 멀어도 찾아가고, 친구는 스릴을 찾아간다.
 *
 * 그래서 **시설 구성이 손님 구성을 통해 매출로 이어진다** — 스릴만 지으면 가족이 안 오고,
 * 경관만 지으면 친구가 심심해한다. 배치가 결과를 바꾸는 축이 하나 늘어난다.
 *
 * ## 왜 데이터인가
 *
 * 불변식 3 그대로 — 유형 추가·비중 조정이 JSON 이다. 계절별 비중도 여기 있다
 * (겨울은 가족·커플 비중이 오른다).
 */

export type GroupId = 'family' | 'couple' | 'friends' | 'company';

export interface GroupDef {
  id: GroupId;
  name: string;
  /** 일행 인원 [최소, 최대] */
  size: readonly [number, number];
  /** 계절별 등장 비중. 합이 1 이어야 한다 */
  share: Record<Season, number>;
  /** 객단가 배율 */
  wallet: number;
  /** 스릴 선호 [최소, 최대] */
  thrill: readonly [number, number];
  /** 인내 배율 — 1 미만이면 빨리 지친다 */
  patience: number;
  /** 수요 종류별 거리 가중 (1.0 기준, 낮을수록 멀어도 간다) */
  needBias: Record<string, number>;
  note: string;
}

export const GROUPS: readonly GroupDef[] = (rawGroups as unknown as { groups: GroupDef[] })
  .groups;

const BY_ID = new Map<GroupId, GroupDef>(GROUPS.map((g) => [g.id, g]));

export function groupDef(id: GroupId): GroupDef {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`모르는 그룹 유형: ${id}`);
  return g;
}

/**
 * 계절 비중에 따라 유형을 하나 뽑는다.
 *
 * ⚠ **`rng` 는 손님 스트림을 그대로 쓴다** — 그룹 뽑기는 손님 생성의 일부지 별도
 * 서브시스템이 아니다. 여기를 fork 하면 손님 수가 같아도 그룹 구성이 달라져
 * "손님 하나를 더 뽑아도 다른 시퀀스가 안 밀린다"는 보장이 오히려 깨진다.
 */
export function pickGroup(
  rng: Rng,
  season: Season,
  /**
   * 맵이 바꾼 비중 (§4.5). 없으면 계절 기본값.
   *
   * 계곡형은 커플·가족, 북한강형은 친구 그룹이 많이 온다 — 그게 "맵 특성이 손님 구성까지
   * 바꾼다"는 결정이다. 시설 구성이 손님 구성을 통해 매출로 이어지므로, 맵이 다르면
   * **최적 빌드가 달라진다.**
   */
  shares?: Partial<Record<GroupId, number>>,
): GroupDef {
  let r = rng.next();
  for (const g of GROUPS) {
    r -= shares?.[g.id] ?? g.share[season];
    if (r <= 0) return g;
  }
  return GROUPS[GROUPS.length - 1] as GroupDef;
}

/** 계절 기본 비중 — 맵 배율을 곱할 원본 */
export function seasonShares(season: Season): Record<GroupId, number> {
  const out = {} as Record<GroupId, number>;
  for (const g of GROUPS) out[g.id] = g.share[season];
  return out;
}

/** 일행 인원 */
export function groupSize(rng: Rng, def: GroupDef): number {
  const [lo, hi] = def.size;
  return lo + rng.int(hi - lo + 1);
}

/** 이 유형이 그 수요를 얼마나 찾아가나 (거리에 곱한다) */
export function needWeight(def: GroupDef, need: string): number {
  return def.needBias[need] ?? 1;
}

/** 데이터 검증 — 비중 합이 어긋나면 유형 하나가 조용히 안 나온다 */
export function validateGroups(): string[] {
  const problems: string[] = [];
  const seasons: Season[] = ['summer', 'spring', 'autumn', 'winter'];
  for (const se of seasons) {
    const total = GROUPS.reduce((a, g) => a + (g.share[se] ?? 0), 0);
    if (Math.abs(total - 1) > 1e-6) {
      problems.push(`${se} 비중 합이 ${total.toFixed(4)} — 1 이어야 한다`);
    }
  }
  for (const g of GROUPS) {
    if (g.size[0] < 1 || g.size[1] < g.size[0]) problems.push(`${g.id} — 인원 범위가 이상하다`);
    if (g.thrill[0] < 0 || g.thrill[1] > 1 || g.thrill[1] < g.thrill[0]) {
      problems.push(`${g.id} — 스릴 선호 범위가 이상하다`);
    }
    if (g.wallet <= 0) problems.push(`${g.id} — 지갑 배율이 0 이하`);
    if (g.patience <= 0) problems.push(`${g.id} — 인내 배율이 0 이하`);
  }
  return problems;
}
