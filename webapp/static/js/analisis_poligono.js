/* Análisis de un polígono dibujado o subido, sin Earth Engine en el navegador.
   Usa los mapas de valores precalculados por subcuenca (PNG en escala de grises,
   *.v.png) y aplica las mismas reglas de chcp/nucleo/metodologia_indice.py
   (comprobado en tests/test_analisis_poligono_js.py). */
(function (raiz) {
  'use strict';

  // Parámetros de MT-2026.7 (deben coincidir con metodologia_indice.py; lo verifica la prueba).
  const UMBRALES = {
    hansen_post_2020_ha: 0.18, jrc_deforestacion_ha: 0.5, jrc_deforestacion_pct: 1.0, jrc_degradacion_ha: 2.0,
    jrc_degradacion_pct: 5.0, esri_salida_arboles_ha: 0.10, esri_salida_arboles_pct: 5.0, gedi_dosel_bajo_m: 8.0,
    gedi_cobertura_minima_pct: 20.0, gedi_linea_base_minima_pct: 10.0, ndvi_disminucion_ha: 0.12,
    ndvi_disminucion_pct: 5.0, ndvi_cobertura_minima_pct: 70.0,
  };
  const ANIOS_HANSEN = [21, 22, 23, 24, 25];
  const PESOS = { tmf: 2.0, hansen: 2.0, esri: 1.5, gedi: 0.5, ndvi: 0.5 };
  const MAXIMO = 6.5;
  const VISITA = { aporte_maximo_corredor: 1.5, porcentaje_saturacion_corredor: 25.0, aporte_maximo_solapamiento: 1.0, aporte_corredor_mesoamericano: 0.5 };
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;

  function clasificar(p) { return p >= 3 ? 'Alta' : p >= 1.5 ? 'Media' : p >= 0.5 ? 'Preventiva' : 'Baja'; }

  function evaluarSenales(m) {
    const U = UMBRALES;
    const gediDisp = m.gedi_cobertura_valida_pct >= U.gedi_cobertura_minima_pct;
    const ndviDisp = m.ndvi_cobertura_valida_pct >= U.ndvi_cobertura_minima_pct;
    return {
      senales: {
        tmf: m.tmf_deforestacion_ha >= U.jrc_deforestacion_ha || m.tmf_deforestacion_pct >= U.jrc_deforestacion_pct || m.tmf_degradacion_ha >= U.jrc_degradacion_ha || m.tmf_degradacion_pct >= U.jrc_degradacion_pct,
        hansen: m.hansen_post_2020_ha >= U.hansen_post_2020_ha,
        esri: m.esri_salida_arboles_ha >= U.esri_salida_arboles_ha && m.esri_salida_arboles_pct >= U.esri_salida_arboles_pct,
        gedi: gediDisp && m.gedi_altura_media_m < U.gedi_dosel_bajo_m && m.linea_base_arborea_pct >= U.gedi_linea_base_minima_pct,
        ndvi: ndviDisp && m.ndvi_disminucion_ha >= U.ndvi_disminucion_ha && m.ndvi_disminucion_pct >= U.ndvi_disminucion_pct,
      },
      disponibilidad: { gedi: gediDisp, ndvi: ndviDisp },
    };
  }

  function indice(senales) {
    const aportes = Object.fromEntries(Object.keys(PESOS).map((k) => [k, senales[k] ? PESOS[k] : 0]));
    const puntaje = r1(Object.values(aportes).reduce((s, v) => s + v, 0));
    return { aportes, puntaje, prioridad: clasificar(puntaje) };
  }

  function consistencia(senales, m) {
    const U = UMBRALES;
    const deterioro = [['JRC TMF', senales.tmf], ['Hansen GFC', senales.hansen], ['ESRI LULC', senales.esri]].filter((x) => x[1]).map((x) => x[0]);
    const recTmf = m.tmf_recuperacion_ha >= U.jrc_deforestacion_ha || m.tmf_recuperacion_pct >= U.jrc_deforestacion_pct;
    const ganEsri = m.esri_ganancia_arboles_ha >= U.esri_salida_arboles_ha && m.esri_ganancia_arboles_pct >= U.esri_salida_arboles_pct;
    const recuperacion = [['JRC TMF (regeneración forestal)', recTmf], ['ESRI LULC (ganancia de árboles)', ganEsri]].filter((x) => x[1]).map((x) => x[0]);
    const nivel = deterioro.length && recuperacion.length ? 'Lectura mixta' : deterioro.length === 3 ? 'Alta consistencia' : deterioro.length === 2 ? 'Consistencia parcial' : 'Sin señal consistente';
    return { nivel, fuentes_deterioro: deterioro, fuentes_recuperacion: recuperacion };
  }

  function estructura(red) {
    if (!red || red.numero_parches == null) return { disponible: false, estado: 'No evaluada', requiere_focalizacion: false };
    const n = red.numero_parches, c = red.numero_componentes, may = red.porcentaje_nodos_componente_mayor;
    if (n === 0) return { disponible: true, estado: 'Sin bosque identificado', requiere_focalizacion: true };
    if (n === 1) return { disponible: true, estado: 'Un solo parche', requiere_focalizacion: false };
    if (c <= 1) return { disponible: true, estado: 'Conectada al umbral', requiere_focalizacion: false };
    if (may >= 75) return { disponible: true, estado: 'Conectividad predominante', requiere_focalizacion: true };
    if (may >= 50) return { disponible: true, estado: 'Conectividad intermedia', requiere_focalizacion: true };
    return { disponible: true, estado: 'Red dividida', requiere_focalizacion: true };
  }

  function prioridadVisita(puntajeCambios, corredores, red) {
    const V = VISITA;
    const porcentaje = Math.max(0, Math.min(100, Number(corredores.porcentaje_aoi_en_corredores || 0)));
    const intersecta = !!corredores.intersecta && porcentaje > 0;
    const meso = intersecta && !!corredores.intersecta_mesoamericano;
    const solap = intersecta ? Math.min(porcentaje / V.porcentaje_saturacion_corredor, V.aporte_maximo_solapamiento) : 0;
    const aporte = r2(Math.min(solap + (meso ? V.aporte_corredor_mesoamericano : 0), V.aporte_maximo_corredor));
    const pc = r1(Math.max(0, Math.min(MAXIMO, puntajeCambios)));
    const integrado = r2(pc + aporte);
    let prioridad;
    if (pc < 0.5) prioridad = aporte >= 0.5 ? 'Preventiva' : 'Baja';
    else if (pc >= 3 && aporte >= 1) prioridad = 'Muy alta';
    else if (integrado >= 3) prioridad = 'Alta';
    else if (integrado >= 1.5) prioridad = 'Media';
    else if (integrado >= 0.5) prioridad = 'Preventiva';
    else prioridad = 'Baja';
    const valor = !intersecta ? 'Sin intersección' : aporte >= 1 ? 'Alto' : aporte >= 0.5 ? 'Medio' : 'Contextual';
    const est = estructura(red);
    const cambio = pc >= 0.5, foco = est.disponible && est.requiere_focalizacion;
    const combinacion = cambio && intersecta && foco ? 'Cambios + corredor + estructura' : cambio && intersecta ? 'Cambios + corredor' : cambio && foco ? 'Cambios + estructura'
      : cambio ? 'Cambios recientes' : intersecta && foco ? 'Corredor + estructura preventiva' : intersecta ? 'Corredor preventivo' : foco ? 'Estructura preventiva' : 'Monitoreo ordinario';
    return { puntaje_cambios: pc, aporte_corredor: aporte, puntaje_integrado: integrado, prioridad_visita: prioridad, valor_corredor: valor, contexto_estructural: est, combinacion_territorial: combinacion };
  }

  /** Métricas del evaluador a partir de superficies acumuladas (ha) en el polígono. */
  function metricas(a) {
    const area = a.area_ha || 0;
    const pct = (v) => (area ? v / area * 100 : 0);
    return {
      area_ha: area,
      tmf_deforestacion_ha: a.jrc[3] || 0, tmf_deforestacion_pct: pct(a.jrc[3] || 0),
      tmf_degradacion_ha: a.jrc[2] || 0, tmf_degradacion_pct: pct(a.jrc[2] || 0),
      tmf_recuperacion_ha: a.jrc[4] || 0, tmf_recuperacion_pct: pct(a.jrc[4] || 0),
      // Solo los años de pérdida 2021–2025: ningún otro código cuenta como pérdida.
      hansen_post_2020_ha: ANIOS_HANSEN.reduce((s, y) => s + (a.hansen[y] || 0), 0),
      esri_salida_arboles_ha: a.esri[1] || 0, esri_salida_arboles_pct: pct(a.esri[1] || 0),
      esri_ganancia_arboles_ha: a.esri[2] || 0, esri_ganancia_arboles_pct: pct(a.esri[2] || 0),
      gedi_altura_media_m: a.gedi_n ? a.gedi_suma / a.gedi_n : 0,
      gedi_cobertura_valida_pct: pct(a.gedi_valido_ha), linea_base_arborea_pct: pct(a.linea_base_ha),
      ndvi_disminucion_ha: a.ndvi_descenso_ha, ndvi_disminucion_pct: pct(a.ndvi_descenso_ha), ndvi_cobertura_valida_pct: pct(a.ndvi_valido_ha),
    };
  }

  /** Acumula superficies dentro de la máscara del polígono para una subcuenca.
      capas: {clave: Uint8Array (un byte por píxel)}; mascara: Uint8Array (1 = dentro);
      corredor: Uint8Array (0 fuera, 1 corredor, 2 mesoamericano) o null. */
  function acumular(acc, capas, mascara, corredor, haPixel, codec) {
    const aux = capas.aux;
    const n = mascara.length;
    const sumar = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };
    const cont = (clave, q) => (codec[clave].tipo === 'continuo' ? codec[clave].minimo + q * codec[clave].paso : q);
    for (let i = 0; i < n; i += 1) {
      if (!mascara[i] || !aux || aux[i] === 255) continue;
      acc.area_ha += haPixel;
      const b = aux[i];
      if (b & 1) acc.linea_base_ha += haPixel;
      if (b & 2) acc.ndvi_valido_ha += haPixel;
      if (b & 4) acc.ndvi_descenso_ha += haPixel;
      if ((b & 8) && capas.gedi && capas.gedi[i] !== 255) { acc.gedi_valido_ha += haPixel; acc.gedi_suma += cont('gedi', capas.gedi[i]); acc.gedi_n += 1; }
      for (const [clave, destino] of [['jrc_2025', 'jrc'], ['hansen', 'hansen'], ['esri_cambio', 'esri'], ['sinia_2021', 'sinia'], ['coincidencia', 'coincidencia'], ['riparia', 'riparia']]) {
        const c = capas[clave];
        if (c && c[i] !== 255) sumar(acc[destino], c[i], haPixel);
      }
      for (const [clave, destino] of [['eri', 'eri'], ['ndvi_cambio', 'ndvi']]) {
        const c = capas[clave];
        if (c && c[i] !== 255) { acc[`${destino}_suma`] += cont(clave, c[i]); acc[`${destino}_n`] += 1; }
      }
      if (corredor && corredor[i]) { acc.corredor_ha += haPixel; if (corredor[i] === 2) acc.meso = true; }
    }
    return acc;
  }
  const nuevoAcumulador = () => ({ area_ha: 0, linea_base_ha: 0, ndvi_valido_ha: 0, ndvi_descenso_ha: 0, gedi_valido_ha: 0, gedi_suma: 0, gedi_n: 0, jrc: {}, hansen: {}, esri: {}, sinia: {}, coincidencia: {}, riparia: {}, eri_suma: 0, eri_n: 0, ndvi_suma: 0, ndvi_n: 0, corredor_ha: 0, meso: false, pixeles_m: [] });

  /** Evaluación completa a partir del acumulador y de la red de parches. */
  function evaluar(acc, red) {
    const m = metricas(acc);
    const { senales, disponibilidad } = evaluarSenales(m);
    const ind = indice(senales);
    const cons = consistencia(senales, m);
    const corredores = { intersecta: acc.corredor_ha > 0, porcentaje_aoi_en_corredores: acc.area_ha ? acc.corredor_ha / acc.area_ha * 100 : 0, intersecta_mesoamericano: acc.meso };
    return { metricas: m, senales, disponibilidad, ...ind, consistencia: cons, corredores, visita: prioridadVisita(ind.puntaje, corredores, red),
      eri_medio: acc.eri_n ? acc.eri_suma / acc.eri_n : null, ndvi_delta_medio: acc.ndvi_n ? acc.ndvi_suma / acc.ndvi_n : null };
  }

  // ------------------------------------------------------------ fragmentación en un polígono
  // Mismas profundidades de borde que chcp/nucleo/metricas_paisaje.py (lo verifica la prueba).
  const PROFUNDIDADES_BORDE_M = [50, 100, 200];
  const INF = 1e20;
  /** Transformada de distancia euclídea exacta (Felzenszwalb y Huttenlocher, 2012) en una línea. */
  function edt1d(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q += 1) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k -= 1; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k += 1; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q += 1) { while (z[k + 1] < q) k += 1; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  }
  /** Distancia al cuadrado (en celdas) de cada celda a la celda «fuente» más cercana. */
  function distanciaCuadrada(fuente, w, h) {
    const out = new Float64Array(w * h);
    for (let i = 0; i < out.length; i += 1) out[i] = fuente[i] ? 0 : INF;
    const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x += 1) { for (let y = 0; y < h; y += 1) f[y] = out[y * w + x]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y += 1) out[y * w + x] = d[y]; }
    for (let y = 0; y < h; y += 1) { for (let x = 0; x < w; x += 1) f[x] = out[y * w + x]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x += 1) out[y * w + x] = d[x]; }
    return out;
  }
  /**
   * Fragmentación del bosque oficial dentro de un polígono, sobre una malla métrica.
   * bosque: 1 = bosque, 0 = no bosque conocido, 2 = sin dato (fuera de las subcuencas cargadas).
   * dentro: 1 = la celda está dentro del polígono. La malla incluye un margen exterior.
   * El límite del polígono no es borde de bosque: borde y bosque interior se miden contra el
   * no bosque real, también fuera del polígono (dentro del margen), para no crear bordes artificiales.
   */
  function fragmentacion(bosque, dentro, w, h, celda, profundidades = PROFUNDIDADES_BORDE_M) {
    const haCelda = celda * celda / 10000;
    let nArea = 0, nBosque = 0, borde = 0;
    const etiqueta = new Int32Array(w * h), pila = new Int32Array(w * h);
    const tam = [], fuera = [];
    for (let i = 0; i < w * h; i += 1) {
      if (!dentro[i] || bosque[i] === 2) continue;
      nArea += 1;
      if (bosque[i] !== 1) continue;
      nBosque += 1;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && bosque[i - 1] === 0) borde += 1;
      if (x < w - 1 && bosque[i + 1] === 0) borde += 1;
      if (y > 0 && bosque[i - w] === 0) borde += 1;
      if (y < h - 1 && bosque[i + w] === 0) borde += 1;
      if (etiqueta[i]) continue;
      // Fragmento: bosque contiguo (8 vecinos) dentro del polígono.
      const id = tam.length + 1; let n = 0, sale = false, top = 0;
      pila[top++] = i; etiqueta[i] = id;
      while (top) {
        const j = pila[--top]; n += 1;
        const jx = j % w, jy = (j - jx) / w;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = jx + dx, ny = jy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (bosque[k] !== 1) continue;
          if (!dentro[k]) { sale = true; continue; }
          if (!etiqueta[k]) { etiqueta[k] = id; pila[top++] = k; }
        }
      }
      tam.push(n); fuera.push(sale);
    }
    const areaHa = nArea * haCelda, bosqueHa = nBosque * haCelda;
    const noBosque = new Uint8Array(w * h);
    for (let i = 0; i < noBosque.length; i += 1) noBosque[i] = bosque[i] === 0 ? 1 : 0;
    const d2 = distanciaCuadrada(noBosque, w, h);
    const nucleo = profundidades.map((p) => {
      // Celda interior: su centro está a ≥ p m del borde (borde = centro del no bosque − media celda).
      let n = 0;
      for (let i = 0; i < d2.length; i += 1) if (dentro[i] && bosque[i] === 1 && Math.sqrt(d2[i]) * celda - celda / 2 >= p) n += 1;
      return { profundidad_m: p, area_nucleo_ha: n * haCelda, porcentaje_bosque_nucleo: nBosque ? n / nBosque * 100 : 0 };
    });
    const mayor = tam.length ? Math.max(...tam) : 0;
    return {
      celda_m: celda,
      area_ha: areaHa,
      area_bosque_ha: bosqueHa,
      porcentaje_bosque: areaHa ? bosqueHa / areaHa * 100 : 0,
      numero_fragmentos: tam.length,
      fragmentos_continuan_fuera: fuera.filter(Boolean).length,
      fragmento_mayor_ha: mayor * haCelda,
      indice_fragmento_mayor_pct: areaHa ? mayor * haCelda / areaHa * 100 : 0,
      area_media_fragmento_ha: tam.length ? bosqueHa / tam.length : 0,
      borde_m: borde * celda,
      densidad_borde_m_ha: areaHa ? borde * celda / areaHa : 0,
      area_nucleo: nucleo,
    };
  }

  // ------------------------------------------------------------ geometría
  const R = 6378137;
  const merc = (lon, lat) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
  /** Transformación lon/lat → píxel para la malla de una subcuenca. */
  function transformador(limites, ancho, alto) {
    const [[s, o], [n, e]] = limites;
    const [x0, y0] = merc(o, s), [x1, y1] = merc(e, n);
    return (lon, lat) => { const [x, y] = merc(lon, lat); return [(x - x0) / (x1 - x0) * ancho, (y1 - y) / (y1 - y0) * alto]; };
  }
  /** Anillos exteriores e interiores de un GeoJSON (Polygon/MultiPolygon/Feature/FeatureCollection). */
  function poligonos(g) {
    if (!g) return [];
    if (g.type === 'FeatureCollection') return g.features.flatMap((f) => poligonos(f));
    if (g.type === 'Feature') return poligonos(g.geometry);
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    if (g.type === 'GeometryCollection') return g.geometries.flatMap(poligonos);
    return [];
  }
  function areaHa(g) {
    let total = 0;
    for (const anillos of poligonos(g)) anillos.forEach((anillo, k) => {
      const lat0 = anillo.reduce((s, p) => s + p[1], 0) / anillo.length;
      const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
      let a = 0;
      for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) a += (anillo[j][0] * kx) * (anillo[i][1] * ky) - (anillo[i][0] * kx) * (anillo[j][1] * ky);
      total += (k === 0 ? 1 : -1) * Math.abs(a / 2);
    });
    return total / 10000;
  }
  function caja(g) {
    const pts = poligonos(g).flat(2);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  /** Lee el primer polígono de un KML (coordenadas «lon,lat[,alt]»). */
  function leerKml(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    const polys = [...doc.getElementsByTagName('Polygon')].map((p) => {
      const anillo = (tag) => [...p.getElementsByTagName(tag)].map((b) => b.getElementsByTagName('coordinates')[0]?.textContent.trim().split(/\s+/).map((c) => c.split(',').slice(0, 2).map(Number)));
      return [...anillo('outerBoundaryIs'), ...anillo('innerBoundaryIs')].filter((a) => a && a.length >= 4);
    }).filter((p) => p.length);
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }

  const api = { UMBRALES, PESOS, VISITA, PROFUNDIDADES_BORDE_M, clasificar, evaluarSenales, indice, consistencia, prioridadVisita, estructura, metricas, acumular, nuevoAcumulador, evaluar, distanciaCuadrada, fragmentacion, transformador, poligonos, areaHa, caja, leerKml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_POLIGONO = api;
})(typeof window !== 'undefined' ? window : globalThis);
