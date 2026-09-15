# main(실제 에셋) 병합 계획 — 게임 시스템은 ppaji, 새 에셋은 main (2026-09-14)

> 사용자: 「메인에 에셋 일부를 적용해 놨다. 게임 시스템은 지금 만든 것(ppaji) 기준, 새 에셋(그림 말고)은 main 버전으로. 조사 후 계획」.
> 이 문서는 조사 결과와 병합·반입 순서(M0~M4)다. 실행은 사용자 승인 뒤(커밋이 첫 단계라서).

## 1. 조사 결과

| 항목 | 실측 |
|---|---|
| 분기점 | `9af45af`(2026-08-26). 우리 브랜치 `Junnjjj/게임시스템-v2` 는 그 위에 커밋 2(`8c87e7e` P0~P20 · `fae7035` 문서 재편) + **미커밋 348 파일**(ppaji P21~P56 전부 · 문서 · 메모). main 은 8커밋(`f9986ee`~`e1fe1d3`, 2026-09-14) |
| main 이 바꾼 것 | 레거시 게임(`src/` 29+21+…, `public/assets` 247, `docs/assets` 28, `.agents/skills` 23, `codex-output` 111, `tools` 5). **`ppaji/` 는 0 파일** — ppaji 쪽 충돌은 없다 |
| main 의 에셋 | 아틀라스 `public/assets/kairo-atlas.{png,json}` **344 프레임**(우리 ppaji 사본 144): facility 104(4방향 `:d1~d3` 55종) · 환경 시설 `env_*` 29종(마을 집·펜션·편의점·소나무·버스·차·나무 울타리·돌담·생울타리·물가 난간·화분·벤치·가로등…) · `wall`·`deco`·`ui`·`backdrop` 그룹 · 풍경 `kairo-environment-v1/` 35장(768px: 먼 산·가까운 숲·먼 둑·유리벽/문 4방향…) · 레거시 세이브 안전 채택 |
| 시설 정의 변화(main) | 4방향 26종(샤워·탈의·락커·세면·화장실·수유·사우나·찜질방·식혜·매점·분식·치킨·아이스크림·카페·자판기·오락·노래방·탁구·안내·의무·사무·창고·매표·몽골텐트·그늘막·방갈로) · **발자국 바뀐 6종**: 수유실 2×1→2×2 · 찜질방 3×3→4×4 · 아이스크림 1×2→1×1 · 카페 2×3→3×2 · 몽골텐트 2×2→3×3 · 그늘막 2×1→2×2 |
| ppaji 와의 접점 | ppaji 시설 148 중 레거시 id 공유 75 → main 프레임 있는 것 **49**(4방향 26). 발자국 불일치 위 6종 그대로. ppaji 공급자 `src/assets/kairo-atlas.ts` 는 「앞면 + 뒤집기」 2방향(`fac/<id>/<0|1>`) |
| 겹치는 파일(main 변경 ∩ 우리 변경) | 29 — 레거시 `src/assets/kairo-*`·`src/sim/kairo/*`·`src/main.ts`·`src/ui/style.css`·`tools/*`·`docs/assets/README.md`·`docs/kairo-phases.md`·`docs/README.md`·`CLAUDE.md`·`eslint.config.js`·`package.json` |
| 우리 레거시 잔재 | 레거시 파일 14 의 미커밋 수정은 08-27 스테이징 잔재(HEAD 대비 13~83줄)이고 main 은 같은 파일에서 100~1,000줄 앞섰다 → **main 으로 덮는다**, 잔재는 패치로 보관 |

## 2. 원칙

1. **게임 시스템 = ppaji**(우리 작업 트리). main 은 ppaji 를 안 건드렸으니 ppaji 는 한 글자도 안 바뀐다.
2. **레거시 뿌리(`src/` `tools/` `public/assets` `docs/assets` `.agents` `codex-output` 설정 파일) = main**. 우리 쪽 잔재는 버린다(패치 보관).
3. **새 에셋(그림 말고) = main 의 아틀라스·환경 시설·풍경**을 ppaji 에 반입한다 — ppaji 가 그리는 것(카드 그림 396·장면 4·절차 기구)은 그대로.
4. 공유 문서(`CLAUDE.md`·`docs/README.md`·`docs/kairo-phases.md`)는 **둘 다 살린다**(3-way 수동).

## 3. 순서

| 단계 | 무엇 | 검증 | 위험 |
|---|---|---|---|
| **M0 안전** | ① 우리 미커밋 348 을 브랜치에 커밋(사용자 승인 필요 — 커밋은 지시가 있어야) ② 레거시 잔재를 `docs/history/stale-legacy-2026-08-27.patch` 로 저장 ③ 태그 `pre-main-merge` | `git status` 0 | 없음 |
| **M1 병합** | `git merge main`. 충돌 규칙: 레거시 뿌리 = `--theirs`, `ppaji/`·`docs/plan-*`·`docs/research`·`art-reference/competitor`·`ppaji/docs` = `--ours`, 공유 문서 3 = 수동 | 레거시 `npm run verify`(main 과 같아야) · `cd ppaji && npm run gate -- p56c`(무변경 초록) | 공유 문서 수동 병합 실수 → `check-plan.mjs`·문서 색인으로 잡는다 |
| **M2 P57-a 아틀라스 반입** | ① main `kairo-atlas.{png,json}` → `ppaji/public/assets/` ② 공급자: `fac/<id>/1` 은 `:d1` 프레임이 있으면 그것(진짜 옆면), 없으면 뒤집기 ③ 발자국 6종을 main 값으로(`facilities.json`) → 킷·하네스 좌표·`tooClose`·실내 폭 영향 실측 ④ `check-assets.mjs` 계약(프레임 크기 = 발자국) 갱신 ⑤ 하네스 「레거시 프레임 폴백 0」 행 | `gate -- p57a` · 골든 재베이크(발자국이 바뀌면 봇 배치가 바뀐다) | **옛 세이브**: 발자국이 커진 시설(수유·찜질·텐트·그늘막)이 이웃과 겹친다 → 로드 시 겹침 검사 후 겹친 것만 창고행(환불) 또는 새 판 |
| **M3 P57-b 환경·풍경** | ① `env_*` 29종을 ppaji 장식 시설 데이터로(마당 밖 임시 장식 P44-d 를 이것으로 교체) ② 풍경 35장을 P44 Surround(들판·숲·능선 절차)의 **띠 그림**으로 — 원작처럼 경계를 안 보여 주는 게 아니라 같은 스케일 지형으로 이어 붙인다(CLAUDE.md 「원경 배경 금지」 지킴) ③ `wall` 그룹(유리벽·문 4방향)은 P44-b 벽 그리기 교체 — **선택**, 실측 뒤 | `gate -- p57b` · 폰 스크린샷 첫 화면 | 풍경 768px 35장 = 텍스처 메모리(폰) — 필요한 것만 |
| **M4 정리** | `plan-ppaji-story.md` §7 · CLAUDE.md 포인터 · 메모리 · dist(5189) | — | — |

## 3.1 진행 (2026-09-14)

- **M0 ✅** — 커밋 `34b4fa7`(ppaji P21~P56) · `b7fba3a`(레거시 잔재 보존) · 태그 `pre-main-merge` · 패치 `docs/history/legacy-ours-vs-head-2026-09-14.patch`(33 파일 8,291줄).
- **M1 ✅** — `6a85f1f` 병합. 충돌 14: 레거시 13 = main, `docs/README.md` = 우리(상위 집합). 자동 병합이 섞은 레거시 파일이 typecheck 를 깨서 **레거시 뿌리를 통째로 main 으로**(`git checkout main -- src tools public/assets docs/assets …`), main 에 없는 우리 레거시 20 파일(수배·상점·손님 말·아이콘 등 08-27~09-02 작업)은 지웠다(`b7fba3a` 에 남아 있다). 레거시 typecheck·lint 통과, ppaji 는 `pre-main-merge` 와 바이트 동일. 사용자 결정: 커밋 ✓ · 발자국 6종 = main ✓.

- **M2 ✅ P57-a** (`gate -- p57a` 통과 2026-09-14: vitest 492 · 밴드 충족 · 에셋 계약 0 · 그림 396 · 하네스 332 행 — P57-a 행 실측 레거시 프레임 75/75 · 4방향 26 · 카페 옆면 픽셀 차 3,978. 골든은 재베이크 없이 그대로) — ① main 아틀라스(344 프레임, 1.8MB) → `ppaji/public/assets/kairo-atlas.{png,json}`, 캐시 태그 v15 ② `kairoFrameFor(id, json)`: `facility/<id>:d<facing>` 우선(main 은 4방향 시설에 옛 키가 없다 → 그대로 두면 26종이 절차 도형으로 떨어진다), 없으면 옛 키 + 뒤집기 ③ 발자국 6종 = main(`facilities.json` w/d) — 골든·킷·검사 35 그대로 통과(봇이 그 여섯을 안 짓는다) ④ `p57a.test.ts` 3 · 하네스 `verifyP57a`(레거시 프레임 ≥49 · 4방향 ≥26 · 카페 옆면 ≠ 뒤집은 앞면 · 카페 3×2 배치 · PNG v15). 브라우저 실측: ppaji 시설 148 전부 캔버스, 카페 d0/d1 106×78 · 다른 픽셀 4,767. ⚠ 하네스 P45-c 행이 빨갰다(밤 이용 0): 찜질방이 4×4 가 되며 (gt.i+5, gt.j+9) 가 시드 20260902 에서 밤 이용 0 — 헤드리스 A/B 로 3×3 도 시드 1 에서 0 이라 **발자국 탓이 아니라 1~5 건짜리 수의 시드 주사위**다(구조 문제 없음, 7시드 × 2 발자국 실측) → 자리를 (gt.i+6, gt.j+8) 로(이 시드에서 4). ⚠ CLAUDE.md 는 **main 본문 + 우리 ppaji 단락 3** 으로 다시 짰다 — 옛 우리 레거시 절(P1 IA 「버튼 1·제어 3」)이 main 코드(6 role-controls)와 어긋나 main 의 `docs-review.test` 가 빨갰다.

- **M3 ✅ P57-b** (`gate -- p57b` 통과 2026-09-14: vitest 495 · 밴드 충족 · 하네스 335 — P57-b 3행 실측 풍경 14 · 바깥 env 장식 24 · 버스 env_bus · 시작 env 18 · 정의 177 · `?scenery=0` 풍경 0. 재베이스 둘: p26 장식 22 → 51 · 하네스 P21 새 판 시설 27 → 45) — ① env 29 → `facilities.json` 장식(decor · capacity 0 · main 비용 ×0.3 → cost/pop 90 띠 · `facings: 4` 표기만, ppaji 는 d0·d1 두 방향). 해금은 **상점 행 없이**(봇이 상점 최저가를 사서 골든이 흔들린다) 시작 18(울타리·돌담·생울타리·난간 12 + 관목·화분·화단·벤치·가로등·바위) · ★1 나무 3 · ★2 건물 6 + 버스·승용차(`ranks.json` unlocks). 골든은 해시만 재베이크(방문객 820/842/876 · 시설 수 동일 — 봇은 장식을 안 짓는다). ② 풍경은 35장이 아니라 **3장 + 유리벽·문·외벽 32장**이었다 — 먼 산·가까운 숲 2장을 main `buildBackdrop` 과 같은 자리(줄 −36·−26, 24타일 폭, 원점 y 0.515)에 잇고, 건너편 둑(farbank)은 우리 강이 남쪽이라 뺐다(`src/assets/landscape.ts`, `?scenery=0` 대조군). ③ P44-d 임시 장식을 env 그림으로 교체 — 보도 가로등 `env_street_lamp` · 길 건너 마을 줄 6종 · 들판 이웃(펜션·단독주택·호텔·창고) · 도로 버스 `env_bus` d1(+I 방향, 절차 상자 폴백). 유리벽(③)은 스크린샷 뒤 결정. 검사 `p57b.test` 3 · 하네스 P57-b 3행 · human-check H62.

- **P57-c (2026-09-15) 배포본 404 + 승인 배치 절충** — ① 사용자 실측 「5189 에서 그림이 안 붙는다」 = dist 에서 `--pic-sheet: url("assets/pictures.png")` 가 `/assets/assets/…` 404(Chrome 은 `var()` 안 상대 url 을 그 변수를 **쓰는 스타일시트** 위치로 푼다; dev 는 `<style>` 라 멀쩡, 게이트는 dev 만 잰다) → `src/ui/asset-url.ts` `assetUrl()` 로 시트·장면 4 URL 절대화 + 정적 검사 `asset-url.test.ts`. ② main 의 `e38abf2` 「approved entrance layout」(다른 세션)이 새 판을 13×8 방·평상 삭제·정문 첫 화면으로 덮어썼고 하네스 79곳에 `layout=reference` 를 붙여 **옛 킷만 재고 있었다**(봇·골든도 옛 킷). 사용자 결정: **출입동 = 옛 킷 20×13 · 킷 시설·장식·첫 화면 = main**. 구현: `arrivalRoom = kitIndoorRect`(건물 안 건드림, `config.indoor` 무시 — JSON 은 main 원본과 바이트 동일 유지) · 실내 매점은 줄 11(줄 10 은 매표소와 겹침) · **장식은 물가 산책로 두 줄을 비운다**(20×13 에선 남쪽 장식 줄 21~23 이 산책로에 얹혀 잔교 길을 끊어 코스 탑승 0 이었다 — 실측) → env 16 · 킷 21. 하네스 `layout=reference` 82곳 제거, 봇·골든·measure 는 `{ arrival: true }`(골든 823/839/878 · 16일 현금 15~17만 — 평상 없는 킷의 실제 값). 재박은 행: G25 킷 21 · 첫 화면 「정문·앞마당, 물 ≥ 5%」 · P0 킷 21 · G55 이동 대상 = 실내 매점(main 규칙이 매표소 이동을 막는다) · P17·P22·P24·P25·P27·P28·P29·P30 은 절이 물가 평상 둘(gt+12,+13 · gt−4,+14 — 등급 3·수영만·장식 반경 밖)을 놓고 잰다 · P39 새 건물·P46 간격·P28/P25 자판기는 킷 장식을 피한 좌표 · main 의 「통합」 3행은 절충 값(실내 259·장식 16·입장 줄 9~21). 밴드 재보정 둘: `foodShare` 하한 0.2 → 0.15(중앙 0.18) · `rigUseShare` 상한 0.6 → 0.65(중앙 0.61) — 평상 없는 킷의 효과, 사용자 결정에 따른 재박기.

- **P57-d (2026-09-15) 유리벽 32장 중 8 + deco 별칭** — 사용자 「기구 외엔 쭉 진행」. ① main `kairo-environment-v1` 의 유리벽·유리문 4방향 8장(192×192)을 `ppaji/public/assets/landscape/` 에 두고 `loadLandscape` 가 같이 든다. 실내 벽 그리기(P44-b 절차 면)는 변마다 그림 한 장(서 d1·북 d0·동 d3·남 d2 — main `drawWallEdge` 의 `[3,2,1,0][dir]`), 문 변은 유리문, 없으면(`?scenery=0`) 절차 면 그대로. 출입동 20×13 = 68장(둘레 66 + 정문 칸 홈 2). 외벽(solid_wall)·정문(outside_gate) 24장은 안 썼다 — ppaji 는 실내 벽이 유리 하나뿐. ② `kairoFrameFor` 에 `DECO_ALIAS`: 안전요원 의자 → `deco/guard_stand`, 장승 → `deco/sculpture`(둘 다 1×1·32폭, facing 1 은 뒤집기). 하네스 P57-d 2행.

- **P57-e (2026-09-15) 태블릿·가로 열** — 사용자 「태블릿에선 탭이 너무 길어지고 가로로 전체 페이지」. 실측 iPad 가로 1180: 건설 창 전폭·카드 400px·독 전폭. 결정: **UI 면은 가운데 폰 폭 열(`--ui-max` 520px)에 모으고 지도만 전체**(카이로 태블릿 UI 의 비례 유지) — 헤더·티커·하단 바·오른쪽 밴드·창·독·튜토리얼·사건 태그 8곳 좌우에 `--ui-side = max(0, (100vw−520)/2)`. 폰 393 은 0 이라 불변. 폰 가로(높이 ≤ 500)의 「돌려 주세요」 덮개는 그대로. 정적 검사 `ui/tablet-column.test.ts`. 사람 확인 H63.

## 4. 결정이 필요한 것

- ① **커밋**: M0 이 커밋이다. 지금 미커밋 348 파일을 `Junnjjj/게임시스템-v2` 에 한 커밋(또는 P 단위 여러 커밋)으로 넣어도 되나.
- ② **발자국 6종**을 main 값으로 바꿀지(카페 2×3→3×2 등은 킷·하네스 좌표를 흔든다) — 바꾸는 쪽을 권고(에셋과 발자국이 어긋나면 P55 계약 검사가 빨갛다).
- ③ 풍경·유리벽 범위(M3 ②③) — ①②만 먼저, ③은 스크린샷 보고.

## 5. 소요

M0 10분 · M1 30분(문서 병합 포함) · M2 반나절(발자국 6종 + 골든 + 하네스) · M3 반나절~하루.
- **M4 ✅** — `plan-ppaji-story.md` §7 · CLAUDE.md 포인터 · 메모리 · `ppaji/README.md` · human-check H62 · dist 5189 재빌드. 남은 결정 ③(유리벽·문·외벽 32장)은 사용자 스크린샷 판단 뒤.
