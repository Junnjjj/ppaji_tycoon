import { Game, FACILITY_DEFS } from '../sim/game.js';
import { gardenMap } from './garden.js';
import { FacilityStore, type FacilitySnapshot } from '../sim/facility.js';
import { type FloorCode } from '../sim/grid.js';

export const DRAFT_KEY = 'ppaji.map-editor.draft.v1';
export const PLAY_KEY = 'ppaji.map-editor.play.v1';
export interface MapDocument {
  format: 'ppaji-base-map'; version: 1; name: string; seed: number;
  grid: { w: number; h: number; floor: number[]; levels: number[]; natural: number[] };
  facilities: FacilitySnapshot;
}
export function captureMap(game: Game, name: string): MapDocument {
  return { format: 'ppaji-base-map', version: 1, name: name.slice(0,80), seed: game.seed,
    grid: { w: game.grid.w, h: game.grid.h, floor: [...game.grid.floor], levels: [...game.grid.levels], natural: [...game.grid.natural] },
    facilities: structuredClone(game.facilities.toSnapshot()) };
}
export function parseMap(raw: unknown, base: Game): MapDocument {
  if (!raw || typeof raw !== 'object') throw new Error('맵 파일이 아닙니다.');
  const x = structuredClone(raw) as MapDocument;
  if (x.format !== 'ppaji-base-map' || x.version !== 1 || x.seed !== base.seed || typeof x.name !== 'string') throw new Error('지원하지 않는 맵 형식 또는 시드입니다.');
  const n = base.grid.w * base.grid.h;
  const legacy = x.grid?.w === 96 && x.grid?.h === 72 && base.grid.h === 120;
  if (!x.grid || x.grid.w !== base.grid.w || (x.grid.h !== base.grid.h && !legacy)) throw new Error('맵 크기가 다릅니다.');
  for (const [key,max] of [['floor',15],['natural',15],['levels',3]] as const) {
    const a=x.grid[key]; if(!Array.isArray(a)||a.length!==(legacy?96*72:n)||a.some(v=>!Number.isInteger(v)||v<0||v>max)) throw new Error(`잘못된 지형 데이터: ${key}`);
  }
  if(legacy){
    for(const key of ['floor','natural','levels'] as const) x.grid[key].push(...Array.from(base.grid[key]).slice(96*72));
    x.grid.h=base.grid.h;
  }
  if(!x.facilities || !Array.isArray(x.facilities.list) || x.facilities.list.length>1500 || !Number.isInteger(x.facilities.nextUid)) throw new Error('시설 데이터가 잘못되었습니다.');
  const ids=new Set<number>(); const occ=new Set<number>();
  for(const f of x.facilities.list) {
    const def=FACILITY_DEFS.get(f.defId);
    if(!def||!Number.isInteger(f.uid)||f.uid<1||f.uid>=65535||ids.has(f.uid)||!Number.isInteger(f.i)||!Number.isInteger(f.j)||![0,1].includes(f.facing)) throw new Error('시설 위치 또는 종류가 잘못되었습니다.');
    ids.add(f.uid);
    for(const t of FacilityStore.footprint(def,f.i,f.j,f.facing)) {
      if(!base.grid.inside(t.i,t.j)) throw new Error('맵 밖의 시설이 있습니다.');
      const k=t.j*base.grid.w+t.i;
      if(def.id!=='entrance') { if(occ.has(k)) throw new Error('겹친 시설이 있습니다.'); occ.add(k); }
    }
    if(!Number.isInteger(f.level)||f.level<1||f.level>5 || ![f.usesToday,f.usesTotal,f.incomeToday,f.incomeTotal].every(v=>Number.isFinite(v)&&v>=0)) throw new Error('시설 상태가 잘못되었습니다.');
    if(f.padding!==undefined&&(!Number.isInteger(f.padding)||f.padding<0||f.padding>4)) throw new Error('시설 여백이 잘못되었습니다.');
    if(f.passage!==undefined&&(!Array.isArray(f.passage)||f.passage.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)))) throw new Error('시설 통로가 잘못되었습니다.');
  }
  if(x.facilities.nextUid<=Math.max(0,...ids)||x.facilities.nextUid>=65535) throw new Error('시설 번호가 잘못되었습니다.');
  // Existing pool/foodcourt topology and entrance systems are retained in this first editor.
  for(const k of protectedTiles(base)) if(x.grid.floor[k]!==base.grid.floor[k] || x.grid.levels[k]!==base.grid.levels[k] || x.grid.natural[k]!==base.grid.natural[k]) throw new Error('입구·도로·기존 수역은 보호된 영역입니다.');
  for(let k=0;k<n;k++) if(x.grid.floor[k]===4 && base.grid.floor[k]!==4) throw new Error('수영장은 게임의 수역 도구로 만드세요.');
  for(const f of base.facilities.all.filter(f=>f.defId==='entrance'||f.passage?.length||FACILITY_DEFS.get(f.defId)?.derived)) {
    if(JSON.stringify(x.facilities.list.find(t=>t.uid===f.uid))!==JSON.stringify(f)) throw new Error('입구·통로 시설은 보호되어 있습니다.');
  }
  return structuredClone(x);
}
export function protectedTiles(game: Game): Set<number> {
  const out=new Set(game.pools.all.flatMap(p=>[...p.tiles]));
  for(const k of game.foodcourts.tileKeys(game.grid.w)) out.add(k);
  for(let j=0;j<game.grid.h;j++) for(let i=0;i<game.grid.w;i++) if(j<3 || (Math.abs(i-game.gate.i)<=1&&j<=10)) out.add(j*game.grid.w+i);
  return out;
}
export function applyMap(game: Game, doc: MapDocument): void {
  game.grid.floor.set(doc.grid.floor); game.grid.levels.set(doc.grid.levels);
  doc.grid.natural.forEach((v,k)=>game.grid.setNatural(k%game.grid.w,Math.floor(k/game.grid.w),v as FloorCode));
  game.facilities.fromSnapshot(structuredClone(doc.facilities)); game.refreshMapForEditor();
}
export function loadEditorMap(game: Game, play: boolean): string | null {
  try { const raw=(play?sessionStorage:localStorage).getItem(play?PLAY_KEY:DRAFT_KEY); if(raw) applyMap(game,parseMap(JSON.parse(raw),game)); else if(play) return '테스트할 맵이 없습니다. 에디터에서 플레이 버튼을 눌러주세요.'; else applyMap(game,gardenMap(game)); return null; }
  catch(error) { return `저장된 맵을 열지 못했습니다: ${error instanceof Error?error.message:String(error)}`; }
}
