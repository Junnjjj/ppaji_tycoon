import { el } from '../dom.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import { PPAJI_GRADE_NAMES } from '../../sim/rig.js';
import { iconEl, type IconName } from '../icons.js';
import { PictureGrid, gaugeEl, type PictureCard } from '../picture-grid.js';
import { pictureEl, pictureId } from '../pictures.js';
import { WRISTBANDS, bandPrice } from '../../sim/wristband.js';
import { rigSetLabel } from '../rig-sets.js';

export interface PoolInfoHost {
  onEdit(poolId: number): void;
  toast(text: string, ok: boolean): void;
  onChanged(): void;
  /** 풀 썸네일 (G47) — 씬이 찍어 준다. 화면 밖이면 null */
  thumb?(pool: { id: number; tiles: number[] }, cb: (c: HTMLCanvasElement | null) => void): void;
}

/** 풀 정보 카드 — 지도에서 풀 탭. 지표 + `편집`. P60-a(D71): 색·향 타일과 저장 구성은 뺐다 — 남는 물성은 계절 수온 한 행 */
export class PoolInfoWindow {
  private readonly win: WindowPanel;
  private readonly rows = el('div', 'krows');
  private readonly editBtn: HTMLButtonElement;
  /** P56-a2 — 팔찌 카드 넷 (정보만 · 탭 없음) */
  private readonly bandGrid = new PictureGrid({ name: 'bands', cols: 4, noFooter: true });
  private readonly bandRows = el('div', 'krows');
  private poolId: number | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: PoolInfoHost) {
    this.win = new WindowPanel(parent, 'win-pool', '풀', 'blue');
    this.editBtn = el('button', 'kbtn primary', '편집');
    this.editBtn.type = 'button';
    this.editBtn.id = 'win-pool-edit';
    this.editBtn.addEventListener('click', () => {
      const id = this.poolId;
      this.win.hide();
      if (id !== null) host.onEdit(id);
    });
    const actions = el('div', 'kdock-row kwrap'); // P57-f
    actions.append(this.editBtn);
    this.win.body.append(this.rows, actions, this.bandRows); // P56-a2: 팔찌 카드는 맨 아래 — 행동 버튼(편집)을 화면 밖으로 밀지 않는다(G12 실터치)
  }

  show(poolId: number): void {
    const g = this.game();
    const p = g.pools.byId(poolId);
    const st = g.poolState(poolId);
    if (!p || !st) return;
    this.poolId = poolId;
    this.win.setTitle(g.poolName(poolId));
    this.rows.replaceChildren();
    // 머리: 썸네일 + 값 알약 3 (원작 풀 정보 창: 그림 · 넓이 · 인기 · 유지비)
    const head = el('div', 'kpool-head');
    const thumb = el('div', 'kpool-thumb');
    thumb.dataset['thumb'] = '1';
    thumb.classList.add('khide'); // W-8: 그림이 오기 전엔 빈 사각형을 그리지 않는다
    this.host.thumb?.(p, (c) => { if (c && this.poolId === poolId) { thumb.replaceChildren(c); thumb.classList.remove('khide'); } });
    const pills = el('div', 'kpool-pills');
    const pill = (k: string, v: string, icon: IconName): void => { const r = el('div', 'krow'); r.append(iconEl(icon), el('span', 'krow-k', k), el('span', 'krow-v knum', v)); pills.append(r); };
    pill('넓이', `${st.size}칸`, 'pool');
    pill('인기', `${st.popularity}`, 'star');
    pill('유지비', `${Math.round(st.maintenance)}G/일`, 'coin');
    head.append(thumb, pills);
    this.rows.append(head);
    const row = (k: string, v: string, icon?: IconName): HTMLElement => {
      const r = el('div', 'krow');
      if (icon) r.append(iconEl(icon));
      r.append(el('span', 'krow-k', k), el('span', icon ? 'krow-v knum' : 'krow-v', v));
      this.rows.append(r);
      return r;
    };
    // P60-a: 수온 행 하나 — 계절 파생(실내 26°C · 족욕·사우나 heat). 판정은 값 옆 보조 글(W-9: 값은 ≤ 10자)
    { const tempFit = st.detail.tempFit; const ideal = st.detail.idealTemp;
      const tempVerdict = tempFit >= 0.8 ? '딱 좋아요' : st.temp < ideal ? '차가워요' : '뜨거워요';
      const tr = row('수온', `${Math.round(st.temp)}°C`, 'sun');
      tr.dataset['temp'] = '1';
      tr.append(el('span', 'krow-sub', tempVerdict)); }
    row('좋아요', `${p.likes}`, 'heart');
    // P50-b2 §3.9 정보창 다섯 줄 — 등급 · 기구 · 연결 · 허가 · 어제 수입(P51 배선 전까지 「—」)
    { const grade = g.ppajiGradeOf(p.id); const lit = g.facilities.all.filter((f) => { const d = g.facilities.defOf(f); return d.class === 'rig' && d.onRing !== true && g.rigState.lit.has(f.uid) && (g.rigState.byPool.get(p.id) ?? []).includes(f.uid); }); const onRing = g.facilities.all.filter((f) => g.facilities.defOf(f).onRing === true && g.poolOfFacility(f.uid) === p.id);
      const hints: string[] = []; // W-9(D68): 값은 숫자, 문장은 힌트 줄
      row('빠지 등급', `${grade}`, 'star'); hints.push(`${PPAJI_GRADE_NAMES[grade] ?? ''} · 인기 ×${g.b.ppajiGradePopMul[grade] ?? 1}`);
      row('기구', `${lit.length}`, 'attraction'); hints.push(`링 시설 ${onRing.length} · 종 ${new Set([...lit, ...onRing].map((f) => f.defId)).size}`);
      row('연결', `${Math.max(0, ...lit.map((f) => g.rigState.chainLen.get(f.uid) ?? 1))}`, 'build'); hints.push('최장 사슬 — 정원 × 최대 2.0');
      row('허가', `${p.tiles.length}/${p.tiles.length + Math.max(0, g.permitLeft)}칸`, 'pool'); hints.push(`남은 허가 ${Math.max(0, g.permitLeft)}칸`);
      { const sets = g.setsOf(p.id); const sr = row('세트', `${sets.length}`, 'star'); sr.dataset['sets'] = String(sets.length); // P60-c D72 B: 성립한 세트 수(값 ≤ 10자) — 이름은 힌트 줄, hidden 미발견은 「?」
        hints.push(sets.length ? `세트 ${sets.map((id) => rigSetLabel(id, g.setsSeen)).join('·')} · 팔찌 +50G/세트` : '세트 0 — 서로 다른 기구 셋을 이어 붙이면 이름이 생긴다'); }
      row('어제 수입', '—', 'coin'); /* P57-f: 수역별 수입은 안 센다(시설별만) — 개발용 문구는 화면에서 뺀다 */
      hints.push(`이 계절 이상 수온 ${st.detail.idealTemp}°C · 체류 ${Math.round((0.85 + 0.3 * st.detail.tempFit) * 100)}%`);
      this.rows.append(el('div', 'krow-sub kfac-hint', hints.join(' · '))); }
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
    this.win.show();
  }

  hide(): void {
    this.win.hide();
  }
}
