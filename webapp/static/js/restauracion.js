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
  };
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

  // ---------------------------------------------------------------- carga
  async function cargar(id) {
    st.id = id;
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
      const listas = disponibles().filter((x) => x.id !== id).slice(0, 8);
      $('#rs-results').innerHTML = `<p class="rs-warn"><b>${esc(t?.nombre || id)}</b> todavía no tiene su red de parches calculada, por eso no aparecen parches para unir. Se generará en la actualización de datos con Earth Engine. Mientras tanto puede revisar su <a href="${window.CHCP_STATIC ? 'ficha.html' : '/ficha'}?id=${encodeURIComponent(id)}">ficha técnica</a>.</p>${listas.length ? `<p class="rs-note">Subcuencas con la red ya disponible: ${listas.map((x) => `<button type="button" class="rs-ir" data-id="${esc(x.id)}">${esc(x.nombre)}</button>`).join(' ')}</p>` : ''}`;
      $$('#rs-results .rs-ir').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.id)));
      $('#rs-prior').innerHTML = ''; $('#rs-list').innerHTML = '';
      return;
    }
    $('#rs-unir').disabled = false;
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
  $('#rs-legend').innerHTML = '<span><i style="background:#1b7837"></i>Red principal</span><span><i style="background:#2166ac"></i>Otras redes (un color por red)</span><span><i class="dash"></i>Brecha candidata</span><span><i class="fr"></i>Enlace propuesto (hipotético)</span><span><i style="background:#1f78b4;height:3px"></i>Ríos principales</span><span><i style="background:#ffb74d55;border:1px solid #ffb74d"></i>Corredor Almanaque Azul</span>';
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
  $('#rs-unir').addEventListener('click', (e) => {
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
