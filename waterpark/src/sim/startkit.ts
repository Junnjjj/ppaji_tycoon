/**
 * 시작 킷 (G25) — 새 판은 빈 땅이 아니라 **물려받은 작은 파크**다 (PSS 첫 화면: 풀·자판기·의자·화분).
 * 첫 화면부터 워터파크로 보이고, 첫 결정이 「어디를 팔까」가 아니라 「무엇을 더할까」가 된다.
 * 무료로 준다 — 돈은 balance.startMoney 그대로. 봇·골든도 같은 함수를 쓴다.
 */
import type { Game } from './game.js';

export interface StartKit { poolTiles: number; facilities: number }

export function applyStartKit(g: Game): StartKit {
  const gt = g.gate;
  const money = g.money;
  // 풀 4×5 (입구 왼쪽 위) — PSS 첫 화면의 풀 크기 (스샷 4 실측 ≈ 20칸)
  const tiles: { i: number; j: number }[] = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 5; b++) tiles.push({ i: gt.i - 6 + a, j: gt.j - 8 + b });
  g.digPool(tiles);
  // 시설 — 입구 오른쪽에 화장실·자판기, 풀 옆에 데크체어 둘, 화분·야자수
  const kit: [string, number, number][] = [
    ['toilet', gt.i + 3, gt.j - 4], ['vending_machine', gt.i + 3, gt.j - 6],
    ['deck_chair', gt.i - 8, gt.j - 6], ['deck_chair', gt.i - 8, gt.j - 5],
    ['flower_pot', gt.i + 1, gt.j - 9], ['palm_tree', gt.i - 8, gt.j - 3], ['palm_tree', gt.i + 5, gt.j - 9],
  ];
  let n = 0;
  for (const [id, i, j] of kit) if (g.placeFacility(id, i, j, 0, { inherited: true }).ok) n++;
  g.money = money; // 물려받은 것 — 값을 치르지 않는다
  g.drainFx();
  return { poolTiles: g.pools.totalTiles(), facilities: n };
}
