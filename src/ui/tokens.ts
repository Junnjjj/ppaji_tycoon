/**
 * 캔버스가 **CSS 토큰을 읽는다** (K34).
 *
 * ## 왜 필요한가
 *
 * 결산의 혼잡 히트맵(`kairo-report.ts`)과 감상 화면의 공유 이미지(`kairo-showcase.ts`)는
 * 캔버스에 그린다. 캔버스 색은 CSS 클래스가 될 수 없으므로, 여기만은 TS 안에 색이
 * 남을 수밖에 없다 — 그러면 "색은 `style.css` 가 소유한다"가 절반만 참이 된다.
 *
 * 그래서 **읽어 온다.** 정본은 여전히 `:root` 하나이고, 팔레트를 바꾸면 화면과 내보낸
 * PNG 가 같이 바뀐다. 밝은 팔레트로 갈 때 캔버스만 어두운 채로 남는 사고를 막는다.
 *
 * ## 캐시
 *
 * `getComputedStyle` 은 레이아웃을 강제한다. 히트맵은 칸마다 색을 묻기 때문에
 * (64×48) 캐시가 없으면 프레임이 떨어진다. 값은 부팅 중 한 번만 읽는다.
 *
 * ⚠ 그래서 **런타임에 토큰을 바꾸면 반영되지 않는다.** 다크/라이트 토글이 생기면
 * `clearTokenCache()` 를 부를 것.
 */

const cache = new Map<string, string>();

/**
 * `:root` 의 커스텀 속성 값. 없으면 `fallback`.
 *
 * 값이 비면 **`fallback` 을 돌려주되 조용히 넘어가지 않는다** — 오타 난 토큰 이름은
 * 빈 문자열을 내고, 캔버스에서 빈 `fillStyle` 은 아무것도 안 그리거나 검게 남는다.
 */
export function cssVar(name: string, fallback = '#000'): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const raw =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const v = raw === '' ? fallback : raw;
  if (raw === '' && typeof console !== 'undefined') {
    console.warn(`[tokens] ${name} 이 :root 에 없다 — ${fallback} 로 그린다`);
  }
  cache.set(name, v);
  return v;
}

/**
 * `--shortage: 240 160 60` 처럼 **삼원색으로 둔 토큰**을 `rgb(… / a%)` 로 만든다.
 *
 * 부족·주말 주황은 알파를 16%·18%·40%·100% 네 단계로 쓴다. hex 로 두면 단계마다
 * 다른 상수가 생겨서 지금 실제로 네 벌이 흩어져 있었다.
 */
export function rgba(name: string, alpha: number, fallback = '240 160 60'): string {
  return `rgb(${cssVar(name, fallback)} / ${alpha}%)`;
}

/** 토큰을 런타임에 바꿨을 때 */
export function clearTokenCache(): void {
  cache.clear();
}
