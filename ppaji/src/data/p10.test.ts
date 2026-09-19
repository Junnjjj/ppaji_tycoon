import rigsJson from './rigs.json';
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import facilitiesJson from './facilities.json';
import ingredientsJson from './ingredients.json';
import partsJson from './parts.json';
import gearsJson from './gears.json';
import giftsJson from './gifts.json';
import wishesJson from './wishes.json';
import certsJson from './certs.json';
import calendarJson from './calendar.json';
import investJson from './invest.json';
import shopJson from './shop.json';
import ranksJson from './ranks.json';
import areasJson from './areas.json';
import equipmentJson from './equipment.json';

/** P10 — 데이터 전량: 모든 콘텐츠가 어딘가에서 열리고(막다른 것 0), 이름은 한글이며 원작 낱말이 없다 */
const facilities = facilitiesJson as unknown as { id: string; unlock: { source: string; ref?: string; rank?: number }; buildable?: boolean; deprecated?: boolean }[]; // 2026-09-19: 폐기(조합 흡수) 시설을 가려내려면 두 필드가 필요하다
const ingredients = ingredientsJson as unknown as { id: string; unlock: string }[];
const parts = partsJson as unknown as { id: string; unlock: string }[];
const gears = gearsJson as unknown as { id: string; unlock: string }[];
const gifts = giftsJson as unknown as { id: string; unlock: string }[];
const wishes = wishesJson as unknown as { reward: { kind: string; id?: string } }[];
const certs = certsJson as unknown as { reward: { kind: string; id: string } }[];
const calendar = calendarJson as unknown as { grant: { kind: string; id?: string } }[];
const invest = investJson as unknown as { id: string; unlocks: string[] }[];
const shop = shopJson as unknown as { kind: string; ref: string }[];
const ranks = ranksJson as unknown as { reward?: { kind: string; id?: string } }[];
const areas = areasJson as unknown as { likeRewards?: { grant: { kind: string; id?: string } }[] }[];
const equipment = (equipmentJson as unknown as { equipment: { id: string; start?: boolean }[] }).equipment;

const grantedIds = new Set<string>();
for (const w of wishes) if (w.reward.id) grantedIds.add(w.reward.id);
for (const c of certs) grantedIds.add(c.reward.id);
for (const c of calendar) if (c.grant.id) grantedIds.add(c.grant.id);
for (const r of ranks) if (r.reward?.id) grantedIds.add(r.reward.id);
for (const a of areas) for (const lr of a.likeRewards ?? []) if (lr.grant.id) grantedIds.add(lr.grant.id);
const investUnlocks = new Set(invest.flatMap((i) => i.unlocks));
const shopRefs = new Set(shop.map((s) => s.ref));

describe('P10 도달성 — 막다른 콘텐츠 0', () => {
  it('시설 전부가 시작·장날·투자·선물·소원·인증·랭크·개조(P51) 중 하나로 열린다 — 폐기(조합에 흡수) 시설은 **일부러** 닫혀 있다', () => {
    const craftTargets = new Set((rigsJson as { to: string }[]).map((r) => r.to));
    // 2026-09-19 조합 채택: 흡수된 29종은 옛 세이브 호환으로 정의만 남고 새로 얻을 길이 **없어야** 한다.
    // 그러니 도달성 검사에서 빼는 것이 아니라, 「닿을 수 없음」을 따로 못박는다 (아래 두 줄이 음성 대조군이다).
    const retired = facilities.filter((f) => f.deprecated === true);
    expect(retired.length, '폐기 시설이 하나는 있다').toBeGreaterThan(0);
    for (const f of retired) {
      expect(f.buildable, `${f.id} 은 건설 목록에 없다`).toBe(false);
      expect(f.unlock.source === 'craft' && !craftTargets.has(f.id), `${f.id} 은 개조 레시피로도 못 닿는다`).toBe(true);
      expect(grantedIds.has(f.id) || investUnlocks.has(f.id) || shopRefs.has(f.id), `${f.id} 은 보상·투자·장날 어디에도 없다`).toBe(false);
    }
    for (const f of facilities.filter((x) => x.deprecated !== true)) {
      const u = f.unlock;
      const ok = u.source === 'start' || (u.source === 'craft' && craftTargets.has(f.id)) /* P51: 개조판은 레시피 `to` 로 닿는다 */ || (u.source === 'shop' && (shopRefs.has(f.id) || (u.rank ?? 0) > 0)) || (u.source === 'invest' && investUnlocks.has(f.id)) || grantedIds.has(f.id) || ['gift', 'wish', 'cert', 'rank'].includes(u.source);
      expect(ok, `${f.id} unlock ${JSON.stringify(u)}`).toBe(true);
    }
  });
  it('부표·재료·부품·선물 전부가 열리는 출처를 갖는다 (P60-a: 소품 삭제)', () => {
    const openBy = (id: string, unlock: string): boolean => unlock === 'start' || unlock === 'shop' || unlock === 'year' || unlock === 'cook' || unlock === 'cert' || grantedIds.has(id); // cert = 재수상 때 무작위 지급(game.ts)
    for (const x of [...ingredients, ...parts, ...gifts]) expect(openBy(x.id, x.unlock), `${x.id} (${x.unlock})`).toBe(true);
  });
  it('기구 전부가 시작이거나 공방 레시피로 만들 수 있다', () => {
    const gearIds = new Set(gears.filter((g) => g.unlock !== 'fail').map((g) => g.id));
    for (const e of equipment) expect(e.start === true || gearIds.has(e.id), e.id).toBe(true);
  });
});

/** 원작 낱말 — 데이터의 사람이 읽는 문자열에 남아 있으면 안 된다 (id·$comment 는 제외) */
const OLD = ['카이로', '펌킨', '워터파크', '풀장', '데크체어', '제트풀', '카바나', 'Pool Slide', '라무네'];
const TEXT_KEYS = new Set(['name', 'desc', 'line', 'text', 'title', 'body', 'label', 'bus', 'role']);

function walk(v: unknown, path: string, out: { path: string; text: string }[]): void {
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, out)); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === '$comment') continue;
      if (TEXT_KEYS.has(k) && typeof x === 'string') out.push({ path: `${path}.${k}`, text: x });
      else walk(x, `${path}.${k}`, out);
    }
  }
}

describe('P10 낱말 — 한글 이름 · 원작 낱말 0', () => {
  it('모든 데이터 파일의 name/desc/line/text/title 에 원작 낱말이 없고 name 은 한글을 품는다', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url)); // 한글 경로는 pathname 이 퍼센트 인코딩이라 못 쓴다
    const bad: string[] = [];
    let names = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown;
      const out: { path: string; text: string }[] = [];
      walk(data, file, out);
      for (const { path, text } of out) {
        for (const w of OLD) if (text.includes(w)) bad.push(`${path} 「${text.slice(0, 30)}」 에 ${w}`);
        if (path.endsWith('.name') && text !== '_') { names++; if (!/[가-힣]/.test(text)) bad.push(`${path} 「${text}」 한글 없음`); }
      }
    }
    expect(names).toBeGreaterThan(400);
    expect(bad, bad.slice(0, 10).join(' | ')).toEqual([]);
  });
});
