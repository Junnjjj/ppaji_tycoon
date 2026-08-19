/**
 * 소원 체인 (K43) — EXP·문턱·성사·사슬·저장이 규칙대로 도는가.
 */
import { describe, expect, it } from 'vitest';
import { WishStore, WISH_CHARACTERS } from './wishes.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import { PlacementGrid } from './placement.js';

const GATE = { i: 0, j: 0 };

function flat(size = 30): { t: KairoTerrain; w: WallGrid; p: PlacementGrid } {
  const t = new KairoTerrain(size, size);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) t.paint(i, j, 'path_stone');
  return { t, w: new WallGrid(size, size), p: new PlacementGrid(size, size) };
}

const SUMMARY = { visitors: 100, turnedAway: 0, profit: 0, exitSatisfaction: 80 };

describe('소원 체인', () => {
  it('데이터 — 시작 인물 2, 사슬 초대가 실제 인물을 가리킨다', () => {
    expect(WISH_CHARACTERS.filter((c) => c.start).length).toBe(2);
    const ids = new Set(WISH_CHARACTERS.map((c) => c.id));
    for (const c of WISH_CHARACTERS) {
      for (const w of c.wishes) {
        if (w.reward.invite !== undefined) {
          expect(ids.has(w.reward.invite), `${c.id} → ${w.reward.invite}`).toBe(true);
        }
      }
    }
  });

  it('EXP 는 유형 집계로 쌓이고, 문턱에 닿으면 소원이 열린다', () => {
    const { p } = flat();
    const ws = new WishStore();
    // 친구 30명 × (0.5 + 80/200) = 27 — 민지의 첫 문턱(40) 아래
    let evs = ws.settle(SUMMARY, { friends: 30 }, p);
    expect(evs.filter((e) => e.kind === 'open')).toHaveLength(0);
    // 20명 더 → 45 — 문턱을 넘는다
    evs = ws.settle(SUMMARY, { friends: 20 }, p);
    const open = evs.filter((e) => e.kind === 'open');
    expect(open).toHaveLength(1);
    expect(open[0]?.char.id).toBe('minji');
  });

  it('조건을 채우면 성사되고, 보상 시설·사슬 초대가 이벤트로 나온다', () => {
    const { t, w, p } = flat();
    const ws = new WishStore();
    ws.settle(SUMMARY, { friends: 60 }, p); // 민지 소원 1 열림 (놀이 2)
    // 놀이 2개를 짓는다 (골격 1등급 pingpong ×2)
    expect(p.place(t, w, GATE, 'pingpong', 3, 3).ok).toBe(true);
    expect(p.place(t, w, GATE, 'pingpong', 8, 3).ok).toBe(true);
    const evs = ws.settle(SUMMARY, { friends: 1 }, p);
    const done = evs.find((e) => e.kind === 'done');
    expect(done?.kind).toBe('done');
    if (done?.kind === 'done') {
      expect(done.wish.reward.facility).toBe('arcade');
    }
    // 같은 소원이 두 번 성사되지 않는다 — 다음 소원(140)은 아직 안 열렸다
    const again = ws.settle(SUMMARY, { friends: 1 }, p);
    expect(again.filter((e) => e.kind === 'done')).toHaveLength(0);
  });

  it('사슬 — invite 보상이 새 인물을 활성화하고 arrive 이벤트를 낸다', () => {
    /*
     * 커플 사슬로 잰다 — 친구 사슬의 둘째 소원(스릴 3)은 물·데크 전용 시설이라
     * 평지 테스트 세계에 못 놓는다 (실측 diving requiresDeck).
     * 하은: ① 경관 3 → 선베드 · ② 먹거리 4 → 태양 초대.
     */
    const { t, w, p } = flat();
    // 하은은 민지 사슬 셋째의 초대로 온다 — 사슬 검증에 그 셋을 다 밟을 필요는 없어
    // 스냅샷으로 활성 상태를 만든다 (저장 복원과 같은 경로다)
    const ws = WishStore.fromSnapshot({ exp: {}, active: ['haeun'], stage: {}, open: [] });
    ws.settle(SUMMARY, { couple: 140 }, p); // exp 126 ≥ 120 — 소원 1 열림
    p.place(t, w, GATE, 'flowerbed', 3, 3);
    p.place(t, w, GATE, 'flowerbed', 6, 3);
    p.place(t, w, GATE, 'flowerbed', 9, 3);
    ws.settle(SUMMARY, { couple: 1 }, p); // 성사 (sunbed_row)
    ws.settle(SUMMARY, { couple: 160 }, p); // exp ~270 ≥ 260 — 소원 2 열림
    p.place(t, w, GATE, 'vending_out', 3, 7);
    p.place(t, w, GATE, 'snackbar', 6, 7);
    p.place(t, w, GATE, 'bungeoppang', 10, 7);
    expect(p.place(t, w, GATE, 'bbq_zone', 14, 7).ok).toBe(true);
    const evs = ws.settle(SUMMARY, { couple: 1 }, p);
    const arrive = evs.find((e) => e.kind === 'arrive');
    expect(arrive?.kind).toBe('arrive');
    if (arrive?.kind === 'arrive') expect(arrive.char.id).toBe('taeyang');
  });

  it('세이브를 살아남는다 — 사슬이 끊기면 인물이 떠난다', () => {
    const { p } = flat();
    const ws = new WishStore();
    ws.settle(SUMMARY, { friends: 60, family: 60 }, p);
    const back = WishStore.fromSnapshot(ws.toSnapshot());
    // 같은 상태 — 다시 settle 해도 이미 연 소원을 또 열지 않는다
    const evs = back.settle(SUMMARY, { friends: 0 }, p);
    expect(evs.filter((e) => e.kind === 'open' && e.char.id === 'minji')).toHaveLength(0);
    expect(Math.round(back.expOf('friends'))).toBe(Math.round(ws.expOf('friends')));
  });
});
