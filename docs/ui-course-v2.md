# 코스 편집 v2 — 핵심 조작 화면 검수

계획 §3.3 / Task 4. 코스가 열려 있는 동안 **코스가 화면의 주인공**이 되도록 홈 목표를
정체로 숨기고, 영문 라벨을 없애고, 현재→예상 네 지표를 잘리지 않게 내고,
정보·편집·시험·리뷰 네 상태의 버튼 정체를 한 곳에 모았다.

시뮬·저장 계약은 그대로다. 원자적 편집(`CourseStore.confirmEdit(edit, spend)`),
4초 결정론 시험(`courseTrialPlan`), 적용 성공 뒤에만 쓰는 경력 기록은 손대지 않았다.

## DOM·규칙 계약

- `#kairo-course`의 상단은 `.kcourse-dock` 하나다 — **지표 1행 + 버튼 1행**,
  `max-height: 112px`(실측 자연 높이 109px). 프리셋·장비·보트·코스 목록은 `설정` 뒤다.
- 지표는 `#kairo-course-deltas`의 네 칸(`스릴 · 안전 · 실제 · 손익`)이고
  **말줄임을 쓰지 않는다.** 옛 `.kcourse-chips` 한 줄 요약은 393px에서
  `스릴 18 · 안전 100 · 실제 0…`으로 잘려 현재→예상을 못 읽게 했다 — 그래서 없앴다.
- 값의 정본은 `courseProjection()` 하나이고, 표시 문자열은 순수 함수
  `courseDeltaCells(projection, showDelta)`가 만든다. 정보 상태는 **현재값만**
  (화살표 없음), 편집·시험·리뷰는 `18→24` 꼴이다. 손익은 만원 눈금에 부호를 붙이고
  단위(`만`)는 칸 끝에 한 번만 쓴다.
- 버튼 정체는 순수 함수 `courseDockActions(phase, {canTrial, trialPassed})`가 소유한다.
  `refresh()` 안에서 라벨을 다시 대입하지 않는다 — 영문 `Settings`가 오래 남아 있던
  이유가 그 흩어진 대입이었다.

  | 상태 | 버튼 |
  |---|---|
  | 정보 | `닫기` · `루트 조정` |
  | 생성·편집 | `설정` · `취소` · `시험 운행` |
  | 시험 | `취소` · `시험 운행 중`(비활성) |
  | 리뷰 | `다시 조정` · `적용` |

  한 상태에 없는 버튼은 **DOM에서 뺀다.** 숨겨 두면 하네스의
  `button, [role="button"]` 계수·44px 검사가 안 보이는 것까지 세고, 사람도 그 자리를 못 쓴다.
- 홈 목표는 코스가 **보이는 내내** 숨는다. 경계는 여전히 `hud.setGoalSurface(mode)`
  하나이고, 패널이 `onCourseModeChange(active)`로만 알린다 (옛 `onEditingChange`는
  편집일 때만 참이라 정보 상태에서 `panel`로 남았다 — 정체로 잴 수 없었다).
- `beginRouteEdit()`은 설정 본문을 **자동으로 펼치지 않는다.** 편집의 기본은 독만이다.
- 시험 반응 말풍선은 캔버스 FX 슬롯(`course-reaction`) 그대로이고,
  씬이 실제 발화 시각을 `courseTrialLogForTest()`로만 남긴다 (렌더 전용 검사 표면).

## 실제 터치 게이트

```bash
PPAJI_URL=http://127.0.0.1:<STRICT_PORT> npx tsx tools/verify-kairo.ts --course-v2
```

fresh context에서 393×852와 852×393 두 방향 모두, A 목표 한 번 탭 → `루트 조정` →
**캔버스 손가락 드래그** → `시험 운행` → 리뷰 → `적용`까지 전부
`Input.dispatchTouchEvent`로만 수행한다. 좌표를 직접 넣는 `moveHandleForTest`는 쓰지 않는다.

캡처: `tmp-shots/kairo-course-v2-{info,edit,trial,review}-{portrait,landscape}.png`

## 검증 기록 (2026-08-25)

가장 최근 strict URL 재실행은 source identity와 독/티커 교차 검사를 더해 코스 v2
**20/20**이다. 전체 통합 수치와 캡처 정체는
`docs/ui-shell-v2-validation.md`가 정본이며, 아래 전체 `verify-kairo` 숫자는 구현 중간 시점의
역사 기록이다.

- RED: `npx vitest run src/ui/kairo-course-phase2.test.ts` → 5 failed / 4 passed
  (`courseDeltaCells`·`courseDockActions` 부재).
  `npx vitest run src/ui/kairo-course-phase2-surface.test.ts` → 7 failed / 3 passed
  (영문 `Settings`, delta 격자·독 계약·course 표면·자동 펼침·시험 로그 부재).
- GREEN: 같은 두 파일 19/19 passed.
- `npm run typecheck` · `npm run lint` · `node tools/check-ui-surface.mjs` 27/27 · `git diff --check` 통과.
- 실제 터치 `--course-v2` 20/20 통과. 독 109px · 세로 조작 지도 686px(계약 620px 이상) ·
  최소 타깃 44px · 문서 넘침 0px · 영문 0 · 지표 잘림 0 ·
  시험 반응 4개가 817/1617/2417/3217ms에 각각 발화.
- 회귀: `--phase7` 25/25 · `--shell-v2` 16/16 통과.
- 전체 `verify-kairo` 344/350. 남은 6건 중 홈 셸 v2 의 HUD 예산 4건은
  **후속 통합 수정에서 닫았다** (목표 밴드 — `docs/ui-shell-v2.md`).
  K37 깊이 2건은 계획 §5 가 별도로 남기기로 한 기존 결함이다.
- 후속 통합 수정에서 코스 진입점 id 중복(`kairo-course-open`)을 없앴다 — 레거시 `코스`
  버튼을 걷어내고 경영 메뉴의 `코스` 행동 하나만 남겼다. 그 행동이 물려받은 코스를
  정보 상태로 바로 연다.

## 아직 사람이 해야 하는 것

계획 Task 4 ⑦의 **“설명 없이 30초 안에 조정→시험→적용”** 게이트는 사람 검수다.
자동 검사가 이것을 대신하지 않는다 — 이 게이트를 통과하기 전에는 코스 UI 완료라고 쓰지 않는다.
