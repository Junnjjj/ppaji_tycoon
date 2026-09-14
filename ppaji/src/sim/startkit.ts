/**
 * 시작 킷 (G25 → P15 → P43) — 새 판은 빈 땅이 아니라 **물려받은 작은 빠지**다 (첫 화면: 정문 부스·주차장·실내동·데크 링이 둘러싼 수영 구역·선착장·자판기·평상).
 * 첫 화면부터 빠지로 보이고, 첫 결정이 「어디를 팔까」가 아니라 「무엇을 더할까」가 된다.
 * 무료로 준다 — 돈은 balance.startMoney 그대로. 봇·골든도 같은 함수를 쓴다.
 * P43: 좌표는 전부 **입구(gt)와 물가(RIVER.j0)** 기준이다 — 격자 크기가 바뀌어도 킷은 안 바뀐다.
 */
import type { Game } from './game.js';
import { FLOOR, BEND, shoreRow } from './grid.js';

export interface StartKit { poolTiles: number; facilities: number }

/** 킷 출입동 (P45-a D63) — 정문 가운데 20×20(400칸, P45-b). 정문 칸(입구 열 첫 줄)이 건물 안이고, 입구 열 30줄이 **복도**(hall). 복도 남쪽 끝이 마당 통로에 닿아 문이 난다 — 손님 전원이 정문 → 복도 → 마당으로 지난다 */
export function kitIndoorRect(gt: { i: number; j: number }): { i0: number; j0: number; w: number; h: number } {
  return { i0: gt.i - 10, j0: gt.j, w: 20, h: 13 }; // P45-b 600 → 400 · P48-b1(W7) 400 → 260: 못(행 25~31)이 남문 아래 넷째 줄에 닿는다. 좌우 확장은 실내 바닥 붓
}

export function applyStartKit(g: Game): StartKit {
  const gt = g.gate;
  const money = g.money;
  // P15 D22 → P48-b2 W7 — 킷 빠지는 출입동 남문 아래 **만(灣)** 의 곧은 서안에 붙는다: 왼쪽 열(head.i0, 서안 기슭) · 오른쪽 열(head.i0+5) · 아랫줄(head.j0+5) 이 북안(뭍, head.j0−1)과 함께
  // 4×5 를 둘러싼다 → 안쪽 20칸이 자동 수영 구역(여울 8 · 강 12 — 한 빠지에 두 깊이). 선착장은 본류 잔교(코스는 트인 강이 필요하다)
  const hx = BEND.head.i0, hy = BEND.head.j0; // 서안에 붙인다 — 한 칸 띄우면 링 서쪽에 폭 1 물띠가 남는다
  const ring: { i: number; j: number }[] = [];
  for (let j = hy; j <= hy + 5; j++) { ring.push({ i: hx, j }); ring.push({ i: hx + 5, j }); }
  for (let a = 1; a <= 4; a++) ring.push({ i: hx + a, j: hy + 5 });
  for (const t of ring) g.grid.set(t.i, t.j, FLOOR.deck);
  const px = gt.i + 10, pj = shoreRow(px); for (let j = pj; j <= pj + 2; j++) g.grid.set(px, j, FLOOR.deck); // P48-b3: 본류 잔교 3칸 — 링 동쪽 물가에서 강 쪽으로
  // P40 D52: 마당은 어디든 걷는다 — 길은 「바닥 바꾸기」. 실내동 아래 산책로 한 줄만 깔아 동선이 읽히게 한다
  const pave = (i: number, j: number): void => { if (g.grid.at(i, j) === FLOOR.grass) g.grid.set(i, j, FLOOR.path); };
  const room = kitIndoorRect(gt);
  for (let j = room.j0; j < room.j0 + room.h; j++) for (let i = room.i0; i < room.i0 + room.w; i++) { if (i === gt.i && j === gt.j) continue; g.grid.set(i, j, FLOOR.indoor); } // P39 D48: 실내동은 바닥을 깐 것 — 넓히는 것도 바닥 붓. 정문 칸은 그대로 포장(건물이 정문을 감싼다 — 정문 변이 도로 쪽 문)
  for (let j = room.j0 + 1; j < room.j0 + room.h; j++) g.grid.set(gt.i, j, FLOOR.hall); // P45-a 복도: 정문 칸 바로 아래에서 마당 문까지 한 줄(백화점 동선) — 양 끝이 통로에 닿아 문 둘
  void pave; // P48-b3: 물가 산책로는 newPark 이 S 를 따라 깐다
  g.syncEnclosedWater();
  // 시설 — 정문 부스·주차장은 정문 곁, 실내동엔 사무실·화장실, 자판기는 산책로 옆, 평상 둘은 물가, 탁구대는 마당, 선착장은 링 오른쪽 열(트인 강 쪽)
  const kit: [string, number, number][] = [
    ['ticket', gt.i + 1, gt.j + 1], ['indoor_shop', gt.i - 3, gt.j + 3], ['toilet', gt.i + 2, gt.j + 8], // P45-a D57: 킷은 거의 안 준다 — 매표 창구(복도 옆)·실내 매점·화장실만 실내에. 사무실·나무는 뺐다
    ['vending_out', gt.i - 14, gt.j + 23], // P48-b3: 서쪽 물가 산책로 옆, 평상 반경(3) 밖 // P29 D37: 산책로(w0−6) 옆, 평상 반경(3) 밖 — P48-b2: 입구 열 j+34 는 굽이 물이 됐다 — 첫 판의 자리가 「미완성」이어야 자리 만들기가 첫 10분이 된다
    ['pyeongsang_row', hx + 1, hy - 2], ['pyeongsang_row', gt.i - 10, shoreRow(gt.i - 10) - 5], // P48-b3: 둘째 줄은 서쪽 물가(건물 남서 모서리 아래, 물이 반경 3 안) // P24 D29 → P29 D37 → P48-b2: 한 줄은 못 북안(킷 빠지 물이 반경 3 안 — 첫 기구 확정 tick 에 패키지 발견이 뜬다), 한 줄은 본류 물가
    ['dock', px, pj + 2], // P48-b2: 본류 잔교 끝 — 굽이 못은 밀폐라 코스가 못 산다. 가운데 칸이면 끝 칸이 고립돼 breaksAccess 가 거절한다
  ];
  let n = 0;
  for (const [id, i, j] of kit) if (g.placeFacility(id, i, j, 0, { inherited: true }).ok) n++;
  g.money = money; // 물려받은 것 — 값을 치르지 않는다
  g.drainFx();
  return { poolTiles: g.pools.totalTiles(), facilities: n };
}
