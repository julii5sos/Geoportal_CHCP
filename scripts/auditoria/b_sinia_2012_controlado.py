"""Auditoría B.4: comparación controlada del ráster SINIA 2012 con el servicio oficial de MiAMBIENTE.

    python scripts/auditoria/b_sinia_2012_controlado.py --puntos 30 --radio 5

Requiere Earth Engine (proyecto geoportal-513817) y acceso público a
``https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer``.

Diferencias con el muestreo original (10 puntos aleatorios por código):
1. **Solo píxeles interiores:** el código debe ser idéntico en una ventana de (2·radio+1)² píxeles
   de 5 m (radio 5 → 55 × 55 m), lo que descarta bordes entre categorías y desalineaciones pequeñas.
2. **Más puntos:** ``--puntos`` por código, con semilla fija.
3. **Prueba de alineación:** cada punto se consulta también desplazado ±10 m en x e y.
4. **Metadatos del servicio:** tamaño de píxel, referencia espacial y leyenda de la capa 2.

Escribe ``docs/auditoria/datos/B_comparacion_controlada_2012.json``. No modifica leyendas ni assets:
la decisión sobre cada código se documenta en ``docs/auditoria/B_SINIA_2012.md``.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))
os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

REST = "https://geoportal.miambiente.gob.pa/server/rest/services/Nodo_Suelos/MapServer"
ASSET = "projects/geoportal-513817/assets/SINIA_2012_USO_SUELO_RASTER5M"
CAPA = 2


def desplazar(lon, lat, dx, dy):
    return lon + dx / (111_320 * math.cos(math.radians(lat))), lat + dy / 110_540


def main() -> int:
    import ee
    import requests

    from auditar_assets_sinia import consultar_rest
    from chcp.gee.gee_config import desactivar_teselas, inicializar_earth_engine
    from chcp.territorio.territorio_local import geometria_cuenca

    parser = argparse.ArgumentParser()
    parser.add_argument("--puntos", type=int, default=30)
    parser.add_argument("--radio", type=int, default=5, help="píxeles de 5 m a cada lado que deben tener el mismo código")
    parser.add_argument("--semilla", type=int, default=20261122)
    parser.add_argument("--pausa", type=float, default=0.15)
    args = parser.parse_args()

    inicializar_earth_engine(ee)
    desactivar_teselas(ee)
    sesion = requests.Session()
    meta = sesion.get(f"{REST}/{CAPA}", params={"f": "json"}, timeout=60).json()
    leyenda = sesion.get(f"{REST}/legend", params={"f": "json"}, timeout=60).json()
    leyenda_capa = next((l for l in leyenda.get("layers", []) if l.get("layerId") == CAPA), {})

    chcp = ee.Geometry(geometria_cuenca())
    codigo = ee.Image(ASSET).select([0], ["codigo"]).toInt()
    ventana = codigo.reduceNeighborhood(ee.Reducer.minMax(), ee.Kernel.square(args.radio, "pixels"))
    interior = ventana.select("codigo_min").eq(ventana.select("codigo_max"))
    muestras = (codigo.updateMask(interior)
                .stratifiedSample(numPoints=args.puntos, classBand="codigo", region=chcp, scale=5, projection=codigo.projection(),
                                  seed=args.semilla, geometries=True, tileScale=16).getInfo()["features"])
    capa = {"id": CAPA, "tipo": "raster"}
    puntos = []
    for f in muestras:
        lon, lat = f["geometry"]["coordinates"]
        c = int(f["properties"]["codigo"])
        centro = {k: v for k, v in consultar_rest(capa, lon, lat, sesion).items() if k != "atributos"}
        time.sleep(args.pausa)
        vecinos = []
        for dx, dy in ((10, 0), (-10, 0), (0, 10), (0, -10)):
            vecinos.append(consultar_rest(capa, *desplazar(lon, lat, dx, dy), sesion).get("valor_servicio"))
            time.sleep(args.pausa)
        puntos.append({"codigo_asset": c, "lon": lon, "lat": lat, "servicio": centro, "servicio_desplazado": vecinos})
    resumen = {}
    for c in sorted({p["codigo_asset"] for p in puntos}):
        ps = [p for p in puntos if p["codigo_asset"] == c]
        valores = Counter(str(p["servicio"].get("valor_servicio")) for p in ps)
        nombres = Counter(str(p["servicio"].get("categoria")) for p in ps)
        n = len(ps)
        mismo = valores.get(str(c), 0) / n * 100 if n else 0
        dom, ndom = valores.most_common(1)[0] if valores else (None, 0)
        estable = sum(1 for p in ps if len({str(v) for v in p["servicio_desplazado"]} | {str(p["servicio"].get("valor_servicio"))}) == 1) / n * 100 if n else 0
        if n >= 20 and mismo >= 80:
            decision = "verificado_interior"
        elif n >= 20 and dom != str(c) and ndom / n * 100 >= 90:
            decision = "recodificacion_sistematica_candidata (confirmar con MiAMBIENTE)"
        else:
            decision = "no_verificado (mantener excluido)"
        resumen[str(c)] = {"puntos_interiores": n, "acuerdo_mismo_codigo_pct": round(mismo, 1), "valor_servicio_dominante": dom,
                           "acuerdo_dominante_pct": round(ndom / n * 100, 1) if n else None, "valores_servicio": dict(valores),
                           "categorias_servicio": dict(nombres), "estabilidad_desplazamiento_10m_pct": round(estable, 1), "decision": decision}
    salida = RAIZ / "docs" / "auditoria" / "datos" / "B_comparacion_controlada_2012.json"
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(json.dumps({
        "fecha": datetime.now().isoformat(timespec="seconds"), "asset": ASSET, "servicio": f"{REST}/{CAPA}",
        "parametros": vars(args),
        "metadatos_servicio": {k: meta.get(k) for k in ("name", "type", "description", "copyrightText", "pixelSizeX", "pixelSizeY",
                                                        "extent", "minScale", "maxScale", "bandCount", "pixelType", "currentVersion")},
        "leyenda_servicio": leyenda_capa.get("legend"),
        "por_codigo": resumen, "puntos": puntos,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({c: r["decision"] for c, r in resumen.items()}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
