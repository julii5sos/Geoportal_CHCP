"""Genera docs/DICCIONARIO_CAPAS_SINIA.md desde los datos que usa la aplicación.

El diccionario no se edita a mano: se construye con data/catalogo_assets_sinia.json,
data/leyendas_sinia.json, las reglas de chcp/catalogos/reclasificacion_sinia.py y,
si existe, la auditoría docs/validacion/auditoria_assets_sinia.json. Así el
documento, el mapa, los gráficos y los informes no pueden divergir.

    python scripts/generar_diccionario_sinia.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ) not in sys.path:
    sys.path.insert(0, str(RAIZ))

from chcp.catalogos.leyendas_sinia import cargar_catalogo, estados, fuentes, id_asset, leyenda  # noqa: E402
from chcp.catalogos.reclasificacion_sinia import GRUPOS_DERIVADOS, MASCARAS_FORESTALES, codigos_forestales  # noqa: E402

SALIDA = RAIZ / "docs" / "DICCIONARIO_CAPAS_SINIA.md"
AUDITORIA = RAIZ / "docs" / "validacion" / "auditoria_assets_sinia.json"
ETIQUETA_ESTADO = {
    "verificada_espacialmente": "✅ Verificada (espacial)", "verificada_valor_atributo": "✅ Verificada (atributo)",
    "documentada_catalogo_previo": "📘 Documentada", "grupo_documentado_catalogo_previo": "⚠️ Solo grupo",
    "leyenda_oficial_sin_correspondencia": "⚠️ Sin verificar", "no_identificado": "⛔ No identificado",
}


def _txt(valor) -> str:
    return str(valor).replace("|", "\\|") if valor not in (None, "") else "—"


def _proyeccion(aud: dict) -> str:
    meta = aud.get("metadatos") or {}
    bandas = meta.get("bandas") or []
    if bandas:
        b = bandas[0]
        tipo = b.get("tipo_dato") or {}
        return f"{b.get('crs')} · `{b.get('id')}` {tipo.get('precision', '')} (máx. {(tipo.get('range') or {}).get('max', '—')}) · {meta.get('escala_nominal_m')} m"
    vec = aud.get("vector") or {}
    proj = vec.get("proyeccion_geometria") or {}
    return f"Geometrías en {proj.get('crs', '—')}" if proj else "—"


def _seccion(clave: str, ficha: dict, aud: dict) -> str:
    inv = aud.get("inventario_chcp") or {}
    corr = (aud.get("correspondencia_rest") or {}).get("por_codigo", {})
    coh = aud.get("coherencia_forestal_2021") or {}
    presentes = set(inv.get("codigos_presentes") or [])
    histo = {int(g["codigo"]): float(g["sum"]) for g in (inv.get("histograma_ha") or [])}
    vec = aud.get("vector") or {}
    if vec.get("por_categoria"):
        presentes = {f["codigo"] for f in leyenda(clave) if f["categoria"] in vec["por_categoria"]}
    mascara = MASCARAS_FORESTALES[clave]
    lineas = [
        f"## {ficha['anio']} · {ficha['nombre']}",
        "",
        "| Atributo | Valor |", "|---|---|",
        f"| Asset | `{id_asset(clave)}` |",
        f"| Clave interna | `{clave}` |",
        f"| Año | {ficha['anio']} |",
        f"| Institución | {ficha['institucion']} |",
        f"| Tipo | {'Ráster (IMAGE)' if ficha['tipo'] == 'IMAGE' else 'Vector (TABLE · FeatureCollection)'} |",
        f"| Resolución | {_txt(ficha.get('resolucion_m'))}{' m' if ficha.get('resolucion_m') else ''} |",
        f"| Escala cartográfica | {_txt(ficha.get('escala_cartografica'))} |",
        f"| Proyección documentada | {ficha['crs']} |",
        f"| Proyección y tipo verificados | {_proyeccion(aud) if aud else 'Pendiente de auditoría'} |",
        f"| Banda o campo temático | `{ficha.get('banda') or ficha.get('campo_tematico')}` |",
        f"| NoData | {_txt(ficha.get('nodata'))} |",
        f"| Uso analítico | {ficha['uso_analitico']} |",
        f"| Máscara forestal (fragmentación) | Códigos {', '.join(map(str, codigos_forestales(clave)))}" +
        (f"; opcionales {', '.join(str(c) for c in codigos_forestales(clave, incluir_opcionales=True) if c not in codigos_forestales(clave))}" if mascara.get("opcionales") else "") +
        f". {mascara['justificacion']} |",
        f"| Limitaciones | {' '.join(ficha['limitaciones'])} |",
        f"| Fuentes | {'<br>'.join(ficha['fuentes'])} |",
    ]
    if inv:
        lineas.append(f"| Inventario en la CHCP | Códigos presentes: {', '.join(map(str, sorted(presentes))) or '—'} · área enmascarada {inv.get('enmascarado_ha', 0) or 0:,.0f} ha · escala {inv.get('escala_inventario_m')} m |")
    if vec:
        lineas.append(f"| Inventario del vector | {vec.get('n_entidades', '—'):,} entidades · campos {', '.join(vec.get('campos', []))} · geometrías {vec.get('tipos_geometria_muestra', {})} |")
    lineas += ["", "| Código | Categoría | Grupo derivado | Color | Fuente del color | Estado | Evidencia | En CHCP |", "|---:|---|---|---|---|---|---|---|"]
    for f in leyenda(clave):
        ev = corr.get(str(f["codigo"]))
        evid = f.get("fuente_correspondencia") or "—"
        if ev:
            evid = f"REST: «{ev['categoria_mayoritaria']}» {ev['acuerdo_pct']} % de {ev['puntos']} pts"
        if str(f["codigo"]) in coh:
            evid += f"; {coh[str(f['codigo'])]['en_bosque_2021_pct']} % en bosque 2021"
        if f.get("candidato_leyenda_oficial") and f["estado"] in {"leyenda_oficial_sin_correspondencia", "grupo_documentado_catalogo_previo"}:
            evid += f"; candidato por orden de leyenda: «{f['candidato_leyenda_oficial']}» (no probado)"
        en_chcp = ("sí" + (f" ({histo[f['codigo']]:,.0f} ha)" if f["codigo"] in histo else "")) if f["codigo"] in presentes else ("no" if presentes else "—")
        color = "oficial MiAMBIENTE" if "MiAMBIENTE" in f["fuente_color"] else "propuesta Geoportal"
        lineas.append(f"| {f['codigo']} | {_txt(f['categoria'])} | {GRUPOS_DERIVADOS[f['grupo_derivado']]['nombre']} | `{f['color']}` | {color} | {ETIQUETA_ESTADO.get(f['estado'], f['estado'])} | {_txt(evid)} | {en_chcp} |")
    return "\n".join(lineas)


def main() -> int:
    auditoria = json.loads(AUDITORIA.read_text(encoding="utf-8")) if AUDITORIA.exists() else {}
    cat = cargar_catalogo()
    partes = [
        "# Diccionario de capas SINIA–MiAMBIENTE",
        "",
        "> **Referencia técnica del Geoportal CHCP.** Documento generado automáticamente con "
        "`python scripts/generar_diccionario_sinia.py` a partir de `data/catalogo_assets_sinia.json`, "
        "`data/leyendas_sinia.json` y la auditoría `docs/validacion/auditoria_assets_sinia.json`. "
        "No lo edite a mano: cambie los JSON con evidencia y vuelva a generarlo.",
        "",
        "## Reglas de uso",
        "",
        "1. **Un código solo tiene significado dentro de su producto.** El código 8 es «Sin categoría documentada» en 1992 y «Uso agropecuario» en 2000; el código 14 de 2012 no se hereda en 2021.",
        "2. **Los datos originales no se modifican.** Toda agrupación usa el *grupo derivado* de cada código (ver `docs/RECLASIFICACION_ECOLOGICA.md`).",
        "3. **Lo no verificado no se presenta como oficial.** Los códigos sin correspondencia verificada se muestran como «Código N».",
        "4. **Colores:** «oficial MiAMBIENTE» procede de la simbología del servicio REST; «propuesta Geoportal» es una paleta propia y no se atribuye a MiAMBIENTE.",
        "5. **Comparaciones entre años:** solo visuales y estadísticas independientes (ver `docs/COMPARABILIDAD_COBERTURAS.md`).",
        "",
        "### Estados de verificación",
        "",
        "| Estado | Significado |", "|---|---|",
        *[f"| {ETIQUETA_ESTADO.get(k, k)} (`{k}`) | {v} |" for k, v in estados().items()],
        "",
        f"Auditoría aplicada: **{auditoria.get('fecha', 'pendiente')}** · proyecto `{auditoria.get('proyecto', '—')}` · "
        f"{auditoria.get('puntos_por_codigo', '—')} puntos por código · servicio {fuentes()['rest']}.",
        "",
    ]
    for clave, ficha in cat.items():
        partes += [_seccion(clave, ficha, (auditoria.get("assets") or {}).get(clave, {})), ""]
    SALIDA.write_text("\n".join(partes), encoding="utf-8")
    print(f"Diccionario escrito en {SALIDA}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
