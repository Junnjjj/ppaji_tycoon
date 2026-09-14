/**
 * 구입 상점 화면 (P3) — **지금 있는 것을 즉시 산다.**
 *
 * 기다려서 오는 것은 수배(P4)이고 그 경계는 데이터가 강제한다 (`shop.ts` 의 D2 절).
 * 이 화면은 그 경계를 **탭으로도** 보여 준다 — 여기 있는 것은 전부 즉시다.
 *
 * ## 규칙
 *
 * · 못 사는 것을 **목록에서 지우지 않는다** (K48) — 지금 못 사는 것이 곧 다음 목표다.
 *   이유를 대신 말한다 (`등급 2 필요` · `현금 부족`).
 * · 새 버튼 클래스를 안 만든다 — `.kbtn`/`.on`/`.primary` 로 충분했다 (표면 셋 규칙).
 * · 값·소유·잠김 판정은 전부 `sim/kairo/shop.ts` 가 소유한다. 여기는 **재렌더만** 한다.
 * · ⚠ **강화품만 「어디에」가 필요하다** — 풀 재고가 아니라 시설 하나에 붙는 1회용이라,
 *   대상을 고르는 것이 그 축의 결정이다. 고르기 전에는 결제하지 않는다.
 */
import { attachSheetHandle } from './kairo-sheet-handle.js';
import { button, el } from './dom.js';
import { panelHost } from './panels.js';
import { icon } from './icons.js';
import { won } from './money.js';
import {
  SHOP_TABS,
  shopCost,
  type ShopStockEntry,
  type ShopBlockedReason,
  type ShopContext,
  type ShopItemDef,
  type ShopItemStatus,
} from '../sim/kairo/shop.js';
import { courseEquipment } from '../sim/kairo/course.js';
import {
  COMMISSIONS,
  type CommissionDef,
} from '../sim/kairo/commission.js';
import { facilityDef, type PlacedFacility } from '../sim/kairo/placement.js';
import { ingredientDef, recipeDef } from '../sim/kairo/menu.js';
import { TICKS_PER_DAY } from '../sim/kairo/week.js';

export interface ShopViewDeps {
  /** 지금의 판정 재료 — 열 때마다 새로 묻는다 (캐시하면 산 직후가 틀린다) */
  context: () => ShopContext;
  /** 강화품을 붙일 수 있는 시설들 */
  targets: () => readonly PlacedFacility[];
  /**
   * 이번 주 진열 (Q3) — **화면이 목록을 만들지 않는다.** 판정은 `shopStock` 이 하고
   * 주차·시드·쓸모 목록은 부르는 쪽이 안다.
   */
  stock: () => { week: number; entries: ShopStockEntry[] };
  /** 결제 → 지급을 한 경계에서. 거절이면 `false` */
  buy: (item: ShopItemDef, handle?: number, sale?: boolean) => boolean;
  /**
   * 수배 (P4) — **맡긴다.** 지금 맡길 수 있는 것과 진행 중인 것.
   * `ticks` 는 남은 tick 이고 화면의 `D-2` 가 그 값에서 나온다.
   */
  commissions: () => {
    ready: { def: CommissionDef; blocked: 'grade' | 'cash' | 'busy' | 'slots' | null }[];
    running: { def: CommissionDef; ticks: number }[];
    slots: number;
  };
  order: (def: CommissionDef) => boolean;
  onClose?: () => void;
}

/** 무엇을 주는지 사람 말로 — 데이터의 `target` 은 id 라 화면에 그대로 못 쓴다 */
export function shopItemName(item: ShopItemDef): string {
  switch (item.kind) {
    case 'ingredient':
      return ingredientDef(item.target)?.name ?? item.target;
    case 'recipe':
      return recipeDef(item.target)?.name ?? item.target;
    case 'equipment':
      return courseEquipment(item.target)?.name ?? item.target;
    case 'decor':
      return facilityDef(item.target)?.name ?? item.target;
    case 'fitting':
      return FITTING_NAMES[item.target] ?? item.target;
  }
}

/**
 * 강화품 이름 — ⚠ 시설·장비와 달리 **정의 파일이 없다.** P5 가 `upgradeRequirement` 를
 * 데이터로 만들 때 그쪽으로 옮긴다. 그때까지 화면이 id 를 그대로 보이지 않게 여기서 잇는다.
 */
export const FITTING_NAMES: Record<string, string> = {
  parts_basic: '정비 부품',
  parts_premium: '고급 부품',
  safety_kit: '안전 키트',
  deco_kit: '장식 키트',
};

/** 수배 탭의 id — `SHOP_TABS` 밖이다 (상점 데이터가 아니라 다른 축이라서) */
export const COMMISSION_TAB = 'commission';

const COMMISSION_BLOCKED: Record<'grade' | 'cash' | 'busy' | 'slots', string> = {
  grade: '등급이 더 필요합니다',
  cash: '현금이 부족합니다',
  busy: '이미 맡겨 뒀습니다',
  slots: '동시에 맡길 수 있는 수를 넘었습니다',
};

const KIND_ICON: Record<ShopItemDef['kind'], string> = {
  ingredient: icon('ingredient'),
  recipe: icon('recipe-book'),
  equipment: icon('course'),
  decor: icon('flag'),
  fitting: icon('build'),
};

/** 못 사는 이유는 **방법까지** 말한다 (저장소 규칙) */
export function shopBlockedText(status: ShopItemStatus): string {
  const reason: ShopBlockedReason = status.blocked;
  if (reason === null) return '';
  if (reason === 'owned') return '이미 있습니다';
  if (reason === 'grade') return `${status.item.minGrade ?? 1}등급부터 살 수 있습니다`;
  if (reason === 'requires') return '조건을 아직 못 채웠습니다';
  return '현금이 부족합니다';
}

export class KairoShopView {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private tab: string = SHOP_TABS[0]?.id ?? 'ingredient';
  /** 강화품을 고르고 대상을 기다리는 중 */
  private pending: ShopItemDef | null = null;
  private deps: ShopViewDeps | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ksheet kshop');
    this.root.id = 'kairo-shop';
    this.root.hidden = true;
    const head = el('div', 'ksheet-head');
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-shop-close';
    head.append(el('div', 'ksheet-title', '상점'), close);
    attachSheetHandle(this.root, head, () => this.hide());
    this.body = el('div', 'ksheet-body kstack');
    this.root.append(head, this.body);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(deps: ShopViewDeps): void {
    if (!panelHost.open(this)) return;
    this.deps = deps;
    this.pending = null;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
    const done = this.deps?.onClose;
    this.deps = null;
    this.pending = null;
    done?.();
    panelHost.closed(this);
  }

  /** 산 뒤 부르는 쪽이 새 상태로 다시 그리게 한다 */
  refresh(): void {
    if (this.visible) this.render();
  }

  private render(): void {
    const deps = this.deps;
    if (!deps) return;
    const stock = deps.stock();
    const all = stock.entries;
    this.body.replaceChildren();

    const tabs = el('div', 'kchips wrap');
    tabs.id = 'kairo-shop-tabs';
    /*
     * ⚠ **「맡긴다」가 마지막 탭이다** (P4). 앞 넷은 즉시고 이것만 기다린다 —
     * 그 차이가 D2 의 전부라 화면에서도 **줄을 갈라** 놓는다.
     */
    for (const t of [...SHOP_TABS, { id: COMMISSION_TAB, label: '맡긴다' }]) {
      const on = t.id === this.tab;
      const pick = button(`kbtn${on ? ' on' : ''}`, t.label, () => {
        this.tab = t.id;
        this.pending = null;
        this.render();
      });
      pick.dataset['shopTab'] = t.id;
      tabs.append(pick);
    }
    this.body.append(tabs);

    /*
     * ⚠ **즉시라는 것을 화면이 말한다.** 수배(P4)가 들어오면 같은 밴드 칸 안에 「맡긴다」가
     * 나란히 서므로, 둘의 차이를 여기서 미리 못 박아 둔다.
     */
    if (this.tab === COMMISSION_TAB) {
      this.renderCommissions(deps);
      return;
    }
    /*
     * ⚠ **이번 주 진열이라는 것을 말한다** (Q3). 안 말하면 「목록이 줄었다」로 읽힌다 —
     * 전량 24개를 보던 화면에서 8칸으로 줄었으므로, 그것이 **회전**이라는 사실이
     * 화면에 없으면 기능이 아니라 결함으로 보인다.
     */
    this.body.append(
      el(
        'div',
        'kcaption',
        `${String(stock.week)}주차 입고 — 고르면 바로 들어옵니다 · 다음 주에 새 물건이 들어옵니다`,
      ),
    );

    const list = el('div', 'kstack');
    list.id = 'kairo-shop-list';
    const rows = all.filter((s) => s.item.tab === this.tab);
    for (const status of rows) {
      list.append(this.row(status, deps));
    }
    this.body.append(list);
  }

  /** 수배 — **돈을 내고 기다린다.** 진행 중인 것이 위에 선다 (지금 상태가 먼저다) */
  private renderCommissions(deps: ShopViewDeps): void {
    const view = deps.commissions();
    this.body.append(
      el('div', 'kcaption', `맡기면 며칠 뒤에 옵니다 — 동시에 ${view.slots}건까지`),
    );

    const running = el('div', 'kstack');
    running.id = 'kairo-commission-running';
    for (const r of view.running) {
      const row = el('div', 'kitem wide');
      row.dataset['commissionRunning'] = r.def.id;
      const main = el('div', 'krow-main');
      // 남은 날 — 하루가 120tick 이므로 올림해서 「D-2」가 된다
      const days = Math.max(1, Math.ceil(r.ticks / TICKS_PER_DAY));
      main.append(
        el('div', 'kitem-name', `${icon('commission')} ${r.def.name}`),
        el('div', 'kcaption', `D-${days} · 진행 중`),
      );
      row.append(main);
      running.append(row);
    }
    if (view.running.length > 0) this.body.append(running);

    const list = el('div', 'kstack');
    list.id = 'kairo-commission-list';
    for (const r of view.ready) {
      const row = el('div', 'kitem wide');
      row.dataset['commissionItem'] = r.def.id;
      row.dataset['blocked'] = r.blocked ?? '';
      const main = el('div', 'krow-main');
      main.append(
        el('div', 'kitem-name', `${icon('commission')} ${r.def.name}`),
        el(
          'div',
          'kcaption',
          r.blocked === null
            ? `${won(r.def.cost)} · ${r.def.days}일` +
              (r.def.chance < 1 ? ` · 성공 ${Math.round(r.def.chance * 100)}%` : '')
            : COMMISSION_BLOCKED[r.blocked],
        ),
      );
      row.append(main);
      if (r.blocked === null) {
        const go = button('kbtn primary', '맡긴다', () => {
          if (deps.order(r.def)) this.render();
        });
        go.dataset['commissionOrder'] = r.def.id;
        row.append(go);
      }
      list.append(row);
    }
    this.body.append(list);
    void COMMISSIONS;
  }

  private row(status: ShopStockEntry, deps: ShopViewDeps): HTMLElement {
    const { item } = status;
    const sale = status.sale;
    const row = el('div', 'kitem wide');
    row.dataset['shopItem'] = item.id;
    if (sale) row.dataset['shopSale'] = '1';
    row.dataset['blocked'] = status.blocked ?? '';
    const main = el('div', 'krow-main');
    main.append(
      el('div', 'kitem-name', `${KIND_ICON[item.kind]} ${shopItemName(item)}`),
      el(
        'div',
        `kcaption${sale ? ' kshop-sale' : ''}`,
        status.blocked === null
          ? sale
            ? `${won(shopCost(item, true))} · 이번 주 특가`
            : won(shopCost(item))
          : shopBlockedText(status),
      ),
    );
    row.append(main);

    if (status.blocked === null) {
      const buy = button('kbtn primary', item.kind === 'fitting' ? '어디에' : '산다', () => {
        if (item.kind === 'fitting') {
          // ⚠ 대상을 고르기 전에는 **결제하지 않는다**
          this.pending = this.pending?.id === item.id ? null : item;
          this.render();
          return;
        }
        if (deps.buy(item, undefined, sale)) this.render();
      });
      buy.dataset['shopBuy'] = item.id;
      row.append(buy);
    }

    if (this.pending?.id === item.id) {
      const picks = el('div', 'kchips wrap');
      picks.dataset['shopTargets'] = item.id;
      const targets = deps.targets();
      if (targets.length === 0) {
        picks.append(el('div', 'kcaption', '붙일 시설이 없습니다 — 먼저 지으세요'));
      }
      for (const t of targets) {
        const name = facilityDef(t.defId)?.name ?? t.defId;
        const pick = button('kbtn', name, () => {
          if (deps.buy(item, t.handle, sale)) {
            this.pending = null;
            this.render();
          }
        });
        pick.dataset['shopTargetHandle'] = String(t.handle);
        picks.append(pick);
      }
      row.append(picks);
    }
    return row;
  }
}
