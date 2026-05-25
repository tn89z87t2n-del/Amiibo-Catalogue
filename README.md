# AmiiboDex — Amiibo Catalog & ChameleonUltra Dump Manager

A static, single-page web app for browsing the full amiibo catalog and managing your
own ChameleonUltra / Proxmark NTAG215 dumps — all in the browser, no account, no upload.
Built with vanilla HTML/CSS/JS. **No frameworks, no build step.**

- Browse every amiibo (data from [AmiiboAPI](https://amiiboapi.com/)), cached in
  IndexedDB for offline use.
- Drag & drop your `.bin` dumps anywhere on the page to track your collection.
- Owned amiibos are flagged in the catalog; unrecognized dumps land in an "Unknown dumps"
  section with their raw ID.
- Per-amiibo detail view: artwork, metadata, regional release dates, and the games it
  works in.
- Re-download any dump as a raw 540-byte `.bin`, or **Export all** as a `.zip` with a
  manifest — ready for ChameleonUltra.

> **Your dumps never leave your browser.** They are stored locally in IndexedDB and are
> never uploaded anywhere.

## Screenshot

![AmiiboDex screenshot](docs/screenshot.png)

_(screenshot placeholder)_

## Live demo

**Demo:** _https://your-demo-link-here_ (placeholder)

## Where to get dumps

This tool **does not** provide amiibo dump files. Use dumps of amiibos **you own**,
created with your own hardware:

- An amiibo figure/card contains an **NTAG215** NFC tag (540 bytes of usable data).
- Read/dump it with a **ChameleonUltra**, **Proxmark3**, or a compatible NFC reader and
  save the result as a raw `.bin` file.
- Drop that `.bin` onto AmiiboDex. Valid dumps are 540 or 572 bytes; the amiibo identity
  is read from bytes `0x54–0x5B`.

## Loading a dump into ChameleonUltra

AmiiboDex outputs **raw NTAG215 `.bin` files (540 bytes)** — exactly what the
ChameleonUltra GUI expects. No conversion needed.

1. Download a dump (single amiibo via the detail view, or **Export all** for a zip).
2. Open the ChameleonUltra GUI / client.
3. Load the `.bin` into an **MFU** or **NTAG** slot.

## Run locally

No build step. Either:

```sh
# Option A: simple static server (recommended — IndexedDB/fetch work consistently)
python3 -m http.server
# then open http://localhost:8000
```

```sh
# Option B: just open the file
# open index.html in your browser
```

The catalog is fetched once from AmiiboAPI on first load and cached in IndexedDB; after
that the app works fully offline (the catalog refreshes weekly when online).

## How it works

- `index.html` — markup shell (search, sidebar filters, grid, modals, footer).
- `styles.css` — theming via CSS variables, dark-mode default with toggle.
- `js/db.js` — IndexedDB wrapper (`catalog` + `collection` stores).
- `js/api.js` — AmiiboAPI fetch with weekly cache + offline fallback.
- `js/amiibo.js` — `.bin` parsing/validation and head/tail normalization.
- `js/collection.js` — add/remove dumps, single download, export-all zip (JSZip).
- `js/ui.js` — rendering, filters, search, detail modal, drag & drop, theme, toasts.
- `js/app.js` — bootstrap and orchestration.

[JSZip](https://stuk.github.io/jszip/) is loaded from a CDN for the zip export.

## Credits

- Catalog metadata: [AmiiboAPI](https://amiiboapi.com/)
- amiibo is a trademark of Nintendo. This project is an unaffiliated hobbyist tool.

## License

MIT © Domi
