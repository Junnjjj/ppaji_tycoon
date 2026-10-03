# 의무실·노래방·매표소 메인 교체

## 2026-10-03 전체 교체 진행 · 의무실·노래방·매표소 적용

사용자 목표 “진행해줘 전체교체”를 이어서 authored_infirmary / authored_karaoke / compact_ticket 각4방향을 실제 메인에 적용했습니다. 전체100종 중 적용35 / 남은65. 전체 목표는 미완료입니다. 다음은 카라반(caravan) → 방갈로(bungalow) → 글램핑(glamping), 이후 펜션3종. 붕어빵 d1 원본과 코인라커·탈의실 앞선 승인본 유지.

의무실은 목재 침대와 세로 살5개의 머리판, 민트 이불/흰 베개, 약장과 약병/상자, 벽의 의료 표지입니다. 원본에서 벽 위치가 달라지는 약품 선반은 u1 벽으로 정리해 d1/d2에서 보입니다. 노래방은 보라 소파의 좌석 쿠션2개, TV/목재장, 스피커2, 목재 테이블, 마이크입니다. TV화면과 스피커 유닛은 고정된 면에 있으며 뒤에서는 뒤판이 보입니다. 두 실내는 고정 벽4개 중 카메라 앞쪽 벽2개와 부착 문/표지만 생략하고 가구는 이동하지 않습니다. 원본의 단면 표시 규칙이며 숨은 원본 구조의 완전한 복원이 아닙니다. 매표소는 양쪽 창구와 옆창, 지붕 아래 통로, 높이가 다른 입구 기둥2, 파란 맞배지붕과 지지대6개입니다. 창은 불투명 청색 반사면이며 TV무늬도 원본 도형을 참고해 새로 칠했습니다.

첫 출력의 과한 이불 광택·처마의 창구 윗 테두리 가림·소파 옆 스피커 접촉을 수정했습니다. 넓은 RGB를 통째로 축소하지 않고 선/커버리지에만 기존2packedpx 마감을 적용합니다. 검증: 의무실55접합/46닫힌부품, 노래방48접합/42닫힌부품, 매표소87접합검사(경사지붕 높이 검사6포함)/67닫힌부품. 회전 변 길이 불변·잘림 없음. 실내 벽/문 노출 규칙과 고정 가구 정점 해시 확인. 의무실 바닥·단독 약장16선(합성 노출8), 노래방 바닥·단독 테이블16선(합성 노출8), 매표소 바닥8선 PASS. 분리 가구32장 연결성과 공간 간격 확인. AABB 접합은 정밀 메시 교차나 모든 내부선·미술95점 자동 인증이 아닙니다.

실게임 후보PNG12/12 일치·저장소 불변·같은 배치/카메라 원본·교체맵6장. 승격 후 HTTP12개 해시/승인PNG decoded RGBA 일치, 브라우저 실제 provider와 HTTP WebP12/12 일치, 관련21테스트 PASS. density4 WebP12 + 기존 native12 교체. 앵커·크기·나머지 등록 불변. 백업/receipt approved-indoor-ticket-batch-20261003. 원격 push 없음.

[의무실·노래방·매표소 비교 보고서](http://100.114.231.15:62140/indoor-ticket-batch/) · [전체400방향/적용본35맵](http://100.114.231.15:62140/whole-replacement/). 보고서36canvas/9이미지/깨짐·넘침0. 활성 TaskSpace43/p1 유지.

재현: indoor-ticket-batch-20261003/build.py → render.py surface-spec.json --out candidates → prepare-isolated.py → isolated-bed/cabinet/sofa/table/tv/speaker-0/speaker-1/mic.json 각각 렌더 → verify.py → capture-runtime.mjs(기존 TaskSpace43 재사용) → build-report.py. helpers는 food-fire와 bbq-rest rounded, wellness의 tube/tilted_pad를 사용합니다. build 재실행은 review.json을 후보 상태로 돌리므로 적용 상태 보존. 보고서 builder는 adoption receipt로 적용 배너를 유지합니다.
