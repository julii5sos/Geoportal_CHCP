/* Ficha técnica por subcuenca: diagnóstico integral, comprensible e imprimible.
   Usa solo los indicadores precalculados (data/estadisticas_territoriales.json) y las
   geometrías de cada subcuenca (data/subcuencas/<id>.json). Las líneas de acción son
   reglas transparentes sobre esos indicadores: orientan la revisión, no la reemplazan. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, mapFile } = window.CHCP;
  const RED = window.CHCP_RED;
  const COLOR_CORREDOR = { Alta: '#1b5e20', Mediana: '#9ccc65', 'Media-baja': '#ffb74d' };
  const BASE_GRIS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
  const BASE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const featureDe = (t) => (t.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((f) => f.properties.id === t.id));
  const rip50 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 50);
  const rip30 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 30);
  const icon = window.CHCP_ICON || (() => '');
  const st = { data: null, territory: null, map: null, galeria: [], rios: null };
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
    { k: 'ndvi', label: 'Cambio del NDVI 2020→2025', unit: '', better: 'high', get: (t) => t.ndvi?.ndvi_delta_medio,
      lee: 'Diferencia del vigor medio de la vegetación (Sentinel-2). Valores negativos indican menos vigor; puede deberse a cosecha, sequía o nubes.' },
    { k: 'ripario', label: 'Bosque en franja riparia de 30 m', unit: '%', better: 'high', get: (t) => rip30(t)?.bosque_sinia_pct,
      lee: 'Parte de la franja de 30 m a cada lado de los cauces que tiene bosque oficial 2021. Protege suelos y conecta parches a lo largo de los ríos.' },
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
  function fmt(ind, v) { if (v == null) return '—'; if (ind.k === 'ndvi') return `${v > 0 ? '+' : ''}${number(v, 3)}`; return ind.unit === '%' ? pct(v) : ind.unit ? `${number(v, ind.k === 'enn' ? 0 : 1)} ${ind.unit}` : number(v, ind.k === 'componentes' ? 0 : 1); }

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
    if (t.ndvi?.ndvi_inicial_medio != null) frases.push(`<b>Vigor de la vegetación.</b> El NDVI medio pasó de ${number(t.ndvi.ndvi_inicial_medio, 2)} en 2020 a ${number(t.ndvi.ndvi_final_medio, 2)} en 2025; ${hectares(t.ndvi.ndvi_disminucion)} muestran un descenso fuerte.`);
    if (rip30(t)?.bosque_sinia_pct != null) frases.push(`<b>Ríos.</b> Unos ${number(t.riparia.longitud_cauces_km, 0)} km de cauces; el ${pct(rip30(t).bosque_sinia_pct, 0)} de la franja de 30 m a cada lado tiene bosque oficial.`);
    frases.push(`<b>Corredores.</b> ${pct(t.corredores?.porcentaje, 0)} del territorio está dentro de corredores publicados${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}.`);
    if (t.eri?.clase) frases.push(`<b>Resiliencia (ERI, indicativo).</b> Clase ${esc(t.eri.clase)} (${number(t.eri.valor * 100, 0)}/100); el componente más débil es ${esc((t.eri.componente_limitante_etiqueta || '').toLowerCase())}.`);
    frases.push(`<b>Preevaluación.</b> ${number(p.puntaje, 1)} de ${number(p.puntaje_maximo, 1)} puntos (prioridad ${esc(p.prioridad)}); prioridad de visita ${esc(p.prioridad_visita || '—')}. Fuentes con señal de deterioro: ${esc((p.fuentes_deterioro || []).join(', ') || 'ninguna')}.`);
    return frases;
  }
  function acciones(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, r = e?.metricas_red, out = [];
    if (['Muy alta', 'Alta'].includes(p.prioridad_visita)) out.push({ t: 'Verificación de campo prioritaria', i: 'clipboard', why: `Prioridad de visita ${p.prioridad_visita}: ${(p.fuentes_deterioro || []).join(' y ') || 'varias fuentes'} muestran señales de cambio${t.corredores?.porcentaje > 10 ? ' dentro o cerca de corredores' : ''}.`, how: 'Visitar los sectores con señales coincidentes, registrar fotografías, coordenadas y causa probable (agricultura, pasto, extracción, regeneración).' });
    if (e && (r?.numero_componentes > 1 || brechas(e) > 0 || (mp?.enn_medio_m || 0) > 150)) out.push({ sim: true, t: 'Restauración para reconectar parches', i: 'network', why: `${r.numero_componentes} red(es) separada(s), ${brechas(e)} brecha(s) candidata(s)${mp?.enn_medio_m ? ` y ${number(mp.enn_medio_m, 0)} m de distancia media entre parches` : ''}.`, how: 'Evaluar franjas de restauración en las brechas marcadas en el mapa, priorizando las que unen redes distintas o llevan hacia un corredor.' });
    const puentes = (mp?.diic_principales || []).filter((x) => x.diic_pct > 1).slice(0, 3);
    if (puentes.length) out.push({ t: 'Proteger los parches clave para la red', i: 'shield', why: `Los parches ${puentes.map((x) => `#${x.parche_id}`).join(', ')} sostienen ${puentes.map((x) => pct(x.diic_pct, 0)).join(', ')} de la conectividad integral (dIIC)${puentes.some((x) => x.es_puente) ? '; algunos funcionan como puentes entre grupos de bosque' : ''}.`, how: 'Incluirlos en monitoreo frecuente y en acuerdos de conservación; su pérdida dividiría la red.' });
    if (mp && !mp.error && mp.porcentaje_bosque_nucleo < 35) out.push({ t: 'Ampliar el bosque interior', i: 'forest', why: `Solo el ${pct(mp.porcentaje_bosque_nucleo, 0)} del bosque está a más de 100 m de un borde.`, how: 'Priorizar restauración que ensanche parches estrechos o cierre entrantes, más que plantar parches pequeños aislados.' });
    const f30 = rip30(t), empinado = (t.riparia?.sin_bosque_por_pendiente || []).find((x) => /30/.test(x.pendiente) && /≥/.test(x.pendiente));
    if (f30?.bosque_sinia_pct != null && (f30.bosque_sinia_pct < 60 || (empinado?.area_ha || 0) > 5)) out.push({ t: 'Restauración riparia', i: 'sprout', why: `Solo el ${pct(f30.bosque_sinia_pct, 0)} de la franja de 30 m junto a los cauces tiene bosque${empinado?.area_ha ? ` y hay ${hectares(empinado.area_ha)} de orillas sin bosque con pendiente ≥ 30 %` : ''}.`, how: 'Priorizar la revegetación de orillas sin bosque, empezando por las de mayor pendiente y las que unen parches; verificar en campo con hidrografía local.' });
    else if (/ripar/i.test(t.eri?.componente_limitante_etiqueta || '')) out.push({ t: 'Revisar franjas riparias', i: 'sprout', why: 'La cercanía a cursos de agua es el componente más débil del ERI.', how: 'Verificar la cobertura en los márgenes de ríos y quebradas; la restauración riparia aporta a la conectividad y a la protección de suelos.' });
    const nd = t.ndvi;
    if (nd && nd.ndvi_disminucion > 0 && t.area_ha && nd.ndvi_disminucion / t.area_ha > 0.05) out.push({ t: 'Revisar descensos de vigor (NDVI)', i: 'trend', why: `${hectares(nd.ndvi_disminucion)} (${pct(nd.ndvi_disminucion / t.area_ha * 100, 0)} del territorio) perdieron ≥ 0.15 de NDVI entre 2020 y 2025.`, how: 'Contrastar con el mapa de señales coincidentes: si JRC o Hansen no confirman, puede tratarse de cultivos, sequía o nubes.' });
    if (p.puntaje < 1.5 && (sinia(t, 2021)?.forest_pct || 0) > 60) out.push({ t: 'Conservación y monitoreo preventivo', i: 'leaf', why: 'Bosque extenso y pocas señales de cambio.', how: 'Mantener el seguimiento anual y proteger la continuidad con subcuencas vecinas.' });
    if (!out.length) out.push({ t: 'Seguimiento anual', i: 'chart', why: 'No se activan reglas específicas.', how: 'Revisar la ficha tras cada actualización de datos.' });
    return out;
  }

  // ------------------------------------------------------------ secciones nuevas
  function leyendaCapa(capa) {
    if (capa.tipo === 'continuo') return `<div class="fi-ramp"><i style="background:linear-gradient(90deg,${capa.paleta.join(',')})"></i><span>${capa.leyenda.map((x) => `<em>${esc(x.etiqueta)}</em>`).join('')}</span></div>`;
    return `<div class="fi-legend">${capa.leyenda.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.etiqueta)}</span>`).join('')}</div>`;
  }
  function seccionGaleria(t) {
    const capas = (st.data.capas_mapa || []).filter((c) => t.mapas?.capas?.includes(c.clave));
    if (!capas.length) return '<p class="fi-pending">Los mapas temáticos (SINIA 2021, JRC, Hansen, ESRI, NDVI, ERI, señales coincidentes y franjas riparias) se generan en la próxima actualización de datos con Earth Engine.</p>';
    return `<div class="fi-gal">${capas.map((c) => `<figure class="fi-fig"><figcaption>${esc(c.titulo)}</figcaption><div class="fi-mini" data-capa="${c.clave}"></div>${leyendaCapa(c)}<p class="fi-note">${esc(c.lectura)}</p></figure>`).join('')}</div><p class="fi-note">Resolución de los mapas: ${number(t.mapas.tamano_pixel_m, 0)} m por píxel. Los cálculos de superficie usan la resolución nativa de cada fuente.</p>`;
  }
  function seccionNdvi(t) {
    const n = t.ndvi;
    if (!n || n.ndvi_inicial_medio == null) return '';
    const d = n.ndvi_delta_medio ?? (n.ndvi_final_medio - n.ndvi_inicial_medio);
    const lectura = d <= -0.05 ? 'El vigor medio de la vegetación disminuyó de forma apreciable.' : d >= 0.05 ? 'El vigor medio de la vegetación aumentó.' : 'El vigor medio se mantuvo prácticamente estable.';
    const parte = t.area_ha ? n.ndvi_disminucion / t.area_ha * 100 : null;
    return `<section class="fi-sec fi-two"><div><h2>${icon('trend', 22)} Vigor de la vegetación · NDVI Sentinel-2</h2>
      ${bars([{ l: 'NDVI 2020', v: n.ndvi_inicial_medio, c: '#a6d96a' }, { l: 'NDVI 2025', v: n.ndvi_final_medio, c: d < 0 ? '#d8b365' : '#1a9850' }], (v) => number(v, 2))}
      <p><b>${lectura}</b> Cambio medio ${d > 0 ? '+' : ''}${number(d, 3)}. ${hectares(n.ndvi_disminucion)}${parte == null ? '' : ` (${pct(parte, 1)} del territorio)`} tuvieron un descenso fuerte (≥ 0.15) partiendo de vegetación vigorosa.</p></div>
      <div><h3>Cómo leer el NDVI</h3><ul class="fi-list"><li>Va de −1 a 1; la vegetación densa y sana suele estar entre 0.6 y 0.9.</li><li>Es la quinta fuente del índice de preevaluación (peso 0.5): solo suma cuando el descenso es extenso.</li><li>Un descenso aislado no prueba deforestación: puede ser cosecha, sequía, quema o nubes residuales. Por eso se contrasta con JRC, Hansen y ESRI en el mapa de señales coincidentes.</li></ul></div></section>`;
  }
  function seccionEri(t) {
    const e = t.eri;
    const nombres = { integridad_estructural: 'Integridad estructural (35 %)', conectividad: 'Conectividad local (25 %)', estabilidad_topografica: 'Estabilidad del relieve (20 %)', proximidad_riparia: 'Cercanía a ríos (20 %)' };
    if (!e?.componentes) return `<section class="fi-sec"><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2><p class="fi-pending">${e?.lectura && /No calculado/.test(e.lectura) ? esc(e.lectura) : 'El ERI por subcuenca se incorpora en la próxima actualización de datos con Earth Engine.'}</p></section>`;
    const dist = (e.distribucion_clases || []).filter((x) => x.area_ha > 0);
    return `<section class="fi-sec fi-two"><div><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2>
      <div class="fi-eri"><b style="background:${e.color || '#76b72a'}">${number(e.valor * 100, 0)}</b><div><strong>${esc(e.clase)}</strong><p>${esc(e.lectura || '')}</p></div></div>
      ${bars(Object.entries(e.componentes).map(([k, v]) => ({ l: nombres[k] || k, v: v * 100, c: k === Object.entries(e.componentes).sort((a, b) => a[1] - b[1])[0][0] ? '#f28e2b' : '#76b72a' })), (v) => `${number(v, 0)}/100`)}
      <p class="fi-note">En naranja, el componente más débil. Índice indicativo (Dynamic World, GEDI, Copernicus DEM y MERIT Hydro); no modifica la preevaluación.</p></div>
      <div>${dist.length ? `<h3>Superficie por clase de resiliencia</h3>${donut(dist.map((x) => ({ l: x.clase, v: x.area_ha, c: x.color })), 'ERI')}` : ''}<h3>Qué significa</h3><p>El ERI resume la capacidad del paisaje para mantener y recuperar sus funciones: dosel alto y denso, bosque cercano alrededor, laderas con cobertura y vegetación junto a los ríos. Un valor bajo señala dónde la restauración aportaría más estabilidad.</p></div></section>`;
  }
  function seccionRiparia(t) {
    const r = t.riparia;
    if (!r || r.error || !r.franjas) return `<section class="fi-sec"><h2>${icon('sprout', 22)} Ríos y franjas riparias</h2><p class="fi-pending">${r?.error ? 'El análisis ripario no pudo calcularse en la última actualización.' : 'El análisis de bosque junto a los ríos se incorpora en la próxima actualización de datos con Earth Engine.'}</p></section>`;
    const f30 = rip30(t), f50 = rip50(t);
    const total = r.sin_bosque_por_pendiente.reduce((s, x) => s + x.area_ha, 0);
    return `<section class="fi-sec"><h2>${icon('sprout', 22)} Ríos y franjas riparias</h2>
      <p>La subcuenca tiene unos <b>${number(r.longitud_cauces_km, 1)} km de cauces</b> con más de ${number(r.area_drenaje_minima_km2, 0)} km² de drenaje. ${f30?.bosque_sinia_pct == null ? '' : `En la franja de 30 m a cada lado, el <b>${pct(f30.bosque_sinia_pct, 0)}</b> tiene bosque oficial 2021${f30.arboles_esri_pct != null ? ` (ESRI 2024: ${pct(f30.arboles_esri_pct, 0)} con árboles)` : ''}.`} ${total > 0 ? `Hay ${hectares(total)} de franja de ${r.franja_referencia_m} m sin bosque.` : ''}</p>
      <div class="fi-two"><div><table class="fi-table"><thead><tr><th>Franja a cada lado</th><th>Superficie</th><th>Bosque SINIA 2021</th><th>Árboles ESRI 2024</th></tr></thead><tbody>${r.franjas.map((f) => `<tr><td>${f.ancho_m} m</td><td>${hectares(f.area_ha)}</td><td>${f.bosque_sinia_pct == null ? '—' : pct(f.bosque_sinia_pct)}</td><td>${f.arboles_esri_pct == null ? '—' : pct(f.arboles_esri_pct)}</td></tr>`).join('')}</tbody></table></div>
      <div><h3>Franja de ${r.franja_referencia_m} m sin bosque, por pendiente</h3>${bars(r.sin_bosque_por_pendiente.map((x) => ({ l: x.pendiente, v: x.area_ha, c: /≥ 30/.test(x.pendiente) ? '#c62828' : /15/.test(x.pendiente) ? '#f4a261' : '#ffd08a' })), (v) => hectares(v))}<p class="fi-note">Orillas sin bosque en pendientes fuertes son más susceptibles a erosión. Es una clasificación descriptiva, no un modelo de pérdida de suelo ni de caudal.</p></div></div>
      <p class="fi-note">${esc(r.nota)} ${f50 ? '' : ''}No se afirman efectos cuantitativos sobre caudal o calidad del agua sin modelación y validación adicionales.</p></section>`;
  }
  function seccionAlmanaque(t) {
    const feature = featureDe(t);
    const puntos = (st.territory.critical_points?.features || []).filter((p) => feature && RED && RED.puntoEnPoligono(p.geometry.coordinates, feature.geometry));
    const corr = t.corredores?.lista || [];
    const notas = new Map((st.territory.corridors?.features || []).map((f) => [f.properties.nombre, f.properties]));
    return `<section class="fi-sec"><h2>${icon('map', 22)} Corredores y puntos críticos · Almanaque Azul</h2>
      <p>${pct(t.corredores?.porcentaje, 1)} del territorio (${hectares(t.corredores?.area_ha)}) está dentro de corredores biológicos publicados en el Almanaque Azul${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}.${!corr.length && t.corredores?.distancia_mas_cercano_m ? ` El corredor más cercano está a ${number(t.corredores.distancia_mas_cercano_m / 1000, 1)} km.` : ''}</p>
      ${corr.length ? `<table class="fi-table"><thead><tr><th>Corredor</th><th>Categoría de conectividad</th><th>Superficie en la subcuenca</th><th>Condición media</th></tr></thead><tbody>${corr.map((c) => { const n = notas.get(c.nombre) || {}; return `<tr><td><i class="fi-dot" style="background:${COLOR_CORREDOR[c.categoria] || '#7fae00'}"></i>${esc(c.nombre)}</td><td>${esc(c.categoria || '—')}</td><td>${hectares(c.interseccion_ha)}</td><td>${n.cond_promedio == null ? '—' : number(n.cond_promedio, 1)}</td></tr>`; }).join('')}</tbody></table>` : ''}
      ${puntos.length ? `<h3>Puntos críticos dentro de la subcuenca</h3><ul class="fi-list">${puntos.map((p) => `<li>${esc(p.properties.notas || p.properties.nombre || 'Punto crítico')}</li>`).join('')}</ul>` : '<p class="fi-note">No hay puntos críticos del Almanaque Azul dentro de esta subcuenca.</p>'}
      <p class="fi-note">Fuente: Almanaque Azul (corredores de conectividad y puntos críticos). Las categorías y la condición son las publicadas por esa fuente; el geoportal no las modifica.</p></section>`;
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
        <div class="fi-legend"><span><i style="background:#1b5e20"></i>Parche clave (conectividad alta)</span><span><i style="background:#66bb6a"></i>Parche de importancia media</span><span><i style="background:#c5e1a5"></i>Parche de importancia baja</span><span><i class="dash"></i>Brecha candidata a reconexión</span><span><i style="background:#1f78b4;height:3px"></i>Ríos principales (HydroSHEDS)</span><span><i style="background:#1b5e2033;border:1.5px solid #1b5e20"></i>Corredor Almanaque Azul · conectividad alta</span><span><i style="background:#9ccc6533;border:1.5px solid #9ccc65"></i>· mediana</span><span><i style="background:#ffb74d33;border:1.5px solid #ffb74d"></i>· media-baja</span><span><i class="pt"></i>Punto crítico (Almanaque Azul)</span></div></section>
      <section class="fi-sec fi-gal-sec"><h2>${icon('layers', 22)} Mapas temáticos</h2><p class="fi-note">Cada mapa muestra una fuente distinta sobre el mismo territorio. Ríos y corredores del Almanaque Azul se superponen como referencia.</p>${seccionGaleria(t)}</section>
      <section class="fi-sec"><h2>${icon('chart', 22)} Indicadores y comparación con las demás subcuencas</h2><p class="fi-note">Verde: mejor que la mayoría de subcuencas; ámbar: intermedio; rojo: entre las más desfavorables. La comparación es relativa a la CHCP, no un umbral normativo.</p><div class="fi-inds">${indicadores}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('forest', 22)} Dinámica del bosque · JRC 2025</h2>${donut(jrc, hectares(t.area_ha, 0))}</div>
        <div><h2>${icon('trend', 22)} Evolución 2020–2025 (ha)</h2>${serie.length ? line(serie, [{ k: 'jrc_degradacion_ha', l: 'Degradado (JRC)', c: '#f28e2b' }, { k: 'jrc_regeneracion_ha', l: 'Regeneración (JRC)', c: '#3d8b37' }, { k: 'jrc_deforestacion_ha', l: 'Deforestado (JRC)', c: '#2f7ee0' }]) : ''}
        <h3>Pérdida anual Hansen</h3>${bars(serie.filter((x) => x.hansen_perdida_ha != null).map((x) => ({ l: String(x.anio), v: x.hansen_perdida_ha, c: '#d0442c' })), (v) => hectares(v))}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('layers', 22)} Cartografía oficial SINIA</h2>${bars((t.sinia || []).map((s) => ({ l: `Bosque ${s.year}`, v: s.forest_pct, c: '#237A4B' })), (v) => pct(v))}<p class="fi-note">Productos independientes con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.</p></div>
        <div><h2>${icon('forest', 22)} Árboles y altura del dosel</h2><ul class="fi-list"><li><b>ESRI 2017→2024:</b> ${hectares(t.esri?.esri_salida)} pasaron de árboles a otra clase y ${hectares(t.esri?.esri_ganancia)} de otra clase a árboles; ${hectares(t.esri?.esri_estable)} se mantuvieron con árboles.</li><li><b>Altura media del dosel (GEDI):</b> ${t.gedi_altura_m == null ? 'sin muestras suficientes' : `${number(t.gedi_altura_m, 1)} m`}. ${t.gedi_altura_m == null ? '' : t.gedi_altura_m >= 20 ? 'Dosel alto, típico de bosque maduro.' : t.gedi_altura_m >= 10 ? 'Dosel intermedio: bosque secundario o intervenido.' : 'Dosel bajo: vegetación joven, rastrojo o áreas abiertas.'}</li></ul></div></section>
      ${seccionNdvi(t)}
      ${seccionEri(t)}
      <section class="fi-sec"><h2>${icon('network', 22)} Fragmentación y conectividad · bosque oficial 2021</h2>
        ${e ? `<div class="fi-kv"><div><span>Parches</span><b>${number(e.metricas_clase.numero_parches, 0)}</b></div><div><span>Bosque</span><b>${hectares(e.metricas_clase.area_total_bosque_ha)}</b></div><div><span>Redes separadas</span><b>${number(e.metricas_red.numero_componentes, 0)}</b></div><div><span>Conexiones</span><b>${number(e.metricas_red.numero_aristas, 0)}</b></div><div><span>Aislados</span><b>${number(e.metricas_red.numero_parches_aislados, 0)}</b></div><div><span>Cohesión</span><b>${mp?.cohesion == null ? '—' : number(mp.cohesion, 1)}</b></div><div><span>IIC</span><b>${mp?.iic == null ? '—' : number(mp.iic, 4)}</b></div><div><span>Distancia entre parches</span><b>${mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`}</b></div></div>
        <h3>Bosque interior (área núcleo)</h3>${nucleoTabla}
        ${diic.length ? `<h3>Parches más importantes para la red (dIIC)</h3><table class="fi-table"><thead><tr><th>Parche</th><th>Superficie</th><th>Aporte a la conectividad</th><th>Función</th></tr></thead><tbody>${diic.map((x) => `<tr><td>#${x.parche_id}</td><td>${hectares(x.area_ha)}</td><td>${pct(x.diic_pct)}</td><td>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}</td></tr>`).join('')}</tbody></table><p class="fi-note">dIIC: cuánto bajaría el índice integral de conectividad si se perdiera el parche (Pascual-Hortal y Saura, 2006). Distancia umbral ${number(mp.umbral_m, 0)} m.</p>` : ''}` : '<p>Sin estructura calculada.</p>'}</section>
      ${seccionRiparia(t)}
      ${seccionAlmanaque(t)}
      <section class="fi-sec"><h2>${icon('leaf', 22)} Líneas de acción sugeridas</h2><div class="fi-actions">${acc.map((a) => `<div class="fi-action">${icon(a.i, 24)}<div><b>${esc(a.t)}</b><p><em>Por qué:</em> ${esc(a.why)}</p><p><em>Qué hacer:</em> ${esc(a.how)}</p>${a.sim && t.id !== 'chcp' ? `<p class="no-print"><a href="${window.CHCP_STATIC ? 'restauracion.html' : '/restauracion'}?id=${encodeURIComponent(t.id)}">Simular la restauración en esta subcuenca →</a></p>` : ''}</div></div>`).join('')}</div><p class="fi-note">Reglas transparentes sobre los indicadores de esta ficha. Orientan la revisión técnica; no sustituyen la verificación de campo ni constituyen una decisión de manejo.</p></section>
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
        <dt>IIC / dIIC</dt><dd>Índice de conectividad del paisaje y cuánto aporta cada parche a ella.</dd><dt>NDVI</dt><dd>Índice de vigor de la vegetación calculado con imágenes Sentinel-2.</dd><dt>ERI</dt><dd>Índice indicativo de resiliencia ecológica (0–100).</dd><dt>Franja riparia</dt><dd>Faja de terreno a cada lado de un río o quebrada.</dd><dt>Almanaque Azul</dt><dd>Atlas que publica los corredores de conectividad y puntos críticos usados como referencia.</dd><dt>Conectividad estructural</dt><dd>Basada en la disposición del bosque; no demuestra que la fauna se desplace.</dd></dl></section>
      <footer class="fi-foot">Geoportal CHCP · Datos: JRC TMF, Hansen GFC, ESRI LULC, Copernicus Sentinel-2, GEDI, SINIA–MiAMBIENTE, Almanaque Azul · Procesado en Google Earth Engine (proyecto ${esc(st.data.proyecto)}) · Preevaluación indicativa: no predice deforestación ni certifica cumplimiento.</footer>`;
    drawMap(t);
  }
  function referencias(map, puntos) {
    L.geoJSON(st.territory.corridors, { style: (f) => { const c = COLOR_CORREDOR[f.properties.categoria_etiqueta] || '#7fae00'; return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.14 }; }, onEachFeature: (f, l) => l.bindTooltip(`${f.properties.nombre} · conectividad ${f.properties.categoria_etiqueta} (Almanaque Azul)`) }).addTo(map);
    if (st.rios) L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 2, opacity: 0.9 }, interactive: false }).addTo(map);
    if (puntos) L.geoJSON(st.territory.critical_points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f04438', fillOpacity: 1 }), onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.notas || 'Punto crítico'), { maxWidth: 280 }) }).addTo(map);
  }
  function drawGallery(t) {
    st.galeria.forEach((m) => m.remove());
    st.galeria = [];
    const feature = featureDe(t);
    $$('.fi-mini').forEach((div) => {
      const m = L.map(div, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
      L.tileLayer(BASE_GRIS, { maxZoom: 16 }).addTo(m);
      L.imageOverlay(mapFile(t.id, `${div.dataset.capa}.png`), t.mapas.limites, { opacity: 0.9 }).addTo(m);
      referencias(m, false);
      const borde = L.geoJSON(feature, { style: { color: '#263238', weight: 1.6, fill: false }, interactive: false }).addTo(m);
      m.fitBounds(borde.getBounds(), { padding: [6, 6] });
      st.galeria.push(m);
    });
  }
  async function drawMap(t) {
    if (st.map) { st.map.remove(); st.map = null; }
    try { st.rios = t.mapas?.rios ? await (await fetch(mapFile(t.id, 'rios.json'))).json() : null; } catch (_) { st.rios = null; }
    drawGallery(t);
    const map = L.map('fi-map', { zoomControl: true, preferCanvas: false });
    st.map = map;
    L.tileLayer(BASE_SAT, { attribution: 'Esri World Imagery', maxZoom: 17, crossOrigin: true }).addTo(map);
    const feature = featureDe(t);
    const area = L.geoJSON(feature, { style: { color: '#ffffff', weight: 3, fill: false } }).addTo(map);
    referencias(map, true);
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
    const sim = $('#fi-sim');
    if (sim) { sim.hidden = id === 'chcp'; sim.href = `${sim.getAttribute('href').split('?')[0]}?id=${encodeURIComponent(id)}`; }
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
