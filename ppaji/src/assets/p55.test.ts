import { describe, it, expect } from 'vitest';
import { rigTemplate, TEMPLATES, DEFAULT_BY_CLASS } from './draw/fac-sprites.js';
import facilitiesJson from '../data/facilities.json';
import ranksJson from '../data/ranks.json';

type Def = { id: string; class: string; w: number; d: number; tall?: boolean };
const defs = facilitiesJson as Def[];

/** P55 — 절차 폴백 실루엣 셋: 그림이 오기 전 21종이 한 덩어리로 보이면 안 된다(H44) */
describe('P55 폴백 실루엣 셋 · 계약 · 페이싱 스윕', () => {
  it('rigTemplate — tall 은 tower · 긴 판은 plank · 나머지 floatPad, 셋 다 실제 기구에서 쓰인다', () => {
    const rigs = defs.filter((d) => d.class === 'rig' || d.id === 'watchtower');
    const used = new Set(rigs.map((d) => rigTemplate(d).tpl));
    expect([...used].sort()).toEqual(['floatPad', 'plank', 'tower']);
    expect(rigTemplate(defs.find((d) => d.id === 'diving')!).tpl).toBe('tower');
    expect(rigTemplate(defs.find((d) => d.id === 'rig_blob')!).tpl).toBe('plank');
    expect(rigTemplate(defs.find((d) => d.id === 'rig_stepstone')!).tpl).toBe('floatPad');
    expect(DEFAULT_BY_CLASS['rig']?.tpl).toBe('floatPad');
  });
  it('세 템플릿의 실루엣이 다르다 — tower 는 floatPad 보다 높고, plank 는 넓고 낮다', () => {
    const dims = (t: string): { w: number; h: number } => { const rows = TEMPLATES[t]!.rows; return { w: Math.max(...rows.map((r) => r.length)), h: rows.length }; };
    const f = dims('floatPad'), t = dims('tower'), p = dims('plank');
    expect(t.h).toBeGreaterThan(f.h + 3);
    expect(p.w).toBeGreaterThan(f.w + 4);
    expect(p.h).toBeLessThan(f.h);
  });
  it('밸런스 스윕 — 랭크 친구 문턱이 봇 실측 곡선(Y1 7 · Y3 14~18 · Y5 27~32 · Y7 34~40) 안에 있고 단조', () => {
    const ranks = (ranksJson as { star: number; conditions: { kind: string; min: number }[] }[]);
    const friends = ranks.map((r) => r.conditions.find((c) => c.kind === 'friends')?.min ?? 0);
    expect(friends).toEqual([0, 9, 14, 26, 38]);
    for (let k = 1; k < friends.length; k++) expect(friends[k]).toBeGreaterThan(friends[k - 1] ?? -1);
    const pop = ranks.map((r) => r.conditions.find((c) => c.kind === 'popularity')?.min ?? 0);
    expect(pop[4]).toBe(4000);
  });
});
