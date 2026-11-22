"""Diseño de muestreo estratificado para validar los mapas del geoportal en Earth Engine.

Cada mapa evaluable se define con su imagen de códigos y una leyenda única que usan
tanto el mapa (estratos) como los intérpretes (clase de referencia). La muestra se
extrae con ``stratifiedSample`` y una semilla fija, de modo que es reproducible.
"""

from __future__ import annotations

from typing import Any

from chcp.gee.analisis_temporal import _estado_y_mascara_valida_ee
from chcp.gee.coberturas_sinia import _imagen_categorias
from chcp.gee.evaluacion_ecologica import _coincidence, _hansen
from chcp.nucleo.metodologia_indice import PERIODOS_ANALISIS

MAPAS: dict[str, dict[str, Any]] = {
    "senal_perdida": {
        "titulo": "Señal de pérdida de bosque 2021–2025 del geoportal",
        "descripcion": "Pérdida = al menos dos fuentes coinciden (deterioro JRC, pérdida Hansen desde 2021 o salida de árboles ESRI 2017→2024). "
                       "Bosque = bosque JRC sin perturbación y sin señales. No bosque = el resto.",
        "escala_m": 30,
        "leyenda": [
            {"codigo": 1, "clave": "perdida", "etiqueta": "Pérdida o degradación de bosque", "color": "#c62828",
             "guia": "Había bosque al inicio del período y en imágenes recientes se ve desmonte, quema, caminos nuevos o dosel abierto."},
            {"codigo": 2, "clave": "bosque", "etiqueta": "Bosque", "color": "#2e7d32",
             "guia": "Dosel arbóreo continuo durante todo el período (incluye bosque secundario cerrado)."},
            {"codigo": 3, "clave": "no_bosque", "etiqueta": "No bosque", "color": "#d7c2a1",
             "guia": "Pasto, cultivo, rastrojo bajo, suelo, construcción o agua durante todo el período."},
        ],
    },
    "sinia_2021": {
        "titulo": "Cobertura general SINIA 2021 (tres categorías)",
        "descripcion": "Exactitud temática del producto oficial 2021 en la CHCP.",
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


def imagen_estratos(clave: str, geometria, ee):
    if clave == "senal_perdida":
        jrc, valida = _estado_y_mascara_valida_ee("jrc_tmf", PERIODOS_ANALISIS["jrc_diagnostico"], geometria, ee_module=ee)
        ini, _ = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_inicial"], geometria, ee_module=ee)
        fin, _ = _estado_y_mascara_valida_ee("esri_lulc", PERIODOS_ANALISIS["esri_final"], geometria, ee_module=ee)
        post, _, _ = _hansen(geometria, ee)
        fuentes = _coincidence(jrc, post, ini, fin, geometria, ee).unmask(0)
        imagen = (ee.Image(3).where(jrc.eq(1).And(fuentes.eq(0)), 2).where(fuentes.gte(2), 1)
                  .updateMask(valida).setDefaultProjection(jrc.projection()))
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
