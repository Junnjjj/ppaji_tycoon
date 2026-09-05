import { describe, it, expect } from 'vitest';
import areasJson from '../data/areas.json';
import type { AreaDef } from '../data/schema.js';
import { tasteWeight } from './guest.js';
import { Game } from './game.js';
import { TICKS_PER_DAY } from './clock.js';

const areas = areasJson as unknown as AreaDef[];

/** P9 — 출신지 취향: 데이터 · 가중 함수 · 손님이 취향을 안고 태어난다 · 뽑기 횟수 불변(골든이 지킨다) */
describe('P9 출신지 취향', () => {
  it('출신지 10 이 전부 취향 다섯 값을 갖고 0.3~2.5 · 치우침 ±3 안이다', () => {
    for (const a of areas) {
      const t = a.taste;
      expect(t, a.id).toBeTruthy();
      if (!t) continue;
      for (const k of ['water', 'thrill', 'food', 'rest'] as const) { expect(t[k], `${a.id}.${k}`).toBeGreaterThanOrEqual(0.3); expect(t[k]).toBeLessThanOrEqual(2.5); }
      expect(Math.abs(t.tempBias), a.id).toBeLessThanOrEqual(3);
    }
    const thrills = areas.map((a) => a.taste?.thrill ?? 1);
    expect(Math.max(...thrills) - Math.min(...thrills)).toBeGreaterThan(0.8); // 출신지끼리 정말 다르다
  });

  it('tasteWeight 는 분류에 맞는 축을 고르고 취향이 없으면 1 이다', () => {
    const t = { water: 1, thrill: 2, food: 0.5, rest: 1.5, tempBias: 0 };
    expect(tasteWeight('attraction', 0, t)).toBe(2);
    expect(tasteWeight('slide', 0, t)).toBe(2);
    expect(tasteWeight('restaurant', 5, t)).toBe(0.5);
    expect(tasteWeight('lounging', 0, t)).toBe(1.5);
    expect(tasteWeight('utility', 0, t)).toBe(1);
    expect(tasteWeight('attraction', 0, undefined)).toBe(1);
  });

  it('하루를 돌리면 손님들이 출신지 취향을 안고 있고, 군부대 취향은 스릴이 높다', () => {
    const g = new Game(1);
    g.step(Math.floor(TICKS_PER_DAY * 0.6)); // 폐장 전 — 폐장하면 손님 목록이 비워진다
    const withTaste = g.guests.all.filter((x) => x.taste);
    expect(g.guests.all.length).toBeGreaterThan(0);
    expect(withTaste.length).toBe(g.guests.all.length);
    const station = areas.find((a) => a.id === 'station')?.taste;
    expect(station?.thrill).toBeGreaterThan(1.4);
  });
});
