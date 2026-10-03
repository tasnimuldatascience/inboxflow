"""Render the editable Python timeline to H.264 MP4, then mux normalized audio."""
from pathlib import Path
import argparse,json,sys,subprocess,time
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src/compositions'))
from film import Film

parser=argparse.ArgumentParser();parser.add_argument('--only',choices=['main','social','hero','all'],default='all');parser.add_argument('--stills',action='store_true');parser.add_argument('--software',action='store_true');args=parser.parse_args()
OUTPUT=ROOT/'output';CACHE=ROOT/'.cache';OUTPUT.mkdir(exist_ok=True);CACHE.mkdir(exist_ok=True)
film=Film()
formats={'main':(1920,1080,112,'InboxFlow_Launch_1080p.mp4'),'social':(1080,1920,30,'InboxFlow_Social_Vertical.mp4'),'hero':(1920,1080,12,'InboxFlow_Website_Hero.mp4')}
try:
    if args.stills:
        times={'main':[1,4,7,10,20,24,28,36,43,50,55,60,73,79,86,90,97,103,109],'social':[1,6,10,14,17,19,22,24,28],'hero':[0,4,8,12]}
        for which,stamps in times.items():
            for t in stamps:
                image=film.hero(t) if which=='hero' else film.frame(t,which)
                image.save(OUTPUT/f'preview-{which}-{t:03}.jpg',quality=94)
        print('Saved directed preview frames.');sys.exit(0)
    for which,(w,h,duration,filename) in formats.items():
        if args.only not in ['all',which]:continue
        intermediate=CACHE/f'{which}-picture.mp4';frames=duration*30
        codec=['-c:v','libx264','-preset','medium','-crf','19'] if args.software else ['-c:v','h264_nvenc','-preset','p6','-tune','hq','-rc','vbr','-cq','20','-b:v','8M','-maxrate','16M','-bufsize','24M']
        if which=='hero' and not args.software:codec=['-c:v','h264_nvenc','-preset','p6','-rc','vbr','-cq','24','-b:v','2400k','-maxrate','4000k','-bufsize','8000k']
        command=['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r','30','-i','pipe:0','-an',*codec,'-pix_fmt','yuv420p','-profile:v','high','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-g','60','-movflags','+faststart',str(intermediate)]
        log=(CACHE/f'{which}-encode.log').open('w');process=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=log)
        began=time.time()
        try:
            for i in range(frames):
                # Hero end frame meets the first composition exactly.
                t=i*duration/(frames-1) if which=='hero' else i/30
                picture=film.hero(t) if which=='hero' else film.frame(t,which)
                process.stdin.write(picture.tobytes())
                if i%150==0:print(f'{which}: {i}/{frames} frames · {time.time()-began:.1f}s',flush=True)
        finally:process.stdin.close()
        assert process.wait()==0,(CACHE/f'{which}-encode.log').read_text();log.close()
        if which=='hero':
            subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(intermediate),'-map','0:v','-c:v','copy','-an','-metadata','title=InboxFlow website hero — seamless silent loop','-movflags','+faststart',str(OUTPUT/filename)],check=True)
        else:
            caption='InboxFlow_Captions.srt' if which=='main' else 'InboxFlow_Social_Captions.srt'
            subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(intermediate),'-i',str(ROOT/f'assets/audio/mix-{which}.wav'),'-i',str(OUTPUT/caption),'-map','0:v','-map','1:a','-map','2:s','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=7','-c:a','aac','-b:a','192k','-ar','48000','-c:s','mov_text','-metadata:s:s:0','language=eng','-metadata','title=InboxFlow — More than a click','-metadata','comment=Actual local application footage. Synthetic data and sandbox operations. Original score.','-t',str(duration),'-movflags','+faststart',str(OUTPUT/filename)],check=True)
        print(f'EXPORTED {filename} · {duration}s · {(OUTPUT/filename).stat().st_size/1e6:.1f} MB',flush=True)
finally:film.footage.close()
