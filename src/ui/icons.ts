/**
 * 아이콘 등록부 — **화면의 모든 표식이 여기 하나에 산다** (P1.5-A).
 *
 * ## 왜
 *
 * 실측(2026-08-27): `src/ui/*.ts` 에 이모지 리터럴이 **40곳**이었다. 이모지는
 *   · 기기·OS 마다 **다른 그림**이 나오고 (같은 코드포인트, 다른 아트)
 *   · 크기·베이스라인이 폰트에 달려 있어 우리가 못 정하며
 *   · 크림 팔레트의 게임 아트와 재질이 안 맞는다
 *
 * ## 형태
 *
 * FX 등록부(`src/render/kairo/fx.ts`)와 **같은 계약**이다 — 이름 한 줄 + 구현 한 줄이고
 * 호출부는 **이름만 안다**. 그래서 그림을 갈아 끼울 때 호출부가 한 글자도 안 바뀐다.
 *
 * ⚠ **지금 구현은 글리프다.** P1.5-B 가 이 파일 하나를 픽셀아트로 바꾼다
 * (`docs/plan-commission-axis.md` §4 P1.5-B). 그때 `iconEl()` 이 `<span>` 대신
 * 아틀라스 프레임을 돌려주면 되고, 문자열 자리(`icon()`)는 폴백으로 남는다.
 *
 * ⚠ **등록부 밖에 이모지를 쓰지 말 것** — `tools/check-ui-surface.mjs` 가 지킨다
 * (이 파일만 예외다). 새 표식이 필요하면 여기 이름을 먼저 만든다.
 */

/** 화면에 쓰는 표식의 이름. **뜻으로 짓는다** — 그림이 바뀌어도 이름은 안 바뀐다 */
export type IconName =
  // 판정·상태
  | 'check' | 'cross' | 'warn' | 'locked' | 'found' | 'search' | 'dot'
  // 지표
  | 'weather-clear' | 'weather-cloudy' | 'weather-rain' | 'weather-heat' | 'weather-cold'
  | 'mood' | 'visitors' | 'grade' | 'cash' | 'star'
  // 목적지
  | 'build' | 'course' | 'recipe' | 'shop' | 'commission' | 'staff'
  | 'quests' | 'regular' | 'certs' | 'wishes' | 'codex' | 'report' | 'view' | 'ending'
  // 사건 채널
  | 'gift' | 'scroll' | 'ask' | 'news' | 'brush' | 'talk' | 'medal' | 'medal-earned'
  // 뉴스 채널 — 티커가 쓰는 표식
  | 'exam' | 'combo' | 'weather-storm' | 'celebrate' | 'milestone' | 'trophy'
  | 'weekend' | 'affection' | 'profit-up' | 'profit-down' | 'chart'
  | 'recipe-book' | 'note' | 'flag' | 'ingredient'
  // 도구
  | 'erase' | 'move' | 'camera';

/**
 * 이름 → 글리프.
 *
 * ⚠ **이 표가 이 파일에 있는 유일한 이유**다. 여기 말고 어디에도 표식 리터럴을 두지 않는다.
 */
const GLYPH: Record<IconName, string> = {
  check: '✓',
  cross: '✕',
  warn: '⚠',
  locked: '🔒',
  found: '✅',
  search: '🔍',
  dot: '·',

  'weather-clear': '☀',
  'weather-cloudy': '☁',
  'weather-rain': '☂',
  'weather-heat': '🔥',
  'weather-cold': '❄',

  mood: '😊',
  visitors: '👥',
  grade: '⭐',
  cash: '◎',
  star: '★',

  build: '🔨',
  course: '🚤',
  recipe: '🍲',
  shop: '🛒',
  commission: '📋',
  staff: '👥',
  quests: '✓',
  regular: '♥',
  certs: '◆',
  wishes: '💭',
  codex: '▣',
  report: '▤',
  view: '◉',
  ending: '🏁',

  gift: '🎁',
  scroll: '📜',
  ask: '❓',
  news: '📰',
  brush: '🖌',
  talk: '💬',
  medal: '🏅',
  'medal-earned': '🎖',

  exam: '⚖',
  combo: '✨',
  'weather-storm': '🌧',
  celebrate: '🎉',
  milestone: '🎊',
  trophy: '🏆',
  weekend: '🏖',
  affection: '💗',
  'profit-up': '📈',
  'profit-down': '📉',
  chart: '📊',
  'recipe-book': '📖',
  note: '📝',
  flag: '🚩',
  ingredient: '🧂',

  erase: '✕',
  move: '✥',
  camera: '📷',
};

/**
 * 문자열 자리의 표식 — `` `${icon('check')} 완료` `` 처럼 쓴다.
 *
 * ⚠ 문자열이라 **크기·색을 CSS 가 못 정한다.** 크기가 중요한 자리는 `iconEl()` 을 쓸 것.
 */
export function icon(name: IconName): string {
  return GLYPH[name];
}

/**
 * 반입한 그림 (P1.5-B). **id 마다 독립이다** — 없는 id 는 글리프로 떨어진다.
 *
 * Phase G 의 `HybridProvider` 와 같은 규칙이다: 한 장이 없거나 계약과 크기가 달라도
 * 그 id 만 폴백하고 화면은 안 깨진다.
 */
let art: Partial<Record<IconName, string>> = {};

/** 게이트를 통과한 그림만 건다 — 판정은 `tools/check-ui-icons.ts` 가 한다 */
export function setIconArt(map: Partial<Record<IconName, string>>): void {
  art = { ...map };
}

export function hasIconArt(name: IconName): boolean {
  return art[name] !== undefined;
}

/**
 * 요소 자리의 표식. `.kicon` 이 크기·정렬을 소유하므로 **글리프 폭 편차가 레이아웃을
 * 흔들지 않는다** (이모지를 직접 넣던 자리의 실제 문제였다).
 *
 * 그림이 걸려 있으면 `data-art='on'` 이 붙고 CSS 가 배경으로 그린다. 글리프는 **지우지
 * 않는다** — 그림이 못 뜨는 경우(파일 유실·CSP)에도 자리가 비지 않는다.
 *
 * ⚠ **문자열 자리(`icon()`)는 그림으로 못 바뀐다.** 지금 AI 대상 아이콘의 호출부
 * **65곳이 문자열**이라, 반입 단계에서 그 자리들을 `iconEl` 로 옮기는 일이 따로 남는다
 * (계획 §8-17). 「`icons.ts` 한 파일만 바꾼다」는 P1.5-A 의 문장은 **요소 자리에만** 맞다.
 */
export function iconEl(name: IconName, extraClass?: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = extraClass ? `kicon ${extraClass}` : 'kicon';
  span.dataset['icon'] = name;
  span.setAttribute('aria-hidden', 'true');
  span.textContent = GLYPH[name];
  const url = art[name];
  if (url !== undefined) {
    span.dataset['art'] = 'on';
    // 경로는 **데이터**다 — 색·크기는 여전히 style.css 가 소유한다
    span.style.setProperty('--icon-art', `url("${url}")`);
  }
  return span;
}

/** 등록부에 이름이 몇 개인가 — 검사가 "표가 안 비었다"를 확인하는 자리 */
export const ICON_NAMES: readonly IconName[] = Object.keys(GLYPH) as IconName[];
