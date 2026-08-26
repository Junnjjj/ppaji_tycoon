# 홈/메뉴 셸 v2 검수

홈은 목표 모델 A/B/C와 production callback을 유지하면서 세로 3장 기둥을 없앴다. A/B/C는 티커 바로 위의 **한 밴드**(높이 64px)에 나란히 서고, A가 약 60%·B/C가 각각 약 20%를 갖는다. 메뉴·건설·패널·코스가 열리면 `setGoalSurface(mode)` 한 경계가 목표 루트를 숨기고, 모두 닫히면 홈으로 복원한다.

## ⚠ 한 밴드로 바꾼 이유 — 예산은 산술이다 (2026-08-25 개정)

처음 구현은 A를 하단 전폭 카드, B/C를 헤더 아래 별도 행으로 두었다. 그 형태로는 HUD 화면 예산(세로 24% · 가로 36%, CLAUDE.md K47-②)을 **구조적으로** 못 지킨다. 실측:

| 형태 | 세로 | 가로 |
|---|---|---|
| 상자 둘 (A 하단 전폭 + B/C 상단 행) | 28% ✗ | 53% ✗ |
| 위 + 가로 폭 캡 | 28% ✗ | 39% ✗ |
| 위 + B/C 내용폭(각 150px) | 28% ✗ | 39% ✗ |
| 위 + B/C 내용폭 + A 56px | 28% ✗ | 39% ✗ |
| **A/B/C 한 밴드 (377×64)** | **24% ✓** | **35% ✓** |

고정 크롬(티커·헤더·하단바)만으로 세로 16.4%p·가로 27.7%p를 쓴다. 전폭 A 카드(377×64) 하나가 세로 7.2%p이므로 **A만 있어도 23.6%**다 — B/C를 아무리 좁혀도 1%p도 안 내려간다. 셋을 한 밴드에 넣으면 칠하는 넓이가 밴드 하나뿐이라 예산 안에 들어온다. 예산 상수는 올리지 않았다.

가로에서는 밴드를 `--goal-col`(377px)로 캡한다. 852px 현수막은 화면의 14%p를 먹고 읽기도 나쁘다 — K47-①이 헤더에서 이미 배운 것이다.

## DOM 계약

- `#kairo-top` 안의 버튼은 0개다.
- `#kairo-bar`의 직접 버튼은 `#kairo-menu-open`, `#kairo-build-open` 두 개뿐이다.
- `#kairo-goal`은 `.kgoal-primary`와 `.kgoal-secondary`를 **이 순서로** 가지며 `.kchipcol`은 없다.
- `#kairo-goal`은 **자기 상자가 곧 칠하는 것**이다 — 높이 `--goal-band`(64px), 폭은 세로에서 전폭·가로에서 `--goal-col`(377px) 캡. 한때 `position: fixed; inset: 0`이라 경계 상자로 화면 전체를 덮어 HUD 예산이 100%로 나왔고 "시트를 닫으면 화면이 돌아온다"까지 같이 깨졌다.
- A(`[data-goal-role="immediate"]`)는 밴드의 50~70%를 차지하고 제목에 말줄임표를 쓰지 않는다. B/C는 각각 15~25%이고 **아이콘+진행 축약**이다 (글자는 CSS가 감추고 전문은 `aria-label`에 남는다).
- 셋 다 높이 64px이라 44px 터치 계약은 높이로 지켜진다.
- HUD 예산 검사는 `display: contents` 통과 상자를 **뚫고** 실제 칠하는 자식을 잰다 — 안 뚫으면 예산이 내려간 게 아니라 HUD를 안 세는 검사가 된다.
- 메뉴의 직접 경영 루트는 `.kmanage` 하나이며 내부 의미 순서는 Today, 경고, 운영/성장/기록이다.
- Today 버튼 전체가 한 번의 터치로 기존 추천 action을 실행한다. 아이콘·이유·상세는 기존 `TodayRecommendation`의 action/source에서만 파생한다.

## 캡처와 무라벨 A/B 검수

비교할 때 파일명을 가리고 두 홈 이미지를 임의 순서로 제시한다. 검수자는 “다음 행동을 3초 안에 찾는가”, “지도와 목표 중 무엇이 먼저 읽히는가”, “첫 행동을 어디를 탭할지 설명 없이 고르는가”만 답한다.

- 변경 전 기준: [`tmp-shots/ui-prod-home.png`](../tmp-shots/ui-prod-home.png)
- 새 세로 홈: [`tmp-shots/kairo-home-shell-v2-portrait.png`](../tmp-shots/kairo-home-shell-v2-portrait.png)
- 새 가로 홈: [`tmp-shots/kairo-home-shell-v2-landscape.png`](../tmp-shots/kairo-home-shell-v2-landscape.png)
- 새 세로 메뉴: [`tmp-shots/kairo-menu-shell-v2-portrait.png`](../tmp-shots/kairo-menu-shell-v2-portrait.png)
- 새 가로 메뉴: [`tmp-shots/kairo-menu-shell-v2-landscape.png`](../tmp-shots/kairo-menu-shell-v2-landscape.png)

자동 측정은 `PPAJI_URL=<fresh-vite-url> npx tsx tools/verify-kairo.ts --shell-v2`로 실행한다. 이 검사는 fresh context의 첫 프레임, 메뉴 한 번 터치, portrait/landscape 배치, A 제목 overflow, 44px 타깃, 문서 overflow, 메뉴/건설/코스 목표 숨김과 닫기 복원, 시트·Today·그룹·행의 computed opacity/background recipe를 함께 확인한다.

사람 무라벨 A/B 선호 검수는 아직 별도 사용자 세션에서 수행해야 한다. 자동 검증 결과는 시각 선호를 대신하지 않는다.

## 구현 검증 기록

아래 RED/GREEN 수치는 구현 당시 기록이다. 2026-08-25 pre-fix 외부 재실행에서는 onboarding
v2의 첫 A 문구가 `시작 코스 열기`여서 축자 문구 검사 두 건이 실패하는 **13/15 RED**를
재현했다. production A 문구를 `물려받은 코스 시험 운행`으로 맞추고 dirty-tree source
digest를 더한 게이트는 **16/16**이었다. post-fix에서 불투명 computed recipe 두 건과
세로·가로 실제 티커 hit-test 두 건을 더한 현재 집중 게이트는 **20/20**이다. 폭·한 행·
`elementFromPoint` 44/44·실제 CDP 터치·overflow·모드별 hidden도 통과하며 최신
캡처와 결과는
`docs/ui-shell-v2-validation.md`가 정본이다.

- RED 1: `npx vitest run src/ui/kairo-goals.test.ts src/ui/kairo-ui-contract.test.ts` → 5 failed / 6 passed. `GoalSurfaceState` 미구현, 새 `.kgoal`/primary/secondary/hidden 계약 부재를 확인했다.
- GREEN 1: 같은 명령 → 11/11 passed.
- RED 2: `npx vitest run src/ui/kairo-management.test.ts` → 2 failed / 3 passed. Today presentation과 동적 보조값 adapter가 없음을 확인했다.
- GREEN 2: 같은 명령 → 5/5 passed.
- 최종 focused unit: goals/UI contract/management/panels/share 5 files, 31/31 passed.
- 구현 당시 real-touch browser는 15/15였고 source identity 추가 뒤 16/16이었다. 현재는
  불투명 computed recipe와 티커 hit-test를 더해 **20/20**이다. portrait 지도 틈 612px,
  landscape 153px, 중앙 티커 44×44px의 44/44 표본, 최소 타깃 44px, 문서 overflow 0px,
  Today 68px였다.
- `npm run typecheck`와 `npm run lint` passed. `node tools/check-ui-surface.mjs` 27/27 passed. `git diff --check` passed.
