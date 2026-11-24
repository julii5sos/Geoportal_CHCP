"""Exactitud de cada fuente de pérdida por separado, con la muestra ya interpretada.

    python scripts/exactitud_por_fuente.py --extraer   # Earth Engine: valor de cada fuente en los puntos
    python scripts/exactitud_por_fuente.py             # sin Earth Engine: calcula la exactitud

La muestra de ``data/validacion/senal_perdida`` se estratificó con el mapa de coincidencia
(≥ 2 fuentes). Para evaluar con ella cada fuente por separado se usan los estimadores de
Stehman (2014), válidos cuando el mapa evaluado no es el de los estratos. Escribe
``fuentes_puntos.csv`` (con --extraer) y ``resultados_fuentes.json``.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))
os.environ.setdefault("GEE_PROJECT_ID", "geoportal-513817")

from chcp.nucleo.validacion import exactitud_binaria_estratificada  # noqa: E402

CARPETA = RAIZ / "data" / "validacion" / "senal_perdida"
FUENTES = ("jrc", "hansen", "esri", "ndvi")
NOMBRES = {"jrc": "JRC TMF", "hansen": "Hansen GFC", "esri": "ESRI LULC", "ndvi": "NDVI Sentinel-2",
           "al_menos_1": "Al menos 1 de JRC, Hansen y ESRI", "al_menos_2": "Al menos 2 de JRC, Hansen y ESRI (mapa de coincidencia)"}


def extraer(carpeta: Path) -> None:
    from chcp.gee.gee_config import desactivar_teselas
    from chcp.gee.muestreo_validacion import valores_fuentes
    from webapp.models import AreaSelection
    from webapp.service import _initialize_ee, resolve_area
    import ee

    desactivar_teselas(ee)
    _initialize_ee()
    geojson, _ = resolve_area(AreaSelection(mode="basin"))
    geometria = ee.Geometry(geojson, proj="EPSG:4326", geodesic=False)
    with (carpeta / "muestra.csv").open(encoding="utf-8") as f:
        puntos = [{"id": x["id"], "lon": x["lon"], "lat": x["lat"]} for x in csv.DictReader(f)]
    valores = {v["id"]: v for v in valores_fuentes(puntos, geometria, ee)}
    columnas = ["id", *FUENTES, "ndvi_inicial", "ndvi_final"]
    with (carpeta / "fuentes_puntos.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columnas, extrasaction="ignore")
        w.writeheader()
        for p in puntos:
            v = valores.get(p["id"], {})
            w.writerow({"id": p["id"], **{k: (round(v[k], 4) if isinstance(v.get(k), float) else v.get(k, "")) for k in columnas[1:]}})
    print(f"{len(valores)} de {len(puntos)} puntos con valores de las fuentes")


def calcular(carpeta: Path) -> dict | None:
    """Escribe resultados_fuentes.json si existen fuentes_puntos.csv y la muestra interpretada."""
    from evaluar_validacion import referencias_finales  # noqa: PLC0415

    if not (carpeta / "fuentes_puntos.csv").exists():
        return None
    diseno = json.loads((carpeta / "diseno.json").read_text(encoding="utf-8"))
    areas = {int(k): float(v) for k, v in diseno["areas_ha"].items()}
    with (carpeta / "estratos.csv").open(encoding="utf-8") as f:
        estrato = {x["id"]: int(x["clase_mapa"]) for x in csv.DictReader(f)}
    with (carpeta / "fuentes_puntos.csv").open(encoding="utf-8") as f:
        fuentes = {x["id"]: x for x in csv.DictReader(f)}
    referencia = referencias_finales(carpeta)  # id → código de la leyenda (sin «sin evidencia» ni desacuerdos)
    perdida = next(c["codigo"] for c in diseno["leyenda"] if c["clave"] == "perdida")

    def senal(v: dict, k: str) -> int | None:
        try:
            return int(float(v[k]) > 0)
        except (KeyError, TypeError, ValueError):
            return None

    filas = []
    for pid, ref in referencia.items():
        v = fuentes.get(pid)
        if pid not in estrato or not v:
            continue
        s = {k: senal(v, k) for k in FUENTES}
        if any(x is None for x in s.values()):
            continue
        n3 = s["jrc"] + s["hansen"] + s["esri"]
        s["al_menos_1"], s["al_menos_2"] = int(n3 >= 1), int(n3 >= 2)
        filas.append((estrato[pid], s, int(ref == perdida)))
    if not filas:
        return None
    # Control: la regla ≥ 2 recalculada en los puntos debe coincidir con los estratos.
    coincide = sum(1 for h, s, _ in filas if (h == perdida) == bool(s["al_menos_2"])) / len(filas)
    resultados = {}
    for k in (*FUENTES, "al_menos_1", "al_menos_2"):
        r = exactitud_binaria_estratificada([(h, s[k], ref) for h, s, ref in filas], areas)
        resultados[k] = {"nombre": NOMBRES[k], **{a: (round(b, 4) if isinstance(b, float) else b) for a, b in r.items() if a != "metodo"}}
    salida = {"mapa": "senal_perdida", "metodo": "Stehman (2014): muestreo aleatorio estratificado; cada fuente se evalúa "
              "como mapa binario de pérdida 2021–2025 con la misma muestra interpretada. IC 95 %.",
              "n": len(filas), "concordancia_con_estratos": round(coincide, 4), "fuentes": resultados,
              "actualizado": datetime.now().isoformat(timespec="seconds")}
    (carpeta / "resultados_fuentes.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return salida


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--extraer", action="store_true", help="extraer con Earth Engine el valor de cada fuente en los puntos")
    args = ap.parse_args()
    sys.path.insert(0, str(RAIZ / "scripts"))
    if args.extraer:
        extraer(CARPETA)
    r = calcular(CARPETA)
    if r is None:
        print("Sin fuentes_puntos.csv o sin interpretaciones: no se calcula.")
        return 0
    print(f"{r['n']} puntos; la regla ≥ 2 coincide con los estratos en el {r['concordancia_con_estratos'] * 100:.1f} %")
    for k, v in r["fuentes"].items():
        ua = "—" if v["exactitud_usuario"] is None else f"{v['exactitud_usuario'] * 100:.0f} %"
        print(f"  {v['nombre']}: usuario {ua}, productor {v['exactitud_productor'] * 100:.0f} %, global {v['exactitud_global'] * 100:.0f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
