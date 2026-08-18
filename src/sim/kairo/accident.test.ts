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

  /*
   * **시드 하나로 재면 안 된다** (2026-08-19).
   *
   * 원래 이 검사는 시드 7 한 판을 사고 유무로 비교했다. 두 가지가 틀렸다:
   *
   * ① 사고 판정이 **공유 rng** 에서 뽑고 있어서, 사고가 나면 뽑기 3회만큼 그 뒤의
   *    날씨 시퀀스가 통째로 밀렸다 — 비교 대상이 애초에 같은 주가 아니었다.
   *    불변식 2 가 `fork` 를 요구하는 이유가 정확히 이것이고, `week.ts` 에서 고쳤다.
   * ② 스트림을 맞춘 뒤에도 **한 시드로는 방향이 뒤집힌다**: 매점 하나가 서면 손님이
   *    남은 매점으로 몰리는데, 줄이 짧던 판에서는 그 재분배가 오히려 회전을 올린다.
   *    실측 12시드 중 2시드가 그랬다 (시드 7 이 그중 하나였다 — 우연히 통과하던 것이
   *    버스 위상이 한 tick 바뀌자 드러났다, K36-B③).
   *
   * 그래서 원래 주장 그대로 **합계로** 잰다. 실측 12시드 합계 2,426,680 → 2,122,368
   * (−12.5%). 방향이 뒤집히거나 차이가 사라지면 사고가 무해해진 것이다.
   */
  it('사고가 난 주들은 그 시설이 서서 매출이 줄어든다 — 12시드 합계', () => {
    let clean = 0;
    let hurt = 0;
    let lower = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const f1 = park('shop', 6);
      const f2 = park('shop', 6);
      const c = new WeekRunner(f1.t, f1.p, f1.g).run(new Rng(seed), {
        season: 'summer',
        accidentChance: 0,
      });
      const h = new WeekRunner(f2.t, f2.p, f2.g).run(new Rng(seed), {
        season: 'summer',
        accidentChance: 1,
      });
      expect(h.accident).not.toBeNull();
      expect(c.accident).toBeNull();
      clean += c.revenue;
      hurt += h.revenue;
      if (h.revenue < c.revenue) lower++;
    }
    expect(hurt).toBeLessThan(clean);
    // 다수에서 낮아야 한다 — 합계만 보면 한 시드의 큰 차이로도 통과한다
    expect(lower).toBeGreaterThanOrEqual(8);
  });

  it('사고 판정은 독립 스트림이다 — 사고 유무가 그 주의 나머지를 밀지 않는다', () => {
    /*
     * **음성 대조군이 곧 이 검사다.** `accidentChance: 0` 인 판은 사고 확률을 켠 판이
     * 뽑기를 몇 번 하든 **한 글자도 달라지면 안 된다**. 공유 rng 에서 뽑던 시절에는
     * 여기가 어긋났고, 그 어긋남이 위 검사를 조용히 무의미하게 만들고 있었다.
     */
    const a = park('shop', 6);
    const b = park('shop', 6);
    const base = new WeekRunner(a.t, a.p, a.g).run(new Rng(7), {
      season: 'summer',
      accidentChance: 0,
    });
    const same = new WeekRunner(b.t, b.p, b.g).run(new Rng(7), {
      season: 'summer',
      // 확률은 켰지만 0 이라 사고는 안 난다 — 뽑기만 일어난다
      accidentChance: 0.0000001,
    });
    expect(same.accident).toBeNull();
    expect(same.revenue).toBe(base.revenue);
    expect(same.visitors).toBe(base.visitors);
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
