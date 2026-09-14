import { describe, it, expect } from 'vitest';
import { PanelHost, InterruptBudget, INTERRUPT_MAX_PER_MIN } from './panels.js';

const mk = (host: PanelHost, o?: { exclusive?: boolean; modal?: boolean }) => {
  const p = {
    open: false,
    hide() {
      this.open = false;
      host.closed(this);
    },
  };
  if (o) host.register(p, o);
  return p;
};

describe('PanelHost — 한 번에 하나', () => {
  it('등록 안 한 패널도 배타다 (잊으면 닫히는 쪽이 기본)', () => {
    const host = new PanelHost();
    const a = mk(host);
    const b = mk(host);
    host.open(a);
    a.open = true;
    host.open(b);
    expect(a.open).toBe(false);
    expect(host.openPanel).toBe(b);
  });
  it('모달이 열려 있으면 다른 패널이 못 연다', () => {
    const host = new PanelHost();
    const m = mk(host, { modal: true });
    const b = mk(host);
    expect(host.open(m)).toBe(true);
    expect(host.open(b)).toBe(false);
  });
  it('onChange 는 등록 즉시 한 번 불린다', () => {
    const host = new PanelHost();
    const seen: boolean[] = [];
    host.onChange((o) => seen.push(o));
    expect(seen).toEqual([false]);
  });
});

describe('InterruptBudget — 모달 ≤ 1/분', () => {
  it('1분 안에 둘째는 거절, 1분 뒤 다시 허용', () => {
    let t = 0;
    const b = new InterruptBudget(() => t);
    expect(INTERRUPT_MAX_PER_MIN).toBe(1);
    expect(b.request()).toBe(true);
    expect(b.request()).toBe(false);
    t = 60_001;
    expect(b.request()).toBe(true);
  });
});
