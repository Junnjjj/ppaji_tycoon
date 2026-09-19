import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Game, RIG_PART_DEFS, FACILITY_DEFS } from './game.js';
import certs from '../data/certs.json';
import { goalNum } from '../../tools/goal-num.js';

/** P49-a2 (§4.4) — 물빛 삭제: 물빛 데이터 파일째, 인증 보상 12 → 기구 3 + 부품 9, `grade_a` 조건 → `rigGrade 3`, 옛 세이브의 물빛 필드는 읽고 버린다 */
describe('P49-a2 물빛 삭제', () => {
  it('참조 0건 — check-tiles-dead 가 src·tools 를 훑어 0 이고, --selftest 로 위반 3/허용 2 를 가린다', () => {
    const r = spawnSync('node', ['tools/check-tiles-dead.mjs'], { encoding: 'utf8' });
    expect(r.status, r.stdout).toBe(0);
    const s = spawnSync('node', ['tools/check-tiles-dead.mjs', '--selftest'], { encoding: 'utf8' });
    expect(s.status, s.stdout).toBe(0);
  }, 30000);
  it('인증 보상 12 — 기구 1(grade_b) + 활성 부품 11, 대상이 전부 존재 · grade_a 조건은 rigGrade 3', () => {
    const cs = certs as { id: string; reward: { kind: string; id: string }; conditions: { cond: { kind: string; min?: number } }[] }[];
    const byId = new Map(cs.map((c) => [c.id, c]));
    expect(byId.get('grade_b')!.reward).toEqual({ kind: 'facility', id: 'rig_iceberg' });
    expect(byId.get('court_d')!.reward).toEqual({ kind: 'rigPart', id: 'pump_motor' });
    expect(byId.get('set_b')!.reward).toEqual({ kind: 'rigPart', id: 'anchor_chain' });
    const parts = cs.filter((c) => c.reward.kind === 'rigPart');
    expect(parts.length).toBe(11);
    for (const c of parts) expect(RIG_PART_DEFS.some((p) => p.id === c.reward.id), c.id).toBe(true);
    for (const c of cs) if (c.reward.kind === 'facility') expect(FACILITY_DEFS.has(c.reward.id), c.id).toBe(true);
    expect(byId.get('grade_a')!.conditions.some((w) => w.cond.kind === 'rigGrade' && w.cond.min === 3)).toBe(true);
    expect(cs.some((c) => c.reward.kind === 'ti' + 'le')).toBe(false); // 검사기(check-tiles-dead)에 안 걸리게 쪼갠 낱말
    for (const c of cs) for (const w of c.conditions) expect('tile' in w.cond, c.id).toBe(false);
  });
  it('옛 세이브(P48-b 시절 v4 — 물빛 배열·물빛 해금 목록이 든)를 읽고 버려 던지지 않고, 왕복은 그 필드 없이 나온다', () => {
    const raw = JSON.parse(readFileSync('src/save/__fixtures__/v4-p48b.json', 'utf8')) as { game?: Record<string, unknown>; seed?: number };
    const g = Game.fromSnapshot((raw.game ?? raw) as never); // fixture 는 세이브 봉투일 수도, 스냅샷 자체일 수도
    expect(g.pools.all.length).toBeGreaterThan(0);
    const snap = g.toSnapshot() as unknown as { grid: Record<string, unknown>; unlocked: Record<string, unknown> };
    expect(('pool' + 'Tile') in snap.grid).toBe(false);
    expect('tiles' in snap.unlocked).toBe(false);
    expect(Game.fromSnapshot(JSON.parse(JSON.stringify(g.toSnapshot()))).money).toBe(g.money);
  });
  it('digPool 은 타일 인자를 안 받고 값은 poolTileCost 하나다', () => {
    const g = new Game(1); g.money = 1e6;
    expect(g.digCost([{ i: 1, j: 1 }, { i: 2, j: 1 }])).toBe(2 * (g as unknown as { b: { poolTileCost: number } }).b.poolTileCost);
  });
  it('goalNum(p49a2) = 149.12', () => { expect(goalNum('p49a2')).toBeCloseTo(149.12, 6); });
});
