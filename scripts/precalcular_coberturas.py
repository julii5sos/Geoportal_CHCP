"""Precalcula los mapas y las superficies de los ocho productos SINIA–MiAMBIENTE.

Para la CHCP y cada una de sus 53 subcuencas, y para cada producto del catálogo
(data/catalogo_assets_sinia.json):

* Mapa de códigos originales sobre una malla EPSG:3857 (PNG en escala de grises; 255 = sin
  dato), con la misma maquinaria que los mapas de la ficha (computePixels por mosaicos).
  El navegador lo colorea con la leyenda de data/leyendas_sinia.json, así que filtrar
  categorías o cambiar a grupos derivados no requiere volver a calcular.
* Superficie por código a la escala nativa del producto (estadisticas_producto), igual
  que la versión completa del geoportal.

Salida en data/coberturas/: indice.json, mapas/<territorio>/<producto>.v.png y
estadisticas/<territorio>.json. Es reanudable: no repite lo que ya existe salvo con --rehacer.

    python scripts/precalcular_coberturas.py [--territorios chcp,s1] [--productos 2021_detallado]
                                             [--solo-mapas | --solo-superficies] [--rehacer]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

DESTINO = RAIZ / "data" / "coberturas"
MAX_PIXELES_CUENCA = 3000   # ~34 m en la cuenca completa
MAX_PIXELES_SUBCUENCA = 900  # 10–25 m según el tamaño de la subcuenca
HILOS = 6
SIN_DATO_PNG = 255


def territorios() -> list[dict]:
    from chcp.territorio.territorio_local import coleccion_subcuencas, geometria_cuenca

    lista = [{"id": "chcp", "nombre": "Cuenca Hidrográfica del Canal de Panamá",
              "geojson": {"type": "Feature", "properties": {}, "geometry": geometria_cuenca()}}]
    for f in coleccion_subcuencas()["features"]:
        lista.append({"id": f["properties"]["id"], "nombre": f["properties"].get("nombre"), "geojson": f})
    return lista


def calcular_mapa(t: dict, clave: str, ee) -> dict:
    import numpy as np
    from PIL import Image

    from chcp.gee.coberturas_sinia import imagen_producto
    from chcp.gee.mapas_ficha import SIN_DATO, descargar_valores, malla_mercator

    geojson = t["geojson"]
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    malla = malla_mercator(geojson, max_pixeles=MAX_PIXELES_CUENCA if t["id"] == "chcp" else MAX_PIXELES_SUBCUENCA)
    valores = descargar_valores(imagen_producto(clave, ee), geometria, malla, ee)
    sin_dato = (valores == SIN_DATO) | ~np.isfinite(valores) | (valores < 0) | (valores > 254)
    codigos = np.where(sin_dato, SIN_DATO_PNG, np.rint(valores)).astype("uint8")
    ruta = DESTINO / "mapas" / t["id"] / f"{clave}.v.png"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(codigos, mode="L").save(ruta, optimize=True)
    alto, ancho = codigos.shape
    return {"limites": malla["limites"], "dimensiones": [ancho, alto], "tamano_pixel_m": malla["tamano_pixel_m"]}


def calcular_superficies(t: dict, clave: str, ee) -> dict:
    from chcp.gee.coberturas_sinia import estadisticas_producto

    return estadisticas_producto(clave, t["geojson"].get("geometry", t["geojson"]), ee_module=ee)


def _con_reintentos(funcion, *args, intentos: int = 3):
    for i in range(intentos):
        try:
            return funcion(*args)
        except Exception as exc:  # noqa: BLE001
            if i == intentos - 1:
                raise
            print(f"    reintento {i + 1} tras error: {str(exc)[:160]}", flush=True)
            time.sleep(10 * (i + 1))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--territorios", default="", help="ids separados por comas (vacío = todos)")
    ap.add_argument("--productos", default="", help="claves separadas por comas (vacío = los ocho)")
    grupo = ap.add_mutually_exclusive_group()
    grupo.add_argument("--solo-mapas", action="store_true")
    grupo.add_argument("--solo-superficies", action="store_true")
    ap.add_argument("--rehacer", action="store_true", help="recalcular aunque ya exista")
    args = ap.parse_args(argv)

    import ee

    from chcp.catalogos.leyendas_sinia import cargar_catalogo
    from webapp.service import _initialize_ee

    proyecto = _initialize_ee()
    productos = [p for p in cargar_catalogo() if not args.productos or p in args.productos.split(",")]
    lista = [t for t in territorios() if not args.territorios or t["id"] in args.territorios.split(",")]
    ruta_indice = DESTINO / "indice.json"
    indice = json.loads(ruta_indice.read_text(encoding="utf-8")) if ruta_indice.exists() else {"territorios": {}}
    DESTINO.mkdir(parents=True, exist_ok=True)

    tareas = []
    for t in lista:
        entrada = indice["territorios"].setdefault(t["id"], {"nombre": t["nombre"], "mapas": {}, "superficies": []})
        ruta_est = DESTINO / "estadisticas" / f"{t['id']}.json"
        estad = json.loads(ruta_est.read_text(encoding="utf-8")) if ruta_est.exists() else {}
        for clave in productos:
            if not args.solo_superficies and (args.rehacer or clave not in entrada["mapas"]
                                              or not (DESTINO / "mapas" / t["id"] / f"{clave}.v.png").exists()):
                tareas.append(("mapa", t, clave))
            if not args.solo_mapas and (args.rehacer or clave not in estad):
                tareas.append(("superficie", t, clave))
    print(f"Proyecto {proyecto}: {len(tareas)} tareas ({len(lista)} territorios × {len(productos)} productos)", flush=True)

    errores = []
    hechas = 0

    def guardar():
        indice["generado"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        indice["proyecto"] = proyecto
        indice["productos"] = list(cargar_catalogo())
        ruta_indice.write_text(json.dumps(indice, ensure_ascii=False, indent=1), encoding="utf-8")

    def ejecutar(tipo, t, clave):
        funcion = calcular_mapa if tipo == "mapa" else calcular_superficies
        return tipo, t, clave, _con_reintentos(funcion, t, clave, ee)

    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        futuros = {pool.submit(ejecutar, *x): x for x in tareas}
        for fut in as_completed(futuros):
            tipo, t, clave = futuros[fut]
            try:
                _, _, _, resultado = fut.result()
            except Exception as exc:  # noqa: BLE001
                errores.append(f"{t['id']} · {clave} · {tipo}: {str(exc)[:200]}")
                print(f"  ✗ {errores[-1]}", flush=True)
                continue
            entrada = indice["territorios"][t["id"]]
            if tipo == "mapa":
                entrada["mapas"][clave] = resultado
            else:
                ruta_est = DESTINO / "estadisticas" / f"{t['id']}.json"
                ruta_est.parent.mkdir(parents=True, exist_ok=True)
                estad = json.loads(ruta_est.read_text(encoding="utf-8")) if ruta_est.exists() else {}
                estad[clave] = resultado
                ruta_est.write_text(json.dumps(estad, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
                entrada["superficies"] = sorted(estad)
            hechas += 1
            print(f"  ✓ [{hechas}/{len(tareas)}] {t['id']} · {clave} · {tipo}", flush=True)
            if hechas % 10 == 0:
                guardar()
    indice["errores"] = errores
    guardar()
    print(f"Listo: {hechas} tareas, {len(errores)} errores.", flush=True)
    return 0 if not errores or hechas else 1


if __name__ == "__main__":
    raise SystemExit(main())
