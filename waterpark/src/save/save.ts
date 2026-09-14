/**
 * 세이브 — `wp.save` 한 키. 버전 + 마이그레이션 체인 (`MIGRATIONS` 가 정본 — 아래 표를 볼 것).
 * 마이그레이션은 **한 단계씩** 올린다 — 건너뛰면 중간 버전이 영영 못 열린다.
 */
import type { GameSnapshot } from '../sim/game.js';

export const SAVE_KEY = 'wp.save';
export const SAVE_VERSION = 2;

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
