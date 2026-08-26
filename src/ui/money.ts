/**
 * 돈의 눈금은 **한 화면 안에서 하나다** (K50-②) — 그리고 이제 코드베이스 전체에서 하나다.
 *
 * ## 왜 (UX 감사 P1-8 · P2-31)
 *
 * 실측: 코스 독 **한 화면 안**에 `손익(만) -0.3` · `주간 매출 0원` · `유지비 2700원` ·
 * 헤더 `◎ 500만` 이 같이 떴다. 포맷터가 넷이었기 때문이다 —
 * `kairo-report.ts` 의 `won()`(억/만/원) · `kairo-course.ts` 의 `won()`(만 소수1) ·
 * 같은 파일의 `manNumber()`(+부호) · `kairo-hud.ts` 의 `◎ N만`.
 *
 * 그리고 결산 장부에 **단위 없는 `0` 이 7개** 떴다 (`인건비 0` · `건설 0` · `투자 합계 0`).
 * `0` 은 "없음"인지 "0원"인지 안 읽힌다.
 *
 * ⚠ 이것은 CLAUDE.md 항목 20(전역 명목가 ×10)과 **별개**다. 20번은 "얼마로 보이나",
 * 이건 "한 화면 안에서 눈금이 하나인가"다. 20번을 하든 안 하든 이건 고쳐야 한다.
 *
 * ## 규칙
 *
 * · `won(0)` 은 **`'0원'`** 이다. 단위 없는 0 을 내지 않는다.
 * · 부호는 호출자가 고른다 (`signed: true` 면 `+`/`−`). 음수 부호는 **U+2212** 다 —
 *   하이픈은 폰트에 따라 글머리표로 읽힌다.
 * · 만 단위 반올림이 0 이 되는 작은 금액은 **원으로 떨어진다** — `2,700원` 을 `0만` 이라
 *   쓰면 유지비가 공짜로 읽힌다.
 */

const NBSP_FREE = (n: number): string => Math.round(n).toLocaleString('ko-KR');

export interface WonOptions {
  /** `+`/`−` 를 앞에 붙인다 (증감 표시). 기본은 음수만 `−`. */
  signed?: boolean;
  /** 소수 한 자리까지 만 단위로 (코스 독의 좁은 칸). 기본은 정수 만. */
  fine?: boolean;
}

/**
 * 게임의 유일한 금액 포맷터.
 *
 * | 값 | 결과 |
 * |---|---|
 * | 0 | `0원` |
 * | 2,700 | `2,700원` |
 * | 310,000 | `31만` |
 * | 128,000,000 | `1억 2,800만` |
 */
export function won(value: number, opts: WonOptions = {}): string {
  const sign = value < 0 ? '−' : opts.signed ? '+' : '';
  const abs = Math.abs(value);
  if (abs === 0) return opts.signed ? '0원' : '0원';
  if (opts.fine) {
    // 만 단위 소수 한 자리 — 좁은 칸에서 눈금을 하나로 유지하려고 원으로 안 떨어진다
    const man = abs / 10000;
    if (man < 0.05) return `${sign}${NBSP_FREE(abs)}원`;
    return `${sign}${man.toFixed(1)}만`;
  }
  if (abs < 10000) return `${sign}${NBSP_FREE(abs)}원`;
  const eok = Math.floor(abs / 100000000);
  const man = Math.round((abs - eok * 100000000) / 10000);
  if (eok > 0) return man > 0 ? `${sign}${NBSP_FREE(eok)}억 ${NBSP_FREE(man)}만` : `${sign}${NBSP_FREE(eok)}억`;
  return `${sign}${NBSP_FREE(man)}만`;
}

/** 헤더 현금처럼 **아이콘 없이** 금액만 필요한 자리 (`◎` 는 코스 배지와 뜻이 겹쳤다) */
export function cashText(value: number): string {
  return `₩${won(value)}`;
}
