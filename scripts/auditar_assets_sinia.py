"""Auditoría técnica y temática de los ocho assets SINIA–MiAMBIENTE.

Fases 2–4 del protocolo de integración (ver docs/VALIDACION_ASSETS_GEE.md):

1. Acceso y metadatos reales de cada asset en Earth Engine (tipo, bandas, tipo de
   dato, proyección, resolución, extensión, propiedades).
2. Códigos presentes y superficie con máscara dentro de la CHCP, y superficie por
   código en el AOI de control Qda. Bonita.
3. Vector 2021: entidades, atributos, categorías, tipos de geometría y prueba del
   motor de fragmentación con los parámetros de la validación de 2026-11-07.
4. Correspondencia espacial código ↔ categoría oficial: muestreo estratificado de
   puntos por código en la CHCP y consulta, en esos mismos puntos, del servicio
   ArcGIS REST oficial de MiAMBIENTE (Nodo_Suelos). Una categoría solo se considera
   verificada si la gran mayoría de los puntos de un código cae en la misma
   categoría oficial.
5. Coherencia cruzada para productos sin capa REST (2012 binario, 2019, 2023):
   proporción de puntos de cada código que caen en la clase forestal de un
   producto oficial ya documentado.

No modifica assets ni permisos. Requiere `earthengine authenticate` y acceso a
internet. Uso:

    python scripts/auditar_assets_sinia.py                 # completo (10–30 min)
    python scripts/auditar_assets_sinia.py --sin-rest      # solo Earth Engine
    python scripts/auditar_assets_sinia.py --puntos 12     # puntos por código

Salida: docs/validacion/auditoria_assets_sinia.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

import ee
import requests

from chcp.catalogos.leyendas_sinia import cargar_catalogo, id_asset
from chcp.gee.gee_config import inicializar_earth_engine
from chcp.territorio.territorio_local import geometria_cuenca, geometria_subcuenca

REST = "https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer"
AOI_CONTROL = "Qda. Bonita"
SALIDA = RAIZ / "docs" / "validacion" / "auditoria_assets_sinia.json"
# Escala para recorrer toda la CHCP sin consultas nacionales: los productos de 5 m
# se resumen a 10 m (solo para inventariar códigos, no para superficies oficiales).
ESCALA_INVENTARIO = {5: 10}


def _registrar(resultado: dict, clave: str, funcion):
    inicio = time.time()
    try:
        resultado[clave] = funcion()
    except Exception as exc:  # se documenta y se continúa
        resultado[clave] = {"error": f"{type(exc).__name__}: {exc}"}
    resultado.setdefault("_segundos", {})[clave] = round(time.time() - inicio, 1)


def metadatos(asset_id: str) -> dict:
    meta = ee.data.getAsset(asset_id)
    salida = {"tipo": meta.get("type"), "tamano_bytes": meta.get("sizeBytes"),
              "actualizado": meta.get("updateTime"), "propiedades": meta.get("properties", {})}
    if meta.get("type") == "IMAGE":
        salida["bandas"] = [
            {"id": b.get("id"), "tipo_dato": b.get("dataType"), "crs": (b.get("grid") or {}).get("crsCode"),
             "transformacion": (b.get("grid") or {}).get("affineTransform"),
             "dimensiones": (b.get("grid") or {}).get("dimensions")}
            for b in meta.get("bands", [])
        ]
        imagen = ee.Image(asset_id)
        proj = imagen.select(0).projection()
        salida.update(ee.Dictionary({
            "proyeccion": proj, "escala_nominal_m": proj.nominalScale(),
            "extension_wgs84": imagen.geometry().bounds(1, "EPSG:4326").coordinates(),
            "tipo_banda_ee": imagen.select(0).bandTypes(),
        }).getInfo())
    return salida


def inventario_raster(asset_id: str, escala: float, chcp) -> dict:
    imagen = ee.Image(asset_id).select([0], ["codigo"])
    escala_uso = ESCALA_INVENTARIO.get(round(escala), escala)
    pixel_ha = ee.Image.pixelArea().divide(10_000)
    valores = ee.Dictionary({
        "histograma_ha": pixel_ha.rename("ha").addBands(imagen).reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName="codigo"), geometry=chcp,
            scale=escala_uso, crs="EPSG:32617", maxPixels=1e10, tileScale=8).get("groups"),
        "enmascarado_ha": pixel_ha.updateMask(imagen.mask().Not()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=chcp, scale=escala_uso, crs="EPSG:32617",
            maxPixels=1e10, tileScale=8).get("area"),
        "minmax": imagen.reduceRegion(reducer=ee.Reducer.minMax(), geometry=chcp, scale=escala_uso,
                                      crs="EPSG:32617", maxPixels=1e10, tileScale=8),
    }).getInfo()
    valores["escala_inventario_m"] = escala_uso
    valores["codigos_presentes"] = sorted(int(g["codigo"]) for g in valores["histograma_ha"] or [])
    return valores


def areas_aoi(asset_id: str, escala: float, aoi) -> list:
    imagen = ee.Image(asset_id).select([0], ["codigo"])
    grupos = ee.Image.pixelArea().divide(10_000).rename("ha").addBands(imagen).reduceRegion(
        reducer=ee.Reducer.sum().group(groupField=1, groupName="codigo"), geometry=aoi,
        scale=escala, crs="EPSG:32617", maxPixels=1e9, tileScale=4).get("groups").getInfo() or []
    return [{"codigo": int(g["codigo"]), "ha": round(float(g["sum"]), 4)} for g in grupos]


def auditar_vector(asset_id: str, campo: str, aoi_geojson: dict) -> dict:
    fc = ee.FeatureCollection(asset_id)
    primero = ee.Feature(fc.first())
    info = ee.Dictionary({
        "n_entidades": fc.size(),
        "campos": primero.propertyNames(),
        "por_categoria": fc.aggregate_histogram(campo),
        "tipos_geometria_muestra": fc.limit(500).map(lambda f: f.set("gt", f.geometry().type())).aggregate_histogram("gt"),
        "proyeccion_geometria": primero.geometry().projection(),
        "suma_Area_ha_por_categoria": fc.reduceColumns(ee.Reducer.sum().group(groupField=1, groupName="categoria"), ["Area_ha", campo]).get("groups"),
    }).getInfo()
    from chcp.gee.estructura_cobertura import analizar_estructura_cobertura, consultar_cobertura_oficial_2021
    areas = consultar_cobertura_oficial_2021(aoi_geojson, ee_module=ee)
    info["areas_aoi_control"] = areas["statistics"]
    estructura = analizar_estructura_cobertura("official_2021", aoi_geojson, maximum_distance_m=500,
                                               minimum_patch_area_ha=0, context_radius_m=500, ee_module=ee)
    clase, red = estructura["metricas_clase"], estructura["metricas_red"]
    info["motor_fragmentacion_aoi_control"] = {
        "parametros": {"distancia_m": 500, "area_minima_ha": 0, "contexto_m": 500},
        "parches": clase.get("numero_parches"), "superficie_ha": clase.get("area_total_bosque_ha"),
        "aristas": red.get("numero_aristas"), "componentes": red.get("numero_componentes"),
        "aislados": red.get("numero_parches_aislados"),
        "referencia_2026_11_07": {"parches": 6, "aristas": 9, "componentes": 1, "superficie_ha": 377.6973},
    }
    return info


def muestrear(asset_id: str, escala: float, chcp, puntos: int, semilla: int = 2026) -> list:
    imagen = ee.Image(asset_id).select([0], ["codigo"]).toInt()
    muestras = imagen.stratifiedSample(numPoints=puntos, classBand="codigo", region=chcp,
                                       scale=max(escala, 10), seed=semilla, geometries=True, tileScale=8)
    datos = muestras.getInfo()["features"]
    return [{"codigo": int(f["properties"]["codigo"]), "lon": f["geometry"]["coordinates"][0],
             "lat": f["geometry"]["coordinates"][1]} for f in datos]


def consultar_rest(capa: dict, lon: float, lat: float, sesion: requests.Session) -> dict:
    if capa["tipo"] == "vector":
        r = sesion.get(f"{REST}/{capa['id']}/query", timeout=30, params={
            "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": capa["campo"],
            "returnGeometry": "false", "f": "json"})
        feats = r.json().get("features", [])
        return {"categoria": feats[0]["attributes"].get(capa["campo"]) if feats else None}
    d = 0.01
    r = sesion.get(f"{REST}/identify", timeout=30, params={
        "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "sr": 4326,
        "layers": f"all:{capa['id']}", "tolerance": 0, "returnGeometry": "false",
        "mapExtent": f"{lon - d},{lat - d},{lon + d},{lat + d}", "imageDisplay": "400,400,96", "f": "json"})
    res = r.json().get("results", [])
    if not res:
        return {"categoria": None}
    return interpretar_identify(res[0].get("attributes", {}))


def interpretar_identify(atributos: dict) -> dict:
    """Normaliza la respuesta ``identify`` de una capa ráster de ArcGIS Server.

    Los nombres llegan con prefijo (``Raster.Categoría``, ``UniqueValue.Pixel Value``)
    y los colores pueden venir en escala 0–1 (``Raster.Green = 0.345098``).
    """
    plano = {k.split(".", 1)[-1].strip().lower(): v for k, v in atributos.items()}
    def _es_numero(v) -> bool:
        try:
            float(v)
            return True
        except (TypeError, ValueError):
            return False
    # En 2021 «Categoría» es el alias del código numérico (Classvalue); el nombre está en Class_name.
    nombre = next((plano[k] for k in ("class_name", "class_names", "categoría", "categoria")
                   if plano.get(k) not in (None, "", "Null") and not _es_numero(plano.get(k))), None)
    valor = next((plano[k] for k in ("pixel value", "classvalue", "value2", "value") if plano.get(k) not in (None, "", "Null")), None)
    rgb = []
    for canal in ("red", "green", "blue"):
        try:
            rgb.append(float(plano[canal]))
        except (KeyError, TypeError, ValueError):
            rgb = []
            break
    if rgb and max(rgb) <= 1.0:
        rgb = [round(c * 255) for c in rgb]
    return {"categoria": nombre, "valor_servicio": valor, "rgb": [int(round(c)) for c in rgb] if rgb else [None, None, None],
            "atributos": atributos}


def correspondencia(muestras: list, capa: dict, pausa: float) -> dict:
    sesion = requests.Session()
    por_codigo: dict[int, Counter] = defaultdict(Counter)
    colores: dict[str, Counter] = defaultdict(Counter)
    valores_servicio: dict[int, Counter] = defaultdict(Counter)
    ejemplos_atributos = None
    for m in muestras:
        try:
            resp = consultar_rest(capa, m["lon"], m["lat"], sesion)
        except Exception as exc:
            resp = {"categoria": f"ERROR {type(exc).__name__}"}
        por_codigo[m["codigo"]][str(resp.get("categoria"))] += 1
        if resp.get("valor_servicio") is not None:
            valores_servicio[m["codigo"]][str(resp["valor_servicio"])] += 1
        if resp.get("categoria") and any(v is not None for v in resp.get("rgb") or []):
            colores[str(resp["categoria"])][",".join(str(int(float(v))) for v in resp["rgb"])] += 1
        if ejemplos_atributos is None and resp.get("atributos"):
            ejemplos_atributos = resp["atributos"]
        time.sleep(pausa)
    resumen = {}
    for codigo, conteo in sorted(por_codigo.items()):
        total = sum(conteo.values())
        validos = {k: v for k, v in conteo.items() if k not in {"None"} and not k.startswith("ERROR")}
        mejor, n = (max(validos.items(), key=lambda kv: kv[1]) if validos else (None, 0))
        resumen[str(codigo)] = {"puntos": total, "categoria_mayoritaria": mejor,
                                "acuerdo_pct": round(n / total * 100, 1) if total else 0.0,
                                "distribucion": dict(conteo),
                                "valor_servicio": dict(valores_servicio.get(codigo, {}))}
    return {"capa_rest": capa, "por_codigo": resumen,
            "colores_servicio": {k: v.most_common(1)[0][0] for k, v in colores.items()},
            "atributos_ejemplo": ejemplos_atributos}


def coherencia_forestal(muestras: list, referencia: str) -> dict:
    """Proporción de puntos de cada código que cae en «Bosques y Otras Tierras Boscosas» 2021."""
    fc = ee.FeatureCollection(id_asset(referencia)).filter(ee.Filter.eq("Categoria", "Bosques y Otras Tierras Boscosas"))
    bosque = ee.Image(0).paint(fc, 1).rename("bosque")
    pts = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([m["lon"], m["lat"]]), {"codigo": m["codigo"]}) for m in muestras])
    valores = bosque.sampleRegions(collection=pts, scale=10, geometries=False).getInfo()["features"]
    por_codigo = defaultdict(list)
    for f in valores:
        por_codigo[int(f["properties"]["codigo"])].append(int(f["properties"]["bosque"]))
    return {str(c): {"puntos": len(v), "en_bosque_2021_pct": round(sum(v) / len(v) * 100, 1)} for c, v in sorted(por_codigo.items())}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", default=os.getenv("GEE_PROJECT_ID", "geoportal-513817"))
    parser.add_argument("--puntos", type=int, default=10, help="Puntos por código para la correspondencia")
    parser.add_argument("--pausa", type=float, default=0.25, help="Segundos entre consultas al servicio REST")
    parser.add_argument("--sin-rest", action="store_true")
    parser.add_argument("--solo", nargs="*", help="Claves del catálogo a auditar (por defecto, todas)")
    args = parser.parse_args()

    entorno = dict(os.environ)
    entorno["GEE_PROJECT_ID"] = args.project
    inicializar_earth_engine(ee, environ=entorno)
    chcp_geojson = geometria_cuenca()
    chcp = ee.Geometry(chcp_geojson, proj="EPSG:4326", geodesic=False)
    aoi_geojson = geometria_subcuenca(AOI_CONTROL)
    aoi = ee.Geometry(aoi_geojson, proj="EPSG:4326", geodesic=False)

    catalogo = cargar_catalogo()
    salida = {"fecha": datetime.now().isoformat(timespec="seconds"), "proyecto": args.project,
              "ee_version": ee.__version__, "aoi_control": AOI_CONTROL, "puntos_por_codigo": args.puntos,
              "servicio_rest": REST, "assets": {}}
    if SALIDA.exists():
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        salida["assets"] = previo.get("assets", {}) if args.solo else {}

    claves = args.solo or list(catalogo)
    for clave in claves:
        ficha = catalogo[clave]
        asset_id = id_asset(clave)
        print(f"== {clave} · {asset_id}")
        res = {"asset_id": asset_id}
        _registrar(res, "metadatos", lambda: metadatos(asset_id))
        if ficha["tipo"] == "IMAGE":
            escala = float(ficha["resolucion_m"])
            _registrar(res, "inventario_chcp", lambda: inventario_raster(asset_id, escala, chcp))
            _registrar(res, "areas_aoi_control", lambda: areas_aoi(asset_id, escala, aoi))
            necesita_muestras = (ficha.get("capa_rest") and not args.sin_rest) or ficha.get("coherencia_con")
            if necesita_muestras:
                _registrar(res, "muestras", lambda: muestrear(asset_id, escala, chcp, args.puntos))
            muestras = res.get("muestras") if isinstance(res.get("muestras"), list) else []
            if muestras and ficha.get("capa_rest") and not args.sin_rest:
                print(f"   consultando {len(muestras)} puntos en el servicio de MiAMBIENTE…")
                _registrar(res, "correspondencia_rest", lambda: correspondencia(muestras, ficha["capa_rest"], args.pausa))
            if muestras and ficha.get("coherencia_con"):
                _registrar(res, "coherencia_forestal_2021", lambda: coherencia_forestal(muestras, ficha["coherencia_con"]))
            if isinstance(res.get("muestras"), list):
                res["n_muestras"] = len(res.pop("muestras"))
        else:
            _registrar(res, "vector", lambda: auditar_vector(asset_id, ficha["campo_tematico"], aoi_geojson))
        salida["assets"][clave] = res
        SALIDA.parent.mkdir(parents=True, exist_ok=True)
        SALIDA.write_text(json.dumps(salida, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
        errores = [k for k, v in res.items() if isinstance(v, dict) and "error" in v]
        print(f"   listo ({sum(res.get('_segundos', {}).values()):.0f} s){' · errores: ' + ', '.join(errores) if errores else ''}")
    print(f"Auditoría guardada en {SALIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
