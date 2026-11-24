/* Rutas de menor costo desde un parche de bosque hasta el Corredor Biológico Mesoamericano.
   Procesamiento tipo C (estimación local en el navegador) sobre los rasters precalculados de la
   cuenca (malla EPSG:3857). No es un corredor oficial: es un modelo de resistencia explícito
   (valores en RESISTENCIA) para explorar por dónde una conexión cruzaría menos terreno hostil.

   Método: costo acumulado (Dijkstra, 8 vecinos) desde cada tramo del corredor; la ruta se
   reconstruye desde la celda del parche con menor costo. La franja de alternativas reúne las
   celdas cuya ruta parche → celda → corredor cuesta como máximo (1 + tolerancia) veces la
   ruta óptima (corredor de menor costo, como en Linkage Mapper). La malla cubre la cuenca y
   25 km a su alrededor: SINIA 2021 donde existe (unos 15 km) y JRC TMF 2025 más allá; fuera
   de la malla no hay cobertura conocida y no se permite el paso. */
(function (raiz) {
  // Resistencia relativa por tipo de cobertura (1 = bosque sin perturbación). Supuesto del
  // modelo, documentado en docs/DECISIONES_METODOLOGICAS.md; no proviene de una especie concreta.
  const RESISTENCIA = {
    bosque_ribera: 0.5, bosque: 1, bosque_degradado: 2, plantacion: 3, regeneracion: 5,
    ribera_sin_bosque: 10, otras_tierras: 25, construido: 100, agua: 1000,
  };
  const CLASES = ['sin_dato', 'bosque', 'bosque_degradado', 'regeneracion', 'otras_tierras', 'construido', 'agua',
    'bosque_ribera', 'ribera_sin_bosque', 'plantacion'];
  const C = Object.fromEntries(CLASES.map((c, i) => [c, i]));
  // Clases que una ruta cruzaría fuera del bosque (lo que habría que restaurar o atravesar).
  const FUERA_BOSQUE = new Set([C.regeneracion, C.otras_tierras, C.construido, C.agua, C.ribera_sin_bosque]);
  const NO_DATO = 255;
  const ESRI_CONSTRUIDO = 7;
  // Raster SINIA 2021 detallado (códigos verificados en la CHCP; ver data/leyendas_sinia.json).
  const SINIA_AGUA = 27, SINIA_CONSTRUIDO = new Set([28, 29, 30]), SINIA_PLANTACION = new Set([7, 8]), SINIA_RASTROJO = 9;
  // Banda ribereña del IGNTG: 1 cauce (≈ ±10 m), 3 ≤ 30 m, 4 ≤ 50 m, 5 ≤ 100 m. Se usa ≤ 50 m.
  const BANDA_RIBERA = 4;

  /** Reduce un raster categórico por un factor entero tomando la moda de cada bloque (ignora 255). */
  function reducir(v, w, h, f) {
    if (f <= 1) return { v, w, h };
    const W = Math.ceil(w / f), H = Math.ceil(h / f), out = new Uint8Array(W * H).fill(NO_DATO);
    const cuenta = new Uint16Array(256);
    for (let Y = 0; Y < H; Y += 1) for (let X = 0; X < W; X += 1) {
      cuenta.fill(0);
      let mejor = NO_DATO, max = 0;
      for (let y = Y * f; y < Math.min(h, Y * f + f); y += 1) for (let x = X * f; x < Math.min(w, X * f + f); x += 1) {
        const c = v[y * w + x];
        if (c === NO_DATO) continue;
        cuenta[c] += 1;
        if (cuenta[c] > max) { max = cuenta[c]; mejor = c; }
      }
      out[Y * W + X] = mejor;
    }
    return { v: out, w: W, h: H };
  }

  /**
   * Clase de cobertura (índice en CLASES).
   * s: SINIA 2021 general (1 bosque, 2 otras tierras, 3 agua); j: JRC TMF 2025;
   * e: ESRI 2024 (opcional); d: SINIA 2021 detallado (opcional); r: banda ribereña IGNTG (opcional).
   */
  function clasificar(s, j, e = NO_DATO, d = NO_DATO, r = NO_DATO) {
    if (s === 3 || d === SINIA_AGUA || (s === NO_DATO && d === NO_DATO && j === 5)) return C.agua;
    if (s === NO_DATO && j === NO_DATO && d === NO_DATO) return C.sin_dato;
    if (SINIA_CONSTRUIDO.has(d) || e === ESRI_CONSTRUIDO) return C.construido;
    const ribera = r <= BANDA_RIBERA;
    if (s === 1) {
      if (SINIA_PLANTACION.has(d)) return C.plantacion;
      if (d === SINIA_RASTROJO) return C.regeneracion;
      if (j === 2 || j === 3) return C.bosque_degradado;
      return ribera ? C.bosque_ribera : C.bosque;
    }
    if (s === 2) {
      if (d === SINIA_RASTROJO || j === 4) return C.regeneracion;
      return ribera ? C.ribera_sin_bosque : C.otras_tierras;
    }
    // Sin SINIA general: se usa JRC.
    const c = { 1: C.bosque, 2: C.bosque_degradado, 4: C.regeneracion, 5: C.agua }[j];
    if (c === C.bosque && ribera) return C.bosque_ribera;
    return c ?? (ribera ? C.ribera_sin_bosque : C.otras_tierras);
  }

  /** Reduce un raster de clases conservando las riberas (franjas estrechas que la moda borraría). */
  function reducirClases(v, w, h, f) {
    if (f <= 1) return { v, w, h };
    const W = Math.ceil(w / f), H = Math.ceil(h / f), out = new Uint8Array(W * H);
    const cuenta = new Uint16Array(CLASES.length);
    for (let Y = 0; Y < H; Y += 1) for (let X = 0; X < W; X += 1) {
      cuenta.fill(0);
      let n = 0;
      for (let y = Y * f; y < Math.min(h, Y * f + f); y += 1) for (let x = X * f; x < Math.min(w, X * f + f); x += 1) {
        const c = v[y * w + x];
        if (c !== C.sin_dato) { cuenta[c] += 1; n += 1; }
      }
      let mejor = C.sin_dato, max = 0;
      for (let c = 1; c < CLASES.length; c += 1) if (cuenta[c] > max) { max = cuenta[c]; mejor = c; }
      const rib = cuenta[C.bosque_ribera] + cuenta[C.ribera_sin_bosque];
      if (n && rib * 4 >= n && mejor !== C.agua && mejor !== C.construido) {
        mejor = cuenta[C.bosque_ribera] >= cuenta[C.ribera_sin_bosque] ? C.bosque_ribera : C.ribera_sin_bosque;
      }
      out[Y * W + X] = mejor;
    }
    return { v: out, w: W, h: H };
  }

  /** Resistencias a partir de un raster de clases. */
  function resistencias(clase) {
    const res = new Float32Array(clase.length);
    for (let i = 0; i < clase.length; i += 1) res[i] = clase[i] === C.sin_dato ? Infinity : RESISTENCIA[CLASES[clase[i]]];
    return res;
  }

  function superficie(capas, n) {
    const clase = new Uint8Array(n);
    const v = (k, i) => (capas[k] ? capas[k][i] : NO_DATO);
    for (let i = 0; i < n; i += 1) clase[i] = clasificar(v('sinia', i), v('jrc', i), v('esri', i), v('detalle', i), v('ribera', i));
    return { clase, res: resistencias(clase) };
  }

  /**
   * Remuestrea un raster en EPSG:3857 (p. ej., la banda ribereña) a otra malla EPSG:3857
   * tomando el mínimo de 2 × 2 submuestras por celda (no se pierden cauces estrechos).
   */
  function remuestrear(origen, limO, wO, hO, limD, wD, hD) {
    const Rm = 6378137, mx = (lon) => Rm * lon * Math.PI / 180, my = (lat) => Rm * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const [[sO, oO], [nO, eO]] = limO, [[sD, oD], [nD, eD]] = limD;
    const ax = (mx(eO) - mx(oO)) / wO, ay = (my(nO) - my(sO)) / hO, bx = (mx(eD) - mx(oD)) / wD, by = (my(nD) - my(sD)) / hD;
    const col = (X, f) => Math.floor((mx(oD) + (X + f) * bx - mx(oO)) / ax), fila = (Y, f) => Math.floor((my(nO) - (my(nD) - (Y + f) * by)) / ay);
    const cols = [0.25, 0.75].map((f) => Int32Array.from({ length: wD }, (_, X) => col(X, f)));
    const filas = [0.25, 0.75].map((f) => Int32Array.from({ length: hD }, (_, Y) => fila(Y, f)));
    const out = new Uint8Array(wD * hD).fill(NO_DATO);
    for (let Y = 0; Y < hD; Y += 1) for (let X = 0; X < wD; X += 1) {
      let m = NO_DATO;
      for (const fy of filas) { const y = fy[Y]; if (y < 0 || y >= hO) continue; for (const cx of cols) { const x = cx[X]; if (x >= 0 && x < wO) m = Math.min(m, origen[y * wO + x]); } }
      out[Y * wD + X] = m;
    }
    return out;
  }

  /** Longitud (km) por código de una capa categórica a lo largo de una ruta, solo en celdas fuera del bosque. */
  function composicion(ruta, clase, codigos, w, paso) {
    const km = {};
    for (let k = 1; k < ruta.length; k += 1) {
      const b = ruta[k];
      if (!FUERA_BOSQUE.has(clase[b])) continue;
      const a = ruta[k - 1], diag = (a % w) !== (b % w) && Math.floor(a / w) !== Math.floor(b / w);
      // Código detallado si existe; si no, la clase del modelo (p. ej., «otras_tierras»).
      const cod = codigos && codigos[b] !== NO_DATO ? codigos[b] : CLASES[clase[b]];
      km[cod] = (km[cod] || 0) + (diag ? paso * Math.SQRT2 : paso) / 1000;
    }
    return km;
  }

  // Montículo binario mínimo con borrado perezoso, sobre arreglos tipados que crecen.
  function monticulo(cap) {
    let k = new Float64Array(cap), v = new Int32Array(cap), n = 0;
    return {
      get size() { return n; },
      push(clave, valor) {
        if (n === k.length) { const k2 = new Float64Array(n * 2); k2.set(k); k = k2; const v2 = new Int32Array(n * 2); v2.set(v); v = v2; }
        let i = n; n += 1;
        while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= clave) break; k[i] = k[p]; v[i] = v[p]; i = p; }
        k[i] = clave; v[i] = valor;
      },
      pop() {
        const top = v[0], ck = k[0];
        n -= 1;
        const kl = k[n], vl = v[n];
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c += 1;
          if (k[c] >= kl) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = kl; v[i] = vl;
        return [top, ck];
      },
    };
  }

  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  /** Costo acumulado desde las celdas fuente (máscara) y celda previa de cada ruta óptima. */
  function costoAcumulado(res, w, h, fuentes, paso) {
    const n = w * h, costo = new Float64Array(n).fill(Infinity), previo = new Int32Array(n).fill(-1);
    const q = monticulo(1 << 16), diag = paso * Math.SQRT2;
    for (let i = 0; i < n; i += 1) if (fuentes[i] && Number.isFinite(res[i])) { costo[i] = 0; q.push(0, i); }
    while (q.size) {
      const [i, c] = q.pop();
      if (c > costo[i]) continue;
      const x = i % w, y = (i - x) / w;
      for (let d = 0; d < 8; d += 1) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!Number.isFinite(res[j])) continue;
        const nc = c + (res[i] + res[j]) / 2 * (d < 4 ? paso : diag);
        if (nc < costo[j]) { costo[j] = nc; previo[j] = i; q.push(nc, j); }
      }
    }
    return { costo, previo };
  }

  /** Celdas de la ruta desde `inicio` hasta la fuente, siguiendo las celdas previas. */
  function trazar(previo, inicio) {
    const ruta = [];
    for (let i = inicio, guard = 0; i >= 0 && guard < previo.length; i = previo[i], guard += 1) ruta.push(i);
    return ruta;
  }

  /** Celda de la máscara con menor costo (o -1 si ninguna es alcanzable). */
  function mejorCelda(costo, mascara) {
    let mejor = -1, min = Infinity;
    for (let i = 0; i < costo.length; i += 1) if (mascara[i] && costo[i] < min) { min = costo[i]; mejor = i; }
    return mejor;
  }

  /** Franja de rutas casi óptimas: costoParche + costoTramo ≤ óptimo × (1 + tolerancia). */
  function franja(costoParche, costoTramo, optimo, tolerancia) {
    const lim = optimo * (1 + tolerancia), out = new Uint8Array(costoParche.length);
    let celdas = 0;
    for (let i = 0; i < out.length; i += 1) if (costoParche[i] + costoTramo[i] <= lim) { out[i] = 1; celdas += 1; }
    return { mascara: out, celdas };
  }

  /** Longitud de la ruta por clase de cobertura y tramos continuos fuera del bosque. */
  function resumir(ruta, clase, w, paso) {
    const km = Object.fromEntries(CLASES.map((c) => [c, 0]));
    let total = 0, tramosFuera = 0, fueraPrev = false;
    for (let k = 1; k < ruta.length; k += 1) {
      const a = ruta[k - 1], b = ruta[k];
      const diag = (a % w) !== (b % w) && Math.floor(a / w) !== Math.floor(b / w);
      const d = (diag ? paso * Math.SQRT2 : paso) / 1000;
      total += d;
      // Cada paso se reparte entre las dos celdas que une.
      km[CLASES[clase[a]]] += d / 2; km[CLASES[clase[b]]] += d / 2;
      const fuera = FUERA_BOSQUE.has(clase[b]);
      if (fuera && !fueraPrev) tramosFuera += 1;
      fueraPrev = fuera;
    }
    const r = (x) => Math.round(x * 100) / 100;
    return {
      longitud_km: r(total),
      km: Object.fromEntries(Object.entries(km).map(([c, v]) => [c, r(v)])),
      fuera_bosque_km: r(km.regeneracion + km.otras_tierras + km.construido + km.agua + km.ribera_sin_bosque),
      por_bosque_km: r(km.bosque + km.bosque_degradado + km.bosque_ribera),
      tramos_fuera_bosque: tramosFuera,
    };
  }

  /** Rasteriza polígonos GeoJSON en una malla (relleno par-impar por filas, centro de celda). */
  function rasterizar(geo, aPixel, w, h, mascara = new Uint8Array(w * h)) {
    const anillosDe = (g) => {
      if (!g) return [];
      if (g.type === 'FeatureCollection') return g.features.flatMap((f) => anillosDe(f.geometry));
      if (g.type === 'Feature') return anillosDe(g.geometry);
      if (g.type === 'Polygon') return g.coordinates;
      if (g.type === 'MultiPolygon') return g.coordinates.flat();
      return [];
    };
    const anillos = anillosDe(geo).map((a) => a.map(([lon, lat]) => aPixel(lon, lat)));
    if (!anillos.length) return mascara;
    let y0 = Infinity, y1 = -Infinity;
    anillos.forEach((a) => a.forEach(([, y]) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    for (let fila = Math.max(0, Math.floor(y0)); fila <= Math.min(h - 1, Math.ceil(y1)); fila += 1) {
      const yc = fila + 0.5, xs = [];
      for (const a of anillos) for (let i = 0, j = a.length - 1; i < a.length; j = i, i += 1) {
        const [xa, ya] = a[i], [xb, yb] = a[j];
        if ((ya > yc) !== (yb > yc)) xs.push(xa + (yc - ya) / (yb - ya) * (xb - xa));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x += 1) mascara[fila * w + x] = 1;
      }
    }
    return mascara;
  }

  const api = { RESISTENCIA, CLASES, C, FUERA_BOSQUE, BANDA_RIBERA, reducir, reducirClases, clasificar, superficie, resistencias, remuestrear, composicion, costoAcumulado, trazar, mejorCelda, franja, resumir, rasterizar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_RUTAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
