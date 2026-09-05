/**
 * 확인 대화상자 (G46) — 카이로 문법: 돈 쓰는 행동 앞에 「N G 를 쓸까요? 예 / 아니오」.
 * PanelHost 에 등록하지 않는다(창 위에 겹쳐야 하므로) — 토스트처럼 자기 DOM 을 든다. 하네스는 `?confirm=0` 으로 자동 승인.
 */
import { el } from './dom.js';

export interface ConfirmOpts {
  title: string;
  body?: string;
  /** 지출 — 있으면 「−N G」 줄 */
  cost?: number;
  yes?: string;
  no?: string;
  onYes: () => void;
  onNo?: () => void;
}

let autoConfirm = false;
/** 하네스·봇 전용 — 대화상자 없이 바로 승인 */
export function setAutoConfirm(v: boolean): void { autoConfirm = v; }
export function isAutoConfirm(): boolean { return autoConfirm; }

let scrim: HTMLDivElement | null = null;
let box: HTMLDivElement | null = null;
let titleEl: HTMLDivElement; let bodyEl: HTMLDivElement; let costEl: HTMLDivElement; let yesBtn: HTMLButtonElement; let noBtn: HTMLButtonElement;
let pending: ConfirmOpts | null = null;

function ensure(): void {
  if (box) return;
  scrim = el('div', 'kdialog-scrim');
  scrim.classList.add('khide');
  box = el('div', 'kwin gold kdialog');
  box.id = 'kdialog';
  box.classList.add('khide');
  box.setAttribute('role', 'alertdialog');
  const head = el('div', 'kwin-head');
  titleEl = el('div', 'kwin-title', '확인');
  head.append(titleEl);
  const body = el('div', 'kwin-body');
  bodyEl = el('div', 'krow-sub kdialog-body');
  costEl = el('div', 'krow kdialog-cost');
  const btns = el('div', 'kdock-row');
  noBtn = el('button', 'kbtn', '아니오'); noBtn.type = 'button'; noBtn.dataset['no'] = '1';
  yesBtn = el('button', 'kbtn primary', '예'); yesBtn.type = 'button'; yesBtn.dataset['yes'] = '1';
  btns.append(noBtn, yesBtn);
  body.append(bodyEl, costEl, btns);
  box.append(head, body);
  document.body.append(scrim, box);
  const close = (): void => { if (!box || !scrim) return; box.classList.add('khide'); scrim.classList.add('khide'); };
  noBtn.addEventListener('click', () => { const p = pending; pending = null; close(); p?.onNo?.(); });
  scrim.addEventListener('click', () => { const p = pending; pending = null; close(); p?.onNo?.(); });
  yesBtn.addEventListener('click', () => { const p = pending; pending = null; close(); p?.onYes(); });
}

export function confirmDialog(o: ConfirmOpts): void {
  if (autoConfirm) { o.onYes(); return; }
  ensure();
  if (!box || !scrim) return;
  pending = o;
  titleEl.textContent = o.title;
  bodyEl.textContent = o.body ?? '';
  bodyEl.classList.toggle('khide', !o.body);
  costEl.replaceChildren();
  if (o.cost !== undefined) { costEl.append(el('span', 'krow-k', '지출'), el('span', 'krow-v knum', `-${o.cost.toLocaleString('ko-KR')}G`)); costEl.dataset['cost'] = String(o.cost); costEl.classList.remove('khide'); }
  else costEl.classList.add('khide');
  yesBtn.textContent = o.yes ?? '예';
  noBtn.textContent = o.no ?? '아니오';
  scrim.classList.remove('khide');
  box.classList.remove('khide');
}

/** 검사용 — 열려 있나 */
export function confirmOpen(): boolean { return !!box && !box.classList.contains('khide'); }
