import rawFacilities from '../../data/kairo-facilities.json' with { type: 'json' };
import { KairoTerrain } from './terrain.js';
import { WallGrid, reachable, EDGE_DOOR } from './walls.js';
import { riverZones, permitUsed, deckKey } from './swim.js';
import {
  isRecipeForFacility,
  menuFacilityOperability,
  menuSlotsForLevel,
  type MenuFacilityOperability,
} from './menu.js';
/*
 * ⚠ **타입만** 가져온다 (컴파일에서 지워진다). `week.ts` 가 이 파일을 import 하므로
 * 값으로 가져오면 순환이 된다 — `certs.ts`·`cards.ts` 가 쓰는 것과 같은 방식이다.
 */
import type { NeedKind } from './week.js';

/**
 * 시설 배치 — **시뮬 소유**. 스펙 §4.
 *
 * 렌더 정보(캔버스·앵커·슬롯 좌표)는 `src/assets/kairo-render-contract.json` 이 갖는다.
 * 여기는 **발자국·용량·배치 제약**만 안다 (불변식 1·3).
 *
 * ## 배치가 거절되는 이유는 전부 플레이어가 고칠 수 있어야 한다
 *
 * "왜 안 놓이는지 모르겠다"가 되면 그건 버그다. 그래서 실패 이유를 나열형으로 돌려주고
 * 각각에 사람이 읽을 문장을 붙인다. 특히 `unreachable` 은 **놓을 수는 있지만 손님이
 * 못 오는** 자리를 미리 막는다 — 놓고 나서 매출이 0 인 걸 발견하는 것보다 낫다.
 */

/**
 * 시설 한 자리 — 손님 하나가 **서는 칸**과 그때의 포즈·방향.
 *
 * `tile` 은 **발자국 안의 타일 인덱스**이지 격자 좌표도 텍셀 좌표도 아니다. 격자 좌표는
 * `PlacementGrid.slotTileOf()` 가 회전까지 반영해서 낸다 — `i + tile[0]` 를 손으로 쓰지 말 것
 * (`ride` 가 정확히 그 산수 때문에 K51 에서 데였다).
 *
 * `pose`·`facing` 의 **이름**은 렌더 계약(`kairo-render-contract.json` 의
 * `guest.poses`/`guest.facingNames`)이 소유한다. sim 은 문자열을 나르기만 하고,
 * 이름이 실재하는지는 `validateContracts` 가 두 파일을 맞대 본다.
 */
export interface KairoFacilitySlot {
  /** 발자국 **안의** 타일 인덱스 `(di, dj)`. `0 <= di < w`, `0 <= dj < d` */
  tile: readonly [number, number];
  pose: string;
  facing: string;
}

/**
 * 시설의 **놓인 방향** (K53 에서 `0|1` → `0|1|2|3`).
 *
 * 뜻은 **발자국 안 오프셋 `(di,dj)` 에 거는 변환**이고, 정본 산수는
 * `PlacementGrid.footprintTileOf` **한 곳**뿐이다:
 *
 * ```
 *   0  (di, dj)                    w×d   그대로            앞면 +I·+J (화면 아래)
 *   1  (dj, di)                    d×w   전치 = 가로 거울   앞면 +I·+J
 *   2  (w−1−di, d−1−dj)            w×d   180° 점대칭        앞면 −I·−J (화면 위)
 *   3  (d−1−dj, w−1−di)            d×w   전치 후 뒤집기     앞면 −I·−J
 * ```
 *
 * ⚠ **0·1 의 뜻을 바꾸지 않았다.** 세이브가 v7 그대로일 수 있는 유일한 조건이다
 * (`0 = w×d`, `1 = d×w`). 뜻을 바꾸면 이미 나간 세이브의 시설이 전부 다른 발자국으로
 * 열리므로 **v8 + 마이그레이션이 필수**가 된다.
 *
 * ⚠ 어떤 시설이 2방향인지 4방향인지는 **데이터가 정한다** (`KairoFacilityDef.facings`,
 * 불변식 3). 코드에 시설 목록을 박지 말 것 — `facingsOf()` 하나로 묻는다.
 */
export type FacilityFacing = 0 | 1 | 2 | 3;

/**
 * 회전했을 때 슬롯 방향 이름이 어디로 가나.
 *
 * 아이소에서 +I 는 `(+16,+8)`, +J 는 `(−16,+8)` 이라 i↔j 교환(전치)은 화면 x 만 뒤집는다
 * (`PlacementGrid.footprintTileOf` 주석). 그래서 전치는 `+Z↔+X`, `-Z↔-X` 이고 세로 짝은 없다.
 * 180°(facing 2)는 화면에서도 점대칭이라 앞뒤가 통째로 뒤집힌다 — `+Z↔-Z`, `+X↔-X`.
 * facing 3 은 그 둘의 합성이고 **순서에 무관**하다 (거울과 점대칭은 교환된다).
 *
 * 이름의 정본은 렌더 계약의 `guest.facingNames` 다 — 여기는 그 이름들 사이의 **짝**만 안다.
 *
 * ⚠ 손님 그림에는 아직 **옆모습이 없다** (팔레트당 고유 14장, `+X`==`+Z`·`-X`==`-Z`).
 * 그래서 4방향 슬롯의 화면 차이는 지금 앞/뒤 2종으로 근사된다 — 이름 산수는 맞고
 * 그림이 못 따라오는 상태다 (계획서 §미결 2).
 */
const MIRROR_FACING: Readonly<Record<string, string>> = {
  '+Z': '+X',
  '+X': '+Z',
  '-Z': '-X',
  '-X': '-Z',
};
const OPPOSITE_FACING: Readonly<Record<string, string>> = {
  '+Z': '-Z',
  '-Z': '+Z',
  '+X': '-X',
  '-X': '+X',
};

/** 슬롯 방향 이름에 회전을 건다 — `MIRROR`/`OPPOSITE` 의 유일한 조합 자리 */
function rotateFacingName(name: string, facing: FacilityFacing): string {
  const mirrored = facing % 2 === 1 ? (MIRROR_FACING[name] ?? name) : name;
  return facing >= 2 ? (OPPOSITE_FACING[mirrored] ?? mirrored) : mirrored;
}

/**
 * 이 시설이 몇 방향을 갖나 — **데이터가 정한다** (불변식 3). 안 적었으면 **2** 다.
 *
 * 2 = 오늘까지의 세계 (그림 1장 + 좌우 반전). 4 = 방향별 그림 4장.
 * 그림이 들어오는 순서대로 `kairo-facilities.json` 에 `"facings": 4` 를 한 줄씩 붙인다 —
 * 코드는 한 글자도 안 바뀐다.
 *
 * ⚠ 4방향이 미관 문제가 아닌 이유: `facing 1` 은 발자국을 **전치**할 뿐이라 앞면이 언제나
 * +I·+J 다. 즉 2방향에서는 "매표소를 정류장 쪽으로 돌린다"가 **게임에 없는 동작**이다
 * (K52-④ 실측). 입구를 겨누는 유일한 수단이 4방향이다.
 */
export function facingsOf(def: KairoFacilityDef): 2 | 4 {
  return def.facings === 4 ? 4 : 2;
}

/**
 * `↻` 를 눌렀을 때 다음 방향. **화면이 이 함수를 쓴다** — `(facing+1)%4` 를 UI 에 박으면
 * 2방향 시설이 그림 없는 방향으로 돌아간다.
 */
export function nextFacing(def: KairoFacilityDef, facing: FacilityFacing): FacilityFacing {
  return (((facing + 1) % facingsOf(def)) as FacilityFacing);
}

/**
 * `↻` 버튼을 띄우나.
 *
 * 2방향에서는 **정사각 발자국이면 회전이 아무것도 안 바꾼다** — 전치가 항등이고 그림은
 * 좌우 반전뿐이라 버튼이 거짓말이 된다. 4방향이면 정사각이어도 그림이 네 장이므로
 * (매점·대여소 등) 그때 처음으로 정사각 시설에서 회전이 살아난다.
 */
export function canRotate(def: KairoFacilityDef): boolean {
  return facingsOf(def) === 4 || def.size[0] !== def.size[1];
}

export interface KairoFacilityDef {
  id: string;
  name: string;
  layer: 'indoor' | 'land' | 'water' | 'pension' | 'season';
  size: readonly [number, number];
  sprite: string;
  capacity: number;
  /**
   * 경제 3항. 인터페이스에 **없어서** UI 가 건설비를 몰랐다 — week.ts 는 인라인 캐스트로
   * upkeep 만 읽고 있었고, 그래서 봇만 돈을 쓰고 플레이어는 공짜로 지었다.
   */
  cost: number;
  upkeep: number;
  /**
   * 1회 이용 **정가**. 실제로 걷히는 금액은 `PlacementGrid.feeOf()` 가 정한다 —
   * `charge: 'included'` 면 0 이다 (아래 `charge` 주석).
   */
  fee: number;
  /**
   * 과금 방식 (P6) — **입장권에 포함인가, 따로 사는 것인가.**
   *
   * 한국 빠지의 실제 요금 구조다: 표 한 장으로 물놀이·샤워·놀이기구를 다 쓰고
   * (`included`), 음식·자리 대여·숙박·보트 대여만 그 자리에서 또 낸다 (`sale`).
   * 예전에는 75종 전부가 이용마다 돈을 받아서, 화장실이 매점만큼 버는 판이었다.
   *
   * ⚠ **`need` 축과 과금 축은 다르다.** 대여소 4종은 `need: thrill`/`play` 인데
   * 파는 것이고(보트는 표에 안 들어간다), 카페는 `need: rest` 인데 파는 것이다.
   * 반대로 `need: play` 인 유수풀은 포함이다. 그래서 코드가 `need` 로 가르면 안 되고
   * **시설마다 데이터에 적는다** (불변식 3 — 시설 추가는 JSON 한 줄이어야 한다).
   *
   * ⚠ 없으면 `'sale'` 로 읽는다 (옛 동작). 다만 `charge.test.ts` 가 75종 전부
   * **명시**를 요구한다 — 안 적고 넘어간 새 시설이 조용히 돈을 받으면 안 된다.
   */
  charge?: FacilityCharge;
  /**
   * 한 줄 설명 (K49) — **무엇을 하는 곳인가 · 누가 쓰나.**
   *
   * ⚠ **효과를 다시 적지 않는다.** 정원·요금·수요는 화면이 sim 에서 잰 실효값으로 따로
   * 띄운다 (`facilityInfo`) — 여기 스탯 요약을 적으면 같은 값이 두 벌이 되고, 밸런싱으로
   * 숫자를 바꿀 때마다 데이터의 글이 조용히 거짓말이 된다.
   *
   * 불변식 3 — 시설은 코드가 아니라 데이터다. 새 시설의 설명도 JSON 한 줄이다.
   */
  desc?: string;
  /**
   * 가게 품목 (K49) — PSS 의 "가게에 뭘 파는지 보인다".
   *
   * ⚠ **표시 전용이다.** 손님이 무엇을 골랐는지는 시뮬하지 않는다 — 그건 백로그의
   * **P3-E 메뉴 슬롯**이고 스펙이 먼저다. 지금 sim 에 배선하면 밸런스가 왜 움직였는지
   * 못 가린다 (이 저장소가 K36-B③ 에서 겪은 "사고 판정이 날씨를 밀었다"와 같은 종류).
   *
   * ⚠ **평균 `price` 가 `fee` 와 정확히 같아야 한다.** 갈리면 "메뉴는 ₩3,000인데 결산은
   * ₩8,000"이 된다 — `kairo-facility.test.ts` 가 전 시설에서 고정한다.
   * ⚠ 눈금은 `fee` 와 같다 — 화면도 **게임 눈금 그대로** 쓴다. 설계서의 명목가(×10,
   * K36-B②)로 요금만 부풀리면 같은 시트의 `개선 21만` 과 자가 어긋나, "몇 번 팔아야
   * 개선비를 뽑나"가 열 배 틀린다 (`kairo-facility.ts` 의 `won` 주석에 실측).
   * ⚠ 입장권에 포함인 시설에는 넣지 않는다 — 있는 척 채우면 "여기도 음식을 파나?"가 된다.
   */
  menu?: readonly { name: string; price: number }[];
  /** Phase 3: 조합·장착 가능 시설인가. 첫 범위는 매점·카페 둘뿐이다. */
  menuMode?: 'craft' | 'fixed';
  /** 구 v7 시설과 신규 시설에 결정적으로 장착되는 기본 메뉴. */
  startingMenu?: readonly string[];
  /**
   * 어느 수요를 채우나 — 손님의 need 축 9종 중 하나.
   *
   * ⚠ **데이터에는 75종 전부 있는데 이 인터페이스에만 없었다.** `combos.ts` 와 `week.ts` 가
   * `(def as { need?: NeedKind }).need` 로 캐스트해 우회하고 있었고, 그래서 화면이 이 값을
   * 물으려면 같은 캐스트를 한 벌 더 만들어야 했다 (계약이 데이터보다 좁으면 우회가 는다).
   * ⚠ 과금 축(`charge`)과는 **다른 축**이다 — 위의 `charge` 주석 참고.
   */
  need?: NeedKind;
  /** 손님이 위로 걸어 올라갈 수 있나 — 플로팅덱·선착장만 true */
  walkOn?: boolean;
  /**
   * 방향 그림이 **몇 장인가** — 없으면 `2` (K53). 자세한 뜻은 `FacilityFacing` 주석.
   *
   * ⚠ 불변식 3 — 시설 목록을 코드에 박지 말 것. 4방향 그림이 들어온 시설만 여기에
   * `"facings": 4` 를 한 줄 붙이고, 그전까지는 **동작이 오늘과 완전히 같다**
   * (`facingsOf` 가 2 를 돌려주므로 회전은 0↔1 뿐이고 스프라이트 ID 도 안 바뀐다).
   */
  facings?: 2 | 4;
  placement: {
    requiresIndoor?: boolean;
    /** 물 위 기반이 필요하다 (인플레이터블·대여소) */
    requiresDeck?: boolean;
    /** 육지나 다른 덱에 이어져야 한다 (덱·선착장 자신) */
    requiresShoreOrDeck?: boolean;
  };
  /** 슬라이드류 — 입출구는 게임플레이라 시뮬 데이터다 */
  ride?: {
    entryTile: readonly [number, number];
    exitTile: readonly [number, number];
    traverseTicks: number;
  };
  /**
   * 이 시설을 이용하는 손님이 **실제로 서는 칸** — 발자국 안의 타일 인덱스 + 포즈·방향.
   * `slots.length === capacity` 다 (`validateContracts` 가 지킨다).
   *
   * ⚠ **한때 렌더 계약(`src/assets/kairo-render-contract.json`)에 있었다.** 슬롯이
   * "그림 위 어디에 손님을 얹나"였을 때는 그 자리가 맞았지만, 손님이 그 칸 **위에 서게**
   * 되는 순간 `g.i`/`g.j` 가 슬롯 칸이 된다 — 그건 시뮬 상태이고 히트맵·재생 프레임·
   * 골든이 읽는다. `assets/` 에 두면 Phaser 없이 도는 `npm run sim`(불변식 1) 이 슬롯을
   * 못 읽어 **헤드리스와 브라우저가 다른 손님 위치를 낸다** (불변식 2 의 실질적 붕괴).
   * 위 `ride` 와 **같은 범주**다 — 되돌리지 말 것.
   *
   * ⚠ 렌더 계약에는 슬롯을 **한 벌도 남기지 않았다.** 두 파일에 나눠 두면 같은 값이
   * 두 벌이 되고 언젠가 한쪽만 고쳐진다 (이 저장소가 네 번 겪은 실패).
   * 두 파일을 잇는 검사는 `validateContracts` 하나뿐이다 — 포즈·방향 **이름**이
   * 렌더 계약의 목록에 있는지는 거기서 대조한다.
   */
  slots?: readonly KairoFacilitySlot[];
  /**
   * 이 시설이 고를 수 있는 **특화** (P1.5). 빈 배열이면 특화가 없다.
   *
   * ⚠ 불변식 3 — 어떤 시설이 무엇으로 클 수 있는지는 코드가 아니라 데이터가 정한다.
   * 지금 데이터의 규칙: `capacity === 0` 인 분위기·기반 시설(DJ 부스·화단·펜션·플로팅덱)은
   * 손님이 슬롯을 잡지 않아 셋 다 뜻이 없어 **빈 배열**이고, 매표소는 게이트라
   * 요금·만족이 안 붙어 `capacity` 하나뿐이다 (입장 수속은 `admissionFee` 가 따로 받는다).
   */
  specialties?: readonly FacilitySpecialty[];
}

/**
 * 놓인 슬라이드의 입구·출구 **격자 좌표** (K51). 데이터의 오프셋이 아니라 실제 칸이다 —
 * 손님도 화면도 이 값만 쓴다 (`PlacementGrid.rideTilesOf`).
 */
export interface RideTiles {
  entry: readonly [number, number];
  exit: readonly [number, number];
}

/**
 * 놓인 시설의 **슬롯 한 자리** — 격자 좌표 + 그 자리에서의 포즈·방향.
 * 데이터의 발자국 오프셋이 아니라 실제 칸이다 (`RideTiles` 와 같은 규칙).
 */
export interface PlacedSlot {
  tile: readonly [number, number];
  pose: string;
  facing: string;
}

/**
 * **일부러 망가뜨리는 스위치** — 켜면 `rideTilesOf` 가 회전을 무시하고 K51 이전의
 * 산수(`i + entryTile[0]`)로 돌아간다.
 *
 * 이 저장소 규칙이다 (`setRenderFaultForTest`·`setBottleneckFaultForTest` 와 같은 자리):
 * 손으로 한 번 되돌려 확인한 것은 다음 사람에게 안 남는다. 켠 상태에서
 * ★ "회전한 입출구가 발자국 안" 과 ★ "손님이 그 칸으로 들어간다" 가 **실패해야**
 * 그 검사들이 정말 이 변환을 재고 있는 것이 된다.
 *
 * ⚠ production 에서 세우지 말 것 — 손님이 시설 밖 칸에서 미끄럼틀을 탄다.
 */
let rideFault = false;
export function setRideFaultForTest(on: boolean): void {
  rideFault = on;
}

/**
 * **일부러 망가뜨리는 스위치** — 켜면 `entryTilesOf` 가 **발자국 4이웃 전부**를 돌려준다.
 * 좁히기 이전의 세계다 (`guests.ts` 의 `rebuildFields` 가 지금 하는 것과 같은 집합).
 *
 * 위 `setRideFaultForTest` 와 **같은 자리·같은 문체**다. 손님이 "앞으로 들어간다"를 재는
 * 검사가 정말 앞 두 면을 재고 있는지는, 켠 상태에서 그 검사가 **실패해야** 증명된다 —
 * 방향 구분이 없던 옛 동작에서도 통과한다면 그 검사는 아무것도 안 재고 있는 것이다.
 *
 * ⚠ production 에서 세우지 말 것 — 손님이 시설 **뒤**로도 들어간다.
 */
let entryFault = false;
export function setEntryFaultForTest(on: boolean): void {
  entryFault = on;
}

/**
 * 시설 특화 (P1.5 — PSS 의 "그릇 속의 그릇"을 새 시스템 없이).
 *
 * 개선 5단계는 "+등급"의 단조 강화라 결정이 없었다 — 어느 시설이든 돈만 있으면 5단계가
 * 정답이다. 3단계에서 갈림길을 하나 두면 같은 개선 비용에 **"이 매점을 뭘로 키울까"**
 * 가 생긴다.
 *
 * ⚠ 셋은 반드시 **서로 다른 자원**에 꽂는다 (PSS 아이템 3속성의 핵심 — 합치면 스탯
 * 하나와 같아져 의미가 죽는다):
 * - `capacity` **회전** — 정원 +1. 시간(동시 이용 인원)에 꽂힌다
 * - `revenue`  **수익** — 요금 +25%. 돈에 꽂힌다
 * - `reputation` **평판** — 이용 만족 이득 +3. 평판(→ 유입·등급)에 꽂힌다
 *
 * 지금 뭐가 마르냐에 따라 정답이 달라져야 "고스탯 특화"가 안 생긴다.
 */
export type FacilitySpecialty = 'capacity' | 'revenue' | 'reputation';

/**
 * 과금 방식 (P6) — 두 가지뿐이다.
 *
 * - `included` **입장권에 포함**. 이용해도 요금이 0 이다. 물놀이·위생·경관·운영이
 *   여기 든다. 수입은 `admissionFee` 하나로 미리 받았다
 * - `sale` **별도 구매**. 이용할 때마다 `fee` 를 낸다. 음식·자리 대여·숙박·보트 대여
 *
 * ⚠ 셋째를 만들지 말 것 ("반값" 따위). 세 번째가 생기는 순간 결산의 두 줄
 * (입장료·매점)이 세 줄이 되고, 플레이어가 "이 시설은 어느 쪽이지"를 외워야 한다.
 */
export type FacilityCharge = 'included' | 'sale';

/**
 * 이 시설이 이용마다 돈을 받나 — **과금의 정본**.
 *
 * `feeOf()` 와 `foodShare()` 와 검사가 전부 이 함수를 부른다. `def.charge === 'sale'`
 * 을 여기저기서 직접 쓰면 기본값 규칙("없으면 sale")이 여러 벌이 되고, 언젠가 한 곳만
 * 고쳐진다.
 */
export function chargesOnUse(def: KairoFacilityDef | undefined): boolean {
  return (def?.charge ?? 'sale') === 'sale';
}

export const FACILITY_SPECIALTIES: readonly FacilitySpecialty[] = [
  'capacity',
  'revenue',
  'reputation',
];

/** 사람이 읽는 이름과 효과 — UI 가 문구를 새로 짓지 않게 sim 이 갖는다 (데이터 한 벌) */
export const SPECIALTY_LABELS: Record<FacilitySpecialty, { name: string; effect: string }> = {
  capacity: { name: '회전', effect: '정원 +1' },
  revenue: { name: '수익', effect: '요금 +25%' },
  reputation: { name: '평판', effect: '만족 +3' },
};

/** 특화를 고르는 개선 단계 */
export const SPECIALTY_LEVEL = 3;
/** 회전 — 늘어나는 정원(슬롯) */
export const SPECIALTY_CAPACITY_BONUS = 1;
/** 수익 — 요금 배수에 더해지는 몫 */
export const SPECIALTY_FEE_BONUS = 0.25;
/** 평판 — 그 시설을 이용했을 때 만족 이득에 더해지는 몫 (`useGains` 는 14/10/7/4) */
export const SPECIALTY_SATISFACTION_BONUS = 3;
/**
 * 특화 효과가 **두 배**가 되는 단계 — "이후 단계는 그 특화를 강화한다".
 *
 * 이게 없으면 3단계 이후의 개선이 다시 단조 강화로 돌아간다. 3에서 고른 갈림길이
 * 5까지 이어져야 "무엇으로 키울까"가 후반까지 산다.
 */
export const SPECIALTY_DOUBLE_LEVEL = 5;

const DEFS = (rawFacilities as unknown as { facilities: Record<string, KairoFacilityDef> })
  .facilities;

export function facilityDef(id: string): KairoFacilityDef | undefined {
  return DEFS[id];
}

export function allFacilityDefs(): KairoFacilityDef[] {
  return Object.values(DEFS);
}

export interface PlacedFacility {
  /** 인스턴스 번호 — 점유 격자가 이 값을 담는다 (0 은 "빈 칸") */
  handle: number;
  defId: string;
  i: number;
  j: number;
  /**
   * 회전 (K45 → K53). `0|1|2|3` — 뜻은 `FacilityFacing` 주석의 표가 정본이다.
   *
   * 옛 세이브에는 없다 — 없으면 0. **v7 그대로다**: `0 = w×d`, `1 = d×w` 의 뜻을
   * 그대로 두고 2·3 을 덧붙였으므로 `facing: 1` 인 옛 스냅샷이 같은 발자국으로 열린다.
   */
  facing?: FacilityFacing;
  /**
   * 개선 단계 1~3 (§15.9 시설 상세의 [업그레이드]).
   *
   * **정원은 안 늘린다.** 정원을 늘리면 등급 상한에 막힌 상태에서 아무 효과가 없다 —
   * 개선은 "같은 손님에게 더 좋은 경험"이고, 그래서 후반(확장이 막힌 구간)의 유일한
   * 성장 수단이 된다. 요금과 만족도만 올라간다.
   *
   * ⚠ 정원은 `specialty === 'capacity'` 일 때만 는다 (P1.5) — 위 문단의 "정원은 안
   * 늘린다"는 **단조 강화**에 대한 결정이다. 특화는 하나를 고르면 다른 둘을 버리는
   * 거래라, 등급 상한에 막힌 상태에서도 "무엇을 포기할까"가 남는다.
   */
  level?: number;
  /**
   * 고른 특화 (P1.5). **한 번 고르면 안 바꾼다** — 물리면 갈림길이 아니라 슬라이더다.
   *
   * ⚠ 옛 세이브에는 없다 (`facing`·`level` 과 같은 자리). optional 이라 세이브
   * 마이그레이션이 **필요 없다** — `PlacementSnapshot.items` 가 이 객체를 그대로
   * 담고 그대로 돌려준다. 버전을 올리면 이미 나간 v7 세이브가 전부 한 칸 밀린다
   * (`visitorsTotal` 선례, `src/save/kairo.ts`).
   */
  specialty?: FacilitySpecialty;
  /**
   * Phase 3 시설 인스턴스별 장착 메뉴. 일반 손님 취향·재고를 담지 않고
   * 이 작은 배열만 저장한다. 구 v7에 없으면 `startingMenu`를 파생한다.
   */
  menuIds?: string[];
}

export type PlaceFail =
  | 'outside'
  | 'outside-land'
  | 'not-buildable'
  | 'permit-over'
  | 'level-mixed'
  | 'blocks-door'
  | 'would-strand'
  | 'blocks-gate'
  | 'wrong-terrain'
  | 'occupied'
  | 'blocked-by-wall'
  | 'needs-indoor'
  | 'needs-deck'
  | 'deck-not-connected'
  | 'unreachable'
  | 'unknown-def';

/**
 * 배치 검사의 **바깥 사정** — 지형만으로는 알 수 없는 것.
 *
 * 한때 실내 판정도 여기로 받았다. 실내가 **지형 그 자체**가 된 뒤로(K27) 필요 없어졌다 —
 * `terrain.isIndoor` 가 답을 안다. 넘겨야 할 것이 줄면 넘기는 걸 잊을 일도 준다.
 */
export interface PlaceOptions {
  /**
   * 해금된 토지 (K25). 없으면 격자 전체.
   *
   * ⚠ K36 부터 **오프셋 사각형**이다 — 입구가 맵 가운데라 토지가 좌우로 자란다.
   * `{w,h}` 만 보면 왼쪽 경계를 안 봐서 입구 왼쪽 땅이 통째로 열린다.
   */
  land?: { i0: number; j0: number; w: number; h: number };
  /** 회전 (K45 → K53) — 0 기본. 판정·기록 전부 이걸 따른다 (`FacilityFacing`) */
  facing?: FacilityFacing;
  /**
   * 수면 사용 허가 면적 (S1, 등급의 `permitArea`). 물 위 시설이 강을 **밀폐**해
   * 수영 구역을 만들 때, 구역 총면적이 이를 넘으면 거절한다 (`permit-over`).
   * 안 주면 무제한 — 기존 검사·도구가 그대로 돈다.
   */
  permitArea?: number;
}

export interface PlaceOutcome {
  ok: boolean;
  fail?: PlaceFail;
  /** 성공 시 인스턴스 */
  placed?: PlacedFacility;
}

/**
 * 손님이 **설 수 있는** 칸인가 — 이 게임의 유일한 정의.
 *
 * 손님 이동·건물 문 자리·도달 검사가 전부 이걸 써야 한다. 정의가 갈라졌을 때
 * 실제로 생긴 일: 벽 도달 검사는 지형만 봐서 "닿는다"고 했는데 그 칸은 시설로
 * 막혀 있었고, 손님이 못 들어가는 건물이 통과했다 (K25 검토에서 실측).
 */
export function guestWalkable(
  terrain: KairoTerrain,
  placement: PlacementGrid,
): (i: number, j: number) => boolean {
  return (i, j) => {
    if (placement.blocksWalk(i, j)) return false;
    /*
     * ⚠ `isWalkable`(육지인가)이 아니라 `isGuestWalkable`(손님이 다니나)이다 (K32-B).
     * 잔디는 지을 수는 있어도 못 지나간다 — 길을 까는 것이 동선 설계다.
     */
    return terrain.isGuestWalkable(i, j) || placement.isWalkOn(i, j);
  };
}

/**
 * 입구 시설의 정의 id — **매표소**.
 *
 * ⚠ `guests.ts` 의 `TICKET_DEF_ID` 와 같은 값이어야 한다. 여기 다시 적는 이유는
 * 의존 방향이다: `guests.ts` 가 이 파일을 import 하므로 반대로 못 가져온다.
 * 갈라지지 않게 `placement.test.ts` 가 두 값을 대조한다.
 */
export const GATE_FACILITY_ID = 'ticket';

const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * **정류장에서 매표소까지 아직 걸어갈 수 있는가** (P3-B).
 *
 * ## 왜 이게 따로 필요한가
 *
 * 배치 검사는 오래도록 **놓는 시설**만 봤다. 실내는 `would-strand`(방을 조각내면 거절)와
 * `blocks-door`(문 앞을 막으면 거절)로 지키는데 **입구에는 그 짝이 없었다.** 그래서
 * 이미 있는 매표소가 갇히는 것을 아무도 안 막았다 — 실측(봇, P3-A ⑦): 게이트 둘레를
 * 꽉 채우자 **24판 중 6판이 17~39주차에 입장 0 으로 얼어붙었다.** 매표소로 가는 길이
 * 막혔고 새로 지을 자리도 없었다. 봇은 우회 로직으로 피했지만 게임에는 그대로 남아
 * 있었고, 플레이어도 똑같이 자기 판을 죽일 수 있었다.
 *
 * 기준점은 **게이트(공원 입구)가 아니라 정류장**이다. 손님은 버스에서 내려 도시 띠를
 * 걸어 내려와 매표소를 거쳐야 입장한다 (K36-B②) — 끊길 수 있는 구간이 게이트 **위**에도
 * 있다.
 *
 * 판정은 손님과 **같은 `guestWalkable`** 이어야 한다 (K26 ②). 부르는 쪽이 술어를
 * 넘긴다 — 배치는 "이 발자국을 뺀 판", 바닥 붓은 "이미 칠한 판"을 재기 때문이다.
 *
 * 매표소가 여럿이면 **하나라도** 닿으면 된다. 아직 하나도 없는 새 판은 언제나 true —
 * 이 검사가 새 판에서는 아무것도 막지 않는다.
 */
export function ticketsServed(
  terrain: KairoTerrain,
  walls: WallGrid,
  placement: PlacementGrid,
  stand: (i: number, j: number) => boolean,
): boolean {
  const tickets = placement.instancesOf(GATE_FACILITY_ID);
  if (tickets.length === 0) return true;
  const seen = reachable(terrain, walls, KairoTerrain.busStop(), stand);
  for (const it of tickets) {
    const def = DEFS[it.defId];
    if (!def) continue;
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, it.i, it.j, it.facing ?? 0)) {
      for (const [di, dj] of NEIGHBORS) {
        const ni = ti + di;
        const nj = tj + dj;
        if (terrain.inside(ni, nj) && seen[nj * terrain.width + ni] === 1) return true;
      }
    }
  }
  return false;
}

/**
 * 이 변경이 **매표소로 가는 마지막 길**을 끊는가.
 *
 * ⚠ 반드시 **전후 비교**여야 한다. "지금 안 닿는다"만 보면, 어떤 이유로든 이미 끊긴
 * 판에서 **아무것도 못 놓게** 되어 판이 영구히 잠긴다 — 되돌릴 수 있는 실수를 막으려다
 * 되돌릴 수 없는 상태를 만드는 꼴이다 (`would-seal`·`would-strand` 가 전부 전후 비교인
 * 이유와 같다).
 *
 * 비용: **성공 경로는 BFS 한 번**이다. `after` 가 통과하면 `before` 는 재지 않는다 —
 * 거절할 때만 두 번째 BFS 를 낸다. `check()` 는 조준 배치에서 칸이 바뀔 때마다 불리므로
 * 성공 경로의 비용이 곧 상시 비용이다.
 */
export function breaksTicketAccess(
  terrain: KairoTerrain,
  walls: WallGrid,
  placement: PlacementGrid,
  after: (i: number, j: number) => boolean,
  before: (i: number, j: number) => boolean,
): boolean {
  if (ticketsServed(terrain, walls, placement, after)) return false;
  return ticketsServed(terrain, walls, placement, before);
}

export const PLACE_FAIL_MESSAGES: Record<PlaceFail, string> = {
  outside: '격자 밖입니다',
  'outside-land': '아직 내 땅이 아닙니다 — 등급을 올리면 넓어집니다',
  /*
   * K36: 도시 띠는 **영원히** 못 짓는다 (등급을 올려도 안 열린다). 그래서 문구가
   * `outside-land` 와 달라야 한다 — "기다리면 열린다"로 읽히면 안 된다.
   */
  'not-buildable': '공원 밖입니다 — 도로·보도에는 지을 수 없습니다',
  'permit-over': '수면 사용 허가 면적을 넘습니다 — 등급을 올리세요',
  /*
   * K37: 단이 섞인 발자국. **처방이 "평지"** 여야 한다 — "지형이 안 맞습니다"로 뭉치면
   * 물가인지 경사인지 구분이 안 된다. 이것이 "산 중턱 평지"가 게임이 되는 지점이다.
   */
  'level-mixed': '경사입니다 — 단이 고른 평지에 놓으세요',
  'blocks-door': '문 앞은 비워야 합니다',
  'would-strand': '이 자리에 놓으면 실내 일부에 못 가게 됩니다',
  /*
   * P3-B: `would-strand`/`blocks-door` 의 **입구 판**. 처방이 "길을 한 칸 남기라"여야
   * 한다 — "매표소가 갇힙니다"만으로는 무엇을 하면 되는지 모른다.
   */
  'blocks-gate': '매표소로 가는 길이 막힙니다 — 길을 한 칸 남기세요',
  'wrong-terrain': '이 지형에는 놓을 수 없습니다',
  occupied: '다른 시설이 있습니다',
  'blocked-by-wall': '벽이 지나갑니다',
  'needs-indoor': '건물 안에만 지을 수 있습니다 — 건설 ▸ 건물 에서 넓히세요',
  'needs-deck': '플로팅덱에 붙여야 합니다',
  'deck-not-connected': '덱이 육지나 다른 덱과 이어져야 합니다',
  /*
   * K32-B: 이 실패의 원인이 거의 항상 "길이 없다"로 바뀌었다 (잔디는 못 지나간다).
   * 예전 문구는 무엇을 하면 되는지 안 알려줬다 — 처방을 담는다.
   */
  unreachable: '손님이 못 옵니다 — 여기까지 길을 까세요',
  'unknown-def': '알 수 없는 시설입니다',
};

/**
 * 개선 최고 단계.
 *
 * 3 이었을 때 **후반이 비었다** — 312주 중 281주가 "지을 게 없다"이고 현금이 1.5억 쌓였다.
 * 개선이 유일한 돈 쓸 곳인데 61개 시설 × 2단계면 40주에 끝난다.
 *
 * 5 로 올리면 두 가지가 같이 풀린다: **돈 쓸 곳**이 길어지고, 만족도 여유(단계당 +6)가
 * +24 까지 늘어 5등급 문턱(85)이 닿는다. 비용이 단계마다 가팔라지므로 후반 단계는
 * 시설 하나에 건설비 몇 배가 든다 — 그래서 "전부 최고"가 아니라 선택이 된다.
 */
/**
 * 시설 **개선 등급**의 상한 (§15.9). 지형의 단(`KairoTerrain.MAX_LEVEL`)과 다르다.
 *
 * ⚠ 예전 이름은 `MAX_LEVEL` 이었는데, K37 이 지형에 `KairoTerrain.MAX_LEVEL`(단 3)을
 * 더하면서 sim 안에 같은 이름이 **둘**이 됐다. `economy.test.ts` 는 등급 쪽을,
 * `levels.test.ts` 는 지형 쪽을 같은 이름으로 읽어서, 하나를 고치며 다른 하나를 고쳤다고
 * 착각하기 쉬웠다 (아키텍처 점검에서 지적).
 */
export const FACILITY_MAX_LEVEL = 5;
/** 단계당 요금 상승 */
export const LEVEL_FEE_STEP = 0.3;
/** 평균 단계가 1 오를 때 만족도 보너스 */
export const LEVEL_SATISFACTION = 6;

export interface PlacementSnapshot {
  w: number;
  h: number;
  next: number;
  items: PlacedFacility[];
}

/** 물 위에 놓는 층 — 나머지는 걸을 수 있는 땅을 요구한다 */
function wantsWater(layer: KairoFacilityDef['layer']): boolean {
  return layer === 'water';
}

export class PlacementGrid {
  /** 0 = 빈 칸, 그 외 = 시설 handle */
  private readonly cells: Int32Array;
  private readonly items = new Map<number, PlacedFacility>();
  private nextHandle = 1;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Int32Array(width * height);
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.width && j < this.height;
  }

  /** 이 칸을 점유한 시설 handle. 0 이면 비었다 */
  handleAt(i: number, j: number): number {
    return this.inside(i, j) ? (this.cells[j * this.width + i] as number) : 0;
  }

  /**
   * 손님이 이 칸을 밟을 수 있나 — 플로팅덱·선착장만 true.
   *
   * K5 까지는 손님이 시설을 **통째로 뚫고** 지나갔다. 시설이 길을 막지 않으면 배치가
   * 동선에 영향을 주지 않아 "배치가 결과를 바꾼다"가 성립하지 않는다.
   */
  isWalkOn(i: number, j: number): boolean {
    const item = this.at(i, j);
    return item ? DEFS[item.defId]?.walkOn === true : false;
  }

  /** 손님의 길을 막나 — 점유돼 있고 걸어 올라갈 수 없으면 막는다 */
  blocksWalk(i: number, j: number): boolean {
    const h = this.handleAt(i, j);
    if (h === 0) return false;
    return !this.isWalkOn(i, j);
  }

  at(i: number, j: number): PlacedFacility | undefined {
    const h = this.handleAt(i, j);
    return h === 0 ? undefined : this.items.get(h);
  }

  get count(): number {
    return this.items.size;
  }

  all(): PlacedFacility[] {
    return [...this.items.values()];
  }

  /**
   * 이 정의의 인스턴스들 — 없으면 빈 배열.
   *
   * `all().filter(...)` 로 쓰면 격자 전체를 배열로 복사한 뒤 버린다. `check()` 는
   * 조준 배치에서 칸이 바뀔 때마다 불리므로 그 경로에 쓰는 조회는 복사가 없어야 한다.
   */
  instancesOf(defId: string): PlacedFacility[] {
    const out: PlacedFacility[] = [];
    for (const it of this.items.values()) if (it.defId === defId) out.push(it);
    return out;
  }

  /** 발자국이 덮는 타일 목록 */
  /**
   * 회전을 반영한 발자국 크기 (K45) — 발자국을 쓰는 **모든 곳**이 이걸 거쳐야 한다.
   *
   * ⚠ 홀수 방향(1·3)만 w↔d 를 맞바꾼다 (`facing % 2`). 180°(2)는 사각형을 안 바꾼다.
   * 이 한 줄이 판정·점유·철거·복원·화면 윤곽의 **유일한 관문**이라, 부르는 쪽에서
   * `facing === 1 ? [d,w] : [w,d]` 를 다시 쓰면 4방향에서 반드시 한 곳이 남는다
   * (K53 이전에 실제로 여섯 벌이었다).
   */
  static sizeOf(def: KairoFacilityDef, facing: FacilityFacing = 0): [number, number] {
    return facing % 2 === 1 ? [def.size[1], def.size[0]] : [def.size[0], def.size[1]];
  }

  /**
   * 물 위 시설이 차지한 칸들 (S1) — 수영 구역 파생의 장벽 집합.
   * walkOn(덱·선착장)만이 아니라 **물 위 전부**다: 트램폴린이 놓인 칸도 헤엄칠 수 없다.
   */
  waterBarrierKeys(): Set<number> {
    const out = new Set<number>();
    for (const item of this.items.values()) {
      const def = DEFS[item.defId];
      if (!def || def.layer !== 'water') continue;
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j, item.facing ?? 0)) {
        out.add(deckKey(ti, tj));
      }
    }
    return out;
  }

  static footprintTiles(
    def: KairoFacilityDef,
    i: number,
    j: number,
    facing: FacilityFacing = 0,
  ): [number, number][] {
    const [w, h] = PlacementGrid.sizeOf(def, facing);
    const out: [number, number][] = [];
    for (let di = 0; di < w; di++) {
      for (let dj = 0; dj < h; dj++) out.push([i + di, j + dj]);
    }
    return out;
  }

  /**
   * 슬라이드류의 **입구·출구 칸** — 회전을 반영한 격자 좌표 (K51).
   *
   * ## 왜 함수 하나인가
   *
   * 예전엔 이 계산이 `guests.ts` 한 곳에만 `item.i + def.ride.entryTile[0]` 로 펼쳐져
   * 있었다. 화면이 입출구를 그리게 되는 순간(배치 미리보기·시설 정보) 같은 산수를 한 벌
   * 더 쓰게 되는데, 이 저장소가 **반복해서 겪은 실패가 정확히 그것**이다
   * (`guestWalkable`·`evaluateCondition`·`capacityOf`·`admissionLimit`). 표시와 손님이
   * 다른 칸을 가리키면 표시가 조용히 거짓말이 된다 — 그러면 안 보여 주는 편이 낫다.
   *
   * ## 회전은 **전치**다 (`(di,dj) → (dj,di)`)
   *
   * 발자국과 같은 규칙이어야 한다. `sizeOf` 는 `facing===1` 에서 w↔h 만 바꾸고
   * `footprintTiles` 는 `(i,j)` 에서 그 사각형을 편다 — 그 사각형에 오프셋을 다시
   * 넣는 유일한 방법이 전치다 (`dj0 < h0 = w`, `di0 < w0 = h` 라 **항상 발자국 안**이다).
   *
   * 그림과도 맞는다. 씬은 회전을 `setFlipX` 로 그리는데, 아이소에서 +I 는 `(+16,+8)`
   * +J 는 `(−16,+8)` 이므로 i 와 j 를 맞바꾸면 화면 x 만 뒤집히고 y 는 그대로다 —
   * **전치 = 가로 거울**이다. 다른 변환을 쓰면 스프라이트와 입출구가 따로 논다.
   *
   * ⚠ **회전이 입출구를 안 돌리던 것이 버그였다** (K51 에서 재현). `slide_large`(4×5,
   * 입구 `[3,4]`)를 회전하면 발자국이 5×4 라 `dj=4` 는 **발자국 밖**이고, 손님이 시설
   * 바깥 칸에서 미끄럼틀을 탔다. 회전 가능 조건이 `size[0] !== size[1]` 이라
   * `slide_large`·`snow_sled` 둘이 그 상태였다.
   */
  static rideTilesOf(
    def: KairoFacilityDef,
    i: number,
    j: number,
    facing: FacilityFacing = 0,
  ): RideTiles | null {
    const r = def.ride;
    if (!r) return null;
    // 고장 스위치는 **회전을 안 준 것처럼** 부른다 — 전치 산수 자체는 아래 한 곳뿐이다
    const put = (o: readonly [number, number]): [number, number] =>
      PlacementGrid.footprintTileOf(def, i, j, o, rideFault ? 0 : facing);
    return { entry: put(r.entryTile), exit: put(r.exitTile) };
  }

  /**
   * 발자국 **안의 오프셋** `(di,dj)` → **격자 좌표**. 회전을 반영하는 **유일한 자리**.
   *
   * ⚠ **전치 산수를 두 벌 만들지 말 것.** `ride` 입출구와 `slots` 가 같은 종류의 값
   * (발자국 안의 오프셋)인데 각자 `i + o[0]` 를 펼치면, 한쪽만 회전을 배우는 상태가 다시
   * 생긴다 — K51 이 정확히 그 버그였다 (`slide_large` 4×5 의 입구 `[3,4]` 가 회전 후
   * 발자국 5×4 밖으로 나가 손님이 시설 바깥 칸에서 미끄럼틀을 탔다).
   *
   * 규칙은 `sizeOf`/`footprintTiles` 와 같아야 한다.
   *
   * ## 4방향 변환식 (K53) — `w`·`d` 는 **데이터 그대로의** 발자국 (`def.size`)
   *
   * ```
   *   0  (di, dj)              그대로            사각형 w×d
   *   1  (dj, di)              전치              사각형 d×w
   *   2  (w−1−di, d−1−dj)      뒤집기            사각형 w×d
   *   3  (d−1−dj, w−1−di)      전치 후 뒤집기    사각형 d×w
   * ```
   *
   * ⚠ **전치만으로는 부족하다.** K51 이 정확히 이 자리에서 데였고(회전이 입출구를 안
   * 돌려 `slide_large` 의 입구 `[3,4]` 가 발자국 밖으로 나갔다), 4방향에서는 **뒤집기를
   * 빼먹는 것**이 같은 모양의 두 번째 사고가 된다: `facing 2` 를 전치 없이 그대로 두면
   * 그림만 뒤돌고 입구·슬롯은 앞에 남아, 화면과 손님이 갈라진다.
   *
   * 발자국 안이 보장된다: 1·3 은 `dj < d = W`, `di < w = D`; 2·3 의 뒤집기는
   * `0 ≤ w−1−di < w` 라 구간을 벗어나지 않는다 (검사가 75종 × 4방향 전수로 잰다).
   *
   * ⚠ `def` 를 받는 이유는 **뒤집기가 `w`·`d` 를 알아야 하기 때문**이다. 부르는 쪽이
   * 크기를 따로 넘기게 하면 그 크기가 `sizeOf` 와 갈라질 수 있다 — 여기서 `def.size` 를
   * 직접 읽어 그럴 자리를 없앤다.
   */
  static footprintTileOf(
    def: KairoFacilityDef,
    i: number,
    j: number,
    o: readonly [number, number],
    facing: FacilityFacing = 0,
  ): [number, number] {
    const [w, d] = def.size;
    // 먼저 전치 (홀수 방향), 그 다음 뒤집기 (2·3) — 전치 뒤의 사각형 안에서 뒤집는다
    const [tw, td] = facing % 2 === 1 ? [d, w] : [w, d];
    const [ti, tj] = facing % 2 === 1 ? [o[1], o[0]] : [o[0], o[1]];
    const [fi, fj] = facing >= 2 ? [tw - 1 - ti, td - 1 - tj] : [ti, tj];
    return [i + fi, j + fj];
  }

  /**
   * 놓인 시설의 **k번째 손님이 서는 칸** — 격자 좌표 + 포즈·방향 (없으면 `null`).
   *
   * `slots` 가 없는 시설(정원 0 인 분위기·기반 시설 14종)은 `null` 이다 — 부르는 쪽이
   * "슬롯이 없으면 옛날처럼 발자국 밖에 세운다"를 고를 수 있게 던지지 않는다.
   *
   * ## 정원이 슬롯보다 많을 수 있다 — **최대 2명**
   *
   * `capacityOf` 는 회전 특화(P1.5)로 `def.capacity + 1~2` 가 되는데 `slots` 는 데이터
   * 고정이라 안 늘어난다. 그래서 `k` 를 **modulo** 로 감고, 넘친 손님(`k >= slots.length`)
   * 은 포즈를 `'idle'` 로 바꾼다 — 같은 칸에 서고 화면이 나중에 흩는다.
   * ⚠ 넘친 손님을 **거절하지 않는다**: 슬롯이 정원의 정본이 되면 `capacityOf` 와 두 벌이
   * 되고, "회전 특화로 정원을 올렸는데 아무도 안 들어온다"가 된다. 붐비는 것이 보이는
   * 편이 낫다 — "회전 특화 = 붐빈다"가 화면에 나타나야 그 선택이 읽힌다.
   *
   * ## 방향은 **거울과 점대칭의 합성**이다
   *
   * 전치(1·3)는 화면 x 만 뒤집으므로 `+Z ↔ +X`, `-Z ↔ -X`. 180°(2·3)는 화면에서도
   * 점대칭이라 앞뒤가 뒤집힌다 (`+Z ↔ -Z`, `+X ↔ -X`). 산수는 `rotateFacingName`
   * 하나가 갖는다 — 여기서 표를 다시 펼치면 `footprintTileOf` 와 갈라진다.
   */
  static slotTileOf(
    def: KairoFacilityDef,
    i: number,
    j: number,
    facing: FacilityFacing = 0,
    k = 0,
  ): PlacedSlot | null {
    const slots = def.slots;
    if (!slots || slots.length === 0) return null;
    const n = slots.length;
    const idx = ((k % n) + n) % n;
    const s = slots[idx]!;
    return {
      tile: PlacementGrid.footprintTileOf(def, i, j, s.tile, facing),
      // 정원 초과분은 데이터가 정한 자세(눕기·헤엄)를 흉내 낼 자리가 없다 — 그냥 선다
      pose: k >= n ? 'idle' : s.pose,
      facing: rotateFacingName(s.facing, facing),
    };
  }

  /**
   * 손님이 **이 시설로 들어가는 칸** — 발자국 **밖**의 이웃 칸들 (K52).
   *
   * ## 왜 선언하지 않고 파생하나
   *
   * 75종에 입구 좌표를 손으로 적으면 그림이 바뀔 때마다 조용히 틀리고, 틀렸다는 것을
   * 잴 방법이 없다. 발자국에서 파생하면 틀릴 곳이 없고 **회전이 공짜**다 —
   * `sizeOf` 가 이미 w↔d 를 맞바꾸므로 +I/+J 면이 자동으로 따라 돈다 (새 산수 0줄).
   *
   * ## 규칙
   *
   *   `ride` 가 있으면 → 선언된 입구 칸(`rideTilesOf().entry`)의 **바깥 이웃**만.
   *                      모서리를 데이터가 이미 골랐으므로 존중한다
   *   아니면          → 발자국 **앞 두 면**의 바깥 이웃:
   *                      facing 0·1 → +I·+J  `{(i+w, j+dj)} ∪ {(i+di, j+d)}`
   *                      facing 2·3 → −I·−J  `{(i−1, j+dj)} ∪ {(i+di, j−1)}`
   *
   * 아이소에서 +I·+J 는 화면 **아래쪽** 두 변이다 — 카메라를 향한 면이고, 스프라이트가
   * 정면을 그리는 쪽이다. 모서리 `(i+w, j+d)` 는 어느 면에도 안 붙어 있어 뺀다.
   *
   * ## 왜 2·3 에서 면이 뒤집히나 (K53)
   *
   * `footprintTileOf` 의 표를 발자국 **밖 오프셋**에 그대로 적용한 결과다. 데이터의
   * +I 면 바깥 칸은 `(w, dj)` 인데, facing 2 의 뒤집기 `(w−1−di)` 에 `di = w` 를 넣으면
   * `−1` 이 나온다 — 즉 그림이 뒤돌면 입구도 같이 뒤로 돈다. 그래야 4방향이 "입구를
   * 겨누는 수단"이 된다 (facing 1 은 전치라 앞면이 앞면끼리 맞바뀔 뿐이다).
   * ⚠ 여기서 `sizeOf` 를 안 쓰고 축을 손으로 세면 **회전이 공짜**라는 성질이 사라진다.
   *
   * ⚠ **`slots` 에서 파생하면 안 된다.** 그림 데이터가 이미 반대로 말한다 — 실측
   * (`slots` 를 가진 비-`ride` 시설 **57종 전부**에서 답이 다르다):
   *   · **4종**(`airbounce`·`turtle_island`·`junglegym_w`·`ice_fishing`)은 슬롯이 전부
   *     발자국 **안쪽**이라 인접한 바깥 칸이 **하나도 없다** — 입구가 빈 집합이 된다
   *   · `pool_warm 4×4` 는 8개 중 4개가 안쪽이고 나머지 4개가 **`−J` 뒷변**에 있어,
   *     파생하면 입구가 통째로 **뒤**로 간다 (`cafe 2×3` 도 슬롯이 뒷줄이라 같다)
   * 슬롯이 앞줄을 비워 두는 것은 "앞으로 들어가 뒤에 앉는다"가 이미 데이터에 있다는 뜻이다 —
   * 그 빈 줄이 입구이지, 슬롯이 입구인 것이 아니다.
   *
   * ⚠ 이 함수는 **순수 파생**이다 — 통행 가능 여부(`guestWalkable`)도 격자 범위도 안 본다.
   * 부르는 쪽이 자기 판정으로 거른다. 여기서 걸러 버리면 "왜 입구가 없지"를 부르는 쪽이
   * 설명할 수 없고, 무엇보다 `guestWalkable` 의 정의가 한 벌 더 생긴다 (세 번 사고 난 자리).
   */
  static entryTilesOf(
    def: KairoFacilityDef,
    i: number,
    j: number,
    facing: FacilityFacing = 0,
  ): [number, number][] {
    const [w, d] = PlacementGrid.sizeOf(def, facing);
    const out: [number, number][] = [];
    const push = (ti: number, tj: number): void => {
      // 발자국 안은 "들어가는 칸"이 아니다 (ride 입구의 이웃이 안쪽일 수 있다)
      if (ti >= i && ti < i + w && tj >= j && tj < j + d) return;
      out.push([ti, tj]);
    };

    if (entryFault) {
      // 좁히기 이전 — 네 면 전부. 방향 구분이 없다
      for (let di = 0; di < w; di++) {
        push(i + di, j - 1);
        push(i + di, j + d);
      }
      for (let dj = 0; dj < d; dj++) {
        push(i - 1, j + dj);
        push(i + w, j + dj);
      }
      return out;
    }

    const r = PlacementGrid.rideTilesOf(def, i, j, facing);
    if (r) {
      const [ei, ej] = r.entry;
      push(ei + 1, ej);
      push(ei, ej + 1);
      push(ei - 1, ej);
      push(ei, ej - 1);
      return out;
    }

    // 앞면이 어느 쪽인가 — 0·1 은 +I·+J (화면 아래), 2·3 은 −I·−J (화면 위)
    const back = facing >= 2;
    for (let dj = 0; dj < d; dj++) push(back ? i - 1 : i + w, j + dj);
    for (let di = 0; di < w; di++) push(i + di, back ? j - 1 : j + d);
    return out;
  }

  /**
   * 놓을 수 있는가. 검사 순서는 **플레이어에게 유용한 순서**다 —
   * 격자 밖 → 지형 → 점유 → 벽 → 벽부착 → 도달. 앞쪽이 더 명백한 실패다.
   */
  check(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    defId: string,
    i: number,
    j: number,
    opts?: PlaceOptions,
  ): PlaceOutcome {
    const def = DEFS[defId];
    if (!def) return { ok: false, fail: 'unknown-def' };

    const facing = opts?.facing ?? 0;
    const tiles = PlacementGrid.footprintTiles(def, i, j, facing);
    for (const [ti, tj] of tiles) {
      if (!this.inside(ti, tj)) return { ok: false, fail: 'outside' };
    }

    if (opts?.land) {
      const L = opts.land;
      for (const [ti, tj] of tiles) {
        if (ti < L.i0 || tj < L.j0 || ti >= L.i0 + L.w || tj >= L.j0 + L.h) {
          return { ok: false, fail: 'outside-land' };
        }
      }
    }

    /*
     * 도시 띠(도로·보도·가로수)에는 못 짓는다 (K36). **토지 검사 다음, 지형 검사 앞**이다 —
     * "내 땅 밖"과 "내 땅 안이지만 도로"는 처방이 다르므로 사유를 갈라야 한다.
     */
    for (const [ti, tj] of tiles) {
      if (!terrain.isBuildable(ti, tj)) return { ok: false, fail: 'not-buildable' };
    }

    /*
     * 단이 섞인 발자국에는 못 놓는다 (K37). **`not-buildable` 다음, 지형 검사 앞**이다 —
     * 못 놓는 이유는 가장 바깥 제약부터 말해야 처방이 맞는다 (도로 > 경사 > 지형).
     *
     * 물 위 시설은 건너뛴다: 물은 영구히 단 0 이라 언제나 균일하고, 잔교가 물가(단 0)와
     * 물을 걸쳐도 둘 다 0 이므로 통과한다.
     */
    if (!wantsWater(def.layer)) {
      /*
       * ⚠ 판정은 `terrain.levelUniform` **하나**를 쓴다. 예전엔 여기서 `levelAt` 을 직접
       * 돌려 같은 규칙이 두 벌이었고, `levelUniform` 은 production 이 안 쓰는 채로
       * 하네스만 부르고 있었다 — 규칙이 갈라지면 "검사는 통과하는데 게임은 다르게 판정"이
       * 된다 (K38 아키텍처 점검 지적).
       */
      const [fw, fh] = PlacementGrid.sizeOf(def, facing);
      if (!terrain.levelUniform(i, j, fw, fh)) {
        return { ok: false, fail: 'level-mixed' };
      }
    }

    const needWater = wantsWater(def.layer);
    for (const [ti, tj] of tiles) {
      const walkable = terrain.isWalkable(ti, tj);
      if (needWater ? walkable : !walkable) return { ok: false, fail: 'wrong-terrain' };
    }

    for (const [ti, tj] of tiles) {
      if (this.handleAt(ti, tj) !== 0) return { ok: false, fail: 'occupied' };
    }

    for (const [ti, tj] of tiles) {
      // 벽은 이제 **경계**에 있어 칸을 막지 않는다 (K25) — 벽 위에도 시설을 놓을 수 있다
      if (ti === gate.i && tj === gate.j) return { ok: false, fail: 'occupied' };
    }

    // 물 위 부착 규칙 — 플로팅덱이 물 위 유일 기반 (결정 11)
    if (def.placement.requiresDeck) {
      const onDeck = tiles.some(([ti, tj]) =>
        [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => this.isWalkOn(ti + (di as number), tj + (dj as number))),
      );
      if (!onDeck) return { ok: false, fail: 'needs-deck' };
    }
    if (def.placement.requiresShoreOrDeck) {
      const connected = tiles.some(([ti, tj]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => {
          const ni = ti + (di as number);
          const nj = tj + (dj as number);
          if (!terrain.inside(ni, nj)) return false;
          // 육지(걸을 수 있는 지면)거나 다른 덱
          return terrain.isWalkable(ni, nj) || this.isWalkOn(ni, nj);
        }),
      );
      if (!connected) return { ok: false, fail: 'deck-not-connected' };
    }

    /*
     * 수면 사용 허가 (S1) — 물 위 시설이 강을 밀폐하면 그 안이 수영 구역이 되는데
     * (`swim.ts`), 구역 면적은 등급의 허가 면적을 소비한다 ("허가는 돈으로 못 산다").
     * 이 시설을 **놓았다 치고** 구역을 재서 넘으면 거절 — 밀폐를 완성하는 마지막
     * 한 칸이 걸린다. permitArea 의 첫 소비자다 (v1.1 실측: 그전까지 죽은 값이었다).
     *
     * 여기서 쓰는 것은 `permitUsed` 가 보는 **면적뿐**이라 입수점 술어는 상수 `false`
     * 로 준다 — 입수점은 "놓을 수 있나"와 무관하다 (입수점이 없는 구역도 면적은 먹는다).
     */
    if (wantsWater(def.layer) && opts?.permitArea !== undefined) {
      const barrier = this.waterBarrierKeys();
      for (const [ti, tj] of tiles) barrier.add(deckKey(ti, tj));
      const zones = riverZones(terrain, barrier, () => false);
      if (permitUsed(zones) > opts.permitArea) return { ok: false, fail: 'permit-over' };
    }

    if (def.placement.requiresIndoor) {
      /*
       * 실내 시설 9종 — 발자국이 **전부 건물 안**이어야 한다.
       *
       * ⚠ 한때 "벽 경계에 접했나"(`hasAnyEdge`)로 봤는데 **경계는 두 칸이 공유한다.**
       * 그래서 건물 **바깥**에서 벽에 접한 칸도 통과했고, 샤워실·탈의실이 야외 잔디에
       * 놓였다 (K26 ① 에서 실측). 붙는 대상은 벽이 아니라 **방**이고,
       * 방은 곧 **실내 바닥을 깐 자리**다 (K27).
       */
      const allIndoor = tiles.every(([ti, tj]) => terrain.isIndoor(ti, tj));
      if (!allIndoor) return { ok: false, fail: 'needs-indoor' };
    }

    /*
     * 문을 막지 않는다 (K30).
     *
     * ⚠ 실측으로 잡은 구멍이다: 방을 만든 뒤 **나중에 놓은 시설이 문 앞칸을 덮으면**
     * 그 방은 손님이 못 들어가는 죽은 공간이 된다. 벽에는 문이 그대로 남아 있어서
     * 화면상으로는 멀쩡해 보이고, 안의 실내 시설이 조용히 매출 0 이 된다.
     *
     * 문은 양쪽 다 설 수 있어야 하므로(K26 ②) **문이 있는 경계에 접한 칸**은 안팎
     * 가리지 않고 비워 둔다. 밟고 지나갈 수 있는 시설(덱)은 예외다.
     */
    if (!def.walkOn) {
      for (const [ti, tj] of tiles) {
        for (const d of [0, 1, 2, 3] as const) {
          if (walls.edgeAt(ti, tj, d) === EDGE_DOOR) return { ok: false, fail: 'blocks-door' };
        }
      }
    }

    /*
     * 실내를 조각내지 않는다 (K30).
     *
     * ⚠ 벽에는 밀폐 차단이 있는데(`canPlaceEdge` 의 `would-seal`) **시설에는 없었다.**
     * 방 안에 시설을 놓아 안쪽 구석을 갈라 놓으면 그 칸들은 영영 못 쓰고, 방은 그 뒤로
     * 넓히지도 못한다 (`bakeIndoorWalls` 가 `unreachable` 로 거절한다). 화면상으로는
     * 멀쩡해 보여서 왜 안 되는지 알 수 없다 — 헤드리스에서 실제로 이 상태를 만들었다.
     *
     * 실내에 놓을 때만 검사한다. 바깥은 열려 있어 조각날 일이 없고, 검사가 공짜가 아니다.
     */
    const touchesIndoor = tiles.some(([ti, tj]) => terrain.isIndoor(ti, tj));
    if (touchesIndoor && !def.walkOn) {
      const stand = guestWalkable(terrain, this);
      const inFoot = (i: number, j: number): boolean =>
        tiles.some(([ti, tj]) => ti === i && tj === j);
      const before = reachable(terrain, walls, gate, stand);
      const after = reachable(terrain, walls, gate, (i, j) => !inFoot(i, j) && stand(i, j));
      const wIdx = terrain.width;
      for (let j = 0; j < terrain.height; j++) {
        for (let i = 0; i < wIdx; i++) {
          if (inFoot(i, j)) continue;
          if (before[j * wIdx + i] === 1 && after[j * wIdx + i] !== 1) {
            return { ok: false, fail: 'would-strand' };
          }
        }
      }
    }

    /*
     * 이미 있는 **매표소를 가두지 않는다** (P3-B). 왜는 `ticketsServed` 참고.
     *
     * ⚠ 조기 반환이 둘이다 — `check()` 는 조준 배치에서 칸이 바뀔 때마다 불린다:
     *   ① 밟고 지나가는 시설(덱·선착장)은 길을 **늘리기만** 한다
     *   ② 지금 손님이 못 서는 칸(잔디·물)을 덮는 배치는 도달 집합을 **바꾸지 않는다** —
     *      막기 전에도 못 지나갔다. 시설은 대개 잔디에 놓이므로 이 가지가 자주 탄다
     * 둘 다 아니면 그때 BFS 한 번 (거절할 때만 두 번 — `breaksTicketAccess`).
     */
    if (!def.walkOn) {
      const stand = guestWalkable(terrain, this);
      if (tiles.some(([ti, tj]) => stand(ti, tj))) {
        const inFoot = (x: number, y: number): boolean =>
          tiles.some(([ti, tj]) => ti === x && tj === y);
        const afterStand = (x: number, y: number): boolean => !inFoot(x, y) && stand(x, y);
        if (breaksTicketAccess(terrain, walls, this, afterStand, stand)) {
          return { ok: false, fail: 'blocks-gate' };
        }
      }
    }

    // 도달 — 발자국에 인접한 칸 중 하나라도 게이트에서 걸어올 수 있어야 한다.
    // 물 위 시설은 이 검사를 건너뛴다 (K6 의 플로팅덱 연결이 담당한다)
    if (!needWater) {
      /*
       * ⚠ **손님 판정**으로 잰다 (K32-B). 지형만 보면 잔디 위 외딴 자리가 통과하고,
       * 손님은 못 오는데 검사는 통과하는 상태가 된다 — K26 ② 와 같은 구멍이다.
       * 놓으려는 시설 자신은 아직 격자에 없으므로 그대로 넘겨도 된다.
       */
      const reach = reachable(terrain, walls, gate, guestWalkable(terrain, this));
      const ok = tiles.some(([ti, tj]) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([di, dj]) => {
          const ni = ti + (di as number);
          const nj = tj + (dj as number);
          if (!terrain.inside(ni, nj)) return false;
          // 발자국 자기 자신은 제외
          if (ni >= i && ni < i + def.size[0] && nj >= j && nj < j + def.size[1]) return false;
          return reach[nj * terrain.width + ni] === 1;
        }),
      );
      if (!ok) return { ok: false, fail: 'unreachable' };
    }

    return { ok: true };
  }

  place(
    terrain: KairoTerrain,
    walls: WallGrid,
    gate: { i: number; j: number },
    defId: string,
    i: number,
    j: number,
    opts?: PlaceOptions,
  ): PlaceOutcome {
    const r = this.check(terrain, walls, gate, defId, i, j, opts);
    if (!r.ok) return r;
    const def = DEFS[defId] as KairoFacilityDef;
    const handle = this.nextHandle++;
    const facing = opts?.facing ?? 0;
    /*
     * ⚠ `facing: 0` 은 **계속 생략한다** (K53). 옛 세이브가 그 필드를 안 갖고 있고,
     * 지금도 판의 거의 전부가 0 이다 — 넣으면 스냅샷이 시설 수만큼 커진다.
     * 조건이 `!== 0` 인 것이 핵심: `=== 1` 로 두면 2·3 이 조용히 0 으로 저장된다.
     */
    const placed: PlacedFacility = {
      handle,
      defId,
      i,
      j,
      ...(facing !== 0 ? { facing } : {}),
      ...(def.menuMode === 'craft' && (def.startingMenu?.length ?? 0) > 0
        ? { menuIds: [...(def.startingMenu ?? [])].slice(0, menuSlotsForLevel(1)) }
        : {}),
    };
    this.items.set(handle, placed);
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, i, j, facing)) {
      this.cells[tj * this.width + ti] = handle;
    }
    return { ok: true, placed };
  }

  remove(handle: number): boolean {
    const item = this.items.get(handle);
    if (!item) return false;
    const def = DEFS[item.defId] as KairoFacilityDef;
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, item.i, item.j, item.facing ?? 0)) {
      if (this.handleAt(ti, tj) === handle) this.cells[tj * this.width + ti] = 0;
    }
    this.items.delete(handle);
    return true;
  }

  /** 손님이 동시에 이용할 수 있는 총 칸 수 — 결산에서 병목을 읽는 근거 */
  totalCapacity(): number {
    let n = 0;
    for (const it of this.items.values()) n += this.capacityOf(it.handle);
    return n;
  }

  /** 개선 단계 (없으면 1) */
  levelOf(handle: number): number {
    return this.items.get(handle)?.level ?? 1;
  }

  /** 시설 단계가 여는 메뉴 칸. 규칙은 `menu.ts` 한 곳에 있다. */
  menuSlotCount(handle: number): number {
    const item = this.items.get(handle);
    const def = item ? DEFS[item.defId] : undefined;
    return def?.menuMode === 'craft' ? menuSlotsForLevel(this.levelOf(handle)) : 0;
  }

  /** 장착된 메뉴 ID. 반환 배열을 바꾸어도 시설 상태는 바뀌지 않는다. */
  menuIdsOf(handle: number): string[] {
    const item = this.items.get(handle);
    if (!item || this.menuSlotCount(handle) === 0) return [];
    return [...(item.menuIds ?? [])].slice(0, this.menuSlotCount(handle));
  }

  /** 손님·주간 공급·입장 정원이 함께 쓰는 메뉴형 시설 운영 판정. */
  menuOperabilityOf(
    handle: number,
    recipeAvailable: (recipeId: string) => boolean = () => true,
  ): MenuFacilityOperability {
    const item = this.items.get(handle);
    const def = item ? DEFS[item.defId] : undefined;
    return menuFacilityOperability(
      item?.defId,
      def?.menuMode,
      this.menuIdsOf(handle),
      recipeAvailable,
    );
  }

  /** 메뉴 없는 craft 시설을 뺀 실제 동시 이용 정원. */
  operationalCapacity(
    recipeAvailable: (recipeId: string) => boolean = () => true,
  ): number {
    let n = 0;
    for (const item of this.items.values()) {
      if (!this.menuOperabilityOf(item.handle, recipeAvailable).operable) continue;
      n += this.capacityOf(item.handle);
    }
    return n;
  }

  /**
   * `MenuStore.equip` 이 발견·호환을 검증한 뒤 들어오는 저수준 저장 관문.
   * 스냅샷 복원은 아래에서 현재 데이터와 다시 맞댓다.
   */
  setMenuIds(handle: number, ids: readonly string[]): boolean {
    const item = this.items.get(handle);
    const slots = this.menuSlotCount(handle);
    if (!item || slots === 0 || ids.length > slots) return false;
    item.menuIds = [...ids];
    return true;
  }

  /**
   * 다음 단계 비용. 단계마다 가팔라진다 — 안 그러면 "전부 3단계"가 항상 정답이 되고
   * 개선이 선택이 아니라 절차가 된다.
   */
  upgradeCost(handle: number): number {
    const item = this.items.get(handle);
    if (!item) return 0;
    const def = facilityDef(item.defId);
    if (!def) return 0;
    const level = item.level ?? 1;
    if (level >= FACILITY_MAX_LEVEL) return 0;
    return Math.round(def.cost * (0.6 + level * 0.5));
  }

  /** 한 단계 올린다. 이미 최고면 false */
  upgrade(handle: number): boolean {
    const item = this.items.get(handle);
    if (!item) return false;
    const level = item.level ?? 1;
    if (level >= FACILITY_MAX_LEVEL) return false;
    item.level = level + 1;
    return true;
  }

  /**
   * 과금 분류를 **일부러 어긋내는** 스위치 — 음성 대조군 전용 (P6).
   *
   * - `'all-sale'` 전부 유료 (P6 이전의 세계). "분류가 실제로 돈을 막나"를 보이는 대조군
   * - `'invert'`   포함↔판매를 뒤집는다. 수입 구성이 뒤집히는지 보는 대조군
   *
   * ⚠ production 에서 세우지 말 것. 헤드리스 러너는 `--charge-all` 로 **P6 이전 수입
   * 구성을 같은 계측으로 재기 위해** 쓴다 (전후 비교를 코드 두 벌 없이 하는 방법).
   */
  chargeFaultForTest: 'all-sale' | 'invert' | null = null;

  /** 이 시설이 이용마다 돈을 받나 — 대조군 스위치를 반영한 판정 */
  private chargesOnUseHandle(def: KairoFacilityDef | undefined): boolean {
    const sale = chargesOnUse(def);
    if (this.chargeFaultForTest === 'all-sale') return true;
    if (this.chargeFaultForTest === 'invert') return !sale;
    return sale;
  }

  /**
   * 개선·특화가 반영된 요금. **입장권에 포함된 시설은 0 이다** (P6).
   *
   * ⚠ 여기가 "이용마다 돈을 받나"의 유일한 관문이다. 손님(`guests.ts`)도 실시간 입금
   * 배분(`week.ts` 의 `incomeEvents`)도 화면도 전부 이 함수를 부르므로, 한 곳만 고치면
   * 결산 합계와 화면의 `+₩N` 이 갈라지는 일이 구조적으로 안 생긴다.
   */
  feeOf(handle: number): number {
    const item = this.items.get(handle);
    if (!item) return 0;
    const def = facilityDef(item.defId);
    if (!def) return 0;
    if (!this.chargesOnUseHandle(def)) return 0;
    const base = 1 + (this.levelOf(handle) - 1) * LEVEL_FEE_STEP;
    const spec = item.specialty === 'revenue' ? SPECIALTY_FEE_BONUS * this.specialtyScale(handle) : 0;
    return Math.round(def.fee * (base + spec));
  }

  /* ────────────── 특화 (P1.5) ────────────── */

  /** 이 시설이 고를 수 있는 특화 — **데이터가 정한다** (불변식 3) */
  static specialtiesFor(defId: string): readonly FacilitySpecialty[] {
    return DEFS[defId]?.specialties ?? [];
  }

  specialtyOf(handle: number): FacilitySpecialty | null {
    return this.items.get(handle)?.specialty ?? null;
  }

  /**
   * 효과 배수 — 3~4단계는 1, 5단계는 2.
   *
   * ⚠ 특화가 없으면 0 이다. 곱하는 쪽이 `specialty` 를 안 보고 이 값만 봐도
   * "특화 미선택 = 예전과 완전히 같다"가 성립해야 한다 (음성 대조군).
   */
  specialtyScale(handle: number): number {
    const item = this.items.get(handle);
    if (!item?.specialty) return 0;
    return (item.level ?? 1) >= SPECIALTY_DOUBLE_LEVEL ? 2 : 1;
  }

  /**
   * 지금 특화를 고를 수 있나 — 3단계 이상 · 아직 안 골랐음 · 데이터가 허용함.
   *
   * ⚠ 개선 자체는 **막지 않는다.** 안 고르고 5단계까지 올려도 되고, 그 경로는 P1.5
   * 이전과 완전히 동일하다. 막으면 특화를 모르는 봇(`tools/kairo-sim.ts`)이 3단계에
   * 갇혀 헤드리스 밸런싱이 실제 판과 다른 세계를 잰다 (K36 "봇과 골든은 실제
   * 격자로 돈다"와 같은 종류의 함정).
   */
  canChooseSpecialty(handle: number): boolean {
    const item = this.items.get(handle);
    if (!item || item.specialty) return false;
    if ((item.level ?? 1) < SPECIALTY_LEVEL) return false;
    return PlacementGrid.specialtiesFor(item.defId).length > 0;
  }

  /** 특화를 고른다. 데이터가 안 허용하거나 이미 골랐으면 false */
  chooseSpecialty(handle: number, spec: FacilitySpecialty): boolean {
    if (!this.canChooseSpecialty(handle)) return false;
    const item = this.items.get(handle) as PlacedFacility;
    if (!PlacementGrid.specialtiesFor(item.defId).includes(spec)) return false;
    item.specialty = spec;
    return true;
  }

  /** 특화가 반영된 정원 — 손님 슬롯의 정본 */
  capacityOf(handle: number): number {
    const item = this.items.get(handle);
    if (!item) return 0;
    const base = DEFS[item.defId]?.capacity ?? 0;
    if (item.specialty !== 'capacity') return base;
    /*
     * ⚠ 정원 0 인 분위기 시설에는 안 붙인다 — 데이터가 이미 걸렀지만(특화 목록이
     * 빈 배열) 여기서도 지킨다. 0 → 1 이 되면 손님이 DJ 부스에 줄을 선다.
     */
    if (base === 0) return 0;
    return base + SPECIALTY_CAPACITY_BONUS * this.specialtyScale(handle);
  }

  /**
   * 이 시설을 이용했을 때 만족 이득에 **더해지는** 몫 (평판 특화).
   *
   * ⚠ 손님(`guests.ts`)은 지금까지 전역 `useGains` 만 봤다 — 어느 시설을 썼든 이득이
   * 같았고, 그래서 "좋은 시설"이 화면에 안 드러났다. 특화가 그 경로를 처음 뚫는다.
   */
  satisfactionBonusOf(handle: number): number {
    if (this.specialtyOf(handle) !== 'reputation') return 0;
    return SPECIALTY_SATISFACTION_BONUS * this.specialtyScale(handle);
  }

  /** 전체 시설의 평균 개선 단계 — 만족도 보너스의 근거 */
  averageLevel(): number {
    if (this.items.size === 0) return 1;
    let sum = 0;
    for (const it of this.items.values()) sum += it.level ?? 1;
    return sum / this.items.size;
  }

  toSnapshot(): PlacementSnapshot {
    return { w: this.width, h: this.height, next: this.nextHandle, items: this.all() };
  }

  static fromSnapshot(s: PlacementSnapshot): PlacementGrid {
    const g = new PlacementGrid(s.w, s.h);
    g.nextHandle = s.next;
    for (const raw of s.items) {
      // 호출자의 fixture·파싱 결과를 복원 중 직접 고치지 않는다.
      const it: PlacedFacility = { ...raw, ...(raw.menuIds ? { menuIds: [...raw.menuIds] } : {}) };
      const def = DEFS[it.defId];
      if (!def) continue;
      /*
       * ⚠ 데이터가 안 허용하는 특화는 **불러올 때 지운다** — 데이터에서 특화를 뺐거나
       * (밸런싱) 세이브가 손으로 고쳐졌을 때, 규칙이 세이브에 남아 데이터를 이긴다.
       * 불변식 3 은 "데이터가 정한다"이지 "한 번 저장되면 영원하다"가 아니다.
       */
      if (it.specialty && !PlacementGrid.specialtiesFor(it.defId).includes(it.specialty)) {
        delete it.specialty;
      }
      if (def.menuMode === 'craft') {
        const slots = menuSlotsForLevel(it.level ?? 1);
        const source = it.menuIds ?? [...(def.startingMenu ?? [])];
        const clean: string[] = [];
        for (const id of source) {
          if (clean.length >= slots) break;
          if (typeof id !== 'string' || id === '' || clean.includes(id)) continue;
          if (isRecipeForFacility(id, it.defId)) clean.push(id);
        }
        it.menuIds = clean;
      } else {
        delete it.menuIds;
      }
      g.items.set(it.handle, it);
      for (const [ti, tj] of PlacementGrid.footprintTiles(def, it.i, it.j, it.facing ?? 0)) {
        if (g.inside(ti, tj)) g.cells[tj * g.width + ti] = it.handle;
      }
    }
    return g;
  }
}
