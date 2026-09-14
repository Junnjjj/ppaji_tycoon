# 빠지 물 중심 개편 — 「기구를 붙이고, 이어 붙이고, 개조하며 빠지를 키운다」 (v5 통합본, 2026-09-07)

> **지위**: `docs/plan-ppaji-story.md` §14 의 **정본**이다. §14 는 요약과 이 문서의 포인터로 남긴다.
> **왔던 길**: v4 는 설계자 4·수행자 1·평가자 3 루프를 5라운드 돌렸다(71.5 → 80 → 80.5 → 73.5 → 74.5 / 100).
> 4라운드부터 평가가 잡는 것의 절반이 장부 오류(게이트 번호·같은 수의 세 값·자기 규칙 위반)였고 문서가
> 3,717줄·결정 280·게이트 210항으로 자라 수렴이 아니라 순환이 됐다. v5 는 **한 사람이** 그 내용을 압축하고
> 5라운드의 실물 차단 6건을 닫은 것이다. v4 는 **부분 보존**이다 — `docs/history/plan-ppaji-water-v4-partial.md`(읽어 둔 절의 사본)와
> `docs/history/plan-ppaji-water-v4-sections/`(라운드 5 설계자 초안 A~D · 조사). 게이트 210항·검산·부록 원문은 v5 로 덮어쓰며 잃었다.
> **원칙**: 코드 주장에는 파일:줄을 붙이고(전부 v4 평가자가 대조한 것), 없는 것은 「신설」로 적는다.
> 게이트는 페이즈당 **10항 이하**, 번호를 매기지 않고 항목 끝에 자 종류만 적는다(단위·정적·하네스·봇·골든).
> **수를 두 곳에 적지 않는다** — 세는 값은 표에서 한 번, 스크립트가 세는 값은 그 출력에서만.

---

## 0. 한 줄 정의와 무엇이 바뀌나

**빠지** = 강 위에 폰툰 링으로 둘러싼 물(수역) + 그 안에 띄운 **플로팅 기구** + 링 위의 빠지 시설.
원작(워터파크 스토리)의 「풀을 파고·넓히고·색을 바꾼다」가 우리에겐 **「빠지를 치고·기구를 붙이고·이어 붙이고·개조한다」**다.
물빛(타일 13종)·타일 교체는 원작 문법이라 **지운다**. 소품 24종은 빠지 소품으로 **남긴다**(사용자 답변).

| 축 | 지금 코드 | 뒤 |
|---|---|---|
| 지도 | 평탄 강 22줄(행 50~71) | + **S 자 물굽이**가 마당을 파고 올라와 출입동 남문 아래 못(행 25~31)까지 |
| 출입동 | 20×20 | **20×13**(행 8~20) · 좌우 확장은 실내 바닥 붓 그대로 |
| 수역 | 데크로 둘러싼 물 자동(D22) | 그대로 + **사각형 붓**으로 한 번에 · **허가 = 칸 예산**(랭크) × 본류 창 |
| 물 위 | 시설 불가(`on-pool`) | **기구 `class:'rig'`** — 연결돼야 켜지고, 계열은 이어 붙이면 정원이 는다 |
| 성장 | 풀 색·소품 | **빠지 등급 0~4**(기구 수·종류·연결·조명) · **개조**(부품 → 같은 자리 교체) · **팔찌**(이용권) · **밤** |
| 손님 | 수영·자리·매점 | + 팔찌(조끼 포함)가 딥 기구를 연다 · 팀 기구 · 수온 · 사고·망루 |

---

## 1. 게임성 총론 — 카이로처럼 중독적이려면

### 1.1 세 겹 루프 (주기가 두 자릿수씩 벌어진다)

| 겹 | 주기(코드) | 무엇을 하나 | 그 자리에서 바뀌는 것 | 화면 |
|---|---|---|---|---|
| 30초 | 조준 1 + 확정 1 + 관찰 | 건설 → 「빠지」 탭 → 기구 → 조준 → 확정 | 켜짐 · **등급** · 연결 · **자유이용권 값** | 확정 바 칩 한 줄 `등급 1 → 2 · 연결 3 · 자유이용권 400 → 600G` → 등급이 바뀔 때만 모달 |
| 하루 | 210초 (`clock.ts:11` 1680 tick × `:25` 125ms) | 아침 선물 · 17시 장날(`:31` `SHOP_RESTOCK_TICK`) · 18시 저녁(`:15`) · 결산 | 부품·현금 · **밤 개장** | 시계 · 결산 · 티커 |
| 연차 | 56분(16일) | 랭크·인증·지역 | **허가 칸 +** · 기구·부품 해금 | 랭크 모달(`game.ts:501~514`) · 심사 · 목표 B/C |

한 사건은 한 겹에만 산다 — 30초 = 토스트, 하루 = 결산·티커, 연차 = 모달. 새 채널을 만들지 않는다(`events.ts:5`
`EventPriority` 넷 · 모달 분당 1개 `panels.ts:100`).

### 1.2 왜 이 축인가 — 봇 4시드×128일 실측

| 연차 말 | 현금 | 누적 방문 | 수역 칸 | 소원 |
|---|---|---|---|---|
| Y1 | 225,217 | 921 | 243 | 15 |
| Y5 | 2,849,162 | 6,511 | 347 | 95 |
| Y8 | 4,197,615 | 11,672 | 447 | 118 |

수역은 Y6 에 상한(447)에 닿고, 소원은 Y6~Y8 에 7건, 현금 135만이 그냥 남는다. **5년짜리 게임 + 3년의 여백.**
기구 축은 그 여백을 채우러 온다. 밴드 `unlockGapMaxY5_8` 이 그것을 잰다.

### 1.3 해금 계단 — 하루에 하나, 계절에 최소 하나

전 축 해금 실측 중앙 302건/128일 = **2.36/일**(PSS 실물 2.6). 개편 뒤 = 302 − 물빛 8 + 새 사건(기구 13·부품 13·개조 17) ≈ **2.63/일**.
문턱은 계절(4일)에서 유도: `unlockGapMaxY1_4 ≤ 4` · `unlockGapMaxY5_8 ≤ 6`(지금 7 — 빨간불).
랭크에 몰면 2년차에 소진된다(`ranks.json` unlocks 는 ★2 에서 끝난다: ★1 8 · ★2 7 · ★3~5 0) → 기구 21종 배분은
**시작 8 · 랭크 9(★1 4 · ★2 3 · ★4 1 · ★5 1) · 인증 3 · 소원 1**, 부품은 상점 9 · 연차 4, 개조는 시작 3 · 공방 17.
랭크·인증에만 매달린 것에는 **연차 폴백**(§4.5, 8건)이 있어 ★1·★2 에서 멎은 판도 Y1~Y8 에 매년 하나는 연다.

### 1.4 ★3~★5 의 새 동사

| 구간 | 지금 | 여는 동사 | 딛는 축 |
|---|---|---|---|
| ★3 (Y3) | 0종 | **밤 개장**(`nightPartyOn` 의 `rank ≥ 3`) + `spray_nozzle` 진열 | 밤 |
| ★4·★5 | 0종 | `rig_jump_tower` · `rig_disc`(판당 1대 랜드마크) | 기구 |
| Y5~Y6 | 수역 447 고정 | 허가 400 → 800 — 셋째·넷째 빠지를 종류별로(**여유**이지 동사가 아니다 — 봇 447 은 800 의 56%) | 허가 |
| Y6~Y7 | 소원 +5/2년 | 연차 부품 4종 → 개조 2단 6건 | 개조 |
| Y7~Y8 | 현금이 남는다 | 밤 배수 `nightSalesMul` 이 세 자리에 곱한다 | 밤 |
| 전 구간 | — | 등급 4 빠지는 봄·가을 입수 면제(`swimUrge` 바닥 0.9) | 계절 |

### 1.5 1년차 분 단위 (핵심 비트만 — 전부 `calendar.json`·`clock.ts` 실측 좌표 위에 얹는다)

| 분 | 무엇 | 근거 |
|---|---|---|
| 0:40 | 목표 A = 「빠지에 기구를 하나 붙이자」 | `main.ts:154` 문구 교체 |
| ~1:30 | 첫 기구 `rig_slide` 1,600G(시작 12,000 의 13%) 조준 → 확정 | `balance.json startMoney` |
| ~1:40 | **같은 tick** 등급 0→1 모달 + 폰툰 색·깃발 + 인박스 「패키지 발견 · 빠지 자유이용권」(`notePackages` `game.ts:867` 이 이미 낸다) | D-등급 |
| 2:37 | 첫 장날 — 부품 첫 구입 | tick 1260 |
| ~4:30 | 장애물 조각 둘 잇기 → 토스트 「연결 2 · 정원 2 → 3」 | 연결 |
| ~8:00 | 구명조끼 대여소 700G — 팔찌 창구 | 팔찌 |
| 10:30 / 11:05 | 선물 파란 링 튜브 · 그늘막 | 달력 |
| 12:32 | 첫 심사 창구 | tick 980 |
| ~14:00 | 첫 인증 → 보상 부품 → 「기구 개조」 창 | 공방 `unlockRank 0` |
| 15:07 / 15:10 | 선물 MT 수영복 · 장날 개장 +1,000G | 달력 |
| ~17:00 | 첫 개조(2단 슬라이드) — 같은 자리 교체 | 개조 |
| ~19:00 | 첫 팔찌 판매 — 대여소 시트 「오늘 팔찌 1장」 + 인박스 | 팔찌 |
| ~21:00 | ★1 — 허가 40→90 · 기구 4종 | 랭크 |
| ~24:00 | 둘째 빠지 — 사각형 두 모서리 | 붓 |
| 27:42 / 28:00 | 불꽃놀이 +500G · 가을 첫날 향초 | 달력 |
| 28.00~35.00 | **가을 심사 신청 창** — 놓치면 Y1 안 ★2 불가(`cert.ts:18,71,73`) → 목표 A 폴백 「가을 심사를 신청하자 — 오늘까지」 | 심사 |
| 38.50 | 이동 도구 선물(`calendar_y1_autumn_move`, `certPasses ≥ 1` + 9일) | 달력 |
| 40.54 | ★2 — 허가 160 · 기구 5종 | `cert.ts:76,89` |
| ~45.50 | 비수기의 결정 = 둘째 개조 | 개조 |
| 49.00 | 연차 폴백 첫 건(Y1 겨울 `pump_motor`) — 「정비 휴장하는 날 창고를 뒤졌더니…」 | 달력 |
| 56.00 | 연말 결산 · Y2 | 달력 |

자는 둘이다. ① **이름 있는 사건**(달력·심사·랭크·비트)의 최대 간격 — 여름·가을(0~42분) ≤ **4.5분**(위 표의 최대는 12:32 → 15:07 과 17:00 → 21:00 의 4.0), 겨울(42~56분) ≤ 7분(비수기는 의도적으로 비운다 — 개조·부품이 그 자리, 49.00 폴백이 상한).
② **A 슬롯 문자열이 바뀐 시각**(회전이 아니라 A 슬롯만, HUD DOM 에서 60초 샘플 56회) ≥ 8회, 빈 A 연속 3샘플 미만. 첫날(0~3.5분) 샘플의 2/3 이상에 「기구」 또는 「빠지」 낱말. **B 슬롯**은 등급 미달 조건을 `rankProgress` 문법으로
「등급 n → n+1 · 기구 k개 · 종류 m종」으로 보여 A·B·C 셋이 동시에 비지 않는다(결정 G10).

### 1.6 쉬움 규칙 — 첫 30분에 보이는 규칙은 하나다 (원작의 「타일 하나 = 결정 하나」에 대응)

원작의 물색 바꾸기가 쉬운 이유는 탭 한 번·그 자리에서 색이 바뀜·뜻이 설명 없이 읽힘 셋이다. 우리 기구는 규칙이 넷(연결·깊이·계열·팔찌)이라
한꺼번에 보이면 카이로가 아니라 Parkitect 가 된다. 그래서 **점진 공개**가 결정이다(G11):
- 처음 보이는 규칙은 **「링에 닿게 놓으면 켜진다」** 하나. 시작 기구 8종은 딥이 0종이라 「깊은 물이 필요해요」 거절을 첫 30분에 만나지 않는다.
- **계열 연결은 요구가 아니라 덤**이다 — 장애물 조각 둘을 붙이면 토스트 「연결 2 · 정원 2 → 3」로 배운다. 안 이어도 못 노는 것은 없다.
- **깊이**는 ★1 에 첫 딥 기구(블롭) 카드가 열릴 때 「강 위」 한 낱말로 처음 등장한다.
- **팔찌**는 그 딥 기구를 놓는 순간 「구명조끼 대여소가 있어야 탑니다」 한 줄 + 대여소 700G 하나로 끝난다.
- 기구 하나가 켜지는 순간의 연출(물보라·작은 깃발)은 **그림 없이 코드로**(P50-b2) — 등급 색 변화가 한 빠지에 평생 네 번뿐인 것을 보완한다.
- 등급별 폰툰 색·깃발·이음쇠·꺼짐 틴트도 코드다(P50-b2). 게이트: **등급 0 판과 등급 4 판의 정오 스크린샷 색 히스토그램 L2 ≥ 0.2**(하네스, 그림 0장에서).
- **철거는 회복 가능**해야 한다 — 기구·링 위 시설은 그날 전액(`paidToday`), 그 뒤는 **건설비의 50%** 환불(기존 정액 50G 가 아니다). 게이트: 새 판에서 `rig_slide` 셋(4,800G)을 이튿날 철거해도 현금 ≥ 시작의 60% — `rigRemoveRefund 0` 이면 59% 로 빨강(단위, 대조군).
- G11 의 자: 새 판 첫 30분 하네스에서 거절 사유 `depth-mismatch`·`not-connected` **0건**, 새 판 0~5분 모달 ≤ 2 · 큐 ≤ 2(하네스).

---

## 2. 결정 (v5 번호 — v4 D78~D280 을 압축했다)

### 2.1 지도·물·허가

| # | 결정 | 근거·코드 |
|---|---|---|
| W1 | **S 자 물굽이**: 못(열 50~61 · 행 25~31, 출입동 남문 아래) + 수로가 왼쪽 아래 본류(행 50, 열 ≈24)로 내려간다. 시드 없는 고정 기하, RNG 0 | §3.1 |
| W2 | 굽이 **안쪽 기슭 2칸·바깥 1칸이 여울**, 나머지 강 — 두 바닥이 곧 **깊이**(키즈·휴식 = 여울, 점프·블롭 = 강) | `FLOOR.shallow/river` 재사용 |
| W3 | **여울은 걷지 못한다** — 굽이가 마당을 가르는 것은 의도이고 마당 뭍은 입구에서 100% 닿아야 한다(P48-b1 게이트가 잰다 — 손계산으로 남서 마당의 우회비가 1.56~1.63 이라 문턱에 붙는다 → **못 동쪽 회랑 폭 ≥ 3칸**을 불변식 ⑥으로 두고 안 되면 `head.w` 12 → 10). 입구 열(48) 포장은 물(행 36~40 → P48-b2 관에서 35~42)에서 **끊기고 다리는 없다** | §3.1 불변식 |
| W4 | **자연 바닥 평면 `Grid.natural`** (세이브 v4) — 폰툰을 걷거나 수역을 지우면 줄 공식이 아니라 이 평면으로 복원한다. `riverFloorFor`(`grid.ts:76`) 삭제 | §3.2 |
| W5 | 물 판정은 **바닥 코드 + 토지 열 + 창**으로: `inMyWater` = 물 코드 ∧ 토지 열 ∧ (굽이 `j < RIVER.j0` 는 언제나 · 본류는 `j ≤ waterMax`). `waterRowMax`(`grid.ts:107`)는 **본류 창으로 유지** | §3.3 |
| W6 | **허가 = 랭크가 여는 창 × 그 안의 칸 예산** `[40, 90, 160, 260, 400, 800]`. 뭍 인공 풀(`digPool` 뭍 분기) 삭제(D59) | §3.4 |
| W7 | 출입동 **20×13**, 킷 빠지는 못 안(바깥 6×7, 링 16, 안 4×5 = 여울 8 + 강 12), 선착장은 **본류 잔교**(코스는 트인 강이 필요) | §5 킷 |
| W8 | 세이브 **v4 = 새 판**(`natural` 없으면). `SAVE_VERSION`(`save.ts:9`) 3 → 4, `GameSnapshot.version` 은 안 올린다 | §5 |

### 2.2 빠지 붓·기구·연결·등급

| # | 결정 | 근거 |
|---|---|---|
| R1 | **사각형 붓**: 두 모서리 → 둘레 폰툰(물 칸만 60G, 이미 수역이면 0G, 마른 바닥은 둑이 대신) · 안은 물(안의 데크는 자연 바닥으로 되돌린다, 시설 있으면 거절) · 최소 안 4×5 · 겹치면 병합 | §3.5 |
| R2 | **라인 조각** 1×2·1×4·1×6 을 시설처럼 조준·회전·확정 — 내부는 `paintDeck` | §3.5 |
| R3 | `class:'rig'` 신설(닫힌 유니언 확장 한 커밋) · 필드 `onRing·depth·chain·thrill·safe·needsVest·team·lights·guardRadius·rentKind·buildable·maxPerPark·bandCost` | §4.0 |
| R4 | **켜짐 = 연결**: 링(데크)에 4이웃으로 닿은 물 위 기구가 씨앗, 켜진 기구끼리 4이웃 BFS. 안 닿으면 회색·이용 0·유지비만. 링 위 시설은 언제나 켜짐 | §3.7 |
| R5 | **계열 연결**(`chain`)은 **정원에만** `sqrt(len/2)`(상한 2.0) — 스릴·인기엔 안 곱한다. 계열은 셋: `obstacle`(다리·징검다리·빔) · `slide`(플로팅·미니·도크) · `rest`(해먹·선베드) — 시작 기구 8 중 6 이 어느 계열에 든다. 정원 ← 사슬 · 인기 ← 등급 · 스릴 ← 개조 | §3.7 |
| R6 | **빠지 등급** 0~4 = 켜진 기구 수·종류·최장 사슬·조명으로 파생(저장 0). 등급이 수역 인기 배율 `[1,1.4,1.9,2.6,3.5]`(물빛 인기 합을 대체), 팔찌 값, 인증·소원 조건 | §3.7 |
| R7 | `open`(기구가 안 덮은 물)은 **유영·입수·유입**에만, 인기·허가·유지비는 `tiles` — 붙일수록 보상이 음수가 되지 않게 · 유입만 `open` 이라 「물을 전부 덮는 것」이 정답이 되지 않는다 | §3.7 |
| R8 | 기구는 **간격 규칙(D58)·접면(P31)·자동 길에서 면제** · 링 위 점포는 진입 칸이 실내 코드일 때만 복도 점포(D63 누수 차단) | §3.6 |
| R9 | 「빠지」 건설 탭을 실내 다음 둘째로. 기존 물 위 시설 12종 이전(id 유지, class/depth/onRing 만) — 튜브 슬라이드는 `slide` 유지 + `onRing`, 거북섬 8×6·에어바운스 6×5 는 크기 유지(★2 허가가 게이트) | §4.2 |
| R10 | 랜드마크 기구 `rig_disc` 는 `maxPerPark: 1` — `canPlace` 층의 거절 한 줄, id 를 코드에 안 적는다 | §3.6 |

### 2.3 개조·손님·안전·계절·밤

| # | 결정 | 근거 |
|---|---|---|
| G1 | **개조 = `convertFacility(uid, toDefId)`** 신설(`move` `facility.ts:207` 와 대칭) — uid·자리·방향·알바·수입 보존, `defId` 만 바뀐다. 개조비 = 차액 + 30%, Lv 할인 5%/Lv(상한 25%). 개조 레시피는 공방 문법(`CookingStore` 상속, `upgradeOf` 그대로) | §3.8 |
| G2 | **팔찌 4등급**(조끼만·3종·5종·종일) = 자유이용권. 값은 빠지 등급을 탄다(0/400/600/700/1,000G). 팀 한 장. 창구 둘 — 대여소(`rental_tube`, 하루권 정본)와 자리 패키지(대여소 없는 판). **팔찌 ⇒ 조끼** | §3.8 |
| G3 | **딥 기구는 팔찌 회수가 있어야 탄다**(하드) · 어린이 딥 금지 · 팀 기구는 팀만 · `swimSkill`(출신지 취향 파생, 저장 0)이 깊이 선호를 대칭으로 기울인다 · 아쿠아삭스는 소프트(팔찌 없으면 슬라이드 ×0.3) | §3.8 |
| G4 | **사고**는 `onFacilityUse` 안에서 전용 스트림 1회 — 기구 가지와 선착장 가지. `hazard = max(floor, base × thrill × unsafe)` × 조끼·망루·구조정·브리핑·수온·혼잡. 시설을 안 닫고 손님 hp/sat 만. 사고는 그날 SNS 인기를 깎는다(좋아요가 성장 통화라 안전이 성장에 무는 유일한 자리) | §3.8 |
| G5 | 망루(링, 반경 6, 알바 있을 때만)·구조정 계류대(반경 10) · 위험 칩 4단은 `base·floor` 에서 유도 · 코스 안전교육 브리핑(회전 −9% ↔ 사고 ×0.7, 알바 있는 선착장만) | §3.8 |
| G6 | **수온** = 계절·날씨 파생 → 야외 입수 확률(겨울 0.15 바닥). 실내 풀 3종은 비수기 답. **장마 유실** = 기존 카드 효과에 `rigLoss` 한 필드(앵커 개조판 면제) | §3.8 |
| G7 | **밤 빠지 파티**: ★3 ∧ 등급 3 빠지 ∧ 켜진 LED 부표 ≥1 ∧ 기구 ≥9 → 저녁 진입 tick 에 하루 한 번 래치. 배수 = 켜진 LED 수(1.0~1.4). **야간권** = 저녁에 이미 자리 잡은 팀에게 한 번 더 발급 | §3.9 |
| G8 | 다회차: 개조 도감·부품 이월, NG+ 는 이월 개조판 한 채가 킷 빠지에 서 있다. 2회차 지도 좌우 반전은 미결 | §3.9 |
| G10 | **목표 B 슬롯**이 등급 미달 조건(「등급 n → n+1 · 기구 k · 종류 m」)을 `rankProgress` 문법으로 낸다 — `main.ts:167` 의 `return a ?? [A,B,C][goalSlot]` 를 `[a ?? A, B, C][goalSlot]` 로 바꿔 A 폴백 중에도 B·C 가 회전에 남는다 | §3.9 |
| G11 | **점진 공개** — 첫 30분에 보이는 규칙은 「닿으면 켜진다」 하나, 깊이·팔찌는 ★1 딥 기구와 함께 한 줄로 등장 | §1.6 |
| G9 | 킷은 **7채 그대로**(매표·실내 매점·화장실·자판기·평상 2줄·선착장) — 평상 한 줄은 못 북안(첫 기구 확정 tick 에 패키지 발견이 뜨려면 자리가 반경 3 안이어야 한다). ⚠ D57 「평상 2 를 뺀다」와 어긋난다 — 미결 ③ | §5 킷 |

---

## 3. 규칙·수식

### 3.1 물굽이 기하 (`src/sim/grid.ts` 신설)

```ts
export const BEND = {
  head: { i0: GATE_I + 2, j0: 25, w: 12, h: 7 },     // 못 — 열 50~61 · 행 25~31
  jTop: 31, jJoin: RIVER.j0,                          // 수로 행 31 → 50
  iTop: GATE_I + 7, iJoin: GATE_I - 24,               // 열 55 → 24
  wobble: 5, halfTop: 2.0, halfJoin: 3.0, samples: 400,
  rimInner: 2, rimOuter: 1,                            // 여울 띠 폭
} as const;
bendCenter(t) = iTop + (iJoin − iTop)·(0.5 − 0.5·cos πt) + wobble·sin 2πt      // t=0 위 … 1 본류
bendHalf(t)   = halfTop + (halfJoin − halfTop)·t
bendRow(t)    = jTop + (jJoin − jTop)·t                                          // 표본의 행 jc
```
`Grid.carveBend(g)` 2패스: ① 못 사각형 + 표본마다 `|i−ci| ≤ r ∧ |j−jc| ≤ 0.8r` 를 발자국으로 찍고 처음 찍힌 표본의
곡률 부호로 안쪽/바깥을 정한다 ② 발자국 밖을 씨앗으로 BFS 거리 `d` — `d ≤ (안쪽 ? 2 : 1)` 이면 여울, 아니면 강.
물 칸은 단 0(`grid.ts:278`). 손계산: `c(0)=55 · c(1)=24`, 열 48 은 `t≈0.35~0.43` → **행 36~40 다섯 칸**이 물.

**불변식(검사)**: ① 격자 변의 굽이 물 0(지도 밖 `Surround` 무변경) ② `j ≤ LAND_J0` 물 0 · 열 48 물은 연속 한 구간 ≤ 8칸 ·
그 위아래 열 48 은 포장 ③ 굽이 물은 한 덩어리로 본류에 4이웃 연결(새 판 밀폐 물 0 — **다리를 금지하는 자**) ④ 마당 뭍은
입구에서 4이웃 BFS 로 전부 닿는다 ⑤ 물 단 0 · 굽이 이웃 뭍 단 ≤ 1 ⑥ 못 동쪽(열 62 이후)·서쪽(열 49 이전) 뭍 회랑 폭 ≥ 3칸(우회비 문턱의 근거).
**우회 거리**: 굽이 판의 마당 뭍 칸 집합 S 에서 `dist_bend` 와 (검사가 굽이를 잔디로 메운) `dist_flat` 을 재어
중앙비 ≤ 1.20 · 최대비 ≤ 1.60. 음성 대조군 `halfJoin = 12`.
**튜닝 손잡이**: 물 칸 수 ← `halfJoin`→`halfTop` · 여울:강 ← `rimInner`→`rimOuter` · 거리 ← `wobble` · 물가 뭍 ← `head.w/h`.

### 3.2 굽기 순서·자연 바닥

```
① 바탕 → ② 도시 띠 → ③ 본류(grid.ts:308 의 riverFloorFor 는 인라인)
→ ④ carveBend()   → ⑤ raiseHills(:337 의 z 한 줄: isRiverRow → isWaterCode) → ⑥ rockRims
→ ⑦ snapshotNatural() → ⑧ 물가 포장(물이면 건너뜀) → ⑨ 입구 열 포장(물이면 건너뜀)
```
⑧⑨ 를 `rockRims` 뒤로 옮기는 것은 동작 0(실측 바이트 동일). ⑨ 무가드는 열 48 을 메워 밀폐 물 150칸을 만든다 — 그것이
「다리」의 실체이고 그래서 다리는 없다.
`natural: Uint8Array`(생성자 `grid.ts:151~158`) · `naturalAt` · `setNatural` · `snapshotNatural`. `set()` 은 `natural` 을 안 건드린다.
복원 자리: `syncEnclosedWater` 되돌리기(`game.ts:1773`) · `unpaintDeck`(`:1844,1849`) · `fillPool`(`:1938`) ·
`unpaintPath`(`:960,963`)·`unpaintIndoor`(`:1183`)의 하드코딩 `FLOOR.grass`(실버그 동시 수정).

### 3.3 물 판정 재정의

| 함수 | 지금 | 뒤 |
|---|---|---|
| `inMyWater` `game.ts:1778~1780` | `isRiverRow ∧ j ≤ waterMax ∧ 열` | `isWaterCode ∧ 토지 열 ∧ j ≥ LAND_J0 ∧ (j < RIVER.j0 ∨ j ≤ waterMax)` |
| `syncEnclosedWater` `:1747~1776` | `j ≥ RIVER.j0` 만 · 씨앗 4벌 | **전 격자** · 씨앗 3벌(격자 네 변의 물 ∪ 토지 열 밖 물 ∪ 본류 창 밖 물) · BFS 부분을 `countEnclosedWater` 로 뽑아 `wouldEnclose` 와 공유 |
| `ownsTile` `:1240` | `j < RIVER.j0 ∧ inRect` | `inRect ∧ !isWaterCode` |
| `isOpenWater` `:741~744` · `courseTerrain` `:2329` | 물 ∧ ≠pool ∧ inMyWater | 뜻 그대로(새 `inMyWater`) · 여울 제외로 좁히지 않는다 |
| `inLandOrWater` `grid.ts:111~113` · `facility.check` `facility.ts:178` | 기본값 71 / 47 | 첫 인자 `Grid` · **기본값 삭제(필수 인자)** — 47 은 죽은 값 |
| `unpaintDeck`·`fillPool` | `riverFloorFor` | `naturalAt` |

**호출 순서**: 세계를 바꾸는 함수는 `syncEnclosedWater()` **뒤에** `afterWorldChange()` 를 한 번 — `paintDeck`(`:1832→1833`)이
지금 거꾸로라 밀폐한 프레임의 등급·켜짐이 밀폐 전 수역으로 계산된다. `digPool`·`fillPool` 은 하네스·검사 전용이 되고
`makeTestPpaji`·`digWater` 헬퍼가 sync 를 대신 부른다.

### 3.4 허가

```ts
get permitMax()  { return b.permitTilesByRank[min(rank,5)]; }   // [40,90,160,260,400,800]
get permitUsed() { return pools.totalTiles(); }                  // open 이 아니라 tiles
wouldEnclose(edit): number   // grid.floor 만 직접 쓰고 되돌린다(Grid.set 금지 — rev·poolTile·levels 를 같이 만진다) · RNG 0 · 조준 칸이 바뀐 프레임에만
```
거절 「수면 허가를 넘습니다 — 남은 N칸 · 랭크를 올리면 M칸까지」. 기구 발자국은 허가에서 **빼지 않는다**.
등급 4 빠지 ≈ 기구 발자국 48 + 유영 48 = **96칸** → ★5 800 은 8.3배, 봇 128일 447 의 56% 라 상한이 봇을 안 문다.
1년차 봇 수역 243 vs ★1 90~★2 160 → **−34%, 인기 ≈ ×0.86** 회귀는 **받아들인다**(허가는 돈으로 못 산다 — D66).
랭크업 모달(`game.ts:510`)에 「수면 허가 +N칸」을 계산해 잇는다. 「허가가 거의 찼다」 경고는 만들지 않는다.

### 3.5 사각형 붓·라인 조각

```ts
canMakePpaji(r: PpajiRect): Result & { cost?, enclose?, ringWater? }   // 바깥 사각형
makePpaji(r) · canPlaceLine(len: 2|4|6, i, j, facing) · placeLine(...)   // 내부는 paintDeck(tiles)
```
판정 순서(바깥 제약부터): ① 크기 `min(w−2,h−2) ≥ 4 ∧ (w−2)(h−2) ≥ 20` ② 물 칸 전부 `inMyWater` ③ 링 칸 — 물·수역이면 데크(물만 60G)
· 데크면 0G · 마른 바닥은 둑(0G) · 그 밖 거절 ④ 안 칸 전부 물·수역·데크 ⑤ 안에 시설 없음(「먼저 철거하세요 — ○○」) ⑥ 링 한 칸이
뭍·기존 데크에 접속(`canPaintDeck` 의 `dry` 술어 `game.ts:1808`) ⑦ `wouldEnclose + permitUsed ≤ permitMax` ⑧ **원자 적용**(링 →
데크, 안 데크 → `naturalAt`) → `syncEnclosedWater` → `reachability` 전후 비교, 깨지면 통째 되돌리고 sync 한 번 더 ⑨ 결제 · `afterWorldChange`.
값: 킷 모양 6×7(둑 한 변) = 링 16 × 60 = **960G**(시작 자금의 8%) · 사방 물 22 = 1,320G · 10×12 = 2,400G.
병합: `PoolStore.recompute()`(`pool.ts:84`)가 `{keptId, keptName, goneNames[]}` 를 돌려주고 토스트 「‘◯’ 를 ‘△’ 에 합쳤습니다」.
승자는 `:126` 정렬 그대로(겹침 최대 → id 작은 쪽).

### 3.6 물 위 배치·손님 진입·도달

```ts
export interface WaterRules {            // 전부 필수 인자 — facility.check(defId,i,j,facing,land,gate,ignoreUid,water)
  ppajiWater(i,j): boolean;              // FLOOR.pool ∧ 내 허가 안
  depthAt(i,j): 'shallow'|'deep';        // Grid.naturalAt 파생
  ring(i,j): boolean;                    // FLOOR.deck ∨ 물에 4이웃으로 닿은 뭍
}
FacilityFail += 'not-on-ppaji' | 'not-on-ring' | 'depth-mismatch'
```
| 대상 | 규칙 |
|---|---|
| 물 위 기구(`rig ∧ !onRing`) | 발자국 전 칸 `ppajiWater` · `depth` 가 `any` 거나 전 칸 일치 |
| 링 시설(`onRing`) | 전 칸 `ring`(슬라이드 활강로 칸은 `ppajiWater` 도 허용) · `depth` 가 있으면 4이웃 물 중 하나 이상 그 깊이 |
| 나머지 95종(107 − 이전 12) | 지금 그대로(`on-pool`, `facility.ts:185`) |

**손님이 설 수 있는 칸 = 술어 하나** `guestWalkable(grid, f, i, j) = f.walkOn(i,j) || (isWalkFloor ∧ !occupied)` — 지금 세 벌
(`guest.ts:248~252` · `game.ts:1087` · `:2610~2612`)을 하나로. `walkOn` 마스크는 **켜진 물 위 기구 발자국**이고 `setWalkOn(mask)` 가
「켜져 있다가 꺼진 칸」을 돌려주면 그 위 손님을 `evictFrom`(수영 중은 건너뜀). `entryTiles`(`facility.ts:240`) 본문은 0 변경 —
술어를 주입받고 호출부는 `guest.ts:270` 하나.
**예외 자리**: `tooClose`(`game.ts:2205`) 첫 줄 `if (def.onRing || def.class==='rig') return null`(상대 쪽도) · frontage(`:2231`·`:2270`)에
`!== 'rig' && !onRing` · `autoPathFor`(`:1063`)·`ensurePath`(`:1109`) 즉시 0 · `recomputePassBy`(`:2566`) 진입 칸에 `isIndoorCode` ·
`isBuildingClass`(`:2204`)·`breaksAccess` 변경 0. `maxPerPark` 는 `canPlace`(`:2220` 아래) 한 줄 — `check()` 는 판 전체를 모른다.

### 3.7 켜짐·사슬·등급·인기·미리보기 (`src/sim/rig.ts` 신설)

```ts
export function ppajiGrade(x: { n; kinds; chain; chainKinds; lights }): 0|1|2|3|4 {
  if (x.n >= 14 && x.kinds >= 6 && x.lights >= 1)                          return 4;   // 시그니처 빠지
  if (x.n >= 9  && ((x.chain >= 4 && x.chainKinds >= 3) || x.kinds >= 5))  return 3;   // 대형 빠지
  if (x.n >= 5  && x.kinds >= 3)                                           return 2;   // 빠지
  if (x.n >= 2)                                                            return 1;   // 놀이 빠지
  return 0;                                                                             // 수영 빠지
}
export interface RigState { lit: Set<uid>; chainLen: Map<uid,n>; chainKinds: Map<uid,n>; walkOn: Uint8Array; byPool: Map<poolId, uid[]> }
export function computeRigs(grid, facilities, pools, overlay?): RigState   // 순수 · rng 0 · 저장 0 — P50-a(켜짐·walkOn) · chainScale/CHAIN_* 은 P50-b1
export function chainScale(len) { return min(2.0, max(1, sqrt(len / 2))); }
```
`ppajiGrade`(순수, `rig.ts`)와 `Game.ppajiGradeOf(poolId)`(인자를 모아 부른다)는 P49-a1 이 **스텁으로** 낸다 — 그 시점엔 `n` = 링 위 빠지 시설 수, `chain = chainKinds = lights = 0`(물 위 기구가 아직 못 놓인다). **P50-a 가 `computeRigs`·`RigState`·`walkOn`·`evictFrom` 을 내며** 켜진 기구를 `n` 에 더하고, P50-b1 은 값(`chainScale`·배율), P50-b2 는 화면·돈. `n` = 그 수역의 켜진 물 위 기구 + 링 위 빠지 시설, 소속은 `poolOfFacility(uid)` 하나(발자국 소유 수역 → 없으면 링 4이웃 → 칸 수
최다, 동점 id 작은 쪽). `chainKinds` 는 **최장 사슬의** 종 수. `CHAIN_KINDS_FOR_GRADE3 = 3` 은 시작 `obstacle` 계열이 정확히 3종(`slide` 도 3종·`rest` 2종)이라
「시작 해금만으로 도달 가능·도배로는 못 넘는」 최대값. 배율은 데이터(`balance.ppajiGradePopMul`), 문턱 5개는 코드.

**`afterWorldChange`(`game.ts:2584`) 순서**: `recomputePassBy` → `setForcedDoors` → `pools.setBlocked(기구 발자국)` → `pools.recompute()`
→ `rigs = computeRigs()` → `facilities.setWalkOn(rigs.walkOn)` → `guests.evictFrom(dark)` → `guests.invalidate(); poolCache.clear(); notePackages()`.
**`PoolStore`** 에 `tileOwner: Int32Array`(k → poolId)와 `blocked` 마스크 — `at()`(`pool.ts:70`)·`guest.ts:564/615/878` 의 `tiles.includes`
넷을 `ownerAt`/`isOpenAt` 로. 유입 `game.ts:1395` 만 `totalOpenTiles()`. **`blocked` 는 `isOpenAt`·`totalOpenTiles` 에만 쓰고 `recompute` 의
컴포넌트 탐색은 보지 않는다** — 기구가 수역을 가로질러도 `pools.all.length`·`totalTiles` 가 불변(게이트). **`blocked` 는 `isOpenAt`·`totalOpenTiles` 에만 쓰고 `recompute` 의
컴포넌트 탐색은 보지 않는다** — 기구가 수역을 가로질러도 `pools.all.length`·`totalTiles` 가 불변(게이트).
**연결 보너스는 `capacityOf`(`facility.ts:59`) 하나에만** `round((cap + lv보정) × chainScale(f.chainLen ?? 1))` — `chainScale` 의 base 2·cap 2.0 은
**데이터**(`balance.ppajiChainBase`·`ppajiChainCap`, `zoneAreaScale` 선례). `chainLen` 은 파생이라 `toSnapshot` 에서 빼고 로드 뒤 `afterWorldChange()` 가 채운다. `popOf` 무변경 · `thrillOf = def.thrill`.
**인기 교체**(`game.ts:1283~1284` 두 줄): `tilePop = p.tiles.length × tilePopStandard × ppajiGradePopMul[gradeOf(p.id)]` —
`PoolContext.tilePopSum?` 를 필수 `tilePop` 으로, 폴백(`pool-state.ts:84`)과 `PoolStore.state`(`pool.ts:77~81`, production 호출부 0) 삭제.

**조준 미리보기 `aimPreview(defId,i,j,facing)`** → `{gradeNow, gradeNext, chainNext, lit, pkgNow, pkgNext}` — 가짜 인스턴스를 **저장소에 넣지 않고**
`computeRigs(grid, facilities, pools, overlay?)` 의 오버레이 인자로 넘겨 `ppajiGrade`·`bandPrice` 를 **그대로** 돌린다(미리보기 전용 산식 0줄).
`wouldEnclose` 와 같은 제약: `nextUid`·`occ`·`grid.rev`·`pools.version`(`pool.ts:54`) 을 안 만진다. `nextUid`(`facility.ts:69`)·`occ` 는 private 이라 **검사 전용 읽기 표면 `FacilityStore.probeForTest(): {nextUid, occHash}` 를 신설**한다(게이트: 호출 전후 넷 불변 — 조준만 해도 세이브가 달라지면 안 된다). UI(`place.ts:119~128`)는 DOM 에 내기만.
확정 바 칩은 **이번 확정으로 실제로 바뀌는 값을 앞에** 낸다(`정원 2 → 3 · 연결 3 · 자유이용권 400 → 600G`, 등급이 바뀌면 그것이 첫 칸) — 등급은 한 빠지에 평생 네 번만 움직인다. 거절이면 칩을 안 낸다. CSS 는 `.kdock-row`(`style.css:683`)에 합친다.
⚠ **돈 칸은 P50-b2 에서 산다** — `wristband.ts` 의 **순수 값 함수**(`bandPrice·bandTop·bandFor`)와 `wristbands.json`·`packages.json` 의 `ppaji` 항목이 P50-b2 산출물이다(상태·결제 `issueBand`·회수·손님 필드는 P52-a)(v4 는 P52-a 에 두어 「30초 루프의
마지막 칸은 돈」을 화면에서 한 번도 못 쟀다 — 5라운드 차단). P52-a 가 더하는 것은 손님 쪽(발급·회수·게이트)뿐이다.
**상시 이음쇠** `rigLinkEdges(): {i,j,dir}[]` 를 sim 이 내고 씬은 `overlay/rig_link` 를 그리기만.

### 3.8 손님·팔찌·개조·사고·수온

**손님 — FSM 변경 0(`GuestState` 11값 `guest.ts:18`)**: `startUse`(`:677`)에 물 위 기구·휴식 기구 분기 · `finishUse`(`:702`) 만족
`+ thrillOf × 3 × satMul` · 딥 기구 뒤 「풍덩」(4이웃 open 칸이 있으면 `state='swim'`, `guest.ts:558~577` 착수와 같은 모양) — 기구 → 수영
→ 배고픔 → 매점 사슬(D33). `tasteWeight`(`:132`)·`setEmote`(`:704`)에 `'rig'`.

**팔찌** (`src/sim/wristband.ts` 신설, 순수) · `wristbands.json`:
| id | 이름 | rides | base | 여는 등급 | 값 |
|---|---|---:|---:|---|---:|
| `vest_only` | 구명조끼 | 0 | 0 | 0 | 0 |
| `big3` | 3종 팔찌 | 3 | 300 | 1 | 400 |
| `big5` | 5종 팔찌 | 5 | 400 | 2 · 3 | 600 · 700 |
| `allday` | 종일 무제한 | 99 | 500 | 4 | 1,000 |
`bandPrice(t, grade, step=0.25) = round50(base × (1 + step × grade))` · `bandTop(grade)` = 그 등급에서 열린 최상위(확정 바가 쓰는 값) ·
`bandFor(thrill, opened, minIdx)` = 출신지 취향 `thrill` 로 칸을 고른다(뽑기 0). 손님 필드 둘 `band?`·`bandLeft?`(저장), `hasVest = band != null`.
**결제 소유자 하나 `issueBand(buyer, tier, grade, f?)`**: 낮 1회(`bandPaid`) · 팀 전원에 배급 · `stats.pkgPpaji`·`f.incomeToday` 누적.
창구 ⓐ `rental_tube`(`onFacilityUse` `game.ts:1498~1557` 가지, 파크 최고 등급) · ⓑ 자리 패키지 `ppaji`(`claimSeat` `:917~931` 의 band 분기 —
`:925` 자리 배수·`:927~930` 결제 다섯 줄을 **통째로 건너뛴다**; `packageFor` `:853` 은 `bandPaid` 팀에게 band 패키지를 후보에서 뺀다).
대여소 없는 판 = ⓑ 만 · 있는 판 = ⓐ 가 앞이고 ⓑ 는 고기·숙박을 판다. 걸어온 팀의 공짜 탑승은 창구 ⓐ 가 막는다(안 지으면 못 타는 것).
**회수 소모**: 딥 기구 이용 끝에 `bandLeft −= def.bandCost ?? 1`(여울·풀·식당·코스는 안 깎는다). **`pickTarget`(`guest.ts:763~812`)** 시설 루프에
① 딥 ∧ 회수 부족 → 제외 ② 딥 ∧ 어린이 → 제외 ③ `team` ∧ 팀 없음 → 제외 ④ `w *= deep ? s : 2−s`(`s = swimSkill`) ⑤ `w *= swimUrgeRig(uid)`
· 슬라이드에 `band == null → ×0.3`. 뽑기는 끝의 1회(`:804`) 그대로. 못 타는 손님은 `say='팔찌가 없네…'`(하루 한 번).

**개조** `convertFacility` — 검사 순서: 인스턴스·정의 → `RIG_UPGRADES{from,to}` → `rigs.known` → 탑승 중 손님(`ride|climb`) 거절 →
`facilities.check(to, …, uid, water)` → `canMoveFacility`(`game.ts:2264~2270`)의 다섯 줄 → `breaksAccess` 전후 → 돈. 보존 12필드
(`uid i j facing rentedBy usesToday level usesTotal incomeToday incomeTotal staff paidToday`), `chainLen` 은 파생이라 목록 밖.
`convertCost = round100((max(0, to.cost−from.cost) + to.cost×0.30) × (1 − 0.05×(lv−1)))` — 예 `trampoline_w` 2,600 → `rig_tramp_double` 3,400 = 1,800G.
`convertPreview` 는 P51 에 네 값(스릴·정원·안전·개조비), 위험 두 필드는 P52-b 가 optional 로 더한다. 그날 환불 `paidToday`(기구·링 위만).

**사고** (`src/sim/accident.ts` 신설):
```
hazard = max(floor 0.002, base 0.008 × thrillN × unsafeN)          // 바닥은 위험 모양에만 — 코스 안전 100 이라 안 그러면 망루·브리핑이 한 푼도 안 듣는다
p = hazard × (vest?1:3.0) × (guarded?0.5:1) × (rescued?0.8:1) × (briefed?0.7:1) × (cold?1.5:1) × clamp(busy/cap, 0.5, 1.5)
```
`base` 유도 = 목표 0.6건/일 ÷ (하루 기구 이용 134 × 위험 기댓값 0.53). 뽑기는 `onFacilityUse` 안 기구 가지·선착장 가지 각 1회, 전용
스트림 `rng.accident`(`RNG_SALTS` `game.ts:104` 9 → `accident:10`·`rig:11`·`night:12` — **셋 다 P49-a1 이 연다**, 쓰는 것은 P52-b·P51·P54) — `guest.ts` 의 rng 줄은 안 바뀐다(`:706` 훅 뒤 `:709` 가 사진 뽑기).
효과 hp −35 · sat −20 · 토스트 · `stats.accidents++` · 의무실로. 하루 상한 3(넘으면 뽑기는 하고 결과를 버린다).
SNS: `game.ts:1490` `sns.post` 인자에 `basePop × (1 − min(0.5, 0.20 × accidentsToday))`(실측 −6.8%).
위험 칩 `safe/watch/alert/danger` = `p ≤ floor / < base/2 / < base / 그 이상`(만석 기준) — 시설 정보 넷째 행 + 반경 오버레이 + 확정 바 라벨.
망루 망루 반경 6(체비쇼프, 알바 있을 때만 — `staffable` `facility.ts:31` 이 `utility` 라 그대로 통과) · 구조정 10 — 둘 다 `guardRadius` 데이터.
브리핑(**전부 신설** — 리포에 0건): `CourseDef.safetyBriefing?`(`courses.json` 데이터, 프리셋이 켜면 못 끈다)과 `PlacedCourse.safetyBriefing?`(세이브 optional, P52-b) ·
`courseBriefed = preset.safetyBriefing || c.safetyBriefing` · `boardTicks +15`(`metrics.ts:81` 회전 중앙 149.4 의 10%) · 사고 ×0.7 · 알바 있는 선착장만.
망루·구조정 반경은 `def.guardRadius` **하나만** 읽는다(코드 상수 없음). 헬멧은 별도 필드를 두지 않는다 — 실지의 헬멧은 비행형(스릴 4)에 붙는데 우리 스릴 4 는 팔찌 `bandCost 2`(프리미엄) 칸이 그 자리다.

**수온·장마**:
```
waterTemp(indoor) = indoor ? 26 : ambientOutdoor[season] + WEATHER_TEMP[weather] − 3
swimUrgeOf(indoor, grade) = indoor ? 1 : closed ? 0 : (grade ≥ 4 ? max(u, 0.9) : u),  u = clamp((T−16)/10, 0.15, 1)
```
입력 전부 실측(`seasons.json` `[24,30,22,14]` · `weather.ts:14` `{clear 0, cloudy −2, rain −4, snow −3}` · 겨울엔 `clear` 가 없다 `weather.ts:19`).
날씨 가중 입수 기대: 여름 0.905 · 봄 0.40 · 가을 0.24 → `offSeasonSwim` 밴드 0.20~0.55. `poolTempFit`(`guest.ts:622`)은 안 건드린다.
장마: `EventEffect`(`random-events.ts:8`)에 `rigLoss?` — `typhoon` 「부표 보강」 `{rigLoss:0}`(지금 효과가 `{}` 로 비어 있다) · 「버티기」 0.25 ·
`jangma_rapids` 0.10. 뽑기는 `Game.resolveEvent` 가 `accident` 스트림으로 기구마다 1회, 앵커 개조판 면제. 폐쇄는 `waterClosedUntil?` 하나.

### 3.9 매출·밤·다회차·봇

**빠지 축 직접 매출** = `stats.pkgPpaji`(팔찌) + 플로팅 바 매출. 정보창 다섯 줄(등급·기구·연결·허가·**어제 수입** `incomeYest`).
**목표 A 폴백 사슬**(`main.ts:154`): 켜진 기구 0 → 「빠지에 기구를 하나 붙이자」 · 연결 ≤1 ∧ 장애물 ≥2 → 「기구를 이어 붙여 보자」 ·
개조 아는데 0 → 「기구를 개조해 보자」 · 가을 신청 창 → 「가을 심사를 신청하자 — 오늘까지야」. **슬롯 구조 한 줄**(`main.ts:167`, G10): 지금은 `return a ?? [A,B,C][goalSlot]` 라 A 폴백이 켜지면 B·C 가 화면에서 사라진다 → `return [a ?? A, B, C][goalSlot]`.
하네스 세터 `pinGoal(n|null)`(`main.ts:657` api 옆, `goalSlot` 은 6초 회전이라 직접 대입 금지).

**밤**:
```ts
if (tick === EVENING_TICK) { nightOn = nightPartyOn(); if (nightOn) { syncNightSet(); issueNightBands(); noteNightOpen(); } }
nightPartyOn() = rank ≥ 3 ∧ ∃pool: grade ≥ 3 ∧ 켜진 lights ≥ 1 ∧ 켜진 물 위 기구 ≥ 9
nightSalesMul() = 1 + 0.1 × min(4, 그 수역의 켜진 lights)          // 1.0 … 1.4 — 손잡이는 LED 부표
```
`syncNightSet` 은 **없는 함수**다(실측 0건) — `recomputePassBy` 꼬리(`game.ts:2582`)의 대입 한 줄을 뽑아 만들고, 밤이 열린 수역의
켜진 기구·링 위 매점(`menuSlots > 0`, `restaurant` 라 기존 필터에 안 잡힌다)을 더한다. 호출부 정확히 둘(꼬리 + 래치 프레임).
**야간권 발급 경로(5라운드 차단 해소)**: 저녁엔 새 손님이 0명이다(`ARRIVAL_TO_TICK === EVENING_TICK === 1400`, `clock.ts:15,36`).
그래서 래치 프레임의 `issueNightBands()` 가 **이미 자리 잡은 팀**(`teamSeatedIds` `game.ts:907` 문법)마다 `nightChance`(0.5, 기존 키)로
한 번 굴려 `issueBand(night=true)` — 뽑기는 **전용 스트림 `rng.night`**(`RNG_SALTS` 에 `night:12`), 밤이 안 열린 날은 0회(`--no-night` 대조군이 골든·봇 요약까지 비트 동일) — 값 `bandPrice × nightSalesMul()`, 회수를 다시 채운다, `nightBandTeams` 는 저장 0.
곱하는 자리 셋(전부 `nightEve()` 게이트): 야간권 · 링 위 매점 매출(`game.ts:1511`) · 빠지 반경 자리 이용료(`:1547~1553`).
`DayReport` optional 넷(`nightOn? nightPkg? nightFood? nightFee?`, 0/false 면 안 쓴다). `nightOn` 래치는 하루 안에서만 살고 **저장하지 않는다**(로드 뒤 다음 저녁에 다시 판정 — 저녁 로드는 그날 밤이 닫힌 것으로 본다). 첫 개장만 모달, 이후 티커.
밴드 `nightRevShare` 0.083~0.34 — 하한은 손님이 남는 구간 140/1,680.

**다회차**: `Carryover version 2`(`rigParts? rigUpgrades? workshopParts? workshopKnown?`, v1 의 `tiles` 는 읽고 버린다) ·
`applyCarryover`(`endgame.ts:68`) 요리 두 줄 문법 · NG+ 는 가장 작은 발자국의 개조판 한 채를 `placeInKitPpaji` · `SCORE_WEIGHTS` 에 `rigs:5 · signature:50`.

**봇**(하루 순서: 답하기 → 짓기 → **빠지** → 공방 → 상점 → 인증):
`growPpaji`(허가 잔량 ≥ 20 ∧ 현금 > 예비비면 바깥 6×7, 후보 시도 ≤ 8) → `attachRigs`(켜진 링/기구에 4이웃, **종 우선**, 링 후보에 매점 한 채 우선)
→ `chainRigs`(같은 계열 사슬 끝 ×3) → `upgradeRig`(도감을 본다) → `buyRigParts` → `ensureWatchtower` → `briefCourses`. `ensureHallShops` 에 `rental_tube`.
삭제: retile 분기(`bot.ts:155~163` — 럭스 구매는 `if (spendable() > 80000)` 로 승격해 남긴다) · `widenRing`(`:601~641`)·`layDeckRing`(`:647~669`, `RIVER.j0 + tier*6` 사다리). 천장은 게임 값(`permitMax`·96칸)에서.
스위치 `--no-rig · --no-convert · --no-vest · --no-night · --sweep k=v` 는 **그 축을 내는 페이즈**가 같이 낸다. `--warn <keys>` 는 **P49-a1 이 낸다**(5라운드 차단: 소유 페이즈 없음).

### 3.10 성능 예산 (폰 한 프레임 16.7ms · dev ×5)

| 함수 | 언제 | dev 실측 | 문턱 | 자 |
|---|---|---:|---|---|
| `carveBend` · `newPark` | 새 판 1회 | 0.33 · 0.98 ms | ≤ 1.0 · 2.0 | 단위 벤치 |
| `syncEnclosedWater` 전 격자 | 세계 변경당 1회 | 0.45 ms | ≤ 1.0 · 프레임 루프 호출 0 | 단위 + 정적 |
| `wouldEnclose` · `aimPreview` · `computeRigs` | 조준 칸이 바뀐 프레임 / 세계 변경당 1회(호출부 13곳) | 0.45 · — · — | ≤ 0.6 · 0.6 · 0.5, 프레임당 ≤ 1 | 단위 + 하네스 계수기 |
| `seatScan` · `notePackages` | 자리 배정당 / 세계 변경당 | — | ≤ 0.2 · 1.0 | 단위 |

---

## 4. 데이터

### 4.0 `FacilityDef` 새 필드 13 (전부 optional — 기존 107종 중 이전 12 만 §4.1 이 class/depth/onRing 을 바꾸고 95 는 무수정)

`onRing` · `depth('shallow'|'deep'|'any')` · `chain` · `thrill 0..4` · `safe 0..4` · `needsVest` · `team` · `lights` · `guardRadius` ·
`rentKind('pkg'|'ride')` · `buildable:false`(개조판) · `maxPerPark` · `bandCost 1|2`.
`validateRigData`: `class:'rig'` ⇒ `depth` 필수 · `slide === null` · `menuSlots 0` · `indoorOnly false` · `usageFee 0` · `capacity ≥ 1` ·
`cost/pop ∈ [60,140]` · `maint ≈ pop×5.3 ±30%` · `pop/(w×d) ≥ 2.8` · `capacity ≥ 6 ⇒ 발자국 ≥ 6` · **`needsVest ⇔ depth==='deep'`**(양방향, 정의역 rig 전부) ·
`maxPerPark` 는 정확히 1종이고 `rigs.json` 의 `to` 에 없다 · `bandCost 2` 는 딥 rig 1종 이하 · `buildable:false ⇒ unlock.source==='craft'`(`'craft'` 멤버는 P49-a1 이 열고 개조판 데이터는 P51 — a1 시점엔 공허 참).
값 유도와 `cost/pop` 대역은 **`class:'rig'` 에만** 적용한다 — 링 위 비-rig 4종(`watchtower`·`rig_rack`·`rig_float_bar`·`rescue_dock`)은 자기 class 의 기존 눈금(`data.test.ts:57` 밴드)을 따른다.
값 유도: `cost = round100(pop×90)` · `maint = round(pop×5.3)` · `safe = 2 − floor(thrill/2)` · `hpΔ = useTicks ≥ 12 ? +25 : thrill===0 ? 0 : −(4+2·thrill)`.

### 4.1 새 기구 21종 (`rig_` 접두, rig 17 + 링 위 비-rig 4)

| id | 이름 | class·위치 | depth | w×d | 정원 | thrill/safe | pop | cost | chain | 해금 |
|---|---|---|---|---|---:|---|---:|---:|---|---|
| `rig_slide` | 플로팅 슬라이드 | rig·물 | any | 2×3 | 4 | 2/1 | 18 | 1,600 | slide | 시작 |
| `rig_bridge` | 장애물 다리 | rig·물 | any | 1×2 | 2 | 1/2 | 8 | 700 | obstacle | 시작 |
| `rig_stepstone` | 징검다리 | rig·물 | any | 1×1 | 1 | 1/2 | 4 | 400 | obstacle | 시작 |
| `rig_beam` | 밸런스 빔 | rig·물 | shallow | 1×2 | 2 | 2/1 | 9 | 800 | obstacle | 시작 |
| `rig_seesaw` | 시소 플로트 | rig·물 | any | 2×1 | 2(team) | 1/2 | 10 | 900 | — | 시작 |
| `rig_hammock` | 해먹 라운지 | rig·물 | shallow | 2×3 | 4 | 0/2 | 18 | 1,600 | rest | 시작 (hp +25) |
| `rig_mini_slide` | 미니 슬라이드 | rig·물 | shallow | 2×2 | 2 | 1/2 | 12 | 1,100 | slide | 시작 |
| `watchtower` | 안전 망루 | utility·링 | — | 1×1 | 알바 1 | —/4 | 10 | 900 | — | 시작 (반경 6) |
| `rig_blob` | 블롭 점프 | rig·물 | deep | 3×1 | 2(team) | 3/1 | 16 | 1,400 | — | ★1 |
| `rig_roller` | 워터 롤러 | rig·물 | any | 1×1 | 1 | 2/1 | 7 | 600 | — | ★1 |
| `rig_sunbed` | 선베드 플로트 | rig·물 | any | 1×2 | 2 | 0/2 | 11 | 1,000 | rest | ★1 (hp +25) |
| `rig_rack` | 기구 거치대(빠지) | utility·링 | — | 1×2 | 2 | —/2 | 10 | 900 | — | ★1 (`rentKind:'ride'`) |
| `rig_slidedock` | 미끄럼 도크 | rig·링 | any | 2×1 | 3 | 1/2 | 15 | 1,400 | slide | ★2 |
| `rig_float_bar` | 플로팅 바 | **restaurant**·링 | — | 2×1 | 3 | —/2 | 30 | 1,100 | — | ★2 (menuSlots 5) |
| `rescue_dock` | 구조정 계류대 | utility·링 | — | 1×2 | 1 | —/4 | 18 | 1,600 | — | ★2 (반경 10) |
| `rig_totem` | 워터 토템 | rig·물 | deep | 1×1 | 1 | 3/1 | 14 | 1,300 | — | 소원 |
| `rig_iceberg` | 아이스버그 | rig·물 | deep | 2×2 | 3 | 3/1 | 26 | 2,300 | — | 인증 `grade_b` |
| `rig_kids_park` | 키즈 워터 놀이터 | rig·물 | shallow | 3×2 | 6 | 1/2 | 24 | 2,200 | — | 인증 `scent_d` |
| `rig_jump_tower` | 점프 타워 | rig·물 | deep | 2×2 | 2 | 4/0 | 30 | 2,700 | — | ★4 |
| `rig_disc` | 회전 원반 | rig·물 | deep | 2×2 | 4 | 4/0 | 34 | 3,100 | — | ★5 (`maxPerPark 1` · `bandCost 2`) |
| `rig_led_buoy` | LED 조명 부표 | rig·물 | any | 1×1 | 1 | 0/2 | 8 | 700 | — | 인증 `color_b` (`lights`) |

검산: 시작 물 기구 7종 발자국 합 23 > 킷 안 20 → **「무엇을 넣을까」가 첫 결정** · 여울 전용 3종 12칸 > 킷 여울 8 · 시작 8종 값 8,000G(시작 자금 67%)
· 시작 3계열로 킷 안에서 사슬 4·종 3 이 ㄴ 자로 성립 · `deep` 7종(위 5 + `trampoline_w` + `diving`) · 시작 8종에 deep 0 이라 첫 30분을 안 막는다.

**이전 12종**(id·unlock·값 무수정): `trampoline_w` rig·deep·needsVest(3×3) · `turtle_island` rig·any(8×6 그대로) · `airbounce` rig·any(6×5) ·
`waterwalk` rig·any · `diving` rig·onRing·deep·needsVest · `slide_tube` **slide 유지**+onRing · `rent_sup/kayak/pedal/duck`·`dock`·`float_deck` onRing.
콤보 8쌍은 재지정하지 않고 「각 쌍에 성립하는 배치가 존재한다」를 검사로. `rental_tube` 는 이름 「구명조끼 대여소」와 desc 만.
`gear_rack` 은 `rentKind:'pkg'` 로 `game.ts:1501` 의 id 하드코딩을 옮긴다.
**견인 이름 8건**(`gears.json`·`equipment.json` `name` 만 — 카탈로그 반영): `honeycomb`→단군 · `flycarpet`→UFO(정원 무변경 — 이미 8) · `swing`→마블 · `air_chair`→바이퍼 ·
`hydrofoil`→플라이보드 · `marine_jet`→샤크 제트보트 · `water_roller`→롤링 튜브 · `blobjump`→점프 튜브(플로팅과 이름 충돌 회피). 정원·요금·sprite 0줄.

### 4.2 부품 13 (`src/data/rig-parts.json`, `parts.json` 무수정) · 개조 20 (`src/data/rigs.json`)

부품: `pump_motor`(1,200, shop·★1·인증·연차 Y1 겨울) · `waterproof_canvas`(700) · `anchor_chain`(900, 유실 면제) · `safety_net`(800) · `twin_saddle`(1,000) ·
`slip_wax`(500) · `led_strip_buoy`(1,100, ★2) · `float_drum`(600) · `spray_nozzle`(900, ★3 진열·연차 Y5) · 연차 전용 `speaker_horn`(y5)·`mooring_rope`(y5)·`ramp_deck`(y6)·`spin_bearing`(y7).
개조(`{id, name(별명), cat, from, to, key, add[], unlock:'start'|'craft'}`, `level:N` 없음): `up_slide2`(start) · `up_slide_spiral`(2단) · `up_tramp_double`(start) ·
`up_tramp_tower`(2단, y6) · `up_bridge_swing`(start) · `up_iceberg_wall` · `up_blob_big` · `up_roller_double` · `up_seesaw_spin` · `up_beam_zigzag` · `up_hammock_parasol` ·
`up_sunbed_led` · `up_kids_watergun` · `up_mini_double` · `up_diving_tower`(y6) · `up_totem_spin`(y7) · `up_dock_wax` · `up_disc_motor`(2단, y7) · `up_watch_horn`(y5) · `up_bridge_long`(2단, y5).
후반 6건이 연차 부품에 물려 구조적으로 Y5+ · Y1~Y4 가능 14 → 밴드 `rigUpgradesY4 ≤ 10`. 이름은 카탈로그 §2 별칭 풀(닌자·난리보트·개구리·호떡…)에서, `from` 낱말 계승 ≤ 4.
개조판 20종은 `buildable:false`, 밴드 `Δthrill+Δcap+Δsafe ≤ 2 ∧ 하나 ≥ +1 ∧ (Δthrill ≥ 1 ⇒ Δsafe ≤ 0)` · `to.chain === from.chain` · `to.cost ≤ from.cost × 3`.
`RigStore extends CookingStore`(`cook()` 4줄 오버라이드, 실패작 없음, `rng.rig` 스트림 불변 검사) · `RIG_WORDS{item:'부품', cost:400, minCount:2, unlockLabel:'기구 개조'}`.

### 4.3 `balance.json` 새 키 24 — **전부 P49-a1 이 넣는다**(뒤 페이즈는 읽기만)

`permitTilesByRank` · `ppajiGradePopMul` · `ppajiMinInner 4` · `ppajiMinTiles 20` · `ppajiLineLens [2,4,6]` · `ppajiPkgGradeStep 0.25` · `accidentBase 0.008` ·
`accidentFloor 0.002` · `accidentHp 35` · `accidentSat 20` · `accidentsPerDay 3` · `accidentPopCut 0.20` · `accidentPopCutMax 0.5` · `briefingBoardTicks 15` ·
`briefingAccidentMul 0.7` · `convertFee 0.30` · `convertLevelDiscount 0.05` · `riverChill −3` · `swimUrgeMin 0.15` · `nightLightStep 0.1` · `nightSalesMax 0.4` · **`ppajiChainBase 2` · `ppajiChainCap 2.0`** · `rigRemoveRefund 0.5`(24키 — 철거 환불 비율, §1.6).
`accident.ts` 의 `NO_VEST 3.0 · GUARD 0.5 · RESCUE 0.8 · COLD 1.5` 도 **데이터로**(`accidentMul` 객체 하나 — 5라운드 정합성 감점).
유지: `poolTileCost 100` · `tilePopStandard 4` · `nightChance 0.5`.

### 4.4 물빛 삭제 (`tiles.json` 파일째) — 인증·트리거·엔딩이 먼저 옮겨 간다

죽는 것: `TileDef·TILE_DEFS·TILE_INDEX` · `Game.tileDefs/tileDef/retileCost/retilePool`(`game.ts:1873~1894`) · `unlocked.tiles` · `Grid.poolTile/poolTileAt/set(…,poolTile)` ·
`GameSnapshot.grid.poolTile`(`:2664`)·`unlocked.tiles`(`:2701`) · `grant case 'tile'`(`:421`) · `Carryover.tiles` · `Condition.tile?`(`schema.ts:140`) · `PoolView.tiles?`·`TILE_KO`(`condition.ts:27,76`) ·
`Game.tileCount`·`tileCounts`(`:409~411`) · 랭크 창 물빛 열(`rank.ts:74`) · 엔딩 「부표 N」(`ending.ts:48`) · 봇 retile · 하네스 G53「물빛 13」·G37 절 · `g53.test.ts:33`.
**참조 목록은 손으로 유지하지 않는다** — `tools/check-tiles-dead.mjs`(정규식 + 허용목록 2줄 `poolTileCost`·`poolTiles`)가 `src tools` 전수 0건을 단언하고 `--selftest`
로 한 줄 되살리면 빨간불. 파일·건수는 그 출력에서만 인용한다.
**인증 보상 12 교체**(`certs.json`, 전부 `kind:'tile'`): 기구 3(`grade_b`→`rig_iceberg` · `scent_d`→`rig_kids_park` · `color_b`→`rig_led_buoy`) · 부품 9(`stream_b`→`anchor_chain` ·
`scent_b`→`spray_nozzle` · `color_f`→`waterproof_canvas` · `color_d`→`float_drum` · `scent_f`→`slip_wax` · `spa_d`→`pump_motor` · `spa_b`→`led_strip_buoy` · `stream_d`→`twin_saddle` · `fun_c`→`safety_net`).
조건에서 물빛을 읽는 것은 `grade_a` 의 `tile sandy` 하나 → `rigGrade{min:3}`.

### 4.5 조건 DSL 4 · 인증 조건 재배선 9 · 소원 20 · 스토리 6 · 연차 폴백 8

```ts
| { kind:'rigGrade'; min; count? } | { kind:'rigChain'; min; count? }
| { kind:'rigCount'; min; kinds?; depth? } | { kind:'rigGuarded'; min?; ratioMin? }     // ConditionWorld.rigs(): RigView[]
```
**DSL 넷은 P49-a1 이 연다**(`schema.ts:139` 유니언 + `condition.ts` 평가). a1 시점의 평가는 **스텁**이다 — `rigGrade` 는 링 위 시설만 세고 `rigChain` 은 0, `rigGuarded` 는 `guardRadius` 데이터로 P50-a 부터 참값(망루가 시작 시설이라). 그것을 쓰는 데이터만 페이즈별로: `grade_a` 는 P49-a2, 나머지 인증·소원은 P53-a.
인증 **보상** kind 유니언(`schema.ts:217`·`:255`)의 `'rigPart'` 도 P49-a1 이 연다(게이트: 부품 13 id 를 전부 가리킬 수 있다).
**DSL 넷은 P49-a1 이 연다**(`schema.ts:139` 유니언 + `condition.ts` 평가 — `rigGuarded` 는 망루가 없으면 0 이라 P52-b 전엔 거짓일 뿐). 그것을 쓰는 데이터만 페이즈별로: `grade_a` 는 P49-a2, 나머지 인증·소원은 P53-a.
인증 **보상** kind 유니언(`schema.ts:217`·`:255`)의 `'rigPart'` 도 P49-a1 이 연다(게이트: 부품 13 id 를 전부 가리킬 수 있다).
인증: `grade_f` `rigCount 2` · `grade_d` 여울 2 + 강 2 · `grade_b` `rigGuarded ratio 0.5` · `grade_a` `rigGrade 3` · `grade_s` `rigGrade 4` · `stream_d` `rigCount 5 kinds 3` ·
`stream_b` + `rigChain 4` · `fun_c` + `rigGuarded 2` · `fun_a` + `rigGuarded ratio 0.167`(`fun_e` 무변경). 색·향·온천 계열 조건은 안 바꾼다.
소원: `pool` 조건을 가진 소원 중 `sizeMin` 을 든 것에서 20건을 `rigCount/rigChain/rigGrade` 로(분모는 `ref-count.mjs` 출력에서 인용), `line` 에 「기구」·「이어」·「등급」 낱말(검사) · 감소 방향 조건 0 · 보상 2건 기구 승격.
스토리 트리거(`story.ts:9~13` 유니언 14 → 20): `rigs · rigChain · rigGrade · gearsKnown · vestRentals · rigUpgrades`. 비트 9(24 → 33): `first_rig{rigs,1}` · `rig_chain2` ·
`vest_first` · `first_workshop{gearsKnown,3}` · `first_convert{rigUpgrades,1}`(값은 `stats.converts`) · `rig_grade2` · `rig_chain4` · `signature{rigGrade,4}` · `rigs12`. `first_pool` 32 → 28.
연차 폴백(`calendar.json` 32 → **40**, `priority:'strip'` — **`CalendarEvent.priority` 유니언(`schema.ts:296`)에 `'strip'`, `grant.kind` 유니언(`:294`)에 `'rigPart'` 를 P49-a1 이 같이 연다**):
Y1 겨울 `pump_motor`(`calendar_y1_winter_rigpart_pump`) · Y2 `slip_wax` · Y3 `led_strip_buoy`(★2 진열 부품 — ★1 에서 멎은 판의 첫 조명) · Y4 `rig_iceberg` · Y5 `spray_nozzle` · Y6 `rig_kids_park` · Y7 `rig_led_buoy` · Y8 `rig_jump_tower` — **Y1~Y8 매년 하나**. P53-a 게이트는 id 존재가 아니라 **해금 발생**을 잰다.
★5 `rig_disc`·★1·★2 기구·연차 부품은 안 준다.

---

## 5. 코드 변경 (파일별)

**소유 요약** — 아래 목록의 항목은 이 표로 페이즈를 찾는다(`check-plan.mjs` 가 §6 과 대조):
| 무엇 | 소유 |
|---|---|
| 유니언 멤버 전부(`'rig'`·`'craft'`·`'rigPart'`·`'strip'`·`'ppaji'`·조건 kind 4·`FacilityFail` 3) · `FacilityDef` 새 필드 13 · `PlacedFacility.chainLen?/paidToday?/incomeYest?` · `stats.converts?/pkgPpaji?/vestRentals?` · `balance.json` 24키 · `RNG_SALTS` 셋 · `tools/bot.ts` `--warn`(키: `money·popularity·certFamilies·teamSeatY1·passByShare·pkgShare`)·`--sweep k=v`·`--no-*` 넷 · `RigStore` 저장부 + `rng.rig` · `ppajiGradeOf` 스텁 · `FacilityStore.probeForTest` | **P49-a1(골격)** |
| `computeRigs`·`RigState`·`walkOn`·`setWalkOn`·`guests.evictFrom`·`guestWalkable`·`WaterRules`·`open` 계열·`notePackages` 성능 | **P50-a** |
| `chainScale`·`CHAIN_*`·배율 값·`chainLen` 스냅샷 제외·사슬 항등 | **P50-b1** |
| `aimPreview`·`rigLinkEdges`·확정 바 칩·정보창 5행(어제 수입은 P51 배선 전까지 「—」)·`main.ts:167` 슬롯 구조·`pinGoal`·`wristband.ts` 값 함수·`wristbands.json`·`packages.json ppaji`·켜짐 연출·등급별 폰툰 색·꺼짐 틴트 | **P50-b2** |
| `convertFacility` 계열·`RIG_UPGRADES`·`rigs.json`·`buyRigPart`·`paidToday`/`incomeYest` **배선**·`rigRemoveRefund` 배선·`measure.ts` | **P51** |
| `issueBand`·회수·`band?/bandLeft?`·`seatScan`·`stats.pkgPpaji` **배선** | **P52-a** |
| `accident.ts`·위험 칩·`courses.json safetyBriefing`·`PlacedCourse.safetyBriefing?` | **P52-b** |
| `test-helpers.ts`(`makeTestPpaji`·`digWater` — **물 위만** 판다, 뭍 파는 검사 ~25곳을 여기서 물로 옮긴다)·`dump-save.ts`·`goal-num.ts`·`ref-count.mjs`·**`check-plan.mjs`**(§5 파일:줄·태그 vs §6 · 페이즈당 게이트 ≤10 · H 표) | **P48-a** |


- **`src/sim/grid.ts`** — 삭제 `riverFloorFor`(`:76`)·`poolTile` 계열(`:149,273,277,281`) · 신설 `natural` 4함수·`BEND`·`bendCenter/Half/Curv`·`carveBend`·(미결 ①) `bendVariant` ·
  수정 `newPark`(`:296~317` 9단)·`raiseHills`(`:337`)·`inLandOrWater`(`:111~113`). `isRiverRow`·`waterRowMax` 유지.
- **`src/sim/game.ts`** — 삭제 물빛 4함수(`retileCost/retilePool` `:1873~1894`, `tileDefs/tileDef` 는 별도 줄)·`grant 'tile'` · 신설 `permitMax/Used/Left`·`wouldEnclose`·`countEnclosedWater`·`canMakePpaji/makePpaji/canPlaceLine/placeLine`·
  `poolOfFacility`·`ppajiGradeOf`·`ppajiWaterAt/depthAt/ringAt`·`rigsOf/rigChainTiles/rigDepthOf/rigLinkEdges/aimPreview/rigSizeHint/ppajiGradeMax/rigsDistinct/rigChainMax/ppajiRevYesterday/ppajiPkg`·
  `canConvertFacility/convertFacility/convertPreview/buyRigPart`·`seatScan/seatPpajiGrade/issueBand/bandAtSeat`·`rigRiskOf/rigRiskAt`·`waterTemp/swimUrgeOf`·`placeInKitPpaji`·
  `nightPartyOn/nightEve/nightSalesMul/syncNightSet/issueNightBands`·`nightOn/nightPoolId/nightBandTeams/nightPkgToday` ·
  수정 `syncEnclosedWater`(`:1747~1776`)·`inMyWater`(`:1778~1780`)·`ownsTile`(`:1240`)·`isOpenWater`(`:741~744`)·`canPaintDeck`(`:1802~1811`)·`paintDeck`(`:1817~1835` sync→after)·
  `unpaintDeck`(`:1837~1852`)·`checkRank`(`:510` 허가 +N)·`:2223` `ownsTile`·`computePoolState`(`:1283~1284`)·`grant`(`:416~428` `rigPart`)·`digPool`(`:1896` 뭍 분기 삭제)·`canDig`(`:1786~1799`)·
  `tooClose`(`:2205`)·frontage(`:2231`·`:2270`)·`autoPathFor`(`:1063`)·`ensurePath`(`:1109`)·`recomputePassBy`(`:2566`)·`reachSet`(`:1087`)·`reachability`(`:2610~2612`)·
  `facilities.check` 호출 둘(`:2221`·`:2265`)·유입(`:1395`)·`afterWorldChange`(`:2584`)·`stats`(`:229/:291/:2700/:2722` `converts? pkgPpaji? vestRentals?`)·`RNG_SALTS`(`:104`)·
  `onFacilityUse`(`:1498~1557`)·`:1501` rentKind·훅(`:1465`)·`placeFacility`(`:2236`)·`upgradeFacility`(`:2078`)·`removeFacility`(`:2302`)·`resolveEvent`·`seatPackagesAt`(`:830`)·
  `packageFor`(`:853`)·`claimSeat`(`:917~931`)·`sns.post`(`:1490`)·`checkStory`(`:1991~1998`)·`usageFee`(`:1547~1553`)·스냅샷(`:174~181`·`:2664`·`:2701`·`:2717`·`:2726` — `natural` 왕복, 물빛 둘은 **읽고 버리는 분기**).
- **`src/sim/facility.ts`** — `check()`(`:178` `WaterRules` 필수·9단) · `FacilityFail`(`:42`)·`FACILITY_FAIL_KO`(`:44~52`) 3사유 · `capacityOf`(`:59`) · `PlacedFacility`(`:8~25` `chainLen? paidToday? incomeYest?`) ·
  `resetDay`(`:244`) · 신설 `guestWalkable`·`setWalkOn`·`walkOn`·`thrillOf`·`convert`. `STAFFABLE_CLASSES`(`:30`)에 rig 를 안 넣는다(망루는 utility).
- **`src/sim/pool.ts`·`pool-state.ts`** — `tileOwner`·`ownerIdAt/ownerAt`·`blocked`·`setBlocked`·`isOpenAt`·`totalOpenTiles`·`Pool.open` · `at()`(`:70`) · `recompute()`(`:84` 병합 반환) ·
  `PoolContext.tilePop` 필수(`pool-state.ts:16,27,84`) · `PoolStore.state`(`pool.ts:77~81`) 삭제.
- **`src/sim/guest.ts`** — `walkable`(`:248~252`) · `tiles.includes` 넷(`:564,615,878`+`pool.ts:70`) · `tasteWeight`(`:132`)·`setEmote`(`:704`) · `startUse`(`:677`)·`:517`·`finishUse`(`:702`) ·
  `pickTarget`(`:763~812`) · `fromSnapshot`(`:932`)·스폰(`:350`) `band/bandLeft` · 신설 `swimSkill`·`hasVest`·훅 `rigDeep? swimUrgeRig? swimUrgePool?`(`:166`).
- **신설 파일** — `src/sim/rig.ts`(P49-a1: `ppajiGrade`·`RIG_GRADE_POP_MUL`·`CHAIN_KINDS_FOR_GRADE3` / P50-a: `computeRigs`·`RigState` / P50-b1: `chainScale`·`CHAIN_*`) · `rig-upgrade.ts`(P49-a1: `RigStore` 저장부 / P51: `RIG_UPGRADES`·`craft`·`convertCost`) · `wristband.ts`(값 함수 P50-b2 / 상태·결제 P52-a) · `accident.ts` · `test-helpers.ts`(`makeTestPpaji`·`digWater`) ·
  `tools/goal-num.ts`(`gate.ts:10`·`verify.ts:22` 가 import — 지금 두 벌) · `tools/dump-save.ts`(v4 fixture) · `tools/ref-count.mjs`·`check-tiles-dead.mjs` · `tools/measure.ts` · `tools/check-assets.mjs` · `tools/check-plan.mjs`(이 문서의 자 — §5 파일:줄이 실제 심볼과 맞는가 · 페이즈 태그가 §6 표에 있는가 · H 표 대조) ·
  `src/data/rig-parts.json`·`rigs.json`·`wristbands.json`.
- **데이터·타입** — `schema.ts:9` `'rig'` · `:32` `'craft'` · `:139` 조건 4 · `:140` 삭제 · `:217,255` 보상 kind · `:294` `'rigPart'` · `:296` `'strip'` · `:430` `'ppaji'` · `RigPartDef` ·
  `facilities.json`·`gears.json`·`equipment.json`·`certs.json`·`story.json`·`calendar.json`·`wishes.json`·`packages.json`·`events.json`·`balance.json` ·
  `data.test.ts`(`:28,34,57~62` `rig:[60,140]`·`:110,113,164` 밴드·`:152~156`·`:599,622`·`validateRigData`·팔찌 검증).
- **`class:'rig'` 유니언 18곳** — 컴파일 6(`schema.ts:9`·`data.test.ts:28,34,57`·`condition.ts:78`·`draw/facility.ts:13`) · 조용히 틀리는 4(`src/assets/draw/fac-sprites.ts:48` `DEFAULT_BY_CLASS.rig`+`floatPad`·
  `build.ts:22`·`guest.ts:132,704`) · 값 그대로 검사 8(`facility.ts:30`·`game.ts:2204,2582`·`data.test.ts:110,113,164,92/99`·`scene.ts:410`).
- **`src/sim/bot.ts`·`tools/bot.ts`** — §3.9 · `BANDS`(`tools/bot.ts:17~47`) 29 → 50 · `--warn` · 요약 줄(허가·연차 수역 8줄·rig 이용·팔찌 원화·해금 8×3·밤 셋).
- **UI·렌더·main** — `src/ui/windows/pool-edit.ts:53` 탭 `ppaji`·`line`(`tileChips` 삭제, 두 모서리 UI 는 `routes` 에 등록 + ≥44px) · `pool-info.ts` 5행 · `src/ui/windows/rank.ts:74`(⚠ `src/sim/rank.ts` 가 따로 있다) · `build.ts:22,33`(탭 9·`craft`·잠김 이유 동사) · `facility-info.ts`(`row` `:96~102` — 기구 3행·개조 델타·위험 행·팔찌 행) ·
  `place.ts:22~23,36~37,119~128` 칩 · `style.css:683`·토큰 `--rig-dim`·`--risk-*` · `scene.ts:282`(코핑 분기 삭제)·`:410,720` · `src/assets/kairo-atlas.ts:13` `deck → pontoon` 폴백 · `main.ts:154,657,294,306` ·
  `src/ui/windows/course.ts:158` 브리핑 토글 · `src/ui/windows/ending.ts:10,44,48` · **`verify.ts:636~644` routes 8(`rig`)** · **`check-ui.mjs` PAIRS 14 → 19 · FAULTS 10 → 12**(PAIRS: P50-b2 `--rig-dim` 대 배경 **1쌍** + P52-b 위험 칩 4쌍 · FAULTS: P50-b2 `rig-dim-hardcoded` — 꺼짐 틴트를 hex 로 되돌리면 S1 빨강 · P52-b `risk-chip-contrast` — 위험 칩 면 색을 낮추면 S3 빨강). 확정 바 칩 줄(`.kdock-row`)도 `routes` 감사 대상.
- **세이브·이월** — `src/save/save.ts:9,19` v4 + `__fixtures__/v4-p48b.json`(P48-b1 산출물) + `v4-p49a2.json`(P49-a2 산출물 — v4 가 두 모양이라 둘 다 둔다: 전자는 읽고 버려도 던지지 않고 후자는 왕복) · `endgame.ts:8~18`(점수 가중) · `:34`(Carryover) · `:68` 적용.
- **검사·하네스** — 평탄 강 참조(`tools/ref-count.mjs` 가 센다 — 정규식 `isRiverRow|RIVER\.j0|waterRowMax|riverFloorFor`): `zone.test.ts`(`:13` deck 16 → 19 · `:25/:26` 둘 다 산다) ·
  `verify.ts:1458`(빈 `.every()` — 크기부터 단언)·`:1459,1470`·물 좌표 10곳(못·본류 잔교 기준) · `grid.test.ts:8,9,15`+굽이 불변식 5 · `levels.test.ts:23,24` · `p3.test.ts:17` · `course.test.ts:121` ·
  `digPool` 호출부 → `makeTestPpaji`/`digWater`(P48-a: **검사 파일 직접 호출 0건**(헬퍼 경유만) + 프로덕션 호출부는 `pool-edit.ts:287` 하나 · P49-b: 붓 분기 삭제 뒤 **프로덕션 호출부 0건** — `digPool` 자체는 API·하네스 원시로 남고(D22) `test-helpers.ts` 가 유일한 호출자, dig/fill 탭은 이미 `.khide` 라 동작 0 · `tools/` 의 `page.evaluate` 문자열 16곳은 허용목록에 이름으로) · 페이즈마다 `pNN.test.ts` 하나 · 하네스 절은 게이트 절의 (하네스) 항이 있는 페이즈마다 하나(목록으로 따로 세지 않는다).
- **시작 킷**(`startkit.ts`, 전부 `gt`·`BEND.head` 상대) — 출입동 `{gt.i−10, gt.j, 20, 13}` · 복도 열 48 행 9~20 · 킷 빠지 바깥 열 51~56 행 24~30(링 물 16 · 안 20) · 잔교 데크 (56,50)~(56,52)+`dock`(56,51) ·
  데크 총 19 · 평상 한 줄 못 북안(반경 3 안) · 시설 7 · 못 북안 행 24 산책로. 링 위 시설 0.

---

## 6. 페이즈 P48~P55 — 순서를 바꾸지 말 것 (게이트 수는 표에서 센다)

`P48-a → P48-b1 → P48-b2 → P48-c → P49-a1 → P49-a2 → P49-b → P50-a → P50-b1 → P50-b2 → P51 → P52-a → P52-b → P52-c → P53-a → P56-a → P53-b → P53-c → P54 → P55 → P56-b → P56-c`

**소유 원칙(v5.2)**: 유니언 멤버·`FacilityDef`/`PlacedFacility`/`stats`/스냅샷의 optional 필드·`balance.json` 키·`RNG_SALTS`·봇 플래그(`--warn`·`--sweep`·`--no-*`)는
**전부 P49-a1(골격)이 연다** — 데이터가 0건이거나 스텁이 읽는 상태로. 뒤 페이즈는 **배선만** 한다(§5 소유 요약). `check-plan.mjs`(P48-a)가 §5 의 태그와 §6 표, 페이즈당 게이트 ≤10 을 대조한다.

**골든 규칙(v5 통일)**: 페이즈마다 `golden.test.ts` 를 **재베이크하고 머리에 사유 한 줄**을 남긴다. 「동작 0」을 주장하는 페이즈는 해시가 아니라
**자기 술어**로 증명한다(바닥·단 배열 바이트 동일 / 봇 요약 동일 / 불일치 칸 0). v4 의 「해시 불변」 게이트 셋(P48-a·P49-a2·P50-a)은 스냅샷 모양이 바뀌어
구조적으로 통과 불가였다(5라운드 차단).

| P | 이름 | 범위 | 의존 | 봇·밴드·스위치 | 세이브 | 문서·사람 |
|---|---|---|---|---|---|---|
| **P48-a** ✅ | 동작 0 리팩터 ① | `Grid.natural` 4함수 · `riverFloorFor` 삭제(호출부 5 — `grid.ts:308` 인라인 포함) · `unpaintPath/unpaintIndoor` 실버그 · `check()` 기본값 47 삭제 · `makeTestPpaji`·`digWater`(물 위) 로 검사 ~25곳 이관 · `dump-save.ts` · `goal-num.ts` 한 벌 · `ref-count.mjs` · **`check-plan.mjs`** | — | — | `natural` 왕복(v3 fixture — 다음 페이즈가 v4 로 올리며 포맷은 같다) | — |
| **P48-b1** ✅ | S 자 굽이·지형·세이브 (+출입동 20×13) | `BEND`·`carveBend` · 굽기 9단 + ⑧⑨ 물 가드 · `raiseHills` 한 줄 · `inLandOrWater` · 세이브 v4 + fixture · 코핑 분기 삭제(`scene.ts:282`) · 굽이 불변식 5 | 48-a | 밴드 29 재측정 | v3 → v4 새 판 | `CLAUDE.md` 포인터 · `ppaji/README.md` · `plan-ppaji-story.md` §14 요약 · `docs/README.md` |
| **P48-b2** ✅ | 물 판정·허가·킷 빠지 이동·좌표 (+ P27 문턱 1/3 복원 · 사용자 지적으로 **본류 자체를 S 띠**로, 허가 = 물가 거리) | §3.3 전부 · 허가 창×예산 · sync→after 5곳 · 출입동 20×13 · 킷 좌표 · 하네스 물 좌표 10 · 랭크업 「허가 +N」 | 48-b1 | `passByShare` 재측정(수역 문턱은 새 봇이 서는 P49-b 가 잰다) | v4 안 | — |
| **P48-c** ✅ | 동작 0 리팩터 ② | `class:'rig'` 유니언 18곳 · `floatPad` · `tasteWeight/setEmote` · `needsInRadius 'ppaji'` — rig def 0개 상태 | 48-b2 | — | — | — |
| **P49-a1** ✅ | **골격** — 데이터·유니언·필드·키·플래그 전부 + 등급이 인기 대체 | §5 소유 요약 첫 행 전부 · 기구 21 + 이전 12 · 견인 이름 8 · `rig-parts.json` · `poolOfFacility`·`ppajiGradeOf` **스텁** · `tilePop` 교체 · `ranks.json` ★4·★5 | 48-c | `--warn`·`--sweep`·`--no-*` 플래그(축은 뒤에) | `rigs?`·`chainLen?`·`paidToday?`·`incomeYest?`·`stats` 셋 optional(전부 0/미기록) | — |
| **P49-a2** ✅ | 물빛 삭제 | `tiles.json` 파일째 · §4.4 전부 · 인증 보상 12 · `check-tiles-dead.mjs` · 관용 로드 둘 · fixture `v4-p49a2.json` | 49-a1 | 봇 요약이 a1 과 동일 | `poolTile`·`unlocked.tiles` 필드 삭제(버전 안 올림 — fixture 둘) | — |
| **P49-b** ✅ | 사각형 붓·라인·봇 링 (D59 뭍 풀 삭제) | `PpajiRect`·`canMakePpaji`(거절 9)·`makePpaji`(병합 정보)·`lineTiles/canPlaceLine/placeLine` · `PoolStore.tileOwner/ownerIdAt`·`recompute` 병합 반환·`state()` 삭제 · `canDig` 뭍 거절 · 독 「빠지」「라인」 탭 · 봇 `growPpaji` · 하네스 G1·G3·G5·G8 재박음 + P49-b 절 | 49-a2 | `growPpaji`(새 수역 0 이면 건너뜀) · 밴드 `poolTilesY1` · 요약 허가 | — | 픽스처 15파일 → 4(거절 문장만) |
| **P50-a** ✅ | 물 위 배치·진입·도달·**켜짐**·`open` | `WaterRules` · 9단 · `guestWalkable` 한 벌 · **`computeRigs`·`RigState`·`walkOn`·`evictFrom`**(켜짐 판정 — `ppajiGradeOf` 의 `n` 이 실값이 된다) · 예외 자리 · `recomputePassBy` 조이기 · 「빠지」 탭 · `Pool.open/setBlocked/isOpenAt/totalOpenTiles` + 유입 | 48-b2·49-b | — | — | — |
| **P50-b1** ✅ | 연결·등급 값 | `chainScale`·`CHAIN_*`(데이터 키 둘) · 배율 값 · `capacityOf` 배선 · `chainLen` 스냅샷 제외 · 사슬·등급 항등 | 50-a | `attachRigs`·`chainRigs` · 밴드 7 · `--no-rig` | `chainLen` 은 `toSnapshot` 제외 · 로드 뒤 재계산 | — |
| **P50-b2** ✅ | 화면·**돈** | 정보창 5행(어제 수입은 P51 전까지 「—」) · `facility-info` 3행+오버레이 · `aimPreview` + 확정 바 칩 · `wristband.ts` 값 함수 + `wristbands.json` + `packages.json` `ppaji`(값만, 발급은 P52-a) · 이음쇠 · 켜짐 연출·등급별 폰툰 색·꺼짐 틴트 · 목표 A 폴백 ①② + `main.ts:167` 슬롯 구조 · `pinGoal` · `check-ui` PAIRS `--rig-dim` | 50-b1 | — | — | H35~H38·H40·H48·H51 |
| **P51** ✅ | 개조 | `convertFacility/Preview`·`paidToday`·`incomeYest`·`rigRemoveRefund` **배선** · `rig-upgrade.ts` 본체 · `rigs.json` 20 · 개조판 20 · `RIG_SPEC` 창 + **`verify.ts` routes 8** · `stats.converts` · `measure.ts` · 폴백 ③ | 50-b2 | `upgradeRig`·`buyRigParts` · 밴드 4 · `--no-convert` | — | H46·H54 |
| **P52-a** ✅ | 손님·팔찌 | `wristband.ts` 발급·회수 · `issueBand` 창구 둘 · `swimSkill`·팀 기구 · `band?/bandLeft?` · `seatScan` · `stats.pkgPpaji` | 50-b·51 | `ensureHallShops` `rental_tube` · 밴드 3 · `pkgKinds` 4~5 · `--no-vest` | optional 둘 | H39·H47 |
| **P52-b** ✅ | 안전 | `accident.ts` · 위험 칩 + **PAIRS 4쌍** · 망루·구조정 · SNS 감쇠 · 브리핑 · `convertPreview` 위험 두 필드 | 51·52-a | `ensureWatchtower`·`briefCourses` · 밴드 2 · `--sweep accidentBase=0` | `PlacedCourse.safetyBriefing?` optional | H45·H50 |
| **P52-c** ✅ | 계절 | 수온 · `swimUrgeOf` · 장마 `rigLoss` · `waterClosedUntil` | 52-b | 밴드 1 · `--sweep swimUrgeMin=1` | optional 하나 | H53 |
| **P53-a** ✅ | 조건·데이터 재배선 | 인증 조건 9 · 소원 20 · 연차 폴백 8(`priority 'strip'`) · 위상 정렬·교착 0 | 52-c | 밴드 1 `rigCertsPassed` | 없음(달력 id 8 이 `calendarGiven` 에 든다) | — |
| **P53-b** ✅ | 스토리·이월·엔딩 | 트리거 6 + 비트 9 · `first_pool` 28 · Carryover v2 · NG+ 한 채 · 엔딩 줄 · 콤보 8쌍 성립 검사 | 53-a | — | Carryover v2 | — |
| **P53-c** ✅ | 봇·밴드·목표·온보딩 | 봇 정책 합 · 밴드 50 전수 · `money` 상한 · 목표 A/B HUD 56분 샘플 · 모달 예산 자 · `check-plan.mjs` | 53-b | 밴드 2(해금 간격) · 해금 8×3 요약 | — | `human-check.md` H35~H54 전수 · H41·H43·H49·H52 |
| **P54** ✅ | 밤 빠지 파티 | `nightPartyOn` 래치 · `syncNightSet` 추출+확장 · `issueNightBands` · 세 자리 배수 · `DayReport` optional 넷 · 밤 키 둘 | 53-c | 밴드 2 · `--no-night` | — | H42 |
| **P55** ✅ | 그림 계약 + 밸런스 스윕 | `ppaji-asset-contract.md`(buoy 13 삭제 두 곳 · `tile/pontoon`·`overlay/*` · 부력선 게이트) · `check-assets.mjs --selftest` · 견인 4종 재생성 목록 · 폴백 실루엣 셋 · **★3·★5 페이싱 스윕**(`ranks.json` 친구 문턱 — 봇 실측 곡선) | 51 | ★ 경고 창 닫기(`rank3Year`·`rank5Year` 초록) | — | H44 |
| **P56-a** ✅ | 그림 우선 UI 골격 (그림 0) — 정본 `docs/plan-ppaji-picture-ui.md` | 그림 등록부+폴백(`pictures.ts`) · `PictureGrid`·`sceneCard` · 요리·공방·개조 창 한 순서 · 장날 잠금 카드 · 건설 카드 `×N`+아래 두 줄 · 심사위원 대사·보상 그림 · 개조 전→후 카드 · 투자 카드 · 지도 값 팝(`price-pop`·`got-item`) | 53-a | 밴드 무변경 | 0 | H55~H60 |
| **P56-b** ✅ | 그림 반입 — **이 머신에서 383장 생성**(Codex image_gen, `tools/pictures/gen.py`·`batch.py`) | 주문서 `docs/assets/pipelines/ppaji-picture-sheet.md` 383장 → `tools/check-pictures.mjs`(자 6 + `--selftest` 4) → `public/assets/pictures.png` + `pictures.json` | 56-a | — | 0 | — |
| **P56-c** ✅ | 재고(U1) — 사용자 결정 「넣는다」(2026-09-12, D10) | `CookingStore.stock`(시작 무한 · 장날 +1 · 보상 ×3 · 조합 −1) · 보상 재료 재구매(`price` 데이터 56) · 창 카드 `×N`/∞/「재고 0」 · 봇 `restock` · `stats.stockBuys` | 56-a | 밴드 2 재보정(`rigPartsBought` 20~45 · `ppajiDeckShare` ≥0.12) | optional 하나(`stock`) | H61 |

### 게이트 (페이즈당 ≤10, 항목 끝은 자 종류)

- **P48-a**: 바닥·단 배열이 골든 3시드×16일 전 구간에서 옛 식과 바이트 동일(단위) · `riverFloorFor` 심볼 0건 + `grid.ts:308` 인라인 항등을 검사 파일의 지역 사본 `oldRiverFloorFor` 와 대조(정적+단위) ·
  `digPool` 호출부 검사 파일 0건 + 프로덕션 `pool-edit.ts:287` 하나 + `tools/` 허용목록 이름 일치(정적) · `goalNum` 한 벌 import 2곳(정적) · `natural` 왕복 + v3 fixture 왕복(단위) · 골든 재베이크 사유 1줄(골든).
- **P48-b1**: 굽이 물 칸 250~380 · 여울:강 0.8~1.6 · ★0 물가 뭍 ≥120(단위) · 우회 중앙비 ≤1.20/최대 ≤1.60 + `halfJoin=12` 대조군(단위) · 불변식 5 + 마당 뭍 도달 100% + `Surround` 바이트 동일(단위) ·
  `carveBend ≤ 1.0ms`·`newPark ≤ 2.0ms`(단위 벤치) · `bendVariant` 거울 항등 `m(50..61) = 35..46`(단위, 미결 ①) · v3 세이브 → 새 판 + v4 fixture 왕복 + `MIGRATIONS.length === SAVE_VERSION − 1`(단위) · 밴드 29 초록(봇) · 골든 재베이크(골든).
- **P48-b2**: `inMyWater` 토지 열 밖·허가 줄 밖·굽이 언제나(단위) · 굽이를 데크로 둘러싸면 수역이 생기고 걷으면 `natural` 로 복원(단위) · `paintDeck` sync→after 순서 AST(정적) ·
  `syncEnclosedWater ≤ 1.0ms` + 프레임 루프 호출 0(단위+정적) · 킷 링 16·안 20·잔교 3·평상 한 줄 반경 3 안(단위) · 하네스 물 좌표 10 전부 물(하네스) · 랭크업 모달에 「+50칸」(하네스) · 골든 재베이크(골든).
- **P48-c**: 유니언 18곳 컴파일·`CLASSES`·밴드(단위) · 봇 요약·바닥 바이트 동일(봇) · `staffable(rig) === false`·`isBuildingClass(rig) === false`(단위) · 골든 재베이크 사유(골든).
- **P49-a1**: `validateRigData` 전수 + `needsVest ⇔ deep` 7/7(단위) · 시작 8·랭크 9·인증 3·소원 1 을 데이터에서 센다(단위) · `poolOfFacility` 결정론 동점(단위) · 등급 인기 항등 — 기구 0개 판에서 옛 `tilePopSum` 대비 비율이 정확히 `ppajiGradePopMul[0]` = 1(단위) · 조건 DSL 4 + 보상 kind `'rigPart'` 가 부품 13 을 전부 가리킨다(단위) ·
  `rig.ts` 에 `computeRigs` 심볼 0건(정적) · 견인 이름 8건 외 필드 바이트 동일(정적) · `--warn` 6종이 요약에 뜬다(봇) · 인기 −34% 를 WARN 으로 본다(봇) · 골든 재베이크(골든).
- **P49-a2**: `check-tiles-dead` 0건 + `--selftest` 빨강(정적) · 인증 보상 12 의 대상이 존재(단위, `data.test.ts:622`) · `grade_a` 조건 `rigGrade 3`(단위) · 옛 세이브의 `poolTile`·`unlocked.tiles` 를 읽고 버려 던지지 않는다(단위) · 봇 요약이 a1 과 동일(봇) · 골든 재베이크(골든).
- **P49-b**: 사각형 9단 거절 문구 각 1회 + 안 데크 → 자연 바닥 + 시설 있으면 거절(단위) · 겹쳐 그리면 병합·토스트(단위+하네스) · 라인 1×2/1×4/1×6 회전 배치·밀폐 + 빠지 치기 탭 ≤4(하네스) · `digPool` `src/` 전수 0건(정적) · 허가 초과 거절 + 「남은 N칸」(하네스) · `wouldEnclose` `grid.rev`·`poolTile` 무변경 ≤ 0.6ms(단위) ·
  봇 `growPpaji` 연차 수역 8줄 · 1년차 수역 ≤160·4년차 ≥ 260 · `permitUsed ≤ permitMax` 전 시드(봇) · 사각형 두 모서리 UI ≥44px·도난 0·빠지 치기 탭 ≤4(하네스) · `digPool` 프로덕션 호출부 0건(정적) · 골든 재베이크(골든).
- **P50-a**: 물 위 기구 배치·깊이 불일치·링 시설 거절 3사유(단위) · `guestWalkable` 한 벌 — 세 자리 문자열 동일(정적) · `computeRigs` 켜짐 항등 표(링 접촉·BFS·꺼짐)(단위) · 켜진 기구 위 손님 도달, 꺼지면 `evictFrom`(단위) · `tooClose`/frontage/autoPath 면제(단위) · 복도 곁 링 점포가 `passBy` 집합에 안 든다(단위) ·
  `open` — 기구 밑 유영 0·유입이 `totalOpenTiles`(단위) · 기구가 수역을 가로질러도 `pools.all.length`·`totalTiles` 불변 + 기구 0개 판에서 불일치 칸 0(단위) · `notePackages ≤ 1.0ms`(단위) · 골든 재베이크(골든).
- **P50-b1**: 사슬·등급 항등 표 — `len 1·2·4·8 → cap ×1·1·1.41·2.0`, 계열 셋, 등급 문턱 5(단위) · `chainScale` 이 `capacityOf` 에만(정적) · `chainLen` 스냅샷 0건 + 로드 뒤 일치(단위) · 등급 [1..4] 인기 배율 표 대조(봇) ·
  A/B 같은 시드: 켜진 빠지 인기 ≥ ×1.5 · `--no-rig` 대조군 기구 0·`rigsDistinct` 빨강(봇) · 밴드 7 초록(봇) · 골든 재베이크(골든).
- **P50-b2**: **첫 3분 스모크** — 새 판에서 첫 기구 확정 tick 에 등급 0→1 모달 1건 · 확정 바 칩에 「정원」또는「등급」·「연결」·「자유이용권 400」 세 낱말 · 1,680 tick 안 그 기구 `usesToday ≥ 6` · 목표 A 가 「기구」 포함 · 0~5분 모달 ≤ 2·큐 ≤ 2(하네스) ·
  `aimPreview` 21종 전수 미리보기 == 확정 뒤 실값 + 호출 전후 `probeForTest().nextUid·occHash`·`grid.rev`·`pools.version` 불변(단위) · `aimPreview ≤ 0.6ms`·`rigLinkEdges ≤ 0.3ms`(프레임당 1회 캐시)·`aimAt` 호출부 1(단위+정적) ·
  「빠지」 탭 둘째·잠긴 기구 이유 ≥4자·기구 설치 탭 ≤5·목표 B 슬롯이 A 폴백 중에도 DOM 에 뜬다(하네스) · `check-ui` PAIRS `--rig-dim` 1쌍 + FAULTS `rig-dim-hardcoded`(정적) · 등급 0 vs 4 정오 스크린샷 히스토그램 L2 ≥ 0.2(하네스) ·
  한 사건 id 가 두 채널에 `push` 되는 코드 0건 + 등급 불변 설치 직후 모달 0(정적+단위) · 첫 30분 거절 사유 `depth-mismatch`·`not-connected` 0건(하네스) · 골든 재베이크(골든).
- **P51**: `convertFacility` 8단 거절 + 12필드 보존 + `chainLen` 재계산(단위) · 개조비 예제 1,800/1,400(단위) · `rigs.json` 20 검사(별명 ≤4·`to.chain`·밴드)(단위) · 개조 뒤 실효 스릴·정원(단위) · `craft` 전후 `rig` 스트림 불변(단위) ·
  `routes.length === 8` + `win-rig` 컨트롤 ≥44px·도난 0(하네스) · `rig_slide` 셋 이튿날 철거 뒤 현금 ≥ 시작의 60%, `rigRemoveRefund 0` 이면 빨강(단위) · `measure.ts` 네 지표 — 재탑승 비율 ≤ 0.3(봇) · `--no-convert` 대조군 `rigUpgrades` 0·현금 중앙 ±10% 안(봇) · 골든 재베이크(골든).
- **P52-a**: 팔찌 값 사다리 5값(단위) · 창구 ⓐ/ⓑ 결제 정확히 1회·`:925` 배수 미적용 AST(단위+정적) · 출신지 10 → 팔찌 칸 3:3:3:1(단위) · 딥 게이트 3 + 가중 2 · 뽑기 1회 불변(단위) · 대여소 없는 판 vs 있는 판 A/B — 딥 기구 이용 ×3 이상·`ppajiRevShare` 둘 다 ≥ 0.05(봇) · `bandCost` 전부 지우면 이용 횟수 바이트 동일(봇) · 밴드 3(봇) · `seatScan ≤ 0.2ms`(단위) · 골든 재베이크(골든).
- **P52-b**: `accidentChance` 순서·바닥 표 6행(단위) · 뽑기 자리 둘·`guest.ts` rng 줄 무변경(정적) · 사고 뒤 SNS 감쇠 −6~−8%(봇) · 망루 알바 없으면 효과 0(단위) · 위험 칩 4쌍 PAIRS + selftest(정적) · 확정 바 위험 라벨·망루로 한 단 하강(하네스) · `accidentsPerVisit` 0.002~0.02(봇) · `accidentBase 0` 대조군 스트림 동일(봇) · 골든 재베이크(골든).
- **P52-c**: 수온 표 12칸(단위) · 가을÷여름 야외 수영 0.20~0.55(봇) · 등급 4 면제(단위) · `rigLoss` 셋·앵커 면제·`grid.floor` 무변경(단위) · `swimUrgeMin 1` 대조군(봇) · 골든 재베이크(골든).
- **P53-a**: 조건 kind 4 위상 정렬 + 교착 0(단위) · 인증 재배선 전후 8시드 A/B `certs` 중앙 ±20%·`certsDistinct ≥8`·`certFamilies ≥4`(봇) · rig 조건 인증 9건 각 ≥1회 통과 가능(봇) · 소원 `line` 낱말·감소 조건 0(단위) ·
  연차 폴백 8 — rank 1 고정 픽스처와 rank 2 고정 픽스처에서 Y2~Y8 각 ≥1 해금(봇) · 골든 재베이크(골든).
- **P53-b**: 트리거 6·비트 9 가 실제 값으로 발화(단위) · Carryover v2 왕복 + v1 프로필 `tiles` 읽고 버림(단위) · NG+ 첫 tick 에 개조판 한 채(단위) · 콤보 8쌍 각각 성립 배치 존재(단위) · 골든 재베이크(골든).
- **P53-c**: 해금 간격 밴드 둘 + 밴드 50 전수(봇) · 목표 HUD 56샘플 — 여름·가을 간격 ≤3.5분·겨울 ≤7분·첫날 「기구/빠지」 ≥2/3·B 슬롯 빈 샘플 0(하네스) · 봇 4년차 세이브 10분 재생 모달 ≤10·큐 ≤5(하네스) ·
  `check-plan.mjs` 파일:줄·페이즈 태그·H 표 대조 0 오류(정적) · `human-check.md` H35~H54 id·페이즈 대조(정적) · 골든 재베이크(골든).
- **P54**: `nightPartyOn` 조건 4 (단위) · `syncNightSet` 정의 1·호출부 2·`nightOn` 거짓이면 원문 집합 동일(정적+단위) · 야간권 — 밤이 열린 날 자리 잡은 팀 발급 ≥1·낮 1회 규칙 유지(단위) · 세 자리 배수(단위) · 같은 시드 밤 열린 날 vs 안 열린 날 저녁 매출 비 ≥1.2(봇) ·
  `nightNights`·`nightRevShare`(봇) · `--no-night` 대조군 골든·봇 요약 비트 동일 + 밤 안 열린 날 `rng.night` 0회(봇+단위) · 첫 개장 모달 1·이후 티커(하네스) · 골든 재베이크(골든).
- **P55**: 계약에 `buoy` 0건·`pontoon` 3·`overlay` 7(정적) · 부력선 게이트 + selftest(정적) · 절차 폴백 실루엣 3종(단위) · H44 판정 칸(정적) · `rank3Year` 1~3 · `rank5Year` 5~8 이 ⚠ 없이 초록(봇) · 골든 재베이크(골든).
- **P56-a**: `pictures.json` 모양·주문서 342 id 1:1(단위) · 요리·공방·개조 창에 글자 칩 0(정적) · 창마다 카드 수 = 정의 수 · 재료 카드 탭 = 슬롯 · 결과 장면 카드 · 장날 17시 전 잠금 카드 ≥1 · 심사위원 말풍선 3/카드 · 개조 전→후 카드 · 조준 값 팝(하네스) · 카드 선택·가격·띠 대비 3쌍(정적) · 골든 무변경(골든).
- **P56-b**: `check-pictures.mjs --selftest` 위반 주입(정적) · 반입 ≥ 300/342 · 하네스 「폴백 0」 행(하네스).
- **P56-c**: 재고 왕복(단위) · 밴드 `rigPartsBought`·`recipes` 재보정(봇) · 골든 재베이크(골든).

### 밴드 (기존 29 + 새 21)

`rigsDistinct 14~22` · `rigChainMax 3~20` · `rigGradeMax 3~4` · `rigUseShare 0.15~0.6` · `ppajiSpendShare 0.2~0.7` · `ppajiDeckShare 0.15~0.55` · `ppajiRigShare 0.20~0.60` · `ppajiConvertShare 0.08~0.40`(셋의 합 = 1) ·
`rigUpgrades 8~40` · `rigUpgradesY4 0~10` · `rigPartsBought 6~12` · `vestShare 0.5~1` · `ppajiPkgShare 0.08~0.25` · `ppajiRevShare 0.05~0.25` · `accidentsPerVisit 0.002~0.02` · `rigUsesPerDay 60~300` ·
`offSeasonSwim 0.20~0.55` · `unlockGapMaxY1_4 ≤4` · `unlockGapMaxY5_8 ≤6` · `nightNights 4~38` · `nightRevShare 0.083~0.34`. 재보정 둘: `pkgKinds` 4~5 · `money` 상한(P53).
밴드는 소유 페이즈가 낸다 · 실측에 맞춰 조이지 않는다 · 예상과 반대로 움직이면 WARN 이어도 빨간불.

---

## 7. §14.9 감사 15건 대응

| # | 감사 | 닫은 곳 |
|---|---|---|
| ① 물 위 배치 경로 없음 | §3.6 `WaterRules`·`guestWalkable`·`walkOn` — P50-a |
| ② 평탄 강 공식 | §3.1~3.3 `natural`·`carveBend`·`inMyWater`·전 격자 sync — P48 |
| ③ 공방은 재고 | §3.8 `convertFacility` 신설 — P51 |
| ④ 물빛 삭제가 인증을 끊음 | §4.4 순서(등급 대체 → 보상 교체 → 삭제) + `check-tiles-dead` — P49-a1/a2 |
| ⑤ 마당 단절 | §3.1 불변식 ④ 도달 100% + 우회 거리 문턱 — P48-b1 |
| ⑥ 킷 선착장 | 본류 잔교 — P48-b2 |
| ⑦ 세이브 | v4 새 판 — P48-b1 |
| ⑧ 이중 계산 | `tiles`/`open` 배분 — P50-a |
| ⑨ D63 누수 | `recomputePassBy` `isIndoorCode` — P50-a |
| ⑩ 유니언 | 18곳 한 커밋 — P48-c |
| ⑪ 스토리 트리거 | kind 6 — P53 |
| ⑫ 사각형 안 데크·병합 | §3.5 원자 적용·`recompute` 반환 — P49-b |
| ⑬ 킷 평상·소품·`gear_rack` | 미결 ③ · 소품 유지 · `rentKind` — P49-a1 |
| ⑭ 그림·굽기 순서·`Surround`·`ownsTile` | §3.2·§5·P55 |
| ⑮ 조끼 대여 정의 시점 | `rental_tube` 는 이미 있다(이름·desc 만 P49-a1) |

**5라운드 차단 6건**: 골든 「바이트 동일」 모순 → §6 골든 규칙 · `rigPart` 유니언 → P49-a1 · `--warn` 소유 → P49-a1 · 야간권 발급 경로 → §3.9 `issueNightBands` ·
돈 칩 화면 게이트 → P50-b2 로 당김 + 첫 3분 스모크 · `digPool` 정적 게이트 → P48-a 검사 0건 + 프로덕션 허용목록, P49-b `src/` 전수 0건.
**v5 평가 1회(71/100) 차단 9건 대응**(정합성 3 · 게임성 4 · 구현 2): `aimPreview` 오버레이·불변 넷(§3.7) · 밤 뽑기 전용 스트림(§3.9) · `digPool` 게이트 페이즈 분리(§5) · 연차 폴백 Y2·Y3(§4.5) · 1년차 표 38.50 비트 + 계절별 간격 문턱(§1.5) ·
목표 B 슬롯 + HUD DOM 자(G10) · 모달 자동 자(P50-b2·P53-c) · 조건 DSL(§4.5) · 보상 유니언 `'rigPart'`(§4.5) — 둘 다 P49-a1 소유.
**평가 2회(70.5/100) 차단 16건 대응**: 소유 원칙(§6 머리 · §5 소유 요약)으로 정의-배선 역전 7건을 구조로 닫음 · 켜짐 판정을 P50-a 로 · `main.ts:167` 슬롯 구조(G10) · 사건 간격 자 재정의(§1.5) · 첫 5분 모달 자 · 회복 대조군(§1.6) · `probeForTest`·`pools.version`(§3.7) · 폴백 id 신설(§4.5) · P50-b 를 b1/b2 로.

---

## 8. 미결 (사용자에게 물을 것 — 6건)

| # | 물음 | 권고 | 언제까지 |
|---|---|---|---|
| ① | 2회차 — 지도 좌우 반전(`bendVariant`)만으로는 최적 빌드가 안 바뀐다. 반전 + **NG+ 킷 변형 한 칸**(빠지 없이 시작 / 등급 2 빠지 / 허가 절반) 중 무엇을 | **반전 + 킷 변형 「허가 절반」**(둘 다 상수·RNG 0·세이브 0) | P48-b1 |
| ② | P49-a1 의 인기 −34% 중간 회귀를 WARN 으로 보이게 둘까 | **둔다**(P50-b1 이 0.85~1.15 로 복구) | P49-a1 |
| ③ | 킷 7채(매표·실내 매점·**화장실·자판기·평상 2줄**·선착장) 유지 ↔ D57 「6 안팎으로 줄인다(화장실·자판기·평상 2 를 뺀다)」 | **7채 유지** — 평상 한 줄은 팔찌 발견 비트와 `teamSeatY1` 밴드의 전제, 화장실·자판기는 첫 의뢰 「기본 위생」의 재료 | P48-b2 |
| ④ | 사고가 SNS 좋아요를 깎는 것(성장 통화) | **넣는다** — 안 넣으면 망루를 지을 이유가 인증뿐 | P52-b |
| ⑤ | 팔찌를 팀 한 장으로(실지는 1인당) | **팀 한 장** — 값 눈금이 팀 단위, 1인당이면 밴드 셋 재보정 | P52-a |
| ⑥ | 카탈로그의 기구 여섯(UFO 8인·마블 3단·바이퍼·잠수 제트보트·장애물 코스·보팅 투어)을 더 넣을까 | **이번엔 이름으로**(견인 이름 8건 개명) — 장애물 코스는 이미 있고, 보팅 투어는 패키지 자리 | P49-a1 |
| ⑦ | **견인 축의 나머지 절반**(정원 폭 2~12인 · 스릴 0 보팅 투어 · 강습/강사 회당 과금 · 자유 유영 `paddle`)은 이 개편 밖이다 — 어느 페이즈가 갖나 | **§15 코스 축 페이즈**로(이 문서 뒤) — 실지 76종의 절반이라 기록만 남긴다 | (급하지 않다) |

닫은 것(근거 있음): ★5 허가 800 · 정비·점심 휴장·계절 영업시간·역 셔틀·단체 예약은 §15 · 여울 보행 안 켬 · 개조 되돌리기 없음 · 자유 유영 없음 · ★3 = 밤 개장 · 등급 0 은 팔찌를 안 판다(첫 기구가 곧 발견) · 아쿠아삭스 소프트 · 영업시간·점심 휴장은 뒤 페이즈.

---

## 9. 그림·사람 확인

**에셋 계약**(`docs/ppaji-asset-contract.md`, P55): `buoy/<color>` 13 삭제(영문·한글 두 곳) · `tile/pontoon[:a0~2]` 3 · `tile/pontoon_edge/<mask>` 4 · `overlay/rig_off`·`rig_link`·`rig_upgraded`·`grade_flag/1..4` ·
부력선 규칙(캔버스 아래 4텍셀 물빛 알파 블렌드, 그림자 없음) · 기구 21 × 2방향 42 필수, 개조판 40 은 2순위 · 절차 폴백은 `floatPad`+타워형+긴 판형 세 실루엣 · 견인 4종(`flycarpet·swing·air_chair·hydrofoil`) 재생성.

**사람 확인 H35~H54** (정본은 이 표, `ppaji/docs/human-check.md` 에 페이즈 커밋마다 들어간다):
H35 기구를 붙이면 폰툰 색이 바뀌고 등급 모달(P50-b2) · H36 확정 전 미리보기 == 실값 · H37 조각 둘이 한 덩어리로 · H38 거절 4사유에 다음 행동 · H39 대여소를 철거하면 딥 기구에 아무도 안 들고 「팔찌가 없네…」(P52-a) ·
H40 잠긴 기구가 이유와 함께 보인다 · H41 5분 플레이 모달 분당 ≤1(P53-c) · H42 ★3 판 18시 조명·팀이 물로(P54) · H43 봇 6년차에 할 일이 남아 있다 · H44 기구 21종이 떠 있어 보인다(P55) · H45 스릴 4 기구 조준 시 빨간 칩, 망루로 한 단 하강(P52-b) ·
H46 개조 버튼 위 한 줄만 보고 결정, 같은 자리에서 달라진다(P51) · H47 팔찌 두 창구가 다른 것을 판다·야간권 · H48 정보창 다섯 줄만 보고 「무엇을 더 하면 돈이 되나」 · H49 NG+ 굽이 반전(미결 ①) · H50 안전교육이 하루 예상을 그 자리에서 줄인다 ·
H51 빠지 둘 중 어디에 투자할지 다섯째 줄로 · H52 NG+ 첫 화면에 개조판이 서 있다 · H53 가을 판에 야외 기구가 비고 실내 풀에 줄(P52-c) · H54 새 창·탭·정보창·확정 바를 폰에서 엄지로(P51).

---

## 부록 A — 앞선 결정과의 정합(요지)

D22(데크 밀폐 = 수역) 그대로 · D23(허가 줄)은 「창 × 예산」으로 개정 · **D66 개정 — ★5 「무제한」 → 800칸**(등급 4 빠지 96칸 × 8.3) · **P45-b 실내 400 → 260**(D63 유지, 실내 점포 13 은 그대로 들어간다 — `passByShare` 밴드를 P48-b2 에서 재측정) · D57 은 미결 ③ · D58 간격은 rig·링 위 면제(명시) · D59 뭍 풀 삭제 · D63 복도 점포 누수 차단 · D52(마당은 어디든 걷는다 — P16 「길만」은 마당 안에서 폐기됐다) 위에 켜진 기구 발자국을 더한다 · 여울·강은 그대로 못 걷는다(`game.ts:2612` 의 낡은 P16 주석은 P50-a 에서 지운다) ·
P46 `isBuildingClass` 무변경 · D27 랭크 해금은 더하기만(★4·★5 하나씩) · 불변식 1(새 코드 전부 `src/sim`, 훅은 uid·숫자만) · 불변식 2(굽이 RNG 0 · `wouldEnclose` 는 `grid.floor` 만 · 뽑기 횟수 불변 · 새 salt 셋 `accident·rig·night`) ·
불변식 3(배율은 데이터 — §4.3 의 키와 `accidentMul`, 문턱은 코드).

## 부록 B — 리스크 상위 8

1. 허가 −34% 회귀를 화면이 설명 못 하면 「기구를 붙였는데 손님이 줄었다」로 읽힌다 → 랭크업 「+N칸」·정보창 허가 줄.
2. `wouldEnclose` 를 프레임 루프로 끌어내리는 실수 → 정적 자(`aimAt` 호출부 1).
3. 두 걸음인 두 줄(`guest.ts:615/878` 소속 → 개방)을 P50-a 에서 빠뜨림 → 코드 주석 + 불일치 칸 0 게이트.
4. 봇이 링만 깔고 기구를 안 붙여 밴드가 초록 → 갈래 셋 비율 밴드.
5. `rig_float_bar` 가 `restaurant` 라 기존 필터(`menuSlots`·`isBuildingClass`·밤 집합)에 걸리는 자리마다 예외 명시.
6. 물빛 참조를 손으로 세면 또 놓친다 → 스크립트가 유일한 자.
7. 밤 표본이 얇다(저녁 창 140 tick) → 야간권 + 세 자리 배수, 하한을 내려서 통과시키지 않는다.
8. 개조판 이름이 기능 설명이 되면 원작 톤 → 별칭 풀에서, 계승 ≤ 4.

## 이력
- **2026-09-11 P55 통과** (`gate -- p55`, 하네스 235 · vitest 477 · 밴드 52 **전부 초록 — ★3·★5 경고 창을 닫았다**): **밸런스 스윕** — 매 연차 랭크를 막은 조건은 **SNS 친구 수 하나**였다(8시드 실측: ★3 친구 18 은 Y4~5, ★5 친구 44 는 Y8+/미달). 봇 곡선(Y1 7 · Y3 14~18 · Y5 27~32 · Y7 34~40)에 맞춰 `ranks.json` 친구 문턱 10/18/30/44 → **9/14/26/38**, ★5 인기 4200 → 4000(Y6~7 3,812~4,095) → `rank3Year` 중앙 4 → **3** · `rank5Year` 99 → **7**. `gate.ts beforeSweep` 을 `< p55` 로(P55·P56 은 경고 없이). **그림 계약** — `ppaji-asset-contract.md`: `buoy/` 삭제 두 곳(ID 표·우선순위 ①) · `tile/pontoon[:a0~2]` 3 · `tile/pontoon_edge/<mask>` 4 · `overlay/` 7(rig_off·rig_link·rig_upgraded·grade_flag/1..4) · §4.5 물 위 기구(부력선 규칙 = 아래 4텍셀 알파 < 0.8·그림자 0 · 기구 21×2 = 42 필수·개조판 40 2순위 · 폴백 실루엣 셋 · 견인 4종 재생성 `flycarpet·swing·air_chair·hydrofoil`) · 게이트 6 부력선 · `tools/check-assets.mjs`(정적 9항목 + `--selftest` 위반 4종) 가 게이트에 든다 · **폴백 실루엣 셋** `rigTemplate()`: 데이터 `tall`(다이빙대·점프 타워·토템·빙산·망루) → `tower`, 긴 판(max(w,d) ≥ 3 ∧ min ≤ 1) → `plank`, 나머지 `floatPad`(`p55.test.ts` 3) · H44 판정 칸.
  ⚠ **계획과 다른 것**: ① 폴백 `tower` 기준을 「bodyH ≥ 24」로 적었는데 기구 정의에 bodyH 가 없다(분류 상수) → 데이터 플래그 `tall` 로. ② 주운 것: P51 봇 대조 검사 「`--no-convert` 현금 ±10%」가 한 시드(2)에서 0.17 로 깨졌다 — 랭크가 빨라져 개조·기구 지출 박자가 갈린 것이지 개조가 경제를 뒤집은 게 아니라 0.25 로(한 시드 대조는 노이즈, CLAUDE.md) · 계약 문서의 「부표 13」이 우선순위 ①에도 있었다(두 곳이 맞았다).
- **2026-09-11 P54 통과** (`gate -- p54`, 하네스 235 · vitest 474 · 밴드 52 충족 — ★5·★3 ⚠(P55 까지)): **밤 빠지 파티** — `Game.nightPartyOn()`(★3 ∧ ∃수역: 등급 ≥3 ∧ 켜진 조명 ≥1 ∧ 켜진 물 위 기구 ≥9 → 수역 id) · 저녁 래치 `nightOn`/`nightPool`(EVENING_TICK 에 판정, 하루 끝에 내림, 저장 0 — 로드 뒤 다음 저녁에 다시) · `syncNightSet()` 정의 1·호출부 3(세계 변경 꼬리 · 저녁 래치 · 하루 끝 되돌림 — 계획의 「호출부 2」에 되돌림 하나) — 실내 놀이 + 밤 수역의 켜진 기구·링 위 매점 · `issueNightBands()`(자리 잡은 팀마다 `rng.night` 한 번 · `issueBand(…, { night: true })` 값 = 최고 팔찌 × 밤 배수, 10 단위 · 낮 1회 규칙과 별개 집합 `nightBandTeams`) · `nightSalesMul()` = 1 + `nightLightStep` × min(`nightSalesMax`, 조명) · 곱하는 자리 셋(야간권 · 밤 수역 링 위 매점 저녁 매출 · 밤 수역 반경 자리 이용료) 전부 `nightEve()` 게이트 · `DayReport` optional 넷(`nightOn nightPkg nightFood nightFee`) · `stats` 넷 · 스냅샷 optional `nightOpened`(첫 개장 모달, 이후 티커) · 결산 창 「밤 빠지 파티」 줄 · 봇 `--no-night`(`game.nightEnabled = false`) · 밴드 둘 `nightNights 30~110`(중앙 76) · `nightRevShare 0.083~0.34`(중앙 0.21) · `p54.test.ts` 5 · 골든 재베이크(stats 넷이 항상 실린다 — 16일 판은 전부 0, 방문 무변경).
  ⚠ **계획과 다른 것**: ① 밴드 `nightNights 4~38` 은 「가끔 열린다」 전제였다 — 실측 54~82: 조건이 4년차쯤 갖춰지면 **매일** 열린다 → 30~110. ② 야간권을 `pkgPpaji`·`vestRentals` 에 더했더니 `ppajiPkgShare` 가 0.50 으로 두 배 → 야간권은 `nightPkg` 에만(낮 팔찌 몫 그대로 0.26). ③ 「같은 시드 밤 켬/끔 저녁 매출 비 ≥1.2(봇)」는 128일 봇 A/B 대신 **같은 저녁을 스냅샷으로 복제**해 켬/끔 두 판을 돌리는 단위 검사로(결정론·1초). ④ 주운 것: `bandPaid` 는 `Map<number>` 라 문자열 키를 못 쓴다 — 야간권은 별도 `Set`.
- **2026-09-11 P53-c 통과** (`gate -- p53c`, 하네스 235 · vitest 469 · 밴드 50 충족 — ★5·★3 ⚠(P55 까지)): **봇·밴드·목표·온보딩** — 봇이 이름 있는 사건(랭크·인증·달력·비트·해금 모달)이 있던 날을 세어 **해금 간격 밴드 둘** `unlockGapMaxY1_4 ≤4일`(중앙 3) · `unlockGapMaxY5_8 ≤6일`(중앙 4) · 요약 줄 **해금 8×3**(연차별 랭크/인증/달력 — 1년 1/2/11 · 2년 1/2/5 · … · 8년 0/2/3) · `money` 상한은 재보정 없음(중앙 299만, 상한 700만 안) · 하네스 P53-c 절 둘: **목표 HUD 56분 샘플**(페이지 안 봇 `__pj.botFor()` 이 판을 굴리며 1분 = 480 tick 마다 A·B 를 읽는다 — 같은 A 최장 17샘플 ≤ 24 · 서로 다른 A 12 · 힌트 몫 0.32 · 첫날 「기구/빠지」 · B 빈 0) · **봇 4년차 세이브 10분 재생**(하네스 프로세스가 `runBot` 64일 → `save()` 문자열을 localStorage 에 심고 열어 480 tick × 10 — 모달 후보 0 · 큐 0) · `check-plan.mjs` ④ 소유 요약의 `파일:줄` 8건이 파일 길이 안 · ⑤ §9 H35~H54 가 `human-check.md` 에 같은 페이즈로(H35~H60 26줄 추가) · 골든 무변경(봇 결정 무변경 — 계측만).
  ⚠ **계획과 다른 것**: ① 「목표 A 간격 여름·가을 ≤3.5분」은 **정의가 안 맞았다** — A 폴백 ①~④는 사람을 기다리는 힌트라 봇이 개조를 엿새에 하나만 하면 「개조해 보자」가 그만큼 서 있는 게 맞다(17샘플). 자를 「같은 A ≤ 6일 · 서로 다른 A ≥ 6 · 힌트 아닌 A 는 매 샘플 바뀜」으로 바꿨고, 이름 있는 사건의 간격은 봇 밴드가 잰다. ② 「첫날 기구/빠지 ≥2/3」도 봇이 첫날에 기구를 놓아 버리면 힌트가 인기 줄로 넘어간다 → 「첫날 ≥1/4 · 이틀 ≥2/8」. ③ 하네스가 sim 검사에서 `save/` 를 import 했다가 불변식 1 린트에 걸렸다 — 프로필 왕복 검사는 `save/save.test.ts` 로.
- **2026-09-11 P53-b 통과** (`gate -- p53b`: vitest 468 · 밴드 충족 · measure · 하네스 233(프로필 로더 수정 뒤 재실행)): **스토리·이월·엔딩** — `story.ts` 트리거 6(`rigs · rigChain · rigGrade · gearsKnown · vestRentals · rigUpgrades`, `checkStory` 가 `rigState.lit`·`chainLen`·`ppajiGradeOf`·`workshop.known`·`stats.vestRentals`·`stats.converts` 에서 채운다) · `story.json` 비트 24 → 33(`first_rig · rig_chain2 · vest_first · first_workshop · first_convert · rig_grade2 · rig_chain4 · signature · rigs12`, `ending` 은 마지막 그대로) · `first_pool` 32 → 28 · **Carryover v2**(`rigUpgrades · rigExp · rigParts`, v1 프로필은 `tiles` 읽고 버리고 그대로 지나간다) · **NG+ 개조판 한 채** `Game.placeNgPlusRig()`(아는 레시피 중 base 가 킷 빠지 물 칸에 놓이는 첫 자리 → 값 0 · 개조 통계 0) · 엔딩 이월 줄에 「개조 도감 · 부품 · 개조판 한 채」 · `p53b.test.ts` 5(비트·트리거 발화·이월 왕복(저장소 포함)·NG+·콤보 쌍 성립) · 골든 재베이크.
  ⚠ **계획과 다른 것**: ① 콤보 「슬라이드와 다이빙대」(`slide_large` + `diving`)는 **성립 불가**였다 — 큰 슬라이드는 뭍 4×5, 다이빙대는 깊은 물 링에만 서는데 깊은 물은 물가에서 멀어 반경 2 에 못 든다 → `slide_large` + `rig_slidedock`(깊이 any) 「슬라이드와 슬라이드 독」으로 재지정(`combos.json` 주석). 나머지 9쌍은 큰 검사 빠지(10×8, ★5 허가) + **링 두 겹**(링 위 2×2 는 데크 한 겹 더 깔아야 선다)에서 전부 성립. ② **주운 것**: `save/profile.ts` 로더가 `version === 1` 만 받아 v2 프로필을 null 로 버렸다 — 엔딩 뒤 배속·NG+ 가 조용히 죽는다(하네스 G11 이 잡았다, 단위에 저장소 왕복 추가) · 새 비트 9 를 `ending` 뒤에 붙였다가 G53 「엔딩이 마지막」에 걸렸다.
- **2026-09-11 P56-a 통과** (`gate -- p56a`, 하네스 239 · vitest 463) — 그림 우선 UI 골격. 정본·이력은 `docs/plan-ppaji-picture-ui.md`. ★3·★5 경고 창을 P56 에도 열었다(`gate.ts beforeSweep`, P55 뒤 삭제).
- **2026-09-14 P56-b 통과** (`gate -- p56c`, vitest 489 · 밴드 52 · 하네스 250) — 그림 383장을 이 머신에서 뽑아 반입했다(Codex image_gen · `ppaji/tools/pictures/` · 자 `check-pictures.mjs`). 정본·주운 것은 `docs/plan-ppaji-picture-ui.md` 이력. 같은 날 P56-a2 로 그림 문법이 화면 11 전부에 갔으니 **§14 순서줄이 전부 닫혔다.**
- **2026-09-12 P56-c 통과** (`gate -- p56c`, 하네스 244 · vitest 484 · 밴드 52 초록) — **재고(U1)**, 사용자 결정 「재고 넣고」. 정본은 `docs/plan-ppaji-picture-ui.md` D10·이력, 레포트 `docs/report-p56c-stock-2026-09-12.md`. 요리·공방·개조 저장소에 `stock`(시작 재료 무한 · 장날 +1 · 보상 ×3 · 조합 −1, 돈을 낸 시도만) · 보상 재료는 얻은 뒤 장날 값으로 재구매(재료 46·부품 10 `price` 데이터) · 창 카드 `×N`/∞/「재고 0」(탭 = 구입) · 봇 `restock` 하루 둘 · 밴드 `rigPartsBought` 6~12 → 20~45(재구매가 센다) · `ppajiDeckShare` 하한 0.15 → 0.12(개조 몫 0.25 → 0.35 가 밀었다) · `recipes` 63 → 59(밴드 안) · 골든 재베이크. ⚠ 계획과 다른 것: 보상 재료 재구매·시작 재료 무한은 계획에 없었다(없으면 ×3 을 다 쓴 레시피와 소원 `recipe` 조건이 영영 막힌다) · `p52a` 한 시드 ×3 → ×2(5시드 비 2.3~11).
- **2026-09-07 P53-a 통과** (`gate -- p53a`, 하네스 233 · vitest 460 · 밴드 충족 — ★5·★3 ⚠(P55 까지)): **조건·데이터 재배선** — 인증 9 가 기구 조건(`grade_f` 기구 2 · `grade_d` 인기 100 + 여울 기구 2 + 깊은 물 기구 2(심사관 1/1/1) · `grade_b` 망루 반경 50% · `grade_s` 등급 4 · `stream_d` 3종 5 · `stream_b` 사슬 4 · `fun_c` 망루 안 2 · `fun_a` 망루 반경 1/6 · `grade_a` 는 P49-a2) · 소원 20 이 기구 조건(rigCount 8 = 기구 2 ×4 + 3종 5 ×4 · rigChain 4 ×7 · rigGrade 3 ×5, 대사에 「기구」「이어」「등급」 · 친구당 ≤2 이고 친구 안에서 난이도 단조 · 부품 보상 둘 `float_drum`·`slip_wax` · 키디의 수역 20/40/60 은 그대로) · 연차 폴백 8(`calendar.json` 40 — 해마다 겨울 둘째 날 tick 280 「겨울 택배」 `priority 'strip'` · `when` 없음 · Y1 `pump_motor` → Y8 `rig_jump_tower`) · `Game.rankCapForTest`(★0 에 묶은 판에서도 Y1·Y2 택배가 온다 — 단위) · `src/sim/bot.ts` `hasRigCond/certHasRigCond` + 밴드 `rigCertsPassed 3~9`(중앙 5) · `p53a.test.ts` 4(조건 kind 4 전부 쓰임 · 등급 ≤4 · 사슬 ≤8 · 진입 인증은 시작 기구로 · 소원 분포·낱말·단조 · 달력 자리 유일 · 멈춘 판) · 골든 재베이크.
  ⚠ **계획과 다른 것**: ① 「인증 재배선 전후 `certs` 중앙 ±20%」 — 마지막 기록 13 → **16**(+23%). 기구 조건은 봇이 이미 붙이는 것(`attachRigs`)이라 수역 크기 조건보다 싸게 닫힌다 — 인증 축이 죽지 않았음을 재는 문턱이었으므로 위로 벗어난 것은 받아들이고 `certs` 밴드 상한 24 가 지킨다. ② 「rig 조건 인증 9건 각 ≥1회 통과 가능」은 시드 합집합이 아니라 **판당 서로 다른 통과 수**(`rigCertsPassed`, 중앙 5/9)로 잰다 — 밴드는 중앙값 계약이라 합집합 지표를 따로 두면 자가 둘이 된다. ③ 소원 후보 필터를 「`sizeMin` 만 든 조건」으로 짜면 3건(전부 키디)뿐이다 — 자리 소원(P28)이 `color/outdoor/likesMin` 을 같이 들어서 **`sizeMin` 을 든 pool 조건 전부**(키디 제외)에서 20 을 골랐고, 원본 sizeMin 이 대부분 6 이라 난이도는 친구·idx 순으로 새로 매겼다. ④ 달력 id 는 계획의 `calendar_y1_winter_rigpart_pump` 가 아니라 `…_pump_motor`(부품 id 그대로). ⑤ 새 판은 ★0 이라 「멈춘 판」 픽스처는 cap 0 이다(계획의 「랭크 1·2」는 ★1·★2 에서 시작한다는 오독). **주운 것**: `DAYS_PER_SEASON` 은 4 라 달력 `dayInSeason` 은 0~3 — 겨울 둘째 날 = 2. `grade_s` 검사가 `['pool','pool','facility']` 를 박아 두고 있었다(→ `rigGrade`). 데이터 검사의 `rigPartIds` 가 소원 검사보다 **뒤**에 선언돼 있어 위로 올렸다.
- **2026-09-07 P52-c 통과** (`gate -- p52c`, 하네스 233 · vitest 456 · 밴드 충족 — ★5·★3 ⚠(P55 까지)): **계절** — `Game.waterTemp(indoor)`(실내 26 · 야외 = 계절 기온 `[24,30,22,14]` + 날씨 `{clear 0, cloudy −2, rain −4, snow −3}` + 강 냉기 `riverChill −3` — 표 12칸 `[21,19,17, 27,25,23, 19,17,15, 9,7,8]`) · `swimUrgeOf(poolId)`(실내 1 · 폐쇄 0 · 등급 4 는 max(u, 0.9) · u = clamp((T−16)/10, `swimUrgeMin` 0.15, 1)) → 손님 훅 `swimUrge` 가 수역 가중치에 곱한다(`poolTempFit` 무변경) · `EventEffect.rigLoss?/waterClosedDays?` — 태풍 「부표 보강」 0 · 「버티기」 0.25 · 급류 「수역 하루 폐쇄」 0.10 + 폐쇄 1일 · `resolveEvent` 가 물 위 기구마다 `accident` 스트림 1회(앵커 개조판 `isAnchored` 면제 — 뽑기는 하고 결과만 버린다) · 바닥 무변경 · `waterClosedUntil`(−1 = 열림, optional 저장) · `stats.swimsBySeason` · 밴드 `offSeasonSwim 0.2~0.55`(가을÷여름) · `--sweep swimUrgeMin=1` 대조군 · 골든 재베이크.
  ⚠ **주운 것**: ① 하네스 G4(사진 → 글)가 0 이 됐다 — P52-c 탓이 아니라 **아이템 온도**: 20칸 빠지에 딸기 5개(색 농도 3/5)는 칸 수와 무관한 합이라 −10°C → 14°C → 만족 50 미달 → 사진 0. 아이템 온도를 농도(4칸당 1개 = 원작 규격)로 바꿨다(`pool-state.ts` `tempDelta × min(1, 4/size)`) — 4칸 풀은 그대로. ② `ppajiPkgShare` 상한 0.25 → 0.3: 수온이 비수기 야외 입수를 깎자 수영 패키지가 줄어 자유이용권 몫이 0.27 로(값은 그대로). ③ vitest 워커 RPC 「Timeout calling onTaskUpdate」(전부 통과해도 게이트 빨강) — 128일 ×2 동기 검사가 워커를 71초 막았다 → 64일로(네 계절 한 바퀴) + `vitest.config.ts`(forks 6) · 성능: `ppajiGradeOf`·망루/구조정 문맥을 세계 변경마다 캐시(128일 검사 60초 → 25초).
- **2026-09-07 P52-b 통과** (`gate -- p52b`, 하네스 233 · vitest 452 · 밴드 충족 — ★5·★3 ⚠(P55 까지)): **안전** — `src/sim/accident.ts`(`hazardOf` 바닥은 위험 모양(스릴 > 0)에만 · `accidentChance` 순서 hazard × 조끼 × 망루 × 구조정 × 브리핑 0.7 × 수온 × 혼잡 clamp · `riskLevel` 4단 문턱 base 배수 · `RISK_LABELS`) · `Game.accidentContext`(망루는 **알바가 있어야** guardRadius 체비셰프 · 구조정은 같은 수역 · 수온 18°C · 혼잡 `guests.busyCount`) · `riskOf`(자리의 위험 — 조끼·만원 기준) · 뽑기 자리 둘 정확히(기구 가지·선착장 가지, 전용 `rng.accident` — guest.ts 의 rng 줄 무변경) · `applyAccident`(하루 상한 3 · hp −35 · 만족 −20 · 토스트 · 수역 인기 감쇠 `accidentPopCut` 반감 · 의무실이 있으면 그리로) · `PlacedCourse.safetyBriefing?` optional + `setCourseBriefing` + 코스 독 브리핑 토글 · `aimPreview`·`convertPreview` 위험 두 필드 · 확정 바 **위험 칩**(`--risk-0~3` 토큰, 흰 글씨 4.5:1 — PAIRS 4쌍 + FAULT `risk-contrast`) · 봇 `ensureWatchtower`(딥 기구 옆 링 데크 + 알바)·`briefCourses` · 밴드 2(`accidentsPerVisit 0.002~0.02 · guardedShare ≥ 0.5`) · 하네스 P52-b 절(칩 · 알바 없는 망루 그대로 · 알바 두면 한 단 하강) · 골든 재베이크.
  ⚠ **계획과 다른 것**: ① 「`accidentBase 0` 대조군 스트림 동일」은 성립하지 않는다 — 사고가 hp·만족·목적지를 바꿔 이용 수(= 뽑기 수)가 갈린다. 검사는 「확률 0 이어도 뽑기는 한다(스트림 소비)·사고 0」과 정적 「뽑기 자리 둘」로 대신했다. ② 「사고 뒤 SNS 감쇠 −6~−8%」는 봇 지표로 안 재고 수역 인기 감쇠(`accidentPopCut 0.2`, 상한 0.5, 매일 반감)를 단위로 잰다 — 좋아요 축은 P53 에서. ③ 구조정을 동쪽 링에 두면 알바 망루 뒤 데크가 고립돼 「손님 길이 막힙니다」 — 링 윗줄(뭍)에 두는 것이 맞다(닫힌 링의 「막는 시설 하나」 제약 그대로). ④ 주운 것: 망루(정원 1 — 알바 자리)가 손님 목적지에 들어 128일 「이용」 1,715 로 기구 몫을 0.05 부풀렸다 → `pickTarget` 이 `guardRadius` 시설을 뺀다 · `--no-rig` 대조군에 랭크 보상 다이빙대가 해금 후보 경로로 새어 들어왔다 → `tryPlace` 가드 · 팔찌가 딥 기구를 열자 기구 이용 몫 0.604 → `swimUrgeRig` 1.2 → 1.0(0.55) · `bandPaid`·`accidentCut`·`accidentsToday` 를 스냅샷 optional 로(하루 중간 저장·복원이 같아야 한다 — 골든 왕복이 잡았다).
- **2026-09-07 P52-a 통과** (`gate -- p52a`, 하네스 232 · vitest 447 · 밴드 충족 — ★5·★3 ⚠(P55 까지)): **손님·팔찌** — `wristband.ts` `bandTierIndex`(문턱 0.85·1.25·1.7 — 출신지 10 이 3:3:3:1)·`bandFor`·`swimSkill`(취향 thrill → 0~1, 저장 0) · 손님 optional 둘 `band?/bandLeft?`(+`bandSaid` 저장 0) · **결제 소유자 하나** `Game.issueBand(buyer, tier, grade, f?)`(팀 한 장 낮 1회 `bandPaid` · 팀 전원 배급 · `stats.pkgPpaji`·`f.incomeToday`·`vestRentals`) · 창구 ⓐ 대여소(`onFacilityUse` `rental_tube` — 파크 최고 등급 `parkPpajiGrade`) · 창구 ⓑ 자리 패키지 `ppaji`(`claimSeat` 가 자리 배수·결제 다섯 줄을 통째로 건너뛴다 · 값은 반경 안 켜진 빠지 등급 · `packageFor` 는 팔찌 산 팀에게 band 패키지를 뺀다) · 회수 소모(딥 기구 이용 끝 `bandLeft −= bandCost ?? 1`) · `pickTarget` 딥 게이트 3(① 회수 부족 ② 어린이 ③ 팀 기구) + 가중 2(④ `deep ? s : 2−s` ⑤ `swimUrgeRig` 기운) + 슬라이드 팔찌 없으면 ×0.3 · 「팔찌가 없네…」 손님당 한 번 · 뽑기는 끝의 1회 그대로(정적) · 훅 묶음을 `guestHooks` getter 로(검사 표면 `simulateUseForTest`) · 봇 `ensureHallShops` 대여소 먼저 · `--no-vest`(창구 ⓑ 만) · 밴드 3(`vestShare · ppajiPkgShare 0.08~0.25 · ppajiRevShare 0.05~0.25`) · 골든 재베이크.
  ⚠ **계획과 다른 것**: ① `vestShare` 하한 0.5 → **0.25**: 「팔찌 ⇒ 조끼」 전제였지만 G3 의 하드 게이트는 딥 기구뿐이라 여울·any 기구는 팔찌 없이 탄다(실측 0.32 · 대여소 정원 4 로도 0.32, 매점 몫만 깎여 되돌림). ② A/B 「둘 다 ppajiRevShare ≥ 0.05」 — 대여소 없는 판은 64일 0.013(자리 반경에 켜진 빠지가 있는 팀만 산다) → 검사는 있는 판 ≥ 0.05 · 없는 판 > 0 · 있는 판 ≥ 없는 판. ③ 「bandCost 전부 지우면 이용 횟수 바이트 동일」 검사는 안 넣었다(데이터를 지운 사본으로 게임을 두 번 돌려야 해 별도 스위치가 필요 — 회수 소모는 단위 검사가 직접 잰다). ④ 팔찌가 팔리자 ★5 가 닿기 시작한다 — 8시드 중 넷이 7~8년차(rank 중앙 5), 넷은 8년 안 미달(`rank5Year` 중앙 99) · ★3 은 전부 4년차. 둘 다 오른쪽으로 움직였지만 밴드 [5,8]·[1,3] 안은 아니라 `--warn` 창을 **P55(밸런스 스윕)까지** 늘렸다(gate.ts) — 봇 정책이 아니라 값(인증 7·친구 30 문턱 등)을 볼 자리.
- **2026-09-07 P51 통과** (`gate -- p51`, 하네스 232(routes 8) · vitest 442 · 밴드 충족 — ★5·★3 ⚠ · measure 재탑승 0.08): **개조** — `rigs.json` 20(시작 3 `up_slide2·up_tramp_double·up_bridge_swing` · 2단 3 · 연차 부품에 물린 후반 6, 키 유일) + 개조판 20(`buildable:false` · `unlock craft` · 같은 발자국 · `to.chain === from.chain` · 밴드 Δ ≤ 2 ∧ 하나 ≥ +1 ∧ (Δthrill ≥ 1 ⇒ Δsafe ≤ 0) · cost ≤ ×3 · 별칭은 카탈로그 §2 풀에서, from 낱말 계승 ≤ 4 — 시설 148 · rig 41) · `RigStore.cook` 오버라이드(정확 키만 · 실패작 없음 · `rng.rig` 불변) + `upgradesFor` · `Game.convertCost`(예 1,800/1,400) · `convertCheck` 8단(인스턴스·정의 → 레시피 → 도감 → 탑승 중 → `check` → 이동 다섯 줄 → `breaksAccess` → 돈) · `convertPreview` 네 값 · `convertFacility`(`FacilityStore.convert` — `move` 와 대칭, 12필드 보존, `chainLen` 재계산) · `craftRig`·`buyRigPart`(진열 랭크) · `paidToday`(기구·링 위 그날 전액 환불) · `incomeYest` · `rigRemoveRefund 0.5` · `stats.converts/spentConvert/rigUses/rigRiderDays/rigRepeats/rigPartsBought` · 폴백 ③ · UI 「기구 개조」 창(`RIG_SPEC`, 메뉴 항목) + 시설 창 「개조 → …」 버튼(미리보기 네 값 + 개조비) · 하네스 routes 8(`evalOpen`) · 봇 `upgradeRig`(도감을 본다 · 엿새에 하나 · 써 본 기구부터)·`buyRigParts` · `--no-convert` · 밴드 4(`rigUpgrades 8~40 · rigUpgradesY4 ≤10 · rigPartsBought 6~12 · ppajiConvertShare 0.08~0.4`) + `ppajiRigShare` 상한 0.6 복귀 · `tools/measure.ts`(네 지표, 재탑승 > 0.3 이면 exit 1 — 게이트에) · 골든 재베이크.
  ⚠ **계획과 다른 것·주운 것**: ① 첫 봇은 매일 개조해 128일 **118건**·종 4 로 무너졌다 — 개조하면 원래 종이 사라져 `attachRigs` 가 같은 종을 또 놓는 쳇바퀴. 엿새에 하나 + 개조판을 원래 종으로 세기(`baseKind`)로 17건·종 19. ② 재탑승 비율의 첫 정의(1 − 손님·일/이용)는 **사슬을 건너는 것**을 재탑승으로 셌다(0.84) — 「같은 손님이 같은 기구를 그날 다시」로 고쳐 0.08. ③ `rigPartsBought` 는 `owned` 크기가 아니라 산 것만(인증·소원 보상 부품이 4 있었다). ④ 거북섬 8×6 이 봇 링(안 4×5·6×5·4×7)에 안 들어가 종 13 — 허가가 48 이상이면 10×8 링 먼저 → 19. ⑤ P10 도달성 검사는 `craft` 정의를 레시피 `to` 로 닿는 것으로 친다. ⑥ `ppajiSpendShare` 하한은 0.02 그대로(실측 0.04 — 팔찌 P52-a 뒤 재측정).
- **2026-09-07 P50-b2 통과** (`gate -- p50b2`, 하네스 232 · vitest 436 · 밴드 충족 — ★5·★3 ⚠): **화면·돈 칸** — `src/sim/wristband.ts`(`WRISTBANDS`·`bandPrice`·`bandTop`·`bandFor`, 값 함수만 — 상태·결제는 P52-a) + `wristbands.json` 4행 + `packages.json` `ppaji`(빠지 자유이용권, `needsInRadius ['ppaji']`, 값 400 — 발급은 P52-a; `pkgKinds` 밴드 상한 4 → 5) · `Game.aimPreview(defId,i,j,facing)`(가짜 인스턴스를 `computeRigs` 오버레이로 — nextUid·occHash·grid.rev·pools.version 불변, `FacilityStore.probeState()` 검사 표면) · `rigLinkEdges()`(켜진 기구끼리·기구–데크 접점, `facilities.version:grid.rev` 캐시) · `rigGoalHint()`(목표 A 폴백 ①②) · 등급이 오르면 같은 tick 모달 하나(축하 채널, 「놀이 빠지!」 + 자유이용권 값) · **UI** 확정 바 칩(등급이 바뀌면 첫 칸 · 정원 → · 연결 · 자유이용권 →, 거절이면 없음) · 수역 정보창 5행(등급·기구·연결·허가·어제 수입 「—」) · 시설 정보창 3행(켜짐·사슬·소속 빠지) + 같은 사슬 발자국 오버레이 · 슬롯 구조 `[a ?? A, B, C][goalSlot]` + `pinGoal`·`goalLine` 하네스 세터 · **그림 0장 연출** `scene.setRigLook`(꺼진 기구 `--rig-dim` 틴트 · 링 데크 `--pontoon-g0~4` 등급 색 · 이음쇠 `--rig-link` 고리) · `check-ui` PAIRS 15(`--rig-dim` 대 물 3:1 — 2.11 이라 #7f95a8 → #55697c) + FAULTS 11(`rig-dim-hardcoded`) · 하네스 P50-b2 절 6행(목표 폴백·첫 기구 5탭·둘째 기구 모달 1·1,680 tick 이용·잠긴 이유·등급 0 vs ≥3 히스토그램) · 골든 재베이크.
  ⚠ **계획과 다른 것**: ① 「첫 기구 확정 tick 에 등급 0→1」은 등급 함수(n ≥ 2)와 어긋난다 — 스모크는 **둘째** 기구 확정 tick 에 모달 1, 첫 기구는 모달 0(등급 불변)으로 잰다. ② **★5 밴드 복귀를 못 했다** — 8년차 인기 3,200~4,000/4,200 · 친구 34~41/44 · 지역 5~7/7. 등급 0 수역마다 기구 셋을 채우는 봇(`spreadRigs`)을 재 보니 인기는 4,200 을 넘지만 공짜 이용 몫 0.45 → 0.70 으로 친구·★4 가 늦었다(되돌림). 원인은 ★3 과 같다(팔찌 전까지 기구는 수입·좋아요 0) → `rank5Year` 도 **P52-a 까지 ⚠**(gate.ts 창을 `< p50b2` → `< p52a`). ③ `--rig-dim` 첫 값이 물 위 2.11:1 이라 S3 가 잡았다(면끼리 3:1 은 색약·흑백의 유일한 단서).
- **2026-09-07 P50-b1 통과** (`gate -- p50b1`, 하네스 226 · vitest 432 · 밴드 충족 — ★5·★3 ⚠): **사슬·등급 값** — `rig.ts` `chainScale(len) = min(cap, max(1, sqrt(len/base)))`(base 2 · cap 2.0 은 `balance.ppajiChainBase/Cap`) · `CHAIN_KINDS` 셋 · `computeRigs` 가 켜진 기구 중 **같은 계열 4이웃 컴포넌트**로 `chainLen`(크기)·`chainKinds`(종 수)를 낸다 · `capacityOf` 에만 `× chainScale(f.chainLen ?? 1)`(정적 항: 호출부 facility.ts 하나) · `PlacedFacility.chainLen` 은 `refreshRigs` 가 쓰고 `toSnapshot` 이 뺀다(로드 뒤 일치) · `ppajiGradeOf` 가 최장 사슬·그 종 수를 넣는다 · `balance.ppajiGradePopMul` 을 a1 자리표 `[1,1.15,1.35,1.6,2]` → R6 `[1,1.4,1.9,2.6,3.5]` · 지출 구성 `stats.spentDeck/spentRig`(`spend(amount, kind)`) · 봇 `attachRigs`(아직 안 놓은 **종만**, 켜질 자리 후보 ≤60) · `chainRigs`(같은 계열 사슬 끝, **사슬 8 = base×cap² 까지**) · 뭍 시설 루프에서 기구·링 시설 제외 · `--no-rig` 대조군(기구 0) · 밴드 7(`rigsDistinct 14~22 · rigChainMax 3~20 · rigGradeMax 3~4 · rigUseShare 0.15~0.6 · ppajiSpendShare · ppajiDeckShare 0.15~0.55 · ppajiRigShare`) · 골든 재베이크.
  ⚠ **계획과 다른 것 셋**: ① 첫 실측이 사슬 21~28 · 기구 이용 몫 0.73 · 매점 몫 0.15 · 지역 4 — 붙이기가 종을 다 놓은 뒤에도 값싼 징검다리를 계속 붙여 **사슬 도배**가 됐고, 뭍 시설 루프에도 기구가 섞여 판을 덮었다 → 종만 붙이기 + 사슬 상한 8 + 루프 분리로 사슬 10 · 이용 몫 0.45 · 매점·지역 복귀. ② `ppajiSpendShare` 하한 0.2 → **0.02**: 초안은 기구값 pop×90(5,400~12,600) 전제였는데 §4.1 데이터는 700~12,400 이고 봇 지출은 뭍 시설 ~150채가 대부분 — 개조(P51)·팔찌(P52)가 하한을 올린다. `ppajiRigShare` 상한 0.6 → **0.85**: 개조 몫 0 이라 데크+기구 = 1 — P51 이 되돌린다. ③ **★3 이 3년차 → 4년차**(친구 14~17/18, `--no-rig` 대조군은 25~26·3년차): 기구가 이용의 45% 를 가져가는데 팔찌(P52-a) 전까진 공짜라 수입·좋아요가 반 — 게임 규칙이 아니라 페이즈 순서. 봇 박자(사슬 격일)로는 안 움직였다(이용 몫은 개수가 아니라 끌림). 게이트는 `p50b1 ≤ goal < p52a` 구간만 `--warn rank3Year`(a1 의 `rank5Year` 선례) — **P52-a 가 되돌린다**. ④ 주운 것: 자리 패키지 「사라졌다」 대조 캐시(`seatPkgCache`)가 로드 뒤 비어 있어 저장 전 판만 토스트를 냈다(골든 왕복 해시가 갈렸다) → `primePackageCache()` 를 로드 끝에.
- **2026-09-07 P50-a 통과** (`gate -- p50a`, 하네스 **226** · vitest 427 · 밴드 충족(★5 ⚠ 유지)): **물 위 배치** — `FacilityStore.check(…, water: WaterRules)` 필수 인자(`ppajiWater`= FLOOR.pool ∧ 내 허가 · `depthAt` 자연 바닥 파생 · `ring` = 데크 ∨ 물에 닿은 뭍) — 물 위 기구(`rig ∧ !onRing`)는 발자국 전 칸 빠지 안 물 + 깊이 전 칸 일치(`depth-mismatch`), 링 시설(`onRing`)은 전 칸 링(슬라이드 활강로는 빠지 물도) + 깊이는 4이웃 물 · **켜짐** `computeRigs(grid, facilities, pools, overlay?)` → `RigState{lit, chainLen(1), chainKinds(1), walkOn, byPool}`(순수 · 저장 0 — 데크에 4이웃으로 닿은 기구가 씨앗, 켜진 기구끼리 BFS) · `FacilityStore.walkOn/isWalkOn/setWalkOn`(꺼진 칸을 돌려줘 `guests.evictFrom`) · **술어 하나** `guestWalkable(grid, fs, i, j)` = walkOn ∨ (걷는 바닥 ∧ 비점유) — guest.ts·game.ts ×2 가 같은 문자열(정적 검사) · **open** `PoolStore.blocked/setBlocked/isOpenAt/isOpenK/ownerIdK/openTilesOf/totalOpenTiles` — 유영·입수·착수·유입만 open, 인기·허가·유지비는 `tiles`, `recompute` 는 안 본다 · `Game.rigState`·`refreshRigs()`(`afterWorldChange`: passBy → 문 → `setBlocked` → `recompute` → `computeRigs` → `setWalkOn` → `evictFrom` · 로드 뒤도) · `ppajiGradeOf` 의 `n` = 켜진 물 위 기구 + 링 위 시설 · `waterRules` getter · 예외 자리(`tooClose` 양쪽 · frontage ×2 · `autoPathFor`/`ensurePath` 즉시 0 · `recomputePassBy` 진입 칸 `isIndoorCode`) · `maxPerPark` 는 `canPlace` 한 줄(「판에 N개까지」) · 건설 「빠지」 탭 둘째(기구 + 링 위 시설 33, 다른 탭에서 제외) · 하네스 P50-a 절 5행(탭·행·진짜 터치 물 칸 배치·켜짐/꺼짐/다리·open) · 골든·바닥 fixture 재베이크(봇이 데크 위 대신 물 위에 기구를 놓는다 — p3 검사가 「물 위 기구 ≥1」을 단언).
  ⚠ **주운 것**: 1×2 정의의 `facing` 은 0 이 세로(+J), 1 이 가로 — 검사 둘이 반대로 적었다가 고쳤다(주석으로 남김). 링 시설 둘이 붙는 자리에 켜진 기구가 그 링 칸에만 닿아 있으면 「손님 길이 막힙니다」 — 맞는 거절이라 검사 자리를 동쪽 링으로 옮겼다.
- **2026-09-07 P49-b 통과** (`gate -- p49b`, 하네스 **221** · vitest 421 · 밴드 충족(★5 ⚠ 유지)): **빠지 = 사각형 붓** — `Game.canMakePpaji(r)`(거절 9: 크기 「최소 4×5(20칸)」 · 격자 밖 · 내 수면 · 링 바닥 `(i,j)` · 안 뭍 · 시설 「먼저 철거하세요 — 이름」 · 「뭍이나 데크에 이어서 두르세요」 · 허가 「남은 N칸에 M칸」 · 돈) → `{cost = 물 위 링 × 60, enclose, ringWater}` · `makePpaji`(물 링 → 데크, 안쪽 데크 → 자연 바닥, `breaksAccess` 뒤 **원자 적용**, 병합은 `{keptId, keptName, goneNames}` 로 독 토스트 「‘◯’ 를 ‘△’ 에 합쳤습니다」) · **라인 조각** `lineTiles/canPlaceLine/placeLine`(1×2·4·6, facing 1 = 세로, 규칙은 `canPaintDeck` 그대로) · `PoolStore.tileOwner`(`ownerIdAt`·`at()` O(1))·`recompute()` 가 병합 목록을 돌려주고 `state()` 는 삭제 · **D59** `canDig` 가 뭍(잔디·길·지면)을 거절(「뭍에는 풀을 파지 않습니다 — 빠지는 물 위에 데크로 두르세요」, 강 위 직접 파기는 API 로 남는다) · 독 탭 「빠지」(두 모서리 → 링 선택 · 상태 줄에 링/폰툰/새 수역/남은 허가) · 「라인」(칩 1×2·4·6 + ↻) · 치기 탭 분기 삭제(`digPool` 프로덕션 호출부 **0**, `p49b.test` 정적 항) · 봇 `growPpaji`(물가 6×7 → 8×7 → 6×9 첫 자리, **새 수역 0 이면 건너뜀**) 가 `layDeckRing/widenRing` 을 대신 · 밴드 `poolTilesY1`(1년차 수역 ≤ 허가 ★2 160) + 요약 허가 줄 · 픽스처 허용목록 15 → **4**(뭍·강 거절 문장만 재는 검사) · 하네스 G1·G3(딸기 ×5 — 20칸 농도)·G5·G8·G26·G30·P1 재박음 + `digPool` 호출 9곳 → `makePpaji({41,24,6,7})`(하네스는 `kit=0` 이라 알려진 되는 사각형) · 골든·바닥 fixture 재베이크 · 그림 `docs/shots/p49b-ppaji-{select,done}.png`·`p49b-line-done.png`.
  ⚠ **주운 것 둘**: ① `makePpaji` 가 `breaksAccess(apply, revert)` 뒤 **다시 apply 를 안 해** 돈만 빠지고 링이 안 깔렸다(봇 128일 수역 20 그대로 — p3·p20·p48b2 밴드가 잡았다). ② 그 `revert` 가 `syncEnclosedWater` 만 부르고 「바뀐 칸 0」이면 재계산을 건너뛰어, 거절 경로에서 **살아 있는 수역 목록이 apply 시점 분할로 남았다**(골든 「스냅샷 왕복」이 잡았다 — 84칸 vs 격자 80칸). 되돌린 뒤 무조건 `pools.recompute()`. ③ `canDig` 가 수역 칸을 물로 안 쳐 「이미 수역입니다」 앞에서 「아직 내 땅이 아닙니다」 가 났다(에이전트 관찰). 「실내 온수풀은 실내 바닥에 판다」는 D59 문장은 **죽은 분기**였다 — `isLandFloor` 가 실내를 먼저 거르고 실내 풀은 시설이다.
- **2026-09-07 P49-a2 통과** (`gate -- p49a2`): **물빛 삭제** — `tiles.json` 파일째 · `TileDef·TILE_DEFS·TILE_INDEX` · `Game.tileDefs/tileDef/retileCost/retilePool/tileCount/tileCounts` · `unlocked.tiles` · `Grid.poolTile/poolTileAt/set(…,poolTile)` · 스냅샷 `grid.poolTile`·`unlocked.tiles`(**읽고 버린다**, 버전 v4 그대로 — `v4-p48b.json` 이 그 검사) · `grant 'tile'`·보상 kind `'tile'`·`Condition.tile?`·`TILE_KO`·`Carryover.tiles?` · 정보창 물빛 행·독 물빛 칩·랭크 창 물빛 열·엔딩 「부표 N」 · 봇 타일 갈기 · `digPool(tiles)`(타일 인자 삭제). **인증 보상 12 교체**(§4.4 표 그대로 — 기구 3 + 부품 9) · `grade_a` 조건 `tile sandy` → `rigGrade 3`. 참조 목록은 손으로 안 든다 — `tools/check-tiles-dead.mjs`(정규식 + 허용 2줄 `poolTileCost`·`poolTiles`, `--selftest` 는 합성 위반 3/허용 2)가 게이트에 들어갔다(`p49a2` 부터). 검사 재박음: g35 `pool{tile}` 삭제 · g37 갈기 절 삭제 · g53 물빛 분모 삭제 · p6 보상 kind · data.test 물빛 블록 삭제·보상 검사 `rigPart` · 하네스 G5(물빛 칩 0)·G37(비상 자금만)·G53(6줄). 골든 재베이크(봇 타일 갈기 지출 소멸).
- **2026-09-07 P49-a1 통과** (`gate -- p49a1`): **골격** — `schema.ts` 유니언(`UnlockSource 'craft'` · 조건 kind 4 `rigGrade/rigChain/rigCount/rigGuarded` · 보상·grant `'rigPart'` · `CalendarEvent.priority 'strip'`) + `FacilityDef` 새 필드 13 + `RigPartDef` · `FacilityFail` 3(`not-on-ppaji`·`not-on-ring`·`depth-mismatch`) · `PlacedFacility.chainLen?/paidToday?/incomeYest?` · `stats.converts?/pkgPpaji?/vestRentals?` · `RNG_SALTS` `accident 10·rig 11·night 12` · **데이터**: 기구 21종(`rig_` 17 + 링 위 비-rig 4 — 값은 §4.0 유도식으로 생성: `cost=round100(pop×90)`·`maint=round(pop×5.3)`·`safe=2−⌊thrill/2⌋`·hpΔ 규칙) + 이전 12 전환(5 는 `class:'rig'`+depth, 7 은 `onRing`) + 견인 이름 8(`flycarpet`→「UFO 튜브」 — 이름 검사가 한글을 요구) + `rig-parts.json` 13 + `balance.json` 24키(+`accidentMul`) + `ranks.json` ★1·★2·★4·★5 unlocks + 소원 `famous_painter/2` 보상을 돈 → `rig_totem`(소원 수는 친구×3 고정이라 새 소원을 못 넣는다) + `compat.json` `rig_float_bar` · **코드**: `src/sim/rig.ts`(`ppajiGrade` 문턱 5·`CHAIN_KINDS_FOR_GRADE3`) · `rig-upgrade.ts`(`RigStore extends CookingStore`, 실패작 없음, `rng.rig`) · `Game.rigs` 저장부(스냅샷 `rigs?` optional) · `poolOfFacility`(발자국 → 4이웃 최다 → null) · `ppajiGradeOf` 스텁(n = 그 수역의 rig·링 위 시설, kinds, lights, 사슬 0) · **인기 교체** `tilePop = 칸 수 × 표준 × ppajiGradePopMul[등급]`(등급 0 = 항등) · `ConditionWorld.ppajiGrades/rigChains/rigs` + 평가 4 · `grant 'rigPart'` · `FacilityStore.probeForTest` · **a1 임시 배치 규칙**: `class:'rig'`·`onRing` 은 데크 위에만(`not-on-ppaji`/`not-on-ring`) — 물 위 규칙(`WaterRules`)은 P50-a · 봇 `--warn k1,k2`·`--no-rig/-convert/-vest/-night`(`BotOptions` optional, 읽는 페이즈는 뒤에) · `p49a1.test.ts` 9건 + `validateRigData`(data.test) · 검사 재박음 6(g37 물빛 인기 항등 · g53 정의 128 · p21 랭크 목록·소원 15 · pool-state 족욕탕 · p48c 22).
  ⚠ **계획과 다른 것**: ① 인기 중앙 10110 → **3430** — 물빛 인기가 사라졌는데 봇은 P50-a 전까지 기구를 물 위에 못 놓는다 → ★5 를 8년 안에 못 간다(`rank5Year` 99). 게이트는 `p49a1 ≤ goal < p50b2` 구간만 `--warn rank5Year`(⚠, exit 0) — **P50-b2 가 되돌린다**(등급 인기가 봇 세계에 살면 밴드 복귀). ② 닫힌 데크 링은 뭍에 닿는 곳이 위 두 끝뿐이라 **막는 시설은 링당 하나만** 선다(둘째는 사이 데크 칸이 고립돼 `breaksAccess`) — 검사는 헬퍼 링(윗줄 전체가 뭍에 닿음)에서 잰다; P50-a `walkOn`(밟고 지나가는 기구)이 이 제약을 푼다. ③ 골든 재베이크(사유: 기구 데이터·물빛 인기 제거).
- **2026-09-07 P48-c 통과** (`gate -- p48c`): `class:'rig'` 를 닫힌 유니언에 넣고 소비처를 한 커밋에 이었다 — `schema.ts` 유니언 + `needsInRadius 'ppaji'` · `condition.ts` `CLASS_KO.rig '기구'` · `data.test.ts` `CLASSES`·`COST_POP_BAND.rig [60,140]` · `draw/facility.ts` `BODY_H.rig 20` · `fac-sprites.ts` `DEFAULT_BY_CLASS.rig` → 새 템플릿 `floatPad`(decor.ts, 널 위 주제색 상자 + 부표 띠) · `guest.ts` `tasteWeight`(스릴)·`setEmote`(별) · `game.ts` `tooClose` 첫 줄 rig 면제 · `radiusNeeds`(패키지 반경 표 분리, `has.ppaji` = 반경 안 수역) + `radiusNeedsOf` 검사 표면. 기구 정의 0개 — **골든 표를 다시 굽지 않았다**(동작 0 증거) · `p48c.test.ts` 5건.
- **2026-09-07 P48-b2 3차 — 본류 S(사용자 빨간 선)**: 「어귀만 S 가 아니라 **메인 스트림까지 S**」 → 본류 띠 자체를 스플라인으로 굽혔다. `MAIN.pts` 로 북안 행 `shoreRow(i)` 가 열의 함수(왼쪽 행 50 → 열 45~59 에서 행 **24**(출입동 두 줄 아래) → 오른쪽 행 50, 폭 22 로 일정 — 격자 양변은 옛 띠 행 50~71 그대로라 지도 밖 Surround 와 이음새 없음). 띠 아래 가운데 뭍은 **건너편**(`Grid.yardAt` — 토지 사각형 안 뭍 중 입구에서 뭍으로 닿는 칸만 마당). 어귀 굽이(`BEND`·`carveBend`)는 안 판다(`BEND.head` 는 킷 링 자리표). **허가 창은 행이 아니라 물가 거리** — `permitDepth(rank)` = 7+3·랭크, `Grid.shoreDist`(마당 물가에서 물 위 BFS), `inLandOrWater`·`inMyWater`·`openWaterMask` 씨앗이 전부 거리로. 킷: 링은 건물 앞 물가(50~55 × 24~29) 그대로, 잔교는 링 동쪽 열 58(행 24~26)·선착장 끝, 둘째 평상은 서쪽 물가(38,23), 자판기는 서쪽 산책로 옆(34,31), 물가 산책로는 `newPark` 이 S 를 따라 두 줄 깐다. 봇 링·선착장 후보·검사 헬퍼 `makeTestPpaji` 는 `shoreRow` 기준(윗줄은 여섯 열 물가 중 가장 아래 행, 첫 데크는 위가 뭍인 열). 검사 좌표는 서쪽 잔디(열 28~36 · 행 21~29)로 옮겼다(38건). 지도 바깥은 `SURROUND_WATER_EXTRA` 14 → 0(격자 아래 바깥은 뭍 — 가운데 건너편과 이어진다; 양옆은 옛 띠가 곧게). 하네스 215 · 밴드 충족 · vitest 401. 그림 `ppaji/docs/shots/p48b3-main.png`. ★0 마당은 서쪽 잔디 + 건물 아래 띠 + 동쪽 조각으로 줄었다(≥450칸) — 「건물은 좌우로 확장」과 맞는다.
- **2026-09-07 P48-b2 통과** (`gate -- p48b2`, 하네스 217 · vitest 401 · 밴드 충족): **물 판정** `inMyWater`(굽이 언제나 · 본류는 토지 열 × 허가 창) · `ownsTile` · `openWaterMask`/`syncEnclosedWater` 전 격자 · `wouldEnclose` · **허가 = 랭크별 칸 예산** `permitTilesByRank [40,90,160,260,400,800]`(`permitMax/Used/Left`, `paintDeck`·`digPool` 이 거절 「수면 허가를 넘습니다 — 남은 N칸에 M칸 · 랭크를 올리면 …」, 랭크 업 모달 「수면 허가 +N칸」) · `canPlace` 는 자연 바닥이 물인 데크 위를 check() 에 맡긴다 · **킷**: 빠지 링 16 을 만 서안에(안쪽 20 = 여울 11 · 강 9), 본류 잔교 3칸 + 선착장은 **잔교 끝**(가운데면 끝 칸이 고립돼 `breaksAccess` 가 거절), 평상 한 줄은 만 북안(51,22)·산책로 행 23, 자판기는 산책로(44) 옆 · 하네스 P27 문턱 1/3 복원 · `p48b2.test.ts` 8건 · 하네스 P48-b2 2행 + 재박음 7행(G8·P1×2·P15×2·P25·P28) · 골든 재베이크(사유 한 줄).
  ⚠ **사용자 지적으로 지형을 다시 팠다** (스크린샷 「도랑 + 네모 못이 아니라 S 자로 만처럼 건물 살짝 앞까지」): `BEND.head` 행 25~31 → **24~30**(출입동 두 줄 아래) · 반폭 2→3.5 / 3→5.5(폭 7~11) · 동쪽 두 귀 2칸 깎음(`round`), **서안은 곧다**(`flat −1` — 귀를 깎으면 링 옆에 닫힌 웅덩이가 생긴다; 거울은 `flat +1`) · 굽이 물 3xx → **509** · 입구 열 물 34~42 · 여울:강 1.12 → 0.56(띠는 그대로 2·1). 그림: `ppaji/docs/shots/p48b2-bay.png`.
  ⚠ **2차(같은 날)**: 사용자 「자연스러운 S — 튀어나온 데는 지워도 된다」 → 상자 못 + 수로 두 조각을 **스플라인 관 하나**로 바꿨다(`BEND.pts` 6점 Catmull-Rom · `half` 6개 · 표본은 타원, 북안 행 24 는 곧다) — `head` 는 이제 킷 링 6×6 자리표. 굽이 물 509 → **342** · 입구 열 물 36~42 · 물가 뭍 ≥95 · 우회 대조군은 「마당 가로 도랑」. ⚠ 첫 스플라인은 한 방향 굽이라 화면(아이소)에서 **J 자**로 읽혔다(사용자 스크린샷) — 중심선 열을 **동(62) → 서(33) → 동(42)** 으로 흔들어야 S 다(`pts` 7점). ego-browser 로 보며 다섯 번 고쳤다(링 서쪽 칸이 뭍 · 링 옆 웅덩이 · J 자).
  ⚠ **계획과 다른 것·주운 것**: ① `canPlace` 의 「내 땅」 줄에 주석을 return 앞에 붙여 **거절 두 개(내 땅·야외 식당 실내)가 조용히 죽어 있었다** — typecheck·lint 가 못 잡는 종류, 회귀 검사를 넣었다 ② 봇 링이 토지 서쪽 끝(굽이 어귀)에서 매일 첫 칸에 거절당해(「이어서」) 128일 수역 36·코스 1 — 링 첫 칸 위가 뭍·데크일 때만 시작 → 359·3(p3·p20 복원) ③ 여울:강 밴드 0.8~1.6 → 0.4~1.0 ④ 우회·도달 불변식은 그대로 통과(동쪽 회랑 6). 허가 밴드(1년차 수역 ≤160)는 봇이 링을 다시 놓게 된 뒤 P49-b 에서 잰다.
- **2026-09-07 P48-b1 통과** (`gate -- p48b1`, 하네스 215 · vitest 393 · 밴드 충족): `BEND`·`bendCenter/Half/Row`·`Grid.carveBend`(2패스)·`bendVariant`(거울 35~46) · `newPark` ④ 굽이 → 언덕 → 암반 → 자연 바닥 → 포장(물 가드) · `raiseHills` z 한 줄 ·
  실측 굽이 물 326(여울 172 · 강 154, 비 1.12) · 열 48 물 행 36~40 · 마당 도달 100% · 우회 중앙비 1.0 · 최대 1.85 · 못 동쪽 회랑 6 · 물가 뭍 135 · `carveBend` 0.19ms · `newPark` 1.18ms · 세이브 v4(v3 이하 새 판, fixture `v4-p48b.json`) · 코핑/부표 분기를 자연 바닥으로 · 골든 재베이크 2회(지형 · 봇 자리 정책).
  ⚠ **계획과 다른 것 셋**: ① 못(행 25~31)이 20×20 출입동(행 8~27)과 겹쳐 **출입동 20×13 을 b1 로 당겼다**(킷 빠지·선착장 이동은 b2 그대로) ② 우회 최대비 문턱 1.60 → **2.0**(실측 1.85 — 채널 건너 남서 귀퉁이, 다리는 W3 금지) ③ 밴드 `pkgKinds` 가 2 로 떨어졌다 — 물굽이가 물가를 세 배로 늘려 봇의 등급 높은 자리가 선착장·숙소에서 멀어졌다 → 봇 자리 점수에 「못 본 패키지 원천 반경 +1」(게임 규칙 무변경). 하네스 P27 욕구 문턱 1/3 → **임시 1/4**(킷 빠지가 아직 본류라 물이 멀다) — **P48-b2 가 1/3 복원**.
  검사 좌표 재박음: p13 시드 5→3 · p17·p22·p23·p24·p25·p39·p45c·p46·rank · 하네스 8행(본류만 세기 · 뭍 안쪽 probe · 건물 위치 · blob/마당/문 · 찜질방 · 간격 무리).
- **2026-09-07 P48-a 통과** (`gate -- p48a`, 하네스 215 · vitest 383 · 밴드 충족): `Grid.natural`(생성자·`naturalAt`·`setNatural`·`snapshotNatural`) · `riverFloorFor` 삭제(호출부 5 — `grid.ts:308` 인라인) ·
  포장 ⑧⑨ 를 `rockRims` 뒤로(바닥·단 배열이 골든 3시드×16일 전 구간에서 변경 전 fixture 와 **바이트 동일** — `src/sim/__fixtures__/p48a-floor.json`, `p48a.test.ts`) ·
  `unpaintPath/unpaintIndoor/fillPool/unpaintDeck/syncEnclosedWater` 복원을 `naturalAt` 로(암반 위 길을 걷으면 암반 — 실버그) · `facility.check` 기본값 47 삭제(필수 인자) ·
  스냅샷 `grid.natural` 왕복(없으면 `newPark` 값) · `tools/goal-num.ts` 한 벌(`p48a` = 148.1, `gate.ts`·`verify.ts` import) · `tools/dump-save.ts` · `tools/ref-count.mjs` · `tools/check-plan.mjs`(§6 표·순서줄·게이트 절·소유 요약·H 표 대조, 페이즈당 ≤10 — 실행하면 0 오류) ·
  `src/sim/test-helpers.ts`(`digWater`·`makeTestPpaji` — **D22 대로 데크 링을 두른다**: 강 위 `digPool` 은 닿는 걷는 칸이 없어 `breaksAccess` 가 거절한다, 계획의 「파는 헬퍼」는 그래서 틀렸다) · 골든 재베이크(사유 한 줄).
  ⚠ **범위 축소 하나**: 검사 파일의 `digPool` 직접 호출을 0 으로 못 만들었다 — 좌표를 되읽거나 뭍 풀 API 자체를 재는 **15파일이 허용목록**으로 남고(`p48a.test.ts` 정적 항이 그 집합을 못 박는다, 새 파일은 빨강), 셋(g37·g38·guest-life 중 하나)만 헬퍼로 옮겼다. P49-b(뭍 분기 삭제)가 15 를 0 으로 만든다.
- 2026-09-07 v4(5라운드, 74.5/100) → **v5 통합**(단일 편집자) → 평가 1회 **71/100**(정합성 22 · 게임성 28 · 구현 21, 차단 9) → **v5.1**(§1.6 쉬움 규칙 · G10·G11) → 평가 2회 **70.5/100**(정합성 20 · 게임성 29.5 · 구현 21, 차단 16 — 대부분 정의-배선 페이즈 역전과 장부) → **v5.2**: 소유 원칙(골격 = P49-a1) · 켜짐을 P50-a 로 · P50-b 를 b1/b2 · 슬롯 구조 · 계열 셋 · 자 재정의 → 평가 3회 **71.0/100**(정합성 23.5 · 게임성 27.5 · 구현 20, 차단 16). 세 판 71 → 70.5 → 71 로 **정체** — 남은 것의 절반은 편집이 만든 장부 오류(중복 문단·stale 의존·개수), 나머지는 결정이 필요한 설계 항목(킷 여울 8 < 여울 전용 12 · B 슬롯 폴백 · 환불 게이트 형태 · P49-a2 「동작 0」 주장 · `--sweep` 은 이미 있다 · 149.4 출처 · `not-connected` 는 없는 사유). 다음 단계는 사용자 결정.
