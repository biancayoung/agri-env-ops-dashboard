# Offline operations fonts

These fonts are shared by `/ops`, `/data` and `/admin`. All font requests are local: WOFF2 data is
embedded in `ops.css` so the existing bridge static allowlist needs no changes.
The WOFF2 files here are the canonical build assets; regenerate the CSS block
with the script rather than editing its Base64. No font service is contacted at
runtime. System fallbacks remain available if a font cannot load.

| Family | Role / weights | Upstream source | License |
|---|---|---|---|
| Barlow | Body / 400, 500, 600 | https://github.com/google/fonts/tree/main/ofl/barlow | barlow-OFL.txt |
| Barlow Condensed | Values and identity / 500, 600 | https://github.com/google/fonts/tree/main/ofl/barlowcondensed | barlowcondensed-OFL.txt |
| IBM Plex Mono | Time and provenance / 400 | https://github.com/google/fonts/tree/main/ofl/ibmplexmono | ibmplexmono-OFL.txt |
| Noto Sans SC | Chinese UI / variable 100–900 | https://github.com/google/fonts/tree/main/ofl/notosanssc | notosanssc-OFL.txt |

All four are SIL Open Font License 1.1; full copyright and license texts are
included. Latin fonts retain all glyphs and names; conversion only to WOFF2.
Noto Sans SC is subset **locally** to the non-Latin characters in
`dashboard-b.html`, `dashboard-b-client.js`, `data.html`, `admin.html` and
`farm-connection.js` and `workbench.js`, retaining font metadata.
Received names/messages containing other Chinese characters use installed CJK
system fonts. The subset is UI coverage, not a promise of complete CJK coverage.

Sources retrieved 2026-09-17. `manifest.json` records exact source/output SHA-256
hashes. Upstream filenames match the manifest, except `NotoSansSC-full.ttf` is
upstream `NotoSansSC[wght].ttf`. Source TTF downloads need not be shipped.

To regenerate after changing translated UI copy, put the listed public upstream
TTFs in an ignored local directory, install `fonttools[woff]` in a development
environment, then run from the dashboard directory:

```sh
python3 assets/fonts/embed.py .artifacts/a2-font-sources
```

The script performs no network requests. Runtime Python dependencies and backend
behavior are unaffected. Validate that all UI glyphs are covered after editing
translations. Keep licenses alongside any redistribution of these assets.
