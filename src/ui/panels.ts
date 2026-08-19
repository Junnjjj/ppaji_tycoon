/**
 * 패널은 **한 번에 하나만** 열린다 (K37).
 *
 * ## 왜 필요한가 — 규칙이 시트 안에만 있었다
 *
 * 패널 8종이 각자 `this.root.hidden = false` 를 했다. `kairo-hud` 안에서 건설↔메뉴는
 * `toggle()` 이 서로를 닫았지만 그건 **시트 안에서만** 있는 규칙이었고, 시트 밖으로 나가면
 * 아무도 몰랐다. 그래서 건설을 열어 둔 채 도감을 열면 **둘이 겹친 채로 남았다.**
 *
 * 여덟 곳에 "다른 걸 닫아라"를 흩어 놓으면 아홉 번째가 생길 때 또 빠진다. 그래서
 * **주인을 하나** 만든다. 열린 패널을 아는 곳은 여기뿐이다.
 *
 * ## 왜 모듈 싱글턴인가
 *
 * 한 화면에 HUD 는 하나다. 호스트를 생성자 인자로 넘기면 패널 8종의 시그니처를 전부
 * 고쳐야 하는데, 얻는 것이 없다 (두 번째 호스트가 생길 일이 없다). `src/ui/tokens.ts` 의
 * 토큰 캐시와 같은 판단이다. 테스트가 상태를 나누고 싶으면 `reset()` 을 쓴다.
 *
 * ## 등록은 선택이다 — 기본값이 안전한 쪽이다
 *
 * 등록하지 않은 패널은 `exclusive: true` 로 취급된다. 즉 **새 패널을 만들고 등록을
 * 잊어도 다른 패널을 닫는다** — 잊으면 겹치는 쪽이 아니라 잊으면 닫히는 쪽이 기본이어야
 * 이 버그가 다시 안 생긴다.
 */

/**
 * 호스트가 패널에게 요구하는 것은 **닫힐 수 있음** 하나다.
 *
 * `root: HTMLElement` 를 넣었더니 패널 8종의 `private readonly root` 를 전부 public 으로
 * 열어야 했다 — 호스트가 쓰지도 않는 것 때문에 캡슐화를 여는 것은 값이 안 맞는다.
 * `hidden` 을 내리는 것은 각 패널의 일이고, 호스트는 순서만 정한다.
 */
export interface Panel {
  hide(): void;
}

export interface PanelOptions {
  /**
   * 다른 패널을 밀어내고, 다른 패널에게 밀려나는가.
   *
   * 감상 화면(`.kover.frame`)만 `false` 다 — 화면을 덮지 않고 위아래 띠만 얹는 것이
   * 목적이라(지도가 보여야 감상이다) 배타로 두면 **자기가 자기를 닫는다.**
   */
  exclusive?: boolean;
  /**
   * 열려 있는 동안 다른 패널이 못 열린다.
   *
   * 주간 카드만 `true` 다 — 선택하지 않으면 주가 안 넘어가는 것이 카드의 존재 이유인데,
   * 다른 패널이 밀어내면 선택을 조용히 건너뛴다.
   */
  modal?: boolean;
}

type Resolved = { exclusive: boolean; modal: boolean };

const DEFAULT: Resolved = { exclusive: true, modal: false };

export class PanelHost {
  private readonly opts = new Map<Panel, Resolved>();
  private readonly openSet = new Set<Panel>();

  register(p: Panel, o: PanelOptions = {}): void {
    this.opts.set(p, {
      exclusive: o.exclusive ?? DEFAULT.exclusive,
      modal: o.modal ?? DEFAULT.modal,
    });
  }

  private of(p: Panel): Resolved {
    return this.opts.get(p) ?? DEFAULT;
  }

  /** 지금 열려 있는 모달 (없으면 null) */
  get modal(): Panel | null {
    for (const p of this.openSet) {
      if (this.of(p).modal) return p;
    }
    return null;
  }

  /** 배타 패널 중 열려 있는 것 — 검사가 읽는다 */
  get openPanel(): Panel | null {
    for (const p of this.openSet) {
      if (this.of(p).exclusive) return p;
    }
    return null;
  }

  isOpen(p: Panel): boolean {
    return this.openSet.has(p);
  }

  /** 무엇이든 열려 있나 — 흐르는 낮이 이걸로 멈춘다 (K39: 시트·패널·카드가 열리면 시간 정지) */
  get anyOpen(): boolean {
    return this.openSet.size > 0;
  }

  /**
   * 이 패널을 열겠다고 알린다. **`false` 면 열지 말 것** (모달이 막았다).
   *
   * 실제로 `hidden` 을 내리는 것은 부르는 쪽이다 — 호스트가 DOM 을 직접 만지면
   * 패널마다 다른 등장 처리(내용 다시 그리기·카메라 잡기)를 뺏는다.
   */
  open(p: Panel): boolean {
    const m = this.modal;
    if (m !== null && m !== p) return false;

    if (this.of(p).exclusive) {
      for (const other of [...this.openSet]) {
        if (other === p) continue;
        if (!this.of(other).exclusive) continue;
        other.hide(); // hide() 가 closed() 를 불러 openSet 에서 빠진다
      }
    }
    this.openSet.add(p);
    return true;
  }

  /** 패널이 닫혔음을 알린다. `hide()` 마지막에 부른다 */
  closed(p: Panel): void {
    this.openSet.delete(p);
  }

  closeAll(): void {
    for (const p of [...this.openSet]) p.hide();
  }

  /** 테스트가 상태를 나눌 때 */
  reset(): void {
    this.openSet.clear();
    this.opts.clear();
  }
}

/**
 * 이 화면의 패널 주인. 패널은 이걸 직접 import 한다.
 *
 * ⚠ **`hidden` 을 대입하는 곳은 각 패널의 `show()`/`hide()` 뿐이어야 한다.**
 * `tools/check-ui-surface.mjs` 가 그 둘 밖에서의 대입을 잡는다.
 */
export const panelHost = new PanelHost();
