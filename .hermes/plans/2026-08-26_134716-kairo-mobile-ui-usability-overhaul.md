# 카이로식 모바일 UI 사용성 전면 재구축 계획

> **For Hermes:** 구현 전 393×852 정적 비교 시안을 사용자에게 승인받고, 승인 뒤 task별 RED→GREEN→실제 터치 검증으로 진행한다.

**Goal:** 현재 UI의 “크기는 44px지만 실제로 안 눌리고, 의미가 불명확하며, 상태가 끝나지 않는” 문제를 제거하고, 카이로소프트식의 큰 글자·명시적 모드·항상 보이는 뒤로/확정·짧은 조작 동선으로 홈·메뉴·건설·코스를 다시 구성한다.

**Architecture:** 시뮬레이션과 저장 계약은 바꾸지 않는다. `PanelHost`를 유일한 화면 소유권 경계로 삼고, 홈/시트/배치/코스 중 하나만 입력을 소유하게 한다. 현재의 일시적 토스트와 암묵적 brush 잔류 대신 UI 상태 머신이 `idle → select → aiming → confirmed/cancelled`를 명시적으로 종료한다.

**Tech Stack:** TypeScript 5.9, DOM/CSS HUD, Phaser 3.90, Vitest 3.2, Playwright/CDP 실제 터치, 기존 `tools/verify-kairo.ts`.

---

## 0. 조사 결론 — 이전 “통과” 판정은 사용성 완료 근거가 아니다

### 0.1 393×852 실측 재현

2026-08-26 `main` (`e8bc663`)을 Chrome 모바일 393×852에서 직접 열어 측정했다.

1. **메뉴의 보이는 버튼 4개가 실제로 안 눌린다.**
   - `결산`, `감상`, `인증`, `엔딩`은 모두 87×44px로 그려진다.
   - 하지만 각 버튼 중심의 `document.elementFromPoint()`는 버튼이 아니라 하단 `메뉴/건설` 바를 반환했다.
   - 즉 기존 검사는 bounding box만 통과시켰고 실제 터치 소유권을 놓쳤다.
2. **`새 판`은 화면 밖이다.**
   - `새 판`: `x=199, y=852, w=187, h=56`.
   - 852px 뷰포트에서 버튼 전체가 아래로 밀려 있다. `배속`도 같은 상태다.
3. **홈 B/C 목표는 사용자에게 뜻을 말하지 않는다.**
   - 시각적으로 B는 하트, C는 별뿐이다.
   - CSS가 보조 목표의 label/detail을 의도적으로 `display:none` 처리한다 (`src/ui/style.css:1086-1089`).
4. **메뉴 보조 글씨는 실제로 9~10px다.**
   - Today 이유 9px, 상세 9px, 경고 9px, 그룹 제목 10px (`src/ui/style.css:3176-3259`).
   - 393px에서 4열 버튼을 유지하려고 글자를 줄인 구조다 (`src/ui/style.css:3268-3275`).
5. **티커와 하단 바가 시트보다 높은 입력층에 남는다.**
   - 시트는 `z-index:10`, 하단 바도 `z-index:10`, 티커는 `z-index:11`이다 (`src/ui/style.css:1115-1130, 1207-1215, 2953-3000`).
   - 메뉴를 열어도 홈 입력층이 살아 있어 시트의 하단 버튼을 가린다.
6. **건설 반복 입력은 사용자의 착각이 아니라 현재 구현 계약이다.**
   - 시설 성공 뒤 `endAim()`만 하고 brush는 남긴다 (`src/main.ts:562-588`). 다음 지도 탭이 다시 조준을 연다.
   - 바닥은 성공 뒤 명시적으로 `refreshAim()`하여 연속 배치를 유지한다 (`src/main.ts:772-778, 848-890`).
   - 실제 터치 재현: 석재 보도 첫 확정 후 aim과 확정 바가 남았고, 다음 칸이 즉시 활성화됐다. 현금은 `5,000,000 → 4,993,000 → 4,986,000`으로 두 번 차감됐다.
   - 기존 하네스도 바닥/철거에서 “확정 뒤에도 바가 남아야 한다”를 통과 조건으로 적극 고정한다 (`tools/verify-kairo.ts:6679-6681, 6750-6753`). 구현할 때 새 검사만 추가하는 것이 아니라 이 옛 기대값을 one-shot 기본 계약으로 교체해야 한다.
7. **코스 적용은 2.6초 토스트 뒤 증거가 사라진다.**
   - 적용 성공 callback은 토스트를 띄우고 (`src/main.ts:2368-2371`), 패널은 즉시 닫힌다 (`src/ui/kairo-course.ts:1094-1124`).
   - 토스트 자체가 2.6초 뒤 사라진다 (`src/main.ts:916-928`).
   - 적용 직후 토스트가 홈 A/B/C 카드 위를 덮고 두 줄로 접혔으며, 3초 뒤에는 “적용됨” 상태가 하나도 남지 않았다.
   - 핸들을 움직이지 않아 변경값이 0이어도 시험 뒤 `적용`이 나타나므로 “무엇이 적용됐는가”가 더 불명확하다.
8. **기존 브라우저 게이트의 범위가 좁다.**
   - `tools/verify-kairo.ts:456-518`은 홈 목표 크기와 overflow를 잰다.
   - `tools/verify-kairo.ts:520-575`의 `elementFromPoint`는 티커 손잡이만 잰다.
   - 메뉴 게이트는 Today 버튼 하나와 첫 폴드 배치만 검사하며 (`tools/verify-kairo.ts:581-654`), 메뉴 안의 모든 실제 버튼 중심 소유권은 검사하지 않는다.

### 0.2 카이로소프트 레퍼런스에서 가져올 원칙

공식 *Pool Slide Story* Steam/App Store 화면과 *Dream Park Story* App Store 화면을 조사했다. 픽셀 장식이나 문구를 복제하지 않고 조작 문법만 채택한다.

- 맵 화면의 상시 핵심 버튼은 `SAVE`, `MENU`처럼 **아이콘만이 아니라 행동 이름을 함께 쓴다**.
- 건설/편집 모드에는 `Build`, `Info`, `Settings`, `Back`처럼 **현재 모드와 이탈 버튼이 항상 보인다**.
- 배치 화면은 방향 화살표·남은 타일·Back을 같은 화면에 보여 **“지금 편집 중”임을 숨기지 않는다**.
- 시설 선택 화면은 큰 그림 카드에 층수·타일·비용을 함께 보여 선택 결과를 미리 안다.
- 시설 정보 화면은 `Ticket Fee`, `Maintenance`, `Area`, `Height`처럼 **라벨이 있는 수치**와 `Change Settings`, `Research`처럼 **동사형 버튼**을 분리한다.
- 심사/사건 화면은 제목 → 요구조건 → 한 문장 안내의 한 장면으로 집중시키며, 뒤 지도 입력은 받지 않는다.
- 큰 버튼, 굵은 글자, 고대비 외곽선은 장식이 아니라 작은 화면에서 상태를 즉시 읽게 하는 도구다.

공식 근거:
- Pool Slide Story Steam: https://store.steampowered.com/app/1933980/Pool_Slide_Story/
- Pool Slide Story App Store: https://apps.apple.com/us/app/pool-slide-story/id1321340307
- Dream Park Story App Store: https://apps.apple.com/us/app/dream-park-story/id1575192531
- WCAG 2.2 Target Size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

WCAG 2.2의 24×24px는 최소 규격일 뿐이며, 겹친 target의 오작동을 막기 위한 충분한 크기와 간격을 요구한다. 이 프로젝트는 44px를 유지하되 **실제 topmost hit ownership**까지 통과해야 한다.

---

## 1. 새 UX 계약

### 1.1 홈 — 목표 3칸이 아니라 “지금 할 일 한 줄”

- 상단은 주차/시간, 현금, 방문객, 등급, 위험도만 읽는다.
- 하단에는 카이로식 직원 메시지 바처럼 **현재 행동 한 개**를 표시한다.
  - 예: `다음 할 일 〉 물려받은 코스를 시험 운행하세요`.
- B/C의 문자·하트·별 아이콘 카드는 홈에서 제거한다.
- 중기/장기 목표는 메뉴의 `목표` 화면에서 이름과 진행률로 읽는다.
- 상시 행동은 `메뉴`, `건설` 두 개만 유지하되 아이콘+텍스트를 함께 쓴다.
- 티커는 홈에서 읽기 전용 뉴스로만 보이고, 알림함은 메뉴 안에서 연다. 26px 띠에 44px 투명 hit surface를 겹치는 구조를 제거한다.

### 1.2 화면 소유권 — 한 순간에 한 층만 누른다

상태를 다음과 같이 고정한다.

| 상태 | 보이는 입력 | 숨기는 입력 |
|---|---|---|
| `home` | 현재 행동, 메뉴, 건설 | 없음 |
| `sheet` | 시트 안 버튼, 닫기 | 홈 목표, 티커 hit, 메뉴/건설 바 |
| `aiming` | 취소, 연속 설치 toggle, 회전, 설치 | 홈 목표, 티커, 메뉴/건설 |
| `course-edit` | 설정, 취소, 시험 운행 | 홈 목표, 티커, 메뉴/건설 |
| `course-review` | 다시 조정, 이 설정 적용 | 홈 목표, 티커, 메뉴/건설 |
| `course-applied` | 적용 완료, 닫기, 다시 조정 | 홈 목표, 티커, 메뉴/건설 |
| `modal` | 모달 내부 선택만 | 나머지 전체 |

규칙:
- 보이는 enabled control의 중앙과 네 inset 지점에서 `elementFromPoint`가 반드시 자기 자신 또는 자식이어야 한다.
- 화면에 일부만 걸친 버튼은 “보이는 버튼”으로 취급하지 않는다. 스크롤 컨테이너가 clip한다.
- 시트는 하단 바 위에 얹는 것이 아니라, 열리는 동안 하단 바를 대체한다.

### 1.3 폰트 계약 — 9px 사용 금지

393×852 기준:

- 화면 제목: 최소 18px/900.
- 주요 행동 버튼: 최소 16px/800.
- 카드 이름·핵심 수치: 최소 15px/800.
- 본문·버튼 상세: 최소 13px/700.
- 보조 설명: 최소 12px. 단독 행동 의미를 보조 글씨에만 두지 않는다.
- 12px 미만은 디버그/법적 각주 외 금지.
- 주요 버튼은 최소 48px 높이, 나머지는 기존 44px 최소를 유지한다.
- B/C처럼 접근성 이름만 있고 화면에는 아이콘만 보이는 주요 행동을 금지한다.

### 1.4 메뉴 IA — `새 판`을 정상 운영 버튼에서 분리

첫 화면:

1. `오늘 할 일` — 현재 행동 하나.
2. `운영` — 가격, 직원, 코스.
3. `성장` — 목표, 심사, 단골.
4. `기록` — 결산, 도감, 인증.
5. `설정` — 배속, 알림, 저장/게임 설정.

- 393px에서 4열을 금지하고 최대 2열 또는 한 줄 목록을 쓴다.
- `새 판`은 `설정 > 저장 및 새 게임 > 새 게임 시작` 안에 둔다.
- 새 게임은 현재 자동 저장을 덮는 파괴적 행동이므로 맵/시나리오 선택 뒤 두 번째 확인을 요구한다.
- `배속` 옆에 `새 판`을 같은 위계로 놓지 않는다.

### 1.5 건설 — 1회 설치가 기본, 연속 설치는 명시적 선택

건설 흐름:

1. `건설`을 누른다.
2. 카테고리와 큰 카드 2열에서 대상을 선택한다.
3. 시트가 닫히고 상단에 `배치 중: 석재 보도 · 1칸당 1만`을 표시한다.
4. 지도를 움직여 고스트/레티클을 맞춘다.
5. 하단에서 `취소 | 연속 설치 끔 | 설치`를 누른다.
6. 기본 상태에서는 설치 성공 즉시 `brush=null`, `aim=null`, ghost/reticle/confirm을 제거하고 홈으로 돌아간다.
7. `연속 설치 켬`을 사용자가 직접 선택한 경우에만 brush와 조준을 유지한다. 모드 표시에 `연속 설치 중`을 계속 쓴다.
8. 성공 receipt는 `석재 보도 설치 완료 · −1만`처럼 대상과 비용을 함께 보이고 다른 버튼을 덮지 않는다.

모드 전이:

```text
HOME → BUILD_CATALOG → PLACEMENT_AIM → PLACEMENT_CONFIRM
                                  ├─ 취소 → BUILD_CATALOG
                                  └─ 설치 → PLACEMENT_DONE
                                               ├─ 완료 [기본] → HOME
                                               ├─ 같은 것 더 짓기 → PLACEMENT_AIM
                                               └─ 다른 것 선택 → BUILD_CATALOG
```

시설·바닥·건물·철거·이동 모두 같은 종료 계약을 사용한다. 호출부마다 `setBrush(null)`을 복제하지 말고 `finishBuildAction({ repeat })` 같은 한 경계로 통합한다.

### 1.6 코스 — 적용 결과가 사라지지 않는다

코스 독은 단계 제목을 가진다.

1. `1 조정` — 핸들과 설정.
2. `2 시험 운행` — 4초 진행률과 손님 반응.
3. `3 결과 확인` — 현재→예상 변화, 비용, 기록 후보.
4. `적용 완료` — 새 현재값, 실제 차감액, 저장 완료 표시.

세부 규칙:
- 변경이 0이면 `적용` 대신 `변경 없음`을 비활성 상태로 보여 준다.
- 버튼은 `적용`이 아니라 `이 설정 적용`으로 쓴다.
- 성공 직후 패널을 닫지 않는다. `적용 완료` 상태에서 갱신된 현재값과 비용을 확인한 뒤 사용자가 `닫기`를 누른다.
- 토스트는 보조 feedback일 뿐 성공의 유일한 증거가 될 수 없다.
- 재접속 후 같은 코스를 열었을 때 적용값이 그대로여야 한다.

---

## 2. 구현 계획

### Task 1: 현재 결함을 RED 브라우저 검사로 고정

**Objective:** 지금 실패하는 실제 사용성 문제를 자동 게이트가 먼저 잡게 한다.

**Files:**
- Modify: `tools/verify-kairo.ts`
- Modify: `src/ui/kairo-ui-contract.test.ts`
- Modify: `src/ui/kairo-course-phase2-surface.test.ts`
- Create: `src/ui/kairo-interaction-ownership.test.ts`

**Steps:**
1. 393×852 메뉴를 열고 모든 viewport 내부 enabled control의 중앙+네 지점을 `elementFromPoint`로 검사한다.
2. `결산/감상/인증/엔딩`이 하단 바에 가려져 RED인지 확인한다.
3. `새 판` rect가 viewport 밖이라 RED인지 확인한다.
4. 9~10px 주요/보조 action text가 typography gate에서 RED인지 확인한다.
5. 시설과 바닥을 각각 한 번 확정한 뒤 `brush`, `aim`, confirm visibility, 현금 차감 횟수를 검사한다. 두 번째 지도 탭이 비용을 차감할 수 있어 RED인지 확인한다.
6. `tools/verify-kairo.ts:6679-6681, 6750-6753`의 옛 “확정 바 유지” 기대를 찾아 one-shot 기본 실패 조건으로 먼저 뒤집는다.
7. 코스 핸들을 실제 CDP touch로 이동 → 시험 → 적용하고, 적용 완료 상태와 갱신 current 값이 없어 RED인지 확인한다.
8. 테스트가 현재 결함 때문에 실패하는지 확인한 뒤에만 구현한다.

### Task 2: 실제 393×852 비교 시안 승인

**Objective:** CSS 수정부터 시작하지 않고 홈·메뉴·건설·코스 네 상태를 실제 크기로 먼저 결정한다.

**Files:**
- Create: `docs/ui-kairo-usability-v3.md`
- Create: `.hermes/artifacts/ui-v3/home-menu-build-course-393.html`
- Create: `.hermes/artifacts/ui-v3/*.png`

**Steps:**
1. 현재 캡처와 같은 393×852 배경 위에 홈/메뉴/건설 조준/코스 적용 완료를 그린다.
2. 무라벨 A/B 비교로 “현재 UI”와 “v3 제안”을 나란히 제공한다.
3. 작은 글씨, 숨은 새 게임, 아이콘-only 목표, 연속 설치 ambiguity가 시안에서 제거됐는지 사용자에게 확인받는다.
4. 사용자 승인 전 production CSS/TS를 수정하지 않는다.

### Task 3: 단일 입력 소유권과 typography foundation

**Objective:** 어떤 화면에서도 홈 HUD가 시트/모드를 덮지 않게 하고 글자 최소값을 강제한다.

**Files:**
- Modify: `src/ui/panels.ts`
- Modify: `src/ui/kairo-hud.ts`
- Modify: `src/ui/style.css`
- Test: `src/ui/kairo-interaction-ownership.test.ts`

**Steps:**
1. `home/sheet/aiming/course/modal` surface 상태를 한 소유 경계로 확장한다.
2. 시트/편집 중 `.kbar`, `.kticker`, `.kgoals`의 입력과 표시를 제거하고 context actions로 교체한다.
3. `z-index` 경쟁으로 해결하지 말고 DOM 가시성과 pointer ownership으로 해결한다.
4. 12px 미만 production action text를 제거한다.
5. 모든 visible control의 5점 hit ownership과 44/48px 타깃을 GREEN으로 만든다.

### Task 4: 홈과 메뉴 IA 재구축

**Objective:** 홈에서는 지금 할 일 하나만 읽히고, 메뉴에서는 기능과 설정이 이름으로 이해되게 한다.

**Files:**
- Modify: `src/ui/kairo-hud.ts`
- Modify: `src/ui/kairo-management.ts`
- Modify: `src/sim/kairo/meta.ts` only if presentation grouping needs data, not for new game rules
- Modify: `src/main.ts:2590-2603, 2931-3002`
- Modify: `src/ui/style.css`
- Test: `src/ui/kairo-goals.test.ts`
- Test: `src/ui/kairo-management.test.ts`
- Test: `src/ui/kairo-ui-contract.test.ts`

**Steps:**
1. A/B/C 한 밴드를 현재 행동 한 줄로 교체한다.
2. 중·장기 목표를 메뉴의 목표 화면으로 옮긴다.
3. 메뉴 4열을 1~2열로 바꾸고 action마다 아이콘+동사+현재값을 보인다.
4. 설정 화면을 만들고 배속/알림을 옮긴다.
5. `새 판`을 설정 하위의 `새 게임 시작`으로 옮기고 두 단계 확인을 붙인다.
6. 메뉴 첫 폴드/스크롤 후 모든 항목이 실제 touch로 열리는지 확인한다.

### Task 5: 건설 상태 머신을 1회 설치 기본으로 교체

**Objective:** 설치 완료·취소·화면 전환 뒤 brush/ghost/handler가 남지 않게 한다.

**Files:**
- Modify: `src/main.ts:300-890`
- Modify: `src/ui/kairo-hud.ts:411-480`
- Modify: `src/ui/style.css:1635-1750`
- Create: `src/ui/kairo-build-flow.test.ts`
- Modify: `tools/verify-kairo.ts`

**Steps:**
1. 공통 `BuildSession` 또는 동등한 상태 경계를 만든다: `idle/selecting/aiming/repeating`.
2. 성공 종료를 한 함수로 통합해 brush, aim, ghost, reticle, confirm callback을 원자적으로 지운다.
3. repeat 기본값을 false로 둔다.
4. 명시적 `연속 설치` toggle에서만 같은 brush를 유지한다.
5. 시설·바닥·건물·철거·이동 각각 성공/실패/취소/메뉴 전환을 검사한다.
6. 1회 설치 뒤 빈 지도 touch로 현금·terrain·placement가 바뀌지 않는지 확인한다.
7. 연속 설치를 켰을 때만 두 번째 설치와 두 번째 비용 차감이 일어나는지 확인한다.

### Task 6: 코스 적용 receipt와 no-op 차단

**Objective:** 무엇을 적용했는지 사용자가 확인한 뒤 화면을 닫게 한다.

**Files:**
- Modify: `src/ui/kairo-course.ts:1020-1125`
- Modify: `src/main.ts:2340-2373`
- Modify: `src/ui/style.css`
- Modify: `src/ui/kairo-course-phase2-surface.test.ts`
- Modify: `tools/verify-kairo.ts`

**Steps:**
1. 편집 전 snapshot과 후보 snapshot을 비교해 no-op을 파생한다.
2. no-op이면 시험은 가능하되 적용 action을 `변경 없음`으로 비활성화한다.
3. 적용 성공 뒤 `hide()`를 호출하지 않고 `applied` surface로 전환한다.
4. `적용 완료`, 새 현재값, 비용, 기록 반영 여부를 표시한다.
5. `닫기` 뒤에만 홈으로 돌아간다.
6. 실제 handle drag → 4초 시험 → 적용 → 닫기 → 재열기 → reload 순서로 persistence를 확인한다.

### Task 7: 사용자 편의 회귀 게이트와 외부 승인

**Objective:** “자동 통과했지만 실제로 안 눌리는” 상태를 다시 허용하지 않는다.

**Files:**
- Modify: `tools/verify-kairo.ts`
- Modify: `docs/ui-kairo-usability-v3.md`
- Modify: `docs/ui-shell-v2-validation.md` — v2가 구조 검증일 뿐 사용자 승인 완료가 아님을 명시
- Modify: `CLAUDE.md` only after final acceptance

**Required verification:**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run verify:kairo -- --ui-v3
```

브라우저 판정:
- 393×852, 852×393 모두 검사.
- 신규 세이브와 기존 v8 세이브를 분리.
- 모든 visible enabled control 5점 `elementFromPoint` ownership 통과.
- viewport 밖에 반쯤 보이는 버튼 0.
- 주요 action 16px, 본문 13px, 보조 12px 최소.
- 메뉴/건설/코스/모달 중 홈 입력이 살아 있는 상태 0.
- 건설 1회 설치 뒤 추가 지도 touch의 상태/현금 변화 0.
- 명시적 연속 설치에서만 반복 배치.
- 코스 적용 뒤 persistent receipt, 재열기 및 reload 값 일치.
- 콘솔 오류·요청 실패 0.

사람 승인:
1. 현재/v3 무라벨 홈 A/B.
2. “설명 없이 30초 안에 건설 한 번 하고 종료” 성공.
3. “설명 없이 코스 조정→시험→적용 확인” 성공.
4. `새 게임 시작` 위치와 파괴적 확인 문구 승인.
5. 외부 Quick Tunnel에서 첫 화면·메뉴·건설·코스 적용 완료 화면 승인.

---

## 3. 변경 가능성이 높은 파일

- `src/main.ts` — 건설/코스 callback 조립, 새 게임 진입 위치.
- `src/ui/kairo-hud.ts` — 홈 현재 행동, 시트/배치 surface, context action bar.
- `src/ui/kairo-management.ts` — 메뉴 IA와 설정 진입.
- `src/ui/kairo-course.ts` — no-op, review, applied receipt.
- `src/ui/style.css` — typography, 1~2열 메뉴, overlay ownership, context dock.
- `src/ui/panels.ts` — 한 화면 한 입력 소유권.
- `tools/verify-kairo.ts` — 실제 터치와 elementFromPoint 전면 게이트.
- `docs/ui-kairo-usability-v3.md` — 새 정본.

시뮬 데이터, 시설/장비 데이터, 세이브 버전, RNG, Phaser 카메라/투영은 변경하지 않는다.

## 4. 위험과 금지사항

- 단순히 `z-index`만 올려 가림을 덮지 않는다. 다른 화면에서 역가림이 재발한다.
- 글자를 키우기 위해 action 이름을 아이콘으로 줄이지 않는다.
- 건설 반복 배치를 제거하면서 path 건설 편의까지 없애지 않는다. 명시적 repeat toggle로 보존한다.
- 코스 적용 receipt를 새 모달 난사로 만들지 않는다. 기존 코스 독 안의 마지막 상태로 둔다.
- `새 게임 시작`을 숨기기만 하지 않는다. 설정 IA 안에서 찾을 수 있고 파괴적 의미가 보여야 한다.
- v2 자동 게이트 통과를 사람 사용성 승인으로 표현하지 않는다.
- 사용자 승인 전 main에 병합·푸시하지 않는다.

## 5. 완료 정의

다음 네 문장을 모두 실제 화면과 테스트로 증명해야 완료다.

1. **보이는 버튼은 전부 그 자리에서 눌린다.**
2. **버튼 이름만 보고 다음 결과를 예상할 수 있다.**
3. **건설과 코스의 완료/취소 뒤 입력 상태가 확실히 끝난다.**
4. **393×852에서 설명 없이 새 게임 위치, 1회 건설, 코스 적용 여부를 찾고 확인할 수 있다.**
