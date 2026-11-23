"""Réplica en Python de la estimación local del navegador (tipo C), para la auditoría de paridad.

Reproduce ``webapp/static/js/analisis_poligono.js`` (acumulación) y la rasterización del
polígono sobre la malla Web Mercator de cada subcuenca. Se usa solo para comparar contra
el cálculo directo de Earth Engine (``scripts/auditoria/d_paridad.py``).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

R = 6378137.0
ANIOS_HANSEN = (21, 22, 23, 24, 25)  # códigos de pérdida 2021–2025 en hansen.v.png
CAPAS = ("aux", "jrc_2025", "hansen", "esri_cambio", "sinia_2021", "coincidencia", "riparia", "eri", "ndvi_cambio", "gedi")


def _merc(lon, lat):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def transformador(limites, ancho, alto):
    (s, o), (n, e) = limites
    x0, y0 = _merc(o, s)
    x1, y1 = _merc(e, n)
    return lambda lon, lat: (((_merc(lon, lat)[0] - x0) / (x1 - x0)) * ancho, ((y1 - _merc(lon, lat)[1]) / (y1 - y0)) * alto)


def poligonos(g):
    t = g.get("type")
    if t == "Feature":
        return poligonos(g["geometry"])
    if t == "FeatureCollection":
        return [p for f in g["features"] for p in poligonos(f)]
    if t == "Polygon":
        return [g["coordinates"]]
    if t == "MultiPolygon":
        return g["coordinates"]
    return []


def mascara(geo, limites, ancho, alto):
    import numpy as np
    from PIL import Image, ImageDraw

    a = transformador(limites, ancho, alto)
    img = Image.new("L", (ancho, alto), 0)
    d = ImageDraw.Draw(img)
    for anillos in poligonos(geo):
        for k, anillo in enumerate(anillos):
            d.polygon([a(lon, lat) for lon, lat in anillo], fill=255 if k == 0 else 0)
    return (np.asarray(img) > 127).astype("uint8").ravel()


def nuevo_acumulador():
    return {"area_ha": 0.0, "linea_base_ha": 0.0, "ndvi_valido_ha": 0.0, "ndvi_descenso_ha": 0.0, "gedi_valido_ha": 0.0,
            "gedi_suma": 0.0, "gedi_n": 0, "jrc": {}, "hansen": {}, "esri": {}, "sinia": {}, "coincidencia": {}, "riparia": {},
            "eri_suma": 0.0, "eri_n": 0, "ndvi_suma": 0.0, "ndvi_n": 0, "corredor_ha": 0.0, "meso": False}


def acumular(acc, capas: dict[str, Any], masc, corredor, ha_pixel: float, codec: dict[str, Any]):
    """Misma lógica que ``acumular`` del navegador (vectorizada)."""
    import numpy as np

    aux = capas["aux"]
    dentro = (masc == 1) & (aux != 255)
    acc["area_ha"] += float(dentro.sum()) * ha_pixel
    for bit, clave in ((1, "linea_base_ha"), (2, "ndvi_valido_ha"), (4, "ndvi_descenso_ha")):
        acc[clave] += float((dentro & ((aux & bit) > 0)).sum()) * ha_pixel
    if "gedi" in capas:
        g = dentro & ((aux & 8) > 0) & (capas["gedi"] != 255)
        acc["gedi_valido_ha"] += float(g.sum()) * ha_pixel
        acc["gedi_suma"] += float((codec["gedi"]["minimo"] + capas["gedi"][g] * codec["gedi"]["paso"]).sum())
        acc["gedi_n"] += int(g.sum())
    for clave, destino in (("jrc_2025", "jrc"), ("hansen", "hansen"), ("esri_cambio", "esri"), ("sinia_2021", "sinia"), ("coincidencia", "coincidencia"), ("riparia", "riparia")):
        if clave in capas:
            v = capas[clave][dentro & (capas[clave] != 255)]
            for codigo, n in zip(*np.unique(v, return_counts=True)):
                acc[destino][int(codigo)] = acc[destino].get(int(codigo), 0.0) + float(n) * ha_pixel
    for clave, destino in (("eri", "eri"), ("ndvi_cambio", "ndvi")):
        if clave in capas:
            sel = dentro & (capas[clave] != 255)
            acc[f"{destino}_suma"] += float((codec[clave]["minimo"] + capas[clave][sel] * codec[clave]["paso"]).sum())
            acc[f"{destino}_n"] += int(sel.sum())
    if corredor is not None:
        acc["corredor_ha"] += float((dentro & (corredor > 0)).sum()) * ha_pixel
        acc["meso"] = acc["meso"] or bool((dentro & (corredor == 2)).any())
    return acc


def metricas(acc):
    area = acc["area_ha"] or 0.0
    pct = lambda v: v / area * 100 if area else 0.0  # noqa: E731
    j, e = acc["jrc"], acc["esri"]
    return {
        "area_ha": area,
        "tmf_deforestacion_ha": j.get(3, 0.0), "tmf_deforestacion_pct": pct(j.get(3, 0.0)),
        "tmf_degradacion_ha": j.get(2, 0.0), "tmf_degradacion_pct": pct(j.get(2, 0.0)),
        "hansen_post_2020_ha": sum(acc["hansen"].get(y, 0.0) for y in ANIOS_HANSEN),
        "esri_salida_arboles_ha": e.get(1, 0.0), "esri_salida_arboles_pct": pct(e.get(1, 0.0)),
        "gedi_altura_media_m": acc["gedi_suma"] / acc["gedi_n"] if acc["gedi_n"] else 0.0,
        "gedi_cobertura_valida_pct": pct(acc["gedi_valido_ha"]), "linea_base_arborea_pct": pct(acc["linea_base_ha"]),
        "ndvi_disminucion_ha": acc["ndvi_descenso_ha"], "ndvi_disminucion_pct": pct(acc["ndvi_descenso_ha"]),
        "ndvi_cobertura_valida_pct": pct(acc["ndvi_valido_ha"]),
    }


def estimar(geo, territorios: list[dict[str, Any]], dir_mapas: Path, codec: dict[str, Any],
            geometrias: dict[str, Any] | None = None):
    """Estimación local para un polígono sobre los territorios indicados.

    ``geometrias`` (id → GeoJSON) limita cada malla a su territorio: las mallas de
    subcuencas vecinas se solapan y fuera de su territorio no tienen datos válidos.
    """
    import numpy as np
    from PIL import Image

    acc = nuevo_acumulador()
    for t in territorios:
        m = t.get("mapas") or {}
        if "aux" not in (m.get("valores") or []):
            continue
        capas = {}
        ancho = alto = None
        for c in CAPAS:
            ruta = dir_mapas / t["id"] / f"{c}.v.png"
            if c in m["valores"] and ruta.exists():
                img = Image.open(ruta)
                ancho, alto = img.size
                capas[c] = np.asarray(img, dtype="uint8").ravel()
        masc = mascara(geo, m["limites"], ancho, alto)
        if geometrias and geometrias.get(t["id"]) is not None:
            masc = masc & mascara(geometrias[t["id"]], m["limites"], ancho, alto)
        acumular(acc, capas, masc, None, (m["tamano_pixel_m"] ** 2) / 10_000, codec)
    return acc
