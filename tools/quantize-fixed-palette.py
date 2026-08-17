"""빠지 타이쿤 A트랙 최종 양자화 (v4 — 검증 2026-08-14, 건물 18종 × f0/f1 실측).

규칙:
1. hue 버킷을 먼저 판정하고 그 색상 계열 팔레트 안에서만 최근접을 고른다
   ("조명이 색을 곱하게 하지 마라 — 인덱스를 고르게 하라"의 양자화판).
   나이브 전역 최근접은 음영 중간톤을 윤곽갈(56~60%)이나 엉뚱한 계열(암녹→적)로 보낸다.
2. 윤곽색은 실루엣 가장자리 + 어두운 픽셀에만 (따뜻한 색→윤곽갈, 차가운 색→윤곽남).
3. 팔레트는 §19.2 재질 33색 + 제안 암부 6색 = 39색 (art-reference/palette-proposed-39.json).
   33색만으로는 계열당 명암이 없어 셰이딩이 통째로 사라진다 (v3 실측) — §19.2 개정 제안 근거.

사용: 런 디렉토리의 frames/alt/frame-0.png (픽셀 언페이크, scale 8) →
      final-quantized-39.png + 윤곽 점유율 게이트 (0% 초과 ~ 20%).
"""
import json, colorsys, sys
from PIL import Image

PAL = json.load(open("art-reference/palette-proposed-39.json"))
def hexrgb(c): return tuple(int(c[i:i+2],16) for i in (1,3,5))
FAM = {g: [hexrgb(c) for c in cs] for g, cs in PAL.items()}
ROOF = {"적": [hexrgb("#e0604f"), hexrgb("#8b3c31")], "녹": [hexrgb("#62a58c"), hexrgb("#3d6657")],
        "청": [hexrgb("#4a90b8"), hexrgb("#2e5972")], "황": [hexrgb("#f2b53f"), hexrgb("#967027")]}

def families_for(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
    hue = h * 360; t = []
    if s < 0.16:
        for f in ("벽","모래","목재"): t += [(f,c) for c in FAM[f]]
    elif 55 <= hue < 170:
        t += [("잔디",c) for c in FAM["잔디"]] + [("지붕",c) for c in ROOF["녹"]] + [("장비",hexrgb("#4fbf72"))]
    elif 170 <= hue < 265:
        t += [("물",c) for c in FAM["물"]] + [("폰툰",c) for c in FAM["폰툰"]]
        t += [("지붕",c) for c in ROOF["청"]] + [("장비",hexrgb("#3d8fd6"))]
    elif 20 <= hue < 55:
        for f in ("모래","목재"): t += [(f,c) for c in FAM[f]]
        t += [("지붕",c) for c in ROOF["황"]] + [("장비",hexrgb("#ffd23f"))] + [("장비",hexrgb("#ff8c42"))]
    else:
        t += [("지붕",c) for c in ROOF["적"]] + [("장비",hexrgb("#ef4b4b"))]
        t += [("장비",hexrgb("#ff8c42"))] + [("목재",c) for c in FAM["목재"]]
    return t

def nearest(px, table):
    r,g,b = px; bd,best,bg = 1<<30,None,None
    for grp,(pr,pg,pb) in table:
        d = 2*(r-pr)**2 + 4*(g-pg)**2 + 3*(b-pb)**2
        if d < bd: bd,best,bg = d,(pr,pg,pb),grp
    return best,bg

def quantize_run(run_dir, scale=8):
    OW, OC = hexrgb("#4a3826"), hexrgb("#1e3348")
    src = Image.open(f"{run_dir}/frames/alt/frame-0.png").convert("RGBA")
    w,h = src.size
    lo = src.resize((w//scale,h//scale), Image.NEAREST); lo = lo.crop(lo.getbbox())
    W,H = lo.size; px = lo.load()
    def alpha(x,y):
        if x<0 or y<0 or x>=W or y>=H: return 0
        return px[x,y][3]
    out = Image.new("RGBA",(W,H)); counts,total = {},0
    for y in range(H):
        for x in range(W):
            r,g,b,a = px[x,y]
            if a<128: out.putpixel((x,y),(0,0,0,0)); continue
            sil = min(alpha(x-1,y),alpha(x+1,y),alpha(x,y-1),alpha(x,y+1))<128
            luma = 0.299*r+0.587*g+0.114*b
            if sil and luma < 100:
                hh,ss,_ = colorsys.rgb_to_hsv(r/255,g/255,b/255)
                c = OC if 170 <= hh*360 < 300 and ss > 0.15 else OW
                out.putpixel((x,y), c+(255,)); counts["윤곽"]=counts.get("윤곽",0)+1; total+=1
                continue
            (nr,ng,nb),grp = nearest((r,g,b), families_for(r,g,b))
            out.putpixel((x,y),(nr,ng,nb,255)); counts[grp]=counts.get(grp,0)+1; total+=1
    out.save(f"{run_dir}/final-quantized-39.png")
    o = counts.get("윤곽",0)/total
    ok = 0 < o <= 0.20
    print(f"{run_dir}: {W}x{H} 윤곽 {o:.0%} {'PASS' if ok else 'FAIL'}")
    return out, ok

if __name__ == "__main__":
    for rd in sys.argv[1:]:
        quantize_run(rd)
