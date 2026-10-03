"""Download pinned, openly licensed model/fonts; never store authentication data."""
from pathlib import Path
import requests,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
files={
 '.cache/kokoro-v1.0.onnx':'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
 '.cache/voices-v1.0.bin':'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
 'assets/fonts/DM-Sans.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf',
 'assets/fonts/DM-Sans-OFL.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt',
 'assets/fonts/DM-Serif-Display.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf',
 'assets/fonts/DM-Serif-Display-OFL.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/OFL.txt',
 'assets/audio/Kokoro-Model-Apache-2.0.txt':'https://www.apache.org/licenses/LICENSE-2.0.txt',
 'assets/audio/Kokoro-ONNX-LICENSE.txt':'https://raw.githubusercontent.com/thewh1teagle/kokoro-onnx/main/LICENSE'
}
records=[]
for name,url in files.items():
    path=ROOT/name;path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists():
        r=requests.get(url,timeout=120);r.raise_for_status();path.write_bytes(r.content)
    records.append({'file':name,'source':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
    print(f'Available: {name}',flush=True)
(ROOT/'assets/licenses-manifest.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
