/**
 * 메인 메뉴 — 카이로 문법의 세로 리스트(아이콘 칸 + 큰 글씨). 목적지 10. 잠긴 행은 이유를 단다.
 */
import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';

export interface MenuEntry {
  id: string;
  label: string;
  icon: IconName;
  locked?: string | null;
  /** 한 줄 설명 (G46, 카이로 메뉴의 아랫줄) */
  desc?: string;
  /** 구분 머리 — 이 항목 앞에 그린다 */
  group?: string;
  run: () => void;
}

export class MenuWindow {
  private readonly win: WindowPanel;
  private readonly list = el('div', 'kmenu');

  constructor(parent: HTMLElement, private readonly entries: () => MenuEntry[]) {
    this.win = new WindowPanel(parent, 'win-menu-main', '메뉴', 'blue');
    this.win.body.append(this.list);
  }

  setTitle(t: string): void {
    this.win.setTitle(t);
  }

  show(): void {
    this.list.replaceChildren();
    for (const e of this.entries()) {
      if (e.group) this.list.append(el('div', 'kmenu-group', e.group));
      const b = el('button', 'kmenu-row');
      b.type = 'button';
      b.dataset['menu'] = e.id;
      const text = el('span', 'kmenu-text');
      text.append(el('span', 'kmenu-label', e.label));
      if (e.desc) text.append(el('span', 'kmenu-desc', e.locked ? `${e.desc} · ${e.locked} 부터` : e.desc));
      b.append(iconEl(e.icon, 'lg'), text);
      if (e.locked) {
        b.dataset['locked'] = e.locked; // P0: 하네스·접근성이 잠김을 읽는다
        b.append(el('span', 'kmenu-lock', e.locked));
        b.addEventListener('click', () => { /* 잠김 — 이유만 보여 준다 */ });
      } else {
        b.addEventListener('click', () => { this.win.hide(); e.run(); });
      }
      this.list.append(b);
    }
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }
}
