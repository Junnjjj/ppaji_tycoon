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
 * ## 읽는 것은 위, 누르는 것은 아래 (K47-②)
 *
 * 폰 상단은 엄지 사각지대다. 그래서 헤더 두 줄은 **읽기 전용**(버튼 0개)이고 하단 바에는
 * **상시 컨트롤 2개**(메뉴·건설)만 남는다. 걷어낸 것들의 행선지:
 *   · `하루 »`/주 스킵 — **없앴다.** 시간은 흐르는 낮으로 이미 자동이고(하루 24초),
 *     스킵을 누르고 싶은 순간은 "할 게 없다"는 신호라 스킵으로 가릴 게 아니다 (계획 §2)
 *   · 위험도 — 헤더 2줄째로. 상시 표시는 규칙이지 컨트롤이 아니다
 *   · 붓 라벨 — 티커로 (K47-①)
 *   · 리포트 버튼 — 알림함의 "결산 도착" 행을 탭하면 열린다
 *   · 목표 ▾ 버튼 — 칩 기둥 자신의 머리 행으로
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

import { el } from './dom.js';
import { panelHost, type Panel } from './panels.js';

export type BuildKind = 'ground' | 'facility' | 'erase' | 'door' | 'move';

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
  /** 아직 못 짓는다 (자리 없음 등). 이유를 대신 보여준다 */
  locked?: string;
  /** 다음에 올 것 예고 (K40) — 누를 수 없고, 언제 열리는지만 말한다 */
  teaser?: string;
  /** 카드 썸네일용 계약 ID — 게임과 같은 그림을 쓴다 */
  sprite?: string;
  /** 시설 탭 안에서 묶는 이름 (실내/야외/…) */
  group?: string;
}

/** 의뢰 칩 하나 (K40) — 아이콘은 임시 글리프다 (ui/* 에셋 슬롯, 계획 §1-1) */
export interface GoalChip {
  icon: string;
  label: string;
  detail?: string;
  /** 0..1 */
  progress: number;
  tone?: 'won' | 'lost';
}

export type RiskTone = 'safe' | 'watch' | 'caution' | 'danger';

export interface HudOptions {
  onPick: (item: BuildItem) => void;
  /** 카드 썸네일 공급 — 에셋 제공자의 캔버스를 그대로 (없으면 글리프) */
  thumbFor?: (spriteId: string) => HTMLCanvasElement | null;
  /**
   * 코스 탭 — 견인기구 루트는 **짓는 것**이지 관리 메뉴가 아니다 (K32).
   * 메뉴 시트 안에 있을 때는 버튼이 안 보여서 "코스 기능이 없다"로 읽혔다.
   */
  onCourse: () => void;
  /**
   * 붓 라벨이 바뀔 때 (K47-①). **정본은 티커**로 옮겼다 — 하단 바는 누르는 곳이고
   * 읽는 것은 위(헤더)와 티커다. 시트에서 카드를 고르는 순간은 hud 안에서 일어나므로
   * (`itemCard`) 바깥이 알 방법이 이 콜백뿐이다.
   */
  onBrush?: (label: string | null) => void;
}

export class KairoHud {
  /** 메뉴 시트 안 — 호출자가 도감·감상·코스·경영·새 판 버튼을 여기에 넣는다 */
  readonly menuSlot: HTMLDivElement;
  /** 의뢰 목록 — 예전엔 우상단을 상시로 덮었다 */
  readonly quests: HTMLDivElement;

  private readonly statusCap: HTMLDivElement;
  private readonly cashCap: HTMLDivElement;
  private readonly weatherChip: HTMLDivElement;
  private readonly satCap: HTMLDivElement;
  private readonly visCap: HTMLDivElement;
  private readonly gradeCap: HTMLDivElement;
  private readonly goalBox: HTMLDivElement;
  private readonly chipsBox: HTMLDivElement;
  /** 칩 기둥의 머리 행 — 버튼이 아니라 div 다 (아래 생성부의 ⚠ 참고) */
  private readonly foldHead: HTMLDivElement;
  private folded = false;
  private chipsSig = '';
  private readonly riskBox: HTMLDivElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly buildBtn: HTMLButtonElement;
  private readonly sheet: HTMLDivElement;
  /** 시트의 패널 얼굴 — `panelHost` 가 이걸 안다 */
  readonly sheetPanel: Panel;
  private readonly sheetTitle: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly buildBody: HTMLDivElement;
  private readonly menuBody: HTMLDivElement;
  private readonly context: HTMLDivElement;

  private readonly confirmBar: HTMLDivElement;
  private readonly confirmLabel: HTMLDivElement;
  private readonly confirmBtn: HTMLButtonElement;
  private readonly rotateBtn: HTMLButtonElement;
  private onConfirm: (() => void) | null = null;
  private onCancel: (() => void) | null = null;
  private onRotate: (() => void) | null = null;

  private readonly opts: HudOptions;
  private items: BuildItem[] = [];
  private tab: BuildTab = 'facility';
  private open: '' | 'build' | 'menu' = '';

  constructor(parent: HTMLElement, opts: HudOptions) {
    this.opts = opts;

    /*
     * ── 상단 2단 헤더 (K46, 레퍼런스 구조) ──────────────────────────────
     * 1줄: 날씨 칩 + 날짜·시각 + 현금. 2줄: 지표 셋(만족·방문·등급) + **위험도**.
     * 아이콘은 임시 글리프 — ui/* 에셋 슬롯이 채워지면 교체된다 (계약의 uiIcons).
     *
     * ⚠ 헤더에는 **버튼이 하나도 없다** (K47-②). 여기 버튼을 다시 넣으면 엄지가 못 닿는
     * 곳에 컨트롤이 생기고, 상시 컨트롤 2개 불변식도 같이 깨진다.
     */
    const top = el('div', 'ktop');
    top.id = 'kairo-top';
    // 줄 하나 = 면 하나, 그리고 두 줄이 **한 패널**이다 (레퍼런스 실측 — 헤더는
    // 떠 있는 줄 둘이 아니라 구분선으로 나뉜 한 덩어리로 읽힌다)
    const row1 = el('div', 'khdr-row');
    this.weatherChip = el('div', 'kwx');
    this.weatherChip.id = 'kairo-weather';
    this.weatherChip.textContent = '☀';
    this.statusCap = el('div', 'grow');
    this.statusCap.id = 'kairo-status';
    this.cashCap = el('div', 'kcash');
    this.cashCap.id = 'kairo-cash';
    row1.append(this.weatherChip, this.statusCap, this.cashCap);

    const row2 = el('div', 'khdr-row');
    row2.id = 'kairo-stats';
    const stat = (icon: string, id: string): HTMLDivElement => {
      const box = el('div', 'kstat-mini');
      box.id = id;
      box.append(el('span', 'kico-s', icon), el('span', 'kstat-v', '—'));
      return box;
    };
    this.satCap = stat('😊', 'kairo-sat');
    this.visCap = stat('👥', 'kairo-visitors');
    this.gradeCap = stat('⭐', 'kairo-grade');
    /*
     * 위험도 — 하단 바에서 올라왔다 (K47-②). **상시 표시가 규칙**이라(사고가 RNG 로
     * 느껴지면 안 된다) 시트에 넣을 수 없고, 누르는 것이 아니므로 헤더가 제자리다.
     * ⚠ `id="kairo-risk"` 는 하네스가 "위험도 상시 표시"를 재는 손잡이다 — 바꾸지 말 것.
     */
    this.riskBox = el('div', 'krisk safe', '위험도 —');
    this.riskBox.id = 'kairo-risk';
    row2.append(this.satCap, this.visCap, this.gradeCap, this.riskBox);
    top.append(row1, row2);
    parent.append(top);
    /*
     * 의뢰 칩 (K40, concept-28) — 목표란의 후신. "다음에 뭘 할지"가 화면에 상시로
     * 보인다: 진행 중 의뢰 둘 + 다음 등급 게이지(A4). 시나리오 이름은 메뉴로 갔다 —
     * 판 설정은 목표가 아니다 (UX 검수 §1).
     * 표시물이지 컨트롤이 아니다 — 탭하면 메뉴가 열리지만 그건 메뉴 버튼의 지름길일
     * 뿐이라 div 로 둔다 (상시 컨트롤 2개 불변식은 버튼을 센다).
     */
    this.goalBox = el('div', 'kchipcol');
    this.goalBox.id = 'kairo-goal';
    this.goalBox.addEventListener('click', () => this.toggle('menu'));
    /*
     * 접기 머리 (K47-②) — 헤더의 `목표 ▾` 버튼을 여기로 내렸다. 접는 대상 위에 붙어
     * 있는 편이 "무엇이 접히는지"가 자명하다.
     *
     * ⚠ 함정 셋 — 셋 다 실제로 밟았다:
     *   1. `.kchipcol` 이 `pointer-events: none` 이다 (좌상단이 팬 사각지대가 되지 않게).
     *      머리에 `auto` 를 안 주면 탭이 통째로 지도로 빠진다 → CSS 의 `.kchip-head`.
     *   2. 기둥 **전체**가 클릭 시 메뉴를 연다. `stopPropagation()` 이 없으면 접으면서
     *      메뉴가 같이 열린다.
     *   3. `<button>` 으로 만들면 하네스의 "상시 컨트롤 2개" 셈(`button,select,input`)에
     *      걸린다 — 티커 띠·칩 기둥과 같은 선례라 `role="button"` 인 div 다.
     */
    this.foldHead = el('div', 'kchip-head', '목표 ▾');
    this.foldHead.id = 'kairo-goal-fold';
    this.foldHead.setAttribute('role', 'button');
    this.foldHead.tabIndex = 0;
    const fold = (e: Event): void => {
      e.stopPropagation();
      this.setFolded(!this.folded);
    };
    this.foldHead.addEventListener('click', fold);
    this.foldHead.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); // Space 로 화면이 스크롤되면 지도가 밀린다
      fold(e);
    });
    this.chipsBox = el('div', 'kchiplist');
    this.goalBox.append(this.foldHead, this.chipsBox);
    parent.append(this.goalBox);
    /*
     * 기둥의 top 은 헤더 **실측**에서 받는다 — 고정 96px 로 뒀더니 2단 헤더가
     * 커지자 지표 줄과 겹쳤다 (사용자 실측). 가려진 높이는 재서 쓴다 (K33 규칙).
     */
    const place = (): void => {
      this.goalBox.style.top = `${Math.round(top.getBoundingClientRect().bottom + 6)}px`;
    };
    new ResizeObserver(place).observe(top);
    window.addEventListener('resize', place);
    place();

    /*
     * ── 하단 바 (K47-②) ──────────────────────────────────────────────────
     * **버튼 둘뿐이다.** 위험도는 헤더로, 붓 라벨은 티커로 갔고 `하루 »` 는 없앴다.
     * 여기에 뭔가를 더 놓고 싶어지면 시트 안이 제자리인지 먼저 볼 것.
     */
    const bar = el('div', 'kbar');
    bar.id = 'kairo-bar';

    this.menuBtn = el('button', 'kbtn', '메뉴');
    this.menuBtn.id = 'kairo-menu-open';
    this.menuBtn.addEventListener('click', () => this.toggle('menu'));

    this.buildBtn = el('button', 'kbtn', '건설');
    this.buildBtn.id = 'kairo-build-open';
    this.buildBtn.addEventListener('click', () => this.toggle('build'));

    // 좌우로 벌린다 — 사이의 빈 칸이 지도를 가리지 않는 유일한 채움이다
    bar.append(this.menuBtn, this.buildBtn);
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
    this.context = el('div', 'kcontext');
    this.context.id = 'kairo-context';
    this.menuBody.append(this.context, this.menuSlot, this.quests);
    body.append(this.buildBody, this.menuBody);

    this.sheet.append(head, body);
    parent.append(this.sheet);

    /*
     * 시트를 **패널로 등록한다** (K37). 호스트는 `hide()` 만 본다.
     *
     * `KairoHud` 자체를 `Panel` 로 만들지 않은 이유: HUD 는 시트만이 아니라 상단 캡슐과
     * 하단 바까지 소유한다. HUD 를 패널로 읽히게 두면 "패널을 닫았다"가 "바를
     * 지웠다"로 오해된다.
     */
    this.sheetPanel = { hide: () => this.hide() };
    panelHost.register(this.sheetPanel);

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
    cancel.addEventListener('click', () => this.cancelConfirm());
    // 회전 — 방향 스프라이트가 생기면 켠다. 자리를 지금 잡아 둬야 나중에 배치가 안 흔들린다
    this.rotateBtn = el('button', 'place-btn rotate', '↻');
    this.rotateBtn.id = 'kairo-place-rotate';
    this.rotateBtn.disabled = true;
    this.rotateBtn.title = '회전 (비정사각 시설)';
    this.rotateBtn.addEventListener('click', () => this.onRotate?.());
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
  showConfirm(
    label: string,
    ok: boolean,
    on: { confirm: () => void; cancel: () => void; rotate?: () => void },
  ): void {
    this.confirmLabel.className = ok ? 'place-label' : 'place-label bad';
    this.confirmLabel.textContent = label;
    this.confirmBtn.disabled = !ok;
    this.onConfirm = on.confirm;
    this.onCancel = on.cancel;
    // 회전 (K45) — 비정사각 시설만 켠다. 예약해 뒀던 그 자리다
    this.onRotate = on.rotate ?? null;
    this.rotateBtn.disabled = on.rotate === undefined;
    this.confirmBar.hidden = false;
  }

  hideConfirm(): void {
    this.confirmBar.hidden = true;
    this.onConfirm = null;
    this.onCancel = null;
    this.onRotate = null;
  }

  /**
   * 확정 바를 **취소로** 닫는다 (K47-③) — 취소 버튼과 "시트를 열었다"가 같은 길을 쓴다.
   *
   * ⚠ 확정 바는 `PanelHost` 패널이 **아니다.** 스크림 없는 바라 배타 규칙이 시트·결산과
   * 부딪힌다 (등록하면 시트를 열 때마다 서로를 닫는 싸움이 된다). 대신 시트가 열릴 때
   * 여기를 부른다 — 안 부르면 시트를 다시 열어도 확정 바가 남아, 옛 조준이 화면에 뜬 채
   * 새 붓을 고르게 된다.
   */
  cancelConfirm(): void {
    if (this.confirmBar.hidden) return;
    const cb = this.onCancel;
    this.hideConfirm();
    cb?.();
  }

  get confirming(): boolean {
    return !this.confirmBar.hidden;
  }

  /**
   * 확정 바가 가리는 화면 아래 높이 (CSS px). 조준 레티클을 그만큼 위로 올린다 —
   * 안 올리면 조준점이 바 밑에 숨어 "고스트가 안 보인다"가 된다 (K33 규칙:
   * 가려진 높이는 상수로 박지 말고 **재서** 쓴다. 바가 두 줄이 되면 상수는 어긋난다).
   *
   * 숨은 상태에서도 답해야 하므로(첫 조준은 바가 뜨기 전에 자리를 정한다) 잠깐
   * 펼쳐서 잰다 — 같은 프레임 안이라 화면에는 안 나타난다.
   */
  get confirmInset(): number {
    const wasHidden = this.confirmBar.hidden;
    if (wasHidden) this.confirmBar.hidden = false;
    const top = this.confirmBar.getBoundingClientRect().top;
    if (wasHidden) this.confirmBar.hidden = true;
    return Math.max(0, Math.round(window.innerHeight - top));
  }

  /**
   * 헤더 2줄 (K46) — 날씨·지표. 1.5초 폴링이 부르므로 **값만** 갈아 끼운다
   * (엘리먼트를 다시 만들면 그 주기로 깜빡인다 — `setChips` 가 서명으로 거르는 이유와 같다).
   *
   * K47-②: `reportNew` 배지는 없앴다. 지난 결산은 **알림함의 "결산 도착" 행**에서 연다 —
   * 배지가 가리키던 것이 어차피 그 사건 하나였고, 헤더에 버튼을 두지 않기로 했다.
   */
  setHeader(h: { weather: string; sat: string; visitors: string; grade: string }): void {
    this.weatherChip.textContent = h.weather;
    (this.satCap.querySelector('.kstat-v') as HTMLElement).textContent = h.sat;
    (this.visCap.querySelector('.kstat-v') as HTMLElement).textContent = h.visitors;
    (this.gradeCap.querySelector('.kstat-v') as HTMLElement).textContent = h.grade;
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

  /** 의뢰 칩 갱신 — 탭하면 메뉴(의뢰 목록)가 열린다 */
  setChips(chips: GoalChip[]): void {
    // 1.5초 폴링이 매번 DOM 을 갈아치우면 깜빡인다 — 내용이 같으면 건너뛴다
    const sig = JSON.stringify(chips);
    if (sig === this.chipsSig) return;
    this.chipsSig = sig;
    this.foldHead.textContent = this.folded ? `목표 ▸ ${chips.length}` : '목표 ▾';
    this.chipsBox.replaceChildren();
    for (const c of chips) {
      const chip = el('div', `kchip${c.tone !== undefined ? ` ${c.tone}` : ''}`);
      chip.append(el('span', 'kchip-ico', c.icon));
      const txt = el('div', 'kchip-txt');
      txt.append(el('div', 'kchip-label', c.label));
      if (c.detail !== undefined) txt.append(el('div', 'kchip-detail', c.detail));
      const bar = el('div', 'kprog');
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, c.progress)) * 100)}%`;
      bar.append(fill);
      txt.append(bar);
      chip.append(txt);
      this.chipsBox.append(chip);
    }
  }

  /** 목표 기둥 접기 — 상태만 바꾼다. 라벨은 다음 setChips 가 아니라 지금 갱신한다 */
  private setFolded(folded: boolean): void {
    this.folded = folded;
    this.goalBox.classList.toggle('folded', folded);
    const n = this.chipsBox.childElementCount;
    this.foldHead.textContent = folded ? `목표 ▸ ${n}` : '목표 ▾';
  }

  /** 메뉴 상단의 판 설정 줄 — 맵·시나리오 이름 (목표란에서 옮겨 왔다, K40) */
  setContext(text: string): void {
    this.context.textContent = text;
  }

  /**
   * 지금 든 붓. null 이면 아무것도 안 들었다.
   *
   * K47-①에서 표시의 **정본이 티커**로 갔고, K47-②에서 바의 `.kbrush` 요소를 걷어냈다.
   * 여기서는 콜백만 흘린다 — 두 곳에 같은 글이 뜨면 어느 쪽이 진짜인지 알 수 없다.
   */
  setBrush(label: string | null): void {
    this.opts.onBrush?.(label);
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
    panelHost.closed(this.sheetPanel);
  }

  get visible(): boolean {
    return this.open !== '';
  }

  private toggle(which: 'build' | 'menu'): void {
    if (this.open === which) {
      this.hide();
      return;
    }
    // 한 번에 하나 (K37) — 도감·경영 같은 패널이 열려 있으면 그쪽이 닫힌다
    if (!panelHost.open(this.sheetPanel)) return;
    // 시트를 열면 진행 중이던 조준은 취소한다 (K47-③ — 확정 바는 패널이 아니다)
    this.cancelConfirm();
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

    /*
     * 유형 칩 (K40, concept-29 의 서브탭) — 시설 탭에만. 존이 하나뿐이면 안 낸다.
     * 티저는 필터와 무관하게 항상 끝에 남는다 — "다음"은 어느 존에서도 보여야 한다.
     */
    let list = mine;
    const zones = [...new Set(mine.map((x) => x.group).filter((g): g is string => g !== undefined))];
    if (this.tab === 'facility' && zones.length > 1) {
      const chips = el('div', 'kchips');
      const chip = (label: string, val: string | null): void => {
        const c = el('button', `kbtn${this.zone === val ? ' on' : ''}`, label);
        c.addEventListener('click', () => {
          this.zone = val;
          this.renderBuild();
        });
        chips.append(c);
      };
      chip('전체', null);
      for (const z of zones) chip(z, z);
      this.buildBody.append(chips);
      if (this.zone !== null) {
        list = mine.filter((x) => x.group === this.zone || x.teaser !== undefined);
      }
    }

    /*
     * 카드 캐러셀 (K40, concept-29 지정) — 가로 스크롤 + 좌우 페이지 버튼.
     * 스와이프와 버튼이 같은 일을 한다 — 폰은 쓸고, 검증과 데스크톱은 누른다.
     */
    const wrap = el('div', 'kcar-wrap');
    const car = el('div', 'kcarousel');
    for (const it of list) car.append(this.itemCard(it));
    const page = (dir: number): void => {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      car.scrollBy({ left: dir * car.clientWidth * 0.8, behavior: still ? 'auto' : 'smooth' });
    };
    const prev = el('button', 'kbtn kcar-nav', '◀');
    prev.addEventListener('click', () => page(-1));
    const next = el('button', 'kbtn kcar-nav', '▶');
    next.addEventListener('click', () => page(1));
    wrap.append(prev, car, next);
    this.buildBody.append(wrap);
  }

  /** 시설 탭 유형 칩의 현재 필터 (null = 전체) */
  private zone: string | null = null;

  private itemCard(it: BuildItem): HTMLButtonElement {
    const b = el('button', 'kcard');
    b.dataset['pick'] = `${it.kind}:${it.id}`;
    const blocked = it.locked !== undefined || it.teaser !== undefined;
    b.disabled = blocked;
    if (it.teaser !== undefined) b.classList.add('teaser');

    // 썸네일 — 게임과 같은 계약 그림. 그림 계약이 없는 것(바닥 붓·철거·문)은 글리프
    const thumb = el('div', 'kcard-thumb');
    const src = it.sprite !== undefined ? (this.opts.thumbFor?.(it.sprite) ?? null) : null;
    if (src) {
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src, 0, 0);
      thumb.append(c);
    } else {
      thumb.textContent = GLYPH[it.kind] ?? '■';
    }
    b.append(thumb);

    b.append(el('span', 'kcard-name', it.name));
    const sub = it.teaser ?? it.locked ?? it.sub;
    if (sub !== undefined) b.append(el('span', 'kcard-sub', sub));
    b.addEventListener('click', () => {
      if (blocked) return;
      this.opts.onPick(it);
      this.setBrush(it.kind === 'erase' ? '철거' : it.name);
      this.hide();
    });
    return b;
  }
}

/** 그림 계약이 없는 붓들의 글리프 — ui/* 에셋 슬롯이 채워지면 교체된다 (계획 §1-1) */
const GLYPH: Partial<Record<BuildKind, string>> = {
  ground: '▤',
  erase: '✕',
  door: '⇄',
  move: '✥',
};
