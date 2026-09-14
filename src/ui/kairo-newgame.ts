import { MAP_TYPES, unlockedScenarios, type MapType, type ScenarioDef } from '../sim/kairo/scenario.js';
import { el, button } from './dom.js';
import { panelHost } from './panels.js';
import {
  createEventShell,
  renderEventShell,
  type EventShellNodes,
} from './kairo-event-shell.js';

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
  /**
   * **무엇이 지워지는가** — 확인 화면이 숫자로 말한다.
   *
   * "정말 지울까요?" 만으로는 무게가 안 읽힌다. 주차·시설 수·현금을 보여 주면 그 판이
   * 얼마나 자랐는지가 그 자리에서 보인다.
   */
  currentRun?: () => { week: number; facilities: number; cash: number };
}

export class KairoNewGame {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly pickBox: HTMLDivElement;
  private readonly confirmBox: HTMLDivElement;
  private readonly confirmShell: EventShellNodes;
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

    /*
     * 제목은 **`새 게임`** 이다 (UX 감사 P1-8 계열 · IA §7.1). 메뉴 버튼은 `새 게임 시작`
     * 인데 열리는 화면은 `새 판` 이라 낱말이 갈렸다 — 목적지는 이름으로 예고돼야 한다.
     */
    const head = el('div', 'ksheet-head');
    this.titleEl = el('div', 'ksheet-title', '새 게임');
    head.append(this.titleEl);
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

    /*
     * 1단 — 고른다. 괄호의 경고는 **확인 단계로 옮겼다**: 여기서 겁을 주면 고르는 일이
     * 무거워지고, 정작 되돌릴 수 없는 순간에는 브라우저 `confirm` 이 떴다.
     */
    this.startBtn = button('kbtn primary', '이 판으로 시작', () => this.askConfirm());
    this.startBtn.id = 'kairo-newgame-start';

    this.pickBox = el('div', 'kstack');
    this.pickBox.append(
      mapLabel, this.mapBar, scenLabel, this.scenBar, this.detail, this.startBtn,
    );

    /*
     * 2단 — **게임 안의 확인**이다 (IA §6.6).
     *
     * 예전에는 브라우저 네이티브 확인창이었다. 게임 밖 표면이라 크림 팔레트·44px 터치·한국어
     * 문구 계약이 **하나도 안 걸리고**, iOS 홈 화면 PWA 에서는 모양이 또 다르다.
     * 공용 사건 상자를 쓰면 그 넷이 전부 그대로 걸린다.
     */
    this.confirmShell = createEventShell();
    this.confirmBox = el('div', 'kstack');
    this.confirmBox.id = 'kairo-newgame-confirm';
    this.confirmBox.hidden = true;
    this.confirmBox.append(this.confirmShell.root);

    this.root.append(head, this.pickBox, this.confirmBox);
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    // 한 번에 하나 (K37) — 모달이 떠 있으면 열지 않는다
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    this.backToPick();
    this.render();
  }

  /** 확인 상태 → 고르기로. `‹` 는 **선택 화면으로만** 돌아간다 (IA §6.6) */
  private backToPick(): void {
    this.titleEl.textContent = '새 게임';
    this.pickBox.hidden = false;
    this.confirmBox.hidden = true;
  }

  /**
   * 파괴 확인 — **지워지는 것을 숫자로 말한다.**
   *
   * 취소가 주버튼이다: 되돌릴 수 없는 쪽이 기본 손가락 자리에 있으면 안 된다.
   */
  private askConfirm(): void {
    const run = this.deps.currentRun?.();
    const m = MAP_TYPES.find((x) => x.id === this.mapId) as MapType;
    const s = unlockedScenarios(5).find((x) => x.id === this.scenarioId) as ScenarioDef;
    this.titleEl.textContent = '지금 판을 지웁니다';
    this.pickBox.hidden = true;
    this.confirmBox.hidden = false;
    renderEventShell(this.confirmShell, {
      kind: 'new-game-confirm',
      mood: 'alert',
      kicker: `${m.name} · ${s.name}(으)로 시작합니다`,
      title: '지금 판을 지웁니다',
      body: run
        ? `주 ${run.week} · 시설 ${run.facilities}채 · 현금 ${Math.round(run.cash / 10000)}만 — 되돌릴 수 없습니다`
        : '지금 판의 진행이 전부 사라집니다 — 되돌릴 수 없습니다',
      choices: [
        { id: 'cancel', label: '취소', run: () => this.backToPick() },
        {
          id: 'wipe',
          label: '지우고 시작',
          danger: true,
          run: () => this.deps.start(this.mapId, this.scenarioId),
        },
      ],
    });
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
