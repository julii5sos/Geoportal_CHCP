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
      { k: 'rios', nombre: 'Ríos principales', nota: 'HydroSHEDS, drenaje ≥ 10 km².', grupo: 'Territorio', disponible: !!conMapas()?.mapas?.rios, color: '#1f78b4' },
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
      st.capas.preevaluacion = L.geoJSON(st.territory.subbasins, { style: (f) => { const p = st.data.territorios[f.properties.id]?.preevaluacion; return { color: '#fff', weight: 0.8, fillColor: PRIO[p?.prioridad] || '#e5e9f0', fillOpacity: 0.55 }; }, onEachFeature: clicSubcuenca }).addTo(map);
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

  // ------------------------------------------------------------ resultados
  function resultados() {
    const x = t(), p = x.preevaluacion, e = x.estructura_2021, s21 = (x.sinia || []).find((s) => s.year === 2021);
    const enlace = (ruta) => (window.CHCP_STATIC ? `${ruta}.html` : `/${ruta}`);
    $('#pe-res-title').textContent = x.nombre;
    $('#pe-res-sub').textContent = `${hectares(x.area_ha)} · ${x.grupo}`;
    const tarjeta = (n, v, s = '') => `<div class="pe-m"><span>${n}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
    $('#pe-res-b').innerHTML = `
      <div class="pe-prio" style="border-color:${PRIO[p.prioridad] || '#90a4ae'}"><span>Preevaluación MT-2026.7</span><b>${number(p.puntaje, 1)} <small>/ ${number(p.puntaje_maximo, 1)}</small></b><em style="color:${PRIO[p.prioridad]}">${esc(p.prioridad)}</em><small>Prioridad de visita: ${esc(p.prioridad_visita || '—')} · fuentes con deterioro: ${esc((p.fuentes_deterioro || []).join(', ') || 'ninguna')}</small></div>
      <div class="pe-ms">
        ${tarjeta('Bosque SINIA 2021', pct(s21?.forest_pct), s21 ? hectares(s21.forest_ha, 0) : '')}
        ${tarjeta('Bosque estable JRC', hectares(x.jrc_ha.tmf_estable, 0), pct(x.jrc_ha.tmf_estable / x.area_ha * 100))}
        ${tarjeta('Deforestado + degradado', hectares((x.jrc_ha.tmf_deforestacion || 0) + (x.jrc_ha.tmf_degradacion || 0), 0), 'JRC 2025')}
        ${tarjeta('Pérdida Hansen 2021+', hectares(x.hansen_post_2020_ha, 1))}
        ${tarjeta('NDVI 2020→2025', `${number(x.ndvi?.ndvi_inicial_medio, 2)} → ${number(x.ndvi?.ndvi_final_medio, 2)}`)}
        ${tarjeta('ERI', x.eri?.valor == null ? '—' : `${number(x.eri.valor * 100, 0)}/100`, esc(x.eri?.clase || 'próxima actualización'))}
        ${e ? tarjeta('Parches 2021', number(e.metricas_clase.numero_parches, 0), `${number(e.metricas_red.numero_componentes, 0)} red(es) separada(s)`) : ''}
        ${tarjeta('En corredores', pct(x.corredores?.porcentaje, 1), x.corredores?.intersecta_mesoamericano ? 'incluye Mesoamericano' : '')}
      </div>
      <div class="pe-acc">
        <a class="btn btn-p" href="${enlace('ficha')}?id=${encodeURIComponent(x.id)}">${icon('doc', 16)} Ficha técnica completa</a>
        ${x.id !== 'chcp' ? `<a class="btn btn-s" href="${enlace('restauracion')}?id=${encodeURIComponent(x.id)}">${icon('sprout', 16)} Simular restauración</a><a class="btn btn-s" href="${enlace('campo')}?id=${encodeURIComponent(x.id)}">${icon('clipboard', 16)} Sitios de campo</a>` : ''}
        <a class="btn btn-s" href="${window.CHCP_STATIC ? 'panel.html' : '/panel'}${x.id === 'chcp' ? '' : `#${x.id}`}">${icon('chart', 16)} Ver en el panel</a>
      </div>
      ${window.CHCP.procedencia(st.data, 'B', x)}
      <p class="hint-p small">Resultados precalculados con Google Earth Engine (${esc(String(st.data.generado || '').slice(0, 10))}). Indicativos: orientan una revisión y no sustituyen la verificación de campo.</p>`;
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
    if (abrir) resultados();
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
    mostrarResultadoPoligono();
  }
  function mostrarError(texto) {
    $('#pe-res-eyebrow').textContent = 'Polígono'; $('#pe-res-title').textContent = 'No se pudo analizar'; $('#pe-res-sub').textContent = '';
    $('#pe-res-b').innerHTML = `<p class="fi-pending">${esc(texto)}</p>`; $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true;
  }
  function mostrarResultadoPoligono() {
    const R0 = pg.resultado, m = R0.metricas, a = R0.acc, v = R0.visita;
    const nombres = { tmf: 'JRC TMF', hansen: 'Hansen GFC', esri: 'ESRI LULC', gedi: 'GEDI', ndvi: 'NDVI Sentinel-2' };
    const bosque = a.sinia[1] || 0, fuera = Math.max(0, R0.area_dibujada_ha - m.area_ha);
    const sig = (k, txt) => `<li class="${R0.senales[k] ? 'on' : ''}"><b>${R0.senales[k] ? '✓' : '·'} ${nombres[k]}</b> <span>+${R0.senales[k] ? number(R0.aportes[k], 1) : '0'}</span><small>${txt}</small></li>`;
    $('#pe-res-eyebrow').textContent = 'Polígono propio · resultados precalculados';
    $('#pe-res-title').textContent = `Polígono de ${hectares(R0.area_dibujada_ha, R0.area_dibujada_ha < 10 ? 2 : 1)}`;
    $('#pe-res-sub').textContent = `En ${R0.subcuencas.join(', ')}`;
    const tarjeta = (n, val, s2 = '') => `<div class="pe-m"><span>${n}</span><b>${val}</b>${s2 ? `<small>${s2}</small>` : ''}</div>`;
    $('#pe-res-b').innerHTML = `
      ${R0.sin_datos.length ? `<p class="rs-warn">Sin mapas de valores todavía en: ${esc(R0.sin_datos.join(', '))}. Esa parte no se analizó.</p>` : ''}${fuera > 0.01 * R0.area_dibujada_ha ? `<p class="rs-warn">Se analizaron ${hectares(m.area_ha, 1)}; ${hectares(fuera, 1)} del polígono quedan fuera de la CHCP${R0.sin_datos.length ? ' o en subcuencas sin datos' : ''}.</p>` : ''}
      ${window.CHCP.procedencia(st.data, 'C', null, `<span>Malla de ${number(R0.pixel_m, 0)} m · error de borde estimado ${number(R0.error_borde * 100, 1)} %</span>`)}
      ${R0.error_borde > 0.10 ? `<p class="rs-warn"><b>Resultado aproximado:</b> el error de borde estimado (${number(R0.error_borde * 100, 0)} %) supera la tolerancia del 10 %. Las superficies son orientativas y la categoría no es concluyente; confirme con el análisis directo de Earth Engine.</p>` : ''}
      <div class="pe-prio" style="border-color:${PRIO[R0.prioridad] || '#90a4ae'}"><span>Preevaluación MT-2026.7 del polígono${R0.error_borde > 0.10 ? ' · no concluyente' : ''}</span><b>${number(R0.puntaje, 1)} <small>/ 6.5</small></b><em style="color:${PRIO[R0.prioridad]}">${esc(R0.prioridad)}</em><small>Prioridad de visita: <b>${esc(v.prioridad_visita)}</b> (${number(v.puntaje_integrado, 2)} pts; corredor +${number(v.aporte_corredor, 2)}) · ${esc(v.combinacion_territorial)} · ${esc(R0.consistencia.nivel)}</small></div>
      <h3 class="pe-h">Señales satelitales</h3>
      <ul class="pe-sig">
        ${sig('tmf', `Deforestado ${hectares(m.tmf_deforestacion_ha, 2)} · degradado ${hectares(m.tmf_degradacion_ha, 2)}`)}
        ${sig('hansen', `Pérdida desde 2021: ${hectares(m.hansen_post_2020_ha, 2)}`)}
        ${sig('esri', `Árboles → otra clase: ${hectares(m.esri_salida_arboles_ha, 2)} (${pct(m.esri_salida_arboles_pct, 1)})`)}
        ${sig('gedi', R0.disponibilidad.gedi ? `Altura media del dosel ${number(m.gedi_altura_media_m, 1)} m` : 'Sin cobertura GEDI suficiente')}
        ${sig('ndvi', R0.disponibilidad.ndvi ? `Descenso fuerte en ${hectares(m.ndvi_disminucion_ha, 2)} (${pct(m.ndvi_disminucion_pct, 1)})` : 'Cobertura NDVI insuficiente')}
      </ul>
      <div class="pe-ms">
        ${tarjeta('Bosque SINIA 2021', hectares(bosque, 2), pct(m.area_ha ? bosque / m.area_ha * 100 : 0))}
        ${tarjeta('Bosque estable JRC', hectares(a.jrc[1] || 0, 2), 'sin perturbación')}
        ${tarjeta('Señal en ≥ 2 fuentes', hectares((a.coincidencia[2] || 0) + (a.coincidencia[3] || 0), 2), 'mapa de coincidencias')}
        ${tarjeta('En corredores', pct(R0.corredores.porcentaje_aoi_en_corredores, 1), R0.corredores.intersecta_mesoamericano ? 'incluye Mesoamericano' : 'Almanaque Azul')}
        ${tarjeta('NDVI medio 2020→2025', R0.ndvi_delta_medio == null ? '—' : `${R0.ndvi_delta_medio > 0 ? '+' : ''}${number(R0.ndvi_delta_medio, 3)}`)}
        ${tarjeta('ERI medio', R0.eri_medio == null ? '—' : `${number(R0.eri_medio * 100, 0)}/100`)}
        ${tarjeta('Parches 2021 que toca (área completa)', number(R0.estructura.numero_parches, 0), R0.estructura.numero_parches ? `${number(R0.estructura.numero_componentes, 0)} red(es) · ${esc(v.contexto_estructural.estado)}` : 'sin bosque oficial 2021')}
        ${tarjeta('Franja riparia sin bosque', hectares((a.riparia[2] || 0) + (a.riparia[3] || 0), 2), `${hectares(a.riparia[3] || 0, 2)} en pendiente ≥ 30 %`)}
      </div>
      <div class="pe-acc"><button class="btn btn-p" id="pg-json" type="button">${icon('download', 16)} Descargar resultados (JSON)</button><button class="btn btn-s" id="pg-geo" type="button">${icon('map', 16)} Descargar polígono (GeoJSON)</button></div>
      <p class="hint-p small">Estimación local (tipo C): no es un cálculo de Earth Engine en este momento. Usa los mapas precalculados de ${esc(String(st.data.generado || '').slice(0, 10))} (píxel de hasta ${number(R0.pixel_m, 0)} m). Mismas reglas y umbrales que la plataforma con Earth Engine; en polígonos menores de ~${number((R0.pixel_m || 30) ** 2 * 20 / 10000, 1)} ha las superficies son aproximadas. Resultado indicativo: orienta una revisión y no sustituye la verificación de campo.</p>`;
    $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true;
    const bajar = (nombre, texto, tipo) => { const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([texto], { type: tipo })); el.download = nombre; el.click(); URL.revokeObjectURL(el.href); };
    $('#pg-json').addEventListener('click', () => { const { acc, ...resto } = pg.resultado; bajar('analisis_poligono.json', JSON.stringify({ procesamiento: { tipo: 'C', descripcion: 'Estimación local derivada de resultados precalculados (tipo B)', base: st.data.procesamiento, error_borde_estimado: pg.resultado.error_borde, pixel_m: pg.resultado.pixel_m }, metodologia: st.data.metodologia, datos: st.data.generado, poligono: pg.geo, ...resto, superficies_ha: { jrc: acc.jrc, hansen_por_anio: acc.hansen, esri: acc.esri, sinia_2021: acc.sinia, coincidencia: acc.coincidencia, riparia: acc.riparia } }, null, 1), 'application/json'); });
    $('#pg-geo').addEventListener('click', () => bajar('poligono.geojson', JSON.stringify({ type: 'Feature', properties: { area_ha: pg.resultado.area_dibujada_ha }, geometry: pg.geo }), 'application/geo+json'));
  }
  function iniciarPoligono() {
    $('#pg-draw').addEventListener('click', () => { pg.dibujando = true; pg.vertices = []; $('#pg-drawbar').hidden = false; st.map.doubleClickZoom.disable(); st.map.getContainer().style.cursor = 'crosshair'; dibujoVista(); });
    st.map.on('click', (e) => { if (!pg.dibujando) return; pg.vertices.push(e.latlng); dibujoVista(); $('#pg-clear').disabled = false; });
    st.map.on('dblclick', () => { if (pg.dibujando) terminarDibujo(true); });
    $('#pg-undo').addEventListener('click', () => { pg.vertices.pop(); dibujoVista(); });
    $('#pg-end').addEventListener('click', () => terminarDibujo(true));
    $('#pg-cancel').addEventListener('click', () => terminarDibujo(false));
    $('#pg-clear').addEventListener('click', () => { pg.geo = null; pg.vertices = []; dibujoVista(); mostrarPoligono(); });
    $('#pg-run').addEventListener('click', () => analizarPoligono().catch((err) => { $('#pg-busy').hidden = true; mostrarError(`Error al analizar: ${err.message}`); }));
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
  $('#pe-run').addEventListener('click', resultados);
  $('#pe-res-close').addEventListener('click', () => { $('#pe-res').classList.add('closed'); $('#pe-reopen').hidden = false; });
  $('#pe-reopen').addEventListener('click', () => { $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true; });
  iniciarPoligono();
  const pedido = new URLSearchParams(location.search).get('id') || location.hash.slice(1);
  await seleccionar(pedido || 'chcp', !!pedido);
})();
