"""Ríos del IGNTG (2022, 1:25 000) recortados a un territorio de la CHCP, sin Earth Engine.

La red publicada en ``data/hidrografia/rios_igntg_chcp.geojson`` cubre la cuenca + 2 km y la
genera ``scripts/preparar_hidrografia_igntg.py``. Sustituye a HydroSHEDS en los mapas.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[2]
RIOS_IGNTG = RAIZ / "data" / "hidrografia" / "rios_igntg_chcp.geojson"
FUENTE_RIOS = "IGNTG 2022 · hidrografía 1:25 000"


def disponible() -> bool:
    return RIOS_IGNTG.exists()


@lru_cache(maxsize=1)
def _red():
    from shapely.geometry import shape
    from shapely.strtree import STRtree

    datos = json.loads(RIOS_IGNTG.read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in datos["features"]]
    return datos["features"], geoms, STRtree(geoms)


def _redondear(c):
    return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], float) else [_redondear(x) for x in c]


def rios_igntg(geojson: dict[str, Any]) -> dict[str, Any]:
    """Cauces del IGNTG dentro del territorio (Feature, FeatureCollection o geometría)."""
    from shapely.geometry import shape
    from shapely.ops import unary_union

    if geojson.get("type") == "FeatureCollection":
        area = unary_union([shape(f["geometry"]) for f in geojson["features"]])
    else:
        area = shape(geojson.get("geometry", geojson))
    area = area.buffer(0)
    features, geoms, arbol = _red()
    salida = []
    for i in arbol.query(area, predicate="intersects"):
        recorte = geoms[int(i)].intersection(area)
        lineas = [list(g.coords) for g in getattr(recorte, "geoms", [recorte])
                  if g.geom_type == "LineString" and not g.is_empty]
        if not lineas:
            continue
        geometria = ({"type": "LineString", "coordinates": _redondear(lineas[0])} if len(lineas) == 1
                     else {"type": "MultiLineString", "coordinates": _redondear(lineas)})
        salida.append({"type": "Feature", "properties": dict(features[int(i)]["properties"]), "geometry": geometria})
    return {"type": "FeatureCollection", "fuente": FUENTE_RIOS, "features": salida}
