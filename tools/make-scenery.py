#!/usr/bin/env python3
"""배경 지형 텍스처 둘 — 생성해 둔 산 아트에서 뽑는다 (K38).

  · `bg-treeline.png` 트리라인(알파) — 지평선과 땅이 만나는 선을 흐트러뜨린다
  · `bg-horizon.png` 하늘+산+숲, **가로** 타일러블 — 수평 윗변 위로 쭉 이어지는 배경

## 왜 필요한가

지도는 아이소 다이아몬드라 사각 화면을 못 채운다. 바운딩 박스 네 귀퉁이가 카메라
배경색(#7ab8d4)으로 남아 "1시 방향이 통짜 하늘색"이 된다 (사용자 스크린샷).
그 바깥을 덮을 **땅**이 필요하고, 배경 산과 같은 붓에서 나와야 자연스럽게 이어진다.

## 레시피

`maps/raw-mountain.png` 아래쪽 숲 구역 → ÷8 NEAREST → 랩 크로스페이드.

⚠ 랩 크로스페이드는 "이미지 안에서 양 끝을 섞는" 게 아니라 **"폭 W 뒤에 이어지는
W+i 열을 앞 i 열에 겹쳐 넣는" 것**이다 (make-backdrop-map.py 와 같은 규칙).
그래서 원본에서 W+BLEND 를 가져온다. 여기서는 **가로·세로 둘 다** 건다.

⚠ 결정론적이다 — 난수 없음. 같은 입력이 같은 PNG 를 낸다.

⚠ numpy 가 필요하다. 시스템 python3 에는 없으므로 sprite-gen venv 를 쓴다
(에셋 도구가 이미 쓰는 그 환경이다 — 새 의존성을 프로젝트에 넣지 않는다):

    ~/tools/sprite-gen/.venv/bin/python tools/make-scenery.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/generated/backdrop/maps/raw-mountain.png"
OUT_T = ROOT / "public/assets/backdrop/bg-treeline.png"
OUT_H = ROOT / "public/assets/backdrop/bg-horizon.png"

# ── 지평선 (하늘+산+숲) ────────────────────────────────────────────────
# 가로만 타일러블. ÷4 로 줄여 443px — 197(÷8)이면 넓은 화면에서 반복이 눈에 띈다
H_SHRINK = 4
H_BLEND = 24

W, H = 128, 32          # 로지컬 크기 — 타일 32×16 기준으로 가로 4칸 · 세로 2칸
# 정수 배율. 픽셀아트라 NEAREST (보간하면 도트가 뭉갠다).
#
# ⚠ 8 이 아니라 4 다: 순수 숲 구역이 원본 아래 **187줄**(y≥700, 초록 96%+)뿐이라
# ÷8 로는 (H+BLEND)·8 이 안 들어간다. 8 로 하면 크롭이 위로 올라가 **산등성이를 문다** —
# 실측으로 타일링 미리보기에 파란 봉우리가 격자로 반복됐다.
BLEND = 10              # 랩 크로스페이드 폭
SHRINK = 4
# 원본에서 **나무만** 있는 구역의 시작 줄. 실측: y≥700 이 초록 96% 이상이다
CROP_TOP = 700
# 공원 잔디보다 어둡게 민다 — 같은 밝기면 어디까지가 내 공원인지 안 읽힌다
DIM = 0.80


def wrap_axis(a: np.ndarray, size: int, blend: int, axis: int) -> np.ndarray:
    """`size + blend` 길이 배열의 꼬리 `blend` 를 머리에 겹쳐 넣어 `size` 로 만든다."""
    head = a.take(range(size), axis=axis).astype(np.float64)
    tail = a.take(range(size, size + blend), axis=axis).astype(np.float64)
    t = np.linspace(0.0, 1.0, blend, endpoint=False)
    t = t * t * (3 - 2 * t)          # smoothstep — 선형이면 이음선이 띠로 보인다
    shape = [1, 1, 1]
    shape[axis] = blend
    t = t.reshape(shape)
    front = head.take(range(blend), axis=axis)
    mixed = front * t + tail * (1.0 - t)
    out = head.copy()
    idx = [slice(None)] * 3
    idx[axis] = slice(0, blend)
    out[tuple(idx)] = mixed
    return out


def treeline() -> None:
    """트리라인(알파)을 게임이 읽는 자리로 옮긴다.

    지평선 아트의 아랫단과 지도 바깥 **지면**이 만나는 선은 그냥 두면 자로 그은 듯
    곧다 (실측 스크린샷). 나무 실루엣을 그 선에 얹으면 숲 가장자리로 읽힌다.

    ⚠ 새로 그리지 않는다 — `bg-near.png` 가 이미 그 그림이다 (알파, 209×110).
    """
    src = ROOT / "assets/generated/backdrop/bg-near.png"
    im = Image.open(src).convert("RGBA")
    OUT_T.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT_T)
    a = np.asarray(im).astype(np.int32)
    f = a[:, :, :3]
    seam = int(np.abs(f[:, -1] - f[:, 0]).sum())
    inner = int(np.abs(f[:, im.width // 2] - f[:, im.width // 2 + 1]).sum())
    print(f"{OUT_T.relative_to(ROOT)} {im.width}×{im.height} · 가로 이음선 {seam / max(1, inner):.2f}배")


def horizon() -> None:
    """하늘+산+숲을 **가로 타일러블**로. 수평 윗변 위에 쭉 이어 붙인다.

    캐노피와 달리 세로는 안 감는다 — 위는 하늘, 아래는 숲으로 **방향이 있는** 그림이다.
    아래 끝은 숲이라 지도 바깥 캐노피와 자연스럽게 만난다 (같은 원본에서 나왔다).
    """
    raw = Image.open(SRC).convert("RGB")
    w = raw.width // H_SHRINK - H_BLEND
    h = raw.height // H_SHRINK
    small = raw.resize((raw.width // H_SHRINK, h), Image.NEAREST)
    a = np.asarray(small).astype(np.float64)[:, : w + H_BLEND]
    a = wrap_axis(a, w, H_BLEND, axis=1)

    # 아랫단을 캐노피 톤으로 **내려서** 만난다.
    #
    # ⚠ 둘은 같은 원본에서 나왔지만 캐노피만 DIM 을 먹어서, 지평선 아래에 가로 밝기
    # 이음선이 생겼다 (실측 스크린샷). 아래 FOOT 줄에 걸쳐 1.0 → DIM 으로 넘기면
    # 어디가 경계인지 눈으로 못 찾는다.
    foot = 28
    ramp = np.linspace(1.0, DIM, foot).reshape(foot, 1, 1)
    a[-foot:] = a[-foot:] * ramp
    a = np.clip(a, 0, 255).astype(np.uint8)

    OUT_H.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, "RGB").save(OUT_H)

    f = a.astype(np.int32)
    seam = int(np.abs(f[:, -1] - f[:, 0]).sum())
    inner = int(np.abs(f[:, w // 2] - f[:, w // 2 + 1]).sum())
    r = seam / max(1, inner)
    sky = tuple(int(v) for v in a[0, a.shape[1] // 2])
    print(f"{OUT_H.relative_to(ROOT)} {w}×{h} · 가로 이음선 {r:.2f}배 · 하늘색 #{sky[0]:02x}{sky[1]:02x}{sky[2]:02x}")
    if r > 2.5:
        raise SystemExit("❌ 지평선 이음선이 튄다 — H_BLEND 를 넓힐 것")
    print("✅ 가로 타일러블")


if __name__ == "__main__":
    treeline()
    horizon()
