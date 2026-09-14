/**
 * 타이포 스케일의 **사본** (P1.5-A).
 *
 * ⚠ **정본은 `style.css` 의 `:root`** 다. 여기 표가 있는 이유는 검사가 CSS 규칙을 읽을 때
 * `font-size: var(--fs-body)` 를 숫자로 풀어야 하기 때문이고, 둘이 갈라지지 않도록
 * `type-scale.test.ts` 가 **CSS 를 파싱해 이 표와 대조**한다.
 *
 * ⚠ 이 표를 보고 TS 에서 크기를 계산하지 말 것 — 크기는 CSS 가 소유한다
 * (「색은 style.css 가 소유한다」와 같은 규칙의 타이포 판).
 */
export const TYPE_SCALE = {
  '--fs-tiny': 12,
  '--fs-body': 15,
  '--fs-lead': 19,
  '--fs-title': 23,
  '--fs-num': 29,
  '--fs-hero': 36,
} as const;

/**
 * 선언 한 덩어리에서 `font-size` 를 px 숫자로 푼다. **토큰도 리터럴도 같은 자로 잰다** —
 * 토큰만 읽으면 리터럴이 숨고, 리터럴만 읽으면 토큰화한 순간 검사가 공허해진다.
 */
export function resolveFontSize(body: string): number | null {
  const lit = /font-size:\s*([\d.]+)px/.exec(body);
  if (lit) return Number(lit[1]);
  const tok = /font-size:\s*var\((--fs-[\w-]+)\)/.exec(body);
  if (!tok) return null;
  const key = tok[1] as keyof typeof TYPE_SCALE;
  return TYPE_SCALE[key] ?? null;
}
