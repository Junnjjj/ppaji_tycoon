/**
 * 손님 색·비례 상수 — 스프라이트 아틀라스(guest-sprite.ts)와 코스 탑승객(course-view.ts)이
 * 같은 값을 쓴다.
 *
 * 옛 앰비언트 3D 군중 시스템(makeGuests)은 삭제했다 — 옛 지형 좌표(PARK)에 붙박이였고,
 * 손님은 이제 전부 sim 이 만들고 스프라이트로 그린다.
 */

export const VEST = ['#ff8c42', '#ff8c42', '#ff9d52', '#ffa832'];
export const SKIN = ['#ffc07a', '#ffbb70', '#f5a862'];
export const HAIR = ['#4a3826', '#3a2a1c', '#5c422a'];
export const SHORT = ['#2e5972', '#3d8fd6', '#1e3348', '#ef4b4b'];

/** 치비 비례 — 머리가 전체 높이의 ~43%. 값 하나를 바꾸면 아래 오프셋 전부가 따라간다. */
// ⚠ 폭이 3px 이하면 외곽선 패스(pixelate.ts 의 sil)가 양옆 컬럼을 먹어버려
// 가운데 1px 만 색으로 남는다 — 손님이 어두운 점이 되는 진짜 원인이었다.
// 조끼 폭은 최소 2.4 월드(≈3.7 논리px)를 유지할 것.
export const G = {
  shortsY: 0.95, shortsH: 1.1, shortsW: 2.2, shortsD: 1.45,
  vestY: 2.35, vestH: 1.7, vestW: 2.5, vestD: 1.6,
  // headR 1.25 는 머리가 커다란 살구색 덩어리로 읽혔다 (p7). 1.15 가 상한.
  headY: 4.15, headR: 1.15,
  // 머리칼은 정수리 위 35% 만 덮는 얇은 캡. 이보다 크면 부감 시점에서
  // 머리 전체가 갈색으로 덮여 얼굴이 사라진다.
  hairR: 0.95, hairDY: 0.72, hairDZ: -0.34,
  armR: 0.55,
};

