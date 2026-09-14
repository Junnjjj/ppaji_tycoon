import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FACILITY_DEFS, RANK_DEFS } from '../sim/game.js';
import { kairoFrameFor, type KairoAtlasJson } from '../assets/kairo-atlas.js';

/**
 * P57-b — main 병합 M3(`docs/plan-ppaji-main-merge.md`): main 의 환경 장식 `env_*` 29종을 ppaji 장식 시설(decor · capacity 0)로 들인다.
 * 해금은 상점 행 없이(봇이 상점 최저가를 사므로 골든이 흔들린다) 시작 18 · ★1 나무 3 · ★2 건물 6+차량 2. 그림은 main 아틀라스 `facility/env_*:d0~d3` — ppaji 는 두 방향(d0·d1)만 쓴다.
 */
const atlas = JSON.parse(readFileSync(resolve(__dirname, '../../public/assets/kairo-atlas.json'), 'utf8')) as KairoAtlasJson;
const ENV = [...FACILITY_DEFS.values()].filter((d) => d.id.startsWith('env_'));

describe('P57-b env 장식 29', () => {
  it('29종 · 전부 decor · capacity 0 · 4방향 표기 · cost/pop 60~140', () => {
    expect(ENV.length).toBe(29);
    for (const d of ENV) { expect(d.class, d.id).toBe('decor'); expect(d.capacity, d.id).toBe(0); expect(d.facings, d.id).toBe(4); expect(d.cost / d.pop, d.id).toBeGreaterThanOrEqual(60); expect(d.cost / d.pop, d.id).toBeLessThanOrEqual(140); }
  });
  it('아틀라스에 d0·d1 프레임이 있고 프레임 폭 ≥ (w+d)×16 − 2', () => {
    for (const d of ENV) for (const f of [0, 1]) {
      const m = kairoFrameFor(`fac/${d.id}/${f}`, atlas)!; expect(m.frame, d.id).toBe(`facility/${d.id}:d${f}`); expect(m.flip).toBe(false);
      const fr = atlas[m.frame]!; expect(fr.w, `${d.id} w`).toBeGreaterThanOrEqual((d.w + d.d) * 16 - 2); /* main 프레임은 발자국보다 넓을 수 있다(2층 상가 104 > 96) — 좁으면 잘린 그림 */
    }
  });
  it('해금 — 시작 18 · ★1 3(나무) · ★2 8(건물·차량), 랭크 목록에 들어 있다', () => {
    const start = ENV.filter((d) => d.unlock.source === 'start'), r1 = ENV.filter((d) => d.unlock.source === 'rank' && d.unlock.rank === 1), r2 = ENV.filter((d) => d.unlock.source === 'rank' && d.unlock.rank === 2);
    expect([start.length, r1.length, r2.length]).toEqual([18, 3, 8]);
    for (const d of r1) expect(RANK_DEFS[0]!.unlocks, d.id).toContain(d.id);
    for (const d of r2) expect(RANK_DEFS[1]!.unlocks, d.id).toContain(d.id);
    expect(ENV.some((d) => d.unlock.source === 'shop')).toBe(false);
  });
});
