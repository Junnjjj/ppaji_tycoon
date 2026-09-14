import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { COLOR_KO, SCENT_KO } from '../../sim/lines.js';
import { iconEl, type IconName } from '../icons.js';
import { confirmDialog } from '../dialog.js';

export interface PoolInfoHost {
  onEdit(poolId: number): void;
  toast(text: string, ok: boolean): void;
  onChanged(): void;
  /** 풀 썸네일 (G47) — 씬이 찍어 준다. 화면 밖이면 null */
  thumb?(pool: { id: number; tiles: number[] }, cb: (c: HTMLCanvasElement | null) => void): void;
}

/** 풀 정보 카드 — 지도에서 풀 탭. 지표 + `편집` + 프리셋 저장/복원 (G12) */
export class PoolInfoWindow {
  private readonly win: WindowPanel;
  private readonly rows = el('div', 'krows');
  private readonly editBtn: HTMLButtonElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly presetRows = el('div', 'krows');
  private poolId: number | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: PoolInfoHost) {
    this.win = new WindowPanel(parent, 'win-pool', '풀', 'blue');
    this.editBtn = el('button', 'kbtn primary', '아이템 추가 · 편집');
    this.editBtn.type = 'button';
    this.editBtn.id = 'win-pool-edit';
    this.editBtn.addEventListener('click', () => {
      const id = this.poolId;
      this.win.hide();
      if (id !== null) host.onEdit(id);
    });
    this.saveBtn = el('button', 'kbtn', '프리셋 저장');
    this.saveBtn.type = 'button';
    this.saveBtn.id = 'win-pool-preset-save';
    this.saveBtn.addEventListener('click', () => {
      if (this.poolId === null) return;
      const r = this.game().savePreset(this.poolId);
      host.toast(r.ok ? '지금 아이템 구성을 프리셋으로 저장했습니다' : r.reason, r.ok);
      if (r.ok) { host.onChanged(); this.show(this.poolId); }
    });
    const actions = el('div', 'kdock-row');
    actions.append(this.editBtn, this.saveBtn);
    this.win.body.append(this.rows, actions, this.presetRows);
  }

  private renderPresets(): void {
    const g = this.game();
    this.presetRows.replaceChildren();
    this.presetRows.classList.toggle('khide', g.presets.length === 0);
    g.presets.forEach((p, idx) => {
      const cost = g.presetCost(idx);
      const b = el('button', 'kchip', `${p.name} 복원 · ${p.items.length}개 · ${cost.toLocaleString('ko-KR')}G`);
      b.type = 'button';
      b.dataset['preset'] = String(idx);
      b.disabled = cost > g.money;
      b.addEventListener('click', () => {
        if (this.poolId === null) return;
        const pid = this.poolId;
        confirmDialog({ title: `${p.name} 을 복원할까요?`, body: `아이템 ${p.items.length}개를 다시 산다 · 색이 바뀌면 좋아요가 0`, cost, onYes: () => {
          const r = g.applyPreset(pid, idx);
          this.host.toast(r.ok ? `${p.name} 복원 완료 · −${cost.toLocaleString('ko-KR')}G` : r.reason, r.ok);
          this.host.onChanged();
          this.show(pid);
        } });
      });
      this.presetRows.append(b);
    });
  }

  show(poolId: number): void {
    const g = this.game();
    const p = g.pools.byId(poolId);
    const st = g.poolState(poolId);
    if (!p || !st) return;
    this.poolId = poolId;
    this.win.setTitle(g.poolName(poolId));
    this.rows.replaceChildren();
    const d = st.detail;
    // 머리: 썸네일 + 값 알약 3 (원작 풀 정보 창: 그림 · 넓이 · 인기 · 유지비)
    const head = el('div', 'kpool-head');
    const thumb = el('div', 'kpool-thumb');
    thumb.dataset['thumb'] = '1';
    this.host.thumb?.(p, (c) => { if (c && this.poolId === poolId) thumb.replaceChildren(c); });
    const pills = el('div', 'kpool-pills');
    const pill = (k: string, v: string, icon: IconName): void => { const r = el('div', 'krow'); r.append(iconEl(icon), el('span', 'krow-k', k), el('span', 'krow-v knum', v)); pills.append(r); };
    pill('넓이', `${st.size}칸`, 'pool');
    pill('인기', `${st.popularity}`, 'star');
    pill('유지비', `${Math.round(st.maintenance)}G/일`, 'coin');
    head.append(thumb, pills);
    this.rows.append(head);
    // 색 · 향 · 온도 타일 (원작: 아이콘 · 값 · 농도 막대 5 · 판정) — 탭하면 상세 (G42 의 data-detail 계약 유지)
    const tiles = el('div', 'kptiles');
    const bars = (n: number): HTMLElement => { const b = el('span', 'kbars'); for (let k = 0; k < 5; k++) { const x = el('span'); x.dataset['on'] = k < n ? '1' : '0'; b.append(x); } return b; };
    const bodies: Record<string, HTMLElement> = {};
    const tile = (key: 'color' | 'scent' | 'temp', k: string, icon: IconName, v: string, sub: HTMLElement | string, detail: string[]): void => {
      const b = el('button', 'kptile');
      b.type = 'button';
      b.dataset['detail'] = key;
      b.append(iconEl(icon), el('span', 'kptile-k', k), el('span', 'kptile-v', v));
      if (typeof sub === 'string') b.append(el('span', 'kptile-sub', sub)); else b.append(sub);
      const box = el('div', 'krows kdetail-body khide');
      box.dataset['detailBody'] = key;
      for (const line of detail) box.append(el('div', 'krow-sub', line));
      bodies[key] = box;
      b.addEventListener('click', () => { const open = box.classList.toggle('khide'); b.classList.toggle('on', !open); });
      tiles.append(b);
    };
    const tempVerdict = d.tempFit >= 0.8 ? '딱 좋아요' : st.temp < d.idealTemp ? '차가워요' : '뜨거워요';
    tile('color', '색', 'pool', COLOR_KO[st.color] ?? st.color, bars(d.intensityBars), [
      d.colorMix.length ? `섞임: ${d.colorMix.map((m) => `${COLOR_KO[m.color] ?? m.color} ${Math.round(m.share * 100)}%`).join(' · ')}` : '아이템 색이 없다',
      `농도 ${d.intensityBars}/5 — 같은 색만 넣으면 오르고, 다른 색이 섞이면 내려간다 (심사 만점은 5)`,
      d.missingForRainbow.length ? `무지개까지 부족: ${d.missingForRainbow.map((c) => COLOR_KO[c] ?? c).join(' · ')}` : '무지개 조건 충족',
    ]);
    tile('scent', '향', 'decor', st.scent ? (SCENT_KO[st.scent] ?? st.scent) : '무향', bars(st.scent ? Math.min(5, st.scentPower) : 0), [
      st.scent ? `출처: ${d.scentSource === 'item' ? '넣은 아이템' : '풀 옆 시설(1칸 이내)'} · 세기 ${st.scentPower}` : '아이템이나 옆 시설(화분·나무)이 향을 준다',
      '동점이면 아이템 향이 이긴다',
    ]);
    tile('temp', '온도', 'sun', `${Math.round(st.temp)}°C`, tempVerdict, [
      `이 계절의 이상 수온 ${d.idealTemp}°C → 손님 체류 ${Math.round((0.85 + 0.3 * d.tempFit) * 100)}%`,
      '얼음(−6) · 입욕제(+8) · 꿀(+4) 로 맞춘다 · 핫텁·사우나가 옆에 있으면 오른다',
    ]);
    this.rows.append(tiles, bodies['color'] as HTMLElement, bodies['scent'] as HTMLElement, bodies['temp'] as HTMLElement);
    const row = (k: string, v: string, icon?: IconName): void => {
      const r = el('div', 'krow');
      if (icon) r.append(iconEl(icon));
      r.append(el('span', 'krow-k', k), el('span', icon ? 'krow-v knum' : 'krow-v', v));
      this.rows.append(r);
    };
    row('좋아요', `${p.likes}`, 'heart');
    const left = g.itemDaysLeft(p.id);
    row('아이템', `${p.items.length}개${left !== null ? ` · 남은 ${left}일` : ''}`, 'shop');
    // 타일 갈기 (G37) — 해금한 타일 중 인기 높은 순으로 칩. 지금 타일은 표시만
    // G57: 섞인 풀은 「섞임」 이고 표준 칩도 남긴다 (표준으로 되돌릴 길이 없었다)
    const uniform = [...new Set(p.tiles.map((k) => g.grid.poolTile[k] ?? 0))].length === 1;
    const cur = uniform ? g.tileDef(g.tileDefs[g.grid.poolTile[p.tiles[0] ?? 0] ?? 0]?.id ?? 'standard') : null;
    const tileRow = el('div', 'krow kpool-tiles'); // G56: 라벨이 세로로 쪼개지지 않게 (94칸 풀 실측)
    tileRow.append(el('span', 'krow-k', `타일 · ${cur?.name ?? '섞임'}`));
    const chips = el('div', 'kchips');
    for (const t of [...g.unlocked.tiles].map((id) => g.tileDef(id)).filter((t): t is NonNullable<typeof t> => !!t).sort((a, b) => b.pop - a.pop)) {
      if (cur && t.id === cur.id) continue;
      const cost = g.retileCost(p.id, t.id);
      const b = el('button', 'kchip', `${t.name} 인기 ${t.pop} · ${cost.toLocaleString('ko-KR')}G`);
      b.type = 'button';
      b.dataset['retile'] = t.id;
      b.disabled = cost > g.money;
      b.addEventListener('click', () => confirmDialog({ title: `${t.name} 타일로 갈까요?`, body: `${g.poolName(p.id)} ${p.tiles.length}칸 전부 · 인기 ${t.pop}`, cost, onYes: () => { const r = g.retilePool(p.id, t.id); this.host.toast(r.ok ? `${t.name} 타일로 갈았다 · −${cost.toLocaleString('ko-KR')}G` : r.reason, r.ok); if (r.ok) { this.host.onChanged(); this.show(p.id); } } }));
      chips.append(b);
    }
    tileRow.append(chips);
    this.rows.append(tileRow);
    // 이름 변경 (원작 「이름 변경」)
    const nameRow = el('div', 'kname-row');
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 12; input.placeholder = '풀 이름'; input.value = p.name ?? '';
    input.dataset['poolName'] = '1';
    const nameBtn = el('button', 'kbtn', '이름 변경');
    nameBtn.type = 'button';
    nameBtn.dataset['rename'] = '1';
    nameBtn.addEventListener('click', () => { const r = g.renamePool(p.id, input.value); this.host.toast(r.ok ? `이름: ${g.poolName(p.id)}` : r.reason, r.ok); if (r.ok) { this.host.onChanged(); this.show(p.id); } });
    nameRow.append(input, nameBtn);
    this.rows.append(nameRow);
    this.renderPresets();
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }
}
