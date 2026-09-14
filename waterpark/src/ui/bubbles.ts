/**
 * 말풍선 — DOM `.kbubble`, **동시 ≤3** (PSS 실측). 새 것이 가장 오래된 것을 밀어낸다.
 * 위치는 프레임마다 월드→화면 좌표로 옮긴다 (`transform` 만).
 */
import { el } from './dom.js';

export const MAX_BUBBLES = 3;
const LIFE_MS = 2500;

interface Bubble {
  uid: number;
  node: HTMLDivElement;
  until: number;
}

export class Bubbles {
  private readonly host: HTMLDivElement;
  private readonly list: Bubble[] = [];

  constructor(parent: HTMLElement) {
    this.host = el('div');
    this.host.id = 'hud-bubbles';
    parent.append(this.host);
  }

  say(uid: number, text: string, now: number): void {
    const existing = this.list.find((b) => b.uid === uid);
    if (existing) {
      existing.node.textContent = text;
      existing.until = now + LIFE_MS;
      return;
    }
    while (this.list.length >= MAX_BUBBLES) {
      const old = this.list.shift();
      old?.node.remove();
    }
    const node = el('div', 'kbubble', text);
    this.host.append(node);
    this.list.push({ uid, node, until: now + LIFE_MS });
  }

  /** 매 프레임 — `at(uid)` 가 화면 좌표(CSS px)를 주면 옮기고, null 이면 지운다 */
  update(now: number, at: (uid: number) => { x: number; y: number } | null): void {
    for (const b of [...this.list]) {
      const p = b.until <= now ? null : at(b.uid);
      if (!p) {
        b.node.remove();
        this.list.splice(this.list.indexOf(b), 1);
        continue;
      }
      b.node.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0) translate(-50%, -100%)`;
    }
  }

  get count(): number {
    return this.list.length;
  }
}
