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

# Codificación de valores (PNG en escala de grises, sin pérdida) para el análisis de
# polígonos en el navegador: valor = minimo + q · paso; 255 = fuera del territorio
# o sin dato. Las categorías se guardan con su código original.
SIN_VALOR = 255
CODIFICACION_VALORES: dict[str, dict[str, Any]] = {
    **{c["clave"]: {"tipo": "categorias"} for c in CAPAS if c["tipo"] == "categorias"},
    "ndvi_cambio": {"tipo": "continuo", "minimo": -1.0, "paso": 0.008},
    "eri": {"tipo": "continuo", "minimo": 0.0, "paso": 0.004},
    "gedi": {"tipo": "continuo", "minimo": 0.0, "paso": 0.25},
    # bits: 1 línea base arbórea Hansen 2020 · 2 NDVI válido · 4 descenso fuerte de NDVI · 8 GEDI válido
    # Clase original de ESRI 10 m 2024 (7 = área construida); la usan las rutas al corredor.
    "esri_2024": {"tipo": "categorias"},
    # Código original del raster SINIA 2021 detallado (cobertura y uso del suelo, 10 m). La
    # correspondencia código → categoría se lee de data/leyendas_sinia.json (solo verificadas).
    "sinia_2021_detalle": {"tipo": "categorias"},
    "aux": {"tipo": "bits", "bits": {"linea_base": 1, "ndvi_valido": 2, "ndvi_descenso": 4, "gedi_valido": 8}},
}
CAPAS_SOLO_VALOR = ("gedi", "aux", "esri_2024", "sinia_2021_detalle")


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
    if clave == "sinia_2021_detalle":
        from chcp.catalogos.catalogo_assets_sinia import ASSETS_SINIA

        ficha = ASSETS_SINIA["2021_detallado"]
        codigo = ee.Image(ficha["asset_id"]).select([0])
        return codigo.updateMask(codigo.neq(int(ficha.get("nodata") or 255)))
    if clave == "esri_2024":
        fin, valida = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
        return fin.updateMask(valida)
    if clave == "gedi":
        from chcp.gee.evaluacion_ecologica import _gedi
        return _gedi(geometria, ee)
    if clave == "aux":
        from chcp.gee.evaluacion_ecologica import _gedi
        from chcp.nucleo.metodologia_indice import UMBRALES_INDICE
        _, _, base = _hansen(geometria, ee)
        inicial = _ndvi(PERIODOS_ANALISIS["ndvi_inicial"], geometria, ee)
        final = _ndvi(PERIODOS_ANALISIS["ndvi_final"], geometria, ee)
        valido = inicial.mask().And(final.mask())
        descenso = (inicial.gte(UMBRALES_INDICE["ndvi_vigor_inicial_minimo"])
                    .And(final.subtract(inicial).lte(UMBRALES_INDICE["ndvi_delta_disminucion"])).And(valido))
        gedi_valido = _gedi(geometria, ee).mask()
        return (ee.Image(0).add(base.unmask(0).gt(0)).add(valido.unmask(0).multiply(2))
                .add(descenso.unmask(0).multiply(4)).add(gedi_valido.unmask(0).gt(0).multiply(8)))
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


def codificar(valores, codec: dict[str, Any]):
    """Matriz de valores → uint8 (255 = sin dato) según CODIFICACION_VALORES."""
    import numpy as np

    v = np.asarray(valores, dtype="float64")
    validos = np.isfinite(v) & (v != SIN_DATO)
    if codec["tipo"] == "continuo":
        q = np.round((v - codec["minimo"]) / codec["paso"])
    else:
        q = np.round(v)
    q = np.clip(np.where(validos, q, SIN_VALOR), 0, 254).astype("uint8")
    q[~validos] = SIN_VALOR
    return q


def decodificar(q, codec: dict[str, Any]):
    import numpy as np

    q = np.asarray(q, dtype="float64")
    v = codec["minimo"] + q * codec["paso"] if codec["tipo"] == "continuo" else q.copy()
    return np.where(q == SIN_VALOR, np.nan, v)


def png_gris(q) -> bytes:
    from PIL import Image

    salida = io.BytesIO()
    Image.fromarray(q, "L").save(salida, format="PNG", optimize=True)
    return salida.getvalue()


def png(rgba) -> bytes:
    from PIL import Image

    salida = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(salida, format="PNG", optimize=True)
    return salida.getvalue()


def submallas(grid: dict[str, Any], partes: int) -> list[tuple[int, int, dict[str, Any]]]:
    """Divide la malla en partes × partes bloques: (fila0, col0, malla del bloque)."""
    ancho, alto = grid["dimensions"]["width"], grid["dimensions"]["height"]
    t = grid["affineTransform"]
    bloques = []
    cortes_x = [round(i * ancho / partes) for i in range(partes + 1)]
    cortes_y = [round(i * alto / partes) for i in range(partes + 1)]
    for i in range(partes):
        for j in range(partes):
            x0, x1, y0, y1 = cortes_x[j], cortes_x[j + 1], cortes_y[i], cortes_y[i + 1]
            if x1 <= x0 or y1 <= y0:
                continue
            bloques.append((y0, x0, {
                "dimensions": {"width": x1 - x0, "height": y1 - y0},
                "affineTransform": {**t, "translateX": t["translateX"] + x0 * t["scaleX"], "translateY": t["translateY"] + y0 * t["scaleY"]},
                "crsCode": grid["crsCode"],
            }))
    return bloques


def _reintentable(exc: Exception) -> bool:
    """Errores de Earth Engine que se resuelven pidiendo la malla en mosaicos más pequeños."""
    texto = str(exc).lower()
    return "too large" in texto or "memory limit" in texto or "computation timed out" in texto


MAX_NIVELES_DIVISION = 2  # malla completa → 3×3 bloques → 3×3 sub-bloques; no más


def descargar_valores(imagen, geometria, malla: dict[str, Any], ee, partes: int = 1, nivel: int = 0):
    """Matriz float de la capa en la malla (fuera del territorio = SIN_DATO).

    Si Earth Engine rechaza la reproyección por tamaño (capas con reproyección
    explícita sobre territorios grandes), se pide por bloques y se ensambla.
    La división tiene un límite de niveles: antes cada bloque que agotaba el tiempo
    (5 min en Earth Engine) se volvía a dividir sin fin y un territorio podía tardar horas.
    """
    import numpy as np

    # sameFootprint=False: sin él, fuera de la geometría recortada el píxel sigue enmascarado y
    # computePixels lo devuelve como 0 (un código válido), no como SIN_DATO.
    expresion = imagen.toFloat().clip(geometria).unmask(SIN_DATO, False).rename("v")
    grid = malla["grid"]
    if partes == 1:
        try:
            return ee.data.computePixels({"expression": expresion, "fileFormat": "NUMPY_NDARRAY", "grid": grid})["v"]
        except Exception as exc:  # noqa: BLE001
            if not _reintentable(exc) or nivel >= MAX_NIVELES_DIVISION:
                raise
            return descargar_valores(imagen, geometria, malla, ee, partes=3, nivel=nivel + 1)
    salida = np.full((grid["dimensions"]["height"], grid["dimensions"]["width"]), SIN_DATO, dtype="float64")
    for fila, col, sub in submallas(grid, partes):
        try:
            bloque = ee.data.computePixels({"expression": expresion, "fileFormat": "NUMPY_NDARRAY", "grid": sub})["v"]
        except Exception as exc:  # noqa: BLE001
            if not _reintentable(exc) or nivel >= MAX_NIVELES_DIVISION:
                raise
            bloque = descargar_valores(imagen, geometria, {"grid": sub}, ee, partes=3, nivel=nivel + 1)
        salida[fila:fila + bloque.shape[0], col:col + bloque.shape[1]] = bloque
    return salida


HILOS_MAPAS = 5  # solicitudes simultáneas a Earth Engine por territorio
MAX_PIXELES_CUENCA = 2400  # CHCP completa: ~40 m por píxel en lugar de ~115 m


def generar_mapas(geojson: dict[str, Any], destino, *, ee_module, capas: list[str] | None = None,
                  registro: Callable[[str], None] = print, max_pixeles: int = MAX_PIXELES_LADO) -> dict[str, Any]:
    """Escribe un PNG por capa en ``destino`` y devuelve los metadatos para la ficha."""
    from pathlib import Path

    ee = ee_module
    destino = Path(destino)
    destino.mkdir(parents=True, exist_ok=True)
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    malla = malla_mercator(geojson, max_pixeles=max_pixeles)
    disponibles, errores = [], {}
    valores_ok = []
    claves = capas or [c["clave"] for c in CAPAS] + list(CAPAS_SOLO_VALOR)

    def una_capa(clave: str) -> None:
        valores = descargar_valores(_imagen_capa(clave, geometria, ee), geometria, malla, ee)
        if clave in CAPAS_POR_CLAVE:
            (destino / f"{clave}.png").write_bytes(png(colorear(valores, CAPAS_POR_CLAVE[clave])))
        if clave in CODIFICACION_VALORES:
            (destino / f"{clave}.v.png").write_bytes(png_gris(codificar(valores, CODIFICACION_VALORES[clave])))

    # Las solicitudes a Earth Engine son de entrada/salida: se piden varias capas a la vez.
    from concurrent.futures import ThreadPoolExecutor

    grupo = ThreadPoolExecutor(max_workers=HILOS_MAPAS)
    futuros = {clave: grupo.submit(una_capa, clave) for clave in claves}
    try:
        for futuro in futuros.values():
            futuro.exception()  # espera a cada capa
    finally:
        # Si el territorio se interrumpe por tiempo, las capas pendientes no siguen ocupando
        # solicitudes de Earth Engine mientras se calcula el territorio siguiente.
        grupo.shutdown(wait=False, cancel_futures=True)
    for clave, futuro in futuros.items():
        exc = futuro.exception()
        if exc is None:
            if clave in CAPAS_POR_CLAVE:
                disponibles.append(clave)
            if clave in CODIFICACION_VALORES:
                valores_ok.append(clave)
        else:  # una capa fallida no impide las demás
            errores[clave] = f"{type(exc).__name__}: {exc}"[:300]
            registro(f"    mapa {clave}: {errores[clave]}")
    return {"limites": malla["limites"], "tamano_pixel_m": malla["tamano_pixel_m"],
            "dimensiones": [malla["grid"]["dimensions"]["width"], malla["grid"]["dimensions"]["height"]],
            "capas": disponibles, "valores": valores_ok, "errores": errores}


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


# ---------------------------------------------------------------------------
# Sitios priorizados para verificación de campo.
# ---------------------------------------------------------------------------
def identificador_sitio(territorio: str, lat: float, lon: float) -> str:
    """Identificador corto y estable mientras el sitio no se desplace (~10 m)."""
    return f"{territorio}-{abs(round(lat * 1e4)) % 10_000:04d}{abs(round(lon * 1e4)) % 10_000:04d}"


def ordenar_sitios(candidatos: list[dict[str, Any]], territorio: str, maximo: int, area_min_ha: float) -> list[dict[str, Any]]:
    sitios = []
    for c in candidatos:
        if (c.get("area_ha") or 0) < area_min_ha or not c.get("centro"):
            continue
        lon, lat = c["centro"]
        sitios.append({"id": identificador_sitio(territorio, lat, lon), "lat": round(lat, 6), "lon": round(lon, 6),
                       "area_ha": round(float(c["area_ha"]), 2), "fuentes": int(c.get("fuentes") or 1)})
    sitios.sort(key=lambda s: (-s["fuentes"], -s["area_ha"]))
    vistos, salida = set(), []
    for s in sitios:
        if s["id"] not in vistos:
            vistos.add(s["id"]); salida.append(s)
    return salida[:maximo]


def sitios_verificacion(geojson: dict[str, Any], territorio: str, *, ee_module, maximo: int = 12,
                        area_min_ha: float = 0.5) -> list[dict[str, Any]]:
    """Manchas con señales de pérdida (≥ 1 fuente), priorizadas por fuentes coincidentes y superficie."""
    ee = ee_module
    geometria = ee.Geometry(geojson.get("geometry", geojson), proj="EPSG:4326", geodesic=False)
    fuentes = _imagen_capa("coincidencia", geometria, ee).rename("fuentes").toInt()
    proyeccion = ee.Image(fuentes).projection()
    vectores = fuentes.gte(1).selfMask().reduceToVectors(
        geometry=geometria, crs=proyeccion, scale=30, geometryType="polygon", eightConnected=True,
        labelProperty="etiqueta", maxPixels=1e10, tileScale=4,
    )

    def describir(f):
        g = f.geometry(1)
        return ee.Feature(None, {
            "area_ha": g.area(1).divide(10_000),
            "centro": g.centroid(1).coordinates(),
            "fuentes": fuentes.reduceRegion(ee.Reducer.max(), g, 30).get("fuentes"),
        })
    datos = (vectores.map(lambda f: f.set("area_ha", f.geometry(1).area(1).divide(10_000)))
             .filter(ee.Filter.gte("area_ha", area_min_ha)).sort("area_ha", False).limit(maximo * 4)
             .map(describir).getInfo())
    return ordenar_sitios([f["properties"] for f in datos.get("features", [])], territorio, maximo, area_min_ha)
