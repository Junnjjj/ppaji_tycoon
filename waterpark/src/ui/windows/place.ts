/**
 * 배치 Dock — 고른 시설을 **탭한 칸**에 고스트로 놓고 `확정`. 못 놓는 칸이면 이유가 첫 줄에 뜬다.
 * 카이로 문법: 지도를 탭해 자리를 옮기고, 회전은 비정사각만 산다.
 */
import { el } from '../dom.js';
import { iconEl } from '../icons.js';
import { setUiSurface } from '../panels.js';
import type { Game } from '../../sim/game.js';
import type { FacilityDef } from '../../data/schema.js';
import type { PlacedFacility } from '../../sim/facility.js';

export interface PlaceHost {
  showGhost(def: FacilityDef | null, i: number, j: number, facing: 0 | 1, ok: boolean, label?: string): void;
  toast(text: string, ok: boolean): void;
  onPlaced(uid: number): void;
}

export class PlaceDock {
  readonly root: HTMLDivElement;
  private readonly modeLabel = el('span', 'kdock-mode', '배치 중');
  private readonly why = el('span', 'kdock-cost', '어디에 설치할까요? (다른 메뉴는 취소 뒤에)');
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
    row1.append(this.modeLabel, this.why);
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
    this.modeLabel.textContent = `배치 중: ${def.name} · ${def.cost.toLocaleString('ko-KR')}G`;
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
    if (!this.at) {
      this.why.textContent = '어디에 설치할까요? (다른 메뉴는 취소 뒤에)';
      this.doneBtn.disabled = true;
      this.host.showGhost(this.def, 0, 0, this.facing, false);
      return;
    }
    const r = this.moveUid !== null ? this.game().canMoveFacility(this.moveUid, this.at.i, this.at.j, this.facing) : this.game().canPlace(this.def.id, this.at.i, this.at.j, this.facing);
    this.why.textContent = r.ok ? (this.moveUid !== null ? '여기로 옮깁니다 (무료)' : '놓을 수 있습니다') : r.reason;
    this.doneBtn.disabled = !r.ok;
    this.host.showGhost(this.def, this.at.i, this.at.j, this.facing, r.ok, this.moveUid !== null ? '이동 · 무료' : undefined);
  }

  private apply(): void {
    if (!this.def || !this.at) return;
    if (this.moveUid !== null) {
      const uid = this.moveUid;
      const r = this.game().moveFacility(uid, this.at.i, this.at.j, this.facing);
      if (!r.ok) { this.host.toast(r.reason, false); this.refresh(); return; }
      this.host.toast(`${this.def.name} 이동 완료`, true);
      this.exit();
      this.host.onPlaced(uid);
      return;
    }
    const r = this.game().placeFacility(this.def.id, this.at.i, this.at.j, this.facing);
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
