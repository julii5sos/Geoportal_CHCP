"""Indicadores complementarios de ecología del paisaje sobre parches vectoriales.

Se calculan sobre los mismos parches de bosque (en metros, EPSG:32617) que usa el
motor de fragmentación y no modifican el índice de importancia de parches ni la
preevaluación. Todos son **estructurales**: describen la forma y disposición del
bosque, no el movimiento real de especies.

Referencias metodológicas:
- McGarigal, K. (2015). FRAGSTATS help. University of Massachusetts — área núcleo,
  distancia euclidiana al vecino más cercano (ENN) y cohesión de parches.
- Pascual-Hortal, L. & Saura, S. (2006). Landscape Ecology 21: 959–967 — índice
  integral de conectividad (IIC) y su fracción por parche (dIIC).

Los parámetros (profundidad de borde y distancia umbral) no son propiedades de una
especie: se informan como sensibilidad para que el usuario vea cuánto dependen los
resultados de ellos.
"""

from __future__ import annotations

import math
from statistics import mean, median
from typing import Any, Iterable

PROFUNDIDADES_BORDE_M = (50.0, 100.0, 200.0)
PROFUNDIDAD_BORDE_REFERENCIA_M = 100.0
TAMANO_CELDA_COHESION_M = 10.0
MAX_CANDIDATOS_DIIC = 15


def area_nucleo(parches: Iterable[Any], profundidades_m: Iterable[float] = PROFUNDIDADES_BORDE_M) -> dict[str, Any]:
    """Superficie que queda al excluir una franja de borde de cada parche."""

    parches = list(parches)
    total_ha = sum(p.area for p in parches) / 10_000
    resultado: dict[str, Any] = {"area_bosque_ha": round(total_ha, 4), "por_profundidad": []}
    for d in profundidades_m:
        nucleos = [p.buffer(-d) for p in parches]
        areas = [n.area / 10_000 for n in nucleos if not n.is_empty]
        nucleo_ha = sum(areas)
        resultado["por_profundidad"].append({
            "profundidad_m": float(d),
            "area_nucleo_ha": round(nucleo_ha, 4),
            "porcentaje_bosque_nucleo": round(nucleo_ha / total_ha * 100, 4) if total_ha else 0.0,
            "parches_con_nucleo": len(areas),
            "parches_sin_nucleo": len(parches) - len(areas),
        })
    return resultado


def distancia_vecino_mas_cercano(parches: list[Any], arbol=None) -> dict[str, Any]:
    """ENN: distancia borde a borde de cada parche a su vecino más próximo."""

    if len(parches) < 2:
        return {"enn_medio_m": None, "enn_mediana_m": None, "enn_maximo_m": None, "distancias_m": []}
    if arbol is None:
        from shapely.strtree import STRtree

        arbol = STRtree(parches)
    distancias = []
    for i, p in enumerate(parches):
        mejor = None
        radio = 250.0
        while mejor is None:
            for j in arbol.query(p.buffer(radio)):
                j = int(j)
                if j == i:
                    continue
                dist = p.distance(parches[j])
                mejor = dist if mejor is None else min(mejor, dist)
            if mejor is None:
                radio *= 4
                if radio > 1e7:
                    break
        if mejor is not None:
            distancias.append(float(mejor))
    return {
        "enn_medio_m": round(mean(distancias), 2) if distancias else None,
        "enn_mediana_m": round(median(distancias), 2) if distancias else None,
        "enn_maximo_m": round(max(distancias), 2) if distancias else None,
        "distancias_m": distancias,
    }


def cohesion(parches: Iterable[Any], area_paisaje_ha: float, celda_m: float = TAMANO_CELDA_COHESION_M) -> float | None:
    """Índice de cohesión de parches (FRAGSTATS), aproximado en vector.

    Perímetros y áreas se expresan en unidades de celda de ``celda_m`` para usar la
    fórmula original: COHESION = [1 − Σp / Σ(p·√a)] · [1 − 1/√Z]⁻¹ · 100.
    """

    parches = list(parches)
    z = area_paisaje_ha * 10_000 / (celda_m ** 2)
    if not parches or z <= 1:
        return None
    p = [pa.length / celda_m for pa in parches]
    a = [pa.area / (celda_m ** 2) for pa in parches]
    denominador = sum(pi * math.sqrt(ai) for pi, ai in zip(p, a))
    if denominador <= 0:
        return None
    valor = (1 - sum(p) / denominador) / (1 - 1 / math.sqrt(z)) * 100
    return round(max(0.0, min(100.0, valor)), 4)


def _suma_iic(grafo, areas: dict[int, float], nx) -> float:
    total = 0.0
    for origen, distancias in nx.all_pairs_shortest_path_length(grafo):
        a_i = areas[origen]
        for destino, saltos in distancias.items():
            total += a_i * areas[destino] / (1 + saltos)
    return total


def indice_integral_conectividad(grafo, areas_ha: dict[int, float], area_paisaje_ha: float, *, nx,
                                 candidatos: Iterable[int] | None = None) -> dict[str, Any]:
    """IIC del paisaje y dIIC (% de pérdida al eliminar cada parche) de los candidatos.

    El grafo binario usa la misma distancia umbral que la red estructural. Para no
    recalcular la red completa por cada parche, dIIC se evalúa en los parches de
    mayor área e importancia (``candidatos``) y solo dentro de su componente.
    """

    if area_paisaje_ha <= 0 or grafo.number_of_nodes() == 0:
        return {"iic": 0.0, "diic": []}
    total = _suma_iic(grafo, areas_ha, nx)
    iic = total / (area_paisaje_ha ** 2)
    candidatos = list(candidatos) if candidatos is not None else sorted(areas_ha, key=areas_ha.get, reverse=True)[:MAX_CANDIDATOS_DIIC]
    componentes = {n: c for c in nx.connected_components(grafo) for n in c}
    aportes = []
    for k in candidatos:
        comp = componentes[k]
        sub = grafo.subgraph(comp)
        antes = _suma_iic(sub, areas_ha, nx)
        sin_k = sub.copy()
        sin_k.remove_node(k)
        despues = _suma_iic(sin_k, areas_ha, nx) if sin_k.number_of_nodes() else 0.0
        aportes.append({"indice": int(k), "area_ha": round(areas_ha[k], 4),
                        "diic_pct": round((antes - despues) / total * 100, 4) if total else 0.0})
    aportes.sort(key=lambda x: x["diic_pct"], reverse=True)
    return {"iic": round(iic, 8), "diic": aportes}


def resumen_paisaje(parches: list[Any], grafo, area_paisaje_ha: float, *, nx, arbol=None,
                    umbral_m: float) -> dict[str, Any]:
    """Bloque «metricas_paisaje» que se agrega al resultado del motor."""

    nucleo = area_nucleo(parches)
    enn = distancia_vecino_mas_cercano(parches, arbol)
    areas = {i: p.area / 10_000 for i, p in enumerate(parches)}
    # Candidatos a dIIC: los parches más grandes y los «puentes» (puntos de articulación),
    # que son los que más pueden partir la red aunque sean pequeños.
    mayores = sorted(areas, key=areas.get, reverse=True)[:MAX_CANDIDATOS_DIIC]
    puentes = sorted(nx.articulation_points(grafo), key=lambda n: grafo.degree(n), reverse=True)[:MAX_CANDIDATOS_DIIC]
    iic = indice_integral_conectividad(grafo, areas, area_paisaje_ha, nx=nx, candidatos=list(dict.fromkeys(mayores + puentes)))
    puentes_set = set(puentes)
    for aporte in iic["diic"]:
        aporte["es_puente"] = aporte["indice"] in puentes_set
    referencia = next(x for x in nucleo["por_profundidad"] if x["profundidad_m"] == PROFUNDIDAD_BORDE_REFERENCIA_M)
    return {
        "area_nucleo": nucleo,
        "area_nucleo_ha": referencia["area_nucleo_ha"],
        "porcentaje_bosque_nucleo": referencia["porcentaje_bosque_nucleo"],
        "profundidad_borde_referencia_m": PROFUNDIDAD_BORDE_REFERENCIA_M,
        "enn_medio_m": enn["enn_medio_m"],
        "enn_mediana_m": enn["enn_mediana_m"],
        "enn_maximo_m": enn["enn_maximo_m"],
        "cohesion": cohesion(parches, area_paisaje_ha),
        "iic": iic["iic"],
        "diic_principales": iic["diic"][:10],
        "umbral_m": float(umbral_m),
        "nota": ("Indicadores estructurales. La profundidad de borde y la distancia umbral son parámetros "
                 "de análisis, no valores comprobados para una especie; se muestran como sensibilidad."),
    }
