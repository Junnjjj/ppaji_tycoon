/**
 * CSS 토큰을 캔버스·Phaser 가 읽는 유일한 창구. **색은 `style.css` 가 소유한다** — TS 에
 * hex 를 두면 두 팔레트가 생기고 반드시 갈라진다 (`tools/check-ui.mjs` 가 hex 0 을 지킨다).
 */
const cache = new Map<string, string>();

export function cssVar(name: string): string {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v) cache.set(name, v);
  return v;
}

/** `#rrggbb` → 0xrrggbb (Phaser tint 용). rgb() 도 받는다 */
export function cssColorInt(name: string): number {
  const v = cssVar(name);
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return parseInt(hex[1]!, 16);
  const rgb = v.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return (Number(rgb[1]) << 16) | (Number(rgb[2]) << 8) | Number(rgb[3]);
  return 0;
}

/** 테스트·테마 전환용 */
export function resetTokenCache(): void {
  cache.clear();
}
