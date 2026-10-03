# Final production notes

The local product was inspected across marketing, authentication, dashboard, templates/editor, catalog, integrations, forms, hosted commerce, subscription controls, analytics, and the read-only assistant. Public route headings are recorded in `assets/discovery.json`. Capture uses a dedicated tenant, a fictional Meadow & Moss brand, Avery Lane, and a seeded catalog. No real orders, customer records, emails, payments, or external subscription changes were used.

Sixteen actual browser takes form the edit. Recordings were captured at 1600 × 900 for workspace shots and 540 × 1000 for hosted shopper shots. They are reframed into 1080p compositions with gentle eased camera movement, layered browser/phone frames, original diagrams, dark forest/sage glows, DM Serif Display headings, and DM Sans captions. An unobtrusive filming cursor follows actual pointer movement and highlights real clicks. Transitions are short dissolves; shortened footage plays forward, and completed states hold.

The launch edit runs 112 seconds. The vertical cut has its own 30-second sequence, mobile framing, and seven narration segments. The silent 12-second hero uses periodic camera motion and UI blends; its first and final compositions match. The hero has no audio track and is encoded for fast-start browser playback.

The original stereo score is 120 BPM with warm pads, arpeggios, bass and restrained synthesized percussion. Neural narration uses the generic Kokoro af_heart voice. Narration stems, score, and ducked mixes are available locally under `assets/audio`. Final AAC mixes target −16 LUFS and −1.5 dBTP using FFmpeg loudness normalization. Captions follow the measured narration phrase durations, with syllable-weighted intra-phrase timing; no word-level forced alignment is claimed.

## Verified product claims and limits

- Shopify sync and Klaviyo connection/export are persistent local sandbox workflows. Export creates a local provider draft; no live campaign was sent.
- HTML email views are browser simulations. Shopper controls are real hosted browser experiences, explicitly labeled hosted fallback.
- HTTP image URLs caused official AMP validation to fail on the product-rich preview. The film therefore makes no AMP-pass or real-email-client claim. The renderer's existing HTTPS fixtures are separately tested; that does not certify a sent email.
- Shopping selected the Family · 60 servings variant, quantity two, then confirmed a sandbox order. Revenue increased by exactly 8,000 cents in the filmed tenant; no payment was collected.
- Subscription delay was reviewed and confirmed. The next delivery changed from October 15 to October 22, 2026.
- A five-star review was received by the sandbox provider. The branching quiz saved a Calm preference, an evening routine, and updated the synthetic profile.
- Analytics include clearly labeled synthetic historical events plus the filmed actions. The assistant is local and rule-based, not a connected generative model.

`assets/verification.json` records database-backed workflow observations. `output/validation.json` records actual exported stream properties, full decoding, caption bounds, loudness, MP4 fast-start, file hashes, and hero seam difference. Contact sheets extracted from the finished files support visual review. Verification does not imply live provider or inbox certification.

## Delivery and GitHub

Finished MP4s, full captured WebMs, and WAV audio stems remain in the local `video-production` delivery directory. They are excluded from Git along with model caches and local databases. The repository contains source, screenshots, captions, licensing, documentation, and validation manifests. A renderer-only clone needs either the local media assets or a fresh capture/audio generation using the documented commands.
