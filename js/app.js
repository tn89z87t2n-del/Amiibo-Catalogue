// Bootstrap: load catalog + collection, wire UI handlers, drag&drop, export.

import { loadCatalog } from './api.js';
import { loadCollection, addDump, exportAll } from './collection.js';
import * as ui from './ui.js';

const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

async function main() {
  try {
    await loadCollection();

    const result = await loadCatalog((msg) => { loadingText.textContent = msg; });
    loadingEl.hidden = true;

    ui.init(result.amiibo, {
      onCollectionChange: () => ui.render(),
    });

    if (result.source === 'cache') {
      ui.toast(result.warning
        ? 'Showing cached catalog (network update failed).'
        : 'Showing cached catalog (offline-ready).', 'info');
    }
  } catch (err) {
    loadingEl.innerHTML = `<p class="loading__error">⚠ ${escapeText(err.message)}</p>
      <button class="btn" onclick="location.reload()">Retry</button>`;
    return;
  }

  // Drag & drop -> add dumps.
  ui.setDropHandler(handleFiles);

  // Export all.
  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      await exportAll(ui.getById());
      ui.toast('Exported your collection as a .zip.', 'success');
    } catch (err) {
      ui.toast(err.message, 'warn');
    }
  });
}

async function handleFiles(files) {
  const bins = files.filter((f) => /\.bin$/i.test(f.name) || f.size === 540 || f.size === 572);
  const skipped = files.length - bins.length;
  if (skipped > 0) ui.toast(`Ignored ${skipped} non-.bin file${skipped > 1 ? 's' : ''}.`, 'warn');
  if (bins.length === 0) return;

  let added = 0;
  let matched = 0;
  const failures = [];
  const catalogIds = ui.getCatalogIds();

  for (const file of bins) {
    const res = await addDump(file);
    if (res.ok) {
      added++;
      if (catalogIds.has(res.id)) matched++;
    } else {
      failures.push(`${file.name}: ${res.error}`);
    }
  }

  ui.render();

  if (added > 0) {
    const unknown = added - matched;
    let msg = `Added ${added} dump${added > 1 ? 's' : ''}`;
    if (unknown > 0) msg += ` (${unknown} unmatched)`;
    ui.toast(msg + '.', 'success');
  }
  for (const f of failures) ui.toast(f, 'warn');
}

function escapeText(str) {
  return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

main();
