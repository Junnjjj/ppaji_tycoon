/** 심사위원 셋 (P6, 계획 §2.3) — 군청 공무원 · 해경 · 유튜버 */
const JUDGE_NAMES = ['군청 공무원', '해경', '유튜버'] as const;
import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import { portraitEl, JUDGE_IDS } from '../portraits.js'; // P56-b2
import type { Game } from '../../sim/game.js';

/**
 * 심사 결과 창 (G35) — PSS 의 「카드 뒤집기 + 도장」. 심사위원 셋의 점수 카드가 차례로 뒤집히고
 * 합계 위에 합격/불합격 도장이 찍힌다. 축하 모달(채널 계약: 심사 결과는 모달 허용).
 */
export class CertResultWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows kcert-result');

  constructor(parent: HTMLElement, private readonly game: () => Game, onClosed: () => void = () => undefined) {
    this.win = new WindowPanel(parent, 'win-cert-result', '빠지 심사 결과', 'purple', { modal: true });
    this.win.onClose = () => onClosed();
    this.win.body.append(this.body);
  }

  get visible(): boolean { return !this.win.root.hidden; }

  show(): void {
    const g = this.game();
    const last = g.certs.state.last;
    if (!last) return;
    const def = g.certs.defs.get(last.id);
    this.body.replaceChildren();
    const title = el('div', 'krow');
    title.append(el('span', 'krow-name', def?.name ?? last.id), el('span', 'krow-v', `합격선 ${def?.pass ?? '-'}점`));
    this.body.append(title);
    const cards = el('div', 'kjudges');
    last.judges.forEach((pt, k) => {
      const card = el('div', 'kjudge');
      card.dataset['judge'] = String(k);
      const face = el('span', 'kportrait');
      face.append(portraitEl(JUDGE_IDS[k] ?? 'judge', pt >= 7 ? 'happy' : 'calm', { palette: 5 + k, hair: (k + 2) % 5 }));
      card.append(face, el('span', 'kjudge-name', JUDGE_NAMES[k] ?? `심사위원 ${k + 1}`), el('span', 'kjudge-pt', `${pt}점`));
      cards.append(card);
    });
    this.body.append(cards);
    const total = el('div', 'krow ktotal');
    total.append(el('span', 'krow-k', '합계'), el('span', 'krow-v', `${last.score} / 30`));
    const stamp = el('span', `kstamp ${last.pass ? 'pass' : 'fail'}`, last.pass ? '합격' : '불합격');
    stamp.dataset['stamp'] = last.pass ? 'pass' : 'fail';
    total.append(stamp);
    this.body.append(total);
    for (const r of g.certs.lastRewards) {
      const row = el('div', 'krow');
      row.append(el('span', 'krow-k', r));
      this.body.append(row);
    }
    this.win.show();
  }
}
