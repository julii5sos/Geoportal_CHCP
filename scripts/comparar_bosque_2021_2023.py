"""Compara el bosque oficial de MiAMBIENTE 2021 y 2023 en cada territorio, sin Earth Engine.

Usa los rasters de códigos ya precalculados de las coberturas generales
(``data/coberturas/mapas/<id>/2021_general.v.png`` y ``2023_general.v.png``). En los dos
productos el código 1 es «Bosques y otras tierras boscosas». Ambos años están en la misma
malla, así que se miden igual los dos.

Por territorio escribe:

* ``data/coberturas/comparacion/<id>.json``: para cada año, los parches (8 vecinos), el
  parche mayor, las redes separadas a 500 m (la misma distancia umbral de la ficha) y el
  bosque dentro de los corredores del Almanaque Azul y del Corredor Biológico Mesoamericano.
* ``data/coberturas/mapas/<id>/bosque_2021_2023.v.png``: 1 = bosque en ambos mapas,
  2 = solo en 2021, 3 = solo en 2023, 0 = sin bosque en ninguno, 255 = fuera del territorio.

La superficie total de bosque se toma de las estadísticas nativas de cada producto
(``data/coberturas/estadisticas``). Las demás superficies salen del raster remuestreado y son
aproximadas. Los dos mapas se hicieron con métodos distintos (vector 1:25.000 y ráster de
10 m), así que la diferencia mezcla cambio real y diferencias de método: es una comparación
de diagnósticos paralelos, no una medición de cambio.

Uso: python scripts/comparar_bosque_2021_2023.py [--territorios s48 s25]
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

RAIZ = Path(__file__).resolve().parents[1]
COB = RAIZ / "data" / "coberturas"
UMBRAL_M = 500.0
CODIGO_BOSQUE = 1  # «Bosques y otras tierras boscosas» en 2021_general y 2023_general
PRODUCTOS = {"2021": "2021_general", "2023": "2023_general"}
R = 6378137.0
OCHO = np.ones((3, 3), dtype=bool)


def _merc(lat: float, lon: float) -> tuple[float, float]:
    return math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def mascara_poligonos(features: list[dict], limites, forma) -> np.ndarray:
    """Rasteriza polígonos GeoJSON (lon, lat) en la malla EPSG:3857 del territorio."""
    (s, o), (n, e) = limites
    alto, ancho = forma
    x0, y0 = _merc(s, o)
    x1, y1 = _merc(n, e)
    img = Image.new("L", (ancho, alto), 0)
    dib = ImageDraw.Draw(img)

    def px(anillo):
        out = []
        for lon, lat, *_ in anillo:
            x, y = _merc(lat, lon)
            out.append(((x - x0) / (x1 - x0) * ancho, (y1 - y) / (y1 - y0) * alto))
        return out

    for f in features:
        g = f["geometry"]
        poligonos = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for pol in poligonos:
            dib.polygon(px(pol[0]), fill=1)
            for hueco in pol[1:]:
                dib.polygon(px(hueco), fill=0)
    return np.array(img, dtype=bool)


def metricas(bosque: np.ndarray, pixel_m: float, corr: np.ndarray, cbm: np.ndarray) -> dict:
    ha_px = pixel_m * pixel_m / 1e4
    etiquetas, n = ndimage.label(bosque, structure=OCHO)
    areas = np.bincount(etiquetas.ravel())[1:] * ha_px if n else np.array([])
    # Dos parches quedan en la misma red si están a 500 m o menos: sus franjas de 250 m se tocan.
    cerca = ndimage.distance_transform_edt(~bosque, sampling=pixel_m) <= UMBRAL_M / 2
    redes, _ = ndimage.label(cerca, structure=OCHO)
    red_de_bosque = redes[bosque]
    ids_red = np.unique(red_de_bosque)
    bosque_por_red = np.bincount(red_de_bosque) * ha_px if red_de_bosque.size else np.array([0.0])
    total = float(bosque.sum() * ha_px)
    return {
        "numero_parches": int(n),
        "parche_mayor_ha": round(float(areas.max()), 1) if n else 0.0,
        "area_media_parche_ha": round(float(areas.mean()), 2) if n else 0.0,
        "parches_menores_1ha": int((areas < 1).sum()) if n else 0,
        "redes_separadas": int(ids_red.size),
        "pct_bosque_red_mayor": round(float(bosque_por_red.max()) / total * 100, 1) if total else 0.0,
        "bosque_corredores_ha": round(float((bosque & corr).sum() * ha_px), 1),
        "bosque_cbm_ha": round(float((bosque & cbm).sum() * ha_px), 1),
    }


def png_gris(ruta: Path, arr: np.ndarray) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr.astype(np.uint8), mode="L").save(ruta, optimize=True)


def comparar(tid: str, info: dict, corredores: list[dict]) -> dict | None:
    mapas = info["mapas"]
    if not all(p in mapas for p in PRODUCTOS.values()):
        return None
    g21, g23 = (mapas[p] for p in PRODUCTOS.values())
    if g21["limites"] != g23["limites"] or g21["dimensiones"] != g23["dimensiones"]:
        raise SystemExit(f"{tid}: 2021 y 2023 no comparten malla.")
    arr = {a: np.array(Image.open(COB / "mapas" / tid / f"{p}.v.png")) for a, p in PRODUCTOS.items()}
    dentro = (arr["2021"] != 0) & (arr["2021"] != 255) & (arr["2023"] != 0) & (arr["2023"] != 255)
    b21 = (arr["2021"] == CODIGO_BOSQUE) & dentro
    b23 = (arr["2023"] == CODIGO_BOSQUE) & dentro
    forma = b21.shape
    es_meso = [f for f in corredores if f["properties"].get("es_mesoamericano") or re.search("mesoamericano", f["properties"].get("nombre", ""), re.I)]
    corr = mascara_poligonos(corredores, g21["limites"], forma) & dentro
    cbm = mascara_poligonos(es_meso, g21["limites"], forma) & dentro
    pixel_m = float(g21["tamano_pixel_m"])
    stats = json.loads((COB / "estadisticas" / f"{tid}.json").read_text(encoding="utf-8"))
    nativo = {a: next((c["area_ha"] for c in stats[p]["classes"] if c["code"] == CODIGO_BOSQUE), None) for a, p in PRODUCTOS.items()}

    cambio = np.full(forma, 255, dtype=np.uint8)
    cambio[dentro] = 0
    cambio[b21 & b23] = 1
    cambio[b21 & ~b23] = 2
    cambio[~b21 & b23] = 3
    png_gris(COB / "mapas" / tid / "bosque_2021_2023.v.png", cambio)
    ha_px = pixel_m * pixel_m / 1e4
    return {
        "territorio": tid,
        "pixel_m": pixel_m,
        "limites": g21["limites"],
        "umbral_m": UMBRAL_M,
        "corredores_en_area": bool(corr.any()),
        "cbm_en_area": bool(cbm.any()),
        "anios": {a: {"bosque_ha": round(nativo[a], 1) if nativo[a] is not None else None,
                      **metricas(b, pixel_m, corr, cbm)} for a, b in (("2021", b21), ("2023", b23))},
        "cambio": {"en_ambos_ha": round(float((b21 & b23).sum() * ha_px), 1),
                   "solo_2021_ha": round(float((b21 & ~b23).sum() * ha_px), 1),
                   "solo_2023_ha": round(float((~b21 & b23).sum() * ha_px), 1)},
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--territorios", nargs="*")
    args = ap.parse_args()
    indice = json.loads((COB / "indice.json").read_text(encoding="utf-8"))["territorios"]
    corredores = json.loads((RAIZ / "data" / "corredores_almanaque_azul.geojson").read_text(encoding="utf-8"))["features"]
    hechos = 0
    for tid, info in indice.items():
        if args.territorios and tid not in args.territorios:
            continue
        r = comparar(tid, info, corredores)
        if r is None:
            continue
        r["metodo"] = ("Mismo raster de códigos para los dos años (código 1, «Bosques y otras tierras boscosas»), "
                       "parches con 8 vecinos y redes a 500 m. Diagnósticos paralelos: no mide cambio real.")
        destino = COB / "comparacion" / f"{tid}.json"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
        hechos += 1
    print(f"Comparación 2021–2023 lista para {hechos} territorios.")


if __name__ == "__main__":
    main()
