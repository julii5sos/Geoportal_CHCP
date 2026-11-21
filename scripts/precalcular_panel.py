"""Precalcula los indicadores del Panel de monitoreo para la CHCP y sus 53 subcuencas.

Usa exactamente los mismos motores que la plataforma web (preevaluación
MT-2026.7, estructura oficial 2021, corredores y coberturas SINIA de tres
categorías) y guarda un resumen compacto en ``data/estadisticas_territoriales.json``.
El panel lee ese archivo y no vuelve a llamar a Earth Engine al navegar.

Es reanudable: cada territorio se guarda al terminar y, si se interrumpe, la
siguiente ejecución continúa donde quedó. Use ``--rehacer`` para recalcular todo.

    python scripts/precalcular_panel.py                 # todo (20–60 min)
    python scripts/precalcular_panel.py --limite 3      # prueba rápida
    python scripts/precalcular_panel.py --sin-estructura
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

from chcp.nucleo.metodologia_indice import METODOLOGIA_VERSION  # noqa: E402
from chcp.territorio.territorio_local import coleccion_subcuencas  # noqa: E402
from webapp.models import (  # noqa: E402
    AreaSelection, EcologicalEvaluationRequest, IntegratedEvaluationRequest, SiniaCoverageRequest,
)
from webapp.service import (  # noqa: E402
    run_ecological_evaluation, run_integrated_evaluation, run_sinia_coverages,
)

SALIDA = RAIZ / "data" / "estadisticas_territoriales.json"
CLASES_JRC = ("tmf_estable", "tmf_degradacion", "tmf_deforestacion", "tmf_recuperacion",
              "tmf_agua", "tmf_otra_cobertura")


def _territorios() -> list[dict]:
    lista = [{"id": "chcp", "nombre": "Cuenca Hidrográfica del Canal de Panamá", "grupo": "Cuenca",
              "area": {"mode": "basin"}}]
    for feature in coleccion_subcuencas()["features"]:
        p = feature["properties"]
        lista.append({"id": p["id"], "nombre": p["nombre"], "grupo": p.get("grupo", "Subcuencas"),
                      "area": {"mode": "subbasin", "subbasin": p["nombre"]}})
    return lista


def _compactar_estructura(estructura: dict | None) -> dict | None:
    if not estructura:
        return None
    clase = estructura.get("metricas_clase") or {}
    red = estructura.get("metricas_red") or {}
    corredor = estructura.get("conexion_corredor") or {}
    return {
        "metricas_clase": {k: v for k, v in clase.items() if isinstance(v, (int, float, str, type(None)))},
        "metricas_red": {k: v for k, v in red.items() if isinstance(v, (int, float, str, type(None)))},
        "conecta_corredor": corredor.get("conecta"),
        "corredor_nombre": corredor.get("corredor_nombre"),
    }


def _compactar(territorio: dict, evaluacion: dict, estructura: dict | None, corredores: dict, sinia: dict) -> dict:
    m = evaluacion["metrics"]
    visita = evaluacion.get("visit_priority") or {}
    return {
        "id": territorio["id"],
        "nombre": territorio["nombre"],
        "grupo": territorio["grupo"],
        "area_ha": m.get("area_ha"),
        "preevaluacion": {
            "puntaje": evaluacion["score"],
            "puntaje_maximo": evaluacion["maximum_score"],
            "prioridad": evaluacion["priority"],
            "senales": evaluacion["signals"],
            "aportes": evaluacion["contributions"],
            "consistencia": (evaluacion.get("consistency") or {}).get("nivel"),
            "fuentes_deterioro": (evaluacion.get("consistency") or {}).get("fuentes_deterioro", []),
            "prioridad_visita": visita.get("prioridad_visita"),
            "puntaje_visita": visita.get("puntaje_integrado"),
            "combinacion_territorial": visita.get("combinacion_territorial"),
            "lectura_integrada": visita.get("lectura_integrada"),
        },
        "jrc_ha": {k: m.get(k) for k in CLASES_JRC},
        "hansen_post_2020_ha": m.get("hansen_post"),
        "esri": {k: m.get(k) for k in ("esri_salida", "esri_ganancia", "esri_estable", "esri_arboles_final")},
        "ndvi": {k: m.get(k) for k in ("ndvi_inicial_medio", "ndvi_final_medio", "ndvi_delta_medio", "ndvi_disminucion")},
        "gedi_altura_m": m.get("gedi_altura"),
        "serie_anual": evaluacion.get("annual_series", []),
        "sinia": [
            {k: p[k] for k in ("year", "name", "classified_ha", "forest_ha", "forest_pct", "unclassified_or_nodata_ha", "classes")}
            for p in sinia["products"]
        ],
        "corredores": {
            "area_ha": corredores.get("area_en_corredores_ha"),
            "porcentaje": corredores.get("porcentaje_aoi_en_corredores"),
            "intersecta_mesoamericano": corredores.get("intersecta_mesoamericano"),
            "distancia_mas_cercano_m": corredores.get("distancia_corredor_mas_cercano_m"),
            "lista": [
                {"nombre": c.get("nombre"), "categoria": c.get("categoria_etiqueta") or c.get("categoria"),
                 "interseccion_ha": c.get("interseccion_ha")}
                for c in corredores.get("corredores", [])
            ],
        },
        "estructura_2021": _compactar_estructura(estructura),
    }


def _guardar(datos: dict) -> None:
    datos["generado"] = datetime.now().isoformat(timespec="seconds")
    temporal = SALIDA.with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    temporal.replace(SALIDA)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--rehacer", action="store_true", help="Recalcular también los territorios ya guardados")
    parser.add_argument("--limite", type=int, default=0, help="Procesar solo N territorios pendientes")
    parser.add_argument("--sin-estructura", action="store_true", help="Omitir fragmentación y conectividad 2021")
    parser.add_argument("--distancia", type=float, default=500, help="Umbral entre parches en metros")
    args = parser.parse_args()

    datos = {"metodologia": METODOLOGIA_VERSION, "proyecto": os.environ["GEE_PROJECT_ID"],
             "umbral_conectividad_m": args.distancia, "territorios": {}, "errores": {}}
    if SALIDA.exists() and not args.rehacer:
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        if previo.get("metodologia") == METODOLOGIA_VERSION:
            datos["territorios"] = previo.get("territorios", {})

    pendientes = [t for t in _territorios() if t["id"] not in datos["territorios"]]
    if args.limite:
        pendientes = pendientes[: args.limite]
    print(f"{len(datos['territorios'])} territorios ya calculados; {len(pendientes)} pendientes.")

    for numero, territorio in enumerate(pendientes, 1):
        inicio = time.time()
        etiqueta = f"[{numero}/{len(pendientes)}] {territorio['nombre']}"
        try:
            area = AreaSelection(**territorio["area"])
            estructura = None
            if territorio["id"] == "chcp" or args.sin_estructura:
                respuesta = run_ecological_evaluation(EcologicalEvaluationRequest(area=area))
                evaluacion = respuesta["result"]
            else:
                respuesta = run_integrated_evaluation(IntegratedEvaluationRequest(
                    area=area, maximum_distance_m=args.distancia, minimum_patch_area_ha=0,
                    selected_components=["ecological", "fragmentation", "connectivity"],
                ))
                evaluacion = respuesta["result"]["evaluation"]
                estructura = respuesta["result"]["structure"]
            sinia = run_sinia_coverages(SiniaCoverageRequest(area=area))["result"]
            datos["territorios"][territorio["id"]] = _compactar(
                territorio, evaluacion, estructura, respuesta.get("corridor_context") or {}, sinia
            )
            datos["errores"].pop(territorio["id"], None)
            print(f"{etiqueta}: {evaluacion['score']} pts ({evaluacion['priority']}) · {time.time() - inicio:.0f} s")
        except Exception as exc:  # se registra y se continúa con el siguiente territorio
            datos["errores"][territorio["id"]] = f"{type(exc).__name__}: {exc}"
            print(f"{etiqueta}: ERROR {exc}")
            traceback.print_exc(limit=1)
        _guardar(datos)

    total = len(_territorios())
    print(f"Listo: {len(datos['territorios'])}/{total} territorios en {SALIDA}")
    if datos["errores"]:
        print(f"Con errores: {', '.join(datos['errores'])}. Vuelva a ejecutar para reintentarlos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
