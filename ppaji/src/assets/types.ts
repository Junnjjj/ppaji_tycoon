/**
 * 에셋 계약 — 게임 코드는 **논리 ID** 만 안다 (`tile/sand`, `fac/toilet`, `guest/body:3/walk/0/1`).
 * 지금은 `ProceduralProvider` 가 캔버스에 굽고, 나중에 `AtlasProvider` 가 같은 ID 를 PNG 에서
 * 잘라 내면 코드 0줄 변경으로 교체된다.
 */
export interface SpriteSpec {
  id: string;
  /** Texture pixels per logical pixel; absent for the original 1x assets. */
  density?: number;
  /** 텍셀 크기 */
  w: number;
  h: number;
  /** 앵커 (캔버스 안 좌표, 텍셀) */
  ax: number;
  ay: number;
  /** 영구 절차(물·그림자·FX)인가, 나중에 그림으로 바꿀 것인가 */
  source: 'procedural' | 'art';
}

export interface AssetProvider {
  /** 이 ID 의 그림을 캔버스로 돌려준다. 없으면 null — 부르는 쪽이 폴백을 정한다 */
  canvas(id: string): HTMLCanvasElement | null;
  spec(id: string): SpriteSpec | null;
  ids(): readonly string[];
}
