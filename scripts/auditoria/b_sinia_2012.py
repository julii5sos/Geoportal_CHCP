"""Auditoría B (fase de gabinete): discrepancias del ráster SINIA 2012 frente al servicio oficial.

    python scripts/auditoria/b_sinia_2012.py

Usa la evidencia ya registrada en ``docs/validacion/auditoria_assets_sinia.json`` (muestreo de
10 puntos por código contra ``Nodo_Suelos/MapServer/2``) y la leyenda del proyecto. Construye la
matriz de correspondencia código del asset × valor del servicio, prueba la hipótesis de
recodificación sistemática y la de efecto de escala/bordes, y escribe
``docs/auditoria/datos/B_correspondencia_2012.csv`` y ``B_resumen.json``. No modifica leyendas.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts" / "auditoria"))

from a_saturacion import spearman  # noqa: E402

SALIDA = RAIZ / "docs" / "auditoria" / "datos"
UMBRAL = 80.0


def main() -> int:
    auditoria = json.loads((RAIZ / "docs/validacion/auditoria_assets_sinia.json").read_text(encoding="utf-8"))
    a = auditoria["assets"]["2012_detallado"]
    leyenda = {str(x["codigo"]): x for x in json.loads((RAIZ / "data/leyendas_sinia.json").read_text(encoding="utf-8"))["leyendas"]["2012_detallado"]}
    from chcp.catalogos.reclasificacion_sinia import codigos_forestales
    try:
        forestales = {str(c) for c in codigos_forestales("2012_detallado")}
    except Exception:  # noqa: BLE001
        forestales = set()
    area = {str(h["codigo"]): h["sum"] for h in a["inventario_chcp"]["histograma_ha"]}
    por_codigo = a["correspondencia_rest"]["por_codigo"]
    valores_servicio = sorted({int(v) for c in por_codigo.values() for v in (c.get("valor_servicio") or {})})
    filas, clases = [], {}
    for codigo, c in sorted(por_codigo.items(), key=lambda x: int(x[0])):
        vs = {str(k): v for k, v in (c.get("valor_servicio") or {}).items()}
        n = sum(vs.values())
        propio = vs.get(codigo, 0) / n * 100 if n else 0
        dominante, n_dom = max(vs.items(), key=lambda x: x[1]) if vs else (None, 0)
        if propio >= UMBRAL:
            clase = "coincide"
        elif dominante != codigo and n and n_dom / n * 100 >= UMBRAL:
            clase = "recodificacion_candidata"
        elif n:
            clase = "dispersa"
        else:
            clase = "sin_evidencia"
        clases[codigo] = clase
        filas.append({"codigo": int(codigo), "categoria_proyecto": leyenda.get(codigo, {}).get("categoria"),
                      "estado_leyenda": leyenda.get(codigo, {}).get("estado"), "area_chcp_ha": round(area.get(codigo, 0), 1),
                      "puntos": n, "acuerdo_mismo_codigo_pct": round(propio, 1), "valor_servicio_dominante": dominante,
                      "acuerdo_dominante_pct": round(n_dom / n * 100, 1) if n else None,
                      "n_valores_servicio_distintos": len(vs), "en_mascara_forestal": codigo in forestales,
                      "diagnostico": clase, **{f"servicio_{v}": vs.get(str(v), 0) for v in valores_servicio}})
    SALIDA.mkdir(parents=True, exist_ok=True)
    with (SALIDA / "B_correspondencia_2012.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)
    coinc = [r for r in filas if r["diagnostico"] == "coincide"]
    otros = [r for r in filas if r["diagnostico"] != "coincide"]
    med = lambda xs: sorted(xs)[len(xs) // 2] if xs else None  # noqa: E731
    resumen = {
        "asset": a["asset_id"], "puntos_por_codigo": auditoria["puntos_por_codigo"], "fecha_muestreo": auditoria["fecha"],
        "codigos_en_chcp": len(filas),
        "diagnostico": {k: sum(1 for v in clases.values() if v == k) for k in ("coincide", "recodificacion_candidata", "dispersa", "sin_evidencia")},
        "recodificacion_candidata": [{"codigo": r["codigo"], "valor_servicio": r["valor_servicio_dominante"], "pct": r["acuerdo_dominante_pct"]} for r in filas if r["diagnostico"] == "recodificacion_candidata"],
        "area_mediana_ha": {"coinciden": med([r["area_chcp_ha"] for r in coinc]), "no_coinciden": med([r["area_chcp_ha"] for r in otros])},
        "area_total_ha": {"coinciden": round(sum(r["area_chcp_ha"] for r in coinc), 1), "no_coinciden": round(sum(r["area_chcp_ha"] for r in otros), 1)},
        "spearman_area_acuerdo": spearman([r["area_chcp_ha"] for r in filas], [r["acuerdo_mismo_codigo_pct"] for r in filas]),
        "codigos_no_verificados_en_mascara_forestal": [r["codigo"] for r in otros if r["en_mascara_forestal"]],
        "nota": "10 puntos aleatorios por código sin control de bordes: evidencia insuficiente para declarar una "
                "correspondencia nacional; ver scripts/auditoria/b_sinia_2012_controlado.py.",
    }
    (SALIDA / "B_resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(resumen, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
