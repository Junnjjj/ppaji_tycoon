# 빠지 타이쿤 에셋 문서 허브

최종 갱신 2026-08-27. 에셋 작업은 이 문서에서 시작한다. `history/`와
`maintenance/legacy-*`는 현행 생산 승인의 근거가 아니다.

## 작업별 시작 문서

| 하려는 일 | 먼저 읽을 문서 | 적용 스킬 |
|---|---|---|
| 시설군 콘셉트 시트·색·풋프린트 탐색 | [콘셉트 포트폴리오](pipelines/concept-portfolio.md) | `$ppaji-kairo-assets` |
| 고정 시설 d0–d3 제작·검수 | [카메라·방향 계약](contracts/camera-direction.md), [고정 시설 4방향 계약](contracts/four-direction.md) | `$ppaji-kairo-assets` |
| 고정 시설 20종 같은 병렬 웨이브 | [시설 배치 운영](pipelines/facility-batch-orchestration.md) | `$ppaji-kairo-assets` |
| 잔디·모래·물·절벽과 곡선 해안 제작 | [지형·물·곡선 해안 파이프라인](pipelines/terrain-ground-water.md), [terrain-v3 시각 방향 결정](adoption/terrain-v3-visual-direction.md) | `$ppaji-kairo-assets` |
| 제트스키·보트·견인기구 4/16방향 | [이동형 수상기구 파이프라인](pipelines/watercraft.md) | `$ppaji-watercraft-pipeline` |
| 승인 에셋을 메인·라이브 팩에 적용 | [런타임 크기·채택 결정](adoption/runtime-fit-decisions.md) | 해당 파이프라인 |
| 구형 V2 시설을 유지보수 | [구형 재생성 지시서](maintenance/legacy-v2-regeneration.md), [구형 시트 프롬프트](maintenance/legacy-sheet-prompts.md) | 신규 제작에는 사용 금지 |
| 토큰 절감 방식을 별도 실험 | [토큰 절감 실험안](operations/token-efficiency-experiment.md) | 현재 파이프라인 미적용 |

## 폴더 구조

```text
docs/assets/
├── README.md                 # 이 문서: 유일한 진입점
├── contracts/                # 카메라·축·물리 방향 불변식
├── pipelines/                # 시설·수상기구 제작 흐름
├── adoption/                 # 사용자 승인과 메인 적용 결정
├── operations/               # 아직 채택되지 않은 운영 실험
├── maintenance/              # 코드가 참조하는 구형 V2 유지보수 문서
└── history/                  # 실패 보고·삭제 기록; 정본 아님
```

## 정본 우선순위

충돌할 때는 아래 순서를 따른다.

1. 라이브 데이터: `src/data/kairo-facilities.json`, `src/assets/kairo-render-contract.json`
2. 현재 스킬과 `contracts/`
3. `pipelines/`
4. 사용자가 승인한 `adoption/` 결정 레코드
5. 실행 산출물의 해시·매니페스트
6. `maintenance/`와 `history/`

콘셉트 승인, 물리 회전 PASS, 채색 검수, 풋프린트 승인, 라이브 채택은 서로 다른 게이트다.
한 단계의 PASS를 다음 단계의 승인으로 확대 해석하지 않는다.

## 현재 실내시설 20종 상태

정본 실행 결과는
`artifacts/asset-concept-sheets/indoor-facilities-v1/physical-direction-color-wave-v1/FINAL-VALIDATION.json`이다.

| 항목 | 현재 값 |
|---|---:|
| 실제 Meshy/Blender 물리 d0–d3 기술 PASS | 20/20 |
| 새 Blender 재오픈·물리 알파 잠금 PASS | 20/20 |
| 원시 ImageGen 채색의 geometry gate(중간 실패 기록) | PASS 30 / FAIL 46 |
| 물리 방향·알파 잠금 후 최종 제작 승인 | 20/20 |
| 라이브 채택 완료 | 20/20 |

현재 상태는 `USER_APPROVED_AND_LIVE_ADOPTED`다. 과거 prompt-only 4-up의
`PASS 16 / CONDITIONAL 2 / FAIL 2`와 원시 채색 geometry 실패는 사용자 거절·중간 실패
기록이며 승인 근거로 재사용하지 않는다. 라이브 채택은 실제 Meshy/Blender 물리 d0–d3와
물리 알파 잠금 산출물을 사용했다.

런타임 배치 증거는
`artifacts/asset-concept-sheets/indoor-facilities-v1/runtime-fit-map-v1/`에 있다. 80개 방향을
검사했고, 최종 채택 단계에서 80방향 모두 알파 유지율 1.0·클립 0이 되도록 공통 스케일을
보정했다. 아이스크림은 1×1, 카페는 2×2로 라이브 적용되었고 20종 모두 d0–d3를 쓴다.

외형·크기·입구면을 다시 볼 때는 실제 Phaser 맵의 `?assetReview=1`을 사용한다.
승인된 20종을 각각 네 방향으로 놓고, 개별 검토 화면에서는 **위 d0 · 오른쪽 d1 ·
아래 d2 · 왼쪽 d3** 순서로 보여 준다. 리뷰 판은 기존 세이브를 읽거나 쓰지 않는다.
재촬영과 80텍스처 검증은 다음을 쓴다.

```bash
PPAJI_URL=http://127.0.0.1:<current-workspace-port> \
  npx tsx tools/capture-four-direction-asset-review.ts
```

개별 20종과 전체 전시 캡처는
`artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-live-review-v1/`에 생성된다.
사용자가 특정 시설·방향을 거절하면 스킬의 시각 거절 게이트에 따라 해당
`visual-review.json`을 `FAIL_USER_VISUAL_REJECTION`으로 갱신한 뒤 교체본을 다시 보여 준다.

HD 픽셀 렌더 실제 맵 파일럿은 `artifacts/hd-pixel-mode-pilot-v1/runtime-map/`에 있다.
기본 A, 2× 렌더/현재 풋프린트 B, 2× 렌더/승인 풋프린트 C를 같은 좌표에서 비교했으며,
C의 4방향 선택과 실제 캔버스 클릭까지 통과했다. 이후 C가 기본 런타임으로 채택되었다.
자세한 수치와 채택 경계는
[런타임 크기·채택 결정](adoption/runtime-fit-decisions.md)의 “HD 픽셀 모드 실제 맵
파일럿” 절과 `live-adoption-v1/LIVE-ADOPTION.json`을 따른다.

## 현재 terrain-v3 지형·물 상태

source-v1의 색·질감과 density-4 실제 맵 방향은 사용자가 선택했다. 반복 지면은 틈 0,
겹침 0, 이음새 실패 0으로 기술 검증을 통과했다. 해안은 B 목표 이미지처럼 여러 칸에
걸친 곡선과 연속 포말을 쓰는 방향으로 승인됐다.

phase 독립 8종 매크로 해안 오버레이 v1은 제작·연결 QA까지 했지만 실제 맵에서 반복되는
둥근 물결무늬로 보여 사용자가 거절했다. source-v1 재질 방향과 B 목표는 유지하며, v1은
`FAIL_USER_VISUAL_REJECTION`으로 보존한다. 다음은 타일 조각보다 먼저 긴 연결 스트립 또는
큰 마스크의 시각 원본을 검토하는 교체 트랙이다. 기본 공급자와 라이브 팩은 미변경이다.
정본 상태와 다음 게이트는
[지형·물·곡선 해안 파이프라인](pipelines/terrain-ground-water.md)을 따른다.

## 산출물 위치

- 콘셉트·배치·통합 QA: `artifacts/asset-concept-sheets/`
- 시설별 고해상도 원본·Dense GLB·Blender·방향별 증거:
  `assets/generated/kairo-v4-simple-pilot/<asset-id>/`
- 현재 라이브 스프라이트와 아틀라스 입력: `assets/generated/kairo/`
- 런타임 데이터·캔버스 계약: `src/data/`, `src/assets/`

`assets/generated/`는 대용량·재생성 가능 산출물이 섞여 있으므로 문서만 보고 삭제하지 않는다.
원본 GLB, 승인 입력, `raw/`, 해시 매니페스트와 재오픈 증거는 해당 파이프라인의 보존 계약을
먼저 확인한다.

## 메인 채택 규칙

사용자 승인 뒤에도 한 방향이나 JSON 한 파일만 먼저 적용하지 않는다. 같은 변경에서 d0–d3
전체, `size`, `facings`, 캔버스·앵커, 슬롯 방향, 아틀라스를 원자적으로 갱신하고 다음을
검증한다.

```bash
npm run bake:atlas -- --density 2
npm run gate
npm run verify
npm run build
```

현재 워크스페이스의 브라우저 하네스와 실제 맵 배치 검토도 통과해야 한다.

## 역사·레거시 정책

- `history/`는 재발 방지와 provenance를 위한 보존 자료다. 새 작업 지시로 사용하지 않는다.
- `maintenance/legacy-*`는 현재 코드가 경로를 참조하므로 남긴 구형 V2 계약이다. 새 물리
  d0–d3 제작에는 사용하지 않는다.
- 완료된 일회성 워커 계약처럼 참조가 0이고 현행 파이프라인이 대체한 문서는 제거한다.
- 문서를 이동하면 코드 주석·테스트·스킬의 경로도 같은 변경에서 갱신한다.
