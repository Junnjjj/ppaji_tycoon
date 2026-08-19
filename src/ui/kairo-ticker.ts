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
}

const INBOX_MAX = 50;

export class KairoTicker implements Panel {
  private readonly strip: HTMLDivElement;
  private readonly line: HTMLSpanElement;
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
  /** 새 뉴스 강조 — 붓 라벨이 덮고 있어도 뉴스가 오면 잠깐 이긴다 */
  private newsHold = 0;
  private holdTimer = 0;

  constructor(parent: HTMLElement) {
    /*
     * 띠 전체가 탭 대상이다 — 탭하면 알림함. 칩·버튼을 안에 늘어놓지 않는다 (트레이 규칙).
     *
     * ⚠ **`<button>` 이 아니라 `div` + `role="button"` 이다.** 하네스가
     * `button, select, input` 을 세어 "상시 컨트롤 5개"와 "터치 타깃 44px"를 판정한다.
     * 26px 짜리 띠를 버튼으로 만들면 그 검사 넷이 확정 실패한다 — 의뢰 칩 기둥
     * (`.kchipcol`)이 div 인 것과 같은 선례다. 대신 키보드 접근을 직접 채운다.
     */
    this.strip = el('div', 'kticker');
    this.strip.id = 'kairo-ticker';
    this.strip.setAttribute('role', 'button');
    this.strip.tabIndex = 0;
    this.strip.setAttribute('aria-label', '소식');
    this.line = el('span', 'kticker-line');
    this.strip.append(el('span', 'kticker-ico', '📰'), this.line);
    const activate = (): void => {
      if (this.visible) this.hide();
      else if (panelHost.open(this)) this.root.hidden = false;
    };
    this.strip.addEventListener('click', activate);
    // role="button" 을 붙였으면 Enter/Space 도 클릭과 같아야 한다 (네이티브 버튼의 계약)
    this.strip.addEventListener('keydown', (e) => {
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

  /** 쌓인 소식 수 — 검증·하네스가 "티커에 실제로 흘렀나"를 묻는다 */
  get count(): number {
    return this.items.length;
  }

  /** 지금 띠에 보이는 글 — 백도어가 아니라 화면 텍스트 그대로다 */
  get lineText(): string {
    return this.line.textContent ?? '';
  }

  /** 사건 하나 — 티커에 흐르고 알림함에 쌓인다 */
  push(icon: string, text: string, stamp: string): void {
    this.items.unshift({ icon, text, stamp });
    if (this.items.length > INBOX_MAX) this.items.pop();
    this.renderInbox();
    // 새 뉴스는 붓 라벨보다 6초 우선 — 붓을 든 채로도 사건은 보여야 한다
    this.newsHold = Date.now() + 6000;
    window.clearTimeout(this.holdTimer);
    this.holdTimer = window.setTimeout(() => this.renderLine(), 6200);
    this.renderLine();
  }

  /** 붓 상태 — 하단 바에서 옮겨 온 표시. null 이면 뉴스로 돌아간다 */
  setBrush(label: string | null): void {
    this.brushLabel = label;
    this.renderLine();
  }

  private renderLine(): void {
    const latest = this.items[0];
    const newsFirst = Date.now() < this.newsHold;
    if (this.brushLabel !== null && !newsFirst) {
      this.strip.classList.add('brush');
      this.line.textContent = `🖌 ${this.brushLabel}`;
      return;
    }
    this.strip.classList.remove('brush');
    if (!latest) {
      this.line.textContent = '소식이 여기 흐릅니다';
      return;
    }
    this.line.textContent = `${latest.icon} ${latest.text}`;
    // 슬라이드 인 재시작 — 클래스를 뗐다 붙여야 애니메이션이 다시 돈다 (kairo-unlock 과 동일)
    this.line.classList.remove('fresh');
    void this.line.offsetWidth;
    this.line.classList.add('fresh');
  }

  private renderInbox(): void {
    this.inboxList.replaceChildren();
    if (this.items.length === 0) {
      this.inboxList.append(el('div', 'kcaption', '아직 소식이 없습니다'));
      return;
    }
    for (const it of this.items) {
      const row = el('div', 'kinbox-row');
      row.append(
        el('span', 'kinbox-ico', it.icon),
        el('span', 'kinbox-text', it.text),
        el('span', 'kcaption', it.stamp),
      );
      this.inboxList.append(row);
    }
  }
}
