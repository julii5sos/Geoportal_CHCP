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
    AreaSelection, EcologicalEvaluationRequest, EriRequest, IntegratedEvaluationRequest, SiniaCoverageRequest,
)
from webapp.service import (  # noqa: E402
    _initialize_ee, resolve_area, run_ecological_evaluation, run_eri, run_integrated_evaluation, run_sinia_coverages,
)
from chcp.gee.mapas_ficha import CAPAS, CODIFICACION_VALORES, calcular_riparia, generar_mapas, rios_principales, sitios_verificacion  # noqa: E402
import ee  # noqa: E402

from chcp.gee.gee_config import desactivar_teselas  # noqa: E402

desactivar_teselas(ee)  # el precálculo solo necesita números, no capas de mapa

SALIDA = RAIZ / "data" / "estadisticas_territoriales.json"
DIR_GEOMETRIAS = RAIZ / "data" / "subcuencas"
DIR_MAPAS = RAIZ / "data" / "mapas"
# Versión del contenido del archivo: si cambia, se recalcula todo aunque no se use --rehacer.
VERSION_DATOS = 2
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
    campos_conector = ("patch_id", "area_ha", "indice_conector", "prioridad_conectividad", "grado", "componente")
    return {
        "metricas_clase": {k: v for k, v in clase.items() if isinstance(v, (int, float, str, type(None)))},
        "metricas_red": {k: v for k, v in red.items() if isinstance(v, (int, float, str, type(None)))},
        "metricas_paisaje": estructura.get("metricas_paisaje"),
        "top_conectores": [{k: c.get(k) for k in campos_conector} for c in (estructura.get("top_conectores") or [])[:5]],
        "brechas_potenciales": len((estructura.get("conexiones_potenciales_geojson") or {}).get("features", [])),
        "conecta_corredor": corredor.get("conecta"),
        "corredor_nombre": corredor.get("corredor_nombre"),
    }


def _redondear(coordenadas, decimales: int = 5):
    if isinstance(coordenadas, (int, float)):
        return round(coordenadas, decimales)
    return [_redondear(c, decimales) for c in coordenadas]


def _guardar_geometrias(identificador: str, estructura: dict | None) -> None:
    """Parches, brechas y ruta al corredor de la subcuenca para los mapas de la ficha."""
    if not estructura:
        return
    campos = ("patch_id", "area_ha", "indice_conector", "prioridad_conectividad", "componente", "esta_aislado")
    def limpiar(coleccion, propiedades=None):
        salida = []
        for f in (coleccion or {}).get("features", []):
            props = f.get("properties") or {}
            salida.append({"type": "Feature",
                           "properties": {k: props.get(k) for k in propiedades} if propiedades else props,
                           "geometry": {"type": f["geometry"]["type"], "coordinates": _redondear(f["geometry"]["coordinates"])}})
        return {"type": "FeatureCollection", "features": salida}
    DIR_GEOMETRIAS.mkdir(parents=True, exist_ok=True)
    datos = {
        "parches": limpiar(estructura.get("parches_geojson"), campos),
        "conexiones": limpiar(estructura.get("conexiones_geojson")),
        "brechas": limpiar(estructura.get("conexiones_potenciales_geojson")),
        "ruta_corredor": limpiar(estructura.get("ruta_corredor_geojson")),
        "red": estructura.get("red_simulacion"),
    }
    (DIR_GEOMETRIAS / f"{identificador}.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _compactar_eri(eri: dict | None) -> dict | None:
    if not eri:
        return None
    return {k: eri.get(k) for k in ("valor", "clase", "color", "lectura", "componentes", "componente_limitante_etiqueta",
                                    "distribucion_clases", "pesos", "anio_referencia", "fuentes")}


def _compactar(territorio: dict, evaluacion: dict, estructura: dict | None, corredores: dict, sinia: dict,
               eri: dict | None = None) -> dict:
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
        "eri": _compactar_eri(eri),
        "periodos": evaluacion.get("periods"),
    }


def _mapas_y_riparia(territorio: dict, registro: dict) -> None:
    """Mapas temáticos PNG, ríos principales y franjas riparias (complementarios)."""
    geometria, _ = resolve_area(AreaSelection(**territorio["area"]))
    destino = DIR_MAPAS / territorio["id"]
    registro["mapas"] = generar_mapas(geometria, destino, ee_module=ee)
    try:
        rios = rios_principales(geometria, ee_module=ee)
        (destino / "rios.json").write_text(json.dumps(
            {"type": "FeatureCollection", "features": [
                {**f, "geometry": {"type": f["geometry"]["type"], "coordinates": _redondear(f["geometry"]["coordinates"])}}
                for f in rios["features"]]}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        registro["mapas"]["rios"] = len(rios["features"])
    except Exception as exc:
        registro["mapas"]["rios"] = None
        print(f"    ríos: {exc}")
    if territorio["id"] != "chcp":
        try:
            registro["sitios"] = sitios_verificacion(geometria, territorio["id"], ee_module=ee)
        except Exception as exc:
            registro["sitios"] = []
            print(f"    sitios: {exc}")
    try:
        registro["riparia"] = calcular_riparia(geometria, ee_module=ee, area_ha=registro.get("area_ha"))
    except Exception as exc:
        registro["riparia"] = {"error": f"{type(exc).__name__}: {exc}"[:300]}
        print(f"    riparia: {exc}")


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
    parser.add_argument("--sin-mapas", action="store_true", help="Omitir mapas temáticos y análisis ripario")
    parser.add_argument("--solo-mapas", action="store_true",
                        help="Solo (re)generar mapas y análisis ripario de los territorios ya calculados")
    args = parser.parse_args()

    datos = {"metodologia": METODOLOGIA_VERSION, "version_datos": VERSION_DATOS, "proyecto": os.environ["GEE_PROJECT_ID"],
             "umbral_conectividad_m": args.distancia, "capas_mapa": CAPAS, "codificacion_valores": CODIFICACION_VALORES, "territorios": {}, "errores": {}}
    # Se conservan siempre los territorios ya publicados para que el sitio no quede
    # incompleto durante una actualización parcial (p. ej. --limite 1). Los de una
    # versión anterior de datos se marcan como pendientes y se reemplazan al recalcularlos.
    if SALIDA.exists():
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        datos["territorios"] = previo.get("territorios", {})
        if previo.get("version_datos") != VERSION_DATOS:
            for t in datos["territorios"].values():
                t.setdefault("version_datos", previo.get("version_datos") or 1)
    vigente = lambda t: (not args.rehacer and t.get("version_datos", VERSION_DATOS) == VERSION_DATOS
                         and t.get("metodologia", METODOLOGIA_VERSION) == METODOLOGIA_VERSION)

    if args.solo_mapas:
        _initialize_ee()
        objetivo = [t for t in _territorios() if t["id"] in datos["territorios"]]
        if args.limite:
            objetivo = objetivo[: args.limite]
        for numero, territorio in enumerate(objetivo, 1):
            inicio = time.time()
            try:
                _mapas_y_riparia(territorio, datos["territorios"][territorio["id"]])
                capas = datos["territorios"][territorio["id"]]["mapas"]["capas"]
                print(f"[{numero}/{len(objetivo)}] {territorio['nombre']}: {len(capas)} mapas · {time.time() - inicio:.0f} s")
            except Exception as exc:
                print(f"[{numero}/{len(objetivo)}] {territorio['nombre']}: ERROR {exc}")
            _guardar(datos)
        return 0

    if args.rehacer:
        for t in datos["territorios"].values():
            t["version_datos"] = -1  # pendiente, pero visible hasta que se recalcule
    pendientes = [t for t in _territorios() if t["id"] not in datos["territorios"] or not vigente(datos["territorios"][t["id"]])]
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
            try:
                eri = run_eri(EriRequest(area=area))["result"]
            except Exception as exc:  # el ERI es complementario: su fallo no bloquea el territorio
                eri = {"clase": None, "lectura": f"No calculado: {exc}"}
            datos["territorios"][territorio["id"]] = {"version_datos": VERSION_DATOS, **_compactar(
                territorio, evaluacion, estructura, respuesta.get("corridor_context") or {}, sinia, eri
            )}
            _guardar_geometrias(territorio["id"], estructura)
            if not args.sin_mapas:
                _mapas_y_riparia(territorio, datos["territorios"][territorio["id"]])
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
