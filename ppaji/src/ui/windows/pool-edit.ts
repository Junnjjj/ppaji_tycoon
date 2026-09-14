/**
 * 풀 편집 Dock — 하단 바 자리를 **대신** 차지한다 (스크림 없음, 지도는 살아 있다).
 * 탭 셋: 파기 · 메우기 (칸 토글 → `완료` 일괄 청구) · 아이템 (풀을 탭해 고르고 칩을 눌러 즉시 투입, ≤20).
 * 시간은 멈추지 않는다: 청구는 완료 순간의 현금으로 판정하므로 결산과 경쟁하지 않는다.
 */
import { el } from '../dom.js';
import { assetUrl } from '../asset-url.js';
import { COLOR_KO, SCENT_KO } from '../../sim/lines.js'; // P3: 물빛·분위기 낱말은 한 곳
import { setUiSurface } from '../panels.js';
import { PATH_COST, type Game, type Result, GROUNDS, GROUND_BY_ID } from '../../sim/game.js';
import { FLOOR } from '../../sim/grid.js';
import type { ItemDef } from '../../data/schema.js';
import { PictureGrid, type PictureCard } from '../picture-grid.js';
import { pictureEl, pictureId } from '../pictures.js';

export type PoolEditMode = 'dig' | 'fill' | 'item' | 'deck' | 'undeck' | 'indoor' | 'unindoor' | 'path' | 'unpath' | 'ground' | 'ppaji' | 'line'; // P49-b: 빠지(두 모서리 사각형) · 라인(1×2/4/6 조각)

export interface PoolEditHost {
  showSelection(tiles: readonly { i: number; j: number }[], mode: PoolEditMode): void;
  toast(text: string, ok: boolean): void;
  onApplied(): void;
}


export class PoolEditDock {
  readonly root: HTMLDivElement;
  private readonly modeLabel = el('span', 'kdock-mode', '풀 파기');
  private readonly costLabel = el('span', 'kdock-cost', '0칸 · 0G');
  private readonly status = el('div', 'kdock-status', '');
  private readonly tabs = new Map<PoolEditMode, HTMLButtonElement>();
  private readonly chips = el('div', 'kchips');
  /** P56-a2 — 소품 카드 격자(그림 · 값 · 「색 바뀜」 배지). 첫 탭 = 미리보기, 같은 카드 다시 탭 = 투입 */
  private readonly itemGrid = new PictureGrid({ name: 'pool-items', onTap: (c) => this.tapItem(c) });
  /** G52: 고른 아이템의 투입 효과 미리보기 (원작 「아이템 투입 효과」) */
  private readonly preview = el('div', 'kpreview khide');
  private pick: string | null = null;
  private readonly actions = el('div', 'kdock-row');
  private readonly doneBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private mode: PoolEditMode = 'dig';
  /** P49-b 빠지 붓 — 첫 모서리 · 라인 길이·방향 */
  private corner: { i: number; j: number } | null = null;
  private rect: { i0: number; j0: number; w: number; h: number } | null = null;
  private lineLen = 4;
  private lineFacing: 0 | 1 = 0;
  private lineAt: { i: number; j: number } | null = null;
  private readonly lineChips = el('div', 'kchips');
  private selected = new Map<number, { i: number; j: number }>();
  private poolId: number | null = null;
  private active = false;

  /** P22 지면 붓 — 고른 지면 */
  private groundId = 'sandpath';
  private readonly groundChips = el('div', 'kchips');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly items: readonly ItemDef[], private readonly host: PoolEditHost) {
    this.root = el('div', 'kdock');
    this.root.id = 'dock-pool';
    this.root.hidden = true;
    const row1 = el('div', 'kdock-row');
    row1.append(this.modeLabel, this.costLabel);
    const tabs = el('div', 'kdock-row ktabs');
    for (const [m, label] of [['ppaji', '빠지'], ['line', '라인'], ['dig', '치기'], ['fill', '걷기'], ['path', '길'], ['ground', '지면'], ['unpath', '바닥 걷기'], ['deck', '데크'], ['undeck', '데크 걷기'], ['item', '소품'], ['indoor', '건물 바닥'], ['unindoor', '건물 지우기']] as const) {
      const b = el('button', 'ktab', label);
      b.type = 'button';
      b.dataset['mode'] = m;
      if (m === 'dig' || m === 'fill') b.classList.add('khide'); // P15 D22: 수영 구역은 데크로 둘러싸서 만든다 — 치기 붓은 하네스·봇 전용
      b.addEventListener('click', () => this.setMode(m));
      this.tabs.set(m, b);
      tabs.append(b);
    }
    this.chips.hidden = true;
    this.chips.classList.add('kitem-grid'); // P56-a2: 소품은 글자 칩이 아니라 그림 카드 격자 — `.kchips` 가로 스크롤 대신 세로 격자
    this.chips.classList.remove('kchips');
    this.chips.append(this.itemGrid.root);
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
    this.groundChips.hidden = true;
    this.lineChips.hidden = true;
    this.root.append(row1, this.status, tabs, this.groundChips, this.lineChips, this.chips, this.preview, this.actions);
    parent.append(this.root);
    this.setMode('deck');
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

  enter(mode: PoolEditMode = 'deck', poolId?: number): void {
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
    this.modeLabel.textContent = m === 'ppaji' ? '빠지 두르기' : m === 'line' ? '라인 놓기' : m === 'dig' ? '수역 치기' : m === 'fill' ? '수역 걷기' : m === 'path' ? '길 깔기' : m === 'ground' ? '지면 깔기' : m === 'unpath' ? '바닥 걷기' : m === 'item' ? '소품 넣기' : m === 'deck' ? '데크 깔기' : m === 'undeck' ? '데크 걷기' : m === 'indoor' ? '실내 바닥 깔기' : '실내 지우기';
    for (const [k, b] of this.tabs) b.classList.toggle('on', k === m);
    this.chips.hidden = m !== 'item';
    this.groundChips.hidden = m !== 'ground';
    if (m === 'ground') this.renderGrounds();
    this.lineChips.hidden = m !== 'line';
    if (m === 'line') this.renderLineChips();
    this.corner = null; this.rect = null; this.lineAt = null;
    this.undoBtn.hidden = m === 'item';
    this.doneBtn.hidden = m === 'item';
    this.doneBtn.hidden = m === 'item';
    this.pick = null;
    if (m === 'item' && this.poolId === null && this.game().pools.all.length === 1) this.poolId = this.game().pools.all[0]?.id ?? null;
    this.refresh();
  }

  /** 지도 탭 — 파기/메우기는 칸 토글, 아이템은 풀 고르기 · P49-b 빠지는 두 모서리, 라인은 자리 하나 */
  toggleTile(i: number, j: number): void {
    if (!this.active) return;
    if (this.mode === 'ppaji') {
      if (!this.corner || this.rect) { this.corner = { i, j }; this.rect = null; this.selected.clear(); this.selected.set(j * this.game().grid.w + i, { i, j }); this.refresh(); return; }
      const i0 = Math.min(this.corner.i, i), j0 = Math.min(this.corner.j, j);
      this.rect = { i0, j0, w: Math.abs(i - this.corner.i) + 1, h: Math.abs(j - this.corner.j) + 1 };
      this.selected.clear();
      for (let b = this.rect.j0; b < this.rect.j0 + this.rect.h; b++) for (let a = this.rect.i0; a < this.rect.i0 + this.rect.w; a++) if (a === this.rect.i0 || a === this.rect.i0 + this.rect.w - 1 || b === this.rect.j0 || b === this.rect.j0 + this.rect.h - 1) this.selected.set(b * this.game().grid.w + a, { i: a, j: b });
      const c = this.game().canMakePpaji(this.rect);
      if (!c.ok) this.host.toast(c.reason, false);
      this.refresh();
      return;
    }
    if (this.mode === 'line') {
      this.lineAt = { i, j };
      this.selected.clear();
      for (const t of this.game().lineTiles(this.lineLen, i, j, this.lineFacing)) this.selected.set(t.j * this.game().grid.w + t.i, t);
      const c = this.game().canPlaceLine(this.lineLen, i, j, this.lineFacing);
      if (!c.ok) this.host.toast(c.reason, false);
      this.refresh();
      return;
    }
    const k = j * this.game().grid.w + i;
    if (this.selected.has(k)) {
      this.selected.delete(k);
      this.refresh();
      return;
    }
    const r: Result = this.mode === 'ground' ? this.game().canPaintGround(i, j, this.groundId) : this.mode === 'dig' ? this.game().canDig(i, j) : this.mode === 'fill' ? this.game().canFill(i, j) : this.mode === 'deck' ? this.game().canPaintDeck(i, j, [...this.selected.values()]) : this.mode === 'path' ? this.game().canPaintPath(i, j) : this.mode === 'unpath' ? (this.game().grid.at(i, j) === FLOOR.path ? { ok: true } : { ok: false, reason: '길이 아닙니다' }) : this.mode === 'undeck' ? (this.game().grid.at(i, j) === 7 ? { ok: true } : { ok: false, reason: '데크가 아닙니다' }) : this.mode === 'indoor' ? this.game().canPaintIndoor(i, j) : (this.game().grid.at(i, j) === 3 ? { ok: true } : { ok: false, reason: '실내가 아닙니다' });
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

  /** P22 지면 칩 — 5종 전부 처음부터 열려 있다 (바닥은 사는 것이다) */
  private renderGrounds(): void {
    this.groundChips.replaceChildren();
    for (const gd of GROUNDS) {
      const b = el('button', `kchip${gd.id === this.groundId ? ' on' : ''}`, `${gd.name} ${gd.cost}G${gd.walk ? ' · 걷는 길' : ' · 조경'}`);
      b.type = 'button';
      b.dataset['ground'] = gd.id;
      b.addEventListener('click', () => { this.groundId = gd.id; this.renderGrounds(); this.refresh(); });
      this.groundChips.append(b);
    }
  }


  private cost(): number {
    const tiles = this.selection;
    if (this.mode === 'ppaji') { const c = this.rect ? this.game().canMakePpaji(this.rect) : null; return c && c.ok ? c.cost ?? 0 : 0; }
    if (this.mode === 'line') { const c = this.lineAt ? this.game().canPlaceLine(this.lineLen, this.lineAt.i, this.lineAt.j, this.lineFacing) : null; return c && c.ok ? c.cost ?? 0 : 0; }
    if (this.mode === 'indoor') return tiles.length * 40;
    if (this.mode === 'unindoor' || this.mode === 'undeck') return 0;
    if (this.mode === 'deck') return this.game().deckCost(tiles);
    if (this.mode === 'path') return tiles.length * PATH_COST;
    if (this.mode === 'ground') return this.game().groundCost(tiles, this.groundId);
    if (this.mode === 'unpath') return 0;
    return this.mode === 'dig' ? this.game().digCost(tiles) : this.game().fillCost(tiles);
  }

  private refresh(): void {
    if (this.mode === 'item') {
      this.renderItems();
      return;
    }
    const n = this.selected.size;
    this.costLabel.textContent = `${n}칸 · ${this.cost().toLocaleString('ko-KR')}G`;
    if (this.mode === 'ppaji') { const c = this.rect ? this.game().canMakePpaji(this.rect) : null; this.status.textContent = !this.corner ? '빠지 — 물 위에 사각형의 첫 모서리를 탭하세요 (둘레는 폰툰, 안은 물)' : !this.rect ? '맞은편 모서리를 탭하세요 — 안쪽은 최소 4×5' : c && c.ok ? `링 ${this.selected.size}칸 · 물 위 폰툰 ${c.ringWater ?? 0}칸 × 60G · 새 수역 +${c.enclose ?? 0}칸 (남은 허가 ${Math.max(0, this.game().permitLeft)}칸)` : (c ? c.reason : ''); this.doneBtn.disabled = !(c && c.ok) || this.cost() > this.game().money; this.host.showSelection(this.selection, this.mode); this.costLabel.textContent = `${this.selected.size}칸 · ${this.cost().toLocaleString('ko-KR')}G`; return; }
    if (this.mode === 'line') { const c = this.lineAt ? this.game().canPlaceLine(this.lineLen, this.lineAt.i, this.lineAt.j, this.lineFacing) : null; this.status.textContent = !this.lineAt ? `라인 1×${this.lineLen} — 자리를 탭하세요 (↻ 로 회전)` : c && c.ok ? `1×${this.lineLen} ${this.lineFacing ? '세로' : '가로'} · ${(c.cost ?? 0).toLocaleString('ko-KR')}G` : (c ? c.reason : ''); this.doneBtn.disabled = !(c && c.ok) || this.cost() > this.game().money; this.host.showSelection(this.selection, this.mode); this.costLabel.textContent = `${this.selected.size}칸 · ${this.cost().toLocaleString('ko-KR')}G`; return; }
    this.status.textContent = this.mode === 'ground' ? `${GROUND_BY_ID.get(this.groundId)?.desc ?? ''} — 잔디·길 위 칸을 고르세요 (완료에서 일괄 청구)` : this.mode === 'dig' ? '강을 탭해 부표로 칠 칸을 고르세요 — 잔디면 인공 풀 (완료에서 일괄 청구)' : this.mode === 'fill' ? '수역 칸을 탭해 걷을 칸을 고르세요' : this.mode === 'path' ? '손님은 길·데크·실내만 걷는다 — 입구에서 시설까지 잔디를 탭해 길을 이으세요' : this.mode === 'unpath' ? '걷을 길 칸을 고르세요 (어딘가로 가는 유일한 길은 못 걷는다)' : this.mode === 'deck' ? '데크로 물을 둘러싸면 안쪽이 수영 구역이 된다 — 뭍이나 데크에 이어서 깔 칸을 고르세요 (손님이 서는 발판)' : this.mode === 'undeck' ? '걷을 데크 칸을 고르세요' : this.mode === 'indoor' ? '실내로 만들 칸을 고르세요 — 풀을 둘러싸면 실내 풀 (계절 무관, 26°C)' : '지울 실내 칸을 고르세요';
    this.doneBtn.disabled = n === 0 || this.cost() > this.game().money;
    this.host.showSelection(this.selection, this.mode);
  }

  private renderItems(): void {
    const g = this.game();
    const p = this.poolId === null ? undefined : g.pools.byId(this.poolId);
    const st = p ? g.poolState(p.id) : null;
    this.costLabel.textContent = p ? `수역 #${p.id} · ${p.items.length}/20` : '수역 없음';
    this.status.textContent = p && st
      ? `${COLOR_KO[st.color] ?? st.color} 농도 ${st.detail.intensityBars}/5 · ${st.scent ? SCENT_KO[st.scent] ?? st.scent : '무향'} · ${Math.round(st.temp)}°C (이상 ${st.detail.idealTemp}) · 인기 ${st.popularity}${st.seasonBonus ? ` (계절 +${st.seasonBonus})` : ''}`
      : '지도에서 풀을 탭해 고르세요';
    this.host.showSelection(p ? p.tiles.map((k) => ({ i: k % g.grid.w, j: Math.floor(k / g.grid.w) })) : [], 'item');
    // P56-a2 D2 — 소품은 그림 카드 격자: 그림(등록부 `pic/item/<id>`, 없으면 물 아이콘) · 우하 값 · 색 바뀜은 배지 · 아래 두 줄 = 색·향·온도·일수
    const cards: PictureCard[] = [];
    for (const it of this.items) {
      if (!g.isItemUnlocked(it.id)) continue;
      const pv = p ? g.previewItem(p.id, it.id) : null; // R2 (G30): 색이 바뀌면 좋아요가 0 — 넣기 전에 카드에 적는다
      const card: PictureCard = {
        id: it.id, name: it.name, art: pictureEl(pictureId('item', it.id), 'pool'), price: `${it.price.toLocaleString('ko-KR')}G`,
        sub: `${it.color ? COLOR_KO[it.color] : '색 없음'} · ${it.scent ? SCENT_KO[it.scent] : '무향'} · ${it.tempDelta >= 0 ? '+' : ''}${it.tempDelta}°C · ${it.days}일`,
        desc: pv?.resets ? `색 바뀜 → 좋아요 ${pv.likes.toLocaleString('ko-KR')} 리셋 · 다시 탭하면 넣는다` : this.pick === it.id ? '다시 탭하면 넣는다 (아래 미리보기)' : '탭 = 미리보기 · 다시 탭 = 넣기 (풀에 이미 아이템이 있으면 그 만료를 따른다)',
        disabled: !p || !g.canPutItem(p.id, it.id).ok,
        data: { item: it.id, ...(pv?.resets ? { resets: String(pv.likes) } : {}) },
      };
      if (pv?.resets) card.badge = { text: `색 바뀜 · 좋아요 ${pv.likes.toLocaleString('ko-KR')} 리셋` }; // R2 (G30): 경고는 카드 위에 — 아래 줄만으론 고르기 전에 안 보인다
      cards.push(card);
    }
    this.itemGrid.render(cards);
    this.itemGrid.select(this.pick);
    this.renderPreview(p ? p.id : null);
  }

  /** G52: 첫 탭은 미리보기(전후), 같은 카드를 다시 탭하거나 「넣기」 를 누르면 투입 */
  private tapItem(card: PictureCard): void {
    const p = this.poolId === null ? undefined : this.game().pools.byId(this.poolId);
    const it = this.items.find((x) => x.id === card.id);
    if (!p || !it) return;
    if (this.pick === it.id) { this.put(p.id, it); return; }
    this.pick = it.id;
    this.renderItems();
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
    const scentOf = (st: typeof a): string => (st.scent ? SCENT_KO[st.scent] ?? st.scent : '조용함');
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
    head.dataset['bg'] = 'item'; head.style.setProperty('--scene-bg', `url("${assetUrl('assets/scenes/scene_item.png')}")`); // P56-b2: 원작 「아이템 투입 효과」 위 일러스트
    head.append(el('span', 'kprev-title', `${it.name} 투입 효과`), el('span', 'knum', `${it.price}G · ${it.days}일`));
    const put = el('button', 'kbtn primary', '넣기');
    put.type = 'button';
    put.id = 'dock-pool-put';
    put.disabled = !this.game().canPutItem(poolId as number, it.id).ok;
    put.addEventListener('click', () => this.put(poolId as number, it));
    const rows = el('div', 'kprev-rows');
    const need = b.color === 'clear' && it.color ? this.game().itemsToColor(poolId as number, it.id) : null;
    const colorAfter = need && need > 1 ? `${colorOf(b)} · ${COLOR_KO[it.color as string] ?? it.color}까지 ${need > 6 ? '7개+' : `${need}개`}` : colorOf(b);
    rows.append(row('물빛', colorOf(a), colorAfter), row('분위기', scentOf(a), scentOf(b)), row('온도', tempOf(a), tempOf(b)), row('인기', String(a.popularity), `${b.popularity} (${dPop >= 0 ? '+' : ''}${dPop})`));
    const foot = el('div', 'kprev-foot');
    if (pv.resets) foot.append(el('span', 'kprev-warn', `색이 바뀌면 좋아요 ${pv.likes.toLocaleString('ko-KR')} 이 0 이 됩니다`));
    foot.append(put);
    this.preview.replaceChildren(head, rows, foot);
  }

  private renderLineChips(): void {
    this.lineChips.replaceChildren();
    for (const len of this.game().b.ppajiLineLens) {
      const b = el('button', `kchip${len === this.lineLen ? ' on' : ''}`, `1×${len}`);
      b.type = 'button'; b.dataset['line'] = String(len);
      b.addEventListener('click', () => { this.lineLen = len; this.lineAt = null; this.selected.clear(); this.renderLineChips(); this.refresh(); });
      this.lineChips.append(b);
    }
    const rot = el('button', 'kchip', `↻ ${this.lineFacing ? '세로' : '가로'}`);
    rot.type = 'button'; rot.dataset['lineRotate'] = '1';
    rot.addEventListener('click', () => { this.lineFacing = this.lineFacing ? 0 : 1; if (this.lineAt) this.toggleTile(this.lineAt.i, this.lineAt.j); this.renderLineChips(); this.refresh(); });
    this.lineChips.append(rot);
  }

  private apply(): void {
    if (this.mode === 'ppaji') {
      if (!this.rect) return;
      const r = this.game().makePpaji(this.rect);
      if (!r.ok) { this.host.toast(r.reason, false); return; }
      this.host.toast(r.merged?.length ? `빠지 완성 — ${r.merged.map((m) => `‘${m.goneNames.join('·')}’ 를 ‘${m.keptName}’ 에 합쳤습니다`).join(' · ')}` : `빠지 완성 −${(r.cost ?? 0).toLocaleString('ko-KR')}G`, true);
      this.host.onApplied(); this.exit(); return;
    }
    if (this.mode === 'line') {
      if (!this.lineAt) return;
      const r = this.game().placeLine(this.lineLen, this.lineAt.i, this.lineAt.j, this.lineFacing);
      if (!r.ok) { this.host.toast(r.reason, false); return; }
      this.host.toast(`라인 1×${this.lineLen} −${(r.cost ?? 0).toLocaleString('ko-KR')}G`, true);
      this.host.onApplied(); this.exit(); return;
    }
    const tiles = this.selection;
    const r = this.mode === 'ground' ? this.game().paintGround(tiles, this.groundId) : this.mode === 'dig' ? { ok: false as const, reason: '치기 붓은 없습니다 — 빠지 탭으로 물 위에 두르세요' } /* P49-b D59: digPool 프로덕션 호출부 0 — 탭은 P15 부터 숨김(.khide), 하네스가 독을 여는 손잡이로만 남는다 */ : this.mode === 'fill' ? this.game().fillPool(tiles) : this.mode === 'deck' ? this.game().paintDeck(tiles) : this.mode === 'path' ? this.game().paintPath(tiles) : this.mode === 'unpath' ? this.game().unpaintPath(tiles) : this.mode === 'undeck' ? this.game().unpaintDeck(tiles) : this.mode === 'indoor' ? this.game().paintIndoor(tiles) : this.game().unpaintIndoor(tiles);
    if (!r.ok) {
      this.host.toast(r.reason, false);
      return;
    }
    this.host.toast(`${this.mode === 'dig' ? '수역 치기' : this.mode === 'fill' ? '걷기' : this.mode === 'deck' ? '데크' : this.mode === 'undeck' ? '데크 걷기' : this.mode === 'path' ? '길' : this.mode === 'unpath' ? '길 걷기' : this.mode === 'indoor' ? '실내 바닥' : '실내 지우기'} 완료 · ${tiles.length}칸 · −${this.cost().toLocaleString('ko-KR')}G`, true);
    this.host.onApplied();
    this.exit();
  }
}
