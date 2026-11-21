"""Verificación real del Geoportal CHCP contra Google Earth Engine.

Ejecuta la preevaluación MT-2026.7 completa (con la serie anual 2020–2025) sobre
una subcuenca y comprueba coherencias internas sin modificar fórmulas:

* las seis clases JRC TMF del año diagnóstico cierran con el área analizada;
* el puntaje no supera 6.5 y la prioridad de visita no supera 8.0;
* la serie anual contiene 2020–2025 y Hansen empieza en 2021;
* la clase JRC del último año de la serie coincide con la del resumen.

Uso (con credenciales locales de `earthengine authenticate`):

    python scripts/verificar_geoportal_gee.py
    python scripts/verificar_geoportal_gee.py --subcuenca "Río Aguas Claras"

Escribe `verificacion_geoportal_gee.json` en el directorio actual.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

import ee

from chcp.gee.evaluacion_ecologica import ejecutar_evaluacion_ecologica
from chcp.gee.gee_config import inicializar_earth_engine
from chcp.nucleo.corredores import analizar_interseccion_corredores
from chcp.nucleo.metodologia_indice import METODOLOGIA_VERSION, PUNTAJE_MAXIMO_VISITA
from chcp.territorio.territorio_local import geometria_subcuenca

CLASES_JRC = ("tmf_estable", "tmf_degradacion", "tmf_deforestacion",
              "tmf_recuperacion", "tmf_agua", "tmf_otra_cobertura")


def _comprobar(resultado: dict, nombre: str, condicion: bool, detalle: str) -> None:
    resultado["comprobaciones"].append({"nombre": nombre, "ok": bool(condicion), "detalle": detalle})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", default="geoportal-513817")
    parser.add_argument("--subcuenca", default="Qda. Bonita")
    parser.add_argument("--salida", default="verificacion_geoportal_gee.json")
    args = parser.parse_args()

    entorno = dict(os.environ)
    entorno["GEE_PROJECT_ID"] = args.project
    inicializar_earth_engine(ee, environ=entorno)

    geometria = geometria_subcuenca(args.subcuenca)
    inicio = time.time()
    evaluacion = ejecutar_evaluacion_ecologica(
        geometria,
        contexto_corredores=analizar_interseccion_corredores(geometria),
        ee_module=ee,
    )
    segundos = round(time.time() - inicio, 1)

    m = evaluacion["metrics"]
    serie = evaluacion["annual_series"]
    salida = {
        "fecha": datetime.now().isoformat(timespec="seconds"),
        "proyecto": args.project,
        "subcuenca": args.subcuenca,
        "metodologia": METODOLOGIA_VERSION,
        "segundos": segundos,
        "area_ha": m["area_ha"],
        "puntaje": evaluacion["score"],
        "prioridad": evaluacion["priority"],
        "senales": evaluacion["signals"],
        "aportes": evaluacion["contributions"],
        "prioridad_visita": evaluacion["visit_priority"],
        "consistencia": evaluacion["consistency"],
        "clases_jrc_ha": {k: m[k] for k in CLASES_JRC},
        "hansen_post_2020_ha": m["hansen_post"],
        "serie_anual": serie,
        "comprobaciones": [],
    }

    suma_jrc = sum(m[k] for k in CLASES_JRC)
    cierre = abs(suma_jrc - m["area_ha"]) / m["area_ha"] * 100 if m["area_ha"] else 100
    _comprobar(salida, "cierre_clases_jrc", cierre <= 2.0,
               f"Suma de clases {suma_jrc:.2f} ha frente a {m['area_ha']:.2f} ha ({cierre:.2f} %). "
               "Diferencias menores se deben a píxeles sin dato o al borde del polígono.")
    _comprobar(salida, "puntaje_maximo", evaluacion["score"] <= 6.5,
               f"Puntaje {evaluacion['score']} de 6.5")
    visita = evaluacion["visit_priority"].get("puntaje_integrado")
    _comprobar(salida, "prioridad_visita_maxima", visita is None or visita <= PUNTAJE_MAXIMO_VISITA,
               f"Puntaje integrado {visita} de {PUNTAJE_MAXIMO_VISITA}")
    _comprobar(salida, "anios_serie", [f["anio"] for f in serie] == list(range(2020, 2026)),
               "La serie debe cubrir 2020–2025")
    _comprobar(salida, "hansen_desde_2021", serie[0]["hansen_perdida_ha"] is None,
               "Hansen 2020 no se reporta porque el corte es el 31/12/2020")
    ultimo = serie[-1]
    diferencia = abs(ultimo["jrc_deforestacion_ha"] - m["tmf_deforestacion"])
    _comprobar(salida, "serie_coincide_con_resumen", diferencia <= max(0.05, m["tmf_deforestacion"] * 0.01),
               f"Deforestación JRC 2025: serie {ultimo['jrc_deforestacion_ha']:.2f} ha, resumen {m['tmf_deforestacion']:.2f} ha")
    hansen_serie = sum(f["hansen_perdida_ha"] or 0 for f in serie)
    _comprobar(salida, "hansen_serie_vs_post2020", abs(hansen_serie - m["hansen_post"]) <= max(0.1, m["hansen_post"] * 0.05),
               f"Suma anual Hansen {hansen_serie:.2f} ha frente a pérdida posterior a 2020 {m['hansen_post']:.2f} ha")

    Path(args.salida).write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(c["ok"] for c in salida["comprobaciones"])
    total = len(salida["comprobaciones"])
    print(f"{args.subcuenca}: puntaje {evaluacion['score']} ({evaluacion['priority']}), {segundos} s")
    print(f"Comprobaciones superadas: {ok}/{total}. Resultado en {args.salida}")
    return 0 if ok == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
