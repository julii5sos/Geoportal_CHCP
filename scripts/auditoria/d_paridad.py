"""Auditoría D.5: paridad entre Earth Engine directo (tipo A) y la estimación local (tipo C).

    python scripts/auditoria/d_paridad.py            # requiere credenciales de Earth Engine

Construye seis polígonos de prueba a partir de los límites reales (pequeño, mediano, extenso,
irregular, que cruza subcuencas y junto al límite de la CHCP), los evalúa con el motor MT-2026.7
en Earth Engine y con la réplica de la estimación local sobre los mapas de valores publicados, y
escribe ``docs/auditoria/datos/D_paridad.json`` con diferencias absolutas y relativas.
"""

from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))
os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

METRICAS = ("area_ha", "tmf_deforestacion_ha", "tmf_degradacion_ha", "hansen_post_2020_ha", "esri_salida_arboles_ha",
            "ndvi_disminucion_ha", "gedi_altura_media_m", "ndvi_cobertura_valida_pct", "gedi_cobertura_valida_pct")
METRICAS_EE = {"area_ha": "area_ha", "tmf_deforestacion_ha": "tmf_deforestacion", "tmf_degradacion_ha": "tmf_degradacion",
               "hansen_post_2020_ha": "hansen_post", "esri_salida_arboles_ha": "esri_salida", "ndvi_disminucion_ha": "ndvi_disminucion",
               "gedi_altura_media_m": "gedi_altura", "ndvi_cobertura_valida_pct": "ndvi_cobertura_pct", "gedi_cobertura_valida_pct": "gedi_cobertura_pct"}


def casos():
    from pyproj import Transformer
    from shapely.geometry import Point, mapping, shape
    from shapely.ops import transform, unary_union

    from chcp.territorio.territorio_local import coleccion_subcuencas

    a_utm = Transformer.from_crs(4326, 32617, always_xy=True).transform
    a_wgs = Transformer.from_crs(32617, 4326, always_xy=True).transform
    subs = {f["properties"]["id"]: transform(a_utm, shape(f["geometry"])) for f in coleccion_subcuencas()["features"]}
    cuenca = unary_union(list(subs.values()))
    grande = max(subs.values(), key=lambda g: g.area)
    centro = grande.representative_point()
    def cuadrado(p, ha):
        lado = math.sqrt(ha * 10_000)
        return Point(p.x, p.y).buffer(lado / 2, cap_style=3)
    estrella = Point(centro.x, centro.y).buffer(900).difference(Point(centro.x + 500, centro.y).buffer(450)).union(
        Point(centro.x - 700, centro.y + 700).buffer(300))
    ids = list(subs)
    vecinas = next(((a, b) for i, a in enumerate(ids) for b in ids[i + 1:] if subs[a].touches(subs[b]) or subs[a].intersects(subs[b])), None)
    frontera = subs[vecinas[0]].buffer(1).intersection(subs[vecinas[1]].buffer(1))
    p_frontera = frontera.representative_point() if not frontera.is_empty else centro
    borde = cuenca.exterior.interpolate(0.3, normalized=True) if hasattr(cuenca, "exterior") else cuenca.boundary.interpolate(0.3, normalized=True)
    definiciones = {
        "pequeno_5ha": cuadrado(centro, 5),
        "mediano_100ha": cuadrado(centro, 100),
        "extenso_2000ha": cuadrado(centro, 2000).intersection(grande),
        "irregular": estrella,
        "cruza_subcuencas": Point(p_frontera.x, p_frontera.y).buffer(700),
        "junto_al_limite": Point(borde.x, borde.y).buffer(800).intersection(cuenca),
    }
    return {k: mapping(transform(a_wgs, g)) for k, g in definiciones.items()}


def comparar(ee_m: dict, loc: dict) -> dict:
    filas = {}
    for k in METRICAS:
        a, b = float(ee_m.get(METRICAS_EE[k]) or 0), float(loc.get(k) or 0)
        filas[k] = {"earth_engine": round(a, 4), "local": round(b, 4), "dif_abs": round(b - a, 4),
                    "dif_rel_pct": None if not a else round((b - a) / a * 100, 2)}
    return filas


def main() -> int:
    import ee

    from chcp.gee.gee_config import desactivar_teselas
    from chcp.gee.mapas_ficha import CODIFICACION_VALORES
    from chcp.nucleo import estimacion_local as EL
    from chcp.nucleo import metodologia_indice as MI
    from shapely.geometry import shape
    from webapp.models import AreaSelection, EcologicalEvaluationRequest
    from webapp.service import run_ecological_evaluation

    desactivar_teselas(ee)
    datos = json.loads((RAIZ / "data" / "estadisticas_territoriales.json").read_text(encoding="utf-8"))
    from chcp.territorio.territorio_local import coleccion_subcuencas
    subs = coleccion_subcuencas()["features"]
    resultados = {}
    for nombre, geo in casos().items():
        g = shape(geo)
        terr = [datos["territorios"][f["properties"]["id"]] for f in subs if shape(f["geometry"]).intersects(g) and f["properties"]["id"] in datos["territorios"]]
        loc_acc = EL.estimar(geo, terr, RAIZ / "data" / "mapas", CODIFICACION_VALORES)
        loc = EL.metricas(loc_acc)
        s_loc, _ = MI.evaluar_senales(**{k: v for k, v in loc.items() if k != "area_ha"})
        _, p_loc, c_loc = MI.calcular_indice_prioridad(senal_tmf=s_loc["tmf"], senal_hansen=s_loc["hansen"], senal_esri=s_loc["esri"], senal_gedi=s_loc["gedi"], senal_ndvi=s_loc["ndvi"])
        r = run_ecological_evaluation(EcologicalEvaluationRequest(area=AreaSelection(mode="draw", geometry=geo)))["result"]
        pixel = max((t.get("mapas") or {}).get("tamano_pixel_m") or 0 for t in terr) if terr else None
        resultados[nombre] = {
            "area_geometrica_ha": round(r["metrics"]["area_ha"], 3), "pixel_malla_m": pixel,
            "metricas": comparar(r["metrics"], loc),
            "senales": {"earth_engine": r["signals"], "local": s_loc},
            "puntaje": {"earth_engine": r["score"], "local": p_loc}, "categoria": {"earth_engine": r["priority"], "local": c_loc},
        }
        print(nombre, resultados[nombre]["puntaje"], resultados[nombre]["metricas"]["area_ha"])
    salida = RAIZ / "docs" / "auditoria" / "datos" / "D_paridad.json"
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps({"fecha": datetime.now().isoformat(timespec="seconds"), "casos": resultados}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
