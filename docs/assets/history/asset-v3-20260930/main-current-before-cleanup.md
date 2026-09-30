> 과거 기록입니다. 현행 상태는 [CURRENT](../../CURRENT.md)를 따릅니다. 본문 경로·서버 주소는 당시 기준이며 원본 자료는 워크트리 보관본을 참조하세요.

# 2026-09-21 Git delivery status

Local main adoption is not Git delivery: 13 new facility definitions, approved images and NPC integration remain uncommitted. [Audit and delivery dependencies](handovers/git-delivery-audit-20260921/README.md). HD/pixel-lab candidates remain excluded.

# 2026-09-20 NPC 이동·피크닉 식탁·모바일 렌더링 후속

메인5189, bundle `main-35nHaY5e.js`. [후속 인계](handovers/outdoor-play-v1/NPC-MOTION-FOLLOWUP.md): V8 인물 일관성, 수영 방향/복귀 속도, 정적 기구 완주 시간/이동 취소, foodcourt_seat 제작본 연결. 모바일 초록 화면 원인은 미확정; 확인된 텍스처 낭비와 context loss 시 시간 진행을 보완. 176 집중검사와 빌드 통과, 강제 렌더러 손실/복구 및 제트스키 브라우저 검수. 실제 iPhone 재확인 필요. 아래 이전 번들/미적용 기록보다 이 상태가 우선한다.

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

# 에셋 작업 현재 상태

## 2026-09-20 빠지 목록 정리 · 망루 후보

건설 제외: rent_sup, rent_duck, rent_pedal, rent_kayak, slide_tube, rig_rack, rig_float_bar, rescue_dock, airbounce. 에어바운스는 전용 이용 경로/NPC 모션이 없는 레거시라 제외. 기존 저장은 보존. 안전 망루는 assets worktree의 watchtower-v1에 1×1·4방향·고정직원 시연 후보 제작, 62124에서 확인. 사용자 승인 후 안전 망루 art를 메인5189에 적용 완료. 직원/사다리 모션은 인계 계약만 제공. [적용 기록](handovers/watchtower-v1/README.md).


## 2026-09-20 건설 제외 목록 보완

5189 메인에서 takeout(포장 창구)도 제외. 제외 ID: nursing, storage, gear_rack, office, souvenir, room_ondol, takeout. 기존 저장 정의는 유지하며 currentBuildCatalog 회귀 검사 추가. 후속 요청으로 room_tatami(다다미방), stage_hall(실내 무대)도 제외. 잠긴 카드 티저 2개 규칙 때문에 앞 카드를 제외하면 뒤의 기존 카드가 드러났던 문제이며, 시설 신설은 아니었다. 추가로 derived 파생 시설(식탁)이 잠금 티저로 노출되는 오류도 차단했다. 사용자 후속 요청으로 entrance도 건설 목록에서 제외. 입구는 고정 배치이며 기존 배치와 시설 정의는 유지.


## 2026-09-20 온돌방 제외 · 식탁 누락 확인

온돌방(room_ondol)을 건설 목록에서 제외했다. 실내 푸드코트 식탁(foodcourt_seat, 3×2·2석)은 다음 제작 대상이며 아직 새 에셋을 적용하지 않았다. [제작 범위](handovers/indoor-service-v1/foodcourt-next.md).

## 2026-09-20 대여소·드라이룸 추가 적용

사용자 승인 후 rental_tube/dry_room의 2×1 새 그림을 메인 건설·배치에 적용했다. 직원/NPC 상호작용은 다른 세션용 비활성 계약만 인계. [상세 인계](handovers/indoor-service-v1/README.md).

## 2026-09-20 실내 제작본 건설 적용

MAIN `ppaji/`(5189)에 실내 12종/48프레임 적용. 크기 변경 5종은 `authored_*` 새 건설 항목으로 추가해 기존 배치를 보존했다. 기존 크기 7종은 외형 교체. NPC 상호작용은 미연결이며 메인 건설은 아직 facing 0/1(정사각형 회전 버튼 숨김)이다. 4방향 이미지와 출입·슬롯·가림 데이터는 준비되어 있다. [적용 ID, 크기, 다음 시스템 작업, 검증 기록](handovers/indoor-open-v2/README.md).

## 2026-09-19 Remaining rest facilities

Nine more authored facilities are now connected: pavilion/glamping/caravan replace existing art; six `authored_*` construction variants preserve original placed sizes. All nine appear before unlock. [Applied list, sizes, system boundaries and reproduction](handovers/2026-09-19-remaining-rest-facilities.md). MAIN review: `/asset-reviews/rest-facilities-20260919.html` on port 5189. These facilities retain existing guest behavior; dedicated authored seat-contact animations are not yet connected.


## 2026-09-19 MAIN asset integration

The active latest-system game is `ppaji/`, port **5189**. The September 14 note below about a separate system adapter describes the earlier state.
Authored composites, floating decks, standalone core facilities, 29 passenger equipment types and ride effects are connected. All 14 small modules can also be built individually.
[Standalone construction and save compatibility](handovers/2026-09-19-standalone-ppaji-construction.md).
The selected 15 roofed facilities use their native camera anchors; the indoor shop now uses its own open canopy art (2026-09-20).
[Selected buildings: findings, applied list, reproduction](handovers/2026-09-19-selected-building-adoption.md).


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
