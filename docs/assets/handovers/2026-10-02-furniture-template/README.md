# 벤치·피크닉 테이블 승인 후보 승격

사용자 “오 그래 괜찮네 적용하자 그냥” 승인으로 `env_bench`와 `foodcourt_seat`의 공통 구조 후보 각 d0–d3를 메인 적용했다. 검토 원본은 에셋만들기_v3의 `bench-picnic-template-20261002`. density-4 WebP 8개 및 피크닉의 기존 native fallback PNG 4개 갱신. 벤치는 approved-facilities 항목이 없으므로 새 항목을 만들지 않았으며 기존 w48/h56/pad16(패킹320×352)을 유지했다. 피크닉 packed768×768 및 fallback192×192 유지. 모든 배치 등록·크기·다른 manifest 항목은 불변이다.

새 파일명으로 캐시를 분리했고 기존 파일은 삭제하지 않았다. 변경 전 manifest/이미지는 작업 폴더 `approved-furniture-20261002/backup`에 보관, 전후 항목은 adoption.json에 기록했다.

검증: HTTP WebP 8개 해시가 manifest와 일치하고 Pillow 디코딩 RGBA가 리뷰 PNG와 완전히 일치. approved-facilities 9개 + outdoor-facilities 12개 테스트, 총21개 통과. 브라우저 런타임 8개 로딩은 확인했으나 브라우저의 WebP canvas와 별도 PNG canvas 간 RGBA 완전 일치 비교는 false였으며 원인은 이번 검수에서 분류하지 않았다(runtime-qa.json). 이를 런타임 픽셀 일치 통과로 기록하지 않는다. HTTP 파일/무손실 디코딩 검사는 별도 통과했다(http-pack-qa.json). 검토 단계에서는 PNG 후보를 직접 로딩한 RGBA8/8 및 실제4방향 맵을 확인했다.

실내매점 명암 보강본은 이번 적용에 포함되지 않는다. 자판기·아이스크림의 이전 승격6d74f1f는 유지. 원격 push는 수행하지 않았다.

검토 이력: http://100.114.231.15:62140/bench-picnic/

추가 검수: `browser-codec-followup.json`에서 런타임과 같은 HTTP WebP의 브라우저 디코딩은8/8완전일치했다. 별도PNG와WebP canvas 비교의 차이는반투명RGB에만있으며, 알파와완전불투명픽셀RGB는모두같다. 실제리뷰와다른파일이로딩된것은아니다. 디코더내부의정확한원인은단정하지않는다. 이전false기록은비교기준이다른진단이므로삭제하지않았다.
