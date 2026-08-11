import { Game, type GameSnapshot } from '../sim/index.js';

/**
 * 세이브 — 계획서 §5.6.
 *
 * version 필드와 마이그레이션 체인을 Phase 0 에 박아둔다.
 * 나중에 붙이려 하면 이미 나간 세이브들이 전부 깨진다.
 *
 * 책임 분리: sim/ 은 자기 상태를 스냅샷할 줄만 알고,
 * 버전·마이그레이션·저장 위치는 여기가 맡는다.
 */

export const CURRENT_SAVE_VERSION = 1;

export interface SaveV1 {
  version: 1;
  /** 저장 시각(ms). 오프라인 수익 계산에 쓴다. sim 밖이므로 실시간을 써도 된다. */
  savedAtMs: number;
  game: GameSnapshot;
}

/** 버전이 늘면 유니온에 추가한다: SaveV1 | SaveV2 | … */
export type AnySave = SaveV1;
export type LatestSave = SaveV1;

/**
 * v(n) → v(n+1) 변환기. 새 버전을 만들 때마다 여기에 한 칸 추가한다.
 * 예) 1: (s) => ({ ...s, version: 2, newField: 기본값 })
 */
const MIGRATIONS: Record<number, (save: Record<string, unknown>) => Record<string, unknown>> =
  {};

export class SaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveError';
  }
}

export function pack(game: Game, nowMs: number): LatestSave {
  return {
    version: CURRENT_SAVE_VERSION,
    savedAtMs: nowMs,
    game: game.toSnapshot(),
  };
}

/** 저장된 값을 검증·마이그레이션해서 최신 포맷으로 만든다. */
export function migrate(raw: unknown): LatestSave {
  if (typeof raw !== 'object' || raw === null) {
    throw new SaveError('세이브가 객체가 아닙니다');
  }
  let cur = raw as Record<string, unknown>;

  const version = cur['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new SaveError(`세이브 버전이 올바르지 않습니다: ${String(version)}`);
  }
  if (version > CURRENT_SAVE_VERSION) {
    throw new SaveError(
      `이 세이브는 더 최신 버전입니다 (세이브 v${version} > 게임 v${CURRENT_SAVE_VERSION}). ` +
        '게임을 업데이트하세요.',
    );
  }

  for (let v = version; v < CURRENT_SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`v${v} → v${v + 1} 마이그레이션이 없습니다`);
    cur = step(cur);
  }

  validateLatest(cur);
  return cur as unknown as LatestSave;
}

/** 최신 포맷의 필수 형태를 검사한다. 어긋나면 SaveError 를 던진다. */
function validateLatest(s: Record<string, unknown>): void {
  if (s['version'] !== CURRENT_SAVE_VERSION) {
    throw new SaveError(`마이그레이션 후 버전이 맞지 않습니다: ${String(s['version'])}`);
  }
  const g = s['game'];
  if (typeof g !== 'object' || g === null) throw new SaveError('game 스냅샷이 없습니다');

  const snap = g as Record<string, unknown>;
  const world = snap['world'];
  if (typeof world !== 'object' || world === null) throw new SaveError('world 가 없습니다');

  const w = world as Record<string, unknown>;
  const width = w['width'];
  const height = w['height'];
  const tiles = w['tiles'];
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new SaveError('world 크기가 올바르지 않습니다');
  }
  if (!Array.isArray(tiles) || tiles.length !== width * height) {
    throw new SaveError(
      `타일 수가 맞지 않습니다 (기대 ${width * height}, 실제 ${Array.isArray(tiles) ? tiles.length : '없음'})`,
    );
  }
  if (typeof snap['seed'] !== 'number' || typeof snap['tick'] !== 'number') {
    throw new SaveError('seed/tick 이 올바르지 않습니다');
  }
}

export function restore(raw: unknown): Game {
  return Game.fromSnapshot(migrate(raw).game);
}

// ─────────────────────────────────────────────────────────────
// 저장소. 지금은 localStorage, Capacitor 포장 시 Preferences 로 교체한다.
// (iOS 는 localStorage 를 임의로 비울 수 있으므로 — 계획서 §14)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ppaji.save.v1';

export function saveToStorage(game: Game, nowMs: number = Date.now()): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pack(game, nowMs)));
}

export function loadFromStorage(): Game | null {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return null;
  return restore(JSON.parse(text));
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
