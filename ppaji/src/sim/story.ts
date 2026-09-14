/**
 * 시나리오 감독 (G16) — `story.json` 의 비트를 판 상태로 판정해 **비차단 Strip 사건**으로 적재한다.
 * 모달이 아니다 (PSS 부정 리뷰 1위 「팝업 과다」). 한 비트는 판당 한 번, 스냅샷 `story` 에 남는다.
 * sim 은 대사를 모른다 — 텍스트는 데이터, 판정만 여기.
 */
import storyJson from '../data/story.json';

export interface StoryCharacter { id: string; name: string; palette: number; hair: number; role: string }
export type StoryTrigger =
  | { kind: 'newGame' }
  | { kind: 'ended' }
  | { kind: 'pools' | 'poolTiles' | 'visitors' | 'likes' | 'wishes' | 'certs' | 'rank' | 'year' | 'areas' | 'recipes' | 'money' | 'hallSales'
    | 'rigs' | 'rigChain' | 'rigGrade' | 'gearsKnown' | 'vestRentals' | 'rigUpgrades'; min: number }; // P53-b §4.5: 빠지 축 트리거 6
export interface StoryBeat { id: string; trigger: StoryTrigger; speaker: string; lines: string[] }

export interface StoryState {
  pools: number; poolTiles: number; visitors: number; likes: number; wishes: number; certs: number; rank: number; year: number; areas: number; recipes: number; money: number; hallSales: number; ended: boolean;
  /** P53-b — 켜진 기구 수 · 최장 사슬 · 최고 빠지 등급 · 공방 도감 · 팔찌 대여 누적 · 개조 누적(`stats.converts`) */
  rigs: number; rigChain: number; rigGrade: number; gearsKnown: number; vestRentals: number; rigUpgrades: number;
}

const DATA = storyJson as { characters: StoryCharacter[]; beats: StoryBeat[] };
export const STORY_CHARACTERS: ReadonlyMap<string, StoryCharacter> = new Map(DATA.characters.map((c) => [c.id, c]));
export const STORY_BEATS: readonly StoryBeat[] = DATA.beats;

export class StoryDirector {
  readonly seen = new Set<string>();

  /** 새로 성립한 비트들 — 한 호출에 여럿이면 순서대로 (같은 프레임에 두 대사가 겹치지 않게 부르는 쪽이 큐에 넣는다) */
  check(s: StoryState): StoryBeat[] {
    const out: StoryBeat[] = [];
    for (const b of STORY_BEATS) {
      if (this.seen.has(b.id)) continue;
      if (met(b.trigger, s)) { this.seen.add(b.id); out.push(b); }
    }
    return out;
  }

  toSnapshot(): string[] { return [...this.seen].sort(); }
  fromSnapshot(ids: readonly string[] | undefined): void { this.seen.clear(); for (const id of ids ?? []) this.seen.add(id); }
}

function met(t: StoryTrigger, s: StoryState): boolean {
  switch (t.kind) {
    case 'newGame': return true;
    case 'ended': return s.ended;
    default: return s[t.kind] >= t.min;
  }
}
