"""Local neural narration and an original, sample-free electronic score."""
from pathlib import Path
import json, re, hashlib, math
import subprocess
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt
from scipy.ndimage import uniform_filter1d
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / "project.json").read_text(encoding="utf-8"))
SR = 48000
ASSETS = ROOT / "assets/audio"
ASSETS.mkdir(parents=True, exist_ok=True)
model = Kokoro(str(ROOT / ".cache/kokoro-v1.0.onnx"), str(ROOT / ".cache/voices-v1.0.bin"))

def voice(text, name, available):
    samples, rate = model.create(text.replace("InboxFlow", "Inbox Flow"), voice="af_heart", speed=0.96, lang="en-us")
    duration = len(samples) / rate
    if duration > available:
        speed = 0.96 * duration / available * 1.025
        samples, rate = model.create(text.replace("InboxFlow", "Inbox Flow"), voice="af_heart", speed=speed, lang="en-us")
        duration = len(samples) / rate
    if duration > available:
        temporary=ASSETS/f"voice-{name}-tempo-input.wav"
        sf.write(temporary,samples,rate,subtype="PCM_24")
        subprocess.run(["ffmpeg","-y","-hide_banner","-loglevel","error","-i",str(temporary),"-af",f"atempo={duration/available*1.01}",str(ASSETS/f"voice-{name}-tempo.wav")],check=True)
        samples,rate=sf.read(ASSETS/f"voice-{name}-tempo.wav",dtype="float32")
        duration=len(samples)/rate
    assert duration <= available + .05, (name, duration, available)
    samples = samples.astype(np.float32)
    peak = np.max(np.abs(samples))
    if peak: samples *= min(.88 / peak, 2.0)
    sf.write(ASSETS / f"voice-{name}.wav", samples, rate, subtype="PCM_24")
    print(f"Narration {name}: {duration:.2f}s / {available:.2f}s window", flush=True)
    return resample_poly(samples, SR, rate).astype(np.float32), duration

def cue_groups(text, max_chars=68):
    words = text.replace("Inbox Flow", "InboxFlow").split()
    groups, current = [], []
    for word in words:
        if current and (len(" ".join(current + [word])) > max_chars or current[-1].endswith((".", "?", ";"))):
            groups.append(" ".join(current)); current=[]
        current.append(word)
    if current: groups.append(" ".join(current))
    return groups

def weight(text):
    return sum(max(1,len(re.findall(r"[aeiouy]+",word.lower())))+.55 for word in text.split())

def captions(text, start, duration, max_chars=68):
    groups=cue_groups(text,max_chars)
    total=sum(weight(g) for g in groups)
    cursor=start
    result=[]
    for group in groups:
        length=duration*weight(group)/total
        result.append({"start":round(cursor,3),"end":round(cursor+length,3),"text":group})
        cursor+=length
    return result

def stamp(seconds):
    ms=round(seconds*1000);hours,ms=divmod(ms,3600000);minutes,ms=divmod(ms,60000);seconds,ms=divmod(ms,1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{ms:03}"

def write_srt(path,cues):
    path.write_text("\n\n".join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(cues))+"\n",encoding="utf-8")

total=PROJECT["duration"]
narration=np.zeros(round(total*SR),dtype=np.float32)
all_captions=[]; voice_records=[]
for chapter in PROJECT["chapters"]:
    available=chapter["end"]-chapter["voiceStart"]-.4
    audio,duration=voice(chapter["narration"],chapter["id"],available)
    start=round(chapter["voiceStart"]*SR)
    narration[start:start+len(audio)]+=audio
    all_captions += captions(chapter["narration"],chapter["voiceStart"],duration)
    voice_records.append({"chapter":chapter["id"],"start":chapter["voiceStart"],"duration":duration,"text":chapter["narration"]})
sf.write(ASSETS/"narration-main.wav",narration,SR,subtype="PCM_24")
write_srt(ROOT/"output/InboxFlow_Captions.srt",all_captions)
(ASSETS/"captions-main.json").write_text(json.dumps(all_captions,indent=2),encoding="utf-8")
(ASSETS/"voice-timing.json").write_text(json.dumps(voice_records,indent=2),encoding="utf-8")

# Original score: A minor / F major / C major / G suspended. No sampled music.
rng=np.random.default_rng(20261003)
music=np.zeros((round(total*SR),2),dtype=np.float32)
def add(signal,start,level=.1,pan=0):
    first=round(start*SR)
    count=min(len(signal),len(music)-first)
    if count<=0:return
    left=math.sqrt((1-pan)/2);right=math.sqrt((1+pan)/2)
    music[first:first+count,0]+=signal[:count]*level*left
    music[first:first+count,1]+=signal[:count]*level*right

def freq(note):return 440*2**((note-69)/12)
chords=[[57,60,64,71],[53,57,60,64],[48,55,59,62],[55,57,62,67]]
for bar in range(math.ceil(total/8)):
    chord=chords[bar%4]
    t=np.arange(round(9*SR),dtype=np.float32)/SR
    envelope=np.minimum(t/1.3,1)*np.clip((9-t)/1.5,0,1)
    pad=sum(np.sin(2*np.pi*freq(note)*t+.08*np.sin(2*np.pi*.17*t+i))+.16*np.sin(2*np.pi*freq(note)*2.001*t) for i,note in enumerate(chord))/len(chord)
    sidechain=.63+.37*(1-np.exp(-np.mod(t,.5)/.14))
    add(pad*envelope*sidechain,bar*8-.0,.09,(-1)**bar*.12)

for beat in np.arange(8,total-3,.5):
    t=np.arange(round(.42*SR),dtype=np.float32)/SR
    kick=np.sin(2*np.pi*(47*t+95*.018*(1-np.exp(-t/.018))))*np.exp(-t*12)
    add(kick,beat,.29)
    if round((beat-8)/.5)%2:
        noise=rng.normal(0,1,len(t)).astype(np.float32)
        snare=sosfilt(butter(2,[1200,8500],btype="bandpass",fs=SR,output="sos"),noise)
        snare=snare*np.exp(-t*25)+.15*np.sin(2*np.pi*180*t)*np.exp(-t*30)
        add(snare.astype(np.float32),beat,.08,.05)
    chord=chords[int(beat//8)%4]
    bass=np.sin(2*np.pi*freq(chord[0]-12)*t)*np.exp(-t*9)
    add(bass,beat+.24,.13)
for tick in np.arange(8,total-2,.25):
    t=np.arange(round(.08*SR),dtype=np.float32)/SR
    hat=np.diff(rng.normal(0,1,len(t)+1).astype(np.float32))*np.exp(-t*65)
    add(hat,tick,.012,(-1)**round(tick*4)*.25)
for step in np.arange(0,total-2,.5):
    chord=chords[int(step//8)%4]
    note=chord[int(step*2)%4]+12
    t=np.arange(round(.8*SR),dtype=np.float32)/SR
    pluck=(np.sin(2*np.pi*freq(note)*t)+.25*np.sin(2*np.pi*freq(note)*2*t))*np.exp(-t*7.5)*(1-np.exp(-t*110))
    level=.027 if step<8 else .04
    add(pluck,step,level,math.sin(step*.8)*.55)
    add(pluck,step+.375,level*.23,-math.sin(step*.8)*.55)
# Soft original transition sweeps, always below the narrator.
for cut in [8,18,30,48,66,82,92,106]:
    t=np.arange(round(.5*SR),dtype=np.float32)/SR
    noise=rng.normal(0,1,len(t)).astype(np.float32)
    sweep=sosfilt(butter(2,[700,5500],btype="bandpass",fs=SR,output="sos"),noise)*np.sin(np.pi*t/.5)**2
    add(sweep.astype(np.float32),cut-.4,.035,-.12)
    bell=np.sin(2*np.pi*880*t)*np.exp(-t*16)
    add(bell,cut,.035,.12)
time=np.arange(len(music),dtype=np.float32)/SR
fade=np.clip(time/1.8,0,1)*np.clip((total-time)/2.8,0,1)
music*=fade[:,None]
music/=max(1,float(np.max(np.abs(music)))/.66)
sf.write(ASSETS/"Original_InboxFlow_Score.wav",music,SR,subtype="PCM_24")
duck=np.ones(len(music),dtype=np.float32)
for record in voice_records:
    active=(time>=record["start"]-.15)&(time<=record["start"]+record["duration"]+.3)
    duck[active]=.47
# Smooth envelope avoids audible gain steps.
duck=uniform_filter1d(duck,size=round(SR*.08),mode="nearest").astype(np.float32)
mix=music*duck[:,None]*.62+narration[:,None]*.92
mix=np.tanh(mix*1.05)/1.05
sf.write(ASSETS/"mix-main.wav",mix,SR,subtype="PCM_24")

social_voice=np.zeros(30*SR,dtype=np.float32)
social_cues=[]
for i, segment in enumerate(PROJECT["socialSegments"]):
    social_audio,social_duration=voice(segment["text"],f"social-{i+1}",segment["end"]-segment["start"]-.15)
    start=round(segment["start"]*SR)
    social_voice[start:start+len(social_audio)]=social_audio
    social_cues+=captions(segment["text"],segment["start"],social_duration,43)
sf.write(ASSETS/"narration-social.wav",social_voice,SR,subtype="PCM_24")
write_srt(ROOT/"output/InboxFlow_Social_Captions.srt",social_cues)
(ASSETS/"captions-social.json").write_text(json.dumps(social_cues,indent=2),encoding="utf-8")
social_music=music[8*SR:38*SR].copy()
social_fade=np.clip(np.arange(30*SR)/SR/.4,0,1)*np.clip((30-np.arange(30*SR)/SR)/1.2,0,1)
social_mix=social_music*.30*social_fade[:,None]+social_voice[:,None]*.92
sf.write(ASSETS/"mix-social.wav",np.tanh(social_mix),SR,subtype="PCM_24")

narration_doc="# Narration — More than a click\n\nVoice: locally synthesized Kokoro af_heart; no voice impersonation.\n\n"+"\n\n".join(f"## {c['start']:g}–{c['end']:g}s / {c['id']}\n\n{c['narration']}" for c in PROJECT["chapters"])+"\n\n## Vertical edit\n\n"+PROJECT["socialNarration"]+"\n"
(ROOT/"docs/narration.md").write_text(narration_doc,encoding="utf-8")
print("Generated narration, original stereo score, ducked mixes, timing manifests, and SRT captions.",flush=True)
