import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventShellPlan, resolveDelta } from './kairo-event-shell.js';

const shell = readFileSync(new URL('./kairo-event-shell.ts', import.meta.url), 'utf8');
const unlock = readFileSync(new URL('./kairo-unlock.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

describe('회수 줄 (§2.6)', () => {
  it('방향은 값에서 유도한다 — 호출부가 손으로 안 적는다', () => {
    expect(resolveDelta({ label: '요금', from: 900, to: 1150 }).tone).toBe('up');
    expect(resolveDelta({ label: '요금', from: 1150, to: 900 }).tone).toBe('down');
    expect(resolveDelta({ label: '요금', from: 900, to: 900 }).tone).toBe('flat');
    // 글자 값은 비교할 수 없으니 평탄이 기본이고, 필요하면 호출부가 지목한다
    expect(resolveDelta({ label: '손님층', to: '달콤 · 든든' }).tone).toBe('flat');
    expect(resolveDelta({ label: '손님층', to: '달콤', tone: 'up' }).tone).toBe('up');
  });

  it('`from` 이 없으면 증분이라 부호가 붙는다', () => {
    expect(resolveDelta({ label: '만족', to: 3 }).toText).toBe('+3');
    expect(resolveDelta({ label: '만족', to: 3 }).fromText).toBe('');
    expect(resolveDelta({ label: '요금', from: 900, to: 1150 }).toText).toBe('1,150');
    expect(resolveDelta({ label: '요금', from: 900, to: 1150 }).fromText).toBe('900');
  });

  it('카운트업은 양쪽이 숫자일 때만 돈다', () => {
    expect(resolveDelta({ label: '요금', from: 900, to: 1150 }).toNumber).toBe(1150);
    expect(resolveDelta({ label: '손님층', from: '달콤', to: '달콤 · 든든' }).toNumber).toBeNull();
  });

  it('계획이 델타를 들고 다닌다 — DOM 없이도 잰다', () => {
    const plan = eventShellPlan({
      kind: 'celebration',
      mood: 'celebrate',
      title: '치즈 떡볶이',
      deltas: [{ label: '가격', from: 700, to: 900 }],
      choices: [],
    });
    expect(plan.deltas).toHaveLength(1);
    expect(plan.deltas[0]?.tone).toBe('up');
    // 없으면 줄 자체를 안 만든다 (빈 상자 금지)
    expect(eventShellPlan({ kind: 'x', mood: 'alert', title: 'y', choices: [] }).deltas)
      .toEqual([]);
  });

  it('연출 계약 — 숫자는 textContent 만, 움직임은 transform/opacity 만', () => {
    // 레이아웃 속성을 애니메이트하면 프레임이 떨어진다 (기존 계약)
    expect(shell).toContain('textContent');
    const at = css.indexOf('@keyframes kevent-delta-in');
    const frames = css.slice(at, css.indexOf('\n}', at));
    expect(frames).toContain('transform: translateY');
    expect(frames).not.toMatch(/(height|width|margin|padding):/);
    // ⚠ 가드는 **첫 블록 안**이다 — 별도 블록은 정적 검사가 안 읽는다 (K47-① 실측)
    const guard = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(guard.slice(0, guard.indexOf('\n}\n'))).toContain('.kevent-delta');
    // 움직임만 빼고 **최종 숫자는 남는다**
    expect(shell).toContain('reducedMotion');
    expect(shell).toContain("dataset['deltaFinal']");
  });

  it('음성 대조군이 코드에 있고 앱이 쓰는 사본이 하네스로 나간다', () => {
    expect(unlock).toContain('setCelebrationDeltaFaultForTest');
    expect(unlock).toMatch(/deltaFault === 'empty' \? \[\]/);
    expect(main).toContain('setCelebrationDeltaFaultForTest');
  });
});
