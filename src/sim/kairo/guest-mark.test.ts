import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_GUEST_MARKS } from './guests.js';

/**
 * ⚠ **주석은 뺀다** — 「예전엔 이랬다」를 못 적게 하는 규칙이 아니다
 * (`check-ui-surface.mjs` 의 하드코딩 hex 검사와 같은 자리). 규칙 안의 코드만 잡는다.
 */
const strip = (t: string): string =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const scene = strip(
  readFileSync(new URL('../../render/scenes/KairoScene.ts', import.meta.url), 'utf8'),
);
const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
const guests = readFileSync(new URL('./guests.ts', import.meta.url), 'utf8');

describe('지도 표식은 sim 이 정한다 (P7)', () => {
  it('렌더는 고르지 않는다 — `characterId ? love` 하드코딩이 없다', () => {
    /*
     * ⚠ 예전에는 씬이 직접 골랐다. 그러면 「누구에게 무엇이 뜨나」가 렌더 코드에 숨어
     * 단위 검사가 못 잰다 — 규칙은 sim 이 갖는다.
     */
    expect(scene).not.toMatch(/characterId \? 'love'/);
    expect(scene).toMatch(/e_\$\{g\.mark \?\? g\.emote\}/);
  });

  it('동시에 셋까지다 — 넷이면 지도가 말풍선밭이 된다', () => {
    expect(MAX_GUEST_MARKS).toBe(3);
    expect(guests).toMatch(/slice\(0, MAX_GUEST_MARKS\)/);
  });

  it('우선순위가 요청 > 소원 > 나머지다 · 같은 순위는 id 순(결정론)', () => {
    expect(guests).toMatch(/requests\?\.has\(id\) === true\) return 0/);
    expect(guests).toMatch(/wishes\?\.has\(id\) === true\) return 1/);
    expect(guests).toMatch(/a\.id - b\.id/);
  });

  it('이름 없는 1,200 에이전트는 대상이 아니다', () => {
    expect(guests).toMatch(/characterId !== undefined && g\.characterId !== ''/);
  });
});

describe('손님 탭은 더블탭 파이프를 탄다 (P7)', () => {
  it('탭 시점 id 를 잡고 지연 뒤 그 id 로 다시 찾는다', () => {
    /*
     * ⚠ 손님은 걸어 다닌다. 320ms 뒤 **좌표로** 다시 찾으면 엉뚱한 손님이 열린다.
     */
    expect(main).toContain('scheduleGuestTalk');
    expect(main).toMatch(/scheduleGuestTalk = \(guestId: number\)/);
    expect(main).toMatch(/all\.find\(\(x\) => x\.id === guestId\)/);
    /*
     * 그 사이 나갔으면 조용히 아무것도 안 한다.
     *
     * ⚠ **Q9 에서 조건이 좁아졌다** — 예전에는 `!g || g.mark === null` 이라 표식이 없는
     * 손님은 탭해도 아무 일이 없었다. 지금은 **모든 손님이 말을 하고**(RCT 의 「생각」),
     * 표식이 있는 손님만 `목표` 화면으로 간다. 「없어졌으면 아무것도 안 한다」는 그대로다.
     */
    expect(main).toMatch(/if \(!g\) return;/);
    expect(main).toMatch(/guestVoice\(g,/);
  });

  it('말풍선을 단 손님이 시설보다 먼저다', () => {
    const at = main.indexOf('const marked = h.guests.all.find');
    const hit = main.indexOf('const hit = h.placement.at(i, j);', at);
    expect(at).toBeGreaterThan(0);
    expect(hit).toBeGreaterThan(at);
  });

  it('새 화면을 안 만든다 — `목표` 로 간다 (P1 의 섹션 넷)', () => {
    // ⚠ 창이 900 → 1600 이다: Q9 가 「손님이 말을 한다」 주석과 코드를 그 사이에 넣었다
    expect(main).toMatch(/scheduleGuestTalk[\s\S]{0,1600}openManageScreen\('goals'\)/);
  });

  it('⚠ 이름 없는 손님은 **말만 하고 화면을 안 바꾼다** (Q9)', () => {
    /*
     * 지도를 보다가 툭 눌러 본 것이 화면 전환이 되면 「지도가 주인공」이 깨진다.
     * 표식이 있는 손님(요청·소원·단골)만 `목표` 로 데려간다.
     */
    expect(main).toMatch(/if \(g\.mark !== null && g\.mark !== 'hot'\) openManageScreen\('goals'\);/);
  });
});

describe('안 쓰이던 슬롯을 실제로 심었다 (P7)', () => {
  it('`sfx/grade-up` 이 승급에서 울린다 — 호출부가 0 이었다', () => {
    expect(main).toContain("audio.play('sfx/grade-up')");
  });

  it('`hot` 이 더위에 뜬다 — 호출부가 0 이었다', () => {
    expect(guests).toMatch(/this\.heat \? 'hot' : 'neutral'/);
    const week = readFileSync(new URL('./week.ts', import.meta.url), 'utf8');
    // ⚠ 손님은 날씨를 모른다 — 러너가 넣어 준다
    expect(week).toMatch(/setHeat\(weather === 'heat'\)/);
  });

  it('피드는 종류를 갖되 **탭을 안 만든다**', () => {
    const ticker = readFileSync(new URL('../../ui/kairo-ticker.ts', import.meta.url), 'utf8');
    expect(ticker).toMatch(/export type FeedKind = 'news' \| 'request' \| 'review'/);
    expect(ticker).toMatch(/dataset\['feedKind'\]/);
    // 종류 탭을 만들면 「어디서 봤더라」가 생긴다 (P1 이 목록 넷을 합친 것과 같은 실수)
    expect(ticker).not.toMatch(/data-feed-tab|feedTab/);
  });
});

/**
 * ── Q7: 후보를 넓힌다 (개수는 그대로) ──────────────────────────────────────
 *
 * ⚠ 실측(2026-08-28): 손님 15명 중 **이름 있는 손님 0명 · 표식 0개**. 단골 방문이
 * 주당 1명이라 P7 의 「이름 있는 손님만」이 **사실상 안 뜨는 기능**이었다.
 */
describe('Q7 — 말풍선이 실제로 뜬다', () => {
  it('이름 없는 손님도 **아주 불만이면** 표식을 받는다', () => {
    expect(guests).toContain('UNHAPPY_MARK_BELOW');
    // 문턱은 표정 눈금에서 유도한다 — `annoyed` 가 25 미만이다
    expect(guests).toMatch(/UNHAPPY_MARK_BELOW = 25/);
    expect(guests).toMatch(/g\.satisfaction < UNHAPPY_MARK_BELOW/);
  });

  it('★ 동시 상한은 그대로다 — 넓힌 것은 후보지 개수가 아니다', () => {
    expect(guests).toMatch(/slice\(0, MAX_GUEST_MARKS\)/);
    expect(guests).toMatch(/MAX_GUEST_MARKS = 3/);
  });

  it('이름 있는 손님이 언제나 이긴다 — 아는 사람이 안 묻힌다', () => {
    // rank: 요청 0 · 소원 1 · 이름 있음 2 · 이름 없는 불만 3
    expect(guests).toMatch(/return 3;\s*\};/);
    expect(guests).toMatch(/r === 2 \? 'love' : 'hot'/);
  });

  it('⚠ 아직 입장 안 한 손님은 대상이 아니다 — 못 바꾸는 구간이다', () => {
    expect(guests).toMatch(/g\.state !== 'arriving'/);
  });

  it('`hot` 은 이미 있는 프레임을 재사용한다 — 새 그림 0장', () => {
    expect(guests).toMatch(/\| 'hot';/);
    // `GuestEmote` 에 이미 있다
    expect(guests).toMatch(/\| 'hot'\n/);
  });
});
