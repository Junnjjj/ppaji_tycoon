import { describe, it, expect } from 'vitest';
import {
  GUEST_W,
  GUEST_H,
  POSE_SHEET,
  FACES,
  PALETTES,
  bodyFrame,
  faceFrame,
  assertGuestContract,
  type Pose,
} from './kairo-guest-sprite.js';
import { KAIRO, allSimFacilities } from './kairo-contract.js';
import { TILE_H } from '../render/kairo/iso.js';

describe('손님 스프라이트 계약 — 나중에 아틀라스로 갈아끼울 때 배치가 안 틀어지게', () => {
  it('계약 위반이 없다', () => {
    expect(assertGuestContract()).toEqual([]);
  });

  it('셀이 14×24 이고 키가 타일 높이의 1.5배다', () => {
    expect([GUEST_W, GUEST_H]).toEqual([14, 24]);
    expect(GUEST_H / TILE_H).toBeCloseTo(1.5, 2);
  });

  it('포즈 7종이 계약과 같다', () => {
    expect(Object.keys(POSE_SHEET).sort()).toEqual([...KAIRO.guest.poses].sort());
  });

  it('포즈별 프레임·방향이 스펙 §2.2 표와 같다', () => {
    const want: Record<Pose, [number, number]> = {
      idle: [2, 4],
      walk: [4, 4],
      swim: [2, 2],
      float: [2, 1],
      sit: [1, 4],
      lie: [1, 2],
      ride: [1, 4],
    };
    for (const [pose, [frames, facings]] of Object.entries(want) as [Pose, [number, number]][]) {
      expect(POSE_SHEET[pose].frames, pose).toBe(frames);
      expect(POSE_SHEET[pose].facings.length, pose).toBe(facings);
    }
  });

  it('팔레트당 40셀 — 스펙이 센 값과 같다', () => {
    let n = 0;
    for (const pose of Object.keys(POSE_SHEET) as Pose[]) {
      n += POSE_SHEET[pose].frames * POSE_SHEET[pose].facings.length;
    }
    expect(n).toBe(40);
  });

  it('팔레트 8종이고 구명조끼가 전부 주황 계열이다 — 통일감', () => {
    expect(PALETTES).toHaveLength(8);
    for (const p of PALETTES) {
      const v = parseInt(p.vest.slice(1), 16);
      const r = (v >> 16) & 255;
      const g = (v >> 8) & 255;
      const b = v & 255;
      expect(r, p.vest).toBeGreaterThan(200); // 빨강 우세
      expect(g, p.vest).toBeGreaterThan(100);
      expect(b, p.vest).toBeLessThan(110); // 파랑 낮음 = 주황
    }
  });

  it('표정 4종 · 이모트 6종', () => {
    expect(FACES).toEqual(['calm', 'happy', 'annoyed', 'tired']);
    expect(KAIRO.guest.emotes).toHaveLength(6);
  });

  it('프레임 이름이 유일하다 — 겹치면 조용히 잘못된 셀을 그린다', () => {
    const names = new Set<string>();
    for (let p = 0; p < PALETTES.length; p++) {
      for (const pose of Object.keys(POSE_SHEET) as Pose[]) {
        for (const facing of POSE_SHEET[pose].facings) {
          for (let f = 0; f < POSE_SHEET[pose].frames; f++) {
            const k = bodyFrame(p, pose, facing, f);
            expect(names.has(k), k).toBe(false);
            names.add(k);
          }
        }
      }
    }
    expect(names.size).toBe(PALETTES.length * 40);
    const faceNames = new Set<string>();
    for (const face of FACES) {
      for (const facing of ['+X', '+Z', '-X', '-Z'] as const) {
        faceNames.add(faceFrame(face, facing));
      }
    }
    expect(faceNames.size).toBe(16);
  });

  it('표정은 포즈와 직교한다 — 곱하면 1,280셀, 오버레이면 16셀', () => {
    const multiplied = PALETTES.length * 40 * FACES.length;
    const orthogonal = PALETTES.length * 40 + FACES.length * 4;
    expect(multiplied).toBe(1280);
    expect(orthogonal).toBe(336);
    expect(orthogonal).toBeLessThan(multiplied / 3);
  });

  it('브라우저 밖에서는 굽지 않는다 — sim 은 에셋에 의존하지 않는다', async () => {
    const { bakeGuestAtlas } = await import('./kairo-guest-sprite.js');
    expect(() => bakeGuestAtlas()).toThrow(/브라우저/);
  });
});

/**
 * 데이터의 포즈는 **굽는 그림 중에서만** 나와야 한다 (K52 뒤).
 *
 * `validateContracts` 도 포즈 이름을 보지만 대조 상대가 **렌더 계약의 이름표**
 * (`KAIRO.guest.poses`)다. 이름표와 `POSE_SHEET`(실제로 굽는 셀 목록)가 갈라지면
 * 계약 검사는 통과하는데 화면은 프레임을 못 찾아 **조용히 폴백**한다. 그래서 여기서는
 * **실물로** 재고, 이름표가 실물과 같은 목록인지를 같은 자리에서 못 박는다.
 */
describe('슬롯 포즈 — 그림이 있는 것만 (75종 전부)', () => {
  /** 그림이 실제로 있는가 — `KairoScene.syncGuest` 가 프레임을 찾는 것과 같은 질문 */
  const drawn = (pose: string, facing: string): boolean => {
    const sheet = (POSE_SHEET as Record<string, { frames: number; facings: string[] }>)[pose];
    return !!sheet && sheet.frames > 0 && sheet.facings.includes(facing);
  };

  it('★ 이름표(렌더 계약)와 실물(POSE_SHEET)이 같은 목록이다', () => {
    // 갈라지면 아래 검사와 `validateContracts` 가 서로 다른 답을 내기 시작한다
    expect([...KAIRO.guest.poses].sort()).toEqual(Object.keys(POSE_SHEET).sort());
  });

  it('★ 모든 슬롯의 포즈가 POSE_SHEET 에 있다', () => {
    const bad: string[] = [];
    let facilities = 0;
    let slots = 0;
    for (const f of allSimFacilities()) {
      facilities++;
      for (const s of f.slots ?? []) {
        slots++;
        const sheet = (POSE_SHEET as Record<string, unknown>)[s.pose];
        if (!sheet) bad.push(`${f.id}: 굽지 않는 포즈 ${s.pose}`);
      }
    }
    // 아무것도 안 재는 검사가 되지 않게 — 세는 대상이 실제로 있다
    expect(facilities).toBe(75);
    expect(slots).toBeGreaterThan(150);
    expect(bad).toEqual([]);
  });

  it('★ 슬롯의 (포즈, 방향) 조합에 셀이 있다 — 없으면 화면이 조용히 폴백한다', () => {
    /*
     * ⚠ **회전(facing=1)은 안 잰다.** `slotTileOf` 가 `+Z → +X` 로 거울을 치는데
     * `float` 시트에는 `+X` 가 없다 — 그건 데이터 오류가 아니라 렌더가 `sheet.facings[0]`
     * 으로 받아 주기로 한 **의도된 축약**이다 (물속은 방향 2·1로 줄였다).
     * 여기서 재는 것은 **데이터가 적은 그대로의 조합**이다.
     */
    const bad: string[] = [];
    for (const f of allSimFacilities()) {
      for (const s of f.slots ?? []) {
        if (!drawn(s.pose, s.facing)) bad.push(`${f.id}: ${s.pose}/${s.facing} 셀 없음`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('★ 음성 대조군 — 없는 포즈·방향은 같은 술어에 잡힌다', () => {
    expect(drawn('idle', '+Z')).toBe(true);
    expect(drawn('dance', '+Z')).toBe(false); // 굽지 않는 포즈
    expect(drawn('float', '-X')).toBe(false); // 있는 포즈인데 그 방향 셀이 없다
  });
});
