/* Ficha técnica por subcuenca: diagnóstico integral, comprensible e imprimible.
   Usa solo los indicadores precalculados (data/estadisticas_territoriales.json) y las
   geometrías de cada subcuenca (data/subcuencas/<id>.json). Las líneas de acción son
   reglas transparentes sobre esos indicadores: orientan la revisión, no la reemplazan. */
(async function () {
  const { $, escapeHtml: esc, number, hectares, api } = window.CHCP;
  const icon = window.CHCP_ICON || (() => '');
  const st = { data: null, territory: null, map: null };
  const brechas = (e) => (e ? (e.brechas_potenciales ?? e.metricas_red?.numero_brechas_potenciales ?? 0) : 0);
  const pct = (v, d = 1) => (v == null ? '—' : `${number(v, d)} %`);
  const subs = () => Object.values(st.data.territorios).filter((t) => t && t.id !== 'chcp');
  const sinia = (t, y) => (t.sinia || []).find((p) => p.year === y);

  // ------------------------------------------------------------ indicadores
  const IND = [
    { k: 'bosque_sinia', label: 'Bosque SINIA 2021', unit: '%', better: 'high', get: (t) => sinia(t, 2021)?.forest_pct,
      lee: 'Porcentaje del territorio clasificado como «Bosques y otras tierras boscosas» en la cartografía oficial 2021.' },
    { k: 'estable', label: 'Bosque estable JRC 2025', unit: '%', better: 'high', get: (t) => (t.area_ha ? t.jrc_ha.tmf_estable / t.area_ha * 100 : null),
      lee: 'Bosque tropical húmedo sin perturbación detectada por JRC TMF desde 1990.' },
    { k: 'perturbado', label: 'Deforestado o degradado (JRC)', unit: '%', better: 'low', get: (t) => (t.area_ha ? ((t.jrc_ha.tmf_deforestacion || 0) + (t.jrc_ha.tmf_degradacion || 0)) / t.area_ha * 100 : null),
      lee: 'Superficie que JRC clasifica como deforestada o degradada a 2025 (estado acumulado, no solo eventos recientes).' },
    { k: 'hansen', label: 'Pérdida Hansen desde 2021', unit: '%', better: 'low', get: (t) => (t.area_ha ? t.hansen_post_2020_ha / t.area_ha * 100 : null),
      lee: 'Pérdida de cobertura arbórea detectada por Hansen GFC entre 2021 y 2025. Incluye cosecha de plantaciones.' },
    { k: 'borde', label: 'Densidad de borde', unit: 'm/ha', better: 'low', get: (t) => t.estructura_2021?.metricas_clase?.densidad_borde_m_ha,
      lee: 'Metros de borde de bosque por hectárea de paisaje. Más borde = bosque más recortado y expuesto.' },
    { k: 'lpi', label: 'Parche mayor', unit: '%', better: 'high', get: (t) => t.estructura_2021?.metricas_clase?.indice_parche_mayor_pct,
      lee: 'Porcentaje del paisaje que ocupa el parche de bosque más grande. Valores altos indican un bloque dominante continuo.' },
    { k: 'nucleo', label: 'Bosque interior (núcleo a 100 m)', unit: '%', better: 'high', get: (t) => t.estructura_2021?.metricas_paisaje?.porcentaje_bosque_nucleo,
      lee: 'Parte del bosque a más de 100 m de cualquier borde, menos expuesta a viento, luz, ruido o accesos.' },
    { k: 'enn', label: 'Distancia media entre parches', unit: 'm', better: 'low', get: (t) => t.estructura_2021?.metricas_paisaje?.enn_medio_m,
      lee: 'Distancia de cada parche a su vecino más cercano, de borde a borde. Valores altos indican parches más aislados.' },
    { k: 'cohesion', label: 'Cohesión del bosque', unit: '', better: 'high', get: (t) => t.estructura_2021?.metricas_paisaje?.cohesion,
      lee: 'Continuidad física de la cobertura (0–100). Cerca de 100 = bosque agregado y continuo.' },
    { k: 'componentes', label: 'Redes de bosque separadas', unit: '', better: 'low', get: (t) => t.estructura_2021?.metricas_red?.numero_componentes,
      lee: 'Número de grupos de parches que no se conectan entre sí a la distancia de análisis.' },
    { k: 'corredor', label: 'Área en corredores publicados', unit: '%', better: 'high', get: (t) => t.corredores?.porcentaje,
      lee: 'Parte del territorio dentro de corredores biológicos publicados (Almanaque Azul).' },
    { k: 'eri', label: 'Resiliencia ecológica (ERI)', unit: '', better: 'high', get: (t) => (t.eri?.valor == null ? null : t.eri.valor * 100),
      lee: 'Índice indicativo 0–100 que combina integridad, conectividad local, estabilidad del relieve y cercanía a ríos.' },
  ];
  function rank(ind, t) {
    const vals = subs().map(ind.get).filter((v) => v != null && !Number.isNaN(v));
    const v = ind.get(t);
    if (v == null || vals.length < 5) return null;
    const worse = vals.filter((x) => (ind.better === 'high' ? x < v : x > v)).length;
    const ties = vals.filter((x) => x === v).length - 1;
    const good = (worse + 0.5 * ties) / (vals.length - 1 || 1) * 100;
    return { good, n: vals.length };
  }
  function tone(r) { if (!r) return 'na'; return r.good >= 66 ? 'good' : r.good >= 33 ? 'mid' : 'bad'; }
  function fmt(ind, v) { if (v == null) return '—'; return ind.unit === '%' ? pct(v) : ind.unit ? `${number(v, ind.k === 'enn' ? 0 : 1)} ${ind.unit}` : number(v, ind.k === 'componentes' ? 0 : 1); }

  // ------------------------------------------------------------ gráficos
  function donut(rows, center) {
    const total = rows.reduce((a, r) => a + (r.v || 0), 0) || 1, R = 46, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = rows.filter((r) => r.v > 0).map((r) => { const l = r.v / total * C; const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${r.c}" stroke-width="18" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += l; return s; }).join('');
    return `<div class="fi-donut"><svg viewBox="0 0 120 120">${arcs}<text x="60" y="64" text-anchor="middle">${esc(center)}</text></svg><ul>${rows.map((r) => `<li><i style="background:${r.c}"></i>${esc(r.l)}<b>${pct(r.v / total * 100)}</b></li>`).join('')}</ul></div>`;
  }
  function bars(rows, f) {
    const max = Math.max(1e-9, ...rows.map((r) => r.v || 0));
    return `<div class="fi-bars">${rows.map((r) => `<div><span>${esc(r.l)}</span><i><b style="width:${Math.max(1, (r.v || 0) / max * 100)}%;background:${r.c || '#0a4393'}"></b></i><em>${f(r.v)}</em></div>`).join('')}</div>`;
  }
  function line(series, keys) {
    const W = 520, H = 170, L = 44, R = 12, T = 8, B = 22;
    const vals = series.flatMap((r) => keys.map((k) => r[k.k]).filter((v) => v != null)); const max = Math.max(1, ...vals);
    const x = (i) => L + i * (W - L - R) / Math.max(1, series.length - 1), y = (v) => T + (1 - v / max) * (H - T - B);
    const grid = [0, .5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="g"/><text x="${L - 5}" y="${y(max * f) + 3}" text-anchor="end">${number(max * f, 0)}</text>`).join('');
    const ls = keys.map((k) => `<polyline fill="none" stroke="${k.c}" stroke-width="2.2" points="${series.map((r, i) => (r[k.k] == null ? '' : `${x(i)},${y(r[k.k])}`)).join(' ')}"/>`).join('');
    return `<svg class="fi-line" viewBox="0 0 ${W} ${H}">${grid}${series.map((r, i) => `<text x="${x(i)}" y="${H - 5}" text-anchor="middle">${r.anio}</text>`).join('')}${ls}</svg><ul class="fi-keys">${keys.map((k) => `<li><i style="background:${k.c}"></i>${esc(k.l)}</li>`).join('')}</ul>`;
  }

  // ------------------------------------------------------------ texto
  function diagnostico(t) {
    const s21 = sinia(t, 2021), p = t.preevaluacion, m = t.estructura_2021?.metricas_clase, r = t.estructura_2021?.metricas_red, mp = t.estructura_2021?.metricas_paisaje;
    const serie = t.serie_anual || [];
    const ini = serie[0], fin = serie[serie.length - 1];
    const hansenAnual = serie.filter((x) => x.hansen_perdida_ha != null);
    const pico = hansenAnual.reduce((a, b) => (b.hansen_perdida_ha > (a?.hansen_perdida_ha ?? -1) ? b : a), null);
    const frases = [];
    frases.push(`<b>Estado del bosque.</b> ${esc(t.nombre)} tiene ${hectares(t.area_ha)}; la cartografía oficial 2021 clasifica el ${pct(s21?.forest_pct, 0)} como bosques y otras tierras boscosas, y JRC identifica ${hectares(t.jrc_ha.tmf_estable)} de bosque húmedo sin perturbación detectada (${pct(t.jrc_ha.tmf_estable / t.area_ha * 100, 0)}).`);
    let cambio = `<b>Cambios recientes.</b> JRC registra ${hectares(t.jrc_ha.tmf_deforestacion)} en estado deforestado y ${hectares(t.jrc_ha.tmf_degradacion)} degradado a 2025`;
    if (ini && fin) { const d = (fin.jrc_deforestacion_ha || 0) - (ini.jrc_deforestacion_ha || 0); cambio += `; entre ${ini.anio} y ${fin.anio} la superficie deforestada ${d > 0.5 ? `aumentó ${hectares(d)}` : d < -0.5 ? `se redujo ${hectares(-d)} (regeneración o reclasificación)` : 'se mantuvo estable'}`; }
    cambio += `. Hansen detecta ${hectares(t.hansen_post_2020_ha)} de pérdida de cobertura arbórea desde 2021${pico && pico.hansen_perdida_ha > 0 ? `, con el mayor valor en ${pico.anio} (${hectares(pico.hansen_perdida_ha)})` : ''}.`;
    frases.push(cambio);
    if (m) {
      frases.push(`<b>Fragmentación.</b> El bosque oficial 2021 forma ${number(m.numero_parches, 0)} parches; el mayor ocupa el ${pct(m.indice_parche_mayor_pct, 0)} del paisaje y hay ${number(m.densidad_borde_m_ha, 0)} m de borde por hectárea${mp && !mp.error ? `. Solo el ${pct(mp.porcentaje_bosque_nucleo, 0)} del bosque es interior (a más de 100 m de un borde) y los parches están, en promedio, a ${number(mp.enn_medio_m, 0)} m de su vecino más cercano` : ''}.`);
      frases.push(`<b>Conectividad estructural.</b> A ${number(r?.umbral_m || st.data.umbral_conectividad_m, 0)} m de distancia, los parches forman ${number(r.numero_componentes, 0)} ${r.numero_componentes === 1 ? 'red continua' : 'redes separadas'}, con ${number(r.numero_parches_aislados, 0)} parche(s) aislado(s)${brechas(t.estructura_2021) ? ` y ${brechas(t.estructura_2021)} brecha(s) candidata(s) a reconexión` : ''}. Es conectividad potencial por cercanía, no movimiento comprobado de fauna.`);
    }
    frases.push(`<b>Corredores.</b> ${pct(t.corredores?.porcentaje, 0)} del territorio está dentro de corredores publicados${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}.`);
    if (t.eri?.clase) frases.push(`<b>Resiliencia (ERI, indicativo).</b> Clase ${esc(t.eri.clase)} (${number(t.eri.valor * 100, 0)}/100); el componente más débil es ${esc((t.eri.componente_limitante_etiqueta || '').toLowerCase())}.`);
    frases.push(`<b>Preevaluación.</b> ${number(p.puntaje, 1)} de ${number(p.puntaje_maximo, 1)} puntos (prioridad ${esc(p.prioridad)}); prioridad de visita ${esc(p.prioridad_visita || '—')}. Fuentes con señal de deterioro: ${esc((p.fuentes_deterioro || []).join(', ') || 'ninguna')}.`);
    return frases;
  }
  function acciones(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, r = e?.metricas_red, out = [];
    if (['Muy alta', 'Alta'].includes(p.prioridad_visita)) out.push({ t: 'Verificación de campo prioritaria', i: 'clipboard', why: `Prioridad de visita ${p.prioridad_visita}: ${(p.fuentes_deterioro || []).join(' y ') || 'varias fuentes'} muestran señales de cambio${t.corredores?.porcentaje > 10 ? ' dentro o cerca de corredores' : ''}.`, how: 'Visitar los sectores con señales coincidentes, registrar fotografías, coordenadas y causa probable (agricultura, pasto, extracción, regeneración).' });
    if (e && (r?.numero_componentes > 1 || brechas(e) > 0 || (mp?.enn_medio_m || 0) > 150)) out.push({ t: 'Restauración para reconectar parches', i: 'network', why: `${r.numero_componentes} red(es) separada(s), ${brechas(e)} brecha(s) candidata(s)${mp?.enn_medio_m ? ` y ${number(mp.enn_medio_m, 0)} m de distancia media entre parches` : ''}.`, how: 'Evaluar franjas de restauración en las brechas marcadas en el mapa, priorizando las que unen redes distintas o llevan hacia un corredor.' });
    const puentes = (mp?.diic_principales || []).filter((x) => x.diic_pct > 1).slice(0, 3);
    if (puentes.length) out.push({ t: 'Proteger los parches clave para la red', i: 'shield', why: `Los parches ${puentes.map((x) => `#${x.parche_id}`).join(', ')} sostienen ${puentes.map((x) => pct(x.diic_pct, 0)).join(', ')} de la conectividad integral (dIIC)${puentes.some((x) => x.es_puente) ? '; algunos funcionan como puentes entre grupos de bosque' : ''}.`, how: 'Incluirlos en monitoreo frecuente y en acuerdos de conservación; su pérdida dividiría la red.' });
    if (mp && !mp.error && mp.porcentaje_bosque_nucleo < 35) out.push({ t: 'Ampliar el bosque interior', i: 'forest', why: `Solo el ${pct(mp.porcentaje_bosque_nucleo, 0)} del bosque está a más de 100 m de un borde.`, how: 'Priorizar restauración que ensanche parches estrechos o cierre entrantes, más que plantar parches pequeños aislados.' });
    const rip = t.eri?.componentes?.proximidad_riparia;
    if (/ripar/i.test(t.eri?.componente_limitante_etiqueta || '') || (rip != null && rip < 0.4)) out.push({ t: 'Revisar franjas riparias', i: 'sprout', why: 'La cercanía a cursos de agua es el componente más débil del ERI.', how: 'Verificar la cobertura en los márgenes de ríos y quebradas; la restauración riparia aporta a la conectividad y a la protección de suelos.' });
    if (p.puntaje < 1.5 && (sinia(t, 2021)?.forest_pct || 0) > 60) out.push({ t: 'Conservación y monitoreo preventivo', i: 'leaf', why: 'Bosque extenso y pocas señales de cambio.', how: 'Mantener el seguimiento anual y proteger la continuidad con subcuencas vecinas.' });
    if (!out.length) out.push({ t: 'Seguimiento anual', i: 'chart', why: 'No se activan reglas específicas.', how: 'Revisar la ficha tras cada actualización de datos.' });
    return out;
  }

  // ------------------------------------------------------------ render
  function render(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, serie = t.serie_anual || [];
    const toneP = { Alta: 'bad', Media: 'mid', Preventiva: 'mid', Baja: 'good' }[p.prioridad] || 'na';
    const indicadores = IND.map((ind) => { const v = ind.get(t), r = rank(ind, t); return `<div class="fi-ind" data-tone="${tone(r)}"><span>${esc(ind.label)}</span><b>${fmt(ind, v)}</b><small>${r ? `Más favorable que el ${number(r.good, 0)} % de las ${r.n} subcuencas` : 'Se calculará en la próxima actualización'}</small><p>${esc(ind.lee)}</p></div>`; }).join('');
    const jrc = [{ l: 'Bosque estable', v: t.jrc_ha.tmf_estable, c: '#1d6b35' }, { l: 'Degradado', v: t.jrc_ha.tmf_degradacion, c: '#f28e2b' }, { l: 'Deforestado', v: t.jrc_ha.tmf_deforestacion, c: '#fabc20' }, { l: 'Regeneración', v: t.jrc_ha.tmf_recuperacion, c: '#a6d96a' }, { l: 'Agua', v: t.jrc_ha.tmf_agua, c: '#5aa9e6' }, { l: 'Otra cobertura', v: t.jrc_ha.tmf_otra_cobertura, c: '#d7c2a1' }];
    const nucleoTabla = mp && !mp.error ? `<table class="fi-table"><thead><tr><th>Profundidad de borde</th><th>Bosque interior</th><th>% del bosque</th><th>Parches sin interior</th></tr></thead><tbody>${mp.area_nucleo.por_profundidad.map((x) => `<tr><td>${number(x.profundidad_m, 0)} m</td><td>${hectares(x.area_nucleo_ha)}</td><td>${pct(x.porcentaje_bosque_nucleo)}</td><td>${number(x.parches_sin_nucleo, 0)}</td></tr>`).join('')}</tbody></table><p class="fi-note">Sensibilidad: el bosque interior depende de la profundidad de borde elegida; 100 m es una referencia de análisis, no un valor comprobado para una especie.</p>` : '<p class="fi-note">Área núcleo, distancia entre parches, cohesión e IIC se incorporan en la próxima actualización de datos.</p>';
    const diic = (mp?.diic_principales || []).slice(0, 6);
    const acc = acciones(t);
    $('#fi-doc').innerHTML = `
      <header class="fi-head">
        <div><span class="fi-kicker">Ficha técnica · ${esc(t.grupo)}</span><h1>${esc(t.nombre)}</h1>
        <p>${hectares(t.area_ha)} · datos del ${esc(String(st.data.generado || '').slice(0, 10))} · ${esc(st.data.metodologia)} · Clúster Copernicus Centroamérica AFOLU II</p></div>
        <div class="fi-score" data-tone="${toneP}"><span>Preevaluación</span><b>${number(p.puntaje, 1)}<small>/ ${number(p.puntaje_maximo, 1)}</small></b><em>${esc(p.prioridad)}</em><small>Visita: ${esc(p.prioridad_visita || '—')}</small></div>
      </header>
      <section class="fi-sec"><h2>${icon('info', 22)} En pocas palabras</h2>${diagnostico(t).map((f) => `<p>${f}</p>`).join('')}</section>
      <section class="fi-sec fi-map-sec"><h2>${icon('map', 22)} Mapa de la subcuenca</h2><div id="fi-map"></div>
        <div class="fi-legend"><span><i style="background:#1b5e20"></i>Parche clave (conectividad alta)</span><span><i style="background:#66bb6a"></i>Parche de importancia media</span><span><i style="background:#c5e1a5"></i>Parche de importancia baja</span><span><i class="dash"></i>Brecha candidata a reconexión</span><span><i style="background:#a1d30366;border:1px solid #7fae00"></i>Corredor publicado</span><span><i class="pt"></i>Punto crítico</span></div></section>
      <section class="fi-sec"><h2>${icon('chart', 22)} Indicadores y comparación con las demás subcuencas</h2><p class="fi-note">Verde: mejor que la mayoría de subcuencas; ámbar: intermedio; rojo: entre las más desfavorables. La comparación es relativa a la CHCP, no un umbral normativo.</p><div class="fi-inds">${indicadores}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('forest', 22)} Dinámica del bosque · JRC 2025</h2>${donut(jrc, hectares(t.area_ha, 0))}</div>
        <div><h2>${icon('trend', 22)} Evolución 2020–2025 (ha)</h2>${serie.length ? line(serie, [{ k: 'jrc_degradacion_ha', l: 'Degradado (JRC)', c: '#f28e2b' }, { k: 'jrc_regeneracion_ha', l: 'Regeneración (JRC)', c: '#3d8b37' }, { k: 'jrc_deforestacion_ha', l: 'Deforestado (JRC)', c: '#2f7ee0' }]) : ''}
        <h3>Pérdida anual Hansen</h3>${bars(serie.filter((x) => x.hansen_perdida_ha != null).map((x) => ({ l: String(x.anio), v: x.hansen_perdida_ha, c: '#d0442c' })), (v) => hectares(v))}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('layers', 22)} Cartografía oficial SINIA</h2>${bars((t.sinia || []).map((s) => ({ l: `Bosque ${s.year}`, v: s.forest_pct, c: '#237A4B' })), (v) => pct(v))}<p class="fi-note">Productos independientes con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.</p>
        <h3>Otras señales</h3><ul class="fi-list"><li>ESRI 2017→2024: ${hectares(t.esri?.esri_salida)} de árboles a otra clase y ${hectares(t.esri?.esri_ganancia)} de otra clase a árboles.</li><li>NDVI medio 2020→2025: ${number(t.ndvi?.ndvi_inicial_medio, 2)} → ${number(t.ndvi?.ndvi_final_medio, 2)}; ${hectares(t.ndvi?.ndvi_disminucion)} con descenso fuerte (≥ 0.15).</li><li>Altura media del dosel (GEDI): ${t.gedi_altura_m == null ? '—' : `${number(t.gedi_altura_m, 1)} m`}.</li></ul></div>
        <div><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2>${t.eri?.componentes ? `<p><b>${esc(t.eri.clase)}</b> · ${number(t.eri.valor * 100, 0)}/100. ${esc(t.eri.lectura || '')}</p>${bars(Object.entries(t.eri.componentes).map(([k, v]) => ({ l: { integridad_estructural: 'Integridad', conectividad: 'Conectividad local', estabilidad_topografica: 'Estabilidad del relieve', proximidad_riparia: 'Cercanía a ríos' }[k] || k, v: v * 100, c: '#76b72a' })), (v) => number(v, 0))}<p class="fi-note">Indicativo: pesos 35/25/20/20 sin validación de campo; no modifica la prioridad.</p>` : '<p class="fi-note">El ERI por subcuenca se incorpora en la próxima actualización de datos.</p>'}</div></section>
      <section class="fi-sec"><h2>${icon('network', 22)} Fragmentación y conectividad · bosque oficial 2021</h2>
        ${e ? `<div class="fi-kv"><div><span>Parches</span><b>${number(e.metricas_clase.numero_parches, 0)}</b></div><div><span>Bosque</span><b>${hectares(e.metricas_clase.area_total_bosque_ha)}</b></div><div><span>Redes separadas</span><b>${number(e.metricas_red.numero_componentes, 0)}</b></div><div><span>Conexiones</span><b>${number(e.metricas_red.numero_aristas, 0)}</b></div><div><span>Aislados</span><b>${number(e.metricas_red.numero_parches_aislados, 0)}</b></div><div><span>Cohesión</span><b>${mp?.cohesion == null ? '—' : number(mp.cohesion, 1)}</b></div><div><span>IIC</span><b>${mp?.iic == null ? '—' : mp.iic.toExponential(2)}</b></div><div><span>Distancia entre parches</span><b>${mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`}</b></div></div>
        <h3>Bosque interior (área núcleo)</h3>${nucleoTabla}
        ${diic.length ? `<h3>Parches más importantes para la red (dIIC)</h3><table class="fi-table"><thead><tr><th>Parche</th><th>Superficie</th><th>Aporte a la conectividad</th><th>Función</th></tr></thead><tbody>${diic.map((x) => `<tr><td>#${x.parche_id}</td><td>${hectares(x.area_ha)}</td><td>${pct(x.diic_pct)}</td><td>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}</td></tr>`).join('')}</tbody></table><p class="fi-note">dIIC: cuánto bajaría el índice integral de conectividad si se perdiera el parche (Pascual-Hortal y Saura, 2006). Distancia umbral ${number(mp.umbral_m, 0)} m.</p>` : ''}` : '<p>Sin estructura calculada.</p>'}</section>
      <section class="fi-sec"><h2>${icon('leaf', 22)} Líneas de acción sugeridas</h2><div class="fi-actions">${acc.map((a) => `<div class="fi-action">${icon(a.i, 24)}<div><b>${esc(a.t)}</b><p><em>Por qué:</em> ${esc(a.why)}</p><p><em>Qué hacer:</em> ${esc(a.how)}</p></div></div>`).join('')}</div><p class="fi-note">Reglas transparentes sobre los indicadores de esta ficha. Orientan la revisión técnica; no sustituyen la verificación de campo ni constituyen una decisión de manejo.</p></section>
      <section class="fi-sec"><h2>${icon('warning', 22)} Confiabilidad e incertidumbre</h2>
        <p><b>Concordancia de fuentes:</b> ${esc(p.consistencia || '—')}. ${(p.fuentes_deterioro || []).length >= 2 ? 'Dos o más fuentes coinciden en señales de deterioro, lo que aumenta la confianza, aunque JRC y Hansen comparten imágenes Landsat y no son totalmente independientes.' : (p.fuentes_deterioro || []).length === 1 ? 'Solo una fuente muestra deterioro: la señal debe verificarse.' : 'Ninguna fuente muestra deterioro significativo.'}</p>
        <table class="fi-table"><thead><tr><th>Fuente</th><th>Qué mide</th><th>Limitación principal</th></tr></thead><tbody>
          <tr><td>JRC TMF</td><td>Estado anual del bosque húmedo (30 m, Landsat)</td><td>Clases acumuladas; bosques secos o abiertos pueden quedar fuera.</td></tr>
          <tr><td>Hansen GFC</td><td>Pérdida de cobertura arbórea por año (30 m)</td><td>No distingue bosque natural de plantación ni la causa.</td></tr>
          <tr><td>ESRI LULC</td><td>Clase «árboles» anual (10 m, Sentinel-2)</td><td>Clasificación automática; errores en bordes y mosaicos agrícolas.</td></tr>
          <tr><td>NDVI Sentinel-2</td><td>Vigor de la vegetación</td><td>Sensible a nubes, fenología y sequía; no equivale a pérdida de bosque.</td></tr>
          <tr><td>GEDI</td><td>Altura del dosel por láser</td><td>Muestreo por huellas, no cobertura continua.</td></tr>
          <tr><td>SINIA–MiAMBIENTE</td><td>Cartografía oficial (2019, 2021, 2023)</td><td>Escalas y métodos distintos entre años.</td></tr></tbody></table>
        <p class="fi-note"><b>Pendiente:</b> exactitud por clase, matrices de confusión y superficies ajustadas por error requieren puntos de referencia independientes (módulo de validación en preparación, buenas prácticas FAO / Olofsson et al., 2014). Hasta entonces, las superficies son estimaciones de mapa sin intervalo de confianza.</p></section>
      <section class="fi-sec fi-gloss"><h2>${icon('doc', 22)} Glosario breve</h2><dl>
        <dt>Parche</dt><dd>Área continua de bosque.</dd><dt>Borde</dt><dd>Límite entre bosque y otra cobertura; el bosque cercano al borde recibe más perturbaciones.</dd>
        <dt>Bosque interior (núcleo)</dt><dd>Bosque a más de cierta distancia de cualquier borde.</dd><dt>Red / componente</dt><dd>Grupo de parches suficientemente cercanos para considerarse conectados.</dd>
        <dt>IIC / dIIC</dt><dd>Índice de conectividad del paisaje y cuánto aporta cada parche a ella.</dd><dt>Conectividad estructural</dt><dd>Basada en la disposición del bosque; no demuestra que la fauna se desplace.</dd></dl></section>
      <footer class="fi-foot">Geoportal CHCP · Datos: JRC TMF, Hansen GFC, ESRI LULC, Copernicus Sentinel-2, GEDI, SINIA–MiAMBIENTE, Almanaque Azul · Procesado en Google Earth Engine (proyecto ${esc(st.data.proyecto)}) · Preevaluación indicativa: no predice deforestación ni certifica cumplimiento.</footer>`;
    drawMap(t);
  }
  async function drawMap(t) {
    if (st.map) { st.map.remove(); st.map = null; }
    const map = L.map('fi-map', { zoomControl: true, preferCanvas: false });
    st.map = map;
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri World Imagery', maxZoom: 17, crossOrigin: true }).addTo(map);
    const feature = t.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((f) => f.properties.id === t.id);
    const area = L.geoJSON(feature, { style: { color: '#ffffff', weight: 3, fill: false } }).addTo(map);
    L.geoJSON(st.territory.corridors, { style: { color: '#7fae00', weight: 1, fillColor: '#a1d303', fillOpacity: 0.2 }, interactive: false }).addTo(map);
    L.geoJSON(st.territory.critical_points || st.territory.points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f04438', fillOpacity: 1 }) }).addTo(map);
    map.fitBounds(area.getBounds(), { padding: [16, 16] });
    try {
      const g = await api(`/api/v1/panel/geometry/${t.id}`);
      const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
      L.geoJSON(g.parches, { style: (f) => ({ color: '#0b3d17', weight: 0.6, fillColor: color[f.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.85 }), onEachFeature: (f, l) => l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · importancia ${f.properties.prioridad_conectividad || '—'}`) }).addTo(map);
      L.geoJSON(g.brechas, { style: { color: '#ff5252', weight: 3, dashArray: '6 5' } }).addTo(map);
      L.geoJSON(g.ruta_corredor, { style: { color: '#ffd54f', weight: 2.5, dashArray: '2 4' } }).addTo(map);
    } catch (_) { /* geometrías aún no calculadas: el mapa muestra límites y corredores */ }
  }
  function select(id) {
    const t = st.data.territorios[id];
    if (!t) return;
    $('#fi-select').value = id;
    history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}`);
    document.title = `Ficha técnica · ${t.nombre} · Geoportal CHCP`;
    render(t);
  }

  try {
    [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory')]);
  } catch (error) {
    $('#fi-doc').innerHTML = `<p class="fi-loading">No se pudieron cargar los datos: ${esc(error.message)}</p>`;
    return;
  }
  const list = Object.values(st.data.territorios).filter(Boolean).sort((a, b) => (a.id === 'chcp' ? -1 : b.id === 'chcp' ? 1 : a.nombre.localeCompare(b.nombre, 'es')));
  $('#fi-select').innerHTML = list.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('');
  $('#fi-select').addEventListener('change', (e) => select(e.target.value));
  $('#fi-print').addEventListener('click', () => window.print());
  const id = new URLSearchParams(location.search).get('id');
  select(st.data.territorios[id] ? id : (list.find((t) => t.id !== 'chcp') || list[0]).id);
})();
