// All DOM rendering + interaction: grid, filters, search, detail modal, drag&drop,
// theme toggle, toasts.

import { catalogId, formatIdDisplay } from './amiibo.js';
import { isOwned, getOwned, ownedCount, unknownDumps, downloadDump, removeDump } from './collection.js';

const $ = (sel) => document.querySelector(sel);

// Catalog state held here so re-renders (after collection changes) are cheap.
let catalog = [];
let byId = new Map(); // id -> entry
let catalogIds = new Set();

const filters = { search: '', type: '', amiiboSeries: '', gameSeries: '', ownedOnly: false };

let onCollectionChange = () => {}; // app.js wires this to refresh derived UI

export function init(catalogData, handlers = {}) {
  catalog = catalogData;
  byId = new Map();
  catalogIds = new Set();
  for (const entry of catalog) {
    const id = catalogId(entry);
    catalogIds.add(id);
    // First match wins; AmiiboAPI can repeat head+tail across release regions but
    // entries are otherwise identical for our purposes.
    if (!byId.has(id)) byId.set(id, entry);
  }
  onCollectionChange = handlers.onCollectionChange || (() => {});

  populateFilterOptions();
  bindControls();
  bindDragAndDrop();
  bindModals();
  initTheme();
  render();
}

export function getById() {
  return byId;
}
export function getCatalogIds() {
  return catalogIds;
}

// ---------- Filter option population ----------

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function populateFilterOptions() {
  const types = uniqueSorted(catalog.map((e) => e.type));
  const amiiboSeries = uniqueSorted(catalog.map((e) => e.amiiboSeries));
  const gameSeries = uniqueSorted(catalog.map((e) => e.gameSeries));

  fillSelect('#filter-type', types);
  fillSelect('#filter-amiibo-series', amiiboSeries);
  fillSelect('#filter-game-series', gameSeries);
}

function fillSelect(sel, values) {
  const el = $(sel);
  const frag = document.createDocumentFragment();
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    frag.appendChild(opt);
  }
  el.appendChild(frag);
}

// ---------- Controls ----------

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function bindControls() {
  $('#search').addEventListener('input', debounce((e) => {
    filters.search = e.target.value.trim().toLowerCase();
    render();
  }, 120));

  $('#filter-type').addEventListener('change', (e) => { filters.type = e.target.value; render(); });
  $('#filter-amiibo-series').addEventListener('change', (e) => { filters.amiiboSeries = e.target.value; render(); });
  $('#filter-game-series').addEventListener('change', (e) => { filters.gameSeries = e.target.value; render(); });
  $('#filter-owned').addEventListener('change', (e) => { filters.ownedOnly = e.target.checked; render(); });

  $('#clear-filters').addEventListener('click', () => {
    filters.search = filters.type = filters.amiiboSeries = filters.gameSeries = '';
    filters.ownedOnly = false;
    $('#search').value = '';
    $('#filter-type').value = '';
    $('#filter-amiibo-series').value = '';
    $('#filter-game-series').value = '';
    $('#filter-owned').checked = false;
    render();
  });

  $('#sidebar-toggle').addEventListener('click', () => {
    const body = $('#sidebar-body');
    const open = body.classList.toggle('sidebar__body--open');
    $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  });
}

// ---------- Rendering ----------

function matchesFilters(entry) {
  const id = catalogId(entry);
  if (filters.search && !entry.name.toLowerCase().includes(filters.search)) return false;
  if (filters.type && entry.type !== filters.type) return false;
  if (filters.amiiboSeries && entry.amiiboSeries !== filters.amiiboSeries) return false;
  if (filters.gameSeries && entry.gameSeries !== filters.gameSeries) return false;
  if (filters.ownedOnly && !isOwned(id)) return false;
  return true;
}

export function render() {
  // Dedupe by id for the grid (catalog repeats entries per region).
  const seen = new Set();
  const visible = [];
  for (const entry of catalog) {
    const id = catalogId(entry);
    if (seen.has(id)) continue;
    seen.add(id);
    if (matchesFilters(entry)) visible.push(entry);
  }

  const grid = $('#grid');
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const entry of visible) frag.appendChild(buildCard(entry));
  grid.appendChild(frag);

  $('#catalog-title').hidden = false;
  $('#result-count').textContent = String(visible.length);
  $('#empty').hidden = visible.length !== 0;

  // Stats
  $('#stat-owned').textContent = String(ownedCount());
  $('#stat-total').textContent = String(seen.size);

  renderUnknown();
}

function buildCard(entry) {
  const id = catalogId(entry);
  const owned = isOwned(id);

  const card = document.createElement('button');
  card.className = 'card' + (owned ? ' card--owned' : '');
  card.setAttribute('role', 'listitem');
  card.dataset.id = id;
  card.setAttribute('aria-label', `${entry.name}${owned ? ', owned' : ''}`);

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card__imgwrap';
  const img = document.createElement('img');
  img.className = 'card__img';
  img.loading = 'lazy';
  img.alt = entry.name;
  img.src = entry.image || '';
  imgWrap.appendChild(img);
  if (owned) {
    const badge = document.createElement('span');
    badge.className = 'card__badge';
    badge.textContent = 'OWNED';
    imgWrap.appendChild(badge);
  }
  card.appendChild(imgWrap);

  const body = document.createElement('div');
  body.className = 'card__body';
  body.innerHTML = `
    <span class="card__name"></span>
    <span class="card__series"></span>
    <span class="card__meta"><span class="tag"></span><span class="card__date"></span></span>
  `;
  body.querySelector('.card__name').textContent = entry.name;
  body.querySelector('.card__series').textContent = entry.gameSeries || '';
  body.querySelector('.tag').textContent = entry.type || '';
  body.querySelector('.card__date').textContent = bestReleaseDate(entry) || '';
  card.appendChild(body);

  card.addEventListener('click', () => openDetail(id));
  return card;
}

function bestReleaseDate(entry) {
  const r = entry.release || {};
  return r.na || r.eu || r.jp || r.au || '';
}

function renderUnknown() {
  const list = unknownDumps(catalogIds);
  const section = $('#unknown-section');
  const grid = $('#unknown-grid');
  grid.innerHTML = '';

  if (list.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('#unknown-count').textContent = String(list.length);

  const frag = document.createDocumentFragment();
  for (const rec of list) {
    const el = document.createElement('div');
    el.className = 'unknown-card';
    el.innerHTML = `
      <div class="unknown-card__filename"></div>
      <div class="unknown-card__id mono"></div>
      <div class="unknown-card__actions">
        <button class="btn btn--sm" data-dl>Download .bin</button>
        <button class="btn btn--sm btn--danger" data-rm>Remove</button>
      </div>
    `;
    el.querySelector('.unknown-card__filename').textContent = rec.filename;
    el.querySelector('.unknown-card__id').textContent = formatIdDisplay(rec.id);
    el.querySelector('[data-dl]').addEventListener('click', () => downloadDump(rec.id, null));
    el.querySelector('[data-rm]').addEventListener('click', async () => {
      await removeDump(rec.id);
      onCollectionChange();
    });
    frag.appendChild(el);
  }
  grid.appendChild(frag);
}

// ---------- Detail modal ----------

function gamesFrom(entry) {
  const all = [];
  for (const key of ['games3DS', 'gamesSwitch', 'gamesWiiU']) {
    const platform = key.replace('games', '');
    for (const g of entry[key] || []) {
      if (g && g.gameName) all.push({ platform, name: g.gameName });
    }
  }
  return all;
}

function releaseRows(entry) {
  const r = entry.release || {};
  const regions = [['JP', r.jp], ['NA', r.na], ['EU', r.eu], ['AU', r.au]];
  return regions
    .filter(([, v]) => v)
    .map(([region, v]) => `<div class="rel"><span class="rel__region">${region}</span><span class="rel__date mono">${v}</span></div>`)
    .join('') || '<span class="muted">No release dates listed.</span>';
}

function openDetail(id) {
  const entry = byId.get(id);
  if (!entry) return;
  const owned = isOwned(id);
  const games = gamesFrom(entry);

  const gamesHtml = games.length
    ? games.map((g) => `<li><span class="tag tag--platform">${g.platform}</span> ${escapeHtml(g.name)}</li>`).join('')
    : '<li class="muted">No compatible games listed.</li>';

  const actionsHtml = owned
    ? `<button class="btn btn--primary" id="detail-dl">Download for ChameleonUltra</button>
       <button class="btn btn--danger" id="detail-rm">Remove from collection</button>`
    : `<p class="detail__hint">Not in your collection. <strong>Drag a dump here</strong> (or anywhere on the page) to add it.</p>`;

  $('#detail-content').innerHTML = `
    <div class="detail__media">
      <img src="${escapeAttr(entry.image || '')}" alt="${escapeAttr(entry.name)}" class="detail__img" />
      ${owned ? '<span class="detail__owned-flag">OWNED</span>' : ''}
    </div>
    <div class="detail__info">
      <h2 id="detail-name" class="detail__name">${escapeHtml(entry.name)}</h2>
      <div class="detail__id mono">${formatIdDisplay(id)}</div>
      <dl class="detail__grid">
        <dt>Character</dt><dd>${escapeHtml(entry.character || '—')}</dd>
        <dt>Type</dt><dd>${escapeHtml(entry.type || '—')}</dd>
        <dt>Amiibo series</dt><dd>${escapeHtml(entry.amiiboSeries || '—')}</dd>
        <dt>Game series</dt><dd>${escapeHtml(entry.gameSeries || '—')}</dd>
      </dl>
      <div class="detail__section">
        <h3>Release dates</h3>
        <div class="detail__releases">${releaseRows(entry)}</div>
      </div>
      <div class="detail__section">
        <h3>Works in <span class="pill">${games.length}</span></h3>
        <ul class="detail__games">${gamesHtml}</ul>
      </div>
      <div class="detail__actions">${actionsHtml}</div>
    </div>
  `;

  if (owned) {
    $('#detail-dl').addEventListener('click', () => downloadDump(id, entry));
    $('#detail-rm').addEventListener('click', async () => {
      await removeDump(id);
      onCollectionChange();
      closeModal($('#detail-modal'));
    });
  }

  openModal($('#detail-modal'));
}

// ---------- Modals ----------

function bindModals() {
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.closest('.modal')));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not([hidden])').forEach(closeModal);
    }
  });
  $('#info-btn').addEventListener('click', () => openModal($('#info-modal')));
}

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add('modal-open');
}
function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  if (!document.querySelector('.modal:not([hidden])')) {
    document.body.classList.remove('modal-open');
  }
}

// ---------- Drag & drop ----------

let dragDepth = 0;
let dropHandler = null;

export function setDropHandler(fn) {
  dropHandler = fn;
}

function bindDragAndDrop() {
  const overlay = $('#drop-overlay');

  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    overlay.classList.add('drop-overlay--active');
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.classList.remove('drop-overlay--active');
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.classList.remove('drop-overlay--active');
    const files = [...(e.dataTransfer.files || [])];
    if (files.length && dropHandler) dropHandler(files);
  });
}

function hasFiles(e) {
  return e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
}

// ---------- Theme ----------

function initTheme() {
  const saved = localStorage.getItem('amiibodex-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon();
  $('#theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem('amiibodex-theme', cur);
    updateThemeIcon();
  });
}
function updateThemeIcon() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  $('#theme-btn').innerHTML = dark ? '&#x2600;' : '&#x263E;'; // sun when dark (click->light), moon when light
}

// ---------- Toasts ----------

export function toast(message, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 300);
  }, 3800);
}

// ---------- small helpers ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str);
}
