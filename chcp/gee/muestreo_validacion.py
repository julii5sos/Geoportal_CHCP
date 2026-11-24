"""Diseño de muestreo estratificado para validar los mapas del geoportal en Earth Engine.

Cada mapa evaluable se define con su imagen de códigos y una leyenda única que usan
tanto el mapa (estratos) como los intérpretes (clase de referencia). La muestra se
extrae con ``stratifiedSample`` y una semilla fija, de modo que es reproducible.
"""

from __future__ import annotations

from typing import Any

from chcp.gee.analisis_temporal import _estado_y_mascara_valida_ee
from chcp.gee.coberturas_sinia import _imagen_categorias
from chcp.gee.analisis_complementario import HANSEN_ASSET
from chcp.gee.evaluacion_ecologica import _hansen
from chcp.nucleo.metodologia_indice import PERIODOS_ANALISIS

_REF_PERDIDA = "Había bosque a fines de 2020 y entre 2021 y 2025 se observa desmonte, quema, apertura del dosel o caminos nuevos."
_REF_BOSQUE = "Dosel arbóreo continuo durante 2020–2025 (incluye bosque secundario cerrado y plantaciones con dosel cerrado)."
_REF_NO_BOSQUE = "Pasto, cultivo, rastrojo bajo, suelo, construcción o agua durante 2020–2025."

# Versión 2 (auditoría C): todas las clases de cambio se refieren a 2021–2025. La versión 1
# usaba el estado JRC acumulado desde 1990, que mezclaba deforestación antigua con la reciente.
MAPAS: dict[str, dict[str, Any]] = {
    "senal_perdida": {
        "titulo": "Señal de pérdida de bosque 2021–2025 del geoportal (≥ 2 fuentes)",
        "version": 2,
        "descripcion": "Pérdida = al menos dos de: JRC (bosque sin perturbación en 2020 y deforestado o degradado en 2025), "
                       "Hansen (pérdida 2021–2025) y ESRI (árboles 2017 → otra clase 2024). Bosque = JRC sin perturbación en "
                       "2025 y ninguna fuente. No bosque = el resto. Período de referencia 2021–2025 (ESRI cubre 2017–2024).",
        "escala_m": 30,
        "leyenda": [
            {"codigo": 1, "clave": "perdida", "etiqueta": "Pérdida o degradación 2021–2025", "color": "#c62828", "guia": _REF_PERDIDA},
            {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque", "color": "#2e7d32", "guia": _REF_BOSQUE},
            {"codigo": 3, "clave": "no_bosque", "etiqueta": "No bosque", "color": "#d7c2a1", "guia": _REF_NO_BOSQUE},
        ],
    },
    "hansen_2021_2025": {
        "titulo": "Hansen GFC: pérdida de cobertura arbórea 2021–2025",
        "version": 1,
        "descripcion": "Evaluación separada de Hansen. Pérdida = lossyear 2021–2025; bosque = cobertura 2000 ≥ 30 % sin pérdida "
                       "hasta 2025; no bosque = el resto.",
        "escala_m": 30,
        "leyenda": [
            {"codigo": 1, "clave": "perdida", "etiqueta": "Pérdida 2021–2025", "color": "#c62828", "guia": _REF_PERDIDA},
            {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque", "color": "#2e7d32", "guia": _REF_BOSQUE},
            {"codigo": 3, "clave": "no_bosque", "etiqueta": "No bosque", "color": "#d7c2a1", "guia": _REF_NO_BOSQUE},
        ],
    },
    "jrc_cambio_2021_2025": {
        "titulo": "JRC TMF: perturbación nueva 2021–2025",
        "version": 1,
        "descripcion": "Evaluación separada de JRC. Pérdida = sin perturbación en 2020 y deforestado o degradado en 2025; "
                       "bosque = sin perturbación en 2020 y 2025; no bosque = el resto.",
        "escala_m": 30,
        "leyenda": [
            {"codigo": 1, "clave": "perdida", "etiqueta": "Perturbación nueva 2021–2025", "color": "#c62828", "guia": _REF_PERDIDA},
            {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque", "color": "#2e7d32", "guia": _REF_BOSQUE},
            {"codigo": 3, "clave": "no_bosque", "etiqueta": "No bosque", "color": "#d7c2a1", "guia": _REF_NO_BOSQUE},
        ],
    },
    "sinia_2021": {
        "titulo": "Cobertura general SINIA 2021 (tres categorías)",
        "version": 1,
        "descripcion": "Exactitud temática del producto oficial 2021 en la CHCP (fecha de referencia 2021).",
        "escala_m": 10,
        "leyenda": [
            {"codigo": 1, "clave": "bosque", "etiqueta": "Bosques y otras tierras boscosas", "color": "#237A4B",
             "guia": "Cobertura arbórea dominante en la fecha de referencia (2021)."},
            {"codigo": 2, "clave": "otras", "etiqueta": "Otras tierras", "color": "#D8C49C",
             "guia": "Pastos, cultivos, áreas urbanas, suelo desnudo."},
            {"codigo": 3, "clave": "agua", "etiqueta": "Cuerpos de agua", "color": "#388FC4",
             "guia": "Lagos, embalses y ríos anchos."},
        ],
    },
}

# Clase especial de la interpretación: el punto no se puede decidir con la evidencia disponible.
SIN_EVIDENCIA = {"codigo": 0, "clave": "sin_evidencia", "etiqueta": "Sin evidencia suficiente",
                 "guia": "Nubes, sombra, imágenes sin fecha adecuada o cobertura ambigua. Se excluye del cálculo y se informa."}


def imagen_estratos(clave: str, geometria, ee):
    if clave in ("senal_perdida", "hansen_2021_2025", "jrc_cambio_2021_2025"):
        jrc25, valida = _estado_y_mascara_valida_ee("jrc_tmf", 2025, geometria, ee_module=ee)
        jrc20, _ = _estado_y_mascara_valida_ee("jrc_tmf", 2020, geometria, ee_module=ee)
        proy = jrc25.projection()
        jrc_reciente = jrc20.eq(1).And(jrc25.eq(2).Or(jrc25.eq(3))).unmask(0)
        post, _, base = _hansen(geometria, ee)
        hansen_reciente = post.gt(0).unmask(0).reproject(crs=proy)
        if clave == "hansen_2021_2025":
            hansen = ee.Image(HANSEN_ASSET)
            bosque = hansen.select("treecover2000").gte(30).And(hansen.select("lossyear").unmask(0).eq(0))
            imagen = (ee.Image(3).where(bosque, 2).where(post.gt(0).unmask(0), 1)
                      .setDefaultProjection(hansen.projection()))
            return imagen.rename("estrato").toInt().clip(geometria)
        if clave == "jrc_cambio_2021_2025":
            imagen = ee.Image(3).where(jrc20.eq(1).And(jrc25.eq(1)), 2).where(jrc_reciente, 1).updateMask(valida).setDefaultProjection(proy)
            return imagen.rename("estrato").toInt().clip(geometria)
        ini, v_ini = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_inicial"], geometria, ee_module=ee)
        fin, v_fin = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
        esri = (ini.eq(2).And(fin.neq(2)).And(v_ini).And(v_fin).unmask(0).setDefaultProjection(ini.projection())
                .reduceResolution(reducer=ee.Reducer.max(), bestEffort=True, maxPixels=1024).reproject(crs=proy).gt(0))
        fuentes = jrc_reciente.add(hansen_reciente).add(esri)
        imagen = (ee.Image(3).where(jrc25.eq(1).And(fuentes.eq(0)), 2).where(fuentes.gte(2), 1)
                  .updateMask(valida).setDefaultProjection(proy))
    elif clave == "sinia_2021":
        imagen = _imagen_categorias(2021, ee)
    else:
        raise KeyError(clave)
    return imagen.rename("estrato").toInt().clip(geometria)


def areas_estratos(imagen, geometria, escala: float, ee) -> dict[int, float]:
    grupos = (ee.Image.pixelArea().divide(10_000).addBands(imagen)
              .reduceRegion(reducer=ee.Reducer.sum().group(groupField=1, groupName="estrato"),
                            geometry=geometria, scale=escala, crs="EPSG:32617", maxPixels=1e11, tileScale=8)
              .get("groups").getInfo())
    return {int(g["estrato"]): float(g["sum"]) for g in grupos or []}


def extraer_muestra(imagen, geometria, asignacion: dict[int, int], escala: float, semilla: int, ee) -> list[dict[str, Any]]:
    codigos = [c for c, n in asignacion.items() if n > 0]
    coleccion = imagen.stratifiedSample(
        numPoints=0, classBand="estrato", region=geometria, scale=escala, projection="EPSG:32617",
        seed=semilla, classValues=codigos, classPoints=[asignacion[c] for c in codigos],
        geometries=True, tileScale=8,
    )
    puntos = []
    for f in coleccion.getInfo().get("features", []):
        lon, lat = f["geometry"]["coordinates"]
        puntos.append({"lon": round(lon, 6), "lat": round(lat, 6), "clase_mapa": int(f["properties"]["estrato"])})
    return puntos


# Exactitud de cada fuente por separado con la misma muestra (estimadores de Stehman 2014).
# Cada banda vale 1 donde la fuente señala pérdida 2021–2025 en el píxel de 30 m del punto, con
# las mismas reglas que la preevaluación MT-2026.7 y que el mapa de estratos.
FUENTES_PERDIDA = {
    "jrc": "JRC TMF: sin perturbación en 2020 y deforestado o degradado en 2025",
    "hansen": "Hansen GFC: pérdida 2021–2025",
    "esri": "ESRI LULC: árboles en 2017 y otra clase en 2024",
    "ndvi": "NDVI Sentinel-2: NDVI 2020 ≥ 0,4 y caída ≥ 0,15 hasta 2025",
}


def imagen_fuentes(geometria, ee):
    from chcp.gee.analisis_complementario import _ndvi
    from chcp.nucleo.metodologia_indice import UMBRALES_INDICE

    jrc25, _ = _estado_y_mascara_valida_ee("jrc_tmf", 2025, geometria, ee_module=ee)
    jrc20, _ = _estado_y_mascara_valida_ee("jrc_tmf", 2020, geometria, ee_module=ee)
    proy = jrc25.projection()
    jrc = jrc20.eq(1).And(jrc25.eq(2).Or(jrc25.eq(3))).unmask(0)
    post, _, _ = _hansen(geometria, ee)
    hansen = post.gt(0).unmask(0).reproject(crs=proy)
    ini, v_ini = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_inicial"], geometria, ee_module=ee)
    fin, v_fin = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
    esri = (ini.eq(2).And(fin.neq(2)).And(v_ini).And(v_fin).unmask(0).setDefaultProjection(ini.projection())
            .reduceResolution(reducer=ee.Reducer.max(), bestEffort=True, maxPixels=1024).reproject(crs=proy).gt(0))

    def ndvi30(anio):  # media de los píxeles de 10 m dentro de la celda de 30 m
        return (_ndvi(anio, geometria, ee).reduceResolution(reducer=ee.Reducer.mean(), bestEffort=True, maxPixels=64)
                .reproject(crs="EPSG:32617", scale=30))

    n_ini, n_fin = ndvi30(PERIODOS_ANALISIS["ndvi_inicial"]), ndvi30(PERIODOS_ANALISIS["ndvi_final"])
    ndvi = (n_ini.gte(UMBRALES_INDICE["ndvi_vigor_inicial_minimo"])
            .And(n_fin.subtract(n_ini).lte(UMBRALES_INDICE["ndvi_delta_disminucion"])).unmask(0))
    return ee.Image.cat([jrc.rename("jrc"), hansen.rename("hansen"), esri.rename("esri"), ndvi.rename("ndvi"),
                         n_ini.unmask(-9).rename("ndvi_inicial"), n_fin.unmask(-9).rename("ndvi_final")])


def valores_fuentes(puntos: list[dict[str, Any]], geometria, ee, lote: int = 100) -> list[dict[str, Any]]:
    """Valor de cada fuente en el píxel de 30 m (EPSG:32617, la malla de la muestra) de cada punto."""
    imagen = imagen_fuentes(geometria, ee)
    salida: list[dict[str, Any]] = []
    for i in range(0, len(puntos), lote):
        fc = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([float(p["lon"]), float(p["lat"])]), {"id": p["id"]})
                                   for p in puntos[i:i + lote]])
        res = imagen.sampleRegions(collection=fc, properties=["id"], scale=30, projection="EPSG:32617",
                                   geometries=False, tileScale=4).getInfo()
        for f in res.get("features", []):
            salida.append(f["properties"])
        print(f"  {min(i + lote, len(puntos))}/{len(puntos)} puntos", flush=True)
    return salida
