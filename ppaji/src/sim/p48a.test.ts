import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from './game.js';
import { runBot } from './bot.js';
import { Grid, FLOOR, isWaterCode, shoreRow } from './grid.js';
import { goalNum } from '../../tools/goal-num.js';
import { makeTestPpaji } from './test-helpers.js';
import { readdirSync } from 'node:fs';

/** P48-a 동작 0 리팩터 ① — 자연 바닥 평면 · `riverFloorFor` 삭제 · 포장을 암반 뒤로 · 자연 바닥으로 복원 */
const fnv = (a: Uint8Array): number => { let h = 2166136261; for (let i = 0; i < a.length; i++) { h ^= a[i] as number; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
/** 삭제 전 원본(`src/sim/grid.ts:76`, 2026-09-07) — production 에 자가 대조 대상을 남기지 않는다 */

describe('P48-a 자연 바닥 평면', () => {
  it('★ 바닥·단 배열이 골든 3시드×16일 전 구간에서 fixture 와 바이트 동일 — P48-a 는 변경 전과 대조해 「동작 0」을 증명했고(통과), P48-b1 부터는 지형 회귀 방어(굽이가 든 fixture 를 페이즈마다 사유와 함께 다시 뜬다) · P57-i·P58-a(2026-09-15) 재생성: 단 배열 3시드 동일, 바닥만 3일차부터 — 유입 재조정·킷 식탁으로 봇 건설 순서가 바뀐 몫 · P60-a(2026-09-18) 재생성: 소품 삭제로 봇 지출 순서가 바뀐 몫(단 배열 동일) · P60-b 재생성: 기구 배고픔으로 매점 매출·지출 순서가 바뀐 몫 · P60-c 재생성: 세트 후보 우선·사슬 예약으로 봇 배치 순서(시드 1 바닥 4일차부터, 단 배열 동일) · P60-d 재생성: 입수구 거리 정렬로 봇 배치 순서', () => {
    const base = JSON.parse(readFileSync(new URL('./__fixtures__/p48a-floor.json', import.meta.url), 'utf8')) as Record<string, { floor: number[]; levels: number[] }>;
    for (const seed of [1, 2, 3]) {
      const g = new Game(seed); const fl: number[] = [fnv(g.grid.floor)], lv: number[] = [fnv(g.grid.levels)];
      for (let d = 0; d < 16; d++) { runBot(g, 1); fl.push(fnv(g.grid.floor)); lv.push(fnv(g.grid.levels)); }
      expect(fl, `seed ${seed} floor`).toEqual(base[String(seed)]!.floor);
      expect(lv, `seed ${seed} levels`).toEqual(base[String(seed)]!.levels);
    }
  }, 120000);

  it('자연 물의 깊이 — 뭍에 4이웃한 물과 북안 둘째 줄은 여울, 나머지는 강 (P48-b3: 행 공식이 아니라 이웃으로)', () => {
    const g = Grid.newPark(0);
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i += 3) { const c = g.naturalAt(i, j); if (!isWaterCode(c)) continue; const land4 = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([a, b]) => g.inside(i + a, j + b) && !isWaterCode(g.naturalAt(i + a, j + b))); expect(c).toBe(land4 || j === shoreRow(i) + 1 ? FLOOR.shallow : FLOOR.river); }
  });

  it('자연 바닥은 포장 앞에 찍힌다 — 입구 열·물가 산책로의 자연 바닥은 잔디 (P57-h: 평지라 암반 0)', () => {
    const g = Grid.newPark(0);
    const gate = { i: 48, j: 8 };
    expect(g.at(gate.i, gate.j + 5)).toBe(FLOOR.path);
    expect(g.naturalAt(gate.i, gate.j + 5)).toBe(FLOOR.grass);
    let rockUnderPath = 0, rock = 0;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) { if (g.naturalAt(i, j) === FLOOR.rock) { rock++; if (g.at(i, j) === FLOOR.path) rockUnderPath++; } }
    expect(rock).toBe(0); // P57-h: 능선을 껐으니 자연 암반은 0 — 「암반 칸 위 포장의 자연 바닥은 암반」 규칙은 코드에 남아 있고(HILLS_ENABLED) 여기선 잴 대상이 없다
    void rockUnderPath;
  });

  it('길을 걷으면 그 자리의 자연 바닥으로 돌아간다 — 잔디 위 길은 잔디, 암반 위 길은 암반 (실버그 수정)', () => {
    const g = new Game(7);
    // 마당 안 잔디 한 칸에 길을 깔고 걷는다
    const t = { i: g.gate.i - 16, j: g.gate.j + 18 }; // P48-b3: 서쪽 잔디
    expect(g.grid.at(t.i, t.j)).toBe(FLOOR.grass);
    expect(g.paintPath([t]).ok).toBe(true);
    expect(g.unpaintPath([t]).ok).toBe(true);
    expect(g.grid.at(t.i, t.j)).toBe(FLOOR.grass);
    // 암반 자연 바닥 위에 길을 깔았다 걷으면 암반 (마당 안에 있으면)
    let found: { i: number; j: number } | null = null;
    for (let j = g.land.j0; j < g.land.j0 + g.land.h && !found; j++) for (let i = g.land.i0; i < g.land.i0 + g.land.w; i++) if (g.grid.naturalAt(i, j) === FLOOR.rock && g.grid.at(i, j) === FLOOR.rock && !g.facilities.occupied(i, j)) { found = { i, j }; break; }
    if (found) {
      expect(g.paintPath([found]).ok).toBe(true);
      expect(g.unpaintPath([found]).ok).toBe(true);
      expect(g.grid.at(found.i, found.j)).toBe(FLOOR.rock);
    }
  });

  it('스냅샷 왕복 — natural 이 실리고 되돌아온다 · 없는 옛 스냅샷은 newPark 의 자연 바닥으로 채운다', () => {
    const g = new Game(3); runBot(g, 2);
    const s = g.toSnapshot();
    expect(s.grid.natural?.length).toBe(g.grid.natural.length);
    const h = Game.fromSnapshot(s);
    expect(fnv(h.grid.natural)).toBe(fnv(g.grid.natural));
    const { natural: _dropped, ...gridNoNatural } = s.grid; void _dropped;
    const legacy = { ...s, grid: gridNoNatural };
    const k = Game.fromSnapshot(legacy);
    expect(fnv(k.grid.natural)).toBe(fnv(Grid.newPark(0).natural));
  });

  it('데크를 걷으면 수역이 자연 바닥(강·여울)으로 — 검사 헬퍼 makeTestPpaji 는 D22 대로 데크로 두른다', () => {
    const g = new Game(5);
    const { tiles, ring, id } = makeTestPpaji(g);
    expect(id).not.toBeNull();
    expect(tiles.every((t) => g.grid.at(t.i, t.j) === FLOOR.pool)).toBe(true);
    // 데크를 걷으면(오른쪽 변 한 칸 — 바깥이 트인 강) 밀폐가 풀려 안 물이 자연 바닥(강)으로 돌아간다 — 줄 공식이 아니라 natural 로
    const iMin = Math.min(...ring.map((r) => r.i)), jMin = Math.min(...ring.map((r) => r.j)); const side = ring.find((r) => r.i === iMin && r.j === jMin + 1)!; // (i0, j0+1) 서변 — 동변은 킷 링 벽에 붙어 있어 걷어도 안 트인다 (P48-b3)
    expect(g.unpaintDeck([side]).ok).toBe(true);
    for (const t of tiles) expect(g.grid.at(t.i, t.j)).toBe(g.grid.naturalAt(t.i, t.j));
    expect(g.grid.at(side.i, side.j)).toBe(g.grid.naturalAt(side.i, side.j)); // 서변 자리는 뭍에 닿아 여울
    expect(g.grid.naturalAt(ring[0]!.i, ring[0]!.j)).toBe(FLOOR.shallow); // 윗줄 데크 자리의 자연 바닥은 여울
  });

  it('goalNum 한 벌 — p48a 148.1 · p48b1 148.21 · p49a2 149.12 · p45 145 · g57 57', () => {
    expect(goalNum('p48a')).toBe(148.1);
    expect(goalNum('p48b1')).toBe(148.21);
    expect(goalNum('p49a2')).toBe(149.12);
    expect(goalNum('p45')).toBe(145);
    expect(goalNum('g57')).toBe(57);
    expect(goalNum('p48a')).toBeGreaterThan(goalNum('p48'));
    expect(goalNum('p48c')).toBeLessThan(goalNum('p49'));
  });

  it('정적 — 검사 파일의 `digPool` 직접 호출은 허용목록(거절 문장을 재는 검사 넷)에만 남는다 · P49-b: 픽스처 호출 0', () => {
    const ALLOW = new Set(['bus.test.ts', 'facility.test.ts', 'game.test.ts', 'zone.test.ts']); // P49-b: 15 → 4 — 남은 넷은 뭍·강 거절 문장을 재는 검사뿐(픽스처는 전부 `makeTestPpaji`)
    const dir = new URL('./', import.meta.url);
    const offenders = readdirSync(dir).filter((f) => f.endsWith('.test.ts') && f !== 'p48a.test.ts' && !ALLOW.has(f)).filter((f) => readFileSync(new URL(f, dir), 'utf8').includes('digPool('));
    expect(offenders).toEqual([]);
  });
});
