// Owned-dump operations: add (with validation), remove, download single, export-all zip.

import { getAllOwned, putOwned, deleteOwned } from './db.js';
import { parseDump, safeName, RAW_SIZE } from './amiibo.js';

// In-memory mirror of the collection store, keyed by id, for fast lookups during render.
let owned = new Map();

export async function loadCollection() {
  const records = await getAllOwned();
  owned = new Map(records.map((r) => [r.id, r]));
  return owned;
}

export function isOwned(id) {
  return owned.has(id);
}

export function getOwned(id) {
  return owned.get(id);
}

export function ownedCount() {
  return owned.size;
}

// Records that didn't match any catalog entry.
export function unknownDumps(catalogIds) {
  const result = [];
  for (const rec of owned.values()) {
    if (!catalogIds.has(rec.id)) result.push(rec);
  }
  return result;
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Add a single dropped file. Returns { ok, id?, filename, error? }.
export async function addDump(file) {
  try {
    const buffer = await readFileAsArrayBuffer(file);
    const { id, head, tail, bytes } = parseDump(buffer);
    const record = { id, head, tail, filename: file.name, bytes, addedAt: Date.now() };
    await putOwned(record);
    owned.set(id, record);
    return { ok: true, id, filename: file.name };
  } catch (err) {
    return { ok: false, filename: file.name, error: err.message };
  }
}

export async function removeDump(id) {
  await deleteOwned(id);
  owned.delete(id);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Download a single owned dump as a raw 540-byte .bin named {character}_{head}{tail}.bin.
export function downloadDump(id, entry) {
  const rec = owned.get(id);
  if (!rec) return;
  const raw = rec.bytes.subarray(0, RAW_SIZE); // ChameleonUltra wants exactly 540 bytes
  const character = entry ? safeName(entry.character || entry.name) : 'amiibo';
  const filename = `${character}_${rec.head}${rec.tail}.bin`;
  triggerDownload(new Blob([raw], { type: 'application/octet-stream' }), filename);
}

// Export every owned dump as a .zip with a README.txt manifest.
// `byId` maps an id -> catalog entry (may be undefined for unknown dumps).
export async function exportAll(byId) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip failed to load (CDN unreachable). Connect to the internet once and reload.');
  }
  if (owned.size === 0) {
    throw new Error('Your collection is empty — drop some .bin dumps first.');
  }

  const zip = new JSZip();
  const lines = [
    'Amiibo dumps exported from AmiiboDex',
    `Generated: ${new Date().toISOString()}`,
    `Count: ${owned.size}`,
    '',
    'These are raw NTAG215 .bin files. Load into a ChameleonUltra MFU/NTAG slot.',
    '',
    'Filename | Amiibo | ID (head+tail)',
    '-------- | ------ | --------------',
  ];

  const usedNames = new Set();
  for (const rec of owned.values()) {
    const entry = byId.get(rec.id);
    const character = entry ? safeName(entry.character || entry.name) : 'unknown';
    let filename = `${character}_${rec.head}${rec.tail}.bin`;
    // Guard against collisions just in case.
    let n = 2;
    while (usedNames.has(filename)) filename = `${character}_${rec.head}${rec.tail}_${n++}.bin`;
    usedNames.add(filename);

    zip.file(filename, rec.bytes.subarray(0, RAW_SIZE));
    const label = entry ? entry.name : '(unknown dump)';
    lines.push(`${filename} | ${label} | ${rec.id}`);
  }

  zip.file('README.txt', lines.join('\n') + '\n');
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `amiibodex-collection-${Date.now()}.zip`);
}
