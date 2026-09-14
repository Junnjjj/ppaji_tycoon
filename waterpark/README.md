# 워터파크 스토리 — Pool Slide Story 클론

빠지 타이쿤 리포의 **독립 하위 프로젝트**다 (자체 `package.json`). 게임 시스템은 전부 새로 만들고,
부모에서는 순수 유틸(`rng` · `iso` 수식 · `camera` · `upscale` · `dom` · `panels` · `compat` · `build-identity`)만 가져왔다.

계획·조사·goal 순서: **`../docs/plan-waterpark-clone.md`** (§1 PSS 시스템 전모 · §2.5 G0~G13).

```bash
npm i
npm run dev                # http://localhost:5177  (?debug=1 로 디버그 상자 · ?px=1 로 픽셀 검사)
npm run gate -- g0         # typecheck + lint + vitest + 정적 UI(+selftest) + 브라우저 실터치
npm run verify:browser -- --goal g0 --headed   # dev 서버가 떠 있을 때
npm run gate -- g13        # 전 goal 누적 게이트 (G0~G13)
npm run bot -- --seeds 8 --days 128 --determinism   # 헤드리스 봇 (Phaser 없이 Node — 불변식 1 실증)
npm run bot -- --seeds 8 --days 128 --bands         # G13 목표 밴드 판정 (tools/bot.ts 의 BANDS, 밖이면 exit 1)
npm run bot -- --seeds 8 --days 128 --persona all   # 성향 4종(balanced·pool·restaurant·cert) 비교표
npm run bot -- --sweep startMoney=20000,ticketBase=250   # balance.json 키를 덮어 스윕 (밸런스 조정의 유일한 창구)
npm run shot               # 11 화면 스크린샷 + tmp-shots/contact.png 콘택트 시트 (dev 서버 필요, 판정 없음)
npm run gallery            # 도트 갤러리 — 시설 91 · 손님 · 타일을 tmp-shots/gallery.png 한 장에 (dev 서버 필요)
npm run prerender          # 시설 3D 프리렌더 → public/assets/fac-atlas.png/.json (dev 서버 필요, Chrome WebGL)
npm run scene              # 표본 파크 스크린샷 tmp-shots/scene-s1/s2.png (dev 서버 필요)
```

URL 스위치: `?debug=1` 디버그 상자 + `window.__wp` · `?px=1` preserveDrawingBuffer(픽셀 검사) · `?fresh=1` 저장 무시 ·
`?freeze=1` 시간 정지로 시작 · `?tut=0` 튜토리얼 Strip 끄기 · `?seed=N`.

시설 그림은 **3D 프리렌더**다 — `tools/prerender/models.ts` 의 원시 도형 모델을 다이메트릭 오소(요 45°·피치 30°)로 툰 렌더 → 외곽선 → `--px-*` 팔레트 양자화 → `public/assets/fac-atlas.png`. 게임은 `AtlasProvider`(없으면 절차 도트 폴백, `?atlas=0`)로 같은 ID 를 읽는다. 시설 한 종 = 데이터 한 줄 + `sprites/*.ts` 의 `ART` 한 줄(템플릿·주제색·간판 아이콘). 손님·타일은 코드 도트(`draw/`).

데이터(`src/data/*.json`)가 곧 콘텐츠다: 시설 91 · 친구 71 · 소원 213 · 인증 24 · 레시피 140 · 재료 60 · 타일 13 · 지역 10.
`src/data/data.test.ts` 가 참조 무결·해금 그래프 도달성·밸런스 회귀를 지킨다 — 항목을 더할 때 그 테스트가 계약이다.

불변식은 부모와 같다: `src/sim/**` 은 phaser/render/ui/save 를 import 하지 않고 `Math.random`/`Date` 를 쓰지 않는다
(`eslint.config.js` + `src/sim/invariants.test.ts`). 색은 `src/ui/style.css` 만 소유한다 (`tools/check-ui.mjs`).
