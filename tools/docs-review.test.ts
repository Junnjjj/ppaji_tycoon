import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('독립 리뷰 문서 정합성', () => {
  it('현재 문서는 제거된 goal collapse API를 호출하지 않고 surface state 경계를 가리킨다', () => {
    for (const path of ['CLAUDE.md', 'docs/design.md', 'docs/kairo-phases.md']) {
      const source = read(path);
      expect(source, path).not.toContain('collapseGoalsForEditing');
      expect(source, path).toContain("setGoalSurface('course')");
    }
  });

  it('13/15는 과거 RED로만 남고 확장된 현재 shell gate는 16/16으로 기록한다', () => {
    for (const path of [
      'docs/ui-shell-v2.md',
      'docs/ui-shell-v2-validation.md',
      'docs/phase7-final-integration.md',
      'docs/kairo-phases.md',
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/현재[^\n]{0,120}13\/15|최종[^\n]{0,120}13\/15/);
      expect(source, path).toContain('16/16');
    }
  });

  it('Phase 7 브라우저 검증은 direct setup이 섞인 hybrid integration gate라고 명시한다', () => {
    const source = read('docs/phase7-final-integration.md');
    expect(source).toContain('하이브리드 통합 게이트');
    expect(source).toContain('__kairo');
    expect(source).not.toContain('Phase 7 순수 E2E');
  });

  it('현재 post-fix 문서는 identity 7/7·shell 20/20·phase7 26/26을 사람 승인과 분리한다', () => {
    const source = read('docs/ui-shell-v2-validation.md');
    expect(source).toContain('7/7 통과');
    expect(source).toContain('20/20 통과');
    expect(source).toContain('26/26 통과');
    expect(source).toContain('사람 검수 미실행');
    expect(source).not.toMatch(/30초[^\n]{0,80}(사람|사용자)[^\n]{0,40}(통과|승인 완료)/);
  });

  it('CLAUDE 현재 HUD 계약은 6 role-controls와 A/B/C 한 밴드를 쓰고 옛 칩 기둥을 지운다', () => {
    const source = read('CLAUDE.md');
    expect(source).toContain('상시 역할 제어는 **6개**');
    expect(source).toContain('A/B/C 한 밴드');
    expect(source).not.toContain('목표 칩 기둥');
    expect(source).not.toContain('의뢰 칩 기둥');
  });
});
