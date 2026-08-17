import { Rng } from '../rng.js';
import { FlowField } from '../pathfield.js';
import type { KairoTerrain } from './terrain.js';
import { type WallGrid } from './walls.js';
import { PlacementGrid, facilityDef } from './placement.js';

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
}

export const GUEST_DEFAULTS: GuestTunables = {
  maxGuests: 60,
  ticksPerStep: 4,
  useTicks: 40,
  wantUses: 4,
  patienceTicks: 300,
  emoteTicks: 30,
};

export interface GuestStats {
  alive: number;
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

  private exited = 0;
  private satSum = 0;
  private gaveUp = 0;
  private patience = new Map<number, number>();

  constructor(
    private readonly terrain: KairoTerrain,
    private readonly walls: WallGrid,
    private readonly placement: PlacementGrid,
    private readonly gate: { i: number; j: number },
    readonly tunables: GuestTunables = GUEST_DEFAULTS,
  ) {}

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

  private walkable = (i: number, j: number): boolean =>
    this.terrain.isWalkable(i, j) && !this.walls.blocks(i, j);

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
          if (this.placement.handleAt(ni, nj) !== 0) continue;
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

  /** 슬롯이 남은 시설 중 가까운 곳. 없으면 null */
  private pickTarget(g: Guest, rng: Rng): number | null {
    const cands: { handle: number; dist: number }[] = [];
    for (const [handle, field] of this.fields) {
      const c = this.slotsOf(handle);
      if (!c || c.slots.every((s) => s !== 0)) continue;
      const d = field.distAt(g.i, g.j);
      if (d < 0) continue;
      cands.push({ handle, dist: d });
    }
    if (cands.length === 0) return null;
    // 가까운 순으로 정렬하고 상위 3개 중 하나를 뽑는다 — 전부 최단거리로 몰리면
    // 한 시설에만 줄이 서고 나머지가 비어 "배치가 결과를 바꾼다"가 흐려진다
    cands.sort((a, b) => a.dist - b.dist || a.handle - b.handle);
    const top = cands.slice(0, Math.min(3, cands.length));
    return (top[rng.int(top.length)] as { handle: number }).handle;
  }

  /** 손님 한 명 입장. 게이트가 못 걷는 칸이면 실패 */
  spawn(rng: Rng): Guest | null {
    if (this.guests.length >= this.tunables.maxGuests) return null;
    if (!this.walkable(this.gate.i, this.gate.j)) return null;
    const g: Guest = {
      id: this.nextId++,
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
      satisfaction: 50,
      used: 0,
      stepAcc: 0,
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
        if (--g.useTicks <= 0) {
          this.releaseSlot(g);
          g.used++;
          g.satisfaction = Math.min(100, g.satisfaction + 12);
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
            if (p > this.tunables.patienceTicks) {
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
          g.useTicks = this.tunables.useTicks;
          g.pose = this.poseFor(g.usingHandle);
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
    for (const g of this.guests) {
      if (g.state === 'walking') walking++;
      else if (g.state === 'using') using++;
      else if (g.state === 'leaving') leaving++;
    }
    return {
      alive: this.guests.length,
      walking,
      using,
      leaving,
      exited: this.exited,
      exitSatisfaction: this.exited === 0 ? 0 : this.satSum / this.exited,
      gaveUp: this.gaveUp,
    };
  }

  /** 시설별 점유 슬롯 — 렌더가 "칸마다 손님"을 그리는 근거 */
  occupancy(handle: number): readonly number[] {
    return this.claims.get(handle)?.slots ?? [];
  }
}
