import { KairoTerrain, type TerrainSnapshot } from '../sim/kairo/terrain.js';
import { WallGrid, type WallSnapshot } from '../sim/kairo/walls.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';
import { BuildingStore, type BuildingSnapshot } from '../sim/kairo/building.js';
import { ProgressStore, type ProgressSnapshot } from '../sim/kairo/progress.js';
import type { WeekSnapshot, WeekSummary, Season } from '../sim/kairo/week.js';
import type { CardSnapshot } from '../sim/kairo/cards.js';
import type { StaffCounts } from '../sim/kairo/staff.js';
import type { CourseSnapshot } from '../sim/kairo/course.js';

/**
 * 카이로 세이브 — v1 세이브와 **완전히 분리**한다.
 *
 * ## 왜 별도인가
 *
 * v1 세이브(`src/save/index.ts`)는 자유 배치·실시간 시뮬의 `GameSnapshot` 을 담는다.
 * 카이로는 격자·주 단위라 담을 것이 겹치지 않는다. 한 포맷에 유니온으로 섞으면
 * 마이그레이션 체인이 두 갈래로 갈라져 "이 세이브가 어느 게임인지"를 매번 물어야 한다.
 * 저장 키도 다르므로 서로를 덮어쓰지 않는다.
 *
 * ## 손님은 저장하지 않는다
 *
 * 손님은 한 주 안에서만 사는 개체다. 새로 켰을 때 지난주 손님이 그 자리에 서 있으면
 * 오히려 이상하다. 주를 돌리면 다시 들어온다.
 *
 * ## 히트맵·재생 프레임도 저장하지 않는다
 *
 * `WeekReport` 전체는 타일 1,280칸 히트맵과 tick 단위 재생 프레임을 들고 있어
 * localStorage 한도를 넘긴다. 의뢰 판정과 등급이 읽는 **요약 4필드**만 남긴다
 * (`WeekSummary`) — 그래서 복원 후에도 의뢰 진행도와 등급이 그대로 보인다.
 */

export const KAIRO_SAVE_VERSION = 2;
export const KAIRO_SAVE_KEY = 'ppaji.kairo.save.v1';

export interface KairoSaveV2 {
  version: 2;
  savedAtMs: number;
  seed: number;
  gate: { i: number; j: number };
  terrain: TerrainSnapshot;
  walls: WallSnapshot;
  /**
   * 건물 영역 (K25). 벽은 여기서 **파생**되지만 벽 스냅샷도 같이 담는다 —
   * 불러올 때 다시 굽지 않아도 되고, 지형이 미묘하게 달라져 재굽기가 실패하는
   * 경우에도 옛 화면이 그대로 복원된다.
   */
  buildings?: BuildingSnapshot;
  placement: PlacementSnapshot;
  progress: ProgressSnapshot;
  week: WeekSnapshot;
  /** 주 진행에 쓰는 RNG 상태 — 이걸 저장해야 같은 세이브가 같은 다음 주를 낸다 */
  weekRngState: number;
  season: Season;
  /** 지난주 요약. 없으면 아직 한 주도 안 돌렸다 */
  lastSummary: WeekSummary | null;
  /**
   * 카드 상태 — 적용 중인 지속 효과와 이미 본 카드.
   *
   * ⚠ 이걸 저장하지 않으면 새로 켰을 때 **적용 중이던 카드 효과가 사라지고** 방금 본
   * 카드가 다시 나온다. "3주간 만족 −8" 을 감수하고 고른 선택이 재부팅으로 지워지면
   * 선택에 무게가 없어진다.
   */
  cards?: CardSnapshot;
  cardRngState?: number;
  /**
   * 고용 인원. 인건비는 고정비라 **다시 켰을 때 그대로여야** 한다 — 저장 안 하면
   * 새로고침이 곧 전원 해고가 되고, 그 주 결산이 이유 없이 좋아진다.
   */
  staff?: Partial<StaffCounts>;
  staffRngState?: number;
  /** 놓인 코스 — 장비값을 치르고 그린 것이라 안 저장하면 새로고침이 곧 전부 철거다 */
  courses?: CourseSnapshot;
  /**
   * 발견한 콤보 — **누적**이라 저장해야 한다. 시설을 지웠다고 도감이 줄면 그건 발견이
   * 아니라 현황판이다.
   */
  discovered?: string[];
  /** 리조트 이름 — 감상 화면에서 바꾼다. 내 리조트라는 감각의 절반은 이름이다 */
  resortName?: string;
  /** 요금 배율 (§15.9) — 안 저장하면 새로고침이 곧 정가 복귀다 */
  priceMult?: number;
  /**
   * 사고로 닫힌 시설과 남은 주 (§12.1). 저장 안 하면 새로고침이 곧 사면이 된다.
   */
  accidentIdle?: [number, number][];
  /**
   * 맵 타입과 시나리오 (§4.5). **안 저장하면 새로고침이 곧 기본 맵으로 되돌아간다** —
   * 계곡형으로 시작한 판이 북한강형이 되면 손님 구성이 통째로 바뀐다.
   */
  mapId?: string;
  scenarioId?: string;
  /** 누적 사고 수 — "사고 없이" 시나리오의 판정 근거 */
  /**
   * 평판(이동평균)과 지금 등급 (§9.2).
   *
   * ⚠ 이걸 저장하지 않으면 **새로고침이 곧 등급 재심사**가 된다 — 이동평균 기억이 사라져
   * 지난주 값 하나로 등급이 다시 정해지고, 이력도 초기화돼 등급이 뚝 떨어질 수 있다.
   */
  reputation?: number;
  gradeNo?: number;
  accidentCount?: number;
}

export type AnyKairoSave = KairoSaveV2;
export type LatestKairoSave = KairoSaveV2;

/**
 * v(n) → v(n+1) 변환기. 새 버전마다 한 칸 추가한다.
 * Phase 0 의 교훈 그대로 — 나중에 붙이려 하면 이미 나간 세이브가 전부 깨진다.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {
  /*
   * v1 → v2 (K25): 벽이 **칸에서 경계로** 옮겨갔다.
   *
   * 옛 벽 배열은 "이 칸이 벽이다"라 새 모델로 옮길 방법이 없다 — 한 칸을 네 경계로
   * 펴면 통행이 통째로 막히고, 두 경계만 고르면 어느 쪽인지 알 길이 없다. 그래서
   * **버린다.** 대신 건물 영역을 빈 채로 넣어 플레이어가 다시 그리게 한다. 벽이
   * 사라지면 벽부착 시설이 잠깐 떠 있게 되지만 배치는 유지되고 게임은 계속 돈다.
   */
  1: (s) => {
    const old = (s['walls'] ?? {}) as { w?: number; h?: number };
    return {
      ...s,
      version: 2,
      walls: { w: old.w ?? 40, h: old.h ?? 32, ei: [], ej: [] },
      buildings: { items: [], next: 1 },
    };
  },
};

export class KairoSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KairoSaveError';
  }
}

export interface KairoSaveInput {
  seed: number;
  gate: { i: number; j: number };
  terrain: KairoTerrain;
  walls: WallGrid;
  buildings?: BuildingStore;
  placement: PlacementGrid;
  progress: ProgressStore;
  week: WeekSnapshot;
  weekRngState: number;
  season: Season;
  lastSummary: WeekSummary | null;
  cards?: CardSnapshot;
  cardRngState?: number;
  staff?: StaffCounts;
  staffRngState?: number;
  courses?: CourseSnapshot;
  discovered?: string[];
  resortName?: string;
  priceMult?: number;
  accidentIdle?: [number, number][];
  mapId?: string;
  scenarioId?: string;
  accidentCount?: number;
  reputation?: number;
  gradeNo?: number;
}

export function packKairo(input: KairoSaveInput, nowMs: number): LatestKairoSave {
  return {
    version: KAIRO_SAVE_VERSION,
    savedAtMs: nowMs,
    seed: input.seed,
    gate: { i: input.gate.i, j: input.gate.j },
    terrain: input.terrain.toSnapshot(),
    walls: input.walls.toSnapshot(),
    ...(input.buildings ? { buildings: input.buildings.toSnapshot() } : {}),
    placement: input.placement.toSnapshot(),
    progress: input.progress.toSnapshot(),
    week: input.week,
    weekRngState: input.weekRngState,
    season: input.season,
    lastSummary: input.lastSummary,
    ...(input.cards ? { cards: input.cards } : {}),
    ...(input.cardRngState !== undefined ? { cardRngState: input.cardRngState } : {}),
    ...(input.staff ? { staff: input.staff } : {}),
    ...(input.staffRngState !== undefined ? { staffRngState: input.staffRngState } : {}),
    ...(input.courses ? { courses: input.courses } : {}),
    ...(input.discovered ? { discovered: input.discovered } : {}),
    ...(input.resortName ? { resortName: input.resortName } : {}),
    ...(input.priceMult !== undefined ? { priceMult: input.priceMult } : {}),
    ...(input.accidentIdle ? { accidentIdle: input.accidentIdle } : {}),
    ...(input.mapId ? { mapId: input.mapId } : {}),
    ...(input.scenarioId ? { scenarioId: input.scenarioId } : {}),
    ...(input.accidentCount !== undefined ? { accidentCount: input.accidentCount } : {}),
    ...(input.reputation !== undefined ? { reputation: input.reputation } : {}),
    ...(input.gradeNo !== undefined ? { gradeNo: input.gradeNo } : {}),
  };
}

/** 저장된 값을 검증·마이그레이션해서 최신 포맷으로 만든다 */
export function migrateKairo(raw: unknown): LatestKairoSave {
  if (typeof raw !== 'object' || raw === null) {
    throw new KairoSaveError('세이브가 객체가 아닙니다');
  }
  let cur = raw as Record<string, unknown>;
  const version = cur['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new KairoSaveError(`세이브 버전이 올바르지 않습니다: ${String(version)}`);
  }
  if (version > KAIRO_SAVE_VERSION) {
    throw new KairoSaveError(
      `세이브가 더 새로운 버전입니다 (${version} > ${KAIRO_SAVE_VERSION}) — 앱을 업데이트하세요`,
    );
  }
  for (let v = version; v < KAIRO_SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new KairoSaveError(`v${v} → v${v + 1} 마이그레이션이 없습니다`);
    cur = step(cur);
  }
  for (const key of ['terrain', 'walls', 'placement', 'progress', 'week'] as const) {
    if (typeof cur[key] !== 'object' || cur[key] === null) {
      throw new KairoSaveError(`세이브에 ${key} 가 없습니다`);
    }
  }
  return cur as unknown as LatestKairoSave;
}

export interface KairoRestored {
  seed: number;
  gate: { i: number; j: number };
  terrain: KairoTerrain;
  walls: WallGrid;
  buildings: BuildingStore;
  placement: PlacementGrid;
  progress: ProgressStore;
  week: WeekSnapshot;
  weekRngState: number;
  season: Season;
  lastSummary: WeekSummary | null;
  cards?: CardSnapshot;
  /** 없으면(구 세이브) 호출자가 새 스트림을 만든다 */
  cardRngState: number;
  staff?: Partial<StaffCounts>;
  staffRngState: number;
  courses?: CourseSnapshot;
  discovered?: string[];
  resortName?: string;
  priceMult?: number;
  accidentIdle?: [number, number][];
  mapId?: string;
  scenarioId?: string;
  accidentCount?: number;
  reputation?: number;
  gradeNo?: number;
}

export function restoreKairo(raw: unknown): KairoRestored {
  const s = migrateKairo(raw);
  return {
    seed: s.seed,
    gate: s.gate,
    terrain: KairoTerrain.fromSnapshot(s.terrain),
    walls: WallGrid.fromSnapshot(s.walls),
    buildings: BuildingStore.fromSnapshot(s.buildings ?? { items: [], next: 1 }),
    placement: PlacementGrid.fromSnapshot(s.placement),
    progress: ProgressStore.fromSnapshot(s.progress),
    week: s.week,
    weekRngState: s.weekRngState,
    season: s.season,
    lastSummary: s.lastSummary,
    ...(s.cards ? { cards: s.cards } : {}),
    // 구 세이브(v1 초기)는 카드가 없다 — 기본 스트림 상태로 시작한다
    cardRngState: s.cardRngState ?? 31337,
    ...(s.staff ? { staff: s.staff } : {}),
    staffRngState: s.staffRngState ?? 20260818,
    ...(s.courses ? { courses: s.courses } : {}),
    ...(s.discovered ? { discovered: s.discovered } : {}),
    ...(s.resortName ? { resortName: s.resortName } : {}),
    ...(s.priceMult !== undefined ? { priceMult: s.priceMult } : {}),
    ...(s.accidentIdle ? { accidentIdle: s.accidentIdle } : {}),
    ...(s.mapId ? { mapId: s.mapId } : {}),
    ...(s.scenarioId ? { scenarioId: s.scenarioId } : {}),
    ...(s.accidentCount !== undefined ? { accidentCount: s.accidentCount } : {}),
    ...(s.reputation !== undefined ? { reputation: s.reputation } : {}),
    ...(s.gradeNo !== undefined ? { gradeNo: s.gradeNo } : {}),
  };
}

export function saveKairoToStorage(input: KairoSaveInput, nowMs: number = Date.now()): void {
  try {
    localStorage.setItem(KAIRO_SAVE_KEY, JSON.stringify(packKairo(input, nowMs)));
  } catch (e) {
    // 저장 실패로 게임이 멈추면 안 된다 — 사파리 프라이빗 모드는 쓰기를 막는다
    console.warn('[카이로] 저장 실패', e);
  }
}

export function loadKairoFromStorage(): KairoRestored | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KAIRO_SAVE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return restoreKairo(JSON.parse(raw));
  } catch (e) {
    // 깨진 세이브로 부팅이 막히면 폰에서 복구할 방법이 없다 — 버리고 새로 시작한다
    console.warn('[카이로] 세이브를 읽지 못해 새로 시작합니다', e);
    return null;
  }
}

export function clearKairoStorage(): void {
  try {
    localStorage.removeItem(KAIRO_SAVE_KEY);
  } catch {
    /* 무시 */
  }
}
