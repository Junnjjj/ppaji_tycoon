import { ALL_SPRITE_IDS, SPRITE_SPECS, specForId } from './manifest.js';
import { parseId, type AssetProvider, type SpriteSpec } from './types.js';

/**
 * 코드로 스프라이트를 굽는 공급자.
 *
 * 여기서 나오는 그림 중 source==='ai' 인 것은 임시다 — 나중에 AtlasProvider 가
 * AI 픽셀아트로 대체한다. source==='procedural' 인 것(물·이펙트·지형)은 영구히 이 코드가 그린다.
 */

function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error(
      'ProceduralProvider 는 브라우저에서만 동작합니다. ' +
        'sim/ 은 에셋에 의존하지 않으므로 헤드리스 러너에서는 필요하지 않습니다.',
    );
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 결정론적 해시 → [0,1). 얼룩·반점 배치용. */
function hash3(x: number, y: number, s: number): number {
  let h = (s ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const px = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  col: string,
): void => {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
};

type Variant = { palette: number; dir: string; frame: number; alt: number };
type DrawFn = (g: CanvasRenderingContext2D, w: number, h: number, v: Variant) => void;

// ══════════════════════════════════════════════════════════════
// 지형 타일
// ══════════════════════════════════════════════════════════════

/** 바탕색 + 결정론적 반점. alt 마다 다른 반점 배치로 타일 반복감을 없앤다. */
function speckle(
  base: string,
  flecks: ReadonlyArray<readonly [string, number]>,
): DrawFn {
  return (g, w, h, v) => {
    px(g, 0, 0, w, h, base);
    const seed = 0x9e37 + v.alt * 7919;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = hash3(x, y, seed);
        let acc = 0;
        for (const [col, prob] of flecks) {
          acc += prob;
          if (r < acc) {
            px(g, x, y, 1, 1, col);
            break;
          }
        }
      }
    }
  };
}

/** 물 타일 — 바탕 + 잔물결 선 */
function water(base: string, hi: string, lo: string): DrawFn {
  return (g, w, h, v) => {
    px(g, 0, 0, w, h, base);
    const seed = 0x51a7 + v.alt * 104729;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const r = hash3(x, y, seed);
        if (r < 0.05) px(g, x, y, 1, 1, hi);
        else if (r < 0.1) px(g, x, y, 1, 1, lo);
      }
    }
    // 가로 잔물결 두 줄
    for (let i = 0; i < 2; i++) {
      const wy = Math.floor(hash3(i, v.alt, seed) * h);
      const wx = Math.floor(hash3(i + 10, v.alt, seed) * (w - 6));
      px(g, wx, wy, 5, 1, hi);
    }
  };
}

const DRAW: Record<string, DrawFn> = {
  'terrain/plain': speckle('#8fbc63', [
    ['#7faa55', 0.14],
    ['#9fc973', 0.12],
  ]),
  'terrain/sand': speckle('#e8cf9a', [
    ['#dcc088', 0.12],
    ['#f0dcae', 0.1],
  ]),
  'terrain/forest': (g, w, h, v) => {
    px(g, 0, 0, w, h, '#4a7a45');
    const seed = 0x2f11 + v.alt * 31337;
    // 나무 수관 덩어리 세 개
    for (let i = 0; i < 3; i++) {
      const cx = 2 + hash3(i, v.alt, seed) * (w - 4);
      const cy = 2 + hash3(i + 5, v.alt, seed) * (h - 4);
      const r = 2.5 + hash3(i + 9, v.alt, seed) * 2;
      g.fillStyle = '#356b38';
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4e8c4c';
      g.beginPath();
      g.arc(cx - 0.7, cy - 0.7, r * 0.65, 0, Math.PI * 2);
      g.fill();
    }
  },
  'terrain/slope': (g, w, h, v) => {
    px(g, 0, 0, w, h, '#a3b568');
    // 등고선 느낌의 사선
    g.strokeStyle = '#8b9d55';
    g.lineWidth = 1;
    const off = v.alt * 3;
    for (let i = -h; i < w; i += 5) {
      g.beginPath();
      g.moveTo(i + off, h);
      g.lineTo(i + off + h, 0);
      g.stroke();
    }
  },
  'terrain/rock': (g, w, h, v) => {
    px(g, 0, 0, w, h, '#8e8b84');
    const seed = 0x71c3 + v.alt * 6151;
    for (let i = 0; i < 4; i++) {
      const x = hash3(i, v.alt, seed) * (w - 5);
      const y = hash3(i + 3, v.alt, seed) * (h - 5);
      px(g, x, y, 4, 3, '#787468');
      px(g, x, y, 4, 1, '#a5a196');
    }
  },
  'terrain/roadside': (g, w, h, v) => {
    px(g, 0, 0, w, h, '#9a958c');
    const seed = 0x4d21 + v.alt * 1543;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (hash3(x, y, seed) < 0.16) px(g, x, y, 1, 1, '#8a857c');
  },

  'terrain/shore': water('#7fd0e6', '#bfeef8', '#68bdd4'),
  'terrain/shallow': water('#5fc6de', '#a8e8f4', '#4bb0c9'),
  'terrain/deep': water('#2b9ac4', '#6fc8e0', '#2286ad'),
  'terrain/openwater': water('#1a7ba8', '#4fa8cc', '#146891'),
  'terrain/current': (g, w, h, v) => {
    px(g, 0, 0, w, h, '#16688f');
    const seed = 0x6a11 + v.alt * 2749;
    // 흐름을 나타내는 가로 줄무늬
    for (let i = 0; i < 4; i++) {
      const y = Math.floor(hash3(i, v.alt, seed) * h);
      const x = Math.floor(hash3(i + 7, v.alt, seed) * w);
      px(g, x, y, 6, 1, '#3f97bc');
    }
  },

  // ══════════════════════════════════════════════════════════════
  // 손님 — 부품 조합. 팔레트 8 × 방향 4 × 프레임 3 = 96장
  // ══════════════════════════════════════════════════════════════
  'guest/body': (g, _w, _h, v) => {
    const p = GUEST_PALETTES[v.palette % GUEST_PALETTES.length]!;
    const dir = v.dir;
    const legL = v.frame === 1 ? 1 : 0;
    const legR = v.frame === 2 ? 1 : 0;

    px(g, 4, 14 - legL, 2, 3 + legL, p.skin);
    px(g, 6, 14 - legR, 2, 3 + legR, p.skin);
    px(g, 3, 8, 6, 6, p.suit);
    px(g, 3, 8, 6, 1, 'rgba(255,255,255,0.25)');

    if (dir === 'left') px(g, 2, 9, 1, 4, p.skin);
    else if (dir === 'right') px(g, 9, 9, 1, 4, p.skin);
    else {
      px(g, 2, 9, 1, 4, p.skin);
      px(g, 9, 9, 1, 4, p.skin);
    }

    px(g, 3, 2, 6, 6, p.skin);
    px(g, 3, 1, 6, 3, p.hair);
    if (dir === 'down') {
      px(g, 4, 5, 1, 1, '#2a1a12');
      px(g, 7, 5, 1, 1, '#2a1a12');
    } else if (dir === 'left') {
      px(g, 3, 1, 4, 4, p.hair);
      px(g, 4, 5, 1, 1, '#2a1a12');
    } else if (dir === 'right') {
      px(g, 5, 1, 4, 4, p.hair);
      px(g, 7, 5, 1, 1, '#2a1a12');
    } else {
      px(g, 3, 1, 6, 5, p.hair);
    }
  },
};

const GUEST_PALETTES = [
  { skin: '#ffdcb4', hair: '#3a2a20', suit: '#e0596a' },
  { skin: '#f5cba0', hair: '#5a3a1e', suit: '#4a86d0' },
  { skin: '#ffdcb4', hair: '#1e1a18', suit: '#f2b53f' },
  { skin: '#e8b98a', hair: '#4a3524', suit: '#5fbf8f' },
  { skin: '#ffdcb4', hair: '#7a4a28', suit: '#b57fd0' },
  { skin: '#f5cba0', hair: '#2a2018', suit: '#ff8a5c' },
  { skin: '#e8b98a', hair: '#3a2a20', suit: '#3fc4d8' },
  { skin: '#ffdcb4', hair: '#8a6a3a', suit: '#e8553f' },
] as const;

// ══════════════════════════════════════════════════════════════
// 건물 — AI 교체 대상. 지금은 프로토타입 수준의 박공지붕 도형.
// ══════════════════════════════════════════════════════════════

function building(roof: string, roofHi: string, sign: boolean): DrawFn {
  return (g, w, h) => {
    const rh = Math.round(h * 0.42);
    px(g, 2, rh, w - 4, h - rh - 1, '#fdf3e0');
    px(g, 2, rh, w - 4, 2, '#e4d3b4');
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(0, rh + 1);
    g.lineTo(w / 2, 1);
    g.lineTo(w, rh + 1);
    g.fill();
    g.fillStyle = roofHi;
    g.beginPath();
    g.moveTo(0, rh + 1);
    g.lineTo(w / 2, 1);
    g.lineTo(w / 2, 4);
    g.lineTo(4, rh + 1);
    g.fill();
    px(g, 5, rh + 5, 6, 5, '#8fc4d8');
    px(g, w - 11, rh + 5, 6, 5, '#8fc4d8');
    px(g, w / 2 - 4, rh + 8, 8, h - rh - 9, '#3f6b82');
    if (sign) {
      px(g, 3, h - 8, w - 6, 5, '#e0596a');
      px(g, 3, h - 8, w - 6, 2, '#f08a78');
    }
  };
}

DRAW['facility/gate'] = building('#e0604f', '#f08674', true);
DRAW['facility/shop'] = building('#62a58c', '#84c0a8', true);
DRAW['facility/restroom'] = building('#4a90b8', '#6fb0d4', false);
DRAW['facility/shower'] = building('#5fbcd8', '#87d2e8', false);
DRAW['facility/changing'] = building('#f2b53f', '#ffd06a', false);

DRAW['facility/shade'] = (g, w, h) => {
  px(g, 2, h - 7, w - 4, 6, '#c49a6a');
  g.strokeStyle = 'rgba(140,100,55,0.6)';
  g.lineWidth = 1;
  for (let x = 4; x < w - 4; x += 4) {
    g.beginPath();
    g.moveTo(x, h - 7);
    g.lineTo(x, h - 1);
    g.stroke();
  }
  px(g, 1, 2, w - 2, 6, '#7fbf9a');
  px(g, 1, 2, w - 2, 2, '#9fd6b4');
};

DRAW['facility/dock'] = (g, w, h, v) => {
  px(g, 0, 0, w, h, '#c49a6a');
  px(g, 0, 0, w, 1, '#e0b784');
  g.strokeStyle = 'rgba(140,100,55,0.55)';
  g.lineWidth = 1;
  const off = v.alt * 2;
  for (let y = 2 + off; y < h; y += 5) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
};

DRAW['facility/slide'] = (g, w, h) => {
  g.fillStyle = '#e8f2f0';
  g.beginPath();
  g.roundRect(0, h * 0.19, w, h * 0.76, 6);
  g.fill();
  g.fillStyle = '#4fb8a8';
  g.beginPath();
  g.roundRect(3, h * 0.1, w * 0.33, h * 0.71, 4);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(5, h * 0.21 + i * 5);
    g.lineTo(w * 0.35, h * 0.21 + i * 5);
    g.stroke();
  }
  g.strokeStyle = '#3f9e8f';
  g.lineWidth = 11;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(w * 0.37, h * 0.19);
  g.bezierCurveTo(w * 0.74, h * 0.29, w * 0.85, h * 0.57, w * 0.91, h * 0.88);
  g.stroke();
  g.strokeStyle = '#9aeade';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(w * 0.37, h * 0.19);
  g.bezierCurveTo(w * 0.74, h * 0.29, w * 0.85, h * 0.57, w * 0.91, h * 0.88);
  g.stroke();
};

DRAW['facility/trampoline'] = (g, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  g.fillStyle = '#f2c33f';
  g.beginPath();
  g.arc(cx, cy, w / 2 - 1, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b4356';
  g.beginPath();
  g.arc(cx, cy, w / 2 - 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a5f78';
  g.beginPath();
  g.arc(cx, cy, w / 2 - 8, 0, Math.PI * 2);
  g.fill();
};

DRAW['facility/pool'] = (g, w, h) => {
  g.fillStyle = '#2b7fa0';
  g.beginPath();
  g.roundRect(0, 0, w, h, 6);
  g.fill();
  g.fillStyle = '#59c6e8';
  g.beginPath();
  g.roundRect(3, 3, w - 6, h - 6, 4);
  g.fill();
  g.strokeStyle = 'rgba(191,234,246,0.7)';
  g.lineWidth = 1;
  for (let x = 10; x < w - 6; x += 10) {
    g.beginPath();
    g.moveTo(x, 4);
    g.lineTo(x, h - 4);
    g.stroke();
  }
};

// ══════════════════════════════════════════════════════════════
// 탈것 — 우측을 향한 상단뷰
// ══════════════════════════════════════════════════════════════

function boat(body: string, hi: string): DrawFn {
  return (g, w, h) => {
    g.fillStyle = body;
    g.beginPath();
    g.roundRect(0, h * 0.25, w, h * 0.65, h * 0.32);
    g.fill();
    g.fillStyle = hi;
    g.beginPath();
    g.roundRect(0, h * 0.13, w, h * 0.5, h * 0.25);
    g.fill();
  };
}

DRAW['vehicle/banana'] = boat('#d99a2b', '#ffcf4d');
DRAW['vehicle/jetski'] = boat('#b5311f', '#e8553f');
DRAW['vehicle/flyfish'] = boat('#2f6fb0', '#4f9fd8');
DRAW['vehicle/wakeboard'] = boat('#5a4a8a', '#8a7ac0');
DRAW['vehicle/passing-boat'] = boat('#3a4a5e', '#5a6a7e');

// ══════════════════════════════════════════════════════════════
// 소품 · 이펙트
// ══════════════════════════════════════════════════════════════

DRAW['prop/tree'] = (g, w, h, v) => {
  const trunkW = 3;
  px(g, (w - trunkW) / 2, h - 7, trunkW, 7, '#7a5a34');
  const cx = w / 2;
  const cy = h * 0.42;
  const r = w * 0.44 - v.alt * 0.6;
  g.fillStyle = '#3f6b3a';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5d9762';
  g.beginPath();
  g.arc(cx - r * 0.22, cy - r * 0.22, r * 0.72, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#74ad78';
  g.beginPath();
  g.arc(cx - r * 0.38, cy - r * 0.4, r * 0.34, 0, Math.PI * 2);
  g.fill();
};

DRAW['prop/parasol'] = (g, w, h, v) => {
  const cx = w / 2;
  px(g, cx - 1, h * 0.45, 2, h * 0.55, '#8a6a3a');
  const col = v.alt === 0 ? '#e05f6a' : '#f2a541';
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(1, h * 0.5);
  g.quadraticCurveTo(cx, -h * 0.22, w - 1, h * 0.5);
  g.fill();
  g.fillStyle = '#f7f2e4';
  g.beginPath();
  g.moveTo(cx * 0.5, h * 0.5);
  g.quadraticCurveTo(cx * 0.78, h * 0.05, cx, -h * 0.04);
  g.lineTo(cx, h * 0.5);
  g.fill();
};

DRAW['prop/buoy'] = (g, w, h) => {
  g.fillStyle = '#ff8a5c';
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2 - 0.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2 - 0.5, 0, Math.PI * 2);
  g.stroke();
};

DRAW['fx/foam'] = (g, w, h) => {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  g.fill();
};

DRAW['fx/shimmer'] = (g, w, h) => {
  g.strokeStyle = '#dffaff';
  g.lineWidth = 2;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(1, h - 1);
  g.quadraticCurveTo(w / 2, -1, w - 1, h - 1);
  g.stroke();
};

DRAW['fx/splash'] = (g, w, h) => {
  g.fillStyle = '#ffffff';
  for (const [dx, dy, r] of [
    [0.5, 0.7, 0.3],
    [0.24, 0.52, 0.17],
    [0.76, 0.5, 0.2],
    [0.6, 0.24, 0.12],
  ] as const) {
    g.beginPath();
    g.arc(w * dx, h * dy, w * r, 0, Math.PI * 2);
    g.fill();
  }
};

DRAW['fx/shadow'] = (g, w, h) => {
  g.fillStyle = 'rgba(10,60,90,0.28)';
  g.beginPath();
  g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.fill();
};

// ══════════════════════════════════════════════════════════════

/** 그리기 함수가 없는 명세용 최후의 보루 — 눈에 띄는 마젠타 박스 */
const missing: DrawFn = (g, w, h) => {
  px(g, 0, 0, w, h, '#ff00ff');
  px(g, 1, 1, w - 2, h - 2, '#440044');
};

export class ProceduralProvider implements AssetProvider {
  readonly name = 'procedural';
  readonly ids: readonly string[] = ALL_SPRITE_IDS;
  private cache = new Map<string, HTMLCanvasElement>();

  has(id: string): boolean {
    return specForId(id) !== undefined;
  }

  spec(id: string): SpriteSpec | undefined {
    return specForId(id);
  }

  get(id: string): HTMLCanvasElement {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const sp = specForId(id);
    if (!sp) throw new Error(`알 수 없는 스프라이트 ID: ${id}`);

    const [w, h] = sp.size;
    const canvas = createCanvas(w, h);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D 컨텍스트를 얻지 못했습니다');
    g.imageSmoothingEnabled = false;

    const v = parseId(id, sp);
    (DRAW[sp.id] ?? missing)(g, w, h, v);

    this.cache.set(id, canvas);
    return canvas;
  }

  /** 그리기 함수가 정의되지 않은 명세 목록. 검증용. */
  static missingDrawers(): string[] {
    return SPRITE_SPECS.filter((s) => DRAW[s.id] === undefined).map((s) => s.id);
  }
}
