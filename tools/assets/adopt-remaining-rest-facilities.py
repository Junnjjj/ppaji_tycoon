"""Restore matching-footprint authored rest facilities from the verified asset backup.
Usage: python3 tools/assets/adopt-remaining-rest-facilities.py /path/to/asset-worktree
"""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import sys

worktree = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[2]
base = root / 'ppaji/public/assets/approved-facilities'
restored = worktree / 'codex-output/remaining-nine-restored-20260919'
source_map = worktree / 'codex-output/restored-asset-review-20260912/codex-output/npc-pose-map-v1/map-manifest.json'
packages = {a['asset_id']: a for a in json.loads(source_map.read_text())['packages']}
defs = {d['id']: d for d in json.loads((root / 'ppaji/src/data/facilities.json').read_text())}
manifest = json.loads((base / 'manifest.json').read_text())
proof = {}
for source_id in ['pavilion', 'glamping', 'caravan', 'parasol', 'bbq_zone', 'sunbed_row', 'pyeongsang_row', 'massage_row', 'footbath']:
    fid = source_id if source_id in ['pavilion', 'glamping', 'caravan'] else 'authored_' + source_id
    package = packages[source_id]
    source_dir = (restored / package['directions'][0]['image']).parents[2]
    source = json.loads((source_dir / 'manifest.json').read_text())
    rotation = json.loads((source_dir / 'physical-rotations.json').read_text())
    w, d = package['proposed_size']
    assert [w, d] == [defs[fid]['w'], defs[fid]['d']], fid
    assert rotation['root_yaws'] == [0, 90, 180, 270]
    assert all(abs(a-b) < 0.00001 for a,b in zip(rotation['camera']['euler_deg'], [60, 0, 45]))
    assert source['geometry_sha256'] == rotation['geometry_sha256']
    n = rotation['camera']['logical_canvas'][0]
    ax, ay = rotation['origin_logical']
    blend = source_dir / 'B.blend'
    assert hashlib.sha256(blend.read_bytes()).hexdigest() == source['outputs']['B']['blend']['sha256']
    frames = {}
    (base / fid).mkdir(exist_ok=True)
    for facing, direction in enumerate(package['directions']):
        src = restored / direction['image']
        raw = src.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert digest == direction['sha256']
        assert struct.unpack('>II', raw[16:24]) == (n, n)
        name = f'native-d{facing}.png'
        shutil.copyfile(src, base / fid / name)
        frames[f'd{facing}'] = {'file': f'{fid}/{name}', 'w': n, 'h': n, 'sha256': digest}
    manifest['facilities'][fid] = {
        'name': defs[fid]['name'], 'renderOnly': True, 'cameraTargetZTiles': 0.6,
        'size': [w, d], 'artSize': [w, d], 'footprintOrigin': [-w/2, -d/2],
        'footprintCenter': [0, 0], 'logicalSize': n, 'anchor': {'ax': ax, 'ay': ay},
        'deckTopZ': 0, 'humanOpaquePx': source['metrics']['human_height_texels'],
        'pivotByFacing': [[w/2,d/2],[d/2,w/2],[w/2,d/2],[d/2,w/2]],
        'footprintByFacing': [[w,d],[d,w],[w,d],[d,w]],
        'entry': [0,0,0], 'exit': [0,0,0], 'landmarks': None,
        'floorMode': source['metrics']['floor_mode'], 'reservation': 'existing-facility-footprint',
        'blueprint': 'restored-authored-rest-facilities', 'deckTiles': [], 'frames': frames,
        'note': 'User-requested existing artwork adoption. Existing simulation use behavior retained.'
    }
    proof[fid] = {'sourcePackage': package, 'physicalRotations': rotation, 'sourceMetrics': source['metrics'],
        'sourceBlendSha256': source['outputs']['B']['blend']['sha256'],
        'sourceVisualReview': json.loads((source_dir / 'visual-review.json').read_text()),
        'currentAuthorization': '2026-09-19: user requested applying the remaining nine existing artworks',
        'nativePixelsUnchanged': True, 'footprintUnchanged': fid == source_id, 'newConstructionVariant': fid != source_id,
        'legacyId': source_id, 'legacySize': [defs[source_id]['w'], defs[source_id]['d']]}
(base / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1)+'\n')
(base / 'rest-facility-provenance.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n')
print('Applied',list(proof))
