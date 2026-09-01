# 시설 런타임 크기·배치 결정 기록

최종 갱신 2026-09-01. 이 문서는 후보 에셋을 메인 브랜치와 라이브 팩에 채택할 때 다시
판단하지 않도록 **사용자가 승인한 런타임 풋프린트**와 원자적 적용 순서를 기록하는 정본이다.

## 현재 승인된 결정

| 시설 | 현재 라이브 | 사용자 승인 | 새 캔버스·앵커 | 슬롯 보존 | 적용 상태 |
|---|---:|---:|---|---|---|
| `icecream` | **1×1** | **1×1** | 32×36, `[16,36]` | `[0,0]` 1개 유지 | 라이브 적용 완료 |
| `cafe` | **2×2** | **2×2** | 64×52, `[32,52]` | `[0..1,0..1]` 4개 유지 | 라이브 적용 완료 |
| `nursing` | **2×2** | **2×2** | 72×60, `[36,60]`, 좌우 guard 4 | `[0,0]` 1개 유지 | 라이브 적용 완료 |

결정 상태는 `USER_APPROVED_AND_LIVE_ADOPTED`다. 아이스크림 1×1과 카페 2×2는
2026-08-27, 수유실 2×2는 2026-09-01에 d0–d3 채색 스프라이트와 라이브 계약·아틀라스에
원자적으로 적용되었다.

### 2026-09-01 수유실 2×2 라이브 채택

사용자는 수유실 `2×2` 비율과 라이브 교체를 명시 승인했다. 수유실은 `2×1 → 2×2`, 논리
캔버스 `48×44 → 72×60`, anchor `[24,44] → [36,60]`, bodyH `20 → 28`로 변경했다.
좌우 4 논리 텍셀은 물리 바닥을 축소하지 않고 수평 clip만 막는 대칭 투명 guard다. 접지
게이트는 guard를 제외한 footprint 파생 캔버스에서 측정한다.

d0–d3 라이브 프레임은 144×120 density-2이고 retained foreground `1.0`, clip `0`이다.
기존 슬롯 `[0,0]`은 새 2×2 모든 회전에서 유효하다. 아틀라스 비교 결과 수유실 4프레임만
픽셀이 변경됐으며 나머지 200프레임은 동일하다. 전체 verify·build와 실제 Phaser 배치를
통과한 뒤 메인에 적용했다.

메시 실측 점유는 아이스크림이 약 1.00×0.35타일, 카페가 약 2.00×1.32타일이다. 이전
풋프린트를 채우도록 균일 확대하면 각각 5.74×2.00, 4.53×3.00타일이 되어 반대 축을
침범한다. 따라서 메시를 늘이거나 비균일 스트레치하지 않고 풋프린트 계약을 줄인다.

## 검토 자료의 해상도 구분

- `runtime-fit-map-v1/focused-footprint-options-icecream-cafe.png`는 32×16 게임 타일과
  실제 런타임 셀을 검증하는 자료다. 시설 셀은 32×36~80×60px로 축소된 뒤 픽셀 확대되므로
  **화질 승인에 사용하지 않는다**.
- `runtime-fit-map-v1/source-quality-4dir-icecream-cafe.png`는 d0–d3의 잠긴
  1024×1024 원본을 1:1로 합친 **외형·화질 검수 자료**다.
- `runtime-fit-map-v1/FOOTPRINT-DECISIONS.json`은 같은 결정을 자동화가 읽는 기계 판독
  정본이며, 증거 파일의 SHA-256도 포함한다.

## 메인 채택에 사용한 원자적 적용 체크리스트

1. 승인된 d0–d3 스프라이트 4장을 모두 준비하고 외형·알파·방향 검수를 통과시킨다.
2. 같은 변경에서 `src/data/kairo-facilities.json`의 `size`와 `facings: 4`를 갱신한다.
3. 같은 변경에서 `src/assets/kairo-render-contract.json`의 `canvas`, `anchorTexel`, `bodyH`와
   필요한 대칭 투명 guard를 위 표의 승인값으로 갱신한다.
4. 기존 슬롯이 모든 회전에서 새 풋프린트 안에 있고 서비스 방향과 일치하는지 재검증한다.
5. d0–d3 전체를 라이브 팩에 복사하고 4방향 계약에 따라 낡은 단일 base 스프라이트를
   정리한다. 데이터나 한 방향만 먼저 적용하지 않는다.
6. `npm run bake:atlas -- --density 2`, `npm run gate`, `npm run verify`, 브라우저 하네스,
   `npm run build`를 차례로 통과시킨다.

위 체크리스트는 완료되었다. 라이브 시설 JSON은 20종에 `facings: 4`를 선언하고,
아틀라스는 204프레임(새 80프레임은 density 2, 기존 124프레임은 density 1)을 한 장에
혼합해 공급한다. 최종 실행 증거와 해시는
`artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/LIVE-ADOPTION.json`을
정본으로 삼는다.

## HD 픽셀 모드 실제 맵 파일럿

2026-08-27에 동일한 새 게임·동일 좌표·동일 카메라로 세 경로를 비교했다.

| 안 | 실행 URL | 백버퍼/CSS | 시설 계약 | 결과 |
|---|---|---:|---|---|
| A | 기본 URL | 1× | 현재 1×2, 2×3 | 현재 대조군 |
| B | `?hd=1` | 2× | 현재 1×2, 2×3 | 해상도만 분리 검증 |
| C | `?hd=1&hdFit=1` | 2× | 승인 1×1, 2×2 + d0–d3 | **채택 후보** |

실측에서 A는 1100×760 백버퍼/1100×760 CSS, B·C는 2200×1520 백버퍼/1100×760
CSS였다. 따라서 월드의 논리 타일 32×16과 화면상 배치 크기는 유지하면서 실제 소스와
렌더 밀도만 2배가 됐다. A/B/C 모두 같은 CSS 좌표 `(502,324)`의 아이스크림 칸을 실제로
클릭해 시설 정보 패널이 열렸다. B·C 내부 타일 사각형은 64×32로 정확히 두 배였고 입력
환산 뒤에는 A와 같은 칸을 가리켰다.

C에서는 실제 런타임이 `facility/icecream:d0..d3`, `facility/cafe:d0..d3` 여덟 텍스처를
모두 선택했다. 화면 논리 크기는 아이스크림 32×36, 카페 64×52로 승인 풋프린트와 맞았다.
세 안 모두 캡처 시 60 FPS, 도트 격자 OK, 콘솔 오류 0이었다.

비교 증거:

- `artifacts/hd-pixel-mode-pilot-v1/runtime-map/review/actual-map-abc-s2-comparison.png`
- `artifacts/hd-pixel-mode-pilot-v1/runtime-map/review/actual-map-approved-four-directions-s2.png`
- `artifacts/hd-pixel-mode-pilot-v1/runtime-map/evidence.json`
- 생성 매니페스트: `public/assets/kairo-hd-pilot-v1/manifest.json` (45개, 검토 전용)

당시 판단은 **C를 HD 픽셀 방향의 기준 후보로 유지**하는 것이었다. B는 해상도 변경과
풋프린트 변경을 분리해 원인을 확인하는 대조군이며 최종안이 아니다. 다만 파일럿은 지면
전 종류와 아이스크림·카페만 2×로 교체했다. 벽·손님·나머지 시설은 기존 공급자 폴백이라
전체 게임이 한 번에 HD가 된 것으로 해석하지 않았다. 이후 C의 방식이 라이브 기본값으로
채택되어 기본 URL도 D=2로 렌더하고, 20종 시설의 80개 방향 프레임을 density 2로 읽는다.

라이브 실제 맵 증거:

- `artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/runtime-map/live-actual-map-s2.png`
- `artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/runtime-map/live-four-directions-actual-map-s2.png`
- `artifacts/asset-concept-sheets/indoor-facilities-v1/live-adoption-v1/runtime-map/evidence.json`

## 2026-09-01 지붕형 PASS 시설 추가 채택

동일 2×2 풋프린트를 유지한 엄격 검수 후보 중 매점, 분식, 노래방, 안내소, 의무실,
사무실 6종을 density 2 라이브 아틀라스에 채택했다. 각 시설은 원래 메시의 접지 크기를
줄이지 않고 좌우 투명 guard만 추가해 지붕과 간판 클리핑을 막는다. 수유실은 이미 승인된
v9 2×2 채택본을 그대로 사용한다.

보류는 세 종류를 섞지 않는다.

- 화장실: 새 d2의 왼쪽 접지 기울기 0.576으로 정본 0.500 게이트에서 보류.
- 카페: 최신 v5가 2×2에서 3×2로 바뀌므로 별도 풋프린트 승인 필요.
- 창고: `FAIL_CLOSED_STRICT_COLOR_VALIDATION` / `RUNTIME_FIT_HELD`.

채택 프레임·엄격 QA·독립 검수 해시는
[`roofed-pass-facilities-live-v1.json`](roofed-pass-facilities-live-v1.json)이 정본이다.
