/**
 * DOM 헬퍼 — **한 벌만 있어야 한다** (K34).
 *
 * 똑같은 제네릭 `el()` 이 `kairo-hud.ts` 와 `kairo-course.ts` 에 두 벌 있었다. 세 번째가
 * 생기기 전에 꺼낸다. 패널 8종이 같은 것을 쓴다.
 */

/**
 * `<div class="x">텍스트</div>` 한 줄짜리.
 *
 * `cls` 를 안 주면 클래스를 안 붙인다 — `<option>` 처럼 스타일이 필요 없는 것도 있다.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/**
 * 버튼 하나 — 클래스·글·클릭을 한 번에.
 *
 * 패널마다 "버튼 만들고 클래스 주고 리스너 붙이기"를 세 줄씩 반복하고 있었다.
 */
export function button(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.addEventListener('click', onClick);
  return b;
}
