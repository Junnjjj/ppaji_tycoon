# 실내 개방형 제작본 — 메인 건설 적용 (2026-09-20)

사용자 승인에 따라 main의 `ppaji` 게임(5189)에 건설 카드·배치 미리보기·배치 외형을 적용했다. NPC 출입/이용, 보상·경제·시작 맵 구성은 이번 작업 대상이 아니다. 아래 계약과 동작 샘플은 **비활성 인계 데이터**이며 게임에서 import하지 않는다.

## 적용 목록

| 원본 ID | 메인 건설 ID | 제작 크기 | 기존 배치 |
|---|---|---|---|
| locker_row | authored_locker_row | 4×2 | 기존 4×1 보존 |
| infirmary | authored_infirmary | 3×2 | 기존 2×2 보존 |
| shower_row | authored_shower_row | 4×2 | 기존 4×1 보존 |
| changing_row | authored_changing_row | 3×2 | 기존 3×1 보존 |
| karaoke | authored_karaoke | 3×3 | 기존 2×2 보존 |
| sauna | sauna | 3×3 | 외형만 교체 |
| jjimjilbang | jjimjilbang | 4×4 | 외형만 교체 |
| office | office | 2×2 | 외형만 교체 |
| info | info | 2×2 | 외형만 교체 |
| indoor_shop | indoor_shop | 2×2 | shop 별칭을 자체 개방형 매점으로 교체 |
| vending_in | vending_in | 1×1 | 외형만 교체 |
| arcade | arcade | 1×1 | 외형만 교체 |

새 5종은 `variantOf`로 원본 해금을 상속한다. 비용·정원·이용 시간 등은 원본과 같다. 잠긴 제작본도 목록에 표시하되 잠금은 유지한다. 신규 저장 마이그레이션은 없다. 특정 ID를 직접 비교하는 시설 고유 시스템은 새 ID에도 동작하도록 **다음 시스템 세션에서 확인**해야 한다.

## 렌더 정본

- `ppaji/public/assets/approved-facilities/manifest.json`, 각 ID의 `native-d0..3.png`.
- `indoor-provenance.json`: 원본 모델 SHA, 원본↔게임 ID, 프레임 SHA, 재개방 렌더 QA, 제작 계약.
- 원본은 에셋만들기_v3의 `assets/generated/kairo-v4-simple-pilot/indoor-open-v2/runtime/assets/<원본ID>/native-dN.png`. 물리 전체 벽을 그린 `physical-dN.png`나 개별 모델 `review/native-dN.png`로 바꾸지 말 것.
- 192×192, 타일 32×16, 앵커 (96,107.75755076535926), 스케일 1. 발자국 피벗은 방향에 맞춰 전치한다.
- `renderOnly: true`: 기존 이용 로직 유지. manifest의 entry/exit 영벡터는 이 렌더 전용 등록 형식의 자리표시자다. 실제 출입 데이터는 아래 interaction.json이다.
- 재반입: `python3 tools/assets/adopt-indoor-open.py /absolute/path/to/에셋만들기_v3`. 이전 `adopt-selected-buildings.py`는 지붕형을 다시 덮어쓸 수 있으므로 재생성 시 **실내 importer를 마지막에 실행**한다.
- `previous-manifest.json`은 변경 전 참조. 다른 세션의 추가 변경이 있을 수 있으므로 전체 덮어쓰기 방식으로 롤백하지 말 것.

## 다음 시스템 세션 작업

1. **메인 회전 시스템**: 현재 `PlacedFacility.facing`, 배치 UI, 저장/발자국 로직은 0/1이다. 정사각형 시설은 기존 UI가 회전 버튼도 숨긴다. 4방향 PNG는 모두 준비·로드되어 있으나 사용자 건설 UI의 4방향 회전은 아직 지원되지 않는다. `facings:4` 메타데이터만으로 이 제약이 해소되지 않는다. 0..3 타입, 홀수 방향의 w/d 전치, 이동·저장·출입·깊이 정렬을 함께 연결해야 한다.
2. 각 게임 ID 폴더의 `interaction.json`: entry, slots.position, heading, approach, obstacles. 내부 id는 원본 ID이므로 위 표로 매핑한다. review-contract.json도 같이 보관했다.
3. 좌표는 중앙 원점 Blender XY 타일 단위. Game I=X, J=-Y, facing 회전 R(I,J)=(J,-I), 이후 해당 방향의 footprint pivot을 더한다. Z는 높이이며 입구·이용 방향도 동일한 회전으로 변환한다.
4. 방 구조는 실제 벽 4면과 앞(-Y) 출입구를 보유한다. 카메라 쪽 두 벽의 **표시만** 생략한다. 화면에 안 보이는 벽을 출입 가능 면으로 취급하면 안 된다. 매점은 사방 개방형 지붕+기둥+카운터 구조다.
5. `motion.mjs`는 시연용 로컬 샘플. approach 끝까지 걷고 sit/lie 슬롯으로 즉시 전환, 이용 후 approach로 즉시 복귀한다. **앉거나 눕는 자세로 미끄러지게 보간하지 않는다.** stand는 기존 NPC idle로 대응한다. 정원과 저자 슬롯 수는 자동으로 같아지지 않으므로 예약/대기/배분 규칙은 별도 연결한다.
6. `depth-dN.bin`, `support-dN.bin`은 192² float32, `depth-metadata.json`에 카메라/방향/벽 마스크 정보. 기존 수상기구 full-dN.bin 형식으로 이름만 바꿔 넣지 말 것. NPC의 일부 후면 가림은 의도된 구조이며 기존 시연의 가림 처리를 검토해 연결한다.
7. 기존 작은 5종 배치는 자동 확대·교체하지 않는다. 출입 및 고유 기능을 연결할 때 원본과 variantOf를 함께 처리한다. 시작 맵 재배치는 사용자 별도 지시가 필요하다.

## 검증

- 메인 정적 서버 PID cwd가 main/ppaji임을 확인하고 최신 dist 빌드 후 5189에서 검사.
- 건설 실내 목록에서 12종 카드와 실제 그림 확인, 전 종 d0~d3 로드 확인.
- 실제 Phaser 장면에서 12종×현재 지원 2방향의 placed/ghost 텍스처·좌표·앵커 일치, scale=1. `browser-render-checks.json`.
- 격리 브라우저에서 authored_shower_row를 실제 게임 placeFacility로 (38,8)에 건설 성공. 사용자 저장은 저장하지 않았다.
- 이미지/앵커, 데이터, 해금·구형 배치 저장/복원, 건설 탭 관련 테스트 97개 통과. build(typecheck 포함), lint, UI 검사 통과.
- 원본 QA의 래스터 투영 진단 경고를 기하 전체 PASS로 바꾸지 않는다. 사용자 승인된 컷어웨이와 재개방 일치 증거를 그대로 보관(`source-final-qa.json`, `source-README.md`).

## 워커 정리

사용자 요청으로 현재 에셋 워크트리에서 미사용 업데이트 대기 창 6개와 완료된 indoor-open-v1 워커 1개를 종료했다. 모두 `ptyKilled: true` 확인. 현재 대화 1개와 시연 서버 62120/62121만 남겼다. 상세는 worker-cleanup.json.

전체 회귀 590개 실행 결과 588개 통과, 시설 수와 소원 원본 수를 하드코딩한 2개 검사 실패. 새 제작본을 반영해 테스트 기대값만 수정한 후 해당 2개 파일 전체 재실행 통과(게임 로직 변경 없음). 초기 전체 실행과 수정 후 로그는 full-test-run.log, corrected-test-run.log에 보관.

## 2026-09-20 후속 건설 목록 정리

사용자 요청으로 `currentBuildCatalog()`가 수유실(nursing), 창고(storage), 실내 기구 거치대(gear_rack)를 건설 목록에서 제외한다. 승인된 authored_* 제작본 11종의 원본 항목도 목록에서 제외해 최신 제작본만 보인다. 빠지용 rig_rack은 이번 실내 삭제 대상이 아니다. 원본 정의·저장·기존 배치·해금 조건은 보존한다.

직원 표시 검토: 현재 indoor_shop/info interaction에는 손님 슬롯만 있다. 매점은 staff 생략을 명시했으므로 직원 자리가 이미 완성되어 있다고 가정하지 말 것. 건물 PNG에 직원을 합성하지 않고 별도 NPC idle로 표시하는 방식 권장. 후속 에셋 작업에서 직원 전용 위치·손님을 향한 heading·기둥/카운터/지붕 depth 가림을 4방향 검증한 뒤 별도 staffAnchor 계약을 확정한다. 손님 이용 슬롯/정원을 직원이 점유하지 않게 한다. 이번 건설 목록 정리에서는 직원 위치를 임의 추가하지 않았다.

후속 사용자 지정: 사무실(office), 기념품(souvenir)도 건설 목록에서 제외. 구명조끼 대여소(rental_tube), 드라이룸(dry_room) 2종만 신규 제작 대상으로 확정. 신규 후보 원본은 에셋 워크트리 indoor-service-v1.
