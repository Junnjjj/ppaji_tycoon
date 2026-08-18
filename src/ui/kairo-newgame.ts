import { MAP_TYPES, unlockedScenarios, type MapType, type ScenarioDef } from '../sim/kairo/scenario.js';
import { el, button } from './dom.js';
import { panelHost } from './panels.js';

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
 *
 * ## 표면은 `style.css` 가 소유한다 (K34)
 *
 * 예전엔 인라인 14곳 · 하드코딩 색 18개였고, 닫기 버튼 문자열이 도감·경영과 **글자
 * 단위로 똑같았다.** 지금은 공용 `.kover` · `.ksheet-head` · `.kbtn` · `.kitem.wide` 를 쓴다.
 * 선택 표시도 `.kbtn.on`/`.kitem.on` 의 노랑으로 합쳤다 — 예전엔 여기만 청록이었다.
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
    this.root = el('div', 'kover');
    this.root.id = 'kairo-newgame';
    this.root.hidden = true;

    const head = el('div', 'ksheet-head');
    head.append(el('div', 'ksheet-title', '새 판'));
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-newgame-close';
    head.append(close);

    const mapLabel = el('div', 'kcaption', '맵 타입 — 지형뿐 아니라 오는 손님이 달라집니다');
    this.mapBar = el('div', 'kchips wrap');

    const scenLabel = el('div', 'kcaption', '시나리오 — 목표가 달라집니다');
    this.scenBar = el('div', 'kstack');
    this.scenBar.style.setProperty('--stack-gap', '4px');

    this.detail = el('div', 'krow kstack');
    this.detail.style.setProperty('--stack-gap', '2px');

    this.startBtn = button('kbtn primary', '이 판으로 시작 (지금 판은 지워집니다)', () => {
      // 되돌릴 수 없는 조작 — 한 번 더 묻는다
      if (!window.confirm('지금 판을 지우고 새로 시작합니다. 계속할까요?')) return;
      this.deps.start(this.mapId, this.scenarioId);
    });
    this.startBtn.id = 'kairo-newgame-start';

    this.root.append(head, mapLabel, this.mapBar, scenLabel, this.scenBar, this.detail, this.startBtn);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    // 한 번에 하나 (K37) — 모달이 떠 있으면 열지 않는다
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }

  private render(): void {
    this.mapBar.replaceChildren();
    for (const m of MAP_TYPES) {
      // 터치 타깃은 `.kbtn` 이 `min-height: var(--tap)` 로 지킨다
      const b = button(`kbtn${this.mapId === m.id ? ' on' : ''}`, m.name, () => {
        this.mapId = m.id;
        this.render();
      });
      b.dataset['map'] = m.id;
      this.mapBar.append(b);
    }

    this.scenBar.replaceChildren();
    const grade = this.deps.grade();
    const open = new Set(unlockedScenarios(grade).map((s) => s.id));
    for (const s of unlockedScenarios(5)) {
      const locked = !open.has(s.id);
      // ★ 56px — `.kitem.wide` 가 지킨다. 도감·카드 선택지와 같은 모양이다
      const b = el(
        'button',
        `kitem wide${this.scenarioId === s.id ? ' on' : ''}`,
      );
      b.dataset['scenario'] = s.id;
      b.disabled = locked;
      b.append(
        el('div', 'kitem-name', locked ? `🔒 ${s.name}` : s.name),
        el('div', 'kitem-sub', locked ? `${s.grade}등급에 열립니다` : s.desc),
      );
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
    for (const t of rows) this.detail.append(el('div', undefined, t));
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
