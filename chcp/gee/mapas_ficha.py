"""Mapas temáticos y análisis ripario precalculados para la ficha técnica.

Los mapas se piden a Earth Engine como matrices de valores (``computePixels``) en una
malla Web Mercator ajustada a cada territorio y se colorean aquí con leyendas fijas.
Así el sitio estático muestra mapas sin teselas dinámicas ni credenciales en el
navegador, y la cuenta de servicio no necesita el permiso ``maps.create``.

El análisis ripario usa la misma red de drenaje que el ERI (MERIT Hydro, área de
drenaje ≥ 1 km²). La distancia al cauce se interpola desde la malla de 90 m de MERIT;
por eso las franjas de 30, 50 y 100 m son **indicativas** (error de posición del
orden de decenas de metros) y no reemplazan una cartografía hidrográfica local.
"""

from __future__ import annotations

import io
import math
from typing import Any, Callable

from chcp.gee.analisis_complementario import _ndvi
from chcp.gee.analisis_temporal import _estado_y_mascara_valida_ee
from chcp.gee.coberturas_sinia import COLORES as COLORES_SINIA, _imagen_categorias
from chcp.gee.eri_gee import AREA_DRENAJE_ERI_KM2, construir_imagenes_eri
from chcp.gee.evaluacion_ecologica import _coincidence, _hansen
from chcp.nucleo.eri_indicativo import CLASES_ERI
from chcp.nucleo.metodologia_indice import PERIODOS_ANALISIS

RADIO_TIERRA = 6_378_137.0
SIN_DATO = -9999.0
MAX_PIXELES_LADO = 900
TAMANO_MINIMO_M = 10.0
FRANJAS_RIPARIAS_M = (30, 50, 100)
FRANJA_MAPA_M = 50
CLASES_PENDIENTE_PCT = ((0, 15), (15, 30), (30, None))
RIOS_ASSET = "WWF/HydroSHEDS/v1/FreeFlowingRivers"

# ---------------------------------------------------------------------------
# Leyendas: única fuente para los PNG y para la ficha (se copian al JSON).
# ---------------------------------------------------------------------------
_ERI_COLORES = [c["color"] for c in CLASES_ERI]

CAPAS: list[dict[str, Any]] = [
    {"clave": "sinia_2021", "titulo": "Cobertura oficial SINIA 2021", "tipo": "categorias",
     "leyenda": [{"valor": 1, "color": COLORES_SINIA[1], "etiqueta": "Bosques y otras tierras boscosas"},
                 {"valor": 2, "color": COLORES_SINIA[2], "etiqueta": "Otras tierras"},
                 {"valor": 3, "color": COLORES_SINIA[3], "etiqueta": "Cuerpos de agua"}],
     "lectura": "Cartografía oficial de MiAMBIENTE (vector 2021 rasterizado). Es la base de la fragmentación y la conectividad."},
    {"clave": "jrc_2025", "titulo": "Estado del bosque húmedo · JRC TMF 2025", "tipo": "categorias",
     "leyenda": [{"valor": 1, "color": "#1d6b35", "etiqueta": "Bosque sin perturbación"},
                 {"valor": 2, "color": "#f28e2b", "etiqueta": "Bosque degradado"},
                 {"valor": 3, "color": "#fabc20", "etiqueta": "Deforestado"},
                 {"valor": 4, "color": "#a6d96a", "etiqueta": "Regeneración"},
                 {"valor": 5, "color": "#5aa9e6", "etiqueta": "Agua"},
                 {"valor": 6, "color": "#d7c2a1", "etiqueta": "Otra cobertura"}],
     "lectura": "Clases acumuladas desde 1990 a diciembre de 2025 (Landsat, 30 m)."},
    {"clave": "hansen", "titulo": "Pérdida de cobertura arbórea por año · Hansen GFC", "tipo": "categorias",
     "leyenda": [{"valor": 21, "color": "#fee391", "etiqueta": "2021"},
                 {"valor": 22, "color": "#fec44f", "etiqueta": "2022"},
                 {"valor": 23, "color": "#fe9929", "etiqueta": "2023"},
                 {"valor": 24, "color": "#ec7014", "etiqueta": "2024"},
                 {"valor": 25, "color": "#cc4c02", "etiqueta": "2025"}],
     "lectura": "Año de la pérdida detectada (30 m). Incluye cosecha de plantaciones; no indica la causa."},
    {"clave": "esri_cambio", "titulo": "Cambio de árboles 2017 → 2024 · ESRI", "tipo": "categorias",
     "leyenda": [{"valor": 1, "color": "#d7301f", "etiqueta": "Árboles en 2017, otra clase en 2024"},
                 {"valor": 2, "color": "#2b8cbe", "etiqueta": "Otra clase en 2017, árboles en 2024"},
                 {"valor": 3, "color": "#a1d99b", "etiqueta": "Árboles en ambos años"}],
     "lectura": "Clasificación automática Sentinel-2 (10 m); los bordes y mosaicos agrícolas tienen más error."},
    {"clave": "ndvi_cambio", "titulo": "Cambio del NDVI 2020 → 2025 · Sentinel-2", "tipo": "continuo",
     "minimo": -0.3, "maximo": 0.3,
     "paleta": ["#8c510a", "#d8b365", "#f6e8c3", "#f5f5f5", "#c7eae5", "#5ab4ac", "#01665e"],
     "leyenda": [{"color": "#8c510a", "etiqueta": "≤ −0.30 (pérdida fuerte de vigor)"},
                 {"color": "#f5f5f5", "etiqueta": "Sin cambio"},
                 {"color": "#01665e", "etiqueta": "≥ +0.30 (más vigor)"}],
     "lectura": "Diferencia de la mediana anual sin nubes. Un descenso puede deberse a cosecha, sequía o nubes residuales; no es pérdida de bosque por sí solo."},
    {"clave": "eri", "titulo": "Resiliencia ecológica indicativa (ERI)", "tipo": "continuo",
     "minimo": 0.0, "maximo": 1.0, "paleta": _ERI_COLORES,
     "leyenda": [{"color": c["color"], "etiqueta": c["etiqueta"]} for c in CLASES_ERI],
     "lectura": "Integridad 35 %, conectividad local 25 %, estabilidad del relieve 20 % y cercanía a ríos 20 %. Indicativo, sin validación de campo."},
    {"clave": "coincidencia", "titulo": "Señales de pérdida coincidentes", "tipo": "categorias",
     "leyenda": [{"valor": 1, "color": "#ffe08a", "etiqueta": "1 fuente"},
                 {"valor": 2, "color": "#f28e2b", "etiqueta": "2 fuentes"},
                 {"valor": 3, "color": "#c62828", "etiqueta": "3 fuentes (JRC, Hansen y ESRI)"}],
     "lectura": "Dónde coinciden deterioro JRC, pérdida Hansen desde 2021 y salida de árboles ESRI. Más fuentes = más confianza, no certeza."},
    {"clave": "riparia", "titulo": f"Franja riparia de {FRANJA_MAPA_M} m", "tipo": "categorias",
     "leyenda": [{"valor": 4, "color": "#1f78b4", "etiqueta": "Eje aproximado del cauce"},
                 {"valor": 1, "color": "#2e7d32", "etiqueta": "Franja con bosque (SINIA 2021)"},
                 {"valor": 2, "color": "#f4a261", "etiqueta": "Franja sin bosque, pendiente < 30 %"},
                 {"valor": 3, "color": "#c62828", "etiqueta": "Franja sin bosque, pendiente ≥ 30 %"}],
     "lectura": "Cauces con ≥ 1 km² de drenaje (MERIT Hydro, 90 m). Posición indicativa: verificar con hidrografía local."},
]
CAPAS_POR_CLAVE = {c["clave"]: c for c in CAPAS}


# ---------------------------------------------------------------------------
# Imágenes de Earth Engine (una banda por capa).
# ---------------------------------------------------------------------------
def _distancia_cauce_m(ee):
    acumulacion = ee.Image("MERIT/Hydro/v1_0_1").select("upa")
    proyeccion = acumulacion.projection()
    cauces = acumulacion.gte(AREA_DRENAJE_ERI_KM2).unmask(0).setDefaultProjection(proyeccion)
    return (cauces.fastDistanceTransform(64, "pixels", "squared_euclidean").sqrt()
            .multiply(proyeccion.nominalScale()).resample("bilinear").rename("distancia_cauce_m"))


def _pendiente_pct(geometria, ee):
    coleccion = ee.ImageCollection("COPERNICUS/DEM/GLO30").filterBounds(geometria).select("DEM")
    dem = coleccion.mosaic().setDefaultProjection(ee.Image(coleccion.first()).projection())
    return ee.Terrain.slope(dem).multiply(math.pi / 180).tan().multiply(100).rename("pendiente_pct")


def _bosque_sinia_2021(ee):
    return _imagen_categorias(2021, ee).eq(1).unmask(0).rename("bosque")


def _imagen_capa(clave: str, geometria, ee):
    if clave == "sinia_2021":
        return _imagen_categorias(2021, ee)
    if clave == "jrc_2025":
        estado, valida = _estado_y_mascara_valida_ee("jrc_tmf", PERIODOS_ANALISIS["jrc_diagnostico"], geometria, ee_module=ee)
        return estado.updateMask(valida)
    if clave == "hansen":
        post, _, _ = _hansen(geometria, ee)
        return post
    if clave == "esri_cambio":
        ini, v_ini = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_inicial"], geometria, ee_module=ee)
        fin, v_fin = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
        clase = (ee.Image(0).where(ini.eq(2).And(fin.neq(2)), 1).where(ini.neq(2).And(fin.eq(2)), 2)
                 .where(ini.eq(2).And(fin.eq(2)), 3))
        return clase.updateMask(v_ini.And(v_fin)).selfMask()
    if clave == "ndvi_cambio":
        inicial = _ndvi(PERIODOS_ANALISIS["ndvi_inicial"], geometria, ee)
        final = _ndvi(PERIODOS_ANALISIS["ndvi_final"], geometria, ee)
        return final.subtract(inicial)
    if clave == "eri":
        eri, _ = construir_imagenes_eri(geometria, ee)
        return eri
    if clave == "coincidencia":
        jrc, _ = _estado_y_mascara_valida_ee("jrc_tmf", PERIODOS_ANALISIS["jrc_diagnostico"], geometria, ee_module=ee)
        ini, _ = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_inicial"], geometria, ee_module=ee)
        fin, _ = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
        post, _, _ = _hansen(geometria, ee)
        return _coincidence(jrc, post, ini, fin, geometria, ee).selfMask()
    if clave == "riparia":
        distancia = _distancia_cauce_m(ee)
        bosque = _bosque_sinia_2021(ee)
        pendiente = _pendiente_pct(geometria, ee)
        franja = distancia.lte(FRANJA_MAPA_M)
        clase = (ee.Image(0).where(franja.And(bosque.eq(1)), 1)
                 .where(franja.And(bosque.eq(0)).And(pendiente.lt(30)), 2)
                 .where(franja.And(bosque.eq(0)).And(pendiente.gte(30)), 3)
                 .where(distancia.lte(12), 4))
        return clase.selfMask()
    raise KeyError(clave)


# ---------------------------------------------------------------------------
# Malla, descarga y coloreado.
# ---------------------------------------------------------------------------
def _a_mercator(lon: float, lat: float) -> tuple[float, float]:
    return (RADIO_TIERRA * math.radians(lon),
            RADIO_TIERRA * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def _a_lonlat(x: float, y: float) -> tuple[float, float]:
    return (math.degrees(x / RADIO_TIERRA), math.degrees(2 * math.atan(math.exp(y / RADIO_TIERRA)) - math.pi / 2))


def _limites(geojson: dict[str, Any]) -> tuple[float, float, float, float]:
    xs, ys = [], []

    def recorrer(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for s in c:
                recorrer(s)
    geometria = geojson.get("geometry", geojson)
    if geometria.get("type") == "GeometryCollection":
        for g in geometria["geometries"]:
            recorrer(g["coordinates"])
    else:
        recorrer(geometria["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def malla_mercator(geojson: dict[str, Any], max_pixeles: int = MAX_PIXELES_LADO,
                   minimo_m: float = TAMANO_MINIMO_M) -> dict[str, Any]:
    """Malla EPSG:3857 que cubre el territorio con un margen del 3 %."""
    oeste, sur, este, norte = _limites(geojson)
    x0, y0 = _a_mercator(oeste, sur)
    x1, y1 = _a_mercator(este, norte)
    margen = 0.03 * max(x1 - x0, y1 - y0)
    x0, y0, x1, y1 = x0 - margen, y0 - margen, x1 + margen, y1 + margen
    factor = math.cos(math.radians((sur + norte) / 2))  # metros de Mercator → metros sobre el terreno
    tamano = max(max(x1 - x0, y1 - y0) / max_pixeles, minimo_m / factor)
    columnas, filas = math.ceil((x1 - x0) / tamano), math.ceil((y1 - y0) / tamano)
    o, s = _a_lonlat(x0, y1 - filas * tamano)
    e, n = _a_lonlat(x0 + columnas * tamano, y1)
    return {
        "grid": {"dimensions": {"width": columnas, "height": filas},
                 "affineTransform": {"scaleX": tamano, "shearX": 0, "translateX": x0,
                                     "shearY": 0, "scaleY": -tamano, "translateY": y1},
                 "crsCode": "EPSG:3857"},
        "limites": [[round(s, 6), round(o, 6)], [round(n, 6), round(e, 6)]],
        "tamano_pixel_m": round(tamano * factor, 1),
    }


def _hex(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def colorear(valores, capa: dict[str, Any]):
    """Convierte la matriz de valores en RGBA (sin dato = transparente)."""
    import numpy as np

    v = np.asarray(valores, dtype="float64")
    rgba = np.zeros(v.shape + (4,), dtype="uint8")
    validos = np.isfinite(v) & (v != SIN_DATO)
    if capa["tipo"] == "categorias":
        for item in capa["leyenda"]:
            sel = validos & (np.round(v) == item["valor"])
            rgba[sel, :3] = _hex(item["color"])
            rgba[sel, 3] = 255
        return rgba
    paleta = np.array([_hex(c) for c in capa["paleta"]], dtype="float64")
    t = np.clip((v - capa["minimo"]) / (capa["maximo"] - capa["minimo"]), 0, 1) * (len(paleta) - 1)
    t = np.where(validos, t, 0)
    i = np.minimum(np.floor(t).astype(int), len(paleta) - 2)
    f = (t - i)[..., None]
    rgba[..., :3] = np.round(paleta[i] * (1 - f) + paleta[i + 1] * f).astype("uint8")
    rgba[..., 3] = np.where(validos, 255, 0)
    return rgba


def png(rgba) -> bytes:
    from PIL import Image

    salida = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(salida, format="PNG", optimize=True)
    return salida.getvalue()


def descargar_valores(imagen, geometria, malla: dict[str, Any], ee):
    """Matriz float de la capa en la malla (fuera del territorio = SIN_DATO)."""
    expresion = imagen.toFloat().clip(geometria).unmask(SIN_DATO).rename("v")
    datos = ee.data.computePixels({"expression": expresion, "fileFormat": "NUMPY_NDARRAY", "grid": malla["grid"]})
    return datos["v"]


def generar_mapas(geojson: dict[str, Any], destino, *, ee_module, capas: list[str] | None = None,
                  registro: Callable[[str], None] = print) -> dict[str, Any]:
    """Escribe un PNG por capa en ``destino`` y devuelve los metadatos para la ficha."""
    from pathlib import Path

    ee = ee_module
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    malla = malla_mercator(geojson)
    disponibles, errores = [], {}
    for clave in capas or [c["clave"] for c in CAPAS]:
        try:
            valores = descargar_valores(_imagen_capa(clave, geometria, ee), geometria, malla, ee)
            (destino / f"{clave}.png").write_bytes(png(colorear(valores, CAPAS_POR_CLAVE[clave])))
            disponibles.append(clave)
        except Exception as exc:  # una capa fallida no impide las demás
            errores[clave] = f"{type(exc).__name__}: {exc}"[:300]
            registro(f"    mapa {clave}: {errores[clave]}")
    return {"limites": malla["limites"], "tamano_pixel_m": malla["tamano_pixel_m"],
            "capas": disponibles, "errores": errores}


# ---------------------------------------------------------------------------
# Análisis ripario y red hídrica.
# ---------------------------------------------------------------------------
def resumir_riparia(valores: dict[str, Any]) -> dict[str, Any]:
    """Convierte la reducción de Earth Engine en indicadores legibles."""
    def num(k):
        v = valores.get(k)
        return float(v) if v is not None else 0.0
    franjas = []
    for d in FRANJAS_RIPARIAS_M:
        zona = num(f"zona_{d}")
        franjas.append({
            "ancho_m": d, "area_ha": round(zona, 2),
            "bosque_sinia_ha": round(num(f"bosque_{d}"), 2),
            "bosque_sinia_pct": round(num(f"bosque_{d}") / zona * 100, 1) if zona else None,
            "arboles_esri_pct": round(num(f"arboles_{d}") / zona * 100, 1) if zona else None,
        })
    sin_bosque = []
    for minimo, maximo in CLASES_PENDIENTE_PCT:
        clave = f"sinbosque_{minimo}_{maximo or 'mas'}"
        sin_bosque.append({"pendiente": f"{minimo}–{maximo} %" if maximo else f"≥ {minimo} %", "area_ha": round(num(clave), 2)})
    referencia = next(f for f in franjas if f["ancho_m"] == FRANJA_MAPA_M)
    return {
        "longitud_cauces_km": round(referencia["area_ha"] * 10_000 / (2 * FRANJA_MAPA_M) / 1000, 1),
        "franjas": franjas,
        "sin_bosque_por_pendiente": sin_bosque,
        "franja_referencia_m": FRANJA_MAPA_M,
        "area_drenaje_minima_km2": AREA_DRENAJE_ERI_KM2,
        "nota": "Cauces MERIT Hydro (90 m, drenaje ≥ 1 km²); distancias interpoladas, indicativas. "
                "Bosque: SINIA 2021 (oficial) y árboles ESRI 2024 como segunda fuente.",
    }


def calcular_riparia(geojson: dict[str, Any], *, ee_module, area_ha: float | None = None) -> dict[str, Any]:
    ee = ee_module
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    distancia = _distancia_cauce_m(ee)
    bosque = _bosque_sinia_2021(ee)
    arboles, valida = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
    arboles = arboles.eq(2).And(valida).unmask(0)
    pendiente = _pendiente_pct(geometria, ee)
    ha = ee.Image.pixelArea().divide(10_000)
    bandas = []
    for d in FRANJAS_RIPARIAS_M:
        zona = distancia.lte(d)
        bandas += [zona.multiply(ha).rename(f"zona_{d}"), zona.And(bosque).multiply(ha).rename(f"bosque_{d}"),
                   zona.And(arboles).multiply(ha).rename(f"arboles_{d}")]
    sin_bosque = distancia.lte(FRANJA_MAPA_M).And(bosque.Not())
    for minimo, maximo in CLASES_PENDIENTE_PCT:
        rango = pendiente.gte(minimo) if maximo is None else pendiente.gte(minimo).And(pendiente.lt(maximo))
        bandas.append(sin_bosque.And(rango).multiply(ha).rename(f"sinbosque_{minimo}_{maximo or 'mas'}"))
    escala = 10 if (area_ha or 0) < 60_000 else 30
    valores = ee.Image.cat(bandas).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=geometria, crs="EPSG:32617", scale=escala,
        maxPixels=1e10, tileScale=8,
    ).getInfo()
    resultado = resumir_riparia(valores)
    resultado["escala_m"] = escala
    return resultado


def rios_principales(geojson: dict[str, Any], *, ee_module) -> dict[str, Any]:
    """Ríos HydroSHEDS (drenaje ≥ 10 km²) recortados al territorio, para dibujar en los mapas."""
    ee = ee_module
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    coleccion = (ee.FeatureCollection(RIOS_ASSET).filterBounds(geometria)
                 .map(lambda f: ee.Feature(f.geometry().intersection(geometria, 10).simplify(25))
                      .set({"orden": f.get("RIV_ORD"), "drenaje_km2": f.get("UPLAND_SKM")})))
    datos = coleccion.getInfo()
    salida = []
    for f in datos.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") in ("LineString", "MultiLineString"):
            salida.append({"type": "Feature", "properties": f.get("properties", {}), "geometry": g})
        elif g.get("type") == "GeometryCollection":
            for parte in g.get("geometries", []):
                if parte.get("type") in ("LineString", "MultiLineString"):
                    salida.append({"type": "Feature", "properties": f.get("properties", {}), "geometry": parte})
    return {"type": "FeatureCollection", "features": salida}
