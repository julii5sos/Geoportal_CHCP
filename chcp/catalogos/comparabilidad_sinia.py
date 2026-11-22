"""Reglas de comparabilidad entre productos SINIA–MiAMBIENTE.

Una transición (pérdida, ganancia, cambio) solo se calcula si se cumplen TODOS los
criterios: correspondencia temática verificable, reglas de reclasificación
explícitas, escalas compatibles, proyección y alineación adecuadas, área válida
común, fechas comparables e interpretación de incertidumbre. Ningún par cumple hoy
esos criterios, por lo que la aplicación solo ofrece comparación visual y
estadísticas independientes. Ver docs/COMPARABILIDAD_COBERTURAS.md.
"""

from __future__ import annotations

from itertools import combinations
from typing import Any

from chcp.catalogos.leyendas_sinia import cargar_catalogo, leyenda

CRITERIOS = (
    "correspondencia_tematica", "reglas_reclasificacion", "escalas_compatibles",
    "alineacion", "area_valida_comun", "fechas_comparables", "incertidumbre",
)


def _escala(ficha: dict) -> str:
    return ficha.get("escala_cartografica") or (f"{ficha['resolucion_m']} m" if ficha.get("resolucion_m") else "vector")


def evaluar_par(a: str, b: str) -> dict[str, Any]:
    cat = cargar_catalogo()
    fa, fb = cat[a], cat[b]
    leyenda_verificada = all(f["estado"] in {"verificada_espacialmente", "verificada_valor_atributo", "documentada_catalogo_previo"}
                             for clave in (a, b) for f in leyenda(clave))
    motivos = []
    if _escala(fa) != _escala(fb):
        motivos.append(f"Escalas distintas ({_escala(fa)} frente a {_escala(fb)}).")
    if len(leyenda(a)) != len(leyenda(b)):
        motivos.append(f"Leyendas con distinto detalle ({len(leyenda(a))} y {len(leyenda(b))} clases).")
    if not leyenda_verificada:
        motivos.append("Al menos un producto tiene códigos sin correspondencia verificada.")
    motivos.append("No existe un dictamen de equivalencia metodológica del productor entre ambos años.")
    criterios = {c: False for c in CRITERIOS}
    criterios["reglas_reclasificacion"] = True  # grupos derivados explícitos en data/leyendas_sinia.json
    return {
        "a": a, "b": b, "anios": [fa["anio"], fb["anio"]],
        "permite_transiciones": all(criterios.values()),
        "modo": "visual_y_estadisticas_independientes",
        "criterios": criterios, "motivos": motivos,
        "comparacion_por_grupos_derivados": "Descriptiva: diferencias de superficie por grupo, sin atribuirlas a cambio real.",
    }


def matriz_comparabilidad() -> list[dict[str, Any]]:
    return [evaluar_par(a, b) for a, b in combinations(cargar_catalogo(), 2)]
