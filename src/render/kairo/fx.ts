/**
 * 연출 등록부 (K48) — `docs/plan-live-unlock.md` §1-2 가 정해 둔 슬롯 계약의 **첫 구현**.
 *
 * ## 왜 등록부인가
 *
 * 계약은 이렇게 적혀 있다: "연출은 `playFx(scene, name, target)` 하나로만 호출한다.
 * 등록부 `FX_REGISTRY` 항목을 나중에 교체하면(파티클·스프라이트 시트) **호출부는
 * 0줄 바뀐다**." 그런데 K39~K47 을 다 돌고도 등록부 구현이 **0건**이었다 (그 문서의
 * ⚠ 감사 메모). 첫 캔버스 연출을 넣는 사람이 등록부부터 세우기로 돼 있었고, 이 파일이
 * 그것이다.
 *
 * ## 다음 연출은 어떻게 추가하나
 *
 *   1. `FxName` 유니언에 이름을 하나 더한다 (`'combo-flash'` 등)
 *   2. `FX_REGISTRY` 에 그 이름의 구현을 한 줄 등록한다
 *   3. 부르는 쪽은 `playFx(host, '이름', { i, j, … })`
 *
 * 호출부는 Phaser 를 모른다 — 타일 좌표와 이름만 안다. 그래서 나중에 구현을 통째로
 * 갈아도 씬의 코드가 안 바뀐다.
 *
 * ## 규칙
 *
 * - 움직이는 것은 **`transform`(위치·크기)·`opacity`(알파)** 뿐이다
 * - `prefers-reduced-motion` 가드 필수 — 움직임을 빼되 **정보는 남긴다**
 *   (숫자는 정보다. 안 보여 주면 이번 버그를 반만 고친 것이 된다)
 * - 색은 토큰에서 읽어 온다 (`src/ui/tokens.ts` 의 `cssVar`) — 정본은 `style.css` 하나
 * - 깊이는 띠 상수 `Z_FLOAT` (`iso.ts`). 4096 미만
 */
/*
 * ⚠ Phaser 는 **타입으로만** 가져온다. 값으로 import 하면 이 모듈이 Phaser 런타임을
 * 끌고 오고, 그러면 브라우저 없이는 단위 테스트가 안 된다 — 합치기·상한 같은 정책이
 * 브라우저 검사에서만 확인되면 회귀를 놓친다 (`kairo-camera.ts` 와 같은 이유).
 */
import type Phaser from 'phaser';
import { depthKey, tileCenter, Z_FLOAT } from './iso.js';

export type FxName = 'income-pop';

/** 씬이 연출에게 내주는 것 — Phaser 씬과 "타일 → 화면" 변환 하나 */
export interface FxHost {
  scene: Phaser.Scene;
  /** 그 칸 위의 화면 y 보정 (단·리프트). 씬만 아는 값이라 주입받는다 */
  liftAt(i: number, j: number): number;
  /** 모션을 줄여야 하나 */
  reduced: boolean;
  /** 글자색·테두리색 (토큰) */
  ink: string;
  outline: string;
}

export interface FxTarget {
  /** 타일 좌표. 발자국 가운데라 소수일 수 있다 */
  i: number;
  j: number;
  /** 띄울 글자 */
  text: string;
}

/**
 * 살아 있는 연출 하나. 합치기(같은 자리에서 연달아 날 때)가 글자를 고쳐 쓴다.
 * Phaser 를 모르는 쪽에서도 다룰 수 있도록 **인터페이스로만** 노출한다 — 그래야
 * `IncomeFx` 의 정책을 가짜 sink 로 단위 테스트할 수 있다.
 */
export interface FxHandle {
  setText(text: string): void;
  /** 아직 화면에 있나 */
  readonly alive: boolean;
  kill(): void;
}

export type FxImpl = (host: FxHost, t: FxTarget) => FxHandle;

/** 떠오르는 시간 (ms). 이 뒤에 사라진다 */
export const FLOAT_LIFE_MS = 1100;
/** 떠오르는 높이 (텍셀) */
const FLOAT_RISE = 14;
/** 시설 스프라이트를 비켜 뜨는 높이 (텍셀) */
const FLOAT_LIFT = 26;

/**
 * `+₩N` 이 떠올랐다 사라진다 — 카이로의 그 연출.
 *
 * 글자는 Phaser `Text` 다. 도트 아틀라스에 숫자 글리프가 아직 없어서인데
 * (`kairo-procedural` 은 전부 플레이스홀더다, Phase G), **여기가 등록부라서**
 * 아틀라스가 생기면 이 함수 하나만 갈면 된다.
 */
function incomePop(host: FxHost, t: FxTarget): FxHandle {
  const c = tileCenter(t.i, t.j);
  const ri = Math.round(t.i);
  const rj = Math.round(t.j);
  const y0 = c.y + host.liftAt(ri, rj) - FLOAT_LIFT;
  /*
   * ⚠ **밝은 글씨 + 두꺼운 진한 테두리**다 (실측으로 뒤집었다). 처음엔 반대로
   * (진한 초록 글씨 + 크림 테두리) 넣었는데, 잔디 위에서 초록 글씨가 지면에 묻혀
   * 얼룩으로 읽혔다. 지도의 지면은 잔디·물·포장·암반으로 밝기가 제각각이라
   * **테두리가 두꺼운 쪽이 어디서나 읽힌다** — 작은 글씨에서는 테두리가 색을
   * 지배하므로 "돈이 들어왔다"의 초록도 테두리가 낸다.
   */
  const label = host.scene.add.text(c.x, y0, t.text, {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: '12px',
    fontStyle: 'bold',
    color: host.ink,
    stroke: host.outline,
    strokeThickness: 4,
  });
  label.setOrigin(0.5, 1);
  // 정수 배율 업스케일 위에 얹히므로 2배로 그려야 글자가 뭉개지지 않는다
  label.setResolution(2);
  label.setDepth(depthKey(ri, rj) + Z_FLOAT);

  /*
   * 모션은 위치(transform)와 알파(opacity) 둘뿐이다. reduced-motion 이면 **뜨는
   * 움직임을 빼고 알파만** 쓴다 — 숫자는 정보라 지우면 안 되고, 움직임만 없앤다.
   */
  const tween = host.reduced
    ? host.scene.tweens.add({
        targets: label,
        alpha: 0,
        delay: FLOAT_LIFE_MS * 0.6,
        duration: FLOAT_LIFE_MS * 0.4,
        onComplete: () => label.destroy(),
      })
    : host.scene.tweens.add({
        targets: label,
        y: y0 - FLOAT_RISE,
        // 읽을 시간을 먼저 주고 끝에서 사라진다 — 선형으로 빼면 절반부터 안 읽힌다
        alpha: { from: 1, to: 0, ease: 'Quint.easeIn' },
        duration: FLOAT_LIFE_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => label.destroy(),
      });

  return {
    setText: (s) => label.setText(s),
    get alive(): boolean {
      return label.active;
    },
    kill: () => {
      tween.remove();
      label.destroy();
    },
  };
}

/**
 * 이름 → 연출. **여기 없는 연출은 만들지 않는다** (계약).
 */
export const FX_REGISTRY: Record<FxName, FxImpl> = {
  'income-pop': incomePop,
};

/** 연출을 하나 재생한다. 부르는 쪽이 아는 것은 이름과 타일 좌표뿐이다 */
export function playFx(host: FxHost, name: FxName, target: FxTarget): FxHandle {
  return FX_REGISTRY[name](host, target);
}

// ── 상시 연출(생기) 등록부 ─────────────────────────────────────────────────
/*
 * ## 왜 위의 `FX_REGISTRY` 에 못 얹었나
 *
 * 저쪽은 **한 번 났다 사라지는 것**이다 (`FxHandle.kill()`·`FLOAT_LIFE_MS`·글자 합치기).
 * 분수의 물줄기는 사건이 아니라 **상태**다 — 시설이 서 있는 한 계속 돌고, 죽지 않고,
 * 글자가 없다. 같은 타입에 우겨넣으면 `setText` 가 뜻 없는 껍데기가 되고 `alive` 가
 * 영원히 true 인 핸들이 상한 계산에 섞인다. 그래서 **같은 파일 안에 등록부 하나를 더**
 * 둔다 — 계약("등록부 밖 하드코딩 이펙트를 만들지 말 것")은 그대로 지킨다.
 *
 * ## 그림을 한 장도 안 쓴다
 *
 * 계약이 *"물·물결·항적·그림자는 **영구히** 절차적"* 이라고 못박아 뒀고
 * (`assets/types.ts`), `kairo-facilities.json` 의 분수에는 아예
 * `"note": "물줄기는 procedural"` 이라고 적혀 있다. 그래서 **AI 픽셀아트를 건드리지
 * 않는다**: 시설 스프라이트는 아틀라스 텍스처 그대로 두고, 그 **위에 얹는 한 장**을
 * 코드가 굽는다. `frames: 2` 를 선언해 두 프레임 다 없는 ID 를 만드는 길
 * (계획 6-A)은 지금 그림이 없어 **절차 도형 폴백 = AI 그림 상실**이 되므로 안 간다.
 *
 * ## 어디에 반짝이나 — 그림이 정한다
 *
 * 좌표를 손으로 적지 않는다. 시설 스프라이트의 **물빛 픽셀**(`isWaterPixel`)을 읽어
 * 그 위에만 얹는다. 그래서 `pool_lazy` 처럼 물이 고리 모양인 시설도, 데크·나무 부분에는
 * 한 점도 안 찍힌다. 그림이 바뀌면 반짝임도 따라 바뀐다 — 계획 3-A 가 입구를
 * "선언하지 않고 파생한다"로 뒤집은 것과 같은 판단이다.
 *
 * ## 다음 연출은 어떻게 추가하나
 *
 *   1. `AmbientName` 에 이름을 더하고 `AMBIENT_REGISTRY` 에 그리기를 등록한다
 *   2. `AMBIENT_FACILITIES` 에 `시설 id → 이름` 한 줄
 *
 * 씬 코드는 0줄 바뀐다.
 */

/** 프레임 수 — **2** (계획 6단계). 손님 스프라이트와 같은 축이다 */
export const AMBIENT_FRAMES = 2;

/**
 * 몇 프레임마다 다음 그림으로 넘어가나.
 *
 * 손님이 이미 쓰는 박자 그대로다 (`Math.floor(animTick / 6) % frames`, `KairoScene`).
 * ⚠ Phaser 애니메이션(`anims.create`)을 쓰지 않는다 — 소스 전체에 0건이고, 여기서
 * 처음 도입하면 "박자를 아는 곳"이 둘이 된다.
 */
export const AMBIENT_TICKS_PER_FRAME = 6;

/**
 * 캔버스에서 우리가 쓰는 것 **전부**. `CanvasRenderingContext2D` 를 얇게 감싼다.
 *
 * DOM 타입을 그대로 받지 않는 이유는 `fx.ts` 가 Phaser 를 타입으로만 가져오는 것과
 * 같다 — 그리기 규칙을 **브라우저 없이** 단위 테스트할 수 있어야 회귀가 잡힌다.
 */
export interface Pen {
  /** 색 하나를 집는다 (CSS 색 문자열) */
  use(color: string): void;
  /** 정수 사각형 하나. **정수 스캔라인만** — AA 는 1px 이음새를 만든다 (카이로 규칙) */
  rect(x: number, y: number, w: number, h: number): void;
}

/** RGBA8 래스터 — 시설 스프라이트를 읽는 입력 */
export interface AmbientRaster {
  w: number;
  h: number;
  /** RGBA8, `w*h*4` */
  data: Uint8Array | Uint8ClampedArray;
}

/** 색은 `style.css` 가 소유한다 — 씬이 토큰을 읽어 넘긴다 (K34) */
export interface AmbientPalette {
  /** 수면 반짝임 */
  glint: string;
  /** 거품·물보라 */
  foam: string;
}

export type AmbientImpl = (
  pen: Pen,
  src: AmbientRaster,
  phase: number,
  pal: AmbientPalette,
) => void;

export type AmbientName = 'water-glint' | 'fountain-spray';

/**
 * 이 픽셀이 **물빛**인가.
 *
 * 색 상수를 안 쓴다 — 채널 사이의 **관계**만 본다. 그래야 팔레트를 바꿔도 따라오고,
 * "색은 style.css 가 소유한다" 규칙과도 안 부딪힌다 (여긴 디자인 색이 아니라 판정이다).
 *
 * · `b > r + 24` — 나무 데크·모래·잔디를 뺀다 (그쪽은 r 이 크다)
 * · `b >= g - 12` — 청록 물은 통과시키고 **초록 잔디·거북 등딱지**는 뺀다
 * · `b > 72` · `a > 200` — 그림자 속 어두운 픽셀과 반투명 가장자리를 뺀다
 */
export function isWaterPixel(r: number, g: number, b: number, a: number): boolean {
  return a > 200 && b > 72 && b > r + 24 && b >= g - 12;
}

function waterAt(src: AmbientRaster, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= src.w || y >= src.h) return false;
  const k = (y * src.w + x) * 4;
  return isWaterPixel(
    src.data[k] as number,
    src.data[k + 1] as number,
    src.data[k + 2] as number,
    src.data[k + 3] as number,
  );
}

/** 결정론적 해시 — 프레임마다 같은 자리가 나와야 깜빡임이 아니라 **물결**로 읽힌다 */
function hash2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 반짝임 띠의 간격 (텍셀, `x + 2y` 기준).
 *
 * ⚠ **`x + 2y` 가 상수인 선은 화면에서 `+J` 축과 정확히 같은 방향이다** —
 * 투영이 `+J → (−16, +8)` 이라 `x + 2y` 가 안 변한다 (`iso.ts`). 그래서 이 띠는
 * 격자와 나란히 흐르고, 물결이 "타일에 얹힌 무늬"가 아니라 **수면 자체**로 읽힌다.
 * 세로줄(`x % n`)로 잡아 봤더니 아이소 위에서 격자무늬로 떨어졌다.
 */
const GLINT_BAND = 18;
/** 띠를 따라가며 몇 줄마다 하나씩 — 이게 없으면 띠가 굵은 대각선 줄무늬가 된다 */
const GLINT_RUN = 6;
/** 반짝임 하나의 가로 길이 */
const GLINT_LEN = 3;

/**
 * 수면 반짝임 — 물빛 픽셀 위에만 짧은 가로 획을 뿌린다.
 *
 * 프레임 사이에 띠가 `GLINT_BAND / 2` 만큼 밀린다. 위치가 **완전히 새로 뽑히는 것이
 * 아니라 밀리는** 것이 요점이다 — 무작위로 다시 뿌리면 반짝임이 아니라 노이즈가 된다.
 */
function waterGlint(pen: Pen, src: AmbientRaster, phase: number, pal: AmbientPalette): void {
  const shift = phase * (GLINT_BAND / AMBIENT_FRAMES);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const u = x + 2 * y + shift;
      if (u % GLINT_BAND !== 0) continue;
      // 띠 번호를 섞어 이웃 띠끼리 같은 줄에 서지 않게 — 서면 가로 줄무늬가 된다
      if ((y + Math.floor(u / GLINT_BAND) * 2) % GLINT_RUN !== 0) continue;
      if (hash2(x, y) % 4 === 0) continue; // 끊어 준다 — 완벽한 선은 무늬로 읽힌다
      // 획이 물 위에 온전히 얹힐 때만 — 가장자리에서 데크로 삐져나가면 안 된다
      let n = 0;
      while (n < GLINT_LEN && waterAt(src, x + n, y)) n++;
      if (n < GLINT_LEN) continue;
      pen.use(hash2(x, y) % 3 === 0 ? pal.foam : pal.glint);
      pen.rect(x, y, GLINT_LEN, 1);
    }
  }
}

/**
 * 물줄기의 **꼭대기** — 스프라이트에서 찾는다.
 *
 * 분수 그림에는 이미 물줄기가 그려져 있다 (AI 픽셀아트). 그 위에 또 물줄기를 그리면
 * 두 겹이 되므로, 우리는 **이미 있는 줄기의 끝에서 물방울을 튀긴다.** 좌표를 상수로
 * 박지 않고 그림에서 유도하므로 분수 그림이 바뀌어도 따라온다.
 */
export function sprayOrigin(src: AmbientRaster): { x: number; y: number } | null {
  for (let y = 0; y < src.h; y++) {
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < src.w; x++) {
      if (!waterAt(src, x, y)) continue;
      if (lo < 0) lo = x;
      hi = x;
    }
    if (lo >= 0) return { x: Math.round((lo + hi) / 2), y };
  }
  return null;
}

/** 물방울 — `[dx, dy]` 를 프레임마다. 위로 튀었다가(0) 벌어지며 떨어진다(1) */
const SPRAY: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0, -3],
    [-3, 0],
    [3, 1],
    [-5, 4],
    [5, 5],
  ],
  [
    [-2, -1],
    [2, -2],
    [-6, 5],
    [6, 6],
    [-8, 11],
    [8, 12],
  ],
];

/**
 * 분수 — 수면 반짝임 + 줄기 끝에서 튀는 물방울.
 *
 * 물방울은 2텍셀 사각형이다. 1텍셀이면 폰 화면(업스케일 1)에서 안 보이고, 3텍셀이면
 * 물방울이 아니라 눈발로 읽힌다 (실측으로 2 로 정했다).
 */
function fountainSpray(pen: Pen, src: AmbientRaster, phase: number, pal: AmbientPalette): void {
  waterGlint(pen, src, phase, pal);
  const o = sprayOrigin(src);
  if (!o) return;
  pen.use(pal.foam);
  for (const [dx, dy] of SPRAY[phase % SPRAY.length] as readonly (readonly [number, number])[]) {
    pen.rect(o.x + dx - 1, o.y + dy, 2, 2);
  }
}

/**
 * 이름 → 그리기. **여기 없는 상시 연출은 만들지 않는다** (계약).
 */
export const AMBIENT_REGISTRY: Record<AmbientName, AmbientImpl> = {
  'water-glint': waterGlint,
  'fountain-spray': fountainSpray,
};

/**
 * 시설 id → 상시 연출. **일곱 종뿐이다** — 사용자가 "두세 개"라고 했고 계획이
 * "10종 안팎 · 가장 싼 것부터"로 못박았다.
 *
 * 고른 기준은 하나: **자기 스프라이트 안에 물이 있는가.** 그래야 물빛 마스크가
 * 제자리에 얹힌다.
 *
 * ⚠ **워터슬라이드 3종은 일부러 뺐다.** 미끄럼틀의 파란 활강로는 물이 아니라
 * 플라스틱이라 마스크가 통째로 걸리고, 착수 물보라를 `ride.exitTile` 에 얹으려
 * 재 보니 **데이터의 출구와 그림의 출구가 다르다**: `slide_small` 은 `exitTile [0,0]`
 * (뒤쪽 꼭지점)인데 그림의 활강로 끝은 로컬 (2,0) 쪽(오른쪽 꼭지점)이다. 그 어긋남은
 * 4방향·입구(계획 3·5단계) 소관이지 애니메이션 소관이 아니다 — 여기서 물보라를 얹으면
 * 엉뚱한 자리에서 물이 튄다.
 */
export const AMBIENT_FACILITIES: Readonly<Record<string, AmbientName>> = {
  fountain: 'fountain-spray',
  footbath: 'water-glint',
  pool_kids: 'water-glint',
  pool_warm: 'water-glint',
  pool_lazy: 'water-glint',
  waterwalk: 'water-glint',
  turtle_island: 'water-glint',
};

/** 지금 프레임 번호 — 손님과 **같은 식**이다 (박자를 아는 곳이 하나여야 한다) */
export function ambientPhase(animTick: number): number {
  return Math.floor(animTick / AMBIENT_TICKS_PER_FRAME) % AMBIENT_FRAMES;
}

// ── 수입 연출의 정책 (합치기·상한) ─────────────────────────────────────────

/**
 * 같은 자리에서 난 수입을 **합쳐서 하나로** 띄우는 창 (ms).
 *
 * 근거: tick 은 200ms (배속 2× 면 100ms) 이고, 정원 8짜리 인기 시설은 이용 20tick
 * 기준 초당 두어 명이 끝난다. 700ms 창이면 그 두어 건이 **숫자 하나**로 합쳐져
 * 자리마다 살아 있는 라벨이 항상 1개다 — 창을 없애면 같은 시설 위에 숫자가 겹쳐
 * 쌓여 아무것도 안 읽힌다 (읽는 시간이 뜨는 시간보다 길다).
 */
export const MERGE_WINDOW_MS = 700;

/**
 * 동시에 떠 있을 수 있는 숫자의 상한.
 *
 * 근거: 폰 논리 폭이 393텍셀이고 `+₩12,400` 한 장이 대략 60텍셀이다. 10장이면
 * 화면 가로 폭의 1.5배 — 이미 서로 겹치기 시작하는 양이고, 그 위로는 늘려 봐야
 * 읽히는 숫자가 늘지 않는다. 1,200 손님 판에서 초당 수십 건이 터져도 여기서 끊긴다.
 *
 * ⚠ 상한에 걸린 수입은 **버려지는 것이 아니다** — 돈은 이미 현금에 들어갔고
 * 헤더 숫자가 그것을 보여 준다. 화면에 자리가 없어 자리 표시를 생략할 뿐이다.
 */
export const MAX_LIVE_FLOATS = 10;

interface Slot {
  amount: number;
  openUntil: number;
  handle: FxHandle;
}

/** 화폐 표기 — `+₩12,400` */
export function wonLabel(amount: number): string {
  return `+₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

/**
 * 수입 숫자의 **정책**만 담는다 — 합치기·상한·정리. 실제 그리기는 `sink` 가 한다.
 *
 * 왜 갈랐나: Phaser 없이 정책을 단위 테스트하기 위해서다. "상한 10 을 지킨다"·
 * "같은 시설은 합친다"를 브라우저 없이 확인할 수 있어야 회귀가 잡힌다.
 */
export class IncomeFx {
  private readonly slots = new Map<number, Slot>();
  /** 상한에 걸려 화면에 못 띄운 건수 (진단용) */
  private droppedCount = 0;

  constructor(
    private readonly sink: (t: FxTarget) => FxHandle,
    private readonly mergeMs: number = MERGE_WINDOW_MS,
    private readonly max: number = MAX_LIVE_FLOATS,
  ) {}

  get liveCount(): number {
    return this.slots.size;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  /** `key` 는 시설 handle — 같은 시설의 연속 수입이 하나로 합쳐진다 */
  add(key: number, i: number, j: number, amount: number, now: number): void {
    if (amount <= 0) return;
    this.sweep(now);
    const hit = this.slots.get(key);
    if (hit && now <= hit.openUntil) {
      hit.amount += amount;
      hit.handle.setText(wonLabel(hit.amount));
      return;
    }
    if (this.slots.size >= this.max && !hit) {
      this.droppedCount++;
      return;
    }
    // 창이 닫힌 옛 라벨은 사라지도록 두고, 자리만 새 것에 넘긴다
    const handle = this.sink({ i, j, text: wonLabel(amount) });
    this.slots.set(key, { amount, openUntil: now + this.mergeMs, handle });
  }

  /** 죽은 라벨을 걷어낸다 — 상한이 유령에 막히면 안 된다 */
  sweep(now: number): void {
    for (const [key, s] of this.slots) {
      if (!s.handle.alive || now > s.openUntil + FLOAT_LIFE_MS) this.slots.delete(key);
    }
  }

  /** 씬을 떠날 때 — 남은 라벨을 치운다 */
  clear(): void {
    for (const s of this.slots.values()) s.handle.kill();
    this.slots.clear();
  }
}
