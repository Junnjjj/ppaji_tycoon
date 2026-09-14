/**
 * P57-c — public 에셋 경로를 **문서 기준 절대 URL** 로.
 * ⚠ 인라인 변수에 `assets/pictures.png` 같은 상대 경로를 CSS 변수에 넣으면 Chrome 이 그 변수를 **쓰는 스타일시트** 위치 기준으로 푼다 —
 * dev 는 CSS 가 `<style>` 로 문서에 박혀 `/assets/pictures.png` 지만, dist 는 CSS 가 `assets/main-*.css` 라 `/assets/assets/pictures.png`(404) 가 되어
 * 그림 396·장면 4 가 배포본에서만 통째로 사라졌다(2026-09-15 사용자 실측, 게이트는 dev 서버만 재서 못 잡았다). 여기서 한 번 절대화하면 CSS 위치와 무관하다.
 */
export function assetUrl(path: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(path)) return path;
  return new URL(path, document.baseURI).href;
}
