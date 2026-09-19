# 승인 에셋 메인 통합 QA

최종 번들은 `final-bundle.json`을, 실제 이용 동작 확인에는 `main-5189-*`를 사용한다. 해당 이미지는 MAIN의 dist 서버에서 생성했고 사용자 저장에는 기록하지 않았다.

- `main-5189-dock.png`: 새 판의 2×1 승하선 데크. 원래 실내·도로·자연 지형 유지.
- `main-5189-playground.png` / `.json`: QA용 자금과 rank 5 허가에서 공개 데크/시설 API로 20×12 놀이터 배치. 기존 시설 UID 전부 유지. 실제 손님이 (48,23)에서 (37,38) 입구로 걸어와 이용.
- `main-5189-contact-splash.png`: 실제 두 손님이 선착장을 이용해 바나나보트에 탑승. QA 인스턴스에만 사고 확률을 1로 설정해 낙수를 재현.
- `main-5189-checks.json`: 코스 진행 36.5%, 최고 속도의 93%에서 낙수. 57 tick 후 출발 선착장 (58,25)의 걸을 수 있는 칸으로 복귀. 수영 중 저장·복원 운항 상태 동일. 기구 30종 로딩, HTTP 오류 0.
- `import-verification.json`: 원본 기구 990개 파일 해시.
- `prior-assets.json`: 기존 시설/NPC atlas 네 파일이 원본과 동일함.
- `watercraft-depth-four-facing.png`, `static-depth-alpha.json`: 원본 방향·깊이 합성 QA.

나머지 이미지와 `browser-checks.json`은 개발 중 증거다. 특히 `playground-real-guests.png`와 `banana-real-guests.png`는 제어된 배치 fixture이고, `peanut-midcourse-splash.png`는 급커브 선체 간격 보정 전이다. 이들을 최종 공개 배치 검증으로 인용하지 않는다.

최종 전체 검사: **113개 파일 / 587개 테스트 통과**. `validation.json`, `tests.txt`, `typecheck.txt`, `lint.txt`, `ui.txt`, `build.txt` 참고.
