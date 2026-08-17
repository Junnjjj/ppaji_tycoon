"""yaw20 재규격 시설 11종 배치 파이프라인 (작업 B, 2026-08-17).

스킬(.claude/skills/ppaji-pixel-asset) 5단계를 그대로 태운다:
  base → (락) → prepare → 행 생성 → 추출 → 규격 fit → 내보내기

서브커맨드:
  base     베이스 후보 생성 (codex, 4병렬)
  prepare  sprite-request 런 폴더 생성
  row      행 생성 (codex, 4병렬)
  extract  픽셀 언페이크 추출
  fit      로지컬 폭이 규격 폭이 되도록 logical_height 를 재계산해 재추출
  export   양자화 전 로지컬 PNG → prototype-3d/public/sprites/<id>.png + index.json
  report   규격 대비 오차표
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SG = '/Users/jangjunpyo/tools/sprite-gen/.venv/bin/sprite-gen'
PY = '/Users/jangjunpyo/tools/sprite-gen/.venv/bin/python'
SCRIPTS = '/Users/jangjunpyo/tools/sprite-gen/scripts'
SPEC = json.load(open(f'{ROOT}/assets/generated/yaw20-spec.json'))['assets']
RUN = 'y20'          # 런 접두사
SCALE = 8            # 픽셀 언페이크 배율 (셀 = 로지컬×8)
CHROMA = '#FF00FF'   # 전 종 마젠타 — 소재에 자홍/분홍 없음 (프롬프트로 금지)

STYLE = (
    'Chunky pixel-art in a high-saturation warm summer palette: dark warm outlines, '
    'two-tone shading (one lit tone + one shadow tone per material), light from the upper left, '
    'isometric three-quarter view showing the roof, the front face and one side face, '
    'vertical edges strictly vertical on screen. Match the attached style crops exactly '
    'for pixel density, outline weight and colour feel.'
)


def prompt_for(a):
    return (
        f"{a['subject']}.\n\n"
        f'{STYLE}\n\n'
        'BOUNDING BOX CONTRACT (this is the most important rule): the attached gray box is the exact 3D '
        'bounding box of this object in our camera. Build the object to FILL that box — its ground '
        "footprint is the box's base, its widest points touch the box's left and right, its top reaches "
        "the box's top face. Copy the box's angles EXACTLY:\n"
        '  · this is a SHALLOW isometric, NOT the usual symmetric 30° isometric\n'
        '  · the wide front wall faces lower-right and its bottom edge rises only about 12° to the right\n'
        '  · the narrow left wall is steep: its bottom edge drops about 58° down to the near corner\n'
        '  · the near ground corner therefore sits LEFT of the object centre, not in the middle\n'
        '  · the roof/top face recedes upward and to the RIGHT\n'
        '  · every vertical edge is strictly vertical on screen\n'
        'Do not mirror these angles. Do not redraw the box, its faces, its tick marks or its gray colour.\n\n'
        f"FRAMING: the ground footprint occupies the bottom {a['ratio']}% of the object's total height, "
        'exactly as in the box.\n\n'
        f"DENSITY: VERY CHUNKY pixel blocks — the whole object must be only about {round(a['h'])} blocks "
        'tall; no detail smaller than one block; simplify small parts into a few chunky coloured blocks.\n\n'
        'LAYOUT: ONE single object, centered, ONE connected solid silhouette. Perfectly flat pure magenta '
        '#FF00FF background across the whole image. No ground, no water, no waves, no shadow, no cast '
        'shadow, no text, no labels, no guide lines, no people, no extra scenery props. Do not use magenta, '
        'pink or chroma-adjacent colours anywhere in the object.'
    )


def sh(cmd, **kw):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kw)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


def pmap(fn, items, n=4):
    with ThreadPoolExecutor(max_workers=n) as ex:
        return list(ex.map(fn, items))


def cand_path(a, n):
    return f"assets/generated/base-candidates/{RUN}-{a['id']}/cand-{n}.png"


def run_dir(a):
    return f"assets/generated/sprites/{RUN}-{a['id']}"


# ── base ───────────────────────────────────────────────────────────────────
def cmd_base(ids, n_cand=1):
    jobs = [(a, i) for a in SPEC if a['id'] in ids for i in range(1, n_cand + 1)]

    def one(job):
        a, i = job
        out = cand_path(a, i)
        if os.path.exists(f'{ROOT}/{out}'):
            return f"skip {a['id']} cand-{i}"
        os.makedirs(os.path.dirname(f'{ROOT}/{out}'), exist_ok=True)
        cmd = [SG, 'gen', '--provider', 'codex', '--prompt', prompt_for(a),
               '--ref', f"art-reference/guides/{a['guide']}"]
        for c in a['crops']:
            cmd += ['--ref', f'art-reference/crops/{c}']
        cmd += ['--out', out]
        rc, log = sh(cmd)
        return f"{'OK ' if rc == 0 else 'FAIL'} {a['id']} cand-{i} {log.strip().splitlines()[-1] if log.strip() else ''}"

    for line in pmap(one, jobs):
        print(line, flush=True)


# ── prepare ────────────────────────────────────────────────────────────────
def cmd_prepare(ids, pick=1, logical=None):
    for a in SPEC:
        if a['id'] not in ids:
            continue
        lh = logical or round(a['h'])
        cmd = [PY, f'{SCRIPTS}/prepare_sprite_run.py',
               '--out-dir', run_dir(a), '--character-id', f"{RUN}-{a['id']}",
               '--base-image', cand_path(a, pick),
               '--cell-size', str(lh * SCALE), '--chroma-key', CHROMA,
               '--fit-pixel-unfake', '--fit-logical-height', str(lh),
               '--fit-align-x', 'centroid', '--fit-align-y', 'bottom',
               '--request-json', json.dumps({'states': {'alt': {
                   'frames': 1, 'fps': 1, 'loop': False,
                   'action': 'the same structure, identical to the reference'}}}),
               '--force']
        rc, log = sh(cmd)
        print(f"{'OK ' if rc == 0 else 'FAIL'} prepare {a['id']} lh={lh}", log.strip()[-200:] if rc else '', flush=True)


# ── row ────────────────────────────────────────────────────────────────────
def cmd_row(ids):
    jobs = [a for a in SPEC if a['id'] in ids]

    def one(a):
        d = run_dir(a)
        if os.path.exists(f'{ROOT}/{d}/raw/alt.png'):
            return f"skip row {a['id']}"
        os.makedirs(f'{ROOT}/{d}/raw', exist_ok=True)
        extra = (
            '\n\nADDITIONAL HARD RULES: keep the floor plan exactly on the same ground parallelogram '
            'as the reference; nothing extends beyond it horizontally. ONE connected solid silhouette. '
            'No ground, no shadow, no water.'
        )
        pf = f'{ROOT}/{d}/prompts/alt.hint.txt'
        with open(f'{ROOT}/{d}/prompts/alt.txt') as f:
            base = f.read()
        with open(pf, 'w') as f:
            f.write(base + extra)
        cmd = [SG, 'gen', '--provider', 'codex', '--prompt-file', f'{d}/prompts/alt.hint.txt',
               '--ref', f'{d}/base-source.png',
               '--ref', f'{d}/references/layout-guides/alt.png',
               '--ref', f"art-reference/guides/{a['guide']}",
               '--out', f'{d}/raw/alt.png']
        rc, log = sh(cmd)
        return f"{'OK ' if rc == 0 else 'FAIL'} row {a['id']} {log.strip().splitlines()[-1] if log.strip() else ''}"

    for line in pmap(one, jobs):
        print(line, flush=True)


# ── extract ────────────────────────────────────────────────────────────────
def cmd_extract(ids):
    def one(a):
        rc, log = sh([PY, f'{SCRIPTS}/extract_sprite_row_frames.py', '--run-dir', run_dir(a)])
        return f"{'OK ' if rc == 0 else 'FAIL'} extract {a['id']} {logical_size(a)}" + ('' if rc == 0 else '\n' + log[-400:])

    for line in pmap(one, [a for a in SPEC if a['id'] in ids]):
        print(line, flush=True)


def logical_img(a):
    """양자화 전 로지컬 PNG — frames/alt/frame-0.png 를 ÷SCALE NEAREST + bbox 크롭."""
    p = f'{ROOT}/{run_dir(a)}/frames/alt/frame-0.png'
    if not os.path.exists(p):
        return None
    src = Image.open(p).convert('RGBA')
    w, h = src.size
    lo = src.resize((w // SCALE, h // SCALE), Image.NEAREST)
    bb = lo.getbbox()
    return lo.crop(bb) if bb else lo


def logical_size(a):
    im = logical_img(a)
    return im.size if im else '(none)'


# ── fit ────────────────────────────────────────────────────────────────────
def cmd_fit(ids):
    """폭이 규격 폭이 되도록 logical_height 를 역산해 prepare+extract 를 다시 태운다."""
    for a in SPEC:
        if a['id'] not in ids:
            continue
        im = logical_img(a)
        if im is None:
            print(f"FAIL fit {a['id']} — no frame", flush=True)
            continue
        w0, h0 = im.size
        req = f'{ROOT}/{run_dir(a)}/sprite-request.json'
        cur = json.load(open(req))['fit']['logical_height']
        target = max(4, round(cur * (a['w'] / w0)))
        if target == cur:
            print(f"ok fit {a['id']} lh={cur} → {w0}x{h0}", flush=True)
            continue
        # raw 를 보존한 채 request 만 갱신하고 재추출 (gen 재호출 없음)
        raw = f'{ROOT}/{run_dir(a)}/raw/alt.png'
        # ⚠ prepare --force 가 런 폴더를 갈아엎을 수 있으니 raw 는 폴더 **밖**에 대피시킨다
        stash = f'{ROOT}/assets/generated/raw-stash'
        os.makedirs(stash, exist_ok=True)
        keep = f"{stash}/{a['id']}.png"
        os.replace(raw, keep)
        cmd_prepare({a['id']}, logical=target)
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        os.replace(keep, raw)
        rc, log = sh([PY, f'{SCRIPTS}/extract_sprite_row_frames.py', '--run-dir', run_dir(a)])
        print(f"{'OK ' if rc == 0 else 'FAIL'} fit {a['id']} lh {cur}→{target} → {logical_size(a)}",
              '' if rc == 0 else log[-300:], flush=True)


# ── export ─────────────────────────────────────────────────────────────────
def cmd_export(ids):
    idx_path = f'{ROOT}/prototype-3d/public/sprites/index.json'
    idx = json.load(open(idx_path))
    for a in SPEC:
        if a['id'] not in ids:
            continue
        im = logical_img(a)
        if im is None:
            print(f"FAIL export {a['id']}", flush=True)
            continue
        out = f"{ROOT}/prototype-3d/public/sprites/{a['id']}.png"
        im.save(out)
        idx[a['id']] = {
            'run': f"{RUN}-{a['id']}", 'px': [im.size[0], im.size[1]],
            'footprint': [a['fw'], a['fh']],
            'tilesWide': round(im.size[0] / 16, 2),
        }
        print(f"export {a['id']} {im.size}", flush=True)
    with open(idx_path, 'w') as f:
        json.dump(idx, f, indent=1, ensure_ascii=False)
        f.write('\n')


# ── report ─────────────────────────────────────────────────────────────────
def cmd_report(ids):
    print(f"{'id':<12}{'fp':<6}{'spec w×h':<14}{'실측 w×h':<14}{'폭오차':<9}{'높이오차':<9}{'바닥비율':<9}")
    for a in SPEC:
        if a['id'] not in ids:
            continue
        im = logical_img(a)
        if im is None:
            print(f"{a['id']:<12}—")
            continue
        w, h = im.size
        floor_h = a['h'] * a['ratio'] / 100
        print(f"{a['id']:<12}{a['fw']}x{a['fh']:<4}{a['w']:.1f}x{a['h']:<9.1f}{w}x{h:<11}"
              f"{(w - a['w']) / a['w'] * 100:+6.1f}%  {(h - a['h']) / a['h'] * 100:+6.1f}%  "
              f"{floor_h / h * 100:5.1f}%")


if __name__ == '__main__':
    cmd = sys.argv[1]
    ids = set(sys.argv[2:]) or {a['id'] for a in SPEC}
    if cmd == 'base':
        cmd_base(ids)
    elif cmd == 'prepare':
        cmd_prepare(ids)
    elif cmd == 'row':
        cmd_row(ids)
    elif cmd == 'extract':
        cmd_extract(ids)
    elif cmd == 'fit':
        cmd_fit(ids)
    elif cmd == 'export':
        cmd_export(ids)
    elif cmd == 'report':
        cmd_report(ids)
    else:
        raise SystemExit(f'unknown: {cmd}')
