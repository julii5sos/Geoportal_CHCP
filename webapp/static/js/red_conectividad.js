/* Cálculos de red para el simulador de restauración (sin dependencias).
   Reproduce en el navegador la red binaria del motor de conectividad: nodos = parches
   de bosque oficial 2021, aristas = pares a menos de la distancia umbral. El IIC sigue
   a Pascual-Hortal y Saura (2006), igual que chcp/nucleo/metricas_paisaje.py:
   IIC = Σi Σj ai·aj / (1 + nlij) / AL², con nlij = número de saltos del camino más corto. */
(function (raiz) {
  'use strict';

  function grafo(areas, aristas) {
    const vecinos = new Map();
    for (const id of areas.keys()) vecinos.set(id, new Set());
    for (const [a, b] of aristas) {
      if (a === b || !vecinos.has(a) || !vecinos.has(b)) continue;
      vecinos.get(a).add(b);
      vecinos.get(b).add(a);
    }
    return vecinos;
  }

  function componentes(vecinos) {
    const comp = new Map();
    const grupos = [];
    for (const inicio of vecinos.keys()) {
      if (comp.has(inicio)) continue;
      const grupo = [inicio];
      comp.set(inicio, grupos.length);
      for (let i = 0; i < grupo.length; i += 1) {
        for (const v of vecinos.get(grupo[i])) if (!comp.has(v)) { comp.set(v, grupos.length); grupo.push(v); }
      }
      grupos.push(grupo);
    }
    return { comp, grupos };
  }

  function sumaIIC(vecinos, areas, grupos) {
    let total = 0;
    for (const grupo of grupos) {
      for (const origen of grupo) {
        const ai = areas.get(origen);
        const saltos = new Map([[origen, 0]]);
        const cola = [origen];
        for (let i = 0; i < cola.length; i += 1) {
          const u = cola[i];
          const d = saltos.get(u);
          total += ai * areas.get(u) / (1 + d);
          for (const v of vecinos.get(u)) if (!saltos.has(v)) { saltos.set(v, d + 1); cola.push(v); }
        }
      }
    }
    return total;
  }

  /** Indicadores de la red. areas: Map(id → ha); aristas: [[idA, idB], …]. */
  function analizar(areas, aristas, areaPaisajeHa) {
    const vecinos = grafo(areas, aristas);
    const { comp, grupos } = componentes(vecinos);
    const areaGrupo = grupos.map((g) => g.reduce((s, id) => s + areas.get(id), 0));
    const orden = areaGrupo.map((a, i) => [a, i]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    const rango = new Map(orden.map((g, r) => [g, r]));
    const total = areaGrupo.reduce((s, a) => s + a, 0);
    const mayor = Math.max(0, ...areaGrupo);
    let aislados = 0;
    for (const v of vecinos.values()) if (v.size === 0) aislados += 1;
    const numerador = sumaIIC(vecinos, areas, grupos);
    const iic = areaPaisajeHa > 0 ? numerador / (areaPaisajeHa * areaPaisajeHa) : 0;
    return {
      parches: areas.size,
      redes: grupos.length,
      aislados,
      bosque_ha: total,
      red_mayor_ha: mayor,
      red_mayor_pct: total ? mayor / total * 100 : 0,
      iic,
      ec_ha: Math.sqrt(numerador),
      // red de cada parche, numerada de mayor a menor superficie (0 = red principal)
      red: new Map([...comp].map(([id, g]) => [id, rango.get(g)])),
    };
  }


  // --------------------------------------------------------------- ganancia exacta por enlace
  // Numerador del IIC: N = Σi Σj ai·aj / (1 + nlij). IIC = N / AL²; la conectividad
  // equivalente EC = √N (ha) no depende del área de paisaje y se compara entre subcuencas
  // (Saura et al. 2011). La ganancia relativa de un enlace es la misma en IIC y en N.

  /** Red preparada para evaluar enlaces sin recalcular todo el grafo. */
  function preparar_red(areas, aristas) {
    const vecinos = grafo(areas, aristas);
    const { comp, grupos } = componentes(vecinos);
    const sumas = grupos.map((g) => sumaIIC(vecinos, areas, [g]));
    return { areas, vecinos, comp, grupos, sumas, numerador: sumas.reduce((t, x) => t + x, 0), saltos: new Map() };
  }

  /** Saltos desde `origen` dentro de su componente (BFS). */
  function bfs(red, origen) {
    const d = new Map([[origen, 0]]), cola = [origen];
    for (let i = 0; i < cola.length; i += 1) {
      const u = cola[i], du = d.get(u);
      for (const v of red.vecinos.get(u)) if (!d.has(v)) { d.set(v, du + 1); cola.push(v); }
    }
    return d;
  }

  /** Matriz de saltos de una componente (se calcula una vez y se reutiliza). */
  function saltosComponente(red, g) {
    if (red.saltos.has(g)) return red.saltos.get(g);
    const nodos = red.grupos[g], idx = new Map(nodos.map((id, k) => [id, k])), n = nodos.length;
    const m = new Uint16Array(n * n).fill(65535);
    nodos.forEach((id, k) => { for (const [v, d] of bfs(red, id)) m[k * n + idx.get(v)] = d; });
    const r = { nodos, idx, n, m };
    red.saltos.set(g, r);
    return r;
  }

  const MAX_NODOS_MISMA_RED = 3000;
  /** Aumento exacto del numerador N al añadir el enlace a–b (null si la red es demasiado grande). */
  function gananciaEnlace(red, a, b) {
    if (a === b || !red.vecinos.has(a) || !red.vecinos.has(b) || red.vecinos.get(a).has(b)) return 0;
    const ga = red.comp.get(a), gb = red.comp.get(b), A = red.areas;
    if (ga !== gb) {
      // Solo cambian los pares (i en la red de a, j en la de b): nl = d(i,a) + 1 + d(b,j).
      const porSalto = (origen) => { const acc = []; for (const [v, d] of bfs(red, origen)) acc[d] = (acc[d] || 0) + A.get(v); return acc; };
      const sa = porSalto(a), sb = porSalto(b);
      let t = 0;
      for (let k = 0; k < sa.length; k += 1) if (sa[k]) for (let q = 0; q < sb.length; q += 1) if (sb[q]) t += sa[k] * sb[q] / (2 + k + q);
      return 2 * t;
    }
    // Misma red: el enlace acorta caminos. nl' = min(nl, d(i,a)+1+d(b,j), d(i,b)+1+d(a,j)).
    const s = saltosComponente(red, ga);
    if (s.n > MAX_NODOS_MISMA_RED) return null;
    const ia = s.idx.get(a), ib = s.idx.get(b), n = s.n, m = s.m, ar = s.nodos.map((id) => A.get(id));
    let t = 0;
    for (let i = 0; i < n; i += 1) {
      const dia = m[i * n + ia], dib = m[i * n + ib];
      for (let j = 0; j < n; j += 1) {
        const d = m[i * n + j], nuevo = Math.min(d, dia + 1 + m[ib * n + j], dib + 1 + m[ia * n + j]);
        if (nuevo < d) t += ar[i] * ar[j] * (1 / (1 + nuevo) - 1 / (1 + d));
      }
    }
    return t;
  }

  /** Añade un enlace a una red preparada (actualiza componentes y sumas). */
  function conEnlace(red, a, b) {
    const aristas = [];
    for (const [u, vs] of red.vecinos) for (const v of vs) if (u < v) aristas.push([u, v]);
    aristas.push([a, b]);
    return preparar_red(red.areas, aristas);
  }

  /**
   * Plan voraz: en cada paso elige el enlace con mayor ganancia ajustada por hectárea dada la
   * red ya modificada por los pasos anteriores (considera interacciones, no garantiza el óptimo).
   * candidatos: [{a, b, d, efectividad, ha, excluido}]
   */
  function planVoraz(areas, aristas, candidatos, { pasos = 8, maxHa = Infinity } = {}) {
    let red = preparar_red(areas, aristas);
    const base = red.numerador, plan = [];
    let restantes = candidatos.filter((c) => !c.excluido), ha = 0;
    for (let k = 0; k < pasos && restantes.length; k += 1) {
      let mejor = null;
      for (const c of restantes) {
        const g = gananciaEnlace(red, c.a, c.b);
        if (!g) continue;
        const v = g * c.efectividad / c.ha;
        if (!mejor || v > mejor.v) mejor = { c, g, v };
      }
      if (!mejor || ha + mejor.c.ha > maxHa) break;
      red = conEnlace(red, mejor.c.a, mejor.c.b);
      ha += mejor.c.ha;
      plan.push({ ...mejor.c, ganancia_pct: mejor.g / base * 100, acumulado_pct: (red.numerador - base) / base * 100, ha_acumuladas: ha });
      restantes = restantes.filter((c) => c !== mejor.c);
    }
    return plan;
  }

  // --------------------------------------------------------------- geometría
  // Distancias en WGS 84 / UTM 17N (EPSG:32617), igual que el motor en Python.
  // Proyección transversa de Mercator con la serie de Krüger (error < 1 mm en la zona).
  function utm17(lon, lat) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, lon0 = -81 * Math.PI / 180;
    const n = f / (2 - f), A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
    const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
    const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180 - lon0;
    const e = 2 * Math.sqrt(n) / (1 + n);
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - e * Math.atanh(e * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let x = eta, y = xi;
    for (let j = 1; j <= 3; j += 1) { x += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); y += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); }
    return [500000 + k0 * A * x, k0 * A * y];
  }

  /** Vértices (muestreados) y caja de un polígono en metros locales. */
  function preparar(feature, _lat0, maxVertices = 300) {
    const g = feature.geometry;
    const anillos = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
    const todos = anillos.flat();
    const paso = Math.max(1, Math.ceil(todos.length / maxVertices));
    const pts = [];
    for (let i = 0; i < todos.length; i += paso) { const [x, y] = utm17(todos[i][0], todos[i][1]); pts.push([x, y, todos[i]]); }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { pts, caja: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  }

  function distanciaCajas(a, b) {
    const dx = Math.max(0, b[0] - a[2], a[0] - b[2]);
    const dy = Math.max(0, b[1] - a[3], a[1] - b[3]);
    return Math.hypot(dx, dy);
  }

  /** Par de vértices más cercano entre dos parches preparados (aproximación de borde a borde). */
  function masCercano(pa, pb) {
    let mejor = { d: Infinity, a: null, b: null };
    for (const p of pa.pts) for (const q of pb.pts) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < mejor.d) mejor = { d, a: p[2], b: q[2] };
    }
    return mejor;
  }

  /** Enlaces más cortos entre redes distintas (candidatos de reconexión). */
  function candidatosEntreRedes(preparados, red, maxDist, maxCandidatos = 60) {
    const ids = [...preparados.keys()];
    const mejores = new Map();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = ids[i], b = ids[j];
        const ra = red.get(a), rb = red.get(b);
        if (ra === rb) continue;
        const pa = preparados.get(a), pb = preparados.get(b);
        if (distanciaCajas(pa.caja, pb.caja) > maxDist) continue;
        const clave = ra < rb ? `${ra}-${rb}` : `${rb}-${ra}`;
        const actual = mejores.get(clave);
        if (actual && distanciaCajas(pa.caja, pb.caja) > actual.d) continue;
        const c = masCercano(pa, pb);
        if (c.d <= maxDist && (!actual || c.d < actual.d)) mejores.set(clave, { a, b, d: c.d, linea: [c.a, c.b] });
      }
    }
    return [...mejores.values()].sort((x, y) => x.d - y.d).slice(0, maxCandidatos);
  }

  /** Ganancia de IIC de cada candidato por separado, ordenada por beneficio por hectárea. */
  function priorizar(areas, aristas, areaPaisajeHa, candidatos, anchoM) {
    const base = analizar(areas, aristas, areaPaisajeHa);
    return candidatos.map((c) => {
      const r = analizar(areas, aristas.concat([[c.a, c.b]]), areaPaisajeHa);
      const ha = c.d * anchoM / 10_000;
      const ganancia = base.iic ? (r.iic - base.iic) / base.iic * 100 : 0;
      return { ...c, ha, ganancia_iic_pct: ganancia, redes_unidas: base.redes - r.redes, por_ha: ha > 0 ? ganancia / ha : 0 };
    }).sort((x, y) => y.por_ha - x.por_ha);
  }

  function puntoEnPoligono(p, geometria) {
    const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.type === 'MultiPolygon' ? geometria.coordinates : [];
    return poligonos.some((anillos) => {
      let dentro = false;
      const anillo = anillos[0];
      for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) {
        const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) dentro = !dentro;
      }
      return dentro;
    });
  }

  function cercaDeLineas(p, lineas, maxM) {
    const [px, py] = utm17(p[0], p[1]);
    for (const f of lineas) {
      const g = f.geometry;
      const partes = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
      for (const parte of partes) for (let i = 1; i < parte.length; i += 1) {
        // distancia punto–segmento en metros locales
        const [ax, ay] = utm17(parte[i - 1][0], parte[i - 1][1]), [bx, by] = utm17(parte[i][0], parte[i][1]);
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
        if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= maxM) return true;
      }
    }
    return false;
  }

  const api = { utm17, analizar, preparar, masCercano, candidatosEntreRedes, priorizar, puntoEnPoligono, cercaDeLineas, preparar_red, gananciaEnlace, conEnlace, planVoraz };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_RED = api;
})(typeof window !== 'undefined' ? window : globalThis);
