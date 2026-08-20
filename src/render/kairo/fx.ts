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
