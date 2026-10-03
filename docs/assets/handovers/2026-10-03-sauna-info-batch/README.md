# 사우나·찜질방·안내소 메인 교체

## 2026-10-03 전체 교체 진행 · 사우나·찜질방·안내소 적용

사용자 목표 “진행해줘 전체교체”를 이어서 sauna / jjimjilbang / info 각4방향을 실제 메인에 적용했습니다. 전체100종 중 적용32 / 남은68. 전체 목표는 미완료입니다. 다음은 의무실(authored_infirmary) → 노래방(authored_karaoke) → 매표소(compact_ticket). 붕어빵 d1 원본과 코인라커·탈의실 앞선 승인본 유지.

사우나는 황금색 판벽·긴/짧은 벤치·수건·돌10개 히터와 목재 안전 난간입니다. 찜질방은 납작한 매트3/베개3/주황 히터3와 수건함·온도계입니다. 두 실내는 고정된 벽4개 중 카메라 앞쪽 벽2개와 부착된 문/몰딩만 생략하며 가구는 이동하지 않습니다. 문은 고정 v1 벽에서 d2/d3에 보입니다. 원본의 내부 단면 표시를 유지한 렌더 규칙이며 완전한 외벽 표현이나 숨은 원본 구조 복원이 아닙니다. 안내소는 별도 목재 카운터·청록 띠·책자·두 기둥 안내판으로, 모든 방향에서 같은 높이를 유지합니다. 안내판 지도는 원본 색과 도형을 참고해 새로 칠했으며 글자 전사가 아닙니다.

첫 출력의 과밀한 판재 무늬·부푼 매트·약한 청록 띠를 수정했습니다. 넓은 RGB를 통째로 축소하지 않고 선/커버리지에만 기존2packedpx 마감을 적용합니다. 검증: 사우나85접합/64닫힌부품, 찜질방50접합/50닫힌부품, 안내소19접합/17닫힌부품. 회전 변 길이 불변·잘림 없음. 실내 벽 노출 규칙/문 연동/고정 가구 정점 해시 검사. 사우나 바닥·단독 벤치24선(합성 노출8), 찜질방 바닥8선, 안내소 단독 카운터·안내판12선(합성 노출10) PASS. 단독 가구16장 연결성과 별도 가구 사이 간격 확인. AABB 접합은 정밀 메시 교차나 모든 내부선·미술95점 자동 인증이 아닙니다.

실게임 후보PNG12/12 일치·저장소 불변·같은 배치/카메라 원본·교체맵6장. 승격 후 HTTP12개 해시/승인PNG decoded RGBA 일치, 브라우저 실제 provider와 HTTP WebP12/12 일치, 관련21테스트 PASS. density4 WebP12 + 기존 native12 교체. 앵커·크기·나머지 등록 불변. 백업/receipt approved-sauna-info-batch-20261003. 원격 push 없음.

[사우나·찜질방·안내소 비교 보고서](http://100.114.231.15:62140/sauna-info-batch/) · [전체400방향/적용본32맵](http://100.114.231.15:62140/whole-replacement/). 보고서36canvas/9이미지/깨짐·넘침0. 활성 TaskSpace43/p1 유지.

재현: sauna-info-batch-20261003/build.py → render.py surface-spec.json --out candidates → prepare-isolated.py → isolated-long-bench/short-bench/counter/board.json 각각 렌더 → verify.py → build-report.py. helpers는 food-fire와 bbq-rest의 rounded 함수를 읽고, materials.py는 wellness/food-fire의 공통 재질에 판벽·매트 마감을 추가합니다. build 재실행은 review.json을 후보 상태로 돌리므로 적용 상태 보존. 보고서 builder는 adoption receipt로 적용 배너를 유지합니다.
