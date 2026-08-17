import { Rng } from '../rng.js';
import { FlowField } from '../pathfield.js';
import type { KairoTerrain } from './terrain.js';
import { type WallGrid } from './walls.js';
import { PlacementGrid, facilityDef } from './placement.js';
import {
  pickGroup,
  groupSize,
  groupDef,
  needWeight,
  type GroupDef,
  type GroupId,
} from './groups.js';
import type { Season } from './week.js';

/**
 * 손님 에이전트 — **시뮬 소유**. 스펙 §2.
 *
 * ## 왜 개체 단위인가
 *
 * 통계로 굴리면 "손님이 노는 광경"이 사라진다. 그게 이 게임 최대의 보상이고, 사용자가
 * 카이로를 택한 이유("npc들의 표정을 보고, 상호작용을 눈으로 볼 수 있다")다.
 *
 * ## 왜 flow field 인가
 *
 * 60명이 각자 A* 를 돌리면 배치를 바꿀 때마다 프레임이 튄다. 목적지(시설)마다 거리장을
 * 한 번 만들어 두면 손님당 비용이 O(1) 이다. 거리장은 `src/sim/pathfield.ts` 를 그대로
 * 쓴다 — 렌더 비의존이라 헤드리스에서도 돈다.
 *
 * ## 퇴장 만족도가 평판의 기반이다
 *
 * "현재 평균 만족도"는 함정이다. 할 게 없는 빠지는 손님이 빨리 나가 새 손님으로 교체되어
 * **평균이 오히려 높아진다**. Phase 1 에서 실제로 걸렸던 부분이라 여기서도 퇴장 시점의
 * 만족도만 집계한다.
 */

export type GuestState = 'walking' | 'using' | 'leaving' | 'gone';

/** 포즈 — 렌더 계약의 7종과 같은 이름. 시뮬이 정하고 렌더가 그린다 */
export type GuestPose = 'idle' | 'walk' | 'swim' | 'float' | 'sit' | 'lie' | 'ride';

/** 표정 4종 — 만족도에서 파생된다 (스펙 §2.1) */
export type GuestFace = 'calm' | 'happy' | 'annoyed' | 'tired';

/** 이모트 6종 */
export type GuestEmote = 'happy' | 'love' | 'neutral' | 'annoyed' | 'hot' | 'alert';

export interface Guest {
  id: number;
  /** 일행 유형 (§10.4) — 지갑·인내·수요 편향이 여기서 온다 */
  group: GroupId;
  /** 같은 일행 식별자 — 렌더가 무리를 묶어 보여줄 수 있다 */
  party: number;
  /** 객단가 배율 */
  wallet: number;
  /** 스릴 선호 0..1 */
  thrill: number;
  /** 현재 타일 */
  i: number;
  j: number;
  /** 직전 타일 — 렌더가 보간해서 부드럽게 움직인다 */
  fromI: number;
  fromJ: number;
  /** 0..1, 직전 타일에서 현재 타일로 가는 진행도 */
  progress: number;
  state: GuestState;
  pose: GuestPose;
  /** 향하는 방향 — 렌더의 4방향과 같다 */
  facing: '+X' | '+Z' | '-X' | '-Z';
  /** 색 변형 (구명조끼 등) */
  palette: number;
  face: GuestFace;
  emote: GuestEmote | null;
  emoteTicks: number;
  /** 이용 중인 시설 handle 과 슬롯 번호 */
  usingHandle: number;
  usingSlot: number;
  /** 남은 이용 tick */
  useTicks: number;
  /** 만족도 0..100 — 퇴장 시점 값만 집계한다 */
  satisfaction: number;
  /** 이용한 시설 수 */
  used: number;
  /** 걷기 tick 누적 (속도 제어) */
  stepAcc: number;
  /**
   * 이미 채운 수요 종류.
   *
   * 없으면 손님이 **항상 가장 가까운 시설**만 가고, 가까운 곳이 빨리 비면 먼 시설은
   * 아무도 안 간다 (실측: 잔교 끝 트램폴린 방문 0). 그러면 "무엇을 짓나"보다
   * "게이트에 붙이나"만 남는다.
   */
  usedNeeds: string[];
  /** 슬라이드 탑승 — 남은 tick 과 전체 tick (0 이면 탑승 아님) */
  rideTicks: number;
  rideTotal: number;
  /** 탑승 구간 (입구 → 출구) */
  rideFrom: readonly [number, number];
  rideTo: readonly [number, number];
}

export interface GuestTunables {
  /** 동시 손님 상한 */
  maxGuests: number;
  /** 한 칸 이동에 필요한 tick */
  ticksPerStep: number;
  /** 시설 1회 이용 tick */
  useTicks: number;
  /** 이 횟수만큼 이용하면 만족하고 나간다 */
  wantUses: number;
  /** 목적지를 못 찾은 채 이 tick 이 지나면 불만을 품고 나간다 */
  patienceTicks: number;
  /** 이모트 표시 tick */
  emoteTicks: number;
  /** 시작 만족도 */
  startSatisfaction: number;
  /**
   * 이용 1·2·3·4회차의 만족도 상승. **체감시킨다** — 같은 값을 계속 주면 만족도가
   * 상한에 붙어 배치 차이가 결과에 안 나타난다 (헤드리스에서 전 판 98 이 나왔다).
   */
  useGains: readonly number[];
  /** 한 칸 걸을 때마다 깎이는 양 — 이게 있어야 "가깝게 놓는다"가 의미를 갖는다 */
  walkPenalty: number;
  /** 갈 곳을 못 찾은 tick 마다 깎이는 양 */
  waitPenalty: number;
}

export const GUEST_DEFAULTS: GuestTunables = {
  maxGuests: 60,
  ticksPerStep: 4,
  /**
   * 이용 시간. **한 방문이 하루(120 tick) 안에 끝나야 한다** — 40 tick × 4회 + 이동이면
   * 160 tick 이라 손님이 2.5일을 머물고 공원이 영구히 포화된다 (헤드리스에서 만석 63%).
   * 12 tick × 4회 + 이동 40 = 88 tick 으로 하루 안에 들어온다.
   */
  useTicks: 12,
  wantUses: 4,
  patienceTicks: 300,
  emoteTicks: 30,
  startSatisfaction: 52,
  useGains: [14, 10, 7, 4],
  walkPenalty: 0.35,
  waitPenalty: 0.12,
};

export interface GuestStats {
  alive: number;
  /** 유형별 현재 인원 — 결산에서 "누가 왔나"를 보여준다 */
  byGroup: Record<GroupId, number>;
  walking: number;
  using: number;
  leaving: number;
  /** 퇴장한 손님 수 */
  exited: number;
  /** 퇴장 만족도 평균 (없으면 0) */
  exitSatisfaction: number;
  /** 목적지를 못 찾아 나간 손님 수 */
  gaveUp: number;
}

interface SlotClaim {
  /** 슬롯별 점유 손님 id (0 = 빈 슬롯) */
  slots: number[];
}

export class GuestStore {
  private readonly guests: Guest[] = [];
  private nextId = 1;
  private readonly fields = new Map<number, FlowField>();
  private gateField: FlowField | null = null;
  private readonly claims = new Map<number, SlotClaim>();
  private dirty = true;

  /** 이번 주에 서는 시설을 알린다 (직원 부족·고장). 매주 갱신한다 */
  setIdle(handles: ReadonlySet<number>): void {
    this.idle = new Set(handles);
  }

  get idleCount(): number {
    return this.idle.size;
  }

  /** 현재 동시 손님 상한 — 튜너블의 기본값에서 시작해 등급이 올린다 */
  private limit: number;

  private exited = 0;
  private satSum = 0;
  private gaveUp = 0;
  /**
   * 이용을 마친 손님의 **지갑 배율 합**. 요금은 이 합에 평균 요금을 곱해 받는다 —
   * 인원수만 세면 친구·단체가 더 쓴다는 설정이 매출에 안 나타난다.
   */
  private finishedWallet = 0;
  private finishedCount = 0;
  /**
   * 아직 다 들어오지 않은 일행. 도착 1건마다 한 명씩 들어온다.
   *
   * ⚠ 일행 전체를 한 번에 넣으면 도착률 계산이 무너진다 — 주간 도착 수는 누적기가
   * 정하는데 한 번에 5명이 들어오면 그 주 입장이 5배가 된다. 한 명씩 넣되 **연속으로**
   * 넣어서, 같은 일행이 몇 tick 안에 줄줄이 들어오게 한다.
   */
  private pending: { def: GroupDef; remaining: number; party: number } | null = null;
  private nextParty = 1;
  /**
   * 이번 주에 **선** 시설 (운영요원 부족·고장). 목적지에서 뺀다.
   *
   * 거리장 자체를 지우지 않는 이유: 다음 주에 다시 돌면 그대로 써야 하는데, 지우면
   * 매주 1,280칸 거리장을 다시 만들어야 한다.
   */
  private idle = new Set<number>();
  private patience = new Map<number, number>();

  constructor(
    private readonly terrain: KairoTerrain,
    private readonly walls: WallGrid,
    private readonly placement: PlacementGrid,
    private readonly gate: { i: number; j: number },
    readonly tunables: GuestTunables = GUEST_DEFAULTS,
  ) {
    this.limit = tunables.maxGuests;
  }

  get all(): readonly Guest[] {
    return this.guests;
  }

  get count(): number {
    return this.guests.length;
  }

  /** 지형·벽·시설이 바뀌면 거리장을 버린다. 다음 tick 에 다시 만든다 */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * 동시 손님 상한을 바꾼다 — 등급이 오르면 올라간다.
   * 상한이 고정이면 시설을 늘려도 입장이 안 늘어 후반 성장이 멈춘다.
   */
  setMaxGuests(n: number): void {
    this.limit = Math.max(1, Math.round(n));
  }

  get maxGuests(): number {
    return this.limit;
  }

  /**
   * 손님이 밟을 수 있는 칸.
   *
   * 시설은 길을 막는다 — 단 플로팅덱·선착장은 밟고 지나간다. K5 까지는 시설을 통째로
   * 뚫고 지나갔고, 그러면 배치가 동선에 영향을 주지 않아 "배치가 결과를 바꾼다"가
   * 성립하지 않는다.
   */
  private walkable = (i: number, j: number): boolean => {
    if (this.walls.blocks(i, j)) return false;
    if (this.placement.blocksWalk(i, j)) return false;
    return this.terrain.isWalkable(i, j) || this.placement.isWalkOn(i, j);
  };

  /**
   * 거리장 재구축. 시설마다 **발자국에 인접한 걸을 수 있는 칸**을 목적지로 둔다 —
   * 발자국 자체는 시설이 점유해 못 걷는다.
   */
  private rebuildFields(): void {
    this.fields.clear();
    const w = this.terrain.width;
    const h = this.terrain.height;

    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;
      const targets: [number, number][] = [];
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j)) {
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ni = ti + di;
          const nj = tj + dj;
          if (!this.walkable(ni, nj)) continue;
          // ⚠ "점유된 칸"을 전부 빼면 **덱 위가 목적지가 되지 못한다** — 덱은 시설이면서
          //   밟을 수 있는 칸이다. 물 위 시설로 가는 유일한 길이 덱이므로 walkable 판정만 쓴다.
          targets.push([ni, nj]);
        }
      }
      if (targets.length === 0) continue;
      const f = new FlowField(w, h);
      f.build(this.walkable, targets);
      this.fields.set(item.handle, f);
    }

    this.gateField = new FlowField(w, h);
    this.gateField.build(this.walkable, [[this.gate.i, this.gate.j]]);
    this.dirty = false;

    // 없어진 시설의 슬롯 점유를 정리한다
    const live = new Set(this.placement.all().map((f) => f.handle));
    for (const handle of [...this.claims.keys()]) {
      if (!live.has(handle)) this.claims.delete(handle);
    }
    for (const g of this.guests) {
      if (g.usingHandle !== 0 && !live.has(g.usingHandle)) this.releaseSlot(g);
    }
  }

  private slotsOf(handle: number): SlotClaim | null {
    const item = this.placement.all().find((f) => f.handle === handle);
    if (!item) return null;
    const def = facilityDef(item.defId);
    if (!def) return null;
    let c = this.claims.get(handle);
    if (!c) {
      c = { slots: new Array<number>(def.capacity).fill(0) };
      this.claims.set(handle, c);
    }
    return c;
  }

  private claimSlot(g: Guest, handle: number): boolean {
    const c = this.slotsOf(handle);
    if (!c) return false;
    const idx = c.slots.indexOf(0);
    if (idx < 0) return false;
    c.slots[idx] = g.id;
    g.usingHandle = handle;
    g.usingSlot = idx;
    return true;
  }

  private releaseSlot(g: Guest): void {
    const c = this.claims.get(g.usingHandle);
    if (c && c.slots[g.usingSlot] === g.id) c.slots[g.usingSlot] = 0;
    g.usingHandle = 0;
    g.usingSlot = -1;
  }

  /**
   * 다음에 갈 시설. **아직 안 채운 수요를 우선**하고, 그 안에서 가까운 셋 중 하나를 뽑는다.
   *
   * 거리만 보면 가까운 시설이 빨리 비는 순간 먼 시설을 아무도 안 간다 (실측). 그러면
   * "무엇을 짓나"가 사라지고 "게이트에 붙이나"만 남는다. 수요를 우선하면 손님이 먹고 →
   * 놀고 → 쉬는 식으로 돌아 시설 종류 구성이 의미를 갖는다.
   *
   * 가까운 셋 중 무작위로 뽑는 이유: 전부 최단거리로 몰리면 한 시설에만 줄이 서고
   * 나머지가 빈다.
   */
  private pickTarget(g: Guest, rng: Rng): number | null {
    const all: { handle: number; dist: number; need: string }[] = [];
    for (const [handle, field] of this.fields) {
      if (this.idle.has(handle)) continue; // 선 시설엔 안 간다
      const c = this.slotsOf(handle);
      if (!c || c.slots.every((s) => s !== 0)) continue;
      const d = field.distAt(g.i, g.j);
      if (d < 0) continue;
      const item = this.placement.all().find((f) => f.handle === handle);
      const need = item
        ? ((facilityDef(item.defId) as { need?: string } | undefined)?.need ?? '')
        : '';
      all.push({ handle, dist: d, need });
    }
    if (all.length === 0) return null;

    const fresh = all.filter((c) => c.need !== '' && !g.usedNeeds.includes(c.need));
    const pool = fresh.length > 0 ? fresh : all;
    /*
     * 거리에 **유형별 수요 편향**을 곱한다 (§10.4). 1.0 미만이면 "멀어도 간다" —
     * 가족은 놀이·위생을, 친구는 스릴을 찾아간다. 그래서 시설 구성이 손님 구성을 통해
     * 매출로 이어진다: 스릴만 지으면 가족이 심심하고, 경관만 지으면 친구가 심심하다.
     */
    const gdef = groupDef(g.group);
    for (const c of pool) c.dist *= needWeight(gdef, c.need);
    pool.sort((a, b) => a.dist - b.dist || a.handle - b.handle);
    const top = pool.slice(0, Math.min(3, pool.length));
    return (top[rng.int(top.length)] as { handle: number }).handle;
  }

  /**
   * 손님 한 명 입장. 게이트가 못 걷는 칸이면 실패.
   *
   * 일행 단위로 들어온다 — 대기 중인 일행이 없으면 계절 비중으로 새 일행을 뽑는다.
   * 계절을 안 주면 여름으로 본다 (기존 호출자 호환).
   */
  spawn(rng: Rng, season: Season = 'summer'): Guest | null {
    if (this.guests.length >= this.limit) return null;
    if (!this.walkable(this.gate.i, this.gate.j)) return null;
    if (!this.pending || this.pending.remaining <= 0) {
      const def = pickGroup(rng, season);
      this.pending = { def, remaining: groupSize(rng, def), party: this.nextParty++ };
    }
    const party = this.pending;
    party.remaining -= 1;
    const def = party.def;
    const g: Guest = {
      id: this.nextId++,
      group: def.id,
      party: party.party,
      wallet: def.wallet,
      thrill: def.thrill[0] + rng.next() * (def.thrill[1] - def.thrill[0]),
      i: this.gate.i,
      j: this.gate.j,
      fromI: this.gate.i,
      fromJ: this.gate.j,
      progress: 1,
      state: 'walking',
      pose: 'walk',
      facing: '+Z',
      palette: rng.int(8),
      face: 'calm',
      emote: null,
      emoteTicks: 0,
      usingHandle: 0,
      usingSlot: -1,
      useTicks: 0,
      satisfaction: this.tunables.startSatisfaction,
      used: 0,
      stepAcc: 0,
      usedNeeds: [],
      rideTicks: 0,
      rideTotal: 0,
      rideFrom: [0, 0],
      rideTo: [0, 0],
    };
    this.guests.push(g);
    return g;
  }

  private setEmote(g: Guest, e: GuestEmote): void {
    g.emote = e;
    g.emoteTicks = this.tunables.emoteTicks;
  }

  /** 만족도에서 표정을 파생한다 — 표정을 따로 관리하면 두 값이 어긋난다 */
  private syncFace(g: Guest): void {
    g.face = g.satisfaction >= 75 ? 'happy' : g.satisfaction >= 45 ? 'calm' : g.satisfaction >= 25 ? 'tired' : 'annoyed';
  }

  /** 한 tick. `rng` 는 이 tick 전용 스트림이어야 결정론이 유지된다 */
  tick(rng: Rng): void {
    if (this.dirty) this.rebuildFields();

    for (const g of this.guests) {
      if (g.emoteTicks > 0 && --g.emoteTicks === 0) g.emote = null;

      if (g.state === 'using') {
        // 슬라이드 탑승 — 입구에서 출구로 실제로 이동한다. 서 있기만 하면
        // "미끄럼틀 로직이 자연스럽다"가 성립하지 않는다 (사용자 요구)
        if (g.rideTicks > 0) {
          g.rideTicks--;
          const p = 1 - g.rideTicks / Math.max(1, g.rideTotal);
          const ni = Math.round(g.rideFrom[0] + (g.rideTo[0] - g.rideFrom[0]) * p);
          const nj = Math.round(g.rideFrom[1] + (g.rideTo[1] - g.rideFrom[1]) * p);
          if (ni !== g.i || nj !== g.j) {
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = ni;
            g.j = nj;
            g.progress = 0;
          }
          if (g.rideTicks > 0) continue;
          // 도착 — 출구에 선다
          g.useTicks = 1;
        }
        if (--g.useTicks <= 0) {
          g.rideTotal = 0;
          this.releaseSlot(g);
          const gains = this.tunables.useGains;
          const gain = (gains[Math.min(g.used, gains.length - 1)] ?? 0) as number;
          g.used++;
          // 채운 수요를 기록해 다음엔 다른 종류로 간다
          const usedItem = this.placement.all().find((f) => f.handle === g.usingHandle);
          const usedNeed = usedItem
            ? ((facilityDef(usedItem.defId) as { need?: string } | undefined)?.need ?? '')
            : '';
          if (usedNeed !== '' && !g.usedNeeds.includes(usedNeed)) g.usedNeeds.push(usedNeed);
          g.satisfaction = Math.min(100, g.satisfaction + gain);
          this.finishedWallet += g.wallet;
          this.finishedCount += 1;
          this.setEmote(g, g.satisfaction >= 80 ? 'love' : 'happy');
          this.syncFace(g);
          g.state = g.used >= this.tunables.wantUses ? 'leaving' : 'walking';
          g.pose = 'walk';
        }
        continue;
      }

      if (g.state === 'gone') continue;

      // 목적지 결정
      let field: FlowField | null = null;
      if (g.state === 'leaving') {
        field = this.gateField;
      } else {
        if (g.usingHandle === 0) {
          const target = this.pickTarget(g, rng);
          if (target === null) {
            // 갈 곳이 없다 — 참다가 나간다
            const p = (this.patience.get(g.id) ?? 0) + 1;
            this.patience.set(g.id, p);
            g.satisfaction = Math.max(0, g.satisfaction - this.tunables.waitPenalty);
            // 인내는 유형이 정한다 — 커플·단체는 빨리 지친다 (§10.4)
            if (p > this.tunables.patienceTicks * groupDef(g.group).patience) {
              g.satisfaction = Math.max(0, g.satisfaction - 30);
              this.setEmote(g, 'annoyed');
              this.syncFace(g);
              g.state = 'leaving';
            } else if (p % 60 === 0) {
              this.setEmote(g, 'neutral');
            }
            g.pose = 'idle';
            continue;
          }
          this.patience.delete(g.id);
          // 슬롯을 미리 잡는다 — 도착해서 잡으면 걸어가는 동안 남이 채운다
          if (!this.claimSlot(g, target)) continue;
        }
        field = this.fields.get(g.usingHandle) ?? null;
        if (!field) {
          this.releaseSlot(g);
          continue;
        }
      }
      if (!field) continue;

      // 이동 — ticksPerStep 마다 한 칸
      g.stepAcc++;
      if (g.stepAcc < this.tunables.ticksPerStep) continue;
      g.stepAcc = 0;

      if (field.arrived(g.i, g.j)) {
        if (g.state === 'leaving') {
          this.exited++;
          this.satSum += g.satisfaction;
          if (g.used === 0) this.gaveUp++;
          g.state = 'gone';
        } else {
          g.state = 'using';
          const item = this.placement.all().find((f) => f.handle === g.usingHandle);
          const def = item ? facilityDef(item.defId) : undefined;
          if (item && def?.ride) {
            // 입구로 들어가 출구로 나온다
            g.rideFrom = [item.i + def.ride.entryTile[0], item.j + def.ride.entryTile[1]];
            g.rideTo = [item.i + def.ride.exitTile[0], item.j + def.ride.exitTile[1]];
            g.rideTotal = def.ride.traverseTicks;
            g.rideTicks = def.ride.traverseTicks;
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = g.rideFrom[0];
            g.j = g.rideFrom[1];
            g.progress = 0;
            g.pose = 'ride';
            g.useTicks = 1;
          } else {
            g.useTicks = this.tunables.useTicks;
            g.pose = this.poseFor(g.usingHandle);
          }
        }
        continue;
      }

      const step = field.next(g.i, g.j, g.id & 3);
      if (!step) {
        // 길이 막혔다 — 목적지를 놓고 다시 고른다
        if (g.state !== 'leaving') this.releaseSlot(g);
        g.pose = 'idle';
        continue;
      }
      g.fromI = g.i;
      g.fromJ = g.j;
      g.i = step[0];
      g.j = step[1];
      g.progress = 0;
      g.pose = 'walk';
      // 걷는 만큼 깎인다 — 멀리 놓으면 만족도가 떨어져야 "가깝게"가 판단이 된다
      g.satisfaction = Math.max(0, g.satisfaction - this.tunables.walkPenalty);
      g.facing =
        step[0] > g.fromI ? '+X' : step[0] < g.fromI ? '-X' : step[1] > g.fromJ ? '+Z' : '-Z';
    }

    // 퇴장한 손님 제거
    for (let k = this.guests.length - 1; k >= 0; k--) {
      if ((this.guests[k] as Guest).state === 'gone') {
        this.patience.delete((this.guests[k] as Guest).id);
        this.guests.splice(k, 1);
      }
    }
  }

  /** 시설이 정한 이용 포즈 — 슬롯의 포즈는 렌더 계약이 갖고 있지만 기본값은 층으로 낸다 */
  private poseFor(handle: number): GuestPose {
    const item = this.placement.all().find((f) => f.handle === handle);
    const def = item ? facilityDef(item.defId) : undefined;
    if (!def) return 'idle';
    if (def.layer === 'water') return 'float';
    if (def.id.includes('pool')) return 'swim';
    if (def.id.includes('sunbed') || def.id.includes('jjimjil')) return 'lie';
    if (def.id.includes('cafe') || def.id.includes('pyeongsang') || def.id.includes('sauna')) {
      return 'sit';
    }
    return 'idle';
  }

  /** 렌더 보간용 — 프레임마다 progress 를 밀어 준다 (시뮬 상태를 바꾸지 않는다) */
  advanceRenderProgress(dt: number): void {
    const per = this.tunables.ticksPerStep / 10; // 10Hz 고정 timestep 기준 초
    for (const g of this.guests) {
      if (g.progress < 1) g.progress = Math.min(1, g.progress + dt / per);
    }
  }

  stats(): GuestStats {
    let walking = 0;
    let using = 0;
    let leaving = 0;
    const byGroup: Record<GroupId, number> = { family: 0, couple: 0, friends: 0, company: 0 };
    for (const g of this.guests) {
      if (g.state === 'walking') walking++;
      else if (g.state === 'using') using++;
      else if (g.state === 'leaving') leaving++;
      byGroup[g.group] += 1;
    }
    return {
      alive: this.guests.length,
      byGroup,
      walking,
      using,
      leaving,
      exited: this.exited,
      exitSatisfaction: this.exited === 0 ? 0 : this.satSum / this.exited,
      gaveUp: this.gaveUp,
    };
  }

  /**
   * 이용을 마친 손님들의 지갑 배율 합을 가져가고 **비운다**.
   *
   * 요금 계산이 인원수 대신 이걸 쓰면, 친구·단체가 더 쓴다는 설정이 실제 매출에 나타난다.
   * `usingBefore - usingNow` 로 세던 방식은 같은 tick 에 시작·종료가 겹치면 어긋났다.
   */
  takeFinished(): { count: number; walletSum: number } {
    const out = { count: this.finishedCount, walletSum: this.finishedWallet };
    this.finishedCount = 0;
    this.finishedWallet = 0;
    return out;
  }

  /**
   * 어떤 칸에서 그 시설까지 몇 걸음인가. 못 가면 −1.
   *
   * 진단·검증용이다 — "덱을 놓으면 물 위 시설에 갈 수 있게 된다"를 손님 60명의 선택에
   * 의존하지 않고 직접 확인할 수 있다. 거리장을 아직 안 만들었으면 만든다.
   */
  distanceTo(handle: number, i: number, j: number): number {
    if (this.dirty) this.rebuildFields();
    return this.fields.get(handle)?.distAt(i, j) ?? -1;
  }

  /** 시설별 점유 슬롯 — 렌더가 "칸마다 손님"을 그리는 근거 */
  occupancy(handle: number): readonly number[] {
    return this.claims.get(handle)?.slots ?? [];
  }
}
