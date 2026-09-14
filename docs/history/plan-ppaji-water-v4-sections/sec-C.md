# 섹션 C (5판) — 개조 · 손님 · 이용권 · 안전 · 계절 (**P51 · P52-a · P52-b · P52-c**)

> 설계자 C 산출물, 2026-09-07 라운드 5. 코드 근거는 전부 `ppaji/` 패키지 기준 `file:line` 이고
> **이번 판에서 인용하는 줄을 전부 다시 열었다**(4판이 통합되며 옮겨진 것 6건을 §0-B 에 적었다).
>
> 4판이 남긴 차단 둘을 이 판이 닫는다:
> **① 팔찌 창구 ⓐ 가 ⓑ 를 굶기고 그 위에 밤 매출이 얹혀 있었다** → **D-C37**(결제 소유자 하나 · 창구를 「무엇을 파나」로 · 밤은 **야간권**) ·
> **② 자유이용권 값 규칙이 두 벌이었다** → **D-C38**(`ppajiPkgPrice` 삭제 · `bandPrice` 한 벌 · `wristband.ts` 를 **[50b] 로 당김**).
>
> **없는 것은 「신설」로 적었다.** 「그대로」·「무변경」은 **범위를 붙여** 적었다(무변경 주장은 범위가 없으면 검증할 수 없다).
> 게이트 번호는 통합본 §6 의 접두를 그대로 쓴다(`51-…`·`52a-…`·`52b-…`·`52c-…`·`50b-…`·`54-…`).
> 카탈로그(`docs/research/ppaji-gear-catalog.md`)에서 온 결정에는 **「카탈로그:」** 와 근거 항목(§3-n · §4(b) n)을 붙였다.

---

## 0-A. 이번 라운드 지시 대조표

| # | 지시 | 이 문서에서 | 절 |
|---|---|---|---|
| **1** | **[BLOCKER]** `issueBand` 의 `if (buyer.band != null) return;` 가 ⓐ(입장 동선) 뒤 ⓑ(`claimSeat`)를 **언제나 조기 반환**시키고, D241 ①이 곱하는 자리가 `game.ts:925` **하나**뿐이라 성숙한 판에서 **54-8① 이 구조적으로 빨간불**. 게다가 `:927`·`:928` 이 남는지 빠지는지가 문서에 없다(남으면 이중 계상 · 빼면 ⓑ 매출 0). 52a-13 까지 같은 줄에 걸린다 | **반영(r5)** — **D-C37**: ⓐ 결제 소유자를 `issueBand` **하나**로 못 박고 `claimSeat` 의 **`:925`·`:927`·`:928`·`:929`·`:930` 다섯 줄을 `pk.band` 면 통째로 건너뛴다**(코드 블록 §2.7 ②) · ⓑ 두 창구를 「누가 먼저」가 아니라 **「무엇을 파나」**로 가른다(ⓐ = 하루권 정본 창구 · ⓑ = **팔찌를 끼운 자리 묶음**, `bandPaid` 면 후보에서 빠진다) · ⓒ 밤 배수를 **`issueBand` 안 한 줄**로 옮긴다 · ⓓ **밤은 야간권**(하루 1 + 밤 1) | §1 · §2.7 · §5-C · §5-H |
| **2** | **[BLOCKER]** `ppajiPkgPrice`(round·`pk.price`)와 `bandPrice`(round50·`tier.base`)가 **두 벌**이고, 52a-15 가 `price === 0` 을 요구해 **52a-6b 가 통과 불가**. §5 [52a] 에 `aimPreview` 가 없고 D225 는 「코드 0줄」이라 적었다. `400 → 500G` 는 사다리에 없는 전이 | **반영(r5)** — **D-C38**: `ppajiPkgPrice` **삭제** · `bandPrice(tier, grade, step)` **한 벌** · `wristband.ts`+`wristbands.json` 을 **[50b] 로 당긴다**(패키지 데이터 0건이라 **동작 0** — D225ⓓ 와 같은 수법) · **§5 [52a] 에 `aimPreview` 행을 명시**(변경 0 + 정적 자) · D225 문장에 **범위**를 붙인다 · 52a-6b 의 문자열 절을 **형식 검사**로, 값은 **다섯 값 표**로 · §1.1 의 `+100G/등급`·`400 → 500G` 를 **사다리**로 | §1 · §2.9 · §5-C · §5-I |
| **3** | **[fix]** `FAULTS` 수가 갈렸다 — 실측 10 인데 50b-17 과 52b-15ⓒ 가 **둘 다 「10 → 11」** | **반영(r5)** — §5 UI 표를 **「10 → 12(P50-b +1 · P52-b +1)」**, 52b-15ⓒ(재번호 뒤 **52b-10ⓒ**)를 「**12건**이고 그중 **새 둘**이 각각 `--rig-dim`·`--risk-danger` 를 깬다」로. `PAIRS` 14 → 19 는 실측과 맞아 그대로 | §0-C · §5-D · §5-I |
| **4** | **[fix]** P52-b 가 52b-1~7 → 52b-13·14·15 로 뛴다(8~12 공백) | **반영(r5)** — **52b-13/14/15 → 52b-8/9/10** 재번호 + **어느 항이 어디로 갔나 각주**(옛 52b-8~12 → 52c-1~5 · 옛 52b-13 의 유실 절 → 52c-6) · **53b-16 에 「한 페이즈 안에서 번호가 연속이다」 절 추가** | §5-D · §5-E · §5-I |
| **카탈로그** | §3-13 「몇 종 몇 회」 · §3-14 색 팔찌·한 장씩 반납 · §3-15 시그니처가 등급을 가른다 · §3-1 조끼 · §3-3 아쿠아삭스 · **§3-20 밤은 다른 상품** · **§3-16 종수의 제곱근** | 4판의 D233~D235 위에 이 판이 셋을 더한다 — **D-C37 ⓓ 야간권**(§3-20·§3-13 HOT7) · **D-C39 `bandCost`**(§3-14 「기구별 소모 수를 다르게」 · §3-15 타노스 전용 팔찌) · **D-C40 걸어온 팀의 구멍은 창구 ⓐ 가 막는다**(§3-1) | §1 · §2.7 · §3.7 |

## 0-B. 착수 전에 고쳐야 할 문장 — **이번 판 실측 (2026-09-07 전수 재확인)**

> 4판의 ①~㉜ 는 통합본이 이미 흡수했다. 아래는 **그 뒤에 다시 열어 본 결과** 어긋난 것만이다.

| # | 어디 | 4판·통합본이 적은 것 | 실측 | 처리 |
|---|---|---|---|---|
| ⓐ | 내 4판 §5-F | 「50b-16 `--rig-dim` · 50b-17 세 표면」 | 통합본은 **50b-16 = 첫 3분 스모크** · **50b-17 = `--rig-dim`** · **50b-18 = 세 표면** | §5-I 가 **통합본 번호**를 쓴다. 내 옛 번호는 폐기 |
| ⓑ | 내 4판 §5-G · §2.7 | 「`tools/bot.ts:17~46 BANDS`」 | `BANDS` 는 **`:17~47`**(항목 `:18~46` = **29개**) | 정정. 통합본 검산 표의 「실측 29」와 같은 수다 |
| ⓒ | 내 4판 §3.1 | 「`data.test.ts:99` maint 검사」 | `MAINT_PER_POP` **`:75`** · maint `it()` **`:100`** · `COST_POP_BAND` `:57~62` · `EXCEPTIONS` `:74` | 정정 |
| ⓓ | 내 4판 §4 | 「`guest.ts:52~118 Guest`」 | `Guest` 는 **`:52~120`**(`hunger` 가 `:119`) | 정정 |
| ⓔ | 내 4판 §2.7 ② | 「`claimSeat`(`game.ts:917~930`)」·가드 `:919`·배수 `:921` | **`:917~931`** · 가드 **`:922`** · 배수 **`:925`** · `money` **`:927`** · `stats.pkg` **`:928`** · **`f.incomeToday` `:929`** · `fx` **`:930`** | 통합본이 이미 고쳤다. **다만 `:929` 가 어느 문서에도 없었다** — D-C37 이 그것까지 명시한다 |
| ⓕ | 통합본 §3.8 ⑤ | 「시설 후보 루프(`:778~801`)」 | 본문은 **`:778~800`**, `:801` 은 닫는 괄호 | 무해하나 게이트가 줄을 세면 걸린다 — **`:778~800`** 으로 |
| ⓖ | 통합본 §3.8 ② 표 | ⓐ 창구가 「`onFacilityUse`(`game.ts:1497`)」 | `onFacilityUse` 는 **`:1498~1557`**(`:1497` 은 `photoMul`) | **`:1498`** 로 |
| ⓗ | 내 4판 §2.4 | 「뽑는 자리 ② `game.ts:1529~1548`」 | dock 가지는 **`:1529~1546`**(`:1547` 부터 `usageFee`) | **`:1529~1546`** 으로 |

> **새로 확인한 사실 셋** (이 판의 설계가 여기 걸려 있다)
> · **`ARRIVAL_TO_TICK === EVENING_TICK === 1400`** (`clock.ts:15`·`:36`) — **18시부터는 새 손님이 한 명도 안 들어온다.**
>   ⇒ **입장 동선 창구 ⓐ 는 저녁에 구조적으로 거의 안 돈다.** 밤 배수를 ⓐ 에만 얹으면 그 자리도 0 이다.
>   ⇒ **밤 배수의 자리는 `issueBand` 안이어야 하고, 그것만으로도 부족해서 「야간권」이 필요하다**(D-C37 ⓓ).
> · **`rental_tube` 는 `capacity 2 · useTicks 6`**(`facilities.json` 실측) — 하루 1,680 tick 이면 상한 **560회/일**이라 창구가 병목은 아니다. 병목은 **`passBy` 가중치(×3)**이지 정원이 아니다.
> · **`teamSeatedIds`(`game.ts:907`)가 `:1705` 에서 하루마다 `clear()` 된다** — 「하루 한 번」 상태를 **저장 없이** 드는 선례가 이미 있다. 야간권 래치가 그 형태를 그대로 쓴다.

## 0-C. 숫자 대장 — **문서 안의 모든 반복 수치는 여기서만 정의한다**

| 이름 | 값 | 어디서 세었나 | 인용하는 절 |
|---|---:|---|---|
| `PlacedFacility` 필드 수 | **12** (P51 뒤 **13**) | `facility.ts:8~25` 전수 | §2.1 · 51-2 |
| 개조 보존 필드 | **12** (`chainLen` 제외) | 위 13 − `defId` | §2.1 · 51-2 |
| `GuestState` 값 | **11** | `guest.ts:18` 전수 | 52a-5 |
| 팔찌 등급 | **4** · `rides` **[0,3,5,99]** · `needGrade` **[0,1,2,4]** | §3.7 표 | 52a-12 |
| **팔찌 값 사다리 (등급 0~4)** | **0 / 400 / 600 / 700 / 1,000 G** | §2.9 유도(다섯 값 표) | §1.1 · §2.9 · 52a-6b · 52a-13 |
| **사다리에 있는 전이** | **0→400 · 400→600 · 600→700 · 700→1,000** | 같은 표 | 52a-6b(형식 검사) · §1.1 |
| `packages.json` 항목 | **4 → 5**(`ppaji` 하나) | 실측 4 + §3.7 | 52a-7 `pkgKinds` |
| `rig-parts.json` 종수 | **13** (상점 진열 **9** · 연차 전용 **4**, `year` **[5,5,6,7]**) | 통합본 §4.4 표 | §3.2 · 51-17 |
| `rigs.json` 개조 | **20** (`start` 3 · `craft` 17) | 통합본 §4.5 표 | 51-5·51-9·51-11 |
| 「빠지」 탭 행 | **33** | 통합본 검산 (새 21 + 이전 12) | 51-16 |
| `'dock'` 문자열 | **7파일 20곳** | 통합본 §3.8 실측 | §2.11 |
| `check-ui.mjs` `PAIRS` | **14 → 19쌍** (`--rig-dim` 1 · 위험 칩 4) | `:127~142` 실측 14(항목 `:128~141`) | 50b-17 · 52b-10 |
| **`check-ui.mjs --selftest` `FAULTS`** | **10 → 12** (**P50-b +1 · P52-b +1**) | `:26~37` 실측 10(항목 `:27~36`) | 50b-17 · **52b-10ⓒ** |
| `verify.ts` G12 `routes` | **7 → 8** | `:636~644` 실측 7(항목 `:637~643`) | 51-19 |
| `tools/bot.ts` `BANDS` | **29 → 49** (새 20, 내 몫 변경 **0**) | `:17~47` 실측 29(항목 `:18~46`) | §5-G |
| 게이트 항 총계 | **186 → 187** (**P54 8 → 9**) | 통합본 검산 합 + 54-8 신설 | §5-F · §5-I |
| P52-b 항 수 | **10** (번호 **52b-1~10**, 공백 0) | §5-D | 53b-16 |
| P52-c 항 수 | **7** (번호 52c-1~7) | §5-E | 53b-16 |
| `accidentBase` / `accidentFloor` | **0.008 / 0.002** | 통합본 §3.8 유도 | §2.4·§2.5 |
| 수온 표 칸 | **12칸** (겨울은 눈·흐림·비 **8/9/7**, `clear` 없음) | 통합본 §3.8 표 | 52c-1 |
| 가을÷여름 — urge / 이중 / 몫 | **0.265 / 0.250 / 0.945** · 봄÷여름 urge **0.439** | 같은 표의 날씨 가중 | 52c-2·52c-3 |
| `BRIEF_TICKS` / 처리량 | **15 tick / −9.1%** | `cycleTicks` 중앙 **149.4** | §2.11 · 52b-6 |
| `accidentPopCut` / 좋아요 | **0.20 / −6.82%** | SNS 글 8,715건 재계산 | §2.10 · 52b-5 |
| `offSeasonSwim` 밴드 | **0.20 ~ 0.55** | 계산값 0.250 의 0.8배 여유 | §5-G |

---

## 1. 결정

### 개조 (P51) — 4판에서 변경 없음

- **D-C1** `Game.convertFacility(uid, toDefId)` 신설 (통합 **D101·D148·D196**). **§14.9 ③ 이 여기서 닫힌다.**
- **D-C2** 보존 **12필드**, 바뀌는 것은 `defId` 하나. `chainLen` 은 **파생 캐시라 목록 밖**.
- **D-C3~D-C10 · D-C23 · D-C29** — 통합본 §3.8·§4.4·§4.5 에 그대로 흡수됐다. 이 판이 고치는 것 없음.

### 이용권 (P52-a) — **이 판의 본체**

- **D-C37 (신설 · 지시 1 · 카탈로그 §3-13·14·20) 팔찌는 「결제 소유자 하나 · 창구 둘 · 하루권 하나 + 야간권 하나」다.** (D233 ②·D241 ① 개정)
  4판의 구멍은 셋이 한 줄에 겹친 것이었다 — ⓐ 가 ⓑ 를 굶기고 · 밤이 ⓑ 에만 얹혀 있고 · `claimSeat` 의 결제 다섯 줄이 남는지 빠지는지 아무도 안 적었다.
  ① **결제는 `issueBand` 하나가 한다.** `claimSeat`(`game.ts:917~931`)의 **`:925`(자리 등급 배수) · `:927`(money) · `:928`(stats.pkg) · `:929`(f.incomeToday) · `:930`(fx)** 다섯 줄은 **`pk.band` 가 있으면 통째로 건너뛴다.** 매출 귀속(`f.incomeToday`)은 **`issueBand` 가 시설 인자로 받아** 그대로 든다 — 빠뜨리면 D202 「어제 이 빠지가 번 돈」이 팔찌를 못 본다.
  ② **창구는 「누가 먼저」가 아니라 「무엇을 파나」로 갈린다.**
     · **ⓐ `rental_tube`(구명조끼 대여소, `passBy:'enter'`) = 하루권의 정본 창구.** 취향이 등급을 고르고(`minIdx 0`) 등급의 출처는 **파크 최고 빠지 등급**이다. 걸어온 팀·혼자 온 손님·버스 팀 **전부**가 여기서 산다.
     · **ⓑ 자리(`packages.json` 의 `ppaji`) = 팔찌를 끼운 「자리 묶음」.** `packageFor` 가 **`bandPaid(g)` 면 그 패키지를 후보에서 뺀다** — 이미 팔찌를 산 팀에게는 **팔 물건이 없다.** 그 자리는 대신 `meat`·`stay` 를 팔아 **자리 매출이 0 이 되지 않는다.**
     ⇒ ⓐ 가 ⓑ 를 굶히는 것이 아니라 **ⓑ 가 파는 물건이 달라진다.** 두 창구는 **판 구성으로** 갈린다(대여소 없는 판 = ⓑ 만 · 있는 판 = ⓐ 가 앞·ⓑ 는 곁들이).
  ③ **`vest_only` 는 「산 것」이 아니다.** `bandPaid(g) = g.band != null && g.band !== 'vest_only'` — 조끼만 빌린 팀은 **자리에서 진짜 팔찌로 갈아탈 수 있고**, `vest_only` 값이 **0G** 라 「결제 정확히 1회」가 그대로 성립한다. (조끼는 전제이지 상품이 아니다 — D234·카탈로그 §3-1)
  ④ **밤 배수의 자리는 `issueBand` 안 한 줄이다** (D241 ① 개정). `game.ts:925` 는 **팔찌가 아닌 패키지 전용**이 되므로 그 자리에 밤을 얹으면 자유이용권을 못 곱한다. `issueBand` 안이면 **ⓐ·ⓑ 어느 창구로 들어와도** 밤을 탄다.
     ⚠ **그 한 줄은 [54] 가 넣는다** — [52a] 의 `issueBand` 는 `bandPrice` 만 부른다(페이즈 의존을 늘리지 않는다).
  ⑤ **밤은 연장이 아니라 다른 상품 — 「야간권」** (카탈로그 §3-20 · §3-13 HOT7 일몰 야간권). 저녁(`EVENING_TICK 1400`)에 밤이 열린 날은 **팔찌가 있어도 팀당 한 번 더** 발급된다: 값 `bandPrice × nightSalesMul()`, 회수는 그 등급의 `rides` 로 **다시 채운다.**
     · 근거는 **실측**이다(§0-B): 유입이 18시에 끊기므로 ⓐ 는 저녁에 안 돌고, ⓑ 만으로는 「저녁에 새로 자리를 잡는 팀」이라는 얇은 표본에 `nightPkg > 0` 이 매달린다. 야간권은 **이미 안에 있는 팀**에게 팔린다.
     · 래치는 **`nightBandTeams: Set<number>`**(`teamSeatedIds`(`game.ts:907`)와 같은 형태 · 하루마다 `clear()` · **저장 0필드**).
  ⑥ **「결제 정확히 1회」는 낮의 규칙이다.** 야간권은 이름도 라벨도 다르고 게이트도 다르다(52a-2 는 낮 · 54-9 는 밤).
- **D-C38 (신설 · 지시 2) 자유이용권 값 함수는 `bandPrice` 한 벌이고 `ppajiPkgPrice` 는 만들지 않는다.**
  ① `Game.ppajiPkgPrice` **삭제**(통합본 §5 `game.ts` 신설 목록에서 뺀다). `packageFor` 의 `ppaji` 분기와 `aimPreview` 가 **`bandPrice` 하나**를 부른다.
  ② **`src/sim/wristband.ts` 와 `src/data/wristbands.json` 을 [52a] → [50b] 로 당긴다.** `packages.json` 에 `band` 항목이 **0건**이라 `ppajiPkg()` 가 `null` 이고 확정 바 칩이 안 그려진다 — **동작 0**. D225ⓓ 가 `needsInRadius:'ppaji'` 유니언을 [48c] 로 당긴 것과 **같은 수법**이고, 그래야 D225ⓒ 의 「데이터가 켠다」가 음성 대조군으로 산다.
  ③ **확정 바가 부르는 값은 「그 등급에서 열린 최상위 팔찌」다** — `bandTop(grade) = bandOpened(grade).at(-1)`. 손님이 없는 자리라 취향을 못 쓰고, 「이 기구를 놓으면 이용권이 얼마가 되나」의 정직한 답이 **최상위 값**이다. 그 결과가 정확히 **0 / 400 / 600 / 700 / 1,000G** 다섯 값이다.
  ④ **D225 의 「P52-a 는 코드 0줄」에 범위를 붙인다** — 「**확정 바 돈 줄에 대해서** P52-a 는 코드 0줄이고, 더하는 것은 `packages.json` 한 항목이다」. (범위 없는 무변경 주장은 검증할 수 없다.) 그리고 **§5 [52a] 에 `aimPreview` 행을 명시**한다: **변경 0 · 이유 · 정적 자**.
  ⑤ **§1.1 의 「+100G/등급」·「400 → 500G」는 D233 이전 값이다** — 사다리로 고친다(§2.9).
- **D-C39 (신설 · 카탈로그 §3-14·15) 「몇 종」은 손님에 저장하지 않고 「기구가 몇 장을 먹나」로 낸다.**
  `facilities.json` 에 **`bandCost?: 1 | 2`**(기본 1) 한 필드. 시그니처 기구(§4(b) 4 잠수 제트보트)만 **2**. 카탈로그의 「타노스 = 전용 팔찌」를 **새 팔찌가 아니라 소모 수**로 옮긴 것이라 **손님 필드 0 · 새 등급 0** 이고, 비우면 P52-a 이전과 **완전히 같다**(그것이 이 축의 대조군).
  ⚠ **`allday`(99장)에는 사실상 안 문다** — 무제한이 무제한인 이유가 그것이다.
- **D-C40 (개정 · 지시 3 잔여 · 카탈로그 §3-1) 걸어온 팀의 「공짜 탑승」 구멍은 창구 ⓐ 가 막는다 — 게이트가 아니라 창구로.**
  딥 기구의 하드 게이트는 `bandLeft <= 0` 하나이고, **ⓐ 를 안 지으면 걸어온 팀은 못 탄다**(공짜로 타는 것이 아니라 아예 못 탄다). 그것이 「대여소 700G 를 첫날 짓는다」를 **결정**으로 만든다.
  ⚠ **ⓐ 를 무상 발급 전용(`vest_only` 만)으로 두는 안은 폐기했다** — 그러면 52a-8③(걸어온 팀의 팔찌 값 합 > 0)이 **구조적으로 실패**한다.
- **D-C11~D-C13 · D-C30~D-C32 · D-C33** — 통합 D107·D233~D236 으로 흡수. 이 판이 고치는 것은 D233 ②(D-C37)뿐.

### 안전 (P52-b) — 4판에서 변경 없음, **번호만 고친다**

- **D-C14~D-C18 · D-C24~D-C26 · D-C35** — 통합 D108·D109·D156·D157·D191~D193·D238 그대로.
- **D-C41 (신설 · 지시 4) P52-b 의 게이트 번호는 1..N 연속이다.** 52b-13/14/15 → **52b-8/9/10**, 어디로 갔는지는 §5-E 각주. 재발 방지는 **53b-16 의 자에 연속성 절**을 더하는 것이다(사람의 주의가 아니라 자).

### 계절 (P52-c) — 4판에서 변경 없음

- **D-C19~D-C22 · D-C34 · D-C36** — 통합 D111·D143·D159·D160·D222·D237·D239 그대로.

---

## 2. 규칙 · 수식

### 2.1 `convertFacility` (P51) — 통합본 §3.8 과 동일

판정 8단 · 보존 12필드 · `convertCost = round100((max(0, to.cost−from.cost) + to.cost×0.30) × (1 − 0.05×(lv−1)))` ·
`chainLen` 은 `afterWorldChange()`(`game.ts:2584`)가 다시 쓴다. **이 절은 이번 판에서 한 글자도 안 바꿨다** — 범위는 「통합본 §3.8 의 개조 블록 전체」다.

### 2.2 `convertPreview` · 2.3 그날 환불 `paidToday` — 통합본과 동일

`paidToday` 를 넣는 자리 다섯: `placeFacility`(`game.ts:2236`) · `convertFacility` · `upgradeFacility`(`:2078`) · `removeFacility`(`:2302`) · `FacilityStore.resetDay`(`facility.ts:244`).

### 2.4 사고 확률 · 2.5 위험 칩 · 2.10 SNS 감쇠 · 2.11 브리핑 — 통합본 §3.8 과 동일

⚠ **뽑는 자리 둘의 줄 번호만 고쳤다**(§0-B ⓗ): ① rig 가지 ② **`def.id === 'dock'` 가지(`game.ts:1529~1546`)**.

### 2.6 꺼진 기구 위의 손님 — **P50-b 소유** (게이트 50b-15)

### 2.7 팔찌 — **D-C37 로 전면 개정**

```ts
// src/sim/wristband.ts  ← **[50b] 로 당긴다** (D-C38 ②). 순수 · 뽑기 0 · 저장 0
export interface BandTier { id: string; name: string; rides: number; base: number; needGrade: 0|1|2|3|4 }
export function bandTiers(): readonly BandTier[];                  // wristbands.json (데이터)
export function bandOpened(grade: number): BandTier[];             // needGrade ≤ grade — 언제나 길이 ≥ 1 (vest_only)
export function bandTop(grade: number): BandTier;                  // = bandOpened(grade).at(-1)  ← 확정 바가 부르는 것
export function bandFor(thrill: number, opened: readonly BandTier[], minIdx = 0): BandTier;
export function bandPrice(t: BandTier, grade: number, step: number): number;   // round50(t.base × (1 + step × grade))
export const BAND_UNLIMITED = 99;                                  // rides ≥ 99 면 라벨이 「무제한」

// src/sim/guest.ts (`rentKey`(:123) 옆) — 저장 필드 둘. `vest?` 는 만들지 않는다 (D234)
band?: string | null;      // 팔찌 등급 id. null = 아직 창구를 안 지났다
bandLeft?: number;         // 남은 장수. 0 이어도 band 는 남는다 (반납하는 것은 장이지 팔찌가 아니다)
export const hasVest  = (g: { band?: string | null }): boolean => g.band != null;                    // 파생
export const bandPaid = (g: { band?: string | null }): boolean => g.band != null && g.band !== 'vest_only';  // D-C37 ③
```

**① 팔찌 4등급** (카탈로그 §3-13 — 「몇 종 몇 회」가 정본이고 무제한은 최상위 한 칸)

| id | 이름 | rides | base | `needGrade` | 그 등급에서의 값 | 카탈로그 |
|---|---|---:|---:|---|---:|---|
| `vest_only` | 구명조끼 | 0 | 0 | **0** | 0G | §3-1 |
| `big3` | 3종 팔찌 | 3 | 300 | **1** | 등급1 **400G** | §3-13 BIG3 |
| `big5` | 5종 팔찌 | 5 | 400 | **2** | 등급2 **600G** · 등급3 **700G** | §3-13 BIG5 |
| `allday` | 종일 무제한 | 99 | 500 | **4**(시그니처 빠지) | 등급4 **1,000G** | §3-13·15 |

**② 창구 둘, 결제 하나 — `claimSeat` 이 어떻게 갈리나 (지시 1 의 코드 블록)**

```ts
// src/sim/game.ts:917~931 claimSeat — **팔찌면 결제 다섯 줄을 통째로 건너뛴다**
private claimSeat(g: Guest, f: PlacedFacility): void {
  g.seatUid = f.uid;                                                            // :918 그대로
  this.stats.teamSeated = (this.stats.teamSeated ?? 0) + 1;                     // :919 그대로
  if (g.teamId !== null && !this.teamSeatedIds.has(g.teamId)) { … }             // :920 그대로
  if (this.guests.all.some((o) => o !== g && o.teamId === g.teamId && o.seatUid === f.uid && o.pkg !== null)) return;  // :922 그대로
  const pk0 = this.packageFor(g, f.uid);                                        // :923 그대로
  if (!pk0 || g.pkg) return;                                                    // :924 그대로
  if (pk0.def.band) {                                                           // ← [52a] 가 넣는 분기 (D-C37 ①)
    g.pkg = pk0.def.id; g.pkgUsed = false;                                      // :926 과 같은 뜻
    this.issueBand(g, bandAtSeat(pk0.def, this.seatPpajiGrade(f.uid) ?? 0, g), this.seatPpajiGrade(f.uid) ?? 0, f);
    return;                       // ⇐ :925 · :927 · :928 · :929 · :930 을 **전부** 건너뛴다
  }
  const pk = { def: pk0.def, price: Math.round(pk0.price * (1 + 0.1 * this.seatGradeOf(f.uid).grade)) }; // :925 — **팔찌가 아닌 패키지 전용**
  g.pkg = pk.def.id; g.pkgUsed = false;                                         // :926
  this.money += pk.price;                                                       // :927
  this.stats.pkg = (this.stats.pkg ?? 0) + pk.price;                            // :928
  f.incomeToday += pk.price; f.incomeTotal += pk.price; g.spentToday += pk.price; // :929
  if (pk.price > 0) this.fx.push({ … });                                        // :930
}
```
> 이 한 블록이 지시 1 의 세 충돌을 동시에 푼다:
> **이중 계상 없음**(`:927`·`:928` 을 건너뛴다) · **ⓑ 매출 0 아님**(`issueBand` 가 `f` 를 받아 `:929` 의 일을 대신한다) ·
> **52a-13 이 구조적으로 참**(`:925` 를 **분기로** 안 지나므로 자리 등급 배수가 팔찌에 못 붙는다 — 조건문이 아니라 **제어 흐름**이 보장한다).

```ts
// src/sim/game.ts (신설, [52a]) — 두 창구가 이것만 부른다. 뽑기 0 · 새 FSM 상태 0
private issueBand(buyer: Guest, tier: BandTier, grade: number, f?: PlacedFacility): boolean {
  const night = this.nightEve() && !this.nightBandTeams.has(rentKey(buyer));   // ← [54] 가 넣는 한 줄 (D-C37 ⑤)
  if (bandPaid(buyer) && !night) return false;                                 // 낮 1회 (vest_only 는 「산 것」이 아니다 — D-C37 ③)
  const base  = bandPrice(tier, grade, this.b.ppajiPkgGradeStep);
  const price = night ? Math.round(base * this.nightSalesMul()) : base;        // ← [54] 가 넣는 한 줄 (D241 ① 이 여기로)
  this.money += price;
  this.stats.pkg      = (this.stats.pkg ?? 0) + price;
  this.stats.pkgPpaji = (this.stats.pkgPpaji ?? 0) + price;                    // D201 분자
  buyer.spentToday += price;
  if (f) { f.incomeToday += price; f.incomeTotal += price; }                   // D202 — 어느 창구가 벌었나
  if (night) { this.nightPkgToday += price; this.nightBandTeams.add(rentKey(buyer)); }   // [54]
  for (const o of this.guests.all)                                             // 팀 전원에게 (읽기를 O(1) 로)
    if (o.state !== 'gone' && (o === buyer || (buyer.teamId !== null && o.teamId === buyer.teamId)))
      if (!bandPaid(o) || night) { o.band = tier.id; o.bandLeft = tier.rides; }
  if (price > 0) this.fx.push({ kind: 'buy', i: buyer.i, j: buyer.j, amount: price, label: night ? `${tier.name} · 야간권` : tier.name });
  return true;
}
private nightBandTeams = new Set<number>();   // 오늘 야간권을 산 팀 열쇠 — `teamSeatedIds`(:907) 선례 · `:1705` 에서 같이 clear · **저장 0**
```

| 창구 | 부르는 자리 | 무엇을 파나 | 등급의 출처 | tier 선택 |
|---|---|---|---|---|
| **ⓐ `rental_tube`** | `onFacilityUse`(**`game.ts:1498~1557`**) 의 그 def 가지 | **하루권**(정본 창구) | `ppajiGradeMax()` — 파크 최고 | `bandFor(g.taste?.thrill ?? 1, bandOpened(grade), 0)` |
| **ⓑ 자리 `ppaji`** | `claimSeat`(**`:917~931`**) 의 band 분기 | **팔찌를 끼운 자리 묶음** | `seatPpajiGrade(uid)` — 그 반경 | `bandAtSeat` = `bandFor(g.taste?.thrill ?? 1, bandOpened(grade), bandIndex(pk.band))` |
| **밤** | 위 둘 어느 쪽이든 | **야간권** (§3-20) | 같음 | 같음 · 값 `× nightSalesMul()` |

- **`packages.json` 의 `band: 'big5'` 는 「바닥 등급」이라는 뜻**이고 고정 tier 가 아니다 — `bandIndex('big5') = 2` 가 `minIdx` 로 들어간다. 그래야 등급 1(열린 것이 둘)에서도 `min(len−1, max(2, want)) = 1` 로 **정상 동작**한다.
- **ⓑ 는 `bandPaid` 면 아예 후보에 안 든다**(아래 ③) — 그래서 이 분기가 두 번 돌 일이 없다.
- **비대칭 하나는 의도다**: ⓐ 에서 팔찌를 산 팀은 자리에서 `meat` 를 **더** 살 수 있고, ⓑ 에서 산 팀은 못 산다(`g.pkg` 가 하나). 그것이 대여소 700G + 유지비 42G/일 의 값이다. 넘치는지는 **`pkgShare ≤ 0.3` · `foodShare ≥ 0.2`**(기존 밴드)가 지킨다 — 새 밴드 0.

**③ ⓑ 의 후보 좁히기 — `packageFor`(`game.ts:853`) 에 두 줄**

```ts
packageFor(g: Guest, seatUid: number): { def: PackageDef; price: number } | null {
  const taste = g.taste;
  const list  = this.seatPackages(seatUid).filter((pk) => !(pk.band && bandPaid(g)));   // ← 신설: 이미 산 팀에게는 팔 물건이 없다
  const order = list.sort((a, b) => (taste?.[b.taste] ?? 1) - (taste?.[a.taste] ?? 1) || a.id.localeCompare(b.id));
  const pk = order[0];
  if (!pk) return null;
  if (pk.needsInRadius.includes('dock')) { … }                                          // :858~861 그대로
  if (pk.band) return { def: pk, price: bandPrice(bandAtSeat(pk, this.seatPpajiGrade(seatUid) ?? 0, g), this.seatPpajiGrade(seatUid) ?? 0, this.b.ppajiPkgGradeStep) };  // ← 신설 (D-C38 ①)
  return { def: pk, price: pk.price };                                                  // :862 그대로
}
```

**④ 회수 소모** (카탈로그 §3-14) — 딥 기구 이용이 끝날 때 rig 가지에서
`g.bandLeft = Math.max(0, (g.bandLeft ?? 0) − (def.bandCost ?? 1))` (**D-C39**).
여울·풀·식당·자리·**코스 승선**은 **안 깎는다**(코스는 `eq.fee` 라는 제 축이 있다 — 이중 계상 금지).

**⑤ `areas.json` 10종 전수** — 통합본 §3.8 ④ 표 그대로(`kairo_island` **1.40**). `bandFor` 의 `want` 는 **`AreaTaste.thrill` 원값**을 읽는다(`swimSkill` 이 아니다):
`thrill ≥ 1.5 → 3 · ≥ 1.0 → 2 · ≥ 0.5 → 1 · else 0` ⇒ **최상위 3(station 1.8 · school 1.6 · kairo_island 1.6) : `big5` 3 : `big3` 3 : `vest_only` 1**.
```ts
return opened[Math.min(opened.length - 1, Math.max(minIdx, want))];   // max 를 먼저, min 을 뒤에 — 뽑기 0 · 결정론
```

**⑥ 게이트·가중치 — `pickTarget`(`guest.ts:763~810`) 한 곳** (시설 후보 루프 **`:778~800`**, `capacityOf(<=0)` 다음 줄)
```ts
if (def.class === 'rig') {
  const deep = hooks?.rigDeep?.(f.uid) ?? false;              // ← Game.rigDepthOf (⚠ ?? false 폴백을 만들지 말 것)
  if (deep && (g.bandLeft ?? 0) < (def.bandCost ?? 1)) continue;   // ① 팔찌 (하드) — D-C39
  if (deep && buildOf(g) === 'kid') continue;                      // ② 어린이 (하드)
  if (def.team && g.teamId === null) continue;                     // ③ 팀 기구 (하드)
  const s = swimSkill(g);
  w *= deep ? s : (2 - s);
  w *= hooks?.swimUrgeRig?.(f.uid) ?? 1;                           // 수온 (D159)
}
if (def.class === 'slide' && g.band == null) w *= 0.3;             // ④ 아쿠아삭스 (소프트, D235)
```
**뽑기 횟수 불변** — `pickTarget` 은 끝에서 `this.rng.next()` 를 **정확히 1회**(`guest.ts:804`) 뽑고 위 변경은 **후보와 가중치만** 바꾼다. **`guest.ts:795` 는 한 글자도 안 바꾼다.**

**⑦ 못 타는 이유는 화면이 말한다** — `say = '팔찌가 없네…'` + `setEmote(g,'grr')`(`guest.ts:40`), 하루 한 번(`onSeatless`(`:420`)와 같은 문법) · 대여소 시트에 「오늘 팔찌 N장(BIG5 M · BIG3 K)」 한 행.

**⑧ 팀 기구 보너스** — 같은 팀이 `use|queue` 로 하나 더 붙어 있으면 `sat += 5` (카탈로그 D표 「블롭점프는 둘이 있어야 성립」).

### 2.8 수온 · 2.9 값 사다리

수온은 통합본 §3.8 의 12칸 표 그대로(겨울 **8/9/7** · `clear` 없음).

**값 사다리 — 규칙 한 벌 (D-C38)**
```ts
bandPrice(t, grade, step) = round50(t.base × (1 + step × grade))          // step = balance.ppajiPkgGradeStep = 0.25
// 확정 바가 부르는 것 — 손님이 없으므로 「그 등급에서 열린 최상위」
pkgNow  = bandPrice(bandTop(gradeNow),  gradeNow,  step)
pkgNext = bandPrice(bandTop(gradeNext), gradeNext, step)
```

| 빠지 등급 | `bandOpened` | `bandTop` | 값 |
|---:|---|---|---:|
| 0 | `[vest_only]` | `vest_only` | **0G** |
| 1 | `+big3` | `big3` | `round50(300×1.25)` = **400G** |
| 2 | `+big5` | `big5` | `round50(400×1.50)` = **600G** |
| 3 | — | `big5` | `round50(400×1.75)` = **700G** |
| 4 | `+allday` | `allday` | `round50(500×2.00)` = **1,000G** |

- **사다리에 있는 전이는 넷**이다: `0 → 400` · `400 → 600` · `600 → 700` · `700 → 1,000`.
  ⚠ **`400 → 500G` 는 이 사다리에 없다** — §1.1 의 그 문자열과 「+100G/등급」은 **D233 이전 값**이라 §1.1 표와 게이트 52a-6b 에서 같이 고친다(§5-I).
- **D162 의 400G 는 보존된다**(첫 팔찌 = `big3` @등급1). 상한 800 → **1,000G** 은 무제한 칸이 새로 생겼기 때문이고, 자리 이용료·건설비(700~2,300G)와 **같은 자릿수**다(K50-② 「한 화면 안 눈금은 하나」).
- **`ppajiPkgPrice` 는 만들지 않는다** — `pk.price` 를 곱하는 순간 52a-15(`band` 항목은 `price === 0`)와 정면충돌한다.

### 2.10~2.11 SNS 감쇠 · 브리핑 — 통합본과 동일

---

## 3. 데이터

### 3.1 `facilities.json` — 내 몫의 새 필드

| 필드 | 타입 | 뜻 | 없으면 | 데이터 검사 |
|---|---|---|---|---|
| `thrill` | `0..4` | 스릴 | 0 | `class==='rig'` ⇒ 있다 |
| `safe` | `0..4` | 안전 | 0 | 기본식 `safe = 2 − floor(thrill/2)`(개조판만 예외) |
| `team` | `number?` | 같이 타는 인원 | 없음 | ⇒ `capacity >= team` |
| **`bandCost`** | **`1 \| 2`** | **팔찌를 몇 장 먹나 (D-C39)** | **1** | **`depth==='deep'` 인 rig 에만 · 판 전체에서 `2` 는 `≤ 1종`** |
| `guardRadius` | `number?` | 망루·구조정 반경 | 종류 기본(6·10) | `watchtower*`·`rescue_dock` 에만 |
| `rentKind` | `'pkg'\|'ride'` | 거치대 갈래 | 없음 | `gear_rack='pkg'`(D-C22) |

`rental_tube` — **값 무변경**(700/8/42/`capacity 2`/`useTicks 6`/`indoorOnly`/`passBy 'enter'`/`unlock start` — 실측). 바꾸는 것은 `name` 「대여소」 → **「구명조끼 대여소」** 와 `desc`(**팔찌 창구**) 둘뿐이다.
안전 3종(`watchtower` 900/10/53 · `watchtower_horn` 1,300/14/74 · `rescue_dock` 1,600/18/95)은 통합본 §3.8 과 동일 — `lifeguard_chair` 실측 900/10/53/cap 1 과 같은 눈금이라 `COST_POP_BAND.utility [60,140]`(`data.test.ts:57~62`)·`MAINT_PER_POP 5.3`(`:75`)을 통과하고 `EXCEPTIONS`(`:74`)를 **안 건드린다.**

### 3.2 `rig-parts.json` 13 · 3.3 `rigs.json` 20 · 3.4 `balance.json` — 통합본 §4.4·§4.5·§4.7 과 동일

⚠ `balance.json` 새 키에 **`ppajiPkgGradeStep` 0.25** 가 있고 그것이 **`bandPrice` 의 유일한 계수**다(코드 상수 0).

### 3.5 `events.json` · 3.6 `courses.json` — 통합본과 동일

### 3.7 `src/data/wristbands.json` — **[50b] 로 당긴다** (D-C38 ②)

```jsonc
[ { "id": "vest_only", "name": "구명조끼",    "rides": 0,  "base": 0,   "needGrade": 0 },
  { "id": "big3",      "name": "3종 팔찌",    "rides": 3,  "base": 300, "needGrade": 1 },
  { "id": "big5",      "name": "5종 팔찌",    "rides": 5,  "base": 400, "needGrade": 2 },
  { "id": "allday",    "name": "종일 무제한", "rides": 99, "base": 500, "needGrade": 4 } ]
```
`packages.json` 의 다섯째(**[52a] 가 더하는 유일한 것**):
```jsonc
{ "id": "ppaji", "name": "빠지 자유이용권", "needsInRadius": ["ppaji"],
  "price": 0, "band": "big5", "taste": "thrill", "sat": 8, "hp": 0,
  "desc": "자리 반경에 빠지 — 팔찌를 받는다(구명조끼 포함). 값은 빠지 등급을 탄다" }
```
- **`price: 0` 은 「값이 `wristbands.json` 에 있다」는 뜻**이다. 데이터 검사가 **`band` 가 있는 패키지는 `price === 0`** 을 강제한다(52a-15).
- **`band: 'big5'` 는 바닥 등급**이다 — 고정 tier 로 읽으면 등급 1 에서 열리지도 않은 칸을 값매김한다.
- `hp: 0` 은 `gear` 와 같은 갈래(노는 상품)라 「기구 → 수영 → 배고픔 → 매점」 사슬(D33)을 안 끊는다.
- **`notePackages`(`game.ts:867~`)가 발견 인박스를 이미 낸다** — 첫 기구로 등급 0 → 1 이 되는 tick 에 한 줄(모달 아님). **새 코드 0줄.**

---

## 4. 코드 변경 목록 — **통합본 §5 에 대한 델타만** (이 판이 바꾸는 것)

### 신설 (페이즈 이동 포함)

| 파일 | 내용 | 4판 | **5판** | 왜 |
|---|---|---|---|---|
| `src/sim/wristband.ts` | `BandTier`·`bandTiers`·`bandOpened`·**`bandTop`**·`bandFor`·**`bandIndex`**·`bandPrice`·`BAND_UNLIMITED` | 52a | **50b** | D-C38 ② — `aimPreview` 가 부를 함수가 P50-b 에 있어야 값 규칙이 한 벌이다 |
| `src/data/wristbands.json` | 팔찌 4등급 | 52a | **50b** | 같음. `packages.json` 에 `band` 항목이 0건이라 **동작 0** |
| `src/sim/accident.ts` | 통합본 그대로 | 52b | 52b | — |
| `tools/measure.ts` | 네 지표 (P51 종료 조건) | 51 | 51 | — |

### 삭제

| 무엇 | 왜 |
|---|---|
| **`Game.ppajiPkgPrice`** (통합본 §5 `game.ts` 신설 목록 [50b] 행) | **D-C38 ①** — `bandPrice` 와 두 벌이 되고, 52a-15 가 `price === 0` 을 요구하는 순간 **0 을 낸다** |
| **`Game.ppajiPkg()` 는 남긴다** | 「데이터가 켠다」(D225ⓒ)의 음성 대조군이라 필요하다 — 반환만 `PackageDef \| null` 그대로 |

### 수정 — `src/sim/game.ts`

| 자리 | 무엇 | P |
|---|---|---|
| **`:853 packageFor`** | ⓐ `seatPackages(...)` 뒤에 **`.filter((pk) => !(pk.band && bandPaid(g)))`** ⓑ `dock` 분기(`:858~861`) **뒤**에 `if (pk.band) return { def: pk, price: bandPrice(bandAtSeat(...), grade, step) }` — **`bandPrice` 만 부른다** | **52a** |
| **`:917~931 claimSeat`** | **§2.7 ② 코드 블록 그대로** — `pk0.def.band` 면 `issueBand` 를 부르고 **`:925`·`:927`·`:928`·`:929`·`:930` 다섯 줄을 건너뛴다 | **52a** |
| `:1498~1557 onFacilityUse` | `rental_tube` 가지(**ⓐ 팔찌 발급**) · rig 가지(**`bandLeft -= def.bandCost ?? 1`**) · dock 가지(`:1529~1546`) | 52a·52b |
| `game.ts` 신설 | **`issueBand(buyer, tier, grade, f?)`**(§2.7 ②) · `seatScan`/`seatPpajiGrade`(D212) · **`bandAtSeat`**(3줄 private) | **52a** |
| `game.ts` 신설 | **`nightBandTeams: Set<number>`** + `:1705` 의 `teamSeatedIds.clear()` 옆 한 줄 · `nightPkgToday` | **54** |
| **`issueBand` 안 두 줄** | `const night = this.nightEve() && !this.nightBandTeams.has(rentKey(buyer))` · `price = night ? round(base × nightSalesMul()) : base` — **D241 ① 의 자리가 `:925` 에서 여기로 옮겨 온다** | **54** |
| `:925` | **밤 배수를 안 얹는다** (D241 ① 개정) — 이 줄은 이제 **팔찌가 아닌 패키지 전용**이다 | 54 |
| 나머지 | 통합본 §5 `game.ts` 목록 그대로 | — |

### 수정 — `src/sim/guest.ts`

| 자리 | 무엇 | P |
|---|---|---|
| `:52~120 Guest` | `band?: string \| null` · `bandLeft?: number` **둘** (`vest?` 는 안 만든다) | 52a |
| `:123 옆` | `swimSkill`·`hasVest`·**`bandPaid`** 순수 함수 셋 | 52a |
| `:166 GuestHooks` | `rigDeep?`·`swimUrgeRig?`·`swimUrgePool?` | 52a·52c |
| `:350` 스폰 · `:932 fromSnapshot` | `band: null, bandLeft: 0` / `band: g.band ?? null, bandLeft: g.bandLeft ?? 0` | 52a |
| **`:778~800`** 시설 후보 루프 · `:769~776` 풀 루프 | §2.7 ⑥ | 52a·52c |
| ⚠ `:795` · `:804` | **한 글자도 안 바꾼다** — 범위는 「그 두 줄」 | — |

### 수정 — `src/ui/` · `tools/`

| 파일:자리 | 무엇 | P |
|---|---|---|
| **`src/sim/game.ts` `aimPreview`** | **변경 0.** `pkgNow/pkgNext` 는 [50b] 가 `bandTop`+`bandPrice` 로 이미 낸다 — **[52a] 는 데이터 한 항목만** 더한다. 정적 자가 그것을 지킨다(52a-6b ⓓ) | **50b(구현) · 52a(대조)** |
| `ui/windows/place.ts:124~128` | 확정 바 라벨 · `showRing` · 위험 칩 — 통합본과 동일 | 50b·52b |
| `ui/windows/facility-info.ts:96~102` | 위험 행(넷째) · 개조 델타 행 · **대여소의 「오늘 팔찌 N장」 행** | 51·52b |
| **`tools/check-ui.mjs:26~37`** | `FAULTS` **10 → 12** (**P50-b +1 `--rig-dim`** · **P52-b +1 `--risk-danger`**) | 50b·52b |
| `tools/check-ui.mjs:127~142` | `PAIRS` **14 → 19** (`--rig-dim` 1 · 위험 칩 4) | 50b·52b |
| `tools/verify.ts:636~644` | `routes` **7 → 8** + `open: string[]` | 51 |
| `tools/bot.ts:17~47` | `BANDS` 29 → 49 (**내 몫 변경 0** — 새 20 은 통합본 §6 밴드 표 소유) | — |

---

## 5. 게이트 기준 (측정 가능한 문장 · 자 종류를 항목 끝에)

### 5-0. 번호 이동표 (이 판)

| 옛 | 새 | 왜 |
|---|---|---|
| **52b-13 · 52b-14 · 52b-15** | **52b-8 · 52b-9 · 52b-10** | 지시 4 — 한 페이즈 안에서 번호가 연속이어야 한다 |
| (옛 52b-8~12) | **52c-1~5** (D237 이 이미 옮겼다) | 각주로 남긴다 — 되짚는 사람이 사라진 다섯을 찾을 수 있어야 한다 |
| (옛 52b-13 의 유실 절) | **52c-6** | 채널 검사를 축마다 |
| — | **52c-7** | P52-c 음성 대조군(4판 신설, 그대로) |
| **52a-2 · 52a-6b · 52a-13 · 52a-14** | 같은 번호, **문안 개정** | 지시 1·2 |
| — | **54-8 신설(계측)** · **옛 54-8 → 54-9** | 지시 1 — 「곱할 대상이 있다」를 재기 **전에** 표본을 먼저 찍는다. **게이트 항 186 → 187** |
| 내 4판 `50b-16`/`50b-17` | **통합본 `50b-17`/`50b-18`** | §0-B ⓐ |

### 5-A. 골든 열

| P | 골든 | 사유 |
|---|---|---|
| **P50-b** | 재베이크 (통합본) | ⚠ **`wristband.ts`+`wristbands.json` 을 당겨도 골든은 안 움직인다** — `packages.json` 에 `band` 항목이 0건이라 `ppajiPkg()` 가 `null` 이다. **50b-20 이 그것을 단언한다** |
| **P51** | 재베이크 + `--no-convert` 대조군 불변 | 봇이 부품을 사고 개조한다 |
| **P52-a** | **재베이크** | 팔찌 게이트·`swimSkill` 이 `pickTarget` 가중치를 바꾼다 |
| **P52-b** | 재베이크 + `accidentBase 0` 스트림 대조군 불변 | 사고·SNS 감쇠·브리핑 |
| **P52-c** | 재베이크 + `swimUrgeMin 1` 대조군 불변 | 수온이 목표 선택을 바꾼다 |
| **P54** | **해시 표 바이트 동일** | `DayReport` 의 `night*` 는 0/false 면 안 쓰므로 `JSON.stringify` 에서 사라진다(54-9③) |

### 5-B. `gate -- p51` — 기구 개조 (20항)

51-1 ~ 51-19 는 **통합본 그대로**. 이 판이 고치는 것 없음.
⚠ 51-1(`tools/measure.ts` 네 지표)은 **P51 의 종료 조건**이고 **P52-b 의 하드 선행**이다(`accidentBase` 재유도가 거기 걸려 있다).

### 5-C. `gate -- p52a` — 손님 · 팔찌 (16항, 항 수 변화 0)

- **52a-1 팔찌 A/B** — 통합본 그대로 **(봇)**
- **⭐ 52a-2 팀 배포 · 결제 소유자 (개정, 지시 1)**
  ⓐ 팀원 하나가 창구를 지난 **그 tick** 에 같은 팀 전원(`state !== 'gone'`)의 `band !== null ∧ bandLeft === tier.rides` — 팀 2·3·4인 전수.
  ⓑ **결제는 정확히 1회** — `stats.pkgPpaji` 증가분 == `bandPrice` **한 장**.
  ⓒ **두 창구 교차 전수 네 벌**(같은 팀·같은 날): **ⓐ→ⓑ · ⓑ→ⓐ · ⓐ→ⓐ · ⓑ→ⓑ** 에서 `stats.pkgPpaji` 증가분이 **정확히 한 장 값**이고 `money` 증가분이 그것과 **같다**(이중 계상 0).
  ⓓ **`vest_only` 는 결제가 아니다** — `vest_only`(ⓐ) → `big5`(ⓑ) 순서에서 결제는 **1회이고 값은 `big5`** 다.
  ⓔ **`claimSeat` 의 다섯 줄을 안 지난다** — band 분기에서 `f.incomeToday` 증가분 == `bandPrice` (즉 `issueBand` 가 대신 든다) ∧ `stats.pkg` 증가분이 **한 장 값**(`:928` 이 또 더하면 두 배가 되어 빨간불).
  **음성 대조군**: `claimSeat` 의 `return` 을 지워 `:927`·`:928` 을 다시 지나게 하면 ⓒ 가 **정확히 2배**로 빨간불. **(단위)**
- **52a-3 `swimSkill`** — 통합본 그대로(10종 30값 전수) **(단위)**
- **52a-4 어린이·팀** — 통합본 그대로 **(단위)**
- **52a-5 FSM 정적** `GuestState` 멤버 **11** ∧ 문자열 집합이 P50-b 커밋과 동일 · `pickTarget` 안 `this.rng.next()` **정확히 1회**(`guest.ts:804`) · **`guest.ts:795` 가 P50-b 커밋과 바이트 동일** **(정적)**
- **52a-6 값이 등급을 탄다** — 통합본 그대로 **(단위)**
- **⭐ 52a-6b 미리보기와 결제가 같은 값이다 (개정, 지시 2)**
  ⓐ **다섯 값 표 전수** — `aimPreview(...).pkgNext` 가 빠지 등급 0/1/2/3/4 에서 **0 / 400 / 600 / 700 / 1,000G**, 오차 0.
  ⓑ **결제와 오차 0** — 같은 자리에서 확정한 뒤 `packageFor(취향 `station`(thrill 1.8) 손님, seatUid).price` 가 ⓐ 의 같은 값(다섯 등급 전수). ⚠ 픽스처가 `station` 인 이유는 **`want = 3` 이라 `bandTop` 과 반드시 같아지기** 때문이다 — 취향이 낮은 손님은 더 싼 칸을 사는 것이 **정상**이고 그것을 오차로 세면 자가 거짓말이 된다.
  ⓒ **형식 검사** — 확정 바 칩 텍스트가 **`/자유이용권 [\d,]+ → [\d,]+G/`** 에 맞고, 그 두 수가 **사다리에 있는 전이 넷**(`0→400`·`400→600`·`600→700`·`700→1,000`) 중 하나다. ⚠ 옛 문안의 `400 → 500G` 는 **사다리에 없다** — 문자열 상수로 재던 절을 이것으로 바꾼다.
  ⓓ **정적, 값 함수는 한 벌** — `src/` 에 **`ppajiPkgPrice` 심볼 0건** ∧ `bandPrice(` 호출부가 **정확히 셋**(`packageFor` · `aimPreview` · `issueBand`) ∧ `place.ts` 에 `PPAJI_PKG_GRADE_STEP`·`ppajiPkgGradeStep` **0건** ∧ **`aimPreview` 본문이 P50-b 커밋과 바이트 동일**(P52-a 가 안 건드린다는 증명).
  ⓔ **음성 대조군**: `aimPreview` 안에서 곱셈을 다시 쓰고 계수를 0.2 로 어긋내면 다섯 중 **넷**이 빨간불. **(단위 + 하네스 + 정적)**
- **52a-7 밴드 (D201)** — 통합본 그대로. ⚠ `pkgKinds` 밴드는 **`[3,4]` → `[4,5]`**(`tools/bot.ts:42` 실측 `lo:3 hi:4`) **(봇)**
- **⭐ 52a-8 두 창구가 서로를 안 죽인다 (개정, 지시 1)**
  ① `rental_tube` **안 지은** 판 — **자리를 잡은 팀**의 딥 기구 이용 **> 0** ∧ `stats.pkgPpaji > 0`(ⓑ 가 판다).
  ② 같은 판 — **걸어온 팀**의 딥 기구 이용 **0**(창구를 안 지났다).
  ③ `rental_tube` **지은** 판 — 걸어온 팀의 딥 기구 이용 **> 0** ∧ 그 팀이 낸 팔찌 값 합 **> 0**.
  ④ **같은 판에서 ⓑ 가 안 굶는다** — 자리를 잡은 팀 중 **`pkg !== null` 인 팀의 몫 ≥ 0.5** 이고 그 패키지가 전부 `ppaji` 인 것은 **아니다**(ⓐ 를 지난 팀은 `meat`·`stay` 를 산다). ⚠ **「ⓑ 의 `pkgPpaji` 가 0 이다」는 빨간불이 아니다** — 성숙한 판에서 ⓑ 가 파는 것은 팔찌가 아니라 **다른 패키지**다.
  ⑤ `--no-vest` 에서 ①③ 둘 다 0. **(단위)**
- **52a-9 발견 채널** — 통합본 그대로 **(하네스 + 단위)**
- **52a-10 음성 대조군** `--no-vest` 에서 `vestShare`·`rigUseShare` ✕ · 스위치는 **`issueBand` 진입 한 곳** (정적: `noVest` 를 읽는 자리 **1곳**) **(봇 + 정적)**
- **52a-11 (D212)** — 통합본 그대로 **(단위 + 정적)**
- **52a-12 팔찌 등급** `wristbands.json` **4종** · `rides` **[0,3,5,99]** · `needGrade` **[0,1,2,4]** · `bandFor` 가 10지역을 **최상위 3 : `big5` 3 : `big3` 3 : `vest_only` 1** 로 가른다(전수) · **`bandTop(0..4)` 가 `vest_only·big3·big5·big5·allday`** · **뽑기 0회**(같은 입력 100회 호출에 rng 상태 불변) **(단위)**
- **⭐ 52a-13 자리 등급 배수를 안 탄다 (개정, 지시 1)**
  ⓐ 같은 빠지 등급이면 **자리 등급 1 과 5 에서 값이 동일**(다섯 등급 × 두 자리 = 10값).
  ⓑ **제어 흐름으로 보장한다** — 정적: `claimSeat` 의 band 분기가 **`:925` 보다 앞에서 `return`** 한다(AST: band 분기 블록 안에 `return` 이 있고, `seatGradeOf` 호출이 그 뒤에만 있다).
  **음성**: 그 `return` 을 지우면 등급4 빠지 + 등급5 자리에서 **1,200G**(= 1,000 × 1.2)가 나와 빨간불. **(단위 + 정적)**
- **⭐ 52a-14 회수 소모 (개정, D-C39)** `big3` 팀이 딥 기구를 **정확히 3회** 타고 4회째부터 후보에서 빠진다 · **`bandCost: 2` 기구는 `big3` 로 1회만** 탄다 · 여울·풀·식당·자리·**코스 승선**은 `bandLeft` 를 **안 깎는다** · `allday` 는 128일 동안 안 마른다 · **`bandCost` 를 데이터에서 전부 지우면 P52-a 이전과 이용 횟수가 바이트 동일**(대조군) **(단위)**
- **52a-15 값이 두 파일에 없다** `packages.json` 에서 `band` 가 있는 항목은 **`price === 0`** ∧ 그 `band` id 가 `wristbands.json` 에 **있다** ∧ **`bandIndex` 로 읽힌다**(고정 tier 가 아니다) · `src/` 에 팔찌 값 리터럴(`300|400|500` 이 팔찌 문맥에서) **0건** **(단위 + 정적)**

### 5-D. `gate -- p52b` — **안전** (10항 · 번호 **52b-1~10 연속**)

- **52b-1 위험 칩** — 통합본 그대로 **(단위 + 하네스)**
- **52b-2 사고 인과** — 그대로 **(봇)**
- **52b-3 사고 총량** — 그대로 **(봇)**
- **52b-4 사고 반경** — 그대로 **(봇 + 단위)**
- **52b-5 안전이 무는가** — 그대로 **(봇)**
- **52b-6 브리핑** — 그대로 **(봇 + 하네스)**
- **52b-7 결정론** — 그대로 **(단위)**
- **52b-8 채널 (사고)** ← **옛 52b-13** — 문안 그대로 **(정적 + 하네스)**
- **52b-9 음성 대조군** ← **옛 52b-14** — 문안 그대로 **(봇)**
- **⭐ 52b-10 위험 칩 색이 자에 걸린다** ← **옛 52b-15**, ⓒ **개정(지시 3)**
  ⓐ **정적**: `check-ui.mjs` 의 `PAIRS`(현재 **`:127~142`, 항목 `:128~141`, 14쌍**)가 **19쌍**이고 그중 **4쌍이 `--risk-safe`·`--risk-watch`·`--risk-alert`·`--risk-danger` 각각의 칩 면 위 글씨(`--btn-ink`)**이며 전부 **4.5:1 이상**.
  ⓑ **정적**: 네 칩 면끼리의 상대 휘도 비가 서로 **≥ 1.5:1** — 흑백·색약에서도 4단이 순서로 읽힌다.
  ⓒ **음성 대조군 (개정)**: `--selftest` 의 `FAULTS`(현재 **`:26~37`** · 항목 **`:27~36`** · **10건**)가 **12건**이고 그중 **새 둘**이 각각 **`--rig-dim` 쌍**(P50-b, 50b-17 소유)과 **`--risk-danger` 쌍**(P52-b, 이 항 소유)을 깨서 **`S3` 가 각각 빨간불**이 된다. ⚠ **「10 → 11」로 적지 말 것** — 50b-17 과 이 항이 **각각 하나씩** 더한다(4판은 둘 다 11 이라 적어 P52-b 에서 `FAULTS.length === 11` 이 구조적으로 빨간불이었다).
  ⓓ **정적**: `src/ui/**`·`src/render/**` 에 위험 칩 hex 리터럴 **0**. **(정적)**

> **각주 — 옛 번호는 어디로 갔나** (D237 · 이 판)
> 옛 **52b-8~12**(수온 표 · 비수기 · 이중 곱 · 유입 불변 · 유실) → **52c-1~5** · 옛 **52b-13** 의 유실 채널 절 → **52c-6** ·
> 옛 **52b-13/14/15**(사고 채널 · 음성 · 칩 색) → **52b-8/9/10**. **삭제된 항은 0개다.**

### 5-E. `gate -- p52c` — **계절** (7항, 52c-1~7)

52c-1 ~ 52c-7 은 **통합본 그대로**. 이 판이 고치는 것 없음.

### 5-F. `gate -- p54` — **밤** (8 → **9항**) · 문안은 내가 내고 **소유는 섹션 D**

- **⭐ 54-8 밤에 팔 표본이 있다 (신설, 지시 1 · 계측 선행)** — **54-9 를 재기 전에 먼저 찍는다.**
  ⓐ 봇 8시드×128일 요약에 **네 줄**을 낸다: **밤이 열린 날 수** · **밤이 열린 날 저녁(≥ `EVENING_TICK 1400`)의 `issueBand` 호출 건수 중앙** · 그중 **야간권 건수 중앙** · 저녁에 **자리를 새로 잡은 팀 수 중앙**.
  ⓑ 문턱: **저녁 `issueBand` 호출 중앙 ≥ 3/일**. 미달이면 **54-9① 을 재지 않고 이 항이 원인을 가리킨다** — 손잡이는 **야간권 조건**(`nightBandTeams` 의 범위)이지 `nightSalesMul` 이 아니다.
  ⓒ **근거를 같이 출력한다**: `ARRIVAL_TO_TICK === EVENING_TICK === 1400`(정적 단언) — **18시부터 새 손님이 0명**이므로 저녁 표본은 **이미 안에 있는 팀**에서만 나온다. 이 단언이 깨지면(개장 시각을 건드리면) 문턱을 **재유도**한다.
  **(봇 + 정적)**
- **⭐ 54-9 밤이 곱할 대상이 있다** ← **옛 54-8**, ① 개정
  ① 밤이 열린 날의 `nightPkg`·`nightFood`·`nightFee` 가 **셋 다 > 0**. ⚠ **`nightPkg` 의 출처는 `issueBand` 안 한 줄**이고 `game.ts:925` 가 **아니다**(D-C37 ④) — 정적: `nightSalesMul()` 호출부가 **정확히 셋**(`issueBand` · `onFacilityUse`(`:1511`) · `usageFee`(`:1547~1553`))이고 **`claimSeat` 안에 0건**.
  ② `syncNightSet`(`:2582`) 확장 뒤 밤 집합에 `menuSlots > 0` 시설 **≥ 1**.
  ③ **골든 보존**: 3시드×16일 스냅샷 JSON 에 `"night` 로 시작하는 키 **0개** ∧ 해시 표 **바이트 동일**.
  ④ `nightOn` 래치가 스냅샷 왕복에서 살아난다(저장 필드 0) · **`nightBandTeams` 도 저장하지 않는다** — 저녁에 저장→로드하면 그 팀이 야간권을 **한 번 더 살 수 있다**. ⚠ **의도된 이탈**이고 하루 상한이 아니라 **팀당 상한**이라 최악 +1건이다. `teamSeatedIds`(`:907`, 같은 형태)와 **같은 규칙**으로 둔다.
  **(봇 + 골든 + 정적)**

### 5-G. 밴드 — **내 몫 변경 0**

통합본 §6 밴드 표(기존 29 + 새 20 = **49**) 그대로. 내 소유는 **P51 4 · P52-a 3 · P52-b 2 · P52-c 1 = 10** 이고 값도 안 바꾼다.
⚠ 하나만 짚는다: `offSeasonSwim` **0.20~0.55**(계산 봄 0.439 · 가을 0.250) — 3판의 하한 0.25 는 계산값에 **정확히 붙어** 표본 한 칸에 흔들렸다.
⚠ 기존 밴드 하나는 **값이 바뀐다**: `pkgKinds` `[3,4]` → **`[4,5]`**(`packages.json` 이 4 → 5종). 그것은 새 밴드가 아니라 **기존 밴드 재보정**이고 52a-7 이 소유한다.

### 5-H. 사람 확인 — **항 수 변화 0** (통합본 §9.2 의 H35~H54 = 20건)

| # | 축 | P | 무엇이 보여야 하나 |
|---|---|---|---|
| H39 | 팔찌 | 52-a | 구명조끼 대여소를 철거하면 딥 기구에 **걸어온 팀이 아무도 안 들어가고** 말풍선이 「팔찌가 없네…」로 이유를 말한다 |
| H45 | 위험 | 52-b | 스릴 4 기구를 조준하면 확정 **전에** 빨간 `위험` 칩이 보이고, 망루 + 알바로 그 자리에서 `경계` 로 내려간다 |
| H46 | 개조 | 51 | 개조 버튼 **위 한 줄**만 보고 누를지 정할 수 있다 |
| **H47 (개정)** | 자유이용권 | 52-a · **54** | ⓐ 첫 기구 확정 직후 인박스 한 줄(모달 아님) ⓑ 대여소 시트에 「오늘 팔찌 N장」 ⓒ **대여소에서 팔찌를 산 팀이 자리에 앉으면 「고기 패키지」를 사고, 대여소가 없으면 그 자리에서 「빠지 자유이용권」을 산다** — 두 창구가 **다른 것을 판다**로 읽힌다 ⓓ **밤이 열린 저녁에 같은 팀이 「빠지 야간권」을 한 번 더 산다** |
| H50 | 안전교육 | 52-b | 코스 창에서 켜면 「하루 예상」이 그 자리에서 줄고 선착장 위험 칩이 한 단 내려간다 |
| H51 | 계절 | 52-c | 가을 판을 열면 야외 기구 앞이 비고 실내 풀·사우나에 줄이 선다 |
| H52 | 감사 등록 | 51 · 50-b | 새 창(`win-rig`)·「빠지」 탭·`pool-info`·확정 바를 폰(393×852)에서 차례로 열어 엄지로 전부 눌린다 |

### 5-I. 통합본 본문에 손대야 하는 자리 — **문안까지 적는다**

| 어디 | 지금 | **고칠 문장** |
|---|---|---|
| **§1.1 30초 행** | 「**자유이용권 값 +100G/등급**(D162·D225)」 · 칩 예시 「`등급 1 → 2 · 연결 3 · 자유이용권 400 → 500G`」 | 「**자유이용권 값이 등급마다 한 칸 오른다** — **0 / 400 / 600 / 700 / 1,000G**(D162·D225·**D233**)」 · 칩 예시 「`등급 1 → 2 · 연결 3 · 자유이용권 400 → 600G`」 |
| **§2.6 D225** | 「… `aimPreview` 가 `pkgNow/pkgNext` 를 sim 실효값으로 내고 **P52-a 는 코드 0줄이다**」 · ⓑ 「같은 순수 함수 **`ppajiPkgPrice(pk, grade)`**」 | 「… **확정 바 돈 줄에 대해서** P52-a 는 코드 0줄이고 더하는 것은 `packages.json` **한 항목**이다」 · ⓑ 「같은 순수 함수 **`bandPrice(tier, grade, step)`** — `wristband.ts` 와 `wristbands.json` 을 **[50b] 로 당긴다**(패키지 데이터 0건이라 동작 0). **`ppajiPkgPrice` 는 만들지 않는다**」 |
| **§2.6 D233 ②** | 「둘 다 `issueBand` 하나를 지나고 같은 `stats.pkgPpaji` 에 쌓인다」 | + 「**결제는 `issueBand` 하나가 한다** — `claimSeat` 의 `:925`·`:927`·`:928`·`:929`·`:930` 다섯 줄은 `pk.band` 면 건너뛴다. 두 창구는 **무엇을 파나**로 갈린다(ⓐ 하루권 · ⓑ 팔찌를 끼운 자리 묶음, `bandPaid` 면 후보에서 빠진다)」 → **D-C37** |
| **§2.6 D241 ①** | 「① **자유이용권**(`game.ts:925`)」 | 「① **자유이용권** — 곱하는 자리는 **`issueBand` 안 한 줄**이다(`game.ts:925` 가 아니다). ⓐ·ⓑ 어느 창구로 들어와도 밤을 타야 하고, `:925` 는 **팔찌가 아닌 패키지 전용**이 된다. 그리고 **유입이 18시에 끊기므로**(`ARRIVAL_TO_TICK === EVENING_TICK === 1400`) 배수만으로는 표본이 안 나온다 — **야간권**(하루 1 + 밤 1)이 그 짝이다」 |
| **§3.8 팔찌 ②** | ⓑ 「기존 경로를 그대로 탄다 … `issueBand` 를 부른다」 | **§2.7 ② 의 코드 블록으로 교체** (다섯 줄을 건너뛰는 것이 보이게) |
| **§3.9 ③** | `if (pk.band) return { …, price: bandPrice(tierOf(pk.band), …) }` | `bandAtSeat`(= `bandFor(taste, bandOpened(grade), bandIndex(pk.band))`) — **`pk.band` 는 바닥 등급이지 고정 tier 가 아니다** + `packageFor` 앞의 **`bandPaid` 필터 한 줄** |
| **§3.9 자유이용권 값** | `static ppajiPkgPrice(pk, grade)` 블록 | **삭제** — `bandPrice` 와 `bandTop` 으로 교체(§2.9 표) |
| **§5 `game.ts` 신설 [50b]** | 「**`ppajiPkgPrice`/`ppajiPkg`**」 | 「**`ppajiPkg`**」 + 신설 파일 표의 `wristband.ts`·`wristbands.json` 을 **52a → 50b** 로 |
| **§5 `game.ts` 수정 [52a]** | `claimSeat` 「`ppaji` 면 `issueBand`」 | 「**`:925`·`:927`·`:928`·`:929`·`:930` 다섯 줄을 `pk.band` 면 건너뛴다**」 + **`aimPreview` 행 신설**(「**변경 0** — [50b] 소유. 52a-6bⓓ 가 바이트 동일을 잰다」) |
| **§5 UI 표(`:2115`)** | 「`PAIRS` **14 → 19쌍** · `FAULTS` **10 → 11**」 | 「`PAIRS` **14 → 19쌍**(`--rig-dim` 1 · 위험 칩 4) · `FAULTS` **10 → 12**(**P50-b +1 · P52-b +1**)」 |
| **50b-17 ⓑ** | 「`--selftest` 의 **새 건 하나**」 | 「`FAULTS` 가 **12건**이고 그중 **P50-b 가 더한 하나**가 그 쌍을 깬다」 |
| **§6 P52-b 게이트 절** | 52b-1~7 · 52b-13·14·15 | **52b-1~10 연속** + §5-D 의 각주 |
| **§6 P54 게이트 절** | 8항 (54-1~54-8) | **9항** — **54-8 신설(계측)** · 옛 54-8 → **54-9** |
| **53b-16** | 태그 자 | + 「**한 페이즈 안에서 항 번호가 1..N 연속이다**(빠짐·중복 0). **음성 대조군**: 아무 항의 번호를 하나 건너뛰면 그 페이즈 이름과 함께 빠진 번호를 출력하고 빨간불」 |
| **검산 r4 「게이트 항」** | **186** = 8+13+9+4+16+16+11+19+20+16+10+7+7+16+**8**+6 | **187** = 같은 합에서 **P54 8 → 9** |
| **검산 r4 「밴드」** | 49 (기존 29 + 새 20) | 그대로. ⚠ **`pkgKinds` 는 새 밴드가 아니라 기존 밴드 재보정**(`[3,4] → [4,5]`)이라 수가 안 는다 |

---

## 6. 앞선 결정과의 정합

- **D162·D203** (자유이용권) — **살아 있다.** 첫 값 400G · 등급 배수 · 발견 인박스가 그대로고, **창구가 하나 더 붙고 값 함수가 한 벌이 됐다.**
- **D225** — **ⓑ 가 이 판에서 실물이 된다.** 4판은 「같은 순수 함수」라 적고 **다른 함수 둘**을 냈다. 이제 함수 이름이 하나이고 정적 자가 호출부 셋을 센다.
- **D233** — ②만 개정(창구의 갈림·결제 소유자). ①③④⑤⑥ 은 그대로.
- **D234** (조끼는 전제) — 그대로. **`bandPaid` 가 그것을 더 정확히 만든다**: 조끼는 「가진 것」이지 「산 것」이 아니다.
- **D235** (아쿠아삭스 소프트) — 그대로. `g.band == null` 이 판정이므로 **`vest_only` 만 빌려도 슬라이드가 열린다**(카탈로그 §3-3 이 팔찌에 포함이라 말한 그대로).
- **D241** — ① 의 **자리만** 옮긴다(`:925` → `issueBand`). ②③ 은 그대로이고 `nightSalesMul` 값·상한 1.4 도 그대로.
- **D250** (밤 문구) — 「빠지 **야간권**」이 **라벨이 아니라 상품**이 됐다. 문구는 그대로 쓴다.
- **D14** (직원 = 시설별 알바) — 망루·브리핑이 `f.staff` 에 달린 것이 D14 를 결정으로 만든다.
- **D16** (부품 = 수량 없는 영구 열쇠) — **팔찌는 반대다**(회수 소모). 그래서 부품 저장소에 안 넣고 손님 필드로 둔다.
- **D25·D35** (팀 + 유료 자리 한 줄) — `issueBand`·`nightBandTeams` 가 `rentKey`(`guest.ts:123`)라는 **같은 팀 열쇠**를 쓴다.
- **D63** (실내 = 동선 몰) — 대여소가 `passBy:'enter'` 이고 `indoorOnly:true` 라 **복도에 두는 것이 곧 배치 결정**이다. ⚠ 그 강함이 곧 4판의 차단이었고, 이 판은 그것을 **없애지 않고 ⓑ 가 파는 물건을 바꿔서** 푼다.
- **D57 ↔ D113** (킷 7) — 대여소는 `start` 700G(시작 자금 5.8%)라 플레이어가 첫날 짓는다. 팔찌 게이트가 **딥에만** 걸리므로 첫날 여울 기구는 그대로 돈다 — **판이 안 잠긴다.**
- **불변식 1** — `wristband.ts`·`accident.ts` 는 `src/sim/` 순수 모듈이고 UI 는 호출만 한다.
- **불변식 2** — 팔찌는 **뽑기 0회**(`bandFor`·`bandTop` 은 임계값 함수) · `nightBandTeams` 는 Set 이라 순서 의존 0 · `guest`·`world`·`shop`·`workshop` 뽑기 횟수 불변(52a-5·52a-12).
- **불변식 3** — 팔찌 4등급 · **`bandCost`** · `ppajiPkgGradeStep` · 반경 · 사고 상수 · 수온 상수 · 브리핑 상수가 전부 JSON. **`bandCost` 를 비우면 P52-a 이전과 동일**(대조군).
- **v4 「실패는 내 선택 때문이어야」** — 이용권 창구를 안 지으면 기구가 돈을 못 벌고, 안전을 안 사면 성장 통화(좋아요)가 준다.
- **§14.9 ③·⑬ 닫음** — `convertFacility` · `rentKind`.

---

## 7. 리스크 · 미결

| # | 리스크 | 잡는 게이트 | 걸리면 |
|---|---|---|---|
| **RC1** | `rigDeep(uid)` 훅이 없으면 팔찌·`swimSkill`·어린이 규칙이 전부 무효 | 52a-1·52a-4 | 섹션 B `Game.rigDepthOf(uid)`. ⚠ **`?? false` 폴백을 만들지 말 것** — 없으면 **빨간불이 되어야** 한다 |
| **RC2** | 물 위 진입 경로가 없으면 사고도 안 난다 | — | **P50-a 없이 P52 를 잴 수 없다** |
| **RC3** | `BASE 0.008` 은 `R̂ = 134`(추정), `BRIEF_TICKS 15` 는 `cycleTicks` 149.4 에 걸려 있다 | 51-1(P51 종료 조건) · 52b-3 · 52b-6ⓑ | **P52-b 의 P51 의존은 하드다** |
| **RC12** | 팔찌가 딥 기구 수요를 통째로 잠근다 (하드 게이트 넷째) | 52a-1 · 52c-2 · 밴드 `vestShare 0.5~1` | 게이트는 **딥에만**. 손잡이는 `bandFor` 의 취향 임계값이지 게이트 자체가 아니다 |
| **RC13** | 팔찌 매출이 `pkgShare` 상한(0.3)을 밀어 매점을 덮는다 — **창구가 둘이고 밤에 한 번 더 판다** | 52a-7(`ppajiPkgShare ≤ 0.25` · `pkgShare ≤ 0.3` · `foodShare ≥ 0.2`) | 손잡이는 **`base` 넷**이고 `ppajiPkgGradeStep`(0.25)은 **안 건드린다**(52a-6 의 1.5배 문턱이 같이 움직인다) |
| **RC14** | `--no-vest` 대조군이 두 창구를 다 끄지 못한다 | 52a-8⑤ · 52a-10(정적: 스위치를 읽는 자리 **1곳**) | 스위치를 **`issueBand` 진입 한 곳**에 둔다 |
| **RC17 (신설)** | **ⓑ 가 팔찌를 안 팔게 되어 「자유이용권」이라는 이름이 화면에서 사라진다** — 성숙한 판에서 자리가 파는 것은 `meat`·`stay` 다 | 52a-8④ · H47ⓒ | **의도다.** 다만 **발견 인박스**(`notePackages`)와 **확정 바 칩**은 등급이 오를 때마다 계속 뜨므로 이름은 살아 있다. 그래도 사람이 「사라졌다」고 읽으면 손잡이는 **`bandPaid` 를 `band != null` 로 좁히는 것**이 아니라 **대여소를 킷에서 빼는 것**(D106 이 이미 그렇게 정했다) |
| **RC18 (신설)** | **야간권이 밤 매출을 부풀린다** — 하루에 두 번 파는 유일한 상품이다 | 54-8(계측 선행) · 54-9① · 52a-7 | 문턱을 넘으면 손잡이는 **`nightSalesMul` 상한(1.4)**이 아니라 **야간권의 tier 를 한 칸 내리는 것**(`minIdx` 를 안 쓰고 `bandFor(taste, opened, 0)`) |
| **RC19 (신설)** | **`nightBandTeams` 를 저장 안 해서 저녁 저장→로드로 야간권을 두 번 살 수 있다** | 54-9④ | **의도된 이탈**(팀당 +1건 상한). `teamSeatedIds`(`game.ts:907`)와 같은 규칙이고, 저장하면 세이브 필드가 늘고 마이그레이션이 붙는다 |
| **RC20 (신설)** | **`wristband.ts` 를 [50b] 로 당기면 P50-b 골든이 움직인다** | **50b-20 신설 문안**(§5-A) — `ppajiPkg()` 가 `null` ∧ `bandPrice` 호출부 **0회** ∧ 골든 **바이트 동일** | 안 그러면 「동작 0」이 주장으로만 남는다. D225ⓓ 가 [48c] 에서 쓴 것과 **같은 형태의 자** |
| **RC21 (신설)** | **`bandCost: 2` 가 시그니처 기구 하나에만 붙어 「데이터가 켠다」가 표본 1** | 52a-14(대조군: 전부 지우면 바이트 동일) | 표본 1 은 괜찮다 — **축이 안 사는지**를 재는 것이 아니라 **규칙이 도는지**를 재는 항이다. 두 종 이상이 필요해지면 §4(b) 3(바이퍼)이 다음 후보 |
| **RC5·RC6~RC11·RC15·RC16** | 4판 그대로 (개조 대조군 · `paidToday` · `RigStore` 상속 · 브리핑 공짜 트레이드 · SNS 감쇠 · 바닥 순서 · 골든 두 번 · 감사 밖 창 넷) | 51-8ⓑ · 51-7 · 51-12 · 52b-6ⓑⓓ · 52b-5 · 52b-1ⓑ · §5-A · 51-19·50b-18 | 통합본 부록 B 에 그대로 |

**미결 (사용자에게 물을 것) — 4판의 12건 중 ③⑦ 이 이 판에서 바뀌고 둘이 는다**

1. **`accidentBase` 0.020 → 0.008** (실측 유도) — 승인 필요.
2. **그날 전액 환불(D-C8)을 기구·링 위 시설로 한정** — 권고: 기구만.
3. **⚠ (개정) D162 의 「등급 0 도 성립한다(400G)」를 「등급 1 부터 팔린다(첫 값 400G)」로** — 4판과 같다. 권고: **개정한다.**
4. **`rigs.json` 에서 `level:N` 을 전부 뺀다(D-C5)** — 승인 필요.
5. **개조 Lv 의 새 일 = 개조비 5%/Lv 할인** — 권고: 할인.
6. **이미 감사 밖인 창 넷을 언제 `routes` 에 넣을 것인가** — 권고: P51 과 별개의 작은 커밋.
7. **⚠ (개정) 팔찌를 「팀 한 장 값」으로 둘 것인가** — 4판과 같되 **야간권이 붙어 하루 최대 두 장**이 됐다. 권고: **팀 한 장 × 하루 최대 2회.** 1인당으로 가면 `pkgShare`·`ppajiRevShare`·`foodShare` 세 밴드를 같이 재보정해야 한다.
8. **아쿠아삭스를 하드 규칙으로 만들 것인가** — 권고: 이 판은 소프트(×0.3), 하드는 P53.
9. **계절의 나머지 셋(영업시간·성수기 봉우리·점심 휴장)** — 권고: P53 이후 별도 페이즈.
10. **사고 뒤 의무실 이송** — 권고: 붙인다(`infirmary` 의 `desc` 가 지금 거짓말이다).
11. **사고가 좋아요를 깎는 것(D-C24)** — 권고: 넣는다(계수 0.20).
12. **브리핑의 고스릴 프리셋 둘을 법 의무로** — 권고: 의무 + opt-in 병행.
13. **⭐ (신설) 밤 야간권 — 하루에 두 번 파는 유일한 상품을 허용할 것인가** (D-C37 ⑤) — 카탈로그 §3-20·§3-13(HOT7 일몰 야간권)에 실지 근거가 있고, **유입이 18시에 끊기는 우리 시계**(`ARRIVAL_TO_TICK === EVENING_TICK`)에서는 이것이 없으면 `nightPkg` 표본이 안 나온다. 권고: **넣는다.** 대안은 `ARRIVAL_TO_TICK` 을 19시로 미는 것인데 그건 **밸런스 전면 재보정**이다(D239 가 같은 이유로 영업시간을 미뤘다).
14. **⭐ (신설) `bandCost` 를 넣을 것인가** (D-C39) — 카탈로그 §3-14·15 의 「기구별 소모 수」·「타노스 전용 팔찌」. 필드 하나(기본 1)·손님 필드 0·비우면 대조군. 권고: **넣는다** — 「몇 종」을 손님에 저장하지 않고 표현하는 유일한 길이다.

**→ 다른 섹션으로 넘기는 것**

| 무엇 | 어디로 | 내 쪽 인터페이스 |
|---|---|---|
| `depth`·`onRing`·`chain`·`lights` · 물 위 배치 · `setWalkOn` diff | 섹션 B (P50-a·50-b) | `Game.rigDepthOf(uid)` · `rigIndoorOf(uid)` · 게이트 50b-15 는 P50-b 소유 |
| **`wristband.ts`·`wristbands.json` 반입 + `aimPreview` 의 돈 둘** | **섹션 B (P50-b)** — 이 판이 옮겼다 | **게이트 문안 50b-20 은 §5-A · 값 표는 §2.9** — 번호를 예약해 두었으니 다른 번호를 쓰지 말 것 |
| `nightEve`·`nightSalesMul`·`nightBandTeams`·`nightPkgToday` · `syncNightSet` 확장 | 섹션 D (P54) | **`issueBand` 안 두 줄**(§2.7 ②의 `// ← [54]` 주석 둘)과 **게이트 54-8 신설 · 54-9 재번호**(§5-F) |
| 인증 보상 `case 'rigPart'` 데이터 13건 | 섹션 A/B (P49-a) | 내가 `grant` 케이스를 만든다 |
| 봇의 기구 배치(`attachRigs`·`chainRigs`) | 섹션 D (P53) | 내 몫은 `upgradeRig`·`buyRigParts`·`ensureWatchtower`·`briefCourses` 넷과 `BotOptions{noConvert,noVest}` |
| **카탈로그 §4(b) 4 잠수 제트보트** | 섹션 B (기구 데이터) | 내 쪽은 **`bandCost: 2` 를 붙일 유일한 후보**라는 것과 **`allday` 가 등급 4 에서 열린다**는 것뿐 — 값은 안 정한다 |
| 밤 파티 조건의 `lights` | 섹션 D (P54) | `allday` 가 **등급 4 = `lights ≥ 1`** 을 요구하므로 **밤 축과 이용권 최상위가 같은 조건을 공유한다** |
