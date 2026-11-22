"""Exactitud y área ajustada por error con muestreo aleatorio estratificado.

Implementa los estimadores de Olofsson et al. (2014) *Good practices for estimating
area and assessing accuracy of land change* (Remote Sensing of Environment 148:42-57),
recomendados por FAO y GFOI. Los estratos son las clases del mapa evaluado; cada
punto de la muestra tiene la clase del mapa y la clase de referencia, asignada por
interpretación independiente (imágenes de alta resolución o visita de campo).

Todo el módulo es Python puro y no depende de Earth Engine.
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Mapping, Sequence

Z_95 = 1.959964


def tamano_muestra(proporciones: Mapping[Any, float], exactitud_esperada: Mapping[Any, float],
                   error_estandar_objetivo: float = 0.01) -> int:
    """Tamaño total para un error estándar objetivo de la exactitud global (Olofsson 2014, ec. 13)."""
    suma = sum(proporciones[c] * math.sqrt(exactitud_esperada[c] * (1 - exactitud_esperada[c])) for c in proporciones)
    return max(1, math.ceil((suma / error_estandar_objetivo) ** 2))


def asignar_muestra(n_total: int, areas: Mapping[Any, float], minimo: int = 50) -> dict[Any, int]:
    """Reparte n_total entre estratos: proporcional al área, con un mínimo por estrato.

    Los estratos pequeños (cambio) reciben al menos ``minimo`` puntos para estimar su
    exactitud de usuario; el resto se distribuye en proporción al área.
    """
    total_area = sum(a for a in areas.values() if a > 0)
    activos = {c: a for c, a in areas.items() if a > 0}
    if not activos or total_area <= 0:
        return {c: 0 for c in areas}
    asignado: dict[Any, int] = {}
    restantes = dict(activos)
    n_restante = n_total
    while True:
        area_restante = sum(restantes.values())
        nuevos = {c: a for c, a in restantes.items() if n_restante * a / area_restante < minimo}
        if not nuevos:
            break
        for c in nuevos:
            asignado[c] = minimo
            restantes.pop(c)
            n_restante -= minimo
        if not restantes or n_restante <= 0:
            break
    if restantes and n_restante > 0:
        area_restante = sum(restantes.values())
        exactos = {c: n_restante * a / area_restante for c, a in restantes.items()}
        base = {c: math.floor(v) for c, v in exactos.items()}
        sobra = n_restante - sum(base.values())
        for c in sorted(exactos, key=lambda k: exactos[k] - base[k], reverse=True)[:sobra]:
            base[c] += 1
        asignado.update(base)
    return {c: asignado.get(c, 0) for c in areas}


def matriz_conteos(muestras: Iterable[tuple[Any, Any]], clases: Sequence[Any]) -> list[list[int]]:
    """Filas = clase del mapa (estrato); columnas = clase de referencia."""
    indice = {c: i for i, c in enumerate(clases)}
    m = [[0] * len(clases) for _ in clases]
    for mapa, referencia in muestras:
        if mapa in indice and referencia in indice:
            m[indice[mapa]][indice[referencia]] += 1
    return m


def evaluar(clases: Sequence[Any], areas_mapa: Mapping[Any, float], conteos: Sequence[Sequence[int]],
            unidad_area: str = "ha", z: float = Z_95) -> dict[str, Any]:
    """Exactitudes, matriz en proporciones de área y áreas ajustadas con IC.

    ``areas_mapa``: superficie cartografiada de cada clase (estrato).
    ``conteos``: matriz n_ij (filas = mapa, columnas = referencia).
    """
    q = len(clases)
    A = [float(areas_mapa[c]) for c in clases]
    A_tot = sum(A)
    W = [a / A_tot for a in A]
    n_i = [sum(fila) for fila in conteos]
    p = [[W[i] * conteos[i][j] / n_i[i] if n_i[i] else 0.0 for j in range(q)] for i in range(q)]
    p_col = [sum(p[i][j] for i in range(q)) for j in range(q)]
    p_fila = [sum(p[i]) for i in range(q)]

    def var_prop(i: int, j: int) -> float:
        if n_i[i] <= 1:
            return 0.0
        f = conteos[i][j] / n_i[i]
        return f * (1 - f) / (n_i[i] - 1)

    global_ = sum(p[i][i] for i in range(q))
    var_global = sum(W[i] ** 2 * var_prop(i, i) for i in range(q))

    filas = []
    N_i = A  # superficie del estrato (las unidades se cancelan en las proporciones)
    for j, c in enumerate(clases):
        ua = conteos[j][j] / n_i[j] if n_i[j] else None
        var_ua = var_prop(j, j) if n_i[j] else None
        N_col = sum(N_i[i] / n_i[i] * conteos[i][j] for i in range(q) if n_i[i])
        if N_col > 0 and ua is not None:
            pa = p[j][j] / p_col[j] if p_col[j] else None
            termino1 = N_i[j] ** 2 * (1 - pa) ** 2 * var_prop(j, j)
            termino2 = pa ** 2 * sum(N_i[i] ** 2 * var_prop(i, j) for i in range(q) if i != j and n_i[i])
            var_pa = (termino1 + termino2) / N_col ** 2
        else:
            pa, var_pa = None, None
        se_area_prop = math.sqrt(sum(W[i] ** 2 * var_prop(i, j) for i in range(q) if n_i[i]))
        area = A_tot * p_col[j]
        filas.append({
            "clase": c,
            "area_mapa": A[j],
            "peso": W[j],
            "n": n_i[j],
            "exactitud_usuario": ua,
            "exactitud_usuario_ic": z * math.sqrt(var_ua) if var_ua is not None else None,
            "exactitud_productor": pa,
            "exactitud_productor_ic": z * math.sqrt(var_pa) if var_pa is not None else None,
            "area_ajustada": area,
            "area_ajustada_ic": z * se_area_prop * A_tot,
            "error_omision": None if pa is None else 1 - pa,
            "error_comision": None if ua is None else 1 - ua,
        })
    return {
        "metodo": "Olofsson et al. (2014), muestreo aleatorio estratificado por clase del mapa",
        "unidad_area": unidad_area,
        "nivel_confianza": 0.95 if abs(z - Z_95) < 1e-6 else None,
        "clases": list(clases),
        "n_total": sum(n_i),
        "area_total": A_tot,
        "exactitud_global": global_,
        "exactitud_global_ic": z * math.sqrt(var_global),
        "matriz_conteos": [list(f) for f in conteos],
        "matriz_proporciones": p,
        "proporcion_mapa": p_fila,
        "proporcion_referencia": p_col,
        "por_clase": filas,
    }
