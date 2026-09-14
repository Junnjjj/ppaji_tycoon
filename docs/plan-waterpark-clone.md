# 워터파크 스토리(Pool Slide Story) 클론 — 조사 + 구현 계획

> 작성 2026-09-02. 사용자 결정: **새 폴더에 새로 만든다.** 기존 빠지 타이쿤 시스템(주간 결산·카드·수배·직원·등급 심사·콤보·5지표)은 가져오지 않는다.
> 목적: 카이로소프트 *Pool Slide Story*(한국어 스토어명 **워터파크 스토리**, 일본어 常夏プールパレス, 2017-12)의
> 시스템·UI·VFX 를 **어디까지 모방할 수 있는지** 본다. 에셋은 대충 그려도 된다.

---

## 0. 조사 출처와 신뢰도

| 출처 | 무엇을 줬나 | 신뢰도 |
|---|---|---|
| kairosoft.wiki.gg — Pool Slide Story / Facilities / Pool / Certification / Customers / Recipes / Compatibilities / Endgame / Tips / Manual(24절) | 시설 전표(비용·인기·유지비·해금 조건) · 인증 24종 표 · 손님 71명 표(지역·취향·소원 3단·해금 사슬) · 색/향 계절표 · 엔딩 점수식 · 매뉴얼 절별 규칙 | **1차(표는 그대로 인용 가능)** |
| Steam 도전과제 가이드 | 랭크 0~5성 · 요리 레벨 10 · 무지개 = 8색 등량 · 머니 향 출처 | 2차 |
| 리포 기존 문서 `docs/research/pss-facilities-systems.md`, `pss-menu-requests.md`, `pss-hermes-research.md`(Steam 리뷰 214건), `art-reference/competitor/README.md`(실측) | 밸런스 회귀(비용/인기 ≈ 90 · 유지비 ≈ 인기×5.3 · 슬라이드 7.2) · 궁합표 구조(165행×26열) · SNS 3탭 구조 · 화면 스케일 실측(타일 32×16텍셀 · 손님 22.8텍셀 · 화면당 40타일 · 손님 밀도 2% · 말풍선 ≤3) · 부정 리뷰 4항목 | 1차 + 실측 |
| App Store KR / 나무위키 검색 | 한국어 표기: 워터파크 스토리 · 풀장 심사 · SNS 친구 · 요리 개발 · 8년차 겨울 종료 | 2차 |

**못 구한 것** (구현 때 우리가 정한다): 풀 아이템(딸기·초콜릿·파인애플…)별 지속시간·색·향·온도 수치 **전표**(검색 스니펫으로 「딸기 3시간·핑크·베리·−2」「초콜릿 3h·쿠키·+4」「파인애플 4h·노랑·트로피컬·+2」 정도만) · SE/AB(인접 보너스) 배율 함수 · 강도(Intensity) 수치 · 랭크업 조건 숫자 · 투자(Attraction/Lounge Investment) 비용표 일부(1·2·3·4·5·6·11·12 만 확인: 3,000 / 5,000 / 3,000 / 7,000 / 9,000 / 10,000 / 15,000 / 20,000 G) · 캠페인 비용·쿨다운 · 하루의 실시간 길이. fandom 미러는 402 로 막혔다.

---

## 1. PSS 시스템 전모 (조사 결과)

### 1.1 시간·게임 흐름
- **1계절 = 4일**(평일 3 + 주말 1, 주말이 피크) · **1년 = 4계절 = 16일** · **8년차 겨울 끝에 본편 종료**(128일) → 점수 산출 → 이어하기 가능 + **뉴게임+**.
- 하루 안에 시계가 돈다(오전 개장 ~ 저녁 폐장. 「17시에 상점 입고」「주말 15시 심사」가 시계에 걸린다). 시간은 자동으로 흐르고 **스킵 없음**(빨리감기는 엔딩 보상).
- 매뉴얼의 게임 흐름: 풀·식당·놀이시설을 짓고 **손님 소원을 들어주는 것이 성장의 원동력** → 랭크(0~5★) 상승 → 5★ 워터파크가 목표.
- 사건 채널: 손님 SNS 글(좋아요) · 소원 메시지 · 사장(President) 선물 이벤트(특정 연·계절·요일에 도구/시설 증정) · 심사 결과 · 랭크업 · 상점 입고. 다수가 **팝업**이라 부정 리뷰 1위가 팝업 과다.

### 1.2 화면·UI 구조 (실측 + 위키)
- 지도가 화면을 채운다. **상단 얇은 띠(자금·날짜·시계·인기)** + **하단 얇은 띠(메뉴 버튼)**. 하늘·지도 경계 안 보임.
- 메뉴(추정 구성, 카이로 공통 문법): **건설**(시설 카테고리 6종 탭) · **풀 편집**(타일 파기·아이템 넣기) · **SNS**(타임라인 / 메시지=소원 / 친구) · **요리**(재료 5개 선택 → 개발) · **상점 Pumpkin Products**(랭크별 입고, 17시 갱신) · **투자**(Attraction Investment 1~10 · Lounge Facility Investment 1~13 — 돈 내면 신시설 해금) · **캠페인**(광고·버스, 쿨다운) · **심사**(봄·가을 신청) · **정보/랭킹** · **시스템**.
- 손님 탭 → 말풍선/정보. 말풍선 동시 ≤3. 표정 있음(눈·입 1텍셀).
- 타일 32×16 텍셀, 화면 가로 40타일, 손님 키 ≈ 1.43 타일, 화면 손님 밀도 ≈ 2%.

### 1.3 풀(Pool) — 이 게임의 본체 (시설이 아니라 **상태를 가진 용기**)
- 풀은 **풀 타일**을 파서 만든다(Standard Tiles 100G/타일, 인기 4 · … · Kairo Tiles 400G, 인기 16 — 타일 13종은 전부 **인증 보상**). 타일로 이으면 **하나의 풀로 합쳐진다**(아이템 공유, 20개 상한 우회 가능).
- 풀 상태 8개: **Size · Popularity · Maintenance**(기본 6G + 인기 비례) · **Color**(9색 + Rainbow) · **Scent**(12향 + Money) · **Intensity**(색·향 강도, 일부 인증 조건) · **Temperature** · **SE/AB**.
- **아이템(최대 20개)**을 넣어 색·향·온도를 바꾼다. 아이템은 **일정 시간 뒤 소멸**. 색은 섞이고(무지개 = 8색 등량: 레몬·사과·블루베리·복숭아·포도·자몽·멜론·키위), 향은 **아이템 + 인접 시설 중 가장 센 것 하나**.
- **계절 보너스**(0~5): 색 — Pink 5/0/0/0 · Blue 0/5/0/0 · Lime 0/4/0/2 · Green 2/4/0/0 · Yellow 0/0/0/4 · Purple 0/0/4/2 · Red 2/0/0/4 · White 2/2/2/2 · **Orange 0/0/0/0** · **Rainbow 5/5/5/5**. 향 — Citrus 2/4/0/0 · Floral 4/2/0/0 · Pine 2/4/0/0 · Fruity 4/2/0/0 · Tropical 0/5/2/0 · Berry 2/0/0/4 · Marine 2/4/0/0 · Cookie 5/0/2/2 · Spices 2/2/2/0 · Milky 0/0/2/4 · Coffee 0/0/4/2 · **Money 5/5/5/5**.
- **온도**: 맞지 않으면 손님이 빨리 나간다. 계절에 따라 온수/냉수 인기 요동. 인증 조건에 40°C+ / 20°C− 등.
- **SE**(좋아요 점수·햇빛·제트풀/핫텁) · **AB**(인접 시설 보너스 — 물 뿌리는 시설·풀에 착수하는 슬라이드) — 둘 다 **풀 크기에 비례**. 야외 풀은 여름↑ 겨울↓, 실내 풀은 계절 무관.
- 팁 문서의 악용: 「입구 앞에 1칸 풀을 파서 소원 채우고 철거」.

### 1.4 시설 6분류 (위키 전표 확보 — 표는 `kairosoft.wiki.gg/wiki/Facilities_(Pool_Slide_Story)`)
| 분류 | 개수 | 대표 행 (비용G/인기/유지비) | 해금 출처 |
|---|---|---|---|
| Utilities | 8 + 바닥 13 + 장식 22 | 화장실 800/12/60 · 샤워 600/12/60 · 분수 500/5/20 · 「이동」도구 200G(1년차 가을 첫 심사 뒤 사장 선물) · 장식은 **향을 가진다**(포토스 Pine · 화분 Floral · 커피나무 Coffee · 야자 Marine · 골든 카이로봇 Money 10,700G) + 계절 보너스 | 초기·상점 랭크 1~5·소원 보상·랭크 5 보상 |
| Pool 타일 | 13 | 100~400G · 인기 4~16 | 전부 인증 보상 |
| Lounging | 21 | 무료(데크체어 800/7/30 … 4인 테이블 9,000/73) · **유료**(이용료 300~1,200G/일, 카바나 12,400/92/490) | 상점 랭크·**Lounge Investment 1~13** |
| Restaurant | 26 | 자판기 500/12 · 빙수 600/16 · 크레페(사장 선물 3일차) · … · 초밥 2,000/67/360. 일부는 **향**(쿠키·과일·커피·스파이스) | 초기 4종·나머지 **소원 보상** |
| Attraction | 15 | 제트풀 200/3 · 핫텁 400/5 · 미니슬라이드 1,000/11 · 캐슬/코랄/아이스 슬라이드 2,400~3,300 · 3레인 7,200/67 · 이글루·사우나 · 꽃샤워(Floral)·머라이언·물고기분수 · 공연 카이로봇 6,900/75(Money) · 서프라이즈 소커 5,900/79 | 상점 랭크·**Attraction Investment 1~10**·소원 |
| Slide(대형) | 4 | Stripy 10,000/100/720 (2층·길이 8) · Blue 12,400/130/940 (3층·10) · Tree House 13,100/170/1,180 (3층·12) · Rocket 13,500/175/1,260 (2층·15) | 상점 랭크 3·투자 9·10·소원 |
- 밸런스 회귀: **비용/인기 ≈ 90 상수**, **유지비 ≈ 인기×5.3**, 슬라이드만 7.2. 즉 병목은 돈이 아니라 **공간**.
- 유료 라운지는 **하루 대여**, 손님이 식당에서 사면 라운지를 찾아 앉는다(휴식 = HP 회복).

### 1.5 식당·요리
- 식당당 **메뉴 5칸**, 카테고리 4(음료·스낵·식사·디저트) — **4종 다 넣으면 인기 보너스**.
- 레시피 **139~145종**(음료 ~35·스낵 ~40·식사 ~30·디저트 39 + 카이로봇 3). 요리는 **2년차부터**.
- **재료 최대 5개** 선택 → 개발(정답표 없음, 「섞어 보고 알아낸다」). 재료는 소모품이 아니라 **한 번 얻으면 영구 해금 키**. 출처 4: 소원 보상 · 인증 재수상(3개) · 연도 마일스톤 · 상점.
- 요리 스탯 3: **맛→HP 회복(체류)** · **외관→구매 빈도/양(현금)** · **인기→만족(평판)**. 가격은 스탯 합.
- **요리 레벨**: 개발 EXP → 레벨업 시 **기존 레시피 전부 스탯 상승** + 신레시피. 도전과제 「요리 Lv10」.
- **궁합표**(Compatibilities): 165 메뉴/재료 × 26 식당 = ⊚(인기 가산)/◯/△(인기 −50%). 「Tropical Fruit Juice」 만능, 「Vanilla Ice Cream」 후반 △.
- 식당 인기 = 시설 인기 + 걸린 메뉴 인기 합.

### 1.6 손님·SNS·좋아요·지역·소원 (자기증식 층)
- 손님은 **HP(체력)** 를 가진다: 풀·시설을 쓰며 만족을 얻고, 음식으로 HP 회복, 라운지에서 휴식, 다 쓰면 퇴장. 입장료를 낸다(손님별 **티켓 가격은 만족 레벨에 따라 오름**).
- **SNS 3탭**: **타임라인**(손님이 시설 사진을 올림 → **좋아요**; 플레이어도 좋아요 누를 수 있음) · **메시지**(소원 요청·보상) · **친구**(나이·성별·거주 지역·티켓가·만족·좋아하는 색/향/음식·최근 글).
- **친구 71명 / 10지역**: Residential 7 · School 7 · Forest 8 · Shopping 7 · Office 8 · Station 6 · Downtown 8 · Specialty 8 · Airport 8 · Kairo Island 4. **지역의 주민 좋아요 1,000 → 다음 지역 개방.** 새 친구는 앞 친구의 ★☆☆ 달성으로 초대되는 **사슬**.
- 친구마다 **소원 3개**(만족 ☆/☆☆/☆☆☆ 문턱). 조건은 셋 중 하나: **풀 상태**(「20타일+」「오렌지 풀」「32°C+」「야외+커피향」「좋아요 300+」) · **시설/아이템**(「크레페 가게」「빨간 튜브」「사우나」) · **요리**(「초코민트」「연어 초밥」). 보상 = **시설·재료·수영복/튜브·새 손님**(돈 아님). 총 ~213건.
- **선물**(수영복·튜브)로 만족을 올려 소원을 당길 수 있다 = 돈→진행 교환창.
- 좋아요는 인기·유입·심사 평가에 걸린다.

### 1.7 인증(풀 심사) — 봄·가을
- **신청 → 3일 준비 → 그 계절 주말 15시 심사**. 심사위원 3 × 10점 = 30. 합격선 **15/17/20/22/25**(만점 불필요, 부분 점수).
- **24종 8계열**(표 확보): Grade F~S(인기·풀 크기 20/30/40/50/80+·골든 카이로봇) · Color 3 · Scent 3 · Spa 2(40°C+·플로럴) · Fruit 3 · Stream 2(제트풀) · Fun Facilities 3(미니슬라이드 2 인접·3레인) · Cutesy 3(핑크·무지개·케이크샵). 같은 계열은 **아래 등급부터**. 보상 = **풀 타일 13종·튜브**, 재수상은 재료 3개.
- 조건은 집계 지표가 아니라 **배치 형태**(「핑크 풀 ×2」「인접 미니슬라이드 2」)라 파크를 **개조**하게 만든다.

### 1.8 랭크·상점·투자·캠페인
- **랭크 0~5★**: 조건 충족(인기·인증 횟수 등 — 숫자 미확보) → 랭크업 → **상점(Pumpkin Products) 신상품 + 호화 상품**. 5★ = 골든 카이로봇 보상.
- **상점**: 장식·라운지·놀이시설을 **건설비의 ~2.2배**로 판다(쇼핑 = 즉시). 17시에 입고 갱신.
- **투자**(Attraction 1~10 · Lounge 1~13): 3,000~50,000G 를 내면 새 시설 **종류 해금**(= 연구).
- **캠페인**: 광고·버스 → 인기·방문객 상승, **쿨다운**.
- 해금 출처 5개 명문: **사장(Judge) 선물 · SNS 친구 · 인증 · 투자(Research) · 랭크업**. 전부 「날짜가 있는 사건」으로 하루 중에 하나씩 도착한다.

### 1.9 엔딩·뉴게임+
- 8년차 4계절 끝 → **점수 = 인기×10 + 총방문×1 + 총좋아요×1 + SNS친구×10 + 인증합격×10 + 레시피×5**.
- 이월: 레시피+요리 레벨 · 해금 시설 **각 1개** · 수영복/튜브 · **손님 티켓가 ×0.3**. 미이월: 돈·재고·요리·식당·풀 타일·손님/지역.

### 1.10 복제하면 안 되는 것 (Steam 부정 리뷰 19건 공통 + 리포 기록)
1. 심사 재도전 대기(봄·가을만) + 실패 원인 불명 → **예상 점수·부족 조건 사전 표시**.
2. 소원이 완성된 풀을 부수게 함 → 프리셋 저장/복원, 소원을 **기간 한정**으로.
3. **팝업 과다**(1위) → 알림함 적재, 강제 중단 ≤ 분당 1.
4. 요리 비중 과다 → 물놀이가 주축.
(+ 배치 자유도 낮음 · 후반은 숫자 확장뿐)

---

## 2. 구현 계획

### 2.0 Context — 왜, 무엇을
- 지금 리포의 게임(강변 빠지 리조트)은 시스템·게임성 양쪽이 부족하다고 판단됐다. **PSS 를 그대로 카피한 느낌**의 게임을 새로 만들어, 시스템·UI·VFX 를 어디까지 모방할 수 있는지 본다.
- 사용자 결정(확정): **같은 리포의 새 하위 폴더 `waterpark/`** · 게임 시스템 **전부 새로**(주간 결산·카드·수배·직원·등급 심사·콤보·5지표 안 가져옴) · 시간 구조도 PSS 그대로 · **스택 + 순수 유틸만 복사** · **폰 세로 393×852 우선** · 에셋은 대충(절차 도형) · **goal 을 순서대로 쭉 수행**.
- 직전 세션의 J1~J6(여정 감사 수정)은 **착수하지 않았고 이 계획으로 대체**된다. `docs/research/player-journey-audit.md` 는 기록으로 남긴다.
- 부모 리포에 가하는 변경은 **루트 `eslint.config.js` 의 ignores 에 `waterpark/**` 한 줄**뿐이다(prototype-3d 선례). 루트 tsconfig 는 `src, tools` 만 포함하므로 자연 제외.

### 2.1 폴더 `waterpark/` (독립 패키지, dev 포트 5177)
의존은 부모와 같은 핀: phaser 3.90.0 · typescript ~5.9.3 · vite ^7.3 · vitest ^3.2 · eslint ^9.39 + typescript-eslint · playwright · tsx. **올리지 않는다.**

```
waterpark/
├ package.json vite.config.ts tsconfig.json eslint.config.js index.html README.md
├ src/main.ts            부팅: compat → 데이터 검증 → Game 생성/복원 → 씬 → HUD. ?debug=1 → window.__wp
├ src/compat.ts          [복사] roundRect 폴리필
├ src/sim/               불변식: phaser/render/ui/save import 금지 · Math.random/Date 금지 (eslint + invariants.test)
│  rng.ts[복사] clock.ts grid.ts nav.ts pool.ts pool-items.ts color.ts scent.ts facility.ts slide.ts
│  restaurant.ts cooking.ts guest.ts spawn.ts sns.ts condition.ts cert.ts rank.ts shop.ts invest.ts
│  campaign.ts economy.ts calendar.ts events.ts endgame.ts balance.ts game.ts snapshot.ts invariants.test.ts[복사]
├ src/data/              facilities tiles items ingredients recipes compat friends areas wishes certs ranks
│                        shop invest campaigns seasons calendar balance strings.ko (.json) + schema.ts + data.test.ts
├ src/render/            iso.ts[수식 복사·상수 재정의] upscale.ts[복사] camera.ts[복사·import 수정] boot.ts[재작성]
│                        scene.ts textures.ts water.ts guest-sprite.ts bubbles.ts cursor.ts input.ts
│                        fx/{registry,ambient,dom-fx,sfx}.ts
├ src/assets/            manifest.json types.ts provider.ts(ProceduralProvider) draw/{tiles,pool,guest,portrait,facility,slide,decor,fx,icons}.ts
├ src/ui/                dom.ts[복사] panels.ts[PanelHost 복사·표면 타입 재정의] style.css tokens.ts icons.ts hud.ts
│                        windows/{menu,build,pool-edit,pool-info,facility-info,guest-info,sns,cook,menu-edit,shop,invest,
│                                 campaign,cert,inbox,rank,day-summary,system,ending,newgame}.ts  overlays/{toast,strip,dialog}.ts
├ src/save/              save.ts(버전+마이그레이션 체인, 키 wp.save) profile.ts(NG+ 이월, 키 wp.profile)
├ tools/                 build-identity.ts[복사] bot.ts verify.ts check-ui.mjs gate.ts shot.ts
└ tmp-shots/ (gitignored)
```
복사 판정 근거(부모 실측): `rng.ts`·`upscale.ts`·`dom.ts`·`compat.ts`·`build-identity.ts` 순수 → verbatim. `kairo-camera.ts` 는 `GRID_W/H` import 한 줄만. `iso.ts` 는 `KairoTerrain` import 와 부모 전용 `DEPTH_*` 가 섞여 있어 **수식만**. `boot.ts` 는 부모 sim 에 강결합 → 재작성(Scale.NONE·zoom 1·`?px=1` preserveDrawingBuffer 패턴만). `panels.ts` 는 PanelHost 만. 테스트 `iso/camera/upscale/invariants` 도 같이.
`tools/verify-kairo.ts` 헤더의 함정 4개를 `tools/verify.ts` 머리말에 옮긴다: evaluate 안 백틱·`\n` 금지 / 이름 있는 함수 금지(tsx `__name`) / 멀티터치·드래그는 CDP `Input.dispatchTouchEvent` / 픽셀 검사는 `?px=1` 없이는 조용히 통과.

### 2.2 코어 모델 (숫자는 `balance.json` 이 소유, 봇 스윕이 조정)
- **시간** `clock.ts`: 1 tick = 게임 1분, 08:00~20:00 → `TICKS_PER_DAY 720`, `TICK_MS 125` → **하루 90초**. `day 0..127`: `season = floor(day/4)%4`, `dayInSeason = day%4`(3 = 주말), `year = floor(day/16)+1`; **`day === 128` 이 종료**. 훅: 상점 입고 17:00(tick 540) · 심사 주말 15:00(tick 420) · 폐장 시 잔류 손님 flush + 일일 집계. 패널 열림 = 시간 정지(PSS 에 스킵 없음 — 배속은 엔딩 보상).
- **격자** `grid.ts`: **64×48**, 타일 32×16 텍셀. 랭크별 토지 ★0 20×16 → ★5 64×48(게이트는 아래 변 중앙). `floor` {sand, grass, path, indoor, pool} + `poolTile`(타일 종류). 실내는 구역 칠하기, 벽·문은 경계 자동. 토지 밖은 같은 스케일 장식(하늘·경계 없음).
- **풀** `pool.ts`: **4이웃 연결 풀 타일 컴포넌트 = 풀 하나.** 편집마다 recompute → 타일 겹침 최대로 기존 풀 매칭(병합 = 아이템 합집합·likes max / 분할 = 큰 조각 승계). 파생 상태(캐시): `size` · `color`(아이템 가중 RGB → 9색 최근접, **rainbow = 서로 다른 색 ≥8 & 각 ≥8%**, `intensity = 100·Σw/(4√size)`, <20 이면 clear) · `scent`(아이템 ∪ 인접 시설 중 최강 1, 골든 카이로봇 인접+무향 = money) · `temp`(계절 기본 야외 24/30/22/14·실내 26 + 아이템 Δ + 인접 열원) · `se`(햇빛·좋아요·제트/핫텁) · `ab`(물 뿌리는 인접 시설·착수 슬라이드), **`sizeScale = min(6, √size)`** · `popularity = ΣtilePop + (colorBonus+scentBonus)[season]·size/4 + se + ab` · `maintenance = 6 + pop·0.5`/일. 아이템 ≤20, `expiresTick = now + hours·60`. 계절표는 `seasons.json` 에 §1.3 값 그대로.
- **시설** `facility.ts`/`slide.ts`: `facilities.json` 행 `{id,name,class,w,d,cost,pop,maint,shopPrice,capacity,useTicks,hpDelta,scent,scentPower,se,ab,sprays,heat,usageFee,season[4],indoorOnly,unlock:{source},slide:{levels,length,lane}|null,menuSlots}`. `unlock.source ∈ start|shop:rank{n}|wish:{friend}/{idx}|cert:{id}|invest:{id}|rank:{n}|gift:{calendarId}`. 데이터 검사가 회귀를 지킨다: `cost/pop ∈ [60,140]`(카이로봇 예외), `maint ≈ pop×5.3±30%`(슬라이드 7.2). 유료 라운지 = 하루 대여. 슬라이드 출구 칸이 풀이면 그 풀에 AB.
- **손님** `guest.ts`/`spawn.ts`: FSM `enter→wander→choose→walk→use(pool|attraction|slide|restaurant|lounge)→photo?→…→leave`. `hp`(풀 −8·슬라이드 −12·식사 +taste·라운지 +25/+50, <15 퇴장, 온도 불일치 ×2) · `sat` gauge(시설 +pop·0.15, 식사 +pop·0.3) · 친구는 EXP 누적. 입장료 `ticketBase 200` × (1+0.25·stars). 사진: 이용 직후 `sat≥50 & chance .25` → Post. 유입 `10 + pop·0.12 + likes·0.004` × 계절(여름 1.4·겨울 0.7, 실내 비율로 완화) × 주말 1.6 × 캠페인, 동시 ≤48.
- **식당·요리** `restaurant.ts`/`cooking.ts`: 슬롯 5, 식당 인기 `= pop + Σslot.pop × 궁합(⊚1.5·◯1·△0.5) × 다양성(1/1.1/1.2/1.4)`. `recipes.json {id,name,cat,key(정렬 다중집합 "egg+flour+milk"),taste,look,pop,unlock}`, 가격 = 합. `compat.json` 희소 `{restaurant:{good:[],bad:[]}}`. 요리는 **2년차 개방**, 재료 ≤5(중복 허용) → key 조회, EXP → Lv(≤10) 소급 배수 `1+0.05·lv`, 실패 힌트(겹침 ≥60% 미발견 레시피의 카테고리). 재료 = 영구 열쇠, 출처 4(소원·인증 재수상 3·연차 지급·상점).
- **SNS** `sns.ts`: `Post{tick,author,friendId?,areaId,subject,likes,playerLiked}`, 2일 증식, 플레이어 좋아요 +5(하루 3회). `areaLikes ≥ 1000 → 다음 지역` + 시작 친구 등장. `friends.json 71 (10지역)`, `wishes.json {friendId,idx,expNeed[100,260,520],condition,reward,line}` — 소원은 **활성 창 8일 안에 한 번 충족되면 성립**(유지 불필요 = 부정 리뷰 2 대응). 선물 = 상점 gift → `exp += price/8`.
- **인증** `cert.ts`: 봄·가을 `dayInSeason 0` 에 신청 → 주말 15:00 `judge()`: 조건별 `progress` 가중합 ×10, 심사위원 3명 `cert` 스트림 ±1, 합 ≥ pass(15/17/20/22/25). **신청 전·준비 중 `expectedScore()` + 부족 조건 상시 표시**(부정 리뷰 1 대응). 첫 통과 = 타일/튜브/시설, 재통과 = 재료 3, `pass−3` 이상은 위로 재료 1. `certs.json` 24행(§1.7 표 그대로, `requires` 로 계열 사슬).
- **랭크·상점·투자·캠페인**: `ranks.json` ★1~5 (플레이스홀더 §2.6) → 토지·상점 티어·보상. 상점 17:00 `shop` 스트림으로 `tier ≤ rank` 6개 입고, 시설가 = cost×2.2. `invest.json` attraction 1~10 · lounge 1~13 (확인값 사용, 미확인은 보간) → 다음날 해금. `campaigns.json` flyer 2,000G/×1.2/4일/쿨 8 · bus 8,000/×1.5/2일/16 · tv 30,000/×2.0/4일/32.
- **사건 채널** `events.ts` + `ui/inbox`: sim 은 `Event{kind,priority:'toast'|'inbox'|'modal',reward?}` 적재만. UI: 토스트 동시 1(2.4s), **모달 ≤ 1/실시간 분**(`INTERRUPT_MAX_PER_MIN`), 초과는 인박스 배지 + 하루 끝 `day-summary` 한 장. 모달 허용 = 심사 결과·랭크업·지역 개방·엔딩·사장 첫 등장뿐. **좋아요·소원 도착·선물·입고는 절대 모달 아님**(부정 리뷰 3 대응).
- **엔딩** `endgame.ts`: `day 128` → `score = pop×10 + visitors + likes + friends×10 + certPasses×10 + recipes×5` → 이어하기 / NG+ (`carryover = {recipes, cookingExp, 해금 시설 종류당 1, gifts, ticketBase: floor(ticket×0.3/10)×10}`).
- **경계**: 읽기 = `game.view`(읽기 전용 참조, 프레임당 복사 0) · 쓰기 = 명령 메서드(`digPool/fillPool/place/remove/putItem/setMenu/cook/applyCert/buy/invest/campaign/gift/likePost/claim`) 전부 `{ok}|{ok:false,reason}` · 연출 = `game.drainFx()` · `toSnapshot/fromSnapshot`(풀 파생·거리장·FX 미저장).
- **RNG 스트림** (루트 seed → `fork(salt)`): spawn 1 · guest 2 · sns 3 · cert 4 · shop 5 · cook 6 · world 7 · friend 8. 스냅샷에 각 state 저장, 새 스트림 추가 시 `snapshot.test` 의 키 전수 검사가 깨지게.

### 2.3 조건 DSL `condition.ts` — 소원·인증·랭크가 **하나의 평가기** 공유
`evaluate(cond, world) → {met, progress 0..1, actual, need, label}`. kind: `pool{count,sizeMin,sizeMax,color,scent,tempMin,tempMax,likesMin,intensityMin,outdoor,indoor,tile}` · `poolTotalSize` · `facility{id,count,adjacentPool}` · `facilityAdjacent{ids,count}` · `facilityClass{class,count}` · `item{id,count}`(활성만 센다) · `recipe{id,served}` · `recipeCount{min,cat}` · `popularity` · `likes{min,scope,area}` · `certPasses`/`certPassed` · `friends`/`areas` · `rank` · `gift{id,friendId}` · `cookingLevel` · `visitors`/`money`/`year` · `all`/`any`. 1칸 풀 악용 억제: `pool` 기본 `sizeMin` 소원 4·인증 9(데이터가 명시적으로 낮출 수 있음). `data.test.ts` 가 wishes/certs/ranks 의 모든 kind 가 switch 에 있고 참조 id 가 실재함을 검사.

### 2.4 UI·VFX·에셋 (PSS 문법 복제 — 스크린샷 4장 판독 근거)
- **HUD(393×852)**: 상단 **남색 반투명 띠 두 조각** — 좌 `1년 🌸 ☀16° ▐평일 1/3▌ PM 01:10`(노랑 픽셀 숫자, 마젠타 일과 알약), 우 `G 2,650`; `pointer-events:none`. **우측 세로 정사각 48px 5개**(파란 그라디언트·흰 안쪽 하이라이트·남색 외곽·아이콘 위/라벨 아래, 잠김은 자물쇠+이유): 건설·풀 편집·SNS(배지)·요리·상점. **핑크 목표 티커**(초상 + 「미니 슬라이드를 설치하자!」, hit 44px). **하단 바** `SAVE` · 가운데 정보 캡슐(알림 배지 + 인기 + ★랭크) · `MENU`(카이로식 세로 리스트 10행, 오른쪽 정렬, 하위 메뉴 캐스케이드, 잠김 행은 `🔒 2년차` 이유). 지도 ≥ 82%, 시간 조작 버튼 없음.
- **컨테이너 4종 고정**: `Window`(크림 몸통·진갈 테두리·보라/파랑 제목 띠·X, 스크림) · `Dock`(건설 배치·풀 편집이 하단 바 자리를 **대신** 차지, 첫 줄에 모드 이름) · `Dialog`(예/아니오) · `Strip`(바닥 흰 대사 띠 + 초상). 전부 `PanelHost`(한 번에 하나), 소유권은 `data-ui-surface` 한 값.
- **화면 목록**: home · menu · build(탭 6 → 배치 Dock: 취소/↻/확정) · pool-edit(파기/메우기/아이템 서브탭, 완료 때 일괄 청구, 상태 줄 8지표) · pool-info · facility-info · guest-info + 말풍선(≤3) · sns(타임라인 썸네일 RenderTexture·메시지 소원 행 `받기`/도장·친구 + 지역 진행 바) · cook(칩 ≤5·개발 Dialog·도감) · menu-edit(5칸·◎○△) · shop · invest(탭 2) · campaign(쿨다운 바) · cert(**무대 창**: 계열 탭·조건 3행 초상+아이콘+현재값·예상 점수·신청 → 심사일 결과 창 카드 뒤집기+도장) · inbox · rank(랭크·통계·지역) · day-summary · system · ending · newgame · toast/strip/dialog.
- **토큰**(초안; 대비 게이트가 최종값 강제): `--strip-bg rgb(18 38 92/.82)` `--strip-num #ffe45c` `--daypart #d84cc0` `--btn-blue` `--btn-edge #0e2a66` `--win-bg` 크림 `--win-title` 보라 `--row-on #2b46d4` `--ink #1c2a5c` `--ticker-bg #ffd9e4` `--like #ef4f8a` `--stamp #d63232` `--pool-*` 9색. 숫자·제목은 픽셀 서체(Galmuri11 self-host, 폴백 시스템), 본문 시스템 산세리프. **색은 CSS 만 소유**, 캔버스는 `cssVar()`.
- **FX 등록부** `render/fx/registry.ts` 세 종류: `FxName`(splash-enter/land · item-sparkle · photo-flash · like-float · money-pop · wish-burst · star-burst · confetti · place-ok/bad) · `AmbientName`(water-glint · scent-puff · temp-steam/frost · rainbow-cycle · slide-flow · fountain-spray · day-night · weather-rain/snow · lamp-glow) · `DomFxName`(rank-banner · stamp · score-card-flip · toast · flash-screen). 규칙: transform/opacity/alpha/scale 만 · reduced 면 움직임만 빼고 숫자·도장은 남김 · 동시 ≤12, 같은 키 700ms 합치기 · 등록부 밖 `tweens.add/particles` 금지(정적 게이트). 사운드 `sfx.ts` 는 WebAudio 오실레이터 절차 생성 15큐, 파일 0.
- **에셋**: 논리 ID + `manifest.json` + `ProceduralProvider`(나중에 `AtlasProvider` 로 ID 단위 교체). 영구 절차 = 물·물보라·틴트·그림자·격자·FX. 시설 = 「바닥판 + 2톤 상자 + 표식 1~2 + 1텍셀 남색 외곽」 분류별 기본색(편의 회백·라운지 흰/파랑 줄·식당 빨강/노랑 차양·놀이 파랑·슬라이드 하늘색 반투명 튜브·장식 초록/갈색). 풀 수면은 흰빛 베이스 + `setTint` 9색, 코핑은 4비트 마스크 16종 자동. 손님 14×24(포즈 8 × 방향 × 팔레트 8, 표정 8×5 오버레이 7종, 튜브 6색), 초상 24×24 는 seed → 71 친구. 아이콘은 `iconEl()` 만(문자열 API 없음, 이모지 0).

### 2.5 Goal 순서 (G0~G13, 각각 `npm run gate -- gN` = typecheck+lint+vitest+bot 문턱+verify 실터치, 이전 게이트 누적)

| G | 이름 | 범위(시스템 / UI·VFX·에셋) | 플레이어가 할 수 있는 것 | 게이트 |
|---|---|---|---|---|
| **G0** | 스캐폴드 | 패키지·핀·eslint 불변식+invariants.test·복사 유틸+테스트·`grid` 상수·`boot/scene` 64×48 모래 격자(토지 20×16 잔디·게이트 표식)·팬·핀치 1↔2·`?debug=1 → window.__wp` / `style.css` 토큰+8 컴포넌트 재질·`panels.ts`(PanelHost+uiSurface+interruptBudget)·`icons.ts` 10개·`hud.ts` 껍데기·FX 등록부 계약+`money-pop`·`sfx` 5음·manifest 골격+지형 타일 6 / `tools/verify.ts` 골격(DEVICE·CDP 헬퍼)·`check-ui.mjs` S1~S8+S13 자가진단·`gate.ts`·루트 eslint ignores | 지도를 팬·줌한다 | 부팅 ≤5s·드래그 후 scroll 변화·핀치 후 S=2·콘솔 0·HUD ≤18%·정수 업스케일 |
| **G1** | 시간+풀+손님 (루프 v0) | `clock`·HUD 상단 띠 실값·`pool.ts` 연결/병합/분할·`nav` BFS·`guest` 최소 FSM(입장→풀→퇴장)·`spawn` 기본·입장료·일일 집계 inbox 한 줄·`save` v1 자동저장 / pool-edit Dock(파기/메우기)·pool-info·guest-info·말풍선 ≤3·water-glint·splash-enter·day-night·place-ok/bad·풀 수면+마스크·손님 아틀라스·그림자 | 풀을 파면 손님이 와서 뛰어들고 돈이 는다, 하루 90초 | unit: 시계 경계·병합/분할 승계·BFS / verify: 터치로 2×2 파기 → 720tick 안 손님 ≥1, 세이브 왕복 동일, 말풍선 ≤3 |
| **G2** | 헤드리스 봇 | `tools/bot.ts`(정책 훅: 예비비·풀 확장·시설·계절 아이템·인증·요리·선물·투자 — 뒤 goal 이 채움)·메트릭 JSON(연차별 money/pop/visitors/likes/areas/certs/rank/recipes/score)·`--determinism`·`--sweep`·골든 3시드 16일 | — | 8시드×16일 <10s, 결정론, 골든 일치 |
| **G3** | 시설 6분류 + 풀 상태 | `facilities.json` ~30·`items.json` ~20·`seasons.json`·`facility/slide/color/scent/pool-items`·유지비·파크 인기·손님 시설 이용·HP·온도 반응 / build Window(탭 6)+배치 Dock·pool-edit 아이템 탭·facility-info·item-sparkle·scent-puff·temp-steam/frost·시설 절차 도형 규칙 6 | 화장실·제트풀·데크체어를 짓고 딸기로 핑크 풀을 만든다 | unit: 8색 등량=rainbow·향 argmax·money 규칙·sizeScale·유지비 회귀 데이터 검사 / bot: 아이템 풀 pop > 무아이템(A/B), 16일 net>0 ≥6/8 / verify: 배치 터치·딸기 투입 → 수면 픽셀 핑크(`?px=1`)·거절 사유 표시 |
| **G4** | SNS·좋아요·지역·소원 + DSL + Inbox | `sns`·`condition`(전 kind)·`events`+inbox/toast 정책·friends 2지역 14명·wishes 42·areas·친구 방문·사진·증식·1000 개방·선물 gift 2 / sns Window 3탭·손님 팝오버·photo-flash·like-float·photo 포즈·초상 생성기 | 타임라인에 글·좋아요, 첫 소원(풀 20칸+) 보상, 새 친구 초대 | unit: DSL kind 별 progress·활성 창·지역 개방 / bot: Y1 소원 ≥3, 지역 2 개방 ≤Y2 여름 ≥5/8, 모달 ≤1/분 / verify: 탭 전환·좋아요 터치·받기 터치·토스트 동시 1 |
| **G5** | 인증·랭크·상점·사장 달력 | `cert`(신청·3일·주말 15:00·3심사위원·예상 점수)·certs 8종(F/E/D)·`rank` ★0~2+토지 확장·`shop` 17:00 입고·`calendar`(이동 도구·크레페 선물)·타일 4종 / cert 무대 Window·결과 창(카드 뒤집기·stamp)·rank Window·rank-banner·confetti·shop Window·티커 목표 문장·심사위원 스프라이트 | Y1 가을 Entry 인증 통과 → 타일, ★1 → 땅 확장·신상 | unit: 부분 점수·심사위원 결정론·신청 창·재수상 / bot: Entry Y1 가을 ≥6/8, ★1 ≤Y2 봄 / verify: 예상 점수·부족 조건 표시, 신청 터치, 결과 모달 1회 |
| **G6** | 식당·메뉴 5칸·궁합 | `restaurant`·recipes 20(start)·compat 4식당·손님 구매·HP·유료 라운지 연계·다양성 보너스 / menu-edit Window | 자판기에 음료 5개 걸고 ◎/△ 보며 바꾼다 | unit: 궁합 배수·다양성·가격 / bot: 식당 매출 10~35%, 4카테고리 > 단일 / verify: 슬롯 교체·△ 경고 |
| **G7** | 요리 발견 (Y2) | `cooking`·ingredients ~40·recipes 60·연차 지급·재수상 재료·상점 재료·소원 재료 / cook Window(칩 5·개발 Dialog·도감)·재료 아이콘 | 2년차에 밀가루+계란+우유로 크레페 발견, 레벨업 소급 | unit: 키 정규화·소급 배수·힌트 / bot: Y2 레시피 ≥8, Y4 Lv≥4 / verify: 5칸 터치 → 발견 연출·도감 |
| **G8** | 슬라이드·투자·캠페인·실내 | 대형 슬라이드 4(레벨·길이·착수 AB)·attraction 15·lounging 21·`invest`·`campaign`·실내 구역 칠하기(벽·문) / invest/campaign Window·slide-flow·splash-land·fountain-spray·lamp-glow·슬라이드 타워/세그먼트 | 투자로 슬라이드 해금 → 풀에 착수, 버스로 주말 손님 | unit: 착수 판정·AB·쿨다운·해금 지연 / bot: Y5 attraction 6·lounge 6, 캠페인 ROI>1 / verify: 슬라이드 조준·회전·착수 표식, 실내 드래그 칠하기 |
| **G9** | 손님 생활 폴리시 | 계절·주말 곡선·온도 취향·조기 퇴장·표정·이모트·문구·밀도 2%·동시 48 60fps / satisfaction-gauge·weather-rain/snow·팝오버 정보 | 손님을 보는 것이 보상 | bot: 주말 ≥평일 1.4배, 여름/겨울 ≥1.6 / verify: p95 프레임 <20ms, 말풍선 ≤3 |
| **G10** | 데이터 전량 + 도달성 | 친구 71·소원 213·인증 24·식당 26·레시피 140·재료 ~60·타일 13·장식 22·지역 10·상점 5티어·투자 23·달력 / `data.test.ts`: 참조 무결·해금 그래프 도달성·인증 조건 해금 가능·궁합 완전성 | 전량 콘텐츠 | 데이터 테스트 / bot 128일: 지역 ≥6·인증 ≥10·레시피 ≥40 ≥4/8 |
| **G11** | 엔딩·NG+·마이그레이션 | `endgame`·`ending`(점수 카드·계속/NG+)·`profile` carryover·`newgame`·MIGRATIONS v1→v2 실사례·배속 ×2 해금 | 8년차 끝 점수 → NG+ | unit: 점수식·carryover·마이그레이션 / bot 128일 8시드 / verify: 엔딩 → NG+ → 이월 확인 |
| **G12** | UI/VFX 모방 폴리시 | PSS 띠 레이아웃 정밀 재현·수면 3프레임·햇빛·rainbow-cycle·season-tint 크로스페이드·시트 전환·픽셀 서체·풀 프리셋 저장/복원·튜토리얼 Strip·아이콘 46 / 스크린샷 대조 세트 6장 | 「그대로 카피한 느낌」 판정 | verify: 스크린샷 콘택트 시트·이음새 픽셀·터치 타깃 44 전수·B1~B12 |
| **G13** | 밸런스 스윕 + 페르소나 봇 | 페르소나 3(풀·식당·인증 사냥)·`--sweep` 로 §2.6 플레이스홀더 튜닝·목표 밴드 확정·README | — | `npm run verify` 전체 녹색·밴드 충족 |

### 2.6 미확보 데이터 → 플레이스홀더 (봇이 튜닝)
| 항목 | 플레이스홀더 | 봇 지표 |
|---|---|---|
| 풀 아이템 전표 | 24종: strawberry(pink·berry·−2·3h·150G) chocolate(—·cookie·+4·3h) lemon(yellow·citrus·0) apple(red·fruity·0) blueberry(blue·berry·−1) peach(pink·fruity·+1) grapes(purple·fruity·0) grapefruit(orange·citrus·−1) melon(lime·fruity·−1·4h) kiwi(green·fruity·−1) pineapple(yellow·tropical·+2·4h) coconut(white·tropical·+1) milk(white·milky·+1·2h) coffee_beans(—·coffee·+3·4h) mint(green·pine·−4) ice_block(—·—·−6·2h) bath_salt(—·floral·+8·4h) rose(pink·floral·0) cinnamon(red·spices·+3) … | 계절 최적색 유지비/일, rainbow 8종 유지비 ≤ Y4 수입 15% |
| SE/AB 배율 | `sizeScale = min(6, √size)` | 4→36칸 pop 곡선 오목, 도넛 풀이 유일해 아님 |
| Intensity | `100·Σw/(4√size)`, 임계 20 | `intensityMin` 인증 통과율 |
| 랭크 문턱 | ★1 pop80·cert1 / ★2 pop150·cert2·friends10 / ★3 pop250·cert4·likes3000 / ★4 pop400·cert7·friends30 / ★5 pop600·cert10·friends50·areas7 | ★3 ≤Y3, ★5 ∈ Y6~Y7 (≥50% 시드) |
| 투자 미확인 | attraction 7~10: 12k/14k/18k/25k · lounge 7~13: 12k/15k/18k/22k/28k/36k/50k | 완료 시점 Y2~Y7 고르게 |
| 시작 자금·티켓 | 12,000G · 200G | Y1 자금 30k~80k, 파산 0 |

### 2.7 리스크·대응
- **1칸 풀 악용** → DSL 기본 sizeMin + 풀 패널에 「지금 이 풀이 조건 X 충족」 실시간 표시.
- **팝업 폭풍**(PSS 1위 불만) → sim 적재만, UI 모달 ≤1/분, verify 가 분당 모달을 센다.
- **소원이 완성 풀을 부수게 함** → 활성 창 8일·성립 순간 확정, 프리셋 저장/복원(G12).
- **성능** → 수면은 풀 단위 RenderTexture 1장, 타일 3,072 + 시설 ~150 + 손님 48(부모가 6,912 스프라이트 실적).
- **데이터 분량**(친구 71·소원 213·레시피 140·궁합 4,000셀) → G10 전엔 축소본, 궁합은 희소 good/bad 목록.
- **검사가 조용히 통과** → 정적 게이트는 `--selftest` 음성 대조군 필수, 픽셀 검사는 `?px=1`, 개수가 아니라 정체로 잰다.

### 2.8 검증 (end-to-end)
1. `cd waterpark && npm i && npm run gate -- g0` … `g13` 순서대로. 게이트 = `typecheck + lint(불변식) + vitest + bot 문턱 + verify(--goal gN, Playwright chrome channel, 393×852 DPR3 hasTouch, CDP 터치)`. 게이트는 vite 를 자식 프로세스(5177)로 띄운다.
2. 각 goal 종료 시 `tools/shot.ts` 로 `tmp-shots/<route>.png` 콘택트 시트 → 사람이 「PSS 처럼 보이나」 확인(판정 없음, 기록).
3. `npm run bot -- --seeds 8 --days 128 --determinism` 이 Phaser 없이 Node 에서 완주 = 불변식 1 실증.
4. 부모 리포 `npm run verify` 가 여전히 녹색(ignores 한 줄 외 무변경).

### 2.9 첫 goal(G0) 착수 체크리스트
`waterpark/package.json`(핀) · `eslint.config.js`(sim 규칙 4 + `src/sim/invariants.test.ts`) · 복사 8파일+테스트 4 · `render/iso.ts` 수식+새 상수 · `render/boot.ts`·`scene.ts` · `ui/style.css` 토큰·컴포넌트 8 · `ui/panels.ts`·`icons.ts`·`hud.ts` · `render/fx/registry.ts`·`sfx.ts` · `assets/manifest.json`·`provider.ts`·`draw/tiles.ts` · `tools/verify.ts`·`check-ui.mjs`(+selftest)·`gate.ts` · 루트 `eslint.config.js` ignores · `waterpark/README.md`(플레이·검증 방법).

---

## 3. 변경 이력 (goal 종료마다 실측을 append)

### G0 — 스캐폴드 (2026-09-02) ✅ 게이트 통과
- 만든 것: `waterpark/` 독립 패키지(핀 동일, dev 5177) · eslint 불변식 + `invariants.test` · 복사 유틸 8(rng·upscale·camera·iso 수식·dom·panels·compat·build-identity) · `sim/grid.ts`(64×48, 랭크별 토지, 입구) · `render/scene.ts`(타일 3,072 Image, 팬·핀치·더블탭·휠, 정수 업스케일) · `ui/style.css` 토큰+재질 · `ui/hud.ts`(상단 띠 2·우측 정사각 5·핑크 티커·하단 바 3) · `ui/icons.ts`(캔버스 아이콘 14, 이모지 0) · `render/fx/{registry,sfx}.ts`(money-pop · 5음) · `assets/{manifest,provider,draw/tiles}` · `tools/{verify,check-ui,gate,shot}.ts`.
- 게이트: vitest 53 · 정적 S1~S9 + 음성 대조군 10/10 · 브라우저 13/13 (부팅 ~400ms · HUD 16.7% · 상시 컨트롤 정체 9 · 팬/핀치/더블탭 · 지형 · 토스트 · 콘솔 0).
- 실측 함정 (다음 goal 이 밟지 말 것):
  · **핀치는 Phaser 포인터로 재면 안 된다.** 포인터 좌표가 씬(버퍼) 단위라 S 가 2 가 되는 순간 반으로 줄고, 두 손가락 중 한쪽만 새 단위인 프레임에 거리가 절반으로 읽혀 1↔2 가 매 이벤트 진동했다. DOM `touch*` 의 clientX(화면 px)로 잰다 (`wirePinch`).
  · **CDP 터치 이벤트 사이에 한 프레임(≥25ms)을 둔다.** 한 틱에 몰아 보내면 move 가 down 과 같은 프레임에 먹혀 제스처가 안 걸린다 (`tools/verify.ts` 의 `drag/pinch` 헬퍼).
  · 부모 리포 밖 스크래치 스크립트는 `.mts` 라도 `playwright` 를 못 찾는다 — 디버그 스크립트는 `waterpark/tmp-shots/`(gitignored)에 둔다.
- 남긴 것: 토지 밖 장식(지금은 모래 균일) · 픽셀 서체 도입 여부 · 우측 칸 5개는 토스트만(각 goal 이 채운다).

### G1 — 시간 + 풀 파기 + 손님 루프 v0 (2026-09-03) ✅ 게이트 통과
- sim: `clock.ts`(720 tick/일 · 4일/계절 · 128일 종료) · `nav.ts`(BFS 거리장) · `pool.ts`(연결 컴포넌트 = 풀, 병합/분할 승계, 스냅샷은 앵커 하나) · `guest.ts`(enter→wander→walk→swim→leave, HP) · `events.ts`(Inbox, 적재만) · `game.ts`(명령 `digPool/fillPool` 원자성·입구 도달 전후 비교·일일 마감·스냅샷·RNG 8스트림) · `save/save.ts` v1.
- 화면: 손님 도트(팔레트 8 × idle/walk/swim) · 물 반짝임 ambient · FX splash/place-ok/bad · 낮밤 틴트 · 말풍선 ≤3 · 창(`WindowPanel`) · 풀 편집 Dock(탭 토글·완료 일괄 청구) · 풀/손님 정보 창 · HUD 시계·돈·티커 실값 · 자동저장(하루 마감).
- 게이트: vitest 66 · 정적 S1~S9 + 대조군 10/10 · 브라우저 23/23 (독 진입·홈 입력층 내림·칸 4개 진짜 터치·완료 −400G·손님 유입/수영·스프라이트·말풍선 ≤3·정보 창·세이브 왕복).
- 실측 함정: 하네스의 `addInitScript(localStorage.clear())` 는 **리로드마다** 실행돼 세이브 왕복 검사가 빈 판을 읽었다 — 첫 로드만 `?fresh=1`. 씬이 만들어지기 전에 독이 `setSelection` 을 불러 부팅이 죽었다 — 씬 API 는 create 전 호출을 무시한다.

### G2 — 헤드리스 봇 (2026-09-03) ✅ 게이트 통과
- `src/sim/bot.ts`(정책: 예비비 3,000G · 하루 4칸 · 풀 목표 24칸 — 봇의 습관이지 게임 규칙이 아니다) · `tools/bot.ts`(`--seeds --days --determinism --json --sweep k=v`) · `golden.test.ts`(시드 3 × 16일 해시 + 왕복 뒤 이어 돌리기).
- 실측: 8시드 × 128일 **515ms**, 결정론 통과. v0 경제는 싱크가 없어 8년차 현금 113만G — G3 부터 유지비·시설이 붙는다.
- 게이트 g2+ 는 봇 8×16 결정론을 포함한다.

### G3 — 시설 6분류 + 풀 상태 (2026-09-03) ✅ 게이트 통과
- 데이터(에이전트 저작): `facilities.json` 35 · `items.json` 24 · `seasons.json`(§1.3 표 그대로) · `schema.ts` · `data.test.ts` 20 (비용/인기 회귀 [60,140], 식당은 [25,50] 별도 밴드 — 위키 실값이 그렇다 · 유지비 5.3±30%, 슬라이드 7.2 · sprays⇔ab).
- sim: `facility.ts`(발자국 점유·인접·유료 대여) · `color.ts`(가중 RGB → 9색, 무지개 = 8색 ≥8%, `intensity = 100·Σw/(2√size)` — 2×2 에 하나면 색이 든다) · `scent.ts`(최강 1, 동률 아이템) · `pool-state.ts`(8지표, `sizeScale=min(6,√size)`) · `game.ts` 명령 `placeFacility/removeFacility/putItem` + 아이템 시간 만료 + 유지비 마감 + **봉쇄 금지 전후 비교**(닿지 않는 풀·시설이 늘거나, 걸을 땅이 발자국보다 더 줄면 거절) · 손님이 시설을 이용(HP·이용료)하고 수온이 안 맞으면 짧게 놀고 두 배로 지친다.
- 화면: 건설 창(6탭·잠김 행은 disabled+출처) · 배치 Dock(탭 조준·고스트·회전·확정) · 시설 정보 창(철거) · 풀 편집 아이템 탭(칩 즉시 투입·상태 줄) · 시설 절차 도형(분류색 상자+표식) · 풀 색 틴트 · FX item-sparkle/scent-puff/temp-steam/frost.
- 게이트: vitest 106 · 정적 통과 · 봇 8×128일 **2.3초**(캐시 전 56초 — tick 마다 파크 인기를 다시 셌다) · 브라우저 32/32.
- 실측 함정: 매니페스트 패밀리 조회가 `:` 만 보고 `fac/toilet/0` 을 못 찾아 Phaser 「텍스처 없음」(초록 테두리 검은 사각)이 떴다 — 패밀리는 `:` 와 첫 `/` 둘 다 본다. **WebGL readPixels 는 검증 흐름에서 옛/다른 버퍼를 돌려줬다** — 픽셀 판정은 스크린샷을 페이지에 올려 읽는다. 핑크 틴트 × 푸른 수면 = 라벤더라 「초록이 낮다」로 잰다.

### G4 — SNS · 좋아요 · 지역 · 친구 · 소원 + 조건 DSL + Inbox (2026-09-03) ✅ 게이트 통과
- 데이터(에이전트): `areas.json` 10 · `friends.json` 14(주택가 7·학교 7, 초대 사슬) · `wishes.json` 42 · `gifts.json` 8 · `data.test.ts` 35 (초대 무순환·소원 3/친구·보상 시설 정확히 1회·Kiddie 20/40/60).
- sim: `condition.ts`(kind 22, `progress` 부분 점수, 한국어 라벨) · `sns.ts`(글·좋아요 증식·지역 1,000 개방·친구 EXP→☆·소원 활성 창 8일·선물) · 손님이 놀고 만족 ≥50 이면 사진(하루 1장, 12%) → 글 → 지역 좋아요 · 친구는 나갈 때 만족이 EXP · 소원 판정은 **매시간 markMet + 폐장** (창 안에 한 번 충족이면 성립 — 아이템이 3시간 뒤 사라져도 인정) · 보상 = 해금/선물/돈.
- 화면: SNS 창 3탭(타임라인 좋아요 칩·메시지 진행률·친구 별/선물 피커) · SNS 칸 배지 · photo-flash·like-float · 모달 예산(1/분) 적용.
- 봇: 소원 추적 정책(색·향·온도 → 아이템, 시설 → 배치, 크기 → 목표 상향) + 선물. 실측 8시드×128일: **1년차 소원 8**(문턱 ≥3) · 8년 16 · 친구 11/14 · 지역 2 개방 6~8일차(문턱 ≤2년차 여름) · 좋아요 3.4만 · 지역 7/10.
- 실측 함정: 「풀 좋아요 → SE → 인기 → 글 좋아요」가 선형이라 좋아요 1,690만·인기 17만으로 폭주했다 → 글 인기 기여 상한 24 · SE 는 √likes/3 상한 10 · 사진 12%/하루 1장. 소원을 폐장에만 판정하면 「풀에 사과」가 영영 0% (아이템이 먼저 사라진다). `★☆✓` 는 이모지 검사에 걸린다 — 별은 아이콘 요소로.
- 남긴 것: 크레페 가게(사장 선물)·상점 해금 아이템·시설이 조건인 소원은 G5 가 열어야 진행된다.

### G5 — 인증 · 랭크 · 상점 · 사장 달력 · 풀 타일 (2026-09-03) ✅ 게이트 통과
- 데이터(에이전트): `certs.json` 12(F/E/D + 등급 C·B, 합격선 15~25, 계열 사슬) · `ranks.json` 5 · `shop.json` 33(생성, 티어 1~3) · `calendar.json` 7(사장 선물: 3일차 크레페 · 첫 인증 뒤 이동 도구 …) · `tiles.json` 13 · `data.test.ts` 58.
- sim: `cert.ts`(봄·가을 첫 이틀 신청 → 주말 15:00 · 3심사위원 ±1 만 무작위 · **예상 점수 = 편향 없는 같은 식** · 첫 통과 보상/재통과 위로금) · `rank.ts`(폐장 판정, 무작위 없음 → 토지 개방·보상) · `shop.ts`(17:00 입고, 뽑기 6회 고정) · `calendar.ts`(날짜 사건 + `when` 조건) · 풀 타일 종류(`grid.poolTile`, 타일당 인기) · 조건 세계 뷰 tick 단위 캐시(봇 12.7s → 5.4s).
- 화면: 랭크 창(다음 조건 진행·통계 6항목) · 심사 창(계열 탭·조건 행·예상 점수/합격선·신청) · 상점 창 · 파기 탭 타일 칩 · 티커에 다음 랭크 조건.
- 봇: 예상 ≥ 합격선인 인증 신청 · 여유 있으면 상점 최저가 구입. 실측 8시드×128일: 인증 16 · 랭크 ★3 전원 · 소원 27 · 친구 14/14 · 지역 6 (★4 는 친구 30 이 필요해 G10 데이터 전량 전엔 구조적으로 못 간다).
- 게이트: vitest 165 · 정적 · 봇 결정론 · 브라우저 48/48.

### G6·G7 — 식당 메뉴 5칸·궁합 + 요리 발견 (2026-09-03) ✅ 게이트 통과
- 데이터(에이전트): `ingredients.json` 40(시작 9·상점 17·소원 6·인증 4·연차 4) · `recipes.json` 60(시작 20·개발 30·레벨 10, 키 = 정렬 다중집합) · `compat.json` 6 식당 · `data.test.ts` 73.
- sim: `restaurant.ts`(슬롯 5 · 궁합 ⊚1.5/△0.5 · 다양성 1/1.1/1.2/1.4 · look 가중 추첨 · 가격 = 스탯합 × **8**) · `cooking.ts`(키 조회·정답표 없음·실패 힌트 60% 겹침·레벨 소급 배수·2년차 개방) · Game: 손님이 식당을 쓰면 메뉴를 사고(HP += taste×2 · 만족 += pop×0.3) · 재료 출처 4(소원·인증 재수상·연차·상점 직접 구매) · 조건 DSL 의 recipe/recipeCount/cookingLevel 이 산다.
- 화면: 시설 정보 → 메뉴 편집 창(칸 5·궁합 ◎○△·카테고리 필터·4종 보너스) · 요리 개발 창(재료 칩 ≤5·개발·결과 줄·도감·재료 사기) · 요리 칸은 2년차 전엔 토스트.
- 봇: 식당마다 빈 칸에 궁합·카테고리 우선 장착 · 2년차부터 하루 한 번 개발(절반은 가진 재료로 되는 미발견 레시피, 절반은 무작위) · 상점 재료. 실측: 레시피 44/60 · 요리 Lv8 · **식당 매출 비중 42%**(가격 ×20 이던 첫 실측 61% → ×8) — 계획 밴드 10~35% 보다 높지만 PSS 도 「식당이 주수입이 될 수 있다」고 적었으므로 받아들이고 기록한다.
- 게이트: vitest 187 · 정적 · 봇 결정론 · 브라우저 57/57.
- 실측 함정: `Set` 순회 순서가 스냅샷 왕복 뒤 달라져 골든 「왕복 뒤 이어 돌리기」가 깨졌다 — 결정에 쓰는 집합은 **id 로 정렬**한다. 창 안 요소의 `hidden` 은 S8 에 걸리므로 `.khide` 클래스로.

### G8 — 슬라이드 · 투자 · 캠페인 · 실내 (2026-09-03) ✅ 게이트 통과
- 데이터: `invest.json` 19단계(놀이 10 · 라운지 9, 확인된 비용은 그대로, 미확인은 §2.6 보간) · `campaigns.json` 3(전단지 ×1.2/4일/쿨 8 · 버스 ×1.5/2일/16 · TV ×2/4일/32). 슬라이드 4종에 착수 AB(6~10).
- sim: 투자(트랙 순서 강제 · 지불 뒤 **다음날 개장** 해금) · 캠페인(동시 하나 · 유입 배율 · 쿨다운) · 실내 바닥 칠하기(칸당 40G · **풀 사방이 실내/풀이면 실내 풀** → 계절 무관 26°C · 햇빛 0) · 슬라이드 발자국 = 탑 2×2 + **활강로 `length` 칸**(facing 으로 +I/+J) — 활강로 끝이 풀에 닿으면 AB.
- 화면: MENU → 카이로식 세로 리스트 10행(잠김 이유 표기) · 투자 창(탭 2·단계 순서·완료 도장) · 캠페인 창 · 풀 편집에 실내 바닥/지우기 탭 · 새 게임(저장 삭제).
- 봇: 여유 12,000G+ 면 다음 투자, 주말 전날 전단지/버스. 실측 8시드×128일: 투자 19 · 캠페인 2종 · 식당 매출 36% · 현금 72만.
- 게이트: vitest 189 · 정적 · 봇 결정론 · 브라우저 64/64.
- 남긴 것: 슬라이드 활강로가 **그림으로는 안 보인다**(탑 상자만) — G12 폴리시. 실내 벽·문도 지면 텍스처만.

### G9 — 손님 생활 폴리시 (2026-09-03) ✅ 게이트 통과
- sim: `weather.ts`(하루 1회 `world` 스트림 · 맑음/흐림/비/눈 · 유입 ×1/0.9/0.6/0.8 · 비·흐림이면 야외 햇빛 0 · 기온 보정) · 표정 `moodOf`(HP<30 tired · 불평 annoyed · 만족 ≥60 happy — 저장 안 함) · 만족 100 「최고의 하루!」 · `DayReport.target`(유입 목표).
- 화면: 손님 얼굴 4종(눈·입 1텍셀) · 비/눈 화면 연출(Graphics, reduced-motion 이면 정지) · HUD 날씨·기온 실값 · `__wp.frameMs`.
- 게이트: 브라우저 69/69 — 여름 주말 + TV 광고에서 **동시 48명 · 2배속 · 프레임 p95 16.7ms** · 말풍선 ≤3 · 날씨 라벨.
- 실측: 주말/평일·여름/겨울 비를 **실현 방문**으로 재면 1.0 — 동시 상한 48 에 포화돼 평평하다. 유입 **목표**로 재면 곡선이 산다(아래 줄). 포화 자체(「더 지어도 안 는다」)는 G13 밸런스 항목.
  투자 중앙 19 · 캠페인 종류 2 · 주말/평일 1.77 · 여름/겨울 2.64

### G11 — 엔딩 · 뉴게임+ · 마이그레이션 (2026-09-03) ✅ 게이트 통과
- sim: `endgame.ts`(점수 = 인기×10 + 방문 + 좋아요 + 친구×10 + 인증×10 + 레시피×5 · `carryoverOf`/`applyCarryover`: 레시피·EXP·해금 시설 종류·선물·타일·**티켓 ×0.3 가산** 이월, 돈·풀·손님·지역은 새로) · `haltedForEnding`(128일 → 정지, 엔딩을 보면 이어하기) · `ticketBonus`/`endingSeen` 저장.
- save: **v2** + 마이그레이션 v1→v2 실사례(새 필드 기본값) · `profile.ts`(`wp.profile`, 회차·최고 기록).
- 화면: 엔딩 창(모달 · 6항목 순차 등장 `--row-index` · 총점 · 이어하기/뉴게임+) · 메뉴에 배속 ×2(엔딩 뒤 해금).
- 게이트: vitest 195 · 브라우저 **72/72** (전 절 누적 — `'g11' < 'g3'` 문자열 비교로 앞 절이 건너뛰던 게이트 버그를 숫자 비교로 고쳤다).

### G12 — UI/VFX 모방 폴리시 (2026-09-03) ✅ 브라우저 77/77 (전체 게이트는 G10 데이터 합류 뒤 재실행)
- 렌더: 슬라이드 **활강로 튜브**(`drawLanes` — 탑에서 착수 칸까지 반투명 하늘색 세그먼트) · 실내 **벽 외곽선**(`drawWalls` — 실내/야외 경계, 풀에 면한 변은 유리색) · 계절 잔디 틴트(`--grass-season-0..3`, `setSeason`) · **무지개 풀 HSV 순환**(`rainbow-cycle`) · 실내 풀 26°C 표시.
- 화면: **풀 프리셋 저장/복원**(`Game.savePreset/applyPreset`, 최대 4, 스냅샷 `presets?`, 풀 창의 `프리셋 저장`·복원 칩 — 소원·인증이 풀을 부수게 해도 탭 하나로 돌아온다 = §1.10 부정 리뷰 2 대응) · **튜토리얼 Strip**(`ui/strip.ts`, 새 판 첫날 3줄, 탭으로 넘김, `wp.tut` 로 한 번만, 모달 아님·티커 위) · `.ktab` 44px.
- 도구: `tools/shot.ts` — 11 화면을 진짜 탭으로 열어 `tmp-shots/route-*.png` + `contact.png`(4열 시트) · verify G12 절: **7 화면의 보이는 컨트롤 64개 전부 ≥44px · elementFromPoint 5점 제자리**, 프리셋 저장·복원 터치, 튜토리얼 뜸→3탭→닫힘→리로드에 안 뜸.
- 결정: **픽셀 서체는 넣지 않는다** — Galmuri 는 오프라인 반입이 안 되고 외부 폰트 CDN 은 게임이 네트워크에 기대게 한다. 숫자 띠는 시스템 monospace 로 유지(콘택트 시트에서 노랑 숫자·마젠타 일과 알약은 PSS 문법대로 읽힌다).
- 실측 함정: Strip 을 `bottom: bar-h + 8px` 에 두면 **핑크 티커를 덮는다** — `--ticker-h` 를 더해 올린다(토큰을 더하지 리터럴을 박지 말 것). `hidden =` 은 S8 에 걸리므로 Strip·프리셋 줄도 `.khide`. verify 의 `center()` 는 `width < 1` 로 걸러서 `.khide` 요소를 자동으로 건너뛴다.

### G10 — 데이터 전량 + 도달성 (2026-09-03) ✅ 데이터 테스트 76 · 봇 128일 문턱 충족
- 방식: 스키마·검증 조건을 주고 **에이전트 셋에 병렬로** 맡겼다 — A 시설(35 → **91**: 식당 26 · 라운지 21 · 놀이 15 · 장식 22 · 슬라이드 4 · 편의 3, 위키 전표 그대로 + `shop.json` 5티어 52 · `invest.json` 놀이 10/라운지 13) · B 친구(14 → **71**, 10지역 7/7/8/7/8/6/8/8/8/4)·소원(42 → **213**) · C 인증(12 → **24**, 8계열 F~S 사슬·타일 13 전부 정확히 한 번)·재료(40 → **60**)·레시피(60 → **140**: 음료 35·스낵 40·식사 30·디저트 35, 레벨 잠금 29)·궁합 26 식당(모든 레시피가 ≥1 식당에서 ◎).
- 동시 편집 규칙이 먹혔다: 각자 파일을 나누고 `data.test.ts` 는 **자기 핀만 Edit** · B 는 「지금 존재하는 id 만 참조」 · C 는 `unlock:'wish'` 재료를 안 만든다. 합류 뒤 충돌 0.
- 합류 뒤 내가 고친 것: 테스트의 **낡은 가드**(요리·인증 kind 금지 · 재료/타일 보상 금지)를 걷어 냈다 — 평가기는 이미 전 kind 를 알았는데 가드가 데이터를 막고 있었다. 그 탓에 `unlock:'wish'` 재료 6종을 주는 소원이 0 이었다(→ 그 레시피 12종이 영원히 불가) — 지역 2~3 의 ☆☆☆ 소원 6개를 재료 보상으로, 9개를 요리/인증 조건(`recipe served`·`cookingLevel`·`recipeCount`·`certPassed`·`certPasses`)으로 바꿨다. 새 테스트: **wish 재료는 정확히 한 소원이 준다**.
- 봇 8시드×128일(밸런스 성향): 지역 **8** · 인증 **16** · 레시피 **78** · ★4 · 소원 86 · 현금 36만 — 문턱(지역 ≥6·인증 ≥10·레시피 ≥40) 전 시드 충족. ★5 는 친구 50 이 벽(친구 ~40 — 소원 사슬이 후반 지역까지 안 닿는다). 방문은 여전히 **6,300 포화**(동시 48).
- 실측 함정: 봇이 **흩어진 8칸을 한 번에** 파면 합집합이 입구 도달을 끊어 통째로 거절돼 풀이 52칸에서 영영 멈췄다(pool 성향에서 드러났고 balanced 도 같은 코드였다 — 풀 128 → **446**). 한 칸씩 파고, 옆이 다 막히면 새 풀. 봇의 습관이 게임을 작게 재고 있었다 (부모 리포의 P3-A·K52 와 같은 형태).

### G13 — 밸런스 스윕 + 페르소나 봇 (2026-09-03) ✅ `gate g13` 통과 (브라우저 77/77 · vitest 199 · 봇 밴드 7/7)
- 봇 성향 4종(`BOT_PERSONAS`: balanced · pool · restaurant · cert — **판당 하나**, 결정마다 안 뽑는다) + `--persona all` 비교표 + `--bands`(밴드 7개, 각각 **왜 그 값인지**를 옆에 적었다) — 게이트가 G≥10 에서 `bot 8×128 --bands` 를 돈다.
- 8시드×128일 중앙값(balanced): 현금 36만 · 인증 16 · 지역 8 · 레시피 78 · ★4 · 주말/평일 1.77 · 여름/겨울 2.41 · 점수 99,297. 성향 비교: pool 풀 **805**칸/점수 106k · restaurant 시설 90/식당 매출 **58%**/점수 112k · cert 소원 82. 셋 다 128일을 살아남고 인증 16·지역 7~8 에 닿는다 — 「어떤 플레이어든 콘텐츠에 닿는다」.
- 스윕으로 바꾼 밸런스 값: **없다.** 밴드가 첫 실측에서 전부 안에 들어 `balance.json` 은 G3 이후 그대로다 — 조정 창구(`--sweep`)만 열어 둔다.
- 남긴 것(다음 사람에게): ① **방문 6,300 포화** — 동시 상한 48 이 4년차부터 유입 목표를 자른다(G9 실측). 풀리려면 상한을 랭크에 매거나 회전을 올려야 하는데 프레임 예산(p95 16.8ms @48) 을 같이 재야 한다 ② **★5 미달** — 친구 49/50 문턱에 걸린다(8시드 전부 ★4). 소원 사슬이 후반 지역까지 닿게 하거나 ★5 조건을 `friends 45` 로 낮추는 결정 ③ 식당 매출 비중 38~58% — PSS 리뷰의 「요리 비중 과다」(§1.10-4) 경계선. 식당 인기 계수를 봇 스윕으로 낮출 수 있다 ④ 그림은 전부 절차 도형이다 — 「그대로 카피한 느낌」의 마지막 간극은 에셋이다 (`ProceduralProvider` 를 ID 단위로 갈아 끼우는 자리는 있다).
- **G0~G13 전부 종료.** 실행: `cd waterpark && npm run gate -- g13`.

### G14 — 카이로풍 도트 에셋 (2026-09-03) — 코드로 찍은 픽셀 맵 · `gate g13` 재통과
- 왜 코드인가: Codex `image_gen` 이 사용 한도(9/7 11:28 리셋)라 `sprite-gen gen` 이 한 장도 못 뽑았다. 기다리는 대신 **문자 그리드 픽셀 맵**(`src/assets/draw/pix.ts`)으로 직접 찍었다 — 결과물은 같은 도트이고, 그림 파일이 오면 같은 ID 로 provider 만 갈아 끼운다.
- 팔레트: `--px-*` 34색(남색 외곽 `#243055` + 파스텔 2톤 쌍) — 색은 style.css 만 소유(S1). 픽셀 맵 문자 한 글자 = 토큰 하나, `1·2·3` 은 스프라이트별 주제색 슬롯.
- 시설 91종: 템플릿 36개(노점·매장·자판기·밴·화장실·샤워·분수·데크체어·파라솔·테이블·소파 3종·카바나·욕조·아치 샤워·조각 분수·머라이언·통나무집·이글루·물폭탄·카이로봇·소형/대형 슬라이드·화분·꽃·덤불·야자·둥근 나무·침엽수·해바라기·튜브 탑·기둥·폭포) × 주제색 × **간판 아이콘 6×6 24종**(컵·콘·케이크·도넛·버거·피자·그릇·생선·타코·팝콘·빵·샐러드…) — `fac-sprites.ts` 의 `ART` 표 한 줄이 시설 하나. 발밑은 반투명 다이아몬드(13%).
- 손님: **2등신 치비**(머리 10·몸 5·다리 5) · 머리 모양 5 · 피부 4 · 수영복 8 · 표정 4(볼 터치) · 수영은 튜브(수영복 보색). 타일: 잔디 풀포기 V · 모래 알갱이 · 포장 돌 이음 · 실내 널판. 모래·풀 경계선은 `--tile-edge-soft` (격자가 그물처럼 보였다).
- 활강로: 원반 나열 → **탑 출구에서 착수 칸까지 이어진 튜브 선**(외곽 8 · 몸통 6 · 하이라이트 2) + 받침 기둥. 슬라이드 스프라이트의 튜브는 스텁만 남겼다.
- 도구: `npm run gallery` → `tmp-shots/gallery.png` (시설 91 · 손님 32 · 타일 6 한 장). 사람이 「카이로처럼 보이나」를 보는 자리.
- 남긴 것: 실측으로 S1 에서는 1×1 소품(의자·화분)이 작다 — 카이로도 그렇지만 폰에서는 S2 가 기본 체감. 4방향 없음(facing 은 좌우 뒤집기). 초상(SNS 친구 얼굴)은 아직 파란 사각형. 손님 옆모습 없음.
- 검증 후속(같은 날): 사용자 폰에서 「적용 안 됨」 보고 → 캐시 없는 모바일 컨텍스트로 LAN 주소를 열어 지도·건설 창(썸네일)·손님까지 새 그림임을 실측. 옛 번들을 붙드는 브라우저 캐시가 원인이라 (1) `tools/serve-dist.mjs`(no-store) 로 정적 서버 교체 (2) **메뉴 제목에 `도트 v2 · MMDD HH:MM` 빌드 표식** — 어느 판을 보고 있는지 폰에서 바로 읽힌다. 풀 물색 `--pool-clear` 를 카이로 톤(#a6dcff)으로 올리고 물결 줄무늬를 넣었다. gate g13 재통과(77/77).

### G15 — 시설 3D 프리렌더 (2026-09-03) — 「3D 느낌으로 프리렌더」 요청
- 왜: 손으로 찍은 픽셀 맵은 크기·밀도가 레퍼런스(PSS 실화면)의 절반이었다 — 사용자 판정 「너무 대충」. 실측(`docs/pixel-style.md`): 카이로 손님은 폭 0.55타일·키 1타일, 시설은 타일을 꽉 채우는 3면 입체. 이 볼륨을 손으로 91종 찍는 대신 **three.js 로 모델링해 프리렌더**한다 (부모 리포 `prototype-3d` 의 툰·양자화 파이프라인을 스프라이트용으로 재구성).
- 파이프라인: `tools/prerender/` (dev 서버 위 페이지) — `models.ts` 원시 도형 빌더 36종(2D 템플릿과 같은 이름, 같은 `ART` 표의 슬롯 색) → 오소 카메라 요 45°·피치 30°(= 2:1), 1 world = 타일, `32/√2` px/unit → 발자국 아래 꼭짓점을 `(w·16, H)` 에 맞추는 `setViewOffset` → 툰 3단 + 좌상단 광원 → CPU 후처리: 깊이 실루엣 → 남색 외곽 1텍셀, 크리즈 → 0.62 어둡게, `--px-*` 43색 최근접 양자화(가중 RGB, 디더 없음) → 간판 위치(world)에 2D 아이콘 6×6 합성. `tools/prerender.ts`(Playwright Chrome WebGL, swiftshader)가 91×2 facing 을 받아 선반 패킹 → `public/assets/fac-atlas.png`(512×740, 182장) + json.
- 게임: `AtlasProvider` + `HybridProvider`(아틀라스 → 절차 폴백, `?atlas=0` 대조군). `main.ts` 가 부팅 전에 `await loadAtlas()` — 그래서 vite 빌드 타깃 **es2022**(TLA, Safari 15 지원). 손님은 코드 도트 유지(18×32, 2.5등신). 슬라이드 활강로는 씬이 잇는다(3D 는 난간만).
- 게이트: `gate g13` 재실행(아래 실측 기록 참고). 배포 5178/5179 재빌드.
- 남긴 것: 모델은 원시 도형이라 소품 몇 개(카이로봇·머라이언·물폭탄)는 실루엣이 약하다 — 빌더 한 함수씩 손보면 된다. facing 1 은 90° 회전 렌더(2D 뒤집기가 아님). 타일·풀 물은 아직 2D 절차.

### G16 — 시나리오 (2026-09-03) ✅ 브라우저 77/77
- `src/data/story.json`: 인물 3(펌킨 사장·알바 나나·심사위원 마루) + 비트 19(인트로 3줄 · 첫 풀 · 첫 손님 · 첫 사진 · 첫 소원 · 첫 인증 · 랭크 ★1~5 · 2/3/5/8년차 · 지역 3/6 · 레시피 30 · 엔딩). `src/sim/story.ts` `StoryDirector` 가 판 상태(StoryState)로 판정, **비차단 `strip` 사건**으로 적재(모달 아님 — PSS 팝업 과다 대응), 본 비트는 스냅샷 `story` 에.
- ⚠ 판정은 `absTick % 30` 으로 — 「마지막 판정 tick」을 들고 있으면 스냅샷 왕복 뒤 박자가 어긋난다(테스트가 잡았다). 시작 레시피가 21종이라 「레시피 10」 비트가 첫 프레임에 터졌다 → 30.
- UI: `DialogueStrip`(초상 + 화자 이름 + 큐), 초상 `draw/portrait.ts`(손님 머리 도트 2배 24×24) — SNS 친구 행·티커 화자도 같은 얼굴. `?tut=0` 은 대사 전부 끈다(홈 상시 컨트롤 감사가 띠를 센다).

### G17 — 이펙트 (2026-09-03)
- FX 등록부 +6: `splash-land`(슬라이드 착수) · `wish-burst`(별) · `heart-float`(라운지) · `confetti`(화면 좌표, 랭크업·인증·소원) · `fountain-spray`(분수 앰비언트) · `dust-puff`(건설). sim FxEvent +3(`land`·`wish`·`rest`).
- 손님 **이모트**: sim 이 정한다(`g.emote`/`emoteTtl` — 하트·음표·zz·화남·카메라·별, 40tick), 씬은 머리 위에 10×10 아이콘을 그릴 뿐(동시 ≤8). 시설 앰비언트: 분수류 물보라·온천/사우나 김. 축하 배너 `.kbanner`(transform/opacity, reduced-motion 가드).
- ⚠ S6 자가 `cubic-bezier(...)` 의 쉼표를 속성 구분자로 읽는다 — 이름 이징만.

### G18 — 에셋 고도화 (2026-09-03)
- 풀 **코핑**(덩어리 바깥 변 크림 테두리 2px, `drawCoping`) · **물결 3프레임**(`tile/pool:0..2`, 20프레임마다 풀 타일만 setTexture) · 잔디 결 완화(밀도 45% → 22%) · 머라이언 모델 재작업. 아틀라스 재렌더.
- 남긴 것: 손님 소품(모자·선글라스) · 타일 프리렌더 · 소리(아직 오실레이터 15큐) · SNS 타임라인 썸네일.

### G19 — 결산 · 정보 (2026-09-03) ✅ 브라우저 82/82 (「껍데기만 있다」 대응 1/4)
- **하루 결산 카드**(폐장 20:00, 모달 — 카이로의 「오늘의 결과」): 방문·입장료·식당·라운지·유지비·순이익·퇴장 만족·좋아요·파크 인기·전국 순위·오늘의 시설·오늘의 메뉴. **시즌 결산**(4일째)과 **연말 결산**(16일째): 시설 수입 TOP3·메뉴 TOP3·라이벌 5곳과의 순위표·연말 수상(올해의 시설/메뉴/풀). sim 은 사건 `data` 로 표만 적재(`PeriodReport`), UI 는 다시 계산하지 않는다.
- **시설 레벨** 1~5(`popOf`/`capacityOf`/`upgradeCost` 정본 셋): 인기 +15%/단, 정원 +1(3·5단), 비용 = 건설비×0.5×단. 시설 카드에 Lv·누적 이용/수입·「개선」 버튼. **손님 정체성**: 이름 40종(결정론)·나이·성별·동네(열린 지역 중 하나), 오늘 쓴 돈. 손님 카드 = 초상 + 체력/만족 게이지 + 취향 + (친구면) ☆·소원.
- **랭킹 창**(메뉴 「랭킹」): 시설·메뉴·손님·라이벌·기록 5탭. 라이벌 `rivals.json` 5곳(연차마다 인기 성장, 시드 결정론).
- ⚠ 하루 안 결산 누적치(만족 합·메뉴 판매·좋아요 시작값)를 스냅샷 `dayAccum` 에 넣어야 왕복 골든이 산다. ⚠ 검증 스크립트의 `freeze=1` 리로드에 `tut=0` 이 빠져 결산 모달이 켜진 채 뒤 절이 전부 죽었다(19건) — 하네스 URL 은 전부 `tut=0`.

### G20 — 직원 · 청결 (2026-09-03) ✅ 브라우저 85/85 · 봇 밴드 7/7
- `staff.json` 역할 4(안전요원·청소부·마스코트·요리사: 고용비 = 월급×5, 효과 +10%/단, Lv 1~5 = 하루 EXP+1·8마다 승급) · `StaffStore`(rng.world 로 잔디·포장 위를 떠돈다 — **보이는 것**이 요점) · **청결** 0~100(손님 −0.15/명, 청소부 +18·단, 기본 +4; 만족 배율 0.6~1.0). 효과는 `GuestHooks.hpMul/satMul/photoMul` 로 손님 상태기계에 들어가고 요리사는 파크 인기의 메뉴 항에 곱한다. 월급은 유지비에 합산돼 결산 카드에 뜬다.
- UI: 직원 창(고용/직원 탭, 초상·EXP 게이지·해고), 정보 창에 청결·직원 수, 결산 카드에 청결. 씬은 손님 도트를 역할 팔레트로 빌려 그린다.
- 봇: 풀 24칸에 청소부, 48칸에 안전요원, 식당 3+ 에 요리사, 좋아요 3천에 마스코트, 청결 <50 이면 청소부 추가. 실측 8시드×128일: 현금 35만 · ★5 4/8(직원 만족 배율이 친구 EXP 를 밀어 올렸다) · 지역 10.
- ⚠ 터치 감사 오보: 메뉴가 13행이 되자 스크롤에 잘린 행의 중심을 찍어 「도난」으로 잡았다 — 잘린 행은 「보이는 컨트롤」이 아니라고 자를 고쳤다.

### G21 — 랜덤 이벤트 (2026-09-03) — sim 만, 기본 OFF
- `events.json` 14종(TV 취재·축제·폭염·장마·인플루언서·위생 점검·단체 예약·기념품·라이벌 세일·벚꽃·첫눈·신문 특집·분실물·자선) + `RandomEvents`(개장 25%·최소 2일 간격·같은 것 연속 금지·뽑기 정확히 2회) + `resolveEvent(choice)` (비용·좋아요·돈·청결·기간 버프). **UI 배선 안 함** — 조사 결과 PSS 에 없어 `features.randomEvents=false`.

### G22 — 카이로 페이싱 · 기능 스위치 (2026-09-03) — 조사 문서 `docs/research/kairo-mainsystem-2026-09-03.md` 의 결정 반영
- 사용자 결정: **하루 210초** · PSS 에 없는 축 **전부 OFF** · 결산 카드는 **시즌 말·연말만**.
- 시간: `TICKS_PER_HOUR 60 → 140` (하루 1,680 tick × 125ms = 210초, 8년 = 7.5h). 걸음은 tick 당 그대로(속도 유지), 체류는 balance 로 하루 기준 재조정(`swimTicks 40→93`, `wanderTicks 12→28`), 데이터의 `useTicks`(분)은 `TICK_SCALE` 로 환산. 상점 입고·심사·유입 창은 `TICKS_PER_HOUR` 파생이라 자동. ⚠ 테스트·하네스에 박힌 `720/719/540/420/×60` 리터럴 7곳이 전부 깨졌다 — 상수로 바꿨다 (`window.__wp.TPD`·`JUDGE_TICK`).
- `features.json`: staff·facilityLevels·randomEvents·rivals·dailyResults = false. sim 이 명령 단계에서 거절하고(`canHire`/`canUpgrade`/`roll`), UI 는 메뉴·버튼·탭을 숨기고, 결산 카드의 순위 줄은 `rankPos 0` 이면 안 그린다. 하네스는 `window.__wp.features.x = true` 로 켜서 그 절만 검사한다.
- 봇 8시드×128일(210초 하루): 현금 90만 · 인증 16 · 지역 10 · ★5 4/8 · 밴드 7/7 유지. 방문 7,051 — 여전히 동시 48 포화(§5 다음 항목).

### G23 — 되먹임 노출 (2026-09-03) — 조사 §5-2
- 친구 머리 위 **만족 게이지**(★ + 막대, `gauge/{0..10}` 텍스처) · **SNS 타임라인 = 사진 썸네일 + 글쓴이 초상 + ♥**(썸네일은 사진 순간 화면을 48×32 로 찍고, 화면 밖이면 피사체 스프라이트+손님으로 합성 — PSS 는 언제나 사진이 있다) · **「소원 성립!」 배너**(초상은 티커 화자) · **하단 캡슐에 지금 온 SNS 친구 초상+이름**(있으면 「인기」 글자를 감춘다 — 폭이 모자라 줄바꿈됐다) · **심사 무대**(카드 위 심사위원 셋, 조건 줄마다 심사위원 초상) · **목표 3슬롯 티커**(A 지금 할 일/소원 · B 다음 랭크 조건 · C 가장 가까운 인증 예상 점수, 6초 회전) · 건설 카탈로그 썸네일 56px + 슬라이드 층·칸 표기.
- ⚠ Phaser 스냅샷은 **버퍼 좌표**(텍셀)다 — 업스케일 배율을 곱하면 항상 화면 밖으로 판정돼 한 장도 안 찍혔다.
- 검증 89/89 (G23 절 4건: 이틀 뒤 글·방문 친구, 타임라인 초상+썸네일 전수, 심사 무대 15 초상, 티커). ⚠ 헤드리스로 감는 동안 생긴 글은 사진 순간의 화면이 없다 — 썸네일은 **그릴 때 합성**해야 전수가 찬다.

### G24 — 다음 후보 셋 (2026-09-03) ✅ 브라우저 92/92
- **건설 카탈로그 카드 격자**(3열, 그림 64×56, 이름·부제·가격, 잠김은 자물쇠 배지) — PSS 카탈로그 문법. `[data-facility]`·`.kthumb canvas` 는 그대로라 앞 절 검사가 안 깨진다.
- **동시 손님 상한 = 40 + 랭크×12**(★5 = 100, `maxGuests()`). 봇 8시드×128일: 방문 6,353 → **11,473**(포화 해제) · 현금 277만(밴드 상한 300만 근처 — 다음 밸런스 후보) · 밴드 7/7. G9 프레임 검사 통과.
- **소리**: 효과음 12큐(아르페지오 — 물보라·사진·건설·소원·랭크업·인증·좋아요 추가) + **8마디 칩튠 BGM 루프**(사각파 멜로디 + 삼각파 베이스, 100ms 룩어헤드 스케줄러, 첫 제스처에 시작) · 메뉴에 소리/BGM 토글(`wp.sound`/`wp.bgm` 저장). 파일 0장.

### G25 — 시작 파크 + 물·지면 재질 (2026-09-03) — 계획 v2 §2
- **시작 킷**(`startkit.ts`): 풀 4×5(20칸) · 화장실 · 자판기 · 데크체어 2 · 화분 · 야자수 2 를 **물려받는다**(`placeFacility(..., { inherited: true })` — 해금·돈을 안 본다). 새 판 카메라는 그 풀을 비춘다. 인트로 대사 「빈 땅」 → 「작은 풀장을 물려받았다」, 첫 비트 「풀 20칸」.
- 물: **다이아몬드 반짝 무늬** 3프레임(PSS R6) · 코핑 = **흰 타일 띠 3px + 물 쪽 파란 선** · 실내 경계는 유리 띠 · 토지 밖 **나무 띠**(야자·소나무·둥근 나무, 2칸 간격).
- 봇 8시드×128일: 현금 264만 · 방문 11,778 · 밴드 7/7 (1년차 말 현금 12.8만 — 킷이 초반을 밀지만 밴드 안).
- ⚠ 시작 킷은 「빈 판」 전제의 테스트 5건과 하네스 절 20건을 깼다(입구 왼쪽 위가 하네스의 기준 칸이었다) — 단위는 `new Game(seed, undefined, { kit: false })`, 하네스는 URL `kit=0`(G25 절만 킷을 켠다). 게이트 g25: verify 94 · vitest 199 · 봇 밴드 7/7. ⚠ 시작 킷 시설 중 화분·야자수는 시작 해금이 아니라 첫 판이 4개만 놓였다 — `inherited` 로 해금을 우회.

### G26 — 손님 생활 (2026-09-03) — 계획 v2 §3
- **슬라이드 탑승**: `walk → climb(탑 칸, 높이 levels×8 로 오른다) → ride(활강로 칸을 4tick 씩, 튜브 위 좌표를 따라 내려온다) → 착수`. 출구 다음 칸이 풀이면 그 풀에 뛰어들어 수영(체류 절반), 아니면 뭍으로. `FacilityStore.lane/slideTop` 이 렌더의 `drawLanes` 와 같은 칸을 쓴다.
- **튜브 6종**(링 3색·오리·범고래·카약): 선물받은 친구는 자기 튜브(`FLOAT_BY_GIFT`), 나머지는 30%. 수영 중 31tick 마다 같은 풀의 이웃 칸으로 **떠다닌다**.
- **눕기·앉기**: 라운지 이용 때 시설 칸 위로 올라간다 — 의자·카바나·파라솔 = `lie`, 테이블·소파 = `sit`. **R3**: 식당에서 사면 `carry` 로 가장 가까운 빈 라운지를 찾아 앉고(음표), 없으면 12tick 서서 먹는다(`eat`).
- **HP 배터리**(R4): hp < 30 이면 머리 위 빨간 배터리 · **체형**: 나이 ≤12 어린이(2등신) · ≥58 회색 머리 · **구매 팝**: 「레몬에이드 ×1 +300G」 손님 머리 위.
- 게이트 g26: verify 97 · vitest 202(+3 G26) · 봇 밴드 7/7 (현금 중앙 233만 · 방문 11,605).
- ⚠ **떠다니기가 손님을 증발시켰다** — 풀 안쪽 칸에서 나올 때 인접 뭍이 없으면 그 자리에서 `wander` → 모든 목표가 도달 불가 → 즉시 `gone`. 방문 965 → 1,506(16일)·현금 503만으로 밴드가 잡았다. `nearestWalkable`(맨해튼 반경 6)로 물가로 헤엄쳐 나온다.
- ⚠ 텍스처 키의 **무드는 마지막 세그먼트**여야 한다 — G9 절이 `split('/').pop()` 으로 읽는다. 체형·튜브는 첫 세그먼트에 `:kid`·`:f3` 로 붙였다.

### G27 — 사건 밀도 (2026-09-03) — 계획 v2 §4
- **달력 7 → 24건**(`calendar.json`): R1 시점 — 첫날 밤 장미 · 3일차 크레페 · 첫 주말 튜브(오리)·복숭아 · 여름 첫날 17:00 수영복 · 17:20 상점 · 여름 주말 19:00 첫 불꽃 · 가을 심사 응원 · 첫 인증 뒤 이동 도구 · 겨울 17:00 조명 · 2~8년차 봄 사장 방문(재료·아이템·지원금) · ★3 카이로봇(조건부). 봇 128일에 **24/24 발동**(단위). 연출용 2건은 `priority: inbox`(모달 아님).
- **계절 연출**(FX 등록부 +4): 봄 `petal-fall` · 여름 주말 19시 `fireworks`(화면 좌표, 4색) · 가을 `leaf-fall` · 겨울 17시 `lamp-twinkle` + 남색 틴트(`setIllumination`). `fxFired` 카운터로 「슬롯이 돈다」를 잰다.
- **친구 첫 방문 대사**(`lines.ts`): 템플릿 6 × 취향(색·향·음식) 삽입, id 해시로 고정(난수 0). 71명 전수 단위 검사.
- **소원 보상 「상자 열기」**: 메시지 탭의 달성 소원에 버튼 → 징글 + 색종이 + 배너. 보상은 이미 sim 이 줬고 표현 상태는 localStorage(`wp.wishOpened`).
- **알림함 창**(`inbox.ts`): 최근 50건, 안 읽은 것 굵게, 열면 읽음. 메뉴 행에 미읽음 수.
- 게이트 g27: verify 101 · vitest 204 · 봇 밴드 7/7 (현금 중앙 231만).
- ⚠ **씬이 뜨기 전에 fx 를 부르면 rAF 루프가 죽는다** — 첫 프레임에 `scene.add` 가 없어 예외 → `requestAnimationFrame` 이 다시 안 걸려 게임 전체가 멈췄다(하네스 6절이 연쇄 실패). `scene.sys.isActive()` 가드.

### G29 — UI 마감 (2026-09-03) — 계획 v2 §6
- **픽셀 서체**: Galmuri11 정체·굵게 woff2 를 `public/fonts/` 에 셀프호스트(OFL, `OFL-Galmuri.txt`) → `--font-pixel-family` 첫 후보가 실제로 로드된다(외부 요청 0, 하네스가 `document.fonts` 로 잰다).
- **탭 아이콘 12**: 건설 6(편의·라운지·식당·놀이·슬라이드·장식) · SNS 3(타임라인·메시지·친구) + HUD 계절 4·날씨 4 — 아이콘 등록부(`icons.ts`) 17개 추가.
- **창 색조**: SNS 분홍 · 상점 초록 · 결산 금색(`WindowPanel` tone 5종) · 창 열림 160ms(transform/opacity, 모션 가드).
- 게이트 g29: verify 103 · check-ui 통과.
- ⚠ GitHub 원본 저장소의 LICENSE 경로가 404 라 OFL 본문 대신 출처·라이선스 URL 메모를 두었다.

### G30 — 밸런스·엔드게임 (2026-09-03) — 계획 v2 §7
- **R2 좋아요 리셋**: 아이템 투입으로 풀 **색이 바뀌면** 그 풀 좋아요 0(만료·병합은 제외). 넣기 전 칩에 「색 바뀜 → 좋아요 N 리셋」 경고(`previewItem` — 가상 풀에 `computePoolState`), 넣은 뒤 토스트가 프리셋 복원을 가리킨다.
- **후반 곡선**: 유지비 × `maintRankMul`^rank(1.15, ★5 ≈ ×2) · 호화 상품 3종(크리스털 분수 16,200 · 그랜드 아치 12,600 · 문라이트 타워 19,800 — cost/pop 90 회귀 유지, ★4~5 상점).
- **티켓 = 만족 레벨**(R9): base × (1 + 0.25 × 레벨 0~3). 친구는 ☆ 수, 일반 손님은 **어제 퇴장 만족 평균**(25 단위) — 한 규칙.
- **봇 밴드 +1**: `lateSpendRatio`(5~8년차 지출/전체) 0.34 ∈ [0.3, 0.85]. 지출은 `spend()` 한 곳에서 누적(`stats.spent`).
- 게이트 g30: verify 105 · vitest 207 · 밴드 8/8 (현금 중앙 232만).
- ⚠ 「5~10만G 시설」은 못 넣었다 — `cost/pop ≈ 90` 회귀 검사 아래에서 인기 500+ 짜리 시설이 되어 파크 인기 눈금을 부순다. 상한을 2만G 로 잡았다.

### G31 — 소리 (2026-09-03) — 계획 v2 §8
- **계절 BGM 4곡**(봄 꽃길 · 여름 물보라 · 가을 낙엽(단조·삼각파) · 겨울 조명(사인파, 성긴 음)) — 같은 시퀀서, 계절이 바뀌면 표만 바꿔 마디가 자연스럽게 이어진다. **징글 3**(심사 결과 · 시즌/연말 결산 · 엔딩)은 도는 동안 BGM 을 1/4 로 줄인다. **볼륨**(100/75/50/25, `wp.vol`)은 효과음·BGM 공통.
- 파일은 여전히 0장 — 전부 오실레이터.

### G32 — 실기 (2026-09-03) — 계획 v2 §8
- **세로 고정**: 가로(높이 ≤ 500)에서 `#krotate` 안내가 화면을 덮는다.
- **실기 체크리스트** `waterpark/docs/human-check.md` 25항목(30분 플레이 · 핀치 · 저장 · BGM 언락 · 세로 · 서체 · 오프라인). ⚠ **전부 ⬜** — 자동 게이트 g32(verify 107 · vitest 207 · 밴드 8/8)는 통과했지만 사람이 안 돌렸으므로 「완료」라고 쓰지 않는다.
- 계획 v2 의 G25~G32 가 전부 자동 게이트를 지났다. 남은 것: **G28 AI 아틀라스(9/7 Codex 재개 뒤)** · 실기 F부.

### G33 — 요리 레벨 소급 + 좋아요 유입 (2026-09-03) — 부족분 재조사 권고 1
- **요리 레벨 배수**가 가격뿐 아니라 **맛(HP)·인기(만족)** 에도 곱해진다(`game.ts` 구매 훅, 메뉴 창에 `(Lv10)` 표기). 매뉴얼 「높은 레벨 = 더 좋은 스탯」.
- **유입식에 좋아요 항**: `min(arrivalLikesCap 20, totalLikes × 0.002)` — 포화형(원안 `likes·0.004` 는 10만 좋아요에서 유입을 독점). 좋아요 5,000 → 유입 목표 13.9 → 22.9.
- 유입이 늘어 현금 중앙 287만(밴드 상한 96%) → `maintRankMul` 1.15 → **1.2** 로 265만.
- 게이트 g33: verify 108 · vitest 209 · 밴드 8/8.
- ⚠ 봇 128일 단위 검사 2건이 vitest 기본 5초를 넘기기 시작했다(6.0s) — 30초 타임아웃 명시. 손님 상태기계가 무거워진 만큼 앞으로도 볼 것.

### G34 — 대기 줄 · 폐장 행렬 · 비 (2026-09-03) — 부족분 재조사 권고 2
- **대기 줄**: 가득 찬 시설은 후보에서 빼지 않고 절반 가중으로 남긴다 → 도착하면 `queue`(최대 3, 순번 `queuePos`), 자리가 나면 순번 0 부터 들어가고 뒤가 당겨진다. 참을성 48tick 이 다하면 만족 −3 · 「너무 오래 기다렸어」. 렌더는 순번마다 (−6, +4) 텍셀 비켜 세운다.
- **폐장 1시간 전**(`CLOSING_TICK`): 새 입장 0, 노는 손님(wander·queue·eat)은 입구로, 하던 것(swim·use·ride)은 마친 뒤 나간다. 폐장 `flush` 는 잔류만 치운다.
- **비**: 야외 풀 가중 ×0.4 · 실내 ×2.5, 둘러보다 12% 가 「비 오네…」 하고 돌아간다.
- 게이트 g34: verify 110 · vitest 212 · 밴드 8/8. ⚠ 현금 중앙 **292만(상한 97%)** — 줄이 생기면서 시설 이용이 늘어 요금·식당 수입이 올랐다. G37(랭크 보상 상점·호화 구매·비상 자금)에서 싱크를 같이 본다.
- ⚠ 하네스의 `skip()` 은 프레임처럼 `say` 를 소비한다 — 대사로 판정하지 말고 상태+이모트로 잰다. 씬 좌표는 evaluate 사이에 한 프레임을 기다려야 갱신된다.

### G35 — 인증 조건 다양화 · 재수상 3 · 결과 창 (2026-09-03) — 부족분 재조사 권고 3
- 조건 DSL `pool{tile}`(타일 절반 이상) 추가 · 인증 10건에 **강도·좋아요·인기·실내·타일** 조건을 넣어 24종이 5축을 다 쓴다(단위 검사가 지킨다). 타일 조건은 `requires` 사슬이 먼저 그 타일을 주는 인증에만.
- **재통과 = 재료 3**(원작) · **근소 실패(합격선 −3 이내) = 재료 1**. `certs.lastRewards` 로 창이 읽는다.
- **심사 결과 창**(`cert-result.ts`, 모달): 심사위원 카드 3장이 차례로 뒤집히고(transform/opacity) 합계 위에 합격/불합격 **도장**. 축하 모달 채널 복구 — 토스트는 창이 떠 있으면 생략.
- 게이트 g35: verify 111 · vitest 215 · 밴드 8/8. 현금 297만(99%) → `maintRankMul` 1.2 → **1.25** 로 273만. ⚠ 세 번째 유지비 조정 — 이 레버는 여기까지. 후반 싱크는 G37 에서 구조(호화 구매·비상 자금)로 푼다.
- ⚠ S2: 인라인 `--judge-index` 커스텀 속성은 `:root` 토큰이 아니라 걸린다 — `nth-child` 지연으로.

### G36 — 계절 벡터 · 실내 전용 · AB 출구 (2026-09-03) — 부족분 재조사 권고 4
- 시설 `season[4]` 를 파크 인기에 더한다(`totalPopularity(season)`) — 핫텁 봄 +1 · 겨울 +3, 이글루 여름 +4. 그동안 94종 전부 죽은 데이터였다.
- `indoorOnly`(이글루·사우나) — 발자국 전부가 실내 바닥이어야 놓인다. 거절 사유가 방법(풀 편집 → 실내 바닥)을 말한다.
- 슬라이드 AB 는 **출구 다음 칸이 그 풀일 때만**(`landsHere`). 활강로 옆 풀은 0.
- verify 112 · vitest 218.

### G37 — 후반 싱크 (2026-09-03) — 부족분 재조사 권고 5
- **타일 갈기** `retilePool(poolId, tileId)`: 풀 정보 창 칩(인기 순, 비용 = 타일가 × 칸). 원작의 후반 큰 지출.
- **비상 자금** 2,000G(원작 Emergency Fund): 폐장 잔고 음수면 채우고 `stats.bailouts` 를 센다 — 파산 없음.
- **봇이 사람처럼 쓴다**: 낮 12시·15시에 풀마다 아이템 셋까지 다시 채운다(아이템은 2~4시간이면 사라진다 — 원작의 상시 지출) · 돈이 남으면 가장 좋은 타일로 갈고 호화 상품을 산다.
- 밴드: 현금 306만(밖) → **199만** · lateSpendRatio 0.35 → **0.46**. 유지비 레버 없이 구조로 잡았다. ⚠ 타일 갈기·호화 구매만으로는 안 움직였다(한 번짜리 지출) — 돈을 움직인 것은 **아이템 재보충**이었다.
- 게이트 g37: verify 113 · vitest 220 · 밴드 8/8.

### G38 — NG+ 누적 · DSL 마감 · 위생 (2026-09-03) — 부족분 재조사 권고 6
- **NG+ 티켓 가산이 회차마다 누적**된다(+60G/회차, 5회차 상한). 예전엔 `prev` 를 무시해 3회차도 2회차와 같았다.
- 조건 월드의 풀 아이템은 **살아 있는 것만**(만료됐지만 아직 안 치워진 것 제외) — §2.3 `item{active}` 는 스키마에 받되 언제나 참. `facilityOnPool` 은 **구현 안 함**: 우리 격자에서 시설은 풀 칸 위에 못 놓이므로 뜻이 없다(§2.3 에서 지운다).
- 위생(이식 가이드 §6): 낡은 주석 5곳(clock 720 · cert · pool-state G8 · schema useTicks/hours · save) · 「점수 산출은 G11 에서」 사용자 문구 · manifest 손님 14×24 → 18×32 · `scene.staffCountForTest` 신설 · 빈 `ui/overlays/` 삭제.
- 게이트 g38: vitest 222 · 밴드 8/8 · verify 113. 부족분 재조사 권고 1~6 전부 소화. 남은 것: 랜덤 이벤트 UI(끌지 결정), 대기 줄 렌더의 「탑 아래 줄」(지금은 입구 칸), 식당 매출 비중 밴드.

### G39 — 랜덤 이벤트 (2026-09-03) — 사용자 결정 「필수」
- `features.randomEvents` **ON**. 사건 선택 창(`choice.ts`, 모달): 본문 + 선택지마다 **비용·효과를 미리 적는다**(「실패는 내 선택 때문이어야」). 돈이 모자란 선택지는 비활성. 저장 당시 열려 있던 사건은 부팅 때 다시 묻는다.
- 사건은 인터럽트 예산 밖이다 — 답을 받아야 진행되므로 인박스로 강등하지 않는다.
- 봇은 개장·낮 두 번 답한다(예비비 안이면 첫 선택지, 아니면 공짜 선택지) — 64일에 뜬 사건 전부 답함(단위).
- 하네스: `?events=0` 으로 사건을 끄고(모달이 다른 절을 막았다 — 19절 연쇄 실패) G39 절만 `features.randomEvents` 를 켠다.
- 게이트 g39: verify 114 · vitest 224 · 밴드 8/8(현금 194만).

### G40 — 시뮬레이터 선검사 + 폰 진단 오버레이 (2026-09-03)
- `?diag=1`: 콘솔 없는 폰에서 `error`/`unhandledrejection` 과 부팅 요약(UA · WebGL · `__wp`)을 화면 위에 띄운다(`index.html` 인라인 — 번들이 안 뜨는 경우도 잡아야 하므로 모듈 밖).
- iOS 시뮬레이터(iPhone 17e, iOS 18.7 Safari)로 실기 목록 4항목 선검사: 첫 화면·MENU 탭·회전 안내·픽셀 서체 OK. **첫 로드 1회 지도가 비었다**(재현 안 됨, 오류 0) — 실기에서 다시 볼 것. 가로 안내가 반투명이라 불투명으로.
- 게이트 g39 통과 뒤 변경이라 g40 은 CSS 한 줄 — check-ui 로 충분.

### G40 — 버스 · 지역 보상 (2026-09-03) — 계획 v3 §G40 (원작 [B][J])
- **버스 송영** 캠페인: 배수가 아니라 **지역을 골라** 내일부터 2일간 매일 아침 버스 1대(12명). 캠페인 창의 버스 행 → 열린 지역 목록(친구 수 · 열린 소원 · 내일 버스 대수) → 지역 터치로 예약. 봇은 열린 소원이 가장 많은 지역으로 보낸다.
- **좋아요 버스**: 지역 좋아요가 350 쌓일 때마다 다음날 아침 자동 1대(하루 최대 3대) + 350·700 에서 주민 선물(아이템·1,500G). `sns.busGiven` 이 문턱을 기억한다.
- 버스 상태기계(`in → stop → out`, 08:26 도착, 4tick 마다 한 명 하차)는 sim 이 들고 렌더가 보간한다. 버스 손님은 동시 상한을 넘겨도 내린다(원작: 버스 날은 붐빈다). 그 지역 친구가 먼저 내린다.
- **SNS 배지 = 안 본 글 수**(원작 규칙). 타임라인을 열면 0.
- 밴드 `busGuestsShare` 0.28 ∈ [0.08, 0.3] · 게이트 g40: verify 117 · vitest 228.
- ⚠ 첫 판은 사다리 3단(300/600/1000)·쿨다운 8일이라 버스 몫 5% 로 밴드 아래였다 — 원작은 좋아요가 「일정량 될 때마다」 계속 오므로 `busEvery: 350` 로 바꿨다.
- ⚠ 하루 중 남은 버스(`busesToday`)를 스냅샷에 안 넣어 골든 왕복이 깨졌다 — 아침 큐·오늘 큐·도로 위 버스 셋 다 저장한다.
- ⚠ 번호 충돌: 다른 세션이 같은 날 G31~G39 를 닫아 두어 계획 v3 는 G40~G45 로 옮겼다.

### G41 — 요리 = ★2 · 요리 키우기 · 실패 요리 (2026-09-03) — 계획 v3 §G41 (원작 [J][B][S])
- **요리 개발은 ★2 랭크업 보상**(`ranks.json` reward `unlock:cooking`, `COOK_UNLOCK_RANK`). 연차 조건·2년차 모달 삭제, 잠금 사유 「★2」. 하네스 G7 은 `rank=2 + openLand(2)` 로 연다.
- **재료 등급**(`ingredients.json class` 9종) + **와일드카드 키** `@fruit` 등 12종(과일 크레페·디럭스 크레페·과일 샐러드·믹스 주스·과일 셔벗·과일 아이스바·과일 소다·해물튀김·해산물 피자·해물볶음밥·통구이·타코). 매칭 순서 ① 정확 키 → ② 와일드카드(재료 많은 쪽) → ③ 강화 사슬 → ④ 실패작.
- **강화 사슬 8**(`upgradeOf`): 크레페+과일 → 과일 크레페 · 도넛+초콜릿 → 초코 도넛 · 햄버거+치즈+토마토 → 치즈버거 · 팝콘+캐러멜 · 에그 크레페+닭 · 바닐라+원두 → 아포가토 · 팬케이크+과일 · 오렌지주스+탄산+설탕 → 과일 소다. 상한(인기 ≤ +5 · 가격 ≤ ×1.6)을 데이터 검사가 지킨다 — 참치마요 크레페·아이스커피는 상한 밖이라 뺐다.
- **실패작 4**(`unlock: 'fail'`, 레시피 144): 채소만 야채 찌꺼기 · 곡물만 탄 빵 · 고기 들어가면 쓰쿠네 · 그 외 수상한 주스. `cook()` 은 언제나 요리를 돌려준다(EXP 8). 도감 「실패작」 절.
- 도감 행 **「설정」** 버튼(`fillFor`) · 결과 창 「강화! A → B」 · 창을 열면 칩이 비워진다.
- 봇: `fillFor` 로 와일드카드 레시피도 노린다. 밴드 레시피 중앙 83 ∈ [40,140] · 현금 256만 · 게이트 g41: verify 119 · vitest 236.
- ⚠ 축소 데이터(단위 검사)에 실패작 레시피가 없으면 `failDish` 가 합성 레시피를 돌려준다 — 「실패해도 요리」 계약은 데이터가 없어도 산다.

### G42 — 풀 상세 · 심사 만점 조건 (2026-09-03) — 계획 v3 §G42 (원작 [B][J])
- **아이템 7일 규칙**: `days: 7`, 만료 = 넣은 날 + 7일의 폐장. 같은 풀에 또 넣으면 **먼저 것의 만료를 물려받는다**(개수 무관). 값은 ×3(회당 300~1,200G — 하루 두세 번에서 반년에 한 번으로 리듬이 바뀌었다). 풀 정보 「아이템 N개 · 남은 M일」.
- **풀 상세**(`PoolState.detail`): 색 비중 · **농도 5칸 = 강도 × 주된 색 비중**(다른 색이 섞이면 내려간다, 무지개는 예외) · 향 출처(아이템/옆 시설, 동점은 아이템) · 계절 이상 수온(봄 27·여름 24·가을 28·겨울 36, 실내 28) · 무지개까지 부족한 색. 풀 정보 창의 색·향·온도 행을 탭하면 펼쳐진다.
- **이상 수온 → 체류** `swimTicks × (0.85 + 0.3·fit)` (총량 중립 — 처음 0.7~1.0 으로 두었더니 체류가 짧아져 방문·현금이 뛰었다).
- **심사 만점 = 농도**: 색·향 조건은 충족해도 진행률 `0.6 + 0.4·농도/5`. 심사 창 조건 아래 「만점: 농도 5/5 · 지금 N/5」. `Verdict.full`.
- 밴드: 아이템 지출이 줄어 현금 중앙 305만 → `poolMaintPerPop` 0.5 → 0.65 로 299만. 게이트 g42: verify 121 · vitest 241.
- ⚠ 「다른 색이 섞이면 농도 ↓」를 총 가중치로 재면 반대로 올라간다(블루베리는 가중치 2) — 농도에 주된 색 비중을 곱해야 원작 서술과 맞는다.

### G43 — 사장 선물 실물 · 시작 시설 · 한 줄 UI 넷 (2026-09-03) — 계획 v3 §G43 (원작 [S][J])
- **사장 선물 실물**: 첫날 폐장 직전 **서양식 화분**, 첫 주말 10시 **비치체어**(둘 다 `unlock: gift` — 상점에서 뺐다) · 이동 도구는 날짜가 아니라 **첫 합격 뒤 9일째**(`afterCertDays`, `firstCertPassDay` 스냅샷).
- **시작 시설 원작 구성**: 샤워 = 치맛바람 엄마 소원 ☆1 보상 · 유수풀 = ★1 랭크업 보상 · 주스 가게 = 상점 ★1. 인트로 대사도 「화장실과 자판기」로.
- **손님 창 선물**: 친구 손님 창에 튜브·수영복 선물 칩(해금된 것만, 원작 손님 화면 왼쪽 아래 버튼).
- **배치 중 우측 칸**: 숨기지 않고 반투명(0.45)으로 남기고 탭하면 「먼저 배치를 마치세요」 토스트 · 독 첫 줄에 「다른 메뉴는 취소 뒤에」. **폰 첫 화면**: 부팅 5초 안 리사이즈면 시작 칸(물려받은 풀)을 다시 비춘다.
- 밴드: 현금 상한 300만 → **400만**(G40 버스가 방문 +25%, 시드별 265~394만 — 원작도 후반은 돈이 남는다) · 게이트 g43: verify 124 · vitest 244.
- ⚠ 유지비 계수로 현금 중앙을 누르려 했더니 0.65 → 0.8 이 −2% 뿐이었다(341 → 335만). 원인이 유입(버스)이라 지출 계수로는 안 잡힌다 — 밴드를 원인에 맞춰 옮겼다.

### G44 — 심사 조건표 24건 (2026-09-03) — 계획 v3 §G44 (원작 [S] 심사관 A/B/C 표)
- `certs.json` 24건을 원작 표대로 재작성: **조건 가중치 합 = 3 = 심사관 3명**(같은 조건 둘이면 가중치 2). 노멀 계열은 F→**D**→B→A→S(옛 C 를 D 로). S 카이로 풀장 = 좋아요 2,000 + 80칸 + 골든 카이로봇(풀 옆) · 열대의 향기 = 야자수(풀 옆)+트로피컬 향+무지개 · 상급 어트랙션 = 깜짝 양동이+공연 카이로봇+3단 슬라이드(`any` 블루/오두막) 등.
- 보상도 표대로: **타일 12(표준 제외 전부, 각 한 번)** · **튜브 12**(카이로군·오리·바다/강/꿈꾸는 범고래·카약·도넛·바나나·수박·해먹·홍학·조개 — `gifts.json` 8 → 18). 첫 주말 사장 선물 튜브는 파란 링 튜브(소원 보상 겸)로.
- 원작 판독 규칙: 「인기 있는 풀장」 = 풀 인기(`popMin`) · 「인기도 N 이상」 = 파크 인기(`popularity`) · S 의 「인기 있는 풀장」 = 좋아요 2,000. 다른 세션의 G35 검사(강도·좋아요·인기·실내·타일 축 각 1)를 원작 문구가 허용하는 자리(상급 색채 농도 40 · 상급 온천 실내 · 상급 노멀 모래 타일)에 두어 지켰다.
- 게이트 g44: verify 125 · vitest 245 · 밴드 인증 중앙 16.
- ⚠ 원작 표의 「B 상급 색채 15점」은 계열 안 합격선 단조(우리 검사)와 어긋나 25 로 두었다.

### G45 — 밸런스 재측정 (2026-09-03 밤) — 계획 v3 §G45
- 밴드 7 → **10**: `busGuestsShare`(G40) · `lateSpendRatio`(G30) · **`rank3Year` ∈ [1,3] · `rank5Year` ∈ [5,8] · `foodShare` ∈ [0.25,0.65]**(G45). 현금 상한은 400만(G43).
- **랭크 문턱을 실측 곡선에 다시 놓았다**: 옛 인기 문턱 80/150/250/400/600 은 1년차 인기 800 앞에서 전부 죽어 있었고 ★5 는 「친구 50명」 하나가 8년차까지 막았다. 새 문턱 = 인기 200/1000/1400/2600/4200 · 인증 1/2/4/7/10 · 친구 –/10/18/30/44 · 지역 ★5 = 7. 실측: ★3 중앙 3년차 · ★5 중앙 7년차(계획 §2.6 「★3 ≤Y3 · ★5 Y6~Y7」).
- 성향 4종(8시드 × 128일):
```
balanced   현금  3,100,485 · 방문 14563 · 풀 466 · 시설 76 · 인기 5760 · 인증 16 · ★5 · 레시피 73 · 식당 42% · 지역 10 · 소원 92 · 점수 157769
  pool       현금  3,051,343 · 방문 15889 · 풀 869 · 시설 71 · 인기 7086 · 인증 16 · ★5 · 레시피 77 · 식당 36% · 지역 10 · 소원 83 · 점수 147130
  restaurant 현금  4,716,020 · 방문 14534 · 풀 471 · 시설 103 · 인기 8473 · 인증 16 · ★5 · 레시피 95 · 식당 62% · 지역 10 · 소원 87 · 점수 191946
  cert       현금  3,109,088 · 방문 14550 · 풀 469 · 시설 76 · 인기 5863 · 인증 16 · ★5 · 레시피 78 · 식당 43% · 지역 10 · 소원 86 · 점수 151935
```
- 게이트 g45: verify 125 · vitest 245 · 밴드 10/10.
- ⚠ 인기 곡선(Y1 800 → Y8 6,400)은 G40 버스·G42 이상 수온·G44 심사표가 다 들어간 뒤의 값이다 — 유입을 바꾸는 G 가 또 오면 랭크 문턱을 같이 재라.

### G46 — 카이로식 창 문법 1차 (2026-09-03 밤) — 사용자 요청 「버튼 눌렀을 때 나오는 결과 화면·배치·결산을 카이로소프트처럼」
- 원작 홈(Steam 스샷 2장)과 우리 창 17개를 같은 크기로 찍어 대조했다. 우리는 「크림 창 + 글자 행」 한 벌뿐이었다.
- **확인 대화상자**(`ui/dialog.ts`, PanelHost 밖): 투자·캠페인(광고·버스 지역)·심사 신청·상점 구입·선물(SNS·손님 창)·타일 갈기·프리셋 복원 앞에 「N G 를 쓸까요? 아니오/예」. 아이템 투입·요리 개발은 잦은 행동이라 그대로. 하네스는 `confirm=0` 으로 자동 승인, G46 절만 실제로 누른다.
- **축하 팝업**(`windows/celebrate.ts`, 모달): 랭크업·심사 결과·지역 개방·사장 선물 같은 `priority: modal` 사건이 토스트가 아니라 큰 아이콘 + 제목 + 확인 창. 모달 예산(분당 1)은 그대로. 하네스(tut=0)에선 토스트로 남고 `celebrate=1` 로 켠다.
- **결산 타일**: 결산 창 위에 방문·수입·순이익 큰 숫자 3칸(하루 카드는 2칸). **숫자 알약**(`.knum` 남색 위 노란 픽셀 숫자) + **행 아이콘**을 정보·풀·시설 창에. 시설 창 위에 스프라이트 썸네일.
- **메뉴**: 제목 「메뉴」(빌드 표식은 debug 에서만) · 항목마다 한 줄 설명 · 운영/경제 활동/정보/시스템 구분 머리.
- 게이트 g46: verify 128. 아이콘 `gift` 추가(등록부 39).
- 남긴 것(2차): 건설 카탈로그 NEW 배지 · 요리 재료 칩 아이콘 · 심사 무대 조명·관중 · 홈 인기 캡슐 「Total Popularity」 스타일 · 창 크기를 내용에 맞추기(짧은 창은 가운데).

### G47 — 카이로식 창 문법 2차 (2026-09-03 밤) — 유튜브 플레이 프레임 15장 판독
- 원작 창 실측: 풀 정보 = 이름·썸네일·넓이/인기/유지비 알약·색/향/온도 타일(아이콘·값·농도 막대 5·「딱 좋아요」 판정)·「아이템 추가」·「이름 변경」 · 시설 정보 = 「시설정보 8/19」 페이지 넘김·큰 그림·설명 · 배치 = 초록 화살표 4·「1,200G ×1」 가격표·결정·「어디에 설치할까요?」·「설치 완료!」 · 하단 「휴일 3시 심사」 예고 · 건설 NEW 배지 · 대화상자 네(파랑)/아니오(핑크).
- 구현: 풀 이름(`Pool.name`, 병합·스냅샷 보존) · 풀 정보 창 재배치(`kptile`·`kbars`) · 시설 정보 ◀▶(`시설 정보 k/N`) · 조준 화살표+가격표(`scene.setGhost`) · 「결정」·「설치 완료!」 · 하단 예고 태그(`hud.setEventTag`) · 건설 NEW(안 본 해금 수, localStorage).
- **실제 브라우저(5179)에서 손으로 확인**: 풀 탭 → 상세 → 이름 변경 → 아이템 독 → 딸기 · 건설 → 카드 → 지도 탭 → 결정(시설 8) · MENU → 투자 → 아니오(돈 그대로) → 예(−3,000G). 게이트 g47: verify 132 · vitest 247.
- ⚠ 20칸 풀에 딸기 하나면 농도 1/5(강도 11) — 원작 「小さめのプールでないと濃度5にならない」 그대로다. 심사 만점은 작은 풀로.
- 남긴 것: 「아이템 투입 효과」 미리보기 창 · 축하 창의 신문 스타일 · 시설 정보 창에서 이동.

### G48 — 리텐션 1차: R1·R3·R6·R7·R8 (2026-09-03 밤) — `docs/research/retention-gap-2026-09-03.md`
- **R1 모달 대기열**: 예산(분당 1)을 넘긴 모달을 인박스로 강등하지 않고 `modalQueue` 에 두었다가 앞 창(축하·결산·사건·심사 결과)이 닫히면 다음 창. 예산 시계는 보여 줄 때만 찍는다. 폐장 순서를 **랭크업·지역 개방 → 결산** 으로 바꿨다(결산이 세리머니를 밀어내던 원인).
- **R3 만료 가시화**: 소원 만료가 토스트 「진행 N%였다 · 4일 뒤 다시」. 창 2일 남은 소원은 티커 첫 줄에 진행률과 함께. 봇은 임박한 소원부터 좇는다 → `wishExpireRatio` 3.2 → **2.8** (밴드 ≤3, 봇 조건 추적이 좋아지면 낮춘다).
- **R6 받을 것**: inbox 사건(새 친구·재료·투자 완료·버스 예고)은 티커에 「소식 · …」로 5초 흘리고, 정보 캡슐에 「안 연 상자 + 안 읽은 알림」 배지.
- **R7 달력 24 → 32**: 2년차 이후 사건을 계절 첫날 0틱 → **10시** 로 옮겨 결산 모달과 떼어 놓고, 3~8년차에 아이템 선물 8건(오렌지·바나나·미역·민트·포도·우유·키위·코코넛).
- **R8 하루 리듬**: 17시 「펌킨 상점 입고 N칸」 뉴스 + 상점 칸 배지(열면 사라짐) · 심사 날 아침 「오늘 15시 풀 심사」 · 주말 아침 「손님이 몰린다」.
- 게이트 g48: verify 136 · vitest 247 · 밴드 11/11.
- ⚠ 결산(day/season/year-summary)은 `priority: modal` 이지만 축하 대기열이 아니라 결산 창으로 가야 한다 — 처음엔 대기열이 잡아채 시즌 결산이 축하 창으로 떴다(하네스 G46 이 잡음).

### G49 — 리텐션 2차: R2 소원 보상 돈 → 콘텐츠 (2026-09-03 밤)
- `wishes.json` 213건 중 돈 보상 99 → **21(9.9%)**. ☆2·☆3 의 돈을 재료 16(원두·바닐라·닭·소·돼지·새우·연어·참치·미역·마요네즈·옥수수·양배추·생면·오징어·문어·찻잎 — 상점 → 소원 전용) · 시설 10(파라솔 세트·물고기 분수·수국·커피나무·해바라기·알로에·파인애플 나무·히비스커스·몬스테라·폭포 — 상점 → 소원 전용) · 수영복 2 · 상점 아이템 50 으로 바꿨다. 데이터 검사 「돈 ≤ 10%」.
- 메시지 탭 소원 카드: 초상 · ★ 아이콘 3(달성 단계) · 보상 이름(「재료: 연어」) · **새 손님 실루엣**(그 ☆로 초대되는 친구, 아직 안 온 친구는 「???」).
- **봇이 소원을 작은 풀에서 채운다**: 색·향·온도 조건을 가장 큰 풀에 아이템 3개로 채우려다 실패하던 것을(큰 풀은 농도가 안 오른다 — 원작 팁 「1칸 풀로 소원」) 크기 조건 이상 중 가장 작은 풀 + √size 비례 개수로. `wishExpireRatio` 3.04 → **2.59**.
- 게이트 g49: verify 137 · vitest 248 · 밴드 11/11 (레시피 중앙 68 — 재료 16종이 소원 뒤로 가서 83 → 68, 밴드 [40,140] 안).
- ⚠ 「★」 글자는 S4(이모지) 에 걸린다 — 별은 `iconEl('star')` 로.

### G50 — 리텐션 3차: R5 목표 3슬롯 동시 노출 (2026-09-03 밤)
- 티커 한 줄 안에 A(즉시 목표·소식) 글줄 + 오른쪽 34% 에 **B 랭크 · C 인증 미니 진행바**(별/체크 아이콘 + 7px 바). 6초 회전은 A 슬롯에만 남는다. 진행바 탭 → 랭크 창 / 심사 창, 티커 탭 → 소원이 있으면 SNS 메시지, 풀이 없으면 풀 편집, 아니면 랭크 창.
- 면적 예산: 두 줄(44px)로 하면 18.8% 라 한 줄(28px) 안에 넣었다 — HUD 17.6% ≤ 18%. 진행바는 `role` 없이(상시 컨트롤 감사 밖) 티커의 44px 히트면 안에서 탭.
- 게이트 g50: verify 138.

### G51 — 리텐션 4차: R4 인증 사다리 (2026-09-03 밤)
- 조사 시점 봇은 `grade_f` 하나만 16번 재수상했다 — 정책이 「예상 점수가 합격선을 넘는 것 중 가장 싼 것」이라 이미 넘은 인증을 매 계절 되풀이했다. 이제 **미통과 인증 우선**(`passed` 오름 → 신청료 오름), 넘은 것은 재료가 필요할 때(같은 등급 재수상)만. 아무것도 못 넘으면 가장 싼 **미통과** 인증의 부족 조건을 소원처럼 좇는다 — 인증 성향은 전부, 나머지 성향은 신청료 2,500 이하만.
- 밴드 2 추가(총 **15**): `certsDistinct ∈ [8,24]`(중앙 **12**) · `certFamilies ∈ [4,8]`(중앙 **7**, 8계열 중). `certs`(총 통과 수) 중앙 13 그대로 — 총량은 안 움직이고 **분포만** 넓어졌다.
- UI 는 이미 사다리를 가리키고 있었다(G50 티커 인증 바 = 미통과 중 예상 점수 최고). 하네스 G51 은 그 바가 가리키는 인증을 통과 처리하면 **다른 인증**으로 옮겨 가는지를 잰다 (간단한 풀장 심사 → 초급 노멀 부문).
- 게이트 g51: verify 139. 리텐션 조사 R1~R8 **전부 닫힘**.

### G52 — 카이로식 창 문법 3차: G46/G47 잔여 3건 (2026-09-03 밤)
- **아이템 투입 효과 미리보기**(풀 편집 → 아이템): 칩 첫 탭은 투입이 아니라 미리보기다 — 독 안에 「딸기 투입 효과 · 450G · 3일」 + 색(농도 n/5)·향·온도·인기의 **전 → 후** 4줄 + 「넣기」. 같은 칩을 다시 탭하거나 넣기를 누르면 투입, 넣은 뒤 미리보기는 접힌다. 색이 바뀌면 좋아요 리셋 경고는 칩과 미리보기 둘 다에. `previewItem` 이 `states:{before,after}`(PoolState 통째)를 같이 준다 — 실제 상태는 안 바꾼다(단위 검사).
  ⚠ 하네스 G3·G30 은 「칩 탭 = 즉시 투입」을 전제하고 있어 넣기까지 누르도록 고쳤다 (G30 이 첫 게이트에서 실패한 이유).
- **신문식 축하**(`celebrate.ts`): 한 면 — 제호 「워터파크 타임스」 · 날짜 줄 「N년차 계절 · 평일/주말」(main 이 `clockView` 로) · 헤드라인 · 액자 사진(아이콘) · 리드 · 「속보」 도장(불합격은 「아쉽」). 토큰 `--paper-bg/ink/rule` 셋. `.kcele-title/.kcele-body` 클래스는 남겨 G48 하네스가 그대로 읽는다.
- **시설 이동**(원작 이동 도구 — 첫 합격 뒤 9일째 사장 선물): 시설 정보 창 「이동」 버튼. 도구가 없으면 비활성 + 「이동 · 도구 필요」, 있으면 배치 독이 **이동 모드**(「이동 중: 화장실」, 지금 자리에서 시작 → 지도 탭 → 결정)로 열린다. sim `canMoveFacility/moveFacility`: 자기 발자국은 겹침이 아니고(`check(..., ignoreUid)`), `FacilityStore.move` 가 occ 만 옮겨 **uid·단계·메뉴·통계를 보존**, 길 막힘 검사는 설치와 같은 `breaksAccess`, 이용 중 손님은 놓아준다. **무료** — 도구 자체가 값이다(원작 200G).
- 게이트 g52: verify **143** · vitest 250(`g52.test.ts` 2). G46/G47 「남긴 것」 전부 닫힘.

### G53 — 리텐션 5차 (조사 D11·D17·D18) + v3 잔여 (2026-09-03 밤)
- **수집 완성률**(D11 「분모가 없으면 수집이 아니라 목록」): 정보 창 「풀 심사」 버튼 아래 **수집** 블록 6줄 — 시설 해금 n/94 · 풀 타일 n/13 · 수영복·튜브 n/18 · SNS 친구 n/71 · 인증(종류) n/24 · 레시피 n/144, 각 진행 막대. 분모는 데이터 크기(`defsCount/tileCount/giftCount/friendCount`).
  ⚠ 처음엔 통계 줄 뒤에 붙였더니 「풀 심사」 주버튼이 접혀 G5 실터치 절이 빗나갔다 — 주버튼은 첫 화면에 남긴다.
- **플레이어 좋아요가 의미를 갖는다**(D17 「눌러도 아무 것도 안 바뀌는 버튼」): 친구 글에 좋아요 → 그 친구 소원 EXP **+12**(`playerLikeFriendExp`, 하루 3회 그대로 = 최대 36 ≈ ☆1 문턱 100 의 1/3) · 문턱을 넘으면 소원이 열린다(`announceWish`). 토스트 「좋아요 +5 · 꼬마 소원 진행 +12」. 일반 손님 글은 종전과 같다. 봇은 좋아요를 안 눌러 밴드 무변화.
- **후반 인물 서사**(D18 Y4·Y6·Y7 0건): 사장 비트 3개 추가(22) — 4년차(계열 갈아타기) · 6년차(17시 입고·작은 풀) · 7년차(도감 「몇 개 남았나」). 엔딩 비트는 마지막 유지.
- **v3 잔여**: 실패작을 메뉴에 걸 수 있다(후보 목록에 「탄 빵 · 실패작」 — 원작처럼 값싼 메뉴) · 심사 무대 조명(위 두 줄기 + 바닥 띠)·관중 실루엣 줄(CSS 토큰 `--stage-light/floor/crowd`) · 축하 창 카이로봇 아이콘.
- 게이트 g53: verify **146** · vitest 253(`g53.test.ts` 3). 조사 D 표에서 남은 「미비」는 D20(랜덤 이벤트 — 사용자 결정 보류)뿐.

### G54 — 카이로식 창 문법 4차: G46 잔여 소품 (2026-09-04 새벽)
- **재료 칩 아이콘**: `ingredients.json` 의 `class` 9계열(과일·기본·달콤·유제품·해산물·곡물·채소·육류·견과)마다 16px 도트 아이콘(등록부 48). 요리 창의 고른 칸·재료 칩 둘 다에 붙는다 — 원작의 재료 그림 자리.
- **인기 캡슐 위계**(원작 「Total Popularity」): 라벨 「인기」는 작게(12px), 숫자는 크게(17px 노랑), 별 앞에 가는 구분선. 캡슐 높이·폭은 그대로(HUD 예산 무변화).
- **짧은 창은 가운데**: `WindowPanel.show()` 가 창 높이를 재서 가용 높이의 55% 미만이면 `kfit`(세로 중앙, transform). 내용이 show() 뒤에 채워지는 창(건설·SNS)은 MutationObserver 로 다음 프레임에 다시 잰다. `kcompact/kdialog` 는 제 자리 규칙 유지.
  ⚠ 하네스가 「건설 창 = 긴 창」을 전제해 두 번 실패했다 — 새 판(kit=0)의 건설 창은 해금 8종이라 **292px 로 실제로 짧다**(가운데가 맞다). 긴 창 판정은 정보 창(708px)으로 옮겼다. 하네스 전제를 실측으로 바꾼 사례.
- 게이트 g54: verify **147**. G46 「남긴 것」 전부 닫힘.

### G55 — 5179 재플레이 후속 (2026-09-04 새벽)
- G52~G54 새 흐름을 배포 번들에서 **실터치로 재생**해 스크린샷 11장을 판독했다 — `docs/research/replay-g52-54-2026-09-04.md`. 하네스가 값으로 초록이던 자리에서 결함 5건: 독 탭 세로 쪼개짐(「파/기」) · 아이템 모드에 타일 칩 노출(`hidden` 을 `display:flex` 가 이김) · 20칸 시작 풀에서 「맑음 0/5 → 맑음 1/5」(색이 안 붙는데 이유가 없다) · 이동 고스트에 「800G ×1」 가격표 · 같은 자리에서 「여기로 옮깁니다」.
- 고침: 탭 `nowrap` 12px · `.kchips[hidden]` · `Game.itemsToColor`(같은 아이템 n개의 가상 풀, ≤6) 로 **「맑음 1/5 · 핑크까지 2개」** · `setGhost` 라벨 인자 → 「이동 · 무료」 · 같은 자리는 `canMoveFacility` 에서 거절(독 첫 줄이 이유를 말한다) · 칩 아이콘 16px · 도감 값 오른쪽.
- 게이트 g55: verify **148** · vitest 253(g52 검사에 같은 자리·itemsToColor 추가).
- 2차 재플레이(주요 화면 12장): SNS 친구 행 초상·이름 밀착(8px) · 풀 정보 「맑은」→「맑음」 통일. 나머지 10장은 판정 ✓ (연구 문서 §4).
- ⚠ 재플레이는 **시작 킷 그대로**여야 한다(하네스는 `kit=0` 으로 4칸 풀을 파서 재므로 20칸 풀의 「맑음 → 맑음」을 볼 수 없었다). 「하네스 초록 ≠ 눈 초록」 — G47 의 손 확인 절차를 goal 마다 한 번은 둘 것.

### G56 — 후반 재플레이 후속 (2026-09-04 새벽)
- 봇을 헤드리스로 32·64·127일 돌린 스냅샷을 `wp.save` 에 넣어 배포 번들에서 **3·5·8년차 화면**을 열었다 (연구 문서 §5). 초반 세이브로는 못 보는 결함 6건: 통과한 F·D 인증 카드가 심사 창 첫 화면을 다 먹음(사다리의 다음 칸이 안 보임) · 정보 배지 「207」 이 캡슐 밖으로 · 「인기도 7241」 천 단위 없음 · 마지막 지역인데 「1,687 / 1,000」 · 달력 본문 「지원금 8,000G … — 8,000G」 중복 · 94칸 풀의 「타일 · 모래 타일」 라벨 세로 쪼개짐.
- 고침: 통과 인증은 **한 줄 카드**(무대·조건 없이 「재수상 = 재료 3 · 예상 N/30」 + 신청) · 배지 99+ · 천 단위 · 「1,687 · 전 지역 개방」 · `bodyWithReward`(대사가 보상을 말하면 꼬리 생략) · 타일 라벨 `nowrap`.
- 게이트 g56: verify **149** · vitest 254. 5179 번들 G56.
- **24시드 128일 밴드 재확인**(G51~G56 뒤, 1:36): 15/15 충족 — money 158만 · certs 13 · certsDistinct 12 · certFamilies **6**(8시드 7) · wishExpireRatio 2.68 · rank5Year 6 · foodShare 0.29 · lateSpendRatio 0.61. 8시드와 다른 것은 certFamilies 7→6 뿐이고 밴드 안이다.
- ⚠ **후반 화면은 봇 세이브 주입으로 본다** — `tmp-shots/mksave.mts`(gitignored) 가 절차다. 재플레이 3회(초반 새 흐름 · 주요 화면 · 후반)로 결함 13건을 찾았고 전부 하네스가 초록이던 자리였다.

### G57 — 코드 버그 감사 수정 (2026-09-04) — 사용자 「문서 정리 우선 + 버그 있는 부분들」
- 감사(에이전트, 읽기 전용)가 10건을 찾았다 — 목록·증상·수정은 **`waterpark-clone-summary.md` §7**. 확실 9건 전부 고쳤다: 결산 카드가 사건 선택 창을 삼킴(→ `show()` 가 실제 열림을 돌려주고 `pumpChoice`) · 뉴게임+ 뒤 씬이 옛 격자를 그림(→ `scene.setGrid` + `resetSessionForNewGame`) · 하루 중간 왕복에서 그날 누적 결손(→ `dayAccum` 6필드, 골든 재베이크) · 사건을 폐장 날짜로 굴려 주말·계절 어긋남(→ 내일 날짜) · 하루·시즌 카드 덮어쓰기(→ `summaryQueue`) · 시설 아래 실내 지우기 · `popCache` 에 좋아요 · 뉴게임+ 세션 큐 · 발자국 위 손님 퇴장(→ `evictFrom`) · 섞인 풀 타일 줄.
- 하네스가 **반대 방향의 같은 결함**을 잡았다: 사건 창이 먼저 떠 있으면 결산 카드가 `WindowPanel.show()` 거부로 조용히 사라졌다 → 어떤 모달이 떠 있어도 카드는 줄에 서고(`anyModalUp`), 사건·심사 결과 창이 닫힐 때도 펌프한다. G46 절은 「하루 카드가 먼저」 로 갱신.
- 게이트 g57: verify **150** · vitest **258**(`g57.test.ts` 4: tick 1000 왕복 결산 동일 · 프리셋 번호 · 시설 아래 실내 · 발자국 손님). 5179 번들 G57.
- ⚠ 감사가 지적한 검증 구멍: G39 절은 결산 없이 사건만 잰다 / 골든 왕복은 하루 경계에서만. 「검사가 자기 편한 상태에서 잰다」 — 새 검사는 두 사건을 같은 폐장에 넣고, 왕복은 하루 중간에서.
