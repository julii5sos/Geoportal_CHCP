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


def leer_referencia(valor: str, leyenda: list[dict]) -> int | None:
    valor = (valor or "").strip().lower()
    if not valor:
        return None
    for c in leyenda:
        if valor in (str(c["codigo"]), c["clave"].lower(), c["etiqueta"].lower()):
            return c["codigo"]
    return None


def evaluar_carpeta(carpeta: Path) -> dict:
    diseno = json.loads((carpeta / "diseno.json").read_text(encoding="utf-8"))
    leyenda = diseno["leyenda"]
    with (carpeta / "estratos.csv").open(encoding="utf-8") as f:
        estrato = {fila["id"]: int(fila["clase_mapa"]) for fila in csv.DictReader(f)}
    with (carpeta / "muestra.csv").open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    pares, no_validas = [], []
    for fila in filas:
        ref = leer_referencia(fila.get("clase_referencia", ""), leyenda)
        if (fila.get("clase_referencia") or "").strip() and ref is None:
            no_validas.append(fila["id"])
        if ref is not None and fila["id"] in estrato:
            pares.append((estrato[fila["id"]], ref))
    codigos = [c["codigo"] for c in leyenda]
    conteos = matriz_conteos(pares, codigos)
    por_estrato = {str(c): sum(conteos[i]) for i, c in enumerate(codigos)}
    salida = {
        "mapa": diseno["mapa"], "titulo": diseno["titulo"], "total_puntos": len(filas),
        "interpretados": len(pares), "por_estrato": por_estrato, "valores_no_reconocidos": no_validas[:50],
        "actualizado": datetime.now().isoformat(timespec="seconds"),
    }
    areas = {c: float(diseno["areas_ha"][str(c)]) for c in codigos}
    listo = all(sum(conteos[i]) >= MIN_POR_ESTRATO for i, c in enumerate(codigos) if areas[c] > 0)
    if pares and listo:
        resultado = evaluar(codigos, areas, conteos)
        salida["resultado"] = resultado
        salida["completo"] = len(pares) == len(filas)
    else:
        salida["resultado"] = None
        salida["mensaje"] = f"Se necesitan al menos {MIN_POR_ESTRATO} puntos interpretados en cada estrato para calcular resultados."
    (carpeta / "resultados.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"mapa": diseno["mapa"], "titulo": diseno["titulo"], "descripcion": diseno.get("descripcion"),
            "total_puntos": len(filas), "interpretados": len(pares)}


def main() -> int:
    if not DIR.exists():
        print("No hay muestras de validación en data/validacion/.")
        return 0
    indice = []
    for carpeta in sorted(p for p in DIR.iterdir() if (p / "diseno.json").exists()):
        try:
            indice.append(evaluar_carpeta(carpeta))
            print(f"{carpeta.name}: {indice[-1]['interpretados']}/{indice[-1]['total_puntos']} interpretados")
        except Exception as exc:  # una muestra mal formada no impide publicar el sitio
            print(f"{carpeta.name}: ERROR {exc}")
    (DIR / "indice.json").write_text(json.dumps({"mapas": indice}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
