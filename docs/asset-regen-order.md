# 재생성 작업 지시서 — 접지 기하

`npx tsx tools/kairo-gate.ts --geom` 실측 (2026-08-22, **추출 정렬 교정 뒤**). 위반 **56종** / 시설 75종.

⚠ **직전 판(위반 65종)과 다른 목록이다.** 그 65종 중 **9종은 그림이 아니라 놓인 자리가
틀린 것**이었다 — `tools/process-kairo-sheet.py` 의 `render_asset` 이 가로 **bbox 가운데**로
정렬했는데 계약이 요구하는 것은 **바닥 꼭짓점이 `w/(w+d)`** 다 (정사각이 아니면 둘이 다르다).
추출기가 이제 무손실 **정수 픽셀 평행이동**으로 그 자리를 맞춘다 (기하 보정이 아니다 —
전단·스케일 없음). 그래서 아래 남은 이탈은 **그림 쪽 결함**이고, 가이드+게이트
재생성으로만 고쳐진다.

## 한 명령으로 돌리기 — `tools/regen-facility.ts`

아래 「먼저 읽을 것」의 조각들을 **사람이 56번 손으로 이어 붙일 필요가 없다.**
그 이음매가 `tools/regen-facility.ts` 다.

```bash
npx tsx tools/regen-facility.ts --id cafe                # 한 종
npx tsx tools/regen-facility.ts --severe                 # 심각 17종
npx tsx tools/regen-facility.ts --all --tries 3          # 위반 56종, 종당 최대 3회
npx tsx tools/regen-facility.ts --id cafe --dry-run      # 프롬프트만 찍고 안 돌린다
npx tsx tools/regen-facility.ts --all --dry-run          # 56종 조립 검사 (요약만)
npx tsx tools/regen-facility.ts --verify-gate            # 판정 복제가 게이트와 같은지
```

종당 루프는 **프롬프트 조립 → 생성 → 후처리(1종 추출) → 게이트 판정 → 채택 또는 리롤**이고,
통과할 때까지 `--tries` 만큼 돈다.

**대상은 손으로 적지 않는다.** 위 표를 읽는 게 아니라 팩을 **그 자리에서 재서** 고른다
(`--all` = 지금 위반인 종, `--severe` = 그중 심각). 그림이 바뀌면 목록도 같이 움직인다.

### 프롬프트에 무엇이 들어가나

| 조각 | 출처 | 왜 |
|---|---|---|
| 스타일 블록 | `docs/asset-prompts.md` §SHARED STYLE BLOCK **축자** | 34장이 축자 동일한 것이 이 문서의 성질이다. 도구에 베끼면 문서를 고쳐도 도구만 옛 계약으로 남는다 |
| 항목 본문 | 그 시설이 속한 시트의 대조표 → 칸 번호 → 본문 (라벨로 교차 확인) | 표와 본문이 어긋난 시트가 생겨도 엉뚱한 항목을 안 뽑는다 |
| 규격 줄 | `guideSpecLine()` (= `make-kairo-guide.ts --table`) **+ 영어 요약** | 한국어 정본을 축자로 넣고 영어를 옆에 붙인다. 번역만 넣으면 규격이 바뀌었을 때 조용히 갈라진다 |
| 크로마 키 | 그 시트의 `Canvas:` 문단 (`#00FF00` / `#FF00FF`) | 초록 시트(S1·S2·S4·L2)는 소재에 빨강이 있어서 초록이다 |
| `--ref` 3장 | 발자국 가이드 + 그 시트가 지정한 스타일 크롭 2장 | 항목별 지정(`governs item 1 ONLY`)도 지킨다 — 무시하면 L10 의 실측 실패 모드가 돌아온다 |
| **실패 모드** | 직전 판정(첫 시도는 지금 팩의 실측) | 아래 |

### 실패 모드를 말해 준다 — 이게 리롤과 다른 점

그냥 다시 뽑으면 같은 실수가 반복된다. 도구는 **직전 시도가 무엇을 틀렸는지**를
프롬프트에 적는다. `cafe` 의 실제 출력:

```
WHAT WENT WRONG LAST TIME — do not repeat it:
  - The previous attempt had the two footprint axes SWAPPED. Its ground bottom vertex
    measured at 0.556 of the sprite width, which is where a 3x2 footprint would put it —
    this object is 2x3, so the vertex belongs at 0.400. Do not mirror the guide. The W axis
    (2 tiles) runs toward the LOWER RIGHT and the D axis (3 tiles) runs toward the LOWER
    LEFT. Follow the attached guide's diamond exactly.
  - The previous attempt's ground silhouette overlapped the contract diamond by only IoU
    0.554 (it must reach 0.839). The base is not the right shape: it must be one clean 80x40
    px diamond with the object standing on it, with nothing sticking out below or beside it.
  - The previous attempt still needed to move sideways to sit on its own tile, but it was
    already touching the edge of its canvas, so it could not be moved at all. …
```

⚠ **축뒤집힘에서 가이드를 뒤집지 않는다.** 위(19행)의 "가이드를 뒤집어 다시 뽑아야 한다"와
갈리는 지점이다. 가이드는 정본 접지 마스크에서 파생되어 **구조적으로 옳고**, 뒤집으면
틀린 발자국을 첨부하게 된다. 그리고 이 문서 §레버 표가 이미 재 놓았다 — **좌우 반전으로는
통과 0종**이다. 그래서 도구는 **옳은 가이드를 붙이고 뒤집힘을 말로 지목한다**
(위 예시의 "which is where a 3x2 footprint would put it").

### 채택 규칙 — 통과한 것을 덮어쓰지 않는다

1. 원본을 **먼저** `assets/generated/kairo-regen/<id>/backup.png` 로 백업한다
2. 후보는 **팩 밖**(작업 폴더)에서 판정한다 — 재려고 팩에 먼저 쓰지 않는다
3. 통과했거나 **엄격하게 나아졌을 때만** 채택한다. 판정 순서는
   통과 여부 → 위반 축 수 → 꼭짓점 오차 → IoU 부족 → 기울기 오차이고, **동점은 안 바꾼다**
4. 쓴 **뒤에** 다시 재서, 그래도 나아지지 않았으면 백업으로 되돌린다
5. `--strict-adopt` 를 주면 **통과만** 채택한다 (개선은 무시)

작업 폴더는 종마다 `prompt-N.txt` · `gen-N.png` · `cand-N.png` · `backup.png` 를 남긴다
(`assets/generated/` 아래라 gitignore 다).

### `image_gen` 이 없으면 첫 시도에서 죽는다

이 저장소의 codex 계정에는 권한이 없다 (실측). 그 상태로 `--all` 을 돌리면 56번 실패
로그가 쌓이므로, 도구는 그 오류 문자열을 알아보고 **즉시 전부 중단**한다 (종료 코드 2):

```
❌ 생성 불가 — 이 세션에서는 더 돌려도 전부 같은 이유로 실패한다:
   codex-gen: the built-in image_gen tool never ran in this codex session — …
   → image_gen 을 제공하는 codex 계정의 세션에서 다시 돌릴 것.
```

### 생성 없이 검증한 것 (2026-08-22)

이 머신에서는 그림을 못 뽑으므로, **생성 단계만 빼고** 파이프 전체를 태워 봤다.

| 검사 | 방법 | 결과 |
|---|---|---|
| 프롬프트 조립 | `--all --dry-run` | **56/56 조립 OK** (경고 0). 스타일 블록 축자·가이드 존재·크롭 지정 전부 통과 |
| 판정 복제 | `--verify-gate` (`kairo-gate.ts --json` 대조) | **시설 75종 불일치 0** |
| 파이프 양성 대조군 | `--all --use-existing guide` (임시 팩) | **56/56 채택(통과)** — IoU 0.997~1.000. "가이드대로 그리면 게이트를 통과한다"가 추출 경로까지 포함해 실증됐다 |
| 채택 음성 대조군 | 통과종 `office` 에 다른 발자국의 가이드를 먹임 | **유지** — 파일 md5 불변 |
| 권한 없음 | 실제 `sprite-gen gen` 1회 | 1회 시도 후 **전체 중단**, 종료 코드 2 |

⚠ **못 해 본 것은 생성 자체뿐이다** — 실제 그림이 프롬프트를 얼마나 따르는지, 몇 번
리롤해야 통과하는지는 권한 있는 세션에서만 알 수 있다.

⚠ 크로마 키는 **그림의 모서리에서 읽는다**. 가이드는 시트가 초록을 쓰든 말든 언제나
마젠타라(`make-kairo-guide.ts` 의 `BG`), 시트 크로마로 키하면 `keyed_pixels 0` 이 되어
캔버스 전체가 피사체가 된다 — 그 상태로 파라솔(면제 종)이 **게이트를 통과했다** (실측).

---

## 먼저 읽을 것

- 첨부 가이드: `art-reference/guides/kairo/facility__<id>.png` (75장, 이미 구워져 있다)
- 규격 줄: `npx tsx tools/make-kairo-guide.ts --id <id> --table`
- 프롬프트: `docs/asset-prompts.md` — 시트별 코드블록 + §레퍼런스 절의 가이드 첨부 방법
- 확인: 배치마다 `npx tsx tools/kairo-gate.ts --geom` (통과할 때까지 리롤)

⚠ **`축뒤집힘` 표시가 붙은 것은 그냥 리롤하면 안 된다** — 발자국 두 축이 바뀐 그림이라
⚠ **가이드를 뒤집지 마라** — 가이드는 엔진 정본 마스크에서 파생돼 구조적으로 옳고,
좌우 반전은 실측에서 **통과 0종**이었다(아래 레버 표). 가이드를 그대로 붙이고
**프롬프트로 "지난번엔 두 축이 바뀌었다"를 지목**한다 — `tools/regen-facility.ts` 가 그렇게 한다.

⚠ **`여백 없음`** 은 추출기가 평행이동으로 더 밀고 싶었지만 **캔버스에 빈 자리가 없어**
(그림이 좌우 끝에 닿아 있어) 못 민 것이다. 자르는 것은 무손실이 아니므로 갈 수 있는
만큼만 갔다 — 즉 **이 줄들은 위치가 아니라 그림 자체가 틀렸다**는 가장 강한 신호다.

## 우선순위 A — 심각 (꼭짓점이 가로 8텍셀 이상 이탈 = 타일 폭의 1/4)

| 시설 | id | 발자국 | 캔버스 | 이탈 | IoU | 축뒤집힘 | 평행이동 |
|---|---|---|---|---|---|---|---|
| 실내 유수풀 | `pool_lazy` | 6×3 | 144×72 | 45.5tx | 0.392 | ⚠ 예 | ⚠ 여백 없음 |
| 복층 펜션 | `pension_duplex` | 6×5 | 176×152 | 39.0tx | 0.604 | ⚠ 예 | ⚠ 여백 없음 |
| 미니 골프 | `minigolf` | 4×2 | 96×56 | 36.0tx | 0.342 | ⚠ 예 | ⚠ 여백 없음 |
| 에어바운스 파크 | `airbounce` | 6×5 | 176×112 | 32.5tx | 0.492 | ⚠ 예 | ⚠ 여백 없음 |
| 카라반 | `caravan` | 4×2 | 96×76 | 30.5tx | 0.405 | ⚠ 예 | ⚠ 여백 없음 |
| 매표소 | `ticket` | 3×2 | 80×64 | 29.0tx | 0.480 |  | ⚠ 여백 없음 |
| 수상 트램폴린 | `trampoline_w` | 3×3 | 96×64 | 29.0tx | 0.557 |  | ⚠ 여백 없음 |
| 캠핑 사이트 | `camp_site` | 3×3 | 96×68 | 28.5tx | 0.398 |  | ⚠ 여백 없음 |
| 공연 무대 | `stage_river` | 3×2 | 80×62 | 24.5tx | 0.471 | ⚠ 예 | ⚠ 여백 없음 |
| 워터슬라이드(대) | `slide_large` | 4×5 | 144×144 | 24.0tx | 0.514 | ⚠ 예 | ⚠ 여백 없음 |
| 방갈로 | `bungalow` | 3×3 | 96×80 | 20.0tx | 0.616 |  | ⚠ 여백 없음 |
| 아이스크림 | `icecream` | 1×2 | 48×44 | 18.5tx | 0.420 | ⚠ 예 | ⚠ 여백 없음 |
| 펜션 3층 | `pension` | 5×4 | 144×136 | 17.0tx | 0.627 | ⚠ 예 | ⚠ 여백 없음 |
| 점프쿠션 | `jump_cushion` | 4×3 | 112×76 | 15.0tx | 0.619 |  | ⚠ 여백 없음 |
| 카페 | `cafe` | 2×3 | 80×60 | 12.5tx | 0.554 | ⚠ 예 | ⚠ 여백 없음 |
| 수유실 | `nursing` | 2×1 | 48×44 | 11.0tx | 0.403 | ⚠ 예 | ⚠ 여백 없음 |
| DJ 부스 | `dj_booth` | 2×1 | 48×42 | 8.5tx | 0.726 |  | ⚠ 여백 없음 |

## 우선순위 B — 나머지

| 시설 | id | 발자국 | 이탈 | IoU | 축뒤집힘 | 평행이동 |
|---|---|---|---|---|---|---|
| 사우나 | `sauna` | 3×3 | 0.0tx | 0.803 |  |  |
| 정자 | `pavilion` | 3×3 | 0.0tx | 0.602 |  |  |
| 분수 | `fountain` | 2×2 | 0.0tx | 0.461 |  |  |
| 플로팅덱 | `float_deck` | 1×1 | 0.0tx | 0.833 |  |  |
| 카약 대여소 | `rent_kayak` | 2×2 | 0.0tx | 0.794 |  |  |
| 오리배 선착장 | `rent_duck` | 2×2 | 0.0tx | 0.731 |  |  |
| 눈썰매장 | `snow_sled` | 4×5 | 0.0tx | 0.635 |  |  |
| 붕어빵 | `bungeoppang` | 2×1 | 8.0tx | 0.556 |  | ⚠ 여백 없음 |
| 거북섬 | `turtle_island` | 8×6 | 7.5tx | 0.804 |  | ⚠ 여백 없음 |
| 족구장 | `footvolley` | 4×3 | 7.0tx | 0.772 |  | ⚠ 여백 없음 |
| 낚시터 | `fishing` | 4×2 | 7.0tx | 0.609 |  | ⚠ 여백 없음 |
| 글램핑 | `glamping` | 4×3 | 6.0tx | 0.755 |  | ⚠ 여백 없음 |
| 식혜·계란 코너 | `sikhye` | 2×1 | 5.5tx | 0.754 |  | ⚠ 여백 없음 |
| 파라솔 | `parasol` | 1×1 | 5.0tx | 0.508 |  | ⚠ 여백 없음 |
| 탁구대 | `pingpong` | 2×2 | 4.5tx | 0.634 |  | ⚠ 여백 없음 |
| 선베드 열 | `sunbed_row` | 4×1 | 4.0tx | 0.753 |  | ⚠ 여백 없음 |
| 온수 족욕 | `footbath` | 3×1 | 4.0tx | 0.821 |  | ⚠ 여백 없음 |
| 노래방 | `karaoke` | 2×2 | 3.5tx | 0.790 |  | ⚠ 여백 없음 |
| 다이빙대 | `diving` | 2×2 | 3.5tx | 0.713 |  | ⚠ 여백 없음 |
| 단풍 산책로 | `maple_walk` | 4×1 | 3.0tx | 0.776 |  | ⚠ 여백 없음 |
| 화단 | `flowerbed` | 1×1 | 2.5tx | 0.708 |  | ⚠ 여백 없음 |
| 선착장 | `dock` | 1×1 | 2.5tx | 0.642 |  | ⚠ 여백 없음 |
| 샤워실 연립 | `shower_row` | 4×1 | 1.5tx | 0.784 |  | ⚠ 여백 없음 |
| 평상 연립 | `pyeongsang_row` | 4×1 | 1.0tx | 0.842 |  | ⚠ 여백 없음 |
| 코인락커 열 | `locker_row` | 4×1 | 0.5tx | 0.874 |  |  |
| 세면대 열 | `washbasin_row` | 3×1 | 0.5tx | 0.776 |  |  |
| 화장실 | `toilet` | 2×2 | 0.5tx | 0.765 |  |  |
| 실내 온수풀 | `pool_warm` | 4×4 | 0.5tx | 0.802 |  |  |
| 매점 | `shop` | 2×2 | 0.5tx | 0.748 |  |  |
| 분식 | `snackbar` | 2×2 | 0.5tx | 0.748 |  |  |
| 치킨 | `chicken` | 2×2 | 0.5tx | 0.742 |  |  |
| 안내소 | `info` | 2×2 | 0.5tx | 0.798 |  |  |
| 의무실 | `infirmary` | 2×2 | 0.5tx | 0.795 |  |  |
| 몽골텐트 | `mongol_tent` | 2×2 | 0.5tx | 0.511 |  |  |
| 전망대 | `lookout` | 2×2 | 0.5tx | 0.541 |  |  |
| 워터워크볼 | `waterwalk` | 2×2 | 0.5tx | 0.891 |  |  |
| 패들보트 대여소 | `rent_pedal` | 2×2 | 0.5tx | 0.829 |  |  |
| SUP 대여소 | `rent_sup` | 2×2 | 0.5tx | 0.680 |  |  |
| 놀이터 | `playground` | 3×3 | 0.5tx | 0.821 |  |  |

## 합계

- 위반 **56종** (심각 17 · 나머지 39)
- **축뒤집힘 11종** — 가이드는 **그대로** 붙이고(정본 마스크에서 파생돼 구조적으로 옳다) 프롬프트로 **뒤집혔다고 지목**한다
- 평행이동이 캔버스에 막힌 것 **34종**
- 통과 19종은 건드리지 말 것: `arcade` `bbq_zone` `changing_row` `firepit_row` `ice_fishing` `jjimjilbang` `junglegym_w` `lifering` `massage_row` `office` `parking` `photozone` `pool_kids` `shade_net` `slide_small` `slide_tube` `storage` `vending_in` `vending_out`
- 그중 **9종은 이번 정렬 교정으로 통과했다**: `changing_row` `lifering` `massage_row` `office` `parking` `photozone` `storage` `vending_in` `vending_out`
- 지면 33장은 **33/33 통과** — 재생성 대상 아니다 (후처리가 지면에만 `diamond_mask()` 로
  기하를 강제한다. 시설의 접지 **모양**은 여전히 그림이 책임진다)

## 4방향(선택) — 창구·탑승·무대 25종

`src/data/kairo-facilities.json` 에 `"facings": 4` 를 넣으면 켜진다 (기본 2).
⚠ 그림 4장(`facility__<id>__d0..d3.png`)이 **다 있어야** 켤 것 — 하나라도 없으면
그 방향이 플레이스홀더로 떨어진다.
⚠ 그리고 **봇(`tools/kairo-sim.ts`)이 아직 방향 2개만 본다** — 첫 시설을 4로 켤 때
봇도 같이 옮겨야 헤드리스가 다른 세계를 재지 않는다 (K36 규칙).

## 왜 후처리로 더 못 고치나 — 레버 셋을 다 재 봤다 (2026-08-22)

재생성이 막힌 세션에서 **그림 없이 고칠 수 있는 길**을 셋 다 측정했다. 결론: **9종을
고쳤고 그것이 상한이다.** 다음 사람이 같은 시도를 반복하지 않도록 숫자를 남긴다.

| 레버 | 무손실인가 | 결과 |
|---|---|---|
| **좌우 반전** (축뒤집힘을 되돌린다) | ✅ 무손실 | **통과 0종.** 나아짐 4 · 나빠짐 5 |
| **정수 평행이동** (꼭짓점을 계약 자리로) | ✅ 무손실 | **통과 9종** · 나아짐 30 · 나빠짐 0 — **적용했다** |
| **접지 폭에 맞춰 확대** | ❌ 리샘플 | **51종이 비정수 배율**(1.2~1.6×) — 쓸 수 없다 |

**① 반전이 안 되는 이유**: `pool_lazy` 는 반전하면 꼭짓점 오차가 **50.5 → 2.5텍셀** 로
거의 완벽해지는데 **IoU 가 여전히 미달**이다. 그림이 **놓인 자리만 틀린 게 아니라 실루엣
자체가 다이아몬드와 다르다.** 방향을 돌린다고 모양이 생기지 않는다.

**② 평행이동의 상한이 9인 근거**: 게이트 판정을 복제해(56건 전부 일치 확인) 모든 정수 dx 를
**전수 탐색**했다. 자르기를 허용하면 2종이 더 통과하지만 하나는 끝 열이 잘려 최소자승
적합이 바뀌는 **우연**이고 하나는 파라솔 차양을 깎는다.

**③ 확대가 안 되는 이유**: 접지 폭이 계약과 맞는 것이 **24/75** 뿐이고 나머지 **51종은
비정수 배율**이 필요하다 (`vending_in` 1.600 · `photozone` 1.524 · `snow_sled` 1.297 …).
⚠ 이 저장소의 렌더 계약은 **정수 스캔라인 · AA 금지**가 기반이다 (CLAUDE.md — "AA `fill()`
은 1px 이음새와 가짜 아웃라인을 만든다"). 비정수 리샘플은 도트 경계를 뭉개므로 각도를
고치려다 **화면 밀도**를 잃는다.

→ **남은 56종은 재생성이 유일한 길이다.** 위 표가 그것을 측정으로 닫는다.
