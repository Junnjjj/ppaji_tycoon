import { overlapsWallGarden } from './boundary-decor.js';
import { gardenMap } from './garden.js';
import type Phaser from 'phaser';
import { Game, FACILITY_DEFS } from '../sim/game.js';
import { FLOOR, MAX_LEVEL, type FloorCode, isWaterCode } from '../sim/grid.js';
import { FacilityStore } from '../sim/facility.js';
import type { WaterparkScene } from '../render/scene.js';
import { gridToScreen, screenToTile, lift } from '../render/iso.js';
import { imagegenArt } from '../assets/imagegen-art.js';
import { captureMap, applyMap, parseMap, protectedTiles, DRAFT_KEY, PLAY_KEY, type MapDocument } from './document.js';
import './editor.css';

type Tool = 'pan'|'paint'|'height'|'facility'|'erase';
const TERRAINS: [FloorCode,string,string][] = [[1,'잔디','#83a568'],[0,'모래','#dccaa0'],[2,'산책로','#cfbfa9'],[5,'강물','#447ca2'],[6,'여울','#7bb4b8'],[7,'데크','#b98b64'],[8,'모래길','#bcaa88'],[9,'보도','#acb1aa'],[10,'나무길','#9c7959'],[11,'화단','#8eab73'],[12,'자갈','#989d99'],[14,'바위','#777e78'],[3,'실내','#d5bf9d'],[15,'복도','#d9c8ad']];
export function attachTestBar(error: string|null): void {
  const bar=document.createElement('div'); bar.className='map-testbar';
  const link=document.createElement('a');link.href='?editor=1';link.textContent='← 맵 에디터로 돌아가기';
  bar.append(link,document.createTextNode(error??'내 맵 테스트 · 기존 공원 저장에는 반영되지 않습니다'));document.body.append(bar);
}
export function attachEditor({game,scene,sync,loadError}:{game:Game;scene:WaterparkScene;sync:()=>void;loadError:string|null}):void {
  if(!scene.sys.isActive()) {scene.events.once('create',()=>attachEditor({game,scene,sync,loadError}));return;}
  document.body.classList.add('map-editing');document.title='빠지 · 기본맵 에디터';
  let tool:Tool='pan', terrain:FloorCode=FLOOR.grass, size=1, height=0, facing:0|1=0;
  let selected='';let name='넓은 S자 강 · 숲속 빠지';let dirty=false;let before:MapDocument|null=null;let last='';
  const undo:MapDocument[]=[],redo:MapDocument[]=[];
  const baseline=new Game(game.seed,undefined,{kit:true,arrival:true});
  const protectedSet=protectedTiles(baseline);
  const root=document.createElement('div');root.id='map-editor';
  root.innerHTML=`<header><div><small>PPAJI WORLD BUILDER</small><h1>기본맵 에디터 <span>v1</span></h1></div><input id="map-name" aria-label="맵 이름" maxlength="80"><button id="save-map">저장</button><button id="play-map" class="primary">이 맵으로 플레이 ↗</button></header>
  <aside><div class="intro">① 강 전체 보기 → ② 도구 선택 → ③ 저장·플레이</div><div id="tools" class="tools"><button data-tool="pan">✥ 이동</button><button data-tool="paint">▧ 지형</button><button data-tool="height">↥ 높이</button><button data-tool="facility">⌂ 시설</button><button data-tool="erase">⌫ 시설 삭제</button></div>
  <section id="paint-controls"><h2>바닥 재질</h2><div id="terrains" class="swatches"></div></section>
  <section id="height-controls"><h2>땅 높이</h2><label>높이 <select id="height">${Array.from({length:MAX_LEVEL+1},(_,n)=>`<option value="${n}">${n}단</option>`).join('')}</select></label></section>
  <section id="brush-controls"><label>브러시 <select id="brush"><option value="1">1 × 1</option><option value="3">3 × 3</option><option value="5">5 × 5</option></select></label><p>누른 채로 드래그해서 칠합니다.</p></section>
  <section id="facility-controls"><h2>시설 배치</h2><input id="facility-search" aria-label="시설 검색" placeholder="시설 이름 검색"><select id="facilities" size="7" aria-label="시설 선택"></select><button id="rotate">회전 · D0 (R)</button><p>초록색 영역에 클릭해서 배치합니다.<br>게임의 여백·지형·보유 토지 규칙을 따릅니다.</p></section>
  <section><div class="row"><button id="undo">↶ 되돌리기</button><button id="redo">↷ 다시 하기</button></div><label class="check"><input id="grid-toggle" type="checkbox"> 타일 격자</label><canvas id="minimap" width="288" height="${game.grid.h*3}" aria-label="전체 맵 이동"></canvas><div class="row"><button id="overview">강 전체 보기</button><button id="home">입구로</button><button id="zoom">확대 / 축소</button></div><button id="town-view">마을 · 인도 보기</button></section>
  <section><h2>맵 파일</h2><div class="row"><button id="export">JSON 내보내기</button><button id="import">불러오기</button></div><input id="map-file" type="file" accept="application/json,.json" hidden><button id="garden">숲속 빠지 추천 배치</button><button id="reset">기존 기본맵으로 초기화</button><p>입구·상단 도로·기존 수역은 보호됩니다. 배경 지형은 전체 맵에서 편집할 수 있습니다.</p></section></aside><footer><b id="status" role="status">준비 중</b><span id="coord">${game.grid.w} × ${game.grid.h}</span><span>이동 도구: 드래그 · 휠: 확대 · Ctrl/⌘ Z: 취소</span></footer>`;
  document.body.append(root);
  const el=<T extends HTMLElement>(id:string)=>root.querySelector<T>(`#${id}`)!;
  const status=(text:string)=>{el('status').textContent=text;};
  const nameInput=el<HTMLInputElement>('map-name');
  try {const raw=localStorage.getItem(DRAFT_KEY);if(raw) name=JSON.parse(raw).name??name;}catch{/* load error is surfaced below */}
  nameInput.value=name;
  nameInput.oninput=()=>{name=nameInput.value;dirty=true;status('변경됨 · 저장 버튼을 눌러 보관하세요');};
  const draw=scene.add.graphics().setDepth(9_000_010);const cursor=scene.add.graphics().setDepth(9_000_011);
  function diamond(g:Phaser.GameObjects.Graphics,i:number,j:number,color:number,alpha:number,fill=false):void {
    const p=gridToScreen(i,j), y=p.y+lift(game.grid.levelAt(i,j));
    g.lineStyle(.5,color,alpha);if(fill)g.fillStyle(color,.22);
    g.beginPath();g.moveTo(p.x,y);g.lineTo(p.x+16,y+8);g.lineTo(p.x,y+16);g.lineTo(p.x-16,y+8);g.closePath();if(fill)g.fillPath();g.strokePath();
  }
  function grid():void {draw.clear();if(el<HTMLInputElement>('grid-toggle').checked)for(let j=0;j<game.grid.h;j++)for(let i=0;i<game.grid.w;i++)diamond(draw,i,j,protectedSet.has(j*game.grid.w+i)?0xf1b65b:0x234d47,.3);}
  const mini=el<HTMLCanvasElement>('minimap'),ctx=mini.getContext('2d')!;
  function minimap():void {for(let j=0;j<game.grid.h;j++)for(let i=0;i<game.grid.w;i++){ctx.fillStyle=TERRAINS.find(t=>t[0]===game.grid.at(i,j))?.[2]??'#688cac';ctx.fillRect(i*3,j*3,3,3);}ctx.fillStyle='#f8f3de';for(const f of game.facilities.all)ctx.fillRect(f.i*3,f.j*3,4,4);ctx.strokeStyle='#ffe784';ctx.lineWidth=1;ctx.strokeRect(game.land.i0*3,game.land.j0*3,game.land.w*3,game.land.h*3);}
  mini.onclick=e=>{const r=mini.getBoundingClientRect();scene.focusTile(Math.floor((e.clientX-r.left)/r.width*game.grid.w),Math.floor((e.clientY-r.top)/r.height*game.grid.h));};
  function buttons():void {el<HTMLButtonElement>('undo').disabled=!undo.length;el<HTMLButtonElement>('redo').disabled=!redo.length;}
  function refresh():void {game.refreshMapForEditor();sync();grid();minimap();buttons();}
  function restore(doc:MapDocument):void {applyMap(game,doc);name=doc.name;nameInput.value=name;dirty=true;refresh();}
  function start():void {if(!before)before=captureMap(game,name);}
  function commit():void {if(before&&JSON.stringify(before)!==JSON.stringify(captureMap(game,name))){undo.push(before);if(undo.length>60)undo.shift();redo.length=0;dirty=true;status('변경됨 · 저장 버튼을 눌러 보관하세요');}before=null;last='';refresh();}
  function history(back:boolean):void {if(before)commit();const from=back?undo:redo,to=back?redo:undo,doc=from.pop();if(doc){to.push(captureMap(game,name));restore(doc);status(back?'되돌렸습니다':'다시 적용했습니다');}}
  el('undo').onclick=()=>history(true);el('redo').onclick=()=>history(false);
  function choose(next:Tool):void {if(before)commit();tool=next;root.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));el('paint-controls').hidden=tool!=='paint';el('height-controls').hidden=tool!=='height';el('brush-controls').hidden=!['paint','height'].includes(tool);el('facility-controls').hidden=tool!=='facility';cursor.clear();status(tool==='pan'?'드래그해서 지도를 이동하세요':tool==='erase'?'시설을 클릭하면 삭제합니다':'지도 위에서 편집하세요');}
  root.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>b.onclick=()=>choose(b.dataset.tool as Tool));
  for(const [code,label,color] of TERRAINS){const b=document.createElement('button');b.textContent=label;b.style.setProperty('--swatch',color);b.className='swatch';b.classList.toggle('active',code===terrain);b.onclick=()=>{terrain=code;el('terrains').querySelectorAll('button').forEach(t=>t.classList.toggle('active',t===b));};el('terrains').append(b);}
  el<HTMLSelectElement>('brush').onchange=e=>{size=Number((e.target as HTMLSelectElement).value);};
  el<HTMLSelectElement>('height').onchange=e=>{height=Number((e.target as HTMLSelectElement).value);};
  const defs=[...FACILITY_DEFS.values()].filter(d=>!d.derived&&!d.deprecated&&d.id!=='entrance').sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  function list():void {const q=el<HTMLInputElement>('facility-search').value.toLowerCase(),select=el<HTMLSelectElement>('facilities');select.replaceChildren();for(const d of defs.filter(d=>`${d.name} ${d.id}`.toLowerCase().includes(q))){const o=document.createElement('option');o.value=d.id;o.textContent=`${d.name} · ${d.w}×${d.d}`;select.append(o);}select.value=selected;if(!select.value){selected=select.options[0]?.value??'';select.value=selected;}}
  el<HTMLInputElement>('facility-search').oninput=list;el<HTMLSelectElement>('facilities').onchange=e=>{selected=(e.target as HTMLSelectElement).value;};list();
  function rotate():void{facing=facing===0?1:0;el('rotate').textContent=`회전 · D${facing} (R)`;}el('rotate').onclick=rotate;
  function tiles(i:number,j:number):{i:number;j:number}[]{if(tool==='facility'){const def=FACILITY_DEFS.get(selected);return def?FacilityStore.footprint(def,i,j,facing):[];}const out=[];for(let a=-Math.floor(size/2);a<=Math.floor(size/2);a++)for(let b=-Math.floor(size/2);b<=Math.floor(size/2);b++)out.push({i:i+a,j:j+b});return out;}
  function protectedFacility(uid:number):boolean{const f=game.facilities.byUid(uid);return !!f&&(f.defId==='entrance'||!!f.passage?.length||!!FACILITY_DEFS.get(f.defId)?.derived);}
  function edit(i:number,j:number):void {
    if(!game.grid.inside(i,j))return;
    const key=`${i},${j}`;if(key===last)return;last=key;start();
    if(tool==='facility'){
      if(overlapsWallGarden(game,selected,i,j,facing)){status('유리벽 화단과 겹칩니다 · 한 칸 이상 안쪽으로 놓아 주세요');return;}
      const r=game.placeFacility(selected,i,j,facing,{inherited:true,autoPath:false});
      if(!r.ok)status(r.reason??'이 위치에는 놓을 수 없습니다');else{void imagegenArt.load(`fac/${selected}/${facing}`).then(()=>sync());sync();}
      return;
    }
    if(tool==='erase'){const f=game.facilities.at(i,j);if(f&&!protectedFacility(f.uid)){game.facilities.remove(f.uid);sync();}else status('삭제할 시설이 없거나 보호된 시설입니다');return;}
    let blocked=0;
    for(const t of tiles(i,j)){
      if(!game.grid.inside(t.i,t.j))continue;const k=t.j*game.grid.w+t.i;
      if(protectedSet.has(k)||game.facilities.occupied(t.i,t.j)){blocked++;continue;}
      if(tool==='paint'){game.grid.set(t.i,t.j,terrain);if([0,1,5,6,14].includes(terrain))game.grid.setNatural(t.i,t.j,terrain);if(isWaterCode(terrain))game.grid.setLevel(t.i,t.j,0);}
      else if(tool==='height')game.grid.setLevel(t.i,t.j,height);
      scene.refreshTile(t.i,t.j);
    }
    if(blocked)status('보호 영역과 시설 아래는 칠하지 않았습니다');grid();
  }
  let painting=false;
  scene.editorPointer=(phase,p)=>{
    if(tool==='pan')return false;
    const world=scene.cameras.main.getWorldPoint(p.x,p.y);let t=screenToTile(world.x,world.y);
    // Pick the foremost raised top surface, using the same lift as the renderer.
    for(let z=MAX_LEVEL;z>=0;z--){const c=screenToTile(world.x,world.y-lift(z));if(game.grid.inside(c.i,c.j)&&game.grid.levelAt(c.i,c.j)===z){t=c;break;}}
    el('coord').textContent=`타일 ${t.i}, ${t.j} · 높이 ${game.grid.levelAt(t.i,t.j)}`;
    cursor.clear();const allowed=tool!=='facility'||(!overlapsWallGarden(game,selected,t.i,t.j,facing)&&game.canPlace(selected,t.i,t.j,facing,{inherited:true}).ok);
    for(const c of tiles(t.i,t.j))if(game.grid.inside(c.i,c.j))diamond(cursor,c.i,c.j,allowed?0xb5ffe0:0xff6e6e,.95,true);
    if(phase==='down'){painting=true;edit(t.i,t.j);}
    if(phase==='move'&&painting&&p.isDown&&(tool==='paint'||tool==='height'))edit(t.i,t.j);
    if(phase==='up'&&painting){painting=false;commit();}
    return true;
  };
  window.addEventListener('pointerup',()=>{if(painting){painting=false;commit();}});
  function save():boolean{try{if(before)commit();const doc=parseMap(captureMap(game,name),baseline);localStorage.setItem(DRAFT_KEY,JSON.stringify(doc));dirty=false;status('저장 완료 · 이 브라우저에 보관했습니다');return true;}catch(e){status(String(e));return false;}}
  el('save-map').onclick=()=>{save();};
  el('play-map').onclick=()=>{if(save()){try{sessionStorage.setItem(PLAY_KEY,JSON.stringify(captureMap(game,name)));const tab=window.open('?mapTest=1','_blank');if(!tab)status('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');}catch(e){status(`테스트 맵 저장 실패: ${String(e)}`);}}};
  el('export').onclick=()=>{if(before)commit();try{const doc=parseMap(captureMap(game,name),baseline),url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${name.replace(/[^a-zA-Z0-9가-힣 _-]/g,'_')||'ppaji-map'}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('맵 JSON을 내보냈습니다');}catch(e){status(String(e));}};
  const file=el<HTMLInputElement>('map-file');el('import').onclick=()=>file.click();file.onchange=async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>2_000_000)throw new Error('파일이 너무 큽니다 (최대 2 MB)');const doc=parseMap(JSON.parse(await f.text()),baseline);start();restore(doc);commit();status('맵을 불러왔습니다 · 저장하면 보관됩니다');}catch(e){status(`불러오기 실패: ${String(e)}`);}file.value='';};
  el('reset').onclick=()=>{if(!confirm('현재 편집 내용을 기본맵으로 바꿀까요? 되돌리기로 복구할 수 있습니다.'))return;start();restore(captureMap(baseline,'나의 빠지 기본맵'));commit();};
  el('garden').onclick=()=>{start();restore(gardenMap(baseline));commit();overview();status('S자 강과 숲속 휴식 공간을 배치했습니다 · 되돌리기로 복구할 수 있습니다');};
  function overview():void {scene.setUpscale(1);scene.focusTile(54,28);}
  el('overview').onclick=overview;
  el('town-view').onclick=()=>{scene.setUpscale(2);scene.focusTile(48,-5);};
  el('home').onclick=()=>scene.focusTile(game.gate.i+2,game.gate.j+10);
  el('zoom').onclick=()=>scene.setUpscale(scene.cam.upscale===1?2:1);
  el<HTMLInputElement>('grid-toggle').onchange=grid;
  window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches('input,select,textarea'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}else if(e.key.toLowerCase()==='r')rotate();else if(e.key==='Escape')choose('pan');});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  choose('pan');refresh();overview();status(loadError??'현재 기본맵을 불러왔습니다 · 지형 도구를 선택해 시작하세요');
}
