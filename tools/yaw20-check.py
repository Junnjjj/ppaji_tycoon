"""바닥 평행사변형 계약 실측 — 생성물의 접지면이 yaw20 기울기를 따르는지 숫자로 본다.

진단값 두 개:
  bottomFrac  최하단 픽셀의 x 위치 / 폭   (yaw20 기대: 0.267 @2x2 · 발자국별 계산값)
  leftFrac    최좌단 픽셀의 y 위치 / 바닥부 높이

축정렬 마름모(옛 yaw45 그림)면 둘 다 0.5 로 나온다. 기울어진 평행사변형이면 0.27 근처.
"""
import math
import sys

from PIL import Image

YAW, ELEV = math.radians(20), math.radians(35.26)
c, s = math.cos(YAW), math.sin(YAW)
us, uc = math.sin(ELEV) * math.sin(YAW), math.sin(ELEV) * math.cos(YAW)


def expected(fw, fh):
    A, B = fw, fh
    return 0.5 - (A * c - B * s) / (2 * (A * c + B * s))


def measure(path, key=(255, 0, 255), tol=60):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    px = im.load()

    def solid(x, y):
        r, g, b, a = px[x, y]
        if a < 128:
            return False
        return not (abs(r - key[0]) < tol and abs(g - key[1]) < tol and abs(b - key[2]) < tol)

    cols = {}
    x0, x1, y0, y1 = W, -1, H, -1
    for y in range(H):
        for x in range(W):
            if not solid(x, y):
                continue
            cols.setdefault(x, [H, -1])
            cols[x][1] = max(cols[x][1], y)
            cols[x][0] = min(cols[x][0], y)
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
    if x1 < 0:
        return None
    bottom_y = max(v[1] for v in cols.values())
    bx = [x for x, v in cols.items() if v[1] >= bottom_y - 1]
    left_ys = cols[x0]
    right_ys = cols[x1]
    return {
        'size': (x1 - x0 + 1, y1 - y0 + 1),
        'bottomFrac': (sum(bx) / len(bx) - x0) / (x1 - x0),
        'leftBottomFrac': (left_ys[1] - y0) / (y1 - y0),
        'rightBottomFrac': (right_ys[1] - y0) / (y1 - y0),
    }


if __name__ == '__main__':
    fw, fh = int(sys.argv[1]), int(sys.argv[2])
    print(f'expected bottomFrac ≈ {expected(fw, fh):.3f}')
    for p in sys.argv[3:]:
        m = measure(p)
        print(f'{p}  {m}' if m else f'{p}  EMPTY')
