"""Reclasificación ecológica derivada de los productos SINIA–MiAMBIENTE.

Los datos originales no se modifican: cada grupo derivado conserva una relación
explícita con los códigos de origen (``grupo_derivado`` en data/leyendas_sinia.json).
Las máscaras forestales para fragmentación y conectividad se definen aquí, por
producto, con su justificación. Nunca se usa «toda la vegetación» como bosque.
"""

from __future__ import annotations

from typing import Any

from chcp.catalogos.leyendas_sinia import leyenda

GRUPOS_DERIVADOS: dict[str, dict[str, str]] = {
    "bosque_natural": {"nombre": "Bosque natural", "color": "#1B5E20"},
    "bosque_secundario": {"nombre": "Bosque secundario o intervenido", "color": "#43A047"},
    "bosque_plantado": {"nombre": "Bosque plantado", "color": "#827717"},
    "bosque_amplio": {"nombre": "Bosques y otras tierras boscosas (categoría amplia)", "color": "#237A4B"},
    "rastrojo_arbustivo": {"nombre": "Rastrojo y vegetación arbustiva", "color": "#9CCC65"},
    "otra_vegetacion": {"nombre": "Otras coberturas vegetales", "color": "#C5E1A5"},
    "areas_abiertas_naturales": {"nombre": "Áreas abiertas naturales", "color": "#D7CCC8"},
    "cultivos": {"nombre": "Cultivos", "color": "#FFB74D"},
    "pastos": {"nombre": "Pastos", "color": "#F0E68C"},
    "agropecuario_mixto": {"nombre": "Agropecuario sin desagregar", "color": "#FFE082"},
    "areas_intervenidas": {"nombre": "Áreas intervenidas (pobladas, infraestructura, minería)", "color": "#9E9E9E"},
    "otras_tierras_amplia": {"nombre": "Otras tierras (categoría amplia)", "color": "#D8C49C"},
    "agua": {"nombre": "Agua", "color": "#388FC4"},
    "no_identificado": {"nombre": "Código no identificado", "color": "#BDBDBD"},
    "sin_datos": {"nombre": "Sin datos", "color": "#FFFFFF"},
}

# Máscaras forestales por producto. «codigos» se interpretan con la leyenda del
# MISMO producto; nunca se reutilizan entre años.
MASCARAS_FORESTALES: dict[str, dict[str, Any]] = {
    "1992_historico": {"grupos": ["bosque_natural", "bosque_secundario"],
                       "justificacion": "Bosque maduro, secundario maduro, intervenido y manglar. Se excluyen rastrojos (sucesión temprana) y el código 8 sin documentar."},
    "2000_historico": {"grupos": ["bosque_natural", "bosque_secundario"],
                       "justificacion": "Mismas clases que 1992, leídas con la tabla de códigos de 2000."},
    "2012_binario": {"grupos": ["bosque_amplio"], "justificacion": "Clase «Bosque» de la capa binaria; incluye plantaciones."},
    "2012_detallado": {"grupos": ["bosque_natural", "bosque_secundario"], "opcionales": ["bosque_plantado"],
                       "justificacion": "Bosques naturales (códigos 1–6). Las plantaciones (7–8) solo se incluyen si el análisis lo declara."},
    "2019_general": {"grupos": ["bosque_amplio"], "justificacion": "Categoría amplia; incluye otras tierras boscosas."},
    "2021_general": {"grupos": ["bosque_amplio"], "justificacion": "«Bosques y Otras Tierras Boscosas», definición del motor de fragmentación validado."},
    "2021_detallado": {"grupos": ["bosque_natural", "bosque_secundario"], "opcionales": ["bosque_plantado"],
                       "justificacion": "Grupos 1–6 (bosque natural) según documentación previa; pendiente de correspondencia individual."},
    "2023_general": {"grupos": ["bosque_amplio"], "justificacion": "Categoría amplia del diagnóstico 2023."},
}


def reclasificacion(clave: str) -> dict[int, str]:
    """Código original → grupo derivado (incluye ``no_identificado`` cuando aplica)."""
    return {fila["codigo"]: fila["grupo_derivado"] for fila in leyenda(clave)}


def codigos_forestales(clave: str, *, incluir_opcionales: bool = False) -> list[int]:
    regla = MASCARAS_FORESTALES[clave]
    grupos = set(regla["grupos"]) | (set(regla.get("opcionales", [])) if incluir_opcionales else set())
    return sorted(codigo for codigo, grupo in reclasificacion(clave).items() if grupo in grupos)


def tabla_trazabilidad(clave: str) -> list[dict[str, Any]]:
    return [
        {"codigo": f["codigo"], "categoria": f["categoria"], "estado": f["estado"],
         "grupo_derivado": f["grupo_derivado"], "grupo_nombre": GRUPOS_DERIVADOS[f["grupo_derivado"]]["nombre"],
         "en_mascara_forestal": f["codigo"] in codigos_forestales(clave),
         "en_mascara_con_opcionales": f["codigo"] in codigos_forestales(clave, incluir_opcionales=True)}
        for f in leyenda(clave)
    ]
