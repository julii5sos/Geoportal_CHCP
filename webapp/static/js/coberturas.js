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
    discrepante_con_servicio: ['Discrepancia', 'bad'],
    documentada_informe_oficial: ['Solo en el informe', 'doc'],  // detalle en el title: documentada en el informe oficial, sin verificar en la cuenca
  };
  const st = { catalog: null, territory: null, a: '2021_general', b: '2019_general', compare: false, view: 'original', active: {}, stats: null, layers: {} };

  const map = L.map('cob-map', { zoomControl: true, preferCanvas: true });
  { const raiz = document.getElementById('v-coberturas'), inval = () => map.invalidateSize();
    window.CHCP.divisor({ panel: document.querySelector('.cob-side'), ancla: raiz, borde: 'derecho', clave: 'cob-side', min: 280, max: 640,
      aplicar: (w) => (w ? raiz.style.setProperty('--cob-side-w', `${w}px`) : raiz.style.removeProperty('--cob-side-w')), alCambiar: inval });
    window.CHCP.divisor({ panel: document.querySelector('.cob-results'), ancla: raiz, borde: 'izquierdo', clave: 'cob-res', min: 320, max: 900,
      aplicar: (w) => (w ? raiz.style.setProperty('--cob-res-w', `${w}px`) : raiz.style.removeProperty('--cob-res-w')), alCambiar: inval }); }
  map.createPane('paneA').style.zIndex = 410;
  map.createPane('paneB').style.zIndex = 420;
  map.createPane('paneRef').style.zIndex = 450;
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  window.CHCP.mapaBase(map, { defecto: 'gris' });
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
    const pending = rows.filter((r) => ['leyenda_oficial_sin_correspondencia', 'no_identificado', 'grupo_documentado_catalogo_previo', 'discrepante_con_servicio', 'documentada_informe_oficial'].includes(r.estado)).length;
    const own = rows.some((r) => r.fuente_color === 'propuesta_geoportal');
    $('#cob-legend-note').innerHTML = `${pending ? `${pending} código(s) sin categoría individual verificada: se muestran como «Código N» y no se presentan como oficiales. ` : ''}${own ? 'Los colores marcados como propuesta son una paleta propia del Geoportal, no simbología de MiAMBIENTE.' : 'Colores de la simbología oficial de MiAMBIENTE.'}`;
    $$('#cob-legend input[data-code]').forEach((input) => input.addEventListener('change', () => {
      const code = Number(input.dataset.code);
      input.checked ? st.active[key].add(code) : st.active[key].delete(code);
      scheduleTiles();
    }));
  }
  // Para qué sirve cada producto, en palabras simples (el catálogo guarda la versión técnica).
  const USO = {
    '1992_historico': 'Mapa histórico. Sirve de contexto para ver cómo era el bosque en 1992.',
    '2000_historico': 'Mapa histórico. Sirve de contexto para ver cómo era el bosque en 2000.',
    '2012_binario': 'Solo distingue bosque de no bosque.',
    '2012_detallado': 'Separa bosques naturales, plantaciones, rastrojos, cultivos, pastos y zonas construidas.',
    '2019_general': 'Mapa general con pocas categorías. Sirve para comparar superficies.',
    '2021_general': 'Es el mapa oficial de bosque que usa el geoportal para medir la fragmentación y la conectividad.',
    '2021_detallado': 'Separa bosques, plantaciones, vegetación, cultivos, pastos, agua y zonas construidas en 2021.',
    '2023_general': 'Mapa general más reciente. El geoportal lo compara con el de 2021 en la ficha de cada subcuenca.',
  };
  function renderProductInfo() {
    const p = product(st.a);
    const mask = st.catalog.forest_masks[st.a];
    const nombres = (codes) => codes.map((c) => legendOf(st.a).find((r) => r.codigo === c)?.categoria || `Código ${c}`);
    const opcionales = mask.opcionales ? mask.codes_with_optional.filter((c) => !mask.codes.includes(c)) : [];
    const crs = p.crs === 'EPSG:32617' ? 'UTM zona 17 Norte (EPSG:32617)' : p.crs;
    const filas = [
      ['Para qué sirve', USO[st.a] || p.uso_analitico],
      ['Formato', p.tipo === 'TABLE' ? 'Mapa de polígonos (vectorial)' : `Imagen de píxeles de ${number(p.resolucion_m, 0)} m (ráster)`],
      p.escala_cartografica ? ['Escala', p.escala_cartografica] : null,
      ['Coordenadas', crs],
      p.nodata != null ? ['Sin dato', `los píxeles con valor ${p.nodata} no tienen información`] : null,
      ['Cuenta como bosque', `${nombres(mask.codes).join(', ')}${opcionales.length ? `. Si un análisis lo indica, también: ${nombres(opcionales).join(', ')}` : ''}.`],
    ].filter(Boolean);
    $('#cob-product-info').innerHTML = filas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  }


  // ------------------------------------------------------------- mapas precalculados (sitio estático)
  // data/coberturas: un PNG de códigos por territorio y producto (255 = sin dato), coloreado
  // aquí con la leyenda; filtrar categorías o ver grupos derivados no requiere recalcular.
  const territorioId = () => { const n = $('#cob-area').value; return n ? st.territory.subbasins.features.find((f) => f.properties.nombre === n)?.properties.id : 'chcp'; };
  const cobFile = (ruta) => `datos/coberturas/${ruta}`;
  const cacheCodigos = new Map();
  function codigosPng(url) {
    if (!cacheCodigos.has(url)) {
      cacheCodigos.set(url, new Promise((ok, mal) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data, v = new Uint8Array(c.width * c.height);
          for (let i = 0; i < v.length; i += 1) v[i] = d[i * 4];
          ok({ v, w: c.width, h: c.height });
        };
        im.onerror = () => { cacheCodigos.delete(url); mal(new Error('No se pudo leer el mapa precalculado.')); };
        im.src = url;
      }));
    }
    return cacheCodigos.get(url);
  }
  const hexRgb = (h) => { const n = parseInt(String(h || '#9e9e9e').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  /** Mapa del territorio elegido si existe; si no, el de la cuenca completa. */
  function fuenteMapa(key) {
    const t = st.cobIndice?.territorios || {}, id = territorioId();
    if (t[id]?.mapas?.[key]) return { id, meta: t[id].mapas[key] };
    if (t.chcp?.mapas?.[key]) return { id: 'chcp', meta: t.chcp.mapas[key] };
    return null;
  }
  async function capaEstatica(slot, key, codes) {
    const fuente = fuenteMapa(key);
    if (!fuente) return null;
    const { v, w, h } = await codigosPng(cobFile(`mapas/${fuente.id}/${key}.v.png`));
    const activos = new Set(codes), groups = st.catalog.groups;
    const color = new Map(legendOf(key).map((r) => [r.codigo, hexRgb(st.view === 'derivado' ? groups[r.grupo_derivado].color : r.color)]));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    for (let i = 0; i < v.length; i += 1) {
      const k = v[i];
      if (k === 255 || !activos.has(k)) continue;
      const col = color.get(k) || [158, 158, 158];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { capa: L.imageOverlay(c.toDataURL(), fuente.meta.limites, { pane: slot === 'a' ? 'paneA' : 'paneB', opacity: 0.85, className: 'cob-raster', attribution: 'SINIA–MiAMBIENTE · precalculado con Google Earth Engine' }), fuente };
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
      if (window.CHCP_STATIC) {
        const r = await capaEstatica(slot, key, codes);
        if (!r) { if (tag) tag.textContent += ' · mapa pendiente de precálculo'; return; }
        if (st.layers[slot]) map.removeLayer(st.layers[slot]);
        st.layers[slot] = r.capa.addTo(map);
        if (tag && !tag.dataset.res) { tag.dataset.res = '1'; tag.insertAdjacentHTML('beforeend', ` <small>· celdas de ${number(r.fuente.meta.tamano_pixel_m, 0)} m${r.fuente.id === 'chcp' && territorioId() !== 'chcp' ? ' (mapa de la cuenca)' : ''}</small>`); }
        updateSwipe();
        return;
      }
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
    if (window.CHCP_STATIC && !st.cobIndice) {
      $('#cob-tags').innerHTML = `<span class="cob-tag">${esc(productLabel(st.a))} · los mapas de este producto aún no se han precalculado</span>`;
      $('#cob-swipe').hidden = true;
      return;
    }
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
  const STATIC_PRODUCTS = { 2019: '2019_general', 2021: '2021_general', 2023: '2023_general' };
  /** Superficies precalculadas de data/coberturas (los ocho productos), con la leyenda vigente. */
  async function superficiesPrecalculadas(products) {
    const id = territorioId();
    if (!st.cobIndice?.territorios?.[id]?.superficies?.length) return null;
    const datos = await (await fetch(cobFile(`estadisticas/${id}.json`))).json();
    if (!products.every((k) => datos[k])) return null;
    const result = products.map((key) => {
      const p = datos[key], legend = new Map(legendOf(key).map((r) => [r.codigo, r]));
      const classes = p.classes.map((c) => { const r = legend.get(c.code) || {}; return { ...c, label: r.categoria || c.label, color: r.color || c.color, status: r.estado || c.status, group: r.grupo_derivado || c.group }; });
      const groups = {};
      classes.forEach((c) => { groups[c.group] = (groups[c.group] || 0) + c.area_ha; });
      return { ...p, classes, limitations: product(key).limitaciones || p.limitations || [],
        derived_groups: Object.entries(groups).filter(([, ha]) => ha > 0).sort((a, b) => b[1] - a[1]).map(([g, ha]) => ({ group: g, label: st.catalog.groups[g].nombre, color: st.catalog.groups[g].color, area_ha: ha, percentage: ha / (p.classified_ha || 1) * 100 })) };
    });
    const comparability = products.length === 2 ? st.catalog.comparability.find((c) => (c.a === products[0] && c.b === products[1]) || (c.a === products[1] && c.b === products[0])) : null;
    const name = $('#cob-area').value;
    return { area: { label: name || 'Cuenca Hidrográfica del Canal de Panamá' }, result: { products: result, comparability }, warnings: [] };
  }
  function staticStats(products) {
    const name = $('#cob-area').value;
    const record = Object.values(st.panel?.territorios || {}).find((t) => (name ? t.nombre === name : t.id === 'chcp'));
    if (!record) throw new Error('No hay indicadores precalculados para este territorio.');
    const result = products.map((key) => {
      const item = (record.sinia || []).find((p) => STATIC_PRODUCTS[p.year] === key);
      if (!item) throw new Error(`La superficie de ${productLabel(key)} para este territorio aún no se ha precalculado.`);
      const legend = legendOf(key);
      const classes = item.classes.map((c) => { const row = legend.find((r) => r.codigo === c.code) || {}; return { ...c, color: row.color || c.color, status: row.estado, group: row.grupo_derivado }; });
      const groups = {};
      classes.forEach((c) => { groups[c.group] = (groups[c.group] || 0) + c.area_ha; });
      return { product: key, name: product(key).nombre, year: product(key).anio, asset: '', aoi_area_ha: record.area_ha, classified_ha: item.classified_ha,
        unclassified_or_nodata_ha: item.unclassified_or_nodata_ha, scale_m: product(key).resolucion_m || 10, classes, codes_without_legend: [],
        derived_groups: Object.entries(groups).filter(([, ha]) => ha > 0).sort((a, b) => b[1] - a[1]).map(([g, ha]) => ({ group: g, label: st.catalog.groups[g].nombre, color: st.catalog.groups[g].color, area_ha: ha, percentage: ha / (item.classified_ha || 1) * 100 })),
        limitations: product(key).limitaciones || [] };
    });
    const comparability = products.length === 2 ? st.catalog.comparability.find((c) => (c.a === products[0] && c.b === products[1]) || (c.a === products[1] && c.b === products[0])) : null;
    return { area: { label: record.nombre }, result: { products: result, comparability }, warnings: [] };
  }
  async function computeStats() {
    if (window.CHCP_STATIC) {
      const products = st.compare ? [st.a, st.b] : [st.a];
      try {
        const pre = await superficiesPrecalculadas(products).catch(() => null);
        renderStats(pre || staticStats(products));
      } catch (error) { $('#cob-results-body').innerHTML = `<div class="cob-loading error">${esc(error.message)}</div>`; }
      return;
    }
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
    if (window.CHCP_STATIC) {
      st.panel = await api('/api/v1/panel/statistics');
      st.cobIndice = await fetch(cobFile('indice.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
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
  $('#cob-area').addEventListener('change', () => { drawArea(); if (window.CHCP_STATIC) loadTiles(); history.replaceState(null, '', $('#cob-area').value ? `#${encodeURIComponent($('#cob-area').value)}` : location.pathname); });
  $('#cob-stats').addEventListener('click', computeStats);
  $('#cob-csv').addEventListener('click', exportCsv);

  if (window.CHCP_STATIC) {
    $('#cob-stats').textContent = 'Ver superficies';
    $('#cob-results-sub').innerHTML = st.cobIndice
      ? `Mapas y superficies de los ocho productos, precalculados con Earth Engine el ${esc(String(st.cobIndice.generado || '').slice(0, 10))} para la cuenca y cada subcuenca. Las superficies se calculan a la escala original de cada producto.`
      : 'Versión publicada sin Earth Engine: superficies precalculadas de 2019, 2021 y 2023 por subcuenca. Los mapas de los ocho productos se añadirán al ejecutar «Coberturas SINIA (mapas y superficies)».';
  }
  basinLayer = L.geoJSON(st.territory.basin, { pane: 'paneRef', style: { color: '#0a4393', weight: 1, dashArray: '4 4', fill: false }, interactive: false }).addTo(map);
  renderLegend(); renderProductInfo(); drawArea(); loadTiles();
  window.CHCP_COBERTURAS = { renderStats, map };
})();
