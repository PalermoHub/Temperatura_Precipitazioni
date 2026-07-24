# Mappa bivariata Temperatura × Precipitazioni — Sicilia (1950–2025)

Mappa interattiva (MapLibre GL + PMTiles) dei 391 comuni della Sicilia che incrocia, comune per comune, temperatura e precipitazioni (o, in alternativa, temperatura e deficit idrico climatico), mese per mese dal 1950 al 2025.

Sito pubblicato da OpenDataSicilia.it — dati grezzi TerraClimate (University of Idaho / climatologylab.org) e dati incendi SIF (Sistema Informativo Forestale, Regione Siciliana).

---

## 1. Cosa mostrano le mappe

### 1.1 Livello (mappa bivariata classica)

Per ogni comune si incrociano due variabili in una griglia 3×3 (o 5×5 per le classifiche), ciascuna suddivisa in terzili/quintili calcolati su tutti i 391 comuni:

- **Temp × Precip**: incrocia temperatura media e precipitazione totale media annua. Risponde alla domanda "questo comune è caldo o freddo, secco o piovoso, rispetto agli altri comuni siciliani?".
- **Deficit × Temp**: incrocia temperatura media e **deficit idrico climatico** (`def = PET − AET`, evapotraspirazione potenziale meno reale, in mm). Il deficit è un indice di sintesi che tiene conto insieme di pioggia, temperatura, vento e radiazione solare: un comune "caldo e piovoso" può sembrare innocuo nella mappa Temp × Precip, ma se ha vento forte e cieli sereni può nascondere uno stress idrico reale non visibile guardando solo la pioggia.

Ogni combinazione di classi (es. "caldo e secco", "freddo e piovoso") ha un colore bivariato dedicato (palette tipo Stevens/CARTO), spiegato nel pannello laterale e nel popup di ogni comune.

La mappa può essere navigata mese per mese e anno per anno (1950–2025, 912 mesi) tramite la timeline in basso, con pulsante di animazione automatica.

### 1.2 Trend 1950–2025

Per ogni comune viene calcolato un trend climatico via regressione OLS sui dati annuali dell'intero periodo 1950–2025:

- trend di temperatura in **°C/decennio**
- trend della seconda variabile (precipitazione o deficit) in **mm/decennio**
- significatività statistica (p < 0.05, test a due code)

Permette di vedere dove il riscaldamento è più marcato e dove i regimi di pioggia/deficit stanno cambiando di più, indipendentemente dal livello assoluto.

### 1.3 Confronto periodi

Vista a doppia mappa con divisore trascinabile (swipe): si scelgono due periodi (Periodo A e Periodo B, anno di inizio/fine + mese o media annua) e si confrontano fianco a fianco gli stessi comuni nei due periodi, per capire come è cambiato il clima tra un'epoca e l'altra.

### Strumenti del pannello e della toolbar

- Ricerca comune / filtro per provincia
- Classifiche rapide (comuni più caldi/freddi, più piovosi/secchi, riscaldamento più marcato, ecc.)
- Statistiche riassuntive (comuni mostrati, medie, provincia)
- Toggle confini comuni, opacità riempimento, tema chiaro/scuro, schermo intero

---

## 2. Procedura di recupero e preparazione dati

Pipeline completa, in ordine di esecuzione. Tutti gli script sono in `scripts/`.

### 2.1 Download dati climatici grezzi

`scripts/download_terraclimate_sicilia.py`

Scarica da THREDDS (`climatologylab.org`, dataset **TerraClimate**) le variabili mensili 1950–oggi ritagliate sul bounding box della Sicilia (con margine per includere Lampedusa e Linosa, lat 35.3–38.9, lon 11.8–16.0):

- `ppt` — precipitazione mensile (mm)
- `tmax`, `tmin` — temperatura massima/minima mensile (°C), da cui si ricava `tmean = (tmax+tmin)/2`
- `def` — deficit idrico climatico (PET − AET, mm)

Output: `data/raw/terraclimate_{ppt,tmax,tmin,def}_sicilia_1950_2025.nc` (griglia ~4 km, 912 mesi).

### 2.2 Confini comunali

Due percorsi alternativi, entrambi presenti negli script:

- `scripts/estrai_comuni_sicilia.py` — filtra i comuni Sicilia (`COD_REG == 19`) dallo shapefile ISTAT nazionale (`Com01012022_g_WGS84.shp`).
- `scripts/estrai_comuni_sicilia_pmtiles.py` — in alternativa, estrae i comuni Sicilia dal pmtiles già pubblicato su gbvitrano.it/anncus, con `dissolve` per ricomporre i poligoni spezzati dal tiling MVT.

Output: `data/processed/comuni_sicilia.gpkg` (391 comuni).

### 2.3 Statistiche zonali (climatologia 1950–2025)

`scripts/zonal_stats_comuni.py`

Calcola, per ogni comune, la media dei valori raster TerraClimate sull'intero periodo (zonal stats):

- temperatura media annua (media di tutti i mesi 1950–2025)
- precipitazione totale media annua (media dei totali annui)
- deficit idrico climatico medio annuo (media dei totali annui di `def`)

Salva anche i raster intermedi (`temp_media_annua.tif`, `precip_media_annua.tif`, ecc.) e produce `data/processed/comuni_sicilia_clima.gpkg` con le statistiche allegate ai poligoni comunali.

### 2.4 Generazione dati bivariati (livello)

`scripts/make_bivariate_sicilia.py`

Da `comuni_sicilia_clima.gpkg`, per ciascuna coppia di variabili (Temp × Precip, Deficit × Temp):

1. calcola i terzili (breakpoint) sulle due variabili, su tutti i 391 comuni;
2. classifica ogni comune in una cella 3×3 (es. "2-3" = temperatura media, precipitazione alta);
3. assegna il colore bivariato dalla palette dedicata.

Output (con suffisso `_def` per la variante deficit):
- `dati/geo/comuni_bivariate[_def].geojson` — geometrie + classi
- `dati/comuni_bivariate[_def]_stats.json` — statistiche numeriche per comune
- `dati/comuni_bivariate[_def]_config.json` — breakpoint, palette, legenda

### 2.5 Serie storica mensile

`scripts/build_timeseries.py`

Rasterizza i 391 comuni sulla griglia TerraClimate una sola volta (zone raster), poi aggrega vettorialmente tutti i 912 mesi con numpy in un solo passaggio (per performance).

Output: `dati/comuni_timeseries[_def].json` — serie mensile 1950–2025 per comune, usata dalla timeline e dalla modalità "Livello" per ogni mese/anno selezionato.

### 2.6 Trend climatico

`scripts/compute_trend.py`

A partire dalla serie storica (`comuni_timeseries[_def].json`), calcola per ogni comune la regressione OLS su base annuale 1950–2025:

- trend temperatura (°C/decennio)
- trend della seconda variabile (mm/decennio)
- flag di significatività (p < 0.05)

Output: `dati/comuni_trend[_def]_stats.json`, usato dalla modalità "Trend 1950–2025".

### 2.7 Pubblicazione geometrie

Le geometrie comunali (`dati/geo/`) vengono convertite/servite come **PMTiles** per un caricamento efficiente lato client via HTTP Range Request, evitando di scaricare l'intero GeoJSON per ogni sessione.

---

## 3. Struttura del progetto

```
data/raw/        netCDF TerraClimate grezzi (ppt, tmax, tmin, def)
data/processed/  geopackage intermedi (confini + statistiche climatiche)
dati/            output finali JSON/GeoJSON consumati dal frontend
dati/geo/        geometrie comunali (GeoJSON / PMTiles)
scripts/         pipeline Python di recupero ed elaborazione dati
js/app.js        logica mappa principale, livelli, timeline, classifiche
js/compare.js    modalità confronto periodi (doppia mappa + divisore)
css/app.css      stili
index.html       markup pagina
```

## 4. Requisiti per rieseguire la pipeline

Python con: `xarray`, `netCDF4`, `geopandas`, `rasterio`, `rioxarray`, `rasterstats`, `numpy`, `scipy`, `pandas`.

Eseguire gli script in `scripts/` nell'ordine indicato al punto 2 (download → confini → zonal stats → bivariata → serie storica → trend).

## 5. Licenza

Questo progetto è distribuito con licenza [Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.it).

Sei libero di condividere e adattare il materiale per qualsiasi uso, anche commerciale, purché venga data adeguata attribuzione a OpenDataSicilia.it. Vedi il file [LICENSE](LICENSE) per il testo completo.

Dati climatici grezzi: TerraClimate (University of Idaho, climatologylab.org). Dati incendi: SIF — Sistema Informativo Forestale, Regione Siciliana, Censimento incendi 2007-2025 (https://sif.regione.sicilia.it/ilportale/). Confini amministrativi: ISTAT.
