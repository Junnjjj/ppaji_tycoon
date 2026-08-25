import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('./kairo-course.ts', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../render/scenes/KairoScene.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('Phase 2B 모바일 표면 계약', () => {
  it('무기호 삼각형 대신 Settings가 있고 루트·장비·보트 섹션을 명시한다', () => {
    expect(panel).not.toMatch(/textContent\s*=\s*['"](?:▲|▼)['"]/);
    expect(panel).toContain("'Settings'");
    expect(panel).toContain("sectionHeading('루트')");
    expect(panel).toContain("sectionHeading('장비')");
    expect(panel).toContain("sectionHeading('보트')");
  });

  it('시험 운행의 Apply/Tune Again 경로와 44px 터치 표면이 있다', () => {
    expect(panel).toContain("'시험 운행'");
    expect(panel).toContain("'적용'");
    expect(panel).toContain("'다시 조정'");
    expect(css).toMatch(/\.kcourse-acts\s+\.kbtn\s*\{[^}]*min-height:\s*var\(--tap\)/s);
  });

  it('편집 적용은 저장소의 원자적 confirm에서 검증 후 결제한다', () => {
    expect(panel).toContain('this.deps.courses.confirmEdit(this.edit, this.deps.spend)');
    expect(panel).toMatch(
      /if \(this\.edit\) \{[\s\S]*?confirmEdit\(this\.edit, this\.deps\.spend\)[\s\S]*?\} else \{/,
    );
  });

  it('시작·방향·번호 핸들·위험 구간은 코스 오버레이 안에서만 그린다', () => {
    expect(scene).toContain('drawCourseStart');
    expect(scene).toContain('drawCourseDirection');
    expect(scene).toContain('drawCourseHandleNumber');
    expect(scene).toContain('drawCourseRiskSegment');
    expect(scene).toMatch(/cssColorInt\('--course-/);
  });
});
