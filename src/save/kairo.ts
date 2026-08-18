import { KairoTerrain, groundIndex, type TerrainSnapshot } from '../sim/kairo/terrain.js';
import { WallGrid, type WallSnapshot } from '../sim/kairo/walls.js';
import { PlacementGrid, type PlacementSnapshot } from '../sim/kairo/placement.js';
import { ProgressStore, type ProgressSnapshot } from '../sim/kairo/progress.js';
import type { WeekSnapshot, WeekSummary, Season } from '../sim/kairo/week.js';
import type { CardSnapshot } from '../sim/kairo/cards.js';
import type { StaffCounts } from '../sim/kairo/staff.js';
import type { CourseSnapshot } from '../sim/kairo/course.js';
import type { DoorSnapshot } from '../sim/kairo/doors.js';

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

export const KAIRO_SAVE_VERSION = 6;
export const KAIRO_SAVE_KEY = 'ppaji.kairo.save.v1';

export interface KairoSaveV5 {
  version: 6;
  savedAtMs: number;
  seed: number;
  gate: { i: number; j: number };
  terrain: TerrainSnapshot;
  /**
   * 벽. **정본이 아니다** — 실내 바닥(지형)에서 파생된다 (K27). 불러올 때 다시 굽지만,
   * 재굽기가 실패해도 화면이 비지 않도록 스냅샷도 같이 담는다.
   */
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
  /**
   * 고용 인원. 인건비는 고정비라 **다시 켰을 때 그대로여야** 한다 — 저장 안 하면
   * 새로고침이 곧 전원 해고가 되고, 그 주 결산이 이유 없이 좋아진다.
   */
  staff?: Partial<StaffCounts>;
  staffRngState?: number;
  /** 놓인 코스 — 장비값을 치르고 그린 것이라 안 저장하면 새로고침이 곧 전부 철거다 */
  courses?: CourseSnapshot;
  /** 플레이어가 놓은 출입구 (K36-B). 없으면 빈 집합 — 예전 세이브가 그대로 열린다 */
  doors?: DoorSnapshot;
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

export type AnyKairoSave = KairoSaveV5;
export type LatestKairoSave = KairoSaveV5;

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

  /*
   * v2 → v3 (K27): 사각형 건물이 사라지고 **실내 바닥이 곧 방**이 됐다.
   *
   * 버리지 않고 옮긴다 — 건물 사각형이 덮던 칸을 지형에서 `floor_indoor` 로 칠하면
   * 같은 방이 그대로 복원된다. 벽은 불러올 때 지형에서 다시 굽는다.
   */
  2: (s) => {
    const t = s['terrain'] as { w?: number; cells?: number[] } | undefined;
    const b = s['buildings'] as
      | { items?: { rect: { i: number; j: number; w: number; h: number } }[] }
      | undefined;
    const rest: Record<string, unknown> = { ...s, version: 3 };
    delete rest['buildings'];
    if (t?.cells && typeof t.w === 'number' && b?.items?.length) {
      const floor = groundIndex('floor_indoor');
      const cells = [...t.cells];
      for (const it of b.items) {
        for (let j = it.rect.j; j < it.rect.j + it.rect.h; j++) {
          for (let i = it.rect.i; i < it.rect.i + it.rect.w; i++) {
            const k = j * t.w + i;
            if (k >= 0 && k < cells.length) cells[k] = floor;
          }
        }
      }
      rest['terrain'] = { ...t, cells };
    }
    return rest;
  },

  /*
   * v3 → v4 (K36): 격자가 **64×48 → 96×72** 로 넓어지고 위에 **도시 띠 3줄**이 생겼다.
   *
   * ⚠ 이게 없으면 상수만 커진 화면에 **잔디처럼 보이지만 영원히 죽은 칸**이 생긴다 —
   * `fromSnapshot` 셋이 전부 저장된 크기를 그대로 쓰므로 새 영역은 `paint` 실패 ·
   * `outside` · 플로우필드 밖이 된다. 렌더는 그것도 그려 준다.
   *
   * 옮기는 방법:
   *   · 지형을 새 크기로 다시 짜고 옛 칸을 **`+CITY_BAND` 만큼 아래로** 옮긴다
   *   · 격자 밖 새 영역은 **가장자리 줄을 잇는다** — 아래로는 물이 이어지고 오른쪽으로는
   *     같은 물가 모양이 이어진다. 잔디로 채우면 강이 끊긴 이상한 지형이 된다
   *   · 위 세 줄은 도로·보도·가로수로 덮고 입구 한 열을 뚫는다
   *   · 시설·코스도 같이 내리고, 격자 밖으로 나간 것은 **버리고 개수를 남긴다**
   *   · 벽은 비운다 — 실내 바닥이 정본이라 불러올 때 다시 굽는다 (K27)
   */
  3: (s) => {
    const BAND = KairoTerrain.CITY_BAND;
    const NW = KairoTerrain.WIDTH;
    const NH = KairoTerrain.HEIGHT;
    const t = s['terrain'] as { w?: number; h?: number; kinds?: number[] } | undefined;
    const rest: Record<string, unknown> = { ...s, version: 4 };

    if (t?.kinds && typeof t.w === 'number' && typeof t.h === 'number') {
      const ow = t.w;
      const oh = t.h;
      const old = t.kinds;
      const kinds = new Array<number>(NW * NH).fill(groundIndex('lawn'));
      const road = groundIndex('road');
      const walk = groundIndex('sidewalk');
      const verge = groundIndex('verge');
      for (let j = 0; j < NH; j++) {
        for (let i = 0; i < NW; i++) {
          if (j < BAND) {
            let k = KairoTerrain.ROAD_ROWS.includes(j)
              ? road
              : j === KairoTerrain.STOP_ROW
                ? walk
                : verge;
            if (j > KairoTerrain.STOP_ROW && i === KairoTerrain.ENTRY_I) k = walk;
            kinds[j * NW + i] = k;
            continue;
          }
          // 가장자리 줄을 이어 붙인다 — 강이 끊기지 않게
          const oi = Math.min(ow - 1, i);
          const oj = Math.min(oh - 1, j - BAND);
          kinds[j * NW + i] = old[oj * ow + oi] ?? kinds[j * NW + i] ?? 0;
        }
      }
      rest['terrain'] = { w: NW, h: NH, kinds };
    }

    const pl = s['placement'] as
      | { w?: number; h?: number; next?: number; items?: { i: number; j: number }[] }
      | undefined;
    let dropped = 0;
    if (pl?.items) {
      const kept = pl.items.filter((it) => {
        const nj = it.j + BAND;
        const ok = it.i >= 0 && it.i < NW && nj >= 0 && nj < NH;
        if (!ok) dropped += 1;
        return ok;
      });
      rest['placement'] = {
        w: NW,
        h: NH,
        next: pl.next ?? 1,
        items: kept.map((it) => ({ ...it, j: it.j + BAND })),
      };
    }

    const co = s['courses'] as
      | { courses?: { dock: { x: number; y: number }; handles: { x: number; y: number }[] }[] }
      | undefined;
    if (co?.courses) {
      rest['courses'] = {
        ...co,
        courses: co.courses.map((c) => ({
          ...c,
          dock: { x: c.dock.x, y: c.dock.y + BAND },
          handles: c.handles.map((h) => ({ x: h.x, y: h.y + BAND })),
        })),
      };
    }

    // 벽은 버린다 — 실내 바닥에서 다시 굽는다 (K27: 지형이 정본)
    rest['walls'] = { w: NW, h: NH, ei: [], ej: [] };
    rest['gate'] = KairoTerrain.parkGate();
    if (dropped > 0) rest['migrationDropped'] = dropped;
    return rest;
  },

  /*
   * v4 → v5 (K36-B): 플레이어가 놓은 **출입구**가 생겼다.
   *
   * 옮길 것이 없다 — 옛 세이브에는 희망이 없으니 빈 집합이고, 그러면 `bakeIndoorWalls`
   * 가 예전처럼 덩어리마다 자동으로 하나씩 낸다. **판이 그대로 열린다.**
   */
  4: (s) => ({ ...s, version: 5, doors: { keys: [] } }),
  /*
   * v5 → v6 (K37): 지형에 **단(높이)** 이 생겼다.
   *
   * 옮길 것이 없다 — `TerrainSnapshot.levels` 는 optional 이고, 없으면
   * `KairoTerrain.fromSnapshot` 이 전부 0 으로 채운다. 즉 **옛 판은 평지로 열린다.**
   *
   * ⚠ 산을 소급해서 세우지 **않는다.** 이미 놓인 시설이 경사에 걸터앉게 되고
   * (`level-mixed` 는 놓을 때만 보므로 조용히 남는다) 손님이 못 가는 칸이 생긴다 —
   * 플레이어가 산 것을 마이그레이션이 망가뜨리는 쪽이 훨씬 나쁘다. 새 판부터 산이 있다.
   */
  5: (s) => ({ ...s, version: 6 }),
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
  doors?: DoorSnapshot;
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
    ...(input.doors ? { doors: input.doors } : {}),
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
  doors?: DoorSnapshot;
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
    ...(s.doors ? { doors: s.doors } : {}),
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
