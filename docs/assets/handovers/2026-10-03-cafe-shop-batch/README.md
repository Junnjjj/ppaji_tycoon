## 2026-10-03 전체 교체 진행 · 카페1/카페3/야외매점 적용

사용자 목표 “진행해줘 전체교체” 계속 실행. cafe/cafe_lv3/shop 3종 각4방향 메인 적용. 전체100종 중 적용17 / 남은83. 과거 승인 코인라커·탈의실과 붕어빵d1 원본 예외 유지. 전체 목표 아직 미완료. 다음: snackbar(분식) → chicken(치킨) → firepit_row(화로대열), 이후 BBQ존/평상/그늘막 등 목록 순서.

신규팩 `cafe-shop-batch-20261003`: cafe1343면 / cafe_lv3 2729면 / shop241면. 카페1: 슬레이트맞배지붕,파란문/차양,목재주문대,오른쪽유리/화단. 카페3: 기존카페2 언어로 실제2층,상층원탁2/스툴4/펜던트2/화분,실제지붕구멍3과유리천창. 야외매점: 청록경사지붕,6줄크림/청록차양,앞주문대,왼쪽목재문,오른쪽작은반사창. 원본방향모순은 각공통배치로해석. 가구수/작은식물/내부기계 등 완전원본복원아님.

카페1/야외매점 기둥상단은 실제경사지붕높이함수에맞춰정점작성. 지붕이음선은2packedpx표본에서판정, 넓은명암/표면전체다운샘플아님. 검증 cafe34접합/41닫힌부품, cafe_lv3 67접합/98닫힌부품, shop21접합/40닫힌부품. 모두회전변길이불변·4PNG연결/잘림·시설별바닥선8구간PASS. 미술95점자동인증/모든내부선인증아님.

카페3 최초검사 실패: d2에서수직유리가모두가려져야한다는조건이 실제천창구멍을고려하지못함. 상층유리는천창을통해보일수있음을렌더와깊이표본으로확인. 검사수정: 하층유리 가시표본0 + 천창투영영역밖RGB변화0(선필터3packedpx여유). first-qa-failure.json에조건/근거보존. 원래기준을모르고완화한95점주장없음. 야외매점작은창은불투명벽위반사그림이며투명창이라고주장하지않음. 투명물체일반지원/물리굴절구현아님.

실게임후보PNG12/12정확일치·저장소불변,같은배치카메라로각원본/교체맵6장. 승격후HTTP12개hash/PNGdecodedRGBA일치,브라우저provider↔HTTPWebP12/12,관련21테스트PASS. density4WebP12+기존native12교체. 앵커/크기/나머지등록불변. backup/receipt `approved-cafe-shop-batch-20261003`. 원격push없음.

[3종 원본→4방향→유리/선→확대→실제맵](http://100.114.231.15:62140/cafe-shop-batch/) · [전체400방향/적용본17맵](http://100.114.231.15:62140/whole-replacement/). 보고서44canvas/9이미지/깨짐0/가로넘침0. 활성브라우저TaskSpace43/p1 재사용; 전체목표진행중으로finish안함.

재현: build.py → render.py surface-spec.json --out candidates → render.py surface-spec.json --out no-glass --no-glass → verify.py → build-report.py. build.py는카페2구조일부를exec해서상층증축하며 원본파일변경없음. renderer/materials/line_finish는팩내보존. review.json은build재실행하면후보상태로돌아가므로승격후상태보존주의. 보고서builder는adoptionreceipt감지로승격배너유지. 검토Vite는wholeReplacement=1 & scopedAsset=ID, 원본보기추가reviewOriginal=1; runtime-packs.json에3종같은팩등록. 실제메인게임코드변경없음.

