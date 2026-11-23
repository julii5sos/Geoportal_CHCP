"""Precalcula series anuales por territorio: mapas por año y superficies por clase.

Para la CHCP y sus 53 subcuencas (catálogo en ``chcp/nucleo/series_anuales.py``):

* JRC TMF 1990–2025: estado de cada año (6 clases).
* Hansen GFC 2001–2025: año de la pérdida de cobertura arbórea (un mapa) y superficie por año.
* ESRI LULC 2017–2025: clase de cada año.
* NDVI Sentinel-2 2017–2025: clase de vigor de cada año (5 intervalos) y NDVI medio.

Los mapas son PNG de valores (escala de grises, 255 = sin dato) sobre la malla EPSG:3857 de
los mapas de la ficha; el navegador los colorea y filtra por clase. Las superficies se
calculan aparte, a la escala nativa de cada producto, con ``ee.Image.pixelArea``.

Salida en data/series/: indice.json, estadisticas/<territorio>.json y
mapas/<territorio>/<producto>_<año>.v.png. Es reanudable.

    python scripts/precalcular_series.py [--territorios chcp,s1] [--productos jrc,esri]
                                         [--solo-mapas | --solo-superficies] [--rehacer]
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from chcp.nucleo.series_anuales import (  # noqa: E402
    LIMITES_NDVI, PRODUCTOS, SIN_DATO, grupos_a_hectareas, indice_publico, nombre_banda, ruta_mapa,
)

DESTINO = RAIZ / "data" / "series"
MAX_PIXELES_CUENCA = 1400     # ~75 m en la cuenca completa
MAX_PIXELES_SUBCUENCA = 700   # 10–30 m según el tamaño de la subcuenca
MAX_BYTES_SOLICITUD = 30_000_000  # computePixels admite ~48 MB por respuesta
HILOS = 6
BLOQUEO = threading.Lock()


def territorios() -> list[dict]:
    from chcp.territorio.territorio_local import coleccion_subcuencas, geometria_cuenca

    lista = [{"id": "chcp", "nombre": "Cuenca Hidrográfica del Canal de Panamá",
              "geojson": {"type": "Feature", "properties": {}, "geometry": geometria_cuenca()}}]
    for f in coleccion_subcuencas()["features"]:
        lista.append({"id": f["properties"]["id"], "nombre": f["properties"].get("nombre"), "geojson": f})
    return lista


# --------------------------------------------------------------------------- imágenes
def imagen_producto(producto: str, geometria, ee):
    """Imagen multibanda (una banda por año) con los códigos de clase; sin dato enmascarado."""
    from chcp.gee.analisis_temporal import ESRI_ASSET, TMF_ASSET

    p = PRODUCTOS[producto]
    if producto == "jrc":
        coleccion = ee.ImageCollection(TMF_ASSET).filterBounds(geometria)
        bandas = [f"Dec{a}" for a in p["anios"]]
        img = coleccion.mosaic().select(bandas, [nombre_banda("jrc", a) for a in p["anios"]])
        img = img.setDefaultProjection(ee.Image(coleccion.first()).projection())
        return img.updateMask(img.gte(1).And(img.lte(6))), 30
    if producto == "esri":
        validos = [c["valor"] for c in p["clases"]]  # excluye 10 (nubes persistentes)
        capas = []
        for a in p["anios"]:
            col = ee.ImageCollection(ESRI_ASSET).filterDate(f"{a}-01-01", f"{a}-12-31").filterBounds(geometria).select([0])
            # Un año sin imágenes queda vacío (sin dato) en lugar de romper todo el producto.
            banda = ee.Image(ee.Algorithms.If(col.size().gt(0), col.mosaic(), ee.Image(0).selfMask())).setDefaultProjection("EPSG:4326", None, 10)
            banda = banda.updateMask(banda.remap(validos, [1] * len(validos), 0).eq(1))
            capas.append(banda.rename(nombre_banda("esri", a)))
        return ee.Image.cat(capas), 10
    if producto == "ndvi":
        from chcp.gee.analisis_complementario import _ndvi

        capas = []
        for a in p["anios"]:
            ndvi = _ndvi(a, geometria, ee)
            clase = ee.Image(len(LIMITES_NDVI) + 1)
            for k, limite in reversed(list(enumerate(LIMITES_NDVI, 1))):
                clase = clase.where(ndvi.lt(limite), k)
            capas.append(clase.updateMask(ndvi.mask()).rename(nombre_banda("ndvi", a)))
        return ee.Image.cat(capas).setDefaultProjection("EPSG:4326", None, 20), 20
    if producto == "hansen":
        from chcp.gee.analisis_complementario import HANSEN_ASSET

        img = ee.Image(HANSEN_ASSET)
        perdida = img.select("lossyear").updateMask(img.select("lossyear").gt(0)).rename("hansen")
        return perdida, 30
    raise ValueError(producto)


# --------------------------------------------------------------------------- superficies
def calcular_superficies(t: dict, producto: str, ee) -> dict:
    geometria = ee.Geometry(t["geojson"].get("geometry", t["geojson"]), proj="EPSG:4326", geodesic=False)
    img, escala = imagen_producto(producto, geometria, ee)
    area = ee.Image.pixelArea().divide(10_000)
    reductor = ee.Reducer.sum().group(groupField=1, groupName="c")
    opciones = {"geometry": geometria, "scale": escala, "maxPixels": 1e13, "tileScale": 4}
    if producto == "hansen":
        grupos = area.addBands(img).reduceRegion(reducer=reductor, **opciones).get("groups").getInfo()
        por_anio = {str(int(k) + 2000): v for k, v in grupos_a_hectareas(grupos).items()}
        from chcp.gee.analisis_complementario import HANSEN_ASSET

        hansen = ee.Image(HANSEN_ASSET)
        base = area.updateMask(hansen.select("treecover2000").gte(30)).reduceRegion(
            reducer=ee.Reducer.sum(), **opciones).get("area").getInfo()
        return {"perdida_por_anio": por_anio, "cobertura_arborea_2000_ha": round(float(base or 0), 4)}
    bandas = [nombre_banda(producto, a) for a in PRODUCTOS[producto]["anios"]]
    resultado = ee.Dictionary.fromLists(bandas, ee.List(bandas).map(
        lambda b: area.addBands(img.select([b])).reduceRegion(reducer=reductor, **opciones).get("groups")
    )).getInfo()
    salida = {"por_anio": {b.rsplit("_", 1)[1]: grupos_a_hectareas(resultado.get(b)) for b in bandas}}
    if producto == "ndvi":  # NDVI medio por año, como referencia continua
        from chcp.gee.analisis_complementario import _ndvi

        medios = ee.Dictionary.fromLists([str(a) for a in PRODUCTOS["ndvi"]["anios"]], [
            _ndvi(a, geometria, ee).reduceRegion(reducer=ee.Reducer.mean(), **opciones).get("ndvi")
            for a in PRODUCTOS["ndvi"]["anios"]]).getInfo()
        salida["ndvi_medio"] = {k: (None if v is None else round(float(v), 4)) for k, v in medios.items()}
    return salida


# --------------------------------------------------------------------------- mapas
def _descargar_bandas(img, bandas: list[str], geometria, grid: dict, ee):
    """Bandas uint8 (255 = sin dato) en pocas solicitudes; divide si Earth Engine lo rechaza."""
    import numpy as np

    from chcp.gee.mapas_ficha import _reintentable

    ancho, alto = grid["dimensions"]["width"], grid["dimensions"]["height"]
    por_solicitud = max(1, MAX_BYTES_SOLICITUD // (ancho * alto))
    salida = {}

    def pedir(grupo):
        expresion = img.select(grupo).clip(geometria).unmask(SIN_DATO, False).toUint8()
        try:
            datos = ee.data.computePixels({"expression": expresion, "fileFormat": "NUMPY_NDARRAY", "grid": grid})
            for b in grupo:
                salida[b] = np.asarray(datos[b], dtype="uint8")
        except Exception as exc:  # noqa: BLE001
            if not _reintentable(exc):
                raise
            if len(grupo) > 1:
                mitad = len(grupo) // 2
                pedir(grupo[:mitad]); pedir(grupo[mitad:])
            else:  # una sola banda: por mosaicos, con la maquinaria de los mapas de la ficha
                from chcp.gee.mapas_ficha import SIN_DATO as SIN_DATO_FLOTANTE, descargar_valores

                v = descargar_valores(img.select(grupo), geometria, {"grid": grid}, ee, partes=3)
                salida[grupo[0]] = np.where((v == SIN_DATO_FLOTANTE) | ~np.isfinite(v), SIN_DATO,
                                            np.clip(np.rint(v), 0, 254)).astype("uint8")

    for i in range(0, len(bandas), por_solicitud):
        pedir(bandas[i:i + por_solicitud])
    return salida


def calcular_mapas(t: dict, producto: str, ee) -> dict:
    from PIL import Image

    from chcp.gee.mapas_ficha import malla_mercator

    geojson = t["geojson"]
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    malla = malla_mercator(geojson, max_pixeles=MAX_PIXELES_CUENCA if t["id"] == "chcp" else MAX_PIXELES_SUBCUENCA)
    img, _ = imagen_producto(producto, geometria, ee)
    anios = [None] if producto == "hansen" else PRODUCTOS[producto]["anios"]
    bandas = ["hansen"] if producto == "hansen" else [nombre_banda(producto, a) for a in anios]
    datos = _descargar_bandas(img, bandas, geometria, malla["grid"], ee)
    carpeta = DESTINO / "mapas" / t["id"]
    carpeta.mkdir(parents=True, exist_ok=True)
    for a, b in zip(anios, bandas):
        Image.fromarray(datos[b], mode="L").save(carpeta / ruta_mapa(producto, a), optimize=True)
    alto, ancho = next(iter(datos.values())).shape
    return {"limites": malla["limites"], "dimensiones": [ancho, alto], "tamano_pixel_m": malla["tamano_pixel_m"]}


# --------------------------------------------------------------------------- ejecución
def _con_reintentos(funcion, *args, intentos: int = 3):
    for i in range(intentos):
        try:
            return funcion(*args)
        except Exception as exc:  # noqa: BLE001
            if i == intentos - 1:
                raise
            print(f"    reintento {i + 1} tras error: {str(exc)[:160]}", flush=True)
            time.sleep(10 * (i + 1))


def _mapas_completos(tid: str, producto: str) -> bool:
    anios = [None] if producto == "hansen" else PRODUCTOS[producto]["anios"]
    return all((DESTINO / "mapas" / tid / ruta_mapa(producto, a)).exists() for a in anios)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--territorios", default="", help="ids separados por comas (vacío = todos)")
    ap.add_argument("--productos", default="", help="jrc,hansen,esri,ndvi (vacío = todos)")
    grupo = ap.add_mutually_exclusive_group()
    grupo.add_argument("--solo-mapas", action="store_true")
    grupo.add_argument("--solo-superficies", action="store_true")
    ap.add_argument("--rehacer", action="store_true", help="recalcular aunque ya exista")
    args = ap.parse_args(argv)

    import ee

    from webapp.service import _initialize_ee

    proyecto = _initialize_ee()
    productos = [p for p in PRODUCTOS if not args.productos or p in args.productos.split(",")]
    lista = [t for t in territorios() if not args.territorios or t["id"] in args.territorios.split(",")]
    ruta_indice = DESTINO / "indice.json"
    indice = json.loads(ruta_indice.read_text(encoding="utf-8")) if ruta_indice.exists() else {}
    indice.setdefault("territorios", {})
    DESTINO.mkdir(parents=True, exist_ok=True)

    tareas = []
    for t in lista:
        entrada = indice["territorios"].setdefault(t["id"], {"nombre": t["nombre"], "mapas": {}, "superficies": []})
        ruta_est = DESTINO / "estadisticas" / f"{t['id']}.json"
        estad = json.loads(ruta_est.read_text(encoding="utf-8")) if ruta_est.exists() else {}
        for p in productos:
            if not args.solo_superficies and (args.rehacer or p not in entrada["mapas"] or not _mapas_completos(t["id"], p)):
                tareas.append(("mapa", t, p))
            if not args.solo_mapas and (args.rehacer or p not in estad):
                tareas.append(("superficie", t, p))
    # NDVI es el más lento: al final, para que JRC, Hansen y ESRI queden listos antes.
    tareas.sort(key=lambda x: (x[2] == "ndvi", x[1]["id"] != "chcp"))
    print(f"Proyecto {proyecto}: {len(tareas)} tareas ({len(lista)} territorios × {len(productos)} productos)", flush=True)

    errores: list[str] = []

    def guardar_indice():
        indice.update(indice_publico())
        indice["generado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        indice["proyecto"] = proyecto
        ruta_indice.write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")

    def ejecutar(tipo, t, p):
        funcion = calcular_mapas if tipo == "mapa" else calcular_superficies
        return _con_reintentos(funcion, t, p, ee)

    hechas = 0
    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        futuros = {pool.submit(ejecutar, *x): x for x in tareas}
        for fut in as_completed(futuros):
            tipo, t, p = futuros[fut]
            hechas += 1
            try:
                resultado = fut.result()
            except Exception as exc:  # noqa: BLE001
                errores.append(f"{t['id']} · {p} · {tipo}: {str(exc)[:200]}")
                print(f"  [{hechas}/{len(tareas)}] ✗ {errores[-1]}", flush=True)
                continue
            with BLOQUEO:
                entrada = indice["territorios"][t["id"]]
                if tipo == "mapa":
                    entrada["mapas"][p] = resultado
                else:
                    ruta_est = DESTINO / "estadisticas" / f"{t['id']}.json"
                    ruta_est.parent.mkdir(parents=True, exist_ok=True)
                    estad = json.loads(ruta_est.read_text(encoding="utf-8")) if ruta_est.exists() else {}
                    estad[p] = resultado
                    ruta_est.write_text(json.dumps(estad, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                    entrada["superficies"] = sorted(set(entrada.get("superficies", [])) | {p})
                guardar_indice()
            print(f"  [{hechas}/{len(tareas)}] ✓ {t['id']} · {p} · {tipo}", flush=True)

    guardar_indice()
    if errores:
        print(f"Con errores ({len(errores)}). Vuelva a ejecutar para reintentarlos.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
