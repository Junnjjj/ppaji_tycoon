import { KairoTerrain, type TerrainSnapshot } from '../sim/kairo/terrain.js';
import { WallGrid, type WallSnapshot } from '../sim/kairo/walls.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';
import { ProgressStore, type ProgressSnapshot } from '../sim/kairo/progress.js';
import type { WeekSnapshot, WeekSummary, Season } from '../sim/kairo/week.js';
import type { CardSnapshot } from '../sim/kairo/cards.js';

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

export const KAIRO_SAVE_VERSION = 1;
export const KAIRO_SAVE_KEY = 'ppaji.kairo.save.v1';

export interface KairoSaveV1 {
  version: 1;
  savedAtMs: number;
  seed: number;
  gate: { i: number; j: number };
  terrain: TerrainSnapshot;
  walls: WallSnapshot;
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
}

export type AnyKairoSave = KairoSaveV1;
export type LatestKairoSave = KairoSaveV1;

/**
 * v(n) → v(n+1) 변환기. 새 버전마다 한 칸 추가한다.
 * Phase 0 의 교훈 그대로 — 나중에 붙이려 하면 이미 나간 세이브가 전부 깨진다.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>> = {};

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
  placement: PlacementGrid;
  progress: ProgressStore;
  week: WeekSnapshot;
  weekRngState: number;
  season: Season;
  lastSummary: WeekSummary | null;
  cards?: CardSnapshot;
  cardRngState?: number;
}

export function packKairo(input: KairoSaveInput, nowMs: number): LatestKairoSave {
  return {
    version: KAIRO_SAVE_VERSION,
    savedAtMs: nowMs,
    seed: input.seed,
    gate: { i: input.gate.i, j: input.gate.j },
    terrain: input.terrain.toSnapshot(),
    walls: input.walls.toSnapshot(),
    placement: input.placement.toSnapshot(),
    progress: input.progress.toSnapshot(),
    week: input.week,
    weekRngState: input.weekRngState,
    season: input.season,
    lastSummary: input.lastSummary,
    ...(input.cards ? { cards: input.cards } : {}),
    ...(input.cardRngState !== undefined ? { cardRngState: input.cardRngState } : {}),
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
  placement: PlacementGrid;
  progress: ProgressStore;
  week: WeekSnapshot;
  weekRngState: number;
  season: Season;
  lastSummary: WeekSummary | null;
  cards?: CardSnapshot;
  /** 없으면(구 세이브) 호출자가 새 스트림을 만든다 */
  cardRngState: number;
}

export function restoreKairo(raw: unknown): KairoRestored {
  const s = migrateKairo(raw);
  return {
    seed: s.seed,
    gate: s.gate,
    terrain: KairoTerrain.fromSnapshot(s.terrain),
    walls: WallGrid.fromSnapshot(s.walls),
    placement: PlacementGrid.fromSnapshot(s.placement),
    progress: ProgressStore.fromSnapshot(s.progress),
    week: s.week,
    weekRngState: s.weekRngState,
    season: s.season,
    lastSummary: s.lastSummary,
    ...(s.cards ? { cards: s.cards } : {}),
    // 구 세이브(v1 초기)는 카드가 없다 — 기본 스트림 상태로 시작한다
    cardRngState: s.cardRngState ?? 31337,
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
