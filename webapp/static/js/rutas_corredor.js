/* Rutas de menor costo desde un parche de bosque hasta el Corredor Biológico Mesoamericano.
   Procesamiento tipo C (estimación local en el navegador) sobre los rasters precalculados de la
   cuenca (malla EPSG:3857). No es un corredor oficial: es un modelo de resistencia explícito
   (valores en RESISTENCIA) para explorar por dónde una conexión cruzaría menos terreno hostil.

   Método: costo acumulado (Dijkstra, 8 vecinos) desde cada tramo del corredor; la ruta se
   reconstruye desde la celda del parche con menor costo. La franja de alternativas reúne las
   celdas cuya ruta parche → celda → corredor cuesta como máximo (1 + tolerancia) veces la
   ruta óptima (corredor de menor costo, como en Linkage Mapper). Fuera de la cuenca no hay
   cobertura conocida y no se permite el paso. */
(function (raiz) {
  // Resistencia relativa por tipo de cobertura (1 = bosque sin perturbación). Supuesto del
  // modelo, documentado en docs/DECISIONES_METODOLOGICAS.md; no proviene de una especie concreta.
  const RESISTENCIA = { bosque: 1, bosque_degradado: 2, regeneracion: 5, otras_tierras: 25, construido: 100, agua: 1000 };
  const CLASES = ['sin_dato', 'bosque', 'bosque_degradado', 'regeneracion', 'otras_tierras', 'construido', 'agua'];
  const NO_DATO = 255;
  const ESRI_CONSTRUIDO = 7;

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

  /** Clase de cobertura (índice en CLASES) a partir de SINIA 2021, JRC 2025 y ESRI 2024 (opcional). */
  function clasificar(s, j, e) {
    if (s === 3 || (s === NO_DATO && j === 5)) return 6;
    if (s === NO_DATO && j === NO_DATO) return 0;
    if (e === ESRI_CONSTRUIDO) return 5;
    if (s === 1) return j === 2 || j === 3 ? 2 : 1;
    if (s === 2) return j === 4 ? 3 : 4;
    // Sin SINIA: se usa JRC.
    return { 1: 1, 2: 2, 4: 3, 5: 6 }[j] || 4;
  }

  function superficie(capas, n) {
    const clase = new Uint8Array(n), res = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const c = clasificar(capas.sinia ? capas.sinia[i] : NO_DATO, capas.jrc ? capas.jrc[i] : NO_DATO, capas.esri ? capas.esri[i] : NO_DATO);
      clase[i] = c;
      res[i] = c === 0 ? Infinity : RESISTENCIA[CLASES[c]];
    }
    return { clase, res };
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
      const fuera = clase[b] >= 3;
      if (fuera && !fueraPrev) tramosFuera += 1;
      fueraPrev = fuera;
    }
    const r = (x) => Math.round(x * 100) / 100;
    return {
      longitud_km: r(total),
      km: Object.fromEntries(Object.entries(km).map(([c, v]) => [c, r(v)])),
      fuera_bosque_km: r(km.regeneracion + km.otras_tierras + km.construido + km.agua),
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

  const api = { RESISTENCIA, CLASES, reducir, clasificar, superficie, costoAcumulado, trazar, mejorCelda, franja, resumir, rasterizar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_RUTAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
