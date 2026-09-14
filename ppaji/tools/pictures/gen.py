#!/usr/bin/env python
"""
P56-b 그림 한 장 — Codex 의 built-in image_gen 으로 뽑아 24/32px 카드 아이콘으로 다듬는다.

  <sprite-gen venv>/bin/python tools/pictures/gen.py --id pic/ingredient/strawberry_fruit --px 24 --desc "딸기 · 계열 fruit" --out assets/pictures

왜 sprite-gen 을 안 쓰나: `sprite-gen gen --provider codex` 는 롤아웃 jsonl 에서 image_gen 기록을 찾는데(2026-09-14 실측) codex-cli 0.154 의
롤아웃 형식이 달라져 「기록 0」으로 실패 판정을 낸다 — 그런데 그림은 `~/.codex/generated_images/<session>/exec-*.png` 에 실제로 떨어진다.
그래서 여기서는 명령은 같게(`codex exec --sandbox workspace-write --add-dir <generated_images> --skip-git-repo-check -C <빈 dir> -`, stdin 첫 낱말 `$imagegen`)
쓰고, 결과는 **시작 시각 이후 새로 생긴 PNG** 로 잡는다.

후처리(스타일 SSoT 는 첨부 레퍼런스, 규격은 주문서 §1):
  ① 마젠타(#ff00ff) 크로마키 → 알파  ② 물체 bbox 를 잘라 (px−2) 안에 맞춰 BOX 축소(픽셀 블록 ~25px 짜리 확대본이라 평균이 곧 원색)
  ③ 팔레트 39 + 외곽선 남색 + 흰/검 으로 최근접 양자화  ④ px×px 투명 캔버스 가운데(바깥 1px 비움)  ⑤ 원본은 `<out>/raw/` 에 보관.
"""
from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from PIL import Image
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]  # 게임시스템-v2
PALETTE_JSON = ROOT / 'art-reference' / 'palette-proposed-39.json'
REF_DEFAULT = ROOT / 'art-reference' / 'ui-concept' / 'concept-30-ppaji-target.png'
CODEX_HOME = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex'))
GEN_DIR = CODEX_HOME / 'generated_images'
TIMEOUT = 240
OUTLINE = '#2b2f4a'


def palette() -> np.ndarray:
    data = json.loads(PALETTE_JSON.read_text(encoding='utf-8'))
    hexes: list[str] = []
    for v in data.values():
        if isinstance(v, list):
            hexes += [x for x in v if isinstance(x, str) and x.startswith('#')]
    hexes += [OUTLINE, '#ffffff', '#1a1a1a', '#fff3d6', '#f2b53f', '#e0604f']
    return np.array([[int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)] for h in hexes], dtype=float)


def prompt_for(px: int, desc: str) -> str:
    return (
        f"$imagegen Use the built-in image_gen tool exactly once and save the result. "
        f"Draw ONE pixel-art icon for a Kairosoft-style (Pool Slide Story) management game. Subject: {desc}. "
        f"Requirements: the icon is a {px}x{px} logical-pixel sprite drawn large (each logical pixel a big square block, ~{1024 // px}px), "
        f"front view slightly from above, crisp 1px dark navy outline ({OUTLINE}), flat cel shading with light from the top-left, "
        f"warm limited palette matching the attached reference image, NO text, NO numbers, NO background scene, NO drop shadow, NO gradients. "
        f"The subject fills about 85% of the frame, centered. Background must be flat solid magenta (#ff00ff) for chroma keying. Square image."
    )


def run_codex(prompt: str, ref: Path | None) -> Path:
    GEN_DIR.mkdir(parents=True, exist_ok=True)
    before = {p: p.stat().st_mtime for p in GEN_DIR.rglob('*.png')}
    t0 = time.time()
    stdout = ''
    with tempfile.TemporaryDirectory(prefix='pj-pic-') as work:
        cmd = ['codex', 'exec', '--json', '--sandbox', 'workspace-write', '--add-dir', str(GEN_DIR), '--skip-git-repo-check', '-C', work]
        if ref is not None:
            cmd += ['-i', str(ref)]
        cmd += ['-']
        env = {k: v for k, v in os.environ.items() if not k.startswith('ORCHESTRATOR_')}
        try:
            p = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding='utf-8', env=env, timeout=TIMEOUT)
            stdout = p.stdout or ''
        except subprocess.TimeoutExpired as e:
            stdout = (e.stdout or b'').decode('utf-8', 'replace') if isinstance(e.stdout, bytes) else (e.stdout or '')
    # 내 세션의 그림만 — `--json` 첫 줄 `{"type":"thread.started","thread_id":"<uuid>"}` 가 generated_images/<uuid>/ 를 가리킨다.
    # (병렬 4 에서 「가장 새 PNG」로 잡으면 옆 워커의 그림을 집는다 — 2026-09-14 실측: 달걀·밀가루가 오렌지가 됐다)
    thread = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(ev, dict) and ev.get('thread_id'):
            thread = str(ev['thread_id']); break
    if thread is None:
        raise SystemExit('codex-gen: thread_id 를 못 읽었다 — `codex exec --json` 출력 형식이 바뀌었나')
    mine = sorted((GEN_DIR / thread).glob('*.png'), key=lambda p: p.stat().st_mtime) if (GEN_DIR / thread).is_dir() else []
    mine = [p for p in mine if p.stat().st_mtime >= t0 - 1]
    if not mine:
        raise SystemExit(f'codex-gen: session {thread} 에 새 png 가 없다 (image_gen 이 안 돌았다 — `codex login status`)')
    return mine[-1]


def postprocess(raw: Path, px: int, pal: np.ndarray) -> Image.Image:
    im = np.array(Image.open(raw).convert('RGB')).astype(int)
    # 배경색 = 네 변에서 가장 흔한 색(모델이 마젠타 대신 남색·흰 배경을 깔 때가 있다 — 2026-09-14 실측 수박화채·약과) · 마젠타는 언제나 배경
    h, w, _ = im.shape
    border = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
    q = (border // 16) * 16
    keys, counts = np.unique(q, axis=0, return_counts=True)
    bg = keys[counts.argmax()] + 8
    mag = (np.abs(im - np.array([255, 0, 255])).sum(axis=2) < 90) | (np.abs(im - bg).sum(axis=2) < 60)
    ys, xs = np.where(~mag)
    if len(xs) == 0:
        raise SystemExit('codex-gen: image is all magenta (nothing drawn)')
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = Image.fromarray(im[y0:y1, x0:x1].astype('uint8'))
    alpha = Image.fromarray(((~mag[y0:y1, x0:x1]) * 255).astype('uint8'))
    inner = px - 2
    w, h = crop.size
    s = inner / max(w, h)
    tw, th = max(1, round(w * s)), max(1, round(h * s))
    crop_s = crop.resize((tw, th), Image.Resampling.BOX)
    alpha_s = alpha.resize((tw, th), Image.Resampling.BOX)
    rgb = np.array(crop_s).astype(float)
    a = np.array(alpha_s)
    # 팔레트 최근접
    flat = rgb.reshape(-1, 3)
    d = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    q = pal[d.argmin(axis=1)].reshape(rgb.shape).astype('uint8')
    # 외곽선(주문서 §1 「1px 남색 외곽선」): 축소로 배경·본체와 섞여 갈색이 된 어두운 픽셀 + 투명과 맞닿은 가장자리 픽셀은 남색으로 — 카드 위 실루엣이 선다
    dark = flat.max(axis=1) < 96
    q.reshape(-1, 3)[dark] = np.array([0x2b, 0x2f, 0x4a], dtype='uint8')
    out = np.zeros((px, px, 4), dtype='uint8')
    ox, oy = (px - tw) // 2, (px - th) // 2
    out[oy:oy + th, ox:ox + tw, :3] = q
    out[oy:oy + th, ox:ox + tw, 3] = np.where(a >= 128, 255, 0)
    al = out[:, :, 3] > 0
    pad = np.pad(al, 1, constant_values=False)
    edge = al & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    out[edge, :3] = np.array([0x2b, 0x2f, 0x4a], dtype='uint8')
    # 바깥 1px 은 비운다(주문서 §1)
    out[0, :, 3] = 0; out[-1, :, 3] = 0; out[:, 0, 3] = 0; out[:, -1, 3] = 0
    return Image.fromarray(out, 'RGBA')


def scene_prompt(w: int, h: int, desc: str) -> str:
    return (
        f"$imagegen Use the built-in image_gen tool exactly once and save the result. "
        f"Draw ONE pixel-art scene banner for a Kairosoft-style (Pool Slide Story) management game, to sit behind a result card. Scene: {desc}. "
        f"Requirements: wide composition {w}:{h} (landscape), drawn as chunky pixel art (logical grid about {w}x{h} pixels, each pixel a big block), "
        f"warm summer palette matching the attached reference, flat cel shading, light from the top-left, NO text, NO UI, NO characters' faces in close-up, "
        f"the scene fills the whole image edge to edge (no border, no frame, opaque background). If the canvas must be square, put the scene in the middle horizontal band and fill above/below with the same sky/water."
    )


def postprocess_scene(raw: Path, w: int, h: int, pal: np.ndarray) -> Image.Image:
    im = Image.open(raw).convert('RGB')
    W, H = im.size
    # 가운데 가로 띠를 w:h 비율로 잘라 BOX 축소 → 팔레트 양자화 (배경은 불투명)
    th = int(W * h / w)
    top = max(0, (H - th) // 2)
    band = im.crop((0, top, W, min(H, top + th))).resize((w, h), Image.Resampling.BOX)
    rgb = np.array(band).astype(float).reshape(-1, 3)
    d = ((rgb[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2)
    q = pal[d.argmin(axis=1)].reshape(h, w, 3).astype('uint8')
    return Image.fromarray(q, 'RGB')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--id', required=True)
    ap.add_argument('--px', type=int, required=True)
    ap.add_argument('--desc', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--ref', default=str(REF_DEFAULT))
    ap.add_argument('--raw', help='건너뛰기: 이미 받은 원본 PNG 를 후처리만')
    ap.add_argument('--scene', help='장면 배경 모드 — `WxH`(예 192x64): 크로마키 없이 가운데 띠를 잘라 불투명 픽셀아트로')
    a = ap.parse_args()
    name = a.id.removeprefix('pic/').replace('/', '_')
    out_dir = Path(a.out); (out_dir / 'raw').mkdir(parents=True, exist_ok=True)
    if a.scene:
        sw, sh = (int(x) for x in a.scene.lower().split('x'))
        raw = Path(a.raw) if a.raw else run_codex(scene_prompt(sw, sh, a.desc), Path(a.ref) if a.ref else None)
    else:
        raw = Path(a.raw) if a.raw else run_codex(prompt_for(a.px, a.desc), Path(a.ref) if a.ref else None)
    raw_keep = out_dir / 'raw' / f'{name}.png'
    if raw.resolve() != raw_keep.resolve():
        shutil.copy(raw, raw_keep)
    img = postprocess_scene(raw_keep, sw, sh, palette()) if a.scene else postprocess(raw_keep, a.px, palette())
    img.save(out_dir / f'{name}.png')
    print(json.dumps({'id': a.id, 'file': str(out_dir / f'{name}.png'), 'raw': str(raw_keep), 'px': a.px, 'scene': a.scene or None}, ensure_ascii=False))


if __name__ == '__main__':
    main()
