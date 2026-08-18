import rawMaps from '../../data/kairo-maps.json' with { type: 'json' };
import rawScenarios from '../../data/kairo-scenarios.json' with { type: 'json' };
import type { GroupId } from './groups.js';

/**
 * 맵 타입 · 시나리오 — 스펙 §4.5. **2회차를 하는 이유.**
 *
 * ## 왜 맵만으로는 부족한가
 *
 * "시드 기반 생성, 구획마다 강폭이 다름" 정도면 **최적 빌드가 비슷해서** 두 번째 판을 할
 * 이유가 없다. 그래서 맵은 지형뿐 아니라 **손님 구성**과 **코스 스릴 상한**까지 바꾸고,
 * 그 위에 **목표를 바꾸는 시나리오**를 얹는다.
 *
 * ## 실패는 조건이 명시된 것만
 *
 * 시나리오의 실패는 "주 수 초과"와 "사고 발생" 둘뿐이다. 숨은 실패 조건을 두면 플레이어가
 * 왜 졌는지 모르고, 그건 v4 가 없애기로 한 종류의 실패다.
 */

export interface MapType {
  id: string;
  name: string;
  desc: string;
  /** 격자 세로 중 육지 비율 — 낮을수록 물이 넓다 */
  landRatio: number;
  /** 물가 선의 흔들림 (타일) */
  shoreJitter: number;
  /** 손님 유형 비중 배율 — 곱한 뒤 정규화한다 */
  groupShift: Partial<Record<GroupId, number>>;
  /** 코스 스릴 배율 — 호수형은 물살이 없어 낮다 */
  courseThrillMult: number;
  /** 경관이 주는 만족도 가산 */
  sceneryBonus: number;
  strong: string;
  weak: string;
  /**
   * 물려받은 빠지 (K30) — 새 판에 미리 놓이는 것. 맵마다 다르다.
   *
   * 같은 배치를 세 맵에 쓰면 안 맞는다 — 북한강형은 육지가 좁고(0.34) 계곡형은
   * 넓다(0.7). 넓은 수역이 없는 계곡형에 코스를 주면 맵 설명과 게임이 어긋난다.
   */
  start: MapStart;
}

export interface MapStart {
  /** 포장한 마당 [가로, 세로] */
  yard: readonly [number, number];
  /** 실내동 [가로, 세로] — **비워서** 준다 (화장실을 어디 둘지는 플레이어 결정) */
  indoor: readonly [number, number];
  /** 물 위 플로팅덱 칸 수 */
  deck: number;
  /** 코스를 하나 물려주나 */
  course: boolean;
}

export type GoalKind = 'none' | 'gradeByWeek';

export interface ScenarioDef {
  id: string;
  name: string;
  desc: string;
  startCash: number;
  /** 이 시나리오가 열리는 등급 */
  grade: number;
  /** 수면 허가 시작값 (없으면 기본) */
  permitStart?: number;
  /** 사고가 한 번이라도 나면 실패 */
  failOnAccident?: boolean;
  goal: { kind: GoalKind; grade?: number; week?: number };
}

export const MAP_TYPES: readonly MapType[] = (rawMaps as unknown as { maps: MapType[] }).maps;
export const SCENARIOS: readonly ScenarioDef[] = (
  rawScenarios as unknown as { scenarios: ScenarioDef[] }
).scenarios;

const MAP_BY_ID = new Map(MAP_TYPES.map((m) => [m.id, m]));
const SCEN_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));

export const DEFAULT_MAP = 'bukhan';
export const DEFAULT_SCENARIO = 'inherited';

export function mapType(id: string): MapType {
  return MAP_BY_ID.get(id) ?? (MAP_BY_ID.get(DEFAULT_MAP) as MapType);
}

export function scenarioDef(id: string): ScenarioDef {
  return SCEN_BY_ID.get(id) ?? (SCEN_BY_ID.get(DEFAULT_SCENARIO) as ScenarioDef);
}

/** 그 등급에서 고를 수 있는 시나리오 */
export function unlockedScenarios(grade: number): ScenarioDef[] {
  return SCENARIOS.filter((s) => s.grade <= grade);
}

export type ScenarioStatus = 'playing' | 'won' | 'lost';

export interface ScenarioState {
  week: number;
  grade: number;
  accidents: number;
}

/**
 * 시나리오 판정.
 *
 * ⚠ **달성이 먼저다.** 목표 등급에 닿았으면 마감 주에 도달했어도 승리다 — 같은 주에
 * 둘 다 성립할 때 패배를 먼저 보면 "이겼는데 졌다"가 된다.
 */
export function scenarioStatus(def: ScenarioDef, s: ScenarioState): ScenarioStatus {
  if (def.failOnAccident && s.accidents > 0) return 'lost';
  if (def.goal.kind === 'none') return 'playing';
  const needGrade = def.goal.grade ?? 5;
  if (s.grade >= needGrade) return 'won';
  if (def.goal.week !== undefined && s.week >= def.goal.week) return 'lost';
  return 'playing';
}

/** 사람이 읽는 진행 상황 — "얼마나 남았나"가 보여야 목표가 목표다 */
export function scenarioProgress(def: ScenarioDef, s: ScenarioState): string {
  if (def.goal.kind === 'none') return '자유 플레이';
  const needGrade = def.goal.grade ?? 5;
  const left = (def.goal.week ?? 0) - s.week;
  const acc = def.failOnAccident ? ` · 사고 ${s.accidents}회(1회면 실패)` : '';
  return `${needGrade}등급까지 (현재 ${s.grade}) · ${left}주 남음${acc}`;
}

/**
 * 맵이 바꾼 손님 유형 비중. 합이 1 이 되도록 다시 정규화한다 —
 * 정규화를 잊으면 맵마다 손님 총량이 달라져 "맵 특성"이 아니라 난이도 조절이 된다.
 */
export function shiftedShares(
  base: Record<GroupId, number>,
  map: MapType,
): Record<GroupId, number> {
  const out = {} as Record<GroupId, number>;
  let total = 0;
  for (const k of Object.keys(base) as GroupId[]) {
    const v = base[k] * (map.groupShift[k] ?? 1);
    out[k] = v;
    total += v;
  }
  if (total <= 0) return { ...base };
  for (const k of Object.keys(out) as GroupId[]) out[k] /= total;
  return out;
}

/** 데이터 검증 */
export function validateScenarioData(): string[] {
  const problems: string[] = [];
  if (MAP_TYPES.length !== 3) problems.push(`맵이 3종이 아니다: ${MAP_TYPES.length}`);
  if (SCENARIOS.length !== 6) problems.push(`시나리오가 6종이 아니다: ${SCENARIOS.length}`);
  for (const m of MAP_TYPES) {
    if (m.landRatio <= 0.1 || m.landRatio >= 0.9) {
      problems.push(`${m.id} — 육지 비율이 극단적이다 (${m.landRatio})`);
    }
    if (m.courseThrillMult <= 0) problems.push(`${m.id} — 스릴 배율이 0 이하`);

    /*
     * 시작 배치 (K30). 실내동이 없으면 **위생 시설 9종을 하나도 못 놓는다** —
     * 첫 의뢰가 "기본 위생 3개"인데 뚫을 방법이 화면에 안 보인다. 그게 이 데이터의 이유다.
     */
    const st = m.start;
    if (!st) {
      problems.push(`${m.id} — 시작 배치가 없다`);
      continue;
    }
    if (st.indoor[0] < 2 || st.indoor[1] < 2) {
      problems.push(`${m.id} — 실내동이 너무 작다 (${st.indoor.join('×')})`);
    }
    if (st.yard[0] < st.indoor[0] + 2 || st.yard[1] < st.indoor[1] + 2) {
      problems.push(`${m.id} — 마당이 실내동을 못 담는다`);
    }
    if (st.deck < 0) problems.push(`${m.id} — 데크 수가 음수`);
  }

  // 맵마다 시작 배치가 실제로 달라야 한다 — 같으면 "맵마다"가 이름표다
  const startSigs = MAP_TYPES.map((m) => JSON.stringify(m.start));
  if (new Set(startSigs).size !== MAP_TYPES.length) {
    problems.push('맵의 시작 배치가 서로 같다');
  }
  // 맵마다 손님 구성이 실제로 달라야 한다 — 같으면 "맵 특성"이 이름표다
  const sigs = MAP_TYPES.map((m) => JSON.stringify(m.groupShift));
  if (new Set(sigs).size !== MAP_TYPES.length) problems.push('맵의 손님 구성이 서로 같다');
  for (const s of SCENARIOS) {
    if (s.startCash <= 0) problems.push(`${s.id} — 시작 자금이 0 이하`);
    if (s.goal.kind === 'gradeByWeek' && (!s.goal.grade || !s.goal.week)) {
      problems.push(`${s.id} — 목표에 등급이나 주 수가 없다`);
    }
  }
  if (!SCENARIOS.some((s) => s.grade <= 1)) problems.push('처음부터 할 수 있는 시나리오가 없다');
  return problems;
}
