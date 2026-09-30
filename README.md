# Voices from the Archive

A simple web app for browsing and listening to every narrated episode.
Served with GitHub Pages from this repo.

- `index.html` — the whole app (no build step)
- `episodes.json` — episode metadata + transcripts (append new batches here)
- `audio/` — narration MP3s
- `episode/<id>/index.html` — tiny static share pages (OG tags + redirect into the player)
- `manifest.webmanifest` + root icon PNGs / `og-share.jpg` — install + share previews

To add a batch: drop new MP3s in `audio/`, append records to `episodes.json`,
then regenerate the share pages with `npm run gen:episodes` and commit the output.
