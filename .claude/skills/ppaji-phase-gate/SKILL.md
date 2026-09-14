---
name: ppaji-phase-gate
description: "빠지 타이쿤 수배 축 도입의 페이즈 종료 게이트. docs/plan-commission-axis.md §4 의 필수 항목·RED·음성 대조군을 읽어 A(구현 완료)·B(아키텍처 정합)·C(계약 정합)·D(검사 정직성)·E(밸런스)·F(사람 확인) 6부를 재고 표로 판정한다. 재기만 하고 고치지 않는다. 트리거: 페이즈 검증, phase gate, P0~P7 검증, 페이즈 닫기, 게이트 돌려줘, ppaji-phase-gate."
---

# 빠지 타이쿤 — 페이즈 종료 게이트

**호출**: `/ppaji-phase-gate P0` ~ `P7` (인자 없으면 `docs/plan-commission-axis.md` §9의 마지막 이력 다음 페이즈)

## 이 스킬의 규칙 넷

1. **재기만 한다. 고치지 않는다.** 판정과 수리가 섞이면 "고쳤으니 통과"가 된다. 수리는 별도 호출이다.
2. **미측정을 통과로 쓰지 않는다.** `✅ 통과` / `❌ 실패` / `⬜ 미측정` 셋을 구분한다.
3. **개수로 계약을 재지 않는다.** 정체(id·역할·이름)로 잰다. 이 저장소는 개수 검사가 조용히 죽는 것을 여러 번 밟았다.
4. **새 검사는 대조군을 켜서 빨개지는지 먼저 본다.** 안 빨개지면 그 검사는 아무것도 안 재는 것이다.

---

## 절차

### 0) 계획을 읽는다

`docs/plan-commission-axis.md`에서 **그 페이즈의 세 목록**을 뽑는다.

- §4 `<페이즈>` 의 **필수 구현** 체크리스트
- 같은 절의 **RED** 목록
- 같은 절의 **대조군** 목록
- §6 측정 문턱 중 그 페이즈의 **완료 판정**에 걸린 행
- §8 미해결 중 **그 페이즈 전에 답해야 하는 것** — 남아 있으면 그 자체가 ❌다

---

### A. 구현 완료

체크리스트의 각 항목을 **파일·심볼·데이터 항목 수로 세어서** 대조한다. "했다고 함"이 아니라 존재를 확인한다.

```bash
# 심볼 존재
grep -n "export function absoluteTick\|get absTick" src/sim/kairo/week.ts
grep -rn "COMMISSION_RNG_SALT" src/ tools/          # main·봇 양쪽에 있어야 한다

# 데이터 항목 수
node -e "console.log(Object.keys(require('./src/data/kairo-facilities.json').facilities).length)"
node -e "console.log(require('./src/data/kairo-recipes.json').recipes.length)"
```

판정: 체크되지 않은 항목이 하나라도 있으면 **❌**. 계획이 바뀐 것이면 **계획을 먼저 고치고** 다시 돈다.

---

### B. 아키텍처 정합 — 불변식 1·2·3

```bash
npm run lint                       # ESLint 가 불변식 1·2 를 강제한다
npx vitest run src/sim/invariants.test.ts   # 규칙이 실제로 위반을 잡는지
npm run typecheck
```

손으로 더 볼 것:

```bash
# 불변식 1 — sim 은 렌더러를 모른다
grep -rn "from '\.\./\.\./render\|from '\.\./\.\./ui\|from 'phaser'\|from '\.\./\.\./save" src/sim/ || echo OK

# 불변식 2 — 결정론
grep -rn "Math\.random\|Date\.now\|performance\.now\|new Date(" src/sim/ || echo OK

# 불변식 3 — 새 콘텐츠가 코드가 아니라 데이터인가
#   새 sim 모듈에 항목 배열 리터럴이 있으면 위반이다
grep -n "^const .*: readonly .*Def\[\] = \[" src/sim/kairo/*.ts
```

⚠ **JSON 을 비우면 그 축이 잠들고 나머지가 도는가**도 여기서 잰다 (§4 각 페이즈의 되돌리기 줄).
P6 구인만 예외이고, 그 예외는 `hireJobsAvailable()` 폴백과 그 폴백의 검사가 지킨다.

---

### C. 계약 정합 — 코드 ↔ 게이트 ↔ 문서 3자 대조

**이 저장소가 반복해서 어긋난 자리다.** 셋이 같은 말을 하는지 본다.

| 계약 | 문서 | 코드 | 게이트 |
|---|---|---|---|
| 상시 조작의 정체 | `CLAUDE.md` K47-② 절 | `src/ui/kairo-hud.ts` | `tools/verify-kairo.ts:9931` 근처 |
| 목표 슬롯 | `CLAUDE.md` K54 절 | `kairo-hud.ts`·`style.css` | `[data-goal-role]` 판정 |
| 라우트 이름 | `docs/plan-commission-axis.md` §2.2 | `src/sim/kairo/meta.ts` `MANAGEMENT_GROUPS` | `MANAGEMENT_READY_EXPR` |
| 동사 수 | `CLAUDE.md:219` | "여섯 동사" 주석 8곳 | — |
| 세이브 버전 | §3.11 | `src/save/kairo.ts` `KAIRO_SAVE_VERSION` | `kairo.test.ts` |

```bash
grep -rn "여섯 동사\|동사 6개\|6개로 고정" CLAUDE.md src/ tools/ docs/
grep -n "KAIRO_SAVE_VERSION" src/save/kairo.ts
grep -n "MANAGEMENT_READY_EXPR" -A4 tools/verify-kairo.ts | head -20
```

⚠ **어긋난 것을 발견하면 고치지 말고 기록한다.** 이 스킬은 재기만 한다.
⚠ 이번 작업 시작 시점에 **이미 어긋나 있던 것**(§8-15)과 이번 페이즈가 만든 것을 **구분해서** 적는다.

---

### D. 검사 정직성 — 대조군을 하나씩 켠다

그 페이즈가 추가한 대조군 스위치를 **하나씩 켜서** 대응 검사가 실제로 빨간불이 되는지 본다.

```bash
# 예: P4
#   setCommissionRngFaultForTest(true)  → 격리 1·2·3 이 실패해야 한다
#   setDoubleCompleteFaultForTest(true) → 멱등 검사가 실패해야 한다
npx vitest run src/sim/kairo/commission-rng-isolation.test.ts
npx vitest run src/sim/kairo/commission.test.ts

# 플래그형 대조군은 출력을 대조한다
npx tsx tools/kairo-sim.ts --seeds 12 --weeks 26 --persona 0 > /tmp/a.txt
# 기준선과 비트 단위 비교
```

판정:
- 대조군을 켰는데 **초록이면 ❌** — 그 검사는 아무것도 안 재고 있다
- 대조군이 **코드에 없고 손으로만 확인했으면 ⬜ 미측정** — 다음 사람에게 안 남는다

---

### E. 밸런스·성능

```bash
npm run test                       # ⚠ 실패가 정확히 2건(생성 PNG 부재)인지 확인. 3건이면 새 실패다
npm run gate
npm run sim:kairo -- --determinism
npm run sim:kairo -- --seeds 12 --weeks 26
npm run sim:kairo -- --seeds 24 --weeks 52      # 52주 판정은 반드시 24시드
npx vitest run src/sim/kairo/golden.test.ts     # 15/15
npx vitest run src/sim/kairo/week-identity.test.ts   # 빨간불이면 흐름 작업 금지
```

§6 문턱표에서 그 페이즈에 걸린 행만 골라 **기준선 → 지금** 을 표로 낸다.

⚠ **한 시드 대조로 밸런스 주장을 하지 않는다.** 26주는 12시드, **52주는 24시드**.
⚠ 골든이 깨졌으면 **원인을 A/B 플래그로 증명한 뒤에만** 갱신 대상으로 올린다 (K52 선례).

브라우저 게이트 (dev 서버 필요):
```bash
npm run verify:kairo
npm run seam -- --selftest
```

---

### F. 사람 확인 — 자동이 못 잡는 것

**자동 통과를 사람 승인으로 보고하지 않는다** (`UX-ACCEPT-01`).

- 393×852 **진짜 터치** (좌표만 재는 검사로는 못 잡는 종류가 있다 — 칩 터치 버그 선례)
- **30초 무설명 과업** — §8-11에서 정한 문장
- 첫 화면 인상 / 무라벨 A/B

이 부는 **사람이 직접 하는 것**이므로, 스킬은 **무엇을 확인해야 하는지 목록만 내고 ⬜ 미측정으로 둔다.**

---

## 산출

```
## <페이즈> 종료 게이트 — <날짜>

| 부 | 판정 | 근거 |
|---|---|---|
| A 구현 완료   | ✅/❌/⬜ | 체크 N/M · 빠진 것: … |
| B 아키텍처    | ✅/❌/⬜ | lint · invariants · 불변식 3 |
| C 계약 정합   | ✅/❌/⬜ | 3자 대조 N쌍 · 어긋남: … (기존/신규 구분) |
| D 검사 정직성 | ✅/❌/⬜ | 대조군 N개 중 M개가 실제로 빨개짐 |
| E 밸런스      | ✅/❌/⬜ | 문턱 N개 중 M개 통과 · 골든 15/15 |
| F 사람 확인   | ⬜      | 해야 할 목록 |

### 문턱 대조
| 지표 | 기준선 | 지금 | 문턱 | 판정 |

### 발견 (고치지 않고 기록만)
1. …
```

**전부 ✅이면**: `docs/plan-commission-axis.md` §9에 실측 전후표를 append 하고, §7의 해당 문서 개정이
됐는지 확인한다. **하나라도 ❌면**: §8 미해결에 항목을 추가하고 **멈춘다.**

---

## 이 게이트가 잡으려는 실패 유형 (근거)

| 유형 | 실제 사례 |
|---|---|
| 검사가 조용히 통과 | 회전 게이트 — 118회 생성이 접지·광원·팔레트를 전부 통과하고도 **한 장도 안 돌아 있었다** |
| 개수 검사가 죽음 | `controls === 6` 이 우연히 수가 같아져 가림 여부를 구분 못 함 · `[data-goal-role].length === 3` 이 메뉴 행으로 채워져 조용히 통과 |
| 죽은 대조군 | `.kgoal-secondary` — 삭제된 선택자를 계속 대조해 항상 `false` |
| 계측기가 게임이 아니라 봇을 잼 | P3-A(원인 넷이 전부 봇 안) · P3-D(봇 천장) · K52(④ ≈ ① 실측) · 특화 255:6:2 |
| 문서와 코드가 갈라짐 | K54 "목표 세 칸" · "상시 제어 6개" 가 코드와 불일치인 채로 남아 있음 |
| 좌표는 맞는데 터치가 안 됨 | `.kchips` 가 2px 로 납작해져 `elementFromPoint` 가 아래를 집음 |
