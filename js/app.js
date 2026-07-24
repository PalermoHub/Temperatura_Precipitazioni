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
// Etichette asse Y per il layer Deficit idrico climatico (def, mm — PET-AET)
const DEF_LABELS = ['', 'molto umido', 'umido', 'nella media', 'stress idrico', 'stress idrico estremo'];
const DEF_ICON = ['', '💧', '💧', '🌱', '🏜️', '🔥🏜️'];
const DEF_LABELS_TR = ['', 'forte calo stress idrico', 'calo stress idrico', 'trend stabile', 'aumento stress idrico', 'forte aumento stress idrico'];
const DEF_ICON_TR = ['', '⬇️', '⬇️', '➡️', '⬆️', '⬆️'];

// Colori classifiche: univariati, uno per variabile pura (non i vertici bivariati sopra,
// che mescolano temp+precip e darebbero logica sbagliata a un ranking mono-variabile).
const RANK_COLORS = {
  caldo: '#d9534f',  // rosso caldo
  freddo: '#3b7dd8', // blu freddo
};

function buildPalette(corners) {
  const pal = {};
  for (let tx = 1; tx <= 5; tx++) {
    for (let ty = 1; ty <= 5; ty++) {
      const u = (tx - 1) / 4, v = (ty - 1) / 4;
      const rgb = [0, 1, 2].map(i => {
        const top = corners.coldLo[i] * (1 - u) + corners.hotLo[i] * u;
        const bot = corners.coldHi[i] * (1 - u) + corners.hotHi[i] * u;
        return Math.round(top * (1 - v) + bot * v);
      });
      pal[`${tx}-${ty}`] = `rgb(${rgb.join(',')})`;
    }
  }
  return pal;
}

const TEMP_LABELS = ['', 'molto freddo', 'freddo', 'nella media', 'caldo', 'molto caldo'];
const PRECIP_LABELS = ['', 'molto secco', 'secco', 'nella media', 'piovoso', 'molto piovoso'];
const TEMP_ICON = ['', '🥶', '🌡️', '🌡️', '☀️', '🔥'];
const PRECIP_ICON = ['', '🏜️', '🏜️', '💧', '🌧️', '🌧️'];
// Etichette per la modalita' Trend (pendenza OLS 1950-2025, non livello assoluto)
const TEMP_LABELS_TR = ['', 'riscaldamento debole', 'riscaldamento lieve', 'riscaldamento medio', 'riscaldamento forte', 'riscaldamento molto forte'];
const PRECIP_LABELS_TR = ['', 'forte calo piogge', 'calo piogge', 'trend stabile', 'aumento piogge', 'forte aumento piogge'];
const TEMP_ICON_TR = ['', '↗️', '↗️', '⬆️', '🔥', '🔥'];
const PRECIP_ICON_TR = ['', '⬇️', '⬇️', '➡️', '⬆️', '⬆️'];

const LAYERS = {
  tp: {
    id: 'tp', tabLabel: 'Temp × Precip',
    statsUrl: 'dati/comuni_bivariate_stats.json',
    tsUrl: 'dati/comuni_timeseries.json',
    trendUrl: 'dati/comuni_trend_stats.json',
    corners: { coldLo: CORNER_COLD_DRY, hotLo: CORNER_HOT_DRY, coldHi: CORNER_COLD_WET, hotHi: CORNER_HOT_WET },
    yLabels: PRECIP_LABELS, yIcon: PRECIP_ICON,
    yLabelsTr: PRECIP_LABELS_TR, yIconTr: PRECIP_ICON_TR,
    axisLabelY: 'Precipitazione →',
    fieldY: 'Precipitazione', fieldYTrend: 'Trend precipitazione',
    statsLblY: 'precip. media mm', statsLblYTr: 'trend precip. mm/decennio',
    pairTitle: 'Temperatura × Precipitazione',
    pairTitleTrend: 'Trend Temperatura × Precipitazione',
    panelSub: '391 comuni di Sicilia — climatologia TerraClimate 1950-2025',
    panelSubTrend: '391 comuni di Sicilia — trend OLS 1950-2025 (°C/decennio, mm/decennio)',
    rankHi: { key: 'piovoso', icon: '💧', color: '#1f9c8a', titleLivello: 'Più piovosi', titleTrend: 'Piogge in aumento', dec: 0, decTrend: 1 },
    rankLo: { key: 'arido', icon: '🏜️', color: '#c9974f', titleLivello: 'Più aridi', titleTrend: 'Piogge in calo', dec: 0, decTrend: 1 },
    explain: `<p>Questa mappa incrocia temperatura e precipitazione media per capire, a colpo d'occhio, se un comune è caldo/freddo e secco/piovoso rispetto agli altri della Sicilia.</p>
<p>La pioggia dice solo quanta acqua <em>arriva</em>, non quanta ne resta davvero disponibile. Due comuni con la stessa piovosità possono avere uno stress idrico molto diverso: uno fresco e riparato dal vento trattiene l'acqua nel suolo, uno caldo, ventoso e assolato ne perde di più per evaporazione.</p>
<p>Incrociare temperatura e pioggia dà un'idea approssimativa di questo effetto — più caldo, in genere, significa più acqua persa — ma è comunque una stima indiretta. Per il dato preciso (quanta acqua manca davvero) usa la scheda <strong>Deficit × Temp</strong>.</p>
<p>Utile per: farsi un'idea rapida del clima di un comune (caldo/freddo, secco/piovoso) e confrontarlo con altri.</p>`,
  },
  dt: {
    id: 'dt', tabLabel: 'Deficit × Temp',
    statsUrl: 'dati/comuni_bivariate_def_stats.json',
    tsUrl: 'dati/comuni_timeseries_def.json',
    trendUrl: 'dati/comuni_trend_def_stats.json',
    corners: {
      coldLo: [169, 201, 196], hotLo: [79, 143, 138],   // freddo/caldo, deficit basso (umido) — verde-teal
      coldHi: [169, 143, 122], hotHi: [140, 47, 31],    // freddo/caldo, deficit alto (arido) — ocra/rosso terracotta
    },
    yLabels: DEF_LABELS, yIcon: DEF_ICON,
    yLabelsTr: DEF_LABELS_TR, yIconTr: DEF_ICON_TR,
    axisLabelY: 'Deficit idrico →',
    fieldY: 'Deficit idrico', fieldYTrend: 'Trend deficit idrico',
    statsLblY: 'deficit medio mm', statsLblYTr: 'trend deficit mm/decennio',
    pairTitle: 'Temperatura × Deficit idrico',
    pairTitleTrend: 'Trend Temperatura × Deficit idrico',
    panelSub: '391 comuni di Sicilia — climatologia TerraClimate 1950-2025 (def = PET−AET)',
    panelSubTrend: '391 comuni di Sicilia — trend OLS 1950-2025 (°C/decennio, mm/decennio)',
    rankHi: { key: 'stress_alto', icon: '🏜️', color: '#a85c3b', titleLivello: 'Maggior stress idrico', titleTrend: 'Stress idrico in aumento', dec: 0, decTrend: 1 },
    rankLo: { key: 'stress_basso', icon: '💧', color: '#4f8f8a', titleLivello: 'Minor stress idrico', titleTrend: 'Stress idrico in calo', dec: 0, decTrend: 1 },
    explain: `<p>Questa mappa incrocia temperatura e deficit idrico climatico per mostrare lo stress idrico reale di ogni comune, non solo quanto piove.</p>
<p>Il <strong>deficit idrico</strong> (def = PET − AET) misura quanta acqua manca davvero rispetto a quella che l'atmosfera "vorrebbe" far evaporare, dato calore, vento e sole di ogni comune. È già un indice di sintesi: mette insieme pioggia, temperatura, vento e radiazione solare in un solo numero — a differenza della pioggia grezza, che va sempre interpretata a mente insieme alla temperatura.</p>
<p>Un comune "caldo e piovoso" sembra innocuo nella mappa Temp × Precip, ma se ha vento forte e cieli sereni può nascondere un deficit idrico reale, non visibile guardando solo quanto piove.</p>
<p>Utile per: agricoltura (quanta acqua serve davvero alle colture), rischio incendi, gestione delle risorse idriche comunali — le domande a cui agronomi e idrologi rispondono con questo dato, non con la pioggia grezza.</p>`,
  },
};

let activeLayer = 'tp';
let PAL = {};
const layerCache = {};

function curLabels() {
  const l = LAYERS[activeLayer];
  return MODE === 'trend'
    ? { temp: TEMP_LABELS_TR, precip: l.yLabelsTr, tempIcon: TEMP_ICON_TR, precipIcon: l.yIconTr }
    : { temp: TEMP_LABELS, precip: l.yLabels, tempIcon: TEMP_ICON, precipIcon: l.yIcon };
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
// luminanza percepita: testo scuro sui toni chiari della rampa, bianco sui toni scuri
function textOnPal(rgbStr) {
  const [r, g, b] = rgbStr.match(/\d+/g).map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#2a2a2a' : '#fff';
}

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
let MODE = 'livello';     // 'livello' | 'trend'
let TREND_STATS = null;   // trend OLS 1950-2025: id, nome, prov, vx(=°C/decennio), vy(=mm/decennio), temp_p, precip_p, temp_sig, precip_sig, biv
let TREND_BY_ID = {};
let BREAKS_X_TR = [], BREAKS_Y_TR = [];

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

async function loadLayerData(id) {
  if (layerCache[id]) return layerCache[id];
  const cfg = LAYERS[id];
  const [statsRes, tsRes, trendRes] = await Promise.all([
    fetch(cfg.statsUrl), fetch(cfg.tsUrl), fetch(cfg.trendUrl),
  ]);
  const newBaseStats = (await statsRes.json()).props;
  const newTs = await tsRes.json();
  const newTrendStats = (await trendRes.json()).props;
  const newBaseById = {};
  newBaseStats.forEach(p => { newBaseById[p.id] = p; });

  // climatologia: aggiunge tmax/tmin medi (media di tutti i mesi) a newBaseStats
  const n = newTs.id_order.length;
  const sumMax = new Array(n).fill(0), cntMax = new Array(n).fill(0);
  const sumMin = new Array(n).fill(0), cntMin = new Array(n).fill(0);
  Object.values(newTs.periods).forEach(p => {
    p.tmax.forEach((v, c) => { if (v != null) { sumMax[c] += v; cntMax[c]++; } });
    p.tmin.forEach((v, c) => { if (v != null) { sumMin[c] += v; cntMin[c]++; } });
  });
  newTs.id_order.forEach((cid, c) => {
    const p = newBaseById[cid];
    if (!p) return;
    p.tmax = cntMax[c] ? +(sumMax[c] / cntMax[c]).toFixed(2) : null;
    p.tmin = cntMin[c] ? +(sumMin[c] / cntMin[c]).toFixed(2) : null;
  });

  const newBreaksX = quintileBreaks(newBaseStats.map(p => p.vx));
  const newBreaksY = quintileBreaks(newBaseStats.map(p => p.vy));
  const newBreaksXTr = quintileBreaks(newTrendStats.map(p => p.vx));
  const newBreaksYTr = quintileBreaks(newTrendStats.map(p => p.vy));
  const newTrendById = {};
  newTrendStats.forEach(p => {
    const cx = classify5(p.vx, newBreaksXTr), cy = classify5(p.vy, newBreaksYTr);
    p.biv = (cx && cy) ? `${cx}-${cy}` : null;
    newTrendById[p.id] = p;
  });

  const data = {
    BASE_STATS: newBaseStats, BASE_BY_ID: newBaseById, TS: newTs,
    TREND_STATS: newTrendStats, TREND_BY_ID: newTrendById,
    BREAKS_X: newBreaksX, BREAKS_Y: newBreaksY,
    BREAKS_X_TR: newBreaksXTr, BREAKS_Y_TR: newBreaksYTr,
    PAL: buildPalette(cfg.corners),
  };
  layerCache[id] = data;
  return data;
}

function applyLayerData(data) {
  BASE_STATS = data.BASE_STATS; BASE_BY_ID = data.BASE_BY_ID;
  TS = data.TS; TREND_STATS = data.TREND_STATS; TREND_BY_ID = data.TREND_BY_ID;
  BREAKS_X = data.BREAKS_X; BREAKS_Y = data.BREAKS_Y;
  BREAKS_X_TR = data.BREAKS_X_TR; BREAKS_Y_TR = data.BREAKS_Y_TR;
  PAL = data.PAL;
}

function updateLayerChrome() {
  const l = LAYERS[activeLayer];
  document.getElementById('biv-diag-lbl-y').textContent = l.axisLabelY;
  document.getElementById('panel-title').textContent = MODE === 'trend' ? l.pairTitleTrend : l.pairTitle;
  document.getElementById('panel-sub').textContent = MODE === 'trend' ? l.panelSubTrend : l.panelSub;
  document.getElementById('s-precip-lbl').textContent = MODE === 'trend' ? l.statsLblYTr : l.statsLblY;
  document.getElementById('layer-explain').innerHTML = l.explain;
  document.querySelectorAll('.layer-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.layer === activeLayer));
}

async function switchLayer(id) {
  if (id === activeLayer || !LAYERS[id]) return;
  stopPlay();
  const data = await loadLayerData(id);
  activeLayer = id;
  applyLayerData(data);
  activeBiv = null;
  document.querySelectorAll('.biv-cell').forEach(c => c.classList.remove('active'));
  buildBivGrid();
  updateLayerChrome();
  if (MODE === 'trend') {
    CURRENT = TREND_STATS; CURRENT_BY_ID = TREND_BY_ID;
    applyFilters(); updateFilterUI();
  } else if (MODE === 'confronto') {
    applyCompare();
  } else {
    setPeriod(selYear, selMonth);
  }
  if (document.getElementById('floating-rank').classList.contains('open')) renderFloatingRank();
}

function setupLayerTabs() {
  document.getElementById('layer-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.layer-tab-btn');
    if (btn) switchLayer(btn.dataset.layer);
  });
}

async function init() {
  const data = await loadLayerData('tp');
  applyLayerData(data);

  buildBivGrid();
  buildProvinceSelect();
  buildComuneSelect();
  buildTimeline();
  buildCompareSelects();
  setPeriod('2025', 'annua');
  setupSearch();
  setupFilterModal();
  setupToolbar();
  setupModeToggle();
  setupLayerTabs();
  setupCompareUI();
  setupCompareDivider();
  updateLayerChrome();

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
  const { temp: T, precip: P } = curLabels();
  let html = '';
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      const tx = 6 - col, ty = 6 - row;
      const key = `${tx}-${ty}`;
      const title = `${capitalize(T[tx])} e ${P[ty]}`;
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
  const province = [...new Set(BASE_STATS.map(p => p.prov))].sort((a, b) => a.localeCompare(b, 'it'));
  province.forEach(p => {
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

    const provinceAll = [...new Set(BASE_STATS.map(p => p.prov))];
    const provMatches = provinceAll.filter(p => p.toLowerCase().includes(q)).slice(0, 5);
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
  if (MODE === 'livello' && selYear !== 'clima') chips.push(['anno', 'Anno', selYear]);
  if (MODE === 'livello' && selYear !== 'clima' && selMonth !== 'annua') chips.push(['mese', 'Mese', MESI[selMonth - 1]]);
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
  if (MODE === 'confronto') {
    applyCompare();
    return;
  }
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
  document.getElementById('s-temp').textContent = fmt(avg(temps), MODE === 'trend' ? 2 : 1);
  document.getElementById('s-precip').textContent = fmt(avg(precs), MODE === 'trend' ? 1 : 0);
  document.getElementById('s-prov').textContent = activeProv || 'Tutte';
}

function rankSections() {
  const l = LAYERS[activeLayer];
  if (MODE === 'trend') {
    return [
      ['caldo', '🔥', 'Riscaldamento più forte', '°C/decennio', 'vx', 'desc', RANK_COLORS.caldo, 2],
      ['freddo', '🥶', 'Riscaldamento più debole', '°C/decennio', 'vx', 'asc', RANK_COLORS.freddo, 2],
      [l.rankHi.key, l.rankHi.icon, l.rankHi.titleTrend, 'mm/decennio', 'vy', 'desc', l.rankHi.color, l.rankHi.decTrend],
      [l.rankLo.key, l.rankLo.icon, l.rankLo.titleTrend, 'mm/decennio', 'vy', 'asc', l.rankLo.color, l.rankLo.decTrend],
    ];
  }
  return [
    ['caldo', '🔥', 'Più caldi', '°C', 'vx', 'desc', RANK_COLORS.caldo, 1],
    ['freddo', '🥶', 'Più freddi', '°C', 'vx', 'asc', RANK_COLORS.freddo, 1],
    [l.rankHi.key, l.rankHi.icon, l.rankHi.titleLivello, 'mm', 'vy', 'desc', l.rankHi.color, l.rankHi.dec],
    [l.rankLo.key, l.rankLo.icon, l.rankLo.titleLivello, 'mm', 'vy', 'asc', l.rankLo.color, l.rankLo.dec],
  ];
}

function buildRanking() {
  const sub = currentSubset();
  const container = document.getElementById('rank-container');
  container.innerHTML = '';

  function section(cat, icon, title, unit, key, dir, color, dec) {
    const sorted = [...sub].filter(p => p[key] != null).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]);
    const top = sorted.slice(0, 5);
    if (!top.length) return '';
    const max = Math.max(...top.map(p => Math.abs(p[key])));
    const rows = top.map((p, i) => `
      <div class="rank-row" data-id="${esc(p.id)}" title="${esc(p.nome)}: ${fmt(p[key], dec)} ${unit}">
        <span class="rank-num">${i + 1}</span>
        <span class="rank-name">${esc(p.nome)}</span>
        <span class="rank-bar-wrap"><span class="rank-bar" style="width:${max ? (Math.abs(p[key]) / max * 100) : 0}%"></span></span>
        <span class="rank-val">${fmt(p[key], dec)}</span>
      </div>`).join('');
    return `<div class="rank-section" data-cat="${cat}" style="--cat-color:${color}">
      <div class="rank-hdr"><span class="rank-icon">${icon}</span>${title}<span class="rank-hdr-unit">${unit}</span></div>
      ${rows}
    </div>`;
  }

  container.innerHTML = rankSections().map(args => section(...args)).join('');

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
    if (MODE === 'confronto') {
      canvas.style.cursor = 'pointer';
      showCompareInfo(id);
      return;
    }
    const p = CURRENT_BY_ID[id];
    if (!p) return;
    canvas.style.cursor = 'pointer';
    showInfo(p);
  });
  map.on('mouseleave', 'comuni-fill', () => { canvas.style.cursor = ''; infoEl.style.display = 'none'; });
}

function periodLabel() {
  if (MODE === 'trend') return 'Trend OLS 1950-2025';
  if (selYear === 'clima') return 'Media 1950-2025';
  if (selMonth === 'annua') return `Media annua ${selYear}`;
  return `${MESI[selMonth - 1]} ${selYear}`;
}

function buildClassBlock(biv) {
  if (!biv) return '';
  const [tx, ty] = biv.split('-').map(Number);
  const { temp: T, precip: P, tempIcon: TI, precipIcon: PI } = curLabels();
  const color = PAL[biv] || '#888';
  const phrase = `${TI[tx]} ${capitalize(T[tx])} e ${PI[ty]} ${P[ty]}`;
  const desc = MODE === 'trend' ? 'pendenza OLS 1950-2025, quintili sui 391 comuni' : 'rispetto alla media 1950-2025 di questo comune';
  return `<div class="cls-badge" style="background:${color};color:${textOnPal(color)}">${phrase}</div>`
    + `<div class="cls-desc">${desc}</div>`;
}

function showInfo(p) {
  document.getElementById('i-title').innerHTML = `${esc(p.nome)} · ${esc(p.prov)}<br><span style="font-weight:400;color:var(--text2);font-size:9px;">${esc(periodLabel())}</span>`;
  if (MODE === 'trend') {
    const sigTxt = sig => sig === true ? 'significativo (p<0.05)' : sig === false ? 'non significativo' : '—';
    document.getElementById('i-table').innerHTML = [
      ['Trend temperatura', fmt(p.vx, 2) + ' °C/decennio'],
      ['Significatività temp.', sigTxt(p.temp_sig)],
      [LAYERS[activeLayer].fieldYTrend, fmt(p.vy, 1) + ' mm/decennio'],
      ['Significatività precip.', sigTxt(p.precip_sig)],
    ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  } else {
    document.getElementById('i-table').innerHTML = [
      ['Temperatura media', fmt(p.vx, 1) + ' °C'],
      ['Temperatura max', fmt(p.tmax, 1) + ' °C'],
      ['Temperatura min', fmt(p.tmin, 1) + ' °C'],
      [LAYERS[activeLayer].fieldY, fmt(p.vy, 0) + ' mm'],
    ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  }
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
  setMode('livello');
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
  const l = LAYERS[activeLayer];
  const box = document.getElementById('floating-rank');
  function top3(key, dir, unit, dec) {
    const sorted = [...sub].filter(p => p[key] != null).sort((a, b) => dir === 'desc' ? b[key] - a[key] : a[key] - b[key]).slice(0, 3);
    return sorted.map(p => `<div class="fr-row"><span>${esc(p.nome)}</span><span>${fmt(p[key], dec)} ${unit}</span></div>`).join('');
  }
  if (MODE === 'trend') {
    box.innerHTML =
      `<h4>Riscaldamento più forte</h4>${top3('vx', 'desc', '°C/decennio', 2)}` +
      `<h4>${l.rankHi.titleTrend}</h4>${top3('vy', 'desc', 'mm/decennio', 1)}`;
  } else {
    box.innerHTML =
      `<h4>Più caldi</h4>${top3('vx', 'desc', '°C', 1)}` +
      `<h4>${l.rankHi.titleLivello}</h4>${top3('vy', 'desc', 'mm', 0)}`;
  }
}

function setupModeToggle() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
}

function setMode(mode) {
  if (mode === MODE) return;
  stopPlay();
  const prevMode = MODE;
  MODE = mode;
  document.body.classList.toggle('mode-trend', mode === 'trend');
  document.body.classList.toggle('mode-confronto', mode === 'confronto');
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const l = LAYERS[activeLayer];
  document.getElementById('panel-title').textContent =
    mode === 'confronto' ? 'Confronto periodi' : (mode === 'trend' ? l.pairTitleTrend : l.pairTitle);
  document.getElementById('panel-sub').textContent =
    mode === 'confronto' ? '391 comuni di Sicilia — confronto tra due periodi climatologici' :
    (mode === 'trend' ? l.panelSubTrend : l.panelSub);
  document.getElementById('s-temp-lbl').textContent = mode === 'trend' ? 'trend temp. °C/decennio' : 'temp. media °C';
  document.getElementById('s-precip-lbl').textContent = mode === 'trend' ? l.statsLblYTr : l.statsLblY;

  if (prevMode === 'confronto' && mode !== 'confronto') exitCompareMode();

  buildBivGrid();

  if (mode === 'trend') {
    CURRENT = TREND_STATS;
    CURRENT_BY_ID = TREND_BY_ID;
    document.getElementById('periodo-hint').textContent =
      'Trend OLS 1950-2025: pendenza della retta di regressione su 76 medie annuali per comune. Il riscaldamento è significativo (p<0.05) in tutti i comuni; il trend delle piogge è quasi ovunque non significativo — vedi popup per il dettaglio statistico.';
    syncTimelineUI();
    applyFilters();
    updateFilterUI();
    if (document.getElementById('floating-rank').classList.contains('open')) renderFloatingRank();
  } else if (mode === 'confronto') {
    enterCompareMode();
  } else {
    setPeriod(selYear, selMonth);
  }
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
