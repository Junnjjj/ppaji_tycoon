import { describe, it, expect, beforeEach } from 'vitest';
import { PanelHost, type Panel } from './panels.js';

/**
 * 패널은 한 번에 하나 (K37).
 *
 * 사용자 보고: "건설 등 눌렀을때 나오는 설명 부분이 다른 설명 눌렀을때 안꺼져서".
 * 원인은 패널 8종이 각자 `hidden` 을 만지고 "다른 걸 닫는다"를 아는 곳이 없었던 것이다.
 *
 * ⚠ 이 테스트는 **호스트의 규칙**만 잰다. 실제 `hidden` 이 내려가는지는 브라우저 검사가
 * 본다 — 여기서 DOM 을 흉내내면 "규칙은 맞는데 화면은 그대로"를 놓친다.
 */

/** 닫힌 것을 세는 가짜 패널. 호스트는 `hide()` 만 본다 */
function fake(host: PanelHost, name: string): Panel & { hidden: number; name: string } {
  const p = {
    name,
    hidden: 0,
    hide(): void {
      p.hidden += 1;
      host.closed(p);
    },
  };
  return p;
}

describe('패널은 한 번에 하나만 열린다', () => {
  let host: PanelHost;
  beforeEach(() => {
    host = new PanelHost();
  });

  it('★ 두 번째를 열면 첫 번째가 닫힌다', () => {
    const a = fake(host, 'a');
    const b = fake(host, 'b');
    expect(host.open(a)).toBe(true);
    expect(a.hidden).toBe(0);
    expect(host.open(b)).toBe(true);
    expect(a.hidden).toBe(1); // ← 이게 버그였다
    expect(host.openPanel).toBe(b);
  });

  it('★ 음성 대조군 — 배타가 아니면 안 닫힌다 (감상 띠가 이 경우다)', () => {
    const sheet = fake(host, 'sheet');
    const showcase = fake(host, 'showcase');
    host.register(showcase, { exclusive: false });
    host.open(sheet);
    host.open(showcase);
    // 감상은 시트를 닫지 않는다 — 닫으면 감상을 나올 때 원래 화면이 복원되지 않는다
    expect(sheet.hidden).toBe(0);
    // 반대로도 안 닫힌다
    host.open(sheet);
    expect(showcase.hidden).toBe(0);
  });

  it('같은 패널을 다시 열어도 자기를 닫지 않는다', () => {
    const a = fake(host, 'a');
    host.open(a);
    host.open(a);
    expect(a.hidden).toBe(0);
  });

  it('★ 모달이 열려 있으면 다른 패널이 안 열린다', () => {
    const card = fake(host, 'card');
    const sheet = fake(host, 'sheet');
    host.register(card, { modal: true });
    expect(host.open(card)).toBe(true);
    // 카드는 선택하지 않으면 주가 안 넘어간다 — 밀어내면 선택을 조용히 건너뛴다
    expect(host.open(sheet)).toBe(false);
    expect(card.hidden).toBe(0);
    // 카드가 닫히면 다시 열린다
    card.hide();
    expect(host.open(sheet)).toBe(true);
  });

  it('모달 자신은 다시 열 수 있다 — 여러 장을 연달아 보여 준다', () => {
    const card = fake(host, 'card');
    host.register(card, { modal: true });
    host.open(card);
    expect(host.open(card)).toBe(true);
  });

  it('등록을 잊은 패널은 배타로 취급된다 — 잊으면 겹치는 쪽이 기본이면 안 된다', () => {
    const known = fake(host, 'known');
    const forgotten = fake(host, 'forgotten'); // register 를 안 부른다
    host.register(known, { exclusive: true });
    host.open(known);
    host.open(forgotten);
    expect(known.hidden).toBe(1);
  });

  it('closeAll 은 열린 것을 전부 닫는다', () => {
    const a = fake(host, 'a');
    const b = fake(host, 'b');
    host.register(b, { exclusive: false });
    host.open(a);
    host.open(b);
    host.closeAll();
    expect(a.hidden).toBe(1);
    expect(b.hidden).toBe(1);
    expect(host.openPanel).toBeNull();
  });

  it('닫힌 뒤에는 열린 것으로 세지 않는다', () => {
    const a = fake(host, 'a');
    host.open(a);
    expect(host.isOpen(a)).toBe(true);
    a.hide();
    expect(host.isOpen(a)).toBe(false);
    expect(host.openPanel).toBeNull();
  });
});
