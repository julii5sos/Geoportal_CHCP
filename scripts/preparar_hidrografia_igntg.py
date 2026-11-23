"""Capa ribereña de la CHCP a partir de la red hidrográfica oficial del IGNTG (2022).

Entrada: shapefiles de líneas del Instituto Geográfico Nacional Tommy Guardia (mapas
topográficos 1:25 000), en EPSG:32617. Por ejemplo:
    Redhidrologica_2022.shp   ríos principales (STR_ORDER 1)
    Redhidrologica2_2022.shp  red secundaria de ríos y quebradas (STR_ORDER 2)

Salida:
    data/hidrografia/riparia_igntg.v.png      distancia al cauce por clases, malla EPSG:3857
    data/hidrografia/riparia_igntg.json       malla, clases, fuente y longitudes por tipo
    data/hidrografia/rios_igntg_chcp.geojson  cauces recortados a la cuenca + 2 km (WGS 84),
                                              simplificados a 5 m, con nombre y tipo

La red del IGNTG es de acceso abierto (confirmado por el equipo del proyecto); se cita al
IGNTG como productor.

Clases de la banda ribereña (por lado del cauce), con celdas de 20 m:
    1 cauce: celda atravesada por la línea (≈ ±10 m, el mínimo legal de la franja protectora
      de ríos y quebradas según la Ley 1 de 1994, art. 23), 3 ≤ 30 m, 4 ≤ 50 m, 5 ≤ 100 m,
      255 fuera de la banda o de la zona.

Uso:
    python scripts/preparar_hidrografia_igntg.py RUTA.shp [RUTA2.shp ...]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
import shapefile  # pyshp
from PIL import Image, ImageDraw
from pyproj import Transformer
from scipy import ndimage
from shapely.geometry import shape
from shapely.ops import transform

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from chcp.territorio.territorio_local import geometria_cuenca  # noqa: E402

DESTINO = RAIZ / "data" / "hidrografia"
RESOLUCION_M = 20.0          # tamaño de celda sobre el terreno
MARGEN_M = 2_000.0           # alrededor de la cuenca (rutas y margen del simulador)
CLASES = [
    {"valor": 1, "etiqueta": "Cauce y franja legal mínima (≈ 10 m)", "hasta_m": 10},
    {"valor": 3, "etiqueta": "Franja de 30 m", "hasta_m": 30},
    {"valor": 4, "etiqueta": "Franja de 50 m", "hasta_m": 50},
    {"valor": 5, "etiqueta": "Franja de 100 m", "hasta_m": 100},
]
R = 6378137.0


def merc(lon: float, lat: float) -> tuple[float, float]:
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shapefiles", nargs="+", type=Path)
    args = ap.parse_args(argv)

    a_utm = Transformer.from_crs(4326, 32617, always_xy=True).transform
    utm_a_merc = Transformer.from_crs(32617, 3857, always_xy=True).transform
    a_wgs = Transformer.from_crs(32617, 4326, always_xy=True).transform
    cuenca = transform(a_utm, shape(geometria_cuenca()))
    zona = cuenca.buffer(MARGEN_M)

    oeste, sur, este, norte = transform(a_wgs, zona).bounds
    lat0 = (sur + norte) / 2
    paso = RESOLUCION_M / math.cos(math.radians(lat0))  # metros de Mercator por celda
    x0, y0 = merc(oeste, sur)
    x1, y1 = merc(este, norte)
    ancho, alto = math.ceil((x1 - x0) / paso), math.ceil((y1 - y0) / paso)
    x1, y0 = x0 + ancho * paso, y1 - alto * paso

    a_wgs_xy = Transformer.from_crs(32617, 4326, always_xy=True).transform
    rios = []
    lienzo = Image.new("1", (ancho, alto), 0)
    dibujo = ImageDraw.Draw(lienzo)
    km = {}
    capas = []
    for ruta in args.shapefiles:
        lector = shapefile.Reader(str(ruta.with_suffix("")), encoding="utf-8")
        prj = ruta.with_suffix(".prj")
        if not prj.exists() or "UTM_Zone_17N" not in prj.read_text() and "UTM zone 17N" not in prj.read_text():
            raise SystemExit(f"{ruta.name}: se esperaba EPSG:32617 (WGS 84 / UTM 17N) en el .prj")
        n = 0
        for registro in lector.iterShapeRecords():
            geom = shape(registro.shape.__geo_interface__)
            if not geom.intersects(zona):
                continue
            dentro = geom.intersection(zona)
            tipo = registro.record["TYPE"] or "Sin tipo"
            atributos = registro.record.as_dict()
            visible = dentro.simplify(5, preserve_topology=False)
            if not visible.is_empty:
                geo = transform(a_wgs_xy, visible).__geo_interface__
                redondear = lambda c: [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], float) else [redondear(x) for x in c]  # noqa: E731
                rios.append({"type": "Feature", "properties": {
                    "nombre": atributos.get("NAME") or None,
                    "nombre_alt": atributos.get("ALT_NAME") or None,
                    "tipo": tipo,
                    "tributario_de": atributos.get("TRIBUTARY") or None,
                    "red": "principal" if str(atributos.get("STR_ORDER")) == "1" else "secundaria",
                    "longitud_km": round(dentro.length / 1000, 3),
                }, "geometry": {"type": geo["type"], "coordinates": redondear(list(map(list, geo["coordinates"])) if geo["type"] == "LineString" else [list(map(list, l)) for l in geo["coordinates"]])}})
            km[tipo] = km.get(tipo, 0.0) + geom.intersection(cuenca).length / 1000
            n += 1
            partes = getattr(dentro, "geoms", [dentro])
            for parte in partes:
                if parte.is_empty or parte.geom_type != "LineString":
                    continue
                xy = [utm_a_merc(x, y) for x, y in parte.coords]
                dibujo.line([((x - x0) / paso, (y1 - y) / paso) for x, y in xy], fill=1, width=1)
        capas.append({"archivo": ruta.name, "tramos_en_zona": n})
        print(f"{ruta.name}: {n} tramos en la cuenca + {MARGEN_M:.0f} m", file=sys.stderr)

    cauce = np.array(lienzo, dtype=bool)
    distancia = ndimage.distance_transform_edt(~cauce) * RESOLUCION_M
    valores = np.full(cauce.shape, 255, dtype=np.uint8)
    for clase in reversed(CLASES):
        valores[distancia <= clase["hasta_m"]] = clase["valor"]
    valores[cauce] = 1

    # Fuera de la cuenca + margen no hay dato.
    mascara = Image.new("1", (ancho, alto), 0)
    dm = ImageDraw.Draw(mascara)
    poligonos = getattr(zona, "geoms", [zona])
    for poligono in poligonos:
        anillo = [utm_a_merc(x, y) for x, y in poligono.exterior.coords]
        dm.polygon([((x - x0) / paso, (y1 - y) / paso) for x, y in anillo], fill=1)
    valores[~np.array(mascara, dtype=bool)] = 255

    DESTINO.mkdir(parents=True, exist_ok=True)
    Image.fromarray(valores, mode="L").save(DESTINO / "riparia_igntg.v.png", optimize=True)
    inv = lambda x, y: (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))  # noqa: E731
    (o, s), (e, nn) = inv(x0, y0), inv(x1, y1)
    banda = {c["etiqueta"]: round(float((valores <= c["valor"]).sum() * RESOLUCION_M ** 2 / 10_000), 1) for c in CLASES}
    meta = {
        "fuente": "Instituto Geográfico Nacional Tommy Guardia (IGNTG) · Hidrografía y drenajes 2022, "
                  "de los mapas topográficos 1:25 000",
        "derechos": "Instituto Geográfico Nacional Tommy Guardia.",
        "capas": capas,
        "procesado": date.today().isoformat(),
        "nota": "Banda ribereña derivada (distancia al cauce por clases) y cauces recortados a la cuenca + 2 km. "
                "Fuente de acceso abierto según el equipo del proyecto; cite al IGNTG.",
        "referencia_legal": "Ley 1 de 1994 (Ley Forestal), art. 23: franja protectora a cada lado de ríos y "
                            "quebradas igual o mayor al ancho del cauce y nunca menor de 10 m.",
        "crs": "EPSG:3857",
        "limites": [[round(s, 6), round(o, 6)], [round(nn, 6), round(e, 6)]],
        "dimensiones": [ancho, alto],
        "tamano_pixel_m": RESOLUCION_M,
        "margen_m": MARGEN_M,
        "clases": CLASES,
        "sin_dato": 255,
        "km_en_cuenca_por_tipo": {k: round(v, 1) for k, v in sorted(km.items())},
        "superficie_banda_acumulada_ha": banda,
    }
    (DESTINO / "rios_igntg_chcp.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "fuente": meta["fuente"], "features": rios},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    meta["tramos_publicados"] = len(rios)
    (DESTINO / "riparia_igntg.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: meta[k] for k in ("dimensiones", "km_en_cuenca_por_tipo", "superficie_banda_acumulada_ha")},
                     ensure_ascii=False), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
