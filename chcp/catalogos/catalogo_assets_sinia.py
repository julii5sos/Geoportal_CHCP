"""Registro de las ocho coberturas oficiales SINIA–MiAMBIENTE para la CHCP.

Vista de compatibilidad construida desde ``data/catalogo_assets_sinia.json`` y
``data/leyendas_sinia.json`` (fuente única). No declare aquí categorías nuevas:
edite los JSON y documente la evidencia en docs/DICCIONARIO_CAPAS_SINIA.md.
"""

from __future__ import annotations

from chcp.catalogos.leyendas_sinia import cargar_catalogo, id_asset, leyenda


def _ficha(clave: str, datos: dict) -> dict[str, object]:
    ficha = {
        "asset_id": id_asset(clave),
        "nombre": datos["nombre"],
        "anio": datos["anio"],
        "tipo_esperado": datos["tipo"],
        "resolucion": f"{datos['resolucion_m']} m" if datos.get("resolucion_m") else "Vector institucional",
        "crs": datos["crs"],
        "nodata": datos.get("nodata"),
        "estado": datos.get("estado_acceso", ""),
        "leyenda": {fila["codigo"]: fila["categoria"] for fila in leyenda(clave)},
        "limitacion": " ".join(datos.get("limitaciones", [])),
    }
    if datos.get("campo_tematico"):
        ficha["campo_tematico"] = datos["campo_tematico"]
    return ficha


ASSETS_SINIA: dict[str, dict[str, object]] = {clave: _ficha(clave, datos) for clave, datos in cargar_catalogo().items()}


def catalogo_assets_sinia() -> list[dict[str, object]]:
    return [{"clave": clave, **ficha} for clave, ficha in ASSETS_SINIA.items()]
