/**
 * FX 등록부 — **이름 한 줄 + 구현 한 줄**. 호출부는 이름만 안다.
 *
 * 규칙: 움직임은 alpha·scale·x/y 트윈만 · `reduced` 면 움직임만 빼고 숫자는 남긴다 ·
 * 동시 상한 `MAX_LIVE_FX` · 같은 키는 `MERGE_MS` 안에 합친다 (숫자를 더한다) ·
 * 등록부 밖에서 `scene.tweens.add` 를 부르지 말 것 (`tools/check-ui.mjs` S9 가 지킨다).
 */
import type Phaser from 'phaser';
import { DEPTH_SCREEN_FX, TILE_W, TILE_H } from '../iso.js';
import { cssVar, cssColorInt } from '../../ui/tokens.js';

export type FxName = 'money-pop' | 'splash-enter' | 'place-ok' | 'place-bad' | 'item-sparkle' | 'scent-puff' | 'temp-steam' | 'temp-frost' | 'photo-flash' | 'like-float'
  | 'splash-land' | 'wish-burst' | 'heart-float' | 'confetti' | 'fountain-spray' | 'dust-puff'
  | 'fireworks' | 'petal-fall' | 'leaf-fall' | 'lamp-twinkle' | 'snow-fall' | 'ember'
  | 'price-pop' | 'got-item' // P56-a D7: 조준 중 값 팝(같은 key 는 갈아 끼운다) · 「재료 획득!」 한 줄
  | 'buy-pop' | 'band-strip'; // P56-a2 D7: 손님 머리 위 구매 카드 「이름 ×1」(그림이 오면 그림) · 팔찌 발급 띠(등급 색이 손님 위를 지나간다)

/** 이름별 재생 횟수 (G27 검사용 — 「슬롯이 돈다」를 센다) */
export const fxFired: Record<string, number> = {};

export interface FxHost {
  scene: Phaser.Scene;
  reduced: boolean;
}

export interface FxTarget {
  /** 월드 텍셀 */
  x: number;
  y: number;
  text?: string;
  /** 합치기 키 — 같은 키가 `MERGE_MS` 안에 오면 숫자를 더한다 */
  key?: string;
  amount?: number;
}

export interface FxHandle {
  alive: boolean;
  kill(): void;
}

export const MAX_LIVE_FX = 12;
export const MERGE_MS = 700;

interface Live extends FxHandle {
  name: FxName;
  key: string | null;
  amount: number;
  text: Phaser.GameObjects.Text | null;
  born: number;
}

/** 이름 없는 한 방짜리 — 등록부 안에서만 만든다 */
function oneShot(host: FxHost, name: FxName, obj: Phaser.GameObjects.GameObject, ms: number, tween: Record<string, unknown> | null): Live {
  const h: Live = {
    name, key: null, amount: 0, text: null, born: host.scene.time.now, alive: true,
    kill() {
      if (!this.alive) return;
      this.alive = false;
      obj.destroy();
      const at = live.indexOf(this);
      if (at >= 0) live.splice(at, 1);
    },
  };
  if (host.reduced || tween === null) host.scene.time.delayedCall(ms, () => h.kill());
  else host.scene.tweens.add({ targets: obj, duration: ms, ...tween, onComplete: () => h.kill() });
  return h;
}

/** 타일 다이아몬드 윤곽 — (x,y) 는 타일 상단 꼭짓점 */
function diamond(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
  g.lineTo(x, y + TILE_H);
  g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
  g.closePath();
  g.strokePath();
}

const live: Live[] = [];

const IMPL: Record<FxName, (host: FxHost, t: FxTarget) => Live> = {
  // P56-a D7 — 원작 「800G ×1」: 조준 칸 위에 값 한 줄. 같은 key 의 이전 것은 즉시 지우고 갈아 끼운다(누적 아님)
  'price-pop': (host, t) => {
    const { scene } = host;
    for (const l of [...live]) if (l.name === 'price-pop' && l.key !== null && l.key === (t.key ?? null)) l.kill();
    const text = scene.add.text(t.x, t.y, t.text ?? '', {
      fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: '11px', color: cssVar('--fx-coin'), stroke: cssVar('--fx-stroke'), strokeThickness: 3,
    });
    text.setOrigin(0.5, 1).setDepth(DEPTH_SCREEN_FX);
    const h: Live = { name: 'price-pop', key: t.key ?? null, amount: 0, text, born: scene.time.now, alive: true, kill() { if (!this.alive) return; this.alive = false; text.destroy(); const at = live.indexOf(this); if (at >= 0) live.splice(at, 1); } };
    if (host.reduced) scene.time.delayedCall(1400, () => h.kill());
    else scene.tweens.add({ targets: text, alpha: { from: 1, to: 0 }, delay: 900, duration: 500, onComplete: () => h.kill() });
    return h;
  },
  // 「You got the Lemon!」 — 모달이 아니라 지도 위 한 줄
  'got-item': (host, t) => {
    const { scene } = host;
    const text = scene.add.text(t.x, t.y - 12, t.text ?? '획득!', {
      fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: '11px', color: cssVar('--fx-ok'), stroke: cssVar('--fx-stroke'), strokeThickness: 3,
    });
    text.setOrigin(0.5, 1).setDepth(DEPTH_SCREEN_FX);
    const h: Live = { name: 'got-item', key: t.key ?? null, amount: 0, text, born: scene.time.now, alive: true, kill() { if (!this.alive) return; this.alive = false; text.destroy(); const at = live.indexOf(this); if (at >= 0) live.splice(at, 1); } };
    if (host.reduced) scene.time.delayedCall(1200, () => h.kill());
    else scene.tweens.add({ targets: text, y: t.y - 34, alpha: { from: 1, to: 0 }, duration: 1200, ease: 'Quad.easeOut', onComplete: () => h.kill() });
    return h;
  },
  // P56-a2 D7 — 손님 머리 위 구매 카드 「크레페 ×1」: 작은 크림 카드 + 글씨가 떠오른다 (그림 시트가 오면 텍스처를 앉힐 자리 — 지금은 글씨)
  'buy-pop': (host, t) => {
    const { scene } = host;
    const label = t.text ?? '×1';
    const text = scene.add.text(0, 0, label, { fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: '10px', color: cssVar('--fx-ink') || cssVar('--fx-ok'), stroke: cssVar('--fx-card') || cssVar('--fx-stroke'), strokeThickness: 2 }).setOrigin(0.5, 0.5);
    const card = scene.add.rectangle(0, 0, text.width + 8, text.height + 4, cssColorInt('--fx-card'), 0.95).setStrokeStyle(1, cssColorInt('--fx-stroke'));
    const box = scene.add.container(t.x, t.y - 14, [card, text]).setDepth(DEPTH_SCREEN_FX);
    const h: Live = { name: 'buy-pop', key: t.key ?? null, amount: 0, text, born: scene.time.now, alive: true, kill() { if (!this.alive) return; this.alive = false; box.destroy(); const at = live.indexOf(this); if (at >= 0) live.splice(at, 1); } };
    if (host.reduced) scene.time.delayedCall(1100, () => h.kill());
    else scene.tweens.add({ targets: box, y: t.y - 34, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Quad.easeOut', onComplete: () => h.kill() });
    return h;
  },
  // P56-a2 D7 — 팔찌 발급 띠: 등급 색 띠가 손님 위를 왼쪽에서 오른쪽으로 지나가며 이름을 단다
  'band-strip': (host, t) => {
    const { scene } = host;
    const grade = Math.max(0, Math.min(4, t.amount ?? 0));
    const color = cssColorInt(`--band-${grade}`);
    const strip = scene.add.rectangle(0, 0, 26, 5, color, 1).setStrokeStyle(1, cssColorInt('--fx-stroke'));
    const text = scene.add.text(0, -9, t.text ?? '팔찌', { fontFamily: cssVar('--font-pixel-family') || 'monospace', fontSize: '9px', color: cssVar('--fx-ok'), stroke: cssVar('--fx-stroke'), strokeThickness: 2 }).setOrigin(0.5, 1);
    const box = scene.add.container(t.x - 10, t.y - 20, [strip, text]).setDepth(DEPTH_SCREEN_FX);
    const h: Live = { name: 'band-strip', key: t.key ?? null, amount: 0, text, born: scene.time.now, alive: true, kill() { if (!this.alive) return; this.alive = false; box.destroy(); const at = live.indexOf(this); if (at >= 0) live.splice(at, 1); } };
    if (host.reduced) scene.time.delayedCall(1000, () => h.kill());
    else scene.tweens.add({ targets: box, x: t.x + 10, alpha: { from: 1, to: 0 }, duration: 1000, ease: 'Sine.easeInOut', onComplete: () => h.kill() });
    return h;
  },
  'money-pop': (host, t) => {
    const { scene } = host;
    const amount = t.amount ?? 0;
    const label = t.text ?? `+${amount.toLocaleString('ko-KR')}G`;
    const text = scene.add.text(t.x, t.y - 12, label, {
      fontFamily: cssVar('--font-pixel-family') || 'monospace',
      fontSize: '11px',
      color: cssVar('--fx-coin'),
      stroke: cssVar('--fx-stroke'),
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 1).setDepth(DEPTH_SCREEN_FX);
    const handle: Live = {
      name: 'money-pop', key: t.key ?? null, amount, text, born: scene.time.now, alive: true,
      kill() {
        if (!this.alive) return;
        this.alive = false;
        text.destroy();
        const at = live.indexOf(this);
        if (at >= 0) live.splice(at, 1);
      },
    };
    if (host.reduced) {
      scene.time.delayedCall(900, () => handle.kill());
    } else {
      scene.tweens.add({ targets: text, y: t.y - 28, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Quad.easeOut', onComplete: () => handle.kill() });
    }
    return handle;
  },
  'splash-enter': (host, t) => {
    const { scene } = host;
    const g = scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    const foam = cssColorInt('--water-foam');
    g.fillStyle(foam, 0.9);
    // 물보라 — 흰 2×2 여섯 개가 위로 튄 자리 + 발밑 거품 타원
    for (let k = 0; k < 6; k++) g.fillRect(t.x - 8 + k * 3, t.y - 6 - (k % 3) * 2, 2, 2);
    g.fillStyle(foam, 0.6);
    g.fillEllipse(t.x, t.y + 1, 16, 6);
    return oneShot(host, 'splash-enter', g, 320, { alpha: { from: 1, to: 0 }, y: '-=4' });
  },
  'place-ok': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.lineStyle(1, cssColorInt('--fx-ok'), 1);
    diamond(g, t.x, t.y);
    return oneShot(host, 'place-ok', g, 240, { alpha: { from: 1, to: 0 }, scaleX: 1.1, scaleY: 1.1 });
  },
  'item-sparkle': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--water-glint'), 1);
    for (let k = 0; k < 6; k++) {
      const x = t.x - 12 + k * 5;
      const y = t.y - 4 + (k % 2) * 6;
      g.fillRect(x - 1, y - 3, 1, 7);
      g.fillRect(x - 4, y, 7, 1);
    }
    return oneShot(host, 'item-sparkle', g, 500, { alpha: { from: 1, to: 0 }, scaleX: 1.2, scaleY: 1.2 });
  },
  'scent-puff': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--scent-puff'), 0.8);
    g.fillRect(t.x - 2, t.y - 6, 4, 4);
    g.fillRect(t.x - 4, t.y - 3, 8, 2);
    g.fillRect(t.x - 1, t.y - 8, 2, 2);
    return oneShot(host, 'scent-puff', g, 1400, { alpha: { from: 0.9, to: 0 }, y: '-=10' });
  },
  'temp-steam': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--steam'), 0.45);
    g.fillRect(t.x - 2, t.y - 4, 4, 4);
    g.fillRect(t.x + 3, t.y - 8, 4, 4);
    return oneShot(host, 'temp-steam', g, 1600, { alpha: { from: 0.45, to: 0 }, y: '-=14', scaleX: 1.6 });
  },
  'temp-frost': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--pool-frost'), 1);
    g.fillRect(t.x - 6, t.y - 2, 1, 1);
    g.fillRect(t.x + 5, t.y + 1, 1, 1);
    g.fillRect(t.x, t.y - 5, 1, 1);
    return oneShot(host, 'temp-frost', g, 1200, { alpha: { from: 1, to: 0 }, y: '+=3' });
  },
  'photo-flash': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--fx-ok'), 0.85);
    g.fillRect(t.x - 12, t.y - 34, 24, 24);
    return oneShot(host, 'photo-flash', g, 180, { alpha: { from: 0.85, to: 0 } });
  },
  // ── G17 ──
  'splash-land': (host, t) => {
    // 슬라이드 착수 — 큰 물기둥 + 퍼지는 고리
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    const foam = cssColorInt('--water-foam');
    g.fillStyle(foam, 0.95);
    for (let k = 0; k < 9; k++) g.fillRect(t.x - 12 + k * 3, t.y - 10 - Math.abs(4 - k) * 2, 2, 3 + (k % 2) * 3);
    g.lineStyle(1, foam, 0.8);
    g.strokeEllipse(t.x, t.y + 1, 22, 9);
    return oneShot(host, 'splash-land', g, 460, { alpha: { from: 1, to: 0 }, scaleX: 1.5, scaleY: 1.3, y: '-=6' });
  },
  'wish-burst': (host, t) => {
    // 소원 성립 — 별 다섯이 퍼진다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--fx-star'), 1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const x = t.x + Math.cos(a) * 10; const y = t.y - 10 + Math.sin(a) * 6;
      g.fillRect(x - 1, y - 3, 2, 7); g.fillRect(x - 3, y - 1, 7, 2);
    }
    return oneShot(host, 'wish-burst', g, 700, { alpha: { from: 1, to: 0 }, scaleX: 1.8, scaleY: 1.8, y: '-=10' });
  },
  'ember': (host, t) => {
    // P18 불멍 — 숙박 자리에서 불티 셋이 흔들리며 떠오른다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--fx-ember'), 1);
    const x = t.x; const y = t.y - 6;
    g.fillRect(x - 3, y, 2, 2); g.fillRect(x + 1, y - 3, 1, 2); g.fillRect(x - 1, y + 2, 2, 1);
    return oneShot(host, 'ember', g, 800, { alpha: { from: 1, to: 0 }, y: '-=10', x: '+=2' });
  },
  'heart-float': (host, t) => {
    // 라운지 휴식 — 하트 하나가 떠오른다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--fx-heart'), 1);
    const x = t.x; const y = t.y - 14;
    g.fillRect(x - 3, y, 2, 2); g.fillRect(x + 1, y, 2, 2); g.fillRect(x - 4, y + 1, 8, 2); g.fillRect(x - 3, y + 3, 6, 1); g.fillRect(x - 2, y + 4, 4, 1); g.fillRect(x - 1, y + 5, 2, 1);
    return oneShot(host, 'heart-float', g, 900, { alpha: { from: 1, to: 0 }, y: '-=12' });
  },
  'confetti': (host, t) => {
    // 축하 — 화면 좌표(스크롤 무시)에 색종이 24장이 떨어진다
    const { scene } = host;
    const g = scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX + 1).setScrollFactor(0);
    const cols = ['--confetti-1', '--confetti-2', '--confetti-3', '--confetti-4'].map((c) => cssColorInt(c));
    for (let k = 0; k < 24; k++) {
      g.fillStyle(cols[k % 4] as number, 1);
      const x = t.x - 60 + ((k * 37) % 120); const y = t.y - 40 - ((k * 23) % 30);
      g.fillRect(x, y, 3, k % 2 ? 2 : 4);
    }
    return oneShot(host, 'confetti', g, 1400, { alpha: { from: 1, to: 0 }, y: '+=70', ease: 'Quad.easeIn' });
  },
  'fountain-spray': (host, t) => {
    // 분수 — 물방울이 위로 솟았다 떨어진다 (앰비언트)
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--water-glint'), 0.9);
    for (let k = 0; k < 5; k++) g.fillRect(t.x - 4 + k * 2, t.y - 20 - (k % 2) * 3 - Math.abs(2 - k) * 2, 1, 2);
    return oneShot(host, 'fountain-spray', g, 700, { alpha: { from: 0.9, to: 0 }, y: '+=8', scaleX: 1.6 });
  },
  'dust-puff': (host, t) => {
    // 건설 — 발밑 먼지 두 덩이
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--fx-dust'), 0.8);
    g.fillEllipse(t.x - 8, t.y + 6, 8, 4); g.fillEllipse(t.x + 8, t.y + 6, 8, 4);
    return oneShot(host, 'dust-puff', g, 380, { alpha: { from: 0.8, to: 0 }, scaleX: 1.4, y: '-=3' });
  },
  'like-float': (host, t) => {
    const { scene } = host;
    const amount = t.amount ?? 1;
    const text = scene.add.text(t.x, t.y - 30, `+${amount}`, {
      fontFamily: cssVar('--font-pixel-family') || 'monospace',
      fontSize: '11px',
      color: cssVar('--like'),
      stroke: cssVar('--fx-stroke'),
      strokeThickness: 3,
    });
    text.setOrigin(0.5, 1).setDepth(DEPTH_SCREEN_FX);
    const h: Live = {
      name: 'like-float', key: t.key ?? null, amount, text, born: scene.time.now, alive: true,
      kill() {
        if (!this.alive) return;
        this.alive = false;
        text.destroy();
        const at = live.indexOf(this);
        if (at >= 0) live.splice(at, 1);
      },
    };
    if (host.reduced) scene.time.delayedCall(900, () => h.kill());
    else scene.tweens.add({ targets: text, y: t.y - 46, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Quad.easeOut', onComplete: () => h.kill() });
    return h;
  },
  'fireworks': (host, t) => {
    // 여름 주말 저녁 불꽃 — 화면 좌표. 12갈래 점이 퍼지며 사라진다 (G27)
    const { scene } = host;
    const g = scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX + 1).setScrollFactor(0);
    const cols = ['--fw-1', '--fw-2', '--fw-3', '--fw-4'].map((c) => cssColorInt(c));
    const col = cols[(t.amount ?? 0) % 4] as number;
    g.fillStyle(col, 1);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = 6 + (k % 3) * 3;
      g.fillRect(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 2, 2);
      g.fillRect(Math.round(Math.cos(a) * r * 1.8), Math.round(Math.sin(a) * r * 1.8), 1, 1);
    }
    g.fillStyle(cssColorInt('--fac-white'), 1);
    g.fillRect(-1, -1, 3, 3);
    g.setPosition(t.x, t.y);
    return oneShot(host, 'fireworks', g, 1100, { alpha: { from: 1, to: 0 }, scaleX: 2.4, scaleY: 2.4, y: '+=10', ease: 'Quad.easeOut' });
  },
  'petal-fall': (host, t) => {
    // 봄 꽃잎 — 화면 위에서 흔들리며 떨어진다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX).setScrollFactor(0);
    g.fillStyle(cssColorInt('--petal'), 0.95);
    g.fillRect(0, 0, 2, 2); g.fillRect(2, 1, 1, 1);
    g.setPosition(t.x, t.y);
    return oneShot(host, 'petal-fall', g, 2600, { y: '+=120', x: `+=${(t.amount ?? 0) % 2 ? 18 : -18}`, alpha: { from: 0.95, to: 0.2 }, ease: 'Sine.easeInOut' });
  },
  'snow-fall': (host, t) => {
    // 겨울 눈 (P9) — 꽃잎보다 느리고 흔들림이 작다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX).setScrollFactor(0);
    g.fillStyle(cssColorInt('--snow'), 0.9);
    g.fillRect(0, 0, 2, 2);
    g.setPosition(t.x, t.y);
    return oneShot(host, 'snow-fall', g, 3400, { y: '+=140', x: `+=${(t.amount ?? 0) % 2 ? 10 : -10}`, alpha: { from: 0.9, to: 0.3 }, ease: 'Sine.easeInOut' });
  },
  'leaf-fall': (host, t) => {
    // 가을 낙엽 — 갈색/주황 두 색, 좌우로 크게 흔들린다
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX).setScrollFactor(0);
    g.fillStyle(cssColorInt((t.amount ?? 0) % 2 ? '--leaf-1' : '--leaf-2'), 0.95);
    g.fillRect(0, 0, 3, 2); g.fillRect(1, 2, 1, 1);
    g.setPosition(t.x, t.y);
    return oneShot(host, 'leaf-fall', g, 3000, { y: '+=140', x: `+=${(t.amount ?? 0) % 2 ? 26 : -26}`, angle: 90, alpha: { from: 0.95, to: 0.3 }, ease: 'Sine.easeInOut' });
  },
  'lamp-twinkle': (host, t) => {
    // 겨울 조명 — 시설 위 노란 불빛이 잠깐 켜진다 (월드 좌표)
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.fillStyle(cssColorInt('--lamp-glow'), 0.9);
    g.fillRect(-1, -1, 3, 3); g.fillRect(-3, 0, 1, 1); g.fillRect(3, 0, 1, 1); g.fillRect(0, -3, 1, 1);
    g.setPosition(t.x, t.y);
    return oneShot(host, 'lamp-twinkle', g, 700, { alpha: { from: 0.9, to: 0 }, scaleX: 1.5, scaleY: 1.5 });
  },
  'place-bad': (host, t) => {
    const g = host.scene.add.graphics();
    g.setDepth(DEPTH_SCREEN_FX);
    g.lineStyle(1, cssColorInt('--fx-bad'), 1);
    diamond(g, t.x, t.y);
    return oneShot(host, 'place-bad', g, 180, { x: { from: -2, to: 2 }, yoyo: true, repeat: 2 });
  },
};

export function playFx(host: FxHost, name: FxName, t: FxTarget): FxHandle {
  if (t.key) {
    const now = host.scene.time.now;
    const same = live.find((l) => l.name === name && l.key === t.key && now - l.born < MERGE_MS);
    if (same) {
      same.amount += t.amount ?? 0;
      same.text?.setText(name === 'like-float' ? `+${same.amount}` : `+${same.amount.toLocaleString('ko-KR')}G`);
      return same;
    }
  }
  while (live.length >= MAX_LIVE_FX) live[0]?.kill();
  fxFired[name] = (fxFired[name] ?? 0) + 1;
  const h = IMPL[name](host, t);
  live.push(h);
  return h;
}

export function liveFxCount(): number {
  return live.length;
}

export const FX_NAMES: readonly FxName[] = Object.keys(IMPL) as FxName[];
