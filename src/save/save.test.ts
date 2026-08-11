import { describe, it, expect } from 'vitest';
import { Game } from '../sim/index.js';
import { pack, migrate, restore, CURRENT_SAVE_VERSION, SaveError } from './index.js';

function freshGame(): Game {
  const g = new Game({ seed: 4242, width: 40, height: 40 });
  g.run(1234);
  return g;
}

describe('세이브 왕복', () => {
  it('저장했다 복원하면 상태가 같다', () => {
    const g = freshGame();
    const restored = restore(pack(g, 0));
    expect(restored.stats()).toEqual(g.stats());
    expect(Array.from(restored.world.tiles)).toEqual(Array.from(g.world.tiles));
  });

  it('복원 후 이어서 돌려도 결정론이 유지된다', () => {
    const a = freshGame();
    const snapshot = JSON.parse(JSON.stringify(pack(a, 0)));

    // 원본은 계속 진행
    a.run(500);
    // 복원본도 같은 만큼 진행
    const b = restore(snapshot);
    b.run(500);

    expect(b.stats()).toEqual(a.stats());
    expect(b.guestRng.next()).toBe(a.guestRng.next());
    expect(b.weatherRng.next()).toBe(a.weatherRng.next());
  });

  it('RNG 스트림 상태까지 보존된다', () => {
    const g = freshGame();
    for (let i = 0; i < 77; i++) g.guestRng.next(); // 중간까지 소비한 상태로 저장

    const restored = restore(pack(g, 0));

    // 저장 직후부터 원본과 복원본은 같은 수열을 이어가야 한다.
    // (시드부터 다시 시작하면 여기서 어긋난다)
    for (let i = 0; i < 20; i++) {
      expect(restored.guestRng.next()).toBe(g.guestRng.next());
    }
  });

  it('JSON 직렬화를 통과한다', () => {
    const g = freshGame();
    const text = JSON.stringify(pack(g, 12345));
    const back = restore(JSON.parse(text));
    expect(back.stats()).toEqual(g.stats());
  });

  it('현재 버전이 찍힌다', () => {
    expect(pack(freshGame(), 0).version).toBe(CURRENT_SAVE_VERSION);
  });
});

describe('세이브 검증', () => {
  it('객체가 아니면 거부한다', () => {
    expect(() => migrate(null)).toThrow(SaveError);
    expect(() => migrate('문자열')).toThrow(SaveError);
    expect(() => migrate(42)).toThrow(SaveError);
  });

  it('버전이 없으면 거부한다', () => {
    expect(() => migrate({ game: {} })).toThrow(/버전/);
  });

  it('미래 버전은 명확한 안내와 함께 거부한다', () => {
    expect(() => migrate({ version: 999, game: {} })).toThrow(/업데이트/);
  });

  it('타일 수가 안 맞으면 거부한다 (조용히 깨지지 않게)', () => {
    const g = freshGame();
    const bad = JSON.parse(JSON.stringify(pack(g, 0)));
    bad.game.world.tiles = bad.game.world.tiles.slice(0, 10);
    expect(() => migrate(bad)).toThrow(/타일 수/);
  });

  it('world 가 없으면 거부한다', () => {
    expect(() => migrate({ version: 1, savedAtMs: 0, game: { seed: 1, tick: 0 } })).toThrow(
      /world/,
    );
  });

  it('seed/tick 이 없으면 거부한다', () => {
    const g = freshGame();
    const bad = JSON.parse(JSON.stringify(pack(g, 0)));
    delete bad.game.seed;
    expect(() => migrate(bad)).toThrow(/seed/);
  });
});

describe('마이그레이션 체인', () => {
  it('현재 버전은 변환 없이 통과한다', () => {
    const s = pack(freshGame(), 0);
    expect(migrate(JSON.parse(JSON.stringify(s))).version).toBe(CURRENT_SAVE_VERSION);
  });

  it('변환기가 없는 옛 버전은 조용히 통과시키지 않는다', () => {
    // v1 이 최신인 지금 v0 은 존재할 수 없다. 버전이 늘어난 뒤
    // 변환기를 빠뜨리면 이 경로가 잡아준다.
    expect(() => migrate({ version: 0, game: {} })).toThrow(/올바르지 않습니다/);
  });
});
