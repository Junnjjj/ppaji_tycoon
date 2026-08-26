import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Rng } from '../sim/rng.js';
import { forkWeekRngStreams, snapshotWeekRngStreams } from '../sim/kairo/week.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import { PlacementGrid } from '../sim/kairo/placement.js';
import { ProgressStore } from '../sim/kairo/progress.js';
import {
  KAIRO_SAVE_VERSION,
  migrateKairo,
  packKairo,
  restoreKairo,
  type KairoSaveInput,
} from './kairo.js';

function legacyV8(step: string): Record<string, unknown> {
  return {
    version: 8,
    terrain: {},
    walls: {},
    placement: {},
    progress: {},
    week: {},
    onboarding: { version: 1, step },
  };
}

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
    expect(migrated.onboarding).toEqual({ version: 2, step: 'open-course' });
    expect((migrated as unknown as Record<string, unknown>)['sentinel']).toBe('keep-me');
    expect(migrated.weekRngStreams).toBeUndefined();
  });

  it('이미 배포된 v8 onboarding v1 done은 완료로 보존한다', () => {
    expect(migrateKairo(legacyV8('done')).onboarding).toEqual({ version: 2, step: 'done' });
  });

  it('이미 배포된 v8 onboarding v1 미완료 커서는 대응 v2 단계로 옮긴다', () => {
    expect(migrateKairo(legacyV8('build-food')).onboarding).toEqual({
      version: 2,
      step: 'build-food',
    });
  });

  it('확장 단계 커서를 운영 v8 안에서 저장·재로드해도 그대로 잇는다', () => {
    const input: KairoSaveInput = {
      seed: 17,
      gate: { i: 0, j: 0 },
      terrain: new KairoTerrain(8, 8),
      walls: new WallGrid(8, 8),
      placement: new PlacementGrid(8, 8),
      progress: new ProgressStore(),
      week: { week: 1, cash: 4_000_000 },
      weekRngState: 31,
      season: 'summer',
      lastSummary: null,
      onboarding: { version: 2, step: 'regular-purchase' },
    };
    const restored = restoreKairo(JSON.parse(JSON.stringify(packKairo(input, 1234))));
    expect(restored.onboarding).toEqual({ version: 2, step: 'regular-purchase' });
  });

  it('구 v7 RNG 루트는 새 독립 스트림으로 언제나 같은 값에 fallback한다', () => {
    const legacyState = 31337;
    const first = snapshotWeekRngStreams(forkWeekRngStreams(Rng.fromState(legacyState)));
    const second = snapshotWeekRngStreams(forkWeekRngStreams(Rng.fromState(legacyState)));
    expect(first).toEqual(second);
    expect(new Set(Object.values(first)).size).toBe(4);
  });

  it('브라우저 게이트가 배포된 onboarding v1 완료/미완료 세이브를 실제 UI로 부팅한다', () => {
    const verifier = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');
    expect(verifier).toContain('legacy v1 done 세이브 브라우저 부팅');
    expect(verifier).toContain('legacy v1 미완료 세이브 A 행동');
    expect(verifier).toContain("{ version: 1, step: legacyStep }");
    expect(verifier).toContain("[data-goal-role=\"immediate\"]");
  });
});
