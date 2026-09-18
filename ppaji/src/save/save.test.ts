import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TICKS_PER_DAY } from '../sim/clock.js';
import { migrate, MIGRATIONS, SAVE_VERSION, save, load } from './save.js';
import { Game } from '../sim/game.js';
import { scoreOf, carryoverOf, applyCarryover } from '../sim/endgame.js';
import { loadProfile, saveProfile } from './profile.js';

const mem = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };

describe('세이브 마이그레이션', () => {
  it('P60-a — v4 fixture(소품이 든 풀 3 · unlocked.items 7 · presets)는 v5 로 올라가고 같은 판이 로드된다(새 판 아님) · items/presets 는 읽고 버린다', () => {
    const fx = JSON.parse(readFileSync(new URL('./__fixtures__/v4-p48b.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const pools = (fx['pools'] as { pools: Record<string, unknown>[] }).pools;
    expect(pools.some((p) => Array.isArray(p['items']) && (p['items'] as unknown[]).length > 0)).toBe(true); // fixture 에 소품이 실제로 있다 — 없으면 이 검사는 아무것도 안 잰다
    expect(((fx['unlocked'] as Record<string, unknown>)['items'] as unknown[]).length).toBeGreaterThan(0);
    const f = migrate({ version: 4, savedAt: 'x', game: fx });
    expect(f?.version).toBe(SAVE_VERSION);
    const game = f!.game as unknown as Record<string, unknown>;
    expect(game['presets']).toBeUndefined();
    expect((game['unlocked'] as Record<string, unknown>)['items']).toBeUndefined();
    for (const p of (game['pools'] as { pools: Record<string, unknown>[] }).pools) expect(p['items']).toBeUndefined();
    expect(game['money']).toBe(fx['money']); // 판은 그대로 — 새 판이 아니다
    const g = Game.fromSnapshot(f!.game);
    expect(g.pools.all.length).toBe(pools.length);
    expect(g.money).toBe(fx['money']);
    expect(pools.some((p) => Array.isArray(p['items']))).toBe(true); // 원본 객체는 안 건드린다(사본으로 버린다)
  });
  it('체인 길이 = 버전 − 1, v1 → v2 단계가 새 필드를 기본값으로 채운다 · v3 이하는 P48-b1(지형이 다르다)에서 새 판(null)', () => {
    expect(MIGRATIONS.length).toBe(SAVE_VERSION - 1);
    const g = new Game(1);
    const v1 = { version: 1, savedAt: 'x', game: { ...g.toSnapshot() } } as unknown as Record<string, unknown>;
    delete (v1['game'] as Record<string, unknown>)['ticketBonus'];
    delete (v1['game'] as Record<string, unknown>)['endingSeen'];
    const step = MIGRATIONS[0]!(v1) as { version: number; game: { ticketBonus: number; endingSeen: boolean } };
    expect(step.version).toBe(2);
    expect(step.game.ticketBonus).toBe(0);
    expect(step.game.endingSeen).toBe(false);
    expect(migrate(v1)).toBeNull(); // v3 → v4 가 새 판
  });
  it('P43 — 격자 크기가 다른 옛 세이브(64×48)는 null(새 판)', () => {
    const g = new Game(1);
    const old = { version: 2, savedAt: 'x', game: { ...g.toSnapshot(), grid: { w: 64, h: 48, floor: new Array(64 * 48).fill(1) } } } as unknown as Record<string, unknown>;
    expect(migrate(old)).toBeNull();
    const cur = { version: 2, savedAt: 'x', game: g.toSnapshot() } as unknown as Record<string, unknown>;
    expect(migrate(cur)).toBeNull(); // P48-b1: v3 이하는 전부 새 판
    const now = { version: SAVE_VERSION, savedAt: 'x', game: g.toSnapshot() } as unknown as Record<string, unknown>;
    expect(migrate(now)?.version).toBe(SAVE_VERSION);
  });
  it('모르는 버전은 null', () => {
    expect(migrate({ version: 99 })).toBeNull();
    expect(migrate({})).toBeNull();
  });
  it('저장 → 불러오기 왕복', () => {
    const st = mem();
    const g = new Game(2);
    g.step(100);
    save(g.toSnapshot(), st, new Date(0));
    const f = load(st);
    expect(f?.version).toBe(SAVE_VERSION);
    expect(Game.fromSnapshot(f!.game).toSnapshot()).toEqual(g.toSnapshot());
  });
});

describe('엔딩 · 뉴게임+', () => {
  it('점수식 = 인기×10 + 방문 + 좋아요 + 친구×10 + 인증×10 + 레시피×5', () => {
    const g = new Game(3);
    g.step(TICKS_PER_DAY * 2);
    const s = scoreOf(g);
    expect(s.total).toBe(s.popularity + s.visitors + s.likes + s.friends + s.certs + s.recipes);
    expect(s.recipes).toBe(g.cooking.known.size * 5);
    expect(s.friends).toBe(g.sns.unlockedFriends.length * 10);
  });
  it('128일이 끝나면 시간이 서고, 엔딩을 본 뒤엔 이어진다', () => {
    const g = new Game(4);
    g.day = 127;
    g.tick = TICKS_PER_DAY - 1;
    g.step(5);
    expect(g.day).toBe(128);
    expect(g.haltedForEnding).toBe(true);
    const t = g.tick;
    g.step(10);
    expect(g.tick).toBe(t);
    g.endingSeen = true;
    g.step(10);
    expect(g.tick).toBe(t + 10);
  });
  it('이월 — 레시피·EXP·해금 시설·선물·타일·티켓 ×0.3 은 넘어가고 돈·풀은 안 넘어간다', () => {
    const g = new Game(5);
    g.money = 999999;
    g.unlocked.facilities.add('bungalow');
    g.cooking.known.add('affogato');
    g.cooking.exp = 500;
    const c = carryoverOf(g, null);
    expect(c.facilities).toContain('bungalow');
    expect(c.recipes).toContain('affogato');
    expect(c.ticketBase).toBe(260); // 200 + floor(60/10)*10
    expect(c.runs).toBe(1);
    const n = new Game(6);
    applyCarryover(n, c);
    expect(n.money).toBe(n.b.startMoney);
    expect(n.pools.all.length).toBe(1); // 시작 킷의 풀 하나 (G25) — 옛 판의 풀은 안 넘어온다
    expect(n.pools.totalTiles()).toBe(20);
    expect(n.unlocked.facilities.has('bungalow')).toBe(true);
    expect(n.cooking.exp).toBe(500);
    expect(n.ticketBonus).toBe(60);
    const c2 = carryoverOf(n, c);
    expect(c2.runs).toBe(2);
    expect(c2.bestScore).toBeGreaterThanOrEqual(c.bestScore);
  });
});

describe('프로필 v2 (P53-b)', () => {
  it('저장소 왕복 — 로더가 v2 를 버리면 엔딩 뒤 배속·NG+ 가 조용히 죽는다(하네스 G11 이 잡았다) · v1 도 그대로 읽는다', () => {
    const g = new Game(7); g.money = 1e6;
    const c = carryoverOf(g, null);
    expect(c.version).toBe(2);
    const store = new Map<string, string>();
    saveProfile(c, { setItem: (k, v) => { store.set(k, v); } });
    expect(loadProfile({ getItem: (k) => store.get(k) ?? null })).toEqual(c);
    store.set('pj.profile', JSON.stringify({ version: 1, recipes: [], cookingExp: 0, facilities: [], gifts: [], tiles: ['pink'], ticketBase: 200, bestScore: 0, runs: 1 }));
    expect(loadProfile({ getItem: (k) => store.get(k) ?? null })?.version).toBe(1);
    store.set('pj.profile', JSON.stringify({ version: 9 }));
    expect(loadProfile({ getItem: (k) => store.get(k) ?? null })).toBeNull();
  });
});
