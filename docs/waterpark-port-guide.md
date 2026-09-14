# 워터파크 → 빠지 타이쿤 이식 가이드 + 문서 리뷰 (2026-09-03)

> 목적: `waterpark/`(Pool Slide Story 클론)의 시스템을 나중에 빠지 타이쿤(`src/`)으로 **자연스럽게** 옮기기 위한
> 한 장. 코드를 실제로 읽고 적었다 (인용은 `파일:줄`). 코드 변경은 0 — 문서와 `docs/README.md` 색인만.
> ⚠ **2026-09-04 갱신 안내:** 이 문서는 G33 시점이다. `features.randomEvents` 는 그 뒤 **true**(G39), 데이터·하네스 수와 G34~G56 의 추가분·이식 순서에 얹을 것은 **`waterpark-clone-summary.md` §6** 에 있다. 대응표·환산표·순서 ①~⑦ 은 그대로 유효.
> ⚠ 작성 중 다른 세션이 `waterpark/tools/verify.ts` 에 G33 절을 붙이고 있었다 (1,013 → 1,032줄, `src/sim/g33.test.ts` 신설).
> 그 파일의 줄 번호는 흔들릴 수 있다. 또 **`waterpark/` 전체가 git 에 untracked 다** (`?? waterpark/`) — §6-1.

---

## 1. 개요

**무엇인가.** 카이로소프트 *Pool Slide Story* 를 `waterpark/` 독립 패키지(자체 `package.json`, dev 5177)로 다시 만든 것.
부모에서 순수 유틸(`rng`·`iso` 수식·`camera`·`upscale`·`dom`·`panels`·`compat`·`build-identity`)만 복사했고
게임 시스템은 전부 새로 짰다. 규모 실측: 소스 22,868줄 (sim 5,979 · data 6,555 · 나머지 render/assets/ui/save/tools),
vitest 파일 21개(케이스 ≈211), 브라우저 하네스 `record()` 114절, 데이터 시설 94 · 친구 71 · 소원 213 · 인증 24 · 레시피 140 ·
재료 60 · 타일 13 · 지역 10 · 달력 24 · 상점 56 · 투자 23.

**아키텍처 불변식** — 부모와 같다 (`waterpark/eslint.config.js`, `src/sim/invariants.test.ts`):
1. `src/sim/**` 은 `phaser`·`**/render/**`·`**/ui/**`·`**/assets/**`·`**/save/**` 를 import 할 수 없다.
2. sim 은 결정론이다 — `Math.random`·`Date.now`·`performance.now`·`new Date()` 금지. 루트 시드에서 `rng.fork(salt)` 로
   **8 스트림**(`game.ts:84` `RNG_SALTS {spawn 1, guest 2, sns 3, cert 4, shop 5, cook 6, world 7, friend 8}`)을 한 번 만들고
   스냅샷이 8개 state 를 왕복한다 (`game.ts:1343,1379`).
3. 콘텐츠는 데이터다 — `src/data/*.json` 25파일 + `schema.ts` + `data.test.ts`(972줄: 참조 무결·해금 도달성·밸런스 회귀).
   숫자는 `balance.json` 이 소유하고 `npm run bot -- --sweep k=v` 가 유일한 조정 창구.
4. **기능 스위치** `src/data/features.json` — `staff · facilityLevels · randomEvents · rivals · dailyResults` **전부 false**
   (G22: PSS 에 없는 축은 끈다). sim 이 명령 단계에서 거절하고(`canHire`/`canUpgrade`/`roll`) UI 는 메뉴를 숨긴다.
   하네스는 `window.__wp.features.x = true` 로 켜서 그 절만 잰다.
5. 색은 `src/ui/style.css` 만 소유(`tools/check-ui.mjs` S1) — 캔버스는 `cssVar()`.

**이력 정본.** G0~G32 는 `docs/plan-waterpark-clone.md` §3 (goal 종료마다 실측 append), G25~G32 의 근거는
`docs/plan-waterpark-v2.md`. G33(요리 레벨 → 맛/인기 · 좋아요 → 유입)은 코드(`g33.test.ts`)에는 있으나 §3 에 아직 절이 없다.
남은 것: G28 AI 아틀라스(9/7 Codex 재개 뒤) · 실기 F부(`waterpark/docs/human-check.md` 25항목 **0/25**).

---

## 2. 모듈 인벤토리

경로는 `waterpark/src/` 기준. "의존"은 sim 안의 import 방향. 테스트는 그 모듈을 직접 다루는 파일.

### 2.1 sim (`src/sim/`, 31 소스 + 19 테스트)

| 파일 (줄) | 역할 | 공개 표면 (중요한 것) | 소유 데이터 | 테스트 | 의존 |
|---|---|---|---|---|---|
| `rng.ts` (82) | mulberry32 | `Rng.next/int/intRange/range/chance/pick/fork(salt)/state/setState/fromState` | — | 전역 | — |
| `clock.ts` (77) | 순수 시간 변환 | `OPEN_HOUR 8·CLOSE_HOUR 20·TICKS_PER_HOUR 140·TICK_SCALE 140/60·TICKS_PER_DAY 1680·DAYS_PER_SEASON 4·DAYS_PER_YEAR 16·FINAL_YEAR 8·TOTAL_DAYS 128·TICK_MS 125`(하루 210초)·`SHOP_RESTOCK_TICK`(17:00)·`JUDGE_TICK`(15:00)·`ARRIVAL_FROM/TO_TICK`·`Season 0..3`·`ClockView`·`clockView(day,tick)`·`isWeekend`(day%4==3) | — | `clock.test` | — |
| `grid.ts` (117) | 64×48 격자 | `GRID_W 64·GRID_H 48·FLOOR{sand,grass,path,indoor,pool}(append-only)·LAND_BY_RANK[6]·landRect(rank)·gateTile(rank)`(**아래 변 중앙**)·`Grid{floor,poolTile,at,set,openLand,newPark}` | — | `grid.test` | — |
| `pool.ts` (161) | 4이웃 연결 성분 = 풀 | `Pool{id,tiles,items,likes}·PoolStore{at,byId,all,totalTiles,recompute(병합=아이템∪·likes max, 분할=큰 조각 승계),toSnapshot/fromSnapshot}` | — | `pool.test` | grid |
| `pool-state.ts` (70) | 풀 파생 상태 | `PoolContext·PoolState{size,popularity,maintenance,color,intensity,scent,scentPower,temp,se,ab,seasonBonus}·sizeScale=min(6,√size)·poolState(pool,ctx)` | `seasons.json` (via ctx) | `pool-state.test` | pool, color, scent, clock |
| `color.ts` (65) | 색 혼합 | `COLOR_RGB(9)·RAINBOW_MIN_COLORS 8·RAINBOW_MIN_SHARE .08·INTENSITY_CLEAR 20·mixColor(items,size)` — intensity `100·Σw/(2√size)` | — | `color.test` | — |
| `scent.ts` (20) | 향 argmax | `pickScent(inputs)` (동점은 아이템 우선) | — | `color.test` | — |
| `facility.ts` (243) | 배치 시설 | `PlacedFacility{uid,defId,i,j,facing 0\|1,rentedBy,level,uses*,income*}·popOf/capacityOf/upgradeCost·FacilityStore{check(6 FAIL),place,remove,footprint/lane/slideTop/exitTile/ring,adjacentTo,entryTiles,totalPopularity/Maintenance}` | `facilities.json` (via game) | `facility.test`, `guest-life.test` | grid |
| `nav.ts` (77) | BFS 거리장 | `UNREACHABLE·DistanceField{at,next}·buildField(grid,targets,walkable)` | — | (guests 경유) | grid |
| `guest.ts` (664) | 손님 FSM | `GuestState = enter\|wander\|walk\|swim\|use\|climb\|ride\|eat\|leave\|gone`(L16) · `GuestBuild adult\|kid\|old`(`buildOf(age)`) · `GuestMood calm\|happy\|annoyed\|tired`(`moodOf` 파생) · `GuestEmote heart\|note\|zz\|grr\|camera\|star`(40tick TTL) · 게이지 `hp`(퇴장 <15)·`sat`(0..100) · `float 0..6`(`FLOAT_BY_GIFT`) · `carry`(R3) · **`GuestHooks{onSwimEnter,poolTemp,onFacilityUse,onPhoto,poolLook,onLeave,hpMul,satMul,photoMul}`**(L109) · `GuestStore{spawn,flush,resetDay,step(hooks),usingFacility,invalidate}` · `RIDE_TICKS_PER_TILE 4·EAT_TICKS 12·DRIFT_EVERY 31·GUEST_NAMES 40` | — | `guest-life.test`, `game.test`, `g33.test` | rng, facility, clock, grid, pool, nav |
| `sns.ts` (312) | SNS·친구·소원·지역·선물 | `Post·FriendState{exp,stars,activeWish,windowUntilDay,…}·SNS_DEFAULTS{wishExpNeed[100,260,520],wishWindowDays 8,likesPerArea 1000,playerLikeBonus 5,playerLikesPerDay 3,postGrowDays 2}`(**하드코딩, balance 아님** L65)·`SnsStore{post,likePost,addFriendExp→WishDef,activeWishes,markMet,closeDay→{fulfilled,invited,expired},growPosts,checkAreas,giveGift,unlockFriend,areaProgress,nextArea}` | `friends/wishes/areas/gifts.json` (via game) | `sns.test` | rng, clock |
| `condition.ts` (234) | 조건 DSL | `ConditionWorld`(16 메서드)·`Verdict{met,progress,actual,need,label}`·`evaluate(c,world)`·**kind 22**: `pool{sizeMin,sizeMax,color,scent,tempMin/Max,likesMin,intensityMin,popMin,outdoor,indoor,count}·poolTotalSize·facility{id,count,adjacentPool}·facilityAdjacent{ids,count}·facilityClass·item{id,count}·recipe{id,served}·recipeCount·popularity·likes{min,scope,area}·certPasses·certPassed·friends·areas·rank·gift{id,friendId}·cookingLevel·visitors·money·year·all·any` | — | `condition.test`, `data.test` | — |
| `cert.ts` (117) | 풀 심사 | `JUDGES 3·POINTS_PER_JUDGE 10·JUDGE_BIAS 1·certScore·CertStore{canApply(봄·가을·dayInSeason≤1·requires·fee),apply,isJudgeTime,judge(정확히 3회 뽑기)}` | `certs.json` | `cert.test` | clock |
| `rank.ts` (15) | 랭크 | `nextRank·rankReady` | `ranks.json` | `rank.test` | condition |
| `shop.ts` (49) | 주간 입고 | `SHOP_SLOTS 6·Shop{restock(day,rank,owned) 정확히 6회 뽑기,take}` | `shop.json` | `rank.test` | rng |
| `campaign.ts` (52) | 광고 | `Campaigns{mul(day),canStart,start}` | `campaigns.json` | (data.test) | — |
| `calendar.ts` (17) | 사장 달력 | `eventDay·dueEvents(events,day,tick,given,evalCond)` | `calendar.json` | `rank.test`, `lines.test` | — |
| `cooking.ts` (124) | 요리 개발 | `COOK_MAX/MIN 5/2·COOK_COST 300·COOK_UNLOCK_YEAR 2·LEVEL_EXP[11]·LEVEL_MULT .05·recipeKey(다중집합)·CookingStore{level 1..10,mult,cook(ids)→힌트,grantIngredient,canCook}` | `recipes/ingredients.json` | `cooking.test` | rng |
| `restaurant.ts` (110) | 메뉴 5칸·궁합 | `MENU_SLOTS 5·COMPAT_GOOD 1.5/BAD .5·DIVERSITY[1,1,1.1,1.2,1.4]·recipePrice·MenuStore{setSlot,equipped,menuPopularity,pick,compatOf}` | `compat.json` | `cooking.test` | — |
| `lines.ts` (29) | 친구 첫 방문 대사 | `firstVisitLine(f)` 템플릿 6 × 취향 (해시, 난수 0) | — | `lines.test` | — |
| `story.ts` (46) | 시나리오 비트 | `StoryDirector{check(state)→beats}` — 비차단 `strip` 사건, `absTick % 30` 판정 | `story.json`(인물 3·비트 19) | — | — |
| `events.ts` (67) | 인박스 | `EventPriority toast\|inbox\|modal\|strip·EventKind 8·GameEvent·INBOX_KEEP 100·Inbox{push,drain,all,unread,markRead}` — sim 은 적재만, 모달 상한은 UI(`ui/panels.ts:100`) | — | — | — |
| `endgame.ts` (66) | 점수·NG+ | `SCORE_WEIGHTS{pop 10,visitors 1,likes 1,friends 10,certs 10,recipes 5}·scoreOf·Carryover v1·carryoverOf·applyCarryover` | — | `save.test` | type Game |
| `staff.ts` (100) ⛔flag | 직원 4역·청결 | `StaffStore{hire,fire,mul,cleanliness,closeDay,step}` | `staff.json` | — | rng |
| `random-events.ts` (71) ⛔flag | 랜덤 이벤트 14 | `RandomEvents{roll(정확히 2회),resolve,arrivalMul,popBonus}` | `events.json` | — | rng |
| `weather.ts` (22) | 날씨 | `Weather clear\|cloudy\|rain\|snow·WEATHER_ARRIVAL·WEATHER_TEMP·rollWeather(하루 1회)` | — | — | rng |
| `startkit.ts` (28) | 물려받은 파크 | `applyStartKit(g)`: 풀 4×5 + 시설 7 (`inherited:true`) | — | (game.test, save.test) | type Game |
| `bot.ts` (392) | 헤드리스 정책 | `BotPersona balanced\|pool\|restaurant\|cert·BOT_DEFAULTS{reserve 3000,…}·Bot.decideDay()·RunMetrics(24)·hashSnapshot(FNV)·runBot` | — | `golden`, `g30`, `lines` | game, grid, rng, clock, endgame |
| `game.ts` (1414) | **루트** | 데이터 맵 20종 export · `FEATURES`(features.json 의 가변 사본) · `Game{step(n)/stepOne/closeDay, conditionWorld/evaluateCondition/grant, expectedCert/applyCert, rankProgress, shopStock/buyShop, setMenu/cook/buyIngredient, canInvest/invest/settleInvest·campaign(**인라인**, L477-516), paintIndoor/unpaintIndoor, giveGift/likePost, digPool/fillPool/putItem/previewItem, savePreset/applyPreset(**프리셋은 여기**, L1178-1216, MAX 4), canPlace/placeFacility/removeFacility, hireStaff/upgradeFacility(flag), drainFx/drainEvents, toSnapshot/fromSnapshot(v1)}` · `FxEvent` 16종 · `maxGuests()=40+12·rank` | JSON 18 + rivals/features | `game`, `golden`, `preset`, `g30`, `g33`, … | 전부 |

핵심 테스트: `golden.test.ts`(3시드×16일 해시·방문 고정 + 결정론 + 스냅샷 왕복 후 계속) · `invariants.test.ts`(ESLint 규칙이 실제로 잡히는지, `save/` 금지는 **미검증**) · `g30.test.ts`(R2 좋아요 리셋·`maintRankMul`·`ticketFor`·`lateSpendRatio`) · `guest-life.test.ts`(climb→ride 전 활강로 칸 통과·R3) · `preset.test.ts`.

### 2.2 data (`src/data/`)

`schema.ts` 인터페이스 28종. JSON: facilities 94 · items 24 · seasons(colors 11·scents 12·ambient·sun) · areas 10 · friends 71 · wishes 213 · gifts 8 · tiles 13 · certs 24 · ranks 5 · shop 56 · calendar 24 · ingredients 60 · recipes 140 · compat 26 · invest 23 · campaigns 3 · events 14 · staff(roles 4) · story(3+19) · rivals 5 · features 5 · balance.
**balance.json 키**: `startMoney 12000 · ticketBase 200 · poolTileCost 100 · poolRemoveCost 50 · poolMaintBase 6 · poolMaintPerPop .5 · tilePopStandard 4 · arrivalBase 10 · arrivalPerPoolTile .6 · arrivalPerPop .12 · arrivalWeekendMul 1.6 · arrivalSeasonMul[4] · maxGuests 40 · maxGuestsPerRank 12 · guestHpStart 100 · guestHpSwim 8 · guestHpLeave 15 · swimTicks 93 · walkTicksPerTile 2 · wanderTicks 28 · facilityRemoveCost 50 · tempTolerance 8 · maintRankMul 1.15 · ticketSatStep .25 · arrivalPerLike .002 · arrivalLikesCap 20`.

### 2.3 render (`src/render/`)

| 파일 (줄) | 역할 · 공개 표면 |
|---|---|
| `iso.ts` (130) | 2:1 다이메트릭, `TILE_W 32·TILE_H 16·STEP 16/8`, `depthKey=(i+j)·4096+i`, 띠 `Z_GROUND 0·Z_WATER 1·Z_FACILITY 2·Z_GUEST 4·Z_FACE 5·Z_EMOTE 6·Z_GHOST 7·Z_FX 8`, `DEPTH_AIM_MARK/LAND_MARK/SCREEN_FX 9,000,000+`, `LEVEL_H 8·lift·spanDepthKey·footprintAnchor/Canvas((w+d)·16 × (w+d)·8+bodyH)·tileRowSpan`. 테스트 `iso.test` |
| `upscale.ts` (96) | `UPSCALE_STEPS [1,2]·viewport(cssW,cssH,s,dpr)·integerDpr·violatesDotGrid` — 부모 복사본 |
| `camera.ts` (158) | Phaser 없는 상태기계. `BACKDROP 48·ELASTIC 40·Camera{pan,centerOn,release,setUpscale(앵커 보존),view()}`. 테스트 `camera.test` |
| `water.ts` (53) | `WaterGlint.setTiles/update(reduced)` 한 장 Graphics |
| `boot.ts` (26) | `bootPhaser(parent,scene)`: `Scale.NONE·zoom 1·pixelArt·activePointers 3`, **`?px=1` → `preserveDrawingBuffer`** |
| `scene.ts` (948) | `WaterparkScene`. 깊이: 지면 `Z_GROUND` → 글린트 → 벽/코핑(`LAND_MARK−4`) → 활강로(`−3`) → 시설(`depthKey(앞 발자국)+Z_FACILITY`) → 나무 띠 → 손님 `spanDepthKey+Z_GUEST(+1 climb/ride)` → 이모트/게이지/HP `+1` → 고스트 → 날씨/조명/틴트(`SCREEN_FX−2/−1`) → FX. **sim 을 라이브 참조로 읽는다**(`grid`, `setGuests(list)`, `setFacilities`, `setStaff`) — tick ms 를 모르고 `g.progress` 로 보간(L347). 공개: `tickingEnabled·fx(name,t)·drawCoping·drawWalls·drawLanes·drawBorder(land)·refreshTile·setPoolTiles/Colors/IndoorPoolTiles·setSeason(n)·setIllumination(on)·setWeather(rain\|snow\|null)·setHour·setGhost·setSelection·snapshotAt(i,j,cb)(48×32)·guestScreen/guestAt·hpIconCountForTest·gaugeCountForTest·borderCountForTest`. 입력: 드래그 팬, DOM 핀치 1↔2, 더블탭, `onTapTile`. `MAX_EMOTES 8·HP_ICON_BELOW 30` |
| `fx/registry.ts` (337) | **FxName 20**: `money-pop·splash-enter·place-ok·place-bad·item-sparkle·scent-puff·temp-steam·temp-frost·photo-flash·like-float·splash-land·wish-burst·heart-float·confetti·fountain-spray·dust-puff·fireworks·petal-fall·leaf-fall·lamp-twinkle`. `playFx(host{scene,reduced},name,target{x,y,text?,key?,amount?})→FxHandle`, `MAX_LIVE_FX 12`(가장 오래된 것 kill), `MERGE_MS 700`(같은 name+key 합치기), `fxFired` 카운터(「슬롯이 돈다」), reduced 면 `delayedCall` 로 숫자만 |
| `fx/sfx.ts` (217) | **WebAudio, 파일 0**. `SfxName 12`: `tap·open·close·coin·error·splash·photo·build·wish·rankup·cert·like` · BGM 4곡(`TRACK_NAMES` 봄/여름/가을/겨울) · `JingleName cert·result·ending`(BGM 1/4 덕) · `Sfx{setSeason,setVolume,jingle,unlockOnGesture(pointerdown+touchstart 1회→ctx.resume→startBgm),play,startBgm(100ms 룩어헤드)}` · localStorage `wp.sound/wp.bgm/wp.vol` · 싱글턴 `sfx` |

### 2.4 assets (`src/assets/`)

| 파일 | 역할 |
|---|---|
| `types.ts`·`provider.ts` | `SpriteSpec{id,w,h,ax,ay,source procedural\|art}·AssetProvider{canvas,spec,ids}`. `ProceduralProvider`(DRAWERS `tile/…`,`guest/…`,`fac/{id}/{0\|1}`) + `registerFacilityDefs` |
| `atlas-provider.ts` | `AtlasProvider(fac-atlas.png/json)·HybridProvider(atlas→절차 폴백)·loadAtlas()`(**`?atlas=0`** 대조군). `main.ts:71` 이 top-level await 로 로드(빌드 타깃 es2022) |
| `manifest.json` (8 entries) | `tile/*` 6 (procedural 32×16) + 패밀리 `guest/body`(art, **14×24 — 낡음**, 실제 18×32) + `fac`. `manifest.test` 가 id 유일·정수·source 검사 |
| `draw/pix.ts` | 픽셀 DSL: 문자 → `--px-*` 토큰 표 `TOKEN`, `blit·flipX·isoBox·overlay·compose·wallRect`, `ASSET_VERSION '도트 v2'` |
| `draw/guest.ts` | ID `guest/body:{palette}[:{build}][:f{float}]/{pose}/{frame}[/{mood}]` — **무드는 마지막 세그먼트**(하네스 `split('/').pop()`). `GuestPose idle\|walk\|swim\|sit\|lie\|ride`, 18×32 앵커 (9,30), 팔레트 8, 튜브 토큰 6, 머리 5 |
| `draw/fac-sprites.ts`+`facility.ts`+`sprites/*.ts` | 템플릿 36 × `ART` 표(91 종 — `crystal_fountain·grand_arch·moon_tower` 는 분류 기본값) × 간판 아이콘 24. `BODY_H {utility 28,lounging 16,restaurant 34,attraction 30,slide 64,decor 30}` |
| `draw/emote.ts`·`portrait.ts`·`tiles.ts` | 이모트 6·게이지·배터리 / 초상 24 / `TileId sand\|grass\|path\|indoor\|pool\|gate`, 물 3프레임, 어두운 선은 **아래 두 변만** |

### 2.5 ui (`src/ui/`)

| 파일 | 역할 |
|---|---|
| `panels.ts` (128) | `UiSurface home\|menu\|window\|build\|pool`(`data-ui-surface` 한 값) · `PanelHost{register(p,{exclusive,modal}),open→false(모달 열림),closed,closeAll,anyOpen(=시간 정지)}` 기본 배타 · **`InterruptBudget`**(`INTERRUPT_MAX_PER_MIN 1`, 실시간 60초 창) · 싱글턴 `panelHost`/`interruptBudget`. 테스트 `panels.test` |
| `hud.ts` (232) | 헤더 버튼 0. `#hud-top`(시간·돈) · `#hud-right .ksquare×5`(`HUD_CELLS build·pool·sns·cook·shop`, 잠김은 `data-locked`+이유, 숨기지 않음) · `#hud-ticker`(`div[role=button]`+사장 초상) · `#hud-bottom`(`#hud-save·#hud-info·#hud-menu`) · `#krotate`. `setTime/Money/Popularity/Visitor/Ticker/Badge/Locked/Surface·showBanner(비모달)·showToast·setDebug` |
| `window.ts` (64) | `WindowPanel(parent,id,title,tone purple\|blue\|pink\|green\|gold,{modal})` — `.kscrim`+`.kwin`, `show()` 는 `panelHost.open` 게이트, `hide()` 가 `setUiSurface('home')` |
| `windows/` 20 | `build`(6탭 카탈로그 카드) · `place`(PlaceDock, 조준 배치) · `pool-edit`(PoolEditDock: dig/fill/item/indoor/unindoor, R2 경고 `previewItem`) · `pool-info`(프리셋) · `facility-info`(개선/메뉴/철거) · `guest-info` · `sns`(타임라인/메시지/친구, `wp.wishOpened`) · `cook` · `menu-edit`(5칸 ◎○△) · `shop` · `invest` · `campaign` · `cert`(심사 무대) · `rank` · `rankings`(5탭) · `results`(모달 gold, `DayReport/PeriodReport` 그대로) · `inbox` · `staff`(flag) · `ending`(점수 6행·NG+) · `menu`(MENU 리스트) |
| `strip.ts`·`bubbles.ts`·`dom.ts`·`icons.ts`·`tokens.ts` | `DialogueStrip`(`#tut-strip`, `wp.tut`) · `Bubbles MAX 3`(transform 만) · `el/button` · `IconName 31`, `iconEl()` 만(문자열 API 없음) · `cssVar/cssColorInt` |
| `style.css` (817) | `:root` 토큰 **237**: `--px-*` 44 · `--guest-*` 30 · `--fac-*` 21 · `--tile-*` 19 · `--pool-*` 13 · `--win-*` 8 · `--fx-*` 8 · `--fs-*` 7 · `--float-*` 7 · `--btn-*` 6 · `--strip-*` 5 · `--bar-*` 5 · `--row-*` 4 · `--icon-*` 4 · `--grass-season-*` 4 · `--fw-*` 4 · `--confetti-*` 4 · `--ticker-*` 3 + 단품. 레이아웃 `--tap 44·--square 48·--ticker-h 28·--bar-h 56·--safe-*` (**`--bottom-stack` 토큰 없음** — L396/L736 에서 `calc` 로 합성). 표면 규칙 L457: `html:not([data-ui-surface='home'])` 이면 오른쪽 열·티커·바 `display:none`. reduced-motion 가드 한 블록 L518 |
| `overlays/` | **빈 폴더** (계획의 toast/strip/dialog 는 hud/strip/window 로 흡수) |

### 2.6 save (`src/save/`)

`save.ts`: `SAVE_KEY 'wp.save'`, **`SAVE_VERSION 2`**, `MIGRATIONS` v1→v2(`ticketBonus ?? 0`, `endingSeen ?? false`), `migrate` 는 한 단계씩, `load/save/clear`. 저장 = `GameSnapshot` 통째 (풀 파생·거리장·FX·썸네일·`wp.wishOpened`·`wp.tut` 는 안 넣는다).
`profile.ts`: `PROFILE_KEY 'wp.profile'`, `Carryover.version === 1` 만 읽는다. `save.test`: 체인 길이 = `SAVE_VERSION−1`, 왕복, 점수식, 128일 정지, 이월.

### 2.7 tools (`waterpark/tools/`)

| 파일 | 역할 |
|---|---|
| `verify.ts` (≈1,032) | Playwright **설치된 Chrome**, 393×852 @3 hasTouch, CDP `Input.dispatchTouchEvent` 로 `touch/drag/pinch`. 절: 부팅 ≤5s → 빌드 표식(`/__wp_build`) → 정수 업스케일 → `HOME_IDENTITY`(이름 있는 컨트롤 9개 · 44px · `elementFromPoint` 도난 · HUD ≤18%) → 팬/핀치/더블탭 → 타일 텍스처 → 잠긴 칸 토스트 → **G1**(풀 파기·저장 왕복) G3(배치·딸기 핑크 픽셀) G4(SNS·좋아요·소원·모달 예산) G5(랭크·심사·상점·타일) G6·7 G8 G9(48명 p95·말풍선 ≤3) G11(엔딩·NG+) G12(전 창 44px·콘택트 시트) G19 G20 G23 G24 G25(시작 킷·물 ≥1%) G26 G27 G29(Galmuri) G30 G31/32 **G33** → 콘솔 0. `--goal gN` 로 문턱 |
| `gate.ts` (61) | `gate -- gN`: typecheck → lint → vitest → check-ui(+selftest) → (N≥2) `bot --determinism` → (N≥10) `bot --bands` → vite 5177 자동 기동 → verify. **id 목록 없음** — 숫자가 문턱만 올린다 |
| `check-ui.mjs` (217) | S1 hex 0(ui/render/assets TS, `tokens.ts` 제외) · S2 `var(--x)` 전부 `:root` 선언 · S3 대비 **14쌍**(4.5/3, 알파 띠는 `--tile-sand` 위 합성) · S4 이모지 0 · S5 font-size 는 `--fs-*` 만·≥12·≤7단 · S6 transition 은 transform/opacity/box-shadow/background/color + reduced 가드 · S7 `.kbtn,.ksquare` 그라디언트+inset+`:active` · S8 `.hidden =` 는 panels 를 import 하는 파일만 · S9 `tweens.add/add.particles` 는 `render/fx/` 만. `--selftest` 결함 10종 주입 |
| `bot.ts` (105) | `--seeds 8 --days 128 --determinism --json --sweep k=v --persona balanced\|pool\|restaurant\|cert\|all --bands`. **BANDS 8**: money [20만,300만] · certs [10,24] · areas [6,10] · recipes [40,140] · rank [3,5] · weekendRatio [1.4,2.5] · summerWinterRatio [1.6,4] · lateSpendRatio [.3,.85] (중앙값, 밖이면 exit 1) |
| `serve-dist.mjs` · `shot.ts` · `gallery.mjs` · `scene-sample.mjs` · `build-identity.ts` | no-store 정적 서버 5178 / 11 라우트 스크린샷(판정 없음) / 도트 갤러리 한 장 / 표본 파크 / `sourceDigest`(git ls-files sha256) → `/__wp_build` |
| `prerender.ts` + `prerender/{index.html,main.ts,models.ts,palette.ts}` | three.js 원시 도형 빌더 36 → 오소 요 45°·피치 30° → 툰 3단 → CPU 후처리(깊이 실루엣 외곽 `--px-ink`·크리즈 ×0.62·`--px-*` 최근접 양자화·간판 6×6 합성) → 94×2 facing 선반 패킹 → `public/assets/fac-atlas.png/json` |

---

## 3. 계약·불변식 목록 (코드가 지키는 것)

| # | 규칙 | 어디가 지키나 |
|---|---|---|
| C1 | sim 은 phaser/render/ui/assets/save 를 import 못 한다 | `eslint.config.js` `no-restricted-imports` · `invariants.test.ts`(probe 파일로 규칙 발화 확인. ⚠ `save/` 는 규칙만 있고 probe 없음) |
| C2 | sim 에 `Math.random/Date.now/performance.now/new Date` 없음 | 같은 파일 `no-restricted-properties/syntax` |
| C3 | RNG 8 스트림은 `game.ts:248` 에서 **한 번** fork, 뽑기 횟수는 결과와 무관하게 고정(심사 3회 · 입고 6회 · 랜덤 이벤트 2회 · 날씨 1회) | `cert.ts`·`shop.ts`·`random-events.ts` 주석+테스트 |
| C4 | 골든: 3시드×16일 `{hash, visitors}` 고정 + 같은 시드 2회 동일 + 스냅샷 왕복 후 계속 = 무왕복 | `golden.test.ts` |
| C5 | 스냅샷 왕복 = `toSnapshot()` 바이트 동일 (100 tick 뒤) · 하루 누적치는 `dayAccum` 에 넣어야 왕복 골든이 산다 | `save.test.ts`, plan §3 G19 |
| C6 | 데이터 회귀: `cost/pop ∈ [60,140]`, `maint ≈ pop×5.3±30%`(슬라이드 7.2), 식당 `menuSlots 5`, 소원 213 조건 kind ↔ `evaluate` switch, 해금 그래프 도달성, 상점이 모든 shop-unlock 을 정확히 1회 | `data.test.ts` |
| C7 | 정적 게이트 S1~S9 + `--selftest` 음성 대조군 10종 | `check-ui.mjs` |
| C8 | 패널은 한 번에 하나(등록 안 하면 배타), 모달 열림 중 `open()` 은 false, `anyOpen` = 시간 정지 | `panels.ts`, `main.ts:394 flowTick` |
| C9 | 모달 ≤ 1/실시간 분 — 초과는 토스트/인박스로 강등. 허용 모달 = 결산·엔딩·심사 결과·랭크업 | `InterruptBudget`, `main.ts:333 consumeFx` |
| C10 | FX: 등록부 밖 tween 금지(S9), 동시 ≤12, 700ms 합치기, reduced-motion 이면 움직임만 빼고 숫자 남김, `fxFired` 로 「슬롯이 돈다」 측정 | `fx/registry.ts` |
| C11 | 손님 텍스처 키의 **무드는 마지막 세그먼트**; 체형·튜브는 첫 세그먼트 `:kid`·`:f3` | `draw/guest.ts:22`, verify G9 |
| C12 | 하네스 URL `?debug=1&px=1&fresh=1&kit=0&tut=0`(`verify.ts:18`) — `px=1` 없이는 픽셀 검사가 조용히 통과, `tut=0` 없이는 결산 모달이 뒤 절을 죽인다, `kit=0` 은 빈 판(G25 절만 킷). 추가: `freeze=1`(시간 정지 시작)·`seed=N`·`atlas=0`. evaluate 안 백틱/이름 있는 함수 금지, 멀티터치는 CDP | `verify.ts` 머리말 |
| C13 | 홈 컨트롤은 **정체**(`#hud-save·#hud-info·#hud-menu·.ksquare×5·#hud-ticker`)로 잰다, 개수 아님 | `verify.ts:79 HOME_IDENTITY` |
| C14 | 봇 밴드 8개 중앙값 안 (§2.7) — `gate gN≥10` 에서 강제 | `tools/bot.ts:17` |
| C15 | `features.json` OFF 축은 sim 이 명령에서 거절, UI 는 숨김, 하네스만 `__wp.features` 로 켠다 | `game.ts:755…`, `main.ts:247` |

**`window.__wp`** (`main.ts:469-519`, `?debug=1`): `game`(라이브) · `newGame(seed)` · `skip(n)`(step+consumeFx+refreshHud+sync) · `flow{acc,speed,frozen}` · `TPD`(=1680) · `JUDGE_TICK` · `features` · `stats()` · `frameMs[]` · `fxFired` · `calendarCount` · `scene` · `camera` · `phaser` · `hud` · `provider` · `panelHost` · `interruptBudget` · `dock`(PoolEditDock) · `place`(PlaceDock) · 창 17개(`buildWin snsWin certWin rankWin shopWin menuWin cookWin investWin campaignWin mainMenu endingWin inboxWin poolInfo results resultsCtl rankingsWin staffWin guestInfo facilityInfo`) · `tutorial` · `speak` · `refreshHud` · `facilityDefs` · `sfx` · `bubbles` · `assetVersion` · `grid`(⚠ 부팅 시점 것 — `newGame` 뒤 낡음) · `build`.

---

## 4. 빠지 타이쿤 이식 노트

### 4.1 대응표

| 워터파크 | 빠지 타이쿤 대응 | 판정 | 비고 |
|---|---|---|---|
| `clock.ts` (tick 125ms · 하루 1,680 tick · 4일 계절 · 128일 종료) | `sim/kairo/week.ts` `WeekRunner begin/step/finish`, `TICKS_PER_DAY 120`, `TICK_MS 200`(`main.ts:2002`), 주 단위 결산 | **충돌** | 하루 구조가 다르다(12시간 시계 vs 120tick 낮). 시계·계절 구조는 안 옮긴다 — 단, `seasonOf/isWeekend` 같은 순수 함수는 참고 |
| `grid.ts` 64×48, 게이트 **아래 변 중앙**, `LAND_BY_RANK` | `terrain.ts` **96×72**, 입구 **위쪽**(`CITY_BAND 8` 아래 `ENTRY_I`), `progress.landRect(grade)` | 충돌 | 좌표 상수는 전부 부모 것. 도시 띠·높이(`levels`)·지면 플래그 넷은 워터파크에 없다 |
| `rng.ts` fork(salt 1..8) | `sim/rng.ts` fork, `WEEK_RNG_SALTS{weather 0x57ea7,…}`·`CARD 0xca7d`·`COMMISSION 0xc0f5`·`PERSONA 0x9e0` | 그대로(API) | 클래스는 사실상 같다(`range` vs `float`, `setState` 유무). **새 스트림마다 새 salt + 세이브 optional 필드** — `forkWeekRngStreams` 와 v8 `weekRngStreams` 선례 |
| `pool.ts`+`pool-state.ts`+`color.ts`+`scent.ts` | `sim/kairo/swim.ts`(수영 구역 = `pool_water` 덩어리 4칸+, **저장 안 함**, `ZONE_HANDLE_BASE`) — 색·향·온도·SE/AB 없음 | **이식 1순위** | 워터파크 `Pool` = 빠지 `SwimZone` 에 `items/likes` 를 얹은 것. `poolState(pool, ctx)` 는 순수 함수라 그대로, `PoolContext.adjacent` 만 빠지 `placement.adjacentTo` 로 |
| `condition.ts` 22 kind + `ConditionWorld` | `progress.ts evaluateCondition` 14 kind(의뢰·심사·인증·소원이 공유) | 병합 | 워터파크는 `progress 0..1·actual·need·label` 을 내고 `world` 인터페이스로 격리돼 있다 → 빠지 `evaluateCondition` 을 이 모양으로 넓히고 `pool*`·`likes`·`friends`·`areas` kind 를 추가. `data.test` 의 「모든 kind 가 switch 에 있다」 검사를 같이 |
| `sns.ts` (글·좋아요·지역·친구 71·소원 3단·선물) | `wishes.ts WishStore`(인물 8, `REGULAR_CHARACTERS` 민지·수연, 소원 EXP 유형 집계) · `kairo-ticker.ts FeedKind review`(Q9 손님 말) · `progress.Reputation` | 이식 2순위(신규 축) | 빠지의 「평판 = 퇴장 만족도」는 유지. **좋아요는 `reputationPull`(수요)** 에 물린다 — CLAUDE.md 「다음 할 일 3」이 남긴 바로 그 축 (워터파크 G33 `arrivalPerLike/arrivalLikesCap` 이 그 배선). 친구 71 은 빠지 인물 8 사슬과 **합치지 말고** 지역 축으로 병렬 |
| `cert.ts` (24종 · 봄/가을 · 3심사위원 ±1 · 부분 점수 · 예상 점수) | `exam.ts`(승급 심사, `EXAM_COOLDOWN_WEEKS 4`, **무작위 금지** K42) · `certs.ts`(사이드 인증 12, `effectiveGrade`) | 적응 | 빠지 사이드 인증에 「심사 창·부분 점수·예상 점수·`requires` 사슬」을 얹는 형태. ⚠ `JUDGE_BIAS ±1` 은 K42 「판정에 무작위 금지」와 충돌 — **편향 0 또는 연출 전용** |
| `rank.ts`+`ranks.json` ★0~5 | `progress.GRADES` 5등급(`kairo-unlocks.json`) + `gradeFor/nextGrade/GRADE_HYSTERESIS` | 그대로(부모) | 안 옮긴다. 워터파크 `rankReady(def, eval)` 가 조건 DSL 을 쓰는 점만 참고 |
| `shop.ts` (17:00 입고, `shop` 스트림 6회 뽑기) | `shop.ts`(무상태, **뽑기 0회** 해시 창, Q3) | 충돌 → 안 옮김 | 빠지가 명시적으로 「뽑기를 안 쓴다」로 정했다 |
| `campaign.ts`·`invest`(game.ts 인라인) | `commission.ts`(publicity → `modifiers`), 해금 = `isUnlocked`(K41) | 안 옮김 | 같은 자리를 수배가 이미 차지 |
| `cooking.ts`+`restaurant.ts` (재료 2~5 다중집합·Lv 1~10·5칸·궁합) | `menu.ts MenuStore`(재료 쌍·사슬 2단·슬롯 1→2→3·`ingredientTaste`) | 충돌 → 보류 | 레시피 모델이 다르다(2쌍 vs 다중집합). 옮길 만한 것은 **요리 레벨 EXP → 맛/인기 배수**(G33) 하나 |
| `calendar.ts`+`calendar.json` 24 | `commission.ts advanceTo`·`arrivalQueue`(`ARRIVALS_PER_DAY 2`, `main.ts:1665`) | 적응 | 「정해진 날·시각에 오는 선물」은 빠지에 없다. `dueEvents` 는 순수 함수 → `arrivalQueue` 에 넣으면 끝 (효과는 due tick 에, 연출은 아침에 — P4 규칙) |
| `story.ts` `StoryDirector` (strip 비트 19) | `meta.ts OnboardingStore` 8단 + 상태 밴드 화자(Q8) | 적응 | 빠지 채널은 **셋**(모달=축하·티커=뉴스·토스트=대답). 워터파크 `strip` 은 넷째 채널 → 빠지에선 **상태 밴드 화자 줄**로 매핑, 새 채널 금지 |
| `lines.ts` 첫 방문 대사 | `voice.ts guestVoice`(저장 0) | 그대로 | 같은 규칙(해시·필드 0) |
| `events.ts Inbox` + `InterruptBudget` | `kairo-ticker` 알림함(세션 50건, 저장 안 함) + `arrivalQueue` 하루 2건 | 부분 | 빠지는 「하루 2건」, 워터파크는 「분당 1건」 — 단위가 다르다. `InterruptBudget` 클래스는 verbatim 가능하나 **둘 다 두지 말 것** |
| `guest.ts` FSM 10상태 · hp/sat · climb/ride · carry/eat · float 6 · kid/old | `guests.ts` `GuestState 5`·`GuestPose 7(idle walk swim float sit lie ride)`·`GuestMark`·`rideFrom`·`enterFacility/leaveFacility`·`satisfaction` | 적응(필드 추가) | 두 손님 모델을 합치지 않는다. 빠지 `Guest` 에 `hp·float·build·carry` 필드와 `climb/ride` 를 **추가**하고 `rideFrom` 복원(K52 「들어온 자리는 하나」)을 지킨다. `GuestHooks` 패턴은 빠지 `week.ts` 가 콜백으로 이미 함 |
| `nav.ts` BFS | `flow field`(시설별 거리장, K 다수) | 그대로(부모) | — |
| `facility.ts` (`se/ab/sprays/heat/scent/hpDelta/slide{levels,length}`) | `placement.ts`(1,653줄)·`kairo-facilities.json` 75종(`capacity/fee/charge/specialties/upgradeRequires/facings/slots`) | 데이터 필드 추가 | 풀 인접 효과 6 필드를 빠지 JSON 에 **optional** 로 (불변식 3). 슬라이드 활강로는 빠지 `exitTile` 과 그림 불일치가 이미 기록됨(CLAUDE.md 다음 할 일 2) |
| `endgame.ts` 점수·NG+ `Carryover` | `meta.endingMilestone`·`kairo-career.ts CareerProfile v2` | 적응 | 이월은 경력 profile 에 optional 필드 |
| `staff.ts`·`random-events.ts`·`rivals` (flag OFF) | `staff.ts`(5역·임금)·`cards.ts`(27)·— | 안 옮김 | PSS 에도 없고 빠지가 자기 것을 갖고 있다 |
| `startkit.ts` | `startkit.ts`(K30/K40) | 그대로(부모) | 같은 사상(「물려받는다」, `inherited` = `blocks-*` 우회) |
| `bot.ts` 성향 4(판당 1회) · `--bands` 8 · `--sweep` | `kairo-sim.ts SimPersona 4`(`PERSONA_RNG_SALT`) | **밴드 러너만** 이식 | 빠지에는 「밴드 밖이면 exit 1」 게이트가 없다 — `--bands` 개념을 `kairo-sim` 에 |
| `render/scene.ts` | `KairoScene.ts`(3,580) | 안 옮김 | 씬은 부모 것. 옮길 조각: `drawCoping`(코핑 4비트 마스크) · `drawLanes` · `setIllumination` · `snapshotAt`(썸네일) · `setPoolColors`(무지개 HSV) |
| `fx/registry.ts` 20 | `render/kairo/fx.ts` 7 (`FX_REGISTRY`, `playFx(host,name,target)`, `MERGE 700`, `MAX_LIVE_FLOATS 10`, `Z_FLOAT 8`) | 병합 | **같은 계약**(이름 한 줄 + 구현 한 줄). 13종을 빠지 등록부에 추가. 상한 10 vs 12 · `fxFired` 카운터는 빠지에 없다 → 같이 |
| `fx/sfx.ts` WebAudio 12큐·BGM 4·징글 3 | `audio/SilentAudio` + `cues.ts` 17큐(`MusicId bgm/summer\|offseason`), 호출부 21곳 | **이식 3순위** | CLAUDE.md 「다음 할 일 1」(소리 0) 의 답이 여기 있다. `Sfx` 를 `WebAudioBus implements AudioBus` 로 감싼다(큐 이름 매핑 표 필요) |
| `ui/panels.ts` | `ui/panels.ts`(부모가 원본, `InputSurface 6`) | 그대로(부모) | 두 PanelHost 를 같이 두지 말 것. 워터파크 쪽 추가분 = `InterruptBudget` 뿐 |
| `ui/window.ts` 5색조 · `.kwin/.kscrim` | `.ksheet/.kover/.kcourse` 표면 셋 + `--sheet-head 58` | 충돌 → 안 옮김 | 빠지 「표면 셋」 결정이 우선. 창 색조(tone)는 토큰 5개로 흡수 가능 |
| `results.ts`(Day/PeriodReport 그대로) | `kairo-report.ts`(1,027, `WeekReport` 권위 장부, 순서 고정 K59/P8) | 안 옮김 | 시즌/연말 TOP3·수상 줄만 `WeekReport` 필드로 |
| `style.css` 237 토큰 | `style.css` 4,657줄(`--sk-*/--panel-*/--risk-*`, 대비 27쌍, `--bottom-stack`) | 토큰 이름 충돌 | `--px-*`(44)·`--pool-*`(13)·`--float-*`·`--guest-*` 는 빠지에 없다 → 그대로 추가 가능. `--tap/--fs-*/--dur-*` 는 이미 같다. `--fx-*/--tile-*` 은 **이름 충돌 검사** 후 |
| `save.ts` v2 통째 스냅샷 | `save/kairo.ts` v8 + 마이그레이션 7단 | 부모 규칙 | 새 필드는 **optional·마이그레이션 없음**(`visitorsTotal` 선례). 격자가 다르니 워터파크 스냅샷은 절대 그대로 못 읽는다 |
| `tools/verify.ts` 114절 `__wp` | `tools/verify-kairo.ts` 457절 `__kairo` | 절만 옮김 | 같은 뼈대(Chrome·393×852·CDP). 이식한 절마다 `__kairo` 에 표면을 판다 |
| `check-ui.mjs` S1~S9(14쌍) | `check-ui-surface.mjs`(27쌍 + 패널 등록 + 레시피) | 부모 규칙 | 새 토큰 쌍은 부모 `PAIRS` 에 |

### 4.2 숫자가 갈리는 곳 (옮길 때 반드시 환산)

| 축 | 워터파크 | 빠지 | 환산 |
|---|---|---|---|
| tick | 125ms, 하루 1,680 tick(8~20시, `TICK_SCALE 2.33`) | 200ms, 하루 120 tick, 주 840 | 하루 비율로 **×0.071**. `swimTicks 93→≈7`, `EAT_TICKS 12→<1`, `DRIFT_EVERY 31→2`, 이모트 40→3. **하루-분율**로 다시 적고 `useTicks` 는 데이터 「분」이 아니라 빠지 `useTicks` 눈금으로 |
| 아이템 지속 | `hours × TICKS_PER_HOUR`(`game.ts:1038`) | 시간 개념 없음 | 「N일」로 바꾼다 (하루 120) |
| 격자 | 64×48, 게이트 아래 | 96×72, 입구 위(도시 띠 8줄) | 좌표 상수 0 재사용. 워터파크 64×48 은 빠지 K36 **이전** 격자 — v3→v4 마이그레이션 선례 |
| 돈 눈금 | G, 시작 12,000, 티켓 200 | ₩ 1/10 눈금, 시작 500만, 입장료 3,800 | 비율로 재라(K36-B②: 「기존 중앙값과 비율을 먼저」) |
| 손님 상한 | `40 + 12·rank` | `maxGuests` 등급 40~230 + 인증 140 | 부모 값 |
| RNG salt | 1..8 | 해시형 | 새 salt 를 고르고 `RNG_SALTS` 표에 적는다 |
| 세이브 | v2 | v8 | optional 필드만 |
| 심사 | 3심사위원 ±1 무작위 | 판정 무작위 금지 | 편향 0 |
| 모달 예산 | 분당 1 | 하루 2(`ARRIVALS_PER_DAY`) | 하나만 |
| 대비 검사 | 14쌍 | 27쌍 | 부모 목록에 추가 |

### 4.3 충돌 (둘 중 하나를 골라야 하는 것)

1. **패널 시스템 둘** — `PanelHost` 는 같은 코드지만 표면(`UiSurface 5` vs `InputSurface 6`)과 컨테이너(`.kwin` vs `.ksheet/.kover`)가 다르다. 빠지 것을 쓴다.
2. **FX 등록부 둘** — 계약이 같으므로 **이름을 합친다**(빠지 7 + 워터파크 13 = 20). `MAX_LIVE` 는 10 유지, `fxFired` 추가.
3. **손님 모델 둘** — 워터파크 FSM 10 상태를 빠지 5 상태 위에 **포즈·필드로** 얹는다. `GuestStore` 교체 금지(flow field·슬롯·`rideFrom`·마크 3개 규칙이 전부 거기 있다).
4. **시간 모델** — 워터파크 시계는 안 옮긴다. 워터파크의 「17:00 입고·주말 15:00 심사」 같은 시각 훅은 빠지 「하루 tick N」으로.
5. **계절** — 워터파크 계절 FX/BGM 은 계절이 **바뀌어야** 산다. 빠지 `main.ts:1739` 는 `season` 상수(K 문서가 「별건의 결함」으로 기록) — 계절 이식 전에 그 결함부터.
6. **요리** — 레시피 모델이 다르다. 통째 이식 금지, 레벨 EXP 만.
7. **상점·투자·캠페인·직원·랜덤 이벤트·라이벌** — 안 옮긴다 (빠지가 자기 축을 갖거나 PSS 에 없다).

### 4.4 권장 이식 순서

| 순 | 묶음 | 왜 이 자리인가 | 빠지 쪽 착지점 |
|---|---|---|---|
| ① | `pool-state`+`color`+`scent`+아이템(`items.json`·`seasons.json`) | 순수 함수 · 저장 0 · 렌더 0. 빠지 수영 구역(S1~S4)이 「반쪽」(CLAUDE.md 다음 할 일 5)이라 **가장 큰 빈 자리** | `swim.ts` 구역에 `items/likes` · `placement.adjacentTo` · 시설 JSON 에 `se/ab/sprays/heat/scent` optional |
| ② | 조건 DSL(`condition.ts`) | ①의 상태를 **묻는 언어**. 의뢰·심사·인증·소원이 이미 `evaluateCondition` 하나를 쓰므로 kind 를 넓히면 넷이 같이 는다 | `progress.ts` 에 `Verdict` 모양 + `pool*/likes/friends` kind, `data.test` 의 kind 전수 검사 |
| ③ | SNS·좋아요·지역·소원(`sns.ts`) | 빠지의 **수요 축 공백**(후반 45%) 에 좋아요를 꽂는다. 조건 DSL(②) 이 소원 판정기 | `reputationPull` 에 `likes` 항 · `FeedKind review` 에 글 · `목표` 화면 섹션(새 화면 금지) |
| ④ | 인증(`cert.ts` 심사 창·부분 점수·예상 점수·`requires` 사슬) | ②③ 위에서 「무엇이 부족한가」를 보여 주는 층. 빠지 인증 12 에 무대·예상 점수만 얹는다 | `certs.ts`·`kairo-exam.ts examItemView`, 무작위 0 |
| ⑤ | 손님 생활(climb/ride·float 6·lie/sit·carry/eat·kid/old·HP 배터리) | 렌더가 처음 붙는 단계 — 앞 넷이 sim 뿐이라 골든이 안 흔들린 뒤에 | `guests.ts` 필드 + `KairoScene` 포즈, `guest-life.test` 이식 |
| ⑥ | 계절 FX(`petal/leaf/fireworks/lamp`)·소리(`sfx.ts` → `WebAudioBus`) | 등록부 계약이 같아 「이름 한 줄」. 소리는 슬롯이 이미 있어 한 줄 교체 — 단 §4.3-5 계절 결함 뒤 | `fx.ts FX_REGISTRY`·`audio/index.ts` |
| ⑦ | 결산 TOP3·수상 줄·스토리 비트·엔딩 점수/NG+ | 표현층·후반. `WeekReport` 순서를 안 바꾸는 범위에서 | `kairo-report.ts` 뒤쪽 블록·상태 밴드 화자·`CareerProfile` |

각 단계는 빠지 게이트(`npm run verify`·`verify:kairo`·`sim:kairo --seeds 12/24`)를 그대로 통과해야 하고, 골든이 흔들리면 「뽑기 횟수」부터 의심한다(K36-B③).

---

## 5. 문서 리뷰 결과

### 5.1 정본 표

| 무엇 | 정본 | 비고 |
|---|---|---|
| 워터파크 goal 이력·결정 | `docs/plan-waterpark-clone.md` §3 | §1 조사·§2 계획은 **G0 시점 청사진** — 아래 5.2 |
| G25~G32 근거·결정 | `docs/plan-waterpark-v2.md` | |
| 페이싱·기능 스위치 근거 | `docs/research/kairo-mainsystem-2026-09-03.md` | G22 결정의 출처 |
| G32 뒤 부족분 | `docs/research/waterpark-gaps-2026-09-03.md` | 권고 1(요리 레벨·좋아요 유입)은 G33 으로 착수됨 |
| 도트 스타일 계약 | `waterpark/docs/pixel-style.md` | ⚠ 색인에 없었다 → 이번에 추가 |
| 실기 목록 | `waterpark/docs/human-check.md` | 0/25 |
| 플레이·검증 명령 | `waterpark/README.md` | 숫자 낡음(5.3) |
| 상수·규칙 | **코드** (`clock.ts`·`balance.json`·`features.json`·`tools/bot.ts BANDS`) | 문서 숫자와 갈리면 코드가 이긴다 |

### 5.2 `plan-waterpark-clone.md` §2 vs 실제 코드

- **§2.1 파일 맵은 G0 청사진이다** — 없는 파일: sim `pool-items·slide·spawn·invest·economy·balance·snapshot`, render `textures·guest-sprite·bubbles·cursor·input·fx/ambient·fx/dom-fx`, assets `draw/{pool,slide,decor,fx,icons}`, ui `windows/{day-summary,system,newgame}·overlays/{toast,strip,dialog}`, data `strings.ko.json`. 대신 생긴 것: sim `pool-state·weather·lines·story·staff·random-events·startkit·bot·endgame`, assets `pix·fac-sprites·emote·portrait·sprites/*`, ui `windows/{results,rankings,staff,place,menu}·strip·bubbles`, data `story·events·gifts·staff·rivals·features`, tools `gallery·prerender·scene-sample·serve-dist`. → §2.1 머리에 「G0 청사진, 실측은 `waterpark-port-guide.md` §2」 한 줄 권고.
- **§2.2 숫자**: `TICKS_PER_DAY 720 → 1680`(G22) · intensity `4√size → 2√size`(`color.ts:41`) · SNS 상수는 `balance.json` 이 아니라 `sns.ts:65` 하드코딩 · `AmbientName/DomFxName` 세 종류 등록부 → 실제는 `FxName` 하나 · 사운드 「15큐」 → 12큐+BGM 4+징글 3.
- **§2.3 DSL**: `facilityOnPool`·`item.active`·`pool.tile` 없음, `facilityClass` 추가 (gaps 문서 B 와 일치).
- **§2.5 표**의 G3 「시설 ~30」·G10 「식당 26」 등은 계획값 — 실측은 §2.2 (94·26).

### 5.3 낡은 문서·주석 (파일:줄 · 주장 → 실제)

| 위치 | 주장 | 실제 |
|---|---|---|
| `waterpark/README.md:13` | `g13` = 「전 goal 누적」 | 하네스는 G33 까지, gate 는 id 목록 없이 숫자 문턱 |
| `waterpark/README.md:29`, `tools/gallery.mjs` 주석 | 시설 **91** | `facilities.json` **94** (G30 호화 3종) |
| `waterpark/README.md:24-25` | URL 스위치 5개 | `?kit=0`·`?atlas=0` 누락 |
| `docs/README.md:30` | `plan-waterpark-clone.md` = 「§2.5 goal G0~G13」 | §3 이력이 G32 까지 (G33 진행 중) |
| `waterpark/docs/human-check.md:3` | gate g32 = vitest 207 초록 | 이 트리에서 **207 통과 / 2 실패**(`g30.test.ts` 후반 지출 비율 · `lines.test.ts` 달력 24/24) — G33 동시 작업의 여파로 보인다. 확인 필요 |
| `src/sim/clock.ts:12` | `// 720` | 1,680 |
| `src/sim/game.ts:810` | 「720 tick 마다」 | 1,680 |
| `src/sim/cert.ts:5`, `game.ts:60` | 재통과 = 돈만, 「재료는 G7」 | `game.ts:387-392` 돈 **+** `cert` 스트림 재료 1개 |
| `src/sim/pool-state.ts:22` | `indoor` 「G8 까지는 항상 false」 | `Game.poolIndoor()`(`game.ts:629`) 가 파생, `paintIndoor` 존재 |
| `src/data/schema.ts:58` | `useTicks` 「1 tick = 게임 1분」 | `TICK_SCALE`(2.33) 로 환산(`guest.ts:385`) |
| `src/data/schema.ts:97` | `expiresTick = now + hours·60` | `hours × TICKS_PER_HOUR`(140, `game.ts:1038`) |
| `src/sim/game.ts:934` | **사용자에게 보이는** 모달 본문 「점수 산출은 G11 에서」 | `endgame.scoreOf` 있음 — 문구가 페이즈 이름 |
| `src/sim/pool.ts:6` | PoolStore 가 색·향·온도를 「다시 센다」 | `pool-state.ts` 가 센다. `PoolStore.state()` 는 자기 테스트만 씀 |
| `src/save/save.ts:2` | 「지금은 v1 뿐이다」 | v2 + 마이그레이션 1단 |
| `src/assets/manifest.json` `guest/body` | 14×24 앵커 (7,22) | `draw/guest.ts` 18×32 (9,30) |
| `src/sim/guest.ts:2` | FSM 요약 5상태 | L16 은 10상태(맞음) |
| `plan-waterpark-clone.md` §3 | G33 절 없음 | `g33.test.ts`·verify G33 절 존재 |

### 5.4 색인 수정 (이번에 한 것)

`docs/README.md` 에 두 줄 추가: `waterpark/docs/pixel-style.md`(빠져 있었다) · 이 가이드. 그 밖의 워터파크 문서 5건은 이미 있었다.
⚠ 워터파크 줄 넷+둘이 「붙임」 절 아래 목록으로 붙어 있다 — 정본 표(§1)로 올리는 편이 읽는 순서에 맞는다 (이번엔 줄만 더했다).

---

## 6. 이식 전 정리 권고 (작은 것)

1. **`waterpark/` 를 커밋할 것** — 전체가 untracked (`git status` `?? waterpark/`). 워크트리가 옮겨지면 통째로 사라진다. `waterpark/.gitignore` 없음(루트 `tmp-shots/` 규칙에 기대고 있다), `dist/`·`node_modules/` 는 루트 규칙 확인.
2. 낡은 주석 12건 — §5.3 표 그대로 (`clock.ts:12`·`game.ts:810`·`cert.ts:5`·`game.ts:60`·`pool-state.ts:22`·`schema.ts:58,97`·`game.ts:934`(사용자 노출)·`pool.ts:6`·`save.ts:2`·`manifest.json`·`README.md:13,29`).
3. **안 쓰는 schema 필드** — `FacilityDef.season`(94종 전부 있으나 읽는 곳 0, `data.test.ts:137` 길이만) · `FacilityDef.shopPrice`(런타임은 `ShopEntry.price`, `data.test.ts:716` 대조만) · `FacilityDef.indoorOnly`(참조 **0**, 전부 false) · `CalendarEvent.from` · `TileDef.look` · `ItemDef/GiftDef.unlock` 의 `'start'` 외 값. 지우든지 배선하든지(gaps 권고 4 는 배선 쪽).
4. 중복 상수 — `cert.ts:18 CONSOLATION_MONEY`(미사용; `game.ts:61 CONSOLATION` 이 산다) · `pool.ts:39 PoolState` + `PoolStore.state()`(`pool.test.ts:52` 만) 이 `pool-state.ts PoolState` 와 이름 충돌 · `ui/windows/pool-edit.ts:176` 실내 비용 `tiles×40` 을 UI 가 계산(`game.ts INDOOR_COST 40` 과 두 벌) · `sns.ts:65 SNS_DEFAULTS` 는 `balance.json` 으로.
5. 빈 폴더 `src/ui/overlays/` 삭제.
6. `tools/verify.ts:752` 가 없는 `scene.staffCountForTest` 를 부른다(−1 폴백) — 표면을 파거나 절을 지울 것.
7. `main.ts` `__wp.grid` 가 부팅 시점 `game.grid` — `newGame` 뒤 낡는다. getter 로.
8. `render/scene.ts:569` `rebuildAmbient()` 가 매 프레임 호출(개수 변경 분기와 별개로). 풀 100+·시설 150 에서 프레임 예산을 먹는다.
9. `invariants.test.ts` 에 `save/` import probe 가 없다 — 규칙은 있으나 「실제로 잡히는지」는 미검증.
10. `docs/plan-waterpark-clone.md` §3 에 G33 절 추가, §2.1 머리에 「청사진」 표시, `docs/README.md:30` 의 「G0~G13」 갱신.
11. 하네스가 잰 `verify 107절`(human-check) → 지금 114절 — G33 절이 붙는 대로 `human-check.md:3` 숫자와 실패 2건 재확인.
