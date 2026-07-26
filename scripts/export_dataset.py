#!/usr/bin/env python3
"""Export standalone comune-level climate/fire dataset (CSV + GeoJSON) for external reuse.

Joins the per-comune stat files under dati/ (means, OLS trends, wildfire totals)
onto the base ISTAT comune table, using the ISTAT alphanumeric code as key.
Output: output/sicilia_clima_export.csv, output/sicilia_clima_export.geojson, output/SCHEMA.md
"""
import json
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATI = ROOT / "dati"
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)


def load_props(fname):
    d = json.load(open(DATI / fname))
    return {p["id"]: p for p in d["props"]}


def main():
    base = list(csv.DictReader(open(ROOT / "data/processed/comuni_sicilia_clima.csv")))
    by_id = {r["pro_com_t"]: r for r in base}

    biv = load_props("comuni_bivariate_stats.json")          # temp/precip means
    trend = load_props("comuni_trend_stats.json")             # temp/precip trends
    biv_def = load_props("comuni_bivariate_def_stats.json")   # temp/deficit means
    trend_def = load_props("comuni_trend_def_stats.json")     # temp/deficit trends
    anom = load_props("comuni_anomaly_estate_stats.json")     # JJA temp anomaly (z-score)
    anom_trend = load_props("comuni_anomaly_estate_trend_stats.json")
    pf_area = load_props("comuni_bivariate_pf_area_stats.json")   # PDSI x burned area
    pf_area_trend = load_props("comuni_bivariate_pf_area_trend_stats.json")
    pf_count = load_props("comuni_bivariate_pf_count_stats.json")  # PDSI x fire count
    pf_count_trend = load_props("comuni_bivariate_pf_count_trend_stats.json")

    incendi = json.load(open(DATI / "incendi_annuale.json"))
    id_order = incendi["id_order"]
    years = [str(y) for y in incendi["years"]]
    incendi_area_tot = {}
    incendi_count_tot = {}
    for i, cid in enumerate(id_order):
        incendi_area_tot[cid] = sum(incendi["area"][y][i] for y in years if incendi["area"][y][i] is not None)
        incendi_count_tot[cid] = sum(incendi["count"][y][i] for y in years if incendi["count"][y][i] is not None)

    rows = []
    for cid, r in by_id.items():
        t = trend.get(cid, {})
        tdef = trend_def.get(cid, {})
        an = anom.get(cid, {})
        ant = anom_trend.get(cid, {})
        pfa = pf_area.get(cid, {})
        pfat = pf_area_trend.get(cid, {})
        pfc = pf_count.get(cid, {})
        pfct = pf_count_trend.get(cid, {})
        rows.append({
            "id_istat": cid,
            "comune": r["comune"],
            "provincia": r["den_prov"],
            "sigla_prov": r["sigla"],
            "temp_media_c": float(r["temp_media_c"]),
            "precip_media_mm": float(r["precip_media_mm"]),
            "deficit_media_mm": float(r["def_media_mm"]),
            "temp_trend_c_decade": t.get("vx"),
            "precip_trend_mm_decade": t.get("vy"),
            "temp_trend_pvalue": t.get("temp_p"),
            "precip_trend_pvalue": t.get("precip_p"),
            "temp_trend_sig": t.get("temp_sig"),
            "precip_trend_sig": t.get("precip_sig"),
            "deficit_trend_mm_decade": tdef.get("vy"),
            "deficit_trend_pvalue": tdef.get("precip_p"),
            "deficit_trend_sig": tdef.get("precip_sig"),
            "anomalia_estate_zscore": an.get("vx"),
            "anomalia_estate_trend_zscore_decade": ant.get("vx"),
            "anomalia_estate_trend_pvalue": ant.get("temp_p"),
            "anomalia_estate_trend_sig": ant.get("temp_sig"),
            "pdsi_media": pfa.get("vx"),
            "incendi_area_ha_media_annua": pfa.get("vy"),
            "incendi_count_media_annua": pfc.get("vy"),
            "pdsi_trend_decade": pfat.get("vx"),
            "incendi_area_trend_ha_decade": pfat.get("vy"),
            "incendi_count_trend_decade": pfct.get("vy"),
            "incendi_area_ha_totale_2007_2024": incendi_area_tot.get(cid),
            "incendi_count_totale_2007_2024": incendi_count_tot.get(cid),
        })
    rows.sort(key=lambda x: x["id_istat"])

    csv_path = OUT / "sicilia_clima_export.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"CSV: {csv_path} ({len(rows)} righe)")

    geo = json.load(open(DATI / "geo/comuni_bivariate.geojson"))
    props_by_id = {r["id_istat"]: r for r in rows}
    features = []
    for feat in geo["features"]:
        cid = feat["properties"]["pro_com_t"]
        p = props_by_id.get(cid)
        if p is None:
            continue
        features.append({
            "type": "Feature",
            "geometry": feat["geometry"],
            "properties": p,
        })
    geojson_out = {
        "type": "FeatureCollection",
        "crs": geo.get("crs"),
        "features": features,
    }
    geo_path = OUT / "sicilia_clima_export.geojson"
    json.dump(geojson_out, open(geo_path, "w"), ensure_ascii=False)
    print(f"GeoJSON: {geo_path} ({len(features)} feature)")


if __name__ == "__main__":
    main()
