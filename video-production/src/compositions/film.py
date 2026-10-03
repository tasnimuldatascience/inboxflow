"""Directed compositions over authentic footage. Nothing here simulates product actions."""
from pathlib import Path
from functools import lru_cache
import json, math
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
TIMELINE=json.loads((ROOT/'src/compositions/timeline.json').read_text(encoding='utf-8'))
MANIFEST=json.loads((ROOT/'assets/capture-manifest.json').read_text(encoding='utf-8'))['shots']
FPS=30
CREAM='#fafbf6'; LIME='#d5ed9b'; FOREST='#102e27'; MUTED='#a4b8a6'
cv2.setNumThreads(1)

def smooth(x):
    x=min(1,max(0,x)); return x*x*(3-2*x)

@lru_cache(maxsize=160)
def font(size,serif=False):
    f=ImageFont.truetype(str(ROOT/('assets/fonts/DM-Serif-Display.ttf' if serif else 'assets/fonts/DM-Sans.ttf')),size)
    if not serif:
        try:f.set_variation_by_axes([14,650])
        except (ValueError,OSError):pass
    return f

def text(image,xy,value,size=40,color=CREAM,serif=False,spacing=1.08,align='left'):
    d=ImageDraw.Draw(image)
    for j,line in enumerate(value.split('\n')):
        x,y=xy
        if align=='center':x-=d.textlength(line,font=font(size,serif))/2
        d.text((round(x),round(y+j*size*spacing)),line,font=font(size,serif),fill=color,stroke_width=0)

def wrap(value,size,width):
    d=ImageDraw.Draw(Image.new('RGB',(1,1))); lines=[]; current=''
    for word in value.split():
        test=(current+' '+word).strip()
        if d.textlength(test,font=font(size))>width and current:lines.append(current);current=word
        else:current=test
    return '\n'.join(lines+[current])

@lru_cache(maxsize=4)
def backdrop(w,h):
    yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
    glow=np.exp(-(((xx-w*.76)/(w*.60))**2+((yy-h*.54)/(h*.75))**2)*2)
    glow2=np.exp(-(((xx-w*.10)/(w*.35))**2+((yy-h*.98)/(h*.40))**2)*2)
    base=np.zeros((h,w,3),np.float32)+np.array([10,30,25])
    base+=glow[:,:,None]*np.array([20,38,16])+glow2[:,:,None]*np.array([12,24,16])
    return Image.fromarray(np.uint8(np.clip(base,0,255)))

def background(w,h,t):
    im=backdrop(w,h).copy();d=ImageDraw.Draw(im)
    shift=12*math.sin(t*.28)
    d.arc((w*.25+shift,-h*.65,w*1.45+shift,h*1.25),65,245,fill='#274337',width=2)
    d.arc((-w*.45,-h*.1,w*.85,h*1.65),265,345,fill='#213e32',width=2)
    return im

@lru_cache(maxsize=40)
def still(name):return Image.open(ROOT/f'assets/screenshots/{name}.png').convert('RGB')

class Footage:
    def __init__(self):self.readers={}
    def frame(self,name,t):
        shot=MANIFEST[name]
        if name not in self.readers:
            cap=cv2.VideoCapture(str(ROOT/shot['file']))
            assert cap.isOpened(),name
            self.readers[name]=[cap,-1,None,cap.get(cv2.CAP_PROP_FPS)]
        record=self.readers[name];cap,last,frame,fps=record
        # A short leader accounts for video capture beginning before page creation.
        target=max(0,round((shot['start']+min(max(t,0),shot['duration']-.12)+.04)*fps))
        if target<last or target-last>12:cap.set(cv2.CAP_PROP_POS_FRAMES,target);last=target-1
        while last<target:
            ok,new=cap.read()
            if not ok:break
            frame=new;last+=1
        assert frame is not None,name
        record[1:3]=[last,frame]
        return Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
    def close(self):
        for record in self.readers.values():record[0].release()

@lru_cache(maxsize=32)
def rounded_mask(w,h,r):
    mask=Image.new('L',(w,h));ImageDraw.Draw(mask).rounded_rectangle((0,0,w-1,h-1),radius=r,fill=255);return mask

def paste_round(dst,src,xy,r=20):dst.paste(src,tuple(map(round,xy)),rounded_mask(src.width,src.height,r))

def cropfit(src,w,h,focus=(.5,.5),zoom=1):
    ratio=w/h;sw,sh=src.size
    cw=min(sw,sh*ratio)/zoom;ch=cw/ratio
    x=min(sw-cw,max(0,sw*focus[0]-cw/2));y=min(sh-ch,max(0,sh*focus[1]-ch/2))
    return src.crop(tuple(map(round,(x,y,x+cw,y+ch)))).resize((w,h),Image.Resampling.LANCZOS)

def logo(im,x,y,size=36,word=True):
    d=ImageDraw.Draw(im);s=size
    d.rounded_rectangle((x,y,x+s,y+s),radius=s*.26,fill=LIME)
    d.rounded_rectangle((x+s*.23,y+s*.31,x+s*.77,y+s*.69),radius=s*.07,outline=FOREST,width=max(2,round(s*.06)))
    d.line([(x+s*.24,y+s*.33),(x+s*.5,y+s*.53),(x+s*.76,y+s*.33)],fill=FOREST,width=max(2,round(s*.05)))
    if word:text(im,(x+s+14,y-3),'inboxflow',round(s*.83))

def browser(im,frame,x,y,w,h,tag='inboxflow / Meadow & Moss',focus=(.5,.44),zoom=1):
    x,y=round(x),round(y);chrome=42;d=ImageDraw.Draw(im)
    d.rounded_rectangle((x-12,y+18,x+w+12,y+h+chrome+24),radius=32,fill='#071a15')
    shell=Image.new('RGB',(w,h+chrome),CREAM);s=ImageDraw.Draw(shell)
    s.rectangle((0,0,w,chrome),fill='#e6eddc')
    for j,c in enumerate(['#98ab90','#b5c4a5','#cfdac2']):s.ellipse((19+j*18,16,28+j*18,25),fill=c)
    text(shell,(w/2,10),tag,17,FOREST,align='center')
    shell.paste(cropfit(frame,w,h,focus,zoom),(0,chrome))
    paste_round(im,shell,(x,y),24)

def phone(im,frame,x,y,w,h,zoom=1):
    x,y=round(x),round(y);d=ImageDraw.Draw(im)
    d.rounded_rectangle((x-17,y-14,x+w+17,y+h+17),radius=50,fill='#061b15',outline='#6c846e',width=2)
    paste_round(im,cropfit(frame,w,h,zoom=zoom),(x,y),35)
    d.rounded_rectangle((x+w*.32,y+10,x+w*.68,y+24),radius=7,fill=FOREST)
    d.rounded_rectangle((x+w*.34,y+h-15,x+w*.66,y+h-9),radius=3,fill='#7e947f')

def pill(im,xy,value,size=22):
    d=ImageDraw.Draw(im);f=font(size);w=d.textlength(value,font=f)+34;x,y=xy
    d.rounded_rectangle((x,y,x+w,y+size+24),radius=(size+24)/2,fill='#263f31',outline='#53694d',width=1)
    text(im,(x+17,y+9),value,size,LIME)

def diagram(im,t,vertical=False):
    progress=smooth(t/2)
    d=ImageDraw.Draw(im)
    names=[('Shopify','Sandbox catalog'),('InboxFlow','Visual editor'),('Klaviyo','Sandbox draft'),('Preview','HTML simulation')]
    for i,(name,description) in enumerate(names):
        x=150+i*435;y=440+round(24*(1-smooth((t-i*.2)/.6)))
        d.rounded_rectangle((x,y,x+310,y+210),radius=28,fill='#243e31',outline='#5f7756',width=2)
        text(im,(x+30,y+34),f'0{i+1}',26,LIME)
        text(im,(x+30,y+83),name,42)
        text(im,(x+30,y+145),description,24,MUTED)
        if i<3:
            end=x+427;cy=y+105
            d.line((x+324,cy,end,cy),fill='#80976b',width=3)
            dot=x+324+(end-x-324)*((t*.7-i*.12)%1)
            d.ellipse((dot-5,cy-5,dot+5,cy+5),fill=LIME)
            d.line([(end-12,cy-8),(end,cy),(end-12,cy+8)],fill=LIME,width=3)
    text(im,(960,762),'A local demo. No campaign sent.',27,MUTED,align='center')

def active(t,which):
    return next((s for s in TIMELINE[which] if s['start']<=t<s['end']),TIMELINE[which][-1])

class Film:
    def __init__(self):
        self.footage=Footage()
        self.cues={key:json.loads((ROOT/f'assets/audio/captions-{key}.json').read_text(encoding='utf-8')) for key in ['main','social']}
    def caption(self,im,t,which):
        cue=next((c for c in self.cues[which] if c['start']<=t<c['end']),None)
        if not cue:return
        vertical=which=='social';w,h=im.size;size=48 if vertical else 34
        value=wrap(cue['text'],size,w-(150 if vertical else 300))
        lines=value.count('\n')+1;top=h-(250 if vertical else 118)-size*(lines-1)
        d=ImageDraw.Draw(im)
        bbox=d.multiline_textbbox((0,0),value,font=font(size),spacing=8)
        width=min(w-90,bbox[2]+50)
        d.rounded_rectangle(((w-width)/2,top-8,(w+width)/2,top+lines*size*1.12+18),radius=16,fill='#071b16')
        text(im,(w/2,top),value,size,align='center')
    def scene(self,t,which,shot=None):
        vertical=which=='social';w,h=(1080,1920) if vertical else (1920,1080)
        shot=shot or active(t,which);local=max(0,t-shot['start']);length=shot['end']-shot['start'];p=min(1,local/length)
        im=background(w,h,t);d=ImageDraw.Draw(im);kind=shot['kind']
        enter=smooth(local/.55);dy=round(24*(1-enter))
        if kind in ('type','close'):
            logo(im,75 if vertical else 120,90,50 if vertical else 42)
            pill(im,((80 if vertical else 120),(380 if vertical else 265)),shot['label'],22)
            size=91 if vertical else 125
            text(im,(80 if vertical else 120,515+dy if vertical else 372+dy),shot['title'],size,serif=True,spacing=1.04)
            if kind=='close':
                text(im,(82 if vertical else 124,855 if vertical else 712),'Interactive email.\nThoughtful next steps.' if vertical else 'Interactive email. Thoughtful next steps.',34 if vertical else 37,MUTED)
                pill(im,(82 if vertical else 124,1120 if vertical else 828),'localhost:3000',28)
                if not vertical:
                    frame=still('shopping-after');phone(im,frame,1350+10*math.sin(local*.5),227,365,676)
                else:
                    d.line((82,1390,998,1390),fill='#4c634b',width=2)
                    text(im,(82,1422),'Local demo · fictional brand',25,MUTED)
            else:
                text(im,(124,810),'FROM AN OPEN → TO A NEXT STEP',25,LIME)
        elif vertical:
            logo(im,80,82,39)
            text(im,(80,206),shot['label'],22,LIME)
            text(im,(80,265+dy),shot['title'],82,serif=True,spacing=1.03)
            if kind=='email':
                frame=still('email-html-preview')
                browser(im,frame,150,650+dy,780,760,'HTML email preview · simulation',zoom=1.02+.04*p)
                pill(im,(180,1480),'Real product UI. New possibilities.',24)
            else:
                record=MANIFEST[shot['clip']];offset=shot.get('from',0)
                frame=self.footage.frame(shot['clip'],offset+p*max(0,shot.get('to',record['duration']-.15)-offset))
                if kind=='phone':phone(im,frame,205,628+dy,670,1005)
                else:
                    if shot['clip']=='builder':frame=frame.crop((280,150,1290,895))
                    elif shot['clip']=='analytics':frame=frame.crop((250,135,1490,850))
                    else:frame=frame.crop((260,170,1400,850))
                    browser(im,frame,85,655+dy,910,860,'InboxFlow · local demo',zoom=1.01+.03*p)
        elif kind=='phone':
            text(im,(120,173),shot['label'],24,LIME)
            text(im,(120,300+dy),shot['title'],100,serif=True,spacing=1.02)
            text(im,(125,615+dy),shot.get('detail',''),37,MUTED,spacing=1.24)
            pill(im,(125,800),'Meadow & Moss / Avery Lane',24)
            record=MANIFEST[shot['clip']];offset=shot.get('from',0)
            frame=self.footage.frame(shot['clip'],offset+p*max(0,record['duration']-offset-.15))
            phone(im,frame,1230+8*math.sin(p*math.pi),138+dy,425,787)
        elif kind=='email':
            text(im,(120,173),shot['label'],24,LIME)
            title=shot['title']
            if '\n' not in title:title=wrap(title,94,970)
            text(im,(120,298+dy),title,94,serif=True,spacing=1.06)
            text(im,(124,667),'Meadow & Moss\nYour next daily ritual.',35,MUTED,spacing=1.2)
            frame=still('email-html-preview')
            browser(im,frame,1170,185+dy,590,650,'HTML email preview · simulation',focus=(.52,.5),zoom=1.02+.05*p)
            pill(im,(124,823),'From the inbox to a hosted experience',23)
        elif kind=='diagram':
            text(im,(120,95),shot['label'],24,LIME)
            text(im,(120,160+dy),shot['title'],71,serif=True)
            diagram(im,local)
        elif kind=='fallback':
            text(im,(120,95),shot['label'],24,LIME)
            text(im,(120,170+dy),shot['title'],76,serif=True,spacing=1.06)
            for x,name,description in [(180,'Email preview','HTML simulation'),(1060,'Hosted experience','Real browser actions')]:
                d.rounded_rectangle((x,480,x+680,715),radius=30,fill='#2b4434',outline='#69815a',width=2)
                text(im,(x+38,523),name,52)
                text(im,(x+40,615),description,29,LIME)
            d.line((890,594,1020,594),fill=LIME,width=4)
            d.line([(1004,582),(1020,594),(1004,606)],fill=LIME,width=4)
        else:
            text(im,(120,63),shot['label'],22,LIME)
            text(im,(120,110+dy),shot['title'],65,serif=True)
            record=MANIFEST[shot['clip']]
            offset=shot.get('from',0)
            frame=self.footage.frame(shot['clip'],offset+p*max(0,shot.get('to',record['duration']-.15)-offset))
            focus=(.5,.43);zoom=1.015+.035*smooth(p)
            if shot['clip']=='integrations':frame=frame.crop((205,110,1570,820));focus=(.5,.42)
            if shot['clip']=='catalog' and p>.54:focus=(.52,.50);zoom=1.13+.07*smooth((p-.54)/.46)
            if shot['clip']=='assistant':frame=frame.crop((240,135,1575,900));focus=(.5,.43)
            browser(im,frame,180,230+dy,1560,660,focus=focus,zoom=zoom)
        if kind not in ('type','close'):
            text(im,(80 if vertical else 120,h-58), 'INBOXFLOW  /  MORE THAN A CLICK',18,MUTED)
            if not vertical:text(im,(1750,h-58),f'{int(t):02d} / 112',18,MUTED)
        return im
    def frame(self,t,which):
        shot=active(t,which);im=self.scene(t,which,shot)
        # Twelve-frame dissolve. The outgoing frame holds; actions never reverse.
        if shot['start']>0 and t-shot['start']<.4:
            previous=active(shot['start']-.01,which)
            old=self.scene(shot['start']-.01,which,previous)
            im=Image.blend(old,im,smooth((t-shot['start'])/.4))
        self.caption(im,t,which)
        return im
    def hero(self,t):
        # Periodic motion and blends give the same composition at both ends.
        phase=2*math.pi*t/12
        im=background(1920,1080,0);d=ImageDraw.Draw(im)
        logo(im,105,88,44)
        text(im,(108,295),'Create.\nInvite action.\nLearn.',89,serif=True,spacing=1.06)
        pill(im,(112,725),'Interactive email, thoughtfully.',22)
        layers=[];weights=[]
        for i,name in enumerate(['builder-after','analytics-before','shopping-after']):
            angle=phase-i*2*math.pi/3;weight=math.exp(4*math.cos(angle));weights.append(weight)
            layer=im.copy();source=still(name)
            x=855+round(14*math.sin(phase));y=180+round(12*(1-math.cos(phase)))
            if name=='shopping-after':phone(layer,source,x+320,y,370,686)
            else:browser(layer,source,x,y,940,670,focus=(.52,.43),zoom=1.07+.02*math.sin(phase))
            layers.append(np.asarray(layer,dtype=np.float32))
        pixels=sum(a*(weight/sum(weights)) for a,weight in zip(layers,weights))
        return Image.fromarray(np.uint8(np.clip(pixels,0,255)))
