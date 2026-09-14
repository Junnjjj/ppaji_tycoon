import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kairoFrameFor, type KairoAtlasJson } from './kairo-atlas.js';
import { FACILITY_DEFS } from '../sim/game.js';

/**
 * P57-a — main 아틀라스 반입(`docs/plan-ppaji-main-merge.md` M2): 4방향 시설은 `facility/<id>:d<facing>`(facing 1 = 진짜 옆면),
 * 2방향 시설은 옛 키 + 뒤집기. 발자국 6종(카페 3×2 · 수유 2×2 · 찜질방 4×4 · 아이스크림 1×1 · 몽골텐트 3×3 · 그늘막 2×2)은 main 데이터와 같다.
 */
const atlas = JSON.parse(readFileSync(resolve(__dirname, '../../public/assets/kairo-atlas.json'), 'utf8')) as KairoAtlasJson;

describe('P57-a main 아틀라스', () => {
  it('아틀라스 344 프레임 · 4방향 시설 ≥ 26 · ppaji 시설 중 프레임 있는 것 ≥ 49', () => {
    const keys = Object.keys(atlas);
    expect(keys.length).toBeGreaterThanOrEqual(344);
    const fourDir = new Set(keys.filter((k) => /^facility\/[a-z0-9_]+:d1$/.test(k)).map((k) => k.slice(9, -3)));
    expect(fourDir.size).toBeGreaterThanOrEqual(26);
    const ids = [...FACILITY_DEFS.keys()];
    const have = ids.filter((id) => kairoFrameFor(`fac/${id}/0`, atlas) && atlas[(kairoFrameFor(`fac/${id}/0`, atlas) as { frame: string }).frame]);
    expect(have.length).toBeGreaterThanOrEqual(49);
  });

  it('kairoFrameFor — 4방향이면 :d0/:d1 (뒤집기 없음), 2방향이면 옛 키 + facing 1 뒤집기, json 없이는 첫 후보', () => {
    expect(kairoFrameFor('fac/cafe/0', atlas)).toEqual({ frame: 'facility/cafe:d0', flip: false });
    expect(kairoFrameFor('fac/cafe/1', atlas)).toEqual({ frame: 'facility/cafe:d1', flip: false });
    const twoDir = Object.keys(atlas).find((k) => /^facility\/[a-z0-9_]+$/.test(k) && !atlas[`${k}:d1`]);
    expect(twoDir).toBeDefined();
    const id = (twoDir as string).slice(9);
    expect(kairoFrameFor(`fac/${id}/1`, atlas)).toEqual({ frame: `facility/${id}`, flip: true });
    expect(kairoFrameFor('fac/cafe/1')).toEqual({ frame: 'facility/cafe:d1', flip: false });
  });

  it('발자국 6종 = main 값', () => {
    const want: Record<string, [number, number]> = { cafe: [3, 2], nursing: [2, 2], jjimjilbang: [4, 4], icecream: [1, 1], mongol_tent: [3, 3], shade_net: [2, 2] };
    for (const [id, [w, d]] of Object.entries(want)) { const def = FACILITY_DEFS.get(id)!; expect([def.w, def.d], id).toEqual([w, d]); }
  });
});
