"""Imágenes sin nubes y series por punto para interpretar la muestra de validación.

En la Cuenca del Canal la nubosidad casi permanente impide ver el cambio en Google Earth. Para
cada punto de ``data/validacion/<mapa>/muestra.csv`` se preparan, con Earth Engine:

* **Recortes Sentinel-2 sin nubes** (color natural, 10 m, 640 × 640 m) de varios años: mediana
  anual de los píxeles despejados según Cloud Score+ (``cs_cdf`` ≥ 0,6).
* **Serie de NDVI** anual (misma mediana sin nubes) en la celda de 30 m del punto.
* **Serie de radar Sentinel-1** (retrodispersión VH anual, dB): el radar atraviesa las nubes; un
  desmonte suele bajar la señal VH varios dB.

Son ayudas para la interpretación visual (referencia de mejor calidad que el mapa de 30 m); no
contienen la clase del mapa, así que la interpretación sigue siendo ciega.

Salida en data/validacion/<mapa>/imagenes/: ``<id>_<año>.jpg``, ``series.json`` e ``indice.json``.
Reanudable: no repite recortes que ya existen.

    python scripts/imagenes_validacion.py --mapa senal_perdida
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

ANIOS_RECORTES = (2020, 2022, 2025)
ANIOS_SERIES = tuple(range(2017, 2026))
PIXELES = 64              # recorte de 64 × 64 píxeles
ESCALA_M = 10             # … de 10 m en el terreno (640 m de lado)
UMBRAL_DESPEJADO = 0.6    # Cloud Score+ cs_cdf
HILOS = 6


def leer_muestra(mapa: str) -> list[dict]:
    ruta = RAIZ / "data" / "validacion" / mapa / "muestra.csv"
    if not ruta.exists():
        raise SystemExit(f"No existe {ruta}: genere primero la muestra.")
    with ruta.open(encoding="utf-8") as f:
        return [{"id": r["id"], "lon": float(r["lon"]), "lat": float(r["lat"])} for r in csv.DictReader(f)]


def malla_punto(lon: float, lat: float, pixeles: int = PIXELES, escala_m: float = ESCALA_M) -> dict:
    """Malla EPSG:3857 centrada en el punto, con píxeles de ``escala_m`` en el terreno."""
    r = 6378137.0
    x = math.radians(lon) * r
    y = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * r
    s = escala_m / math.cos(math.radians(lat))  # metros Mercator por píxel
    medio = pixeles * s / 2
    return {"dimensions": {"width": pixeles, "height": pixeles}, "crsCode": "EPSG:3857",
            "affineTransform": {"scaleX": s, "shearX": 0, "translateX": x - medio, "shearY": 0, "scaleY": -s, "translateY": y + medio}}


def s2_despejado(anio: int, region, ee):
    """Mediana anual de Sentinel-2 SR con los píxeles nublados enmascarados (Cloud Score+)."""
    cs = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(region)
           .filterDate(f"{anio}-01-01", f"{anio + 1}-01-01").linkCollection(cs, ["cs_cdf"])
           .map(lambda i: i.updateMask(i.select("cs_cdf").gte(UMBRAL_DESPEJADO)).divide(10000)))
    return col.median()


def s1_vh(anio: int, region, ee):
    col = (ee.ImageCollection("COPERNICUS/S1_GRD").filterBounds(region).filterDate(f"{anio}-01-01", f"{anio + 1}-01-01")
           .filter(ee.Filter.eq("instrumentMode", "IW")).filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
           .select("VH"))
    return col.median()


def recorte(p: dict, anio: int, destino: Path, ee) -> None:
    ruta = destino / f"{p['id']}_{anio}.jpg"
    if ruta.exists():
        return
    region = ee.Geometry.Point([p["lon"], p["lat"]]).buffer(500)
    img = s2_despejado(anio, region, ee).select(["B4", "B3", "B2"]).visualize(min=0.0, max=0.18, gamma=1.3)
    for intento in range(3):
        try:
            datos = ee.data.computePixels({"expression": img, "fileFormat": "JPEG", "grid": malla_punto(p["lon"], p["lat"])})
            ruta.write_bytes(datos)
            return
        except Exception:  # noqa: BLE001
            if intento == 2:
                raise
            time.sleep(10 * (intento + 1))


def series(puntos: list[dict], ee) -> dict:
    """NDVI y VH anuales por punto (media en la celda de 30 m), en pocas consultas."""
    fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([p["lon"], p["lat"]]).buffer(15), {"id": p["id"]}) for p in puntos])
    region = fc.geometry().bounds()
    salida: dict[str, dict] = {p["id"]: {"ndvi": {}, "vh": {}} for p in puntos}
    for anio in ANIOS_SERIES:
        for clave, imagen, escala in (
            ("ndvi", lambda a: s2_despejado(a, region, ee).normalizedDifference(["B8", "B4"]).rename("v"), 10),
            ("vh", lambda a: s1_vh(a, region, ee).rename("v"), 10),
        ):
            for intento in range(3):
                try:
                    res = imagen(anio).reduceRegions(collection=fc, reducer=ee.Reducer.mean().setOutputs(["v"]), scale=escala, tileScale=4).getInfo()
                    break
                except Exception as exc:  # noqa: BLE001
                    if intento == 2:
                        print(f"  sin {clave} {anio}: {str(exc)[:120]}", flush=True)
                        res = {"features": []}
                    else:
                        time.sleep(15 * (intento + 1))
            for f in res["features"]:
                v = f["properties"].get("v")
                if v is not None:
                    salida[f["properties"]["id"]][clave][str(anio)] = round(float(v), 3 if clave == "ndvi" else 2)
        print(f"  series {anio} listas", flush=True)
    return salida


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--mapa", default="senal_perdida")
    ap.add_argument("--sin-series", action="store_true")
    args = ap.parse_args(argv)

    import ee

    from webapp.service import _initialize_ee

    proyecto = _initialize_ee()
    puntos = leer_muestra(args.mapa)
    destino = RAIZ / "data" / "validacion" / args.mapa / "imagenes"
    destino.mkdir(parents=True, exist_ok=True)
    tareas = [(p, a) for p in puntos for a in ANIOS_RECORTES if not (destino / f"{p['id']}_{a}.jpg").exists()]
    print(f"Proyecto {proyecto}: {len(puntos)} puntos, {len(tareas)} recortes pendientes", flush=True)
    errores = 0
    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        futuros = {pool.submit(recorte, p, a, destino, ee): (p, a) for p, a in tareas}
        for k, fut in enumerate(as_completed(futuros), 1):
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                errores += 1
                p, a = futuros[fut]
                print(f"  ✗ {p['id']} {a}: {str(exc)[:120]}", flush=True)
            if k % 50 == 0 or k == len(tareas):
                print(f"  [{k}/{len(tareas)}] recortes", flush=True)
    if not args.sin_series:
        (destino / "series.json").write_text(json.dumps(series(puntos, ee), separators=(",", ":")), encoding="utf-8")
    (destino / "indice.json").write_text(json.dumps({
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "proyecto": proyecto,
        "anios_recortes": list(ANIOS_RECORTES), "anios_series": list(ANIOS_SERIES),
        "recorte": {"pixeles": PIXELES, "escala_m": ESCALA_M, "lado_m": PIXELES * ESCALA_M},
        "fuentes": {"recortes": "Sentinel-2 SR armonizado, mediana anual de píxeles despejados (Cloud Score+ cs_cdf ≥ 0,6), color natural",
                    "ndvi": "Misma mediana anual de Sentinel-2", "vh": "Sentinel-1 GRD IW, VH, mediana anual (dB)"},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    if errores:
        print(f"{errores} recorte(s) con error: vuelva a ejecutar para reintentarlos.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
