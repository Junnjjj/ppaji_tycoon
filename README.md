# 빠지 타이쿤 — 메인 통합본

실행 게임의 정본은 **`ppaji/`** 입니다. 게임시스템 P57-b와 승인 시설·환경 에셋, NPC V8 성인 포즈와 승인 초기 맵(위쪽 매표소 → 13×8 실내 → 남쪽 테라스·벽 주변 장식)을 통합했습니다.
루트 `src/`는 이전 게임의 보존본이며 기본 실행 대상으로 사용하지 않습니다.

```sh
npm run setup
npm run dev                   # ppaji 개발 서버 (5187)
npm run build                 # ppaji/dist 생성
npm run serve:main            # 메인 확인 서버 (5189)
npm run verify                # 새 게임 타입·린트·테스트·UI 검사
npm run gate -- p57b          # 새 게임 전체 게이트
```

메인 확인: http://100.114.231.15:5189 (Tailscale), 로컬 http://localhost:5189.
5187은 개발용이며 메인 확인 주소가 아닙니다. 5202·62114·62112·62121·4173 레거시 서버는 종료했습니다.
다른 워크트리에서 `serve:main`을 실행해 메인 주소를 덮어쓰지 마세요.

- [게임 시스템·실행 안내](ppaji/README.md)
- [현재 통합 계획과 인수인계](docs/plan-unified-main-2026-09-14.md)
- [시설·환경 반입 상세](docs/plan-ppaji-main-merge.md)
- [이전 게임 README](docs/README-legacy.md) — 과거 설계·명령은 보존용입니다.

이전 게임은 `npm run legacy:dev -- --port 5202 --strictPort`처럼 명시적으로만 실행합니다.
에셋 수정은 원본과 `ppaji/public/assets`의 런타임 사본을 함께 검증해야 합니다.
