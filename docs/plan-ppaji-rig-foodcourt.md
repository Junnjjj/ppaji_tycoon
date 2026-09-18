# 빠지 기구 조합 × 푸드코트 계획 — D71~D73 · P60-a~f (2026-09-18 초안)

> 사용자(2026-09-18): 「워터파크 스토리는 풀의 색을 입히는 걸로 차별점을 줬고 우리에도 적용됐지만 **빼야 한다**. 그 대신 **빠지 수상기구가 플로팅덱에 붙는 조합**으로 가야 한다. 그거랑 **푸드코트**까지, 게임적·타이쿤적·카이로소프트적 요소를 어떻게 녹일지 계획을 세워라. 에셋은 만들고 있다.」
> 이 문서는 조사 다섯(R1 현황 · R2 카이로 패턴 · R3 실지 빠지+타이쿤 · R4 푸드코트 · R5 설계 비평)을 받아 쓴 **계획서 초안**이다. 코드는 0줄 바뀌었다. 정본 관계: `docs/plan-ppaji-water.md`(§14 물 개편, D78~ 기구·사슬·개조·팔찌)와 `docs/plan-ppaji-foodcourt.md`(D1~D8 · P58-a~c) 위에 얹는다. 번호는 `plan-ppaji-ui-polish.md` 의 D70 · P59-d 다음을 잇는다. 파일:줄은 전부 `ppaji/` 기준.

---

## §0 한 줄 결론

**원작 풀 문법(색·향·소품 온도)은 우리 판에서 「보이지 않는 상태」가 됐으니 뺀다. 그 자리를 「기구가 사다리(뭍 변)에서 어떤 순서로 덱에 붙나」(입수 경로)와 「어느 셋이 붙어 이름이 생기나」(세트)가 잇고, 푸드코트는 「기구를 탈수록 배가 고프다 → 좌석이 모자라면 서서 먹는다 → 점심 파도가 좌석 크기를 결정한다」 한 사슬로 기구 루프에 묶는다.** 새 동사 0 · 새 저장 상태는 세트 도감 하나 · 재베이크 3회.

### 결정 후보 D71~D73

| # | 결정 | 왜 | 근거 | 잃는 것 | 대체 |
|---|---|---|---|---|---|
| **D71 색·향·소품 온도 삭제, 계절 수온은 남긴다** | 물빛 타일은 P49-a2 에서 지웠는데 규칙은 여전히 `mixColor` 로 색을 센다 — 화면엔 물 색이 없고 정보창 글자만 남았다(원작이 색을 쓴 이유 「탭 하나 · 그 자리에서 보임 · 설명 없이 읽힘」 중 둘이 죽음). 손님 취향 `favHit` 은 `swim` 종료에서만 읽히고 기구 이용은 한 번도 안 읽어, 기구를 붙일수록 원작 축이 죽는 구조 | R5 §1 (a)(b)(c): `pool-state.ts:70~110` · `pool-info.ts:102~129` · `guest.ts:660~668, 733~741` · `bot.ts:239~262` | 소품 24 · 인증 8 · 소원 조건(실측이 조사마다 다르다 — §5) · 장날 19 · 달력 15 · 좋아요 리셋 · 프리셋 · `favColor/favScent` · 그림 24장 | 색 → 기구 **세트**(D72) · 향 → **푸드코트 구색**(D73) · 소품 온도 → 삭제, 계절·날씨·실내·heat 2종(`footbath 4`·`sauna 6`)의 수온은 유지(P52-c 야외 입수·사철 인증의 뿌리) · 좋아요 리셋 → 기구 철거 시 좋아요 −25%(초안) · 프리셋 → 보류 |
| **D72 기구 조합의 본체는 「입수 경로(순서)」, 이름표는 「세트」, 출발점은 「입수구(링의 뭍 변)」** | 지금 `ppajiGrade` 는 개수·종·사슬 길이만 센다 — 같은 7종을 링 어느 변에 어떤 순서로 붙여도 등급·인기·정원이 같다. §14.1 의 「**무엇을 어디에** 붙이나의 퍼즐」에서 「어디에」가 구현 안 됐다. 실지 사업자가 실제로 고르는 결정 넷(사다리 수·물가→깊은 곳 순서·남길 물·기구별 요원) 중 앞 둘이 이것 | R5 채점표 ① A 순서 17/20 · R3 (a).2 Aquaglide/Hushine 동선 · R1 a-5 「기구끼리의 조합 이름이 없다」 · `rig.ts:17~24` | 「켜짐·깊이·계열·팔찌」 넷에 규칙이 둘 더 얹힌다(G11 우려) | 새 규칙은 **전부 덤**(안 맞춰도 못 노는 것 0) · 화면 문자열은 정보창 2행 + 확정 바 칩 1칸 · 모달은 도감 첫 발견뿐. 보류: 대기 물(C3)·요원 밖 정원 절반(C5)·오후권(C6)·개조 오라(R-4)·설계도 판매(R-5)·상성 감점 |
| **D73 푸드코트 = 「기구 → 배고픔 → 좌석/서서 → 점심 파도」 한 사슬 + 구색** | 지금 `class:'rig'` 이용은 배고픔을 0 만큼 올린다(`finishUse` 가 `menuSlots>0` 이면 리셋만) — 「기구를 많이 탈수록 매점이 산다」가 성립하지 않고, 푸드코트엔 결정이 하나도 없다(어디에 그리든 등급 2 고정, 서서 먹은 수 통계 0). 실지 피크는 물놀이 뒤가 아니라 **시설이 정한 점심 휴식(13~14시)** 이다 | R5 §3 `guest.ts:733~741` · R4 §3 `game.ts:253, 2684` · R4 §1 스피드존 후기 · PSS 「4카테고리 각 1 → 보너스」 | 「매점은 어디든 이용된다」는 지금의 단순함 | 배고픔 키 하나(`hungerPerRig`) · `standEats` 통계 + 결산 줄 · 「점심 휴식」 토글(값을 매긴다) · 반경 3 점포 카테고리 4/4 「풀코스 푸드코트」. 보류: 배달 알바 · 유료 뷰 좌석 · BBQ 2시간 · 위생 · **링 위 식탁**(D2 실내 전용과 충돌 → 미결 ①) |

---


> ⚠ **2026-09-18 사용자 결정: 「다이어트판」으로 간다.** §3·§4·§6 의 초안 중 §10 이 「보류」로 표시한 항목(역순 벌점 · 동시 입수 정원 · 어린이 2칸 · `rigAt` 소원 · `fav.chain` · 점심 휴식 토글 · 식권 · 철거 −25%)은 **이번에 넣지 않는다.** 구현은 §10 의 지도를 따른다 — §3·§4 는 근거·수치 참고용으로 남긴다. 새 개념: 기구 3(입수구·경로·세트) + 푸드코트 1(구색), 기존 「사슬」은 「경로」에 합친다(8 → 9).

## §1 현황 (R1 요약)

| 축 | 지금 상태 | 결정(플레이어가 고르는 것) | 값이 되는 곳 | 봇·밴드 | 근거 |
|---|---|---|---|---|---|
| 빠지 기구 | 정의 41(물 위 37 + 링 위 4) 중 놓을 수 있는 21 · 개조판 20 · 부품 13 · 개조 레시피 20 · 계열 셋(obstacle 4·slide 4·rest 3) — 기구 21 중 계열 있는 것 11, jump 계열은 `cat` 만 있고 `chain` 없음 | 어느 빠지·깊이·링 접촉 / 같은 계열로 잇나 종을 늘리나 / 조명 / 개조 시점 / 망루·조끼 | 정원 `chainScale=min(2, max(1, sqrt(len/2)))` · 등급 0~4 → 인기 배율 [1,1.4,1.9,2.6,3.5] · 팔찌 400·600·700·1,000G · 밤 파티 · 인증 9 · 소원 20 | `attachRigs/chainRigs/growPpaji/upgradeRig/buyRigParts/ensureWatchtower` · 밴드 21 · `--no-rig/--no-convert/--no-vest/--no-night` | `rig.ts:17~23, 36~41, 47~97` · `facility.ts:69~70, 229~253` · `balance.json:59, 83~84` · `bot.ts:626~748` · `tools/bot.ts:48~70` |
| 기구 축의 공백 | 조합 **이름** 없음(정보창 3행은 사슬 길이·종 수만) · 링 위에 무엇을 놓느냐가 기구 값에 안 듦 · 소원·인증이 기구를 **수량**으로만 묻는다(`facilityAdjacent` 형 0) · 물 위 기구끼리 콤보 0(`combos.json` 40 중 기구 관련 9 는 전부 덱·선착장 짝) | — | — | — | `facility-info.ts:124~128` · `condition.ts:239~256` · `combos.json` |
| 풀 소품 | 24종 살아 있음(v5 §7 ⑬ 「소품 유지」 ↔ §14.2 「삭제, 랜턴·조명은 기구 부품으로」 **두 문서가 충돌**) · 색 `mixColor` · 향 = 소품 ∪ 인접 시설 34종 · 온도 = 계절 + 소품 + heat 2종 | 색·향·온도 맞추기 | 인기 계절 보너스 · `favHit` 만족 +10·사진 0.3 · `tempFit` 체류 0.85~1.15 · 좋아요 리셋 · 프리셋 4 | `itemPass/decideMidday/pursue` 매일 소품 구매(`useItems` 기본 true) | `docs/plan-ppaji-water.md:659` vs `docs/plan-ppaji-story.md:1010` · `pool-state.ts:69~98` · `guest.ts:653~666` · `game.ts:2127~2134, 2327~2360` · `bot.ts:56, 235~310` |
| 조명 사슬 ⚠ | 등급 4·밤 파티의 `lights` 는 `rig_led_buoy`(인증 **color_b** 보상) 또는 `rig_sunbed_led`(부품 `led_strip_buoy` = 인증 **spa_b** 보상). `rig_kids_park` 는 **scent_d** 보상 | — | — | — | `certs.json` · R1 a-3 |
| 푸드코트 | P58-a 만: 실내 사각형 ≥3×2 · 칸 60G · 3×2 마다 `foodcourt_seat`(정원 2·pop 4·hp +25·`derived`) · 킷 3×4 · 통계 `courtEats` 하나. **P58-b/c 0줄** · 밤 집합 미포함(D7) · 인기 포화 곡선(D5) 없음 | 어디에 몇 칸 | 식탁 pop 4 · 앉으면 만족 +5, 없으면 `eat` 12tick 서서 | `growFoodCourt` 없음 · 밴드 없음 | `foodcourt.ts:7~24` · `game.ts:1894~1924, 2684` · `guest.ts:760~784` · `plan-ppaji-foodcourt.md:41~42` |
| 자리 반경 | `SEAT_RADIUS 3` · 등급 0~5 · 패키지 5(`ppaji` 포함 = 팔찌 창구 ⓑ) | 자리 위치 | 자리 만족·팀 선택·1박·패키지 값 | `teamSeatShare·seatGradeY4·pkgKinds` | `game.ts:824~935` |
| 배고픔 | 수영 +30 · 슬라이드 착수 +25 · **기구 0** · 25 이상이면 식당 ×3, 감쇠 0.25 | — | 매점 → `carry` → `nearestLounge`(어떤 lounging 이든 최단) | `foodShare 0.15~0.65` | `guest.ts:593, 681, 733~741, 826~837` · `balance.json:48~50` |

카이로식 「조합」 문법이 코드에 이미 있는 자리(R1 참고): 요리·공방·개조가 같은 `CookingStore`(`rig-upgrade.ts:2~4`)와 같은 발견 창(`cook.ts:2~3`) · `combos.json`(pair·radius) + `combosOf` · `aimPreview`(`game.ts:3026~3052`)가 등급·사슬·팔찌 값을 확정 전에 낸다.

---

## §2 조사

### §2.1 R2 카이로 「조합」 문법

원작 PSS 의 풀 소품은 「아이템 20/풀 · 색 섞임(8색 = 무지개) · 색 바뀌면 좋아요 0 · 향은 아이템 ∪ 인접 1칸 시설 중 최강 · 온도 15~40 · 지속 7일 · 계절 배수표 · 심사 색 계열/향 계열/온천」이다[1][2][3][5]. 리뷰는 「향·색을 물에 넣는 발상이 독특」[10]이지만 구조는 **네 층(섞기=발견 · 계절표=리듬 · 손님 취향=미니 목표 · 심사=조건)이 한 허브 객체에 겹치는 것**이고, 우리 §9 「자리」가 이미 그 구조를 옮겼다.

작품 열둘을 가로지르는 공통 문법 7(R2 §2.1): ① 개수 2~3, 규칙 하나(변 공유 / 반경 3) ② 보상 두 축 이하(평판·가격), 가산 누적 ③ **놓는 순간 힌트**(Dream Town 별 · Mega Mall 2 초록 아이콘) ④ 발동 = 뉴스/축하 + **분모 보이는 도감**(31/43/66/184) ⑤ 정답표는 팔고 몇 개는 숨긴다(Mega Mall 마지막 8) ⑥ 효과가 주변으로 번진다 ⑦ 실패는 거의 없다(배치 콤보는 양수만, 음수는 별도 표).

우리 대조(R2 §3): 쌍 콤보(2시설·반경 2·sat +3·매출 +4%) · 인박스 한 줄 + `fx discover` 까지만 있고, **3종 세트 · 놓는 순간 힌트 · 축하 모달 · 도감 창(`src/ui` 에 combo 문자열 0건) · 숨은 콤보 · 순서 궁합**이 비어 있다(`combos.ts:14~33` · `game.ts:2293~2300`).

| 우리에게 옮길 패턴 | 출처 | 어디에 |
|---|---|---|
| 3종 인접 세트 + 두 축 가산 | Mega Mall 3점포[12] · Dream Town 변 공유[14] | D72 세트(P60-c) |
| 놓는 순간 별/초록 배지 | Dream Town[14] · MMS2[13] | 건설 카드 배지 + 고스트 이웃 별(P60-c) |
| 발견 = 축하 1회 + 도감 분모 | Corporation News · 31/43/184 | 세트 도감 탭(P60-c) · 경로 완주는 티커 |
| 배치 콤보는 양수만 | DTS·MMS·PA·PH | 세트·경로 전부 덤(D72) — 상성 감점은 보류 |
| 식당 4카테고리 각 1 = 보너스 · 궁합 △ −50% | PSS[4][7][9] | D73 구색(P60-e) |
| 순서·방향 궁합(동/서 손님층) | World Cruise[19] · Beastie Bay 감쇠[21] | D72 입수 경로(P60-d) |
| 정답표 판매 + 숨김 | Mega Mall[12] | 보류(R-5) — 도감 「?」 칸만 |

### §2.2 R3 실제 빠지 배치 도식 + 타이쿤 규칙

실지 기구는 셋으로 갈린다(R3 a.1): ① 플로팅 워터파크(공기주입형 고정식 튜브 — 슬라이드·트램펄린·타워·에어바운스·블롭·아이스버그·빔·징검다리·흔들다리·롤러·거북섬, **앵커 + 폰툰 링 연결**) ② 견인 기구(바나나·디스코·플라이피시·로터스 — 선착장 계류) ③ 자력·강습·투어. 항공사진 5형 중 가장 흔한 것:

```
A. 사각 폰툰 링 + 안쪽 플로팅 파크 (블루샤크·리버포인트·클럽비발디)
   뭍: 매표 · 탈의/샤워 · 매점 · 평상/파라솔 · BBQ
    │ (잔교)
   ┌┴─────────────────────────┐ ← 폰툰 링(걷는다) · 모서리 망루
   │ 슬라이드▲  타워▲           │ ← 사다리 가까운 쪽: 낮은 것
   │  빔 ─ 다리 ─ 징검 ─ 롤러    │ ← 장애물 사슬은 링 접점에서 한 줄로
   │           블롭●   아이스버그◆│ ← 바깥(깊은) 쪽: 점프류
   │ 해먹~   [open 물: 유영·대기] │ ← 기구가 안 덮은 물이 대기 줄
   └──────────────────────────┘
B. 바지선 2층(테이블 1층 3만·2층 뷰 2만) + 좌 견인 / 우 워터파크
D. 일자 잔교 → 끝의 워터파크 섬
```

동선·대기(후기): 「들어가면 왼쪽 견인·오른쪽 워터파크」 · 「기구 5개 20~30분씩 기다렸지만 **옆 물에서 서로 빠뜨리며 놀아 심심하지 않았다**」 · 「매점 라면 줄 — 11:40 전이나 12:30 뒤」 · 「샤워칸 5개 병목」 · 「학생 단체가 워터파크 점령」. 요금: 3종 30,000 / 5종 45,000 / 종일 50,000 / 오전·오후권 / 테이블 층별 유료 / 무제한 BBQ 30,000·2시간. 안전: 별표 10 구명조끼 110% · 소비자원 2025 「**기구마다 별도 인명구조요원** — 3/10 미배치」 · 제조사 설계 원칙 「온보딩 존 여러 개 · 물가 얕은 것 → 깊은 플래그십 · 입구→쉬움→어려움→휴식→출구 · 네 변 연결 · 병목 없는 순환」(Aquaglide·Wibit·Hushine).

타이쿤 규칙(R3 (b)): RCT 근접 가산 + 47개 상한 + **물 근접 가산** · Parkitect 「보이는 것」·「가장 가까운 가판」·「큰 푸드코트보다 흩뿌림」 · PC2 명성 경관 상한 500, **대기줄 경관 100 vs 기구 1,000(1:10)** · Waterpark Simulator 안전 기록 = 평판. 공통 골격: 근접 가산 · 반드시 상한 · 세트는 「서로 다른 셋」 · 보이는 것으로 판정 · 발견은 도감.

| 우리에게 옮길 패턴 | 출처 | 어디에 |
|---|---|---|
| 사다리에서 멀수록 스릴(순서) | Aquaglide 깊이 존 · Hushine 동선 · 후기 「단체 점령」 | D72 입수 경로 C1(P60-d) |
| 입수구 수 = 온보딩 정체 | Aquaglide 온보딩 존 · Wibit InfinityLoop · 바지선 1·2층 | D72 입수구 C2(P60-d) |
| 기구 옆 남긴 물이 줄 | 후기 · RCT 물 근접 · PC2 1:10 | **보류** C3(§7) |
| 서로 다른 셋 = 이름(Big3·N종) | Mega Mall · 실지 3종/5종 요금 | D72 세트 C4(P60-c) |
| 기구마다 요원 → 요원 밖 정원 절반·하루 폐쇄 | 소비자원 · hoverstar 1:50 | **보류** C5(밸런스 변경, 24시드 A/B) |
| 오전·오후권 | 블루샤크·썸머플레이스 요금표 | **보류** C6 |
| 스릴은 운전자·자리 | 후기 「로터스 최고·바나나 노잼」 | 기록만 C7 → §15 코스 축 |

### §2.3 R4 푸드코트

실지(R4 §1): 매점 = 한강라면 8종 5,000 · 그릴 소시지·만두·볶음밥 · 테이블 1+의자 4 세트 20,000 · 캐비넷 10,000 · **13~14시 점심 휴식에 기구가 멈춘다** · 반입 정책은 업체마다 금지/허용 · 무제한 BBQ 30,000/인, 직접 굽고 직원이 부르러 온다 · 「점심부터 마감까지 노니 안 먹을 수 없다」 · 배달은 입구 수령 → 평상. 게임(R4 §2): PSS 5슬롯·4카테고리 각 1 보너스·△ −50%·좌석이 곧 인기 시설(무료 의자 800G → 카바나 12,400G) · Mega Mall 「3점포 한 줄」 · Burger Bistro 입장률/식사율 + **같은 가구 상한** · RCT 「벤치는 지나가다 있으면」·「푸드코트 묶음은 이득 없음」 · Parkitect 「줄에서 욕구가 계속 오른다 · 기구 출구 매점」 · PC2 「배고픈 손님은 일찍 나가 다시 안 온다」. 우리(R4 §3): 시계 하루 1,680tick · 시간당 140 · 점심 13~14시 = tick 700~840(`clock.ts:8~36`) · 식당 21종(야외 10·실내 3·링 위 1) · 레시피 180(snack 51·drink 45·dessert 44·meal 40) · 소원 `restaurant` 개수 조건 7 · 매점·푸드코트 콤보 0.

| 우리에게 옮길 패턴 | 출처 | 어디에 |
|---|---|---|
| 서서 먹는 비율 = 확장 신호 | Burger Bistro eat-in · P58-b 설계 | D73 R1(P60-e) |
| 점심 파도 = 시설이 정한 시간 | 스피드존 13~14시 · 뚝섬 12~13시 | D73 「점심 휴식」 토글(P60-e) |
| 4카테고리 구색 보너스 | PSS[4][7] | D73 구색(P60-e) |
| 기구 → 배고픔 | Parkitect 기구 출구 매점 · 후기 | D73 `hungerPerRig`(P60-b) |
| 배달 알바 · 유료 뷰 좌석 · BBQ 2시간 · 위생 | 실지 · RCT 쓰레기 | **보류**(§7) |
| 밤 식탁(D7) | P54 밤 문법 | P60-f 한 줄 |

---

## §3 제안 A — 기구 조합 시스템

### §3.1 R5 채점표로 고른 축

| 후보 | 탭 | 보이는 되먹임 | 실패(내 책임) | 복잡도 위험(낮을수록 좋음) | 봇이 잼 | 합 | 판정 |
|---|---|---|---|---|---|---|---|
| **A 순서 — 입수 경로** | 2(지금과 같음) | 5 | 4 | 2 | 4 | **17/20** | **본체** |
| B 인접 세트(기구 쌍/삼) | 2 | 3 | 3 | 1 | 3 | 14/20 | 이름표로 채택(감점 없이, 둘째부터 0) |
| C 덱 모양 — 링의 변 성질 | 4 | 4 | 4 | 3 | 3 | 14/20 | 「뭍 변 = 사다리」 하나만 채택(A 의 출발점) |
| D 팔찌 게이트 | 1 | 4 | 3 | 1 | 5 | 14/20 | 이미 구현 — 온보딩 순서만 |
| E 개조 트리 | 3 | 4 | 3 | 1 | 5 | 16/20 | 이미 구현 |

보류(순서대로 다시 볼 것): C3 대기 물 · C5 요원 밖 정원 절반·하루 폐쇄 · C6 오후권 · R-4 개조판 오라(세트 ×1.5) · R-5 설계도 판매 · 상성 감점(R5 는 필요, R2·R3 은 양수만 — 사용자 결정 §7 ③) · C 의 나머지 변 성질(트인 강 변 = 점프, 여울 변 = 키즈).

### §3.2 규칙 문장·수치 초안

**A 입수 경로**(`computeRigs` 의 BFS 승격, `rig.ts:47~76` — 씨앗이 이미 링 접점이라 거리는 공짜)
- 입수구 = 링 칸 중 뭍(포장·잔디·데크)에 4이웃으로 닿은 **연속 구간**의 수(라인 조각도 센다). 킷 6×7 은 1.
- 경로 = 켜진 사슬을 입수구에서 BFS 거리 순으로 늘어놓은 것. `thrill` 이 **비감소**이고 마지막이 `rest` 계열이면 「코스 완성」.
- 코스 완성 사슬의 기구 이용 만족 `+thrill×3` 에 ×1.25(초안) · 어린이(kid)는 입수구 2칸 안 기구만 잡는다(지금은 딥 제외만, `guest.ts:832`) · 역순(입수구 1칸 안에 스릴 3+)이면 그 기구 회전 −15%(초안, 「대기가 링을 막는」 실지 증상). 벌점은 이것 하나 — 덤 원칙 안에서 「순서 ✗」 표시가 주다.
- 동시 입수 정원 = min(`open`×0.5, 입수구×6)(초안). 입수구 1 인 채 기구 9+(등급 3)면 링 위 대기 손님이 `walkOn` 칸을 막는다 → 결산 처방 「입수구를 늘리세요 — 라인 조각」.
- `ppajiGrade` 문턱 5개(`rig.ts:17~24`)는 **데이터(`balance.json`)로 옮긴다** — 경로를 더하면 6~7차원이라 코드에 두면 밸런싱마다 코드가 바뀐다(R5 §4 ②). 등급 문턱에 경로는 **안 넣는다**(규칙 두 벌 금지) — `rigChain` 조건의 뜻만 `rigPath`(경로 길이)로.

**B 세트**(`rig-sets.json` 신설, 불변식 3)
- 한 빠지에서 **서로 다른 기구 셋**이 4이웃 사슬/인접이면 이름 있는 세트. 8~10종 초안: 닌자 코스(다리·빔·징검) · 키즈존(미니슬라이드·키즈놀이터·해먹, 여울) · 점프존(블롭·아이스버그·타워) · 슬라이드 트리오(플로팅·도크·미니) · 라운지(해먹·선베드·플로팅 바) · 밤빠지(LED 부표·LED 선베드·플로팅 바) · 견인 Big3(선착장 코스 3종 — 견인 축 접점).
- 값: 세트 성립 → 그 빠지 팔찌 값 **+50G**(round50 눈금, `wristband.ts:14`) + 인기 +6(`tilePopStandard 4` 눈금)(초안). **같은 세트 둘째부터 0**(도배 금지). 등급 판정엔 안 넣는다.
- 세트 4~5개는 어디서도 안 알려 주고 도감에 「?」(Mega Mall 마지막 8). 설계도 판매(R-5)는 보류.
- 개조판은 `baseKind` 로 원종으로 세어 재료로 인정(오라 ×1.5 는 보류).

**놓는 순간 별**(R-2): `aimPreview`(`game.ts:3026~3052`)에 `setNext`·`pathNext` 둘 추가 → 건설 레일 카드 「세트 가능」 초록 배지 · 고스트 이웃 기구 위 별 · 확정 바 칩 「+닌자 코스」/「경로 3→4」. 탭 추가 0.

### §3.3 30초 루프 · 첫 5분 · 8년 페이싱

| 층 | 지금 | 바꿀 것 |
|---|---|---|
| 30초 | 조준 → 확정 → 칩(등급·연결·팔찌 값) | 조준 중 **고스트 손님 1명이 경로를 미리 걷는 연출**(FX 등록부 이름 하나, 그림 0)로 「순서」를 확정 전에 보여 준다. 칩은 바뀌는 값만(「경로 3→4 · 정원 4→6 · +세트」) |
| 첫 5분 | 0:40 목표 A → 1:30 첫 기구 → 1:40 등급 모달·패키지 발견 → 4:30 사슬 둘(§14 §1.5) | 첫 기구는 **입수구 옆**이어야 경로가 생긴다 — 목표 A 문구 「사다리 옆에 붙이자」. 첫 세트 발견은 3번째 기구(사슬 둘 = 세트 하나가 되게 시작 7종에 세트 1개 이상 성립하도록 데이터 검산) |
| 8년 | 해금 시작 8·랭크 9·인증 3·소원 1·연차 폴백 8 · ★3 밤 · ★4/★5 기구 1 | 색 인증 8 을 옮기면 부품 6·기구 2 시점이 바뀐다 → `unlockGapMaxY1_4 ≤ 4`·`Y5_8 ≤ 6` 재측정. 경로·세트는 새 해금이 아니라 **기존 기구의 새 쓰임**이라 페이싱을 안 건드린다. 세트 「?」 4~5개가 후반(★3~) 발견 자리 |

### §3.3.1 첫 5분 비트 (초안 — §14 §1.5 좌표 위에 얹는다)

| 시각 | 지금(§14 §1.5) | 바뀌는 것 | 채널 |
|---|---|---|---|
| 0:40 | 목표 A 「빠지에 기구를 붙이자」 | 「**사다리 옆**에 기구를 붙이자」 — 입수구 칸이 조준 중 표시된다 | 목표 칩 |
| 1:30 | 첫 기구 확정 → 켜짐 | 확정 바 칩 「경로 1 · 정원 4」 · 고스트 손님이 사다리 → 기구를 한 번 걷는다 | 칩 + FX |
| 1:40 | 등급 1 모달 · 「자유이용권」 패키지 발견 | 그대로(모달 1) | 모달 |
| 2:30 | 둘째 기구 | 카드에 「세트 가능」 초록 배지가 처음 뜬다(시작 7종 중 셋이 한 세트가 되게 데이터 검산) | 배지 |
| 3:30 | 셋째 기구 | **첫 세트 발견** 「닌자 코스」 — 축하 1회 + 도감 1/N + 팔찌 +50 | 모달(첫 5분 둘째, 예산 2 안) |
| 4:30 | 사슬 둘 | 「코스 완성 ✓」 티커 · 정보창 「경로 3/완성 · 세트 1」 | 티커 |
| 첫 결산 | 병목·서서 먹음 | 「서서 먹은 손님 N — 식탁 4석 더」(킷 4석 미완성) | 결산 줄 |

⚠ 첫 5분 모달은 등급 1 + 첫 세트 = **2** 로 G11 자(「새 판 0~5분 모달 ≤ 2」)에 딱 맞는다 — 인증·패키지 발견이 같은 창에 겹치면 티커로 밀어낼 것.

### §3.3.2 「덤」 원칙 — 게이트로 거는 셋 (R3 (e) 자기 반증)

1. 새 규칙 넷(경로·입수구·세트·순서 ✗)은 **안 맞춰도 못 노는 것이 0** 이다 — 유일한 벌은 역순 회전 −15% 이고, 그것도 등급·팔찌·해금엔 안 닿는다(단위 검사 「경로 없는 판의 등급·팔찌 값 = P53-c 골든과 동일」).
2. 화면에 새로 서는 문자열은 **정보창 2행 + 확정 바 칩 1칸 + 카드 배지 1** — 표로 경로를 보여 주면 Parkitect 가 된다. 고스트 손님 주행이 표를 대신한다.
3. 모달은 세트 첫 발견뿐 · 경로 완주는 티커 · 순서 ✗ 는 칩 — 한 사건을 두 채널에 넣지 않는다(K47).

### §3.4 심사·소원·도감 재배선

- 심사: 색 계열 3(`color_f/d/b`) → **「빠지 세트」 계열 3**(조건 `rigSet{min}` 1·2·3, 보상 그대로 — `rig_led_buoy` 는 여기 b 에 남아 조명 사슬이 안 끊긴다) · 향 계열 3 → **「푸드코트」 계열 3**(§4) · `spa_d/b` 는 **온천으로 유지**하되 조건에서 `item` 을 빼고 계절·실내·heat 인접(`facilityAdjacent`)만 — `led_strip_buoy` 보상 위치 불변. `rigChain` → `rigPath` 뜻 변경.
- 소원: 색·향·item 조건 → `rigSet/rigPath/rigGrade/seatsFed/courtSeats` + 새 kind `rigAt{pos,chain}`(「입수구에서 세 번째가 슬라이드인 빠지」) 5~8건. 보상 `item` → `rigPart/ingredient/facility/money`(grant 분기 이미 있음 `game.ts:477~493`). 친구 `fav.color/scent` → `fav.chain`(계열 취향, 기구 이용에서 판정 — 색의 소비자를 기구로 옮긴다).
- 도감: 개조 20 옆에 「세트 n/N」 탭(P56 `PictureGrid` 3열, 그림은 사용자) + 결산 「가장 붐빈 자리」 옆 「최장 경로·완주 수」 한 줄. 발견 채널: 세트 = 축하 모달 첫 회 + 인박스 그림 · 경로 완주 = 티커 · 「순서 ✗」 = 확정 바 칩(K47 채널 3분리, 모달 예산 분당 1).

### §3.5 UI(카이로식)

탭 ≤ 5: 수역 정보창 타일 3(물빛·향·온도) 삭제 → **「입수구 n · 경로 m/완성」 1행 + 「세트 k」 1행**(P50-b2 5행과 합쳐 정보창이 줄어든다, P59-c 삭제 우선과 같은 방향) · 확정 바 칩 1칸 · 건설 카드 초록 배지 · 도감 탭 1. 새 창 0.

### §3.6 봇·밴드

- 봇: `attachRigs` 가 「아직 안 놓은 종」만 고르므로 순서를 모른다 → **「입수구 거리 오름차순 + 세트 완성 후보 우선」 한 줄** 없이는 헤드리스가 이 축을 안 잰다(K36·P2-C·K52 교훈, 네 번째 같은 함정 방지). `growPpaji` 는 라인 조각으로 입수구 +1 을 한 번 시도.
- 밴드(신설): `rigPathLen 4~10` · `rigPathCompleteShare`(완주 비율) · `ringEntries ≥ 2`(2년차) · `rigSetsFound 3~8`(초안). `rigChainMax` 상한 20 → 10(도배 21~28 을 8 로 눌렀는데 상한이 20 이었다). 기존 `rigGradeMax 3~4`·`rigUseShare 0.15~0.65` 불변이 대조군.

---

## §4 제안 B — 푸드코트

### §4.1 규칙·수치 초안

| # | 규칙 | 수치(초안) | 탭 | 근거 |
|---|---|---|---|---|
| **B1 기구도 배를 곯린다** | `finishUse` 의 `class==='rig'` 가지에 `hunger += hungerPerRig × thrill`, 경로 완주면 한 번 더 | `hungerPerRig` balance 키 1(수영 30·슬라이드 25 사이) | 0 | R5 §3 — 지금 0(`guest.ts:733~741`). `hungerFalloff 0.25` 덕에 링 위·물가 먹거리가 먼저 팔리고 실내 푸드코트는 저녁 몫 |
| **B2 좌석 vs 서서** | 구매 시점에 반경 3 안 빈 좌석(식탁+평상)이 없으면 `standEats++` · 서서 먹기 `EAT` 12 → 8, 만족 +0(앉으면 +5 유지) · 먼 좌석(>6칸)이면 +5 → +2 | 결산 줄 「서서 먹은 손님 37% — 식탁 4석 더」, 문턱 0.3 | 독 「식탁」 2 + 확정 1 = 3 | P58-b 설계 · `nearestLounge` 는 **찾아간다**(RCT 와 다름) — 먼 좌석 감점 없이 좌석만 늘리면 판 끝까지 걸어가 왕복 감점 |
| **B3 점심 휴식 토글** | 메뉴 「운영」 토글 「점심 휴식 13~14시」. 켜면 tick 700~840 에 기구·슬라이드 정원 0(이용 중은 마침, `capacityOf` 정본 경유), 전원 `hunger += 20`, 위험 비율 ×0.7 | 파도 ≈ 동시 손님(★0 20 · ★5 80)의 70% 가 140tick 안에 매점 도착 → 매점(정원 2·23tick) 12명/파도 → **80명 판이면 매점 4 + 좌석 40** — 계산 가능한 결정 | 1 | 스피드존 13~14시 · Parkitect 「줄에서 욕구가 오른다」 |
| **B4 4카테고리 구색** | 푸드코트 반경 3 안 점포 메뉴 카테고리(음료·간식·식사·디저트 — `recipes.json` 분류 그대로) 수 k → 좌석 등급 +⌊k/2⌋, 매출 ×(1+0.05k). 4/4 = 「풀코스 푸드코트」 발견 1회 | k=4 면 등급 2→4 | 0 | PSS 4카테고리 · `seatGradeAt` 의 `food` 플래그(`game.ts:843`)를 카운트로 한 줄. 킷 3×4 는 2/4 로 시작(D8 미완성) |
| B5 밤 식탁 | `syncNightSet`(`game.ts:3132`) 필터에 `defId===FOODCOURT_SEAT_DEF` 한 항 — D7 닫기 | `nightSalesMul` 확장은 안 한다(P54 ② `ppajiPkgShare` 재보정 전례) | 0 | R1 (c) · R4 R5 |
| B6 팔찌 = 식권(선택) | `big5`+ 에 식사 회수 1 — `issueBand` 한 줄 + `menuSlots` 가지 소모 | `ppajiPkgShare` 재보정 | 0 | R5 R3 — B1 없이는 뜻 없음 → P60-f |

### §4.2 기구 루프와의 사슬

`기구 탑승(B1) → 배고픔 → (감쇠 0.25) 링 위 플로팅 바·물가 먹거리 → 좌석/서서(B2) → 자리 → 다시 기구` 가 낮의 사슬, `점심 휴식(B3) → 파도 → 좌석 크기 결정` 이 하루의 사슬, `구색(B4) → 등급 → 팀 자리 선택` 이 배치의 사슬. 실지 「기구 → 매점 → 식탁」은 코드에 이미 절반(수영·슬라이드) 있으므로 B1 이 끊긴 고리 하나다.

수치로 본 사슬(초안, ★2 판 동시 손님 40 가정): 기구 1회 `thrill 2` → `hunger +2×hungerPerRig`(키 값은 P60-b 가 수영 30·슬라이드 25 사이에서 스윕) → 문턱 25 를 두 번째 탑승에 넘김 → 식당 가중 ×3 · 감쇠 0.25 로 **링 위 플로팅 바(반경 안)가 먼저** → `carry` → 반경 3 좌석 없으면 `standEats` → 결산 「서서 37%」 → 식탁 +1 블록(좌석 +2) → `seatsFedAt` 증가 → 구색 k → 자리 등급 → 팀 자리 선택 → 팔찌 창구 ⓑ. 점심 토글이 켜지면 이 사슬이 140tick 안에 한꺼번에 돈다 — 매점 처리량 = 정원 × 140 / (useTicks×TICK_SCALE) 이 좌석·매점 수의 **계산 가능한 하한**이 된다(R4 R2).

### §4.3 UI · 결산 줄

- 푸드코트 정보창(수역 정보창 복제, P58-a): 「좌석 n · 오늘 식사 m · 서서 s% · 메뉴 k/4」 4행.
- 결산: 「서서 먹은 손님 s% — 식탁 4석 더」 처방 1줄 · 점심 토글이 켜진 날 「점심 파도: 판매 N · 줄 이탈 M」 1줄 · `courtEats` 는 지금 UI 노출 0건(`grep src/ui`) — 여기서 처음 뜬다.
- 티커: 「점심시간 — 기구가 쉰다」(비차단) · 「풀코스 푸드코트」 는 인박스 편지(발견 채널).
- 메뉴 편집 창(P56-b3) 카드에 「여기서 ×1.05k」 칩 — 장소 궁합(R4 R3 의 나머지: 기구 출구 snack ×1.3·저녁 meal ×1.3)은 보류.

### §4.4 봇·밴드

- 봇: `growFoodCourt`(서서 > 0.3 이면 3×2 블록 +1, 주 1회 상한) · ★2 부터 점심 토글 켬 · 식당 자리 정책(「자리를 가장 많이 먹이는 칸」 `bot.ts:483~497`)에 카테고리 다양성 한 줄.
- 밴드(신설): `standShare 0.1~0.4` · `lunchLeave 0~0.25` · `courtSeats`(RunMetrics 한 필드) · `courtMenuKinds ≥ 3`(3년차). 기존 `foodShare 0.15~0.65` 는 B1 뒤 **오른쪽으로 이동**해야 정상(안 움직이면 빨간불).
- ⚠ 파생 좌석은 「lounging = 팀 자리/조경 대상」 술어마다 제외를 물어야 한다(`plan-ppaji-foodcourt.md` §5 D4 검증 — `teamSeatShare 1.02` 실측). B2·B5 가 좌석을 목적지로 쓸 때 `derived` 가드 재확인.

---

## §5 삭제 영향·이관 표 (D71)

⚠ **소원 조건 수 실측이 조사마다 다르다** — R1 「75/213 조건 + 보상 item 151」 · R2 「74」 · R5 「32(pool color 8·scent 7·tempMin 2·item 16)」. R1 은 보상까지, R5 는 조건 kind 만 센 것으로 보이나 **P60-a 첫 게이트가 `ref-count.mjs` 로 세는 것**이 정답이다. 아래 표는 R1 수치를 쓰고 (R5) 를 병기한다.

| 읽는 곳 | 파일:줄 | 무엇 | 삭제 시 | 이관 |
|---|---|---|---|---|
| 아이템 정의 | `items.json`(24: start 5·shop 19) · `schema.ts ItemDef` | 색·향·온도·값·7일 | 파일째(`tiles.json` 선례 §4.4) | 조명 3·반사판·물레방아·모닥불 장작·온수관 → **기구 부품·링 위 장식**(§14.2 표 그대로) |
| 풀 상태 | `pool-state.ts` 전체 · `color.ts` 70줄 · `scent.ts` 20줄 | 색·농도·향·온도·seasonBonus·detail | `seasonBonus`·`detail` 죽음 | `temp` 는 계절+날씨+실내+heat 2종으로 남긴다 · `seasons.json` 은 colors 11·scents 12 만 지우고 ambient/sun 유지 |
| 조건 DSL | `condition.ts:86~99, 143~157, 178~181` · `schema.ts:170,175` | `pool{color,scent,tempMin/Max,intensityMin}` · `item{id,count}` · 농도 만점 | 필드 4 + kind 1 삭제 | `tempMin` 만 남김 · 새 kind `rigSet`·`rigAt`·`courtSeats`·`courtMenuKinds` |
| **인증** | `certs.json` 8/24(color_f/d/b · scent_f/d/b · spa_d/b) | 조건 | 계열 8 → 5 면 밴드 `certFamilies ≥4·certsDistinct ≥8·certs 10~24` 재보정 필요 → **계열 수 유지** | color 3 → 빠지 세트 3 · scent 3 → 푸드코트 3 · spa 2 유지(조건만) · **보상 8 불변**(부품 6 + `rig_kids_park`·`rig_led_buoy`) — ⚠ 이 셋을 먼저 옮겨야 등급 4·밤 파티 사슬이 안 끊긴다 |
| **소원** | `wishes.json` 조건 75(R5: 32) · `item` 조건 18 · 보상 `item` 151/213(19종) | 조건·보상 | 친구 58명 idx 2 소원 50건 → 3☆ 사슬 절반 공백 | 조건 → `rigSet/rigPath/rigGrade/rigAt/seatGrade/seatsFed/courtSeats` · 보상 → `rigPart/ingredient/facility/money`(grant 분기 `game.ts:477~493`) · 총량 213 유지 |
| 친구 | `friends.json` 71 전원 `fav.color/scent` · `guest.ts:80,367,660` | favHit → 만족 +10·사진 0.3 | 「내 취향이야!」 소멸 | `fav.chain`(계열 취향) · 판정을 `finishUse` 기구 가지로 |
| SNS 좋아요 리셋 | `game.ts:2127~2134` · `sns.ts:191` · `pool-state.ts:81` | 색 변경 = 0 | 「완성 풀을 갈아엎는 비용」 소멸 | 기구 **철거** 시 그 수역 좋아요 −25%(초안) — 사고 감쇠 `accidentPopCut 0.20` 과 이중 벌 금지, 철거만 |
| 프리셋 | `game.ts:244,295,2327~2360` · `pool-info.ts:34~70` · `preset.test.ts` | 소품 목록 | 스냅샷 `presets` 삭제 → **세이브 v5** | 보류(「빠지 설계도」 저장·복원은 NG+ 이월과 겹침) |
| 장날 | `shop.json` item 19/43 · `shop.ts` 17시 6칸 | 진열 | 후보 43 → 24, 6칸 회전 빨라짐 | 부품 13 + 레시피 재료로 채움(P56-c 재고 문법), `stockBuys` 밴드 재측정 |
| 달력 | `calendar.json` 15/40 `grant.kind:'item'` | 사장 편지 선물 | 편지 15통 물건·문장 | 부품·기구·재료로(문장은 편지 그림과 함께) |
| 봇 | `bot.ts:240~310` `itemPass·decideMidday·pursue` 색·향·온도 가지 · `useItems` | 매일 소품 구매 | 가지 3 삭제 | `pursue` 에 기구·세트 조건 가지 — `money`·`ppajiSpendShare` 가 오른쪽으로 움직여야 정상 |
| UI | `pool-info.ts:119~131` 타일 3 · `:34~70` 프리셋 · `pool-edit.ts:32,144~145,254,288,301~323` 소품 모드 · `guest-info.ts:2` · `cert.ts:17` · `main.ts:158~164 syncPoolLook` | 표시·투입 | 수역 정보창 4행 + 새 2행 · 독 모드 13 → 12 | §3.5 |
| 렌더 | `scene.ts:1082~1132 setPoolColors`(틴트·무지개·`scent-puff/temp-steam/temp-frost`) · `main.ts:566,583`(`item-sparkle·got-item`) | 물 틴트·연출 | 물빛 = `--pool-clear` 하나 · 김/서리는 온도가 남으니 유지 가능 | `setRigLook`(`main.ts:156`) 켜짐/사슬 틴트 + 경로 고스트 |
| 그림 | `pictures.json` 소품 24장(P56-b) | 카드 | 폐기 또는 부품 그림 재지정 | 사용자 결정 §7 ⑤ |
| 세이브 | `pools[].items`(`pool.ts:20,28`) · `presets` · `unlocked.items` | | **v4 → v5**(`MIGRATIONS.length === SAVE_VERSION−1`) | 읽고 버리기(Carryover v1 `tiles` 선례 `endgame.ts:81`) |
| 검사 | vitest 5(`pool-state·preset·g30·pool-detail·g38`) · 하네스 소품·물빛·프리셋 18줄 | | 삭제·재작성 | `check-items-dead.mjs`(+`--selftest`, 허용목록 = 온도 계절 파생) 신설 |
| 테스트 골든 | `golden.test.ts` 3시드×16일 | 봇 지출 순서 | 재베이크 1회 | `--no-items` 대조로 색 삭제의 골든 차이를 미리 분리(`--sweep`·`--no-*` 문법 있음) |

---

## §6 페이즈 표 P60-a~f

| P | 이름 | 범위 | 의존 | 봇·밴드·스위치 | 세이브 | 예상(초안) |
|---|---|---|---|---|---|---|
| **P60-a** | 색·향·소품 삭제(D71) | §5 전부 · 인증 8 재작성(보상 불변) · 소원 재배선 · 장날·달력 치환 · 정보창 타일 3 삭제 · `check-items-dead.mjs` · 온도 계절 파생 유지 | — | `itemPass` 삭제 · `money`↑ `ppajiSpendShare`↑ 재측정 · `offSeasonSwim` 불변이 대조군 | v4 → v5(`presets`·`items` 읽고 버림) | 1.5일 |
| **P60-b** | 기구 배고픔(D73 B1) | `finishUse` rig 가지 + `hungerPerRig` 키 · 경로 완주 훅 자리만 | 60-a | `foodShare` 이동만 — 다른 밴드 불변이 대조군 | — | 0.5일 |
| **P60-c** | 세트 + 놓는 순간 별(D72 B) | `rig-sets.json` 8~10 · `activeSets`(`computeRigs` 안) · 팔찌 +50·인기 +6 · 둘째부터 0 · `aimPreview.setNext` · 건설 카드 배지 · 고스트 별 · 도감 「세트」 탭 · 축하 1회 · 「?」 4~5 · 인증 세트 3 배선 · `rigSet` 조건 | 60-a | `attachRigs` 세트 후보 우선 · 밴드 `rigSetsFound 3~8` · `--no-set` | 도감 `setsSeen` optional | 1.5일 |
| **P60-d** | 입수 경로·입수구(D72 A+C) | `computeRigs` BFS 경로 · 입수구 계산 · 코스 완성 ×1.25 · 어린이 2칸 · 역순 회전 −15% · 동시 입수 정원 · `ppajiGrade` 문턱 데이터화 · 정보창 2행 · 확정 바 칩 · 고스트 손님 주행 FX · `rigChain`→`rigPath` · `rigAt` 소원 5~8 · 결산 병목 「입수구」 · `fav.chain` | 60-c | `attachRigs` 입수구 거리 오름차순 · `growPpaji` 라인 조각 · 밴드 `rigPathLen·rigPathCompleteShare·ringEntries` · `rigChainMax` 20→10 · `--no-path` | — | 2일 |
| **P60-e** | 푸드코트 P58-b/c 완성(D73 B2~B4) | `standEats`·먼 좌석 감점 · 결산 줄 2 · 점심 휴식 토글(`capacityOf` 경유) · 구색 k · 「풀코스」 발견 · 인증 푸드코트 3 배선 · `courtSeats/courtMenuKinds` 조건 · 정보창 4행 · 인기 포화 `sqrt(seats/8)` cap 2(D5) | 60-b | `growFoodCourt` · 봇 점심 토글 ★2 · 밴드 `standShare·lunchLeave·courtSeats·courtMenuKinds` | `lunchBreak` optional | 1.5일 |
| **P60-f** | 사슬 닫기 | 밤 식탁 D7 한 줄 · 팔찌 식권(B6, 사용자 확인 뒤) · 철거 좋아요 −25% · 온보딩 비트 「사다리 옆」·「첫 세트」 · 모달 예산 재측정 · `check-plan.mjs` 표 대조 · human-check 행 | 60-d·60-e | `ppajiPkgShare` 재보정 · 밴드 52+8 전수 | — | 1일 |

순서줄: `P60-a → P60-b → P60-c → P60-d → P60-e → P60-f` (b 와 c 는 독립이라 바꿔도 되나 골든 재베이크 원인을 가리려면 이 순서).

### 게이트 (페이즈당 ≤10, 항목 끝은 자 종류)

- **P60-a** `gate -- p60a`: `check-items-dead.mjs` 0건 + `--selftest` 4(정적) · 인증 24 유지·보상 8 바이트 동일·계열 수 불변(단위) · 소원 213 총량 유지 + 조건 kind 에 pool color/scent/item 0(단위, `ref-count.mjs` 로 실측 수치 확정) · `unlockGapMaxY1_4 ≤ 4`·`Y5_8 ≤ 6`(봇) · `offSeasonSwim` 밴드 불변 + 수온 계절 검사 통과(단위) · v4 fixture 로드 → 새 판 아님·`items` 무시(단위) · 하네스 수역 정보창 행 수 4·독 모드 12(브라우저) · `--no-items` 대조 골든과 본 골든 요약 동일(골든) · 재베이크 사유 1줄(골든).
- **P60-b** `gate -- p60b`: 기구 1회 뒤 `hunger ≥ hungerPerRig×thrill`(단위) · 밴드 `foodShare` 중앙 이동 > 0, 나머지 51 불변(봇) · `hungerPerRig=0` 스윕이 P60-a 요약과 동일(봇 대조군).
- **P60-c** `gate -- p60c`: 세트마다 「성립 배치 존재」(P53-b 콤보 8쌍 선례, 단위) · 배지 뜬 자리에 놓으면 반드시 발동(항등, 단위) · 같은 세트 둘째 값 0(단위) · 시작 7종으로 세트 ≥1 성립(단위) · 새 판 0~5분 모달 ≤ 2(하네스 G11 자) · 도감 탭 3열·`PictureGrid` 폴백(브라우저) · 밴드 `rigSetsFound` 3~8 · `--no-set` 대조 골든(골든).
- **P60-d** `gate -- p60d`: 입수구 킷 = 1, 라인 조각 하나 뒤 = 2(단위) · 경로 = BFS 순서 항등 + 코스 완성 판정(단위) · 어린이가 입수구 2칸 밖 기구를 0회 잡음(단위) · `ppajiGrade` 문턱이 `balance.json` 키(정적) · 고스트 주행 FX 등록부 이름 1(정적) · 확정 바 칩 문자열 ≤ 1칸 추가·정보창 +2행(브라우저) · 밴드 `rigPathLen 4~10`·`rigPathCompleteShare`·`ringEntries ≥ 2`·`rigChainMax ≤ 10`(봇) · `measure`(재탑승 ≤ 0.3) 재측정 · 순서 봇 vs 무작위 봇 사고율 24시드 A/B 기록(봇) · 골든 재베이크(골든).
- **P60-e** `gate -- p60e`: 좌석 0 이면 서서 100%, 킷 4석 첫날 서서 ≥ 1(단위) · 점심 토글 켠 날 tick 700~840 기구 이용 0 + `capacityOf` 경유(단위) · 구색 k=4 면 등급 +2(단위) · 결산 줄 2 실터치(브라우저, 좌표만 재지 말 것 — P3-C④) · 파생 좌석이 `claimSeat`·`ensureGarden`·`seatsFedAt` 술어에서 제외 유지(단위) · 밴드 `standShare 0.1~0.4`·`lunchLeave ≤ 0.25`·`teamSeatShare` 불변(봇) · 골든 재베이크(골든).
- **P60-f** `gate -- p60f`: 밤 열린 저녁 식탁 이용 ≥ 1(단위) · 철거 뒤 좋아요 ×0.75, 사고와 겹칠 때 한 번만(단위) · 온보딩 8비트 순서 유지(단위) · 밴드 60 전수 초록(봇) · `check-plan.mjs` 0 오류(정적) · human-check H62~(사람).

재베이크는 a·b·c/d·e 로 **3~4회** — 한 커밋에 섞으면 골든 차이의 원인을 못 가린다(K36·P3 선례).

### §6.1 리스크 상위 6 (R5 §4 + 부록 B 문법)

| # | 리스크 | 어디서 터지나 | 막는 것 |
|---|---|---|---|
| 1 | 파생 좌석·새 필드가 「class 하나로 묶인 술어」를 뚫는다 | `lounging`/`rig` 술어 목록(P58-a D4 검증에서 `teamSeatShare 1.02`) | 술어 목록을 단위 검사로 고정 · 새 class 0 |
| 2 | `ppajiGrade` 문턱이 코드 상수라 경로를 더하면 밸런싱마다 코드가 바뀐다 | `rig.ts:17~24` | P60-d 가 `balance.json` 키로 옮긴다(불변식 3) |
| 3 | `afterWorldChange` 8단에 새 단계를 끼워 순서가 흔들린다 | `game.ts:3224~3250` | 경로·세트는 `computeRigs` **안**에서만 계산 |
| 4 | 색 삭제 참조를 손으로 세어 놓친다 | 소원 수치가 조사마다 다른 것이 증거 | `check-items-dead.mjs` + `ref-count.mjs` 를 P60-a 첫 게이트로 |
| 5 | 봇이 새 축을 안 겨눠 헤드리스가 「봇의 한계」를 잰다 | P3-A·P3-D·K52 세 번 밟은 함정 | P60-c/d 봇 한 줄을 같은 페이즈에 · `--no-set/--no-path` 대조군 |
| 6 | 골든 재베이크를 한 커밋에 섞어 원인을 못 가린다 | K36·P3 선례 | 페이즈마다 1회 · 사유 1줄 |

---

## §10 다이어트판 구현 지도 (2026-09-18 확정 — 코드 어디서부터 어디까지 · UI 추가/삭제)

실측 기준(2026-09-18 HEAD `aeba9f5`). 줄 번호는 그 시점이라 흐른다 — 함수 이름으로 찾을 것. **D74 다이어트판**: 새 플레이어 개념은 입수구·경로(코스 완성)·세트·구색 넷, 벌점 0, 새 창 0, 새 저장 상태는 `setsSeen` 하나(optional).

### §10.0 데이터 실측 — 삭제가 닿는 수

| 데이터 | 수 | 무엇 |
|---|---|---|
| `src/data/items.json` | 24 | 소품(색 19 · 향 23 · 온도 3: ice_block·bath_salt·honey 등 `tempDelta`) |
| `wishes.json` 213 중 조건 `item` | 18 | + 조건 `pool`(83) 안의 `color/scent` 하위 조건(64·53) |
| `wishes.json` 보상 `item` | **151** | 가장 큰 덩어리 — 보상을 `rigPart/ingredient/money/facility` 로 재배분해야 한다(`grantWishReward` 분기는 이미 있다 `game.ts` ~490) |
| `certs.json` 24 중 색·향 계열 | 6 (`color_f/d/b` · `scent_f/d/b`) + `spa_d/b` 의 `item` 조건 2 | 보상(부품 4 · 시설 2 · 선물) 은 **바이트 그대로** 옮긴다 |
| `calendar.json` 40 중 `item` 보상 | 15 | 달력 폴백 8년 페이싱의 재료 |
| `shop.json` 43 중 `kind:'item'` | 19 | 장날 진열 |
| `friends.json` 71 `fav.{color,scent,food}` | 71×2 | `fav.food` 는 남는다 — 색·향 취향은 **삭제**(`favHit` 소비자 `guest.ts:660` 하나) |
| `story.json` `rigChain` | 2 | `rigPath` 로 뜻만 |
| 하네스 행 | 12 | §10.6 |
| 단위 검사 파일 | 13 | §10.6 |

### §10.1 P60-a 삭제 (D71) — 파일·함수 단위

**sim (지운다)**
| 파일 | 어디 | 무엇 |
|---|---|---|
| `src/sim/pool-state.ts` (103줄) | 전체 | `color/scent/intensityBars/colorMix/missingForRainbow/scentSource` 를 지우고 **`temp`·`idealTemp`·`tempFit`·`seasonBonus` 만** 남긴다(계절 수온은 P52-c 의 뿌리). `PoolState` 타입에서 색·향 필드 삭제 |
| `src/sim/scent.ts` (20줄) | 파일째 | 삭제. `lines.ts` 의 `COLOR_KO/SCENT_KO` 도 |
| `src/sim/game.ts` | `putItem`(2118) · `removeItem` · `itemDaysLeft`(1446) · `previewItem`(1454) · `isItemUnlocked`(1500) · `poolState` 캐시 안 색 계산(1363~) · `poolLook`(2667) · 사진 `fav` 가산(2674) · `p.likes = 0` 리셋(2131) · `unlocked.items` · 스냅샷 `pools[].items`·`presets` | 전부 삭제. `Pool.items` 필드 삭제, `ItemDef` import 삭제 |
| `src/sim/preset.ts` | 파일째 | 삭제(프리셋은 소품 묶음이었다). `Game.presets` 필드·`savePreset/loadPreset` 삭제 |
| `src/sim/guest.ts` | `favColor/favScent`(80·81·341·367·368) · `favHit`(660~666) | 필드·판정 삭제. 사진 확률의 `favHit ? 0.3 : 0.12` 는 0.12 로. `spawn()` 시그니처에서 두 인자 제거 → `game.ts:803·1536` 호출부 |
| `src/sim/condition.ts` | `case 'item'`(178) · `pool` 조건의 `color/scent/intensity` 하위(143~157) | 삭제. `ConditionKind` 유니언에서 제거 → 타입이 데이터 오류를 잡는다 |
| `src/sim/bot.ts` | `useItems`(40·56) · `itemPass`(235~262) | 삭제. `BotOptions` 에서 필드 제거 → `tools/bot.ts` 옵션 파서·밴드 `itemPass` 삭제 |
| `src/sim/sns.ts` | 사진 글의 색 문구·`favHit` 좋아요 가산 | 삭제 |
| `src/data/schema.ts` | `ItemDef` · `PoolColor` · `Scent` · `FriendDef.fav.color/scent` · `WishCondition.item` · `Reward.kind 'item'` | 타입에서 지운다 — 남은 참조를 컴파일러가 전부 짚는다(손으로 세지 않는다) |
| `src/save/` | `SAVE_VERSION` 4 → **5** | 마이그레이션: `game.pools[].items`·`game.presets`·`unlocked.items` 를 **읽고 버림**(새 판 아님). 검사 `save.test.ts` 에 v4 fixture 왕복 1건 |

**data (바꾼다)**
| 파일 | 무엇 → 무엇 |
|---|---|
| `items.json` | 파일째 삭제 · `manifest`/`pictures.json` 의 `pic/item/*` 24 는 그림 자산이라 **남긴다**(장식·부품 재지정은 미결 ⑤) |
| `certs.json` | `color_f/d/b` → **`set_f/d/b`**(조건 `rigSet` min 1·2·3, 이름 「빠지 세트 심사」 계열, 보상 바이트 동일) · `scent_f/d/b` → **`court_f/d/b`**(조건 `courtSeats`≥4·8·12 + `courtMenuKinds`≥2·3·4, 보상 동일) · `spa_d/b` 는 `item` 조건만 빼고 `facilityAdjacent`(족욕·사우나) 유지. `CertFamily` 유니언 `color→set`, `scent→court`. `FAMILY_KO`(`cert.ts:18`) 「경관」→「세트」, 「핫플」→「먹거리」 |
| `wishes.json` | 조건 `item` 18 → `rigSet`/`rigPath`/`courtSeats` 중 문맥에 맞게 · `pool.color/scent` 하위 조건 → `pool.size` 또는 `rigGrade` · **보상 `item` 151 → `rigPart` 40 · `ingredient` 70 · `money` 30 · `facility` 11**(초안 배분 — 재료 70 은 P56-c 재고 ×3 문법과 맞고, 부품 40 은 공방·개조 소비처가 있다). 스크립트 `tools/migrate-wishes.mjs` 한 번 돌리고 diff 검토 |
| `calendar.json` | `item` 15 → `ingredient`(같은 이름의 재료가 있는 것: lemon·honey·orange·banana·kiwi·grapes·milk·mint·coconut·cinnamon·coffee_beans) · 나머지(ice_block·bath_salt·lavender·seaweed) → `rigPart` |
| `shop.json` | `kind:'item'` 19 → 삭제(장날 43 → 24). 빈 자리는 P56-c 재고 문법대로 `ingredient` 진열 8 추가(초안) |
| `friends.json` | `fav.color/scent` 제거, `fav.food` 유지 |
| `story.json` | `rigChain` 2 → `rigPath` |
| `balance.json` | `ppajiChainBase/Cap` 는 P60-d 까지 유지 |

**UI (삭제)**
| 파일 | 무엇 |
|---|---|
| `src/ui/windows/pool-info.ts` | 타일 3(물빛·분위기·온도 `kptiles`, 101~129)과 그 상세 `kdetail-body` 3 · 「소품 n개 · 남은 일수」 행 · 「이름 변경」은 유지 · 버튼 「소품 넣기 · 편집」→ 삭제 · 「프리셋 저장」 삭제. 온도는 **행 하나**(「수온 24°C · 차가워요」, 계절 파생)로 남긴다 |
| `src/ui/windows/pool-edit.ts` | 모드 `'item'`(타입 유니언 16 · 탭 65 · `itemGrid` 33·77 · `preview` 35·78·94 · `renderItems` 248~273 · `tapItem` · `setMode` 의 item 분기 138~148 · `apply` 의 item 분기) 전부 삭제 → 붓 6 + 행동 **4**(소품 탭 없어짐). `#dock-pool .kitem-grid` CSS 삭제 |
| `src/ui/windows/cert.ts` | 「만점: 농도 n/5」 줄(125~128) 삭제 · `FAMILY_KO` 갱신 |
| `src/ui/windows/sns.ts:191` | 친구 행 「좋아하는 색·향」 → 「좋아하는 음식」만 |
| `src/ui/windows/build.ts` | `SCENT_KO` 분위기 문구(카드 sub) 삭제 |
| `src/ui/windows/facility-info.ts` | `scent` 행이 있으면 삭제 |
| `src/ui/style.css` | `--tile-pool-*` 물빛 토큰 중 색 이름 토큰 · `.kbars`·`.kptile*`·`.kpreview*`·`.kdetail-body` 규칙 삭제(S2 자가 미사용을 안 잡으니 손으로) |
| `src/ui/pictures.ts` | `pictureId('item', …)` 호출부가 0 이 되면 계열 `item` 은 등록부에 남겨도 된다(그림 자산) |

**tests·하네스 (P60-a 에서 함께)**
- 삭제: `color.test.ts` · `pool-detail.test.ts` · `preset.test.ts` · `g30.test.ts`(좋아요 리셋) · `g52.test.ts`(미리보기) · `p49a2.test.ts` 중 물빛 절 · `pool-state.test.ts` 색·향 절(온도 절은 유지) · `condition.test.ts` item 절 · `sns.test.ts` favHit 절 · `cooking-g41.test.ts` 는 요리라 무관(이름만 겹침, 확인) · `data.test.ts` 의 items 검사.
- 하네스 `tools/verify.ts` 행 12 삭제·치환: G3 아이템 탭(273) · G52 미리보기(279) · G3→P49-b 딸기 ×5(296) · 핑크 픽셀(324) · G12 프리셋 저장/복원(692·697) · G30 좋아요 리셋(913) · G42 풀 정보 3행/심사 만점(1034·1036) · G47 타일 3(1077) · G52 미리보기 문구(1129) · P56-a2 소품 카드 격자(1408) · P57-f 의 「소품 독」 화면 목록. 대신 **P60-a 행 3**: 「수역 정보 = 온도 행 1 · 타일 0」 · 「수역 독 탭 = 붓 6 + 행동 4」 · 「인증 24 유지 · set/court 계열 이름 · 보상 바이트 동일」.
- 새 자: `tools/check-items-dead.mjs`(`item`·`scent`·`PoolColor` 문자열이 `src/` 에 0, 그림 등록부 제외) + `--selftest`.
- 골든 재베이크 1(봇의 소품 구매가 사라져 돈 흐름이 바뀐다 — 사유 줄 「P60-a 소품 삭제」).

### §10.2 P60-b 기구도 배를 곯린다 (B1) — 가장 작은 페이즈

| 파일 | 어디 | 무엇 |
|---|---|---|
| `src/data/balance.json` | `hungerPerRig` 신설(초안 12 — `hungerPerSwim 30`·`hungerPerRide 25` 아래, 스릴 ×) | 데이터 |
| `src/sim/guest.ts` | `finishUse`(734) 첫 줄 뒤 | `if (def.class === 'rig' || def.class === 'slide') g.hunger = Math.min(100, g.hunger + this.b.hungerPerRig * Math.max(1, def.thrill ?? 1));` — `menuSlots > 0` 리셋보다 **앞** |
| `src/sim/guest.ts` | `GuestBalance` 타입(159) | 키 추가 |
| 검사 | `guest.test.ts` 신규 절 | 기구 1회 뒤 `hunger ≥ hungerPerRig` · `hungerPerRig=0` 이면 P60-a 골든과 바이트 동일(대조군) |
| 밴드 | `tools/bot.ts` | `foodShare` 중앙이 P60-a 보다 오른쪽(자동 검사는 「이동 > 0」 한 줄) |
UI 변경 0. 골든 재베이크 1.

### §10.3 P60-c 세트 (D72 B) — 데이터 + `computeRigs` + 카드 배지 + 도감

**sim**
| 파일 | 어디 | 무엇 |
|---|---|---|
| `src/data/rig-sets.json` 신설 | — | 8종 초안: `ninja`(rig_bridge·rig_beam·rig_stepstone) · `kids`(rig_mini_slide·rig_kids_park·rig_hammock) · `jump`(rig_blob·rig_iceberg·rig_totem) · `slide3`(rig_slide·rig_slidedock·rig_mini_slide) · `lounge`(rig_hammock·rig_sunbed·floating_bar) · `night`(led_buoy·led_sunbed·floating_bar) · `roll`(rig_roller·waterwalk·rig_seesaw) · `tow3`(선착장 코스 3종 — 견인 축 접점, `courses` 로 판정). 각 `{ id, name, members[3], hidden: boolean }`, `hidden` 4 |
| `src/data/schema.ts` | `RigSetDef` | 타입 + `data.test.ts` 「멤버 3 · 서로 다른 id · 시작 해금 7종으로 ≥1 성립」 |
| `src/sim/rig.ts` | `RigState` 에 `sets: Map<poolId, string[]>` · `computeRigs` 끝(107~112 뒤) | 켜진 기구의 `defId` 집합(개조판은 `baseKind`)과 4이웃 인접 그래프에서 **세 멤버가 서로 인접(경로로 이어짐)** 이면 성립. 같은 세트 둘째부터 무시 |
| `src/sim/game.ts` | `ppajiGradeOf` 옆 `setsOf(poolId)` · 팔찌 `bandPrice` 호출부(`aimPreview` 3053 · `issueBand`) 에 `+50 × sets` · `tilePopSum`(1376) 에 `+6 × sets` · `afterWorldChange`(3230~3250) 의 등급 모달 옆에 **첫 발견**(`setsSeen` 에 없으면 `celebrate` 큐 + 인박스 `pic`) | 값 둘 + 발견 채널 |
| `src/sim/game.ts` | `aimPreview` 반환에 `setNext: string | null` | 카드 배지·확정 바 칩 재료. `computeRigs(overlay)` 가 이미 있으니 한 줄 |
| `src/sim/condition.ts` | `case 'rigSet'`(min = 성립 세트 수) | 인증 `set_f/d/b`·소원 |
| `src/sim/game.ts` 스냅샷 | `setsSeen?: string[]` optional | 세이브 v5 그대로(optional 규칙) |
| `src/sim/bot.ts` | `attachRigs` 후보 정렬 | 「세트 완성 후보(멤버 2/3 이 이미 켜져 있는 것) 우선」 한 줄 · `--no-set` 옵션(대조군) |
| `tools/bot.ts` | 밴드 `rigSetsFound 3~8` | |

**UI (추가)**
| 파일 | 무엇 |
|---|---|
| `src/ui/windows/build.ts` 카드 | `aimPreview` 는 자리를 알아야 하니 카드 배지는 **「이 카드가 어떤 세트의 멤버인지」**만(`rig-sets.json` 역색인) — 배지 텍스트 `세트`(`PictureCard.badge {text}`). 자리별 「+닌자 코스」는 확정 바 칩 |
| `src/ui/windows/place.ts` `refresh` | `aimPreview.setNext` 가 있으면 `.kdock-cost` 칩 「+닌자 코스」(기존 등급/팔찌 칩 옆, 칸 1) |
| `src/render/scene.ts` 고스트 | 세트가 성립할 이웃 기구 위에 별 1개(FX 등록부 이름 `set-star`, 기존 `price-pop` 과 같은 표) |
| `src/ui/windows/rank.ts` 수집 블록 | `col('세트', setsSeen.size, RIG_SETS.length)` 한 줄(G53 「n/N 6줄」 행 → 7줄) |
| 도감 | 새 창 없음 — `rigWin`(기구 개조 창, `cook.ts` `RIG_SPEC`)의 도감 격자 **아래에** 「세트 n/8」 `PictureGrid` 3열(멤버 3 스프라이트 합성은 `canvasPictureEl` 로 첫 멤버 그림, 미발견은 실루엣·`hidden` 은 「?」) |
| `src/ui/windows/celebrate.ts` | 기존 축하 창 재사용(제목 「세트 발견 · 닌자 코스」 + 멤버 그림 3) |
| `src/ui/windows/pool-info.ts` | 행 「세트 k」 1행(타일 3 이 빠진 자리) |
| 하네스 P60-c 행 4 | 「세트마다 성립 배치 존재」(단위) · 「배지 뜬 카드를 놓아 성립 → 축하 1회 + 수집 +1」 · 「새 판 0~5분 모달 ≤ 2」(G11 자 재확인) · 「같은 세트 둘째 값 0」 |
골든 재베이크 1(봇 순서가 바뀐다).

### §10.4 P60-d 입수구 · 경로 (D72 A+C) — `computeRigs` 확장 + 정보창 2행 + 고스트 주행

**sim**
| 파일 | 어디 | 무엇 |
|---|---|---|
| `src/sim/rig.ts` `computeRigs` | 씨앗 판정(63~66) | 씨앗 = 링 접점은 그대로. **입수구** = 링(`FLOOR.deck`) 칸 중 뭍(`guestWalkable` 이고 물·데크가 아닌 칸)에 4이웃으로 닿은 칸들의 **연속 구간 수**를 수역별로 센다 → `RigState.entries: Map<poolId, number>` |
| 같은 함수 | 사슬 컴포넌트(75~99) 자리 | **경로** = 켜진 기구를 입수구 칸에서 BFS 거리 순으로 정렬한 배열(수역별). `RigState.path: Map<poolId, number[]>`(uid 순서) · `pathComplete: Map<poolId, boolean>`(스릴 비감소 ∧ 마지막 `chain==='rest'`) |
| 같은 함수 | `chainLen/chainKinds` | **유지하되 뜻만**: `chainLen` = 그 기구까지의 경로 길이(입수구에서 몇 번째) — `chainScale(len)` 정원 배율이 그대로 「경로가 길수록 정원」이 된다(사슬 개념 흡수, 코드 변경 최소). `chainKinds` = 경로 안 종 수. 등급 함수 `ppajiGrade` 는 **안 바꾼다**(문턱만 `balance.json` 으로: `ppajiGradeThresholds`) |
| `src/sim/game.ts` | `aimPreview` | `pathNext: number`(놓으면 몇 번째) · `completeNext: boolean` 추가 |
| `src/sim/guest.ts` | `finishUse` rig 가지(P60-b 뒤) | 경로 완성 수역의 기구면 `sat` 가산 ×1.25 (`hooks.pathComplete?.(poolId)`) |
| `src/sim/condition.ts` | `rigChain` 뜻 → `rigPath`(경로 길이 min) · 새 `rigPathComplete`(수역 ≥1) | 인증 `stream_b`·소원 7·story 2 의 `rigChain` 키 이름을 `rigPath` 로 일괄 치환 |
| `src/sim/bot.ts` | `attachRigs` | 후보를 「입수구 거리 오름차순」으로, 마지막엔 `rest` 계열 · `growPpaji` 가 입수구 0 이면 라인 조각 1 시도 |
| `tools/bot.ts` | 밴드 `rigPathLen 4~10` · `rigPathCompleteShare ≥ 0.3`(3년차) · `ringEntries ≥ 1` · `rigChainMax` 상한 20 → 10 | |

**UI (추가 · 변경)**
| 파일 | 무엇 |
|---|---|
| `src/ui/windows/pool-info.ts` | 「기구 n」 행 옆에 **「입수구 e · 경로 m/완성 ✓」 1행**(캡슐 값 ≤ 10자 유지: 「1 · 4/✓」) — P59-c 힌트 줄에 「입수구에서 멀수록 스릴, 끝은 휴식이면 완성」 |
| `src/ui/windows/place.ts` | 확정 바 칩 「경로 3→4」(값이 바뀔 때만) · 완성이 되는 배치면 「코스 완성 ✓」 |
| `src/render/scene.ts` | **고스트 손님 주행**: 조준 중 `aimPreview.pathNext` 가 있으면 v8 손님 하나가 입수구 칸 → 기존 경로 → 고스트 칸을 1.2초에 걷는 FX(등록부 이름 `path-walk`, 트윈은 등록부 안에서만 — S9). 조준 칸이 바뀌면 다시 |
| `src/render/scene.ts` | 입수구 칸 표시: 배치 중 링의 입수구 칸에 작은 사다리 표식(FX `entry-mark`, 아이콘은 사용자 에셋 자리 — 없으면 절차 폴백 「▽」) |
| `src/ui/hud.ts` 목표 A 문구 | 「빠지에 기구를 하나 붙이자」 → 「사다리 옆에 기구를 붙이자」(`goalLine` 폴백 문자열, `main.ts`) |
| 결산 `results.ts` | 병목 처방에 「입수구가 하나 — 라인 조각으로 늘리자」는 **넣지 않는다**(동시 입수 정원을 보류했으므로 근거가 없다) |
| 하네스 P60-d 행 5 | 「킷 입수구 1 · 라인 조각 하나 뒤 2」 · 「경로 = BFS 순서(단위 항등)」 · 「스릴 비감소 + 끝 rest = 완성」 · 「확정 바 칩 ≤ 1칸 · 정보창 +1행」(브라우저) · 「FX `path-walk` 등록부 이름 1」(정적) · **사람 확인 H71**: 고스트 주행만 보고 순서를 알겠나 — 아니면 경로를 접고 세트만 남긴다 |
골든 재베이크 1.

### §10.5 P60-e 좌석 vs 서서 + 구색 (D73 B2·B4) — 푸드코트 P58-b/c 닫기

| 파일 | 어디 | 무엇 |
|---|---|---|
| `src/sim/guest.ts` `afterUse`(756~764) | `carry` 가지 | `nearestLounge` 를 **반경 3(`Game.SEAT_RADIUS`) 안**으로 먼저 찾고, 없으면 `standEats` 훅 + `EAT_TICKS` 12 → 8 + 만족 가산 0. 먼 좌석(>6칸) 은 잡지 않는다(왕복 감점 방지) |
| `src/sim/game.ts` | `stats.standEats` · `onStandEat` 훅 · `seatGradeAt`(826) 의 `food` 불리언 → **카테고리 수 k**(`menuSlots>0` 시설의 걸린 메뉴 `recipes.json` 분류 집합) · `grade += Math.floor(k/2)` | 구색. 킷은 2/4 |
| `src/sim/game.ts` `afterWorldChange` | 「풀코스 푸드코트」(k=4 인 푸드코트 영역이 처음) → `celebrate` 1회 + 인박스 | 발견 채널 |
| `src/sim/condition.ts` | `courtSeats`(총 좌석) · `courtMenuKinds`(최대 k) | 인증 `court_f/d/b` |
| `src/sim/foodcourt.ts` | `seatsOf(courtId)` 는 있음 · `menuKindsOf(courtId, facilities)` 추가 | 정보창 값 |
| `src/sim/bot.ts` | `growFoodCourt`: 어제 `standEats/eats > 0.3` 이면 3×2 블록 +1(주 1회) · 식당 자리 정책에 「카테고리 다양성」 한 줄 | |
| `tools/bot.ts` | 밴드 `standShare 0.1~0.4` · `courtSeats`(RunMetrics) · `courtMenuKinds ≥ 3`(3년차) | |
| **UI** `src/ui/windows/results.ts` `showDay` | 「서서 먹은 손님 s% — 식탁 4석 더」 1행(문턱 0.3, 처방 문구는 `kfac-hint` 스타일이 아니라 `.krow` 값 ≤ 10자 + 힌트 줄) | 결산 |
| **UI** 푸드코트 정보창(`facility-info.ts` 의 파생 식탁 분기, P58-a) | 「좌석 n · 오늘 식사 m · 서서 s% · 메뉴 k/4」 4행(캡슐 값) | |
| **UI** 밤 식탁(D7) | `syncNightSet`(`game.ts:3132`) 필터에 `FOODCOURT_SEAT_DEF` 한 항 | P60-f 에서 옮겨 온다(한 줄) |
| 하네스 P60-e 행 4 | 「좌석 0 이면 서서 100%」 · 「킷 4석 첫날 서서 ≥ 1」 · 「k=4 → 등급 +2」 · 「결산 줄 실터치」(P3-C④ 규칙) · 파생 좌석 `derived` 술어 제외 유지(단위) |
골든 재베이크 1.

### §10.6 페이즈 순서·게이트 번호·시간 (다이어트판)

| P | 게이트 | 재베이크 | 예상 |
|---|---|---|---|
| P60-a 삭제 | `p60a` 160.1 | 1 | 1.5일(대부분 데이터 이관 + 하네스 12행) |
| P60-b 배고픔 | `p60b` 160.2 | 1 | 0.5일 |
| P60-c 세트 | `p60c` 160.3 | 1 | 1일 |
| P60-d 입수구·경로 | `p60d` 160.4 | 1 | 1.5일(고스트 주행 FX 포함) |
| P60-e 좌석·구색 | `p60e` 160.5 | 1 | 1일 |
| (보류 바구니) | — | — | 밴드 실측 뒤: 점심 휴식 토글 · 동시 입수 정원 · 역순 벌 · 식권 · 철거 −25% · `rigAt` 소원 · 어린이 2칸 |

순서줄: `P60-a → P60-b → P60-c → P60-d → P60-e`. H71(고스트 주행 가독) 이 ✗ 면 P60-d 의 경로를 접고 세트만 남긴다 — 그때 `chainLen` 뜻은 옛 「같은 계열 사슬」로 되돌린다(코드 한 함수).

## §7 미결 (사용자)

| # | 물음 | 권고 | 언제까지 |
|---|---|---|---|
| ① | **링 위 식탁**(R5 R2 「식탁 영역이 링에 붙는다」 = 「기구가 덱에 붙는다」의 먹거리판) — D2 「실내 전용」과 충돌한다. 넣을까 | 넣는다면 P60-e 뒤 별도 페이즈(붓 문법은 같아 UI 0) · 이번엔 실내 유지 | P60-e |
| ② | 온도를 **소품만 빼고 계절 수온은 남기는** D71 안 vs 온도 축 전부 삭제 | 남긴다 — P52-c 야외 입수·사철 인증의 뿌리, 실제 강물의 물성 | P60-a |
| ③ | 세트에 **상성 감점**(스릴 옆 휴식 −, 키즈 옆 점프 −)을 둘까 — R5 「없으면 도배가 정답」 vs R2·R3 「카이로 배치 콤보는 양수만」 | 이번엔 양수만 — 도배는 「둘째부터 0」 + `open` 유입(R7) + `chainScale` cap 이 이미 막는다. 밴드 실측 뒤 재론 | P60-c |
| ④ | 점심 휴식을 **토글**(값을 매긴다)로 둘까 **항상 켬**으로 둘까 | 토글 — 실지도 업체마다 다르고 「기구가 쉰다」가 결정이 된다 | P60-e |
| ⑤ | 소품 그림 24장 처리 — 폐기 vs 부품·장식 그림으로 재지정 | 조명 3·반사판·물레방아·장작·온수관 8장은 부품·장식으로, 나머지 폐기 | P60-a |
| ⑥ | 팔찌 = 식권(B6) — 팀 팔찌에 식사 1회를 넣으면 `ppajiPkgShare` 재보정 | 넣는다(실지 BBQ 패키지가 이 층) — P60-f | P60-f |
| ⑦ | 좋아요 리셋의 후계 「철거 시 −25%」 — 벌이 필요한가 | 넣는다(「완성 빠지를 갈아엎는 비용」 의도 유지) · 개조는 면제 | P60-f |
| ⑨ | 링 위에 무엇을 놓느냐(플로팅 바·거치대·망루)를 기구 값에 넣을까 — 지금은 등급 `n` 에 +1 뿐(R1 a-5) | 세트 재료로만(라운지·밤빠지 세트가 플로팅 바를 쓴다) — 별도 값은 두지 않는다 | P60-c |
| ⑩ | jump 계열(트램폴린·블롭·아이스버그·타워·원반)에 `chain` 을 줄까 — 지금 `cat:'jump'` 만 있어 잇는 값 0 | 준다(계열 셋 → 넷, `CHAIN_KINDS` 데이터) — 등급 3 의 `chainKinds≥3` 문턱이 넓어지므로 `rigGradeMax` 재측정 | P60-d |
| ⑧ | 보류 6(대기 물 C3 · 요원 정원 절반 C5 · 오후권 C6 · 개조 오라 · 설계도 판매 · 배달·유료 좌석·BBQ·위생) 중 다음 라운드로 올릴 것 | C3 대기 물(저장 0·값 공짜) → C5(A/B 필요) 순 | P60-f 뒤 |

닫은 것(근거 있음): 색 → 기구 계열 **재매핑**(R2 §1.3-5, 필드 이름만 바꾸는 안)은 **안 한다** — 「보이지 않는 상태」 문제가 그대로 남는다(R5 §1 (a)) · 견인 축(C7)은 §15 · 새 동사 0 · 그림 생성 제안 0(사용자 전제 ④).

---

## §8 근거 URL

- [1] https://kairosoft.wiki.gg/wiki/Pool_(Pool_Slide_Story) · [2] https://kairosoft.fandom.com/wiki/Pool_(Pool_Slide_Story) · [3] https://shippobox.com/archives/4074 · [4] https://kairosoft.wiki.gg/wiki/Facilities_(Pool_Slide_Story) · [5] https://wikiwiki.jp/kairoparknew/pool/08 · [6] https://kairosoft.wiki.gg/wiki/Pool_Slide_Story · [7] https://wikiwiki.jp/kairoparknew/pool/01 · [8] https://kairosoft.wiki.gg/wiki/Customers_(Pool_Slide_Story) · [9] https://kairosoft.wiki.gg/wiki/Compatibilities_(Pool_Slide_Story) · [10] https://steamcommunity.com/app/1933980/reviews/?browsefilter=toprated · [11] https://kairosoft.net/game/appli/pool.html
- [12] https://kairosoft.wiki.gg/wiki/Combos_(Mega_Mall_Story) · [13] https://kairosoft.wiki.gg/wiki/Combos_(Mega_Mall_Story_2) · [14] https://kairosoft.wiki.gg/wiki/Combos_(Dream_Town_Story) · [16] https://kairosoft.wiki.gg/wiki/Combos_(Dream_Town_Island) · [17] https://kairosoft.wiki.gg/wiki/Spots_(Pocket_Academy) · [19] https://kairosoft.wiki.gg/wiki/Compatibilities_(World_Cruise_Story) · [20] https://kairosoft.wiki.gg/wiki/Combos_(Pocket_Harvest) · [21] https://kairosoft.wiki.gg/wiki/Structures_(Beastie_Bay) · [23] https://kairosoft.wiki.gg/wiki/Parts_(Grand_Prix_Story) · [25] https://kairosoft.wiki.gg/wiki/Recipes_(Cafeteria_Nipponica) · [27] https://kairosoft.wiki.gg/wiki/Compatibilities_(Burger_Bistro_Story) · https://kairosoft.wiki.gg/wiki/Fixtures_(Burger_Bistro_Story) · https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Burger_Bistro_Story) · https://kairosoft.wiki.gg/wiki/Transcript:Manual_(Cafeteria_Nipponica)
- 실지 빠지: https://blueshark.kr/ · https://www.waterplayno1.com/ · https://www.clubvivaldi.com/ · http://www.riverpoint.co.kr/ · https://www.where-bbazi.kr/ · https://m.blog.naver.com/joeyfromseoul/224327165483 · https://m.blog.naver.com/41894/224410847046 · https://m.blog.naver.com/ramisssdiary/224382175045 · https://m.blog.naver.com/yourufp/223560313734 · https://m.blog.naver.com/pl5to/224374098844 · https://blog.naver.com/eun1197/224337704338 · https://blog.naver.com/kyu_will/223529121050 · https://blog.naver.com/viviankk/224350013651 · https://blog.naver.com/howworld2/224374393786 · https://blog.naver.com/maeno94/224092916382 · https://blog.naver.com/nstartkkh/224363514593
- 안전·설계: https://www.law.go.kr/LSW/lsInfoP.do?efYd=20200228&lsiSeq=215321 · https://www.sedaily.com/article/14099679 · https://biz.heraldcorp.com/article/10542801 · https://www.hoverstar.com/blog/how-to-design-and-operate-an-inflatable-water-park-safely · https://www.aquaglide.com/pages/aquaglide-aquapark-designs · https://www.wibitsports.com/all-modules/ · https://www.wibitsports.com/wibit-watchline/ · https://hushineinflat.com/blog/custom-inflatable-aqua-park-guide/
- 타이쿤: https://github.com/OpenRCT2/OpenRCT2/wiki/Ride-rating-calculation · https://github.com/YAL-Game-Things/Parkitect-guide/blob/main/0400-Immersion.md · https://parkitect.fandom.com/wiki/Guests · https://gamerant.com/planet-coaster-2-increase-attraction-prestige-improve-ride-prestige-pc2/ · https://www.planetcoaster.com/player-guides/guests · https://outof.games/realms/rollercoastertycoon/guides/541-guide-to-food-and-drink-stalls-in-rollercoaster-tycoon-1-and-2/ · https://docs.openrct2.io/en/latest/playing/shops_and_stalls/ · https://two-point-hospital.fandom.com/wiki/Salty_Snacks_Machine · https://en.wikipedia.org/wiki/Waterpark_Simulator
- 로컬 정본: `docs/plan-ppaji-water.md`(§1.5~1.6 · §3.7~3.9 · §4.4~4.5 · §8) · `docs/plan-ppaji-story.md`(§9 D29~D33 · §14.2) · `docs/plan-ppaji-foodcourt.md`(D1~D8 · §5) · `docs/design.md`(동사 6개) · `docs/research/pss-gap-proposal.md` · `docs/research/pss-facilities-systems.md:143~237`
- 코드: `ppaji/src/sim/{rig,facility,game,guest,bot,foodcourt,pool-state,color,scent,condition,wristband,accident,rig-upgrade,clock,combos,restaurant}.ts` · `ppaji/src/data/{items,seasons,certs,wishes,friends,shop,calendar,combos,rigs,rig-parts,wristbands,packages,facilities,balance,recipes}.json` · `ppaji/src/ui/windows/{pool-info,pool-edit,facility-info,cook,sns}.ts` · `ppaji/tools/{bot,verify,gate,check-plan.mjs}` · `ppaji/src/save/save.ts:9`

---

## §9 이력

- 2026-09-18 **P60-a 통과(`gate -- p60a`, 274)** — 병렬 3(데이터·sim·UI/봇/세이브) + 통합 1 · 네 번 돌림: ① `check-pictures` 가 지워진 `items.json` 을 읽음 → 옛 소품 그림 24 는 폴더에서 센다 ② G5(재료 진열이라 해금 대신 재고 +)·G30(kit=0 판의 유일한 유지비가 소품이었다 → 시설 하나 놓고 잼)·G35(조건 축 4 → 3)·G49(소원 돈 보상 30% > 10% → 이관 규칙 3차: 새 돈 0, 재료 117·부품 58, 같은 친구 안 id 만 다르게) ③ 골든·p48a fixture 재베이크(방문 477/488/508) · P13 시드 3 → 6(소품 지출이 사라져 balanced 가 장비를 더 산다). 밴드 52/52 · 세이브 v5(읽고 버림) · `check-items-dead.mjs` 신설. 미결 ⑤(소품 그림 24)는 자산으로 남김.
- 2026-09-18 사용자 「다이어트판이 낫다」 → D74 다이어트판 확정, §10 구현 지도 추가(파일·함수 단위 · UI 추가/삭제 · 데이터 이관 수 실측: 소원 보상 `item` 151 이 가장 큰 덩어리). 보류 바구니 8.

- **2026-09-18 초안**: 사용자 요청(「풀 색은 빼고 · 기구×플로팅덱 조합과 푸드코트로 · 게임적·타이쿤적·카이로적 요소 · 에셋은 만들고 있다」)을 받아 조사 다섯(R1 현황 실측 · R2 카이로 12작품 조합 문법 · R3 가평·청평 실지 5형 + 타이쿤 8종 규칙 · R4 실지 음식 문화 + 게임 8종 + 규칙 6 · R5 설계 비평 + 채점표 4)을 통합했다. 결정 후보 D71~D73 · 페이즈 P60-a~f · 게이트 6절 · 미결 8. 코드 0줄 · 그림 제안 0.
  ⚠ 조사 간 불일치 셋을 그대로 남겼다: ① 소원 조건 수(75 / 74 / 32 — §5) ② 상성 감점 필요 여부(R5 vs R2·R3 — 미결 ③) ③ 향의 후계(R2 「최다 기구 종」 vs 본 계획 「푸드코트 구색」 — 향은 시설 34종이 계속 주므로 「향 인증」 이름을 살릴 이유가 없어 후자를 택했다).
  ⚠ 두 정본의 충돌(v5 §7 ⑬ 「소품 유지」 vs §14.2 「삭제」)은 D71 이 **삭제** 쪽으로 닫는다 — 사용자 확정 뒤 `plan-ppaji-water.md` §7 ⑬ 에 한 줄 추가할 것.
