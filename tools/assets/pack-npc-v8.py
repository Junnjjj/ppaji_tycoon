"""Pack the approved V8 composed presets; never recolor or regenerate source art."""
import argparse, json, math, hashlib
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True, help='Approved walk-integrated directory containing manifest.json and preset PNGs')
SRC = parser.parse_args().source.resolve()
if not (SRC / 'manifest.json').is_file():
    parser.error(f'manifest.json not found in {SRC}')
OUT = ROOT / 'public/assets/kairo-npc-v8'
OUT.mkdir(parents=True, exist_ok=True)
m = json.loads((SRC/'manifest.json').read_text())
frames, cells, states = {}, [], {}
for look, path in m['combinations'].items():
    sheet = Image.open(SRC/path).convert('RGBA')
    for state, rects in m['frame_layout']['rows'].items():
        size = math.floor(m['rasterization']['targetCell'] * m.get('displayPoseScale', {}).get(state, 1) + .5)
        contact = m['contacts'][state]
        x, y = [math.floor(a - b * size / 64 + .5) for a,b in zip([20,27], contact)]
        root = [x + contact[0]*size/64, y + contact[1]*size/64]
        states[state] = {'frames':len(rects), 'fps':m['animation']['rows'][state]['fps'], 'origin':[v/40 for v in root]}
        for n,r in enumerate(rects):
            src = sheet.crop((r['x'],r['y'],r['x']+64,r['y']+64)).resize((size,size),Image.Resampling.NEAREST)
            cell = Image.new('RGBA',(40,40)); cell.paste(src,(x,y))
            for mirror in [0,1]:
                name=f'{look}/{state}/{mirror}/{n}'
                index=len(cells); fx=index%48*40; fy=index//48*40
                cells.append(ImageOps.mirror(cell) if mirror else cell)
                frames[name]={'frame':{'x':fx,'y':fy,'w':40,'h':40},'rotated':False,'trimmed':False,'spriteSourceSize':{'x':0,'y':0,'w':40,'h':40},'sourceSize':{'w':40,'h':40}}
atlas=Image.new('RGBA',(1920,math.ceil(len(cells)/48)*40))
for n,c in enumerate(cells): atlas.paste(c,(n%48*40,n//48*40))
atlas.save(OUT/'atlas.png',optimize=True)
(OUT/'atlas.json').write_text(json.dumps({'frames':frames,'meta':{'image':'atlas.png','scale':'1'}},separators=(',',':')))
config={'version':8,'texture':'npc-v8','atlasImage':'assets/kairo-npc-v8/atlas.png','atlasData':'assets/kairo-npc-v8/atlas.json', 'looks':list(m['combinations']), 'states':states,
'poses':{'idle':'idle','walk':'walk','sit':'sit','swim':'swim','float':'waterstand','lie':'lie','ride':'slide'},
'facings':{'+X':{'side':'front','mirror':False},'+Z':{'side':'front','mirror':True},'-X':{'side':'back','mirror':True},'-Z':{'side':'back','mirror':False}},
'sourceManifestSha256':hashlib.sha256((SRC/'manifest.json').read_bytes()).hexdigest(), 'bodyHeight':21}
(ROOT/'src/data/kairo-npc-presentation.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'looks':len(m['combinations']),'frames':len(cells),'atlas':atlas.size}))
