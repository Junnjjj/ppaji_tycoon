"""바닥 다이아몬드 레이아웃 가이드 — 시설 스프라이트 생성용 --ref 이미지.

건물 겹침 사고(2026-08-17)의 뿌리: 생성 프롬프트에 "바닥이 발자국의 화면 다이아몬드와
일치해야 한다"는 계약이 없어서 그림마다 바닥 크기·여백이 제각각이었다.

## 규격 (yaw20 · elev35.26 — prototype-3d 확정 카메라)

    폭_텍셀   = (fw·cos20 + fh·sin20) × 16
    높이_텍셀 = (fw·sin35.26·sin20 + fh·sin35.26·cos20) × 16

    2×2 = 41.0×23.7 · 2×3 = 46.5×32.4 · 3×2 = 56.0×26.8
    3×3 = 61.5×35.5 · 4×3 = 76.6×38.7 · 2×1 = 35.5×15.0

⚠ 예전 `(fw+fh)×11.3` 공식은 **yaw45 대칭일 때만** 맞다 — 폐기. 얕은 아이소에선 2×3 ≠ 3×2 다.

⚠ 그리고 모양도 마름모가 아니다. yaw45 에서만 네 꼭짓점이 바운딩박스 변의 중점에 온다.
   yaw20 에서 정사각 발자국은 **비스듬한 평행사변형**으로 투영된다 (2×2 실측: 위 꼭짓점이
   중심에서 x +9.6텍셀, 오른쪽 꼭짓점이 y +5.5텍셀). 축정렬 마름모를 참조로 주면
   바닥이 지형 격자와 어긋난 그림이 나온다.

카메라(main.ts)에서 유도한 지면점 투영:
    screen_x    =  X·cosθ + Z·sinθ
    screen_y_up =  X·sinφ·sinθ − Z·sinφ·cosθ
따라서 화면 **최하단 꼭짓점은 (−X, +Z) 모서리**, 최상단은 (+X, −Z) 모서리다.

## 바닥이 그림 높이에서 차지하는 비율

접지선과 화면 크기를 종끼리 맞추려면 **바닥 높이 / 그림 전체 높이**를 고정해야 한다.
(고정하지 않으면 로지컬 높이로 fit 했을 때 폭이 종마다 다르게 떨어진다.)

    건물(gate·shop·cafe·restroom·shower·changing) = 40%
    낮은 소품(shade·tent)                          = 55%
    수상(slide·trampoline·pool)                    = 45%

캔버스 종횡비를 그 목표 그림 상자에 맞춰 두면 "캔버스를 채워라"가 곧 높이 계약이 된다.

사용:
    python3 tools/make-diamond-guide.py 2 2        →  guides/diamond-2x2.png (기본 40%)
    python3 tools/make-diamond-guide.py 2 2 55     →  guides/diamond-2x2-r55.png
"""
import math
import os
import sys

from PIL import Image, ImageDraw

fw, fh = int(sys.argv[1]), int(sys.argv[2])
pct = int(sys.argv[3]) if len(sys.argv) > 3 else 40
ratio = pct / 100.0

TEXEL = 8  # 생성 해상도 배율 (1텍셀 = 8px)
YAW, ELEV = math.radians(20), math.radians(35.26)
c, s = math.cos(YAW), math.sin(YAW)
us, uc = math.sin(ELEV) * math.sin(YAW), math.sin(ELEV) * math.cos(YAW)

# 발자국 반(半)범위 — 타일 1개 = 16텍셀이므로 반범위는 fw*8 텍셀
A, B = fw * 8 * TEXEL, fh * 8 * TEXEL
HALF_W = A * c + B * s
HALF_H = A * us + B * uc

# 평행사변형 꼭짓점 (화면 좌표, y 는 아래로 증가). 마름모가 아니다.
CORNERS = [
    (A * c - B * s, -(A * us + B * uc)),   # (+X,−Z) 위
    (A * c + B * s, B * uc - A * us),      # (+X,+Z) 오른쪽
    (-(A * c - B * s), A * us + B * uc),   # (−X,+Z) 아래  ← 스프라이트 최하단 픽셀
    (-(A * c + B * s), A * us - B * uc),   # (−X,−Z) 왼쪽
]

# 목표 그림 상자: 바닥 높이가 전체의 `ratio` 를 차지한다
OBJ_H = HALF_H * 2 / ratio
OBJ_W = HALF_W * 2
MARGIN = int(max(OBJ_W, OBJ_H) * 0.07)
W, H = int(OBJ_W) + MARGIN * 2, int(OBJ_H) + MARGIN * 2

# 바닥은 그림 상자 하단에 붙는다 → 중심의 y = (아래 여백) − HALF_H
cx = W // 2
cy = H - MARGIN - int(HALF_H)

im = Image.new('RGB', (W, H), (255, 0, 255))
d = ImageDraw.Draw(im)

# ── 세워 올린 상자 ─────────────────────────────────────────────────────────
# ⚠ 바닥 평행사변형만 주면 모델이 무시하고 관습적인 yaw45 아이소로 그린다 (실측:
#    bottomFrac 0.64 = 좌우 반전). 수직으로 밀어 올린 상자를 같이 그려야 기울기가 읽힌다.
#    월드 수직은 화면에서도 정확히 수직이므로 윗면 = 바닥면을 위로 평행이동한 것.
RISE = OBJ_H - HALF_H * 2
TOP = [(x, y - RISE) for x, y in CORNERS]
P = lambda pts: [(cx + x, cy + y) for x, y in pts]  # noqa: E731

# 카메라는 (−X,+Z) 쪽에 있으므로 −X 면(모서리 3-2)과 +Z 면(모서리 2-1)만 보인다.
# 뒷면은 그리지 않는다 — 그리면 바닥판이 앞면을 덮어 상자가 안 읽힌다 (실측).
for a_, b_, shade in ((3, 2, 150), (2, 1, 186)):
    d.polygon(P([CORNERS[a_], CORNERS[b_], TOP[b_], TOP[a_]]), fill=(shade,) * 3, outline=(70, 70, 70), width=4)
d.polygon(P(TOP), fill=(214, 214, 214), outline=(70, 70, 70), width=5)

# 지면에 닿는 두 모서리 (3-2, 2-1) — 접지선. 굵고 진하게
d.line(P([CORNERS[3], CORNERS[2], CORNERS[1]]), fill=(40, 40, 40), width=9)
# 타일 눈금 — 발자국이 몇 칸인지, 어느 축이 어느 쪽인지 읽히게
for i in range(1, fh):  # 3-2 모서리 = −X 면 = Z 축 fh 칸
    t = i / fh
    x, y = CORNERS[3][0] + (CORNERS[2][0] - CORNERS[3][0]) * t, CORNERS[3][1] + (CORNERS[2][1] - CORNERS[3][1]) * t
    d.line(P([(x, y), (x, y - RISE * 0.10)]), fill=(40, 40, 40), width=4)
for i in range(1, fw):  # 2-1 모서리 = +Z 면 = X 축 fw 칸
    t = i / fw
    x, y = CORNERS[2][0] + (CORNERS[1][0] - CORNERS[2][0]) * t, CORNERS[2][1] + (CORNERS[1][1] - CORNERS[2][1]) * t
    d.line(P([(x, y), (x, y - RISE * 0.10)]), fill=(40, 40, 40), width=4)

os.makedirs('art-reference/guides', exist_ok=True)
name = f'diamond-{fw}x{fh}.png' if pct == 40 else f'diamond-{fw}x{fh}-r{pct}.png'
out = f'art-reference/guides/{name}'
im.save(out)
print(f'{out}  floor {HALF_W*2/TEXEL:.1f}x{HALF_H*2/TEXEL:.1f} texels · '
      f'target image {OBJ_W/TEXEL:.1f}x{OBJ_H/TEXEL:.1f} texels ({pct}% floor) · canvas {W}x{H}')
