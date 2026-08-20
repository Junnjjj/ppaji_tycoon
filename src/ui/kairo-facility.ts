import { el, button } from './dom.js';
import { panelHost } from './panels.js';
import { NEED_NAME } from './kairo-report.js';
import {
  facilityDef,
  FACILITY_MAX_LEVEL,
  PlacementGrid,
  SPECIALTY_DOUBLE_LEVEL,
  SPECIALTY_LABELS,
  SPECIALTY_LEVEL,
  type FacilityCharge,
  type FacilitySpecialty,
} from '../sim/kairo/placement.js';
import type { NeedKind } from '../sim/kairo/week.js';

/**
 * 시설 인스턴스 정보 — **지도에서 시설을 탭하면 뜬다** (P2-B 가 남긴 미결).
 *
 * ## 왜 필요했나 — 내가 지은 것을 확인할 길이 없었다
 *
 * 개선 단계·특화·요금은 전부 **인스턴스마다 다른 값**인데(`levelOf`·`specialtyOf`·`feeOf`),
 * 화면에서 그것을 묻는 곳이 한 군데도 없었다. 경영 시트의 개선 탭은 130채짜리 목록이라
 * "이 매점"을 찾는 화면이 아니고, 건설 시트는 **데이터의 정가**만 안다.
 *
 * 특히 **과금 분류**(K49 의 `charge: 'included' | 'sale'`)가 화면에 아예 없었다.
 * 75종 중 42종이 입장권에 포함이라 이용해도 0원인데, 그걸 모르면 플레이어는
 * "어떤 시설이 돈을 버는가"를 영원히 알 수 없다 — 이 화면의 첫 번째 존재 이유다.
 *
 * ## 새 표면을 안 만든다
 *
 * `.ksheet`(하단 시트) 하나에 속은 한 벌(`.kstats`·`.krow`·`.kchips`·`.kbtn`)이다.
 * 전면(`.kover`)을 안 쓰는 이유는 **지도가 보여야 한다**는 것 — 탭한 시설이 어디 있는지가
 * 화면에서 사라지면 "이 시설"이 무엇이었는지 곧바로 잊는다. 색은 `style.css` 가 소유한다
 * (여기 hex 0).
 *
 * ## 읽는 순서 — 결산이 "히트맵 → 막대 → 숫자 → 콤보"를 갖는 것과 같은 종류의 결정
 *
 * 화면이 길어질수록 **무엇을 먼저 보게 할지**가 설계가 된다. 여섯 층이다:
 *
 * 1. **설명** — 무엇을 하는 곳인가. 정체성이 숫자보다 앞이다. 처음 지어 본 시설을
 *    탭했을 때 답해야 하는 질문이 이것이고, 숫자는 그 다음이라야 뜻이 붙는다
 * 2. **지표 셋** (정원 · 개선 · 요금) — "지금 어떤 상태인가"를 한눈에. 셋을 고른 기준은
 *    **전부 인스턴스마다 다르고 다른 화면에서 물을 수 없는 값**이라는 것이다
 * 3. **개선** — "무엇을 할 수 있나". 이 화면에서 **유일하게 돈을 쓰는 곳**이라 상태 바로
 *    아래다. 3단계 갈래·5단계 ×2 를 **1단계에서도** 미리 보여준다 — 앞이 안 보이면
 *    개선할 이유가 안 생긴다 (PSS 의 "그릇 속의 그릇"이 여기서 읽혀야 한다)
 * 4. **메뉴** (가게만) — 무엇을 파나. PSS 의 "가게에 뭘 파는지 보인다"
 * 5. **세부** (요금 구조 · 특화 · 수요 · 유지비) — 판단이 끝난 뒤에 확인하는 값
 * 6. **이동 · 철거** — **파괴적인 것이 맨 아래**다. 시트를 열자마자 엄지가 닿는 자리에
 *    철거를 두면 안 된다
 *
 * ## 행동은 이미 있는 흐름을 탄다
 *
 * 개선은 여기서 바로 한다 — 규칙은 `PlacementGrid`(`upgradeCost`/`upgrade`/
 * `chooseSpecialty`)가 갖고 있고 경영 시트와 여기는 **같은 규칙의 두 입구**다.
 * 이동·철거는 K47-③ 에서 **조준 + 확정**으로 승격됐다. 정보 화면에서 바로 없애면 그
 * 승격이 무의미해진다 — 여기서는 붓을 쥐여 줄 뿐이다.
 */

/**
 * 요금을 **게임 눈금 그대로** 쓴다 — 화면의 다른 모든 돈과 같은 자다.
 *
 * ⚠ **한 화면 안에서 눈금을 섞지 말 것.** 설계서의 명목가(₩8,000 = 데이터 `fee: 800`,
 * K36-B②)로 요금만 열 배로 쓰면, 바로 두 줄 위의 `개선 21만` 과 자가 어긋난다.
 * 그러면 플레이어가 이 화면에서 실제로 하는 계산 — "몇 번 팔아야 개선비를 뽑나" — 이
 * 262회에서 **26회로 열 배 틀린다.** 개선을 누를지 말지가 그 숫자로 갈리므로 미관 문제가
 * 아니라 결정을 망치는 문제다 (실측으로 걸렸다: 요금 ₩8,000 · 개선 21만 이 나란히 떴다).
 *
 * ⚠ 게임 전체를 명목가(×10)로 옮기는 것은 별개 결정이다 — 헤더 현금·결산·건설비·토스트가
 * 전부 이 눈금이라 한 곳만 옮기면 같은 게임 안에서 두 화면이 다른 돈을 말한다.
 */
function won(fee: number): string {
  return `₩${fee.toLocaleString('ko-KR')}`;
}

/** 만원 단위 — 게임 전체가 이 눈금으로 말한다 (헤더 현금·결산과 같다) */
function man(won: number): string {
  if (won >= 10000) return `${Math.round(won / 10000).toLocaleString('ko-KR')}만`;
  return won.toLocaleString('ko-KR');
}

/** 고른 특화 한 벌 — 이름·효과는 sim 이 갖는다 (`SPECIALTY_LABELS`, 데이터 한 벌) */
export interface SpecialtyView {
  id: FacilitySpecialty;
  name: string;
  effect: string;
  /** 5단계면 효과가 두 배다 (`SPECIALTY_DOUBLE_LEVEL`) */
  doubled: boolean;
}

/**
 * 화면이 읽는 값 한 벌 — **전부 sim 에서 잰 실효값**이다.
 *
 * ⚠ 데이터의 `capacity`·`fee` 를 그대로 쓰면 안 된다. 개선 단계와 특화가 둘 다 곱해지므로
 * (`capacityOf`·`feeOf`), 정가를 보여 주면 3단계 특화 매점의 화면이 거짓말이 된다.
 * 순수 함수라 DOM 없이 잰다 (`upgradeCandidates` 와 같은 자리).
 */
export interface FacilityInfo {
  handle: number;
  defId: string;
  name: string;
  /** 한 줄 설명 — **데이터가 갖는다** (불변식 3). 없으면 빈 문자열이고 그 줄이 안 뜬다 */
  desc: string;
  /** 어느 수요를 채우나 — 한글 이름 (`NEED_NAME`, 심사 화면과 같은 표) */
  need: string;
  /** 발자국 — **회전을 반영한다** (K45: 비정사각은 `facing:1` 에서 w↔h 가 바뀐다) */
  size: string;
  /** 실효 정원 (`capacityOf` — 회전 특화가 반영된 값) */
  capacity: number;
  /** 데이터의 기본 정원 — 특화로 얼마나 늘었는지는 둘을 견줘야 보인다 */
  baseCapacity: number;
  /** 지금 이용 중인 인원. 손님을 모르면 null (단위 검사가 그 경로다) */
  using: number | null;
  level: number;
  atMaxLevel: boolean;
  /** 다음 단계 비용. 최고 단계면 0 */
  upgradeCost: number;
  /** 입장권에 포함인가, 따로 사는 것인가 (K49) */
  charge: FacilityCharge;
  /** 이용 1회당 실제로 걷히는 돈 — **게임 눈금**. 포함이면 0 (`feeOf` 가 0 을 낸다) */
  fee: number;
  /** 요금 한 줄 — 포함/별도가 **글자로** 갈린다 */
  chargeLabel: string;
  upkeep: number;
  specialty: SpecialtyView | null;
  /** 지금 고를 수 있는 특화 (없으면 빈 배열 — 3단계 미만이거나 이미 골랐다) */
  choices: readonly FacilitySpecialty[];
  /**
   * 이 시설이 **언젠가** 고를 수 있는 특화 — 데이터의 허용 목록 그대로.
   *
   * ⚠ 셋을 고정으로 그리면 못 고르는 갈래를 보여주게 된다 (분위기 시설 14종은 빈 배열,
   * 매표소는 회전 하나뿐). 1단계에서도 이걸 보여줘야 "3단계에 갈래가 생긴다"가 개선할
   * 이유가 된다 — 앞이 안 보이면 개선은 그냥 돈 쓰기다.
   */
  possible: readonly FacilitySpecialty[];
  /** 가게 품목 (표시 전용, K49). 파는 것이 없으면 빈 배열이고 그 블록이 안 뜬다 */
  menu: readonly { name: string; price: number }[];
}

/**
 * 시설 하나의 실효값을 읽는다. 없는 핸들이면 `null`.
 *
 * `using` 은 바깥에서 준다 — `ui/` 는 손님을 모르는 편이 낫고 (인스턴스 정보는 손님이
 * 없어도 성립한다), 헤드리스 단위 검사가 손님 없이 이 함수를 그대로 잰다.
 */
export function facilityInfo(
  placement: PlacementGrid,
  handle: number,
  using: number | null = null,
): FacilityInfo | null {
  const item = placement.all().find((it) => it.handle === handle);
  if (!item) return null;
  const def = facilityDef(item.defId);
  if (!def) return null;

  const level = placement.levelOf(handle);
  const spec = placement.specialtyOf(handle);
  const fee = placement.feeOf(handle);
  /*
   * ⚠ **`feeOf` 에서 유도한다** — `chargesOnUse(def)` 를 따로 부르지 않는다.
   *
   * `feeOf` 주석이 스스로 "여기가 '이용마다 돈을 받나'의 유일한 관문"이라고 못박아 뒀다.
   * 데이터 분류를 따로 읽으면 관문이 **둘**이 되고, 그러면 화면이 "포함"이라고 써 놓고
   * 손님은 돈을 내는 상태가 만들어질 수 있다 — 실제로 `chargeFaultForTest` 를 켜고
   * 재 보니 정확히 그 모양이 나왔다 (라벨은 포함, 걷히는 돈은 ₩9,000). 음성 대조군이
   * 잡아 준 것이고, 그 대조군이 뜻을 가지려면 **표시가 돈과 같은 길**을 타야 한다.
   *
   * 데이터의 `charge` 와 어긋날 일은 없다 — `charge.test.ts` 가 75종 전부의 명시를
   * 요구하고 `sale` 중에 `fee: 0` 인 것이 없다 (실측). 그 계약이 깨지면 단위 검사가
   * 먼저 빨개진다.
   */
  const sale = fee > 0;
  // 회전은 발자국의 w↔h 를 바꾼다 (K45) — 데이터 순서를 그대로 쓰면 샤워실 4×1 이 뒤집힌다
  const [w, d] = item.facing === 1 ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]];

  return {
    handle,
    defId: item.defId,
    name: def.name,
    desc: def.desc ?? '',
    need: NEED_NAME[(def.need ?? '') as NeedKind] ?? (def.need ?? '—'),
    size: `${w}×${d}`,
    capacity: placement.capacityOf(handle),
    baseCapacity: def.capacity,
    using,
    level,
    atMaxLevel: level >= FACILITY_MAX_LEVEL,
    upgradeCost: placement.upgradeCost(handle),
    charge: sale ? 'sale' : 'included',
    fee,
    chargeLabel: sale ? `이용 ${won(fee)}` : '입장권에 포함',
    upkeep: def.upkeep,
    specialty: spec
      ? {
          id: spec,
          name: SPECIALTY_LABELS[spec].name,
          effect: SPECIALTY_LABELS[spec].effect,
          doubled: level >= SPECIALTY_DOUBLE_LEVEL,
        }
      : null,
    choices: placement.canChooseSpecialty(handle)
      ? PlacementGrid.specialtiesFor(item.defId)
      : [],
    possible: PlacementGrid.specialtiesFor(item.defId),
    /*
     * ⚠ 메뉴는 **파는 시설에만** 띄운다. 데이터에 없으면 빈 배열이고, `included` 시설에
     * 메뉴가 붙는 일도 없다 (단위 검사가 고정한다) — 있는 척 채우면 화장실에서 뭘 파는
     * 화면이 된다.
     */
    menu: def.menu ?? [],
  };
}

/**
 * 행동 입구 셋. **여기서 실행하지 않는다** — 부르는 쪽(`main.ts`)이 이미 있는 흐름에 태운다.
 * `null` 이면 그 버튼이 잠기고, `hint` 가 왜 잠겼는지를 말한다 (처방은 방법까지, 저장소 규칙).
 */
export interface FacilityActions {
  /** 지금 지갑 — 개선 버튼이 "살 수 있나"를 여기서 본다 */
  cash: () => number;
  /**
   * 개선 한 단계 — 돈을 쓰고 `placement.upgrade` 를 부르는 것은 **부르는 쪽**이다.
   * 규칙(비용·상한)은 `PlacementGrid` 가 갖고, 지갑은 `WeekRunner` 가 갖는다.
   * 성공하면 `true` — 화면은 그때만 다시 그린다.
   */
  upgrade: () => boolean;
  /** 특화를 고른다 (공짜). 데이터가 안 허용하면 `false` */
  chooseSpecialty: (s: FacilitySpecialty) => boolean;
  /** 이동 붓을 이 시설에 물린 채로 (첫 심사 통과 전엔 null) */
  move: (() => void) | null;
  moveHint?: string;
  /** 철거 붓 + 조준 (K47-③) — 여기서 바로 없애지 않는다 */
  erase: () => void;
}

export class KairoFacilityInfo {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ksheet');
    this.root.id = 'kairo-facility';
    this.root.hidden = true;

    const head = el('div', 'ksheet-head');
    this.title = el('div', 'ksheet-title', '시설');
    const close = button('kbtn', '닫기', () => this.hide());
    close.id = 'kairo-facility-close';
    head.append(this.title, close);

    this.body = el('div', 'ksheet-body kstack');
    this.root.append(head, this.body);
    parent.append(this.root);
  }

  /** ⚠ `hidden` 을 읽는다 — 인라인 `display` 를 읽으면 표면이 클래스로 옮길 때 거짓이 된다 */
  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * `read` 는 **다시 읽는 함수**다 (`FacilityInfo` 를 통째로). 개선·특화는 이 화면에서
   * 값을 바꾸므로, 누른 뒤 스냅샷 하나를 손으로 고치면 정원·요금 타일이 옛 값으로 남는다
   * — P1.5 특화는 셋(정원·요금·만족)을 한꺼번에 움직인다.
   */
  show(read: () => FacilityInfo | null, actions: FacilityActions): void {
    const first = read();
    if (!first) return;
    // 한 번에 하나 (K37) — 건설 시트를 열어 둔 채 탭해도 겹치지 않는다
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
    this.rerender = (): void => {
      const now = read();
      // 사라졌으면(철거) 닫는다 — 없는 시설의 정보가 남아 있으면 그게 거짓말이다
      if (!now) {
        this.hide();
        return;
      }
      this.render(now, actions);
    };
    this.render(first, actions);
  }

  hide(): void {
    this.root.hidden = true;
    this.rerender = null;
    panelHost.closed(this);
  }

  /** 도구용 — 사람이 개선 버튼을 누르는 것과 **같은 경로**를 탄다 */
  refresh(): void {
    this.rerender?.();
  }

  /** 지금 보고 있는 시설 (없으면 -1) — 하네스가 "그 시설이 맞나"를 잰다 */
  get handle(): number {
    return Number(this.root.dataset['handle'] ?? -1);
  }

  /**
   * ⚠ **다시 그리는 것은 여기 하나다.** 개선·특화는 그 자리에서 값을 바꾸므로, 누른 뒤
   * `facilityInfo` 를 **다시 읽어서** 통째로 그린다 — 버튼 하나만 손으로 갱신하면
   * 정원·요금 타일이 옛 값으로 남는다 (P1.5 특화가 셋을 한꺼번에 움직인다).
   */
  private rerender: (() => void) | null = null;

  private render(info: FacilityInfo, actions: FacilityActions): void {
    this.root.dataset['handle'] = String(info.handle);
    // 과금 분류를 루트에 적는다 — 화면 검사가 글자 파싱 없이 이 값을 대조한다
    this.root.dataset['charge'] = info.charge;
    this.root.dataset['level'] = String(info.level);
    this.title.textContent = `${info.name} · ${info.size}`;
    this.body.replaceChildren();

    /* ── 1. 설명 — 정체성이 숫자보다 앞이다 ─────────────────────────────── */
    if (info.desc !== '') {
      const d = el('div', 'kcard-desc', info.desc);
      d.id = 'kairo-facility-desc';
      this.body.append(d);
    }

    /* ── 2. 지표 셋 — 정원 · 개선 · 요금 (열 수는 **데이터**라 인라인, K34) ── */
    const stats = el('div', 'kstats');
    stats.id = 'kairo-facility-stats';
    stats.style.setProperty('--stat-cols', '3');
    stats.append(
      stat(
        '정원',
        info.using !== null ? `${info.using}/${info.capacity}` : `${info.capacity}`,
        // 꽉 찼으면 주황 — 결산의 병목 표시와 같은 규칙이다
        info.using !== null && info.capacity > 0 && info.using >= info.capacity ? ' warn' : '',
      ),
      stat('개선', `${info.level}단계`),
      // ★ 포함/별도가 **한눈에** 갈려야 한다 — 이 화면의 첫 번째 존재 이유다 (K49)
      stat('요금', info.charge === 'sale' ? won(info.fee) : '포함'),
    );
    this.body.append(stats);

    /* ── 3. 개선 — 이 화면에서 유일하게 돈을 쓰는 곳 ────────────────────── */
    this.body.append(this.upgradeBlock(info, actions));

    /* ── 4. 메뉴 — 파는 시설만 ─────────────────────────────────────────── */
    if (info.menu.length > 0) this.body.append(menuBlock(info));

    /* ── 5. 세부 ───────────────────────────────────────────────────────── */
    const rows = el('div', 'kstack');
    rows.style.setProperty('--stack-gap', '4px');

    /*
     * ⚠ 오른쪽 칸에 금액을 또 쓰지 않는다 — 위 지표 타일이 이미 그 숫자다.
     * 같은 줄에 `₩9,000` 이 두 번 나오는 화면이 먼저 나왔고(실측 스크린샷), 두 번째
     * 숫자는 정보가 아니라 소음이었다. 오른쪽은 **분류**를 한 낱말로 말한다.
     */
    rows.append(
      row(
        'charge',
        info.chargeLabel,
        info.charge === 'sale'
          ? '이용할 때마다 받습니다 — 개선·특화가 반영된 금액입니다'
          : '이용해도 따로 받지 않습니다 — 수입은 입장료로 미리 받았습니다',
        info.charge === 'sale' ? '별도' : '포함',
      ),
    );

    /*
     * 수요 축 — 오른쪽 칸을 비운다 (정원은 지표 타일에 있다). `row()` 가 빈 값이면
     * 오른쪽 칸을 아예 안 만든다 — 빈 상자가 남으면 줄 높이가 어긋난다.
     */
    rows.append(
      row(
        'need',
        `${info.need} 수요`,
        info.capacity > info.baseCapacity
          ? `한 번에 ${info.capacity}명 (기본 ${info.baseCapacity} + 특화 +${info.capacity - info.baseCapacity})`
          : `한 번에 ${info.capacity}명이 이용합니다`,
        '',
      ),
    );

    rows.append(
      row('upkeep', '유지비', '손님이 없어도 매주 나갑니다', `${man(info.upkeep)}/주`),
    );
    this.body.append(rows);

    /* ── 6. 이동 · 철거 — **파괴적인 것이 맨 아래**다 ──────────────────── */
    const acts = el('div', 'kchips wrap');
    acts.id = 'kairo-facility-actions';

    const mv = button('kbtn', '이동', () => actions.move?.());
    mv.id = 'kairo-facility-move';
    mv.disabled = actions.move === null;

    const rm = button('kbtn', '철거', () => actions.erase());
    rm.id = 'kairo-facility-erase';

    acts.append(mv, rm);
    this.body.append(acts);

    if (actions.move === null && actions.moveHint) {
      // 잠긴 이유는 **버튼 옆에** 쓴다 — 툴팁은 폰에 없다 (심사 화면과 같은 판단)
      this.body.append(el('div', 'kcaption', actions.moveHint));
    }
  }

  /**
   * 개선 블록 — 지금 단계 · 다음 비용 · **앞으로 열리는 것**.
   *
   * 마지막 항목이 요지다. 1단계 시설을 탭한 플레이어에게 "3단계에 갈래가 생기고 5단계에
   * 그 효과가 두 배가 된다"를 안 보여 주면, 개선은 그냥 돈 쓰기로 보인다 (PSS 의 "그릇
   * 속의 그릇"이 여기서 읽혀야 한다).
   *
   * ⚠ 갈래는 **데이터가 정한다** (`possible`). 셋을 고정으로 그리면 매표소(회전 하나)나
   * 분위기 시설(빈 배열)에서 못 고르는 갈래를 보여주게 된다 — 불변식 3.
   */
  private upgradeBlock(info: FacilityInfo, actions: FacilityActions): HTMLElement {
    const box = el('div', 'krow kstack');
    box.id = 'kairo-facility-upgrade';
    box.dataset['level'] = String(info.level);

    /*
     * ⚠ 인라인 스타일로 줄을 짜지 않는다 (K28 규칙). `.krow.kstack` 이 이미
     * "여러 줄을 담은 상자"이고 `align-items: stretch` 라, 안에 넣은 `.kbtn` 은 저절로
     * 전폭이 된다 — 경영 시트의 특화 줄이 쓰는 그 표면 그대로다.
     */
    const main = el('div', 'krow-main');
    main.append(
      el(
        'div',
        'kitem-name',
        info.atMaxLevel
          ? `${info.level}단계 (최고)`
          : `${info.level}단계 → ${info.level + 1}단계`,
      ),
      el('div', 'kcaption', upgradeSub(info)),
    );
    box.append(main);

    if (!info.atMaxLevel) {
      const cost = info.upgradeCost;
      const b = button('kbtn primary', `개선 · ${man(cost)}`, () => {
        if (!actions.upgrade()) return;
        this.rerender?.();
      });
      b.id = 'kairo-facility-upgrade-buy';
      // 못 사는 이유가 "돈"인지 "최고 단계"인지는 갈려야 한다 — 여기는 돈뿐이다
      b.disabled = cost > actions.cash();
      box.append(b);
    }

    /*
     * 갈래 — 지금 고를 수 있으면 **누르는 칩**, 아직이면 **예고 글**이다.
     * ⚠ 예고를 안 보여주면 "3단계까지 올릴 이유"가 화면 어디에도 없다.
     */
    if (info.choices.length > 0) {
      const chips = el('div', 'kchips wrap');
      chips.id = 'kairo-facility-specialties';
      for (const s of info.choices) {
        const lab = SPECIALTY_LABELS[s];
        const b = button('kbtn', `${lab.name} · ${lab.effect}`, () => {
          if (!actions.chooseSpecialty(s)) return;
          this.rerender?.();
        });
        b.dataset['specialtyPick'] = s;
        chips.append(b);
      }
      box.append(el('div', 'kcaption', '특화를 고르세요 — 한 번 고르면 못 바꿉니다'));
      box.append(chips);
    } else if (info.specialty) {
      box.append(
        el(
          'div',
          'kcaption',
          `특화 ${info.specialty.name} · ${info.specialty.effect}` +
            (info.specialty.doubled
              ? ` ×2 (${SPECIALTY_DOUBLE_LEVEL}단계라 두 배입니다)`
              : ` — ${SPECIALTY_DOUBLE_LEVEL}단계가 되면 두 배가 됩니다`),
        ),
      );
    } else if (info.possible.length > 0) {
      // 아직 못 고른다 — **무엇이 열리는지**를 먼저 말한다
      const chips = el('div', 'kchips wrap');
      chips.id = 'kairo-facility-specialty-preview';
      for (const s of info.possible) {
        const lab = SPECIALTY_LABELS[s];
        const b = button('kbtn', `${lab.name} · ${lab.effect}`, () => {
          /* 예고라 아무 일도 안 한다 — 잠긴 상태로 보여줄 뿐이다 */
        });
        b.disabled = true;
        b.dataset['specialtyPreview'] = s;
        chips.append(b);
      }
      box.append(
        el('div', 'kcaption', `${SPECIALTY_LEVEL}단계에 갈래가 열립니다 (하나만 고릅니다)`),
      );
      box.append(chips);
    } else {
      box.append(el('div', 'kcaption', '이 시설에는 특화가 없습니다'));
    }
    return box;
  }
}

/**
 * 개선 줄의 보조 문구 — **다음 한 걸음이 무엇을 바꾸나.**
 *
 * "개선하면 좋아집니다"로는 돈 쓸 이유가 안 된다. 실제로 붙는 것은 요금 +30%p 와
 * 만족이고 (`LEVEL_FEE_STEP`·`LEVEL_SATISFACTION`), 갈래·×2 는 특정 단계에서만 온다.
 */
function upgradeSub(info: FacilityInfo): string {
  if (info.atMaxLevel) return '더 올릴 단계가 없습니다';
  const next = info.level + 1;
  if (next === SPECIALTY_LEVEL && info.possible.length > 0) {
    return `${SPECIALTY_LEVEL}단계에서 특화 갈래가 열립니다`;
  }
  if (next === SPECIALTY_DOUBLE_LEVEL && info.specialty) {
    return `${SPECIALTY_DOUBLE_LEVEL}단계가 되면 특화 효과가 두 배입니다`;
  }
  return '단계가 오르면 요금과 이용 만족이 함께 오릅니다';
}

/**
 * 가게 품목 (K49) — PSS 의 "가게에 뭘 파는지 보인다".
 *
 * ⚠ **표시 전용이다.** 손님이 무엇을 골랐는지는 시뮬하지 않는다 (P3-E 메뉴 슬롯의 몫).
 * 그래서 화면이 **평균이 이용 요금**이라는 것을 말한다 — 안 말하면 "메뉴는 ₩3,000인데
 * 결산은 ₩8,000"으로 읽힌다. 데이터가 그 평균을 정확히 지키고 단위 검사가 고정한다.
 */
function menuBlock(info: FacilityInfo): HTMLElement {
  const box = el('div', 'krow kstack');
  box.id = 'kairo-facility-menu';
  box.dataset['menu'] = String(info.menu.length);
  box.append(el('div', 'kitem-name', '판매 품목'));
  const list = el('div', 'kstack');
  list.style.setProperty('--stack-gap', '2px');
  for (const m of info.menu) {
    const line = el('div', 'krow');
    line.dataset['menuItem'] = m.name;
    const main = el('div', 'krow-main');
    main.append(el('div', 'kitem-name', m.name));
    line.append(main, el('div', 'kstat-value', won(m.price)));
    list.append(line);
  }
  box.append(list);
  box.append(
    el('div', 'kcaption', `평균 ${won(info.fee)} — 결산에 잡히는 1회 이용 금액입니다`),
  );
  return box;
}

function stat(label: string, value: string, tone = ''): HTMLDivElement {
  const b = el('div', 'kstat');
  b.append(el('div', 'kstat-label', label), el('div', `kstat-value${tone}`, value));
  return b;
}

/** `value` 가 빈 문자열이면 오른쪽 칸을 만들지 않는다 (빈 상자는 줄 높이를 어긋낸다) */
function row(key: string, name: string, sub: string, value: string): HTMLDivElement {
  const r = el('div', 'krow');
  r.dataset['fac'] = key;
  const main = el('div', 'krow-main');
  main.append(el('div', 'kitem-name', name), el('div', 'kcaption', sub));
  r.append(main);
  if (value !== '') r.append(el('div', 'kstat-value', value));
  return r;
}
