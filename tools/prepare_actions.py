#!/usr/bin/env python3
"""Register 48 dedicated action drawings and append them to a walking atlas."""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image,ImageChops

NAMES=([f'{pose}_{d}'for pose in ['standing_pray','pray']for d in ['front','back','side']]
 +[f'bow_{d}_{i}'for d in ['front','back','side']for i in range(6)]
 +['lie','prone','wave_front','wave_back','wave_side','shake_front','shake_back','shake_side','drink_front','drink_back','drink_side','cheers_front','cheers_back','cheers_side','woodpick_side','woodcarry_front','woodcarry_back','woodcarry_side','woodfeed_side','pray2_front','chair_front','chair_back','chair_side','idle_reference'])

def head_bounds(body):
    mask=body.getchannel('A').crop((0,0,body.width,max(1,round(body.height*.4))));pixels=mask.load();seen=set();best=[]
    for yy in range(mask.height):
        for xx in range(mask.width):
            if not pixels[xx,yy]or(xx,yy)in seen:continue
            component=[];stack=[(xx,yy)];seen.add((xx,yy))
            while stack:
                x,y=stack.pop();component.append((x,y))
                for p in[(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                    if 0<=p[0]<mask.width and 0<=p[1]<mask.height and p not in seen and pixels[p[0],p[1]]:seen.add(p);stack.append(p)
            if len(component)>len(best):best=component
    return[min(x for x,y in best),min(y for x,y in best),max(x for x,y in best)+1,max(y for x,y in best)+1]

def prepare(source,base_atlas,base_entry,output):
    image=Image.open(source).convert('RGBA');cells=[]
    red,green,blue,alpha=image.split();key=ImageChops.subtract(green,ImageChops.lighter(red,blue)).point(lambda v:0 if v>25 else 255);image.putalpha(ImageChops.multiply(alpha,key))
    # Generated sheets have clean gutters but rows need not be perfectly equally spaced.
    # Detect the eight occupied row bands so a neighbouring shoe cannot enter a pose.
    rows=[];start=None;mask=image.getchannel('A')
    for y in range(image.height+1):
        occupied=y<image.height and mask.crop((0,y,image.width,y+1)).getbbox()is not None
        if occupied and start is None:start=y
        elif not occupied and start is not None:
            if rows and start-rows[-1][1]<=5:rows[-1]=(rows[-1][0],y)
            else:rows.append((start,y))
            start=None
    if len(rows)!=8:raise ValueError(f'expected 8 clear row bands, got {rows}')
    for i,name in enumerate(NAMES):
        col,row=i%6,i//6;c=image.crop((col*image.width//6,rows[row][0],(col+1)*image.width//6,rows[row][1]));bounds=c.getchannel('A').getbbox()
        if not bounds:raise ValueError('empty '+name)
        cells.append((name,c.crop(bounds)))
    scale=136/cells[-1][1].height
    cw=max(160,max(round(c.width*scale)+12 for _,c in cells));cw=(cw+3)//4*4
    ch=max(144,max(round(c.height*scale)+8 for _,c in cells));baseline=ch-4
    base=Image.open(base_atlas).convert('RGBA');atlas=Image.new('RGBA',(max(base.width,cw*6),base.height+ch*8));atlas.alpha_composite(base)
    entry=json.loads(json.dumps(base_entry));entry['size']=list(atlas.size);entry['frameInfo']={}
    for name,(ox,oy,w,h)in entry['frames'].items():
        bounds=base.crop((ox,oy,ox+w,oy+h)).getchannel('A').getbbox();top=bounds[1];bh=bounds[3]-top
        entry['frameInfo'][name]={'ground':[w/2,entry['feetBaseline']],'top':top,'head':[w/2,top+bh*.2],'hip':[w/2,top+bh*.72],'hand':[w*.7,top+bh*.65]}
    for i,(name,body)in enumerate(cells):
        body=body.resize((round(body.width*scale),round(body.height*scale)),Image.Resampling.BOX);body.putalpha(body.getchannel('A').point(lambda a:255 if a>=128 else 0))
        bw,bh=body.size
        support=.5
        if name.startswith('bow_side_')and name[-1]in'23':support=.25
        if name.startswith(('woodpick','woodfeed')):support=.35
        x=max(4,min(cw-bw-4,round(cw/2-bw*support)));y=baseline-bh
        if x<0 or x+bw>cw:raise ValueError('cell clips '+name)
        ox=i%6*cw;oy=base.height+i//6*ch;atlas.alpha_composite(body,(ox+x,oy+y));entry['frames'][name]=[ox,oy,cw,ch]
        # All points are in local top-origin pixels. Drawings keep one physical pixel scale.
        head=[x+bw*.5,y+bh*.20]
        if name in ['lie','prone']:head=[x+bw*.16,y+bh*.5]
        elif name.startswith('bow_side_')and name[-1]in'23':head=[x+bw*.76,y+bh*.45]
        elif name.startswith('bow_')and name[-1]=='3':head=[x+bw*.5,y+bh*.65]
        elif name.startswith(('woodpick','woodfeed')):head=[x+bw*.7,y+bh*.2]
        hand=[x+bw*.43,y+bh*.35]
        if name.startswith('drink_back'):hand=[x+bw*.85,y+bh*.32]
        elif name.startswith('drink_side'):hand=[x+bw*.85,y+bh*.36]
        elif name.startswith('cheers_front'):hand=[x+bw*.16,y+bh*.39]
        elif name.startswith('cheers_back'):hand=[x+bw*.85,y+bh*.36]
        elif name.startswith('cheers_side'):hand=[x+bw*.88,y+bh*.40]
        elif name.startswith('woodcarry'):hand=[x+bw*(.8 if name.endswith('side')else .5),y+bh*.65]
        elif name.startswith('woodfeed'):hand=[x+bw*.83,y+bh*.65]
        elif name.startswith('woodpick'):hand=[x+bw*.72,y+bh*.80]
        hip=[x+bw*.5,y+bh*.76]
        if name.startswith('chair_side'):hip=[x+bw*.32,y+bh*.74]
        info={'ground':[x+bw*support,baseline],'head':head,'hand':hand,'hip':hip,'top':y}
        if name.startswith(('wave_','shake_'))and not name.endswith('side'):
            left=name.endswith('front');hb=head_bounds(body);cut=x+max(2,hb[0]-2)if left else x+min(bw-2,hb[2]+2);info['head']=[x+(hb[0]+hb[2])/2,y+bh*.2];info['arm']={'cut':cut,'left':left,'pivot':[cut,y+bh*.48]}
        entry['frameInfo'][name]=info
    alpha=atlas.getchannel('A');rgb=atlas.convert('RGB');rgb.paste((0,0,0),(0,0),Image.eval(alpha,lambda a:255-a));atlas=rgb.quantize(colors=128,method=Image.Quantize.MAXCOVERAGE,dither=Image.Dither.NONE).convert('RGBA');atlas.putalpha(alpha)
    data=[(r,g,b,0 if a and g-r>25 and g-b>25 else a)for r,g,b,a in atlas.getdata()];palette=sorted({(r,g,b)for r,g,b,a in data if a});lookup={rgb:i+1 for i,rgb in enumerate(palette)}
    packed=Image.new('P',atlas.size);flat=[0,0,0]+[v for rgb in palette for v in rgb];packed.putpalette(flat+[0]*(768-len(flat)));packed.putdata([lookup[(r,g,b)]if a else 0 for r,g,b,a in data]);packed.save(output,optimize=True,transparency=0)
    digest=hashlib.sha256(source.read_bytes()).hexdigest();entry['revision']='actions-v1-'+digest[:12];entry['actionVersion']=1;entry['actionSource']={'release':'chars-src','filename':entry['id']+'-actions-v1-sheet.png','sha256':digest,'url':'https://github.com/ssanai91-hash/MemoryGarden/releases/download/chars-src/'+entry['id']+'-actions-v1-sheet.png'}
    entry['actionConversion']={'height':136,'colors':len(palette),'greenPixels':0,'frames':48,'pixelWorldSize':2/base_entry['frames']['front'][3]}
    return entry

def main():
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--id',required=True);p.add_argument('--base',type=Path,required=True);p.add_argument('--manifest',type=Path,default=Path('chars/manifest.json'));a=p.parse_args()
    base=json.loads((a.base/'manifest.json').read_text());old=next(c for c in base['characters']if c['id']==a.id);entry=prepare(a.source,a.base/(a.id+'.png'),old,Path(old['file']));m=json.loads(a.manifest.read_text());m['characters']=[entry if c['id']==a.id else c for c in m['characters']];a.manifest.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'id':a.id,'size':entry['size'],'bytes':Path(old['file']).stat().st_size,'source':entry['actionSource'],'conversion':entry['actionConversion']},ensure_ascii=False))
if __name__=='__main__':main()
