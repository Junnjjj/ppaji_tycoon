# 지형·물·곡선 해안 제작 파이프라인

최종 갱신 2026-08-27. 빠지 타이쿤의 잔디, 모래, 돌길, 데크, 물, 절벽과 해안 전이를
고품질 원본 이미지부터 실제 맵 검토 후보까지 만드는 현행 정본이다. 시설 d0–d3나 이동형
수상기구에는 이 문서를 적용하지 않는다.

## 현재 시각 정본

서로 다른 역할을 한 이미지에 몰아주지 않는다.

| 역할 | 정본 | 상태 |
|---|---|---|
| 재질·색감·픽셀 밀도 | `terrain-v3-high-quality-source/terrain-master-source-v1.png` | 사용자 선택 완료 |
| 실제 맵의 해안 곡선·포말 리듬 | `terrain-v2-pilot/attempt-b-map-target.png` | 사용자 방향 승인 완료 |
| 정확한 런타임 실측 후보 | `terrain-v3-high-quality-source/runtime-map/terrain-v3-source.png` | 기술 PASS, 곡선 해안 후속 대기 |

상세 해시와 승인 범위는
[terrain-v3 시각 방향 결정](../adoption/terrain-v3-visual-direction.md)에 기록한다. B 이미지는
전체 재질 정본이 아니라 **넓게 이어지는 곡선 해안의 형태 정본**이다. source-v1은 계속 색과
질감 정본이다.

## 불변 런타임 계약

- 논리 타일은 32×16, 2:1 아이소메트릭이다.
- HD 검토 팩은 density 4, 물리 128×64 타일을 쓴다.
- 카메라는 yaw 45°, elevation 30°, 수직선은 직립, 광원은 화면 좌상단 고정이다.
- ImageGen 원본을 그대로 잘라 쓰지 않는다. 정확한 마스크와 연결점을 결정적으로 재적용한다.
- 기본 공급자, 라이브 아틀라스와 라이브 데이터는 사용자 제작 승인 전까지 바꾸지 않는다.
- 콘셉트 승인, 실제 맵 방향 승인, 반복·전이 QA, 물 애니메이션, 라이브 채택은 별도 게이트다.

## source-first 제작 순서

1. 한 장의 고품질 마스터에서 잔디·모래·돌·데크·물·절벽의 가족성을 먼저 승인받는다.
2. exact 2:1 가이드로 필요한 인벤토리와 위치를 고정한다.
3. built-in ImageGen에 가이드를 형상 정본, 승인 마스터를 재질 정본으로 전달한다.
4. density 4의 정확한 다이아몬드 마스크로 다시 추출한다. 외곽선이 반복 격자 밴딩이 되면
   내부 source 픽셀을 경계까지 투영하되 색을 새로 발명하지 않는다.
5. 지면 반복 QA에서 틈 0, 겹침 0, 경계 대비·편향 문턱 통과를 요구한다.
6. 같은 맵·카메라의 기본 대조군과 후보를 캡처해 사용자에게 보여준다.
7. 사용자 제작 승인 뒤에만 기본 공급자나 라이브 팩 채택을 검토한다.

현재 구현 도구와 기록:

- 가이드: `tools/make-terrain-v3-runtime-guide.py`, `tools/make-terrain-v3-transition-guide.py`
- 추출: `tools/build-kairo-terrain-v3-source-pack.py`
- 검토 공급자: `src/assets/kairo-terrain-v3-source.ts`
- 실제 맵 캡처: `tools/capture-terrain-v3-runtime-pilot.ts`
- 반복 QA: `tools/seam-qa.ts`
- 프롬프트·QA: `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/`

## B형 곡선 해안 오버레이

현재 `shore_i`, `shore_j`, `shore_ij`은 한 칸 안에서만 물과 육지를 나눈다. 따라서 포말
질감은 좋아도 큰 해안 윤곽은 격자 계단으로 남는다. B처럼 보이게 하려면 물 P0–P3 아래
타일을 다시 만들기보다, 여러 칸을 가로지르는 투명 해안 오버레이를 추가한다.

### 최소 파일럿 인벤토리

| 가족 | 조각 |
|---|---|
| +I 방향 곡선 | `curve_i_start`, `curve_i_mid`, `curve_i_end` |
| +J 방향 곡선 | `curve_j_start`, `curve_j_mid`, `curve_j_end` |
| 코너 | `curve_outer_corner`, `curve_inner_corner` |

우선 8종으로 실제 맵을 검토한다. 반복이 눈에 띄는 경우에만 S자 전이와 두 번째 곡률 4종을
추가해 최대 12종으로 확장한다. 3칸 연결 조각의 논리 합성 캔버스는 방향별 64×32,
density 4 물리 캔버스는 256×128을 기준으로 한다.

### 레이어 계약

- 물의 P0–P3 재질은 기존 바닥 타일이 담당한다.
- 오버레이는 따뜻한 모래 가장자리, 흰 포말, 옅은 청록 얕은 물만 가진다.
- 오버레이는 물 애니메이션 phase와 독립적이므로 P0–P3별로 4배 복제하지 않는다.
- 시뮬레이션의 물/육지 판정과 NPC 경로는 기존 격자를 유지한다. 곡선은 화면 표현이다.
- 곡선이 타일 중심을 지나도 클릭·건설·수영 판정의 정본은 논리 셀이다.

### 생성 계약

한 장의 exact 연결 가이드에 8종을 모두 분리 배치한다. 가이드는 조각별 시작점·끝점과
3칸 연결 좌표를 고정하고, source-v1은 색·픽셀 군집 정본, B 이미지는 곡률·포말 폭·해안
리듬 정본으로만 사용한다. 배경은 크로마 분리용 단색 마젠타이며 시설, 인물, 보트, UI,
그림자와 텍스트를 금지한다.

## 곡선 해안 QA

일반 지면 반복 검사만으로는 여러 칸 오버레이를 검증할 수 없다. 다음을 별도로 기록한다.

1. 모든 start→mid→end 접속점의 알파 틈 0, 겹침 0.
2. +I/+J 양 방향, 안쪽/바깥쪽 코너의 끝점 좌표 일치.
3. 직선→곡선→직선과 곡선→코너→곡선 테스트 스트립.
4. 최소 7×5 해안 실제 맵에서 동일 패턴 과반복 여부.
5. source-v1 물과 오버레이 얕은 물의 색 경계.
6. 물 P0–P3 전환 중 포말 레이어가 흔들리거나 끊기지 않는지.
7. 클릭·건설·NPC 판정이 시각 곡선 때문에 바뀌지 않았는지.

첫 8종 오버레이 v1은 연결 성분·크로마 QA를 통과했지만 실제 맵에서 반복되는 둥근
물결무늬로 보여 `FAIL_USER_VISUAL_REJECTION`이다. 이 기술 PASS를 재사용해 시각 PASS로
올리지 않는다. v1은 실패 증거로만 보존하고 라이브 채택에서 제외한다.

## 반경 기반 연속 해안 파일럿

8종 타일 오버레이를 다듬지 않고, 논리 맵의 물/육지 경계를 격자 좌표에서 한 번
추출한다. 직선은 유지하고 각 꼭지점의 진입·진출 구간만 지정한 반경의 2차 곡선으로
치환한 뒤 2:1 아이소메트릭으로 투영한다. 따라서 돌출된 육지의 볼록 코너와 들어간 만의
오목 코너가 같은 연속 경계에서 처리된다.

핵심 계약:

- 반경은 화면 픽셀이 아닌 **논리 타일 단위**로 적용한다.
- 시뮬레이션의 물/육지, 건설, 클릭, NPC 경로 판정은 기존 격자를 그대로 쓴다.
- 경계만 source-v1 모래·포말·엕은 청록으로 다시 굽고, 멀리 떨어진 잔디·모래·물 본체는 바꾸지 않는다.
- `shoreRadius=0`은 공정한 음성 대조군이고, `0.5`, `0.75`, `1.0`을 같은 맵·카메라로 비교한다.
- 반경 후보가 활성화되면 거절된 `overlay/shore_curve_*` 8종은 렌더에서 완전히 우회한다.

구현·검증 위치:

- 경계 추출·반경: `src/render/kairo/rounded-shore.ts`
- 실제 타일 합성: `src/render/scenes/KairoScene.ts`
- 동일 맵 캡처: `tools/capture-terrain-v3-shore-radius.ts`
- 음성 대조군·자동 QA: `src/render/kairo/rounded-shore.test.ts`, `tools/qa-terrain-v3-shore-radius.py`
- 비교판: `terrain-v3-high-quality-source/shore-radius-pilot/shore-radius-r050-r075-r100-preview.png`

현재 결과는 `PASS_TECHNICAL_USER_REVIEW_PENDING`이다. 기술 게이트는 통과했지만 R=0.5/0.75/1.0 중
어느 반경도 사용자가 아직 선택하지 않았다. 라이브 채택 승인으로 해석하지 않는다.

## 현재 게이트

- source-v1 재질 방향: `USER_SELECTED`
- terrain-v3 density-4 반복 지면: `PASS_TECHNICAL`
- source-v1 no-radius 기본 공급자: `USER_ADOPTED_LIVE` (2026-09-01)
- B형 곡선 해안 방향: `USER_APPROVED_VISUAL_TARGET`
- 8종 곡선 오버레이 v1: `FAIL_USER_VISUAL_REJECTION`
- 반경 기반 교체안 R=0.5/0.75/1.0: `PASS_TECHNICAL_USER_REVIEW_PENDING`
- 시간 기반 물 P0–P3 재생: `PENDING`
- 곡선 해안 기본/라이브 채택: `NOT_AUTHORIZED`

다음 정지점은 축소 비교판에서 R=0.5/0.75/1.0 중 한 반경을 사용자가 선택하거나 모두
거절하는 `ROUNDED_SHORE_RADIUS_USER_REVIEW`다.
