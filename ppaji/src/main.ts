import { createStartupGame } from './editor/new-game.js';
import { loadEditorMap } from './editor/document.js';
import { populateImagegenPreview } from './sim/imagegen-preview.js';
import { imagegenArt } from './assets/imagegen-art.js';
import { loadImageGenGround } from './render/imagegen-ground.js';
import { loadCompactBoundary } from './render/compact-boundary.js';
import { loadApprovedFacilities } from './assets/approved-facilities.js';
import { loadStaticDepth } from './render/static-facilities.js';
import { COURSE_DOCK_IDS } from './sim/course/ride.js';
import { loadWatercraft } from './assets/watercraft.js';
import { applyArrivalLayout, canAdoptArrival } from './sim/arrival-layout.js';
import './compat.js';
import './ui/style.css';
import { Game, FACILITY_DEFS, INGREDIENTS_BY_ID, GIFTS_BY_ID, RANK_DEFS, FEATURES, type FxEvent, CALENDAR_EVENTS, CERT_DEFS } from './sim/game.js';
import type { GameEvent } from './sim/events.js';
import { TICKS_PER_DAY, JUDGE_TICK, clockView, EVENING_HOUR } from './sim/clock.js';
import { FLOOR } from './sim/grid.js';
import { TICK_MS } from './sim/clock.js';
import { WEATHER_KO } from './sim/weather.js';
import { Camera } from './render/camera.js';
import { ProceduralProvider, registerFacilityDefs } from './assets/provider.js';
import { WaterparkScene, type SceneStats } from './render/scene.js';
import { bootPhaser } from './render/boot.js';
import { tileCenter, gridToScreen } from './render/iso.js';
import { Hud } from './ui/hud.js';
import { sfx } from './render/fx/sfx.js';
import { panelHost, interruptBudget, uiSurface } from './ui/panels.js';
import { PoolEditDock } from './ui/windows/pool-edit.js';
import { PoolInfoWindow } from './ui/windows/pool-info.js';
import { DialogueStrip } from './ui/strip.js';
import { STORY_CHARACTERS, STORY_BEATS } from './sim/story.js';
import { ResultsWindow, type DayCard } from './ui/windows/results.js';
import { RankingsWindow } from './ui/windows/rankings.js';
import { StaffWindow } from './ui/windows/staff.js';
import type { PeriodReport } from './sim/game.js';
import { ASSET_VERSION } from './assets/draw/pix.js';
import { cssVar } from './ui/tokens.js';
import { loadAtlas, HybridProvider } from './assets/atlas-provider.js';
import { loadNpcV8 } from './assets/npc-v8.js';
import { loadKairoAtlas } from './assets/kairo-atlas.js';
import { loadLandscape } from './assets/landscape.js';
import { applyUiScale } from './ui/ui-scale.js';
import { GuestInfoWindow } from './ui/windows/guest-info.js';
import { BuildWindow, BUILD_TABS } from './ui/windows/build.js';
import { PlaceDock } from './ui/windows/place.js';
import { CourseDock } from './ui/windows/course.js';
import { FacilityInfoWindow } from './ui/windows/facility-info.js';
import { SnsWindow } from './ui/windows/sns.js';
import { CertWindow } from './ui/windows/cert.js';
import { RankWindow } from './ui/windows/rank.js';
import { InboxWindow } from './ui/windows/inbox.js';
import { CelebrateWindow } from './ui/windows/celebrate.js';
import { setAutoConfirm } from './ui/dialog.js';
import { CertResultWindow } from './ui/windows/cert-result.js';
import { ChoiceWindow } from './ui/windows/choice.js';
import { fxFired } from './render/fx/registry.js';
import { ShopWindow } from './ui/windows/shop.js';
import { MenuEditWindow } from './ui/windows/menu-edit.js';
import { CookWindow, type DiscoverySpec } from './ui/windows/cook.js';
import { canvasPictureEl, pictureCount, setApprovedPictureSource } from './ui/pictures.js';
import { setNpcFrameSource, npcPortrait } from './ui/portraits.js'; // NPC v8(2026-09-18): 손님·친구 초상은 v8 도트의 머리
import type { CookingStore, RecipeLike, IngredientLike, CookResultOf } from './sim/cooking.js';
import { MenuWindow } from './ui/windows/menu.js';
import { InvestWindow } from './ui/windows/invest.js';
import { CampaignWindow } from './ui/windows/campaign.js';
import { clear as clearSave } from './save/save.js';
import { EndingWindow } from './ui/windows/ending.js';
import { applyCarryover } from './sim/endgame.js';
import { Bot, BOT_DEFAULTS } from './sim/bot.js'; // P53-c 하네스 — 페이지 안에서 봇이 판을 굴린다(목표 HUD 샘플)
import { loadProfile, saveProfile } from './save/profile.js';
import { Bubbles } from './ui/bubbles.js';
import { load, save } from './save/save.js';

declare const __WP_BUILD__: { sha: string; shortSha: string; branch: string; sourceDigest: string; startedAt: string };

/**
 * 부팅 순서: compat → 세이브/새 판 → 씬 → HUD → 흐름. `?debug=1` 이면 `window.__pj` 와 디버그 상자.
 * 시간은 rAF 누산으로 흐른다 (하루 90초). 창이 열리면 멈추고, 풀 편집 독은 안 멈춘다
 * (청구가 완료 순간의 현금으로 판정되므로 결산과 경쟁하지 않는다).
 */
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const EDITOR = params.get('editor') === '1' && !params.has('mapTest');
const MAP_TEST = params.has('mapTest');
const PREVIEW = params.get('preview') === 'arrival' || EDITOR || MAP_TEST;
const FRESH = params.get('fresh') === '1' || PREVIEW;
const SEED = Number(params.get('seed') ?? '20260902') || 20260902;

const parent = document.getElementById('game');
if (!parent) throw new Error('#game 이 없다');

const saved = FRESH ? null : load();
/** `?kit=0` — 하네스 전용: 시작 킷 없는 빈 판 (G1~G24 절이 빈 땅을 전제한다. G25 절만 킷을 본다) */
const NO_KIT = new URLSearchParams(location.search).get('kit') === '0';
/** `?events=0` — 하네스 전용: 랜덤 이벤트 모달이 다른 절을 막지 않게 끈다 (G39 절이 스스로 켠다) */
if (new URLSearchParams(location.search).get('events') === '0') FEATURES.randomEvents = false;
// Explicit reference layout is retained for historical system regression fixtures.
const APPROVED_ARRIVAL = params.get('layout') !== 'reference';
const createGame = (seed: number, kit = !NO_KIT): Game => createStartupGame(seed,kit,APPROVED_ARRIVAL,!EDITOR&&!MAP_TEST);
let arrivalAdopted = false;
let game = saved ? Game.fromSnapshot(saved.game) : createGame(SEED);
if (saved && APPROVED_ARRIVAL && !NO_KIT && !game.arrivalRevision) {
  const reference = new Game(game.seed);
  if (canAdoptArrival(game, reference)) {
    const candidate = Game.fromSnapshot(game.toSnapshot());
    try { applyArrivalLayout(candidate); game = candidate; arrivalAdopted = true; } catch (error) { console.warn('초기 배치 보존:', error); }
  }
}
const editorLoadError = (EDITOR || MAP_TEST) ? loadEditorMap(game, MAP_TEST) : null;
game.facilities.spacingEnabled = true;
if(PREVIEW&&params.get('showcase')==='1')populateImagegenPreview(game);
const camera = new Camera();
registerFacilityDefs(FACILITY_DEFS.values());
const imagegenReady=imagegenArt.init().then(()=>Promise.all([...game.facilities.all.map(f=>imagegenArt.load(`fac/${f.defId}/${f.facing}`)),imagegenArt.load('tile/deck')])).catch((error:unknown)=>{console.warn('ImageGen assets unavailable; retaining original art',error);});
// 아틀라스(프리렌더 PNG)가 있으면 그것을, 없으면 절차 도트 — 같은 ID 라 게임 코드는 모른다 (G15)
const [atlas, kairo, landscape, npc, watercraft, approved, imagegenGround, compactBoundary] = await Promise.all([
  loadAtlas(), loadKairoAtlas(), loadLandscape(), loadNpcV8(), loadWatercraft(), loadApprovedFacilities(), loadImageGenGround(),
  game.arrivalRevision >= 3 ? loadCompactBoundary() : Promise.resolve(undefined),imagegenReady,
]);
const rideSeatSpecs = Object.fromEntries(Object.entries(watercraft.manifest.equipment).map(([id,spec])=>[id,spec.seats]));
game.setRideSeatSpecs(rideSeatSpecs);
const staticDepth = approved ? await loadStaticDepth(approved) : null;
if (PREVIEW) { game.story.fromSnapshot(STORY_BEATS.map(b=>b.id)); game.guests.spawn(); }
if (!saved && !PREVIEW) game.checkStory(true);
setApprovedPictureSource(id => { const match = /^pic\/gear\/([a-z0-9_]+)$/.exec(id); return match ? imagegenArt.get(`watercraft/${match[1]}/0`)??watercraft.canvas(`watercraft/${match[1]}/0`) : null; });
const provider = new HybridProvider(approved, new HybridProvider(watercraft, new HybridProvider(npc, new HybridProvider(kairo, new HybridProvider(atlas, new ProceduralProvider())))));
setNpcFrameSource((id) => provider.canvas(id)); // NPC v8(2026-09-18): 초상(`npcPortrait`)이 씬과 같은 v8 프레임을 읽는다
const missing = ProceduralProvider.missingDrawers();
if (missing.length > 0) console.error('매니페스트에 그리는 함수가 없는 id:', missing);

applyUiScale(); window.addEventListener('resize', () => applyUiScale()); // P57-g: 태블릿·데스크톱에서 DOM UI 를 키운다
const hud = new Hud(document.body);
hud.debug.hidden = !DEBUG;
const bubbles = new Bubbles(document.body);

let lastStats: SceneStats | null = null;
/** 프레임 시간 표본 (하네스가 p95 를 잰다) */
const frameMs: number[] = [];
const scene = new WaterparkScene({
  ...(imagegenGround ? { imagegenGround } : {}),
  onCourseHandleMove: (k, i, j) => courseDock.onHandleMove(k, i, j),
  onCourseDockPick: (k) => courseDock.onDockPick(k),
  provider,
  compactArrival: () => game.arrivalRevision >= 3,
  ...(compactBoundary ? { compactBoundary } : {}),
  watercraft,
  approved,
  staticDepth,
  rideScene: () => game.rideScene(),
  rideTime: () => (game.day * TICKS_PER_DAY + game.tick) * TICK_MS / 1000,
  landscape,
  grid: game.grid,
  camera,
  rank: () => game.rank,
  // 새 판은 물려받은 풀을 비춘다 (G25) · 저장본은 토지 가운데
  startTile: (() => { if (PREVIEW && params.get('view') === 'water') return { i: game.gate.i + 3, j: 26, bottomInsetCss: 100 }; if (!saved || arrivalAdopted) { const gt = game.gate; return game.arrivalRevision ? { i: gt.i + 1, j: gt.j + (game.arrivalRevision >= 3 ? 8 : 5), bottomInsetCss: 100 } : { i: gt.i + 4, j: gt.j + 12, bottomInsetCss: 100 }; } /* P43 정문·실내동·산책로 → 2026-09-11 기본 S=2(원작 줌)라 화면이 절반: 출입동 남쪽 광장 + 선착장 + 킷 빠지 수역이 한 화면에 (실측 (−2,+9) 는 복도 안만 보였다) */ const l = game.land; return { i: l.i0 + Math.floor(l.w / 2), j: l.j0 + Math.floor(l.h / 2), bottomInsetCss: 84 }; })(),
  onFrame: (s) => {
    lastStats = s;
    if (DEBUG) {
      hud.setDebug(
        `FPS ${s.fps} · S${s.scale} · scroll ${s.scrollX},${s.scrollY} · obj ${s.sprites} · 손님 ${game.guests.count} · v2` +
          (s.violations.length ? ` · ⚠ ${s.violations.join(' / ')}` : ''),
      );
    }
  },
  onTapTile: (i, j) => { if (!EDITOR) onTapTile(i, j); },
  // 조준 배치(K47-③): 배치 중 지도를 팬하면 화면 중앙 칸이 고스트 자리다 — 탭은 호환(그 칸으로 옮길 뿐)
  onAimCenter: (i, j) => { if (place.isActive) aimPlaceAt(i, j); },
});
const phaser = bootPhaser(parent, scene);
sfx.unlockOnGesture();

// ── 화면 동기화 ────────────────────────────────────────────────────
const poolTilesFlat = (): number[] => game.pools.all.flatMap((p) => p.tiles);

/** P50-b2 — 꺼진 기구·등급 폰툰 색·이음쇠. 링 칸 = 수역 타일에 4이웃으로 닿은 데크 */
const syncRigLook = (): void => {
  const dim = new Set<number>();
  for (const f of game.facilities.all) { const d = game.facilities.defOf(f); if (d.class === 'rig' && d.onRing !== true && !game.rigState.lit.has(f.uid)) dim.add(f.uid); }
  const ring = new Map<number, number>();
  const w = game.grid.w;
  for (const p of game.pools.all) {
    const grade = game.ppajiGradeOf(p.id);
    for (const k of p.tiles) { const i = k % w, j = Math.floor(k / w); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (game.grid.inside(i + a, j + b) && game.grid.at(i + a, j + b) === FLOOR.deck) { const kk = (j + b) * w + i + a; ring.set(kk, Math.max(ring.get(kk) ?? 0, grade)); } }
  }
  scene.setRigLook(dim, ring, game.rigLinkEdges());
};
const syncPoolLook = (): void => {
  const m = new Map<number, { tiles: readonly number[]; temp: number }>(); // P60-a: 색·향 삭제 — 수온만 씬으로
  for (const p of game.pools.all) {
    const st = game.poolState(p.id);
    if (st) m.set(p.id, { tiles: p.tiles, temp: st.temp });
  }
  scene.setPoolLook(m);
  scene.setIndoorPoolTiles(game.pools.all.filter((p) => game.poolIndoor(p.id)).flatMap((p) => p.tiles));
  scene.setFoodCourtTiles(game.foodcourts.tileKeys(game.grid.w)); // P58-a
};

const syncWorldToScene = (): void => {
  // Warm installed courses before guests begin boarding. Unbuilt craft stay unloaded.
  for (const course of game.courses.all) watercraft.ensure(course.equipId);
  if (game.courses.all.length) watercraft.ensure('tow_work');
  scene.setCourses(game.courses.all);
  scene.setSeason(game.clock.season);
  sfx.setSeason(game.clock.season);
  scene.setPoolTiles(poolTilesFlat());
  scene.setGuests(game.guests.all);
  scene.setStaff(game.staff.all);
  scene.setBusRoad(game.gate, game.land);
  scene.setBus(game.busState);
  scene.setFacilities(game.facilities.all, (f) => game.facilities.defOf(f));
  syncPoolLook();
  syncRigLook(); // P50-b2
  for (let j = 0; j < game.grid.h; j++) for (let i = 0; i < game.grid.w; i++) scene.refreshTile(i, j);
  scene.drawWalls();
  scene.drawDoors(); // P39
  scene.drawCoping();
  scene.drawBorder(game.land, game.gate);
  scene.drawFence(game.land, game.gate); // P40 D50 울타리
};

/** 목표 3슬롯 (G23, PSS 리서치) — A 지금 할 일 · B 다음 랭크 조건 · C 가장 가까운 인증. 6초마다 돌아간다 */
let goalSlot = 0;
let pinnedGoal: number | null = null;
setInterval(() => { goalSlot = (goalSlot + 1) % 3; refreshHud(); }, 6000);
const goalLine = (): string => {
  const a = game.pools.all.length === 0 ? '수역에서 강에 부표를 쳐 보자! 손님이 찾아온다' : game.facilities.all.length === 0 ? '건설에서 화장실·평상 연립을 놓아 보자' : game.rigGoalHint() ?? null; // P50-b2 목표 A 폴백 ①②(sim 이 낸다) · P60-d 폴백 ① 문구(사다리 옆)는 game.ts 가 정본
  const wishes = [...game.sns.activeWishes()].sort((x, y) => x.friend.windowUntilDay - y.friend.windowUntilDay);
  const wish = wishes[0];
  // R3 (G48): 창이 2일 남은 소원은 진행률과 함께 먼저 — 근접 실패가 보인다
  const left = wish ? wish.friend.windowUntilDay - game.day : 99;
  const wishText = wish ? (left <= 2 ? `${game.sns.friendDef(wish.friend.id)?.name ?? ''}의 소원 ${left}일 남음 · 진행 ${Math.round(game.evaluateCondition(wish.wish.condition).progress * 100)}%` : `${game.sns.friendDef(wish.friend.id)?.name ?? ''}의 소원: ${wish.wish.line}`) : null;
  const A = a ?? (wishText ?? `인기 ${game.parkPopularity()} · 오늘 방문 ${game.guests.enteredToday}명`);
  const { next, verdicts } = game.rankProgress();
  const miss = verdicts.find((v) => !v.met);
  const B = next && miss ? `다음 랭크 ${next.name}: ${miss.label} (${miss.actual}/${miss.need})` : A;
  const certs = [...game.certs.defs.values()].map((d) => ({ d, ex: game.expectedCert(d.id) })).filter((x) => x.ex && !(game.certs.state.passed[x.d.id] ?? 0)).sort((x, y) => (y.ex?.base ?? 0) - (x.ex?.base ?? 0));
  const c0 = certs[0];
  const C = c0 && c0.ex ? `인증 ${c0.d.name}: 예상 ${c0.ex.base}/30 (합격선 ${c0.d.pass})` : B;
  return [a ?? A, B, C][pinnedGoal ?? goalSlot] ?? A; // P50-b2 슬롯 구조 — A 폴백이 켜져도 B·C 가 회전에서 안 사라진다 · `pinGoal` 은 하네스 세터
};

const refreshHud = (): void => {
  const c = game.clock;
  hud.setTime({ year: c.year, season: c.season, weather: game.weather, seasonName: c.seasonName, weatherName: WEATHER_KO[game.weather], tempC: game.outdoorTemp(), daypart: c.isEvening ? '저녁' : c.daypart /* P18: 저녁 알약은 두 글자 — 「주말·저녁」도 393px 헤더에서 시계를 잘랐다 (재플레이 실측 「PM 06」) */, clock: c.clock });
  scene.setWeather(game.weather === 'rain' ? 'rain' : game.weather === 'snow' ? 'snow' : null);
  hud.setMoney(game.money);
  hud.setPopularity(game.parkPopularity(), game.rank);
  if (newsQueue.length && performance.now() >= newsUntil) { hud.setTicker(`소식 · ${newsQueue.shift() ?? ''}`); newsUntil = performance.now() + 5000; }
  else if (performance.now() >= newsUntil) hud.setTicker(goalLine());
  hud.setInfoBadge(game.inbox.unread + snsWin.unopenedForTest());
  // R5 (G50): B 랭크 · C 인증 진행바 — 「하나 끝나면 다른 하나가 80%」가 화면에서 성립
  { const { next, verdicts } = game.rankProgress(); if (next && verdicts.length) { const pct = verdicts.reduce((a, v) => a + Math.min(1, v.progress), 0) / verdicts.length; hud.setGoal('rank', { label: `랭크 ${next.name}`, pct }); } else hud.setGoal('rank', null); }
  { const cands = [...game.certs.defs.values()].map((d) => ({ d, ex: game.expectedCert(d.id) })).filter((x) => x.ex && !(game.certs.state.passed[x.d.id] ?? 0)).sort((x, y) => (y.ex?.base ?? 0) - (x.ex?.base ?? 0)); const c0 = cands[0]; if (c0 && c0.ex) hud.setGoal('cert', { label: `심사 ${c0.d.name}`, pct: c0.ex.base / 30 }); else hud.setGoal('cert', null); }
  hud.setBadge('market', game.shopNewCount(shopSeenDay()));
  { const f = game.guests.all.find((g) => g.friendId); hud.setVisitor(f ? { name: f.name, palette: f.palette } : null); }
  scene.setHour(c.hour, c.minute);
  scene.setIllumination(c.hour >= EVENING_HOUR || (c.season === 3 && c.hour >= 17)); // P18 조명은 시계와 같이 — rAF 연출 루프(seasonalFx)만 믿으면 하네스·정지 화면에서 안 켜진다
  hud.setBadge('sns', game.sns.unseenPosts); // 원작: SNS 배지 = 안 본 새 글 수 (G33)
  hud.setBadge('build', Math.max(0, game.unlocked.facilities.size - seenFacilityCount())); // 원작: 새 시설이 열리면 건설 칸에 NEW (G47)
  hud.setEventTag(game.eventTag());
  hud.setLocked('course', game.facilities.all.some((f) => COURSE_DOCK_IDS.has(f.defId)) ? null : '선착장');
};

// ── 창 · 독 ────────────────────────────────────────────────────────
const dock = new PoolEditDock(document.body, () => game, {
  showSelection: (tiles, mode) => scene.setSelection(tiles, mode === 'fill'),
  toast: (text, ok) => {
    hud.showToast(text);
    sfx.play(ok ? 'coin' : 'error');
  },
  onApplied: () => {
    consumeFx();
    syncWorldToScene();
    refreshHud();
    persist();
  },
});
/** 대사 Strip (G16) — 시나리오 비트가 `strip` 사건으로 오면 여기로. `?tut=0` 은 하네스가 끈다 (인트로만 안 띄운다) */
const tutorial = new DialogueStrip(document.body);
const speak = (speakerId: string, lines: readonly string[]): void => {
  const c = STORY_CHARACTERS.get(speakerId);
  tutorial.enqueue({ speakerId, name: c?.name ?? '', palette: c?.palette ?? 5, hair: c?.hair ?? 2, lines });
};
const NO_TUT = params.get('tut') === '0';
/** 건설 NEW 배지 — 마지막으로 건설 창을 열었을 때의 해금 수 (표현 상태라 localStorage) */
const seenFacilityCount = (): number => { try { const v = localStorage.getItem('pj.seenFac'); if (v === null) { localStorage.setItem('pj.seenFac', String(game.unlocked.facilities.size)); return game.unlocked.facilities.size; } return Number(v); } catch { return 0; } }; // H-6: 새 판의 시작 해금 45 는 「새 것」이 아니다 — 처음 잰 값을 본 것으로 친다
const shopSeenDay = (): number => { try { return Number(localStorage.getItem('pj.shopSeen') ?? '-1'); } catch { return -1; } };
const markShopSeen = (): void => { try { localStorage.setItem('pj.shopSeen', String(game.shop.state.restockDay)); } catch { /* 저장 불가 */ } };
const markFacilitiesSeen = (): void => { try { localStorage.setItem('pj.seenFac', String(game.unlocked.facilities.size)); } catch { /* 저장 불가 */ } };
// G46: 하네스는 `confirm=0` 으로 대화상자를 자동 승인 · 축하 팝업은 `celebrate=1` 로 강제(기본: 하네스(tut=0)에선 토스트)
setAutoConfirm(params.get('confirm') === '0');
const CELEBRATE_ON = params.get('celebrate') === '1' || !NO_TUT;
/** SNS 타임라인 썸네일 (G23) — 사진이 찍힌 순간 화면을 잘라 둔다. 세션 전용(저장 안 함) */
const thumbs = new Map<number, HTMLCanvasElement>();
/** 썸네일 — 사진 순간 화면을 찍은 것이 있으면 그것, 없으면 피사체 스프라이트 + 손님으로 합성 (PSS 는 언제나 사진이 있다) */
const thumbFor = (post: { id: number; subject: { kind: 'pool' | 'facility'; ref: number }; palette?: number }): HTMLCanvasElement => {
  const hit = thumbs.get(post.id);
  if (hit) return hit;
  const out = document.createElement('canvas'); out.width = 48; out.height = 32;
  const g2 = out.getContext('2d');
  if (g2) {
    g2.fillStyle = cssVar(post.subject.kind === 'pool' ? '--tile-pool' : '--tile-grass'); g2.fillRect(0, 0, 48, 32);
    const sprite = post.subject.kind === 'pool' ? provider.canvas('tile/pool') : (() => { const f = game.facilities.byUid(post.subject.ref); return f ? provider.canvas(`fac/${f.defId}/0`) : null; })();
    g2.imageSmoothingEnabled = false;
    if (sprite) { const sc = Math.min(1, 44 / sprite.width, 30 / sprite.height); const w = Math.round(sprite.width * sc); const h = Math.round(sprite.height * sc); g2.drawImage(sprite, Math.round(24 - w / 2), Math.round(31 - h), w, h); }
    const face = npcPortrait(post.palette ?? 0, 'happy'); // NPC v8(2026-09-18): v8 머리 초상 (32×32 → 24×24)
    g2.drawImage(face, 2, 6, 24, 24);
  }
  thumbs.set(post.id, out);
  return out;
};
const poolInfo = new PoolInfoWindow(document.body, () => game, {
  thumb: (p, cb) => { const k = p.tiles[Math.floor(p.tiles.length / 2)] ?? p.tiles[0] ?? 0; scene.snapshotAt(k % game.grid.w, Math.floor(k / game.grid.w), cb); }, onEdit: (id) => dock.enter('deck', id), toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
const guestInfo = new GuestInfoWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
/** 결산 카드 (G19) — 하루·시즌·연말. 하네스(`tut=0`)에서는 `results.enabled` 를 켜기 전엔 인박스로만 */
const results = new ResultsWindow(document.body, () => { consumeFx(); refreshHud(); pumpModals(); });
const resultsCtl = { enabled: !NO_TUT };
const rankingsWin = new RankingsWindow(document.body, () => game);
const staffWin = new StaffWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); } });
/** 확정 바(#dock-place)가 가린 아래 높이 — 조준 중앙은 그 위 영역의 가운데다 (K47-③) */
const PLACE_DOCK_INSET_CSS = 84;
/** P60-d — 수역 링의 입수구 칸 (i, j) 목록. `rigState.entryTiles` 는 k = j*w+i 키 */
const entryTilesOf = (pid: number): { i: number; j: number }[] => { const w = game.grid.w; return (game.rigState.entryTiles.get(pid) ?? []).map((k) => ({ i: k % w, j: Math.floor(k / w) })); };
const place = new PlaceDock(document.body, () => game, {
  showGhost: (def, i, j, facing, ok, label) => { if (def === null) scene.setAimCenter(false, 0); /* exit() 만 null 을 보낸다 — 취소·확정·붓 교체 전부 여기를 지난다 */ scene.setGhost(def, i, j, facing, ok, label); },
  showRing: (tiles) => scene.setSelection(tiles, false), // P24 조준 반경 — 수역 독의 선택 표시를 재사용
  pricePop: (i, j, text) => { if (text === null) return; const c = tileCenter(i, j); scene.fx('price-pop', { x: c.x, y: c.y - 26, text, key: 'aim' }); }, // P56-a D7
  setStar: (hit) => scene.showSetStar(hit ? game.setMemberTiles(hit.poolId, hit.setId) : []), // P60-c D72 B: 놓으면 세트가 성립하는 자리 — 그 세트의 켜진 멤버 위에 별. exit·거절·붓 교체는 place.ts 가 null 을 보낸다
  // P60-d D72 A: 입수구 칸(`rigState.entryTiles`, 키 k = j*w+i) 과 경로 기구 칸(`pathOf` 의 uid 순)은 sim 파생값 — 저장 0. exit·refresh 첫머리에서 place.ts 가 null 을 보낸다
  entryMarks: (pid) => scene.showEntryMarks(pid === null ? [] : entryTilesOf(pid)),
  pathWalk: (hit) => {
    if (hit === null) { scene.showPathWalk([]); return; }
    const entries = entryTilesOf(hit.poolId);
    const rigs = game.pathOf(hit.poolId).map((uid) => game.facilities.byUid(uid)).filter((f): f is NonNullable<typeof f> => f !== undefined).map((f) => ({ i: f.i, j: f.j }));
    const head = rigs[0] ?? hit.at; // 출발 입수구 = 첫 경로 기구(없으면 고스트)에 가장 가까운 구간 칸
    const start = entries.length === 0 ? null : entries.reduce((a, b) => (Math.abs(b.i - head.i) + Math.abs(b.j - head.j) < Math.abs(a.i - head.i) + Math.abs(a.j - head.j) ? b : a));
    scene.showPathWalk([...(start ? [start] : []), ...rigs, hit.at]);
  },
  toast: (text, ok) => { hud.showToast(text); sfx.play(ok ? 'coin' : 'error'); },
  onPlaced: (uid) => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); const f = game.facilities.byUid(uid); if (f) { const c = tileCenter(f.i, f.j); scene.fx('money-pop', { x: c.x, y: c.y - 20, text: '설치 완료!', key: `placed:${uid}` }); } },
});
const courseDock = new CourseDock(document.body, () => game, {
  scene,
  toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); },
  onChanged: () => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); },
});
const buildWin = new BuildWindow(
  document.body,
  () => game,
  [...FACILITY_DEFS.values()],
  (def) => provider.canvas(`fac/${def.id}/0`),
  (def) => { place.enter(def); scene.setAimCenter(true, PLACE_DOCK_INSET_CSS); }, // K47-③ 조준: 고스트는 화면 중앙 칸에 붙고 팬을 따라간다
);
const snsWin = new SnsWindow(document.body, () => game, {
  thumb: (post) => thumbFor(post),
  sprite: (id) => provider.canvas(`fac/${id}/0`), // P56-a2 D8: 소원 보상 그림
  toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); },
  celebrate: (text) => { sfx.play('wish'); scene.fx('confetti', { x: window.innerWidth / 2, y: 120 }); hud.showBanner(`받았다! ${text}`); },
  onChanged: () => { consumeFx(); refreshHud(); persist(); },
});
const certWin = new CertWindow(document.body, () => game, { sprite: (id) => provider.canvas(`fac/${id}/0`), toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
const rankWin = new RankWindow(document.body, () => game, () => certWin.show());
const shopWin = new ShopWindow(document.body, () => game, {
  sprite: (id) => provider.canvas(`fac/${id}/0`), // P56-a: 진열 카드의 시설 그림
  toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); },
  onChanged: () => { consumeFx(); refreshHud(); persist(); },
  name: (kind, ref) => kind === 'facility' ? (FACILITY_DEFS.get(ref)?.name ?? ref) : kind === 'ingredient' ? (INGREDIENTS_BY_ID.get(ref)?.name ?? ref) : (GIFTS_BY_ID.get(ref)?.name ?? ref),
});
const menuWin = new MenuEditWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { refreshHud(); persist(); } });
const cookWin = new CookWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
// P7 — 기구 공방: 요리 창과 같은 창, 다른 낱말·저장소
const WORKSHOP_SPEC: DiscoverySpec = {
  winId: 'win-workshop', title: '기구 공방', codexLabel: '기구 도감', shopLabel: '부품 사기',
  catKo: { tube: '튜브', board: '보드', ski: '스키', special: '특수' },
  icon: { engine: 'attraction', tube: 'pool', rope: 'build', handle: 'build', seat: 'lounge', safety: 'check', board: 'slide', fun: 'star' },
  fallbackIcon: 'build',
  store: (g) => g.workshop as unknown as CookingStore<RecipeLike, IngredientLike>,
  open: () => true,
  can: (g, ids) => g.canCraft(ids),
  run: (g, ids) => g.craft(ids) as CookResultOf<RecipeLike>,
  buy: (g, id) => g.buyPart(id),
  stats: (r) => { const x = r as unknown as { taste: number; look: number; pop: number }; return `스릴 ${x.taste} 외관 ${x.look} 인기 ${x.pop}`; },
  picKind: 'part', resultPicKind: 'gear', axisLabels: ['스릴', '외관', '인기'], verb: '조합', sceneBg: 'convert', // P56-a: 부품·기구 그림(등록부, 없으면 계열 아이콘) · P56-b2 장면 배경(정비 잔교)
};
const workshopWin = new CookWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); } }, WORKSHOP_SPEC);
// P51 — 기구 개조: 요리·공방과 같은 창, 셋째 낱말·저장소(실패작 없음 · 결과는 놓인 기구의 개조판 — 적용은 시설 창 「개조」)
const RIG_SPEC: DiscoverySpec = {
  winId: 'win-rig', title: '기구 개조', codexLabel: '개조 도감', shopLabel: '부품 사기',
  catKo: { slide: '슬라이드', obstacle: '장애물', rest: '휴식', jump: '점프', ring: '링 위' },
  icon: { motor: 'attraction', fabric: 'decor', anchor: 'build', net: 'check', seat: 'lounge', wax: 'slide', light: 'star', float: 'pool', nozzle: 'pool', audio: 'sns', rope: 'build', deck: 'build', bearing: 'attraction' },
  fallbackIcon: 'build',
  store: (g) => g.rigs as unknown as CookingStore<RecipeLike, IngredientLike>,
  open: () => true,
  can: (g, ids) => g.canCraftRig(ids),
  run: (g, ids) => g.craftRig(ids) as CookResultOf<RecipeLike>,
  buy: (g, id) => g.buyRigPart(id),
  stats: (r) => { const x = r as unknown as { from: string; to: string }; const to = FACILITY_DEFS.get(x.to); const from = FACILITY_DEFS.get(x.from); return to && from ? `${from.name} → 스릴 ${to.thrill ?? 0} 정원 ${to.capacity} 안전 ${to.safe ?? 0}` : ''; },
  picKind: 'part', verb: '개조 발견', sceneBg: 'convert',
  // P56-a D4: 개조판은 시설 스프라이트가 이미 있다 — 결과 장면 카드에 「전 → 후」 없이 후 그림, 축은 스릴·정원·안전
  resultArt: (_g, r) => { const x = r as unknown as { to: string }; return canvasPictureEl(provider.canvas(`fac/${x.to}/0`), 'build'); },
  setCodex: (id) => canvasPictureEl(provider.canvas(`fac/${id}/0`), 'build'), // P60-c: 개조 도감 아래 「세트 n/8」 격자 — 카드 그림은 첫 멤버 시설 스프라이트
  axes: (_g, r) => { const x = r as unknown as { from: string; to: string }; const to = FACILITY_DEFS.get(x.to); const from = FACILITY_DEFS.get(x.from); if (!to) return []; const d = (a: number, b: number): string => a === b ? '' : `${b - a > 0 ? '+' : ''}${b - a} UP`; return [
    { label: '스릴', icon: 'attraction', value: String(to.thrill ?? 0), gauge: Math.min(5, to.thrill ?? 0), note: from ? d(from.thrill ?? 0, to.thrill ?? 0) : '' },
    { label: '정원', icon: 'friends', value: `${to.capacity}인`, gauge: Math.min(5, Math.ceil(to.capacity / 2)), note: from ? d(from.capacity, to.capacity) : '' },
    { label: '안전', icon: 'check', value: String(to.safe ?? 0), gauge: Math.min(5, to.safe ?? 0), note: from ? d(from.safe ?? 0, to.safe ?? 0) : '' },
  ]; },
};
const rigWin = new CookWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); } }, RIG_SPEC);
const investWin = new InvestWindow(document.body, () => game, { sprite: (id) => provider.canvas(`fac/${id}/0`), toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
const campaignWin = new CampaignWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); } });
const inboxWin = new InboxWindow(document.body, () => game, () => refreshHud());
const celebrate = new CelebrateWindow(document.body, () => { consumeFx(); refreshHud(); pumpModals(); }, (id) => provider.canvas(`fac/${id}/0`)); // P56-a2 D8: 편지 위 물건 그림
const certResultWin = new CertResultWindow(document.body, () => game, () => pumpModals());
const choiceWin = new ChoiceWindow(document.body, () => game, { toast: (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, onChanged: () => { consumeFx(); refreshHud(); persist(); }, onClosed: () => pumpModals() });
const mainMenu = new MenuWindow(document.body, () => [
  { id: 'build', label: '건설', icon: 'build', group: '운영', desc: '시설을 짓는다 · 8분류', run: () => buildWin.show() },
  { id: 'pool', label: '수역 편집', icon: 'pool', desc: '부표를 치고 데크를 깔고 소품을 넣는다', run: () => dock.enter('dig') },
  { id: 'sns', label: 'SNS', icon: 'sns', desc: `타임라인 · 소원 · 친구${game.sns.unseenPosts ? ` · 새 글 ${game.sns.unseenPosts}` : ''}`, run: () => snsWin.show() },
  { id: 'cook', label: '요리 개발', icon: 'cook', desc: '재료를 섞어 새 메뉴', locked: game.cookingOpen ? null : '★2', run: () => cookWin.show() },
  { id: 'workshop', label: '기구 공방', icon: 'attraction', desc: '부품을 섞어 새 견인 기구', locked: null, run: () => workshopWin.show() },
  { id: 'rig', label: '기구 개조', icon: 'slide', desc: '부품을 섞어 개조 레시피 · 시설 창 「개조」로 같은 자리에서 바꾼다', locked: null, run: () => rigWin.show() }, // P51
  { id: 'shop', label: '장날', icon: 'shop', desc: '17시에 새 물건이 선다', run: () => shopWin.show() },
  { id: 'invest', label: '투자', icon: 'coin', group: '경제 활동', desc: '물놀이 기구 · 평상·방갈로 다음 단계를 연다', run: () => investWin.show() },
  { id: 'campaign', label: '캠페인', icon: 'heart', desc: '읍내 현수막 · 전세버스 · 유튜브 광고', run: () => campaignWin.show() },
  { id: 'cert', label: '빠지 심사', icon: 'check', desc: '봄·가을 신청 · 부표와 튜브 보상', run: () => certWin.show() },
  ...(FEATURES.staff ? [{ id: 'staff', label: '직원', icon: 'heart' as const, run: () => staffWin.show() }] : []),
  { id: 'rankings', label: '랭킹', icon: 'star', group: '정보', desc: '전국 빠지 순위', run: () => rankingsWin.show() },
  { id: 'rank', label: '정보 · 랭크', icon: 'check', desc: `★${game.rank} · 다음 랭크 조건`, run: () => rankWin.show() },
  { id: 'inbox', label: game.inbox.unread > 0 ? `알림함 (${game.inbox.unread})` : '알림함', icon: 'inbox', desc: '지난 소식 50건', run: () => inboxWin.show() },
  { id: 'settings', label: '설정', icon: 'star', group: '시스템', desc: '소리 · BGM · 볼륨 · 배속 · 새 게임', run: () => settingsMenu.show() }, // W-14: 설정은 운영 리스트 밖
]);
const settingsMenu = new MenuWindow(document.body, () => [
  { id: 'sound', label: sfx.muted ? '소리 켜기' : '소리 끄기', icon: 'star' as const, stay: true, run: () => { sfx.setMuted(!sfx.muted); hud.showToast(sfx.muted ? '소리 끔' : '소리 켬'); } },
  { id: 'bgm', label: sfx.bgmOn ? `BGM 끄기 (${sfx.trackName})` : 'BGM 켜기', icon: 'star' as const, stay: true, run: () => { sfx.setBgm(!sfx.bgmOn); hud.showToast(sfx.bgmOn ? `BGM 켬 — ${sfx.trackName}` : 'BGM 끔'); } },
  { id: 'volume', label: `볼륨 ${Math.round(sfx.volume * 100)}%`, icon: 'star' as const, stay: true, run: () => { const next = sfx.volume <= 0.25 ? 1 : Math.round((sfx.volume - 0.25) * 100) / 100; sfx.setVolume(next); sfx.play('coin'); hud.showToast(`볼륨 ${Math.round(sfx.volume * 100)}%`); } },
  { id: 'speed', label: flow.speed === 2 ? '배속 ×2 끄기' : '배속 ×2', icon: 'star', locked: game.endingSeen || (loadProfile()?.runs ?? 0) > 0 ? null : '엔딩 뒤', run: () => { flow.speed = flow.speed === 2 ? 1 : 2; hud.showToast(`배속 ×${flow.speed}`); } },
  { id: 'newgame', label: '새 게임 (저장 삭제)', icon: 'close', run: () => { clearSave(); location.href = `${location.pathname}?fresh=1`; } },
], { id: 'win-settings', title: '설정' });
const endingWin = new EndingWindow(document.body, () => game, {
  profile: () => loadProfile(),
  continueGame: () => { game.endingSeen = true; persist(); hud.showToast('이어하기 — 배속 ×2 가 메뉴에 열렸다'); },
  newGamePlus: (c) => {
    saveProfile(c);
    game = createGame(SEED + c.runs, true);
    applyCarryover(game, c);
    resetSessionForNewGame();
    syncWorldToScene();
    refreshHud();
    persist();
    hud.showToast(`뉴게임+ ${c.runs + 1}회차 — 이월 적용`);
  },
});
const facilityInfo = new FacilityInfoWindow(document.body, () => game, () => { consumeFx(); syncWorldToScene(); refreshHud(); persist(); }, (t, ok) => { hud.showToast(t); sfx.play(ok ? 'coin' : 'error'); }, (uid) => menuWin.show(uid), (defId) => provider.canvas(`fac/${defId}/0`), (uid) => { const f = game.facilities.byUid(uid); if (f) { place.enterMove(f); scene.focusTile(f.i, f.j, PLACE_DOCK_INSET_CSS); scene.setAimCenter(true, PLACE_DOCK_INSET_CSS); /* K47-③ 조준: 카메라를 그 시설에 맞춰 중앙 칸 = 지금 자리에서 시작 */ sfx.play('open'); } }, (tiles) => scene.setSelection(tiles, false)); // P30 D38 탭 오버레이
facilityInfo.sprite = (id) => provider.canvas(`fac/${id}/0`); // P56-a 개조 전→후 그림

// P50-b2 계약: `place.aimAt` 호출부는 main.ts 에 하나 — 탭(호환)과 조준 중앙(K47-③) 둘 다 이 문을 지난다
function aimPlaceAt(i: number, j: number): void {
  place.aimAt(i, j);
}

function onTapTile(i: number, j: number): void {
  if (courseDock.isActive) return;
  if (dock.isActive) {
    dock.toggleTile(i, j);
    return;
  }
  if (place.isActive) {
    aimPlaceAt(i, j);
    return;
  }
  if (uiSurface() !== 'home') return;
  const f = scene.facilityAt(i, j);
  if (f) {
    facilityInfo.show(f.uid);
    sfx.play('open');
    return;
  }
  const g = scene.guestAt(i, j);
  if (g) {
    guestInfo.show(g);
    sfx.play('open');
    return;
  }
  if (game.grid.at(i, j) === FLOOR.pool) {
    const p = game.pools.at(i, j);
    if (p) {
      poolInfo.show(p.id);
      sfx.play('open');
    }
  }
}

hud.on('zone', () => { sfx.play('tap'); dock.enter('dig'); });
hud.setLocked('course', game.facilities.all.some((f) => COURSE_DOCK_IDS.has(f.defId)) ? null : '선착장');
hud.on('build', () => { sfx.play('open'); buildWin.show(); markFacilitiesSeen(); refreshHud(); });
hud.on('sns', () => { sfx.play('open'); snsWin.show(); });
hud.on('course', () => { dock.exit(); place.exit(); if (courseDock.enter()) sfx.play('open'); else sfx.play('error'); });
hud.on('market', () => { sfx.play('open'); shopWin.show(); markShopSeen(); refreshHud(); });
hud.on('menu', () => { sfx.play('open'); mainMenu.show(); });
hud.on('info', () => { sfx.play('open'); rankWin.show(); });
hud.on('ticker', () => { if (game.pools.all.length === 0) { dock.enter('dig'); return; } if (game.sns.activeWishes().length) { sfx.play('open'); snsWin.show('messages'); return; } sfx.play('open'); rankWin.show(); });
hud.on('goal:rank', () => { sfx.play('open'); rankWin.show(); });
hud.on('goal:cert', () => { sfx.play('open'); certWin.show(); });
hud.on('save', () => { if(PREVIEW) { hud.showToast('배치 미리보기는 기존 공원에 저장되지 않습니다'); return; } persist(); hud.showToast('저장했다'); sfx.play('coin'); });

// ── 저장 ──────────────────────────────────────────────────────────
function persist(): void {
  if (PREVIEW) return;
  try {
    save(game.toSnapshot());
  } catch (e) {
    console.error('저장 실패', e);
  }
}

// ── 흐름 ──────────────────────────────────────────────────────────
// `?freeze=1` — 하네스가 세이브 대조처럼 시간이 멈춘 상태로 부팅할 때
const flow = { acc: 0, speed: 1, frozen: EDITOR || params.get('freeze') === '1' };
// Preserve simulation state while the browser restores its drawing context.
let beforeRenderLoss: boolean | null = null;
document.addEventListener('webglcontextlost', (event) => {
  if (event.target !== phaser.canvas || beforeRenderLoss !== null) return;
  beforeRenderLoss = flow.frozen; flow.frozen = true; flow.acc = 0;
  hud.showToast('화면 복구 중 · 게임은 잠시 멈춥니다');
}, true);
document.addEventListener('webglcontextrestored', (event) => {
  if (event.target !== phaser.canvas || beforeRenderLoss === null) return;
  flow.frozen = beforeRenderLoss; beforeRenderLoss = null; flow.acc = 0;
  hud.showToast('화면이 복구되었습니다');
}, true);

let lastDay = game.day;

/** R1 (G48): 예산을 넘긴 모달은 버리지 않고 **대기열**에 — 앞 창이 닫히면 다음 창. 예산 시계는 보여 줄 때만 찍는다 */
const modalQueue: GameEvent[] = [];
/** R6 (G48): inbox 사건은 티커에 한 번 흘린다 (모달 아님) */
const newsQueue: string[] = [];
let newsUntil = 0;
/** G57: 새 판(뉴게임+·newGame) — 씬 격자·세션 큐·썸네일·「본 것」 기억을 옛 판 것에서 비운다 */
const resetSessionForNewGame = (): void => {
  game.setRideSeatSpecs(rideSeatSpecs);
  lastDay = 0;
  scene.setGrid(game.grid);
  modalQueue.length = 0;
  newsQueue.length = 0;
  summaryQueue.length = 0;
  thumbs.clear();
  try { localStorage.removeItem('pj.shopSeen'); localStorage.removeItem('pj.seenFac'); } catch { /* 저장소 없음 */ }
};
/** G57: 결산 카드가 삼킨 사건 선택 창을 다시 연다 — 답을 받아야 사건 축이 계속 돈다 */
const pumpChoice = (): boolean => {
  if (!game.events.pending || choiceWin.visible) return false;
  if (celebrate.visible || results.visible || certResultWin.visible) return false;
  if (!interruptBudget.request()) return false; // P11: 사건도 분당 1 안에서만 끼어든다
  if (choiceWin.show()) { sfx.play('open'); return true; }
  return false;
};
/** G57: 같은 폐장에 하루·시즌 카드가 겹치면 뒤 카드를 줄 세운다 (같은 창이라 덮어쓰기였다) */
const summaryQueue: { kind: 'day' | 'period'; title: string; data: DayCard | PeriodReport }[] = [];
const anyModalUp = (): boolean => results.visible || choiceWin.visible || celebrate.visible || certResultWin.visible;
const pumpSummaries = (): boolean => {
  if (anyModalUp() || summaryQueue.length === 0) return false;
  const n = summaryQueue.shift();
  if (!n) return false;
  if (n.kind === 'day') results.showDay(n.title, n.data as DayCard); else results.showPeriod(n.title, n.data as PeriodReport);
  return true;
};
const pumpModals = (): void => {
  if (pumpSummaries() || pumpChoice()) return;
  if (!CELEBRATE_ON || modalQueue.length === 0) return;
  if (celebrate.visible || results.visible || choiceWin.visible || certResultWin.visible) return;
  if (!interruptBudget.request()) return;
  const ev = modalQueue.shift();
  if (!ev) return;
  const cv = clockView(game.day, game.tick); if (!celebrate.show({ title: ev.title, body: ev.body, ...(ev.pic ? { pic: ev.pic } : {}) }, `${cv.year}년차 ${cv.seasonName} · ${cv.isWeekend ? '주말' : '평일'}`)) { modalQueue.unshift(ev); return; }
  sfx.play(ev.title.includes('불합격') ? 'error' : 'rankup');
};
const consumeFx = (): void => {
  for (const fx of game.drainFx()) applyFx(fx);
  for (const ev of game.drainEvents()) {
    if (ev.kind === 'choice') { ev.read = true; pumpChoice(); continue; } // 사건 선택 (G39 → P11): 답은 받되 끼어들기 예산 안 — 막히면 pending 으로 남아 다음 틈에 뜬다
    const isSummary = ev.kind === 'day-summary' || ev.kind === 'season-summary' || ev.kind === 'year-summary';
    if (ev.priority === 'modal' && CELEBRATE_ON && !isSummary && !(ev.kind === 'system' && /합격/.test(ev.title) && certResultWin.visible)) { ev.read = true; modalQueue.push(ev); continue; }
    if (ev.priority === 'modal' && !interruptBudget.request()) ev.priority = 'inbox';
    if (ev.priority === 'inbox' && (ev.kind === 'system' || ev.kind === 'guest')) newsQueue.push(ev.title);
    if (ev.priority === 'strip') { ev.read = true; if (!NO_TUT) speak(ev.speaker ?? 'president', ev.body.split('\n')); continue; }
    if (ev.kind === 'guest' && ev.title.includes('소원') && ev.title.includes('달성')) hud.showBanner(`소원 성립! ${ev.title.replace(/의 소원.*$/, '')}`);
    if (ev.kind === 'day-summary' || ev.kind === 'season-summary' || ev.kind === 'year-summary') {
      ev.read = true;
      if (!resultsCtl.enabled || !ev.data) continue;
      // G57: 어떤 모달이 떠 있어도 카드를 버리지 않고 줄 세운다 (사건 창이 결산을 삼키던 반대 방향)
      if (anyModalUp()) { summaryQueue.push({ kind: ev.kind === 'day-summary' ? 'day' : 'period', title: ev.title, data: ev.data as DayCard | PeriodReport }); continue; }
      if (ev.kind === 'day-summary') results.showDay(ev.title, ev.data as DayCard);
      else results.showPeriod(ev.title, ev.data as PeriodReport);
      if (ev.kind === 'day-summary') sfx.play('coin'); else sfx.jingle('result');
      continue;
    } // tut=0: 하네스 — 대사 전부 끈다 (홈 상시 컨트롤 감사가 띠를 센다)
    if (ev.kind === 'system' && /합격/.test(ev.title) && certResultWin.visible) { ev.read = true; continue; } // 결과 창이 이미 말했다
    if (ev.priority === 'modal' && CELEBRATE_ON && celebrate.show({ title: ev.title, body: ev.body, ...(ev.pic ? { pic: ev.pic } : {}) })) { ev.read = true; sfx.play(ev.title.includes('불합격') ? 'error' : 'rankup'); continue; }
    if (ev.priority === 'toast' || ev.priority === 'modal') { hud.showToast(`${ev.title} — ${ev.body}`, 3200); ev.read = true; }
    if (ev.priority === 'modal') sfx.play('coin');
  }
  for (const g of game.guests.all) {
    if (g.say) {
      bubbles.say(g.uid, g.say, performance.now());
      g.say = null;
    }
  }
  pumpModals();
};

function applyFx(fx: FxEvent): void {
  const c = tileCenter(fx.i, fx.j);
  if (fx.kind === 'coin') scene.fx('money-pop', { x: c.x, y: c.y - 8, amount: fx.amount ?? 0, key: 'ticket' });
  else if (fx.kind === 'splash') { scene.fx('splash-enter', { x: c.x, y: c.y }); sfx.play('splash'); }
  else if (fx.kind === 'land') { scene.fx('splash-land', { x: c.x, y: c.y }); sfx.play('splash'); }
  else if (fx.kind === 'rest') scene.fx('heart-float', { x: c.x, y: c.y });
  else if (fx.kind === 'fire') scene.fx('ember', { x: c.x, y: c.y }); // P18 불멍
  else if (fx.kind === 'bus') { scene.fx('dust-puff', { x: c.x, y: c.y }); sfx.play('build'); }
  else if (fx.kind === 'wish') { scene.fx('wish-burst', { x: c.x, y: c.y }); scene.fx('confetti', { x: window.innerWidth / 2, y: 120 }); sfx.play('wish'); }
  else if (fx.kind === 'dig' || fx.kind === 'fill' || fx.kind === 'place' || fx.kind === 'remove') {
    const p = gridToScreen(fx.i, fx.j);
    scene.fx('place-ok', { x: p.x, y: p.y });
    if (fx.kind === 'place') { scene.fx('dust-puff', { x: c.x, y: c.y }); sfx.play('build'); }
    scene.refreshTile(fx.i, fx.j);
  } else if (fx.kind === 'photo') {
    const last = game.sns.allPosts[game.sns.allPosts.length - 1];
    if (last && !thumbs.has(last.id)) scene.snapshotAt(fx.i, fx.j, (cv) => { if (cv) thumbs.set(last.id, cv); });
    scene.fx('photo-flash', { x: c.x, y: c.y });
    scene.fx('like-float', { x: c.x, y: c.y, amount: fx.amount ?? 1, key: `like:${fx.i},${fx.j}` });
    sfx.play('photo');
  } else if (fx.kind === 'like') {
    sfx.play('like');
  } else if (fx.kind === 'buy') {
    scene.fx('money-pop', { x: c.x, y: c.y - 8, amount: fx.amount ?? 0, key: `buy:${fx.i},${fx.j}` });
    if (fx.label) scene.fx('buy-pop', { x: c.x, y: c.y - 22, text: fx.label.includes('×') ? fx.label : `${fx.label} ×1` }); // P56-a2 D7: 손님 머리 위 「이름 ×1」 카드 — 돈은 money-pop 이, 물건은 buy-pop 이
  } else if (fx.kind === 'band') {
    scene.fx('band-strip', { x: c.x, y: c.y - 8, text: fx.label ?? '팔찌', amount: fx.amount ?? 0 }); // P56-a2 D7: 팔찌 발급 띠
  } else if (fx.kind === 'discover') {
    sfx.play('coin');
    scene.fx('got-item', { x: c.x, y: c.y - 8, text: fx.label ? `${fx.label} 획득!` : '획득!' }); // P56-a D7 「You got the Lemon!」
  } else if (fx.kind === 'cert' || fx.kind === 'rankup') {
    if (fx.kind === 'rankup') sfx.play('rankup'); else sfx.jingle('cert');
    if (fx.kind === 'rankup' || game.certs.state.last?.pass) scene.fx('confetti', { x: window.innerWidth / 2, y: 140 });
    if (fx.kind === 'rankup') hud.showBanner(`★${game.rank} ${RANK_DEFS.find((r) => r.star === game.rank)?.name ?? '랭크 업'}!`);
    else if (!NO_TUT || resultsCtl.enabled) certResultWin.show(); // 결과 창(카드 뒤집기 + 도장, G35) — 축하 모달
    syncWorldToScene(); // 랭크업이면 토지가 넓어졌다
  }
}

const flowTick = (dtMs: number): void => {
  if (flow.frozen || !scene.tickingEnabled) return;
  if (game.haltedForEnding && !endingWin.visible && !panelHost.anyOpen) { sfx.jingle('ending'); endingWin.show(); }
  if (panelHost.anyOpen || game.haltedForEnding) {
    flow.acc = 0;
    return;
  }
  flow.acc += dtMs;
  const per = TICK_MS / flow.speed;
  const n = Math.floor(flow.acc / per);
  if (n <= 0) return;
  flow.acc -= n * per;
  game.step(n);
  // ⚠ GuestStore.step 은 매 tick 배열을 새로 만든다(filter) — 부팅 때 준 참조만 들고 있으면 씬이 **빈 배열**을 그린다.
  // 하네스는 풀 파기 등으로 syncWorldToScene 이 매번 다시 불려 안 보였고, 「그냥 플레이」한 배포판에서만 손님 0명이 됐다 (2026-09-03 실기 확인)
  scene.setGuests(game.guests.all);
  scene.setStaff(game.staff.all);
  scene.setBus(game.busState);
  consumeFx();
  refreshHud();
  if (game.day !== lastDay) {
    lastDay = game.day;
    syncPoolLook(); // 계절이 바뀌면 수온이 바뀐다 (P60-a: 색·향 삭제)
    scene.setSeason(game.clock.season);
    sfx.setSeason(game.clock.season);
    persist();
  }
};

/** 계절 연출 (G27) — 봄 꽃잎 · 여름 주말 저녁 불꽃 · 가을 낙엽 · 겨울 저녁 조명. 렌더 전용(난수는 sim 밖) */
const seasonal = { next: 0, lights: false , flip: false };
let lastPump = 0;
const seasonalFx = (now: number): void => {
  if (now - lastPump > 1000) { lastPump = now; if (game.events.pending && !choiceWin.visible) pumpModals(); }
  // ⚠ 씬이 뜨기 전(부팅 첫 프레임들)에 fx 를 부르면 `scene.add` 가 없어 rAF 루프가 통째로 죽는다 (실측)
  if (flow.frozen || now < seasonal.next || !scene.sys || !scene.sys.isActive()) return;
  const c = game.clock;
  const w = window.innerWidth; const h = window.innerHeight;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lights = c.hour >= EVENING_HOUR || (c.season === 3 && c.hour >= 17); // P18 저녁 조명(사철) · 겨울은 17시부터
  if (lights !== seasonal.lights) { seasonal.lights = lights; scene.setIllumination(lights); }
  if (c.season === 0) { scene.fx('petal-fall', { x: Math.random() * w, y: -4, amount: Math.floor(Math.random() * 2) }); seasonal.next = now + (reduced ? 2400 : 700); }
  else if (c.season === 1 && c.isWeekend && c.hour >= 19) { scene.fx('fireworks', { x: 40 + Math.random() * (w - 80), y: 60 + Math.random() * 120, amount: Math.floor(Math.random() * 4) }); sfx.play('tap'); seasonal.next = now + (reduced ? 3000 : 900); }
  else if (c.season === 2) { scene.fx('leaf-fall', { x: Math.random() * w, y: -4, amount: Math.floor(Math.random() * 2) }); seasonal.next = now + (reduced ? 3000 : 900); }
  else if (c.season === 3 && !(lights && seasonal.flip)) { seasonal.flip = true; scene.fx('snow-fall', { x: Math.random() * w, y: -4, amount: Math.floor(Math.random() * 2) }); seasonal.next = now + (reduced ? 2800 : 800); }
  else if (lights) { seasonal.flip = false; const fs = game.facilities.all; const f = fs[Math.floor(Math.random() * Math.max(1, fs.length))]; if (f) { const p = tileCenter(f.i, f.j); scene.fx('lamp-twinkle', { x: p.x, y: p.y - 14 }); } seasonal.next = now + 800; }
  else seasonal.next = now + 1000;
  void h;
};

let lastRaf = performance.now();
const rafLoop = (now: number): void => {
  const dt = Math.min(250, now - lastRaf);
  lastRaf = now;
  frameMs.push(now - lastRaf + dt);
  if (frameMs.length > 300) frameMs.shift();
  flowTick(dt);
  seasonalFx(now);
  bubbles.update(now, (uid) => scene.guestScreen(uid));
  requestAnimationFrame(rafLoop);
};
requestAnimationFrame(rafLoop);
if (game.events.pending && !NO_TUT) choiceWin.show(); // 저장 당시 열려 있던 사건은 다시 묻는다

// 씬이 준비된 뒤 세계를 한 번 밀어 넣는다 (씬 create 는 비동기 부팅 뒤)
phaser.events.once('ready', () => { syncWorldToScene(); refreshHud(); });
window.setTimeout(() => { syncWorldToScene(); refreshHud(); }, 300);

// 디버그가 아니어도 상자에 FPS 를 채운다 — 하네스가 부팅을 이걸로 판정한다
if (!DEBUG) {
  const tick = (): void => {
    if (lastStats) hud.setDebug(`FPS ${lastStats.fps}`);
    window.setTimeout(tick, 1000);
  };
  tick();
}

const build = typeof __WP_BUILD__ === 'undefined' ? null : __WP_BUILD__;
// 빌드 표식 — 메뉴 제목에 「도트 v2 · 0903 07:14」. 폰에서 옛 번들을 보고 있는지 바로 가른다
const stampAt = build ? new Date(build.startedAt) : null; // 빌드 시각 — 보는 기기의 현지 시간으로
const stamp = stampAt && !Number.isNaN(stampAt.getTime()) ? `${String(stampAt.getMonth() + 1).padStart(2, '0')}${String(stampAt.getDate()).padStart(2, '0')} ${String(stampAt.getHours()).padStart(2, '0')}:${String(stampAt.getMinutes()).padStart(2, '0')}` : '';
mainMenu.setTitle(params.get('debug') === '1' ? `메뉴 · ${ASSET_VERSION}${stamp ? ` · ${stamp}` : ''}` : '메뉴');

/** 검증·개발용 표면. 게임 규칙은 여기 없다 */
const api = {
  get game() { return game; },
  poolInfo,
  results,
  resultsCtl,
  rankingsWin,
  staffWin,
  guestInfo,
  facilityInfo,
  syncWorldToScene,
  tutorial,
  speak,
  refreshHud,
  facilityDefs: FACILITY_DEFS,
  certDefs: CERT_DEFS,
  sfx,
  features: FEATURES,
  TPD: TICKS_PER_DAY,
  JUDGE_TICK,
  assetVersion: ASSET_VERSION,
  imagegenArt,
  grid: game.grid,
  camera,
  scene,
  phaser,
  hud,
  provider,
  compactArrival: () => game.arrivalRevision >= 3,
  ...(compactBoundary ? { compactBoundary } : {}),
  watercraft,
  approved,
  panelHost,
  interruptBudget,
  dock,
  placeDock: place,
  courseDock,
  place,
  buildWin,
  snsWin,
  certWin,
  rankWin,
  shopWin,
  menuWin,
  cookWin,
  workshopWin,
  rigWin, // P51
  investWin,
  campaignWin,
  mainMenu,
  endingWin,
  bubbles,
  flow,
  build,
  buildTabs: BUILD_TABS, // P56-a2 하네스 — 건설 탭의 정의 수를 센다
  pictureCount, // P56-b 하네스 — 반입된 그림 수(「폴백 0」 행)
  stats: () => lastStats,
  frameMs,
  fxFired,
  inboxWin,
  celebrate,
  /** P0-B: 하네스 — 경사를 평탄화(높이와 무관한 절이 고정 좌표에 시설을 놓는다) */
  flatten: () => { game.grid.levels.fill(0); scene.setLiftFaultForTest(false); syncWorldToScene(); },
  modalQueue,
  newsQueue,
  pumpNews: () => { newsUntil = 0; refreshHud(); },
  certResultWin,
  choiceWin,
  calendarCount: CALENDAR_EVENTS.length,
  /** n tick 을 즉시 감는다 (하네스 전용) */
  skip: (n: number) => { game.step(n); consumeFx(); refreshHud(); syncWorldToScene(); },
  newGame: (seed: number) => { game = createGame(seed); resetSessionForNewGame(); syncWorldToScene(); refreshHud(); },
  /** P50-b2 하네스 세터 — 목표 슬롯 고정(0 A · 1 B · 2 C · null 회전). `goalSlot` 은 6초 회전이라 직접 대입 금지 */
  pinGoal: (n: number | null) => { pinnedGoal = n; refreshHud(); },
  goalLine: () => goalLine(),
  /** P53-c 하네스 — 페이지의 판을 굴릴 봇(결정만, 시간은 `skip`) */
  botFor: () => new Bot(game, BOT_DEFAULTS, game.seed ^ 0x5eed),
};
(window as unknown as { __pj: unknown }).__pj = api;

if (EDITOR) { const { attachEditor } = await import('./editor/editor.js'); attachEditor({ game, scene, sync: syncWorldToScene, loadError: editorLoadError }); }
if (MAP_TEST) { const { attachTestBar } = await import('./editor/editor.js'); attachTestBar(editorLoadError); }
