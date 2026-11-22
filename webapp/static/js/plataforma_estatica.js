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
      st.capas[c.k] = L.imageOverlay(mapFile(fuente.id, `${c.capa.clave}.png`), fuente.mapas.limites, { opacity: st.opacidad, interactive: false }).addTo(map);
    }
    if (st.activas.has('preevaluacion')) {
      st.capas.preevaluacion = L.geoJSON(st.territory.subbasins, { style: (f) => { const p = st.data.territorios[f.properties.id]?.preevaluacion; return { color: '#fff', weight: 0.8, fillColor: PRIO[p?.prioridad] || '#e5e9f0', fillOpacity: 0.55 }; }, onEachFeature: clicSubcuenca }).addTo(map);
    }
    if (st.activas.has('subcuencas')) {
      st.capas.subcuencas = L.geoJSON(st.territory.subbasins, { style: (f) => ({ color: f.properties.id === st.id ? '#ffd54f' : '#0a4393', weight: f.properties.id === st.id ? 3 : 1, fill: !st.activas.has('preevaluacion'), fillOpacity: 0 }), onEachFeature: clicSubcuenca }).addTo(map);
    }
    if (st.activas.has('corredores')) st.capas.corredores = L.geoJSON(st.territory.corridors, { style: (f) => { const c = COLOR_CORREDOR[f.properties.categoria_etiqueta] || '#7fae00'; return { color: c, weight: 1.4, fillColor: c, fillOpacity: 0.15 }; }, onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties.nombre)} · conectividad ${esc(f.properties.categoria_etiqueta)}`) }).addTo(map);
    if (st.activas.has('rios') && fuente.mapas?.rios) {
      try { st.rios = await (await fetch(mapFile(fuente.id, 'rios.json'))).json(); st.capas.rios = L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 2 }, interactive: false }).addTo(map); } catch (_) { /* sin ríos */ }
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
    leyenda(orden);
  }
  function clicSubcuenca(f, l) {
    const x = st.data.territorios[f.properties.id];
    l.bindTooltip(`${esc(f.properties.nombre)}${x ? ` · ${number(x.preevaluacion.puntaje, 1)} pts (${esc(x.preevaluacion.prioridad)})` : ''}`, { sticky: true });
    l.on('click', () => seleccionar(f.properties.id, true));
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

  // ------------------------------------------------------------ inicio
  try { [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory')]); } catch (error) { $('#pe-capas').innerHTML = `<p class="fi-pending">No se pudieron cargar los datos: ${esc(error.message)}</p>`; return; }
  st.map = L.map('smap', { zoomControl: true });
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
  const pedido = new URLSearchParams(location.search).get('id') || location.hash.slice(1);
  await seleccionar(pedido || 'chcp', !!pedido);
})();
