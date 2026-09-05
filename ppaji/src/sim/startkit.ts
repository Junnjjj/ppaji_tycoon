/**
 * 시작 킷 (G25 → P15) — 새 판은 빈 땅이 아니라 **물려받은 작은 빠지**다 (첫 화면: 데크 링이 둘러싼 수영 구역·선착장·자판기·평상·화단).
 * 첫 화면부터 워터파크로 보이고, 첫 결정이 「어디를 팔까」가 아니라 「무엇을 더할까」가 된다.
 * 무료로 준다 — 돈은 balance.startMoney 그대로. 봇·골든도 같은 함수를 쓴다.
 */
import type { Game } from './game.js';
import { FLOOR } from './grid.js';

export interface StartKit { poolTiles: number; facilities: number }

export function applyStartKit(g: Game): StartKit {
  const gt = g.gate;
  const money = g.money;
  // P15 D22 — 데크 링: 왼쪽 열(gt.i-7) · 오른쪽 열(gt.i-2) · 먼 줄(gt.j+31) 이 물가(25)와 함께 4×5 를 둘러싼다 → 안쪽 20칸이 자동 수영 구역
  const ring: { i: number; j: number }[] = [];
  for (let b = 26; b <= 31; b++) { ring.push({ i: gt.i - 7, j: gt.j + b }); ring.push({ i: gt.i - 2, j: gt.j + b }); }
  for (let a = -6; a <= -3; a++) ring.push({ i: gt.i + a, j: gt.j + 31 });
  for (const t of ring) g.grid.set(t.i, t.j, FLOOR.deck);
  // P16 — 길: 손님은 길만 걷는다. 입구 열(포장) 에서 좌우로 두 줄(4·8)을 내어 킷 시설의 입구 고리에 닿게 한다
  const pave = (i: number, j: number): void => { if (g.grid.at(i, j) === FLOOR.grass) g.grid.set(i, j, FLOOR.path); };
  for (let a = -10; a <= 5; a++) pave(gt.i + a, gt.j + 2); // 가로 산책로 (탁구대·화장실 고리)
  for (let b = 3; b <= 7; b++) pave(gt.i - 10, gt.j + b); // 평상 옆 세로 길
  for (let a = 1; a <= 5; a++) pave(gt.i + a, gt.j + 8); // 화단·자판기 아래 가로 길
  g.syncEnclosedWater();
  // 시설 — 입구 오른쪽에 화장실·자판기, 수역 옆에 평상 연립 둘, 화단·탁구대 · 선착장은 링 오른쪽 열(트인 강 쪽)
  const kit: [string, number, number][] = [
    ['toilet', gt.i - 3, gt.j + 3], ['vending_out', gt.i + 3, gt.j + 7],
    ['pyeongsang_row', gt.i - 9, gt.j + 6], ['pyeongsang_row', gt.i - 9, gt.j + 5],
    ['flowerbed', gt.i + 1, gt.j + 9], ['pingpong', gt.i - 8, gt.j + 3], ['dock', gt.i - 2, gt.j + 28],
  ];
  let n = 0;
  for (const [id, i, j] of kit) if (g.placeFacility(id, i, j, 0, { inherited: true }).ok) n++;
  g.money = money; // 물려받은 것 — 값을 치르지 않는다
  g.drainFx();
  return { poolTiles: g.pools.totalTiles(), facilities: n };
}
