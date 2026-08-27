/**
 * 카이로 물리 4방향의 순수 격자 변환.
 *
 * 시뮬(`placement.ts`)과 렌더 검증 스프라이트(`kairo-procedural.ts`)가 모두 이 함수를
 * 쓴다. 둘 중 한쪽에 회전식을 복사하면 슬롯·입구와 그림이 다시 갈라질 수 있으므로
 * 여기 외에는 물리 d0–d3 오프셋 산수를 만들지 않는다.
 *
 * Blender 축 계약은 game +I = +X, game +J = -Y, height = +Z 이다. 따라서 root +Z
 * 90°를 발자국의 음수 좌표가 없도록 옮긴 결과가 d1 `(dj,w-1-di)`다.
 */

export type KairoQuarterTurn = 0 | 1 | 2 | 3;

/** 홀수 quarter-turn은 발자국의 두 축을 맞바꾼다. */
export function quarterTurnSize(
  size: readonly [number, number],
  turn: KairoQuarterTurn,
): [number, number] {
  return turn % 2 === 1 ? [size[1], size[0]] : [size[0], size[1]];
}

/** 발자국 안 오프셋 `(di,dj)`에 Blender root +Z quarter-turn을 건다. */
export function quarterTurnOffset(
  size: readonly [number, number],
  offset: readonly [number, number],
  turn: KairoQuarterTurn,
): [number, number] {
  const [w, d] = size;
  const [di, dj] = offset;
  if (turn === 0) return [di, dj];
  if (turn === 1) return [dj, w - 1 - di];
  if (turn === 2) return [w - 1 - di, d - 1 - dj];
  return [d - 1 - dj, di];
}
