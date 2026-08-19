/**
 * K40 온보딩 검사 — **첫 세션이 실패로 읽히면 안 된다.**
 *
 * UX 검수 실측 (docs/design-ux-audit.md §2·3): 시작 킷이 매표소+데크뿐이라 이용할
 * 시설이 0 → 무행동 8주 내내 퇴장 만족도 0 · 헛걸음 주당 ~100명. 26·52주 밸런싱
 * 경보가 이걸 못 잡은 이유는 그 검사가 봇이 짓는 중반 성장만 보기 때문이다 —
 * 그래서 초반 전용 검사를 따로 둔다 (스펙 §5-2·A3).
 *
 * 문턱은 첫 세션(1~2주차)에만 건다. 무행동 한 달이 나빠 보이는 것(3주차~)은 버그가
 * 아니라 "지어야 한다"는 신호다 — 실측으로 날씨 구성이 나쁜 주는 만족이 한 자리까지
 * 떨어지는데, 그건 밸런스 노이즈이지 온보딩 실패가 아니다.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import { GuestStore } from './guests.js';
import { WeekRunner } from './week.js';
import { applyStartKit } from './startkit.js';
import { CourseStore } from './course.js';
import { MAP_TYPES, type MapType } from './scenario.js';
import { bakeIndoorWalls } from './indoor.js';
import { ProgressStore, questStatuses } from './progress.js';

function freshGame(map: MapType, seed: number) {
  const W = KairoTerrain.WIDTH;
  const H = KairoTerrain.HEIGHT;
  const terrain = KairoTerrain.generate(W, H, new Rng(seed), {
    landRatio: map.landRatio,
    shoreJitter: map.shoreJitter,
  });
  const walls = new WallGrid(W, H);
  const placement = new PlacementGrid(W, H);
  const gate = KairoTerrain.parkGate();
  const courses = new CourseStore();
  const kit = applyStartKit({ terrain, walls, placement, gate, map, courses });
  bakeIndoorWalls(terrain, walls, gate, guestWalkable(terrain, placement));
  const guests = new GuestStore(terrain, walls, placement, gate);
  guests.invalidate();
  return { runner: new WeekRunner(terrain, placement, guests), placement, kit };
}

describe('온보딩 — 무행동 첫 세션', () => {
  it('시작 킷에 놀 것과 쉴 것이 있다 (맵 3종 전부, 생략 0)', () => {
    for (const map of MAP_TYPES) {
      const { kit } = freshGame(map, 20260819);
      expect(kit.skipped, map.id).toEqual([]);
      // 매표소 + 탁구대 + 평상 최소 — 데크는 지형에 따라 다르다
      expect(kit.facilities, map.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('무행동 첫 두 주가 실패로 안 읽힌다 — 12조합 합계 (한 시드로 재지 않는다)', () => {
    /*
     * 주 2부터는 시드 노이즈가 ±20 이다 (실측: 평상 하나를 더했더니 한 시드는 7→1,
     * 다른 시드는 개선). 개별 문턱은 미래의 무해한 변경마다 깨진다 — 이 저장소의
     * 규칙대로 합계로 잰다. 실측 기준(2026-08-19): w1 평균 41.4 · 최소 27.7,
     * w2 평균 18.7 · 최소 4.4, 헛걸음 최대 8%.
     */
    const w1s: number[] = [];
    const w2s: number[] = [];
    let gaveUp = 0;
    let visitors = 0;
    for (const map of MAP_TYPES) {
      for (const seed of [20260819, 42, 7, 555]) {
        const { runner } = freshGame(map, seed);
        const tag = `${map.id}/${seed}`;
        const w1 = runner.run(new Rng(seed * 7 + 1), { season: 'summer' });
        const w2 = runner.run(new Rng(seed * 7 + 2), { season: 'summer' });
        w1s.push(w1.exitSatisfaction);
        w2s.push(w2.exitSatisfaction);
        for (const [i, w] of [w1, w2].entries()) {
          gaveUp += w.gaveUp;
          visitors += w.visitors;
          // 개별 주는 노이즈가 크다 — 상한만 느슨하게, 본 판정은 합계로
          expect(w.gaveUp, `${tag} ${i + 1}주 헛걸음`).toBeLessThan(
            Math.max(1, w.visitors) * 0.4,
          );
        }
      }
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    // 첫 화면(1주차): 어떤 조합에서도 만족 ≥ 25, 평균 ≥ 35
    expect(Math.min(...w1s), '1주 최소').toBeGreaterThanOrEqual(25);
    expect(mean(w1s), '1주 평균').toBeGreaterThanOrEqual(35);
    // 2주차: 평균이 두 자리를 지키고, 0(예전의 구조적 실패)으로는 절대 안 돌아간다
    expect(mean(w2s), '2주 평균').toBeGreaterThanOrEqual(12);
    expect(Math.min(...w2s), '2주 최소').toBeGreaterThan(0);
    // 헛걸음: 전체의 20% 미만 (예전엔 ~100%)
    expect(gaveUp / Math.max(1, visitors), '헛걸음 합계 비율').toBeLessThan(0.2);
  });

  it('첫 보상이 첫 결산에 도착한다 — 항상 무언가를 향해 (A3)', () => {
    /*
     * 물려받은 데크(물 위로 3/3)가 첫 결산에서 의뢰 보상으로 확정된다. 플레이어가
     * 아무것도 몰라도 "한 주 → 보상" 회로를 5.6분(흐름 기준) 안에 한 번 본다.
     */
    for (const map of MAP_TYPES) {
      const { runner, placement } = freshGame(map, 20260819);
      const rep = runner.run(new Rng(11), { season: 'summer' });
      const progress = new ProgressStore();
      const claim = progress.claim(
        questStatuses(placement, {
          visitors: rep.visitors,
          turnedAway: rep.turnedAway,
          profit: rep.profit,
          exitSatisfaction: rep.exitSatisfaction,
        }),
      );
      expect(claim.ids.length, map.id).toBeGreaterThan(0);
      expect(claim.cash, map.id).toBeGreaterThan(0);
    }
  });
});
