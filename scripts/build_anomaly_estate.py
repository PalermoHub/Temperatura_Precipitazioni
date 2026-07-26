"""Costruisce l'anomalia estiva (giu-lug-ago) per comune rispetto al baseline 1950-1985,
a partire dalla serie mensile gia' presente in dati/comuni_timeseries.json (nessun nuovo
download necessario). Stessa convenzione delle altre pipeline in scripts/: props in formato
{id,nome,prov,...}, breaks quintili/terzili globali.

Il trend OLS (°C/decennio) non e' calcolato qui: scripts/compute_trend.py::compute_trend_singlevar
regredisce il campo "anomaly" di dati/comuni_anomaly_estate.json contro l'anno e sovrascrive
dati/comuni_anomaly_estate_trend_stats.json — va rilanciato dopo questo script.

Output:
  dati/comuni_anomaly_estate.json
  dati/comuni_anomaly_estate_stats.json
  dati/comuni_anomaly_estate_trend_stats.json  (placeholder vuoto, va rigenerato con compute_trend.py)
"""

import json

import numpy as np

TS_PATH = "dati/comuni_timeseries.json"
STATS_TP_PATH = "dati/comuni_bivariate_stats.json"
BASELINE_YEARS = range(1950, 1986)  # 1950-1985 inclusi
RECENT_YEARS = range(2020, 2026)    # 2020-2025 inclusi, blocco "vista rapida" richiesto in origine
SUMMER_MONTHS = (6, 7, 8)

OUT_TS = "dati/comuni_anomaly_estate.json"
OUT_STATS = "dati/comuni_anomaly_estate_stats.json"
OUT_TREND = "dati/comuni_anomaly_estate_trend_stats.json"


def quantile_breaks(values, n):
    valid = sorted(v for v in values if v is not None and not np.isnan(v))
    length = len(valid)
    breaks = []
    for i in range(1, n):
        idx = min(length - 1, int((i / n) * length))
        breaks.append(round(float(valid[idx]), 3))
    return breaks


def main():
    with open(TS_PATH) as f:
        ts = json.load(f)
    with open(STATS_TP_PATH) as f:
        tp_props = json.load(f)["props"]

    id_order = ts["id_order"]
    n = len(id_order)
    nome_by_id = {p["id"]: p["nome"] for p in tp_props}
    prov_by_id = {p["id"]: p["prov"] for p in tp_props}
    print(f"[1] Comuni: {n}")

    all_years = ts["years"]
    # media JJA per comune per anno: shape (n_anni, n_comuni)
    jja_by_year = {}
    for year in all_years:
        months = []
        for m in SUMMER_MONTHS:
            key = f"{year}-{m:02d}"
            per = ts["periods"].get(key)
            if per is not None:
                months.append(per["vx"])
        if len(months) != 3:
            jja_by_year[year] = None
            continue
        arr = np.array(months, dtype=float)  # (3, n)
        jja_by_year[year] = arr.mean(axis=0)  # (n,)
    print(f"[2] Anni con JJA completo: {sum(1 for v in jja_by_year.values() if v is not None)}/{len(all_years)}")

    baseline_stack = np.array([jja_by_year[y] for y in BASELINE_YEARS if jja_by_year.get(y) is not None])
    assert baseline_stack.shape[0] == len(list(BASELINE_YEARS)), "Anni baseline 1950-1985 incompleti in comuni_timeseries.json"
    baseline_mean = baseline_stack.mean(axis=0)  # (n,)
    baseline_std = baseline_stack.std(axis=0, ddof=0)  # (n,)
    print(f"[3] Baseline 1950-1985: media={baseline_mean.mean():.2f}°C, std media={baseline_std.mean():.2f}°C")

    periods = {}
    all_anomaly_vals, all_z_vals = [], []
    for year in all_years:
        jja = jja_by_year[year]
        if jja is None:
            continue
        anomaly = jja - baseline_mean
        z = np.divide(anomaly, baseline_std, out=np.full(n, np.nan), where=baseline_std != 0)
        periods[str(year)] = {
            "anomaly": [round(float(v), 3) for v in anomaly],
            "z": [None if np.isnan(v) else round(float(v), 3) for v in z],
        }
        all_anomaly_vals.extend(anomaly.tolist())
        all_z_vals.extend(v for v in z.tolist() if not np.isnan(v))

    # blocco "Recente 2020-2025": media delle anomalie annue di quel blocco, classificata sugli
    # stessi breaks globali di tutti gli altri anni (nessun break dedicato, resta comparabile).
    recent_stack = np.array([jja_by_year[y] for y in RECENT_YEARS if jja_by_year.get(y) is not None])
    assert recent_stack.shape[0] == len(list(RECENT_YEARS)), "Anni 2020-2025 incompleti in comuni_timeseries.json"
    recent_anomaly = recent_stack.mean(axis=0) - baseline_mean
    recent_z = np.divide(recent_anomaly, baseline_std, out=np.full(n, np.nan), where=baseline_std != 0)
    periods["recent"] = {
        "anomaly": [round(float(v), 3) for v in recent_anomaly],
        "z": [None if np.isnan(v) else round(float(v), 3) for v in recent_z],
    }
    print(f"    Anomalia media 2020-2025: {recent_anomaly.mean():.2f}°C")

    out_ts = {"id_order": id_order, "years": all_years, "periods": periods}
    with open(OUT_TS, "w") as f:
        json.dump(out_ts, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[4] Salvato: {OUT_TS}")

    breaks_x = quantile_breaks(all_anomaly_vals, 5)
    breaks_x3 = quantile_breaks(all_anomaly_vals, 3)
    breaks_xz = quantile_breaks(all_z_vals, 5)
    breaks_x3z = quantile_breaks(all_z_vals, 3)
    print(f"    Quintili anomalia °C: {breaks_x}")
    print(f"    Quintili z-score: {breaks_xz}")

    props = [
        {"id": cid, "nome": nome_by_id.get(cid, cid), "prov": prov_by_id.get(cid, ""),
         "vx": 0.0, "biv": "0", "bivMap": "0"}
        for cid in id_order
    ]
    out_stats = {"props": props, "breaksX": breaks_x, "breaksX3": breaks_x3,
                 "breaksXZ": breaks_xz, "breaksX3Z": breaks_x3z}
    with open(OUT_STATS, "w") as f:
        json.dump(out_stats, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[5] Salvato: {OUT_STATS}")

    with open(OUT_TREND, "w") as f:
        json.dump({"props": []}, f)
    print(f"[6] Salvato: {OUT_TREND}")


if __name__ == "__main__":
    main()
