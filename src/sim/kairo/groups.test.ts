import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { GROUPS, groupDef, pickGroup, groupSize, needWeight, validateGroups } from './groups.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { WeekRunner, type Season } from './week.js';

/**
 * 손님 그룹 유형 — 스펙 §10.4.
 *
 * 지키려는 성질은 하나다: **시설 구성이 손님 구성을 통해 결과를 바꾼다.**
 * 유형이 이름표일 뿐이면 넣은 의미가 없다.
 */

const GATE = { i: 2, j: 2 };

function lawn(w = 40, h = 32): KairoTerrain {
  const t = new KairoTerrain(w, h);
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.paint(i, j, 'path_stone');
  return t;
}

describe('그룹 데이터', () => {
  it('4종이다 — 가족·커플·친구·회사 단체', () => {
    expect(GROUPS.map((g) => g.id)).toEqual(['family', 'couple', 'friends', 'company']);
  });

  it('데이터 규칙을 지킨다 (계절별 비중 합 1)', () => {
    expect(validateGroups()).toEqual([]);
  });

  it('유형마다 지갑·스릴·인내가 다르다 — 같으면 이름표일 뿐이다', () => {
    expect(new Set(GROUPS.map((g) => g.wallet)).size).toBeGreaterThan(1);
    expect(new Set(GROUPS.map((g) => g.thrill[0])).size).toBeGreaterThan(1);
    expect(new Set(GROUPS.map((g) => g.patience)).size).toBeGreaterThan(1);
  });

  it('가족은 놀이·위생을 멀어도 가고, 친구는 스릴을 멀어도 간다', () => {
    const fam = groupDef('family');
    const fri = groupDef('friends');
    expect(needWeight(fam, 'play')).toBeLessThan(1);
    expect(needWeight(fam, 'hygiene')).toBeLessThan(1);
    expect(needWeight(fam, 'thrill')).toBeGreaterThan(1);
    expect(needWeight(fri, 'thrill')).toBeLessThan(1);
    expect(needWeight(fri, 'thrill')).toBeLessThan(needWeight(fam, 'thrill'));
  });

  it('모르는 수요는 1.0 — 편향표에 없다고 후보에서 빠지면 안 된다', () => {
    expect(needWeight(groupDef('couple'), 'warm')).toBe(1);
  });
});

describe('뽑기', () => {
  it('계절 비중대로 나온다 — 겨울은 가족·커플이 더 많다', () => {
    const share = (season: Season): Record<string, number> => {
      const rng = new Rng(4242);
      const n = 4000;
      const out: Record<string, number> = {};
      for (let k = 0; k < n; k++) {
        const g = pickGroup(rng, season);
        out[g.id] = (out[g.id] ?? 0) + 1 / n;
      }
      return out;
    };
    const summer = share('summer');
    const winter = share('winter');
    expect(summer['family']).toBeCloseTo(0.4, 1);
    expect(summer['company']).toBeCloseTo(0.1, 1);
    // 겨울은 가족·커플 비중이 오른다
    expect((winter['family'] ?? 0) + (winter['couple'] ?? 0)).toBeGreaterThan(
      (summer['family'] ?? 0) + (summer['couple'] ?? 0),
    );
  });

  it('인원이 범위 안이다', () => {
    const rng = new Rng(7);
    for (const def of GROUPS) {
      for (let k = 0; k < 200; k++) {
        const n = groupSize(rng, def);
        expect(n).toBeGreaterThanOrEqual(def.size[0]);
        expect(n).toBeLessThanOrEqual(def.size[1]);
      }
    }
  });

  it('같은 시드는 같은 구성 — 결정론', () => {
    const seq = (): string[] => {
      const rng = new Rng(31);
      return Array.from({ length: 50 }, () => pickGroup(rng, 'summer').id);
    };
    expect(seq()).toEqual(seq());
  });
});

describe('손님이 일행으로 들어온다', () => {
  const store = (): GuestStore => {
    const t = lawn();
    const p = new PlacementGrid(40, 32);
    const g = new GuestStore(t, new WallGrid(40, 32), p, GATE, GUEST_DEFAULTS);
    g.invalidate();
    return g;
  };

  it('연속으로 들어온 손님들이 같은 일행이다 — 한 명씩 흩어지면 무리가 안 보인다', () => {
    const g = store();
    const rng = new Rng(101);
    const spawned = Array.from({ length: 12 }, () => g.spawn(rng, 'summer')).filter(
      (x) => x !== null,
    );
    expect(spawned.length).toBe(12);
    // 같은 party 값이 2명 이상인 묶음이 있어야 한다
    const counts = new Map<number, number>();
    for (const s of spawned) counts.set(s.party, (counts.get(s.party) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(2);
    // 한 일행은 같은 유형이다
    const byParty = new Map<number, Set<string>>();
    for (const s of spawned) {
      if (!byParty.has(s.party)) byParty.set(s.party, new Set());
      (byParty.get(s.party) as Set<string>).add(s.group);
    }
    for (const kinds of byParty.values()) expect(kinds.size).toBe(1);
  });

  it('일행 인원이 유형의 범위를 지킨다', () => {
    const g = store();
    const rng = new Rng(202);
    const parties = new Map<number, { n: number; id: string }>();
    for (let k = 0; k < 40; k++) {
      const s = g.spawn(rng, 'summer');
      if (!s) break;
      const cur = parties.get(s.party) ?? { n: 0, id: s.group };
      cur.n += 1;
      parties.set(s.party, cur);
    }
    for (const [party, info] of parties) {
      // 마지막 일행은 상한에 걸려 잘릴 수 있다 — 그건 정상이다
      if (party === Math.max(...parties.keys())) continue;
      const def = groupDef(info.id as (typeof GROUPS)[number]['id']);
      expect(info.n, info.id).toBeGreaterThanOrEqual(def.size[0]);
      expect(info.n, info.id).toBeLessThanOrEqual(def.size[1]);
    }
  });

  it('통계가 유형별 인원을 낸다', () => {
    const g = store();
    const rng = new Rng(303);
    for (let k = 0; k < 30; k++) g.spawn(rng, 'summer');
    const st = g.stats();
    const sum = st.byGroup.family + st.byGroup.couple + st.byGroup.friends + st.byGroup.company;
    expect(sum).toBe(st.alive);
    expect(st.alive).toBe(30);
  });
});

describe('유형이 결과를 바꾼다 — 이름표가 아니어야 한다', () => {
  /** 시설 하나만 놓고 한 주를 돌린다 — 그 시설이 어느 유형에 맞는지가 드러난다 */
  const weekWith = (defId: string, season: Season, seed: number): ReturnType<WeekRunner['run']> => {
    const t = lawn();
    const w = new WallGrid(40, 32);
    const p = new PlacementGrid(40, 32);
    for (let k = 0; k < 6; k++) p.place(t, w, GATE, defId, 6 + k * 3, 8);
    const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
    g.invalidate();
    return new WeekRunner(t, p, g).run(new Rng(seed), { season });
  };

  it('지갑 배율이 요금 계산으로 실제로 흐른다', () => {
    /*
     * ⚠ 계절별 "손님 1명당 매출"로 비교하면 안 된다 — **혼잡에 오염된다.** 겨울은 안
     * 붐벼서 손님이 이용을 다 끝내고 가고, 여름은 줄을 서다 못 채우고 나간다. 실측으로
     * 겨울 객단가가 여름의 1.8배로 나와, 지갑 효과가 반대로 보였다.
     *
     * 그래서 요금 경로를 **직접** 잰다: 이용을 마친 손님의 지갑 합 / 인원.
     * 전 유형의 지갑이 1.0 이상이고 가족만 1.0 이므로, 섞인 인구에서는 1 보다 커야 한다.
     */
    const t = lawn();
    const w = new WallGrid(40, 32);
    const p = new PlacementGrid(40, 32);
    for (let k = 0; k < 6; k++) p.place(t, w, GATE, 'shop', 6 + k * 3, 8);
    const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
    g.invalidate();
    const rng = new Rng(515);
    for (let k = 0; k < 40; k++) g.spawn(rng, 'summer');
    for (let tick = 0; tick < 400; tick++) g.tick(rng);
    const fin = g.takeFinished();
    expect(fin.count).toBeGreaterThan(5);
    const avgWallet = fin.walletSum / fin.count;
    expect(avgWallet).toBeGreaterThan(1); // 가족만 1.0 — 섞였으면 1 초과
    expect(avgWallet).toBeLessThanOrEqual(1.4); // 최고 지갑(친구)을 넘을 수 없다
    // 가져간 뒤에는 비워진다 — 안 비우면 요금이 매 tick 누적으로 부풀어 오른다
    expect(g.takeFinished().count).toBe(0);
  });

  it('일행 구성이 시드에 따라 달라지고, 그게 결과를 흔든다', () => {
    const a = weekWith('shop', 'summer', 1);
    const b = weekWith('shop', 'summer', 2);
    expect(a.revenue).not.toBe(b.revenue);
  });

  it('같은 시드는 같은 결과 — 그룹을 넣어도 결정론이 유지된다', () => {
    expect(weekWith('shop', 'summer', 77).revenue).toBe(weekWith('shop', 'summer', 77).revenue);
  });
});
