import { FLOOR, isWaterCode, shoreRow, type FloorCode } from './grid.js';
import type { Game } from './game.js';

/**
 * 검사 헬퍼 (P48-a, §14 D176) — 검사 파일은 `digPool` 을 직접 부르지 않고 이 둘을 지난다.
 * `digPool` 자체는 D22 이후 **API·하네스 원시**로 남는다(플레이어 붓이 아니다). 뭍 분기는 P49-b 가 지운다(D59).
 */

/** 물 위에만 판다 — 뭍 칸이 섞이면 던진다(뭍 풀은 사라질 것이라 검사가 거기 기대면 안 된다) */
export function digWater(g: Game, tiles: readonly { i: number; j: number }[]): { ok: boolean; reason?: string } {
  for (const t of tiles) {
    const c = g.grid.at(t.i, t.j) as FloorCode;
    if (!isWaterCode(c) || c === FLOOR.pool) throw new Error(`digWater: (${t.i},${t.j}) 은 물이 아니다 (code ${c})`);
  }
  return g.digPool(tiles);
}

/**
 * 킷 빠지 오른쪽 본류에 검사용 빠지 하나 — D22 그대로 **데크 링을 깔아** 안 물이 수역이 되게 한다(`syncEnclosedWater`).
 * 바깥 (innerW+2)×(innerH+2), 윗줄은 산책로(행 j0−1)에 닿아 첫 데크부터 `dry` 술어를 지난다. 자리는 킷 링(입구 열 −6~−2)과
 * 안 겹치게(P48-b2 본류 잔교 열 +8 도) 입구 열 +10 부터. 강 위 `digPool` 은 닿는 걷는 칸이 없어 `breaksAccess` 가 거절한다 — 그래서 파는 것이 아니라 두른다.
 */
export function makeTestPpaji(g: Game, innerW = 4, innerH = 5, di = -4): { tiles: { i: number; j: number }[]; ring: { i: number; j: number }[]; id: number | null } {
  // P48-b3: 물가가 S 라 윗줄은 여섯 열 물가 중 가장 아래 행(전부 물)이고, 첫 데크는 물가가 그 행인 열(위가 뭍)에서 시작한다. 기본 자리는 킷 링 서쪽(입구 열 −4 ~ +1)
  const i0 = g.gate.i + di;
  let j0 = 0, xs = i0; for (let a = 0; a <= innerW + 1; a++) { const r = shoreRow(i0 + a); if (r > j0) { j0 = r; xs = i0 + a; } }
  const ring: { i: number; j: number }[] = [];
  ring.push({ i: xs, j: j0 }); for (let d = 1; d <= innerW + 1; d++) { if (xs - d >= i0) ring.push({ i: xs - d, j: j0 }); if (xs + d <= i0 + innerW + 1) ring.push({ i: xs + d, j: j0 }); } // 윗줄 — 뭍에 닿는 칸부터 양쪽으로
  for (let b = 1; b <= innerH; b++) { ring.push({ i: i0, j: j0 + b }); ring.push({ i: i0 + innerW + 1, j: j0 + b }); }
  for (let a = 0; a <= innerW + 1; a++) ring.push({ i: i0 + a, j: j0 + innerH + 1 });          // 아랫줄
  for (const t of ring) { const r = g.paintDeck([t]); if (!r.ok) throw new Error(`makeTestPpaji: (${t.i},${t.j}) ${r.reason ?? '?'}`); }
  const tiles: { i: number; j: number }[] = [];
  for (let b = 1; b <= innerH; b++) for (let a = 1; a <= innerW; a++) tiles.push({ i: i0 + a, j: j0 + b });
  const p = g.pools.at(tiles[0]!.i, tiles[0]!.j);
  return { tiles, ring, id: p ? p.id : null };
}
