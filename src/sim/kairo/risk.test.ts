import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, GUEST_DEFAULTS } from './guests.js';
import { assessRisk, accidentChance, RISK_LEVELS, RISK_NAMES } from './risk.js';

const GATE = { i: 0, j: 0 };

function world(size = 30): {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
} {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) t.paint(i, j, j >= size - 10 ? 'water_edge' : 'lawn');
  }
  const w = new WallGrid(size, size);
  const p = new PlacementGrid(size, size);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  return { t, w, p, g };
}

describe('위험도는 상시 표시된다 — 순수 확률이면 억울하다', () => {
  it('4단계이고 전부 이름이 있다', () => {
    expect(RISK_LEVELS).toEqual(['safe', 'watch', 'caution', 'danger']);
    for (const l of RISK_LEVELS) expect(RISK_NAMES[l].length).toBeGreaterThan(0);
  });

  it('아무것도 없으면 안전이다', () => {
    const { p, g } = world();
    const r = assessRisk(p, g);
    expect(r.level).toBe('safe');
    expect(r.ratio).toBe(0);
    expect(r.accidentPossible).toBe(false);
  });

  it('안전 단계에서는 사고 확률이 0 이다 — 안전한데 사고가 나면 억울하다', () => {
    const { p, g } = world();
    expect(accidentChance(assessRisk(p, g))).toBe(0);
  });

  it('스릴 시설만 늘리면 위험도가 올라간다', () => {
    const { t, w, p, g } = world();
    // 물가에서 덱을 뻗고 인플레이터블을 붙인다
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    const before = assessRisk(p, g).level;
    for (const [i, j] of [
      [6, 21],
      [6, 24],
    ] as const) {
      p.place(t, w, GATE, 'trampoline_w', i, j);
    }
    const after = assessRisk(p, g);
    expect(RISK_LEVELS.indexOf(after.level)).toBeGreaterThanOrEqual(
      RISK_LEVELS.indexOf(before),
    );
    expect(after.riskPoints).toBeGreaterThan(0);
  });

  it('안전 시설을 지으면 위험도가 내려간다 — 구명함을 왜 짓나에 대한 답', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    p.place(t, w, GATE, 'trampoline_w', 6, 24);
    const risky = assessRisk(p, g);
    expect(risky.level).not.toBe('safe');
    expect(risky.safetyNeeded).toBeGreaterThan(0);

    // 필요한 만큼 구명함을 짓는다
    let built = 0;
    for (let i = 2; i < 20 && built < risky.safetyNeeded + 2; i++) {
      if (p.place(t, w, GATE, 'lifering', i, 3).ok) built++;
    }
    const safer = assessRisk(p, g);
    expect(safer.ratio).toBeLessThan(risky.ratio);
    expect(RISK_LEVELS.indexOf(safer.level)).toBeLessThan(RISK_LEVELS.indexOf(risky.level));
  });

  it('안전 시설이 몇 개 더 필요한지 알려준다 — 그게 다음 목표가 된다', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'airbounce', 8, 20);
    const r = assessRisk(p, g);
    if (r.level !== 'safe') {
      expect(r.safetyNeeded).toBeGreaterThan(0);
      expect(Number.isInteger(r.safetyNeeded)).toBe(true);
    }
  });

  it('손님이 많으면 위험도가 올라간다 — 혼잡도 요인', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    // 안전 시설을 충분히 둬야 비율이 1 로 포화되지 않는다 — 안전 0 이면 비율은 항상 1 이다
    for (let i = 2; i < 8; i++) p.place(t, w, GATE, 'lifering', i, 3);
    const empty = assessRisk(p, g).ratio;
    expect(empty).toBeLessThan(1);
    const rng = new Rng(1);
    for (let k = 0; k < 30; k++) g.spawn(rng);
    expect(assessRisk(p, g).ratio).toBeGreaterThan(empty);
  });

  it('안전 시설이 하나도 없으면 비율이 1 로 포화된다 — 최대 위험이 맞다', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    const r = assessRisk(p, g);
    expect(r.safetyPoints).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.level).toBe('danger');
  });

  it('사고 확률은 경계·위험 단계에서만 0 보다 크다', () => {
    for (const level of RISK_LEVELS) {
      const fake = {
        level,
        ratio: level === 'danger' ? 0.9 : 0.5,
        riskPoints: 10,
        safetyPoints: 1,
        safetyNeeded: 1,
        accidentPossible: level === 'caution' || level === 'danger',
      };
      const c = accidentChance(fake);
      if (level === 'safe' || level === 'watch') expect(c, level).toBe(0);
      else expect(c, level).toBeGreaterThan(0);
    }
  });

  it('위험 단계라도 확률이 주당 5% 를 넘지 않는다 — RNG 세금이 되면 안 된다', () => {
    const worst = accidentChance({
      level: 'danger',
      ratio: 1,
      riskPoints: 100,
      safetyPoints: 0,
      safetyNeeded: 9,
      accidentPossible: true,
    });
    expect(worst).toBeLessThanOrEqual(0.05);
  });
});
