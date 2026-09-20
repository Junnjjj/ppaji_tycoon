"""Adopt accepted indoor-open-v2 art; preserve old footprint IDs and simulation rules.
Usage: python3 tools/assets/adopt-indoor-open.py /path/to/asset-worktree
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys

source = Path(sys.argv[1]).resolve() / 'assets/generated/kairo-v4-simple-pilot/indoor-open-v2'
root = Path(__file__).resolve().parents[2]
game = root / 'ppaji'
base = game / 'public/assets/approved-facilities'
defpath = game / 'src/data/facilities.json'
defs = json.loads(defpath.read_text())
byid = {d['id']: d for d in defs}
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
items = json.loads((source / 'runtime/manifest.json').read_text())['items']
proof = {'source': str(source), 'scope': 'construction-art-only', 'facilities': {}}
handover = root / 'docs/assets/handovers/indoor-open-v2'
handover.mkdir(parents=True, exist_ok=True)
# Preserve the pre-adoption manifest once, including the previous indoor_shop alias.
backup = handover / 'previous-manifest.json'
if not backup.exists():
    shutil.copyfile(manifest_path, backup)
prepared = []
for item in items:
    sid = item['id']
    old = byid[sid]
    w, d = item['size']
    changed = [old['w'], old['d']] != [w, d]
    fid = 'authored_' + sid if changed else sid
    model = source / sid
    if sid in ('locker_row', 'changing_row'):
        model = source.parent / 'indoor-open-v1' / sid
    contract = json.loads((model / 'review-contract.json').read_text())
    art = source / 'runtime/assets' / sid
    qa = json.loads((art / 'presentation-qa.json').read_text())
    assert contract['size'] == [w, d]
    assert qa['sourceSHA'] == item['sourceSHA']
    assert len(qa['checks']) == 8 and all(c['exactReopen'] and not c['clipped'] for c in qa['checks'])
    frames = {}
    for direction in range(4):
        p = art / f'native-d{direction}.png'
        assert struct.unpack('>II', p.read_bytes()[16:24]) == (192, 192)
        frames[f'd{direction}'] = {'file': f'{fid}/{p.name}', 'w': 192, 'h': 192,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    prepared.append((item, fid, contract, art, frames, qa))
# Only write after every source has passed preflight.
for item, fid, contract, art, frames, qa in prepared:
    sid = item['id']
    w, d = item['size']
    if fid != sid and fid not in byid:
        new = copy.deepcopy(byid[sid])
        new.update(id=fid, name=item['name']+' (제작본)', w=w, d=d, variantOf=sid, facings=4,
                   desc=f'제작본 {w}×{d} · 기존 시설과 동일한 해금·이용 조건')
        defs.append(new)
        byid[fid] = new
    assert [byid[fid]['w'], byid[fid]['d']] == [w, d]
    byid[fid]['facings'] = 4
    (base / fid).mkdir(exist_ok=True)
    for direction in range(4):
        shutil.copyfile(art / f'native-d{direction}.png', base / fid / f'native-d{direction}.png')
    manifest['facilities'][fid] = {
        'name': byid[fid]['name'], 'renderOnly': True, 'cameraTargetZTiles': .6,
        'size': [w,d], 'artSize': [w,d], 'footprintOrigin': [-w/2,-d/2],
        'footprintCenter': [0,0], 'logicalSize': 192,
        'anchor': {'ax': 96, 'ay': 96+.6*math.sqrt(512)*math.cos(math.pi/6)},
        'deckTopZ': 0, 'humanOpaquePx': 22,
        'pivotByFacing': [[w/2,d/2],[d/2,w/2],[w/2,d/2],[d/2,w/2]],
        'footprintByFacing': [[w,d],[d,w],[w,d],[d,w]],
        'entry': [0,0,0], 'exit': [0,0,0], 'landmarks': contract.get('landmarks'),
        'floorMode': contract['floor_mode'], 'reservation': 'existing-facility-footprint',
        'blueprint': 'indoor-open-v2', 'deckTiles': [], 'frames': frames,
        'note': 'Accepted cutaway art only. Physical access/slots are inactive handover data; existing simulation retained.'
    }
    dst = handover / fid
    dst.mkdir(exist_ok=True)
    for pattern in ('interaction.json','depth-metadata.json','depth-d*.bin','support-d*.bin','presentation-qa.json'):
        for p in art.glob(pattern):
            shutil.copyfile(p, dst / p.name)
    shutil.copyfile((source.parent / 'indoor-open-v1' / sid if sid in ('locker_row','changing_row') else source / sid) / 'review-contract.json', dst / 'review-contract.json')
    proof['facilities'][fid] = {**item, 'gameId': fid, 'preservedLegacyId': sid if fid != sid else None,
        'frames': frames, 'presentationQA': qa, 'contract': contract}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1)+'\n')
defpath.write_text(json.dumps(defs, ensure_ascii=False, indent=2)+'\n')
(base / 'indoor-provenance.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
for name in ('motion.mjs',):
    shutil.copyfile(source / 'runtime' / name, handover / name)
shutil.copyfile(source / 'README.md', handover / 'source-README.md')
shutil.copyfile(source / 'integration/final-qa.json', handover / 'source-final-qa.json')
print('Adopted', len(prepared), 'facilities / 48 frames:', ', '.join(p[1] for p in prepared))
