## 2026-10-03 전체 교체 진행 · 카페1/카페3/야외매점 적용

사용자 목표 “진행해줘 전체교체” 계속 실행. cafe/cafe_lv3/shop 3종 각4방향 메인 적용. 전체100종 중 적용17 / 남은83. 과거 승인 코인라커·탈의실과 붕어빵d1 원본 예외 유지. 전체 목표 아직 미완료. 다음: snackbar(분식) → chicken(치킨) → firepit_row(화로대열), 이후 BBQ존/평상/그늘막 등 목록 순서.

신규팩 `cafe-shop-batch-20261003`: cafe1343면 / cafe_lv3 2729면 / shop241면. 카페1: 슬레이트맞배지붕,파란문/차양,목재주문대,오른쪽유리/화단. 카페3: 기존카페2 언어로 실제2층,상층원탁2/스툴4/펜던트2/화분,실제지붕구멍3과유리천창. 야외매점: 청록경사지붕,6줄크림/청록차양,앞주문대,왼쪽목재문,오른쪽작은반사창. 원본방향모순은 각공통배치로해석. 가구수/작은식물/내부기계 등 완전원본복원아님.

카페1/야외매점 기둥상단은 실제경사지붕높이함수에맞춰정점작성. 지붕이음선은2packedpx표본에서판정, 넓은명암/표면전체다운샘플아님. 검증 cafe34접합/41닫힌부품, cafe_lv3 67접합/98닫힌부품, shop21접합/40닫힌부품. 모두회전변길이불변·4PNG연결/잘림·시설별바닥선8구간PASS. 미술95점자동인증/모든내부선인증아님.

카페3 최초검사 실패: d2에서수직유리가모두가려져야한다는조건이 실제천창구멍을고려하지못함. 상층유리는천창을통해보일수있음을렌더와깊이표본으로확인. 검사수정: 하층유리 가시표본0 + 천창투영영역밖RGB변화0(선필터3packedpx여유). first-qa-failure.json에조건/근거보존. 원래기준을모르고완화한95점주장없음. 야외매점작은창은불투명벽위반사그림이며투명창이라고주장하지않음. 투명물체일반지원/물리굴절구현아님.

실게임후보PNG12/12정확일치·저장소불변,같은배치카메라로각원본/교체맵6장. 승격후HTTP12개hash/PNGdecodedRGBA일치,브라우저provider↔HTTPWebP12/12,관련21테스트PASS. density4WebP12+기존native12교체. 앵커/크기/나머지등록불변. backup/receipt `approved-cafe-shop-batch-20261003`. 원격push없음.

[3종 원본→4방향→유리/선→확대→실제맵](http://100.114.231.15:62140/cafe-shop-batch/) · [전체400방향/적용본17맵](http://100.114.231.15:62140/whole-replacement/). 보고서44canvas/9이미지/깨짐0/가로넘침0. 활성브라우저TaskSpace43/p1 재사용; 전체목표진행중으로finish안함.

재현: build.py → render.py surface-spec.json --out candidates → render.py surface-spec.json --out no-glass --no-glass → verify.py → build-report.py. build.py는카페2구조일부를exec해서상층증축하며 원본파일변경없음. renderer/materials/line_finish는팩내보존. review.json은build재실행하면후보상태로돌아가므로승격후상태보존주의. 보고서builder는adoptionreceipt감지로승격배너유지. 검토Vite는wholeReplacement=1 & scopedAsset=ID, 원본보기추가reviewOriginal=1; runtime-packs.json에3종같은팩등록. 실제메인게임코드변경없음.

## 2026-10-03 전체 교체 진행 · 카페2와 실내매점 적용

활성 목표 “진행해줘 전체교체”의 후속 실행. 카페2와 실내매점 각4방향을 실제 메인에 적용. 현재 적용14 / 남은86. 코인라커·탈의실 이전 승인본과 붕어빵 d1 원본 예외 유지. 전체100종 목표 미완료. 다음 카페1(cafe) → 카페3(cafe_lv3) → 야외매점(shop), 이후 목록 순서.

카페2: `cafe-lv2-template-20261003`. 3×2 공통구조, 1322면. 검정 낮은 지붕·목재틀·크림벽·앞/오른쪽 유리·문/손잡이·실내카운터/기계/컵·오른쪽 화단. 원본방향의 불일치를 공통배치로 해석. 유리처리 추가: 불투명 depth를 먼저 그린 뒤 투명면을 픽셀 깊이순 alpha-over. `--no-glass` 비교: d0/d1/d3에서RGB변경 20453/12505/4901픽셀, 불투명 뒤벽 d2는0. 알파는유무비교동일. 이 건물은 유리뒤 불투명 내부가 있어 완성스프라이트가 불투명이며, 이 구현만으로 향후 물체 전체가 투명한 워터워크볼까지 해결했다고 간주하지 않는다. 접합42/닫힌부품45/회전변길이/연결·잘림/바닥선8검사PASS. 창유리와 원본의 손그림 반사·화단 모양·내부세부는 완전히 같지 않다.

실내매점: `indoor-shop-line-20261003`. 기존 `indoor-shop-shading-20261002` 공통구조/진한명암을 기반으로 최신2packedpx윤곽과 지붕 이음선 표본격자를 적용. 전체RGB다운샘플 아님. 기둥/선반/상품21/카운터/계산기 위치 함께회전. 선반다리·카운터받침 아래0.02~0.05논리px틈을 실제정점/메타데이터수정으로 닫음. 접합48/박스44폐쇄/바닥선8/지붕이음36검사PASS. 원본전체픽셀보존/원본방향모순해결의유일정답/95점미술인증 주장은 하지 않는다. 이전후보와알파는상이.

두대상 PNG 실게임8/8 정확일치·저장소불변·같은배치원본/교체맵캡처. 승격후 HTTP8개hash/승인PNGdecodedRGBA일치, 브라우저 실제provider↔HTTPWebP8/8, 관련21테스트PASS. 새density4WebP8장+기존native8장. 앵커/크기/나머지항목불변. 각각 `approved-cafe-lv2-20261003`, `approved-indoor-shop-20261003` 백업/receipt. 원격push없음.

[카페2](http://100.114.231.15:62140/cafe-lv2-template/) · [실내매점](http://100.114.231.15:62140/indoor-shop-line/) · [전체400방향](http://100.114.231.15:62140/whole-replacement/). 보고서는 원본→교체4방향→선/유리비교→확대→실제맵. 최근 대상2개는 report builder가adoptionreceipt를감지해승격배너보존.

검토용Vite에 범용 `/__whole/{id}/review.json` 및 `/__whole/{id}/candidates/{id}/dN.png` 라우트 추가. 허용pack은 `whole-replacement-20261003/runtime-packs.json`. `?scopedAsset=ID&wholeReplacement=1&reviewOriginal=1` 원본, reviewOriginal제외는후보. 실제메인게임코드 변경 없음. 브라우저 활성 TaskSpace43/p1 계속재사용, 전체목표진행중이므로finish하지않음.

카페 재현: build.py → render.py surface-spec.json --out candidates → 같은명령 --out no-glass --no-glass → verify.py → build-report.py. 실내매점은 surface-spec/assembly가직접작성된입력, render.py → verify.py → build-report.py. shader에rooflineworld인자추가, roof이음판정만화면격자표본으로계산. 물리투명/굴절렌더가아님.

## 2026-10-03 전체 교체 진행 · 붕어빵 적용

활성 목표: 사용자 “진행해줘 전체교체”. 100종 범위를 유지하고 검수 후 순차 적용한다. 이번 붕어빵은 새 공통 구조의 d0/d2/d3를 메인에 적용, 사용자 선호 d1은 원본 바이트·등록 유지. 현재 적용 12종 / 남은 88종(실내매점 기존 후보 1 + 제작 대기 87). 전체 목표 미완료. 이전의 개별 후보 승인 대기 문구보다 이번 전체 교체 실행 지시가 최신이다. 과거 거절·붕어빵 d1 예외는 유지한다.

붕어빵: 주황 맞배지붕/기둥4/크림몸체/목재상판/철판·쟁반/음식6개. 첫 렌더는 과도한 지붕 높이·경사·폭이 확인돼 낮추고 폭10% 줄임. 생선은 머리·꼬리·눈·구운무늬를 보완. 1162면, 접합21곳·닫힌구조8개·4회전변길이불변·연결/잘림·실루엣8선 검사 PASS. 생성4방향 중 d1은 미적용이므로 최종4장 전체 동일구조 주장은 하지 않는다. 원본마다 음식 개수가 달라 새 구조는 철판3+쟁반3으로 정리. 모든 미술적 세부가 원본과 동일하지 않다.

실게임 로딩은 교체PNG3+기존WebP1 정확 일치, 저장소 불변. 승격후 HTTP3개 hash/PNG decoded RGBA 일치, 브라우저provider↔HTTP WebP4/4 일치, 관련21테스트 통과. 메인용3WebP+native3장, 나머지등록 불변. 백업 `approved-bungeoppang-20261003/backup`; 원격 push 없음.

[붕어빵 원본→적용4방향→생성본→선→실제맵](http://100.114.231.15:62140/bungeoppang-template/) · [현재100종목록](http://100.114.231.15:62140/whole-replacement/). 후보폴더 `bungeoppang-template-20261003`; build.py → render.py surface-spec.json --out candidates → verify.py → build-report.py. build-report 재실행시 승격후 상태배너를 보존할 것. runtime-review Vite에는 bungeoppangTemplate 및 reviewOriginal 파라미터 추가, 실제 게임코드 변경 없음.

다음 카페2: `cafe-lv2-template-20261003/originals.png` 4방향 조사판 생성. 검은 낮은 지붕, 황금 목재틀, 크림뒤벽, 유리창·문, 실내 카운터, 한쪽 화단. 원본 방향마다 창/벽/카운터 관계가 달라 앞면과 오른쪽면 유리, 뒤/왼쪽 벽의 공통 구성을 먼저 선언해야 한다. 현 renderer는 투명면을 제대로 합성하지 않으므로 유리를 단순 불투명 파란 판으로 막지 말고 내부와 반사/투명 처리를 검증한다. 아직 카페 새 구조 작성/적용 전. 그다음 실내매점 기존 후보의 선 표현 기준 재검토.

## 2026-10-03 식혜 승인 적용 · 전체 100종 교체 방향 확정

사용자 “좋다 이정도면 만족해 … 에셋 전체를 대체하는방식으로가자”에 따라 식혜 d0–d3를 실제 메인에 적용했습니다. 4개 density-4 WebP + 기존 native fallback 4장. 등록 크기·앵커 유지, 관련 없는 manifest 항목 불변. HTTP 해시 및 승인 PNG의 디코딩 RGBA 4/4 일치, 브라우저 실제 provider와 HTTP WebP 4/4 일치, 관련 테스트 21개 통과. 원격 push 없음.

전체 고정 시설·환경 소품 100종을 원본 색감·질감·비율과 선 표현을 참고한 공통 구조 제작 방식으로 순차 교체합니다. 현재 적용 11종(새 공통 구조 9 + 앞선 표면 재투영 코인라커/탈의실 2), 남은 89종(실내매점 후보 1 + 제작 대기 88). 다음 순서: 붕어빵 → 카페2 → 실내매점 후보 재검토. 붕어빵 d1 원본 선호는 유지합니다. 개별 미검토 후보의 일괄 승인을 의미하지 않습니다.

[현재 메인 전체 400방향 격자와 승인본 실제 맵](http://100.114.231.15:62140/whole-replacement/). 자연물 6종도 포함하며 비대칭·곡선을 살립니다. 이동 보트·NPC·지형은 이 100종 외 별도 범위. 과거 surface-full 조사 상태는 역사 자료이며 현재 상태로 재사용하지 않습니다. 계획: `docs/assets/plans/2026-10-03-whole-asset-replacement.md`. 적용 근거: `docs/assets/handovers/2026-10-03-sikhye-template/`.

## 2026-10-02 샤워실 승인본 메인 적용

사용자 “합격”으로compact_shower4방향승격. 기존크기/앵커유지,HTTP및브라우저4/4,관련21테스트통과. [상세](handovers/2026-10-02-shower-template/README.md). 다음식혜·계란코너후보작업. 원격push없음.

## 2026-10-02 드라이룸·구명조끼 선 수정 및 오락기 승인본 적용

사용자가 수락한 dry_room/rental_tube 최종선수정과 arcade 공통구조를 실제메인에적용. 각4방향12개WebP+12개기존native fallback. 앵커·크기·다른시설불변. HTTP해시/승인PNG파일RGBA12/12, 브라우저실제WebP로드12/12, 관련21테스트통과. [상세 적용기록](handovers/2026-10-02-dry-rental-arcade/README.md). 다음대상 compact_shower(샤워실); 이미승격한코인라커/탈의실은유지. 실내매점은후보유지. 원격push없음.

## 2026-10-02 벤치·피크닉 테이블 공통 구조 승격

사용자 승인으로 env_bench 및 foodcourt_seat 각4방향 적용. 기존 패킹·앵커·다른 시설 유지. HTTP파일/무손실 RGBA8개 및 계약/렌더 테스트21개 통과. 추가 브라우저 검사: 런타임과 같은 WebP는8/8일치. PNG↔WebP 차이는 반투명RGB에 한정되고 알파/완전불투명RGB는 동일. [상세 적용 기록](handovers/2026-10-02-furniture-template/README.md). 실내매점은 후보 유지.

## 2026-10-02 자판기·아이스크림 공통 구조 후보 승격

사용자 승인으로 `vending_in` 및 색·질감 보정 `icecream` 각 4방향을 메인에 적용. 크기·앵커·다른 시설 유지, RGBA 8/8 및 계약 테스트 9개 통과. [승격 기록](handovers/2026-10-02-template-pair/README.md). 실내매점은 후속 시험 대상.

# 현재 에셋·기본맵 상태

최종 정리: 2026-09-30. 실행 정본은 메인 저장소의 `ppaji/`다.

## 적용 및 전달

- 기본맵·에디터·ImageGen·준비시설·외곽 배치를 메인에 통합하고 `c338b32`를 GitHub `main`에 푸시했다. 이전 “미커밋/미푸시” 기록은 현재 상태가 아니다.
- 일반 게임 `/`, 편집기 `/?editor=1`, 편집 맵 테스트 `/?mapTest=1`. `cd ppaji && npm run dev`로 포트5187을 사용한다.
- 새 게임은96×120 기본맵. 기존 저장은 시설·돈·지형을 유지하며 확장한다. 저장v6, 게임/에디터 저장 분리.
- 상세 구현·검증: [기본맵 통합 인계](../handovers/2026-09-30-base-map-main-integration.md).
- 워크트리 원본·백업·옛 문서 보관: [정리 기록](../handovers/2026-09-30-asset-v3-worktree-cleanup.md).

## 다음 작업에서 놓치면 안 되는 사항

1. 나무는 개체 ID와 배치 간격을 준비했지만 개별 삭제 UI/저장은 미구현이다.
2. 유리벽에 붙은 낮은 화단은 연속 유지한다. 겹치는 별도 화분/긴 화단을 제거하는 것이 사용자 의도다.
3. 레거시 차량 잔류 캐시를 수정했다. 이것과 차량 원화 자체의 방향 정확성은 별개다.
4. 전체 테스트는 통과로 기록하지 않는다. 기존 `p49a1` 기구 수35기대/39실제와 장시간 course 봇 시간초과가 남아 있다.
5. 시설100종400방향의 물리·부품·NPC 접점 검수가 모두 끝난 것은 아니다. 9/29 재검수에서72종175방향의 추가 검토 신호와 우선18종을 기록했다. 확정 오류175개를 뜻하지 않는다. [보고서와 비교판](qa/facility-reaudit-20260929/README.md).
6. 빠지 슬라이드141은 사용자 시각 거절 및 생성본 비율 불일치가 남아 있다. 원본 외곽에 균일 축소하는 fit만으로는 내부 부품/연결 정확성을 보장하지 못한다. 추가 생성이나 가로 늘리기로 임의 해결하지 않는다.

## 검증 범위

메인 빌드·타입·ESLint·UI 검사, 관련92테스트, 에디터13테스트를 통과했다.
ego-browser에서 게임/편집기/플레이 팝업, 저장·새로고침, 강·화단·마을 화면을 확인했다.
전체 미술 승인이나 전체 회귀 테스트 통과로 확대하지 않는다.

## 이전 기록

- [메인의 이전 상태 기록](history/asset-v3-20260930/main-current-before-cleanup.md)
- [에셋 워크트리의 이전 상태 기록](history/asset-v3-20260930/worktree-current-before-cleanup.md)
- [메인의 이전 세션 프롬프트](history/asset-v3-20260930/main-next-session-before-cleanup.md)

과거 기록의 후보/미반영/포트5194·5189·62139 안내는 당시 시점이다. 현재 실행 및 다음 작업은 이 문서를 우선한다.
