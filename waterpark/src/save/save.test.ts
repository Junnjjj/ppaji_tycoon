import { describe, it, expect } from 'vitest';
import { TICKS_PER_DAY } from '../sim/clock.js';
import { migrate, MIGRATIONS, SAVE_VERSION, save, load } from './save.js';
import { Game } from '../sim/game.js';
import { scoreOf, carryoverOf, applyCarryover } from '../sim/endgame.js';

const mem = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };

describe('세이브 마이그레이션', () => {
  it('체인 길이 = 버전 − 1, v1 세이브가 v2 로 올라오며 새 필드가 기본값', () => {
    expect(MIGRATIONS.length).toBe(SAVE_VERSION - 1);
    const g = new Game(1);
    const v1 = { version: 1, savedAt: 'x', game: { ...g.toSnapshot() } } as unknown as Record<string, unknown>;
    delete (v1['game'] as Record<string, unknown>)['ticketBonus'];
    delete (v1['game'] as Record<string, unknown>)['endingSeen'];
    const out = migrate(v1);
    expect(out?.version).toBe(2);
    expect(out?.game.ticketBonus).toBe(0);
    expect(out?.game.endingSeen).toBe(false);
    expect(Game.fromSnapshot(out!.game).toSnapshot().ticketBonus).toBe(0);
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
    g.unlocked.facilities.add('cabana');
    g.cooking.known.add('affogato');
    g.cooking.exp = 500;
    const c = carryoverOf(g, null);
    expect(c.facilities).toContain('cabana');
    expect(c.recipes).toContain('affogato');
    expect(c.ticketBase).toBe(260); // 200 + floor(60/10)*10
    expect(c.runs).toBe(1);
    const n = new Game(6);
    applyCarryover(n, c);
    expect(n.money).toBe(n.b.startMoney);
    expect(n.pools.all.length).toBe(1); // 시작 킷의 풀 하나 (G25) — 옛 판의 풀은 안 넘어온다
    expect(n.pools.totalTiles()).toBe(20);
    expect(n.unlocked.facilities.has('cabana')).toBe(true);
    expect(n.cooking.exp).toBe(500);
    expect(n.ticketBonus).toBe(60);
    const c2 = carryoverOf(n, c);
    expect(c2.runs).toBe(2);
    expect(c2.bestScore).toBeGreaterThanOrEqual(c.bestScore);
  });
});
