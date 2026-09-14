import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TYPE_SCALE, resolveFontSize } from './type-scale.js';

const css = readFileSync('src/ui/style.css', 'utf8');

describe('타이포 스케일 (P1.5-A)', () => {
  /*
   * ⚠ 사본은 **정본과 묶여 있어야** 한다. 이 검사가 없으면 CSS 를 고쳤을 때 TS 표가
   * 조용히 옛 숫자를 들고 남아, 크기를 재는 검사 전부가 틀린 값으로 통과한다.
   */
  it('TS 표가 style.css 의 :root 선언과 같다', () => {
    const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(root).not.toBeNull();
    const fromCss: Record<string, number> = {};
    const re = /(--fs-[\w-]+):\s*([\d.]+)px/g;
    let m;
    while ((m = re.exec(root![1] ?? '')) !== null) fromCss[m[1]!] = Number(m[2]);
    expect(fromCss).toEqual(TYPE_SCALE);
  });

  it('인접 단이 1.2배 이상 벌어진다 — 계단이지 목록이 아니다', () => {
    const steps = Object.values(TYPE_SCALE).slice().sort((a, b) => a - b);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]! / steps[i - 1]!).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('토큰과 리터럴을 같은 자로 푼다', () => {
    expect(resolveFontSize('font-size: var(--fs-lead);')).toBe(19);
    expect(resolveFontSize('font-size: 13px;')).toBe(13);
    expect(resolveFontSize('color: red;')).toBeNull();
  });
});
