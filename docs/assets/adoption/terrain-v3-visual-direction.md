# Terrain v3 시각 방향 결정 기록

결정일 2026-08-27, 라이브 채택 갱신일 2026-09-01. 이 문서는 지형·물의 **시각 방향 승인과
no-radius source-v1 라이브 채택**을 기록한다. source-v1 재질 채택을 아직 승인되지 않은
곡선 해안 에셋의 제작·QA 통과로 확대 해석하지 않는다.

## 사용자 승인 범위

| 항목 | 결정 | 근거 |
|---|---|---|
| 잔디·모래·돌·데크·물·절벽의 색과 질감 | source-v1 유지 | 사용자가 source-v1 적용 결과를 현재 방향과 맞다고 확인 |
| 런타임 해상도 | 논리 32×16 유지, density 4 | 실제 맵 terrain-v3 후보에서 기술 검증 완료 |
| 해안 형태 | B처럼 여러 칸에 걸친 곡선과 연속 포말 | 축소 B 이미지를 확인한 뒤 “그걸로 하자” 승인 |
| 구현 방식 | 격자 좌표에서 추출한 연속 경계의 코너 반경 파일럿 | 8종 반복 오버레이를 우회하고 볼록·오목 코너를 같은 경계에서 처리 |

## 증거와 해시

| 역할 | 파일 | SHA-256 |
|---|---|---|
| 재질 시각 정본 | `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/terrain-master-source-v1.png` | `3e3f5b6d5d7df6ad159926aea379a5edf6ceef6915d06d4fcf00f505ea50a3d8` |
| B형 곡선 해안 원본 | `artifacts/asset-concept-sheets/terrain-v2-pilot/attempt-b-map-target.png` | `b418a03b616d14f92404fc1e82e7b354f4f69fc1be0c1b42f777d717abb98c6d` |
| 사용자 확인용 B 축소본 | `artifacts/asset-concept-sheets/terrain-v2-pilot/attempt-b-map-target-preview.png` | `2e25d467e65e96ee1140e5f085bec30e64d48a3a8bb489396f4a66801d79e92b` |
| 현재 실제 맵 후보 | `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/runtime-map/terrain-v3-source.png` | `9274bff3a58843f42b6bbc4463de5786662452d199d2b2c8bc40dfe9e68c79ad` |
| 현재 라이브 팩 | `public/assets/kairo-terrain-v3-source/manifest.json` | `73391fc1243d01f795e633e26834559c38f84e0f68074e7295d44f4481127098` |
| 반경 비교 축소본 | `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot/shore-radius-r050-r075-r100-preview.png` | `69815792b610da89f5d9a0ac6649d2f394023e5c905c060034a6a177b24fa107` |
| 반경 파일럿 증거 | `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot/evidence.json` | `230b29f432afea5f6bd278f9a64904ec5782c8b5c3492a56a502b2bc6d338e64` |
| 반경 파일럿 QA | `artifacts/asset-concept-sheets/terrain-v3-high-quality-source/shore-radius-pilot/qa.json` | `581a2292e7cc834fc8a1ddb17c71fac38759ef18489633a91620f716f44c3105` |

## 승인과 미완료의 경계

source-v1 재질과 B를 목표로 삼는 결정은 유지한다. 그러나 2026-08-27의 첫 8종 오버레이
런타임 구현은 사용자가 시각 거절했다. 현재 매크로 해안 구현 상태는
`FAIL_USER_VISUAL_REJECTION`이다.

거절 근거:

- 긴 자연 곡선이 아니라 한 칸마다 반복되는 둥근 물결무늬로 읽힌다.
- 모래·포말의 반복 주기가 B의 연속적인 해안 리듬과 다르다.
- start/mid/end 연결의 기술 PASS는 실제 맵의 시각 품질을 보장하지 못했다.

거절 증거는
`artifacts/asset-concept-sheets/terrain-v3-high-quality-source/runtime-map/terrain-v3-macro-shore-rejected-v1.png`
이며 SHA-256은
`7d43cd2e62d80824c20ea4b7eee8304682c5f12f026ab577f146a43bd91567db`다.

승인된 것은 source-v1 재질과 B형 곡선 해안의 **목표 방향**이다. 아직 승인되지 않은 것은:

- 8종 매크로 해안 오버레이 원본과 추출물;
- start/mid/end 및 코너 접속 QA;
- 곡선 해안을 적용한 새 실제 맵;
- 시간 기반 P0–P3 물 재생;
- 거절된 8종 오버레이 또는 radius 후보를 기본 공급자에서 활성화하는 변경.

다음 작업은 이 8종을 다듬는 것이 아니라, B의 긴 곡률을 먼저 한 장의 연결된 해안 스트립
또는 더 큰 마스크로 증명하는 교체안이다. 정지 게이트는
[지형·물·곡선 해안 제작 파이프라인](../pipelines/terrain-ground-water.md)의
`ROUNDED_SHORE_RADIUS_USER_REVIEW`를 따른다.

2026-08-27에 이 교체안을 R=0.5/0.75/1.0으로 실제 맵에 구웠다. 음성 대조군 R=0에서는 곡선
구간이 0이고, 세 후보에서는 곡선 구간·반경 샘플이 순차적으로 증가했다. 하지만 현재 상태는
`PASS_TECHNICAL_USER_REVIEW_PENDING`이다. 사용자의 반경 선택 전에 시각 PASS나 라이브 채택으로 올리지
않는다.

## 2026-09-01 라이브 채택

사용자가 새 땅·물 적용 결과를 선택했고 이후 radius를 빼도록 명시했으며, 기본 맵이 그대로라는
지적과 함께 실제 적용을 요청했다. 이에 source-v1 재질 팩만 기본 공급자로 승격했다.

- 기본 URL에서 density-4 source-v1 지형 32개를 읽는다.
- `shoreRadius`는 기본값에서 `undefined`다.
- 시각 거절된 `overlay/shore_curve_*` 8개는 공급자 목록과 네트워크 요청에서 제외한다.
- 실제 기본 URL 검증에서 terrain-v3 PNG 32개, 거절된 macro 요청 0개, 캔버스 부팅 1개를 확인했다.
- radius와 B형 장거리 곡선 해안은 별도 후속 트랙이며 이번 채택 범위가 아니다.
