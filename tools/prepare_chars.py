#!/usr/bin/env python3
"""Convert a green-screen 2×2 character sheet to a small, foot-aligned pixel atlas."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

def prepare(source, output, height=68, cell=(48,72)):
    image=Image.open(source).convert('RGBA');w,h=image.size;frames=[];report=[]
    for i,name in enumerate(('front','back','side','sit')):
        crop=image.crop(((i%2)*w//2,(i//2)*h//2,((i%2)+1)*w//2,((i//2)+1)*h//2))
        pixels=[]
        for r,g,b,a in crop.getdata():
            if g-r>40 and g-b>40:a=0
            if a and g-r>25 and g-b>25:a=0
            pixels.append((r,g,b,a))
        crop.putdata(pixels);bounds=crop.getchannel('A').getbbox()
        if not bounds:raise ValueError(f'{name}: no foreground')
        crop=crop.crop(bounds);crop=crop.resize((max(1,round(crop.width*height/crop.height)),height),Image.Resampling.BOX)
        crop.putalpha(crop.getchannel('A').point(lambda a:255 if a>=128 else 0));frames.append(crop)
        report.append({'frame':name,'source_bounds':bounds,'height':height,'width':crop.width})
    cw=max(cell[0],max(f.width for f in frames)+4);ch=max(cell[1],height+4);cw=(cw+1)//2*2
    atlas=Image.new('RGBA',(cw*2,ch*2));rects={}
    for i,(entry,frame) in enumerate(zip(report,frames)):
        x=(i%2)*cw+(cw-frame.width)//2;y=(i//2)*ch+ch-2-frame.height
        atlas.alpha_composite(frame,(x,y));rects[entry['frame']]=[(i%2)*cw,(i//2)*ch,cw,ch]
    # One palette for all poses, no dithering. Restore binary alpha after quantization.
    alpha=atlas.getchannel('A');rgb=atlas.convert('RGB');rgb.paste((0,0,0),(0,0),Image.eval(alpha,lambda a:255-a))
    atlas=rgb.quantize(colors=28,method=Image.Quantize.MAXCOVERAGE,dither=Image.Dither.NONE).convert('RGBA');atlas.putalpha(alpha)
    data=[(r,g,b,0 if a and g-r>25 and g-b>25 else a) for r,g,b,a in atlas.getdata()];atlas.putdata(data)
    green=sum(1 for r,g,b,a in data if a and g-r>25 and g-b>25)
    if green:raise ValueError('green pixels remain')
    output.parent.mkdir(parents=True,exist_ok=True);atlas.save(output,optimize=True)
    result={'frames':rects,'size':[atlas.width,atlas.height],'feet_baseline':ch-2,'report':report,'height_spread':max(x['height'] for x in report[:3])-min(x['height'] for x in report[:3]),'green_pixels':green,'visible_colors':len({(r,g,b) for r,g,b,a in data if a}),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':output.stat().st_size}
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--report',type=Path);a=p.parse_args();r=prepare(a.source,a.output)
    if a.report:a.report.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(r,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
