#!/usr/bin/env python
"""
P56-b 그림 342장 일괄 생성 — 목록은 `src/data/*.json` 에서 만든다(주문서 §5 와 같은 규칙: `pictures.test.ts` 의 id 집합).

  <sprite-gen venv>/bin/python tools/pictures/batch.py [--workers 4] [--limit N] [--group ingredient|recipe|part|gear|item|gift|band] [--dry]

이미 `assets/pictures/<name>.png` 가 있으면 건너뛴다(재실행 = 이어하기). 한 장은 `gen.py` 한 프로세스, 실패는 한 번 다시.
진행은 `assets/pictures/batch.log`(jsonl) 에 남는다 — 한 줄 = 한 장.
"""
from __future__ import annotations
import argparse, json, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parents[1]
DATA = PKG / 'src' / 'data'
OUT = PKG / 'assets' / 'pictures'
PY = sys.executable

CAT_KO = {'drink': '음료', 'snack': '스낵', 'meal': '식사', 'dessert': '디저트'}
CLASS_KO = {'fruit': '과일', 'base': '기본 재료', 'sweet': '단맛', 'dairy': '유제품', 'seafood': '해산물', 'grain': '곡물', 'veg': '채소', 'meat': '고기', 'nut': '견과'}


def load(name: str) -> list[dict]:
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def jobs() -> list[dict]:
    out: list[dict] = []
    for d in load('ingredients.json'):
        out.append({'id': f"pic/ingredient/{d['id']}", 'px': 24, 'desc': f"요리 재료 아이콘: {d['name']} ({CLASS_KO.get(d.get('class', ''), d.get('class', ''))}). 재료 자체를 크게, 접시나 손 없이"})
    for d in load('recipes.json'):
        fail = d.get('unlock') == 'fail'
        out.append({'id': f"pic/recipe/{d['id']}", 'px': 24, 'desc': f"완성 요리 아이콘: {d['name']} ({CAT_KO.get(d.get('cat', ''), d.get('cat', ''))}){' — 실패작이라 조금 우스꽝스럽게' if fail else ''}. 접시/컵에 담긴 음식을 정면에서"})
    for d in load('rig-parts.json'):
        out.append({'id': f"pic/part/{d['id']}", 'px': 24, 'desc': f"물놀이 기구 개조 부품 아이콘: {d['name']} (계열 {d.get('class', '')}). 기계 부품 하나를 크게"})
    for d in load('parts.json'):  # 공방 부품 41 — 주문서 초안(342)에 빠져 있던 무리(2026-09-14 실측: 공방 창 카드가 전부 폴백)
        out.append({'id': f"pic/part/{d['id']}", 'px': 24, 'desc': f"견인 기구 공방 부품 아이콘: {d['name']} (계열 {d.get('class', '')} — 엔진/튜브/로프/손잡이/좌석/안전/보드/장식). 부품 하나를 크게"})
    for d in load('gears.json'):
        fail = d.get('unlock') == 'fail'
        out.append({'id': f"pic/gear/{d['id']}", 'px': 32, 'desc': f"견인 수상 기구 아이콘: {d['name']} (분류 {d.get('cat', '')}){' — 실패작(구멍 난·엉킨·가라앉은)' if fail else ''}. 튜브/보드/스키 같은 물놀이 기구 하나를 살짝 비스듬히"})
    for d in load('items.json'):
        out.append({'id': f"pic/item/{d['id']}", 'px': 24, 'desc': f"수역에 넣는 소품 아이콘: {d['name']}. 색 {d.get('color', '없음')} · 향 {d.get('scent', '없음')} 느낌이 나는 물건 하나"})
    for d in load('gifts.json'):
        out.append({'id': f"pic/gift/{d['id']}", 'px': 24, 'desc': f"손님 선물 아이콘: {d['name']} ({'튜브' if d.get('kind') == 'float' else '수영복'}). 물건 하나를 크게"})
    for d in load('wristbands.json'):
        out.append({'id': f"pic/band/{d['id']}", 'px': 24, 'desc': f"손목 팔찌(이용권) 아이콘: {d['name']} (등급 {d.get('grade', 0)}). 원형 팔찌 하나, 등급이 높을수록 화려하게"})
    # P56-b2 — 캠페인 3 · 인물 초상 5×2 · 장면 배경 4 (장면은 `assets/scenes/`, 불투명 192×64)
    CAMP = {'flyer': '읍내 전봇대에 붙은 알록달록한 현수막·전단', 'bus': '노란 전세버스 한 대(앞모습, 손님이 탄 창)', 'tv': '재생 버튼이 큰 스마트폰 화면(유튜브 광고)'}
    for d in load('campaigns.json'):
        out.append({'id': f"pic/campaign/{d['id']}", 'px': 24, 'desc': f"캠페인 아이콘: {d['name']} — {CAMP.get(d['id'], d.get('desc', ''))}"})
    for d in load('portraits.json'):
        for mood, m in (('calm', '차분한 표정'), ('happy', '환하게 웃는 표정')):
            out.append({'id': f"pic/portrait/{d['id']}_{mood}", 'px': 32, 'desc': f"인물 초상 아이콘(가슴 위 흉상, 정면): {d['name']} — {d['hint']}, {m}. 한 사람만, 배경 없이"})
    for d in load('scenes.json'):
        out.append({'id': f"pic/scene/{d['id']}", 'px': d['w'], 'scene': f"{d['w']}x{d['h']}", 'out': str(PKG / 'assets' / 'scenes'), 'desc': f"{d['name']} 배경 — {d['hint']}"})
    return out


def name_of(pid: str) -> str:
    return pid.removeprefix('pic/').replace('/', '_')


def out_of(j: dict) -> Path:
    return Path(j['out']) if j.get('out') else OUT


def run_one(j: dict, log: Path) -> dict:
    target = out_of(j) / f"{name_of(j['id'])}.png"
    if target.exists():
        return {'id': j['id'], 'skip': True}
    last = ''
    for attempt in range(2):
        t0 = time.time()
        cmd = [PY, str(HERE / 'gen.py'), '--id', j['id'], '--px', str(j['px']), '--desc', j['desc'], '--out', str(out_of(j))]
        if j.get('scene'):
            cmd += ['--scene', j['scene']]
        p = subprocess.run(cmd, capture_output=True, text=True)
        rec = {'id': j['id'], 'ok': p.returncode == 0, 'sec': round(time.time() - t0, 1), 'attempt': attempt + 1, 'err': (p.stderr or p.stdout)[-300:] if p.returncode != 0 else ''}
        with log.open('a', encoding='utf-8') as f:
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
        if p.returncode == 0:
            return rec
        last = rec['err']
        time.sleep(5)
    return {'id': j['id'], 'ok': False, 'err': last}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--group', default='')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--repost', action='store_true', help='생성 없이 raw/ 원본 전부를 지금 gen.py 후처리로 다시 굽는다(후처리 규칙이 바뀌었을 때)')
    a = ap.parse_args()
    js = jobs()
    if a.repost:
        n = 0
        for j in js:
            raw = out_of(j) / 'raw' / f"{name_of(j['id'])}.png"
            if not raw.exists():
                continue
            cmd = [PY, str(HERE / 'gen.py'), '--id', j['id'], '--px', str(j['px']), '--desc', j['desc'], '--out', str(out_of(j)), '--raw', str(raw)]
            if j.get('scene'):
                cmd += ['--scene', j['scene']]
            p = subprocess.run(cmd, capture_output=True, text=True)
            n += p.returncode == 0
            if p.returncode != 0:
                print(f"repost FAIL {j['id']}: {(p.stderr or '')[-200:]}", flush=True)
        print(f'repost {n}', flush=True)
        return
    if a.group:
        js = [j for j in js if j['id'].startswith(f'pic/{a.group}/')]
    todo = [j for j in js if not (out_of(j) / f"{name_of(j['id'])}.png").exists()]
    if a.limit:
        todo = todo[:a.limit]
    print(f'전체 {len(js)} · 남은 {len(todo)} · 워커 {a.workers}', flush=True)
    if a.dry:
        for j in todo[:5]:
            print(j)
        return
    OUT.mkdir(parents=True, exist_ok=True)
    log = OUT / 'batch.log'
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(run_one, j, log): j for j in todo}
        for k, fu in enumerate(as_completed(futs), 1):
            r = fu.result()
            if r.get('ok'):
                ok += 1
            elif not r.get('skip'):
                fail += 1
            print(f"[{k}/{len(todo)}] {r['id']} {'ok' if r.get('ok') else 'FAIL' if not r.get('skip') else 'skip'} {r.get('sec', '')}s {r.get('err', '')[:80]}", flush=True)
    print(f'끝 — 성공 {ok} · 실패 {fail} · 파일 {len(list(OUT.glob("*.png")))}', flush=True)


if __name__ == '__main__':
    main()
