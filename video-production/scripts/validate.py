"""Verify decoded deliverables, loudness, caption bounds, and hero seam."""
from pathlib import Path
import json, subprocess, re, hashlib
import cv2, numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output'
SPECS={'InboxFlow_Launch_1080p.mp4':(1920,1080,112,3360,True),'InboxFlow_Social_Vertical.mp4':(1080,1920,30,900,True),'InboxFlow_Website_Hero.mp4':(1920,1080,12,360,False)}
results=[]
def run(args):return subprocess.run(args,capture_output=True,text=True,check=True)
for name,(w,h,duration,frames,audio) in SPECS.items():
    path=OUT/name
    probe=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]).stdout)
    video=next(s for s in probe['streams'] if s['codec_type']=='video')
    audios=[s for s in probe['streams'] if s['codec_type']=='audio'];subs=[s for s in probe['streams'] if s['codec_type']=='subtitle']
    assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p'
    assert (video['width'],video['height'])==(w,h)
    assert video['r_frame_rate']=='30/1' and int(video['nb_read_frames'])==frames
    assert abs(float(probe['format']['duration'])-duration)<.09
    assert bool(audios)==audio
    if audio:assert audios[0]['codec_name']=='aac' and audios[0]['sample_rate']=='48000' and audios[0]['channels']==2 and len(subs)==1
    run(['ffmpeg','-hide_banner','-v','error','-i',str(path),'-map','0:v','-map','0:a?','-f','null','-'])
    # Fast-start MP4: moov must precede mdat.
    data=path.read_bytes();assert 0<data.find(b'moov')<data.find(b'mdat')
    entry={'file':name,'durationSeconds':float(probe['format']['duration']),'resolution':[w,h],'fps':30,'decodedFrames':frames,'codec':'H.264','audio':'AAC stereo 48 kHz' if audio else 'No audio stream','sizeMB':round(len(data)/1e6,2),'fullDecode':'PASS','fastStart':True,'sha256':hashlib.sha256(data).hexdigest()}
    if audio:
        meter=run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-']).stderr
        m=json.loads(meter[meter.rfind('{'):meter.rfind('}')+1]);entry['loudness']=m
        assert -17.5<=float(m['input_i'])<=-14.5 and float(m['input_tp'])<0
    cap=cv2.VideoCapture(str(path));images=[]
    stamps=[0,2,10,20,28,36,50,60,73,79,86,90,97,103,109,111] if duration>100 else ([0,1,6,10,14,17,19,22,24,28,29] if audio else [0,2,4,6,8,10,11.96])
    for t in stamps:
        cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,f=cap.read();assert ok
        assert float(np.mean(f))>15,'Unexpected black output frame'
        im=Image.fromarray(cv2.cvtColor(f,cv2.COLOR_BGR2RGB));im.thumbnail((480,300) if w>h else (250,440))
        images.append((t,im))
    cols=4 if w>h else 5;cw,ch=(500,330) if w>h else (270,480);rows=(len(images)+cols-1)//cols
    sheet=Image.new('RGB',(cw*cols,ch*rows),'#fafbf6');d=ImageDraw.Draw(sheet)
    for i,(t,im) in enumerate(images):
        x=i%cols*cw;y=i//cols*ch;sheet.paste(im,(x+10,y+10));d.text((x+12,y+ch-25),f'{name} / {t:g}s',fill='#183d34')
    sheet.save(OUT/name.replace('.mp4','_Contact_Sheet.jpg'),quality=93)
    if not audio:
        cap.set(cv2.CAP_PROP_POS_FRAMES,0);ok,first=cap.read();assert ok
        cap.set(cv2.CAP_PROP_POS_FRAMES,frames-1);ok,last=cap.read();assert ok
        seam=float(np.mean(np.abs(first.astype(np.float32)-last.astype(np.float32))))
        entry['loopSeamMeanAbsoluteChannelDifference']=round(seam,4);assert seam<2
        assert len(data)<8_000_000
    cap.release();results.append(entry)
    print(f'PASS {name}: {duration}s, {frames} decoded frames, {entry["sizeMB"]} MB',flush=True)
for kind,limit in [('main',112),('social',30)]:
    cues=json.loads((ROOT/f'assets/audio/captions-{kind}.json').read_text(encoding='utf-8'))
    previous=0
    for c in cues:
        assert 0<=c['start']<c['end']<=limit and c['start']>=previous-.002
        previous=c['end']
    assert cues
report={'validatedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'results':results,'captionBounds':'PASS','captionMethod':'Phrase timing follows synthesized audio duration; intra-phrase segmentation uses syllable-weighted timing.','productEvidence':json.loads((ROOT/'assets/verification.json').read_text())}
(OUT/'validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('All three playable exports passed stream, decode, frame, caption, loudness, and loop checks.')
