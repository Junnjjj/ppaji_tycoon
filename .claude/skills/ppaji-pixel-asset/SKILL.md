---
name: ppaji-pixel-asset
description: "빠지 타이쿤 AI 픽셀아트 에셋 생성. src/assets/manifest.json 의 source:'ai' 스프라이트(시설·장비·나무·지형 데코)를 레퍼런스(art-reference/ref-1,2.png)의 질감·색감 그대로 뽑는다. sprite-gen(~/tools/sprite-gen) 파이프라인으로 생성→크로마 제거→픽셀 언페이크→아틀라스까지. 트리거: 에셋 만들어줘, 스프라이트 뽑아줘, 시설/나무/보트 이미지, 픽셀아트 생성, asset gen, ppaji sprite."
---

# 빠지 타이쿤 픽셀 에셋 생성

**목표는 하나다: `art-reference/ref-1.png`·`ref-2.png` 의 질감·색감을 모든 에셋에서 유지한다.**
개별 에셋이 예쁜 것보다 전체가 한 화면에서 한 게임으로 보이는 것이 우선이다.

검증 완료 (2026-08-14): `prop/tree` 3변형을 이 파이프라인 전체(베이스 생성 → prepare →
행 생성 → 픽셀 언페이크 추출 → 아틀라스)로 뽑아 22px 로지컬에서 게임 레디 품질 확인.
실물: `assets/generated/sprites/prop-tree/`.

## 스타일 계약 (SSoT)

- **스타일의 SSoT 는 텍스트가 아니라 첨부 레퍼런스 이미지다** (sprite-gen 원칙).
  프롬프트로 스타일을 재기술하지 말고, 반드시 `art-reference/crops/` 크롭을 `--ref` 로 첨부한다.
- 레퍼런스 특성 (프롬프트에 쓸 때는 이 요약만): 채도 높은 웜 서머 팔레트, 다크 웜 아웃라인,
  이단 명암(하이라이트 웜 라임/베이스 딥 그린 식), 좌상단 광원, 청키 픽셀 블록,
  카이로소프트풍 3/4 상단뷰(단 vehicle 은 순수 상단뷰 — 게임에서 회전시키므로).
- `art-reference/palette.json` — 레퍼런스에서 median-cut 추출한 32색 + 점유율.
  생성 후 소재색이 이 계열에서 벗어나면(물빛 H≈206-217, 초목 H≈55-108, 우드/크림 H≈29-48) 리롤.

### 카테고리 → 첨부 크롭 매핑

| 대상 | 첨부할 크롭 (`art-reference/crops/`) |
|---|---|
| prop/tree, 초목·지형 데코 | `foliage-hills.png` + `shore-trees-houses.png` |
| facility 건물 (gate/shop/restroom/…) | `building-dock.png` + `dock-huts.png` |
| 수상 놀이시설 (slide/trampoline/pool) | `waterpark-inflatables.png` |
| vehicle (banana/jetski/…) | `boats-water.png` + `waterpark-inflatables.png` |

## 도구

sprite-gen 은 `~/tools/sprite-gen` 에 설치돼 있다 (venv = python3.11, `pip install -e .` 완료).
**전역 `python3` 금지 — 항상 venv 절대경로** (sprite-gen SKILL.md BLOCKING 게이트):

```bash
export SPRITE_GEN_ROOT=~/tools/sprite-gen
$SPRITE_GEN_ROOT/.venv/bin/sprite-gen <tool> ...
$SPRITE_GEN_ROOT/.venv/bin/python $SPRITE_GEN_ROOT/scripts/<script>.py ...
```

- provider 는 **codex** (ChatGPT OAuth 로그인 확인됨). grok 은 이 머신에 없다.
- 상세 계약은 `~/tools/sprite-gen/SKILL.md` 와 `docs/` 가 SSoT — 이 스킬은 빠지 타이쿤 전용 절차만 소유한다.
- 배치 생성은 **최대 4 병렬** (sprite-gen 확정 규칙).

## 작업 지시서 = `src/assets/manifest.json`

`source: "ai"` 항목만 대상이다 (`procedural` 은 영구히 코드가 그린다 — 건드리지 말 것).
각 항목의 `id`·`size`(로지컬 px)·`anchor`·`variants`·`prompt`(소재 서술) 를 그대로 쓴다.

## 시설(3D 빌보드행) 바닥 발자국 계약 — 2026-08-17 재규격 (yaw20)

3D 프로토(prototype-3d)에 들어가는 시설 스프라이트는 **바닥이 발자국의 화면
투영과 일치**해야 한다. 안 지키면 인접 배치에서 이웃을 비정상적으로 덮는다.

⚠ **카메라가 yaw45 → yaw20 으로 바뀌었다. 옛 `(fw+fh)×11.3` 공식은 폐기다** —
그건 yaw45 대칭일 때만 맞고, 얕은 아이소에선 2×3 ≠ 3×2 다. 현행 규격:

```
폭_텍셀   = (fw·cos20° + fh·sin20°) × 16
높이_텍셀 = (fw·sin35.26°·sin20° + fh·sin35.26°·cos20°) × 16
2×1 35.5×15.0 · 2×2 41.0×23.7 · 3×2 56.0×26.8
2×3 46.5×32.4 · 3×3 61.5×35.5 · 4×3 76.6×38.7
```

- 폭 한계 = 위 폭 — `prototype-3d/tools/skillcheck.mjs` 가 index.json 으로 검사 (초과 = FAIL)
- **바닥이 그림 전체 높이에서 차지하는 비율을 고정**해야 종끼리 크기가 맞는다.
  안 고정하면 로지컬 높이로 fit 했을 때 폭이 종마다 다르게 떨어진다.
  건물 40% · 낮은 소품(그늘막·텐트) 55% · 수상(슬라이드·트램펄린·풀) 45%
- ⚠ **모양은 마름모가 아니라 기울어진 평행사변형이다.** 바닥 패치만 --ref 로 주면
  모델이 무시하고 관습적인 yaw45 아이소로 그린다 (실측: bottomFrac 0.64 = 좌우 반전).
  `python3 tools/make-diamond-guide.py <fw> <fh> [바닥%]` 가 그리는 것은 **세워 올린
  3D 상자**다 — 바닥 평행사변형 + 보이는 두 옆면 + 윗면. 이걸 첨부하면 실측 0.268
  (기대 0.267) 로 맞는다. 프롬프트에도 각도를 글로 박을 것:
  "wide front wall's bottom edge rises only ~12° to the right; the narrow left wall's
  bottom edge drops ~58°; the near ground corner sits LEFT of centre; SHALLOW isometric,
  not the usual symmetric 30° isometric"
- 폭 맞추기는 재생성이 아니라 **재추출**이다 — `--fit-logical-height` 를 폭에서 역산
  (`lh_new = lh × 규격폭 / 실측폭`) 해 같은 raw 에서 다시 뽑는다.
  ⚠ 로지컬은 raw 의 **네이티브 밀도를 넘길 수 없다** (캡). 넘기면 값을 올려도 크기가
  안 변한다 (pool 실측: lh 98→128 인데 계속 67px). 그때는 재추출이 아니라 **베이스를
  더 촘촘한 밀도로 다시 생성**해야 한다 (블록 수 힌트를 규격의 1.3배로).
- 실행기: `tools/yaw20-batch.py` (base→prepare→row→extract→fit→export→report),
  기울기 실측기: `tools/yaw20-check.py <fw> <fh> <png…>`, 규격표: `assets/generated/yaw20-spec.json`
- ⚠ 재추출 시 크로마 키는 **원 런의 sprite-request.json 에서 확인**해 그대로 쓴다.
  분기표를 다시 추리하다 slide(마젠타 런)를 #00FF00 으로 뽑아 마젠타 배경이
  게임 화면에 그대로 박혔다 (실측 사고)

## 절차 (에셋 1종)

1. **베이스 후보 생성** — 2~4장 병렬. 프롬프트 = manifest 의 `prompt`(소재) + 스타일 요약 +
   레이아웃 규칙(단일 오브젝트, 중앙, 크로마 배경, no shadow/ground/text). 크롭 2장 첨부.

   ```bash
   $SPRITE_GEN_ROOT/.venv/bin/sprite-gen gen --provider codex \
     --prompt "<소재+스타일+레이아웃>" \
     --ref art-reference/crops/<a>.png --ref art-reference/crops/<b>.png \
     --out assets/generated/base-candidates/<id>/cand-N.png
   ```

   **크로마 키 분기 (소재색 먼저)**: 초록/청록 소재(나무·초목) → 마젠타 `#FF00FF`.
   빨강/분홍/노랑-따뜻한 소재(제트스키·바나나보트·파라솔) → 그린 `#00FF00`.
   둘 다 섞이면(인플래터블 라임+노랑 등) → 그린을 피하고 마젠타, 추출 후 소재색 보존 검증.

2. **베이스 락 게이트** — 후보를 눈으로 보고 판정: 레퍼런스와 같은 픽셀 밀도인가,
   아웃라인·이단 명암이 있는가, 실루엣이 로지컬 크기에서 읽히는가. 미달이면 리롤 (프롬프트로
   베이스 스타일을 이기려 하지 말 것). 애매하면 큐레이션 뷰를 띄워 사람에게 넘긴다.

3. **prepare** — 셀은 로지컬 높이의 **정수배** (8× 권장; 예: 로지컬 22 → 셀 176).
   variants 는 상태 하나 `"alt"` 에 frames=N 으로 선언. anchor 매핑:
   manifest `bottom-center` → `--fit-align-x centroid --fit-align-y bottom`,
   `center` → `--fit-align-x centroid --fit-align-y center`.

   ```bash
   $SPRITE_GEN_ROOT/.venv/bin/python $SPRITE_GEN_ROOT/scripts/prepare_sprite_run.py \
     --out-dir assets/generated/sprites/<run-id> --character-id <run-id> \
     --base-image assets/generated/base-candidates/<id>/cand-<락>.png \
     --cell-size <로지컬높이×8> --chroma-key "#FF00FF" \
     --fit-pixel-unfake --fit-logical-height <manifest 높이> \
     --fit-align-x centroid --fit-align-y <bottom|center> \
     --request-json '{"states": {"alt": {"frames": <N>, "fps": 2, "loop": false,
       "action": "N VARIANTS of the same <소재>: each slot one complete object, same
       palette/style/outline, slightly different silhouette"}}}' --force
   ```

   변형이 없는 단품(시설 건물 등)도 같은 경로로 frames=1 런을 만든다 —
   **낱장이라고 파이프라인을 생략하고 resize 하는 것 금지** (sprite-gen 필수 게이트).

4. **행 생성 → 추출 → 아틀라스**

   ```bash
   $SPRITE_GEN_ROOT/.venv/bin/sprite-gen gen --provider codex \
     --prompt-file <run>/prompts/alt.txt \
     --ref <run>/base-source.png --ref <run>/references/layout-guides/alt.png \
     --out <run>/raw/alt.png
   $SPRITE_GEN_ROOT/.venv/bin/python $SPRITE_GEN_ROOT/scripts/extract_sprite_row_frames.py --run-dir <run>
   $SPRITE_GEN_ROOT/.venv/bin/python $SPRITE_GEN_ROOT/scripts/compose_sprite_atlas.py --run-dir <run>
   ```

5. **QA** — 전부 통과해야 완료:
   - `frames/frames-manifest.json.ok` = true, `sprite-sheet-alpha.report.json.ok` = true
   - 프레임들을 NEAREST 2×로 이어붙인 `qa-strip-preview.png` 를 만들어 **눈으로 확인**
     (변형끼리 구분되는가, 로지컬 크기에서 실루엣이 읽히는가, 색이 레퍼런스 계열인가)
   - 소재색 보존: 초록이 탈색/검게 나오면 크로마 키가 소재와 충돌 — 키를 바꿔 재생성
   - 사람이 있으면 큐레이션 뷰로 마감: `$SPRITE_GEN_ROOT/.venv/bin/sprite-gen curation --run-dir <run> &`

## 함정 (실측)

- **`native logical exceeds the physical cap` 경고는 정상이다.** 1024px 생성물의 네이티브
  밀도(~60-76px)가 로지컬(예: 22px)보다 커서 kCentroid 캡이 걸린 것. prop/tree 실측으로
  22px 결과가 충분히 읽혔다. 단, 락 베이스가 그리드-인식 생성물이면 그 raw 가 최상의
  앵커다 (이중 열화 금지).
- **디테일 많은 소재(건물)가 뭉개지면 — 블록 수 힌트로 행만 리롤한다** (facility/shop 실측).
  `pitch crosscheck … divisor misdetection` + 네이티브가 로지컬의 5배 이상이면 모델이 너무
  잘게 그린 것. `prompts/alt.txt` 를 복사한 뒤 보정 힌트를 덧붙여 행만 재생성:
  "previous result was drawn far too fine (~N blocks tall). VERY CHUNKY pixel blocks: the
  whole object must be only about <로지컬> blocks tall; no detail smaller than one block;
  simplify small goods to a few chunky colored blocks." — 실측 네이티브 172→79, 피치
  오검출 경고 소멸, 캡 축소 5.7×→2.6× 로 완화되어 30px 에서 구획이 또렷해졌다.
  (원본 `prompts/alt.txt` 는 수정하지 말 것 — request 파생물이다. 힌트본은 임시 파일로.)
- **셀 높이 ≠ 로지컬의 정수배면 선언이 조용히 무효가 된다** — 176=22×8 처럼 맞출 것.
- **`page.evaluate`/게임 통합 검증은 이 스킬 소관이 아니다** — 최종 소비는 Phase G 의
  AtlasProvider. 그 전까지 산출물은 `assets/generated/sprites/<run-id>/` 에 축적하고,
  게임 코드는 계속 ProceduralProvider 로 돈다.
- **런 폴더 하나 = 워커 하나.** 병렬로 여러 에셋을 뽑을 때는 에셋(런 폴더) 단위로 나눈다.
- 레퍼런스 크롭을 바꾸거나 추가하면 이 파일의 매핑 표를 같이 갱신한다.

## penguin A트랙 모드 (2026-08-14 샘플 검증 — 이쪽이 본선이다)

본 게임 저장소는 `../penguin` 워크트리다. 거기의 `docs/asset-guide.md`(아이소 2:1 ·
고정 팔레트 · D-026 게이트)가 그림 정본이고, 이 스킬은 **A트랙(건물·소품) 실행기**로 쓴다.
vehicle 은 R트랙(Blender) 전속 — 이 스킬로 뽑지 말 것.

우리 레퍼런스 ref-1/ref-2 = penguin 컨셉 팩 `selected/03`·`selected/01` (GPT_CONCEPT_ONLY).

기존 절차와의 차이:

1. **뷰는 아이소 3면** (지붕+정면+측면, 수직선은 화면 수직). 스타일 크롭은
   `art-reference/crops/iso-*.png` (컨셉 팩 `assets/03-…6up.png` 에서 크롭).
2. **로지컬 크기는 penguin `src/assets/manifest.json`** (D-028 반영본 — 예: shop 48×42).
3. **최종 단계: 고정 팔레트 양자화** — `tools/quantize-fixed-palette.py`
   (팔레트 = `art-reference/palette-fixed-33.json`, §19.2 의 재질 33색).
   **나이브 최근접 양자화 금지** — 음영 중간톤이 전부 윤곽갈로 떨어져 윤곽 56~60%가 나왔다
   (asset-guide 가 경고한 그 사고). v2 규칙: 윤곽색은 실루엣 가장자리+어두움일 때만 허용,
   내부는 윤곽 제외 재질로만, 건물은 피부 계열 제외. → 윤곽 11% PASS.
4. **게이트 (D-026)**: 윤곽 0% 초과~20% 이하 · 의도한 주색 계열 >0% · UI 색 ≈0%.
   샘플 실측: shop 윤곽 10.7% PASS · restroom 10.9% PASS.

샘플 실물: `assets/generated/sprites/facility-shop-iso/` · `facility-restroom-iso/`
(42px 로지컬, `final-quantized.png`), QA 시트 `assets/generated/qa-final-sheet.png`.

### 건물 4방향 (2026-08-14 검증 — facility-shop-d0~d3)

건물의 아이소 4방향(정면 R/L + 뒷면 R/L, 90° 요 회전)은 이미지 생성으로 **된다**:

- **방향별 전체 캔버스 생성 + 체인 참조** — d0(락 베이스) → d1(d0 참조, "MIRRORED front")
  → d2(d0 참조, "rear view") → d3(d2 참조, "MIRRORED rear"). 프롬프트는
  "THE EXACT SAME building … ONLY the camera angle changes" 형태. 광원은 네 방향 모두
  좌상단 유지(생성이 지켜줌 — flipX 근사는 광원이 뒤집히는 결함이 있다).
- **한 캔버스 4-up 스트립은 쓰지 마라** (실측): 건물당 해상도가 1/4로 떨어져 10× 압축으로
  뭉개지고 차양 빨강이 주황으로 샜다. 방향별 단독 생성이 명확히 낫다.
- 방향 간 색 통일은 마지막 **고정 팔레트 양자화**가 담당한다 (§19.2 의 존재 이유 그대로).
- 기존 raw 를 재사용할 땐 prepare 후 `raw/alt.png` 에 복사하고 extract 만 돌리면 된다
  (gen 재호출 불필요 — 낱장도 반드시 이 추출 경로를 태운다).
- 게임 계약은 facing 2 (D-032 회전 포기·D-035 flipX 근사) — 4방향은 그 상위 호환이다.
  16방향 연속 회전은 여전히 R트랙(Blender) 전속.

### 건물 18종 × f0/f1 일괄 생산 (2026-08-14 완료 — 36장)

실물: `assets/generated/sprites/b18-<id>-<f0|f1>/final-quantized-39.png` (36장 전부
윤곽 게이트 PASS), 스펙 `assets/generated/buildings18-spec.json`, 시트 `qa-b18-sheet-v4.png`.

배치 레시피 (검증됨):
1. 스펙 JSON 에 종별 features(실루엣 구분 수법 — 쌍문/물줄기/커튼/락커 격자/세탁기 2문 …)와
   지붕 4색 분산을 설계한다. **프롬프트에 청키 밀도 힌트를 처음부터 포함**한다.
2. f0 16종 4병렬 생성(`xargs -P 4`) → 콘택트 시트 4장으로 일괄 눈검수 (16/16 통과 실적).
3. f1 은 f0 을 `--ref` 로 물려 "MIRRORED … LEFT side receding LEFT" 체인 생성.
4. 추출 36런도 4병렬 (run-dir 별로 락이 있어 안전).
5. `tools/quantize-fixed-palette.py` 로 양자화 + 게이트.

**양자화는 hue-패밀리 우선 (v4, tools/quantize-fixed-palette.py) — 역사에서 배울 것:**
- v1 나이브 전역 최근접 → 음영이 윤곽갈로 쏠려 윤곽 56~60% FAIL.
- v2 "윤곽은 가장자리만" → 어두운 목재가 차가운 고무암으로 쏠려 sauna·storage 가 검은 덩어리.
- v3 차가운 캐치올 제외 → 암녹 지붕이 **빨강**으로 샜다 (가중 거리에서 red 가 grass 에 근접).
- v4 hue 버킷 판정 → 계열 내 최근접. 33색만으론 계열당 명암이 없어 셰이딩이 사라지므로
  **암부 6색을 더한 39색 제안 팔레트** (`art-reference/palette-proposed-39.json`:
  목재암 #70522e · 벽암 #a0947e · 지붕암 #8b3c31/#3d6657/#2e5972/#967027) 사용.

컴포넌트 분리 함정: 매달린 커튼/차양이 본체와 안 붙으면 추출이 최대 컴포넌트만 남긴다
(changing f0 실측 — 지붕만 23px). 프롬프트에 "ONE connected solid silhouette" 를 넣어 리롤.

### 수상 기구 (2026-08-14 완료 — 9장: 고정 수상 5 + 슬라이드 2×f0/f1 + 다이빙)

실물: `assets/generated/sprites/rides-*/final-quantized-39.png`, 시트 `qa-rides-sheet.png`,
스펙 `assets/generated/rides-spec.json`. 스타일 크롭: `iso-inflatable-*.png` (컨셉 `assets/02`).

- **코스 장비 19종(견인·동력)은 이 스킬 대상이 아니다** — 16방향 R트랙(Blender) 전속.
  이 스킬이 커버하는 기구 = 고정 수상 놀이시설·데크 부착물 (단일 뷰 또는 facing 2).
- 거북섬(최대 8×6, 로지컬 88px)까지 판독 통과 — "대형 수상시설은 R" 판정의 A트랙 반례 실증.
  현재 manifest 는 trampoline 외 전부 `source:"render"` — 교체는 penguin 의 T-31 아트 승인 결정.
- **물에 뜨는 기구 프롬프트**: "NO water, complete object as if lifted out of the water" —
  물·물결은 P트랙이 그린다. 첨부 레퍼런스에 물이 있으면 생성물에도 물이 새어들 수 있으니 주의.
- **데크 부착물(다이빙대 등)에 인플레이터블 크롭을 첨부하지 마라** — 레퍼런스가 프롬프트를
  이겨서 링 베이스가 생긴다 (실측 2회). 목조물엔 오두막 크롭(iso-vest-hut·dock-huts)을 쓴다.
- **f1 미러 지시는 f0 의 실제 지오메트리를 보고 쓴다** — f0 슈트가 이미 왼쪽인데 "front-LEFT"
  라고 쓰면 미러가 안 된다 (실측). "Everything is a left-right mirror of the reference" 를 명시.
- 프레임형 구조물(정글짐 21%·다이빙 24%)은 윤곽 게이트 20% 를 근소 초과 — 실루엣 대비
  면적이 작은 구조라 나무(≤50% 완화) 와 같은 계열. 완화 판정을 penguin 에 요청.

알려진 잔여 문제 (penguin 에 결정 요청할 것):
- **§19.2 팔레트 개정안**: 재질 33색에는 계열당 암부가 없어 A트랙 양자화에서 셰이딩이
  전멸한다 (v3 실측). 위 암부 6색(×0.62, D-026 그림자면 배율) 추가를 제안 — v3 vs v4 시트가 근거.
- manifest 에 facing f1 실물 등록 (현 flipX 근사 D-035 대체 — 생성 f1 은 광원 좌상단 유지).

### 데크·대여소·소품 (2026-08-14 완료 — 17장)

실물: `assets/generated/sprites/deck-*/final-quantized-39.png`, 시트 `qa-deck-sheet.png`,
스펙 `deck-spec.json`. 적재물 4(그늘막·평상·데크매점·구명함) + 부착물 3(사다리·안전요원·
튜브대여) + 비동력 대여 4종 × f0/f1 + 파라솔 2변형. 리롤 0. 가는 프레임형(사다리 49% 등)은
윤곽 20% 초과가 구조적 — 소품 기준(≤50%) 적용하면 전부 통과 (결정 3).

### 코스 장비 정박 뷰 19종 (2026-08-14 완료)

운행용 16방향은 R트랙 전속 그대로지만, **정박 상태(마리나·선착장)와 도감·건설 팔레트
썸네일은 단일 뷰**라 이 스킬 영역이다. 견인 튜브 15 + 동력 4 전부 빈 상태(무접미) 단일 뷰로
생산: `sprites/veh-*/final-quantized-39.png`, 시트 `qa-veh-sheet.png`, 스펙 `veh-spec.json`.

- 스타일 레퍼런스로 **사람 없는 자사 산출물**(rides 베이스)을 쓰면 정체성 누출이 없다 —
  컨셉 시트(assets/01)는 탑승자가 그려져 있어 빈 상태 생성에 부적합.
- 견인 고리를 프롬프트에 명시 (앞뒤 비대칭 — asset-make 규칙).
- **lotus(연꽃) 실측**: 분홍 꽃잎이 마젠타 인접이라 추출이 `chroma-adjacent` 에러로 막혔다 —
  분기표대로 그린 `#00FF00` 키로 재생성해 해결. 분홍/빨강 소재는 처음부터 그린 키.
- 낮고 평평한 소형(땅콩 23%·바나나 30%·제트스키 31%·웨이크보드 38%)은 윤곽 게이트
  프레임형(≤50%) 분류 대상.

### 배경(backdrop) 레이어 (2026-08-14 — manifest 미계약 신규)

레퍼런스의 겹산+숲 배경. `assets/generated/backdrop/`: `bg-far.png`(하늘+능선 3겹, 불투명,
로지컬 197×117) · `bg-near.png`(숲 트리라인, 알파, 209×110). 둘 다 **가로 타일러블**
(랩 크로스페이드 12px, 심 테스트 `seam-test-*.png` 통과). 씬 목업 `qa-scene-mockup.png`.

- 풀블리드 배경은 크로마 스프라이트가 아니라 sprite-gen 런을 안 태운다 — 정수 배율(÷8)
  NEAREST 축소 + 랩 블렌드 (스크립트는 결정론). 트리라인 크로마 제거는 나이브 마스크가
  아니라 **`sprite-gen cutout <입력> --key magenta`** 를 쓸 것 (나이브 마스크는 잔여 점 실측).
- 색은 §19.2 강제 양자화를 하지 않았다 — 원경 haze 는 기존 계열 밖. 배경 전용 색 계열
  추가가 결정 항목 (DECISION-REQUEST §5).

#### 맵 타입별 배경 벽 3종 (2026-08-17 — prototype-3d 실사용본)

`bg-river.png` · `bg-mountain.png` · `bg-lake.png` (전부 197×117, 가로 타일러블).
빌드 스크립트가 결정론이다: **`python3 tools/make-backdrop-map.py [river|mountain|lake]`**
— raw → ÷8 NEAREST → 197×117 → 랩 크로스페이드 12px → `assets/generated/backdrop/` 와
`prototype-3d/public/sprites/` 양쪽에 저장 + `seam-test-<타입>.png` 생성.
프롬프트는 `assets/generated/backdrop/maps/prompt-<타입>.txt` 에 남아 있다 (raw 도 같은 폴더).

- **랩 크로스페이드는 여분 열이 있어야 한다.** 이미지 안에서 양 끝을 섞으면 이음새가
  오히려 커진다 (실측 seam Δ 18 > 내부 Δ 11). 폭 W+12 로 잘라 와서 앞 12열에 W+i 열을
  겹쳐 넣고 W 로 접어야 한다 (수정 후 seam Δ 9 < 내부 Δ 11).
- **맨 위 10줄은 하늘 단색으로 눌러 둔다** (이어지는 10줄로 원본에 페이드). 벽 텍스처의
  wrapT 가 ClampToEdge 라 `repeat.y>1` 로 두면 그 줄이 위로 무한히 늘어나 벽 윗변이
  화면에 안 나온다. 씬 배경색도 같은 값이어야 한다 — `prototype-3d/src/farbank.ts` 의
  `sky` 필드. 검사기: `prototype-3d/tools/check-farbank-sky.mjs`.
- **한 장을 잘라 두 벽으로 세우지 말 것.** 옛 `farbank-village.png` 은 아래 6줄이
  순수 검정 패딩이었고 그게 화면 상단의 가로 검은 선이었다 (실측).
  근거 이미지 `assets/generated/backdrop/before-after-black-line.png`.

**penguin 결정 패키지: `assets/generated/DECISION-REQUEST.md`** — §19.2 암부 6색 ·
facing f1 실물 · 게이트 카테고리 세분 · render→ai 전환 후보. 정본 수정은 저기서 결정된 뒤에.

### 지형 타일 (2026-08-14 완료 — 11종 × 3변형, 타일링 QA 포함)

미결이던 타일링이 풀렸다. 레시피: ① 종별로 "seamless repeating top-down texture" 를
전체 캔버스 생성 (스타일 크롭 첨부, 청키 힌트) ② ÷8 NEAREST → 중앙 48×48 로지컬
③ 16×16 타일 3장을 추출해 **각 타일에 랩 크로스페이드(4px) 를 걸어 자기 타일링**으로
④ 혼합 변형 6×4 그리드로 이음새 QA (`qa-terrain-tiles.png`). 실물:
`assets/generated/terrain-tiles/<종>-a{0,1,2}.png`, 원본 `terrain-raw/`.

- **shore(물가) 는 방향성 타일** — 거품선이 위=모래/아래=물 구조라 가로만 랩 블렌드.
  월드젠에서 Shore 밴드를 **정확히 1줄**로 강제해야 거품선이 이중으로 안 보인다 (실측).
- 알려진 잔여: 잔디 계열에서 16px 리듬의 그리드 밴딩이 약하게 보인다 (랩 블렌드가
  가장자리를 살짝 어둡게 만듦) — 개선 후보: 블렌드 폭 축소 or 변형 추출 위치 다양화.
- 양자화는 걸지 않았다 (물 그라데이션이 §19.2 계열보다 넓다 — 배경과 같은 결정 대기).

## 미결 (다음 세션에서 결정)

- 16×16 타일링 에셋(`facility/dock`) — 이어붙임(타일링) 검증 절차가 아직 없다.
  4방 이음새를 실제로 격자 배치해 확인하는 QA 스텝을 추가해야 한다.
- 게임 로지컬 크기가 아주 작은 것(8~16px)은 픽셀 언페이크 캡 축소 품질을 케이스별로 확인.
- `manifest.json` 의 `style` 필드가 아직 "top-down pixel art…" 구식 문구다 — 레퍼런스 기반
  스타일 계약으로 갱신할지, prompt 필드를 소재 서술만 남길지 결정 필요.
