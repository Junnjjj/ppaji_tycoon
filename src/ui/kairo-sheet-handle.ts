/**
 * 바텀시트의 드래그 핸들 (P8).
 *
 * ## 왜 「보이기만 하는 손잡이」를 안 만드나
 *
 * P7 이 남긴 규칙 그대로다 — **「슬롯이 있다」와 「슬롯이 돈다」는 다르다.**
 * 잡아당길 수 없는 손잡이는 그 자리에 「당길 수 있다」고 거짓말을 하고, 한 번 속은
 * 사용자는 다시 안 잡는다. 그래서 이 핸들은 **실제로 내려서 닫힌다.**
 *
 * ## 규칙
 *
 * · 아래로만 반응한다 — 위로 끄는 것은 시트를 키우는 동작이 아니다 (시트 크기는 내용이 정한다)
 * · 문턱은 **44px** — 터치 타깃 하한과 같은 눈금이다. 그보다 짧으면 「눌렀다」와 구분이 안 된다
 * · 끄는 동안은 `transform` 만 만진다 (레이아웃 속성 애니메이트 금지 계약)
 * · 문턱을 못 넘기면 제자리로 돌아온다 — 되돌아가는 것이 「안 닫혔다」의 유일한 신호다
 * · **탭으로는 안 닫힌다** — 닫는 길은 44px 짜리 `닫기` 버튼이 이미 갖고 있고, 손잡이를
 *   탭 표적으로 겸하면 시트 위쪽을 스치는 손가락에 시트가 사라진다
 * · `prefers-reduced-motion` 이어도 **끄는 동작 자체는 남는다** (그건 연출이 아니라 조작이다).
 *   빼는 것은 되돌아갈 때의 전환뿐이고 그것은 CSS 가 정한다
 */
import { el } from './dom.js';

/** 이만큼 내리면 닫힌다 — 터치 타깃 하한과 같은 눈금 */
export const SHEET_CLOSE_DRAG = 44;

/**
 * 시트 머리 위에 손잡이를 얹고 아래로 끌면 닫히게 한다.
 *
 * @param root 시트 루트 (`.ksheet`). 여기에 `transform` 을 건다
 * @param head 손잡이를 넣을 곳 — 보통 시트 머리의 **앞**
 * @param onClose 문턱을 넘겼을 때
 */
export function attachSheetHandle(
  root: HTMLElement,
  head: HTMLElement,
  onClose: () => void,
): HTMLElement {
  const grip = el('div', 'ksheet-grip');
  /*
   * ⚠ **`role="button"` 을 붙이지 않는다.** 상시 컨트롤 감사가
   * `button, select, input, [role="button"]` 을 세면서 **44px 를 요구**하는데 이 띠는 22px 다
   * — 티커 띠가 정확히 그 자리에서 4건을 확정 실패시켰다 (CLAUDE.md 의 경고).
   * 44px 로 키우면 이번엔 아래 머리의 버튼 터치를 훔친다 (기하로 풀 수 없다).
   *
   * 대신 **닫는 길은 이미 44px 짜리 `닫기` 버튼**이 갖고 있다. 손잡이는 그 짝이 아니라
   * **보조 제스처**이므로 접근성 트리에서 숨기고, 잡는 것만 남긴다.
   */
  grip.setAttribute('aria-hidden', 'true');
  grip.dataset['sheetGrip'] = '';
  /*
   * ⚠ **머리가 아직 루트에 안 붙어 있을 수 있다.** 시트들은 `head` 를 만들어 내용을 채운 뒤
   * **마지막에** `root.append(head, body)` 한다 — 그 시점에 `head.before()` 는 조용한 no-op 이라
   * 손잡이가 DOM 에 안 들어간다 (실측: 네 시트 전부 손잡이가 없었다).
   * 붙어 있으면 머리 앞에, 아직이면 루트 맨 앞에 넣는다. 둘 다 결과 순서는 같다.
   */
  if (head.parentElement === root) head.before(grip);
  else root.prepend(grip);

  let startY: number | null = null;
  let moved = 0;

  const end = (commit: boolean): void => {
    startY = null;
    root.classList.remove('dragging');
    root.style.transform = '';
    if (commit && moved >= SHEET_CLOSE_DRAG) onClose();
    moved = 0;
  };

  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    startY = e.clientY;
    moved = 0;
    root.classList.add('dragging');
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e: PointerEvent) => {
    if (startY === null) return;
    // ⚠ 아래로만 — 음수는 0 으로 눌러 둔다 (위로 끌어 시트를 키우지 않는다)
    moved = Math.max(0, e.clientY - startY);
    root.style.transform = `translateY(${String(moved)}px)`;
  });
  grip.addEventListener('pointerup', () => end(true));
  grip.addEventListener('pointercancel', () => end(false));
  return grip;
}
