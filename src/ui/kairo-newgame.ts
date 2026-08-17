import { MAP_TYPES, unlockedScenarios, type MapType, type ScenarioDef } from '../sim/kairo/scenario.js';

/**
 * 새 판 — 맵 타입과 시나리오를 고른다 (§4.5).
 *
 * ## 왜 이 화면이 필요한가
 *
 * 맵 3종 × 시나리오 6종을 만들어 놓고 고를 방법이 없으면 **데이터로만 존재한다.**
 * 2회차를 하는 이유가 이 화면에 있다.
 *
 * ## 고르면 판이 지워진다
 *
 * 새 판은 세이브를 버린다 — 그래서 **한 번 더 묻는다.** 되돌릴 수 없는 조작 앞에서
 * 확인 없이 진행하면, 실수 한 번이 몇 시간을 지운다.
 */

export interface NewGameDeps {
  /** 지금 등급 — 시나리오 해금 판정 */
  grade: () => number;
  /** 고른 뒤: 세이브를 지우고 새 판으로 다시 시작한다 */
  start: (mapId: string, scenarioId: string) => void;
}

export class KairoNewGame {
  private readonly root: HTMLDivElement;
  private readonly mapBar: HTMLDivElement;
  private readonly scenBar: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly startBtn: HTMLButtonElement;
  private mapId = MAP_TYPES[0]!.id;
  private scenarioId = 'inherited';

  constructor(
    parent: HTMLElement,
    private readonly deps: NewGameDeps,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'kairo-newgame';
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:27;display:none;flex-direction:column;gap:10px;' +
      'background:#0d1a23;padding:14px;font:13px/1.45 system-ui,sans-serif;color:#e8f4ff;' +
      'overflow-y:auto';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
    const title = document.createElement('div');
    title.textContent = '새 판';
    title.style.cssText = 'font-size:17px;font-weight:700';
    const close = document.createElement('button');
    close.id = 'kairo-newgame-close';
    close.textContent = '닫기';
    close.style.cssText =
      'min-height:44px;min-width:64px;border-radius:8px;border:none;background:#24445a;color:#eaf6ff';
    close.addEventListener('click', () => this.hide());
    head.append(title, close);

    const mapLabel = document.createElement('div');
    mapLabel.textContent = '맵 타입 — 지형뿐 아니라 오는 손님이 달라집니다';
    mapLabel.style.cssText = 'font-size:12px;color:#9dbdd2';
    this.mapBar = document.createElement('div');
    this.mapBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';

    const scenLabel = document.createElement('div');
    scenLabel.textContent = '시나리오 — 목표가 달라집니다';
    scenLabel.style.cssText = 'font-size:12px;color:#9dbdd2;margin-top:4px';
    this.scenBar = document.createElement('div');
    this.scenBar.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    this.detail = document.createElement('div');
    this.detail.style.cssText =
      'font-size:12px;background:#182b38;border-radius:8px;padding:8px 10px;min-height:56px';

    this.startBtn = document.createElement('button');
    this.startBtn.id = 'kairo-newgame-start';
    this.startBtn.textContent = '이 판으로 시작 (지금 판은 지워집니다)';
    this.startBtn.style.cssText =
      'min-height:56px;border-radius:10px;border:none;background:#2f7fc0;color:#fff;' +
      'font-size:15px;font-weight:600;margin-top:4px';
    this.startBtn.addEventListener('click', () => {
      // 되돌릴 수 없는 조작 — 한 번 더 묻는다
      if (!window.confirm('지금 판을 지우고 새로 시작합니다. 계속할까요?')) return;
      this.deps.start(this.mapId, this.scenarioId);
    });

    this.root.append(head, mapLabel, this.mapBar, scenLabel, this.scenBar, this.detail, this.startBtn);
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  show(): void {
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(): void {
    this.mapBar.replaceChildren();
    for (const m of MAP_TYPES) {
      const b = document.createElement('button');
      b.dataset['map'] = m.id;
      b.textContent = m.name;
      // ★ 44px — 폰 터치 타깃
      b.style.cssText =
        'flex:1;min-width:96px;min-height:52px;border-radius:8px;font-size:13px;' +
        `border:2px solid ${this.mapId === m.id ? '#7ad0ff' : 'transparent'};` +
        'background:#1d3b4e;color:#eaf6ff';
      b.addEventListener('click', () => {
        this.mapId = m.id;
        this.render();
      });
      this.mapBar.append(b);
    }

    this.scenBar.replaceChildren();
    const grade = this.deps.grade();
    const open = new Set(unlockedScenarios(grade).map((s) => s.id));
    for (const s of unlockedScenarios(5)) {
      const locked = !open.has(s.id);
      const b = document.createElement('button');
      b.dataset['scenario'] = s.id;
      b.disabled = locked;
      // ★ 56px — 도감과 같은 규칙
      b.style.cssText =
        'min-height:56px;border-radius:8px;text-align:left;padding:6px 10px;font-size:13px;' +
        `border:2px solid ${this.scenarioId === s.id ? '#7ad0ff' : 'transparent'};` +
        `background:${locked ? '#141f28' : '#1d3b4e'};color:${locked ? '#6b8296' : '#eaf6ff'}`;
      const nm = document.createElement('div');
      nm.textContent = locked ? `🔒 ${s.name}` : s.name;
      nm.style.cssText = 'font-weight:600';
      const de = document.createElement('div');
      de.textContent = locked ? `${s.grade}등급에 열립니다` : s.desc;
      de.style.cssText = 'font-size:11px;color:#9dbdd2';
      b.append(nm, de);
      if (!locked) {
        b.addEventListener('click', () => {
          this.scenarioId = s.id;
          this.render();
        });
      }
      this.scenBar.append(b);
    }

    this.renderDetail();
  }

  private renderDetail(): void {
    const m = MAP_TYPES.find((x) => x.id === this.mapId) as MapType;
    const s = unlockedScenarios(5).find((x) => x.id === this.scenarioId) as ScenarioDef;
    this.detail.replaceChildren();
    const rows = [
      `${m.name} — ${m.desc}`,
      `유리: ${m.strong}`,
      `불리: ${m.weak}`,
      `${s.name} — 시작 자금 ${Math.round(s.startCash / 10000)}만`,
    ];
    for (const t of rows) {
      const d = document.createElement('div');
      d.textContent = t;
      this.detail.append(d);
    }
  }

  /** 도구용 — 화면을 거치지 않고 고른다 */
  selectForTest(mapId: string, scenarioId: string): void {
    this.mapId = mapId;
    this.scenarioId = scenarioId;
    this.render();
  }

  get selection(): { mapId: string; scenarioId: string } {
    return { mapId: this.mapId, scenarioId: this.scenarioId };
  }
}
