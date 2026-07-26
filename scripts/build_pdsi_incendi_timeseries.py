"""Costruisce le serie mensili PDSI + le serie annuali incendio (area/conteggio) per comune,
nello stesso formato di dati/comuni_timeseries.json, cosi' da riusare loadLayerData/computePeriodData
esistenti senza modifiche.

Output:
  dati/comuni_timeseries_pf_area.json
  dati/comuni_timeseries_pf_count.json
  dati/comuni_bivariate_pf_area_stats.json
  dati/comuni_bivariate_pf_count_stats.json
  dati/comuni_bivariate_pf_area_trend_stats.json   (placeholder vuoto, Trend disabilitato per pf)
  dati/comuni_bivariate_pf_count_trend_stats.json  (placeholder vuoto)
"""

import json

import numpy as np
import xarray as xr
import geopandas as gpd
import rasterio.features

RAW = "data/raw"
COMUNI = "dati/geo/comuni_bivariate.geojson"
INCENDI_ANNUALE = "dati/incendi_annuale.json"
STATS_TP = "dati/comuni_bivariate_stats.json"  # per nome/prov per id

comuni = gpd.read_file(COMUNI)
id_order = comuni["pro_com_t"].tolist()
n = len(id_order)
print(f"[1] Comuni: {n}")

with open(INCENDI_ANNUALE) as f:
    incendi = json.load(f)
assert incendi["id_order"] == id_order, "Ordine comuni incendi_annuale.json disallineato da comuni_bivariate.geojson"
fire_years = incendi["years"]
print(f"[2] Anni incendio: {fire_years}")

with open(STATS_TP) as f:
    tp_stats = json.load(f)["props"]
nome_by_id = {p["id"]: p["nome"] for p in tp_stats}
prov_by_id = {p["id"]: p["prov"] for p in tp_stats}
vento_by_id = {p["id"]: p.get("vento") for p in tp_stats}

pdsi = xr.open_dataarray(f"{RAW}/terraclimate_PDSI_sicilia_1950_2025.nc")

lat = pdsi["lat"].values
lon = pdsi["lon"].values
res_lat = abs(lat[1] - lat[0])
res_lon = abs(lon[1] - lon[0])
transform = rasterio.transform.from_origin(lon.min() - res_lon / 2, lat.max() + res_lat / 2, res_lon, res_lat)
out_shape = (len(lat), len(lon))

print("[3] Rasterizzo maschera per ogni comune...")
masks = np.zeros((n, *out_shape), dtype=bool)
for i, geom in enumerate(comuni.geometry):
    masks[i] = rasterio.features.rasterize(
        [(geom, 1)], out_shape=out_shape, transform=transform, fill=0, all_touched=True, dtype="uint8"
    ).astype(bool)

pdsi_v = pdsi.values  # (912, lat, lon)
n_t = pdsi_v.shape[0]

print(f"[4] Aggrego PDSI per {n} comuni...")
pdsi_out = np.full((n_t, n), np.nan)
for c in range(n):
    mask = masks[c]
    if not mask.any():
        continue
    pdsi_out[:, c] = np.nanmean(pdsi_v[:, mask], axis=1)

times = pdsi["time"].values.astype("datetime64[M]").astype(str)  # 'YYYY-MM'


def rnd(arr, d):
    return [round(float(v), d) if not np.isnan(v) else None for v in arr]


fire_years_set = set(fire_years)


def build_periods(fire_field):
    """fire_field: 'area' o 'count' — quale serie incendio usare come vy.
    Limitato agli anni con dato incendio (fire_years): niente da mostrare fuori 2007-2025."""
    periods = {}
    for t_idx, ym in enumerate(times):
        year = ym[:4]
        if int(year) not in fire_years_set:
            continue
        vx = rnd(pdsi_out[t_idx], 2)
        vy = incendi[fire_field][year]
        periods[ym] = {
            "vx": vx,
            "vy": [float(v) for v in vy],
            "tmax": [None] * n,
            "tmin": [None] * n,
        }
    return periods


for fire_field in ("area", "count"):
    periods = build_periods(fire_field)
    out = {"id_order": id_order, "years": fire_years, "periods": periods}
    out_path = f"dati/comuni_timeseries_pf_{fire_field}.json"
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"[5] Salvato: {out_path}")

# Baseline climatologia: media PDSI 2007-2025 (esclude 2019 automaticamente, non in fire_years)
# e media annuale area/conteggio sullo stesso periodo.
sum_pdsi = np.zeros(n)
cnt_pdsi = np.zeros(n)
times_list = list(times)
for ym in times:
    year = int(ym[:4])
    if year not in fire_years:
        continue
    idx = times_list.index(ym)
    for c in range(n):
        v = pdsi_out[idx, c]
        if not np.isnan(v):
            sum_pdsi[c] += v
            cnt_pdsi[c] += 1
mean_pdsi = [sum_pdsi[c] / cnt_pdsi[c] if cnt_pdsi[c] else None for c in range(n)]


def quintile_breaks(values):
    sorted_v = sorted(v for v in values if v is not None)
    n_v = len(sorted_v)

    def q(p):
        return sorted_v[min(n_v - 1, int(p * n_v))]

    return [q(0.2), q(0.4), q(0.6), q(0.8)]


def classify5(val, breaks):
    if val is None:
        return None
    for i, b in enumerate(breaks):
        if val <= b:
            return i + 1
    return 5


breaks_x = quintile_breaks(mean_pdsi)

for fire_field in ("area", "count"):
    mean_fire = [
        sum(incendi[fire_field][str(y)][c] for y in fire_years) / len(fire_years)
        for c in range(n)
    ]
    nonzero = [v for v in mean_fire if v > 0]
    breaks_y = quintile_breaks(nonzero)
    props = []
    for c, cid in enumerate(id_order):
        vx = mean_pdsi[c]
        vy = mean_fire[c]
        cls_x = classify5(vx, breaks_x)
        cls_y = 0 if vy == 0 else classify5(vy, breaks_y)
        biv = f"{cls_x}-{cls_y}" if (cls_x and cls_y is not None) else None
        props.append({
            "id": cid, "nome": nome_by_id.get(cid, cid), "prov": prov_by_id.get(cid, ""),
            "vx": round(vx, 2) if vx is not None else None,
            "vy": round(vy, 2),
            "biv": biv,
            "vento": vento_by_id.get(cid),
        })
    out_path = f"dati/comuni_bivariate_pf_{fire_field}_stats.json"
    with open(out_path, "w") as f:
        json.dump({"props": props}, f, separators=(",", ":"))
    print(f"[6] Salvato: {out_path}")

    trend_path = f"dati/comuni_bivariate_pf_{fire_field}_trend_stats.json"
    with open(trend_path, "w") as f:
        json.dump({"props": []}, f, separators=(",", ":"))
    print(f"[7] Salvato (placeholder, Trend disabilitato per pf): {trend_path}")
