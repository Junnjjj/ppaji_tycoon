# K37·K38 아키텍처 점검 — 규칙대로 만들어졌나

- 기준 커밋 **`c0b28d5`** (`git merge-base --is-ancestor c0b28d5 HEAD` → BASE_OK)
- 점검 범위 **`f044fee..c0b28d5`** — K37 계획 이후 전부 (K37 ①②③④⑤ + K38 5커밋)
- 점검한 날 2026-08-19 · 이 문서는 **판정**이다. 고친 것은 검사 2건뿐이고
  코디네이터가 **`463ccfa`** 로 병합했다 (단위 792 → **794**). 나머지 주입은 전부 원복했다

> ⚠ dev 서버 포트에 주의. 이 머신에서 5173·5174 는 **다른 워크트리**가 잡고 있다
> (`에셋만들기`, `k36b-bus-backdrop`). 이 저장소를 재려면
> `npx vite --port 5199 --strictPort` + `PPAJI_URL=http://localhost:5199` 로 못 박을 것.
> 안 그러면 남의 번들을 재고 "통과했다"고 적게 된다.

---

## 판정 요약

| 항목 | 판정 | 한 줄 |
|---|---|---|
| 불변식 1 — sim 은 렌더를 모른다 | ✅ | 위반 0. 규칙이 K37 파일에서 **실제로 잡는 것까지** 주입으로 확인. `LEVEL_H` 는 render 에만 |
| 불변식 2 — sim 은 결정론적이다 | ✅ | 산은 부모 스트림을 **한 번도 안 먹는다**(state 일치). 물가 지터를 바꿔도 산이 안 밀린다 |
| 불변식 3 — 시설·지면은 데이터다 | ⚠→✅ | `mountain_rock` 은 세 곳 다 있다. 그러나 **셋째 자리(색)를 대조하는 검사가 없었다** → 추가·병합(`463ccfa`) |
| 검사 커버리지 | ⚠ | 새 ★ 18개 중 **코드에 붙은 음성 대조군은 1개**. 손으로 8개 주입 → 8개 다 잡혔다. 구멍 1건 + 자기참조 1건 발견 |
| 성능 | ⚠ | 지도 바깥 굽기가 부팅 **+115ms**(폰 근사 +370ms), 텍스처 **12.95 → 31.04MB**. 폰에서 죽지는 않지만 안 보이는 배경이 게임 내용의 8배를 쓴다 |

**가장 큰 성과**: 색이 없는 지면 종류를 넣어도 `npm run verify` 가 **792/792 그대로 통과**했다.
그 지면은 화면에서 **나무 널판(다리)** 으로 그려진다. §3 참고.

---

## §1 불변식 1 — `sim/` 은 렌더러를 모른다 ✅

**정적 확인**
```
$ grep -rn "render/\|ui/\|assets/\|save/\|phaser" src/sim/ --include="*.ts"
```
→ 실제 import 0건. 걸린 5줄은 전부 주석(`terrain.ts:8,144,145` · `placement.ts:8` ·
`invariants.test.ts` 의 대조군 문자열)이다.

**규칙이 살아 있나 — 주입으로 확인 (K37 이 건드린 바로 그 파일에)**
```
$ # src/sim/kairo/terrain.ts 에 주입:
$ #   import { LEVEL_H } from '../../render/kairo/iso.js';
$ #   const jr = rng.fork(0x4237 + Math.floor(Math.random() * 2) + LEVEL_H * 0);
$ npx eslint src/sim/kairo/terrain.ts
  3:1    error  '../../render/kairo/iso.js' import is restricted …  no-restricted-imports
  303:45 error  'Math.random' is restricted from being used …      no-restricted-properties
✖ 2 problems
$ git checkout src/sim/kairo/terrain.ts && npx eslint src/sim/kairo/terrain.ts   # → 0
```
`src/sim/invariants.test.ts` 도 9/9 통과 (376ms) — 대조군을 린트에 먹여 잡히는지 본다.

**K37 이 `terrain.ts` 에 넣은 것이 sim 에 맞나**

| 넣은 것 | 자리 | 판정 |
|---|---|---|
| `levels: Uint8Array` + `levelAt/setLevel` | sim | ✅ 게임 규칙이다 (`placement` 가 경사를 거절한다) |
| `KairoTerrain.MAX_LEVEL = 3` | sim | ✅ 단 수는 게임 사정 |
| `MOUNTAIN_START/TERRACE_WIDTH/TERRACE_DEPTH/CONTOUR_RUN` | sim | ✅ 맵 모양 = 게임 사정 |
| `raiseMountains` / `dressMountains` | sim | ✅ 월드젠 |
| **`LEVEL_H = 8`** | `render/kairo/iso.ts:136` | ✅ **sim 에 없다** — 확인했다. 텍셀은 렌더 사정이고 sim 은 단 번호만 안다 |

렌더 사정이 샌 곳은 못 찾았다. 반대 방향(`iso.ts` 가 `KairoTerrain.WIDTH/HEIGHT` 를
다시 내보내는 것)은 K36 의 의도대로 render → sim 이라 맞다.

**⚠ 이름 충돌 하나** — `MAX_LEVEL` 이 sim 안에 **둘**이다:
`KairoTerrain.MAX_LEVEL = 3`(지형 단) 과 `placement.ts:176 MAX_LEVEL = 5`(시설 등급).
불변식 위반은 아니지만 `economy.test.ts` 는 등급 쪽을, `levels.test.ts` 는 지형 쪽을
같은 이름으로 읽는다. 다음에 하나를 고칠 때 다른 하나를 고쳤다고 착각하기 쉽다.

---

## §2 불변식 2 — `sim/` 은 결정론적이다 ✅

`Math.random`·`Date.now`·`performance.now`·`new Date` — sim 에 0건이고,
§1 의 주입에서 `Math.random` 이 실제로 잡히는 것을 확인했다.

**독립 스트림 — 측정** (`tmp-probe.ts`, 측정 후 삭제)

```
A. 부모 state 일치(산이 부모를 안 먹는다): true 4031627442 4031627442
B. 지터 +1 → 물가 바뀜: true · 산도 바뀜: false
C. 같은 시드 재현: true
D. 단 분포: 5806/424/356/326 · mountain_rock 칸: 408 · 절벽 칸: 558
E. 단차 2 이상 경계: 0
F. 시드 20개 재현: true · 단차 2 이상 없음: true
```

- **A**: `generate()` 를 돌린 뒤 부모 rng 의 state 가, 물가 지터 96회(가로폭)만 돌린
  새 Rng 와 **정확히 같다**. 즉 `raiseMountains` 는 부모 스트림에서 한 걸음도 안 뽑는다
  (`fork()` 가 `this.s` 를 읽기만 하고 안 밀기 때문). K36-B 의 "사고 판정이 공유 rng 를
  써서 날씨를 밀던" 유형은 **없다.**
- **B**: 물가 지터를 2→3 으로 바꾸면 물가 선은 바뀌지만 **산은 한 칸도 안 바뀐다.**
  근거: `intRange` 는 뽑는 **값**과 무관하게 항상 한 걸음이라, 뽑은 **횟수**가 같으면
  fork 시드가 같다. 산 파라미터를 바꿔도 물가는 그대로다 (산이 뒤에 돌기 때문).
  → 밸런싱에서 변수를 하나만 바꿀 수 있다.
- **E/F**: 이웃 단차가 2 이상인 경계 **0건**, 시드 20개 전부. 코드가 주장하는
  "BFS 거리로 상한 → 1-Lipschitz" 가 실제로 성립한다 (닿지 않는 테라스가 안 생긴다).

**`npm run sim:kairo -- --determinism`** → `✅ 결정론 OK — 같은 시드가 같은 결과`
(`npm run verify` 의 마지막 단계로 돌았다.)

`kairo-sim.ts:535` 도 `KairoTerrain.generate(..., rng.fork(1), map)` 로 지형에 자기
스트림을 준다 — 카드(`CARD_RNG_SALT`)·직원(`0x57aff`)·코스(`0xc0125`)와 안 섞인다.

---

## §3 불변식 3 — 지면은 데이터다 ⚠→✅ (검사 1건 추가)

`mountain_rock` 은 **세 곳 다** 있다:

| 자리 | 파일 | 줄 |
|---|---|---|
| 시뮬 데이터 | `src/data/kairo-ground.json` | 96 |
| 렌더 계약 | `src/assets/kairo-render-contract.json` | 2814 |
| 색 | `src/assets/kairo-procedural.ts` | 92 (`#8d8474`) |

코드에 남은 `mountain_rock` 문자열 둘(`terrain.ts:490` `dressMountains`,
`KairoScene.ts:705` 바깥 장식)은 **"어느 칸에 칠하나"** 는 규칙이라 데이터가 아니다 — 맞다.

### 세 곳을 대조하는 검사 — 둘은 있었고 셋째가 없었다

**① 시뮬 ↔ 렌더 계약: 있다. 주입으로 잡히는 것 확인.**
`kairo-ground.json` 에만 `test_dirt` 를 넣고 `npm run test`:
```
FAIL 지면 — 렌더/시뮬 목록이 일치한다 > 종류 목록이 같다
     → expected [ 'floor_indoor', 'lawn', …(8) ] to deeply equal [ … (9) ]
FAIL 계약 정합 > 위반이 하나도 없다
FAIL 지면 데이터 — 시뮬이 소유한다 > 종류 10종 + 다리 2종
Tests  3 failed | 789 passed
```

**② 팔레트(바닥 탭): `paintable` 로만 막힌다.**
`paintable: false` 를 빼고 넣으면 브라우저 검사가 잡는다:
```
✕ 바닥 탭은 실외 포장만 · 길 붓은 1·2·3 세 크기 (K32-B) — 13개   (12 기대)
❌ 205/206
```
`paintable: false` 를 넣으면 이 검사는 조용해진다 — 즉 팔레트는 방어되지만
**그 종류가 화면에 어떻게 그려지는지는 아무도 안 본다.**

**③ 색: 아무도 안 봤다 ← 이게 구멍이었다**

`kairo-ground.json` + `kairo-render-contract.json` 에 넣고 **숫자 검사 셋만 갱신**하면
(10→11 · 32→35 · 124→127 — 새 종류를 넣으면 어차피 해야 하는 작업이다):

```
$ npm run verify
Tests  792 passed (792)
✅ 위반 0
✅ 27/27 통과
✅ 결정론 OK
```

**완전히 통과한다.** 그런데 `groundTones()` 는 `GROUND_BASE` 에 없으면 `null` 을 주고,
`drawGround` 는 그 `null` 에서 **다리 가지**로 떨어진다 (`kairo-procedural.ts:424-433`) —
새 지면이 화면에 **나무 널판 + 난간**으로 그려진다.

브라우저 검사 206/206 도 통과했다. 유일하게 잡은 것은 `npm run seam` 인데,
이름이 원인을 안 말한다:
```
지면 33종 — 5×5 격자
  ground/test_dirt:a0  틈 0 · 겹침 2800 · 이음새 5.31배 · 경계 편향 0.822σ
✕ 이음새 위반 6건
   · ground/test_dirt:a0 — 겹침 2800px            ← 난간이 마름모 밖으로 나간 것
   · ground/test_dirt:a0 — 이음새 대비 5.31배 (경계 77.71 vs 내부 14.63)
```
"색을 안 넣었다"를 "겹침 2800px"로 알게 된다. 그리고 `npm run verify`(커밋 전 게이트)는
끝까지 초록이다.

### 추가한 검사 (이번 작업에서 유일하게 고친 것 — 커밋 `463ccfa`)

- `src/assets/kairo-procedural.ts` — `export const GROUND_TONE_KINDS`
- `src/assets/kairo-contract.test.ts` — 두 건
  - `종류마다 색이 있다 — 없으면 새 지면이 조용히 다리 널판으로 그려진다`
  - `다리는 색이 **없어야** 한다 — 다리 가지가 살아 있어야 널판이 그려진다`

**음성 대조군 (주입 → 잡힘 → 원복 확인)**
```
$ # kairo-ground.json + 렌더 계약에 색 없는 test_dirt, 숫자 검사 셋은 전부 갱신
$ npm run test
     → expected [ 'test_dirt' ] to deeply equal []
 FAIL src/assets/kairo-contract.test.ts > 종류마다 색이 있다 …
      Tests  1 failed | 793 passed (794)
```
코디네이터가 병합하며 **다른 방향으로도** 확인했다 — `mountain_rock` 의 색을
`GROUND_BASE` 에서 빼니 같은 검사가 잡았다. 즉 K37 이 실제로 넣은 종류로도 산다.

---

## §4 검사 커버리지 — 새 ★ 검사는 정말 잡나

### 음성 대조군 유무

K37·K38 이 새로 넣은 ★ 검사는 **18개**. **코드에 음성 대조군이 붙어 있는 것은 1개뿐**이다.

| ★ 검사 | 대조군 | 이번에 주입해 봤나 |
|---|---|---|
| 하늘이 어디서도 안 보인다 (K38) | ✅ `setSurroundVisibleForTest` — `끄면 11% · 켜면 0%` | 코드에 이미 있음 |
| 단 지형에 실틈이 없다 (K38) | ✖ | ✅ 주입 → 잡힘 |
| 실내 시설이 벽을 안 덮는다 (K37 ①) | ✖ | ✅ 주입 → 잡힘 |
| 앞쪽 벽 깊이 > 시설 깊이 (동률 아님) | ✖ | ✅ 주입 → 잡힘 |
| 손님 깊이가 출발 칸 기준이다 (K37 ②) | ✖ | ✅ 주입 → 잡힘 |
| 위로 걷는 손님이 출발 칸 시설에 안 파묻힌다 (K37 ②) | ✖ | ✅ 주입 → 잡힘 |
| 단 위의 것이 종류별로 다 올라간다 (K37 ⑤) | ✖ | ✅ 주입 → 잡힘 |
| 패널은 한 번에 하나만 열린다 (K37 ①) | ✖ | ✅ 주입 → 잡힘 (단위도 같이 잡힘) |
| 코스가 같은 자리에 겹치지 않는다 (K37 ④) | ✖ | ✅ 주입 → 잡힘 (단위 5건) |
| **경사에는 못 놓는다 (K37 ⑤)** | ✖ | ⚠ **자기참조** — 아래 |
| 위로 걷는 손님이 안 파묻힌다 / 실내 시설이 벽 안에 있다 | ✖ (전제 기록용) | 주입 안 함 |
| 절벽면이 구워져 있다 (K37 ⑤) | ✖ | 주입 안 함 |
| 카드는 언제나 고를 선택지가 있다 / 코스 3건 (K37 ③) | ✖ | 단위로 잡힘 확인 |

### 주입 결과 — 명령과 출력

기준 `PPAJI_URL=http://localhost:5199 npm run verify:kairo` → **206/206 · 이음새 위반 0**
(한 번에 54초).

**주입 1** `Z_WALL_FRONT 3 → 2` (K37 ① 되돌리기) + `+J 치마 yTop 에 +1` (K38 실틈 되돌리기)
```
✕ ★ 실내 시설이 벽을 안 덮는다 — 앞쪽 벽이 시설보다 앞 (K37 버그 ①)
    — 벽이 이긴 픽셀 42 · 시설이 이긴 픽셀 3 (0 이어야 한다)
✕ ★ 앞쪽 벽 깊이 > 시설 깊이 (동률 아님) — 벽 233518 vs 시설 233518
✕ ★ 단 지형에 실틈이 없다 — 윗면과 절벽이 붙어 있다 (K38)
    — 구멍 126곳 — __col/ground/path_stone:a2/3/1/1 x=2 y=10 · …
❌ 203/206
```

**주입 2** `liftAt() → 0` (K37 ⑤ 되돌리기) + `spanDepthKey → 도착 칸만` (K37 ② 되돌리기)
```
✕ ★ 손님 깊이가 출발 칸 기준이다 (두 칸 중 가까운 쪽)
    — 손님 192553 = 출발 칸 196645 + 손님 띠 4
✕ ★ 위로 걷는 손님이 출발 칸 시설에 안 파묻힌다 (K37 버그 ②)
    — 보이는 손님 픽셀 29/193 (15%) · 손님 192553 vs 시설 196647
✕ ★ 단 위의 것이 종류별로 다 올라간다 (K37 ⑤)
    — 지면 24px(기대 0) · 시설 24px(기대 0) · 배치 ok
❌ 203/206
```

**주입 3** `levelUniform → 항상 true` + `PanelHost 배타 해제`
```
✕ ★ 패널은 한 번에 하나만 열린다 (K37 버그 ①)
    — 실패: 건설→도감, 도감→경영, 경영→코스, 코스→건설
✕ ★ 경사에는 못 놓는다 — 처방이 평지를 말한다 (K37 ⑤) — 단이 섞인 자리를 못 찾았다
❌ 204/206
$ npm run test    # 같은 주입
 FAIL src/ui/panels.test.ts > ★ 두 번째를 열면 첫 번째가 닫힌다
 FAIL src/ui/panels.test.ts > 등록을 잊은 패널은 배타로 취급된다
      Tests  2 failed | 790 passed (792)     ← levelUniform 쪽은 단위 0건
```

**주입 4 (단위만)** `placement.ts:304` 의 `levelAt !== z0` 거절 제거
```
 FAIL src/sim/kairo/levels.test.ts > ★ 한 칸만 단이 달라도 level-mixed
      Tests  1 failed | 791 passed (792)
```

**주입 5 (단위만)** `dockTaken() → false` (K37 ④)
```
 FAIL course.test.ts > ★ 같은 잔교에는 두 번째를 못 놓는다 — 처방까지 말한다
 FAIL course.test.ts > 판정 순서 — 자기 자신의 문제가 먼저다
 FAIL course.test.ts > 같은 잔교면 `overlap` 을 겹쳐 말하지 않는다
 FAIL course.test.ts > ★ 잔교 2개 중 하나가 차면 다음을 제안한다
 FAIL course.test.ts > 전부 차면 현재 잔교를 쓰되 옆으로 밀어 제안한다
      Tests  5 failed | 787 passed (792)
```

주입은 전부 **원복했고** `git diff` 로 확인했다 (§ 마지막 검증 참고).

### 발견 ①  `levelUniform` 은 production 이 안 쓴다 — 검사가 자기를 검사한다

```
$ grep -rn "levelUniform" src/ tools/
src/sim/kairo/terrain.ts:289     (주석)
src/sim/kairo/terrain.ts:616     (정의)
src/sim/kairo/levels.test.ts:132 (자리 세기)
tools/verify-kairo.ts:4657       (산 중턱 평지 찾기)
tools/verify-kairo.ts:4737       (경사 자리 찾기)
```

실제 경사 거절은 `placement.ts:304` 의 `terrain.levelAt(ti, tj) !== z0` 다.
`levelUniform` 을 항상 `true` 로 망가뜨려도 **배치 규칙은 멀쩡했다** (주입 3 에서 단위 0건).

그래서 브라우저 검사 `★ 경사에는 못 놓는다` 는 **재는 대상(`placement.check`)과 다른
함수(`levelUniform`)로 시험 자리를 고른다.** 지금 방향(`항상 true`)에서는 자리를 못 찾아
fail 로 떨어져 조용하진 않지만, **반대로 망가지면(`항상 false`) 아무 칸이나 "섞였다"고
골라 `placement` 가 우연히 `level-mixed` 를 뱉어 통과한다.**

### 발견 ②  §3 의 색 구멍 — `npm run verify` 가 792/792 로 통과했다

이번 점검의 가장 큰 성과. 위 §3 참고. 검사를 추가했다.

### 발견 ③  ★ 18개 중 17개에 대조군이 없다

이 저장소는 "조용히 통과하는 검사"에 열 번 물렸고 `seam --selftest` 는 대조군 6건을
매번 돌린다. 새 검사에는 그 습관이 안 붙었다 — `setSurroundVisibleForTest` 하나뿐이다.
이번에 8개를 손으로 주입해 잡히는 것을 봤지만, **손으로 한 것은 다음 사람에게 안 남는다.**

---

## §5 성능 — 폰이 1순위다

측정 방법: 실제 Chrome(`channel: 'chrome'`) · iPhone 393×852 @3x 에뮬 ·
`Emulation.setCPUThrottlingRate` 로 폰 근사 · `bakeSurroundTexture` 에 `performance.now`
임시 계측(렌더 쪽이라 허용) 후 **원복**.

### `bakeSurroundTexture` 실측

```
[MEASURE] surround 2944x1600 cells=19354 under=19354 col=19354 ms=145.5
[MEASURE] surround 2944x1600 cells=19354 under=19354 col=19354 ms=145.7
[MEASURE] surround 2944x1600 cells=19354 under=19354 col=19354 ms=143.2
```

| 항목 | 값 | 근거 |
|---|---|---|
| 캔버스 | **2944 × 1600** | `(96+72)·16 + 128·2` × `(96+72)·8 + 128·2` |
| 칸 | 19,354 | bbox 로 자른 뒤 |
| `drawImage` | **38,708회** | 밑칠 19,354 + 기둥 19,354 (두 번 훑는다) |
| 굽는 시간 | 145ms (1×) · **363ms (4×)** · **603ms (6×)** | CPU throttle |

### 부팅 시간

`page.goto` → `#kairo-debug` 에 FPS 가 뜰 때까지:

| | 바깥 지형 켬 | 끔 (`?nosurround=1` 임시 주입) | 차이 |
|---|---|---|---|
| throttle 1× | 772 / 768 / 779 ms | **657 ms** | **+115ms (+17%)** |
| throttle 4× | 1,647 ms | 1,277 ms | **+370ms (+29%)** |

폰 실기기는 4~6× 근사가 현실적이니 **부팅이 1.6~2.5초**, 그중 바깥 굽기가 0.4~0.6초다.
한 번뿐이고 매 프레임 비용은 0 이다 (`scrollFactor 1` 짜리 이미지 한 장).

### 텍스처 메모리

| | 켬 | 끔 | 차이 |
|---|---|---|---|
| 총 텍스처 | **31.04 MB** | **12.95 MB** | **+18.09MB (2.4배)** |
| `surround/ground` | 17.97 MB (2944×1600) | — | 총량의 **58%** |

200KB 넘는 텍스처 전부:
```
surround/ground        2944x1600  18400KB
<tileSprite fill> ×3   4096x200    3200KB each  = 9.6MB   ← 배경 3겹 (안전망)
backdrop/mountain       512x200     400KB
backdrop/ridge          512x200     400KB
backdrop/farbank        512x200     400KB
guest                   560x197     431KB
```

- `MAX_TEXTURE_SIZE` = 16384 (측정 기기). 구형 iOS 상한 4096 기준으로도 2944 는 **안전**.
  ⚠ 다만 여유가 없다 — 격자를 128×96 으로 넓히면 `(128+96)·16+256 = 3840`,
  그 다음 단계에서 4096 을 넘어 **폰에서만** 굽기가 실패한다 (안전망으로 떨어진다).
- **안 보이는 배경이 27.6MB** 다: `surround` 17.97 + 배경 tileSprite 9.6.
  실제 게임 내용(시설 73 + 손님 + 지면 + 벽)은 다 합쳐 **3.4MB** 다.
- 31MB 는 요즘 폰에서 죽을 수치는 아니다 (WebGL 텍스처 예산은 보통 수백 MB).
  **위험한 수준은 아니지만 비율이 8:1 로 뒤집혀 있다.**

---

## 고쳐야 할 것 (우선순위)

1. ~~**지면 색 대조 검사가 없다**~~ — ✅ 이번에 추가했다 (§3). 주입 → `expected ['test_dirt']
   to deeply equal []` 로 잡히는 것까지 확인.

2. **새 ★ 검사에 음성 대조군을 붙일 것** (§4 발견 ③).
   `seam --selftest` 처럼 `verify-kairo` 에도 "주입 → 잡히는지" 절을 두는 것이 맞다.
   이번에 주입해 본 8건은 전부 잡혔으니, **그 주입을 코드로 남기면** 된다.
   가장 값싼 셋: `Z_WALL_FRONT` 동률 · `+J 치마 +1` · `liftAt 0`.

3. **`★ 경사에는 못 놓는다` 가 자기참조다** (§4 발견 ①).
   시험 자리를 `levelUniform` 이 아니라 `placement.check` 와 같은 기준으로 찾을 것.
   덤으로 `levelUniform` 은 production 이 안 쓴다 — 하네스 전용이면 그렇게 이름 붙이거나,
   `placement.ts:304` 가 이걸 쓰도록 합칠 것 (지금은 같은 규칙이 두 벌이다).

4. **배경 3겹 tileSprite 9.6MB 를 굽기 성공 시 해제할 것** (§5).
   K38 이 "평소엔 한 픽셀도 안 보인다"고 적어 뒀는데, 텍스처는 그대로 살아 있다.
   `bakeSurroundTexture` 가 성공하면 `buildBackdrop` 을 건너뛰면 **총 31 → 21MB** 다.

5. **`surround` 굽기를 줄일 여지** (§5). 지금은 격자 **안쪽까지** 통째로 굽는다
   (타일 사이 실틈 뒤를 땅색으로 만들려고). 그런데 컬럼 텍스처 실틈은 K38 이 기하로 고쳤다
   (126곳 → 0). 안쪽 밑칠이 아직도 필요한지 **재보고**, 필요 없으면 칸 19,354 → 바깥 링만
   남아 굽기가 절반 이하로 준다. 필요하다면 그 근거를 주석에 남길 것 (지금은 "실측:
   파란 점선"이라고만 적혀 있어 어느 실틈인지 구분이 안 된다).

6. **`MAX_LEVEL` 이 sim 안에 둘이다** (§1). `KairoTerrain.MAX_LEVEL`(지형 단 3) vs
   `placement.MAX_LEVEL`(시설 등급 5). 하나를 `TERRAIN_MAX_LEVEL` 로 바꿀 것.

7. **`surround` 는 구운 뒤 갱신하지 않는다** — 플레이어가 가장자리 칸을 칠하면 바깥 띠는
   옛 종류로 남는다. 코드 주석이 이미 인정하고 있고 지금은 장식이라 안 보인다.
   토지 해금이 맵 가장자리까지 가면 보이기 시작한다 — 그때 다시 볼 것.

---

## 이 점검이 남긴 것

- 코드 변경 **2파일** — `kairo-procedural.ts`(export 1줄 + 주석) ·
  `kairo-contract.test.ts`(검사 2건). 커밋 `463ccfa` 로 병합됐고 단위가 792 → **794** 가 됐다.
  그 외 주입 13건은 전부 원복했다 (`git status` 로 확인).
- 주입 실험 **13건** (렌더 6 · sim 4 · 데이터 3) — 12건은 잡혔고 1건(색)이 안 잡혀서
  검사를 만들었다.
