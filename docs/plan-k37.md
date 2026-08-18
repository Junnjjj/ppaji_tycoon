# K37 — 버그 4건 + 높이 표현

기준 커밋 **`afc6f22`** (K36-B②③ 통합). 워커는 이 커밋에서 갈라진다 —
낡은 `main`(deaf5e5) 기반으로 시작하면 K25~K36 전체가 없다.

---

## 진단 (전부 실측했다 — 추측 아님)

### ① 패널이 서로를 안 닫는다

패널 8종(`kairo-hud` 시트 · staff · catalog · report · showcase · card · course · newgame)이
**각자** `this.root.hidden = false` 를 한다. **"한 번에 하나"를 아는 곳이 없다.**
건설 시트를 열어 둔 채 도감을 열면 둘이 겹친 채로 남는다.

`kairo-hud` 안에서 건설↔메뉴는 `toggle()` 이 서로를 닫는다 — **시트 안에서만** 규칙이 있고,
시트 밖으로 나가면 없다. 그래서 "건설 눌러서 나온 설명이 다른 설명 눌렀을 때 안 꺼진다".

### ② 실내 시설이 벽 밖으로 보인다

깊이가 **동률**이다:

| 것 | 깊이 |
|---|---|
| 지면 | `depthKey(i,j)` |
| 뒤쪽 벽 (−I·−J) | `depthKey(i,j) + 1` |
| 시설 | `depthKey(i+w−1, j+d−1) + 2` |
| **앞쪽 벽 (+I·+J)** | **`depthKey(i,j) + 2`** ← 시설과 같다 |
| 손님 | `depthKey(i,j) + 3` |

1×1 시설이 (i,j) 에 있으면 시설도 `depthKey(i,j)+2`, 그 칸의 앞쪽 벽도 `depthKey(i,j)+2`.
Phaser 는 동률이면 삽입 순서로 그리는데 벽은 부팅 때 먼저 만들어지므로 **시설이 항상 이긴다.**
그래서 시설이 벽 선을 덮고, 건물 밖으로 삐져나온 것처럼 보인다 (사용자 스크린샷 그대로).

### ③ 손님이 위로 갈 때 이전 도로 아래로 들어간다

`placeGuest` 가 **위치는 보간**하고(`fromI + (i−fromI)·t`) **깊이는 목적지 타일**로 준다
(`depthKey(g.i, g.j) + 3`). 목적지가 위쪽(= `i+j` 가 작은 = 먼 칸)이면 이동이 시작되는
순간 깊이가 먼 칸 값으로 **뚝 떨어지고**, 그림은 아직 출발 칸 위에 있다 →
출발 칸의 지면이 손님을 덮는다. 아래로 갈 때는 반대라서 안 보인다 — 사용자가 본 그대로다.

### ④ 코스가 전부 같은 자리에 겹쳐 놓인다

실측: 현금을 채우고 `banana` · `peanut` · `jetski` 를 연달아 확정했더니 —

```
placed: peanut  dock 43,32  handles 43,38 43,46   ← 시작 킷
        banana  dock 43,32  handles 43,37 43,43
        peanut  dock 43,32  handles 43,37 43,43
        jetski  dock 43,32  handles 43,37 43,43   ← 셋이 완전히 같다
```

두 가지가 없다:

1. **겹침 검사가 없다.** `validateCourse` 는 물·선착장 거리·여유만 본다. "이미 코스가
   있는 물"은 안 본다. 그래서 같은 좌표에 무한히 쌓인다
2. **기본 핸들이 항상 같다.** `resetHandles()` 는 `defaultHandles(preset, dock, dir, 8)` —
   기존 코스를 모른다. 이미 놓인 잔교를 다시 고르고, 이미 쓰는 물을 다시 제안한다

그래서 "모든 견인 기구 위치 설정"이 하나로 붙어 있는 것처럼 보인다. 19종을 골라도
위치가 안 변하고, 확정하면 앞의 것 위에 겹친다.

⚠ 사용자가 "버그같아"라고 한 것이 정확했다. 재현하기 전에는 "설계상 그렇다"로 넘길
뻔했다 — 프리셋·기구를 바꿔도 좌표가 같은 것은 **의도**지만, 겹쳐 놓이는 것은 아니다.

---

## 설계

### ① 패널은 한 번에 하나 — 주인을 만든다

`src/ui/panels.ts` 신규. `PanelHost` 가 열린 패널 하나를 안다.

```ts
interface Panel { readonly root: HTMLElement; hide(): void }
class PanelHost {
  register(p: Panel): void
  open(p: Panel): void   // 다른 것을 먼저 닫는다
  closeAll(): void
  get openPanel(): Panel | null
}
```

각 패널은 `show()` 안에서 `host.open(this)` 를 부른다. **`hidden` 을 직접 만지는 곳은
`PanelHost` 와 각 패널의 `hide()` 뿐이다.**

⚠ **`.kover.frame`(감상 띠)은 예외다** — 지도를 보여 주는 것이 목적이라 화면을 안 덮는다.
`exclusive: false` 로 등록해 남긴다. 예외를 안 두면 감상 화면이 자기 자신을 닫는다.

⚠ 카드(`.kover.dialog`)는 **주간 진행을 막는 것**이 목적이라 다른 패널이 이걸 닫으면
안 된다 — `modal: true` 로 두고, 모달이 열려 있으면 `open()` 이 거절한다.

**검사**: `tools/check-ui-surface.mjs` 에 정적 검사 — `src/ui/**` 에서 `hidden = false` 를
쓰는 곳은 `panels.ts` 뿐이다 (대조군: 다른 파일에 넣으면 잡힌다). 브라우저 검사 —
패널 A 를 열고 B 를 열면 A 가 닫힌다 (7쌍), 감상 띠는 예외.

### ② 깊이를 **띠**로 정리한다

칸 하나 안의 하위 깊이를 상수로 이름 붙인다 (`src/render/kairo/iso.ts`):

```ts
export const Z_GROUND     = 0;  // 지면
export const Z_WALL_BACK  = 1;  // 뒤쪽 벽 (−I·−J)
export const Z_FACILITY   = 2;  // 시설
export const Z_WALL_FRONT = 3;  // 앞쪽 벽 (+I·+J)  ← 시설보다 앞
export const Z_GUEST      = 4;  // 손님 몸
export const Z_FACE       = 5;
export const Z_EMOTE      = 6;
export const Z_GHOST      = 7;  // 배치 고스트는 늘 맨 앞
```

앞쪽 벽이 시설보다 앞에 온다. 유리 벽이라 **시설은 그대로 보이고**, 벽 선이 끊기지
않아서 "안에 있다"가 읽힌다.

⚠ **"벽은 손님보다 낮다"는 유지된다** (K29 계약). 손님이 4, 앞쪽 벽이 3 이다.
이 순서를 뒤집으면 유리를 유리로 만든 이유가 사라진다.

### ③ 손님 깊이는 **두 칸 중 가까운 쪽**

```ts
const dk = Math.max(depthKey(g.fromI, g.fromJ), depthKey(g.i, g.j));
```

손님은 인접한 두 칸에 걸쳐 있다. 두 칸 중 **가까운 쪽** 깊이를 쓰면 어느 쪽 지면에도
안 파묻힌다. 분수 깊이(`(fi+fj)*4096+fi`)로 가면 떠나는 칸의 지면이 손님을 덮는 지금
문제가 절반만 고쳐진다 — 그래서 `max` 다.

압축 연출(`drawPlaybackFrame`)도 같은 규칙이어야 한다. 기록에 `fromI/fromJ` 가 없으면
프레임에 넣는다 (재생만 쓰는 값이라 스냅샷에는 안 넣는다).

### ④ 코스는 겹치지 않는다

**sim**: `validateCourse` 에 인자 `others: readonly PlacedCourse[]` 를 더하고 판정 둘:

- `dock-taken` — 이미 그 잔교에서 시작하는 코스가 있다
- `overlap` — 샘플 점이 기존 코스의 샘플 점과 `COURSE_CLEAR_TILES`(= 3) 안에서 겹친다

`COURSE_ISSUE_TEXT` 에 처방까지 적는다 (`다른 잔교를 고르세요` / `핸들을 옮겨 떨어뜨리세요`).

**UI**: `resetHandles()` 가 **빈 잔교를 먼저 고른다** — `docks()` 중 코스가 없는 첫 번째.
전부 찼으면 현재 잔교를 쓰되 기본 핸들을 옆으로 밀어 제안한다 (`side` 오프셋을
기존 코스 수만큼). 확정 버튼은 판정이 막으면 비활성 + 이유 표시.

⚠ **기존 세이브에 이미 겹친 코스가 있다.** 마이그레이션으로 지우지 말 것 — 플레이어가
산 것이다. 새로 놓는 것만 막는다.

### ⑤ 높이 표현 (사용자 요청)

**땅을 깎을 수 없다는 규칙은 그대로다** — 높이는 맵이 갖고 태어난다.

**데이터**: `KairoTerrain` 에 `levels: Uint8Array` (0~3). 지형 종류와 **나란한 배열**이다.

```ts
levelAt(i, j): number
isCliff(i, j): boolean        // 이웃과 단이 다르다
levelUniform(i, j, w, d): boolean
```

⚠ **물은 영구히 0** 이다 (사용자: "물쪽은 굳이 높낮이 할필요없어"). `paint` 가 물을
칠하면 단을 0 으로 내린다 — 두 곳에 저장하면 반드시 어긋난다.

**렌더**: 한 단 = **8텍셀** (타일 높이 16 의 절반). 칸 위의 모든 것이 `level*8` 만큼
올라간다 — 지면·벽·시설·손님·고스트·버스 전부. 헬퍼 하나로 모은다:

```ts
export const LEVEL_H = 8;
export function lift(level: number): number { return -level * LEVEL_H; }
```

높은 칸은 **절벽 치마**를 아래로 그린다 (보이는 두 면 = +I·+J 쪽). 지면 텍스처를 굽는
`terrain-texture.ts` 가 그 칸의 낮은 이웃까지 내려가는 기둥을 같이 굽는다.

⚠ **깊이 정렬은 안 바꾼다.** 칸을 "밑면에 앵커된 기둥"으로 그리면 `(i+j, i)` 순서가
그대로 맞다 — 가까운 칸의 기둥이 항상 나중에 그려진다. `depthKey` 를 건드리는 순간
K1~K36 의 정렬이 전부 재검증 대상이 된다. ②의 띠만으로 충분하다.

**규칙**:
- 시설·건물은 **단이 균일한 발자국**에만 놓인다 (`level-mixed` 거절) — 이것이 "산 중턱
  평지"가 게임이 되는 지점이다
- 손님은 **단차 1까지** 오르내린다 (`|Δlevel| ≤ 1`). 2 이상은 절벽이라 못 지나간다
- 길·도로는 단차 1을 잇는다 (경사 스프라이트는 에셋 단계 — 지금은 계단처럼 올라간다)
- 물가(`water_edge`)와 물은 단 0

**월드젠**: 입구(`ENTRY_I`) **좌우 바깥쪽**에 산을 올린다. 단 1·2·3 의 계단식이고
각 단에 **평지 테라스**를 남긴다 (건물·펜션 자리). 공원 가운데(입구~물)는 단 0 그대로 —
초반 플레이가 바뀌면 안 된다. 시드에서 결정론적으로 뽑는다.

**세이브 v6**: `levels` 추가. 없으면 **전부 0** 이라 옛 판은 평지로 열린다 (하위호환).

---

## 파일

| 파트 | 파일 |
|---|---|
| ① 패널 | `src/ui/panels.ts`(신규) · `kairo-{hud,staff,catalog,report,showcase,card,course,newgame}.ts` · `main.ts` · `tools/check-ui-surface.mjs` · `tools/verify-kairo.ts` |
| ② ③ 깊이 | `src/render/kairo/iso.ts` · `src/render/scenes/KairoScene.ts` · `src/sim/kairo/week.ts`(재생 프레임에 `fromI/fromJ`) · `tools/verify-kairo.ts` |
| ④ 코스 | `src/sim/kairo/course.ts` · `course.test.ts` · `src/ui/kairo-course.ts` · `tools/verify-kairo.ts` |
| ⑤ 높이 sim | `src/sim/kairo/terrain.ts` · `worldgen`(카이로) · `placement.ts` · `guests.ts`(단차) · `src/save/kairo.ts` v6 · 테스트 |
| ⑤ 높이 렌더 | `src/render/kairo/iso.ts` · `terrain-texture.ts` · `KairoScene.ts` · `tools/verify-kairo.ts` |

---

## 병렬 계획 (Orca)

파일이 갈라지는 넷을 동시에 돌린다. **②와 ⑤렌더는 같은 파일을 만지므로 나눈다.**

**1차 (병렬 4)**
- **W1 패널 상호 배타** — `src/ui/**`
- **W2 깊이 띠 + 손님 보간 깊이** — `src/render/**` + `week.ts` 재생 프레임
- **W3 코스 겹침** — `src/sim/kairo/course.ts` + `src/ui/kairo-course.ts`
- **W4 높이 sim** — `terrain.ts` · worldgen · `placement.ts` · `save/kairo.ts` v6

**2차 (1차 병합 후)**
- **W5 높이 렌더** — ②의 깊이 띠 위에 절벽·리프트를 얹는다. 순서를 바꾸면 무엇이
  깨졌는지 못 가린다

`src/ui/kairo-course.ts` 는 W1(패널 등록)과 W3(핸들 제안)이 둘 다 만진다 —
**W1 은 `show()` 한 줄만** 바꾸게 지시하고, 충돌은 코디네이터가 푼다.

---

## 검증

### 단위 (신규 예정 ~28)
1. **★ 앞쪽 벽이 시설보다 앞이다** — 띠 상수 순서. 음성 대조군: 뒤집으면 실패
2. **★ 손님 깊이는 두 칸 중 큰 쪽** — 위로 갈 때 출발 칸보다 앞. 음성 대조군: 목적지
   깊이를 쓰면 출발 칸 지면에 파묻힌다
3. **★ 코스 겹침 거절** — 같은 잔교 `dock-taken` · 가까운 물 `overlap`.
   음성 대조군: 3칸 넘게 떨어지면 통과
4. **기본 핸들이 빈 잔교를 고른다** — 잔교 2개 중 하나가 차면 다음을 제안
5. **물은 단 0** — 물을 칠하면 단이 내려간다. 음성 대조군: 강제로 올려도 0
6. **단이 섞인 발자국 거절** (`level-mixed`)
7. **손님은 단차 2를 못 넘는다** · 단차 1 은 넘는다
8. **세이브 v6** — `levels` 보존 · v5 세이브는 평지로 열린다
9. **월드젠 결정론** — 같은 시드 같은 높이맵 · 공원 가운데는 단 0 · 테라스가 존재한다

### 브라우저 (신규 예정 ~12)
10. **★ 패널 상호 배타 7쌍** — A 열고 B 열면 A 가 닫힌다
11. **감상 띠는 예외** — 지도가 보인다
12. **카드가 열려 있으면 다른 패널이 안 열린다**
13. **★ 시설이 벽 안에 있다** — 실내 시설을 놓고 벽 선 픽셀이 끊기지 않는다.
    음성 대조군: 띠를 뒤집으면 끊긴다
14. **★ 손님이 위로 걸어도 안 파묻힌다** — 이동 중 프레임에서 손님 픽셀이 보인다
15. **높이 — 산이 보이고, 테라스에 건물이 놓이고, 절벽에는 안 놓인다**

### 회귀
```bash
npm run verify         # 739 + 신규
npm run verify:kairo   # 184 + 신규
npm run sim:kairo -- --seeds 12 --weeks 26   # 경보 0 유지
npm run sim:kairo -- --seeds 12 --weeks 52
```

⚠ **높이는 밸런스를 움직인다** (지을 자리가 늘고, 단차가 동선을 늘린다). 움직인 만큼을
커밋에 적는다. 골든이 안 움직이면 높이가 실제로 안 걸린 것이다.

⚠ **봇에도 단 규칙을 넣는다** — 안 넣으면 헤드리스가 절벽에 짓고 실제 판과 갈라진다
(K36 에서 격자로 같은 사고를 겪었다).

---

## 하지 않을 것

- **플레이어가 지형을 깎는 것** — 설계 불변식이다 (design.md). 높이는 주어진 것을 활용
- **경사 스프라이트** — 도로가 각도를 따라 기울어지는 그림은 에셋 단계(Phase G).
  지금은 계단식으로 올라간다 (사용자: "나중에 에셋만들때")
- **물의 높이** — 사용자가 명시적으로 뺐다
- **단 4 이상** — 3단이면 산 중턱 세 층이다. 더 올리면 절벽이 화면을 먹는다
- **오디오** — 사용자가 마지막으로 미뤄 둔 것
