> 과거 기록입니다. 현행 상태는 [CURRENT](../../CURRENT.md)를 따릅니다. 본문 경로·서버 주소는 당시 기준이며 원본 자료는 워크트리 보관본을 참조하세요.

## 2026-09-29 전체 시설 재검수 — 이전 검수 한계 정정

141 재지적을 계기로 현재 MAIN 정적100종400방향 모두 기준 원본 대조 및25개 전체 비교판 육안 확인. 수치상72종175방향 추가 검토 신호(확정 오류 수 아님), 우선18종. 141 D0 폭23%축소/D2 폭8%축소/D3 높이6%차이를 고해상도 물리가이드와 재확인. 기존 art.mjs의 원본 bbox 내부 균일fit이 생성본 종횡비 불일치를 통과시킨 경로 재현;164/169도 동일 경로 축소 확인. 실배치좌표 이동만으로 해결 불가. 메인 에셋 변경/추가생성 없음. 전체 접점·NPC/부품별 물리 검증 완료 아님. [보고서](../../codex-output/facility-reaudit-20260929/README.md), [비교판](../../codex-output/facility-reaudit-20260929/index.html). 이전 반영37종59방향은 역사적 적용 수이며 현재 물리 승인 수가 아님.

## 2026-09-27 시설 수정·재검수 메인 반영

전체100종400방향 감사 후 45종 수정 대상 검토. 최초+최대2회 재시도와 독립 검수를 거쳐 37종59방향을 실제 MAIN에 반영했다. 19종 지적 사항 수정 완료, 18종 부분 수정, 7종 미해결 원본 유지, 1종 변경 불필요. 잔여 문제 총25종36방향(미세 각도 검토 포함), 전체 물리 회전 인증 아님. 전체400파일 및 public/dist/HTTP, 실제 브라우저59텍스처 검증 통과. 341방향·논리 배치 기준 보존. 이전 감사의 “에셋 수정 없음”은 이 반영 전 기록이다.
[메인](http://100.114.231.15:5189/?preview=arrival&showcase=1&events=0&ground=imagegen&v=facility-corrections-20260927) · [전후 비교·잔여 문제](http://100.114.231.15:62139/corrections/?v=final-59b) · [상세 보고서](../../codex-output/facility-corrections-20260927/README.md). Run `run_83e5fdbf9eca`, 세 worker 종료·해제 완료.

## 2026-09-27 전체 시설 방향·경계 병렬 감사

현재 MAIN 정적 시설100종×4방향400개 해시 대조 및 3개 Orca 작업자 독립 시각 검토 완료. 방향·부품 불일치19종, 부분 각도 검토28종/42방향, 경계 대비 검토4종(찜질방·돌담3종). 항목은 중복되며 전체 문제/검토 대상45종. 경계선 자체 누락으로 새로 확정한 시설은 없음. 시소·선베드·미니슬라이드 외 출렁다리/해먹 D2·D3, 망루 D1·D3, 호텔/가로등 등 방향 대응 문제가 추가 확인됨. 에셋 수정은 하지 않았으며 카메라/강체 회전 인증은 아님.
[전체 비교 및 근거](http://100.114.231.15:62139/direction-audit/) · [상세 보고서](../../codex-output/facility-direction-audit-20260927/README.md). Run `run_d9fbf5649102`, 세 Task succeeded, 미정리0. 이후 수정은 확정19종과 미확정 각도 후보를 구분해 진행할 것.

## 2026-09-26 메인 선명도·시설 앞 테두리 수정

실제 main `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/ppaji`에 반영. 4x 에셋을 작은 프레임버퍼로 줄인 뒤 픽셀 확대하던 최종 표시를 2x 논리 해상도 렌더링으로 변경. 찜질방/실내매점 앞 테두리를 평지 타일이 덮는 현상 재현 후 level0 지면 깊이 수정. 높이 있는 타일은 기존 깊이 유지. 상세/검증 `codex-output/main-quality-boundary-20260926/README.md`. 아래 오래된 “메인 미변경” 기록은 현재 적용 상태가 아님.
[수정된 메인](http://100.114.231.15:5189/?preview=arrival&showcase=1&events=0&ground=imagegen&v=detail-floor5)

## 2026-09-26 마지막 수상기구30 + 입구31 검토본 적용

검토용 통합맵130종 전체 새 렌더러 연결. 이동기구30×16방향 + 매표소4방향. 기존 물리 모델/좌석/견인 소켓에 공유 ImageGen 재질·팔레트를 적용한 4x 렌더 직접 축소. 주행·견인·기존 반동/낙수 및 매표소 창구→스캐너→통로 NPC 시연. 메인 미변경, 이번31종 사용자 시각검토 대기. 기구별 전용 승하선/접촉 포즈·비행/회전은 기존 미해결 상태 유지.
[전체](http://100.114.231.15:62139/inventory/asset-map.html?all=1&v=final1) · [수상기구](http://100.114.231.15:62139/style-watercraft-batch/) · [입구](http://100.114.231.15:62139/style-entry-batch/). 상세 `codex-output/footprint-spacing-review-20260925/style-watercraft-batch/README.md`. 이전 아래의 남은31종 문구는 이 검토본으로 대체.

## 2026-09-26 빠지·수상25종 사용자 승인

최종 파란 데크/망루 정렬과 NPC시연 승인, 통합 검토맵 유지 및 승인필터 추가. main/atlas 미변경. `style-ppaji-batch/user-approval.json` 참조. 이번 스타일교체 미대상31종: 견인23, 수상장비·견인선7, 입구 매표소1.

## 2026-09-25 빠지 데크 파란색·망루 겹침 수정

사용자 요청으로 부유 데크 재질을 레거시 계열 파랑으로 변경. 24종96방향 알파 동일, 연결/NPC 좌표 그대로. 연결맵 같은칸 데크→망루 정렬 보정으로 다리 가림 해결. 추가 ImageGen 호출 없음. [확인](http://100.114.231.15:62139/style-ppaji-batch/?v=deckblue2).

## 2026-09-25 빠지·수상25종 연결/NPC 검토본

141–150·156–170: 공통 물리 모델 + 새 ImageGen 표면/팔레트, 고해상도 직접 축소. 143은144두칸 같은 바닥, 144 끝점·높이 공유. 141/142 및 핵심6종을 연결한 별도맵/NPC시연. [연결배치](http://100.114.231.15:62139/style-ppaji-batch/) · [25종](http://100.114.231.15:62139/inventory/asset-map.html?group=ppaji). 통합맵99개교체/전체130종. 메인미변경. 상세 `codex-output/footprint-spacing-review-20260925/style-ppaji-batch/README.md`. 사용자 시각검토대기.

## 2026-09-25 숙박·놀이 11종 검토본 완료

먹거리·휴식18종 사용자 승인 유지. 숙박6+놀이5의4방향/NPC 시연을 같은 통합맵에 추가:44렌더러,전체130종. 새맵 `http://100.114.231.15:62139/inventory/asset-map.html?group=lodging-play`,비교 `http://100.114.231.15:62139/style-lodging-play-batch/`. 펜션 기단/옥상유리벽 수정. 무대3 의자 수/배치 및 번지d2 착지 접점 등 시각 차이는 사용자 검토 대기. 상세 README: `codex-output/footprint-spacing-review-20260925/style-lodging-play-batch/README.md`. 메인게임/라이브atlas 미변경.

# 2026-09-25 먹거리·휴식18종 사용자 통과 · 숙박/놀이 다음 작업

사용자가 먹거리52–62·휴식63–69 검토본 통과를 명시. 기존 통합 배치에 승인본으로 유지. `style-food-rest-batch/user-approval.json` 기록. 다음 대상은 현재 목록의 숙박6종(70,71,73–76;72옛몽골텐트 제외 유지)·놀이5종(77–81). 같은 생성 원본 직접축소/4방향/NPC 이용 시연 방식. 메인 게임 통합은 이번 배치 작업 범위와 별도.

# 2026-09-25 먹거리·휴식 ImageGen 4방향 + NPC 검토본 완료

사용자가 지정한 먹거리52–62(11종)·휴식63–69(7종)를 Orca 두 작업으로 병렬 제작하고 별도 통합 배치 맵에 연결했다. 18종/72개 선택 생성본, 원본 포함144 PNG, 기존 실내15종을 합쳐 이미지젠·NPC33종 로드. 생성 원본 직접 고품질 축소를 유지한다. 4방향×6범위24 배치 검사에서 수량/부지 겹침0, 18종 NPC 전 과정·빈 상태·원본/생성 동일 동선 검사 통과. 두 worker succeeded/released, 미정리0.

[새18종 배치](http://100.114.231.15:62139/inventory/asset-map.html) · [전체130종](http://100.114.231.15:62139/inventory/asset-map.html?all=1) · [번호별4방향비교](http://100.114.231.15:62139/style-food-rest-batch/). 사용자 방향별 수정 요청을 기다리는 CONCEPT_DIAGNOSTIC_ONLY. 56/57 카페 후면 유리 발명,63 그늘막 바닥 패치는 수정했으나52콘모양·53용기구성/뒷판·69욕조색 등 차이와 일부 근사 가림/접지 잔존. 메인게임/atlas/저장 미변경. [상세 결과](../../codex-output/footprint-spacing-review-20260925/style-food-rest-batch/README.md).

# 2026-09-25 실내 수정본 승인·번호별 단계 적용

사용자가 최신 실내 수정본과 직접축소 표시를 승인. 별도 전체130종 배치 맵에 현재15종 후보가 적용되어 있으며 다음 대상은 기존 reviewNo로 지정 예정. 전체 맵: http://100.114.231.15:62139/inventory/indoor-map.html?all=1 . 이 단계에서는 메인 게임/atlas 미변경.

# 2026-09-25 생성 원본 직접 축소 표시 채택

사용자가 192px 재픽셀화보다 생성 원본 직접 축소 표시를 선호·채택. 전체 해상도 PNG → 최종 화면 크기 고품질 축소, NPC 별도 레이어를 기본으로 한다. 실내 15종 배치: http://100.114.231.15:62139/inventory/indoor-map.html . 이전 픽셀 방식은 비교 옵션. 메인 게임 반영 승인은 별도. 43 실내매점 d0·44 드라이룸 d1 형상 보정 및 두 시설 전체4방향 바닥접지점 기준 uniform 등록 적용. 사용자 최종 확인 대기. `style-indoor-batch/direction-corrections-43-44/` 기록.

# 2026-09-25 열린 실내로 대상 정정·사우나4방향

사용자 의도는 상세카페입장아닌 열린실내벤치/이용자리. 사우나4방향 대응원본각각내장ImageGen4회,원본vs생성+제작설계좌석3마커 간이비교. http://100.114.231.15:62139/style-open-interior/ . 넓은배치는따르나벤치길이/두께/간격/작은소품차이. 마커는메인미연결제작설계좌표,통합PASS아님. 메인/좌표미변경. `style-open-interior/README.md`정본.

# 2026-09-25 ImageGen4방향·출입검토

http://100.114.231.15:62139/style-four-use/ . 카페d0재사용+d1~3대응원본으로3회내장생성. 원본/생성4방향+문턱/경로/V8NPC접근숨김퇴장비교. 메인portal코드는0/1지원,2/3은회전좌표검토로명시. 큰방향유지/뒷문발명없음,문폭/기와/처마차이잔존. IoU92.8~96.4%(uniformbbox정렬후,구조PASS아님). 0/1문턱은생성문하단근처유지;접촉·픽셀가림전체미검증. CONCEPT_DIAGNOSTIC_ONLY/메인미변경. `style-four-use/README.md`정본.

# 2026-09-25 카페5방식실제비교

http://100.114.231.15:62139/style-methods/ . 원본+ImageGen2안(d0진단)+같은Blender모델재질3안(4dir). 별도캔버스배치맵에동일크기비교. Blender12프레임alphaIoU1/clipping0/300mesh유지/저장재오픈RGBA일치. ImageGen은여전히구조변형,Blender는일관되나수작업픽셀감부족. 미술승인대기/메인미교체. `style-methods/README.md`정본.

# 2026-09-25 카이로풍 픽셀 표현 탐색 시작

사용자:현재구조유지,더아기자기한색감/질감/픽셀표현. 내장imagegen1회로카페/방갈로/펜션2층 A/B시안. http://100.114.231.15:62139/style-pilot/ . B는명암/색구분이더또렷하나A/B차이작고세부변형있어CONCEPT_DIAGNOSTIC_ONLY. 메인/전시스프라이트미교체. 원본및시안 `codex-output/footprint-spacing-review-20260925/style-pilot/README.md`. 사용자스타일선택후저작모델/재질/실제크기검증필요.

# 2026-09-25 전시 중복·구형 준비실8개 추가 정리

현재130항목. 45옛라커/47옛샤워/48옛탈의는최신입구동대표로교체하여전시제외. 151~155빠지개조5종은4방향SHA가각기본형과동일하여중복전시제외(게임사용중이나새에셋아님). 총46ID제외,남은번호유지. 게임정의미변경. duplicate-prune-qa.json참조.

# 2026-09-25 구형 게임 시설32종 추가 제외

사용자 지적82~90번은 옛골프/눈썰매/수영장/정글짐/낚시/타워. 건설목록에남아있다는이유로제작검토에포함한오류수정. 같은구형non-env32종추가제외, 현재138=제작시설79+환경29+이동기구30. 총38제외. 남은reviewNo는기존170목록번호고정. 게임미변경. legacy-prune-qa.json,excluded-legacy.json참조.

# 2026-09-25 배치 전시 미사용 레거시 정리

whole-map/inventory에서 대체된infirmary·karaoke, 건설제외storage·nursing·office·mongol_tent 총6종 제외. 현재170ID. watchtower는빠지,foodcourt_seat는실내로이동·유지. 빠지개조단계유지. 원본/게임/저장 미변경. excluded-legacy.json과legacy-prune-qa.json에기록. 브라우저170개/중복0/부지겹침0/제외ID0확인.

# 2026-09-25 배치 전용 맵 이동 수상기구 추가

기존 whole-map.html / inventory URL에 견인23+수상장비·견인보트7종 추가, 총176ID. 메인 watercraft manifest와480native프레임 복사, 기존 물높이 앵커/원배율 유지. 16heading선택·검색·구역추가, 전시칸과 건물여백 구분. 16방향176개 부지겹침0, 분류목록12그룹176개 확인. 게임/저장 미변경. `inventory/watercraft-qa.json`.

# 2026-09-25 여백 표시 + 전체 에셋 별도 배치 전용 맵

http://100.114.231.15:62139/inventory/whole-map.html . 기존 게임과 분리한146종 단일 전시맵. 메인 spacing JSON그대로(86종+1/7종+3/53종예외),노란여백·청록본체·선택크기,팬/줌/검색/4방향/PNG다운로드. 4방향×여백on/off8조합 부지겹침0. 분류별 inventory에도 여백 강조·전체맵 링크. 게임/저장 미변경. QA `inventory/whole-map-qa.json`.

# 2026-09-25 에셋 수정용 전체 목록·맵 배치본

http://100.114.231.15:62139/inventory/?group=all . 기존 건설목록105종과 최신 메인 제작 manifest85종의 합집합146 ID(제작85/기존61),10분류21맵묶음. 공유·파생 ID 포함. 입구4종/빠지29/보존8 추가, 조경담은 prep-live 연결배치 링크. 일반+1/숙박+3,4방향·이름/ID·부지·목록 다운로드. 게임 미변경. 정본 `codex-output/footprint-spacing-review-20260925/inventory/inventory.md`, QA같은 폴더.

# 2026-09-25 메인 누락 보완: 시설 여백 + 필수 준비실 이용

확인: http://100.114.231.15:5189/?preview=arrival&events=0 . 일반·작은 시설 부지+1, 숙박7종+3을 실제 건설/이동 예약 검사와 UI에 적용. 기존 저장 위치 보존. 라커→탈의→샤워 필수 이용, 슬롯 대기/진입/퇴장, 커튼·물줄기·깊이 가림을 실제 GuestStore/Phaser에 연결. 기존 순서 검증 누락 인정·수정. 관련105개 검사·빌드/lint/UI 통과. 상세 `codex-output/main-preparation-spacing-20260925/README.md`.

# 2026-09-25 도로 포함 메인 입구동 적용

사용자 수락 및 도로 포함 적용 요청에 따라 실제 메인 `ppaji/`에 arrivalRevision 3 적용. 확인: http://100.114.231.15:5189/?preview=arrival&events=0 . 도로→매표소→준비실8×5→본실내20×13→물가 연결. 새 탈의·샤워 에셋 및 코너 깊이 화단 도입. 기존 세이브 보존, 새 게임 기본 반영. 관련100개 검사·lint·build·UI 검사 통과. 범위/남은 전용 부스 연출 차이는 `codex-output/main-arrival-road-20260925/README.md` 참조.

# 2026-09-25 화단·유리벽 코너 깊이 합성 수정 v3

최신 URL 유지: http://100.114.231.15:62139/prep-live/ . 사용자가 거절한 코너 전체 앞/뒤 분류를 제거하고 화단·유리·기둥·시설·NPC를 픽셀별 실제 카메라 깊이로 투명 합성. 원본 모델36방향 깊이 추출, 같은 소스 유리 native 재렌더. 같은 확대 구도의 수정 전후 추가. 깊이/투명도 단위 회귀 및16확장×2벽모드32건 통과, NPC6명 이용완료 유지. 메인 미변경, 사용자 시각 수락 대기. 상세 `codex-output/footprint-spacing-review-20260925/prep-live/README.md`.

# 2026-09-25 외벽 자연스러운 연결 수정 + NPC 시설 이용 재개

최신: http://100.114.231.15:62139/prep-live/ (이전 prep-garden 진입도 최신으로 연결). 사용자 지적에 따라 매표소 접합 구간 중복 유리3패널 제거, 확대화면의 본실내 타일/벽 임의 잘라내기 제거, 조경 오목코너 중복2스트립을 반쪽모듈+단일코너로 교체. 기존 배치에 FAIL_USER_VISUAL_REJECTION 기록. ppaji-npc-assets 적용: 기존 V8 걷기/서기 + FlowField 길찾기 + 슬롯예약/진입/이용/퇴장, 탈의 커튼/샤워 물줄기. 매표소/칸막이 물리깊이 가림. 16 확장조합×6인90초 모두 시설4곳 이용 완료, 슬롯해제/길막힘 오류 없음. 샤워 몸은 기존 서기 자세이며 새 팔 씻기 포즈는 아님. 본게임 GuestStore/저장/경제 미연결, 메인 미변경. 상세 `codex-output/footprint-spacing-review-20260925/prep-live/README.md`.

# 2026-09-25 새 샤워실·탈의실 + 외벽 조경담 후보

최신 검토: http://100.114.231.15:62139/prep-garden/ . ppaji-kairo-assets 공유 B 재질로 샤워실3×2/3부스·탈의실3×2/2부스와 낮은 화단형 조경담 직선/모서리/끝 총5종×4방향 제작. 외곽 앞면 유리벽을 시설 뒤가 아닌 앞에 연속 렌더, 조경담은 유리벽 바깥에 밀착·문 비움·확장 연동. 라이브 원본/게임/저장 미변경. 카메라/재현/클리핑 검증 및 웹32조합 통과. 원시 이미지 선분 진단 FAIL/WARN은 유지하며 물리 카메라 투영 검증과 구분; 미술·실게임 적용 승인은 아직 없음. 상세 `codex-output/footprint-spacing-review-20260925/prep-garden/README.md`, 물리소스 `assets/generated/kairo-v4-simple-pilot/compact-prep-garden-v1/`.

# 2026-09-25 매표소 포함 + 본 실내 다방향 확장 검토

최신 시안: http://100.114.231.15:62139/ticket-expansion/ . 기존 매표소3×2(d2 원본) → 준비실8×5 → 본 실내20×13. 좌우·아래·위쪽 양옆 확장 버튼으로 바닥/유리 외벽 이동 확인 가능. 입구는 고정, 위쪽 확장 시 준비실 측벽 유지. 32화면 조합 및 16벽 도달성 조합 통과. 메인 미변경, 실제 NPC/건설/저장 구현은 별도. 상세 `codex-output/footprint-spacing-review-20260925/ticket-expansion/README.md`.

# 2026-09-25 사용자 수정 — 준비실 압축안

20×10 준비실은 사용자 거절(너무 넓고 분산). ego-browser로 실제 Pool Slide Story 플레이영상 0:25/3:30/10:00의 입구 옆 작은 구획·연립라커 확인 후, 준비실8×5(40칸), 중앙2칸 통로, 라커3×1·탈의3×2·샤워3×2 개념모듈로 축소. 본실내20×13 유지. http://100.114.231.15:62139/compact-entry/ . 원본 에셋 축소 없이 새 제작 전제의 코드 입체초안. 승인 대기/메인 미변경. 이전 double-room 안의 실패 기록 보존.

# 2026-09-25 위쪽 준비실 + 본 실내 2실 구조 검토

사용자 요청으로 입구→코인라커·탈의·샤워 준비실→연결문→본 실내→야외의 단층2실 빈부지 시연. 준비실20×10은 제안, 본실내20×13. 평면/게임시점, 빈방/영역/기존그림, 동선재생. http://100.114.231.15:62139/double-room/ . 메인 미수정, 에셋 재제작은 후속 예정. 실제 적용 시 위쪽 도로·맵경계 및 저장 호환 조정 필요. 상세 `codex-output/footprint-spacing-review-20260925/double-room/README.md`.

# 2026-09-25 일반 시설·작은 설비 부지 여백 검토

사용자 요청으로 빠지 탭 제외105종의 현재 부지와 가로·세로+1칸을 비교하는 독립 웹 배치 시연을 만들었다. 작은 설비 포함, 동일 그림 배율·4방향·혼합/반복·+2칸 대안. http://100.114.231.15:62139/ . 작은 설비12종 d0 픽셀 가림26%→1.7%; 높은 숙박은 가림 잔존, 울타리 등 연결형은 간격 확대 예외 권장. **검토안이며 게임 부지/저장/NPC 미변경.** 상세 `codex-output/footprint-spacing-review-20260925/README.md`.

# 2026-09-20 승인 실외 시설·고정 직원 메인 통합

메인5189에 놀이터·정자·포토존·번지점프와 공연무대1/2/3단계(4/8/12석)를 적용하고 실제 GuestStore 이용·퇴장·저장복원을 연결했다. 안내소·실내 매점·구명조끼 대여소·안전망루는 고정 직원 각1명. 직원은 손님 정원과 분리한다. 트로트무대·족구장 및 옛3×2무대는 신규 건설 제외, 기존 저장 배치는 보존. 새 단계 전환/레벨업 규칙은 후속 시스템 작업이다.

현재 정본: main `docs/assets/handovers/outdoor-play-v1/README.md`. 번들 `main-kIWj0xll.js`. 실제 브라우저14방문/10개 만석 사례와 직원16방향을 검수했고, 저장 바이트는 보존했다. 집중검사199개·타입/린트/UI/빌드 통과. 전체 검사 도구의 장기 실행/RPC 시간초과는 인계 README에 별도 기록; 실패한 원래 장기 검증식은 독립 실행 통과. Orca run `run_d440c50c4fde` 작업자3개는 모두 release. 아래의 “메인 미적용/후보” 문구는 과거 이력이며 이 상태가 우선한다.

# 2026-09-20 공연무대2·3단계와 번지 포즈 수정

outdoor-play-v1의 STAGE-UPGRADES.md가 최신. 1단계4×3/4석→2단계5×4/8석→3단계6×5/12석 후보, 공연자각1. 번지idle대신cheer_jump+허리옆청색줄/청록스트랩. 62127에서단계비교·NPC시연. Node13tests/ego1040frames clipping0 errors0; raw projectionFAIL/WARN·미술·차양·부지검토보존. 이번main게임미변경, 실제가격/확장칸검사/기존3×2마이그레이션은별도연결. 새Orca3worker정리완료.

# 2026-09-20 실외 놀이·정자 후보 완료 / 몽골텐트 건설 제외

최신 확정 제작 범위는 놀이터·공연무대·포토존·번지점프·정자5종. 짚라인 제외. outdoor-play-v1에 4방향 모델/NPC 동작/동일배율 결합 시연62127을 준비했다. 신규5종 메인 미채택, 무대4×3제안(기존3×2보존), 정자3×3/4인 유지. 미술·지붕·부지 및 일부 raster 투영 진단은 검토 중. 메인5189에는 mongol_tent 건설제외만 추가(기존배치보존), build tests3와 production build 성공. 상세 에셋 작업트리 `assets/generated/kairo-v4-simple-pilot/outdoor-play-v1/README.md`. 아래 이전계획보다 이 범위/상태가 우선한다.

# 2026-09-20 슬라이드 탭·점프쿠션 건설 제외

사용자 후속 요청으로 슬라이드(class=slide) 신규 건설과 jump_cushion 제외. 건설7탭. 기존 저장 배치와 빠지 조합/모듈은 보존. 실외 놀이 추천은 번지점프와 짚라인이며 신규 제작 확정 아님.

# 2026-09-20 건설 분류 후속 정리

복층펜션·옛 선착장·편의5종 건설 제외, 편의 탭 제거. 탁구/화장실 실내, 족욕 자리, 해태분수 장식, 공연무대 놀이. 새 에셋/NPC 제안은 `plans/2026-09-20-play-photo-stage.md`. 기존 배치 보존.

# 2026-09-20 펜션·카페·먹거리 11종 승인·메인 적용

메인5189에 lodging-food-v2 승인44프레임 반입. 펜션 1/2/3층(5×4), 카페 1/2/3단계(3×2), 먹거리5종. 이전 배치·지형 보존, 신규4단계 카드를 부모와 함께 표시. 메뉴 궁합/해금은 부모 설정 계승. 실제 GuestStore 출입·정원예약·문턱숨김·같은문퇴장과 부가표시 숨김 연결. 신규 업그레이드 규칙은 별도 시스템 작업. 먹거리 세부 서비스/불꽃 시연은 기존 메인 외부이용 동작과 구분한다.

인계: `docs/assets/handovers/lodging-food-v2/README.md` (main). 원본: 에셋만들기_v3 `assets/generated/kairo-v4-simple-pilot/lodging-food-v2`. 아래 후보 상태 이력보다 이 적용 상태가 우선한다.

# 2026-09-20 승인 컨셉 재제작 · 펜션/카페/먹거리 + 정원 기반 출입 시연

`assets/generated/kairo-v4-simple-pilot/lodging-food-v2/README.md`가 이번 작업 정본. Orca run `run_51c6ed291a89`, 펜션3종/카페3종/먹거리5종 후보를 공유B 물리 모델로 새 제작. 카페3단계는 같은3×2의 **2층 유리 카페**, 펜션3층은 **아래 펜션2층+위 풀빌라1층**. 사용자 추가 요청으로 펜션1·2층 지붕을 시안의 차콜색으로 교정. 거절된 v1은 계속 미채택.

NPC는 카페/펜션 실제 문턱 접근→정원 예약→숨김→같은문 재등장/퇴장 시연. 기본카페4/펜션6은 현재main 정의에서 읽고 실게임은 capacityOf(def,f)를 공급해야 함. 서버62126/runtime/는 에셋 작업트리 검토용; 메인5189 게임/아틀라스는 이번 단계 미변경. 정확한 상태/검증/아직 남은 물리·미술 승인 및 메인 연결은 README와 integration/MAIN-HANDOVER.md 참조. 기존의 다음단계 계획보다 이 사용자 방향이 우선.

# 2026-09-20 펜션·카페·먹거리: ImageGen 방향으로 전환

사용자가 lodging-food-v1 단조로운 구조를 거절. 전11종 FAIL_USER_VISUAL_REJECTION, 메인 미적용, 해당 adopt/wire 실행 금지. lodging-food-imagegen-v2에 실제 내장ImageGen 컨셉2장/프롬프트/QA 저장. 펜션3단계·카페3단계·먹거리5종. 카페3×2 유지 확정. 외형 선택 및 재구성 대기.

# 2026-09-20 안전 망루 후보

watchtower-v1 제작 완료, 1×1·4방향·고정직원1명 시연62124. 사용자 승인 후 메인5189 art 적용 완료. 직원·사다리 동작 미연결. 사용자 요청 빠지9종 건설 제외는 메인5189에 완료. 상세 assets/generated/kairo-v4-simple-pilot/watchtower-v1/README.md.

# 2026-09-20 피크닉 식탁 후보

indoor-picnic-v1 제작 완료, 메인 미적용. 3×2·2석·4방향·NPC 접근/착석·반복 배치 시연 62123. 상세: assets/generated/kairo-v4-simple-pilot/indoor-picnic-v1/README.md.

## 2026-09-20 실내 추가 2종 승인·메인 적용

rental_tube·dry_room 승인된8프레임을 main/ppaji(5189)에 반입 완료. 기존2×1과 게임 데이터 보존. 직원/NPC는 별도 시스템 세션 인계, 현재 외형만 적용. 관련10검사와 빌드 통과, 실제 메인 카드/고스트/배치 좌표 확인.

## 2026-09-20 실내 추가 제작 2종

구명조끼 대여소(rental_tube)·드라이룸(dry_room) 2×1 신규 후보 완료. `assets/generated/kairo-v4-simple-pilot/indoor-service-v1/README.md` 참조. 시연62122, 대여소 직원1명 별도 NPC 표시. 사용자 미술 검토 전 메인 그림 미교체. 메인 건설에서는 사무실·기념품 추가 제외 완료.

## 2026-09-20 실내 제작본 메인 건설 적용

main/ppaji(5189)에 indoor-open-v2 12종/48프레임 적용. 크기 변경 5종은 authored_* 별도 건설 항목이며 기존 배치 보존. NPC/4방향 건설 시스템은 미연결(메인 현재 facing 0/1). 인계: `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon/docs/assets/handovers/indoor-open-v2/README.md`. 이번 미사용/완료 워커 창 7개 닫음, 현재 대화 및 시연 서버 유지.

# 에셋 작업 현재 상태

## 2026-09-20 실내 12종 후속 후보 · 메인 미적용

사우나·의무실·샤워실·찜질방·노래방은 뒤쪽 두 벽이 보이는 cutaway 구조로 보완. 사무실·안내소·실내 매점·실내 자판기·오락기 제작. 매점은 지붕과 네 기둥, 사방 개방. 코인락커·탈의실은 v1 원본 유지. 동일 NPC/타일 배율, 물리 원본/표시용 벽 마스크 분리, 4방향 NPC 시연 검수. **후보 검토 완료이며 라이브 채택/게임시스템 변경 아님.**

[새 시연](http://100.114.231.15:62121/) · [제작·검수·연결 경계](../../assets/generated/kairo-v4-simple-pilot/indoor-open-v2/README.md). 54외형×4방향×12시설=2,592조합, 완전 비표시 이용자0/브라우저 오류0. 원본 래스터 선 검출 경고는 보고서에 유지. 수유실·창고·기구 거치대와 별도 새 후보는 계속 제외.

## 2026-09-19 MAIN follow-up integration completed

MAIN commit `f33dd5b` in `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon` connects 14 individually buildable ppaji modules, all 29 passenger equipment cards, selected roofed buildings (15 kinds / 60 native frames) and the missing `indoor_shop` art alias. Active game: `ppaji/` on port **5189**, rebuilt production dist. All 114 test files / 589 tests pass.
MAIN handovers: `docs/assets/handovers/2026-09-19-standalone-ppaji-construction.md` and `2026-09-19-selected-building-adoption.md`. Existing roof artwork already matched the selected pack; the fix preserves authored camera anchors and removes the indoor-shop procedural fallback. Current building footprints and terrain are unchanged. The legacy root game is not the active game.


## 2026-09-19 수상기구 동작 시연 확장

[확장 계획·구현 범위](plans/2026-09-19-moving-effects-expansion.md): 반동/착수 물보라 6종, 강제/시드 판정 낙수·수영 복귀 9종. 독립 시연 v20, 동력 기구 선회 물보라. 사고식 어댑터·사건 ledger·물길/대체 선착장·구조 대기·저장 복구 core 구현 및 별도 지도 시험 완료. 메인 연결은 이후. [빠지+견인기구 병합 인계](handovers/2026-09-19-ppaji-watercraft-merge.md)를 먼저 읽는다.

## 2026-09-15 최신 제작 범위 — 움직이는 수상기구 우선

[사용자 결정 메모](plans/2026-09-15-moving-equipment-scope.md)를 먼저 따른다. 다음 제작은 움직이는 견인 튜브·기구·동력/보드류다. 고정시설 추가 제작은 나중으로 미룬다. NPC 새 동작/포즈는 필요성을 검토할 단계이며 아직 제작 확정이 아니다. 기존 NPC와 기구는 보존·재사용한다. 이전 '고정시설+NPC 병렬 제작' 제안을 자동 실행하지 않는다.

[움직이는 기구 오케스트레이션 계획](plans/2026-09-15-moving-equipment-orchestration.md): 전체 잔여29종·10묶음 로드맵과 작업자 명세29개 작성. 번개거북은 범위 확인 항목으로 보류. 사용자가 실행을 승인하여 실제 Orca run `run_d1588054a993`에서 28종 후보 제작과 독립 시연 QA를 완료했다(2026-09-19). [실시간 제작·검증 기록](../../assets/generated/watercraft-pilots/ppaji-moving-wave-v1/STATUS.md), [독립 시연](http://100.114.231.15:5192/moving-equipment/). 기존 NPC 재사용, 전용 포즈·승하선·특수 운동과 메인 채택은 별도 미해결 항목이다.

## 2026-09-14 메인 통합 — 현재 적용 기준

[통합 계획·시스템 워크트리 충돌 목록](plans/2026-09-14-main-integration.md).
루트 게임의 시설/환경/경사/NPC V8과 새 게임 입구를 통합한다. 아래 이전 시연 이력보다 이 절이 우선한다.
기존 저장은 입구·실내·장식 변경이 모두 가능할 때만 전환한다. 사용자 시설·표식 없는 장식·울타리는 보존한다.
공간이 부족하면 기존 배치를 유지하며 옛 매표소는 창구 방식으로 입장한다. 새 게임은 13×8 실내와 통과형 매표소를 사용한다.
저장 복원 실패는 게임/쓰기를 중지하고 원본 JSON 다운로드를 제공한다.
다른 `게임시스템-v2/ppaji/` 게임은 별도 어댑터 이식 대상이며 이번 로컬 main 통합만으로 자동 연결되지 않는다.
실행에는 커밋된 public 아틀라스와 src 설정만 필요하다. NPC 재패킹:
`python3 tools/assets/pack-npc-v8.py --source <approved-walk-integrated-directory>` (Pillow 필요).



> 메인 반영: 2026-09-12. 아래 검토 맵/실험 상태는 에셋 작업 브랜치의 기록이다. main에 이미 채택된 게임/시설을 이 기록으로 되돌리지 않는다. 생성 에셋·미커밋 작업은 [로컬 복구 안내](LOCAL-ASSET-RECOVERY.md)를 따른다.

최종 갱신: 2026-09-11. **이 파일이 현재 상태의 짧은 진입점**이다.
[새 세션 시작문](../../codex-output/NEXT-SESSION-PROMPT.md), [이번 세션 정리](handoffs/2026-09-11-assets-skills-session-close.md).


## 목재 경사 울타리 재검토 · 실내 높이 제외 — 2026-09-13

사용자는 실내에 높이를 적용하지 않는다고 명시했다. 실내 기초는 제작/채택 범위에서 제외한다. 목재 울타리는 “앞서 보여준 화면에서 기울기가 안 보인다”는 지적을 반영해 낮은 평지-경사지-높은 평지와 함께 확대, 측면/아이소 4방향으로 다시 제시했다. 1칸에 1단 경사이며 기존 목재 모델/재질을 유지한다. 2칸 완만형은 사용자의 의도를 잘못 해석한 후보이므로 보류. 검토 지면은 실제 게임 지형 변경이 아니다.

[목재 울타리 경사 확인](http://100.114.231.15:62112/artifacts/asset-concept-sheets/slope-fence-review-v3/index.html)

## 높이 경계 부품 · 기존 디자인 유지 파일럿 — 2026-09-13

사용자가 기존 디자인 일치를 명시했다. 대표 3종(계단·경사 울타리·실내 기초)을 네 방향으로 제작했다. 울타리/돌담 재질 레시피는 기존과 동일하며, 계단 v2는 현재 돌길 원본 텍스처를 발판에 직접 사용한다. 유리벽은 기존 이미지 그대로 재사용한다. 16px 높이 차이·동일 배율 비교 단계이며, NPC는 크기 비교용이다. 실제 통행/다중 NPC 가림 및 나머지 9종은 아직 미완료다.

[기존/새 부품/연결 비교](http://100.114.231.15:62112/artifacts/asset-concept-sheets/height-boundary-pilot-v1/index.html) · [증거와 제한](../../codex-output/height-boundary-pilot-v1/QA.md)

## 매표소 후속 수정 후보 — 2026-09-13

V1은 사용자가 기둥 겹침과 빈 뒷벽을 지적하여 시각 승인 무효로 기록했다. V2는 뒷면 분할창·하단 목재와 통로 측 창을 추가하고, 별도 기둥 레이어를 단일 NPC 재생에서 시험 중이다. 기존 라이브 아틀라스는 유지된다. 여러 NPC에 대한 일반화·라이브 채택은 아직 완료하지 않았다.

[수정 후보 맵](http://100.114.231.15:62112/artifacts/asset-concept-sheets/gapyeong-environment-production-v1/ticket-v2.html?ticket=v2) · [검증/제한](../../codex-output/ticket-integrated-production-v2/QA.md)

## 통과형 매표소 연결 — 2026-09-13

승인된 통합 매표소 컨셉으로 `ticket/integrated-entry-v1`을 제작하고 현재 작업 브랜치의 아틀라스에 적용했다. 3×2 크기와 네 방향 공통 배율을 유지한다. 오른쪽 두 칸만 통행할 수 있고, 손님이 반대편 출구까지 걸어간 뒤 입장료를 한 번 처리한다. 기본 시작 맵은 출구가 기존 산책로로 연결되도록 매표소를 회전 배치한다.

- [통과 재생·4방향 검토](http://100.114.231.15:62112/artifacts/asset-concept-sheets/gapyeong-environment-production-v1/map.html?ticket=integrated)
- [제작·검증 기록](../../codex-output/ticket-integrated-production-v1/QA.md)
- 기존 다른 아틀라스 프레임 334장은 픽셀 단위로 동일하다. 저장된 사용자 맵은 이 검토 과정에서 수정하지 않았다.

## 가평 주변 환경 제작 후보 — 2026-09-12

28종, 연결 부품 포함 40개 모델을 제작 중이다. 기존 선택 시설 팩을 보존하고 별도 Phaser 검토 맵에 연결했다. **최종 미술 승인·라이브 채택은 미완료**. 배경 끝 처리와 상가 차양·펜션 발코니 보완본을 검증하고 있다.

- [검토 맵](http://100.114.231.15:62112/artifacts/asset-concept-sheets/gapyeong-environment-production-v1/map.html) — 기존 선택 시설 6종 샘플, 환경물, 4방향 메뉴, NPC 출입구 걷기.
- [전체 40개 후보](http://100.114.231.15:62112/artifacts/asset-concept-sheets/gapyeong-environment-production-v1/review.html).
- [정확한 재개 상태·미완료 항목](../../codex-output/gapyeong-environment-production-v1/HANDOFF.md).

## 연결 기준 오류 확인 — 2026-09-12

사용자가 기존 작업이 롤백되어 보인다고 지적했다. 62114 본게임 링크는 기존 기본 atlas에 마지막 5종만 적용한 상태로, 앞서 선택한 10종 및 원래 검토 맵 전체를 이어 반영한 결과가 아니다. 앞선 “연결 완료” 설명은 전체 작업 연속성을 충족하지 못했다.
현재 선택본 기준은 62112의 `/artifacts/asset-concept-sheets/selected-facilities-current/map.html`. 15종 60방향의 로컬·서버 SHA가 선택 기록과 전부 일치한다. 원본 소실 없음. 본게임 전체 통합 완료로 표시하지 않는다.
조사: `codex-output/live-five-adoption/rollback-investigation.json`.

## 선택 5종 본게임 연결 — 2026-09-12

사용자 “연결해보자” 승인으로 현재 작업 브랜치 게임 atlas·시설 정의에 사우나 3×3, 찜질방 4×4, 방갈로 3×3, 그늘막 2×2, 몽골텐트 3×3을 연결했다. 각 4방향, 승인된 native 이미지의 불투명 픽셀과 비율을 보존했다. 나머지 atlas 199프레임 RGBA 동일.
입구 회전·좌석 범위를 맞추고 실내 두 시설 이용객의 표시를 숨긴다. 구형 저장의 확장 시설은 충돌 시 가까운 유효 위치로 이동한다. 빈 공간이 없으면 복원 실패 가능. 야외 시설의 모든 좌석·방향별 NPC 가림은 별도 시각 검증이 남아 있다.
`codex-output/live-five-adoption/HANDOFF.json` 참고. 전체 verify 통과(1571 통과, 1 건너뜀), build 통과, 실제 게임 20방향 텍스처 확인. 로컬 작업 반영이며 main 병합·배포는 하지 않았다.
본게임 전시: http://100.114.231.15:62114/?assetReview=1&px=1

## 복잡한 카페 A/B 완료 — 2026-09-12

최신: `codex-output/cafe-complexity-ab-v1/HANDOFF.json` 및 `REPORT.md`.
동일 원화/atlas/brief/모델로 이전·최적화 각1회, 각보완2회. 제작자 누적157만→100만(36.46% 감소), 비캐시34.54%/출력37% 감소.
메인 비용 제외, 이전 방식 추가 QA요청1회 포함. 요금/전 시설 평균으로 일반화하지 않는다.
총16장 독립 재렌더 일치. 래스터 투영 이전d3/최적화d0,d3 FAIL 기록 유지.
미술·게임 채택 대기, 스킬/라이브 변경없음. 비교: http://100.114.231.15:63021/run/cafe-ab/review.html
추가 시험 자동 확대 없이 사용자 평가를 따른다.

## 시설 토큰 최적화 완료 — 2026-09-11

공통 authored_review.py 도구와 간결한 실행 경로를 시설 스킬에 추가했다.
`codex-output/asset-token-optimization-v1/HANDOFF.json` 및 `REPORT.md`가 최신이다.
동일 입력·동일 모델 독립 제작자 비교: 누적101만→51만(50.08% 감소), 출력35.21% 감소.
비캐시 입력24.10% 증가. 요금/구독50% 절감 주장은 하지 않는다. 개발/메인 비용 제외한1회 관측이다.
기존8장 출력 보존, 오류계약3개 거부, 새8장 재렌더 일치. d0 투영 WARN 유지.
비교: http://100.114.231.15:63021/run/optimization-compare/review.html
새 후보는 색/주요 구조 유지, 세부는 더 단순. 미술 결정/라이브 채택 대기.
다음 요청 시설부터 새 경로 재사용. 자동 추가시험/시설 확장 없음.

## 화장실 후속 시험 — 2026-09-11

사용자가 화장실 추가 시험을 요청하여 동결 스킬로 독립 후보 하나를 완성했다.
`codex-output/toilet-skill-blackbox-v1/HANDOFF.json` 및 `REPORT.md`를 읽는다.
원격 비교: http://100.114.231.15:63021/run/review.html
8장 저장본 재렌더 일치, 입력24/보호44파일 유지. d0 이미지 선 검출 WARN 기록 유지.
주요 컨셉 구조와 색을 유지하지만 질감은 더 규칙적이고 매끈하다. 화장실 사용자 외형 평가 대기.
스킬·현재 맵·라이브는 변경하지 않았다. 요청 없이 시험 반복/다른 시설 확장을 하지 않는다.

## 최신 시설 스킬 보완 — 2026-09-11 후속

사용자 최종 목표는 컨셉 색감·질감·디테일을 재현하는 시설 스킬과 블랙박스 제작이다.
매표소 보완 후보는 `ticket/ticket-concept-polish-v2`이며 기존 전체 검토 맵은 그대로다.
계정 로컬 시설 스킬에 컨셉 역할/비율 선언, 역할별 재질, 공통 렌더/면 방향 도구, d0 보완 절차를 추가했다.
독립 새 제작 3회와 저장본 검증 후, 사용자는 **개찰기 디테일은 충분하고 블랙박스 결과 수준도 괜찮다**고 평가했다.
이 수준을 제작 방식의 실용적 기준으로 수용한다. 특정 최종본 선택이나 라이브 채택은 아직 없다.
[보고서](../../codex-output/ticket-concept-polish-v1/REPORT.md),
[인수인계](../../codex-output/ticket-concept-polish-v1/HANDOFF.json),
[컨셉·기존·보완·독립 시험 비교](http://100.114.231.15:60527/run/review.html).
개찰기 미세 디테일 보완/블랙박스 재시험을 자동 재개하지 않는다. 다음 사용자 지정 시설에 이 방식을 재사용한다.
[사용자 피드백 범위](../../codex-output/ticket-concept-polish-v1/USER-FEEDBACK.json). 기존 기술 진단과 원본은 유지한다.

## 재사용 제작법

- **건물/시설:** `$ppaji-kairo-assets`. 사람 대비 치수 → 직접 제작한 Blender 루트 → 공유 B 채색 재질 → 같은 루트의 네 물리 회전.
  단순 박공/편경사/평지붕, 창구·문·창·외부 설비로 기능 구분. 지붕만 바꾼 복제 건물/과한 지붕은 피한다.
  과거 H21와 현재 인물 표시 셀 수치는 다른 단위다. 불투명 키를 측정하고 설치 footprint/몸체/지붕/앵커를 따로 기록한다.
- **사람:** `$ppaji-npc-assets` 신규 저장. 사선 앞/뒤 원본 + 좌우 미러, 자세별 source 몸/얼굴 보호,
  머리·의상 donor 부품 조립, 역할별 exact 팔레트 베이크. 324명을 각각 생성하지 않는다.
  따뜻한 픽셀풍 프리렌더이며 엄격한 네이티브 픽셀아트 인증은 아니다. Meshy/I2V 인물 경로는 자동 재개하지 않는다.
- 재사용 절차는 스킬, 구체적인 수치·실행 결과·승인 범위는 프로젝트 문서/manifest가 소유한다.

## 최신 인물 후보 — 검증 완료, 시설/라이브와 분리

[독립 인물 V8 걷기·외형 검토](http://macmini.tailc51829.ts.net:62079/).
정본: `codex-output/npc-independent-v8/HANDOFF.json` → `walk-integrated/REPORT.md` → 해당 `manifest.json`.

- 3머리 ×6머리색 ×3옷 ×6옷색 =324외형, 추천54개. 한 체형/피부.
- 기존20상태22컷 + 사선 앞뒤 걷기 각4컷 =22상태30컷. 수영 동일방향2컷, 착석/눕기/슬라이드/물속 서기 정지 자세.
- 9,720 RGBA/실제미러/캐시 검사, 기존부품1,100셀·보호253파일 유지. 9형상 실제 위상 캡처/정적432걷기셀 검수 통과.
- 누적24회 생성 완료. 새 색/조합 생성0회. 완료된 이미지 작업을 재호출하지 않는다.
- 뒤 걷기 B 전신scale1.061 보정으로 확대 경계가 부드럽다. 시간순 캡처 기반 모션 판단이며 정밀 발 미끄러짐/이동속도 인증은 아니다.
- 독립 후보 구현·검증 완료와 사용자 미술 승인·시설 적용·라이브 채택은 각각 구분한다.
- 재개 시 `node codex-output/npc-independent-v8/checkpoint.mjs`는 기존 증거 검증/체크포인트 갱신이다.
  새 브라우저 검수나 생성기 재실행을 대신하지 않는다.

## 시설·기존 전체 맵

34종×4방향136시설의 **검토 맵**을 보존했다. 최종 시설 설계/정원/게임 이용 계약이 아니다.
[시설 + V7 인물 전체 검토 맵](http://macmini.tailc51829.ts.net:62070/npc-wardrobe-v7/full-map.html).
이 맵의 V7 인물을 최신 V8 걷기 후보가 이미 대체했다고 설명하지 않는다.

- 제작 절차: [사람 기준 직접 제작 시설](pipelines/authored-human-scale-facilities.md).
- 시설 후보 경로: `artifacts/asset-concept-sheets/building-style-lock-pilot-v1/human-scale-access-wave-index.json`.
- 전체 맵: [정지 인물 맵 V4 계약](contracts/guest-static-map-v4.md).
- 방갈로 현관/식혜 창구는 별도 보완 후보. [방갈로](contracts/bungalow-exterior-v1.md), [식혜](contracts/sikhye-access-v1.md).
- 보존된 시설 선 투영 진단 16종 보류는 카메라 오류 확정이 아니다. 기존 카페·치킨·사우나 외형 승인은 유지한다.
  제작 방식 승인만으로 전 시설의 크기/미술/라이브 채택을 일괄 승인하지 않는다.

## 다음 작업과 정리

**시설별 상호작용은 시설 정의까지 의도적 보류.**
[재개 체크리스트](plans/npc-facility-interactions-deferred.md)가 과거 자동 진행 계획보다 우선한다.
다음 실작업은 사용자가 확정한 시설의 그림/설치 크기/이용 방식을 받아,
기본 인물 접점·회전·가림 → 외형 조합 → 요청된 게임 연결 순서로 한다.
숨은 실내 좌석 인물, 앉고 일어나는 전환, 호흡 모션은 자동으로 추가하지 않는다.

2026-09-11 후속 사용자 승인으로 **구형 메시 포함287파일 삭제 완료**. 초기 Blend10개는 후속 모델과
기하/계층/재질/리소스를 비교한 뒤 차분 보관했다. 캐시·자동 백업·중복 PNG·옛 검증 JSON도 정리했다.
원본 제거 약921MB, 복구 자료·검사 기록을 포함한 파일 내용 순감소 약900MB. 삭제 범위 밖29,949파일 해시 유지,
검토 제공 파일1,437개 존재 및 실제 HTTP686개 바이트 일치 통과. 새 시각/미술 승인 검사는 아니다.
[실행 결과](../../codex-output/asset-cleanup-execute-2026-09-11/REPORT.md),
[복구 방법](../../codex-output/asset-cleanup-execute-2026-09-11/RECOVERY.md).

사용자는 에셋/메시를 더 다듬을 예정이다. **현재34종의 모델·재질·참조는 모두 유지**했다.
[다듬을 모델 경로](../../codex-output/asset-cleanup-execute-2026-09-11/EDITABLE-MODELS.json)에서 대상/현재 맵 모델과
별도 보완 후보를 구분하고 새 작업본으로 복사해 수정한다. 후속 legacy Blend10개는 차분 복구 기준이라 읽기 전용이며 덮어쓰지 않는다.
V3/V4/V6/V7의 인물 의존성, 제공자 GLB 원본/실패 계보, 공유 atlas와 최신 NPC 후보는 보존했다.
추가 중복1.09GB/레거시2.75GB는 서로 겹치는 이전 조사 수치이며 전부 삭제한 것이 아니다.

[이전 CURRENT 전문](CURRENT-archive-2026-09-11.md)은 이력 조회 때만 읽는다.
과거의 “진행 중/다음 생성/목표 미완료”는 위 최신 V8 완료 상태를 덮어쓰지 않는다.

## 2026-09-13 기존 가평 시연맵 경사 구역

[경사 시연맵](http://100.114.231.15:62112/artifacts/asset-concept-sheets/gapyeong-environment-production-v1/ticket-v2.html?slope=1)에 기존 디자인의 목재 경사 울타리, 16px 높이 차와 석재 오르막, NPC 오르내리기 시각 시연을 추가했다. 실내는 평지. 실제 GuestStore 경사 경로 탐색 통합은 별도이며 기존 매표소 입장 시연을 유지했다. [검증 기록](../../codex-output/slope-demo-map-v1/README.md).

## 2026-09-13 경사·계단 실제 게임 연결

[실제 게임 검토](http://100.114.231.15:62114/?assetReview=environment&heightDemo=1). 일반 게임 건설→바닥에 경사로/계단, 기존 목재 울타리의 경사 대응을 연결했다. GuestStore 이동/도달 판정·표면 높이·설치/비용·저장 왕복 검증 완료. 옛 1단 길은 호환 유지, 새 실내 바닥은 높이 0만 허용. 이전 slope-demo.mjs의 시각 왕복과 달리 이 페이지는 실제 WeekRunner/GuestStore를 사용한다. 옹벽/보도 턱 신규 모듈은 별도 미완료. [변경·검증·남은 범위](../../codex-output/height-live-integration-v1/README.md).

## 2026-09-13 레거시 맵 보존·경사 NPC 순간이동 수정 — 우선 적용

사용자가 임의로 추가한 시험 지형을 거절했다. `heightDemo`는 이제 기존 저장 맵(없으면 원래 월드젠/시작 킷)을 읽고 카메라 이동 버튼만 추가한다. 4개 시험 언덕·길·울타리·강제 배치 손님·등급 변경을 제거했다. 기존 지형을 바꿔 시연하는 방식을 재도입하지 않는다. 계단의 4px 정수 높이 점프를 연속 보간하고, 이동 구간 교체 시 직전 화면 위치를 이어받아 조그만 순간이동도 방지했다. [수정 근거와 검증](../../codex-output/height-legacy-correction/README.md).

## 2026-09-13 사용자 지정 입구·배경 배치

사용자가 매표소 1시 이동·산 뒤로 이동·앞쪽 마을 건물·울타리를 요청했다. 기본 북한강 매표소를 (54,9), 방향 0으로 이동하고 기존 입구/마당을 연결했다. 도로 뒤 마을 6종, 초기 용지 목재 울타리 48개를 적용했다. 지형 높이와 실내동, 기존 다른 시설은 유지한다. 새 게임과 기존 시작 배치가 남아 있는 세이브에 적용하며 이미 이동한 매표소는 재배치하지 않는다. 충돌 시 기존 저장 배치를 보존한다. [실제 게임](http://100.114.231.15:62114/) · [검증 및 적용 범위](../../codex-output/entrance-layout-20260913/README.md).

## 2026-09-14 용지 울타리 제거 · 산 배경 추가 후퇴

사용자 요청으로 앞서 자동 설치한 용지 목재 울타리를 제거하고 신규 자동 설치도 중단했다. 기존 세이브는 1회 정리 후 `entranceBoundaryCleared`를 저장하여 이후 사용자가 새로 설치하는 울타리는 유지한다. 경사 울타리 에셋/기능은 유지한다. 산·숲·강안 배경은 I/J 각각 -8칸 이동해 화면 가로 위치를 유지하면서 뒤로 128 논리 픽셀 물렸다. 매표소, 주변 건물, 실제 지형 높이는 유지. 브라우저에서 매표소 (54,9), 용지 울타리 0개 확인. [화면](../../codex-output/entrance-spacing-20260914/map.png).

## 2026-09-14 매표소 통과 → 실내 문 직접 연결

사용자 요청으로 실내 1시 쪽에 매표소를 밀착하고 매표소 통로 끝을 유일한 실내 출입문으로 연결했다. 북한강 매표소 (53,9), facing 3; 문 (52,11,+I). 매표소 통로 차단 시 실내 도달 0을 검증했다. 시작 평상/탁구대 제거, 지형 높이·실내 바닥·데크/선착장 유지. 1회 적용 완료를 저장해 이후 수동 배치는 유지. [검증 기록](../../codex-output/indoor-ticket-entry-20260914/README.md).

## 2026-09-14 위→아래 입장 · 버스와 장식 — 최신 배치

사용자가 오른쪽 입구를 정정하여 매표소를 실내 위로 옮겼다. 매표소 (46,9), facing 0; 실내는 크기 유지하며 J+2 이동, 북쪽 입구와 남쪽 야외 출구 연결. 이전 측면 진입길 제거, 매표소 우회 차단 확인. 버스 임시 도형을 승인된 버스 스프라이트로 교체하고 실제 운행에 연결했다. 기본 북한강 맵에 기존 장식 47개를 입구·실내 바깥·물가·좌우 언덕 평지에 배치. 높이 전 칸 유지. 저장 1회 적용. [실제 게임](http://100.114.231.15:62114/) · [검증/화면](../../codex-output/park-arrival-20260914/README.md).

## 2026-09-14 실내 확대·외벽 장식·V8 NPC 라이브 적용 — 최신

사용자 요청으로 초기 실내 13×8(104칸) 확대, 벽선 기준 화단/벤치와 주변 보행 공간 배치. 지형 높이 유지, 위 매표소→실내→아래 출구 유지. 설정은 `src/data/kairo-arrival-presentation.json`. 사용자 요청으로 기존 독립 V8의 추천54외형/게임7자세/4방향 렌더를 실제 게임에 연결했다. 원본 PNG는 백업에 보존, 파생 아틀라스만 새로 패킹. 기존 코드 인물/얼굴 오버레이 대신 새 아틀라스 사용. 외형·자세·방향·fps·접점은 `src/data/kairo-npc-presentation.json`, 선택은 `Guest.appearanceId`. 과거의 V8 "라이브와 분리" 문구는 원본 검토본 이력이며 이번 사용자 지정 라이브 적용이 우선한다. 모든 시설 상호작용의 시각 인증까지 의미하지 않는다. [변경/검증](../../codex-output/arrival-presentation-v2-20260914/README.md).

## 2026-09-19 최신 MAIN 승인 에셋 통합 완료

실제 게임 정본: `/Users/jangjunpyo/Desktop/ppaji/ppaji_tycoon`의 `main`, 커밋 `d2c0575`. 포트 **5189** (dist 빌드), 임시 5194 종료. 이 에셋 작업 트리의 예전 게임 코드를 메인에 통째로 덮어쓰지 않는다. 승인 이동 기구 29종+견인선·조합 3종·NPC 좌석/이용/낙수/복귀 연결, 퇴역 시설 29종의 신규 건설/레시피/해금/보상/조건 연결 정리 완료. 이전 시설/NPC atlas는 이미 MAIN과 동일했으며 유지. 113개 파일·587개 테스트 및 타입/lint/UI/빌드·실제 MAIN 브라우저 검증 통과. 상세 인계는 MAIN `docs/assets/handovers/2026-09-19-main-approved-assets.md`, 증거는 `docs/assets/qa/main-adoption-20260919/`. 일부 특수 회전/전용 체형 포즈는 원본 보류 상태 유지.

## 2026-09-19 빠지 데크·개별 기구 누락 보완

MAIN 후속 커밋 `9f10e92`. 이전 통합은 조합 3종과 이동 기구만 채택해 개별 파란 데크와 핵심 6종을 누락했다. 바닥 데크/float_deck 및 다이빙·다리·징검다리·블롭·아이스버그·점프타워 원본 4방향과 실제 Guest 이용 동선을 연결했다. 시스템 업그레이드 5종은 승인 기본형 재사용으로 구형 그림 복귀 방지. 고정 20종 가운데 14종은 기존 두 조합에 포함, 6종은 개별 연결. 이동 29종+견인선 990파일 해시 일치. 13테스트·타입·lint·UI·빌드와 MAIN5189 렌더60표본 검증. 전체 목록과 제한은 MAIN `docs/assets/handovers/2026-09-19-floating-omission-audit.md`. 보류 fittings·별도 업그레이드 모델·2인 블롭 동기화 등은 완료로 표시하지 않는다.

## 2026-09-26 MAIN ImageGen 전종 + 실제 NPC 연결·렌더 최적화

사용자 승인된 새 그림 130종(시설·조경100 + 이동기구30), 방향 이미지880장을 실제 MAIN5189에 연결했다. 원본/이전 팩 유지, raw 4x 축소 표시, lossless WebP 파생본은 필요한 방향만 로드한다. 기존54 NPC 외형을 재사용하여 실내·먹거리·휴식25종의 실제 이용 경로/좌석/대기열/퇴장 보상과 남은 숙박·화장실 출입을 연결했다. 79번은 승인된 그림의 공통8석까지만 실제 예약, 초과 손님은 대기. 생성 그림의 가림은 기존 깊이/일부 명시적 painter 근사를 유지하며 새 물리 인증으로 간주하지 않는다.

사용자가 렉을 지적하여 동적4x 전체 합성을 정적HD 그림+작은NPC 레이어로 분리하고 지면 텍스처 공유, 일반 수면 GPU 이동을 적용했다. 미리보기 물2,093칸은2레이어, 매 프레임 물 이미지 재업로드0. 로컬29FPS, 초기1.36초/29.45MB(시설시연 포함). 관련345테스트 및 후속215테스트 통과. 전체 장기 봇 검증은 부하 때문에 중단했으며 전체 suite PASS로 표시하지 않는다.
[실제 메인 시연](http://100.114.231.15:5189/?preview=arrival&showcase=1&events=0&ground=imagegen&v=perf3) · [에셋·NPC 기록](../../codex-output/main-imagegen-adoption-20260926/README.md) · [성능 기록](../../codex-output/main-render-performance-20260926/README.md).
