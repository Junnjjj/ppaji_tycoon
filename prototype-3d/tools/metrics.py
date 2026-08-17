#!/usr/bin/env python3
"""경로 판정 지표 — 렌더가 레퍼런스만큼 '빽빽한가'를 도트 격자에서 잰다.

눈으로만 보면 매번 엉뚱한 데를 고치게 된다 (실제로 그랬다: 해상도·부품을 만지는 동안
정작 화면의 20%가 단색 잔디였다). 그래서 판정 전에 항상 이걸 먼저 돌린다.

    python3 tools/metrics.py shots/route-A.png shots/route-B.png ...

레퍼런스는 자동으로 같이 잰다. 비교가 공정하려면 **도트 단위로** 내려야 하므로
이미지마다 도트 크기를 준다 (우리 렌더 = DOT×DPR, 레퍼런스 ≈ 5px).

읽는 법:
  도트 경계율  이웃 도트와 색이 다른 비율. 높을수록 빽빽하다. 레퍼런스 66%
  최장 평탄 런 같은 색이 가로로 몇 도트나 이어지는가. 레퍼런스 1 = 단색 면이 없다
  고유색       팔레트 폭. 레퍼런스는 34만(픽셀풍 AI 이미지)이라 그대로 못 따라간다
"""
import sys
from collections import Counter
from PIL import Image

REF = ('shots/ref-quality-bar.png', (0, 200, 975, 1500), 5)
# 우리 렌더는 HUD 를 빼고 잰다 — HUD 는 DOM 이라 도트 격자와 무관하다.
# route-*.png 는 이미 건물만 크롭돼 있으므로 전체를 잰다 (None).
OURS_CROP, OURS_DOT = None, 6


def measure(path: str, crop, dot: int):
    im = Image.open(path).convert('RGB')
    if crop:
        im = im.crop(crop)
    w, h = im.size
    lw, lh = w // dot, h // dot
    im = im.resize((lw, lh), Image.NEAREST)
    px = im.load()

    diff = tot = 0
    runs = []
    for y in range(lh):
        run = 1
        for x in range(lw - 1):
            a, b = px[x, y], px[x + 1, y]
            tot += 1
            if abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) > 24:
                diff += 1
            if a == b:
                run += 1
            else:
                runs.append(run)
                run = 1
        runs.append(run)
    runs.sort()
    colors = len(Counter(im.getdata()))
    return {
        'logical': f'{lw}x{lh}',
        'edge': 100 * diff / tot,
        'run_p99': runs[int(len(runs) * 0.99)],
        'colors': colors,
    }


def main() -> int:
    targets = [('레퍼런스', *REF)]
    for p in sys.argv[1:]:
        targets.append((p.split('/')[-1].replace('.png', ''), p, OURS_CROP, OURS_DOT))

    print(f"{'':22s} {'논리':>10s} {'도트경계율':>10s} {'최장평탄런':>10s} {'고유색':>8s}")
    for label, path, crop, dot in targets:
        try:
            m = measure(path, crop, dot)
        except FileNotFoundError:
            print(f'{label:22s}  (없음: {path})')
            continue
        print(f"{label:22s} {m['logical']:>10s} {m['edge']:>9.1f}% "
              f"{m['run_p99']:>10d} {m['colors']:>8d}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
