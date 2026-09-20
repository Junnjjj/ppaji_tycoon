"""Import approved watchtower-v1 art; simulation and facility definitions unchanged.
Usage: python3 tools/assets/adopt-watchtower.py /path/to/asset-worktree
"""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1]).resolve() / 'assets/generated/kairo-v4-simple-pilot/watchtower-v1'
base = root / 'ppaji/public/assets/approved-facilities'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
defs = {d['id']: d for d in json.loads((root / 'ppaji/src/data/facilities.json').read_text())}
items = json.loads((source / 'runtime/manifest.json').read_text())['items']
assert {i['id'] for i in items} == {'watchtower'}
prepared = []
for item in items:
    fid = item['id']
    model = source / fid
    art = source / 'runtime/assets' / fid
    contract = json.loads((model / 'review-contract.json').read_text())
    qa = json.loads((art / 'presentation-qa.json').read_text())
    sha = hashlib.sha256((model / 'facility.blend').read_bytes()).hexdigest()
    summary = json.loads((model / 'review/summary.json').read_text())
    assert sha == item['sourceSHA'] == qa['sourceSHA'] == summary['protected']['blend']
    assert item['size'] == contract['size'] == [defs[fid]['w'], defs[fid]['d']] == [1, 1]
    assert len(qa['checks']) == 8 and all(c['exactReopen'] and not c['clipped'] for c in qa['checks'])
    frames = {}
    for d in range(4):
        p = art / f'native-d{d}.png'
        assert struct.unpack('>II', p.read_bytes()[16:24]) == (192, 192)
        frames[f'd{d}'] = {'file': f'{fid}/{p.name}', 'w': 192, 'h': 192,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
    prepared.append((fid, art, contract, frames, qa, summary))
handover = root / 'docs/assets/handovers/watchtower-v1'
handover.mkdir(parents=True, exist_ok=True)
proof = {'scope': 'approved-art-only', 'source': str(source), 'facilities': {}}
for fid, art, contract, frames, qa, summary in prepared:
    spec = copy.deepcopy(manifest['facilities']['info'])
    spec.update(name=defs[fid]['name'], renderOnly=True, size=[1,1], artSize=[1,1],
        footprintOrigin=[-.5,-.5], footprintCenter=[0,0],
        pivotByFacing=[[.5,.5]]*4,
        footprintByFacing=[[1,1]]*4,
        frames=frames, landmarks=contract['landmarks'], floorMode=contract['floor_mode'],
        blueprint='watchtower-v1',
        note='Approved service fixture art. Staff and guest anchors are inactive handover data; existing simulation retained.')
    spec.pop('visualSource', None)
    manifest['facilities'][fid] = spec
    (base / fid).mkdir(exist_ok=True)
    for d in range(4):
        shutil.copyfile(art / f'native-d{d}.png', base / fid / f'native-d{d}.png')
    dst = handover / fid
    dst.mkdir(exist_ok=True)
    for pattern in ('interaction.json','depth-metadata.json','depth-d*.bin','support-d*.bin','presentation-qa.json'):
        for p in art.glob(pattern): shutil.copyfile(p, dst / p.name)
    shutil.copyfile(source / fid / 'review-contract.json', dst / 'review-contract.json')
    proof['facilities'][fid] = {'frames': frames, 'presentationQA': qa, 'sourceSummary': summary, 'contract': contract}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=1)+'\n')
(base / 'watchtower-provenance.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(source / 'integration/occupied-qa.json', handover / 'source-occupied-qa.json')
print('Imported watchtower / 4 native frames; facility definitions unchanged.')
