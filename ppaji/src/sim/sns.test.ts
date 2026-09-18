import { describe, it, expect } from 'vitest';
import { SnsStore, SNS_DEFAULTS } from './sns.js';
import { Rng } from './rng.js';
import type { AreaDef, FriendDef, WishDef, GiftDef } from '../data/schema.js';

const areas: AreaDef[] = [{ id: 'a', name: 'A', order: 0, likesToUnlockNext: 100 }, { id: 'b', name: 'B', order: 1, likesToUnlockNext: 100 }];
const friends: FriendDef[] = [
  { id: 'f1', name: '하나', area: 'a', age: 10, gender: 'F', fav: { food: 'x' }, start: true, invitedBy: null, palette: 0 },
  { id: 'f2', name: '둘', area: 'a', age: 20, gender: 'M', fav: { food: 'x' }, start: false, invitedBy: { friend: 'f1', star: 1 }, palette: 1 },
  { id: 'f3', name: '셋', area: 'b', age: 20, gender: 'M', fav: { food: 'x' }, start: true, invitedBy: null, palette: 2 },
];
const wishes: WishDef[] = [
  { friendId: 'f1', idx: 0, condition: { kind: 'pool', sizeMin: 4 }, reward: { kind: 'money', amount: 100 }, line: '풀!' },
  { friendId: 'f1', idx: 1, condition: { kind: 'pool', sizeMin: 8 }, reward: { kind: 'money', amount: 200 }, line: '더 큰 풀!' },
  { friendId: 'f1', idx: 2, condition: { kind: 'pool', sizeMin: 12 }, reward: { kind: 'money', amount: 300 }, line: '엄청 큰 풀!' },
];
const gifts: GiftDef[] = [{ id: 'tube', name: '튜브', kind: 'float', price: 800, unlock: 'start' }];
const mk = () => new SnsStore(areas, friends, wishes, gifts, new Rng(1), { ...SNS_DEFAULTS, wishExpNeed: [50, 100, 150], wishWindowDays: 3 });

describe('SNS', () => {
  it('첫 지역의 시작 친구만 해금, 다음 지역 친구는 잠김', () => {
    const s = mk();
    expect(s.unlockedFriends.map((f) => f.id)).toEqual(['f1']);
    expect(s.areas).toEqual(['a']);
  });
  it('EXP 가 문턱을 넘으면 소원이 열리고, 창 안에서 충족되면 ★ 이 오르며 다음 친구가 초대된다', () => {
    const s = mk();
    expect(s.addFriendExp('f1', 40, 0)).toBeNull();
    const w = s.addFriendExp('f1', 20, 0);
    expect(w?.idx).toBe(0);
    expect(s.activeWishes().length).toBe(1);
    const r = s.closeDay(0, () => true);
    expect(r.fulfilled.length).toBe(1);
    expect(s.friends.get('f1')?.stars).toBe(1);
    expect(r.invited.map((f) => f.id)).toEqual(['f2']);
    expect(s.activeWishes().length).toBe(0); // EXP 60 < 100 → 다음 소원은 아직
  });
  it('창이 지나면 닫히고 4일 뒤 다시 열린다', () => {
    const s = mk();
    s.addFriendExp('f1', 60, 0);
    s.closeDay(0, () => false);
    s.closeDay(1, () => false);
    const r = s.closeDay(2, () => false);
    expect(r.expired.length).toBe(1);
    expect(s.activeWishes().length).toBe(0);
    s.closeDay(4, () => false); // day+1 = 5 < retryFrom 6
    expect(s.activeWishes().length).toBe(0);
    s.closeDay(5, () => false); // day+1 = 6 ≥ retryFrom 6
    expect(s.activeWishes().length).toBe(1);
  });
  it('창 안에 한 번 충족(markMet)이면 폐장 때 조건이 사라져도 성립한다', () => {
    const s = mk();
    s.addFriendExp('f1', 60, 0);
    s.markMet(() => true);
    const r = s.closeDay(0, () => false);
    expect(r.fulfilled.length).toBe(1);
  });
  it('좋아요가 지역 문턱을 넘으면 다음 지역이 열리고 그 지역 시작 친구가 온다', () => {
    const s = mk();
    for (let k = 0; k < 6; k++) s.post(0, 0, 'f1', 'a', { kind: 'pool', ref: 1, name: '풀' }, 100); // 글당 24~29 → 6장이면 문턱 100 을 넘는다
    expect(s.checkAreas(1)?.area.id).toBe('b');
    expect(s.unlockedFriends.map((f) => f.id)).toContain('f3');
    expect(s.checkAreas(1)).toBeNull();
  });
  it('플레이어 좋아요는 하루 3번 +5', () => {
    const s = mk();
    const p = s.post(0, 0, null, 'a', { kind: 'pool', ref: 1, name: '풀' }, 10);
    const before = p.likes;
    expect(s.likePost(p.id).ok).toBe(true);
    expect(p.likes).toBe(before + 5);
    expect(s.likePost(p.id).ok).toBe(false);
    for (let k = 0; k < 2; k++) s.likePost(s.post(0, 0, null, 'a', { kind: 'pool', ref: 1, name: '풀' }, 10).id);
    expect(s.likePost(s.post(0, 0, null, 'a', { kind: 'pool', ref: 1, name: '풀' }, 10).id).ok).toBe(false);
  });
  it('선물은 EXP 를 올리고 같은 선물은 두 번 못 준다 · 스냅샷 왕복', () => {
    const s = mk();
    const r = s.giveGift('f1', 'tube', 0);
    expect(r.ok && r.wish?.idx).toBe(0); // 800/8 = 100 ≥ 50
    expect(s.giveGift('f1', 'tube', 0).ok).toBe(false);
    const snap = JSON.parse(JSON.stringify(s.toSnapshot()));
    const s2 = mk();
    s2.fromSnapshot(snap);
    expect(s2.toSnapshot()).toEqual(snap);
  });
});
