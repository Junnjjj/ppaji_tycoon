import { describe, it, expect } from 'vitest';
import { noteSeen } from './kairo-catalog.js';
import { COMBOS } from '../sim/kairo/combos.js';
import { COURSE_EQUIPMENT } from '../sim/kairo/course.js';

/**
 * 도감의 발견은 **한 번 보면 영구**다 (P3-C).
 *
 * 예전에는 탭마다 판정이 달랐다: 콤보만 누적 Set 이고 **시설은 지금 서 있어야**
 * (`placement.all()`), **장비는 지금 쓰고 있어야** (`courses.all`) 발견으로 쳤다.
 * 그래서 철거하면 도감에서 사라졌고, 코스 장비 19종은 코스를 동시에 19개 놓을 수 없어
 * **완성이 구조적으로 불가능**했다 (`docs/research/late-game-cap-proposal.md` §1.5).
 *
 * ⚠ 이 파일은 **규칙**을 잰다 (합집합이고 뺄셈이 없다). 화면이 그 규칙을 쓰는지는
 * 브라우저 검사가 본다 — DOM 을 흉내내면 "규칙은 맞는데 화면은 그대로"를 놓친다
 * (`panels.test.ts` 와 같은 태도).
 */
describe('발견은 한 번 보면 영구다 (P3-C)', () => {
  it('★ 철거해도 발견이 남는다 — 지금 없는 것을 넘겨도 빠지지 않는다', () => {
    const seen = new Set<string>();
    noteSeen(seen, ['shop', 'sauna']); // 두 채를 지었다
    noteSeen(seen, ['shop']); // 사우나를 철거했다 — 지금 있는 것은 매점뿐
    expect([...seen].sort()).toEqual(['sauna', 'shop']);
  });

  it('★ 코스 장비 19종을 하나씩 거쳐도 전부 모인다 — 동시에 19개를 놓을 수는 없다', () => {
    /*
     * 이것이 "구조적으로 완성 불가"의 정확한 형태다. 코스를 하나 그렸다 지우고 다음 장비로
     * 바꾸는 것이 실제 플레이인데, 판정이 `courses.all` 이면 언제나 1/19 였다.
     */
    const seen = new Set<string>();
    for (const e of COURSE_EQUIPMENT) noteSeen(seen, [e.id]); // 한 번에 코스 하나
    expect(seen.size).toBe(COURSE_EQUIPMENT.length);
    expect(COURSE_EQUIPMENT.length).toBeGreaterThan(1); // 대조군이 성립하는 조건
  });

  it('⚠ 음성 대조군 — "지금 있는 것"으로 되돌리면(집합을 새로 만들면) 발견이 사라진다', () => {
    /*
     * 예전 코드의 형태를 그대로 흉내낸다: 매번 새 Set. 같은 입력에 다른 답이 나오는 것이
     * 이 버그의 전부였다 — 이 줄이 통과하는 한 위 두 검사는 의미가 있다.
     */
    let broken = new Set<string>(['shop', 'sauna']);
    broken = new Set<string>(['shop']); // 철거 뒤 다시 훑기
    expect(broken.has('sauna')).toBe(false);
  });
});

/**
 * 첫 발동 보상은 **한 번뿐**이다 (숨은 콤보의 `discoverCash`).
 *
 * `main.ts` 는 `noteSeen` 이 돌려준 목록에만 보상을 지급한다. 그래서 "이미 본 것은 절대
 * 안 들어온다"가 곧 "중복 지급이 없다"다. `discovered` 는 세이브에 담기므로 재부팅으로도
 * 다시 받을 수 없다 (그 왕복은 `save/kairo.test.ts` 가 본다).
 */
describe('첫 발견 보상은 한 번만 (P3-C)', () => {
  const hidden = COMBOS.filter((c) => c.hidden && c.discoverCash !== undefined);

  it('숨은 콤보에 발견 보상이 실제로 붙어 있다 — 대조군이 성립하는 조건', () => {
    expect(hidden.length).toBeGreaterThan(0);
  });

  it('★ 같은 콤보가 계속 발동해도 보상 대상은 첫 주뿐이다', () => {
    const seen = new Set<string>();
    const ids = hidden.map((c) => c.id);
    const week1 = noteSeen(seen, ids);
    const week2 = noteSeen(seen, ids); // 배치가 그대로면 다음 주에도 그대로 발동한다
    const week3 = noteSeen(seen, ids);
    expect(week1.length).toBe(ids.length);
    expect(week2).toEqual([]);
    expect(week3).toEqual([]);
    const paid = (list: string[]): number =>
      list.reduce((a, id) => a + (COMBOS.find((c) => c.id === id)?.discoverCash ?? 0), 0);
    expect(paid(week1)).toBeGreaterThan(0);
    expect(paid(week2) + paid(week3)).toBe(0);
  });

  it('중간에 새로 터진 것만 골라 낸다 — 이미 본 것은 안 섞인다', () => {
    const seen = new Set<string>(['a']);
    expect(noteSeen(seen, ['a', 'b', 'a', 'c'])).toEqual(['b', 'c']);
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });
});
