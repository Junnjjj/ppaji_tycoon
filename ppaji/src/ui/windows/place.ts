/**
 * 배치 Dock — 고른 시설을 **탭한 칸**에 고스트로 놓고 `확정`. 못 놓는 칸이면 이유가 첫 줄에 뜬다.
 * 카이로 문법: 지도를 탭해 자리를 옮기고, 회전은 비정사각만 산다.
 */
import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { setUiSurface } from '../panels.js';
import { rigSetLabel } from '../rig-sets.js';
import type { Game } from '../../sim/game.js';
import type { FacilityDef } from '../../data/schema.js';
import type { PlacedFacility } from '../../sim/facility.js';

export interface PlaceHost {
  showGhost(def: FacilityDef | null, i: number, j: number, facing: 0 | 1, ok: boolean, label?: string): void;
  /** P24 반경 링 — 빈 배열이면 지운다 */
  showRing(tiles: readonly { i: number; j: number }[]): void;
  toast(text: string, ok: boolean): void;
  onPlaced(uid: number): void;
  /** P56-a D7 — 조준 칸 위 값 팝 「800G ×1」(원작). 같은 자리에 갈아 끼운다 */
  pricePop?(i: number, j: number, text: string | null): void;
  /** P60-c D72 B — 이 자리에 놓으면 성립하는 세트(`aimPreview.setNext`) — main 이 그 세트의 켜진 멤버 칸을 찾아 `scene.showSetStar` 를 부른다. null = 지운다 */
  setStar?(hit: { poolId: number; setId: string } | null): void;
  /** P60-d D72 A — 조준 중 `aimPreview.pathNext > 0` 이면 고스트 손님 주행: main 이 수역의 입수구 칸 → 기존 경로 기구 칸 → 고스트 칸을 이어 `scene.showPathWalk` 를 부른다. null = 지운다 */
  pathWalk?(hit: { poolId: number; at: { i: number; j: number } } | null): void;
  /** P60-d D72 A — 기구를 조준하는 동안 그 수역 링의 입수구 칸 표식(`scene.showEntryMarks`). null = 지운다 */
  entryMarks?(poolId: number | null): void;
}

export class PlaceDock {
  readonly root: HTMLDivElement;
  private readonly modeLabel = el('span', 'kdock-mode', '배치 중');
  private readonly why = el('span', 'kdock-cost', ''); // W-15: 거절 이유만 — 비면 안 그린다
  /** P52-b 위험 칩 — 기구·선착장을 조준할 때만 · 4단 색은 토큰(`--risk-*`) */
  private readonly riskChip = el('span', 'kchip krisk-0 khide', '안전');
  private readonly rotateBtn: HTMLButtonElement;
  private readonly doneBtn: HTMLButtonElement;
  private def: FacilityDef | null = null;
  private at: { i: number; j: number } | null = null;
  private facing: 0 | 1 = 0;
  /** 이동 중인 시설 uid (G52) — null 이면 새 설치 */
  private moveUid: number | null = null;

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: PlaceHost) {
    this.root = el('div', 'kdock');
    this.root.id = 'dock-place';
    this.root.hidden = true;
    const row1 = el('div', 'kdock-row');
    row1.append(this.modeLabel, this.why, this.riskChip);
    this.riskChip.id = 'dock-place-risk';
    const row2 = el('div', 'kdock-row');
    const cancel = el('button', 'kbtn', '취소');
    cancel.type = 'button';
    cancel.id = 'dock-place-cancel';
    cancel.addEventListener('click', () => this.exit());
    this.rotateBtn = el('button', 'kbtn', '회전');
    this.rotateBtn.type = 'button';
    this.rotateBtn.id = 'dock-place-rotate';
    this.rotateBtn.addEventListener('click', () => { this.facing = this.facing === 0 ? 1 : 0; this.refresh(); });
    this.doneBtn = el('button', 'kbtn primary', '');
    this.doneBtn.append(iconEl('check'), el('span', undefined, ' 결정'));
    this.doneBtn.type = 'button';
    this.doneBtn.id = 'dock-place-done';
    this.doneBtn.addEventListener('click', () => this.apply());
    row2.append(cancel, this.rotateBtn, this.doneBtn);
    this.root.append(row1, row2);
    parent.append(this.root);
  }

  get isActive(): boolean {
    return this.def !== null;
  }

  get current(): { def: FacilityDef; at: { i: number; j: number } | null; facing: 0 | 1 } | null {
    return this.def ? { def: this.def, at: this.at, facing: this.facing } : null;
  }

  enter(def: FacilityDef, at?: { i: number; j: number }): void {
    this.def = def;
    this.facing = 0;
    this.at = at ?? null;
    this.root.hidden = false;
    this.modeLabel.textContent = `${def.name} · ${def.cost.toLocaleString('ko-KR')}G`; // W-15: 한 줄(원작 「Select location」)
    this.rotateBtn.hidden = def.w === def.d;
    setUiSurface('build');
    this.refresh();
  }

  /** 시설 이동 (G52, 원작 이동 도구) — 지금 자리에서 시작해 지도를 탭해 옮기고 「결정」 */
  enterMove(f: PlacedFacility): void {
    const def = this.game().facilities.defOf(f);
    this.def = def;
    this.moveUid = f.uid;
    this.facing = f.facing;
    this.at = { i: f.i, j: f.j };
    this.root.hidden = false;
    this.modeLabel.textContent = `이동 중: ${def.name}`;
    this.rotateBtn.hidden = def.w === def.d;
    setUiSurface('build');
    this.refresh();
  }

  get movingUid(): number | null {
    return this.moveUid;
  }

  exit(): void {
    this.host.showRing([]); // P24 원복 — 취소·확정·붓 교체·패널 열림 전부 exit 를 지난다
    this.host.setStar?.(null); // P60-c 별도 같이 진다
    this.host.pathWalk?.(null); this.host.entryMarks?.(null); // P60-d 주행·입수구 표식도
    if (!this.def) return;
    this.def = null;
    this.moveUid = null;
    this.at = null;
    this.root.hidden = true;
    this.host.showGhost(null, 0, 0, 0, false);
    setUiSurface('home');
  }

  aimAt(i: number, j: number): void {
    if (!this.def) return;
    this.at = { i, j };
    this.refresh();
  }

  private refresh(): void {
    if (!this.def) return;
    this.riskChip.classList.add('khide');
    this.host.setStar?.(null); // P60-c: 기본은 없음 — 기구 가지에서 세트가 잡히면 다시 켠다
    this.host.pathWalk?.(null); this.host.entryMarks?.(null); // P60-d: 같은 규칙 — 기구 가지에서 다시 켠다
    if (!this.at) {
      this.why.textContent = '';
      this.doneBtn.disabled = true;
      this.host.showGhost(this.def, 0, 0, this.facing, false);
      return;
    }
    const r = this.moveUid !== null ? this.game().canMoveFacility(this.moveUid, this.at.i, this.at.j, this.facing, { frontage: true }) : this.game().canPlace(this.def.id, this.at.i, this.at.j, this.facing, { frontage: true }); // P31 D39 접면
    this.why.textContent = r.ok ? (this.moveUid !== null ? '여기로 옮깁니다 (무료)' : '놓을 수 있습니다') : r.reason;
    this.doneBtn.disabled = !r.ok;
    // P24 D30: 자리면 반경 링 + 「등급 n」, 먹거리·샤워면 「자리 n곳」 — 놓기 전에 보인다
    const g = this.game();
    let label: string | undefined = this.moveUid !== null ? '이동 · 무료' : undefined;
    if (this.def.class === 'lounging') { const sg = g.seatGradeAt(this.def, this.at.i, this.at.j, this.facing, this.moveUid ?? 0); label = `${label ? `${label} · ` : ''}등급 ${sg.grade}${[sg.water ? '물' : null, sg.shade ? '그늘' : null, sg.view ? '뷰' : null, sg.garden ? '조경' : null, sg.food ? '먹거리' : null].filter(Boolean).map((x) => ` · ${x}`).join('')}${sg.dirty ? ' · 화장실−' : ''}${sg.loud ? ' · 소음−' : ''}${(() => { const pk = g.seatPackagesAt(this.def, this.at.i, this.at.j, this.facing, this.moveUid ?? 0); return pk.length ? ` · ${pk.map((p) => p.name.replace(' 패키지', '')).join('·')}` : ''; })()}`; this.host.showRing(g.seatRadiusTiles(this.def, this.at.i, this.at.j, this.facing)); }
    else if (this.def.class === 'rig' || this.def.onRing === true) { // P50-b2 확정 바 칩 — 이번 확정으로 실제로 바뀌는 값을 앞에(등급이 바뀌면 그것이 첫 칸) · 거절이면 칩 없음
      const pv = r.ok ? g.aimPreview(this.def.id, this.at.i, this.at.j, this.facing) : null;
      if (pv) {
        const chips: string[] = [];
        if (pv.gradeNext !== pv.gradeNow) chips.push(`등급 ${pv.gradeNow} → ${pv.gradeNext}`);
        if (this.def.class === 'rig' && this.def.onRing !== true) { chips.push(pv.lit ? `정원 ${this.def.capacity} → ${pv.capNext}` : '꺼짐 — 링·켜진 기구에 닿게'); chips.push(`연결 ${pv.chainNext}`); }
        chips.push(pv.pkgNext !== pv.pkgNow ? `자유이용권 ${pv.pkgNow} → ${pv.pkgNext}G` : `자유이용권 ${pv.pkgNext}G`);
        if (pv.setNext) chips.push(`+${rigSetLabel(pv.setNext, g.setsSeen)}`); // P60-c D72 B: 이 자리에 놓으면 성립하는 세트 — 칩 1칸, 값이 있을 때만 · hidden 미발견은 「+?」
        if (pv.setNext && pv.poolId !== null) this.host.setStar?.({ poolId: pv.poolId, setId: pv.setNext });
        if (pv.poolId !== null) { // P60-d D72 A — 경로 칩은 값이 바뀔 때만 · 완성이 되는 배치면 「코스 완성」 하나(S4: 체크 문자 금지 — 글자로)(칩 ≤ 1칸 추가) · 입수구 표식은 기구를 조준하는 동안 · 주행은 경로가 생길 때만
          this.host.entryMarks?.(pv.poolId);
          if (this.def.class === 'rig' && this.def.onRing !== true && pv.lit) {
            const pathNow = g.pathOf(pv.poolId).length; // `pathNext` 는 놓으면 경로에서 몇 번째인가(0 = 경로 밖) — 경로에 들면 길이가 pathNow → pathNow+1 로 바뀐다(그 순번은 「연결 n」 칩이 말한다)
            if (pv.completeNext && !g.pathCompleteOf(pv.poolId)) chips.push('코스 완성'); else if (pv.pathNext > 0) chips.push(`경로 ${pathNow} → ${pathNow + 1}`);
            if (pv.pathNext > 0) this.host.pathWalk?.({ poolId: pv.poolId, at: { i: this.at.i, j: this.at.j } });
          }
        }
        if ((this.def.thrill ?? 0) > 0) { this.riskChip.textContent = `위험 ${pv.riskLabel}`; this.riskChip.className = `kchip krisk-${pv.risk}`; this.riskChip.dataset['risk'] = String(pv.risk); } // P52-b: 위험 모양(스릴 > 0)에만
        label = `${label ? `${label} · ` : ''}${chips.join(' · ')}`;
      }
      this.host.showRing([]);
    }
    else if (this.def.menuSlots > 0 || this.def.id === 'shower_row') { const n = g.seatsFedAt(this.def, this.at.i, this.at.j, this.facing, this.moveUid ?? 0); label = `${label ? `${label} · ` : ''}자리 ${n}곳`; this.host.showRing(g.seatRadiusTiles(this.def, this.at.i, this.at.j, this.facing)); }
    else this.host.showRing([]);
    this.host.showGhost(this.def, this.at.i, this.at.j, this.facing, r.ok, label);
    this.host.pricePop?.(this.at.i, this.at.j, r.ok ? (this.moveUid !== null ? '이동 · 무료' : `${this.def.cost.toLocaleString('ko-KR')}G ×1`) : null);
  }

  private apply(): void {
    if (!this.def || !this.at) return;
    if (this.moveUid !== null) {
      const uid = this.moveUid;
      const r = this.game().moveFacility(uid, this.at.i, this.at.j, this.facing, { autoPath: false, frontage: true }); // P16: 플레이어 독은 길을 안 깐다 · P31 접면
      if (!r.ok) { this.host.toast(r.reason, false); this.refresh(); return; }
      this.host.toast(`${this.def.name} 이동 완료`, true);
      this.exit();
      this.host.onPlaced(uid);
      return;
    }
    const r = this.game().placeFacility(this.def.id, this.at.i, this.at.j, this.facing, { autoPath: false, frontage: true }); // P16: 길은 플레이어가 낸다 · P31 D39: 길에 붙어야 놓인다
    if (!r.ok) {
      this.host.toast(r.reason, false);
      this.refresh();
      return;
    }
    this.host.toast(`${this.def.name} 설치 · −${this.def.cost.toLocaleString('ko-KR')}G`, true);
    const uid = r.uid ?? 0;
    this.exit();
    this.host.onPlaced(uid);
  }
}
