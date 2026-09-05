/**
 * 사건 채널 — sim 은 **적재만** 한다. 토스트/인박스/모달로 나누는 것은 UI 의 일이고,
 * 모달은 실시간 1분에 1개 (PSS 부정 리뷰 1위 「팝업 과다」의 처방).
 */
export type EventPriority = 'toast' | 'inbox' | 'modal' | 'strip';
export type EventKind = 'day-summary' | 'season-summary' | 'year-summary' | 'system' | 'guest' | 'pool' | 'story' | 'choice';

export interface GameEvent {
  id: number;
  tick: number;
  day: number;
  kind: EventKind;
  priority: EventPriority;
  title: string;
  body: string;
  read: boolean;
  /** story 사건 — 말하는 인물 id (초상·이름은 UI 가 story.json 에서 찾는다) */
  speaker?: string;
  /** 결산 사건 — 구조화된 표 (UI 가 카드로 그린다). 평문 JSON 이어야 한다 */
  data?: unknown;
}

export const INBOX_KEEP = 100;

export class Inbox {
  private list: GameEvent[] = [];
  private nextId = 1;
  private pending: GameEvent[] = [];

  push(e: Omit<GameEvent, 'id' | 'read'>): GameEvent {
    const ev: GameEvent = { ...e, id: this.nextId++, read: false };
    this.list.push(ev);
    if (this.list.length > INBOX_KEEP) this.list.splice(0, this.list.length - INBOX_KEEP);
    this.pending.push(ev);
    return ev;
  }

  /** 아직 UI 가 안 본 사건 — 렌더가 프레임마다 비운다. 헤드리스에서는 버려진다 */
  drain(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  get all(): readonly GameEvent[] {
    return this.list;
  }

  get unread(): number {
    return this.list.filter((e) => !e.read).length;
  }

  markRead(id: number): void {
    const e = this.list.find((x) => x.id === id);
    if (e) e.read = true;
  }

  toSnapshot(): { nextId: number; list: GameEvent[] } {
    return { nextId: this.nextId, list: this.list.map((e) => ({ ...e })) };
  }

  fromSnapshot(s: { nextId: number; list: GameEvent[] }): void {
    this.nextId = s.nextId;
    this.list = s.list.map((e) => ({ ...e }));
    this.pending = [];
  }
}
