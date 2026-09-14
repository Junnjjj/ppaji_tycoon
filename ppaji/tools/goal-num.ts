/**
 * goal 번호 한 벌 (P48-a, §14 D254) — `tools/gate.ts` 와 `tools/verify.ts` 가 **둘 다 이것을 import** 한다.
 * 예전엔 두 파일이 같은 식을 각자 들고 있어 한쪽만 고쳐졌다(비수출 const 라 vitest 도 못 읽었다).
 *
 * `gN` → N · `pN` → 100+N(승계 G0~G57 을 전부 품는다) · **`pN<letter><sub?>`** → 100+N + (letter·10 + sub)/100
 *   p48a → 148.1 · p48b1 → 148.21 · p48c → 148.3 · p49a2 → 149.12
 * 백분의 일을 정수로 모아 **한 번만** 나눈다 — 부동소수점을 세 번 더하면 148.20999… 가 된다.
 */
export function goalNum(g: string): number {
  const m = /^p(\d+)([a-z])?(\d)?$/i.exec(g);
  if (m) {
    const base = 100 + Number(m[1]);
    const letter = m[2] ? m[2].toLowerCase().charCodeAt(0) - 96 : 0; // a=1
    const sub = m[3] ? Number(m[3]) : 0;
    return base + (letter * 10 + sub) / 100;
  }
  return Number(g.replace(/^g/, '')) || 0;
}
