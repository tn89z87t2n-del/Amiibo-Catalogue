// AmiiboAPI fetch + weekly cache. Falls back to the IndexedDB cache when offline
// or when the network request fails.

import { getCatalog, putCatalog } from './db.js';

const API_URL = 'https://amiiboapi.com/api/amiibo/';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Returns { amiibo: [...], source: 'network'|'cache', fetchedAt }.
// `onStatus(msg)` is an optional callback for UI loading text.
export async function loadCatalog(onStatus = () => {}) {
  const cached = await getCatalog();
  const fresh = cached && Date.now() - cached.fetchedAt < WEEK_MS;

  // Serve fresh cache immediately, no network needed.
  if (fresh) {
    return { amiibo: cached.amiibo, source: 'cache', fetchedAt: cached.fetchedAt };
  }

  // Stale or missing: try the network, fall back to whatever cache we have.
  if (navigator.onLine !== false) {
    try {
      onStatus('Fetching the amiibo catalog…');
      const res = await fetch(API_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const amiibo = Array.isArray(json.amiibo) ? json.amiibo : [];
      if (!amiibo.length) throw new Error('Empty catalog response');
      await putCatalog(amiibo);
      return { amiibo, source: 'network', fetchedAt: Date.now() };
    } catch (err) {
      if (cached) {
        return { amiibo: cached.amiibo, source: 'cache', fetchedAt: cached.fetchedAt, warning: err.message };
      }
      throw new Error(`Could not fetch the catalog and no cache is available (${err.message}).`);
    }
  }

  if (cached) {
    return { amiibo: cached.amiibo, source: 'cache', fetchedAt: cached.fetchedAt };
  }
  throw new Error('You are offline and the catalog has not been cached yet.');
}
