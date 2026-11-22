/* Panel de monitoreo: indicadores precalculados de la CHCP y sus 53 subcuencas.
   Lee /api/v1/panel/statistics (generado por scripts/precalcular_panel.py) y no
   llama a Earth Engine al navegar. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api } = window.CHCP;
  const icon = window.CHCP_ICON || (() => '');
  if (!window.L) return;

  const PRIORITY_COLORS = { Alta: '#c8321e', Media: '#f28e2b', Preventiva: '#3a7ca5', Baja: '#2e7d32' };
  const VISIT_ORDER = ['Muy alta', 'Alta', 'Media', 'Preventiva', 'Baja'];
  const SEQ = {
    green: ['#edf8e9', '#bae4b3', '#74c476', '#31a354', '#006d2c'],
    red: ['#fee5d9', '#fcae91', '#fb6a4a', '#de2d26', '#a50f15'],
    purple: ['#f2f0f7', '#cbc9e2', '#9e9ac8', '#756bb1', '#54278f'],
    blue: ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'],
  };
  const st = { data: null, territory: null, sel: 'chcp', tab: 'resumen' };

  // ---------------------------------------------------------------- utilidades
  const pct = (value, digits = 1) => `${number(value || 0, digits)} %`;
  const subs = () => Object.values(st.data?.territorios || {}).filter((t) => t && t.id !== 'chcp');
  const current = () => st.data?.territorios?.[st.sel];
  function wg(id, title, body, explanation = '') {
    return `<section class="wg"><div class="wg-h"><h3>${title}</h3>${explanation ? `<button type="button" class="wg-i" data-exp="${id}" aria-label="Qué muestra">${icon('info', 18)}</button>` : ''}</div>${explanation ? `<div class="wg-exp" id="exp-${id}" hidden>${explanation}</div>` : ''}${body}</section>`;
  }
  function donut(rows, centerTop, centerBottom = '', size = 150) {
    const total = rows.reduce((acc, row) => acc + (row.value || 0), 0) || 1;
    const r = 46, c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = rows.filter((row) => row.value > 0).map((row) => {
      const len = row.value / total * c;
      const arc = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${row.color}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"><title>${esc(row.label)}: ${hectares(row.value)}</title></circle>`;
      offset += len; return arc;
    }).join('');
    return `<svg class="mon-donut" width="${size}" height="${size}" viewBox="0 0 120 120" role="img">${arcs}<text x="60" y="58" text-anchor="middle" class="d1">${esc(centerTop)}</text><text x="60" y="72" text-anchor="middle" class="d2">${esc(centerBottom)}</text></svg>`;
  }
  function kv(rows, total) {
    const sum = total || rows.reduce((acc, row) => acc + (row.value || 0), 0) || 1;
    return `<div class="kv">${rows.map((row) => `<div><span><i style="background:${row.color}"></i>${esc(row.label)}</span><b>${pct(row.value / sum * 100)}</b><small>${hectares(row.value)}</small></div>`).join('')}</div>`;
  }
  function bars(rows, formatter = (v) => number(v, 1)) {
    const max = Math.max(1e-9, ...rows.map((row) => Math.abs(row.value || 0)));
    return `<div class="mon-bars">${rows.map((row) => `<div class="mb-row ${row.me ? 'me' : ''}"><span>${esc(row.label)}</span><div class="mb-track"><i style="width:${Math.max(1, Math.abs(row.value || 0) / max * 100)}%;background:${row.color}"></i></div><b>${formatter(row.value)}</b></div>`).join('')}</div>`;
  }
  function line(series, keys) {
    const W = 520, H = 190, L0 = 46, R0 = 14, T0 = 10, B0 = 24;
    const vals = series.flatMap((row) => keys.map((k) => row[k.key]).filter((v) => v != null));
    const max = Math.max(1, ...vals);
    const raw = max / 4, pow = 10 ** Math.floor(Math.log10(raw)), step = Math.ceil(raw / pow) * pow, top = step * 4;
    const x = (i) => L0 + i * (W - L0 - R0) / Math.max(1, series.length - 1);
    const y = (v) => T0 + (1 - v / top) * (H - T0 - B0);
    const grid = [0, 1, 2, 3, 4].map((k) => `<line x1="${L0}" x2="${W - R0}" y1="${y(k * step)}" y2="${y(k * step)}" class="g"/><text x="${L0 - 6}" y="${y(k * step) + 3}" text-anchor="end">${number(k * step, step < 1 ? 1 : 0)}</text>`).join('');
    const xl = series.map((row, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${row.anio}</text>`).join('');
    const ls = keys.map((k) => {
      const pts = series.map((row, i) => (row[k.key] == null ? null : [x(i), y(row[k.key]), row])).filter(Boolean);
      return `<polyline fill="none" stroke="${k.color}" stroke-width="2.2" points="${pts.map((p) => `${p[0]},${p[1]}`).join(' ')}"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${k.color}"><title>${esc(k.label)} ${p[2].anio}: ${hectares(p[2][k.key])}</title></circle>`).join('')}`;
    }).join('');
    return `<svg class="mon-line" viewBox="0 0 ${W} ${H}" role="img">${grid}${xl}${ls}</svg><ul class="mon-keys">${keys.map((k) => `<li><i style="background:${k.color}"></i>${esc(k.label)}</li>`).join('')}</ul>`;
  }
  function ranking(u, value, format, label, desc = true) {
    const list = subs().filter((t) => value(t) != null).sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b)));
    const ix = list.findIndex((t) => t.id === u.id);
    const lo = ix >= 0 ? Math.max(0, Math.min(ix - 2, list.length - 5)) : 0;
    const rows = list.slice(lo, lo + 5).map((t, i) => `<li class="${t.id === u.id ? 'me' : ''}"><span class="pos">${lo + i + 1}</span><button type="button" data-go="${t.id}">${esc(t.nombre)}</button><b>${format(value(t))}</b></li>`).join('');
    const phrase = ix >= 0 ? `<p class="s"><b>${esc(u.nombre)}</b> ocupa el puesto <b>${ix + 1} de ${list.length}</b> subcuencas por ${label}.</p>` : `<p class="s">Subcuencas con ${desc ? 'mayor' : 'menor'} ${label}.</p>`;
    return `${phrase}<ol class="rank">${rows}</ol>`;
  }
  function delta(value, suffix = '') {
    if (value == null || Math.abs(value) < 0.05) return '<span class="delta">sin cambio</span>';
    return `<span class="delta ${value < 0 ? 'dn' : 'up'}">${value < 0 ? '▼' : '▲'} ${number(Math.abs(value), 1)}${suffix}</span>`;
  }
  const sinia = (u, year) => (u.sinia || []).find((p) => p.year === year);
  const jrcRows = (u) => [
    { label: 'Bosque estable', value: u.jrc_ha.tmf_estable, color: '#1d6b35' },
    { label: 'Degradación', value: u.jrc_ha.tmf_degradacion, color: '#f28e2b' },
    { label: 'Deforestación', value: u.jrc_ha.tmf_deforestacion, color: '#fabc20' },
    { label: 'Regeneración', value: u.jrc_ha.tmf_recuperacion, color: '#a6d96a' },
    { label: 'Agua', value: u.jrc_ha.tmf_agua, color: '#5aa9e6' },
    { label: 'Otra cobertura', value: u.jrc_ha.tmf_otra_cobertura, color: '#d7c2a1' },
  ];
  const isolatedPct = (t) => {
    const c = t.estructura_2021?.metricas_clase, r = t.estructura_2021?.metricas_red;
    if (!c || !r || !c.numero_parches) return null;
    return r.numero_parches_aislados / c.numero_parches * 100;
  };

  // ---------------------------------------------------------------- mapa
  const map = L.map('mon-map', { zoomControl: true, preferCanvas: true });
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri Light Gray Canvas', maxZoom: 16 }).addTo(map);
  map.setView([9.15, -79.75], 9);
  let subLayer = null, basinLayer = null, corridorLayer = null;

  const THEMES = {
    resumen: { name: 'Puntaje de preevaluación (0–6.5)', value: (t) => t.preevaluacion?.puntaje, palette: SEQ.red, breaks: [1, 2, 3, 4.5], fmt: (v) => number(v, 1) },
    prioridades: { name: 'Puntaje de preevaluación (0–6.5)', value: (t) => t.preevaluacion?.puntaje, palette: SEQ.red, breaks: [1, 2, 3, 4.5], fmt: (v) => number(v, 1) },
    sinia: { name: 'Bosques y otras tierras boscosas · SINIA 2021 (%)', value: (t) => sinia(t, 2021)?.forest_pct, palette: SEQ.green, breaks: [40, 55, 70, 85], fmt: (v) => pct(v, 0) },
    cambio: { name: 'Deforestación + degradación JRC 2025 (% del área)', value: (t) => (t.area_ha ? ((t.jrc_ha.tmf_deforestacion || 0) + (t.jrc_ha.tmf_degradacion || 0)) / t.area_ha * 100 : null), palette: SEQ.red, breaks: [5, 10, 20, 30], fmt: (v) => pct(v, 0) },
    conectividad: { name: 'Densidad de borde del bosque 2021 (m/ha) · mayor = más fragmentado', value: (t) => t.estructura_2021?.metricas_clase?.densidad_borde_m_ha, palette: SEQ.purple, breaks: [35, 50, 75, 90], fmt: (v) => number(v, 0) },
    corredores: { name: 'Área dentro de corredores (%)', value: (t) => t.corredores?.porcentaje, palette: SEQ.blue, breaks: [5, 15, 30, 60], fmt: (v) => pct(v, 0) },
  };
  function colorFor(theme, value) {
    if (value == null || Number.isNaN(value)) return '#e5e9f0';
    const i = theme.breaks.findIndex((b) => value < b);
    return theme.palette[i === -1 ? theme.breaks.length : i];
  }
  function styleMap() {
    if (!subLayer) return;
    const theme = THEMES[st.tab];
    subLayer.setStyle((feature) => {
      const t = st.data?.territorios?.[feature.properties.id];
      const selected = feature.properties.id === st.sel;
      return { color: selected ? '#0a4393' : '#ffffff', weight: selected ? 3 : 1, fillOpacity: t ? 0.82 : 0.25, fillColor: t ? colorFor(theme, theme.value(t)) : '#e5e9f0' };
    });
    const labels = [`< ${theme.fmt(theme.breaks[0])}`, ...theme.breaks.slice(0, -1).map((b, i) => `${theme.fmt(b)} – ${theme.fmt(theme.breaks[i + 1])}`), `≥ ${theme.fmt(theme.breaks[theme.breaks.length - 1])}`];
    $('#mon-legend').innerHTML = `<b>${esc(theme.name)}</b>${labels.map((label, i) => `<div><i style="background:${theme.palette[i]}"></i>${esc(label)}</div>`).join('')}<div><i style="background:#e5e9f0"></i>Sin dato</div><label class="mon-legend-toggle"><input type="checkbox" id="mon-corridors" ${corridorLayer && map.hasLayer(corridorLayer) ? 'checked' : ''}> Corredores publicados</label>`;
    $('#mon-corridors').addEventListener('change', (event) => { if (!corridorLayer) return; event.target.checked ? corridorLayer.addTo(map) : map.removeLayer(corridorLayer); });
    if (subLayer && st.sel !== 'chcp') subLayer.eachLayer((layer) => { if (layer.feature.properties.id === st.sel) layer.bringToFront(); });
  }
  function fit() {
    if (!subLayer) return;
    if (st.sel === 'chcp') { map.fitBounds((basinLayer || subLayer).getBounds(), { padding: [20, 20] }); return; }
    subLayer.eachLayer((layer) => { if (layer.feature.properties.id === st.sel) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 13 }); });
  }

  // ---------------------------------------------------------------- vistas
  function lead(u) {
    const p = u.preevaluacion;
    const s21 = sinia(u, 2021);
    const forest = s21 ? `<b>${pct(s21.forest_pct, 0)}</b> de bosques y otras tierras boscosas según SINIA 2021` : 'cobertura SINIA no disponible';
    return `${esc(u.nombre)} (${hectares(u.area_ha)}) tiene ${forest}. Su preevaluación MT-2026.7 suma <b>${number(p.puntaje, 1)} de ${number(p.puntaje_maximo, 1)} puntos</b> (prioridad <b>${esc(p.prioridad)}</b>), con <b>${hectares(u.jrc_ha.tmf_deforestacion)}</b> de deforestación JRC y <b>${hectares(u.hansen_post_2020_ha)}</b> de pérdida Hansen posterior a 2020.`;
  }
  function viewResumen(u) {
    const p = u.preevaluacion;
    const tone = PRIORITY_COLORS[p.prioridad] || '#0a4393';
    const signals = Object.entries(p.senales || {}).map(([k, on]) => `<span class="chip ${on ? 'on' : ''}">${{ tmf: 'JRC TMF', hansen: 'Hansen', esri: 'ESRI', gedi: 'GEDI', ndvi: 'NDVI' }[k] || k}${on ? ` · +${number(p.aportes?.[k] || 0, 1)}` : ''}</span>`).join('');
    const scoreBar = `<div class="score"><div class="score-track"><i style="width:${p.puntaje / p.puntaje_maximo * 100}%;background:${tone}"></i></div><div class="score-scale"><span>0</span><span>1.5 Media</span><span>3 Alta</span><span>6.5</span></div></div>`;
    let html = wg('prio', 'Prioridad territorial', `<div class="cards2"><div class="mc" style="border-left:5px solid ${tone}"><span>Índice de indicios</span><b>${number(p.puntaje, 1)} / ${number(p.puntaje_maximo, 1)}</b><small style="color:${tone};font-weight:700">${esc(p.prioridad)}</small></div><div class="mc"><span>Prioridad de visita</span><b>${esc(p.prioridad_visita || '—')}</b><small>${esc(p.combinacion_territorial || '')}</small></div></div>${scoreBar}<div class="chips">${signals}</div><p class="note">Consistencia de fuentes: <b>${esc(p.consistencia || '—')}</b>. Preevaluación indicativa; no predice deforestación ni certifica cumplimiento.</p>`,
      'Índice MT-2026.7: JRC 2.0 + Hansen 2.0 + ESRI 1.5 + GEDI 0.5 + NDVI 0.5 (máximo 6.5). La prioridad de visita añade hasta 1.5 puntos por valor estratégico del corredor.');
    const rows = jrcRows(u);
    html += wg('jrc', 'Dinámica del bosque · JRC TMF 2025', `<div class="wg-row">${kv(rows)}${donut(rows, hectares(u.area_ha), 'área analizada')}</div>`,
      'Clases excluyentes del producto JRC Tropical Moist Forest para 2025. Suman el 100 % del área con dato.');
    const prods = (u.sinia || []).map((s) => `<div class="mc"><span>SINIA ${s.year}</span><b>${pct(s.forest_pct)}</b><small>${hectares(s.forest_ha)}</small></div>`).join('');
    html += wg('sinia-res', 'Bosques y otras tierras boscosas · SINIA', `<div class="cards3">${prods}</div><p class="note">Productos institucionales independientes; las diferencias entre años no son una medición de pérdida o ganancia.</p>`);
    return html;
  }
  function viewSinia(u) {
    const products = u.sinia || [];
    if (!products.length) return wg('sinia-none', 'Cobertura SINIA', '<p class="s">Sin datos SINIA para este territorio.</p>');
    let html = wg('sinia-cmp', 'Bosques y otras tierras boscosas por producto', bars(products.map((p) => ({ label: `SINIA ${p.year}`, value: p.forest_pct, color: '#237A4B' })), (v) => pct(v)) + '<p class="note">Cada año proviene de un producto con método y escala propios (2019: 19.8 m; 2021: vector institucional; 2023: 10 m). Se muestran lado a lado como referencia, no como serie de cambio.</p>');
    products.forEach((p) => {
      const rows = p.classes.map((c) => ({ label: c.label, value: c.area_ha, color: c.color }));
      const nodata = p.unclassified_or_nodata_ha > 0.5 ? `<p class="note">Sin clasificar o sin dato: ${hectares(p.unclassified_or_nodata_ha)}.</p>` : '';
      html += wg(`sinia-${p.year}`, esc(p.name), `<div class="wg-row">${kv(rows, p.classified_ha)}${donut(rows, hectares(p.classified_ha), 'clasificadas')}</div>${nodata}`);
    });
    return html;
  }
  function viewCambio(u) {
    const series = u.serie_anual || [];
    let html = wg('serie', 'Evolución anual 2020–2025 (ha)', series.length ? line(series, [
      { key: 'jrc_degradacion_ha', label: 'Degradación JRC', color: '#f28e2b' },
      { key: 'jrc_regeneracion_ha', label: 'Regeneración JRC', color: '#3d8b37' },
      { key: 'jrc_deforestacion_ha', label: 'Deforestación JRC', color: '#2f7ee0' },
    ]) : '<p class="s">Sin serie anual.</p>', 'Superficie en cada clase JRC TMF al cierre de cada año. Son estados acumulados, no eventos nuevos de ese año.');
    const hansen = series.filter((r) => r.hansen_perdida_ha != null);
    html += wg('hansen', 'Pérdida de cobertura arbórea · Hansen GFC', `${bars(hansen.map((r) => ({ label: String(r.anio), value: r.hansen_perdida_ha, color: '#d0442c' })), (v) => hectares(v))}<p class="s">Total posterior al 31/12/2020: <b>${hectares(u.hansen_post_2020_ha)}</b>.</p>`, 'Pérdida ocurrida en cada año según Hansen Global Forest Change v1.13.');
    const e = u.esri || {}, n = u.ndvi || {};
    html += wg('esri', 'Transiciones ESRI 2017–2024 y vigor NDVI', `<div class="cards2"><div class="mc"><span>Árboles → otra clase</span><b style="color:#c8321e">${hectares(e.esri_salida)}</b></div><div class="mc"><span>Otra clase → árboles</span><b style="color:#2e7d32">${hectares(e.esri_ganancia)}</b></div><div class="mc"><span>NDVI medio 2020 → 2025</span><b>${number(n.ndvi_inicial_medio, 2)} → ${number(n.ndvi_final_medio, 2)}</b><small>${delta(n.ndvi_delta_medio == null ? null : n.ndvi_delta_medio * 100, ' ×10⁻²')}</small></div><div class="mc"><span>Disminución NDVI ≥ 0.15</span><b>${hectares(n.ndvi_disminucion)}</b></div></div>`);
    html += wg('rank-cambio', 'Comparación entre subcuencas', ranking(u, THEMES.cambio.value, (v) => pct(v), 'deforestación + degradación JRC'));
    return html;
  }
  function viewPrioridades(u) {
    const counts = {};
    subs().forEach((t) => { const k = t.preevaluacion?.prioridad_visita || '—'; counts[k] = (counts[k] || 0) + 1; });
    const colors = { 'Muy alta': '#8b1e1e', Alta: '#c8321e', Media: '#f28e2b', Preventiva: '#3a7ca5', Baja: '#2e7d32' };
    let html = wg('rank-prio', 'Ranking por puntaje de preevaluación', ranking(u, (t) => t.preevaluacion?.puntaje, (v) => `${number(v, 1)} pts`, 'puntaje de preevaluación'), 'Ordena las subcuencas por el índice de indicios MT-2026.7. Empates conservan el orden alfabético.');
    html += wg('dist-prio', 'Subcuencas por prioridad de visita', bars(VISIT_ORDER.filter((k) => counts[k]).map((k) => ({ label: k, value: counts[k], color: colors[k], me: k === u.preevaluacion?.prioridad_visita })), (v) => `${number(v, 0)}`));
    const top = subs().slice().sort((a, b) => (b.preevaluacion?.puntaje_visita || 0) - (a.preevaluacion?.puntaje_visita || 0)).slice(0, 8);
    html += wg('top-visita', 'Subcuencas para organizar visita primero', `<ol class="rank">${top.map((t, i) => `<li class="${t.id === u.id ? 'me' : ''}"><span class="pos">${i + 1}</span><button type="button" data-go="${t.id}">${esc(t.nombre)}</button><b>${esc(t.preevaluacion?.prioridad_visita || '—')} · ${number(t.preevaluacion?.puntaje_visita || 0, 1)}</b></li>`).join('')}</ol><p class="note">Puntaje integrado de visita (máximo 8.0). Un corredor sin señales de cambio nunca genera prioridad alta por sí solo.</p>`);
    if (u.preevaluacion?.lectura_integrada) html += wg('lectura', 'Lectura integrada', `<p class="s">${esc(u.preevaluacion.lectura_integrada)}</p>`);
    return html;
  }
  function viewConectividadCuenca(u) {
    const rows = subs().filter((t) => t.estructura_2021);
    const sum = (f) => rows.reduce((acc, t) => acc + (f(t) || 0), 0);
    const c = (t) => t.estructura_2021.metricas_clase, r = (t) => t.estructura_2021.metricas_red;
    const bosque = sum((t) => c(t).area_total_bosque_ha), paisaje = sum((t) => t.area_ha);
    const parches = sum((t) => c(t).numero_parches), aislados = sum((t) => r(t).numero_parches_aislados);
    const componentes = sum((t) => r(t).numero_componentes), aristas = sum((t) => r(t).numero_aristas);
    const borde = sum((t) => (c(t).densidad_borde_m_ha || 0) * (t.area_ha || 0)) / (paisaje || 1);
    const conectadas = rows.filter((t) => r(t).numero_componentes === 1).length;
    let html = wg('conn-cuenca', 'Fragmentación y conectividad · resumen de las 53 subcuencas', `<div class="cards3"><div class="mc"><span>Bosque oficial 2021</span><b>${hectares(bosque)}</b><small>${pct(bosque / (paisaje || 1) * 100)} de las subcuencas</small></div><div class="mc"><span>Parches</span><b>${number(parches, 0)}</b><small>${number(parches / (paisaje || 1) * 100, 2)} / 100 ha</small></div><div class="mc"><span>Densidad de borde</span><b>${number(borde, 1)}</b><small>m/ha (ponderada por área)</small></div><div class="mc"><span>Componentes de red</span><b>${number(componentes, 0)}</b><small>${number(aristas, 0)} conexiones</small></div><div class="mc"><span>Parches aislados</span><b>${number(aislados, 0)}</b><small>${pct(aislados / (parches || 1) * 100)} a ${number(st.data.umbral_conectividad_m, 0)} m</small></div><div class="mc"><span>Subcuencas en una sola red</span><b>${conectadas} de ${rows.length}</b><small>todo su bosque conectado</small></div></div><p class="note">Suma de los resultados de cada subcuenca. Un parche que cruza el límite entre dos subcuencas se cuenta en ambas, por lo que los totales son aproximados. A ${number(st.data.umbral_conectividad_m, 0)} m casi no hay parches aislados: la diferencia entre subcuencas está en cuánto se fragmenta el bosque (borde, número y tamaño de parches).</p>`,
      'Conectividad estructural potencial: parches de «Bosques y Otras Tierras Boscosas» (SINIA 2021) unidos cuando la distancia entre bordes es menor que el umbral. No demuestra movimiento de fauna.');
    const top = (value, fmt, label, desc = true) => {
      const list = rows.slice().sort((a, b) => (desc ? value(b) - value(a) : value(a) - value(b))).slice(0, 8);
      return `<ol class="rank">${list.map((t, i) => `<li><span class="pos">${i + 1}</span><button type="button" data-go="${t.id}">${esc(t.nombre)}</button><b>${fmt(value(t))}</b></li>`).join('')}</ol><p class="note">${label}</p>`;
    };
    html += wg('top-borde', 'Subcuencas con bosque más fragmentado', top((t) => c(t).densidad_borde_m_ha || 0, (v) => `${number(v, 0)} m/ha`, 'Mayor densidad de borde: más perímetro de bosque por hectárea, señal de fragmentación.'));
    html += wg('top-lpi', 'Subcuencas con menor parche dominante', top((t) => c(t).indice_parche_mayor_pct || 0, (v) => pct(v), 'Índice de parche mayor: porcentaje del paisaje que ocupa el parche de bosque más grande. Valores bajos indican bosque repartido en piezas.', false));
    html += wg('top-comp', 'Subcuencas con la red más dividida', top((t) => r(t).numero_componentes || 0, (v) => `${number(v, 0)} componentes`, 'Número de redes separadas de parches al umbral elegido.'));
    return html;
  }
  function viewConectividad(u) {
    if (u.id === 'chcp') return viewConectividadCuenca(u);
    const s = u.estructura_2021;
    if (!s) return wg('conn-none', 'Conectividad estructural 2021', '<p class="s">No se precalculó la estructura para este territorio.</p>');
    const c = s.metricas_clase, r = s.metricas_red;
    let html = wg('frag', 'Fragmentación · bosque oficial 2021', `<div class="cards3"><div class="mc"><span>Bosque</span><b>${hectares(c.area_total_bosque_ha)}</b><small>${pct(c.porcentaje_paisaje_bosque)} del paisaje</small></div><div class="mc"><span>Parches</span><b>${number(c.numero_parches, 0)}</b><small>${number(c.densidad_parches_por_100ha, 2)} / 100 ha</small></div><div class="mc"><span>Parche mayor</span><b>${pct(c.indice_parche_mayor_pct)}</b><small>del paisaje</small></div><div class="mc"><span>Densidad de borde</span><b>${number(c.densidad_borde_m_ha, 1)}</b><small>m/ha</small></div><div class="mc"><span>Tamaño medio</span><b>${hectares(c.area_media_parche_ha)}</b><small>mediana ${hectares(c.area_mediana_parche_ha)}</small></div><div class="mc"><span>Forma media</span><b>${number(c.indice_forma_medio, 2)}</b></div></div>`, 'Cobertura vectorial SINIA 2021 (Bosques y Otras Tierras Boscosas) disuelta en parches ecológicos antes de medir.');
    html += wg('red', `Red estructural · umbral ${number(r.umbral_m || st.data.umbral_conectividad_m, 0)} m`, `<div class="cards3"><div class="mc"><span>Componentes</span><b>${number(r.numero_componentes, 0)}</b><small>${pct(r.porcentaje_nodos_componente_mayor)} en el mayor</small></div><div class="mc"><span>Conexiones</span><b>${number(r.numero_aristas, 0)}</b><small>media ${number(r.distancia_media_conexiones_m, 0)} m</small></div><div class="mc"><span>Aislados</span><b>${number(r.numero_parches_aislados, 0)}</b><small>${pct(isolatedPct(u))}</small></div></div>${bars([{ label: 'En red', value: (c.numero_parches || 0) - (r.numero_parches_aislados || 0), color: '#225ea8' }, { label: 'Aislados', value: r.numero_parches_aislados || 0, color: '#d0442c' }], (v) => `${number(v, 0)} parches`)}<p class="note">Conectividad estructural potencial por distancia entre bordes; no demuestra movimiento de fauna. ${s.conecta_corredor ? `Existe una cadena estructural hacia ${esc(s.corredor_nombre || 'un corredor publicado')}.` : ''}</p>`);
    html += wg('rank-conn', 'Comparación entre subcuencas', ranking(u, (t) => t.estructura_2021?.metricas_clase?.densidad_borde_m_ha, (v) => `${number(v, 0)} m/ha`, 'densidad de borde (fragmentación)'));
    return html;
  }
  function viewCorredores(u) {
    const k = u.corredores || {};
    const list = (k.lista || []).length ? `<table class="mon-table"><thead><tr><th>Corredor</th><th>Categoría</th><th>ha</th></tr></thead><tbody>${k.lista.map((c) => `<tr><td>${esc(c.nombre || '—')}</td><td>${esc(c.categoria || '—')}</td><td>${number(c.interseccion_ha, 1)}</td></tr>`).join('')}</tbody></table>` : '<p class="s">El territorio no intersecta corredores publicados.</p>';
    let html = wg('corr', 'Corredores publicados · Almanaque Azul', `<div class="cards3"><div class="mc"><span>Área en corredores</span><b>${hectares(k.area_ha)}</b><small>${pct(k.porcentaje)} del territorio</small></div><div class="mc"><span>Corredor Mesoamericano</span><b>${k.intersecta_mesoamericano ? 'Intersecta' : 'No intersecta'}</b></div><div class="mc"><span>Más cercano</span><b>${k.distancia_mas_cercano_m == null ? '—' : `${number(k.distancia_mas_cercano_m, 0)} m`}</b></div></div>${list}`, 'Se conservan las categorías originales (alta, mediana, media-baja). Los corredores aportan contexto; no son evidencia de deterioro.');
    html += wg('rank-corr', 'Comparación entre subcuencas', ranking(u, THEMES.corredores.value, (v) => pct(v), 'proporción dentro de corredores'));
    return html;
  }
  const VIEWS = { resumen: viewResumen, sinia: viewSinia, cambio: viewCambio, prioridades: viewPrioridades, conectividad: viewConectividad, corredores: viewCorredores };

  function render() {
    const u = current();
    if (!u) return;
    $('#mon-title').textContent = u.nombre;
    $('#mon-crumbs').innerHTML = st.sel === 'chcp' ? '<span>Cuenca del Canal</span>' : `<button type="button" data-go="chcp">Cuenca del Canal</button><span>›</span><span>${esc(u.grupo)}</span><span>›</span><span>${esc(u.nombre)}</span>`;
    $('#mon-lead').innerHTML = lead(u);
    $('#mon-widgets').innerHTML = VIEWS[st.tab](u) + `<p class="mon-foot">Indicadores precalculados el ${esc((st.data.generado || '').replace('T', ' '))} con ${esc(st.data.metodologia)} · proyecto ${esc(st.data.proyecto)}. <a href="/platform">Analizar un área propia</a></p>`;
    $$('[data-exp]', $('#mon-widgets')).forEach((b) => b.addEventListener('click', () => { const e = $(`#exp-${b.dataset.exp}`); e.hidden = !e.hidden; }));
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => select(b.dataset.go)));
    styleMap();
  }
  function select(id, fitMap = true) {
    if (!st.data?.territorios?.[id]) return;
    st.sel = id;
    $('#mon-sub').value = id === 'chcp' ? '' : id;
    history.replaceState(null, '', id === 'chcp' ? location.pathname : `#${id}`);
    render();
    if (fitMap) fit();
  }

  // ---------------------------------------------------------------- arranque
  $$('#mon-tabs button').forEach((b) => b.addEventListener('click', () => {
    st.tab = b.dataset.tab;
    $$('#mon-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    render();
  }));
  $('#mon-sub').addEventListener('change', (e) => select(e.target.value || 'chcp'));
  $('#mon-basin').addEventListener('change', () => select('chcp'));

  try {
    st.territory = await api('/api/v1/territory');
    basinLayer = L.geoJSON(st.territory.basin, { style: { color: '#0a4393', weight: 2.5, fill: false }, interactive: false }).addTo(map);
    corridorLayer = L.geoJSON(st.territory.corridors, { style: { color: '#7fae00', weight: 1, fillColor: '#a1d303', fillOpacity: 0.25 }, interactive: false });
    subLayer = L.geoJSON(st.territory.subbasins, {
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(() => {
          const t = st.data?.territorios?.[feature.properties.id];
          const theme = THEMES[st.tab];
          return `<b>${esc(feature.properties.nombre)}</b>${t ? `<br>${esc(theme.name)}: ${theme.fmt(theme.value(t))}` : ''}`;
        }, { sticky: true });
        layer.on('click', () => select(feature.properties.id, false));
      },
    }).addTo(map);
    map.fitBounds(basinLayer.getBounds(), { padding: [20, 20], animate: false });
  } catch (error) {
    $('#mon-lead').textContent = `No se pudieron cargar los límites territoriales: ${error.message}`;
  }
  try {
    st.data = await api('/api/v1/panel/statistics');
  } catch (error) {
    $('#mon-lead').innerHTML = 'Los indicadores del panel aún no se han calculado.';
    $('#mon-widgets').innerHTML = wg('pending', 'Precalcular indicadores', `<p class="s">Ejecute en la carpeta del proyecto, con Earth Engine autenticado:</p><pre class="mon-code">python scripts/precalcular_panel.py</pre><p class="note">Calcula la CHCP y sus 53 subcuencas con los mismos motores de la plataforma y guarda <code>data/estadisticas_territoriales.json</code>. Es reanudable.</p>`);
    return;
  }
  const groups = {};
  subs().forEach((t) => (groups[t.grupo] = groups[t.grupo] || []).push(t));
  $('#mon-sub').innerHTML = '<option value="">Toda la cuenca</option>' + Object.keys(groups).sort((a, b) => a.localeCompare(b, 'es')).map((g) => `<optgroup label="${esc(g)}">${groups[g].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</optgroup>`).join('');
  const missing = 53 - subs().length;
  $('#mon-sub-hint').textContent = `${subs().length} de 53 subcuencas calculadas${missing > 0 ? ` · faltan ${missing}` : ''}`;
  const initial = (location.hash || '').slice(1);
  select(st.data.territorios[initial] ? initial : (st.data.territorios.chcp ? 'chcp' : subs()[0]?.id), Boolean(initial));
})();
