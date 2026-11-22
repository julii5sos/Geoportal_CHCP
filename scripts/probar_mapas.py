"""Prueba rápida de los mapas de la ficha y del análisis ripario para una subcuenca.

    python scripts/probar_mapas.py "Qda. Honda"

Escribe los PNG en ``salida_prueba_mapas/<id>/`` (fuera de ``data/``) e imprime el
resumen ripario. Sirve para comprobar permisos y tiempos antes del recálculo completo.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))
os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

import ee  # noqa: E402

from chcp.gee.mapas_ficha import calcular_riparia, generar_mapas, rios_principales  # noqa: E402
from chcp.territorio.territorio_local import coleccion_subcuencas  # noqa: E402
from webapp.models import AreaSelection  # noqa: E402
from webapp.service import _initialize_ee, resolve_area  # noqa: E402


def main() -> int:
    nombre = sys.argv[1] if len(sys.argv) > 1 else "Qda. Honda"
    sub = next((f["properties"] for f in coleccion_subcuencas()["features"] if f["properties"]["nombre"] == nombre), None)
    if not sub:
        print(f"No existe la subcuenca «{nombre}».")
        return 1
    _initialize_ee()
    geometria, _ = resolve_area(AreaSelection(mode="subbasin", subbasin=nombre))
    destino = RAIZ / "salida_prueba_mapas" / sub["id"]
    inicio = time.time()
    meta = generar_mapas(geometria, destino, ee_module=ee)
    print(f"Mapas: {meta['capas']} · píxel {meta['tamano_pixel_m']} m · {time.time() - inicio:.0f} s")
    if meta["errores"]:
        print("Errores:", json.dumps(meta["errores"], ensure_ascii=False, indent=1))
    print(f"Ríos HydroSHEDS: {len(rios_principales(geometria, ee_module=ee)['features'])} tramos")
    print(json.dumps(calcular_riparia(geometria, ee_module=ee, area_ha=sub.get("area_ha")), ensure_ascii=False, indent=1))
    print(f"Archivos en {destino}")
    return 0 if meta["capas"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
