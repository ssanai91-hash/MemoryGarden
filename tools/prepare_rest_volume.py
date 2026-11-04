"""Pack existing character views for the lightweight, colored 3D resting body."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / 'chars/manifest.json'
manifest = json.loads(manifest_path.read_text())

def rle(values):
    runs = []
    for value in values:
        if runs and runs[-1] == value and runs[-2] < 65535:
            runs[-2] += 1
        else:
            runs.extend([1, value])
    return runs

for entry in manifest['characters']:
    image = Image.open(ROOT / entry['file']).convert('RGBA')
    palette, colors, views = [0], {}, {}
    width = height = None
    for name in ['front', 'back', 'side']:
        x, y, w, h = entry['frames'][name]
        width, height = w // 2, h // 2
        frame = image.crop((x, y, x+w, y+h)).resize((width, height), Image.Resampling.NEAREST)
        values = []
        for r, g, b, a in frame.getdata():
            if a < 128:
                values.append(0)
                continue
            color = (r << 16) | (g << 8) | b
            if color not in colors:
                colors[color] = len(palette)
                palette.append(color)
            values.append(colors[color])
        views[name] = rle(values)
    foot = entry['frameInfo']['front']['ground']
    head = entry['frameInfo']['front']['head']
    entry['restVolume'] = dict(version=1, size=[width, height, 32],
        unit=entry['actionConversion']['pixelWorldSize']*2,
        foot=[foot[0]/2, foot[1]/2], head=[head[0]/2, head[1]/2],
        palette=palette, views=views)
    assert len(palette) <= 256
    print(entry['id'], f'{width}x{height}x32', len(palette)-1, 'colors')
packed = {}
for entry in manifest['characters']:
    for view, runs in entry['restVolume']['views'].items():
        token = '__volume_'+entry['id']+'_'+view+'__'
        packed[token] = runs
        entry['restVolume']['views'][view] = token
text = json.dumps(manifest, ensure_ascii=False, indent=2)
for token, runs in packed.items():
    text = text.replace(json.dumps(token), json.dumps(runs, separators=(',', ':')))
manifest_path.write_text(text+'\n')
