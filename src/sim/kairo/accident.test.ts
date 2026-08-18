import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import { WeekRunner } from './week.js';
import { assessRisk, accidentChance } from './risk.js';
import { triggerCard, CardStore } from './cards.js';

/**
 * 사고 (§12.1) — **위험 단계에서만, 그리고 플레이어의 선택으로 끝난다.**
 *
 * v4 결정: "안전도 78인데 RNG 로 폐쇄"는 억울하다. 실패는 내 선택 때문이어야 한다.
 * 그래서 위험도를 상시 표시하고, 사고는 위험 단계에서만 나고, 사고 뒤에도 선택이 있다.
 */

const GATE = { i: 2, j: 2 };

function park(defId: string, n: number): {
  t: KairoTerrain;
  p: PlacementGrid;
  g: GuestStore;
} {
  const t = new KairoTerrain(40, 32);
  for (let i = 0; i < 40; i++) for (let j = 0; j < 32; j++) t.paint(i, j, 'path_stone');
  const w = new WallGrid(40, 32);
  const p = new PlacementGrid(40, 32);
  for (let k = 0; k < n; k++) p.place(t, w, GATE, defId, 6 + (k % 8) * 3, 8 + Math.floor(k / 8) * 3);
  const g = new GuestStore(t, w, p, GATE, OPEN_GATE_DEFAULTS);
  g.invalidate();
  return { t, p, g };
}

describe('사고는 위험할 때만 난다', () => {
  it('안전한 공원은 확률이 0 이다 — RNG 세금을 안 만든다', () => {
    const { p, g } = park('lifering', 6); // 안전 시설만
    const risk = assessRisk(p, g);
    expect(risk.accidentPossible).toBe(false);
    expect(accidentChance(risk)).toBe(0);
  });

  it('확률이 0 이면 100주를 돌려도 사고가 없다', () => {
    const f = park('shop', 6);
    const runner = new WeekRunner(f.t, f.p, f.g);
    let hits = 0;
    for (let k = 0; k < 100; k++) {
      if (runner.run(new Rng(k), { season: 'summer', accidentChance: 0 }).accident) hits++;
    }
    expect(hits).toBe(0);
  });

  it('확률이 있으면 사고가 나고, 시설 하나가 1~3주 닫힌다', () => {
    const f = park('shop', 6);
    const runner = new WeekRunner(f.t, f.p, f.g);
    let hits = 0;
    const weeks: number[] = [];
    for (let k = 0; k < 200; k++) {
      const rep = runner.run(new Rng(k), { season: 'summer', accidentChance: 0.5 });
      if (rep.accident) {
        hits++;
        weeks.push(rep.accident.weeks);
        expect(f.p.all().some((x) => x.handle === rep.accident!.handle)).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(60);
    expect(hits).toBeLessThan(140);
    expect(Math.min(...weeks)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...weeks)).toBeLessThanOrEqual(3);
  });

  it('사고가 난 주는 그 시설이 서서 매출이 줄어든다', () => {
    const f1 = park('shop', 6);
    const f2 = park('shop', 6);
    const clean = new WeekRunner(f1.t, f1.p, f1.g).run(new Rng(7), {
      season: 'summer',
      accidentChance: 0,
    });
    const hurt = new WeekRunner(f2.t, f2.p, f2.g).run(new Rng(7), {
      season: 'summer',
      accidentChance: 1,
    });
    expect(hurt.accident).not.toBeNull();
    expect(hurt.revenue).toBeLessThan(clean.revenue);
  });

  it('같은 시드는 같은 사고 — 결정론', () => {
    const a = park('shop', 6);
    const b = park('shop', 6);
    const x = new WeekRunner(a.t, a.p, a.g).run(new Rng(99), { season: 'summer', accidentChance: 0.6 });
    const y = new WeekRunner(b.t, b.p, b.g).run(new Rng(99), { season: 'summer', accidentChance: 0.6 });
    expect(x.accident).toEqual(y.accident);
  });
});

describe('사고 대응 카드 (§12.1)', () => {
  const card = triggerCard('accident_response')!;

  it('선택지가 셋이고 어느 쪽도 편하지 않다', () => {
    expect(card.options.length).toBe(3);
    // 돈을 안 내는 쪽은 평판을 크게 잃는다
    const legal = card.options.find((o) => o.label.includes('법적'))!;
    expect(legal.effects.some((e) => (e.reputationDelta ?? 0) <= -0.3)).toBe(true);
    // 돈을 내는 쪽은 실제로 나간다
    const settle = card.options.find((o) => o.label.includes('보상'))!;
    expect(settle.effects.some((e) => (e.cash ?? 0) < 0)).toBe(true);
  });

  it('전면 점검은 비싸고 한 주 쉬지만 이후 사고율이 준다', () => {
    const audit = card.options.find((o) => o.label.includes('점검'))!;
    expect(audit.effects.some((e) => e.closed && (e.weeks ?? 1) === 1)).toBe(true);
    expect(audit.effects.some((e) => (e.accidentMult ?? 1) < 1)).toBe(true);
  });

  it('선택하면 효과가 실제로 적용된다', () => {
    const st = new CardStore();
    const audit = card.options.findIndex((o) => o.label.includes('점검'));
    const r = st.choose(new Rng(1), card, audit);
    expect(r.cash).toBeLessThan(0);
    expect(st.modifiers().accidentMult).toBeLessThan(1);
    expect(st.modifiers().closed).toBe(true);
  });

  it('금액이 우리 경제 축척이다 — 사고 한 번이 곧 파산이면 억울한 실패다', () => {
    for (const o of card.options) {
      for (const e of o.effects) {
        expect(Math.abs(e.cash ?? 0)).toBeLessThan(3_000_000);
      }
    }
  });
});
