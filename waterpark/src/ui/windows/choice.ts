import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { EVENT_DEFS, type EventEffect } from '../../sim/random-events.js';

/**
 * 사건 선택 창 (G39) — 카이로의 「사건 + 선택지」. 모달(시간 정지). 선택지마다 비용과 효과를 미리 적는다 —
 * 「실패는 내 선택 때문이어야」: 무엇을 고르면 무엇이 되는지 숨기지 않는다.
 */
function effectLabel(e: EventEffect): string {
  const bits: string[] = [];
  if (e.arrivalMul && e.days) bits.push(`손님 ×${e.arrivalMul} (${e.days}일)`);
  if (e.popBonus && e.days) bits.push(`인기 +${e.popBonus} (${e.days}일)`);
  if (e.likes) bits.push(`좋아요 +${e.likes}`);
  if (e.money) bits.push(`+${e.money.toLocaleString('ko-KR')}G`);
  if (e.clean) bits.push(`청결 ${e.clean > 0 ? '+' : ''}${e.clean}`);
  return bits.join(' · ') || '변화 없음';
}

export class ChoiceWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void; onClosed?(): void }) {
    this.win = new WindowPanel(parent, 'win-choice', '사건', 'purple', { modal: true });
    this.win.onClose = () => this.host.onClosed?.(); // G57: 닫히면 줄 선 결산 카드·모달을 펌프
    this.win.body.append(this.body);
  }

  get visible(): boolean { return !this.win.root.hidden; }

  /** 열린 사건이 있으면 띄운다. 없으면 아무것도 안 한다 */
  show(): boolean {
    const g = this.game();
    const id = g.events.pending;
    const def = id ? EVENT_DEFS.get(id) : undefined;
    if (!def) return false;
    this.win.setTitle(def.name);
    this.body.replaceChildren();
    const text = el('div', 'krow');
    text.append(el('span', 'krow-text', def.text));
    this.body.append(text);
    def.choices.forEach((c, k) => {
      const b = el('button', `kbtn${k === 0 ? ' primary' : ''} kchoice`);
      b.type = 'button';
      b.dataset['choice'] = String(k);
      const cost = c.cost ?? 0;
      b.append(el('span', 'krow-name', c.label), el('span', 'krow-sub', `${cost > 0 ? `−${cost.toLocaleString('ko-KR')}G · ` : ''}${effectLabel(c.effect)}`));
      b.disabled = cost > g.money;
      b.addEventListener('click', () => {
        const r = g.resolveEvent(k);
        this.host.toast(r.ok ? `${def.name} — ${c.label}` : r.reason, r.ok);
        if (r.ok) { this.win.hide(); this.host.onChanged(); }
      });
      this.body.append(b);
    });
    return this.win.show(); // G57: 결산 모달이 떠 있으면 false — main 이 나중에 다시 연다
  }
}
