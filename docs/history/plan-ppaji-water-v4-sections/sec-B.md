# 섹션 B — 기구 · 물 위 배치 · 연결 · 등급 (P48-c 유니언 · P49-a 데이터 · P50-a 배치 · P50-b 켜짐·연결·등급)

> 설계자 B, **5차 개정**(라운드 5 지시 3건 + 실물 카탈로그 재대조). 근거는 전부 `ppaji/` 패키지 `file:line` —
> **이 개정 중에 파일을 다시 열어 재측정했다.** 「그대로」는 그 함수가 지금 존재할 때만 썼다. 없는 것은 **「신설」**이다.
> 라운드 5 지시에서 나온 것에는 **「반영(r5):」**, 카탈로그(`docs/research/ppaji-gear-catalog.md`)에서 나온 것에는 **「카탈로그:」**.
>
> ⚠ **이번에 내 4차 초안에서 오류 셋을 찾아 고쳤다** — 줄 번호 2건(`place.ts` label·showGhost)과 **사실 1건**
> (「견인 축에 개조 문법이 없다」 → **있다**. `gears.json` 의 `upgradeOf` **9/33**, `cooking.ts:126~127` 가 그것을 돈다).
> 라운드 3 이 줄 번호 5건으로 감점된 것과 같은 종류라 이번에도 **인용한 자리를 전부 다시 열었다**(§0 N22~N27).
>
> ⚠ **BLOCKER 둘 다 「이대로 착수하면 첫날 빨간불」인 자리였다.** 하나는 검사가 데이터를 이기고(§4.2 `diving`),
> 하나는 **없는 것을 「이미 있다」고 적었다**(`maxPerPark`). 아래 B45·B46 이 그 둘을 닫는다.

## 반영 목록 (라운드 5 지시 3건 + 카탈로그 ↔ 이 문서)

| 지시 | 반영 |
|---|---|
| **1 [BLOCKER]** `diving` 이 deep 인데 `needsVest` 가 없어 D229 동치가 착수 첫날 깨진다 | **반영(r5): B45(→D251) · §3.0 · §3.1c · §4.1a(수 갱신) · 게이트 49a-15ⓐ.** **ⓐ 를 고른다** — `diving` 에 `needsVest` 를 더해 **deep 7종 · 7/7**. 동치의 정의역은 **`class === 'rig'` 전체**(onRing 포함)이고, §4.1 검산의 「6종·6/6」과 §4.0 의 `⇔` 문면을 **7 로 같이 갱신**한다. **카탈로그가 이 선택을 지지한다** — §2 D 표의 「다이빙대 … 요구 **조끼**」 |
| **2 [BLOCKER]** D228 ①의 「판당 1대 랜드마크 = `rig_disc`」가 **코드에도 데이터에도 없다** | **반영(r5): B46(→D252) · §2.11 신설 · §3.0 새 필드 **12** · §4.1a · 게이트 50a-12 · 49a-15ⓒ.** **ⓐ 를 고른다** — `maxPerPark?: number` **한 필드**(신설) + `canPlace`(`game.ts:2220` 아래) **한 줄** + 거절 문구. ⚠ **같이 요구된 「SNS 좋아요 계수」는 안 받는다**(§7 미결 M11) — `sns.post`(`sns.ts:160`)의 `likes` 가 `min(24, basePop×0.3)` 로 **상한이 있고 그 값이 지역 해금 통화**라, 시설별 계수는 P50 밖의 밸런스를 움직인다 |
| **2 [BLOCKER] 후반** 「시그니처」가 등급 4 와 `rig_disc` 둘을 가리킨다 | **반영(r5): B47(→D253) · 게이트 50b-19 신설.** **「시그니처」는 등급 4 하나**다(엔딩 점수 항 `signature:50` · 팔찌 `allday.needGrade 4` 가 그것을 센다). `rig_disc` 는 **「랜드마크 기구」**로 부른다. ⚠ 실측으로 낱말이 **넷**이었다 — 등급 4 · 엔딩 항목 · **함수 인자 목록**(§3.7 머리 주석) · **`mongol_tent.desc`**(기존 산문) |
| **3 [fix]** §3.8 `convertPreview` 문구가 `accidentChance`(P52-b 산출물)를 P51 에서 쓴다 | **반영(r5): B48(→D254) · §2.12 신설 · 게이트 51-6(그대로 네 값) · 52b-1ⓒ 한 줄.** `ConvertPreview` 는 **P51 이 네 값**, **P52-b 가 `riskNow`/`riskNext` 를 optional 로 더한다**(없으면 그 절을 안 그린다 — B37ⓒ 「데이터가 켠다」와 같은 모양이고 그것이 **52b 의 음성 대조군**이다). §5 `facility-info` 행 태그도 **「개조 델타 행 [51] · 위험 행 [52b]」**로 |
| **카탈로그 자기 정정** 「견인 축에 개조 문법이 없다」 | **반영(r5): B49(→D255) · §3.1a.** **오류였다** — `upgradeOf`(`schema.ts:359`·`:387`, `gears.json` **9/33**)가 이미 그 문법이다. 마블 3단을 막는 진짜 이유는 **`equipment.json` 정원·요금과 `courses.json` 적합도가 코스 축 소유**라는 범위다 |
| **카탈로그 §2·§4** 축 배정 · 이름 · 조끼 · 정원 · 별칭 | **B39~B44 유지**(통합본 D227~D232 로 이미 들어갔다) + **§3.1a 를 이 개정의 실측으로 다시 셌다** |

---

## 0. 이번 개정의 실측 (2026-09-07, `ppaji/` 워킹트리 · 4차 실측 N10~N21 은 재확인만 하고 아래에 새 것만)

| # | 잰 것 | 값 | 어떻게 |
|---|---|---|---|
| **N22** | **`place.ts` 줄 번호 — 4차가 두 칸 틀렸다** | `:119` 판정 · `:120` `why` · `:121` `doneBtn` · **`:124` `label` 선언** · `:125~127` 세 가지 · **`:128` `showGhost`** (4차는 `:123`·`:127` 로 적었다) | `sed -n '112,132p' src/ui/windows/place.ts` |
| **N23** | **`facilities.json` 의 `needsVest`·`depth`** | **둘 다 0건** — 「실측 3/6」은 **계획 표(§4.1·§4.2) 기준**이지 실데이터가 아니다. 실데이터에는 **아직 두 필드가 없다** | `python3` 전수 (`needsVest keys: []` · `depth keys: []`) |
| **N24** | **`maxPerPark`·`perPark`·`unique`** | `src/**` 에 **0건**. 「판당 한 대」를 강제하는 규칙이 **어디에도 없다** | `grep -rn 'maxPerPark\|perPark\|unique' src/data/schema.ts` |
| **N25** | SNS 좋아요 식 | `sns.ts:162` `likes = max(1, round(min(24, basePop × 0.3) + favBonus + rng.int(6)))` — **`basePop` 기여에 상한 24**. 시설별 계수를 넣을 자리는 `post()`(`:160`) 하나이고 그 값이 **지역 해금 통화**(`addLikes` → `areaLikes`) | `sed -n '155,180p' src/sim/sns.ts` |
| **N26** | 견인 축 **개조 문법** | **있다** — `upgradeOf?: { base, add[] }[]`(`schema.ts:359`·`:387`), `gears.json` **9/33**(`flycarpet`·`water_roller`·`air_chair`·`marine_jet`·`hydrofoil` 등), 도는 코드는 `cooking.ts:126~127` | `grep -rn upgradeOf src` |
| **N27** | 「시그니처」의 뜻 **넷** | ① 등급 4 이름 ② 엔딩 점수 항(`SCORE_WEIGHTS.signature 50`) ③ **함수 인자 목록**(계획 §3.7 머리) ④ **`mongol_tent.desc`**(shop·★2, 기존 산문) | `grep -rn 시그니처 src` + 계획 grep |
| **N28** | `class:'rig'` 가 될 def 수 | **22** = 새 21 중 rig **17** + 이전 12 중 rig **5**(`trampoline_w`·`turtle_island`·`airbounce`·`waterwalk`·`diving`) | §4.1·§4.2 표 전수 |
| **N29** | `hydrofoil` 의 `level:8` | **`gears.json` 의 `unlock`** 문자열이다(`equipment.json` 에는 `level` 필드가 **없다**) — 4차 표가 두 파일을 섞어 적었다 | 두 파일 대조 |
| **N30** | `diving` 실데이터 | `attraction · 2×2 · cap 2 · pop 14 · unlock {rank:1}` — **★1 보상 그대로** | `facilities.json` 전수 |

⚠ **4차의 N10~N21 은 이번에 전수 재확인했고 N22·N29 둘만 틀렸다.** 맞았던 것도 적는다(다음 사람이 다시 안 세게):
`capacityOf` `facility.ts:59` ✔ · `occupied` `:116` ✔ · `FacilityStore.ring` `:161~175` ✔ · `check()` `:178` ✔ ·
`move` `:207` ✔ · `entryTiles` `:240` ✔ · `resetDay` `:244` ✔ · `FACILITY_FAIL_KO` `:44` ✔ ·
`canPlace` `game.ts:2217`(해금 `:2220` · `check()` `:2221` · frontage `:2231`) ✔ · `tooClose` `:2205` ✔ ·
`canMoveFacility` `:2259`(frontage `:2270`) ✔ · `autoPathFor` `:1063` · `ensurePath` `:1109` ✔ ·
`reachSet` 람다 `:1087` · `reachability` 람다 `:2610~2612` ✔ · `computePoolState` `:1272`(tilePop 두 줄 **`:1283~1284`** · 호출 `:1286`) ✔ ·
`poolState(id)` `:1259` ✔ · `dailyTarget` `:1392` ✔ · `seatPackagesAt` `:830` · `packageFor` `:853` · `notePackages` `:867` ✔ ·
`recomputePassBy` `:2566` · `afterWorldChange` `:2584`(본문 **여섯 줄** `:2585~2590`) ✔ ·
`pool.ts` `at()` `:67~71`(`:70` `includes`) · `state()` `:77~81` ✔ · `guest.ts` `walkable` `:248~252` · `entryTiles` 호출 `:270` ·
착수 `:564` · 표류 `:615` · 풀 가중치 `:772` · `adjacentPoolTile` `:875`(`:878` `includes`) ✔ ·
`schema.ts:9` `FacilityClass`(6종) · `:430` `needsInRadius`(5종) ✔ · `CLASS_KO` `condition.ts:78` ✔ ·
`facility-info.ts` `ICON` `:95` · `row` `:96~102` · `onSelect` `:129`·`:131` ✔ ·
`style.css` `.kdock` `:668~686`(`.kdock-row` **`:683`** · `.kdock-cost` `:686`) ✔ ·
`packages.json` **4종**(500/0/200/300) · `balance.json:4` `ticketBase 200` ✔ ·
`equipment.json` **30종 · cap 1~10**(1:5 2:4 3:3 4:6 5:2 6:7 8:2 10:1 · 중앙 4) · `gears.json` **33**(공유 30 + 실패작 3) ·
**공유 30건 이름 전수 일치 · 불일치 0** ✔.

---

## 1. 결정

> B1~B26 은 2차 · B27~B35 는 3차 · **B36~B44 는 4차**이고 통합본이 **D213~D250** 안에서 받았다
> (B36→D224 · B39→D227 · B40→D228 · B41→D229 · B42→D230 · B43→D231 · B44→D232).
> 아래 **B45~B49 가 이번(5차)에 새로 낸 것**이고, 통합본은 **D251~D255** 로 받으면 번호 충돌이 0 이다(마지막이 D250).

**B45 (→ D251). `diving` 에도 `needsVest` 를 준다 — deep 은 **7종**이고 동치는 **7/7**, 정의역은 `class === 'rig'` **전체**다.**
**반영(r5): 지시 1 (BLOCKER) — ⓐ.** 실측한 어긋남:
- §4.2 의 `diving` 은 **`rig` · `onRing` · `depth deep`** 인데 `needsVest` 가 **없다**.
- §4.1 검산은 「deep **6종**(`rig_blob`·`rig_totem`·`trampoline_w`·`rig_iceberg`·`rig_jump_tower`·`rig_disc`)이 전부 ✔」로 세면서
  **`diving` 을 빼먹었다** — 그 검산은 §4.1 표만 훑고 §4.2 표를 안 봤다.
- 그대로 넣으면 P49-a 커밋의 `validateRigData` 동치 검사가 **착수 첫날 빨간불**이고,
  「한 방향만 재면 절반이 빈 채로 초록」을 고치려고 만든 `⇔` 가 **그 자리에서** 깨진다.

**ⓐ 를 고른 이유 셋** (ⓑ「정의역을 `class==='rig' && !onRing` 으로 좁힌다」를 안 고른 이유이기도 하다):
1. **카탈로그가 그렇게 말한다** — §2 D 표 「다이빙대 | 1 | 시설 | 스릴 3 | **요구 조끼**」. 실지에서 다이빙대는 조끼 착용 종목이다.
2. **ⓑ 는 규칙을 둘로 가른다** — 링 시설의 `depth` 는 §3.6 규칙 6(앞칸 깊이)이 쓰고 물 위 기구의 `depth` 는 규칙 4 가 쓴다.
   둘은 이미 다른 규칙이지만 **`needsVest` 는 「손님이 깊은 물에 들어가나」 하나**를 뜻한다 —
   다이빙대는 **깊은 물로 뛰어드는 시설**이라 뜻이 정확히 같다. 정의역을 좁히면 「뛰어드는데 조끼가 필요 없는 시설」이 남는다.
3. **자가 단순해진다** — `class === 'rig'` 전수 한 줄이고, 예외 절이 0 이다(예외가 생기면 그 예외를 재는 자가 또 필요하다).

**바뀌는 수 (표에서 세어 한 수로)**: deep **6 → 7** · 동치 **6/6 → 7/7** · `needsVest` 열 **✔ 3 → 7**(새로 더하는 칸 **넷**:
`rig_iceberg`·`rig_jump_tower`·`rig_disc`·**`diving`**) · 정의역 `class:'rig'` **22종**(N28).
⚠ **첫 30분은 그대로 안 막힌다** — 시작 8종의 `depth` 는 여전히 **deep 0건**이고, `diving` 은 **★1 보상**이다(N30).
⚠ **밸런스는 P52-a 밴드로 잰다** — P49-a 에는 조끼 규칙 자체가 없어 효과가 0 이다(D229 와 같은 처리).

**B46 (→ D252). 「판당 한 대」는 **`maxPerPark?: number` 한 필드**로 넣는다 — **SNS 계수는 안 받는다.****
**반영(r5): 지시 2 (BLOCKER) — ⓐ.** 실측(N24): `maxPerPark`·`perPark`·`unique` 가 `src/**` 에 **0건**이고,
§4.1 의 `rig_disc` 행은 `rig · deep · 2×2 · cap 4 · thrill 4 · pop 34 · cost 3,100 · ★5` **값일 뿐**이다.
D228 ①이 「둘은 이미 있다」로 닫은 것 중 **잠수 제트보트 쪽은 사실이 아니었다**(장애물 코스 쪽은 사실이다 — `obstacle` 3조각은 데이터에 있다).
이 문서 스스로 정한 규칙(「'그대로' 는 그 함수가 지금 존재할 때만 썼다」)을 어긴 자리다.

- **ⓐ 필드** — `maxPerPark?: number`(§3.0 새 필드 **11 → 12**). `rig_disc` 만 `1`. **P49-a**(데이터·스키마).
- **ⓑ 규칙 한 줄** — `canPlace`(`game.ts:2217`)의 해금 검사(`:2220`) **바로 아래**, `check()`(`:2221`) **앞**:
  ```ts
  if (def.maxPerPark !== undefined && this.facilities.all.filter((o) => o.defId === defId).length >= def.maxPerPark)
    return { ok: false, reason: '이 기구는 판에 하나뿐입니다 — 지금 있는 자리를 옮기세요' };
  ```
  **P50-a**(물 위 배치가 서는 커밋). ⚠ **`opts.inherited` 로 안 가른다** — 킷에 `rig_disc` 가 0개라 동작이 같고(§4.1 시작 8종),
  가르면 「킷은 둘을 줄 수 있다」는 두 번째 규칙이 조용히 생긴다.
- **ⓒ 이동은 안 막는다** — `canMoveFacility`(`:2259`)는 **개수를 안 늘린다.** 그래서 거절 문구가 「**옮기세요**」다(길을 알려 준다).
- **ⓓ 개조로 새지 않는다** — `canConvertFacility` 5번은 `canPlace` 가 아니라 `facilities.check(...)` 를 부르므로 이 줄을 안 지난다.
  `rigs.json` 의 `to` 는 전부 `buildable:false` 라 지금은 새는 곳이 없고, **데이터 검사**가 그것을 못 박는다(49a-15ⓒ ③).
- **ⓔ SNS 좋아요 계수는 안 받는다** — 카탈로그 (b)#4 는 「이용권 등급을 가르고 **SNS 좋아요 계수를 따로 준다**」였는데,
  N25 대로 `likes` 는 `min(24, basePop×0.3)` 로 **상한이 걸린 지역 해금 통화**다. 시설 하나에 계수를 주면
  ① `sns.post` 의 인자가 늘고 ② `likesPerArea` 문턱 도달 속도가 움직여 **P50 이 안 쥔 밸런스**가 바뀐다.
  **자리만 지목하고 안 넣는다 → 미결 M11.** 「이용권 등급을 가른다」 쪽은 **이미 D233 이 받았다**(`allday.needGrade 4`).
- **ⓕ 봇** — 거절은 `ok:false` 로 돌아오고 `attachRigs` 는 다음 후보로 간다. `rigsDistinct` 는 **종**을 세므로 밴드가 안 움직인다.

**B47 (→ D253). 「시그니처」는 **등급 4 하나**를 가리킨다. `rig_disc` 는 **「랜드마크 기구」**다.**
**반영(r5): 지시 2 후반.** 실측(N27) 낱말이 **넷**이었다: ① 등급 4 이름 「시그니처 빠지」 ② 엔딩 점수 항
(`SCORE_WEIGHTS.signature 50` — **등급 4 를 센다**) ③ 계획 §3.7 머리 주석의 **함수 인자 목록** ④ `mongol_tent.desc` 의 산문.
게이트 53b-8 이 ②를 재는데 D228 ①이 ④와 같은 뜻으로 `rig_disc` 에 그 낱말을 붙여서, **자가 무엇을 재는지 갈렸다.**
- **게임 낱말**: 「시그니처」 = **등급 4**. 새로 쓰는 문자열에서 그 뜻 밖으로 안 쓴다.
- **`rig_disc`**: **「랜드마크 기구」**(`maxPerPark: 1` 이 그 뜻이다). 데이터 `name` 은 **「회전 원반」 그대로**.
- **계획 문면**: §3.7 의 「시그니처가 두 벌이 된다」는 **「인자 목록이 두 벌이 된다」**로 고친다(총론 요구 ⑪).
- ④ `mongol_tent.desc` 는 **안 건드린다** — 기존 산문이고 P50 범위 밖이다. 그래서 자는 **「새로 더하는 문자열」에만** 건다(50b-19).

**B48 (→ D254). `convertPreview` 는 **P51 이 네 값 · P52-b 가 위험 두 필드**다 — 문구를 갈라 적는다.**
**반영(r5): 지시 3.** §3.8 은 `convertPreview` 가 `thrillOf`·`capacityOf`·**`accidentChance` 를 「그대로 호출」**하고
문구가 `스릴 2 → 3 · 정원 2 → 3 · 안전 2 → 1 · **위험 주의 → 경계** · 개조비 1,800G` 라고 적는데,
`accident.ts` 는 **P52-b 산출물**이고(실측: `src/sim/accident.ts` **없다**) P51 은 그 **앞**이다.
게이트 51-6 은 「스릴/정원/안전/개조비 **네 값**」만 재서 이 어긋남이 **조용히 지나간다** — 계획이 P51 에 없는 함수를 부른다.

| P | 반환 | 화면 문구 |
|---|---|---|
| **P51** | `{ thrillNow, thrillNext, capNow, capNext, safeNow, safeNext, cost }` | `스릴 2 → 3 · 정원 2 → 3 · 안전 2 → 1 · 개조비 1,800G` |
| **P52-b** | **+ `riskNow?`·`riskNext?`**(칩 이름) | 위 문구 **뒤에** ` · 위험 주의 → 경계` 를 잇는다 |

- **optional 인 것이 계약이다** — 없으면 그 절을 **안 그린다**. B37ⓒ 의 「데이터가 켠다 · 없으면 `null`」과 **같은 모양**이고,
  그래서 **P52-b 의 음성 대조군이 공짜로 생긴다**(P51 커밋에서 위험 절이 화면에 0회).
- **자 배치**: **51-6 은 그대로 네 값**(P51 에 위험이 없으니 재면 안 된다) · **52b-1ⓒ 에 한 줄**을 더한다.
- **§5 `facility-info` 행의 태그**를 **「개조 델타 행 [51] · 위험 행 [52b]」**로 가른다(지금은 `50b·51·52a·52b` 한 덩어리다).
- ⚠ **`riskNow/Next` 를 P51 에 미리 두지 말 것** — 두면 P51 이 `accident.ts` 를 import 하게 되고,
  49a-1 이 `rig.ts` 에서 잡은 것과 **똑같은 「뒤 페이즈 파일을 앞당김」**이 개조 쪽에 다시 생긴다.

**B49 (→ D255). 견인 축에는 **개조 문법이 이미 있다**(`upgradeOf`) — 4차 초안의 「문법이 없다」는 **내 오류**다.**
**카탈로그 + 자기 정정.** 실측(N26): `upgradeOf?: { base: string; add: string[] }[]` 가 `schema.ts:359`·`:387` 에 있고
`gears.json` **33종 중 9종**이 그것을 쓴다(`flycarpet` ← `sofa_boat`+`deck_board` · `water_roller` ← `blobjump`+`harness_belt` ·
`air_chair` ← `wakeboard`+`seat_sling` · `marine_jet` ← `jetski`+`power_grip` · `hydrofoil` ← `kneeboard`+`carbon_deck` …),
도는 코드는 `cooking.ts:126~127` 다. **공방이 이미 견인 기구를 「기본 + 부품」으로 강화한다.**
- 그래서 카탈로그 (b)#2 「마블 크기 3단(4인 → 빅 → 자이언트)」은 **문법이 없어서** 못 하는 것이 아니다.
  못 하는 진짜 이유는 **범위**다: 새 gear 두 종을 더하면 `equipment.json` 의 정원·요금·`safeCurvature` 와
  `courses.json` 프리셋 적합도를 같이 유도해야 하고 **그 둘은 코스 축 소유**다(§7 요구 10).
- **이 판이 하는 것은 이름 8건뿐**(B42)이고 **`upgradeOf` 는 한 줄도 안 건드린다** — 게이트 49a-16ⓒ 의
  「`name` 을 뺀 나머지 전 필드 바이트 동일」이 `upgradeOf` 까지 포함해 그것을 잰다.
- **별칭 문화는 두 축이 같은 출처를 쓴다** — `rigs.json` 개조판 20(B43)과 `gears.json` 이름 8(B42) 둘 다
  **카탈로그 §2 의 별칭 풀**(닌자·난리보트·개구리·허리케인·팽이·슈퍼맨·사이드킥·호떡·G-RAL)에서 고르고,
  **같은 이름을 두 축에 쓰지 않는다** — 그것을 재는 자가 이미 있다(49a-16ⓑ 이름 충돌 0).

**B36~B44 (4차, 통합본 D224·D227~D232 로 반영됨) — 이번 개정에서 바뀐 곳만**

| 결정 | 요지 | 5차의 변화 |
|---|---|---|
| **B36**(D224) | `rig.ts` 는 **[49a] 셋 + [50b] 여섯** · `pool.ts` `open` 계열은 **[50a] 단일** | 변경 0 (통합본 §3.7 이 「여섯」으로 받았다 — `CHAIN_KO` 포함) |
| **B37**(D214) | 확정 바에 **돈 한 줄** · `ppajiPkgPrice` 한 벌 · P52-a 코드 0줄 | **줄 번호만 정정** — `place.ts` `label` **`:124`** · `showGhost` **`:128`**(N22) |
| **B38**(D215) | `StoryTrigger` **14 kind**(데이터가 쓰는 것 12) · 뒤 총계 20 | 변경 0 |
| **B39**(D227) | 축 경계 한 규칙 — 「모터보트가 끌면 견인 · 물에 고정되면 플로팅」 | 변경 0 |
| **B40**(D228) | 기구 **21종 동결** | **①의 절반을 B46 이 실물로 만든다**(랜드마크). 종수는 **여전히 21** |
| **B41**(D229) | `depth==='deep'` **⇔** `needsVest` | **B45 가 deep 을 7 로** 고친다(`diving`) |
| **B42**(D230) | 견인 이름 **8건** · id·값 0줄 | **`hydrofoil` 의 `level:8` 은 `gears.json` 의 `unlock`**(N29) |
| **B43**(D231) | 개조판 20 이름 = **별명** (게이트 51-16) | **B49 가 출처를 두 축 공용으로** 못 박는다 |
| **B44**(D232) | `CHAIN_KO` 한 줄 — 「수상 장애물 코스」 | 변경 0 |

---

## 2. 규칙 · 수식 (코드 수준)

### 2.0 수역 소속·개방 조회 — `PoolStore` 의 두 배열 (B27 · 태그 B36ⓑ)

```ts
// src/sim/pool.ts
tileOwner: Int32Array;            // k → poolId (0 = 없음)                       [49b]
private blocked: Uint8Array;      // k → 1 이면 기구 발자국이 덮었다               [50a]
ownerIdAt(k: number): number      // tileOwner[k] ?? 0                            [49b]
ownerAt(k: number): Pool | undefined                                            // [49b]
isOpenAt(k: number, poolId: number): boolean  // owner === poolId && !blocked[k]  [50a]
setBlocked(mask: Uint8Array): void            // Pool.open 을 다시 만든다          [50a]
totalOpenTiles(): number                                                        // [50a]
```
⚠ **`Pool.open`·`blocked`·`setBlocked`·`isOpenAt`·`totalOpenTiles` 다섯은 [50a] 단일**이고 **[49b] 인 것은 `tileOwner` 계열 셋뿐**이다.

| 자리 | 지금 (실측) | 뒤 | P |
|---|---|---|---|
| `pool.ts:70` `at()`(정의 `:67~71`) | `this.list.find((p) => p.tiles.includes(k))` | `const id = this.ownerIdAt(k); return id > 0 ? this.byId(id) : undefined;` | **[49b]** |
| `guest.ts:564` 슬라이드 착수 | `this.pools.all.find((p) => p.tiles.includes(bk))` | `this.pools.ownerAt(bk)` + 입수 조건에 `isOpenAt(bk, pool.id)`(D134) | **[49b]** 소속 · **[50a]** 개방 |
| `guest.ts:615` 표류 | `.filter((k) => pool.tiles.includes(k))` | `.filter((k) => this.pools.ownerIdAt(k) === pool.id)` → **[50a]** 에서 `isOpenAt` | **[49b]/[50a]** ⚠ 한 줄 두 걸음 |
| `guest.ts:878` `adjacentPoolTile`(정의 `:875`) | `if (pool.tiles.includes(k)) return k;` | `if (this.pools.ownerIdAt(k) === pool.id) return k;` → **[50a]** 에서 `isOpenAt` | **[49b]/[50a]** ⚠ 한 줄 두 걸음 |

⚠ **두 걸음인 두 줄은 P49-b 걸음이 동작 0** 이다(기구가 아직 못 놓여 `blocked` 가 전부 0). **그 사실을 코드 주석에 적는다** —
계획에만 적으면 다음 사람이 P50-a 에서 「이미 고쳐져 있다」고 읽고 `isOpenAt` 전환을 빠뜨린다(리스크 R6).

**성능**(게이트 49b-8): `at`(1) · 착수(1) · 표류(4이웃×1) · `adjacentPoolTile`(4이웃×1) — ★5 800칸 한 빠지에서
**호출당 비교가 상수**이고, 옛 코드로 되돌리면 **칸 수에 비례**한다(음성 대조군).

### 2.1 술어 하나 — 손님이 설 수 있는 칸 [50a]

지금 같은 규칙이 **세 곳에 복제**돼 있다: `guest.ts:248~252`(`GuestStore.walkable`) ·
`game.ts:1087`(`reachSet` 람다) · `game.ts:2610~2612`(`reachability` 람다) — 셋 다 본문이
`isWalkFloor(f) && !this.facilities.occupied(i, j)` 로 **글자까지 같다**(실측).
```ts
// src/sim/facility.ts (신설 · export)
export function guestWalkable(grid: Grid, f: FacilityStore, i: number, j: number): boolean {
  if (f.walkOn(i, j)) return true;                       // 켜진 물 위 기구 발자국 (D94)
  return isWalkFloor(grid.at(i, j)) && !f.occupied(i, j); // occupied 는 facility.ts:116
}
setWalkOn(mask: Uint8Array): { i: number; j: number }[];  // 「켜져 있었는데 지금 꺼진」 칸 (D158)
walkOn(i, j): boolean                                     // 마스크가 비면 언제나 false
```
⚠ **`entryTiles`(`facility.ts:240`)는 본문 변경 0** — 술어를 **주입받고**(`FacilityStore.ring`(`:161~175`)은
**발자국 바깥 4이웃 전부**다) 유일한 호출부가 `guest.ts:270` 이다(실측 `entryTiles(f, this.walkable)`).
그 호출부가 새 술어를 넘기면 물 위 기구의 손님 자리가 **저절로** 생긴다(게이트 50a-6 이 본문 문자열 동일을 잰다).

### 2.2 배치 판정 — `check()` 의 9단 [50a]

통합본 §3.6 그대로(`WaterRules` **필수** 인자 3 · 실패 3사유 · 물은 단 0 이라 `levelUniform` 예외 없음).
실측 자리: `check()` = `facility.ts:178`(지금 시그니처의 마지막 인자가 `waterMax = 47` 이고 **그것을 지운다**) ·
production 호출부는 **정확히 둘**(`game.ts:2221` `canPlace` · `:2265` `canMoveFacility`).

### 2.3 켜짐 · 사슬 (`src/sim/rig.ts`, **[49a] 셋 + [50b] 여섯** — B36ⓐ)

```ts
// ── [49a] 가 내는 셋 ────────────────────────────────────────────
export const RIG_GRADE_POP_MUL = balance.ppajiGradePopMul;   // [1, 1.4, 1.9, 2.6, 3.5]
export const CHAIN_KINDS_FOR_GRADE3 = 3;
export function ppajiGrade(x: { n: number; kinds: number; chain: number; chainKinds: number; lights: number }): 0|1|2|3|4;
// ── [50b] 가 더하는 여섯 ───────────────────────────────────────
export const CHAIN_BASE = 2;
export const CHAIN_CAP  = 2.0;
export const CHAIN_KO: Record<string, string> = { obstacle: '수상 장애물 코스' };   // B44
export interface RigState {
  lit: Set<number>;                  // uid — 켜진 기구
  chainLen:   Map<number, number>;   // uid → 그 사슬의 기구 수 (chain 태그 없으면 1)
  chainKinds: Map<number, number>;   // uid → 그 사슬의 서로 다른 defId 수 (D182) — 저장 0
  walkOn: Uint8Array;                // 켜진 **물 위** 기구 발자국
  byPool: Map<number, number[]>;     // poolId → 그 수역의 기구 uid (꺼진 것 포함)
}
export function computeRigs(grid, facilities, pools): RigState   // 순수 · rng 0회 · 저장 0
export function chainScale(len: number): number { return Math.min(CHAIN_CAP, Math.max(1, Math.sqrt(len / CHAIN_BASE))); }
```
① 링 위 시설은 언제나 켜짐 · ② **씨앗** = 발자국 4이웃에 `FLOOR.deck` 이 있는 물 위 기구 · ③ **BFS**(4이웃) ·
④ **사슬** = 켜진 물 위 기구 중 `def.chain` 이 같고 4이웃으로 닿은 것끼리 union-find, **뿌리마다 `len` 과 `kinds` 를 같이 센다** ·
⑤ `setWalkOn` · ⑥ `f.chainLen` 은 파생 캐시(`toSnapshot` 에서 뗀다).

**`afterWorldChange` 안의 순서** (`game.ts:2584`, 실측 본문 **여섯 줄** `:2585~2590` 을 이렇게 늘린다.
⚠ 그 앞에 `syncEnclosedWater` 가 끝나 있다는 것이 D128 의 계약):
```
recomputePassBy()                          (그대로 + D100 — 정의 game.ts:2566)
setForcedDoors(...)                        (그대로 — :2586)
pools.setBlocked(rigFootprintMask)         ← 신설 [50a]  (기구 발자국만 보면 되고 computeRigs 가 필요 없다)
pools.recompute()                          (그대로 — :2587. 여기서 tileOwner·open 이 채워진다)
rigs = computeRigs(...)                    ← 신설 [50b]
const dark = facilities.setWalkOn(rigs.walkOn)   ← 신설 [50b] · diff 반환 (D158)
guests.evictFrom(dark)                     ← 신설 한 줄 [50b] (state==='swim' 은 건너뛴다)
guests.invalidate(); poolCache.clear(); notePackages()   (그대로 — :2588~2590)
```

### 2.4 연결 보너스 · 다양성 (D71 · D135 · D182)

- 곱하는 자리는 **`capacityOf`(`facility.ts:59`) 하나** — B40·B45·B46 은 이 함수를 한 글자도 안 건드린다.
- `CHAIN_KINDS_FOR_GRADE3 = 3` 의 유도: 시작 `obstacle` 계열이 **정확히 3종**(bridge · stepstone · beam)이라
  「시작 해금만으로 도달 가능」(D115)이면서 **도배로는 못 넘는** 최대값이다.
- **검산**: `rig_bridge` cap 2 · 사슬 4 → `round(2 × 1.414) = 3` · 사슬 8 → 4. (변경 0)
- **카탈로그:** §3-16 「단품 20,000 · 3종 50,000 · 4종 55,000 · 5종 60,000」 = **종수의 제곱근**처럼 는다 —
  `chainScale` 의 `sqrt` 와 `comboEffect` 의 포화 곡선이 **실지 가격표에서 확인**된다. **값 변경 0.**

### 2.5 수역 소속 — `poolOfFacility` 하나 (B29 · D183)

```ts
// src/sim/game.ts (신설, [49a]) — ppajiGradeOf · rigsOf · rigLinkEdges · seatPpajiGrade 가 이것만 부른다
poolOfFacility(uid: number): number | null {
  const f = this.facilities.byUid(uid); if (!f) return null;
  const def = this.facilities.defOf(f);
  const count = new Map<number, number>();                     // poolId → 칸 수
  const add = (i: number, j: number): void => {
    const id = this.pools.ownerIdAt(j * this.grid.w + i);      // §2.0 — P49-a 에서는 pools.at(i,j)?.id (⚠ undefined, D212)
    if (id > 0) count.set(id, (count.get(id) ?? 0) + 1);
  };
  for (const t of FacilityStore.footprint(def, f.i, f.j, f.facing)) add(t.i, t.j);   // ① 물 위 기구
  if (count.size === 0) for (const t of FacilityStore.ring(def, f.i, f.j, f.facing)) add(t.i, t.j); // ② 링 시설 (:161~175)
  let best = 0, bestN = 0;
  for (const [id, n] of [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])) { if (n > bestN) { best = id; bestN = n; } }
  return best || null;                                          // ③ 어느 쪽에도 물이 없으면 소속 없음
}
```
③ **동점은 `poolId` 작은 쪽** — 없으면 `Map` 순회 순서가 답을 정해 **불변식 2** 가 깨진다.

### 2.6 빠지 등급 (D91~D93 · D136 · D182)

```ts
export function ppajiGrade(x: { n; kinds; chain; chainKinds; lights }): 0|1|2|3|4 {
  if (x.n >= 14 && x.kinds >= 6 && x.lights >= 1)                          return 4;   // 시그니처 빠지 (B47 — 이 낱말은 여기 하나)
  if (x.n >= 9  && ((x.chain >= 4 && x.chainKinds >= 3) || x.kinds >= 5))  return 3;   // 대형 빠지
  if (x.n >= 5  && x.kinds >= 3)                                           return 2;   // 빠지
  if (x.n >= 2)                                                            return 1;   // 놀이 빠지
  return 0;                                                                             // 수영 빠지
}
```
- `n` = 그 수역의 **켜진 물 위 기구 + 링 위 빠지 시설**, 소속 판정은 **`poolOfFacility` 하나**.
- ⚠ **[49a] 시점의 인자**: 기구 def 이 0개라 `chain = 0 · chainKinds = 0 · lights = 0` 이고 **최대 등급 3** 이다(B36).
- ⚠ **인자 다섯은 처음부터 다섯**이다 — 필드를 나중에 더하면 **인자 목록이 두 벌**이 되고
  그 순간 「등급 3 조건이 페이즈마다 다르다」가 된다. (B47: 이 문장에서 「시그니처」라는 낱말을 뺐다.)
- 배율 `[1, 1.4, 1.9, 2.6, 3.5]` 는 **데이터**(`balance.ppajiGradePopMul`), **문턱 5개는 코드**.

### 2.7 인기 자리 교체 — 폴백을 지운다 (B35 · D189) [49a]

```ts
// src/sim/pool-state.ts — 필수 필드로 (?? 삭제)
export interface PoolContext { …; tilePop: number }     // :16 인터페이스 · :27 이 tilePopSum? 였다
const tilePop = ctx.tilePop;                            // :84 의 `?? size * ctx.balance.tilePopStandard` 삭제
// src/sim/game.ts:1283~1284 두 줄이 이 한 줄로 (호출은 :1286, 정의는 :1272)
const tilePop = p.tiles.length * this.b.tilePopStandard * this.b.ppajiGradePopMul[this.ppajiGradeOf(p.id)];
```
`PoolStore.state`(`pool.ts:77~81`)는 **삭제** — production 호출부 0(테스트 `pool.test.ts:52` 하나)이고 등급 없는 사본이다.

### 2.8 조준 미리보기 — sim 을 **호출만** 하고, **돈을 낸다** (B31 → B37) [50b]

```ts
// src/sim/game.ts (신설)
aimPreview(defId: string, i: number, j: number, facing: 0|1): {
  gradeNow: 0|1|2|3|4; gradeNext: 0|1|2|3|4;
  chainNext: number; lit: boolean;
  pkgNow: number | null; pkgNext: number | null;      // ← B37 · G · 패키지가 없으면 null
} | null
```
가짜 인스턴스(`{ uid: 0, defId, i, j, facing, level: 1, … }`)를 `facilities.all` 뒤에 얹어 `computeRigs` 와
`ppajiGrade` 를 **그대로** 돌린 뒤 되돌린다(상태 변화 0 · rng 0회). 돈 둘은 §2.10 의 **같은 순수 함수**가 낸다.
UI(`place.ts:119~128`)는 여섯을 **DOM 에 내기만** 한다 — **미리보기 전용 산식 0줄**(D152).

**확정 바 칩** (신설 — N13·N14 가 「지금 하네스가 읽을 수 있는 DOM 은 `why` 한 곳」이라고 말한다):
```ts
// place.ts:22~23 옆에 한 줄 · row1(:36~37) 에 붙인다
private readonly chips = el('span', 'kdock-chips');   // id = 'dock-place-chips'
// refresh() 안 — :120 의 why 다음, :124 의 label 앞. 거절이면 이유가 주인공이다 (B37ⓔ)
this.chips.hidden = !r.ok;
if (r.ok && p) {
  this.chips.dataset.rigGradeNow = String(p.gradeNow);  … rigGradeNext · rigChainNext · rigLit · pkgNow · pkgNext
  this.chips.textContent = `등급 ${p.gradeNow} → ${p.gradeNext} · 연결 ${p.chainNext}` +
    (p.pkgNext !== null ? ` · 자유이용권 ${p.pkgNow!.toLocaleString('ko-KR')} → ${p.pkgNext.toLocaleString('ko-KR')}G` : '');
}
```
⚠ **줄 번호 정정(N22)**: `label` 선언은 **`:124`**, `showGhost(..., label)` 는 **`:128`** 이다(4차의 `:123`·`:127` 은 오기).
⚠ **CSS 는 기존 규칙에 합친다**(레거시 P8: 새 선택자 블록을 만들면 검사의 `rule()` 이 첫 매치를 잡아 원래 규칙을 못 본다):
`.kdock-row`(**`style.css:683`**)에 **`flex: 0 0 auto`** 를 더하고, `.kdock-chips` 는 **`min-width: 0`** + `overflow: hidden` 이다
— 부모가 **가로 flex** 라 「축을 안 보고 `flex: 0 0 auto` 를 옮기지 말 것」(P3-C④ + P8)이 그대로 문다.
⚠ **색은 토큰만**(`--strip-num`·`--strip-sub`) — `.kdock-cost`(`:686`)와 같은 벌.

### 2.9 상시 이음쇠 (B32 · D186) [50b]

```ts
rigLinkEdges(): { i: number; j: number; dir: 0 | 1 }[]   // dir 0 = +I 변, 1 = +J 변 (K25 정규형)
```
씬은 그 변마다 `overlay/rig_link` 를 그린다(없으면 절차 도형). **논리 ID 신설 0 · 정보창과 무관하게 상시.**

### 2.10 자유이용권 값 — 규칙 한 벌 (B37ⓑ)

```ts
// src/sim/game.ts (신설, [50b]) — packageFor(:853) 의 ppaji 분기와 aimPreview 가 이것만 부른다
static ppajiPkgPrice(pk: PackageDef, grade: number): number {
  return Math.round(pk.price * (1 + PPAJI_PKG_GRADE_STEP * grade));
}
private ppajiPkg(): PackageDef | null {                    // 데이터가 켠다 (B37ⓒ)
  return PACKAGES.find((pk) => pk.needsInRadius.includes('ppaji')) ?? null;
}
```
- 실측 눈금(N12): `packages.json` **4종**(meat 500 · gear 0+feeMul · swim 200 · stay 300) · `balance.json:4` `ticketBase 200`.
  새 `price 400` + `PPAJI_PKG_GRADE_STEP 0.25` → **등급 0 400 · 1 500 · 2 600 · 3 700 · 4 800G**.
  **한 등급 = 정확히 +100G** — §1.1 30초 루프 행의 문면과 같다.
- ⚠ **`aimPreview` 가 그 곱셈을 다시 쓰면 안 된다**(D152) — 게이트 52a-6b 가 확정 뒤 `packageFor` 값과 **오차 0** 으로 대조한다.
- ⚠ **P50-b 에서는 `ppajiPkg()` 가 `null`** 이라 칩이 그 절을 안 그린다 — **P52-a 는 `packages.json` 한 항목만** 더한다(코드 0줄).

### 2.11 판당 한 대 — `maxPerPark` (**신설, B46**)

```ts
// src/data/schema.ts — FacilityDef 에 optional 한 필드                      [49a]
maxPerPark?: number;     // 이 판에 놓을 수 있는 최대 개수. 없으면 무제한

// src/sim/game.ts:2220(해금 검사) 바로 아래 · :2221(check) 앞                [50a]
if (def.maxPerPark !== undefined && this.facilities.all.filter((o) => o.defId === defId).length >= def.maxPerPark)
  return { ok: false, reason: '이 기구는 판에 하나뿐입니다 — 지금 있는 자리를 옮기세요' };
```
- **읽는 production 자리는 정확히 하나**(`canPlace`) — 정적 자가 그것을 지킨다(50a-12ⓒ).
  `canMoveFacility`(`:2259`)는 **개수를 안 늘리므로 안 건다**(그래서 문구가 「옮기세요」다).
- **거절 문구는 동사로 끝난다** — `FACILITY_FAIL_KO`(`facility.ts:44~52`)의 문법과 같다.
  ⚠ 다만 이 거절은 `FacilityFail` **유니언에 안 넣는다** — `check()`(`facility.ts:178`)는 **판 전체를 모른다**(`facilities.all` 이 없다).
  `canPlace` 의 다른 거절 **여덟 줄**(`:2223`~`:2231` — 내 땅 · 야외전용 · 간격 · 실내전용 · 입구 위 · 입구 가장자리 · 돈 · 접면)과 **같은 층**이고, 그중 셋(`:2223`·`:2226`·`:2228`)이 이미 **판 전체를 훑는다**.
- **데이터**: `rig_disc` 만 `maxPerPark: 1`. **P49-a 에서는 효과 0** — 그 페이즈의 `check()` 는 물 위를 `on-pool` 로 거절해
  `rig_disc` 자체를 못 놓는다(그래서 「데이터를 먼저, 규칙을 나중에」가 성립한다).
- **검사 셋**(49a-15ⓒ): ① `maxPerPark ⇒ class==='rig' ∧ buildable !== false` ② `maxPerPark` 를 가진 def 은 **정확히 1종**
  ③ 그 id 는 `rigs.json` 의 `to` 에 **없다**(개조로 둘째가 생기지 않는다 — `canConvertFacility` 는 `canPlace` 를 안 지난다).

### 2.12 개조 미리보기 — **P51 네 값 + P52-b 위험 두 필드** (**신설, B48**)

```ts
// src/sim/game.ts — P51 이 내는 모양
export interface ConvertPreview {
  thrillNow: number; thrillNext: number;      // thrillOf (신설, P50-b)
  capNow: number;    capNext: number;         // capacityOf (facility.ts:59) — 그대로 호출
  safeNow: number;   safeNext: number;        // def.safe — 데이터 그대로
  cost: number;                               // convertCost(from, to, lv)
  riskNow?: string;  riskNext?: string;       // ← P52-b 가 더한다 (accident.ts 가 서는 페이즈)
}
```
- **P51 문구**: `스릴 2 → 3 · 정원 2 → 3 · 안전 2 → 1 · 개조비 1,800G` (네 값)
- **P52-b 가 잇는 절**: ` · 위험 주의 → 경계` — `riskNow/riskNext` 가 `undefined` 면 **안 그린다.**
- 자리는 `facility-info.ts` 의 `row(k, v)` 헬퍼(**`:96~102`**, `ICON` 표는 `:95`)로 **개조 버튼 바로 위 한 행**.
- ⚠ **P51 커밋에 `accident.ts` import 0** — 실측으로 그 파일이 **아직 없다**(`src/sim/accident.ts` 없음).
  49a-1 이 `rig.ts` 에서 잡은 「뒤 페이즈 파일을 앞당김」과 **같은 종류**라 자도 같은 모양으로 둔다(51-6 정적 절).

---

## 3. 데이터

### 3.0 새 필드 — 통합본 §4.0 의 **11 → 12** · 검사 **두 줄 교체 + 한 줄 신설**

| 필드 | 검사 (변경분만) |
|---|---|
| `chain` | 「같은 태그의 `buildable !== false` def 중 **`unlock.source === 'start'` 가 2종 이상**」(D182 ③) |
| `needsVest` | ⚠ **`⇒` 를 `⇔` 로** — **정의역은 `class === 'rig'` 전 def(22종, N28)**: `needsVest === (depth === 'deep')`. 한 방향만 재면 **절반이 빈 채로 초록**이다 |
| **`maxPerPark`**(신설, B46) | `maxPerPark ⇒ class==='rig' ∧ buildable !== false` · **가진 def 은 정확히 1종** · 그 id 는 `rigs.json` 의 `to` 에 **없다** |

**`validateRigData`(신설)** — `class:'rig'` 공통 검사는 통합본 그대로(`slide===null` · `menuSlots===0` · `indoorOnly===false` ·
`usageFee===0` · `capacity>=1` · `cost/pop ∈ [60,140]` · `maint ≈ pop×5.3 ±30%` · `pop/(w×d) ≥ 2.8` · `season` 4칸 ·
**`capacity ≥ 6` 이면 발자국 ≥ 6칸**)에 **위 세 줄**을 얹는다.

### 3.1 새 기구 **21종** — 통합본 §4.1 그대로 · `needsVest` **세 칸**만 더한다

> §4.1 표의 21행 중 이 개정이 건드리는 것은 **`needsVest` 열 셋**이다. 값(pop·cost·maint·thrill·safe·hpΔ)은 **0줄**.

| id | depth | 지금(계획 표) | **뒤** | 근거 |
|---|---|---|---|---|
| `rig_blob` | deep | ✔ | ✔ | 변경 0 |
| `rig_totem` | deep | ✔ | ✔ | 변경 0 |
| `rig_iceberg` | deep | — | **✔** | B41 (카탈로그 §3-1) |
| `rig_jump_tower` | deep | — | **✔** | B41 · thrill 4 |
| `rig_disc` | deep | — | **✔** | B41 · thrill 4 · **`maxPerPark: 1`**(B46) |

**해금 배분 — 통합본이 정본이다**: **`start 8 · rank 9 · cert 3 · wish 1 = 21`** · 정의 **53**(기구 21 + 부품 13 + 개조 20) ·
**사건 43**(시설 13 + 부품 13 + 개조 17). **게이트는 데이터에서 센다**(53b-5).
⚠ 표에서 직접 센 값: 시작 8 · ★1 4(`rig_blob`·`rig_roller`·`rig_sunbed`·`rig_rack`) · ★2 3(`rig_slidedock`·`rig_float_bar`·`rescue_dock`) ·
★4 1 · ★5 1 → **rank 9** · 인증 3(`rig_iceberg`·`rig_kids_park`·`rig_led_buoy`) · 소원 1(`rig_totem`).

### 3.1c `needsVest` 동치 — **표에서 세어 7/7** (**신설, B45 · 지시 1**)

정의역은 **`class === 'rig'` 22종**(새 21 중 rig **17** + 이전 12 중 rig **5** — N28). 그중 `depth === 'deep'` 은 **7종**이다.

| # | id | 어디 표 | 위치 | `depth` | 지금 | **뒤** |
|---:|---|---|---|---|---|---|
| 1 | `rig_blob` | §4.1 | 물 | deep | ✔ | ✔ |
| 2 | `rig_totem` | §4.1 | 물 | deep | ✔ | ✔ |
| 3 | `rig_iceberg` | §4.1 | 물 | deep | — | **✔** |
| 4 | `rig_jump_tower` | §4.1 | 물 | deep | — | **✔** |
| 5 | `rig_disc` | §4.1 | 물 | deep | — | **✔** |
| 6 | `trampoline_w` | §4.2 | 물 | deep | ✔ | ✔ |
| **7** | **`diving`** | **§4.2** | **링**(`onRing`) | **deep** | **—** | **✔ (지시 1)** |

- **deep = 7 · `needsVest` = 7 · 동치 7/7** ✔ · **non-deep 15 종은 전부 ✗** (22 − 7 = 15).
- **`diving` 이 링 시설인데도 정의역에 든다** — §3.6 **규칙 6**(링 시설의 `depth` 는 발자국 4이웃 물 칸 중 하나 이상이 그 깊이)이
  「이 시설은 **깊은 물에 접해 있다**」를 뜻하고, 다이빙대는 **그 물로 뛰어든다.** 카탈로그 §2 D 가 「다이빙대 … 요구 **조끼**」다.
- **⚠ 실지는 전 기구가 조끼다**(§3-1 「안 준 곳은 없다」). 우리가 `deep` 에만 거는 것은 **하드 게이트의 정의역**이지 사실 묘사가 아니다 —
  전부에 걸면 판이 잠긴다(D107). 그래서 `rig_slide`(대형 슬라이드 대응)는 `depth any` 라 ✗ 이고, 그 사실이 §4.0 검사에 그대로 적힌다.
- **밸런스**: 조끼 없는 손님이 못 타는 기구가 **3 → 4종**(★1 `diving` 이 늘었다). 판정은 **P52-a 밴드**(`vestShare`·`rigUseShare`) —
  P49-a 에는 조끼 규칙이 없어 효과가 0 이다. 리스크 **R7** 을 그대로 승계하고 손잡이는 **팔찌 출처 둘**이다.

### 3.1a 카탈로그 대조 — 여덟 건의 자리 (B39 규칙 하나로 · **B46·B49 로 두 칸이 바뀐다**)

| 실지 (카탈로그) | 축 | 결정 | 신설 종 |
|---|---|---|---|
| **수상 장애물 코스 · 징검다리**(§2 D · (b)#8) | **플로팅** | **이미 있다** — `obstacle` 3조각(`rig_bridge`·`rig_stepstone`·`rig_beam`). 계열 이름만 「수상 장애물 코스」(B44). ⚠ **카탈로그가 D182 를 사후 검증했다** | **0** |
| **잠수 제트보트 = 판당 1대 랜드마크**((b)#4) | 성질 **플로팅** · 탈것 **견인** | ⚠ **4차의 「이미 있다」는 틀렸다**(N24) → **B46 이 `maxPerPark: 1` 을 실물로 만든다**(`rig_disc`). 탈것 자체는 `jetboat`(power cap 6)가 이미 그것이다(실지 문구 「540~720도 급선회 + **잠수**」). **SNS 계수 절반은 안 받는다**(M11) | **0** |
| **UFO 8인**((b)#1) | **견인** | `flycarpet` **cap 8** 을 「UFO」로(B42 #2) | **0** |
| **마블 계열 3단**((b)#2) | **견인** | `swing` **cap 4** 를 「마블」로(#3). ⚠ **4차는 「개조 문법이 없어 백로그」라고 적었는데 틀렸다**(N26 — `upgradeOf` 9/33). **막는 것은 범위**다: 새 gear 두 종은 `equipment.json` 정원·요금과 `courses.json` 적합도를 같이 유도해야 하고 **그 둘은 코스 축 소유**다 → 백로그(M12) | **0** |
| **바이퍼**((b)#3) | **견인** | `air_chair`(cap 1 · `thrillBase` 38)를 「바이퍼」로(#4) | **0** |
| **단군**((b)#5) | **견인** | `honeycomb`(cap 6, 육각 중복)을 「단군」으로(#1) | **0** |
| **웨이크서핑**((b)#6) | **견인** | `tow-boats.json` 의 **셋째 profile** — 코스 축이고 P50 밖 → 백로그(M8) | **0** |
| **보팅 투어**((b)#7 · §3-18 남이섬 400,000) | **어느 축도 아니다** | 기구도 코스도 아닌 **패키지**(스릴 0 · 팀 단위 · 뷰가 매출을 정한다) — `packages.json` 그릇이 맞다. **자리만 지목하고 안 넣는다**(M10) | **0** |

**우리에 있는데 실지에 드문 것** (카탈로그 §4(c) 일곱) — B42 가 여섯을 이름으로 닫고 하나를 확인한다:

| 우리 | 카탈로그 판정 | 결정 |
|---|---|---|
| 하이드로포일 | 국내 빠지에 **한 곳도 없다** | **이름 교체** → 플라이보드(B42 #5). ⚠ `level:8` 은 **`gears.json` 의 `unlock`**(N29) |
| 에어체어 | 마찬가지로 없음 | **이름 교체** → 바이퍼(#4) |
| 마린제트 | **제트스키와 같은 것** | **이름 교체** → 샤크 제트보트(#6) |
| 벌집튜브 vs 육각튜브 | **같은 기구의 두 별칭** | **이름 교체** → 단군(#1) |
| 워터롤러 | 견인이 아니라 **아쿠아파크 모듈** | **이미 맞다** — `rig_roller` 를 **플로팅**에 뒀다. 견인 쪽 `water_roller` 는 **남기고 이름만 가른다**(#7) |
| 블롭점프가 견인 | 실지는 **고정 플로팅 · 둘이 있어야 성립** | **이미 맞다** — `rig_blob`(`team 2`·`needsVest`)이 실지판. 견인 쪽은 이름만 가른다(#8) |
| 플라잉카펫 · 좌우그네 | 대응 간판 못 찾음 | **이름 교체**로 자리를 실지 상위에(#2·#3) |

### 3.1b 정원 눈금 — 실측이 카탈로그를 이겼다 (B40 ②)

| 축 | 우리 (실측) | 실지 (카탈로그) | 판정 |
|---|---|---|---|
| **견인** `equipment.json` 30종 | **1~10 · 중앙 4** (1:5 · 2:4 · 3:3 · 4:6 · 5:2 · 6:7 · 8:2 · 10:1) | 2~12 | **폭은 이미 맞다.** 없는 것은 **상단 한 칸(11~12인)**뿐이고 하단(강습 1인 5종)은 우리가 더 넓다. ⚠ 카탈로그의 「3~6에 몰려 있다」는 **정원 필드가 없는 `gears.json`** 을 읽은 값이다(미결 M7) |
| **플로팅** 「빠지」 탭 33종 | **0~8 · 중앙 2**(`cap ≥ 6` 은 셋) | 1~4 + 「다수」 둘 | **맞다.** 「다수」의 게임 번역은 정원이 아니라 **면적**이다 — `turtle_island` 48칸 · `airbounce` 30칸 · `rig_kids_park` 6칸 |

**바꿀 값 0**, 대신 눈금을 게이트로 못 박는다(49a-15ⓑ): **`capacity ≥ 6` 이면 발자국 ≥ 6칸**(실측 전수 통과 — 6/6 · 8/48 · 8/30).

### 3.2 이전 12종 · 개조 20 — 통합본 그대로. **§4.2 의 `diving` 행에 `needsVest` 한 칸**

| 자리 | 값 | 근거 |
|---|---|---|
| 해금 배분 | `start 8 · rank 9 · cert 3 · wish 1` | D198 |
| 사건 수 | **43** | 시설 13 + 부품 13 + 개조 17 |
| 정의 수 | **53** | 기구 21 + 부품 13 + 개조 20 |
| **`diving` 행** | `rig · onRing · depth deep · 3/1` **+ `needsVest`** | **B45(지시 1)** — 이 개정이 §4.2 에서 바꾸는 **유일한 칸** |

「빠지」 탭 **33행**(새 21 + 이전 12, `buildable !== false`) · 논리 ID **필수 57 · 총 97** — 통합본과 같다.

### 3.3 견인 축 이름 8건 (B42) — `gears.json` **와** `equipment.json` 두 파일

통합본 §4.1a 표 그대로. **`id`·`cat`·`key`·`taste`·`look`·`pop`·`unlock`·`sprite`·정원·요금·`thrillBase`·`upgradeOf` 전부 0줄.**
⚠ **두 파일을 같이** 고친다 — 실측 공유 id **30건이 지금 전수 이름 일치**(불일치 0)이고, 한쪽만 고치면 도감과 코스 화면이 갈린다.
⚠ **`upgradeOf` 를 손대지 않는다**(B49) — 이름만 바뀌고 **공방 사슬은 그대로**다(49a-16ⓒ 가 바이트로 잰다).

---

## 4. 코드 변경 목록

### 4.1 P48-c (동작 변화 0) — B34 + B37ⓓ

| 파일:함수 | 신설/수정 |
|---|---|
| `tools/gate.ts:10` · `tools/verify.ts:22` `goalNum` | **수정** — ⚠ **P48-a 가 먼저 내면 여기선 뺀다**(→ 섹션 A) |
| `src/data/schema.ts:9` `FacilityClass` | **수정** — `'rig'`(지금 6종 → 7종) |
| `src/data/schema.ts:430` `needsInRadius` | **수정(B37ⓓ)** — `'ppaji'`(지금 5종 → 6종). `packages.json` 에 값이 0건이라 **동작 0** |
| `src/data/data.test.ts:28`·`:34`·`:57` | **수정** — `CLASSES` · `toBeNever()` · `COST_POP_BAND.rig = [60,140]` |
| `src/sim/condition.ts:78` `CLASS_KO` | **수정** — `rig: '기구'` |
| `src/assets/draw/facility.ts:13` `BODY_H` | **수정** — `rig: 20` |
| `src/assets/draw/fac-sprites.ts:48` `DEFAULT_BY_CLASS` | **수정** — `rig: { tpl: 'floatPad' }` + `floatPad` 템플릿 **추가만**(D145) |
| `src/sim/guest.ts:131` `tasteWeight` · `:704` `setEmote` | **수정** — `\|\| cls === 'rig'` (rig def 0개라 **동작 0**) |

### 4.1a P49-a — 데이터 · 골격 · 등급 절반 · 인기 원천 교체

| 파일:함수 | 신설/수정 |
|---|---|
| **`src/sim/rig.ts`** | **신설(B36ⓐ)** — **`ppajiGrade` · `RIG_GRADE_POP_MUL` · `CHAIN_KINDS_FOR_GRADE3` 셋뿐**. 나머지 여섯은 **[50b]** — 게이트 49a-1 이 심볼 0건을 잰다 |
| **`src/data/schema.ts` `maxPerPark?`** | **신설(B46 ⓐ)** — optional 한 필드. **데이터가 켜기 전엔 동작 0** |
| `src/data/facilities.json` | **수정** — 새 21종 · 이전 12종 필드 · **`needsVest` 네 칸**(`rig_iceberg`·`rig_jump_tower`·`rig_disc`·**`diving`** — B41+B45) · **`rig_disc.maxPerPark = 1`** |
| `src/data/gears.json` · `src/data/equipment.json` | **수정(B42)** — `name` **8건**. 다른 필드 0줄(`upgradeOf` 포함 — B49) |
| `src/data/rig-parts.json` | **신설** — 부품 **13**(D199) |
| `src/sim/rig-upgrade.ts` | **신설(저장부만)** — `RigStore{known, owned, toSnapshot, fromSnapshot}` |
| `src/sim/game.ts:416~428` `grant` | **수정** — `case 'rigPart'` |
| `src/sim/game.ts` `poolOfFacility` · `ppajiGradeOf` | **신설** — §2.5 · §2.6 |
| `src/sim/game.ts:1283~1284` `computePoolState`(정의 `:1272`) | **수정** — §2.7 한 줄 (호출부 `:1286`) |
| `src/sim/pool-state.ts:16,27,84` | **수정** — `tilePopSum?` → **`tilePop`(필수)** · `??` 폴백 **삭제** |
| `src/sim/pool.ts:77~81` `PoolStore.state` | **삭제** — `pool.test.ts:52` 를 `poolState` 로 옮긴다 |
| `src/data/certs.json` | **수정** — 보상 12 → `facility` **3** + `rigPart` **9**(D199) |
| `src/data/tiles.json` · `retilePool`/`retileCost`/`grid.poolTile`/`unlocked.tiles`/`Carryover.tiles` · `bot.ts:156~159` | **삭제** |
| `src/data/data.test.ts` | **수정** — `validateRigData` 신설 · `chain` 검사 · **`needsVest` 동치(정의역 22종)** · **`maxPerPark` 세 줄** · **이름 검사 셋** |
| `tools/bot.ts` | **수정** — `--warn <keys>`(D139) |

### 4.2 P49-b — (섹션 A/사각형 붓 소관) + 이 섹션이 요구하는 것

| 파일:함수 | 신설/수정 |
|---|---|
| `src/sim/pool.ts` **`tileOwner`·`ownerIdAt`·`ownerAt`** + `recompute()`(`:84`)가 채운다 | **신설 — [49b] 는 이 셋뿐**(B36ⓑ) |
| `src/sim/pool.ts:70` · `src/sim/guest.ts:564`·`:615`·`:878` | **수정** — `tiles.includes` **넷** 제거 · 두 줄에 **「[50a] 에서 `isOpenAt` 로」 주석** |

### 4.3 P50-a — 물 위 배치 · 진입 · 도달 · `open` · **판당 한 대** (한 커밋)

| 파일:함수 | 신설/수정 |
|---|---|
| `src/sim/facility.ts:178` `check` | **수정** — `WaterRules` **필수** 인자 · 9단 · 3사유 (`waterMax = 47` 인자 삭제) |
| `src/sim/facility.ts` `guestWalkable`·`setWalkOn`·`walkOn` | **신설** — §2.1 |
| `src/sim/guest.ts:248~252` · `src/sim/game.ts:1087` · `:2610~2612` | **수정** → `guestWalkable` (**세 벌 → 한 벌**) |
| `src/sim/pool.ts` `Pool.open`·`blocked`·`setBlocked`·`isOpenAt`·`totalOpenTiles` | **신설 — [50a] 단일 태그** |
| **`src/sim/game.ts:2220` 아래 `maxPerPark` 한 줄** | **신설(B46 ⓑ)** — §2.11. 읽는 production 자리는 **여기 하나** |
| `src/sim/game.ts:2584` `afterWorldChange` | **수정** — `pools.setBlocked(rigFootprintMask)` 한 줄 (`recompute()` 앞) |
| `src/sim/game.ts:1395` 유입 | **수정 — [50a]** — `totalTiles()` → `totalOpenTiles()` |
| `src/sim/guest.ts:564`·`:615`·`:772`·`:875` | **수정 — [50a]** — 착수·표류·풀 가중치·입수점이 **`isOpenAt`** 을 본다(§2.0 둘째 걸음) |
| `src/sim/game.ts` `ppajiWaterAt`·`depthAt`·`ringAt` | **신설** — `check()` 에 넘길 세 술어 |
| `game.ts:2205`(`tooClose`) · `:2231`·`:2270`(frontage) · `:1063`(`autoPathFor`) · `:1109`(`ensurePath`) · `:2566`(`recomputePassBy`) | **수정** — 예외 · D100 조이기 |
| `src/ui/windows/build.ts:22` `BUILD_TABS` · `:33` `UNLOCK_KO` · `build.test.ts:8` · `tools/verify.ts:1326` | **수정** — 탭 8 → **9**(`ppaji` index 1) · 문구 늘림 |
| `src/sim/facility.test.ts` · `p3.test.ts:17` · `course.test.ts:121` | **수정** — `check()` 에 `WaterRules` 스텁 |

### 4.4 P50-b — 켜짐 · 사슬 · 등급 값 · 화면 · 돈

| 파일:함수 | 신설/수정 |
|---|---|
| `src/sim/rig.ts` | **수정(확장)** — `RigState`(`chainKinds`) · `computeRigs` · `chainScale` · `CHAIN_BASE/CAP` · `CHAIN_KO` |
| `src/sim/facility.ts:59` `capacityOf` · `PlacedFacility.chainLen?` | **수정** — `chainScale`(파생 캐시는 스냅샷에서 뗀다) |
| `src/sim/facility.ts` `thrillOf` | **신설** — `def.thrill ?? 0`, 곱셈 없음(D151) |
| `src/sim/game.ts` `rigsOf`·`rigChainTiles`·`rigDepthOf`·`rigLinkEdges`·`aimPreview`·`rigSizeHint` | **신설** |
| `src/sim/game.ts` `ppajiPkgPrice`·`ppajiPkg` | **신설(B37ⓑ)** — §2.10 |
| `src/sim/game.ts:2584` | **수정** — `computeRigs` · `setWalkOn` diff · `evictFrom`(D158) |
| `src/sim/guest.ts:517,677,702` | **수정** — 기구 위 착석 · 종료 · `sat += thrillOf×3×satMul` |
| `src/ui/windows/build.ts:92` | **수정** — 자리 이유 sub 대체 |
| **`src/ui/windows/place.ts:22~23, 36~37, 119~128`** | **수정(B37 · 줄 정정 N22)** — `chips` 신설 · `aimPreview` 여섯을 `data-*` + 텍스트로 · `hidden = !r.ok`. **`label` 은 `:124`, `showGhost` 는 `:128`** |
| **`src/ui/style.css:683`** | **수정(B37)** — `.kdock-row` 에 `flex: 0 0 auto` **합치고** `.kdock-chips` 규칙 하나(`min-width: 0`) |
| `src/ui/windows/pool-info.ts` · `facility-info.ts` | **수정** — 5행(D202) · 기구 3행 + 사슬 오버레이(`CHAIN_KO`) |
| `src/render/scene.ts:410,720` + 이음쇠 | **수정** — 휴식 기구 `lie` · 꺼진 기구 틴트 · `rigLinkEdges` 그리기 |
| `src/sim/bot.ts` · `tools/bot.ts:17` | **신설** — `attachRigs`·`chainRigs`(종 우선) · 밴드 7 · `--no-rig` |

### 4.5 P51 — 이 섹션이 요구하는 것만 (**B48**)

| 파일 | 무엇 |
|---|---|
| `src/sim/game.ts` `convertPreview` | **신설 — 네 값**(`thrillOf`·`capacityOf`·`def.safe`·`convertCost`). ⚠ **`accident.ts` import 0** |
| `src/ui/windows/facility-info.ts` `:96~102` | **개조 델타 행 [51]** — `riskNow/riskNext` 가 `undefined` 면 그 절을 안 그린다 |
| `src/data/rigs.json` | 개조 **20** · **이름은 별명**(B43 · 게이트 51-16, 별칭 풀은 카탈로그 §2) |

### 4.6 P52-a — **코드 0줄** (B37ⓒ) · P52-b — 위험 두 필드 (**B48**)

| 파일 | 무엇 | P |
|---|---|---|
| `src/data/packages.json` | **다섯째 항목 한 개**(`ppaji`, `needsInRadius:['ppaji']`, `price 400`) | **52-a** |
| `src/sim/game.ts:853` `packageFor` | **수정 한 줄** — ppaji 분기가 `Game.ppajiPkgPrice(pk, seatPpajiGrade(seatUid) ?? 0)` 를 부른다(산식 0줄) | **52-a** |
| `src/sim/game.ts` `convertPreview` | **수정** — `riskNow`/`riskNext` 를 채운다(`accidentChance` 를 **호출만**) | **52-b** |
| `src/ui/windows/facility-info.ts` | **수정** — 개조 델타 행에 위험 절을 **잇는다** | **52-b** |

---

## 5. 게이트 기준 (측정 가능한 문장 · **자 종류**를 끝에)

> 번호는 통합본 §6 을 잇는다. **굵은 번호가 새로 쓴 것.**

**`gate -- p48c`**
- **48c-3** 기존 절에 더한다 — `PackageDef['needsInRadius']` 가 `'ppaji'` 를 **받고**,
  `PACKAGES.filter(pk => pk.needsInRadius.includes('ppaji')).length === **0**` (**동작 0 의 증명**) **(단위+정적)**
- **48c-4 (신설, B46)** `FacilityDef['maxPerPark']` 가 **타입에 있고**,
  `FACILITY_DEFS` 중 그 필드를 가진 def 이 **0종**이며 `grep -rn 'maxPerPark' src/sim src/ui` 가 **0건**
  (필드만 열고 데이터·규칙은 아직 없다) **(단위+정적)**

**`gate -- p49a`**
- **49a-1 (보강)** ⓐ `src/sim/rig.ts` 의 `export` 심볼이 **정확히 셋** ⓑ 같은 파일에 `computeRigs`·`chainScale`·`RigState`·`CHAIN_BASE`·`CHAIN_CAP`·`CHAIN_KO` 심볼 **0건**
  ⓒ `grep -rn "computeRigs\|chainScale" src tools` = **0건** · **음성 대조군**: `computeRigs` 를 이 커밋에 미리 넣으면 ⓐⓑⓒ 빨간불 **(정적)**
- **49a-3 (보강, N21)** 셋업이 `float_deck`(shop·★1)·`rig_rack`(★1)·`rescue_dock`(★2)을 놓기 전에
  `grant({kind:'unlock'})` 로 **먼저 열거나** `placeFacility(…, { inherited: true })` 를 쓴다
  (`canPlace` 의 `game.ts:2220` 해금 검사). ⚠ **이 줄이 없으면 「배치 실패 → 등급 0」으로 통과**해 **아무것도 안 재는 검사**가 된다 **(단위)**
- **⭐ 49a-15 (개정, B41+B45+B46)** 데이터 **세 줄** **(단위)**:
  ⓐ **동치** — **`class === 'rig'` 인 def 22종 전수**에서 `needsVest === (depth === 'deep')`.
  **참인 행이 정확히 7**(`rig_blob`·`rig_totem`·`rig_iceberg`·`rig_jump_tower`·`rig_disc`·`trampoline_w`·**`diving`**)이고 나머지 **15 는 전부 ✗**
  · **음성 대조군 둘**: **①** `diving` 의 `needsVest` 를 빼면 빨간불(⚠ **한 방향 `⇒` 검사로는 통과한다 — 그것이 라운드 4 문서의 상태였다**)
  **②** `rig_iceberg` 것을 빼면 빨간불
  ⓑ **정원 눈금** — 「빠지」 탭 33행에서 `capacity ≥ 6` 이면 **발자국 ≥ 6칸**(실측 3/3: 6/6 · 8/48 · 8/30)
  · **음성 대조군**: `rig_totem`(1칸)의 `capacity` 를 6 으로 올리면 빨간불
  ⓒ **(신설) `maxPerPark`** — ① `maxPerPark ⇒ class==='rig' ∧ buildable !== false` ② 가진 def 이 **정확히 1종**이고 그 id 가 **`rig_disc`** ③ 그 id 가 `rigs.json` 의 `to` **집합에 없다**
  · **음성 대조군**: 둘째 def(`rig_jump_tower`)에 `maxPerPark: 1` 을 붙이면 ②가 빨간불
- **49a-16 (유지, B42)** 이름 **세 줄** **(단위+정적)**:
  ⓐ `gears.json` ∩ `equipment.json` 공유 id **30건 전수 `name` 일치**(실측 지금 30/30) · **음성 대조군**: 한쪽만 고치면 빨간불
  ⓑ **축 이름 충돌 0** — 공백·중점을 지우고 비교했을 때 「빠지」 탭 33종의 `name` 집합 ∩ `equipment.json` 30종의 `name` 집합 = **∅**
  (실측 지금 **2건**: 워터 롤러 · 블롭 점프) · **음성 대조군**: `blobjump` 이름을 되돌리면 빨간불
  ⓒ **id·값 무변경** — `git show <base>:src/data/equipment.json` 과 지금 파일에서 `name` 을 **뺀 나머지 전 필드가 바이트 동일**
  (`gears.json` 도 같이 — **`upgradeOf` 9건 포함**, B49) · **음성 대조군**: `capacity` 를 한 칸 바꾸면 빨간불
- **49a-2·49a-4~49a-14** 통합본 그대로

**`gate -- p49b`**
- **49b-8** ⓐ 정적 `tiles.includes` 가 `src/sim/**` 중 `*.test.ts` 를 뺀 파일에서 **0건**(허용 목록은 `g36.test.ts:54`·`:55` **이름으로**)
  ⓑ 성능 네 자리(1·1·4·4) ⓒ 음성 대조군 옛 `find/includes` **(정적+단위)**
- **49b-11** `src/sim/pool.ts` 에 `open`·`setBlocked`·`isOpenAt`·`totalOpenTiles` 심볼 **0건**, `tileOwner`·`ownerIdAt`·`ownerAt` **셋은 있다**
  · **음성 대조군**: `totalOpenTiles` 를 앞당기면 빨간불 **(정적)**

**`gate -- p50a`**
- **50a-2** n칸 기구를 놓으면 `pool.open.length` 가 정확히 **n** 줄고 `tiles.length` **0** · 허가 사용량 **0** · `poolState.popularity` 의 tilePop 항 **불변** **(단위)**
- **50a-6** `entryTiles` **함수 본문 문자열 동일**(중괄호 균형까지 추출해 문자 비교) + 호출부 `guest.ts:270` 이 `guestWalkable` 을 넘긴다 · **음성 대조군**: 본문에 공백 한 글자 **(정적)**
- **50a-9** 세 시점 × **6,912칸 전수** 술어 대조, 불일치 칸 **0** **(단위)**
- **50a-10** 기구 0개 판에서 `totalOpenTiles() === totalTiles()` 이고 `dailyTarget()`(`game.ts:1392`)이 P49-b 값과 **오차 0** **(단위)**
- **50a-11** **`open` 의 소비자가 전부 이 커밋에 있다** — 부르는 production 자리가 **정확히 다섯**:
  `game.ts:1395`(유입) · `guest.ts:564`(착수) · `:615`(표류) · `:772`(풀 가중치) · `:875`(입수점).
  · **음성 대조군**: 하나를 `tiles` 로 되돌리면 **이 정적 자가** 빨간불 · ⚠ **개수가 아니라 파일:심볼 목록으로** 적는다 **(정적)**
- **⭐ 50a-12 (신설, B46)** **판당 한 대** **(단위+정적)**:
  ⓐ **거절** — `rig_disc` 를 물 위 유효한 자리에 놓고, **다른 유효한 자리**에 둘째를 놓으면 `ok === false` 이고
  `reason` 이 `이 기구는 판에 하나뿐입니다 — 지금 있는 자리를 옮기세요` **문자 그대로**. 그 뒤 `facilities.all.filter(defId==='rig_disc').length === 1`
  ⓑ **이동은 된다** — 그 한 대를 `moveFacility` 로 다른 유효한 자리에 옮기면 `ok === true`(개수가 안 늘어난다)
  ⓒ **읽는 자리 하나** — `grep -rn 'maxPerPark' src/sim src/ui` 가 **`schema.ts` 선언 1 + `game.ts` `canPlace` 1 + `data.test.ts`** 뿐이고
  `facility.ts`(=`check()`)에 **0건**
  · **음성 대조군**: `rig_disc` 의 `maxPerPark` 를 데이터에서 지우면 **둘째가 놓이고** ⓐ 가 빨간불
  · **음성 대조군 2**: 그 한 줄을 `canMoveFacility` 에도 넣으면 ⓑ 가 빨간불(이동을 막으면 「옮기세요」가 거짓말이 된다)
- **50a-1·50a-3~50a-5·50a-7·50a-8** 통합본 그대로

**`gate -- p50b`**
- **50b-3** ⓐ 연결은 정원 하나에만 · ⓑ 3종 사슬 4 에서 `chainLen 4 ∧ chainKinds 3`, `bridge` 4개면 `chainKinds 1` · ⓒ 세 축 분리 **(단위)**
- **50b-4** 등급 0/1/2 · 배율 비 1.357 ± 0.005 · 등급 3 의 조각 다양성 **(단위)**
- **50b-8** ⓐ~ⓖ 그대로 · **ⓗ** 「빠지」 탭에서 `chain` 이 있는 행의 sub 에 **`CHAIN_KO[chain]` 문자열**(3행 전수 「수상 장애물 코스」) · 음성 대조군: 태그 원문(`obstacle`)이 뜨면 빨간불 **(하네스)**
- **50b-9** 유입 역추 **중간점 0.902**(open 12/tiles 20) · **끝점 0.756**(0/20), 오차 ≤ 0.001 **(단위)**
- **50b-12 (보강)** 하네스(**진짜 터치**): ⓐ 탭 ≤ 5 · ⓑ 확정 바에 `연결`·`등급`, 꺼진 자리면 `꺼짐` · ⓒ `data-rig-grade-next`·`data-rig-chain-next` 가 확정 뒤 실효값과 **오차 0**(물 위 기구 20종 전수) ·
  ⓓ 상시 이음쇠(공유 변 픽셀 · 수 == `rigLinkEdges().length`) · ⓔ 확정 뒤 칸 픽셀이 `DEFAULT_BY_CLASS.bush` 와 다름 ·
  **ⓕ 돈이 있다** — ① `#dock-place-chips` 가 놓을 수 있는 자리에서 `hidden === false` · **못 놓는 자리에서 `hidden === true`**
  ② 이 페이즈에서는 `data-pkg-next` 가 **빈 값**이고 칩 텍스트에 `자유이용권` 이 **0회**(**P52-a 의 음성 대조군**)
  ③ 확정 바 `.kdock` 의 높이가 조준 전후로 **같다**(K47-③ `refreshAim` 재측정 계약) **(하네스)**
- **⭐ 50b-19 (신설, B47)** **「시그니처」의 지시 대상이 하나다** — 이 판이 **새로 더하는 문자열**에서
  ⓐ 「시그니처」가 나오는 자리는 **등급 4 라벨 하나**뿐이고 `ppajiGrade(x)===4` 일 때만 뜬다
  ⓑ `rig_disc` 의 `name`·`desc`·건설 카드 sub·정보창 어디에도 「시그니처」 **0건**(그 자리의 낱말은 **「랜드마크」**)
  ⓒ 예외는 **`mongol_tent.desc` 하나**로 **이름을 적어** 허용한다(기존 산문 — 목록에 없으면 빨간불)
  · **음성 대조군**: `rig_disc.desc` 에 「시그니처」를 넣으면 ⓑ 가 빨간불 **(정적)**
- **50b-1·50b-2·50b-5~50b-7·50b-10·50b-11·50b-13·50b-14** 통합본 그대로

**`gate -- p51`**
- **⭐ 51-6 (문면 고정, B48)** **개조 델타는 네 값이다** — 확정 **전** 화면의 `스릴/정원/안전/개조비` 네 값 == 확정 **후** 실효값,
  **오차 0**(20건 전수, DOM 문자열). ⓑ **정적**: `convertPreview` 를 담은 파일과 `facility-info.ts` 에
  `accidentChance`·`accident.js` import **0건**이고, 그 행의 텍스트에 **「위험」이 0회**
  · **음성 대조군**: 위험 절을 P51 에 미리 넣으면 ⓑ 가 빨간불 **(하네스+정적)**
- **51-16 (B43)** `rigs.json` 20종 중 `to` 의 `name` 이 `from` 이름의 낱말(2자 이상 형태소)을 물려받은 것이 **≤ 4**(사슬 2단 셋 + 여유 1).
  실측 초안 **12건**이라 **빨간불에서 출발한다** · **음성 대조군**: 「2단 슬라이드」류로 되돌리면 빨간불 **(단위)**
- **51-9** 개조 20건의 `to.chain === from.chain` — `rig_roller`(chain 없음)는 **양쪽 `null`** 로 통과 **(단위)**

**`gate -- p52a`**
- **52a-6b (B37)** 같은 자리에서 `aimPreview(...).pkgNext` == 확정 뒤 `packageFor(g, seatUid).price`, **오차 0**, **등급 0~4 전수**
  (400 · 500 · 600 · 700 · 800G) · 확정 바 칩이 `자유이용권 400 → 500G` 를 문자 그대로 담는다
  · **정적**: `place.ts` 에 `PPAJI_PKG_GRADE_STEP` 심볼 **0건** · **음성 대조군**: 계수를 0.2 로 어긋내면 다섯 중 넷 빨간불 **(단위+하네스)**
- **52a-7·52a-10** 통합본 그대로 — ⚠ **B45 로 `needsVest` 대상이 3 → 4종**이 되었으므로 `vestShare` 밴드를 **그 판에서 다시 잰다**

**`gate -- p52b`**
- **⭐ 52b-1ⓒ (한 줄 추가, B48)** 기존 ⓒ(시설 정보 넷째 행·확정 바 라벨의 칩이 `accidentChance` 재계산과 오차 0)에 더한다 —
  **`convertPreview` 의 위험 전이(`riskNow → riskNext`)가 `accidentChance` 재계산과 오차 0**, 개조 20건 전수.
  · **음성 대조군**: `convertPreview` 안에서 위험을 다시 세는 산식을 넣고 계수를 어긋내면 ≥1 빨간불 **(단위+하네스)**
- **52b-1ⓐⓑ · 52b-2~52b-15** 통합본 그대로

**다른 절이 이 섹션 때문에 바뀌는 것**
- **53a-5 (분모, B38)** 「트리거 kind **6**」은 **새로 더하는 수**임을 명시하고 두 문장을 더한다 —
  **`StoryTrigger` 총 kind = 20**(지금 **14** + 새 6) · **`story.json` 이 실제로 쓰는 kind ≥ 18**(지금 12 + 새 6).
  ⚠ **총계만 재면 안 된다**(지금 `pools`·`money` 가 그 자리다) **(단위+정적)**
- **53b-5** `class === 'rig' || onRing === true` 인 **새** def 의 `unlock.source` 별 집계가 **`start 8 · rank 9 · cert 3 · wish 1`** 이고 합 **21** **(단위)**
- **53b-8** `signature` 점수 항은 **등급 4** 를 센다 — B47 이 그 낱말의 지시 대상을 하나로 고정했으므로 **문면 변경 0** **(단위)**
- **55-2** 논리 ID **97** · 필수 **57** · **이름 교체로 그림이 어긋난 견인 4종**(`flycarpet`·`swing`·`air_chair`·`hydrofoil`)을 P55 재생성 목록에 **이름으로** 적는다 **(정적)**

**음성 대조군 — 이 문서가 요구하는 전부 (표에서 세어 **15**)**

| # | 자 | 주입하는 위반 | 빨간불이 되어야 하는 절 |
|---:|---|---|---|
| 1 | 48c-4 | `rig_disc` 에 `maxPerPark` 를 P48-c 에 미리 넣는다 | 48c-4 |
| 2 | 49a-1 | `computeRigs` 를 P49-a 에 앞당긴다 | 49a-1 ⓐⓑⓒ |
| 3 | 49a-3 | 해금을 안 열고 놓는다(배치 실패) | 49a-3 (셋업이 없으면 검사가 공허해진다) |
| 4 | **49a-15ⓐ①** | **`diving` 의 `needsVest` 를 뺀다** | 49a-15ⓐ (⚠ 한 방향 `⇒` 자로는 **통과한다**) |
| 5 | 49a-15ⓐ② | `rig_iceberg` 것을 뺀다 | 49a-15ⓐ |
| 6 | 49a-15ⓑ | `rig_totem` 의 `capacity` 를 6 으로 | 49a-15ⓑ |
| 7 | **49a-15ⓒ** | **둘째 def 에 `maxPerPark: 1`** | 49a-15ⓒ ② |
| 8 | 49a-16ⓐ | 이름을 한 파일만 고친다 | 49a-16ⓐ |
| 9 | 49a-16ⓑ | `blobjump` 이름을 되돌린다 | 49a-16ⓑ |
| 10 | 49a-16ⓒ | `capacity` 를 한 칸 바꾼다 | 49a-16ⓒ |
| 11 | 49b-11 | `totalOpenTiles` 를 앞당긴다 | 49b-11 |
| 12 | 50a-11 | `open` 소비자 하나를 `tiles` 로 되돌린다 | 50a-11 |
| 13 | **50a-12** | **`rig_disc.maxPerPark` 를 지운다** / 그 줄을 `canMoveFacility` 에도 넣는다 | 50a-12 ⓐ / ⓑ |
| 14 | **50b-19** | **`rig_disc.desc` 에 「시그니처」** | 50b-19 ⓑ |
| 15 | **52b-1ⓒ** | **`convertPreview` 에 위험 재계산 산식 + 계수 어긋내기** | 52b-1ⓒ |

⚠ 4차가 「아홉」이라고 쓴 것은 **그때 새로 쓴 절만** 센 값이었다. 이 표가 **이 섹션이 요구하는 전부**이고 **15** 다.
(그 밖에 P52-a 의 대조군은 **50b-12ⓕ②** 가 P50-b 에서 미리 서 있고, 51-16 과 49a-15ⓐ 는 **「지금 빨간불」에서 출발한다** — 자가 먼저 서고 데이터가 따라온다.)

---

## 6. 앞선 결정과의 정합

- **D71 · D135** — 연결 보너스는 `capacityOf`(`facility.ts:59`) 하나. B45~B49 는 그 함수를 **한 글자도 안 건드린다.**
  카탈로그 §3-16(단품 20,000 · 5종 60,000)이 `chainScale` 의 `sqrt` 에 실지 근거를 준다.
- **D80 · D126 · D129 · D134** — 허가·인기·유지비·`size` 는 `tiles`, 유영·유입은 `open`. **배분 변경 0.**
- **D89 · D90** — `check()` 는 **판 전체를 모른다**(`WaterRules` 세 술어만 받는다). 그래서 **`maxPerPark` 는 `check()` 가 아니라 `canPlace`** 다(§2.11) —
  「아직 내 땅이 아닙니다」(`:2223`)·「입구 위엔 놓을 수 없습니다」(`:2228`)와 **같은 층**이고, 그 층은 이미 **여덟 줄**(`:2223`~`:2231`)이다.
- **D91 · D92 · D93 · D136** — `n`·`kinds`·배율 변경 0. **[49a] 의 인자가 다섯**인 것만 못 박았다(B47 이 그 문장의 낱말을 고쳤다).
- **D106 · D107 · D229** — **B45 가 조끼 사슬을 하나 더 넓힌다**(deep 6 → **7**). 규칙은 안 늘고 **데이터 한 칸**이며,
  하드 게이트를 `deep` 에만 거는 이유(전부에 걸면 판이 잠긴다)는 그대로다.
- **D137 · D149 · D150 · D231** — 개조는 **발견**이다. B43 이 이름까지, **B49 가 그 별칭 풀을 견인 축과 공용**으로 만든다.
- **D152 · D185** — 「미리보기 전용 산식 금지」가 **값**(B37ⓑ)에도 **위험**(B48)에도 걸린다.
- **D153 · D154 · D196** — `convertPreview` 의 네 값·보존 12필드·`chainLen` 제외는 변경 0. **B48 은 반환 필드 둘만 뒤로 민다.**
- **D162 · D203 · D233** — 자유이용권 **무제한 한 종** 유지. **「시그니처 기구가 등급을 가른다」(카탈로그 §3-15)는 이미 `allday.needGrade 4` 가 받았다** —
  그래서 B46 은 **배치 규칙만** 내고 **이용권 축을 안 건드린다**(B47 이 낱말을 갈라 그 경계가 읽힌다).
- **D182 · D227 · D228** — `obstacle` 3조각 · 축 경계 한 규칙 · **종수 21 동결**. **B46 은 종을 안 늘리고 필드 하나만** 더한다.
- **D183 · D212** — `poolOfFacility` 하나 · `pools.at()` 은 `undefined`. 변경 0.
- **D194** — P52 쪼갬 그대로. B37ⓒ 로 P52-a 는 **데이터 1 + 분기 1**, **B48 로 P52-b 는 개조 쪽에 필드 둘**이다.
- **D198 · D199** — 배분 `8/9/3/1` · 부품 13 · 사건 43 이 정본.
- **D236(감사 등록)** — **새 절 셋(50a-12 · 50b-19 · 52b-1ⓒ)은 화면·규칙과 같은 커밋에 자를 넣는다.**
  ⚠ 50b-19 는 **정적 문자열 자**라 `routes`·`PAIRS` 를 안 늘린다(새 표면이 0개다).
- **불변식 1** — 새 코드 전부 `src/sim/**`, `render/` import 0. `aimPreview`·`rigLinkEdges`·`ppajiPkgPrice`·`convertPreview` 가 **좌표·숫자·짧은 문자열만** 낸다.
- **불변식 2** — 기구 경로 rng **0회**. `poolOfFacility` 동점·`chainKinds` 동률에 결정론 tie-break 명시.
  **`maxPerPark` 판정도 rng 0**(`filter().length` 한 번).
- **불변식 3** — 이번에 늘어난 **코드 상수는 0**이다. `maxPerPark` 는 **필드(데이터)**, `needsVest` 한 칸도 **데이터**,
  이름 8건도 **데이터**다. ⚠ **`rig_disc` 라는 id 를 코드에 적지 않는다** — 적는 순간 「판당 한 대」가 규칙이 아니라 예외가 된다.

---

## 7. 리스크 · 미결 · 인터페이스

**내가 다른 섹션에 요구하는 것**
1. **섹션 A(P48-a)** — `goalNum` 수리 · `Grid.naturalAt` · S 자를 아는 `inMyWater` · **킷 빠지의 여울 8 / 강 12**(게이트 49a-10 이 킷에서 센다).
2. **섹션 A(P48-b)** — 킷 표의 `dock` 을 **본류 잔교 (56,51)** 로(49a-3 의 전제). 지금은 `startkit.ts:38` 의 `['dock', gt.i-2, w0+2]` 로 **링 오른쪽 열**이다.
3. **P49-b** — `PoolStore.tileOwner`·`ownerIdAt`·`ownerAt` **셋만** 낸다. `open` 계열 다섯은 **P50-a**(49b-11).
4. **P51** — `convertFacility` 끝에 `afterWorldChange()` · 개조판이 같은 `chain` 을 물려받음 · 개조판 이름 20건을 **별명**으로 ·
   **`ConvertPreview` 는 네 값**이고 `riskNow?`/`riskNext?` 는 **P52-b 가 채운다**(B48).
5. **P52-a** — **코드 두 줄**(`packages.json` 다섯째 + `packageFor` 의 ppaji 분기). ⚠ **`vestShare` 밴드를 `needsVest` 4종에서 다시 잰다**(B45).
6. **P52-b** — `convertPreview` 에 `riskNow`/`riskNext` 를 채우고 **52b-1ⓒ 에 한 줄**을 더한다(B48).
7. **총론(§4.0)** — 새 필드 **11 → 12**(`maxPerPark`). §6 P49-a 범위 줄의 「새 필드 11」도 같이.
8. **총론(§4.1 검산)** — 「`needsVest` 동치가 **6/6** · deep **6종**」을 **7/7 · 7종**으로, 목록에 **`diving`** 을 더한다(B45).
9. **총론(§4.2)** — `diving` 행에 **`needsVest`** 한 칸(이 개정이 §4.2 에서 바꾸는 유일한 칸).
10. **총론(§4.1a)** — 「잠수 제트보트」 행을 **「`maxPerPark: 1` 을 신설한다」**로(지금 문면은 「이미 있다」다) ·
    「마블 3단」 행의 사유를 **「개조 문법이 없다」 → 「`equipment.json`·`courses.json` 이 코스 축 소유」**로(B49).
11. **총론(§3.7 머리 주석)** — 「필드를 나중에 더하면 **시그니처**가 두 벌이 된다」를 **「인자 목록이 두 벌이 된다」**로(B47).
12. **총론(§5 UI 표)** — `windows/facility-info.ts` 행의 태그를 **「개조 델타 행 [51] · 위험 행 [52b]」**로 가른다(B48).
13. **§9.1(그림) · P55** — 논리 ID 97 · 필수 57 그대로 · 견인 4종 재생성 목록 추가(B42).
14. **코스/견인 축 소유 섹션** — B42 의 이름 8건은 **P49-a 커밋**에 얹는다(값 0줄). 웨이크서핑 profile(M8) · **마블 3단 `upgradeOf` 사슬**(M12)은 그 섹션 백로그.

**리스크**

| # | 리스크 | 잡는 게이트 | 걸리면 |
|---|---|---|---|
| **R1** | `chainKinds ≥ 3` 이 봇 세계에서 안 채워져 `rigGradeMax ≥ 3` 밴드가 죽는다 | 50b-13 · 50b-4 | 손잡이는 **봇 정책**(`attachRigs` 가 계열 안에서 종을 돌아가며)이지 문턱이 아니다 |
| **R2** | `rig_stepstone` 400G 가 가장 싸서 봇이 그것만 산다 | 50b-13(`rigsDistinct ≥ 14`) | 후보 순서를 **종 우선**으로 |
| **R3** | `rig_beam` thrill 2 로 새 판 위험 칩이 오른다 | 52b-1ⓑ | 손잡이는 `accidentFloor`·망루 반경(P52-b 소유) |
| **R4** | `poolOfFacility` 가 링 시설을 두 수역에 걸치게 잡는다 | 49a-3 음성 대조군 | 동점 규칙(칸 수 → poolId)이 결정론을 지킨다 |
| **R5** | P48-c 가 「동작 0」이 아니게 된다 | 48c-1(바이트 동일) · 48c-3 · **48c-4** | 새 템플릿 `floatPad` 는 **추가만** · `maxPerPark` 는 **타입만** |
| **R6** | `isOpenAt` 전환을 P50-a 에서 빠뜨린다 — 「기구 밑에서 헤엄친다」 | 50a-2 · 50a-11 · 50b-9 | 그 두 줄에 **코드 주석**을 남긴다 |
| **R7 (개정)** | **`needsVest` 가 3 → 4종**(`diving` 이 ★1 이라 **더 이르게 문다**) — 후반이 아니라 **초중반** 기구 이용이 준다 | 52a-7·52a-10(`vestShare`·`rigUseShare`) · 52b-3(`rigUsesPerDay`) | 손잡이는 **팔찌 출처 둘**(`rental_tube` · 자리 패키지)이지 `needsVest` 가 아니다 — 실지에서 조끼는 **전제**다(§3-1). 밴드가 깨지면 봇이 `rental_tube` 를 더 일찍 짓게 한다. ⚠ **`diving` 의 `needsVest` 를 빼서 고치지 말 것** — 그게 이 라운드가 닫은 BLOCKER 다 |
| **R8** | 확정 바 칩이 393px 에서 잘린다 | 50b-12ⓕ③ + 「바텀시트는 화면 밖으로 안 샌다」 | 거절 상태에서 칩을 숨기므로 셋이 동시에 긴 적이 없다. 잘리면 **천장을 키우지 말고** `modeLabel`(「배치 중」)을 접는다 |
| **R9** | 이름 8건이 그림과 어긋난 채로 굳는다 | 55-2 | P55 재생성 목록에 **이름으로** 적었다. 실지에서도 「단군」은 그림으로 정체가 안 읽히므로 **넷만** 문제다 |
| **R10 (신설)** | **`maxPerPark` 가 「예외 필드」로 번진다** — 다음 사람이 두세 종에 붙인다 | **49a-15ⓒ ②**(정확히 1종) | 늘리려면 **그 자 줄을 같이 고치게** 했다(21종 동결과 같은 수법). ⚠ 늘리는 순간 등급 4 의 `kinds` 조건과 섞여 「랜드마크가 여럿」이 된다 |
| **R11 (신설)** | **`maxPerPark` 가 개조로 샌다** — `canConvertFacility` 는 `canPlace` 를 안 지난다 | **49a-15ⓒ ③** | 데이터로 막는다(그 id 가 `rigs.json` 의 `to` 에 없다). 코드로 막으려면 `convert` 쪽에 같은 줄이 하나 더 생기고 **규칙이 두 벌**이 된다 |
| **R12 (신설)** | **P51 이 위험 줄을 미리 그린다** — `accident.ts` 가 아직 없어 **컴파일이 깨지거나** 상수가 하드코딩된다 | **51-6ⓑ**(import 0 · 「위험」 0회) | `riskNow?`/`riskNext?` 를 **optional** 로 둔 것이 그 방어다 — 없으면 안 그린다 |

**미결 (사용자·평가자에게 물을 것)**
- **M1 (해소)** 「기구 20 vs 21」 — 통합본이 **21 · `8/9/3/1` · 사건 43** 으로 닫았다.
- **M2 (유지)** 유입 역추 「0.76」은 `open` 0/20 의 끝점이고 12/20 은 **0.902** 다(50b-9 에 둘 다).
- **M3 (유지)** `rig_stepstone` **400G**(`round100(pop×90)` 유도) — 「350G」가 나오는 정수 `pop` 이 없다.
- **M4 (유지)** `goalNum` 수리는 **P48-a**. 섹션 A 가 안 받으면 P48-c.
- **M5 (유지)** `rig_roller` 의 `chain` 삭제로 계열이 **하나**가 됐다. 둘로 두려면 ★1 에 롤러 짝 한 종(정의 22).
- **M6 (유지, 카탈로그)** **견인 정원 상단 한 칸(11~12인)이 없다**(최대 `wagon` 10). 늘리려면 `courses.json` 프리셋 적합도를 같이 봐야 해 **P50 밖**. **→ 코스 축**
- **M7 (유지, 카탈로그)** 카탈로그 §4 결론의 「정원 폭 3~6」은 **`gears.json`(정원 필드 없음)** 을 읽은 값이다 — 실측은 `equipment.json` **1~10 · 중앙 4**.
  카탈로그 문서를 고칠지 조사 기록으로 남길지. **→ 사용자**
- **M8 (유지, 카탈로그)** **안전요원 반경이 「기구 이용 가능 여부를 켠다」**(§3-4)를 안 받았다 — 켜짐/꺼짐 축은 D94 하나여야 `evictFrom`(D158)이 이유를 구분한다.
  받으려면 `RigState.lit` 에 **이유 열거형**이 필요하다. **→ P52-b** (같은 이유로 §3-10 「12시대 정비 휴장」도 안 받았다)
- **M9 (유지, 카탈로그)** **자유이용권을 「몇 종 × 몇 회」로 할 것인가**(§3-13·14·15). D162·D203·D233 은 **팔찌 4등급**으로 닫았고 값 눈금(2~4배)만 실지와 맞다. **→ 사용자**
- **M10 (유지, 카탈로그)** **보팅 투어**(스릴 0 · 팀 단위 · 단가 400,000)는 기구도 코스도 아닌 **패키지**다. `packages.json` 여섯째로 넣을지, ★5 소비처로 미룰지. **→ 총론**
- **M11 (신설, 지시 2)** **랜드마크에 SNS 좋아요 계수를 줄 것인가**(카탈로그 (b)#4 의 나머지 절반).
  실측(N25) `likes = max(1, round(min(24, basePop×0.3) + favBonus + rng.int(6)))` 이고 **그 값이 지역 해금 통화**라,
  계수를 주면 `likesPerArea` 도달 속도가 움직인다 — **P50 이 안 쥔 밸런스**다. **이 판은 안 넣는다.** **→ 사용자/총론**
- **M12 (신설, 카탈로그 · B49)** **마블 크기 3단**을 `gears.json` 의 **`upgradeOf` 사슬**로 넣을 것인가(문법은 이미 있다 — 9/33).
  새 gear 두 종이면 `equipment.json` 정원·요금·`safeCurvature` + `courses.json` 적합도를 같이 유도해야 한다. **→ 코스 축**
- **M13 (신설, B47)** `mongol_tent.desc` 의 「시그니처」(기존 산문)를 **바꿀 것인가**. 50b-19ⓒ 는 지금 **이름으로 예외 허용**한다 —
  낱말을 게임 전체에서 하나로 만들려면 그 한 줄도 고쳐야 하는데 **P50 범위 밖**이다. **→ 사용자**
