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
import signal
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
from chcp.nucleo.procesamiento import metadatos_ejecucion  # noqa: E402
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
VERSION_DATOS = 4  # 3: distancias en UTM 17N y métricas completas del índice; 4: red ampliada del simulador y capa esri_2024
CLASES_JRC = ("tmf_estable", "tmf_degradacion", "tmf_deforestacion", "tmf_recuperacion",
              "tmf_agua", "tmf_otra_cobertura")


class TiempoAgotado(BaseException):
    """Un territorio superó su tiempo máximo: se registra como error y se sigue con el siguiente.

    Hereda de BaseException para que los ``except Exception`` de los cálculos complementarios
    (ríos, sitios, franja riparia, ERI) no lo absorban."""


def _limite_tiempo(segundos: int) -> None:
    """Programa (o cancela con 0) una alarma que interrumpe el territorio en curso.

    Evita que un solo territorio bloqueado consuma las 6 horas de GitHub Actions, como ocurrió
    el 2026-11-23 (una subcuenca pequeña quedó 5 h sin avanzar)."""
    if not hasattr(signal, "SIGALRM"):
        return
    def _alarma(_senal, _marco):
        raise TiempoAgotado(f"más de {segundos // 60} min en este territorio")
    signal.signal(signal.SIGALRM, _alarma)
    signal.alarm(max(int(segundos), 0))


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


def _geometria_redondeada(geometria: dict | None) -> dict | None:
    """Redondea una geometría GeoJSON, incluidas las GeometryCollection que a veces devuelve
    Earth Engine al recortar parches (no tienen ``coordinates`` sino ``geometries``)."""
    if not geometria:
        return None
    if geometria.get("type") == "GeometryCollection":
        partes = [g for g in (_geometria_redondeada(x) for x in geometria.get("geometries") or []) if g]
        poligonos = [g for g in partes if g["type"] in ("Polygon", "MultiPolygon")]
        if poligonos:
            # Solo interesa la superficie: los puntos o líneas sueltos que deja el recorte no tienen área.
            coords = []
            for g in poligonos:
                coords.extend([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"])
            return {"type": "MultiPolygon", "coordinates": coords}
        return {"type": "GeometryCollection", "geometries": partes} if partes else None
    if "coordinates" not in geometria:
        return None
    return {"type": geometria["type"], "coordinates": _redondear(geometria["coordinates"])}


def _guardar_geometrias(identificador: str, estructura: dict | None) -> None:
    """Parches, brechas y ruta al corredor de la subcuenca para los mapas de la ficha."""
    if not estructura:
        return
    campos = ("patch_id", "area_ha", "area_contexto_ha", "indice_conector", "prioridad_conectividad", "componente",
              "esta_aislado", "continua_fuera_area")
    def limpiar(coleccion, propiedades=None):
        salida = []
        for f in (coleccion or {}).get("features", []):
            props = f.get("properties") or {}
            geometria = _geometria_redondeada(f.get("geometry"))
            if geometria is None:
                continue
            salida.append({"type": "Feature",
                           "properties": {k: props.get(k) for k in propiedades} if propiedades else props,
                           "geometry": geometria})
        return {"type": "FeatureCollection", "features": salida}
    DIR_GEOMETRIAS.mkdir(parents=True, exist_ok=True)
    datos = {
        "parches": limpiar(estructura.get("parches_geojson"), campos),
        "conexiones": limpiar(estructura.get("conexiones_geojson")),
        "brechas": limpiar(estructura.get("conexiones_potenciales_geojson")),
        "ruta_corredor": limpiar(estructura.get("ruta_corredor_geojson")),
        "red": {k: v for k, v in (estructura.get("red_simulacion") or {}).items() if k != "contexto_geojson"} or None,
        "contexto": limpiar((estructura.get("red_simulacion") or {}).get("contexto_geojson")),
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
        # Todas las métricas del evaluador (superficies válidas por fuente incluidas) para auditar señales.
        "metricas_indice": {k: (round(v, 6) if isinstance(v, float) else v) for k, v in m.items() if isinstance(v, (int, float))},
        "procesado": datetime.now().isoformat(timespec="seconds"),
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


def _rios_territorio(geometria, *, ee_module=None):
    """Ríos del IGNTG recortados al territorio; HydroSHEDS solo si el IGNTG no tiene cauces allí."""
    from chcp.territorio import hidrografia

    if hidrografia.disponible():
        rios = hidrografia.rios_igntg(geometria)
        if rios["features"]:
            return rios, hidrografia.FUENTE_RIOS
    return rios_principales(geometria, ee_module=ee_module or ee), "HydroSHEDS · drenaje ≥ 10 km²"


def _mapas_y_riparia(territorio: dict, registro: dict) -> None:
    """Mapas temáticos PNG, ríos principales y franjas riparias (complementarios)."""
    geometria, _ = resolve_area(AreaSelection(**territorio["area"]))
    destino = DIR_MAPAS / territorio["id"]
    from chcp.gee.mapas_ficha import MAX_PIXELES_CUENCA, MAX_PIXELES_LADO
    t0 = time.time()
    paso = lambda nombre: print(f"    {nombre} ({time.time() - t0:.0f} s)", flush=True)  # noqa: E731
    paso("mapas…")
    registro["mapas"] = generar_mapas(geometria, destino, ee_module=ee,
                                      max_pixeles=MAX_PIXELES_CUENCA if territorio["id"] == "chcp" else MAX_PIXELES_LADO)
    paso("ríos…")
    try:
        rios, fuente = _rios_territorio(geometria)
        (destino / "rios.json").write_text(json.dumps(
            {"type": "FeatureCollection", "fuente": fuente, "features": [
                {**f, "geometry": _geometria_redondeada(f.get("geometry"))}
                for f in rios["features"] if _geometria_redondeada(f.get("geometry"))]}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        registro["mapas"]["rios"] = len(rios["features"])
        registro["mapas"]["rios_fuente"] = fuente
    except Exception as exc:
        registro["mapas"]["rios"] = None
        print(f"    ríos: {exc}")
    if territorio["id"] != "chcp":
        paso("sitios de verificación…")
        try:
            registro["sitios"] = sitios_verificacion(geometria, territorio["id"], ee_module=ee)
        except Exception as exc:
            registro["sitios"] = []
            print(f"    sitios: {exc}")
    paso("franja riparia…")
    try:
        registro["riparia"] = calcular_riparia(geometria, ee_module=ee, area_ha=registro.get("area_ha"))
    except Exception as exc:
        registro["riparia"] = {"error": f"{type(exc).__name__}: {exc}"[:300]}
        print(f"    riparia: {exc}")


REGISTRO = RAIZ / "data" / "registro_versiones.json"


def _registrar(datos: dict, inicio: str, procesados: int) -> None:
    """Registro de versiones: una entrada por ejecución (fuente, código, fecha, estado)."""
    from chcp.nucleo.procesamiento import estado_actualizacion

    registro = json.loads(REGISTRO.read_text(encoding="utf-8")) if REGISTRO.exists() else []
    estado = estado_actualizacion(datos)
    registro.append({
        "inicio": inicio, "fin": datetime.now().isoformat(timespec="seconds"),
        "version_codigo": datos["procesamiento"]["version_codigo"], "workflow_run": datos["procesamiento"]["workflow_run"],
        "metodologia": datos["metodologia"], "version_datos": datos["version_datos"],
        "territorios_procesados": procesados, "errores": sorted(datos.get("errores") or {}),
        "estado": "completa" if estado["completa"] else "parcial", "por_version": estado["por_version"],
    })
    REGISTRO.write_text(json.dumps(registro[-200:], ensure_ascii=False, indent=1), encoding="utf-8")


# Entorno de la cuenca para las rutas al Corredor Mesoamericano del simulador: la cuenca más
# 15 km (la extensión de los assets SINIA). Sin él, una ruta no puede salir de la cuenca y se
# desvía hacia un tramo interior más lejano aunque haya otro tramo justo fuera del límite.
MARGEN_ENTORNO_M = 15_000
CAPAS_ENTORNO = ["sinia_2021", "sinia_2021_detalle", "jrc_2025", "esri_2024"]


def _geometria_entorno() -> dict:
    """Cuenca + MARGEN_ENTORNO_M, con el buffer hecho en UTM 17N (metros) y devuelta en EPSG:4326."""
    from pyproj import Transformer
    from shapely.geometry import mapping, shape
    from shapely.ops import transform

    from chcp.territorio.territorio_local import geometria_cuenca

    a_utm = Transformer.from_crs(4326, 32617, always_xy=True).transform
    a_geo = Transformer.from_crs(32617, 4326, always_xy=True).transform
    cuenca = transform(a_utm, shape(geometria_cuenca())).buffer(0)
    entorno = cuenca.buffer(MARGEN_ENTORNO_M).simplify(200)
    return {"type": "Feature", "properties": {"nombre": "Cuenca del Canal + 15 km"},
            "geometry": mapping(transform(a_geo, entorno))}


def _falta_entorno() -> bool:
    meta = DIR_MAPAS / "entorno" / "meta.json"
    if not meta.exists():
        return True
    previo = json.loads(meta.read_text(encoding="utf-8"))
    return previo.get("margen_m") != MARGEN_ENTORNO_M or not set(CAPAS_ENTORNO) <= set(previo.get("valores") or [])


def _mapas_entorno(forzar: bool = False, max_minutos: int = 30) -> None:
    """Genera (una sola vez) las capas de cobertura del entorno en data/mapas/entorno/."""
    from chcp.gee.mapas_ficha import MAX_PIXELES_CUENCA

    destino = DIR_MAPAS / "entorno"
    meta = destino / "meta.json"
    if not forzar and not _falta_entorno():
        return
    inicio = time.time()
    print("Entorno de la cuenca (+15 km) para las rutas del simulador: calculando…", flush=True)
    try:
        if max_minutos:
            _limite_tiempo(max_minutos * 60)
        datos = generar_mapas(_geometria_entorno(), destino, ee_module=ee, capas=CAPAS_ENTORNO,
                              max_pixeles=MAX_PIXELES_CUENCA)
        datos.update({"margen_m": MARGEN_ENTORNO_M, "descripcion": "Cuenca del Canal + 15 km (extensión de los assets SINIA)",
                      "generado": datetime.now().isoformat(timespec="seconds")})
        if "sinia_2021" in datos["valores"]:
            meta.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Entorno listo: {', '.join(datos['valores']) or 'sin capas'} · {time.time() - inicio:.0f} s", flush=True)
    except (Exception, TiempoAgotado) as exc:  # complementario: no bloquea los territorios
        print(f"Entorno: ERROR {exc}", flush=True)
    finally:
        _limite_tiempo(0)


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
    parser.add_argument("--max-minutos", type=int, default=45,
                        help="Tiempo máximo por subcuenca (la cuenca completa tiene el doble); 0 = sin límite")
    parser.add_argument("--solo-entorno", action="store_true",
                        help="Solo (re)generar las capas del entorno de la cuenca (+15 km) para las rutas del simulador")
    parser.add_argument("--solo-mapas", action="store_true",
                        help="Solo (re)generar mapas y análisis ripario de los territorios ya calculados")
    args = parser.parse_args()

    datos = {"metodologia": METODOLOGIA_VERSION, "version_datos": VERSION_DATOS, "proyecto": os.environ["GEE_PROJECT_ID"],
             "umbral_conectividad_m": args.distancia, "procesamiento": metadatos_ejecucion(METODOLOGIA_VERSION, VERSION_DATOS), "capas_mapa": CAPAS, "codificacion_valores": CODIFICACION_VALORES, "territorios": {}, "errores": {}}
    # Se conservan siempre los territorios ya publicados para que el sitio no quede
    # incompleto durante una actualización parcial (p. ej. --limite 1). Los de una
    # versión anterior de datos se marcan como pendientes y se reemplazan al recalcularlos.
    if SALIDA.exists():
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        datos["territorios"] = previo.get("territorios", {})
        # Un territorio con error en la ejecución anterior (p. ej. al guardar geometrías o mapas)
        # queda pendiente para reintentarlo, aunque sus indicadores ya estén guardados.
        for ident in previo.get("errores") or {}:
            if ident in datos["territorios"]:
                datos["territorios"][ident]["version_datos"] = -1
        if previo.get("version_datos") != VERSION_DATOS:
            for t in datos["territorios"].values():
                t.setdefault("version_datos", previo.get("version_datos") or 1)
    vigente = lambda t: (not args.rehacer and t.get("version_datos", VERSION_DATOS) == VERSION_DATOS
                         and t.get("metodologia", METODOLOGIA_VERSION) == METODOLOGIA_VERSION)

    if args.solo_entorno:
        _initialize_ee()
        _mapas_entorno(forzar=True)
        return 0

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
    inicio_ejecucion = datetime.now().isoformat(timespec="seconds")
    pendientes = [t for t in _territorios() if t["id"] not in datos["territorios"] or not vigente(datos["territorios"][t["id"]])]
    if args.limite:
        pendientes = pendientes[: args.limite]
    print(f"{len(datos['territorios'])} territorios ya calculados; {len(pendientes)} pendientes.")
    entorno = not args.sin_mapas and _falta_entorno()
    if pendientes or entorno:
        _initialize_ee()
        ee.data.setDeadline(10 * 60 * 1000)  # ninguna consulta individual espera más de 10 min
    if entorno:
        _mapas_entorno()  # una sola vez, antes de los territorios

    for numero, territorio in enumerate(pendientes, 1):
        inicio = time.time()
        etiqueta = f"[{numero}/{len(pendientes)}] {territorio['nombre']}"
        print(f"{etiqueta}: calculando…")
        try:
            if args.max_minutos:
                _limite_tiempo(args.max_minutos * 60 * (2 if territorio["id"] == "chcp" else 1))
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
            print(f"    indicadores listos ({time.time() - inicio:.0f} s)", flush=True)
            if not args.sin_mapas:
                _mapas_y_riparia(territorio, datos["territorios"][territorio["id"]])
            datos["errores"].pop(territorio["id"], None)
            print(f"{etiqueta}: {evaluacion['score']} pts ({evaluacion['priority']}) · {time.time() - inicio:.0f} s")
        except (Exception, TiempoAgotado) as exc:  # se registra y se continúa con el siguiente territorio
            datos["errores"][territorio["id"]] = f"{type(exc).__name__}: {exc}"
            if territorio["id"] in datos["territorios"]:
                datos["territorios"][territorio["id"]]["version_datos"] = -1  # visible, pero se reintenta
            print(f"{etiqueta}: ERROR {exc}")
            traceback.print_exc(limit=1)
        finally:
            _limite_tiempo(0)
        _guardar(datos)

    _registrar(datos, inicio_ejecucion, len(pendientes))
    total = len(_territorios())
    print(f"Listo: {len(datos['territorios'])}/{total} territorios en {SALIDA}")
    if datos["errores"]:
        print(f"Con errores: {', '.join(datos['errores'])}. Vuelva a ejecutar para reintentarlos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
