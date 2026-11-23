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
    // Red ampliada (datos v2): subcuenca + margen exterior, aristas con distancia hasta 1 km.
    ampliada: false, objetivo: new Set(), aristasDist: [], distMax: 500, redes: new Map(),
    cruces: new Map(), cob: null, validacion: null, evaluados: [],
  };
  const UMBRALES = [250, 500, 1000];
  const clave = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
  // Efectividad supuesta de un enlace según su ancho: proporción del ancho funcional de
  // referencia (por debajo, buena parte de la franja es borde). Ver DECISIONES_METODOLOGICAS.
  const efectividad = (ancho) => Math.min(1, ancho / Number($('#rs-ref').value || 100));
  const aristasUmbral = (t) => st.aristasDist.filter((x) => x[2] == null || x[2] <= t).map(([a, b]) => [a, b]);
  function redUmbral(t) {
    if (!st.redes.has(t)) st.redes.set(t, R.preparar_red(st.areas, aristasUmbral(t)));
    return st.redes.get(t);
  }
  const umbralesDisponibles = () => UMBRALES.filter((t) => t <= st.distMax);
  const featureParche = (id) => st.geo.parches.features.find((f) => f.properties.patch_id === id) || (st.geo.contexto?.features || []).find((f) => f.properties.patch_id === id);
  const RC = window.CHCP_RUTAS;
  const P = window.CHCP_POLIGONO;
  const pct = (v, d = 1) => `${number(v, d)} %`;
  // Ganancias pequeñas con decimales suficientes para no mostrar «0.0 %» cuando hay mejora.
  const gpct = (v) => (v == null ? '—' : Math.abs(v) >= 0.1 ? `${number(v, 1)} %` : Math.abs(v) >= 0.01 ? `${number(v, 2)} %` : v > 0 ? '< 0.01 %' : '0 %');
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
  const efectividadEscenario = (s) => { const l = st.escenarios[s]; const L0 = l.reduce((t, x) => t + x.d, 0); return L0 ? l.reduce((t, x) => t + x.d * efectividad(x.ancho), 0) / L0 : 1; };
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
    if (st.geo.contexto?.features?.length) {
      st.capas.contexto = L.geoJSON(st.geo.contexto, {
        style: (f) => { const red = r.red.get(f.properties.patch_id); return { color: '#455a64', weight: st.unir === f.properties.patch_id ? 3 : 0.8, dashArray: '3 3', fillColor: PALETA[(red ?? 0) % PALETA.length], fillOpacity: 0.3 }; },
        onEachFeature: (f, l) => {
          l.bindTooltip(`Parche del margen exterior #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · fuera de la subcuenca, se usa como contexto de la red`);
          l.on('click', () => clicParche(f.properties.patch_id));
        },
      }).addTo(map);
    }
    st.capas.parches = L.geoJSON(st.geo.parches, {
      style: (f) => { const red = r.red.get(f.properties.patch_id); return { color: '#0b3d17', weight: st.unir === f.properties.patch_id ? 3 : 0.6, fillColor: PALETA[red % PALETA.length], fillOpacity: red === 0 ? 0.85 : 0.7 }; },
      onEachFeature: (f, l) => {
        const total = st.areas.get(f.properties.patch_id);
        l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} en la subcuenca${total > f.properties.area_ha + 0.01 ? ` (${hectares(total)} en total: continúa fuera)` : ''} · red ${r.red.get(f.properties.patch_id) + 1}`);
        l.on('click', () => clicParche(f.properties.patch_id));
      },
    }).addTo(map);
    const activos = new Set(st.escenarios[st.esc].map((x) => `${Math.min(x.a, x.b)}-${Math.max(x.a, x.b)}`));
    st.capas.candidatos = L.layerGroup(st.candidatos.filter((c) => !activos.has(`${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}`)).map((c) => {
      const ll = c.linea.map(([x, y]) => [y, x]);
      const cr = st.cruces.get(clave(c.a, c.b)), malo = cr?.problema;
      const color = malo ? '#78909c' : '#e53935';
      const g = L.layerGroup([
        L.polyline(ll, { color, weight: 3.5, dashArray: malo ? '2 6' : '7 6' }),
        ...ll.map((p) => L.circleMarker(p, { radius: 4.5, color: '#fff', weight: 1, fillColor: color, fillOpacity: 1 })),
      ]);
      const corta = cr?.fuera_m > 0 ? `<br>Corta el bosque: ${textoComposicion(cr.composicion)}` : '';
      g.eachLayer((l) => { l.bindTooltip(`Brecha de ${number(c.d, 0)} m entre parches #${c.a} y #${c.b}.${malo ? ` <b>Cruza ${esc(textoCruce(cr))}</b>: excluida de las prioridades.` : ''}${corta} <br>Clic para restaurar en el escenario ${st.esc}.`); l.on('click', () => agregar(c)); });
      return g;
    })).addTo(map);
    st.capas.restaurado = L.layerGroup(st.escenarios[st.esc].map((x) => {
      const ll = x.linea.map(([a, b]) => [b, a]);
      const ancho = Math.max(6, Math.min(16, x.ancho / 6));
      const g = L.layerGroup([L.polyline(ll, { color: '#7cb342', weight: ancho + 4, opacity: 0.95 }), L.polyline(ll, { color: '#fff', weight: 2, dashArray: '6 5' })]);
      g.eachLayer((l) => { l.bindTooltip(`Enlace propuesto (franja hipotética) de ${number(x.d, 0)} m × ${x.ancho} m (${hectares(x.d * x.ancho / 10_000, 2)} hipotéticas), efectividad supuesta ${number(efectividad(x.ancho) * 100, 0)} %. Clic para quitar.`); l.on('click', () => agregar(x)); });
      return g;
    })).addTo(map);
    // Los ríos van sobre los parches (se ven dentro del bosque) y bajo brechas y enlaces.
    if (st.capaRios) { st.capaRios.bringToFront(); st.capas.candidatos?.eachLayer?.((g) => g.eachLayer?.((l) => l.bringToFront?.())); st.capas.restaurado?.eachLayer?.((g) => g.eachLayer?.((l) => l.bringToFront?.())); }
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
    const extra = s === 'actual' ? [] : st.escenarios[s].map((x) => [x.a, x.b]);
    const r = R.analizar(st.areas, st.aristas.concat(extra), st.paisaje);
    // Sensibilidad: el mismo escenario con la red construida a cada umbral.
    const sens = Object.fromEntries(umbralesDisponibles().map((t) => [t, extra.length ? R.analizar(st.areas, aristasUmbral(t).concat(extra), st.paisaje).ec_ha : Math.sqrt(redUmbral(t).numerador)]));
    const cruzan = s === 'actual' ? 0 : st.escenarios[s].filter((x) => st.cruces.get(clave(x.a, x.b))?.problema).length;
    return { r, sens, cruzan, ef: s === 'actual' ? 1 : efectividadEscenario(s), ha: s === 'actual' ? 0 : haRestaurada(s), n: s === 'actual' ? 0 : st.escenarios[s].length };
  }
  const gananciaPct = (x, base) => (base.r.ec_ha ? ((x.r.ec_ha / base.r.ec_ha) ** 2 - 1) * 100 : 0);
  function lectura(nombre, base, x) {
    if (!x.n) return `<p class="rs-note">El escenario ${nombre} aún no tiene franjas. Haga clic en una brecha roja o use «Unir dos parches».</p>`;
    const unidas = base.r.redes - x.r.redes;
    const iic = gananciaPct(x, base);
    const aviso = [];
    if (x.ef < 0.999) aviso.push(`Con los anchos elegidos, la efectividad supuesta de los enlaces es del ${number(x.ef * 100, 0)} %; la ganancia ajustada sería de ${number(iic * x.ef, 1)} %.`);
    if (x.cruzan) aviso.push(`${x.cruzan} enlace(s) cruzan agua o zonas construidas: revise si son viables.`);
    return `${aviso.length ? `<p class="rs-warn">${aviso.join(' ')}</p>` : ''}<p><b>Escenario ${nombre}:</b> si ${x.n} enlace(s) propuesto(s) (${hectares(x.ha, 2)} hipotéticas) llegaran a existir como bosque, la red estructural ${unidas > 0 ? `uniría ${unidas + 1} redes en una (de ${base.r.redes} a ${x.r.redes} redes)` : 'no uniría redes distintas, pero acortaría caminos dentro de una red'}; la red principal pasaría de ${hectares(base.r.red_mayor_ha, 0)} a ${hectares(x.r.red_mayor_ha, 0)} de bosque conectado y el índice de conectividad integral (IIC) ${iic >= 0 ? 'aumentaría' : 'cambiaría'} un ${number(iic, 1)} %${x.ha > 0 ? ` (${number(iic / x.ha, 2)} % por hectárea restaurada)` : ''}.</p>`;
  }
  function resultados() {
    const base = filaEscenario('actual'), A = filaEscenario('A'), B = filaEscenario('B');
    const filas = [
      ['Redes de bosque separadas', (x) => number(x.r.redes, 0), (x) => delta(x.r.redes, base.r.redes, 0, '', 'bajo'), 'menos es mejor'],
      ['Parches aislados', (x) => number(x.r.aislados, 0), (x) => delta(x.r.aislados, base.r.aislados, 0, '', 'bajo'), 'menos es mejor'],
      ['Bosque en la red principal', (x) => hectares(x.r.red_mayor_ha, 0), (x) => delta(x.r.red_mayor_ha, base.r.red_mayor_ha, 0, ' ha'), 'más es mejor'],
      ['% del bosque en la red principal', (x) => pct(x.r.red_mayor_pct), (x) => delta(x.r.red_mayor_pct, base.r.red_mayor_pct, 1, ' pp'), 'más es mejor'],
      ['Conectividad integral (IIC, 0–1)', (x) => number(x.r.iic, 4), (x) => (base.r.iic ? delta(gananciaPct(x, base), 0, Math.abs(gananciaPct(x, base)) >= 0.1 ? 1 : 2, ' %') : '—'), `normalizada por ${st.ampliada ? 'subcuenca + margen' : 'la subcuenca'}; no comparar entre subcuencas`],
      ['Conectividad equivalente (EC)', (x) => hectares(x.r.ec_ha, 0), (x) => delta(x.r.ec_ha, base.r.ec_ha, 0, ' ha'), 'comparable entre subcuencas'],
      ['Ganancia ajustada por el ancho', (x) => (x === base ? '—' : ''), (x) => `${gpct(gananciaPct(x, base) * x.ef)}<small>efectividad ${number(x.ef * 100, 0)} %</small>`, `ancho de referencia ${$('#rs-ref').value} m`],
      ...umbralesDisponibles().map((t) => [`Ganancia con umbral ${t >= 1000 ? `${t / 1000} km` : `${t} m`}`, (x) => (x === base ? '—' : ''), (x) => (base.sens[t] ? gpct(((x.sens[t] / base.sens[t]) ** 2 - 1) * 100) : '—'), `sensibilidad al umbral${t === st.umbral ? ' (umbral de análisis)' : ''}`]),
      ['Superficie hipotética de las franjas', (x) => hectares(x.ha, 2), () => '', 'largo × ancho elegido; no es un diseño'],
    ];
    const max = Math.max(base.r.iic, A.r.iic, B.r.iic) || 1;
    $('#rs-results').innerHTML = `
      ${window.CHCP.procedencia(st.data, 'C', st.data.territorios[st.id], '<span>Red precalculada (tipo B) recalculada en su navegador</span>')}
      <div class="rs-res-head"><h2>Cambio estructural hipotético de la red</h2><button class="btn btn-s" id="rs-export" type="button">Descargar escenarios (GeoJSON)</button></div>
      <table class="fi-table rs-table"><thead><tr><th>Indicador</th><th>Actual</th><th${st.esc === 'A' ? ' class="on"' : ''}>Escenario A</th><th${st.esc === 'B' ? ' class="on"' : ''}>Escenario B</th></tr></thead><tbody>
      ${filas.map(([n, v, d, h]) => `<tr><td>${n}<small>${h}</small></td><td>${v(base)}</td><td>${v(A)} ${A.n ? d(A) : ''}</td><td>${v(B)} ${B.n ? d(B) : ''}</td></tr>`).join('')}
      </tbody></table>
      ${umbralesDisponibles().length < UMBRALES.length ? `<p class="rs-note">La sensibilidad con umbral de 1 km y el margen exterior estarán disponibles ${window.CHCP.pendiente('tras')}.</p>` : ''}
      <div class="rs-bars">${[['Actual', base, '#90a4ae'], ['A', A, '#43a047'], ['B', B, '#1e88e5']].map(([n, x, c]) => `<div><span>IIC ${n}</span><i><b style="width:${x.r.iic / max * 100}%;background:${c}"></b></i></div>`).join('')}</div>
      ${lectura('A', base, A)}${lectura('B', base, B)}
      <div class="rs-niveles"><b>Qué mide y qué no mide este simulador</b><ul>
        <li><span class="ok">Sí</span> <b>Conexión matemática:</b> agrega un enlace entre dos parches en el grafo (umbral ${number(st.umbral, 0)} m, distancias en UTM 17N)${st.ampliada ? `, incluido el bosque hasta ${number(st.geo.red.margen_m, 0)} m fuera de la subcuenca, con cada parche completo aunque cruce la divisoria` : ''}.</li>
        <li><span class="ok">Sí</span> <b>Sensibilidad al umbral:</b> la ganancia se recalcula con ${umbralesDisponibles().map((t) => (t >= 1000 ? '1 km' : `${t} m`)).join(', ')}; una prioridad es robusta si se mantiene en todos.</li>
        <li><span class="mid">Supuesto</span> <b>Efectividad según el ancho:</b> un enlace más angosto que ${$('#rs-ref').value} m rinde en proporción a su ancho; es un supuesto para no favorecer franjas que serían casi todo borde.</li>
        <li><span class="ok">Sí</span> <b>Cambio estructural de la red:</b> redes, parches aislados e IIC recalculados con la misma fórmula del motor.</li>
        <li><span class="mid">Aproximado</span> <b>Superficie hipotética:</b> largo entre vértices × ancho elegido; no es un polígono de restauración ni considera tenencia, costos o viabilidad, y no se suma al hábitat.</li>
        <li><span class="no">No</span> <b>Conectividad ecológica potencial para especies:</b> requiere resistencias y distancias de dispersión justificadas.</li>
        <li><span class="no">No</span> <b>Conectividad funcional demostrada:</b> requiere evidencia de movimiento (telemetría, cámaras, genética).</li>
        <li><span class="no">No</span> <b>Restauración efectiva:</b> un enlace propuesto no es bosque restaurado.</li>
        <li><span class="mid">Base</span> <b>Bosque de partida:</b> categoría SINIA 2021 «Bosques y Otras Tierras Boscosas». Según el raster detallado 2021 de MiAMBIENTE, en la cuenca esa categoría incluye unas 7 845 ha de plantaciones y 2 793 ha de rastrojo además del bosque natural y secundario; las rutas al corredor las distinguen cuando la capa detallada está disponible. ${textoValidacion()}</li></ul></div>`;
    $('#rs-export').addEventListener('click', exportar);
  }
  function lista() {
    const s = st.escenarios[st.esc];
    $('#rs-list').innerHTML = s.length ? s.map((x, i) => { const cr = st.cruces.get(clave(x.a, x.b)); const ef = efectividad(x.ancho); return `<li><span>#${x.a} ↔ #${x.b}</span><small>${number(x.d, 0)} m × ${x.ancho} m · ${hectares(x.d * x.ancho / 10_000, 2)}${ef < 0.999 ? ` · efectividad ${number(ef * 100, 0)} %` : ''}${cr?.problema ? ` · <b class="rs-down">cruza ${esc(textoCruce(cr))}</b>` : ''}${cr?.fuera_m > 0 ? `<br>Corta: ${textoComposicion(cr.composicion, 0, '%', 2)}` : ''}</small><button type="button" data-i="${i}" aria-label="Quitar">×</button></li>`; }).join('') + `<li class="rs-total"><span>Total</span><small>${hectares(haRestaurada(st.esc), 2)}</small></li>` : '<li class="rs-empty">Sin franjas en este escenario.</li>';
    $$('#rs-list [data-i]').forEach((b) => b.addEventListener('click', () => { st.escenarios[st.esc].splice(Number(b.dataset.i), 1); actualizar(); }));
  }
  function textoCruce(cr) {
    const partes = [];
    if (cr.agua_m >= cr.minimo_m) partes.push(`${number(cr.agua_m, 0)} m de agua`);
    if (cr.construido_m >= cr.minimo_m) partes.push(`${number(cr.construido_m, 0)} m de zona construida`);
    return partes.join(' y ');
  }
  function textoValidacion() {
    const v = st.validacion, oficial = '';
    if (!v) return `Su exactitud en la cuenca no se ha evaluado todavía: la evaluación de exactitud de los mapas está prevista para una próxima actualización.${oficial}`;
    if (v.estado === 'completa') return `Validación independiente completa (${v.interpretados} puntos).${oficial}`;
    return `Validación independiente ${v.estado === 'preliminar' ? 'preliminar' : 'sin interpretar'} (${v.interpretados} de ${v.total_puntos} puntos): su exactitud en la cuenca todavía no está evaluada.${oficial}`;
  }
  /** Evalúa cada candidato: ganancia exacta por umbral, efectividad, cruces y robustez. */
  function evaluar() {
    const ancho = Number($('#rs-ancho').value), ef = efectividad(ancho);
    const ts = umbralesDisponibles();
    const excluir = $('#rs-excluir').checked;
    const ev = st.candidatos.map((c) => {
      const ha = c.d * ancho / 10_000;
      const ganancia = Object.fromEntries(ts.map((t) => { const red = redUmbral(t); const g = R.gananciaEnlace(red, c.a, c.b); return [t, g == null || !red.numerador ? null : g / red.numerador * 100]; }));
      const cr = st.cruces.get(clave(c.a, c.b));
      return { ...c, ha, efectividad: ef, ganancia, cruce: cr, excluido: Boolean(excluir && cr?.problema), por_ha: ha > 0 && ganancia[st.umbral] != null ? ganancia[st.umbral] * ef / ha : 0 };
    });
    const validos = ev.filter((c) => !c.excluido);
    const top = Math.max(3, Math.min(10, Math.ceil(validos.length * 0.25)));
    for (const t of ts) {
      validos.filter((c) => c.ganancia[t] > 0).sort((x, y) => y.ganancia[t] / y.ha - x.ganancia[t] / x.ha).forEach((c, k) => { c.rango = c.rango || {}; c.rango[t] = k + 1; });
    }
    for (const c of validos) {
      const r = ts.map((t) => c.rango?.[t]);
      c.robustez = r.every((x) => x && x <= top) ? 'robusta' : r.some((x) => x && x <= top) ? 'depende del umbral' : 'baja';
    }
    st.evaluados = ev.sort((x, y) => y.por_ha - x.por_ha);
    return st.evaluados;
  }
  function prioridades() {
    const ev = evaluar();
    const lista = ev.filter((c) => !c.excluido && c.por_ha > 0).slice(0, 6);
    const excluidos = ev.filter((c) => c.excluido).length;
    const rios = st.rios?.features || [], corr = st.territory.corridors?.features || [];
    const ts = umbralesDisponibles();
    const ef = efectividad(Number($('#rs-ancho').value));
    $('#rs-prior-nota').innerHTML = `Ordenadas por ganancia de conectividad (IIC) por hectárea, ajustada por el ancho${ef < 0.999 ? ` (efectividad ${number(ef * 100, 0)} %: un ancho de ${$('#rs-ref').value} m rinde más por hectárea)` : ''}. Robusta = entre las primeras con ${ts.map((t) => (t >= 1000 ? '1 km' : `${t} m`)).join(', ')}.${excluidos ? ` ${excluidos} brecha(s) excluida(s) por cruzar agua o zonas construidas.` : ''}${st.cob === null ? ' Comprobando cruces sobre agua…' : ''}`;
    $('#rs-prior').innerHTML = lista.length ? lista.map((c) => {
      const medio = [(c.linea[0][0] + c.linea[1][0]) / 2, (c.linea[0][1] + c.linea[1][1]) / 2];
      const etiquetas = [];
      if (rios.length && R.cercaDeLineas(medio, rios, 150)) etiquetas.push('cerca de río');
      const enCorr = corr.find((f) => R.puntoEnPoligono(medio, f.geometry));
      if (enCorr) etiquetas.push(`corredor ${enCorr.properties.categoria_etiqueta || ''}`.trim());
      if (!st.objetivo.has(c.a) || !st.objetivo.has(c.b)) etiquetas.push('enlaza con el margen exterior');
      if (c.cruce?.ribera_m >= (c.cruce?.minimo_m || 30)) etiquetas.push(`${number(c.cruce.ribera_m, 0)} m de orilla sin bosque`);
      const rangos = ts.map((t) => `<span title="Puesto con umbral ${t} m">${t >= 1000 ? '1 km' : `${t} m`}: ${c.rango?.[t] ? `${c.rango[t]}º` : '—'}</span>`).join('');
      return `<li><button type="button" data-a="${c.a}" data-b="${c.b}"><b>#${c.a} ↔ #${c.b} <small>${number(c.d, 0)} m · ${hectares(c.ha, 2)}</small></b><span>IIC +${gpct(c.ganancia[st.umbral])} · ${number(c.por_ha, c.por_ha >= 0.1 ? 2 : 3)} %/ha ajustado <i class="rs-rob rs-rob-${c.robustez === 'robusta' ? 'ok' : c.robustez === 'baja' ? 'no' : 'mid'}">${c.robustez}</i></span><span class="rs-rangos">${rangos}</span>${etiquetas.length ? `<em>${etiquetas.map(esc).join(' · ')}</em>` : ''}${c.cruce?.fuera_m > 0 ? `<small class="rs-corta">Corta: ${textoComposicion(c.cruce.composicion)}</small>` : ''}</button></li>`;
    }).join('') : '<li class="rs-empty">No hay brechas candidatas válidas: el bosque ya forma una sola red, los parches están demasiado lejos o las brechas cruzan agua o zonas construidas.</li>';
    $$('#rs-prior [data-a]').forEach((b) => b.addEventListener('click', () => {
      const c = st.candidatos.find((x) => x.a === Number(b.dataset.a) && x.b === Number(b.dataset.b));
      if (c) { agregar(c); st.map.fitBounds(L.latLngBounds(c.linea.map(([x, y]) => [y, x])).pad(2)); }
    }));
    $('#rs-plan').innerHTML = '';
  }
  /** Plan secuencial (voraz): cada paso considera la red ya modificada por los anteriores. */
  function plan() {
    const ancho = Number($('#rs-ancho').value);
    const cand = (st.evaluados.length ? st.evaluados : evaluar()).map((c) => ({ ...c, efectividad: efectividad(ancho) }));
    const pasos = R.planVoraz(st.areas, st.aristas, cand, { pasos: 8 });
    if (!pasos.length) { $('#rs-plan').innerHTML = '<p class="rs-note">No hay enlaces que mejoren la red.</p>'; return; }
    $('#rs-plan').innerHTML = `<ol class="rs-plan-l">${pasos.map((x) => `<li><b>#${x.a} ↔ #${x.b}</b><small>${number(x.d, 0)} m · +${gpct(x.ganancia_pct)} IIC · acumulado +${gpct(x.acumulado_pct)} con ${hectares(x.ha_acumuladas, 2)}</small></li>`).join('')}</ol>
      <p class="rs-note">Cada paso elige el mejor enlace dado lo ya restaurado, así que tiene en cuenta que dos enlaces pueden reforzarse o volverse redundantes. Es una heurística voraz: no garantiza la combinación óptima.</p>
      <button class="btn btn-s" type="button" id="rs-plan-usar">Usar este plan en el escenario ${st.esc}</button>`;
    $('#rs-plan-usar').addEventListener('click', () => {
      st.escenarios[st.esc] = pasos.map((x) => ({ a: x.a, b: x.b, d: x.d, linea: x.linea, tipo: x.tipo, ancho }));
      actualizar();
    });
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
  const MAX_LADO_RUTAS = 1600;
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

  let capasPromesa = null;
  /**
   * Capas de toda la cuenca (malla de los mapas precalculados): SINIA 2021 general y detallado,
   * JRC 2025, ESRI 2024 y la banda ribereña del IGNTG remuestreada a la misma malla.
   * `clase` es la clasificación completa que usan los cruces, la composición y las rutas.
   */
  function capasCuenca() {
    if (capasPromesa) return capasPromesa;
    capasPromesa = (async () => {
      const m = st.data.territorios.chcp?.mapas;
      if (!m?.valores?.includes('sinia_2021')) throw new Error('La cuenca todavía no tiene los mapas de cobertura precalculados.');
      const leer = (c) => (m.valores.includes(c) ? bytes(mapFile('chcp', `${c}.v.png`)).catch(() => null) : Promise.resolve(null));
      const hidro = Promise.all([
        fetch(window.CHCP.hidroFile('riparia_igntg.json')).then((r) => (r.ok ? r.json() : null)),
        bytes(window.CHCP.hidroFile('riparia_igntg.v.png')),
      ]).catch(() => [null, null]);
      const [sinia, jrc, esri, detalle, [metaRib, rib]] = await Promise.all([...['sinia_2021', 'jrc_2025', 'esri_2024', 'sinia_2021_detalle'].map(leer), hidro]);
      if (!sinia) throw new Error('No se pudo leer la cobertura SINIA 2021 de la cuenca.');
      const w = sinia.w, h = sinia.h, ok = (x) => (x && x.w === w && x.h === h ? x.v : null);
      const ribera = metaRib && rib ? RC.remuestrear(rib.v, metaRib.limites, rib.w, rib.h, m.limites, w, h) : null;
      const capas = { sinia: sinia.v, jrc: ok(jrc), esri: ok(esri), detalle: ok(detalle), ribera };
      const { clase } = RC.superficie(capas, w * h);
      return { m, w, h, ...capas, clase, metaRib, ribOriginal: rib };
    })();
    capasPromesa.catch(() => { capasPromesa = null; });
    return capasPromesa;
  }

  // ---- composición: qué cobertura ocupa lo que corta un corredor
  const leyendaDetalle = () => new Map((st.data.leyendas_valores?.sinia_2021_detalle || []).map((x) => [x.codigo, x]));
  const NOMBRE_CLASE = { regeneracion: 'Regeneración o rastrojo', otras_tierras: 'Otras tierras (sin detalle de uso)', construido: 'Zona construida', agua: 'Agua', ribera_sin_bosque: 'Ribera sin bosque (sin detalle de uso)' };
  function etiquetaCodigo(cod) {
    const x = leyendaDetalle().get(Number(cod));
    if (!x) return null;
    // Verificadas: nombre oficial. El resto ya lleva en su etiqueta «Código N · …» y su estado.
    return x.verificada ? x.categoria : x.categoria || `Código ${x.codigo} (sin verificar)`;
  }
  /** Texto con las principales coberturas de una composición { código o clase: metros|km }. */
  function textoComposicion(comp, total, unidad = '%', max = 3) {
    const filas = Object.entries(comp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!filas.length) return '';
    const suma = total || filas.reduce((t, [, v]) => t + v, 0);
    return filas.slice(0, max).map(([k, v]) => {
      const nombre = etiquetaCodigo(k) || NOMBRE_CLASE[k] || k;
      return unidad === 'km' ? `${esc(nombre)} ${number(v, v >= 1 ? 1 : 2)} km` : `${esc(nombre)} ${number(v / suma * 100, 0)} %`;
    }).join(' · ') + (filas.length > max ? ' · …' : '');
  }

  /** Agua, zona construida, ribera y composición de lo que no es bosque a lo largo de cada brecha. */
  async function calcularCruces() {
    if (st.cob === false) return;
    let c;
    try { c = await capasCuenca(); } catch (_) { st.cob = false; return; }
    const { m, w, h, clase, detalle, esri, ribera } = c;
    const aPix = P.transformador(m.limites, w, h), pix = m.tamano_pixel_m || 30;
    st.cob = { pix, construido: Boolean(esri || detalle), detalle: Boolean(detalle), ribera: Boolean(ribera) };
    const K = RC.C;
    const medir = (linea, d) => {
      const [p, q] = linea.map(([lon, lat]) => aPix(lon, lat));
      const n = Math.max(2, Math.ceil(d / (pix / 3))), paso = d / (n + 1);
      let agua = 0, cons = 0, rib = 0;
      const comp = {};
      for (let k = 0; k <= n; k += 1) {
        const x = Math.floor(p[0] + (q[0] - p[0]) * k / n), y = Math.floor(p[1] + (q[1] - p[1]) * k / n);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x, cl = clase[i];
        if (cl === K.agua) agua += 1; else if (cl === K.construido) cons += 1;
        if (cl === K.ribera_sin_bosque) rib += 1;
        if (RC.FUERA_BOSQUE.has(cl)) {
          const cod = detalle && detalle[i] !== 255 ? detalle[i] : RC.CLASES[cl];
          comp[cod] = (comp[cod] || 0) + paso;
        }
      }
      const r = { agua_m: agua * paso, construido_m: cons * paso, ribera_m: rib * paso, minimo_m: pix, composicion: comp };
      r.fuera_m = Object.values(comp).reduce((t, v) => t + v, 0);
      // Se marca cuando cruza al menos el equivalente a un píxel completo (evita bordes de orilla).
      r.problema = r.agua_m >= pix || r.construido_m >= pix;
      return r;
    };
    for (const x of st.candidatos) if (!st.cruces.has(clave(x.a, x.b))) st.cruces.set(clave(x.a, x.b), medir(x.linea, x.d));
    for (const s of ['A', 'B']) for (const x of st.escenarios[s]) if (!st.cruces.has(clave(x.a, x.b))) st.cruces.set(clave(x.a, x.b), medir(x.linea, x.d));
  }

  async function baseRutas() {
    if (st.rutas.base) return st.rutas.base;
    const { m, w: w0, h: h0, clase: claseCompleta, detalle, esri, ribera } = await capasCuenca();
    const f = Math.max(1, Math.ceil(Math.max(w0, h0) / MAX_LADO_RUTAS));
    const red = RC.reducirClases(claseCompleta, w0, h0, f), w = red.w, h = red.h, clase = red.v;
    const res = RC.resistencias(clase);
    const codigos = detalle ? RC.reducir(detalle, w0, h0, f).v : null;
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
    st.rutas.base = { w, h, f, paso, clase, res, codigos, aPixel, aLonLat, tramos, construido: Boolean(esri || detalle), detalle: Boolean(detalle), ribera: Boolean(ribera) };
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
    const feat = featureParche(id);
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
      return { tramo: t, alcanzable: true, dentro, ruta, optimo: t.costo[ini], resumen: RC.resumir(ruta, b.clase, b.w, b.paso),
        composicion: RC.composicion(ruta, b.clase, b.codigos, b.w, b.paso) };
    }).sort((x, y) => (x.alcanzable ? x.optimo : Infinity) - (y.alcanzable ? y.optimo : Infinity));
    st.rutas.ultimo = { id, area: st.areas.get(id) ?? feat.properties.area_ha, rutas, desdeParche };
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
      const x = r.resumen, km = (v) => (v > 0 ? `${number(v, v >= 1 ? 1 : 2)} km` : '—');
      // Composición de lo que no es bosque: códigos SINIA 2021 detallados o, sin esa capa, la clase del modelo.
      const comp = r.composicion;
      const fila2 = [
        x.fuera_bosque_km > 0 ? `<b>Qué corta la ruta:</b> ${textoComposicion(comp, 0, 'km', 4)}` : '',
        b.ribera ? `<b>Por ribera:</b> ${km(x.km.bosque_ribera)} con bosque · ${km(x.km.ribera_sin_bosque)} sin bosque` : '',
        x.km.plantacion > 0 ? `<b>Por plantación:</b> ${km(x.km.plantacion)}` : '',
      ].filter(Boolean).join('<br>');
      return `<tr${k === 0 ? ' class="on"' : ''}><td>${esc(r.tramo.nombre)}${k === 0 ? '<small>menor costo</small>' : ''}</td><td>${number(x.longitud_km, 1)} km</td><td>${km(x.por_bosque_km)}</td><td><b>${km(x.fuera_bosque_km)}</b>${x.tramos_fuera_bosque ? `<small>en ${x.tramos_fuera_bosque} tramo${x.tramos_fuera_bosque > 1 ? 's' : ''}</small>` : ''}</td><td>${km(x.km.agua)}</td><td>${b.construido ? km(x.km.construido) : '<small>sin capa</small>'}</td></tr>${fila2 ? `<tr class="rs-sub${k === 0 ? ' on' : ''}"><td colspan="6">${fila2}</td></tr>` : ''}`;
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
          <li>Ruta de <b>menor costo</b> sobre la cobertura de toda la cuenca (SINIA 2021 general${b.detalle ? ' y detallada' : ''}, JRC 2025${b.ribera ? ', red hidrográfica del IGNTG' : ''}${b.construido && !b.detalle ? ', zonas construidas de ESRI 2024' : ''}), con celdas de unos ${number(b.paso, 0)} m.</li>
          <li>Resistencias supuestas: ${b.ribera ? `bosque de ribera ${r.bosque_ribera}, ` : ''}bosque ${r.bosque}, bosque degradado ${r.bosque_degradado}${b.detalle ? `, plantación ${r.plantacion}` : ''}, regeneración o rastrojo ${r.regeneracion}${b.ribera ? `, ribera sin bosque ${r.ribera_sin_bosque}` : ''}, otras tierras ${r.otras_tierras}${b.construido ? `, construido ${r.construido}` : ''}, agua ${r.agua}.${b.ribera ? ' La ribera es la franja de 50 m a cada lado de los cauces del IGNTG: la ruta tiende a seguir los ríos con bosque y, donde falta, a restaurar la orilla (la Ley 1 de 1994, art. 23, protege al menos 10 m a cada lado).' : ''}</li>
          <li>Los valores de resistencia son un supuesto del modelo, no una medición ni un dato de una especie concreta. Cambiarlos puede cambiar la ruta.</li>
          <li>La <b>franja morada</b> reúne las celdas por las que pasan rutas casi tan buenas como la mejor. Donde es ancha hay varias opciones; donde se estrecha, el paso es obligado.</li>
          <li>Solo se evalúa dentro de la cuenca. ${b.tramos.filter((t) => !t.n).map((t) => `El tramo ${esc(t.nombre)} queda fuera de ella.`).join(' ')}${b.construido ? '' : ` Las zonas urbanas todavía no se distinguen de otras tierras; se incorporarán ${window.CHCP.pendiente()}.`}</li>
          <li>Es una ruta hipotética: no es un corredor oficial ni garantiza que la fauna la use. Antes de restaurar hay que verificar en campo, la tenencia de la tierra y el uso actual.</li>
        </ul>
        <p class="rs-note">Tramos del corredor: capa del Almanaque Azul de Panamá.</p>
      </details>`;
    $('#rs-rutas-cerrar').addEventListener('click', limpiarRutas);
    $('#rs-tol')?.addEventListener('change', (e) => { st.rutas.tolerancia = Number(e.target.value); pintarRutas(); });
  }


  // ---------------------------------------------------------------- capas de contexto
  // Cobertura y uso del suelo 2021 (SINIA detallado, colores oficiales) y franja ribereña IGNTG.
  const contexto = { cobertura: null, ribera: null };
  function hexRgb(h) { const n = parseInt(String(h || '#999999').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function overlayDesde(valores, w, h, limites, colorDe, opacidad) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    for (let i = 0; i < valores.length; i += 1) {
      const col = colorDe(valores[i]);
      if (!col) continue;
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = opacidad;
    }
    ctx.putImageData(img, 0, 0);
    const [[s0, o0], [n0, e0]] = limites;
    return L.imageOverlay(c.toDataURL(), [[s0, o0], [n0, e0]], { className: 'rs-franja', interactive: false });
  }
  async function alternarCobertura(activo) {
    const caja = $('#rs-cob-leyenda');
    if (!activo) { if (contexto.cobertura) st.map.removeLayer(contexto.cobertura); caja.innerHTML = ''; return; }
    caja.innerHTML = '<p class="rs-note">Cargando la cobertura de la cuenca…</p>';
    let c;
    try { c = await capasCuenca(); } catch (e) { caja.innerHTML = `<p class="rs-warn">${esc(e.message)}</p>`; return; }
    if (!c.detalle) {
      // Mientras llega el ráster detallado, se muestra la versión general de SINIA 2021 (3 clases).
      const capa = (st.data.capas_mapa || []).find((x) => x.clave === 'sinia_2021');
      const col = new Map((capa?.leyenda || []).map((x) => [x.valor, hexRgb(x.color)]));
      if (!contexto.cobertura) contexto.cobertura = overlayDesde(c.sinia, c.w, c.h, c.m.limites, (v) => col.get(v) || null, 175);
      contexto.cobertura.addTo(st.map);
      st.capas.parches?.bringToFront?.();
      const n = new Map(); for (let i = 0; i < c.sinia.length; i += 1) if (col.has(c.sinia[i])) n.set(c.sinia[i], (n.get(c.sinia[i]) || 0) + 1);
      const pix2 = (c.m.tamano_pixel_m || 40) ** 2 / 10_000;
      caja.innerHTML = `<ul class="rs-cob-l">${(capa?.leyenda || []).map((x) => `<li><i style="background:${esc(x.color)}"></i>${esc(x.etiqueta)}<small>${hectares((n.get(x.valor) || 0) * pix2, 0)}</small></li>`).join('')}</ul>
        <p class="rs-note">Cobertura SINIA 2021 (MiAMBIENTE), versión general de 3 clases. El detalle de usos (pasto, cultivos, plantaciones, rastrojo, poblados…) se añadirá ${window.CHCP.pendiente()}.</p>`;
      return;
    }
    const ley = leyendaDetalle(), colores = new Map([...ley].map(([k, x]) => [k, hexRgb(x.color)]));
    if (!contexto.cobertura) contexto.cobertura = overlayDesde(c.detalle, c.w, c.h, c.m.limites, (v) => (v === 255 ? null : colores.get(v) || [150, 150, 150]), 175);
    contexto.cobertura.addTo(st.map);
    st.capas.parches?.bringToFront?.();
    const presentes = new Map();
    for (let i = 0; i < c.detalle.length; i += 1) if (c.detalle[i] !== 255) presentes.set(c.detalle[i], (presentes.get(c.detalle[i]) || 0) + 1);
    const pix2 = (c.m.tamano_pixel_m || 40) ** 2 / 10_000;
    caja.innerHTML = `<ul class="rs-cob-l">${[...presentes].sort((a, b) => b[1] - a[1]).map(([cod, n]) => `<li><i style="background:${esc(ley.get(cod)?.color || '#999')}"></i>${esc(etiquetaCodigo(cod) || `Código ${cod}`)}<small>${hectares(n * pix2, 0)}</small></li>`).join('')}</ul>
      <p class="rs-note">Cobertura boscosa y uso del suelo 2021 (SINIA–MiAMBIENTE, raster de 10 m mostrado a ${number(c.m.tamano_pixel_m || 40, 0)} m). Superficies aproximadas en la cuenca.</p>`;
  }
  async function alternarRibera(activo) {
    if (!activo) { if (contexto.ribera) st.map.removeLayer(contexto.ribera); $('#rs-rib-nota').textContent = ''; return; }
    let c;
    try { c = await capasCuenca(); } catch (e) { $('#rs-rib-nota').textContent = e.message; return; }
    if (!c.ribOriginal) { $('#rs-rib-nota').textContent = 'No se pudo cargar la red hidrográfica.'; return; }
    const col = { 1: [8, 48, 107], 3: [33, 113, 181], 4: [107, 174, 214] };
    if (!contexto.ribera) contexto.ribera = overlayDesde(c.ribOriginal.v, c.ribOriginal.w, c.ribOriginal.h, c.metaRib.limites, (v) => col[v] || null, 200);
    contexto.ribera.addTo(st.map);
    $('#rs-rib-nota').textContent = `${c.metaRib.fuente}. Cauce y franja de 50 m a cada lado.`;
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
      $('#rs-results').innerHTML = `<p class="rs-warn"><b>${esc(t?.nombre || id)}</b> todavía no tiene su red de parches calculada, por eso no aparecen parches para unir. Se generará ${window.CHCP.pendiente()}. Mientras tanto puede revisar su <a href="${window.CHCP_STATIC ? 'ficha.html' : '/ficha'}?id=${encodeURIComponent(id)}">ficha técnica</a>.</p>${listas.length ? `<p class="rs-note">Subcuencas con la red ya disponible: ${listas.map((x) => `<button type="button" class="rs-ir" data-id="${esc(x.id)}">${esc(x.nombre)}</button>`).join(' ')}</p>` : ''}`;
      $$('#rs-results .rs-ir').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.id)));
      $('#rs-prior').innerHTML = ''; $('#rs-list').innerHTML = '';
      return;
    }
    $('#rs-unir').disabled = false; $('#rs-rutas-btn').disabled = false;
    try { st.rios = await (await fetch(mapFile(id, 'rios.json'))).json(); } catch (_) { st.rios = null; }
    if (st.capaRios) st.map.removeLayer(st.capaRios);
    st.capaRios = st.rios ? L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 2, opacity: 0.9 }, onEachFeature: (f, l) => l.bindTooltip(esc(((f) => [f.properties.nombre || `${f.properties.tipo || 'Cauce'} sin nombre en la cartografía`, f.properties.nombre_alt && `(${f.properties.nombre_alt})`, f.properties.tributario_de && `· afluente del ${f.properties.tributario_de}`].filter(Boolean).join(' '))(f)), { sticky: true }) }).addTo(st.map) : null;
    const red = st.geo.red;
    st.umbral = st.umbral || red.umbral_m || st.data.umbral_conectividad_m || 500;
    st.ampliada = red.version >= 2 && Array.isArray(red.nodos) && Array.isArray(red.aristas_ampliadas);
    if (st.ampliada) {
      // Parches completos (aunque crucen la divisoria) y bosque del margen exterior.
      st.areas = new Map(red.nodos.map(([id, ha]) => [id, ha]));
      st.objetivo = new Set(red.nodos.filter((n) => n[2]).map((n) => n[0]));
      st.aristasDist = red.aristas_ampliadas;
      st.distMax = red.distancia_max_m || 1000;
      st.paisaje = red.area_paisaje_margen_ha || red.area_paisaje_ha || t.area_ha;
    } else {
      st.areas = new Map(st.geo.parches.features.map((f) => [f.properties.patch_id, f.properties.area_ha]));
      st.objetivo = new Set(st.areas.keys());
      st.aristasDist = red.aristas;
      st.distMax = st.umbral;
      st.paisaje = red.area_paisaje_ha || t.area_ha;
    }
    st.redes = new Map();
    const lat0 = feature ? L.geoJSON(feature).getBounds().getCenter().lat : 9.1;
    const todos = st.geo.parches.features.concat(st.geo.contexto?.features || []);
    st.prep = new Map(todos.filter((f) => st.areas.has(f.properties.patch_id)).map((f) => [f.properties.patch_id, R.preparar(f, lat0)]));
    st.cruces = new Map(); st.cob = null;
    // Umbral de análisis: el elegido por la persona si está disponible; si no, el original (500 m).
    const opciones = umbralesDisponibles();
    $('#rs-umbral-sel').innerHTML = opciones.map((t) => `<option value="${t}">${t >= 1000 ? '1 km' : `${t} m`}${t === red.umbral_m ? ' (original)' : ''}</option>`).join('');
    if (!opciones.includes(st.umbral)) st.umbral = red.umbral_m || 500;
    $('#rs-umbral-sel').value = String(st.umbral);
    await construirRed(id, true);
  }

  /** Red y candidatos para el umbral de análisis elegido. */
  async function construirRed(id, conHash) {
    $('#rs-umbral').textContent = `${number(st.umbral, 0)} m`;
    st.aristas = aristasUmbral(st.umbral);
    const base = R.analizar(st.areas, st.aristas, st.paisaje);
    const vistos = new Set();
    const motor = (st.geo.brechas?.features || []).map((f) => ({ a: f.properties.patch_id_origen, b: f.properties.patch_id_destino, d: f.properties.distancia_m, linea: ((c) => [c[0], c.at(-1)])(f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.flat() : f.geometry.coordinates), tipo: 'brecha' }));
    const maxDist = Math.max(st.umbral * 4, 2000);
    const entreRedes = st.areas.size <= 2500 ? R.candidatosEntreRedes(st.prep, base.red, maxDist) : [];
    // Redes con el umbral más estricto: con el umbral de análisis esos enlaces acortan caminos dentro de la red.
    const estricto = st.umbral > UMBRALES[0] ? R.analizar(st.areas, aristasUmbral(UMBRALES[0]), st.paisaje) : base;
    const atajos = st.areas.size <= 2500 && estricto.redes > base.redes ? R.candidatosEntreRedes(st.prep, estricto.red, maxDist).map((c) => ({ ...c, tipo: 'atajo' })) : [];
    st.candidatos = [...motor, ...entreRedes, ...atajos].filter((c) => {
      if (!st.areas.has(c.a) || !st.areas.has(c.b)) return false;
      if (!st.objetivo.has(c.a) && !st.objetivo.has(c.b)) return false; // al menos un extremo en la subcuenca
      if (c.d <= st.umbral) return false; // ya están enlazados con este umbral
      const k = clave(c.a, c.b);
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    }).slice(0, 80);
    if (conHash) leerHash();
    prioridades();
    actualizar();
    await calcularCruces();
    if (st.id === id) { prioridades(); actualizar(); }
  }

  // ---------------------------------------------------------------- inicio
  try {
    [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory'), window.CHCP.consultarActualizacion()]);
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
      ${item(sim('<rect x="4" y="2" width="26" height="12" rx="2" fill="#1b7837" fill-opacity="0.3" stroke="#455a64" stroke-width="1" stroke-dasharray="3 2"/>'), 'Bosque del margen exterior', 'hasta 1 km fuera de la subcuenca')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Restauración</h3><ul>
      ${item(sim('<line x1="5" y1="8" x2="29" y2="8" stroke="#e53935" stroke-width="3" stroke-dasharray="5 4"/><circle cx="5" cy="8" r="3.2" fill="#e53935" stroke="#fff"/><circle cx="29" cy="8" r="3.2" fill="#e53935" stroke="#fff"/>'), 'Brecha candidata', 'haga clic para añadirla al escenario')}
      ${item(sim('<line x1="5" y1="8" x2="29" y2="8" stroke="#78909c" stroke-width="3" stroke-dasharray="1.5 4"/><circle cx="5" cy="8" r="3.2" fill="#78909c" stroke="#fff"/><circle cx="29" cy="8" r="3.2" fill="#78909c" stroke="#fff"/>'), 'Brecha que cruza agua o zona construida', 'excluida de las prioridades')}
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#7cb342" stroke-width="8" stroke-linecap="round"/><line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="1.6" stroke-dasharray="4 3"/>'), 'Enlace propuesto', 'hipotético: aún no es bosque')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Rutas al corredor</h3><ul>
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="6"/><line x1="3" y1="8" x2="31" y2="8" stroke="#7b1fa2" stroke-width="3.5"/>'), 'Ruta de menor costo', 'evita agua y zonas sin bosque')}
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="5"/><line x1="3" y1="8" x2="31" y2="8" stroke="#7b1fa2" stroke-width="2.6" stroke-dasharray="6 4"/>'), 'Ruta a otro tramo', 'más costosa que la principal')}
      ${item(sim('<rect x="2" y="3" width="30" height="10" rx="2" fill="#7b1fa2" fill-opacity="0.38"/>'), 'Franja de alternativas', 'rutas casi igual de buenas')}
    </ul></div>
    <div class="rs-lg-grupo"><h3>Referencia</h3><ul>
      ${item(sim('<line x1="3" y1="8" x2="31" y2="8" stroke="#fff" stroke-width="3"/>', '#5b6b5e'), 'Límite de la subcuenca', '')}
      ${item(sim('<path d="M3 11 C10 3, 18 13, 31 5" fill="none" stroke="#1f78b4" stroke-width="2.4"/>'), 'Ríos', 'IGNTG 2022 (1:25 000); HydroSHEDS donde el IGNTG no tiene cauces')}
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
  // Dos modos excluyentes: restaurar brechas (clic en líneas o «Unir dos parches») y rutas al corredor.
  function modo(rutas) {
    st.rutas.activo = rutas;
    $('#rs-rutas-btn').classList.toggle('on', rutas); $('#rs-rutas-btn').setAttribute('aria-checked', String(rutas));
    $('#rs-modo-rest').classList.toggle('on', !rutas); $('#rs-modo-rest').setAttribute('aria-checked', String(!rutas));
    if (rutas) { st.unir = null; $('#rs-unir').classList.remove('on'); }
    $('#rs-hint').textContent = rutas ? 'Haga clic en un parche del mapa para ver sus rutas al Corredor Mesoamericano.' : '';
    if (st.areas) dibujar();
  }
  $('#rs-rutas-btn').addEventListener('click', () => modo(true));
  $('#rs-modo-rest').addEventListener('click', () => modo(false));
  $('#rs-unir').addEventListener('click', (e) => {
    if (st.rutas.activo) modo(false);
    st.unir = st.unir === null ? true : null;
    e.currentTarget.classList.toggle('on', st.unir !== null);
    $('#rs-hint').textContent = st.unir ? 'Haga clic en el primer parche.' : '';
    if (st.areas) dibujar();
  });
  $('#rs-limpiar').addEventListener('click', () => { st.escenarios[st.esc] = []; if (st.areas) actualizar(); });
  $('#rs-ancho').addEventListener('change', () => { if (st.areas) { prioridades(); actualizar(); } });
  $('#rs-cob-chk').addEventListener('change', (e) => alternarCobertura(e.target.checked));
  $('#rs-rib-chk').addEventListener('change', (e) => alternarRibera(e.target.checked));
  $('#rs-umbral-sel').addEventListener('change', (e) => { if (!st.areas) return; st.umbral = Number(e.target.value); construirRed(st.id, false); });
  $('#rs-ref').addEventListener('change', () => { if (st.areas) { prioridades(); actualizar(); } });
  $('#rs-excluir').addEventListener('change', () => { if (st.areas) prioridades(); });
  $('#rs-plan-btn').addEventListener('click', () => { if (st.areas) plan(); });
  fetch(window.CHCP.valFile('indice.json')).then((r) => (r.ok ? r.json() : null)).then((j) => { st.validacion = (j?.mapas || []).find((x) => x.mapa === 'sinia_2021') || null; if (st.areas) actualizar(); }).catch(() => {});
  const parametros = new URLSearchParams(location.search), pedido = parametros.get('id');
  const conRed = listas.find((t) => (t.estructura_2021?.metricas_red?.numero_componentes || 0) > 1) || listas[0] || subs[0];
  await cargar(st.data.territorios[pedido] ? pedido : conRed.id);
  if (parametros.get('modo') === 'rutas' && !$('#rs-rutas-btn').disabled) modo(true);

  // ---------------------------------------------------------------- recorrido guiado
  const PASOS = [
    { titulo: 'Qué hace el simulador', texto: '<p>Permite probar <b>dónde restaurar bosque</b> para volver a conectar parches aislados, y medir cuánto mejoraría la conectividad.</p><p>Todo lo que propone es <b>hipotético</b>: sirve para comparar opciones antes de ir a campo.</p>' },
    { sel: '#rs-paso1', titulo: '1. Elija la subcuenca', texto: 'Las subcuencas marcadas como «pendientes» aún no tienen su red de bosque calculada.', prueba: 'elija otra subcuenca en la lista; el recorrido sigue solo.', accion: { sel: '#rs-select', evento: 'change' } },
    { sel: '#rs-map', titulo: 'El mapa', texto: '<p>Cada color es una <b>red de bosque</b>: parches lo bastante cerca para considerarse conectados. Las <b>líneas rojas discontinuas</b> son brechas que convendría cerrar; las grises cruzan agua o zonas urbanas.</p><p>En azul, los ríos del IGNTG.</p>' },
    { sel: '#rs-paso2', titulo: '2. Elija qué quiere hacer', texto: '<b>Restaurar brechas</b>: haga clic en una línea roja para añadir esa franja de restauración. <b>Rutas al corredor</b>: haga clic en un parche y verá por dónde conectaría con el Corredor Biológico Mesoamericano.', prueba: 'haga clic en una línea roja del mapa, o elija «Rutas al Corredor Mesoamericano» y pulse un parche.', accion: { sel: '#rs-map', evento: 'click' } },
    { sel: '#rs-paso3', titulo: '3. Arme dos escenarios', texto: 'Cada franja que añade va al escenario activo (A o B). Así puede comparar, por ejemplo, «pocas franjas anchas» contra «muchas angostas». El ancho cambia la superficie que habría que restaurar.', prueba: 'cambie al escenario B o cambie el ancho de la franja.', accion: { sel: '#rs-paso3', evento: 'change' } },
    { sel: '#rs-paso4', titulo: 'Sugerencias', texto: 'Las brechas que más mejoran la red por hectárea. «Robusta» significa que sigue siendo buena con distintos supuestos. El <b>plan</b> elige varias seguidas teniendo en cuenta cómo se combinan.', prueba: 'pulse «Proponer un plan de 8 enlaces».', accion: { sel: '#rs-plan-btn', evento: 'click' } },
    { sel: '#rs-results', titulo: 'Resultados', texto: 'Compara el estado actual con sus escenarios: cuántas redes quedan, cuánto bosque queda conectado y cuánto mejora la conectividad (IIC y conectividad equivalente).' },
    { sel: '.rs-capas', titulo: 'Capas de contexto', texto: 'Active la <b>cobertura y uso del suelo 2021</b> para ver qué hay en las brechas (pasto, cultivos, poblados…) o los <b>ríos y su franja ribereña</b>.', prueba: 'marque una de las dos casillas.', accion: { sel: '.rs-capas', evento: 'change' } },
    { sel: '#rs-avanzado', titulo: 'Opciones avanzadas', texto: 'Para quien quiera cambiar los supuestos: distancia entre parches, ancho funcional de un corredor y exclusión de brechas sobre agua. Los valores por defecto son los del método original.' },
    { titulo: 'Recuerde', texto: '<p>El simulador mide <b>conectividad estructural</b> (la disposición del bosque), no comprueba que la fauna se desplace. Antes de restaurar hay que verificar en campo, la tenencia de la tierra y el uso actual.</p>' },
  ];
  const recorrido = () => window.CHCP_TOUR?.iniciar(PASOS, { clave: 'simulador', textoFin: 'Entendido' });
  $('#rs-ayuda').addEventListener('click', recorrido);
  window.CHCP_TOUR?.invitar('simulador', 'Le explicamos el simulador en 1 minuto.', recorrido);
})();
