# Strength Trainer 2.0 branding

`st-dumbbell-master.png` is the high-resolution, reference-derived standalone sT/dumbbell artwork used for the header and PWA icons. It was reconstructed from the supplied raster branding board, since no original vector/logo file was supplied. It contains only the purple monogram, dumbbell plates and matte tile; no screen mockup or handwritten signature is included.

Run `bash scripts/generate-brand-icons.sh` from the checkout to reproduce the committed PNG exports. Exporting requires ImageMagick 7; the app and CI consume the checked-in PNGs and do not require ImageMagick.

Exports in `public/`:

- `icon-st-v2-192.png` and `icon-st-v2-512.png`: standard manifest/header icons.
- `icon-st-v2-maskable-512.png`: opaque 512px maskable icon. The artwork is reduced to 410px and centered on the matte background, keeping the essential monogram within the central 80%-diameter safe circle. The decorative rim can be cropped by platform masks.
- `apple-touch-icon-st-v2.png`: opaque 180px iPhone Home Screen artwork.
- `favicon-st-v2-16.png` / `favicon-st-v2-32.png`: PNG favicons.
- `icon-192.png` / `icon-512.png`: updated compatibility copies, keeping old icon URLs valid.

Versioned asset paths encourage icon refresh after deployment. The manifest `id`, `scope`, `start_url`, service-worker scope, application origin and storage keys stay unchanged. App UI branding updates through the existing PWA deployment/update flow. Existing iPhone Home Screen icon caches are controlled by iOS and may retain older artwork even after the app itself updates; clearing app/site data is not part of this update.

`tests/branding.spec.ts` captures the header and full home screen at 320×568, 375×667, 390×844 and 393×852, checks icon dimensions/paths and verifies offline loading with retained workout history, imported plans and an active session. Review snapshots are committed under `docs/screenshots/approved-branding-*`. Browser tests use mobile Chromium emulation, not physical iPhone Safari.
