/**
 * 손님 도트 (G14-2) — 18×32 셀 (docs/pixel-style.md 실측: 폭 0.55타일 · 키 1타일), **2.5등신**: 머리 12 · 몸 8 · 다리 10. 눈은 1×2 텍셀.
 * 팔레트 8(수영복) × 머리 모양 5 × 피부 4 × 포즈 3(idle·walk·swim) × 프레임 × 표정 4.
 * ID: `guest/body:{palette}[:{build}][:f{float}]/{pose}/{frame}[/{mood}]`. 색은 전부 CSS 토큰(`--guest-*`).
 * G26: 체형 `kid`(2등신 18×22 — 같은 캔버스 아래쪽에 앉힌다)·`old`(회색 머리) · 튜브 6종(`f1`~`f6`) · 포즈 `sit`·`lie`·`ride`.
 * ⚠ 무드는 언제나 마지막 세그먼트다 — 하네스가 `split('/').pop()` 으로 읽는다.
 */
import { cssVar } from '../../ui/tokens.js';

export type GuestPose = 'idle' | 'walk' | 'swim' | 'sit' | 'lie' | 'ride';
export type GuestBuildId = 'adult' | 'kid' | 'old';
export const GUEST_W = 18;
export const GUEST_H = 32;
export const GUEST_ANCHOR = { x: 9, y: 30 };
export const GUEST_PALETTES = 8;
export const GUEST_FRAMES: Record<GuestPose, number> = { idle: 1, walk: 2, swim: 2, sit: 1, lie: 1, ride: 2 };
/** 튜브 종류 — 1~3 링(빨강·파랑·노랑) · 4 오리 · 5 범고래 · 6 카약. 0 = 없음 */
export const FLOAT_TOKENS: Record<number, string> = { 1: '--float-red', 2: '--float-blue', 3: '--float-yellow', 4: '--float-white', 5: '--float-orca', 6: '--float-kayak' };

export type GuestMoodId = 'calm' | 'happy' | 'annoyed' | 'tired';

/** `guest/body:{palette}[:{build}][:f{n}]/{pose}/{frame}[/{mood}]` */
export function parseGuestId(id: string): { palette: number; build: GuestBuildId; float: number; pose: GuestPose; frame: number; mood: GuestMoodId } | null {
  const m = id.match(/^guest\/body:(\d+)(?::(adult|kid|old))?(?::f(\d))?\/(idle|walk|swim|sit|lie|ride)\/(\d+)(?:\/(calm|happy|annoyed|tired))?$/);
  if (!m) return null;
  return { palette: Number(m[1]) % GUEST_PALETTES, build: (m[2] as GuestBuildId | undefined) ?? 'adult', float: Number(m[3] ?? 0), pose: m[4] as GuestPose, frame: Number(m[5]), mood: (m[6] as GuestMoodId | undefined) ?? 'calm' };
}

/** 렌더가 키를 만드는 한 곳 */
export function guestTextureKey(palette: number, build: GuestBuildId, float: number, pose: GuestPose, frame: number, mood: GuestMoodId): string {
  const head = `guest/body:${palette}${build === 'adult' ? '' : `:${build}`}${float > 0 ? `:f${float}` : ''}`;
  return `${head}/${pose}/${frame}/${mood}`;
}

// 문자: k 외곽 · h 머리카락 · H 머리 하이라이트 · f 피부 · s 수영복 · S 수영복 그늘 · e 눈 · w 흰 · p 볼 · t 튜브 · T 튜브 하이라이트 · c 물 · . 투명
export const HEAD: Record<number, readonly string[]> = {
  // 0 짧은 머리
  0: ['.....kkkkkkkk.....', '....khHHhhhhhk....', '...khhHhhhhhhhk...', '...khhhhhhhhhhk...', '...khhffffffhhk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '....kffffffffk....', '.....kkkkkkkk.....'],
  // 1 단발 (양옆으로 내려옴)
  1: ['.....kkkkkkkk.....', '....khHHhhhhhk....', '...khhHhhhhhhhk...', '...khhhhhhhhhhk...', '...khhffffffhhk...', '...khffffffffhk...', '...khffffffffhk...', '...khffffffffhk...', '...khffffffffhk...', '...kkffffffffkk...', '....kffffffffk....', '.....kkkkkkkk.....'],
  // 2 뾰족
  2: ['....k.kkkkkk.k....', '...kkkhHhhhhkkk...', '...khhHhhhhhhhk...', '...khhhhhhhhhhk...', '...khhffffffhhk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '....kffffffffk....', '.....kkkkkkkk.....'],
  // 3 똥머리
  3: ['..kkkk.kkkkkk.....', '.khhHhkhHHhhhk....', '.khhhhkhhhhhhhk...', '..kkkkhhhhhhhhk...', '...khhffffffhhk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '...kffffffffffk...', '....kffffffffk....', '.....kkkkkkkkk....'],
  // 4 긴 머리 (어깨까지)
  4: ['.....kkkkkkkk.....', '....khHHhhhhhk....', '...khhHhhhhhhhk...', '..kkhhhhhhhhhhkk..', '..khhhffffffhhhk..', '..khhffffffffhhk..', '..khhffffffffhhk..', '..khhffffffffhhk..', '..khhffffffffhhk..', '..khhkffffffkhhk..', '..khhkkffffkkhhk..', '..kkkk.kkkk.kkkk..'],
};

// 몸 (12행부터) — 어깨·팔·수영복·다리. 수영복은 s, 그늘 S
const BODY_IDLE = [
  '......kkkkkk......',
  '....kkssssssSkk...',
  '...kfkssssssSSkfk.',
  '...kfkssssssSSkfk.',
  '...kfkssssssSSkfk.',
  '...kkkssssssSSkkk.',
  '.....kssssssSk....',
  '.....kkkkkkkkk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kkkk.kkkk....',
];
const BODY_WALK_A = [
  '......kkkkkk......',
  '....kkssssssSkk...',
  '...kfkssssssSSkkf.',
  '...kfkssssssSSk.fk',
  '...kfkssssssSSk.kk',
  '...kkkssssssSSkk..',
  '.....kssssssSk....',
  '.....kkkkkkkkk....',
  '....kffk..kffk....',
  '....kffk..kffk....',
  '...kffk...kffk....',
  '...kffk....kffk...',
  '...kffk....kffk...',
  '..kffk......kffk..',
  '..kkkk......kffk..',
  '............kkkk..',
  '..................',
];
const BODY_WALK_B = [
  '......kkkkkk......',
  '....kkssssssSkk...',
  '.fkkkssssssSSkfk..',
  'kf.kssssssSSSkfk..',
  'kk.kssssssSSSkfk..',
  '..kkssssssSSSkkk..',
  '.....kssssssSk....',
  '.....kkkkkkkkk....',
  '.....kffk..kffk...',
  '.....kffk..kffk...',
  '.....kffk...kffk..',
  '....kffk....kffk..',
  '....kffk....kffk..',
  '....kffk......kffk',
  '....kffk......kkkk',
  '....kkkk..........',
  '..................',
];
// 수영 — 튜브(보색) 안의 상반신 + 물결. 머리 아래 12행부터
const SWIM_A = [
  '....kkkkkkkkkk....',
  '..kkTttttttttTkk..',
  '.kTtfksssssSkfttk.',
  '.ktttksssssSktttk.',
  '.ktttksssssSktttk.',
  '.kttttkkkkkkktttk.',
  '..kttttttttttttk..',
  '...kTttttttttTk...',
  '....kkkkkkkkkk....',
  'ccccccccccccccccCc',
];
const SWIM_B = [
  '....kkkkkkkkkk....',
  '..kkttttttttttkk..',
  '.kTtfksssssSkfttk.',
  '.kTttksssssSkttTk.',
  '.ktttksssssSktttk.',
  '.kttttkkkkkkktttk.',
  '..ktTttttttttTtk..',
  '...kttttttttttk...',
  '....kkkkkkkkkk....',
  'cCcccccccccccccccc',
];

// 앉기 — 의자 위. 몸통 6 + 접은 다리 4 (머리 아래 12행부터)
const BODY_SIT = [
  '......kkkkkk......',
  '....kkssssssSkk...',
  '...kfkssssssSSkfk.',
  '...kfkssssssSSkfk.',
  '...kkkssssssSSkkk.',
  '....kssssssSSk....',
  '..kkkkffffffkkkk..',
  '.kffffkkkkkkffffk.',
  '.kffkk......kkffk.',
  '.kkkk........kkkk.',
];
// 눕기 — 데크체어 위 (머리가 왼쪽 위, 몸이 오른쪽 아래로) 18×14. 머리는 HEAD 를 축소 없이 쓰고 몸만 여기서 그린다
const BODY_LIE = [
  '......kkkkkkkkkk..',
  '....kkssssssSSSSk.',
  '...kfkssssssSSSSSk',
  '...kfkssssssSSSSkk',
  '...kkkkkkkkkkkkfk.',
  '..........kffffkk.',
  '...........kkkkk..',
];
// 슬라이드 타기 — 튜브 위에 앉아 팔을 든다 (머리 아래 12행부터). t 튜브 · T 하이라이트
const RIDE_A = [
  '...k........k.....',
  '..kfk.kkkkkk.kfk..',
  '...kfksssssSkfk...',
  '....kksssssSkk....',
  '....kkkkkkkkkk....',
  '..kkTttttttttTkk..',
  '.kTttksssssSkttTk.',
  '.ktttkkkkkkkktttk.',
  '..kttttttttttttk..',
  '...kkkkkkkkkkkk...',
];
const RIDE_B = [
  '..k..........k....',
  '.kfk..kkkkkk..kfk.',
  '..kfk.sssssS.kfk..',
  '...kkksssssSkkk...',
  '....kkkkkkkkkk....',
  '..kkttttttttttkk..',
  '.kTttksssssSkttTk.',
  '.ktttkkkkkkkktttk.',
  '..ktTttttttttTtk..',
  '...kkkkkkkkkkkk...',
];
// 어린이 몸 (2등신) — 머리 12 아래 몸 6 + 다리 4
const KID_IDLE = [
  '.....kkkkkkkk.....',
  '...kkkssssssSkkk..',
  '..kfkkssssssSkkfk.',
  '..kkkkssssssSSkkk.',
  '.....kkkkkkkkk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kffk.kffk....',
  '.....kkkk.kkkk....',
];
const KID_WALK_A = [
  '.....kkkkkkkk.....',
  '...kkkssssssSkkk..',
  '..kfkkssssssSkkfk.',
  '..kkkkssssssSSkkk.',
  '.....kkkkkkkkk....',
  '....kffk...kffk...',
  '....kffk....kffk..',
  '...kffk......kffk.',
  '...kkkk......kkkk.',
];
const KID_WALK_B = [
  '.....kkkkkkkk.....',
  '...kkkssssssSkkk..',
  '..kfkkssssssSkkfk.',
  '..kkkkssssssSSkkk.',
  '.....kkkkkkkkk....',
  '......kffk.kffk...',
  '......kffk.kffk...',
  '......kffk.kffk...',
  '......kkkk.kkkk...',
];

/** 튜브 6종 — 수영·탑승 포즈의 `t`/`T` 자리에 덧그린다 (링은 색만, 오리·범고래·카약은 머리/지느러미/앞뒤 코) */
function drawFloatExtra(g: CanvasRenderingContext2D, kind: number, x0: number, y0: number, color: Record<string, string>): void {
  const px = (ch: string, x: number, y: number, w = 1, h = 1): void => { g.fillStyle = color[ch] ?? color['k'] as string; g.fillRect(x0 + x, y0 + y, w, h); };
  if (kind === 4) { // 오리 — 왼쪽에 흰 목·머리 + 주황 부리 (링 위로 솟는다)
    px('k', 0, -5, 4, 1); px('k', 0, -4, 1, 5); px('k', 3, -4, 1, 3); px('t', 1, -4, 2, 4); px('e', 2, -4); px('o', 4, -3, 2, 1); px('k', 4, -2, 2, 1);
  } else if (kind === 5) { // 범고래 — 등지느러미 + 흰 배 무늬
    px('k', 8, -3, 1, 1); px('k', 7, -2, 3, 1); px('t', 8, -2); px('k', 6, -1, 5, 1); px('T', 2, 3, 2, 1); px('T', 14, 3, 2, 1); px('T', 3, 5, 2, 1); px('T', 13, 5, 2, 1);
  } else if (kind === 6) { // 카약 — 앞뒤로 뾰족한 코
    px('k', 0, 2, 1, 4); px('t', 1, 3, 1, 2); px('k', 17, 2, 1, 4); px('t', 16, 3, 1, 2);
  }
}

export function drawGuest(id: string): HTMLCanvasElement | null {
  const p = parseGuestId(id);
  if (!p) return null;
  const c = document.createElement('canvas');
  c.width = GUEST_W;
  c.height = GUEST_H;
  const g = c.getContext('2d');
  if (!g) return c;
  const suit = cssVar(`--guest-suit-${p.palette}`);
  const tube = p.float > 0 ? cssVar(FLOAT_TOKENS[p.float] ?? '--float-red') : cssVar(`--guest-suit-${(p.palette + 3) % GUEST_PALETTES}`);
  const hair = p.build === 'old' ? cssVar('--guest-hair-grey') : cssVar(`--guest-hair-${p.palette % 5}`);
  const color: Record<string, string> = {
    k: cssVar('--guest-outline'), e: cssVar('--guest-eye'), w: cssVar('--fac-white'), p: cssVar('--guest-blush'),
    f: cssVar(`--guest-skin-${p.palette % 4}`), h: hair, H: p.build === 'old' ? cssVar('--fac-white') : cssVar('--guest-hair-lt'), s: suit, S: cssVar(`--guest-suit-dk-${p.palette}`),
    t: tube, T: p.float === 5 ? cssVar('--fac-white') : cssVar('--fac-white'), c: cssVar('--tile-pool'), C: cssVar('--fac-white'), o: cssVar('--float-beak'),
  };
  const put = (rows: readonly string[], x: number, y: number): void => {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        const col = color[ch];
        if (!col) return;
        g.fillStyle = col;
        g.fillRect(x + i, y + j, 1, 1);
      });
    });
  };
  const px = (ch: string, x: number, y: number, w = 1, h = 1): void => { g.fillStyle = color[ch] ?? color['k'] as string; g.fillRect(x, y, w, h); };
  const swim = p.pose === 'swim';
  const ride = p.pose === 'ride';
  const kid = p.build === 'kid';
  const bob = swim || ride ? (p.frame % 2) : 0;
  // 어린이는 키가 10 낮다 — 같은 캔버스에서 아래쪽에 앉힌다 (앵커 y=30 그대로)
  const top = p.pose === 'lie' ? 6 : swim ? 6 + bob : ride ? 2 + bob : kid ? 9 : 1;
  const head = HEAD[p.palette % 5] ?? HEAD[0] as readonly string[];
  if (p.pose === 'lie') { put(head, 0, 4); }
  else put(head, 0, top);
  // 표정 — 눈 1×2 (6~7행) · 입 (9행). 카이로처럼 눈이 얼굴의 전부다
  const ey = (p.pose === 'lie' ? 4 : top) + 6;
  if (p.mood === 'tired') { px('k', 5, ey + 1, 3, 1); px('k', 10, ey + 1, 3, 1); px('k', 8, ey + 3, 2, 1); px('p', 4, ey + 2); px('p', 13, ey + 2); }
  else if (p.mood === 'annoyed') { px('k', 5, ey - 1, 3, 1); px('k', 10, ey - 1, 3, 1); px('e', 6, ey, 1, 2); px('e', 11, ey, 1, 2); px('k', 7, ey + 4, 4, 1); px('k', 6, ey + 3); px('k', 11, ey + 3); }
  else if (p.mood === 'happy') { px('e', 6, ey, 1, 2); px('e', 11, ey, 1, 2); px('k', 6, ey + 3); px('k', 11, ey + 3); px('k', 7, ey + 4, 4, 1); px('p', 4, ey + 2, 2, 1); px('p', 12, ey + 2, 2, 1); }
  else { px('e', 6, ey, 1, 2); px('e', 11, ey, 1, 2); px('k', 8, ey + 4, 2, 1); }
  if (p.pose === 'lie') {
    put(BODY_LIE, 0, 16);
    return c;
  }
  if (swim) {
    put(p.frame % 2 ? SWIM_B : SWIM_A, 0, top + 11);
    if (p.float > 3) drawFloatExtra(g, p.float, 0, top + 11, color);
    return c;
  }
  if (ride) {
    put(p.frame % 2 ? RIDE_B : RIDE_A, 0, top + 12);
    if (p.float > 3) drawFloatExtra(g, p.float, 0, top + 16, color);
    return c;
  }
  if (p.pose === 'sit') {
    put(BODY_SIT, 0, top + 12);
    return c;
  }
  if (kid) {
    put(p.pose === 'walk' ? (p.frame % 2 ? KID_WALK_B : KID_WALK_A) : KID_IDLE, 0, top + 12);
    return c;
  }
  put(p.pose === 'walk' ? (p.frame % 2 ? BODY_WALK_B : BODY_WALK_A) : BODY_IDLE, 0, top + 12);
  return c;
}
