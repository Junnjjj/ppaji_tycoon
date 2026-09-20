# 실외 시설·고정 직원 — 메인 연결 인계

최신 후속: [NPC 이동·식탁·모바일 렌더링](NPC-MOTION-FOLLOWUP.md), bundle `main-35nHaY5e.js`. 아래 검증은 최초 연결 기록이며 후속 검증은 별도 문서에 기록한다.

2026-09-20. 사용자 승인: “좋다 적용하자, 다 만족해”, 후속 범위 “NPC 실제 이용까지 포함, 레벨업 규칙은 나중에”. 메인 작업 경로는 `ppaji/`, 실행 포트는 5189. 메인 연결과 기능 검수를 완료했다. 아래 후보 시연 기록과 실제 게임 연결을 구분한다.

## 적용 시설

| ID | 부지 | 실제 NPC 연결 |
|---|---|---|
| playground | 3×3 | 실제 손님 1명 등반·활강·복귀, 외부 대기 3명 |
| pavilion | 3×3 | 실제 손님 4석, 접근·제자리 착석·퇴장 |
| photozone | 2×2 | 실제 손님 2명, 촬영·플래시·퇴장 |
| stage_river_lv1 | 4×3 | 실제 관객 4석 + 고정 공연자 1 |
| stage_river_lv2 | 5×4 | 실제 관객 8석 + 고정 공연자 1 |
| stage_river_lv3 | 6×5 | 실제 관객 12석 + 고정 공연자 1 |
| bungee_jump | 4×4 | 입장·숨긴 상승·준비·팔 든 점프·반동·윈치 회수·퇴장 |

기존 `stage_river` 3×2 저장 배치는 보존한다. 새로운 세 단계 무대는 독립 건설 항목이며 단계 전환·부지 확장·업그레이드 경제 규칙은 추가하지 않았다. 기존 시설 가격·종류를 유지하고, 새 무대와 포토존의 이용 정원·시간을 실제 이용에 연결했다. 번지점프의 물 분사 플래그/AB는 꺼져 있다.

## 직원 조사 결과

안내소 `info`, 실내 매점 `indoor_shop`, 구명조끼 대여소 `rental_tube`, 안전 망루 `watchtower`에 고정 직원 각 1명. 실제 모델의 카운터 뒤·발판 위 좌표와 깊이 데이터를 사용한다. 직원은 GuestStore 방문자나 관객석 예약에 포함되지 않으며 채용·급여 규칙을 새로 만들지 않는다. 기존 `shop`/`snackbar`는 닫힌 지붕·벽 형태로 적절한 노출 근무 위치가 확인되지 않아 제외했다. 지붕/기둥에 의한 실제 가림을 유지한다. 자세한 근거는 `attendants/REPORT.md`.

## 코드와 계약

- `ppaji/src/data/outdoor-facility-contracts.json`: 승인 모델의 로컬 좌표·출입구·동작 경로·좌석 순서.
- `ppaji/src/sim/outdoor-activity.ts`, `guest.ts`, `facility.ts`: 실제 손님의 예약/이용/완료/저장복원, 시설 이동·철거·출구 차단 취소.
- `ppaji/src/render/outdoor-facilities.ts`, `static-facilities.ts`: 고정 카메라 깊이 합성, 실제 손님만 표시, 직원/공연자 분리, 지형 높이 반영, 실패 시 기본 표시 복원.
- `ppaji/src/data/facility-attendants.json`: 고정 직원 좌표·포즈·개별 모델 SHA.
- `public/assets/approved-facilities/<id>/`: 승인 원본 PNG와 depth/support. 직원 전용 데이터는 `staff-` 접두사.
- `npc-v8.ts`: 기존 54외형 및 `cheer_jump` 포즈 선택. 새 NPC 이미지 생성 없음.

새 번지는 파란 줄과 청록 허리/허벅지 하네스를 사용한다. 내부 상승 중에는 몸·줄·효과를 숨긴다. 착석은 좌석에 도착한 뒤 포즈를 즉시 전환한다. 무대 통로는 한 번에 한 손님이 사용하고 정원은 물리 좌석 수를 넘기지 않는다.

## 건설 제외와 호환

사용자가 삭제한 `performing_kairobot`(트로트무대), `footvolley`(족구장), 기존 `stage_river`, `mongol_tent`는 신규 건설 목록에서 제외. 저장 호환을 위해 기존 정의·배치를 보존한다. 다른 세션의 게임 시스템·지형 변경을 덮어쓰지 않았다.

## 원본·검증 이력

에셋 원본: 에셋만들기_v3의 `assets/generated/kairo-v4-simple-pilot/outdoor-play-v1`. 사용자 승인과 28프레임/소스 해시는 `user-acceptance.json`, 미술 후보 기록은 `STAGE-UPGRADES.md`. 과거 raw raster projection FAIL/WARN은 승인 후에도 이력으로 보존한다. 미술 승인과 실제 게임 경로/저장 검증은 별개다. 독립 시연은 62127에 남긴다.

`integration/adopt-main.py`는 최초 아트/건설 반입용 보관 스크립트다. NPC 연결 이후 재실행하지 않는다. 현재 정본은 메인 코드와 계약이며, 후보용 `activity.mjs` 반복 시연을 게임의 실제 방문 상태 대신 쓰지 않는다.

## 브라우저 검증 결과

실제 5189 빌드 `main-kIWj0xll.js`에서 새 일회성 QA 세션으로 수행했다. 사용자 저장 데이터의 localStorage 바이트가 전후 동일함을 확인했다. 테스트용 길/배치는 일회성 메모리에만 만들었으며 실제 시작 지형을 수정하지 않았다.

- 7종 × 현재 게임 지원 2방향 = 14개 실제 Game/GuestStore 방문. 모든 시설에서 입장·각 이용 단계·퇴장, 이용 횟수 1회 완료. `main-npc-browser-qa.json`.
- 정자4·포토존2·무대4/8/12석 × 2방향 = 10개 만석 사례. 실제 GuestStore 방문자로 좌석을 채우고 정상 기본 이용시간에서 고유 좌석·합성 수 일치. `main-crowd-browser-qa.json`.
- 안내소/매점/대여소/망루 4종 × 4방향 = 16개 직원 합성. 실제 고객 0명에서도 표시되며 자산 로드 오류0. `main-staff-browser-qa.json`.
- 지붕·차양·카운터·난간의 물리 가림을 보존한다. 특히 실내 매점 직원과 정자 뒤좌석은 방향에 따라 상당 부분 가려진다. `main-staff-four-facing.png`, `main-crowd-contact-board.png`, `main-npc-contact-board.png`를 직접 검수했다.
- 건설 놀이 탭에서 새 무대3단계·놀이터·번지가 존재하고 트로트무대/족구장은 없음. `main-final-catalog-qa.json`.
- QA JS 오류0, depth 리소스11종 전부 로드. disconnected fixture는 출구가 입구와 연결되지 않았을 때 안전한 도달 가능 타일로 복구하는 별도 경로를 확인한 것이며, 연결된 길의 정상 퇴장 검사와 구분한다.

Orca run `run_d440c50c4fde`: SIM/렌더/직원기하 3작업 모두 succeeded 후 release. `worker-list --terminal-state reclaimable` 결과0. 메인5189와 독립시연62127 서버는 유지한다.

## 최종 검증 / 남은 테스트 도구 제약

TypeScript, ESLint, UI 정적 검사, production build, git diff --check 통과. 기능 집중 검사 199개 통과(실외/포털89, 렌더/NPC16, 건설/배치/장식수8, 갱신 데이터86). 직원 기하 검사4원본/16불변 이미지/32깊이 버퍼 통과. 브라우저 오류0과 실제 방문/정원/직원 검수는 위 증거 참조.

전체 Vitest 실행은 **clean PASS가 아니다**: 121파일/698검사 중 695통과,3실패 및 worker RPC timeout5회,639.80초. 데이터 실패는 변경 전 “decor capacity0” 규칙을 실행한 것으로, 승인된 포토존2/무대4·8·12 예외를 명시하고 데이터86검사를 다시 통과했다. 나머지 P3/G30은 각각69/86초 걸려 기존60초 제한을 넘겼다. 원래 검증식을 그대로 독립 실행한 `long-bot-check.ts`에서는 P3 rank5/deck297/water379, G30 lateSpendRatio0.39162370123155693으로 둘 다 통과(77.127초/103.936초). 테스트 검증식·타임아웃·Vitest 내부를 완화하지 않았다.

`onTaskUpdate` RPC 시간초과는 전체 실행 도구의 미해결 제약으로 기록한다. 앞선 통합 전 전체 실행에도 동일 시간초과3회가 있었다. 단위/독립 봇 검증 통과와 전체 명령의 clean PASS를 혼동하지 않는다. 자세한 원문은 `main-full-tests.log`, `long-bot-check.log`, 구조화 결과는 `validation.json`.

브라우저 QA task184 종료 완료. 사용자 저장은 보존했고 임시 테스트 지형/방문자는 저장하지 않았다. 5189와62127 서버는 유지. 레벨업 규칙과 이번 조사에서 제외한 닫힌 지붕 매점/분식 직원은 추가 구현 대상에 포함하지 않았다.
