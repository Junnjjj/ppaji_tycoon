import { KAIRO } from './kairo-contract.js';

/**
 * 손님 스프라이트를 **코드로 굽는다** — 스펙 §2.
 *
 * AI 픽셀아트로 교체하는 건 골 밖이지만, 계약(셀 크기·포즈·방향·프레임 수)이 고정돼 있어
 * 나중에 아틀라스로 갈아끼울 때 게임 코드는 0줄 바뀐다.
 *
 * ## 표정은 포즈와 **직교**한다
 *
 * 포즈 7 × 방향 4 × 프레임 × 팔레트 8 에 표정 4를 곱하면 1,280셀이 된다. 대신 표정은
 * 눈·입만 그리는 **작은 오버레이**로 분리했다 — 팔레트와 무관(눈·입은 어두운 색)하고
 * 방향 4개만 필요해 16셀이면 끝난다.
 *
 * ## 표정을 그리는 이유
 *
 * 스펙 v1 은 "24텍셀에서 표정은 못 읽힌다"고 판단해 포기했는데, 레퍼런스 실측은 머리
 * 11텍셀에 **눈 1텍셀·입 1텍셀**로 표정을 또렷하게 그린다. 사용자가 카이로를 택한 이유가
 * "npc들의 표정을 보고"이므로 이건 선택이 아니다.
 *
 * ## 아웃라인은 베이크한다
 *
 * 픽셀화 외곽선 패스는 깊이 불연속에서만 선을 그린다. 손님이 줄을 서면 서로 붙어
 * 갈색 덩어리로 뭉친다 (실측). 셀 경계를 존중하며 스프라이트 안에 굽는다.
 */

export const GUEST_W = 14;
export const GUEST_H = 24;
/** 머리 오버레이 크기 — 눈·입만 */
export const FACE_W = 8;
export const FACE_H = 5;
/**
 * 말풍선 크기 (K29).
 *
 * 12 였을 때 **손님 키(24텍셀)의 절반**이라 화면에서 거의 안 보였다. 카이로는 말풍선이
 * 손님만큼 크고 늘 떠 있어서 화면이 살아 보인다. 20 으로 키운다.
 *
 * 글자는 안 넣는다 — 카이로는 "Nom nom!" 같은 짧은 영어를 쓰는데 20텍셀에 한글은
 * 물리적으로 안 들어간다. 이 스케일에서는 기호를 크고 또렷하게 하는 것이 맞다.
 */
export const EMOTE_SIZE = 20;

const OUTLINE = '#2b1d12';

export type Pose = 'idle' | 'walk' | 'swim' | 'float' | 'sit' | 'lie' | 'ride';
export type Facing = '+X' | '+Z' | '-X' | '-Z';
export type Face = 'calm' | 'happy' | 'annoyed' | 'tired';

/** 포즈별 (프레임 수, 방향 수) — 스펙 §2.2 표와 같아야 한다 */
export const POSE_SHEET: Record<Pose, { frames: number; facings: Facing[] }> = {
  idle: { frames: 2, facings: ['+X', '+Z', '-X', '-Z'] },
  walk: { frames: 4, facings: ['+X', '+Z', '-X', '-Z'] },
  // 물속은 상체만 보여 방향 2로 축약한다
  swim: { frames: 2, facings: ['+Z', '-Z'] },
  float: { frames: 2, facings: ['+Z'] },
  sit: { frames: 1, facings: ['+X', '+Z', '-X', '-Z'] },
  lie: { frames: 1, facings: ['+Z', '-Z'] },
  ride: { frames: 1, facings: ['+X', '+Z', '-X', '-Z'] },
};

export const FACES: Face[] = ['calm', 'happy', 'annoyed', 'tired'];

/**
 * 팔레트 8종. 구명조끼 주황이 우세하고 반바지·머리·피부로 변화를 준다 —
 * 조끼까지 색을 흩으면 "우리 빠지의 손님"이라는 통일감이 사라진다.
 */
interface Palette {
  skin: string;
  hair: string;
  vest: string;
  shorts: string;
}

export const PALETTES: Palette[] = [
  { skin: '#f0c9a0', hair: '#4a3428', vest: '#f08a3c', shorts: '#3f6fa8' },
  { skin: '#e8bb8e', hair: '#2b2018', vest: '#f5a04a', shorts: '#c8503c' },
  { skin: '#f7d7b4', hair: '#6b4a2f', vest: '#ef7d2e', shorts: '#4a9a6a' },
  { skin: '#dcae82', hair: '#1f1a15', vest: '#f8b25c', shorts: '#7a5ba8' },
  { skin: '#f0c9a0', hair: '#8a5a3a', vest: '#e8742a', shorts: '#2f8ba8' },
  { skin: '#e6b58a', hair: '#3a2a20', vest: '#f59a44', shorts: '#d0703c' },
  { skin: '#f7d7b4', hair: '#52381f', vest: '#ff9a3f', shorts: '#5a7fc0' },
  { skin: '#dcae82', hair: '#241c16', vest: '#e88a34', shorts: '#3f8a5a' },
];

function createCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('손님 스프라이트는 브라우저에서만 굽는다 (sim 은 에셋에 의존하지 않는다)');
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 셀 경계를 넘지 않는 1텍셀 아웃라인 */
function bakeOutlineCells(
  g: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  cols: number,
  rows: number,
): void {
  const W = cw * cols;
  const H = ch * rows;
  const img = g.getImageData(0, 0, W, H);
  const a = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && (a[(y * W + x) * 4 + 3] as number) > 8;
  const out: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (solid(x, y)) continue;
      // 셀 안에서만 이웃을 본다 — 넘으면 옆 셀의 실루엣이 새어 들어온다
      const cx = x % cw;
      const cy = y % ch;
      const n =
        (cx > 0 && solid(x - 1, y)) ||
        (cx < cw - 1 && solid(x + 1, y)) ||
        (cy > 0 && solid(x, y - 1)) ||
        (cy < ch - 1 && solid(x, y + 1));
      if (n) out.push([x, y]);
    }
  }
  g.fillStyle = OUTLINE;
  for (const [x, y] of out) g.fillRect(x, y, 1, 1);
}

/** 프레임 이름 — 렌더가 이 규칙으로 조회한다 */
export function bodyFrame(palette: number, pose: Pose, facing: Facing, frame: number): string {
  return `p${palette}_${pose}_${facing}_${frame}`;
}

export function faceFrame(face: Face, facing: Facing): string {
  return `f_${face}_${facing}`;
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GuestAtlas {
  canvas: HTMLCanvasElement;
  frames: Map<string, FrameRect>;
  /** 포즈별 머리 오버레이가 붙을 위치 (셀 좌상단 기준) */
  headOffset: Record<Pose, { x: number; y: number }>;
}

/** 몸통 한 칸을 그린다. 머리는 실루엣만(눈·입은 오버레이가 그린다) */
function drawBody(
  g: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  p: Palette,
  pose: Pose,
  facing: Facing,
  frame: number,
): void {
  const back = facing === '-X' || facing === '-Z';
  const px = (x: number, y: number, c: string): void => {
    g.fillStyle = c;
    g.fillRect(ox + x, oy + y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string): void => {
    g.fillStyle = c;
    g.fillRect(ox + x, oy + y, w, h);
  };

  // 누운·물 포즈는 몸을 낮춘다
  const lying = pose === 'lie';
  const inWater = pose === 'swim' || pose === 'float';
  const seated = pose === 'sit' || pose === 'ride';

  if (lying) {
    // 위에서 본 누운 몸 — 가로로 눕는다
    rect(2, 13, 10, 5, p.vest);
    rect(1, 14, 3, 3, p.skin); // 머리
    rect(11, 14, 2, 3, p.skin); // 발
    if (!back) rect(3, 12, 3, 3, p.hair);
    return;
  }

  const baseY = inWater ? 12 : seated ? 10 : 8;

  // 다리
  if (!inWater) {
    const stride = pose === 'walk' ? [0, 1, 0, -1][frame % 4] ?? 0 : 0;
    if (seated) {
      rect(4, baseY + 8, 6, 3, p.skin);
    } else {
      rect(5 - (stride > 0 ? 1 : 0), baseY + 8, 2, 4, p.skin);
      rect(8 + (stride < 0 ? 1 : 0), baseY + 8, 2, 4, p.skin);
    }
  }

  // 몸통 (구명조끼)
  rect(4, baseY + 1, 6, 7, p.vest);
  // 팔
  const armY = baseY + 2;
  rect(3, armY, 1, 4, p.skin);
  rect(10, armY, 1, 4, p.skin);

  // 머리 — 실루엣만. 눈·입은 표정 오버레이
  rect(4, baseY - 8, 6, 8, p.skin);
  // 머리카락: 뒤통수면 머리 전체를 덮는다
  if (back) {
    rect(3, baseY - 9, 8, 7, p.hair);
  } else {
    rect(3, baseY - 9, 8, 3, p.hair);
    px(3, baseY - 6, p.hair);
    px(10, baseY - 6, p.hair);
  }

  // 물속이면 허리 아래를 지운다 (물에 잠긴 것처럼)
  if (inWater) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(ox, oy + baseY + 6, GUEST_W, GUEST_H - (baseY + 6));
    g.restore();
  }
}

/** 표정 오버레이 — 눈·입만. 뒤통수(−X/−Z)는 아무것도 안 그린다 */
function drawFace(
  g: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  face: Face,
  facing: Facing,
): void {
  if (facing === '-X' || facing === '-Z') return;
  const EYE = '#2b1d12';
  const MOUTH = '#c0503c';
  const px = (x: number, y: number, c: string): void => {
    g.fillStyle = c;
    g.fillRect(ox + x, oy + y, 1, 1);
  };
  // 눈 두 개 — 기쁨·지침은 감긴 눈(가로 2텍셀)
  const closed = face === 'happy' || face === 'tired';
  if (closed) {
    g.fillStyle = EYE;
    g.fillRect(ox + 1, oy + 1, 2, 1);
    g.fillRect(ox + 5, oy + 1, 2, 1);
  } else {
    px(2, 1, EYE);
    px(6, 1, EYE);
  }
  // 눈썹 — 불만은 내려간다
  if (face === 'annoyed') {
    px(1, 0, EYE);
    px(7, 0, EYE);
  }
  // 입
  if (face === 'happy') {
    g.fillStyle = MOUTH;
    g.fillRect(ox + 3, oy + 3, 3, 2);
  } else if (face === 'annoyed') {
    g.fillStyle = MOUTH;
    g.fillRect(ox + 3, oy + 3, 3, 1);
  } else {
    px(4, 3, MOUTH);
  }
  // 지침 — 땀
  if (face === 'tired') px(7, 2, '#7ec8f0');
}

/**
 * 포즈별 머리 위치 (셀 좌상단 기준) — `drawBody` 의 baseY 와 맞춰야 한다.
 *
 * 모듈 상수인 이유: 아틀라스와 한 칸 굽기(`bakeGuestCell`)가 **같은 표**를 써야
 * 표정이 한쪽에서만 어긋나지 않는다.
 */
const HEAD_OFFSET: Record<Pose, { x: number; y: number }> = {
  idle: { x: 4, y: 2 },
  walk: { x: 4, y: 2 },
  sit: { x: 4, y: 4 },
  ride: { x: 4, y: 4 },
  swim: { x: 4, y: 6 },
  float: { x: 4, y: 6 },
  lie: { x: 2, y: 15 },
};

/**
 * 손님 아틀라스를 굽는다. 셀은 격자로 배치하고 프레임 사각형을 돌려준다 —
 * Phaser 의 `texture.add(name, 0, x, y, w, h)` 에 그대로 넣는다.
 */
export function bakeGuestAtlas(): GuestAtlas {
  // 몸통 셀 개수
  const bodyCells: { key: string; palette: number; pose: Pose; facing: Facing; frame: number }[] =
    [];
  for (let p = 0; p < PALETTES.length; p++) {
    for (const pose of Object.keys(POSE_SHEET) as Pose[]) {
      const sheet = POSE_SHEET[pose];
      for (const facing of sheet.facings) {
        for (let f = 0; f < sheet.frames; f++) {
          bodyCells.push({ key: bodyFrame(p, pose, facing, f), palette: p, pose, facing, frame: f });
        }
      }
    }
  }

  const cols = 40;
  const bodyRows = Math.ceil(bodyCells.length / cols);
  const faceCells: { key: string; face: Face; facing: Facing }[] = [];
  for (const face of FACES) {
    for (const facing of ['+X', '+Z', '-X', '-Z'] as Facing[]) {
      faceCells.push({ key: faceFrame(face, facing), face, facing });
    }
  }
  const faceRows = 1;

  const W = cols * GUEST_W;
  const H = bodyRows * GUEST_H + faceRows * FACE_H;
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d 컨텍스트를 못 얻었습니다');
  g.imageSmoothingEnabled = false;

  const frames = new Map<string, FrameRect>();

  bodyCells.forEach((c, k) => {
    const col = k % cols;
    const row = (k - col) / cols;
    const x = col * GUEST_W;
    const y = row * GUEST_H;
    drawBody(g, x, y, PALETTES[c.palette] as Palette, c.pose, c.facing, c.frame);
    frames.set(c.key, { x, y, w: GUEST_W, h: GUEST_H });
  });

  // 아웃라인은 몸통 영역만 (표정은 이미 어두운 점이라 필요 없다)
  bakeOutlineCells(g, GUEST_W, GUEST_H, cols, bodyRows);

  /**
   * 접지 그림자 — 아웃라인 **뒤에** 넣는다. 앞에 넣으면 그림자도 실루엣으로 취급돼
   * 윤곽선이 발밑에 둘러진다. 반투명이라 지면색이 무엇이든 어울린다.
   */
  bodyCells.forEach((c, k) => {
    if (c.pose === 'swim' || c.pose === 'float') return; // 물에선 그림자가 없다
    const col = k % cols;
    const row = (k - col) / cols;
    const x = col * GUEST_W;
    const y = row * GUEST_H;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    const yy = c.pose === 'lie' ? y + GUEST_H - 4 : y + GUEST_H - 2;
    g.fillRect(x + 4, yy, 6, 1);
    g.fillRect(x + 3, yy + 1, 8, 1);
  });

  const faceY = bodyRows * GUEST_H;
  faceCells.forEach((c, k) => {
    const x = k * FACE_W;
    drawFace(g, x, faceY, c.face, c.facing);
    frames.set(c.key, { x, y: faceY, w: FACE_W, h: FACE_H });
  });

  return { canvas, frames, headOffset: HEAD_OFFSET };
}

/**
 * 손님 **한 칸만** 굽는다 — 사건 삽화(`ui/kairo-event-art.ts`)가 쓴다.
 *
 * ⚠ 아틀라스를 복제하지 않는다. 삽화에 필요한 것은 서너 명이고, 전체 아틀라스
 * (560×304)를 UI 쪽에서 한 번 더 구우면 폰에서 0.7MB 를 그냥 버린다 — 이 프로젝트
 * 1순위가 "폰에서 돌아가는 것"이다. 14×24 한 장이면 200바이트다.
 *
 * 그리는 코드는 `drawBody`/`drawFace`/`bakeOutlineCells` **그대로**다. 삽화 전용으로
 * 다시 그리면 손님 모습이 두 벌이 되어 카드와 지도의 사람이 달라진다.
 */
export function bakeGuestCell(
  palette: number,
  pose: Pose,
  facing: Facing,
  frame = 0,
  face: Face = 'calm',
): HTMLCanvasElement {
  const canvas = createCanvas(GUEST_W, GUEST_H);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d 컨텍스트를 못 얻었습니다');
  g.imageSmoothingEnabled = false;
  const p = PALETTES[((palette % PALETTES.length) + PALETTES.length) % PALETTES.length] as Palette;
  drawBody(g, 0, 0, p, pose, facing, frame);
  bakeOutlineCells(g, GUEST_W, GUEST_H, 1, 1);
  const off = HEAD_OFFSET[pose];
  drawFace(g, off.x, off.y, face, facing);
  return canvas;
}

/** 이모트 말풍선 6종 — 12×12, 손님 머리 위에 띄운다 */
export function bakeEmoteAtlas(): { canvas: HTMLCanvasElement; frames: Map<string, FrameRect> } {
  const list = KAIRO.guest.emotes;
  const canvas = createCanvas(list.length * EMOTE_SIZE, EMOTE_SIZE);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d 컨텍스트를 못 얻었습니다');
  g.imageSmoothingEnabled = false;
  const frames = new Map<string, FrameRect>();

  const COLOR: Record<string, string> = {
    happy: '#f5d24a',
    love: '#f0648c',
    neutral: '#c8ccd0',
    annoyed: '#e0603c',
    hot: '#f09030',
    alert: '#e03c3c',
  };

  list.forEach((name, k) => {
    const ox = k * EMOTE_SIZE;
    const W = EMOTE_SIZE;
    const BODY_H = 15; // 풍선 본체. 아래 5텍셀은 꼬리 자리
    // 풍선 — 흰 바탕 + 꼬리
    g.fillStyle = '#f4f8fa';
    g.fillRect(ox + 1, 1, W - 2, BODY_H - 1);
    g.fillRect(ox + 2, 0, W - 4, 1); // 위쪽 둥근 맛
    g.fillRect(ox + W / 2 - 2, BODY_H, 4, 3);
    g.fillRect(ox + W / 2 - 1, BODY_H + 3, 2, 1);

    // 기호 — 풍선 안 가운데 (cx, cy 기준으로 크게)
    const cx = ox + W / 2;
    const cy = 8;
    g.fillStyle = COLOR[name] ?? '#888';
    if (name === 'happy') {
      // 웃는 입
      g.fillRect(cx - 4, cy - 3, 2, 2);
      g.fillRect(cx + 2, cy - 3, 2, 2);
      g.fillRect(cx - 4, cy + 2, 8, 2);
      g.fillRect(cx - 5, cy, 1, 2);
      g.fillRect(cx + 4, cy, 1, 2);
    } else if (name === 'love') {
      // 하트
      g.fillRect(cx - 4, cy - 3, 3, 4);
      g.fillRect(cx + 1, cy - 3, 3, 4);
      g.fillRect(cx - 3, cy + 1, 6, 2);
      g.fillRect(cx - 2, cy + 3, 4, 2);
      g.fillRect(cx - 1, cy + 5, 2, 1);
    } else if (name === 'neutral') {
      g.fillRect(cx - 4, cy - 3, 2, 2);
      g.fillRect(cx + 2, cy - 3, 2, 2);
      g.fillRect(cx - 4, cy + 2, 8, 2);
    } else if (name === 'annoyed') {
      // 찡그림 + 화 표시
      g.fillRect(cx - 5, cy - 4, 3, 2);
      g.fillRect(cx + 2, cy - 4, 3, 2);
      g.fillRect(cx - 4, cy - 1, 2, 2);
      g.fillRect(cx + 2, cy - 1, 2, 2);
      g.fillRect(cx - 3, cy + 3, 6, 2);
    } else if (name === 'hot') {
      // 땀방울 셋
      g.fillRect(cx - 5, cy - 3, 2, 4);
      g.fillRect(cx - 6, cy + 1, 4, 2);
      g.fillRect(cx, cy - 4, 2, 4);
      g.fillRect(cx - 1, cy, 4, 2);
      g.fillRect(cx + 4, cy - 2, 2, 3);
    } else {
      // 느낌표
      g.fillRect(cx - 1, cy - 5, 3, 7);
      g.fillRect(cx - 1, cy + 4, 3, 3);
    }

    // 테두리 — 풍선 실루엣을 또렷하게
    g.strokeStyle = OUTLINE;
    g.lineWidth = 1;
    g.strokeRect(ox + 1.5, 0.5, W - 3, BODY_H);
    frames.set(`e_${name}`, { x: ox, y: 0, w: EMOTE_SIZE, h: EMOTE_SIZE });
  });

  return { canvas, frames };
}

/** 계약과 어긋나면 던진다 — 셀 크기·포즈·이모트 수가 스펙과 같아야 한다 */
export function assertGuestContract(): string[] {
  const bad: string[] = [];
  if (KAIRO.guest.cellTexels[0] !== GUEST_W || KAIRO.guest.cellTexels[1] !== GUEST_H) {
    bad.push(`손님 셀 ${GUEST_W}×${GUEST_H} ≠ 계약 ${KAIRO.guest.cellTexels.join('×')}`);
  }
  const poses = Object.keys(POSE_SHEET);
  if (poses.length !== KAIRO.guest.poses.length) {
    bad.push(`포즈 ${poses.length} ≠ 계약 ${KAIRO.guest.poses.length}`);
  }
  for (const p of KAIRO.guest.poses) {
    if (!poses.includes(p)) bad.push(`계약의 포즈 ${p} 가 구현에 없다`);
  }
  if (FACES.length !== 4) bad.push(`표정 ${FACES.length} ≠ 4`);
  if (PALETTES.length !== KAIRO.guest.palettes) {
    bad.push(`팔레트 ${PALETTES.length} ≠ 계약 ${KAIRO.guest.palettes}`);
  }
  return bad;
}
