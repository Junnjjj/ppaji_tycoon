import { describe, it, expect } from 'vitest';
import { Game } from './game.js';
import storyJson from '../data/story.json';

/** G53 — 리텐션 5차: 친구 글 좋아요 → 소원 EXP · 후반 인물 비트 · 수집 분모 */
describe('G53', () => {
  it('친구 글에 좋아요를 누르면 그 친구의 소원 EXP 가 오른다 (일반 손님 글은 그대로)', () => {
    const g = new Game(53, undefined, { kit: false });
    const f = g.sns.unlockedFriends[0]!;
    const areaId = g.sns.areas[0]!;
    const mk = (id: number, friendId: string | null): void => { (g.sns as unknown as { posts: object[] }).posts.push({ id, day: g.day, tick: g.tick, friendId, areaId, subject: { kind: 'pool', ref: 1, name: '풀' }, likes: 0, playerLiked: false, growUntilDay: g.day + 2, palette: 0 }); };
    mk(1001, f.id); mk(1002, null);
    const exp0 = f.exp;
    const r1 = g.likePost(1001);
    expect(r1.ok).toBe(true);
    expect(r1.friend?.exp).toBe(12);
    expect(f.exp - exp0).toBe(12);
    const r2 = g.likePost(1002);
    expect(r2.ok).toBe(true);
    expect(r2.friend).toBeUndefined();
    expect(f.exp - exp0).toBe(12);
  });

  it('사장 비트가 4·6·7년차에도 있고 엔딩 비트가 마지막이다', () => {
    const beats = (storyJson as { beats: { id: string; trigger: { kind: string; min?: number } }[] }).beats;
    const years = beats.filter((b) => b.trigger.kind === 'year').map((b) => b.trigger.min);
    for (const y of [2, 3, 4, 5, 6, 7, 8]) expect(years).toContain(y);
    expect(beats[beats.length - 1]!.id).toBe('ending');
  });

  it('수집 분모는 데이터 크기다', () => {
    const g = new Game(1, undefined, { kit: false });
    expect(g.giftCount).toBe(18);
    expect(g.sns.friendCount).toBe(71);
    expect(g.facilities.defsCount).toBe(214); // 2026-09-20 실내 제작본 별도 크기 5종 + P58-a 푸드코트 자리(파생) 1 + P57-b env 장식 29 + P0 선착장 + P3 안전 소품 2 + P42 입구 + P45-b 실내 점포 9 + P49-a1 기구 21 + P51 개조판 20 + 2026-09-19 승인 조합 2 + 승하선 데크 1 (폐기 9종은 정의가 남는다 — 옛 세이브 호환)
  });
});
