# 정적 조합 시설 MAIN 반입 · 카탈로그 정리 (2026-09-19)

대상 MAIN: `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon` (기준 HEAD `da38256`).
출처: `에셋만들기_v3` 워크트리, 인계 문서 `docs/assets/handovers/2026-09-19-ppaji-watercraft-merge.md`,
정본 패키지 `assets/generated/kairo-v4-simple-pilot/ppaji-buildable-pair-v2` · `ppaji-boarding-2x1-v1`.

사용자가 **저자 에셋 우선**과 **대체된 항목의 연결 제거**를 명시 승인했고, 코디네이터가 옵션 **A**(숨기기 +
연결 재배선)를 지시했다. 이 문서는 무엇을 넣었고, 무엇을 끊었고, **무엇을 호환용으로 남겼는지**를 적는다.

---

## 1. 반입한 것

### 1.1 공개 에셋 — `ppaji/public/assets/approved-facilities/`

| 경로 | 내용 |
|---|---|
| `manifest.json` | 계약 정본(화면 쪽) — 크기·발자국 원점·피벗·앵커·데크 마스크·입출구·프레임 SHA256 |
| `routes.json` | 구운 NPC 동선 (schema 2) |
| `ppaji_slide/native-d0..3.png` | 256×256 네이티브 4방향 (저자 렌더 그대로) |
| `ppaji_playground/native-d0..3.png` | 640×640 네이티브 4방향 |
| `boarding_dock/native-d0..3.png` | 128×128 네이티브 4방향 |
| `*/blueprint.json`, `boarding_dock/access.json` | 저자 청사진(절대 경로만 씻었다) |

같은 폴더의 `*/full-d*.bin` · `ppaji_slide/slide-d*.bin` · `depth-manifest.json` 은 원본 모델에서 산출한 깊이 마스크다.

### 1.2 공급자 — `ppaji/src/assets/approved-facilities.ts` (신규)

- `loadApprovedFacilities(base = './assets/approved-facilities'): Promise<ApprovedFacilityProvider | null>`
  - `AssetProvider` 를 구현한다. `fac/<id>/<0..3>` 논리 ID 로 프레임을 낸다.
  - 실패하면 **예외가 아니라 null** — 에셋 하나 때문에 부팅이 죽지 않는다.
  - `?approved=0` 이면 안 읽는다 (음성 대조군).
  - 그림은 **픽셀만** 준다. 크기·앵커의 정본은 manifest 이고, 선언과 다른 PNG 는 로딩에서 던진다.
- 씬 위치 어댑터 (순수 함수 — 씬을 모른다):
  - `approvedAnchor(id, manifest) → {ax, ay}` · `approvedPivot(id, facing, manifest) → [di, dj]`
    · `approvedFootprint(id, facing, manifest) → [w, d]` · `approvedFrameId(id, facing)`
- 동선 어댑터: `approvedSampleAt(track, tSeconds)` · `approvedSampleToTile(id, facing, sample, i0, j0, manifest)`
  · `approvedVisitForGuest(routes, uid, useSeconds?)` · `useTicksToSeconds(useTicks)` · `rotateTile(i, j, facing)`

### 1.3 시설 정의 — `ppaji/src/data/facilities.json`

| id | 이름 | 칸 | 값 | 인기 | 유지 | 정원 | useTicks | 해금 |
|---|---|---|---|---|---|---|---|---|
| `ppaji_slide` | 빠지 슬라이드 | 8×6 | 2,700 | 30 | 159 | 7 | 146 | 시작 |
| `ppaji_playground` | 빠지 놀이터 | 20×12 | 18,600 | 205 | 1,086 | 33 | 211 | ★3 |
| `boarding_dock` | 승하선 데크 | 2×1 | 2,900 | 33 | 175 | 2 | 8 | 시작 |

**값의 유도** (전부 호스트의 기존 눈금에서 나왔다 — 새 상수 0):

- `cost`·`pop` = **구성품 합**. 놀이터 = 13종 합(18,600 / 205) → `cost/pop = 90.7` 로 밴드 [60, 140] 안이고
  회귀값 90 과 사실상 같다. 슬라이드 = `rig_slide + rig_bridge + rig_stepstone` (2,700 / 30 → 정확히 90).
  승하선 데크 = `dock + float_deck` (2,900 / 33 → 87.9).
  ⚠ **데크 구조물을 `float_deck` 단가로 따로 매기지 않았다.** 놀이터의 데크 75칸을 시설 단가로 세면
  `cost/pop` 이 310 이 되어 밴드를 벗어나고, 인기 730 은 현행 75종 총합(2,020)의 36% 가 된다.
  데크는 **예약한 발자국의 일부**이지 별도 시설이 아니다.
- `maint` = `round(pop × 5.3)` (호스트 회귀), `shopPrice` = `cost × 2.2` (호스트 회귀).
- `capacity` = 구성품 정원 합. `hpDelta`·`thrill` = **정원 가중 평균**(반올림).
  `safe = 2 − floor(thrill/2)` (호스트 규칙). 둘 다 thrill 2 · safe 1 로 떨어졌다.
- `useTicks` 만은 정원 가중 평균이 아니라 **구운 동선 길이**에서 나왔다 (코디네이터 요구):
  `useTicks = 초 / (TICK_SCALE × TICK_MS) = 초 / 0.291667`. 슬라이드 42.7s → 146, 놀이터 평균 방문 61.6s → 211.
  `src/data/composites.json` 의 `routeUseTicks` 와 검사로 묶여 있다.
- `depth: 'any'` · `needsVest: false` — 호스트 불변식은 `needsVest ⇔ deep` 이다. 조합은 얕은 곳과 깊은 곳을
  같이 덮으므로 `any` 로 두고 조끼를 요구하지 않는다. **원래 `deep` 이던 구성품(토템·원반·트램폴린)의
  조끼 요구가 조합 안에서는 사라진다** — 밸런스 판단이 필요하면 여기다.
- 놀이터는 `maxPerPark: 1`, `bandCost: 2`, `lights: true`다. 폐기 원반의 관련 시스템 역할을 이어받는다.

### 1.4 데크 마스크 · `walkOn` — `ppaji/src/sim/rig.ts` + `ppaji/src/data/composites.json` (신규)

조합의 발자국은 **열린 수면까지 예약**한다. `computeRigs` 가 발자국 전체를 `walkOn` 으로 켜면 손님이
물 위를 걷는다 (코디네이터 지적). 이제 조합은 **저자가 놓은 데크 칸만** 켠다.

- 마스크는 **데이터**다 (`composites.json` 의 `deckTiles`, 불변식 3) — 그림이 바뀌면 코드가 아니라 그 파일이 바뀐다.
- facing 0 기준 발자국 로컬 정수 칸이고, facing 1 회전은 발자국·피벗·그림과 **같은 규칙** `(i,j) → (j, w−1−i)`.
- 칸 판정: 저자 데크 사각형이 그 칸의 **50% 이상**을 덮으면 데크. (가장자리에서 과다 포함이 날 수 있는데,
  과소 포함이 통행을 끊는 것보다 안전한 방향이다.)
- 실측: 빠지 슬라이드 **18/48**, 빠지 놀이터 **83/240**, 승하선 데크 **2/2**(단일 모듈이라 예전과 같다).
- 음성 대조군: `composite.test.ts` 가 "발자국 전체였다면 48" 을 같이 잰다.

### 1.5 동선 (`routes.json`, schema 2)

- **모든 경로가 청사진 `entry` 칸에서 시작해 같은 칸에서 끝난다.** 저자 원본은 시설 안쪽(−1.6, 3)에서
  시작해서 손님이 순간이동했다 (코디네이터 지적). 입구 접근·복귀 구간을 저자 **연결 데크 그래프**
  (연결 데크 75 + 승하선 데크 2×2) 위 BFS 최단 경로로 0.6칸/초에 걷도록 앞뒤에 붙였다.
- **구간 목록**으로 굽는다 (20fps 표본 박기 대신). 원본과 **같은 보간식**을 들고 다니므로 어떤
  프레임레이트에서도 정확하다. 구간마다 `ease`(linear|smooth)·`mode`(quad|quartic)·`arc` 가 있다 —
  ⚠ 저자 모듈이 실제로 서로 다르다: `core` 는 smooth + `arc·16u²(1−u)²`, `traversal`/`leisure` 는
  smooth + `arc·4u(1−u)`, `waterplay` 는 **선형** + `arc·4u(1−u)`. 하나로 뭉뚱그리면 0.19칸 어긋난다(실측).
- **충실도 실측**: 구운 구간 보간 vs 저자 `sample()` 을 0.05초 간격으로 대조 — 최대 오차
  슬라이드 **0.000334칸**, 구성품 **0.000500칸** (셋째 자리 반올림 몫).
- 담긴 것: `tour`(전부 도는 완주 — 슬라이드 42.7s · 놀이터 367.2s) · `visits`(구성품마다 왕복,
  놀이터 12개 30.6~119.5s, 평균 61.6s) · `actors`(v1 호환 꺾은선 — 구간 시작점을 꿴 것).
- 승하선 데크에는 동선을 안 넣었다 — 저자 동선이 검토 하네스 전용이고 게임의 탑승은 CourseRideStore 소유다.

---

## 2. 최종 카탈로그 (2026-09-19)

### 2.1 숫자

| 항목 | 값 | 비고 |
|---|---|---|
| 시설 정의 | **181** | 폐기 29 포함 (옛 세이브 호환으로 남긴다) |
| 폐기(조합 흡수) | **29** | 흡수된 원종 14 + 그에 걸렸던 개조판 14 + 옛 선착장 `dock` 1 |
| 살아 있는 `class rig` | **10** | `diving` · `turtle_island` · `ppaji_slide` · `airbounce` · `rig_bridge` · `rig_stepstone` · `rig_blob` · `rig_iceberg` · `rig_jump_tower` · `ppaji_playground` |
| 링 위 비-rig | **11** | `boarding_dock`(시작) · 대여소 4 · `slide_tube` · `float_deck` · `watchtower` · `rig_rack` · `rig_float_bar` · `rescue_dock` |
| 건설 창 「빠지」 탭 | **21** | 위 10 + 11 |
| `buildable:false` | **35** | 살아 있는 개조판 6 + 폐기 29 |
| 개조 레시피 | **6** | 시작 2(`up_bridge_swing`·`up_blob_big`) · 2단 1(`up_bridge_long`) |
| 기구 부품 | **9** | 연차 3(`speaker_horn` y5 · `mooring_rope` y5 · `ramp_deck` y6) · **전부 레시피가 쓴다** |
| 그림 | **390**(등록부) + 장면 배경 4 = 갤러리 **394**장, 빠진 그림 0 |

`lights` · `bandCost: 2` · `maxPerPark: 1` 은 회전 원반 → **빠지 놀이터**로 옮겼다 (원반은 폐기라 필드가
화석으로 남는다 — 검사는 **살아 있는 것만** 센다). `boarding_dock` 은 **시작 해금**이고 옛 `dock` 은 폐기다.

### 2.2 보상 재배치 (코디네이터 승인 A안)

`ppaji_playground` 는 랭크 3 해금인데 다섯 곳이 그것을 **보상**으로 주고 있었다 — 이미 가진 것을 또 주는
죽은 보상이고, 「소원/인증이 주는 시설은 그 출처로 열리는 시설이어야 한다」는 도달성 규칙도 깼다.
랭크 3 해금은 그대로 두고 보상만 **살아 있는 레시피가 쓰는 부품**으로 옮겼다.

| 자리 | 전 | 후 |
|---|---|---|
| 소원 `famous_painter/2` | 시설 `ppaji_playground` | 부품 `safety_net` (대사도 같이 고쳤다) |
| 인증 `set_b` | 시설 `ppaji_playground` | 부품 `anchor_chain` (2단 다리 사슬의 열쇠) |
| 인증 `court_d` | 시설 `ppaji_playground` | 부품 `pump_motor` (방수천과 짝 — 와일드 블롭) |
| 달력 6년차 겨울 | 시설 `ppaji_playground` | 부품 `safety_net` (제목·본문 변경, 이벤트 ID 유지) |
| 달력 7년차 겨울 | 시설 `ppaji_playground` | 부품 `pump_motor` (제목·본문 변경, 이벤트 ID 유지) |
| 인증 `court_f` | 부품 `slip_wax`(은퇴) | 부품 `float_drum` |

검사도 같이 조였다 — **인증이 주는 부품은 전부 살아 있는 개조 레시피가 쓴다**를 `data.test` 가 새로 잰다
(죽은 열쇠 0). 인증 부품 보상은 9 → **11**, 인증 시설 보상은 아이스버그 **하나**만 남는다.

### 2.3 세트 8종 — 전부 성립 가능, 비-rig 0

| id | 멤버 | 숨김 |
|---|---|---|
| ninja | `rig_bridge` · `rig_stepstone` · `ppaji_slide` | 아니오 (셋 다 **시작 해금** — 실제 배치·성립 확인) |
| kids | `ppaji_playground` · `rig_stepstone` · `float_deck` | 아니오 |
| slide3 | `ppaji_slide` · `slide_tube` · `diving` | 아니오 |
| lounge | `turtle_island` · `rig_float_bar` · `rig_rack` | 아니오 (**바뀜** — 실제 배치·성립 확인) |
| jump | `rig_blob` · `rig_iceberg` · `ppaji_playground` | 예 |
| night | `ppaji_playground` · `rig_float_bar` · `watchtower` | 예 |
| roll | `ppaji_playground` · `rig_jump_tower` · `rig_blob` | 예 |
| trio | `airbounce` · `turtle_island` · `ppaji_slide` | 예 (**바뀜**) |

세트는 한 수역에 필요한 시설이 함께 들어갈 공간을 요구한다. 작은 수역에서도 성립 가능한 lounge와
놀이터를 요구하지 않는 trio로 구성했다. 모든 멤버는 `class rig` 또는 `onRing`이다.

코디네이터의 실제 지형 검증에서는 **시작 킷을 철거하지 않고** rank 5 허가에서 링 (36,31)·안 물 20×12,
놀이터 (37,32)를 공개 배치 API로 만들 수 있었다. `composite-access.test.ts`는 손님이 (48,23)에서
저자 입구 (37,38)까지 걸어와 이용하는 것도 검증한다. 초기 작업자의 '킷 철거 필수' 판단은 잘못된 것이었다.

### 2.4 남은 한계 (되돌리지 말고 **알고** 있을 것)

1. **등급 4(시그니처)는 킷 규모 빠지에서 구조적으로 못 만든다.** 문턱은 `n ≥ 14 · kinds ≥ 6 · lights ≥ 1`
   인데 살아 있는 `lights` 시설이 **빠지 놀이터(20×12)** 하나뿐이다. 규칙 자체는 `p52c` 가 순수
   `ppajiGrade` 로 재고 **조명 0 이면 3** 이라는 음성 대조군을 같이 둔다.
2. **`rest` 계열 경로를 초반에 못 만든다.** 살아 있는 rest 는 `turtle_island`(8×6) 뿐이라 킷 빠지(안 물 4×5)에
   안 들어간다. `p50b1` 은 「계열이 다른 기구도 같은 경로에 든다」를 **계열 없는**(`chain: null`) 블롭 점프로
   잰다 — 규칙은 그대로, 재는 재료만 바꿨다.
3. **연차 부품에 물린 개조가 6 → 3 으로 줄었다** (P19 의 「공방 발견을 8년에 펼친다」가 절반). 대신 `p51` 이
   **연차 부품 3종이 전부 쓰인다**를 새로 못박아 죽은 연차 부품이 남지 않게 했다.
4. **빠지 놀이터는 랭크 3 해금과 별도로 충분한 수역·허가가 필요하다.** 시작 킷 철거는 필수가 아니다.
   기존 자연 지형을 보존하며 더 큰 허가에서 배치한 경로를 검증했다.
5. 세트 8종 중 4종이 `ppaji_playground` 를 든다(`maxPerPark: 1`). 한 판에 놀이터가 하나뿐이므로 그 넷은
   **같은 수역**에서만 겹쳐 성립한다.

### 2.5 검증

```
npx tsc --noEmit                                   # 깨끗
npx eslint <내가 고친 13개 파일>                     # 깨끗
npx vitest run --poolOptions.forks.maxForks=1 <아래 17개 파일>   # 158 통과 / 0 실패
  data.test 85 · p10 4 · p5 3 · p19 3 · p57b 3 · pictures 2 · p21 4 · p48c 3 · p49a1 9 ·
  p50b1 5 · p51 6 · p52c 4 · p56c 7 · p60c 10 · composite 3 · build 1 · rig-sets 6
node tools/pictures/gallery.mjs public/pictures-gallery.html   # 394장 · 빠진 그림 0
```

**검사를 헐겁게 하지 않았다** — 개수를 줄인 자리마다 대신 **목록**이나 **죽은 것 0** 을 박았다:
건설 「빠지」 탭은 개수 대신 21개 id 목록 · 폐기 29종은 전부 `buildable:false` ∧ 레시피 없는 `craft` ∧
보상·투자·장날 어디에도 없음(`p10` 의 새 음성 대조군) · 개조 레시피는 살아 있는 원종만 가리킴 ·
부품 9 와 연차 부품 3 은 전부 쓰임 · 인증 부품 보상도 전부 쓰임 · 랭크·소원 해금 목록에 폐기 0.

기존 세이브에 배치된 폐기 시설은 정의를 유지한다. 신규 건설·레시피·해금·보상 연결은 제거했고, 옛 선착장은 안전한 빈 인접 데크가 있을 때 같은 UID의 2×1 승하선 데크로 마이그레이션한다. 달력 이벤트 ID는 완료 기록 호환을 위해 유지한다.


## 3. 최종 연결 검토

- 선착장 인접 콤보 4종과 인증 `stream_d`/`stream_b`, 소원 `cosmetician/2`의 조건을 `boarding_dock`으로 연결했다.
- 구성원이 사라진 `small_slide_slidedock`은 한 항목짜리 콤보로 남기지 않고 삭제했다. 현재 인접 콤보 39개는 모두 활성 시설 두 개로 구성된다.
- `packages.needsInRadius`의 `dock`은 시설 ID가 아닌 수요 분류이므로 유지한다. 판정은 `COURSE_DOCK_IDS`와 실제 코스 연결을 사용한다.
- `data.test.ts`는 콤보 쌍의 길이·유효 ID와 소원/인증의 중첩 조건 전체에 퇴역 시설 참조가 없는지 검사한다.
- `p54.test.ts`에서 기존 지형에 22×12 수역, 놀이터 및 활성 기구만 배치해 등급 4·야간 파티·조명 매출 1.1배를 검증했다. 놀이터 제거 시 야간 자격이 사라지는 음성 대조군도 있다. 기존 구형 시설의 야간 저장 호환은 별도 inherited fixture로 검증한다.
