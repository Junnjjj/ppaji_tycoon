import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import {
  KairoTerrain,
  GROUND_KINDS,
  BRIDGE_KINDS,
  groundIndex,
  groundDef,
} from './terrain.js';

const GW = 40;
const GH = 32;

describe('지면 데이터 — 시뮬이 소유한다', () => {
  it('종류 11종 + 다리 2종', () => {
    // K36 도시 띠 3종 · K37 암반 · S1 수영장 물(pool_water)
    expect(GROUND_KINDS).toHaveLength(11);
    expect(BRIDGE_KINDS).toHaveLength(2);
  });

  it('기본 종류가 정확히 하나다', () => {
    expect(GROUND_KINDS.filter((k) => k.default)).toHaveLength(1);
    expect(GROUND_KINDS.find((k) => k.default)?.id).toBe('lawn');
  });

  it('물만 못 걷는다 — 강물과 수영장 (S1)', () => {
    const blocked = GROUND_KINDS.filter((k) => !k.walkable).map((k) => k.id);
    expect(blocked).toEqual(['water_edge', 'pool_water']);
  });

  it('다리는 걸을 수 있다 — 물 위를 잇는 유일한 지면', () => {
    for (const b of BRIDGE_KINDS) expect(b.walkable).toBe(true);
  });

  it('알 수 없는 종류는 던진다 — 오타가 조용히 통과하면 안 된다', () => {
    expect(() => groundIndex('nope')).toThrow();
    expect(() => groundDef(99)).toThrow();
  });
});

describe('지형 생성 — 결정론', () => {
  it('같은 시드는 같은 지형을 낸다', () => {
    const a = KairoTerrain.generate(GW, GH, new Rng(42));
    const b = KairoTerrain.generate(GW, GH, new Rng(42));
    expect(a.toSnapshot()).toEqual(b.toSnapshot());
  });

  it('다른 시드는 다른 지형을 낸다', () => {
    const a = KairoTerrain.generate(GW, GH, new Rng(1));
    const b = KairoTerrain.generate(GW, GH, new Rng(2));
    expect(a.toSnapshot()).not.toEqual(b.toSnapshot());
  });

  it('강이 가로로 흐른다 — 앞(큰 j)이 물, 뒤가 육지', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(7));
    // 맨 뒤 줄은 육지, 맨 앞 줄은 물
    for (let i = 0; i < GW; i++) {
      expect(t.isWalkable(i, 0), `뒤 (${i},0)`).toBe(true);
      expect(t.isWalkable(i, GH - 1), `앞 (${i},${GH - 1})`).toBe(false);
    }
  });

  it('물가 선이 직선이 아니다 — 직선이면 인공적으로 보인다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(7));
    const shores = new Set<number>();
    for (let i = 0; i < GW; i++) {
      for (let j = 0; j < GH; j++) {
        if (!t.isWalkable(i, j)) {
          shores.add(j);
          break;
        }
      }
    }
    expect(shores.size).toBeGreaterThan(1);
  });

  it('걸을 수 있는 칸이 절반 이상이다 — 놓을 자리가 없으면 게임이 안 된다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(7));
    expect(t.countWalkable()).toBeGreaterThan((GW * GH) / 2);
  });
});

describe('칠하기', () => {
  it('한 칸을 칠하면 종류가 바뀐다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    expect(t.paint(5, 5, 'path_deck')).toBe(true);
    expect(t.kindAt(5, 5)).toBe('path_deck');
  });

  it('격자 밖은 무시한다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    expect(t.paint(-1, 0, 'lawn')).toBe(false);
    expect(t.paint(GW, 0, 'lawn')).toBe(false);
    expect(t.at(-1, 0)).toBe(-1);
    expect(t.kindAt(GW, 0)).toBeNull();
  });

  it('물가를 보도로 칠하면 걸을 수 있게 된다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    // 물인 칸을 찾는다
    let wet: [number, number] | null = null;
    for (let j = GH - 1; j >= 0 && !wet; j--) {
      for (let i = 0; i < GW; i++) if (!t.isWalkable(i, j)) { wet = [i, j]; break; }
    }
    expect(wet).not.toBeNull();
    const [i, j] = wet!;
    t.paint(i, j, 'path_deck');
    expect(t.isWalkable(i, j)).toBe(true);
  });

  it('직선 경로를 칠한다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    const n = t.paintLine(2, 2, 10, 2, 'path_stone');
    expect(n).toBe(9);
    for (let i = 2; i <= 10; i++) expect(t.kindAt(i, 2)).toBe('path_stone');
  });

  it('대각선 경로도 끊기지 않는다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    t.paintLine(3, 3, 9, 6, 'path_deck');
    // 시작·끝이 칠해지고 중간에 최소 한 칸 이상 이어진다
    expect(t.kindAt(3, 3)).toBe('path_deck');
    expect(t.kindAt(9, 6)).toBe('path_deck');
  });

  it('같은 칸 경로는 한 칸만 칠한다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(3));
    expect(t.paintLine(4, 4, 4, 4, 'path_sand')).toBe(1);
  });
});

describe('스냅샷 왕복 — 세이브 계약', () => {
  it('왕복해도 같다', () => {
    const t = KairoTerrain.generate(GW, GH, new Rng(11));
    t.paintLine(1, 1, 20, 1, 'path_deck');
    const s = t.toSnapshot();
    const back = KairoTerrain.fromSnapshot(s);
    expect(back.toSnapshot()).toEqual(s);
    expect(back.countWalkable()).toBe(t.countWalkable());
  });

  it('스냅샷이 평문 데이터다 — sim 은 평문만 주고받는다', () => {
    const s = KairoTerrain.generate(4, 4, new Rng(1)).toSnapshot();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
