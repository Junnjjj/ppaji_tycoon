import { describe, it, expect } from 'vitest';
import { COURSE_DOCK_IDS } from './course/ride.js';
import { Game, FACILITY_DEFS } from './game.js';
import { FLOOR, BEND, isWaterCode, shoreRow, permitDepth } from './grid.js';
import { runBot } from './bot.js';
import { makeTestPpaji } from './test-helpers.js';

/**
 * P48-b2 (§14 W5·W6·W7) — 물 판정 재정의 · 허가 = 랭크별 칸 예산 · 킷 빠지를 만(灣) 안으로 · 선착장은 본류 잔교.
 * 사용자 지적(2026-09-07 스크린샷): 「도랑 + 네모 못이 아니라 S 자로 만처럼 건물 살짝 앞까지」 → 만 폭 7~11 · 행 24~30 · 서안 곧고 동쪽 두 귀를 깎았다.
 */
describe('P48-b2 만·허가·킷', () => {
  it('내 물 = 마당 물가에서 허가 깊이(★0 7) 안 · 토지 열 밖은 아니다 · 깊이 밖은 아니다 (P48-b3)', () => {
    const g = new Game(1);
    let bay = 0;
    for (let j = 9; j < g.grid.h; j++) for (let i = g.land.i0; i < g.land.i0 + g.land.w; i++) if (isWaterCode(g.grid.at(i, j)) && g.inMyWater(i, j)) { bay++; expect(g.grid.shoreDist(g.land, i, j)).toBeLessThanOrEqual(g.permitDepth); } // P48-b3: 내 물 = 물가 거리 ≤ 깊이
    expect(bay).toBeGreaterThan(250);
    expect(g.inMyWater(g.land.i0 - 2, shoreRow(g.land.i0 - 2) + 1)).toBe(false);
    expect(g.inMyWater(g.gate.i, shoreRow(g.gate.i) + g.permitDepth)).toBe(false);
    expect(g.inMyWater(g.gate.i, shoreRow(g.gate.i) + g.permitDepth - 1)).toBe(true);
    expect(g.permitDepth).toBe(permitDepth(0));
  });
  it('킷 — 건물 앞 물가에 붙은 링 16 + 본류 잔교 3 = 데크 19 · 수역 20(여울 8 · 강 12 — 북안 두 줄) 은 링 안(행 24~28) · 선착장은 잔교 끝(gt.i+10, 물가+2) · 후보 1', () => {
    const g = new Game(1);
    let deck = 0; for (let k = 0; k < g.grid.floor.length; k++) if (g.grid.floor[k] === FLOOR.deck) deck++;
    expect(deck).toBe(19);
    const p = g.pools.all[0]!; expect(g.pools.all.length).toBe(1); expect(p.tiles.length).toBe(20);
    let shallow = 0; for (const k of p.tiles) { const i = k % g.grid.w, j = Math.floor(k / g.grid.w); expect(i >= BEND.head.i0 + 1 && i <= BEND.head.i0 + 4 && j >= BEND.head.j0 && j <= BEND.head.j0 + 4).toBe(true); if (g.grid.naturalAt(i, j) === FLOOR.shallow) shallow++; }
    expect(shallow).toBe(8);
    const dock = g.facilities.all.find((f) => f.defId === 'dock')!; expect([dock.i, dock.j]).toEqual([g.gate.i + 10, shoreRow(g.gate.i + 10) + 2]);
    expect(g.dockChoices().length).toBe(1);
    expect(g.grid.at(g.gate.i + 10, shoreRow(g.gate.i + 10) + 1)).toBe(FLOOR.deck);
  });
  it('허가 = 랭크별 칸 예산 — ★0 40칸: 킷 20 + 빠지 하나(20) 까지, 둘째 링의 마지막 칸은 「수면 허가를 넘습니다」 · 랭크 업 모달에 「수면 허가 +N칸」', () => {
    const g = new Game(1); g.money = 1000000;
    expect(g.permitMax).toBe(40); expect(g.permitUsed).toBe(20);
    expect(makeTestPpaji(g).tiles.length).toBe(20); // 킷 링 서쪽(열 44~49)
    expect(g.permitLeft).toBe(0);
    const c = g.gate.i + 11, top = shoreRow(c); // 잔교 동쪽 편평한 물가(열 59~63, 행 24) — 3×5 를 둘러싸는 링의 마지막 칸이 밀폐를 완성한다
    for (let x = c; x <= c + 4; x++) expect(shoreRow(x)).toBe(top);
    const ring: { i: number; j: number }[] = [];
    for (let x = c; x <= c + 4; x++) ring.push({ i: x, j: top });
    for (let j = top + 1; j <= top + 6; j++) { ring.push({ i: c, j }); ring.push({ i: c + 4, j }); }
    for (let i = c + 1; i <= c + 3; i++) ring.push({ i, j: top + 6 });
    for (const t of ring.slice(0, -1)) expect(g.paintDeck([t]).ok).toBe(true);
    const last = g.paintDeck([ring[ring.length - 1]!]);
    expect(last.ok).toBe(false); if (!last.ok) expect(last.reason).toContain('수면 허가');
    expect(g.pools.totalTiles()).toBe(40); // 마지막 칸이 거절돼 안쪽 15칸은 아직 트인 강
    const dPermit = (g as unknown as { b: { permitTilesByRank: number[] } }).b.permitTilesByRank[1]! - 40;
    expect(dPermit).toBe(50); // 랭크 업 모달 문구는 아래 봇 검사가 본다(★0 → ★1 에서 「수면 허가 +50칸」)
  });
  it('밀폐 판정은 전 격자 — 만 안 물을 데크로 두르면 수역, 걷으면 만 물로 돌아간다(자연 바닥) · 만 밖 본류 잔교는 수역을 안 만든다', () => {
    const g = new Game(1); g.money = 1000000;
    const i0 = g.gate.i + 12, j0 = BEND.head.j0 + 2; // 잔교(열 58) 동쪽 물 3×3(열 60~62 · 행 26~28)을 네모 데크로 두른다 — 첫 칸은 잔교 옆(이어서). 윗벽(행 25)과 물가(행 23 뭍) 사이 행 24 다섯 칸도 갇혀 웅덩이가 된다
    const edit: { i: number; j: number }[] = [];
    for (let j = j0 - 1; j <= j0 + 3; j++) edit.push({ i: i0 - 1, j });
    for (let i = i0; i < i0 + 3; i++) edit.push({ i, j: j0 - 1 }); // 윗벽을 먼저 — 나중에 깔면 옆벽·물가가 먼저 갇혀 윗벽 자리가 수역이 된다
    for (let j = j0 - 1; j <= j0 + 3; j++) edit.push({ i: i0 + 3, j });
    for (let i = i0; i < i0 + 3; i++) edit.push({ i, j: j0 + 3 });
    for (const t of edit) { const r = g.paintDeck([t]); expect(r.ok, JSON.stringify(t) + ' ' + JSON.stringify(r)).toBe(true); }
    expect(g.pools.all.length).toBe(3); expect(g.pools.totalTiles()).toBe(20 + 9 + 5); // 웅덩이 5 = 행 24 의 (59~62) + 잔교 옆 (59,24)… 물가 뭍·잔교·윗벽 사이
    expect(g.unpaintDeck([{ i: i0 + 3, j: j0 + 1 }]).ok).toBe(true); // 동벽 가운데를 걷으면 안쪽이 만(동쪽 물)으로 트인다 (귀 칸을 걷으면 그 칸만 1칸 웅덩이가 된다)
    expect(g.pools.all.length).toBe(2); // 안쪽은 트였고 행 24 웅덩이(5)는 남는다
    expect(isWaterCode(g.grid.at(i0, j0))).toBe(true);
  });
  it('canPlace — 야외 식당은 실내에 못 · 내 땅 밖 뭍은 못 · 자연 바닥이 물인 데크(잔교) 위 승하선 데크는 된다 (회귀: 주석이 return 앞에 붙어 두 판정이 조용히 죽었었다)', () => {
    const g = new Game(1); g.money = 1000000; g.unlocked.facilities.add('shop');
    const gt = g.gate;
    const r1 = g.canPlace('shop', gt.i - 6, gt.j + 10, 0); expect(r1.ok).toBe(false); if (!r1.ok) expect(r1.reason).toContain('야외');
    const r2 = g.canPlace('sunflower', g.land.i0 - 3, gt.j + 30, 0); expect(r2.ok).toBe(false); if (!r2.ok) expect(r2.reason).toContain('내 땅');
    expect(g.grid.at(gt.i + 10, shoreRow(gt.i + 10)), 'kit 잔교').toBe(FLOOR.deck);
    // P61-b: 1×1 `dock` 은 **은퇴**했고(조합으로 통합) 새 판이 짓는 선착장은 2×1 `boarding_dock` 이다.
    // 잔교는 세로 한 줄이라 facing 1 (1칸 폭 × 2칸 깊이)로 선다.
    expect(g.canPlace('boarding_dock', gt.i + 10, shoreRow(gt.i + 10), 1).ok, JSON.stringify(g.canPlace('boarding_dock', gt.i + 10, shoreRow(gt.i + 10), 1))).toBe(true);
    // 은퇴한 옛 선착장은 **정의는 남고**(킷·저장이 쓴다) 새로 짓지는 못한다 — 그 거절이 canPlace 첫 줄이다
    const retired = g.canPlace('dock', gt.i + 10, shoreRow(gt.i + 10), 0);
    expect(retired.ok).toBe(false); if (!retired.ok) expect(retired.reason).toContain('조합');
    expect(FACILITY_DEFS.get('dock')?.deprecated).toBe(true);
    expect(g.canPlace('dock', gt.i + 10, shoreRow(gt.i + 10), 0, { inherited: true }).ok).toBe(true); // 물려받은 것으로는 여전히 선다
    // 코스가 뻗을 수 있는 선착장 종은 `COURSE_DOCK_IDS` 하나가 정본이다 — 새 종이 들어오면 여기서 걸린다
    for (const d of FACILITY_DEFS.values()) if (d.id.includes('dock') && d.class === 'attraction' && d.deprecated !== true) expect(COURSE_DOCK_IDS.has(d.id), d.id).toBe(true);
  });
  it('봇 — 링은 뭍 위 칸에서 시작한다(굽이 어귀에서 매일 거절당하지 않는다): 128일 수역 ≥60 · 코스 ≥2 (전: 36 · 1)', () => {
    const g = new Game(1);
    runBot(g, 128);
    expect(g.pools.totalTiles()).toBeGreaterThanOrEqual(60);
    expect(g.courses.count).toBeGreaterThanOrEqual(2);
    expect(g.permitUsed).toBeLessThanOrEqual(g.permitMax);
  }, 120000); // 128일 봇 — 혼자 44초, 부하 아래 60초를 넘긴다(2026-09-13 실측)
  it('랭크 업 모달이 「수면 허가 +N칸」 을 말한다 (첫 랭크 업 직후 — 알림함은 최근 100건만 남긴다)', () => {
    const g = new Game(1);
    for (let d = 0; d < 60 && g.rank < 1; d++) runBot(g, 1); // 첫 랭크 업 직후에 본다 — 더 돌리면 알림 100건이 밀려난다
    expect(g.rank).toBeGreaterThanOrEqual(1);
    expect(g.inbox.all.some((m) => m.title.startsWith('랭크 업') && /수면 허가 \+\d+칸/.test(m.body))).toBe(true); // P48-b2 W6
  }, 30000);
  it('물가 산책로 — newPark 이 북안 위 두 줄(행 shoreRow−1·−2)을 S 를 따라 포장한다', () => {
    const g = new Game(1);
    for (const i of [32, 40, 48, 56, 64]) { const r = shoreRow(i); if (!g.grid.inside(i, r - 2) || i < g.land.i0 || i >= g.land.i0 + g.land.w) continue; expect(isWaterCode(g.grid.at(i, r))).toBe(true); expect(([FLOOR.path, FLOOR.deck] as number[]).includes(g.grid.at(i, r - 1))).toBe(true); }
  });
});
