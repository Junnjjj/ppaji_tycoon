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
import { TILE_W, TILE_H, STEP_X, STEP_Y, GRID_W, GRID_H, gridExtent } from '../render/kairo/iso.js';
import { KairoProceduralProvider, drawBackdrop } from './kairo-procedural.js';
import { GROUND_KINDS, BRIDGE_KINDS } from '../sim/kairo/terrain.js';

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
    // 격자를 넓히고 계약의 맵 크기를 잊으면 에셋 쪽 계산이 조용히 어긋난다 (K25)
    const e = gridExtent();
    expect(KAIRO.presentation.mapTexels).toEqual([e.x, e.y]);
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

  it('명세 수 = 시설 73 + 벽 1(경계 4변형) + 문 1(4변형) + 지면 10 + 다리 2 + 배경 3 + 데코 8', () => {
    // 지면: K36 에서 도시 띠 3종 · K37 에서 암반 1종이 늘었다
    expect(specs).toHaveLength(73 + 1 + 1 + 10 + 2 + 3 + 8);
  });

  it('배경은 3겹이고 가로 타일 폭이 계약값이다 — 산·능선·강둑 (K36-B)', () => {
    const back = specs.filter((s) => s.id.startsWith("backdrop/"));
    expect(back).toHaveLength(3);
    expect(back.map((b) => b.id)).toEqual([
      'backdrop/mountain',
      'backdrop/ridge',
      'backdrop/farbank',
    ]);
    for (const b of back) expect(b.size[0]).toBe(KAIRO.backdrop.tileTexels);
  });

  it('카이로 스프라이트 앵커는 전부 bottom-center 다', () => {
    for (const s of specs) expect(s.anchor).toBe('bottom-center');
  });

  it('ID 가 유일하다', () => {
    expect(new Set(specs.map((s) => s.id)).size).toBe(specs.length);
  });

  it('벽 캔버스는 32×26 — 다이아몬드 16 + 높이 10 (K27 에서 낮췄다)', () => {
    const w = specs.find((s) => s.id === 'wall/edge')!;
    expect(w.size).toEqual([TILE_W, TILE_H + KAIRO.wall.heightTexels]);
    expect(w.size).toEqual([32, 26]);
  });

  it('⚠ 벽은 손님보다 낮다 — 이게 진짜 지켜야 할 계약이다 (K27)', () => {
    /*
     * 예전 계약은 거꾸로였다: "실내 시설은 벽보다 낮아야 한다". 벽이 24텍셀(타일 1.5개)
     * 이던 시절의 규칙인데, 그러면 앞쪽 벽이 시설과 손님을 **완전히 가린다** — 벽을
     * 유리 스티플로 만든 이유도 그 가림이었다. 벽을 낮추면 가림 자체가 사라진다.
     */
    expect(KAIRO.wall.heightTexels).toBeLessThan(KAIRO.guest.cellTexels[1]);
    expect(KAIRO.wall.heightTexels).toBeLessThan(TILE_H);
  });

  it('벽은 경계 4방 × (벽·문) = 8장뿐이다 — 마스크 16장 시절보다 10장 적다 (K25)', () => {
    const walls = specs.filter((s) => s.id.startsWith('wall/'));
    expect(walls).toHaveLength(2);
    expect(walls.map((w) => w.variants?.alt)).toEqual([4, 4]);
    expect(KAIRO.wall.edgeNames).toHaveLength(4);
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
  it('지면 10종 × 3변형 + 다리 2 = 32장', () => {
    const n =
      KAIRO.ground.types.reduce((a, t) => a + t.alts, 0) + KAIRO.ground.bridges.length;
    expect(n).toBe(32);
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

  it('변형을 펼친 **이미지** 총계가 124장이다 = 시설 73 + 벽 8 + 지면 32 + 배경 3 + 데코 8', () => {
    expect(new KairoProceduralProvider().ids).toHaveLength(124);
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

describe('지면 — 렌더/시뮬 목록이 일치한다', () => {
  it('종류 목록이 같다 — 한쪽만 늘리면 칠할 수 있는데 그림이 없는 종류가 생긴다', () => {
    const r = KAIRO.ground.types.map((t) => t.id).sort();
    const s = GROUND_KINDS.map((k) => k.id).sort();
    expect(r).toEqual(s);
  });

  it('다리 목록이 같다', () => {
    expect(KAIRO.ground.bridges.map((b) => b.id).sort()).toEqual(
      BRIDGE_KINDS.map((b) => b.id).sort(),
    );
  });

  it('walkable 은 시뮬 데이터에만 있다 — 렌더 계약에 있으면 SSoT 가 둘이 된다', () => {
    for (const t of KAIRO.ground.types) expect(t).not.toHaveProperty('walkable');
    for (const k of GROUND_KINDS) expect(typeof k.walkable).toBe('boolean');
  });
});

/**
 * 배경 띠의 **가로 이음새** — 노드에서 잰다.
 *
 * `npm run seam` 은 지면 타일과 방향 런만 본다 (배경은 격자가 아니라 `TileSprite` 라
 * 4방 이음새 개념이 없다). 그런데 배경은 GPU wrap 으로 **좌우가 맞닿으므로**, 끝이
 * 안 맞으면 카메라를 미는 순간 세로 줄이 보인다. 브라우저 검사(`verify:kairo`)가
 * 이걸 재지만, 겹을 더할 때마다 브라우저를 띄워야 알게 되면 늦다.
 *
 * 노드에는 캔버스가 없으므로 `fillRect` 만 받아 적는 최소 컨텍스트를 태운다 —
 * `drawBackdrop` 이 쓰는 API 가 `fillStyle` 과 `fillRect` 뿐이라 성립한다.
 */
describe('배경 띠가 가로로 이어진다', () => {
  const LAYERS = ['backdrop/mountain', 'backdrop/ridge', 'backdrop/farbank'];

  /** 색 이름만 기록하는 격자 — 실제 캔버스가 아니어도 이음새는 잴 수 있다 */
  function bake(id: string): { px: (string | null)[]; w: number; h: number } {
    const spec = kairoSpriteSpecs().find((s) => s.id === id);
    if (!spec) throw new Error(`명세 없음: ${id}`);
    const [w, h] = spec.size;
    const px: (string | null)[] = new Array(w * h).fill(null);
    const g = {
      fillStyle: '',
      fillRect(x: number, y: number, rw: number, rh: number) {
        for (let j = Math.round(y); j < Math.round(y + rh); j++) {
          for (let i = Math.round(x); i < Math.round(x + rw); i++) {
            if (i < 0 || j < 0 || i >= w || j >= h) continue;
            px[j * w + i] = g.fillStyle;
          }
        }
      },
    };
    drawBackdrop(g as unknown as CanvasRenderingContext2D, spec, id.split('/')[1] as string);
    return { px, w, h };
  }

  /** 두 열이 몇 행에서 다른가 */
  function colDiff(b: { px: (string | null)[]; w: number; h: number }, a: number, c: number): number {
    let n = 0;
    for (let y = 0; y < b.h; y++) if (b.px[y * b.w + a] !== b.px[y * b.w + c]) n++;
    return n;
  }

  /**
   * 이음새 판정 — **고정 임계값을 쓰지 않는다.**
   *
   * "몇 행까지 달라도 되나"는 그림마다 다르다 (강둑에는 나무 실루엣이 있다). 그래서
   * 이웃 열끼리의 최대 차이를 자로 삼는다 — 좌우 끝이 그 자를 넘지 않으면, 이음새는
   * 그림 안의 아무 자리와 구별되지 않는다는 뜻이다.
   */
  function verdict(b: { px: (string | null)[]; w: number; h: number }): {
    seam: number;
    interiorMax: number;
  } {
    let interiorMax = 0;
    for (let x = 0; x + 1 < b.w; x++) interiorMax = Math.max(interiorMax, colDiff(b, x, x + 1));
    return { seam: colDiff(b, b.w - 1, 0), interiorMax };
  }

  it('세 겹 모두 좌우 끝이 그림 안쪽만큼만 다르다', () => {
    for (const id of LAYERS) {
      const v = verdict(bake(id));
      expect({ id, ...v, ok: v.seam <= v.interiorMax }).toEqual({ ...v, id, ok: true });
    }
  });

  it('음성 대조군 — 주기가 폭에 안 맞는 그림을 주입하면 판정이 뒤집힌다', () => {
    const b = bake('backdrop/mountain');
    const clean = verdict(b);
    expect(clean.seam).toBeLessThanOrEqual(clean.interiorMax);
    /*
     * 왼쪽에서 오른쪽으로 12텍셀 **기울인다.** 이게 "주기가 폭의 약수가 아니다"의 축소판이다 —
     * 이웃 열끼리는 최대 1텍셀만 어긋나 그림 안쪽은 멀쩡해 보이는데, 좌우 끝만 12텍셀
     * 벌어진다. 끝 열 하나를 갈아 끼우는 식으로 주입하면 그 열의 **이웃도** 같이 망가져서
     * 자(interiorMax)가 같이 올라가 버려 아무것도 안 잡힌다 (실제로 겪었다).
     */
    const src = b.px.slice();
    for (let x = 0; x < b.w; x++) {
      const shift = Math.round((x * 12) / (b.w - 1));
      for (let y = 0; y < b.h; y++) {
        const from = y - shift;
        b.px[y * b.w + x] = from >= 0 ? (src[from * b.w + x] as string | null) : null;
      }
    }
    const broken = verdict(b);
    expect(broken.seam).toBeGreaterThan(broken.interiorMax);
  });

  it('빈 열이 없다 — 한 열이라도 비면 반복할 때 세로 틈이 보인다', () => {
    for (const id of LAYERS) {
      const b = bake(id);
      for (let x = 0; x < b.w; x++) {
        let any = false;
        for (let y = 0; y < b.h; y++) if (b.px[y * b.w + x]) { any = true; break; }
        expect({ id, x, any }).toEqual({ id, x, any: true });
      }
    }
  });
});

/**
 * 대기 원근 — **먼 겹일수록 흐리다.** 이게 안 지켜지면 겹을 더해도 거리로 안 읽힌다.
 */
describe('산 겹이 능선보다 멀어 보인다 (K36-B)', () => {
  function tones(id: string): { lum: number; hasOutline: boolean } {
    const spec = kairoSpriteSpecs().find((s) => s.id === id);
    if (!spec) throw new Error(`명세 없음: ${id}`);
    const seen = new Map<string, number>();
    const g = {
      fillStyle: '',
      fillRect(_x: number, _y: number, w: number, h: number) {
        seen.set(g.fillStyle, (seen.get(g.fillStyle) ?? 0) + Math.max(1, w) * Math.max(1, h));
      },
    };
    drawBackdrop(g as unknown as CanvasRenderingContext2D, spec, id.split('/')[1] as string);
    let sum = 0;
    let n = 0;
    let hasOutline = false;
    for (const [hex, count] of seen) {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
      if (hex.toLowerCase() === '#2b1d12') hasOutline = true;
      const r = parseInt(hex.slice(1, 3), 16);
      const gg = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      sum += (0.2126 * r + 0.7152 * gg + 0.0722 * b) * count;
      n += count;
    }
    return { lum: sum / Math.max(1, n), hasOutline };
  }

  it('산 > 능선 > 강둑 순으로 밝다 — 멀수록 하늘에 녹는다', () => {
    const m = tones('backdrop/mountain').lum;
    const r = tones('backdrop/ridge').lum;
    const f = tones('backdrop/farbank').lum;
    expect(m).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(f);
  });

  it('산에는 검은 아웃라인이 없다 — 가장 먼 겹에 진한 선을 두르면 앞으로 튀어나온다', () => {
    expect(tones('backdrop/mountain').hasOutline).toBe(false);
    // 음성 대조군: 가까운 겹들은 실제로 아웃라인을 두른다 (검사가 상수만 보는 게 아니다)
    expect(tones('backdrop/ridge').hasOutline).toBe(true);
    expect(tones('backdrop/farbank').hasOutline).toBe(true);
  });
});
