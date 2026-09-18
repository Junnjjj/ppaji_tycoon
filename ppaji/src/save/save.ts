/**
 * 세이브 — `wp.save` 한 키. 버전 + 마이그레이션 체인 (`MIGRATIONS` 가 정본 — 아래 표를 볼 것).
 * 마이그레이션은 **한 단계씩** 올린다 — 건너뛰면 중간 버전이 영영 못 열린다.
 */
import type { GameSnapshot } from '../sim/game.js';
import { GRID_W, GRID_H } from '../sim/grid.js';

export const SAVE_KEY = 'pj.save';
export const SAVE_VERSION = 5;

export interface SaveFile {
  version: number;
  savedAt: string;
  game: GameSnapshot;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
/** index k: v(k+1) → v(k+2). 한 단계씩만 */
export const MIGRATIONS: readonly Migration[] = [
  // v1 → v2: G11 이 `ticketBonus`·`endingSeen` 을 더했다 — 없던 세이브는 0/false
  (raw) => {
    const game = (raw['game'] ?? {}) as Record<string, unknown>;
    return { ...raw, version: 2, game: { ...game, ticketBonus: game['ticketBonus'] ?? 0, endingSeen: game['endingSeen'] ?? false } };
  },
  // v2 → v3: P43 격자 64×48 → 96×72 (도시 띠·마당·강). 옛 판의 좌표는 전부 물가·입구 기준이 갈려 옮길 수 없다 — 크기가 다르면 새 판(game: null → load 가 null)
  (raw) => {
    const game = raw['game'] as { grid?: { w?: number; h?: number } } | null | undefined;
    const grid = game?.grid;
    const fits = !!grid && grid.w === GRID_W && grid.h === GRID_H;
    return { ...raw, version: 3, game: fits ? game : null };
  },
  // v3 → v4: P48-b1 물굽이 — 지형이 첫날부터 다르다(마당 가운데가 물). 옛 판의 자연 바닥·시설 좌표를 옮길 수 없다 → 새 판(W8)
  () => ({ version: 4, game: null }),
  // v4 → v5: P60-a(D71) 색·향·소품 삭제 — `pools.pools[].items` · `presets` · `unlocked.items` 를 **읽고 버린다**. 판은 그대로 산다(새 판 아님) — 지형·시설·돈은 소품과 무관하다
  (raw) => {
    const game = raw['game'] as Record<string, unknown> | null | undefined;
    if (!game) return { ...raw, version: 5, game: null };
    const next: Record<string, unknown> = { ...game };
    delete next['presets'];
    const pools = game['pools'] as { pools?: Record<string, unknown>[] } | undefined;
    if (pools && Array.isArray(pools.pools)) next['pools'] = { ...pools, pools: pools.pools.map((p) => { const q = { ...p }; delete q['items']; return q; }) };
    const unlocked = game['unlocked'] as Record<string, unknown> | undefined;
    if (unlocked) { const u = { ...unlocked }; delete u['items']; next['unlocked'] = u; }
    return { ...raw, version: 5, game: next };
  },
];

export function migrate(raw: Record<string, unknown>): SaveFile | null {
  let v = typeof raw['version'] === 'number' ? (raw['version'] as number) : 0;
  let cur = raw;
  if (v < 1 || v > SAVE_VERSION) return null;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v - 1];
    if (!m) return null;
    cur = m(cur);
    v++;
  }
  if (!cur['game']) return null; // 옮길 수 없는 판
  return cur as unknown as SaveFile;
}

export function load(storage: Pick<Storage, 'getItem'> = localStorage): SaveFile | null {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function save(game: GameSnapshot, storage: Pick<Storage, 'setItem'> = localStorage, now = new Date()): void {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now.toISOString(), game };
  storage.setItem(SAVE_KEY, JSON.stringify(file));
}

export function clear(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(SAVE_KEY);
}
