/**
 * 뉴스 티커 + 알림함 (K47-①) — **사건의 전용 채널.**
 *
 * 카이로 시그니처인 하단 뉴스 띠다. 완공·해금·콤보 발견·심사 D-day 같은 **순간
 * 발생하는 사건**을 모달로 막으면 PSS 부정 리뷰 1위(팝업 과다)가 되고, 토스트로만
 * 흘리면 놓친다 — 티커가 흘리고 알림함이 쌓는다 (헤르메스 리서치 §3.3 처방 그대로:
 * "모달 대신 알림함 적재 · 강제 중단은 큰 사건만").
 *
 * 역할 구분 (겹치면 채널이 무의미해진다):
 *   · 모달 — 큰 사건만 (해금·승급·인물·숨은 콤보. K41 규칙 그대로)
 *   · 토스트 — 방금 한 행동의 즉각 피드백 (거절 이유·확정 −N만)
 *   · **티커 — 내가 하지 않았는데 일어난 일** (뉴스)
 *
 * 붓을 들면 티커가 붓 라벨로 바뀐다 — 하단 바의 안내문·붓 표시를 흡수해 바에는
 * 버튼만 남긴다 (K47 HUD 재설계: 읽는 것은 위·티커, 누르는 것은 아래).
 *
 * 알림함 항목은 **저장하지 않는다** — 세션 메모리뿐이다. 뉴스는 상태가 아니라
 * 흐름이고, 세이브에 넣는 순간 마이그레이션 짐이 된다.
 *
 * ## 채널 계약 (K47-①) — 어기면 채널이 무의미해진다
 *
 * | 채널 | 무엇 | 시간 |
 * |---|---|---|
 * | 모달 (`KairoUnlockView`) | **축하** — 시설 해금 · 등급 승급/탈락 · 새 도구 · 인물 등장 · 숨은 콤보 발견 · 소원/의뢰 보상 시설 | 멈춘다 |
 * | **티커 (여기)** | **뉴스** — 내가 안 했는데 일어난 일 (하루 마감 · 주말 · 강등 · 콤보 발동 · 의뢰 달성 · 심사 D-day · 누적 마일스톤 · 결산 도착 · 소원 개시/성사) | 안 멈춘다 |
 * | 토스트 (`main.ts` 의 `toast`) | **내 행동의 대답** — 거절 이유 · 확정 −N만 | 안 멈춘다 |
 *
 * ⚠ 한 사건을 두 채널에 넣지 말 것. 숨은 콤보 **첫 발견**은 모달이 담당하므로
 * 티커의 콤보 발동 목록에서 빠진다 (`main.ts` 의 `pushComboNews`).
 *
 * ⚠ 알림함(시트)을 열면 시간이 멈춘다 — `panelHost.anyOpen` 이 흐름을 세우기 때문이고,
 * 이는 "시트 = 정지" 규칙과 일관된 **의도된 동작**이다. 티커 띠 자체는 비차단이다.
 */
import { el } from './dom.js';
import { panelHost, type Panel } from './panels.js';

export interface TickerItem {
  /** 임시 이모지 글리프 — ui/* 에셋 슬롯이 채워지면 교체 (계약 uiIcons 와 같은 운명) */
  icon: string;
  text: string;
  /** 알림함에 찍는 시점 라벨 — "3주 화" 처럼 main 이 만들어 준다 */
  stamp: string;
  /**
   * 알림함 행을 탭하면 그 사건으로 간다 (K47-②) — 지금은 "결산 도착" → 결산 다시 열기.
   *
   * 헤더의 리포트 버튼을 대신한다. 배지가 가리키던 것이 결국 이 사건 하나였고, 뉴스가
   * 이미 "몇 주차 결산이 왔다"를 들고 있으므로 **소식 자체를 손잡이로** 쓰는 편이 맞다.
   * 없는 항목은 그냥 읽는 줄이다 — 전부에 링크를 달면 어디가 눌리는지 안 읽힌다.
   */
  onOpen?: () => void;
}

const INBOX_MAX = 50;

/**
 * 뉴스가 없을 때 띠가 말하는 것 — **자기 상태와 자기 입구**다.
 *
 * ⚠ 예전 문구는 `다음: <행동> — 목표 A를 탭하세요` 였다. 두 가지가 틀렸다 (UX 감사 P0-7):
 *
 * 1. **`목표 A` 라는 것이 화면에 없다.** UI v3 가 홈의 A/B/C 세 칸을 `다음 할 일` 한 줄로
 *    바꿨고 `A` 라는 이름표는 어디에도 안 그려진다. 첫 프레임의 상시 띠가 **존재하지 않는
 *    UI 요소**를 가리키고 있었다.
 * 2. **바로 위 줄의 복창이다.** 목표 밴드가 이미 같은 문장을 굵게 말하는데 띠가 26px
 *    전폭을 써서 한 번 더 말했다 — 채널 계약("티커 = 내가 안 했는데 일어난 일")과도
 *    어긋난다. 이건 뉴스가 아니라 내 목표의 사본이었다.
 *
 * 뉴스가 없을 때만 현재 즉시 목표를 **다음 행동**으로 짧게 안내한다. `목표 A` 같은
 * 내부 이름은 쓰지 않는다.
 */
export function tickerFallbackText(nextAction: string): string {
  return `다음 행동 · ${nextAction}`;
}

export class KairoTicker implements Panel {
  private readonly strip: HTMLDivElement;
  private readonly line: HTMLSpanElement;
  private readonly icon: HTMLSpanElement;
  /**
   * 알림함 시트의 루트.
   *
   * ⚠ 이름이 **`root` 여야 한다.** `tools/check-ui-surface.mjs` 의 패널 등록 검사가
   * `this.root.hidden = …` 리터럴로 "자기 루트를 여닫는 파일"을 고른다 — `inboxRoot`
   * 같은 다른 이름이면 검사를 조용히 우회해서, 등록을 잊어도 초록불이 된다.
   */
  private readonly root: HTMLDivElement;
  private readonly inboxList: HTMLDivElement;
  private readonly items: TickerItem[] = [];
  private brushLabel: string | null = null;
  private fallback = tickerFallbackText('리조트를 살펴보세요');
  /** 새 뉴스 강조 — 붓 라벨이 덮고 있어도 뉴스가 오면 잠깐 이긴다 */
  private newsHold = 0;
  private holdTimer = 0;

  constructor(parent: HTMLElement) {
    /*
     * 보이는 띠는 26px를 보존하되, 가운데 별도 hit surface가 44×44px를 맡는다. 외곽을
     * 44px로 키우면 HUD가 더 칠해진 것처럼 계측되고, 전폭 hit surface는 목표/하단 버튼을
     * 훔치므로 시각 면과 중앙 손가락 면을 분리한다.
     */
    this.strip = el('div', 'kticker');
    this.strip.id = 'kairo-ticker';
    const visual = el('div', 'kticker-visual');
    this.line = el('span', 'kticker-line');
    /*
     * 아이콘은 **하나**다 (알려진 항목 15번 · UX 감사 P2-29). 고정 `📰` 와 항목 아이콘이
     * 겹쳐 둘로 보였다 — 이제 항목이 있으면 그 아이콘이, 없으면 `📰` 가 그 자리에 온다.
     */
    this.icon = el('span', 'kticker-ico', '📰');
    visual.append(this.icon, this.line);
    const hit = el('div', 'kticker-hit');
    hit.setAttribute('role', 'button');
    hit.tabIndex = 0;
    hit.setAttribute('aria-label', '소식');
    this.strip.append(visual, hit);
    const activate = (): void => {
      if (this.visible) this.hide();
      else if (panelHost.open(this)) this.root.hidden = false;
    };
    hit.addEventListener('click', activate);
    // role="button" 을 붙였으면 Enter/Space 도 클릭과 같아야 한다 (네이티브 버튼의 계약)
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); // Space 로 화면이 스크롤되면 지도가 밀린다
      activate();
    });
    parent.append(this.strip);

    // 알림함 — 시트 표면 (표면 셋 규칙: 새 표면을 만들지 않는다)
    this.root = el('div', 'ksheet');
    this.root.id = 'kairo-inbox';
    this.root.hidden = true;
    const head = el('div', 'ksheet-head');
    head.append(el('div', 'ksheet-title', '소식'));
    const close = el('button', 'kbtn', '닫기');
    close.id = 'kairo-inbox-close';
    close.addEventListener('click', () => this.hide());
    head.append(close);
    this.inboxList = el('div', 'kinbox-list');
    this.root.append(head, this.inboxList);
    parent.append(this.root);
    panelHost.register(this);
    this.renderInbox();
    this.renderLine();
  }

  /** ⚠ 인라인 `display` 가 아니라 `hidden` 을 읽는다 (K34 규칙) */
  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }

  /**
   * 쌓인 소식 수 — "티커에 실제로 흘렀나"를 묻는 손잡이.
   * ⚠ 지금 하네스는 알림함의 `.kinbox-row` 개수를 세므로 이 게터에는 소비자가 없다.
   */
  get count(): number {
    return this.items.length;
  }

  /**
   * 지금 띠에 보이는 글 — 백도어가 아니라 화면 텍스트 그대로다.
   * ⚠ 하네스도 `#kairo-ticker .kticker-line` 을 직접 읽는다 (같은 값, 다른 경로).
   */
  get lineText(): string {
    return this.line.textContent ?? '';
  }

  /**
   * 사건 하나 — 티커에 흐르고 알림함에 쌓인다.
   *
   * `onOpen` 을 주면 알림함 행이 눌린다 (K47-②) — 결산처럼 **다시 열 수 있는** 사건만.
   */
  push(icon: string, text: string, stamp: string, onOpen?: () => void): void {
    this.items.unshift({ icon, text, stamp, ...(onOpen ? { onOpen } : {}) });
    if (this.items.length > INBOX_MAX) this.items.pop();
    this.renderInbox();
    // 새 뉴스는 붓 라벨보다 6초 우선 — 붓을 든 채로도 사건은 보여야 한다
    this.newsHold = Date.now() + 6000;
    window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => this.renderLine(), 6200);
    this.renderLine();
  }

  /**
   * 홈 입력층 소유권 (UI v3). 시트·패널·코스가 화면을 가지면 **26px 시각 띠와 44px
   * hit surface를 함께** 내린다.
   *
   * ⚠ hit surface 만 죽이지 말 것 — 띠가 남으면 시트 아래쪽에 읽을 수 없는 뉴스가
   * 겹쳐 보이고, "지금 무엇이 눌리는가"가 다시 애매해진다. z-index 를 낮추는 방식도
   * 안 된다 (다른 화면에서 역가림이 재발한다, 계획 §4).
   */
  setInputOwned(owned: boolean): void {
    this.strip.hidden = !owned;
  }

  /** 붓 상태 — 하단 바에서 옮겨 온 표시. null 이면 뉴스로 돌아간다 */
  setBrush(label: string | null): void {
    this.brushLabel = label;
    this.renderLine();
  }

  /**
   * 빈 띠 문구를 다시 그린다.
   *
   * 뉴스가 없을 때의 다음 행동은 홈의 즉시 목표에서 받는다. 뉴스가 생기면 뉴스가 우선한다.
   */
  setFallback(nextAction: string): void {
    this.fallback = tickerFallbackText(nextAction);
    this.renderLine();
  }

  private renderLine(): void {
    const latest = this.items[0];
    const newsFirst = Date.now() < this.newsHold;
    if (this.brushLabel !== null && !newsFirst) {
      this.strip.classList.add('brush');
      this.icon.textContent = '🖌';
      this.line.textContent = this.brushLabel;
      return;
    }
    this.strip.classList.remove('brush');
    if (!latest) {
      this.icon.textContent = '📰';
      this.line.textContent = this.fallback;
      return;
    }
    this.icon.textContent = latest.icon;
    this.line.textContent = latest.text;
    // 슬라이드 인 재시작 — 클래스를 뗐다 붙여야 애니메이션이 다시 돈다 (kairo-unlock 과 동일)
    this.line.classList.remove('fresh');
    void this.line.offsetWidth;
    this.line.classList.add('fresh');
  }

  private renderInbox(): void {
    this.inboxList.replaceChildren();
    if (this.items.length === 0) {
      /*
       * 빈 알림함도 **사실 + 방법**이다 (UX 감사 P1-22). 시트를 열면 시간이 멈추는데
       * 한 줄만 있고 나갈 이유만 있으면 연 사람이 손해를 본다.
       */
      const empty = el('div', 'kgrowth-empty');
      empty.dataset['emptyFor'] = 'inbox';
      empty.append(
        el('div', 'kgrowth-empty-fact', '아직 소식이 없습니다'),
        el('div', 'kgrowth-empty-how', '해금 · 승급 · 결산 도착 같은 소식이 여기 쌓입니다 (최근 50건)'),
      );
      this.inboxList.append(empty);
      return;
    }
    for (const it of this.items) {
      const row = el('div', `kinbox-row${it.onOpen ? ' open' : ''}`);
      row.append(
        el('span', 'kinbox-ico', it.icon),
        el('span', 'kinbox-text', it.text),
        el('span', 'kcaption', it.stamp),
      );
      /*
       * 눌리는 행 (K47-②) — 띠와 같은 이유로 `<button>` 이 아니라 `role="button"` 이다
       * (알림함은 시트 안이라 상시 컨트롤 셈에는 안 들지만, 표면 한 벌을 지킨다).
       * 열기 전에 **알림함을 닫는다** — 결산은 `PanelHost` 패널이라 배타 규칙이 어차피
       * 알림함을 밀어내는데, 우리가 안 닫으면 `panelHost` 가 닫아 상태가 갈린다.
       */
      if (it.onOpen) {
        const open = it.onOpen;
        row.setAttribute('role', 'button');
        row.tabIndex = 0;
        row.append(el('span', 'kinbox-go', '›'));
        const go = (): void => {
          this.hide();
          open();
        };
        row.addEventListener('click', go);
        row.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          go();
        });
      }
      this.inboxList.append(row);
    }
  }
}
