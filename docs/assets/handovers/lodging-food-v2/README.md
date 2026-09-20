# 펜션·카페·먹거리 11종 메인 채택 (2026-09-20)

사용자 승인: “좋다 적용하자, 다 만족해”. 원본은 에셋만들기_v3/assets/generated/kairo-v4-simple-pilot/lodging-food-v2. 거절된 lodging-food-v1은 사용하지 않는다. 실행 대상은 main/ppaji, 포트 5189의 dist이다.

## 반입 범위

- 펜션 1층(pension_1f), 2층(pension_2f), 3층(pension): 모두 5×4. 1·2층 차콜 박공지붕, 3층은 전통 펜션 2층 위 유리 풀빌라 1층. 승인 후 차양 수정본이다.
- 카페 1·2·3단계(cafe/cafe_lv2/cafe_lv3): 모두 3×2. 3단계는 2층 유리 카페이다.
- 아이스크림, 식혜·계란, 붕어빵, 화로대 열, 치킨: 승인 그림으로 교체. 11종×4방향 native PNG 총44개.
- 새 단계 4종을 부모와 함께 건설 목록에 표시한다. 기존 배치·크기·지형·잠금·경제 규칙은 보존한다. 신규 단계는 부모의 설정을 계승한다. 카페2/3 메뉴 궁합과 펜션1/2 투자 해금 목록도 같은 부모에 연결했다. 시설 정의 총210종.
- 카페·펜션 6종의 출입 동작은 실제 GuestStore에 연결한다. facility-portals.json의 물리 문 좌표가 단일 기준이다. capacityOf(def,placed)로 예약/정원을 판단하고 문턱 안에서 사람과 부가표시를 숨긴다. 같은 문으로 나온다.

## 시스템 연결 경계

건물 단계별 외형은 독립 건설 카드다. 층/단계별 새 업그레이드 비용·정원 규칙은 별도 시스템 작업 대상이다. 기존 시설 level 개선은 기존 함수를 따른다. 현재 게임 건설 방향은 facing 0/1이며 4방향 PNG 반입이 4방향 건설 구현을 뜻하지 않는다.

먹거리 5종은 현재 게임의 기존 외부 이용 동작을 유지한다. 독립 시연의 세부 창구 접근점·직원·화로 불꽃 효과를 실제 게임까지 연결했다고 간주하지 않는다. 이를 추가할 때 per-facility interaction/depth/support 계약을 사용한다. 시연 runtime/portal.mjs는 경제 엔진을 복제해 이식하지 않는다.

## 원본·검증 자료

public/assets/approved-facilities/lodging-food-provenance.json: 원본 SHA, 44 PNG SHA, 사용자 승인, 보존된 진단. 이 문서와 같은 폴더 각 ID 하위: interaction/depth/support/source/visual/roof 계약. 후보 coordinator/adoption-art-audit.{json,md}: 11개 실제 Blender 원본과88개 이미지 독립 감사.

래스터 선 검출은30 PASS/11 FAIL/3 WARN 원문 그대로 보존한다. 해시가 지정된 이번 원본은 독립 카메라 행렬·32×16 투영·회전·RGBA·실루엣·클리핑 검사 및 사용자 시각 승인으로 채택했다. 전체 래스터 PASS라고 보고하지 않는다.

기존 저장은 자동 철거/재배치하지 않는다. 원복할 때는 integration/pre-adoption 백업을 참고하되 다른 시스템 작업을 덮어쓰는 통째 복원은 금지한다. importer integration/adopt-main.py는 승인 원본만 병합한다. 승인 시점 source와 이후 변경은 다시 구분해야 한다.

## 최종 실행 검증

타입·lint·UI검사 및 빌드 통과. 전체 118파일/630검사 통과(프로세스 동시2). 메인 12개 ID/방향 조합에서 실제 출입/정원/숨김 및 같은문퇴장 확인, 숨긴 actor/부가표시 오류0. 44개 HTTP 이미지 승인 해시 일치. main-adoption-qa.json 참조.

후속 사용자 지시로 건설8탭 정리 완료. 복층펜션/옛 선착장/편의5종 제외, 탁구·화장실 실내, 족욕 자리, 해태분수 장식, 공연무대 놀이. catalog-followup-qa.json과 ../../plans/2026-09-20-play-photo-stage.md 참조. 놀이터/포토존/공연 NPC는 다음 설계이며 아직 제작하지 않았다.
