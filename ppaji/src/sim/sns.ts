/**
 * SNS — 손님이 시설 사진을 올리고(Post) 좋아요가 붙고, 지역 주민 좋아요가 1,000 이면 다음 지역이 열린다.
 * 친구(이름 있는 손님)는 만족 EXP 로 ☆ 단계가 오르고 단계마다 소원 하나가 **활성 창(8일)** 을 연다 —
 * 창 안에서 폐장 판정 때 조건이 한 번이라도 충족되면 성립(유지 불필요 = 부정 리뷰 2 대응). 창이 지나면 다음 계절에 다시 연다.
 * 결정은 `sns` 스트림에서만 뽑는다. 사건은 `Inbox` 에 적재만 한다.
 */
import type { Rng } from './rng.js';
import type { AreaDef, FriendDef, WishDef, GiftDef } from '../data/schema.js';

export interface Post {
  id: number;
  day: number;
  tick: number;
  /** 친구면 id, 아니면 null (일반 손님) */
  friendId: string | null;
  areaId: string;
  subject: { kind: 'pool' | 'facility'; ref: number; name: string };
  likes: number;
  playerLiked: boolean;
  /** 증식이 끝나는 날 */
  growUntilDay: number;
  /** 글쓴이 도트 팔레트 (초상, G23) */
  palette?: number;
}

export interface FriendState {
  id: string;
  exp: number;
  /** 달성한 ☆ 수 0..3 */
  stars: number;
  /** 지금 열린 소원 idx (없으면 null) */
  activeWish: 0 | 1 | 2 | null;
  /** 활성 창이 닫히는 날 (포함 안 함) */
  windowUntilDay: number;
  /** 창이 지나 못 이룬 소원 — 이 날부터 다시 연다 */
  retryFromDay: number;
  visits: number;
  /** 받은 선물 id */
  gifts: string[];
  /** 완료한 소원 idx */
  done: number[];
  /** 이번 창 안에 조건이 한 번이라도 충족됐다 (매시간 판정) — 아이템처럼 사라지는 것도 인정된다 */
  wishMet: boolean;
}

export interface SnsSnapshot {
  nextPostId: number;
  posts: Post[];
  areaLikes: Record<string, number>;
  openAreas: string[];
  friends: Record<string, FriendState>;
  playerLikesToday: number;
  totalLikes: number;
  /** 지역별로 이미 준 버스 문턱 수 (G33) */
  busGiven?: Record<string, number>;
  /** 플레이어가 타임라인에서 본 글 수 — 배지 = 안 본 글 (G33, 원작 규칙) */
  postsSeen?: number;
}

export interface SnsBalance {
  wishExpNeed: [number, number, number];
  wishWindowDays: number;
  likesPerArea: number;
  playerLikeBonus: number;
  /** 친구 글에 좋아요 → 그 친구 소원 EXP (G53, 조사 D17 — 눌러도 아무 것도 안 바뀌던 버튼) */
  playerLikeFriendExp: number;
  playerLikesPerDay: number;
  postGrowDays: number;
}

export const SNS_DEFAULTS: SnsBalance = { wishExpNeed: [100, 260, 520], wishWindowDays: 8, likesPerArea: 1000, playerLikeBonus: 5, playerLikeFriendExp: 12, playerLikesPerDay: 3, postGrowDays: 2 };
export const POSTS_KEEP = 200;

export class SnsStore {
  private posts: Post[] = [];
  private nextPostId = 1;
  readonly areaLikes = new Map<string, number>();
  /** 지역 id → 넘긴 `busAt` 문턱 수 (G33) */
  readonly busGiven = new Map<string, number>();
  postsSeen = 0;
  private openAreas: string[] = [];
  readonly friends = new Map<string, FriendState>();
  playerLikesToday = 0;
  totalLikes = 0;
  readonly areasById: ReadonlyMap<string, AreaDef>;
  readonly friendsById: ReadonlyMap<string, FriendDef>;
  readonly wishesByFriend: ReadonlyMap<string, WishDef[]>;
  readonly giftsById: ReadonlyMap<string, GiftDef>;

  constructor(
    areas: readonly AreaDef[],
    friendDefs: readonly FriendDef[],
    wishes: readonly WishDef[],
    gifts: readonly GiftDef[],
    private readonly rng: Rng,
    private readonly b: SnsBalance = SNS_DEFAULTS,
  ) {
    this.areasById = new Map(areas.map((a) => [a.id, a]));
    this.friendsById = new Map(friendDefs.map((f) => [f.id, f]));
    const wb = new Map<string, WishDef[]>();
    for (const w of wishes) wb.set(w.friendId, [...(wb.get(w.friendId) ?? []), w].sort((x, y) => x.idx - y.idx));
    this.wishesByFriend = wb;
    this.giftsById = new Map(gifts.map((g) => [g.id, g]));
    const first = [...areas].sort((a, b2) => a.order - b2.order)[0];
    if (first) this.openArea(first.id, 0);
  }

  /** 열린 지역 순서 */
  get areas(): readonly string[] {
    return this.openAreas;
  }

  get allPosts(): readonly Post[] {
    return this.posts;
  }

  /** 해금된 친구 (지역이 열려 있고 초대됐거나 시작 친구) */
  get unlockedFriends(): FriendState[] {
    return [...this.friends.values()];
  }

  friendDef(id: string): FriendDef | undefined {
    return this.friendsById.get(id);
  }

  private openArea(areaId: string, _day: number): FriendDef[] {
    if (this.openAreas.includes(areaId)) return [];
    this.openAreas.push(areaId);
    if (!this.areaLikes.has(areaId)) this.areaLikes.set(areaId, 0);
    const arrived: FriendDef[] = [];
    for (const f of this.friendsById.values()) {
      if (f.area === areaId && f.start && !this.friends.has(f.id)) {
        this.unlockFriend(f.id);
        arrived.push(f);
      }
    }
    return arrived;
  }

  unlockFriend(id: string): boolean {
    if (this.friends.has(id) || !this.friendsById.has(id)) return false;
    this.friends.set(id, { id, exp: 0, stars: 0, activeWish: null, windowUntilDay: 0, retryFromDay: 0, visits: 0, gifts: [], done: [], wishMet: false });
    return true;
  }

  /** 다음 지역 — 순서상 다음이고 아직 안 열린 것 */
  nextArea(): AreaDef | null {
    const sorted = [...this.areasById.values()].sort((a, b2) => a.order - b2.order);
    return sorted.find((a) => !this.openAreas.includes(a.id)) ?? null;
  }

  /** 마지막으로 열린 지역의 좋아요 진행 (다음 지역 문턱 대비) */
  areaProgress(): { areaId: string; likes: number; need: number } | null {
    const last = this.openAreas[this.openAreas.length - 1];
    if (!last) return null;
    return { areaId: last, likes: this.areaLikes.get(last) ?? 0, need: this.areasById.get(last)?.likesToUnlockNext ?? this.b.likesPerArea };
  }

  /** 글 하나 — 초기 좋아요는 인기 비례 + 편차 (P60-a: 색·향 취향 일치 보너스 삭제) */
  post(day: number, tick: number, friendId: string | null, areaId: string, subject: Post['subject'], basePop: number, palette = 0): Post {
    // 인기 기여는 상한 — 글 하나가 수십 개 이상을 가져오면 지역 문턱(1,000)이 며칠에 열린다
    const likes = Math.max(1, Math.round(Math.min(24, basePop * 0.3) + this.rng.int(6)));
    const p: Post = { id: this.nextPostId++, day, tick, friendId, areaId, subject, likes, playerLiked: false, growUntilDay: day + this.b.postGrowDays, palette };
    this.posts.push(p);
    if (this.posts.length > POSTS_KEEP) { const drop = this.posts.length - POSTS_KEEP; this.posts.splice(0, drop); this.droppedPosts += drop; }
    this.addLikes(areaId, likes);
    return p;
  }

  /** 지역 없는 좋아요 (이벤트 보상, G21) — 지금 열린 마지막 지역에 얹는다 */
  addBonusLikes(n: number): void {
    const area = this.areas[this.areas.length - 1];
    if (area) this.addLikes(area, n);
    else this.totalLikes += n;
  }

  private addLikes(areaId: string, n: number): void {
    this.areaLikes.set(areaId, (this.areaLikes.get(areaId) ?? 0) + n);
    this.totalLikes += n;
  }

  /** 플레이어 좋아요 — 하루 3회, +5 */
  get friendCount(): number {
    return this.friendsById.size;
  }

  likePost(postId: number, day = 0): { ok: true; friend: { id: string; name: string; exp: number; opened: WishDef | null } | null } | { ok: false; reason: string } {
    const p = this.posts.find((x) => x.id === postId);
    if (!p) return { ok: false, reason: '글이 없습니다' };
    if (p.playerLiked) return { ok: false, reason: '이미 좋아요를 눌렀습니다' };
    if (this.playerLikesToday >= this.b.playerLikesPerDay) return { ok: false, reason: `좋아요는 하루 ${this.b.playerLikesPerDay}번까지` };
    p.playerLiked = true;
    p.likes += this.b.playerLikeBonus;
    this.playerLikesToday++;
    this.addLikes(p.areaId, this.b.playerLikeBonus);
    let friend: { id: string; name: string; exp: number; opened: WishDef | null } | null = null;
    if (p.friendId && this.friends.has(p.friendId)) {
      const opened = this.addFriendExp(p.friendId, this.b.playerLikeFriendExp, day);
      friend = { id: p.friendId, name: this.friendsById.get(p.friendId)?.name ?? p.friendId, exp: this.b.playerLikeFriendExp, opened };
    }
    return { ok: true, friend };
  }

  /** 친구 방문 — 만족 EXP 누적. ☆ 문턱을 넘으면 소원 창을 연다 (반환: 새로 열린 소원) */
  addFriendExp(friendId: string, exp: number, day: number): WishDef | null {
    const st = this.friends.get(friendId);
    if (!st) return null;
    st.exp += exp;
    return this.maybeOpenWish(st, day);
  }

  private maybeOpenWish(st: FriendState, day: number): WishDef | null {
    if (st.activeWish !== null || st.stars >= 3 || day < st.retryFromDay) return null;
    const need = this.b.wishExpNeed[st.stars] ?? Infinity;
    if (st.exp < need) return null;
    const wish = this.wishesByFriend.get(st.id)?.[st.stars];
    if (!wish) return null;
    st.activeWish = wish.idx;
    st.windowUntilDay = day + this.b.wishWindowDays;
    st.wishMet = false;
    return wish;
  }

  /** 열린 소원 전부 (화면·판정) */
  activeWishes(): { friend: FriendState; wish: WishDef }[] {
    const out: { friend: FriendState; wish: WishDef }[] = [];
    for (const st of this.friends.values()) {
      if (st.activeWish === null) continue;
      const wish = this.wishesByFriend.get(st.id)?.[st.activeWish];
      if (wish) out.push({ friend: st, wish });
    }
    return out;
  }

  /** 시간 판정 — 열린 소원 중 지금 충족된 것을 표시한다 (사라지는 아이템도 그 순간이면 인정) */
  markMet(met: (wish: WishDef) => boolean): void {
    for (const { friend, wish } of this.activeWishes()) if (!friend.wishMet && met(wish)) friend.wishMet = true;
  }

  /**
   * 폐장 판정 — 열린 소원마다 `met(wish)` 를 물어 성립이면 ★ 를 올리고 다음 친구를 초대한다.
   * 창이 지났으면 닫고 다음 계절(4일 뒤)에 다시 연다. 반환: 성립한 소원과 초대된 친구.
   */
  closeDay(day: number, met: (wish: WishDef) => boolean): { fulfilled: { friend: FriendState; wish: WishDef }[]; invited: FriendDef[]; expired: { friend: FriendState; wish: WishDef }[] } {
    const fulfilled: { friend: FriendState; wish: WishDef }[] = [];
    const expired: { friend: FriendState; wish: WishDef }[] = [];
    const invited: FriendDef[] = [];
    for (const { friend, wish } of this.activeWishes()) {
      if (friend.wishMet || met(wish)) {
        friend.activeWish = null;
        friend.stars = Math.max(friend.stars, wish.idx + 1);
        friend.done.push(wish.idx);
        fulfilled.push({ friend, wish });
        for (const f of this.friendsById.values()) {
          if (f.invitedBy && f.invitedBy.friend === friend.id && friend.stars >= f.invitedBy.star && this.openAreas.includes(f.area) && this.unlockFriend(f.id)) invited.push(f);
        }
        this.maybeOpenWish(friend, day + 1);
      } else if (day + 1 >= friend.windowUntilDay) {
        friend.activeWish = null;
        friend.retryFromDay = day + 4;
        expired.push({ friend, wish });
      }
    }
    // 창이 지난 뒤 다시 열 차례가 된 친구
    for (const st of this.friends.values()) if (st.activeWish === null) this.maybeOpenWish(st, day + 1);
    this.playerLikesToday = 0;
    return { fulfilled, invited, expired };
  }

  /** 글 증식 — 매일 아침, 아직 자라는 글에 지역 팔로워(열린 친구 수) 만큼 */
  growPosts(day: number): void {
    for (const p of this.posts) {
      if (day > p.growUntilDay) continue;
      const followers = [...this.friends.values()].filter((f) => this.friendsById.get(f.id)?.area === p.areaId).length;
      const n = Math.min(6, followers) + this.rng.int(2);
      p.likes += n;
      this.addLikes(p.areaId, n);
    }
  }

  /** 안 본 글 수 — HUD SNS 배지 (원작: 「右上のSNSアイコンに数字 = 未読の新規投稿」) */
  get unseenPosts(): number {
    return Math.max(0, this.posts.length + this.droppedPosts - this.postsSeen);
  }
  private droppedPosts = 0;
  markPostsSeen(): void {
    this.postsSeen = this.posts.length + this.droppedPosts;
  }

  /** 좋아요 사다리를 새로 넘긴 지역들 (G33) — 넘긴 문턱마다 한 항목. 호출할 때마다 기록되므로 하루에 한 번만 부른다 */
  crossedBusThresholds(): { areaId: string; at: number; reward: AreaDef['likeRewards'] extends (infer T)[] | undefined ? T | undefined : never }[] {
    const out: { areaId: string; at: number; reward: NonNullable<AreaDef['likeRewards']>[number] | undefined }[] = [];
    for (const areaId of this.openAreas) {
      const def = this.areasById.get(areaId);
      const every = def?.busEvery ?? 0;
      if (every <= 0) continue;
      const likes = this.areaLikes.get(areaId) ?? 0;
      let given = this.busGiven.get(areaId) ?? 0;
      // 하루에 여러 문턱을 넘겨도 버스는 하루 최대 3대 — 아침이 버스로만 채워지지 않게
      let n = 0;
      while (likes >= (given + 1) * every && n < 3) {
        given++; n++;
        const at = given * every;
        out.push({ areaId, at, reward: def?.likeRewards?.find((r) => r.at === at) });
      }
      this.busGiven.set(areaId, given);
    }
    return out;
  }

  /** 지역 문턱 검사 — 열리면 새 지역과 도착 친구를 돌려준다 */
  checkAreas(day: number): { area: AreaDef; friends: FriendDef[] } | null {
    const prog = this.areaProgress();
    const next = this.nextArea();
    if (!prog || !next || prog.likes < prog.need) return null;
    const friends = this.openArea(next.id, day);
    return { area: next, friends };
  }

  giveGift(friendId: string, giftId: string, day: number): { ok: true; wish: WishDef | null } | { ok: false; reason: string } {
    const st = this.friends.get(friendId);
    const g = this.giftsById.get(giftId);
    if (!st) return { ok: false, reason: '아직 친구가 아닙니다' };
    if (!g) return { ok: false, reason: '알 수 없는 선물' };
    if (st.gifts.includes(giftId)) return { ok: false, reason: '이미 준 선물입니다' };
    st.gifts.push(giftId);
    const wish = this.addFriendExp(friendId, Math.round(g.price / 8), day);
    return { ok: true, wish };
  }

  hasGift(giftId: string, friendId?: string): boolean {
    if (friendId) return this.friends.get(friendId)?.gifts.includes(giftId) ?? false;
    for (const f of this.friends.values()) if (f.gifts.includes(giftId)) return true;
    return false;
  }

  toSnapshot(): SnsSnapshot {
    return {
      nextPostId: this.nextPostId,
      posts: this.posts.map((p) => ({ ...p, subject: { ...p.subject } })),
      areaLikes: Object.fromEntries(this.areaLikes),
      openAreas: [...this.openAreas],
      friends: Object.fromEntries([...this.friends.values()].map((f) => [f.id, { ...f, gifts: [...f.gifts], done: [...f.done] }])),
      playerLikesToday: this.playerLikesToday,
      totalLikes: this.totalLikes,
      busGiven: Object.fromEntries(this.busGiven),
      postsSeen: Math.max(0, this.postsSeen - this.droppedPosts),
    };
  }

  fromSnapshot(s: SnsSnapshot): void {
    this.busGiven.clear();
    for (const [k, v] of Object.entries(s.busGiven ?? {})) this.busGiven.set(k, v);
    this.postsSeen = s.postsSeen ?? 0;
    this.droppedPosts = 0;
    this.nextPostId = s.nextPostId;
    this.posts = s.posts.map((p) => ({ ...p, subject: { ...p.subject } }));
    this.areaLikes.clear();
    for (const [k, v] of Object.entries(s.areaLikes)) this.areaLikes.set(k, v);
    this.openAreas = [...s.openAreas];
    this.friends.clear();
    for (const [k, v] of Object.entries(s.friends)) this.friends.set(k, { ...v, gifts: [...v.gifts], done: [...v.done], wishMet: v.wishMet ?? false });
    this.playerLikesToday = s.playerLikesToday;
    this.totalLikes = s.totalLikes;
  }
}
