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
import { KAIRO } from './kairo-contract.js';
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
