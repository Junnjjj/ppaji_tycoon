# 메인 게임 — 움직이는 수상기구 실제 운항 통합 (P61-a)

2026-09-19. 대상: **MAIN** `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon` (HEAD `da38256`).
인계 정본: `docs/assets/handovers/2026-09-19-ppaji-watercraft-merge.md`.
원본 재사용 모듈: 에셋 워크트리 `assets/generated/watercraft-pilots/ppaji-moving-wave-v1/runtime/core`.

이 문서는 **시뮬레이션 쪽**(손님·운항·사고·저장)만 다룬다. 렌더러·에셋·데이터는 코디네이터와
정적 작업자 소유이고 이 작업에서 한 줄도 안 건드렸다 (`main.ts`·`render/**`·`assets/**`·`data/**`).

---

## 1. 바뀐 것 한 줄

**선착장 이용이 「즉시 요금 + `safe: 2` 고정 사고 뽑기」에서 실제 운항으로 바뀌었다** —
탑승 → 주행(굽이에서 느리고 직선에서 빠름) → (낙수) → 물 위 복귀 → 하선이 tick 으로 돈다.
보트는 더 이상 렌더러가 벽시계로 돌리는 장식이 아니라 **sim 상태**다.

### 옛 코드 (제거됨)

```ts
if (def.id === 'dock') {
  … this.money += fee;                                   // 이용 즉시
  const p = accidentChance({ thrill: …, safe: 2, … });   // 코스 안전도와 무관한 고정값
  if (this.rng.accident.next() < p) this.applyAccident(g, f, …);
  g.sat += …; g.hp -= …;                                 // 이용 즉시
}
```

### 새 코드

```ts
if (COURSE_DOCK_IDS.has(def.id)) {
  … if (this.rides.board(g.uid, c, eq, boat, res, ride)) { 요금 한 번 · 통계 }
    else { g.say = '보트가 다 찼네…'; stats.courseFull++ }   // 자리 없으면 0원
}
```

사고는 `CourseRideStore` → `createCourseRide` → `IncidentLedger` 가 **운항당 한 번** 결정한다.
`legacyDockAccidentPolicy: 'SKIP_FOR_THIS_RIDE'` 가 계약이고, `rng.accident.next()` 호출이
game.ts 에서 **3 → 2** 로 줄었다 (정적 검사 두 곳이 이 수를 지킨다).

---

## 2. 새 파일 / 바뀐 파일

| 파일 | 내용 |
|---|---|
| `ppaji/src/sim/watercraft-core/{incidents,recovery,bridge,index}.ts` | 에셋 워크트리 `runtime/core` 를 **알고리즘·상수·이름 그대로** TypeScript 로 옮긴 것 |
| `ppaji/src/sim/watercraft-core/core.test.ts` | 원본 `core.test.mjs` 10건 이식. 마지막 한 건은 **더 조였다** — 생성 사본이 아니라 이 게임의 실제 `sim/accident.ts` + `data/balance.json` 을 쓴다 |
| `ppaji/src/sim/course/ride-view.ts` | 렌더러가 읽는 **표시 전용** 계약 (`RideScene`·`RideView`·`RideVehicleView`·`RidePassengerView`·`RideSwimmerView`) |
| `ppaji/src/sim/course/ride.ts` | `CourseRideStore` — 운항 상태 · 경로/속도표 · 정박 · 좌석 접점 · 낙수 · 복귀 · 저장 |
| `ppaji/src/sim/course/ride.test.ts` | 통합 검사 18건 (결정론 · 저장 · 운항 중 저장 · 요금 중복 0 · 낙수 창 · 상한 · 세계 변경) |
| `ppaji/src/sim/game.ts` | 호스트 계약 구현 · 선착장 분기 교체 · `rideScene()` · 스냅샷 · `setRideSeatSpecs` |
| `ppaji/src/sim/guest.ts` | `GuestState` 에 `'course'` · `rideLock` 훅 · `byUid` |
| `ppaji/src/ui/windows/guest-info.ts` | 상태 낱말 한 줄 (`course: '코스 타는 중'`) |
| `ppaji/src/sim/p50a.test.ts` · `p52b.test.ts` | 정적 개수 검사 두 건을 **사유와 함께** 갱신 |
| `ppaji/src/sim/bot.ts` | P61-b 봇 적응 둘 — 휴식 기구 자리(`growPpaji`) · 마감 문턱을 게임 값으로(`capCourse`) |
| `ppaji/src/sim/p13.test.ts` · `p20.test.ts` · `p48b2.test.ts` · `p60d.test.ts` · `p50a.test.ts` | 은퇴 카탈로그·새 선착장·`--no-path` 밀레스톤 (§10·§11) |

`sim/` 은 여전히 `render`·`ui`·`assets`·`save` 를 import 하지 않는다 (불변식 1 · ESLint · 검사 1건).
`Math.random`·`Date.now` 0 (불변식 2). 낙수 결정은 `Rng` 가 아니라 **시드 해시**(`stableRandom`)라
손님을 하나 더 태워도 날씨·사고 스트림이 밀리지 않는다.

---

## 3. 운항 한 바퀴

```
boarding (boardTicks/2)   towing (length / effectiveSpeed)        unboarding (boardTicks/2)
  정박 칸에 뜸  ──cast off──▶  0.35~0.70 구간에서만 낙수 가능  ──▶  정박 칸으로 복귀
```

- **총 시간 = `cycleTicks`** (= `length/speed + boardTicks`) — `evaluateCourse` 의 정의와 **정확히 같다**.
  속도 프로파일 `f(κ) = clamp(1 − κ/(2·safeCurvature), 0.6, 1)` 을 `v = base·f·c` 로 정규화
  (`c = (Σ Δd/f)/length`)해 굽이에서 느려도 **한 바퀴 시간은 그대로**다. `potentialDailyRiders` 가 거짓말이 안 된다.
- **속도는 한 번만** — `effectiveSpeed(equipment, boat)` = `speed × speedMult`.
- **스릴에 이미 반영된 속도를 위험 확률에 다시 곱하지 않는다** — `courseAccidentInput` 은
  `evaluateCourse` 의 thrill·safety(0~100)를 25로 나눠 0~4 로만 바꾼다.
- **출항 때 설정이 고정된다** — 코스를 그 뒤에 고쳐도 뜬 운항은 자기 경로·기구·확률을 쥔다.
  업그레이드는 **다음 출항부터**.
- **정원** — 동시 운항은 `course.vehicles` 대까지, 한 대에 `equip.capacity` 명.
  자리가 없으면 **요금을 안 받는다** (`stats.courseFull`).

---

## 4. 낙수와 부상 (인계 §6·§7)

- 지원 기구는 **9종**: `peanut`(시연의 `peanut_3`)·`banana`·`rocket_tube`·`watersled`·
  `jjinppang`·`honeycomb`·`hexa`·`lotus`·`twinpang`. 나머지는 경로 표본을 안 넘겨 사건이 **구조적으로 0**이다.
- 반동은 **6종**(`banana`·`flyfish`·`rocket_tube`·`watersled`·`swing`·`skyfly`), 시연 `motionProfiles` 값 그대로.
- **출발 직후 낙수 없음** — `eligibleForFall` 이 `towing ∧ 0.35 ≤ progress ≤ 0.70 ∧ speed/peak ≥ 0.70` 만 허용.
- **운전자 제외 · 바깥쪽 좌석만 후보** — 좌석 접점이 주입돼 있으면 `|position.x|` 가 최대에서
  0.15 이내인 좌석만 `canFall`. 시연과 같은 규칙이다.
- **운항당 최대 한 명** (core 계약).
- **중복 추첨 0** — `IncidentLedger.consume` 이 사건 id 로 한 번만 돌려준다. 저장·복원 뒤에도 재적용 불가.
- **하루 상한과 연출이 일치한다** — `applyAccident` 가 `accidentsPerDay` 로 거절하면
  **낙수 연출도 통계도 일어나지 않는다**. 반쯤 일어난 사건이 없다.
- **부상 손님은 뭍에 오른 뒤에만 의무실로 간다** — `applyAccident(..., deferInfirmary = true)`
  로 목표를 미루고, `RecoveryState.nextAction === 'infirmary'` 가 복귀 완료에 붙는다.
  물 위 손님에게 걷기 목표를 주면 물 위를 걷는다.
- `RIDE_INJURY_PROBABILITY = 1` — **옛 규칙과 같은 눈금**이다(뽑기 한 번 = 사고 한 번).
  0 으로 내리면 사고가 통째로 사라지므로 내리려면 밸런스를 다시 재야 한다 (인계 §6 경고).

---

## 5. 복귀 — 실제 수역 위상, 텔레포트 0

- `worldFromGame` 에 **이 지도의 물**을 넘긴다: `isWaterCode(grid.at) ∧ 시설 없음`,
  격자 한 칸 = 물길 한 격자점(`cellSize: 1`, 96×72 = 6,912칸 < 상한 100,000).
- 선착장은 `rideDocks()` 가 **발자국 전체**에서 물 칸 하나·뭍 칸 하나를 찾아 만든다 —
  1×1 `dock` 과 2×1 승선장이 같은 함수로 잡힌다. 뭍 칸 판정은 **`guestWalkable` 술어 하나**를 쓴다
  (갈라지면 손님이 못 서는 칸으로 올라온다).
- 출발 선착장 우선 → 물길이 짧은 순 → id. 선착장을 지우면 `revision` 이 올라 다음 tick 에 다시 짠다.
- 보트가 앞을 막으면 `traffic-wait`. **교착 방지 둘**: ① 양보한 보트는 손님의 대기 판정에서 빠진다
  ② 한 운항의 연속 양보는 `MAX_YIELD_TICKS`(40) 까지 — 안 그러면 제자리에 뜬 손님 앞에서 보트가 영원히 선다.
- **낮에는 절대 중간에 접지 않는다** (`RECOVERY_DAY_END_ONLY`). 닿을 선착장이 없으면
  보이는 채로 계속 헤엄치고, 정리는 폐장(`endOfDay`, 화면 밖)에서만 한다.
  → 그래서 "한 손님의 방문은 하루 안에 끝난다"(불변식)가 여전히 성립한다.
- 선착장이 **하나도 없는 채로** 날이 저물면 구조정이 손님을 집으로 데려간다
  (`onRescueGiveUp` → 퇴장 회계는 평소와 같은 `onLeave`). 판에 다시 놓지 않으므로 텔레포트가 아니다.

---

## 6. 손님 FSM

`GuestState` 에 **`'course'`** 를 더했다. 훅 `rideLock(g)` 이 참이면
`afterUse` 가 목표를 안 고르고 `case 'course'` 가 이동을 통째로 건너뛴다.
자세는 `CourseRideStore` 가 매 tick `placeGuest` 로 준다 (승하선 중에는 선착장 뭍 칸, 주행 중에는 기구를 따라).

> 운항 상태를 손님 쪽에 **복제하지 않았다** — 두 벌이 되면 저장 복원에서 반드시 갈라진다.
> `isRiding(uid)` 하나가 정본이다.

---

## 7. 저장 (인계 §9)

`GameSnapshot.rides?: RideStoreSnapshot` — **optional · 세이브 버전 그대로(v5) · 마이그레이션 없음**
(프로젝트 관례: optional 이면 마이그레이션이 필요 없다).

- 싣는 것: 운항 설정(코스·기구·보트·정박·승선 칸) + `elapsed` + 승객·좌석 + 결정 + 장부 + 복귀 상태.
- **경로·속도표는 안 싣는다** — 같은 설정에서 같은 함수로 다시 만든다.
- 코스가 사라진 운항은 되살리지 않는다 (손님은 다음 tick 에 제자리에서 다시 논다).
- **모르는 버전은 명시적으로 거절**한다(`Unsupported ride save`) — 조용히 버리면 그 운항의 손님이 영원히 얼어붙는다.
- 복원 뒤 **다시 추첨하지 않는다** (`IncidentLedger` 의 `rides`·`applied` 를 그대로 싣는다).

---

## 8. 렌더러 계약 (읽기 전용)

`game.rideScene(): RideScene` 하나. 순수하다 — 돈·뽑기·손님 생성이 없고 매 프레임 불러도 된다.

| 필드 | 뜻 |
|---|---|
| `revision` | 세계·선착장이 바뀌면 오른다 |
| `timeSec` | **sim 시간(초)** — 물보라·반동을 벽시계가 아니라 이 값으로 (일시정지·배속이 따라간다) |
| `rides[].boardProgress` / `unboardProgress` | 0..1 승·하선 진행 |
| `rides[].vehicles[].pos/heading/bounce/boat/ropeLength/speed` | 기구·견인선 자세. **정박 중에도 `boat` 는 null 이 아니다** (출항에 팝 없음) |
| `passengers[].guestUid` | `GuestStore` 의 uid 와 **같은 값** |
| `passengers[].pos` · `origin` · `seat` · `height` | 좌석 **접점**(선체 중심 아님) · 승선 시작 칸 · 좌석 번호 · 타일 단위 높이 |
| `swimmers[]` | 낙수 복귀 중인 손님(상태·포즈·남은 물길·목표 선착장) |
| `paths` | 살아 있는 코스의 실제 스플라인 표본 |

16방향 양자화는 **에셋 축**이다: `h = round((π/2 − heading)/(π/8)) mod 16` (h0 = +J · h4 = +I).
좌석 회전은 렌더러의 `local()` 과 같은 식(`seatOffset`)이고 `ride.ts` 가 export 한다.

좌석 접점은 **평문 주입**이다 — `game.setRideSeatSpecs(table)`.
`sim/`은 `assets/`를 import하지 않는다. `Game`은 순수 `data/watercraft-seats.json`을 기본으로 읽어 브라우저와 헤드리스에서 같은 접점을 사용한다. 부팅 때 manifest 좌석으로 재주입할 수도 있다. 명시적으로 빈 표를 주입한 경우만 중심 폴백을 쓴다. 순수 좌석 표와 원본 manifest의 동일성은 테스트로 검사한다.

⚠ `rides` 에는 **`moored-*` 정박 항목이 섞인다** (§9) — 실제 운항만 세려면 걸러야 한다.
좌석 표는 이제 `data/watercraft-seats.json` 이 **기본**이고 `setRideSeatSpecs` 가 그것을 덮는다.

선착장 시설 id 는 `COURSE_DOCK_IDS = {'dock','boarding_dock','boarding_dock2x1'}` **한 줄**이고
코스 매칭은 **발자국**으로 하므로 2×1 승선장도 그대로 잡힌다.

---

## 9. 코디네이터가 **소스에** 넣은 고침 (P61-b) — 전부 회귀가 붙었다

아래는 이 작업 뒤에 코디네이터가 `ride.ts`·`game.ts`(그들 파일)에 직접 넣은 고침이다.
각 항목마다 `src/sim/course/ride.test.ts` 의 「P61-b 코디네이터 소스 고침 회귀」 절이 **되돌리면 빨개지는** 검사를 든다.

| 고침 | 내용 | 회귀 |
|---|---|---|
| **물쪽 정박 출발** | `buildSchedule` 이 `dock.water` 에서 시작한다 — 코스 스플라인이 더 이상 마른 선착장 칸에서 시작하지 않는다 | ① 표본 0번이 물 칸이고 선착장 칸이 **아니다** (실측 `path0=(59,26)` vs `dock=(58,26)`) |
| **견인선 연속** | `towPose` 가 호 길이 리드를 유지하되 **급회전에서만** 중심 간격을 3.5 로 민다 (후보가 물일 때만). 「원 교점」 안은 헤어핀에서 11.4 타일/tick 을 튀어 **폐기**됐다 | ② 전 구간 `boat ≠ null` · **보트 이동 최대 0.882 < 2** · 기구 이동 < 2 · 줄 간격 **[3.50, 5.85]** (하한 3.4 · 상한 `ROPE_GAP`) |
| **좌석 실제 높이 낙수** | 낙수가 그 좌석의 접점 높이 + 반동에서 시작한다 (옛 고정 `+0.35` 제거) | ③ 좌석 z 0.42 → `recovery.start[2] === 0.42` |
| **바깥쪽 착수** | `splashPoint(pos, heading, localSide)` — 좌석의 로컬 x 부호 쪽으로 먼저 떨어진다 | ④ 좌석 x 를 ±0.9 로 뒤집으면 착수 방향 내적 < 0 (회전 규약에 안 기댄다) |
| **고유 vehicle 번호** | 같은 코스에 동시에 뜬 운항이 빈 번호를 찾아 쓴다 | ⑤ `vehicles: 2` 코스에 정원+1 → `{0, 1}` |
| **저장된 기구로 복원** | `fromSnapshot` 의 `lookup(save)` 가 **저장된 `equipId`/`towBoatId`** 로 장비를 찾는다 | ⑥ 스냅샷에서 코스를 통째로 지우고 복원해도 운항이 살고 `equipId` 가 보존되며 끝까지 돈다 |
| **정박 연출(`mooredView`)** | 아무도 안 탄 코스에 빈 기구가 떠 있다. `RideStore.scene` 은 그대로고 `Game.rideScene` 이 덧붙인다 | ⑦ `moored-<handle>` 1개 · 출항하면 사라진다(겹쳐 뜨지 않는다) |
| **복귀 좌표 반 칸 보정** | `waterWorld` 의 `bounds` 를 반 칸 밀어 격자 중심이 **정수 게임 좌표**가 되게 했다. 선착장 물/뭍은 생 정수, `isWater` 는 `round` | ⑧ 헤엄 구간 물길 격자점이 전부 정수 · 올라온 칸이 출발 선착장 곁이고 `guests.walkable` 참 |
| **작성된 좌석 표가 기본** | `Game` 이 `data/watercraft-seats.json` 을 들고 태어난다 — 부팅부터 실제 접점이다 | 표시 계약 절: 기본 = 작성된 표 · 주입이 덮는다 · 표를 비우면 선체 중심 폴백 |

⚠ 렌더러가 읽는 `RideScene.rides` 에는 이제 **`moored-*` 정박 항목이 섞인다.** 실제 운항만 세는 코드는
`rideId.startsWith('moored-')` 로 걸러야 한다 (검사 파일의 `live()` 헬퍼가 그 예다).

## 10. 은퇴 카탈로그 (P61-b) — 검사 셋이 같이 옮겨졌다

코디네이터가 시설 정의 **35종을 은퇴**시켰다 (`deprecated: true` · `buildable: false`) — 조합 시설로 통합된 것들이다.
정의는 남고(킷·저장·개조가 쓴다) `canPlace` 첫 줄이 새로 짓는 것만 막는다. 1×1 `dock` 도 그중 하나이고
새 판이 짓는 선착장은 **2×1 `boarding_dock`**(unlock `start`)이다. `COURSE_DOCK_IDS` 가 둘 다 받고
`courseAtDock` 은 **발자국**으로 코스 시작점을 맞춰 2×1 도 그대로 잡는다.

이 때문에 깨진 내 범위 검사 셋을 사유와 함께 옮겼다:

- `p48b2` — `canPlace('dock')` → **`boarding_dock` facing 1**(잔교는 세로 한 줄). 은퇴 거절(`'조합'`)·
  `inherited` 허용·`COURSE_DOCK_IDS` 전수를 **새로** 고정했다.
- `p60d` — `rig_beam` → **`rig_bridge`**(살아남은 1×2 장애물). 휴식 기구는 `inherited` 로 세우고,
  **「지금 지을 수 있는 휴식 기구 = `turtle_island` 하나 · 20칸 수역보다 크다」** 를 같이 고정했다.
- `p50a` — 랜드마크(`maxPerPark`)는 `inherited` 로 `canPlace` 한 줄만 재고,
  **「지금 랜드마크 = `ppaji_playground` 하나」** 를 고정했다.

세 곳 다 **규칙을 약화하지 않았다** — 판정하는 줄은 그대로이고, 지금 카탈로그가 어떤 상태인지를
검사가 같이 들고 있어서 작은 휴식 기구·랜드마크가 돌아오면 그 줄이 **먼저** 빨개진다.

## 11. P60-d `--no-path` 축 — 실측과 봇 적응

**발견(실측):** 은퇴 뒤 `--no-path` 대조군이 seed 1 에서 **8·12·16·24·32일 전부 바이트 동일**했다.
원인은 봇이 아니라 카탈로그다 — 살아남은 `chain: 'rest'` 기구가 `turtle_island`(8×6 · 투자 해금) 하나뿐이라,
`--no-path` 가 끄는 **유일한 실제 동작**(`capCourse` = 경로 끝에 휴식 하나)이 킷 수역 20칸에서 구조적으로 못 뜬다.
사슬 정렬·오프셋 정렬·종 정렬을 세 가지로 바꿔 봤지만 **최종 상태가 한 칸도 안 바뀌었다**(같은 1×1 징검돌이 같은 칸을 채운다) — 전부 되돌렸다.

**봇 적응(채택 · 사용자 에셋 우선 지시대로 작은 휴식 기구를 되살리지 않았다):**

- `growPpaji` — usePath 이고 휴식 기구가 열렸는데 **지금 어디에도 못 놓으면**(`canPlace` 로 직접 판정)
  안이 `(w+2)×(d+2)` 인 링을 먼저 두른다 (8×6 → 안 10×8 = 80칸: 휴식 48 + 사슬 자리).
  허가가 모자라면 **안 두른다** — 못 놓을 자리를 사지 않는다.
- `capCourse` — 마감 문턱을 매직 넘버 `3` 에서 게임 값 **`PATH_COMPLETE_MIN`** 으로 유도했다
  (규칙은 「길이 ≥ 2」인데 봇만 더 엄했다).

**결과:** 64일에 **행동이 갈린다** — 경로 축을 켠 봇은 최대 수역 **80칸**, 대조군은 **48칸**(seed 1·2 동일).
그래서 `p60d` 의 밀레스톤을 「8일 해시 대조」에서 **「64일, 휴식 기구가 들어갈 수역을 만드는가」** 로 옮겼다
(해시 비교도 남겨 두되 그것만으로 통과하지 않는다).

⚠ **못 한 것 — 완성 경로는 아직 0이다.** 넓힌 80칸 수역에 장애물 사슬을 세우는 주체가 없어
(`attachRigs` 는 새 **종**만 놓고 `chainRigs` 는 기존 사슬만 늘린다) `capCourse` 가 끝을 못 얹는다.
빈 수역에 씨앗을 놓는 `seedPool` 을 넣어 봤지만 매일 씨앗이 새 종을 굶겨 거북섬 배치가 1 → 0 으로 **나빠져** 되돌렸다.
완성 > 0 을 만들려면 사용자가 승인한 카탈로그를 유지하면서 씨앗 정책을 밴드 지표와 함께 재보정해야 한다 — **데이터·밴드 결정이라 이 작업 밖이다.**

## 12. 검증


```
# ⚠ 봇 검사는 fork 하나로 — 여러 fork 가 동시에 128일을 돌면 워커가 보고 타임아웃으로 죽어 **엉뚱한 실패**가 난다
npx vitest run src/sim/watercraft-core/core.test.ts --poolOptions.forks.maxForks=1   → 10 passed
npx vitest run src/sim/course/ride.test.ts            --poolOptions.forks.maxForks=1 → 26 passed (P61-a 18 + P61-b 8)
npx vitest run src/sim/p13.test.ts src/sim/p20.test.ts src/sim/p48b2.test.ts \
               src/sim/p60d.test.ts src/sim/p50a.test.ts --poolOptions.forks.maxForks=1 → 28 passed
npx vitest run src/sim/invariants.test.ts src/save src/sim/game.test.ts \
               src/sim/guest-life.test.ts src/sim/course.test.ts src/sim/p52b.test.ts → 51 passed
npx tsc --noEmit                                      → sim 전부 초록
npx eslint src/sim                                    → 0
```

재는 것:

- **결정론** — 같은 시드·같은 조작 두 판의 운항 스냅샷이 바이트 동일. 골든의
  「같은 시드 두 번」·「스냅샷 왕복」 두 건도 단독 실행에서 통과.
- **저장** — 운항 **중간**에 저장·복원해 160 tick 을 더 돌려도 두 판의 운항 스냅샷이 같고
  `stats.accidents` 가 안 늘어난다(재추첨 0). 모르는 버전은 throw.
- **운항 중 타이밍** — 한 바퀴가 `cycleTicks ± 3` 안에 끝난다. 낙수는 진행 0.35~0.70 에서만.
- **요금 중복 0** — 정원 = 3 인 코스에 6명을 보내면 요금은 **3명분만**, 나머지는 `courseFull`.
  같은 손님을 두 번 태워도 0원. 탑승이 `rng.accident` 를 **한 눈금도** 안 민다.
- **세계 변경** — 운항 중 코스·선착장을 지워도 throw 0, 손님이 조용히 얼지 않는다(보이는 복귀 또는 하선).
- **폐장** — 뜬 운항·복귀가 남지 않는다.
- **정적** — `ride.ts` 가 render·ui·assets 를 import 하지 않는다 / game.ts 의 `rng.accident.next()` 2 /
  `guestWalkable` 술어 하나.
- **소스 고침 8건** — §9 표의 회귀. 되돌리면 각각 한 줄씩 빨개진다.
- **봇 코스 수** — `p13`(성향별 코스 수) · `p20`(128일 코스 ≥ 2 · 선착장 ≤ 코스+2) ·
  `p48b2`(봇 128일 수역 ≥ 60 · 코스 ≥ 2) 최종 소스에서 전부 통과. 초기 통합 중 실행에는 오래된 선착장 연결 상태의 실패와 병렬 워커 보고 타임아웃이 섞였으므로 최종 결과로 사용하지 않는다.

### 중간 통합 시점 참고 계측 (최종 밸런스 인증 아님)

아래 수치는 최종 카탈로그·저자 좌석 기본값·봇 동결 전의 참고 기록이다. 최종 검증은 전체 회귀 검사와 `qa/main-adoption-20260919/rebaseline.json`을 따른다.

| 시드 | 선착장 이용 | 실제 탑승 | 자리 없어 못 탐 | 코스 매출 | 낙수 | 사고(전체) | 구조 |
|---|---|---|---|---|---|---|---|
| 1 | 571 | 314 | 257 | 10,990 | 0 | 14 | 0 |
| 2 | 458 | 277 | 181 | 9,695 | 0 | 20 | 0 |
| 3 | 521 | 300 | 221 | 10,500 | 1 | 15 | 0 |

읽는 법: **「선착장 이용」이 옛 모델의 탑승 수**다 (옛 코드는 이용 = 탑승 = 요금).
즉 코스 매출이 **약 −45%** 다. 원인은 정원이 아니라 **몰림**이다 — 한 바퀴가 ~150 tick 인데
승선 창은 ~17 tick 이라, 기구가 나가 있는 동안 온 손님이 그냥 돌아간다.
전체 현금에서 코스 매출의 몫이 작아(64일 65~80만 중 1만) **판 전체 영향은 ~1%** 다.
되돌리는 손잡이는 **기구 대수**(`course.vehicles`)이고, 이제 그 값이 처음으로 실제 처리량을 바꾼다.
봇은 대수를 안 늘리므로 헤드리스 숫자는 이 표가 하한이다.

---

## 13. 남은 것 / 한계 (정직하게)

1. **골든·fixture 는 코디네이터가 다시 떴고 지금 초록이다** (2026-09-19 20:50, 내 봇 적응 뒤).
   `golden.test.ts` · `p48a.test.ts` · `p60b.test.ts` **13건 통과** 확인.
   ⚠ 봇 정책(`bot.ts`)이나 시설 데이터를 다시 건드리면 **이 셋이 같이 낡는다** — 그때 사유와 함께 다시 뜰 것.
2. **P60-d 완성 경로가 아직 0이다** (§11). 휴식 기구가 8×6 하나뿐이라 `capCourse` 가 끝을 못 얹는다.
   봇은 자리(80칸 수역)까지는 만들지만 그 수역에 장애물 사슬을 세우지 못한다.
   → (a) 작은 휴식 기구를 데이터에 남기거나 (b) 빈 수역 씨앗 정책을 밴드 지표와 함께 재보정해야 한다.
3. **회전팡·디스코팡팡·댄싱보트 등 인계 §「검사 후 보류한 실제 특수 동작」은 그대로 보류**다.
   이 작업에서 완료로 바꾼 것은 하나도 없다.
4. **다인승 기대 사고 수**가 옛 모델보다 아주 조금 낮다 (운항당 최대 1명 cap).
   확률이 0.002~0.016 대라 2차항이고 실측 사고 수도 14~20 으로 예전 대역이지만,
   인계 §6 이 경고한 대로 "같다"고 단정하지 않는다.
5. **실제 MAIN 5189 브라우저 검증 완료** — 원본 기구 30종·조합 3종, 실제 손님 승하선·낙수·수영 복귀와 복귀 중 저장/재개를 확인했다. 낙수는 진행 36.5%, 복귀는 출발 데크 (58,25), 운항 스냅샷 동일. `qa/main-adoption-20260919/main-5189-checks.json`과 `final-bundle.json`에 증거를 남겼다. 모든 특수 동작이나 모든 FPS/배속 조합을 전수 인증한 것은 아니다.
6. `IncidentLedger.applied` 는 판이 끝날 때까지 자란다(낙수가 드물어 실측 수백 건 규모).
   끝난 운항의 **결정**은 `forget` 으로 버린다.

> **해소된 옛 한계** — 「코스 스플라인이 마른 선착장 칸에서 시작한다」와 「코스를 지우면 뜬 운항이
> 사라진다」는 §9 의 코디네이터 고침(물쪽 정박 출발 · 저장된 기구로 복원)으로 **없어졌다.**
> 회귀 ①·⑥ 이 그것을 고정한다.

## 최종 통합 검증

MAIN 전체 검사 113개 파일·587개 테스트 통과(222.44초, maxForks=2). 단독 회귀는 maxForks=1로도 검증했다. 타입·lint·UI·빌드 통과. 최종 번들 `main-1zTXP-Zn.js`, 실제 포트 5189. 최종 증거는 `qa/main-adoption-20260919/validation.json`과 `final-bundle.json`을 따른다.
