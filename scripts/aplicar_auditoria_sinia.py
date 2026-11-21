"""Aplica la evidencia de la auditoría espacial a data/leyendas_sinia.json.

Regla de verificación (documentada en docs/DICCIONARIO_CAPAS_SINIA.md):

* un código queda ``verificada_espacialmente`` si al menos ``--minimo-puntos``
  puntos muestreados del código caen en el servicio oficial y al menos
  ``--acuerdo`` % de ellos coinciden en la misma categoría oficial;
* la categoría asignada es la mayoritaria publicada por MiAMBIENTE;
* si el servicio devuelve RGB para esa categoría, se adopta como color oficial;
* los códigos que no cumplen la regla conservan su estado anterior. Nunca se
  degrada ni se inventa una categoría.

Uso:
    python scripts/aplicar_auditoria_sinia.py            # muestra cambios
    python scripts/aplicar_auditoria_sinia.py --escribir # actualiza el JSON
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
AUDITORIA = RAIZ / "docs" / "validacion" / "auditoria_assets_sinia.json"
LEYENDAS = RAIZ / "data" / "leyendas_sinia.json"


def _normalizar(texto: str) -> str:
    return " ".join(str(texto).strip().split())


def _hex(rgb: str) -> str | None:
    try:
        r, g, b = (int(float(x)) for x in rgb.split(","))
        return f"#{r:02X}{g:02X}{b:02X}"
    except (ValueError, TypeError):
        return None


def aplicar(auditoria: dict, leyendas: dict, acuerdo: float, minimo: int) -> list[str]:
    cambios: list[str] = []
    for clave, res in auditoria.get("assets", {}).items():
        corr = res.get("correspondencia_rest")
        if not isinstance(corr, dict) or "por_codigo" not in corr:
            continue
        colores = corr.get("colores_servicio", {})
        filas = {f["codigo"]: f for f in leyendas["leyendas"].get(clave, [])}
        for codigo_txt, ev in corr["por_codigo"].items():
            codigo = int(codigo_txt)
            fila = filas.get(codigo)
            nombre = ev.get("categoria_mayoritaria")
            validos = sum(n for k, n in ev.get("distribucion", {}).items() if k != "None" and not k.startswith("ERROR"))
            if fila is None:
                cambios.append(f"{clave} código {codigo}: presente en el asset y ausente de la leyenda (revisar).")
                continue
            if not nombre or validos < minimo or ev.get("acuerdo_pct", 0) < acuerdo:
                cambios.append(f"{clave} código {codigo}: sin evidencia suficiente ({validos} puntos, {ev.get('acuerdo_pct')} % → «{nombre}»); se conserva «{fila['categoria']}».")
                continue
            nuevo = _normalizar(nombre)
            previo = fila["categoria"]
            fila.update({
                "categoria": nuevo,
                "estado": "verificada_espacialmente",
                "fuente_correspondencia": f"Muestreo espacial vs servicio REST MiAMBIENTE capa {corr['capa_rest']['id']} · {ev['acuerdo_pct']} % de {validos} puntos ({auditoria.get('fecha')})",
                "evidencia": {"puntos": validos, "acuerdo_pct": ev["acuerdo_pct"], "distribucion": ev.get("distribucion"),
                              "valor_pixel_servicio": ev.get("valor_servicio") or None},
            })
            if fila.get("grupo_derivado") == "no_identificado" and fila.get("candidato_leyenda_oficial") and _normalizar(fila["candidato_leyenda_oficial"]).lower() == nuevo.lower():
                cambios.append(f"{clave} código {codigo}: coincide con el candidato de la leyenda oficial; revisar grupo derivado.")
            color = _hex(colores.get(nombre, ""))
            if color:
                fila["color"] = color
                fila["fuente_color"] = f"MiAMBIENTE · atributos RGB del servicio REST capa {corr['capa_rest']['id']}"
            if previo != nuevo:
                cambios.append(f"{clave} código {codigo}: «{previo}» → «{nuevo}» ({ev['acuerdo_pct']} %).")
            if fila.get("candidato_leyenda_oficial") and _normalizar(fila["candidato_leyenda_oficial"]).lower() != nuevo.lower():
                cambios.append(f"{clave} código {codigo}: ATENCIÓN, difiere del candidato por orden de leyenda «{fila['candidato_leyenda_oficial']}».")
    return cambios


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--acuerdo", type=float, default=80.0)
    parser.add_argument("--minimo-puntos", type=int, default=5)
    parser.add_argument("--escribir", action="store_true")
    args = parser.parse_args()
    auditoria = json.loads(AUDITORIA.read_text(encoding="utf-8"))
    leyendas = json.loads(LEYENDAS.read_text(encoding="utf-8"))
    cambios = aplicar(auditoria, leyendas, args.acuerdo, args.minimo_puntos)
    print("\n".join(cambios) or "Sin cambios.")
    if args.escribir:
        leyendas["auditoria_aplicada"] = {"fecha": auditoria.get("fecha"), "acuerdo_minimo_pct": args.acuerdo, "minimo_puntos": args.minimo_puntos}
        LEYENDAS.write_text(json.dumps(leyendas, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Actualizado {LEYENDAS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
