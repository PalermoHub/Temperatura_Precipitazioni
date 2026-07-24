/* Mappa bivariata Temperatura x Precipitazione — comuni di Sicilia
   Poligoni: pmtiles remoto gbvitrano.it/anncus (base territoriale comuni, tutta Italia,
   filtrato a Sicilia con cod_reg==19). I valori climatici (TerraClimate) sono agganciati
   a runtime via feature-state, indicizzati su pro_com_t.
   Selettore Anno/Mese: ricolora con i dati di quel periodo specifico, classificando
   sempre sulle soglie fisse (quintili, griglia 5×5) della climatologia 1950-2025 per restare comparabile. */

const REMOTE_PMTILES = 'https://gbvitrano.it/anncus/data/comuni.pmtiles';
const SOURCE_LAYER = 'comuni';
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// Palette semantica a 4 vertici (interpolazione bilineare), scelta per leggibilità climatica:
// freddo+secco=steppa/tundra, caldo+secco=deserto, freddo+piovoso=alpino, caldo+piovoso=subtropicale.
// Sostituisce il precedente blend "multiply" (arancio×blu), che faceva collassare il vertice
// caldo+piovoso verso il quasi-nero (fallisce la soglia di croma nella validazione).
const CORNER_COLD_DRY  = [203, 184, 157]; // #cbb89d — tan/steppa
const CORNER_HOT_DRY   = [217, 100, 44];  // #d9642c — terracotta/deserto
const CORNER_COLD_WET  = [79, 131, 166];  // #4f83a6 — blu/alpino
const CORNER_HOT_WET   = [74, 140, 95];   // #4a8c5f — verde/subtropicale
// Colori classifiche: univariati, uno per variabile pura (non i vertici bivariati sopra,
// che mescolano temp+precip e darebbero logica sbagliata a un ranking mono-variabile).
const RANK_COLORS = {
  caldo: '#d9534f',  // rosso caldo
  freddo: '#3b7dd8', // blu freddo
  piovoso: '#1f9c8a', // teal acqua/pioggia
  arido: '#c9974f',  // ocra/sabbia siccità
};
const PAL = {};
for (let tx = 1; tx <= 5; tx++) {
  for (let ty = 1; ty <= 5; ty++) {
    const u = (tx - 1) / 4, v = (ty - 1) / 4;
    const rgb = [0, 1, 2].map(i => {
      const top = CORNER_COLD_DRY[i] * (1 - u) + CORNER_HOT_DRY[i] * u;
      const bot = CORNER_COLD_WET[i] * (1 - u) + CORNER_HOT_WET[i] * u;
      return Math.round(top * (1 - v) + bot * v);
    });
    PAL[`${tx}-${ty}`] = `rgb(${rgb.join(',')})`;
  }
}
const TEMP_LABELS = ['', 'molto freddo', 'freddo', 'nella media', 'caldo', 'molto caldo'];
const PRECIP_LABELS = ['', 'molto secco', 'secco', 'nella media', 'piovoso', 'molto piovoso'];
const TEMP_ICON = ['', '🥶', '🌡️', '🌡️', '☀️', '🔥'];
const PRECIP_ICON = ['', '🏜️', '🏜️', '💧', '🌧️', '🌧️'];
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
// luminanza percepita: testo scuro sui toni chiari della rampa, bianco sui toni scuri
function textOnPal(rgbStr) {
  const [r, g, b] = rgbStr.match(/\d+/g).map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2a2a2a' : '#fff';
}

let CONFIG = null;
let BASE_STATS = null;   // climatologia 1950-2025: id, nome, prov, vx, vy, biv, tmax, tmin
let BASE_BY_ID = {};
let TS = null;           // { id_order, years, periods: { "YYYY-MM": {vx,vy,tmax,tmin} } }
let CURRENT = [];         // dati del periodo attualmente selezionato
let CURRENT_BY_ID = {};
let selYear = 'clima';
let selMonth = 'annua';
let activeBiv = null;
let activeProv = '';
let activeComune = '';
let BREAKS_X = [], BREAKS_Y = []; // 4 soglie quintili, calcolate sui 391 comuni (climatologia)

const fmt = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { maximumFractionDigits: d });
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function classify5(val, breaks) {
  if (val == null) return null;
  for (let i = 0; i < breaks.length; i++) if (val <= breaks[i]) return i + 1;
  return 5;
}

function quintileBreaks(values) {
  const sorted = values.filter(v => v != null).slice().sort((a, b) => a - b);
  const n = sorted.length;
  const q = p => sorted[Math.min(n - 1, Math.floor(p * n))];
  return [q(0.2), q(0.4), q(0.6), q(0.8)];
}

const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      'carto-light': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
          'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
        ],
        tileSize: 256, attribution: '© CARTO © OpenStreetMap contributors',
      },
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
          'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
        ],
        tileSize: 256, attribution: '© CARTO © OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'basemap', type: 'raster', source: 'carto-light', layout: { visibility: 'visible' } }],
  },
  center: [14.15, 37.6],
  zoom: 7.2,
  minZoom: 6,
  maxZoom: 13,
  attributionControl: { compact: true },
});

const brStack = document.getElementById('br-stack');
const attribCtrl = map.getContainer().querySelector('.maplibregl-ctrl-bottom-right');
if (brStack && attribCtrl) brStack.appendChild(attribCtrl);

function closeAttrib() {
  const details = document.querySelector('.maplibregl-ctrl-attrib');
  if (details && details.classList.contains('maplibregl-compact-show')) {
    details.classList.remove('maplibregl-compact-show');
    details.removeAttribute('open');
  }
}
map.on('load', closeAttrib);
map.on('resize', closeAttrib);

async function init() {
  const [cfgRes, statsRes, tsRes] = await Promise.all([
    fetch('dati/comuni_bivariate_config.json'),
    fetch('dati/comuni_bivariate_stats.json'),
    fetch('dati/comuni_timeseries.json'),
  ]);
  CONFIG = await cfgRes.json();
  BASE_STATS = (await statsRes.json()).props;
  TS = await tsRes.json();
  BASE_STATS.forEach(p => { BASE_BY_ID[p.id] = p; });
  attachClimaTminTmax();

  BREAKS_X = quintileBreaks(BASE_STATS.map(p => p.vx));
  BREAKS_Y = quintileBreaks(BASE_STATS.map(p => p.vy));

  buildBivGrid();
  buildProvinceSelect();
  buildComuneSelect();
  buildTimeline();
  setPeriod('2025', 'annua');
  setupSearch();
  setupFilterModal();
  setupToolbar();

  map.on('load', () => {
    map.addSource('comuni', {
      type: 'vector',
      url: `pmtiles://${REMOTE_PMTILES}`,
      promoteId: 'pro_com_t',
    });

    map.addLayer({
      id: 'comuni-fill', type: 'fill', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'cod_reg'], 19],
      paint: {
        'fill-color': ['coalesce', ['feature-state', 'color'], '#cccccc'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], true], 0.82, 0],
      },
    });
    map.addLayer({
      id: 'comuni-border', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'cod_reg'], 19],
      paint: { 'line-color': 'rgba(0,0,0,0.28)', 'line-width': 0.6 },
    });
    map.addLayer({
      id: 'comuni-highlight', type: 'line', source: 'comuni', 'source-layer': SOURCE_LAYER,
      filter: ['==', ['get', 'pro_com_t'], ''],
      paint: { 'line-color': '#ff9900', 'line-width': 3 },
    });

    map.on('sourcedata', e => {
      if (e.sourceId === 'comuni' && e.isSourceLoaded) applyFeatureState();
    });

    setupHover();
  });
}

// climatologia: aggiunge tmax/tmin medi (media di tutti i 912 mesi) a BASE_STATS
function attachClimaTminTmax() {
  const n = TS.id_order.length;
  const sumMax = new Array(n).fill(0), cntMax = new Array(n).fill(0);
  const sumMin = new Array(n).fill(0), cntMin = new Array(n).fill(0);
  Object.values(TS.periods).forEach(p => {
    p.tmax.forEach((v, c) => { if (v != null) { sumMax[c] += v; cntMax[c]++; } });
    p.tmin.forEach((v, c) => { if (v != null) { sumMin[c] += v; cntMin[c]++; } });
  });
  TS.id_order.forEach((id, c) => {
    const p = BASE_BY_ID[id];
    if (!p) return;
    p.tmax = cntMax[c] ? +(sumMax[c] / cntMax[c]).toFixed(2) : null;
    p.tmin = cntMin[c] ? +(sumMin[c] / cntMin[c]).toFixed(2) : null;
  });
}

const MESI_ABBR = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
let playTimer = null;

function buildTimeline() {
  const years = document.getElementById('tl-years');
  const months = document.getElementById('tl-months');

  let hy = `<div class="tl-item tl-clima" data-year="clima">Clima</div>`;
  for (let y = TS.years[0]; y <= TS.years[TS.years.length - 1]; y++) hy += `<div class="tl-item" data-year="${y}">${y}</div>`;
  years.innerHTML = hy;

  let hm = `<div class="tl-item" data-month="annua">Annua</div>`;
  MESI_ABBR.forEach((m, i) => { hm += `<div class="tl-item" data-month="${i + 1}">${m}</div>`; });
  months.innerHTML = hm;

  years.addEventListener('click', e => {
    const item = e.target.closest('.tl-item');
    if (!item) return;
    setPeriod(item.dataset.year, selMonth);
  });
  months.addEventListener('click', e => {
    const item = e.target.closest('.tl-item');
    if (!item) return;
    setPeriod(selYear, item.dataset.month === 'annua' ? 'annua' : +item.dataset.month);
  });
}

function syncTimelineUI() {
  document.querySelectorAll('#tl-years .tl-item').forEach(el => el.classList.toggle('active', el.dataset.year === String(selYear)));
  document.querySelectorAll('#tl-months .tl-item').forEach(el => {
    const active = selYear !== 'clima' && el.dataset.month === String(selMonth);
    el.classList.toggle('active', active);
  });
  const activeYear = document.querySelector('#tl-years .tl-item.active');
  if (activeYear) activeYear.scrollIntoView({ block: 'nearest', inline: 'center' });
  const activeMonth = document.querySelector('#tl-months .tl-item.active');
  if (activeMonth) activeMonth.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function setPeriod(year, month) {
  selYear = year;
  selMonth = month;

  CURRENT = computePeriodData(year, month);
  CURRENT_BY_ID = {};
  CURRENT.forEach(p => { CURRENT_BY_ID[p.id] = p; });

  const hint = document.getElementById('periodo-hint');
  if (year === 'clima') {
    hint.textContent = 'Climatologia TerraClimate 1950-2025. Soglie di classificazione fisse per tutti i periodi.';
  } else if (month === 'annua') {
    hint.textContent = `Media annua ${year}. Classi sulle soglie della climatologia.`;
  } else {
    hint.textContent = `${MESI[month - 1]} ${year}. Classi sulle soglie della climatologia.`;
  }

  syncTimelineUI();
  applyFilters();
  updateFilterUI();
  if (document.getElementById('floating-rank').classList.contains('open')) renderFloatingRank();
}

function computePeriodData(year, month) {
  if (year === 'clima') return BASE_STATS;

  const n = TS.id_order.length;
  const out = new Array(n);

  if (month === 'annua') {
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
      .map(k => TS.periods[k]).filter(Boolean);
    for (let c = 0; c < n; c++) {
      const vxs = months.map(m => m.vx[c]).filter(v => v != null);
      const vys = months.map(m => m.vy[c]).filter(v => v != null);
      const tmaxs = months.map(m => m.tmax[c]).filter(v => v != null);
      const tmins = months.map(m => m.tmin[c]).filter(v => v != null);
      out[c] = buildEntry(TS.id_order[c],
        vxs.length ? vxs.reduce((a, b) => a + b, 0) / vxs.length : null,
        vys.length ? vys.reduce((a, b) => a + b, 0) : null,
        tmaxs.length ? Math.max(...tmaxs) : null,
        tmins.length ? Math.min(...tmins) : null);
    }
  } else {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const p = TS.periods[key];
    for (let c = 0; c < n; c++) {
      out[c] = p
        ? buildEntry(TS.id_order[c], p.vx[c], p.vy[c], p.tmax[c], p.tmin[c])
        : buildEntry(TS.id_order[c], null, null, null, null);
    }
  }
  return out;
}

function buildEntry(id, vx, vy, tmax, tmin) {
  const base = BASE_BY_ID[id] || {};
  const cls_x = classify5(vx, BREAKS_X);
  const cls_y = classify5(vy, BREAKS_Y);
  return {
    id, nome: base.nome, prov: base.prov,
    vx: vx != null ? +vx.toFixed(2) : null,
    vy: vy != null ? +vy.toFixed(1) : null,
    tmax, tmin,
    biv: (cls_x && cls_y) ? `${cls_x}-${cls_y}` : null,
  };
}

function applyFeatureState() {
  const feats = map.querySourceFeatures('comuni', { sourceLayer: SOURCE_LAYER });
  feats.forEach(f => {
    const id = f.properties.pro_com_t;
    const p = CURRENT_BY_ID[id];
    if (!p) return;
    const matchProv = !activeProv || p.prov === activeProv;
    const matchBiv = !activeBiv || p.biv === activeBiv;
    const matchComune = !activeComune || p.id === activeComune;
    map.setFeatureState(
      { source: 'comuni', sourceLayer: SOURCE_LAYER, id },
      { color: PAL[p.biv] || '#888', match: matchProv && matchBiv && matchComune }
    );
  });
}

// Griglia 5×5 emessa in ordine riga1..5/col1..5 (CSS grid la piazza row-major);
// dopo la rotate(45deg) del contenitore, riga1/col1 finisce al vertice ALTO del diamante,
// quindi qui si inverte la corrispondenza (tx=6-col, ty=6-row) per ottenere agli angoli:
// alto=temp alta+precip alta, sinistra=temp alta+precip bassa, destra=temp bassa+precip alta, basso=entrambe basse.
function buildBivGrid() {
  const grid = document.getElementById('biv-grid');
  let html = '';
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      const tx = 6 - col, ty = 6 - row;
      const key = `${tx}-${ty}`;
      const title = `${capitalize(TEMP_LABELS[tx])} e ${PRECIP_LABELS[ty]}`;
      html += `<div class="biv-cell" data-biv="${key}" style="background:${PAL[key]}" title="${title}"></div>`;
    }
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.biv-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const key = cell.dataset.biv;
      activeBiv = activeBiv === key ? null : key;
      grid.querySelectorAll('.biv-cell').forEach(c => c.classList.toggle('active', c.dataset.biv === activeBiv));
      applyFilters();
    });
  });
}

function buildProvinceSelect() {
  const sel = document.getElementById('sel-provincia');
  CONFIG.province.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    activeProv = sel.value;
    if (activeComune && BASE_BY_ID[activeComune]?.prov !== activeProv) activeComune = '';
    buildComuneSelect();
    applyFilters();
    updateFilterUI();
  });
}

function buildComuneSelect() {
  const sel = document.getElementById('sel-comune');
  const list = BASE_STATS
    .filter(p => !activeProv || p.prov === activeProv)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  sel.innerHTML = '<option value="">Tutti i comuni</option>' +
    list.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
  sel.value = activeComune;
  sel.onchange = () => {
    activeComune = sel.value;
    if (activeComune) {
      activeProv = BASE_BY_ID[activeComune].prov;
      document.getElementById('sel-provincia').value = activeProv;
      flyToComune(activeComune);
    }
    applyFilters();
    updateFilterUI();
  };
}

function setupSearch() {
  const input = document.getElementById('search-comune');
  const clear = document.getElementById('search-clear');
  const dd = document.getElementById('search-dd');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clear.style.display = input.value ? '' : 'none';
    if (!q) { dd.innerHTML = ''; dd.classList.remove('open'); return; }

    const provMatches = CONFIG.province.filter(p => p.toLowerCase().includes(q)).slice(0, 5);
    const comuneMatches = BASE_STATS.filter(p => p.nome.toLowerCase().includes(q)).slice(0, 8);

    let html = '';
    if (provMatches.length) {
      html += '<div class="anncus-dd-cat">Province</div>';
      html += provMatches.map(p =>
        `<div class="anncus-dd-item" data-type="prov" data-value="${esc(p)}">${esc(p)} <span class="anncus-dd-badge">Provincia</span></div>`
      ).join('');
    }
    if (comuneMatches.length) {
      html += '<div class="anncus-dd-cat">Comuni</div>';
      html += comuneMatches.map(p =>
        `<div class="anncus-dd-item" data-type="comune" data-id="${esc(p.id)}">${esc(p.nome)} <span class="anncus-dd-badge">${esc(p.prov)}</span></div>`
      ).join('');
    }
    dd.innerHTML = html || '<div class="anncus-dd-empty">Nessun risultato</div>';
    dd.classList.add('open');
  });

  dd.addEventListener('click', e => {
    const item = e.target.closest('.anncus-dd-item');
    if (!item) return;
    if (item.dataset.type === 'prov') {
      activeProv = item.dataset.value;
      if (activeComune && BASE_BY_ID[activeComune]?.prov !== activeProv) activeComune = '';
      document.getElementById('sel-provincia').value = activeProv;
      buildComuneSelect();
      applyFilters();
      updateFilterUI();
      input.value = activeProv;
    } else {
      const id = item.dataset.id;
      activeComune = id;
      activeProv = BASE_BY_ID[id]?.prov || '';
      document.getElementById('sel-provincia').value = activeProv;
      buildComuneSelect();
      applyFilters();
      updateFilterUI();
      input.value = BASE_BY_ID[id]?.nome || '';
      flyToComune(id);
    }
    dd.classList.remove('open');
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.style.display = 'none';
    dd.innerHTML = '';
    dd.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#geo-searchbar')) dd.classList.remove('open');
  });
}

function updateFilterUI() {
  const count = (activeProv ? 1 : 0) + (activeComune ? 1 : 0);
  const active = count > 0;
  document.getElementById('filter-badge').style.display = active ? 'flex' : 'none';
  document.getElementById('filter-badge').textContent = active ? String(count) : '';
  document.getElementById('filter-btn').classList.toggle('active', active);
  renderFilterChips();
}

function renderFilterChips() {
  const el = document.getElementById('filter-chips');
  const chips = [];
  if (selYear !== 'clima') chips.push(['anno', 'Anno', selYear]);
  if (selYear !== 'clima' && selMonth !== 'annua') chips.push(['mese', 'Mese', MESI[selMonth - 1]]);
  if (activeProv) chips.push(['provincia', 'Provincia', activeProv]);
  if (activeComune) chips.push(['comune', 'Comune', BASE_BY_ID[activeComune]?.nome || activeComune]);

  el.innerHTML = chips.map(([type, lbl, val]) =>
    `<div class="chip" data-type="${type}"><span class="chip-lbl">${esc(lbl)}:</span><span class="chip-val">${esc(val)}</span><button class="chip-x" title="Rimuovi">&#x2715;</button></div>`
  ).join('');
  el.classList.toggle('open', chips.length > 0);
}

document.getElementById('filter-chips').addEventListener('click', e => {
  if (!e.target.closest('.chip-x')) return;
  const type = e.target.closest('.chip').dataset.type;
  if (type === 'anno') {
    setPeriod('clima', 'annua');
  } else if (type === 'mese') {
    setPeriod(selYear, 'annua');
  } else if (type === 'provincia') {
    activeProv = ''; activeComune = '';
    document.getElementById('sel-provincia').value = '';
    buildComuneSelect();
    applyFilters();
    updateFilterUI();
  } else if (type === 'comune') {
    activeComune = '';
    document.getElementById('sel-comune').value = '';
    applyFilters();
    updateFilterUI();
  }
});

function setupFilterModal() {
  const btn = document.getElementById('filter-btn');
  const overlay = document.getElementById('filter-overlay');
  const modal = document.getElementById('filter-modal');
  const close = document.getElementById('pfm-close');
  const apply = document.getElementById('pfm-apply');

  function closeModal() {
    modal.classList.remove('open');
    overlay.classList.remove('open');
  }
  btn.addEventListener('click', () => { modal.classList.add('open'); overlay.classList.add('open'); });
  close.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);
  apply.addEventListener('click', closeModal);
}

function applyFilters() {
  applyFeatureState();
  updateStats();
  buildRanking();
}

function currentSubset() {
  return CURRENT.filter(p =>
    (!activeProv || p.prov === activeProv) &&
    (!activeBiv || p.biv === activeBiv) &&
    (!activeComune || p.id === activeComune)
  );
}

function updateStats() {
  const sub = currentSubset();
  const n = sub.length;
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const temps = sub.map(p => p.vx).filter(v => v != null);
  const precs = sub.map(p => p.vy).filter(v => v != null);
  document.getElementById('s-n').textContent = n;
  document.getElementById('s-temp').textContent = fmt(avg(temps), 1);
  document.getElementById('s-precip').textContent = fmt(avg(precs), 0);
  document.getElementById('s-prov').textContent = activeProv || 'Tutte';
}

function buildRanking() {
  const sub = currentSubset();
  const container = document.getElementById('rank-container');
  container.innerHTML = '';

  function section(cat, icon, title, unit, key, dir, color) {
    const sorted = [...sub].filter(p => p[key] != null).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]);
    const top = sorted.slice(0, 5);
    if (!top.length) return '';
    const max = Math.max(...top.map(p => Math.abs(p[key])));
    const rows = top.map((p, i) => `
      <div class="rank-row" data-id="${esc(p.id)}" title="${esc(p.nome)}: ${fmt(p[key], key === 'vx' ? 1 : 0)} ${unit}">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${esc(p.nome)}</span>
        <span class="rank-bar-wrap"><span class="rank-bar" style="width:${max ? (Math.abs(p[key]) / max * 100) : 0}%"></span></span>
        <span class="rank-val">${fmt(p[key], key === 'vx' ? 1 : 0)}</span>
      </div>`).join('');
    return `<div class="rank-section" data-cat="${cat}" style="--cat-color:${color}">
      <div class="rank-hdr"><span class="rank-icon">${icon}</span>${title}<span class="rank-hdr-unit">${unit}</span></div>
      ${rows}
    </div>`;
  }

  container.innerHTML =
    section('caldo', '🔥', 'Più caldi', '°C', 'vx', 'desc', RANK_COLORS.caldo) +
    section('freddo', '🥶', 'Più freddi', '°C', 'vx', 'asc', RANK_COLORS.freddo) +
    section('piovoso', '💧', 'Più piovosi', 'mm', 'vy', 'desc', RANK_COLORS.piovoso) +
    section('arido', '🏜️', 'Più aridi', 'mm', 'vy', 'asc', RANK_COLORS.arido);

  container.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => flyToComune(row.dataset.id));
  });
}

function flyToComune(id) {
  const feats = map.querySourceFeatures('comuni', { sourceLayer: SOURCE_LAYER, filter: ['==', ['get', 'pro_com_t'], id] });
  map.setFilter('comuni-highlight', ['==', ['get', 'pro_com_t'], id]);
  if (feats.length && feats[0].geometry) {
    const coords = [];
    const collect = g => { if (typeof g[0] === 'number') { coords.push(g); return; } g.forEach(collect); };
    collect(feats[0].geometry.coordinates);
    const lons = coords.map(c => c[0]), lats = coords.map(c => c[1]);
    map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 11 });
  }
}

function setupHover() {
  const canvas = map.getCanvas();
  const infoEl = document.getElementById('info');
  map.on('mousemove', 'comuni-fill', e => {
    if (!e.features.length) return;
    const id = e.features[0].properties.pro_com_t;
    const p = CURRENT_BY_ID[id];
    if (!p) return;
    canvas.style.cursor = 'pointer';
    showInfo(p);
  });
  map.on('mouseleave', 'comuni-fill', () => { canvas.style.cursor = ''; infoEl.style.display = 'none'; });
}

function periodLabel() {
  if (selYear === 'clima') return 'Media 1950-2025';
  if (selMonth === 'annua') return `Media annua ${selYear}`;
  return `${MESI[selMonth - 1]} ${selYear}`;
}

function buildClassBlock(biv) {
  if (!biv) return '';
  const [tx, ty] = biv.split('-').map(Number);
  const color = PAL[biv] || '#888';
  const phrase = `${TEMP_ICON[tx]} ${capitalize(TEMP_LABELS[tx])} e ${PRECIP_ICON[ty]} ${PRECIP_LABELS[ty]}`;
  return `<div class="cls-badge" style="background:${color};color:${textOnPal(color)}">${phrase}</div>`
    + `<div class="cls-desc">rispetto alla media 1950-2025 di questo comune</div>`;
}

function showInfo(p) {
  document.getElementById('i-title').innerHTML = `${esc(p.nome)} · ${esc(p.prov)}<br><span style="font-weight:400;color:var(--text2);font-size:9px;">${esc(periodLabel())}</span>`;
  document.getElementById('i-table').innerHTML = [
    ['Temperatura media', fmt(p.vx, 1) + ' °C'],
    ['Temperatura max', fmt(p.tmax, 1) + ' °C'],
    ['Temperatura min', fmt(p.tmin, 1) + ' °C'],
    ['Precipitazione', fmt(p.vy, 0) + ' mm'],
  ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  document.getElementById('i-class').innerHTML = buildClassBlock(p.biv);
  document.getElementById('info').style.display = 'block';
}

function togglePanel() {
  document.getElementById('panel').classList.toggle('closed');
  document.body.classList.toggle('panel-closed');
  setTimeout(() => map.resize(), 360);
}
document.getElementById('panel-toggle').addEventListener('click', togglePanel);

document.getElementById('btn-reset').addEventListener('click', () => {
  activeBiv = null; activeProv = ''; activeComune = '';
  document.getElementById('sel-provincia').value = '';
  buildComuneSelect();
  document.getElementById('search-comune').value = '';
  document.getElementById('search-clear').style.display = 'none';
  document.querySelectorAll('.biv-cell').forEach(c => c.classList.remove('active'));
  map.setFilter('comuni-highlight', ['==', ['get', 'pro_com_t'], '']);
  updateFilterUI();
  document.getElementById('filter-modal').classList.remove('open');
  document.getElementById('filter-overlay').classList.remove('open');
  stopPlay();
  setPeriod('2025', 'annua');
});

function renderFloatingRank() {
  const sub = currentSubset();
  const box = document.getElementById('floating-rank');
  function top3(key, dir, unit) {
    const sorted = [...sub].filter(p => p[key] != null).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]).slice(0, 3);
    return sorted.map(p => `<div class="fr-row"><span>${esc(p.nome)}</span><span>${fmt(p[key], key === 'vx' ? 1 : 0)} ${unit}</span></div>`).join('');
  }
  box.innerHTML =
    `<h4>Più caldi</h4>${top3('vx', 'desc', '°C')}` +
    `<h4>Più piovosi</h4>${top3('vy', 'desc', 'mm')}`;
}

function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  document.getElementById('tl-play').classList.remove('active');
}

function setupToolbar() {
  document.getElementById('tb-home').addEventListener('click', () => {
    map.flyTo({ center: [14.15, 37.6], zoom: 7.2 });
  });

  document.getElementById('tb-panel').addEventListener('click', togglePanel);

  document.getElementById('tb-biv').addEventListener('click', function () {
    const on = this.classList.toggle('active');
    map.setLayoutProperty('comuni-fill', 'visibility', on ? 'visible' : 'none');
  });

  document.getElementById('tb-borders').addEventListener('click', function () {
    const on = this.classList.toggle('active');
    map.setLayoutProperty('comuni-border', 'visibility', on ? 'visible' : 'none');
  });

  document.getElementById('tb-rank').addEventListener('click', function () {
    const on = this.classList.toggle('active');
    document.getElementById('floating-rank').classList.toggle('open', on);
    if (on) renderFloatingRank();
  });

  document.getElementById('tb-fullscreen').addEventListener('click', function () {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    document.getElementById('tb-fullscreen').classList.toggle('active', !!document.fullscreenElement);
  });

  document.getElementById('tb-theme').addEventListener('click', function () {
    const dark = document.body.classList.toggle('dark');
    this.classList.toggle('active', dark);
    const source = dark ? 'carto-dark' : 'carto-light';
    if (map.getLayer('basemap')) map.removeLayer('basemap');
    const beforeId = map.getLayer('comuni-fill') ? 'comuni-fill' : undefined;
    map.addLayer({ id: 'basemap', type: 'raster', source }, beforeId);
  });

  const opacitySlider = document.getElementById('tb-opacity');
  const opacityVal = document.getElementById('tb-opacity-val');
  opacitySlider.addEventListener('input', () => {
    const v = +opacitySlider.value;
    opacityVal.textContent = v;
    map.setPaintProperty('comuni-fill', 'fill-opacity',
      ['case', ['boolean', ['feature-state', 'match'], true], v / 100, 0]);
  });

  document.getElementById('tl-prev').addEventListener('click', () => stepYear(-1));
  document.getElementById('tl-next').addEventListener('click', () => stepYear(1));
  document.getElementById('tl-mese-prev').addEventListener('click', () => stepMonth(-1));
  document.getElementById('tl-mese-next').addEventListener('click', () => stepMonth(1));

  document.getElementById('tl-play').addEventListener('click', function () {
    if (playTimer) { stopPlay(); return; }
    this.classList.add('active');
    playTimer = setInterval(() => stepYear(1, true), 1100);
  });

  document.querySelectorAll('.tl-scroll-wrap').forEach(wrap => {
    wrap.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      wrap.scrollLeft += e.deltaY;
    }, { passive: false });
  });
}

function stepYear(dir, loop) {
  const first = TS.years[0], last = TS.years[TS.years.length - 1];
  let y = selYear === 'clima' ? (dir > 0 ? first : last) : +selYear + dir;
  if (y > last) { if (!loop) return; y = first; }
  if (y < first) { if (!loop) return; y = last; }
  setPeriod(y, selMonth);
}

function stepMonth(dir) {
  if (selYear === 'clima') return;
  let m = selMonth === 'annua' ? (dir > 0 ? 1 : 12) : selMonth + dir;
  if (m < 1) m = 'annua';
  else if (m > 12) m = 'annua';
  setPeriod(selYear, m);
}

init();
