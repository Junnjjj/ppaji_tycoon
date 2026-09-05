import { describe, it, expect } from 'vitest';
import areasJson from './areas.json';
import friendsJson from './friends.json';
import wishesJson from './wishes.json';
import facilitiesJson from './facilities.json';
import type { AreaDef, FriendDef, WishDef, FacilityDef } from './schema.js';

const areas = areasJson as unknown as AreaDef[];
const friends = friendsJson as unknown as FriendDef[];
const wishes = wishesJson as unknown as WishDef[];
const facilities = facilitiesJson as unknown as FacilityDef[];

/** 워터파크 시절 낱말 — 소원 문장에 남아 있으면 재작성이 빠진 것 */
const OLD_WORDS = ['데크체어', '제트풀', '카바나', '핫텁', '미니 슬라이드', '카이로봇', '풀을', '풀이', '풀장', '수영장'];

/** P5 — 출신지 10·친구 71·소원 213 이 한국 빠지 어휘로 재작성됐다 */
describe('P5 출신지·친구·소원', () => {
  it('출신지 10 은 전부 버스 이름·소개를 갖고 원작 이름을 안 쓴다', () => {
    for (const a of areas) {
      expect(a.bus, a.id).toBeTruthy();
      expect(a.desc, a.id).toBeTruthy();
      expect(['주택가', '학교', '숲', '상가', '오피스', '역', '번화가', '전문가', '공항', '카이로 섬'], a.id).not.toContain(a.name);
    }
  });

  it('친구 이름은 한글(외국인은 외래어 한글 표기)이고 서로 다르다', () => {
    const names = new Set<string>();
    for (const f of friends) {
      expect(f.name, f.id).toMatch(/[가-힣]/);
      expect(names.has(f.name), `${f.id} 이름 중복 ${f.name}`).toBe(false);
      names.add(f.name);
    }
  });

  it('소원 문장 213 은 옛 낱말을 안 쓰고, 시설 조건은 그 시설의 현재 이름을 말한다', () => {
    const byId = new Map(facilities.map((f) => [f.id, f.name]));
    let checked = 0;
    for (const w of wishes) {
      for (const old of OLD_WORDS) expect(w.line.includes(old), `${w.friendId}/${w.idx} 「${w.line}」 에 옛 낱말 ${old}`).toBe(false);
      const c = w.condition as { kind: string; id?: string };
      if (c.kind === 'facility' && c.id) {
        const name = byId.get(c.id) ?? '';
        // 이름의 앞 두 글자라도 문장에 있어야 한다 (「해태 분수」 → 「해태」)
        expect(w.line.includes(name.slice(0, 2)), `${w.friendId}/${w.idx} 「${w.line}」 이 ${name} 을 안 말한다`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
