"""Tipo de procesamiento y trazabilidad de cada resultado (auditoría D).

* **A — Calculado con Earth Engine**: el backend ejecuta Earth Engine al momento de la solicitud.
* **B — Precalculado con Earth Engine**: generado antes por un proceso reproducible (GitHub Actions).
* **C — Estimación local derivada**: calculada en el navegador a partir de mapas de valores
  precalculados (tipo B); hereda su fecha y su resolución.

El tipo indica la procedencia, no la exactitud: la exactitud depende de la fuente, la
resolución, la máscara y el algoritmo, y solo una validación independiente la cuantifica.
"""

from __future__ import annotations

import os
import subprocess
from collections import Counter
from datetime import datetime, timezone
from typing import Any

TIPOS = {
    "A": "Calculado con Earth Engine en el momento de la solicitud",
    "B": "Precalculado con Earth Engine (proceso reproducible)",
    "C": "Estimación local derivada en el navegador a partir de resultados precalculados",
}

FUENTES = [
    {"fuente": "JRC TMF (Annual Changes v1_2024)", "periodo": "estado a diciembre 2025; serie 2020–2025", "resolucion_m": 30},
    {"fuente": "Hansen Global Forest Change", "periodo": "pérdida 2021–2025", "resolucion_m": 30},
    {"fuente": "ESRI 10 m Annual LULC", "periodo": "2017 y 2024", "resolucion_m": 10},
    {"fuente": "Sentinel-2 SR armonizado (NDVI)", "periodo": "medianas 2020 y 2025", "resolucion_m": 10},
    {"fuente": "GEDI altura de dosel (Open Foris)", "periodo": "compuesto", "resolucion_m": 30},
    {"fuente": "SINIA–MiAMBIENTE (assets del proyecto geoportal-513817)", "periodo": "2019, 2021, 2023", "resolucion_m": "10–20"},
    {"fuente": "Almanaque Azul (corredores y puntos críticos)", "periodo": "publicación vigente", "resolucion_m": "vector"},
]


def version_codigo() -> str:
    sha = os.environ.get("GITHUB_SHA")
    if sha:
        return sha[:12]
    try:
        return subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return "no registrada"


def metadatos_ejecucion(metodologia: str, version_datos: int) -> dict[str, Any]:
    return {
        "tipo": "B", "descripcion": TIPOS["B"],
        "fecha_procesamiento": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version_codigo": version_codigo(),
        "workflow_run": os.environ.get("GITHUB_RUN_ID"),
        "repositorio": os.environ.get("GITHUB_REPOSITORY"),
        "metodologia": metodologia, "version_datos": version_datos,
        "proyecto_gee": os.environ.get("GEE_PROJECT_ID", "geoportal-513817"),
        "fuentes": FUENTES,
    }


def estado_actualizacion(datos: dict[str, Any]) -> dict[str, Any]:
    """Resume si todos los territorios provienen de la misma versión y ejecución."""
    territorios = datos.get("territorios") or {}
    vigente = datos.get("version_datos")
    versiones = Counter(str(t.get("version_datos", "1")) for t in territorios.values())
    errores = datos.get("errores") or {}
    completa = len(versiones) == 1 and str(vigente) in versiones and not errores
    return {
        "completa": completa,
        "territorios": len(territorios),
        "por_version": dict(versiones),
        "con_error": sorted(errores),
        "lectura": ("Todos los territorios provienen de la misma versión de datos." if completa else
                    "Actualización parcial: hay territorios de versiones distintas o con error; "
                    "cada ficha indica la versión y la fecha de su propio cálculo."),
    }


def enriquecer_estadisticas(datos: dict[str, Any]) -> dict[str, Any]:
    """Agrega trazabilidad e indicadores experimentales al servir el panel (sin tocar el archivo)."""
    from chcp.nucleo.indicadores_relativos import bloque_publicable

    salida = dict(datos)
    proc = dict(datos.get("procesamiento") or {})
    proc.setdefault("tipo", "B")
    proc.setdefault("descripcion", TIPOS["B"])
    proc.setdefault("fecha_procesamiento", datos.get("generado"))
    proc.setdefault("version_codigo", "no registrada (datos anteriores al registro de versiones)")
    proc.setdefault("metodologia", datos.get("metodologia"))
    proc.setdefault("fuentes", FUENTES)
    salida["procesamiento"] = proc
    salida["estado_actualizacion"] = estado_actualizacion(datos)
    cuenca = (datos.get("territorios") or {}).get("chcp")
    territorios = {}
    for clave, t in (datos.get("territorios") or {}).items():
        t2 = dict(t)
        t2.setdefault("version_datos", 1)
        try:
            t2["indicadores_relativos"] = bloque_publicable(t, cuenca if clave != "chcp" else None)
        except Exception:  # noqa: BLE001
            t2["indicadores_relativos"] = None
        territorios[clave] = t2
    salida["territorios"] = territorios
    return salida
