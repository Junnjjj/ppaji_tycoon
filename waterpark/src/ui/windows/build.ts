/**
 * 건설 창 — 6분류 탭 + 리스트 행(썸네일·이름·비용·인기/유지비). 행을 고르면 창이 닫히고 **배치 모드**로.
 * 잠긴 시설은 숨기지 않고 가라앉은 면 + 해금 출처를 단다 (가림막이 아니라 예고).
 */
import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import type { FacilityDef, FacilityClass } from '../../data/schema.js';

/** 탭 아이콘 (G29) */
const TAB_ICON: Record<FacilityClass, IconName> = { utility: 'utility', lounging: 'lounge', restaurant: 'restaurant', attraction: 'attraction', slide: 'slide', decor: 'decor' };
export const BUILD_TABS: readonly { id: FacilityClass; label: string }[] = [
  { id: 'utility', label: '편의' },
  { id: 'lounging', label: '라운지' },
  { id: 'restaurant', label: '식당' },
  { id: 'attraction', label: '놀이' },
  { id: 'slide', label: '슬라이드' },
  { id: 'decor', label: '장식' },
];

const UNLOCK_KO: Record<FacilityDef['unlock']['source'], string> = {
  start: '', shop: '상점 랭크', wish: '소원 보상', cert: '인증 보상', invest: '투자', rank: '랭크 보상', gift: '사장 선물',
};

export class BuildWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly list = el('div', 'kcatalog');
  private tab: FacilityClass = 'utility';

  constructor(
    parent: HTMLElement,
    private readonly game: () => Game,
    private readonly defs: readonly FacilityDef[],
    private readonly thumb: (def: FacilityDef) => HTMLCanvasElement | null,
    private readonly onPick: (def: FacilityDef) => void,
  ) {
    this.win = new WindowPanel(parent, 'win-build', '건설', 'blue');
    for (const t of BUILD_TABS) {
      const b = el('button', 'ktab');
      b.append(iconEl(TAB_ICON[t.id] ?? 'build'), el('span', undefined, t.label));
      b.type = 'button';
      b.dataset['tab'] = t.id;
      b.addEventListener('click', () => { this.tab = t.id; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.list);
  }

  show(tab?: FacilityClass): void {
    if (tab) this.tab = tab;
    this.render();
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }

  private render(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.tab);
    this.list.replaceChildren();
    const g = this.game();
    for (const def of this.defs.filter((d) => d.class === this.tab)) {
      const unlocked = g.isUnlocked(def.id);
      const row = el('button', 'kcatalog-card');
      row.type = 'button';
      row.dataset['facility'] = def.id;
      row.disabled = !unlocked;
      const th = el('span', 'kthumb');
      const c = this.thumb(def);
      if (c) th.append(c);
      const text = el('span', 'krow-text');
      text.append(el('span', 'krow-name', def.slide ? `${def.name} · ${def.slide.levels}층 ${def.slide.length}칸` : def.name));
      text.append(el('span', 'krow-sub', unlocked
        ? `인기 ${def.pop} · 유지 ${def.maint}G/일${def.usageFee ? ` · 이용료 ${def.usageFee}G` : ''}${def.scent ? ` · ${def.scent} 향` : ''}`
        : `잠김 · ${UNLOCK_KO[def.unlock.source]}${def.unlock.rank !== undefined ? ` ${def.unlock.rank}` : ''}`));
      const cost = el('span', 'kcard-cost', `${def.cost.toLocaleString('ko-KR')}G`);
      if (!unlocked) th.append(iconEl('lock', 'kcard-lock'));
      row.append(th, text, cost);
      if (unlocked) row.addEventListener('click', () => { this.win.hide(); this.onPick(def); });
      this.list.append(row);
    }
  }
}
