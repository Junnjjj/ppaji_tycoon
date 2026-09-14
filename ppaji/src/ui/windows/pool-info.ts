import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { COLOR_KO, SCENT_KO } from '../../sim/lines.js';
import { PPAJI_GRADE_NAMES } from '../../sim/rig.js';
import { iconEl, type IconName } from '../icons.js';
import { confirmDialog } from '../dialog.js';
import { PictureGrid, gaugeEl, type PictureCard } from '../picture-grid.js';
import { pictureEl, pictureId } from '../pictures.js';
import { WRISTBANDS, bandPrice } from '../../sim/wristband.js';

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
  /** P56-a2 — 팔찌 카드 넷 (정보만 · 탭 없음) */
  private readonly bandGrid = new PictureGrid({ name: 'bands', cols: 4, noFooter: true });
  private readonly bandRows = el('div', 'krows');
  private poolId: number | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: PoolInfoHost) {
    this.win = new WindowPanel(parent, 'win-pool', '풀', 'blue');
    this.editBtn = el('button', 'kbtn primary', '소품 넣기 · 편집');
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
      host.toast(r.ok ? '지금 소품 구성을 프리셋으로 저장했습니다' : r.reason, r.ok);
      if (r.ok) { host.onChanged(); this.show(this.poolId); }
    });
    const actions = el('div', 'kdock-row');
    actions.append(this.editBtn, this.saveBtn);
    this.win.body.append(this.rows, actions, this.presetRows, this.bandRows); // P56-a2: 팔찌 카드는 맨 아래 — 행동 버튼(편집·프리셋)을 화면 밖으로 밀지 않는다(G12 실터치)
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
        confirmDialog({ title: `${p.name} 을 복원할까요?`, body: `소품 ${p.items.length}개를 다시 산다 · 물빛이 바뀌면 좋아요가 0`, cost, onYes: () => {
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
    tile('color', '물빛', 'pool', COLOR_KO[st.color] ?? st.color, bars(d.intensityBars), [
      d.colorMix.length ? `섞임: ${d.colorMix.map((m) => `${COLOR_KO[m.color] ?? m.color} ${Math.round(m.share * 100)}%`).join(' · ')}` : '아이템 색이 없다',
      `농도 ${d.intensityBars}/5 — 같은 색만 넣으면 오르고, 다른 색이 섞이면 내려간다 (심사 만점은 5)`,
      d.missingForRainbow.length ? `무지개까지 부족: ${d.missingForRainbow.map((c) => COLOR_KO[c] ?? c).join(' · ')}` : '무지개 조건 충족',
    ]);
    tile('scent', '분위기', 'decor', st.scent ? (SCENT_KO[st.scent] ?? st.scent) : '조용함', bars(st.scent ? Math.min(5, st.scentPower) : 0), [
      st.scent ? `출처: ${d.scentSource === 'item' ? '넣은 아이템' : '풀 옆 시설(1칸 이내)'} · 세기 ${st.scentPower}` : '아이템이나 옆 시설(화분·나무)이 향을 준다',
      '동점이면 소품이 이긴다',
    ]);
    tile('temp', '온도', 'sun', `${Math.round(st.temp)}°C`, tempVerdict, [
      `이 계절의 이상 수온 ${d.idealTemp}°C → 손님 체류 ${Math.round((0.85 + 0.3 * d.tempFit) * 100)}%`,
      '얼음 덩어리(−6) · 온수관(+8) · 모닥불 장작(+4) 로 맞춘다 · 온수 족욕·사우나가 옆에 있으면 오른다',
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
    row('소품', `${p.items.length}개${left !== null ? ` · 남은 ${left}일` : ''}`, 'shop');
    // P50-b2 §3.9 정보창 다섯 줄 — 등급 · 기구 · 연결 · 허가 · 어제 수입(P51 배선 전까지 「—」)
    { const grade = g.ppajiGradeOf(p.id); const lit = g.facilities.all.filter((f) => { const d = g.facilities.defOf(f); return d.class === 'rig' && d.onRing !== true && g.rigState.lit.has(f.uid) && (g.rigState.byPool.get(p.id) ?? []).includes(f.uid); }); const onRing = g.facilities.all.filter((f) => g.facilities.defOf(f).onRing === true && g.poolOfFacility(f.uid) === p.id);
      row('빠지 등급', `${grade} ${PPAJI_GRADE_NAMES[grade] ?? ''} · 인기 ×${g.b.ppajiGradePopMul[grade] ?? 1}`, 'star');
      row('기구', `켜진 기구 ${lit.length} · 링 시설 ${onRing.length} · 종 ${new Set([...lit, ...onRing].map((f) => f.defId)).size}`, 'attraction');
      row('연결', `최장 사슬 ${Math.max(0, ...lit.map((f) => g.rigState.chainLen.get(f.uid) ?? 1))} (정원 × 최대 2.0)`, 'build');
      row('허가', `${p.tiles.length}칸 · 남은 허가 ${Math.max(0, g.permitLeft)}칸`, 'pool');
      row('어제 수입', '— (팔찌·플로팅 바 배선은 P51·P52-a)', 'coin'); }
    // P56-a2 D8 — 팔찌 카드 넷(그림 · 값 · 열린/잠긴) + 빠지 등급 게이지. 값은 `bandPrice(등급)` — 확정 바·정보창과 같은 함수
    { const grade = g.ppajiGradeOf(p.id);
      const gr = el('div', 'krow');
      gr.append(el('span', 'krow-k', '팔찌 · 빠지 등급'), gaugeEl(grade, 4, 'kband-gauge'), el('span', 'krow-v', `${grade}/4`));
      this.bandRows.replaceChildren(gr);
      const cards: PictureCard[] = WRISTBANDS.map((t) => {
        const open = t.grade <= grade;
        const c: PictureCard = { id: t.id, name: t.name, art: pictureEl(pictureId('band', t.id), 'check'), sub: t.rides >= 99 ? '종일 무제한' : t.rides > 0 ? `${t.rides}회` : '조끼만', disabled: !open, data: { band: t.id, open: open ? '1' : '0' } };
        c.price = t.base > 0 ? `${bandPrice(t, grade).toLocaleString('ko-KR')}G` : '0G';
        if (!open) c.badge = 'lock';
        return c;
      });
      this.bandGrid.render(cards);
      this.bandRows.append(this.bandGrid.root); }
    // 이름 변경 (원작 「이름 변경」)
    const nameRow = el('div', 'kname-row');
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 12; input.placeholder = '수역 이름'; input.value = p.name ?? '';
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
