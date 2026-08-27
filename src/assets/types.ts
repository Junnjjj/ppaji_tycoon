/**
 * 에셋 추상화 — 계획서 §4.
 *
 * 게임 코드는 "파일"을 절대 모른다. 논리적 ID 만 안다.
 * 지금은 ProceduralProvider 가 코드로 그리고,
 * 나중에 AtlasProvider 가 AI 픽셀아트 PNG 를 로드한다.
 * 교체 시 게임 코드는 0줄 바뀐다.
 */

export type Anchor = 'center' | 'bottom-center' | 'top-left';

export type SpriteCategory =
  | 'terrain'
  | 'guest'
  | 'facility'
  | 'vehicle'
  | 'prop'
  | 'fx'
  /** 배경 띠 — 지면 격자에 속하지 않고 가로로만 타일링한다 */
  | 'backdrop';

/**
 * 변형 축. 하나의 논리 스프라이트가 여러 실물 이미지로 펼쳐진다.
 *   { palette: 8, dir: ['down','up','left','right'], frame: 3 }  → 96장
 */
export interface SpriteVariants {
  /** 색상 팔레트 개수 (손님 수영복 등) */
  palette?: number;
  /** 방향 */
  dir?: readonly string[];
  /** 애니메이션 프레임 수 */
  frame?: number;
  /** 같은 종류의 시각적 변주 개수 (타일 반복감 제거용) */
  alt?: number;
}

/**
 * 스프라이트 명세. 두 역할을 동시에 한다:
 *   1. 코드에게는 계약   — 어떤 ID 가 존재하고, 크기·앵커가 무엇인지
 *   2. AI 에셋 생성에게는 작업 지시서 — 무엇을, 몇 픽셀로, 어떤 스타일로
 */
export interface SpriteSpec {
  id: string;
  size: readonly [number, number];
  anchor: Anchor;
  category: SpriteCategory;
  variants?: SpriteVariants;
  /**
   * 최종 출처. 계획서 §4 의 파이프라인 표를 그대로 표현한다.
   *   'procedural' — 영구히 코드가 그린다. 물·물결·항적·그림자·지형 경계처럼
   *                  100% 일관성과 무료 애니메이션이 중요한 것. AI 생성 대상이 아니다.
   *   'ai'         — 지금은 임시 도형이지만 나중에 AI 픽셀아트로 교체된다.
   */
  source: 'procedural' | 'ai';
  /** AI 생성용 설명. tools/asset-gen 이 이것을 프롬프트로 쓴다. source==='ai' 일 때만 의미 있음. */
  prompt?: string;
}

/** 변형이 적용된 최종 ID 를 만든다.  'guest/body' + {palette:3,dir:'up',frame:1} → 'guest/body:3/up/1' */
export function variantId(
  baseId: string,
  parts: { palette?: number; dir?: string; frame?: number; alt?: number },
): string {
  const seq: string[] = [];
  if (parts.palette !== undefined) seq.push(String(parts.palette));
  if (parts.dir !== undefined) seq.push(parts.dir);
  if (parts.frame !== undefined) seq.push(String(parts.frame));
  if (parts.alt !== undefined) seq.push(`a${parts.alt}`);
  return seq.length > 0 ? `${baseId}:${seq.join('/')}` : baseId;
}

/** 명세 하나가 펼쳐지는 모든 최종 ID */
export function expandSpec(spec: SpriteSpec): string[] {
  const v = spec.variants;
  if (!v) return [spec.id];

  const palettes = v.palette ? range(v.palette) : [undefined];
  const dirs = v.dir ? [...v.dir] : [undefined];
  const frames = v.frame ? range(v.frame) : [undefined];
  const alts = v.alt ? range(v.alt) : [undefined];

  const out: string[] = [];
  for (const p of palettes)
    for (const d of dirs)
      for (const f of frames)
        for (const a of alts)
          out.push(
            variantId(spec.id, {
              ...(p !== undefined ? { palette: p } : {}),
              ...(d !== undefined ? { dir: d } : {}),
              ...(f !== undefined ? { frame: f } : {}),
              ...(a !== undefined ? { alt: a } : {}),
            }),
          );
  return out;
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export interface ParsedId {
  base: string;
  palette: number;
  dir: string;
  frame: number;
  alt: number;
}

/**
 * 최종 ID 를 명세의 변형 축 순서(palette → dir → frame → alt)대로 되돌린다.
 * 선언되지 않은 축은 기본값 0 / 'down' 이 된다.
 */
export function parseId(id: string, spec: SpriteSpec): ParsedId {
  const out: ParsedId = { base: spec.id, palette: 0, dir: 'down', frame: 0, alt: 0 };
  const sep = id.indexOf(':');
  if (sep < 0) return out;

  const parts = id.slice(sep + 1).split('/');
  const v = spec.variants;
  if (!v) return out;

  let i = 0;
  if (v.palette !== undefined) out.palette = Number(parts[i++] ?? 0);
  if (v.dir !== undefined) out.dir = parts[i++] ?? 'down';
  if (v.frame !== undefined) out.frame = Number(parts[i++] ?? 0);
  if (v.alt !== undefined) out.alt = Number((parts[i++] ?? 'a0').replace(/^a/, ''));
  return out;
}

/**
 * 에셋 공급자. 게임 코드가 보는 유일한 표면.
 */
export interface AssetProvider {
  readonly name: string;
  /** 이 공급자가 낼 수 있는 모든 최종 ID */
  readonly ids: readonly string[];
  has(id: string): boolean;
  /** 캔버스를 돌려준다. Phaser 는 이걸 텍스처로 등록한다. */
  get(id: string): HTMLCanvasElement;
  /** 명세 조회 (크기·앵커) */
  spec(id: string): SpriteSpec | undefined;
  /**
   * 한 논리 텍셀을 몇 소스 픽셀로 저장했는가. 없으면 1이다.
   *
   * HD 파일럿은 논리 32×16 타일을 64×32 PNG로 보존한다. 이 값은 배치 크기를
   * 바꾸는 배율이 아니라 소스 밀도라서, 씬은 오브젝트를 `1 / density`로 그린다.
   */
  density?(id: string): number;
  /** 검토용 고해상도 지면이 좌표 반복을 피할 때 쓰는 결정론적 변형 선택. */
  groundAlt?(i: number, j: number, kind: string): number;
  /** 절벽 혼색용 대표 암반색. 없으면 씬이 기존 `terrain/rock`에서 읽는다. */
  terrainRockTone?(): [number, number, number];
  /** 검토 지형의 한 단 높이. 없으면 라이브 계약값 8을 그대로 쓴다. */
  terrainLevelHeight?(): number;
  /**
   * review-only 해안 코너 반경(논리 타일 단위). `undefined`면 기존 렌더를 쓴다.
   * 0은 음성 대조군(날카로운 격자 경계)이고, 0.5~1.0은 곡률 파일럿이다.
   */
  terrainShoreRadius?(): number | undefined;
}
