import { describe, it, expect } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';
import { GuestStore, OPEN_GATE_DEFAULTS } from './guests.js';
import {
  assessRisk,
  accidentChance,
  facilityRiskWeights,
  MIN_RISK_WEIGHT,
  setAccidentTargetFaultForTest,
  RISK_LEVELS,
  RISK_NAMES,
} from './risk.js';

const GATE = { i: 0, j: 0 };

function world(size = 30): {
  t: KairoTerrain;
  w: WallGrid;
  p: PlacementGrid;
  g: GuestStore;
} {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) t.paint(i, j, j >= size - 10 ? 'water_edge' : 'path_stone');
  }
  const w = new WallGrid(size, size);
  const p = new PlacementGrid(size, size);
  /*
   * ⚠ **매표소 경유를 끈 판**(`OPEN_GATE_DEFAULTS`)으로 잰다. 기본값은 `requireTicket`
   * 이라 `spawn` 한 손님이 정류장에 선 `'arriving'` 상태로 남는데, 위험도의 노출은
   * **공원 안 인원**(`guests.inside`)을 본다 (K47-④) — 그 판에서는 60명을 뽑아도
   * 노출이 0 이라 검사가 **공허하게** 통과한다. 여기서 재려는 것은 입장 수속이 아니라
   * "붐비면 위험이 오른다"이므로, 손님이 실제로 공원 안에 있는 판에서 잰다.
   */
  const g = new GuestStore(t, w, p, GATE, OPEN_GATE_DEFAULTS);
  return { t, w, p, g };
}

/**
 * 손님을 채워 **노출을 1 로** 만든다.
 *
 * 2026-08-20 이전에는 손님 0 명으로도 `위험` 이 떴고, 아래 검사들이 그 상태를 그대로
 * 못박고 있었다 — "지었다"만으로 최고 단계가 되는 것이 곧 고친 버그다. 검사가 보려던
 * 성질(스릴↑ → 위험↑ · 안전↑ → 위험↓)은 그대로이므로, **노출만** 채워 준다.
 */
function crowd(g: GuestStore, n = 60): void {
  const rng = new Rng(4242);
  for (let k = 0; k < n; k++) g.spawn(rng);
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
    crowd(g);
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
    crowd(g);
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
    crowd(g);
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'airbounce', 8, 20);
    const r = assessRisk(p, g);
    // ⚠ `if (r.level !== 'safe')` 가드였다 — 안전이면 아무것도 안 재는 검사가 된다
    expect(r.level).not.toBe('safe');
    expect(r.safetyNeeded).toBeGreaterThan(0);
    expect(Number.isInteger(r.safetyNeeded)).toBe(true);
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

  it('안전 시설이 하나도 없고 손님이 차면 비율이 1 로 포화된다 — 최대 위험이 맞다', () => {
    const { t, w, p, g } = world();
    // ⚠ 손님을 채운다. 예전엔 손님 0 명으로도 이 단정이 통과했고, 그게 버그였다
    crowd(g);
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    const r = assessRisk(p, g);
    expect(r.safetyPoints).toBe(0);
    expect(r.exposure).toBe(1);
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
        exposure: 1,
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
      exposure: 1,
      safetyNeeded: 9,
      accidentPossible: true,
    });
    expect(worst).toBeLessThanOrEqual(0.05);
  });
});

/**
 * 노출 (2026-08-20) — **아무도 없는 빠지는 위험하지 않다.**
 *
 * 실측한 버그: 새 판(맵 3종 × 시드 3개)이 손님 0 명에 `ratio 1 · danger ·
 * 사고 4%/주` 였다. 시작 킷의 탁구대(`play`, 정원 2) 하나가 위험 점수 2 를 만들고,
 * 안전 점수가 0 이라 `2/(2+0) = 1` 로 포화됐기 때문이다 — 비율은 **배율에 불변**이라
 * 규모를 못 본다.
 *
 * 아래 둘은 짝이다. 하나만 두면 반쪽이 조용히 깨진다:
 *   ① 손님 0 → 안전 (거짓 경보가 사라졌나)
 *   ② 안전 시설 0 + 스릴 + 손님 다수 → 여전히 위험 (**음성 대조군** — 경보를 없앤 게 아니다)
 */
describe('위험은 노출이 있어야 성립한다', () => {
  it('① 새 판은 안전이다 — 손님이 0 이면 다칠 사람이 없다', () => {
    const { t, w, p, g } = world();
    // 시작 킷이 물려주는 것: 매표소·덱·선착장·탁구대·평상 (위험은 탁구대뿐)
    for (let j = 20; j < 23; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'pingpong', 8, 5);
    p.place(t, w, GATE, 'pyeongsang_row', 10, 5);
    const r = assessRisk(p, g);
    expect(g.count).toBe(0);
    // 지은 것은 그대로 보고한다 — 노출만 0 이다
    expect(r.riskPoints).toBeGreaterThan(0);
    expect(r.exposure).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.level).toBe('safe');
    expect(r.accidentPossible).toBe(false);
    expect(accidentChance(r)).toBe(0);
  });

  it('② 음성 대조군 — 안전 시설 없이 스릴 + 손님이 많으면 여전히 위험이다', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    p.place(t, w, GATE, 'trampoline_w', 6, 24);
    // 손님이 없을 때는 안전 …
    expect(assessRisk(p, g).level).toBe('safe');
    // … 차면 위험이다. 경보 축은 그대로다
    crowd(g);
    const r = assessRisk(p, g);
    expect(r.exposure).toBe(1);
    expect(r.level).toBe('danger');
    expect(accidentChance(r)).toBeGreaterThan(0);
  });

  it('노출은 손님 수에 따라 오르고 1 에서 멈춘다', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'airbounce', 8, 20);
    const seen: number[] = [];
    for (const n of [0, 10, 20, 40, 60]) {
      crowd(g, n - g.count);
      seen.push(assessRisk(p, g).exposure);
    }
    expect(seen).toEqual([0, 0.25, 0.5, 1, 1]);
    // 노출이 1 에 닿은 뒤로는 예전 계산 그대로여야 한다
    expect(assessRisk(p, g).ratio).toBe(1);
  });

  it('노출은 처방을 흔들지 않는다 — riskPoints 는 지은 것만의 값이다', () => {
    const { t, w, p, g } = world();
    for (let j = 20; j < 26; j++) p.place(t, w, GATE, 'float_deck', 5, j);
    p.place(t, w, GATE, 'trampoline_w', 6, 21);
    const dry = assessRisk(p, g).riskPoints;
    crowd(g, 8);
    // 혼잡 가산(+0.25/명)만 붙는다 — 노출이 점수를 깎지 않는다
    expect(assessRisk(p, g).riskPoints).toBe(dry + 8 * 0.25);
  });
});

/**
 * ── Q1: 사고는 **위험한 곳에서** 난다 ───────────────────────────────────────
 *
 * ⚠ 이 절이 생긴 이유는 실측이다 (2026-08-28): `week.ts` 가 사고 시설을 **놓인 것
 * 전체에서 균일 무작위**로 골라서, 슬라이드 옆에 구명함을 지어도 화장실이 닫힐 확률이
 * 똑같았다. 「내가 한 일」과 「일어난 일」이 안 이어졌고, 그것이 사용자가 말한
 * *"뭐가 많지만 연결되어 있다는 느낌이 안 든다"* 의 기계적 정체였다.
 */
describe('Q1 — 사고 대상 가중치', () => {
  it('위험하지 않은 시설은 대상이 아니다 (가중치 0)', () => {
    const { t, w, p } = world();
    expect(p.place(t, w, GATE, 'pyeongsang_row', 2, 2).ok).toBe(true);
    expect(p.place(t, w, GATE, 'pingpong', 6, 2).ok).toBe(true);
    const weights = facilityRiskWeights(p);
    const byDef = new Map(weights.map((x) => [x.defId, x.weight]));
    expect(byDef.get('pyeongsang_row')).toBe(0);
    expect(byDef.get('pingpong') ?? 0).toBeGreaterThan(0);
  });

  it('안전 시설 자신도 대상이 아니다', () => {
    const { t, w, p } = world();
    p.place(t, w, GATE, 'lifering', 2, 2);
    expect(facilityRiskWeights(p).every((x) => x.weight === 0)).toBe(true);
  });

  it('★ 안전 시설이 붙으면 그 시설의 가중치가 내려간다 — 그리고 0 은 안 된다', () => {
    const near = (() => {
      const { t, w, p } = world();
      p.place(t, w, GATE, 'pingpong', 6, 6);
      // ⚠ `pingpong` 은 2×1 이라 (7,6) 은 이미 점유다 — (8,6) 이 맨해튼 2, 반경 안이다
      expect(p.place(t, w, GATE, 'lifering', 8, 6).ok).toBe(true);
      return facilityRiskWeights(p).find((x) => x.defId === 'pingpong')?.weight ?? 0;
    })();
    const far = (() => {
      const { t, w, p } = world();
      p.place(t, w, GATE, 'pingpong', 6, 6);
      expect(p.place(t, w, GATE, 'lifering', 18, 6).ok).toBe(true); // 멀다 (맨해튼 12)
      return facilityRiskWeights(p).find((x) => x.defId === 'pingpong')?.weight ?? 0;
    })();
    expect(near).toBeLessThan(far);
    /*
     * ⚠ **0 이 되면 안 된다.** 구명함 하나로 그 시설이 영원히 안전해지면 위험 축이
     * 다시 죽는다 — 「포화 곡선으로 두고 하드 상한을 쓰지 말 것」(P2-A)과 같은 이유다.
     */
    expect(near).toBeGreaterThanOrEqual(MIN_RISK_WEIGHT);
  });

  it('⚠ 음성 대조군 — `uniform` 을 켜면 전부 같은 가중치가 된다 (예전 동작)', () => {
    const { t, w, p } = world();
    p.place(t, w, GATE, 'pyeongsang_row', 2, 2);
    p.place(t, w, GATE, 'pingpong', 6, 2);
    setAccidentTargetFaultForTest('uniform');
    try {
      const weights = facilityRiskWeights(p);
      expect(weights.every((x) => x.weight === 1)).toBe(true);
      // 대조군에서는 「위험한 것이 더 자주 뽑힌다」가 성립하지 않는다
      expect(new Set(weights.map((x) => x.weight)).size).toBe(1);
    } finally {
      setAccidentTargetFaultForTest(null);
    }
  });

  it('가중치는 `assessRisk` 와 같은 식을 쓴다 — 정원이 오르면 가중치도 오른다', () => {
    const { t, w, p } = world();
    const placed = p.place(t, w, GATE, 'pingpong', 6, 6);
    const before = facilityRiskWeights(p)[0]?.weight ?? 0;
    if (placed.ok && placed.placed) {
      // 회전 특화는 정원을 올린다 — 위험 축에서는 벌점이어야 한다 (`assessRisk` 주석)
      p.upgrade(placed.placed.handle);
      p.upgrade(placed.placed.handle);
      p.chooseSpecialty(placed.placed.handle, 'capacity');
    }
    const after = facilityRiskWeights(p)[0]?.weight ?? 0;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
