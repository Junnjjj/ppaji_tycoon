import { Rng } from './rng.js';
import { Terrain } from './terrain.js';
import { World } from './world.js';

/**
 * 가평 강변 스타일 맵 생성. 시드에서 완전히 결정론적.
 *
 * 세로 배치: 도로 → 산·숲 → 평지(건설 주력) → 백사장 → 강변 → 얕은물 → 깊은물 → 넓은수역
 * 각 경계는 사인 옥타브를 겹쳐 물결지게 만든다 — 직선 띠는 인공적으로 보인다.
 */

const TAU = Math.PI * 2;

/** 시드 기반 정수 해시 → [0,1) */
function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 부드러운 값 노이즈. 패치(숲·바위·경사) 흩뿌리기에 사용. */
function valueNoise(x: number, y: number, cell: number, seed: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
}

/** 사인 옥타브를 겹친 물결 경계선 생성기 */
function makeWave(rng: Rng, width: number, amplitude: number): (x: number) => number {
  const octaves = [
    { freq: rng.range(0.8, 1.6), amp: 1.0, phase: rng.range(0, TAU) },
    { freq: rng.range(2.0, 3.4), amp: 0.45, phase: rng.range(0, TAU) },
    { freq: rng.range(4.5, 6.5), amp: 0.2, phase: rng.range(0, TAU) },
  ];
  const norm = octaves.reduce((s, o) => s + o.amp, 0);
  return (x: number) => {
    const t = (x / width) * TAU;
    let v = 0;
    for (const o of octaves) v += Math.sin(t * o.freq + o.phase) * o.amp;
    return (v / norm) * amplitude;
  };
}

export interface WorldGenOptions {
  seed: number;
  width?: number;
  height?: number;
}

export function generateWorld(opts: WorldGenOptions): World {
  const width = opts.width ?? 64;
  const height = opts.height ?? 64;
  const world = new World(width, height);

  // 지형 생성은 전용 스트림을 쓴다 — 다른 서브시스템이 RNG를 소비해도 맵이 바뀌지 않게.
  const rng = new Rng(opts.seed).fork(0x7e44a1);
  const noiseSeed = rng.int(0x7fffffff);

  // 세로 경계선 (height 비율)
  const roadY = height * 0.05;
  const mountainY = height * 0.17;
  const plainY = height * 0.44;
  const sandY = height * 0.52;
  const shoreY = height * 0.56;
  const shallowY = height * 0.66;
  const deepY = height * 0.8;

  const wMountain = makeWave(rng, width, height * 0.035);
  const wPlain = makeWave(rng, width, height * 0.03);
  const wSand = makeWave(rng, width, height * 0.02);
  const wShore = makeWave(rng, width, height * 0.018);
  const wShallow = makeWave(rng, width, height * 0.035);
  const wDeep = makeWave(rng, width, height * 0.04);

  for (let x = 0; x < width; x++) {
    const mY = mountainY + wMountain(x);
    const pY = plainY + wPlain(x);
    const saY = sandY + wSand(x);
    const shY = shoreY + wShore(x);
    const slY = shallowY + wShallow(x);
    const dY = deepY + wDeep(x);

    for (let y = 0; y < height; y++) {
      let t: Terrain;

      if (y < roadY) {
        t = Terrain.Roadside;
      } else if (y < mY) {
        // 산자락 — 숲과 바위가 섞임
        const n = valueNoise(x, y, 5, noiseSeed);
        t = n > 0.62 ? Terrain.Rock : Terrain.Forest;
      } else if (y < pY) {
        // 주력 건설 구역. 산자락 바로 아래는 경사지(슬라이드 보너스).
        const distFromMountain = y - mY;
        const nSlope = valueNoise(x, y, 7, noiseSeed ^ 0x11);
        const nPatch = valueNoise(x, y, 6, noiseSeed ^ 0x22);
        if (distFromMountain < height * 0.06 && nSlope > 0.45) {
          t = Terrain.Slope;
        } else if (nPatch > 0.76) {
          t = Terrain.Forest;
        } else if (nPatch < 0.06) {
          t = Terrain.Rock;
        } else {
          t = Terrain.Plain;
        }
      } else if (y < saY) {
        t = Terrain.Sand;
      } else if (y < shY) {
        t = Terrain.Shore;
      } else if (y < slY) {
        t = Terrain.Shallow;
      } else if (y < dY) {
        t = Terrain.Deep;
      } else {
        // 넓은 수역. 하류 쪽에 유속 구간이 흐른다.
        const nCur = valueNoise(x, y, 9, noiseSeed ^ 0x33);
        t = nCur > 0.7 ? Terrain.Current : Terrain.OpenWater;
      }

      world.set(x, y, t);
    }
  }

  return world;
}
