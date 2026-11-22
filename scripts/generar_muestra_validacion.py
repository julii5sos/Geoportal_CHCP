"""Genera la muestra estratificada de validación de un mapa del geoportal (Earth Engine).

    python scripts/generar_muestra_validacion.py --mapa senal_perdida
    python scripts/generar_muestra_validacion.py --mapa sinia_2021 --error-objetivo 0.015 --minimo 50

Escribe en ``data/validacion/<mapa>/``:
  diseno.json    estratos, superficies, tamaño y asignación, semilla y fecha
  muestra.csv    puntos para interpretar, en orden aleatorio y SIN la clase del mapa (interpretación ciega)
  estratos.csv   id → clase del mapa (solo para el cálculo; no abrir durante la interpretación)
  muestra.kml    los mismos puntos para Google Earth Pro (imágenes históricas)

No sobrescribe una muestra que ya tenga interpretaciones, salvo con ``--forzar``.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))
os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

# Campos de interpretación y control de calidad (auditoría C.5). «clase_referencia» puede ser 0 /
# «sin_evidencia». La revisión por un segundo intérprete usa «interprete_2» y «clase_referencia_2»;
# los desacuerdos se resuelven en «clase_final» con su justificación en «resolucion».
COLUMNAS_MUESTRA = ["id", "lon", "lat", "clase_referencia", "confianza", "fecha_imagen", "fuente_imagen", "interprete", "fecha",
                    "interprete_2", "clase_referencia_2", "clase_final", "resolucion", "notas"]
EXACTITUD_ESPERADA = {"perdida": 0.7, "bosque": 0.9, "no_bosque": 0.85, "otras": 0.85, "agua": 0.95}


def escribir_kml(ruta: Path, puntos: list[dict], titulo: str) -> None:
    marcas = "".join(
        f"<Placemark><name>{p['id']}</name><Point><coordinates>{p['lon']},{p['lat']},0</coordinates></Point></Placemark>"
        for p in puntos)
    ruta.write_text(f'<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
                    f"<name>{escape(titulo)}</name>{marcas}</Document></kml>", encoding="utf-8")


def main() -> int:
    from chcp.gee.gee_config import desactivar_teselas
    from chcp.gee.muestreo_validacion import MAPAS, areas_estratos, extraer_muestra, imagen_estratos
    from chcp.nucleo.validacion import asignar_muestra, tamano_muestra
    from webapp.models import AreaSelection
    from webapp.service import _initialize_ee, resolve_area
    import ee

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--mapa", choices=sorted(MAPAS), default="senal_perdida")
    parser.add_argument("--error-objetivo", type=float, default=0.015, help="Error estándar objetivo de la exactitud global")
    parser.add_argument("--minimo", type=int, default=75, help="Puntos mínimos por estrato")
    parser.add_argument("--semilla", type=int, default=2026)
    parser.add_argument("--forzar", action="store_true")
    args = parser.parse_args()

    definicion = MAPAS[args.mapa]
    destino = RAIZ / "data" / "validacion" / args.mapa
    muestra_csv = destino / "muestra.csv"
    if muestra_csv.exists() and not args.forzar:
        with muestra_csv.open(encoding="utf-8") as f:
            if any((fila.get("clase_referencia") or "").strip() for fila in csv.DictReader(f)):
                print("La muestra ya tiene interpretaciones; use --forzar para reemplazarla.")
                return 1

    desactivar_teselas(ee)
    _initialize_ee()
    geometria_geojson, _ = resolve_area(AreaSelection(mode="basin"))
    geometria = ee.Geometry(geometria_geojson, proj="EPSG:4326", geodesic=False)
    imagen = imagen_estratos(args.mapa, geometria, ee)
    areas = areas_estratos(imagen, geometria, definicion["escala_m"], ee)
    leyenda = {c["codigo"]: c for c in definicion["leyenda"]}
    areas = {c: areas.get(c, 0.0) for c in leyenda}
    total = sum(areas.values())
    pesos = {c: a / total for c, a in areas.items()}
    esperada = {c: EXACTITUD_ESPERADA.get(leyenda[c]["clave"], 0.85) for c in leyenda}
    n = max(tamano_muestra(pesos, esperada, args.error_objetivo), args.minimo * sum(1 for a in areas.values() if a > 0))
    asignacion = asignar_muestra(n, areas, args.minimo)
    print(f"Superficies (ha): { {leyenda[c]['etiqueta']: round(a) for c, a in areas.items()} }")
    print(f"Tamaño {n}; asignación { {leyenda[c]['etiqueta']: k for c, k in asignacion.items()} }")

    puntos = extraer_muestra(imagen, geometria, asignacion, definicion["escala_m"], args.semilla, ee)
    random.Random(args.semilla).shuffle(puntos)
    for i, p in enumerate(puntos, 1):
        p["id"] = f"{args.mapa[:3].upper()}-{i:04d}"

    destino.mkdir(parents=True, exist_ok=True)
    with muestra_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS_MUESTRA)
        w.writeheader()
        for p in puntos:
            w.writerow({"id": p["id"], "lon": p["lon"], "lat": p["lat"]})
    with (destino / "estratos.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "clase_mapa"])
        for p in puntos:
            w.writerow([p["id"], p["clase_mapa"]])
    escribir_kml(destino / "muestra.kml", puntos, definicion["titulo"])
    obtenidos = {c: sum(1 for p in puntos if p["clase_mapa"] == c) for c in leyenda}
    (destino / "diseno.json").write_text(json.dumps({
        "mapa": args.mapa, "titulo": definicion["titulo"], "descripcion": definicion["descripcion"],
        "leyenda": definicion["leyenda"], "territorio": "Cuenca Hidrográfica del Canal de Panamá",
        "areas_ha": {str(c): round(a, 2) for c, a in areas.items()},
        "n_planeado": n, "asignacion": {str(c): k for c, k in asignacion.items()},
        "n_obtenido": {str(c): k for c, k in obtenidos.items()},
        "error_objetivo": args.error_objetivo, "minimo_por_estrato": args.minimo, "semilla": args.semilla,
        "escala_m": definicion["escala_m"], "proyecto": os.environ["GEE_PROJECT_ID"],
        "generado": datetime.now().isoformat(timespec="seconds"),
        "metodo": "Muestreo aleatorio estratificado por clase del mapa; estimadores de Olofsson et al. (2014).",
        "version_mapa": definicion.get("version", 1),
        "reglas_interpretacion": "Interpretación ciega (sin abrir estratos.csv ni capas del geoportal), píxel centrado en el punto, "
                                 "fecha de imagen registrada; 0 = sin evidencia suficiente (se excluye y se informa); revisión de "
                                 "al menos 10 % de los puntos y de todos los de confianza baja por un segundo intérprete.",
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(puntos)} puntos en {destino}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
