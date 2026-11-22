"""Indicadores relativos de cambio forestal por subcuenca (variante EXPERIMENTAL).

Origen: la auditoría A (``docs/auditoria/A_SATURACION_INDICE.md``) mostró que el
índice MT-2026.7 se satura en subcuencas porque sus umbrales absolutos (0,5 ha de
deforestación JRC, 2 ha de degradación JRC, 0,18 ha de pérdida Hansen) fueron
pensados para predios y se cumplen casi siempre en territorios de miles de hectáreas.

Esta variante **no sustituye** MT-2026.7 ni produce una prioridad categórica:
publica indicadores continuos, normalizados por el bosque o el territorio, y los
compara con el valor de la cuenca completa (una referencia externa al conjunto, no
un percentil). No existen todavía umbrales ecológicos calibrados para convertirlos
en categorías; por eso se rotulan como experimentales.

Los indicadores se mantienen separados porque miden fenómenos distintos y no deben
sumarse como eventos independientes (JRC y Hansen comparten imágenes Landsat).
"""

from __future__ import annotations

from typing import Any

from chcp.nucleo.metodologia_indice import UMBRALES_INDICE

VERSION = "MT-2026.7-SUBC-EXP-1"
ESTADO = "experimental"
ANIOS_HANSEN = 5  # 2021–2025

INDICADORES = {
    "perdida_reciente_pct_anual": {
        "nombre": "Pérdida reciente de cobertura arbórea",
        "unidad": "% del bosque por año",
        "formula": "Pérdida Hansen 2021–2025 ÷ bosque oficial SINIA 2021 ÷ 5 años × 100",
        "mide": "Intensidad de pérdida reciente relativa al bosque existente (eventos anuales).",
    },
    "salida_arboles_pct": {
        "nombre": "Salida de árboles ESRI",
        "unidad": "% de los árboles de 2017",
        "formula": "Árboles 2017 → otra clase 2024 ÷ árboles 2017 × 100",
        "mide": "Proporción de la cobertura arbórea de 2017 que ya no es árbol en 2024 (Sentinel-2, 10 m).",
    },
    "perturbacion_acumulada_pct": {
        "nombre": "Perturbación acumulada JRC",
        "unidad": "% del territorio",
        "formula": "(Deforestado + degradado JRC a 2025) ÷ superficie × 100",
        "mide": "Huella acumulada desde 1990 (legado), no urgencia reciente.",
    },
    "descenso_vigor_pct": {
        "nombre": "Descenso fuerte de vigor (NDVI)",
        "unidad": "% del territorio",
        "formula": "Superficie con NDVI inicial ≥ 0,4 y caída ≥ 0,15 (2020→2025) ÷ superficie × 100",
        "mide": "Pérdida de vigor; puede deberse a cosecha, sequía o nubes.",
    },
}


def _num(v) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def _div(a, b) -> float | None:
    a, b = _num(a), _num(b)
    return None if a is None or not b else a / b


def bosque_referencia_ha(territorio: dict[str, Any]) -> float | None:
    s21 = next((s for s in territorio.get("sinia") or [] if s.get("year") == 2021), None)
    return _num(s21.get("forest_ha")) if s21 else None


def calcular(territorio: dict[str, Any]) -> dict[str, float | None]:
    """Indicadores relativos a partir del registro compacto del panel."""
    area = _num(territorio.get("area_ha"))
    jrc = territorio.get("jrc_ha") or {}
    esri = territorio.get("esri") or {}
    ndvi = territorio.get("ndvi") or {}
    bosque = bosque_referencia_ha(territorio)
    arboles_2017 = (_num(esri.get("esri_salida")) or 0) + (_num(esri.get("esri_estable")) or 0)
    perdida = _div(territorio.get("hansen_post_2020_ha"), bosque)
    return {
        "perdida_reciente_pct_anual": None if perdida is None else perdida * 100 / ANIOS_HANSEN,
        "salida_arboles_pct": None if not arboles_2017 else (_num(esri.get("esri_salida")) or 0) / arboles_2017 * 100,
        "perturbacion_acumulada_pct": None if not area else ((_num(jrc.get("tmf_deforestacion")) or 0) + (_num(jrc.get("tmf_degradacion")) or 0)) / area * 100,
        "descenso_vigor_pct": None if not area or ndvi.get("ndvi_disminucion") is None else _num(ndvi["ndvi_disminucion"]) / area * 100,
    }


def motivos_activacion(territorio: dict[str, Any]) -> dict[str, Any]:
    """Qué regla de MT-2026.7 activa cada señal y si la activación es solo absoluta."""
    U = UMBRALES_INDICE
    area = _num(territorio.get("area_ha")) or 0
    jrc = territorio.get("jrc_ha") or {}
    pct = lambda v: (v / area * 100) if area else 0.0  # noqa: E731
    d, g = _num(jrc.get("tmf_deforestacion")) or 0, _num(jrc.get("tmf_degradacion")) or 0
    reglas_tmf = {
        "deforestacion_ha": d >= U["jrc_deforestacion_ha"], "deforestacion_pct": pct(d) >= U["jrc_deforestacion_pct"],
        "degradacion_ha": g >= U["jrc_degradacion_ha"], "degradacion_pct": pct(g) >= U["jrc_degradacion_pct"],
    }
    hansen = _num(territorio.get("hansen_post_2020_ha")) or 0
    salida = _num((territorio.get("esri") or {}).get("esri_salida")) or 0
    absolutas_tmf = reglas_tmf["deforestacion_ha"] or reglas_tmf["degradacion_ha"]
    relativas_tmf = reglas_tmf["deforestacion_pct"] or reglas_tmf["degradacion_pct"]
    return {
        "tmf": {"reglas": reglas_tmf, "solo_absoluta": absolutas_tmf and not relativas_tmf},
        "hansen": {"reglas": {"perdida_ha": hansen >= U["hansen_post_2020_ha"]}, "solo_absoluta": hansen >= U["hansen_post_2020_ha"],
                   "fraccion_umbral_pct": (U["hansen_post_2020_ha"] / area * 100) if area else None},
        "esri": {"reglas": {"salida_ha": salida >= U["esri_salida_arboles_ha"], "salida_pct": pct(salida) >= U["esri_salida_arboles_pct"]},
                 "solo_absoluta": False},
        "fraccion_minima_tmf_pct": (U["jrc_deforestacion_ha"] / area * 100) if area else None,
    }


def comparar_con_cuenca(valores: dict[str, float | None], cuenca: dict[str, float | None]) -> dict[str, float | None]:
    """Razón respecto del valor de la CHCP completa (1 = igual que la cuenca)."""
    return {k: (None if v is None or not cuenca.get(k) else v / cuenca[k]) for k, v in valores.items()}


def bloque_publicable(territorio: dict[str, Any], cuenca: dict[str, Any] | None) -> dict[str, Any]:
    valores = calcular(territorio)
    ref = calcular(cuenca) if cuenca else {}
    return {
        "version": VERSION, "estado": ESTADO, "valores": valores,
        "razon_vs_cuenca": comparar_con_cuenca(valores, ref) if ref else None,
        "valores_cuenca": ref or None,
        "nota": "Indicadores continuos experimentales; no constituyen una prioridad validada. "
                "La razón compara con la CHCP completa (1 = igual que la cuenca).",
    }
