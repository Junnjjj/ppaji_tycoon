/**
 * 건설 창 — 6분류 탭 + **카드 격자**(`PictureGrid`, P56-a2 D2 통일). 카드 = 스프라이트 + 좌하 `×놓은 수` + 우하 값 + 잠금 배지.
 * 카드를 고르면 창이 닫히고 **배치 모드**로. 잠긴 시설은 숨기지 않고 잠긴 카드로 남긴다 (가림막이 아니라 예고) —
 * 아래 두 줄이 해금 출처를 말한다.
 */
import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { canvasPictureEl } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import { WindowPanel } from '../window.js';
import { setsByMember, visibleSetsOf } from '../rig-sets.js';
import type { Game } from '../../sim/game.js';
import type { FacilityDef } from '../../data/schema.js';

/** P45-b D63 — 건설 분류: 「어디에 놓나」로 가른다. 실내(복도 점포 — 입장·퇴장·밤 순) · 자리 · 숙박 · 먹거리(야외) · 놀이(야외) · 슬라이드 · 편의(야외) · 장식 */
export type BuildTabId = 'indoor' | 'ppaji' | 'seat' | 'lodging' | 'food' | 'play' | 'slide' | 'utility' | 'decor'; // P50-a R9: 「빠지」 탭을 실내 다음 둘째로
const TAB_ICON: Record<BuildTabId, IconName> = { indoor: 'utility', ppaji: 'attraction', seat: 'lounge', lodging: 'lounge', food: 'restaurant', play: 'attraction', slide: 'slide', utility: 'utility', decor: 'decor' };
const HALL_ORDER: Record<string, number> = { enter: 0, both: 1, leave: 2 };
/** 실내 탭 정렬 — 입장(대여·거치대·자판기) → 둘 다(매점) → 퇴장(샤워·드라이·기념품·포장) → 밤(객실·무대·노래방·오락기) → 나머지 편의 */
export function hallGroup(d: FacilityDef): number {
  if (d.passBy) return HALL_ORDER[d.passBy] ?? 3;
  if (d.lodging || d.noisy === 'loud' || d.class === 'attraction') return 3;
  return 4;
}
const isPpaji = (d: FacilityDef): boolean => (d.class === 'rig' || d.onRing === true) && d.buildable !== false; // P51: 개조판(buildable:false)은 건설 목록에 없다 — 시설 창 「개조」로만
export const BUILD_TABS: readonly { id: BuildTabId; label: string; match: (d: FacilityDef) => boolean }[] = [
  { id: 'indoor', label: '실내', match: (d) => d.indoorOnly },
  { id: 'ppaji', label: '빠지', match: (d) => isPpaji(d) }, // P50-a R9: 물 위 기구 + 링 위 시설(이전 12 포함)
  { id: 'seat', label: '자리', match: (d) => d.class === 'lounging' && !d.lodging && !d.indoorOnly && !isPpaji(d) },
  { id: 'lodging', label: '숙박', match: (d) => d.class === 'lounging' && d.lodging === true && !d.indoorOnly && !isPpaji(d) },
  { id: 'food', label: '먹거리', match: (d) => d.class === 'restaurant' && !d.indoorOnly && !isPpaji(d) },
  { id: 'play', label: '놀이', match: (d) => d.class === 'attraction' && !d.indoorOnly && !isPpaji(d) },
  { id: 'slide', label: '슬라이드', match: (d) => d.class === 'slide' && !isPpaji(d) },
  { id: 'utility', label: '편의', match: (d) => d.class === 'utility' && !d.indoorOnly && !isPpaji(d) },
  { id: 'decor', label: '장식', match: (d) => d.class === 'decor' && !isPpaji(d) },
];

const UNLOCK_KO: Record<FacilityDef['unlock']['source'], string> = {
  start: '', shop: '상점 랭크', wish: '소원 보상', cert: '인증 보상', invest: '투자', rank: '랭크 보상', gift: '사장 선물', craft: '기구 개조(공방)',
};

export class BuildWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs kicon-tabs kgrid5'); // W-1: 아이콘 탭 한 줄(9) + 아래 제목 줄
  private readonly tabTitle = el('div', 'ktabs-title', '');
  /** P56-a2 — 카드 격자 하나(요리·장날·투자와 같은 문법). 아래 두 줄(이름 · 분류 · 놓음 N / 설명)은 격자가 낸다 */
  private readonly grid: PictureGrid;
  private tab: BuildTabId = 'indoor';

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
    this.grid = new PictureGrid({ name: 'build', countLabel: '놓음', onTap: (c) => this.pick(c), teaser: 2 }); // W-2(D69·K40): 해금분 + 티저 2
    this.win.body.append(this.tabs, this.tabTitle, this.grid.root);
  }

  show(tab?: BuildTabId): void {
    if (tab) this.tab = tab;
    this.render();
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }

  private render(): void {
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.tab);
    const g = this.game();
    const cur = BUILD_TABS.find((t) => t.id === this.tab);
    this.tabTitle.textContent = cur?.label ?? '';
    const rows = this.defs.filter((d) => cur?.match(d) ?? false);
    if (this.tab === 'indoor') rows.sort((a, b) => hallGroup(a) - hallGroup(b));
    const setIndex = setsByMember(); // P60-c D72 B: 카드 배지 「세트」 = 이 시설이 어떤 (hidden 아닌) 세트의 멤버인가 — 자리별 「+닌자 코스」는 확정 바 칩
    const cards: PictureCard[] = rows.map((def) => {
      const unlocked = g.isUnlocked(def.id);
      const memberOf = visibleSetsOf(def.id, setIndex);
      const placed = g.facilities.all.filter((f) => f.defId === def.id).length; // 원작 카드의 좌하 `×N` = 놓인 수
      const sub = unlocked
        ? `인기 ${def.pop} · 유지 ${def.maint}G/일${def.usageFee ? ` · 이용료 ${def.usageFee}G` : ''}`
        : `잠김 · ${UNLOCK_KO[def.unlock.source]}${def.unlock.rank !== undefined ? ` ${def.unlock.rank}` : ''}`;
      const card: PictureCard = {
        id: def.id,
        name: def.name, // P57-f: 슬라이드의 「N층 M칸」은 아래 줄로 — 카드 이름은 한 줄(줄바꿈 금지)
        art: canvasPictureEl(this.thumb(def), 'build'),
        count: placed,
        price: `${def.cost.toLocaleString('ko-KR')}G`,
        sub: def.slide ? `${def.slide.levels}층 ${def.slide.length}칸 · ${sub}` : sub,
        desc: def.desc ?? (unlocked ? '탭하면 배치 모드로 — 지도를 팬해 자리를 맞춘다' : '아직 못 짓는다'),
        disabled: !unlocked,
        data: { facility: def.id, placed: String(placed), ...(memberOf.length ? { set: memberOf.map((s) => s.id).join(',') } : {}) },
      };
      if (!unlocked) card.badge = 'lock';
      else if (memberOf.length) card.badge = { text: '세트' }; // hidden 세트의 멤버는 배지 없음 — 잠금 배지가 우선
      return card;
    });
    this.grid.render(cards);
  }

  private pick(card: PictureCard): void {
    const def = this.defs.find((d) => d.id === card.id);
    if (!def || !this.game().isUnlocked(def.id)) return;
    this.win.hide();
    this.onPick(def);
  }
}
