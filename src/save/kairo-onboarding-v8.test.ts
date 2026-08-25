import { describe, expect, it } from 'vitest';
import { Rng } from '../sim/rng.js';
import { forkWeekRngStreams, snapshotWeekRngStreams } from '../sim/kairo/week.js';
import { KAIRO_SAVE_VERSION, migrateKairo } from './kairo.js';

describe('Phase 7 v7→v8 온보딩 마이그레이션', () => {
  it('기존 판은 잃지 않고 비차단 첫 단계 커서만 추가한다', () => {
    const old = {
      version: 7,
      terrain: {},
      walls: {},
      placement: {},
      progress: {},
      week: {},
      sentinel: 'keep-me',
    };
    const migrated = migrateKairo(old);
    expect(migrated.version).toBe(KAIRO_SAVE_VERSION);
    expect(migrated.onboarding).toEqual({ version: 1, step: 'open-course' });
    expect((migrated as unknown as Record<string, unknown>)['sentinel']).toBe('keep-me');
    expect(migrated.weekRngStreams).toBeUndefined();
  });

  it('구 v7 RNG 루트는 새 독립 스트림으로 언제나 같은 값에 fallback한다', () => {
    const legacyState = 31337;
    const first = snapshotWeekRngStreams(forkWeekRngStreams(Rng.fromState(legacyState)));
    const second = snapshotWeekRngStreams(forkWeekRngStreams(Rng.fromState(legacyState)));
    expect(first).toEqual(second);
    expect(new Set(Object.values(first)).size).toBe(4);
  });
});
