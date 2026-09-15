/**
 * P57-g — UI 배율(태블릿·데스크톱). 폰 393×852 이 1 이고 화면이 넓어질수록 DOM UI(헤더·창·독·버튼)를 통째로 키운다 —
 * 카이로 태블릿처럼 「버튼이 폰 크기 그대로 작게 남는」 것을 막는다(사용자 실측 1209×975: 버튼이 모바일 크기). 지도 배율(S)은 별개(핀치).
 *   z = clamp(1, min(0.8·√(넓이비), vh/600, vw/520), 2)
 *   · 넓이비 = (vw·vh)/(393·852) — 가로·세로 어느 한쪽만 길어도 과하게 안 커진다
 *   · vh/600: 배율 뒤 세로가 600 CSS px 은 남아야 창(max-height 100vh−140)이 숨을 쉰다 · vw/520: 열(--ui-max)이 화면을 안 넘는다
 * 적용은 CSS `zoom: var(--ui-zoom)`(UI 뿌리 10곳) — `--ui-side` 는 배율 안에서 계산되므로 100vw 를 z 로 나눈다.
 */
export const UI_MAX = 520;
export function uiZoom(vw: number, vh: number): number {
  if (!(vw > 0) || !(vh > 0)) return 1;
  const area = Math.sqrt((vw * vh) / (393 * 852)) * 0.8;
  const z = Math.min(area, vh / 600, vw / UI_MAX, 2);
  return Math.max(1, Math.round(z * 100) / 100);
}
export function applyUiScale(root: HTMLElement = document.documentElement): number {
  const z = uiZoom(window.innerWidth, window.innerHeight);
  root.style.setProperty('--ui-zoom', String(z));
  return z;
}
