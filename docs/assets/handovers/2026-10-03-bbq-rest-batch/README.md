## 2026-10-03 전체 교체 진행 · BBQ존·평상·그늘막 적용

사용자 목표 “진행해줘 전체교체”를 이어서 authored_bbq_zone / authored_pyeongsang_row / shade_net 각4방향을 실제 메인에 적용했습니다. 전체100종 중 적용23 / 남은77. 전체 목표는 미완료이며 다음은 정자(pavilion) → 파라솔(authored_parasol) → 선베드 열(authored_sunbed_row)입니다. 붕어빵 d1 원본과 코인라커·탈의실의 앞선 승인본을 유지합니다.

BBQ존은 별도 식탁·양쪽 벤치·접시3개·금속화로를 원본 비율과 색감으로 작성했습니다. 첫 렌더의 뒷벤치 가림을 줄이도록 테이블 높이와 벤치 간격을 수정했습니다. 평상은 낮은 받침2개, 각각 목재판9장·다리4개·둥근 청록 방석2개입니다. 그늘막은 네 기둥과 모자, 가운데 처지는 양면 천, 칠한 바닥 홈입니다. 천은 함수로 작성한 곡면이며 물리 시뮬레이션 복원이 아닙니다. 방석은 둥근 닫힌 메시이며 카메라를 향하는 평면이 아닙니다. RGB 전체를 축소하지 않고 2packedpx 윤곽을 적용했습니다. 원본 방향별 판 수·간격·세부 무늬는 공통 구조로 해석했습니다.

검증: BBQ 43접합/38닫힌부품, 평상 56접합/38닫힌부품, 그늘막 20접합/14닫힌부품. 회전 변 길이 불변·잘림 없음. 각 분리 가구의 공간 간격 양수 및 단독24장 연결성 검사. 단독 상단선 BBQ32/평상16구간, 그중 합성화면에서 충분히 노출된 BBQ15/평상12구간 피팅 PASS. 가려진 표본은 합성 선 통과로 계산하지 않았습니다. 그늘막 바닥선8구간 및 실제 천 모서리4곳의 기둥 상단 접촉 확인. AABB 접합은 모든 메시 교차나 모든 내부선·미술95점 자동 인증이 아닙니다.

실게임 후보PNG12/12 일치·저장소 불변, 같은 배치/카메라 원본·교체 맵6장. 승격 후 HTTP12개 해시/승인PNG decoded RGBA 일치, 브라우저 실제 provider와 HTTP WebP12/12 일치, 관련21테스트 PASS. density4 WebP12 + 기존 native12 교체. 앵커·크기·나머지 등록 불변. 백업/receipt approved-bbq-rest-batch-20261003. 원격 push 없음.

[BBQ·평상·그늘막 비교 보고서](http://100.114.231.15:62140/bbq-rest-batch/) · [전체400방향/적용본23맵](http://100.114.231.15:62140/whole-replacement/). 보고서36canvas/9이미지/깨짐·넘침0. 브라우저 TaskSpace43/p1 계속 유지.

재현: bbq-rest-batch-20261003/build.py → render.py surface-spec.json --out candidates → prepare-isolated.py → isolated-table/bench-0/bench-1/grill/platform-0/platform-1.json 각각 렌더 → verify.py → build-report.py. 공통 helper는 food-fire 배치 build.py의 snackbar 시작 전 정의를 읽습니다. build 재실행은 review.json을 후보 상태로 돌리므로 적용 상태 보존. 보고서 builder는 adoption receipt로 적용 배너를 유지합니다.
