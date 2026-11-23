/* Simulador de restauración para la conectividad estructural (escenarios A y B frente al actual).
   Todo se calcula en el navegador sobre la red precalculada de cada subcuenca. Una franja
   restaurada se modela como un enlace nuevo entre dos parches; su superficie no se suma al
   hábitat, de modo que los resultados son conservadores y estrictamente estructurales. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, mapFile } = window.CHCP;
  const R = window.CHCP_RED;
  const PALETA = ['#1b7837', '#2166ac', '#b2182b', '#762a83', '#e08214', '#01665e', '#c51b7d', '#8c510a', '#4d9221', '#35978f', '#5e3c99', '#d6604d'];
  const st = {
    data: null, territory: null, id: null, geo: null, areas: null, aristas: [], umbral: 500, paisaje: 0,
    prep: null, candidatos: [], esc: 'A', escenarios: { A: [], B: [] }, unir: null, map: null, capas: {},
    rutas: { activo: false, base: null, capa: null, ultimo: null, tolerancia: 0.1 },
  };
  const RC = window.CHCP_RUTAS;
  const P = window.CHCP_POLIGONO;
  const pct = (v, d = 1) => `${number(v, d)} %`;
  // mejor = 'alto' o 'bajo': colorea en verde la mejora y en rojo el empeoramiento
  const delta = (v, base, d = 1, suf = '', mejor = 'alto') => {
    const x = v - base;
    if (Math.abs(x) < 10 ** -d / 2) return '<span class="rs-eq">=</span>';
    const bueno = mejor === 'alto' ? x > 0 : x < 0;
    return `<span class="${bueno ? 'rs-up' : 'rs-down'}">${x > 0 ? '+' : '−'}${number(Math.abs(x), d)}${suf}</span>`;
  };

  // ---------------------------------------------------------------- escenarios
  const enlaces = (s) => st.aristas.concat(st.escenarios[s].map((x) => [x.a, x.b]));
  const haRestaurada = (s) => st.escenarios[s].reduce((t, x) => t + x.d * x.ancho / 10_000, 0);
  function guardarHash() {
    const cod = (s) => st.escenarios[s].map((x) => `${x.a}-${x.b}-${Math.round(x.d)}-${x.ancho}`).join('_');
    history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(st.id)}${st.escenarios.A.length ? `&A=${cod('A')}` : ''}${st.escenarios.B.length ? `&B=${cod('B')}` : ''}`);
  }
  function leerHash() {
    const q = new URLSearchParams(location.search);
    for (const s of ['A', 'B']) {
      st.escenarios[s] = (q.get(s) || '').split('_').filter(Boolean).map((t) => {
        const [a, b, d, ancho] = t.split('-').map(Number);
        if (!st.areas.has(a) || !st.areas.has(b)) return null;
        const c = R.masCercano(st.prep.get(a), st.prep.get(b));
        return { a, b, d: d || c.d, ancho: ancho || 60, linea: [c.a, c.b], tipo: 'franja' };
      }).filter(Boolean);
    }
  }
  function agregar(item) {
    const lista = st.escenarios[st.esc];
    const i = lista.findIndex((x) => (x.a === item.a && x.b === item.b) || (x.a === item.b && x.b === item.a));
    if (i >= 0) lista.splice(i, 1); else lista.push({ ...item, ancho: Number($('#rs-ancho').value) });
    actualizar();
  }

  // ---------------------------------------------------------------- mapa
  function dibujar() {
    const map = st.map;
    Object.values(st.capas).forEach((c) => c && map.removeLayer(c));
    const r = R.analizar(st.areas, enlaces(st.esc), st.paisaje);
    st.capas.parches = L.geoJSON(st.geo.parches, {
      style: (f) => { const red = r.red.get(f.properties.patch_id); return { color: '#0b3d17', weight: st.unir === f.properties.patch_id ? 3 : 0.6, fillColor: PALETA[red % PALETA.length], fillOpacity: red === 0 ? 0.85 : 0.7 }; },
      onEachFeature: (f, l) => {
        l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · red ${r.red.get(f.properties.patch_id) + 1}`);
        l.on('click', () => clicParche(f.properties.patch_id));
      },
    }).addTo(map);
    const activos = new Set(st.escenarios[st.esc].map((x) => `${Math.min(x.a, x.b)}-${Math.max(x.a, x.b)}`));
    st.capas.candidatos = L.layerGroup(st.candidatos.filter((c) => !activos.has(`${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`)).map((c) => {
      const ll = c.linea.map(([x, y]) => [y, x]);
      const g = L.layerGroup([
        L.polyline(ll, { color: '#e53935', weight: 3.5, dashArray: '7 6' }),
        ...ll.map((p) => L.circleMarker(p, { radius: 4.5, color: '#fff', weight: 1, fillColor: '#e53935', fillOpacity: 1 })),
      ]);
      g.eachLayer((l) => { l.bindTooltip(`Brecha de ${number(c.d, 0)} m entre parches #${c.a} y #${c.b}. Clic para restaurar en el escenario ${st.esc}.`); l.on('click', () => agregar(c)); });
      return g;
    })).addTo(map);
    st.capas.restaurado = L.layerGroup(st.escenarios[st.esc].map((x) => {
      const ll = x.linea.map(([a, b]) => [b, a]);
      const ancho = Math.max(6, Math.min(16, x.ancho / 6));
      const g = L.layerGroup([L.polyline(ll, { color: '#7cb342', weight: ancho + 4, opacity: 0.95 }), L.polyline(ll, { color: '#fff', weight: 2, dashArray: '6 5' })]);
      g.eachLayer((l) => { l.bindTooltip(`Enlace propuesto (franja hipotética) de ${number(x.d, 0)} m × ${x.ancho} m (${hectares(x.d * x.ancho / 10_000, 2)} hipotéticas). Clic para quitar.`); l.on('click', () => agregar(x)); });
      return g;
    })).addTo(map);
  }
  function clicParche(id) {
    if (st.rutas.activo) { rutasDesde(id); return; }
    if (st.unir === null) return;
    if (st.unir === true) { st.unir = id; $('#rs-hint').textContent = `Parche #${id} elegido. Ahora haga clic en el segundo parche.`; dibujar(); return; }
    if (st.unir === id) return;
    const c = R.masCercano(st.prep.get(st.unir), st.prep.get(id));
    const a = st.unir;
    st.unir = null;
    $('#rs-unir').classList.remove('on');
    $('#rs-hint').textContent = '';
    agregar({ a, b: id, d: c.d, linea: [c.a, c.b], tipo: 'franja' });
  }

  // ---------------------------------------------------------------- resultados
  function filaEscenario(s) {
    const r = R.analizar(st.areas, s === 'actual' ? st.aristas : enlaces(s), st.paisaje);
    return { r, ha: s === 'actual' ? 0 : haRestaurada(s), n: s === 'actual' ? 0 : st.escenarios[s].length };
  }
  function lectura(nombre, base, x) {
    if (!x.n) return `<p class="rs-note">El escenario ${nombre} aún no tiene franjas. Haga clic en una brecha roja o use «Unir dos parches».</p>`;
    const unidas = base.r.redes - x.r.redes;
    const iic = base.r.iic ? (x.r.iic - base.r.iic) / base.r.iic * 100 : 0;
    return `<p><b>Escenario ${nombre}:</b> si ${x.n} enlace(s) propuesto(s) (${hectares(x.ha, 2)} hipotéticas) llegaran a existir como bosque, la red estructural ${unidas > 0 ? `uniría ${unidas + 1} redes en una (de ${base.r.redes} a ${x.r.redes} redes)` : 'no uniría redes distintas, pero acortaría caminos dentro de una red'}; la red principal pasaría de ${hectares(base.r.red_mayor_ha, 0)} a ${hectares(x.r.red_mayor_ha, 0)} de bosque conectado y el índice de conectividad integral (IIC) ${iic >= 0 ? 'aumentaría' : 'cambiaría'} un ${number(iic, 1)} %${x.ha > 0 ? ` (${number(iic / x.ha, 2)} % por hectárea restaurada)` : ''}.</p>`;
  }
  function resultados() {
    const base = filaEscenario('actual'), A = filaEscenario('A'), B = filaEscenario('B');
    const filas = [
      ['Redes de bosque separadas', (x) => number(x.r.redes, 0), (x) => delta(x.r.redes, base.r.redes, 0, '', 'bajo'), 'menos es mejor'],
      ['Parches aislados', (x) => number(x.r.aislados, 0), (x) => delta(x.r.aislados, base.r.aislados, 0, '', 'bajo'), 'menos es mejor'],
      ['Bosque en la red principal', (x) => hectares(x.r.red_mayor_ha, 0), (x) => delta(x.r.red_mayor_ha, base.r.red_mayor_ha, 0, ' ha'), 'más es mejor'],
      ['% del bosque en la red principal', (x) => pct(x.r.red_mayor_pct), (x) => delta(x.r.red_mayor_pct, base.r.red_mayor_pct, 1, ' pp'), 'más es mejor'],
      ['Conectividad integral (IIC, 0–1)', (x) => number(x.r.iic, 4), (x) => (base.r.iic ? delta((x.r.iic / base.r.iic - 1) * 100, 0, 1, ' %') : '—'), 'más es mejor'],
      ['Superficie hipotética de las franjas', (x) => hectares(x.ha, 2), () => '', 'largo × ancho elegido; no es un diseño'],
    ];
    const max = Math.max(base.r.iic, A.r.iic, B.r.iic) || 1;
    $('#rs-results').innerHTML = `
      ${window.CHCP.procedencia(st.data, 'C', st.data.territorios[st.id], '<span>Red precalculada (tipo B) recalculada en su navegador</span>')}
      <div class="rs-res-head"><h2>Cambio estructural hipotético de la red</h2><button class="btn btn-s" id="rs-export" type="button">Descargar escenarios (GeoJSON)</button></div>
      <table class="fi-table rs-table"><thead><tr><th>Indicador</th><th>Actual</th><th${st.esc === 'A' ? ' class="on"' : ''}>Escenario A</th><th${st.esc === 'B' ? ' class="on"' : ''}>Escenario B</th></tr></thead><tbody>
      ${filas.map(([n, v, d, h]) => `<tr><td>${n}<small>${h}</small></td><td>${v(base)}</td><td>${v(A)} ${A.n ? d(A) : ''}</td><td>${v(B)} ${B.n ? d(B) : ''}</td></tr>`).join('')}
      </tbody></table>
      <div class="rs-bars">${[['Actual', base, '#90a4ae'], ['A', A, '#43a047'], ['B', B, '#1e88e5']].map(([n, x, c]) => `<div><span>IIC ${n}</span><i><b style="width:${x.r.iic / max * 100}%;background:${c}"></b></i></div>`).join('')}</div>
      ${lectura('A', base, A)}${lectura('B', base, B)}
      <div class="rs-niveles"><b>Qué mide y qué no mide este simulador</b><ul>
        <li><span class="ok">Sí</span> <b>Conexión matemática:</b> agrega un enlace entre dos parches en el grafo (umbral ${number(st.umbral, 0)} m, distancias en UTM 17N).</li>
        <li><span class="ok">Sí</span> <b>Cambio estructural de la red:</b> redes, parches aislados e IIC recalculados con la misma fórmula del motor.</li>
        <li><span class="mid">Aproximado</span> <b>Superficie hipotética:</b> largo entre vértices × ancho elegido; no es un polígono de restauración ni considera tenencia, costos o viabilidad, y no se suma al hábitat.</li>
        <li><span class="no">No</span> <b>Conectividad ecológica potencial para especies:</b> requiere resistencias y distancias de dispersión justificadas.</li>
        <li><span class="no">No</span> <b>Conectividad funcional demostrada:</b> requiere evidencia de movimiento (telemetría, cámaras, genética).</li>
        <li><span class="no">No</span> <b>Restauración efectiva:</b> un enlace propuesto no es bosque restaurado.</li></ul></div>`;
    $('#rs-export').addEventListener('click', exportar);
  }
  function lista() {
    const s = st.escenarios[st.esc];
    $('#rs-list').innerHTML = s.length ? s.map((x, i) => `<li><span>#${x.a} ↔ #${x.b}</span><small>${number(x.d, 0)} m × ${x.ancho} m · ${hectares(x.d * x.ancho / 10_000, 2)}</small><button type="button" data-i="${i}" aria-label="Quitar">×</button></li>`).join('') + `<li class="rs-total"><span>Total</span><small>${hectares(haRestaurada(st.esc), 2)}</small></li>` : '<li class="rs-empty">Sin franjas en este escenario.</li>';
    $$('#rs-list [data-i]').forEach((b) => b.addEventListener('click', () => { st.escenarios[st.esc].splice(Number(b.dataset.i), 1); actualizar(); }));
  }
  function prioridades() {
    const ancho = Number($('#rs-ancho').value);
    const lista = R.priorizar(st.areas, st.aristas, st.paisaje, st.candidatos, ancho).slice(0, 6);
    const rios = st.rios?.features || [], corr = st.territory.corridors?.features || [];
    $('#rs-prior').innerHTML = lista.length ? lista.map((c) => {
      const medio = [(c.linea[0][0] + c.linea[1][0]) / 2, (c.linea[0][1] + c.linea[1][1]) / 2];
      const etiquetas = [];
      if (c.redes_unidas > 0) etiquetas.push('une redes');
      if (rios.length && R.cercaDeLineas(medio, rios, 150)) etiquetas.push('cerca de río');
      const enCorr = corr.find((f) => R.puntoEnPoligono(medio, f.geometry));
      if (enCorr) etiquetas.push(`corredor ${enCorr.properties.categoria_etiqueta || ''}`.trim());
      return `<li><button type="button" data-a="${c.a}" data-b="${c.b}"><b>#${c.a} ↔ #${c.b} <small>${number(c.d, 0)} m · ${hectares(c.ha, 2)}</small></b><span>IIC +${number(c.ganancia_iic_pct, 1)} % · ${number(c.por_ha, 2)} %/ha</span>${etiquetas.length ? `<em>${etiquetas.map(esc).join(' · ')}</em>` : ''}</button></li>`;
    }).join('') : '<li class="rs-empty">No hay brechas candidatas: el bosque ya forma una sola red o los parches están demasiado lejos.</li>';
    $$('#rs-prior [data-a]').forEach((b) => b.addEventListener('click', () => {
      const c = st.candidatos.find((x) => x.a === Number(b.dataset.a) && x.b === Number(b.dataset.b));
      if (c) { agregar(c); st.map.fitBounds(L.latLngBounds(c.linea.map(([x, y]) => [y, x])).pad(2)); }
    }));
  }
  function actualizar() { dibujar(); lista(); resultados(); guardarHash(); }
  function exportar() {
    const features = ['A', 'B'].flatMap((s) => st.escenarios[s].map((x) => ({ type: 'Feature', properties: { escenario: s, parche_a: x.a, parche_b: x.b, longitud_m: Math.round(x.d), ancho_m: x.ancho, superficie_ha: Number((x.d * x.ancho / 10_000).toFixed(3)) }, geometry: { type: 'LineString', coordinates: x.linea } })));
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', name: `restauracion_${st.id}`, features }, null, 1)], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `escenarios_restauracion_${st.id}.geojson`; a.click(); URL.revokeObjectURL(a.href);
  }


  // ---------------------------------------------------------------- rutas al Corredor Mesoamericano
  // Tipo C: rutas de menor costo calculadas en el navegador sobre los rasters de cobertura
  // precalculados de toda la cuenca (ver rutas_corredor.js para el modelo de resistencia).
  const MAX_LADO_RUTAS = 1000;
  function cargarImagen(url) {
    return new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error(url)); im.src = url; });
  }
  async function bytes(url) {
    const im = await cargarImagen(url);
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = new Uint8Array(c.width * c.height);
    for (let i = 0; i < out.length; i += 1) out[i] = d[i * 4];
    return { v: out, w: c.width, h: c.height };
  }
  const tramosMeso = () => (st.territory.corridors?.features || []).filter((f) => f.properties.es_mesoamericano || /mesoamericano/i.test(f.properties.nombre || ''));
  const nombreTramo = (f) => String(f.properties.nombre || '').replace(/^Corredor biol[oó]gico mesoamericano\s*/i, '').replace(/^./, (c) => c.toUpperCase()) || 'Tramo';

  async function baseRutas() {
    if (st.rutas.base) return st.rutas.base;
    const m = st.data.territorios.chcp?.mapas;
    if (!m?.valores?.includes('sinia_2021')) throw new Error('La cuenca todavía no tiene los mapas de cobertura precalculados.');
    const leer = (c) => (m.valores.includes(c) ? bytes(mapFile('chcp', `${c}.v.png`)).catch(() => null) : Promise.resolve(null));
    const [sinia, jrc, esri] = await Promise.all(['sinia_2021', 'jrc_2025', 'esri_2024'].map(leer));
    if (!sinia) throw new Error('No se pudo leer la cobertura SINIA 2021 de la cuenca.');
    const w0 = sinia.w, h0 = sinia.h, f = Math.max(1, Math.ceil(Math.max(w0, h0) / MAX_LADO_RUTAS));
    const red = (x) => (x && x.w === w0 && x.h === h0 ? RC.reducir(x.v, w0, h0, f).v : null);
    const s0 = RC.reducir(sinia.v, w0, h0, f), w = s0.w, h = s0.h;
    const { clase, res } = RC.superficie({ sinia: s0.v, jrc: red(jrc), esri: red(esri) }, w * h);
    const aPix0 = P.transformador(m.limites, w0, h0);
    const aPixel = (lon, lat) => aPix0(lon, lat).map((v) => v / f);
    const [[sur, oeste], [norte, este]] = m.limites;
    const Rm = 6378137, merc = (lon, lat) => [Rm * lon * Math.PI / 180, Rm * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
    const [x0, y0] = merc(oeste, sur), [x1, y1] = merc(este, norte);
    const aLonLat = (px, py) => { const x = x0 + px * f / w0 * (x1 - x0), y = y1 - py * f / h0 * (y1 - y0); return [x / Rm * 180 / Math.PI, (2 * Math.atan(Math.exp(y / Rm)) - Math.PI / 2) * 180 / Math.PI]; };
    const paso = (m.tamano_pixel_m || 100) * f;
    const tramos = tramosMeso().map((feat) => {
      const celdas = RC.rasterizar(feat, aPixel, w, h);
      let n = 0; for (let i = 0; i < celdas.length; i += 1) n += celdas[i] && Number.isFinite(res[i]) ? 1 : 0;
      return { nombre: nombreTramo(feat), celdas, n, ...(n ? RC.costoAcumulado(res, w, h, celdas, paso) : {}) };
    });
    st.rutas.base = { w, h, f, paso, clase, res, aPixel, aLonLat, tramos, construido: Boolean(red(esri)) };
    return st.rutas.base;
  }

  function lineaRuta(b, ruta) {
    // Centros de celda, quitando los puntos intermedios de tramos rectos.
    const pts = ruta.map((i) => [i % b.w, Math.floor(i / b.w)]);
    const out = [];
    pts.forEach((p, k) => {
      if (k > 0 && k < pts.length - 1) {
        const a = pts[k - 1], c = pts[k + 1];
        if (p[0] - a[0] === c[0] - p[0] && p[1] - a[1] === c[1] - p[1]) return;
      }
      const [lon, lat] = b.aLonLat(p[0] + 0.5, p[1] + 0.5);
      out.push([lat, lon]);
    });
    return out;
  }

  function imagenFranja(b, mascara) {
    const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(b.w, b.h);
    for (let i = 0; i < mascara.length; i += 1) if (mascara[i]) { img.data[i * 4] = 123; img.data[i * 4 + 1] = 31; img.data[i * 4 + 2] = 162; img.data[i * 4 + 3] = 95; }
    ctx.putImageData(img, 0, 0);
    const [o, n] = b.aLonLat(0, 0), [e, s] = b.aLonLat(b.w, b.h);
    return L.imageOverlay(c.toDataURL(), [[s, o], [n, e]], { className: 'rs-franja', interactive: false });
  }

  function limpiarRutas() {
    if (st.rutas.capa) st.map.removeLayer(st.rutas.capa);
    st.rutas.capa = null; st.rutas.ultimo = null;
    $('#rs-rutas').innerHTML = ''; $('#rs-rutas').hidden = true;
  }

  async function rutasDesde(id) {
    const caja = $('#rs-rutas');
    caja.hidden = false;
    caja.innerHTML = '<p class="rs-note">Calculando rutas de menor costo hacia el Corredor Biológico Mesoamericano…</p>';
    await new Promise((r) => setTimeout(r, 30));
    let b;
    try { b = await baseRutas(); } catch (error) { caja.innerHTML = `<p class="rs-warn">${esc(error.message)}</p>`; return; }
    const feat = st.geo.parches.features.find((x) => x.properties.patch_id === id);
    let parche = RC.rasterizar(feat, b.aPixel, b.w, b.h);
    if (!parche.some((v, i) => v && Number.isFinite(b.res[i]))) {
      // Parche menor que una celda: se usa la celda de su primer vértice.
      const [lon, lat] = (feat.geometry.type === 'MultiPolygon' ? feat.geometry.coordinates[0][0][0] : feat.geometry.coordinates[0][0]);
      const [px, py] = b.aPixel(lon, lat).map(Math.floor);
      parche = new Uint8Array(b.w * b.h); if (px >= 0 && py >= 0 && px < b.w && py < b.h) parche[py * b.w + px] = 1;
    }
    const desdeParche = RC.costoAcumulado(b.res, b.w, b.h, parche, b.paso);
    const rutas = b.tramos.filter((t) => t.n).map((t) => {
      const dentro = t.celdas.some((v, i) => v && parche[i]);
      const ini = RC.mejorCelda(t.costo, parche);
      if (ini < 0 || !Number.isFinite(t.costo[ini])) return { tramo: t, alcanzable: false };
      const ruta = RC.trazar(t.previo, ini);
      return { tramo: t, alcanzable: true, dentro, ruta, optimo: t.costo[ini], resumen: RC.resumir(ruta, b.clase, b.w, b.paso) };
    }).sort((x, y) => (x.alcanzable ? x.optimo : Infinity) - (y.alcanzable ? y.optimo : Infinity));
    st.rutas.ultimo = { id, area: feat.properties.area_ha, rutas, desdeParche };
    pintarRutas();
  }

  function pintarRutas() {
    const b = st.rutas.base, u = st.rutas.ultimo;
    if (!b || !u) return;
    if (st.rutas.capa) st.map.removeLayer(st.rutas.capa);
    const capas = [];
    const mejor = u.rutas.find((r) => r.alcanzable && !r.dentro);
    if (mejor) {
      const fr = RC.franja(u.desdeParche.costo, mejor.tramo.costo, mejor.optimo, st.rutas.tolerancia);
      capas.push(imagenFranja(b, fr.mascara));
    }
    const lineas = [];
    // Se dibujan de la última a la primera para que la ruta de menor costo quede encima.
    u.rutas.filter((r) => r.alcanzable && !r.dentro).map((r, k) => [r, k]).reverse().forEach(([r, k]) => {
      const ll = lineaRuta(b, r.ruta);
      lineas.push(...ll);
      const principal = k === 0;
      capas.push(L.polyline(ll, { color: '#fff', weight: principal ? 7 : 5, opacity: 0.9, interactive: false }));
      const linea = L.polyline(ll, { color: '#7b1fa2', weight: principal ? 4 : 3, dashArray: principal ? null : '8 6' });
      linea.bindTooltip(`Ruta ${principal ? 'de menor costo' : 'alternativa'} al tramo ${esc(r.tramo.nombre)}: ${number(r.resumen.longitud_km, 1)} km, ${number(r.resumen.fuera_bosque_km, 1)} km fuera del bosque`);
      capas.push(linea);
      capas.push(L.circleMarker(ll[ll.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#7b1fa2', fillOpacity: 1 }).bindTooltip(`Llega al Corredor Mesoamericano · tramo ${esc(r.tramo.nombre)}`));
    });
    st.rutas.capa = L.layerGroup(capas).addTo(st.map);
    if (lineas.length && !u.encuadrado) { st.map.fitBounds(L.latLngBounds(lineas).extend(st.borde.getBounds()), { padding: [24, 24] }); u.encuadrado = true; }
    const filas = u.rutas.map((r, k) => {
      if (!r.alcanzable) return `<tr><td>${esc(r.tramo.nombre)}</td><td colspan="5">Sin ruta posible dentro de la cuenca.</td></tr>`;
      if (r.dentro) return `<tr><td>${esc(r.tramo.nombre)}</td><td colspan="5"><b>El parche ya está dentro de este tramo del corredor.</b></td></tr>`;
      const x = r.resumen, km = (v) => (v > 0 ? `${number(v, 1)} km` : '—');
      return `<tr${k === 0 ? ' class="on"' : ''}><td>${esc(r.tramo.nombre)}${k === 0 ? '<small>menor costo</small>' : ''}</td><td>${number(x.longitud_km, 1)} km</td><td>${km(x.km.bosque + x.km.bosque_degradado)}</td><td><b>${km(x.fuera_bosque_km)}</b>${x.tramos_fuera_bosque ? `<small>en ${x.tramos_fuera_bosque} tramo${x.tramos_fuera_bosque > 1 ? 's' : ''}</small>` : ''}</td><td>${km(x.km.agua)}</td><td>${b.construido ? km(x.km.construido) : '<small>sin capa</small>'}</td></tr>`;
    }).join('');
    const r = RC.RESISTENCIA;
    const sinTramos = !u.rutas.length;
    $('#rs-rutas').innerHTML = `
      <div class="rs-res-head"><h2>Rutas del parche #${u.id} al Corredor Biológico Mesoamericano</h2><button class="btn btn-s" type="button" id="rs-rutas-cerrar">Quitar rutas</button></div>
      ${window.CHCP.procedencia(st.data, 'C', st.data.territorios.chcp, '<span>Rutas de menor costo calculadas en su navegador</span>')}
      ${sinTramos ? '<p class="rs-warn">Ningún tramo del Corredor Mesoamericano cae dentro de la cuenca.</p>' : `
      <table class="fi-table rs-table rs-rutas-t"><thead><tr><th>Tramo de destino</th><th>Longitud</th><th>Por bosque</th><th>Fuera del bosque<small>a restaurar</small></th><th>Sobre agua</th><th>Zona construida</th></tr></thead><tbody>${filas}</tbody></table>
      <label class="rs-field rs-tol">Franja de alternativas<select id="rs-tol">${[0.05, 0.1, 0.2].map((t) => `<option value="${t}"${t === st.rutas.tolerancia ? ' selected' : ''}>hasta ${t * 100} % más costosas que la mejor ruta</option>`).join('')}</select></label>`}
      <details class="rs-supuestos"><summary>Cómo se calculan y qué no dicen</summary>
        <ul>
          <li>Ruta de <b>menor costo</b> sobre la cobertura de toda la cuenca (SINIA 2021 y JRC 2025${b.construido ? ', zonas construidas de ESRI 2024' : ''}), con celdas de unos ${number(b.paso, 0)} m. Resistencias supuestas: bosque ${r.bosque}, bosque degradado ${r.bosque_degradado}, regeneración ${r.regeneracion}, otras tierras ${r.otras_tierras}${b.construido ? `, construido ${r.construido}` : ''}, agua ${r.agua}.</li>
          <li>Los valores de resistencia son un supuesto del modelo, no una medición ni un dato de una especie concreta. Cambiarlos puede cambiar la ruta.</li>
          <li>La <b>franja morada</b> reúne las celdas por las que pasan rutas casi tan buenas como la mejor. Donde es ancha hay varias opciones; donde se estrecha, el paso es obligado.</li>
          <li>Solo se evalúa dentro de la cuenca. ${b.tramos.filter((t) => !t.n).map((t) => `El tramo ${esc(t.nombre)} queda fuera de ella.`).join(' ')}${b.construido ? '' : ' Las zonas urbanas todavía no se distinguen de otras tierras; se incorporarán en la próxima actualización de datos.'}</li>
          <li>Es una ruta hipotética: no es un corredor oficial ni garantiza que la fauna la use. Antes de restaurar hay que verificar en campo, la tenencia de la tierra y el uso actual.</li>
        </ul>
        <p class="rs-note">Tramos del corredor: capa del Almanaque Azul de Panamá.</p>
      </details>`;
    $('#rs-rutas-cerrar').addEventListener('click', limpiarRutas);
    $('#rs-tol')?.addEventListener('change', (e) => { st.rutas.tolerancia = Number(e.target.value); pintarRutas(); });
  }

  // ---------------------------------------------------------------- carga
  async function cargar(id) {
    st.id = id;
    limpiarRutas();
    const t = st.data.territorios[id];
    $('#rs-select').value = id;
    $('#rs-results').innerHTML = '<p class="rs-note">Cargando la red de bosque…</p>';
    Object.values(st.capas).forEach((c) => c && st.map.removeLayer(c));
    st.capas = {};
    const feature = st.territory.subbasins.features.find((f) => f.properties.id === id);
    const borde = L.geoJSON(feature, { style: { color: '#fff', weight: 3, fill: false }, interactive: false }).addTo(st.map);
    if (st.borde) st.map.removeLayer(st.borde);
    st.borde = borde;
    st.map.fitBounds(borde.getBounds(), { padding: [20, 20] });
    try { st.geo = await api(`/api/v1/panel/geometry/${id}`); } catch (_) { st.geo = null; }
    if (!st.geo?.red?.aristas || !st.geo.parches?.features?.length) {
      st.areas = null; st.unir = null;
      $('#rs-unir').classList.remove('on'); $('#rs-unir').disabled = true; $('#rs-hint').textContent = '';
      st.rutas.activo = false; $('#rs-rutas-btn').classList.remove('on'); $('#rs-rutas-btn').disabled = true;
      const listas = disponibles().filter((x) => x.id !== id).slice(0, 8);
      $('#rs-results').innerHTML = `<p class="rs-warn"><b>${esc(t?.nombre || id)}</b> todavía no tiene su red de parches calculada, por eso no aparecen parches para unir. Se generará en la actualización de datos con Earth Engine. Mientras tanto puede revisar su <a href="${window.CHCP_STATIC ? 'ficha.html' : '/ficha'}?id=${encodeURIComponent(id)}">ficha técnica</a>.</p>${listas.length ? `<p class="rs-note">Subcuencas con la red ya disponible: ${listas.map((x) => `<button type="button" class="rs-ir" data-id="${esc(x.id)}">${esc(x.nombre)}</button>`).join(' ')}</p>` : ''}`;
      $$('#rs-results .rs-ir').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.id)));
      $('#rs-prior').innerHTML = ''; $('#rs-list').innerHTML = '';
      return;
    }
    $('#rs-unir').disabled = false; $('#rs-rutas-btn').disabled = false;
    try { st.rios = await (await fetch(mapFile(id, 'rios.json'))).json(); } catch (_) { st.rios = null; }
    if (st.capaRios) st.map.removeLayer(st.capaRios);
    st.capaRios = st.rios ? L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 2, opacity: 0.9 }, interactive: false }).addTo(st.map) : null;
    st.umbral = st.geo.red.umbral_m || st.data.umbral_conectividad_m || 500;
    st.paisaje = st.geo.red.area_paisaje_ha || t.area_ha;
    $('#rs-umbral').textContent = `${number(st.umbral, 0)} m`;
    st.areas = new Map(st.geo.parches.features.map((f) => [f.properties.patch_id, f.properties.area_ha]));
    st.aristas = st.geo.red.aristas.map(([a, b]) => [a, b]);
    const lat0 = feature ? L.geoJSON(feature).getBounds().getCenter().lat : 9.1;
    st.prep = new Map(st.geo.parches.features.map((f) => [f.properties.patch_id, R.preparar(f, lat0)]));
    const base = R.analizar(st.areas, st.aristas, st.paisaje);
    const vistos = new Set();
    const motor = (st.geo.brechas?.features || []).map((f) => ({ a: f.properties.patch_id_origen, b: f.properties.patch_id_destino, d: f.properties.distancia_m, linea: ((c) => [c[0], c.at(-1)])(f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : f.geometry.coordinates), tipo: 'brecha' }));
    const maxDist = Math.max(st.umbral * 4, 2000);
    const entreRedes = st.areas.size <= 2500 ? R.candidatosEntreRedes(st.prep, base.red, maxDist) : [];
    st.candidatos = [...motor, ...entreRedes].filter((c) => {
      if (!st.areas.has(c.a) || !st.areas.has(c.b)) return false;
      const k = `${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`;
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    }).slice(0, 80);
    leerHash();
    prioridades();
    actualizar();
  }

  // ---------------------------------------------------------------- inicio
  try {
    [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory')]);
  } catch (error) {
    $('#rs-results').innerHTML = `<p class="rs-warn">No se pudieron cargar los datos: ${esc(error.message)}</p>`;
    return;
  }
  st.map = L.map('rs-map', { zoomControl: true });
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri World Imagery', maxZoom: 18 }).addTo(st.map);
  const colorCorr = { Alta: '#1b5e20', Mediana: '#9ccc65', 'Media-baja': '#ffb74d' };
  L.geoJSON(st.territory.corridors, { style: (f) => ({ color: colorCorr[f.properties.categoria_etiqueta] || '#7fae00', weight: 1.2, fillColor: colorCorr[f.properties.categoria_etiqueta] || '#a1d303', fillOpacity: 0.12 }), onEachFeature: (f, l) => l.bindTooltip(`${f.properties.nombre} · conectividad ${f.properties.categoria_etiqueta} (Almanaque Azul)`) }).addTo(st.map);
  L.geoJSON({ type: 'FeatureCollection', features: tramosMeso() }, { style: { color: '#4a148c', weight: 1.6, fillColor: '#ce93d8', fillOpacity: 0.22 }, interactive: false }).addTo(st.map);
  // Leyenda: cada símbolo se dibuja con el mismo estilo que usa el mapa.
  const sim = (contenido, fondo) => `<svg class="rs-sym" viewBox="0 0 34 16" aria-hidden="true">${fondo ? `<rect width="34" height="16" rx="3" fill="${fondo}"/>` : ''}${contenido}</svg>`;
  const caja = (c, borde = '#0b3d17', op = 0.85) => `<rect x="4" y="2" width="26" height="12" rx="2" fill="${c}" fill-opacity="${op}" stroke="${borde}" stroke-width="1"/>`;
  const item = (simbolo, titulo, nota) => `<li>${simbolo}<span><b>${titulo}</b>${nota ? `<small>${nota}</small>` : ''}</span></li>`;
  const otrasRedes = `<svg class="rs-sym" viewBox="0 0 34 16" aria-hidden="true">${PALETA.slice(1, 5).map((c, k) => `<rect x="${2 + k * 8}" y="2" width="7" height="12" rx="1.5" fill="${c}" fill-opacity="0.75"/>`).join('')}</svg>`;
  $('#rs-legend').innerHTML = `
    <div class="rs-lg-grupo"><h3>Bosque 2021</h3><ul>
      ${item(sim(caja(PALETA[0])), 'Red principal', 'el conjunto de parches conectados más grande')}
      ${item(otrasRedes, 'Otras redes', 'cada color es una red separada de la principal')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Restauración</h3><ul>
      ${item(sim('<line x1="5" y1="8" x2="29" y2="8" stroke="#e53935" stroke-width="3" stroke-dasharray="5 4"/><circle cx="5" cy="8" r="3.2" fill="#e53935" stroke="#fff"/><circle cx="29" cy="8" r="3.2" fill="#e53935" stroke="#fff"/>'), 'Brecha candidata', 'haga clic para añadirla al escenario')}
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#7cb342" stroke-width="8" stroke-linecap="round"/><line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/>'), 'Enlace propuesto', 'hipotético: aún no es bosque')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Rutas al corredor</h3><ul>
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="6"/><line x1="3" y1="8" x2="31" y2="8" stroke="#7b1fa2" stroke-width="3.5"/>'), 'Ruta de menor costo', 'evita agua y zonas sin bosque')}
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="5"/><line x1="3" y1="8" x2="31" y2="8" stroke="#7b1fa2" stroke-width="2.6" stroke-dasharray="6 4"/>'), 'Ruta a otro tramo', 'más costosa que la principal')}
      ${item(sim('<rect x="2" y="3" width="30" height="10" rx="2" fill="#7b1fa2" fill-opacity="0.38"/>'), 'Franja de alternativas', 'rutas casi igual de buenas')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Referencia</h3><ul>
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="3"/>', '#5b6b5e'), 'Límite de la subcuenca', '')}
      ${item(sim('<path d="M3 11 C10 3, 18 13, 31 5" fill="none" stroke="#1f78b4" stroke-width="2.4"/>'), 'Ríos principales', '')}
      ${item(sim('<rect x="3" y="2" width="28" height="12" rx="2" fill="#ce93d8" fill-opacity="0.45" stroke="#4a148c" stroke-width="1.4"/>'), 'Corredor Biológico Mesoamericano', 'tramos dentro y cerca de la cuenca')}
      ${item(`<svg class="rs-sym" viewBox="0 0 34 16" aria-hidden="true">${['Alta', 'Mediana', 'Media-baja'].map((k, n) => `<rect x="${2 + n * 11}" y="2" width="9" height="12" rx="1.5" fill="${colorCorr[k]}" fill-opacity="0.3" stroke="${colorCorr[k]}" stroke-width="1.2"/>`).join('')}</svg>`, 'Corredores (Almanaque Azul)', 'conectividad alta · mediana · media-baja')}
    </ul></div>`;
  const subs = Object.values(st.data.territorios).filter((t) => t && t.id !== 'chcp').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // red_disponible indica si existe la red de parches precalculada de la subcuenca.
  const pendiente = (t) => (t.red_disponible === undefined ? (t.version_datos ?? 0) < 0 : !t.red_disponible);
  function disponibles() { return subs.filter((t) => !pendiente(t)); }
  function elegir(id) { st.escenarios = { A: [], B: [] }; history.replaceState(null, '', `${location.pathname}?id=${id}`); cargar(id); }
  const opcion = (t) => `<option value="${t.id}">${esc(t.nombre)}${pendiente(t) ? ' · pendiente' : ''}</option>`;
  const listas = disponibles(), faltan = subs.filter(pendiente);
  $('#rs-select').innerHTML = listas.length && faltan.length
    ? `<optgroup label="Con red de parches">${listas.map(opcion).join('')}</optgroup><optgroup label="Pendientes de cálculo">${faltan.map(opcion).join('')}</optgroup>`
    : subs.map(opcion).join('');
  $('#rs-select').addEventListener('change', (e) => elegir(e.target.value));
  $$('#rs-scen button').forEach((b) => b.addEventListener('click', () => {
    st.esc = b.dataset.s;
    $$('#rs-scen button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    if (st.areas) actualizar();
  }));
  $('#rs-rutas-btn').addEventListener('click', (e) => {
    st.rutas.activo = !st.rutas.activo;
    e.currentTarget.classList.toggle('on', st.rutas.activo);
    if (st.rutas.activo) { st.unir = null; $('#rs-unir').classList.remove('on'); }
    $('#rs-hint').textContent = st.rutas.activo ? 'Haga clic en un parche para ver sus rutas al Corredor Mesoamericano.' : '';
    if (st.areas) dibujar();
  });
  $('#rs-unir').addEventListener('click', (e) => {
    st.rutas.activo = false; $('#rs-rutas-btn').classList.remove('on');
    st.unir = st.unir === null ? true : null;
    e.currentTarget.classList.toggle('on', st.unir !== null);
    $('#rs-hint').textContent = st.unir ? 'Haga clic en el primer parche.' : '';
    if (st.areas) dibujar();
  });
  $('#rs-limpiar').addEventListener('click', () => { st.escenarios[st.esc] = []; if (st.areas) actualizar(); });
  $('#rs-ancho').addEventListener('change', () => { if (st.areas) prioridades(); });
  const pedido = new URLSearchParams(location.search).get('id');
  const conRed = listas.find((t) => (t.estructura_2021?.metricas_red?.numero_componentes || 0) > 1) || listas[0] || subs[0];
  cargar(st.data.territorios[pedido] ? pedido : conRed.id);
})();
