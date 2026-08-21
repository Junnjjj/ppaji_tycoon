/**
 * 카이로 아틀라스 공급자 — Phase G.
 *
 * `tools/bake-kairo-atlas.ts` 가 구운 한 장(`public/assets/kairo-atlas.png`)에서
 * ID 마다 픽셀을 잘라 준다. `KairoProceduralProvider` 와 **완전히 같은 인터페이스**라
 * 게임 코드는 0줄 바뀐다 — 그게 에셋 추상화의 목적이다 (계획서 §4).
 *
 * ## ⚠ 크기·앵커의 정본은 계약이다. 아틀라스가 아니다
 *
 * `spec()` 은 언제나 `kairoSpriteIndex()`(= 렌더 계약)에서 온다. 아틀라스는 **픽셀만**
 * 준다. 두 벌이 되면 반드시 어긋나는데, 그 어긋남은 "그림은 나오는데 24텍셀 밀렸다"
 * 처럼 조용하다. 이 저장소가 `guestWalkable` · `capacityOf` · `admissionLimit` 에서
 * 세 번 겪은 실패다.
 *
 * ## 크기가 다른 프레임은 **버린다**
 *
 * 아틀라스 프레임이 계약 캔버스와 다르면 그 ID 는 `has()` 가 false 다. 그러면
 * 하이브리드가 절차 폴백으로 내려가 **화면이 안 깨진다** — 밀린 그림을 그리는 것보다
 * 플레이스홀더가 낫다. 굽기 도구가 이미 죽으므로 정상 경로에서는 0건이어야 하고,
 * 0건이 아니면 `dropped` 가 콘솔에 남는다.
 */

import { KairoProceduralProvider } from './kairo-procedural.js';
import { kairoSpriteIndex } from './kairo-contract.js';
import { HybridProvider } from './index.js';
import type { AtlasFrame, AtlasIndex } from './atlas.js';
import type { AssetProvider, SpriteSpec } from './types.js';

export const KAIRO_ATLAS_IMAGE = 'assets/kairo-atlas.png';
export const KAIRO_ATLAS_INDEX = 'assets/kairo-atlas.json';

/**
 * **일부러** 절차 플레이스홀더로 남기는 종 — 그림은 팩에 있지만 게임이 안 쓴다.
 *
 * 하이브리드는 원래 "한 종씩 반입"하려고 만든 구조다 (`src/assets/index.ts`).
 * 그림이 계약을 못 맞추면 **그 종만** 안 반입하면 된다 — 검사를 느슨하게 하는 것이
 * 아니라 반입을 미루는 것이다. 이 저장소가 반복해 적은 규칙: 검사를 통과시키려고
 * 문턱을 옮기면 그 검사는 다음 사람에게 아무것도 안 알려 준다.
 *
 * ⚠ 여기 넣을 때는 **왜**와 **무엇이 고쳐지면 빼는지**를 같이 적을 것.
 */
export const ATLAS_HOLDOUT: readonly { prefix: string; why: string }[] = [
  {
    prefix: 'wall/',
    why:
      '유리벽 8종의 실측 기둥 높이가 열당 8~9텍셀이다 — 계약은 높이 10 + 두께 3 ' +
      '(`KAIRO.wall.heightTexels`/`thicknessTexels`). 스티플 투과율은 46~50% 로 계약대로지만 ' +
      '높이가 모자라 `verify:kairo` 의 유리 패널 절이 어느 열도 못 잰다 (전부 건너뛰어 0/0). ' +
      '그림을 계약 높이로 다시 뽑으면 이 줄을 지운다.',
  },
  {
    prefix: 'ground/path_stone',
    why:
      '`npm run seam` 의 경계 밝기 편향이 1.267σ 로 문턱 1.2 를 넘는다 (a0·a2. a1 은 1.17). ' +
      '원인은 이음선을 **네 변에 다 그린 것**이다 (실측 밝기차: 위 두 변 −13.5 · 아래 두 변 ' +
      '−22.9). 포장 이음선은 **아래 두 변에만** 그려야 한다 — 절차 드로어가 그렇게 하고 ' +
      '(`drawGround` 의 PAVED 가지는 `y >= TILE_H/2` 만 칠한다), 이유는 한 경계를 이웃 두 칸이 ' +
      '나눠 갖기 때문이다. 네 변에 다 그리면 **모든 경계가 두 번 어두워져** 격자 밴딩이 된다 ' +
      '(원값 12.94 → 15.35/255). 벽 경계를 한쪽이 소유하는 규칙(K25)과 같은 형태의 실수다. ' +
      '⚠ `ground/sidewalk:a0` 도 같은 결함을 갖고 1.198 로 문턱 0.002 뒤에 서 있다 — 통과라서 ' +
      '반입은 하지만, 포장류를 다시 뽑을 때 **같이** 고칠 것.',
  },
];

function heldOut(id: string): boolean {
  return ATLAS_HOLDOUT.some((h) => id.startsWith(h.prefix));
}

export class KairoAtlasProvider implements AssetProvider {
  readonly name = 'kairo-atlas';
  readonly ids: readonly string[];
  /** 계약 캔버스와 크기가 달라 버린 ID (정상 경로에서는 빈 배열) */
  readonly dropped: readonly string[];
  /** 그림은 있지만 **일부러** 안 쓰는 ID (`ATLAS_HOLDOUT`) */
  readonly held: readonly string[];

  private readonly specs = new Map<string, SpriteSpec>();
  private readonly frames = new Map<string, AtlasFrame>();
  private readonly cache = new Map<string, HTMLCanvasElement>();

  private constructor(
    private readonly image: CanvasImageSource,
    index: AtlasIndex,
  ) {
    const specs = kairoSpriteIndex();
    const ids: string[] = [];
    const dropped: string[] = [];
    const held: string[] = [];
    for (const [id, spec] of specs) {
      const f = index[id];
      if (!f) continue; // 아직 안 뽑은 그림 — 폴백이 맡는다 (부분 반입)
      if (heldOut(id)) {
        held.push(id);
        continue;
      }
      if (f.w !== spec.size[0] || f.h !== spec.size[1]) {
        dropped.push(`${id} ${f.w}×${f.h}≠${spec.size[0]}×${spec.size[1]}`);
        continue;
      }
      this.specs.set(id, spec);
      this.frames.set(id, f);
      ids.push(id);
    }
    this.ids = ids;
    this.dropped = dropped;
    this.held = held;
  }

  static async load(imageUrl: string, indexUrl: string): Promise<KairoAtlasProvider> {
    const [image, index] = await Promise.all([
      loadImage(imageUrl),
      fetch(indexUrl).then((r) => {
        if (!r.ok) throw new Error(`아틀라스 색인을 못 읽음: ${indexUrl} (${r.status})`);
        return r.json() as Promise<AtlasIndex>;
      }),
    ]);
    return new KairoAtlasProvider(image, index);
  }

  /** 테스트용 — 이미 디코드된 이미지와 색인으로 만든다 (네트워크 없이) */
  static fromLoaded(image: CanvasImageSource, index: AtlasIndex): KairoAtlasProvider {
    return new KairoAtlasProvider(image, index);
  }

  has(id: string): boolean {
    return this.frames.has(id);
  }

  /** ⚠ 계약이 정본 — 아틀라스 프레임 크기를 여기서 돌려주지 말 것 */
  spec(id: string): SpriteSpec | undefined {
    return this.specs.get(id);
  }

  get(id: string): HTMLCanvasElement {
    const hit = this.cache.get(id);
    if (hit) return hit;

    const f = this.frames.get(id);
    if (!f) throw new Error(`카이로 아틀라스에 없는 ID: ${id}`);

    const canvas = document.createElement('canvas');
    canvas.width = f.w;
    canvas.height = f.h;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2d 컨텍스트를 못 얻었습니다');
    /*
     * ⚠ 스무딩을 끄고 **정수 좌표**로 1:1 복사한다. 반 픽셀이 생기면 K13 부터 지킨
     * "정수 스캔라인" 계약이 아틀라스 경로에서만 조용히 무너진다.
     */
    g.imageSmoothingEnabled = false;
    g.drawImage(this.image, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);

    this.cache.set(id, canvas);
    return canvas;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`아틀라스 이미지를 못 읽음: ${url}`));
    img.src = url;
  });
}

/*
 * ── 음성 대조군 ────────────────────────────────────────────────────────────
 *
 * "아틀라스가 화면에 보인다"를 재는 검사는 **끄면 실패해야** 의미가 있다. 끄는 스위치를
 * 코드에 둔다 (`setRenderFaultForTest` · `setBottleneckFaultForTest` 와 같은 자리).
 *
 * 프로바이더는 부팅 때 한 번 고르고 씬이 그때 텍스처를 등록하므로, 런타임 토글로는
 * 되돌릴 수 없다 — 그래서 **URL 플래그**(`?atlas=0`)가 하네스의 손잡이다. 모듈 플래그는
 * 단위 테스트용이다. `?px=1` · `?debug=1` · `?v1=1` 과 같은 방식이다.
 */
let atlasDisabled = false;

export function setAtlasDisabledForTest(on: boolean): void {
  atlasDisabled = on;
}

function atlasOff(): boolean {
  if (atlasDisabled) return true;
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('atlas') === '0';
}

/**
 * 카이로 씬의 **교체 지점** — `createAssetProvider()` 와 같은 역할.
 *
 * 아틀라스가 있으면 하이브리드(아틀라스 우선 + 절차 폴백), 없으면 절차 생성 그대로다.
 * 즉 아틀라스 파일이 없는 저장소에서도 **지금과 완전히 같이** 돈다.
 *
 * ⚠ 반드시 `bootKairo` **앞**에서 await 할 것. boot 뒤의 await 하나가 간헐 부팅
 * 실패가 된 적이 있다 (`main.ts` 주석).
 */
export async function createKairoAssetProvider(): Promise<AssetProvider> {
  const fallback = new KairoProceduralProvider();
  if (atlasOff()) return fallback;
  try {
    const atlas = await KairoAtlasProvider.load(KAIRO_ATLAS_IMAGE, KAIRO_ATLAS_INDEX);
    if (atlas.dropped.length > 0) {
      console.warn(`[카이로] 아틀라스 프레임 ${atlas.dropped.length}개를 버렸다`, atlas.dropped);
    }
    if (atlas.ids.length === 0) return fallback;
    return new HybridProvider(atlas, fallback);
  } catch {
    // 아틀라스 없음 — 정상. 절차 생성으로 간다
    return fallback;
  }
}
