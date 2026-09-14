import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 지도 말풍선(`.kbubble`, `bubbles.ts`)은 화면 전용 클래스와 이름을 나누지 않는다 (P56-c 뒤 실측 — 2026-09-13).
 * P56-a 가 심사 창 심사위원 말풍선에 같은 이름 `.kbubble` 을 주면서 뒤에 오는 규칙(`position: relative; flex: 1 1 auto`)이
 * 지도 말풍선의 `position: absolute` 를 덮어 손님 말풍선이 **화면 폭 전체(393px)** 로 벌어졌다 — 사용자 「말풍선이 너무 큰데?」.
 * CLAUDE.md 「화면 전용 표면에는 그 화면의 접두사를 줄 것」(P8 `.kband` 선례)의 재발이라 자를 둔다.
 */
describe('말풍선 클래스 충돌', () => {
  const css = readFileSync(resolve(__dirname, 'style.css'), 'utf8');

  it('`.kbubble` 규칙 블록은 style.css 에 둘(본체 + ::after)뿐이고 본체는 position: absolute', () => {
    const heads = css.match(/^\.kbubble(?:::after)?\s*\{/gm) ?? [];
    expect(heads).toEqual(['.kbubble {', '.kbubble::after {']);
    const body = css.slice(css.indexOf('.kbubble {'), css.indexOf('.kbubble::after'));
    expect(body).toContain('position: absolute');
    expect(css.match(/\.kbubble\b/g)?.length).toBe(2);
  });

  it('심사 창은 `.kcond-say` 를 쓰고 `.kbubble` 을 만들지 않는다 · `.kcond-say` 규칙이 있다', () => {
    const cert = readFileSync(resolve(__dirname, 'windows/cert.ts'), 'utf8');
    expect(cert.includes("'kbubble'")).toBe(false);
    expect(cert.includes("'kcond-say'")).toBe(true);
    expect(/^\.kcond-say\s*\{/m.test(css)).toBe(true);
  });
});
