"""Acceso único al catálogo y a las leyendas SINIA–MiAMBIENTE.

La fuente de verdad son ``data/catalogo_assets_sinia.json`` y
``data/leyendas_sinia.json``. Mapa, gráficos, estadísticas e informes deben leer
las categorías desde aquí para que un mismo código nunca cambie de significado.

La raíz de los assets es configurable con ``SINIA_ASSET_ROOT`` para que otra
persona pueda reproducir la aplicación con su propia copia de los datos.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

DIRECTORIO_DATOS = Path(__file__).resolve().parents[2] / "data"
ARCHIVO_CATALOGO = DIRECTORIO_DATOS / "catalogo_assets_sinia.json"
ARCHIVO_LEYENDAS = DIRECTORIO_DATOS / "leyendas_sinia.json"

ESTADOS_MOSTRABLES_COMO_OFICIALES = {"verificada_espacialmente", "verificada_valor_atributo", "documentada_catalogo_previo"}


@lru_cache(maxsize=1)
def _catalogo_json() -> dict[str, Any]:
    return json.loads(ARCHIVO_CATALOGO.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _leyendas_json() -> dict[str, Any]:
    return json.loads(ARCHIVO_LEYENDAS.read_text(encoding="utf-8"))


def raiz_assets() -> str:
    raiz = os.getenv("SINIA_ASSET_ROOT") or _catalogo_json()["raiz_assets_por_defecto"]
    return raiz.rstrip("/")


def cargar_catalogo() -> dict[str, dict[str, Any]]:
    return _catalogo_json()["assets"]


def id_asset(clave: str) -> str:
    return f"{raiz_assets()}/{cargar_catalogo()[clave]['asset']}"


def leyenda(clave: str) -> list[dict[str, Any]]:
    return _leyendas_json()["leyendas"][clave]


def categoria(clave: str, codigo: int) -> dict[str, Any] | None:
    return next((fila for fila in leyenda(clave) if fila["codigo"] == int(codigo)), None)


def etiqueta_publica(clave: str, codigo: int) -> str:
    """Nombre que puede mostrarse sin presentar como oficial lo no verificado."""
    fila = categoria(clave, codigo)
    if fila is None:
        return f"Código {int(codigo)} · sin documentación"
    return fila["categoria"]


def es_oficial(fila: dict[str, Any]) -> bool:
    return fila["estado"] in ESTADOS_MOSTRABLES_COMO_OFICIALES


def estados() -> dict[str, str]:
    return _leyendas_json()["estados"]


def fuentes() -> dict[str, str]:
    return _catalogo_json()["fuentes"]
