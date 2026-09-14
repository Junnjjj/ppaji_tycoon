/**
 * 패널은 **한 번에 하나** (부모 K37 규칙 그대로). 열린 패널을 아는 곳은 여기뿐이다.
 * 등록하지 않은 패널은 `exclusive: true` 로 취급된다 — 잊으면 겹치는 쪽이 아니라 닫히는 쪽이 기본.
 *
 * 입력 소유권은 `data-ui-surface` **한 값**이 정한다 (z-index 경쟁 금지). `home` 이 아니면
 * 우측 열·티커·하단 바가 `hidden` 이다 — 하나만 내리면 남은 하나가 탭을 훔친다.
 */
export type UiSurface = 'home' | 'menu' | 'window' | 'build' | 'pool';

export interface Panel {
  hide(): void;
}

export interface PanelOptions {
  exclusive?: boolean;
  modal?: boolean;
}

type Resolved = { exclusive: boolean; modal: boolean };
const DEFAULT: Resolved = { exclusive: true, modal: false };

export class PanelHost {
  private readonly opts = new Map<Panel, Resolved>();
  private readonly openSet = new Set<Panel>();
  private readonly listeners = new Set<(open: boolean) => void>();

  onChange(listener: (open: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.anyOpen);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const l of this.listeners) l(this.anyOpen);
  }

  register(p: Panel, o: PanelOptions = {}): void {
    this.opts.set(p, { exclusive: o.exclusive ?? DEFAULT.exclusive, modal: o.modal ?? DEFAULT.modal });
  }

  private of(p: Panel): Resolved {
    return this.opts.get(p) ?? DEFAULT;
  }

  get modal(): Panel | null {
    for (const p of this.openSet) if (this.of(p).modal) return p;
    return null;
  }

  get openPanel(): Panel | null {
    for (const p of this.openSet) if (this.of(p).exclusive) return p;
    return null;
  }

  isOpen(p: Panel): boolean {
    return this.openSet.has(p);
  }

  /** 무엇이든 열려 있나 — 시간이 이걸로 멈춘다 */
  get anyOpen(): boolean {
    return this.openSet.size > 0;
  }

  /** `false` 면 열지 말 것 (모달이 막았다). `hidden` 을 내리는 것은 부르는 쪽이다 */
  open(p: Panel): boolean {
    const m = this.modal;
    if (m !== null && m !== p) return false;
    if (this.of(p).exclusive) {
      for (const other of [...this.openSet]) {
        if (other === p || !this.of(other).exclusive) continue;
        other.hide();
      }
    }
    this.openSet.add(p);
    this.changed();
    return true;
  }

  closed(p: Panel): void {
    if (this.openSet.delete(p)) this.changed();
  }

  closeAll(): void {
    for (const p of [...this.openSet]) p.hide();
  }

  reset(): void {
    this.openSet.clear();
    this.opts.clear();
    this.changed();
  }
}

export const panelHost = new PanelHost();

/**
 * 인터럽트 예산 — 모달은 **실시간 1분에 1개** (PSS 부정 리뷰 1위 「팝업 과다」의 처방).
 * 초과분은 `false` 를 받고 인박스로 간다. 시계는 주입한다(테스트가 시간을 흘린다).
 */
export const INTERRUPT_MAX_PER_MIN = 1;

export class InterruptBudget {
  stamps: number[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  request(): boolean {
    const t = this.now();
    this.stamps = this.stamps.filter((s) => t - s < 60_000);
    if (this.stamps.length >= INTERRUPT_MAX_PER_MIN) return false;
    this.stamps.push(t);
    return true;
  }

  reset(): void {
    this.stamps = [];
  }
}

export const interruptBudget = new InterruptBudget();

export function setUiSurface(s: UiSurface): void {
  document.documentElement.dataset['uiSurface'] = s;
}

export function uiSurface(): UiSurface {
  return (document.documentElement.dataset['uiSurface'] as UiSurface | undefined) ?? 'home';
}
