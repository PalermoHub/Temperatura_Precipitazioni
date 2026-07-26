"""Estrae e dissolve i comuni della Sicilia dal pmtiles gbvitrano.it/anncus."""

import geopandas as gpd

SRC = "data/processed/comuni_sicilia_pmtiles_raw.gpkg"
OUT = "data/processed/comuni_sicilia.gpkg"

gdf = gpd.read_file(SRC)
print(f"Feature grezze (con duplicati da tiling): {len(gdf)}")

# dissolve: ogni comune e' spezzato in piu' pezzi ai bordi delle tile MVT
gdf = gdf.dissolve(by="pro_com_t", as_index=False)

print(f"Comuni dopo dissolve: {len(gdf)}")
gdf.to_file(OUT, driver="GPKG")
print(f"Salvato: {OUT}")
