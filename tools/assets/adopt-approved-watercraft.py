"""Export approved native pixels, masks and contacts; never author or resize art."""
import json, shutil, hashlib, argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--target', type=Path, required=True)
args = parser.parse_args()
source, main = args.source.resolve(), args.target.resolve()
wave = source / 'assets/generated/watercraft-pilots/ppaji-moving-wave-v1'
merge = json.loads((source/'codex-output/ppaji-merge-20260919/merge-map.json').read_text())
target = main/'ppaji/public/assets/approved-watercraft'
target.mkdir(parents=True,exist_ok=True)
manifest = {'revision':1,'equipment':{},'files':{}}
for entry in [e for e in merge['equipment'] if e['ready']] + [{'equipment_id':'tow_work','asset_folder':'tow_work'}]:
    id,folder=entry['equipment_id'],entry['asset_folder']
    src=wave/folder
    spec=json.loads((src/'spec.json').read_text())
    manifest['equipment'][id]=spec
    for rel in ['spec.json']+[f'B/{kind}-h{h:02}.{ext}' for h in range(16) for kind,ext in [('native','png'),('depth','bin')]]:
        dst=target/id/rel; dst.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(src/rel,dst)
        manifest['files'][str(dst.relative_to(target))]=hashlib.sha256(dst.read_bytes()).hexdigest()
(target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copyfile(wave/'depth-origins.json',target/'depth-origins.json')
print(len(manifest['equipment']),len(manifest['files']))

(main/'ppaji/src/data/watercraft-seats.json').write_text(json.dumps({k:v['seats'] for k,v in manifest['equipment'].items()},ensure_ascii=False,indent=2)+'\n')
