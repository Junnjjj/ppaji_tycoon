## 2026-10-03 전체 교체 진행 · 카페2와 실내매점 적용

활성 목표 “진행해줘 전체교체”의 후속 실행. 카페2와 실내매점 각4방향을 실제 메인에 적용. 현재 적용14 / 남은86. 코인라커·탈의실 이전 승인본과 붕어빵 d1 원본 예외 유지. 전체100종 목표 미완료. 다음 카페1(cafe) → 카페3(cafe_lv3) → 야외매점(shop), 이후 목록 순서.

카페2: `cafe-lv2-template-20261003`. 3×2 공통구조, 1322면. 검정 낮은 지붕·목재틀·크림벽·앞/오른쪽 유리·문/손잡이·실내카운터/기계/컵·오른쪽 화단. 원본방향의 불일치를 공통배치로 해석. 유리처리 추가: 불투명 depth를 먼저 그린 뒤 투명면을 픽셀 깊이순 alpha-over. `--no-glass` 비교: d0/d1/d3에서RGB변경 20453/12505/4901픽셀, 불투명 뒤벽 d2는0. 알파는유무비교동일. 이 건물은 유리뒤 불투명 내부가 있어 완성스프라이트가 불투명이며, 이 구현만으로 향후 물체 전체가 투명한 워터워크볼까지 해결했다고 간주하지 않는다. 접합42/닫힌부품45/회전변길이/연결·잘림/바닥선8검사PASS. 창유리와 원본의 손그림 반사·화단 모양·내부세부는 완전히 같지 않다.

실내매점: `indoor-shop-line-20261003`. 기존 `indoor-shop-shading-20261002` 공통구조/진한명암을 기반으로 최신2packedpx윤곽과 지붕 이음선 표본격자를 적용. 전체RGB다운샘플 아님. 기둥/선반/상품21/카운터/계산기 위치 함께회전. 선반다리·카운터받침 아래0.02~0.05논리px틈을 실제정점/메타데이터수정으로 닫음. 접합48/박스44폐쇄/바닥선8/지붕이음36검사PASS. 원본전체픽셀보존/원본방향모순해결의유일정답/95점미술인증 주장은 하지 않는다. 이전후보와알파는상이.

두대상 PNG 실게임8/8 정확일치·저장소불변·같은배치원본/교체맵캡처. 승격후 HTTP8개hash/승인PNGdecodedRGBA일치, 브라우저 실제provider↔HTTPWebP8/8, 관련21테스트PASS. 새density4WebP8장+기존native8장. 앵커/크기/나머지항목불변. 각각 `approved-cafe-lv2-20261003`, `approved-indoor-shop-20261003` 백업/receipt. 원격push없음.

[카페2](http://100.114.231.15:62140/cafe-lv2-template/) · [실내매점](http://100.114.231.15:62140/indoor-shop-line/) · [전체400방향](http://100.114.231.15:62140/whole-replacement/). 보고서는 원본→교체4방향→선/유리비교→확대→실제맵. 최근 대상2개는 report builder가adoptionreceipt를감지해승격배너보존.

검토용Vite에 범용 `/__whole/{id}/review.json` 및 `/__whole/{id}/candidates/{id}/dN.png` 라우트 추가. 허용pack은 `whole-replacement-20261003/runtime-packs.json`. `?scopedAsset=ID&wholeReplacement=1&reviewOriginal=1` 원본, reviewOriginal제외는후보. 실제메인게임코드 변경 없음. 브라우저 활성 TaskSpace43/p1 계속재사용, 전체목표진행중이므로finish하지않음.

카페 재현: build.py → render.py surface-spec.json --out candidates → 같은명령 --out no-glass --no-glass → verify.py → build-report.py. 실내매점은 surface-spec/assembly가직접작성된입력, render.py → verify.py → build-report.py. shader에rooflineworld인자추가, roof이음판정만화면격자표본으로계산. 물리투명/굴절렌더가아님.

