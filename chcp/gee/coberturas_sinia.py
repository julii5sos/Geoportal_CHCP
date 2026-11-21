"""Superficie por categoría de las coberturas generales SINIA–MiAMBIENTE.

Solo se resumen los tres productos con las mismas tres categorías amplias
(bosques y otras tierras boscosas, otras tierras, agua): 2019, 2021 y 2023.
Cada año se calcula de forma independiente y conserva su propia leyenda; las
diferencias entre años **no** se interpretan como pérdida o ganancia porque los
productos tienen métodos, escalas y fechas de elaboración distintos.

El vector 2021 se rasteriza a 10 m (EPSG:32617) con ``paint`` para medirlo con el
mismo procedimiento que los rásteres. La diferencia frente a la intersección
vectorial exacta es pequeña y se documenta en cada resultado.
"""

from __future__ import annotations

from typing import Any, Iterable

from chcp.catalogos.catalogo_assets_sinia import ASSETS_SINIA

CRS_AREA = "EPSG:32617"
COLORES = {1: "#237A4B", 2: "#D8C49C", 3: "#388FC4"}
CATEGORIA_BOSQUE = 1

PRODUCTOS: dict[int, dict[str, Any]] = {
    2019: {"clave": "2019_general", "escala_m": 19.799712, "tipo": "raster"},
    2021: {"clave": "2021_general", "escala_m": 10, "tipo": "vector", "campo": "Categoria"},
    2023: {"clave": "2023_general", "escala_m": 10, "tipo": "raster"},
}
ANIOS_DISPONIBLES = tuple(PRODUCTOS)

ADVERTENCIA_COMPARABILIDAD = (
    "Los productos 2019, 2021 y 2023 se presentan uno al lado del otro como referencias "
    "institucionales independientes. Sus diferencias reflejan también cambios de método, "
    "escala e insumos; no constituyen una medición de pérdida o ganancia de bosque."
)


def _imagen_categorias(anio: int, ee_module):
    producto = PRODUCTOS[anio]
    ficha = ASSETS_SINIA[producto["clave"]]
    if producto["tipo"] == "vector":
        coleccion = ee_module.FeatureCollection(ficha["asset_id"])
        imagen = ee_module.Image(0).toByte()
        for codigo, etiqueta in ficha["leyenda"].items():
            imagen = imagen.paint(
                coleccion.filter(ee_module.Filter.eq(producto["campo"], etiqueta)), int(codigo)
            )
        return imagen.selfMask().rename("codigo")
    imagen = ee_module.Image(ficha["asset_id"]).select([0], ["codigo"])
    validos = list(ficha["leyenda"])
    return imagen.updateMask(imagen.remap(validos, [1] * len(validos), 0).eq(1))


def construir_resumen(anio: int, grupos: list[dict[str, Any]], area_aoi_ha: float) -> dict[str, Any]:
    """Convierte la reducción agrupada de Earth Engine en filas por categoría."""

    producto = PRODUCTOS[anio]
    ficha = ASSETS_SINIA[producto["clave"]]
    por_codigo = {int(g.get("codigo", 0)): float(g.get("sum") or 0) for g in grupos}
    clasificada = sum(por_codigo.get(int(c), 0.0) for c in ficha["leyenda"])
    filas = []
    for codigo, etiqueta in ficha["leyenda"].items():
        ha = por_codigo.get(int(codigo), 0.0)
        filas.append({
            "code": int(codigo),
            "label": etiqueta,
            "color": COLORES.get(int(codigo), "#777777"),
            "area_ha": round(ha, 4),
            "percentage": round(ha / clasificada * 100, 4) if clasificada else 0.0,
        })
    bosque = por_codigo.get(CATEGORIA_BOSQUE, 0.0)
    return {
        "year": anio,
        "product": producto["clave"],
        "name": ficha["nombre"],
        "asset": ficha["asset_id"],
        "source_type": producto["tipo"],
        "scale_m": producto["escala_m"],
        "aoi_area_ha": round(area_aoi_ha, 4),
        "classified_ha": round(clasificada, 4),
        "unclassified_or_nodata_ha": round(max(0.0, area_aoi_ha - clasificada), 4),
        "forest_ha": round(bosque, 4),
        "forest_pct": round(bosque / clasificada * 100, 4) if clasificada else 0.0,
        "classes": filas,
        "limitation": ficha["limitacion"],
        "measurement": (
            "Vector rasterizado a 10 m en EPSG:32617." if producto["tipo"] == "vector"
            else f"Píxeles nativos de {producto['escala_m']} m en EPSG:32617."
        ),
    }


def resumir_coberturas_sinia(
    area_geojson: dict[str, Any], *, ee_module, anios: Iterable[int] = ANIOS_DISPONIBLES
) -> dict[str, Any]:
    anios = [int(a) for a in anios]
    desconocidos = [a for a in anios if a not in PRODUCTOS]
    if desconocidos:
        raise ValueError(f"Años sin producto SINIA de tres categorías: {desconocidos}")
    geometry = ee_module.Geometry(area_geojson, proj="EPSG:4326", geodesic=False)
    pixel_ha = ee_module.Image.pixelArea().divide(10_000).rename("ha")
    consultas = {"area_ha": geometry.area(1).divide(10_000)}
    for anio in anios:
        consultas[str(anio)] = pixel_ha.addBands(_imagen_categorias(anio, ee_module)).reduceRegion(
            reducer=ee_module.Reducer.sum().group(groupField=1, groupName="codigo"),
            geometry=geometry, scale=PRODUCTOS[anio]["escala_m"], crs=CRS_AREA,
            bestEffort=False, maxPixels=1e10, tileScale=4,
        ).get("groups")
    valores = ee_module.Dictionary(consultas).getInfo()
    area_aoi = float(valores.get("area_ha") or 0)
    return {
        "mode": "official_coverages_sinia",
        "years": anios,
        "products": [construir_resumen(a, valores.get(str(a)) or [], area_aoi) for a in anios],
        "comparability_warning": ADVERTENCIA_COMPARABILIDAD,
    }
