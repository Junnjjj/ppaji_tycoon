"""Import user-selected native building art without resizing or changing game data.
Usage: python3 tools/assets/adopt-selected-buildings.py /path/to/asset-worktree
"""
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import sys

source = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parents[2]
game = root / 'ppaji'
base = game / 'public/assets/approved-facilities'
manifest_path = base / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
defs = {d['id']: d for d in json.loads((game / 'src/data/facilities.json').read_text())}
review = json.loads((source / 'artifacts/asset-concept-sheets/selected-facilities-current/review-data.json').read_text())
proof = {'source': str(source), 'selection': review['status'], 'facilities': {}}
for asset in review['assets']:
    fid = asset['id']
    selected = source / 'assets/generated/kairo-selected-review-pack' / fid
    selection = json.loads((selected / 'selection.json').read_text())
    original = source / selection['provenance'][0]['source'].lstrip('/')
    contract = json.loads((original.parent / 'contract.resolved.json').read_text())
    scene = json.loads((original.parent / 'scene-check.json').read_text())
    summary = json.loads((original.parent / 'summary.json').read_text())
    w, d = asset['size']
    assert [w, d] == contract['size'] == [defs[fid]['w'], defs[fid]['d']], fid
    assert scene['camera_exact'] and [r['yaw_deg'] for r in scene['rotations']] == [0, 90, 180, 270], fid
    assert summary['clipping'] == 0, fid
    n = contract['logical_size']
    target = contract['camera_target_z_tiles']
    anchor = {'ax': n / 2, 'ay': n / 2 + target * contract['tile_world'] * math.cos(math.pi / 6)}
    frames = {}
    (base / fid).mkdir(exist_ok=True)
    for direction in range(4):
        src = selected / f'native-d{direction}.png'
        digest = hashlib.sha256(src.read_bytes()).hexdigest()
        declared = next(p for p in selection['provenance'] if p['kind'] == 'native' and p['direction'] == direction)
        assert digest == declared['sha256'] == asset['new']['hashes'][direction], fid
        assert struct.unpack('>II', src.read_bytes()[16:24]) == (n, n), fid
        dst = base / fid / src.name
        shutil.copyfile(src, dst)
        frames[f'd{direction}'] = {'file': f'{fid}/{src.name}', 'w': n, 'h': n, 'sha256': digest}
    manifest['facilities'][fid] = {
        'name': defs[fid]['name'], 'renderOnly': True, 'cameraTargetZTiles': target,
        'size': [w, d], 'artSize': [w, d], 'footprintOrigin': [-w/2, -d/2],
        'footprintCenter': [0, 0], 'logicalSize': n, 'anchor': anchor,
        'deckTopZ': 0, 'humanOpaquePx': 22,
        'pivotByFacing': [[w/2,d/2],[d/2,w/2],[w/2,d/2],[d/2,w/2]],
        'footprintByFacing': [[w,d],[d,w],[w,d],[d,w]],
        'entry': [0,0,0], 'exit': [0,0,0], 'landmarks': contract.get('landmarks'),
        'floorMode': contract['floor_mode'], 'reservation': 'existing-facility-footprint',
        'blueprint': 'selected-facilities-current', 'deckTiles': [], 'frames': frames,
        'note': 'Selected building art only; existing simulation access and use behavior preserved.'
    }
    proof['facilities'][fid] = {'selection': selection, 'contract': contract,
        'sourceSummary': summary, 'cameraExact': True, 'rootYawDegrees': [0,90,180,270],
        'sizeUnchanged': True, 'nativePixelsUnchanged': True, 'anchor': anchor}
# System-specific indoor shop shares the selected shop art at the same footprint.
import copy
alias = copy.deepcopy(manifest['facilities']['shop'])
assert [defs['indoor_shop']['w'], defs['indoor_shop']['d']] == alias['size']
alias.update(name=defs['indoor_shop']['name'], visualSource='shop')
manifest['facilities']['indoor_shop'] = alias
proof['aliases'] = {'indoor_shop': 'shop'}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1)+'\n')
(base / 'building-provenance.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n')
print(f'Imported {len(proof["facilities"])} selected buildings / {len(proof["facilities"])*4} native frames')
