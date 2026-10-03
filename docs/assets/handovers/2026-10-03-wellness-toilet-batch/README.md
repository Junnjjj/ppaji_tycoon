## 2026-10-03 전체 교체 진행 · 안마의자·족욕·화장실 적용

사용자 목표 “진행해줘 전체교체”를 이어서 authored_massage_row / authored_footbath / toilet 각4방향을 실제 메인에 적용했습니다. 전체100종 중 적용29 / 남은71. 전체 목표 미완료. 다음은 사우나(sauna) → 찜질방(jjimjilbang) → 안내소(info). 붕어빵 d1 원본과 코인라커·탈의실 앞선 승인본 유지.

안마의자는 둥근 파란 좌판·기울어진 등받이·발받침과 금속 팔걸이/지지대의 세 자리입니다. 첫 후보에서 과도한 뒷다리 벌어짐·등받이 위 금속 돌출·팔걸이 받침 틈을 수정했고, 뒤 가로대 끝점은 등받이 프레임의 실제 기울기에서 계산했습니다. 족욕은 크림 테두리 청록 수조와 목재 벤치, 깊이 색과 잔물결을 칠한 불투명 물 표면입니다. 화장실은 빨강/파랑 문·손잡이·측면 환기구·크림 벽/파란 하부 띠·긴 파란 지붕 패널입니다. 원본의 방향별 세부 차이는 고정된 공통 배치로 해석했으며 숨은 내부의 정확한 복원을 주장하지 않습니다.

검증: 안마의자168접합 검사(경계상자+금속 중심선 거리 검사 포함)/69닫힌부품, 족욕22접합/19닫힌부품, 화장실58접합/52닫힌부품. 회전 변 길이 불변·잘림 없음. 금속 튜브 접합은 실제 중심선 최단거리와 반지름합을 추가 확인했고 다리 끝 높이를 검사했습니다. 분리 의자3개와 벤치/수조의 단독20장 연결성 및 간격 확인. 안마의자 아래 수평받침12선 중 합성 노출8선, 족욕 단독16선 중 합성 노출14선, 화장실 바닥8선 PASS. 화장실 기둥/경사지붕 접촉 확인. 모든 내부선·곡면·미술95점 자동 인증이 아닙니다.

실게임 후보PNG12/12 일치·저장소 불변·같은 배치/카메라 원본·교체맵6장. 승격 후 HTTP12개 해시/승인PNG decoded RGBA 일치, 브라우저 실제 provider와 HTTP WebP12/12 일치, 관련21테스트 PASS. density4 WebP12 + 기존 native12 교체. 앵커·크기·나머지 등록 불변. 백업/receipt approved-wellness-toilet-batch-20261003. 원격 push 없음.

[안마의자·족욕·화장실 비교 보고서](http://100.114.231.15:62140/wellness-toilet-batch/) · [전체400방향/적용본29맵](http://100.114.231.15:62140/whole-replacement/). 보고서36canvas/9이미지/깨짐·넘침0. 활성 TaskSpace43/p1 유지.

재현: wellness-toilet-batch-20261003/build.py → render.py surface-spec.json --out candidates → prepare-isolated.py → isolated-chair-0/chair-1/chair-2/basin/bench.json 각각 렌더 → verify.py → build-report.py. helpers는 food-fire 정의와 bbq-rest rounded 함수를 읽고, materials.py는 food-fire material을 가져와 기울인 쿠션의 역좌표와 물·문 도색을 추가합니다. build 재실행은 review.json을 후보 상태로 돌리므로 적용 상태 보존. 보고서 builder는 adoption receipt로 적용 배너를 유지합니다.
