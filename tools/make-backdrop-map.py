#!/usr/bin/env python3
"""맵 타입별 배경 벽 텍스처 굽기 — 생성 raw → 197×117 가로 타일러블 PNG.

레시피는 배경(backdrop) 레이어의 기존 것과 같다 (ppaji-pixel-asset SKILL.md §배경):
  ÷8 NEAREST 축소 → 197×117 크롭 → 가로 랩 크로스페이드 12px

여기에 이번 작업의 요구 하나가 더 붙는다:
  **상단은 순수 하늘 한 색으로 수렴한다.** 벽 텍스처의 위쪽이 씬 배경색과 다르면
  거기서 가로 선이 보인다 — 지금까지 상단 검은 선의 직접 원인이었다
  (farbank-village.png 은 아래 6줄이 순수 검정 패딩이었다. 실측).
  그래서 위 SKY_FLAT 줄은 하늘 단색으로 덮고, 이어지는 SKY_FADE 줄에 걸쳐
  원본으로 부드럽게 넘긴다. 단색 줄이 있어야 three.js 의 ClampToEdge 로
  벽 위를 무한히 하늘로 늘릴 수 있다 (farbank.ts).

사용: python3 tools/make-backdrop-map.py <river|mountain|lake> ...
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/generated/backdrop/maps"
OUT = ROOT / "assets/generated/backdrop"
PUB = ROOT / "prototype-3d/public/sprites"

W, H = 197, 117
SHRINK = 8
BLEND = 12   # 가로 랩 크로스페이드 폭
SKY_FLAT = 10   # 완전 단색 하늘 줄 수 (맨 위)
SKY_FADE = 10   # 단색 → 원본 으로 넘어가는 줄 수


def shrink(raw: Image.Image) -> np.ndarray:
    """÷8 NEAREST. 가로는 (197+12)×8 을 중앙에서, 세로는 아래(=가까운 쪽) 기준으로 잘라 쓴다.

    가로로 BLEND 만큼 **더** 가져오는 게 핵심이다 — 랩 크로스페이드는 "이미지 안에서
    양 끝을 섞는" 게 아니라 "폭 W 뒤에 이어지는 W+i 열을 앞 i 열에 겹쳐 넣는" 것이라
    여분 열이 없으면 이음새가 오히려 커진다 (첫 시도 실측: seam 18 > inner 11).
    """
    a = raw.convert("RGB")
    need_w = (W + BLEND) * SHRINK
    x0 = max(0, (a.width - need_w) // 2)
    a = a.crop((x0, 0, x0 + min(need_w, a.width), a.height))
    # 세로는 8 의 배수로 내림 — 아래쪽(전경)을 남긴다
    keep_h = (a.height // SHRINK) * SHRINK
    a = a.crop((0, a.height - keep_h, a.width, a.height))
    small = a.resize((a.width // SHRINK, keep_h // SHRINK), Image.NEAREST)
    return np.asarray(small).astype(np.float64)


def to_canvas(small: np.ndarray) -> np.ndarray:
    """(197+12)×117 캔버스로. 모자란 위쪽은 하늘색으로 채운다 (자르지 않는다)."""
    cw = W + BLEND
    h, w = small.shape[:2]
    if w > cw:
        x0 = (w - cw) // 2
        small = small[:, x0:x0 + cw]
        w = cw
    if h > H:
        small = small[h - H:]     # 아래쪽 유지
        h = H
    sky = np.median(small[0], axis=0)
    canvas = np.tile(sky, (H, cw, 1)).astype(np.float64)
    canvas[H - h:, :w] = small
    return canvas


def sky_fade(a: np.ndarray) -> np.ndarray:
    """맨 위 SKY_FLAT 줄을 하늘 단색으로, 이어지는 SKY_FADE 줄로 원본에 녹인다."""
    sky = np.median(a[:2].reshape(-1, 3), axis=0)
    a = a.copy()
    a[:SKY_FLAT] = sky
    for i in range(SKY_FADE):
        t = (i + 1) / (SKY_FADE + 1)          # 0 → 1
        y = SKY_FLAT + i
        a[y] = sky * (1 - t) + a[y] * t
    return a


def wrap_blend(a: np.ndarray) -> np.ndarray:
    """좌우 이음새 제거 — 폭 W+BLEND 를 W 로 접는다.

    한 바퀴 돌면 x 열과 x+W 열이 같은 자리다. 그래서 앞쪽 i 열에 W+i 열을 겹쳐 넣되,
    가중치를 i=0 에서 1 → i=BLEND 에서 0 으로 떨어뜨린다. 그러면
    W−1 열 다음이 0 열(≈ 원본 W 열)이 되어 이음새가 원본의 이웃 두 열 차이만 남는다.
    """
    out = a[:, :W].copy()
    for i in range(BLEND):
        w = 1.0 - (i + 1) / (BLEND + 1)       # i=0 에서 거의 1, i=BLEND−1 에서 거의 0
        out[:, i] = a[:, i] * (1 - w) + a[:, W + i] * w
    return out


def seam_test(img: Image.Image, out: Path) -> None:
    """좌우로 두 번 이어 붙여 이음새를 눈으로 확인 (2× NEAREST 확대)."""
    w, h = img.size
    strip = Image.new("RGB", (w * 2, h))
    strip.paste(img, (0, 0))
    strip.paste(img, (w, 0))
    strip.resize((w * 4, h * 2), Image.NEAREST).save(out)


def build(kind: str) -> dict:
    raw = Image.open(SRC / f"raw-{kind}.png")
    a = wrap_blend(sky_fade(to_canvas(shrink(raw))))
    img = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGB")
    name = f"bg-{kind}.png"
    img.save(OUT / name)
    img.save(PUB / name)
    seam_test(img, OUT / f"seam-test-{kind}.png")

    top = np.asarray(img)[0]
    assert top.std(axis=0).max() == 0, f"{kind}: 상단 줄이 단색이 아니다"
    r, g, b = (int(v) for v in top[0])
    # 이음새 잔차 — 랩 경계 열차이가 이미지 내부 평균 열차이보다 크면 실패
    arr = np.asarray(img).astype(float)
    seam = np.abs(arr[:, 0] - arr[:, -1]).mean()
    inner = np.abs(arr[:, 1:] - arr[:, :-1]).mean()
    return {"kind": kind, "sky": f"#{r:02x}{g:02x}{b:02x}",
            "seam_delta": round(seam, 2), "inner_delta": round(inner, 2)}


if __name__ == "__main__":
    kinds = sys.argv[1:] or ["river", "mountain", "lake"]
    report = [build(k) for k in kinds]
    print(json.dumps(report, indent=2))
