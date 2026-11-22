/* Página de validación: diseño, avance, resultados (Olofsson et al., 2014), herramienta de
   interpretación ciega y cálculo con un CSV propio. */
(async function () {
  const { $, $$, escapeHtml: esc, number, valFile } = window.CHCP;
  const V = window.CHCP_VALIDACION;
  const st = { indice: null, mapa: null, diseno: null, estratos: null, muestra: [], resultados: null, i: 0, map: null };
  const pct = (v, d = 0) => (v == null ? '—' : `${number(v * 100, d)} %`);
  const ha = (v) => `${number(v, 0)} ha`;

  // Ejemplo publicado (Olofsson et al., 2014, sección 5) para entender la lectura de resultados.
  const EJEMPLO = {
    leyenda: [{ codigo: 1, etiqueta: 'Deforestación', color: '#c62828' }, { codigo: 2, etiqueta: 'Ganancia de bosque', color: '#1e88e5' }, { codigo: 3, etiqueta: 'Bosque estable', color: '#2e7d32' }, { codigo: 4, etiqueta: 'No bosque estable', color: '#d7c2a1' }],
    areas: { 1: 18000, 2: 13500, 3: 288000, 4: 580500 },
    conteos: [[66, 0, 5, 4], [0, 55, 8, 12], [1, 0, 153, 11], [2, 1, 9, 313]],
  };

  async function obtener(ruta, tipo = 'json') {
    const r = await fetch(valFile(ruta));
    if (!r.ok) throw new Error(String(r.status));
    return tipo === 'json' ? r.json() : r.text();
  }

  // ------------------------------------------------------------ resultados
  function lecturaClase(f, et) {
    if (f.exactitud_usuario == null) return '';
    const com = Math.round((1 - f.exactitud_usuario) * 100), om = f.exactitud_productor == null ? null : Math.round((1 - f.exactitud_productor) * 100);
    return `<li><b>${esc(et)}:</b> de cada 100 puntos que el mapa marca como «${esc(et.toLowerCase())}», unos ${100 - com} lo son en la referencia (comisión ${com} %).${om == null ? '' : ` El mapa capta ${100 - om} de cada 100 hectáreas reales de esta clase (omisión ${om} %).`} La superficie real se estima entre <b>${ha(Math.max(0, f.area_ajustada - f.area_ajustada_ic))}</b> y <b>${ha(f.area_ajustada + f.area_ajustada_ic)}</b> (mapa: ${ha(f.area_mapa)}).</li>`;
  }
  function renderResultados(r, leyenda, aviso = '') {
    const et = new Map(leyenda.map((c) => [String(c.codigo), c.etiqueta]));
    const color = new Map(leyenda.map((c) => [String(c.codigo), c.color || '#607d8b']));
    const max = Math.max(...r.por_clase.map((f) => Math.max(f.area_mapa, f.area_ajustada + f.area_ajustada_ic)));
    const n = r.matriz_conteos;
    return `${aviso}
      <div class="va-kpis"><div><span>Exactitud global</span><b>${pct(r.exactitud_global, 1)}</b><small>± ${pct(r.exactitud_global_ic, 1)} (IC 95 %)</small></div><div><span>Puntos evaluados</span><b>${number(r.n_total, 0)}</b><small>${number(r.area_total, 0)} ha cartografiadas</small></div></div>
      <table class="fi-table"><thead><tr><th>Clase</th><th>Exactitud de usuario<small>1 − comisión</small></th><th>Exactitud de productor<small>1 − omisión</small></th><th>Superficie del mapa</th><th>Superficie ajustada (IC 95 %)</th></tr></thead><tbody>
      ${r.por_clase.map((f) => `<tr><td><i class="fi-dot" style="background:${color.get(String(f.clase))}"></i>${esc(et.get(String(f.clase)))}<small>n = ${f.n}</small></td><td>${pct(f.exactitud_usuario)} <small>± ${pct(f.exactitud_usuario_ic)}</small></td><td>${pct(f.exactitud_productor)} <small>± ${pct(f.exactitud_productor_ic)}</small></td><td>${ha(f.area_mapa)}</td><td>${ha(f.area_ajustada)} <small>± ${ha(f.area_ajustada_ic)}</small></td></tr>`).join('')}
      </tbody></table>
      <h3>Superficie del mapa frente a superficie ajustada</h3>
      <div class="va-ci">${r.por_clase.map((f) => { const x = (v) => Math.max(0, Math.min(100, v / max * 100)); return `<div><span>${esc(et.get(String(f.clase)))}</span><i><em class="int" style="left:${x(f.area_ajustada - f.area_ajustada_ic)}%;width:${x(f.area_ajustada + f.area_ajustada_ic) - x(f.area_ajustada - f.area_ajustada_ic)}%;background:${color.get(String(f.clase))}55"></em><em class="est" style="left:${x(f.area_ajustada)}%;background:${color.get(String(f.clase))}"></em><em class="mapa" style="left:${x(f.area_mapa)}%"></em></i></div>`; }).join('')}<p class="rs-note"><span class="va-k mapa"></span> superficie del mapa · <span class="va-k est"></span> estimación ajustada · franja = intervalo del 95 %</p></div>
      <h3>Cómo leerlo</h3><ul class="fi-list">${r.por_clase.map((f) => lecturaClase(f, et.get(String(f.clase)))).join('')}</ul>
      <details><summary>Matriz de confusión (puntos)</summary><table class="fi-table va-mat"><thead><tr><th>Mapa ↓ / Referencia →</th>${r.clases.map((c) => `<th>${esc(et.get(String(c)))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${n.map((fila, i) => `<tr><th>${esc(et.get(String(r.clases[i])))}</th>${fila.map((v, j) => `<td class="${i === j ? 'diag' : ''}">${v}</td>`).join('')}<td>${fila.reduce((s, v) => s + v, 0)}</td></tr>`).join('')}</tbody></table>
      <p class="rs-note">La diagonal son aciertos. Fuera de la diagonal: por filas, errores de comisión; por columnas, errores de omisión. Las proporciones se ponderan por la superficie de cada estrato.</p></details>`;
  }
  function ejemplo(destino) {
    const r = V.evaluar([1, 2, 3, 4], EJEMPLO.areas, EJEMPLO.conteos);
    destino.innerHTML = renderResultados(r, EJEMPLO.leyenda, '<p class="rs-warn"><b>Ejemplo publicado, no son datos de la CHCP.</b> Olofsson et al. (2014), sección 5. Sirve para entender cómo se leerán los resultados cuando la muestra de la cuenca esté interpretada.</p>');
  }

  // ------------------------------------------------------------ interpretación
  const CLAVE = () => `chcp-validacion-${st.mapa}`;
  function guardarLocal() { try { localStorage.setItem(CLAVE(), JSON.stringify(st.muestra.map((p) => [p.id, p.clase_referencia || '', p.confianza || '', p.notas || '']))); } catch (_) { /* almacenamiento no disponible */ } }
  function cargarLocal() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE()) || '[]');
      const m = new Map(datos.map(([id, c, conf, n]) => [id, { c, conf, n }]));
      st.muestra.forEach((p) => { const x = m.get(p.id); if (x && !p.clase_referencia) Object.assign(p, { clase_referencia: x.c, confianza: x.conf, notas: x.n }); });
    } catch (_) { /* nada guardado */ }
  }
  function csv() {
    const cols = ['id', 'lon', 'lat', 'clase_referencia', 'confianza', 'interprete', 'fecha', 'fuente_imagen', 'notas'];
    const q = (v) => (/[",;\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    return [cols.join(','), ...st.muestra.map((p) => cols.map((c) => q(p[c])).join(','))].join('\n');
  }
  function descargar(nombre, texto, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); URL.revokeObjectURL(a.href); }
  function renderInterpretacion() {
    const cont = $('#va-int');
    if (!st.muestra.length) { cont.innerHTML = '<p class="fi-pending">La muestra aún no se ha generado. En GitHub: Actions → «Generar muestra de validación».</p>'; return; }
    const hechos = st.muestra.filter((p) => p.clase_referencia).length;
    const p = st.muestra[st.i];
    cont.innerHTML = `<div class="va-int">
      <div class="va-int-map"><div id="va-map"></div><p class="rs-note">Imagen: Esri World Imagery (fecha única). Para ver el cambio 2020–2025 use <a target="_blank" rel="noopener" href="https://earth.google.com/web/@${p.lat},${p.lon},300a,800d,35y,0h,0t,0r">Google Earth</a> o Google Earth Pro con imágenes históricas (<a href="${valFile(`${st.mapa}/muestra.kml`)}" download>KML</a>).</p></div>
      <div class="va-int-form">
        <div class="va-prog"><span>Punto <b>${st.i + 1}</b> de ${st.muestra.length} · ${esc(p.id)}</span><i><b style="width:${hechos / st.muestra.length * 100}%"></b></i><small>${hechos} interpretados</small></div>
        <p class="rs-note">${number(p.lat, 5)}, ${number(p.lon, 5)} · el recuadro amarillo es el píxel de ${st.diseno.escala_m} m evaluado.</p>
        <div class="va-clases">${st.diseno.leyenda.map((c) => `<button type="button" data-c="${c.codigo}" class="${String(p.clase_referencia) === String(c.codigo) ? 'on' : ''}"><i style="background:${c.color}"></i><b>${esc(c.etiqueta)}</b><small>${esc(c.guia || '')}</small></button>`).join('')}</div>
        <label class="rs-field">Confianza<select id="va-conf"><option value="">—</option>${['alta', 'media', 'baja'].map((x) => `<option ${p.confianza === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="rs-field">Notas<input id="va-notas" value="${esc(p.notas || '')}" placeholder="Fecha de imagen, dudas, causa del cambio…"></label>
        <label class="rs-field">Intérprete<input id="va-interprete" value="${esc(localStorage.getItem('chcp-interprete') || '')}"></label>
        <div class="va-nav"><button class="btn btn-s" id="va-prev" type="button">← Anterior</button><button class="btn btn-s" id="va-sig-pend" type="button">Siguiente sin interpretar</button><button class="btn btn-p" id="va-next" type="button">Siguiente →</button></div>
        <div class="va-nav"><button class="btn btn-s" id="va-desc" type="button">Descargar muestra.csv</button><label class="btn btn-s va-file">Continuar desde un CSV<input type="file" id="va-cont" accept=".csv" hidden></label></div>
      </div></div>`;
    if (st.map) st.map.remove();
    st.map = L.map('va-map', { zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri World Imagery', maxZoom: 19 }).addTo(st.map);
    const m = st.diseno.escala_m / 2, dLat = m / 110540, dLon = m / (111320 * Math.cos(p.lat * Math.PI / 180));
    L.rectangle([[p.lat - dLat, p.lon - dLon], [p.lat + dLat, p.lon + dLon]], { color: '#ffeb3b', weight: 2, fill: false }).addTo(st.map);
    L.circle([p.lat, p.lon], { radius: 150, color: '#fff', weight: 1, dashArray: '3 4', fill: false }).addTo(st.map);
    st.map.setView([p.lat, p.lon], 17);
    const guardar = () => {
      p.confianza = $('#va-conf').value; p.notas = $('#va-notas').value;
      p.interprete = $('#va-interprete').value; try { localStorage.setItem('chcp-interprete', p.interprete); } catch (_) { /* */ }
      if (p.clase_referencia && !p.fecha) p.fecha = new Date().toISOString().slice(0, 10);
      if (p.clase_referencia && !p.fuente_imagen) p.fuente_imagen = 'Esri World Imagery / Google Earth';
      guardarLocal();
    };
    $$('.va-clases button').forEach((b) => b.addEventListener('click', () => { p.clase_referencia = b.dataset.c; guardar(); if (st.i < st.muestra.length - 1) st.i += 1; renderInterpretacion(); }));
    ['#va-conf', '#va-notas', '#va-interprete'].forEach((s) => $(s).addEventListener('change', guardar));
    $('#va-prev').addEventListener('click', () => { guardar(); st.i = Math.max(0, st.i - 1); renderInterpretacion(); });
    $('#va-next').addEventListener('click', () => { guardar(); st.i = Math.min(st.muestra.length - 1, st.i + 1); renderInterpretacion(); });
    $('#va-sig-pend').addEventListener('click', () => { guardar(); const k = st.muestra.findIndex((x, j) => j > st.i && !x.clase_referencia); st.i = k >= 0 ? k : st.muestra.findIndex((x) => !x.clase_referencia); if (st.i < 0) st.i = 0; renderInterpretacion(); });
    $('#va-desc').addEventListener('click', () => { guardar(); descargar('muestra.csv', csv(), 'text/csv'); });
    $('#va-cont').addEventListener('change', async (e) => {
      const filas = V.leerCsv(await e.target.files[0].text());
      const m2 = new Map(filas.map((f) => [f.id, f]));
      st.muestra.forEach((x) => { const f = m2.get(x.id); if (f) ['clase_referencia', 'confianza', 'interprete', 'fecha', 'fuente_imagen', 'notas'].forEach((k) => { if (f[k]) x[k] = f[k]; }); });
      guardarLocal(); renderInterpretacion();
    });
  }

  // ------------------------------------------------------------ carga por mapa
  function codigoReferencia(valor) {
    const v = String(valor || '').trim().toLowerCase();
    const c = st.diseno.leyenda.find((x) => [String(x.codigo), x.clave, x.etiqueta.toLowerCase()].includes(v));
    return c ? c.codigo : null;
  }
  function calcularLocal(filas) {
    const pares = filas.map((f) => [st.estratos.get(f.id), codigoReferencia(f.clase_referencia)]).filter(([a, b]) => a != null && b != null);
    const codigos = st.diseno.leyenda.map((c) => c.codigo);
    const conteos = V.matrizConteos(pares, codigos);
    const insuf = codigos.filter((c, i) => Number(st.diseno.areas_ha[String(c)]) > 0 && conteos[i].reduce((s, v) => s + v, 0) < 2);
    if (insuf.length) return `<p class="rs-warn">${pares.length} puntos interpretados. Faltan al menos 2 por estrato para calcular (${insuf.map((c) => esc(st.diseno.leyenda.find((x) => x.codigo === c).etiqueta)).join(', ')}).</p>`;
    const areas = Object.fromEntries(codigos.map((c) => [c, Number(st.diseno.areas_ha[String(c)])]));
    return renderResultados(V.evaluar(codigos, areas, conteos), st.diseno.leyenda, `<p class="rs-warn"><b>Cálculo local, no publicado.</b> ${pares.length} de ${filas.length} puntos interpretados.</p>`);
  }
  async function cargarMapa(clave) {
    st.mapa = clave; st.i = 0;
    try {
      [st.diseno, st.resultados] = await Promise.all([obtener(`${clave}/diseno.json`), obtener(`${clave}/resultados.json`).catch(() => null)]);
      const est = V.leerCsv(await obtener(`${clave}/estratos.csv`, 'text'));
      st.estratos = new Map(est.map((f) => [f.id, Number(f.clase_mapa)]));
      st.muestra = V.leerCsv(await obtener(`${clave}/muestra.csv`, 'text')).map((f) => ({ ...f, lon: Number(f.lon), lat: Number(f.lat) }));
    } catch (_) { st.diseno = null; st.muestra = []; }
    if (!st.diseno) return;
    cargarLocal();
    const d = st.diseno;
    $('#va-diseno').innerHTML = `<p>${esc(d.descripcion || '')}</p><table class="fi-table"><thead><tr><th>Estrato (clase del mapa)</th><th>Superficie</th><th>Peso</th><th>Puntos</th><th>Interpretados (publicado)</th></tr></thead><tbody>${d.leyenda.map((c) => { const a = Number(d.areas_ha[String(c.codigo)]); const tot = Object.values(d.areas_ha).reduce((s, v) => s + Number(v), 0); return `<tr><td><i class="fi-dot" style="background:${c.color}"></i>${esc(c.etiqueta)}</td><td>${ha(a)}</td><td>${pct(a / tot, 1)}</td><td>${d.n_obtenido?.[String(c.codigo)] ?? d.asignacion[String(c.codigo)]}</td><td>${st.resultados?.por_estrato?.[String(c.codigo)] ?? 0}</td></tr>`; }).join('')}</tbody></table><p class="rs-note">Muestra aleatoria estratificada de ${number(st.muestra.length, 0)} puntos (semilla ${d.semilla}, ${esc(String(d.generado).slice(0, 10))}), error estándar objetivo ${d.error_objetivo}, mínimo ${d.minimo_por_estrato} por estrato. <a href="${valFile(`${clave}/muestra.csv`)}" download>muestra.csv</a> · <a href="${valFile(`${clave}/muestra.kml`)}" download>muestra.kml</a></p>`;
    const r = st.resultados;
    $('#va-estado').innerHTML = r ? `<b>${r.interpretados}</b> de ${r.total_puntos} puntos interpretados${r.completo ? ' · muestra completa' : ''}` : 'Sin interpretaciones publicadas';
    if (r?.resultado) $('#va-res').innerHTML = renderResultados(r.resultado, d.leyenda, r.completo ? '' : `<p class="rs-warn"><b>Resultados preliminares:</b> ${r.interpretados} de ${r.total_puntos} puntos interpretados. Los intervalos se estrecharán al completar la muestra.</p>`);
    else { $('#va-res').innerHTML = `<p class="fi-pending">${esc(r?.mensaje || 'Aún no hay puntos interpretados publicados.')} Mientras tanto, así se verán los resultados:</p><div id="va-ej"></div>`; ejemplo($('#va-ej')); }
    renderInterpretacion();
  }

  // ------------------------------------------------------------ inicio
  try { st.indice = await obtener('indice.json'); } catch (_) { st.indice = { mapas: [] }; }
  if (!st.indice.mapas.length) {
    $('#va-mapa').innerHTML = '<option>Sin muestras generadas</option>';
    $('#va-diseno').innerHTML = '<p class="fi-pending">Todavía no se ha generado ninguna muestra de validación. En GitHub: <b>Actions → «Generar muestra de validación»</b> (elija «senal_perdida»). Tarda unos minutos y crea los puntos a interpretar.</p>';
    $('#va-res').innerHTML = '<div id="va-ej"></div>'; ejemplo($('#va-ej'));
    $('#va-int').innerHTML = '<p class="fi-pending">La herramienta de interpretación aparecerá cuando exista la muestra.</p>';
  } else {
    $('#va-mapa').innerHTML = st.indice.mapas.map((m) => `<option value="${m.mapa}">${esc(m.titulo)}</option>`).join('');
    $('#va-mapa').addEventListener('change', (e) => cargarMapa(e.target.value));
    await cargarMapa(st.indice.mapas[0].mapa);
  }
  $('#va-archivo').addEventListener('change', async (e) => {
    if (!st.diseno) { $('#va-propio').innerHTML = '<p class="rs-warn">Primero debe existir una muestra generada (diseño y estratos).</p>'; return; }
    $('#va-propio').innerHTML = calcularLocal(V.leerCsv(await e.target.files[0].text()));
  });
})();
