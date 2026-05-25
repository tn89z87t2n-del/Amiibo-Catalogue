// .bin dump parsing/validation + head/tail normalization helpers.
//
// amiibo identity lives in the NTAG215 user memory at bytes 0x54–0x5B (8 bytes):
//   head = 0x54–0x57 (4 bytes)  -> AmiiboAPI `head`
//   tail = 0x58–0x5B (4 bytes)  -> AmiiboAPI `tail`
// We normalize everything to lowercase, no `0x` prefix.

export const VALID_SIZES = [540, 572];
export const ID_OFFSET = 0x54;
export const ID_LENGTH = 8;
export const RAW_SIZE = 540; // bytes we export for ChameleonUltra

// Normalize an AmiiboAPI head/tail value ("0x00010000") to "00010000".
export function normalizeHex(value) {
  return String(value || '').toLowerCase().replace(/^0x/, '');
}

// Build the catalog match key from an amiibo entry.
export function catalogId(entry) {
  return normalizeHex(entry.head) + normalizeHex(entry.tail);
}

function bytesToHex(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

// Parse an ArrayBuffer dump. Throws on invalid size.
// Returns { id, head, tail, bytes (Uint8Array) }.
export function parseDump(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!VALID_SIZES.includes(bytes.length)) {
    throw new Error(`Invalid size: ${bytes.length} bytes (expected 540 or 572).`);
  }
  const head = bytesToHex(bytes.subarray(ID_OFFSET, ID_OFFSET + 4));
  const tail = bytesToHex(bytes.subarray(ID_OFFSET + 4, ID_OFFSET + ID_LENGTH));
  return { id: head + tail, head, tail, bytes };
}

// Format a 16-char id as a spaced hex string for display: "00 01 00 00 02 00 21 02".
export function formatIdDisplay(id) {
  return (id.match(/.{2}/g) || []).join(' ').toUpperCase();
}

// Sanitize a string for use in a filename.
export function safeName(str) {
  return String(str || 'amiibo').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'amiibo';
}
