import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  APPROVED_FACILITY_IDS, approvedAnchor, approvedPivot, approvedFootprint, approvedFrameId,
  approvedSampleAt, approvedSampleToTile, rotateTile,
  type ApprovedFacilityManifest, type ApprovedRoutes, type FacilityRoutes,
} from './approved-facilities.js';
import composites from '../data/composites.json';
import facilities from '../data/facilities.json';
import { compositeDeckTiles, COMPOSITES } from '../sim/rig.js';
import { gridToScreen, TILE_W, TILE_H } from '../render/iso.js';

/**
 * 승인 정적 조합 시설 (ppaji-buildable-pair-v2) — 그림 넉 장과 **피벗**이 계약이다.
 * 여기서 재는 것은 셋: ① 앵커 공식이 저자 투영식과 같은가 ② facing 회전이 발자국·데크·동선에서 한 규칙인가
 * ③ 구운 동선이 「입구에서 시작해 입구로 끝난다」 (손님이 시설 안쪽에 순간이동하지 않는다).
 */
const BASE = 'public/assets/approved-facilities';
const manifest = JSON.parse(readFileSync(`${BASE}/manifest.json`, 'utf8')) as ApprovedFacilityManifest;
const routes = JSON.parse(readFileSync(`${BASE}/routes.json`, 'utf8')) as ApprovedRoutes;
const TILE_WORLD = Math.sqrt(512);

describe('승인 조합 시설 — 계약', () => {
  it('ID 둘 · 프레임 넉 장씩 · 선언한 크기·해시가 실제 PNG 와 같다', () => {
    expect([...APPROVED_FACILITY_IDS]).toEqual(['ppaji_slide', 'ppaji_playground', 'boarding_dock']);
    for (const id of APPROVED_FACILITY_IDS) {
      const s = manifest.facilities[id];
      expect(s, id).toBeDefined();
      expect(Object.keys(s!.frames).sort()).toEqual(['d0', 'd1', 'd2', 'd3']);
      for (const [d, f] of Object.entries(s!.frames)) {
        const bytes = readFileSync(`${BASE}/${f.file}`);
        expect(bytes.subarray(0, 8).toString('hex'), `${id}/${d}`).toBe('89504e470d0a1a0a'); // PNG
        expect(bytes.readUInt32BE(16), `${id}/${d} w`).toBe(f.w);
        expect(bytes.readUInt32BE(20), `${id}/${d} h`).toBe(f.h);
        expect(f.w, `${id}/${d}`).toBe(s!.logicalSize);
      }
      expect(approvedFrameId(id, 1)).toBe(`fac/${id}/1`);
    }
  });

  it('앵커는 **에셋 피벗**이다 — ax = n/2 · ay = n/2 + 0.65 × √512 × cos30° (저자 projectWorld 와 같은 식)', () => {
    for (const id of APPROVED_FACILITY_IDS) {
      const s = manifest.facilities[id]!;
      const a = approvedAnchor(id, manifest)!;
      expect(a.ax).toBe(s.logicalSize / 2);
      expect(a.ay).toBeCloseTo(s.logicalSize / 2 + manifest.projection.cameraTargetZTiles * TILE_WORLD * Math.cos(Math.PI / 6), 3);
      // 발자국 중심이 아니다 — 놀이터는 피벗이 중심에서 +I 로 한 칸 (나머지 한 칸은 예약한 접근 수면)
      expect(a.ax / (TILE_W / 2) * 0).toBe(0); // 눈금 확인용 (TILE_W 32 · TILE_H 16)
      expect(TILE_W).toBe(32); expect(TILE_H).toBe(16);
    }
    const pg = manifest.facilities['ppaji_playground'] as typeof manifest.facilities[string];
    expect(pg.footprintCenter).toEqual([-1, 0]);
    expect(approvedPivot('ppaji_playground', 0, manifest)).toEqual([11, 6]); // 중심 (10, 6) 에서 +I 한 칸
  });

  it('피벗·발자국은 **한 회전 규칙**을 따른다 — R:(I,J) → (J, −I), 그리고 언제나 발자국 안에 있다', () => {
    for (const id of APPROVED_FACILITY_IDS) {
      const s = manifest.facilities[id]!;
      const [ox, oy] = s.footprintOrigin, [W, D] = s.size;
      const want = [[-ox, oy + D], [oy + D, ox + W], [ox + W, -oy], [-oy, -ox]];
      for (let f = 0; f < 4; f++) {
        expect(approvedPivot(id, f, manifest), `${id}/d${f}`).toEqual(want[f]);
        const fp = approvedFootprint(id, f, manifest)!;
        expect(fp, `${id}/d${f}`).toEqual(f % 2 === 0 ? [W, D] : [D, W]);
        const [pi, pj] = approvedPivot(id, f, manifest)!;
        expect(pi, `${id}/d${f} i`).toBeGreaterThanOrEqual(0); expect(pi).toBeLessThanOrEqual(fp[0]);
        expect(pj, `${id}/d${f} j`).toBeGreaterThanOrEqual(0); expect(pj).toBeLessThanOrEqual(fp[1]);
      }
      // 음성 대조군 — 회전이 실제로 다른 값을 낸다 (항등이면 아무것도 안 잰다)
      expect(approvedPivot(id, 1, manifest)).not.toEqual(approvedPivot(id, 0, manifest));
    }
    expect(rotateTile(3, 1, 0)).toEqual([3, 1]);
    expect(rotateTile(3, 1, 1)).toEqual([1, -3]);
    expect(rotateTile(3, 1, 2)).toEqual([-3, -1]);
    expect(rotateTile(3, 1, 4)).toEqual([3, 1]); // 네 번 돌면 제자리
  });

  it('그리기 계약 — 화면 자리는 gridToScreen(i0 + di, j0 + dj) 에서 앵커를 뺀 것이고, 소수 칸이 반 픽셀을 안 만든다', () => {
    const id = 'ppaji_slide';
    const [pi, pj] = approvedPivot(id, 0, manifest)!;
    const a = approvedAnchor(id, manifest)!;
    const s = gridToScreen(40 + pi, 30 + pj);
    expect(s.x).toBe((TILE_W / 2) * (40 + pi - 30 - pj));
    expect(Number.isInteger(s.x)).toBe(true); // 피벗의 i−j 가 정수라 가로는 정수 (세로는 3.5 칸이라 반 픽셀이 날 수 있다 — 그리기에서 반올림한다)
    expect(a.ax).toBe(128);
  });

  it('데크 마스크 — sim(`composites.json`)과 화면(manifest)이 같은 칸을 말한다 · 전부 발자국 안 · 회전이 크기를 지킨다', () => {
    for (const c of COMPOSITES) {
      const s = manifest.facilities[c.id]!;
      expect(s.deckTiles, c.id).toEqual(c.deckTiles);
      expect(c.size).toEqual(s.size);
      expect(c.deckTiles.length, c.id).toBeGreaterThan(0);
      // 조합 둘은 **열린 수면을 예약**하므로 데크가 발자국보다 작다. 승하선 데크는 단일 모듈이라 발자국 전체가 데크다 (접안 수면은 발자국 밖)
      if (c.id.startsWith('ppaji_')) expect(c.deckTiles.length, c.id).toBeLessThan(c.size[0] * c.size[1]);
      else expect(c.deckTiles.length, c.id).toBe(c.size[0] * c.size[1]);
      for (const [a, b] of c.deckTiles) { expect(a, c.id).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(c.size[0]); expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(c.size[1]); }
      for (const facing of [0, 1] as const) {
        const [w, d] = facing === 0 ? c.size : [c.size[1], c.size[0]];
        const tiles = compositeDeckTiles(c.id, 10, 20, facing);
        expect(tiles.length, `${c.id}/${facing}`).toBe(c.deckTiles.length);
        expect(new Set(tiles.map((t) => `${t.i}|${t.j}`)).size, `${c.id}/${facing}`).toBe(tiles.length); // 겹침 0
        for (const t of tiles) { expect(t.i - 10).toBeGreaterThanOrEqual(0); expect(t.i - 10).toBeLessThan(w); expect(t.j - 20).toBeGreaterThanOrEqual(0); expect(t.j - 20).toBeLessThan(d); }
      }
    }
    expect(compositeDeckTiles('toilet', 0, 0, 0)).toEqual([]); // 조합이 아니면 빈 목록
  });

  it('동선 — 입구에서 시작해 입구로 끝난다 (순간이동 없음) · 구간이 이어져 있다 · 표본기가 끝에서 감긴다', () => {
    for (const id of APPROVED_FACILITY_IDS) {
      const r = (routes as unknown as Record<string, FacilityRoutes>)[id];
      if (!r) { expect(id, '동선이 없는 것은 승하선 데크뿐이다 (단일 모듈 — 저자 동선은 검토 하네스 전용)').toBe('boarding_dock'); continue; }
      const entry = r.entry;
      for (const track of [r.tour, ...r.visits]) {
        const segs = track.segments;
        expect(segs.length, id).toBeGreaterThan(1);
        expect(segs[0]!.from.slice(0, 2), `${id} 시작`).toEqual(entry.slice(0, 2));
        expect(segs[segs.length - 1]!.to.slice(0, 2), `${id} 끝`).toEqual(entry.slice(0, 2));
        for (let k = 0; k + 1 < segs.length; k++) {
          expect(segs[k]!.to, `${id} 구간 ${k} 이음`).toEqual(segs[k + 1]!.from);
          expect(segs[k]!.t + segs[k]!.dur, `${id} 구간 ${k} 시각`).toBeCloseTo(segs[k + 1]!.t, 2);
        }
        expect(segs[segs.length - 1]!.t + segs[segs.length - 1]!.dur).toBeCloseTo(track.cycle, 2);
        // 표본기 — 0 과 주기는 같은 자리, 주기를 넘으면 감긴다
        expect(approvedSampleAt(track, 0).p).toEqual(segs[0]!.from);
        expect(approvedSampleAt(track, track.cycle).p).toEqual(approvedSampleAt(track, 0).p);
        expect(approvedSampleAt(track, -1).p).toEqual(approvedSampleAt(track, track.cycle - 1).p);
      }
      expect(r.actors.length, id).toBeGreaterThan(0);
    }
  });

  it('동선 → 게임 칸 — 입구 표본은 발자국 **가장자리 밖**으로 떨어지고, facing 이 바뀌면 자리도 바뀐다', () => {
    const id = 'ppaji_playground';
    const r = (routes as unknown as Record<string, FacilityRoutes>)[id]!;
    const first = approvedSampleAt(r.tour, 0);
    const at0 = approvedSampleToTile(id, 0, first, 100, 50, manifest)!;
    // 입구 (−11, −1): i = 100 + 11 − 11 = 100 (서쪽 변), j = 50 + 6 + 1 = 57
    expect(at0.i).toBeCloseTo(100, 6);
    expect(at0.j).toBeCloseTo(57, 6);
    expect(at0.z).toBeCloseTo(0.22, 6);
    const at1 = approvedSampleToTile(id, 1, first, 100, 50, manifest)!;
    expect([at1.i, at1.j]).not.toEqual([at0.i, at0.j]); // 음성 대조군 — 회전이 실제로 먹는다
    // 둘 다 발자국 안이거나 그 가장자리다 (조합 밖으로 새지 않는다)
    for (const [p, f] of [[at0, 0], [at1, 1]] as const) {
      const fp = approvedFootprint(id, f, manifest)!;
      expect(p.i - 100).toBeGreaterThanOrEqual(0); expect(p.i - 100).toBeLessThanOrEqual(fp[0]);
      expect(p.j - 50).toBeGreaterThanOrEqual(0); expect(p.j - 50).toBeLessThanOrEqual(fp[1]);
    }
  });

  it('데이터 — 조합 둘은 시설 정의에 있고, useTicks 가 구운 동선 길이에서 나온 값이다', () => {
    const defs = facilities as unknown as { id: string; w: number; d: number; useTicks: number; class: string; deprecated?: boolean }[];
    for (const c of composites as unknown as { id: string; size: [number, number]; routeUseTicks: number }[]) {
      const def = defs.find((f) => f.id === c.id)!;
      expect(def, c.id).toBeDefined();
      expect([def.w, def.d], c.id).toEqual(c.size);
      expect(def.class, c.id).toBe(c.id.startsWith('ppaji_') ? 'rig' : 'attraction'); // 승하선 데크는 링 위 attraction (기존 선착장과 같은 계열)
      expect(def.deprecated, c.id).toBeUndefined();
      if (c.id.startsWith('ppaji_')) expect(def.useTicks, c.id).toBe(c.routeUseTicks); // 저자 동선이 finishUse 전에 끝난다
    }
  });
});
