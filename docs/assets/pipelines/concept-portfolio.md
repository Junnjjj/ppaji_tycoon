# 빠지 에셋 콘셉트 포트폴리오 운영 정본

최종 갱신 2026-08-26. 이 문서는 빠지 타이쿤의 시설군을 카테고리 시트로 탐색한 뒤 실제
에셋 제작으로 넘기는 기준이다. 대응 스킬은 `$ppaji-kairo-assets`다.

## 어디까지 담당하나

- **이 문서:** 고정 시설·고정 수상기구의 카테고리 시트, 풋프린트 비교, 색상 방향, 후보 선택.
- `docs/assets/contracts/four-direction.md`: 승인된 고정 시설의 방향별 제작·채택 계약.
- `docs/assets/pipelines/watercraft.md`: 제트스키·견인보트처럼 경로를 따라 움직이는 기구의 실제
  메시, 4/16방향, 채색, 게임 검토 계약.

이미지 생성 시트는 디자인 탐색 도구다. 시설의 실루엣과 색 조합은 정할 수 있지만 정확한
타일 점유, 월드 스케일, 앵커, 가려진 면, 충돌 영역, 실제 게임 채택을 증명하지는 못한다.

## 표준 흐름

1. 카테고리 전체 시트로 시설군의 범위와 공통 미술 언어를 본다.
2. 2×1·2×2·3×3 같은 풋프린트군을 한 시트에서 비교한다.
3. 사용자가 구조와 색 방향을 고른다.
4. 선택한 한 시설을 분리하고 정확한 원본 경로와 SHA-256을 기록한다.
5. 단순한 고정 시설은 4방향 후보 트랙, 복잡한 시설은 구조 가이드 또는 3D 트랙으로 간다.
6. 실제 크기와 앵커를 게임 배경 위에서 검증한 뒤에만 라이브 팩 채택을 요청한다.

모든 단계는 별도 게이트다. 콘셉트 승인, 풋프린트 PASS, 4방향 PASS, 런타임 PASS를 서로
대신 사용하지 않는다.

## NPC 이용면·입출구 방향 계약

NPC가 이용하는 시설은 그림을 만들기 전에 다음 중 하나로 분류한다.

- `service-face`: 상점·자판기처럼 한 면을 보고 이용한다.
- `portal`: 화장실·수유실처럼 같은 문으로 들어가고 나온다.
- `flow`: 워터슬라이드·유수풀처럼 입구와 출구가 다르다.
- `two-sided`: 탁구대처럼 서로 반대쪽 이용면이 필요하다.
- `occupancy-only`: 선베드·안마의자처럼 입구보다 자세·좌석 앵커가 중요하다.
- `staff-only`: 사무실·창고처럼 방향은 있지만 손님이 이용하지 않는다.

시설 배치의 `facing`과 같은 변환으로 입구·출구·이용면·NPC 슬롯을 함께 회전시킨다. d0–d3
별 좌표를 따로 저장하지 않는다. 수치 정본은 `src/data/kairo-facilities.json`에 두고, 에셋
패키지는 그림의 문·카운터·조작면이 정본과 맞는다는 증거만 가진다.

시설 원본에는 NPC를 굽지 않는다. 빈 시설 위에 실제 이용 인원만 슬롯으로 합성하고,
`빈 상태 → 1명 → 일부 점유 → 만석`과 앞/뒤 가림을 별도로 확인한다. 상세 재사용 규칙은
`/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/references/access-and-occupancy.md`가 정본이다.

## 카테고리 시트 규칙

- 먼저 묶을 시설군: 입구·운영, 음식, 서비스·안전, 고정 수상 놀이시설, 대여·견인기구,
  숙박·휴식·조경, 지형·데크·소품.
- 요청한 수만 그린다. 빈 셀을 만들지 않고, 불가피하면 "추가 시설을 만들지 말 것"을 쓴다.
- 같은 투영, 좌상단 조명, 테두리 굵기, 재료, 픽셀 밀도를 유지한다.
- 간판을 가려도 구조로 역할이 읽혀야 한다. 카운터·출입구·캐노피·장비·활동면을 크게 쓴다.
- 지붕은 하나의 고정색이 아니다. 공통 벽·목재·폰툰·윤곽색은 유지하되 시설 역할에 따라
  황금/노랑, 테라코타/빨강, 청록, 네이비/차콜을 분배한다.
- 지붕색만 바꾼 같은 상자를 서로 다른 시설 후보로 세지 않는다.

실제 ImageGen 프롬프트 정본은
`/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/references/concept-portfolio.md`의
**Reusable ImageGen prompt**다. 항목 목록만 교체하고, 상태 라벨과 금지 조건은 유지한다.

## 풋프린트와 공통 스케일

게임 계약의 지면 한 칸은 32×16 픽셀이다.

| 풋프린트 | 바닥 다이아몬드 | 정규화 폭 |
|---|---:|---:|
| 2×1 | 48×24 | 0.75 |
| 2×2 | 64×32 | 1.00 |
| 3×3 | 96×48 | 1.50 |

이미지 생성기는 각 셀을 채우려고 큰 시설을 축소하고 작은 시설을 확대하는 경향이 있다.
따라서 섹션 라벨이 맞거나 바닥판이 그럴듯한 것만으로 스케일을 승인하지 않는다. 선택한
시설은 엔진 풋프린트 가이드 또는 3D 재구성 결과와 같은 축척으로 다시 비교한다.

물리 루트가 생긴 뒤에는 옛 sprite canvas 높이에 먼저 맞추지 않는다. 시뮬레이션 `size`와
`tileWorld`에 지면을 균일 스케일로 맞춘 뒤, 고정 카메라의 투영 높이에서 canvas/bodyH/anchor
후보를 파생한다. 현행 canvas fit과 footprint fit을 게임 격자 위에 나란히 보여 사용자에게
크기 결정을 받는다. 상세 계약과 병렬 시설 웨이브는
`docs/assets/pipelines/facility-batch-orchestration.md`가 담당한다.

## QA 표준

| 게이트 | 판정 |
|---|---|
| 요청 수·순서·섹션 | `PASS/WARN/FAIL` |
| 간판 없는 역할 가독성 | `PASS/WARN/FAIL` |
| 시설군 미술 통일성 | `PASS/WARN/FAIL` |
| 지붕·캐노피 색 다양성 | `PASS/WARN/FAIL` |
| 풋프린트 형태 가독성 | `PASS/WARN/FAIL` |
| 공통 월드 스케일 | `PASS/WARN/FAIL/NOT_TESTED` |
| 실제 타일·앵커·런타임 | 콘셉트 시트에서는 항상 `NOT_TESTED` |

시트 전체 상태는 `GPT_CONCEPT_ONLY`로 보관한다. 선택된 개별 시설도 사용자의 명시적 승인과
후속 기술 검증 전에는 `PRODUCTION_APPROVED`가 될 수 없다.

## 2026-08-26 검증 사례

- 원본: `artifacts/asset-concept-sheets/ppaji-facility-footprint-roof-v2.png`
- SHA-256: `79310910068188a9396429580ecdf1fa5e28dd62745dd4c095b06c8bb89771f3`
- 프롬프트 기록: `artifacts/asset-concept-sheets/ppaji-facility-footprint-roof-v2-prompt.md`
- QA: `artifacts/asset-concept-sheets/ppaji-facility-footprint-roof-v2-qa.md`
- Manifest: `artifacts/asset-concept-sheets/ppaji-facility-footprint-roof-v2-manifest.json`
- 상태: `GPT_CONCEPT_ONLY`

이 시트는 12개 시설, 2×1·2×2·3×3 섹션, 풋프린트 형태 가독성, 지붕색 다양성에는
통과했다. 다만 생성기가 행별 시설을 셀 크기에 맞춰 그려 3×3이 충분히 커지지 않았으므로
공통 월드 스케일은 실패다. 즉 디자인 선택에는 쓸 수 있지만 크기·앵커·아틀라스 채택 근거로
쓸 수 없다.

### 실내시설 20종 오픈탑 포트폴리오

- 폴더: `artifacts/asset-concept-sheets/indoor-facilities-v1/`
- 범위: 위생·준비 6, 음식·상점 6, 실내놀이 4, 운영 4
- 제외: 유아풀·온수풀·유수풀·사우나·찜질방·안마의자·선베드
- 콘셉트 상태: 20종 전부 사용자 승인(2026-08-26)
- 4방향 상태: prompt-only 원본 후보 20종은 사용자 검토에서 **전부 무효화**. 투영 검사
  `PASS 0 / WARN 2 / FAIL 17 / ERROR 1`, 단일 물리 루트가 없어 실제 회전은
  `UNVERIFIABLE_NO_PHYSICAL_ROOT`
- 4방향 정본: `artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-manifest.json`
- QA: `artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-qa.md`

수유실의 의료시설 오인과 탁구대의 NPC 베이크를 각각 단일 셀 교정으로 고쳤고, 실패본도
`rejected/`에 남겼다. 하지만 승인 크롭과 풋프린트 가이드만 넣은 ImageGen 4분할은 게임
아이소메트릭 투영도, 동일 물체의 강체 회전도 보장하지 못했다. 이번 실내시설 배치에는 Meshy나
Blender 단일 물리 루트를 사용하지 않았다. 따라서 이전 개별 PASS/CONDITIONAL 판정은 전부
무효다. 실제 제작은 시설별 한 개의 Blender 루트에서 고정 카메라로 d0–d3를 물리 렌더한 뒤,
각 방향의 물리 렌더를 ImageGen 채색 입력으로 사용해야 한다.

탁구대 그림은 양면 이용으로 통과했지만 현재 시뮬 슬롯 둘이 모두 `+Z`다. 런타임 채택 전에
서로 마주보는 로컬 방향 계약으로 고쳐야 한다. 이 변경은 방향 그림 승인과 별도 게이트이며,
현재 라이브 데이터에는 반영하지 않았다.

## 결과 보관과 고도화

새 시트는 `artifacts/asset-concept-sheets/` 아래에 PNG, 프롬프트, QA, manifest를 함께 둔다.
원본 프롬프트 기록이 없으면 재작성본을 원본이라고 부르지 말고 `unavailable`로 기록한다.
버전을 덮어쓰지 않고 새 파일명으로 보존한다.

검증에서 반복 가능한 규칙이 확인되면 `$ppaji-kairo-assets`를 먼저 갱신하고 이 문서에 빠지
타이쿤의 실제 수치·경로·사례를 반영한다. 일회성 실패는 QA에만 남기고 전역 규칙으로
과잉 일반화하지 않는다.
