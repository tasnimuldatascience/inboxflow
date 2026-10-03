"""Package the complete editable project and local media without model/cache files."""
from pathlib import Path
import zipfile,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'output/InboxFlow_Source_Project.zip'
files=[]
with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5) as archive:
    for source in sorted(ROOT.rglob('*')):
        if not source.is_file():continue
        relative=source.relative_to(ROOT)
        if '.cache' in relative.parts or '__pycache__' in relative.parts:continue
        if source.suffix in ['.mp4','.zip','.pyc'] or source.name.startswith('preview-') or source.name=='source-bundle-manifest.json':continue
        if source.name.endswith(('-tempo-input.wav','-tempo.wav')) or source.name=='voice-probe.wav':continue
        archive.write(source,Path('video-production')/relative)
        files.append(str(relative).replace('\\','/'))
print(f'Bundled {len(files)} project files, including authentic WebM footage and WAV stems: {path.stat().st_size/1e6:.1f} MB')
(ROOT/'output/source-bundle-manifest.json').write_text(json.dumps({'file':path.name,'sizeBytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'files':files},indent=2),encoding='utf-8')
