/**
 * 풀 편집 Dock — 하단 바 자리를 **대신** 차지한다 (스크림 없음, 지도는 살아 있다).
 * 탭 셋: 파기 · 메우기 (칸 토글 → `완료` 일괄 청구) · 아이템 (풀을 탭해 고르고 칩을 눌러 즉시 투입, ≤20).
 * 시간은 멈추지 않는다: 청구는 완료 순간의 현금으로 판정하므로 결산과 경쟁하지 않는다.
 */
import { el } from '../dom.js';
import { setUiSurface } from '../panels.js';
import type { Game, Result } from '../../sim/game.js';
import type { ItemDef, TileDef } from '../../data/schema.js';

export type PoolEditMode = 'dig' | 'fill' | 'item' | 'indoor' | 'unindoor';

export interface PoolEditHost {
  showSelection(tiles: readonly { i: number; j: number }[], mode: PoolEditMode): void;
  toast(text: string, ok: boolean): void;
  onApplied(): void;
}

const COLOR_KO: Record<string, string> = { clear: '맑음', orange: '주황', yellow: '노랑', lime: '라임', green: '초록', blue: '파랑', purple: '보라', pink: '핑크', red: '빨강', white: '흰색', rainbow: '무지개' };
const SCENT_KO: Record<string, string> = { citrus: '시트러스', floral: '꽃', pine: '솔', fruity: '과일', tropical: '트로피컬', berry: '베리', marine: '바다', cookie: '쿠키', spices: '향신료', milky: '우유', coffee: '커피', money: '머니' };

export class PoolEditDock {
  readonly root: HTMLDivElement;
  private readonly modeLabel = el('span', 'kdock-mode', '풀 파기');
  private readonly costLabel = el('span', 'kdock-cost', '0칸 · 0G');
  private readonly status = el('div', 'kdock-status', '');
  private readonly tabs = new Map<PoolEditMode, HTMLButtonElement>();
  private readonly chips = el('div', 'kchips');
  /** G52: 고른 아이템의 투입 효과 미리보기 (원작 「아이템 투입 효과」) */
  private readonly preview = el('div', 'kpreview khide');
  private pick: string | null = null;
  private readonly actions = el('div', 'kdock-row');
  private readonly doneBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private mode: PoolEditMode = 'dig';
  private selected = new Map<number, { i: number; j: number }>();
  private poolId: number | null = null;
  private active = false;

  private tileId = 'standard';
  private readonly tileChips = el('div', 'kchips');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly items: readonly ItemDef[], private readonly tiles: readonly TileDef[], private readonly host: PoolEditHost) {
    this.root = el('div', 'kdock');
    this.root.id = 'dock-pool';
    this.root.hidden = true;
    const row1 = el('div', 'kdock-row');
    row1.append(this.modeLabel, this.costLabel);
    const tabs = el('div', 'kdock-row ktabs');
    for (const [m, label] of [['dig', '파기'], ['fill', '메우기'], ['item', '아이템'], ['indoor', '실내 바닥'], ['unindoor', '실내 지우기']] as const) {
      const b = el('button', 'ktab', label);
      b.type = 'button';
      b.dataset['mode'] = m;
      b.addEventListener('click', () => this.setMode(m));
      this.tabs.set(m, b);
      tabs.append(b);
    }
    this.chips.hidden = true;
    this.preview.id = 'dock-pool-preview';
    const cancel = el('button', 'kbtn', '취소');
    cancel.type = 'button';
    cancel.id = 'dock-pool-cancel';
    cancel.addEventListener('click', () => this.exit());
    this.undoBtn = el('button', 'kbtn', '되돌리기');
    this.undoBtn.type = 'button';
    this.undoBtn.id = 'dock-pool-undo';
    this.undoBtn.addEventListener('click', () => this.clearSelection());
    this.doneBtn = el('button', 'kbtn primary', '완료');
    this.doneBtn.type = 'button';
    this.doneBtn.id = 'dock-pool-done';
    this.doneBtn.addEventListener('click', () => this.apply());
    this.actions.append(cancel, this.undoBtn, this.doneBtn);
    this.tileChips.hidden = true;
    this.root.append(row1, this.status, tabs, this.tileChips, this.chips, this.preview, this.actions);
    parent.append(this.root);
    this.setMode('dig');
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentMode(): PoolEditMode {
    return this.mode;
  }

  get selection(): readonly { i: number; j: number }[] {
    return [...this.selected.values()];
  }

  get selectedPool(): number | null {
    return this.poolId;
  }

  enter(mode: PoolEditMode = 'dig', poolId?: number): void {
    this.active = true;
    this.root.hidden = false;
    this.poolId = poolId ?? null;
    this.setMode(mode);
    this.clearSelection();
    setUiSurface('pool');
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.root.hidden = true;
    this.clearSelection();
    this.poolId = null;
    setUiSurface('home');
  }

  setMode(m: PoolEditMode): void {
    if (this.mode !== m) this.clearSelection();
    this.mode = m;
    this.modeLabel.textContent = m === 'dig' ? '풀 파기' : m === 'fill' ? '풀 메우기' : m === 'item' ? '아이템 넣기' : m === 'indoor' ? '실내 바닥 깔기' : '실내 지우기';
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === m);
    this.chips.hidden = m !== 'item';
    this.tileChips.hidden = m !== 'dig';
    if (m === 'dig') this.renderTiles();
    this.undoBtn.hidden = m === 'item';
    this.doneBtn.hidden = m === 'item';
    this.doneBtn.hidden = m === 'item';
    this.pick = null;
    if (m === 'item' && this.poolId === null && this.game().pools.all.length === 1) this.poolId = this.game().pools.all[0]?.id ?? null;
    this.refresh();
  }

  /** 지도 탭 — 파기/메우기는 칸 토글, 아이템은 풀 고르기 */
  toggleTile(i: number, j: number): void {
    if (!this.active) return;
    if (this.mode === 'item') {
      const p = this.game().pools.at(i, j);
      if (!p) {
        this.host.toast('풀을 탭해서 고르세요', false);
        return;
      }
      this.poolId = p.id;
      this.refresh();
      return;
    }
    const k = j * this.game().grid.w + i;
    if (this.selected.has(k)) {
      this.selected.delete(k);
      this.refresh();
      return;
    }
    const r: Result = this.mode === 'dig' ? this.game().canDig(i, j) : this.mode === 'fill' ? this.game().canFill(i, j) : this.mode === 'indoor' ? this.game().canPaintIndoor(i, j) : (this.game().grid.at(i, j) === 3 ? { ok: true } : { ok: false, reason: '실내가 아닙니다' });
    if (!r.ok) {
      this.host.toast(r.reason, false);
      return;
    }
    this.selected.set(k, { i, j });
    this.refresh();
  }

  clearSelection(): void {
    this.selected.clear();
    this.refresh();
  }

  get currentTile(): string {
    return this.tileId;
  }

  private renderTiles(): void {
    const g = this.game();
    this.tileChips.replaceChildren();
    for (const t of this.tiles) {
      if (!g.unlocked.tiles.has(t.id)) continue;
      const b = el('button', `kchip${t.id === this.tileId ? ' on' : ''}`, `${t.name} ${t.cost}G · 인기 ${t.pop}`);
      b.type = 'button';
      b.dataset['tile'] = t.id;
      b.addEventListener('click', () => { this.tileId = t.id; this.renderTiles(); this.refresh(); });
      this.tileChips.append(b);
    }
  }

  private cost(): number {
    const tiles = this.selection;
    if (this.mode === 'indoor') return tiles.length * 40;
    if (this.mode === 'unindoor') return 0;
    return this.mode === 'dig' ? this.game().digCost(tiles, this.tileId) : this.game().fillCost(tiles);
  }

  private refresh(): void {
    if (this.mode === 'item') {
      this.renderItems();
      return;
    }
    const n = this.selected.size;
    this.costLabel.textContent = `${n}칸 · ${this.cost().toLocaleString('ko-KR')}G`;
    this.status.textContent = this.mode === 'dig' ? '잔디를 탭해 팔 칸을 고르세요 (완료에서 일괄 청구)' : this.mode === 'fill' ? '풀 칸을 탭해 메울 칸을 고르세요' : this.mode === 'indoor' ? '실내로 만들 칸을 고르세요 — 풀을 둘러싸면 실내 풀 (계절 무관, 26°C)' : '지울 실내 칸을 고르세요';
    this.doneBtn.disabled = n === 0 || this.cost() > this.game().money;
    this.host.showSelection(this.selection, this.mode);
  }

  private renderItems(): void {
    const g = this.game();
    const p = this.poolId === null ? undefined : g.pools.byId(this.poolId);
    const st = p ? g.poolState(p.id) : null;
    this.costLabel.textContent = p ? `풀 #${p.id} · ${p.items.length}/20` : '풀 없음';
    this.status.textContent = p && st
      ? `${COLOR_KO[st.color] ?? st.color} 농도 ${st.detail.intensityBars}/5 · ${st.scent ? SCENT_KO[st.scent] ?? st.scent : '무향'} · ${Math.round(st.temp)}°C (이상 ${st.detail.idealTemp}) · 인기 ${st.popularity}${st.seasonBonus ? ` (계절 +${st.seasonBonus})` : ''}`
      : '지도에서 풀을 탭해 고르세요';
    this.host.showSelection(p ? p.tiles.map((k) => ({ i: k % g.grid.w, j: Math.floor(k / g.grid.w) })) : [], 'item');
    this.chips.replaceChildren();
    for (const it of this.items) {
      if (!g.isItemUnlocked(it.id)) continue;
      const b = el('button', `kchip${this.pick === it.id ? ' on' : ''}`, `${it.name} ${it.price}G`);
      b.type = 'button';
      b.dataset['item'] = it.id;
      // R2 (G30): 색이 바뀌면 좋아요가 0 — 넣기 전에 칩에 적는다
      const pv = p ? g.previewItem(p.id, it.id) : null;
      if (pv?.resets) { b.classList.add('warn'); b.dataset['resets'] = String(pv.likes); b.append(el('span', 'kchip-sub', ` · 색 바뀜 → 좋아요 ${pv.likes.toLocaleString('ko-KR')} 리셋`)); }
      b.title = `${it.color ? COLOR_KO[it.color] : '색 없음'} · ${it.scent ? SCENT_KO[it.scent] : '무향'} · ${it.tempDelta >= 0 ? '+' : ''}${it.tempDelta}°C · ${it.days}일 (풀에 이미 아이템이 있으면 그 만료를 따른다)`;
      b.disabled = !p || !g.canPutItem(p.id, it.id).ok;
      // G52: 첫 탭은 미리보기(전후), 같은 칩을 다시 탭하거나 「넣기」 를 누르면 투입
      b.addEventListener('click', () => {
        if (!p) return;
        if (this.pick === it.id) { this.put(p.id, it); return; }
        this.pick = it.id;
        this.renderItems();
      });
      this.chips.append(b);
    }
    this.renderPreview(p ? p.id : null);
  }

  private put(poolId: number, it: ItemDef): void {
    const r = this.game().putItem(poolId, it.id);
    this.host.toast(r.ok ? `${it.name} 투입 · −${it.price}G` : r.reason, r.ok);
    if (r.ok) { this.host.onApplied(); this.pick = null; }
    this.refresh();
  }

  /** 미리보기 — 색(농도)·향·온도·인기의 전→후 한 줄씩 + 「넣기」 */
  private renderPreview(poolId: number | null): void {
    const it = this.pick ? this.items.find((x) => x.id === this.pick) : undefined;
    const pv = poolId !== null && it ? this.game().previewItem(poolId, it.id) : null;
    this.preview.classList.toggle('khide', !pv || !it);
    if (!pv || !it) { this.preview.replaceChildren(); return; }
    const a = pv.states.before; const b = pv.states.after;
    const colorOf = (st: typeof a): string => `${COLOR_KO[st.color] ?? st.color} ${st.detail.intensityBars}/5`;
    const scentOf = (st: typeof a): string => (st.scent ? SCENT_KO[st.scent] ?? st.scent : '무향');
    const tempOf = (st: typeof a): string => `${Math.round(st.temp)}°C`;
    const row = (k: string, from: string, to: string): HTMLElement => {
      const r = el('div', 'kprev-row');
      const v = el('span', 'kprev-v');
      v.append(el('span', from === to ? 'kprev-same' : 'kprev-from', from), el('span', 'kprev-arrow', from === to ? ' = ' : ' → '), el('span', undefined, to));
      r.append(el('span', 'kprev-k', k), v);
      return r;
    };
    const dPop = b.popularity - a.popularity;
    const head = el('div', 'kprev-head');
    head.append(el('span', 'kprev-title', `${it.name} 투입 효과`), el('span', 'knum', `${it.price}G · ${it.days}일`));
    const put = el('button', 'kbtn primary', '넣기');
    put.type = 'button';
    put.id = 'dock-pool-put';
    put.disabled = !this.game().canPutItem(poolId as number, it.id).ok;
    put.addEventListener('click', () => this.put(poolId as number, it));
    const rows = el('div', 'kprev-rows');
    const need = b.color === 'clear' && it.color ? this.game().itemsToColor(poolId as number, it.id) : null;
    const colorAfter = need && need > 1 ? `${colorOf(b)} · ${COLOR_KO[it.color as string] ?? it.color}까지 ${need > 6 ? '7개+' : `${need}개`}` : colorOf(b);
    rows.append(row('색', colorOf(a), colorAfter), row('향', scentOf(a), scentOf(b)), row('온도', tempOf(a), tempOf(b)), row('인기', String(a.popularity), `${b.popularity} (${dPop >= 0 ? '+' : ''}${dPop})`));
    const foot = el('div', 'kprev-foot');
    if (pv.resets) foot.append(el('span', 'kprev-warn', `색이 바뀌면 좋아요 ${pv.likes.toLocaleString('ko-KR')} 이 0 이 됩니다`));
    foot.append(put);
    this.preview.replaceChildren(head, rows, foot);
  }

  private apply(): void {
    const tiles = this.selection;
    const r = this.mode === 'dig' ? this.game().digPool(tiles, this.tileId) : this.mode === 'fill' ? this.game().fillPool(tiles) : this.mode === 'indoor' ? this.game().paintIndoor(tiles) : this.game().unpaintIndoor(tiles);
    if (!r.ok) {
      this.host.toast(r.reason, false);
      return;
    }
    this.host.toast(`${this.mode === 'dig' ? '풀 파기' : this.mode === 'fill' ? '메우기' : this.mode === 'indoor' ? '실내 바닥' : '실내 지우기'} 완료 · ${tiles.length}칸 · −${this.cost().toLocaleString('ko-KR')}G`, true);
    this.host.onApplied();
    this.exit();
  }
}
