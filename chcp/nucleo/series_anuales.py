"""Catálogo de las series anuales que se precalculan por territorio (sin Earth Engine).

Cada producto conserva su propia definición, resolución y período. Los colores y las
etiquetas son la única fuente para los mapas por año, la leyenda y las gráficas de la
Plataforma SIG (se copian a ``data/series/indice.json``).

Ninguna serie modifica el método MT-2026.7: la preevaluación sigue usando los períodos
fijos de ``metodologia_indice.PERIODOS_ANALISIS``. Las series sirven para ver cómo
evolucionó cada fuente y comparar dos años.
"""

from __future__ import annotations

from typing import Any

from chcp.nucleo.metodologia_indice import PERIODOS_ANALISIS

SIN_DATO = 255  # valor de los PNG fuera del territorio o sin dato

# Intervalos de NDVI de METODOLOGIA.md («La clasificación visual utilizada en el mapa»).
LIMITES_NDVI = (0.0, 0.2, 0.4, 0.6)

PRODUCTOS: dict[str, dict[str, Any]] = {
    "jrc": {
        "nombre": "Bosque tropical húmedo · JRC TMF",
        "corto": "JRC TMF",
        "anios": list(range(1990, 2026)),
        "resolucion_m": 30,
        "fuente": "JRC Tropical Moist Forest v1_2025 (Landsat)",
        "tipo": "categorias",
        "clases": [
            {"valor": 1, "etiqueta": "Bosque sin perturbación", "color": "#1d6b35"},
            {"valor": 2, "etiqueta": "Bosque degradado", "color": "#f28e2b"},
            {"valor": 3, "etiqueta": "Deforestado", "color": "#fabc20"},
            {"valor": 4, "etiqueta": "Regeneración", "color": "#a6d96a"},
            {"valor": 5, "etiqueta": "Agua", "color": "#5aa9e6"},
            {"valor": 6, "etiqueta": "Otra cobertura", "color": "#d7c2a1"},
        ],
        "lectura": "Estado de cada año (banda de diciembre). «Degradado» y «deforestado» acumulan las perturbaciones desde 1990.",
        "periodo_indice": f"Estado {PERIODOS_ANALISIS['jrc_diagnostico']}",
    },
    "hansen": {
        "nombre": "Pérdida de cobertura arbórea · Hansen GFC",
        "corto": "Hansen",
        "anios": list(range(2001, 2026)),
        "resolucion_m": 30,
        "fuente": "Hansen/UMD/Google/USGS/NASA Global Forest Change 2025",
        "tipo": "anual",  # un solo mapa: el valor del píxel es el año de la pérdida (1–25)
        "clases": [{"valor": a - 2000, "etiqueta": str(a), "color": c} for a, c in zip(
            range(2001, 2026),
            ["#ffffcc", "#fff6b5", "#ffed9f", "#ffe48a", "#fed976", "#fecc68", "#febf5a", "#feb24c",
             "#fea446", "#fd9640", "#fd8a3b", "#fd7d36", "#fc6d33", "#f95e2f", "#f34e2c", "#ec3e28",
             "#e31a1c", "#d7141f", "#ca0e22", "#bd0026", "#a60026", "#940026", "#800026", "#6b0024", "#55001e"])],
        "lectura": "Año en que se perdió la cobertura arbórea (≥ 30 % en 2000). Incluye cosecha de plantaciones; no indica la causa.",
        "periodo_indice": "Pérdida 2021–2025 (posterior al 31/12/2020)",
    },
    "esri": {
        "nombre": "Cobertura y uso del suelo · ESRI LULC",
        "corto": "ESRI",
        "anios": list(range(PERIODOS_ANALISIS["esri_inicial"], PERIODOS_ANALISIS["esri_final_visual"] + 1)),
        "resolucion_m": 10,
        "fuente": "ESRI / Impact Observatory Annual Land Cover 10 m (Sentinel-2)",
        "tipo": "categorias",
        "clases": [
            {"valor": 2, "etiqueta": "Árboles", "color": "#397d49"},
            {"valor": 11, "etiqueta": "Pastizal y matorral", "color": "#e3e2c3"},
            {"valor": 5, "etiqueta": "Cultivos", "color": "#e49635"},
            {"valor": 4, "etiqueta": "Vegetación inundada", "color": "#7a87c6"},
            {"valor": 7, "etiqueta": "Área construida", "color": "#c4281b"},
            {"valor": 8, "etiqueta": "Suelo desnudo", "color": "#a59b8f"},
            {"valor": 1, "etiqueta": "Agua", "color": "#419bdf"},
            {"valor": 9, "etiqueta": "Nieve o hielo", "color": "#a8ebff"},
        ],
        "lectura": "Clasificación automática anual de Sentinel-2. La clase «Árboles» no es la definición de bosque de JRC ni de SINIA.",
        "periodo_indice": f"Árboles {PERIODOS_ANALISIS['esri_inicial']} → otra clase {PERIODOS_ANALISIS['esri_final']}",
    },
    "ndvi": {
        "nombre": "Vigor de la vegetación · NDVI Sentinel-2",
        "corto": "NDVI",
        "anios": list(range(2017, PERIODOS_ANALISIS["ndvi_final_visual"] + 1)),
        "resolucion_m": 20,
        "fuente": "Copernicus Sentinel-2 SR Harmonized, mediana anual con máscara de nubes (SCL)",
        "tipo": "categorias",
        "clases": [
            {"valor": 1, "etiqueta": "Sin vegetación activa (< 0)", "color": "#8c510a"},
            {"valor": 2, "etiqueta": "Suelo o cobertura muy escasa (0–0,2)", "color": "#d8b365"},
            {"valor": 3, "etiqueta": "Vegetación escasa (0,2–0,4)", "color": "#f6e8c3"},
            {"valor": 4, "etiqueta": "Vegetación moderada (0,4–0,6)", "color": "#80cdc1"},
            {"valor": 5, "etiqueta": "Vegetación densa (≥ 0,6)", "color": "#01665e"},
        ],
        "lectura": "Vigor espectral, no tipo de cobertura. Un descenso puede deberse a cosecha, sequía o nubes residuales.",
        "periodo_indice": f"{PERIODOS_ANALISIS['ndvi_inicial']} → {PERIODOS_ANALISIS['ndvi_final']}",
    },
}


def clase_ndvi(valor: float | None) -> int:
    """Clase 1–5 de NDVI (misma regla que el mapa); SIN_DATO si no hay valor."""
    if valor is None or valor != valor:  # NaN
        return SIN_DATO
    for k, limite in enumerate(LIMITES_NDVI, 1):
        if valor < limite:
            return k
    return len(LIMITES_NDVI) + 1


def nombre_banda(producto: str, anio: int) -> str:
    return f"{producto}_{anio}"


def ruta_mapa(producto: str, anio: int | None = None) -> str:
    """Nombre del PNG de valores de un producto y año (Hansen: un solo mapa)."""
    return "hansen.v.png" if producto == "hansen" else f"{producto}_{anio}.v.png"


def indice_publico() -> dict[str, Any]:
    """Parte fija del índice que lee la Plataforma SIG."""
    return {"productos": {k: {c: v for c, v in p.items()} for k, p in PRODUCTOS.items()},
            "periodos_indice": dict(PERIODOS_ANALISIS)}


def grupos_a_hectareas(grupos: list[dict[str, Any]] | None) -> dict[str, float]:
    """[{'c': 1, 'sum': 12.3}, …] (reduceRegion agrupado) → {'1': 12.3, …}, sin sin-dato."""
    salida: dict[str, float] = {}
    for g in grupos or []:
        codigo = int(round(float(g.get("c", g.get("group", SIN_DATO)))))
        if codigo == SIN_DATO:
            continue
        salida[str(codigo)] = round(float(g.get("sum", 0.0)), 4)
    return salida
