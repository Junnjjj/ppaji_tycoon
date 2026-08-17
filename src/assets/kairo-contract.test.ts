import { describe, it, expect } from 'vitest';
import {
  KAIRO,
  KAIRO_SIM,
  allSimFacilities,
  renderSpec,
  simSpec,
  slotOffset,
  kairoSpriteSpecs,
  validateContracts,
} from './kairo-contract.js';
import { TILE_W, TILE_H, STEP_X, STEP_Y, GRID_W, GRID_H } from '../render/kairo/iso.js';
import { KairoProceduralProvider } from './kairo-procedural.js';

describe('계약 정합 — 이게 깨지면 에셋을 뽑아도 못 쓴다', () => {
  it('위반이 하나도 없다', () => {
    expect(validateContracts()).toEqual([]);
  });

  it('시설 73종이 양쪽에 다 있다', () => {
    expect(allSimFacilities()).toHaveLength(73);
    expect(KAIRO.facilities).toHaveLength(73);
  });

  it('렌더 계약의 투영 상수가 iso.ts 와 같다', () => {
    expect(KAIRO.projection.tileTexels).toEqual([TILE_W, TILE_H]);
    expect(KAIRO.projection.stepScreenTexels).toEqual([STEP_X, STEP_Y]);
    expect(KAIRO.presentation.grid).toEqual([GRID_W, GRID_H]);
  });

  it('업스케일 단이 정수뿐이다 — 비정수 배율이 도트를 깬다', () => {
    for (const s of KAIRO.presentation.upscaleSteps) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('계약이 둘로 쪼개져 있다 — 불변식 1', () => {
  it('시뮬 데이터에 렌더 전용 필드가 없다', () => {
    for (const f of allSimFacilities()) {
      expect(f).not.toHaveProperty('canvas');
      expect(f).not.toHaveProperty('anchorTexel');
      expect(f).not.toHaveProperty('bodyH');
      expect(f).not.toHaveProperty('slots');
    }
  });

  it('렌더 계약에 시뮬 전용 필드가 없다', () => {
    for (const f of KAIRO.facilities) {
      expect(f).not.toHaveProperty('size');
      expect(f).not.toHaveProperty('capacity');
      expect(f).not.toHaveProperty('placement');
    }
  });

  it('sprite 문자열이 둘을 잇는다', () => {
    for (const f of allSimFacilities()) {
      expect(renderSpec(f.sprite)?.sprite).toBe(f.sprite);
      expect(f.sprite).toBe(`facility/${f.id}`);
    }
  });
});

describe('슬롯 — 칸마다 손님이 보이는 게 카이로의 영리한 설계', () => {
  it('N×1 연립은 칸이 한 줄로 행진한다', () => {
    const shower = renderSpec('facility/shower_row')!;
    expect(shower.slots.map((s) => s.tile)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it('연립 슬롯 오프셋이 타일 한 걸음씩 벌어진다', () => {
    const shower = renderSpec('facility/shower_row')!;
    const fp = simSpec('shower_row')!.size;
    const o = shower.slots.map((s) => slotOffset(s, fp));
    for (let k = 1; k < o.length; k++) {
      expect(o[k]!.x - o[k - 1]!.x).toBe(STEP_X);
      expect(o[k]!.y - o[k - 1]!.y).toBe(STEP_Y);
    }
  });

  it('슬롯 오프셋이 항상 정수다 — 반 픽셀 밀림 방지', () => {
    for (const f of KAIRO.facilities) {
      const sim = KAIRO_SIM[f.sprite.split('/')[1]!]!;
      for (const s of f.slots) {
        const o = slotOffset(s, sim.size);
        expect(Number.isInteger(o.x)).toBe(true);
        expect(Number.isInteger(o.y)).toBe(true);
      }
    }
  });

  it('한 타일에 둘이면 offsetTexel 로 갈라진다 — 파라솔 1×1 에 2인', () => {
    const p = renderSpec('facility/parasol')!;
    expect(p.slots).toHaveLength(2);
    expect(p.slots[0]!.tile).toEqual(p.slots[1]!.tile);
    const fp = simSpec('parasol')!.size;
    expect(slotOffset(p.slots[0]!, fp).x).not.toBe(slotOffset(p.slots[1]!, fp).x);
  });

  it('슬롯 총계가 185 다', () => {
    const n = KAIRO.facilities.reduce((a, f) => a + f.slots.length, 0);
    expect(n).toBe(185);
  });
});

describe('슬라이드 입출구', () => {
  it('슬라이드류 4종이 entry/exit 를 선언한다', () => {
    const rides = KAIRO.facilities.filter((f) => f.ride);
    expect(rides).toHaveLength(4);
    for (const r of rides) {
      expect(r.ride!.ridePose).toBe('ride');
      expect(r.ride!.entryTile).not.toEqual(r.ride!.exitTile);
    }
  });
});

describe('기존 에셋 레이어로 펼쳐진다 — 새 프로바이더를 만들지 않는다', () => {
  const specs = kairoSpriteSpecs();

  it('명세 수 = 시설 73 + 벽 1(마스크 16 변형) + 문 2 + 지면 6 + 다리 2 + 데코 8', () => {
    expect(specs).toHaveLength(73 + 1 + 2 + 6 + 2 + 8);
  });

  it('카이로 스프라이트 앵커는 전부 bottom-center 다', () => {
    for (const s of specs) expect(s.anchor).toBe('bottom-center');
  });

  it('ID 가 유일하다', () => {
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
  });

  it('벽 캔버스는 32×40 — 1×1 발자국 다이아몬드 16 + 높이 24', () => {
    const w = specs.find((s) => s.id === 'wall/glass')!;
    expect(w.size).toEqual([TILE_W, TILE_H + KAIRO.wall.heightTexels]);
    expect(w.size).toEqual([32, 40]);
  });
});

describe('손님 계약', () => {
  it('셀 14×24, 포즈 7, 이모트 6, 방향 4', () => {
    expect(KAIRO.guest.cellTexels).toEqual([14, 24]);
    expect(KAIRO.guest.poses).toHaveLength(7);
    expect(KAIRO.guest.emotes).toHaveLength(6);
    expect(KAIRO.guest.facings).toBe(4);
    expect(KAIRO.guest.facingNames).toHaveLength(4);
  });

  it('키가 타일 높이의 1.5배다 — 카이로 실측 1.43', () => {
    expect(KAIRO.guest.cellTexels[1] / TILE_H).toBeCloseTo(1.5, 2);
  });

  it('아웃라인을 베이크한다 — 줄 서면 덩어리로 뭉치는 걸 막는다', () => {
    expect(KAIRO.guest.outline.baked).toBe(true);
    expect(KAIRO.guest.outline.widthTexels).toBe(1);
  });
});

describe('지면·데코가 계약에 있다 — v1 은 길에 0장을 줬다', () => {
  it('지면 6종 × 3변형 + 다리 2 = 20장', () => {
    const n =
      KAIRO.ground.types.reduce((a, t) => a + t.alts, 0) + KAIRO.ground.bridges.length;
    expect(n).toBe(20);
  });

  it('지면 타일 캔버스가 다이아몬드 정확히 32×16 이다', () => {
    expect(KAIRO.ground.canvas).toEqual([TILE_W, TILE_H]);
    expect(KAIRO.ground.anchorTexel).toEqual([TILE_W / 2, TILE_H]);
  });

  it('콤보 데코 8장 — 안전 4 · 경관 4', () => {
    expect(KAIRO.deco.items).toHaveLength(8);
    expect(KAIRO.deco.items.filter((d) => d.kind === 'safety')).toHaveLength(4);
    expect(KAIRO.deco.items.filter((d) => d.kind === 'scenery')).toHaveLength(4);
  });

  it('변형을 펼친 **이미지** 총계가 119장이다 = 시설 73 + 벽 18 + 지면 20 + 데코 8', () => {
    expect(new KairoProceduralProvider().ids).toHaveLength(119);
  });
});

describe('플레이스홀더 드로어 — 계약에 추가하고 드로어를 잊는 사고 방지', () => {
  it('드로어가 빠진 스프라이트가 없다', () => {
    expect(KairoProceduralProvider.missingDrawers()).toEqual([]);
  });

  it('변형까지 펼친 최종 ID 가 유일하다', () => {
    const p = new KairoProceduralProvider();
    expect(new Set(p.ids).size).toBe(p.ids.length);
  });

  it('모든 최종 ID 의 명세를 조회할 수 있다', () => {
    const p = new KairoProceduralProvider();
    for (const id of p.ids) {
      const s = p.spec(id);
      expect(s, id).toBeDefined();
      expect(s!.anchor).toBe('bottom-center');
    }
  });

  it('플레이스홀더 캔버스가 계약 크기와 정확히 같다 — 나중에 실물로 바꿀 때 배치가 안 틀어지게', () => {
    const p = new KairoProceduralProvider();
    for (const f of KAIRO.facilities) {
      expect(p.spec(f.sprite)!.size, f.sprite).toEqual([f.canvas[0], f.canvas[1]]);
    }
  });
});
