"""Aggrega incendi_wgs84.geojson per comune (PRO_COM_T) x anno: area totale bruciata e conteggio eventi.

L'area bruciata e' calcolata dal poligono geometrico di ciascun incendio (riproiettato in
EPSG:3035, equal-area per l'Europa), non dai campi attributo del dataset. I campi attributo
cambiano nome/unita' a seconda dell'annata (AREA_TOT, DATI_WEB.DBO.Incendi_2009.Area,
DATI_WEB.DBO.DFCNSIINCD_DENORM.TOTSUP...) e i loro totali risultano sistematicamente piu' alti
di quelli calcolati dalla geometria (es. 2007: ~80.800 ha da AREA_TOT contro ~39.000 ha dal
poligono) — probabile doppio conteggio o area "di evento" anziche' area netta bruciata. La
geometria e' l'unica fonte verificabile indipendentemente dal campo attributo.

Output: dati/incendi_annuale.json — usato da build_pdsi_incendi_timeseries.py, non servito al frontend.
"""

import json
import re

import geopandas as gpd

INCENDI = "data/incendi_wgs84.geojson"
COMUNI = "dati/geo/comuni_bivariate.geojson"
OUT = "dati/incendi_annuale.json"
AREA_CRS = 3035  # ETRS89-LAEA Europe, equal-area, adatto per calcolare ettari su tutta la Sicilia

comuni = gpd.read_file(COMUNI)
id_order = comuni["pro_com_t"].tolist()
id_index = {cid: i for i, cid in enumerate(id_order)}
n = len(id_order)
print(f"[1] Comuni: {n}")

incendi = gpd.read_file(INCENDI)
print(f"[2] Feature incendio: {len(incendi)}")

incendi_m = incendi.to_crs(AREA_CRS)
area_ha = incendi_m.geometry.area / 10000.0
print(f"[3] Area calcolata dal poligono (min/media/max ha): "
      f"{area_ha.min():.3f} / {area_ha.mean():.3f} / {area_ha.max():.1f}")

area = {}
count = {}
skipped_no_comune = 0
skipped_no_year = 0

for i, feat in incendi.iterrows():
    pro_com_t = feat.get("PRO_COM_T")
    anno_raw = feat.get("anno")  # es. "Incendi 2007"
    area_tot_ha = float(area_ha.iloc[i])

    if pro_com_t not in id_index:
        skipped_no_comune += 1
        continue
    m = re.search(r"(\d{4})", anno_raw or "")
    if not m:
        skipped_no_year += 1
        continue
    anno = m.group(1)

    idx = id_index[pro_com_t]
    if anno not in area:
        area[anno] = [0.0] * n
        count[anno] = [0] * n
    area[anno][idx] += area_tot_ha
    count[anno][idx] += 1

print(f"[4] Scartati (comune non in Sicilia/391): {skipped_no_comune}")
print(f"[5] Scartati (anno non estraibile): {skipped_no_year}")

years = sorted(int(y) for y in area.keys())
print(f"[6] Anni con dati: {years}")

area_out = {str(y): [round(v, 2) for v in area[str(y)]] for y in years}
count_out = {str(y): count[str(y)] for y in years}

out = {"id_order": id_order, "years": years, "area": area_out, "count": count_out}
with open(OUT, "w") as f:
    json.dump(out, f, separators=(",", ":"))

print(f"[7] Salvato: {OUT}")
