"""Auditoría A: saturación del índice MT-2026.7 en subcuencas (reproducible, sin Earth Engine).

    python scripts/auditoria/a_saturacion.py

Lee ``data/estadisticas_territoriales.json`` (resultados de Earth Engine ya publicados) y
escribe ``docs/auditoria/datos/A_tabla_territorios.csv`` y ``A_resumen.json``.
No modifica la metodología ni los datos.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ))

from chcp.nucleo import indicadores_relativos as IR  # noqa: E402
from chcp.nucleo import metodologia_indice as MI  # noqa: E402

SALIDA = RAIZ / "docs" / "auditoria" / "datos"


def rangos(valores):
    orden = sorted(range(len(valores)), key=lambda i: valores[i])
    r = [0.0] * len(valores)
    i = 0
    while i < len(orden):
        j = i
        while j + 1 < len(orden) and valores[orden[j + 1]] == valores[orden[i]]:
            j += 1
        for k in range(i, j + 1):
            r[orden[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(x, y):
    pares = [(a, b) for a, b in zip(x, y) if a is not None and b is not None]
    if len(pares) < 3:
        return None
    rx, ry = rangos([p[0] for p in pares]), rangos([p[1] for p in pares])
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return round(num / den, 3) if den else None


def entropia_normalizada(conteo: Counter) -> float:
    n = sum(conteo.values())
    h = -sum(c / n * math.log(c / n) for c in conteo.values() if c)
    return round(h / math.log(len(conteo)) if len(conteo) > 1 else 0.0, 3)


def puntaje_con_umbrales(t, factor_absoluto: float = 1.0, sin_absolutos: bool = False):
    """Recalcula TMF, Hansen y ESRI con umbrales absolutos escalados (GEDI y NDVI se conservan)."""
    U = MI.UMBRALES_INDICE
    area = t["area_ha"]
    j = t["jrc_ha"]
    d, g = j["tmf_deforestacion"] or 0, j["tmf_degradacion"] or 0
    pct = lambda v: v / area * 100  # noqa: E731
    absd = (not sin_absolutos) and d >= U["jrc_deforestacion_ha"] * factor_absoluto
    absg = (not sin_absolutos) and g >= U["jrc_degradacion_ha"] * factor_absoluto
    tmf = absd or absg or pct(d) >= U["jrc_deforestacion_pct"] or pct(g) >= U["jrc_degradacion_pct"]
    hansen = (not sin_absolutos) and (t["hansen_post_2020_ha"] or 0) >= U["hansen_post_2020_ha"] * factor_absoluto
    s = t["esri"]["esri_salida"] or 0
    esri = (sin_absolutos or s >= U["esri_salida_arboles_ha"] * factor_absoluto) and pct(s) >= U["esri_salida_arboles_pct"]
    sen = t["preevaluacion"]["senales"]
    _, p, cat = MI.calcular_indice_prioridad(senal_tmf=tmf, senal_hansen=hansen, senal_esri=esri, senal_gedi=sen["gedi"], senal_ndvi=sen["ndvi"])
    return p, cat


def escenario_sintetico():
    """Mismas proporciones de cambio en áreas de distinto tamaño."""
    filas = []
    for area in (1, 5, 25, 100, 500, 2_000, 10_000, 50_000, 300_000):
        m = dict(tmf_deforestacion_ha=area * 0.0005, tmf_deforestacion_pct=0.05, tmf_degradacion_ha=area * 0.002,
                 tmf_degradacion_pct=0.2, hansen_post_2020_ha=area * 0.0002, esri_salida_arboles_ha=area * 0.01,
                 esri_salida_arboles_pct=1.0, gedi_altura_media_m=20, gedi_cobertura_valida_pct=80, linea_base_arborea_pct=60,
                 ndvi_disminucion_ha=area * 0.005, ndvi_disminucion_pct=0.5, ndvi_cobertura_valida_pct=90)
        s, _ = MI.evaluar_senales(**m)
        _, p, cat = MI.calcular_indice_prioridad(senal_tmf=s["tmf"], senal_hansen=s["hansen"], senal_esri=s["esri"], senal_gedi=s["gedi"], senal_ndvi=s["ndvi"])
        filas.append({"area_ha": area, "senales": [k for k, v in s.items() if v], "puntaje": p, "categoria": cat})
    return filas


def main() -> int:
    datos = json.loads((RAIZ / "data" / "estadisticas_territoriales.json").read_text(encoding="utf-8"))
    ter = datos["territorios"]
    cuenca = ter.get("chcp")
    subs = [t for k, t in ter.items() if k != "chcp"]
    SALIDA.mkdir(parents=True, exist_ok=True)

    filas = []
    for t in sorted(ter.values(), key=lambda x: x["area_ha"]):
        p = t["preevaluacion"]
        mot = IR.motivos_activacion(t)
        rel = IR.calcular(t)
        area = t["area_ha"]
        filas.append({
            "id": t["id"], "nombre": t["nombre"], "area_ha": round(area, 1),
            "bosque_sinia_2021_ha": round(IR.bosque_referencia_ha(t) or 0, 1),
            "jrc_deforestado_ha": round(t["jrc_ha"]["tmf_deforestacion"], 2),
            "jrc_deforestado_pct": round(t["jrc_ha"]["tmf_deforestacion"] / area * 100, 3),
            "jrc_degradado_ha": round(t["jrc_ha"]["tmf_degradacion"], 2),
            "jrc_degradado_pct": round(t["jrc_ha"]["tmf_degradacion"] / area * 100, 3),
            "hansen_2021_2025_ha": round(t["hansen_post_2020_ha"] or 0, 2),
            "esri_salida_ha": round(t["esri"]["esri_salida"] or 0, 2),
            "esri_salida_pct_aoi": round((t["esri"]["esri_salida"] or 0) / area * 100, 3),
            "ndvi_descenso_ha": round(t["ndvi"]["ndvi_disminucion"] or 0, 2),
            "gedi_altura_m": None if t.get("gedi_altura_m") is None else round(t["gedi_altura_m"], 2),
            "cobertura_valida_ndvi_gedi": "no publicada en v1 (se agrega en metricas_indice)",
            "senales": "+".join(k for k, v in p["senales"].items() if v),
            "tmf_motivo": ",".join(k for k, v in mot["tmf"]["reglas"].items() if v) or "-",
            "tmf_solo_absoluta": mot["tmf"]["solo_absoluta"],
            "hansen_activada": mot["hansen"]["reglas"]["perdida_ha"],
            "fraccion_que_activa_tmf_pct": round(mot["fraccion_minima_tmf_pct"], 4),
            "fraccion_que_activa_hansen_pct": round(mot["hansen"]["fraccion_umbral_pct"], 5),
            "puntaje": p["puntaje"], "categoria": p["prioridad"],
            **{f"exp_{k}": None if v is None else round(v, 4) for k, v in rel.items()},
        })
    with (SALIDA / "A_tabla_territorios.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0]))
        w.writeheader()
        w.writerows(filas)

    puntajes = [t["preevaluacion"]["puntaje"] for t in subs]
    areas = [t["area_ha"] for t in subs]
    rel = {k: [IR.calcular(t)[k] for t in subs] for k in IR.INDICADORES}
    cats = Counter(t["preevaluacion"]["prioridad"] for t in subs)
    sens = {}
    for f in (1, 2, 5, 10, 50, 100):
        c = Counter(puntaje_con_umbrales(t, f)[1] for t in subs)
        sens[f"absolutos_x{f}"] = dict(c)
    sens["sin_criterios_absolutos"] = dict(Counter(puntaje_con_umbrales(t, sin_absolutos=True)[1] for t in subs))
    base = [puntaje_con_umbrales(t)[0] for t in subs]
    x10 = [puntaje_con_umbrales(t, 10)[0] for t in subs]
    motivos = Counter()
    for t in subs:
        m = IR.motivos_activacion(t)
        if t["preevaluacion"]["senales"]["tmf"]:
            motivos["tmf_solo_por_umbral_absoluto" if m["tmf"]["solo_absoluta"] else "tmf_con_criterio_relativo"] += 1
    resumen = {
        "fuente": "data/estadisticas_territoriales.json", "generado_datos": datos.get("generado"),
        "n_subcuencas": len(subs),
        "categorias_subcuencas": dict(cats),
        "categorias_todos_54": dict(Counter(t["preevaluacion"]["prioridad"] for t in ter.values())),
        "puntajes_distintos": sorted(Counter(puntajes).items()),
        "entropia_categorias_normalizada": entropia_normalizada(cats),
        "frecuencia_senales": {k: sum(t["preevaluacion"]["senales"][k] for t in subs) for k in ("tmf", "hansen", "esri", "gedi", "ndvi")},
        "motivo_tmf": dict(motivos),
        "spearman_area_puntaje": spearman(areas, puntajes),
        "sensibilidad_umbrales_absolutos": sens,
        "spearman_puntaje_base_vs_absolutos_x10": spearman(base, x10),
        "escenario_sintetico_mismas_proporciones": escenario_sintetico(),
        "variante_experimental": {
            "version": IR.VERSION,
            "spearman_con_area": {k: spearman(areas, v) for k, v in rel.items()},
            "spearman_con_puntaje_original": {k: spearman(puntajes, v) for k, v in rel.items()},
            "redundancia_spearman": {f"{a}~{b}": spearman(rel[a], rel[b]) for i, a in enumerate(rel) for b in list(rel)[i + 1:]},
            "valores_cuenca": IR.calcular(cuenca) if cuenca else None,
            "distintos_valores": {k: len({round(x, 4) for x in v if x is not None}) for k, v in rel.items()},
            "por_encima_de_la_cuenca": {k: sum(1 for x in v if x is not None and cuenca and IR.calcular(cuenca)[k] and x > IR.calcular(cuenca)[k]) for k, v in rel.items()},
            "sensibilidad_denominador_spearman": spearman(
                rel["perdida_reciente_pct_anual"],
                [IR._div(t["hansen_post_2020_ha"], (t["esri"]["esri_salida"] or 0) + (t["esri"]["esri_estable"] or 0)) for t in subs]),
        },
    }
    (SALIDA / "A_resumen.json").write_text(json.dumps(resumen, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: resumen[k] for k in ("categorias_subcuencas", "frecuencia_senales", "motivo_tmf", "spearman_area_puntaje")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
