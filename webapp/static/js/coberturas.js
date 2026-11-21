/* Coberturas oficiales de Panamá · SINIA/MiAMBIENTE.
   Leyendas desde /api/v1/sinia/catalog (data/leyendas_sinia.json): mapa, leyenda,
   gráficos y CSV usan exactamente los mismos códigos, nombres y colores. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, toast } = window.CHCP;
  if (!window.L) return;

  const STATUS = {
    verificada_espacialmente: ['Verificada', 'ok'],
    verificada_valor_atributo: ['Verificada (atributo)', 'ok'],
    documentada_catalogo_previo: ['Documentada', 'doc'],
    grupo_documentado_catalogo_previo: ['Solo grupo documentado', 'warn'],
    leyenda_oficial_sin_correspondencia: ['Sin verificar', 'warn'],
    no_identificado: ['No identificado', 'bad'],
  };
  const st = { catalog: null, territory: null, a: '2021_general', b: '2019_general', compare: false, view: 'original', active: {}, stats: null, layers: {} };

  const map = L.map('cob-map', { zoomControl: true, preferCanvas: true });
  map.createPane('paneA').style.zIndex = 410;
  map.createPane('paneB').style.zIndex = 420;
  map.createPane('paneRef').style.zIndex = 450;
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri Light Gray Canvas', maxZoom: 16 }).addTo(map);
  map.setView([9.15, -79.75], 9);
  let basinLayer = null, areaLayer = null;

  const legendOf = (key) => st.catalog.legends[key];
  const product = (key) => st.catalog.catalog[key];
  const productLabel = (key) => `${product(key).anio} · ${product(key).nombre}`;
  const areaRequest = () => ($('#cob-area').value ? { mode: 'subbasin', subbasin: $('#cob-area').value } : { mode: 'basin' });

  // ------------------------------------------------------------- leyenda
  function statusBadge(row) {
    const [label, tone] = STATUS[row.estado] || [row.estado, 'warn'];
    return `<span class="cob-badge ${tone}" title="${esc(st.catalog.states[row.estado] || '')}">${esc(label)}</span>`;
  }
  function renderLegend() {
    const key = st.a;
    const rows = legendOf(key);
    st.active[key] = st.active[key] || new Set(rows.map((r) => r.codigo));
    const groups = st.catalog.groups;
    $('#cob-legend').innerHTML = rows.map((r) => {
      const color = st.view === 'derivado' ? groups[r.grupo_derivado].color : r.color;
      return `<li><label class="cob-cat"><input type="checkbox" data-code="${r.codigo}" ${st.active[key].has(r.codigo) ? 'checked' : ''}><i style="background:${color}"></i><span class="cob-code">${r.codigo}</span><span class="cob-name">${esc(r.categoria)}</span>${statusBadge(r)}</label>
        <details><summary>Detalle</summary><p>${esc(r.descripcion || 'Sin descripción documentada.')}</p><p><b>Grupo derivado:</b> ${esc(groups[r.grupo_derivado].nombre)}</p><p><b>Color:</b> ${esc(r.color)} · ${r.fuente_color === 'propuesta_geoportal' ? 'paleta propia del Geoportal (no oficial)' : esc(r.fuente_color)}</p><p><b>Correspondencia:</b> ${esc(r.fuente_correspondencia || '—')}</p>${r.candidato_leyenda_oficial && r.estado !== 'verificada_espacialmente' ? `<p><b>Candidato en la leyenda oficial (sin verificar):</b> ${esc(r.candidato_leyenda_oficial)}</p>` : ''}</details></li>`;
    }).join('');
    const pending = rows.filter((r) => ['leyenda_oficial_sin_correspondencia', 'no_identificado', 'grupo_documentado_catalogo_previo'].includes(r.estado)).length;
    const own = rows.some((r) => r.fuente_color === 'propuesta_geoportal');
    $('#cob-legend-note').innerHTML = `${pending ? `${pending} código(s) sin categoría individual verificada: se muestran como «Código N» y no se presentan como oficiales. ` : ''}${own ? 'Los colores marcados como propuesta son una paleta propia del Geoportal, no simbología de MiAMBIENTE.' : 'Colores de la simbología oficial de MiAMBIENTE.'}`;
    $$('#cob-legend input[data-code]').forEach((input) => input.addEventListener('change', () => {
      const code = Number(input.dataset.code);
      input.checked ? st.active[key].add(code) : st.active[key].delete(code);
      scheduleTiles();
    }));
  }
  function renderProductInfo() {
    const p = product(st.a);
    const mask = st.catalog.forest_masks[st.a];
    $('#cob-product-info').innerHTML = `<b>${esc(p.tipo === 'TABLE' ? 'Vector' : `Ráster ${p.resolucion_m} m`)}</b>${p.escala_cartografica ? ` · escala ${esc(p.escala_cartografica)}` : ''} · ${esc(p.crs)} · NoData ${p.nodata ?? 'no aplica'}<br>${esc(p.uso_analitico)}<br><span class="cob-mask">Máscara forestal para fragmentación: códigos ${mask.codes.join(', ')}${mask.opcionales ? ` (opcionales: ${mask.codes_with_optional.filter((c) => !mask.codes.includes(c)).join(', ')})` : ''}.</span>`;
  }

  // ------------------------------------------------------------- teselas
  let tileTimer = null;
  function scheduleTiles() { clearTimeout(tileTimer); tileTimer = setTimeout(loadTiles, 350); }
  async function loadTile(slot, key, codes) {
    if (st.layers[slot]) { map.removeLayer(st.layers[slot]); st.layers[slot] = null; }
    if (!codes.length) return;
    const tag = $(`#cob-tag-${slot}`);
    if (tag) tag.classList.add('loading');
    try {
      const response = await api('/api/v1/sinia/tiles', { method: 'POST', body: JSON.stringify({ product: key, codes, view: st.view }) });
      st.layers[slot] = L.tileLayer(response.tile_url, { pane: slot === 'a' ? 'paneA' : 'paneB', opacity: 0.85, attribution: 'SINIA–MiAMBIENTE · Google Earth Engine' }).addTo(map);
      updateSwipe();
    } catch (error) {
      toast(`No se pudo cargar ${productLabel(key)}: ${error.message}`, 'error');
    } finally {
      if (tag) tag.classList.remove('loading');
    }
  }
  function loadTiles() {
    $('#cob-tags').innerHTML = `<span id="cob-tag-a" class="cob-tag">${st.compare ? '◧ ' : ''}${esc(productLabel(st.a))}</span>${st.compare ? `<span id="cob-tag-b" class="cob-tag right">${esc(productLabel(st.b))} ◨</span>` : ''}`;
    loadTile('a', st.a, [...st.active[st.a]]);
    if (st.compare) {
      st.active[st.b] = st.active[st.b] || new Set(legendOf(st.b).map((r) => r.codigo));
      loadTile('b', st.b, [...st.active[st.b]]);
    } else if (st.layers.b) { map.removeLayer(st.layers.b); st.layers.b = null; }
    $('#cob-swipe').hidden = !st.compare;
    updateSwipe();
  }

  // ------------------------------------------------------------- comparador
  function updateSwipe() {
    const pane = map.getPane('paneB');
    if (!st.compare) { pane.style.clip = ''; pane.style.clipPath = ''; return; }
    const ratio = Number($('#cob-swipe-range').value) / 100;
    const size = map.getSize();
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(size);
    const x = map.containerPointToLayerPoint([size.x * ratio, 0]).x;
    pane.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${x}px)`;
    $('#cob-swipe-line').style.left = `${ratio * 100}%`;
  }
  $('#cob-swipe-range').addEventListener('input', updateSwipe);
  map.on('move zoom resize', updateSwipe);

  // ------------------------------------------------------------- estadísticas
  function bars(rows) {
    const max = Math.max(1e-9, ...rows.map((r) => r.area_ha));
    return `<div class="cob-bars">${rows.filter((r) => r.area_ha > 0).map((r) => `<div class="cob-bar"><span title="${esc(r.label)}">${esc(r.label)}</span><div><i style="width:${Math.max(0.8, r.area_ha / max * 100)}%;background:${r.color}"></i></div><b>${number(r.percentage, 1)} %</b></div>`).join('')}</div>`;
  }
  function productStats(p) {
    const useGroups = st.view === 'derivado';
    const rows = useGroups ? p.derived_groups.map((g) => ({ label: g.label, color: g.color, area_ha: g.area_ha, percentage: g.percentage }))
      : p.classes.map((c) => ({ label: `${c.code} · ${c.label}`, color: c.color, area_ha: c.area_ha, percentage: c.percentage, status: c.status }));
    const table = `<table class="cob-table"><thead><tr><th>${useGroups ? 'Grupo derivado' : 'Código · categoría'}</th><th>ha</th><th>%</th></tr></thead><tbody>${rows.filter((r) => r.area_ha > 0).map((r) => `<tr><td><i style="background:${r.color}"></i>${esc(r.label)}${r.status && !['verificada_espacialmente', 'verificada_valor_atributo', 'documentada_catalogo_previo'].includes(r.status) ? ' <small class="cob-unv">sin verificar</small>' : ''}</td><td>${number(r.area_ha, 1)}</td><td>${number(r.percentage, 1)}</td></tr>`).join('')}</tbody></table>`;
    const extra = p.codes_without_legend.length ? `<p class="cob-note">Valores sin leyenda en el área: ${p.codes_without_legend.map((c) => `${c.code}${c.is_documented_nodata ? ' (NoData documentado)' : ''} · ${hectares(c.area_ha)}`).join('; ')}.</p>` : '';
    return `<section class="cob-card"><h3>${esc(p.year)} · ${esc(p.name)}</h3><p class="cob-meta">Clasificado: <b>${hectares(p.classified_ha)}</b> de ${hectares(p.aoi_area_ha)} · sin dato ${hectares(p.unclassified_or_nodata_ha)} · escala de cálculo ${number(p.scale_m, 1)} m</p>${bars(rows)}${table}${extra}<ul class="cob-limits">${p.limitations.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`;
  }
  function differences(pa, pb) {
    const ga = Object.fromEntries(pa.derived_groups.map((g) => [g.group, g]));
    const gb = Object.fromEntries(pb.derived_groups.map((g) => [g.group, g]));
    const keys = [...new Set([...Object.keys(ga), ...Object.keys(gb)])];
    return `<section class="cob-card"><h3>Diferencias descriptivas por grupo derivado</h3><table class="cob-table"><thead><tr><th>Grupo</th><th>${pa.year}</th><th>${pb.year}</th><th>Diferencia</th></tr></thead><tbody>${keys.map((k) => { const a = ga[k]?.percentage || 0, b = gb[k]?.percentage || 0; return `<tr><td>${esc((ga[k] || gb[k]).label)}</td><td>${number(a, 1)} %</td><td>${number(b, 1)} %</td><td>${b - a >= 0 ? '+' : ''}${number(b - a, 1)} pp</td></tr>`; }).join('')}</tbody></table><p class="cob-note">Las diferencias describen dos productos distintos; no se interpretan como pérdida, ganancia ni transición.</p></section>`;
  }
  function renderStats(response) {
    st.stats = response;
    const { products, comparability } = response.result;
    $('#cob-results-title').textContent = products.length === 2 ? 'Comparación entre productos' : 'Superficie por categoría';
    $('#cob-results-sub').textContent = `${response.area.label} · ${st.view === 'derivado' ? 'grupos ecológicos derivados' : 'categorías originales'}`;
    let html = '';
    if (comparability) {
      html += `<section class="cob-card cob-verdict"><h3>Comparabilidad: solo visual y estadísticas independientes</h3><ul>${comparability.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul><p class="cob-note">Para calcular transiciones se exige correspondencia temática verificable, escalas compatibles, alineación, área válida común, fechas comparables e incertidumbre. Ver docs/COMPARABILIDAD_COBERTURAS.md.</p></section>`;
    }
    html += products.map(productStats).join('');
    if (products.length === 2) html += differences(products[0], products[1]);
    $('#cob-results-body').innerHTML = html;
    $('#cob-csv').disabled = false;
  }
  async function computeStats() {
    const products = st.compare ? [st.a, st.b] : [st.a];
    $('#cob-stats').disabled = true;
    $('#cob-results-body').innerHTML = `<div class="cob-loading">Calculando en Earth Engine la superficie de ${products.map(productLabel).map(esc).join(' y ')}…</div>`;
    try {
      renderStats(await api('/api/v1/sinia/statistics', { method: 'POST', body: JSON.stringify({ area: areaRequest(), products }) }));
    } catch (error) {
      $('#cob-results-body').innerHTML = `<div class="cob-loading error">No se pudo calcular: ${esc(error.message)}</div>`;
    } finally { $('#cob-stats').disabled = false; }
  }
  function exportCsv() {
    if (!st.stats) return;
    const lines = [['territorio', 'anio', 'producto', 'asset', 'codigo', 'categoria', 'estado_verificacion', 'grupo_derivado', 'color', 'fuente_color', 'area_ha', 'porcentaje_area_clasificada'].join(',')];
    const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    st.stats.result.products.forEach((p) => p.classes.forEach((c) => lines.push([q(st.stats.area.label), p.year, q(p.name), q(p.asset), c.code, q(c.label), c.status, c.group, c.color, q(c.color_source), c.area_ha, c.percentage].join(','))));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `sinia_${st.stats.area.label.replace(/\W+/g, '_')}.csv` });
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // ------------------------------------------------------------- territorio
  function drawArea() {
    if (areaLayer) map.removeLayer(areaLayer);
    const name = $('#cob-area').value;
    const feature = name ? st.territory.subbasins.features.find((f) => f.properties.nombre === name) : st.territory.basin;
    areaLayer = L.geoJSON(feature, { pane: 'paneRef', style: { color: '#0a4393', weight: 2.5, fill: false } }).addTo(map);
    map.fitBounds(areaLayer.getBounds(), { padding: [20, 20], animate: false });
    st.stats = null; $('#cob-csv').disabled = true;
  }

  // ------------------------------------------------------------- arranque
  try {
    [st.catalog, st.territory] = await Promise.all([api('/api/v1/sinia/catalog'), api('/api/v1/territory')]);
  } catch (error) {
    $('#cob-results-body').innerHTML = `<div class="cob-loading error">No se pudo cargar el catálogo: ${esc(error.message)}</div>`;
    return;
  }
  const options = Object.keys(st.catalog.catalog).map((k) => `<option value="${k}">${esc(productLabel(k))}</option>`).join('');
  $('#cob-product').innerHTML = options; $('#cob-product').value = st.a;
  $('#cob-product-b').innerHTML = options; $('#cob-product-b').value = st.b;
  const names = st.territory.subbasins.features.map((f) => f.properties.nombre).sort((x, y) => x.localeCompare(y, 'es'));
  $('#cob-area').insertAdjacentHTML('beforeend', names.map((n) => `<option>${esc(n)}</option>`).join(''));
  const fromHash = decodeURIComponent((location.hash || '').slice(1));
  if (names.includes(fromHash)) $('#cob-area').value = fromHash;

  $('#cob-product').addEventListener('change', (e) => { st.a = e.target.value; renderLegend(); renderProductInfo(); loadTiles(); });
  $('#cob-product-b').addEventListener('change', (e) => { st.b = e.target.value; loadTiles(); });
  $('#cob-compare-on').addEventListener('change', (e) => { st.compare = e.target.checked; $('#cob-product-b').hidden = !st.compare; loadTiles(); });
  $$('input[name="cob-view"]').forEach((r) => r.addEventListener('change', () => { st.view = r.value; renderLegend(); loadTiles(); if (st.stats) renderStats(st.stats); }));
  $('#cob-all').addEventListener('click', () => { st.active[st.a] = new Set(legendOf(st.a).map((r) => r.codigo)); renderLegend(); scheduleTiles(); });
  $('#cob-none').addEventListener('click', () => { st.active[st.a] = new Set(); renderLegend(); scheduleTiles(); });
  $('#cob-area').addEventListener('change', () => { drawArea(); history.replaceState(null, '', $('#cob-area').value ? `#${encodeURIComponent($('#cob-area').value)}` : location.pathname); });
  $('#cob-stats').addEventListener('click', computeStats);
  $('#cob-csv').addEventListener('click', exportCsv);

  basinLayer = L.geoJSON(st.territory.basin, { pane: 'paneRef', style: { color: '#0a4393', weight: 1, dashArray: '4 4', fill: false }, interactive: false }).addTo(map);
  renderLegend(); renderProductInfo(); drawArea(); loadTiles();
  window.CHCP_COBERTURAS = { renderStats, map };
})();
