import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Game, FACILITY_DEFS } from './game.js';
import { WRISTBANDS, bandPrice, bandTop, bandFor } from './wristband.js';

const fresh = (): Game => { const g = new Game(1); g.money = 1e6; for (const d of FACILITY_DEFS.values()) if (d.class === 'rig' || d.onRing) g.unlocked.facilities.add(d.id); return g; };

describe('P50-b2 화면·돈 칸 값', () => {
  it('팔찌 값 사다리 — big3 ★1 400 · big5 ★2 600 · ★3 700 · allday ★4 1,000 · 구명조끼 0 · bandTop/bandFor 는 뽑기 0', () => {
    const by = Object.fromEntries(WRISTBANDS.map((t) => [t.id, t]));
    expect(WRISTBANDS.map((t) => t.id)).toEqual(['vest_only', 'big3', 'big5', 'allday']);
    expect(bandPrice(by['big3']!, 1)).toBe(400);
    expect(bandPrice(by['big5']!, 2)).toBe(600);
    expect(bandPrice(by['big5']!, 3)).toBe(700);
    expect(bandPrice(by['allday']!, 4)).toBe(1000);
    expect(bandPrice(by['vest_only']!, 4)).toBe(0);
    expect([0, 1, 2, 3, 4].map((g) => bandTop(g).id)).toEqual(['vest_only', 'big3', 'big5', 'big5', 'allday']);
    const opened = WRISTBANDS.slice(0, 3);
    expect(bandFor(0.4, opened).id).toBe('vest_only'); expect(bandFor(1.0, opened).id).toBe('big3'); expect(bandFor(1.8, opened).id).toBe('big5'); expect(bandFor(0.4, opened, 1).id).toBe('big3'); // P52-a: 문턱 0.85·1.25·1.7(출신지 thrill 0.4~1.8)
    expect(bandFor(0.5, []).id).toBe('vest_only');
  });

  it('aimPreview — 기구·링 시설 전수: 미리보기 등급·연결·팔찌 값 == 확정 뒤 실값 · 호출 전후 nextUid·occHash·grid.rev·pools.version 불변', () => {
    const defs = [...FACILITY_DEFS.values()].filter((d) => (d.class === 'rig' || d.onRing === true) && d.w * d.d <= 6);
    expect(defs.length).toBeGreaterThanOrEqual(21);
    let checked = 0;
    for (const def of defs) {
      const g = fresh();
      // 첫 기구 하나(켜짐)를 두고 둘째 자리를 전수로 찾는다 — 물 위는 킷 빠지 안, 링 위는 서쪽 링 열 50
      expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true);
      const cands: [number, number, 0 | 1][] = [];
      for (let j = 23; j <= 29; j++) for (let i = 50; i <= 55; i++) for (const f of [0, 1] as const) cands.push([i, j, f]);
      const at = cands.find(([i, j, f]) => g.canPlace(def.id, i, j, f).ok);
      if (!at) continue;
      const before = { ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version };
      const pv = g.aimPreview(def.id, at[0], at[1], at[2]);
      const after = { ...g.facilities.probeState(), rev: g.grid.rev, pv: g.pools.version };
      expect(after).toEqual(before);
      expect(pv).not.toBeNull();
      const r = g.placeFacility(def.id, at[0], at[1], at[2]); expect(r.ok, `${def.id} ${JSON.stringify(r)}`).toBe(true);
      const pid = g.poolOfFacility(r.uid!);
      if (pv!.poolId !== null && pid !== null) { expect(g.ppajiGradeOf(pid)).toBe(pv!.gradeNext); }
      if (def.class === 'rig' && def.onRing !== true) { expect(g.rigState.lit.has(r.uid!)).toBe(pv!.lit); if (pv!.lit) { expect(g.rigState.chainLen.get(r.uid!)).toBe(pv!.chainNext); expect(g.facilityCapacity(g.facilities.byUid(r.uid!)!)).toBe(pv!.capNext); } }
      if (pid !== null) expect(bandPrice(bandTop(g.ppajiGradeOf(pid)), g.ppajiGradeOf(pid))).toBe(pv!.pkgNext);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(21);
  });

  it('성능 — aimPreview ≤ 0.6ms · rigLinkEdges ≤ 0.3ms(캐시) · 등급 불변 설치 직후 모달 0 · 등급이 오르는 확정 tick 에 모달 정확히 1', () => {
    const g = fresh();
    const modals = (): number => g.inbox.all.filter((m) => m.priority === 'modal').length;
    const m0 = modals();
    expect(g.placeFacility('rig_stepstone', 51, 26, 0).ok).toBe(true); // n 1 → 등급 0 그대로
    expect(modals()).toBe(m0);
    expect(g.placeFacility('rig_bridge', 52, 26, 1).ok).toBe(true); // n 2 → 등급 1 — 같은 tick 모달 1
    expect(modals()).toBe(m0 + 1);
    expect(g.inbox.all.filter((m) => m.priority === 'modal').at(-1)!.title).toContain('놀이 빠지');
    for (let k = 0; k < 5; k++) g.aimPreview('rig_beam', 53, 24, 1);
    let t0 = process.hrtime.bigint(); for (let k = 0; k < 50; k++) g.aimPreview('rig_beam', 53, 24, 1);
    expect(Number(process.hrtime.bigint() - t0) / 1e6 / 50).toBeLessThan(0.6 * 4);
    g.rigLinkEdges();
    t0 = process.hrtime.bigint(); for (let k = 0; k < 50; k++) g.rigLinkEdges();
    expect(Number(process.hrtime.bigint() - t0) / 1e6 / 50).toBeLessThan(0.3 * 4);
    expect(g.rigLinkEdges().length).toBeGreaterThan(0); // (51,26)–(50,26) 데크 접점 + (51,26)–(52,26) 기구 접점
  });

  it('정적 — `aimAt` 호출부 1(main.ts) · `aimPreview` 는 UI(place.ts)에서만 읽는다 · 한 사건 id 를 두 채널(modal+toast)에 push 하는 코드 0', () => {
    const dir = new URL('../', import.meta.url);
    const read = (p: string): string => readFileSync(new URL(p, dir), 'utf8');
    expect((read('main.ts').match(/\.aimAt\(/g) ?? []).length).toBe(1);
    const uiDir = new URL('./ui/windows/', dir);
    const users = readdirSync(uiDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && read(`ui/windows/${f}`).includes('aimPreview('));
    expect(users).toEqual(['place.ts']);
    const game = read('sim/game.ts');
    const titles = [...game.matchAll(/priority: '(modal|toast)', title: (`[^`]*`|'[^']*')/g)].map((m) => [m[1], m[2]!.replace(/\$\{[^}]*\}/g, '').replace(/[^가-힣a-z]/g, '')]);
    const byTitle = new Map<string, Set<string>>();
    for (const [ch, t] of titles) { if (!t) continue; const set = byTitle.get(t!) ?? new Set(); set.add(ch!); byTitle.set(t!, set); }
    expect([...byTitle].filter(([, chs]) => chs.size > 1)).toEqual([]);
  });
});
