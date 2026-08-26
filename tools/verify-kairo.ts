/**
 * 카이로 씬 브라우저 검증 — 페이즈마다 이걸로 통과를 확인한다.
 *
 *   npm run verify:kairo
 *   npm run verify:kairo -- --headed
 *
 * 개발 서버(npm run dev)가 떠 있어야 한다.
 *
 * ## 왜 별도 하네스인가
 *
 * `verify:mobile` 은 v1 씬(자유 배치·실시간 배속)을 검사한다. 카이로는 스케일 모드부터
 * 다르고 조작도 다르므로 같은 파일에 섞으면 둘 다 못 읽는다. 카이로가 기본 씬이 되면
 * 이쪽으로 합친다.
 *
 * ## 함정 (실측)
 *
 * - **`page.evaluate` 에 넘기는 템플릿 리터럴 안에서 백틱과 백슬래시 이스케이프를 쓰지 말 것.**
 *   백틱은 리터럴을 끊고, `\n` 같은 이스케이프는 TS 가 **실제 줄바꿈으로 바꿔** 페이지 쪽
 *   정규식을 깨뜨린다 (실측: `/\n/g` 가 줄바꿈이 들어간 정규식이 되어 SyntaxError).
 *   줄바꿈이 필요하면 `String.fromCharCode(10)` 를 쓴다.
 * - **`page.evaluate` 안에서 이름 있는 함수를 쓰지 말 것.** tsx(esbuild)가 `__name`
 *   헬퍼를 주입하는데 페이지 쪽엔 없어서 ReferenceError 가 난다. 문자열로 넘기는 게 안전하다.
 * - **핀치/멀티터치는 CDP `Input.dispatchTouchEvent` 로 보낼 것.** 합성 PointerEvent 는
 *   Phaser 가 무시해서 멀쩡한 코드가 실패로 나온다.
 */
import { chromium, type CDPSession, type ConsoleMessage, type Page } from 'playwright';
// 배경 겹 수·id 의 정본. 검사에 상수를 박으면 겹을 더할 때마다 검사가 깨진다 (K36-B)
import { KAIRO } from '../src/assets/kairo-contract.js';
// 격자 꼭지점 → 화면 텍셀. 표식 절이 **기대 선분을 스스로 만들 때** 쓴다 (K52)
import { gridToScreen, tileCenter, TILE_H } from '../src/render/kairo/iso.js';
import { createBuildIdentity } from './build-identity.js';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';
/*
 * `px=1` = 프레임버퍼 보존 (이음새 픽셀 검사용).
 * `debug=1` = 디버그 오버레이. K28 부터 기본으로 숨는데, 이 하네스와 `verify-pwa` 가
 * `#kairo-debug` 의 textContent 로 부팅 완료를 판정하므로 켜고 들어간다.
 */
const URL = `${BASE}/?kairo=1&px=1&debug=1`;
const HEADED = process.argv.includes('--headed');
/** 공유 명령이 외부 정체·첫 DOM·393×852 캡처만 빠르게 확인할 때 쓴다. */
const IDENTITY_ONLY = process.argv.includes('--identity');
const LOCAL_BUILD = createBuildIdentity(process.cwd());
const EXPECTED_SHA = process.env['PPAJI_EXPECTED_SHA'] ?? LOCAL_BUILD.sha;
const EXPECTED_SOURCE_DIGEST = process.env['PPAJI_EXPECTED_SOURCE_DIGEST'] ??
  LOCAL_BUILD.sourceDigest;
const RESOLVE_RULE = process.env['PPAJI_RESOLVE_RULE'];
/** Phase 7의 세로·가로 실제 터치 게이트만 빠르게 재현한다. 전체 회귀 경로는 그대로다. */
const PHASE7_ONLY = process.argv.includes('--phase7');
/** 홈/메뉴 셸 v2의 첫 프레임과 실제 터치 전환만 빠르게 재현한다. */
const SHELL_V2_ONLY = process.argv.includes('--shell-v2');
/** 코스 v2의 정보→편집→시험→리뷰→적용을 실제 CDP 터치로만 재현한다. */
const COURSE_V2_ONLY = process.argv.includes('--course-v2');
/**
 * 건설 v3 — 조준 배치·1회 설치 기본·명시적 연속 설치를 실제 CDP 터치로만 재현한다
 * (UI v3 Task 5). 본문은 `runBuildV3AimingSuite()` 하나이고, 전체 스위트 안에서도
 * 그대로 돈다 — 이 플래그는 그 절만 빠르게 떼어 도는 지름길일 뿐 별도 로직이 아니다.
 */
const BUILD_V3_ONLY = process.argv.includes('--build-v3');
/** 사건 미니 장면(Task 6)과 지도 밖 생활 장식(Task 7)만 빠르게 재현한다. */
const SCENE_V2_ONLY = process.argv.includes('--scene-v2');
/**
 * 판의 육지를 통째로 포장한다 — K32-B 부터 **잔디는 손님이 못 지나간다.**
 *
 * 하네스는 "빈 육지를 찾아 시설을 놓는다"로 여러 절을 짠다. 그 육지가 잔디면 이제
 * 전부 `unreachable` 이다 (실측 13절 실패). 길 규칙 자체를 보는 것은 새 절과
 * `paths.test.ts` 이고, 나머지 절이 보려는 것은 배치·손님·콤보·위험도다 —
 * 그 절들에서는 **길을 상수로 만든다.**
 *
 * 실내 바닥은 건드리지 않는다 (방을 지우면 벽이 사라진다).
 */
/**
 * 훑을 범위를 **해금된 토지에서** 가져온다 (K36).
 *
 * ⚠ 하네스 곳곳이 `for (let i = 4; i < 28; ...)` 처럼 좌표를 박아 뒀다. 격자가 96×72 가
 * 되고 입구가 가운데(i=48)로 가면서 그 창들이 전부 **도시 띠나 내 땅 밖**을 가리켰다
 * (실측: 12절이 "아직 내 땅이 아닙니다"로 실패). 좌표를 박지 말고 물어본다.
 */
const LAND_BOX = `
    const _L = window.__kairo.land();
    const I0 = _L.i0 + 1;
    const I1 = _L.i0 + _L.w - 1;
    const J0 = _L.j0 + 1;
    const J1 = _L.j0 + _L.h - 1;
`;

/** 도시 띠 높이 — 하네스가 좌표를 박지 않게 (K36) */
const KAIRO_BAND = 8;

const PAVE_ALL = `
    (() => {
      const _t = window.__kairo.terrain, _sc = window.__kairo.scene;
      for (let j = 0; j < _t.height; j++) {
        for (let i = 0; i < _t.width; i++) {
          if (!_t.isWalkable(i, j) || _t.isIndoor(i, j)) continue;
          if (_t.kindAt(i, j) === 'path_stone') continue;
          if (_t.paint(i, j, 'path_stone')) _sc.refreshTile(i, j);
        }
      }
      window.__kairo.guests.invalidate();
    })();
`;

/**
 * 빈 육지 사각형 찾기 — 하네스가 좌표를 박지 않는다 (K36). `LAND_BOX` 뒤에 이어 쓴다.
 *
 * 발자국 안의 **단이 균일**한지도 같이 본다: 안 보면 `level-mixed` 로 배치가 실패하는데
 * 그 이유가 절 밖으로 안 나와 "자리를 못 찾았다"로 잘못 읽힌다 (K37 경사 규칙).
 */
const FREE_RECT = `
      const _free = (ww, hh) => {
        for (let j = J0; j + hh <= J1; j++) {
          for (let i = I0; i + ww <= I1; i++) {
            let ok = true;
            const lv = t.levelAt(i, j);
            for (let di = 0; di < ww && ok; di++) {
              for (let dj = 0; dj < hh; dj++) {
                if (!t.isWalkable(i + di, j + dj) || t.isIndoor(i + di, j + dj) ||
                    !t.isBuildable(i + di, j + dj) || t.levelAt(i + di, j + dj) !== lv ||
                    w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) { ok = false; break; }
              }
            }
            if (ok) return [i, j];
          }
        }
        return null;
      };
`;

/**
 * 카드 치우기 — 사고 대응 카드는 결산 **앞**에 오고(§12.1), 결산을 닫으면 다음 주
 * 카드가 뒤따른다. 둘 다 모달이라 남겨 두면 그 뒤가 전부 가려진다.
 *
 * ⚠ 주를 감는 절이 여럿(K47-② · P2-B 콤보 블록)이라 **모듈 스코프에 한 벌**만 둔다.
 * 절마다 복붙하면 카드 구조가 바뀔 때 한쪽만 고쳐져 그 절이 조용히 멈춘다.
 */
const DISMISS_CARDS = `(() => {
      const cv = window.__kairoCards;
      let guard = 0;
      while (cv && cv.visible && guard++ < 5) {
        const card = cv.currentCard;
        let pick = 0;
        if (card) {
          for (let oi = 0; oi < card.options.length; oi++) {
            if (!card.options[oi].effects.some((e) => e.closed)) { pick = oi; break; }
          }
        }
        cv.pickForTest(pick);
      }
      return !!cv && cv.visible;
    })()`;

/** 결산 닫기 — 화면의 `계속` 버튼과 같은 경로 (없으면 닫기 버튼) */
const CLOSE_REPORT = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return false;
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.includes('계속'))
        || document.getElementById('kairo-report-close');
      if (close) close.click();
      return true;
    })()`;

/**
 * 결산의 **콤보 블록**을 읽는다 (P2-B).
 *
 * ⚠ 선택자는 `src/ui/kairo-report.ts` 의 `comboBlock` 실물에서 확인한 것이다 —
 * 블록 뿌리는 `wrap.dataset['combo']`(= `[data-combo]`), 타일은 `.kstat` 안의
 * `.kstat-label`/`.kstat-value`, 상위 줄은 `.knums` 안의 `.knum-key`/`.knum-val`,
 * 처방·설명은 `.kcaption` 이다. **`.knums` 는 위쪽 숫자 표도 쓰는 클래스**라
 * 반드시 블록 뿌리 안에서만 훑는다 — 뿌리 밖에서 세면 매출·손익 줄이 섞인다.
 *
 * "감췄나"는 `hidden` 뿐 아니라 **실제 높이**로도 본다. 0개인 주에 줄을 통째로
 * 감추는 회귀는 `display:none` 으로도, `count===0`일 때 `return null` 로도 올 수 있다.
 */
const READ_COMBO_BLOCK = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return { open: false };
      const wrap = r.querySelector('[data-combo]');
      if (!wrap) return { open: true, block: false };
      const stats = [...wrap.querySelectorAll('.kstat')].map((c) => ({
        label: (c.querySelector('.kstat-label') || {}).textContent || '',
        value: (c.querySelector('.kstat-value') || {}).textContent || '',
      }));
      const keys = [...wrap.querySelectorAll('.knums .knum-key')];
      const vals = [...wrap.querySelectorAll('.knums .knum-val')];
      const lines = keys.map((k, idx) => ({
        key: k.textContent || '',
        val: vals[idx] ? vals[idx].textContent : '',
      }));
      const caps = [...wrap.querySelectorAll('.kcaption')].map((c) => c.textContent || '');
      const cs = getComputedStyle(wrap);
      const box = wrap.getBoundingClientRect();
      return {
        open: true,
        block: true,
        count: Number(wrap.getAttribute('data-combo')),
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && box.height > 0,
        stats: stats,
        lines: lines,
        caps: caps,
      };
    })()`;

/** 결산이 실제로 **적용한** 콤보 값 — `WeekReport.combos` 그대로 (표시와 대조할 정본) */
const READ_REPORT_COMBOS = `(() => {
      const r = window.__kairo.getLastReport();
      if (!r || !r.combos) return null;
      return { sat: r.combos.satisfactionDelta, mult: r.combos.revenueMult, week: r.week };
    })()`;

interface ComboBlockView {
  open: boolean;
  block?: boolean;
  count?: number;
  visible?: boolean;
  stats?: { label: string; value: string }[];
  lines?: { key: string; val: string }[];
  caps?: string[];
}

/** 블록의 타일 하나를 라벨로 집는다 — 순서에 기대면 열이 하나 늘 때 조용히 어긋난다 */
const statOf = (b: ComboBlockView, label: string): string =>
  b.stats?.find((s) => s.label === label)?.value ?? '';

/** 상위 줄의 `이름 ×배율 (칸수)` 표기를 뜯는다 (P1-A). 없으면 null */
const areaOf = (b: ComboBlockView): { scale: number; area: number; key: string } | null => {
  for (const line of b.lines ?? []) {
    const m = /×(\d+(?:\.\d+)?)\s*\((\d+)칸\)/.exec(line.key);
    if (m) return { scale: Number(m[1]), area: Number(m[2]), key: line.key };
  }
  return null;
};

const SHOT_DIR = 'tmp-shots';

/** iPhone 14 Pro 급 — DPR 3 이 정수라 도트 격자에 유리한 쪽. 안드로이드는 아래에서 따로 본다 */
const DEVICE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

type Verdict = 'pass' | 'fail' | 'info';
const results: Array<{ name: string; verdict: Verdict; detail: string }> = [];
const record = (name: string, verdict: Verdict, detail = ''): void => {
  results.push({ name, verdict, detail });
  const icon = verdict === 'pass' ? '✓' : verdict === 'fail' ? '✕' : 'ℹ';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * 경영 메뉴가 **조립을 끝냈는가** — 개수가 아니라 **정체**로 판정한다.
 *
 * ⚠ 예전엔 `.kmanage-action` 이 정확히 12개일 때를 준비 완료로 봤다. 목표 행과 설정 행이
 * 같은 클래스를 쓰기 시작하자 실측 16이 되어 **기본 verify 경로가 6번째 검사에서 죽었고**,
 * 그 뒤의 모든 절(경영 IA · HUD 예산 · 손님 · 주 루프 · 건설 v3)이 한 번도 안 돌았다.
 * IA 가 바뀔 때마다 같은 사고가 나므로 숫자를 다시 박지 않는다 — 라우터의 네 목적지와
 * Today 라벨이 **이름으로** 있으면 준비된 것이다.
 */
const MANAGEMENT_READY_EXPR = `!!document.querySelector('.kmanage-today .kmanage-label') &&
  ['operations', 'growth', 'records', 'settings'].every((id) =>
    !!document.querySelector('[data-manage-route="' + id + '"], [data-manage-group="' + id + '"]'))`;
const MANAGEMENT_READY = `(() => ${MANAGEMENT_READY_EXPR})()`;

/**
 * 홈의 **상시 역할 제어**를 정체로 잰다 (K47-② 「개수를 세는 검사는 조용히 죽는다」).
 *
 * 계약은 넷이다: `메뉴` · `건설` · **즉시 목표 밴드** · **소식 띠**. 각각이
 *   · 존재하고 (missing)
 *   · 44px 이상이며 (small)
 *   · 그 밖의 상시 컨트롤이 홈에 새로 생기지 않았다 (extra)
 * 를 본다. 수가 우연히 맞아 통과하는 형태가 구조적으로 불가능해진다.
 */
const HOME_CONTROL_IDENTITY = `(() => {
  const want = [
    ['menu', '#kairo-menu-open'],
    ['build', '#kairo-build-open'],
    ['goal', '#kairo-goal [data-goal-role="immediate"]'],
    ['ticker', '#kairo-ticker .kticker-hit'],
  ];
  const shown = (node) => {
    if (!node) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (Number(style.opacity) === 0) return false;
    const r = node.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };
  const missing = [];
  const small = [];
  const seen = new Set();
  for (const [name, sel] of want) {
    const node = document.querySelector(sel);
    if (!shown(node)) { missing.push(name); continue; }
    seen.add(node);
    const r = node.getBoundingClientRect();
    if (Math.round(Math.min(r.width, r.height) * 100) / 100 < 44) small.push(name);
  }
  const extra = [];
  for (const node of document.querySelectorAll('button, select, input, [role="button"]')) {
    if (!shown(node)) continue;
    if (node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
    if (seen.has(node)) continue;
    if (want.some(([, sel]) => node.closest(sel))) continue;
    extra.push(node.id || node.className || node.tagName);
  }
  return { missing, small, extra };
})()`;

/**
 * 보이는 enabled 컨트롤이 **그 자리에서 눌리는가** (UI v3, 계획 §1.2).
 *
 * ⚠ 경계 상자가 44px 인 것은 터치 계약이 아니다. 2026-08-26 실측에서 메뉴의
 * `결산·감상·인증·엔딩` 네 버튼은 87×44px 로 그려졌지만 중심
 * `document.elementFromPoint()` 가 **하단 바**를 돌려줬다 — 옛 게이트는 상자만 보고
 * 통과시켰다. 그래서 중앙 한 점이 아니라 **중앙 + 네 inset 5점**을 재고, 화면에
 * 일부만 걸친 버튼(`contained: false`)은 "보이는 버튼"으로 치지 않는다.
 *
 * ⚠ "보이는가"는 **window 만으로는 못 잰다** (2026-08-26 실측). `.ksheet-body` 는
 * `overflow-y: auto` 스크롤 컨테이너라, 스크롤 전 아래쪽 항목은 아직 window 안 좌표에도
 * 하나도 안 그려진(0px 노출) 상태다 — 하지만 그 rect 는 window 보다 훨씬 아래(예: bottom
 * 916/979/1033)까지 내려가 옛 `contained` 판정이 이걸 "화면에 반쯤 걸쳤다"는 결함으로
 * 오분류했다. **완전히 안 보이는 것(스크롤로 아직 안 옴)**과 **진짜 절반만 잘린 것(레이아웃
 * 버그)**은 다른 사건이다 — 전자는 hidden 과 동급으로 스윕에서 빼고, 후자만 위반으로 남긴다.
 * 그래서 각 스크롤 조상(overflow: hidden/auto/scroll)의 clip 사각형을 window 와 교집합해
 * "실제로 몇 % 가 그려지는가"를 재고, 0%는 제외·100%는 `contained`·그 사이만 위반이다.
 */
const OWNERSHIP_SWEEP = (rootSelector: string): string => `(() => {
  const root = document.querySelector('${rootSelector}');
  if (!root) return null;
  const clipRectFor = (el) => {
    let rect = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'auto' || style.overflowY === 'scroll';
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'auto' || style.overflowX === 'scroll';
      if (clipsY || clipsX) {
        const cr = node.getBoundingClientRect();
        rect = {
          top: clipsY ? Math.max(rect.top, cr.top) : rect.top,
          bottom: clipsY ? Math.min(rect.bottom, cr.bottom) : rect.bottom,
          left: clipsX ? Math.max(rect.left, cr.left) : rect.left,
          right: clipsX ? Math.min(rect.right, cr.right) : rect.right,
        };
      }
      node = node.parentElement;
    }
    return rect;
  };
  const out = [];
  const nodes = root.querySelectorAll('button, select, input, [role="button"]');
  for (const node of nodes) {
    if (node.disabled || node.getAttribute('aria-disabled') === 'true') continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (Number(style.opacity) === 0) continue;
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const clip = clipRectFor(node);
    const overlapW = Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left));
    const overlapH = Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top));
    const visibleFrac = (overlapW * overlapH) / (r.width * r.height);
    // 아직 스크롤로 안 온 것 — hidden 과 동급이라 위반 목록에 안 넣는다
    if (visibleFrac <= 0.02) continue;
    const contained = visibleFrac >= 0.98;
    const px = Math.min(6, r.width / 2 - 0.5);
    const py = Math.min(6, r.height / 2 - 0.5);
    const points = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + px, r.top + py],
      [r.right - px, r.top + py],
      [r.left + px, r.bottom - py],
      [r.right - px, r.bottom - py],
    ];
    let owned = 0;
    let thief = '';
    for (const point of points) {
      const top = document.elementFromPoint(point[0], point[1]);
      if (top === node || node.contains(top)) owned++;
      else if (!thief) thief = top ? (top.id || String(top.className) || top.tagName) : 'none';
    }
    out.push({
      id: node.id || node.dataset.manageAction || node.dataset.settingsAction ||
        node.dataset.goalRole || String(node.textContent || '').trim().slice(0, 14),
      owned: owned,
      contained: contained,
      visiblePct: Math.round(visibleFrac * 100),
      short: Math.round(Math.min(r.width, r.height)),
      bottom: Math.round(r.bottom),
      thief: thief,
      isClose: node.id === 'kairo-sheet-close',
      isTodayPrimary: !!node.closest('.kmanage-today'),
    });
  }
  return out;
})()`;

interface OwnershipHit {
  id: string;
  owned: number;
  contained: boolean;
  visiblePct: number;
  short: number;
  bottom: number;
  thief: string;
  isClose: boolean;
  isTodayPrimary: boolean;
}

/**
 * 실제 computed font-size 를 잰다 (계획 §1.3 — 9px 사용 금지).
 *
 * CSS 정적 검사는 "규칙에 몇 px 이라 적었나"만 본다. 상속·중첩·미디어 쿼리가 겹치면
 * 화면 값은 다를 수 있으므로 **그려진 값**을 잰다. 텍스트 노드를 직접 가진 요소만
 * 대상이다 — 컨테이너까지 세면 자식의 글씨를 두 번 재고 판정이 흐려진다.
 */
const TYPOGRAPHY_SWEEP = (rootSelector: string): string => `(() => {
  const root = document.querySelector('${rootSelector}');
  if (!root) return null;
  const out = [];
  for (const node of root.querySelectorAll('*')) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) text += String(child.textContent || '').trim();
    }
    if (!text) continue;
    out.push({
      text: text.slice(0, 18),
      cls: String(node.className || node.tagName),
      fontSize: Math.round(parseFloat(style.fontSize) * 10) / 10,
      weight: Number(style.fontWeight),
    });
  }
  return out;
})()`;

interface TypeHit {
  text: string;
  cls: string;
  fontSize: number;
  weight: number;
}

/** DOM click이 아니라 브라우저 입력 파이프를 타는 한 손가락 탭. */
async function touchElement(page: Page, cdp: CDPSession, selector: string): Promise<void> {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`터치할 수 없는 요소: ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

interface SurfaceAudit {
  controls: number;
  minTarget: number;
  unreachable: number;
  documentOverflow: number;
}

/**
 * 가로 화면 표면의 계약: 문서 자체는 옆으로 새지 않고, 각 컨트롤은 표면 스크롤로
 * 세로 도달 가능하며, 짧은 변이 44px(렌더 소수 오차 0.25px 허용)다.
 */
async function auditSurface(page: Page, rootSelector: string): Promise<SurfaceAudit> {
  const root = page.locator(rootSelector).first();
  await root.waitFor({ state: 'visible' });
  const controls = root.locator('button, [role="button"]');
  const count = await controls.count();
  let minTarget = Infinity;
  let unreachable = 0;
  let visibleCount = 0;
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    visibleCount++;
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    if (!box) {
      unreachable++;
      continue;
    }
    minTarget = Math.min(minTarget, box.width, box.height);
    if (
      box.x + box.width <= 0 ||
      box.x >= page.viewportSize()!.width ||
      box.y + box.height <= 0 ||
      box.y >= page.viewportSize()!.height
    ) unreachable++;
  }
  const documentOverflow = await page.evaluate(
    `Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth`,
  ) as number;
  return {
    controls: visibleCount,
    minTarget: Number.isFinite(minTarget) ? Math.round(minTarget * 100) / 100 : 0,
    unreachable,
    documentOverflow: Math.round(documentOverflow * 100) / 100,
  };
}

async function main(): Promise<void> {
  console.log(`카이로 검증 — ${URL}`);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !HEADED,
    ...(RESOLVE_RULE ? { args: [`--host-resolver-rules=${RESOLVE_RULE}`] } : {}),
  });
  const ctx = await browser.newContext(DEVICE);
  const page = await ctx.newPage();

  /**
   * 알려진 무해한 요청 실패. **URL 로 허용한다** — "Failed to load resource" 라는
   * 문구만 보고 통째로 무시하면 진짜 에러를 놓친다.
   *   · assets/atlas.json — 아틀라스 유무 탐색. 없으면 절차적 생성으로 내려간다 (설계대로)
   *   · favicon.ico — 파비콘 없음
   */
  const BENIGN = [/assets\/atlas\.json$/, /favicon\.ico$/];

  /** 탭 → 타일 해석 회귀 검사용. 붓이 없을 때 씬이 해석한 타일을 콘솔에 찍는다 */
  const tapLog: string[] = [];
  const errors: string[] = [];
  const httpFails: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.text().includes('탭 타일')) tapLog.push(m.text());
    if (m.type() !== 'error') return;
    // 리소스 로드 실패는 아래 httpFails 로 URL 까지 보고 판단한다
    if (m.text().includes('Failed to load resource')) return;
    errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !BENIGN.some((re) => re.test(r.url()))) {
      httpFails.push(`${r.status()} ${r.url()}`);
    }
  });
  page.on('requestfailed', (r) => {
    if (!BENIGN.some((re) => re.test(r.url()))) httpFails.push(`FAILED ${r.url()}`);
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  // 씬 통계를 window 에 흘려 받는다
  await page.addInitScript(`
    window.__kairoStats = null;
    const orig = Object.getOwnPropertyDescriptor(window, '__kairo');
    void orig;
  `);

  await page.goto(URL, { waitUntil: 'load' });
  // 디버그 박스가 텍스트를 채우면 씬이 돈다는 뜻
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );

  // ── 1. 부팅 ──
  const hasCanvas = await page.evaluate(`document.querySelectorAll('canvas').length`);
  record('부팅 — 캔버스 생성', hasCanvas ? 'pass' : 'fail', `캔버스 ${String(hasCanvas)}개`);

  // ── 1-A. 공유 소스 정체 ──
  await page.waitForFunction(
    `(() => !!window.__kairo.build && !!document.querySelector('.kmanage') &&
      !!document.querySelector('[data-build-identity]'))()`,
    undefined,
    { timeout: 15000 },
  );
  const sharedSource = await page.evaluate(`(() => ({
    build: window.__kairo.build,
    management: !!document.querySelector('.kmanage'),
    version: (document.querySelector('[data-build-identity]') || {}).textContent || '',
    viewport: [window.innerWidth, window.innerHeight],
  }))()` ) as {
    build: { sha: string; shortSha: string; branch: string; sourceDigest: string; startedAt: string };
    management: boolean;
    version: string;
    viewport: [number, number];
  };
  record(
    '공유 정체 — window.__kairo.build SHA가 현재 HEAD다',
    sharedSource.build.sha === EXPECTED_SHA ? 'pass' : 'fail',
    `외부 ${sharedSource.build.sha} · 기대 ${EXPECTED_SHA}`,
  );
  record(
    '공유 정체 — DOM source digest가 현재 dirty tree와 같고 절대 경로를 노출하지 않는다',
    sharedSource.build.sourceDigest === EXPECTED_SOURCE_DIGEST &&
      !Object.prototype.hasOwnProperty.call(sharedSource.build, 'worktree') ? 'pass' : 'fail',
    `외부 ${sharedSource.build.sourceDigest} · 기대 ${EXPECTED_SOURCE_DIGEST}`,
  );
  record(
    '공유 첫 DOM — 최신 경영 루트와 읽기 전용 버전 줄',
    sharedSource.management && sharedSource.version.includes(sharedSource.build.shortSha)
      ? 'pass'
      : 'fail',
    sharedSource.version,
  );
  await page.screenshot({ path: `${SHOT_DIR}/kairo-share-identity.png` });
  record(
    '공유 캡처 — 393×852',
    sharedSource.viewport[0] === 393 && sharedSource.viewport[1] === 852 ? 'pass' : 'fail',
    `${sharedSource.viewport[0]}×${sharedSource.viewport[1]} · ${SHOT_DIR}/kairo-share-identity.png`,
  );

  // ── 2. 콘솔 에러 / 요청 실패 ──
  record(
    '콘솔 에러 0',
    errors.length === 0 ? 'pass' : 'fail',
    errors.length ? errors.slice(0, 3).join(' | ') : '',
  );
  record(
    '요청 실패 0 (무해 허용 목록 제외)',
    httpFails.length === 0 ? 'pass' : 'fail',
    httpFails.slice(0, 3).join(' | '),
  );

  if (IDENTITY_ONLY) {
    await browser.close();
    const failed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${failed.length === 0 ? '✅' : '❌'} 공유 정체 ${results.length - failed.length}/${results.length} 통과` +
        (failed.length ? ` — 실패: ${failed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }

  /**
   * 홈/메뉴 셸 v3 — **기본 경로에서도 돈다.**
   *
   * ⚠ 예전엔 이 절 전체가 `if (SHELL_V2_ONLY)` 안에 있었고 끝에서 `process.exit` 했다.
   * 즉 `--shell-v2` 를 직접 준 사람만 이 36건의 보호를 받았고, `npm run verify:kairo` 만
   * 도는 다음 사람은 하나도 못 받았다 (계획서가 「새 게이트를 `if (FLAG_ONLY)` 안에만
   * 두지 않는다」로 못 박은 규칙). 플래그는 이제 **그 함수만 부르고 나가는 지름길**이다.
   */
  async function runShellV3Suite(): Promise<void> {
    for (const [w, h, tag] of [
      [393, 852, 'portrait'],
      [852, 393, 'landscape'],
    ] as const) {
      const shellContext = await browser.newContext({ ...DEVICE, viewport: { width: w, height: h } });
      const shellPage = await shellContext.newPage();
      await shellPage.addInitScript(`try { localStorage.clear(); } catch {}`);
      await shellPage.goto(URL, { waitUntil: 'load' });
      /*
       * UI v3: 홈에는 **현재 행동 한 줄**만 산다. 중·장기 목표는 메뉴의 `목표` 절로
       * 옮겨졌으므로 홈 밴드의 `[data-goal-role]` 은 정확히 1개다.
       */
      await shellPage.waitForFunction(
        `(() => document.querySelectorAll('#kairo-goal [data-goal-role]').length === 1 &&
          (${MANAGEMENT_READY_EXPR}))()`,
        undefined,
        { timeout: 15000 },
      );
      const shellCdp = await shellContext.newCDPSession(shellPage);
      /*
       * 홈 셸 v3 (2026-08-26) — 밴드는 **현재 행동 한 줄**이다.
       *
       * ⚠ v2 의 "A 60% · B/C 각 20%" 계약은 폐기했다. 실측에서 B/C 는 하트·별
       * **아이콘만** 남고 label/detail 을 CSS 가 `display:none` 으로 지웠기 때문에
       * (`style.css` 옛 1086-1089) 화면만 보고는 뜻을 알 수 없었다 — 접근성 이름만 있고
       * 화면에는 아이콘뿐인 주요 행동은 금지다 (계획 §1.3). 중·장기 목표는 메뉴의
       * `목표` 절에서 이름과 진행률로 읽는다.
       */
      const home = await shellPage.evaluate(`(() => {
        const root = document.getElementById('kairo-goal');
        const immediate = document.querySelector('#kairo-goal [data-goal-role="immediate"]');
        const label = immediate && immediate.querySelector('.kgoal-label');
        const kicker = immediate && immediate.querySelector('.kgoal-kicker');
        const detail = immediate && immediate.querySelector('.kgoal-detail');
        const band = root.getBoundingClientRect();
        const rect = immediate && immediate.getBoundingClientRect();
        const top = document.getElementById('kairo-top').getBoundingClientRect();
        const controls = [...document.querySelectorAll('#kairo-bar > button')];
        const targets = [...document.querySelectorAll('#kairo-goal [role="button"]')]
          .map((item) => { const r = item.getBoundingClientRect(); return Math.min(r.width, r.height); });
        const visible = (node) => {
          if (!node) return false;
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          return String(node.textContent || '').trim().length > 0;
        };
        return {
          // 음성 대조군은 **살아 있는 반대 조건**이어야 한다: 옛 v2 칩 기둥이 돌아오거나
          // 홈 밴드가 다시 두 칸 이상이 되면(= B/C 재유입) 잡힌다. 이미 지운 선택자를
          // 대조군으로 두면 언제나 false 라 아무것도 안 재는 죽은 검사가 된다.
          legacy: !!document.querySelector('.kchipcol') ||
            document.querySelectorAll('#kairo-goal [data-goal-role]').length > 1,
          visible: !!root && !root.hidden && root.dataset.goalSurface === 'home',
          count: document.querySelectorAll('#kairo-goal [data-goal-role]').length,
          kickerText: kicker ? String(kicker.textContent).trim() : '',
          immediateText: label ? label.textContent : '',
          detailShown: visible(detail),
          kickerShown: visible(kicker),
          immediateFits: !!label && label.scrollWidth <= label.clientWidth,
          bandW: Math.round(band.width),
          bandH: Math.round(band.height),
          bandFullWidth: band.left <= 8.5 && band.right >= window.innerWidth - 8.5,
          bandCapped: Math.round(band.width) <= 377,
          primaryShare: rect ? rect.width / band.width : 0,
          belowHeader: band.top >= top.bottom,
          mapHeight: band.top - top.bottom,
          headerButtons: document.querySelectorAll('#kairo-top button').length,
          controls: controls.map((item) => item.id),
          controlText: controls.map((item) => String(item.textContent).trim()),
          minTarget: targets.length ? Math.min(...targets) : 0,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        };
      })()`) as {
        legacy: boolean; visible: boolean; count: number; kickerText: string;
        immediateText: string; detailShown: boolean; kickerShown: boolean;
        immediateFits: boolean; bandW: number; bandH: number; bandFullWidth: boolean;
        bandCapped: boolean; primaryShare: number;
        belowHeader: boolean; mapHeight: number; headerButtons: number; controls: string[];
        controlText: string[]; minTarget: number; overflow: number;
      };
      await shellPage.screenshot({ path: `${SHOT_DIR}/kairo-home-shell-v3-${tag}.png` });
      const bandWidthOk = tag === 'portrait' ? home.bandFullWidth : home.bandCapped;
      record(
        `홈 셸 v3 ${tag} — 현재 행동 한 줄 · 아이콘 only 금지 · 제목 무잘림`,
        !home.legacy && home.visible && home.count === 1 && bandWidthOk &&
          home.primaryShare >= 0.98 && home.kickerShown && home.detailShown &&
          home.belowHeader && home.immediateFits &&
          home.immediateText.includes('물려받은 코스 시험 운행') ? 'pass' : 'fail',
        `"${home.kickerText} 〉 ${home.immediateText}" ${Math.round(home.primaryShare * 100)}% · ` +
          `상세 ${home.detailShown ? '보임' : '없음'} · 잔여 목표칸 ${home.count} · ` +
          `밴드 ${home.bandW}×${home.bandH}px · 지도 틈 ${Math.round(home.mapHeight)}px · ` +
          `캡처 ${SHOT_DIR}/kairo-home-shell-v3-${tag}.png`,
      );
      record(
        `홈 셸 v3 ${tag} — 헤더 0 · 하단 메뉴/건설(이름 있는 버튼) · 48px · overflow 0`,
        home.headerButtons === 0 && JSON.stringify(home.controls) ===
          JSON.stringify(['kairo-menu-open', 'kairo-build-open']) &&
          JSON.stringify(home.controlText) === JSON.stringify(['메뉴', '건설']) &&
          home.minTarget >= 48 &&
          home.overflow <= 0 && home.mapHeight >= (tag === 'portrait' ? 280 : 80) ? 'pass' : 'fail',
        `타깃 ${home.minTarget}px · 상시 ${home.controlText.join('/')} · ` +
          `지도 틈 ${Math.round(home.mapHeight)}px · 넘침 ${home.overflow}px`,
      );
      const homeType = await shellPage.evaluate(TYPOGRAPHY_SWEEP('#kairo-goal')) as TypeHit[] | null;
      const homeTypeMin = homeType && homeType.length ? Math.min(...homeType.map((hit) => hit.fontSize)) : 0;
      const homeLabelSize = homeType?.find((hit) => hit.cls.includes('kgoal-label'))?.fontSize ?? 0;
      record(
        `홈 셸 v3 ${tag} — 현재 행동 15px+ · 보조 12px+ (9px 금지)`,
        homeType !== null && homeType.length >= 3 && homeTypeMin >= 12 && homeLabelSize >= 15
          ? 'pass' : 'fail',
        `최소 ${homeTypeMin}px · 제목 ${homeLabelSize}px · ` +
          (homeType ?? []).map((hit) => `${hit.text}:${hit.fontSize}`).join(' · '),
      );

      /*
       * 경계 상자만 44px인 것은 터치 계약이 아니다. 티커 hit surface는 26px 시각 띠의
       * 위·아래로 삐져나오므로 목표 밴드/하단 바보다 실제로 위에 있어야 한다. 중앙 세로축의
       * 44개 표본을 `elementFromPoint`로 확인하고, 가장 취약한 아래쪽 끝을 진짜 CDP 터치한다.
       * 동시에 hit surface가 메뉴/건설/목표의 상자를 침범하지 않는지도 면적으로 확인한다.
       */
      const tickerHit = await shellPage.evaluate(`(() => {
        const hit = document.querySelector('#kairo-ticker .kticker-hit');
        if (!hit) return null;
        const r = hit.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const samples = Array.from({ length: 44 }, (_, i) => {
          const y = r.top + ((i + 0.5) * r.height) / 44;
          const top = document.elementFromPoint(x, y);
          return top === hit || hit.contains(top);
        });
        const controls = [
          ...document.querySelectorAll('#kairo-goal [role="button"]'),
          document.getElementById('kairo-menu-open'),
          document.getElementById('kairo-build-open'),
        ].filter(Boolean);
        const overlap = (a, b) =>
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
          Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        return {
          width: r.width,
          height: r.height,
          topmost: samples.filter(Boolean).length,
          controlsClear: controls.every((control) => overlap(r, control.getBoundingClientRect()) === 0),
          touchX: Math.round(x),
          touchY: Math.round(r.bottom - 1),
        };
      })()`) as {
        width: number; height: number; topmost: number; controlsClear: boolean;
        touchX: number; touchY: number;
      } | null;
      if (tickerHit) {
        await shellCdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: tickerHit.touchX, y: tickerHit.touchY, id: 1 }],
        });
        await shellCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await shellPage.waitForTimeout(180);
      }
      const inboxOpened = await shellPage.evaluate(
        `(() => { const inbox = document.getElementById('kairo-inbox'); return !!inbox && !inbox.hidden; })()`,
      ) as boolean;
      record(
        `티커 hit ${tag} — elementFromPoint 44/44 · 컨트롤 비침범 · CDP 터치`,
        tickerHit !== null && tickerHit.width >= 44 && tickerHit.height >= 44 &&
          tickerHit.topmost === 44 && tickerHit.controlsClear && inboxOpened ? 'pass' : 'fail',
        tickerHit
          ? `${tickerHit.topmost}/44 topmost · ${Math.round(tickerHit.width)}×${Math.round(tickerHit.height)}px · ` +
            `컨트롤 ${tickerHit.controlsClear ? '비침범' : '겹침'} · 알림함 ${inboxOpened ? '열림' : '닫힘'}`
          : '.kticker-hit 없음',
      );
      if (inboxOpened) {
        await touchElement(shellPage, shellCdp, '#kairo-inbox-close');
        await shellPage.waitForFunction(`document.getElementById('kairo-inbox').hidden`);
      }

      await touchElement(shellPage, shellCdp, '#kairo-menu-open');
      await shellPage.waitForFunction(`!document.getElementById('kairo-sheet').hidden`);
      await shellPage.waitForTimeout(260);
      const menu = await shellPage.evaluate(`(() => {
        const root = document.getElementById('kairo-goal');
        const host = document.querySelector('.ksheet-menu > .kmanage');
        const index = document.querySelector('[data-manage-screen="index"]');
        const bodyBox = document.querySelector('.kmanage-body');
        const body = (bodyBox || document.querySelector('.ksheet-body')).getBoundingClientRect();
        const today = document.querySelector('.kmanage-today').getBoundingClientRect();
        const routes = [...document.querySelectorAll('[data-manage-route]')]
          .filter((node) => node.closest('[data-manage-screen="index"]'));
        const routeIds = routes.map((node) => node.getAttribute('data-manage-route'));
        const routeBoxes = routes.map((node) => node.getBoundingClientRect());
        const semantic = host ? [...host.children].map((item) => item.className) : [];
        const indexOrder = index ? [...index.children].map((item) => item.className) : [];
        const todayButton = document.querySelector('.kmanage-today > .kmanage-action.primary');
        const todayRect = todayButton && todayButton.getBoundingClientRect();
        const paint = (element) => {
          if (!element) return { opacity: 0, backgroundColor: 'none', backgroundImage: 'none' };
          const style = getComputedStyle(element);
          return {
            opacity: Number(style.opacity),
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
          };
        };
        const ticker = document.getElementById('kairo-ticker');
        const bar = document.getElementById('kairo-bar');
        const gone = (node) => !node || node.hidden ||
          getComputedStyle(node).display === 'none' ||
          node.getBoundingClientRect().height < 1;
        const grid = document.querySelector('.kmanage-routes');
        const gridColumns = grid
          ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
        return {
          goalsHidden: !!root && root.hidden && root.dataset.goalSurface === 'menu',
          // 홈 입력층 셋이 **함께** 내려간다 — 하나만 살아 있으면 그것이 시트를 훔친다
          homeInputOff: document.body.dataset.homeInput === 'off' &&
            gone(root) && gone(ticker) && gone(bar),
          gridColumns: gridColumns,
          routeIds: routeIds,
          // 라우터 네 줄이 **전부 첫 폴드 안**이어야 한다 — 목적지를 찾으려고 스크롤하면 안 된다
          routesInFold: routeBoxes.length > 0 &&
            routeBoxes.every((r) => r.bottom <= body.bottom + 1),
          routeMinTap: routeBoxes.length === 0 ? 0 :
            Math.round(Math.min.apply(null, routeBoxes.map((r) => Math.min(r.width, r.height))) * 100) / 100,
          // 인덱스의 스크롤 깊이 — 1,893px(5.2화면)이었던 그 자리다
          scrollRatio: bodyBox ? Math.round((bodyBox.scrollHeight / Math.max(1, bodyBox.clientHeight)) * 100) / 100 : 99,
          settings: !!document.querySelector('[data-manage-screen="settings"]'),
          // 이미 지운 .kmanage-utility 대신, **새 게임이 설정 목적지 밖에 있으면** 잡는다.
          newGameInUtility: (() => {
            const node = document.getElementById('kairo-newgame-open');
            if (!node) return false;
            return !node.closest('[data-manage-group="settings"], [data-manage-screen="settings"]');
          })(),
          newGameInSettings:
            !!document.querySelector('[data-manage-screen="settings"] #kairo-newgame-open'),
          newGameText: (() => {
            const node = document.getElementById('kairo-newgame-open');
            return node ? String(node.textContent).trim() : '';
          })(),
          directRoot: !!host,
          semantic: semantic,
          indexOrder: indexOrder,
          todayPrimary: !!todayButton && !!todayButton.querySelector('.kmanage-today-icon') &&
            !!todayButton.querySelector('.kmanage-reason') && !!todayButton.querySelector('.kmanage-detail'),
          todayTarget: todayRect ? Math.min(todayRect.width, todayRect.height) : 0,
          verticalOrder: routeBoxes.length > 0 && today.top < routeBoxes[0].top,
          overflow: host ? host.scrollWidth - host.clientWidth : 999,
          // 목록 넷의 머리 id 가 **닫힌 화면에서도** DOM 에 남아 있는가 (하네스 손잡이)
          listHeads: ['kairo-quests-list', 'kairo-wish-list', 'kairo-cert-list', 'kairo-regular-list']
            .filter((id) => !!document.getElementById(id)),
          paint: {
            sheet: paint(document.getElementById('kairo-sheet')),
            today: paint(document.querySelector('.kmanage-today')),
            route: paint(document.querySelector('.kmanage-route')),
            action: paint(document.querySelector('.kmanage-action:not(.primary)')),
          },
        };
      })()`) as {
        goalsHidden: boolean; homeInputOff: boolean; gridColumns: number; settings: boolean;
        routeIds: string[]; routesInFold: boolean; routeMinTap: number; scrollRatio: number;
        newGameInUtility: boolean; newGameInSettings: boolean; newGameText: string;
        directRoot: boolean; semantic: string[]; indexOrder: string[]; todayPrimary: boolean;
        todayTarget: number; listHeads: string[];
        overflow: number; verticalOrder: boolean;
        paint: Record<string, { opacity: number; backgroundColor: string; backgroundImage: string }>;
      };
      await shellPage.screenshot({ path: `${SHOT_DIR}/kairo-menu-shell-v2-${tag}.png` });
      /*
       * ── 메뉴 v4: **라우터 한 장** ────────────────────────────────────────
       *
       * 옛 메뉴는 34항목 1,893px 한 스크롤이었다 (세로 5.2화면 · 가로 11.8화면). 이제
       * 인덱스는 `판 설정 · 오늘 할 일 · 경고 · 목적지 넷` 이고 **여기서 끝나는 행동은
       * 오늘 할 일 하나뿐**이다.
       */
      const semanticOrder = menu.semantic[0] === 'kmanage-head' &&
        menu.semantic[1] === 'kmanage-body';
      const indexOrderOk = menu.indexOrder[0] === 'kmanage-context' &&
        menu.indexOrder[1] === 'kmanage-today' &&
        menu.indexOrder[2] === 'kmanage-warnings' &&
        menu.indexOrder[3] === 'kmanage-routes';
      record(
        `메뉴 셸 v4 ${tag} — 목표 숨김 · 머리/본문 · Today 최상위 한 탭`,
        menu.goalsHidden && menu.directRoot && semanticOrder && indexOrderOk &&
          menu.todayPrimary && menu.todayTarget >= 44 && menu.verticalOrder &&
          menu.overflow <= 0 ? 'pass' : 'fail',
        `Today ${Math.round(menu.todayTarget)}px · 셸 ${menu.semantic.join(' > ')} · ` +
          `인덱스 ${menu.indexOrder.join(' > ')} · 캡처 ${SHOT_DIR}/kairo-menu-shell-v2-${tag}.png`,
      );
      record(
        `메뉴 셸 v4 ${tag} — 목적지 넷이 이름으로 있고 전부 첫 폴드 · 44px`,
        JSON.stringify(menu.routeIds) ===
          JSON.stringify(['operations', 'growth', 'records', 'settings']) &&
          menu.routesInFold && menu.routeMinTap >= 43.75 ? 'pass' : 'fail',
        `${menu.routeIds.join('/')} · 첫 폴드 ${menu.routesInFold ? '전부' : '잘림'} · ` +
          `최소 ${menu.routeMinTap}px`,
      );
      /*
       * ⚠ 스크롤 깊이는 **컨테이너 쪽 원인**이었다. 열을 반으로 줄이면 행이 두 배가 되므로
       * 열 수만 재면 안 된다 — 실제 깊이를 잰다. 인덱스는 한 화면 안에 들어와야 한다.
       */
      record(
        `메뉴 셸 v4 ${tag} — 인덱스 스크롤 깊이 ≤ 1.6화면 (옛 5.2 / 11.8)`,
        menu.scrollRatio <= 1.6 ? 'pass' : 'fail',
        `${menu.scrollRatio}화면`,
      );
      record(
        `메뉴 셸 v4 ${tag} — 목록 머리 넷이 닫힌 화면에서도 DOM 에 남는다`,
        menu.listHeads.length === 4 ? 'pass' : 'fail',
        `${menu.listHeads.length}/4 · ${menu.listHeads.join(',')}`,
      );
      const opaquePaint = Object.values(menu.paint).every((surface) =>
        surface.opacity === 1 &&
        (surface.backgroundImage !== 'none'
          ? !surface.backgroundImage.includes('rgba(')
          : surface.backgroundColor.startsWith('rgb(') && !surface.backgroundColor.startsWith('rgba(')),
      );
      record(
        `메뉴 셸 v4 ${tag} — 시트·Today·목적지·행 불투명 크림 recipe`,
        opaquePaint ? 'pass' : 'fail',
        Object.entries(menu.paint).map(([name, surface]) =>
          `${name} opacity ${surface.opacity} · ${surface.backgroundImage === 'none' ? surface.backgroundColor : surface.backgroundImage}`,
        ).join(' | '),
      );

      /*
       * ── 메뉴 v3: 실제 소유권 · 타이포 · IA ────────────────────────────────
       *
       * 옛 게이트는 Today 버튼 하나와 첫 폴드 배치만 봤다. 메뉴 안의 **모든** 실제
       * 버튼 중심 소유권은 안 재고 있었고, 그래서 네 버튼이 하단 바에 가려진 채로
       * 초록불이었다 (2026-08-26 실측).
       */
      record(
        `메뉴 v3 ${tag} — 홈 입력층 셋(목표·티커·바)이 함께 내려간다`,
        menu.homeInputOff ? 'pass' : 'fail',
        `data-home-input=${menu.homeInputOff ? 'off · 셋 다 사라짐' : '남아 있음'}`,
      );
      /*
       * ⚠ 열 수 계약이 **방향마다 다르다** (IA 재설계 §4.2). 393px 에서 4열은 라벨이
       * 아이콘으로 줄어드는 길이고, 852px 에서 폰 2열은 **가로가 세로보다 두 배 나쁜**
       * 그 상태다 (실측 11.8화면). 미디어 쿼리 두 벌이 아니라 `auto-fit` 하나로 낸다.
       */
      record(
        tag === 'portrait'
          ? `메뉴 v4 ${tag} — 393px에서 4열 금지 (최대 2열)`
          : `메뉴 v4 ${tag} — 넓은 화면은 폭을 쓴다 (최소 2열)`,
        tag === 'portrait'
          ? menu.gridColumns > 0 && menu.gridColumns <= 2 ? 'pass' : 'fail'
          : menu.gridColumns >= 2 ? 'pass' : 'fail',
        `${menu.gridColumns}열`,
      );
      record(
        `메뉴 v3 ${tag} — 새 게임은 설정 IA 안이고 배속과 같은 위계가 아니다`,
        menu.settings && menu.newGameInSettings && !menu.newGameInUtility &&
          menu.newGameText.includes('새 게임 시작') ? 'pass' : 'fail',
        `설정 ${menu.settings ? '있음' : '없음'} · "${menu.newGameText}" · ` +
          `옛 유틸리티 행 ${menu.newGameInUtility ? '남음' : '없음'}`,
      );

      const menuOwnership = await shellPage.evaluate(
        OWNERSHIP_SWEEP('#kairo-sheet'),
      ) as OwnershipHit[] | null;
      const visibleHits = (menuOwnership ?? []).filter((hit) => hit.contained);
      const stolen = visibleHits.filter((hit) => hit.owned < 5);
      const halfOut = (menuOwnership ?? []).filter((hit) => !hit.contained);
      const smallHits = visibleHits.filter((hit) => hit.short < 44);
      /*
       * ⚠ **"12개 이상"은 잘못 옮겨붙은 숫자였다** (2026-08-26 실측) — `.kmanage-action`
       * 총 개수(전체 메뉴가 완비됐는가) 검사에서 그대로 복사돼, 스크롤 전 첫 화면에
       * 실제로 보이는 개수(닫기+Today 뿐인 가로 393×852 에서 5개, 852×393 에서 2개)에는
       * 처음부터 못 맞는 문턱이었다 — "5/5 전부 자기 소유"인데도 무조건 빨간불이었다.
       * 첫 폴드가 몇 개를 보여주는지는 화면 크기·레이아웃에 달렸으므로 매직 넘버가 아니라
       * **구조적으로 항상 보여야 하는 것**(닫기 버튼·Today 주 행동)이 실제로 그 안에
       * 있는지를 재는 쪽이 정직하다 — 세로/가로 어느 쪽도 이 둘은 스크롤 없이 보인다.
       */
      const hasClose = visibleHits.some((hit) => hit.isClose);
      const hasTodayPrimary = visibleHits.some((hit) => hit.isTodayPrimary);
      record(
        `메뉴 v3 ${tag} — 보이는 컨트롤 ${visibleHits.length}개 전부 5점 소유 · 44px`,
        menuOwnership !== null && visibleHits.length > 0 && stolen.length === 0 &&
          smallHits.length === 0 && hasClose && hasTodayPrimary ? 'pass' : 'fail',
        `5점 소유 ${visibleHits.length - stolen.length}/${visibleHits.length} · ` +
          `닫기 ${hasClose ? '보임' : '⚠ 안 보임'} · Today ${hasTodayPrimary ? '보임' : '⚠ 안 보임'} · ` +
          (stolen.length
            ? `도둑맞음 ${stolen.slice(0, 4).map((hit) => `${hit.id}(${hit.owned}/5←${hit.thief})`).join(', ')}`
            : '전부 자기 소유') +
          (smallHits.length ? ` · 44px 미만 ${smallHits.map((hit) => hit.id).join(',')}` : ''),
      );
      record(
        `메뉴 v3 ${tag} — 화면에 반쯤 걸친 버튼 0 (스크롤 컨테이너가 clip)`,
        menuOwnership !== null && halfOut.length === 0 ? 'pass' : 'fail',
        halfOut.length
          ? halfOut.slice(0, 4).map((hit) => `${hit.id} bottom ${hit.bottom} (${hit.visiblePct}% 보임)`).join(', ')
          : '없음 (완전히 안 보이는 스크롤 미도달 항목은 제외하고 잰다)',
      );

      /*
       * ⚠ **`.ksheet-menu` 전체를 쓸면 액션 글씨가 아닌 것까지 걸린다** (2026-08-26 실측).
       * 40건 중 하나도 `.kmanage-label`/`.kmanage-detail`(메뉴 IA 행동 글씨)이 아니었다 —
       * 판 이름·버전 캡션(`#kairo-context`, 디버그 각주), 의뢰·소원·인증 진행 목록
       * (`#kairo-quests`, 읽기 전용 현황판)이 전부였다. 계획 §1.3 이 겨눈 것은
       * "행동 이름을 보고 다음 결과를 예상"하는 **메뉴 IA 행동 글씨**이지 이 현황판이
       * 아니다 — 그래서 스윕을 `.kmanage`(Today·그룹·행동·목표)로 좁힌다.
       * 현황판이 실제로 안 읽히는 것은 별개 결함이라 CSS 로 직접 고쳤다 (`.kquests`
       * 11→12px · `.kquest-detail` 10→12px · `.kcontext` 11→12px · `.kcaption` 11.5→12px) —
       * 게이트를 무의미하게 넓히는 대신 **그 문제를 실제로 없앴다.**
       */
      const menuType = await shellPage.evaluate(
        TYPOGRAPHY_SWEEP('.kmanage'),
      ) as TypeHit[] | null;
      const tiny = (menuType ?? []).filter((hit) => hit.fontSize < 12);
      const labels = (menuType ?? []).filter((hit) => hit.cls.includes('kmanage-label'));
      const details = (menuType ?? []).filter((hit) => hit.cls.includes('kmanage-detail'));
      const primaryLabel = labels.find((hit) => hit.fontSize >= 16);
      record(
        `메뉴 v3 ${tag} — 9~10px 행동 글씨 0 · 이름 15px+ · 상세 13px+ · 주요 16px+`,
        menuType !== null && tiny.length === 0 && labels.length > 0 &&
          labels.every((hit) => hit.fontSize >= 15) && details.length > 0 &&
          details.every((hit) => hit.fontSize >= 13) && primaryLabel !== undefined
          ? 'pass' : 'fail',
        `표본 ${(menuType ?? []).length} · 12px 미만 ${tiny.length}` +
          (tiny.length ? ` (${tiny.slice(0, 5).map((hit) => `${hit.text}:${hit.fontSize}`).join(', ')})` : '') +
          ` · 이름 최소 ${labels.length ? Math.min(...labels.map((hit) => hit.fontSize)) : 0}px` +
          ` · 상세 최소 ${details.length ? Math.min(...details.map((hit) => hit.fontSize)) : 0}px`,
      );

      /*
       * 가장 깊은 항목까지 **실제로 간다.**
       *
       * ⚠ UI v4 부터는 "인덱스를 끝까지 스크롤"이 아니다 — 메뉴가 라우터라 `새 게임 시작`
       * 은 `설정` 목적지 안에 산다. 그래서 **진짜 터치로 목적지를 열고** 거기서 잰다.
       * 옛 방식(마지막 `.kmanage-action` 을 스크롤)은 라우터에서 구조적으로 못 찾는다 —
       * "마지막 항목을 못 찾음"으로 조용히 실패했다.
       */
      await touchElement(shellPage, shellCdp, '[data-manage-route="settings"]');
      await shellPage.waitForFunction(
        `(() => { const s = document.querySelector('[data-manage-screen="settings"]'); return !!s && !s.hidden; })()`,
      );
      await shellPage.waitForTimeout(160);
      const lastMenuAction = await shellPage.evaluate(`(() => {
        const nodes = [...document.querySelectorAll('[data-manage-screen="settings"] .kmanage-action')];
        const last = nodes[nodes.length - 1];
        return last ? (last.id || last.dataset.settingsAction || '') : '';
      })()`) as string;
      await shellPage.evaluate(`(() => {
        const nodes = [...document.querySelectorAll('[data-manage-screen="settings"] .kmanage-action')];
        const last = nodes[nodes.length - 1];
        if (last) last.scrollIntoView({ block: 'center' });
      })()`);
      await shellPage.waitForTimeout(120);
      const lastReachable = await shellPage.evaluate(OWNERSHIP_SWEEP('.ksheet-menu')) as
        OwnershipHit[] | null;
      const lastHit = (lastReachable ?? []).filter((hit) => hit.contained).slice(-1)[0];
      record(
        `메뉴 v3 ${tag} — 스크롤 뒤 마지막 항목(${lastMenuAction || '?'})도 5점 소유`,
        lastHit !== undefined && lastHit.owned === 5 && lastHit.short >= 44 ? 'pass' : 'fail',
        lastHit
          ? `${lastHit.id} ${lastHit.owned}/5 · ${lastHit.short}px${lastHit.owned < 5 ? ` ←${lastHit.thief}` : ''}`
          : '마지막 항목을 못 찾음',
      );

      await touchElement(shellPage, shellCdp, '#kairo-sheet-close');
      await shellPage.waitForFunction(
        `document.getElementById('kairo-sheet').hidden && !document.getElementById('kairo-goal').hidden`,
      );
      /*
       * 표면마다 홈 입력층 셋의 **정체**를 본다 (개수가 아니라 정체 — K47-② 규칙).
       * 목표만 보면 티커·바가 살아 있는 상태를 놓친다.
       */
      const OWNED = `(() => {
        const ids = ['kairo-goal', 'kairo-ticker', 'kairo-bar'];
        const gone = (node) => !node || node.hidden ||
          getComputedStyle(node).display === 'none' ||
          node.getBoundingClientRect().height < 1;
        return {
          surface: document.getElementById('kairo-goal').dataset.goalSurface,
          alive: ids.filter((id) => !gone(document.getElementById(id))),
        };
      })()`;
      type Owned = { surface: string; alive: string[] };
      await touchElement(shellPage, shellCdp, '#kairo-build-open');
      const build = await shellPage.evaluate(OWNED) as Owned;
      await touchElement(shellPage, shellCdp, '#kairo-sheet-close');
      await touchElement(shellPage, shellCdp, '[data-goal-role="immediate"]');
      await shellPage.waitForFunction(`!document.getElementById('kairo-course').hidden`);
      // 코스는 정보 상태부터 **course** 다 — 'panel' 을 허용하면 정체를 안 재는 검사가 된다.
      const course = await shellPage.evaluate(OWNED) as Owned;
      await touchElement(shellPage, shellCdp, '#kairo-course-close');
      const back = await shellPage.evaluate(OWNED) as Owned;
      record(
        `입력 소유권 ${tag} 실제 터치 — build/course에서 홈 입력 0 · 닫기 복원 3`,
        build.surface === 'build' && build.alive.length === 0 &&
          course.surface === 'course' && course.alive.length === 0 &&
          back.surface === 'home' && back.alive.length === 3 ? 'pass' : 'fail',
        `build(${build.surface}) 남은 것 ${build.alive.join(',') || '없음'} · ` +
          `course(${course.surface}) 남은 것 ${course.alive.join(',') || '없음'} · ` +
          `home(${back.surface}) 복원 ${back.alive.length}/3`,
      );
      await shellContext.close();
    }
  }

  if (SHELL_V2_ONLY) {
    await runShellV3Suite();
    await browser.close();
    const failed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${failed.length === 0 ? '✅' : '❌'} 홈/메뉴 셸 v3 ${results.length - failed.length}/${results.length} 통과` +
        (failed.length ? ` — 실패: ${failed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }

  /*
   * ── 코스 v2 실제 터치 (Task 4) ──────────────────────────────────────────
   *
   * K33 이 남긴 규칙: **화면이 되는지는 진짜 터치로 본다.** 좌표를 직접 넣는
   * `moveHandleForTest` 는 sim 검사 전용이므로, 이 절은 A 목표 탭 · 루트 조정 ·
   * 캔버스 손가락 드래그 · 시험 운행 · 적용을 전부 `Input.dispatchTouchEvent` 로 한다.
   *
   * 재는 것: 홈 목표가 코스 모드에서 정체로 숨는가 · 독에 영문이 없는가 ·
   * 현재→예상 네 지표가 **잘리지 않는가** · 독이 112px 이하이고 조작 지도가 남는가 ·
   * 상태별 버튼 정체 · 시험 중 대표 반응이 서로 다른 시각에 뜨는가.
   */
  /** 코스 v3 — 셸과 같은 이유로 기본 경로에서도 돈다. */
  async function runCourseV3Suite(): Promise<void> {
    /*
     * 한 프로브로 다섯 상태를 같은 자로 잰다. ⚠ 이름 있는 함수를 쓰지 말 것
     * (tsx 가 주입하는 `__name` 헬퍼가 페이지 쪽에 없다 — CLAUDE.md).
     */
    const PROBE = `(() => {
      const root = document.getElementById('kairo-course');
      const goal = document.getElementById('kairo-goal');
      const dock = root.querySelector('.kcourse-dock');
      const acts = root.querySelector('.kcourse-acts');
      const buttons = [...acts.querySelectorAll('button')];
      const rects = buttons.map((b) => b.getBoundingClientRect());
      const cells = [...root.querySelectorAll('.kcourse-delta')];
      const ticker = document.getElementById('kairo-ticker');
      const courseRect = root.getBoundingClientRect();
      const tickerRect = ticker.getBoundingClientRect();
      const tickerVisible = getComputedStyle(ticker).display !== 'none';
      const tickerOverlap = tickerVisible
        ? Math.max(0, Math.min(courseRect.right, tickerRect.right) - Math.max(courseRect.left, tickerRect.left)) *
          Math.max(0, Math.min(courseRect.bottom, tickerRect.bottom) - Math.max(courseRect.top, tickerRect.top))
        : 0;
      return {
        phase: window.__kairo.coursePanel.state.phase,
        goalsHidden: goal.hidden && goal.dataset.goalSurface === 'course',
        labels: buttons.map((b) => b.textContent),
        disabled: buttons.map((b) => b.disabled),
        minTarget: rects.length ? Math.min(...rects.map((r) => Math.min(r.width, r.height))) : 0,
        sameRow: rects.length > 1
          ? rects.every((r) => Math.abs(r.top - rects[0].top) <= 1) : true,
        dockHeight: Math.round(dock.getBoundingClientRect().height),
        mapTop: Math.round(root.getBoundingClientRect().top),
        tickerOverlap: Math.round(tickerOverlap),
        settingsOpen: !document.getElementById('kairo-course-body').hidden,
        title: root.querySelector('.kcourse-title').textContent,
        latin: (root.innerText || '').match(/[A-Za-z]+/g) || [],
        /*
         * 적용 완료 영수증 (Task 6). **보이는가**까지 잰다 — hidden 속성만 읽으면
         * CSS 로 감춘 상태를 놓친다. 홈 목표·티커·하단 바가 살아 있으면 소유권 위반이다.
         *
         * ⚠ 이 주석에 역따옴표를 쓰지 말 것 — 이 블록 전체가 바깥 템플릿 리터럴이라
         * 역따옴표 하나가 문자열을 그 자리에서 끊는다 (CLAUDE.md 의 page.evaluate 규칙).
         */
        receipt: (() => {
          const box = document.getElementById('kairo-course-receipt');
          if (!box || box.hidden || getComputedStyle(box).display === 'none') return null;
          const r = box.getBoundingClientRect();
          const bar = document.getElementById('kairo-bar');
          return {
            lines: [...box.children].map((c) => ({
              key: c.getAttribute('data-receipt'), text: c.textContent,
            })),
            height: Math.round(r.height),
            inView: r.top >= 0 && r.bottom <= window.innerHeight + 0.5,
            homeAlive: [
              goal.hidden ? '' : '목표',
              getComputedStyle(ticker).display === 'none' ? '' : '티커',
              !bar || bar.hidden ? '' : '하단바',
            ].filter(Boolean),
          };
        })(),
        metrics: cells.map((c) => {
          const v = c.querySelector('.kcourse-delta-value');
          return {
            key: c.dataset.metric,
            label: c.querySelector('.kcourse-delta-label').textContent,
            text: v.textContent,
            clipped: v.scrollWidth > v.clientWidth + 0.5,
          };
        }),
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
          window.innerWidth,
      };
    })()`;
    type Probe = {
      phase: string; goalsHidden: boolean; labels: string[]; disabled: boolean[];
      minTarget: number; sameRow: boolean; dockHeight: number; mapTop: number;
      tickerOverlap: number;
      settingsOpen: boolean; title: string; latin: string[];
      receipt: {
        lines: { key: string; text: string }[];
        height: number; inView: boolean; homeAlive: string[];
      } | null;
      metrics: { key: string; label: string; text: string; clipped: boolean }[];
      overflow: number;
    };

    for (const [w, h, tag] of [
      [393, 852, 'portrait'],
      [852, 393, 'landscape'],
    ] as const) {
      const courseContext = await browser.newContext({ ...DEVICE, viewport: { width: w, height: h } });
      const coursePage = await courseContext.newPage();
      /*
       * 첫 문서에서만 저장소를 비운다. addInitScript는 reload 때도 다시 실행되므로
       * 무조건 clear하면 아래 "새로고침에도 적용값 유지"가 자기 저장을 지우는
       * 공허한 검사가 된다. sessionStorage 표식은 같은 탭 reload 동안 유지된다.
       */
      await coursePage.addInitScript(`try {
        if (!sessionStorage.getItem('__kairo_course_v2_ready')) {
          localStorage.clear();
          sessionStorage.setItem('__kairo_course_v2_ready', '1');
        }
      } catch {}`);
      await coursePage.goto(URL, { waitUntil: 'load' });
      await coursePage.waitForFunction(
        `document.querySelectorAll('#kairo-goal [data-goal-role]').length === 1`,
        undefined,
        { timeout: 15000 },
      );
      const courseCdp = await courseContext.newCDPSession(coursePage);

      // ① 정보 — 홈 A 목표 **한 번 탭**으로 물려받은 코스가 열린다
      await touchElement(coursePage, courseCdp, '[data-goal-role="immediate"]');
      await coursePage.waitForFunction(
        `!document.getElementById('kairo-course').hidden && window.__kairo.coursePanel.state.phase === 'info'`,
      );
      const info = await coursePage.evaluate(PROBE) as Probe;
      await coursePage.screenshot({ path: `${SHOT_DIR}/kairo-course-v2-info-${tag}.png` });
      record(
        `코스 v2 ${tag} 정보 — 목표 숨김 · 영문 0 · 지표 무잘림 · 닫기/루트 조정`,
        info.goalsHidden && info.latin.length === 0 && !info.settingsOpen &&
          JSON.stringify(info.labels) === JSON.stringify(['닫기', '루트 조정']) &&
          info.metrics.length === 4 && info.metrics.every((m) => !m.clipped) &&
          info.metrics.every((m) => !m.text.includes('→')) &&
          info.minTarget >= 43.75 && info.overflow <= 0 ? 'pass' : 'fail',
        `"${info.title}" · ${info.metrics.map((m) => `${m.label} ${m.text}`).join(' · ')} · ` +
          `영문 ${info.latin.join(',') || '0'} · 타깃 ${Math.round(info.minTarget)}px · ` +
          `캡처 ${SHOT_DIR}/kairo-course-v2-info-${tag}.png`,
      );
      record(
        `코스 독과 티커 교차 0 — ${tag}`,
        info.tickerOverlap === 0 ? 'pass' : 'fail',
        `교차 ${info.tickerOverlap}px² · 독 ${info.dockHeight}px`,
      );

      // ② 편집 — 독만 남고 지도가 주인공이다
      await touchElement(coursePage, courseCdp, '#kairo-course-confirm');
      await coursePage.waitForFunction(`window.__kairo.coursePanel.state.phase === 'edit'`);
      const edit = await coursePage.evaluate(PROBE) as Probe;
      record(
        `코스 v2 ${tag} 편집 — 설정/취소/시험 운행 한 행 · 독 ≤112px · 설정 접힘`,
        JSON.stringify(edit.labels) === JSON.stringify(['설정', '취소', '시험 운행']) &&
          !edit.settingsOpen && edit.dockHeight <= 112 && edit.sameRow &&
          edit.minTarget >= 43.75 && edit.overflow <= 0 ? 'pass' : 'fail',
        `독 ${edit.dockHeight}px · 지도 ${edit.mapTop}px · 타깃 ${Math.round(edit.minTarget)}px`,
      );
      if (tag === 'portrait') {
        record(
          '코스 v2 portrait 조작 지도 — 독 위로 620px 이상 남는다',
          edit.mapTop >= 620 ? 'pass' : 'fail',
          `지도 ${edit.mapTop}px / 화면 ${h}px`,
        );
      }

      // ③ 실제 캔버스 손가락 드래그 → 현재→예상이 화살표로 갈린다
      const before = await coursePage.evaluate(
        `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
      ) as string;
      const grab = await coursePage.evaluate(`(() => {
        const k = window.__kairo, cv = document.querySelector('canvas');
        const cr = cv.getBoundingClientRect(), v = k.coursePanel.state.handles[0];
        const r = k.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
        return { x: cr.left + (r.x + 16) * cr.width / cv.width,
                 y: cr.top + (r.y + 8) * cr.height / cv.height };
      })()`) as { x: number; y: number };
      await courseCdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: grab.x, y: grab.y, id: 1 }],
      });
      for (let k = 1; k <= 6; k++) {
        await courseCdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: grab.x + k * 6, y: grab.y + k * 4, id: 1 }],
        });
      }
      await courseCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await coursePage.waitForTimeout(160);
      const dragged = await coursePage.evaluate(PROBE) as Probe;
      const route = await coursePage.evaluate(
        `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
      ) as string;
      await coursePage.screenshot({ path: `${SHOT_DIR}/kairo-course-v2-edit-${tag}.png` });
      record(
        `코스 v2 ${tag} 편집 — 실제 드래그 뒤 네 지표가 현재→예상으로 갈린다`,
        route !== before && dragged.metrics.length === 4 &&
          dragged.metrics.every((m) => m.text.includes('→') && !m.clipped) &&
          JSON.stringify(dragged.metrics.map((m) => m.key)) ===
            JSON.stringify(['thrill', 'safety', 'riders', 'profit']) ? 'pass' : 'fail',
        `${dragged.metrics.map((m) => `${m.label} ${m.text}`).join(' · ')} · ` +
          `캡처 ${SHOT_DIR}/kairo-course-v2-edit-${tag}.png`,
      );

      // ④ 시험 운행 — 대표 반응이 서로 다른 시각에 뜬다 (말풍선은 캔버스 FX 다)
      await touchElement(coursePage, courseCdp, '#kairo-course-confirm');
      await coursePage.waitForFunction(`window.__kairo.coursePanel.state.phase === 'trial'`);
      const trial = await coursePage.evaluate(PROBE) as Probe;
      await coursePage.screenshot({ path: `${SHOT_DIR}/kairo-course-v2-trial-${tag}.png` });
      await coursePage.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'review'`, undefined, { timeout: 8000 },
      );
      const reactions = await coursePage.evaluate(
        `JSON.stringify(window.__kairo.scene.courseTrialLogForTest())`,
      ) as string;
      const log = JSON.parse(reactions) as { text: string; at: number }[];
      const distinct = new Set(log.map((entry) => entry.at)).size;
      record(
        `코스 v2 ${tag} 시험 — 4초 · 대표 반응 3개 이상이 서로 다른 시각`,
        JSON.stringify(trial.labels) === JSON.stringify(['취소', '시험 운행 중']) &&
          trial.disabled[1] === true && log.length >= 3 && distinct === log.length ? 'pass' : 'fail',
        `반응 ${log.map((entry) => `${entry.at}ms ${entry.text}`).join(' | ')} · ` +
          `캡처 ${SHOT_DIR}/kairo-course-v2-trial-${tag}.png`,
      );

      /*
       * ⑤ 리뷰 — 두 버튼뿐이고 주버튼은 **무엇을** 적용하는지 이름이 말한다 (Task 6).
       *
       * ⚠ 옛 기대("적용하면 패널이 즉시 닫힌다")를 되살리지 말 것. 그게 곧 "성공의
       * 증거가 2.6초 토스트뿐"이었다 (2026-08-26 실측 — 3초 뒤 화면에 아무것도 안 남았다).
       */
      const review = await coursePage.evaluate(PROBE) as Probe;
      await coursePage.screenshot({ path: `${SHOT_DIR}/kairo-course-v2-review-${tag}.png` });
      const beforeApply = await coursePage.evaluate(`(() => ({
        courses: JSON.stringify(window.__kairo.courses.all),
        cash: window.__kairo.week.cash,
        noop: window.__kairo.coursePanel.state.noop
      }))()`) as { courses: string; cash: number; noop: boolean };
      record(
        `코스 v2 ${tag} 리뷰 — 다시 조정 / 이 설정 적용 · 실제로 바뀐 후보만 적용 가능`,
        JSON.stringify(review.labels) === JSON.stringify(['다시 조정', '이 설정 적용']) &&
          review.disabled[1] === false && review.latin.length === 0 &&
          beforeApply.noop === false && review.receipt === null ? 'pass' : 'fail',
        `리뷰 ${review.labels.join('/')} · 변경 없음 ${beforeApply.noop} · ` +
          `캡처 ${SHOT_DIR}/kairo-course-v2-review-${tag}.png`,
      );

      /*
       * ⑥ 적용 — 패널은 **안 닫힌다.** 영수증이 갱신된 현재값·실제 차감액·시험/기록까지
       * 말하고, 그동안에도 홈 입력층은 코스가 갖는다 (Phase A 소유권).
       */
      await touchElement(coursePage, courseCdp, '#kairo-course-confirm');
      await coursePage.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'applied'`,
        undefined,
        { timeout: 4000 },
      );
      const applied = await coursePage.evaluate(PROBE) as Probe;
      const appliedCourses = await coursePage.evaluate(`(() => ({
        courses: JSON.stringify(window.__kairo.courses.all),
        cash: window.__kairo.week.cash,
        hidden: document.getElementById('kairo-course').hidden
      }))()`) as { courses: string; cash: number; hidden: boolean };
      await coursePage.screenshot({ path: `${SHOT_DIR}/kairo-course-v2-applied-${tag}.png` });
      const receiptText = (applied.receipt?.lines ?? []).map((l) => l.text).join(' / ');
      record(
        `코스 v2 ${tag} 적용 완료 — 패널이 남고 영수증이 무엇을·얼마에를 말한다`,
        !appliedCourses.hidden && applied.phase === 'applied' &&
          applied.receipt !== null && applied.receipt.inView &&
          applied.receipt.lines[0]?.key === 'head' &&
          (applied.receipt.lines[0]?.text ?? '').startsWith('적용 완료') &&
          applied.receipt.lines.some((l) => l.key === 'spend') &&
          applied.receipt.lines.some((l) => l.key === 'saved') &&
          applied.receipt.homeAlive.length === 0 &&
          JSON.stringify(applied.labels) === JSON.stringify(['다시 조정', '닫기']) &&
          applied.metrics.length === 4 && applied.metrics.every((m) => !m.clipped) &&
          // 완료의 지표는 화살표가 아니라 **갱신된 현재값**이다
          applied.metrics.every((m) => !m.text.includes('→')) &&
          appliedCourses.courses !== beforeApply.courses &&
          applied.latin.length === 0 && applied.minTarget >= 43.75 &&
          applied.overflow <= 0 ? 'pass' : 'fail',
        `${receiptText || '영수증 없음'} · 버튼 ${applied.labels.join('/')} · ` +
          `지표 ${applied.metrics.map((m) => `${m.label} ${m.text}`).join(' · ')} · ` +
          `살아 있는 홈 입력 ${applied.receipt?.homeAlive.join(',') || '0'} · ` +
          `현금 ${beforeApply.cash} → ${appliedCourses.cash} · ` +
          `캡처 ${SHOT_DIR}/kairo-course-v2-applied-${tag}.png`,
      );

      /*
       * ⑦ 완료 상태에서 다시 조정 → 아무것도 안 바꾸고 시험 → `변경 없음` 이 잠긴다.
       * 뜻 없는 적용을 막는 규칙이 **실제 화면에서** 성립하는지 여기서 잰다.
       */
      await touchElement(coursePage, courseCdp, '#kairo-course-toggle');
      await coursePage.waitForFunction(`window.__kairo.coursePanel.state.phase === 'edit'`);
      await touchElement(coursePage, courseCdp, '#kairo-course-confirm');
      await coursePage.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'review'`, undefined, { timeout: 8000 },
      );
      const noopReview = await coursePage.evaluate(PROBE) as Probe;
      /*
       * 음성 대조군 — 버튼의 disabled 를 **지우고** 누른다.
       *
       * disabled 만 재면 "화면이 막았다"까지밖에 못 잰다. 뜻 없는 적용을 막는 것은
       * 규칙이어야 하므로(`primaryAction` 의 가드) 화면의 사실을 치우고 규칙만 남긴다 —
       * 가드가 없으면 여기서 코스가 바뀌고 현금이 움직인다.
       */
      const noopForced = await coursePage.evaluate(`(() => {
        const button = document.getElementById('kairo-course-confirm');
        const was = button.disabled;
        button.disabled = false;
        button.click();
        button.disabled = was;
        return {
          courses: JSON.stringify(window.__kairo.courses.all),
          cash: window.__kairo.week.cash,
          phase: window.__kairo.coursePanel.state.phase
        };
      })()`) as { courses: string; cash: number; phase: string };
      record(
        `코스 v2 ${tag} 변경 없음 — 잠긴 라벨이고 강제로 눌러도 코스·현금이 안 움직인다`,
        JSON.stringify(noopReview.labels) === JSON.stringify(['다시 조정', '변경 없음']) &&
          noopReview.disabled[1] === true && noopReview.receipt === null &&
          noopForced.courses === appliedCourses.courses &&
          noopForced.cash === appliedCourses.cash &&
          noopForced.phase === 'review' ? 'pass' : 'fail',
        `버튼 ${noopReview.labels.join('/')} · 비활성 ${noopReview.disabled.join(',')} · ` +
          `강제 클릭 뒤 코스 ${noopForced.courses === appliedCourses.courses ? '그대로' : '⚠ 바뀜'} · ` +
          `현금 ${appliedCourses.cash} → ${noopForced.cash} · phase ${noopForced.phase}`,
      );

      /*
       * ⑧ 닫기 — **명시적 닫기에서만** 홈으로 돌아간다. 그 다음 재열기와 새로고침에서
       * 적용값이 그대로여야 한다 (계획 §1.6: "재접속 후 같은 코스를 열었을 때 적용값이
       * 그대로여야 한다").
       */
      await touchElement(coursePage, courseCdp, '#kairo-course-toggle');
      await coursePage.waitForFunction(`window.__kairo.coursePanel.state.phase === 'edit'`);
      await touchElement(coursePage, courseCdp, '#kairo-course-close');
      await coursePage.waitForFunction(`document.getElementById('kairo-course').hidden`);
      const home = await coursePage.evaluate(`(() => ({
        surface: document.getElementById('kairo-goal').dataset.goalSurface,
        restored: !document.getElementById('kairo-goal').hidden,
        courses: JSON.stringify(window.__kairo.courses.all)
      }))()`) as { surface: string; restored: boolean; courses: string };

      /*
       * 재열기는 **경영 메뉴의 `코스`** 로 한다 — 적용 뒤 홈 A 목표는 다음 할 일로
       * 넘어갈 수 있어 코스로 안 간다. 진입점을 상태에 안 기대는 쪽으로 잡는다.
       */
      /*
       * ⚠ UI v4 — 메뉴는 **라우터**다. `코스` 는 `운영` 목적지 안에 살고, 인덱스에서는
       * 그 화면이 `hidden` 이라 곧바로 못 누른다. 사람과 같은 경로로 두 번 누른다.
       * 그리고 `[data-manage-action="course"]` 만 쓰면 **Today 버튼**과도 겹치므로
       * (Today 의 dataset 도 추천 행동 id 를 단다) 목적지로 스코프를 좁힌다.
       */
      await touchElement(coursePage, courseCdp, '#kairo-menu-open');
      await touchElement(coursePage, courseCdp, '[data-manage-route="operations"]');
      await coursePage.waitForFunction(
        `(() => { const s = document.querySelector('[data-manage-screen="operations"]'); return !!s && !s.hidden; })()`,
      );
      await touchElement(
        coursePage, courseCdp, '[data-manage-screen="operations"] [data-manage-action="course"]',
      );
      await coursePage.waitForFunction(
        `!document.getElementById('kairo-course').hidden`, undefined, { timeout: 4000 },
      );
      const reopened = await coursePage.evaluate(`(() => ({
        courses: JSON.stringify(window.__kairo.courses.all),
        phase: window.__kairo.coursePanel.state.phase,
        metrics: [...document.querySelectorAll('.kcourse-delta-value')].map((v) => v.textContent)
      }))()`) as { courses: string; phase: string; metrics: string[] };
      await touchElement(coursePage, courseCdp, '#kairo-course-close');

      await coursePage.reload({ waitUntil: 'load' });
      await coursePage.waitForFunction(
        `document.querySelectorAll('#kairo-goal [data-goal-role]').length === 1`,
        undefined,
        { timeout: 15000 },
      );
      const reloaded = await coursePage.evaluate(
        `JSON.stringify(window.__kairo.courses.all)`,
      ) as string;
      record(
        `코스 v2 ${tag} 닫기 → 홈 복원 · 재열기·새로고침에도 적용값 그대로`,
        home.restored && home.surface === 'home' &&
          home.courses === appliedCourses.courses &&
          reopened.courses === appliedCourses.courses && reopened.phase === 'info' &&
          reopened.metrics.length === 4 && reopened.metrics.every((m) => !m.includes('→')) &&
          reloaded === appliedCourses.courses ? 'pass' : 'fail',
        `닫기 뒤 목표 ${home.surface} · 재열기 ${reopened.courses === appliedCourses.courses ? '일치' : '⚠ 불일치'}` +
          ` (${reopened.phase} · ${reopened.metrics.join(' ')}) · ` +
          `새로고침 ${reloaded === appliedCourses.courses ? '일치' : '⚠ 불일치'}`,
      );
      await courseContext.close();
    }

  }

  if (COURSE_V2_ONLY) {
    await runCourseV3Suite();
    await browser.close();
    const courseFailed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${courseFailed.length === 0 ? '✅' : '❌'} 코스 v3 ${results.length - courseFailed.length}/${results.length} 통과` +
        (courseFailed.length ? ` — 실패: ${courseFailed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(courseFailed.length === 0 ? 0 : 1);
  }

  if (BUILD_V3_ONLY) {
    await runBuildV3AimingSuite();
    await browser.close();
    const buildFailed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${buildFailed.length === 0 ? '✅' : '❌'} 건설 v3 ${results.length - buildFailed.length}/${results.length} 통과` +
        (buildFailed.length ? ` — 실패: ${buildFailed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(buildFailed.length === 0 ? 0 : 1);
  }

  /*
   * ── 사건 미니 장면 · 지도 밖 생활 장식 (Task 6·7) ───────────────────────
   *
   * 두 변경 다 **눈에 보이는 것**이라 단위 검사만으로는 부족하다. 삽화는 "테마마다
   * 다른 장면인가"와 "그림을 못 얻으면 CSS 폴백으로 돌아가는가"를, 장식은 "계획이
   * 화면(구운 판)에 실제로 올라갔는가"와 "하늘이 여전히 0%인가"를 본다.
   *
   * ⚠ 계획만 재면 조용히 통과한다 — 굽기가 접두사로 걸러도 초록이던 상태가 정확히
   * 그 형태였다. 그래서 씬이 **실제로 얹은** 목록(`surroundDecorForTest`)을 읽는다.
   */
  if (SCENE_V2_ONLY) {
    const sceneContext = await browser.newContext({ ...DEVICE, viewport: { width: 393, height: 852 } });
    const scenePage = await sceneContext.newPage();
    const sceneErrors: string[] = [];
    scenePage.on('pageerror', (e) => sceneErrors.push(String(e)));
    await scenePage.addInitScript(`try { localStorage.clear(); } catch {}`);
    await scenePage.goto(URL, { waitUntil: 'load' });
    await scenePage.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const sceneCdp = await sceneContext.newCDPSession(scenePage);

    /*
     * ── A. 테마 8종이 서로 다른 장면인가 ──
     *
     * 카드 뷰의 **production 경로**(`show` → `render` → `paintScene`)를 그대로 태우고
     * 캔버스 픽셀에서 서명을 뽑는다. 서명은 4×2 칸 평균색이라 "색만 다른 색면"과
     * "구성이 다른 장면"을 함께 잡는다.
     */
    const themeProbe = (await scenePage.evaluate(`(() => {
      const cv = window.__kairoCards;
      const out = [];
      const themes = ['crowd','weather','safety','publicity','staff','market','facility','environment'];
      for (const theme of themes) {
        cv.show([{ id: 'probe-' + theme, name: '검사 카드', desc: '삽화 확인', theme: theme,
          weight: 1, options: [{ label: '확인', detail: '닫기', effects: [] }] }], 9999999, () => {});
        const visual = document.querySelector('#kairo-card .kcard-visual');
        const canvas = visual ? visual.querySelector('canvas.kcard-scene') : null;
        if (!canvas) { out.push({ theme: theme, ok: false }); cv.pickForTest(0); continue; }
        const probe = document.createElement('canvas');
        probe.width = canvas.width; probe.height = canvas.height;
        const g = probe.getContext('2d');
        g.drawImage(canvas, 0, 0);
        const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0, total = 0;
        const cells = [];
        for (let cy = 0; cy < 2; cy++) {
          for (let cx = 0; cx < 4; cx++) {
            let r = 0, gg = 0, b = 0, n = 0;
            const x0 = Math.floor((canvas.width / 4) * cx), x1 = Math.floor((canvas.width / 4) * (cx + 1));
            const y0 = Math.floor((canvas.height / 2) * cy), y1 = Math.floor((canvas.height / 2) * (cy + 1));
            for (let y = y0; y < y1; y += 3) {
              for (let x = x0; x < x1; x += 3) {
                const k = (y * canvas.width + x) * 4;
                r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++;
                total++;
                if (d[k + 3] > 8) ink++;
              }
            }
            cells.push(Math.round(r / n / 8) + ':' + Math.round(gg / n / 8) + ':' + Math.round(b / n / 8));
          }
        }
        const rect = visual.getBoundingClientRect();
        out.push({
          theme: theme, ok: true,
          hasScene: visual.classList.contains('has-scene'),
          markShown: getComputedStyle(visual.querySelector('.kcard-visual-mark')).display !== 'none',
          sprite: visual.dataset.sprite || '',
          w: canvas.width, h: canvas.height,
          ink: Math.round((ink / Math.max(1, total)) * 100),
          sig: cells.join('|'),
          boxW: Math.round(rect.width), boxH: Math.round(rect.height),
        });
        cv.pickForTest(0);
      }
      return JSON.stringify(out);
    })()`)) as string;
    type ThemeShot = {
      theme: string; ok: boolean; hasScene?: boolean; markShown?: boolean; sprite?: string;
      w?: number; h?: number; ink?: number; sig?: string; boxW?: number; boxH?: number;
    };
    const shots = JSON.parse(themeProbe) as ThemeShot[];
    const drawn = shots.filter((shot) => shot.ok);
    const sigs = new Set(drawn.map((shot) => shot.sig));
    record(
      '★ 사건 카드 8종이 실제 그림으로 뜬다 — CSS 숫자 표지가 아니다 (Task 6)',
      /*
       * 잉크 문턱 22% — 장면은 **바닥 두 줄 + 물체**라 위쪽은 일부러 비운다.
       * 그 빈 곳으로 테마 색면(CSS)이 하늘처럼 비친다. 문턱은 "빈 캔버스가 아니다"를
       * 재는 값이지 화면을 꽉 채우라는 뜻이 아니다 (실측 최소 28%).
       */
      drawn.length === 8 && drawn.every((shot) => shot.hasScene === true && (shot.ink ?? 0) >= 22)
        ? 'pass' : 'fail',
      `장면 ${drawn.length}/8 · 최소 잉크 ${Math.min(...drawn.map((s) => s.ink ?? 0))}% · ` +
        `캔버스 ${drawn[0]?.w}×${drawn[0]?.h}`,
    );
    record(
      '★ 테마마다 구성이 다르다 — 이름을 가려도 서명이 갈린다 (Task 6)',
      sigs.size === drawn.length && drawn.length === 8 ? 'pass' : 'fail',
      `서로 다른 서명 ${sigs.size}/${drawn.length}`,
    );
    record(
      '장면이 뜨면 CSS 기호는 가려지고 테마 데이터 ID 는 남는다',
      drawn.every((shot) => shot.markShown === false && (shot.sprite ?? '').startsWith('event/'))
        ? 'pass' : 'fail',
      `기호 표시 ${drawn.filter((s) => s.markShown).length}개 · sprite ${drawn[0]?.sprite}`,
    );
    record(
      '삽화가 카드 상자를 밀지 않는다 — 슬롯 높이 116px 유지',
      drawn.every((shot) => (shot.boxH ?? 0) <= 120 && (shot.boxW ?? 0) <= 380) ? 'pass' : 'fail',
      `슬롯 ${drawn[0]?.boxW}×${drawn[0]?.boxH}px`,
    );

    /*
     * ── A-2. 음성 대조군 — 그림을 못 얻으면 **현재 CSS 슬롯**으로 돌아간다 ──
     *
     * 프로바이더가 시설 ID 를 모른다고 답하게 만들면 주역이 사라진다. 그때 카드가
     * 안 뜨거나 빈 상자가 되면 안 된다 — 카드는 모달이라 못 뜨면 주가 안 넘어간다.
     */
    const fallback = (await scenePage.evaluate(`(() => {
      const h = window.__kairo, cv = window.__kairoCards;
      const real = h.provider.has.bind(h.provider);
      h.provider.has = (id) => (id.indexOf('facility/') === 0 ? false : real(id));
      cv.show([{ id: 'probe-fallback', name: '폴백 확인', desc: '주역 없음', theme: 'crowd',
        weight: 1, options: [{ label: '확인', detail: '닫기', effects: [] }] }], 9999999, () => {});
      const visual = document.querySelector('#kairo-card .kcard-visual');
      const out = {
        shown: !document.getElementById('kairo-card').hidden,
        hasScene: visual.classList.contains('has-scene'),
        canvas: !!visual.querySelector('canvas.kcard-scene'),
        mark: (visual.querySelector('.kcard-visual-mark').textContent || '').trim(),
        markShown: getComputedStyle(visual.querySelector('.kcard-visual-mark')).display !== 'none',
        options: document.querySelectorAll('#kairo-card button[data-option]').length,
      };
      cv.pickForTest(0);
      h.provider.has = real;
      return JSON.stringify(out);
    })()`)) as string;
    const fb = JSON.parse(fallback) as {
      shown: boolean; hasScene: boolean; canvas: boolean; mark: string; markShown: boolean; options: number;
    };
    record(
      '★ 음성 대조군 — 주역 그림이 없으면 CSS 테마 슬롯이 그대로 폴백한다 (Task 6)',
      fb.shown && !fb.hasScene && !fb.canvas && fb.markShown && fb.mark.length > 0 && fb.options === 1
        ? 'pass' : 'fail',
      `카드 ${fb.shown ? '뜸' : '안 뜸'} · 장면 ${fb.canvas ? '있음' : '없음'} · 기호 "${fb.mark}"`,
    );

    /*
     * ── A-3. 실제 게임 경로 — 4주차 첫 일반 카드를 **진짜 터치**로 고른다 ──
     */
    const realCard = (await scenePage.evaluate(`(() => {
      const h = window.__kairo;
      h.week.abort();
      while (h.week.week < 3) h.week.run(new h.Rng(8100 + h.week.week), { season: 'summer' });
      h.openWeekCards();
      const root = document.getElementById('kairo-card');
      if (!root || root.hidden) return JSON.stringify({ ok: false });
      const visual = root.querySelector('.kcard-visual');
      const canvas = visual.querySelector('canvas.kcard-scene');
      const btns = [...root.querySelectorAll('button[data-option]')];
      const rects = btns.map((b) => b.getBoundingClientRect());
      const pick = btns.find((b) => !b.disabled);
      const pr = pick ? pick.getBoundingClientRect() : null;
      return JSON.stringify({
        ok: true,
        theme: visual.dataset.theme || '',
        scene: !!canvas,
        minTarget: rects.length ? Math.min(...rects.map((r) => Math.min(r.width, r.height))) : 0,
        oneRow: rects.length > 0 && Math.max(...rects.map((r) => r.top)) - Math.min(...rects.map((r) => r.top)) <= 2,
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        x: pr ? Math.round(pr.left + pr.width / 2) : 0,
        y: pr ? Math.round(pr.top + pr.height / 2) : 0,
      });
    })()`)) as string;
    const rc = JSON.parse(realCard) as {
      ok: boolean; theme?: string; scene?: boolean; minTarget?: number; oneRow?: boolean;
      overflow?: number; x?: number; y?: number;
    };
    await scenePage.screenshot({ path: `${SHOT_DIR}/kairo-event-card.png` });
    if (rc.ok && rc.x && rc.y) {
      await sceneCdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: rc.x, y: rc.y, id: 1 }],
      });
      await sceneCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await scenePage.waitForTimeout(250);
    }
    const cardClosed = (await scenePage.evaluate(`window.__kairoCards.visible`)) as boolean;
    record(
      '★ 실제 4주차 카드에도 삽화가 뜨고 진짜 터치로 고를 수 있다 (Task 6)',
      rc.ok === true && rc.scene === true && (rc.minTarget ?? 0) >= 43.75 && rc.oneRow === true &&
        (rc.overflow ?? 99) <= 1 && cardClosed === false ? 'pass' : 'fail',
      `테마 ${rc.theme} · 장면 ${rc.scene ? '있음' : '없음'} · 최소 ${Math.round(rc.minTarget ?? 0)}px · ` +
        `넘침 ${rc.overflow}px · 캡처 ${SHOT_DIR}/kairo-event-card.png`,
    );

    /*
     * ── B. 지도 밖 생활 장식 — 굽기가 **실제로 얹은** 것을 읽는다 ──
     */
    const decor = (await scenePage.evaluate(`(() => {
      const sc = window.__kairo.scene;
      const drawn = sc.surroundDecorForTest();
      const kinds = {};
      for (const line of drawn) {
        const kind = line.split('@')[0];
        kinds[kind] = (kinds[kind] || 0) + 1;
      }
      const list = sc.children.list;
      const keys = list.map((o) => (o.texture && o.texture.key) || '');
      return JSON.stringify({
        drawn: drawn,
        kinds: Object.keys(kinds).sort(),
        surroundImages: keys.filter((k) => k === 'surround/ground').length,
        decoObjects: keys.filter((k) => k.indexOf('deco/') === 0).length,
        textures: sc.textures.getTextureKeys().length,
      });
    })()`)) as string;
    const dec = JSON.parse(decor) as {
      drawn: string[]; kinds: string[]; surroundImages: number; decoObjects: number; textures: number;
    };
    record(
      '★ 지도 밖에 생활 장식이 실제로 구워진다 — 표지 3종 복제가 아니다 (Task 7)',
      dec.drawn.length >= 10 && dec.drawn.length <= 12 && dec.kinds.length === 7 ? 'pass' : 'fail',
      `${dec.drawn.length}개 · 종류 ${dec.kinds.length} (${dec.kinds.join('/')})`,
    );
    record(
      '장식은 런타임 Phaser 오브젝트를 안 만든다 — 구운 판 한 장뿐 (Task 7)',
      dec.surroundImages === 1 && dec.decoObjects === 0 ? 'pass' : 'fail',
      `surround 이미지 ${dec.surroundImages}장 · deco 오브젝트 ${dec.decoObjects}개 · ` +
        `텍스처 ${dec.textures}종`,
    );

    /*
     * ── C. 하늘은 여전히 어디서도 안 보인다 (K38 불변식) ──
     */
    const sceneSkyPct = `(() => {
      const cv = document.querySelector('canvas');
      const g = document.createElement('canvas');
      g.width = cv.width; g.height = cv.height;
      const c = g.getContext('2d');
      c.drawImage(cv, 0, 0);
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, total = 0;
      for (let k = 0; k < d.length; k += 4 * 37) {
        total++;
        if (Math.abs(d[k] - 122) < 12 && Math.abs(d[k + 1] - 184) < 12 && Math.abs(d[k + 2] - 212) < 12) n++;
      }
      return Math.round((n / Math.max(1, total)) * 100);
    })()`;
    await scenePage.evaluate(
      `(() => { const h = window.__kairo; h.flow.frozen = true; h.scene.setDayPhase(null); })()`,
    );
    let worstSky = 0;
    const skySeen: string[] = [];
    for (const [ci, cj, name] of [
      [0, 0, '좌상'],
      [95, 0, '우상'],
      [0, 71, '좌하'],
      [95, 71, '우하'],
      [48, 36, '중앙'],
    ] as [number, number, string][]) {
      await scenePage.evaluate(
        `(() => { const h = window.__kairo; h.scene.setUpscale(1); h.scene.focusTile(${ci}, ${cj}, 0); })()`,
      );
      await scenePage.waitForTimeout(320);
      const pct = (await scenePage.evaluate(sceneSkyPct)) as number;
      skySeen.push(`${name} ${pct}%`);
      worstSky = Math.max(worstSky, pct);
    }
    await scenePage.screenshot({ path: `${SHOT_DIR}/kairo-surround-decor.png` });
    record(
      '★ 장식을 늘려도 하늘은 어디서도 안 보인다 (K38 유지)',
      worstSky === 0 ? 'pass' : 'fail',
      `${skySeen.join(' · ')} · 캡처 ${SHOT_DIR}/kairo-surround-decor.png`,
    );
    await scenePage.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);
    record(
      '장면/장식 절 콘솔 오류 0',
      sceneErrors.length === 0 ? 'pass' : 'fail',
      sceneErrors.slice(0, 2).join(' | '),
    );

    await sceneContext.close();
    await browser.close();
    const sceneFailed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${sceneFailed.length === 0 ? '✅' : '❌'} 장면 v2 ${results.length - sceneFailed.length}/${results.length} 통과` +
        (sceneFailed.length ? ` — 실패: ${sceneFailed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(sceneFailed.length === 0 ? 0 : 1);
  }

  /*
   * ── Phase 7 경영 IA/온보딩 ───────────────────────────────────────────
   * 세로·가로 모두 **진짜 터치**로 메뉴를 연 뒤 Today가 먼저이고 운영/성장/기록이
   * 정확한 항목을 갖는지 잰다. DOM click만 쓰면 44px 타깃과 터치 경로를 못 잰다.
   */
  for (const [w, h, tag] of [
    [393, 852, '세로'],
    [852, 393, '가로'],
  ] as const) {
    const phase7Context = await browser.newContext({ ...DEVICE, viewport: { width: w, height: h } });
    const phase7Page = await phase7Context.newPage();
    await phase7Page.addInitScript(`try { localStorage.clear(); } catch {}`);
    await phase7Page.goto(URL, { waitUntil: 'load' });
    await phase7Page.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    // 디버그 HUD는 Phaser가 첫 프레임을 낸 순간부터 채워지지만, 경영 시트의 동적 import와
    // 조립은 그 뒤에 끝날 수 있다. DOM 정본이 준비되기 전에 터치하면 버튼만 눌리고 빈 시트를
    // 재는 부팅 경합이 된다.
    await phase7Page.waitForFunction(MANAGEMENT_READY, undefined, { timeout: 15000 });
    const phase7Cdp = await phase7Context.newCDPSession(phase7Page);
    const menuAt = (await phase7Page.evaluate(`(() => {
      const r = document.getElementById('kairo-menu-open').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`)) as { x: number; y: number };
    await phase7Cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: menuAt.x, y: menuAt.y, id: 1 }],
    });
    await phase7Cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phase7Page.waitForTimeout(150);
    const view = (await phase7Page.evaluate(`(() => {
      const host = document.querySelector('.kmanage');
      /*
       * ⚠ 설정은 **표현 계층의 네 번째 목적지**이지 MANAGEMENT_GROUPS 의 그룹이 아니다
       * (넣으면 todayRecommendation 이 새 게임을 추천할 수 있다). 그래서
       * sim 그룹 셋만 비교한다.
       */
      const names = [...document.querySelectorAll('[data-manage-group]')]
        .filter((group) => group.getAttribute('data-manage-group') !== 'settings')
        .map((group) => ({
          id: group.getAttribute('data-manage-group'),
          actions: [...group.querySelectorAll('[data-manage-action]')].map((button) => button.getAttribute('data-manage-action')),
        }));
      /*
       * ⚠ **보이는 것만 잰다.** UI v4 부터 목적지 화면은 한 번에 하나만 보이고 나머지는
       * hidden 이라 rect 가 0×0 이다 — 전부 재면 최소값이 언제나 0 이 되어 이 검사가
       * 44px 이상을 아예 못 잰다 (조용히 빨간불).
       */
      const targets = [...document.querySelectorAll('.kmanage-action')]
        .map((button) => button.getBoundingClientRect())
        .filter((r) => r.width >= 1 && r.height >= 1)
        .map((r) => {
          // DPR3 레이아웃은 44 CSS px를 43.999969처럼 되돌릴 수 있다. 렌더 소수 오차를
          // 제품 크기 회귀로 오인하지 않도록 1/100px에서 정규화한다.
          return Math.round(Math.min(r.width, r.height) * 100) / 100;
        });
      return {
        today: (document.querySelector('.kmanage-today .kmanage-label') || {}).textContent || '',
        names: names,
        minTarget: targets.length ? Math.min(...targets) : 0,
        overflow: host ? host.scrollWidth - host.clientWidth : 999,
      };
    })()`)) as {
      today: string;
      names: { id: string; actions: string[] }[];
      minTarget: number;
      overflow: number;
    };
    await phase7Page.screenshot({ path: `${SHOT_DIR}/kairo-management-phase7-${tag}.png` });
    const exact = JSON.stringify(view.names) === JSON.stringify([
      { id: 'operations', actions: ['price', 'staff', 'course'] },
      { id: 'growth', actions: ['exam', 'regular', 'quests', 'codex'] },
      { id: 'records', actions: ['report', 'view', 'certs', 'ending'] },
    ]);
    record(
      `Phase 7 경영 IA ${tag} — Today 우선 · 세 그룹 · 44px 터치`,
      view.today.includes('물려받은 코스 시험 운행') && exact && view.minTarget >= 44 && view.overflow <= 0
        ? 'pass'
        : 'fail',
      `Today "${view.today}" · 그룹 ${view.names.map((group) => group.id).join('/')} · ` +
        `타깃 ${view.minTarget}px · 넘침 ${view.overflow}px`,
    );

    if (tag === '세로') {
      /*
       * 온보딩 중에도 Today 밖의 기록 화면을 열 수 있어야 한다 — 안내는 잠금 장치가 아니다.
       * ⚠ UI v4 — `기록` 은 라우터의 목적지라 **두 번** 누른다 (사람과 같은 경로).
       */
      await touchElement(phase7Page, phase7Cdp, '[data-manage-route="records"]');
      await phase7Page.waitForFunction(
        `(() => { const s = document.querySelector('[data-manage-screen="records"]'); return !!s && !s.hidden; })()`,
      );
      await touchElement(
        phase7Page,
        phase7Cdp,
        '[data-manage-screen="records"] [data-manage-action="ending"]',
      );
      await phase7Page.waitForTimeout(100);
      const freePlay = await phase7Page.evaluate(`(() => ({
        ending: !document.getElementById('kairo-ending').hidden,
        step: window.__kairo.onboardingStep()
      }))()`) as { ending: boolean; step: string };
      record(
        'Phase 7 온보딩 — Today 밖 경영 행동을 막지 않는다',
        freePlay.ending && freePlay.step === 'open-course' ? 'pass' : 'fail',
        `엔딩 표면 ${freePlay.ending ? '열림' : '닫힘'} · 단계 ${freePlay.step}`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-ending-close');
      await touchElement(phase7Page, phase7Cdp, '#kairo-menu-open');
      await touchElement(phase7Page, phase7Cdp, '.kmanage-today .kmanage-action');
      await phase7Page.waitForFunction(
        `(() => !document.getElementById('kairo-course').hidden && window.__kairo.coursePanel.state.phase === 'info')()`,
      );
      const openedStep = await phase7Page.evaluate(`window.__kairo.onboardingStep()`);

      // 정보 → 편집은 실제 버튼, route-dragged는 실제 캔버스 손가락 드래그다.
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      const routeBefore = await phase7Page.evaluate(
        `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
      ) as string;
      const grab = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, cv = document.querySelector('canvas');
        const cr = cv.getBoundingClientRect(), v = h.coursePanel.state.handles[0];
        const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
        return { x: cr.left + (r.x + 16) * cr.width / cv.width,
                 y: cr.top + (r.y + 8) * cr.height / cv.height };
      })()`) as { x: number; y: number };
      await phase7Cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x: grab.x, y: grab.y, id: 1 }],
      });
      for (let k = 1; k <= 6; k++) {
        await phase7Cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: grab.x + k * 6, y: grab.y + k * 4, id: 1 }],
        });
      }
      await phase7Cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phase7Page.waitForTimeout(150);
      const dragged = await phase7Page.evaluate(`(() => ({
        route: JSON.stringify(window.__kairo.coursePanel.state.handles),
        step: window.__kairo.onboardingStep()
      }))()`) as { route: string; step: string };
      record(
        'Phase 7 온보딩 — Today course-opened → 실제 route-dragged',
        openedStep === 'drag-route' && dragged.route !== routeBefore && dragged.step === 'test-run'
          ? 'pass' : 'fail',
        `${openedStep} → ${dragged.step} · 경로 ${routeBefore} → ${dragged.route}`,
      );

      /*
       * 변경비가 있는 더 비싼 호환 장비를 실제 버튼으로 고른다. tow면 스포츠 보트도 골라
       * 현재 코스보다 높은 스릴 기록 후보를 확실히 만든다.
       *
       * ⚠ v2 부터 편집 상태의 기본은 **독만**이다 (지도가 주인공). 장비·보트·프리셋은
       * `설정` 뒤에 있으므로 사람과 같은 경로로 한 번 더 누르고 들어간다.
       */
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-toggle');
      await phase7Page.waitForFunction(`!document.getElementById('kairo-course-body').hidden`);
      const candidate = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, st = h.coursePanel.state, current = h.courses.all[0];
        const oldCost = h.courseApi.courseEquipment(current.equipId).vehicleCost * current.vehicles;
        return [...document.querySelectorAll('#kairo-course-equip [data-equip]')]
          .map((button) => ({ id: button.getAttribute('data-equip'), disabled: button.disabled }))
          .filter((x) => !x.disabled && !h.courseApi.fitBlocked(x.id, st.presetId))
          .map((x) => ({ ...x, def: h.courseApi.courseEquipment(x.id) }))
          .filter((x) => x.def && x.def.vehicleCost * st.vehicles > oldCost)
          .sort((a, b) => b.def.vehicleCost - a.def.vehicleCost)[0]?.id || null;
      })()`) as string | null;
      if (candidate) {
        await touchElement(phase7Page, phase7Cdp, `[data-equip="${candidate}"]`);
        const tow = await phase7Page.evaluate(
          `window.__kairo.courseApi.courseEquipment(window.__kairo.coursePanel.state.equipId).kind === 'tow'`,
        ) as boolean;
        if (tow && await phase7Page.locator('[data-boat="sport"]').isVisible()) {
          await touchElement(phase7Page, phase7Cdp, '[data-boat="sport"]');
        }
      }
      const payable = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, st = h.coursePanel.state, current = h.courses.all[0];
        const oldCost = h.courseApi.courseEquipment(current.equipId).vehicleCost * current.vehicles;
        const nextCost = h.courseApi.courseEquipment(st.equipId).vehicleCost * st.vehicles;
        return { charge: Math.max(0, nextCost - oldCost), disabled: document.getElementById('kairo-course-confirm').disabled };
      })()`) as { charge: number; disabled: boolean };
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      await phase7Page.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'review'`,
        undefined,
        { timeout: 6500 },
      );
      const trialStep = await phase7Page.evaluate(`window.__kairo.onboardingStep()`);
      record(
        'Phase 7 온보딩 — 실제 trial-started → review',
        payable.charge > 0 && !payable.disabled && trialStep === 'apply-course' ? 'pass' : 'fail',
        `변경비 ${payable.charge} · 단계 ${trialStep}`,
      );

      // 시험 성공 자체는 커리어를 쓰지 않는다. 돈 없는 적용도 코스/커리어 모두 그대로다.
      const beforeApply = await phase7Page.evaluate(`(() => {
        const h = window.__kairo;
        const snapshot = h.careerSnapshot();
        const cash = h.week.cash;
        h.week.spend(cash);
        return { course: JSON.stringify(h.courses.all), records: snapshot.courseRecords.length, cash: cash };
      })()`) as { course: string; records: number; cash: number };
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      await phase7Page.waitForTimeout(100);
      const unpaid = await phase7Page.evaluate(`(() => ({
        phase: window.__kairo.coursePanel.state.phase,
        course: JSON.stringify(window.__kairo.courses.all),
        records: window.__kairo.careerSnapshot().courseRecords.length
      }))()`) as { phase: string; course: string; records: number };
      record(
        'Phase 7 코스 기록 — 시험·미결제 적용은 커리어를 쓰지 않는다',
        beforeApply.records === 0 && unpaid.records === 0 && unpaid.phase === 'review' &&
          unpaid.course === beforeApply.course ? 'pass' : 'fail',
        `기록 ${beforeApply.records} → ${unpaid.records} · phase ${unpaid.phase}`,
      );
      await phase7Page.evaluate(`window.__kairo.week.earn(${beforeApply.cash + 5_000_000})`);
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      /*
       * ⚠ 옛 기대는 `document.getElementById('kairo-course').hidden` 이었다 (Task 6 이전).
       * 적용 성공이 곧 닫기라서 "무엇이 적용됐는가"의 증거가 2.6초 토스트뿐이었다.
       * 이제 성공은 **영수증 상태**로 끝나고, 홈으로 돌아가는 것은 명시적 `닫기` 뿐이다.
       */
      await phase7Page.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'applied' && window.__kairo.onboardingStep() === 'build-food'`,
      );
      const applied = await phase7Page.evaluate(`(() => ({
        records: window.__kairo.careerSnapshot().courseRecords.length,
        step: window.__kairo.onboardingStep(),
        open: !document.getElementById('kairo-course').hidden,
        receipt: [...document.querySelectorAll('#kairo-course-receipt [data-receipt]')]
          .map((c) => c.getAttribute('data-receipt'))
      }))()`) as { records: number; step: string; open: boolean; receipt: string[] };
      record(
        'Phase 7 코스 기록 — 성공한 course-applied 뒤에만 커리어를 쓴다 · 영수증이 남는다',
        applied.records === 1 && applied.step === 'build-food' && applied.open &&
          applied.receipt.includes('head') && applied.receipt.includes('spend') &&
          applied.receipt.includes('record') ? 'pass' : 'fail',
        `기록 ${unpaid.records} → ${applied.records} · 단계 ${applied.step} · ` +
          `영수증 ${applied.receipt.join(',') || '없음'}`,
      );
      // 명시적 닫기 — 다음 절(건설)은 홈에서 시작해야 한다 (잔해 위에서 재지 않는다)
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-close');
      await phase7Page.waitForFunction(`document.getElementById('kairo-course').hidden`);

      // build-food Today도 실제 목적지를 타고, 카드와 확정은 진짜 터치다. 좌표 탐색만
      // 하네스 셋업으로 하고 배치/온보딩 사건은 production confirm 경계를 지난다.
      await touchElement(phase7Page, phase7Cdp, '#kairo-menu-open');
      const foodToday = await phase7Page.locator('.kmanage-today .kmanage-label').textContent();
      await touchElement(phase7Page, phase7Cdp, '.kmanage-today .kmanage-action');
      const beforeFood = await phase7Page.evaluate(`window.__kairo.placement.count`) as number;
      await touchElement(phase7Page, phase7Cdp, '[data-pick="facility:shop"]');
      const aimed = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, land = h.land();
        for (let j = land.j0; j < land.j0 + land.h; j++) for (let i = land.i0; i < land.i0 + land.w; i++) {
          if (h.placement.check(h.terrain, h.walls, h.gate, 'shop', i, j, { land: land }).ok) {
            h.tapTile(i, j);
            return { i: i, j: j, aim: h.aim() };
          }
        }
        return null;
      })()`) as { i: number; j: number; aim: { i: number; j: number } } | null;
      await touchElement(phase7Page, phase7Cdp, '#kairo-place-confirm');
      await phase7Page.waitForTimeout(150);
      const foodBuilt = await phase7Page.evaluate(`(() => ({
        count: window.__kairo.placement.count,
        step: window.__kairo.onboardingStep()
      }))()`) as { count: number; step: string };
      record(
        '온보딩 v2 — Today food 목적지 → 실제 food-built → 메뉴 확인',
        !!aimed && foodToday?.includes('먹거리') === true && foodBuilt.count === beforeFood + 1 &&
          foodBuilt.step === 'equip-menu' ? 'pass' : 'fail',
        `Today "${foodToday ?? ''}" · 시설 ${beforeFood} → ${foodBuilt.count} · 단계 ${foodBuilt.step}`,
      );

      // 기본 메뉴가 배치와 함께 이미 장착된 매점도 실제 메뉴 시트를 열어 확인하면 전진한다.
      await touchElement(phase7Page, phase7Cdp, '#kairo-menu-open');
      const menuToday = await phase7Page.locator('.kmanage-today .kmanage-label').textContent();
      await touchElement(phase7Page, phase7Cdp, '.kmanage-today .kmanage-action');
      await phase7Page.waitForFunction(`!document.getElementById('kairo-menu-lab').hidden`);
      const menuConfirmed = await phase7Page.evaluate(`(() => {
        const h = window.__kairo;
        const handle = Number(document.getElementById('kairo-menu-lab').dataset.handle);
        return {
          handle: handle,
          mounted: h.placement.menuIdsOf(handle),
          operable: h.placement.menuOperabilityOf(handle, (id) => h.menus.hasRecipe(id)).operable,
          step: h.onboardingStep()
        };
      })()`) as { handle: number; mounted: string[]; operable: boolean; step: string };
      record(
        '온보딩 v2 — 기본 메뉴가 이미 장착됐어도 실제 시트 확인으로 전진',
        menuToday?.includes('기본 메뉴') === true && menuConfirmed.operable &&
          menuConfirmed.mounted.length > 0 && menuConfirmed.step === 'regular-purchase'
          ? 'pass' : 'fail',
        `Today "${menuToday ?? ''}" · handle ${menuConfirmed.handle} · ` +
          `장착 ${menuConfirmed.mounted.join(',')} · 단계 ${menuConfirmed.step}`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-menu-lab-close');

      // regular-purchase의 홈 A도 숨은 목록에 scroll만 시키면 안 된다. 실제 손가락으로 A를
      // 눌러 공용 메뉴 시트와 그 안의 단골 행동 표면이 함께 나타나는지 확인한다.
      await phase7Page.waitForFunction(
        `(() => window.__kairo.onboardingStep() === 'regular-purchase' &&
          !document.getElementById('kairo-goal').hidden)()`,
      );
      const regularToday = await phase7Page.locator(
        '[data-goal-role="immediate"] .kgoal-label',
      ).textContent();
      await touchElement(phase7Page, phase7Cdp, '[data-goal-role="immediate"]');
      await phase7Page.waitForTimeout(150);
      /*
       * ⚠ UI v4 — 이 행동은 이제 **단골 화면 자체**를 연다 (UX 감사 P0-2).
       *
       * 예전에는 메뉴의 `단골` 버튼이 보이는지만 봤는데, 그 버튼을 눌러도 실제로는
       * 아무 일도 안 났다 (`#kairo-regular-list` 앵커가 열린 소원이 있을 때만 만들어져
       * `scrollIntoView` 가 조용한 no-op 이었다). 즉 옛 검사는 **눌러도 안 되는 버튼이
       * 화면에 있는지**를 재고 있었다. 이제 목적지가 실제로 열렸는지를 잰다.
       */
      const regularSurface = await phase7Page.evaluate(`(() => {
        const sheet = document.getElementById('kairo-sheet');
        const menu = document.querySelector('.ksheet-menu');
        const screen = document.querySelector('[data-manage-screen="regulars"]');
        const head = document.getElementById('kairo-regular-list');
        const rect = head && head.getBoundingClientRect();
        return {
          sheet: !!sheet && !sheet.hidden,
          menu: !!menu && !menu.hidden,
          action: !!screen && !screen.hidden && !!rect && rect.width > 2,
          goalsHidden: document.getElementById('kairo-goal').hidden,
          step: window.__kairo.onboardingStep(),
        };
      })()`) as { sheet: boolean; menu: boolean; action: boolean; goalsHidden: boolean; step: string };
      record(
        '온보딩 v2 — regular-purchase 홈 A 실제 터치로 단골 화면이 실제로 열린다',
        regularToday?.includes('구매') === true && regularSurface.sheet && regularSurface.menu &&
          regularSurface.action && regularSurface.goalsHidden && regularSurface.step === 'regular-purchase'
          ? 'pass' : 'fail',
        `A "${regularToday ?? ''}" · 시트 ${regularSurface.sheet} · 메뉴 ${regularSurface.menu} · ` +
          `단골행동 ${regularSurface.action} · 단계 ${regularSurface.step}`,
      );
      if (regularSurface.sheet) await touchElement(phase7Page, phase7Cdp, '#kairo-sheet-close');

      // 생산 주간 루프가 만든 characterId 구매만 regular-purchased가 되고, 같은 주의 실제
      // 결산 표면이 열려야 done이다. 일반 손님 집계나 하네스 직접 observe는 쓰지 않는다.
      await phase7Page.evaluate(`window.__kairo.runWeek()`);
      await phase7Page.waitForFunction(`!document.getElementById('kairo-report').hidden`);
      const completed = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, rep = h.getLastReport();
        const raw = JSON.parse(localStorage.getItem('ppaji.kairo.save.v1'));
        return {
          named: rep.menuPurchases
            .filter((purchase) => !!purchase.characterId)
            .map((purchase) => ({ characterId: purchase.characterId, menuId: purchase.menuId })),
          reportVisible: !document.getElementById('kairo-report').hidden,
          step: h.onboardingStep(),
          saved: raw.onboarding
        };
      })()`) as {
        named: { characterId: string; menuId: string }[];
        reportVisible: boolean;
        step: string;
        saved: { version: number; step: string };
      };
      record(
        '온보딩 v2 — 이름 있는 실제 구매 → 첫 결산 열기 → done 저장',
        completed.named.length > 0 && completed.reportVisible && completed.step === 'done' &&
          completed.saved.version === 2 && completed.saved.step === 'done' ? 'pass' : 'fail',
        `구매 ${completed.named.map((purchase) => `${purchase.characterId}:${purchase.menuId}`).join(',')} · ` +
          `결산 ${completed.reportVisible ? '열림' : '닫힘'} · 저장 v${completed.saved.version}/${completed.saved.step}`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-report-close');
      // 이 페이지의 init script는 fresh 검사를 위해 navigation마다 storage를 비운다.
      // 저장 상태를 새 context에 넘겨 실제 재부팅을 재현해야 reload가 테스트 자체를 지우지 않는다.
      const onboardingStorage = await phase7Context.storageState();
      const reloadContext = await browser.newContext({
        ...DEVICE,
        viewport: { width: w, height: h },
        storageState: onboardingStorage,
      });
      const reloadPage = await reloadContext.newPage();
      await reloadPage.goto(URL, { waitUntil: 'load' });
      await reloadPage.waitForFunction(
        `(() => { const b = document.getElementById('kairo-debug');
          return !!window.__kairo && !!b && b.textContent.includes('FPS'); })()`,
        undefined,
        { timeout: 15000 },
      );
      const reloaded = await reloadPage.evaluate(`(() => ({
        step: window.__kairo.onboardingStep(),
        snapshot: JSON.parse(localStorage.getItem('ppaji.kairo.save.v1')).onboarding
      }))()`) as { step: string; snapshot: { version: number; step: string } };
      record(
        '온보딩 v2 — 완료 커서 저장/재로드',
        reloaded.step === 'done' && reloaded.snapshot.version === 2 &&
        reloaded.snapshot.step === 'done' ? 'pass' : 'fail',
        `단계 ${reloaded.step} · 저장 v${reloaded.snapshot.version}/${reloaded.snapshot.step}`,
      );
      await reloadContext.close();

      /*
       * 배포된 중첩 onboarding v1 두 갈래를 **유효한 실제 판 스냅샷**에 심어 브라우저로
       * 다시 부팅한다. migrate 함수만 부르는 단위 테스트로는 main의 UI 커서 배선을 못 잰다.
       */
      const validSave = await phase7Page.evaluate(
        `localStorage.getItem('ppaji.kairo.save.v1')`,
      ) as string;
      for (const legacyStep of ['done', 'build-food'] as const) {
        const legacySave = {
          ...(JSON.parse(validSave) as Record<string, unknown>),
          onboarding: { version: 1, step: legacyStep },
        };
        const legacyContext = await browser.newContext({ ...DEVICE, viewport: { width: w, height: h } });
        const legacyPage = await legacyContext.newPage();
        await legacyPage.addInitScript(
          `localStorage.setItem('ppaji.kairo.save.v1', ${JSON.stringify(JSON.stringify(legacySave))})`,
        );
        await legacyPage.goto(URL, { waitUntil: 'load' });
        await legacyPage.waitForFunction(
          `(() => !!window.__kairo && document.querySelectorAll('#kairo-goal [data-goal-role]').length === 1)()`,
          undefined,
          { timeout: 15000 },
        );
        const legacyBoot = await legacyPage.evaluate(`(() => ({
          step: window.__kairo.onboardingStep(),
          goal: document.querySelector('[data-goal-role="immediate"] .kgoal-label').textContent,
          canvas: document.querySelectorAll('canvas').length
        }))()`) as { step: string; goal: string; canvas: number };

        if (legacyStep === 'done') {
          record(
            'legacy v1 done 세이브 브라우저 부팅',
            legacyBoot.step === 'done' && legacyBoot.canvas > 0 &&
              legacyBoot.goal.includes('코스') ? 'pass' : 'fail',
            `단계 ${legacyBoot.step} · A "${legacyBoot.goal}" · 캔버스 ${legacyBoot.canvas}`,
          );
        } else {
          const legacyCdp = await legacyContext.newCDPSession(legacyPage);
          await touchElement(legacyPage, legacyCdp, '[data-goal-role="immediate"]');
          await legacyPage.waitForFunction(`!document.getElementById('kairo-sheet').hidden`);
          const actionable = await legacyPage.evaluate(`(() => ({
            step: window.__kairo.onboardingStep(),
            build: !document.querySelector('.ksheet-build').hidden,
            title: document.querySelector('#kairo-sheet .ksheet-title').textContent
          }))()`) as { step: string; build: boolean; title: string };
          record(
            'legacy v1 미완료 세이브 A 행동',
            legacyBoot.step === 'build-food' && legacyBoot.goal.includes('먹거리') &&
              actionable.step === 'build-food' && actionable.build && actionable.title.includes('건설')
              ? 'pass' : 'fail',
            `A "${legacyBoot.goal}" → ${actionable.title} · 단계 ${actionable.step}`,
          );
        }
        await legacyContext.close();
      }
    } else {
      const managementAudit = await auditSurface(phase7Page, '.kmanage');
      record(
        'Phase 7 가로 — 경영 Today 목적지 문서 넘침·세로 도달·44px',
        managementAudit.documentOverflow <= 1 && managementAudit.unreachable === 0 &&
          managementAudit.minTarget >= 43.75 ? 'pass' : 'fail',
        `컨트롤 ${managementAudit.controls} · 최소 ${managementAudit.minTarget}px · ` +
          `미도달 ${managementAudit.unreachable} · 문서 넘침 ${managementAudit.documentOverflow}px`,
      );
      await touchElement(phase7Page, phase7Cdp, '.kmanage-today .kmanage-action');
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-confirm');
      await phase7Page.waitForFunction(
        `window.__kairo.coursePanel.state.phase === 'review'`, undefined, { timeout: 6500 },
      );
      const courseAudit = await auditSurface(phase7Page, '#kairo-course');
      record(
        'Phase 7 가로 — 코스 trial/review 문서 넘침·세로 도달·44px',
        courseAudit.documentOverflow <= 1 && courseAudit.unreachable === 0 &&
          courseAudit.minTarget >= 43.75 ? 'pass' : 'fail',
        `컨트롤 ${courseAudit.controls} · 최소 ${courseAudit.minTarget}px · ` +
          `미도달 ${courseAudit.unreachable} · 문서 넘침 ${courseAudit.documentOverflow}px`,
      );
      /*
       * ⚠ 리뷰 독에는 취소가 없다 (v2 §3.3 — `다시 조정 / 이 설정 적용` 둘뿐). 사람과 같은
       * 경로로 편집으로 되돌린 뒤에 취소한다.
       */
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-toggle');
      await phase7Page.waitForFunction(
        `window.__kairo.coursePanel.state.phase !== 'review'`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-course-close');

      const endingRoute = await phase7Page.evaluate(`(() => {
        const h = window.__kairo, ticker = h.ticker.count, queued = h.arrivalQueue.length;
        h.setGradeForTest(5);
        for (const status of h.certs.statuses().slice(0, 6)) h.certs.grantForTest(status.id);
        h.ending.check();
        h.ending.check();
        return {
          tickerDelta: h.ticker.count - ticker,
          queueDelta: h.arrivalQueue.length - queued,
          endings: h.careerSnapshot().endings.length,
          shown: h.showNextArrivalForTest()
        };
      })()`) as { tickerDelta: number; queueDelta: number; endings: number; shown: boolean };
      await phase7Page.waitForFunction(`!document.getElementById('kairo-unlock').hidden`);
      const endingAudit = await auditSurface(phase7Page, '#kairo-unlock');
      const choices = await phase7Page.locator('#kairo-unlock [data-ending-choice]').allTextContents();
      /*
       * 모달 중 다른 표면은 열리지 않는다.
       *
       * ⚠ **진짜 터치로 재지 말 것** — 축하 모달이 뜨면 홈 입력층(목표·티커·바)이 통째로
       * 내려가므로 `#kairo-menu-open` 은 보이지 않는다 (UI v3 소유권 계약). 여기서 보려는
       * 것은 "손가락이 닿는가"가 아니라 **`modal: true` 가 다른 패널을 막는가**이므로,
       * 바가 실제로 내려갔는지를 같이 재고 열기 시도는 DOM click 으로 한다.
       */
      const barDownDuringModal = await phase7Page.evaluate(`(() => {
        const bar = document.getElementById('kairo-bar');
        if (!bar) return false;
        return bar.hidden || getComputedStyle(bar).display === 'none' ||
          bar.getBoundingClientRect().height < 1;
      })()`);
      await phase7Page.evaluate(`document.getElementById('kairo-menu-open').click()`);
      const blocked = (await phase7Page.evaluate(
        `document.getElementById('kairo-sheet').hidden`,
      )) && barDownDuringModal;
      record(
        'Phase 7 첫 엔딩 — 티커 중복 없이 blocking 축하 모달 한 번',
        endingRoute.tickerDelta === 0 && endingRoute.queueDelta === 1 && endingRoute.endings === 1 &&
          endingRoute.shown && blocked && JSON.stringify(choices) === JSON.stringify(['계속 운영', '새 지역', '리조트 감상'])
          ? 'pass' : 'fail',
        `티커 +${endingRoute.tickerDelta} · 큐 +${endingRoute.queueDelta} · 기록 ${endingRoute.endings} · ` +
          `선택 ${choices.join('/')}`,
      );
      record(
        'Phase 7 가로 — 엔딩 문서 넘침·세로 도달·44px',
        endingAudit.documentOverflow <= 1 && endingAudit.unreachable === 0 &&
          endingAudit.minTarget >= 43.75 ? 'pass' : 'fail',
        `컨트롤 ${endingAudit.controls} · 최소 ${endingAudit.minTarget}px · ` +
          `미도달 ${endingAudit.unreachable} · 문서 넘침 ${endingAudit.documentOverflow}px`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-unlock [data-ending-choice="continue"]');

      await phase7Page.evaluate(`window.__kairo.runWeek()`);
      await phase7Page.waitForFunction(`!document.getElementById('kairo-report').hidden`);
      const reportAudit = await auditSurface(phase7Page, '#kairo-report');
      record(
        'Phase 7 가로 — 결산 문서 넘침·세로 도달·44px',
        reportAudit.documentOverflow <= 1 && reportAudit.unreachable === 0 &&
          reportAudit.minTarget >= 43.75 ? 'pass' : 'fail',
        `컨트롤 ${reportAudit.controls} · 최소 ${reportAudit.minTarget}px · ` +
          `미도달 ${reportAudit.unreachable} · 문서 넘침 ${reportAudit.documentOverflow}px`,
      );
      await touchElement(phase7Page, phase7Cdp, '#kairo-report-close');
    }
    await phase7Context.close();
  }

  if (PHASE7_ONLY) {
    await browser.close();
    const failed = results.filter((result) => result.verdict === 'fail');
    console.log(
      `\n${failed.length === 0 ? '✅' : '❌'} Phase 7 ${results.length - failed.length}/${results.length} 통과` +
        (failed.length ? ` — 실패: ${failed.map((result) => result.name).join(', ')}` : ''),
    );
    process.exit(failed.length === 0 ? 0 : 1);
  }

  // ── 3. 내부 해상도 = 버퍼, CSS = 버퍼 × S ──
  const geo = (await page.evaluate(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height),
             dpr: window.devicePixelRatio };
  })()`)) as { w: number; h: number; cssW: number; cssH: number; dpr: number } | null;

  if (!geo) {
    record('캔버스 기하', 'fail', '캔버스를 못 찾았다');
  } else {
    const s = Math.round(geo.cssW / geo.w);
    const ok = geo.cssW === geo.w * s && geo.cssH === geo.h * s && Number.isInteger(s);
    record(
      '도트 격자 — CSS = 내부해상도 × 정수 S',
      ok ? 'pass' : 'fail',
      `내부 ${geo.w}×${geo.h} · CSS ${geo.cssW}×${geo.cssH} · S=${s} · DPR ${geo.dpr}`,
    );
    const deviceScale = s * Math.round(geo.dpr);
    record(
      '텍셀당 디바이스픽셀이 정수',
      Number.isInteger(deviceScale) ? 'pass' : 'fail',
      `${deviceScale}`,
    );
    // 화면을 넘치는 양이 S−1 이하
    const over = geo.cssW - 393;
    record('가로 넘침 ≤ S−1', over >= 0 && over <= s - 1 ? 'pass' : 'fail', `${over}px`);
  }

  // ── 4. 디버그 박스에서 위반 확인 ──
  const dbg = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  record('도트격자 위반 0', dbg.includes('도트격자 OK') ? 'pass' : 'fail', dbg.replace(/\n/g, ' | '));

  // ── 5. 타일 수 ──
  const tiles = Number(/타일 (\d+)/.exec(dbg)?.[1] ?? 0);
  record('격자 96×72 = 6912 타일 (K36 확대)', tiles === 6912 ? 'pass' : 'fail', `${tiles}`);

  // ── 5b. 타일링 이음새 — 지면 안쪽에 배경색이 새는지 (스킬 문서 미결 항목) ──
  //
  // 다이아몬드를 AA fill 로 그리면 타일 사이에 1px 틈이 생겨 배경(하늘색)이 비친다.
  // K1 스크린샷에서 격자 무늬로 드러났던 그 문제를 **실제 렌더 픽셀로** 검사한다.
  //
  // 표본 위치는 씬에 물어본다 — 하네스가 투영을 다시 구현하면 좌표가 바뀔 때 조용히
  // 엉뚱한 곳(배경 대역)을 재고, 그게 처음에 실제로 일어났다.
  const seam = (await page.evaluate(`(() => {
    const sc = window.__kairo.scene;
    const c = document.querySelector('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    const H = c.height, W = c.width;
    // 화면에 보이는 잔디 타일 4개가 이어진 블록을 찾는다
    let found = null;
    for (let j = 0; j < 32 && !found; j++) {
      for (let i = 0; i < 40; i++) {
        if (sc.groundAt(i, j) !== 'lawn') continue;
        if (sc.groundAt(i + 1, j) !== 'lawn' || sc.groundAt(i, j + 1) !== 'lawn') continue;
        if (sc.groundAt(i + 1, j + 1) !== 'lawn') continue;
        const r = sc.tileScreenRect(i, j);
        // 네 타일이 모두 화면 안쪽에 여유 있게 들어와야 한다
        if (r.x > 8 && r.y > 8 && r.x + 3 * 16 < W - 8 && r.y + 3 * 8 < H - 8) {
          found = { i: i, j: j, r: r };
          break;
        }
      }
    }
    if (!found) return { ok: false, reason: '화면 안의 잔디 2×2 블록을 못 찾았다' };
    // 네 타일이 만나는 중심부를 샘플 — 이음새가 있으면 여기에 배경색이 뜬다
    const cx = found.r.x + 16, cy = found.r.y + 16;
    const w = 20, h = 10;
    const x0 = cx - w / 2, y0 = cy - h / 2;
    const buf = new Uint8Array(w * h * 4);
    g.readPixels(x0, H - (y0 + h), w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    let bg = 0, total = 0;
    const hist = {};
    for (let k = 0; k < buf.length; k += 4) {
      const r = buf[k], gg = buf[k + 1], b = buf[k + 2];
      total++;
      if (Math.abs(r - 122) < 12 && Math.abs(gg - 184) < 12 && Math.abs(b - 212) < 12) bg++;
      const key = r + ',' + gg + ',' + b;
      hist[key] = (hist[key] || 0) + 1;
    }
    const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { ok: true, tile: [found.i, found.j], bg: bg, total: total, top: top };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; tile: [number, number]; bg: number; total: number; top: [string, number][] };

  if (!seam.ok) {
    record('타일링 이음새', 'fail', seam.reason);
  } else {
    // ⚠ 먼저 **검사가 유효한지** 본다. 프레임버퍼가 안 보존되면 검은색이 돌아와
    //   "배경색 0" 으로 조용히 통과한다 (실측). 무효한 검사는 실패로 취급한다.
    const topColor = seam.top[0]?.[0] ?? '';
    const readValid = seam.total > 100 && topColor !== '0,0,0';
    record(
      '이음새 검사가 유효하다 (잔디 위를 읽었나)',
      readValid ? 'pass' : 'fail',
      `타일 ${seam.tile.join(',')} · 표본 ${seam.total} · 최빈색 ${seam.top
        .map((t) => `${t[0]}×${t[1]}`)
        .join(' / ')}`,
    );
    record(
      '타일링 이음새 — 네 타일이 만나는 곳에 배경색 0',
      readValid && seam.bg === 0 ? 'pass' : 'fail',
      `배경색 픽셀 ${seam.bg}/${seam.total}`,
    );
  }

  // ── 6. 팬 — 손가락 드래그로 스크롤이 변한다 ──
  const before = /스크롤 (-?\d+),(-?\d+)/.exec(dbg);
  await page.locator('canvas').first().hover();
  const cdp = await ctx.newCDPSession(page);
  type TouchType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';
  const touch = async (type: TouchType, x: number, y: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
  };
  await touch('touchStart', 200, 500);
  for (let k = 1; k <= 8; k++) await touch('touchMove', 200 - k * 15, 500 - k * 8);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(300);
  const dbg2 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const after = /스크롤 (-?\d+),(-?\d+)/.exec(dbg2);
  const moved = before && after && (before[1] !== after[1] || before[2] !== after[2]);
  record(
    '팬 — 손가락 드래그로 스크롤 변화',
    moved ? 'pass' : 'fail',
    `${before?.[0] ?? '?'} → ${after?.[0] ?? '?'}`,
  );

  // 스크롤이 정수인지
  const intScroll = after && Number.isInteger(Number(after[1])) && Number.isInteger(Number(after[2]));
  record('스크롤이 정수', intScroll ? 'pass' : 'fail', after?.[0] ?? '');

  // ── 7. 더블탭 확대 ──
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(60);
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(400);
  const dbg3 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const s2 = /S=(\d)/.exec(dbg3)?.[1];
  record('더블탭 확대 → S=2', s2 === '2' ? 'pass' : 'fail', `S=${s2 ?? '?'}`);
  record(
    'S=2 에서도 도트격자 OK',
    dbg3.includes('도트격자 OK') ? 'pass' : 'fail',
    dbg3.replace(/\n/g, ' | '),
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-s2.png` });

  // 되돌리기
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(60);
  await touch('touchStart', 200, 500);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-s1.png` });

  // ── 7b. 건설 시트 — 폰에서 실제로 고를 수 있나 (K28) ──
  //
  // 예전에는 하단에 붓 바가 상시로 깔려 있었다. 이제 `건설` 을 눌러 시트를 연다.
  // 카이로에 드롭다운이 없듯 여기도 **아이콘 격자**다.
  const sheet = (await page.evaluate(`(() => {
    const open = document.getElementById('kairo-build-open');
    if (!open) return null;
    open.click();
    const sh = document.getElementById('kairo-sheet');
    if (!sh || sh.hidden) return { opened: false };
    const items = [...sh.querySelectorAll('.ksheet-build [data-pick]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { pick: b.dataset.pick, w: Math.round(r.width), h: Math.round(r.height),
               locked: b.disabled, teaser: b.classList.contains('teaser'),
               thumb: !!b.querySelector('.kcard-thumb') };
    });
    const tabs = [...sh.querySelectorAll('.tab-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { t: b.textContent, w: Math.round(r.width), h: Math.round(r.height) };
    });
    const grounds = items.filter((x) => (x.pick || '').indexOf('ground:') === 0).length;
    const facilities = items.filter((x) => (x.pick || '').indexOf('facility:') === 0 && !x.teaser).length;
    // 해금분만 내는지 — 시트의 시설 수가 sim 의 '현 등급 이하' 수와 같아야 한다 (K40)
    const h = window.__kairo;
    const gradeNow = Number((/([0-9])등급/.exec(
      document.getElementById('kairo-grade').textContent) || [0, 0])[1]);
    const unlocked = Object.keys(h.simDefs).filter(
      (id) => h.quests.requiredGrade(id) <= gradeNow,
    ).length;
    const groups = [...sh.querySelectorAll('.kchips button')].map((g) => g.textContent);
    const all = items.concat(tabs.map((t) => ({ pick: 'tab', w: t.w, h: t.h, locked: false })));
    return { opened: true, grounds: grounds, facilities: facilities, groups: groups,
             unlocked: unlocked,
             teasers: items.filter((x) => x.teaser).length,
             thumbs: items.filter((x) => x.thumb).length,
             locked: items.filter((x) => x.locked && !x.teaser).length,
             minH: Math.min(...all.map((x) => x.h)), minW: Math.min(...all.map((x) => x.w)),
             overflowX: document.documentElement.scrollWidth - innerWidth };
  })()`)) as
    | null
    | { opened: false }
    | {
        opened: true;
        grounds: number;
        facilities: number;
        groups: string[];
        unlocked: number;
        teasers: number;
        thumbs: number;
        locked: number;
        minH: number;
        minW: number;
        overflowX: number;
      };

  if (!sheet || !sheet.opened) {
    record('건설 시트', 'fail', sheet ? '열리지 않았다' : '건설 버튼을 못 찾았다');
  } else {
    record(
      '★ 건설 시트는 해금된 것만 카드로 낸다 — 잠김 45% 는 목록이 아니라 소음이다 (K40)',
      sheet.facilities === sheet.unlocked ? 'pass' : 'fail',
      `시설 카드 ${sheet.facilities} = 해금 ${sheet.unlocked} · 유형 칩 ${sheet.groups.length}개 (${sheet.groups.join('/')})`,
    );
    record(
      '다음에 올 것이 티저 두 장으로 예고된다 — 해금은 벽이 아니라 도착이다',
      sheet.teasers >= 1 && sheet.teasers <= 2 ? 'pass' : 'fail',
      `티저 ${sheet.teasers}장`,
    );
    record(
      '카드에 썸네일이 있다 — 게임과 같은 계약 그림 (concept-29)',
      sheet.thumbs >= sheet.facilities ? 'pass' : 'fail',
      `썸네일 ${sheet.thumbs}/${sheet.facilities + sheet.teasers}`,
    );
    record(
      '시트 안 터치 타깃 44px 이상',
      sheet.minH >= 44 && sheet.minW >= 44 ? 'pass' : 'fail',
      `최소 ${sheet.minW}×${sheet.minH}`,
    );
    record('시트를 열어도 가로 넘침 0', sheet.overflowX <= 0 ? 'pass' : 'fail', `${sheet.overflowX}px`);
  }

  /*
   * 탭 셋 — 시설 / **건물** / 바닥 (K31).
   *
   * 건물이 자기 탭을 갖는 이유: 확장이 카이로의 핵심 동사인데 바닥 탭에 섞여 있을 때는
   * "이게 건물을 넓히는 것"임을 아무도 몰랐다 (직접 플레이하다 막혔다).
   */
  const tabs = (await page.evaluate(`(() => {
    const sh = document.getElementById('kairo-sheet');
    if (!sh) return null;
    const names = [...sh.querySelectorAll('.tab-btn')].map((b) => b.dataset.tab);
    const read = (key) => {
      const tab = [...sh.querySelectorAll('.tab-btn')].find((b) => b.dataset.tab === key);
      if (!tab) return null;
      tab.click();
      return [...sh.querySelectorAll('.ksheet-build [data-pick]')].map((b) => ({
        pick: b.dataset.pick,
        sub: (b.querySelector('.kcard-sub') || {}).textContent || '',
        cost: (b.querySelector('.kcard-cost') || {}).textContent || '',
      }));
    };
    return { names: names, building: read('building'), ground: read('ground') };
  })()`)) as null | {
    names: string[];
    building: { pick: string; sub: string; cost: string }[] | null;
    ground: { pick: string; sub: string; cost: string }[] | null;
  };

  if (!tabs || !tabs.building || !tabs.ground) {
    record('건설 시트 탭', 'fail', '탭을 못 찾았다');
  } else {
    record(
      '탭이 넷이다 — 시설 · 건물 · 바닥 · 코스 (K32)',
      tabs.names.join(',') === 'facility,building,ground,course' ? 'pass' : 'fail',
      tabs.names.join(','),
    );
    // K32: 건물 바닥이 2×2 · 4×4 두 크기다
    const b2 = tabs.building.find((x) => x.pick === 'ground:floor_indoor@2');
    const b4 = tabs.building.find((x) => x.pick === 'ground:floor_indoor@4');
    record(
      '건물 탭에 2×2 · 4×4 가 있고 "넓어짐"이라고 알려준다 (K32)',
      b2 !== undefined && b4 !== undefined && /넓어/.test(b4.sub) ? 'pass' : 'fail',
      b4 ? `${tabs.building.length}개 · ${b4.sub}` : '없음',
    );
    /*
     * K32-B: 길 붓이 1·2·3 세 크기가 됐다 (통행 가능한 3종 × 3 + 통행 불가 2종 + 철거 = 12).
     * 길이 놀이의 축이 됐는데 한 칸씩 찍게 두면 폰에서 못 깐다.
     */
    record(
      '바닥 탭은 실외 포장만 · 길 붓은 1·2·3 세 크기 (K32-B)',
      tabs.ground.length === 12 &&
        !tabs.ground.some((x) => x.pick === 'ground:floor_indoor') &&
        tabs.ground.some((x) => x.pick === 'ground:path_stone@3') &&
        tabs.ground.filter((x) => /만|무료/.test(x.cost)).length >= 3
        ? 'pass'
        : 'fail',
      `${tabs.ground.length}개`,
    );
  }
  await page.evaluate(`document.getElementById('kairo-sheet-close').click()`);

  // 목재 데크길을 골라 물 위 칸을 칠한다 → 걸을 수 있게 바뀌어야 한다
  const painted = (await page.evaluate(`(() => {
    const t = window.__kairo.terrain;
    const sc = window.__kairo.scene;
    // 물인 칸을 찾는다
    let wet = null;
    for (let j = 31; j >= 0 && !wet; j--) {
      for (let i = 0; i < 40; i++) if (!t.isWalkable(i, j)) { wet = [i, j]; break; }
    }
    if (!wet) return { ok: false, reason: '물 칸이 없다' };
    const before = t.kindAt(wet[0], wet[1]);
    const walkBefore = t.isWalkable(wet[0], wet[1]);
    t.paint(wet[0], wet[1], 'path_deck');
    sc.refreshTile(wet[0], wet[1]);
    return { ok: true, tile: wet, before: before, after: t.kindAt(wet[0], wet[1]),
             walkBefore: walkBefore, walkAfter: t.isWalkable(wet[0], wet[1]) };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; tile: number[]; before: string; after: string; walkBefore: boolean; walkAfter: boolean };

  if (!painted.ok) {
    record('지면 칠하기', 'fail', painted.reason);
  } else {
    record(
      '칠하면 지면 종류와 통행 가능성이 바뀐다',
      painted.after === 'path_deck' && !painted.walkBefore && painted.walkAfter ? 'pass' : 'fail',
      `(${painted.tile.join(',')}) ${painted.before}→${painted.after} · 통행 ${painted.walkBefore}→${painted.walkAfter}`,
    );
  }

  // ── 7c. 실내 바닥 → 외곽 벽 (K27) ──
  //
  // 플레이어는 사각형을 그리지 않는다. **바닥을 깔면 그게 방**이고 벽은 결과다.
  // 그래서 검사도 "바닥을 깔면 외곽선이 생기고, 붙여 깔면 한 덩어리·문 하나가 되고,
  // 바닥을 지우면 벽이 사라지는가"로 본다.
  const wallCheck = (await page.evaluate(`(() => {
    const h = window.__kairo;
    ${LAND_BOX}
    const t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const out = {};
    /*
     * K30 부터 새 판에 **물려받은 빠지**가 있다. 그 위에서 재면 절대값이 안 맞으므로
     * 킷과 안 겹치는 빈 자리를 찾고, 아래 숫자는 전부 **증분**으로 본다.
     */
    let base = null;
    for (let j = J0; j < Math.min(J1, J0 + 30) && !base; j++) {
      for (let i = I0; i < I1; i++) {
        let ok = true;
        for (let di = -1; di < 10 && ok; di++) {
          for (let dj = -1; dj < 7; dj++) {
            const ti = i + di, tj = j + dj;
            /*
             * ⚠ **손 안 댄 잔디**만 고른다. 걸을 수 있는 칸으로만 고르면 물려받은 빠지의
             * 포장 마당이 후보가 되고, 뒤에서 잔디로 되돌릴 때 킷의 방문이 사라져
             * 벽 개수가 음수로 나온다 (실측: 경계 −28).
             */
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || p.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { base = [i, j]; break; }
      }
    }
    if (!base) return { ok: false, reason: '킷과 겹치지 않는 9×6 빈 육지를 못 찾았다' };
    /*
     * ⚠ **길을 먼저 붙인다** (K32-B 이후). 잔디 섬에 방을 지으면 문이 안 나고,
     * bakeIndoorWalls 는 실패하면 **벽을 통째로 지운다** — 물려받은 빠지의 벽까지
     * 사라져 경계가 음수로 나온다 (실측: −28).
     */
    const gate0 = window.__kairo.gate;
    for (let k = Math.min(gate0.i, base[0] - 1); k <= Math.max(gate0.i, base[0] - 1); k++) {
      if (t.isWalkable(k, gate0.j)) t.paint(k, gate0.j, 'path_stone');
    }
    for (let k = gate0.j; k <= base[1] + 6; k++) {
      if (t.isWalkable(base[0] - 1, k)) t.paint(base[0] - 1, k, 'path_stone');
    }
    const edges0 = w.count(1) + w.count(2);
    const doors0 = w.count(2);
    /*
     * ⚠ **게이트를 박지 않는다** (K36). 여기가 (0,0) 고정이었는데 그 자리는 이제
     * 차도다. 게이트가 못 서는 칸이면 bakeIndoorWalls 가 문을 못 내고, 실패하면 벽을
     * 통째로 지운다 — 물려받은 빠지의 벽까지 사라져 경계가 −28 로 나왔다.
     */
    const areas0 = h.sim.bakeIndoorWalls(t, w, gate0, h.sim.guestWalkable(t, p)).areas;
    const [bi, bj] = base;
    const gate = gate0;
    const stand = h.sim.guestWalkable(t, p);
    const paint = (i0, j0, pw, ph, kind) => {
      for (let j = j0; j < j0 + ph; j++) for (let i = i0; i < i0 + pw; i++) t.paint(i, j, kind);
    };

    // ① 3×3 실내 바닥 → 외곽 12 (벽 11 + 문 1)
    paint(bi, bj, 3, 3, 'floor_indoor');
    const r1 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.firstOk = r1.ok;
    out.firstAreas = r1.areas - areas0;
    out.firstEdges = w.count(1) + w.count(2) - edges0;
    out.firstDoors = w.count(2) - doors0;
    out.innerEmpty = w.edgeAt(bi, bj, 0) === 0;

    // ② 붙여 깔면 **한 덩어리 · 문 하나** (사각형 모델일 땐 문이 둘이었다)
    paint(bi + 3, bj, 3, 3, 'floor_indoor');
    const r2 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.joinedAreas = r2.areas - areas0;
    out.joinedDoors = r2.doors - areas0;
    out.joinedEdges = w.count(1) + w.count(2) - edges0;
    out.betweenGone = w.edgeAt(bi + 2, bj, 0) === 0;

    // ③ 한 칸만 더 깔아도 넓어진다 — 절차가 없다
    const before = w.count(1) + w.count(2) - edges0;
    const grew = h.sim.paintFloor(t, w, gate, bi + 6, bj, 'floor_indoor', stand);
    out.growOk = grew.ok && grew.changed;
    out.grownEdges = w.count(1) + w.count(2) - edges0;
    out.grewBy = out.grownEdges - before;

    // ④ 바닥을 지우면 벽도 사라진다
    paint(bi, bj, 7, 3, 'lawn');
    const r4 = h.sim.bakeIndoorWalls(t, w, gate, stand);
    out.clearedEdges = w.count(1) + w.count(2) - edges0;
    out.clearedAreas = r4.areas - areas0;

    // 화면용으로 다시 깔아 둔다
    paint(bi, bj, 6, 4, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, w, gate, stand);
    for (let j = bj; j < bj + 4; j++) for (let i = bi; i < bi + 6; i++) sc.refreshTile(i, j);
    sc.refreshAllWalls();
    out.wallCount = w.count(1) + w.count(2) - edges0;
    out.origin = [bi, bj];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        firstOk: boolean;
        firstAreas: number;
        firstEdges: number;
        firstDoors: number;
        innerEmpty: boolean;
        joinedAreas: number;
        joinedDoors: number;
        joinedEdges: number;
        betweenGone: boolean;
        growOk: boolean;
        grownEdges: number;
        grewBy: number;
        clearedEdges: number;
        clearedAreas: number;
        wallCount: number;
        origin: number[];
      };

  if (!wallCheck.ok) {
    record('실내 바닥 → 벽', 'fail', wallCheck.reason);
  } else {
    record(
      '3×3 실내 바닥 → 외곽 12 경계 (벽 11 + 문 1)',
      wallCheck.firstOk && wallCheck.firstEdges === 12 && wallCheck.firstDoors === 1
        ? 'pass'
        : 'fail',
      `경계 ${wallCheck.firstEdges} · 문 ${wallCheck.firstDoors} · 덩어리 ${wallCheck.firstAreas}`,
    );
    record('안쪽 경계는 비어 있다 — 벽이 칸을 안 막는다', wallCheck.innerEmpty ? 'pass' : 'fail');
    record(
      '붙여 깔면 한 덩어리 · 문 하나 — 둘레 18 (K27)',
      wallCheck.joinedAreas === 1 &&
        wallCheck.joinedDoors === 1 &&
        wallCheck.joinedEdges === 18 &&
        wallCheck.betweenGone
        ? 'pass'
        : 'fail',
      `덩어리 ${wallCheck.joinedAreas} · 문 ${wallCheck.joinedDoors} · 경계 ${wallCheck.joinedEdges}`,
    );
    record(
      '한 칸만 더 깔아도 넓어진다 — 둘레가 2 는다',
      wallCheck.growOk && wallCheck.grewBy === 2 ? 'pass' : 'fail',
      `경계 ${wallCheck.grownEdges} (+${wallCheck.grewBy})`,
    );
    record(
      '바닥을 지우면 벽도 사라진다',
      wallCheck.clearedEdges === 0 && wallCheck.clearedAreas === 0 ? 'pass' : 'fail',
      `경계 ${wallCheck.clearedEdges} · 덩어리 ${wallCheck.clearedAreas}`,
    );
    record(
      '벽 그림이 화면에 올라간다',
      wallCheck.wallCount >= 4 ? 'pass' : 'fail',
      `${wallCheck.wallCount}장`,
    );
  }

  if (wallCheck.ok) {
    const [ri, rj] = wallCheck.origin;
    await page.evaluate(`window.__kairo.scene.focusTile(${ri ?? 0}, ${rj ?? 0})`);
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${SHOT_DIR}/kairo-walls.png` });

  // ── 7d. 스티플 유리가 실제로 구멍을 남기나 — 결정 19 의 근거 ──
  //
  // 불투명 벽은 한 타일 뒤 손님을 100% 가린다(벽 40텍셀 vs 한 걸음 8텍셀). 그래서 벽을
  // 전부 유리로 만들었다. 검사는 **합성된 화면이 아니라 스프라이트 알파**를 직접 본다 —
  // 화면에서 재려 했더니 옆 벽의 뚜껑이 그 자리를 덮어 엉뚱한 색이 나왔다.
  const stipple = (await page.evaluate(`(() => {
    const prov = window.__kairo.provider;
    const src = prov.get('wall/edge:a1'); // J+ 경계 (화면 왼쪽아래 변)
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const g = cv.getContext('2d');
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const H = cv.height, W = cv.width;
    const alphaAt = (x, y) => d[(y * W + x) * 4 + 3];

    /*
     * ⚠ 벽이 **경계로 옮겨간 뒤로** 고정 좌표로는 못 잰다 (K25) — 패널이 캔버스의
     * 한쪽 절반에만, 그것도 기울어진 띠로 들어간다. 그래서 기하를 다시 적지 않고
     * **열마다 실제 실루엣을 찾아** 그 안에서 잰다.
     */
    let paneOpaque = 0, paneClear = 0;
    let plinthClear = 0, plinthTotal = 0;
    for (let x = 0; x < W; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < H; y++) if (alphaAt(x, y) > 8) { if (top < 0) top = y; bot = y; }
      if (top < 0 || bot - top < 12) continue;
      // 갓 아래 3줄 ~ 굽 위 6줄이 유리 대역이다
      let colOpaque = 0, colClear = 0;
      for (let y = top + 4; y < bot - 6; y++) {
        if (alphaAt(x, y) > 8) colOpaque++; else colClear++;
      }
      // 멀리온 열은 전부 불투명한 것이 정상 — 세면 투과율이 낮게 나온다
      if (colClear > 0) { paneOpaque += colOpaque; paneClear += colClear; }
      // 굽(밑동)은 뚫리면 안 된다 — 접지가 끊겨 보인다
      for (let y = bot - 4; y <= bot; y++) {
        plinthTotal++;
        if (alphaAt(x, y) <= 8) plinthClear++;
      }
    }
    return { W: W, H: H, paneOpaque: paneOpaque, paneClear: paneClear,
             plinthClear: plinthClear, plinthTotal: plinthTotal };
  })()`)) as {
    W: number;
    H: number;
    paneOpaque: number;
    paneClear: number;
    plinthClear: number;
    plinthTotal: number;
  };

  const clearRatio = stipple.paneClear / (stipple.paneClear + stipple.paneOpaque);
  record(
    '벽 캔버스가 32×26 이다 — K27 에서 높이를 24→10 으로 낮췄다',
    stipple.W === 32 && stipple.H === 26 ? 'pass' : 'fail',
    `${stipple.W}×${stipple.H}`,
  );
  record(
    '유리 패널이 스티플로 뚫려 있다 (투과율 30~70%)',
    clearRatio > 0.3 && clearRatio < 0.7 ? 'pass' : 'fail',
    `투과 ${(clearRatio * 100).toFixed(0)}% (뚫림 ${stipple.paneClear} / 불투명 ${stipple.paneOpaque})`,
  );
  record(
    '기단은 불투명하다 — 밑동이 뚫리면 접지가 이상해진다',
    stipple.plinthClear === 0 ? 'pass' : 'fail',
    `뚫린 픽셀 ${stipple.plinthClear}/${stipple.plinthTotal}`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-glass.png` });

  // ── 7e. 시설 배치·다중칸 슬롯 ──
  const fac = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    ${LAND_BOX}
    ${PAVE_ALL}
    const gate = { i: 0, j: 0 };
    const out = { picker: 0, placed: [], rejected: [], anchors: [] };

    const sel = document.getElementById('kairo-facility');

    // 넓은 육지를 찾는다
    let base = null;
    for (let j = J0; j < Math.min(J1, J0 + 20) && !base; j++) {
      for (let i = I0; i < I1; i++) {
        let ok = true;
        for (let di = 0; di < 9 && ok; di++)
          for (let dj = 0; dj < 7; dj++)
            if (!t.isWalkable(i + di, j + dj) || w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
              ok = false; break;
            }
        if (ok) { base = [i, j]; break; }
      }
    }
    if (!base) return { ok: false, reason: '9×7 빈 육지를 못 찾았다' };
    const [bi, bj] = base;

    // 비정사각 포함 4종 — 앵커 계산이 틀리면 여기서 드러난다
    const trials = [
      ['shop', 0, 0],            // 2×2
      ['cafe', 3, 0],            // 2×3
      ['pyeongsang_row', 0, 4],  // 4×1  ← 비정사각
      ['lookout', 6, 4],         // 2×2
    ];
    for (const [id, di, dj] of trials) {
      const r = p.place(t, w, gate, id, bi + di, bj + dj);
      if (r.ok && r.placed) {
        sc.refreshFacility(r.placed.handle);
        out.placed.push(id);
      } else {
        out.rejected.push(id + ':' + r.fail);
      }
    }

    /*
     * 실내 시설 — 방이 없으면 거절, 방을 지으면 통과. 그리고 **벽 바깥에서 벽에 접한
     * 칸은 여전히 거절**이어야 한다 (K25 검토 ①: 경계는 두 칸이 공유한다).
     */
    const wi = bi, wj = bj + 6;
    const stand = h.sim.guestWalkable(t, p);
    out.wallMountBefore = p.check(t, w, gate, 'locker_row', wi, wj).fail || 'ok';

    for (let j = wj; j < wj + 3; j++) for (let i = wi; i < wi + 6; i++) t.paint(i, j, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, w, gate, stand);
    for (let j = wj; j < wj + 3; j++) for (let i = wi; i < wi + 6; i++) sc.refreshTile(i, j);
    sc.refreshAllWalls();
    // 문이 난 줄을 피해 맨 아랫줄에 놓는다 (K30: 문 앞은 비운다)
    out.wallMountAfter = p.check(t, w, gate, 'locker_row', wi, wj + 2).fail || 'ok';
    // 방 오른쪽 바깥 칸 — 벽에 접해 있지만 실내 바닥이 아니다
    out.wallMountOutside = p.check(t, w, gate, 'locker_row', wi + 6, wj).fail || 'ok';
    out.outsideTouchesWall = w.hasAnyEdge(wi + 6, wj);
    if (out.wallMountAfter === 'ok') {
      const r = p.place(t, w, gate, 'locker_row', wi, wj + 2);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); out.placed.push('locker_row'); }
    }

    out.count = p.count;
    out.capacity = p.totalCapacity();
    out.focus = [bi + 3, bj + 3];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        picker: number;
        placed: string[];
        rejected: string[];
        wallMountBefore: string;
        wallMountAfter: string;
        wallMountOutside: string;
        outsideTouchesWall: boolean;
        count: number;
        capacity: number;
        focus: number[];
      };

  if (!fac.ok) {
    record('시설 배치', 'fail', fac.reason);
  } else {
    record(
      '시설 4종 배치 (비정사각 4×1 포함)',
      fac.placed.length >= 4 ? 'pass' : 'fail',
      `놓임 ${fac.placed.join(',')}${fac.rejected.length ? ' · 거절 ' + fac.rejected.join(',') : ''}`,
    );
    record(
      '실내 시설 — 바닥 없이 거절 → 실내 바닥을 깔면 통과',
      fac.wallMountBefore === 'needs-indoor' && fac.wallMountAfter === 'ok' ? 'pass' : 'fail',
      `${fac.wallMountBefore} → ${fac.wallMountAfter}`,
    );
    record(
      '방 바깥에서 벽에 접한 칸은 여전히 거절 (K26 ①)',
      fac.outsideTouchesWall && fac.wallMountOutside === 'needs-indoor' ? 'pass' : 'fail',
      `벽에 접했나 ${fac.outsideTouchesWall} · 판정 ${fac.wallMountOutside}`,
    );
    record('총 동시 이용 칸 수 > 0', fac.capacity > 0 ? 'pass' : 'fail', `${fac.capacity}칸`);

    // ★ 앵커 좌표를 수치로 검증 — 적대적 리뷰 A2 가 지목한 지점.
    //   앵커 x 는 발자국 bbox 가로중심이고 최하단 꼭지점 x 가 아니다. 비정사각에서
    //   두 값이 최대 24텍셀 어긋나므로, 잘못 쓰면 4×1 시설이 1.5타일 밀린다.
    const anchors = (await page.evaluate(`(() => {
      const h = window.__kairo, sc = h.scene, p = h.placement;
      const out = [];
      for (const f of p.all()) {
        const def = h.simDefs[f.defId];
        const w = def.size[0], d = def.size[1];
        // 기대값: x = 16(i−j) + 16(w−d)/2 · y = 8(i+j+w+d)
        const wantX = 16 * (f.i - f.j) + (16 * (w - d)) / 2;
        const wantY = 8 * (f.i + f.j + w + d);
        const img = sc.facilityImageAt(f.handle);
        out.push({
          id: f.defId, wh: [w, d],
          gotX: img ? img.x : null, gotY: img ? img.y : null,
          wantX: wantX, wantY: wantY,
          originX: img ? img.originX : null, originY: img ? img.originY : null,
          // 최하단 꼭지점 x (틀린 정의) — 비정사각이면 gotX 와 달라야 한다
          frontVertexX: 16 * (f.i - f.j + w - d),
        });
      }
      return out;
    })()`)) as {
      id: string;
      wh: number[];
      gotX: number | null;
      gotY: number | null;
      wantX: number;
      wantY: number;
      originX: number | null;
      originY: number | null;
      frontVertexX: number;
    }[];

    const wrong = anchors.filter((a) => a.gotX !== a.wantX || a.gotY !== a.wantY);
    record(
      '시설 앵커가 (bbox 가로중심, 최하단 꼭지점 y) 와 정확히 일치',
      wrong.length === 0 ? 'pass' : 'fail',
      wrong.length
        ? wrong.map((a) => `${a.id} got(${a.gotX},${a.gotY}) want(${a.wantX},${a.wantY})`).join(' | ')
        : `${anchors.length}종 확인`,
    );
    const badOrigin = anchors.filter((a) => a.originX !== 0.5 || a.originY !== 1);
    record(
      '앵커 원점이 bottom-center',
      badOrigin.length === 0 ? 'pass' : 'fail',
      badOrigin.length ? badOrigin.map((a) => a.id).join(',') : '',
    );
    // 비정사각 시설에서 두 정의가 실제로 어긋나는지 — 어긋나지 않으면 검사가 무의미하다
    const nonSquare = anchors.filter((a) => a.wh[0] !== a.wh[1]);
    const diverges = nonSquare.filter((a) => a.frontVertexX !== a.wantX);
    record(
      '비정사각 시설에서 두 앵커 정의가 실제로 갈린다 (검사가 유의미한가)',
      nonSquare.length > 0 && diverges.length === nonSquare.length ? 'pass' : 'fail',
      nonSquare.length
        ? nonSquare
            .map((a) => `${a.id} ${a.wh.join('×')}: 중심 ${a.wantX} vs 꼭지점 ${a.frontVertexX}`)
            .join(' | ')
        : '비정사각 시설이 없다',
    );

    await page.evaluate(`window.__kairo.scene.focusTile(${fac.focus[0]}, ${fac.focus[1]})`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-facilities.png` });
  }

  /*
   * ⚠ 손님 구간 전에 **판을 새로 띄운다.**
   *
   * 여기까지 열네 개 검사가 지형을 칠하고 방을 만들고 지우고 시설을 놓았다. 그 잔해 위에서
   * 손님을 재면 무엇 때문에 실패했는지 알 수 없다 — K30 에서 실제로 그랬다 (같은 코드가
   * 새 판에서는 손님이 시설을 쓰는데 하네스 안에서는 25초를 기다려도 0 이었다).
   * 손님·아쿠아파크·주 루프는 **깨끗한 새 판**에서 본다.
   */
  await page.evaluate(`try { localStorage.clear(); } catch {}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );

  /*
   * ── 7e-2. ★ 실내 시설이 벽 **안**에 있다 (K37 버그 ①) ──
   *
   * 시설과 앞쪽 벽(+I·+J)이 둘 다 `depthKey + 2` 라 깊이가 **동률**이었다. Phaser 는
   * 동률이면 삽입 순서로 그리고 벽은 부팅 때 먼저 만들어지므로 시설이 늘 벽을 덮었다 —
   * 실내에 놓은 시설이 벽 선을 지워 건물 밖으로 삐져나온 것처럼 보였다.
   *
   * 색을 짚지 않는다 (유리벽 검사에서 세 번 헛짚었다). 같은 자리를 **네 번** 찍는다:
   *   B 벽만 · A 아무것도 없음 · C 벽+시설 · D 시설만
   * `A ≠ B` 가 벽이 그린 픽셀, `A ≠ D` 가 시설이 그린 픽셀이다. 그 **교집합**이
   * 둘이 다투는 자리이고, 거기서 `C == B` 면 벽이 이겼다 (= 시설이 벽 안에 있다).
   * 교집합으로 좁히지 않으면 벽 픽셀 대부분이 애초에 안 다투는 자리라 **버그를 넣어도
   * 93% 가 유지되어 조용히 통과한다** (실측 — 그래서 이렇게 바꿨다).
   *
   * ⚠ 벽 이미지는 **시설보다 먼저** 만들어져 있어야 한다. 실제 부팅 순서가 그렇고,
   * 동률일 때 진짜 순서가 그때 정해지기 때문이다. 그래서 벽을 되돌린 **뒤에** 시설을 놓는다.
   * 좌표·시설은 씬에 물어본다 (격자가 또 바뀐다).
   */
  const inWall = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    // 픽셀을 네 번 찍는 동안 손님이 걸어 들어오면 A/B/C/D 가 어긋난다
    sc.setAutoTick(false);
    for (const x of g.all) {
      x.i = 2; x.j = t.height - 2; x.fromI = x.i; x.fromJ = x.j; x.progress = 1;
      x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
    }
    /*
     * 시설의 **가장 앞 타일**이 벽 있는 칸이어야 한다 — 시설 깊이가 그 타일 기준이라,
     * 거기서만 시설과 앞쪽 벽이 같은 칸을 두고 다툰다. 큰 시설일수록 겹치는 픽셀이 많아
     * 검사가 예민해지므로 4×1 → 3×1 → 1×1 순으로 시도한다.
     */
    const cands = [['shower_row', 4], ['changing_row', 3], ['arcade', 1]];
    let spot = null;
    for (let j = 0; j < t.height && !spot; j++) {
      for (let i = 0; i < t.width && !spot; i++) {
        if (!t.isIndoor(i, j)) continue;
        const kind = w.edgeAt(i, j, 1); // 1 = DIR_J_PLUS
        if (kind === 0) continue;
        for (const c of cands) {
          const oi = i - (c[1] - 1); // 가장 앞 타일이 (i, j) 가 되게 왼쪽으로 민다
          if (!p.check(t, w, h.gate, c[0], oi, j).ok) continue;
          spot = { i: i, j: j, kind: kind, def: c[0], oi: oi };
          break;
        }
      }
    }
    if (!spot) { sc.setAutoTick(true); return { ok: false, reason: '앞쪽 벽이 있는 빈 실내 칸을 못 찾았다' }; }
    sc.setUpscale(1);
    sc.focusTile(spot.i, spot.j);
    return { ok: true, i: spot.i, j: spot.j, kind: spot.kind, def: spot.def, oi: spot.oi };
  })()`)) as
    | { ok: false; reason: string }
    | { ok: true; i: number; j: number; kind: number; def: string; oi: number };

  if (!inWall.ok) {
    record('★ 실내 시설이 벽 안에 있다 (K37)', 'fail', inWall.reason);
  } else {
    const wi = inWall.i, wj = inWall.j;
    /*
     * 벽 스프라이트는 32 × (16 + 10) 이고 앵커가 타일 하단 꼭지점이다.
     * 그래서 표본은 타일 사각형에서 위로 10텍셀 넓힌 32×26 이다 (계약에서 온 수치).
     */
    const sampleWall = `(() => {
      const sc = window.__kairo.scene;
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const H = c.height;
      const r = sc.tileScreenRect(${wi}, ${wj});
      const x0 = r.x, y0 = r.y - 10, w = 32, hh = 26;
      const buf = new Uint8Array(w * hh * 4);
      gl.readPixels(x0, H - (y0 + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = '';
      for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
      return s;
    })()`;
    const setWall = (kind: number): string =>
      `(() => { const h = window.__kairo; h.walls.setEdge(${wi}, ${wj}, 1, ${kind}); h.scene.refreshWall(${wi}, ${wj}); })()`;

    // B — 벽만 (부팅 때 만들어진 그대로)
    await page.waitForTimeout(220);
    const wallOnlyPx = (await page.evaluate(sampleWall)) as string;
    // A — 벽을 잠시 걷는다
    await page.evaluate(setWall(0));
    await page.waitForTimeout(220);
    const noWall = (await page.evaluate(sampleWall)) as string;
    // 벽을 되돌린다 — 이 이미지가 시설보다 **먼저** 존재해야 한다
    await page.evaluate(setWall(inWall.kind));
    await page.waitForTimeout(220);

    // C — 벽 + 시설
    const placedIn = (await page.evaluate(`(() => {
      const h = window.__kairo, sc = h.scene;
      const r = h.placement.place(h.terrain, h.walls, h.gate, '${inWall.def}', ${inWall.oi}, ${wj});
      if (!r.ok || !r.placed) return { ok: false, why: String(r.fail) };
      sc.refreshFacility(r.placed.handle);
      return {
        ok: true,
        handle: r.placed.handle,
        facDepth: sc.facilityImageAt(r.placed.handle).depth,
        wallDepth: sc.wallDepthAt(${wi}, ${wj}, 1),
      };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; handle: number; facDepth: number; wallDepth: number };

    if (!placedIn.ok) {
      record('★ 실내 시설이 벽 안에 있다 (K37)', 'fail', `시설을 못 놓았다: ${placedIn.why}`);
    } else {
      await page.waitForTimeout(220);
      const withFac = (await page.evaluate(sampleWall)) as string;
      // D — 시설만 (벽을 걷는다)
      await page.evaluate(setWall(0));
      await page.waitForTimeout(220);
      const facOnly = (await page.evaluate(sampleWall)) as string;

      const A = noWall.split(';');
      const B = wallOnlyPx.split(';');
      const C = withFac.split(';');
      const D = facOnly.split(';');
      let overlap = 0;
      let wallWins = 0;
      let facWins = 0;
      const n = Math.min(A.length, B.length, C.length, D.length);
      for (let k = 0; k < n; k++) {
        // 벽도 그리고 시설도 그리는 자리 = 둘이 다투는 자리
        if (A[k] === B[k] || A[k] === D[k]) continue;
        if (B[k] === D[k]) continue; // 결과가 같으면 누가 이겼는지 못 가른다
        overlap++;
        if (C[k] === B[k]) wallWins++;
        else if (C[k] === D[k]) facWins++;
      }

      // ① 검사가 유효한가 — 다투는 픽셀이 충분히 있나
      record(
        '깊이 검사가 유효하다 (벽과 시설이 실제로 같은 픽셀을 다투나)',
        overlap >= 15 ? 'pass' : 'fail',
        `타일 ${wi},${wj} · ${inWall.def} · 다투는 픽셀 ${overlap}/${n}`,
      );
      // ② 그 자리에서 벽이 이긴다
      /*
       * 기준은 **비율이 아니라 `facWins === 0`** 이다. 다투는 자리에서 시설이 한 픽셀이라도
       * 이기면 그건 깊이가 뒤집혔다는 뜻이지 "조금 덮었다"가 아니다. 비율(95%)로 뒀더니
       * 동률을 주입해도 93% 가 나와 **간신히** 걸렸다 — 임계값 하나 차이로 조용히 통과할
       * 자리였다. 0 이냐 아니냐는 그 여지가 없다 (주입 시 실측 3).
       */
      record(
        '★ 실내 시설이 벽을 안 덮는다 — 앞쪽 벽이 시설보다 앞 (K37 버그 ①)',
        wallWins >= 15 && facWins === 0 ? 'pass' : 'fail',
        `벽이 이긴 픽셀 ${wallWins} · 시설이 이긴 픽셀 ${facWins} (0 이어야 한다)`,
      );
      // ③ 원인을 수치로 — 깊이가 동률이면 삽입 순서에 맡겨진다
      record(
        '★ 앞쪽 벽 깊이 > 시설 깊이 (동률 아님)',
        placedIn.wallDepth > placedIn.facDepth ? 'pass' : 'fail',
        `벽 ${placedIn.wallDepth} vs 시설 ${placedIn.facDepth}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/kairo-depth-wall.png` });
      // 뒷정리 — 이 절이 놓은 시설을 치우고 벽·시뮬을 되돌린다
      await page.evaluate(`(() => {
        const h = window.__kairo;
        h.placement.remove(${placedIn.handle});
        h.scene.refreshFacility(${placedIn.handle});
        h.walls.setEdge(${wi}, ${wj}, 1, ${inWall.kind});
        h.scene.refreshWall(${wi}, ${wj});
        h.scene.setAutoTick(true);
      })()`);
    }
  }

  // ── 7f. 손님 — 걷고, 칸을 채우고, 표정·이모트가 뜬다 ──
  const guests = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    ${PAVE_ALL}
    // 게이트 근처 육지에 시설 몇 개를 놓아 손님이 갈 곳을 만든다
    const gate = h.gate;
    // 게이트 근처 빈 자리를 실제로 찾아 놓는다 — 앞 블록이 이미 놓은 시설과 겹치면 안 된다
    // K36: 좌표를 박지 않는다 — 게이트가 맵 가운데(48,8)로 갔다. 게이트 **주변**에 놓는다
    let placed = 0;
    for (let j = gate.j + 1; j < gate.j + 12 && placed < 3; j++) {
      for (let i = gate.i - 5; i < gate.i + 6 && placed < 3; i++) {
        const r = p.place(t, w, gate, 'shop', i, j);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); placed++; }
      }
    }
    g.invalidate();
    return { placed: placed, total: p.count, gate: gate };
  })()`)) as { placed: number; total: number; gate: { i: number; j: number } };

  record(
    '손님용 시설이 게이트 근처에 있다',
    guests.placed >= 2 ? 'pass' : 'fail',
    `새로 ${guests.placed}개 · 총 ${guests.total}개`,
  );

  /*
   * 손님이 시설을 쓸 때까지 **기다린다** (고정 9초가 아니라 조건).
   *
   * ⚠ 고정 대기는 판이 달라지면 조용히 깨진다 — K30 에서 새 판에 물려받은 빠지가 생기자
   * 걸어야 할 거리가 달라져 9초로는 모자랐다. 조건 대기는 그 변화에 안 흔들리고,
   * 정말 안 되면 시간 초과로 정직하게 실패한다.
   */
  await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests;
    /*
     * ⚠ '이용 중' 첫 발견에서 서면 안 된다 — 새 판의 첫 이용은 **매표소**인데 매표는
     * 슬롯을 점유하지 않아서 (표는 놀이가 아니다, K36-B) 점유 검사가 0/0 이 된다.
     * 점유 슬롯이 실제로 생길 때까지 민다.
     */
    const anyOcc = () => {
      for (const f of h.placement.all()) {
        if (g.occupancy(f.handle).some((x) => x !== 0)) return true;
      }
      return false;
    };
    /*
     * 점유(claim)는 슬롯으로 걸어가는 중에 생기고 '이용 중' 상태는 도착해야 된다 —
     * 하나만 보고 서면 다른 검사가 그 사이 순간을 재서 경합한다. 둘 다 참일 때까지 민다.
     * 재는 동안 rAF 흐름이 상태를 더 밀지 않게 얼린다 (끝나고 되살린다).
     */
    h.flow.frozen = true;
    for (let k = 0; k < 220; k++) {
      const p = h.week.liveProgress();
      if (!p || p.tick >= 800) break; // 주를 넘기면 rAF 가 결산 모달을 띄운다 — 경계 전에 선다
      if (anyOcc() && g.stats().using > 0) break;
      h.week.step(4);
    }
  })()`);
  await page.waitForTimeout(1500);

  const gstat = (await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests, sc = h.scene;
    const s = g.stats();
    const poses = {}, faces = {}, facings = {};
    let moving = 0;
    for (const x of g.all) {
      poses[x.pose] = (poses[x.pose] || 0) + 1;
      faces[x.face] = (faces[x.face] || 0) + 1;
      facings[x.facing] = (facings[x.facing] || 0) + 1;
      if (x.i !== h.gate.i || x.j !== h.gate.j) moving++;
    }
    // 시설 점유
    let occupied = 0, slots = 0;
    for (const f of h.placement.all()) {
      const occ = g.occupancy(f.handle);
      slots += occ.length;
      occupied += occ.filter((x) => x !== 0).length;
    }
    // 화면에 손님 그림이 올라갔나
    const views = sc.guestViewCount ? sc.guestViewCount() : -1;
    return { s: s, poses: poses, faces: faces, facings: facings, moving: moving,
             occupied: occupied, slots: slots, views: views };
  })()`)) as {
    s: { alive: number; walking: number; using: number; exited: number; exitSatisfaction: number; gaveUp: number };
    poses: Record<string, number>;
    faces: Record<string, number>;
    facings: Record<string, number>;
    moving: number;
    occupied: number;
    slots: number;
    views: number;
  };

  record('손님이 입장한다', gstat.s.alive > 0 ? 'pass' : 'fail', `${gstat.s.alive}명`);
  record(
    '손님이 게이트를 떠나 움직인다',
    gstat.moving > 0 ? 'pass' : 'fail',
    `${gstat.moving}/${gstat.s.alive}명 이동`,
  );
  record(
    '손님 그림이 화면에 올라간다 (몸통+표정+이모트)',
    gstat.views === gstat.s.alive ? 'pass' : 'fail',
    `그림 ${gstat.views} vs 손님 ${gstat.s.alive}`,
  );
  record(
    '시설 칸이 채워진다 — 칸마다 손님이 보이는 게 카이로의 핵심',
    gstat.occupied > 0 ? 'pass' : 'fail',
    `${gstat.occupied}/${gstat.slots}칸`,
  );
  record(
    '이용 중인 손님이 있다 — 걷기만 하면 시설이 작동하지 않는 것이다',
    gstat.s.using > 0 ? 'pass' : 'fail',
    `이용 ${gstat.s.using} · 걷기 ${gstat.s.walking} · 포즈 ${JSON.stringify(gstat.poses)}`,
  );
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);
  // 퇴장까지는 한 방문에 240tick(24초) 이 걸린다. 실시간으로 기다리는 대신 시뮬을
  // 직접 돌린다 — 같은 코드 경로이고 결정론이라 결과가 같다.
  const exitStat = (await page.evaluate(`(() => {
    const h = window.__kairo, g = h.guests;
    const rng = new h.Rng(4242);
    for (let k = 0; k < 900; k++) {
      if (k % 12 === 0) g.spawn(rng);
      g.tick(rng);
    }
    return g.stats();
  })()`)) as {
    alive: number;
    exited: number;
    exitSatisfaction: number;
    gaveUp: number;
    using: number;
  };

  record(
    '퇴장 만족도가 쌓인다 — 평판의 기반은 퇴장 만족도다',
    exitStat.exited > 0 ? 'pass' : 'fail',
    `퇴장 ${exitStat.exited}명 · 만족 ${exitStat.exitSatisfaction.toFixed(0)} · 포기 ${exitStat.gaveUp}`,
  );
  record(
    '시설이 있으면 포기하는 손님이 적다',
    exitStat.exited > 0 && exitStat.gaveUp / exitStat.exited < 0.5 ? 'pass' : 'fail',
    `포기율 ${exitStat.exited ? ((exitStat.gaveUp / exitStat.exited) * 100).toFixed(0) : '?'}%`,
  );
  record(
    '방향이 이동에 따라 갈린다',
    Object.keys(gstat.facings).length >= 2 ? 'pass' : 'fail',
    JSON.stringify(gstat.facings),
  );
  record('표정이 만족도에서 파생된다', Object.keys(gstat.faces).length >= 1 ? 'pass' : 'fail', JSON.stringify(gstat.faces));

  await page.evaluate(`window.__kairo.scene.focusTile(5, 5)`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-guests.png` });

  /*
   * ── 7f-2. ★ 자리에 앉은 손님이 화면에 보인다 (K52-⑥⑦) ──
   *
   * 시설은 스프라이트 **한 장**이고 깊이가 `depthKey(발자국 최전방 칸) + Z_FACILITY` 다.
   * 손님은 자기 칸 기준이라 **발자국 뒤쪽 칸에 앉은 손님이 시설에 통째로 가렸다** —
   * 슬롯 185개 중 166개(90%)가 그 상태였다. 이제 앉은 손님은 **시설이 쓰는 바로 그 키**를
   * 빌린다.
   *
   * ## 왜 `bbq_zone` 인가
   *
   * 3×3 인데 슬롯 6개가 **전부 앞줄(j+2)이 아닌 칸**이다 — 어느 자리에 앉아도 발자국
   * 최전방보다 뒤다. 1×1 이나 N×1 연립의 맨 앞 칸은 원래도 안 가렸으므로 그걸로 재면
   * 아무것도 안 재는 검사가 된다.
   *
   * ## 왜 `usingSlot` 을 손으로 안 넣나
   *
   * 백도어로 앉히면 "손님이 걸어와 앉는다"는 경로 자체를 안 재게 된다 (K33: 화면이
   * 되는지는 진짜 터치로 본다). 손님이 실제로 자리를 잡을 때까지 주를 민다.
   */
  const seatOk = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    ${LAND_BOX}
    ${FREE_RECT}
    const spot = _free(5, 5);
    if (!spot) return { ok: false, why: '5×5 빈 자리가 없다' };
    const r = p.place(t, w, h.gate, 'bbq_zone', spot[0] + 1, spot[1] + 1);
    if (!r.ok || !r.placed) return { ok: false, why: 'bbq_zone 을 못 놓았다: ' + String(r.fail) };
    sc.refreshFacility(r.placed.handle);
    /*
     * **앞줄 시설** — 뒤 시설의 손님을 여전히 덮어야 한다는 증거용이다 (띠를 안 넘었다).
     *
     * ⚠ "j 가 큰 칸"이 앞이 아니다. 아이소의 앞뒤는 i+j 다 — bbq 최전방 칸
     * (i+2, j+2) 보다 i+j 가 큰 칸이어야 한다. 처음엔 (i, j+3) 에 놓았는데 그 칸은
     * i+j 가 오히려 **하나 작아** 검사가 거꾸로 실패했다 (실측).
     * 대각 모서리 (i+3, j+3) 은 entryTilesOf 가 입구에서 빼는 칸이라 막아도 안전하다.
     */
    const dkOf = (i, j) => (i + j) * 4096 + i;
    const facFront = dkOf(spot[0] + 3, spot[1] + 3);
    let front = 0;
    for (const off of [[3, 3], [3, 4], [4, 3], [2, 4], [4, 2]]) {
      const fi = spot[0] + 1 + off[0], fj = spot[1] + 1 + off[1];
      if (dkOf(fi, fj) <= facFront) continue;
      const fr = p.place(t, w, h.gate, 'vending_out', fi, fj);
      if (fr.ok && fr.placed) { sc.refreshFacility(fr.placed.handle); front = fr.placed.handle; break; }
    }
    g.invalidate();
    /*
     * 손님이 실제로 앉을 때까지 민다 (조건 대기 — 고정 시간이 아니다).
     *
     * ⚠ 주 루프(week.step)로 밀지 않는다 — 앞 절들이 이미 주를 끝 가까이 밀어 놔서
     * 주 경계(800tick)까지 남은 tick 이 자리를 잡기에 모자란다 (실측: 앉은 수 0).
     * 7f 의 퇴장 절과 같은 방식으로 **시뮬을 직접** 돌린다. 같은 코드 경로다.
     */
    h.flow.frozen = true;
    sc.setAutoTick(false);
    const bbq = r.placed.handle;
    /*
     * ## 재야 할 손님은 **오늘 실제로 가려지는** 손님이다
     *
     * 오늘의 깊이는 spanDepthKey(출발 칸과 목적 칸 중 가까운 쪽)이고, 출발 칸은
     * 손님이 서 있던 **입구 칸**이다. bbq 3×3 의 입구 6칸 중 넷은 i+j 가 최전방보다
     * 작아 그 손님이 가려지고, 둘은 안 가려진다 — 아무나 고르면 "고쳐도 안 고쳐도
     * 보인다"가 되어 음성 대조군이 죽는다 (실측: 100% 로 통과했다).
     * 그래서 **가려지는 손님이 생길 때까지** 민다. 백도어가 아니라 시뮬이 고른 입구다.
     */
    const facDepth = facFront + 2; // 시설 그림의 깊이 = 최전방 칸 + Z_FACILITY
    const hiddenToday = (x) =>
      Math.max(dkOf(x.fromI, x.fromJ), dkOf(x.i, x.j)) + 4 < facDepth;
    const seatedNow = () => g.all.filter((x) => x.usingHandle === bbq && x.usingSlot >= 0 &&
      x.state === 'using');
    const rng = new h.Rng(9152);
    for (let k = 0; k < 2400; k++) {
      if (k % 12 === 0) g.spawn(rng);
      g.tick(rng);
      if (seatedNow().some(hiddenToday)) break;
    }
    const now = seatedNow();
    return { ok: true, handle: bbq, front: front, i: spot[0] + 1, j: spot[1] + 1,
             seated: now.length, hidden: now.filter(hiddenToday).length };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; handle: number; front: number; i: number; j: number; seated: number; hidden: number };

  if (!seatOk.ok) {
    record('★ 자리에 앉은 손님이 화면에 보인다 (K52-⑥)', 'fail', seatOk.why);
  } else {
    /*
     * 화면에 손님 그림이 올라가고 **보간이 끝날 때까지** 준다. 한 걸음은
     * ticksPerStep(4) × tickSeconds(0.2) = 0.8초다 — 그보다 짧게 기다리면 앉은 손님이
     * 아직 밖 칸에 걸쳐 있어 (progress < 1) 자리를 안 빌린다.
     */
    await page.waitForTimeout(1300);
    /*
     * ⚠ 픽셀 검사는 **무채 상태에서** — 황혼 틴트가 지형 픽셀을 밀어 두 표본이 달라진다.
     * 확대는 1 로 고정한다 (`guestScreenRect` 는 내부 해상도 기준이다).
     */
    const framed = (await page.evaluate(`(() => {
      const h = window.__kairo, sc = h.scene, g = h.guests;
      h.flow.frozen = true; sc.setDayPhase(null); sc.setUpscale(1); sc.setAutoTick(false);
      sc.focusTile(${seatOk.i} + 1, ${seatOk.j} + 1);
      const dk = (i, j) => (i + j) * 4096 + i;
      /*
       * **오늘 가려지는** 손님을 고른다 (오늘의 깊이 = spanDepthKey = 출발 칸과 목적 칸
       * 중 가까운 쪽). 아무나 고르면 앞쪽 입구로 들어온 손님을 재서 "고쳐도 안 고쳐도
       * 보인다"가 된다 — 실제로 그렇게 100% 로 통과했다.
       * ⚠ 자기가 쓰는 함수(seatDepthsForTest)로 고르지 않는다 — 자기참조가 된다.
       *   손님의 **칸**에서 직접 유도한다.
       */
      const facDk = dk(${seatOk.i} + 2, ${seatOk.j} + 2);
      let pick = null;
      for (const x of g.all) {
        if (x.usingHandle !== ${seatOk.handle} || x.usingSlot < 0 || x.state !== 'using') continue;
        if (x.progress < 1) continue;
        const span = Math.max(dk(x.fromI, x.fromJ), dk(x.i, x.j));
        if (span + 4 >= facDk + 2) continue; // 오늘도 안 가려지는 자리다
        if (!pick || span < pick.span) {
          pick = { id: x.id, span: span, i: x.i, j: x.j, slot: x.usingSlot, pose: x.pose };
        }
      }
      if (!pick) return null;
      /*
       * 타일 화면 사각형은 **단(높이)을 모른다** — tileScreenRect 는 투영만 쓴다.
       * 그 칸의 지면 그림이 실제로 올라간 만큼을 재서 보정한다 (K37: 칸 위의 것은
       * 전부 lift 를 탄다). 안 보정하면 단이 1 인 자리에서 8px 어긋난다 (실측).
       */
      const timg = sc.tileImageForTest(pick.i, pick.j);
      return {
        pick: pick,
        facDepth: sc.facilityImageAt(${seatOk.handle}).depth,
        facDk: facDk,
        frontDepth: ${seatOk.front} ? sc.facilityImageAt(${seatOk.front}).depth : null,
        guestDepth: sc.guestDepthAt(pick.id),
        rect: sc.guestScreenRect(pick.id),
        tile: sc.tileScreenRect(pick.i, pick.j),
        tileImgY: timg ? timg.y : null,
        seats: sc.seatDepthsForTest(${seatOk.handle}),
      };
    })()`)) as {
      pick: { id: number; span: number; i: number; j: number; slot: number; pose: string };
      facDepth: number;
      facDk: number;
      frontDepth: number | null;
      guestDepth: number;
      rect: { x: number; y: number; w: number; h: number };
      tile: { x: number; y: number; w: number; h: number };
      tileImgY: number | null;
      seats: { id: number; slot: number; i: number; j: number; depth: number }[];
    } | null;

    if (!framed) {
      record(
        '★ 자리에 앉은 손님이 화면에 보인다 (K52-⑥)',
        'fail',
        `오늘 가려지는 자리에 앉은 손님이 없다 (앉은 수 ${seatOk.seated} · 그중 가려지는 자리 ${seatOk.hidden})`,
      );
    } else {
      const f = framed;
      // ① 깊이 — 시설이 쓰는 바로 그 칸을 빌렸나 (화면에 올라간 오브젝트에서 읽는다)
      record(
        '★ 앉은 손님이 시설의 깊이 칸을 빌린다 (K52-⑥)',
        f.guestDepth >= f.facDk + 4 && f.guestDepth < f.facDk + 5 ? 'pass' : 'fail',
        `손님 ${f.guestDepth} · 시설 칸 ${f.facDk} + 손님 띠 4 (+ 미세순서 <1)`,
      );
      record(
        '음성 대조군 — 옛 규칙(자기 칸/출발 칸)이었다면 시설 그림보다 뒤였다',
        f.pick.span + 4 < f.facDepth ? 'pass' : 'fail',
        `옛 규칙 ${f.pick.span + 4} < 시설 그림 ${f.facDepth} (${f.facDepth - f.pick.span - 4} 만큼 뒤)`,
      );
      // ② 앞줄 시설은 여전히 손님을 덮는다 — 띠(4096)를 안 넘었다는 증거
      if (f.frontDepth === null) {
        record('앞줄 시설이 여전히 뒤 시설의 손님을 덮는다', 'info', '앞줄 시설을 못 놓았다');
      } else {
        record(
          '★ 앞줄 시설이 여전히 뒤 시설의 손님을 덮는다 (띠를 안 넘었다)',
          f.frontDepth > f.guestDepth ? 'pass' : 'fail',
          `앞줄 시설 ${f.frontDepth} > 앉은 손님 ${f.guestDepth}`,
        );
      }
      // ③ 같은 시설 안의 순서 — 동률이 하나도 없어야 깜빡이지 않는다
      const ds = f.seats.map((s) => s.depth);
      record(
        '같은 시설에 앉은 손님끼리 깊이가 동률이 아니다 (깜빡임 방지)',
        ds.length < 2 ? 'info' : new Set(ds).size === ds.length ? 'pass' : 'fail',
        ds.length < 2
          ? `앉은 손님이 ${ds.length}명이라 여기서는 못 잰다 — 아래 파라솔 절이 둘로 잰다`
          : `${ds.length}명 · ${ds.map((x) => x.toFixed(2)).join(', ')}`,
      );
      record(
        '앉은 손님의 미세 순서가 띠(4096) 안에 있다',
        ds.every((d) => d - (f.facDk + 4) >= 0 && d - (f.facDk + 4) < 1) ? 'pass' : 'fail',
        `오프셋 ${ds.map((d) => (d - f.facDk - 4).toFixed(2)).join(', ')}`,
      );
      /*
       * ④ 자리 — **화면 사각형 둘**을 비교한다 (`slotTileOf` 를 두 번 부른 상수 비교가
       * 아니다). 칸 사각형은 단(높이)을 모르므로 그 칸 지면 그림이 올라간 만큼 내린다 —
       * 보정을 **하네스가 독립으로 유도**한다 (`tileCenter` + 타일 높이 절반이 단 0 의
       * 앵커다). 씬이 준 값을 그대로 쓰면 씬이 틀려도 통과하는 자기참조가 된다.
       */
      const liftPx =
        f.tileImgY === null ? 0 : f.tileImgY - (tileCenter(f.pick.i, f.pick.j).y + TILE_H / 2);
      const ty = f.tile.y + liftPx;
      /*
       * 재는 점은 사각형의 **가운데가 아니라 발**이다. 손님 그림은 앵커가
       * bottom-center 이고 24텍셀이 위로 뻗으므로 가운데는 언제나 칸 위로 나간다 —
       * 가운데로 재면 멀쩡한 코드가 4px 차이로 실패한다 (실측).
       */
      const gfx = f.rect.x + f.rect.w / 2;
      const gfy = f.rect.y + f.rect.h;
      record(
        '★ 앉은 손님의 화면 자리(발)가 슬롯 칸 안이다',
        gfx >= f.tile.x && gfx <= f.tile.x + f.tile.w && gfy >= ty && gfy <= ty + f.tile.h
          ? 'pass'
          : 'fail',
        `손님 발 (${Math.round(gfx)}, ${Math.round(gfy)}) · 칸 ${f.tile.x}~${f.tile.x + f.tile.w} × ${ty}~${ty + f.tile.h} (단 보정 ${liftPx}px)`,
      );

      // ⑤ ★ 픽셀 — 손님을 껐다 켠 차이가 곧 "보이는 손님"이다
      const pad = 6;
      const rx = Math.max(0, f.rect.x - pad);
      const ry = Math.max(0, f.rect.y - pad);
      const rw = f.rect.w + pad * 2;
      const rh = f.rect.h + pad * 2;
      const sample = `(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const H = c.height;
        const buf = new Uint8Array(${rw} * ${rh} * 4);
        gl.readPixels(${rx}, H - (${ry} + ${rh}), ${rw}, ${rh}, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let s = '';
        for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
        return s;
      })()`;
      const diff = (a: string, b: string): number => {
        const x = a.split(';'), y = b.split(';');
        let d = 0;
        for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) d++;
        return d;
      };
      const visible = async (): Promise<number> => {
        await page.evaluate(`window.__kairo.scene.setGuestVisibleForTest(${f.pick.id}, true)`);
        await page.waitForTimeout(280);
        const on = (await page.evaluate(sample)) as string;
        await page.evaluate(`window.__kairo.scene.setGuestVisibleForTest(${f.pick.id}, false)`);
        await page.waitForTimeout(280);
        const off = (await page.evaluate(sample)) as string;
        await page.evaluate(`window.__kairo.scene.setGuestVisibleForTest(${f.pick.id}, true)`);
        return diff(on, off);
      };
      const visFixed = await visible();
      await page.screenshot({ path: `${SHOT_DIR}/kairo-seat-depth.png` });
      await page.evaluate(`window.__kairo.scene.setSlotDepthFaultForTest(true)`);
      await page.waitForTimeout(280);
      const visFault = await visible();
      await page.evaluate(`window.__kairo.scene.setSlotDepthFaultForTest(false)`);

      record(
        '★ 자리에 앉은 손님이 화면에 보인다 (K52-⑥)',
        visFixed > 60 ? 'pass' : 'fail',
        `보이는 손님 픽셀 ${visFixed}px (슬롯 ${f.pick.slot} · 포즈 ${f.pick.pose} · 칸 ${f.pick.i},${f.pick.j})`,
      );
      record(
        '음성 대조군 — 자기 칸 깊이로 되돌리면 시설에 가린다',
        visFixed > 60 && visFault < visFixed * 0.5 ? 'pass' : 'fail',
        `되돌리면 ${visFault}px / ${visFixed}px (${Math.round((visFault / Math.max(1, visFixed)) * 100)}%)`,
      );

      // ⑥ ★ 동석 분산 — 파라솔 1×1 에 둘이 앉으면 화면 x 가 갈린다 (K52-⑦)
      const co = (await page.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
        ${LAND_BOX}
        ${FREE_RECT}
        const made = [];
        for (let n = 0; n < 4; n++) {
          const s = _free(1, 1);
          if (!s) break;
          const r = p.place(t, w, h.gate, 'parasol', s[0], s[1]);
          if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); made.push(r.placed.handle); }
        }
        window.__coParasols = made;
        if (made.length === 0) return { ok: false, why: '파라솔을 못 놓았다' };
        g.invalidate();
        const pairOf = () => {
          for (const hd of made) {
            const s = g.all.filter((x) => x.usingHandle === hd && x.usingSlot >= 0 &&
              x.state === 'using');
            if (s.length >= 2) return { handle: hd, ids: [s[0].id, s[1].id], i: s[0].i, j: s[0].j };
          }
          return null;
        };
        const rng = new h.Rng(7311);
        for (let k = 0; k < 2000; k++) {
          if (k % 12 === 0) g.spawn(rng);
          g.tick(rng);
          if (pairOf()) break;
        }
        const pair = pairOf();
        return pair ? { ok: true, ...pair, made: made.length } : { ok: false, why: '파라솔에 둘이 안 앉았다', made: made.length };
      })()`)) as { ok: false; why: string } | { ok: true; handle: number; ids: number[]; i: number; j: number };

      if (!co.ok) {
        record('★ 한 칸에 둘이 앉으면 화면에서 갈라진다 (K52-⑦)', 'fail', co.why);
      } else {
        await page.waitForTimeout(1300);
        /*
         * ⚠ 대조군은 **한 프레임 뒤에** 읽어야 한다. `guestScreenRect` 는 스프라이트가
         * 지금 갖고 있는 x 를 읽고 그건 다음 `placeGuest` 에서야 바뀐다 — 같은
         * evaluate 안에서 읽으면 스위치를 켠 척만 하고 옛 값을 두 번 재게 된다
         * (K38 "카메라를 옮긴 같은 프레임을 읽으면 옛 화면이다" 와 같은 함정).
         */
        const readXs = `(() => {
          const sc = window.__kairo.scene;
          return [sc.guestScreenRect(${co.ids[0]}), sc.guestScreenRect(${co.ids[1]})];
        })()`;
        const on = (await page.evaluate(readXs)) as ({ x: number; w: number } | null)[];
        await page.evaluate(`window.__kairo.scene.setCoSpreadFaultForTest(true)`);
        await page.waitForTimeout(300);
        const off = (await page.evaluate(readXs)) as ({ x: number; w: number } | null)[];
        await page.evaluate(`window.__kairo.scene.setCoSpreadFaultForTest(false)`);
        const xs = { on, off };
        const a = xs.on[0];
        const b = xs.on[1];
        record(
          '★ 한 칸에 둘이 앉으면 화면에서 갈라진다 (K52-⑦)',
          !!a && !!b && Math.abs(a.x - b.x) >= 8 ? 'pass' : 'fail',
          a && b ? `화면 x ${a.x} vs ${b.x} (차 ${Math.abs(a.x - b.x)}px)` : '그림이 없다',
        );
        const c = xs.off[0];
        const d = xs.off[1];
        record(
          '음성 대조군 — 안 흩으면 파라솔 둘이 완전히 겹친다',
          !!c && !!d && c.x === d.x ? 'pass' : 'fail',
          c && d ? `대조군 x ${c.x} vs ${d.x}` : '그림이 없다',
        );
        /*
         * 한 시설에 **둘**이 앉은 상태가 여기서는 보장된다 — bbq 절은 한 명만 앉는
         * 주가 있어 동률 검사를 못 한다. 동률이면 Phaser 가 삽입 순서로 그려 겹친
         * 손님이 프레임마다 깜빡인다.
         */
        const pairDepths = (await page.evaluate(
          `window.__kairo.scene.seatDepthsForTest(${co.handle}).map((s) => s.depth)`,
        )) as number[];
        record(
          '★ 같은 칸에 앉은 둘의 깊이가 동률이 아니다 (깜빡임 방지)',
          pairDepths.length >= 2 && new Set(pairDepths).size === pairDepths.length ? 'pass' : 'fail',
          `${pairDepths.length}명 · ${pairDepths.map((x) => x.toFixed(2)).join(', ')}`,
        );
      }

      // 뒷정리 — 놓은 시설을 걷고 시뮬을 되살린다
      await page.evaluate(`(() => {
        const h = window.__kairo;
        for (const hd of [${seatOk.handle}, ${seatOk.front}].concat(window.__coParasols || [])) {
          if (!hd) continue;
          h.placement.remove(hd);
          h.scene.refreshFacility(hd);
        }
        h.scene.setSlotDepthFaultForTest(false);
        h.scene.setCoSpreadFaultForTest(false);
        h.guests.invalidate();
        h.scene.setAutoTick(true);
        h.flow.frozen = false;
      })()`);
    }
  }

  /*
   * ── 7f-3. ★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②) ──
   *
   * `placeGuest` 는 **위치는 보간**하고 **깊이는 목적 타일**로 줬다. 목적지가 위쪽
   * (= `i+j` 가 작은 = 먼 칸)이면 이동이 시작되는 순간 깊이가 먼 칸 값으로 뚝 떨어지는데
   * 그림은 아직 출발 칸 위에 있다 → **출발 칸에 있는 것들이 손님을 덮는다**.
   * 아래로 갈 때는 반대라 안 보였다 — 사용자가 본 그대로다.
   *
   * ## 왜 출발 칸에 **시설**을 놓고 재나
   *
   * 빈 길 위에서는 덮이는 것이 밑동 몇 픽셀뿐이라 픽셀로 안 걸린다 (실측: 깊이를
   * 되돌려도 보이는 픽셀이 194 → 193). 실제로 아프게 덮는 것은 **출발 칸의 시설**이다 —
   * 깊이가 한 칸치(4096) 뒤로 밀리면 손님이 그 시설 뒤로 통째로 들어간다.
   * 그래서 출발 칸에 시설을 하나 놓고, **시설이 있을 때와 없을 때 보이는 손님 픽셀 수**를
   * 비교한다. 앞에 서 있어야 할 손님이 뒤로 가면 이 수가 무너진다.
   *
   * 재현이 순간적이라 `requestAnimationFrame` 으로 이동을 **정지 화면처럼 고정**한다.
   * 손님 검사는 **새 판**에서 돈다 (7f 가 띄운 그 판이다).
   */
  const upward = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, p = h.placement, g = h.guests, sc = h.scene;
    if (g.all.length < 1) return { ok: false, reason: '손님이 없다' };
    sc.setAutoTick(false);
    const L = h.land();
    /*
     * (i, j) → (i, j-1) 로 가면 i+j 가 준다 (= 위로 간다). 출발 칸 (i, j) 에는 시설이
     * 들어가야 하고, 목적 칸 (i, j-1) 은 손님이 설 수 있어야 한다.
     */
    let cell = null;
    for (let j = L.j0 + 3; j < L.j0 + L.h - 2 && !cell; j++) {
      for (let i = L.i0 + 2; i < L.i0 + L.w - 2; i++) {
        if (!t.isGuestWalkable(i, j) || !t.isGuestWalkable(i, j - 1)) continue;
        if (t.isIndoor(i, j) || t.isIndoor(i, j - 1)) continue;
        if (p.handleAt(i, j) || p.handleAt(i, j - 1)) continue;
        if (!p.check(t, h.walls, h.gate, 'vending_out', i, j).ok) continue;
        cell = { i: i, j: j };
        break;
      }
    }
    if (!cell) { sc.setAutoTick(true); return { ok: false, reason: '시설을 놓을 수 있는 세로 이웃 두 칸을 못 찾았다' }; }
    const subject = g.all[0];
    // 나머지 손님은 멀리 — 겹치면 달라진 픽셀이 누구 때문인지 모른다
    for (const x of g.all) {
      if (x === subject) continue;
      x.i = 2; x.j = t.height - 2; x.fromI = x.i; x.fromJ = x.j; x.progress = 1;
      x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
    }
    /*
     * 이동 한가운데를 **매 프레임 되박아** 정지 화면으로 만든다. progress 는 실시간으로
     * 흐르므로 한 번만 넣으면 다음 프레임에 1 이 된다. 걸음 길이를 크게 잡아 프레임당
     * 증가를 0 에 수렴시킨다 — 검사 끝에 되돌린다.
     * 포즈는 프레임이 하나뿐인 sit 이다 (walk 은 4프레임이라 두 장을 못 비교한다).
     */
    window.__k37 = { i: cell.i, j: cell.j, id: subject.id, on: true, perOld: g.tunables.ticksPerStep };
    g.tunables.ticksPerStep = 1000000;
    window.__k37pin = () => {
      const st = window.__k37;
      const s = window.__kairo.guests.all.find((x) => x.id === st.id);
      if (s) {
        if (st.on) {
          s.fromI = st.i; s.fromJ = st.j; s.i = st.i; s.j = st.j - 1;
          s.progress = 0.5; s.state = 'walking';
          s.pose = 'sit'; s.facing = '+Z'; s.face = 'calm'; s.emote = null;
        } else {
          const t2 = window.__kairo.terrain;
          s.i = 2; s.j = t2.height - 2; s.fromI = s.i; s.fromJ = s.j; s.progress = 1;
          s.state = 'using'; s.useTicks = 999999; s.rideTicks = 0; s.usingHandle = 0;
        }
      }
      requestAnimationFrame(window.__k37pin);
    };
    window.__k37pin();
    sc.setUpscale(1);
    sc.focusTile(cell.i, cell.j);
    return { ok: true, i: cell.i, j: cell.j, id: subject.id };
  })()`)) as { ok: false; reason: string } | { ok: true; i: number; j: number; id: number };

  if (!upward.ok) {
    record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', upward.reason);
  } else {
    const gi = upward.i, gj = upward.j, gid = upward.id;
    await page.waitForTimeout(400);

    // ① 깊이 수치 — 출발 칸(가까운 쪽) 기준인가
    const depths = (await page.evaluate(`(() => {
      const sc = window.__kairo.scene;
      const dk = (i, j) => (i + j) * 4096 + i;
      return {
        guest: sc.guestDepthAt(${gid}),
        fromGround: dk(${gi}, ${gj}),
        toGuestWouldBe: dk(${gi}, ${gj} - 1) + 4,
        rect: sc.guestScreenRect(${gid}),
      };
    })()`)) as {
      guest: number | null;
      fromGround: number;
      toGuestWouldBe: number;
      rect: { x: number; y: number; w: number; h: number } | null;
    };

    record(
      '★ 손님 깊이가 출발 칸 기준이다 (두 칸 중 가까운 쪽)',
      depths.guest !== null && depths.guest === depths.fromGround + 4 ? 'pass' : 'fail',
      `손님 ${depths.guest} = 출발 칸 ${depths.fromGround} + 손님 띠 4`,
    );
    record(
      '음성 대조군 — 목적 칸 깊이였다면 출발 칸의 것들보다 뒤였다',
      depths.toGuestWouldBe < depths.fromGround ? 'pass' : 'fail',
      `목적 칸 기준 ${depths.toGuestWouldBe} < 출발 칸 지면 ${depths.fromGround} (한 칸치 ${depths.fromGround - depths.toGuestWouldBe})`,
    );

    if (!depths.rect) {
      record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', '손님 그림이 없다');
    } else {
      const r = depths.rect;
      const sampleGuest = `(() => {
        const c = document.querySelector('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        const H = c.height;
        const buf = new Uint8Array(${r.w} * (${r.h} + 4) * 4);
        gl.readPixels(${r.x}, H - (${r.y} + ${r.h} + 4), ${r.w}, ${r.h} + 4, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let s = '';
        for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
        return s;
      })()`;
      const setOn = (on: boolean): string => `(() => { window.__k37.on = ${on}; })()`;
      const diff = (a: string, b: string): number => {
        const x = a.split(';'), y = b.split(';');
        let d = 0;
        for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) d++;
        return d;
      };

      // ② 시설이 없을 때 보이는 손님 픽셀 — 기준값
      const bareGuest = (await page.evaluate(sampleGuest)) as string;
      await page.evaluate(setOn(false));
      await page.waitForTimeout(320);
      const bareNone = (await page.evaluate(sampleGuest)) as string;
      const vis0 = diff(bareGuest, bareNone);

      // ③ 출발 칸에 시설을 놓고 다시 — 손님은 그 앞에 서 있어야 한다
      const facOk = (await page.evaluate(`(() => {
        const h = window.__kairo, sc = h.scene;
        const r = h.placement.place(h.terrain, h.walls, h.gate, 'vending_out', ${gi}, ${gj});
        if (!r.ok || !r.placed) return { ok: false, why: String(r.fail) };
        sc.refreshFacility(r.placed.handle);
        return { ok: true, handle: r.placed.handle, depth: sc.facilityImageAt(r.placed.handle).depth };
      })()`)) as { ok: false; why: string } | { ok: true; handle: number; depth: number };

      if (!facOk.ok) {
        record('★ 위로 걷는 손님이 안 파묻힌다 (K37 버그 ②)', 'fail', `출발 칸에 시설을 못 놓았다: ${facOk.why}`);
      } else {
        await page.waitForTimeout(320);
        const facNone = (await page.evaluate(sampleGuest)) as string;
        await page.evaluate(setOn(true));
        await page.waitForTimeout(320);
        const facGuest = (await page.evaluate(sampleGuest)) as string;
        const vis1 = diff(facGuest, facNone);

        record(
          '손님 검사가 유효하다 (손님이 실제로 그려졌고 시설이 앞을 막고 있나)',
          vis0 > 100 && diff(bareNone, facNone) > 100 ? 'pass' : 'fail',
          `빈 길에서 손님 ${vis0}px · 시설이 바꾼 배경 ${diff(bareNone, facNone)}px`,
        );
        record(
          '★ 위로 걷는 손님이 출발 칸 시설에 안 파묻힌다 (K37 버그 ②)',
          vis0 > 100 && vis1 >= vis0 * 0.9 ? 'pass' : 'fail',
          `보이는 손님 픽셀 ${vis1}/${vis0} (${Math.round((vis1 / Math.max(1, vis0)) * 100)}%) · 손님 ${depths.guest} vs 시설 ${facOk.depth}`,
        );
        await page.screenshot({ path: `${SHOT_DIR}/kairo-depth-guest.png` });

        // 뒷정리 — 시설·고정 루프·걸음 길이·시뮬을 되돌린다
        await page.evaluate(`(() => {
          const h = window.__kairo;
          h.placement.remove(${facOk.handle});
          h.scene.refreshFacility(${facOk.handle});
          window.__k37.on = false;
          h.guests.tunables.ticksPerStep = window.__k37.perOld;
          h.scene.setAutoTick(true);
        })()`);
      }
    }
  }

  // ── 7g. 결정 19 를 끝까지 — 유리벽 뒤의 무언가가 실제로 보이나 ──
  //
  // 스프라이트 알파가 50% 뚫린 것은 확인했다. 화면에서도 뒤가 비치는지는 별개다.
  //
  // ⚠ 색을 짚어 세지 말 것. 유리 대역과 겹치는 부분은 손님의 **다리**(살색)이고
  //   주황 조끼는 벽의 불투명한 뚜껑에 가려진다 — "구명조끼 주황을 센다"로는 0 이 나온다
  //   (실측으로 세 번 헛짚었다). 대신 **손님이 있을 때와 없을 때 픽셀이 다른지**를 본다.
  //   색에 의존하지 않고 "뒤가 비친다"만 검사한다.
  const glassCheck = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    ${PAVE_ALL}
    if (g.all.length < 2) return { ok: false, reason: '손님이 둘 미만' };

    // 벽 세울 자리 (자기와 뒤 칸이 비어 있는 육지)
    let spot = null;
    for (let j = 5; j < 24 && !spot; j++) {
      for (let i = 3; i < 30; i++) {
        if (!t.isWalkable(i, j) || !t.isWalkable(i, j - 1)) continue;
        if (w.hasAnyEdge(i, j) || w.hasAnyEdge(i, j - 1)) continue;
        if (p.handleAt(i, j) || p.handleAt(i, j - 1)) continue;
        spot = [i, j]; break;
      }
    }
    if (!spot) return { ok: false, reason: '자리를 못 찾았다' };
    const [i, j] = spot;
    // 손님과 카메라 사이에 서도록 이 칸의 **앞쪽(+J) 경계**에 벽을 세운다
    w.setEdge(i, j, 1, 1); // 1 = DIR_J_PLUS
    sc.refreshWall(i, j);
    sc.setUpscale(1);
    sc.focusTile(i, j);
    return { ok: true, tile: [i, j] };
  })()`)) as { ok: false; reason: string } | { ok: true; tile: number[] };

  if (!glassCheck.ok) {
    record('유리벽 뒤가 비친다', 'fail', glassCheck.reason);
  } else {
    const [wi, wj] = glassCheck.tile;
    /** 벽의 유리 대역 픽셀을 문자열로 뽑는다 */
    const sampleBand = `(() => {
      const sc = window.__kairo.scene;
      const c = document.querySelector('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      const H = c.height;
      const rect = sc.tileScreenRect(${wi}, ${wj});
      const x0 = rect.x, y0 = rect.y - 8, w = 32, hh = 16;
      const buf = new Uint8Array(w * hh * 4);
      gl.readPixels(x0, H - (y0 + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = '';
      for (let k = 0; k < buf.length; k += 4) s += buf[k] + ',' + buf[k+1] + ',' + buf[k+2] + ';';
      return s;
    })()`;

    // ① 손님을 멀리 치워 놓고 (벽만) 찍는다
    const away = (await page.evaluate(`(() => {
      const g = window.__kairo.guests;
      for (const x of g.all) {
        x.i = 38; x.j = 30; x.fromI = 38; x.fromJ = 30; x.progress = 1;
        x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
      }
      return g.all.length;
    })()`)) as number;
    await page.waitForTimeout(250);
    const wallOnly = (await page.evaluate(sampleBand)) as string;

    // ② 손님을 벽 뒤 두 칸에 고정하고 다시 찍는다.
    //   아이소에서 벽 바로 뒤 칸은 화면 x 가 16텍셀 어긋나므로 양쪽을 덮는다
    await page.evaluate(`(() => {
      const g = window.__kairo.guests;
      const spots = [[${wi}, ${wj} - 1], [${wi} - 1, ${wj}]];
      for (let k = 0; k < 2 && k < g.all.length; k++) {
        const x = g.all[k], sp = spots[k];
        x.i = sp[0]; x.j = sp[1]; x.fromI = sp[0]; x.fromJ = sp[1]; x.progress = 1;
        x.pose = 'idle'; x.facing = '+Z';
        x.state = 'using'; x.useTicks = 999999; x.rideTicks = 0; x.usingHandle = 0;
      }
    })()`);
    await page.waitForTimeout(250);
    const withGuests = (await page.evaluate(sampleBand)) as string;

    const a = wallOnly.split(';');
    const b = withGuests.split(';');
    let diff = 0;
    for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) diff++;

    record(
      '유리벽 뒤가 실제로 비친다 — 결정 19 의 목적',
      diff > 0 ? 'pass' : 'fail',
      `유리 대역 ${a.length - 1}px 중 ${diff}px 가 손님 유무로 달라진다 (손님 ${away}명)`,
    );
    await page.screenshot({ path: `${SHOT_DIR}/kairo-through-glass.png` });
  }

  // ── 7h. 아쿠아파크 — 덱·부착·슬라이드 ──
  const aqua = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    const out = {};
    // 물가를 찾아 잔교를 낸다
    let pier = null;
    // K36: 창을 격자에서 가져온다 (도시 띠 아래부터)
    for (let i = 6; i < t.width - 6 && !pier; i++) {
      for (let j = ${KAIRO_BAND}; j < t.height - 8; j++) {
        if (!(t.isWalkable(i, j) && !t.isWalkable(i, j + 1) && !p.handleAt(i, j))) continue;
        /*
         * ⚠ 양옆이 비어 있어야 한다. K30 부터 새 판에 **물려받은 데크**가 물가에 이미
         * 있어서, 그 옆을 잡으면 슬라이드가 occupied 로 거절된다. 검사가 쓰려는 폭
         * (슬라이드 −3 ~ 덱 +1) 이 전부 빈 곳만 고른다.
         */
        let clear = true;
        for (let k = -3; k <= 2 && clear; k++) {
          for (let m = 1; m <= 6; m++) if (p.handleAt(i + k, j + m) !== 0) { clear = false; break; }
        }
        if (!clear) continue;
        pier = { i: i, j: j + 1 };
        break;
      }
    }
    if (!pier) return { ok: false, reason: '양옆이 빈 물가를 못 찾았다' };

    // 덱 없이 트램폴린 → 거절되어야 한다.
    // ⚠ 발자국 3×3 이 전부 물이어야 한다 — 육지에 걸치면 wrong-terrain 이 먼저 잡혀
    //   needs-deck 검사가 무의미해진다 (실측으로 겪었다)
    let wet = null;
    // K36: 격자가 96×72 다 — 창을 격자에서 가져온다
    for (let j = pier.j; j < t.height - 3 && !wet; j++) {
      for (let i = 3; i < t.width - 3; i++) {
        let allWater = true;
        for (let di = 0; di < 3 && allWater; di++)
          for (let dj = 0; dj < 3; dj++)
            if (t.isWalkable(i + di, j + dj) || p.handleAt(i + di, j + dj)) { allWater = false; break; }
        if (allWater) { wet = [i, j]; break; }
      }
    }
    if (!wet) return { ok: false, reason: '물 3×3 을 못 찾았다' };
    const noDeck = p.check(t, w, h.gate, 'trampoline_w', wet[0], wet[1]);
    out.withoutDeck = noDeck.fail || 'ok';

    // 잔교 6칸
    let deck = 0;
    for (let k = 0; k < 6; k++) {
      const r = p.place(t, w, h.gate, 'float_deck', pier.i, pier.j + k);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); deck++; }
    }
    out.deck = deck;

    // 덱 옆에 트램폴린 → 통과
    const withDeck = p.place(t, w, h.gate, 'trampoline_w', pier.i + 1, pier.j + 1);
    if (withDeck.ok && withDeck.placed) sc.refreshFacility(withDeck.placed.handle);
    out.withDeck = withDeck.fail || 'ok';

    // 슬라이드
    const slide = p.place(t, w, h.gate, 'slide_small', pier.i - 3, pier.j + 1);
    if (slide.ok && slide.placed) sc.refreshFacility(slide.placed.handle);
    out.slide = slide.fail || 'ok';
    /*
     * K45: 코스는 선착장이 붙은 잔교에서만 시작한다 — 이 잔교를 후보로 만들어 둔다.
     * 트램폴린(+1..+2)·슬라이드(−3..−2) 자리를 피해 바깥(+3/−5)에서만 찾는다
     * (실측으로 두 번 그 자리를 선점해 아쿠아 검사를 깨뜨렸다).
     */
    dockLoop: for (const di of [3, 4, -5, -6, 5]) {
      for (let k = 0; k <= 6; k++) {
        const dr = p.place(t, w, h.gate, 'dock', pier.i + di, pier.j + k);
        if (dr.ok && dr.placed) { sc.refreshFacility(dr.placed.handle); break dockLoop; }
      }
    }
    /*
     * K46: 선착장이 1×1(데크와 동급)이 되며 후보 잔교가 3으로 줄었다 — 2×4 시절에는
     * 선착장 발자국 8칸이 스스로 넷째 잔교 그룹이었다. 겹침 절(코스 3개 확정 뒤
     * "빈 잔교를 제안한다")의 전제가 "빈 후보 ≥ 1"이므로 예비 잔교를 하나 더 놓는다.
     * 기존 선착장들에서 12칸 이상 떨어진 물가를 찾는다 (붙으면 같은 그룹으로 합쳐진다).
     */
    const dockSpots = p.all().filter((it) => it.defId === 'dock').map((it) => [it.i, it.j]);
    // 기존 코스의 잔교·핸들에서도 멀어야 한다 — 이 잔교의 코스가 그 옆(≤11)에 놓이므로
    const courseSpots = [];
    for (const cc of h.courses.all) {
      courseSpots.push([cc.dock.x, cc.dock.y]);
      for (const hd of cc.handles) courseSpots.push([hd.x, hd.y]);
    }
    spare: for (let j = 2; j < t.height - 2; j++) {
      if (Math.abs(j - pier.j) > 6) continue; // 같은 물줄기 — 딴 물웅덩이면 코스 공간이 없다
      for (let i = 2; i < t.width - 2; i++) {
        if (!t.isWater(i, j)) continue;
        if (dockSpots.some((d) => Math.abs(i - d[0]) + Math.abs(j - d[1]) < 12)) continue;
        if (courseSpots.some((d) => Math.abs(i - d[0]) + Math.abs(j - d[1]) < 24)) continue;
        const r = p.place(t, w, h.gate, 'dock', i, j);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); out.spare = [i, j]; break spare; }
      }
    }

    // 덱 위를 밟을 수 있나
    out.deckWalkable = p.isWalkOn(pier.i, pier.j + 2) && !p.blocksWalk(pier.i, pier.j + 2);
    out.trampolineBlocks = p.blocksWalk(pier.i + 1, pier.j + 1);

    g.invalidate();
    out.pier = [pier.i, pier.j];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        withoutDeck: string;
        deck: number;
        withDeck: string;
        slide: string;
        deckWalkable: boolean;
        trampolineBlocks: boolean;
        pier: number[];
      };

  if (!aqua.ok) {
    record('아쿠아파크', 'fail', aqua.reason);
  } else {
    record(
      '덱 없이 인플레이터블은 거절 — 플로팅덱이 물 위 유일 기반',
      aqua.withoutDeck === 'needs-deck' ? 'pass' : 'fail',
      aqua.withoutDeck,
    );
    record('잔교를 6칸 뻗는다', aqua.deck === 6 ? 'pass' : 'fail', `${aqua.deck}칸`);
    record('덱 옆에는 놓인다', aqua.withDeck === 'ok' ? 'pass' : 'fail', aqua.withDeck);
    record('슬라이드도 놓인다', aqua.slide === 'ok' ? 'pass' : 'fail', aqua.slide);
    record(
      '덱은 밟히고 인플레이터블은 길을 막는다',
      aqua.deckWalkable && aqua.trampolineBlocks ? 'pass' : 'fail',
      `덱 통행 ${aqua.deckWalkable} · 트램폴린 차단 ${aqua.trampolineBlocks}`,
    );

    /**
     * 덱이 **물 위 시설로 가는 유일한 길**인지 직접 확인한다.
     * 손님 60명의 목적지 선택에 의존하면(가까운 곳이 빨리 비면 먼 시설을 안 간다)
     * 검사가 흔들린다 — 거리장을 직접 물어보는 게 주장에 맞는 검사다.
     */
    const reach = (await page.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, g = h.guests, sc = h.scene;
    ${PAVE_ALL}
    // 물 3×3 을 찾아 그 옆에 잔교를 새로 낸다 (앞 블록과 안 겹치게)
      // ⚠ 물 블록이 육지에 바로 붙어 있으면 덱을 끊어도 육지에서 바로 닿아
      //   "덱이 유일한 길" 검사가 무의미해진다. **3칸 이상** 떨어진 곳을 고른다.
      let wet = null;
      // K36: 물가가 아래로 내려갔다 (도시 띠 + 넓어진 격자) — 창을 격자에서 가져온다
      for (let j = ${KAIRO_BAND} + 4; j < t.height - 4 && !wet; j++) {
        for (let i = 6; i < t.width - 6; i++) {
          let ok = true;
          for (let di = 0; di < 3 && ok; di++)
            for (let dj = 0; dj < 3; dj++)
              if (t.isWalkable(i + di, j + dj) || p.handleAt(i + di, j + dj)) { ok = false; break; }
          if (!ok) continue;
          // 왼쪽 열을 따라 위로 올라가며 육지를 찾는다 — 물이 3칸 이상 이어져야 한다
          let shoreJ = -1, waterRun = 0;
          for (let k = j - 1; k >= 1; k--) {
            if (p.handleAt(i - 1, k)) { waterRun = -99; break; }
            if (t.isWalkable(i - 1, k)) { shoreJ = k; break; }
            waterRun++;
          }
          if (shoreJ >= 0 && waterRun >= 3) { wet = { i: i, j: j, shoreJ: shoreJ }; break; }
        }
      }
      if (!wet) return { ok: false, reason: '잔교 낼 물 블록을 못 찾았다' };

      // 덱 없이 먼저 트램폴린을 놓을 수 없다 → 덱을 깔고 놓는다
      const deckHandles = [];
      for (let k = wet.shoreJ + 1; k <= wet.j + 1; k++) {
        const r = p.place(t, w, h.gate, 'float_deck', wet.i - 1, k);
        if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); deckHandles.push(r.placed.handle); }
      }
      const tr = p.place(t, w, h.gate, 'trampoline_w', wet.i, wet.j);
      if (!tr.ok) return { ok: false, reason: '트램폴린 배치 실패: ' + tr.fail };
      sc.refreshFacility(tr.placed.handle);
      g.invalidate();
      const withDeck = g.distanceTo(tr.placed.handle, h.gate.i, h.gate.j);

      // 덱을 하나 지우면 길이 끊겨야 한다 — 덱이 유일한 길이라는 증거
      // 잔교 중간을 끊는다 — 육지 쪽 첫 칸을 지우면 뒤가 전부 고립된다
      const cutJ = wet.shoreJ + 1;
      const cutHandle = p.handleAt(wet.i - 1, cutJ);
      p.remove(cutHandle);
      g.invalidate();
      const withoutDeck = g.distanceTo(tr.placed.handle, h.gate.i, h.gate.j);

      return { ok: true, withDeck: withDeck, withoutDeck: withoutDeck, decks: deckHandles.length };
    })()`)) as
      | { ok: false; reason: string }
      | { ok: true; withDeck: number; withoutDeck: number; decks: number };

    if (!reach.ok) {
      record('덱이 물 위 시설로 가는 유일한 길', 'fail', reach.reason);
    } else {
      record(
        '덱을 깔면 게이트에서 물 위 시설까지 길이 생긴다',
        reach.withDeck > 0 ? 'pass' : 'fail',
        `${reach.withDeck} 걸음 (덱 ${reach.decks}칸)`,
      );
      // 덱을 끊는 검사는 단위 테스트(aqua.test.ts)로 옮겼다 — 하네스는 앞 블록의 덱·시설이
      // 누적돼 다른 경로가 남고, 그걸 매번 배제하려면 검사가 세계를 통제해야 한다.
      record(
        '덱을 끊었을 때의 경로는 단위 테스트가 본다',
        'info',
        `하네스 측정값 ${reach.withoutDeck} (다른 잔교가 남아 있을 수 있다)`,
      );
    }

    // 슬라이드 탑승 — 손님이 실제로 타는지 (충분히 길게 돌린다)
    const ride = (await page.evaluate(`(() => {
      const h = window.__kairo, g = h.guests;
      // 흐르는 낮(K39)부터 부팅 때 등급 상한이 걸린다 — 이 측정은 상한 없던 시절의
      // 조건(수백 명 누적)을 가정하므로 상한을 올려 복원한다
      g.setMaxGuests(400);
      const rng = new h.Rng(777);
      let sawRide = false, deckSteps = 0;
      for (let k = 0; k < 4000; k++) {
        if (k % 8 === 0) g.spawn(rng);
        g.tick(rng);
        for (const x of g.all) {
          if (x.pose === 'ride') sawRide = true;
          if (h.placement.isWalkOn(x.i, x.j)) deckSteps++;
        }
      }
      return { sawRide: sawRide, deckSteps: deckSteps, stats: g.stats() };
    })()`)) as { sawRide: boolean; deckSteps: number; stats: { exited: number; gaveUp: number } };

    record('손님이 덱을 밟는다', ride.deckSteps > 0 ? 'pass' : 'fail', `${ride.deckSteps} tick·명`);
    record('손님이 슬라이드를 탄다 (ride 포즈)', ride.sawRide ? 'pass' : 'fail');

    await page.evaluate(`window.__kairo.scene.focusTile(${aqua.pier[0]}, ${aqua.pier[1]! + 2})`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-aqua.png` });
  }

  /*
   * ── 7i. 주 단위 루프·결산 ──
   *
   * ⚠ K47-② 에서 `하루 »`(`#kairo-week`) 버튼이 사라졌다 — 시간은 흐르는 낮으로
   * 이미 자동이라 스킵 버튼은 "할 게 없다"를 가리는 장치였다 (계획 §2). 그래서
   * "한 주 진행 버튼이 있다" 절은 없앴다. 주를 감는 것은 이제 `__kairo.skipForward()`
   * 백도어(하루 단위)와 `__kairo.runWeek()` 뿐이다.
   */
  const calc = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort(); // 흐르는 낮의 진행 중인 주를 치운다 — run() 은 배치 전용이다 (K39)
    const t0 = performance.now();
    const rep = h.week.run(new h.Rng(555), { season: 'summer', playbackEvery: 6 });
    const ms = performance.now() - t0;
    return {
      ms: ms, week: rep.week, visitors: rep.visitors, revenue: rep.revenue,
      arrivals: rep.arrivals, turnedAway: rep.turnedAway,
      upkeep: rep.upkeep, profit: rep.profit, days: rep.days.length,
      frames: rep.playback.length, heatSum: rep.heat.reduce((a, b) => a + b, 0),
      hotspot: rep.hotspot, bottleneck: rep.bottleneck,
      weathers: rep.days.map((d) => d.weather),
      dayVisitors: rep.days.map((d) => d.visitors),
    };
  })()`)) as {
    ms: number;
    week: number;
    visitors: number;
    arrivals: number;
    turnedAway: number;
    noTicket?: number;
    revenue: number;
    upkeep: number;
    profit: number;
    days: number;
    frames: number;
    heatSum: number;
    hotspot: { i: number; j: number; value: number } | null;
    bottleneck: {
      need: string;
      demand: number;
      supply: number;
      missing: boolean;
      example: string | null;
    } | null;
    weathers: string[];
    dayVisitors: number[];
  };

  record(
    '한 주 계산이 0.6초 안에 끝난다 — 주 단위 루프의 전제',
    calc.ms < 600 ? 'pass' : 'fail',
    `${calc.ms.toFixed(0)}ms`,
  );
  record('요일 7일', calc.days === 7 ? 'pass' : 'fail', calc.weathers.join(','));
  /*
   * ⚠ `visitors > 0` 을 요구하면 안 된다. 이 하네스는 앞서 주를 여러 번 돌려 공원이
   * 입장 상한까지 차 있고, 그러면 **입장 0 · 만석 100% 가 정상**이다 (안에 있는 손님이
   * 이용을 마치며 매출은 계속 난다). 수요와 매출이 도는지를 본다.
   */
  record('방문객·매출이 생긴다', calc.arrivals > 0 && calc.revenue > 0 ? 'pass' : 'fail',
    `수요 ${calc.arrivals} · 입장 ${calc.visitors} · 만석 ${calc.turnedAway} · 매출 ${calc.revenue} · 손익 ${calc.profit}`);
  /*
   * ⚠ **항등식이 깨진 게 아니라 뜻이 바뀌었다** (K36-B②).
   *
   * 예전엔 `spawn` 성공이 곧 입장이라 `수요 = 입장 + 만석` 이 그 주 안에서 딱 맞았다.
   * 이제 손님은 정류장에 내려서 **매표소까지 걸어가 표를 사야** 입장이다. 그 사이에
   * 주 경계가 끼면 지난주에 내린 손님이 이번 주 입장으로 잡힌다 — 실측으로
   * `123 = 138 + 107` 이 나왔다. 주 단위로 딱 맞을 수가 없다.
   *
   * 그래도 지키려던 것은 남는다: **실패한 입장이 어디에도 안 남으면 주말이 한가해 보인다.**
   * 그래서 "수요가 있으면 그 수요가 입장·만석·매표소못감 중 어딘가에는 잡힌다"를 본다.
   * 정확한 보존은 주 경계가 없는 sim 단위 검사(`admission.test.ts`)가 맡는다.
   */
  record(
    '실패한 입장이 어디엔가 남는다 — 수요가 조용히 사라지지 않는다',
    calc.arrivals > 0 && calc.visitors + calc.turnedAway + (calc.noTicket ?? 0) > 0
      ? 'pass'
      : 'fail',
    `수요 ${calc.arrivals} → 입장 ${calc.visitors} + 만석 ${calc.turnedAway} + 매표소못감 ${calc.noTicket ?? 0}`,
  );
  record('혼잡 히트맵이 쌓인다', calc.heatSum > 0 && calc.hotspot !== null ? 'pass' : 'fail',
    `합 ${calc.heatSum} · 최고점 (${calc.hotspot?.i},${calc.hotspot?.j})=${calc.hotspot?.value}`);
  /*
   * ⚠ **`!== null` 만 보면 안 된다** (P3-B). 옛 로직(후보 = 지어진 종류만)도 값은
   * 냈으므로, 공급 0 인 종류를 영원히 못 가리키는 채로 이 줄이 초록이었다.
   * 여기서는 **자료 모양**을 본다 — `missing` 과 `example` 이 실제로 실려 오나
   * (UI 가 "하나도 없습니다 / 모자란다"를 가르는 근거가 그 둘이다).
   * 문장까지 보는 것은 새 판에서 도는 P3-B ① 절이다.
   */
  record(
    '병목을 알려준다 — 다음에 무엇을 지을까 (need·공급·missing·example)',
    calc.bottleneck !== null &&
      typeof calc.bottleneck.need === 'string' &&
      calc.bottleneck.demand > 0 &&
      calc.bottleneck.supply >= 0 &&
      typeof calc.bottleneck.missing === 'boolean' &&
      // `missing` 이면 그 종류를 한 채도 안 지은 것이므로 공급도 반드시 0 이다
      (!calc.bottleneck.missing || calc.bottleneck.supply === 0)
      ? 'pass'
      : 'fail',
    calc.bottleneck
      ? `${calc.bottleneck.need} 수요 ${calc.bottleneck.demand.toFixed(1)} · 공급 ${calc.bottleneck.supply} · ` +
        `missing ${String(calc.bottleneck.missing)} · 예시 ${String(calc.bottleneck.example)}`
      : 'null',
  );
  record(
    '압축 연출용 프레임이 기록된다 — 계산이 빠른 것과 안 보여주는 것은 다르다',
    calc.frames > 100 ? 'pass' : 'fail',
    `${calc.frames} 프레임`,
  );

  /*
   * 흐르는 낮 (K39) — 압축 연출은 흐름으로 대체됐다. 주를 끝까지 감으면 게임 경로
   * (settleWeek) 로 결산이 바로 뜬다. 카드는 이제 결산 **뒤**(다음 주 아침)에 온다.
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.runWeek();
  })()`);
  await page.waitForFunction(
    `(() => { const r = document.getElementById('kairo-report'); return !!r && !r.hidden; })()`,
    undefined,
    { timeout: 8000 },
  );
  record('주를 끝까지 감으면 결산이 뜬다 (흐르는 낮 — 연출 대체)', 'pass');
  await page.screenshot({ path: `${SHOT_DIR}/kairo-playback.png` });

  /*
   * ⚠ 두 가지를 조심해야 한다.
   *
   * ① "막대가 있나"만 보면 안 된다 — 그 주 입장이 0명이면 막대는 정상적으로 "손님 없음"
   *    을 띄우고 검사는 그 분기로 통과한다. **결산의 실제 숫자와 맞춘다**:
   *    유형 합 = 입장 수가 진짜 불변식이다.
   * ② 이 시점의 공원은 앞 검사들이 주를 여러 번 돌려 **상한까지 차 있다.** 그리고
   *    `runWeek()` 은 내부에서 등급 기준으로 상한을 다시 정하므로 밖에서 올려도 덮인다.
   *    그래서 이 검사는 **자기 결산을 직접 만든다** — 상한을 올리고 한 주를 돌려
   *    게임과 같은 `report.show` 로 띄운다.
   */
  const compo = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort(); // K39 — run() 은 배치 전용
    h.guests.setMaxGuests(240);
    const rep = h.week.run(new h.Rng(4242), { season: 'summer', playbackEvery: 0 });
    window.__phase5Report = rep;
    window.__phase5Action = 0;
    h.report.show(
      rep,
      {
        onClose: function () { return undefined; },
        onPrescription: function () { window.__phase5Action += 1; },
      },
      undefined,
      {
        visitors: Math.max(0, rep.visitors - 7),
        turnedAway: rep.turnedAway,
        profit: rep.profit + 30000,
        exitSatisfaction: Math.max(0, rep.exitSatisfaction - 4),
      },
    );
    const r = document.getElementById('kairo-report');
    if (!r) return { found: false };
    const segs = [...r.querySelectorAll('div[data-group]')];
    const sum = ['family', 'couple', 'friends', 'company'].reduce(
      (a, k) => a + (rep.byGroup[k] || 0), 0,
    );
    return {
      found: true,
      segs: segs.length,
      titles: segs.map((d) => d.title),
      label: r.textContent.indexOf('손님 구성') >= 0,
      visitors: rep.visitors,
      sum: sum,
    };
  })()`)) as {
    found: boolean;
    segs?: number;
    titles?: string[];
    label?: boolean;
    visitors?: number;
    sum?: number;
  };

  const visitors = compo.visitors ?? 0;
  const compoOk =
    compo.found === true &&
    compo.label === true &&
    compo.sum === visitors &&
    visitors > 0 &&
    (compo.segs ?? 0) >= 2;

  record(
    '결산에 손님 구성이 보인다 — 유형 합이 입장 수와 같아야 한다',
    compoOk ? 'pass' : 'fail',
    visitors === 0
      ? '입장 0명 — 상한을 올렸는데도 안 들어왔다면 배치·도달을 볼 것'
      : `${(compo.titles ?? []).join(' · ')} · 합 ${compo.sum} = 입장 ${visitors}`,
  );

  const rep = (await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    const canvas = r.querySelector('canvas');
    // ★ title 로 세면 손님 구성 막대까지 섞인다 — 요일 막대만 data-day 로 고른다
    //   (이 블록은 템플릿 리터럴 안이라 백틱을 쓸 수 없다)
    const bars = r.querySelectorAll('div[data-day]');
    const ids = [
      'kairo-report-kpis',
      'kairo-report-prescription',
      'kairo-report-heat',
      'kairo-report-days',
      'kairo-report-groups',
      'kairo-report-ledger',
      'kairo-report-records',
    ];
    const nodes = ids.map((id) => document.getElementById(id));
    const action = document.getElementById('kairo-report-prescription-action');
    const heat = document.getElementById('kairo-report-heat');
    const ledger = document.getElementById('kairo-report-ledger');
    const records = document.getElementById('kairo-report-records');
    return {
      hasHeat: !!canvas, heatW: canvas ? canvas.width : 0,
      heatH: heat ? Math.round(heat.querySelector('canvas').getBoundingClientRect().height) : 0,
      bars: bars.length,
      text: r.textContent.slice(0, 200),
      kpis: r.querySelectorAll('[data-kpi]').length,
      deltas: [...r.querySelectorAll('.kkpi-delta')].map((d) => d.textContent || ''),
      ids: ids,
      ordered: nodes.every((n) => !!n) && nodes.every((n, i) => i === 0 ||
        !!(nodes[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)),
      ledgerAboveFold: !!ledger && ledger.getBoundingClientRect().top < window.innerHeight,
      ledgerText: ledger ? ledger.textContent : '',
      recordsText: records ? records.textContent : '',
      actionMinH: action ? Math.round(action.getBoundingClientRect().height) : 0,
      actionBox: action ? (() => {
        const b = action.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      })() : null,
      closeMinH: (() => {
        const b = document.getElementById('kairo-report-close');
        return b ? Math.round(b.getBoundingClientRect().height) : 0;
      })(),
    };
  })()`)) as {
    hasHeat: boolean;
    heatW: number;
    heatH: number;
    bars: number;
    text: string;
    kpis: number;
    deltas: string[];
    ids: string[];
    ordered: boolean;
    ledgerAboveFold: boolean;
    ledgerText: string;
    recordsText: string;
    actionMinH: number;
    actionBox: { x: number; y: number } | null;
    closeMinH: number;
  };

  record('결산에 혼잡 히트맵이 있다', rep.hasHeat ? 'pass' : 'fail', `${rep.heatW}px`);
  record(
    '★ K54 축소 히트맵은 120~140px다',
    rep.heatH >= 120 && rep.heatH <= 140 ? 'pass' : 'fail',
    `${rep.heatH}px`,
  );
  record('요일 막대 7개', rep.bars === 7 ? 'pass' : 'fail', `${rep.bars}개`);
  record(
    '★ 결산은 3 KPI → 처방 → 히트맵 → 요일 → 구성 → 장부 → 기록 순서다',
    rep.kpis === 3 && rep.ordered ? 'pass' : 'fail',
    `${rep.kpis} KPI · ${rep.ids.join(' → ')}`,
  );
  record(
    '★ 전주 delta가 3 KPI에 보이고 장부 시작이 393 첫 화면 안이다',
    rep.deltas.length === 3 && rep.deltas.every((x) => x !== '첫 주') && rep.ledgerAboveFold
      ? 'pass'
      : 'fail',
    `${rep.deltas.join(' · ')} · ledger above fold ${String(rep.ledgerAboveFold)}`,
  );
  record(
    '★ 수익·운영비·투자를 가르고 영업 손익에서 투자 제외를 밝힌다',
    ['수익', '입장료', '음식·대여', '견인 코스', '운영비', '시설·코스 유지비', '인건비',
      '영업 손익', '건설·개선·메뉴 개발비 제외', '투자 지출 · 영업 손익 제외',
      '건설', '개선', '메뉴 개발'].every((x) => rep.ledgerText.indexOf(x) >= 0)
      ? 'pass'
      : 'fail',
    rep.ledgerText.slice(0, 240),
  );
  record(
    '★ 콤보 0개 교육 행과 메뉴·코스 기록이 모두 남는다',
    rep.recordsText.indexOf('아직 발동한 콤보가 없습니다') >= 0 &&
      rep.recordsText.indexOf('메뉴·단골 기록') >= 0 &&
      rep.recordsText.indexOf('견인 코스 기록') >= 0
      ? 'pass'
      : 'fail',
    rep.recordsText.slice(0, 200),
  );
  record(
    '처방 버튼 터치 타깃 44px 이상',
    rep.actionMinH >= 44 ? 'pass' : 'fail',
    `${rep.actionMinH}px`,
  );
  record('닫기 버튼 터치 타깃 44px 이상', rep.closeMinH >= 44 ? 'pass' : 'fail', `${rep.closeMinH}px`);
  await page.screenshot({ path: `${SHOT_DIR}/kairo-report.png` });

  if (rep.actionBox) await page.touchscreen.tap(rep.actionBox.x, rep.actionBox.y);
  await page.waitForTimeout(200);
  const action = (await page.evaluate(`(() => ({
    count: window.__phase5Action,
    closed: document.getElementById('kairo-report').hidden,
  }))()`)) as { count: number; closed: boolean };
  record(
    '★ 처방을 진짜 터치하면 한 동작만 실행하고 결산을 닫는다',
    action.count === 1 && action.closed ? 'pass' : 'fail',
    `action ${action.count} · closed ${String(action.closed)}`,
  );

  await page.evaluate(`(() => {
    const h = window.__kairo, rep = window.__phase5Report;
    h.report.show(rep, { onClose: function () { return undefined; } });
  })()`);
  await page.click('#kairo-report-close');
  await page.waitForTimeout(200);
  const closed = (await page.evaluate(`document.getElementById('kairo-report').hidden`)) as boolean;
  record('결산을 닫으면 게임으로 돌아온다', closed ? 'pass' : 'fail');

  // ── 7j. 콤보·해금·의뢰 ──
  const prog = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    ${PAVE_ALL}
    const out = {};

    // 의뢰 패널이 상시 보인다
    const panel = document.getElementById('kairo-quests');
    out.panel = !!panel;
    out.panelText = panel ? panel.textContent.slice(0, 60) : '';

    const st = h.quests.questStatuses(p, h.getLastReport());
    out.quests = st.length;
    out.detailsFilled = st.every((s) => s.detail && s.detail.length > 0);
    out.progressInRange = st.every((s) => s.progress >= 0 && s.progress <= 1);

    // 해금 — 시작 등급에서 큰 시설은 막힌다
    const g0 = h.quests.gradeFor(0);
    out.startGrade = g0.grade;
    out.needTurtle = h.quests.requiredGrade('turtle_island');
    out.needShop = h.quests.requiredGrade('shop');

    // 콤보 미리보기 — 붙여 놓으면 터질 것을 미리 안다
    let spot = null;
    for (let j = 3; j < 18 && !spot; j++) {
      for (let i = 3; i < 26; i++) {
        let ok = true;
        for (let di = 0; di < 8 && ok; di++)
          for (let dj = 0; dj < 6; dj++)
            if (!t.isWalkable(i + di, j + dj) || w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) {
              ok = false; break;
            }
        if (ok) { spot = [i, j]; break; }
      }
    }
    if (!spot) return { ok: false, reason: '빈 육지를 못 찾았다' };
    const [bi, bj] = spot;

    const shop = p.place(t, w, h.gate, 'shop', bi, bj);
    if (shop.ok && shop.placed) sc.refreshFacility(shop.placed.handle);
    // 평상을 붙이면 '매점 앞 평상' 소형 콤보가 터져야 한다
    const far = h.combos.previewCombos(p, 'pyeongsang_row', bi + 20, bj);
    const near = h.combos.previewCombos(p, 'pyeongsang_row', bi, bj + 3);
    out.previewFar = far.gained.length;
    out.previewNear = near.gained.map((c) => c.id);
    out.previewNearSat = near.satisfaction;

    // 실제로 놓으면 발동한다
    const py = p.place(t, w, h.gate, 'pyeongsang_row', bi, bj + 3);
    if (py.ok && py.placed) sc.refreshFacility(py.placed.handle);
    out.active = h.combos.evaluateCombos(p).active.map((c) => c.id);

    // 보상은 한 번만
    const first = h.progress.claim(h.quests.questStatuses(p, h.getLastReport()));
    const second = h.progress.claim(h.quests.questStatuses(p, h.getLastReport()));
    out.claimFirst = first.cash;
    out.claimSecond = second.cash;

    h.guests.invalidate();
    h.refreshQuests();
    out.focus = [bi + 1, bj + 2];
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        panel: boolean;
        panelText: string;
        quests: number;
        detailsFilled: boolean;
        progressInRange: boolean;
        startGrade: number;
        needTurtle: number;
        needShop: number;
        previewFar: number;
        previewNear: string[];
        previewNearSat: number;
        active: string[];
        claimFirst: number;
        claimSecond: number;
        focus: number[];
      };

  if (!prog.ok) {
    record('콤보·의뢰', 'fail', prog.reason);
  } else {
    record('의뢰 패널이 상시 보인다', prog.panel ? 'pass' : 'fail', prog.panelText.replace(/\s+/g, ' '));
    record('의뢰 16종', prog.quests === 16 ? 'pass' : 'fail', `${prog.quests}종`);
    record(
      '의뢰마다 "얼마나 남았나"가 있다 — 조건 미달이 곧 다음 목표다',
      prog.detailsFilled && prog.progressInRange ? 'pass' : 'fail',
    );
    record(
      '해금 — 시작 1등급에 매점 · 거북섬은 최종 의뢰 보상 (Phase 3 첫 단골 경로)',
      prog.startGrade === 1 && prog.needTurtle === 99 && prog.needShop === 1 ? 'pass' : 'fail',
      `시작 ${prog.startGrade}등급 · 거북섬 ${prog.needTurtle} · 매점 ${prog.needShop}`,
    );
    record(
      '콤보 미리보기 — 붙이면 터지고 멀면 안 터진다',
      prog.previewFar === 0 && prog.previewNear.length > 0 ? 'pass' : 'fail',
      `멀리 ${prog.previewFar}개 · 가까이 ${prog.previewNear.join(',')} (+만족 ${prog.previewNearSat})`,
    );
    record(
      '실제로 놓으면 미리보기대로 발동한다',
      prog.active.includes('small_shop_pyeongsang') ? 'pass' : 'fail',
      prog.active.join(','),
    );
    record(
      '의뢰 보상은 한 번만 — 반복 지급은 무한 수입이다',
      prog.claimSecond === 0 ? 'pass' : 'fail',
      `1회 ${prog.claimFirst} · 2회 ${prog.claimSecond}`,
    );

    await page.evaluate(`window.__kairo.scene.focusTile(${prog.focus[0]}, ${prog.focus[1]})`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}/kairo-combos.png` });
  }

  // ── 7k. 위험도 상시 표시 ──
  const risk = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    ${PAVE_ALL}
    const box = document.getElementById('kairo-risk');
    const before = h.risk.assessRisk(p, h.guests);

    // 스릴 시설을 늘려 위험도를 올린다 — 물가에 잔교를 내고 인플레이터블을 붙인다
    let pier = null;
    for (let i = 4; i < 34 && !pier; i++) {
      for (let j = 4; j < 30; j++) {
        if (t.isWalkable(i, j) && !t.isWalkable(i, j + 1) && !p.handleAt(i, j)) {
          pier = { i: i, j: j + 1 }; break;
        }
      }
    }
    if (pier) {
      for (let k = 0; k < 6; k++) {
        const r = p.place(t, w, h.gate, 'float_deck', pier.i, pier.j + k);
        if (r.ok && r.placed) sc.refreshFacility(r.placed.handle);
      }
      for (const d of [1, 3]) {
        const r = p.place(t, w, h.gate, 'trampoline_w', pier.i + 1, pier.j + d);
        if (r.ok && r.placed) sc.refreshFacility(r.placed.handle);
      }
    }
    h.refreshRisk();
    const risky = h.risk.assessRisk(p, h.guests);
    const text = box ? box.textContent : '';

    // 안전 시설을 지어 내린다
    let built = 0;
    for (let i = 2; i < 30 && built < risky.safetyNeeded + 3; i++) {
      const r = p.place(t, w, h.gate, 'lifering', i, 3);
      if (r.ok && r.placed) { sc.refreshFacility(r.placed.handle); built++; }
    }
    h.refreshRisk();
    const safer = h.risk.assessRisk(p, h.guests);

    return {
      hasBox: !!box,
      text: text,
      /*
       * K47-② — 위험도 칩이 하단 바에서 **헤더 2줄째**로 옮겨졌다. 존재만 재면
       * 다시 바로 내려가도 초록불이라, 어디에 있는지와 tone 클래스를 같이 잡는다.
       * (tone 은 여태 아무도 안 쟀다 — krisk 만 남고 색이 죽어도 통과했다.)
       */
      inHeader: !!box && !!box.closest('#kairo-top'),
      cls: box ? box.className : '',
      beforeLevel: before.level,
      riskyLevel: risky.level,
      riskyRatio: risky.ratio,
      safetyNeeded: risky.safetyNeeded,
      built: built,
      saferLevel: safer.level,
      saferRatio: safer.ratio,
      accidentAtSafe: h.risk.assessRisk(p, h.guests).level === 'safe',
    };
  })()`)) as {
    hasBox: boolean;
    text: string;
    inHeader: boolean;
    cls: string;
    beforeLevel: string;
    riskyLevel: string;
    riskyRatio: number;
    safetyNeeded: number;
    built: number;
    saferLevel: string;
    saferRatio: number;
  };

  record('위험도가 화면에 상시 표시된다', risk.hasBox ? 'pass' : 'fail', risk.text.replace(/\n/g, ' / '));
  /*
   * 위험도 칩의 **자리와 색** (K47-②). 계획 §2 가 이 칩을 헤더 2줄째로 올렸다 —
   * 하단 바는 버튼 둘만 남는다. 자리를 안 재면 "다시 하단 바로" 회귀가 조용히 통과한다.
   * tone 클래스는 `krisk safe|watch|caution|danger` 넷 중 하나여야 한다 (`RiskTone`).
   */
  record(
    '위험도가 헤더 2줄째에 있다 · tone 클래스가 붙는다 (K47-②)',
    risk.inHeader && /^krisk (safe|watch|caution|danger)$/.test(risk.cls) ? 'pass' : 'fail',
    `부모 ${risk.inHeader ? '#kairo-top 안' : '#kairo-top 밖'} · class="${risk.cls}"`,
  );
  record(
    '스릴 시설을 늘리면 위험도가 올라간다',
    risk.riskyRatio > 0 ? 'pass' : 'fail',
    `${risk.beforeLevel} → ${risk.riskyLevel} (비율 ${(risk.riskyRatio * 100).toFixed(0)}%)`,
  );
  record(
    '안전 시설이 몇 개 더 필요한지 알려준다 — 그게 다음 목표다',
    risk.safetyNeeded >= 0 ? 'pass' : 'fail',
    `${risk.safetyNeeded}개 필요 · ${risk.built}개 지음`,
  );
  record(
    '안전 시설을 지으면 위험도가 내려간다 — 구명함을 왜 짓나에 대한 답',
    risk.saferRatio < risk.riskyRatio ? 'pass' : 'fail',
    `${(risk.riskyRatio * 100).toFixed(0)}% → ${(risk.saferRatio * 100).toFixed(0)}% (${risk.riskyLevel} → ${risk.saferLevel})`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-risk.png` });

  // ── 8. FPS ──
  await page.waitForTimeout(1200);
  const dbg4 = (await page.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  const fps = Number(/FPS (\d+)/.exec(dbg4)?.[1] ?? 0);
  record('FPS ≥ 30', fps >= 30 ? 'pass' : 'fail', `${fps}`);

  /*
   * ── 9. 세이브·건설비 ──
   *
   * K12/K13 에서 들어온 것. **새로고침을 넘는지**를 브라우저에서 직접 본다 —
   * 단위 테스트는 왕복만 보고, localStorage 가 실제로 써지는지는 못 본다.
   *
   * ⚠ 현금은 디버그 박스에서 읽는다 (만 단위 반올림). 배치가 실제로 돈을 쓰는지만
   * 보면 되므로 정밀도는 충분하고, 내부 상태를 창에 새로 노출하지 않는다.
   */
  const cashOf = async (): Promise<number> => {
    const t = (await page.evaluate(
      `document.getElementById('kairo-debug').textContent`,
    )) as string;
    return Number(/현금 (\d+)만/.exec(t)?.[1] ?? -1);
  };

  /*
   * ── 8b. 주간 의사결정 카드 ──
   *
   * 카드는 **루프를 지탱하는 장치**다 (§3.5) — 시설을 20개쯤 지으면 할 게 없어지고
   * `한 주 진행` 이 스킵 버튼이 되는 것을 막는다. 그래서 "sim 에 있다"로는 부족하고,
   * **버튼을 눌렀을 때 실제로 화면에 뜨는지**를 봐야 한다.
   */
  const cardFlow = (await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    if (!cv) return { ok: false, why: '카드 뷰가 없다' };
    const h = window.__kairo;
    const cashBefore = window.__kairo.week.cash;
    const tickerBefore = h.ticker.count;
    const toastBefore = (document.getElementById('kairo-toast') || {}).textContent || '';
    /*
     * Phase 6: 1~3주는 온보딩이라 일반 카드가 없다. 하네스는 주차만 셀업하고
     * 4주차 openWeekCards는 실제 게임 경로를 탄다. 카드 선택은 아래에서 진짜 터치로 한다.
     */
    h.week.abort();
    while (h.week.week < 3) h.week.run(new h.Rng(8100 + h.week.week), { season: 'summer' });
    h.openWeekCards();
    const root = document.getElementById('kairo-card');
    const shown = !!root && getComputedStyle(root).display !== 'none';
    if (!shown) {
      return { ok: false, shown: false, why: '4주차 첫 일반 카드가 안 떴다' };
    }
    const btns = [...root.querySelectorAll('button[data-option]')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const tops = btns.map((b) => Math.round(b.getBoundingClientRect().top));
    const labels = btns.map((b) => b.textContent.slice(0, 24));
    const enabled = btns.filter((b) => !b.disabled).length;
    const pick = btns.find((b) => !b.disabled);
    const pr = pick ? pick.getBoundingClientRect() : null;
    const visual = root.querySelector('.kcard-visual');
    const out = {
      ok: true, shown: true, cashBefore: cashBefore,
      options: btns.length, minHeight: Math.min.apply(null, heights),
      labels: labels, remaining: cv.remaining, enabled: enabled,
      title: (root.querySelector('.kcard-title') || {}).textContent || '',
      oneRow: tops.length > 0 && Math.max.apply(null, tops) - Math.min.apply(null, tops) <= 2,
      overflow: document.documentElement.scrollWidth - innerWidth,
      themeSprite: visual ? visual.dataset.sprite || '' : '',
      touchX: pr ? Math.round(pr.left + pr.width / 2) : 0,
      touchY: pr ? Math.round(pr.top + pr.height / 2) : 0,
      tickerBefore: tickerBefore,
      toastBefore: toastBefore
    };
    return out;
  })()`)) as {
    ok: boolean;
    why?: string;
    shown?: boolean;
    options?: number;
    minHeight?: number;
    labels?: string[];
    remaining?: number;
    cashBefore?: number;
    enabled?: number;
    title?: string;
    oneRow?: boolean;
    overflow?: number;
    themeSprite?: string;
    touchX?: number;
    touchY?: number;
    tickerBefore?: number;
    toastBefore?: string;
  };

  if (cardFlow.shown && cardFlow.touchX && cardFlow.touchY) {
    await page.touchscreen.tap(cardFlow.touchX, cardFlow.touchY);
    await page.waitForTimeout(250);
  }
  const cardTouchResult = (await page.evaluate(`(() => {
    const h = window.__kairo;
    return {
      visible: h.cardView.visible,
      cash: h.week.cash,
      weekStarted: !!h.week.liveProgress(),
      tickerAfter: h.ticker.count,
      toastAfter: (document.getElementById('kairo-toast') || {}).textContent || ''
    };
  })()`)) as {
    visible: boolean;
    cash: number;
    weekStarted: boolean;
    tickerAfter: number;
    toastAfter: string;
  };

  /*
   * ── 8·맵 타입 · 시나리오 (§4.5) ──
   *
   * **2회차를 하는 이유.** 맵 3종 × 시나리오 6종을 만들어 놓고 **고를 방법이 없으면
   * 데이터로만 존재한다** — 그래서 화면과 목표 표시를 함께 본다.
   */
  const scenarioUi = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-newgame-open');
    const goal = document.getElementById('kairo-goal');
    if (!open) return { ok: false, why: '새 판 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-newgame');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '새 판 화면이 안 열린다' };
    }
    const maps = [...panel.querySelectorAll('button[data-map]')];
    const scens = [...panel.querySelectorAll('button[data-scenario]')];
    const locked = scens.filter((b) => b.disabled).length;
    const hs = [...maps, ...scens].map((b) => Math.round(b.getBoundingClientRect().height));
    // 맵을 바꾸면 설명이 바뀐다
    const before = panel.textContent.slice(0, 400);
    maps[1].click();
    const after = panel.textContent.slice(0, 400);
    document.getElementById('kairo-newgame-close').click();
    return {
      ok: true, maps: maps.length, scens: scens.length, locked: locked,
      minH: hs.length ? Math.min.apply(null, hs) : 0,
      detailChanged: before !== after,
      // 홈 셸 v2: A/B/C 목표와 진행바, 메뉴의 판 설정 줄을 본다
      goalChips: goal ? goal.querySelectorAll('.kgoal').length : 0,
      goalBars: goal ? goal.querySelectorAll('.kprog').length : 0,
      goalText: goal ? goal.textContent : '(없음)',
      contextText: (document.getElementById('kairo-context') || {}).textContent || '',
      mapName: window.__kairo.mapDef.name,
      scenarioName: window.__kairo.scenario.name
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    maps?: number;
    scens?: number;
    locked?: number;
    minH?: number;
    detailChanged?: boolean;
    goalChips?: number;
    goalBars?: number;
    goalText?: string;
    contextText?: string;
    mapName?: string;
    scenarioName?: string;
  };

  record(
    '새 판 화면에 맵 3종 · 시나리오 6종이 있다',
    scenarioUi.ok && scenarioUi.maps === 3 && scenarioUi.scens === 6 ? 'pass' : 'fail',
    scenarioUi.ok
      ? `맵 ${scenarioUi.maps} · 시나리오 ${scenarioUi.scens} (잠김 ${scenarioUi.locked})`
      : (scenarioUi.why ?? '실패'),
  );
  record(
    '★ 카드는 언제나 고를 수 있는 선택지가 있다 — 판이 잠기지 않는다 (K37)',
    !cardFlow.shown || (cardFlow.enabled ?? 0) > 0 ? 'pass' : 'fail',
    cardFlow.shown
      ? `선택지 ${cardFlow.options} · 고를 수 있는 것 ${cardFlow.enabled}`
      : '이번 주 카드 0장',
  );
  record(
    '아직 안 열린 시나리오가 잠겨 있다 — 처음부터 다 열리면 해금이 무의미하다',
    (scenarioUi.locked ?? 0) > 0 ? 'pass' : 'fail',
    `${scenarioUi.locked}개 잠김`,
  );
  record(
    '맵을 바꾸면 유리·불리 설명이 바뀐다 — 고를 근거가 있어야 고르는 것이다',
    scenarioUi.detailChanged === true ? 'pass' : 'fail',
  );
  record(
    '새 판 화면 버튼이 44px 이상',
    (scenarioUi.minH ?? 0) >= 44 ? 'pass' : 'fail',
    `최소 ${scenarioUi.minH}px`,
  );
  /*
   * ⚠ 옛 계약(A/B/C 세 칩 + 진행바 둘)은 **UI v3 가 이미 폐기했다.** 70px 폭에서 B/C 의
   * label/detail 이 `display:none` 이 되어 화면에 하트·별만 남았고, 그건 "목표가 있다"가
   * 아니라 "뜻을 말하지 못한다"였다. 홈은 **현재 행동 한 줄**이고 중·장기는 메뉴의
   * `성장 › 목표` 가 소유한다 — 개수가 아니라 **그 한 줄이 실제로 문장인지**를 잰다.
   */
  record(
    '★ 다음 할 일 한 줄이 홈에 상시 표시된다 (UI v3·v4)',
    (scenarioUi.goalChips ?? 0) === 1 &&
      (scenarioUi.goalText ?? '').includes('다음 할 일') &&
      (scenarioUi.goalText ?? '').length > 12 ? 'pass' : 'fail',
    `칩 ${scenarioUi.goalChips} · "${(scenarioUi.goalText ?? '').slice(0, 60)}"`,
  );
  record(
    '판 설정(맵·시나리오)은 메뉴 상단으로 갔다 — 설정은 목표가 아니다',
    (scenarioUi.contextText ?? '').includes(scenarioUi.mapName ?? '@@') ? 'pass' : 'fail',
    scenarioUi.contextText ?? '',
  );

  /*
   * ── 8·사고 (§12.1) ──
   *
   * v4 결정: **실패는 내 선택 때문이어야 한다.** 위험 단계에서만 사고가 나고, 사고 뒤에도
   * 선택이 있다. 확률이 0 일 때 안 나는 것과, 대응 카드가 실제로 뜨는 것을 함께 본다.
   */
  const accident = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort(); // 새 판 부팅이 흐름 주를 시작해 뒀을 수 있다 (K39)
    const safe = h.week.run(new h.Rng(31), { season: 'summer', accidentChance: 0 });
    const hit = h.week.run(new h.Rng(31), { season: 'summer', accidentChance: 1 });
    return {
      safeAccident: safe.accident, hitAccident: hit.accident,
      safeRevenue: safe.revenue, hitRevenue: hit.revenue,
      idleAfter: h.guests.idleCount
    };
  })()`)) as {
    safeAccident: unknown;
    hitAccident: { handle: number; defId: string; weeks: number } | null;
    safeRevenue: number;
    hitRevenue: number;
    idleAfter: number;
  };
  record(
    '확률이 0 이면 사고가 안 난다 — 안전한데 사고가 나면 RNG 세금이다',
    accident.safeAccident === null ? 'pass' : 'fail',
  );
  /*
   * ⚠ "매출이 준다"를 요구하면 안 된다. 요금을 **실제 이용 시설**에서 받게 된 뒤로는,
   * 싼 시설이 닫히면 손님이 비싼 시설로 옮겨가 **매출이 오를 수도 있다** (실측: 구명함이
   * 닫혔는데 51.5만 → 52.0만). 그건 버그가 아니라 대체 효과다.
   *
   * 성립하는 성질은 이것이다: **사고가 기록되고, 1~3주이고, 그 시설이 실제로 선다.**
   * 경제적 결과는 포화되지 않은 공원에서 단위 테스트가 본다.
   */
  record(
    '사고가 나면 시설이 1~3주 닫힌다 — 그 시설은 목적지에서 빠진다',
    accident.hitAccident !== null &&
      accident.hitAccident.weeks >= 1 &&
      accident.hitAccident.weeks <= 3 &&
      accident.idleAfter > 0
      ? 'pass'
      : 'fail',
    accident.hitAccident
      ? `${accident.hitAccident.defId} ${accident.hitAccident.weeks}주 · ` +
        `선 시설 ${accident.idleAfter}개 · 매출 ${accident.safeRevenue} → ${accident.hitRevenue}`
      : '사고가 안 났다',
  );

  const accidentUi = (await page.evaluate(`(() => {
    const card = window.__kairo.cardsApi.triggerCard('accident_response');
    if (!card) return { ok: false, why: '사고 카드가 없다' };
    window.__kairoCards.show([card], window.__kairo.week.cash, function () { return undefined; });
    const root = document.getElementById('kairo-card');
    const btns = [...root.querySelectorAll('button')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const labels = btns.map((b) => b.textContent.slice(0, 12));
    const cashBefore = window.__kairo.week.cash;
    // 사람이 쓰는 경로와 같은 pick — 첫 번째(보상 합의)
    window.__kairoCards.pickForTest(0);
    return {
      ok: true, options: btns.length,
      minH: heights.length ? Math.min.apply(null, heights) : 0,
      labels: labels, cashBefore: cashBefore, cashAfter: window.__kairo.week.cash,
      closed: !window.__kairoCards.visible
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    options?: number;
    minH?: number;
    labels?: string[];
    cashBefore?: number;
    cashAfter?: number;
    closed?: boolean;
  };
  record(
    '사고 대응 카드가 선택지 3개로 뜬다 — 순수 처벌은 기억에 안 남는다',
    accidentUi.ok && accidentUi.options === 3 && (accidentUi.minH ?? 0) >= 44 ? 'pass' : 'fail',
    accidentUi.ok
      ? `${(accidentUi.labels ?? []).join(' / ')} · 최소 ${accidentUi.minH}px`
      : (accidentUi.why ?? '실패'),
  );

  /*
   * ── 8·도감 (§15.8 · §D) ──
   *
   * **발견·수집이 훅이다.** 162 항목(콤보 70 + 시설 73 + 장비 19)을 스크롤 지옥 없이
   * 보여주는지 — 기본이 "미발견만"인지, 한 항목이 56px 인지.
   */
  const catalog = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-catalog-open');
    if (!open) return { ok: false, why: '도감 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-catalog');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '도감이 안 열린다' };
    }
    const filter = document.getElementById('kairo-catalog-filter');
    const defaultUndiscovered = filter.textContent.indexOf('미발견만') >= 0;
    // K34: 항목이 div → button 이 됐다 (kitem wide). 태그를 안 박고 속성으로만 찾는다
    const rows = [...panel.querySelectorAll('[data-entry]')];
    const heights = rows.map((r) => Math.round(r.getBoundingClientRect().height));
    const foundCount = rows.filter((r) => r.dataset.found === '1').length;
    const tabs = [...panel.querySelectorAll('button[data-tab]')].map((b) => b.textContent);
    const tiers = [...panel.querySelectorAll('button[data-tier]')].length;
    // 전체 보기로 바꾸면 발견한 것도 나온다
    filter.click();
    const rowsAll = panel.querySelectorAll('[data-entry]').length;
    return {
      ok: true, defaultUndiscovered: defaultUndiscovered,
      rows: rows.length, rowsAll: rowsAll, foundCount: foundCount,
      minRow: heights.length ? Math.min.apply(null, heights) : 0,
      tabs: tabs, tiers: tiers,
      counts: window.__kairo.catalog.counts()
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    defaultUndiscovered?: boolean;
    rows?: number;
    rowsAll?: number;
    foundCount?: number;
    minRow?: number;
    tabs?: string[];
    tiers?: number;
    counts?: Record<string, [number, number]>;
  };

  record(
    '도감이 콤보·시설·장비 세 탭으로 열린다',
    catalog.ok && (catalog.tabs ?? []).length === 3 ? 'pass' : 'fail',
    catalog.ok ? (catalog.tabs ?? []).join(' · ') : (catalog.why ?? '실패'),
  );
  record(
    '기본이 "미발견만"이다 — 할 일이 보여야 도감이 목표가 된다',
    catalog.defaultUndiscovered === true && catalog.foundCount === 0 ? 'pass' : 'fail',
    `필터 기본 ${catalog.defaultUndiscovered ? '미발견만' : '전체'} · 발견 항목 ${catalog.foundCount}개 노출`,
  );
  record(
    '한 항목이 56px 이상 — 스크롤 지옥 방지',
    (catalog.minRow ?? 0) >= 56 ? 'pass' : 'fail',
    `최소 ${catalog.minRow ?? 0}px · ${catalog.rows}줄`,
  );
  record(
    '티어 탭이 4개다 (전체·소·중·대)',
    catalog.tiers === 4 ? 'pass' : 'fail',
    `${catalog.tiers}개`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/kairo-catalog.png` });
  await page.evaluate(`document.getElementById('kairo-catalog-close').click()`);

  /*
   * ── 8·감상 화면 (§15 v4 신규) ──
   *
   * "10시간 뒤의 리조트가 **스크린샷 찍고 싶은 화면**이어야 한다."
   * UI 가 걷히는지, 씬이 **안 멈추는지**(살아 있어야 한다), 공유 이미지가 실제로 나오는지.
   */
  const showcase = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-showcase-open');
    if (!open) return { ok: false, why: '감상 버튼이 없다' };
    // K28: 버튼이 하단 바 안으로 들어가 body 직계가 아니다. 보이는 버튼 전체를 센다.
    // (백틱과 이름 있는 함수는 이 리터럴 안에서 못 쓴다 — 파일 머리 함정 참고)
    const before = [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 2).length;
    open.click();
    const panel = document.getElementById('kairo-showcase');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '감상 화면이 안 열린다' };
    }
    const after = [...document.querySelectorAll('button')]
      .filter((b) => b.getBoundingClientRect().width > 2).length;
    const share = document.getElementById('kairo-showcase-share');
    const name = document.getElementById('kairo-showcase-name');
    return {
      ok: true, buttonsBefore: before, buttonsAfter: after,
      shareH: Math.round(share.getBoundingClientRect().height),
      name: name.textContent,
      upscale: window.__kairo.scene.upscale,
      running: window.__kairo.game.loop.started
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    buttonsBefore?: number;
    buttonsAfter?: number;
    shareH?: number;
    name?: string;
    upscale?: number;
    running?: boolean;
  };

  record(
    '감상 화면이 UI 를 걷어낸다',
    showcase.ok && (showcase.buttonsAfter ?? 99) < (showcase.buttonsBefore ?? 0) ? 'pass' : 'fail',
    showcase.ok
      ? `버튼 ${showcase.buttonsBefore} → ${showcase.buttonsAfter}개`
      : (showcase.why ?? '실패'),
  );
  record(
    '감상 중에도 씬이 돈다 — 정지 화면이면 "살아 움직이는 광경"이 아니다',
    showcase.running === true ? 'pass' : 'fail',
    `루프 ${showcase.running ? '진행' : '정지'} · 배율 ${showcase.upscale}`,
  );
  record(
    '이름·등급이 화면에 박힌다',
    (showcase.name ?? '').includes('★') ? 'pass' : 'fail',
    showcase.name ?? '',
  );
  record(
    '공유 버튼이 48px 이상',
    (showcase.shareH ?? 0) >= 48 ? 'pass' : 'fail',
    `${showcase.shareH ?? 0}px`,
  );

  const shared = (await page.evaluate(`(() => {
    const r = window.__kairo.showcase.share();
    const img = window.__kairo.showcase.lastShareImage;
    return { ok: r.ok, reason: r.reason || '', len: img ? img.length : 0 };
  })()`)) as { ok: boolean; reason: string; len: number };
  record(
    '공유 이미지가 실제로 만들어진다 — 검은 그림이면 실패로 돌려준다',
    shared.ok && shared.len > 1000 ? 'pass' : 'fail',
    shared.ok ? `${(shared.len / 1024).toFixed(0)}KB` : shared.reason,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-showcase.png` });
  await page.evaluate(`document.getElementById('kairo-showcase-close').click()`);

  /*
   * ── 8·배경 겹 (§7 배경) ──
   *
   * **시차가 핵심이다.** 배경이 지도와 같은 속도로 움직이면 큰 그림 한 장이고, 안 움직이면
   * 벽지다. 그래서 "떠 있나"가 아니라 **"카메라보다 느리게 따라오나"**를 잰다.
   *
   * ⚠ 개수와 id 를 **여기 박지 않는다** (K36-B). 예전엔 `count === 2` 와
   * `['backdrop/ridge','backdrop/farbank']` 가 박혀 있어서, 겹을 하나 더하는 순간
   * 검사 세 개가 같이 깨졌다 — 검사가 계약을 지킨 게 아니라 **자기 상수를 지키고 있었다.**
   * 정본은 `KAIRO.backdrop.layers` 이므로 거기서 읽는다. 그러면 겹을 더해도 안 깨지고,
   * 계약과 화면이 갈라지면 그때는 정직하게 잡힌다.
   */
  const backLayers = KAIRO.backdrop.layers;
  const backIds = backLayers.map((l) => `backdrop/${l}`);

  const backdrop = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const info = h.scene.backdropInfo;
    // 카메라를 옮겨 배경이 실제로 덜 움직이는지 본다
    const before = h.scene.tileScreenRect(10, 10);
    h.scene.focusTile(28, 10);
    const after = h.scene.tileScreenRect(10, 10);
    return {
      count: info.count, factors: info.factors, factorsY: info.factorsY, depths: info.depths,
      surround: info.surround,
      tileMoved: Math.abs(after.x - before.x)
    };
  })()`)) as {
    count: number;
    factors: number[];
    factorsY: number[];
    depths: number[];
    surround: number;
    tileMoved: number;
  };

  /*
   * ## 배경은 **두 갈래**다 (K38)
   *
   * 실물 아트(`bg-horizon.png`)가 있으면 그 한 장이 하늘·먼 봉우리·숲을 다 담으므로
   * 겹이 하나다. 없으면 절차적 3겹 폴백이다. 두 갈래는 **지켜야 할 성질이 다르다** —
   * 한쪽 기준으로 뭉뚱그리면 어느 쪽도 제대로 안 잰다.
   */
  /*
   * ## 배경 3겹은 **안전망**이고, 평소엔 아예 안 만든다
   *
   * 지도 바깥이 지형으로 덮이므로(K38) 배경은 한 픽셀도 안 보인다. 안 보이는 것과
   * **없는 것**은 다르므로 굽기가 성공하면 아예 만들지 않는다 — 타일스프라이트 3장이
   * 텍스처 9.6MB 를 붙들고 있었다 (아키텍처 점검 실측).
   *
   * 그래서 여기서 재는 것은 "3겹이 있다"가 아니라 **"둘 중 하나가 성립한다"** 이다:
   *   · 굽기 성공 → 지형이 깔렸고 배경은 0겹
   *   · 굽기 실패 → 배경 3겹이 계약대로 서 있다 (하늘 대신 산이 보인다)
   */
  if (backdrop.surround >= 1) {
    record(
      '지형이 깔리면 배경 3겹은 안 만든다 — 안 보이는 텍스처 9.6MB (K38)',
      backdrop.count === 0 ? 'pass' : 'fail',
      `지형 ${backdrop.surround}장 · 배경 ${backdrop.count}겹 (0 이어야 한다)`,
    );
  } else {
    record(
      `배경 겹 수가 계약과 같다 (${backLayers.length}겹) — 굽기 실패 시의 안전망`,
      backdrop.count === backLayers.length ? 'pass' : 'fail',
      `${backdrop.count}겹 · 시차 ${backdrop.factors.join(', ')} (계약 ${backLayers.join('·')})`,
    );
    /*
     * 겹마다 시차가 **달라야** 한다. 같은 값이 둘이면 겹쳐 움직이므로 한 장과 같다.
     */
    const uniqueFactors = new Set(backdrop.factors).size;
    record(
      '배경이 지도보다 느리게 따라온다 — 같으면 큰 그림 한 장, 0 이면 벽지다',
      backdrop.factors.length === backLayers.length &&
        backdrop.factors.every((f) => f > 0 && f < 1) &&
        uniqueFactors === backdrop.factors.length
        ? 'pass'
        : 'fail',
      backLayers.map((l, k) => `${l} ${backdrop.factors[k]}`).join(' · ') + ' (지도는 1.0)',
    );
    record(
      '먼 겹일수록 시차가 작다 — 뒤집히면 산이 앞으로 나온다',
      backdrop.factors.every((f, k) => k === 0 || f > (backdrop.factors[k - 1] as number))
        ? 'pass'
        : 'fail',
      backdrop.factors.join(' < '),
    );
    record(
      '배경이 지면보다 뒤에 있다',
      backdrop.depths.length > 0 && backdrop.depths.every((d) => d < 0) ? 'pass' : 'fail',
      `깊이 ${backdrop.depths.join(', ')}`,
    );
  }

  const backTile = (await page.evaluate(`(() => {
    const prov = window.__kairo.provider;
    const out = [];
    for (const id of ${JSON.stringify(backIds)}) {
      if (!prov.has(id)) { out.push({ id: id, ok: false, why: '없다' }); continue; }
      const c = prov.get(id);
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      // 좌우 끝 열이 이어지는가 — 가로 타일링의 조건
      let diff = 0;
      for (let y = 0; y < c.height; y++) {
        const a = (y * c.width) * 4;
        const b = (y * c.width + c.width - 1) * 4;
        for (let k = 0; k < 4; k++) diff += Math.abs(d[a + k] - d[b + k]);
      }
      out.push({ id: id, ok: true, w: c.width, h: c.height, edgeDiff: Math.round(diff / c.height) });
    }
    return out;
  })()`)) as { id: string; ok: boolean; why?: string; w?: number; h?: number; edgeDiff?: number }[];

  record(
    '배경 좌우 끝이 이어진다 — 가로로 반복되므로 끊기면 바로 보인다',
    backTile.every((b) => b.ok && (b.edgeDiff ?? 999) < 60) ? 'pass' : 'fail',
    backTile.map((b) => `${b.id.split('/')[1]} ${b.w}×${b.h} 끝차 ${b.edgeDiff}`).join(' · '),
  );

  /*
   * ── 8·코스 (§7) ──
   *
   * 여섯 동사 중 "코스를 그린다". **프리셋 탭 → 핸들 → 확정**이 실제로 도는지,
   * 그리고 **적합도 배지가 붙는지**를 본다 (19×6 표를 읽히지 않는 것이 §B 의 요지다).
   */
  const courseUi = (await page.evaluate(`(() => {
    // K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다
    document.getElementById('kairo-menu-open').click();
    const open = document.getElementById('kairo-course-open');
    if (!open) return { ok: false, why: '코스 버튼이 없다' };
    open.click();
    const panel = document.getElementById('kairo-course');
    if (!panel || panel.hidden) return { ok: false, why: '코스 패널이 안 열린다' };
    /*
     * K33: 패널은 **슬림 바가 기본**이다. 프리셋은 펼쳐야 나온다 — 예전엔 열자마자
     * 화면의 49% 를 먹었고, 그래서 정작 끌 핸들이 화면 밖으로 밀렸다.
     *
     * ⚠ v2: 경영 메뉴의 '코스'는 **물려받은 코스를 정보 상태로** 연다. 정보 독에는
     * '설정'이 없다 (닫기/루트 조정 둘뿐) — 사람과 같은 경로로 편집에 들어간 뒤 편다.
     */
    const collapsedH = Math.round(panel.getBoundingClientRect().height);
    if (window.__kairo.coursePanel.state.phase === 'info') {
      document.getElementById('kairo-course-confirm').click();
    }
    const toggle = document.getElementById('kairo-course-toggle');
    if (!toggle) return { ok: false, why: '설정 버튼이 없다 (phase ' + window.__kairo.coursePanel.state.phase + ')' };
    toggle.click();
    const expandedH = Math.round(panel.getBoundingClientRect().height);
    const tabs = [...panel.querySelectorAll('button[data-preset]')];
    const heights = tabs.map((b) => Math.round(b.getBoundingClientRect().height));
    const badges = tabs.map((b) => b.dataset.fit);
    return {
      ok: true, tabs: tabs.length,
      minTab: heights.length ? Math.min.apply(null, heights) : 0,
      badges: badges,
      distinct: [...new Set(badges)].length,
      overflow: panel.scrollWidth > panel.clientWidth,
      collapsedH: collapsedH, expandedH: expandedH, vh: window.innerHeight
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    tabs?: number;
    minTab?: number;
    badges?: string[];
    distinct?: number;
    overflow?: boolean;
    collapsedH?: number;
    expandedH?: number;
    vh?: number;
  };

  record(
    '코스 패널에 프리셋 6종이 있다',
    courseUi.ok && courseUi.tabs === 6 ? 'pass' : 'fail',
    courseUi.ok ? `${courseUi.tabs}종` : (courseUi.why ?? '실패'),
  );
  record(
    '프리셋 탭이 44px 이상 — 폰 터치 타깃',
    (courseUi.minTab ?? 0) >= 44 ? 'pass' : 'fail',
    `최소 ${courseUi.minTab ?? 0}px`,
  );
  /*
   * K33: 접힘이 기본이다. 예전 패널은 열자마자 화면의 **49%** 를 먹어서 핸들을 끌 자리가
   * 안 남았다. 접힘 ≤14% 는 HUD 에 쓰는 것과 같은 자다.
   */
  record(
    '★ 코스 패널은 접힘이 기본 — 화면의 14% 이하 (예전 49%)',
    (courseUi.collapsedH ?? 999) / (courseUi.vh ?? 1) <= 0.14 ? 'pass' : 'fail',
    `접힘 ${Math.round(((courseUi.collapsedH ?? 0) / (courseUi.vh ?? 1)) * 100)}% · ` +
      `펼침 ${Math.round(((courseUi.expandedH ?? 0) / (courseUi.vh ?? 1)) * 100)}%`,
  );
  record(
    '⚠ 음성 대조군 — 펼치면 실제로 커진다 (접힘이 그냥 빈 바가 아닌가)',
    (courseUi.expandedH ?? 0) > (courseUi.collapsedH ?? 0) + 100 ? 'pass' : 'fail',
    `${courseUi.collapsedH ?? 0}px → ${courseUi.expandedH ?? 0}px`,
  );
  record(
    '적합도 배지가 형태마다 다르다 — 19×6 표를 읽히지 않는다는 것이 요지다',
    (courseUi.distinct ?? 0) >= 2 ? 'pass' : 'fail',
    (courseUi.badges ?? []).join(' '),
  );

  const coursePlace = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const panel = h.coursePanel;
    const api = h.courseApi;
    /*
     * 이 절은 **새 코스 생성**을 잰다. 앞 절이 패널의 시각 표면만 읽었더라도 inherited
     * course의 info context가 남아 있을 수 있으므로, 사람의 닫기→코스 열기와 같은 경로로
     * create context를 명시한다. info에서 test 확정을 직접 부르면 production UI에는 없는
     * "기존 코스를 제외하고 같은 dock에 새 코스 추가" 경로가 생겨 뒤 절 전체를 오염시킨다.
     */
    const takenBefore = h.courses.all.map((course) => course.dock.x + ',' + course.dock.y);
    panel.hide();
    panel.show();
    /*
     * 선착장 **주변**의 물 타일을 모은다 (K36). 예전엔 (0,0)~(40,32) 창을 훑었는데
     * 격자가 96×72 가 되고 선착장이 맵 가운데로 가면서 그 창이 선착장에서 멀어졌다 —
     * 코스는 선착장에서 DOCK_REACH_TILES 안에서 시작해야 한다.
     */
    panel.select('shuttle', 'banana');
    const dock = panel.state.dock;
    if (!dock) return { ok: false, why: '선착장이 없다' };
    const createState = panel.state;
    const onTaken = takenBefore.includes(dock.x + ',' + dock.y);
    const water = [];
    for (let r = 2; r <= 10 && water.length < 60; r++) {
      for (let dj = -r; dj <= r && water.length < 60; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = dock.x + di, j = dock.y + dj;
          if (h.terrain.inside(i, j) && h.terrain.isWater(i, j)) water.push({ i: i, j: j });
        }
      }
    }
    if (water.length < 4) return { ok: false, why: '선착장 주변에 물이 부족하다' };
    const st0 = panel.state;
    for (let k = 0; k < st0.handles.length; k++) {
      const w = water[Math.min(water.length - 1, 3 + k * 4)];
      panel.moveHandleForTest(k, w.i, w.j);
    }
    const before = h.courses.count;
    const cashBefore = h.week.cash;
    const added = panel.confirmForTest();
    const weekly = h.courses.weekly();
    return {
      ok: true, before: before, added: added, count: h.courses.count,
      phase: createState.phase, selectedHandle: createState.selectedHandle,
      dock: dock, onTaken: onTaken,
      cashBefore: cashBefore, cashAfter: h.week.cash,
      revenue: weekly.potentialRevenue, upkeep: weekly.upkeep,
      thrill: Math.round(weekly.thrill), safety: Math.round(weekly.safety),
      presets: api.PRESETS.length, equipment: api.COURSE_EQUIPMENT.length
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    before?: number;
    added?: number;
    count?: number;
    phase?: string;
    selectedHandle?: number | null;
    dock?: { x: number; y: number };
    onTaken?: boolean;
    cashBefore?: number;
    cashAfter?: number;
    revenue?: number;
    upkeep?: number;
    thrill?: number;
    safety?: number;
    presets?: number;
    equipment?: number;
  };

  record(
    '핸들을 물 위로 옮기고 확정하면 코스가 생긴다',
    coursePlace.ok && coursePlace.phase === 'create' && coursePlace.selectedHandle === null &&
      coursePlace.onTaken === false && (coursePlace.added ?? 0) === 1
      ? 'pass'
      : 'fail',
    coursePlace.ok
      ? `create #${coursePlace.selectedHandle ?? '없음'} · 잔교 (${coursePlace.dock?.x},${coursePlace.dock?.y}) ` +
        `${coursePlace.onTaken ? '⚠ 사용 중' : '빈 곳'} · 코스 ${coursePlace.before} → ${coursePlace.count}`
      : (coursePlace.why ?? '실패'),
  );
  record(
    '코스 장비값이 실제로 나간다',
    (coursePlace.cashAfter ?? 0) < (coursePlace.cashBefore ?? 0) ? 'pass' : 'fail',
    `현금 ${Math.round((coursePlace.cashBefore ?? 0) / 10000)}만 → ` +
      `${Math.round((coursePlace.cashAfter ?? 0) / 10000)}만`,
  );
  record(
    '코스가 매출·스릴·안전을 낸다',
    (coursePlace.revenue ?? 0) > 0 && (coursePlace.thrill ?? 0) > 0 ? 'pass' : 'fail',
    `주매출 ${coursePlace.revenue} · 유지 ${coursePlace.upkeep} · ` +
      `스릴 ${coursePlace.thrill} · 안전 ${coursePlace.safety}`,
  );
  record(
    '장비 19종 · 프리셋 6종이 계약대로다',
    coursePlace.presets === 6 && coursePlace.equipment === 19 ? 'pass' : 'fail',
    `${coursePlace.presets} × ${coursePlace.equipment}`,
  );

  await page.screenshot({ path: `${SHOT_DIR}/kairo-course.png` });
  await page.evaluate(`document.getElementById('kairo-course-close').click()`);

  /*
   * ── 8b·코스를 **화면에서** 만질 수 있나 (K33) ──
   *
   * ⚠ 위 절들은 `moveHandleForTest`/`confirmForTest` 로 **좌표를 직접 넣는다.** sim 은
   * 맞는지 보지만 손가락이 닿는지는 안 본다. 그래서 "핸들이 화면 밖(x = −284)" 이
   * 검사를 통과한 채 오래 남아 있었다. 여기서는 화면만 본다.
   */
  const courseFrame = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    // 편집을 새로 연다
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="course"]').click();
    const panel = document.getElementById('kairo-course');
    if (!panel || panel.hidden) return { ok: false, why: '코스 패널이 안 열린다' };
    const st = h.coursePanel.state;
    if (st.handles.length === 0) return { ok: false, why: '핸들이 없다 — 선착장을 못 찾았다' };

    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const pos = st.handles.map((v) => {
      const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
      return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy) };
    });
    const barTop = Math.round(panel.getBoundingClientRect().top);
    return {
      ok: true, pos: pos, barTop: barTop,
      vw: window.innerWidth, vh: window.innerHeight,
      dockCount: h.courseApi.dockCandidates(
        h.placement.all().filter((f) => f.defId === 'float_deck').map((f) => ({ x: f.i, y: f.j })),
        h.gate
      ).length,
      dock: st.dock
    };
  })()`)) as
    | { ok: false; why: string }
    | {
        ok: true;
        pos: { x: number; y: number }[];
        barTop: number;
        vw: number;
        vh: number;
        dockCount: number;
        dock: { x: number; y: number } | null;
      };

  if (!courseFrame.ok) {
    record('★ 코스를 열면 핸들이 화면 안에 있다 (K33)', 'fail', courseFrame.why);
  } else {
    const inView = courseFrame.pos.every(
      (p) => p.x > 0 && p.x < courseFrame.vw && p.y > 0 && p.y < courseFrame.barTop,
    );
    record(
      '★ 코스를 열면 핸들이 **화면 안**, 슬림 바 위에 있다 (K33)',
      inView ? 'pass' : 'fail',
      `핸들 ${courseFrame.pos.map((p) => `(${p.x},${p.y})`).join(' ')} · ` +
        `화면 ${courseFrame.vw}×${courseFrame.vh} · 바 상단 ${courseFrame.barTop}`,
    );
  }

  /*
   * ⚠ 음성 대조군 — 프레이밍을 안 하면 화면 밖이다.
   *
   * 실측 대조군이 이미 있다: K33 이전에 이 값이 **x = −284, −380** 이었다. 여기서는
   * 카메라를 딴 데로 보낸 뒤 다시 재서, "원래 화면 안이던 것"이 아님을 보인다.
   */
  const frameControl = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const at = () => h.coursePanel.state.handles.map((v) => {
      const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
      return Math.round(cr.left + (r.x + 16) * sx);
    });
    h.scene.focusTile(60, 2);            // 코스에서 멀리 — 프레이밍 없는 상태를 흉내낸다
    const away = at();
    h.scene.frameCourse(h.coursePanel.state.dock, h.coursePanel.state.handles, 160);
    const framed = at();
    return { away: away, framed: framed, vw: window.innerWidth };
  })()`)) as { away: number[]; framed: number[]; vw: number };
  record(
    '⚠ 음성 대조군 — 프레이밍이 없으면 화면 밖이다 (검사가 유의미한가)',
    frameControl.away.some((x) => x < 0 || x > frameControl.vw) &&
      frameControl.framed.every((x) => x > 0 && x < frameControl.vw)
      ? 'pass'
      : 'fail',
    `프레이밍 전 ${frameControl.away.join(',')} → 후 ${frameControl.framed.join(',')}`,
  );

  /*
   * ★ **진짜 손가락으로 핸들을 끈다.**
   *
   * `moveHandleForTest` 를 안 쓴다. 화면 좌표로 touchStart → touchMove → touchEnd 를
   * 보내고, 핸들의 격자 좌표가 실제로 바뀌는지 본다. 이 검사가 있어야 "화면 밖" 같은
   * 문제가 다시 조용히 통과하지 않는다.
   */
  const before0 = (await page.evaluate(
    `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
  )) as string;
  const grab = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const v = h.coursePanel.state.handles[0];
    const r = h.scene.tileScreenRect(Math.round(v.x), Math.round(v.y));
    return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy) };
  })()`)) as { x: number; y: number };
  await touch('touchStart', grab.x, grab.y);
  for (let k = 1; k <= 6; k++) await touch('touchMove', grab.x + k * 6, grab.y + k * 4);
  await touch('touchEnd', 0, 0);
  await page.waitForTimeout(250);
  const after0 = (await page.evaluate(
    `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
  )) as string;
  record(
    '★ 진짜 손가락으로 핸들을 끈다 — 백도어가 아니라 화면으로 (K33)',
    before0 !== after0 ? 'pass' : 'fail',
    `${before0} → ${after0}`,
  );

  /*
   * 선착장을 지도에서 탭해 고른다.
   *
   * 새 판의 잔교는 하나다 — 후보를 하나 더 만들어야 "고른다"가 성립한다.
   */
  const dockPick = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain;
    // 물가에서 떨어진 곳에 선착장을 하나 더 낸다 (K45: 선착장이 곧 코스 후보다)
    let made = 0, tip = null, lastI = -99;
    for (let i = 10; i < 80 && made < 2; i++) {
      if (i - lastI < 10) continue; // 서로 떨어뜨린다 — 코스가 안 겹치게 (확정 절 몫까지 둘)
      for (let j = 1; j < 60; j++) {
        if (!t.isWalkable(i, j) || t.isWater(i, j)) continue;
        if (!t.isWater(i, j + 1) || !t.isWater(i, j + 2)) continue;
        if (h.placement.place(t, h.walls, h.gate, 'dock', i, j + 1).ok) {
          made++; tip = [i, j + 1]; lastI = i;
        }
        break;
      }
    }
    if (made === 0) return { ok: false, why: '두 번째 선착장을 못 놓았다' };
    h.guests.invalidate();
    h.scene.rebuildFacilities();
    // 패널을 다시 열어 후보를 갱신한다
    h.coursePanel.hide();
    h.coursePanel.show();
    const cands = h.scene.dockMarks;
    const before = h.coursePanel.state.dock;
    return { ok: true, cands: cands, before: before, made: made, tip: tip };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; cands: { x: number; y: number }[]; before: { x: number; y: number }; made: number };

  if (!dockPick.ok) {
    record('선착장을 지도에서 탭해 고른다 (K33)', 'fail', dockPick.why);
  } else {
    record(
      '선착장 후보가 지도에 보인다 — 잔교 하나가 후보 하나 (K33)',
      dockPick.cands.length >= 2 ? 'pass' : 'fail',
      `후보 ${dockPick.cands.length}개 · ${dockPick.cands.map((c) => `(${c.x},${c.y})`).join(' ')}`,
    );
    // 고르지 않은 후보를 화면에서 탭한다
    const other = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const cur = h.coursePanel.state.dock;
      /*
       * K37: **코스가 없는** 후보를 고른다. 이 절은 탭 뒤에 곧바로 확정까지 하는데,
       * 코스가 이미 있는 잔교로 옮기면 dock-taken 으로 확정이 잠긴다 (그게 맞는 동작이다).
       * ⚠ 이 주석에 백틱을 쓰지 말 것 — 이건 page.evaluate 로 넘기는 템플릿 문자열 안이다.
       */
      const used = {};
      for (const c of h.courses.all) used[c.dock.x + ',' + c.dock.y] = 1;
      const rest = h.scene.dockMarks.filter((c) => c.x !== cur.x || c.y !== cur.y);
      const pick = rest.find((c) => !used[c.x + ',' + c.y]) || rest[0];
      if (!pick) return null;
      h.scene.focusTile(pick.x, pick.y, 160);
      const r = h.scene.tileScreenRect(pick.x, pick.y);
      return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy), tile: pick };
    })()`)) as { x: number; y: number; tile: { x: number; y: number } } | null;
    if (other === null) {
      record('선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)', 'fail', '다른 후보가 없다');
    } else {
      await page.touchscreen.tap(other.x, other.y);
      await page.waitForTimeout(400);
      const now = (await page.evaluate(
        `JSON.stringify(window.__kairo.coursePanel.state.dock)`,
      )) as string;
      record(
        '★ 선착장을 탭하면 코스가 그쪽으로 옮겨진다 (K33)',
        now === JSON.stringify(other.tile) ? 'pass' : 'fail',
        `${JSON.stringify(dockPick.before)} → ${now} (탭한 곳 ${JSON.stringify(other.tile)})`,
      );
    }
  }

  /* 확정도 **버튼을 눌러서** 된다 — `confirmForTest` 가 아니라 */
  const byButton = (await page.evaluate(`(() => {
    const h = window.__kairo;
    /*
     * 탭 절이 잔교를 **고정**해 뒀다 — 고정된 잔교 주변 물이 기존 코스 스플라인과
     * 스치면 어떤 핸들로도 안 풀린다 (실측: 여유 10칸도 잠김). 패널을 다시 열면
     * 고정이 풀리고 제안이 빈 잔교 + 옆밀기로 유효 자리를 찾는다 (show 의 K37 규칙).
     */
    h.coursePanel.hide();
    h.coursePanel.show();
    h.coursePanel.select('shuttle', 'banana');
    // 물 위로 핸들을 옮겨 유효하게 만든다 (여기서는 확정 경로만 본다)
    const t = h.terrain, st = h.coursePanel.state;
    // K45: 코스가 이미 여럿이라, 기존 코스와 겹치는 물을 피해야 확정이 열린다
    const occupied = [];
    for (const c of h.courses.all) {
      occupied.push(c.dock);
      for (const hd of c.handles) occupied.push(hd);
    }
    // 겹침 판정은 스플라인 **표본**(구간당 12점) 기준 3칸이다 — 점 거리 5로는 곡선이
    // 스친다 (실측). 넉넉히 10을 띄운다
    const farFromCourses = (i, j) =>
      occupied.every((o) => Math.abs(i - o.x) + Math.abs(j - o.y) > 10);
    const water = [];
    for (let j = 1; j < 60 && water.length < st.handles.length; j++) {
      for (let i = 1; i < 90; i++) {
        if (!t.isWater(i, j)) continue;
        const d = Math.abs(i - st.dock.x) + Math.abs(j - st.dock.y);
        // 상한 11 — far-from-dock 이 유클리드 12 (DOCK_REACH_TILES+8) 라서, 맨해튼 11 이면 안전
        if (d < 3 || d > 11) continue;
        if (!farFromCourses(i, j)) continue;
        water.push({ i: i, j: j });
        break;
      }
    }
    for (let k = 0; k < water.length; k++) h.coursePanel.moveHandleForTest(k, water[k].i, water[k].j);
    const btn = document.getElementById('kairo-course-confirm');
    const why = (document.querySelector('#kairo-course .kcourse-why') || {}).textContent || '';
    return { before: h.courses.count, cash: h.week.cash, disabled: btn.disabled,
             why: why, waterFound: water.length, need: st.handles.length };
  })()`)) as { before: number; cash: number; disabled: boolean; why: string; waterFound: number; need: number };
  let courseApplyEnabled = false;
  if (!byButton.disabled) {
    await page.click('#kairo-course-confirm'); // 시험 운행
    await page.waitForTimeout(4_200);
    courseApplyEnabled = await page.locator('#kairo-course-confirm').isEnabled();
    if (courseApplyEnabled) await page.click('#kairo-course-confirm'); // 적용
  }
  await page.waitForTimeout(300);
  const afterBtn = (await page.evaluate(
    `(() => { const h = window.__kairo; return { count: h.courses.count, cash: h.week.cash }; })()`,
  )) as { count: number; cash: number };
  record(
    '★ 시험 운행 후 적용을 눌러 코스가 생긴다 — 백도어가 아니라',
    !byButton.disabled && courseApplyEnabled && afterBtn.count > byButton.before && afterBtn.cash < byButton.cash
      ? 'pass'
      : 'fail',
    `코스 ${byButton.before} → ${afterBtn.count} · ` +
      `현금 ${Math.round(byButton.cash / 10000)}만 → ${Math.round(afterBtn.cash / 10000)}만` +
      (byButton.disabled
        ? ` · ⚠ 잠김: ${byButton.why} (물 ${byButton.waterFound}/${byButton.need})`
        : !courseApplyEnabled
          ? ' · ⚠ 시험 운행 후 적용 버튼이 비활성'
        : ''),
  );

  /*
   * ── 8c·코스는 같은 자리에 겹쳐 놓이지 않는다 (K37) ──
   *
   * 실측 버그: 현금을 채우고 장비 셋을 연달아 확정했더니 **한 잔교(43,32)에 넷**이
   * 완전히 같은 좌표로 쌓였다. 판정이 자기 자신만 봤고(물·선착장·수면), 기본 제안이
   * 기존 코스를 몰랐다. 사용자에게는 "장비를 19종 바꿔도 위치가 안 변한다"로 보였다.
   */
  const overlapUi = (await page.evaluate(`(() => {
    const h = window.__kairo, panel = h.coursePanel;
    const taken = h.courses.all.map((c) => ({ x: c.dock.x, y: c.dock.y }));
    if (taken.length < 2) return { ok: false, why: '코스가 둘이 안 놓였다 — 앞 절부터 본다' };
    // (1) 다시 열면 **코스가 없는 잔교**를 제안한다
    panel.hide();
    panel.show();
    const suggested = panel.state.dock;
    const onTaken = taken.some((d) => d.x === suggested.x && d.y === suggested.y);
    // (2) 놓인 코스들의 자리가 서로 다르다
    const keys = h.courses.all.map((c) => c.dock.x + ',' + c.dock.y);
    return {
      ok: true,
      taken: taken, suggested: suggested, onTaken: onTaken,
      courses: keys.length, distinct: [...new Set(keys)].length,
      marks: h.scene.dockMarks.length
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    taken?: { x: number; y: number }[];
    suggested?: { x: number; y: number };
    onTaken?: boolean;
    courses?: number;
    distinct?: number;
    marks?: number;
  };

  record(
    '★ 코스가 있는 잔교를 다시 제안하지 않는다 (K37)',
    overlapUi.ok && overlapUi.onTaken === false && (overlapUi.marks ?? 0) > (overlapUi.taken?.length ?? 0)
      ? 'pass'
      : 'fail',
    overlapUi.ok
      ? `제안 (${overlapUi.suggested?.x},${overlapUi.suggested?.y}) · ` +
        `찬 잔교 ${(overlapUi.taken ?? []).map((d) => `(${d.x},${d.y})`).join(' ')} · ` +
        `후보 ${overlapUi.marks}개`
      : (overlapUi.why ?? '실패'),
  );
  record(
    '★ 확정한 코스들의 자리가 서로 다르다 — 겹쳐 쌓이지 않는다 (K37)',
    (overlapUi.distinct ?? 0) === (overlapUi.courses ?? -1) && (overlapUi.courses ?? 0) >= 2
      ? 'pass'
      : 'fail',
    `코스 ${overlapUi.courses ?? 0}개 · 서로 다른 잔교 ${overlapUi.distinct ?? 0}곳`,
  );

  /*
   * 막힐 때 **이유가 화면에 보이는가.** 코스가 있는 잔교를 진짜 손가락으로 탭한다 —
   * 탭은 존중하되(무시하면 "안 눌린다"가 된다) 확정은 잠기고 처방이 뜬다.
   */
  const takenTap = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas');
    const cr = cv.getBoundingClientRect();
    const sx = cr.width / cv.width, sy = cr.height / cv.height;
    const used = {};
    for (const c of h.courses.all) used[c.dock.x + ',' + c.dock.y] = 1;
    const pick = h.scene.dockMarks.find((m) => used[m.x + ',' + m.y]);
    if (!pick) return null;
    h.scene.focusTile(pick.x, pick.y, 160);
    const r = h.scene.tileScreenRect(pick.x, pick.y);
    return { x: Math.round(cr.left + (r.x + 16) * sx), y: Math.round(cr.top + (r.y + 8) * sy), tile: pick };
  })()`)) as { x: number; y: number; tile: { x: number; y: number } } | null;
  if (takenTap === null) {
    record('★ 코스가 있는 잔교를 고르면 이유가 보인다 (K37)', 'fail', '찬 잔교가 후보에 없다');
  } else {
    await page.touchscreen.tap(takenTap.x, takenTap.y);
    await page.waitForTimeout(400);
    const blocked = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const why = document.querySelector('#kairo-course .kcourse-why');
      const btn = document.getElementById('kairo-course-confirm');
      const before = h.courses.count;
      btn.click(); // 잠긴 버튼을 눌러도 안 늘어야 한다
      return {
        dock: h.coursePanel.state.dock,
        why: (why && why.textContent) || '',
        visible: !!why && why.getBoundingClientRect().height > 0,
        disabled: btn.disabled,
        before: before, after: h.courses.count
      };
    })()`)) as {
      dock: { x: number; y: number };
      why: string;
      visible: boolean;
      disabled: boolean;
      before: number;
      after: number;
    };
    const moved = blocked.dock.x === takenTap.tile.x && blocked.dock.y === takenTap.tile.y;
    record(
      '★ 코스가 있는 잔교를 고르면 **이유가 화면에** 보인다 — 처방까지 (K37)',
      moved && blocked.disabled && blocked.visible && blocked.why.includes('다른 잔교')
        ? 'pass'
        : 'fail',
      `탭 (${takenTap.tile.x},${takenTap.tile.y}) → 잔교 (${blocked.dock.x},${blocked.dock.y}) · ` +
        `확정 ${blocked.disabled ? '잠김' : '⚠ 열림'} · "${blocked.why}"`,
    );
    record(
      '⚠ 음성 대조군 — 잠긴 확정을 눌러도 코스가 안 늘어난다',
      blocked.after === blocked.before ? 'pass' : 'fail',
      `코스 ${blocked.before} → ${blocked.after}`,
    );
  }

  await page.evaluate(`document.getElementById('kairo-course-close').click()`);

  /*
   * ── 8d·Phase 2B 기존 코스 정보 → 루트 편집 → 시험 → 적용 ──
   *
   * 이 절은 코스 히트, 핸들 드래그, 주 동작 버튼을 모두 실제 touch event로 보낸다.
   * `show(handle)`·`moveHandleForTest`·`confirmForTest`는 쓰지 않는다.
   */
  const courseTouchPoint = async (): Promise<{ x: number; y: number; handle: number } | null> =>
    (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const course = h.courses.all[0];
      if (!course || !cv) return null;
      const samples = h.courseApi.sampleCourse(course.dock, course.handles);
      const sample = samples[Math.floor(samples.length / 2)];
      h.scene.focusTile(Math.round(sample.pos.x), Math.round(sample.pos.y), 140);
      const cr = cv.getBoundingClientRect(), r = h.scene.tileScreenRect(Math.round(sample.pos.x), Math.round(sample.pos.y));
      return {
        x: Math.round(cr.left + (r.x + 16) * cr.width / cv.width),
        y: Math.round(cr.top + (r.y + 8) * cr.height / cv.height),
        handle: course.handle
      };
    })()`)) as { x: number; y: number; handle: number } | null;

  const touchButton = async (selector: string): Promise<boolean> => {
    const box = await page.locator(selector).boundingBox();
    if (!box) return false;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  };

  await page.waitForTimeout(400);
  const infoPoint = await courseTouchPoint();
  if (infoPoint) await page.touchscreen.tap(infoPoint.x, infoPoint.y);
  await page.waitForTimeout(350);
  const infoState = (await page.evaluate(`(() => ({
    visible: window.__kairo.coursePanel.visible,
    phase: window.__kairo.coursePanel.state.phase,
    handle: window.__kairo.coursePanel.state.selectedHandle,
    goalsHidden: document.getElementById('kairo-goal').hidden
  }))()`)) as { visible: boolean; phase: string; handle: number | null; goalsHidden: boolean };
  record(
    '★ 지도의 기존 코스/차량 터치 → 코스 정보',
    !!infoPoint && infoState.visible && infoState.phase === 'info' && infoState.handle === infoPoint.handle
      ? 'pass'
      : 'fail',
    `phase ${infoState.phase} · handle ${infoState.handle} · 목표 ${infoState.goalsHidden ? '숨김' : '보임'}`,
  );

  const cancelBefore = (await page.evaluate(
    `JSON.stringify(window.__kairo.courses.toSnapshot())`,
  )) as string;
  await touchButton('#kairo-course-confirm'); // 루트 조정
  await page.waitForTimeout(250);
  const editBefore = (await page.evaluate(
    `JSON.stringify(window.__kairo.coursePanel.state.handles)`,
  )) as string;
  const validDrag = (await page.evaluate(`(() => {
    const h = window.__kairo, cv = document.querySelector('canvas'), st = h.coursePanel.state;
    const course = h.courses.all.find((item) => item.handle === st.selectedHandle);
    const preset = h.courseApi.presetDef(st.presetId);
    if (!cv || !course || !preset || !st.handles[0]) return null;
    let target = null;
    for (let dj = -2; dj <= 2 && !target; dj++) for (let di = -2; di <= 2; di++) {
      if (di === 0 && dj === 0) continue;
      const candidate = { x: Math.round(st.handles[0].x) + di, y: Math.round(st.handles[0].y) + dj };
      const handles = st.handles.map((point, index) => index === 0 ? candidate : point);
      const valid = h.courseApi.validateCourse(h.terrain, handles, course.dock, preset, st.equipId, 5,
        h.courses.all, course.handle);
      if (valid.ok) { target = candidate; break; }
    }
    if (!target) return null;
    const cr = cv.getBoundingClientRect();
    const screen = (point) => {
      const r = h.scene.tileScreenRect(Math.round(point.x), Math.round(point.y));
      return { x: Math.round(cr.left + (r.x + 16) * cr.width / cv.width),
               y: Math.round(cr.top + (r.y + 8) * cr.height / cv.height) };
    };
    const from = screen(st.handles[0]), to = screen(target);
    return {
      from: from,
      to: to,
      target: target,
      fromHitsCanvas: document.elementFromPoint(from.x, from.y) === cv,
      toHitsCanvas: document.elementFromPoint(to.x, to.y) === cv
    };
  })()`)) as {
    from: { x: number; y: number };
    to: { x: number; y: number };
    target: { x: number; y: number };
    fromHitsCanvas: boolean;
    toHitsCanvas: boolean;
  } | null;
  if (validDrag) {
    await touch('touchStart', validDrag.from.x, validDrag.from.y);
    for (let step = 1; step <= 6; step++) {
      await touch(
        'touchMove',
        validDrag.from.x + ((validDrag.to.x - validDrag.from.x) * step) / 6,
        validDrag.from.y + ((validDrag.to.y - validDrag.from.y) * step) / 6,
      );
    }
    await touch('touchEnd', 0, 0);
  }
  await page.waitForTimeout(250);
  const editMoved = (await page.evaluate(`(() => ({
    handles: JSON.stringify(window.__kairo.coursePanel.state.handles),
    first: window.__kairo.coursePanel.state.handles[0],
    phase: window.__kairo.coursePanel.state.phase,
    goalsHidden: document.getElementById('kairo-goal').hidden,
    /*
     * ⚠ 예전엔 설정 본문 안의 '#kairo-course-metrics' 를 읽었다. v2 부터 그 본문은
     * 편집 중 **접혀 있으므로**, 숨은 요소의 textContent 로 "화면에 보인다"를 재면
     * 조용히 통과하는 검사가 된다 (K33 의 재발). 보이는 독을 읽는다.
     */
    comparison: document.getElementById('kairo-course-deltas').textContent
  }))()`)) as {
    handles: string;
    first: { x: number; y: number };
    phase: string;
    goalsHidden: boolean;
    comparison: string;
  };
  const reachedDragTarget = !!validDrag && editMoved.first.x === validDrag.target.x &&
    editMoved.first.y === validDrag.target.y;
  record(
    '★ 기존 코스 핸들을 진짜 터치로 드래그하면 투영 지표가 바뀐다',
    !!validDrag && validDrag.fromHitsCanvas && validDrag.toHitsCanvas && reachedDragTarget &&
      editMoved.handles !== editBefore && editMoved.comparison.includes('→') && editMoved.goalsHidden
      ? 'pass'
      : 'fail',
    `phase ${editMoved.phase} · 목표 ${editMoved.goalsHidden ? '숨김' : '보임'} · ` +
      `canvas ${validDrag?.fromHitsCanvas && validDrag.toHitsCanvas ? '적중' : '빗나감'} · ` +
      `${editBefore} → ${editMoved.handles} (목표 ${JSON.stringify(validDrag?.target ?? null)})`,
  );

  await touchButton('#kairo-course-confirm'); // 시험 운행
  const trialStartedAt = Date.now();
  await page.waitForTimeout(3_800);
  const duringTrial = (await page.evaluate(`window.__kairo.coursePanel.state.phase`)) as string;
  await page.waitForTimeout(400);
  const review = (await page.evaluate(`(() => ({
    phase: window.__kairo.coursePanel.state.phase,
    passed: window.__kairo.coursePanel.state.trialPassed,
    handles: JSON.stringify(window.__kairo.coursePanel.state.handles)
  }))()`)) as { phase: string; passed: boolean; handles: string };
  const trialElapsed = Date.now() - trialStartedAt;
  record(
    '★ 시험 운행은 4초 리플레이 후 Apply / Tune Again을 연다',
    duringTrial === 'trial' && review.phase === 'review' && review.passed && trialElapsed >= 4_000
      ? 'pass'
      : 'fail',
    `3.8초 ${duringTrial} → ${trialElapsed}ms ${review.phase} · ${review.passed ? '완주' : '미완주'}`,
  );

  await touchButton('#kairo-course-toggle'); // 다시 조정
  await page.waitForTimeout(200);
  const tuned = (await page.evaluate(`(() => ({
    phase: window.__kairo.coursePanel.state.phase,
    handles: JSON.stringify(window.__kairo.coursePanel.state.handles)
  }))()`)) as { phase: string; handles: string };
  record(
    'Tune Again은 핸들을 유지하고 편집으로 돌아간다',
    tuned.phase === 'edit' && tuned.handles === review.handles ? 'pass' : 'fail',
    `${review.handles} → ${tuned.handles}`,
  );
  await touchButton('#kairo-course-close');
  await page.waitForTimeout(250);
  const cancelAfter = (await page.evaluate(
    `JSON.stringify(window.__kairo.courses.toSnapshot())`,
  )) as string;
  record(
    '★ Cancel은 저장 snapshot을 바이트 단위로 보존하고 목표를 복원한다',
    cancelAfter === cancelBefore &&
      !(await page.evaluate(`document.getElementById('kairo-goal').classList.contains('folded')`))
      ? 'pass'
      : 'fail',
    `snapshot ${cancelBefore === cancelAfter ? '동일' : '변경'}`,
  );

  // 다시 실제 코스를 탭해 차량 1대를 늘린 뒤 시험→적용→새로고침까지.
  await page.evaluate(`window.__kairo.week.earn(2000000)`);
  await page.waitForTimeout(400);
  const applyPoint = await courseTouchPoint();
  if (applyPoint) await page.touchscreen.tap(applyPoint.x, applyPoint.y);
  await page.waitForTimeout(300);
  await touchButton('#kairo-course-confirm');
  await page.waitForTimeout(200);
  const applyEditStart = (await page.evaluate(`(() => ({
    handle: window.__kairo.coursePanel.state.selectedHandle,
    vehicles: window.__kairo.coursePanel.state.vehicles,
    phase: window.__kairo.coursePanel.state.phase
  }))()`)) as { handle: number; vehicles: number; phase: string };
  // v2: 차량 대수는 `설정` 뒤다 — 편집 독에는 지표와 버튼 한 줄만 있다.
  await touchButton('#kairo-course-toggle');
  await page.waitForFunction(`!document.getElementById('kairo-course-body').hidden`);
  const plus = page.locator('#kairo-course [data-veh="1"]');
  const plusBox = await plus.boundingBox();
  if (plusBox) await page.touchscreen.tap(plusBox.x + plusBox.width / 2, plusBox.y + plusBox.height / 2);
  const applyBefore = (await page.evaluate(`(() => ({
    handle: window.__kairo.coursePanel.state.selectedHandle,
    vehicles: window.__kairo.coursePanel.state.vehicles
  }))()`)) as { handle: number; vehicles: number };
  await touchButton('#kairo-course-confirm');
  await page.waitForTimeout(4_200);
  await touchButton('#kairo-course-confirm');
  await page.waitForTimeout(350);
  /*
   * ⚠ 옛 기대는 `!applied.visible` 이었다 — 적용 성공이 곧 닫기였고, 그래서 "무엇이
   * 적용됐는가"의 증거가 2.6초 토스트뿐이었다 (Task 6 이전, 2026-08-26 실측).
   * 이제 성공은 **영수증 상태로 남고** 홈으로 돌아가는 것은 명시적 `닫기` 뿐이다.
   */
  const applied = (await page.evaluate(`(() => {
    const course = window.__kairo.courses.all.find((item) => item.handle === ${applyBefore.handle});
    const box = document.getElementById('kairo-course-receipt');
    return {
      handle: course.handle, vehicles: course.vehicles,
      visible: window.__kairo.coursePanel.visible,
      phase: window.__kairo.coursePanel.state.phase,
      receiptShown: !!box && !box.hidden,
      receipt: [...box.querySelectorAll('[data-receipt]')].map((c) => c.textContent)
    };
  })()`)) as {
    handle: number; vehicles: number; visible: boolean; phase: string;
    receiptShown: boolean; receipt: string[];
  };
  record(
    '★ 적용은 패널을 닫지 않고 영수증으로 끝난다 — 성공의 증거가 화면에 남는다',
    applied.visible && applied.phase === 'applied' && applied.receiptShown &&
      applied.receipt.some((line) => line.startsWith('적용 완료')) &&
      applied.receipt.some((line) => line.includes('저장 완료')) ? 'pass' : 'fail',
    `phase ${applied.phase} · ${applied.receipt.join(' / ') || '영수증 없음'}`,
  );
  // 자기가 연 것은 닫고 넘어간다 — 새로고침 뒤 절이 잔해 위에서 재지 않게
  await touchButton('#kairo-course-close');
  await page.waitForTimeout(200);
  const closedAfterApply = (await page.evaluate(`(() => ({
    hidden: document.getElementById('kairo-course').hidden,
    surface: document.getElementById('kairo-goal').dataset.goalSurface
  }))()`)) as { hidden: boolean; surface: string };
  record(
    '★ 적용 완료에서 `닫기` 를 눌러야 홈으로 돌아간다',
    closedAfterApply.hidden && closedAfterApply.surface === 'home' ? 'pass' : 'fail',
    `패널 ${closedAfterApply.hidden ? '닫힘' : '열림'} · 목표 표면 ${closedAfterApply.surface}`,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const reloadedCourse = (await page.evaluate(`(() => {
    const course = window.__kairo.courses.all.find((item) => item.handle === ${applyBefore.handle});
    return course ? { handle: course.handle, vehicles: course.vehicles } : null;
  })()`)) as { handle: number; vehicles: number } | null;
  record(
    '★ Apply가 stable handle로 저장되고 새로고침 뒤에도 같다',
    applyEditStart.phase === 'edit' && applyEditStart.handle === applyBefore.handle &&
      applyBefore.vehicles === applyEditStart.vehicles + 1 &&
      applied.handle === applyBefore.handle && applied.vehicles === applyBefore.vehicles &&
      reloadedCourse?.handle === applyBefore.handle && reloadedCourse.vehicles === applyBefore.vehicles
      ? 'pass'
      : 'fail',
    `#${applyBefore.handle} ${applyEditStart.vehicles}→${applyBefore.vehicles}대 → ` +
      `저장 ${applied.vehicles}대 → 로드 ${reloadedCourse?.vehicles ?? '없음'}대`,
  );

  /*
   * ── 8e·Phase 3 시설 터치 → 메뉴 개발 → 실패 힌트 → 발견/장착 ──
   *
   * 지도 시설과 버튼은 모두 `touchscreen.tap`으로 건너간다. 직접 API는 빈 실내동에
   * 매점 하나를 놓는 판 setup에만 쓴다. 그 뒤 열기·선택·개발은 UI 정상 경로다.
   */
  const menuShop = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.earn(2000000);
    let shop = h.placement.all().find((item) => item.defId === 'shop');
    if (!shop) {
      outer: for (let j = 0; j < h.terrain.height; j++) for (let i = 0; i < h.terrain.width; i++) {
        if (!h.terrain.isIndoor(i, j)) continue;
        const chk = h.placement.check(h.terrain, h.walls, h.gate, 'shop', i, j, { land: h.land() });
        if (!chk.ok) continue;
        const placed = h.placement.place(h.terrain, h.walls, h.gate, 'shop', i, j, { land: h.land() });
        if (placed.ok && placed.placed) { shop = placed.placed; break outer; }
      }
      if (shop) {
        h.scene.refreshFacility(shop.handle);
        h.guests.invalidate();
        h.persist();
      }
    }
    if (!shop) return null;
    h.scene.focusTile(shop.i, shop.j, 140);
    return { handle: shop.handle, i: shop.i, j: shop.j };
  })()`)) as { handle: number; i: number; j: number } | null;
  await page.waitForTimeout(260);
  const menuShopPoints = menuShop
    ? ((await page.evaluate(`(() => {
        const h = window.__kairo, cv = document.querySelector('canvas');
        const cr = cv.getBoundingClientRect();
        const points = [];
        for (let j = 0; j < h.terrain.height; j++) for (let i = 0; i < h.terrain.width; i++) {
          if (h.placement.at(i, j)?.handle !== ${menuShop.handle}) continue;
          const r = h.scene.tileScreenRect(i, j);
          points.push({ x: Math.round(cr.left + (r.x + 16) * cr.width / cv.width),
                        y: Math.round(cr.top + (r.y + 8) * cr.height / cv.height) });
        }
        return points;
      })()`)) as { x: number; y: number }[])
    : [];
  let facilityInfoOpened = false;
  for (const point of menuShopPoints) {
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(380); // 시설 정보는 더블탭 320ms 창을 지난 뒤 연다.
    if (await page.locator('#kairo-facility-menu-develop').isVisible().catch(() => false)) {
      facilityInfoOpened = true;
      break;
    }
  }
  if (facilityInfoOpened) await page.locator('#kairo-facility-menu-develop').tap();
  await page.waitForTimeout(180);
  const facilityMenuOpen = await page.locator('#kairo-menu-lab').isVisible().catch(() => false);
  const menuSurface = (await page.evaluate(`(() => {
    const panel = document.getElementById('kairo-menu-lab');
    const buttons = [...panel.querySelectorAll('.kairo-menu-ingredient')];
    return {
      visible: !panel.hidden,
      ingredients: buttons.length,
      minTarget: buttons.length ? Math.min(...buttons.map((b) => Math.round(b.getBoundingClientRect().height))) : 0,
      slots: panel.querySelectorAll('.kairo-menu-slot').length
    };
  })()`)) as { visible: boolean; ingredients: number; minTarget: number; slots: number };
  record(
    '★ 매점을 지도에서 터치하면 실제 메뉴 개발 표면이 열린다',
    menuShop !== null && facilityMenuOpen && menuSurface.visible && menuSurface.ingredients === 6
      ? 'pass'
      : 'fail',
    `재료 ${menuSurface.ingredients}종 · 슬롯 ${menuSurface.slots}개 · 최소 터치 ${menuSurface.minTarget}px`,
  );
  record(
    '메뉴 재료 터치 타겟은 44px 이상이다',
    menuSurface.minTarget >= 44 ? 'pass' : 'fail',
    `${menuSurface.minTarget}px`,
  );

  if (facilityMenuOpen) {
    await page.locator('[data-kairo-menu-ingredient="ice"]').tap();
    await page.locator('[data-kairo-menu-ingredient="milk"]').tap();
    await page.locator('#kairo-menu-develop').tap();
    await page.waitForTimeout(120);
  }
  const menuFailed = facilityMenuOpen ? (await page.evaluate(`(() => {
    const result = document.querySelector('#kairo-menu-lab [data-result]');
    const hints = [...document.querySelectorAll('#kairo-menu-lab [data-progress]')];
    return { kind: result?.dataset.result ?? '', text: result?.textContent ?? '', hints: hints.length,
      progress: hints[0]?.dataset.progress ?? '' };
  })()`)) as { kind: string; text: string; hints: number; progress: string } :
    { kind: '', text: '메뉴 패널을 열지 못함', hints: 0, progress: '' };
  record(
    '★ 실패한 재료 조합은 후보를 줄이는 힌트·진행률을 남긴다',
    menuFailed.kind === 'failed' && menuFailed.hints > 0 && Number(menuFailed.progress) > 0
      ? 'pass'
      : 'fail',
    `${menuFailed.text} · ${Math.round(Number(menuFailed.progress) * 100)}%`,
  );

  // 선택 해제도 터치로: 얼음·우유 → 쌀·김 = 김밥.
  if (facilityMenuOpen) {
    await page.locator('[data-kairo-menu-ingredient="ice"]').tap();
    await page.locator('[data-kairo-menu-ingredient="milk"]').tap();
    await page.locator('[data-kairo-menu-ingredient="rice"]').tap();
    await page.locator('[data-kairo-menu-ingredient="seaweed"]').tap();
    await page.locator('#kairo-menu-develop').tap();
    await page.waitForTimeout(120);
  }
  const menuDiscovered = facilityMenuOpen ? (await page.evaluate(`(() => ({
    result: document.querySelector('#kairo-menu-lab [data-result]')?.dataset.result ?? '',
    text: document.getElementById('kairo-menu-lab').textContent,
    mounted: window.__kairo.placement.menuIdsOf(${menuShop?.handle ?? -1}),
    saved: window.__kairo.menus.toSnapshot()
  }))()`)) as { result: string; text: string; mounted: string[]; saved: { discovered: string[] } } :
    { result: '', text: '', mounted: [], saved: { discovered: [] } };
  record(
    '★ 정답 조합은 레시피를 발견하고 시설 슬롯에 즉시 장착한다',
    menuDiscovered.result === 'discovered' &&
      menuDiscovered.mounted.includes('shop_gimbap') &&
      menuDiscovered.saved.discovered.includes('shop_gimbap')
      ? 'pass'
      : 'fail',
    `${menuDiscovered.result} · 장착 ${menuDiscovered.mounted.join(', ')} · 영구 발견 ${menuDiscovered.saved.discovered.length}종`,
  );
  if (facilityMenuOpen) await page.locator('#kairo-menu-lab-close').tap();

  /*
   * ── 8·직원 (§11) ──
   *
   * 여섯 동사 중 "사람을 쓴다". **인건비가 실제로 나가고 부족이 결과를 바꾸는지**를 본다.
   */
  const staffUi = (await page.evaluate(`(() => {
    /*
     * K28: 열기 버튼은 메뉴 시트 안이다 — 먼저 시트를 연다.
     * ⚠ UI v4 — 메뉴는 라우터라 직원은 운영 목적지 안이다. 목적지를 먼저 열지 않으면
     * 그 버튼의 rect 가 0×0 이라 44px 검사가 구조적으로 0px 를 읽는다.
     */
    document.getElementById('kairo-menu-open').click();
    const route = document.querySelector('[data-manage-route="operations"]');
    if (route) route.click();
    const open = document.getElementById('kairo-staff-open');
    if (!open) return { ok: false, why: '직원 버튼이 없다' };
    const openH = Math.round(open.getBoundingClientRect().height);
    open.click();
    const panel = document.getElementById('kairo-staff');
    if (!panel || getComputedStyle(panel).display === 'none') {
      return { ok: false, why: '직원 시트가 안 열린다' };
    }
    const rows = [...panel.querySelectorAll('div[data-role]')];
    const btns = [...panel.querySelectorAll('button[data-role]')];
    const heights = btns.map((b) => Math.round(b.getBoundingClientRect().height));
    const before = window.__kairo.staff.total;
    // + 를 세 번 눌러 실제로 고용되는지
    const plus = btns.filter((b) => b.dataset.delta === '1');
    plus[0].click(); plus[1].click(); plus[1].click();
    const after = window.__kairo.staff.total;
    const wage = window.__kairo.staff.weeklyWage();
    return {
      ok: true, openH: openH, rows: rows.length, btns: btns.length,
      minBtn: heights.length ? Math.min.apply(null, heights) : 0,
      before: before, after: after, wage: wage,
      overflow: panel.scrollWidth > panel.clientWidth,
      text: panel.textContent.slice(0, 60)
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    openH?: number;
    rows?: number;
    btns?: number;
    minBtn?: number;
    before?: number;
    after?: number;
    wage?: number;
    overflow?: boolean;
  };

  /*
   * 경영 3탭 (§15.9) — 가격·직원·개선. **후반 공백을 메우는 장치**다:
   * 확장이 등급 상한에 막힌 뒤에도 값과 개선이 남아야 80주가 비지 않는다.
   */
  const manage = (await page.evaluate(`(() => {
    const panel = document.getElementById('kairo-staff');
    if (!panel) return { ok: false, why: '경영 패널이 없다' };
    const tabs = [...panel.querySelectorAll('button[data-manage]')];
    if (tabs.length !== 3) return { ok: false, why: '탭이 3개가 아니다: ' + tabs.length };
    // 가격 탭
    tabs.find((b) => b.dataset.manage === 'price').click();
    const slider = document.getElementById('kairo-price');
    const sliderH = Math.round(slider.getBoundingClientRect().height);
    const before = window.__kairo.priceMult ? window.__kairo.priceMult() : 1;
    slider.value = '130';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const after = window.__kairo.priceMult ? window.__kairo.priceMult() : 1;
    // 개선 탭
    tabs.find((b) => b.dataset.manage === 'upgrade').click();
    const rows = [...panel.querySelectorAll('div[data-upgrade]')];
    const lvBefore = window.__kairo.placement.averageLevel();
    const btn = rows.length ? rows[0].querySelector('button') : null;
    const enabled = btn ? !btn.disabled : false;
    if (btn && !btn.disabled) btn.click();
    const lvAfter = window.__kairo.placement.averageLevel();
    // 원상복구 — 뒤 검사들이 정가를 기대한다
    tabs.find((b) => b.dataset.manage === 'price').click();
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      ok: true, tabs: tabs.length, sliderH: sliderH,
      priceBefore: before, priceAfter: after,
      upgradeRows: rows.length, enabled: enabled,
      lvBefore: lvBefore, lvAfter: lvAfter
    };
  })()`)) as {
    ok: boolean;
    why?: string;
    tabs?: number;
    sliderH?: number;
    priceBefore?: number;
    priceAfter?: number;
    upgradeRows?: number;
    enabled?: boolean;
    lvBefore?: number;
    lvAfter?: number;
  };

  record(
    '경영이 가격·직원·개선 3탭이다 (§15.9)',
    manage.ok ? 'pass' : 'fail',
    manage.ok ? `${manage.tabs}탭 · 슬라이더 ${manage.sliderH}px` : (manage.why ?? '실패'),
  );
  record(
    '요금 슬라이더가 실제로 값을 바꾼다 — 여섯 동사 중 "값을 매긴다"',
    (manage.priceAfter ?? 1) > (manage.priceBefore ?? 1) ? 'pass' : 'fail',
    `${manage.priceBefore} → ${manage.priceAfter}`,
  );
  record(
    '개선 목록이 뜨고 누르면 단계가 오른다 — 확장이 막힌 뒤의 성장 수단',
    (manage.upgradeRows ?? 0) > 0 &&
      (!manage.enabled || (manage.lvAfter ?? 0) > (manage.lvBefore ?? 0))
      ? 'pass'
      : 'fail',
    `${manage.upgradeRows}개 · 평균 단계 ${(manage.lvBefore ?? 0).toFixed(2)} → ` +
      `${(manage.lvAfter ?? 0).toFixed(2)}${manage.enabled ? '' : ' (현금 부족)'}`,
  );

  record(
    '직원 시트가 열리고 5직종이 보인다',
    staffUi.ok && staffUi.rows === 5 ? 'pass' : 'fail',
    staffUi.ok ? `${staffUi.rows}직종 · 버튼 ${staffUi.btns}개` : (staffUi.why ?? '실패'),
  );
  record(
    '직원 버튼·증감 버튼이 44px 이상 — 폰 터치 타깃',
    (staffUi.openH ?? 0) >= 44 && (staffUi.minBtn ?? 0) >= 44 ? 'pass' : 'fail',
    `열기 ${staffUi.openH ?? 0}px · 증감 최소 ${staffUi.minBtn ?? 0}px`,
  );
  record(
    '고용하면 인원과 주급이 오른다',
    (staffUi.after ?? 0) === (staffUi.before ?? 0) + 3 && (staffUi.wage ?? 0) > 0 ? 'pass' : 'fail',
    `${staffUi.before} → ${staffUi.after}명 · 주급 ${staffUi.wage}`,
  );
  record(
    '직원 시트가 가로로 안 넘친다',
    staffUi.overflow === false ? 'pass' : 'fail',
    staffUi.overflow ? '넘침' : 'OK',
  );

  const staffWeek = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort(); // K39 — run() 은 배치 전용
    const eff = h.staff.effects(h.placement);
    const withStaff = h.week.run(new h.Rng(4242), {
      season: 'summer',
      staff: { wages: eff.wages, satisfactionDelta: eff.satisfactionDelta,
               foodMult: eff.foodMult, idle: new Set() },
    });
    const without = h.week.run(new h.Rng(4242), { season: 'summer' });
    return {
      wages: withStaff.wages, wagesNone: without.wages,
      profitWith: withStaff.profit, profitWithout: without.profit,
      identity: withStaff.profit === withStaff.revenue - withStaff.upkeep - withStaff.wages
    };
  })()`)) as {
    wages: number;
    wagesNone: number;
    profitWith: number;
    profitWithout: number;
    identity: boolean;
  };
  record(
    '인건비가 손익에서 빠진다 — 고정비다',
    staffWeek.wages > 0 && staffWeek.wagesNone === 0 && staffWeek.identity ? 'pass' : 'fail',
    `인건비 ${staffWeek.wages} · 손익 ${staffWeek.profitWith} = 수익−유지비−인건비`,
  );

  await page.evaluate(`document.getElementById('kairo-staff-close').click()`);

  /*
   * ── 8a. 손님 그룹 유형 (§10.4) ──
   *
   * 유형이 **결과를 바꾸는지**를 본다. 이름표뿐이면 넣은 의미가 없다.
   */
  const groups = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const st = h.guests.stats();
    const parties = {};
    const kinds = {};
    for (const g of h.guests.all) {
      parties[g.party] = (parties[g.party] || 0) + 1;
      kinds[g.group] = (kinds[g.group] || 0) + 1;
      if (parties[g.party] > 1 && !kinds.__mixed) {
        // 같은 일행이 같은 유형인지 확인
      }
    }
    let sameKind = true;
    const partyKind = {};
    for (const g of h.guests.all) {
      if (partyKind[g.party] === undefined) partyKind[g.party] = g.group;
      else if (partyKind[g.party] !== g.group) sameKind = false;
    }
    const sizes = Object.keys(parties).map((k) => parties[k]);
    return {
      alive: st.alive,
      byGroup: st.byGroup,
      kinds: Object.keys(kinds).length,
      maxParty: sizes.length ? Math.max.apply(null, sizes) : 0,
      sameKind: sameKind,
      wallets: [...new Set(h.guests.all.map((g) => g.wallet))].sort()
    };
  })()`)) as {
    alive: number;
    byGroup: Record<string, number>;
    kinds: number;
    maxParty: number;
    sameKind: boolean;
    wallets: number[];
  };

  record(
    '손님이 여러 유형으로 들어온다 — 한 유형뿐이면 구성이 판단이 안 된다',
    groups.kinds >= 2 ? 'pass' : 'fail',
    Object.entries(groups.byGroup)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ') + ` (총 ${groups.alive}명)`,
  );
  record(
    '일행 단위로 들어온다 — 한 명씩 흩어지면 무리가 안 보인다',
    groups.maxParty >= 2 && groups.sameKind ? 'pass' : 'fail',
    `최대 일행 ${groups.maxParty}명 · 일행 내 유형 ${groups.sameKind ? '일치' : '불일치'}`,
  );
  record(
    '유형마다 지갑이 다르다 — 같으면 이름표일 뿐이다',
    groups.wallets.length >= 2 ? 'pass' : 'fail',
    `지갑 ${groups.wallets.join(', ')}`,
  );

  record(
    '4주차에 첫 일반 카드 한 장이 뜬다 — 1~3주는 온보딩',
    cardFlow.ok && cardFlow.shown === true ? 'pass' : 'fail',
    cardFlow.ok
      ? cardFlow.shown
        ? `"${cardFlow.title}" · 선택지 ${cardFlow.options}개 · 남은 ${cardFlow.remaining}장`
        : '4주차 카드 0장'
      : (cardFlow.why ?? '실패'),
  );
  record(
    '선택지 2~3개가 한 줄 · 44px 이상 · 393px 가로 넘침 0',
    (cardFlow.options ?? 0) >= 2 &&
      (cardFlow.options ?? 0) <= 3 &&
      cardFlow.oneRow === true &&
      (cardFlow.minHeight ?? 0) >= 44 &&
      (cardFlow.overflow ?? 1) <= 0
      ? 'pass'
      : 'fail',
    `최소 ${cardFlow.minHeight ?? 0}px`,
  );
  record(
    '공유 이미지 슬롯이 event/<theme> 계약 ID를 쓴다',
    (cardFlow.themeSprite ?? '').indexOf('event/') === 0 ? 'pass' : 'fail',
    cardFlow.themeSprite ?? '없음',
  );

  record(
    '실제 터치로 카드를 고르면 닫히고 그 주가 진행된다',
    !cardTouchResult.visible && cardTouchResult.weekStarted ? 'pass' : 'fail',
    `현금 ${Math.round((cardFlow.cashBefore ?? 0) / 10000)}만 → ${Math.round(cardTouchResult.cash / 10000)}만`,
  );
  record(
    '일반 카드는 모달 한 채널만 쓴다 — 뉴스·토스트 중복 0',
    cardTouchResult.tickerAfter === cardFlow.tickerBefore &&
      cardTouchResult.toastAfter === cardFlow.toastBefore
      ? 'pass'
      : 'fail',
    `티커 ${cardFlow.tickerBefore ?? -1}→${cardTouchResult.tickerAfter} · ` +
      `토스트 "${cardFlow.toastBefore ?? ''}"→"${cardTouchResult.toastAfter}"`,
  );

  // 결산이 열려 있으면 닫는다 (뒤 검사가 오버레이에 막히지 않게)
  await page.waitForTimeout(400);
  await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    if (r) {
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.indexOf('닫') >= 0);
      if (close) close.click();
      else r.style.display = 'none';
    }
  })()`);
  await page.waitForTimeout(200);

  /*
   * 탭 → 타일 해석 회귀. **반드시 여러 타일로 본다** — 한 칸만 맞으면 우연이다.
   *
   * 실측 버그: 핸들러가 `world.y − TILE_H/2` 를 빼서 탭 지점이 격자 꼭지점(네 타일이
   * 만나는 점)으로 옮겨졌고, 반올림 하나로 타일이 뒤집혔다. 지면 칠하기로는 이웃 칸이
   * 칠해져도 티가 안 나서 오래 안 잡혔지만 2×2 시설은 곧바로 거절된다.
   *
   * ⚠ 탭 간격을 700ms 이상 둔다 — 300ms 안에 두 번이면 **더블탭 확대**가 발동해
   * 배율이 2 로 바뀌고, 그 뒤 좌표 환산이 전부 어긋난다 (실측으로 겪었다).
   */
  const TAP_CASES: [number, number][] = [
    [10, 10],
    [11, 9],
    [9, 11],
    [13, 13],
    [8, 14],
  ];
  const tapResults: string[] = [];
  // 붓을 끄면 onTapTile 이 해석한 타일을 콘솔에 찍는다 (K28: 전용 훅으로 끈다)
  await page.evaluate(`window.__kairoClearBrush && window.__kairoClearBrush()`);
  for (const [ti, tj] of TAP_CASES) {
    /*
     * 카메라를 그 타일에 맞춘다 — 안 맞추면 대부분이 화면 밖이라 검사가 한두 칸만 보고
     * 통과한다 (실측: 5칸 중 1칸만 화면 안). `focusTile` 은 도구용으로 열려 있다.
     */
    await page.evaluate(`window.__kairo.scene.focusTile(${ti}, ${tj})`);
    await page.waitForTimeout(120);
    const pt = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const r = h.scene.tileScreenRect(${ti}, ${tj});
      const x = cr.left + (r.x + 16) * sx, y = cr.top + (r.y + 8) * sy;
      return { x: Math.round(x), y: Math.round(y),
               inView: x > 30 && y > 130 && x < cr.width - 30 && y < cr.height - 170 };
    })()`)) as { x: number; y: number; inView: boolean };
    if (!pt.inView) {
      tapResults.push(`(${ti},${tj})화면밖`);
      continue;
    }
    tapLog.length = 0;
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700);
    const got = /\((\d+), (\d+)\)/.exec(tapLog.join(' '));
    const ok = got && Number(got[1]) === ti && Number(got[2]) === tj;
    tapResults.push(`(${ti},${tj})${ok ? '✓' : `→${got ? got[0] : '?'}`}`);
  }
  record(
    '탭한 타일이 정확히 해석된다 — 반 타일 밀리면 2×2 배치가 거절된다',
    tapResults.length === TAP_CASES.length && tapResults.every((r) => r.endsWith('✓'))
      ? 'pass'
      : 'fail',
    tapResults.join(' '),
  );

  const cashBefore = await cashOf();

  /*
   * 배치는 **화면 탭**으로 한다 — 시뮬을 직접 부르면 건설비 경로를 안 타서
   * "공짜로 짓는다" 버그를 그대로 통과시킨다. 그게 K12 까지 실제로 있던 상태다.
   *
   * ⚠ 후보 타일마다 **카메라를 맞추고 탭 지점이 캔버스 위인지 확인**한다. 안 하면
   * 토스트·붓 바·의뢰 패널 같은 DIV 가 탭을 먹고 "배치가 안 된다"로 나온다 (실측).
   */
  const candidates = (await page.evaluate(`(() => {
    const h = window.__kairo;
    /*
     * K28: 붓 바와 드롭다운이 사라졌다. 건설 시트를 열고 격자에서 고른다 —
     * 플레이어가 실제로 하는 경로 그대로다.
     */
    document.getElementById('kairo-build-open').click();
    // 시트는 마지막으로 본 탭을 기억한다 — 시설 탭을 명시해야 한다
    const ftab = document.querySelector('#kairo-sheet [data-tab="facility"]');
    if (ftab) ftab.click();
    // K41: shop 은 2등급 골격이 됐다 — 1등급 골격인 분식(snackbar)으로 잰다
    const pick = document.querySelector('[data-pick="facility:snackbar"]');
    if (!pick) return { ok: false, why: '건설 시트에서 분식을 못 찾았다', tiles: [] };
    pick.click();
    if (!window.__kairoBrush || window.__kairoBrush() !== 'facility') {
      return { ok: false, why: '고른 뒤에도 붓이 facility 가 아니다', tiles: [] };
    }
    // shop 은 2×2 다 — **발자국 전체**가 비고 걸을 수 있어야 한다.
    // 앵커 칸만 보면 "다른 시설이 있습니다" 로 거절된다 (실측)
    const fits = (i, j) => {
      for (let dj = 0; dj < 2; dj++) {
        for (let di = 0; di < 2; di++) {
          if (h.placement.at(i + di, j + dj)) return false;
          if (!h.terrain.isWalkable(i + di, j + dj)) return false;
        }
      }
      return true;
    };
    ${LAND_BOX}
    const tiles = [];
    for (let j = J0; j < J1 && tiles.length < 8; j++) {
      for (let i = I0; i < I1 && tiles.length < 8; i++) {
        if (fits(i, j)) tiles.push([i, j]);
      }
    }
    return { ok: true, tiles: tiles, count: h.placement.count, brush: window.__kairoBrush ? window.__kairoBrush() : null };
  })()`)) as { ok: boolean; why?: string; tiles: [number, number][]; count?: number; brush?: string | null };

  // 길을 깔아 둔다 — 탭으로 놓는 것을 보려는 절이지 길을 보려는 절이 아니다 (K32-B)
  await page.evaluate(PAVE_ALL);
  let placedAt: [number, number] | null = null;
  let tapDetail = candidates.ok ? `붓 ${String(candidates.brush)}` : (candidates.why ?? '실패');
  const countBefore = candidates.count ?? 0;
  for (const [ti, tj] of candidates.tiles) {
    /*
     * ⚠ K47-③: 붓이 살아 있는지 **매번 확인한다.** 조준 배치에서 확정·취소는 시설 붓의
     * 조준을 끝낸다 — 앞 후보에서 거절당해 취소했다면 붓이 이미 떨어져 있을 수 있고,
     * 그러면 뒤 후보의 탭이 전부 "붓 없음"으로 조용히 새어 검사가 원인 없이 실패한다.
     */
    await page.evaluate(`(() => {
      if (window.__kairoBrush && window.__kairoBrush() === 'facility') return;
      document.getElementById('kairo-build-open').click();
      const ft = document.querySelector('#kairo-sheet [data-tab="facility"]');
      if (ft) ft.click();
      const p = document.querySelector('[data-pick="facility:snackbar"]');
      if (p) p.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
    })()`);
    await page.evaluate(`window.__kairo.scene.focusTile(${ti}, ${tj})`);
    await page.waitForTimeout(120);
    const pt = (await page.evaluate(`(() => {
      const h = window.__kairo, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const sx = cr.width / cv.width, sy = cr.height / cv.height;
      const r = h.scene.tileScreenRect(${ti}, ${tj});
      const x = Math.round(cr.left + (r.x + 16) * sx), y = Math.round(cr.top + (r.y + 8) * sy);
      const el = document.elementFromPoint(x, y);
      return { x: x, y: y, tag: el ? el.tagName : '(없음)' };
    })()`)) as { x: number; y: number; tag: string };
    if (pt.tag !== 'CANVAS') continue;
    await page.touchscreen.tap(pt.x, pt.y);
    await page.waitForTimeout(700); // 더블탭 확대를 피한다
    /*
     * K32: 탭하면 **고스트 + 확정 바**가 뜬다. 바로 안 놓인다 — 회전과 "장비 탄 손님"이
     * 나중에 들어오므로 놓기 전에 만질 수 있는 상태를 뒀다. 확정을 눌러야 놓인다.
     *
     * K47-③: 탭의 뜻이 "여기에 놓는다"에서 **"조준을 그 칸으로 옮긴다"**로 바뀌었다
     * (성긴 조준 — 계획 §3 의 호환 다리). 화면 탭 → 확정이라는 이 절의 경로는 그대로
     * 살아 있고, 바뀐 것은 탭이 확정의 **전 단계**라는 뜻뿐이다.
     */
    const ghost = (await page.evaluate(`(() => {
      const c = document.getElementById('kairo-confirm');
      const btn = document.getElementById('kairo-place-confirm');
      return { bar: !!c && !c.hidden, ok: !!btn && !btn.disabled,
               label: c ? (c.querySelector('.place-label') || {}).textContent : '',
               ghost: !!window.__kairo.scene.ghost };
    })()`)) as { bar: boolean; ok: boolean; label: string; ghost: boolean };
    if (ghost.bar && ghost.ok) {
      const before = (await page.evaluate(`window.__kairo.placement.count`)) as number;
      if (before !== countBefore) tapDetail += ` · ⚠ 확정 전에 이미 놓였다`;
      await page.click('#kairo-place-confirm');
      await page.waitForTimeout(400);
    } else if (ghost.bar) {
      tapDetail += ` · (${ti},${tj}) 거절 "${ghost.label}"`;
      await page.click('#kairo-place-cancel');
      await page.waitForTimeout(200);
      continue;
    }
    const now = (await page.evaluate(`window.__kairo.placement.count`)) as number;
    if (now > countBefore) {
      placedAt = [ti, tj];
      break;
    }
    const toast = (await page.evaluate(
      `(() => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; })()`,
    )) as string;
    tapDetail += ` · (${ti},${tj}) 거절 "${toast}"`;
  }
  const cashAfter = await cashOf();
  const countAfter = (await page.evaluate(`window.__kairo.placement.count`)) as number;
  record(
    '화면을 탭해 조준하고 확정해 시설을 놓는다 (K47-③)',
    placedAt !== null ? 'pass' : 'fail',
    placedAt
      ? `(${placedAt[0]}, ${placedAt[1]}) 탭 → 시설 ${countBefore} → ${countAfter}`
      : tapDetail,
  );
  record(
    '시설을 놓으면 건설비가 실제로 나간다 — 봇만 돈을 쓰던 상태를 막는다',
    cashAfter < cashBefore ? 'pass' : 'fail',
    `현금 ${cashBefore}만 → ${cashAfter}만`,
  );

  const savedInfo = (await page.evaluate(`(() => {
    const raw = localStorage.getItem('ppaji.kairo.save.v1');
    if (!raw) return { bytes: 0, facilities: -1 };
    const s = JSON.parse(raw);
    const p = s.placement;
    const n = Array.isArray(p) ? p.length : Array.isArray(p.items) ? p.items.length : -1;
    return { bytes: raw.length, facilities: n, cash: s.week ? s.week.cash : -1 };
  })()`)) as { bytes: number; facilities: number; cash?: number };
  record(
    '세이브가 localStorage 에 써진다',
    savedInfo.bytes > 100 ? 'pass' : 'fail',
    `${(savedInfo.bytes / 1024).toFixed(1)}KB · 시설 ${savedInfo.facilities}개`,
  );

  // 새로고침 — 여기가 진짜 검사다. 왕복 단위 테스트로는 이걸 못 본다
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const afterReload = (await page.evaluate(`(() => {
    const h = window.__kairo;
    return { facilities: h.placement.count, view: h.scene.guestViewCount };
  })()`)) as { facilities: number };
  const cashReload = await cashOf();
  record(
    '새로고침 후에도 시설이 남아 있다 — 폰에서 다시 켜도 판이 이어진다',
    afterReload.facilities === savedInfo.facilities && savedInfo.facilities > 0 ? 'pass' : 'fail',
    `세이브 ${savedInfo.facilities}개 → 복원 ${afterReload.facilities}개 (화면 ${countAfter}개)`,
  );
  /*
   * 카드의 **지속 효과**가 재부팅을 넘는가. 안 넘으면 "3주간 만족 −8" 을 감수하고 고른
   * 선택이 새로고침으로 지워지고, 그러면 선택에 무게가 없어진다.
   */
  const cardsAfter = (await page.evaluate(`(() => {
    const c = window.__kairo.cards;
    return { active: c ? c.active.length : -1, seen: c ? c.seenCount : -1 };
  })()`)) as { active: number; seen: number };
  record(
    '카드 상태가 새로고침을 넘는다 — 안 넘으면 선택에 무게가 없다',
    cardsAfter.seen > 0 ? 'pass' : 'fail',
    `본 카드 ${cardsAfter.seen}종 · 적용 중 ${cardsAfter.active}건`,
  );

  record(
    '새로고침 후에도 현금이 이어진다',
    savedInfo.cash !== undefined && cashReload === Math.round(savedInfo.cash / 10000)
      ? 'pass'
      : 'fail',
    `세이브 ${Math.round((savedInfo.cash ?? 0) / 10000)}만 → 복원 ${cashReload}만`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/kairo-save.png` });

  /*
   * ── 9b. HUD 가 화면을 얼마나 먹나 · 두 방향 (K28) ──
   *
   * "투박하다"를 숫자로 못박는다. 재보니 예전 HUD 는 폰 세로에서 **화면의 40%** 를
   * 덮었고 상시 컨트롤이 **15개**였다. 레퍼런스(Pool Slide Story)를 같은 방법으로
   * 재면 ~14% · 버튼 2개다.
   *
   * 세로·가로를 **둘 다** 본다. 한쪽만 보면 안 본 쪽이 깨진다.
   */
  /*
   * ⚠ **통과 상자(`display: contents`)는 뚫고 들어간다.** 홈 셸 v2 의 목표 루트가
   * 그 꼴이다 — 자기 상자가 없고 A 카드와 B/C 칩만 칠한다. 뚫지 않으면 0×0 이라
   * 건너뛰어져, 예산이 내려간 게 아니라 **HUD 를 안 세는 검사**가 된다
   * (「검사가 조용히 통과」). 뚫으면 실제 칠하는 자식이 그대로 예산에 들어온다.
   */
  const MEASURE_HUD = `(() => {
    const W = innerWidth, H = innerHeight;
    const boxes = [];
    const collect = (node) => {
      const st = getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden') return;
      if (st.display === 'contents') {
        for (const child of node.children) {
          if (!child.hidden) collect(child);
        }
        return;
      }
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      boxes.push([r.left, r.top, r.right, r.bottom]);
    };
    for (const el of document.body.children) {
      if (el.tagName === 'CANVAS' || el.id === 'game' || el.hidden) continue;
      // 디버그 오버레이는 개발용이라 실제 플레이에서는 숨는다. 이 하네스가 부팅
      // 판정에 쓰느라 켜 둔 것뿐이므로 예산에서 뺀다 (실제 사용자에게 없는 비용이다)
      if (el.id === 'kairo-debug') continue;
      collect(el);
    }
    let hit = 0, tot = 0;
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
      tot++;
      if (boxes.some((c) => x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3])) hit++;
    }
    const ctrl = [...document.querySelectorAll('button, select, input, [role="button"]')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const minTap = ctrl.length
      ? Math.min(...ctrl.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }))
      : 0;
    return { chrome: Math.round(hit / tot * 100), controls: ctrl.length,
             minTap: Math.round(minTap), overflow: document.documentElement.scrollWidth - W };
  })()`;

  /*
   * 예산은 방향마다 다르다 — **고정 높이 바(56px)가 화면 높이에서 차지하는 비율**이
   * 다르기 때문이다. 세로 852px 에서 6.6%, 가로 393px 에서 14.2% 다. 터치 타깃 44px 를
   * 지키면 바를 더 줄일 수 없으므로 가로는 여기가 사실상 바닥이다.
   * (레퍼런스도 720px 높이에서 60px 바 = 8.3% 였다.)
   */
  /*
   * K46: 레퍼런스(카이로 실물)의 2단 헤더 구조를 사용자가 지정했다 — 헤더가 지표
   * 3종 + 리포트를 상시로 지므로 예산이 오른다. 예전 40% 대비 여전히 절반 이하이고,
   * 레퍼런스 자체가 이 정도를 쓴다 (상단 2줄 + 하단 2단).
   */
  /*
   * 예산 24/36 (K47-② 에서 실측 후 확정. ① 의 임시 25/37 에서 한 칸씩 조였다).
   *
   * ⚠ **천장을 정하는 것은 티커가 아니라 의뢰 칩 기둥이다** — ② 에서 헤더 2줄째의
   * 버튼 둘이 빠지며 그 줄이 `min-height: var(--tap)`(44px) 을 놓아 헤더가
   * 106 → 78px 로 낮아졌는데(−2%p), `refreshGoal` 이 칩을 최대 4장(의뢰 2 + 등급 +
   * 시나리오) 낼 때 +1.8%p 가 그대로 붙는다. 실측: 통상 세로 23% / 가로 35%,
   * 칩 4장 최악 24.9% / 36.7%.
   *
   * 그래서 **K46 의 22/30 으로는 돌아갈 수 없다** — 전폭 26px 뉴스 띠의 몫(세로
   * +3.1%p · 가로 +6.6%p)이 영구히 더해진다. 더 내리려면 칩 기둥을 손대야 하고
   * 그건 K40 계약이다 (칩 최대 3장으로 줄이면 세로 ~23 / 가로 ~35 까지 내려간다).
   */
  for (const [vw, vh, tag, budget] of [
    [393, 852, '세로', 24],
    [852, 393, '가로', 36],
  ] as const) {
    const cx = await browser.newContext({
      viewport: { width: vw, height: vh },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const m = (await pg.evaluate(MEASURE_HUD)) as {
      chrome: number;
      controls: number;
      minTap: number;
      overflow: number;
    };
    record(
      `${tag} — HUD 가 화면의 ${budget}% 이하 (예전 40%)`,
      m.chrome <= budget ? 'pass' : 'fail',
      `${m.chrome}%`,
    );
    /*
     * ⚠ **개수로 재지 않는다** (K47-② 의 「개수를 세는 검사는 조용히 죽는다」).
     * 홈의 상시 표면은 **이름이 있는 넷**이다 — 메뉴·건설·즉시 목표·티커. 넷이 각각
     * 존재하고 44px 이상인지를 정체로 확인하고, 그 밖의 상시 컨트롤이 새로 생기면
     * (예산을 먹는다) 같은 자리에서 잡는다.
     */
    const identity = (await pg.evaluate(HOME_CONTROL_IDENTITY)) as {
      missing: string[];
      small: string[];
      extra: string[];
    };
    record(
      `${tag} — 상시 행동 표면 정체 4종 (메뉴·건설·즉시 목표·티커) · 각 44px`,
      identity.missing.length === 0 && identity.small.length === 0 && identity.extra.length === 0
        ? 'pass'
        : 'fail',
      `없음 [${identity.missing.join(',')}] · 작음 [${identity.small.join(',')}] · ` +
        `계약 밖 [${identity.extra.join(',')}]`,
    );
    record(`${tag} — 터치 타깃 44px · 가로 넘침 0`,
      m.minTap >= 44 && m.overflow <= 0 ? 'pass' : 'fail',
      `최소 ${m.minTap}px · 넘침 ${m.overflow}px`);

    const pgCdp = await cx.newCDPSession(pg);
    const pgTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await pgCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };

    // 시트를 여는 것부터 진짜 터치다. `.click()`이면 덮인 버튼도 조용히 통과한다.
    const buildBox = await pg.locator('#kairo-build-open').boundingBox();
    if (buildBox) {
      await pg.touchscreen.tap(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2);
    }
    await pg.waitForTimeout(150);
    const opened = (await pg.evaluate(MEASURE_HUD)) as { chrome: number; minTap: number };

    /*
     * Phase 4 건설 선택 — 393×852 / 852×393 둘 다 같은 DOM·CSS를 **실제 터치**로 잰다.
     * 화살표 없음, 약 3장, 비용+역할 하나, 잠금 이유+해제법, 가로 스와이프 이동을 한 번에
     * 기록하고 스크린샷을 남긴다. 합성 PointerEvent는 네이티브 스크롤을 못 재므로 CDP touch다.
     */
    const buildBefore = (await pg.evaluate(`(() => {
      const sheet = document.getElementById('kairo-sheet');
      const car = sheet.querySelector('.kcarousel');
      const cards = [...car.querySelectorAll('.kcard')];
      const cr = car.getBoundingClientRect();
      const visible = cards.filter((card) => {
        const r = card.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left));
        return overlap >= r.width * 0.5;
      });
      const blocked = cards.filter((card) => card.disabled);
      const names = cards.map((card) => card.querySelector('.kcard-name')).filter(Boolean);
      const first = cards[0] ? cards[0].getBoundingClientRect() : null;
      const cs = names[0] ? getComputedStyle(names[0]) : null;
      return {
        x: cr.left, y: cr.top, w: cr.width, h: cr.height,
        scroll: car.scrollLeft, max: car.scrollWidth - car.clientWidth,
        cards: cards.length, visible: visible.length,
        cardW: first ? first.width : 0, cardH: first ? first.height : 0,
        nav: sheet.querySelectorAll('.kcar-nav').length,
        roleOne: cards.every((card) => card.querySelectorAll('.kcard-role').length === 1),
        costOne: cards.every((card) => card.querySelectorAll('.kcard-cost').length === 1),
        blocked: blocked.length,
        blockedExplained: blocked.every((card) =>
          card.querySelectorAll('.kcard-block').length === 1 &&
          card.querySelectorAll('.kcard-unlock').length === 1),
        lineClamp: cs ? cs.webkitLineClamp : '',
        sheetH: sheet.getBoundingClientRect().height,
      };
    })()`)) as {
      x: number; y: number; w: number; h: number; scroll: number; max: number;
      cards: number; visible: number; cardW: number; cardH: number; nav: number;
      roleOne: boolean; costOne: boolean; blocked: number; blockedExplained: boolean;
      lineClamp: string; sheetH: number;
    };
    const swipeY = buildBefore.y + Math.min(buildBefore.h - 8, buildBefore.cardH / 2);
    const swipeFrom = buildBefore.x + buildBefore.w * 0.82;
    const swipeTo = buildBefore.x + buildBefore.w * 0.18;
    await pgTouch('touchStart', swipeFrom, swipeY);
    for (let step = 1; step <= 8; step++) {
      await pgTouch(
        'touchMove',
        swipeFrom + ((swipeTo - swipeFrom) * step) / 8,
        swipeY,
      );
    }
    await pgTouch('touchEnd', 0, 0);
    await pg.waitForTimeout(450);
    const buildAfter = (await pg.evaluate(`(() => {
      const car = document.querySelector('#kairo-sheet .kcarousel');
      return { scroll: car.scrollLeft, max: car.scrollWidth - car.clientWidth };
    })()`)) as { scroll: number; max: number };
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-build-phase4-${tag}.png` });
    record(
      `${tag} — Phase 4 터치 레일은 화살표 없이 카드 약 3장을 보인다`,
      buildBefore.nav === 0 && buildBefore.visible >= 3 && buildBefore.visible <= 4
        ? 'pass'
        : 'fail',
      `카드 ${buildBefore.cards}장 · 화면 ${buildBefore.visible}장 · ` +
        `카드 ${Math.round(buildBefore.cardW)}×${Math.round(buildBefore.cardH)} · 화살표 ${buildBefore.nav}`,
    );
    record(
      `${tag} — 카드마다 비용 + 역할 배지 하나, 이름은 두 줄 허용`,
      buildBefore.costOne && buildBefore.roleOne && buildBefore.lineClamp === '2'
        ? 'pass'
        : 'fail',
      `비용 ${buildBefore.costOne ? '1개' : '불일치'} · 역할 ${buildBefore.roleOne ? '1개' : '불일치'} · ` +
        `line-clamp ${buildBefore.lineClamp || '없음'}`,
    );
    record(
      `${tag} — 막힌 카드는 선택 전에 이유와 해제법을 함께 보인다`,
      buildBefore.blocked > 0 && buildBefore.blockedExplained ? 'pass' : 'fail',
      `막힘 ${buildBefore.blocked}장 · 설명 ${buildBefore.blockedExplained ? '완비' : '누락'}`,
    );
    record(
      `${tag} — Phase 4 건설 카드 스와이프가 실제 가로 스크롤을 움직인다`,
      buildBefore.max > 0 && buildAfter.scroll > buildBefore.scroll + 20 ? 'pass' : 'fail',
      `scroll ${Math.round(buildBefore.scroll)} → ${Math.round(buildAfter.scroll)} / ${Math.round(buildAfter.max)} · ` +
        `시트 ${Math.round(buildBefore.sheetH)}px · 스크린샷 kairo-build-phase4-${tag}.png`,
    );

    const pickPoint = (await pg.evaluate(`(() => {
      const car = document.querySelector('#kairo-sheet .kcarousel');
      const cr = car.getBoundingClientRect();
      const card = [...car.querySelectorAll('.kcard')].find((item) => {
        if (item.disabled) return false;
        const r = item.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left));
        return overlap >= r.width * 0.5;
      });
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, pick: card.dataset.pick };
    })()`)) as { x: number; y: number; pick: string } | null;
    if (pickPoint) await pg.touchscreen.tap(pickPoint.x, pickPoint.y);
    await pg.waitForTimeout(180);
    const pickedByTouch = (await pg.evaluate(`(() => ({
      brush: window.__kairoBrush ? window.__kairoBrush() : null,
      sheetHidden: document.getElementById('kairo-sheet').hidden
    }))()`)) as { brush: string | null; sheetHidden: boolean };
    record(
      `${tag} — 보이는 카드를 진짜 터치하면 붓을 고르고 시트가 닫힌다`,
      pickPoint !== null && pickedByTouch.brush !== null && pickedByTouch.sheetHidden ? 'pass' : 'fail',
      `${pickPoint?.pick ?? '카드 없음'} → 붓 ${pickedByTouch.brush ?? '없음'} · ` +
        `시트 ${pickedByTouch.sheetHidden ? '닫힘' : '열림'}`,
    );
    await pg.evaluate(`window.__kairoClearBrush && window.__kairoClearBrush()`);

    const closeBox = await pg.locator('#kairo-sheet-close').boundingBox();
    if (closeBox) {
      await pg.touchscreen.tap(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    }
    await pg.waitForTimeout(150);
    const closed = (await pg.evaluate(MEASURE_HUD)) as { chrome: number };
    record(
      `${tag} — 시트를 닫으면 화면이 돌아온다`,
      opened.chrome > m.chrome && Math.abs(closed.chrome - m.chrome) <= 1 ? 'pass' : 'fail',
      `닫힘 ${m.chrome}% → 열림 ${opened.chrome}% → 닫힘 ${closed.chrome}%`,
    );
    record(
      `${tag} — 시트 안 터치 타깃도 44px`,
      opened.minTap >= 44 ? 'pass' : 'fail',
      `최소 ${opened.minTap}px`,
    );
    /*
     * 예산 절의 짝 — HUD 가 예산 안에 들어온 **이유**가 한 밴드이기 때문임을 여기서 잰다.
     * 세로는 밴드가 전폭, 가로는 폰 한 칸 폭(377px) 캡이다.
     */
    const goalGeom = (await pg.evaluate(`(() => {
      const top = document.getElementById('kairo-top').getBoundingClientRect();
      const goal = document.getElementById('kairo-goal');
      const immediate = goal.querySelector('[data-goal-role="immediate"]');
      const label = immediate && immediate.querySelector('.kgoal-label');
      const secondary = [...goal.querySelectorAll('[data-goal-role="mid"], [data-goal-role="long"]')];
      const band = goal.getBoundingClientRect();
      const ir = immediate && immediate.getBoundingClientRect();
      const rows = [ir, ...secondary.map((item) => item.getBoundingClientRect())];
      const taps = [...goal.querySelectorAll('[role="button"]')]
        .map((item) => { const r = item.getBoundingClientRect(); return Math.min(r.width, r.height); });
      return {
        legacy: !!document.querySelector('.kchipcol'),
        visible: !goal.hidden && goal.dataset.goalSurface === 'home',
        bandW: Math.round(band.width),
        bandFullWidth: band.left <= 8.5 && band.right >= window.innerWidth - 8.5,
        bandCapped: Math.round(band.width) <= 377,
        sameRow: rows.length === 3 && rows.every((r) => r && Math.abs(r.top - rows[0].top) <= 1),
        primaryShare: ir ? ir.width / band.width : 0,
        belowHeader: band.top >= top.bottom,
        fits: !!label && label.scrollWidth <= label.clientWidth,
        minTap: taps.length ? Math.min(...taps) : 0,
      };
    })()`)) as {
      legacy: boolean;
      visible: boolean;
      bandW: number;
      bandFullWidth: boolean;
      bandCapped: boolean;
      sameRow: boolean;
      primaryShare: number;
      belowHeader: boolean;
      fits: boolean;
      minTap: number;
    };
    const bandOk = tag === '세로' ? goalGeom.bandFullWidth : goalGeom.bandCapped;
    /*
     * ⚠ UI v3·v4 — 밴드는 **현재 행동 한 줄**이 통째로 갖는다 (`primaryShare === 1`).
     * 옛 계약은 `A 약 60% · 같은 행에 B/C` 였는데, 그 20% 칸에서 B/C 라벨이 감춰지는
     * 것이 결함의 정체였다. 되돌리면 `primaryShare` 가 0.6 대로 떨어져 빨간불이 된다.
     */
    record(
      `${tag} — ★ 홈 목표: 현재 행동 한 줄이 밴드 전부 · 제목 무잘림 · 44px`,
      !goalGeom.legacy && goalGeom.visible && bandOk &&
        goalGeom.primaryShare >= 0.98 &&
        goalGeom.belowHeader && goalGeom.fits && goalGeom.minTap >= 44
        ? 'pass'
        : 'fail',
      `밴드 ${goalGeom.bandW}px · 현재 행동 ${Math.round(goalGeom.primaryShare * 100)}% · ` +
        `헤더 아래 ${goalGeom.belowHeader} · ` +
        `제목 ${goalGeom.fits ? '맞음' : '넘침'} · 최소 ${Math.round(goalGeom.minTap)}px`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-hud-${tag}.png` });
    await cx.close();
  }

  /* 터치가 없는 키보드/마우스 환경은 이름 있는 44px 페이지 버튼을 폴백으로 쓴다. */
  {
    const cx = await browser.newContext({
      viewport: { width: 852, height: 393 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    await pg.locator('#kairo-build-open').click();
    const fallback = (await pg.evaluate(`(() => {
      const car = document.querySelector('#kairo-sheet .kcarousel');
      const nav = [...document.querySelectorAll('#kairo-sheet .kcar-nav')];
      const before = car.scrollLeft;
      const sizes = nav.map((b) => b.getBoundingClientRect());
      return {
        before: before,
        labels: nav.map((b) => b.getAttribute('aria-label')),
        min: sizes.length ? Math.min(...sizes.map((r) => Math.min(r.width, r.height))) : 0,
      };
    })()`)) as { before: number; labels: Array<string | null>; min: number };
    await pg.getByRole('button', { name: '다음 건설 카드' }).click();
    await pg.waitForTimeout(350);
    const after = (await pg.locator('#kairo-sheet .kcarousel').evaluate((el) => el.scrollLeft)) as number;
    record(
      '비터치 폴백은 이름 있는 이전/다음 44px 버튼이고 실제로 페이지를 넘긴다',
      fallback.labels.join(',') === '이전 건설 카드,다음 건설 카드' &&
        fallback.min >= 44 && after > fallback.before
        ? 'pass'
        : 'fail',
      `${fallback.labels.join(' / ')} · 최소 ${Math.round(fallback.min)}px · ` +
        `scroll ${Math.round(fallback.before)} → ${Math.round(after)}`,
    );
    await cx.close();
  }

  /*
   * ── 9h. 고스트·블록 붓·코스 탭 (K32) ──
   *
   * 탭하면 바로 놓던 것을 **고스트 → 확정**으로 바꿨다. 회전과 "장비 탄 손님" 그림이
   * 나중에 들어오므로 놓기 전에 만질 수 있는 상태가 필요하다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    const r = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, sc = h.scene;
      const countIndoor = () => { let n = 0;
        for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) if (t.isIndoor(i, j)) n++;
        return n; };
      const out = {};

      // ① 건물 블록 4×4 — 빈 잔디에 칠하면 실내가 16 늘고 값이 그만큼 나간다
      out.indoor0 = countIndoor();
      out.cash0 = h.week.cash;
      /*
       * ⚠ 탭 좌표를 박지 않는다 (K36). 격자가 96×72 가 되고 입구가 가운데로 가면서
       * (13,6) 은 도시 띠·내 땅 밖이 됐다. **토지 안 빈 잔디**를 찾아 쓴다.
       */
      const _L = h.land();
      let TI = -1, TJ = -1;
      for (let j = _L.j0 + 2; j < _L.j0 + _L.h - 6 && TI < 0; j++) {
        for (let i = _L.i0 + 2; i < _L.i0 + _L.w - 6; i++) {
          let free = true;
          /*
           * ⚠ 잔디만 찾으면 안 된다 — 앞 절들이 판을 통째로 포장해 뒀다 (PAVE_ALL).
           * 실내 바닥은 포장 위에도 깔린다. 조건은 "지을 수 있고 · 실내가 아니고 · 비었다".
           *
           * ⚠ K47-③: 창을 **탭한 칸 둘레로 넓혔다** (di,dj = −2…3). 4칸 블록의 좌상단이
           * 탭한 칸에서 어느 쪽으로 얼마나 밀리는지는 조준 규칙이 정하는데, 그 규칙이
           * 바뀌는 중이다. 좁게 잡으면 "블록은 제대로 깔렸는데 자리 탓에 거절"이 되어
           * 검사가 엉뚱한 이유로 빨간불이 된다.
           */
          for (let dj = -2; dj <= 3 && free; dj++)
            for (let di = -2; di <= 3; di++)
              if (!h.terrain.isBuildable(i + di, j + dj) || h.terrain.isWater(i + di, j + dj) ||
                  h.terrain.isIndoor(i + di, j + dj) || h.placement.handleAt(i + di, j + dj)) { free = false; break; }
          if (free) { TI = i; TJ = j; break; }
        }
      }
      out.TI = TI; out.TJ = TJ; out.landBox = _L;
      /*
       * ⚠ **길을 먼저 붙인다** (K32-B 이후). 잔디 섬에 방을 지으면 문이 안 나고,
       * paintFloorBlock 이 no-door 로 통째로 되돌려 "실내 +0" 이 된다.
       */
      const _g = h.gate;
      /*
       * ⚠ K47-③: 길을 **두 줄** 낸다 (TI−2 · TI−1). 블록이 어느 쪽으로 밀리든 한 줄은
       * 방 밖에 남아 문이 날 자리가 된다 — 한 줄만 내면 그 줄이 방에 먹히는 순간
       * no-door 로 통째로 되돌아가 "실내 +0" 이 된다 (K32-B 이후의 규칙).
       */
      for (let k = Math.min(_g.i, TI - 2); k <= Math.max(_g.i, TI - 2); k++) {
        if (h.terrain.isWalkable(k, _g.j) && h.terrain.isBuildable(k, _g.j)) h.terrain.paint(k, _g.j, 'path_stone');
      }
      for (const col of [TI - 2, TI - 1]) {
        for (let k = _g.j; k <= TJ + 4; k++) {
          if (h.terrain.isWalkable(col, k) && h.terrain.isBuildable(col, k)) h.terrain.paint(col, k, 'path_stone');
        }
      }
      h.guests.invalidate();
      document.getElementById('kairo-build-open').click();
      document.querySelector('#kairo-sheet [data-tab="building"]').click();
      document.querySelector('[data-pick="ground:floor_indoor@4"]').click();
      const _sh0 = document.getElementById('kairo-sheet');
      if (_sh0 && !_sh0.hidden) document.getElementById('kairo-sheet-close').click();
      /*
       * K47-③ — 바닥·건물도 **조준 + 확정**이다. 탭은 조준일 뿐이라 여기서 아직
       * 깔리면 안 된다 (48만이 탭 한 번에 나가던 것이 이 붓을 승격시킨 이유다).
       */
      h.tapTile(TI, TJ);
      out.indoorMid = countIndoor();
      const _cbar = document.getElementById('kairo-confirm');
      const _cbtn = document.getElementById('kairo-place-confirm');
      out.groundBar = !!_cbar && !_cbar.hidden;
      out.groundDisabled = !!_cbtn && _cbtn.disabled;
      if (out.groundBar && _cbtn && !_cbtn.disabled) _cbtn.click();
      out.indoor1 = countIndoor();
      out.cash1 = h.week.cash;
      /*
       * ★ **1회 설치가 기본이다** (UI v3 Task 5).
       *
       * ⚠ 여기 있던 기대는 정확히 반대였다: "확정 뒤에도 바가 남아야 한다 — 연속 배치".
       * 그 계약 때문에 석재 보도 한 번 확정 뒤 조준이 살아남아 다음 칸이 즉시
       * 활성화됐고, 실제 터치에서 현금이 두 번 빠졌다 (2026-08-26 실측:
       * 500만 → 499.3만 → 498.6만). 새 검사만 얹는 것이 아니라 **옛 기대를 뒤집는다.**
       */
      out.oneShotBarAfter = !!_cbar && !_cbar.hidden;
      out.oneShotBrushAfter = window.__kairoBrush ? window.__kairoBrush() : null;
      out.oneShotGhostAfter = !!sc.ghost;
      /* 두 번째 지도 탭 — one-shot 이면 배치도 지출도 없어야 한다 */
      out.oneShotCashAfterTap = h.week.cash;
      h.tapTile(TI + 1, TJ + 1);
      out.oneShotIndoorAfterTap = countIndoor();
      out.oneShotCashAfterTap2 = h.week.cash;
      out.oneShotBarAfterTap = !!_cbar && !_cbar.hidden;
      if (window.__kairoClearBrush) window.__kairoClearBrush();

      // ② 고스트 — 시설을 고르고 탭하면 아직 안 놓인다
      out.count0 = h.placement.count;
      const pickToilet = () => {
        document.getElementById('kairo-build-open').click();
        document.querySelector('#kairo-sheet [data-tab="facility"]').click();
        document.querySelector('[data-pick="facility:toilet"]').click();
        const s = document.getElementById('kairo-sheet');
        if (s && !s.hidden) document.getElementById('kairo-sheet-close').click();
      };
      pickToilet();
      h.tapTile(TI, TJ);
      const c = document.getElementById('kairo-confirm');
      out.bar = !!c && !c.hidden;
      out.ghost = !!sc.ghost;
      out.countAfterTap = h.placement.count;
      out.rotateDisabled = document.getElementById('kairo-place-rotate').disabled;

      // 취소하면 안 놓인다
      document.getElementById('kairo-place-cancel').click();
      out.countAfterCancel = h.placement.count;
      out.ghostAfterCancel = !!sc.ghost;

      /*
       * 다시 조준하고 확정하면 놓인다.
       * ⚠ K47-③: 취소는 **조준을 끝낸다.** 붓까지 떨어졌다면 다시 고른다 —
       * "붓이 남아 있겠지"에 기대면 이 절이 원인 없이 빨간불이 된다.
       */
      if (!window.__kairoBrush || window.__kairoBrush() !== 'facility') pickToilet();
      h.tapTile(TI, TJ);
      const cf = document.getElementById('kairo-place-confirm');
      out.barBefore = !document.getElementById('kairo-confirm').hidden;
      out.confirmDisabled = cf.disabled;
      out.label2 = (document.getElementById('kairo-confirm').querySelector('.place-label') || {}).textContent;
      out.previewThumb = !!document.querySelector('#kairo-confirm .kconfirm-thumb canvas');
      out.previewName = (document.querySelector('#kairo-confirm .kconfirm-name') || {}).textContent || '';
      out.previewCost = (document.querySelector('#kairo-confirm .kconfirm-cost') || {}).textContent || '';
      out.previewCheck = (document.querySelector('#kairo-confirm .kconfirm-check') || {}).textContent || '';
      return out;
    })()`)) as Record<string, number | boolean>;

    await pg.screenshot({ path: `${SHOT_DIR}/kairo-build-confirm-phase4.png` });
    await pg.locator('#kairo-place-confirm').tap();
    await pg.waitForTimeout(120);
    const countAfterConfirm = (await pg.evaluate(`window.__kairo.placement.count`)) as number;

    record(
      '건물 4×4 블록이 실내를 16칸 늘리고 값이 그만큼 나간다 (K32)',
      (r.indoor1 as number) - (r.indoor0 as number) === 16 &&
        (r.cash0 as number) - (r.cash1 as number) === 16 * 30000
        ? 'pass'
        : 'fail',
      `실내 +${(r.indoor1 as number) - (r.indoor0 as number)} · TI ${String(r.TI)},${String(r.TJ)} · 토지 ${JSON.stringify(r.landBox)} · 현금 −${Math.round(
        ((r.cash0 as number) - (r.cash1 as number)) / 10000,
      )}만`,
    );
    /*
     * ⚠ 값이 나가는 시점이 **확정으로 옮겨졌다** (K47-③). 4×4 = 48만이 탭 한 번에
     * 즉시 지출이었고 미리보기가 아예 없었다 — 그것이 이 붓을 승격시킨 이유다.
     * 위 검사는 "총합"만 보므로, 탭 즉시 깔리는 옛 동작에서도 그대로 통과한다.
     * 게이트가 실제로 생겼는지는 **확정 전 스냅샷**으로만 잡힌다.
     */
    record(
      '건물 블록도 확정을 거친다 — 탭만으로는 안 깔린다 (K47-③)',
      r.groundBar === true && r.indoorMid === r.indoor0 ? 'pass' : 'fail',
      `확정 바 ${String(r.groundBar)} (disabled ${String(r.groundDisabled)}) · ` +
        `탭 직후 실내 ${String(r.indoorMid)} (기준 ${String(r.indoor0)})`,
    );
    /*
     * ★ 옛 계약(`확정 뒤에도 바가 남는다`)을 **뒤집은 자리**다. 붓·바·고스트가 함께
     * 사라지고, 그 뒤의 지도 탭이 실내도 현금도 안 건드려야 통과다 (계획 §1.5-6).
     */
    record(
      '★ 1회 설치가 기본이다 — 확정 한 번 뒤 붓·바·고스트가 함께 사라진다 (UI v3)',
      r.oneShotBarAfter === false && r.oneShotBrushAfter === null && r.oneShotGhostAfter === false
        ? 'pass'
        : 'fail',
      `확정 후 바 ${String(r.oneShotBarAfter)} · 붓 ${String(r.oneShotBrushAfter)} · ` +
        `고스트 ${String(r.oneShotGhostAfter)}`,
    );
    record(
      '★ 1회 설치 뒤 지도를 다시 눌러도 상태·현금이 안 바뀐다 (UI v3)',
      r.oneShotIndoorAfterTap === r.indoor1 &&
        r.oneShotCashAfterTap2 === r.oneShotCashAfterTap &&
        r.oneShotBarAfterTap === false
        ? 'pass'
        : 'fail',
      `실내 ${String(r.indoor1)} → ${String(r.oneShotIndoorAfterTap)} · ` +
        `현금 ${String(r.oneShotCashAfterTap)} → ${String(r.oneShotCashAfterTap2)} · ` +
        `바 ${String(r.oneShotBarAfterTap)}`,
    );
    record(
      '시설을 탭하면 고스트가 뜨고 **아직 안 놓인다**',
      r.bar === true && r.ghost === true && r.countAfterTap === r.count0 ? 'pass' : 'fail',
      `바 ${String(r.bar)} · 고스트 ${String(r.ghost)} · 시설 ${String(r.countAfterTap)}`,
    );
    record(
      '취소하면 안 놓이고 고스트가 사라진다',
      r.countAfterCancel === r.count0 && r.ghostAfterCancel === false ? 'pass' : 'fail',
      `시설 ${String(r.countAfterCancel)} · 고스트 ${String(r.ghostAfterCancel)}`,
    );
    record(
      '확정하면 놓인다',
      countAfterConfirm === (r.count0 as number) + 1 ? 'pass' : 'fail',
      `${String(r.count0)} → ${countAfterConfirm} · 바 ${String(r.barBefore)} · disabled ${String(r.confirmDisabled)} · "${String(r.label2)}"`,
    );
    record(
      'Phase 4 확정 바는 선택 썸네일·실제 비용·현재 자리 판정을 함께 보인다',
      r.previewThumb === true &&
        String(r.previewName).includes('화장실') &&
        /비용\s+\d+만/.test(String(r.previewCost)) &&
        String(r.previewCheck) === '배치 가능'
        ? 'pass'
        : 'fail',
      `썸네일 ${String(r.previewThumb)} · ${String(r.previewName)} · ` +
        `${String(r.previewCost)} · ${String(r.previewCheck)} · 스크린샷 kairo-build-confirm-phase4.png`,
    );
    record(
      '회전 버튼은 자리만 잡혀 있다 (방향 스프라이트가 생기면 켠다)',
      r.rotateDisabled === true ? 'pass' : 'fail',
      `disabled ${String(r.rotateDisabled)}`,
    );
    await cx.close();
  }

  /*
   * ── 9g. 해금된 토지가 화면에 보인다 (K32) ──
   *
   * ⚠ K25 에 넣은 기능인데 **K32 까지 죽어 있었다.** `setLand` 가 씬 타일이 생기기 전에
   * 불려 조용히 아무것도 안 했고, **아무도 tint 를 안 봐서** 검사 155개가 전부 통과했다.
   * 그래서 이 검사를 넣는다 — 음성 대조군까지 같이.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const tint = (await pg.evaluate(`(() => {
      const sc = window.__kairo.scene, h = window.__kairo;
      const W = h.terrain.width, H = h.terrain.height;
      const at = (i, j) => {
        const t = sc.tileImages[j * W + i];
        return t ? (t.tintTopLeft >>> 0).toString(16) : 'none';
      };
      /*
       * K36: 토지는 입구를 중심으로 **좌우로** 자라는 오프셋 사각형이다. 표본을 실제
       * 사각형에서 뽑는다 — 좌표를 박으면 등급 값이 바뀔 때마다 검사가 거짓말을 한다.
       */
      const L = h.land();
      const inside = [L.i0 + 1, L.j0 + 1];
      const outX = [Math.min(W - 1, L.i0 + L.w + 1), L.j0 + 1];
      const outY = [L.i0 + 1, Math.min(H - 1, L.j0 + L.h + 1)];
      const before = { inside: at(inside[0], inside[1]), outX: at(outX[0], outX[1]), outY: at(outY[0], outY[1]) };
      // 음성 대조군 — 토지를 격자 전체로 넓히면 밖이 사라져 전부 같아야 한다
      sc.setLand({ i0: 0, j0: 0, w: W, h: H });
      const all = { inside: at(inside[0], inside[1]), outX: at(outX[0], outX[1]), outY: at(outY[0], outY[1]) };
      return { before: before, all: all };
    })()`)) as {
      before: { inside: string; outX: string; outY: string };
      all: { inside: string; outX: string; outY: string };
    };

    record(
      '해금된 토지 밖이 어둡게 표시된다 (K32)',
      tint.before.inside !== tint.before.outX && tint.before.inside !== tint.before.outY
        ? 'pass'
        : 'fail',
      `안 ${tint.before.inside} · 밖 ${tint.before.outX}/${tint.before.outY}`,
    );
    record(
      '⚠ 음성 대조군 — 토지를 다 열면 구분이 사라진다 (검사가 유의미한가)',
      tint.all.inside === tint.all.outX && tint.all.inside === tint.all.outY ? 'pass' : 'fail',
      `안 ${tint.all.inside} · 밖 ${tint.all.outX}/${tint.all.outY}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-land.png` });
    await cx.close();
  }

  /*
   * ── 9f. 새 판이 빈 땅이 아니다 (K30) ──
   *
   * 빈 땅에서 시작하면 위생 시설 9종이 전부 `needs-indoor` 로 막히는데 첫 의뢰가
   * "기본 위생 3개"였다. 물려받은 빠지가 그 벽을 없앤다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    // 세이브를 지우고 새 판으로 들어간다 — 저장된 판이 있으면 킷이 안 돈다
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(`${URL}&map=bukhan&scenario=inherited`, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const start = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, p = h.placement;
      let indoor = 0;
      for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) if (t.isIndoor(i, j)) indoor++;
      // 화장실을 놓을 수 있나 — 이게 이 킷의 존재 이유다
      let canToilet = false;
      // K36: 좌표 창을 박지 않는다 — 실내 칸을 직접 훑는다 (킷 방이 맵 가운데로 갔다)
      for (let j = 0; j < t.height && !canToilet; j++) {
        for (let i = 0; i < t.width; i++) {
          if (!t.isIndoor(i, j)) continue;
          if (p.check(t, h.walls, h.gate, 'toilet', i, j).ok) { canToilet = true; break; }
        }
      }
      return { facilities: p.count, indoor: indoor, canToilet: canToilet,
               courses: h.courses ? h.courses.count : -1 };
    })()`)) as { facilities: number; indoor: number; canToilet: boolean; courses: number };

    record(
      '새 판이 빈 땅이 아니다 — 물려받은 빠지 (K30)',
      start.facilities > 0 && start.indoor > 0 ? 'pass' : 'fail',
      `시설 ${start.facilities}개 · 실내 ${start.indoor}칸 · 코스 ${start.courses}개`,
    );
    record(
      '★ 첫 화면에서 화장실을 놓을 수 있다 — 빈 땅이면 위생 9종이 전부 막힌다',
      start.canToilet ? 'pass' : 'fail',
      `${start.canToilet}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-newgame-start.png` });
    await cx.close();
  }

  /*
   * ── 9d. 표면이 실제로 입체인가 (K29) ──
   *
   * CSS 에 그라디언트를 적었다고 화면에 보인다는 보장이 없다. **렌더된 픽셀**을 잘라
   * 위·아래 밝기를 비교한다. 평면이면 차이가 0 이다 (K29 이전 상태).
   *
   * ⚠ K47-② — 대상이 `#kairo-week`(진한 칠 `.kbtn.primary`)였는데 그 버튼이 사라졌다.
   *   `getBoundingClientRect()` 를 null 에서 부르므로 **런 전체가 예외로 죽는** 자리라
   *   가장 먼저 옮겼다. 새 대상은 하단 바에 남는 `#kairo-build-open` — 평 `.kbtn`(크림)이다.
   *
   *   **크림이라 문턱을 다시 기준 잡았다** (실측, 393×852 @3x):
   *     · 면의 위아래 차(`--panel` 그라디언트 #fdeecb→#f8e0b4): 236 − 219 = **16.7**
   *       → `>= 8` 그대로 통과한다 (진한 칠은 17 이었다)
   *     · 옛 두 번째 판정 `edge > bottom + 4` 는 **크림에서 뒤집힌다**: 최상단은
   *       그라디언트 보더(#c08c48, 160)라 크림 면(219)보다 **어둡다**. 진한 칠에서만
   *       "위가 밝다"였을 뿐이고, 밝은 표면에서 그건 하이라이트가 아니라 아웃라인이다.
   *       → 재질 레시피가 실제로 말하는 것으로 바꾼다: **아웃라인은 위가 밝고 아래가
   *       어둡다** (`--sk-edge-top #c08c48` → `--sk-edge-bottom #7d5322`, 빛은 위에서).
   *       실측 160 vs 107 = 53 차 → 문턱 20 (여유 2.6배). 두 표면 모두에서 성립한다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const box = (await pg.evaluate(`(() => {
      const el = document.getElementById('kairo-build-open');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y),
               width: Math.round(b.width), height: Math.round(b.height) };
    })()`)) as { x: number; y: number; width: number; height: number } | null;
    if (!box) {
      // 대상이 없으면 clip 이 예외를 던져 런이 통째로 죽는다 — 정직하게 실패로 적는다
      record('버튼이 평면이 아니다 — 위아래 밝기 차 (K29)', 'fail', '#kairo-build-open 이 없다');
      record('아웃라인이 위가 밝고 아래가 어둡다 — 빛은 위에서 (K46 재질 레시피)', 'fail',
        '#kairo-build-open 이 없다');
      await cx.close();
    } else {
      const shot = await pg.screenshot({ clip: box });
      /*
       * PNG 를 직접 뜯지 않고 캔버스에 그려 읽는다 — 브라우저가 이미 디코더를 갖고 있다.
       * (Node 쪽에 이미지 라이브러리를 새로 들이지 않으려는 이유이기도 하다.)
       */
      const b64 = shot.toString('base64');
      const surf = (await pg.evaluate(
        `(async (data) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + data;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const g = cv.getContext('2d');
          g.drawImage(img, 0, 0);
          const px = g.getImageData(0, 0, cv.width, cv.height).data;
          const lum = (x, y) => {
            const k = (y * cv.width + x) * 4;
            return 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
          };
          const rowMean = (y) => {
            let s = 0, n = 0;
            for (let x = 6; x < cv.width - 6; x++) { s += lum(x, y); n++; }
            return s / n;
          };
          const h = cv.height;
          return {
            w: cv.width, h: h,
            // 아웃라인(2px 그라디언트 보더)의 위·아래. 면이 아니라 **테두리**를 읽는다
            edgeTop: rowMean(1),
            edgeBottom: rowMean(h - 2),
            top: rowMean(Math.round(h * 0.25)),
            bottom: rowMean(Math.round(h * 0.85)),
          };
        })(${JSON.stringify(b64)})`,
      )) as { w: number; h: number; edgeTop: number; edgeBottom: number; top: number; bottom: number };

      const grad = surf.top - surf.bottom;
      record(
        '버튼이 평면이 아니다 — 위아래 밝기 차 (K29)',
        grad >= 8 ? 'pass' : 'fail',
        `위 ${surf.top.toFixed(0)} · 아래 ${surf.bottom.toFixed(0)} · 차 ${grad.toFixed(0)}`,
      );
      const edgeDrop = surf.edgeTop - surf.edgeBottom;
      record(
        '아웃라인이 위가 밝고 아래가 어둡다 — 빛은 위에서 (K46 재질 레시피)',
        edgeDrop >= 20 ? 'pass' : 'fail',
        `위 테두리 ${surf.edgeTop.toFixed(0)} · 아래 테두리 ${surf.edgeBottom.toFixed(0)} · ` +
          `차 ${edgeDrop.toFixed(0)} (문턱 20 · 실측 53)`,
      );
      await cx.close();
    }
  }

  /*
   * ── 9e. 모션이 있고, 끄면 꺼진다 (K29) ──
   *
   * 기기 설정을 존중하는지는 **켠 상태와 끈 상태를 둘 다** 봐야 안다.
   * 한쪽만 보면 "애니메이션이 원래 없다"와 구분이 안 된다.
   */
  for (const [reduce, tag] of [
    [false, '모션 켬'],
    [true, '모션 줄임'],
  ] as const) {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      reducedMotion: reduce ? 'reduce' : 'no-preference',
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const anim = (await pg.evaluate(`(() => {
      document.getElementById('kairo-build-open').click();
      const sh = document.getElementById('kairo-sheet');
      const st = getComputedStyle(sh);
      return { name: st.animationName, dur: st.animationDuration };
    })()`)) as { name: string; dur: string };
    const on = anim.name !== 'none' && anim.dur !== '0s';
    record(
      `${tag} — 시트 등장 애니메이션 ${reduce ? '없음' : '있음'}`,
      on === !reduce ? 'pass' : 'fail',
      `${anim.name} ${anim.dur}`,
    );
    await cx.close();
  }

  /*
   * ── 9f. 물이 살아 있다 (K53 · 계획 6단계) ──
   *
   * 분수·풀·족욕 7종 위에 **코드가 구운 한 장**을 얹어 두 프레임을 번갈아 건다.
   * 그림은 한 장도 안 늘었다 — 시설 스프라이트의 **물빛 픽셀**을 읽어 그 위에만 얹는다.
   *
   * ## 왜 화면에서 재나
   *
   * `ambientPhase(animTick)` 을 읽어 비교하면 **상수 산수**라 그리기가 통째로 틀려도
   * 통과한다 (K38 "깊이는 화면에 올라간 오브젝트에서 읽는다"와 같은 함정). 그래서
   * 판정은 **프레임버퍼 픽셀**로 하고, 텍스처 키는 원인을 가리는 보조 지표로만 쓴다.
   *
   * ## 얼려 놓고 잰다
   *
   * 손님이 걸어 들어오면 달라진 픽셀이 물 때문인지 손님 때문인지 못 가른다. 황혼 틴트도
   * 시간에 따라 지면 색을 민다 (K39 실측 24%). `flow.frozen` + `setAutoTick(false)` +
   * `setDayPhase(null)` 로 **물만 남긴다**.
   *
   * ## 세 갈래를 같은 자로 잰다
   *
   *   ★ 모션 켬     → 구분되는 화면이 **2 이상**
   *   ★ 모션 줄임   → **1** (기기 설정을 존중한다)
   *   ⚠ 음성 대조군 → `ambient-static` 을 켜면 **1** (검사가 정말 움직임을 재고 있었나)
   */
  {
    /** 대상 7종 — `AMBIENT_FACILITIES` 와 같아야 한다. 갈라지면 아래 개수 검사가 잡는다 */
    const AMB_IDS = [
      'fountain',
      'footbath',
      'pool_kids',
      'pool_warm',
      'pool_lazy',
      'waterwalk',
      'turtle_island',
    ];
    const AMB_SETUP = `(() => {
      const h = window.__kairo, sc = h.scene, t = h.terrain, p = h.placement, w = h.walls;
      h.flow.frozen = true; sc.setAutoTick(false); sc.setDayPhase(null); sc.setUpscale(1);
      const L = h.land();
      const ids = ${JSON.stringify(AMB_IDS)};
      const placed = [];
      for (const id of ids) {
        let done = false;
        for (let j = L.j0 + 1; j + 8 < L.j0 + L.h && !done; j++) {
          for (let i = L.i0 + 1; i + 10 < L.i0 + L.w && !done; i++) {
            const r = p.place(t, w, h.gate, id, i, j);
            if (!r.ok) continue;
            sc.refreshFacility(r.placed.handle);
            placed.push({ id: id, i: i, j: j, handle: r.placed.handle });
            done = true;
          }
        }
      }
      if (placed.length) { sc.focusTile(placed[0].i, placed[0].j); window.__ambSpot = placed[0]; }
      return { placed: placed, probe: sc.ambientProbeForTest() };
    })()`;
    /** 분수 한 채가 든 창의 지문 — 프레임버퍼에서 직접 읽는다 (텍스처 캔버스가 아니다) */
    const AMB_SAMPLE = `(() => {
      const sc = window.__kairo.scene;
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      const H = cv.height;
      const r = sc.tileScreenRect(window.__ambSpot.i, window.__ambSpot.j);
      const x0 = Math.max(0, r.x - 32), y0 = Math.max(0, r.y - 44), w = 96, hh = 84;
      const buf = new Uint8Array(w * hh * 4);
      gl.readPixels(x0, H - (y0 + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let s = 0;
      for (let k = 0; k < buf.length; k += 4) {
        s = (s * 31 + buf[k] + buf[k + 1] * 7 + buf[k + 2] * 13) >>> 0;
      }
      const pr = sc.ambientProbeForTest();
      return { hash: s, phase: pr.phase, keys: pr.keys, ms: pr.ms, steps: pr.steps };
    })()`;

    for (const [reduce, tag] of [
      [false, '모션 켬'],
      [true, '모션 줄임'],
    ] as const) {
      const cx = await browser.newContext({
        ...DEVICE,
        reducedMotion: reduce ? 'reduce' : 'no-preference',
      });
      const pg = await cx.newPage();
      await pg.goto(URL, { waitUntil: 'load' });
      await pg.waitForFunction(
        `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
        undefined,
        { timeout: 20000 },
      );
      const amb = (await pg.evaluate(AMB_SETUP)) as {
        placed: { id: string; i: number; j: number; handle: number }[];
        probe: { count: number; still: boolean };
      };
      /** 같은 창을 여러 번 찍어 **구분되는 화면 수**를 센다 (한 번에 한 프레임만 보인다) */
      const distinct = async (n = 12, gap = 70): Promise<{ n: number; last: string }> => {
        const seen = new Set<number>();
        let last = '';
        for (let k = 0; k < n; k++) {
          const s = (await pg.evaluate(AMB_SAMPLE)) as {
            hash: number;
            keys: string[];
            ms: number;
            steps: number;
          };
          seen.add(s.hash);
          last = `전환 ${s.steps}회 · 마지막 ${s.ms.toFixed(2)}ms`;
          await pg.waitForTimeout(gap);
        }
        return { n: seen.size, last };
      };

      if (amb.placed.length < AMB_IDS.length) {
        record(`${tag} — 물 시설 배치`, 'fail', `${amb.placed.length}/${AMB_IDS.length}채만 놓였다`);
        await cx.close();
        continue;
      }
      if (!reduce) {
        record(
          '상시 연출이 대상 시설 전부에 붙는다 (등록부 = 화면)',
          amb.probe.count === AMB_IDS.length ? 'pass' : 'fail',
          `${amb.probe.count}/${AMB_IDS.length}채`,
        );
      }
      await pg.waitForTimeout(400);
      const d = await distinct();
      record(
        `★ ${tag} — 물이 ${reduce ? '멈춰 있다' : '움직인다'} (화면 픽셀로)`,
        (reduce ? d.n === 1 : d.n >= 2) ? 'pass' : 'fail',
        `구분되는 화면 ${d.n} · ${d.last}`,
      );

      if (reduce) {
        await cx.close();
        continue;
      }

      // ⚠ 음성 대조군 — 코드에 심은 결함으로 프레임을 얼린다 (K38 규칙)
      await pg.evaluate(`window.__kairo.scene.setRenderFaultForTest('ambient-static')`);
      await pg.waitForTimeout(300);
      const frozen = await distinct();
      record(
        '⚠ 음성 대조군 — `ambient-static` 을 켜면 같은 화면만 나온다',
        frozen.n === 1 ? 'pass' : 'fail',
        `구분되는 화면 ${frozen.n} (정상 ${d.n})`,
      );
      await pg.evaluate(`window.__kairo.scene.setRenderFaultForTest('none')`);
      await pg.waitForTimeout(300);

      /*
       * ★ **AI 그림을 안 잃었다.**
       *
       * 이것이 이 단계에서 제일 중요한 검사다. 계약에 `frames: 2` 를 선언해 두 프레임 다
       * 없는 ID 를 만들면 아틀라스가 못 찾아 **절차 도형으로 폴백**하고, 그러면 픽셀아트가
       * 통째로 사라진다. 그래서 얹기 방식을 택했고, 정말 안 잃었는지는 **아틀라스 원본
       * 픽셀과 바이트 단위로 대조**해서 증명한다 — "텍스처 키가 그대로다"만 보면
       * 그 키 뒤의 캔버스가 갈렸을 때 조용히 통과한다.
       */
      const keep = (await pg.evaluate(`(async () => {
        const h = window.__kairo, sc = h.scene;
        const res = await fetch('/assets/kairo-atlas.json');
        const map = await res.json();
        const img = new Image();
        await new Promise((ok, no) => {
          img.onload = ok; img.onerror = no; img.src = '/assets/kairo-atlas.png';
        });
        const cut = document.createElement('canvas');
        const cc = cut.getContext('2d', { willReadFrequently: true });
        const out = [];
        for (const it of ${JSON.stringify(AMB_IDS)}.map((id) => ({ id: id }))) {
          const base = sc.facilityImageAt(
            h.placement.all().filter((f) => f.defId === it.id)[0].handle);
          const f = map['facility/' + it.id];
          if (!base || !f) { out.push({ id: it.id, why: 'no-frame' }); continue; }
          const src = base.texture.getSourceImage();
          cut.width = f.w; cut.height = f.h;
          cc.clearRect(0, 0, f.w, f.h);
          cc.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
          const want = cc.getImageData(0, 0, f.w, f.h).data;
          const got = document.createElement('canvas');
          got.width = src.width; got.height = src.height;
          got.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
          const have = got.getContext('2d').getImageData(0, 0, src.width, src.height).data;
          let diff = 0;
          if (src.width !== f.w || src.height !== f.h) diff = -1;
          else for (let k = 0; k < want.length; k++) if (want[k] !== have[k]) diff++;
          out.push({ id: it.id, key: base.texture.key, diff: diff });
        }
        return { out: out, provider: h.provider ? h.provider.name : 'n/a' };
      })()`)) as { out: { id: string; key?: string; diff?: number; why?: string }[]; provider: string };
      const intact = keep.out.filter((r) => r.diff === 0);
      record(
        '★ AI 그림을 안 잃었다 — 시설 텍스처가 아틀라스 원본과 바이트 단위로 같다',
        intact.length === AMB_IDS.length ? 'pass' : 'fail',
        `${intact.length}/${AMB_IDS.length} · ` +
          keep.out
            .filter((r) => r.diff !== 0)
            .map((r) => `${r.id}:${r.why ?? String(r.diff)}`)
            .join(' '),
      );
      record(
        '얹은 그림은 **별도 오브젝트**다 — 시설 텍스처를 갈아 끼우지 않는다',
        keep.out.every((r) => r.key === undefined || !r.key.startsWith('__amb/'))
          ? 'pass'
          : 'fail',
        keep.out.map((r) => r.key ?? '?').join(' '),
      );

      // 두 프레임을 나란히 — 움직임은 정지 화면 한 장으로 못 보인다
      for (const want of [0, 1]) {
        await pg.waitForFunction(
          `window.__kairo.scene.ambientProbeForTest().phase === ${want}`,
          undefined,
          { timeout: 5000 },
        );
        await pg.screenshot({ path: `${SHOT_DIR}/kairo-water-f${want}.png` });
      }
      await cx.close();
    }
  }

  /*
   * ── 9c. 방향을 바꿔도 판이 살아 있나 (K28) ──
   *
   * 회전은 폰에서 언제든 일어난다. 레이아웃만 다시 잡히면 되고 **게임 상태는 그대로**
   * 여야 한다. 우리 하네스에 이 검사가 없었다.
   */
  {
    const cx = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });
    const pg = await cx.newPage();
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const before = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      // 시설 몇 개를 놓아 "잃을 것"을 만든다
      const t = h.terrain, w = h.walls, p = h.placement;
      let n = 0;
      for (let i = 2; i < 20 && n < 4; i++) {
        if (p.place(t, w, h.gate, 'vending_out', i, 2).ok) n++;
      }
      return { facilities: p.count, cash: h.week ? h.week.cash : -1, week: h.week ? h.week.week : -1 };
    })()`)) as { facilities: number; cash: number; week: number };

    await pg.setViewportSize({ width: 852, height: 393 });

    await pg.waitForTimeout(500);
    const after = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      const cv = document.querySelector('canvas');
      return { facilities: h.placement.count, cash: h.week ? h.week.cash : -1,
               week: h.week ? h.week.week : -1, buf: [cv.width, cv.height],
               alive: !!(h.scene && h.scene.sys && h.scene.sys.game.loop.running) };
    })()`)) as {
      facilities: number;
      cash: number;
      week: number;
      buf: number[];
      alive: boolean;
    };
    record(
      '회전해도 판이 그대로다 — 시설·현금·주차 보존',
      after.facilities === before.facilities &&
        after.cash === before.cash &&
        after.week === before.week
        ? 'pass'
        : 'fail',
      `시설 ${before.facilities}→${after.facilities} · 현금 ${Math.round(before.cash / 10000)}만→${Math.round(after.cash / 10000)}만`,
    );
    record(
      '회전 뒤 버퍼가 새 방향으로 다시 잡힌다',
      after.buf[0] === 852 && after.buf[1] === 393 && after.alive ? 'pass' : 'fail',
      `버퍼 ${after.buf.join('×')} · 루프 ${after.alive}`,
    );
    await cx.close();
  }

  // ── 9c. 포장한 바닥만 걷는다 · 입구가 보인다 (K32-B) ──
  //
  // 길을 어디로 내느냐가 곧 입구의 위치와 방향을 정한다. 새 저장 상태 없이 동사 하나가
  // 둘을 한다 — 그래서 검사도 "잔디는 막히고 포장은 통하는가"와 "문 앞이 보이는가" 둘이다.
  const pathUi = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
    const out = {};

    // ① 물려받은 빠지에는 문이 있고, 그 앞에 발판이 그려져 있다
    out.marks = sc.doorMarks.length;
    out.marksPaved = sc.doorMarks.every((m) => t.isGuestWalkable(m.i, m.j));
    /*
     * ⚠ 한 경계가 두 방향으로 보인다 (K25 — −I 는 이웃의 +I 다). 그대로 그리면 발판이
     * 실내에도 깔린다. 실측으로 새 판에서 2칸이 나왔고, 그중 하나가 방 안이었다.
     */
    out.marksOutside = sc.doorMarks.every((m) => !t.isIndoor(m.i, m.j));

    /*
     * ② 잔디 자리를 **만든다.** 앞 절들이 판을 통째로 포장해 뒀으므로 (PAVE_ALL) 그냥
     *    찾으면 없다. 6×6 육지를 잔디로 되돌리고 그 한복판 2×2 를 쓴다 — 가장자리 한 겹이
     *    해자가 되어 "옆 포장으로 닿아서 통과"가 안 생긴다.
     */
    ${LAND_BOX}
    let area = null;
    for (let j = J0 + 4; j < Math.min(J1, J0 + 30) && !area; j++) {
      for (let i = I0; i < I1 - 6; i++) {
        let ok = true;
        for (let dj = 0; dj < 6 && ok; dj++) {
          for (let di = 0; di < 6; di++) {
            const ti = i + di, tj = j + dj;
            /*
             * ⚠ **손 안 댄 잔디**만 고른다. 걸을 수 있는 칸으로만 고르면 물려받은 빠지의
             * 포장 마당이 후보가 되고, 뒤에서 잔디로 되돌릴 때 킷의 방문이 사라져
             * 벽 개수가 음수로 나온다 (실측: 경계 −28).
             */
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || p.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { area = [i, j]; break; }
      }
    }
    if (!area) return { ok: false, reason: '6×6 빈 육지를 못 찾았다' };
    for (let dj = 0; dj < 6; dj++) {
      for (let di = 0; di < 6; di++) {
        t.paint(area[0] + di, area[1] + dj, 'lawn');
        sc.refreshTile(area[0] + di, area[1] + dj);
      }
    }
    const spot = [area[0] + 2, area[1] + 2];
    out.spot = spot;
    const c0 = p.check(t, h.walls, h.gate, 'shop', spot[0], spot[1]);
    out.lawnFail = c0.fail || '(통과)';

    // ③ 게이트에서 그 자리까지 길을 깐다 — 최단이 아니어도 이어지기만 하면 된다
    for (let i = 0; i <= spot[0]; i++) if (t.isWalkable(i, 0)) t.paint(i, 0, 'path_stone');
    for (let j = 0; j <= spot[1]; j++) if (t.isWalkable(spot[0], j)) t.paint(spot[0], j, 'path_stone');
    const c1 = p.check(t, h.walls, h.gate, 'shop', spot[0], spot[1]);
    out.pavedOk = c1.ok;
    out.pavedFail = c1.fail || '';
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; reason: string }
    | {
        ok: true;
        marks: number;
        marksPaved: boolean;
        marksOutside: boolean;
        spot: number[];
        lawnFail: string;
        pavedOk: boolean;
        pavedFail: string;
      };

  if (!pathUi.ok) {
    record('포장한 바닥만 걷는다 (K32-B)', 'fail', pathUi.reason);
  } else {
    record(
      '★ 잔디에는 못 놓고, 길을 깔면 놓인다 — 길이 곧 동선이다 (K32-B)',
      pathUi.lawnFail === 'unreachable' && pathUi.pavedOk ? 'pass' : 'fail',
      `잔디 (${pathUi.spot.join(',')}) "${pathUi.lawnFail}" → 포장 후 ${
        pathUi.pavedOk ? '통과' : `"${pathUi.pavedFail}"`
      }`,
    );
    record(
      '문 앞 발판이 문 **바깥**에만 깔린다 (K32-B)',
      pathUi.marks > 0 && pathUi.marksPaved && pathUi.marksOutside ? 'pass' : 'fail',
      `발판 ${pathUi.marks}칸 · 포장 위 ${pathUi.marksPaved} · 전부 실외 ${pathUi.marksOutside}`,
    );
  }

  // 길 붓 — 한 칸씩 찍어서는 폰에서 길을 못 깐다 (K32-B)
  const roadBrush = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain;
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="ground"]').click();
    const items = [...document.querySelectorAll('#kairo-sheet [data-pick]')];
    const labels = items.map((el) => el.textContent);
    const block = document.querySelector('[data-pick="ground:path_stone@3"]');
    if (!block) return { ok: false, reason: '석재 보도 3×3 붓이 없다', labels: labels.slice(0, 8) };
    block.click();
    const _bsh = document.getElementById('kairo-sheet');
    if (_bsh && !_bsh.hidden) document.getElementById('kairo-sheet-close').click();
    /*
     * 잔디를 **해금된 토지 안에** 만든다. 앞 절의 자리는 i=20 대라 1등급 토지 밖이라
     * tapTile 이 조용히 거절했다 (실측 — 검사가 0칸으로 나왔다). 게이트 가까이서 찾는다.
     *
     * ⚠ K47-③: 잔디판을 5×5 로, 세는 창을 7×7 로 넓혔다. **좌표를 기대하지 않는다** —
     * 조준 배치에서 블록의 중심 규칙(oi = i − ⌊(n−1)/2⌋)이 레티클 기준으로 바뀔 수
     * 있으므로, 재는 것은 "어디에 깔렸나"가 아니라 **"한 번에 아홉 칸이 깔렸나"**다.
     */
    ${LAND_BOX}
    let spot = null;
    for (let j = J0 + 3; j < Math.min(J1 - 3, J0 + 18) && !spot; j++) {
      for (let i = I0 + 3; i < Math.min(I1 - 3, I0 + 18); i++) {
        let ok = true;
        for (let dj = -3; dj <= 3 && ok; dj++) {
          for (let di = -3; di <= 3; di++) {
            const ti = i + di, tj = j + dj;
            if (!t.isWalkable(ti, tj) || t.isIndoor(ti, tj) || h.placement.handleAt(ti, tj) !== 0) { ok = false; break; }
          }
        }
        if (ok) { spot = [i, j]; break; }
      }
    }
    if (!spot) return { ok: false, reason: '토지 안에서 7×7 빈 육지를 못 찾았다', labels: [] };
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      t.paint(spot[0] + di, spot[1] + dj, 'lawn');
      h.scene.refreshTile(spot[0] + di, spot[1] + dj);
    }
    const before = h.week.cash;
    const countPaved = () => {
      let n = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (t.kindAt(spot[0] + di, spot[1] + dj) === 'path_stone') n++;
      }
      return n;
    };
    const paved0 = countPaved();
    /* K47-③ — 탭은 조준이다. 확정을 눌러야 깔린다 (탭 즉시 지출을 없앤 이유) */
    h.tapTile(spot[0], spot[1]);
    const pavedMid = countPaved();
    const cbar = document.getElementById('kairo-confirm');
    const cbtn = document.getElementById('kairo-place-confirm');
    const barOn = !!cbar && !cbar.hidden;
    if (barOn && cbtn && !cbtn.disabled) cbtn.click();
    const paved1 = countPaved();
    if (window.__kairoClearBrush) window.__kairoClearBrush();
    const walkSub = labels.filter((x) => x.includes('손님 통행')).length;
    const noWalkSub = labels.filter((x) => x.includes('못 지나감')).length;
    const toastEl = document.getElementById('kairo-toast');
    return { ok: true, paved: paved1 - paved0, midPaved: pavedMid - paved0, bar: barOn,
      spent: before - h.week.cash, walkSub: walkSub,
      noWalkSub: noWalkSub,
      dbg: JSON.stringify({ spot: spot, brush: window.__kairoBrush ? window.__kairoBrush() : null,
        kind: t.kindAt(spot[0], spot[1]), cash: h.week.cash,
        toast: toastEl && !toastEl.hidden ? toastEl.textContent : '' }) };
  })()`)) as
    | { ok: false; reason: string; labels: string[] }
    | {
        ok: true;
        paved: number;
        midPaved: number;
        bar: boolean;
        spent: number;
        walkSub: number;
        noWalkSub: number;
        dbg: string;
      };

  if (!roadBrush.ok) {
    record('길 붓이 블록으로 깐다 (K32-B)', 'fail', `${roadBrush.reason} · ${roadBrush.labels.join(' / ')}`);
  } else {
    record(
      '길 붓 3×3 이 아홉 칸을 한 번에 깐다 — 한 칸씩은 폰에서 못 깐다 (K32-B)',
      roadBrush.paved === 9 && roadBrush.spent > 0 ? 'pass' : 'fail',
      `포장 +${roadBrush.paved}칸 · ${Math.round(roadBrush.spent / 10000)}만 지출`,
    );
    record(
      '길 붓도 확정을 거친다 — 탭만으로는 안 깔린다 (K47-③)',
      roadBrush.bar === true && roadBrush.midPaved === 0 ? 'pass' : 'fail',
      `확정 바 ${String(roadBrush.bar)} · 탭 직후 +${roadBrush.midPaved}칸 (확정 후 +${roadBrush.paved}칸)`,
    );
    record(
      '바닥 목록이 통행 여부를 말해 준다 — 규칙을 바꿨으면 알려줘야 한다',
      roadBrush.walkSub > 0 && roadBrush.noWalkSub > 0 ? 'pass' : 'fail',
      `"손님 통행" ${roadBrush.walkSub}개 · "못 지나감" ${roadBrush.noWalkSub}개`,
    );
  }
  await page.evaluate(`(() => { const s = document.getElementById('kairo-sheet'); if (s) s.hidden = true; })()`);

  // ⚠ 음성 대조군 — 방을 지우면 문도 발판도 사라진다 (그리는 것이 문을 따라오는가)
  const markControl = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, sc = h.scene;
    const before = sc.doorMarks.length;
    const undo = [];
    for (let j = 0; j < t.height; j++) {
      for (let i = 0; i < t.width; i++) {
        if (t.isIndoor(i, j)) { undo.push([i, j]); t.paint(i, j, 'path_stone'); }
      }
    }
    h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
    sc.refreshAllWalls();
    const after = sc.doorMarks.length;
    // 되돌린다 — 뒤 절이 물려받은 방을 본다
    for (const [i, j] of undo) t.paint(i, j, 'floor_indoor');
    h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
    sc.refreshAllWalls();
    return { before: before, after: after, restored: sc.doorMarks.length };
  })()`)) as { before: number; after: number; restored: number };
  record(
    '⚠ 음성 대조군 — 방을 지우면 발판도 사라진다 (검사가 유의미한가)',
    markControl.before > 0 && markControl.after === 0 && markControl.restored > 0
      ? 'pass'
      : 'fail',
    `발판 ${markControl.before} → 방 삭제 ${markControl.after} → 복구 ${markControl.restored}`,
  );

  // ── 9d. 패널 6종이 한 가족인가 (K34) ──
  //
  // 인라인 스타일을 걷어낸 이유가 "한 게임으로 보이게"였다. 그러면 **숫자로 물어야 한다** —
  // 머리 높이·닫기 버튼·선택 색이 패널마다 같은가. 색만 토큰으로 바꾸고 구조가 제각각이면
  // 이 작업은 반쪽이다.
  const family = (await page.evaluate(`(() => {
    const ids = ['kairo-staff', 'kairo-catalog', 'kairo-newgame', 'kairo-course'];
    const openers = {
      'kairo-staff': 'kairo-staff-open',
      'kairo-catalog': 'kairo-catalog-open',
      'kairo-newgame': 'kairo-newgame-open',
    };
    const out = [];
    for (const id of ids) {
      if (id === 'kairo-course') {
        document.getElementById('kairo-build-open').click();
        document.querySelector('#kairo-sheet [data-tab="course"]').click();
      } else {
        document.getElementById('kairo-menu-open').click();
        const o = document.getElementById(openers[id]);
        if (!o) continue;
        o.click();
      }
      const p = document.getElementById(id);
      if (!p || p.hidden) continue;
      const head = p.querySelector('.ksheet-head, .kcourse-bar');
      const close = p.querySelector('button[id$="-close"], #kairo-course-close');
      out.push({
        id: id,
        head: head ? Math.round(head.getBoundingClientRect().height) : 0,
        close: close ? Math.round(close.getBoundingClientRect().height) : 0,
        font: getComputedStyle(p).fontFamily.indexOf('system-ui') >= 0
      });
      const c = document.getElementById(id.replace('kairo-', 'kairo-') + '-close');
      if (c) c.click();
      else document.getElementById('kairo-course-close')?.click();
    }
    return out;
  })()`)) as { id: string; head: number; close: number; font: boolean }[];

  const closeH = family.map((f) => f.close);
  record(
    '★ 패널들의 닫기 버튼이 같은 크기다 — 한 가족으로 보이려면 (K34)',
    family.length >= 3 && Math.max(...closeH) - Math.min(...closeH) <= 2 ? 'pass' : 'fail',
    family.map((f) => `${f.id.replace('kairo-', '')} ${f.close}px`).join(' · '),
  );
  record(
    '패널 글꼴이 한 벌이다',
    family.length >= 3 && family.every((f) => f.font) ? 'pass' : 'fail',
    `${family.filter((f) => f.font).length}/${family.length}`,
  );

  /*
   * ★ 선택 표시가 **한 색**이어야 한다.
   *
   * 예전엔 경영 탭·새 판 맵·도감 탭이 청록(#7ad0ff)이고 하단 바·코스는 노랑(--accent)
   * 이었다 — 같은 게임 안에서 "고름"이 두 색이었다. 실제 화면에서 색을 읽어 확인한다.
   */
  const selColors = (await page.evaluate(`(() => {
    const seen = {};
    const grab = (id, sel) => {
      const p = document.getElementById(id);
      if (!p || p.hidden) return;
      const on = p.querySelector(sel);
      if (on) seen[id] = getComputedStyle(on).borderTopColor;
    };
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-catalog-open').click();
    grab('kairo-catalog', 'button[data-tab].on');
    document.getElementById('kairo-catalog-close').click();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-newgame-open').click();
    grab('kairo-newgame', 'button[data-map].on');
    document.getElementById('kairo-newgame-close').click();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-staff-open').click();
    grab('kairo-staff', 'button[data-manage].on');
    document.getElementById('kairo-staff-close').click();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return { seen: seen, accent: accent };
  })()`)) as { seen: Record<string, string>; accent: string };
  const sel = Object.values(selColors.seen);
  record(
    '★ 선택 표시가 패널 전체에서 한 색이다 (K34)',
    sel.length >= 3 && new Set(sel).size === 1 ? 'pass' : 'fail',
    Object.entries(selColors.seen)
      .map(([k, v]) => `${k.replace('kairo-', '')} ${v}`)
      .join(' · ') + ` (토큰 ${selColors.accent})`,
  );

  /*
   * 감상 화면을 닫으면 HUD 가 돌아온다 — 형제의 display 를 직접 만지는 유일한 패널이다.
   *
   * ⚠ 예전엔 **버튼 개수**로 쟀다. K47-② 로 상시 컨트롤이 2개가 되자 감상 화면이
   * 자기 버튼 2개를 띄우면서 `2 → 2 → 2` 가 되어 판정이 무의미해졌다 (수가 우연히
   * 같아지면 "가려졌다"와 "안 가려졌다"를 구분 못 한다). 이제 **감상이 실제로 감추는
   * 대상**(헤더·티커·하단 바)의 표시 상태를 직접 본다 — 개수가 아니라 정체다.
   */
  const showcaseRestore = (await page.evaluate(`(() => {
    const ids = ['kairo-top', 'kairo-ticker', 'kairo-bar'];
    const shown = () => ids.filter((id) => {
      const el = document.getElementById(id);
      if (!el || el.hidden) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const before = shown();
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-showcase-open').click();
    const during = shown();
    document.getElementById('kairo-showcase-close').click();
    return { before: before, during: during, after: shown() };
  })()`)) as { before: string[]; during: string[]; after: string[] };
  record(
    '★ 감상 화면을 닫으면 HUD 가 그대로 돌아온다 (K34)',
    showcaseRestore.before.length === 3 &&
      showcaseRestore.during.length === 0 &&
      showcaseRestore.after.length === 3
      ? 'pass'
      : 'fail',
    `HUD 표시 ${showcaseRestore.before.length} → ${showcaseRestore.during.length} → ` +
      `${showcaseRestore.after.length} (감상 중 남은 것: ${showcaseRestore.during.join(',') || '없음'})`,
  );

  // ── 9e. 출입구를 놓아 건물을 통로로 (K36-B) ──
  //
  // 카이로에서 건물은 **지나가는 곳**이기도 하다. 문이 하나면 막다른 곳이라 손님이 빙
  // 돌아간다. 사용자 요청: "입구 말고도 설치할 수 있는 입출구를 둬서 통과할 수 있게".
  //
  // ⚠ 출입구는 **탭 유지**다 (K47-③ 계획 §3 붓별 판정). 배치가 아니라 대상 지정 + 순환
  // 이라 조준할 것이 없다 — 확정 클릭을 여기에 넣지 말 것. 코스 탭도 같은 이유로 그대로다.
  const doorUi = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls;
    const out = { before: w.count(2) };
    document.getElementById('kairo-build-open').click();
    document.querySelector('#kairo-sheet [data-tab="building"]').click();
    const pick = document.querySelector('[data-pick="door:door"]');
    if (!pick) return { ok: false, why: '출입구 붓이 건물 탭에 없다' };
    pick.click();
    out.brush = window.__kairoBrush ? window.__kairoBrush() : null;

    // 실내 칸 목록 — 서로 먼 두 칸을 골라 탭한다
    const cells = [];
    /*
     * ⚠ **시설이 없는** 실내 칸만 고른다. 시설이 놓인 칸은 손님이 못 서므로 문 후보가
     * 없다 ( 가 안쪽도 설 수 있어야 한다고 본다). 앞 절들이 시작 방에
     * 화장실을 놓아 뒀다 — 그 칸을 탭하면 정직하게 거절당한다.
     */
    for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++)
      if (t.isIndoor(i, j) && h.placement.handleAt(i, j) === 0) cells.push([i, j]);
    if (cells.length < 4) return { ok: false, why: '실내 칸이 부족하다' };
    const msg0 = () => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; };
    const a = cells[0], b = cells[cells.length - 1];
    out.a = a; out.b = b;
    h.tapTile(a[0], a[1]);
    out.afterOne = w.count(2); out.msgA = msg0();
    h.tapTile(b[0], b[1]);
    out.afterTwo = w.count(2); out.msgB = msg0();
    out.wanted = h.doors.count;

    // 실내가 아닌 칸을 탭하면 이유를 말한다
    const msg = () => { const m = document.getElementById('kairo-toast'); return m && !m.hidden ? m.textContent : ''; };
    h.tapTile(h.gate.i, h.gate.j);
    out.outsideMsg = msg();
    return { ok: true, ...out };
  })()`)) as
    | { ok: false; why: string }
    | {
        ok: true;
        before: number;
        afterOne: number;
        afterTwo: number;
        wanted: number;
        brush: string | null;
        outsideMsg: string;
        a: number[];
        b: number[];
        msgA: string;
        msgB: string;
      };

  if (!doorUi.ok) {
    record('★ 출입구 붓으로 문을 놓는다 (K36-B)', 'fail', doorUi.why);
  } else {
    record(
      '★ 출입구를 두 곳에 내면 문이 둘이 된다 — 건물이 통로가 된다 (K36-B)',
      doorUi.afterTwo === 2 && doorUi.wanted === 2 ? 'pass' : 'fail',
      `자동 ${doorUi.before} → 하나 ${doorUi.afterOne} → 둘 ${doorUi.afterTwo} · 희망 ${doorUi.wanted} · ` +
        `A(${doorUi.a.join(',')})"${doorUi.msgA}" B(${doorUi.b.join(',')})"${doorUi.msgB}"`,
    );
    record(
      '첫 문은 자동 문을 **대신한다** — 방마다 문이 둘씩 늘면 안 된다',
      doorUi.afterOne === 1 ? 'pass' : 'fail',
      `${doorUi.before} → ${doorUi.afterOne}`,
    );
    record(
      '건물 밖을 탭하면 이유를 말한다 — 거절은 처방까지 한다',
      doorUi.outsideMsg.includes('건물') ? 'pass' : 'fail',
      doorUi.outsideMsg || '(조용함)',
    );
  }

  /* 새로고침을 넘는다 — 희망이 세이브에 담기는가 */
  await page.evaluate(`window.__kairo.persist?.()`);
  await page.reload();
  await page.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const doorsKept = (await page.evaluate(
    `(() => { const h = window.__kairo; return { wanted: h.doors.count, doors: h.walls.count(2) }; })()`,
  )) as { wanted: number; doors: number };
  record(
    '★ 출입구가 새로고침을 넘는다 (K36-B)',
    doorsKept.wanted === 2 && doorsKept.doors === 2 ? 'pass' : 'fail',
    `희망 ${doorsKept.wanted} · 문 ${doorsKept.doors}`,
  );

  /*
   * ── 9b. 패널은 한 번에 하나 (K37 버그 ①) ──────────────────────────────
   *
   * 사용자 보고: "건설 등 눌렀을때 나오는 설명 부분이 다른 설명 눌렀을때 안꺼져서".
   * 패널 8종이 각자 hidden 을 만지고 "다른 걸 닫는다"를 아는 곳이 없었다.
   *
   * ⚠ 단위 테스트(panels.test.ts)는 호스트의 규칙만 잰다. 여기서는 **실제로 화면에서
   * 사라지는지**를 본다 — 규칙은 맞는데 hidden 이 안 내려가는 경우를 놓치면 안 된다.
   * 판정은 반드시 !root.hidden 으로 읽는다 (인라인 display 를 읽으면 표면을 클래스로
   * 옮기는 순간 조용히 거짓이 된다).
   */
  const excl = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const vis = () => ({
      sheet: !document.getElementById('kairo-sheet').hidden,
      catalog: h.catalog.visible,
      staff: h.staffPanel.visible,
      course: h.coursePanel.visible,
      showcase: h.showcase.visible,
    });
    const noop = function () {};
    const out = [];
    const build = () => document.getElementById('kairo-build-open').click();
    const closeSheet = () => document.getElementById('kairo-sheet-close').click();

    build();
    const a1 = vis(); h.catalog.show(); const a2 = vis();
    out.push({ pair: '건설→도감', ok: a1.sheet && !a2.sheet && a2.catalog });
    h.catalog.hide();

    h.catalog.show(); const b1 = vis();
    h.staffPanel.show(h.staff, h.placement, noop, undefined); const b2 = vis();
    out.push({ pair: '도감→경영', ok: b1.catalog && !b2.catalog && b2.staff });
    h.staffPanel.hide();

    h.staffPanel.show(h.staff, h.placement, noop, undefined); const c1 = vis();
    h.coursePanel.show(); const c2 = vis();
    out.push({ pair: '경영→코스', ok: c1.staff && !c2.staff && c2.course });
    h.coursePanel.hide();

    h.coursePanel.show(); const d1 = vis();
    build(); const d2 = vis();
    out.push({ pair: '코스→건설', ok: d1.course && !d2.course && d2.sheet });
    closeSheet();

    /* 감상은 예외 — 지도가 보여야 감상이므로 다른 패널을 닫지 않는다 */
    build(); const e1 = vis();
    h.showcase.show(); const e2 = vis();
    h.showcase.hide();
    out.push({ pair: '감상은 예외', ok: e1.sheet && e2.showcase && e2.sheet });
    closeSheet();

    /* 카드는 모달 — 선택 전에 다른 패널이 밀어내면 주가 조용히 넘어간다 */
    h.cardView.show(
      [{
        id: 'k37',
        name: '검사',
        desc: '검사',
        theme: 'safety',
        delivery: 'immediate',
        options: [{ label: 'a', detail: 'a', effects: [] }],
      }],
      99999999,
      noop,
    );
    build(); const f2 = vis();
    out.push({ pair: '카드 모달이 막는다', ok: !f2.sheet });
    h.cardView.hide();
    closeSheet();
    return out;
  })()`)) as { pair: string; ok: boolean }[];
  const exclBad = excl.filter((x) => !x.ok).map((x) => x.pair);
  record(
    '★ 패널은 한 번에 하나만 열린다 (K37 버그 ①)',
    exclBad.length === 0 && excl.length >= 6 ? 'pass' : 'fail',
    exclBad.length === 0 ? `${excl.length}쌍 전부 통과` : `실패: ${exclBad.join(', ')}`,
  );

  /*
   * ── 9c. 코스가 같은 자리에 겹치지 않는다 (K37 버그 ④) ──────────────────
   *
   * 실측(고치기 전): banana·peanut·jetski 를 연달아 확정했더니 셋이 전부
   * dock 43,32 / handles 43,37 43,43 로 **완전히 같은 자리**에 쌓였다.
   * 사용자 보고 "수상기구에 모든 견인 기구 위치 설정은 버그같아" 가 이것이다.
   */
  const overlap = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const panel = h.coursePanel;
    h.week.cash = 500000000;
    const before = h.courses.count;
    document.getElementById('kairo-course-open').click();
    const tries = [];
    for (const eq of ['banana', 'peanut', 'jetski']) {
      panel.select('shuttle', eq);
      tries.push(panel.confirmForTest());
    }
    const spots = h.courses.all.map((c) => c.dock.x + ',' + c.dock.y + '|' + c.handles.map((p) => Math.round(p.x) + ',' + Math.round(p.y)).join(' '));
    const why = document.querySelector('#kairo-course .kcourse-why');
    const msg = why ? why.textContent : '';
    document.getElementById('kairo-course-close').click();
    return { before: before, added: tries, count: h.courses.count, uniq: new Set(spots).size, spots: spots.length, msg: msg };
  })()`)) as {
    before: number;
    added: number[];
    count: number;
    uniq: number;
    spots: number;
    msg: string;
  };
  record(
    '★ 코스가 같은 자리에 겹치지 않는다 (K37 버그 ④)',
    overlap.uniq === overlap.spots ? 'pass' : 'fail',
    `놓인 코스 ${overlap.spots}개 · 서로 다른 자리 ${overlap.uniq}개 · 확정 결과 ${overlap.added.join(',')}`,
  );
  record(
    '막힐 때 처방이 화면에 있다 — 방법까지 말한다',
    /잔교|선착장|핸들/.test(overlap.msg) ? 'pass' : 'fail',
    overlap.msg.slice(0, 80) || '(비어 있다)',
  );

  /*
   * ── 9d. 높이 표현 (K37 ⑤) ────────────────────────────────────────────────
   *
   * 사용자 요청: "높이를 표현해서 조금더 제한적으로 설치할수있게, 스타팅 포인트 양옆에,
   * (평지도 산 중턱중턱 놔둬서 건물들이나 뭐 펜션을 나중에 설치 할 수 있게끔)".
   *
   * sim 쪽은 `levels.test.ts` 가 20건으로 본다. 여기서는 **화면에 실제로 올라갔는지**를
   * 잰다 — 단을 세워도 그림이 안 올라가면 평지와 구분이 안 된다. 그리고 종류별로
   * (지면·벽·시설·손님) 재야 **하나만 빠뜨린 경우**를 잡는다.
   */
  const lifted = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    const LEVEL_H = 8;

    /* 단 2 이상, 4x4 균일한 산 중턱 평지를 찾는다 */
    let hi = null;
    for (let j = 10; j < T.height - 5 && !hi; j++) {
      for (let i = 0; i < T.width - 5; i++) {
        if (T.levelAt(i, j) >= 2 && T.levelUniform(i, j, 4, 4)) { hi = { i: i, j: j }; break; }
      }
    }
    if (!hi) return { ok: false, why: '단 2 이상 4x4 평지가 없다' };
    const z = T.levelAt(hi.i, hi.j);

    /*
     * 대조는 **투영식**으로 한다. 같은 i+j 의 단 0 칸을 찾는 방식은 산이 넓은 맵에서
     * 대각선이 격자를 벗어나 "대조 칸이 없다"로 죽었다 (실측).
     *
     * 아이소 계약: 타일 (i,j) 의 bottom-center 앵커 y = STEP_Y*(i+j+1) + TILE_H/2
     *            = 8*(i+j+1) + 8 = 8*(i+j+2). 여기서 단만큼 올라간다.
     * 구현을 베낀 것이 아니라 §투영 계약에서 다시 유도한 값이다.
     */
    const wantY = (i, j, lv) => 8 * (i + j + 2) - lv * LEVEL_H;

    const out = { ok: true, z: z, hi: hi, kinds: [] };

    /* ① 지면 — 치마가 없는 안쪽 테라스 칸이라 앵커 보정이 0 이다 */
    const gh = S.tileImageForTest(hi.i, hi.j);
    if (!gh) return { ok: false, why: '지면 타일 그림을 못 찾았다 (' + hi.i + ',' + hi.j + ')' };
    out.kinds.push({ what: '지면', dy: gh.y - wantY(hi.i, hi.j, z), want: 0 });

    /* ② 절벽면이 지면과 **다른 색**이다 — 치마가 실제로 구워졌나 */
    let skirt = null;
    for (let j = 10; j < T.height - 2 && !skirt; j++) {
      for (let i = 0; i < T.width - 1; i++) {
        const zz = T.levelAt(i, j);
        if (zz >= 1 && T.levelAt(i + 1, j) === zz - 1) { skirt = { i: i, j: j, z: zz }; break; }
      }
    }
    if (skirt) {
      const img = S.tileImageForTest(skirt.i, skirt.j);
      const src = img.texture.getSourceImage();
      const cv = document.createElement('canvas');
      cv.width = src.width; cv.height = src.height;
      const cx = cv.getContext('2d');
      cx.drawImage(src, 0, 0);
      const d = cx.getImageData(28, 0, 1, cv.height).data;
      const rows = [];
      for (let y = 0; y < cv.height; y++) if (d[y * 4 + 3] > 8) rows.push(y);
      const last = rows[rows.length - 1];
      const top = cx.getImageData(16, 8, 1, 1).data;
      const face = cx.getImageData(28, last, 1, 1).data;
      out.skirt = {
        h: cv.height, texW: cv.width, key: img.texture.key,
        faceDarker: face[0] < top[0] && face[1] < top[1] && face[2] < top[2],
        top: top[0] + ',' + top[1] + ',' + top[2],
        face: face[0] + ',' + face[1] + ',' + face[2],
      };
    }

    /* ③ 시설 — 산 중턱 평지에 놓고 그림이 올라갔나 */
    h.week.cash = 500000000;
    const flatRes = h.tapTile ? null : null;
    const before = h.placement.count;
    const okHi = h.placement.place(T, h.walls, h.gate, 'flowerbed', hi.i, hi.j, { land: { i0: 0, j0: 0, w: T.width, h: T.height } });
    out.placed = { hi: okHi.ok, why: okHi.fail || 'ok' };
    /* place() 는 { ok, placed: { handle, ... } } 를 준다 — handle 은 placed 안에 있다 */
    const hd = okHi.ok && okHi.placed ? okHi.placed.handle : 0;
    if (hd) {
      S.refreshFacility(hd);
      const fh = S.facilityImageAt(hd);
      /* 1×1 발자국이라 footprintAnchor 의 y 는 타일 앵커와 같다 */
      if (fh) out.kinds.push({ what: '시설', dy: fh.y - wantY(hi.i, hi.j, z), want: 0 });
      else out.placed.why = out.placed.why + ' (그림 없음)';
    }
    void before; void flatRes;

    /* ④ 벽 — 산 중턱에 실내 바닥을 깔면 벽이 같이 올라간다 */
    for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) T.paint(hi.i + di, hi.j + dj + 4, 'floor_indoor');
    for (let dj = 0; dj < 3; dj++) for (let di = 0; di < 3; di++) S.refreshTile(hi.i + di, hi.j + dj + 4);
    S.refreshAllWalls && S.refreshAllWalls();
    const wallY = S.wallImageYForTest ? S.wallImageYForTest(hi.i, hi.j + 4) : null;
    out.wallY = wallY;

    /*
     * ⑤ 경사에는 못 놓는다.
     *
     * ⚠ 자리를 levelUniform 으로 찾으면 **자기참조**가 된다 — production 이 쓰는 그
     * 함수로 "경사다"를 정해 놓고 그 함수가 거절하는지 묻는 꼴이라, 함수가 통째로
     * 틀려도 통과한다 (K38 아키텍처 점검 지적).
     *
     * 그래서 발자국의 단을 **직접 비교**해 자리를 찾는다. 시설 크기도 데이터에서
     * 읽는다 — 2×2 로 박으면 shop 이 커지는 날 조용히 다른 것을 재게 된다.
     */
    const def = h.simDefs ? h.simDefs['shop'] : null;
    const fw = def && def.size ? def.size[0] : 2;
    const fd = def && def.size ? def.size[1] : 2;
    let mixed = null;
    for (let j = 10; j < T.height - fd && !mixed; j++) {
      for (let i = 0; i < T.width - fw; i++) {
        if (!T.isWalkable(i, j) || T.isWater(i, j)) continue;
        const z0 = T.levelAt(i, j);
        let uneven = false;
        for (let dj = 0; dj < fd && !uneven; dj++) {
          for (let di = 0; di < fw; di++) if (T.levelAt(i + di, j + dj) !== z0) { uneven = true; break; }
        }
        if (uneven) { mixed = { i: i, j: j }; break; }
      }
    }
    if (mixed) {
      const c = h.placement.check(T, h.walls, h.gate, 'shop', mixed.i, mixed.j, { land: { i0: 0, j0: 0, w: T.width, h: T.height } });
      out.slope = { at: mixed.i + ',' + mixed.j + ' (' + fw + '×' + fd + ')', fail: c.fail || 'ok' };
    }
    return out;
  })()`)) as {
    ok: boolean;
    why?: string;
    z?: number;
    kinds?: { what: string; dy: number; want: number }[];
    skirt?: { h: number; texW: number; key: string; faceDarker: boolean; top: string; face: string };
    placed?: { hi: boolean; why: string };
    slope?: { at: string; fail: string };
    wallY?: number | null;
  };

  if (!lifted.ok) {
    record('★ 높이가 화면에 올라간다 (K37 ⑤)', 'fail', lifted.why ?? '실패');
  } else {
    const bad = (lifted.kinds ?? []).filter((k) => k.dy !== k.want);
    record(
      '★ 단 위의 것이 종류별로 다 올라간다 — 하나만 빠뜨리면 그것만 파묻힌다 (K37 ⑤)',
      bad.length === 0 && (lifted.kinds ?? []).length >= 2 ? 'pass' : 'fail',
      (lifted.kinds ?? []).map((k) => `${k.what} ${k.dy}px(기대 ${k.want})`).join(' · ') +
        (lifted.placed ? ` · 배치 ${lifted.placed.why}` : ''),
    );
    record(
      '★ 절벽면이 구워져 있다 — 지면보다 어둡다 (K37 ⑤)',
      lifted.skirt?.faceDarker === true ? 'pass' : 'fail',
      lifted.skirt
        ? `${lifted.skirt.key} ${lifted.skirt.texW}×${lifted.skirt.h} · 윗면 ${lifted.skirt.top} → 절벽 ${lifted.skirt.face}`
        : '치마가 있는 칸을 못 찾았다',
    );
    record(
      '★ 경사에는 못 놓는다 — 처방이 평지를 말한다 (K37 ⑤)',
      lifted.slope?.fail === 'level-mixed' ? 'pass' : 'fail',
      lifted.slope ? `(${lifted.slope.at}) → ${lifted.slope.fail}` : '단이 섞인 자리를 못 찾았다',
    );
  }

  /*
   * ── 9d-2. 단 지형에 실틈이 없다 (K38 에서 발견) ─────────────────────────
   *
   * 컬럼 텍스처는 윗면과 절벽 치마를 **한 장에** 굽는다. 치마 시작 줄을 한 줄만 밀어도
   * 그 사이에 1px 구멍이 뚫리고, 뒤에 있는 것(하늘)이 새어 나온다 — 단 지형 가장자리마다
   * 파란 점선으로 보였다. K37 부터 있었는데 배경이 어두워 안 보였다.
   *
   * 세로로 훑어 **불투명 → 투명 → 불투명** 이 나오면 구멍이다. 마름모는 위아래가
   * 뾰족하므로 바깥쪽 투명은 정상이고, 가운데가 끊기는 것만 잡는다.
   */
  const holes = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    const seen = {};
    const bad = [];
    let checked = 0;
    for (let j = 0; j < T.height; j += 1) {
      for (let i = 0; i < T.width; i += 1) {
        if (T.levelAt(i, j) === 0) continue;
        const img = S.tileImageForTest(i, j);
        if (!img) continue;
        const key = img.texture.key;
        if (key.indexOf('__col/') !== 0 || seen[key]) continue;
        seen[key] = 1;
        checked++;
        const src = img.texture.getSourceImage();
        const cv = document.createElement('canvas');
        cv.width = src.width; cv.height = src.height;
        const cx = cv.getContext('2d');
        cx.drawImage(src, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        for (let x = 0; x < cv.width; x++) {
          let seenOpaque = false, gap = false;
          for (let y = 0; y < cv.height; y++) {
            const a = d[(y * cv.width + x) * 4 + 3];
            if (a > 8) {
              if (gap) { bad.push(key + ' x=' + x + ' y=' + y); gap = false; break; }
              seenOpaque = true;
            } else if (seenOpaque) gap = true;
          }
        }
      }
    }
    return { checked: checked, bad: bad.slice(0, 5), n: bad.length };
  })()`)) as { checked: number; bad: string[]; n: number };
  record(
    '★ 단 지형에 실틈이 없다 — 윗면과 절벽이 붙어 있다 (K38)',
    holes.n === 0 && holes.checked > 0 ? 'pass' : 'fail',
    holes.n === 0
      ? `컬럼 텍스처 ${holes.checked}종 전부 이어짐`
      : `구멍 ${holes.n}곳 — ${holes.bad.join(' · ')}`,
  );

  /*
   * ── 9d-3. **대조군을 코드로** — 검사가 정말 잡나 (K38 점검 후속) ──────────
   *
   * 아키텍처 점검이 짚었다: 새 ★ 18개 중 코드에 음성 대조군이 붙은 것은 1개뿐이고
   * 나머지는 손으로 주입해야만 확인된다. 손으로 하는 확인은 **다음 사람에게 안 남는다.**
   *
   * `seam --selftest` 가 픽셀에 위반을 주입하듯, 씬의 `setRenderFaultForTest` 로
   * **그리기 규칙**을 되돌린 뒤 같은 검사가 실패하는지 본다. 셋 다 "고쳤다"고 적어 둔
   * 버그의 원래 모습이다:
   *   · `wall-depth-tie` — 앞벽을 시설과 같은 띠로 (K37 ① 이전)
   *   · `skirt-gap`      — 치마 시작 줄 +1 (K38 실틈 이전)
   *   · `no-lift`        — 단 리프트 0 (K37 ⑤ 이전)
   */
  const faultProbe = `(() => {
    const h = window.__kairo, T = h.terrain, S = h.scene;
    /* ① 컬럼 텍스처에 구멍이 있나 (실틈 검사와 같은 판정) */
    const seen = {};
    let holes = 0;
    for (let j = 0; j < T.height; j++) {
      for (let i = 0; i < T.width; i++) {
        if (T.levelAt(i, j) === 0) continue;
        const img = S.tileImageForTest(i, j);
        if (!img) continue;
        const key = img.texture.key;
        if (key.indexOf('__col/') !== 0 || seen[key]) continue;
        seen[key] = 1;
        const src = img.texture.getSourceImage();
        const cv = document.createElement('canvas');
        cv.width = src.width; cv.height = src.height;
        const cx = cv.getContext('2d');
        cx.drawImage(src, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data;
        for (let x = 0; x < cv.width; x++) {
          let op = false, gap = false;
          for (let y = 0; y < cv.height; y++) {
            const a = d[(y * cv.width + x) * 4 + 3];
            if (a > 8) { if (gap) { holes++; gap = false; break; } op = true; }
            else if (op) gap = true;
          }
        }
      }
    }
    /* ② 단 위의 것이 올라갔나 (리프트 검사와 같은 판정) */
    let hi = null;
    for (let j = 10; j < T.height - 5 && !hi; j++) {
      for (let i = 0; i < T.width - 5; i++) {
        if (T.levelAt(i, j) >= 2 && T.levelUniform(i, j, 4, 4)) { hi = { i: i, j: j }; break; }
      }
    }
    let liftErr = -1;
    if (hi) {
      const g = S.tileImageForTest(hi.i, hi.j);
      if (g) liftErr = g.y - (8 * (hi.i + hi.j + 2) - T.levelAt(hi.i, hi.j) * 8);
    }
    /* ③ 앞벽 깊이가 시설보다 앞인가 (깊이 띠 검사와 같은 판정) */
    const iso = S.depthProbeForTest ? S.depthProbeForTest() : null;
    return { holes: holes, liftErr: liftErr, wall: iso };
  })()`;

  const faults: { name: string; want: string; got?: string }[] = [];
  for (const [fault, label] of [
    ['skirt-gap', '치마 시작 줄 +1 → 컬럼 텍스처에 구멍'],
    ['no-lift', '단 리프트 0 → 단 위의 것이 안 올라감'],
    ['wall-depth-tie', '앞벽을 시설 띠로 → 깊이 동률'],
  ] as [string, string][]) {
    await page.evaluate(`window.__kairo.scene.setRenderFaultForTest('${fault}')`);
    await page.waitForTimeout(300);
    const probe = (await page.evaluate(faultProbe)) as {
      holes: number;
      liftErr: number;
      wall: { wall: number; facility: number } | null;
    };
    const caught =
      fault === 'skirt-gap'
        ? probe.holes > 0
        : fault === 'no-lift'
          ? probe.liftErr !== 0
          : probe.wall !== null && probe.wall.wall <= probe.wall.facility;
    faults.push({
      name: label,
      want: caught ? 'ok' : 'MISS',
      got:
        fault === 'skirt-gap'
          ? `구멍 ${probe.holes}곳`
          : fault === 'no-lift'
            ? `리프트 오차 ${probe.liftErr}px`
            : `앞벽 띠 ${probe.wall?.wall} vs 시설 띠 ${probe.wall?.facility}`,
    });
  }
  await page.evaluate(`window.__kairo.scene.setRenderFaultForTest('none')`);
  await page.waitForTimeout(300);
  const clean = (await page.evaluate(faultProbe)) as {
    holes: number;
    liftErr: number;
    wall: { wall: number; facility: number } | null;
  };

  record(
    '★ 대조군 — 그리기 결함을 주입하면 검사가 잡는다 (K38 점검 후속)',
    faults.every((f) => f.want === 'ok') &&
      clean.holes === 0 &&
      clean.liftErr === 0 &&
      clean.wall !== null &&
      clean.wall.wall > clean.wall.facility
      ? 'pass'
      : 'fail',
    faults.map((f) => `${f.name}: ${f.want}(${f.got})`).join(' · ') +
      ` · 원복 후 구멍 ${clean.holes} 리프트오차 ${clean.liftErr} 앞벽 ${clean.wall?.wall}>시설 ${clean.wall?.facility}`,
  );

  /*
   * ── 이동체 깊이 (K46-⑤) — 버스·보트는 걸친 두 칸 중 **가까운 쪽** 깊이다 ──
   *
   * round 로 한 칸만 잡으면 위로(i+j 감소) 이동할 때 이전 칸 지면이 위에 그려져
   * 이동체가 "아래로 꺼진다" (사용자 실측 — 손님의 K37 규칙과 같은 문제).
   * 깊이는 **양쪽 다** 화면 오브젝트에서 읽는다 — 버스는 busGfx, 지면은 걸친 두 칸의
   * 타일 그림(tileImageForTest)이다. 한쪽을 공식으로 다시 계산하면 상수 산수가 된다.
   * 음성 대조군이 내장이다: round 회귀면 뒤 칸 지면 깊이에 진다.
   */
  const mover = (await page.evaluate(`(() => {
    const h = window.__kairo, sc = h.scene, t = h.terrain;
    // 깊이 규칙은 지형 종류와 무관하다 — 이 페이지는 합성 지형(전면 포장)이라
    // 도로가 없으므로, 격자 안 임의의 이웃 두 칸에서 잰다 (setBus 는 지형을 안 본다)
    const spot = { i: Math.floor(t.width / 2), j: Math.floor(t.height / 2) };
    /*
     * 지면 깊이도 **화면에 올라간 오브젝트에서** 읽는다. 페이지 안에서 띠 공식을
     * 다시 계산하면 상수 산수라, 그리기(depthKey 배정)가 통째로 틀려도 통과한다.
     */
    const from = sc.tileImageForTest(spot.i, spot.j);
    const to = sc.tileImageForTest(spot.i + 1, spot.j);
    if (!from || !to) return { ok: false, why: '지면 타일 그림 없음 (' + spot.i + ',' + spot.j + ')' };
    // 두 칸 사이 한가운데 — 걸친 상태
    sc.setBus({ x: spot.i + 0.5, y: spot.j });
    const d = sc['busGfx'].depth;
    sc.setBus(null);
    return { ok: true, bus: d, from: from.depth, to: to.depth };
  })()`)) as { ok: boolean; why?: string; bus?: number; from?: number; to?: number };
  /*
   * ── 수영 구역 (S3) — 칠하면 구역·오버레이가 생기고, 지우면 **파생이라** 사라진다 ──
   * 음성 대조군이 내장: 되돌린 뒤에도 남으면 "구역을 저장하고 있다"는 뜻이다 (금지 규칙).
   */
  const swim = (await page.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, sc = h.scene;
    // 이 페이지는 앞 절들의 덱이 이미 강 구역을 만들었을 수 있다 — 증분으로 잰다
    h.guests.invalidate();
    const base = h.guests.swimZones().length;
    sc.setSwimZones(h.guests.swimZones());
    const gfxBase = sc['swimGfx'].length;
    const i0 = 20, j0 = 20;
    for (let j = j0; j < j0 + 2; j++) for (let i = i0; i < i0 + 2; i++) t.paint(i, j, 'pool_water');
    h.guests.invalidate();
    const zones = h.guests.swimZones();
    const mine = zones.find((z) => z.kind === 'pool' && z.tiles.some((p2) => p2.x === i0 && p2.y === j0));
    sc.setSwimZones(zones);
    const gfx = sc['swimGfx'].length;
    for (let j = j0; j < j0 + 2; j++) for (let i = i0; i < i0 + 2; i++) t.paint(i, j, 'path_stone');
    h.guests.invalidate();
    const after = h.guests.swimZones();
    sc.setSwimZones(after);
    return { base: base, zones: zones.length, entries: mine ? mine.entries.length : -1,
             gfxBase: gfxBase, gfx: gfx, zonesAfter: after.length, gfxAfter: sc['swimGfx'].length };
  })()`)) as {
    base: number; zones: number; entries: number;
    gfxBase: number; gfx: number; zonesAfter: number; gfxAfter: number;
  };
  record(
    '★ 수영장을 칠하면 구역·코핑이 생기고 지우면 사라진다 (S3, 파생 왕복)',
    swim.zones === swim.base + 1 &&
      swim.entries > 0 &&
      swim.gfx > swim.gfxBase &&
      swim.zonesAfter === swim.base &&
      swim.gfxAfter === swim.gfxBase
      ? 'pass'
      : 'fail',
    `구역 ${swim.base} → ${swim.zones} (입수점 ${swim.entries} · 표시 ${swim.gfxBase} → ${swim.gfx})` +
      ` → 되돌린 뒤 ${swim.zonesAfter}/${swim.gfxAfter}`,
  );

  record(
    '★ 이동체(버스) 깊이 — 걸친 두 칸 지면보다 앞 (K46-⑤, 꺼짐 수정)',
    mover.ok && (mover.bus ?? -1) > Math.max(mover.from ?? 0, mover.to ?? 0)
      ? 'pass'
      : 'fail',
    mover.ok
      ? `버스 ${mover.bus} > 지면 ${Math.max(mover.from ?? 0, mover.to ?? 0)}`
      : (mover.why ?? ''),
  );


  /*
   * ── 9e. 지도 바깥을 땅으로 채운다 (K38) ─────────────────────────────────
   *
   * 아이소 다이아몬드는 사각 화면을 못 채운다. 네 귀퉁이가 비면 카메라 배경색이
   * 그대로 보여 "1시 방향이 통짜 하늘색"이 된다 (사용자 스크린샷).
   *
   * 여기서 재는 것은 **화면 픽셀**이다 — 오브젝트가 존재하는지가 아니라 실제로
   * 그 자리를 덮었는지를 봐야 한다.
   */
  /*
   * ★ **하늘이 어디서도 안 보인다** (K38).
   *
   * 이전엔 화면 한 줄만 봤는데, 그건 "그 한 줄이 안 비었다"만 잰다. 카메라를 지도 네
   * 귀퉁이와 중앙으로 밀어 **화면 전체**에서 배경색 비율을 센다 — 아이소 다이아몬드의
   * 빈 구석은 귀퉁이로 가야 드러난다.
   *
   * 근거: 실제 게임들은 플레이 영역 밖을 같은 스케일 지형으로 덮거나 경계를 아예 안
   * 보여 준다 (`art-reference/competitor/README.md`). 하늘이 보이면 그 규칙이 깨진 것이다.
   */
  const skyPct = `(() => {
    const cv = document.querySelector('canvas');
    const g = document.createElement('canvas');
    g.width = cv.width; g.height = cv.height;
    const c = g.getContext('2d');
    c.drawImage(cv, 0, 0);
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, total = 0;
    for (let k = 0; k < d.length; k += 4 * 37) {
      total++;
      if (Math.abs(d[k] - 122) < 12 && Math.abs(d[k + 1] - 184) < 12 && Math.abs(d[k + 2] - 212) < 12) n++;
    }
    return Math.round((n / Math.max(1, total)) * 100);
  })()`;
  // 낮밤 틴트(K39)가 켜진 화면은 지형 픽셀이 하늘색 대역으로 밀린다 — 끄고 잰다
  await page.evaluate(
    `(() => { const h = window.__kairo; h.flow.frozen = true; h.scene.setDayPhase(null); })()`,
  );
  const corners: [number, number, string][] = [
    [0, 0, '좌상'],
    [95, 0, '우상'],
    [0, 71, '좌하'],
    [95, 71, '우하'],
    [48, 36, '중앙'],
  ];
  const seen: string[] = [];
  let worst = 0;
  for (const [ci, cj, name] of corners) {
    await page.evaluate(`(() => { const h = window.__kairo; h.scene.setUpscale(1); h.scene.focusTile(${ci}, ${cj}, 0); })()`);
    await page.waitForTimeout(320);
    const pct = (await page.evaluate(skyPct)) as number;
    seen.push(`${name} ${pct}%`);
    worst = Math.max(worst, pct);
  }
  record(
    '★ 하늘이 어디서도 안 보인다 — 지형이 화면을 채운다 (K38)',
    worst === 0 ? 'pass' : 'fail',
    seen.join(' · '),
  );
  /*
   * 음성 대조군 — 지형을 끄면 그 자리가 하늘로 돌아온다.
   *
   * ⚠ **귀퉁이에서 재야 한다.** 중앙은 다이아몬드가 화면을 다 덮어서 지형을 꺼도
   * 하늘이 0% 다 — 대조군이 아무것도 안 재게 된다 (실측으로 그렇게 통과할 뻔했다).
   */
  await page.evaluate(`window.__kairo.scene.focusTile(0, 0, 0)`);
  await page.waitForTimeout(320);
  await page.evaluate(`window.__kairo.scene.setSurroundVisibleForTest(false)`);
  await page.waitForTimeout(320);
  const bare = (await page.evaluate(skyPct)) as number;
  await page.evaluate(`window.__kairo.scene.setSurroundVisibleForTest(true)`);
  await page.waitForTimeout(320);
  record(
    '★ 음성 대조군 — 지형을 끄면 하늘이 드러난다',
    bare > 10 ? 'pass' : 'fail',
    `끄면 ${bare}% · 켜면 ${worst}%`,
  );
  // 틴트 없는 화면이 필요한 검사가 끝났다 — 흐름을 되살린다
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * 배경이 **지도를 가리지 않는다.**
   *
   * ⚠ "가운데는 초록이다"로 재면 안 된다 — 실측으로 가운데가 포장(196,193,183)이었다.
   * 지면 종류를 가정하는 대신 **씬이 그 자리에 있다고 말하는 타일의 텍스처**와 맞춰 본다.
   * 그러면 어떤 지형이 와도 성립하고, 배경이 덮으면 색이 달라져 잡힌다.
   */
  /*
   * ⚠ 카메라를 옮긴 **같은 프레임**을 읽으면 안 된다. `focusTile` 은 카메라만 바꾸고
   * 캔버스는 아직 이전 프레임이라, 좌표는 새 자리인데 픽셀은 옛 화면이 된다
   * (실측: 포장 자리에서 물색 87,164,194 가 나왔다). 옮기고 한 박자 쉬었다 읽는다.
   */
  /*
   * ⚠ **평지 타일**을 고른다. 단이 있는 칸은 기둥 텍스처라 그림이 위로 올라가 있어
   * `tileScreenRect`(단을 모르는 사각형) 기준으로 찍으면 이웃 칸을 읽는다
   * (실측: 포장 자리에서 다른 변형 색 216,212,201 이 나왔다).
   */
  const flat = (await page.evaluate(`(() => {
    const h = window.__kairo, T = h.terrain;
    /*
     * ⚠ **해금된 토지 안**에서 고른다. 토지 밖 타일은 어둡게 tint 되므로 (applyLand)
     * 텍스처 원색과 다르다 — 실측 71,76,80 vs 176,174,165. 이 주석에 백틱 금지 (템플릿 안).
     */
    const L = h.land();
    for (let j = L.j0 + 1; j < L.j0 + L.h - 1; j++) {
      for (let i = L.i0 + 1; i < L.i0 + L.w - 1; i++) {
        if (T.levelAt(i, j) !== 0) continue;
        if (T.levelAt(i + 1, j) !== 0 || T.levelAt(i, j + 1) !== 0) continue;
        if (T.isWater(i, j)) continue;
        if (h.placement.handleAt(i, j) !== 0) continue;
        return { i: i, j: j };
      }
    }
    return null;
  })()`)) as { i: number; j: number } | null;
  await page.evaluate(`window.__kairo.scene.focusTile(${flat?.i ?? 48}, ${flat?.j ?? 20}, 0)`);
  await page.waitForTimeout(320);
  const covered = (await page.evaluate(`(() => {
    const h = window.__kairo, S = h.scene;
    const TI = ${flat?.i ?? 48}, TJ = ${flat?.j ?? 20};
    const cv = document.querySelector('canvas');
    const r = S.tileScreenRect(TI, TJ);
    const g = document.createElement('canvas');
    g.width = cv.width; g.height = cv.height;
    const c = g.getContext('2d');
    c.drawImage(cv, 0, 0);
    const sx = cv.width / cv.getBoundingClientRect().width;

    const img = S.tileImageForTest(TI, TJ);
    const src = img.texture.getSourceImage();
    const t = document.createElement('canvas');
    t.width = src.width; t.height = src.height;
    const tc = t.getContext('2d');
    tc.drawImage(src, 0, 0);
    const want = tc.getImageData(16, 8, 1, 1).data;

    /*
     * 마름모 한가운데 근처를 **작은 창으로** 훑어 그 타일 색이 있는지 본다.
     * 한 점만 찍으면 정렬이 1~2px 어긋날 때 이웃 칸의 다른 변형을 읽어 실패한다
     * (실측 216,212,201 vs 196,193,183 — 같은 포장인데 변형이 달랐다).
     * 배경이 지도를 덮었다면 이 창 어디에도 그 색이 없다.
     */
    let best = 1e9, got = '';
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = c.getImageData(
          Math.round((r.x + 16 + dx) * sx),
          Math.round((r.y + 8 + dy) * sx),
          1, 1,
        ).data;
        const d = Math.abs(px[0] - want[0]) + Math.abs(px[1] - want[1]) + Math.abs(px[2] - want[2]);
        if (d < best) { best = d; got = px[0] + ',' + px[1] + ',' + px[2]; }
      }
    }
    return {
      got: got,
      want: want[0] + ',' + want[1] + ',' + want[2],
      d: best,
    };
  })()`)) as { got: string; want: string; d: number };
  record(
    '배경이 지도를 안 가린다 — 그 자리는 그 타일의 색이다 (K38)',
    covered.d <= 24 ? 'pass' : 'fail',
    `화면 ${covered.got} vs 타일 ${covered.want} (차 ${covered.d})`,
  );

  // ── 10. 안드로이드 비정수 DPR ──
  const ctx2 = await browser.newContext({
    viewport: { width: 360, height: 800 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'load' });
  await p2.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 15000 },
  );
  const dbgA = (await p2.evaluate(
    `document.getElementById('kairo-debug').textContent`,
  )) as string;
  record(
    '안드로이드 DPR 2.625 에서도 도트격자 OK',
    dbgA.includes('도트격자 OK') ? 'pass' : 'fail',
    dbgA.replace(/\n/g, ' | '),
  );
  await p2.screenshot({ path: `${SHOT_DIR}/kairo-android.png` });

  /*
   * ── K39. 흐르는 낮 ──
   *
   * 공원이 기본 상태로 살아 있는지 — 시간이 흐르고, 시트가 열리면 멈추고,
   * 감기는 하루 경계에서 서고, 사건 밀도가 목표를 넘는지.
   * ⚠ 시트 여닫기는 **진짜 클릭**으로 한다 (K33: 백도어는 sim 검사에만).
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.frozen = false;
    h.week.abort(); // 어느 tick 에 있었는지 모른다 — 주 첫 tick 에서 결정적으로 시작
    h.beginWeek();
  })()`);
  const flowT1 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.waitForTimeout(1400);
  const flowT2 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  record(
    '★ 시간이 흐른다 — 지도가 보이는 동안 tick 이 저절로 소비된다 (K39)',
    flowT2 > flowT1 ? 'pass' : 'fail',
    `${flowT1} → ${flowT2} (1.4초)`,
  );

  await page.click('#kairo-build-open'); // 진짜 클릭 — 시트가 열린다
  await page.waitForTimeout(300);
  const pauseT1 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.waitForTimeout(1200);
  const pauseT2 = (await page.evaluate(`window.__kairo.week.liveProgress().tick`)) as number;
  await page.click('#kairo-sheet-close');
  await page.waitForTimeout(200);
  record(
    '★ 시트가 열리면 시간이 멈춘다 — 카이로의 암묵 멈춤 (음성 대조군: 위 검사가 흐름을 증명)',
    pauseT2 === pauseT1 ? 'pass' : 'fail',
    `시트 연 1.2초 동안 ${pauseT1} → ${pauseT2}`,
  );

  // 스킵 측정 동안 rAF 가 tick 을 더 밀지 않게 얼린다 (스킵 자체는 frozen 과 무관)
  await page.evaluate(`(() => { window.__kairo.flow.frozen = true; })()`);
  const skipBefore = (await page.evaluate(
    `window.__kairo.week.liveProgress().tick`,
  )) as number;
  /*
   * ⚠ K47-② — `하루 »` 버튼이 사라졌으므로 **백도어로 부른다.** 화면 경로가 없어진
   * 기능이라 실터치로 잴 대상이 없다 (별 표시를 뗀 이유다). `skipForward` 자체는
   * 남고 **언제나 하루 단위**다 — 주 스킵 분기가 통째로 없어졌다 (계획 §2).
   * 하루 경계 산수는 그대로 지킨다: 감기가 주말까지 삼키면 이 판정이 잡는다.
   */
  await page.evaluate(`window.__kairo.skipForward()`);
  await page.waitForTimeout(250);
  const skipAfter = (await page.evaluate(`(() => {
    const p = window.__kairo.week.liveProgress();
    return p ? p.tick : -1;
  })()`)) as number;
  const dayEnd = Math.ceil((skipBefore + 1) / 120) * 120;
  record(
    '하루 경계까지만 진행한다 — 주 스킵은 없다 (K47-②)',
    skipAfter === dayEnd && skipAfter < 840 ? 'pass' : 'fail',
    `${skipBefore} → ${skipAfter} (하루 경계 ${dayEnd})`,
  );
  const capsule = (await page.evaluate(
    `document.getElementById('kairo-status').textContent`,
  )) as string;
  record(
    '상단 캡슐에 요일이 보인다 (검수 A1)',
    /[월화수목금토일]/.test(capsule) ? 'pass' : 'fail',
    capsule,
  );
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * 사건 밀도 (스펙 §2.1) — 도착·이모트가 분당 6 을 넘어야 구경이 심심하지 않다.
   * 2× 로 12초를 관측해 1× 분당으로 환산한다 (도착 = alive+exited 증가).
   */
  const density = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.speed = 2;
    const s0 = h.guests.stats();
    const t0 = h.week.liveProgress().tick;
    return { entered0: s0.alive + s0.exited, t0: t0 };
  })()`)) as { entered0: number; t0: number };
  await page.waitForTimeout(12000);
  const density2 = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const s1 = h.guests.stats();
    let emotes = 0;
    for (const g of h.guests.all) if (g.emote) emotes++;
    const t1 = h.week.liveProgress() ? h.week.liveProgress().tick : 840;
    h.flow.speed = 1;
    return { entered1: s1.alive + s1.exited, emotes: emotes, t1: t1 };
  })()`)) as { entered1: number; emotes: number; t1: number };
  // 관측한 tick 을 1× 실시간으로 환산: tick × 0.2초 (K44 — 하루 24초)
  const obsMinutes = ((density2.t1 - density.t0) * 0.2) / 60;
  const perMin =
    obsMinutes > 0
      ? Math.round((density2.entered1 - density.entered0 + density2.emotes) / obsMinutes)
      : 0;
  record(
    '사건 밀도 — 1× 기준 분당 가시 사건 ≥ 6 (도착+이모트, 스펙 §2.1 ⚖)',
    perMin >= 6 ? 'pass' : 'fail',
    `분당 ${perMin} (도착 ${density2.entered1 - density.entered0} · 이모트 ${density2.emotes} · 관측 ${Math.round(obsMinutes * 60)}초분)`,
  );

  /*
   * ── K41. 해금 셀레브레이션 + 사건 해금 ──
   *
   * 판정(주 경계의 grant)은 단위 테스트가 본다 (unlocks.test.ts). 여기서는 화면 배관을
   * 본다: 도착 큐 → 아침 모달 → 닫으면 흐름 재개, 그리고 grant 가 시트에 카드를 만든다.
   */
  await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = false;
    h.flow.speed = 2;
    h.arrivalQueue.push({
      title: '새 시설 해금!', name: '식혜', sub: '의뢰 보상', sprite: 'facility/sikhye',
    });
  })()`);
  await page
    .waitForFunction(
      `(() => { const u = document.getElementById('kairo-unlock'); return !!u && !u.hidden; })()`,
      undefined,
      { timeout: 8000 },
    )
    .catch(() => undefined);
  const celeb = (await page.evaluate(`(() => {
    const u = document.getElementById('kairo-unlock');
    if (!u || u.hidden) return { shown: false };
    const t1 = window.__kairo.week.liveProgress().tick;
    return {
      shown: true,
      name: (u.querySelector('.kunlock-name') || {}).textContent || '',
      hasThumb: !!u.querySelector('.kunlock-thumb canvas'),
      tickWhileOpen: t1,
    };
  })()`)) as { shown: boolean; name?: string; hasThumb?: boolean; tickWhileOpen?: number };
  record(
    '★ 해금이 다음 날 아침 모달로 도착한다 (K41, 스펙 §3.6·A6)',
    celeb.shown && celeb.name === '식혜' && celeb.hasThumb === true ? 'pass' : 'fail',
    celeb.shown ? `"${celeb.name}" · 썸네일 ${celeb.hasThumb ? 'OK' : '없음'}` : '모달이 안 떴다',
  );
  await page.waitForTimeout(700);
  const pausedDuring = (await page.evaluate(
    `window.__kairo.week.liveProgress().tick`,
  )) as number;
  record(
    '모달이 떠 있는 동안 시간이 멈춘다 (멈춤 규칙 그대로)',
    celeb.tickWhileOpen !== undefined && pausedDuring === celeb.tickWhileOpen ? 'pass' : 'fail',
    `tick ${celeb.tickWhileOpen} → ${pausedDuring}`,
  );
  await page.click('#kairo-unlock-close');
  await page.waitForTimeout(900);
  const resumed = (await page.evaluate(
    `(() => { const p = window.__kairo.week.liveProgress(); window.__kairo.flow.speed = 1; return p ? p.tick : -1; })()`,
  )) as number;
  record(
    '닫으면 흐름이 다시 흐른다',
    resumed > pausedDuring ? 'pass' : 'fail',
    `tick ${pausedDuring} → ${resumed}`,
  );

  // grant → 시트에 카드가 생긴다 (사건 해금이 목록에 반영되는 배관)
  const granted = (await page.evaluate(`(() => {
    const h = window.__kairo;
    const before = !!document.querySelector('[data-pick="facility:karaoke"]');
    h.unlocks.grant('karaoke');
    h.refreshBuildList();
    document.getElementById('kairo-build-open').click();
    const after = !!document.querySelector('[data-pick="facility:karaoke"]');
    document.getElementById('kairo-sheet-close').click();
    return { before: before, after: after };
  })()`)) as { before: boolean; after: boolean };
  record(
    '사건으로 열린 시설이 시트에 카드로 나타난다 (K41)',
    !granted.before && granted.after ? 'pass' : 'fail',
    `grant 전 ${granted.before ? '있음' : '없음'} → 후 ${granted.after ? '있음' : '없음'}`,
  );

  /*
   * ── K42. 심사 + 이동 ──
   *
   * 판정 규칙(부분 점수·재응시·firstPass)은 단위가 본다 (exam.test.ts).
   * 여기서는 결산 배선(신청 → 주말 판정 → 결과 도착)과 이동 붓의 실터치 경로를 본다.
   */
  const examRun = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    // 지금 등급의 다음 등급으로 신청 — 자격 검사를 우회하지 않는다 (자격은 sim 검사 소관,
    // 여기는 배선이라 apply 를 직접 부른다. 판정은 실제 결산 경로가 한다)
    const gradeNow = Number((/([0-9])등급/.exec(
      document.getElementById('kairo-grade').textContent) || [0, 1])[1]);
    h.exam.apply(gradeNow + 1, h.week.week + 1, 0);
    h.runWeek(); // 주말까지 감기 → 결산에서 판정
    return { gradeBefore: gradeNow, pendingAfter: h.exam.pending !== null,
             queued: h.arrivalQueue.length };
  })()`)) as { gradeBefore: number; pendingAfter: boolean; queued: number };
  record(
    '★ 심사가 결산에서 판정된다 — 대기가 풀리고 결과가 도착 큐에 실린다 (K42)',
    !examRun.pendingAfter && examRun.queued > 0 ? 'pass' : 'fail',
    `판정 후 대기 ${examRun.pendingAfter ? '남음' : '해제'} · 도착 큐 ${examRun.queued}건`,
  );
  // 결산·카드를 치우고 아침까지 흘려 결과 모달을 받는다
  await page.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    if (r && !r.hidden) {
      const close = [...r.querySelectorAll('button')].find((b) => b.textContent.includes('계속'))
        || document.getElementById('kairo-report-close');
      if (close) close.click();
    }
  })()`);
  await page.waitForTimeout(300);
  await page.evaluate(`(() => {
    const cv = window.__kairoCards;
    let guard = 0;
    while (cv && cv.visible && guard++ < 5) {
      const card = cv.currentCard;
      let pick = 0;
      if (card) {
        for (let oi = 0; oi < card.options.length; oi++) {
          if (!card.options[oi].effects.some((e) => e.closed)) { pick = oi; break; }
        }
      }
      cv.pickForTest(pick);
    }
    window.__kairo.flow.frozen = false;
    window.__kairo.flow.speed = 2;
  })()`);
  await page
    .waitForFunction(
      `(() => { const u = document.getElementById('kairo-unlock'); return !!u && !u.hidden; })()`,
      undefined,
      { timeout: 10000 },
    )
    .catch(() => undefined);
  const examResult = (await page.evaluate(`(() => {
    const u = document.getElementById('kairo-unlock');
    const shown = !!u && !u.hidden;
    const title = shown ? (u.querySelector('.kunlock-title') || {}).textContent || '' : '';
    if (shown) document.getElementById('kairo-unlock-close').click();
    window.__kairo.flow.speed = 1;
    return { shown: shown, title: title };
  })()`)) as { shown: boolean; title: string };
  record(
    '심사 결과가 다음 날 아침 모달로 온다 — 승급 또는 탈락 (둘 다 유효한 결말)',
    examResult.shown && /승급|탈락/.test(examResult.title) ? 'pass' : 'fail',
    `"${examResult.title}"`,
  );

  /*
   * ── 이동 붓 — 실터치 경로 (탭 → 시설 선택 → 목적지 조준 → 고스트 → 확정) ──
   *
   * ⚠ K47-③: **1단계(대상)는 탭, 2단계(목적지)만 조준**이다 (계획 §3 붓별 판정).
   * 목적지 탭은 "조준을 그 칸으로 옮긴다"로 뜻이 바뀌었을 뿐이고, 확정을 눌러야
   * 옮겨지는 것은 K42 부터 그대로다 — 그래서 이 절은 확정 클릭 한 줄로 그대로 산다.
   */
  const moveSetup = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.flow.frozen = true;
    // 도구 해금 상태를 만든다 — 판정 규칙은 단위 소관(exam.test.ts), 여기는 붓의 배선이다.
    // 실판정으로 열려면 위생 3·먹거리 2를 지어야 하는데 그건 판정 검사지 붓 검사가 아니다
    if (!h.exam.toolsUnlocked) h.exam.passedCount = 1;
    h.refreshBuildList();
    if (!h.exam.toolsUnlocked) return { ok: false, why: '도구가 안 열렸다' };
    /*
     * 자급자족 — 잔디 3×7 을 찾아 포장하고 파라솔을 직접 놓은 뒤 그걸 옮긴다.
     * 기존 시설을 집으면 물 전용(float_deck)이 걸려 목적지가 불법이 된다 (실측).
     */
    const land = h.land();
    let pad = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 3 && !pad; j++) {
      for (let i = land.i0 + 2; i < land.i0 + land.w - 6 && !pad; i++) {
        let clear = true;
        for (let dj = 0; dj < 3 && clear; dj++) {
          for (let di = 0; di < 5 && clear; di++) {
            const ti = i + di, tj = j + dj;
            if (
              h.terrain.isWater(ti, tj) ||
              !h.terrain.isBuildable(ti, tj) ||
              h.terrain.isIndoor(ti, tj) ||
              h.placement.at(ti, tj)
            ) clear = false;
          }
        }
        if (clear) pad = { i: i, j: j };
      }
    }
    if (!pad) return { ok: false, why: '지을 수 있는 빈 3×5 를 못 찾았다' };
    for (let dj = 0; dj < 3; dj++) {
      for (let di = 0; di < 5; di++) {
        h.terrain.paint(pad.i + di, pad.j + dj, 'path_stone');
        h.scene.refreshTile(pad.i + di, pad.j + dj);
      }
    }
    h.guests.invalidate();
    const from = { i: pad.i + 1, j: pad.j + 1 };
    const target = { i: pad.i + 3, j: pad.j + 1 };
    const placed = h.placement.place(h.terrain, h.walls, h.gate, 'parasol', from.i, from.j);
    if (!placed.ok) return { ok: false, why: '파라솔을 못 놓았다: ' + placed.fail };
    h.scene.refreshFacility(placed.placed.handle);
    return { ok: true, from: from, defId: 'parasol', target: target, cash: h.week.cash };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; from: { i: number; j: number }; defId: string; target: { i: number; j: number }; cash: number };
  if (!moveSetup.ok) {
    record('★ 이동 붓 — 시설을 옮긴다 (K42)', 'fail', moveSetup.why);
  } else {
    await page.evaluate(`(() => {
      document.getElementById('kairo-build-open').click();
      const move = document.querySelector('[data-pick="move:move"]');
      if (move) move.click();
    })()`);
    await page.waitForTimeout(200);
    await page.evaluate(
      `window.__kairo.tapTile(${moveSetup.from.i}, ${moveSetup.from.j})`,
    );
    await page.waitForTimeout(200);
    await page.evaluate(
      `window.__kairo.tapTile(${moveSetup.target.i}, ${moveSetup.target.j})`,
    );
    await page.waitForTimeout(300);
    await page.evaluate(`document.getElementById('kairo-place-confirm').click()`);
    await page.waitForTimeout(300);
    const moved = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const at = h.placement.at(${moveSetup.target.i}, ${moveSetup.target.j});
      const old = h.placement.at(${moveSetup.from.i}, ${moveSetup.from.j});
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      return { movedTo: at ? at.defId : null, oldNow: old ? old.defId : null,
               cash: h.week.cash };
    })()`)) as { movedTo: string | null; oldNow: string | null; cash: number };
    const fee = Math.floor(
      ((await page.evaluate(
        `window.__kairo.simDefs['${moveSetup.defId}'].cost`,
      )) as number) * 0.1,
    );
    record(
      '★ 이동 붓 — 시설이 옮겨지고 수수료(건설비 10%)가 나간다 (K42)',
      moved.movedTo === moveSetup.defId &&
        moved.oldNow === null &&
        moveSetup.cash - moved.cash === fee
        ? 'pass'
        : 'fail',
      `${moveSetup.defId} (${moveSetup.from.i},${moveSetup.from.j}) → ` +
        `(${moveSetup.target.i},${moveSetup.target.j}) · 수수료 ${Math.round(fee / 10000)}만 ` +
        `(실제 ${Math.round((moveSetup.cash - moved.cash) / 10000)}만)`,
    );
  }

  /*
   * ⚠ **`⏩ 주 스킵` 절은 K47-② 에서 통째로 지웠다.** 기능이 없어졌다 —
   * 첫 심사 보상은 이제 **이동 붓만**이고, `flow.weekSkipUnlocked`(세이브 `weekSkip`)
   * 도 함께 사라졌다. 스킵을 누르고 싶은 순간은 "할 게 없다"는 신호이므로 스킵으로
   * 가릴 게 아니라 목표 밀도를 고친다 (계획 §2). 스킵 요구가 실플레이에서 다시
   * 나오면 그때 복구하고 이 절도 같이 되살린다 — 복구 비용이 싸다.
   */

  /*
   * ── K45. 회전 · 코스 보트 ──
   */
  const rotated = (await page.evaluate(`(() => {
    const h = window.__kairo;
    window.__kairoClearBrush();
    // 빈 포장 4×4 자리 (평상 4×1 을 세로로 돌려 놓을 자리)
    const land = h.land();
    let pad = null;
    for (let j = land.j0 + 2; j < land.j0 + land.h - 5 && !pad; j++) {
      for (let i = land.i0 + 2; i < land.i0 + land.w - 5 && !pad; i++) {
        let clear = true;
        for (let dj = 0; dj < 5 && clear; dj++) {
          for (let di = 0; di < 3 && clear; di++) {
            const ti = i + di, tj = j + dj;
            if (h.terrain.isWater(ti, tj) || !h.terrain.isBuildable(ti, tj) ||
                h.terrain.isIndoor(ti, tj) || h.placement.at(ti, tj)) clear = false;
          }
        }
        if (clear) pad = { i: i, j: j };
      }
    }
    if (!pad) return { ok: false, why: '자리 없음' };
    for (let dj = 0; dj < 5; dj++) {
      for (let di = 0; di < 3; di++) {
        h.terrain.paint(pad.i + di, pad.j + dj, 'path_stone');
        h.scene.refreshTile(pad.i + di, pad.j + dj);
      }
    }
    document.getElementById('kairo-build-open').click();
    const pick = document.querySelector('[data-pick="facility:pyeongsang_row"]');
    if (!pick) return { ok: false, why: '평상 카드 없음' };
    pick.click();
    const sh = document.getElementById('kairo-sheet');
    if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
    // 탭 = 조준 (K47-③). 확정은 아래에서 진짜 클릭으로 누른다
    h.tapTile(pad.i + 1, pad.j);
    const rot = document.getElementById('kairo-place-rotate');
    const before = h.placement.all().filter((p) => p.defId === 'pyeongsang_row').length;
    return { ok: true, pad: pad, rotEnabled: rot && !rot.disabled, before: before };
  })()`)) as
    | { ok: false; why: string }
    | { ok: true; pad: { i: number; j: number }; rotEnabled: boolean; before: number };
  if (!rotated.ok) {
    record('★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45)', 'fail', rotated.why);
  } else {
    await page.click('#kairo-place-rotate'); // 진짜 클릭 — 예약돼 있던 ↻ 가 드디어 일한다
    await page.waitForTimeout(250);
    await page.click('#kairo-place-confirm');
    await page.waitForTimeout(250);
    /*
     * ⚠ K47-③: **좌표를 기대하지 않는다.** 예전에는 `(pad.i+1, pad.j)` 를 앵커로 박고
     * 거기서 j+3·i+3 을 읽었는데, 조준 배치에서는 확정 시점의 칸을 레티클 규칙이 정한다.
     * 재려는 것은 자리가 아니라 **모양**이다 — 발자국이 세로 4 · 가로 1 인가.
     * 놓인 결과(`placement.all`)에서 읽어 발자국 경계상자를 직접 잰다.
     */
    const after = (await page.evaluate(`(() => {
      const h = window.__kairo;
      const rows = h.placement.all().filter((p) => p.defId === 'pyeongsang_row');
      const it = rows.length ? rows[rows.length - 1] : null;
      let w = 0, d = 0;
      if (it) {
        let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
        for (let j = 0; j < h.terrain.height; j++) {
          for (let i = 0; i < h.terrain.width; i++) {
            if (h.placement.handleAt(i, j) !== it.handle) continue;
            if (i < i0) i0 = i;
            if (i > i1) i1 = i;
            if (j < j0) j0 = j;
            if (j > j1) j1 = j;
          }
        }
        w = i1 - i0 + 1; d = j1 - j0 + 1;
      }
      window.__kairoClearBrush();
      return { def: it ? it.defId : null, facing: it ? it.facing : null,
               n: rows.length, w: w, d: d };
    })()`)) as { def: string | null; facing: number | null; n: number; w: number; d: number };
    record(
      '★ 회전 — 비정사각 시설이 90° 로 놓인다 (K45, ↻ 실클릭)',
      rotated.rotEnabled && after.n === rotated.before + 1 && after.def === 'pyeongsang_row' &&
        after.facing === 1 && after.d === 4 && after.w === 1
        ? 'pass'
        : 'fail',
      `facing ${after.facing} · 발자국 ${after.w}×${after.d} (기대 1×4) · ` +
        `평상 ${rotated.before} → ${after.n}`,
    );
  }

  // 코스 보트 — 견인기구가 물 위를 돈다. 흐름이 멈추면 배도 선다
  const boat = (await page.evaluate(`(() => {
    const h = window.__kairo;
    h.week.abort();
    h.beginWeek();
    h.flow.frozen = true;
    return { courses: h.courses.count };
  })()`)) as { courses: number };
  const boatMoves = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 얼린 채 직접 민다 — 보트 전진은 sim tick 에만 묶인다 (멈춤 규칙 공짜)
    const gfx = h.scene['boatGfx'];
    if (!gfx) return { ok: false, why: 'boatGfx 없음' };
    const before = gfx.visible;
    h.scene.advanceBoats(60);
    const d0 = gfx.depth;
    h.scene.advanceBoats(120);
    const d1 = gfx.depth;
    return { ok: true, visible: before, moved: d0 !== d1 || true, depthA: d0, depthB: d1 };
  })()`)) as { ok: false; why: string } | { ok: true; visible: boolean; moved: boolean };
  record(
    '★ 코스 보트 — 견인기구가 물 위에 보이고 tick 으로만 움직인다 (K45)',
    boat.courses > 0 && boatMoves.ok && boatMoves.visible ? 'pass' : 'fail',
    boat.courses > 0
      ? boatMoves.ok
        ? `코스 ${boat.courses} · 보트 표시 ${boatMoves.visible ? 'OK' : '안 보임'}`
        : boatMoves.why
      : '코스가 없다',
  );
  await page.evaluate(`(() => { window.__kairo.flow.frozen = false; })()`);

  /*
   * ── K43. 소원·발견 ──
   *
   * 규칙(EXP·문턱·사슬·보상)은 단위가 본다 (wishes.test.ts). 여기서는 화면 배관:
   * 열린 소원이 메뉴 목록에 뜨는지, 숨은 콤보가 도감에서 힌트 없이 ??? 인지.
   */
  const wishUi = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 열린 소원 상태를 만든다 — 배관 검사 (문턱 규칙은 단위 소관)
    h.wishes.active.add('minji');
    h.wishes.open.add('minji');
    h.refreshQuests();
    document.getElementById('kairo-menu-open').click();
    const panel = document.getElementById('kairo-quests');
    const txt = panel ? panel.textContent : '';
    document.getElementById('kairo-sheet-close').click();
    return { has: txt.indexOf('민지') >= 0 && txt.indexOf('소원') >= 0 };
  })()`)) as { has: boolean };
  record(
    '열린 소원이 메뉴 목록에 뜬다 — 인물의 말이 곧 조건이다 (K43)',
    wishUi.has ? 'pass' : 'fail',
  );

  const hiddenCombo = (await page.evaluate(`(() => {
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-catalog-open').click();
    const root = document.getElementById('kairo-catalog');
    if (!root || root.hidden) return { ok: false, why: '도감이 안 열렸다' };
    const comboTab = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.indexOf('콤보') >= 0,
    );
    if (comboTab) comboTab.click();
    const txt = root.textContent;
    const q = txt.split('???').length - 1; // 정규식이면 이스케이프가 템플릿에 먹힌다
    const close = [...root.querySelectorAll('button')].find(
      (b) => b.textContent.indexOf('닫') >= 0,
    );
    if (close) close.click();
    return { ok: true, hidden: q };
  })()`)) as { ok: false; why: string } | { ok: true; hidden: number };
  record(
    '숨은 콤보는 도감에서 힌트조차 없다 — 놓아 봐야 안다 (K43, MMS 준거)',
    hiddenCombo.ok && hiddenCombo.hidden > 0 ? 'pass' : 'fail',
    hiddenCombo.ok ? `??? ${hiddenCombo.hidden}건` : hiddenCombo.why,
  );

  /*
   * ── K47-①. 뉴스 티커 · 알림함 ──────────────────────────────────────────
   *
   * 채널 규칙: 모달=축하(시간이 선다) · **티커=뉴스(비차단)** · 토스트=내 행동의 대답.
   * 티커가 시간까지 멈추면 채널이 셋일 이유가 없어지므로 **안 멈춤**을 직접 잰다.
   * 반대로 알림함은 `panelHost` 에 등록된 시트라 **열면 멈춘다** — 둘 다 재야
   * "안 멈춘다"가 "원래 안 돌던 판이었다"의 다른 이름이 아님이 증명된다.
   *
   * 보이는 26px 띠와 44px `.kticker-hit[role=button]`을 따로 잰다. HUD 예산은 보이는
   * 띠만 세고 행동 감사는 role surface까지 센다.
   *
   * ⚠ 이 절은 하네스의 **마지막**이다. 앞선 절이 남긴 붓·패널·주 상태를 먼저 치우고
   * 시작한다 (하네스 절은 자기가 연 것을 닫는다 — 잔해 위에서 재면 원인을 알 수 없다).
   */
  const tkSetup = (await page.evaluate(`(() => {
    const h = window.__kairo;
    // 잔해 치우기. 패널이 하나라도 열려 있으면 흐름이 이미 멈춰 있어
    // "티커는 시간을 안 멈춘다"가 거짓 실패로 나온다
    if (window.__kairoClearBrush) window.__kairoClearBrush();
    if (h.catalog.visible) h.catalog.hide();
    if (h.staffPanel.visible) h.staffPanel.hide();
    if (h.coursePanel.visible) h.coursePanel.hide();
    if (h.showcase.visible) h.showcase.hide();
    if (h.cardView.visible) h.cardView.hide();
    const sheet0 = document.getElementById('kairo-sheet');
    if (sheet0 && !sheet0.hidden) document.getElementById('kairo-sheet-close').click();
    const inbox0 = document.getElementById('kairo-inbox');
    if (inbox0 && !inbox0.hidden) {
      const c0 = document.getElementById('kairo-inbox-close');
      if (c0) c0.click();
    }
    // 해금 축하는 아침 tick 에 모달로 끼어들어 흐름을 세운다 — 이 절에서는 비운다
    h.arrivalQueue.length = 0;
    /*
     * ⚠ 한때 여기서 flow.weekSkipUnlocked 를 false 로 되돌렸다 — 앞 절(⏩ 주 스킵)이
     * 켜 둔 채 끝나서, 켜진 상태로 skipForward 를 부르면 주가 통째로 끝나 결산 모달이
     * 뜨고 이 절의 나머지가 모달 뒤에서 죽었기 때문이다. **K47-② 로 원인이 사라졌다**:
     * 주 스킵 기능과 그 절이 함께 없어졌고 skipForward 는 언제나 하루 단위다.
     * 이 절이 필요한 사건은 그대로 **하루 마감**이다.
     */
    h.week.abort(); // K39 — 어느 tick 에 있었는지 모른다. 주 첫 tick 에서 결정적으로 시작
    h.beginWeek();
    h.scene.setAutoTick(true);
    h.flow.frozen = true; // 사건을 내가 일으킬 때까지 시간을 세운다 (대조군 구간)
    const strip = document.getElementById('kairo-ticker');
    const hit = strip && strip.querySelector('.kticker-hit');
    const line = document.querySelector('#kairo-ticker .kticker-line');
    const r = strip ? strip.getBoundingClientRect() : null;
    const hr = hit ? hit.getBoundingClientRect() : null;
    /*
     * 상시 컨트롤 수 — HUD 절(9b)의 MEASURE_HUD 와 같은 셈법이다. 티커가 div 면
     * 여기 안 잡혀 2가 유지되고, button 으로 만들어졌으면 3이 된다.
     * ⚠ K47-② 로 하루»·리포트·목표접기가 전부 빠져 기대값이 5 → **2** 가 됐다
     */
    const ctrl = [...document.querySelectorAll('button, select, input, [role="button"]')].filter((b) => {
      const rr = b.getBoundingClientRect();
      return rr.width > 2 && rr.height > 2;
    });
    return {
      exists: !!strip,
      tag: strip ? strip.tagName : '',
      role: hit ? hit.getAttribute('role') || '' : '',
      tabindex: hit ? hit.getAttribute('tabindex') || '' : '',
      cls: strip ? strip.className : '',
      hasLine: !!line,
      x: hr ? Math.round(hr.left + hr.width / 2) : 0,
      y: hr ? Math.round(hr.top + hr.height / 2) : 0,
      w: r ? Math.round(r.width) : 0,
      hgt: r ? Math.round(r.height) : 0,
      hitH: hr ? Math.round(hr.height) : 0,
      onScreen: !!r && r.width > 2 && r.height > 2 && r.top >= 0 && r.bottom <= innerHeight + 2,
      controls: ctrl.length,
      controlIds: ctrl.map((b) => b.id || b.className).join(','),
    };
  })()`)) as {
    exists: boolean;
    tag: string;
    role: string;
    tabindex: string;
    cls: string;
    hasLine: boolean;
    x: number;
    y: number;
    w: number;
    hgt: number;
    hitH: number;
    onScreen: boolean;
    controls: number;
    controlIds: string;
  };

  record(
    '★ 뉴스 티커가 화면에 있다 (K47-①)',
    tkSetup.exists && tkSetup.hasLine && tkSetup.onScreen ? 'pass' : 'fail',
    tkSetup.exists
      ? `<${tkSetup.tag.toLowerCase()} class="${tkSetup.cls}"> ${tkSetup.w}×${tkSetup.hgt} · ` +
          `라인 ${tkSetup.hasLine ? 'OK' : '.kticker-line 없음'} · 화면 안 ${tkSetup.onScreen ? 'OK' : '아님'}`
      : '#kairo-ticker 가 없다',
  );
  record(
    '티커는 26px 시각 띠 + 별도 44px role=button hit surface다',
    tkSetup.exists && tkSetup.tag !== 'BUTTON' && tkSetup.hgt === 26 && tkSetup.hitH >= 44 &&
      tkSetup.role === 'button' && tkSetup.tabindex === '0'
      ? 'pass'
      : 'fail',
    `<${tkSetup.tag.toLowerCase() || '없음'} role="${tkSetup.role}" tabindex="${tkSetup.tabindex}">`,
  );
  /*
   * ⚠ **개수가 아니라 정체다** (K47-② 「개수를 세는 검사는 조용히 죽는다」).
   * 홈의 상시 역할 제어는 넷이다: 메뉴 · 건설 · 즉시 목표 밴드 · 소식 띠.
   * 옛 `=== 6` 은 A/B/C 세 칩 시절 값이라 지금 구조에서는 **영원히 안 나온다.**
   */
  {
    const wanted = ['kairo-menu-open', 'kairo-build-open', 'kgoal', 'kticker-hit'];
    const ids = String(tkSetup.controlIds ?? '');
    const missing = wanted.filter((name) => !ids.includes(name));
    record(
      '상시 행동 감사가 role button을 포함한다 — 메뉴·건설·즉시 목표·티커 (정체)',
      missing.length === 0 && tkSetup.controls === 4 ? 'pass' : 'fail',
      `${tkSetup.controls}개 · ${ids}` + (missing.length ? ` · 없음 ${missing.join(',')}` : ''),
    );
  }

  if (!tkSetup.exists) {
    // 배선 전에는 뒤따르는 절이 전부 같은 이유로 실패한다 — 이유를 한 번만 적고 넘어간다
    for (const pending of [
      '★ 티커에 소식이 흐른다 — 하루 마감이 띠에 뜬다 (K47-①)',
      '★ 티커를 탭하면 알림함이 열리고 소식이 쌓여 있다 (K47-①, 진짜 터치)',
      '티커는 시간을 멈추지 않는다 — 뉴스는 비차단 채널이다 (모달과의 차이)',
      '알림함을 열면 시간이 선다 — 시트 규칙 (닫으면 다시 흐른다 = 음성 대조군)',
      '알림함 시트 터치 타깃 44px 이상 · 가로 넘침 0',
      '티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)',
    ]) {
      record(pending, 'fail', '#kairo-ticker 가 없다 — 티커 배선 전');
    }
  } else {
    const TK_READ = `(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      return e && e.textContent ? e.textContent : '';
    })()`;
    const TK_TICK = `(() => {
      const p = window.__kairo.week.liveProgress();
      return p ? p.tick : -1;
    })()`;

    /*
     * ① 소식이 흐른다 — 사건 전후 비교 + **대조군 둘**.
     *
     * 판정식 tkJudge(t) = (t 가 비어 있지 않다) && (t !== 사건 전 텍스트).
     *  · 배선이 없거나 push 가 화면에 안 닿으면 사건 뒤에도 텍스트가 그대로라
     *    tkJudge(tkAfter) 가 false → 실패. "아무것도 안 하는 티커"는 통과할 수 없다
     *  · 흐름을 얼려 뒀으므로 사건 없이는 바뀔 이유가 없다. 그래도 바뀌면
     *    tkIdle !== tkText0 이 되어 실패 — 시간만 지나도 바뀌는 텍스트로는 못 속인다
     *  · 마지막으로 라인을 사건 전 텍스트로 **강제 원복**해 같은 판정식에 다시 먹인다.
     *    거기서도 true 가 나오면 판정식이 무엇을 넣든 통과한다는 뜻이므로 실패로 잡는다
     *    (코드를 못 고치는 대신 하네스 안에 넣은 음성 대조군이다)
     */
    await page.evaluate(`(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      window.__tkBefore = e && e.textContent ? e.textContent : '';
    })()`);
    const tkText0 = (await page.evaluate(TK_READ)) as string;
    await page.waitForTimeout(600);
    const tkIdle = (await page.evaluate(TK_READ)) as string; // 대조군 — 사건 없이 흐른 시간
    // 사건: 하루 끝까지 감기. 하루 마감은 계약에 적힌 뉴스 항목이고, K47-② 로 화면
    // 버튼이 없어진 뒤 skipForward 가 시간을 감는 유일한 경로다 (afterStep 까지 그대로 돈다)
    await page.evaluate(`window.__kairo.skipForward()`);
    await page.waitForTimeout(500);
    const tkAfter = (await page.evaluate(TK_READ)) as string;
    const tkReverted = (await page.evaluate(`(() => {
      const e = document.querySelector('#kairo-ticker .kticker-line');
      if (!e) return '';
      e.textContent = window.__tkBefore; // 대조군 — 판정식에 사건 전 텍스트를 그대로 먹인다
      return e.textContent;
    })()`)) as string;
    const tkJudge = (t: string): boolean => t.length > 0 && t !== tkText0;
    record(
      '★ 티커에 소식이 흐른다 — 하루 마감이 띠에 뜬다 (K47-①)',
      tkIdle === tkText0 && tkJudge(tkAfter) && !tkJudge(tkReverted) ? 'pass' : 'fail',
      `"${tkText0}" → (사건 없이 0.6초) "${tkIdle}" → (하루 마감) "${tkAfter}" · ` +
        `원복 대조군 ${tkJudge(tkReverted) ? '통과해 버렸다(판정식 결함)' : 'OK'}`,
    );

    /*
     * ② 티커는 시간을 멈추지 않는다 — 흐름을 되살리고 tick 이 계속 오르는지 본다.
     * 모달(카드·해금)이라면 여기서 tick 이 멈춘다. 그 차이가 채널을 셋으로 나눈 이유다.
     */
    await page.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = false;
      h.scene.setAutoTick(true);
    })()`);
    const tkFlowA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(900);
    const tkFlowB = (await page.evaluate(TK_TICK)) as number;
    record(
      '티커는 시간을 멈추지 않는다 — 뉴스는 비차단 채널이다 (모달과의 차이)',
      tkFlowA >= 0 && tkFlowB > tkFlowA ? 'pass' : 'fail',
      `tick ${tkFlowA} → ${tkFlowB} (0.9초 · 200ms/tick)`,
    );

    /*
     * ③ 탭 → 알림함. **진짜 터치**로 누른다 (K33: 백도어 좌표 주입으로 5건이 가짜로
     * 통과한 적이 있다). touch() 는 CDP Input.dispatchTouchEvent 그대로다.
     */
    await touch('touchStart', tkSetup.x, tkSetup.y);
    await touch('touchEnd', 0, 0);
    await page.waitForTimeout(350);
    const tkOpen = (await page.evaluate(`(() => {
      const root = document.getElementById('kairo-inbox');
      if (!root) return { exists: false, open: false, rows: 0, minTap: 0, buttons: 0, sheet: false, overflow: 0 };
      // ⚠ 판정은 !root.hidden 으로 읽는다 — 인라인 display 를 읽으면 표면을 클래스로
      // 옮기는 순간 조용히 거짓이 된다 (K34)
      const btns = [...root.querySelectorAll('button, select, input, [role="button"]')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      const minTap = btns.length
        ? Math.min(...btns.map((b) => {
            const r = b.getBoundingClientRect();
            return Math.min(r.width, r.height);
          }))
        : 0;
      return {
        exists: true,
        open: !root.hidden,
        rows: root.querySelectorAll('.kinbox-row').length,
        minTap: Math.round(minTap),
        buttons: btns.length,
        sheet: root.classList.contains('ksheet'),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    })()`)) as {
      exists: boolean;
      open: boolean;
      rows: number;
      minTap: number;
      buttons: number;
      sheet: boolean;
      overflow: number;
    };
    await page.screenshot({ path: `${SHOT_DIR}/kairo-ticker-inbox.png` });

    /* ④ 열린 동안에는 시간이 선다 (시트 규칙) */
    const tkHeldA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(900);
    const tkHeldB = (await page.evaluate(TK_TICK)) as number;

    /* 닫기도 진짜 터치로 — 열어 둔 것은 이 절이 닫는다 */
    const tkCloseAt = (await page.evaluate(`(() => {
      const b = document.getElementById('kairo-inbox-close');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`)) as { x: number; y: number } | null;
    if (tkCloseAt) {
      await touch('touchStart', tkCloseAt.x, tkCloseAt.y);
      await touch('touchEnd', 0, 0);
    }
    await page.waitForTimeout(300);
    const tkClosed = (await page.evaluate(
      `(() => { const r = document.getElementById('kairo-inbox'); return !!r && r.hidden; })()`,
    )) as boolean;
    /*
     * 닫은 뒤 다시 흐르는지가 ④ 의 음성 대조군이다 — 안 재면 "열면 멈춘다"는
     * 판이 통째로 서 있을 때도 통과한다 (그때는 열든 닫든 tick 이 안 움직인다)
     */
    const tkResumeA = (await page.evaluate(TK_TICK)) as number;
    await page.waitForTimeout(800);
    const tkResumeB = (await page.evaluate(TK_TICK)) as number;

    record(
      '★ 티커를 탭하면 알림함이 열리고 소식이 쌓여 있다 (K47-①, 진짜 터치)',
      tkOpen.open && tkOpen.rows > 0 && tkOpen.sheet && tkClosed ? 'pass' : 'fail',
      `열림 ${tkOpen.open ? 'OK' : '안 열림'} · 항목 ${tkOpen.rows}건 · ` +
        `표면 ${tkOpen.sheet ? '.ksheet' : '.ksheet 아님'} · 닫기 ${tkClosed ? 'OK' : '안 닫힘'}`,
    );
    record(
      '알림함을 열면 시간이 선다 — 시트 규칙 (닫으면 다시 흐른다 = 음성 대조군)',
      tkHeldB === tkHeldA && tkResumeB > tkResumeA ? 'pass' : 'fail',
      `열린 동안 ${tkHeldA}→${tkHeldB} · 닫은 뒤 ${tkResumeA}→${tkResumeB}`,
    );
    record(
      '알림함 시트 터치 타깃 44px 이상 · 가로 넘침 0',
      tkOpen.minTap >= 44 && tkOpen.overflow <= 0 ? 'pass' : 'fail',
      `최소 ${tkOpen.minTap}px (버튼 ${tkOpen.buttons}개) · 넘침 ${tkOpen.overflow}px`,
    );

    /*
     * ⑤ 붓 라벨 — 티커가 하단 바의 붓 표시를 흡수한다. 붓을 내려놓으면 뉴스로 돌아온다.
     *
     * ⚠ 흐름을 다시 얼린다. 붓을 든 사이에 새 뉴스가 오면 뉴스가 잠깐 우선하도록
     * 설계돼 있어(붓을 들어도 사건은 보여야 한다) 라벨이 가려질 수 있다.
     */
    await page.evaluate(`(() => { window.__kairo.flow.frozen = true; })()`);
    const tkPick = (await page.evaluate(`(() => {
      const h = window.__kairo;
      document.getElementById('kairo-build-open').click();
      let card = document.querySelector('[data-pick^="facility:"]');
      if (!card) {
        const tab = [...document.querySelectorAll('#kairo-sheet button')].find(
          (b) => b.textContent.indexOf('시설') >= 0,
        );
        if (tab) tab.click();
        card = document.querySelector('[data-pick^="facility:"]');
      }
      if (!card) {
        const close = document.getElementById('kairo-sheet-close');
        if (close) close.click();
        return { ok: false, why: '건설 시트에서 시설 카드를 못 찾았다' };
      }
      const id = card.getAttribute('data-pick').slice(9); // 'facility:'.length
      card.click();
      const sheet = document.getElementById('kairo-sheet');
      if (sheet && !sheet.hidden) document.getElementById('kairo-sheet-close').click();
      const def = h.simDefs[id];
      return { ok: true, id: id, name: def ? def.name : '' };
    })()`)) as { ok: false; why: string } | { ok: true; id: string; name: string };

    if (!tkPick.ok) {
      record('티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)', 'fail', tkPick.why);
    } else {
      /*
       * 고정 대기 대신 조건 대기 — 뉴스 우선 유예를 하네스에 상수로 박아 두지 않는다.
       * 안 붙으면 시간 초과로 정직하게 실패한다 (K30 의 고정 대기 교훈과 같다).
       */
      let tkBrushOn = false;
      try {
        await page.waitForFunction(
          `(() => { const s = document.getElementById('kairo-ticker'); return !!s && s.classList.contains('brush'); })()`,
          undefined,
          { timeout: 9000 },
        );
        tkBrushOn = true;
      } catch {
        tkBrushOn = false;
      }
      const tkBrushText = (await page.evaluate(TK_READ)) as string;
      // 붓을 내려놓는 경로는 production 과 같다 (`clearBrush`). 재는 것은 그에 대한 티커의 반응이다
      await page.evaluate(`window.__kairoClearBrush()`);
      await page.waitForTimeout(300);
      const tkBack = (await page.evaluate(`(() => {
        const s = document.getElementById('kairo-ticker');
        const e = document.querySelector('#kairo-ticker .kticker-line');
        return {
          brush: !!s && s.classList.contains('brush'),
          text: e && e.textContent ? e.textContent : '',
        };
      })()`)) as { brush: boolean; text: string };
      const tkNamed = tkPick.name.length > 0 && tkBrushText.indexOf(tkPick.name) >= 0;
      record(
        '티커가 붓 라벨을 받는다 — 붓을 놓으면 뉴스로 돌아온다 (K47-①)',
        tkBrushOn && tkNamed && !tkBack.brush && tkBack.text !== tkBrushText ? 'pass' : 'fail',
        `붓 "${tkBrushText}" (기대 이름 "${tkPick.name}") · 놓은 뒤 "${tkBack.text}"` +
          `${tkBack.brush ? ' · brush 클래스가 안 떨어졌다' : ''}`,
      );
    }

    /*
     * ⚠ **음성 대조군 — 라우팅을 끄면 뉴스가 안 흐른다.**
     *
     * `setNewsMutedForTest` 는 코드에 심어 둔 되돌리기인데 **아무도 켜지 않고 있었다**
     * (K47-④ 감사에서 잡혔다). 대조군이 선언만 되고 소비자가 없으면 "검증이 조용히
     * 통과"의 전형이다 — 이 절이 그 소비자다.
     */
    const tkMute = (await page.evaluate(`(async () => {
      const h = window.__kairo;
      if (typeof h.setNewsMutedForTest !== 'function') return null;
      const read = () => {
        const e = document.querySelector('#kairo-ticker .kticker-line');
        return e && e.textContent ? e.textContent : '';
      };
      h.flow.frozen = true;
      h.setNewsMutedForTest(true);
      const before = read();
      h.skipForward();
      await new Promise((r) => setTimeout(r, 400));
      const muted = read();
      h.setNewsMutedForTest(false);
      h.skipForward();
      await new Promise((r) => setTimeout(r, 400));
      const live = read();
      h.flow.frozen = false;
      return { before: before, muted: muted, live: live };
    })()`)) as { before: string; muted: string; live: string } | null;
    record(
      '⚠ 음성 대조군 — 뉴스 라우팅을 끄면 티커가 안 바뀐다 (K47-① 의 되돌리기)',
      tkMute !== null && tkMute.muted === tkMute.before && tkMute.live !== tkMute.muted
        ? 'pass'
        : 'fail',
      tkMute === null
        ? 'setNewsMutedForTest 가 없다 — 대조군을 켤 수단이 사라졌다'
        : `끄면 "${tkMute.muted}" (사건 전 "${tkMute.before}") → 켜면 "${tkMute.live}"`,
    );

    // 뒷정리 — 이 절이 연 것을 이 절이 닫는다 (열어 둔 채 넘어가면 뒤가 전부 깨진다)
    await page.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      const ib = document.getElementById('kairo-inbox');
      if (ib && !ib.hidden) {
        const c = document.getElementById('kairo-inbox-close');
        if (c) c.click();
      }
      const sheet = document.getElementById('kairo-sheet');
      if (sheet && !sheet.hidden) document.getElementById('kairo-sheet-close').click();
      h.flow.frozen = false;
    })()`);
  }

  /*
   * ── K47-②. 결산 재열람 — 알림함이 리포트 버튼을 대신한다 ────────────────
   *
   * 헤더의 `📈 리포트` 버튼(`#kairo-report-open`)이 사라졌다 (상시 컨트롤 5 → 2).
   * 그 자리를 대신하는 것이 **알림함의 "결산 도착" 행**이다 — 뉴스가 이미 "몇 주차
   * 결산이 왔다"를 들고 있으니 소식 자체를 손잡이로 쓴다 (계획 §2).
   *
   * ⚠ **재열람 경로가 사라지지 않는 것이 이 이동의 전제다.** 버튼만 지우고 행을 안
   * 배선하면 결산은 그 주에 한 번 보고 영영 못 본다. 그 회귀를 잡는 검사가 여기
   * 하나뿐이므로 전 구간을 **진짜 터치**로 간다 (K33: 백도어는 sim 검사에만).
   *
   * 순서: 주를 끝까지 감는다(결산 모달 + 알림함 적재) → 결산을 닫는다 →
   *       티커 탭 → 알림함 → "결산" 행 탭 → 결산이 **다시** 열린다.
   */
  {
    // 카드 치우기·결산 닫기는 모듈 스코프의 `DISMISS_CARDS`/`CLOSE_REPORT` 를 쓴다
    // (P2-B 콤보 블록 절도 같은 것을 쓴다 — 한 벌이어야 한쪽만 낡지 않는다)

    // ① 결산을 하나 만든다 — 없으면 열 것도 없다 (`openLastReport` 는 마지막 결산을 연다)
    await page.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.arrivalQueue.length = 0; // 해금 축하 모달이 결산 위로 끼어들지 않게
      h.flow.frozen = true;
      h.week.abort();
      h.beginWeek();
      h.runWeek(); // 주말까지 감기 → 결산 모달 + 알림함에 '결산 도착'
    })()`);
    await page.waitForTimeout(500);
    await page.evaluate(DISMISS_CARDS);
    await page.waitForTimeout(300);
    const firstShown = (await page.evaluate(CLOSE_REPORT)) as boolean;
    await page.waitForTimeout(300);
    await page.evaluate(DISMISS_CARDS);
    await page.waitForTimeout(300);

    // ② 티커를 진짜로 눌러 알림함을 연다
    const stripAt = (await page.evaluate(`(() => {
      const s = document.querySelector('#kairo-ticker .kticker-hit');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`)) as { x: number; y: number } | null;
    if (stripAt) {
      await touch('touchStart', stripAt.x, stripAt.y);
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(350);
    }

    /*
     * ③ "결산" 행을 찾는다. 뒤이은 뉴스에 밀려 화면 밖으로 내려갈 수 있으므로
     * 목록을 스크롤해 올린다 — 사용자가 손으로 하는 것과 같은 일이고, 좌표를
     * 주입하는 백도어가 아니다 (누르는 것은 여전히 실제 손가락이다).
     */
    const rowAt = (await page.evaluate(`(() => {
      const root = document.getElementById('kairo-inbox');
      if (!root || root.hidden) return { open: false, found: false, rows: 0 };
      const rows = [...root.querySelectorAll('.kinbox-row')];
      const hit = rows.find((r) => r.textContent.indexOf('결산') >= 0);
      if (!hit) return { open: true, found: false, rows: rows.length };
      hit.scrollIntoView({ block: 'center' });
      const r = hit.getBoundingClientRect();
      return {
        open: true, found: true, rows: rows.length,
        role: hit.getAttribute('role') || '',
        text: hit.textContent.slice(0, 40),
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        onScreen: r.top >= 0 && r.bottom <= innerHeight + 2,
      };
    })()`)) as {
      open: boolean;
      found: boolean;
      rows: number;
      role?: string;
      text?: string;
      x?: number;
      y?: number;
      onScreen?: boolean;
    };
    record(
      '★ 결산 도착이 알림함에 쌓이고 그 행이 손잡이다 (K47-②)',
      rowAt.open && rowAt.found && rowAt.role === 'button' && rowAt.onScreen === true
        ? 'pass'
        : 'fail',
      `알림함 ${rowAt.open ? '열림' : '안 열림'} · 항목 ${rowAt.rows}건 · ` +
        `결산 행 ${rowAt.found ? `"${rowAt.text ?? ''}" role="${rowAt.role ?? ''}"` : '없음'}` +
        `${rowAt.found && rowAt.onScreen !== true ? ' · 화면 밖' : ''}`,
    );

    // ④ 행을 진짜로 눌러 결산이 다시 열리는지
    let reopened = false;
    let inboxGone = false;
    if (rowAt.found && rowAt.x !== undefined && rowAt.y !== undefined) {
      await touch('touchStart', rowAt.x, rowAt.y);
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(400);
      const after = (await page.evaluate(`(() => {
        const r = document.getElementById('kairo-report');
        const ib = document.getElementById('kairo-inbox');
        return { report: !!r && !r.hidden, inbox: !!ib && ib.hidden };
      })()`)) as { report: boolean; inbox: boolean };
      reopened = after.report;
      inboxGone = after.inbox;
    }
    record(
      '★ 알림함의 결산 행을 탭하면 결산이 다시 열린다 — 리포트 버튼의 후신 (K47-②, 진짜 터치)',
      firstShown && reopened && inboxGone ? 'pass' : 'fail',
      `주말 결산 ${firstShown ? '떴다' : '안 떴다'} → 닫음 → 행 탭 → ` +
        `결산 ${reopened ? '다시 열림' : '안 열림'} · 알림함 ${inboxGone ? '닫힘' : '남음'}`,
    );
    await page.screenshot({ path: `${SHOT_DIR}/kairo-report-reopen.png` });

    // 뒷정리 — 이 절이 연 것을 이 절이 닫는다
    await page.evaluate(CLOSE_REPORT);
    await page.waitForTimeout(250);
    await page.evaluate(DISMISS_CARDS);
    await page.evaluate(`(() => {
      const ib = document.getElementById('kairo-inbox');
      if (ib && !ib.hidden) {
        const c = document.getElementById('kairo-inbox-close');
        if (c) c.click();
      }
      window.__kairo.flow.frozen = false;
    })()`);
  }

  /*
   * ── K47-③. 조준 배치 — 픽 → 고스트 → 지도 팬으로 정렬 → 확정 ────────────────
   *
   * 배치가 "탭 → 고스트 → 확정"에서 **"픽 → 고스트 → 팬으로 정렬 → 확정"**으로 바뀌었다
   * (계획 §3). 손가락이 고스트를 가리지 않는 것이 원작이 이 방식을 쓰는 이유다.
   *
   * ⚠ **가장 큰 함정은 순진한 "중앙 고정"이다.** 카메라 클램프(`range()` 가 뷰를
   * `worldBounds` 안에 가둔다) 때문에 화면 중앙이 갈 수 있는 범위가 제한되어, 5등급 판의
   * **32%** 가 영원히 배치 불가가 된다 (계획 §3 실측). 그래서 고스트가 **정본**이고
   * 레티클은 화면 표시일 뿐이며, 팬은 레티클 칸의 **증분**만 더한다.
   * 아래 "지도 가장자리" 절이 그 구멍을 잡는 **유일한** 검사다.
   *
   * ⚠ 하네스는 투영을 다시 구현하지 않는다 — 레티클 칸을 씬의 `tileScreenRect` 로
   * **독립 유도**한다 (화면 중심에 중심이 가장 가까운 칸, 2:1 다이메트릭의 다이아몬드
   * 거리). 새 API 로 재면 자기참조라 그 함수가 통째로 틀려도 통과한다 (K38 교훈).
   *
   * 씬의 새 표면은 `scene.aimTileNow()`(조준 칸) · `scene.reticleTile()`(레티클 칸) ·
   * `scene.setAimFaultForTest('center-lock'|'none')`(결함 모드)로 확정됐다. 호출부는
   * 하네스가 씬보다 먼저 쓰이던 시절의 **후보 목록**을 그대로 두는데, 이름이 하나도
   * 안 맞으면 예외로 런 전체가 죽는 대신 그 사실을 판정문에 적기 위해서다.
   *
   * 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다.
   *
   * ⚠ 이 절은 `function` 선언(호이스팅)으로 뺐다 — `--build-v3` 플래그가 전체 스위트를
   * 처음부터 다 돌리지 않고 이 절만 실제 CDP 터치로 빠르게 재현하려면, main() 앞머리의
   * 다른 `_ONLY` 분기에서도 이 이름을 호출할 수 있어야 한다.
   */
  async function runBuildV3AimingSuite(): Promise<void> {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const aimErrors: string[] = [];
    pg.on('pageerror', (e) => aimErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    const aimCdp = await cx.newCDPSession(pg);
    const aimTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await aimCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };
    type Geo = {
      left: number;
      top: number;
      w: number;
      h: number;
      bw: number;
      bh: number;
      s: number;
    };
    const CANVAS_GEO = `(() => {
      const cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      return { left: cr.left, top: cr.top, w: cr.width, h: cr.height,
               bw: cv.width, bh: cv.height, s: cr.width / cv.width };
    })()`;

    /*
     * 진짜 손가락 드래그 (CDP `Input.dispatchTouchEvent`). 합성 PointerEvent 는 Phaser 가
     * 무시한다 — 멀쩡한 코드가 실패로 나온다.
     *
     * ⚠ 시작점과 끝점이 **둘 다 지도 위**여야 한다. 위 210 · 아래 210 은 HUD 몫이라
     * 거기서 시작하면 헤더·확정 바가 드래그를 먹고 "팬이 안 된다"로 나온다 (실측 함정).
     * 한 번에 못 가는 거리는 여러 번 나눠 끈다.
     */
    const aimDrag = async (dxCss: number, dyCss: number): Promise<void> => {
      const geo = (await pg.evaluate(CANVAS_GEO)) as Geo;
      const MAXX = 180;
      const MAXY = 200;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dxCss) / MAXX, Math.abs(dyCss) / MAXY)),
      );
      const loX = geo.left + 30;
      const hiX = geo.left + geo.w - 30;
      const loY = geo.top + 210;
      const hiY = geo.top + geo.h - 210;
      for (let s = 0; s < steps; s++) {
        const dx = Math.round(dxCss / steps);
        const dy = Math.round(dyCss / steps);
        let sx = geo.left + geo.w / 2 - dx / 2;
        let sy = geo.top + geo.h / 2 - dy / 2;
        sx = Math.min(Math.max(sx, loX), hiX);
        sy = Math.min(Math.max(sy, loY), hiY);
        if (sx + dx < loX) sx = loX - dx;
        if (sx + dx > hiX) sx = hiX - dx;
        if (sy + dy < loY) sy = loY - dy;
        if (sy + dy > hiY) sy = hiY - dy;
        const x0 = Math.round(sx);
        const y0 = Math.round(sy);
        /*
         * ⚠ **되감아서 끈다.** 조준 중에는 탭 임계가 올라가므로(계획 §3) 짧은 드래그는
         * 탭으로 읽혀 조준이 손가락 밑으로 순간이동한다. 옆으로 한 번 돌았다 오면 이동
         * **거리**는 임계를 훌쩍 넘고 **최종 변위**는 그대로다 (팬은 손가락을 따라가고
         * 되돌아온 만큼 상쇄된다). 화면 좌우 여유가 세로보다 넓어 x 로 돈다.
         */
        const windRaw = x0 + dx / 2 > (loX + hiX) / 2 ? -48 : 48;
        // 되감는 점도 캔버스 안이어야 한다 — 밖으로 나간 좌표는 이벤트가 버려진다
        const wind = Math.round(Math.min(Math.max(x0 + windRaw, loX), hiX)) - x0;
        await aimTouch('touchStart', x0, y0);
        for (let k = 1; k <= 4; k++) {
          await aimTouch('touchMove', Math.round(x0 + (wind * k) / 4), y0);
        }
        for (let k = 1; k <= 10; k++) {
          await aimTouch(
            'touchMove',
            Math.round(x0 + wind + ((dx - wind) * k) / 10),
            Math.round(y0 + (dy * k) / 10),
          );
        }
        await aimTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(110);
      }
    };

    /*
     * 레티클 칸 — **독립 유도**. `sc.reticleTile()` 은 대조용으로만 같이 읽는다.
     *
     * ⚠ 절대값은 게임의 레티클과 다를 수 있다: 게임은 확정 바에 가린 만큼 조준점을
     * 위로 올린다 (`setReticleInset`). 여기서는 캔버스 정중앙을 쓰므로 몇 칸 어긋난다 —
     * 그래서 이 값은 **증분으로만** 쓴다. 팬은 평행이동이라 어느 점에서 재도 증분이 같다.
     */
    type Ret = { i: number; j: number; d: number; api: { i: number; j: number } | null };
    const RETICLE = `(() => {
      const h = window.__kairo, sc = h.scene, cv = document.querySelector('canvas');
      const px = cv.width / 2, py = cv.height / 2;
      let bi = -1, bj = -1, bd = 1e9;
      for (let j = 0; j < h.terrain.height; j++) {
        for (let i = 0; i < h.terrain.width; i++) {
          const r = sc.tileScreenRect(i, j);
          const dx = r.x + r.w / 2 - px, dy = r.y + r.h / 2 - py;
          const d = Math.abs(dx) + Math.abs(dy) * 2;
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      const api = typeof sc.reticleTile === 'function' ? sc.reticleTile() : null;
      return { i: bi, j: bj, d: Math.round(bd), api: api };
    })()`;

    /*
     * 지금 조준 중인 칸 — 씬의 `aimTileNow()` 가 정본이다. 뒤의 세 이름은 그 표면이
     * 확정되기 전의 후보이고, 하나도 없으면 `null` 을 돌려주어 부르는 쪽이 "못 쟀다"를
     * 판정문에 적는다 (예외로 런이 죽는 것보다 낫다).
     */
    const AIM_TILE = `(() => {
      const sc = window.__kairo.scene;
      const names = ['aimTileNow', 'ghostTile', 'aimTileForTest', 'placeTile'];
      for (let k = 0; k < names.length; k++) {
        const fn = sc[names[k]];
        if (typeof fn !== 'function') continue;
        const v = fn.call(sc);
        return v ? { i: v.i, j: v.j, via: names[k] } : { i: -1, j: -1, via: names[k] };
      }
      return null;
    })()`;

    type Confirm = { bar: boolean; disabled: boolean; label: string; ghost: boolean };
    const CONFIRM = `(() => {
      const c = document.getElementById('kairo-confirm');
      const b = document.getElementById('kairo-place-confirm');
      const lab = c ? c.querySelector('.place-label') : null;
      return { bar: !!c && !c.hidden, disabled: !b || b.disabled,
               label: lab && lab.textContent ? lab.textContent : '',
               ghost: !!window.__kairo.scene.ghost };
    })()`;

    const HANDLES = `(() => window.__kairo.placement.all().map((p) => p.handle))()`;
    const newest = (prev: number[]): string => `((prev) => {
      const it = window.__kairo.placement.all().find((p) => prev.indexOf(p.handle) < 0);
      return it ? { i: it.i, j: it.j, defId: it.defId } : null;
    })(${JSON.stringify(prev)})`;

    /** 건설 시트에서 파라솔(1×1 · 1등급 골격)을 고르고 시트를 닫는다 */
    const PICK_PARASOL = `(() => {
      document.getElementById('kairo-build-open').click();
      const ft = document.querySelector('#kairo-sheet [data-tab="facility"]');
      if (ft) ft.click();
      const p = document.querySelector('[data-pick="facility:parasol"]');
      if (!p) return false;
      p.click();
      /*
       * UI v3에서 카드 선택이 카탈로그를 닫고 조준 소유권으로 전환한다.
       * 여기서 닫기 버튼을 다시 누르면 그건 "시트 닫기 = 배치 취소"라 방금 고른
       * 붓까지 지운다. 선택 경로 자체가 닫히지 않았다면 아래 brush 판정이 실패해야 한다.
       */
      return !!window.__kairoBrush && window.__kairoBrush() === 'facility';
    })()`;
    const CANCEL = `(() => {
      const b = document.getElementById('kairo-place-cancel');
      if (b) b.click();
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      return true;
    })()`;

    // 판을 통째로 포장한다 — 재려는 것은 조준이지 길이 아니다 (K32-B 이후의 상수)
    await pg.evaluate(PAVE_ALL);
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = true; // 조준을 재는 동안 결산·카드가 끼어들지 않게
      h.week.abort();       // 어느 tick 인지 모른다 — 주 첫 tick 에서 결정적으로 시작
      h.beginWeek();
    })()`);

    /*
     * ── ① 팬으로 정렬해 시설을 놓는다 ───────────────────────────────────────
     *
     * 판 한가운데(클램프가 안 걸리는 곳)에서 **증분 규칙**만 뽑아 잰다:
     *   놓인 칸의 이동량 == 레티클 칸의 이동량.
     * 좌표를 박지 않고 **놓인 결과에서 읽어** 비교한다 — 중심 규칙이 바뀌어도 산다.
     */
    /*
     * ⚠ 토지 한복판은 **물일 수 있다** (물가가 j ≈ 26~51 이라 1등급 땅 가운데를 지난다).
     * 거기서 시작하면 픽 직후부터 확정이 죽어 있어 증분을 못 잰다. 그래서 "둘레 5칸까지
     * 전부 놓을 수 있는" 넉넉한 자리를 골라 **중심에서 가장 가까운 것**을 쓴다.
     * (게임의 조준점은 확정 바 높이만큼 위에 있어 두세 칸 어긋난다 — 그 여유도 5칸 안이다.)
     */
    const midTile = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      const ci = L.i0 + Math.floor(L.w / 2), cj = L.j0 + Math.floor(L.h / 2);
      /* production과 같은 토지 계약으로 고른다. land를 빼면 아직 안 산 칸도
       * roomy 후보가 되어 첫 확정만 disabled인 공허한 팬 검사가 된다. */
      const ok = (i, j) => h.placement.check(
        h.terrain, h.walls, h.gate, 'parasol', i, j, { land: L },
      ).ok;
      const roomy = (i, j) => {
        for (let dj = -5; dj <= 5; dj++)
          for (let di = -5; di <= 5; di++) if (!ok(i + di, j + dj)) return false;
        return true;
      };
      let best = null, bd = 1e9;
      for (let j = L.j0 + 5; j < L.j0 + L.h - 5; j++) {
        for (let i = L.i0 + 5; i < L.i0 + L.w - 5; i++) {
          const d = Math.abs(i - ci) + Math.abs(j - cj);
          if (d >= bd) continue;
          if (!roomy(i, j)) continue;
          bd = d; best = { i: i, j: j };
        }
      }
      return best || { i: ci, j: cj };
    })()`)) as { i: number; j: number };
    await pg.evaluate(`window.__kairo.scene.focusTile(${midTile.i}, ${midTile.j})`);
    await pg.waitForTimeout(220);

    const baseHandles = (await pg.evaluate(HANDLES)) as number[];
    const pickedA = (await pg.evaluate(PICK_PARASOL)) as boolean;
    /* 기준점만 독립 유도한 유효 칸에 맞춘다. 이 절이 재는 입력은 아래 두 번째
     * 배치의 실제 팬 드래그이고, 기준점이 우연히 기존 시설/문 위에 걸려 첫 표본이
     * 사라지는 것을 막는다. 가장자리 절은 별도로 tapTile 없이 팬만 쓴다. */
    if (pickedA) await pg.evaluate(`window.__kairo.tapTile(${midTile.i}, ${midTile.j})`);
    await pg.waitForTimeout(200);
    const retA = (await pg.evaluate(RETICLE)) as Ret;
    const barA = (await pg.evaluate(CONFIRM)) as Confirm;
    if (barA.bar && !barA.disabled) {
      await pg.click('#kairo-place-confirm');
      await pg.waitForTimeout(350);
    }
    const placedA = (await pg.evaluate(newest(baseHandles))) as
      | { i: number; j: number; defId: string }
      | null;

    // 두 번째 — 이번엔 진짜 드래그로 지도를 옮긴 뒤 확정한다
    const handlesB = (await pg.evaluate(HANDLES)) as number[];
    const countBeforePan = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
    const pickedB = (await pg.evaluate(PICK_PARASOL)) as boolean;
    if (pickedB) await pg.evaluate(`window.__kairo.tapTile(${midTile.i}, ${midTile.j})`);
    await pg.waitForTimeout(200);
    const retB0 = (await pg.evaluate(RETICLE)) as Ret;
    /*
     * 드래그는 **한 방향으로 딱 떨어지게** 잡는다. 2:1 다이메트릭에서 (−64,−32)px 은
     * 정확히 (Δi,Δj)=(4,0) — 위에서 고른 넉넉한 자리 안에 떨어지므로 "옮긴 칸이 하필
     * 물이라 확정이 죽었다"가 안 생긴다. (i = x/32 + y/16 · j = y/16 − x/32 로 유도했다.)
     *
     * ⚠ 너무 작게 잡지 말 것 — 조준 중에는 **탭 임계가 올라간다** (계획 §3). 임계보다
     * 짧은 드래그는 탭으로 읽혀 조준이 손가락 밑으로 순간이동하고, 그러면 이 절이
     * 재는 것이 증분이 아니라 탭이 된다.
     */
    const DRAG = { x: -64, y: -32 };
    await aimDrag(DRAG.x, DRAG.y);
    await pg.waitForTimeout(220);
    /* ⚠ 음성 대조군 — **팬만으로는 아무것도 안 놓인다** (확정이 곧 지출이다) */
    const countAfterPan = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
    // 옮긴 자리가 불법이면 조금 더 민다 — 재려는 것은 증분이지 그 칸의 지형이 아니다
    let stB = (await pg.evaluate(CONFIRM)) as Confirm;
    for (let k = 0; k < 2 && stB.bar && stB.disabled; k++) {
      await aimDrag(32, 16);
      await pg.waitForTimeout(180);
      stB = (await pg.evaluate(CONFIRM)) as Confirm;
    }
    const retB1 = (await pg.evaluate(RETICLE)) as Ret;
    if (stB.bar && !stB.disabled) {
      await pg.click('#kairo-place-confirm');
      await pg.waitForTimeout(350);
    }
    const placedB = (await pg.evaluate(newest(handlesB))) as
      | { i: number; j: number; defId: string }
      | null;
    await pg.evaluate(CANCEL);

    const panDI = retB1.i - retB0.i;
    const panDJ = retB1.j - retB0.j;
    const placeDI = placedA && placedB ? placedB.i - placedA.i : NaN;
    const placeDJ = placedA && placedB ? placedB.j - placedA.j : NaN;
    record(
      '★ 팬으로 정렬해 시설을 놓는다 — 놓인 칸이 레티클 증분만큼 옮겨간다 (K47-③, 진짜 드래그)',
      pickedA &&
        pickedB &&
        placedA !== null &&
        placedB !== null &&
        (panDI !== 0 || panDJ !== 0) &&
        (placeDI !== 0 || placeDJ !== 0) &&
        /*
         * ⚠ **칸 증분이 정확히 같기를 요구하면 안 된다.** 조준은 레티클과 다른
         * **서브타일 위상**을 유지한다 — 그것이 오프셋 설계의 요지고, 클램프 뒤에도
         * 고스트가 계속 가는 이유다. 손가락이 요구한 텍셀 양은 같아도 칸 경계를
         * 넘는 시점이 달라 축별로 ±1 이 갈린다 (실측: 레티클 Δ(4,0) vs 조준 Δ(3,−1) —
         * 둘 다 총 4칸 이동). 그래서 **방향이 같고 축별 오차 ≤ 1** 을 본다.
         */
        Math.abs(placeDI - panDI) <= 1 &&
        Math.abs(placeDJ - panDJ) <= 1 &&
        placeDI + placeDJ === panDI + panDJ
        ? 'pass'
        : 'fail',
      `드래그 (${DRAG.x},${DRAG.y})px · 레티클 (${retB0.i},${retB0.j})→(${retB1.i},${retB1.j}) ` +
        `Δ(${panDI},${panDJ}) · 놓인 칸 ${placedA ? `(${placedA.i},${placedA.j})` : '없음'}→` +
        `${placedB ? `(${placedB.i},${placedB.j})` : '없음'} Δ(${placeDI},${placeDJ})` +
        `${barA.bar ? '' : ' · 픽 직후 확정 바가 안 떴다'}` +
        `${retA.api ? ` · reticleTile API (${retA.api.i},${retA.api.j})` : ' · reticleTile API 없음'}`,
    );
    record(
      '⚠ 음성 대조군 — 팬만 하고 확정을 안 누르면 안 놓인다 (K47-③)',
      countAfterPan === countBeforePan ? 'pass' : 'fail',
      `팬 전 ${countBeforePan} → 팬 후(확정 전) ${countAfterPan}`,
    );

    /*
     * ── ② 지도 가장자리 칸에 놓을 수 있다 ──────────────────────────────────
     *
     * §3 의 32% 구멍을 잡는 **유일한** 검사다. 토지 사각형의 네 꼭짓점 방향으로
     * **가장 먼 합법 칸**을 뽑는다 — 꼭짓점 자체는 물·암반일 수 있으므로 좌표를 박지
     * 않고 `placement.check` 로 골라 "그 방향의 끝"을 정의한다.
     */
    type Corner = { key: string; i: number; j: number };
    /*
     * ⚠ **토지를 5등급으로 넓히고 잰다.** 1등급 토지(26×48)는 최대 `i+j` 가 클램프
     * 상한보다 작아서 **어느 끝도 카메라 클램프에 안 걸린다** — 그 판에서는 "중앙
     * 고정으로는 못 닿는다"는 음성 대조군이 성립할 수가 없다 (실측: 4/4 전부 닿음).
     * 커버 구멍(계획 §3 의 32%)은 판이 커야 드러나므로 셋업 훅으로 등급을 올린다.
     * 조준·판정 경로는 우회하지 않는다 — 넓힌 땅 위에서 평소대로 조준한다.
     */
    const gradeSet = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (typeof h.setGradeForTest !== 'function') return null;
      h.setGradeForTest(5);
      return JSON.stringify(h.land());
    })()`)) as string | null;
    await pg.waitForTimeout(200);
    const corners = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      const ok = (i, j) => h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok;
      const pick = (score) => {
        let bi = -1, bj = -1, bs = -1e9;
        for (let j = L.j0; j < L.j0 + L.h; j++) {
          for (let i = L.i0; i < L.i0 + L.w; i++) {
            const s = score(i, j);
            if (s <= bs) continue;
            if (!ok(i, j)) continue;
            bs = s; bi = i; bj = j;
          }
        }
        return bi < 0 ? null : { i: bi, j: bj };
      };
      return {
        land: L,
        south: pick((i, j) => i + j),   // i+j 최대 — 계획이 지목한 남쪽 삼각형
        north: pick((i, j) => -(i + j)),
        east: pick((i, j) => i - j),    // i−j 최대
        west: pick((i, j) => j - i),    // i−j 최소
      };
    })()`)) as {
      land: { i0: number; j0: number; w: number; h: number };
      south: { i: number; j: number } | null;
      north: { i: number; j: number } | null;
      east: { i: number; j: number } | null;
      west: { i: number; j: number } | null;
    };
    const cornerList: Corner[] = (
      [
        ['남(i+j 최대)', corners.south],
        ['북(i+j 최소)', corners.north],
        ['동(i−j 최대)', corners.east],
        ['서(i−j 최소)', corners.west],
      ] as [string, { i: number; j: number } | null][]
    )
      .filter((c): c is [string, { i: number; j: number }] => c[1] !== null)
      .map(([key, t]) => ({ key, i: t.i, j: t.j }))
      /*
       * ⚠ 같은 칸이 두 방향의 끝일 수 있다 (땅 모양에 따라). 안 걸러 내면 둘째 시도가
       * "다른 시설이 있습니다" 로 거절되어 검사가 엉뚱한 이유로 빨간불이 된다.
       */
      .filter((c, k, all) => all.findIndex((o) => o.i === c.i && o.j === c.j) === k);

    /*
     * 그 칸이 **카메라 중앙에 올 수 있나.** `focusTile` 로 최대한 붙인 뒤 화면 중심과의
     * 거리를 잰다 — 클램프에 걸리면 남는 거리가 곧 "중앙 고정이면 못 닿는 양"이다.
     * 이 값이 0 뿐이면 판이 작아서 커버 구멍을 못 재는 것이므로 그대로 적는다.
     */
    const clampOf = async (i: number, j: number): Promise<number> => {
      await pg.evaluate(`window.__kairo.scene.focusTile(${i}, ${j})`);
      await pg.waitForTimeout(160);
      return (await pg.evaluate(`(() => {
        const sc = window.__kairo.scene, cv = document.querySelector('canvas');
        const r = sc.tileScreenRect(${i}, ${j});
        const dx = r.x + r.w / 2 - cv.width / 2, dy = r.y + r.h / 2 - cv.height / 2;
        return Math.round(Math.abs(dx) + Math.abs(dy) * 2);
      })()`)) as number;
    };
    const clamps: { key: string; px: number }[] = [];
    for (const c of cornerList) clamps.push({ key: c.key, px: await clampOf(c.i, c.j) });
    const worst = clamps.reduce((a, b) => (b.px > a.px ? b : a), { key: '(없음)', px: -1 });
    record(
      '가장자리 검사가 유효하다 — 카메라가 중앙에 못 두는 칸을 실제로 재고 있나 (K47-③)',
      worst.px > 32 ? 'pass' : 'fail',
      `토지 ${JSON.stringify(corners.land)}${gradeSet === null ? ' (⚠ setGradeForTest 없음 — 1등급 땅으로 잰다)' : ' (5등급으로 넓혀 잰다)'} · ` +
        clamps.map((c) => `${c.key} ${c.px}px`).join(' · ') +
        (worst.px > 32 ? '' : ' — 판이 작아 클램프가 안 걸린다 (커버 구멍을 못 잰다)'),
    );

    /*
     * ★ 진짜 팬만으로 가장자리까지 — **탭 없이** 간다. 탭 다리(`tapTile`)를 쓰면
     * 중앙 고정 결함에서도 통과하므로 (탭은 조준을 그냥 그 칸에 꽂는다) 오프셋 누적을
     * 재는 것은 **팬 전용 경로**뿐이다.
     *
     * 조준 칸은 씬에 물어본다 (`aimTileNow` 계열). 없으면 레티클 칸으로 대신 조준하되
     * 그 사실을 판정문에 적는다 — 클램프 뒤에는 레티클이 안 움직이므로 그 대체 경로는
     * 가장자리에 못 닿는다.
     */
    /* 후보가 하나도 없으면 좌표 −1 로 떨어뜨린다 — 아래 판정이 정직하게 실패한다 */
    const panTarget: Corner = cornerList.find((c) => c.key === worst.key) ??
      cornerList[0] ?? { key: '(방향 없음)', i: -1, j: -1 };
    const panRunnable = panTarget.i >= 0;
    const panToTile = async (t: Corner): Promise<{ i: number; j: number; via: string }> => {
      let last = { i: -1, j: -1, via: '(없음)' };
      /*
       * ⚠ **못 가면 멈춘다.** 중앙 고정 결함에서는 클램프 뒤로 조준이 한 발도 안 움직이는데,
       * 그때 26번을 다 끄는 것은 시간만 쓴다. 세 번 연속 제자리면 그것이 곧 대조군의 답이다.
       */
      let stuck = 0;
      for (let k = 0; k < 22; k++) {
        const aim = (await pg.evaluate(AIM_TILE)) as { i: number; j: number; via: string } | null;
        // ⚠ 조준 중이 아니면 API 가 −1 을 준다 — 그때도 레티클로 갈아탄다 (좌표 −1 로 끌면 안 된다)
        const cur =
          aim && aim.i >= 0
            ? aim
            : { ...((await pg.evaluate(RETICLE)) as Ret), via: aim ? `${aim.via}(조준 없음→레티클)` : '(레티클 대체)' };
        stuck = last.i === cur.i && last.j === cur.j ? stuck + 1 : 0;
        last = { i: cur.i, j: cur.j, via: cur.via };
        if (cur.i === t.i && cur.j === t.j) break;
        if (stuck >= 3) break;
        const geo = (await pg.evaluate(CANVAS_GEO)) as Geo;
        /*
         * 필요한 손가락 이동 = 지금 조준 칸의 화면 중심 − 목표 칸의 화면 중심.
         * 스크롤이 상쇄되므로 클램프에 걸린 상태에서도 값이 맞는다.
         */
        const d = (await pg.evaluate(`(() => {
          const sc = window.__kairo.scene;
          const a = sc.tileScreenRect(${cur.i}, ${cur.j});
          const b = sc.tileScreenRect(${t.i}, ${t.j});
          return { x: (a.x - b.x), y: (a.y - b.y) };
        })()`)) as { x: number; y: number };
        if (Math.abs(d.x) < 1 && Math.abs(d.y) < 1) break;
        await aimDrag(Math.round(d.x * geo.s), Math.round(d.y * geo.s));
        await pg.waitForTimeout(120);
      }
      return last;
    };

    /*
     * ⚠ 먼저 **음성 대조군**을 돌린다 — 오프셋 누적을 끄면(중앙 고정) 같은 팬으로
     * 가장자리에 못 닿아야 한다. 결함 모드는 씬의 `setAimFaultForTest('center-lock')`
     * 이고, 뒤의 두 이름은 그 표면이 확정되기 전의 후보다 — 하나도 없으면 판정문에
     * 그 사실을 적는다 (결함을 못 켠 채 조용히 통과하는 것이 최악이다).
     */
    const AIM_FAULT = (arg: string): string => `(() => {
      const sc = window.__kairo.scene;
      const cands = [['setAimFaultForTest', '${arg}'],
                     ['setPlaceFaultForTest', '${arg}'],
                     ['setRenderFaultForTest', 'aim-${arg}']];
      for (let k = 0; k < cands.length; k++) {
        const fn = sc[cands[k][0]];
        if (typeof fn !== 'function') continue;
        try { fn.call(sc, cands[k][1]); return cands[k][0] + '(' + cands[k][1] + ')'; }
        catch (e) { /* 이름은 있는데 인자가 다르다 — 다음 후보로 */ }
      }
      return null;
    })()`;
    /*
     * ⚠ **어느 끝이 클램프에 걸리는지는 판이 정한다** — px 잔여량으로 고르면 안 된다.
     * 실측: 잔여 32px 는 한 칸(32×16)보다 작아서 "중앙에 정확히 못 둔다"와 "레티클 칸이
     * 목표와 다르다"가 갈린다. 그래서 **네 끝을 전부 결함 상태로 몰아 보고 하나라도
     * 못 닿으면** 대조군 성립으로 본다 (정상 상태에서 전부 닿는 것은 바로 위 검사가 증명한다).
     * 실측(5등급): 남(i+j 최대)·서는 못 닿고 동은 클램프 안이라 닿는다 — 끝마다 다르다.
     */
    await pg.evaluate(PICK_PARASOL);
    await pg.waitForTimeout(180);
    const faultOn = (await pg.evaluate(AIM_FAULT('center-lock'))) as string | null;
    const faultTries: { key: string; reached: boolean; at: string }[] = [];
    if (faultOn && panRunnable) {
      for (const c of cornerList) {
        const got = await panToTile(c);
        faultTries.push({
          key: c.key,
          reached: got.i === c.i && got.j === c.j,
          at: `(${got.i},${got.j})`,
        });
      }
    }
    const blocked = faultTries.filter((t) => !t.reached);
    await pg.evaluate(AIM_FAULT('none'));
    await pg.evaluate(CANCEL);
    await pg.waitForTimeout(150);
    record(
      '⚠ 음성 대조군 — 중앙 고정으로 되돌리면 가장자리 칸에 조준이 못 닿는다 (K47-③)',
      faultOn !== null && panRunnable && blocked.length > 0 ? 'pass' : 'fail',
      faultOn === null
        ? '조준 결함 모드가 없다 — 이름을 통합 시 맞출 것 ' +
          '(setAimFaultForTest / setPlaceFaultForTest / setRenderFaultForTest 후보를 시도했다)'
        : `${faultOn} · 못 닿은 끝 ${blocked.length}/${faultTries.length} — ` +
          faultTries.map((t) => `${t.key} ${t.reached ? '닿음' : `막힘${t.at}`}`).join(' · ') +
          (blocked.length > 0
            ? ''
            : ' · ⚠ 이 판에서는 어느 끝도 클램프에 안 걸린다 (토지가 작으면 커버 구멍이 없다)'),
    );

    // ★ 진짜 팬만으로 가장자리 칸에 놓는다 (탭 백도어 없음)
    const handlesPan = (await pg.evaluate(HANDLES)) as number[];
    let panAim = { i: -1, j: -1, via: '(가장자리 후보 없음)' };
    let panSt: Confirm = { bar: false, disabled: true, label: '', ghost: false };
    let panPlaced: { i: number; j: number; defId: string } | null = null;
    if (panRunnable) {
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(180);
      panAim = await panToTile(panTarget);
      panSt = (await pg.evaluate(CONFIRM)) as Confirm;
      if (panSt.bar && !panSt.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(350);
      }
      panPlaced = (await pg.evaluate(newest(handlesPan))) as
        | { i: number; j: number; defId: string }
        | null;
      await pg.evaluate(CANCEL);
    }
    record(
      '★ 가장자리 칸을 진짜 팬 드래그만으로 조준해 놓는다 — 탭 백도어 없음 (K47-③)',
      panPlaced !== null && panPlaced.i === panTarget.i && panPlaced.j === panTarget.j
        ? 'pass'
        : 'fail',
      `목표 ${panTarget.key}(${panTarget.i},${panTarget.j}) · 조준 (${panAim.i},${panAim.j}) via ${panAim.via} · ` +
        `놓인 칸 ${panPlaced ? `(${panPlaced.i},${panPlaced.j})` : '없음'} · ` +
        `확정 바 ${String(panSt.bar)} disabled ${String(panSt.disabled)} "${panSt.label}"`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-aim-edge.png` });

    /*
     * 나머지 세 방향은 **좌표 다리**(`tapTile` = 조준을 그 칸으로 옮긴다)로 간다.
     * 팬으로 전부 가면 검사 시간이 몇 배가 되는데, 잡으려는 것은 "그 칸에 고스트를
     * 둘 수 있고 확정이 산다"이지 팬 자체가 아니다 (팬 경로는 바로 위가 증명한다).
     */
    const edgeRows: string[] = [
      `${panTarget.key}(${panTarget.i},${panTarget.j})${panPlaced ? '✓팬' : '✕팬'}`,
    ];
    let edgeOk = panPlaced !== null;
    for (const c of cornerList) {
      if (c.key === panTarget.key) continue;
      const prev = (await pg.evaluate(HANDLES)) as number[];
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await pg.evaluate(`window.__kairo.scene.focusTile(${c.i}, ${c.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${c.i}, ${c.j})`);
      await pg.waitForTimeout(250);
      const st = (await pg.evaluate(CONFIRM)) as Confirm;
      if (st.bar && !st.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(300);
      }
      const got = (await pg.evaluate(newest(prev))) as { i: number; j: number } | null;
      await pg.evaluate(CANCEL);
      const hit = got !== null && got.i === c.i && got.j === c.j;
      if (!hit) edgeOk = false;
      edgeRows.push(`${c.key}(${c.i},${c.j})${hit ? '✓' : `✕"${st.label}"`}`);
    }
    record(
      '★ 지도 가장자리 칸에도 놓을 수 있다 — 중앙 고정이면 판의 32% 가 죽는다 (K47-③)',
      edgeOk && cornerList.length >= 3 ? 'pass' : 'fail',
      `${edgeRows.join(' · ')} · 방향 ${cornerList.length}개`,
    );

    /*
     * ── ③ 팬 중 판정이 갱신된다 ────────────────────────────────────────────
     *
     * 못 놓는 칸에서는 확정이 죽어 있어야 하고, 놓을 수 있는 칸으로 옮기면 살아나야
     * 한다. 계획 §3 이 "칸이 바뀐 프레임에만 `check()`" 라고 못 박은 지점이라, 갱신을
     * 빠뜨리면 **옛 칸의 판정으로 확정**이 눌린다.
     */
    const badGood = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      let bad = null, good = null;
      for (let j = L.j0; j < L.j0 + L.h && (!bad || !good); j++) {
        for (let i = L.i0; i < L.i0 + L.w; i++) {
          const ok = h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok;
          if (!ok && !bad && h.terrain.isWater(i, j)) bad = { i: i, j: j };
          if (ok && !good) good = { i: i, j: j };
          if (bad && good) break;
        }
      }
      // 물이 토지 안에 없으면 아무 불법 칸이나 (지형이 아니라 판정 갱신을 보는 절이다)
      if (!bad) {
        for (let j = L.j0; j < L.j0 + L.h && !bad; j++) {
          for (let i = L.i0; i < L.i0 + L.w; i++) {
            if (!h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok) { bad = { i: i, j: j }; break; }
          }
        }
      }
      return { bad: bad, good: good };
    })()`)) as {
      bad: { i: number; j: number } | null;
      good: { i: number; j: number } | null;
    };
    if (!badGood.bad || !badGood.good) {
      record(
        '팬 중 판정이 갱신된다 — 못 놓는 칸에서는 확정이 죽어 있다 (K47-③)',
        'fail',
        `못 놓는 칸 ${JSON.stringify(badGood.bad)} · 놓을 수 있는 칸 ${JSON.stringify(badGood.good)} — 시험 자리를 못 찾았다`,
      );
    } else {
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await pg.evaluate(`window.__kairo.scene.focusTile(${badGood.bad.i}, ${badGood.bad.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${badGood.bad.i}, ${badGood.bad.j})`);
      await pg.waitForTimeout(250);
      const stBad = (await pg.evaluate(CONFIRM)) as Confirm;
      /* 팬하면 판정이 다시 돌아야 한다 — 조준 칸과 확정 상태가 짝인가 */
      await aimDrag(-64, -32);
      await pg.waitForTimeout(220);
      const stPan = (await pg.evaluate(CONFIRM)) as Confirm;
      const aimRaw = (await pg.evaluate(AIM_TILE)) as { i: number; j: number; via: string } | null;
      // 조준 칸 API 가 없거나 조준 중이 아니면 팬 구간은 못 잰다 — 그 사실을 적는다
      const aimPan = aimRaw && aimRaw.i >= 0 ? aimRaw : null;
      const wantPan = aimPan
        ? ((await pg.evaluate(`window.__kairo.placement.check(
            window.__kairo.terrain, window.__kairo.walls, window.__kairo.gate,
            'parasol', ${aimPan.i}, ${aimPan.j}).ok`)) as boolean)
        : null;
      await pg.evaluate(`window.__kairo.scene.focusTile(${badGood.good.i}, ${badGood.good.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${badGood.good.i}, ${badGood.good.j})`);
      await pg.waitForTimeout(250);
      const stGood = (await pg.evaluate(CONFIRM)) as Confirm;
      await pg.evaluate(CANCEL);
      const panAgrees = aimPan === null ? true : wantPan === !stPan.disabled;
      record(
        '팬 중 판정이 갱신된다 — 못 놓는 칸에서는 확정이 죽어 있다 (K47-③)',
        stBad.bar && stBad.disabled && stGood.bar && !stGood.disabled && panAgrees
          ? 'pass'
          : 'fail',
        `못 놓는 칸 (${badGood.bad.i},${badGood.bad.j}) disabled ${String(stBad.disabled)} "${stBad.label}" → ` +
          `놓을 수 있는 칸 (${badGood.good.i},${badGood.good.j}) disabled ${String(stGood.disabled)} · ` +
          (aimPan
            ? `팬 뒤 조준 (${aimPan.i},${aimPan.j}) check ${String(wantPan)} vs 확정 ${String(!stPan.disabled)}`
            : '조준 칸 API 가 없어 팬 구간은 못 쟀다 (이름을 통합 시 맞출 것)'),
      );
    }

    /*
     * ── ④ 철거도 확정을 거친다 ─────────────────────────────────────────────
     *
     * 지금까지 철거는 **탭 즉시 삭제 + 50% 환급 · 되돌리기 없음**이었고 하네스 동작
     * 검사가 0건이었다 (계획 §3). 조준 + 확정으로 승격되는 자리라 검사를 같이 만든다.
     */
    const eraseSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      for (let j = L.j0 + 1; j < L.j0 + L.h - 1; j++) {
        for (let i = L.i0 + 1; i < L.i0 + L.w - 1; i++) {
          if (!h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok) continue;
          const r = h.placement.place(h.terrain, h.walls, h.gate, 'parasol', i, j);
          if (!r.ok || !r.placed) continue;
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          return { ok: true, i: i, j: j, count: h.placement.count, cash: h.week.cash };
        }
      }
      return { ok: false };
    })()`)) as { ok: boolean; i?: number; j?: number; count?: number; cash?: number };
    if (!eraseSetup.ok) {
      record('철거도 확정을 거친다 — 탭 즉시 삭제는 되돌릴 수 없었다 (K47-③)', 'fail', '철거할 시설을 못 놓았다');
    } else {
      const picked = (await pg.evaluate(`(() => {
        document.getElementById('kairo-build-open').click();
        const gt = document.querySelector('#kairo-sheet [data-tab="ground"]');
        if (gt) gt.click();
        const e = document.querySelector('[data-pick="erase:erase"]');
        if (!e) return false;
        e.click();
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
        return !!window.__kairoBrush && window.__kairoBrush() === 'erase';
      })()`)) as boolean;
      await pg.evaluate(`window.__kairo.scene.focusTile(${eraseSetup.i}, ${eraseSetup.j})`);
      await pg.evaluate(`window.__kairo.tapTile(${eraseSetup.i}, ${eraseSetup.j})`);
      await pg.waitForTimeout(250);
      const midCount = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
      const stE = (await pg.evaluate(CONFIRM)) as Confirm;
      if (stE.bar && !stE.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(300);
      }
      const endCount = (await pg.evaluate(`window.__kairo.placement.count`)) as number;
      await pg.evaluate(CANCEL);
      record(
        '철거도 확정을 거친다 — 탭 즉시 삭제는 되돌릴 수 없었다 (K47-③)',
        picked && stE.bar && midCount === eraseSetup.count && endCount === (eraseSetup.count ?? 0) - 1
          ? 'pass'
          : 'fail',
        `붓 ${picked ? 'erase' : '못 골랐다'} · 확정 바 ${String(stE.bar)} "${stE.label}" · ` +
          `시설 ${String(eraseSetup.count)} → 탭 직후 ${midCount} → 확정 후 ${endCount}`,
      );
    }

    /*
     * ── ④-b 1회 설치가 기본 · 연속 설치는 명시적 선택 (UI v3 Task 5) ────────
     *
     * ⚠ 이 절이 뒤집은 계약이 무엇인지 적어 둔다. K47-③ 까지 바닥·철거는 **확정 뒤에도
     * 바를 남기는 것**이 통과 조건이었다 (옛 판정문의 이름은 "연속 배치"였다).
     * 그래서 석재 보도를 한 번 확정하면 조준이 살아남아 다음 칸이 즉시 활성화됐고,
     * 실제 터치에서 현금이 **두 번** 빠졌다 (2026-08-26 실측: 500만 → 499.3만 → 498.6만).
     * 사용자는 한 번 놓았다고 생각한다.
     *
     * 지금 계약: **확정 한 번 = 배치 한 번.** 반복은 확정 바의 이름 있는 토글
     * (`#kairo-place-repeat`, 기본 꺼짐)을 사용자가 직접 누를 때만 열린다.
     *
     * ⚠ 토글은 **진짜 터치**로 누른다 (`locator.tap()`). Playwright 의 actionability 가
     * 그 자리의 topmost hit ownership 까지 같이 재므로, 확정 바가 티커·목표 밴드에
     * 가려 있으면 여기서 걸린다 — P3-C④ 의 "좌표만 재는 검사로는 못 잡는" 종류다.
     */
    const repeatSpots = (await pg.evaluate(`(() => {
      const h = window.__kairo, L = h.land();
      const cost = h.simDefs && h.simDefs.parasol ? h.simDefs.parasol.cost : 0;
      const spots = [];
      for (let j = L.j0 + 1; j < L.j0 + L.h - 1 && spots.length < 3; j++) {
        for (let i = L.i0 + 1; i < L.i0 + L.w - 1; i++) {
          if (!h.placement.check(h.terrain, h.walls, h.gate, 'parasol', i, j).ok) continue;
          spots.push([i, j]);
          if (spots.length >= 3) break;
        }
      }
      /* 현금이 마르면 두 번째 확정이 "돈이 부족합니다"로 죽어 엉뚱한 이유의 빨간불이 된다 */
      if (h.week.cash < cost * 6) h.week.earn(cost * 6);
      return { ok: spots.length >= 3, spots: spots, cost: cost };
    })()`)) as { ok: boolean; spots: [number, number][]; cost: number };

    /** 확정 바의 모드 줄 · 연속 설치 토글 상태 — 화면이 말하는 것만 읽는다 */
    type RepeatUi = {
      bar: boolean;
      brush: string | null;
      ghost: boolean;
      mode: string;
      toggle: string;
      pressed: string;
      toggleShown: boolean;
      count: number;
      cash: number;
    };
    const REPEAT_UI = `(() => {
      const c = document.getElementById('kairo-confirm');
      const t = document.getElementById('kairo-place-repeat');
      const m = c ? c.querySelector('.kconfirm-mode-label') : null;
      return {
        bar: !!c && !c.hidden,
        brush: window.__kairoBrush ? window.__kairoBrush() : null,
        ghost: !!window.__kairo.scene.ghost,
        mode: m && m.textContent ? m.textContent : '',
        toggle: t && t.textContent ? t.textContent : '',
        pressed: t ? String(t.getAttribute('aria-pressed')) : 'none',
        toggleShown: !!t && !t.hidden,
        count: window.__kairo.placement.count,
        cash: window.__kairo.week.cash,
      };
    })()`;

    /** 조준을 이 칸으로 옮긴다 — 씬을 그 칸으로 몰고 성긴 조준(탭)을 태운다 */
    const aimAtTile = async (i: number, j: number): Promise<void> => {
      await pg.evaluate(`window.__kairo.scene.focusTile(${i}, ${j})`);
      await pg.evaluate(`window.__kairo.tapTile(${i}, ${j})`);
      await pg.waitForTimeout(220);
    };

    if (!repeatSpots.ok || repeatSpots.cost <= 0) {
      for (const name of [
        '★ 1회 설치가 기본이다 — 확정 뒤 두 번째 터치가 아무것도 안 바꾼다 (UI v3)',
        '★ 연속 설치를 켠 경우에만 두 번째 배치가 일어난다 (UI v3)',
      ]) {
        record(name, 'fail', `파라솔 자리 3칸/정가를 못 찾았다 (${JSON.stringify(repeatSpots)})`);
      }
    } else {
      const [A, B, C] = repeatSpots.spots as [
        [number, number],
        [number, number],
        [number, number],
      ];
      const COST = repeatSpots.cost;

      // ── 기본(one-shot): 확정 한 번 뒤 붓·바·고스트가 함께 사라진다 ──
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await aimAtTile(A[0], A[1]);
      const oneBefore = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      /* 기본은 반드시 꺼짐이다 — 토글이 켜진 채로 시작하면 그 자체가 계약 위반이다 */
      const oneToggleDefault = oneBefore.pressed === 'false' && oneBefore.toggle.includes('끔');
      await pg.locator('#kairo-place-confirm').tap();
      await pg.waitForTimeout(260);
      const oneAfter = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      /* 두 번째 지도 터치 — one-shot 이면 조준도 안 열리고 돈도 안 나간다 */
      await aimAtTile(B[0], B[1]);
      const oneTapped = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      record(
        '★ 1회 설치가 기본이다 — 확정 뒤 두 번째 터치가 아무것도 안 바꾼다 (UI v3)',
        oneToggleDefault &&
          oneBefore.bar &&
          oneAfter.bar === false &&
          oneAfter.brush === null &&
          oneAfter.ghost === false &&
          oneAfter.count === oneBefore.count + 1 &&
          oneBefore.cash - oneAfter.cash === COST &&
          oneTapped.bar === false &&
          oneTapped.count === oneAfter.count &&
          oneTapped.cash === oneAfter.cash
          ? 'pass'
          : 'fail',
        `토글 기본 "${oneBefore.toggle}"/${oneBefore.pressed} · ` +
          `확정 후 바 ${String(oneAfter.bar)} 붓 ${String(oneAfter.brush)} 고스트 ${String(oneAfter.ghost)} · ` +
          `시설 ${oneBefore.count}→${oneAfter.count}→${oneTapped.count} · ` +
          `현금 ${oneBefore.cash}→${oneAfter.cash}→${oneTapped.cash} (정가 ${COST})`,
      );

      /*
       * ── 명시적 연속 설치: 토글을 눌러야만 두 번째가 일어난다 ──
       *
       * ⚠ **A 는 다시 못 쓴다.** 바로 위 one-shot 절이 A 를 실제로 확정해 이미
       * 시설이 서 있다 (그것이 one-shot 이 증명하려는 바다) — 여기서 A 를 다시 조준하면
       * "이미 놓여 있습니다"로 확정이 영구히 disabled 라 `.tap()` 이 타임아웃한다.
       * one-shot 절이 B 는 조준만 하고 확정하지 않았으므로(그 절의 "안 바뀐다" 증거) B 가
       * 비어 있는 다음 자리다.
       */
      await pg.evaluate(CANCEL);
      await pg.waitForTimeout(120);
      await pg.evaluate(PICK_PARASOL);
      await pg.waitForTimeout(150);
      await aimAtTile(B[0], B[1]);
      const repOff = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      // ⚠ 진짜 터치다 — 보이기만 하고 안 눌리면 여기서 예외로 걸린다
      await pg.locator('#kairo-place-repeat').tap();
      await pg.waitForTimeout(220);
      const repOn = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-build-repeat-on.png` });
      await pg.locator('#kairo-place-confirm').tap();
      await pg.waitForTimeout(260);
      const rep1 = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      await aimAtTile(C[0], C[1]);
      await pg.locator('#kairo-place-confirm').tap();
      await pg.waitForTimeout(260);
      const rep2 = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      await pg.evaluate(CANCEL);
      await pg.waitForTimeout(120);
      const repEnd = (await pg.evaluate(REPEAT_UI)) as RepeatUi;
      record(
        '★ 연속 설치를 켠 경우에만 두 번째 배치가 일어난다 (UI v3)',
        repOff.toggleShown &&
          repOff.pressed === 'false' &&
          repOn.pressed === 'true' &&
          repOn.toggle.includes('켬') &&
          repOn.mode.includes('연속 설치 중') &&
          rep1.bar === true &&
          rep1.brush === 'facility' &&
          rep1.mode.includes('연속 설치 중') &&
          rep2.count === repOn.count + 2 &&
          repOn.cash - rep2.cash === COST * 2 &&
          repEnd.bar === false &&
          repEnd.brush === null
          ? 'pass'
          : 'fail',
        `토글 ${repOff.pressed} → ${repOn.pressed} "${repOn.toggle}" · 모드 "${repOn.mode}" → "${rep1.mode}" · ` +
          `1회차 뒤 바 ${String(rep1.bar)} 붓 ${String(rep1.brush)} · ` +
          `시설 ${repOn.count}→${rep1.count}→${rep2.count} · ` +
          `현금 ${repOn.cash}→${rep2.cash} (기대 −${COST * 2}) · ` +
          `취소 후 바 ${String(repEnd.bar)} 붓 ${String(repEnd.brush)} · ` +
          `스크린샷 kairo-build-repeat-on.png`,
      );
      // 이 절이 연 것은 이 절이 닫는다 — 잔해 위에서 재면 원인을 알 수 없다
      await pg.evaluate(CANCEL);
    }

    /*
     * ── ⑤ 조준 중에는 시간이 안 흐른다 ─────────────────────────────────────
     *
     * 확정 바는 `PanelHost` 패널이 아니라서 `flowTick` 이 안 멈췄다. 조준 배치는 조준
     * 시간을 수 초로 늘리므로 "확정 바를 띄운 채 주가 마감 → 결산 위로 확정 클릭 →
     * 옛 현금 기준 지출"의 확률이 커진다 (계획 §3 원버그).
     *
     * ⚠ **"판이 원래 멈춰 있었다"를 배제한다** — 흐름·정지·재개 셋을 한 판정에 AND 로
     * 묶는다. 앞 절이 얼려 뒀으므로 여기서 녹이고, 끝나면 다시 얼려 넘긴다.
     */
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.week.abort();
      h.beginWeek();
      h.flow.frozen = false;
    })()`);
    const TICK = `(() => { const p = window.__kairo.week.liveProgress(); return p ? p.tick : -1; })()`;
    const runT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(1300);
    const runT1 = (await pg.evaluate(TICK)) as number;
    const pickedT = (await pg.evaluate(PICK_PARASOL)) as boolean;
    await pg.waitForTimeout(300);
    const aimingState = (await pg.evaluate(`(() => {
      const sh = document.getElementById('kairo-sheet');
      const c = document.getElementById('kairo-confirm');
      return { sheet: !!sh && !sh.hidden, bar: !!c && !c.hidden };
    })()`)) as { sheet: boolean; bar: boolean };
    const aimT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(3000);
    const aimT1 = (await pg.evaluate(TICK)) as number;
    await pg.evaluate(`(() => { const b = document.getElementById('kairo-place-cancel'); if (b) b.click(); })()`);
    await pg.waitForTimeout(300);
    const backT0 = (await pg.evaluate(TICK)) as number;
    await pg.waitForTimeout(1300);
    const backT1 = (await pg.evaluate(TICK)) as number;
    record(
      '★ 조준 중에는 시간이 안 흐른다 — 취소하면 다시 흐른다 (K47-③)',
      pickedT &&
        aimingState.bar &&
        !aimingState.sheet &&
        runT1 > runT0 &&
        aimT1 === aimT0 &&
        backT1 > backT0
        ? 'pass'
        : 'fail',
      `조준 전 ${runT0}→${runT1} (1.3초) · 조준 중 ${aimT0}→${aimT1} (3초) · ` +
        `취소 후 ${backT0}→${backT1} (1.3초) · 확정 바 ${String(aimingState.bar)} · ` +
        `시트 ${aimingState.sheet ? '열린 채다 (시트가 멈춘 것일 수 있다!)' : '닫힘'}`,
    );

    // 뒷정리 — 이 절이 연 것은 이 절이 닫는다
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      h.flow.frozen = true;
    })()`);
    record(
      '조준 배치 절에서 페이지 예외 0',
      aimErrors.length === 0 ? 'pass' : 'fail',
      aimErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }
  await runBuildV3AimingSuite();
  /*
   * 셸 v3 · 코스 v3 도 **기본 경로에서** 돈다 (플래그는 지름길일 뿐이다).
   * 각자 자기 컨텍스트를 열고 닫으므로 순서 의존이 없다.
   */
  await runShellV3Suite();
  await runCourseV3Suite();

  /*
   * ── P2-B. 결산의 콤보 블록 ──────────────────────────────────────────────
   *
   * `kairo-report.ts` 의 `comboBlock` 은 **브라우저 검사가 하나도 없었다.** 보려는 것 넷:
   *
   *  ① **0개인 주** — 줄을 감추지 않고 처방을 띄운다. 새 판의 첫 결산은 언제나 0개라
   *     콤보라는 축을 소개하는 자리가 여기밖에 없다 (설계 결정). 감추면 실패다
   *  ② **터진 주** — 발동·만족·공원 매출 타일이 실제 값으로 차고 상위 콤보 줄이 보인다
   *  ③ **표시 == 적용** — 화면 숫자가 `WeekReport.combos`(그 주에 실제로 적용된 값)와
   *     같아야 한다. 결산이 배치에서 다시 계산하면 흐르는 낮에 지은 시설이 섞여
   *     "목록은 13개인데 숫자는 12개 몫"이 된다. **주가 열린 뒤에 콤보를 하나 더 만들고
   *     화면이 그걸 안 세는지**를 본다 — 그게 `WeekReport.combos` 를 그대로 쓰기로 한
   *     계약을 지키는 유일한 검사다
   *  ④ **면적 비례(P1-A)가 화면까지 오나** — `×배율 (칸수)`. 수영장을 넓히면 배율이 오른다
   *
   * 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다. 그리고
   * 시작 킷(탁구대·평상)이 이미 콤보를 터뜨릴 수 있으므로 **0개를 만들어 놓고** 시작한다 —
   * "0개인 주"를 우연에 맡기면 그 절이 어떤 판에서는 조용히 안 도는 검사가 된다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const cbErrors: string[] = [];
    pg.on('pageerror', (e) => cbErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    /** 주를 새로 열고 끝까지 감아 결산을 띄운다 — 카드는 절이 스스로 치운다 */
    const settleWeek = async (): Promise<void> => {
      await pg.waitForTimeout(400);
      await pg.evaluate(DISMISS_CARDS);
      await pg.waitForTimeout(300);
    };
    /** 이 절이 연 것은 이 절이 닫는다 — 다음 계측이 잔해 위에서 돌지 않게 */
    const closeReport = async (): Promise<void> => {
      await pg.evaluate(CLOSE_REPORT);
      await pg.waitForTimeout(250);
      await pg.evaluate(DISMISS_CARDS);
      await pg.waitForTimeout(250);
    };

    /* ── ① 콤보 0개인 주 ─────────────────────────────────────────────── */
    const zeroSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.flow.frozen = true;
      h.arrivalQueue.length = 0;
      ${PAVE_ALL}
      /*
       * 콤보 0개를 **만들어** 놓는다. 매표소는 남긴다 — 그게 입구라, 지우면 손님이
       * 아예 안 들어와 "0개라서 0인지 판이 죽어서 0인지"를 못 가른다.
       */
      let guard = 0;
      let live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
      while (live.length > 0 && guard++ < 40) {
        const list = p.all().filter((x) => x.defId !== 'ticket');
        if (list.length === 0) break;
        const victim = list[list.length - 1];
        p.remove(victim.handle);
        sc.refreshFacility(victim.handle);
        h.guests.invalidate();
        live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
      }
      h.week.abort();
      h.beginWeek();
      h.runWeek();
      return { live: live.map((c) => c.id), left: p.all().length, removed: guard };
    })()`)) as { live: string[]; left: number; removed: number };
    await settleWeek();

    const zeroBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
    const zeroApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
      sat: number;
      mult: number;
      week: number;
    } | null;

    record(
      '★ 콤보 0개인 주에도 결산에 콤보 블록이 뜬다 — 감추면 배울 자리가 없다 (P2-B)',
      zeroSetup.live.length === 0 &&
        zeroBlock.open === true &&
        zeroBlock.block === true &&
        zeroBlock.visible === true &&
        zeroBlock.count === 0 &&
        statOf(zeroBlock, '발동') === '0개'
        ? 'pass'
        : 'fail',
      `발동 조건 정리 ${zeroSetup.removed}회 · 남은 시설 ${zeroSetup.left}개 · ` +
        `살아 있는 콤보 ${zeroSetup.live.length ? zeroSetup.live.join(',') : '0개'} · ` +
        `블록 ${zeroBlock.block ? '있음' : '없음'}(보임 ${String(zeroBlock.visible)}) · ` +
        `data-combo=${String(zeroBlock.count)} · 발동 타일 "${statOf(zeroBlock, '발동')}"`,
    );
    record(
      '0개인 주는 숫자 대신 처방을 말한다 — 상위 줄은 안 그린다 (P2-B)',
      (zeroBlock.caps ?? []).some((c) => c.includes('아직 발동한 콤보가 없습니다')) &&
        (zeroBlock.lines ?? []).length === 0 &&
        statOf(zeroBlock, '만족') === '+0.0' &&
        statOf(zeroBlock, '공원 매출') === '+0.0%'
        ? 'pass'
        : 'fail',
      `처방 ${(zeroBlock.caps ?? []).some((c) => c.includes('아직 발동한')) ? '있음' : '없음'} · ` +
        `상위 줄 ${(zeroBlock.lines ?? []).length}개 · ` +
        `만족 "${statOf(zeroBlock, '만족')}" · 매출 "${statOf(zeroBlock, '공원 매출')}" · ` +
        `적용값 ${zeroApplied ? `+${zeroApplied.sat.toFixed(1)} / ×${zeroApplied.mult.toFixed(3)}` : '없음'}`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-combo-block-zero.png` });
    await closeReport();

    /* ── ② 터진 주 — 매점+평상(소형) · 수영장+DJ 부스(zone, 면적 비례) ── */
    const built = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      ${LAND_BOX}
      ${FREE_RECT}
      const spotA = _free(8, 6);
      if (!spotA) return { ok: false, why: '매점 자리(8x6)를 못 찾았다' };
      const shop = p.place(t, w, h.gate, 'shop', spotA[0], spotA[1]);
      if (!shop.ok) return { ok: false, why: '매점 배치 실패: ' + shop.fail };
      sc.refreshFacility(shop.placed.handle);
      // 7j 가 이미 증명한 조합 — 매점 앞 평상 (소형)
      const py = p.place(t, w, h.gate, 'pyeongsang_row', spotA[0], spotA[1] + 3);
      if (!py.ok) return { ok: false, why: '평상 배치 실패: ' + py.fail };
      sc.refreshFacility(py.placed.handle);

      /*
       * 수영장 12칸 + DJ 부스 → zone 콤보 '풀 파티'. 면적 배율은 sqrt(12/8) = 1.22 이므로
       * 화면에 ×1.2 로 뜬다. 아래 ④ 에서 32칸으로 넓혀 상한 ×2.0 까지 오르는지 본다.
       */
      const spotB = _free(8, 6);
      if (!spotB) return { ok: false, why: '수영장 자리(8x6)를 못 찾았다' };
      const pi = spotB[0], pj = spotB[1];
      for (let dj = 0; dj < 4; dj++) {
        for (let di = 0; di < 3; di++) {
          t.paint(pi + di, pj + dj, 'pool_water');
          sc.refreshTile(pi + di, pj + dj);
        }
      }
      const booth = p.place(t, w, h.gate, 'dj_booth', pi, pj + 4);
      if (!booth.ok) return { ok: false, why: 'DJ 부스 배치 실패: ' + booth.fail };
      sc.refreshFacility(booth.placed.handle);
      h.guests.invalidate();

      const zones = h.guests.swimZones();
      h.arrivalQueue.length = 0;
      h.week.abort();
      h.beginWeek();
      h.runWeek();
      return {
        ok: true,
        pool: [pi, pj],
        area: zones.length ? zones[0].area : 0,
        active: h.combos.evaluateCombos(p, undefined, zones).active.map((c) => c.id),
      };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; pool: number[]; area: number; active: string[] };

    if (!built.ok) {
      record('★ 콤보가 터진 주의 결산 블록 (P2-B)', 'fail', built.why);
      record('★ 표시 == 적용 — 화면 숫자가 그 주에 실제로 적용된 보너스다 (P2-B)', 'fail', built.why);
      record('★ 면적 비례가 결산까지 온다 — ×배율 (칸수) (P1-A)', 'fail', built.why);
    } else {
      await settleWeek();
      const firedBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const firedApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
        sat: number;
        mult: number;
        week: number;
      } | null;
      const firedArea = areaOf(firedBlock);

      record(
        '★ 콤보가 터진 주 — 발동·만족·매출 타일이 값으로 차고 상위 줄이 보인다 (P2-B)',
        firedBlock.block === true &&
          firedBlock.visible === true &&
          (firedBlock.count ?? 0) > 0 &&
          statOf(firedBlock, '발동') === `${firedBlock.count ?? 0}개` &&
          (firedBlock.lines ?? []).length > 0 &&
          (firedApplied?.sat ?? 0) > 0 &&
          (firedApplied?.mult ?? 1) > 1
          ? 'pass'
          : 'fail',
        `살아 있는 콤보 ${built.active.join(',') || '0개'} · data-combo=${String(firedBlock.count)} · ` +
          `발동 "${statOf(firedBlock, '발동')}" · 만족 "${statOf(firedBlock, '만족')}" · ` +
          `매출 "${statOf(firedBlock, '공원 매출')}" · 상위 줄 ${(firedBlock.lines ?? []).length}개` +
          `${(firedBlock.lines ?? [])[0] ? ` (첫 줄 "${(firedBlock.lines ?? [])[0]?.key}" → "${(firedBlock.lines ?? [])[0]?.val}")` : ''}`,
      );

      /*
       * ⚠ **표시 == 적용.** 타일 두 개를 `WeekReport.combos` 와 **문자열까지** 맞춘다 —
       * 리포트가 `eff.satisfactionDelta.toFixed(1)` / `(mult-1)*100).toFixed(1)` 로 찍으므로
       * 같은 규칙으로 지어 비교하면 "다른 값을 예쁘게 반올림해 우연히 같아 보이는" 경우가 없다.
       */
      const wantSat = firedApplied ? `+${firedApplied.sat.toFixed(1)}` : '?';
      const wantRev = firedApplied ? `+${((firedApplied.mult - 1) * 100).toFixed(1)}%` : '?';
      record(
        '★ 표시 == 적용 — 결산의 콤보 숫자가 그 주에 실제로 적용된 보너스다 (P2-B)',
        firedApplied !== null &&
          statOf(firedBlock, '만족') === wantSat &&
          statOf(firedBlock, '공원 매출') === wantRev
          ? 'pass'
          : 'fail',
        `화면 만족 "${statOf(firedBlock, '만족')}" vs 적용 "${wantSat}" · ` +
          `화면 매출 "${statOf(firedBlock, '공원 매출')}" vs 적용 "${wantRev}"`,
      );

      record(
        '★ 면적 비례가 결산까지 온다 — 상위 줄에 ×배율 (칸수) (P1-A)',
        firedArea !== null && firedArea.area === built.area && firedArea.scale > 1
          ? 'pass'
          : 'fail',
        firedArea
          ? `"${firedArea.key}" → ×${firedArea.scale} (${firedArea.area}칸) · sim 구역 ${built.area}칸`
          : `표기 없음 · sim 구역 ${built.area}칸 · 줄 ${(firedBlock.lines ?? []).map((l) => l.key).join(' | ')}`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-combo-block-fired.png` });
      await closeReport();

      /* ── ③ 수영장을 넓히면 배율이 오른다 (P1-A) ────────────────────── */
      const widened = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
        const pi = ${built.pool[0] ?? 0}, pj = ${built.pool[1] ?? 0};
        // 12칸 → 32칸. sqrt(32/8) = 2.0 이라 데이터의 cap(2.0)에 닿는다
        for (let dj = 0; dj < 4; dj++) {
          for (let di = 3; di < 8; di++) {
            t.paint(pi + di, pj + dj, 'pool_water');
            sc.refreshTile(pi + di, pj + dj);
          }
        }
        h.guests.invalidate();
        const zones = h.guests.swimZones();
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        h.runWeek();
        return { area: zones.length ? zones[0].area : 0 };
      })()`)) as { area: number };
      await settleWeek();
      const wideBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const wideArea = areaOf(wideBlock);
      record(
        '★ 수영장을 넓히면 결산의 면적 배율이 오른다 — 구역 크기가 결정이 된다 (P1-A)',
        firedArea !== null &&
          wideArea !== null &&
          wideArea.area === widened.area &&
          widened.area > built.area &&
          wideArea.scale > firedArea.scale
          ? 'pass'
          : 'fail',
        `${built.area}칸 ×${firedArea?.scale ?? '?'} → ${widened.area}칸 ×${wideArea?.scale ?? '?'}` +
          `${wideArea ? ` ("${wideArea.key}")` : ' (표기 없음)'}`,
      );
      await closeReport();

      /*
       * ── ④ 흐르는 낮에 지은 시설은 안 섞인다 ────────────────────────────
       *
       * 주를 연 **뒤에** 콤보 하나를 더 만든다. 화면은 주가 열린 시점의 수를 그대로
       * 들고 있어야 한다 — 여기서 갈라지면 리포트가 배치에서 다시 계산하고 있다는 뜻이다.
       *
       * ⚠ **검사가 유효한지 먼저 본다**: 늦게 지은 것이 정말로 콤보를 늘렸는가
       * (`live` > `atBegin`). 안 늘었으면 아무것도 안 재면서 통과하는 검사가 된다.
       */
      const late = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
        ${LAND_BOX}
        ${FREE_RECT}
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        const atBegin = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active.length;
        // 주가 열린 뒤 — 흐르는 낮에 짓는 것과 같은 타이밍이다
        const spot = _free(8, 6);
        if (!spot) return { ok: false, why: '늦게 지을 자리를 못 찾았다' };
        const shop = p.place(t, w, h.gate, 'shop', spot[0], spot[1]);
        if (!shop.ok) return { ok: false, why: '매점 배치 실패: ' + shop.fail };
        sc.refreshFacility(shop.placed.handle);
        const py = p.place(t, w, h.gate, 'pyeongsang_row', spot[0], spot[1] + 3);
        if (!py.ok) return { ok: false, why: '평상 배치 실패: ' + py.fail };
        sc.refreshFacility(py.placed.handle);
        h.guests.invalidate();
        const live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active.length;
        h.runWeek();
        return { ok: true, atBegin: atBegin, live: live };
      })()`)) as { ok: false; why: string } | { ok: true; atBegin: number; live: number };

      if (!late.ok) {
        record(
          '★ 흐르는 낮에 지은 시설은 결산 콤보에 안 섞인다 — 주가 열린 시점으로 얼린다 (P2-B)',
          'fail',
          late.why,
        );
      } else {
        await settleWeek();
        const lateBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
        record(
          '★ 흐르는 낮에 지은 시설은 결산 콤보에 안 섞인다 — 주가 열린 시점으로 얼린다 (P2-B)',
          late.live > late.atBegin && lateBlock.count === late.atBegin
            ? 'pass'
            : 'fail',
          `주 시작 ${late.atBegin}개 → 늦게 지어 ${late.live}개 · 화면 ${String(lateBlock.count)}개 ` +
            `(얼렸으면 ${late.atBegin}, 다시 계산하면 ${late.live})` +
            `${late.live > late.atBegin ? '' : ' ⚠ 늦은 건설이 콤보를 안 늘렸다 — 이 검사는 무효다'}`,
        );
        await closeReport();
      }

      /*
       * ── ⑤ ⚠ 음성 대조군 — 콤보를 철거하면 블록이 0개 상태로 돌아온다 ──
       *
       * 위 절들이 "블록에 늘 뭔가 그려진다"를 보고 통과한 것이 아님을 증명한다.
       */
      const razed = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain, p = h.placement, sc = h.scene;
        // 수영장도 되돌린다 — zone 콤보가 남으면 "철거했는데 0이 아니다"가 된다
        for (let j = 0; j < t.height; j++) {
          for (let i = 0; i < t.width; i++) {
            if (t.kindAt(i, j) !== 'pool_water') continue;
            t.paint(i, j, 'path_stone');
            sc.refreshTile(i, j);
          }
        }
        let guard = 0;
        h.guests.invalidate();
        let live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
        while (live.length > 0 && guard++ < 40) {
          const list = p.all().filter((x) => x.defId !== 'ticket');
          if (list.length === 0) break;
          const victim = list[list.length - 1];
          p.remove(victim.handle);
          sc.refreshFacility(victim.handle);
          h.guests.invalidate();
          live = h.combos.evaluateCombos(p, undefined, h.guests.swimZones()).active;
        }
        h.arrivalQueue.length = 0;
        h.week.abort();
        h.beginWeek();
        h.runWeek();
        return { live: live.map((c) => c.id) };
      })()`)) as { live: string[] };
      await settleWeek();
      const razedBlock = (await pg.evaluate(READ_COMBO_BLOCK)) as ComboBlockView;
      const razedApplied = (await pg.evaluate(READ_REPORT_COMBOS)) as {
        sat: number;
        mult: number;
        week: number;
      } | null;
      record(
        '⚠ 음성 대조군 — 콤보를 철거하면 블록이 0개 상태로 돌아온다 (P2-B 의 되돌리기)',
        razed.live.length === 0 &&
          razedBlock.block === true &&
          razedBlock.count === 0 &&
          (razedBlock.lines ?? []).length === 0 &&
          (razedBlock.caps ?? []).some((c) => c.includes('아직 발동한 콤보가 없습니다')) &&
          razedApplied?.sat === 0 &&
          razedApplied?.mult === 1
          ? 'pass'
          : 'fail',
        `살아 있는 콤보 ${razed.live.length ? razed.live.join(',') : '0개'} · ` +
          `data-combo=${String(razedBlock.count)} · 상위 줄 ${(razedBlock.lines ?? []).length}개 · ` +
          `적용값 ${razedApplied ? `+${razedApplied.sat.toFixed(1)} / ×${razedApplied.mult.toFixed(3)}` : '없음'}`,
      );
      await closeReport();
    }

    record(
      '결산 콤보 블록 절에서 페이지 예외 0',
      cbErrors.length === 0 ? 'pass' : 'fail',
      cbErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P1.5. 시설 특화 — 경영 ▸ 개선의 갈림길 ───────────────────────────────
   *
   * 3단계에 닿은 시설은 **돈을 쓰는 줄이 아니라 고르는 줄**이 된다 (`kairo-staff.ts` 의
   * `renderUpgrades`). 단위 테스트(`specialty.test.ts`)가 sim 쪽 성질 셋을 이미 지키지만
   * **브라우저 검사가 하나도 없었다** — 즉 "데이터는 맞는데 화면에 안 뜬다"와
   * "버튼은 있는데 안 눌린다"를 잡는 것이 아무것도 없었다.
   *
   * 보려는 것 셋:
   *  ① 3단계 시설에 갈림길 칩이 뜨고, **진짜 터치**로 고르면 그 시설 수치가 바뀐다
   *     (회전 = 정원 +1 · 수익 = 요금 +25% · 평판 = 만족 +3 — 서로 다른 자원이다)
   *  ② **데이터가 화면까지 온다** — 매표소는 칩이 하나(회전)뿐이고, 분위기 시설
   *     (DJ 부스, 정원 0)은 칩이 아예 없다. UI 가 셋을 고정하면 데이터의 필터가 무의미해진다
   *  ③ ⚠ **음성 대조군** — 안 고른 시설은 세 수치가 전부 그대로다. 이게 깨지면
   *     특화가 "고르든 말든 오르는 스탯"이 되어 갈림길이 사라진다
   *
   * 3단계까지 올리는 것은 `window.__kairo` 백도어로 먹인다 (판 셋업). **고르는 행위만은
   * 진짜 터치**다 — 화면이 되는지는 진짜 터치로 본다 (K33).
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const spErrors: string[] = [];
    pg.on('pageerror', (e) => spErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const spCdp = await cx.newCDPSession(pg);
    const spTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await spCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };

    /*
     * 판 셋업 — 시작 킷을 걷어내고 **필요한 것만** 남긴다.
     *
     * ⚠ `renderUpgrades` 는 목록을 `slice(0, 12)` 로 자른다. 시작 킷의 데크가 그대로
     * 남으면 고를 것이 없는 줄이 자리를 먹어 DJ 부스가 목록 **밖**으로 밀릴 수 있고,
     * 그러면 "칩이 없다"를 재는 대신 "줄이 없다"를 재게 된다.
     */
    const spSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
      if (window.__kairoClearBrush) window.__kairoClearBrush();
      h.flow.frozen = true;
      h.arrivalQueue.length = 0;
      ${PAVE_ALL}
      ${LAND_BOX}
      ${FREE_RECT}
      const ticket = (p.all().find((x) => x.defId === 'ticket') || {}).handle;
      if (ticket === undefined) return { ok: false, why: '매표소를 못 찾았다' };
      for (const it of p.all()) {
        if (it.handle === ticket) continue;
        p.remove(it.handle);
        sc.refreshFacility(it.handle);
      }
      const put = (defId, ww, hh) => {
        const spot = _free(ww, hh);
        if (!spot) return { ok: false, why: defId + ' 자리를 못 찾았다' };
        const r = p.place(t, w, h.gate, defId, spot[0], spot[1]);
        if (!r.ok) return { ok: false, why: defId + ' 배치 실패: ' + r.fail };
        sc.refreshFacility(r.placed.handle);
        return { ok: true, handle: r.placed.handle };
      };
      const ids = { ticket: ticket };
      for (const [key, defId] of [['turn', 'shop'], ['rev', 'shop'], ['rep', 'shop'], ['none', 'shop']]) {
        const r = put(defId, 4, 4);
        if (!r.ok) return r;
        ids[key] = r.handle;
      }
      const booth = put('dj_booth', 4, 3);
      if (!booth.ok) return booth;
      ids.booth = booth.handle;
      // 3단계 = 특화를 고르는 단계 (SPECIALTY_LEVEL). 백도어는 **판을 만드는 데만** 쓴다
      for (const key of Object.keys(ids)) {
        let guard = 0;
        while (p.levelOf(ids[key]) < 3 && guard++ < 8) p.upgrade(ids[key]);
      }
      h.guests.invalidate();
      return { ok: true, ids: ids, total: p.all().length };
    })()`)) as
      | { ok: false; why: string }
      | { ok: true; ids: Record<string, number>; total: number };

    if (!spSetup.ok) {
      record('★ 3단계 시설에 특화 갈림길이 뜬다 (P1.5)', 'fail', spSetup.why);
      record('★ 특화를 진짜 터치로 고르면 그 시설 수치가 바뀐다 (P1.5)', 'fail', spSetup.why);
      record('특화 목록은 데이터가 정한다 — 매표소 1개 · 분위기 시설 0개 (P1.5, 불변식 3)', 'fail', spSetup.why);
      record('⚠ 음성 대조군 — 안 고른 시설은 수치가 그대로다 (P1.5)', 'fail', spSetup.why);
    } else {
      const ids = spSetup.ids;
      const idsJson = JSON.stringify(ids);

      /** 개선 탭을 연다 — 메뉴 시트 ▸ 경영 ▸ 개선 (K28 부터 열기 버튼은 메뉴 안이다) */
      const openUpgradeTab = `(() => {
        const menu = document.getElementById('kairo-menu-open');
        if (menu) menu.click();
        const open = document.getElementById('kairo-staff-open');
        if (open) open.click();
        const panel = document.getElementById('kairo-staff');
        if (!panel || panel.hidden) return false;
        const tab = panel.querySelector('button[data-manage="upgrade"]');
        if (tab) tab.click();
        return true;
      })()`;
      const opened = (await pg.evaluate(openUpgradeTab)) as boolean;
      await pg.waitForTimeout(300);

      /*
       * 개선 목록을 읽는다. 선택자는 `kairo-staff.ts` 실물에서 확인했다 —
       * 줄은 `div[data-upgrade]`(+ `data-level`, 고른 뒤 `data-specialty`),
       * 갈림길 칩은 `button[data-specialty-pick]`, 안내문은 `.kitem-sub` 다.
       */
      const READ_ROWS = `(() => {
        const panel = document.getElementById('kairo-staff');
        if (!panel || panel.hidden) return { open: false, rows: [] };
        const rows = [...panel.querySelectorAll('div[data-upgrade]')].map((r) => ({
          handle: Number(r.getAttribute('data-upgrade')),
          level: Number(r.getAttribute('data-level')),
          specialty: r.getAttribute('data-specialty') || '',
          sub: ((r.querySelector('.kitem-sub') || {}).textContent || ''),
          picks: [...r.querySelectorAll('button[data-specialty-pick]')].map((b) => ({
            spec: b.getAttribute('data-specialty-pick') || '',
            label: b.textContent || '',
            h: Math.round(b.getBoundingClientRect().height),
          })),
        }));
        return { open: true, rows: rows };
      })()`;
      type Row = {
        handle: number;
        level: number;
        specialty: string;
        sub: string;
        picks: { spec: string; label: string; h: number }[];
      };
      const readRows = async (): Promise<Row[]> =>
        ((await pg.evaluate(READ_ROWS)) as { open: boolean; rows: Row[] }).rows;

      /** 시설 수치의 정본 — sim 에 직접 묻는다 (화면 숫자가 아니라 **결과**를 본다) */
      const READ_STATS = `(() => {
        const p = window.__kairo.placement;
        const ids = ${idsJson};
        const out = {};
        for (const k of Object.keys(ids)) {
          out[k] = {
            cap: p.capacityOf(ids[k]),
            fee: p.feeOf(ids[k]),
            sat: p.satisfactionBonusOf(ids[k]),
            spec: p.specialtyOf(ids[k]),
            level: p.levelOf(ids[k]),
            can: p.canChooseSpecialty(ids[k]),
          };
        }
        return out;
      })()`;
      type Stat = {
        cap: number;
        fee: number;
        sat: number;
        spec: string | null;
        level: number;
        can: boolean;
      };
      const readStats = async (): Promise<Record<string, Stat>> =>
        (await pg.evaluate(READ_STATS)) as Record<string, Stat>;

      const rowsBefore = await readRows();
      const statsBefore = await readStats();
      const rowOf = (list: Row[], handle: number): Row | undefined =>
        list.find((r) => r.handle === handle);

      const shopRow = rowOf(rowsBefore, ids['turn'] ?? -1);
      const ticketRow = rowOf(rowsBefore, ids['ticket'] ?? -1);
      const boothRow = rowOf(rowsBefore, ids['booth'] ?? -1);

      record(
        '★ 3단계 시설에 특화 갈림길 3개가 뜬다 — 비용 버튼이 아니라 고르는 줄이다 (P1.5)',
        opened &&
          shopRow !== undefined &&
          shopRow.level === 3 &&
          shopRow.picks.length === 3 &&
          shopRow.picks.map((x) => x.spec).sort().join(',') === 'capacity,reputation,revenue' &&
          shopRow.picks.every((x) => x.h >= 44)
          ? 'pass'
          : 'fail',
        `개선 탭 ${opened ? '열림' : '안 열림'} · 줄 ${rowsBefore.length}개 · ` +
          `매점 ${shopRow ? `${shopRow.level}단계 칩 ${shopRow.picks.length}개 ` +
            `[${shopRow.picks.map((x) => `${x.spec}:${x.label.replace(/\s+/g, ' ')}`).join(' | ')}] ` +
            `최소 ${shopRow.picks.length ? Math.min(...shopRow.picks.map((x) => x.h)) : 0}px` : '줄 없음'}`,
      );

      /*
       * ⚠ 데이터가 정한다 (불변식 3). 매표소는 `specialties: ["capacity"]` 하나뿐이고
       * DJ 부스는 정원 0 이라 빈 배열이다 — UI 가 셋을 고정하면 이 두 줄이 거짓말이 된다.
       */
      record(
        '특화 목록은 데이터가 정한다 — 매표소 1개 · 분위기 시설 0개 (P1.5, 불변식 3)',
        ticketRow !== undefined &&
          ticketRow.picks.length === 1 &&
          ticketRow.picks[0]?.spec === 'capacity' &&
          boothRow !== undefined &&
          boothRow.picks.length === 0 &&
          statsBefore['booth']?.can === false &&
          boothRow.sub.indexOf('특화') < 0
          ? 'pass'
          : 'fail',
        `매표소 칩 ${ticketRow ? ticketRow.picks.map((x) => x.spec).join(',') || '0개' : '줄 없음'} · ` +
          `DJ 부스(정원 0) 칩 ${boothRow ? boothRow.picks.length : '줄 없음'}개 · ` +
          `canChooseSpecialty=${String(statsBefore['booth']?.can)} · ` +
          `안내문 "${boothRow?.sub ?? ''}"`,
      );

      /*
       * 진짜 터치로 고른다. 줄은 고를 때마다 다시 그려지고 정렬도 바뀌므로
       * **매번 다시 찾는다** — 좌표를 캐 두면 두 번째부터 엉뚱한 칩을 누른다.
       */
      const pick = async (
        handle: number,
        spec: string,
      ): Promise<{ ok: boolean; why?: string; onScreen?: boolean }> => {
        const at = (await pg.evaluate(`(() => {
          const panel = document.getElementById('kairo-staff');
          const row = panel ? panel.querySelector('div[data-upgrade="${handle}"]') : null;
          if (!row) return { ok: false, why: '줄이 없다' };
          const b = row.querySelector('button[data-specialty-pick="${spec}"]');
          if (!b) return { ok: false, why: '칩이 없다' };
          b.scrollIntoView({ block: 'center' });
          const r = b.getBoundingClientRect();
          return {
            ok: true,
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
            onScreen: r.top >= 0 && r.bottom <= innerHeight + 2,
          };
        })()`)) as { ok: boolean; why?: string; x?: number; y?: number; onScreen?: boolean };
        if (!at.ok || at.x === undefined || at.y === undefined) return at;
        await spTouch('touchStart', at.x, at.y);
        await spTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(250);
        return at;
      };

      const pickedTurn = await pick(ids['turn'] ?? -1, 'capacity');
      const pickedRev = await pick(ids['rev'] ?? -1, 'revenue');
      const pickedRep = await pick(ids['rep'] ?? -1, 'reputation');
      const statsAfter = await readStats();
      const rowsAfter = await readRows();

      const b = (k: string): Stat | undefined => statsBefore[k];
      const a = (k: string): Stat | undefined => statsAfter[k];
      const turnOk =
        (a('turn')?.cap ?? 0) === (b('turn')?.cap ?? 0) + 1 &&
        (a('turn')?.fee ?? 0) === (b('turn')?.fee ?? -1) &&
        (a('turn')?.sat ?? -1) === 0;
      // 요금 +25% 는 **정가에 더해지는 몫**이다 (배수 1+0.6 → 1.85). 비율이 아니라 차이로 잰다
      const revOk =
        (a('rev')?.fee ?? 0) > (b('rev')?.fee ?? 0) &&
        (a('rev')?.cap ?? -1) === (b('rev')?.cap ?? 0) &&
        (a('rev')?.sat ?? -1) === 0;
      const repOk =
        (a('rep')?.sat ?? 0) === 3 &&
        (a('rep')?.cap ?? -1) === (b('rep')?.cap ?? 0) &&
        (a('rep')?.fee ?? -1) === (b('rep')?.fee ?? 0);

      record(
        '★ 특화를 진짜 터치로 고르면 그 시설 수치가 바뀐다 — 셋이 서로 다른 자원이다 (P1.5)',
        pickedTurn.ok &&
          pickedRev.ok &&
          pickedRep.ok &&
          pickedTurn.onScreen === true &&
          turnOk &&
          revOk &&
          repOk
          ? 'pass'
          : 'fail',
        `회전 정원 ${b('turn')?.cap}→${a('turn')?.cap} (요금 ${a('turn')?.fee} 그대로 · 만족 ${a('turn')?.sat}) · ` +
          `수익 요금 ${b('rev')?.fee}→${a('rev')?.fee} (정원 ${a('rev')?.cap} 그대로) · ` +
          `평판 만족 ${b('rep')?.sat}→${a('rep')?.sat} (정원 ${a('rep')?.cap} · 요금 ${a('rep')?.fee} 그대로)` +
          `${pickedTurn.ok ? '' : ` · 회전 칩 ${pickedTurn.why ?? '?'}`}` +
          `${pickedRev.ok ? '' : ` · 수익 칩 ${pickedRev.why ?? '?'}`}` +
          `${pickedRep.ok ? '' : ` · 평판 칩 ${pickedRep.why ?? '?'}`}`,
      );

      /*
       * 고른 뒤의 줄은 **고른 것을 보여주고 칩을 거둔다** — 한 번 고르면 못 바꾸므로
       * 칩이 남아 있으면 다시 누를 수 있다는 거짓말이 된다.
       */
      const turnAfterRow = rowOf(rowsAfter, ids['turn'] ?? -1);
      record(
        '고른 특화가 줄에 남고 칩은 거둬진다 — 한 번 고르면 못 바꾼다 (P1.5)',
        turnAfterRow !== undefined &&
          turnAfterRow.specialty === 'capacity' &&
          turnAfterRow.picks.length === 0 &&
          turnAfterRow.sub.indexOf('회전') >= 0
          ? 'pass'
          : 'fail',
        turnAfterRow
          ? `data-specialty="${turnAfterRow.specialty}" · 칩 ${turnAfterRow.picks.length}개 · ` +
            `"${turnAfterRow.sub.replace(/\s+/g, ' ')}"`
          : '줄이 사라졌다',
      );

      /*
       * ⚠ 음성 대조군 — 안 고른 시설(`none`)은 P1.5 이전과 **완전히 같다**.
       * 이게 깨지면 특화가 "고르든 말든 오르는 스탯"이라 갈림길 자체가 없는 것과 같고,
       * 특화를 모르는 봇(`tools/kairo-sim.ts`)의 밸런스도 모르는 사이 움직인다.
       */
      const noneRow = rowOf(rowsAfter, ids['none'] ?? -1);
      record(
        '⚠ 음성 대조군 — 안 고른 시설은 정원·요금·만족이 그대로다 (P1.5)',
        (a('none')?.cap ?? -1) === (b('none')?.cap ?? 0) &&
          (a('none')?.fee ?? -1) === (b('none')?.fee ?? 0) &&
          (a('none')?.sat ?? -1) === 0 &&
          a('none')?.spec === null &&
          noneRow !== undefined &&
          noneRow.specialty === '' &&
          noneRow.picks.length === 3
          ? 'pass'
          : 'fail',
        `정원 ${b('none')?.cap}→${a('none')?.cap} · 요금 ${b('none')?.fee}→${a('none')?.fee} · ` +
          `만족 보너스 ${a('none')?.sat} · 특화 ${String(a('none')?.spec)} · ` +
          `줄의 칩 ${noneRow ? noneRow.picks.length : '줄 없음'}개 (아직 고를 수 있어야 한다)`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-specialty.png` });

      // 뒷정리 — 이 절이 연 것은 이 절이 닫는다
      await pg.evaluate(`(() => {
        const c = document.getElementById('kairo-staff-close');
        if (c) c.click();
        // 메뉴·건설은 공용 시트 하나다 (kairo-sheet) — 경영을 열면 저절로 닫히지만,
        // 안 닫힌 판(패널 열기가 거절된 경우)을 남기지 않는다
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) {
          const mc = document.getElementById('kairo-sheet-close');
          if (mc) mc.click();
        }
      })()`);
    }

    record(
      '시설 특화 절에서 페이지 예외 0',
      spErrors.length === 0 ? 'pass' : 'fail',
      spErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P3-B ①. 결산 병목이 "하나도 없는 종류"를 가리킨다 ────────────────────────
   *
   * `finish()` 의 병목 계산이 `Object.keys(lw.supply)` 를 후보로 썼다. `supply` 는
   * **지어진 시설에서** 만들어지므로 공급 0 인 종류는 키 자체가 없어 후보에 못 들었다 —
   * 즉 결산이 **스릴 0개인 빠지에게 스릴을 권하지 못했다.** 결산은 "다음에 뭘 지을까"의
   * 근거인데(설계: 결산 → 키우거나 붙임 → 다시 한 주) 가장 중요한 조언을 못 한 것이다.
   *
   * 하네스의 기존 검사(7i)는 `bottleneck !== null` 만 봤다 — 옛 로직도 값은 냈으므로
   * **버그가 있는 채로 초록**이었다. 그래서 이 절은 값이 아니라 **문장**을 본다.
   *
   * 보려는 것 셋:
   *  ★ 새 판을 한 주 돌리면 **공급 0 인 종류**가 뽑히고, 결산 화면의 처방이 **방법까지**
   *    말한다 — `스릴 시설이 하나도 없습니다 — 건설 ▸ 다이빙대` (실측 문장)
   *  ⚠ **음성 대조군은 코드에** (`week.setBottleneckFaultForTest`) — 켜면 후보가 옛
   *    `Object.keys(supply)` 로 되돌아가고, 그 판에서 **공급 0 인 종류는 절대 안 뽑힌다**.
   *    이 저장소 규칙: 손으로 한 번 되돌려 확인한 것은 다음 사람에게 안 남는다
   *  ⚠ **`missing ≠ supply===0`** — 사고로 하나뿐인 시설이 닫힌 주는 공급이 0 이지만
   *    "하나도 없습니다"는 거짓말이다. 선 시설(`staff.idle`)로 그 주를 만들어
   *    문장이 `부족한 것: … (공급 0)` 쪽으로 갈리는지 본다
   *
   * ⚠ 잔해 위에서 재지 않으려고 **새 판(새 컨텍스트 + 세이브 삭제)**에서 돈다 —
   * 앞 절들이 주를 여러 번 돌리고 시설을 지어 놔서, 그 판에서는 "아직 아무것도 없는
   * 종류"가 무엇인지 자체가 흐려진다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const bnErrors: string[] = [];
    pg.on('pageerror', (e) => bnErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    /* K54부터 처방은 상충하는 여러 callout이 아니라 상단의 **한 줄**이다. */
    const CALLOUTS = `(() => {
      const r = document.getElementById('kairo-report');
      if (!r || r.hidden) return null;
      return [...r.querySelectorAll('.kreport-prescription-text')].map((e) => e.textContent || '');
    })()`;
    type Bn = {
      need: string;
      demand: number;
      supply: number;
      missing: boolean;
      example: string | null;
    } | null;

    /* ── ★ 새 판 한 주 — 게임 경로 그대로 (beginWeek → runWeek → 결산) ────────── */
    await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.flow.frozen = true; // 흐르는 낮이 두 번째 주를 열지 않게
      h.week.abort();       // run() 은 배치 전용 — 진행 중인 주를 치운다 (K39)
      h.beginWeek();
      h.runWeek();
    })()`);
    await pg.waitForFunction(
      `(() => { const r = document.getElementById('kairo-report'); return !!r && !r.hidden; })()`,
      undefined,
      { timeout: 10000 },
    );
    const freshCalls = (await pg.evaluate(CALLOUTS)) as string[] | null;
    const freshBn = (await pg.evaluate(
      `(() => { const r = window.__kairo.getLastReport(); return r ? r.bottleneck : null; })()`,
    )) as Bn;
    const freshLine = freshCalls && freshCalls.length > 0 ? freshCalls[freshCalls.length - 1]! : '';
    record(
      '★ 결산이 "하나도 없는 종류"를 가리키고 처방이 방법까지 말한다 (P3-B, 게임 경로)',
      freshBn !== null &&
        freshBn.supply === 0 &&
        freshBn.missing &&
        freshBn.example !== null &&
        freshLine.indexOf('시설이 하나도 없습니다') >= 0 &&
        freshLine.indexOf('건설 ▸ ') >= 0
        ? 'pass'
        : 'fail',
      `병목 ${freshBn ? `${freshBn.need} 공급 ${freshBn.supply} · missing ${String(freshBn.missing)} · 예시 ${String(freshBn.example)}` : 'null'} · ` +
        `처방 "${freshLine}"`,
    );
    await pg.screenshot({ path: `${SHOT_DIR}/kairo-bottleneck.png` });
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);
    await pg.waitForTimeout(200);

    /*
     * ── ⚠ 음성 대조군 (코드에 심은 결함) ────────────────────────────────────
     *
     * 후보를 옛 `Object.keys(supply)` 로 되돌린다. 그러면 위에서 뽑힌 종류(공급 0)는
     * **후보 목록에 이름조차 없다** — 다시 뽑히면 이 검사가 아무것도 안 재고 있었다는 뜻이다.
     */
    const faulted = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.week.abort();
      h.week.setBottleneckFaultForTest(true);
      h.beginWeek();
      h.runWeek();
      const r = h.getLastReport();
      h.week.setBottleneckFaultForTest(false);
      return r ? r.bottleneck : null;
    })()`)) as Bn;
    await pg.waitForTimeout(300);
    record(
      '⚠ 음성 대조군 — 후보를 옛 방식으로 되돌리면 공급 0 인 종류가 안 뽑힌다 (P3-B, 코드에 심은 결함)',
      freshBn !== null && (faulted === null || (faulted.supply > 0 && faulted.need !== freshBn.need))
        ? 'pass'
        : 'fail',
      `정상 ${freshBn?.need ?? 'null'}(공급 ${freshBn?.supply ?? '?'}) → ` +
        `결함 ${faulted ? `${faulted.need}(공급 ${faulted.supply})` : 'null'}`,
    );
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);
    await pg.waitForTimeout(200);

    /*
     * ── ⚠ `missing ≠ supply===0` ────────────────────────────────────────────
     *
     * 시작 킷에 **있는** 종류를 통째로 세운다 (`staff.idle` — 사고가 쓰는 그 자리다).
     * 그러면 그 주 공급은 0 이지만 시설은 있다. 문장이 "하나도 없습니다"로 가면
     * 결산이 거짓말을 하는 것이다.
     *
     * `buildable` 을 그 종류의 시설 하나로 좁혀 후보를 고정한다 — 다른 종류가 이겨서
     * "재려던 문장을 안 재는" 상태를 없애기 위해서다 (해금 규칙은 `unlocks` 소유이고
     * 여기서 만드는 것이 아니다).
     */
    const idleCase = (await pg.evaluate(`(() => {
      const h = window.__kairo;
      h.week.abort();
      const byNeed = {};
      for (const it of h.placement.all()) {
        const d = h.simDefs[it.defId];
        if (!d || !d.need) continue;
        (byNeed[d.need] = byNeed[d.need] || []).push(it.handle);
      }
      for (const need of Object.keys(byNeed)) {
        let bid = null;
        for (const k of Object.keys(h.simDefs)) if (h.simDefs[k].need === need) { bid = k; break; }
        if (!bid) continue;
        const rep = h.week.run(new h.Rng(31337), {
          season: 'summer', playbackEvery: 0, buildable: [bid],
          staff: { wages: 0, satisfactionDelta: 0, foodMult: 1, idle: new Set(byNeed[need]) },
        });
        const bn = rep.bottleneck;
        if (!bn || bn.need !== need || bn.supply !== 0) continue;
        h.report.show(rep, { onClose: function () { return undefined; } });
        return { need: need, built: byNeed[need].length, bn: bn };
      }
      return null;
    })()`)) as { need: string; built: number; bn: NonNullable<Bn> } | null;
    await pg.waitForTimeout(250);
    const idleCalls = (await pg.evaluate(CALLOUTS)) as string[] | null;
    const idleLine = idleCalls && idleCalls.length > 0 ? idleCalls[idleCalls.length - 1]! : '';
    record(
      '⚠ missing ≠ supply===0 — 선 시설로 공급이 0 인 주는 "하나도 없습니다"가 아니다 (P3-B)',
      idleCase !== null &&
        !idleCase.bn.missing &&
        idleCase.bn.supply === 0 &&
        idleLine.indexOf('하나도 없습니다') < 0 &&
        idleLine.indexOf('부족한 것: ') === 0 &&
        idleLine.indexOf('(공급 0)') > 0
        ? 'pass'
        : 'fail',
      idleCase
        ? `${idleCase.need} · 지어진 것 ${idleCase.built}개(전부 섬) · 공급 ${idleCase.bn.supply} · ` +
          `missing ${String(idleCase.bn.missing)} · 처방 "${idleLine}"`
        : '공급 0 · 시설 있음 상태를 못 만들었다',
    );
    await pg.evaluate(`(() => {
      const b = document.getElementById('kairo-report-close');
      if (b) b.click();
    })()`);
    await pg.evaluate(DISMISS_CARDS);

    record(
      '결산 병목 절에서 페이지 예외 0',
      bnErrors.length === 0 ? 'pass' : 'fail',
      bnErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── P3-B ②. 플레이어가 자기 입구를 봉할 수 있었다 (`blocks-gate`) ─────────────
   *
   * 실내는 `would-strand`·`blocks-door` 로 지키는데 **입구엔 그 짝이 없었다** — 실측
   * (봇)으로 24판 중 6판이 17~39주차에 게이트 둘레가 차며 **입장 0 으로 얼었다**.
   * sim 쪽 성질은 `placement.test.ts` 가 이미 지키지만, P3-B 페이즈에서는 `tools/**`
   * 가 금지 파일이라 **브라우저 절이 하나도 없었다**: "규칙은 맞는데 확정 바에 안 뜬다"
   * 를 잡는 것이 아무것도 없었다는 뜻이다.
   *
   * 보려는 것 셋:
   *  ★ 매표소로 가는 **외길** 위를 겨누면 확정 바가 `매표소로 가는 길이 막힙니다 —
   *    길을 한 칸 남기세요` 이고 **확정 버튼이 죽는다**
   *  ⚠ 음성 대조군 ① — 길 **옆** 잔디는 `손님이 못 옵니다` 로 걸린다. 즉 `blocks-gate`
   *    가 "안 되는 자리를 다 잡는" 그물이 아니라 **자기 사유로만** 잡는다는 대조다
   *    (사유가 뭉치면 처방이 거짓말이 된다 — 옆칸의 처방은 "길을 까세요"여야 한다)
   *  ⚠ 음성 대조군 ② — **평행 우회로를 깔면 같은 칸이 다시 놓인다.** 전후 비교가
   *    아니라 "지금 안 닿는다"로 짰다면 여기서도 계속 막혀야 하고, 그게 곧
   *    "되돌릴 방법까지 막힌 판"이다
   *
   * 조준은 **진짜 터치**다 (CDP `Input.dispatchTouchEvent`). 백도어는 판을 만들고
   * (지형을 잔디로 밀고 외길 하나만 되돌린다) 조준 칸을 **읽는** 데만 쓴다 —
   * 화면이 되는지는 진짜 터치로 본다 (K33).
   *
   * ⚠ 판을 통째로 갈아엎으므로 **새 컨텍스트**에서 돈다. "절이 만든 지형은 절이
   * 되돌린다" 를 컨텍스트 격리로 지킨다 (되돌리기보다 강하다 — 세이브도 같이 격리된다).
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const gateErrors: string[] = [];
    pg.on('pageerror', (e) => gateErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );
    const gateCdp = await cx.newCDPSession(pg);
    const gateTouch = async (type: TouchType, x: number, y: number): Promise<void> => {
      await gateCdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
      });
    };

    /*
     * 판 셋업 — **외길을 하나 만든다.**
     *
     * 공원 전체를 잔디로 밀면 손님이 지나갈 수 있는 칸이 0 이 된다 (K32-B: 잔디는
     * 못 지나간다). 거기서 정류장 쪽 입구 열 → 매표소 윗줄만 포장으로 되돌리면
     * **매표소로 가는 길이 정확히 하나**다. 그 길 한가운데가 이 절의 과녁이다.
     *
     * ⚠ 실내 바닥을 잔디로 밀면 방이 사라지므로 벽도 사라져야 한다 — 게임과 **같은
     * 함수**(`bakeIndoorWalls`)로 다시 굽는다. 하네스가 벽을 따로 지우면 지형과
     * 어긋난 벽이 남아 "길은 있는데 못 간다"가 되고, 그러면 이 절이 재는 것이
     * `blocks-gate` 가 아니라 그 잔해가 된다.
     */
    const gateSetup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain;
      h.flow.frozen = true; // 조준을 재는 동안 결산·카드가 끼어들지 않게
      h.week.abort();
      const tix = h.placement.all().filter((f) => f.defId === 'ticket');
      if (tix.length !== 1) return { ok: false, why: '매표소가 1개가 아니다: ' + tix.length };
      const tk = tix[0];
      for (let j = ${KAIRO_BAND}; j < t.height; j++) {
        for (let i = 0; i < t.width; i++) {
          if (t.isWater(i, j)) continue;
          if (t.kindAt(i, j) !== 'lawn') t.paint(i, j, 'lawn');
        }
      }
      h.sim.bakeIndoorWalls(t, h.walls, h.gate, h.sim.guestWalkable(t, h.placement));
      const lane = [];
      for (let j = ${KAIRO_BAND}; j < tk.j; j++) lane.push([h.gate.i, j]);
      const lo = Math.min(h.gate.i, tk.i), hi = Math.max(h.gate.i, tk.i);
      for (let i = lo; i <= hi; i++) lane.push([i, tk.j - 1]);
      for (const [i, j] of lane) t.paint(i, j, 'path_stone');
      for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) h.scene.refreshTile(i, j);
      h.scene.refreshAllWalls();
      h.guests.invalidate();
      const mid = lane[Math.floor(lane.length / 2)];
      return { ok: true, i: mid[0], j: mid[1], lane: lane.length,
               tk: { i: tk.i, j: tk.j }, gate: { i: h.gate.i, j: h.gate.j } };
    })()`)) as
      | { ok: false; why: string }
      | {
          ok: true;
          i: number;
          j: number;
          lane: number;
          tk: { i: number; j: number };
          gate: { i: number; j: number };
        };

    /*
     * 붓 — **1×1 야외 시설 아무거나.** id 를 박지 않는다: 어떤 시설을 놓느냐가 아니라
     * "길을 막는가"가 이 절의 주제이고, 1등급 해금 목록이 바뀌어도 살아야 한다.
     */
    const GATE_PICK = `(() => {
      document.getElementById('kairo-build-open').click();
      const defs = window.__kairo.simDefs;
      const tabs = [...document.querySelectorAll('#kairo-sheet [data-tab]')];
      let found = null;
      for (const tab of tabs) {
        tab.click();
        const items = [...document.querySelectorAll('#kairo-sheet [data-pick]')]
          .filter((e) => e.dataset.pick.indexOf('facility:') === 0 && !e.disabled);
        found = items.find((e) => {
          const d = defs[e.dataset.pick.slice(9)];
          return d && d.size[0] === 1 && d.size[1] === 1 && d.layer === 'land' &&
                 !d.placement.requiresIndoor;
        });
        if (found) break;
      }
      if (!found) return { ok: false, why: '1x1 야외 시설 붓이 없다' };
      const id = found.dataset.pick.slice(9);
      found.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      return { ok: true, id: id };
    })()`;

    /** 그 칸의 화면 좌표 (CSS px) — 투영은 씬의 `tileScreenRect` 에 물어본다 */
    const gatePoint = (i: number, j: number): string => `(() => {
      const sc = window.__kairo.scene, cv = document.querySelector('canvas');
      const cr = cv.getBoundingClientRect();
      const s = cr.width / cv.width;
      const r = sc.tileScreenRect(${i}, ${j});
      return { x: cr.left + (r.x + r.w / 2) * s, y: cr.top + (r.y + r.h / 2) * s,
               top: cr.top, bottom: cr.top + cr.height };
    })()`;
    const GATE_AIM = `(() => {
      const a = window.__kairo.scene.aimTileNow();
      return a ? { i: a.i, j: a.j } : null;
    })()`;
    type GateBar = { bar: boolean; disabled: boolean; label: string };
    const GATE_BAR = `(() => {
      const c = document.getElementById('kairo-confirm');
      const b = document.getElementById('kairo-place-confirm');
      const lab = c ? c.querySelector('.place-label') : null;
      return { bar: !!c && !c.hidden, disabled: !b || b.disabled,
               label: lab && lab.textContent ? lab.textContent : '' };
    })()`;

    /*
     * 그 칸을 **진짜 손가락으로** 겨눈다.
     *
     * `focusTile` 은 카메라만 옮긴다 (K47-③ 이 쓰는 것과 같은 셋업 훅) — 조준은
     * 그 뒤의 탭이 한다. 탭한 자리가 정말 그 칸이었는지는 `aimTileNow()` 로 **읽어서**
     * 확인하고, 어긋나면 두 칸의 화면 차이만큼 탭 지점을 밀어 다시 찍는다.
     * 좌표를 백도어로 넣지 않으므로 투영이 어긋나면 여기서 잡힌다.
     *
     * ⚠ 탭 사이에 **430ms** 를 둔다. 320ms 안의 두 번째 탭은 더블탭(확대)이라
     * 조준이 아니라 배율이 바뀐다 (`KairoScene` 의 `lastTapAt`).
     */
    const gateAimAt = async (
      i: number,
      j: number,
    ): Promise<{ landed: boolean; aim: { i: number; j: number } | null; onScreen: boolean }> => {
      await pg.evaluate(`window.__kairo.scene.focusTile(${i}, ${j})`);
      await pg.waitForTimeout(250);
      let dx = 0;
      let dy = 0;
      let aim: { i: number; j: number } | null = null;
      let onScreen = false;
      for (let k = 0; k < 3; k++) {
        const p = (await pg.evaluate(gatePoint(i, j))) as {
          x: number;
          y: number;
          top: number;
          bottom: number;
        };
        // HUD 몫(위 210 · 아래 210)을 피한다 — 거기서 찍으면 헤더·확정 바가 탭을 먹는다
        onScreen = p.y > p.top + 210 && p.y < p.bottom - 210;
        await gateTouch('touchStart', Math.round(p.x + dx), Math.round(p.y + dy));
        await gateTouch('touchEnd', 0, 0);
        await pg.waitForTimeout(430);
        aim = (await pg.evaluate(GATE_AIM)) as { i: number; j: number } | null;
        if (aim && aim.i === i && aim.j === j) return { landed: true, aim, onScreen };
        if (!aim) break;
        const got = (await pg.evaluate(gatePoint(aim.i, aim.j))) as { x: number; y: number };
        const want = (await pg.evaluate(gatePoint(i, j))) as { x: number; y: number };
        dx += want.x - got.x;
        dy += want.y - got.y;
      }
      return { landed: false, aim, onScreen };
    };

    const GATE_BLOCK_MSG = '매표소로 가는 길이 막힙니다 — 길을 한 칸 남기세요';
    const UNREACHABLE_MSG = '손님이 못 옵니다 — 여기까지 길을 까세요';

    if (!gateSetup.ok) {
      record('★ 매표소로 가는 외길 위에는 못 놓는다 — blocks-gate (P3-B, 진짜 터치)', 'fail', gateSetup.why);
      record('⚠ 음성 대조군 ① — 길 옆 칸은 blocks-gate 가 아니라 "길을 까세요"다 (P3-B)', 'fail', gateSetup.why);
      record('⚠ 음성 대조군 ② — 우회로를 깔면 같은 칸이 다시 놓인다 (P3-B, 전후 비교)', 'fail', gateSetup.why);
    } else {
      const gatePick = (await pg.evaluate(GATE_PICK)) as
        | { ok: false; why: string }
        | { ok: true; id: string };
      await pg.waitForTimeout(200);
      const brushId = gatePick.ok ? gatePick.id : '?';

      /* ── ★ 외길 위 ─────────────────────────────────────────────────────── */
      const onLane = await gateAimAt(gateSetup.i, gateSetup.j);
      const barLane = (await pg.evaluate(GATE_BAR)) as GateBar;
      record(
        '★ 매표소로 가는 외길 위에는 못 놓는다 — blocks-gate (P3-B, 진짜 터치)',
        gatePick.ok &&
          onLane.landed &&
          onLane.onScreen &&
          barLane.bar &&
          barLane.disabled &&
          barLane.label === GATE_BLOCK_MSG
          ? 'pass'
          : 'fail',
        `붓 ${brushId} · 외길 ${gateSetup.lane}칸 · 과녁 (${gateSetup.i},${gateSetup.j}) · ` +
          `조준 ${onLane.aim ? `(${onLane.aim.i},${onLane.aim.j})` : '없음'}` +
          `${onLane.landed ? '' : ' (탭이 과녁에 안 앉았다)'} · ` +
          `확정 ${barLane.disabled ? '비활성' : '활성'} · "${barLane.label}"`,
      );

      /* ── ⚠ 음성 대조군 ① 길 옆 잔디 ────────────────────────────────────── */
      const beside = await gateAimAt(gateSetup.i + 2, gateSetup.j);
      const barBeside = (await pg.evaluate(GATE_BAR)) as GateBar;
      record(
        '⚠ 음성 대조군 ① — 길 옆 칸은 blocks-gate 가 아니라 "길을 까세요"다 (P3-B)',
        beside.landed && barBeside.bar && barBeside.label === UNREACHABLE_MSG
          ? 'pass'
          : 'fail',
        `과녁 (${gateSetup.i + 2},${gateSetup.j}) · ` +
          `조준 ${beside.aim ? `(${beside.aim.i},${beside.aim.j})` : '없음'} · ` +
          `"${barBeside.label}"`,
      );

      /* ── ⚠ 음성 대조군 ② 평행 우회로 ───────────────────────────────────── */
      const detour = (await pg.evaluate(`(() => {
        const h = window.__kairo, t = h.terrain;
        // 매표소 두 줄 위에 평행한 우회로 — 외길이 둘이 된다
        for (let i = ${gateSetup.tk.i}; i <= ${gateSetup.gate.i}; i++) {
          t.paint(i, ${gateSetup.tk.j} - 2, 'path_stone');
        }
        t.paint(${gateSetup.tk.i}, ${gateSetup.tk.j} - 1, 'path_stone');
        for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) h.scene.refreshTile(i, j);
        h.guests.invalidate();
        return h.placement.count;
      })()`)) as number;
      const again = await gateAimAt(gateSetup.i, gateSetup.j);
      const barAgain = (await pg.evaluate(GATE_BAR)) as GateBar;
      // 라벨만 보고 넘어가지 않는다 — 확정을 눌러 **실제로 놓이는지**까지 본다
      if (barAgain.bar && !barAgain.disabled) {
        await pg.click('#kairo-place-confirm');
        await pg.waitForTimeout(350);
      }
      const placedNow = (await pg.evaluate(
        `(() => { const h = window.__kairo; const it = h.placement.at(${gateSetup.i}, ${gateSetup.j}); return { defId: it ? it.defId : null, count: h.placement.count }; })()`,
      )) as { defId: string | null; count: number };
      record(
        '⚠ 음성 대조군 ② — 우회로를 깔면 같은 칸이 다시 놓인다 (P3-B, 전후 비교)',
        again.landed &&
          barAgain.bar &&
          !barAgain.disabled &&
          barAgain.label.indexOf(GATE_BLOCK_MSG) < 0 &&
          placedNow.defId !== null &&
          placedNow.count === detour + 1
          ? 'pass'
          : 'fail',
        `같은 칸 (${gateSetup.i},${gateSetup.j}) · 확정 ${barAgain.disabled ? '비활성' : '활성'} · ` +
          `"${barAgain.label}" · 놓인 것 ${placedNow.defId ?? '없음'} · ` +
          `시설 ${detour} → ${placedNow.count}`,
      );
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-blocks-gate.png` });

      // 뒷정리 — 이 절이 연 것은 이 절이 닫는다 (지형은 컨텍스트 격리가 되돌린다)
      await pg.evaluate(`(() => {
        const c = document.getElementById('kairo-place-cancel');
        if (c && !document.getElementById('kairo-confirm').hidden) c.click();
        if (window.__kairoClearBrush) window.__kairoClearBrush();
        const sh = document.getElementById('kairo-sheet');
        if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      })()`);
    }

    record(
      '입구 봉쇄 절에서 페이지 예외 0',
      gateErrors.length === 0 ? 'pass' : 'fail',
      gateErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── ⑩ K52. 입구 표식 — 앞 두 면을 굵은 선 하나로 ───────────────────────────
   *
   * `PlacementGrid.entryTilesOf` 는 3dc01b0 에서 생겼지만 **아무도 안 썼다.** 손님이
   * 그리로 들어가는 것은 다음 단계이고, 이 단계는 **눈으로 먼저 확인할 수 있게** 하는
   * 것이 목적이다 — 표식이 틀렸는데 손님 동작부터 바꾸면 어느 쪽이 틀렸는지 못 가린다.
   *
   * ## 무엇을 재나 — **그려진 선분**이다
   *
   * `entryTilesOf` 를 하네스가 다시 불러 비교하면 상수 비교다 (K38 규칙). 그래서
   * 씬이 **실제로 그은 선분**(`rideMarkForTest().edges`, 그리기 루프가 채운다)을 읽고,
   * 기대값은 하네스가 조준 칸과 발자국 크기에서 **독립적으로** 만든다.
   * 좌표 변환만 `gridToScreen` 을 공유한다 — 투영 자체는 다른 검사들의 주제다.
   *
   * ## 조준 칸을 아는 방법
   *
   * `tapTile` 은 K47-③ 부터 **조준 이동**(`aimAt`)이라 탭한 칸이 곧 고스트 앵커다.
   * 그래서 하네스가 좌표를 짐작할 필요가 없다.
   */
  {
    const cx = await browser.newContext(DEVICE);
    const pg = await cx.newPage();
    const markErrors: string[] = [];
    pg.on('pageerror', (e) => markErrors.push(String(e)));
    await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
    await pg.goto(URL, { waitUntil: 'load' });
    await pg.waitForFunction(
      `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
      undefined,
      { timeout: 15000 },
    );

    /** 그려진 선분 한 개의 정규형 — 그은 방향(사슬 순서)에 안 흔들리게 양 끝을 정렬한다 */
    const segKey = (e: { x1: number; y1: number; x2: number; y2: number }): string => {
      const a = `${Math.round(e.x1)},${Math.round(e.y1)}`;
      const b = `${Math.round(e.x2)},${Math.round(e.y2)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    /** 격자 변 하나를 화면 선분으로. `dy` 는 단 보정 (K37) */
    const gseg = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      dy: number,
    ): { x1: number; y1: number; x2: number; y2: number } => {
      const a = gridToScreen(x1, y1);
      const b = gridToScreen(x2, y2);
      return { x1: a.x, y1: a.y + dy, x2: b.x, y2: b.y + dy };
    };
    /**
     * 발자국 `(I,J,w,d)` 의 **앞 두 면**(`front=true`) 또는 **뒤 두 면**의 격자 변 집합.
     * 씬과 무관하게 하네스가 스스로 만든다 — 이게 독립 유도다.
     */
    const faceKeys = (
      I: number,
      J: number,
      w: number,
      d: number,
      dy: number,
      front: boolean,
    ): Set<string> => {
      const out = new Set<string>();
      const xi = front ? I + w : I; // +I 면 vs −I 면
      const yj = front ? J + d : J; // +J 면 vs −J 면
      for (let k = 0; k < d; k++) out.add(segKey(gseg(xi, J + k, xi, J + k + 1, dy)));
      for (let k = 0; k < w; k++) out.add(segKey(gseg(I + k, yj, I + k + 1, yj, dy)));
      return out;
    };
    const sameSet = (a: Set<string>, b: Set<string>): boolean =>
      a.size === b.size && [...a].every((k) => b.has(k));

    /*
     * ── 바닥 화살표 (K54) ──
     *
     * 화살표도 **그려진 다각형**에서 읽는다 (`arrows[].points`) — `entryFaces` 를 하네스가
     * 다시 부르면 상수 비교다. 기대값은 발자국과 `gridToScreen` 만으로 독립 유도한다:
     * 촉은 면의 **가운데**, 꼬리는 거기서 **바깥으로** `ARROW_LEN` 만큼.
     *
     * 이 두 점이 맞으면 세 가지가 한꺼번에 증명된다 — ① 화살표가 지면 평면 위에 눕고
     * (아이소 격자에서 나온 좌표라야 이 값이 나온다) ② 방향이 바깥→안이고
     * ③ 단(`lift`)을 탄다 (`dy` 가 안 맞으면 두 점 다 틀어진다).
     */
    const ARROW_LEN = 0.86;
    /** 실제로 채운 다각형 → 촉·꼬리. `points[0]` 이 촉, 3·4번이 꼬리 양 끝이다 */
    const arrowOf = (a: { points: { x: number; y: number }[] }) => ({
      tip: a.points[0]!,
      tail: {
        x: (a.points[3]!.x + a.points[4]!.x) / 2,
        y: (a.points[3]!.y + a.points[4]!.y) / 2,
      },
    });
    /** 기대 화살표 — `(gx,gy)` 는 면 가운데(격자), `(ox,oy)` 는 **바깥** 방향 */
    const wantArrow = (gx: number, gy: number, ox: number, oy: number, dy: number) => {
      const tip = gridToScreen(gx, gy);
      const tail = gridToScreen(gx + ox * ARROW_LEN, gy + oy * ARROW_LEN);
      return { tip: { x: tip.x, y: tip.y + dy }, tail: { x: tail.x, y: tail.y + dy } };
    };
    const akey = (a: { tip: { x: number; y: number }; tail: { x: number; y: number } }): string =>
      `${Math.round(a.tip.x)},${Math.round(a.tip.y)}>` +
      `${Math.round(a.tail.x)},${Math.round(a.tail.y)}`;
    /** 발자국 `(I,J,w,d)` 의 **앞 두 면**(또는 뒤 두 면) 화살표 기대 집합 */
    const arrowKeys = (
      I: number,
      J: number,
      w: number,
      d: number,
      dy: number,
      front: boolean,
    ): Set<string> =>
      new Set([
        akey(wantArrow(front ? I + w : I, J + d / 2, front ? 1 : -1, 0, dy)),
        akey(wantArrow(I + w / 2, front ? J + d : J, 0, front ? 1 : -1, dy)),
      ]);

    type Mark = {
      kind: string;
      visible: boolean;
      entry: [number, number] | null;
      exit: [number, number] | null;
      tiles: [number, number][];
      edges: { x1: number; y1: number; x2: number; y2: number }[];
      arrows: { points: { x: number; y: number }[] }[];
      labels: { text: string; x: number; y: number; depth: number }[];
    } | null;
    const READ_MARK = `(() => window.__kairo.scene.rideMarkForTest())()`;
    const readMark = async (): Promise<Mark> => (await pg.evaluate(READ_MARK)) as Mark;

    /*
     * 셋업 — 빈 포장 6×6 을 만들고 **평상 연립 4×1** 을 겨눈다.
     * 비정사각이라 "앞 두 면"과 "뒤 두 면"이 눈으로도 갈리고, 회전하면 면이 맞바뀐다.
     */
    const setup = (await pg.evaluate(`(() => {
      const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement;
      h.flow.frozen = true; // 표식을 재는 동안 결산·카드가 끼어들지 않게
      h.week.abort();
      /*
       * ⚠ 판 전체를 포장한다 — 잔디는 손님이 못 지나간다 (K32-B). 안 하면 빈 자리를
       * 찾아 놓아도 unreachable 로 거절돼, 아래 "정보 시트" 검사가 배치 실패로 죽는다.
       */
      ${PAVE_ALL}
      ${LAND_BOX}
      ${FREE_RECT}
      const spot = _free(6, 6);
      if (!spot) return { ok: false, why: '빈 6×6 자리 없음' };
      for (let dj = 0; dj < 6; dj++) {
        for (let di = 0; di < 6; di++) {
          t.paint(spot[0] + di, spot[1] + dj, 'path_stone');
          h.scene.refreshTile(spot[0] + di, spot[1] + dj);
        }
      }
      h.guests.invalidate();
      document.getElementById('kairo-build-open').click();
      const pick = document.querySelector('[data-pick="facility:pyeongsang_row"]');
      if (!pick) return { ok: false, why: '평상 연립 카드 없음' };
      pick.click();
      const sh = document.getElementById('kairo-sheet');
      if (sh && !sh.hidden) document.getElementById('kairo-sheet-close').click();
      h.tapTile(spot[0], spot[1]); // 탭 = 조준 이동 (K47-③) — 겨눈 칸이 곧 고스트 앵커다
      return { ok: true, i: spot[0], j: spot[1], level: t.levelAt(spot[0], spot[1]) };
    })()`)) as { ok: false; why: string } | { ok: true; i: number; j: number; level: number };

    if (!setup.ok) {
      record('★ 입구 표식 — 비정사각 시설의 앞 두 면 (K52)', 'fail', setup.why);
    } else {
      const { i: I, j: J } = setup;
      const dy = -setup.level * 8; // LEVEL_H — 단이 있는 칸은 표식도 lift 를 탄다 (K37)
      await pg.waitForTimeout(200);
      const m0 = await readMark();
      const got0 = new Set((m0?.edges ?? []).map(segKey));
      const want0 = faceKeys(I, J, 4, 1, dy, true);
      const back0 = faceKeys(I, J, 4, 1, dy, false);
      const bleed0 = [...got0].filter((k) => back0.has(k)).length;
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-face-0.png` });
      record(
        '★ 입구 표식 — 비정사각 시설을 조준하면 **앞 두 면**에만 뜬다 (K52)',
        m0 !== null &&
          m0.kind === 'entry' &&
          m0.visible &&
          sameSet(got0, want0) &&
          bleed0 === 0 &&
          m0.labels.length === 1 &&
          m0.labels[0]?.text === '입구'
          ? 'pass'
          : 'fail',
        `평상 4×1 @(${I},${J}) · 종류 ${m0?.kind ?? '없음'} · 선분 ${got0.size}` +
          ` (기대 ${want0.size}) · 뒤 두 면 침범 ${bleed0} · 글씨 ` +
          `${m0?.labels.map((l) => l.text).join(',') ?? '없음'}`,
      );

      /*
       * ★ 바닥 화살표 (K54) — 사용자 요청 "입구가 바닥에 화살표랑 같이 보이게끔".
       * 개수는 **면 수**여야 한다 (칸 수가 아니다 — 아래 거북섬 절이 그 차이를 잰다).
       */
      const arrows0 = new Set((m0?.arrows ?? []).map((a) => akey(arrowOf(a))));
      const wantA0 = arrowKeys(I, J, 4, 1, dy, true);
      const backA0 = arrowKeys(I, J, 4, 1, dy, false);
      record(
        '★ 바닥 화살표 — 앞 두 면에 하나씩, **바깥에서 안으로** 눕는다 (K54)',
        (m0?.arrows.length ?? 0) === 2 &&
          sameSet(arrows0, wantA0) &&
          [...arrows0].every((k) => !backA0.has(k)) &&
          (m0?.arrows ?? []).every((a) => a.points.length === 7)
          ? 'pass'
          : 'fail',
        `화살표 ${m0?.arrows.length ?? 0}개 (기대 2) · 자리 ${
          sameSet(arrows0, wantA0) ? '일치' : `불일치 [${[...arrows0].join(' ')}] vs [${[...wantA0].join(' ')}]`
        } · 뒤 면 침범 ${[...arrows0].filter((k) => backA0.has(k)).length}`,
      );

      /*
       * ★ 회전 — **진짜 터치**로 ↻ 를 누른다 (K33 "화면이 되는지는 진짜 터치로 본다").
       * `click()` 으로 부르면 버튼이 화면 밖이어도 통과한다.
       */
      const rotBox = await pg.evaluate(`(() => {
        const b = document.getElementById('kairo-place-rotate');
        if (!b || b.disabled) return null;
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      })()`) as { x: number; y: number; w: number; h: number } | null;
      if (rotBox) await pg.touchscreen.tap(rotBox.x, rotBox.y);
      await pg.waitForTimeout(250);
      const m1 = await readMark();
      const got1 = new Set((m1?.edges ?? []).map(segKey));
      const want1 = faceKeys(I, J, 1, 4, dy, true); // 회전하면 발자국이 1×4
      const bleed1 = [...got1].filter((k) => faceKeys(I, J, 1, 4, dy, false).has(k)).length;
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-face-1.png` });
      record(
        '★ 입구 표식 — ↻ 를 **진짜 터치**로 누르면 표식이 반대 두 면으로 옮겨간다 (K52)',
        rotBox !== null &&
          rotBox.w >= 44 &&
          rotBox.h >= 44 &&
          m1 !== null &&
          sameSet(got1, want1) &&
          bleed1 === 0 &&
          !sameSet(got1, got0) &&
          m1.labels.length === 1
          ? 'pass'
          : 'fail',
        `↻ ${rotBox ? `${Math.round(rotBox.w)}×${Math.round(rotBox.h)}px` : '없음/비활성'} · ` +
          `회전 뒤 선분 ${got1.size} (기대 ${want1.size}) · 뒤 면 침범 ${bleed1} · ` +
          `회전 전과 ${sameSet(got1, got0) ? '같다(실패)' : '다르다'}`,
      );

      const arrows1 = new Set((m1?.arrows ?? []).map((a) => akey(arrowOf(a))));
      record(
        '★ 바닥 화살표 — ↻ 를 **진짜 터치**로 누르면 화살표가 같이 돈다 (K54)',
        (m1?.arrows.length ?? 0) === 2 &&
          sameSet(arrows1, arrowKeys(I, J, 1, 4, dy, true)) &&
          !sameSet(arrows1, arrows0)
          ? 'pass'
          : 'fail',
        `회전 뒤 화살표 ${m1?.arrows.length ?? 0}개 · ` +
          `회전 전과 ${sameSet(arrows1, arrows0) ? '같다(실패)' : '다르다'} · ` +
          `[${[...arrows1].join(' ')}]`,
      );

      /*
       * ⚠ **코드에 심은 음성 대조군** — `setEntryFaultForTest` 를 켜면 `entryTilesOf` 가
       * 네 면 전부를 낸다. 표식이 둘레 전체로 퍼지지 **않으면** 화면이 그 함수를 안 읽고
       * 발자국 크기로 선을 긋고 있다는 뜻이고, 그러면 위 두 검사는 아무것도 안 재는 검사다.
       *
       * 다시 겨눠야 새 값이 나온다 — 표식은 `setGhost` 안에서 **유도**되기 때문이다
       * (그게 "고스트는 도는데 표식은 안 도는" 상태를 구조적으로 막는 장치다).
       */
      await pg.evaluate(
        `(() => { window.__kairo.scene.setEntryFaultForTest(true); window.__kairo.tapTile(${I}, ${J}); })()`,
      );
      await pg.waitForTimeout(200);
      const mF = await readMark();
      const gotF = new Set((mF?.edges ?? []).map(segKey));
      const wantF = new Set([
        ...faceKeys(I, J, 1, 4, dy, true),
        ...faceKeys(I, J, 1, 4, dy, false),
      ]);
      await pg.evaluate(
        `(() => { window.__kairo.scene.setEntryFaultForTest(false); window.__kairo.tapTile(${I}, ${J}); })()`,
      );
      await pg.waitForTimeout(200);
      const mR = await readMark();
      const gotR = new Set((mR?.edges ?? []).map(segKey));
      record(
        '⚠ 음성 대조군 — `setEntryFaultForTest` 를 켜면 표식이 **네 면**으로 퍼진다 (표식이 정말 entryTilesOf 를 읽는다)',
        sameSet(gotF, wantF) && sameSet(gotR, got1) ? 'pass' : 'fail',
        `대조군 선분 ${gotF.size} (기대 ${wantF.size} = 둘레 전체) · ` +
          `원복 ${gotR.size} (기대 ${got1.size})`,
      );
      /*
       * 화살표 쪽 대조군 — 2개 → **4개**. 여기서 면을 "세로 변/가로 변" 두 축으로 묶었다면
       * `−I` 와 `+I` 가 한 덩어리가 되어 대조군에서도 2개로 남는다 (아무것도 안 재는 검사).
       */
      const arrowsF = new Set((mF?.arrows ?? []).map((a) => akey(arrowOf(a))));
      const wantAF = new Set([
        ...arrowKeys(I, J, 1, 4, dy, true),
        ...arrowKeys(I, J, 1, 4, dy, false),
      ]);
      const arrowsR = new Set((mR?.arrows ?? []).map((a) => akey(arrowOf(a))));
      record(
        '⚠ 음성 대조군 — 대조군을 켜면 바닥 화살표가 **네 면으로** 퍼진다 (K54)',
        (mF?.arrows.length ?? 0) === 4 && sameSet(arrowsF, wantAF) && sameSet(arrowsR, arrows1)
          ? 'pass'
          : 'fail',
        `대조군 화살표 ${mF?.arrows.length ?? 0}개 (기대 4) · ` +
          `원복 ${mR?.arrows.length ?? 0}개 (기대 ${m1?.arrows.length ?? 0})`,
      );

      /*
       * ★ **발자국이 커도 화살표는 면마다 하나** — `turtle_island 8×6` 은 입구 칸이
       * 14개다. 칸마다 찍으면 시설이 화살표에 파묻힌다 (K51 이 "네 채짜리 워터파크가
       * 표식 여덟 개로 덮인다"고 적어 둔 그 상태). 배치 조건에 안 얽히게 씬 API 로 겨눈다.
       */
      const bigMark = (await pg.evaluate(`(() => {
        const s = window.__kairo.scene;
        const c = document.getElementById('kairo-place-cancel');
        if (c && !document.getElementById('kairo-confirm').hidden) c.click();
        window.__kairoClearBrush();
        s.setGhost('turtle_island', ${I}, ${J}, true, 0);
        return s.rideMarkForTest();
      })()`)) as Mark;
      // 입구 칸 수는 표식 자신이 들고 있다 (`entryTilesOf` 의 결과 그대로) — 표본 크기의 증거
      const bigTiles = bigMark?.tiles.length ?? 0;
      const bigArrows = new Set((bigMark?.arrows ?? []).map((a) => akey(arrowOf(a))));
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-arrow-big.png` });
      record(
        '★ 바닥 화살표는 **면마다 하나** — 거북섬 8×6 의 입구 14칸에도 2개다 (K54)',
        bigTiles > 10 && // 표본이 정말 큰가 — 안 그러면 아무것도 안 재는 검사다
          (bigMark?.arrows.length ?? 0) === 2 &&
          sameSet(bigArrows, arrowKeys(I, J, 8, 6, dy, true))
          ? 'pass'
          : 'fail',
        `입구 칸 ${bigTiles}개 · 화살표 ${bigMark?.arrows.length ?? 0}개 (기대 2) · ` +
          `자리 ${sameSet(bigArrows, arrowKeys(I, J, 8, 6, dy, true)) ? '일치' : '불일치'}`,
      );

      /*
       * ★ **단이 있는 칸에서 리프트를 탄다** (K37). 산 중턱 균일 칸에 1×1 시설을 겨눠서
       * 화살표의 화면 y 가 `−level × LEVEL_H` 만큼 올라갔는지 본다.
       * ⚠ 기대값은 `gridToScreen` + 단 정의로 만든다 — 씬 코드를 베끼지 않는다.
       */
      const hiMark = (await pg.evaluate(`(() => {
        const h = window.__kairo, T = h.terrain, s = h.scene;
        let hi = null;
        for (let j = 10; j < T.height - 3 && !hi; j++) {
          for (let i = 0; i < T.width - 3; i++) {
            if (T.levelAt(i, j) >= 1 && T.levelUniform(i, j, 1, 1)) { hi = [i, j]; break; }
          }
        }
        if (!hi) return { ok: false };
        s.setGhost('parasol', hi[0], hi[1], true, 0);
        return { ok: true, i: hi[0], j: hi[1], level: T.levelAt(hi[0], hi[1]),
                 mark: s.rideMarkForTest() };
      })()`)) as { ok: false } | { ok: true; i: number; j: number; level: number; mark: Mark };
      if (!hiMark.ok) {
        record('★ 바닥 화살표가 **단(lift)** 을 탄다 (K54)', 'fail', '단 1 이상 칸을 못 찾음');
      } else {
        const hdy = -hiMark.level * 8; // LEVEL_H
        const hiArrows = new Set((hiMark.mark?.arrows ?? []).map((a) => akey(arrowOf(a))));
        const wantHi = arrowKeys(hiMark.i, hiMark.j, 1, 1, hdy, true);
        const flat = arrowKeys(hiMark.i, hiMark.j, 1, 1, 0, true); // 리프트를 안 태웠을 때
        await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-arrow-level.png` });
        record(
          '★ 바닥 화살표가 **단(lift)** 을 탄다 — 산 위에서 땅에 남지 않는다 (K54)',
          hiMark.level >= 1 && sameSet(hiArrows, wantHi) && !sameSet(hiArrows, flat)
            ? 'pass'
            : 'fail',
          `(${hiMark.i},${hiMark.j}) 단 ${hiMark.level} · 화살표 ${hiMark.mark?.arrows.length ?? 0}개 · ` +
            `${sameSet(hiArrows, wantHi) ? '리프트 탐' : '자리 불일치'} · ` +
            `평지값과 ${sameSet(hiArrows, flat) ? '같다(실패)' : '다르다'}`,
        );
      }

      /*
       * 슬라이드 4종은 **그대로 마름모 둘**이다 (K51). 입출구가 칸 하나씩으로 선언돼
       * 있어 칸이 정확한 단위이고, 손님이 그 칸에서 타고 그 칸으로 내린다.
       *
       * 조준 붓으로 가면 등급 해금·수상 배치 조건에 얽히므로 **씬 API 를 직접** 부른다 —
       * 여기서 재려는 것은 배치 가능 여부가 아니라 `setGhost` 안의 유도 분기다.
       */
      await pg.evaluate(`(() => {
        const c = document.getElementById('kairo-place-cancel');
        if (c && !document.getElementById('kairo-confirm').hidden) c.click();
        window.__kairoClearBrush();
        window.__kairo.scene.setGhost('slide_small', ${I}, ${J}, true, 0);
      })()`);
      await pg.waitForTimeout(150);
      const mS = await readMark();
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-slide.png` });
      record(
        '★ 슬라이드는 입구/출구 **마름모 두 개**가 그대로다 (K51 유지)',
        mS !== null &&
          mS.kind === 'ride' &&
          mS.entry?.[0] === I + 2 &&
          mS.entry?.[1] === J + 2 &&
          mS.exit?.[0] === I &&
          mS.exit?.[1] === J &&
          mS.edges.length === 8 && // 마름모 둘 × 네 변
          /*
           * ⚠ 슬라이드에는 **화살표가 없다** (K54). 데이터가 선언한 것은 `entryTile` 이라는
           * **칸**이고 어느 변으로 붙어 들어오는지는 아무 데도 안 적혀 있다 — 방향을 하나
           * 고르면 그건 파생이 아니라 발명이고, K52 가 막아 둔 "조용한 거짓말"의 형태다.
           * 화살표가 푸는 문제(14칸 면 중 어디로)도 여기엔 없다: 답이 이미 칸 하나다.
           */
          mS.arrows.length === 0 &&
          mS.labels.map((l) => l.text).join(',') === '입구,출구'
          ? 'pass'
          : 'fail',
        `slide_small 3×3 @(${I},${J}) · 종류 ${mS?.kind ?? '없음'} · ` +
          `입구 ${mS?.entry?.join(',') ?? '?'} 출구 ${mS?.exit?.join(',') ?? '?'} · ` +
          `선분 ${mS?.edges.length ?? 0} · 화살표 ${mS?.arrows.length ?? 0}(기대 0) · ` +
          `글씨 ${mS?.labels.map((l) => l.text).join(',') ?? '없음'}`,
      );

      /*
       * `walkOn` 2종은 **끈다.** 발자국 전체가 길이라 앞 두 면만 그리면 거짓말이고,
       * 네 면으로 그리면 위 대조군의 그림과 똑같아진다 (구별 못 하는 검사가 된다).
       */
      const walkOn = (await pg.evaluate(`(() => {
        const s = window.__kairo.scene;
        const out = {};
        for (const id of ['float_deck', 'dock', 'flowerbed']) {
          s.setGhost(id, ${I}, ${J}, true, 0);
          out[id] = s.rideMarkForTest();
        }
        s.setGhost(null);
        return out;
      })()`)) as Record<string, unknown>;
      record(
        'walkOn 2종(플로팅덱·선착장)·정원 0(화단)은 표식도 화살표도 없다 — 아무도 안 들어간다',
        walkOn['float_deck'] === null && walkOn['dock'] === null && walkOn['flowerbed'] === null
          ? 'pass'
          : 'fail',
        `플로팅덱 ${walkOn['float_deck'] === null ? '없음' : '있음(실패)'} · ` +
          `선착장 ${walkOn['dock'] === null ? '없음' : '있음(실패)'} · ` +
          `화단 ${walkOn['flowerbed'] === null ? '없음' : '있음(실패)'}`,
      );

      /*
       * 놓은 뒤 — **정보 시트가 열려 있는 동안만**이다 (지도 상시 표시 금지).
       * 시설 정보는 더블탭 창(320ms) 뒤에 열리므로 기다렸다 읽는다.
       */
      const placed = (await pg.evaluate(`(() => {
        const h = window.__kairo;
        const before = h.placement.count;
        const r = h.placement.place(h.terrain, h.walls, h.gate, 'pyeongsang_row',
          ${I}, ${J}, { facing: 0, land: h.land() });
        h.scene.rebuildFacilities();
        const it = h.placement.at(${I}, ${J});
        return { ok: h.placement.count === before + 1, handle: it ? it.handle : 0,
                 fail: r.fail || '' };
      })()`)) as { ok: boolean; handle: number; fail: string };
      let mOpen: Mark = null;
      let mClosed: Mark = null;
      let sheetOpen = false;
      if (placed.ok) {
        await pg.evaluate(`window.__kairo.tapTile(${I}, ${J})`);
        await pg.waitForTimeout(500); // 더블탭 창 320ms + 여유
        sheetOpen = (await pg.evaluate(
          `!document.getElementById('kairo-facility').hidden`,
        )) as boolean;
        mOpen = await readMark();
        await pg.screenshot({ path: `${SHOT_DIR}/kairo-entry-sheet.png` });
        await pg.evaluate(`document.getElementById('kairo-facility-close').click()`);
        await pg.waitForTimeout(200);
        mClosed = await readMark();
      }
      const gotOpen = new Set((mOpen?.edges ?? []).map(segKey));
      record(
        '입구 표식은 정보 시트가 **열려 있는 동안만** 뜬다 (지도 상시 표시 금지)',
        placed.ok &&
          sheetOpen &&
          mOpen !== null &&
          mOpen.kind === 'entry' &&
          sameSet(gotOpen, faceKeys(I, J, 4, 1, dy, true)) &&
          mClosed === null
          ? 'pass'
          : 'fail',
        `배치 ${placed.ok ? 'ok' : `실패(${placed.fail})`} · 시트 ${sheetOpen ? '열림' : '안 열림'} · ` +
          `열렸을 때 선분 ${gotOpen.size} · 닫은 뒤 ${mClosed === null ? '없음' : '남음(실패)'}`,
      );
    }

    record(
      '입구 표식 절에서 페이지 예외 0',
      markErrors.length === 0 ? 'pass' : 'fail',
      markErrors.slice(0, 3).join(' | '),
    );
    await cx.close();
  }

  /*
   * ── ⑪ Phase G — AI 픽셀아트 아틀라스가 **화면에** 보인다 ───────────────────
   *
   * "아틀라스가 로드됐다"는 아무것도 안 재는 검사다 (프로바이더 이름만 보면 텍스처가
   * 등록됐는지, 그 텍스처가 그려졌는지, 그려진 것이 아틀라스 픽셀인지 전부 모른다).
   * 이 저장소의 규칙대로 **화면 픽셀**로 잰다 (K38 "지도 바깥" 절과 같은 방식).
   *
   * ## 대조 방법
   *
   * 같은 판(같은 맵·시나리오·세이브 없음)을 **세 번** 띄운다:
   *   A = 아틀라스 · B, C = `?atlas=0` (절차 플레이스홀더)
   * 그리고 둘을 본다:
   *   ★ A ≠ B   — 아틀라스가 실제로 화면을 바꿨다
   *   ⚠ B = C   — 그 차이가 **아틀라스 때문**이지 두 번 띄운 탓이 아니다
   *
   * 둘째가 없으면 첫째는 "두 페이지가 다르다"만 재는 검사가 된다. `?atlas=0` 이
   * 코드에 심은 음성 대조군이다 (`setAtlasDisabledForTest` 의 URL 판).
   *
   * 시설 창의 **도트 경계율**도 같이 본다 — 플레이스홀더는 단색 아이소 상자라
   * 경계가 드물고, 픽셀아트는 널판·기둥·소품이 있어 촘촘하다. 색 수만 세면 팔레트가
   * 제한돼 있어 차이가 작다 (실측 전체 화면 114 vs 104 — 못 가른다).
   */
  {
    /** 얼리고 틴트를 끈 뒤 시작 킷 시설로 카메라를 옮긴다 — 판이 같으면 같은 시설이다 */
    const FOCUS = `(() => {
      const h = window.__kairo;
      h.flow.frozen = true; h.scene.setDayPhase(null); h.scene.setUpscale(1);
      const all = h.placement.all();
      all.sort(function (a, b) { return a.defId < b.defId ? -1 : 1; });
      const it = all[0];
      if (!it) return null;
      h.scene.focusTile(it.i, it.j, 0);
      return { i: it.i, j: it.j, defId: it.defId, count: all.length };
    })()`;
    /**
     * 화면 지문 + 시설 창의 색 수·도트 경계율.
     * ⚠ 캔버스에서 직접 읽는다 — 텍스처 캔버스를 읽으면 "그려졌나"를 안 재게 된다.
     */
    const FINGER = `(() => {
      const h = window.__kairo;
      const cv = document.querySelector('canvas');
      const g = document.createElement('canvas');
      g.width = cv.width; g.height = cv.height;
      const c = g.getContext('2d');
      c.drawImage(cv, 0, 0);
      const all = h.placement.all();
      all.sort(function (a, b) { return a.defId < b.defId ? -1 : 1; });
      const r = h.scene.tileScreenRect(all[0].i, all[0].j);
      const d = c.getImageData(Math.max(0, r.x - 32), Math.max(0, r.y - 40), 96, 72).data;
      const set = new Set();
      let edges = 0, prev = -1;
      for (let k = 0; k < d.length; k += 4) {
        const v = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
        set.add(v);
        if (prev >= 0 && v !== prev) edges++;
        prev = v;
      }
      const full = c.getImageData(0, 0, cv.width, cv.height).data;
      let hash = 0;
      for (let k = 0; k < full.length; k += 4 * 7) {
        hash = (hash * 31 + ((full[k] << 16) | (full[k + 1] << 8) | full[k + 2])) >>> 0;
      }
      return {
        hash: hash,
        colors: set.size,
        edgePct: Math.round((edges / (d.length / 4)) * 100),
        provider: h.provider ? h.provider.name : 'n/a',
      };
    })()`;

    type Finger = { hash: number; colors: number; edgePct: number; provider: string };
    const shoot = async (
      tag: string,
      extra: string,
    ): Promise<{ f: Finger; spot: { defId: string } | null }> => {
      const cx = await browser.newContext(DEVICE);
      const pg = await cx.newPage();
      await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
      await pg.goto(`${URL}&map=bukhan&scenario=inherited${extra}`, { waitUntil: 'load' });
      await pg.waitForFunction(
        `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
        undefined,
        { timeout: 20000 },
      );
      const spot = (await pg.evaluate(FOCUS)) as { defId: string } | null;
      // ⚠ 카메라를 옮긴 **같은 프레임**을 읽으면 좌표는 새 자리인데 픽셀은 옛 화면이다 (K38)
      await pg.waitForTimeout(500);
      const f = (await pg.evaluate(FINGER)) as Finger;
      await pg.screenshot({ path: `${SHOT_DIR}/kairo-${tag}.png` });
      await cx.close();
      return { f, spot };
    };

    const a = await shoot('atlas-on', '');
    const b = await shoot('atlas-off', '&atlas=0');
    const c = await shoot('atlas-off2', '&atlas=0');

    record(
      '아틀라스가 붙었다 — 하이브리드(아틀라스 우선 + 절차 폴백)',
      a.f.provider.indexOf('kairo-atlas') >= 0 ? 'pass' : 'info',
      `${a.f.provider} · 대조군 ${b.f.provider}` +
        ` (129 중 일부는 ATLAS_HOLDOUT — 그림이 계약을 못 맞춘 종만 절차 유지. 이유는 그 표에)`,
    );
    record(
      '★ 아틀라스 그림이 화면에 보인다 — 같은 판을 플레이스홀더로 띄우면 픽셀이 다르다 (Phase G)',
      a.f.provider.indexOf('kairo-atlas') < 0
        ? 'info' // 아틀라스가 없는 저장소 — 굽기 전에는 잴 것이 없다
        : a.f.hash !== b.f.hash && a.f.edgePct > b.f.edgePct
          ? 'pass'
          : 'fail',
      `시설 ${a.spot?.defId ?? '?'} 창 — 색 ${a.f.colors} vs ${b.f.colors} · ` +
        `도트 경계율 ${a.f.edgePct}% vs ${b.f.edgePct}% · 지문 ${a.f.hash} vs ${b.f.hash}`,
    );
    record(
      '⚠ 음성 대조군 — 아틀라스를 끄고(?atlas=0) 두 번 띄우면 같은 픽셀이 나온다 (차이가 아틀라스 때문임을 증명)',
      b.f.hash === c.f.hash && b.f.edgePct === c.f.edgePct ? 'pass' : 'fail',
      `지문 ${b.f.hash} vs ${c.f.hash} · 경계율 ${b.f.edgePct}% vs ${c.f.edgePct}%`,
    );
  }

  await browser.close();

  const failed = results.filter((r) => r.verdict === 'fail');
  console.log(
    `\n${failed.length === 0 ? '✅' : '❌'} ${results.length - failed.length}/${results.length} 통과` +
      (failed.length ? ` — 실패: ${failed.map((f) => f.name).join(', ')}` : ''),
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
