"""Auditoría de los datos publicados del Panel (data/estadisticas_territoriales.json).

No usa Earth Engine: revisa lo que ya está calculado y guardado.

  1. Completitud: los 54 territorios (CHCP + 53 subcuencas), versión de datos y metodología
     vigentes, campos esperados, geometrías y mapas en disco.
  2. Metodología MT-2026.7: recalcula las señales, el puntaje y la prioridad con
     chcp/nucleo/metodologia_indice.py a partir de las métricas guardadas
     (metricas_indice), y la prioridad de visita a partir del contexto de corredores.
  3. Rangos y unidades: superficies, porcentajes, NDVI, GEDI, ERI, IIC, dIIC.
  4. Coherencia interna: suma de subcuencas frente a la cuenca, clases JRC frente al área,
     valores repetidos en dos lugares del registro.
  5. Mapas: capas generadas, errores, mapas ERI pendientes, sitios de verificación.
  6. Complementos: comparación del bosque oficial 2021 y 2023 (data/coberturas/comparacion),
     mapas ERI provisionales y evaluación de exactitud (data/validacion).

Uso: python scripts/auditar_datos.py [--json salida.json] [--markdown informe.md]
Sale con código 1 si hay hallazgos de severidad «error».
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from chcp.nucleo.metodologia_indice import (  # noqa: E402
    METODOLOGIA_VERSION, PUNTAJE_MAXIMO, calcular_indice_prioridad, calcular_prioridad_visita,
    evaluar_senales,
)
from chcp.territorio.territorio_local import coleccion_subcuencas  # noqa: E402

DATOS = RAIZ / "data" / "estadisticas_territoriales.json"
DIR_MAPAS = RAIZ / "data" / "mapas"
DIR_GEO = RAIZ / "data" / "subcuencas"
CAMPOS = ("preevaluacion", "metricas_indice", "jrc_ha", "hansen_post_2020_ha", "esri", "ndvi", "sinia",
          "corredores", "eri", "mapas", "riparia", "serie_anual")


class Auditoria:
    def __init__(self):
        self.hallazgos: list[dict] = []
        self.revisiones = Counter()

    def revisar(self, tema: str, ok: bool, territorio: str, detalle: str, severidad: str = "error"):
        self.revisiones[tema] += 1
        if not ok:
            self.hallazgos.append({"tema": tema, "territorio": territorio, "severidad": severidad, "detalle": detalle})


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v))


def _entre(v, a, b) -> bool:
    return _num(v) and a <= v <= b


def auditar(datos: dict) -> Auditoria:
    au = Auditoria()
    T = datos.get("territorios") or {}
    version = datos.get("version_datos")
    ids_esperados = {"chcp"} | {f["properties"]["id"] for f in coleccion_subcuencas()["features"]}

    # ---------------------------------------------------------------- 1. completitud
    au.revisar("completitud", set(T) == ids_esperados, "—",
               f"faltan {sorted(ids_esperados - set(T))}; sobran {sorted(set(T) - ids_esperados)}")
    au.revisar("completitud", not datos.get("errores"), "—", f"errores registrados: {datos.get('errores')}")
    for ident, t in T.items():
        au.revisar("completitud", t.get("version_datos") == version, ident,
                   f"version_datos {t.get('version_datos')} ≠ {version} (pendiente o con error)")
        faltan = [c for c in CAMPOS if t.get(c) in (None, {}, [])]
        au.revisar("completitud", not faltan, ident, f"campos vacíos: {faltan}")
        if ident != "chcp":
            au.revisar("completitud", bool(t.get("estructura_2021")), ident, "sin estructura 2021 (fragmentación y red)")
            au.revisar("completitud", (DIR_GEO / f"{ident}.json").exists(), ident, "sin geometrías de parches (data/subcuencas)")
            au.revisar("completitud", bool(t.get("sitios")), ident, "sin sitios de verificación", "aviso")
    au.revisar("completitud", datos.get("metodologia") == METODOLOGIA_VERSION, "—",
               f"metodología {datos.get('metodologia')} ≠ {METODOLOGIA_VERSION}")

    # ---------------------------------------------------------------- 2. metodología
    for ident, t in T.items():
        m, p = t.get("metricas_indice") or {}, t.get("preevaluacion") or {}
        if not m or not p:
            continue
        senales, _ = evaluar_senales(
            tmf_deforestacion_ha=m["tmf_deforestacion"], tmf_deforestacion_pct=m["pct_tmf_defor"],
            tmf_degradacion_ha=m["tmf_degradacion"], tmf_degradacion_pct=m["pct_tmf_degrad"],
            hansen_post_2020_ha=m["hansen_post"],
            esri_salida_arboles_ha=m["esri_salida"], esri_salida_arboles_pct=m["pct_esri_salida"],
            gedi_altura_media_m=m.get("gedi_altura") if _num(m.get("gedi_altura")) else 999.0,
            gedi_cobertura_valida_pct=m.get("gedi_cobertura_pct") or 0.0,
            linea_base_arborea_pct=m.get("pct_linea_base") or 0.0,
            ndvi_disminucion_ha=m.get("ndvi_disminucion") or 0.0,
            ndvi_disminucion_pct=m.get("pct_ndvi_disminucion") or 0.0,
            ndvi_cobertura_valida_pct=m.get("ndvi_cobertura_pct") or 0.0,
        )
        au.revisar("metodologia", senales == p.get("senales"), ident,
                   f"señales recalculadas {senales} ≠ guardadas {p.get('senales')}")
        aportes, puntaje, prioridad = calcular_indice_prioridad(
            senal_tmf=senales["tmf"], senal_hansen=senales["hansen"], senal_esri=senales["esri"],
            senal_gedi=senales["gedi"], senal_ndvi=senales["ndvi"])
        au.revisar("metodologia", math.isclose(puntaje, p.get("puntaje", -1), abs_tol=1e-6), ident,
                   f"puntaje recalculado {puntaje} ≠ guardado {p.get('puntaje')}")
        au.revisar("metodologia", prioridad == p.get("prioridad"), ident,
                   f"prioridad recalculada {prioridad} ≠ guardada {p.get('prioridad')}")
        au.revisar("metodologia", p.get("puntaje_maximo") == PUNTAJE_MAXIMO, ident,
                   f"puntaje máximo {p.get('puntaje_maximo')} ≠ {PUNTAJE_MAXIMO}")
        c = t.get("corredores") or {}
        pct = c.get("porcentaje") or 0.0
        visita = calcular_prioridad_visita(puntaje_cambios=puntaje, contexto_corredores={
            "intersecta": pct > 0, "porcentaje_aoi_en_corredores": pct,
            "intersecta_mesoamericano": bool(c.get("intersecta_mesoamericano"))})
        au.revisar("metodologia", visita["prioridad_visita"] == p.get("prioridad_visita"), ident,
                   f"prioridad de visita recalculada {visita['prioridad_visita']} ≠ guardada {p.get('prioridad_visita')}")
        au.revisar("metodologia", math.isclose(visita["puntaje_integrado"], p.get("puntaje_visita", -1), abs_tol=0.011), ident,
                   f"puntaje de visita recalculado {visita['puntaje_integrado']} ≠ guardado {p.get('puntaje_visita')}")

    # ---------------------------------------------------------------- 3. rangos
    for ident, t in T.items():
        a = t.get("area_ha")
        au.revisar("rangos", _num(a) and a > 0, ident, f"área no válida: {a}")
        if not _num(a) or a <= 0:
            continue
        m = t.get("metricas_indice") or {}
        for k in ("pct_tmf_defor", "pct_tmf_degrad", "pct_tmf_recuperacion", "pct_esri_salida", "pct_esri_ganancia",
                  "pct_linea_base", "pct_ndvi_disminucion", "ndvi_cobertura_pct", "gedi_cobertura_pct"):
            if k in m:
                au.revisar("rangos", _entre(m[k], 0, 100.0001), ident, f"{k} = {m[k]} fuera de 0–100")
        au.revisar("rangos", _entre(t.get("hansen_post_2020_ha"), 0, a), ident,
                   f"pérdida Hansen 2021–2025 {t.get('hansen_post_2020_ha')} fuera de 0–área")
        n = t.get("ndvi") or {}
        for k in ("ndvi_inicial_medio", "ndvi_final_medio"):
            au.revisar("rangos", _entre(n.get(k), -1, 1), ident, f"{k} = {n.get(k)} fuera de −1–1")
        g = t.get("gedi_altura_m")
        au.revisar("rangos", g is None or _entre(g, 0, 60), ident, f"altura GEDI {g} m fuera de 0–60", "aviso")
        e = t.get("eri") or {}
        au.revisar("rangos", e.get("valor") is None or _entre(e.get("valor"), 0, 1), ident, f"ERI {e.get('valor')} fuera de 0–1")
        for s in t.get("sinia") or []:
            au.revisar("rangos", _entre(s.get("forest_pct"), 0, 100.0001), ident, f"bosque SINIA {s.get('year')} = {s.get('forest_pct')} %")
        cor = t.get("corredores") or {}
        au.revisar("rangos", _entre(cor.get("porcentaje", 0), 0, 100.0001), ident, f"% en corredores {cor.get('porcentaje')}")
        for f in (t.get("riparia") or {}).get("franjas") or []:
            au.revisar("rangos", _entre(f.get("bosque_sinia_pct"), 0, 100.0001), ident, f"franja {f.get('ancho_m')} m: bosque {f.get('bosque_sinia_pct')} %")
        est = t.get("estructura_2021") or {}
        mp = est.get("metricas_paisaje") or {}
        if mp:
            au.revisar("rangos", mp.get("iic") is None or _entre(mp["iic"], 0, 1), ident, f"IIC {mp.get('iic')} fuera de 0–1")
            au.revisar("rangos", mp.get("cohesion") is None or _entre(mp["cohesion"], 0, 100), ident, f"cohesión {mp.get('cohesion')}")
            for d in mp.get("diic_principales") or []:
                au.revisar("rangos", _entre(d.get("diic_pct"), 0, 100.0001), ident, f"dIIC parche {d.get('parche_id')} = {d.get('diic_pct')}")

    # ---------------------------------------------------------------- 4. coherencia
    subs = [t for k, t in T.items() if k != "chcp"]
    if "chcp" in T and subs:
        suma, cuenca = sum(t["area_ha"] for t in subs), T["chcp"]["area_ha"]
        au.revisar("coherencia", abs(suma - cuenca) / cuenca < 0.02, "chcp",
                   f"suma de subcuencas {suma:,.0f} ha frente a cuenca {cuenca:,.0f} ha ({(suma / cuenca - 1) * 100:+.2f} %)", "aviso")
    for ident, t in T.items():
        a, m, j = t.get("area_ha") or 0, t.get("metricas_indice") or {}, t.get("jrc_ha") or {}
        if not a:
            continue
        au.revisar("coherencia", math.isclose(m.get("area_ha", a), a, rel_tol=0.01), ident,
                   f"área de metricas_indice {m.get('area_ha')} ≠ área {a}")
        if j:
            tot = sum(v for v in j.values() if _num(v))
            au.revisar("coherencia", abs(tot - a) / a < 0.03, ident,
                       f"clases JRC suman {tot:,.1f} ha frente a {a:,.1f} ha ({(tot / a - 1) * 100:+.1f} %)", "aviso")
            for k in ("tmf_estable", "tmf_degradacion", "tmf_deforestacion"):
                if k in m and k in j:
                    au.revisar("coherencia", math.isclose(m[k], j[k], rel_tol=1e-3, abs_tol=0.01), ident,
                               f"{k}: metricas_indice {m[k]} ≠ jrc_ha {j[k]}")
        if "hansen_post" in m:
            au.revisar("coherencia", math.isclose(m["hansen_post"], t.get("hansen_post_2020_ha") or 0, rel_tol=1e-3, abs_tol=0.01), ident,
                       f"Hansen: metricas_indice {m['hansen_post']} ≠ hansen_post_2020_ha {t.get('hansen_post_2020_ha')}")

    # ---------------------------------------------------------------- 5. mapas
    for ident, t in T.items():
        mp = t.get("mapas") or {}
        for clave, error in (mp.get("errores") or {}).items():
            au.revisar("mapas", False, ident, f"mapa {clave}: {str(error)[:120]}", "aviso")
        if mp.get("eri_pendiente"):
            au.revisar("mapas", False, ident, "imagen del mapa ERI pendiente (modo «solo-mapa-eri»)", "aviso")
        for clave in mp.get("capas") or []:
            au.revisar("mapas", (DIR_MAPAS / ident / f"{clave}.png").exists(), ident, f"falta el archivo {clave}.png")
        if (t.get("riparia") or {}).get("error"):
            au.revisar("mapas", False, ident, f"riparia: {t['riparia']['error'][:120]}", "aviso")
    entorno = DIR_MAPAS / "entorno" / "meta.json"
    au.revisar("mapas", entorno.exists(), "entorno", "falta data/mapas/entorno/meta.json (rutas del simulador)", "aviso")
    if entorno.exists():
        meta = json.loads(entorno.read_text(encoding="utf-8"))
        au.revisar("mapas", meta.get("margen_m", 0) >= 25_000, "entorno",
                   f"entorno a {meta.get('margen_m', 0) / 1000:.0f} km; el tramo oeste necesita 25 km (modo «solo-entorno»)", "aviso")
    # ---------------------------------------------------------------- 6. complementos
    dir_cmp = RAIZ / "data" / "coberturas" / "comparacion"
    dir_est = RAIZ / "data" / "coberturas" / "estadisticas"
    for ident in T:
        ruta = dir_cmp / f"{ident}.json"
        au.revisar("complementos", ruta.exists(), ident, "sin comparación del bosque oficial 2021 y 2023")
        if not ruta.exists():
            continue
        c = json.loads(ruta.read_text(encoding="utf-8"))
        est = json.loads((dir_est / f"{ident}.json").read_text(encoding="utf-8")) if (dir_est / f"{ident}.json").exists() else {}
        for anio, prod in (("2021", "2021_general"), ("2023", "2023_general")):
            a = c.get("anios", {}).get(anio, {})
            nativo = next((x["area_ha"] for x in est.get(prod, {}).get("classes", []) if x["code"] == 1), None)
            au.revisar("complementos", nativo is not None and _num(a.get("bosque_ha")) and abs(a["bosque_ha"] - nativo) <= 0.1,
                       ident, f"bosque {anio} de la comparación {a.get('bosque_ha')} ≠ estadística oficial {nativo}")
            au.revisar("complementos", _num(a.get("numero_parches")) and a["numero_parches"] >= 0
                       and _entre(a.get("pct_bosque_red_mayor"), 0, 100.0001), ident, f"métricas de parches {anio} fuera de rango")
        cam = c.get("cambio") or {}
        au.revisar("complementos", all(_num(cam.get(k)) and cam[k] >= 0 for k in ("en_ambos_ha", "solo_2021_ha", "solo_2023_ha")),
                   ident, f"superficies del mapa de diferencias inválidas: {cam}")
        au.revisar("complementos", (RAIZ / "data" / "coberturas" / "mapas" / ident / "bosque_2021_2023.v.png").exists(),
                   ident, "sin mapa de diferencias 2021–2023")
    provisionales = sorted(i for i, t in T.items() if (t.get("mapas") or {}).get("eri_origen") == "cuenca")
    au.revisar("complementos", not provisionales, "—",
               f"{len(provisionales)} subcuencas con mapa ERI provisional (recorte del ERI de la cuenca); "
               "se reemplazan con el modo «solo-mapa-eri»", "aviso")
    val = RAIZ / "data" / "validacion" / "senal_perdida" / "resultados.json"
    au.revisar("complementos", val.exists(), "—", "sin resultados de la evaluación de exactitud")
    if val.exists():
        v = json.loads(val.read_text(encoding="utf-8"))
        r = v.get("resultado") or {}
        au.revisar("complementos", _entre(r.get("exactitud_global"), 0, 1), "—", "exactitud global fuera de 0–1")
        cc = v.get("control_calidad") or {}
        au.revisar("complementos", (cc.get("revisados_segundo_interprete") or 0) > 0, "—",
                   "evaluación de exactitud preliminar: ningún punto revisado por un segundo intérprete", "aviso")
    return au


TEMAS = {
    "completitud": "Están los 54 territorios, con la versión de datos vigente, todos los campos, geometrías y mapas.",
    "metodologia": "Señales, puntaje, prioridad y prioridad de visita recalculados con MT-2026.7 a partir de las métricas guardadas.",
    "rangos": "Superficies, porcentajes, NDVI, GEDI, ERI e índices de conectividad dentro de valores posibles.",
    "coherencia": "Las subcuencas suman la cuenca, las clases suman el área y los valores repetidos coinciden.",
    "mapas": "Cada territorio tiene sus capas y sitios de verificación, sin errores de generación.",
    "complementos": "Comparación 2021–2023, mapas ERI provisionales y evaluación de exactitud.",
}

NOMBRES = {"completitud": "Completitud", "metodologia": "Metodología", "rangos": "Rangos", "coherencia": "Coherencia",
           "mapas": "Mapas", "complementos": "Complementos"}


def informe_markdown(au: Auditoria, datos: dict) -> str:
    T = datos.get("territorios") or {}
    errores = [h for h in au.hallazgos if h["severidad"] == "error"]
    avisos = [h for h in au.hallazgos if h["severidad"] == "aviso"]
    estado = "Sin errores" if not errores else f"{len(errores)} errores"
    out = [f"## Auditoría de datos: {estado}", "",
           f"Datos del {str(datos.get('generado', ''))[:10]}, {datos.get('metodologia')}, versión de datos {datos.get('version_datos')}. "
           f"{len(T)} territorios, {sum(au.revisiones.values())} comprobaciones, {len(errores)} errores y {len(avisos)} avisos.", "",
           "| Tema | Qué se comprueba | Comprobaciones | Errores | Avisos |", "|---|---|---:|---:|---:|"]
    for tema, que in TEMAS.items():
        hs = [h for h in au.hallazgos if h["tema"] == tema]
        out.append(f"| {NOMBRES[tema]} | {que} | {au.revisiones[tema]} | {sum(h['severidad'] == 'error' for h in hs)} | {sum(h['severidad'] == 'aviso' for h in hs)} |")
    if au.hallazgos:
        out += ["", "### Hallazgos", "", "| Severidad | Tema | Territorio | Detalle |", "|---|---|---|---|"]
        nombres = {i: t.get("nombre", i) for i, t in T.items()}
        for h in sorted(au.hallazgos, key=lambda h: (h["severidad"] != "error", h["tema"])):
            out.append(f"| {h['severidad'].capitalize()} | {NOMBRES[h['tema']]} | {nombres.get(h['territorio'], h['territorio'])} | {h['detalle']} |")
    out += ["", "Un error indica un dato que no cumple la metodología o es imposible; un aviso, algo que conviene revisar o que es provisional."]
    return "\n".join(out)


def informe(au: Auditoria, datos: dict) -> str:
    T = datos.get("territorios") or {}
    errores = [h for h in au.hallazgos if h["severidad"] == "error"]
    avisos = [h for h in au.hallazgos if h["severidad"] == "aviso"]
    lineas = [f"Datos del {str(datos.get('generado', ''))[:19]} · {datos.get('metodologia')} · versión de datos {datos.get('version_datos')}",
              f"Territorios: {len(T)} · comprobaciones: {sum(au.revisiones.values())} · errores: {len(errores)} · avisos: {len(avisos)}", ""]
    for tema in TEMAS:
        hs = [h for h in au.hallazgos if h["tema"] == tema]
        lineas.append(f"[{tema}] {au.revisiones[tema]} comprobaciones · {len(hs)} hallazgos")
        for h in hs:
            lineas.append(f"  {h['severidad'].upper():5} {h['territorio']:>6} · {h['detalle']}")
    return "\n".join(lineas)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", type=Path, help="Guardar los hallazgos en JSON")
    parser.add_argument("--markdown", type=Path, help="Guardar un informe en Markdown (resumen de GitHub Actions)")
    args = parser.parse_args()
    datos = json.loads(DATOS.read_text(encoding="utf-8"))
    au = auditar(datos)
    print(informe(au, datos))
    if args.markdown:
        args.markdown.write_text(informe_markdown(au, datos) + "\n", encoding="utf-8")
    if args.json:
        args.json.write_text(json.dumps({"revisiones": au.revisiones, "hallazgos": au.hallazgos}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if any(h["severidad"] == "error" for h in au.hallazgos) else 0


if __name__ == "__main__":
    raise SystemExit(main())
