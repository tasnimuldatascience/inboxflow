# InboxFlow — More than a click

An editable film project made from real browser recordings of the running InboxFlow application. All demonstrated customer and provider activity belongs to the dedicated synthetic Meadow & Moss tenant. Product source code was not rebuilt for filming.

| Export | Duration | Picture | Sound |
| --- | --- | --- | --- |
| `output/InboxFlow_Launch_1080p.mp4` | 112 seconds | 1920 × 1080, H.264, 30 fps | Narration, original score, captions |
| `output/InboxFlow_Social_Vertical.mp4` | 30 seconds | 1080 × 1920, H.264, 30 fps | Separate timed narration, score, large captions |
| `output/InboxFlow_Website_Hero.mp4` | 12 seconds | 1920 × 1080, H.264, 30 fps | Silent, periodic loop |

The output MP4s, captured WebMs, and WAV stems are local delivery files excluded from Git. Screenshots, source compositions, captions, documentation, licenses, fixture manifests, and verification results are checked in. The 300 MB narration model is a rebuildable cache. See [production notes](docs/production-notes.md), [storyboard](docs/storyboard.md), [narration](docs/narration.md), and [asset licensing](docs/licenses.md).

## Source project and render

The source project is `project.json` plus `src/compositions/timeline.json` and `src/compositions/film.py`. The Python compositor reads the actual captured footage, draws original motion graphics, and pipes full-resolution frames to FFmpeg. The production encoder is NVIDIA H.264; `--software` uses libx264 on machines without NVIDIA hardware.

```powershell
python -m pip install -r video-production/requirements.txt
python video-production/scripts/download-assets.py
python video-production/scripts/audio.py
python video-production/scripts/render.py --stills
python video-production/scripts/render.py
python video-production/scripts/validate.py
```

FFmpeg and FFprobe must be on PATH. A reproducible render also requires the local delivery footage, or a new capture. Edit shots in the JSON timeline, narration in `project.json`, motion/framing in `film.py`, and score/mixing in `audio.py`. Caption text is burned into the launch and social pictures; English selectable subtitle tracks and separate SRTs are also provided.

## Record the product again

Use the documented running local web/API plus PostgreSQL stack. Set `DATABASE_URL` to the local database, then run `pnpm exec tsx video-production/scripts/seed-film.ts`. That script recreates only its named filming fixture after checking its fixture marker; it does not reset other organizations.

Supply `INBOXFLOW_DEMO_EMAIL` and `INBOXFLOW_DEMO_PASSWORD` through environment variables using the demo account in the root README, then run `node video-production/scripts/capture.mjs`. Logins, cookies, CSRF, and recipient tokens remain in memory. Use `--resume` only for that same fixture and an incomplete capture. A completed capture can be resumed for verification and a clean HTML still without repeating completed customer actions.

Recorded actions are local and synthetic. Do not point this capture at production. The film identifies hosted fallback, HTML preview simulation, local providers, and the rule-based assistant. Rich AMP images fail validation on this HTTP origin, so the film does not claim a verified live AMP inbox or production delivery.

For a website loop, use `autoplay muted loop playsinline` and a static poster. Do not impose autoplay sound; the hero contains no audio stream.
