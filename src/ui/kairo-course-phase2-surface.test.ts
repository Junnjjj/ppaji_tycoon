import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('./kairo-course.ts', import.meta.url), 'utf8');
/** 주석은 역사를 남기는 자리다 — 계약 검사는 **살아 있는 코드**만 봐야 한다. */
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const scene = readFileSync(new URL('../render/scenes/KairoScene.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('Phase 2B 모바일 표면 계약', () => {
  it('무기호 삼각형 대신 한글 설정 라벨이 있고 루트·장비·보트 섹션을 명시한다', () => {
    expect(panel).not.toMatch(/textContent\s*=\s*['"](?:▲|▼)['"]/);
    expect(code).not.toContain("'Settings'");
    expect(code).not.toMatch(/['"]Settings['"]/);
    expect(panel).toContain("sectionHeading('루트')");
    expect(panel).toContain("sectionHeading('장비')");
    expect(panel).toContain("sectionHeading('보트')");
  });

  it('시험 운행의 적용/다시 조정 경로와 44px 터치 표면이 있다', () => {
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

describe('코스 v2 액션 독 표면', () => {
  it('요약 줄을 자르는 옛 chips 대신 잘리지 않는 delta 격자를 쓴다', () => {
    expect(code).not.toContain('kcourse-chips');
    expect(code).not.toContain('chipsEl');
    expect(panel).toContain("id = 'kairo-course-deltas'");
    // 4칸 격자는 말줄임을 쓰지 않는다 — 잘리면 현재→예상을 못 읽는다.
    expect(css).toMatch(/\.kcourse-deltas\s*\{[^}]*grid-template-columns:\s*repeat\(4/s);
    expect(css).not.toMatch(/\.kcourse-delta-value\s*\{[^}]*text-overflow:\s*ellipsis/s);
  });

  it('독은 지표 1행 + 버튼 1행이고 112px를 넘지 않는다', () => {
    expect(css).toMatch(/\.kcourse-dock\s*\{[^}]*max-height:\s*112px/s);
    expect(panel).toContain("el('div', 'kcourse-dock')");
  });

  it('버튼 정체는 순수 함수가 정하고 패널은 그것만 그린다', () => {
    expect(panel).toContain('courseDockActions(');
    expect(panel).toContain('courseDeltaCells(');
    // 상태별 라벨을 refresh() 안에 다시 적으면 규칙이 두 벌이 된다.
    expect(code).not.toMatch(/confirmBtn\.textContent\s*=\s*'/);
  });

  it('코스 패널이 보이는 동안 홈 목표 표면은 course다', () => {
    expect(panel).toContain('onCourseModeChange');
    expect(main).toContain("hud.setGoalSurface(active ? 'course'");
  });

  it('편집을 시작해도 설정 본문을 자동으로 펼치지 않는다 — 지도가 주인공이다', () => {
    const begin = /private beginRouteEdit\(\): void \{[\s\S]*?\n {2}\}/.exec(code)?.[0] ?? '';
    expect(begin).toContain('beginEdit');
    expect(begin).not.toContain('setExpanded(true)');
  });

  it('시험 반응은 씬이 같은 시각 로그로 남겨 하네스가 타이밍을 잰다', () => {
    expect(scene).toContain('courseTrialLogForTest');
  });

  it('코스 독과 티커는 동시에 칠하지 않으며 실제 rect 교차를 브라우저가 검사한다', () => {
    expect(css).toMatch(/body:has\(\.kcourse:not\(\[hidden\]\)\)\s+\.kticker\s*\{[^}]*display:\s*none/s);
    const harness = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');
    expect(harness).toContain('tickerOverlap');
    expect(harness).toContain('코스 독과 티커 교차 0');
  });
});
