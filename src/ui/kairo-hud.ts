/**
 * 카이로 HUD — **상단 캡슐 둘 + 하단 바 하나**, 나머지는 전부 시트 안 (K28).
 *
 * ## 왜 갈아엎었나 (실측)
 *
 * 폰 세로에서 재보니 **화면의 40% 가 UI** 였고 **상시 컨트롤이 15개**였다
 * (바닥 붓 6 + 시설 드롭다운 + 우측 버튼 5 + 주 진행 + …). 레퍼런스(Pool Slide Story)
 * 스크린샷을 같은 방법으로 재면 **약 14%, 버튼 2개**다. 가운데는 100% 게임이고 UI 는
 * 위에 떠 있는 캡슐 둘과 아래 한 줄뿐이다.
 *
 * 그리고 시설 73종을 `<select>` 드롭다운으로 고르고 있었다. 카이로에는 드롭다운이
 * 없다 — **아이콘 격자**다. "직관적이지 않다"의 대부분이 이 둘이었다.
 *
 * ## 스타일은 `style.css` 가 소유한다
 *
 * ⚠ 인라인 스타일을 쓰지 않는다. `style.css` 에 이미 토큰(`--panel`/`--accent`/
 * `--tap`/`--safe-b`)과 컴포넌트가 있었는데 **폐기된 v1 씬만 쓰고 있었고**, 카이로 씬은
 * `main.ts` 안에서 전부 인라인으로 다시 만들었다. 그래서 카이로 쪽만 투박했다.
 * 여기서 또 인라인으로 쓰면 체계가 셋이 된다.
 *
 * ## 방향 두 개를 한 레이아웃으로
 *
 * 세로(393×852)와 가로(852×393)를 같은 DOM·같은 CSS 로 낸다. 미디어 쿼리로 레이아웃을
 * 두 벌 만들면 검증도 두 배가 되고, 어긋나는 쪽은 언제나 안 본 쪽이다.
 */

export type BuildKind = 'ground' | 'facility' | 'erase';

/**
 * 시트 탭 (K31). `kind` 와 따로 두는 이유: **건물 바닥은 지형(`ground`)이지만 탭은
 * `building`** 이다. 확장이 카이로의 핵심 동사라 자기 탭을 줘야 보인다 — 바닥 탭에
 * 섞여 있을 때는 "이게 건물을 넓히는 것"임을 아무도 몰랐다 (직접 플레이하다 막혔다).
 */
export type BuildTab = 'facility' | 'building' | 'ground' | 'course';

export interface BuildItem {
  kind: BuildKind;
  tab: BuildTab;
  id: string;
  name: string;
  /** 둘째 줄 — 값·크기 같은 것 */
  sub?: string;
  /** 아직 못 짓는다 (등급 부족). 이유를 대신 보여준다 */
  locked?: string;
  /** 시설 탭 안에서 묶는 이름 (실내/야외/…) */
  group?: string;
}

export type RiskTone = 'safe' | 'watch' | 'caution' | 'danger';

export interface HudOptions {
  onPick: (item: BuildItem) => void;
  onWeek: () => void;
  /**
   * 코스 탭 — 견인기구 루트는 **짓는 것**이지 관리 메뉴가 아니다 (K32).
   * 메뉴 시트 안에 있을 때는 버튼이 안 보여서 "코스 기능이 없다"로 읽혔다.
   */
  onCourse: () => void;
}

/** `<div class="x">텍스트</div>` 한 줄짜리 헬퍼 — 이 파일에서만 쓴다 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export class KairoHud {
  /** 메뉴 시트 안 — 호출자가 도감·감상·코스·경영·새 판 버튼을 여기에 넣는다 */
  readonly menuSlot: HTMLDivElement;
  /** 의뢰 목록 — 예전엔 우상단을 상시로 덮었다 */
  readonly quests: HTMLDivElement;
  readonly weekBtn: HTMLButtonElement;

  private readonly statusCap: HTMLDivElement;
  private readonly cashCap: HTMLDivElement;
  private readonly goalBox: HTMLDivElement;
  private readonly riskBox: HTMLDivElement;
  private readonly brushBox: HTMLDivElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly buildBtn: HTMLButtonElement;
  private readonly sheet: HTMLDivElement;
  private readonly sheetTitle: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly buildBody: HTMLDivElement;
  private readonly menuBody: HTMLDivElement;

  private readonly confirmBar: HTMLDivElement;
  private readonly confirmLabel: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  private onConfirm: (() => void) | null = null;
  private onCancel: (() => void) | null = null;

  private readonly opts: HudOptions;
  private items: BuildItem[] = [];
  private tab: BuildTab = 'facility';
  private open: '' | 'build' | 'menu' = '';

  constructor(parent: HTMLElement, opts: HudOptions) {
    this.opts = opts;

    // ── 상단 캡슐 ────────────────────────────────────────────────────────
    this.statusCap = el('div', 'kcap left');
    this.statusCap.id = 'kairo-status';
    this.cashCap = el('div', 'kcap right');
    this.cashCap.id = 'kairo-cash';
    this.goalBox = el('div', 'kgoal');
    this.goalBox.id = 'kairo-goal';
    parent.append(this.statusCap, this.cashCap, this.goalBox);

    // ── 하단 바 ──────────────────────────────────────────────────────────
    const bar = el('div', 'kbar');
    bar.id = 'kairo-bar';

    this.menuBtn = el('button', 'kbtn', '메뉴');
    this.menuBtn.id = 'kairo-menu-open';
    this.menuBtn.addEventListener('click', () => this.toggle('menu'));

    this.buildBtn = el('button', 'kbtn', '건설');
    this.buildBtn.id = 'kairo-build-open';
    this.buildBtn.addEventListener('click', () => this.toggle('build'));

    /*
     * 가운데 — **위험도와 지금 든 붓**. 위험도는 상시 표시가 규칙이라(사고가 RNG 로
     * 느껴지면 안 된다) 시트 안에 넣을 수 없다. 붓은 안 보이면 "탭했는데 왜 안 놓이지"가 된다.
     */
    const mid = el('div', 'kmid');
    this.riskBox = el('div', 'krisk safe', '위험도 —');
    this.riskBox.id = 'kairo-risk';
    this.brushBox = el('div', 'kbrush');
    this.brushBox.id = 'kairo-brushlabel';
    mid.append(this.riskBox, this.brushBox);

    this.weekBtn = el('button', 'kbtn primary', '한 주 ▶');
    this.weekBtn.id = 'kairo-week';
    this.weekBtn.addEventListener('click', () => this.opts.onWeek());

    bar.append(this.menuBtn, this.buildBtn, mid, this.weekBtn);
    parent.append(bar);

    // ── 시트 (건설·메뉴 공용) ────────────────────────────────────────────
    this.sheet = el('div', 'ksheet');
    this.sheet.id = 'kairo-sheet';
    this.sheet.hidden = true;

    const head = el('div', 'ksheet-head');
    this.sheetTitle = el('div', 'ksheet-title');
    this.tabs = el('div', 'tab-bar');
    const close = el('button', 'kbtn', '닫기');
    close.id = 'kairo-sheet-close';
    close.addEventListener('click', () => this.hide());
    head.append(this.sheetTitle, this.tabs, close);

    const body = el('div', 'ksheet-body');
    this.buildBody = el('div', 'ksheet-build');
    this.menuBody = el('div', 'ksheet-menu');
    this.menuSlot = el('div', 'kgrid');
    this.quests = el('div', 'kquests');
    this.quests.id = 'kairo-quests';
    /*
     * 메뉴에서 패널을 열면 시트를 닫는다.
     *
     * 안 닫으면 패널을 닫은 뒤에도 시트가 화면 아래 절반을 덮은 채 남아 **지도 탭을
     * 먹는다** — 검증에서 탭 5칸 중 2칸이 반응 없음으로 잡혔다. UX 로도 버그다.
     */
    this.menuSlot.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.hide();
    });
    this.menuBody.append(this.menuSlot, this.quests);
    body.append(this.buildBody, this.menuBody);

    this.sheet.append(head, body);
    parent.append(this.sheet);

    /*
     * ── 확정 바 (K32) ──
     *
     * 시설은 탭하면 바로 안 놓인다. 고스트를 보고 확정한다 — 회전과 "장비 탄 손님"이
     * 나중에 들어오므로 **놓기 전에 만질 수 있는 상태**가 필요하다.
     */
    this.confirmBar = el('div', 'kconfirm');
    this.confirmBar.id = 'kairo-confirm';
    this.confirmBar.hidden = true;
    this.confirmLabel = el('div', 'place-label');
    const btns = el('div', 'place-buttons');
    const cancel = el('button', 'place-btn cancel', '취소');
    cancel.id = 'kairo-place-cancel';
    cancel.addEventListener('click', () => {
      const cb = this.onCancel;
      this.hideConfirm();
      cb?.();
    });
    // 회전 — 방향 스프라이트가 생기면 켠다. 자리를 지금 잡아 둬야 나중에 배치가 안 흔들린다
    this.rotateBtn = el('button', 'place-btn rotate', '↻');
    this.rotateBtn.id = 'kairo-place-rotate';
    this.rotateBtn.disabled = true;
    this.rotateBtn.title = '회전 — 방향 스프라이트가 생기면 켜집니다';
    this.confirmBtn = el('button', 'place-btn confirm', '확정');
    this.confirmBtn.id = 'kairo-place-confirm';
    this.confirmBtn.addEventListener('click', () => {
      const cb = this.onConfirm;
      this.hideConfirm();
      cb?.();
    });
    btns.append(cancel, this.rotateBtn, this.confirmBtn);
    this.confirmBar.append(this.confirmLabel, btns);
    parent.append(this.confirmBar);

    this.setBrush(null);
  }

  /**
   * 배치 확정 바를 띄운다. `ok` 가 false 면 확정을 막고 라벨을 경고색으로 —
   * 왜 안 되는지(`label`)를 같이 보여준다.
   */
  showConfirm(label: string, ok: boolean, on: { confirm: () => void; cancel: () => void }): void {
    this.confirmLabel.className = ok ? 'place-label' : 'place-label bad';
    this.confirmLabel.textContent = label;
    this.confirmBtn.disabled = !ok;
    this.onConfirm = on.confirm;
    this.onCancel = on.cancel;
    this.confirmBar.hidden = false;
  }

  hideConfirm(): void {
    this.confirmBar.hidden = true;
    this.onConfirm = null;
    this.onCancel = null;
  }

  get confirming(): boolean {
    return !this.confirmBar.hidden;
  }

  setStatus(text: string): void {
    this.statusCap.textContent = text;
  }

  setCash(won: number): void {
    this.cashCap.textContent = `◎ ${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
  }

  setRisk(tone: RiskTone, text: string): void {
    this.riskBox.className = `krisk ${tone}`;
    this.riskBox.textContent = text;
  }

  setGoal(text: string, tone: 'normal' | 'won' | 'lost' = 'normal'): void {
    this.goalBox.className = tone === 'normal' ? 'kgoal' : `kgoal ${tone}`;
    this.goalBox.textContent = text;
  }

  /** 지금 든 붓. null 이면 아무것도 안 들었다 */
  setBrush(label: string | null): void {
    this.brushBox.className = label ? 'kbrush on' : 'kbrush';
    this.brushBox.textContent = label ? `▸ ${label}` : '건설을 눌러 고르세요';
  }

  /** 등급이 오르면 잠금이 풀리므로 다시 만든다 */
  setBuildItems(items: BuildItem[]): void {
    this.items = items;
    if (this.open === 'build') this.renderBuild();
  }

  hide(): void {
    this.open = '';
    this.sheet.hidden = true;
    this.menuBtn.classList.remove('on');
    this.buildBtn.classList.remove('on');
  }

  get visible(): boolean {
    return this.open !== '';
  }

  private toggle(which: 'build' | 'menu'): void {
    if (this.open === which) {
      this.hide();
      return;
    }
    this.open = which;
    this.sheet.hidden = false;
    this.buildBody.hidden = which !== 'build';
    this.menuBody.hidden = which !== 'menu';
    this.tabs.hidden = which !== 'build';
    this.sheetTitle.textContent = which === 'build' ? '건설' : '메뉴';
    this.menuBtn.classList.toggle('on', which === 'menu');
    this.buildBtn.classList.toggle('on', which === 'build');
    if (which === 'build') this.renderBuild();
  }

  private renderBuild(): void {
    this.tabs.replaceChildren();
    for (const [key, name] of [
      ['facility', '시설'],
      ['building', '건물'],
      ['ground', '바닥'],
      ['course', '코스'],
    ] as const) {
      const b = el('button', `tab-btn${this.tab === key ? ' on' : ''}`, name);
      b.dataset['tab'] = key;
      b.addEventListener('click', () => {
        if (key === 'course') {
          // 코스는 목록이 아니라 전용 편집 화면이다 — 시트를 닫고 넘긴다
          this.hide();
          this.opts.onCourse();
          return;
        }
        this.tab = key;
        this.renderBuild();
      });
      this.tabs.append(b);
    }

    this.buildBody.replaceChildren();
    const mine = this.items.filter((x) => x.tab === this.tab);
    const groups = new Map<string, BuildItem[]>();
    for (const it of mine) {
      const g = it.group ?? '';
      if (!groups.has(g)) groups.set(g, []);
      (groups.get(g) as BuildItem[]).push(it);
    }
    for (const [g, list] of groups) {
      if (g) this.buildBody.append(el('div', 'ksheet-group', g));
      const grid = el('div', 'kgrid');
      for (const it of list) grid.append(this.itemButton(it));
      this.buildBody.append(grid);
    }
  }

  private itemButton(it: BuildItem): HTMLButtonElement {
    const b = el('button', 'kitem');
    b.dataset['pick'] = `${it.kind}:${it.id}`;
    b.disabled = it.locked !== undefined;
    b.append(el('span', 'kitem-name', it.name));
    const sub = it.locked ?? it.sub;
    if (sub !== undefined) b.append(el('span', 'kitem-sub', sub));
    b.addEventListener('click', () => {
      if (it.locked !== undefined) return;
      this.opts.onPick(it);
      this.setBrush(it.kind === 'erase' ? '철거' : it.name);
      this.hide();
    });
    return b;
  }
}
