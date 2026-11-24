"""Calcula exactitud y área ajustada por error de cada muestra interpretada (sin Earth Engine).

    python scripts/evaluar_validacion.py

Lee ``data/validacion/<mapa>/{diseno.json, muestra.csv, estratos.csv}`` y escribe
``resultados.json`` en la misma carpeta, más ``data/validacion/indice.json`` para la
página de validación. Se ejecuta también al publicar el sitio, de modo que basta con
subir la muestra interpretada a GitHub para actualizar los resultados.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from chcp.nucleo.validacion import evaluar, matriz_conteos  # noqa: E402

DIR = RAIZ / "data" / "validacion"
MIN_POR_ESTRATO = 2  # el error estándar requiere al menos dos puntos por estrato


QC_MINIMO = 0.10  # fracción de puntos revisados por un segundo intérprete para declarar la muestra completa


def leer_referencia(valor: str, leyenda: list[dict]) -> int | None:
    """Código de la leyenda; 0 = sin evidencia suficiente; None = vacío o no reconocido."""
    valor = (valor or "").strip().lower()
    if not valor:
        return None
    if valor in ("0", "sin_evidencia", "sin evidencia", "sin evidencia suficiente"):
        return 0
    for c in leyenda:
        if valor in (str(c["codigo"]), c["clave"].lower(), c["etiqueta"].lower()):
            return c["codigo"]
    return None


def referencias_finales(carpeta: Path) -> dict[str, int]:
    """id → clase de referencia final (excluye «sin evidencia», vacíos y desacuerdos sin resolver)."""
    leyenda = json.loads((carpeta / "diseno.json").read_text(encoding="utf-8"))["leyenda"]
    salida = {}
    with (carpeta / "muestra.csv").open(encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            r1 = leer_referencia(fila.get("clase_referencia", ""), leyenda)
            r2 = leer_referencia(fila.get("clase_referencia_2", ""), leyenda)
            final = leer_referencia(fila.get("clase_final", ""), leyenda)
            if final is None:
                if r1 is not None and r2 is not None and r1 != r2:
                    continue
                final = r1
            if final:
                salida[fila["id"]] = final
    return salida


def evaluar_carpeta(carpeta: Path) -> dict:
    diseno = json.loads((carpeta / "diseno.json").read_text(encoding="utf-8"))
    leyenda = diseno["leyenda"]
    with (carpeta / "estratos.csv").open(encoding="utf-8") as f:
        estrato = {fila["id"]: int(fila["clase_mapa"]) for fila in csv.DictReader(f)}
    with (carpeta / "muestra.csv").open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    pares, no_validas = [], []
    sin_evidencia = desacuerdo = revisados = acuerdos_qc = sin_fecha = 0
    for fila in filas:
        r1 = leer_referencia(fila.get("clase_referencia", ""), leyenda)
        r2 = leer_referencia(fila.get("clase_referencia_2", ""), leyenda)
        final = leer_referencia(fila.get("clase_final", ""), leyenda)
        for campo in ("clase_referencia", "clase_referencia_2", "clase_final"):
            if (fila.get(campo) or "").strip() and leer_referencia(fila.get(campo), leyenda) is None:
                no_validas.append(fila["id"])
        if r2 is not None and r1 is not None:
            revisados += 1
            acuerdos_qc += int(r1 == r2)
        if final is None:
            if r2 is not None and r1 is not None and r1 != r2:
                desacuerdo += 1
                continue
            final = r1
        if final is None:
            continue
        if final == 0:
            sin_evidencia += 1
            continue
        # Con medianas anuales sin nubes no hay una fecha única: la fuente ya documenta los años.
        if not (fila.get("fecha_imagen") or "").strip() and "mediana anual" not in (fila.get("fuente_imagen") or ""):
            sin_fecha += 1
        if fila["id"] in estrato:
            pares.append((estrato[fila["id"]], final))
    codigos = [c["codigo"] for c in leyenda]
    conteos = matriz_conteos(pares, codigos)
    por_estrato = {str(c): sum(conteos[i]) for i, c in enumerate(codigos)}
    salida = {
        "mapa": diseno["mapa"], "titulo": diseno["titulo"], "total_puntos": len(filas),
        "interpretados": len(pares), "por_estrato": por_estrato, "valores_no_reconocidos": no_validas[:50],
        "control_calidad": {"sin_evidencia_excluidos": sin_evidencia, "desacuerdos_pendientes": desacuerdo,
                            "revisados_segundo_interprete": revisados,
                            "acuerdo_entre_interpretes_pct": round(acuerdos_qc / revisados * 100, 1) if revisados else None,
                            "puntos_sin_fecha_de_imagen": sin_fecha},
        "actualizado": datetime.now().isoformat(timespec="seconds"),
    }
    areas = {c: float(diseno["areas_ha"][str(c)]) for c in codigos}
    listo = all(sum(conteos[i]) >= MIN_POR_ESTRATO for i, c in enumerate(codigos) if areas[c] > 0)
    if pares and listo:
        resultado = evaluar(codigos, areas, conteos)
        salida["resultado"] = resultado
        cerrados = len(pares) + sin_evidencia
        salida["completo"] = (cerrados == len(filas) and desacuerdo == 0 and revisados >= QC_MINIMO * len(filas))
        salida["estado"] = "completa" if salida["completo"] else "preliminar"
        if sin_evidencia:
            salida["advertencia_sin_evidencia"] = (f"{sin_evidencia} punto(s) excluidos por falta de evidencia; si se concentran "
                                                   "en un estrato pueden sesgar sus exactitudes.")
    else:
        salida["resultado"] = None
        salida["estado"] = "preliminar" if pares else "sin_interpretaciones"
        salida["mensaje"] = f"Se necesitan al menos {MIN_POR_ESTRATO} puntos interpretados en cada estrato para calcular resultados."
    (carpeta / "resultados.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"mapa": diseno["mapa"], "titulo": diseno["titulo"], "descripcion": diseno.get("descripcion"),
            "total_puntos": len(filas), "interpretados": len(pares), "estado": salida.get("estado"), "completo": salida.get("completo", False)}


def main() -> int:
    if not DIR.exists():
        print("No hay muestras de validación en data/validacion/.")
        return 0
    indice = []
    for carpeta in sorted(p for p in DIR.iterdir() if (p / "diseno.json").exists()):
        try:
            indice.append(evaluar_carpeta(carpeta))
            if (carpeta / "fuentes_puntos.csv").exists():  # exactitud de cada fuente (Stehman 2014)
                from exactitud_por_fuente import calcular
                calcular(carpeta)
            print(f"{carpeta.name}: {indice[-1]['interpretados']}/{indice[-1]['total_puntos']} interpretados")
        except Exception as exc:  # una muestra mal formada no impide publicar el sitio
            print(f"{carpeta.name}: ERROR {exc}")
    (DIR / "indice.json").write_text(json.dumps({"mapas": indice}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
