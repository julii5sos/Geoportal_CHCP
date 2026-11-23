/* Plataforma SIG del sitio publicado: capas precalculadas por cuenca y subcuenca
   (sin Earth Engine en el navegador). Misma estructura que la plataforma completa:
   Capas · Polígono · Mapa base, mapa central y panel de resultados. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, mapFile } = window.CHCP;
  const icon = window.CHCP_ICON || (() => '');
  const PRIO = { Alta: '#d0442c', Media: '#f28e2b', Preventiva: '#fabc20', Baja: '#77cc09' };
  const COLOR_CORREDOR = { Alta: '#1b5e20', Mediana: '#9ccc65', 'Media-baja': '#ffb74d' };
  const BASES = [
    ['gris', 'Gris claro', 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', '#e9ecef'],
    ['satelite', 'Satélite', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '#3d5a40'],
    ['topo', 'Topográfico', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', '#d9e4c8'],
  ];
  const st = { data: null, territory: null, id: 'chcp', map: null, base: null, activas: new Set(['subcuencas', 'corredores', 'puntos']), opacidad: 0.85, capas: {}, geo: null, rios: null };
  const pct = (v, d = 0) => (v == null ? '—' : `${number(v, d)} %`);
  const t = () => st.data.territorios[st.id];
  const conMapas = () => (t()?.mapas?.capas?.length ? t() : st.data.territorios.chcp);

  // ------------------------------------------------------------ catálogo de capas
  function catalogo() {
    const raster = (st.data.capas_mapa || []).map((c) => ({ k: `r:${c.clave}`, nombre: c.titulo, nota: c.lectura, grupo: 'Bosque, cambio y resiliencia', disponible: !!conMapas()?.mapas?.capas?.includes(c.clave), capa: c }));
    return [
      { k: 'preevaluacion', nombre: 'Preevaluación por subcuenca', nota: 'Puntaje MT-2026.7 (0–6,5) de cada subcuenca.', grupo: 'Territorio', disponible: true, color: '#d0442c' },
      { k: 'subcuencas', nombre: 'Límites de subcuencas', nota: '53 subcuencas del Canal de Panamá.', grupo: 'Territorio', disponible: true, color: '#0a4393' },
      { k: 'corredores', nombre: 'Corredores · Almanaque Azul', nota: 'Corredores de conectividad publicados, por categoría.', grupo: 'Territorio', disponible: true, color: '#9ccc65' },
      { k: 'puntos', nombre: 'Puntos críticos · Almanaque Azul', nota: 'Amenazas a la conectividad señaladas por el Almanaque Azul.', grupo: 'Territorio', disponible: true, color: '#f04438' },
      { k: 'rios', nombre: 'Ríos', nota: conMapas()?.mapas?.rios_fuente || 'HydroSHEDS, drenaje ≥ 10 km².', grupo: 'Territorio', disponible: !!conMapas()?.mapas?.rios, color: '#1f78b4' },
      { k: 'sitios', nombre: 'Sitios para verificación de campo', nota: 'Manchas con señales de pérdida, priorizadas por fuentes coincidentes.', grupo: 'Territorio', disponible: Object.values(st.data.territorios).some((x) => x?.sitios?.length), color: '#6a1b9a' },
      ...raster,
      { k: 'parches', nombre: 'Parches de bosque 2021 por importancia', nota: 'Bosque oficial SINIA 2021; color según su papel en la red.', grupo: 'Fragmentación y conectividad', disponible: st.id !== 'chcp' && !!st.geo, color: '#1b5e20' },
      { k: 'brechas', nombre: 'Brechas candidatas a reconexión', nota: 'Parches aislados y su vecino más cercano.', grupo: 'Fragmentación y conectividad', disponible: st.id !== 'chcp' && !!st.geo, color: '#ff5252' },
    ];
  }
  function renderCapas() {
    const grupos = {};
    catalogo().forEach((c) => { (grupos[c.grupo] ||= []).push(c); });
    $('#pe-capas').innerHTML = Object.entries(grupos).map(([g, items], i) => `<div class="lg open"><button type="button"><span>${esc(g)}</span><span class="cnt">${items.filter((x) => st.activas.has(x.k)).length || ''}</span><i class="chev"></i></button><div class="lg-items">${items.map((c) => `<div class="ly ${c.disponible ? '' : 'layer-disabled'}"><div class="ly-h"><span class="tg"><input type="checkbox" data-k="${c.k}" ${st.activas.has(c.k) && c.disponible ? 'checked' : ''} ${c.disponible ? '' : 'disabled'} aria-label="Mostrar ${esc(c.nombre)}"><span></span></span><i class="layer-color" style="background:${c.capa ? (c.capa.paleta ? `linear-gradient(90deg,${c.capa.paleta.join(',')})` : c.capa.leyenda[0].color) : c.color}"></i><label class="nm">${esc(c.nombre)}<small>${esc(c.disponible ? c.nota : (c.k === 'parches' || c.k === 'brechas') ? 'Elija una subcuenca.' : 'Se genera en la próxima actualización de datos.')}</small></label></div></div>`).join('')}${i === 1 ? `<label class="pe-op">Opacidad de los mapas <output>${Math.round(st.opacidad * 100)} %</output><input type="range" id="pe-op" min="20" max="100" step="5" value="${st.opacidad * 100}"></label>` : ''}</div></div>`).join('');
    $$('#pe-capas .lg > button').forEach((b) => b.addEventListener('click', () => b.parentElement.classList.toggle('open')));
    $$('#pe-capas [data-k]').forEach((x) => x.addEventListener('change', () => { x.checked ? st.activas.add(x.dataset.k) : st.activas.delete(x.dataset.k); dibujar(); renderCapas(); }));
    $('#pe-op')?.addEventListener('input', (e) => { st.opacidad = e.target.value / 100; e.target.previousElementSibling.textContent = `${e.target.value} %`; Object.entries(st.capas).forEach(([k, l]) => k.startsWith('r:') && l.setOpacity(st.opacidad)); });
  }

  // ------------------------------------------------------------ mapa
  async function dibujar() {
    const map = st.map;
    Object.values(st.capas).forEach((l) => map.removeLayer(l));
    st.capas = {};
    const fuente = conMapas();
    const orden = catalogo().filter((c) => c.disponible && st.activas.has(c.k));
    for (const c of orden.filter((x) => x.k.startsWith('r:'))) {
      st.capas[c.k] = L.imageOverlay(mapFile(fuente.id, `${c.capa.clave}.png`), fuente.mapas.limites, { opacity: st.opacidad, interactive: false, pane: 'rasters', className: 'pe-raster' }).addTo(map);
    }
    if (st.activas.has('preevaluacion')) {
      // Debajo del velo (se recorta con la subcuenca) y transparente sobre ella si hay mapas activos.
      const hayRaster = orden.some((c) => c.k.startsWith('r:'));
      st.capas.preevaluacion = L.geoJSON(st.territory.subbasins, { pane: 'rasters', style: (f) => { const p = st.data.territorios[f.properties.id]?.preevaluacion; const propia = f.properties.id === st.id; return { color: '#fff', weight: 0.8, fillColor: PRIO[p?.prioridad] || '#e5e9f0', fillOpacity: propia && hayRaster ? 0 : 0.55 }; }, onEachFeature: clicSubcuenca }).addTo(map);
    }
    if (st.activas.has('subcuencas')) {
      st.capas.subcuencas = L.geoJSON(st.territory.subbasins, { style: (f) => ({ color: f.properties.id === st.id ? '#ffd54f' : '#0a4393', weight: f.properties.id === st.id ? 3 : 1, fill: !st.activas.has('preevaluacion'), fillOpacity: 0 }), onEachFeature: clicSubcuenca }).addTo(map);
    }
    if (st.activas.has('corredores')) st.capas.corredores = L.geoJSON(st.territory.corridors, { style: (f) => { const c = COLOR_CORREDOR[f.properties.categoria_etiqueta] || '#7fae00'; return { color: c, weight: 1.4, fillColor: c, fillOpacity: 0.15 }; }, onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties.nombre)} · conectividad ${esc(f.properties.categoria_etiqueta)}`) }).addTo(map);
    if (st.activas.has('rios') && fuente.mapas?.rios) {
      try { st.rios = await (await fetch(mapFile(fuente.id, 'rios.json'))).json(); st.capas.rios = L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 2 }, interactive: false, pane: 'rasters' }).addTo(map); } catch (_) { /* sin ríos */ }
    }
    if (st.activas.has('parches') && st.geo) {
      const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
      st.capas.parches = L.geoJSON(st.geo.parches, { style: (f) => ({ color: '#0b3d17', weight: 0.6, fillColor: color[f.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.85 }), onEachFeature: (f, l) => l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · importancia ${f.properties.prioridad_conectividad || '—'}`) }).addTo(map);
    }
    if (st.activas.has('brechas') && st.geo) st.capas.brechas = L.geoJSON(st.geo.brechas, { style: { color: '#ff5252', weight: 3, dashArray: '6 5' } }).addTo(map);
    if (st.activas.has('puntos')) st.capas.puntos = L.geoJSON(st.territory.critical_points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f04438', fillOpacity: 1 }), onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.notas || 'Punto crítico'), { maxWidth: 280 }) }).addTo(map);
    if (st.activas.has('sitios')) {
      const sitios = Object.values(st.data.territorios).filter((x) => x && (st.id === 'chcp' || x.id === st.id)).flatMap((x) => (x.sitios || []).map((s) => ({ ...s, sub: x.nombre })));
      st.capas.sitios = L.layerGroup(sitios.map((s) => L.circleMarker([s.lat, s.lon], { radius: 4 + s.fuentes * 2, color: '#fff', weight: 1.2, fillColor: '#6a1b9a', fillOpacity: 0.9 }).bindTooltip(`${esc(s.id)} · ${hectares(s.area_ha)} · ${s.fuentes} fuente(s)`))).addTo(map);
    }
    // Recorte visual: con una subcuenca elegida, todo lo que está fuera queda velado.
    const f = st.id !== 'chcp' && st.territory.subbasins.features.find((x) => x.properties.id === st.id);
    if (f) {
      const huecos = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p[0].map(([x, y]) => [y, x]));
      st.capas.mascara = L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], ...huecos], { pane: 'mascara', stroke: false, fillColor: '#eef1f4', fillOpacity: 0.9, interactive: false }).addTo(map);
    }
    const aviso = $('#pe-aviso');
    const reutiliza = st.id !== 'chcp' && fuente.id === 'chcp' && orden.some((c) => c.k.startsWith('r:'));
    aviso.hidden = !reutiliza;
    if (reutiliza) aviso.innerHTML = `Los mapas detallados de ${esc(t().nombre)} aún no se han generado: se muestra el mapa de la cuenca completa (píxel de ${number(fuente.mapas.tamano_pixel_m, 0)} m) recortado a la subcuenca. Se reemplazará por la versión de 10–30 m en la próxima actualización.`;
    leyenda(orden);
  }
  function clicSubcuenca(f, l) {
    const x = st.data.territorios[f.properties.id];
    l.bindTooltip(`${esc(f.properties.nombre)}${x ? ` · ${number(x.preevaluacion.puntaje, 1)} pts (${esc(x.preevaluacion.prioridad)})` : ''}`, { sticky: true });
    l.on('click', () => { if (!pg.dibujando) seleccionar(f.properties.id, true); });
  }
  function leyenda(orden) {
    const bloques = orden.map((c) => {
      if (c.capa) {
        const ley = c.capa.tipo === 'continuo' ? `<div class="fi-ramp"><i style="background:linear-gradient(90deg,${c.capa.paleta.join(',')})"></i><span>${c.capa.leyenda.map((x) => `<em>${esc(x.etiqueta)}</em>`).join('')}</span></div>` : c.capa.leyenda.map((x) => `<div><i style="background:${x.color}"></i>${esc(x.etiqueta)}</div>`).join('');
        return `<div class="pe-lg"><b>${esc(c.capa.titulo)}</b>${ley}</div>`;
      }
      if (c.k === 'preevaluacion') return `<div class="pe-lg"><b>Preevaluación</b>${Object.entries(PRIO).map(([k, v]) => `<div><i style="background:${v}"></i>${k}</div>`).join('')}</div>`;
      if (c.k === 'corredores') return `<div class="pe-lg"><b>Corredores (Almanaque Azul)</b>${Object.entries(COLOR_CORREDOR).map(([k, v]) => `<div><i style="background:${v}"></i>${k}</div>`).join('')}</div>`;
      if (c.k === 'parches') return '<div class="pe-lg"><b>Parches por importancia</b><div><i style="background:#1b5e20"></i>Alta</div><div><i style="background:#66bb6a"></i>Media</div><div><i style="background:#c5e1a5"></i>Baja</div></div>';
      return `<div class="pe-lg"><div><i style="background:${c.color}"></i>${esc(c.nombre)}</div></div>`;
    });
    $('#pe-legend').innerHTML = `<button type="button" class="legend-head" aria-expanded="true"><b>Capas activas (${orden.length})</b><i class="chev"></i></button><div class="legend-body">${bloques.join('') || '<p class="legend-empty">Active una capa.</p>'}</div>`;
    $('#pe-legend .legend-head').addEventListener('click', (e) => { const b = e.currentTarget; const o = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', String(!o)); b.nextElementSibling.hidden = o; });
  }

  // ------------------------------------------------------------ análisis a elegir
  // Como en la plataforma completa, la persona elige el área y qué análisis consultar;
  // cada análisis activa sus capas y muestra solo su sección de resultados.
  const ANALISIS = {
    preevaluacion: { t: 'Preevaluación territorial (MT-2026.7)', d: 'Señales JRC, Hansen, ESRI, GEDI y NDVI; puntaje (máx. 6,5), consistencia entre fuentes y prioridad de visita con corredores.', i: 'shield', capas: ['preevaluacion'], pol: true },
    cambio: { t: 'Cambio de cobertura', d: 'Estado del bosque JRC 2025, evolución 2020–2025, pérdida Hansen por año, cambio de árboles ESRI y NDVI.', i: 'trend', capas: ['r:jrc_2025'], pol: true },
    fragmentacion: { t: 'Fragmentación', d: 'Parches del bosque oficial 2021: número, parche mayor, borde, bosque interior, distancia entre parches y cohesión.', i: 'forest', capas: ['parches'], pol: false },
    conectividad: { t: 'Conectividad estructural', d: 'Redes de parches a 500 m, parches aislados, IIC y parches clave (dIIC). Conectividad potencial, no movimiento de fauna.', i: 'network', capas: ['parches', 'brechas'], pol: true },
    corredores: { t: 'Corredores · Almanaque Azul', d: 'Superficie dentro de corredores, Corredor Biológico Mesoamericano y puntos críticos.', i: 'map', capas: ['corredores', 'puntos'], pol: true },
    eri: { t: 'Resiliencia ecológica (ERI)', d: 'Índice indicativo 0–100 con sus cuatro componentes.', i: 'sprout', capas: ['r:eri'], pol: true },
    riparia: { t: 'Ríos y franjas riparias', d: 'Bosque en franjas de 30, 50 y 100 m junto a los cauces y orillas sin bosque por pendiente.', i: 'leaf', capas: ['rios', 'r:riparia'], pol: true },
    sinia: { t: 'Coberturas oficiales SINIA', d: 'Bosque en los productos oficiales 2019, 2021 y 2023 (productos independientes).', i: 'layers', capas: ['r:sinia_2021'], pol: true },
    relativa: { t: 'Intensidad relativa del cambio (experimental)', d: 'Pérdida reciente, salida de árboles, legado JRC y vigor en proporción al bosque, comparados con la CHCP.', i: 'chart', capas: [], pol: false },
  };
  const wiz = { paso: 0, area: 'territorio', sel: new Set(['preevaluacion']) };
  const enlace = (ruta) => (window.CHCP_STATIC ? `${ruta}.html` : `/${ruta}`);
  const tarjeta = (n, v, s2 = '') => `<div class="pe-m"><span>${n}</span><b>${v}</b>${s2 ? `<small>${s2}</small>` : ''}</div>`;
  const tabla = (cab, filas) => `<table class="fi-table pe-t"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const NOMBRES_FUENTE = { tmf: 'JRC TMF', hansen: 'Hansen GFC', esri: 'ESRI LULC', gedi: 'GEDI', ndvi: 'NDVI Sentinel-2' };

  function abrirAsistente(area) {
    wiz.paso = area ? 1 : 0;
    if (area) wiz.area = area; else if (!pg.geo) wiz.area = 'territorio';
    $('#pe-modal').hidden = false;
    pintarAsistente();
  }
  function pintarAsistente() {
    const pasos = ['Área', 'Análisis', 'Revisar'];
    $('#pe-stp').innerHTML = pasos.map((n, k) => `<li class="${k === wiz.paso ? 'cur' : k < wiz.paso ? 'ok' : ''}"><i>${k < wiz.paso ? '✓' : k + 1}</i>${n}</li>`).join('');
    const x = t(), poli = wiz.area === 'poligono';
    let html = '';
    if (wiz.paso === 0) {
      html = `<h3>¿Qué área quiere analizar?</h3>
        <label class="opt"><input type="radio" name="pe-area" value="territorio" ${!poli ? 'checked' : ''}>${icon('map', 20)}<div><b>Cuenca o subcuenca</b><span>Resultados precalculados con Earth Engine (tipo B).</span>
          <select id="pe-wiz-terr" class="pe-wiz-sel">${$('#pe-terr').innerHTML}</select></div></label>
        <label class="opt ${pg.geo ? '' : 'layer-disabled'}"><input type="radio" name="pe-area" value="poligono" ${poli ? 'checked' : ''} ${pg.geo ? '' : 'disabled'}>${icon('target', 20)}<div><b>Polígono propio</b><span>${pg.geo ? `Polígono de ${hectares(P.areaHa(pg.geo), 1)} dibujado o subido. Estimación local en su navegador (tipo C).` : 'Primero dibuje o suba un polígono en la pestaña «Polígono».'}</span></div></label>`;
    } else if (wiz.paso === 1) {
      html = `<h3>¿Qué análisis quiere consultar?</h3><p class="sub">Puede elegir uno o varios. Cada uno activa sus capas en el mapa y muestra solo su sección de resultados.</p>
        <div class="pe-wiz-acc"><button type="button" class="btn btn-s" id="pe-todos">Seleccionar todos</button><button type="button" class="btn btn-s" id="pe-ninguno">Ninguno</button></div>
        ${Object.entries(ANALISIS).map(([k, a]) => { const ok = !poli || a.pol; return `<label class="opt ${ok ? '' : 'layer-disabled'}"><input type="checkbox" value="${k}" ${wiz.sel.has(k) && ok ? 'checked' : ''} ${ok ? '' : 'disabled'}>${icon(a.i, 20)}<div><b>${esc(a.t)}</b><span>${esc(ok ? a.d : 'Disponible solo para cuenca o subcuenca.')}</span></div></label>`; }).join('')}`;
    } else {
      const elegidos = [...wiz.sel].filter((k) => !poli || ANALISIS[k].pol);
      html = `<h3>Revisar y consultar</h3><dl class="rev"><dt>Área</dt><dd>${poli ? `Polígono propio (${hectares(P.areaHa(pg.geo), 1)})` : esc(x.nombre)}</dd><dt>Análisis</dt><dd>${elegidos.map((k) => esc(ANALISIS[k].t)).join('<br>') || '—'}</dd><dt>Procesamiento</dt><dd>${poli ? 'Tipo C · estimación local sobre mapas precalculados' : `Tipo B · precalculado con Earth Engine (${esc(String(st.data.generado || '').slice(0, 10))})`}</dd></dl>
        <p class="sub">${poli ? 'El cálculo se hace en su navegador; el polígono no se envía a ningún servidor.' : 'No se ejecuta Earth Engine en este momento: se consultan los resultados ya calculados para este territorio.'}</p>`;
    }
    $('#pe-wiz').innerHTML = html;
    $('#pe-back').hidden = wiz.paso === 0;
    $('#pe-next').textContent = wiz.paso === 2 ? 'Consultar resultados' : 'Siguiente';
    $('#pe-next').disabled = wiz.paso === 2 && ![...wiz.sel].some((k) => !poli || ANALISIS[k].pol);
    $$('#pe-wiz [name=pe-area]').forEach((r) => r.addEventListener('change', () => { wiz.area = r.value; }));
    $('#pe-wiz-terr')?.addEventListener('change', (e) => { seleccionar(e.target.value); wiz.area = 'territorio'; $$('#pe-wiz [name=pe-area]').forEach((r) => { r.checked = r.value === 'territorio'; }); });
    if ($('#pe-wiz-terr')) $('#pe-wiz-terr').value = st.id;
    $$('#pe-wiz input[type=checkbox]').forEach((c) => c.addEventListener('change', () => { c.checked ? wiz.sel.add(c.value) : wiz.sel.delete(c.value); }));
    $('#pe-todos')?.addEventListener('click', () => { Object.keys(ANALISIS).forEach((k) => wiz.sel.add(k)); pintarAsistente(); });
    $('#pe-ninguno')?.addEventListener('click', () => { wiz.sel.clear(); pintarAsistente(); });
  }
  async function ejecutarAsistente() {
    $('#pe-modal').hidden = true;
    const poli = wiz.area === 'poligono';
    const elegidos = Object.keys(ANALISIS).filter((k) => wiz.sel.has(k) && (!poli || ANALISIS[k].pol));
    // Las capas del análisis se activan; las de referencia (límites) se conservan.
    st.activas = new Set(['subcuencas', ...elegidos.flatMap((k) => ANALISIS[k].capas)]);
    if (poli) {
      renderCapas(); await dibujar();
      try { await analizarPoligono(); } catch (err) { $('#pg-busy').hidden = true; mostrarError(`Error al analizar: ${err.message}`); return; }
    } else {
      renderCapas(); await dibujar();
    }
    renderResultados(poli ? 'poligono' : 'territorio', elegidos);
  }

  // ------------------------------------------------------------ secciones de resultados
  function senalesHtml(senales, aportes, detalle) {
    return `<ul class="pe-sig">${Object.keys(NOMBRES_FUENTE).map((k) => `<li class="${senales[k] ? 'on' : ''}"><b>${senales[k] ? '✓' : '·'} ${NOMBRES_FUENTE[k]}</b> <span>+${senales[k] ? number(aportes?.[k] ?? 0, 1) : '0'}</span><small>${detalle[k] || ''}</small></li>`).join('')}</ul>`;
  }
  const SECCIONES_T = {
    preevaluacion: (x) => { const p = x.preevaluacion; return `<div class="pe-prio" style="border-color:${PRIO[p.prioridad] || '#90a4ae'}"><span>Puntaje MT-2026.7</span><b>${number(p.puntaje, 1)} <small>/ ${number(p.puntaje_maximo, 1)}</small></b><em style="color:${PRIO[p.prioridad]}">${esc(p.prioridad)}</em><small>Prioridad de visita: ${esc(p.prioridad_visita || '—')} · ${esc(p.consistencia || '')}</small></div>
      ${senalesHtml(p.senales || {}, p.aportes, { tmf: `Deforestado ${hectares(x.jrc_ha.tmf_deforestacion, 0)} · degradado ${hectares(x.jrc_ha.tmf_degradacion, 0)} (estado acumulado)`, hansen: `Pérdida 2021–2025: ${hectares(x.hansen_post_2020_ha, 1)}`, esri: `Árboles → otra clase: ${hectares(x.esri?.esri_salida, 1)}`, gedi: x.gedi_altura_m == null ? 'Sin dato' : `Altura media ${number(x.gedi_altura_m, 1)} m`, ndvi: `Descenso fuerte: ${hectares(x.ndvi?.ndvi_disminucion, 1)}` })}
      ${x.id !== 'chcp' ? '<p class="hint-p small">En subcuencas extensas MT-2026.7 tiende a saturarse (ver «Intensidad relativa del cambio»).</p>' : ''}`; },
    cambio: (x) => { const j = x.jrc_ha, a = x.area_ha, serie = x.serie_anual || [];
      return `${tabla(['Estado JRC 2025', 'Superficie', '%'], [['Bosque sin perturbación', j.tmf_estable], ['Degradado', j.tmf_degradacion], ['Deforestado', j.tmf_deforestacion], ['Regeneración', j.tmf_recuperacion], ['Agua', j.tmf_agua], ['Otra cobertura', j.tmf_otra_cobertura]].map(([n, v]) => [n, hectares(v, 0), pct((v || 0) / a * 100, 1)]))}
      ${serie.length ? `<h4 class="pe-h4">Evolución anual</h4>${tabla(['Año', 'Deforestado JRC', 'Degradado JRC', 'Pérdida Hansen'], serie.map((r) => [r.anio, hectares(r.jrc_deforestacion_ha, 0), hectares(r.jrc_degradacion_ha, 0), r.hansen_perdida_ha == null ? '—' : hectares(r.hansen_perdida_ha, 1)]))}` : ''}
      <div class="pe-ms">${tarjeta('ESRI árboles → otra clase', hectares(x.esri?.esri_salida, 1), '2017 → 2024')}${tarjeta('ESRI otra clase → árboles', hectares(x.esri?.esri_ganancia, 1), '2017 → 2024')}${tarjeta('NDVI medio', `${number(x.ndvi?.ndvi_inicial_medio, 2)} → ${number(x.ndvi?.ndvi_final_medio, 2)}`, '2020 → 2025')}${tarjeta('Descenso fuerte de NDVI', hectares(x.ndvi?.ndvi_disminucion, 1), '≥ 0,15')}</div>`; },
    fragmentacion: (x) => { const e = x.estructura_2021; if (!e) return '<p class="fi-pending">Sin estructura calculada para este territorio.</p>'; const c = e.metricas_clase, mp = e.metricas_paisaje;
      return `<div class="pe-ms">${tarjeta('Parches de bosque 2021', number(c.numero_parches, 0))}${tarjeta('Bosque oficial 2021', hectares(c.area_total_bosque_ha, 0))}${tarjeta('Parche mayor', pct(c.indice_parche_mayor_pct, 1), 'del paisaje')}${tarjeta('Densidad de borde', `${number(c.densidad_borde_m_ha, 1)} m/ha`)}${tarjeta('Bosque interior (100 m)', mp?.porcentaje_bosque_nucleo == null ? '—' : pct(mp.porcentaje_bosque_nucleo, 1), 'del bosque')}${tarjeta('Distancia media entre parches', mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`)}${tarjeta('Cohesión', mp?.cohesion == null ? '—' : number(mp.cohesion, 1), '0–100')}</div>
      ${mp?.area_nucleo?.por_profundidad ? tabla(['Profundidad de borde', 'Bosque interior', '% del bosque'], mp.area_nucleo.por_profundidad.map((r) => [`${r.profundidad_m} m`, hectares(r.area_nucleo_ha, 0), pct(r.porcentaje_bosque_nucleo, 1)])) : '<p class="hint-p small">Área núcleo, distancia entre parches y cohesión: próxima actualización de datos.</p>'}`; },
    conectividad: (x) => { const e = x.estructura_2021; if (!e) return '<p class="fi-pending">Sin red calculada para este territorio.</p>'; const r = e.metricas_red, mp = e.metricas_paisaje;
      return `<div class="pe-ms">${tarjeta('Redes separadas', number(r.numero_componentes, 0), `umbral ${number(r.umbral_m || st.data.umbral_conectividad_m || 500, 0)} m`)}${tarjeta('Conexiones', number(r.numero_aristas, 0))}${tarjeta('Parches aislados', number(r.numero_parches_aislados, 0))}${tarjeta('IIC', mp?.iic == null ? '—' : number(mp.iic, 4), 'conectividad integral 0–1')}</div>
      ${(mp?.diic_principales || []).length ? tabla(['Parche', 'Superficie', 'Aporte (dIIC)', 'Función'], mp.diic_principales.slice(0, 5).map((d) => [`#${d.parche_id}`, hectares(d.area_ha, 1), pct(d.diic_pct, 1), d.es_puente ? 'Puente' : 'Gran hábitat'])) : ''}
      ${x.id !== 'chcp' ? `<p><a href="${enlace('restauracion')}?id=${encodeURIComponent(x.id)}">Simular dónde restaurar para reconectar →</a></p>` : ''}<p class="hint-p small">Conectividad estructural potencial por cercanía; no demuestra movimiento de fauna.</p>`; },
    corredores: (x) => { const c = x.corredores || {}; const feature = st.territory.subbasins.features.find((f) => f.properties.id === x.id);
      const puntos = feature ? (st.territory.critical_points?.features || []).filter((p) => RED.puntoEnPoligono(p.geometry.coordinates, feature.geometry)).length : (st.territory.critical_points?.features || []).length;
      return `<div class="pe-ms">${tarjeta('Dentro de corredores', pct(c.porcentaje, 1), hectares(c.area_ha, 0))}${tarjeta('Corredor Mesoamericano', c.intersecta_mesoamericano ? 'Sí' : 'No')}${tarjeta('Puntos críticos', number(puntos, 0), 'Almanaque Azul')}</div>
      ${(c.lista || []).length ? tabla(['Corredor', 'Categoría', 'Superficie'], c.lista.map((r) => [esc(r.nombre), esc(r.categoria || '—'), hectares(r.interseccion_ha, 0)])) : ''}`; },
    eri: (x) => { const e = x.eri; if (!e?.componentes) return '<p class="fi-pending">El ERI de este territorio se calcula en la próxima actualización de datos.</p>';
      const n = { integridad_estructural: 'Integridad (35 %)', conectividad: 'Conectividad local (25 %)', estabilidad_topografica: 'Estabilidad del relieve (20 %)', proximidad_riparia: 'Cercanía a ríos (20 %)' };
      return `<div class="pe-ms">${tarjeta('ERI', `${number(e.valor * 100, 0)}/100`, esc(e.clase))}${Object.entries(e.componentes).map(([k, v]) => tarjeta(n[k] || k, `${number(v * 100, 0)}/100`)).join('')}</div><p class="hint-p small">Indicativo, sin validación de campo; no modifica la preevaluación.</p>`; },
    riparia: (x) => { const r = x.riparia; if (!r?.franjas) return '<p class="fi-pending">El análisis ripario se calcula en la próxima actualización de datos.</p>';
      return `<p>Unos <b>${number(r.longitud_cauces_km, 1)} km</b> de cauces con drenaje ≥ ${r.area_drenaje_minima_km2} km².</p>${tabla(['Franja a cada lado', 'Bosque SINIA 2021', 'Árboles ESRI 2024'], r.franjas.map((f) => [`${f.ancho_m} m`, f.bosque_sinia_pct == null ? '—' : pct(f.bosque_sinia_pct, 1), f.arboles_esri_pct == null ? '—' : pct(f.arboles_esri_pct, 1)]))}${tabla(['Franja de 50 m sin bosque', 'Superficie'], r.sin_bosque_por_pendiente.map((f) => [`Pendiente ${f.pendiente}`, hectares(f.area_ha, 1)]))}<p class="hint-p small">${esc(r.nota)}</p>`; },
    sinia: (x) => `${tabla(['Producto', 'Bosque', '% del territorio'], (x.sinia || []).map((s) => [`SINIA ${s.year}`, hectares(s.forest_ha, 0), pct(s.forest_pct, 1)]))}<p class="hint-p small">Productos con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.</p>`,
    relativa: (x) => { const b = x.indicadores_relativos; if (!b?.valores || x.id === 'chcp') return '<p class="fi-pending">Disponible por subcuenca.</p>';
      const n = { perdida_reciente_pct_anual: ['Pérdida reciente', '% del bosque/año'], salida_arboles_pct: ['Salida de árboles', '% árboles 2017'], perturbacion_acumulada_pct: ['Perturbación acumulada (legado)', '% del territorio'], descenso_vigor_pct: ['Descenso fuerte de vigor', '% del territorio'] };
      return `${tabla(['Indicador', 'Subcuenca', 'CHCP', 'Razón'], Object.entries(n).map(([k, [nm, u]]) => [`${nm}<small>${u}</small>`, b.valores[k] == null ? '—' : number(b.valores[k], 2), b.valores_cuenca?.[k] == null ? '—' : number(b.valores_cuenca[k], 2), b.razon_vs_cuenca?.[k] == null ? '—' : `${number(b.razon_vs_cuenca[k], b.razon_vs_cuenca[k] < 1 ? 2 : 1)} ×`]))}<p class="hint-p small"><span class="exp-tag">experimental</span> Sin umbrales calibrados; no constituye una prioridad validada. Razón &gt; 1 = más intenso que la CHCP.</p>`; },
  };
  const SECCIONES_P = {
    preevaluacion: (R0) => { const m = R0.metricas, v = R0.visita;
      return `${R0.error_borde > 0.10 ? `<p class="rs-warn"><b>Resultado aproximado:</b> error de borde estimado ${number(R0.error_borde * 100, 0)} % (&gt; 10 %); la categoría no es concluyente.</p>` : ''}
      <div class="pe-prio" style="border-color:${PRIO[R0.prioridad] || '#90a4ae'}"><span>Puntaje MT-2026.7${R0.error_borde > 0.10 ? ' · no concluyente' : ''}</span><b>${number(R0.puntaje, 1)} <small>/ 6.5</small></b><em style="color:${PRIO[R0.prioridad]}">${esc(R0.prioridad)}</em><small>Prioridad de visita: ${esc(v.prioridad_visita)} (${number(v.puntaje_integrado, 2)} pts; corredor +${number(v.aporte_corredor, 2)}) · ${esc(R0.consistencia.nivel)}</small></div>
      ${senalesHtml(R0.senales, R0.aportes, { tmf: `Deforestado ${hectares(m.tmf_deforestacion_ha, 2)} · degradado ${hectares(m.tmf_degradacion_ha, 2)}`, hansen: `Pérdida 2021–2025: ${hectares(m.hansen_post_2020_ha, 2)}`, esri: `Árboles → otra clase: ${hectares(m.esri_salida_arboles_ha, 2)} (${pct(m.esri_salida_arboles_pct, 1)})`, gedi: R0.disponibilidad.gedi ? `Altura media ${number(m.gedi_altura_media_m, 1)} m` : 'Sin cobertura GEDI suficiente', ndvi: R0.disponibilidad.ndvi ? `Descenso fuerte ${hectares(m.ndvi_disminucion_ha, 2)}` : 'Cobertura NDVI insuficiente' })}`; },
    cambio: (R0) => { const a = R0.acc, area = R0.metricas.area_ha || 1;
      return `${tabla(['Estado JRC 2025', 'Superficie', '%'], [[1, 'Bosque sin perturbación'], [2, 'Degradado'], [3, 'Deforestado'], [4, 'Regeneración'], [5, 'Agua'], [6, 'Otra cobertura']].map(([k, n]) => [n, hectares(a.jrc[k] || 0, 2), pct((a.jrc[k] || 0) / area * 100, 1)]))}
      ${tabla(['Pérdida Hansen', 'Superficie'], [21, 22, 23, 24, 25].map((y) => [`20${y}`, hectares(a.hansen[y] || 0, 2)]))}
      <div class="pe-ms">${tarjeta('ESRI árboles → otra clase', hectares(a.esri[1] || 0, 2))}${tarjeta('ESRI otra clase → árboles', hectares(a.esri[2] || 0, 2))}${tarjeta('Cambio medio de NDVI', R0.ndvi_delta_medio == null ? '—' : `${R0.ndvi_delta_medio > 0 ? '+' : ''}${number(R0.ndvi_delta_medio, 3)}`)}${tarjeta('Señal en ≥ 2 fuentes', hectares((a.coincidencia[2] || 0) + (a.coincidencia[3] || 0), 2))}</div>`; },
    conectividad: (R0) => { const e = R0.estructura;
      return `<div class="pe-ms">${tarjeta('Parches 2021 que toca', number(e.numero_parches, 0), 'área completa de cada parche')}${tarjeta('Redes entre ellos', number(e.numero_componentes || 0, 0))}${tarjeta('Estado', esc(R0.visita.contexto_estructural.estado))}</div><p class="hint-p small">Contexto de la red de parches que intersecta el polígono; no se extrapolan métricas de la subcuenca completa.</p>`; },
    corredores: (R0) => `<div class="pe-ms">${tarjeta('Dentro de corredores', pct(R0.corredores.porcentaje_aoi_en_corredores, 1), 'Almanaque Azul')}${tarjeta('Corredor Mesoamericano', R0.corredores.intersecta_mesoamericano ? 'Sí' : 'No')}${tarjeta('Aporte a la visita', `+${number(R0.visita.aporte_corredor, 2)}`, 'máx. 1,5')}</div>`,
    eri: (R0) => `<div class="pe-ms">${tarjeta('ERI medio', R0.eri_medio == null ? '—' : `${number(R0.eri_medio * 100, 0)}/100`)}</div><p class="hint-p small">Media de los píxeles del polígono; indicativo.</p>`,
    riparia: (R0) => { const r = R0.acc.riparia; return `<div class="pe-ms">${tarjeta('Franja de 50 m con bosque', hectares(r[1] || 0, 2))}${tarjeta('Sin bosque, pendiente < 30 %', hectares(r[2] || 0, 2))}${tarjeta('Sin bosque, pendiente ≥ 30 %', hectares(r[3] || 0, 2))}</div>`; },
    sinia: (R0) => { const a = R0.acc.sinia, area = R0.metricas.area_ha || 1; return tabla(['SINIA 2021', 'Superficie', '%'], [[1, 'Bosques y otras tierras boscosas'], [2, 'Otras tierras'], [3, 'Cuerpos de agua']].map(([k, n]) => [n, hectares(a[k] || 0, 2), pct((a[k] || 0) / area * 100, 1)])); },
  };

  function renderResultados(modo, elegidos) {
    const poli = modo === 'poligono', x = t(), R0 = pg.resultado;
    if (poli && !R0) return;
    $('#pe-res-eyebrow').textContent = poli ? 'Polígono propio · estimación local' : 'Resultados precalculados';
    $('#pe-res-title').textContent = poli ? `Polígono de ${hectares(R0.area_dibujada_ha, R0.area_dibujada_ha < 10 ? 2 : 1)}` : x.nombre;
    $('#pe-res-sub').textContent = poli ? `En ${R0.subcuencas.join(', ')}` : `${hectares(x.area_ha)} · ${x.grupo}`;
    const secciones = elegidos.map((k) => `<section class="pe-sec" id="pe-sec-${k}"><h3>${icon(ANALISIS[k].i, 18)} ${esc(ANALISIS[k].t)}</h3>${poli ? SECCIONES_P[k](R0) : SECCIONES_T[k](x)}</section>`).join('');
    const avisos = poli ? `${R0.sin_datos.length ? `<p class="rs-warn">Sin mapas de valores todavía en: ${esc(R0.sin_datos.join(', '))}. Esa parte no se analizó.</p>` : ''}` : '';
    const proc = poli ? window.CHCP.procedencia(st.data, 'C', null, `<span>Malla de ${number(R0.pixel_m, 0)} m · error de borde ${number(R0.error_borde * 100, 1)} %</span>`) : window.CHCP.procedencia(st.data, 'B', x);
    $('#pe-res-b').innerHTML = `${elegidos.length > 1 ? `<nav class="pe-nav">${elegidos.map((k) => `<a href="#pe-sec-${k}">${esc(ANALISIS[k].t.replace(/ \(.*\)/, ''))}</a>`).join('')}</nav>` : ''}${avisos}${proc}${secciones}
      <div class="pe-acc">
        <button class="btn btn-s" id="pe-cambiar" type="button">${icon('filter', 16)} Cambiar análisis</button>
        ${poli ? `<button class="btn btn-p" id="pg-json" type="button">${icon('download', 16)} Descargar resultados (JSON)</button><button class="btn btn-s" id="pg-geo" type="button">${icon('map', 16)} Descargar polígono (GeoJSON)</button>`
        : `<a class="btn btn-p" href="${enlace('ficha')}?id=${encodeURIComponent(x.id)}">${icon('doc', 16)} Ficha técnica completa</a>${x.id !== 'chcp' ? `<a class="btn btn-s" href="${enlace('campo')}?id=${encodeURIComponent(x.id)}">${icon('clipboard', 16)} Sitios de campo</a>` : ''}`}
      </div>
      <p class="hint-p small">${poli ? 'Estimación local (tipo C) sobre los mapas precalculados; no es un cálculo de Earth Engine en este momento.' : 'Resultados precalculados con Google Earth Engine.'} Indicativos: orientan una revisión y no sustituyen la verificación de campo.</p>`;
    $$('#pe-res-b .pe-nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $('#pe-cambiar').addEventListener('click', () => abrirAsistente(poli ? 'poligono' : 'territorio'));
    if (poli) {
      const bajar = (nombre, texto, tipo) => { const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([texto], { type: tipo })); el.download = nombre; el.click(); URL.revokeObjectURL(el.href); };
      $('#pg-json').addEventListener('click', () => { const { acc, ...resto } = pg.resultado; bajar('analisis_poligono.json', JSON.stringify({ procesamiento: { tipo: 'C', descripcion: 'Estimación local derivada de resultados precalculados (tipo B)', base: st.data.procesamiento, error_borde_estimado: pg.resultado.error_borde, pixel_m: pg.resultado.pixel_m }, analisis: elegidos, metodologia: st.data.metodologia, datos: st.data.generado, poligono: pg.geo, ...resto, superficies_ha: { jrc: acc.jrc, hansen_por_anio: acc.hansen, esri: acc.esri, sinia_2021: acc.sinia, coincidencia: acc.coincidencia, riparia: acc.riparia } }, null, 1), 'application/json'); });
      $('#pg-geo').addEventListener('click', () => bajar('poligono.geojson', JSON.stringify({ type: 'Feature', properties: { area_ha: pg.resultado.area_dibujada_ha }, geometry: pg.geo }), 'application/geo+json'));
    }
    $('#pe-res').classList.remove('closed');
    $('#pe-reopen').hidden = true;
  }
  function territorioPreparado() {
    const x = t();
    $('#pe-res-eyebrow').textContent = 'Territorio preparado';
    $('#pe-res-title').textContent = x.nombre;
    $('#pe-res-sub').textContent = `${hectares(x.area_ha)} · ${x.grupo}`;
    $('#pe-res-b').innerHTML = `<div class="empty-result"><h3>Elija qué analizar</h3><p>Pulse <b>Realizar análisis</b> para elegir uno o varios análisis: preevaluación, cambio de cobertura, fragmentación, conectividad, corredores, ERI, franjas riparias, coberturas SINIA o intensidad relativa.</p><button class="btn btn-p" type="button" id="pe-abrir-2">Realizar análisis</button></div>`;
    $('#pe-abrir-2').addEventListener('click', () => abrirAsistente('territorio'));
    $('#pe-res').classList.remove('closed');
    $('#pe-reopen').hidden = true;
  }

  async function seleccionar(id, abrir = false) {
    st.id = st.data.territorios[id] ? id : 'chcp';
    $('#pe-terr').value = st.id;
    st.geo = null;
    if (st.id !== 'chcp') { try { st.geo = await api(`/api/v1/panel/geometry/${st.id}`); } catch (_) { st.geo = null; } }
    const f = st.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((x) => x.properties.id === st.id);
    if (f) st.map.fitBounds(L.geoJSON(f).getBounds(), { padding: [20, 20] });
    renderCapas();
    await dibujar();
    if (abrir) territorioPreparado();
  }


  // ------------------------------------------------------------ polígono propio
  const P = window.CHCP_POLIGONO, RED = window.CHCP_RED;
  const CAPAS_VALOR = ['aux', 'jrc_2025', 'hansen', 'esri_cambio', 'sinia_2021', 'coincidencia', 'riparia', 'eri', 'ndvi_cambio', 'gedi'];
  const pg = { vertices: [], dibujando: false, linea: null, capa: null, geo: null, resultado: null };
  function infoPoligono() {
    const ha = pg.geo ? P.areaHa(pg.geo) : 0;
    $('#pg-info').hidden = !pg.geo;
    $('#pg-info').innerHTML = pg.geo ? `<b>Polígono listo</b><span>${hectares(ha, ha < 10 ? 2 : 1)} · ${P.poligonos(pg.geo).length} parte(s)</span>` : '';
    $('#pg-run').disabled = !pg.geo; $('#pg-clear').disabled = !pg.geo && !pg.vertices.length;
  }
  function mostrarPoligono() {
    if (pg.capa) st.map.removeLayer(pg.capa);
    pg.capa = pg.geo ? L.geoJSON(pg.geo, { style: { color: '#ffd400', weight: 3, fillColor: '#ffd400', fillOpacity: 0.12, dashArray: '6 4' }, interactive: false }).addTo(st.map) : null;
    if (pg.capa) st.map.fitBounds(pg.capa.getBounds(), { padding: [40, 40], maxZoom: 16 });
    infoPoligono();
  }
  function dibujoVista() {
    if (pg.linea) st.map.removeLayer(pg.linea);
    pg.linea = pg.vertices.length ? L.polygon(pg.vertices, { color: '#ffd400', weight: 2, dashArray: '4 4', fillOpacity: 0.08 }).addTo(st.map) : null;
    $('#pg-n').textContent = `${pg.vertices.length} vértices`;
  }
  function terminarDibujo(guardar) {
    pg.dibujando = false; $('#pg-drawbar').hidden = true; st.map.doubleClickZoom.enable(); st.map.getContainer().style.cursor = '';
    if (guardar && pg.vertices.length >= 3) { const anillo = pg.vertices.map((v) => [v.lng, v.lat]); anillo.push(anillo[0]); pg.geo = { type: 'Polygon', coordinates: [anillo] }; }
    pg.vertices = []; dibujoVista(); mostrarPoligono();
  }
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
  function rasterizar(geo, a, w, h, color = () => '#fff') {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = false;
    (geo.type === 'FeatureCollection' ? geo.features : [geo]).forEach((f) => {
      ctx.fillStyle = color(f);
      ctx.beginPath();
      P.poligonos(f).forEach((anillos) => anillos.forEach((anillo) => anillo.forEach(([lon, lat], k) => { const [x, y] = a(lon, lat); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); })));
      ctx.fill('evenodd');
    });
    return ctx.getImageData(0, 0, w, h).data;
  }
  function cajasSeCruzan(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }
  function tocaPoligono(feature) {
    const anillosP = P.poligonos(pg.geo), anillosF = P.poligonos(feature);
    const dentro = (pt, anillos) => anillos.some((a) => RED.puntoEnPoligono(pt, { type: 'Polygon', coordinates: a }));
    const verts = (anillos) => anillos.flatMap((a) => a[0]).filter((_, i, arr) => i % Math.max(1, Math.ceil(arr.length / 150)) === 0);
    return verts(anillosF).some((p) => dentro(p, anillosP)) || verts(anillosP).some((p) => dentro(p, anillosF));
  }
  async function analizarPoligono() {
    const codec = st.data.codificacion_valores;
    const cajaP = P.caja(pg.geo);
    const subs = st.territory.subbasins.features.filter((f) => cajasSeCruzan(P.caja(f), cajaP) && tocaPoligono(f));
    const sinDatos = subs.filter((f) => !st.data.territorios[f.properties.id]?.mapas?.valores?.includes('aux'));
    if (!subs.length) { mostrarError('El polígono está fuera de la Cuenca Hidrográfica del Canal de Panamá.'); return; }
    if (!codec || sinDatos.length === subs.length) { mostrarError('Los mapas de valores para analizar polígonos se generan en la próxima actualización de datos con Earth Engine.'); return; }
    // Tolerancia de borde (auditoría D.6): error relativo esperado por rasterización ≈ perímetro × píxel / (2 × área).
    const pixel = Math.max(...subs.map((f) => st.data.territorios[f.properties.id]?.mapas?.tamano_pixel_m || 0));
    const perimetro = P.poligonos(pg.geo).flat().reduce((s, anillo) => s + anillo.slice(1).reduce((t, p, i) => { const [x1, y1] = RED.utm17(...anillo[i]); const [x2, y2] = RED.utm17(...p); return t + Math.hypot(x2 - x1, y2 - y1); }, 0), 0);
    const errorBorde = perimetro * pixel / (2 * P.areaHa(pg.geo) * 10000);
    if (errorBorde > 0.25) { mostrarError(`Polígono demasiado pequeño o irregular para la malla precalculada (píxel ${number(pixel, 0)} m; error de borde estimado ${number(errorBorde * 100, 0)} %). Para este caso se requiere el análisis directo con Earth Engine en la plataforma completa.`); return; }
    $('#pg-busy').hidden = false;
    const acc = P.nuevoAcumulador();
    const corrColor = (f) => (f.properties?.es_mesoamericano || /mesoamericano/i.test(f.properties?.nombre || '') ? 'rgb(200,0,0)' : 'rgb(100,0,0)');
    const red = { areas: new Map(), aristas: [] };
    let k = 0;
    for (const f of subs) {
      const x = st.data.territorios[f.properties.id];
      k += 1; $('#pg-paso').textContent = `Subcuenca ${k} de ${subs.length}: ${x?.nombre || f.properties.nombre}`; $('#pg-bar').style.width = `${k / subs.length * 100}%`;
      if (!x?.mapas?.valores?.includes('aux')) continue;
      const capas = {}; let w = 0, h = 0;
      for (const clave of CAPAS_VALOR.filter((c) => x.mapas.valores.includes(c))) {
        try { const b = await bytes(mapFile(x.id, `${clave}.v.png`)); capas[clave] = b.v; w = b.w; h = b.h; } catch (_) { /* capa ausente */ }
      }
      if (!capas.aux) continue;
      const a = P.transformador(x.mapas.limites, w, h);
      const mrgba = rasterizar(pg.geo, a, w, h);
      const mascara = new Uint8Array(w * h); for (let i = 0; i < mascara.length; i += 1) mascara[i] = mrgba[i * 4 + 3] > 127 ? 1 : 0;
      const crgba = rasterizar(st.territory.corridors, a, w, h, corrColor);
      const corr = new Uint8Array(w * h); for (let i = 0; i < corr.length; i += 1) { const r = crgba[i * 4]; corr[i] = crgba[i * 4 + 3] > 127 ? (r > 150 ? 2 : 1) : 0; }
      P.acumular(acc, capas, mascara, corr, (x.mapas.tamano_pixel_m ** 2) / 10000, codec);
      acc.pixeles_m.push(x.mapas.tamano_pixel_m);
      try {
        const g = await api(`/api/v1/panel/geometry/${x.id}`);
        const tocados = new Set(g.parches.features.filter(tocaPoligono).map((p) => p.properties.patch_id));
        g.parches.features.filter((p) => tocados.has(p.properties.patch_id)).forEach((p) => red.areas.set(`${x.id}:${p.properties.patch_id}`, p.properties.area_ha));
        (g.red?.aristas || []).filter(([u, v]) => tocados.has(u) && tocados.has(v)).forEach(([u, v]) => red.aristas.push([`${x.id}:${u}`, `${x.id}:${v}`]));
      } catch (_) { /* sin red de parches */ }
    }
    let estructura = null;
    if (red.areas.size) {
      const r = RED.analizar(red.areas, red.aristas, acc.area_ha || 1);
      const tam = {}; r.red.forEach((c) => { tam[c] = (tam[c] || 0) + 1; });
      estructura = { numero_parches: red.areas.size, numero_componentes: r.redes, porcentaje_nodos_componente_mayor: Math.max(...Object.values(tam)) / red.areas.size * 100, aislados: r.aislados, bosque_parches_ha: r.bosque_ha, iic: r.iic };
    } else estructura = { numero_parches: 0, numero_componentes: 0, porcentaje_nodos_componente_mayor: 0 };
    pg.resultado = { ...P.evaluar(acc, estructura), acc, estructura, error_borde: errorBorde, perimetro_m: perimetro, area_dibujada_ha: P.areaHa(pg.geo), subcuencas: subs.map((f) => f.properties.nombre), sin_datos: sinDatos.map((f) => f.properties.nombre), pixel_m: acc.pixeles_m.length ? Math.max(...acc.pixeles_m) : null };
    $('#pg-busy').hidden = true;
  }
  function mostrarError(texto) {
    $('#pe-res-eyebrow').textContent = 'Polígono'; $('#pe-res-title').textContent = 'No se pudo analizar'; $('#pe-res-sub').textContent = '';
    $('#pe-res-b').innerHTML = `<p class="fi-pending">${esc(texto)}</p>`; $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true;
  }
  function iniciarPoligono() {
    $('#pg-draw').addEventListener('click', () => { pg.dibujando = true; pg.vertices = []; $('#pg-drawbar').hidden = false; st.map.doubleClickZoom.disable(); st.map.getContainer().style.cursor = 'crosshair'; dibujoVista(); });
    st.map.on('click', (e) => { if (!pg.dibujando) return; pg.vertices.push(e.latlng); dibujoVista(); $('#pg-clear').disabled = false; });
    st.map.on('dblclick', () => { if (pg.dibujando) terminarDibujo(true); });
    $('#pg-undo').addEventListener('click', () => { pg.vertices.pop(); dibujoVista(); });
    $('#pg-end').addEventListener('click', () => terminarDibujo(true));
    $('#pg-cancel').addEventListener('click', () => terminarDibujo(false));
    $('#pg-clear').addEventListener('click', () => { pg.geo = null; pg.vertices = []; dibujoVista(); mostrarPoligono(); });
    $('#pg-run').addEventListener('click', () => abrirAsistente('poligono'));
    $('#pg-file').addEventListener('change', async (e) => {
      const archivo = e.target.files[0]; if (!archivo) return;
      const texto = await archivo.text();
      let geo = null;
      try { geo = /\.kml$/i.test(archivo.name) ? P.leerKml(texto) : JSON.parse(texto); } catch (_) { geo = null; }
      const partes = geo ? P.poligonos(geo) : [];
      if (!partes.length) { mostrarError('No se encontró ningún polígono en el archivo (use GeoJSON en WGS 84 o KML).'); return; }
      pg.geo = partes.length === 1 ? { type: 'Polygon', coordinates: partes[0] } : { type: 'MultiPolygon', coordinates: partes };
      mostrarPoligono(); e.target.value = '';
    });
  }

  // ------------------------------------------------------------ inicio
  try { [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory')]); } catch (error) { $('#pe-capas').innerHTML = `<p class="fi-pending">No se pudieron cargar los datos: ${esc(error.message)}</p>`; return; }
  st.map = L.map('smap', { zoomControl: true });
  // Orden de dibujo: mapas (350) < velo fuera de la subcuenca (380) < vectores (400).
  st.map.createPane('rasters').style.zIndex = 350;
  st.map.createPane('mascara').style.zIndex = 380;
  const ponerBase = (k) => { const b = BASES.find((x) => x[0] === k) || BASES[0]; if (st.base) st.map.removeLayer(st.base); st.base = L.tileLayer(b[2], { attribution: 'Esri', maxZoom: 18 }).addTo(st.map); st.base.bringToBack(); $$('#pe-bm button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.base === k))); };
  $('#pe-bm').innerHTML = BASES.map(([k, n, , c]) => `<button type="button" data-base="${k}"><i style="background:${c}"></i>${n}</button>`).join('');
  $$('#pe-bm button').forEach((b) => b.addEventListener('click', () => ponerBase(b.dataset.base)));
  ponerBase('gris');
  st.map.on('mousemove', (e) => { $('#coords').innerHTML = `${icon('target', 16)}<span>Lat ${e.latlng.lat.toFixed(4)} · Lon ${e.latlng.lng.toFixed(4)}</span>`; });
  const subs = Object.values(st.data.territorios).filter((x) => x && x.id !== 'chcp').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('#pe-terr').innerHTML += subs.map((x) => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('');
  $('#pe-terr').addEventListener('change', (e) => seleccionar(e.target.value, true));
  $$('.side-tabs [data-s]').forEach((b) => b.addEventListener('click', () => { $$('.side-tabs [data-s]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); ['capas', 'poligono', 'base'].forEach((k) => { $(`#s-${k}`).hidden = k !== b.dataset.s; }); }));
  $('#pe-run').addEventListener('click', () => abrirAsistente());
  $('#pe-modal-x').addEventListener('click', () => { $('#pe-modal').hidden = true; });
  $('#pe-back').addEventListener('click', () => { wiz.paso = Math.max(0, wiz.paso - 1); pintarAsistente(); });
  $('#pe-next').addEventListener('click', () => { if (wiz.paso < 2) { wiz.paso += 1; pintarAsistente(); } else ejecutarAsistente(); });
  $('#pe-res-close').addEventListener('click', () => { $('#pe-res').classList.add('closed'); $('#pe-reopen').hidden = false; });
  $('#pe-reopen').addEventListener('click', () => { $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true; });
  iniciarPoligono();
  const pedido = new URLSearchParams(location.search).get('id') || location.hash.slice(1);
  await seleccionar(pedido || 'chcp', !!pedido);
})();
