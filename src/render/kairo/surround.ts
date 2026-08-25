export interface SurroundDecoration {
  id: 'deco/banner' | 'deco/planter_row' | 'deco/sculpture';
  i: number;
  j: number;
}

/**
 * 플레이 격자 밖의 낮은 위험 장식. 고정된 소수 좌표라 결정론적이고, surround 캔버스에
 * 부팅 때 한 번 합성되어 Phaser 런타임 오브젝트나 갱신 비용을 만들지 않는다.
 */
export function surroundDecorationPlan(width: number, height: number): SurroundDecoration[] {
  const midI = Math.floor(width / 2);
  const midJ = Math.floor(height / 2);
  return [
    { id: 'deco/banner', i: midI - 12, j: -3 },
    { id: 'deco/banner', i: midI + 12, j: -3 },
    { id: 'deco/planter_row', i: midI - 5, j: -2 },
    { id: 'deco/planter_row', i: midI + 5, j: -2 },
    { id: 'deco/sculpture', i: -3, j: midJ - 8 },
    { id: 'deco/sculpture', i: width + 2, j: midJ + 8 },
  ];
}

