# NPC·식탁·모바일 렌더링 후속 (2026-09-20)

메인 ppaji/·5189에 적용. 기존 배치·시설 정의·요금은 유지한다.

- 일반 손님도 나이/대여 튜브 여부로 레거시 도트로 바뀌지 않고 승인 V8 인물을 사용한다. 나이/대여품 시뮬레이션은 유지; 별도 아동 체형·튜브 착용 도트 신규 제작은 아니다.
- 일반 수영 방향 갱신, 인접 물칸을 통한 퇴장, 이동 거리 비례 보간. 낙수 복귀의 world Y→game J 방향 부호 수정. 수영 속도 1칸/초, 옛 저장의 2.4도 복원 시 정규화. 긴/수정된 선착장 오르기도 거리 비례.
- 승인 정적 기구 26종의 실제 authored cycle 및 입장·퇴장 거리로 방문 기간을 계산한다. 0.35초 일괄 복귀를 없앴다. 짧은 기존 useTicks로 긴 제작 동선을 잘라 버리던 문제를 수정하므로 실제 이용 시간은 늘 수 있다. 완료 보상은 1회. 시설 이동/철거 시 남은 옛 보간 좌표를 해제한다.
- src/data/static-facility-visits.json은 public/assets/approved-facilities/routes.json visits의 cycle/첫 from/마지막 to와 manifest.pivotByFacing을 추출한 숫자 계약이다. render/static-visit-sample.test.ts가 전체 26종·양 배치 방향·모든 방문 계약을 정본과 대조한다. 아트 재제작 시 함께 갱신해야 한다.

## 피크닉 식탁

에셋 워크트리 assets/generated/kairo-v4-simple-pilot/indoor-picnic-v1/runtime/assets/foodcourt_seat/native-d0..3.png를 메인 승인 팩에 연결. source SHA bdd0ace6c7b2435b48b4f05eb9d51a3dc265b505707c86b6eebad7434deae28a. 고정 3×2 자동 생성·정원 2명 유지, 별도 건설 항목 없음. 전용 벤치 좌석 interaction.json을 새로운 NPC 동작으로 연결하는 작업은 이번 범위에 포함하지 않았다. 기존 식탁 이용 동작을 유지한다. 제작 presentation 8방향 재투영은 통과; raw projection 진단 FAIL 이력은 원본에 남겨 두었다.

## 아이폰 Safari 초록 화면 제보

사용자 캡처는 지도 타일 없이 단색 배경/DOM 메뉴/대화만 보이는 상태. 실제 원인 로그는 확보하지 못했다. 데스크톱 Chrome에서 같은 제트스키 설치·탑승·귀환은 정상이며 오류 재현 안 됨. 메모리/렌더러 연결 손실이 의심되지만 원인 확정으로 기록하지 않는다.

확인된 낭비: 부팅 시 watercraft 480방향을 모두 GPU에 등록(32.375 MiB 픽셀 저장)하고 같은 원본 canvas도 보유. 이제 raw watercraft GPU 등록 없이 합성 결과만 올리며, 원본은 ImageData/깊이로 유지하고 썸네일 canvas만 필요 시 생성한다. 로딩용 canvas는 즉시 해제. 합성 버퍼는 기구별 최근 2방향까지만 유지하고 퇴장 시 canvas/cache를 명시적으로 해제한다. context lost 중에는 게임 시간/씬 갱신을 멈추고, Phaser 복구 후 이전 일시정지 상태를 복원한다. 실제 아이폰 재확인은 필요하다.

Phaser 이벤트 동작 근거: https://docs.phaser.io/api-documentation/event/renderer-events (LOSE_WEBGL/RESTORE_WEBGL). 원인 확정 없이 이 문서를 모바일 기기별 메모리 한도의 근거로 사용하지 않는다.

이전 전체 테스트의 RPC/장기 실행 시간초과 기록은 README에 유지한다. 이번 집중 검증은 별도 로그와 아래 브라우저 증거를 참조한다.

## 검증 결과

- 최신 bundle main-35nHaY5e.js, main 5189.
- 타입/린트/UI/빌드 통과. 집중 12파일 176 tests 통과(npc-table-mobile-tests.log). 별도 course.test.ts 17 tests도 앞선 검사 통과. 최종 추가 변경은 시설 GPU 선등록 생략이며 facilityTexture()의 기존 필요 시 등록 경로를 사용한다.
- 승인 시설을 미리 전부 GPU 등록하는 것도 중단했다. 실측 TextureSource 크기 합(실제 GPU 할당량 계측이 아닌 RGBA 픽셀 크기 추정): 종전 약174.7 MiB → 초기95.67 MiB. 480개 raw 기구 텍스처는 0개. 선착장 제트스키·탑승·주행2400ticks 및 프레임별 합성 오류0.
- 브라우저 WEBGL_lose_context 강제 중단: frozen=true, tick 유지. 복구 후 맵 정상, 원래 일시정지/실행 상태 양쪽 보존. 393×730 DPR3 화면도 검수(Chrome 에뮬레이션, 실제 Safari 검증은 아님).
- NPC 나이8/30/65·float0/1/6·일반/수영/이용27조합 전부 V8. 식탁4방향 art provider 확인, 기존 초기 식탁2개 표시. bench 전용 동작은 미연결.
- 브라우저 코스 적용은 격리 QA 저장에 기록되므로 종료 전 원래 localStorage를 복원했다. 사용자의 실제 Safari 저장은 접근하거나 수정하지 않았다.
