/**
 * 사건 상자를 띄우는 **패널 하나** — 의뢰 열람 · 발견 · 완료 · 경고가 여기로 온다.
 *
 * ## 왜 패널을 하나 더 만드나
 *
 * 안 만든다 — **표면은 여전히 셋**이다 (시트 · 전면 · 떠 있는 것). 이건 `.kover.dialog`
 * 안에 `kairo-event-shell` 을 담는 얇은 껍데기이고, `PanelHost` 에 **하나**로 등록된다.
 * 축하(`KairoUnlockView`)와 주간 카드가 각자 자기 상자를 갖는 것과 같은 층이다.
 *
 * ## 채널 계약 (K47-①) — 이 상자가 채널을 늘리지 않는다
 *
 * · 축하(해금·승급·인물)는 그대로 `KairoUnlockView` 다.
 * · 뉴스는 그대로 티커/알림함이다.
 * · 내 행동의 대답은 그대로 토스트다.
 *
 * 여기 오는 것은 **내가 목록에서 열어 본 것**(의뢰·인증·소원·단골 상세)과, 토스트로는
 * 담기 힘든 **되돌릴 수 없는 확인**뿐이다. 한 사건을 두 채널에 넣지 않는다.
 *
 * ⚠ `modal: true` 로 등록하지 않는다 — 주간 카드만 모달이다. 이 상자는 읽는 화면이라
 * 다른 패널이 밀어내도 잃는 것이 없다.
 */
import { el } from './dom.js';
import { panelHost, type Panel } from './panels.js';
import {
  createEventShell,
  renderEventShell,
  type EventShellNodes,
  type EventShellView,
} from './kairo-event-shell.js';

export class KairoEventDialog implements Panel {
  private readonly root: HTMLDivElement;
  private readonly shell: EventShellNodes;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'kover dialog');
    this.root.id = 'kairo-event';
    this.root.hidden = true;
    const box = el('div', 'kdialog-box');
    this.shell = createEventShell();
    box.append(this.shell.root);
    this.root.append(box);
    parent.append(this.root);
    panelHost.register(this);
  }

  /** ⚠ 인라인 `display` 가 아니라 `hidden` 을 읽는다 (K34 규칙) */
  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * 연다. **닫기 선택지는 셸이 안 만든다** — 부르는 쪽이 무엇을 닫기로 쓸지 정한다
   * (의뢰는 `알겠습니다`, 확인은 `취소`). 다만 하나도 없으면 나갈 길이 사라지므로
   * 여기서 마지막 방어로 닫기를 붙인다.
   */
  show(view: EventShellView): boolean {
    if (!panelHost.open(this)) return false;
    const choices = view.choices.length > 0
      ? view.choices
      : [{ id: 'close', label: '알겠습니다', run: () => undefined }];
    renderEventShell(
      this.shell,
      { ...view, choices },
      // 어떤 선택지를 눌러도 상자는 닫힌다 — 열어 둔 채 화면을 옮기면 두 표면이 겹친다
      () => this.hide(),
    );
    this.root.hidden = false;
    return true;
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }
}
