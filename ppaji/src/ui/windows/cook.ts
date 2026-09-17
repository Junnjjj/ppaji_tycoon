/**
 * 발견 창 — 요리 개발·기구 공방·기구 개조가 **같은 창**을 다른 낱말·저장소로 연다 (P7).
 * P56-a D3: 한 순서 「슬롯 → 큰 행동 버튼 → 보유 격자 → 결과 장면 카드 → 도감 격자」. 글자 칩은 없다 — 재료·부품·요리는 전부 **그림 카드**(등록부 그림, 없으면 계열 아이콘 폴백).
 * 정답표는 없다 — 카테고리 힌트만. 아직 안 산 재료도 격자에 잠긴 카드로 선다(G5: 빈 상태·숨김 없음).
 */
import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { iconEl, type IconName } from '../icons.js';
import { pictureEl, pictureId, type PictureKind } from '../pictures.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import { sceneCard, type SceneAxis } from '../scene-card.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import type { CookingStore, CookResultOf, RecipeLike, IngredientLike } from '../../sim/cooking.js';

const CAT_KO: Record<string, string> = { drink: '음료', snack: '스낵', meal: '식사', dessert: '디저트' };

const ING_ICON: Record<string, IconName> = { fruit: 'fruit', base: 'base', sweet: 'sweet', dairy: 'dairy', seafood: 'seafood', grain: 'grain', veg: 'veg', meat: 'meat', nut: 'nut' };

/** 발견 창 사양 (P7) — 요리와 공방이 같은 창을 다른 낱말·저장소로 연다 */
export interface DiscoverySpec {
  winId: string;
  title: string;
  /** 도감·실패작 절 제목 */
  codexLabel: string;
  shopLabel: string;
  catKo: Record<string, string>;
  icon: Record<string, IconName>;
  fallbackIcon: IconName;
  store(g: Game): CookingStore<RecipeLike, IngredientLike>;
  open(g: Game): boolean;
  can(g: Game, ids: readonly string[]): { ok: true } | { ok: false; reason: string };
  run(g: Game, ids: readonly string[]): CookResultOf<RecipeLike>;
  buy(g: Game, id: string): { ok: true } | { ok: false; reason: string };
  /** 결과 줄의 스탯 문구 */
  stats(r: RecipeLike): string;
  /** P56-a — 그림 등록부의 종류 (재료 → 결과) */
  picKind?: PictureKind;
  resultPicKind?: PictureKind;
  /** 결과의 그림 자리를 직접 준다(개조판 = 시설 스프라이트) — 없으면 등록부 */
  resultArt?(g: Game, r: RecipeLike): HTMLElement | null;
  /** 결과 장면 카드의 축 셋 — 없으면 taste/look/pop 을 axisLabels 로 */
  axes?(g: Game, r: RecipeLike): SceneAxis[];
  axisLabels?: [string, string, string];
  /** 행동 버튼 낱말(「개발」·「조합」·「개조 발견」) */
  verb?: string;
  /** P56-b2 — 결과 장면 카드의 배경(`scenes.json` id: cook · convert · item · letter) */
  sceneBg?: string;
}

export const COOK_SPEC: DiscoverySpec = {
  winId: 'win-cook', title: '요리 개발', codexLabel: '도감', shopLabel: '재료 사기', catKo: CAT_KO, icon: ING_ICON, fallbackIcon: 'cook',
  store: (g) => g.cooking as unknown as CookingStore<RecipeLike, IngredientLike>,
  open: (g) => g.cookingOpen,
  can: (g, ids) => g.canCook(ids),
  run: (g, ids) => g.cook(ids) as CookResultOf<RecipeLike>,
  buy: (g, id) => g.buyIngredient(id),
  stats: (r) => { const x = r as unknown as { taste: number; look: number; pop: number }; return `맛 ${x.taste} 외관 ${x.look} 인기 ${x.pop}`; },
  picKind: 'ingredient', resultPicKind: 'recipe', axisLabels: ['맛', '외관', '인기'], verb: '개발', sceneBg: 'cook',
};

const AXIS_ICON: [IconName, IconName, IconName] = ['restaurant', 'star', 'heart'];

export class CookWindow {
  readonly win: WindowPanel;
  private readonly head = el('div', 'krow');
  private readonly slots = el('div', 'kpslots kpicked');
  private readonly result = el('div', 'kresult'); // P56-a: 행(.krow)이 아니라 블록 — 장면 카드가 세로로 길다
  private readonly cookBtn: HTMLButtonElement;
  private readonly ingGrid: PictureGrid;
  private readonly codexHead = el('div', 'krow-name');
  private readonly codexGrid: PictureGrid;
  private readonly failHead = el('div', 'krow-name', '실패작');
  private readonly failGrid: PictureGrid;
  private sel: string[] = [];

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }, private readonly spec: DiscoverySpec = COOK_SPEC) {
    this.win = new WindowPanel(parent, spec.winId, spec.title, 'blue');
    this.cookBtn = el('button', 'kbtn primary', `${spec.verb ?? '개발'}하기`);
    this.cookBtn.type = 'button';
    this.cookBtn.id = `${spec.winId}-go`;
    this.cookBtn.addEventListener('click', () => this.cook());
    this.result.classList.add('khide');
    this.ingGrid = new PictureGrid({ name: `${spec.winId}-ingredients`, countLabel: '보유', onTap: (c) => this.tapIngredient(c) });
    this.codexGrid = new PictureGrid({ name: `${spec.winId}-codex`, onTap: (c) => this.tapCodex(c) });
    this.failGrid = new PictureGrid({ name: `${spec.winId}-fails`, noFooter: true });
    this.win.body.append(this.head, this.slots, this.cookBtn, this.result, el('div', 'krow-name', `보유 ${wordOf(spec)}`), this.ingGrid.root, this.codexHead, this.codexGrid.root, this.failHead, this.failGrid.root);
  }

  private ingIcon(cls: string | undefined): IconName { return this.spec.icon[cls ?? ''] ?? this.spec.fallbackIcon; }

  private ingArt(ing: IngredientLike): HTMLElement {
    return pictureEl(pictureId(this.spec.picKind ?? 'ingredient', ing.id), this.ingIcon(ing.class));
  }

  private recipeArt(g: Game, r: RecipeLike): HTMLElement {
    const own = this.spec.resultArt?.(g, r);
    if (own) return own;
    return pictureEl(pictureId(this.spec.resultPicKind ?? 'recipe', r.id), this.spec.fallbackIcon);
  }

  show(): void {
    this.sel = []; // 열 때마다 빈 칸에서 시작 (원작과 같다)
    this.result.classList.add('khide');
    this.render();
    this.win.show();
  }

  private render(): void {
    const g = this.game();
    const c = this.spec.store(g);
    const CAT = this.spec.catKo;
    const w = c.words;
    this.head.replaceChildren();
    const next = c.expToNext();
    this.head.append(el('span', 'krow-k', `${this.spec.title.slice(0, 2)} Lv${c.level} · ${this.spec.codexLabel} ${c.known.size}/${c.recipes.size}`), el('span', 'krow-v', next ? `EXP ${next.cur}/${next.need}` : 'EXP MAX'));
    // 슬롯 — 그림이 들어간다. 탭하면 뺀다
    this.slots.replaceChildren();
    for (let k = 0; k < w.maxCount; k++) {
      const id = this.sel[k];
      const ing = id ? c.ingredients.get(id) : undefined;
      const b = el('button', `kpslot${id ? ' on' : ''}`, '');
      if (ing) b.append(this.ingArt(ing), el('span', undefined, ing.name)); else b.textContent = '+'; // W-5: 빈 슬롯은 점선 「+」(메뉴 편집과 같다)
      b.type = 'button';
      b.dataset['picked'] = String(k);
      b.addEventListener('click', () => { if (id) { this.sel.splice(k, 1); this.render(); } });
      this.slots.append(b);
    }
    // 보유 격자 — 가진 재료는 탭 = 슬롯에(재고 `×N`, 시작 재료는 ∞), 재고가 떨어졌으면 탭 = 확인 뒤 구입 · 아직 안 산 장날 재료는 잠긴 카드 + 가격(탭 = 확인 뒤 구입) (P56-c 재고)
    const cards: PictureCard[] = [];
    const full = this.sel.length >= w.maxCount;
    for (const ing of c.ingredients.values()) {
      const owned = c.owned.has(ing.id);
      if (!owned && ing.unlock !== 'shop') continue; // 소원·인증 보상 재료는 받기 전엔 자리가 없다(원작도 같다)
      const price = (ing as { price?: number }).price;
      const priceText = price !== undefined ? `${price.toLocaleString('ko-KR')}G` : undefined;
      const cat = CAT[ing.class ?? ''] ?? ing.class ?? '';
      if (!owned) {
        const locked: PictureCard = { id: ing.id, name: ing.name, art: this.ingArt(ing), sub: cat, badge: { text: '구입' }, desc: (price ?? 0) > g.money ? '돈이 모자란다' : '탭하면 산다 — 재고 ×1', data: { buyIngredient: ing.id } };
        if (priceText !== undefined) locked.price = priceText;
        cards.push(locked);
        continue;
      }
      const stock = c.stockOf(ing.id); // null = 무한
      const inSlots = this.sel.filter((id) => id === ing.id).length;
      const avail = stock === null ? Infinity : stock - inSlots;
      const card: PictureCard = { id: ing.id, name: ing.name, art: this.ingArt(ing), sub: cat, count: stock === null ? '∞' : stock, data: { ingredient: ing.id, owned: '1', stock: stock === null ? 'inf' : String(stock) } };
      if (priceText !== undefined) card.price = priceText;
      if (avail > 0) { card.desc = full ? '슬롯이 찼다 — 슬롯을 탭하면 뺀다' : stock === null ? '탭하면 슬롯에 넣는다 · 기본 재료는 무한' : `탭하면 슬롯에 넣는다 · 재고 ×${stock}`; card.disabled = full; }
      else if (priceText !== undefined) { card.badge = { text: stock === 0 ? '재고 0' : '슬롯에' }; card.desc = (price ?? 0) > g.money ? `재고가 없다 — ${priceText} 가 모자란다` : `재고가 없다 — 탭하면 ${priceText} 에 하나 산다`; card.data = { ...card.data, buyIngredient: ing.id }; }
      else { card.badge = { text: '재고 0' }; card.desc = '재고가 없다 — 소원·인증 보상으로 다시 받는다'; card.disabled = true; }
      cards.push(card);
    }
    cards.sort((x, y) => Number(!!y.data?.['ingredient']) - Number(!!x.data?.['ingredient'])); // 가진 것 먼저, 잠긴 상점 재료는 뒤에
    this.ingGrid.render(cards);
    const can = this.spec.can(g, this.sel);
    this.cookBtn.disabled = !can.ok;
    const verb = this.spec.verb ?? '개발';
    this.cookBtn.textContent = can.ok ? `${verb} 시작 · ${w.cost.toLocaleString('ko-KR')}G` : !this.spec.open(g) ? `${verb}은 랭크 ${w.unlockRank} 부터` : can.reason;
    // 도감 격자 — 아는 것은 그림, 모르는 것은 실루엣 `?`. 아는 카드 탭 = 「설정」(슬롯 채움, G41)
    const known = [...c.recipes.values()].filter((r) => r.unlock !== 'fail');
    this.codexHead.textContent = `${this.spec.codexLabel} ${known.filter((r) => c.known.has(r.id)).length}/${known.length}`;
    const codex: PictureCard[] = known.map((r) => {
      const has = c.known.has(r.id);
      const art = has ? this.recipeArt(g, r) : iconEl(this.spec.fallbackIcon, 'kpic-fb');
      const fill = has ? c.fillFor(r.id) : null;
      return has
        ? { id: r.id, name: r.name, art, sub: CAT[r.cat] ?? r.cat, desc: this.spec.stats(r) + (fill ? ' · 탭 = 설정' : ''), data: { codex: r.id, setRecipe: r.id }, disabled: !fill }
        : { id: r.id, name: '???', art, silhouette: true, disabled: true, sub: '', desc: '아직 모른다', data: { codex: r.id } };
    });
    this.codexGrid.render(codex);
    // 실패작 절 — 만들어 본 것만 (원작 「카이로봇 레시피」: 야채 찌꺼기·탄 빵)
    const fails = c.failDishes.filter((r) => c.known.has(r.id));
    this.failHead.classList.toggle('khide', fails.length === 0);
    this.failGrid.root.classList.toggle('khide', fails.length === 0);
    this.failGrid.render(fails.map((r) => ({ id: r.id, name: r.name, art: this.recipeArt(g, r), sub: CAT[r.cat] ?? r.cat, desc: this.spec.stats(r), data: { codex: r.id, fail: '1' }, disabled: true })));
    for (const b of this.failGrid.root.querySelectorAll('.kpcard')) b.classList.add('kfail');
  }

  private tapIngredient(card: PictureCard): void {
    const g = this.game();
    const c = this.spec.store(g);
    const stock = c.stockOf(card.id);
    const inSlots = this.sel.filter((id) => id === card.id).length;
    const canSlot = c.owned.has(card.id) && (stock === null || stock - inSlots > 0);
    if (card.data?.['buyIngredient'] && !canSlot) {
      // P56-c: 안 산 장날 재료, 또는 열쇠는 있는데 재고가 (슬롯에 든 것까지) 떨어진 재료 — 확인 뒤 하나 산다
      const ing = c.ingredients.get(card.id);
      if (!ing) return;
      const price = (ing as { price?: number }).price ?? 0;
      const after = (stock ?? 0) + 1;
      confirmDialog({ title: `${ing.name}을(를) 살까요?`, body: `재고 ×${stock ?? 0} → ×${after} · 조합에 하나씩 든다, 장날에서 다시 산다`, cost: price, onYes: () => {
        const r = this.spec.buy(g, ing.id);
        this.host.toast(r.ok ? `${ing.name} ×1 구입 — 재고 ×${c.stockOf(ing.id) ?? 0}` : r.reason, r.ok);
        if (r.ok) this.host.onChanged();
        this.render();
      } });
      return;
    }
    if (!canSlot || this.sel.length >= c.words.maxCount) return;
    this.sel.push(card.id);
    this.render();
  }

  private tapCodex(card: PictureCard): void {
    const c = this.spec.store(this.game());
    const f = c.fillFor(card.id);
    if (f) { this.sel = f; this.render(); }
  }

  private cook(): void {
    const g = this.game();
    const CAT = this.spec.catKo;
    const r = this.spec.run(g, this.sel);
    this.result.classList.remove('khide');
    this.result.replaceChildren();
    this.result.dataset['outcome'] = r.ok ? (r.via === 'fail' ? 'fail' : r.first ? 'new' : 'known') : 'blocked';
    if (r.ok) {
      const title = r.via === 'fail' ? `${r.recipe.name}이 됐다…` : r.via === 'upgrade' ? `강화! ${r.from?.name ?? ''} → ${r.recipe.name}` : r.first ? `발견! ${r.recipe.name}` : `${r.recipe.name} — 이미 아는 ${wordOf(this.spec) === '재료' ? '요리' : '것'}`;
      const hint = r.via === 'fail' ? this.spec.store(g).hintFor(this.sel) : undefined;
      const axes = this.spec.axes?.(g, r.recipe) ?? defaultAxes(this.spec, r.recipe);
      this.result.append(sceneCard({
        art: this.recipeArt(g, r.recipe), title, axes, mood: r.via === 'fail' ? 'calm' : 'happy',
        score: { label: CAT[r.recipe.cat] ?? r.recipe.cat, value: r.via === 'fail' && hint ? `힌트 ${CAT[hint] ?? hint} 쪽` : r.first ? 'NEW' : '' },
        data: { via: r.via },
        ...(this.spec.sceneBg ? { bg: this.spec.sceneBg } : {}),
      }));
      if (r.via === 'fail') this.host.toast(`${r.recipe.name} — 실패작도 ${wordOf(this.spec) === '재료' ? '요리' : '결과'}다`, false);
      else this.host.toast(r.first ? `새 발견 ${r.recipe.name}!` : `${r.recipe.name} 을 다시 만들었다`, true);
    } else {
      this.result.append(el('span', 'krow-name', r.reason));
      this.host.toast(r.reason, false);
    }
    this.host.onChanged();
    this.sel = [];
    this.render();
  }
}

function wordOf(spec: DiscoverySpec): string {
  return spec.picKind === 'part' ? '부품' : '재료';
}

function defaultAxes(spec: DiscoverySpec, r: RecipeLike): SceneAxis[] {
  const x = r as unknown as { taste?: number; look?: number; pop?: number };
  const labels = spec.axisLabels ?? ['맛', '외관', '인기'];
  const vals = [x.taste ?? 0, x.look ?? 0, x.pop ?? 0];
  return labels.map((label, k) => ({ label, icon: AXIS_ICON[k] as IconName, value: String(vals[k]), gauge: Math.min(5, vals[k] ?? 0) }));
}
