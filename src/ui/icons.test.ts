import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, hasIconArt, setIconArt, type IconName } from './icons.js';

const contract = JSON.parse(
  readFileSync(new URL('../assets/ui-icons.json', import.meta.url), 'utf8'),
) as {
  icons: { id: string; source: string; prompt?: string; size: [number, number] }[];
  art: { id: string; source: string; prompt?: string; size: [number, number] }[];
};
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('아이콘 계약 (P1.5-B)', () => {
  it('계약과 등록부가 양방향으로 같다 — 폴백이 총체적이다', () => {
    const contracted = contract.icons.map((i) => i.id.replace(/^ui\//, '')).sort();
    expect(contracted).toEqual([...ICON_NAMES].sort());
  });

  it('AI 대상에는 지시서가 붙어 있고 절차 대상에는 없다', () => {
    for (const entry of contract.icons) {
      if (entry.source === 'ai') {
        // `prompt` 가 곧 작업 지시서다 (manifest.json 의 source:ai 규약)
        expect(entry.prompt, entry.id).toBeTruthy();
        expect(entry.prompt, entry.id).toContain('transparent background');
      } else {
        expect(entry.prompt, entry.id).toBeUndefined();
      }
      expect(entry.size).toEqual([48, 48]);
    }
    // 사건 배경은 `CardTheme` 8 + 축하 1 이고 전부 480×160 이다
    expect(contract.art).toHaveLength(9);
    for (const a of contract.art) expect(a.size, a.id).toEqual([480, 160]);
  });

  it('그림은 id 마다 독립으로 걸린다 — 한 장이 없어도 나머지가 산다', () => {
    /*
     * ⚠ Phase G `HybridProvider` 와 같은 규칙이다. 전부-또는-전무면 한 장이 게이트에
     * 떨어질 때마다 화면 전체가 글리프로 돌아간다.
     */
    expect(hasIconArt('course')).toBe(false);
    setIconArt({ course: '/assets/ui-icons/course.png' });
    expect(hasIconArt('course')).toBe(true);
    expect(hasIconArt('recipe')).toBe(false);
    setIconArt({});
    expect(hasIconArt('course')).toBe(false);
  });

  it('표식 자리가 CSS 에 실재한다 — 배선만 하고 자리가 없으면 죽은 코드다', () => {
    // ⚠ `.kicon` 은 P1.5-A 가 배선만 하고 **CSS 를 안 만들어** 죽어 있었다 (감사에서 발견)
    expect(css).toMatch(/\.kicon\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.kicon\[data-art='on'\]\s*\{[^}]*background-image/);
  });

  it('⚠ 문자열 호출부는 그림으로 못 바뀐다 — 반입 단계의 남은 일', () => {
    /*
     * `icon()` 은 문자열을 돌려주므로 `<img>` 가 될 수 없다. AI 대상 아이콘의 호출부가
     * 지금 **문자열**이라, 반입 때 그 자리들을 `iconEl` 로 옮겨야 한다 (계획 §8-17).
     * 이 검사는 그 사실을 **숫자로 고정**한다 — 줄면 좋고, 늘면 반입이 더 멀어진다.
     */
    const ai = new Set(
      contract.icons.filter((i) => i.source === 'ai').map((i) => i.id.replace(/^ui\//, '')),
    );
    const files = ['kairo-hud.ts', 'kairo-ticker.ts', 'kairo-management.ts', 'kairo-growth.ts'];
    let stringSites = 0;
    for (const f of files) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      for (const m of src.matchAll(/icon\('([a-z-]+)'\)/g)) {
        if (ai.has(m[1] as IconName)) stringSites += 1;
      }
    }
    expect(stringSites).toBeGreaterThan(0);
  });
});
