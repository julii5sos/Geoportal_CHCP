/* Ficha técnica por subcuenca: diagnóstico integral, comprensible e imprimible.
   Usa solo los indicadores precalculados (data/estadisticas_territoriales.json) y las
   geometrías de cada subcuenca (data/subcuencas/<id>.json). Las líneas de acción son
   reglas transparentes sobre esos indicadores: orientan la revisión, no la reemplazan. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, mapFile } = window.CHCP;
  const RED = window.CHCP_RED;
  const COLOR_CORREDOR = { Alta: '#1b5e20', Mediana: '#9ccc65', 'Media-baja': '#ffb74d' };
  // Plataforma acercada a un parche de bosque (?parche=N).
  const enlaceParche = (id, parche) => `${window.CHCP_STATIC ? 'plataforma.html' : '/plataforma'}?id=${encodeURIComponent(id)}&tema=frag&parche=${parche}`;
  const featureDe = (t) => (t.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((f) => f.properties.id === t.id));
  const rip50 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 50);
  const rip30 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 30);
  const icon = window.CHCP_ICON || (() => '');
  const st = { data: null, territory: null, map: null, galeria: [], rios: null };
  const brechas = (e) => (e ? (e.brechas_potenciales ?? e.metricas_red?.numero_brechas_potenciales ?? 0) : 0);
  const pct = (v, d = 1) => (v == null ? '—' : `${number(v, d)} %`);
  const subs = () => Object.values(st.data.territorios).filter((t) => t && t.id !== 'chcp');
  const sinia = (t, y) => (t.sinia || []).find((p) => p.year === y);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  // Color de cada año en la rampa amarillo → rojo de Hansen GFC (2001 → 2025).
  const colorHansen = (anio) => `#ff${Math.round(255 * Math.max(0, Math.min(24, 2025 - anio)) / 24).toString(16).padStart(2, '0')}00`;
  const fechaLarga = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '—'; };

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
  /** Máximo «redondo» del eje (1, 2, 2,5 o 5 × 10ⁿ) por encima del dato, para que ninguna línea toque el borde. */
  function techo(v) {
    const n = 10 ** Math.floor(Math.log10(v)), f = v / n;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * n;
  }
  function line(series, keys) {
    // R deja una franja a la derecha para las cifras finales, fuera del área de las líneas.
    const W = 560, H = 190, L = 50, R = 92, T = 12, B = 24;
    const vals = series.flatMap((r) => keys.map((k) => r[k.k]).filter((v) => v != null));
    const max = techo(Math.max(1, ...vals) * 1.05);
    const x = (i) => L + i * (W - L - R) / Math.max(1, series.length - 1), y = (v) => T + (1 - v / max) * (H - T - B);
    // Decimales solo en territorios muy pequeños (menos de 10 ha en el gráfico).
    const dec = max < 10 ? 1 : 0;
    const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="g"/><text x="${L - 6}" y="${y(max * f) + 3}" text-anchor="end">${number(max * f, dec)}</text>`).join('');
    // Trazo oscuro fino debajo: los colores oficiales claros (p. ej., regeneración JRC) se ven sobre blanco.
    const ls = keys.map((k) => { const pts = series.map((r, i) => (r[k.k] == null ? '' : `${x(i)},${y(r[k.k])}`)).join(' '); return `<polyline fill="none" stroke="rgba(0,0,0,.22)" stroke-width="3.4" stroke-linejoin="round" points="${pts}"/><polyline fill="none" stroke="${k.c}" stroke-width="2.2" stroke-linejoin="round" points="${pts}"/>`; }).join('');
    // Cifra del último año de cada línea en la franja derecha; si dos quedan muy juntas se separan
    // y una guía fina las une con su línea, para que no se tapen ni se confundan.
    const ult = series.length - 1, xf = x(ult);
    const fin = keys.filter((k) => series[ult]?.[k.k] != null).map((k) => ({ k, v: series[ult][k.k], y0: y(series[ult][k.k]) })).sort((p1, p2) => p1.y0 - p2.y0);
    const SEP = 14, ymin = T + 4, ymax = H - B - 2;
    fin.forEach((e, i) => { e.y = Math.max(e.y0, i ? fin[i - 1].y + SEP : ymin); });
    for (let i = fin.length - 1; i >= 0; i -= 1) fin[i].y = Math.min(fin[i].y, i === fin.length - 1 ? ymax : fin[i + 1].y - SEP);
    const etiquetas = fin.map((e) => `<path d="M${xf + 2},${e.y0} L${xf + 10},${e.y}" class="guia"/><rect x="${xf + 12}" y="${e.y - 4.5}" width="9" height="9" rx="2" fill="${e.k.c}" stroke="rgba(0,0,0,.3)"/><text class="fin" x="${xf + 25}" y="${e.y + 4}">${number(e.v, dec)} ha</text>`).join('');
    const anios = series.map((r, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${r.anio}</text>`).join('');
    return `<svg class="fi-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución anual">${grid}${anios}${ls}${etiquetas}</svg><ul class="fi-keys">${keys.map((k) => `<li><i style="background:${k.c};outline:1px solid rgba(0,0,0,.25)"></i>${esc(k.l)}${series[ult]?.[k.k] == null ? '' : ` <b>${number(series[ult][k.k], dec)} ha en ${series[ult].anio}</b>`}</li>`).join('')}</ul>`;
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
    const pr = t.id === 'chcp' ? null : puesto(t, 'perdida_reciente_pct_anual');
    if (pr) frases.push(`<b>Frente a las demás subcuencas.</b> Por pérdida reciente en proporción a su bosque ocupa el puesto ${pr.pos} de ${pr.n}: ${tercio(pr)}. Esta comparación distingue mejor entre subcuencas que la prioridad, que en territorios extensos casi siempre es Alta.`);
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
  // Galería de mapas temáticos. Orden de la ficha ejecutiva: coberturas, estado y pérdida del
  // bosque, dosel, vigor, coincidencias; después los análisis del geoportal (red, ERI, riberas).
  // Tres tipos de mapa: «png» (precalculado con su leyenda), «valores» (raster de valores sin
  // pérdida, coloreado aquí con la leyenda oficial de la fuente) y «red» (parches vectoriales).
  const GEDI_PALETA = ['#ffffcc', '#c2e699', '#78c679', '#31a354', '#006837'];
  function figurasGaleria(t) {
    const capa = (k) => (t.mapas?.capas?.includes(k) ? (st.data.capas_mapa || []).find((c) => c.clave === k) : null);
    const val = (k) => Boolean(t.mapas?.valores?.includes(k));
    const serie = (k) => st.series?.territorios?.[t.id]?.mapas?.[k] && st.series?.productos?.[k];
    const png = (k) => { const c = capa(k); return c && { id: k, tipo: 'png', titulo: c.titulo, lectura: c.lectura, leyenda: leyendaCapa(c) }; };
    const figs = [];
    const ley = new Map((st.data.leyendas_valores?.sinia_2021_detalle || []).map((x) => [x.codigo, x]));
    if (val('sinia_2021_detalle') && ley.size) {
      figs.push({ id: 'sinia_det', tipo: 'valores', titulo: 'Cobertura y uso del suelo · SINIA 2021', archivo: mapFile(t.id, 'sinia_2021_detalle.v.png'), limites: t.mapas.limites,
        clases: [...ley.values()].map((x) => ({ valor: x.codigo, color: x.color, etiqueta: x.categoria.replace(/^Código \d+ · /, '').replace(/ \(informe oficial; sin verificar en la cuenca\)$/, '') })),
        lectura: 'Cartografía oficial de MiAMBIENTE (raster de 10 m) con sus colores. Los bosques de esta capa son la base de la fragmentación y la conectividad.' });
    } else if (capa('sinia_2021')) figs.push(png('sinia_2021'));
    const esri = st.series?.productos?.esri;
    if (val('esri_2024') && esri) {
      figs.push({ id: 'esri_2024', tipo: 'valores', titulo: 'Cobertura y uso del suelo 2024 · ESRI', archivo: mapFile(t.id, 'esri_2024.v.png'), limites: t.mapas.limites,
        clases: esri.clases, lectura: 'Clasificación automática de Sentinel-2 (10 m) con los colores de ESRI. «Árboles» no es la misma definición de bosque que SINIA o JRC.' });
    }
    if (capa('jrc_2025')) figs.push(png('jrc_2025'));
    if (serie('hansen')) {
      const p = st.series.productos.hansen;
      figs.push({ id: 'hansen_todo', tipo: 'valores', titulo: 'Pérdida de cobertura arbórea 2001–2025 · Hansen GFC', archivo: window.CHCP.serieFile(`mapas/${t.id}/hansen.v.png`), limites: st.series.territorios[t.id].mapas.hansen.limites,
        clases: p.clases, rampa: { colores: [p.clases[0].color, p.clases[p.clases.length - 1].color], etiquetas: ['2001', '2025'] },
        lectura: 'Año de la pérdida (30 m). Solo la pérdida de 2021–2025 cuenta para la preevaluación. Incluye cosecha de plantaciones; no indica la causa.' });
    } else if (capa('hansen')) figs.push(png('hansen'));
    if (capa('esri_cambio')) figs.push(png('esri_cambio'));
    const codGedi = st.data.codificacion_valores?.gedi;
    if (val('gedi') && codGedi) {
      figs.push({ id: 'gedi', tipo: 'valores', titulo: 'Altura del dosel · GEDI', archivo: mapFile(t.id, 'gedi.v.png'), limites: t.mapas.limites,
        continuo: { minimo: 0, maximo: 30, paleta: GEDI_PALETA, codec: codGedi }, rampa: { colores: GEDI_PALETA, etiquetas: ['0 m', '15 m', '≥ 30 m'] },
        lectura: 'Altura del dosel estimada con el láser GEDI (NASA). Las zonas sin huellas válidas quedan sin color.' });
    }
    if (serie('ndvi')) {
      const p = st.series.productos.ndvi, anio = Math.max(...p.anios);
      figs.push({ id: 'ndvi_anio', tipo: 'valores', titulo: `Vigor de la vegetación ${anio} · NDVI Sentinel-2`, archivo: window.CHCP.serieFile(`mapas/${t.id}/ndvi_${anio}.v.png`), limites: st.series.territorios[t.id].mapas.ndvi.limites,
        clases: p.clases, lectura: 'Mediana anual sin nubes, con la escala de colores NDVI de Copernicus Browser. Describe vigor, no tipo de cobertura.' });
    }
    if (capa('ndvi_cambio')) figs.push(png('ndvi_cambio'));
    if (capa('coincidencia')) figs.push(png('coincidencia'));
    if (t.id !== 'chcp') figs.push({ id: 'red', tipo: 'red', titulo: 'Parches de bosque y red de conectividad', leyenda: '<div class="fi-legend"><span><i style="background:#1b5e20"></i>Importancia alta</span><span><i style="background:#66bb6a"></i>Media</span><span><i style="background:#c5e1a5"></i>Baja</span><span><i class="dash"></i>Brecha candidata</span></div>',
      lectura: 'Bosque oficial 2021 en parches, según su aporte a la conectividad (dIIC), y las brechas que convendría cerrar.' });
    figs.push({ id: 'corredores', tipo: 'corredores', titulo: 'Corredores y puntos críticos · Almanaque Azul',
      leyenda: '<div class="fi-legend"><span><i style="background:#1b5e2059;border:1.5px solid #1b5e20"></i>Conectividad alta</span><span><i style="background:#9ccc6559;border:1.5px solid #9ccc65"></i>Mediana</span><span><i style="background:#ffb74d59;border:1.5px solid #ffb74d"></i>Media-baja</span><span><i style="background:#ce93d866;border:1.5px solid #4a148c"></i>Corredor Biológico Mesoamericano</span><span><i class="pt"></i>Punto crítico</span></div>',
      lectura: 'Corredores de conectividad y puntos críticos publicados en el Almanaque Azul (2024), con el Corredor Biológico Mesoamericano resaltado. Es la referencia que usa la prioridad de visita.' });
    if (capa('eri')) {
      const f = png('eri');
      // Subcuencas sin mapa ERI propio: recorte del mapa ERI de toda la cuenca (mismo modelo, malla más gruesa).
      if (t.mapas.eri_origen === 'cuenca') f.lectura += ` Este mapa es un recorte del ERI calculado para toda la cuenca (píxel de ${number(t.mapas.eri_tamano_pixel_m || 43, 0)} m): los colores pueden diferir algo del mapa propio de la subcuenca, que se generará más adelante. El valor ERI de la ficha sí se calculó para esta subcuenca.`;
      figs.push(f);
    }
    if (capa('riparia')) figs.push(png('riparia'));
    return figs.filter(Boolean);
  }
  function leyendaFigura(f) {
    if (f.leyenda) return f.leyenda;
    if (f.rampa) return `<div class="fi-ramp"><i style="background:linear-gradient(90deg,${f.rampa.colores.join(',')})"></i><span>${f.rampa.etiquetas.map((x) => `<em>${esc(x)}</em>`).join('')}</span></div>`;
    return '<div class="fi-legend" data-presentes></div>';  // se llena con las clases presentes al dibujar
  }
  function seccionGaleria(t) {
    const figs = figurasGaleria(t);
    if (!figs.length) return `<p class="fi-pending">Los mapas temáticos se generan ${window.CHCP.pendiente()}.</p>`;
    st.figuras = figs;
    return `<div class="fi-gal">${figs.map((f) => `<figure class="fi-fig" data-fig="${f.id}"><figcaption>${esc(f.titulo)}</figcaption><div class="fi-mini" data-fig="${f.id}"></div>${leyendaFigura(f)}<p class="fi-note">${esc(f.lectura)}</p></figure>`).join('')}</div>${t.mapas?.tamano_pixel_m ? `<p class="fi-note">Resolución de los mapas: ${number(t.mapas.tamano_pixel_m, 0)} m por píxel. Los cálculos de superficie usan la resolución nativa de cada fuente.</p>` : ''}`;
  }
  function seccionNdvi(t) {
    const n = t.ndvi;
    if (!n || n.ndvi_inicial_medio == null) return '';
    const d = n.ndvi_delta_medio ?? (n.ndvi_final_medio - n.ndvi_inicial_medio);
    const lectura = d <= -0.05 ? 'El vigor medio de la vegetación disminuyó de forma apreciable.' : d >= 0.05 ? 'El vigor medio de la vegetación aumentó.' : 'El vigor medio se mantuvo prácticamente estable.';
    const parte = t.area_ha ? n.ndvi_disminucion / t.area_ha * 100 : null;
    return `<section class="fi-sec fi-two" id="fi-vigor"><div><h2>${icon('trend', 22)} Vigor de la vegetación · NDVI Sentinel-2</h2>
      ${bars([{ l: 'NDVI 2020', v: n.ndvi_inicial_medio, c: '#a6d96a' }, { l: 'NDVI 2025', v: n.ndvi_final_medio, c: d < 0 ? '#d8b365' : '#1a9850' }], (v) => number(v, 2))}
      <p><b>${lectura}</b> Cambio medio ${d > 0 ? '+' : ''}${number(d, 3)}. ${hectares(n.ndvi_disminucion)}${parte == null ? '' : ` (${pct(parte, 1)} del territorio)`} tuvieron un descenso fuerte (≥ 0.15) partiendo de vegetación vigorosa.</p></div>
      <div><h3>Cómo leer el NDVI</h3><ul class="fi-list"><li>Va de −1 a 1; la vegetación densa y sana suele estar entre 0.6 y 0.9.</li><li>Es la quinta fuente del índice de preevaluación (peso 0.5): solo suma cuando el descenso es extenso.</li><li>Un descenso aislado no prueba deforestación: puede ser cosecha, sequía, quema o nubes residuales. Por eso se contrasta con JRC, Hansen y ESRI en el mapa de señales coincidentes.</li></ul></div></section>`;
  }
  function seccionEri(t) {
    const e = t.eri;
    const nombres = { integridad_estructural: 'Integridad estructural (35 %)', conectividad: 'Conectividad local (25 %)', estabilidad_topografica: 'Estabilidad del relieve (20 %)', proximidad_riparia: 'Cercanía a ríos (20 %)' };
    if (!e?.componentes) return `<section class="fi-sec"><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2><p class="fi-pending">${e?.lectura && /No calculado/.test(e.lectura) ? esc(e.lectura) : `El ERI por subcuenca se incorpora ${window.CHCP.pendiente()}.`}</p></section>`;
    const dist = (e.distribucion_clases || []).filter((x) => x.area_ha > 0);
    return `<section class="fi-sec fi-two"><div><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2>
      <div class="fi-eri"><b style="background:${e.color || '#76b72a'}">${number(e.valor * 100, 0)}</b><div><strong>${esc(e.clase)}</strong><p>${esc(e.lectura || '')}</p></div></div>
      ${bars(Object.entries(e.componentes).map(([k, v]) => ({ l: nombres[k] || k, v: v * 100, c: k === Object.entries(e.componentes).sort((a, b) => a[1] - b[1])[0][0] ? '#f28e2b' : '#76b72a' })), (v) => `${number(v, 0)}/100`)}
      <p class="fi-note">En naranja, el componente más débil. Índice indicativo (Dynamic World, GEDI, Copernicus DEM y MERIT Hydro); no modifica la preevaluación.</p></div>
      <div>${dist.length ? `<h3>Superficie por clase de resiliencia</h3>${donut(dist.map((x) => ({ l: x.clase, v: x.area_ha, c: x.color })), 'ERI')}` : ''}<h3>Qué significa</h3><p>El ERI resume la capacidad del paisaje para mantener y recuperar sus funciones: dosel alto y denso, bosque cercano alrededor, laderas con cobertura y vegetación junto a los ríos. Un valor bajo señala dónde la restauración aportaría más estabilidad.</p></div></section>`;
  }
  function seccionRiparia(t) {
    const r = t.riparia;
    if (!r || r.error || !r.franjas) return `<section class="fi-sec"><h2>${icon('sprout', 22)} Ríos y franjas riparias</h2><p class="fi-pending">${r?.error ? 'El análisis ripario no pudo calcularse en la última actualización.' : `El análisis de bosque junto a los ríos se incorpora ${window.CHCP.pendiente()}.`}</p></section>`;
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

  /** Puesto de una subcuenca entre las demás para un indicador (1 = mayor intensidad). */
  function puesto(t, k) {
    const vals = subs().map((x) => x.indicadores_relativos?.valores?.[k]).filter((v) => v != null);
    const v = t.indicadores_relativos?.valores?.[k];
    if (v == null || !vals.length) return null;
    return { pos: 1 + vals.filter((x) => x > v).length, n: vals.length };
  }
  const tercio = (r) => (r.pos <= r.n / 3 ? 'entre las de mayor intensidad' : r.pos > (2 * r.n) / 3 ? 'entre las de menor intensidad' : 'en el grupo intermedio');
  function seccionRelativa(t) {
    const b = t.indicadores_relativos;
    if (!b || !b.valores || t.id === 'chcp') return '';
    const nombres = { perdida_reciente_pct_anual: ['Pérdida reciente de cobertura arbórea', '% del bosque por año', 'Hansen 2021–2025 ÷ bosque oficial 2021 ÷ 5'], salida_arboles_pct: ['Salida de árboles', '% de los árboles de 2017', 'ESRI 2017 → 2024'], perturbacion_acumulada_pct: ['Perturbación acumulada (legado)', '% del territorio', 'JRC deforestado + degradado desde 1990'], descenso_vigor_pct: ['Descenso fuerte de vigor', '% del territorio', 'NDVI 2020 → 2025'] };
    const filas = Object.entries(nombres).map(([k, [n, u, f]]) => { const v = b.valores[k], r = b.razon_vs_cuenca?.[k], c = b.valores_cuenca?.[k], ps = puesto(t, k); return `<tr><td><b>${n}</b><small>${f}</small></td><td>${v == null ? '—' : number(v, 2)} <small>${u}</small></td><td>${ps ? `<b>${ps.pos}</b> de ${ps.n}` : '—'}</td><td>${c == null ? '—' : number(c, 2)}</td><td>${r == null ? '—' : `<span class="rel-${r > 1.5 ? 'alto' : r < 0.67 ? 'bajo' : 'medio'}">${number(r, r < 1 ? 2 : 1)} ×</span>`}</td></tr>`; }).join('');
    const alta = subs().filter((x) => x.preevaluacion?.prioridad === 'Alta').length, total = subs().length;
    const pr = puesto(t, 'perdida_reciente_pct_anual');
    const titular = pr ? `<p class="fi-rel-tit">Por pérdida reciente relativa al bosque, ${esc(t.nombre)} ocupa el <b>puesto ${pr.pos} de ${pr.n}</b> subcuencas: ${tercio(pr)}.</p>` : '';
    return `<section class="fi-sec" id="fi-relativa"><h2>${icon('chart', 22)} Intensidad del cambio frente a las demás subcuencas <span class="exp-tag">experimental</span></h2>
      ${titular}
      <p>La preevaluación MT-2026.7 usa umbrales absolutos pensados para predios (por ejemplo, 0,18 ha de pérdida Hansen); en subcuencas de miles de hectáreas casi siempre se activa (${alta} de ${total} quedan en prioridad Alta). Para comparar subcuencas entre sí, estos indicadores expresan el cambio <b>en proporción</b> al bosque o al territorio y ordenan las ${total} subcuencas de mayor a menor intensidad.</p>
      <table class="fi-table"><thead><tr><th>Indicador</th><th>Esta subcuenca</th><th>Puesto (1 = mayor)</th><th>CHCP completa</th><th>Frente a la CHCP</th></tr></thead><tbody>${filas}</tbody></table>
      <p class="fi-note">${esc(b.version)}. El puesto es una posición relativa entre las subcuencas, no una categoría de prioridad: no hay umbrales ecológicos calibrados para convertirlo en «alta» o «baja», y no reemplaza MT-2026.7. Los indicadores no se suman entre sí porque JRC y Hansen comparten imágenes Landsat.</p></section>`;
  }

  // ------------------------------------------------------------ render
  function render(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, serie = t.serie_anual || [];
    const toneP = { Alta: 'bad', Media: 'mid', Preventiva: 'mid', Baja: 'good' }[p.prioridad] || 'na';
    const indicadores = IND.map((ind) => { const v = ind.get(t), r = rank(ind, t); return `<div class="fi-ind" data-tone="${tone(r)}"><span>${esc(ind.label)}</span><b>${fmt(ind, v)}</b><small>${r ? `Más favorable que el ${number(r.good, 0)} % de las ${r.n} subcuencas` : (window.CHCP.pendiente().includes('en curso') ? 'Se está calculando' : 'Se calculará en la próxima actualización')}</small><p>${esc(ind.lee)}</p></div>`; }).join('');
    // Colores oficiales de JRC TMF; «Otra cobertura» es blanca en JRC y aquí va en gris muy claro para verse sobre fondo blanco.
    const jrc = [{ l: 'Bosque estable', v: t.jrc_ha.tmf_estable, c: '#005a00' }, { l: 'Degradado', v: t.jrc_ha.tmf_degradacion, c: '#649b23' }, { l: 'Deforestado', v: t.jrc_ha.tmf_deforestacion, c: '#ff870f' }, { l: 'Regeneración', v: t.jrc_ha.tmf_recuperacion, c: '#d2fa3c' }, { l: 'Agua', v: t.jrc_ha.tmf_agua, c: '#008cbe' }, { l: 'Otra cobertura', v: t.jrc_ha.tmf_otra_cobertura, c: '#ececec' }];
    const nucleoTabla = mp && !mp.error ? `<table class="fi-table"><thead><tr><th>Profundidad de borde</th><th>Bosque interior</th><th>% del bosque</th><th>Parches sin interior</th></tr></thead><tbody>${mp.area_nucleo.por_profundidad.map((x) => `<tr><td>${number(x.profundidad_m, 0)} m</td><td>${hectares(x.area_nucleo_ha)}</td><td>${pct(x.porcentaje_bosque_nucleo)}</td><td>${number(x.parches_sin_nucleo, 0)}</td></tr>`).join('')}</tbody></table><p class="fi-note">Sensibilidad: el bosque interior depende de la profundidad de borde elegida; 100 m es una referencia de análisis, no un valor comprobado para una especie.</p>` : `<p class="fi-note">Área núcleo, distancia entre parches, cohesión e IIC se incorporan ${window.CHCP.pendiente()}.</p>`;
    const diic = (mp?.diic_principales || []).slice(0, 6);
    const acc = acciones(t);
    $('#fi-doc').innerHTML = `
      <header class="fi-head">
        <img class="fi-logo" src="${window.CHCP_STATIC ? 'static' : '/static'}/img/emblema.svg" alt="Geoportal CHCP" width="64" height="64">
        <div class="fi-head-txt"><span class="fi-kicker">Ficha técnica</span><h1>${esc(t.nombre)}</h1>
        <dl class="fi-meta">${t.id === 'chcp' ? '' : `<div><dt>Forma parte de</dt><dd>${esc(t.grupo)}</dd></div>`}<div><dt>Superficie</dt><dd>${hectares(t.area_ha)}</dd></div><div><dt>Datos del</dt><dd>${esc(fechaLarga(st.data.generado))}</dd></div><div><dt>Método</dt><dd>${esc(String(st.data.metodologia || '').split('-').slice(0, 2).join('-'))}</dd></div><div><dt>Proyecto</dt><dd>Clúster Copernicus Centroamérica AFOLU II</dd></div></dl>${window.CHCP.procedencia(st.data, 'B', t)}</div>
        <div class="fi-score" data-tone="${toneP}"><span>Preevaluación</span><b>${number(p.puntaje, 1)}<small>/ ${number(p.puntaje_maximo, 1)}</small></b><em>${esc(p.prioridad)}</em><small>Visita: ${esc(p.prioridad_visita || '—')}</small>${((r) => (r ? `<a class="fi-score-rel" href="#fi-relativa">Puesto ${r.pos} de ${r.n} en pérdida reciente</a>` : ''))(t.id === 'chcp' ? null : puesto(t, 'perdida_reciente_pct_anual'))}</div>
      </header>
      <section class="fi-sec"><h2>${icon('info', 22)} En pocas palabras</h2>${diagnostico(t).map((f) => `<p>${f}</p>`).join('')}</section>
      <section class="fi-sec fi-map-sec"><h2>${icon('map', 22)} ${t.id === 'chcp' ? 'Mapa de la cuenca' : 'Mapa de la subcuenca'}</h2><div id="fi-map"></div><p class="fi-pending" id="fi-map-nota" hidden></p>
        <div class="fi-legend"><span><i style="background:#1b5e20"></i>Parche clave (conectividad alta)</span><span><i style="background:#66bb6a"></i>Parche de importancia media</span><span><i style="background:#c5e1a5"></i>Parche de importancia baja</span><span><i class="dash"></i>Brecha candidata a reconexión</span>${t.id === 'chcp' ? '' : `<span><i style="background:#1f78b4;height:3px"></i>Ríos (${esc(t.mapas?.rios_fuente || 'IGNTG 2022 · hidrografía 1:25 000')})</span>`}</div></section>
      <section class="fi-sec fi-gal-sec"><h2>${icon('layers', 22)} Mapas temáticos</h2><p class="fi-note">Cada mapa muestra una fuente distinta sobre el mismo territorio, con los colores que usa cada fuente. Los ríos están en el mapa de la subcuenca y los corredores del Almanaque Azul tienen su propio mapa. El mapa base se cambia con el selector del mapa de arriba.</p>${seccionGaleria(t)}</section>
      <section class="fi-sec" id="fi-indicadores"><h2>${icon('chart', 22)} Indicadores y comparación con las demás subcuencas</h2><p class="fi-note">Verde: mejor que la mayoría de subcuencas; ámbar: intermedio; rojo: entre las más desfavorables. La comparación es relativa a la CHCP, no un umbral normativo.</p><div class="fi-inds">${indicadores}</div></section>
      ${seccionRelativa(t)}
      <section class="fi-sec fi-two fi-dinamica"><div><h2>${icon('forest', 22)} Estado del bosque en 2025 · JRC</h2>${donut(jrc, hectares(t.area_ha, 0))}
        <h3>Pérdida de cobertura arbórea por año · Hansen</h3>${bars(serie.filter((x) => x.hansen_perdida_ha != null).map((x) => ({ l: String(x.anio), v: x.hansen_perdida_ha, c: colorHansen(x.anio) })), (v) => hectares(v))}</div>
        <div><h2>${icon('trend', 22)} Evolución 2020–2025 · JRC (ha)</h2>${serie.length ? line(serie, [{ k: 'jrc_degradacion_ha', l: 'Degradado', c: '#649b23' }, { k: 'jrc_regeneracion_ha', l: 'Regeneración', c: '#d2fa3c' }, { k: 'jrc_deforestacion_ha', l: 'Deforestado', c: '#ff870f' }]) : '<p class="fi-pending">Sin serie anual para este territorio.</p>'}
        ${serie.length ? '<p class="fi-note">Superficie en cada estado al cierre de cada año. JRC acumula: un píxel deforestado en 2010 sigue contando como deforestado en 2025, por eso las líneas cambian poco. Lo nuevo de cada año se ve mejor en la pérdida anual de Hansen.</p>' : ''}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('layers', 22)} Cartografía oficial SINIA</h2>${bars((t.sinia || []).map((s) => ({ l: `Bosque ${s.year}`, v: s.forest_pct, c: '#237A4B' })), (v) => pct(v))}<p class="fi-note">Productos independientes con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.</p></div>
        <div><h2>${icon('forest', 22)} Árboles y altura del dosel</h2><ul class="fi-list"><li><b>ESRI 2017→2024:</b> ${hectares(t.esri?.esri_salida)} pasaron de árboles a otra clase y ${hectares(t.esri?.esri_ganancia)} de otra clase a árboles; ${hectares(t.esri?.esri_estable)} se mantuvieron con árboles.</li><li><b>Altura media del dosel (GEDI):</b> ${t.gedi_altura_m == null ? 'sin muestras suficientes' : `${number(t.gedi_altura_m, 1)} m`}. ${t.gedi_altura_m == null ? '' : t.gedi_altura_m >= 20 ? 'Dosel alto, típico de bosque maduro.' : t.gedi_altura_m >= 10 ? 'Dosel intermedio: bosque secundario o intervenido.' : 'Dosel bajo: vegetación joven, rastrojo o áreas abiertas.'}</li></ul></div></section>
      ${seccionNdvi(t)}
      ${seccionEri(t)}
      <section class="fi-sec" id="fi-estructura"><h2>${icon('network', 22)} Fragmentación y conectividad · bosque oficial 2021</h2>
        ${e ? `<div class="fi-kv"><div><span>Parches</span><b>${number(e.metricas_clase.numero_parches, 0)}</b></div><div><span>Bosque</span><b>${hectares(e.metricas_clase.area_total_bosque_ha)}</b></div><div><span>Redes separadas</span><b>${number(e.metricas_red.numero_componentes, 0)}</b></div><div><span>Conexiones</span><b>${number(e.metricas_red.numero_aristas, 0)}</b></div><div><span>Aislados</span><b>${number(e.metricas_red.numero_parches_aislados, 0)}</b></div><div><span>Cohesión</span><b>${mp?.cohesion == null ? '—' : number(mp.cohesion, 1)}</b></div><div><span>IIC</span><b>${mp?.iic == null ? '—' : number(mp.iic, 4)}</b></div><div><span>Distancia entre parches</span><b>${mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`}</b></div></div>
        <h3>Bosque interior (área núcleo)</h3>${nucleoTabla}
        ${diic.length ? `<h3>Parches más importantes para la red (dIIC)</h3><table class="fi-table" id="fi-diic-tabla"><thead><tr><th>Parche</th><th>Superficie</th><th>Aporte a la conectividad</th><th>Función</th></tr></thead><tbody>${diic.map((x) => `<tr><td><a href="${enlaceParche(t.id, x.parche_id)}" title="Ver el parche en la Plataforma">#${x.parche_id}</a></td><td>${hectares(x.area_ha)}</td><td>${pct(x.diic_pct)}</td><td>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}</td></tr>`).join('')}</tbody></table><p class="fi-note">dIIC: cuánto bajaría el índice integral de conectividad si se perdiera el parche (Pascual-Hortal y Saura, 2006). Distancia umbral ${number(mp.umbral_m, 0)} m.</p>
        <h3>Dónde están estos parches</h3><div id="fi-diic-map" class="fi-diic-map"></div><p class="fi-note no-print">Los parches resaltados son los de la tabla. Haga clic en uno (o en su número en la tabla) para abrirlo en la Plataforma y acercarse.</p>` : ''}` : '<p>Sin estructura calculada.</p>'}</section>
      ${seccionRiparia(t)}
      ${seccionAlmanaque(t)}
      <section class="fi-sec"><h2>${icon('leaf', 22)} Líneas de acción sugeridas</h2><div class="fi-actions">${acc.map((a) => `<div class="fi-action">${icon(a.i, 24)}<div><b>${esc(a.t)}</b><p><em>Por qué:</em> ${esc(a.why)}</p><p><em>Qué hacer:</em> ${esc(a.how)}</p>${a.sim && t.id !== 'chcp' ? `<p class="no-print"><a href="${window.CHCP_STATIC ? 'restauracion.html' : '/restauracion'}?id=${encodeURIComponent(t.id)}">Simular la restauración en esta subcuenca →</a></p>` : ''}</div></div>`).join('')}</div>${(t.sitios || []).length ? `<h3>Sitios priorizados para verificación de campo</h3><table class="fi-table"><thead><tr><th>Sitio</th><th>Coordenadas</th><th>Superficie con señal</th><th>Fuentes que coinciden</th></tr></thead><tbody>${t.sitios.slice(0, 6).map((x) => `<tr><td>${esc(x.id)}</td><td>${number(x.lat, 5)}, ${number(x.lon, 5)}</td><td>${hectares(x.area_ha)}</td><td>${x.fuentes}</td></tr>`).join('')}</tbody></table><p class="no-print"><a href="${window.CHCP_STATIC ? 'campo.html' : '/campo'}?id=${encodeURIComponent(t.id)}">Ver estado y registrar visitas →</a></p>` : ''}
      <p class="fi-note">Reglas transparentes sobre los indicadores de esta ficha. Orientan la revisión técnica; no sustituyen la verificación de campo ni constituyen una decisión de manejo.</p></section>
      <section class="fi-sec"><h2>${icon('warning', 22)} Confiabilidad e incertidumbre</h2>
        <p><b>Concordancia de fuentes:</b> ${esc(p.consistencia || '—')}. ${(p.fuentes_deterioro || []).length >= 2 ? 'Dos o más fuentes coinciden en señales de deterioro, lo que aumenta la confianza, aunque JRC y Hansen comparten imágenes Landsat y no son totalmente independientes.' : (p.fuentes_deterioro || []).length === 1 ? 'Solo una fuente muestra deterioro: la señal debe verificarse.' : 'Ninguna fuente muestra deterioro significativo.'}</p>
        <table class="fi-table"><thead><tr><th>Fuente</th><th>Qué mide</th><th>Limitación principal</th></tr></thead><tbody>
          <tr><td>JRC TMF</td><td>Estado anual del bosque húmedo (30 m, Landsat)</td><td>Clases acumuladas; bosques secos o abiertos pueden quedar fuera.</td></tr>
          <tr><td>Hansen GFC</td><td>Pérdida de cobertura arbórea por año (30 m)</td><td>No distingue bosque natural de plantación ni la causa.</td></tr>
          <tr><td>ESRI LULC</td><td>Clase «árboles» anual (10 m, Sentinel-2)</td><td>Clasificación automática; errores en bordes y mosaicos agrícolas.</td></tr>
          <tr><td>NDVI Sentinel-2</td><td>Vigor de la vegetación</td><td>Sensible a nubes, fenología y sequía; no equivale a pérdida de bosque.</td></tr>
          <tr><td>GEDI</td><td>Altura del dosel por láser</td><td>Muestreo por huellas, no cobertura continua.</td></tr>
          <tr><td>SINIA–MiAMBIENTE</td><td>Cartografía oficial (2019, 2021, 2023)</td><td>Escalas y métodos distintos entre años.</td></tr></tbody></table>
        <p class="fi-note"><b>Exactitud (preliminar, toda la cuenca):</b> con 498 puntos interpretados a ciegas (Olofsson et al., 2014), lo que el mapa llama bosque es bosque en el 95 % de los casos. La alerta de pérdida 2021–2025 por coincidencia de fuentes es conservadora (4 de cada 10 alertas se confirman en imágenes de 10 m y deja pasar cambios pequeños): la pérdida de esta subcuenca puede ser mayor que la mapeada y conviene verificarla en campo. Falta la revisión de un segundo intérprete. Detalle en Metodología.</p></section>
      <section class="fi-sec fi-gloss"><h2>${icon('doc', 22)} Glosario breve</h2><dl>
        <dt>Parche</dt><dd>Área continua de bosque.</dd><dt>Borde</dt><dd>Límite entre bosque y otra cobertura; el bosque cercano al borde recibe más perturbaciones.</dd>
        <dt>Bosque interior (núcleo)</dt><dd>Bosque a más de cierta distancia de cualquier borde.</dd><dt>Red / componente</dt><dd>Grupo de parches suficientemente cercanos para considerarse conectados.</dd>
        <dt>IIC / dIIC</dt><dd>Índice de conectividad del paisaje y cuánto aporta cada parche a ella.</dd><dt>NDVI</dt><dd>Índice de vigor de la vegetación calculado con imágenes Sentinel-2.</dd><dt>ERI</dt><dd>Índice indicativo de resiliencia ecológica (0–100).</dd><dt>Franja riparia</dt><dd>Faja de terreno a cada lado de un río o quebrada.</dd><dt>Almanaque Azul</dt><dd>Atlas que publica los corredores de conectividad y puntos críticos usados como referencia.</dd><dt>Conectividad estructural</dt><dd>Basada en la disposición del bosque; no demuestra que la fauna se desplace.</dd></dl></section>
      <footer class="fi-foot">Geoportal CHCP · Datos: JRC TMF, Hansen GFC, ESRI LULC, Copernicus Sentinel-2, GEDI, SINIA–MiAMBIENTE, Almanaque Azul · Procesado en Google Earth Engine (proyecto ${esc(st.data.proyecto)}) · Preevaluación indicativa: no predice deforestación ni certifica cumplimiento.</footer>`;
    drawMap(t);
    if (location.hash && /^#fi-/.test(location.hash)) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  }
  // Los corredores del Almanaque Azul tienen su propio mapa en la galería; en los demás mapas no se
  // superponen para no tapar la capa de cada fuente.
  function referencias(map, puntos, conRios = true, conCorredores = false) {
    if (conCorredores) L.geoJSON(st.territory.corridors, { style: (f) => { const c = COLOR_CORREDOR[f.properties.categoria_etiqueta] || '#7fae00'; return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.14 }; }, onEachFeature: (f, l) => l.bindTooltip(`${f.properties.nombre} · conectividad ${f.properties.categoria_etiqueta} (Almanaque Azul)`) }).addTo(map);
    if (conRios && st.rios) L.geoJSON(st.rios, { style: { color: '#1f78b4', weight: 1, opacity: 0.85 }, onEachFeature: (f, l) => l.bindTooltip(esc(((f) => [f.properties.nombre || `${f.properties.tipo || 'Cauce'} sin nombre en la cartografía`, f.properties.nombre_alt && `(${f.properties.nombre_alt})`, f.properties.tributario_de && `· afluente del ${f.properties.tributario_de}`].filter(Boolean).join(' '))(f)), { sticky: true }) }).addTo(map);
    if (puntos) L.geoJSON(st.territory.critical_points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f04438', fillOpacity: 1 }), onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.notas || 'Punto crítico'), { maxWidth: 280 }) }).addTo(map);
  }
  /** Tirador en el borde inferior para agrandar o achicar el mapa (se recuerda). */
  function altoAjustable(div, map, clave) {
    window.CHCP.divisor({ panel: div, borde: 'inferior', clave, min: 260, max: 1400,
      aplicar: (h) => { div.style.height = h ? `${h}px` : ''; }, alCambiar: () => map.invalidateSize() });
  }
  function cargarImagen(url) {
    return new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error(url)); im.src = url; });
  }
  async function valoresDe(url) {
    const im = await cargarImagen(url);
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data, v = new Uint8Array(c.width * c.height);
    for (let i = 0; i < v.length; i += 1) v[i] = d[i * 4];
    return { v, w: c.width, h: c.height };
  }
  const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  /** Colorea un raster de valores (255 = sin dato) y devuelve la imagen y las clases presentes. */
  function colorearValores(b, f) {
    const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(b.w, b.h), presentes = new Set();
    let color;
    if (f.continuo) {
      const pal = f.continuo.paleta.map(hexRgb), { minimo, maximo, codec } = f.continuo;
      color = (q) => { const x = Math.max(0, Math.min(1, ((codec.minimo + q * codec.paso) - minimo) / (maximo - minimo))) * (pal.length - 1); const i = Math.min(pal.length - 2, Math.floor(x)), r = x - i; return pal[i].map((a, k) => Math.round(a + (pal[i + 1][k] - a) * r)); };
    } else {
      const m = new Map(f.clases.map((x) => [x.valor, hexRgb(x.color)]));
      color = (q) => { const col = m.get(q); if (col) presentes.add(q); return col; };
    }
    for (let i = 0; i < b.v.length; i += 1) {
      const q = b.v[i];
      if (q === 255) continue;
      const col = color(q);
      if (!col) continue;
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 235;
    }
    ctx.putImageData(img, 0, 0);
    return { url: c.toDataURL(), presentes };
  }
  function drawGallery(t) {
    st.galeria.forEach((m) => m.remove());
    st.galeria = [];
    const feature = featureDe(t);
    const porId = new Map((st.figuras || []).map((f) => [f.id, f]));
    $$('.fi-mini').forEach((div) => {
      const f = porId.get(div.dataset.fig);
      if (!f) return;
      // zoomSnap fino: el territorio llena el recuadro en vez de quedar en el nivel entero anterior.
      const m = L.map(div, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.1 });
      window.CHCP.mapaBase(m, { defecto: 'gris', control: false });
      if (f.tipo === 'png') L.imageOverlay(mapFile(t.id, `${f.id}.png`), t.mapas.limites, { opacity: 0.9 }).addTo(m);
      if (f.tipo === 'valores') {
        valoresDe(f.archivo).then((b) => {
          const r = colorearValores(b, f);
          L.imageOverlay(r.url, f.limites, { opacity: 0.95, className: 'fi-px' }).addTo(m);
          const caja = div.parentElement.querySelector('[data-presentes]');
          if (caja) caja.innerHTML = f.clases.filter((x) => r.presentes.has(x.valor)).map((x) => `<span><i style="background:${x.color}"></i>${esc(x.etiqueta)}</span>`).join('');
        }).catch(() => { div.insertAdjacentHTML('beforeend', '<p class="fi-mini-vacio">Mapa no disponible todavía.</p>'); });
      }
      if (f.tipo === 'red') {
        const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
        const pintar = (g) => {
          L.geoJSON(g.parches, { style: (x) => ({ color: '#0b3d17', weight: 0.4, fillColor: color[x.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.9 }), interactive: false }).addTo(m);
          L.geoJSON(g.brechas, { style: { color: '#e53935', weight: 1.6, dashArray: '4 3' }, interactive: false }).addTo(m);
        };
        if (st.geoFicha?.id === t.id) pintar(st.geoFicha.g); else st.esperaGeo = (st.esperaGeo || []).concat([pintar]);
      }
      if (f.tipo === 'corredores') {
        L.geoJSON(st.territory.corridors, { style: (x) => { const c = COLOR_CORREDOR[x.properties.categoria_etiqueta] || '#7fae00'; const meso = x.properties.es_mesoamericano || /mesoamericano/i.test(x.properties.nombre || ''); return meso ? { color: '#4a148c', weight: 1.6, fillColor: '#ce93d8', fillOpacity: 0.4 } : { color: c, weight: 1.4, fillColor: c, fillOpacity: 0.35 }; }, interactive: false }).addTo(m);
        L.geoJSON(st.territory.critical_points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1.2, fillColor: '#f04438', fillOpacity: 1 }), interactive: false }).addTo(m);
      }
      // En toda la cuenca la red de ríos es tan densa que se confunde con límites internos: solo el borde exterior.
      // Los ríos solo van en el mapa principal de la ficha; aquí taparían la capa de la fuente.
      referencias(m, false, false);
      const borde = L.geoJSON(feature, { style: { color: '#263238', weight: 1.6, fill: false }, interactive: false }).addTo(m);
      m.fitBounds(borde.getBounds(), { padding: [4, 4] });
      st.galeria.push(m);
    });
  }
  // Red del IGNTG de toda la cuenca, filtrada por la extensión del territorio (para los que aún
  // no tienen su propio rios.json).
  let redIgntg = null;
  async function riosDeLaCuenca(feature) {
    try {
      redIgntg = redIgntg || await (await fetch(window.CHCP.hidroFile('rios_igntg_chcp.geojson'))).json();
      const b = L.geoJSON(feature).getBounds().pad(0.05);
      return { type: 'FeatureCollection', features: redIgntg.features.filter((f) => b.intersects(L.geoJSON(f).getBounds())) };
    } catch (_) { return null; }
  }
  async function drawMap(t) {
    if (st.map) { st.map.remove(); st.map = null; }
    try { st.rios = t.mapas?.rios ? await (await fetch(mapFile(t.id, 'rios.json'))).json() : null; } catch (_) { st.rios = null; }
    if (!st.rios) st.rios = await riosDeLaCuenca(featureDe(t));
    st.esperaGeo = []; st.geoFicha = null;
    drawGallery(t);
    const map = L.map('fi-map', { zoomControl: true, preferCanvas: false, zoomSnap: 0.25 });
    st.map = map;
    altoAjustable(document.getElementById('fi-map'), map, 'fi-map-h');
    window.CHCP.mapaBase(map, { defecto: 'satelite' });
    const feature = featureDe(t);
    const area = L.geoJSON(feature, { style: { color: '#ffffff', weight: 3, fill: false } }).addTo(map);
    referencias(map, false, t.id !== 'chcp');
    map.fitBounds(area.getBounds(), { padding: [12, 12] });
    if (t.id === 'chcp') return;  // la cuenca completa no tiene red de parches propia
    try {
      const g = await api(`/api/v1/panel/geometry/${t.id}`);
      const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
      L.geoJSON(g.parches, { style: (f) => ({ color: '#0b3d17', weight: 0.6, fillColor: color[f.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.85 }), onEachFeature: (f, l) => l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · importancia ${f.properties.prioridad_conectividad || '—'}`) }).addTo(map);
      L.geoJSON(g.brechas, { style: { color: '#ff5252', weight: 3, dashArray: '6 5' } }).addTo(map);
      L.geoJSON(g.ruta_corredor, { style: { color: '#ffd54f', weight: 2.5, dashArray: '2 4' } }).addTo(map);
      mapaDiic(t, g);
      st.geoFicha = { id: t.id, g };
      (st.esperaGeo || []).forEach((fn) => fn(g)); st.esperaGeo = [];
    } catch (_) {
      // Geometrías aún no calculadas: el mapa muestra límites, ríos y corredores, y se avisa.
      $$('.fi-mini[data-fig="red"]').forEach((d) => d.insertAdjacentHTML('beforeend', '<p class="fi-mini-vacio">Parches todavía no calculados.</p>'));
      const nota = $('#fi-map-nota');
      if (nota && t.id !== 'chcp') { nota.textContent = `Los parches de bosque y las brechas de ${t.nombre} todavía no están calculados: se generan ${window.CHCP.pendiente()}.`; nota.hidden = false; }
    }
  }
  /** Mapa de los parches con mayor aporte a la conectividad (dIIC); clic → Plataforma acercada al parche. */
  function mapaDiic(t, g) {
    const div = document.getElementById('fi-diic-map');
    const top = t.estructura_2021?.metricas_paisaje?.diic_principales || [];
    if (!div || !top.length || !g?.parches?.features?.length) return;
    if (st.mapaDiic) { st.mapaDiic.remove(); st.mapaDiic = null; }
    const m = L.map(div, { zoomControl: true, scrollWheelZoom: false, zoomSnap: 0.25 });
    st.mapaDiic = m;
    altoAjustable(div, m, 'fi-diic-h');
    window.CHCP.mapaBase(m, { defecto: 'satelite', control: false });
    const rango = new Map(top.slice(0, 6).map((x, i) => [x.parche_id, i]));
    const destino = (id) => enlaceParche(t.id, id);
    const borde = L.geoJSON(featureDe(t), { style: { color: '#ffffff', weight: 2.5, fill: false }, interactive: false }).addTo(m);
    L.geoJSON(g.parches, {
      style: (f) => (rango.has(f.properties.patch_id)
        ? { color: '#ffeb3b', weight: 1.2, fillColor: '#1b5e20', fillOpacity: 0.9 }
        : { color: '#c5e1a5', weight: 0.5, fillColor: '#c5e1a5', fillOpacity: 0.45 }),
      onEachFeature: (f, l) => {
        const id = f.properties.patch_id;
        if (!rango.has(id)) { l.bindTooltip(`Parche #${id} · ${hectares(f.properties.area_ha)}`); return; }
        const x = top[rango.get(id)];
        l.bindTooltip(`#${id}`, { permanent: true, direction: 'center', className: 'fi-diic-et' });
        l.bindPopup(`<b>Parche #${id}</b><br>${hectares(x.area_ha)} · aporte ${pct(x.diic_pct)}<br>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}<br><a href="${destino(id)}">Verlo de cerca en la Plataforma →</a>`);
        l.on('dblclick', () => { location.href = destino(id); });
      },
    }).addTo(m);
    m.fitBounds(borde.getBounds(), { padding: [10, 10] });
  }
  function select(id) {
    const t = st.data.territorios[id];
    if (!t) return;
    $('#fi-select').value = id;
    history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}${/^#fi-/.test(location.hash) ? location.hash : ''}`);
    document.title = `Ficha técnica · ${t.nombre} · Geoportal CHCP`;
    const sim = $('#fi-sim');
    if (sim) { sim.hidden = id === 'chcp'; sim.href = `${sim.getAttribute('href').split('?')[0]}?id=${encodeURIComponent(id)}`; }
    render(t);
  }

  try {
    [st.data, st.territory, st.series] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory'),
      fetch(window.CHCP.serieFile('indice.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null), window.CHCP.consultarActualizacion()]);
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

  // ---------------------------------------------------------------- recorrido guiado
  const PASOS_FICHA = [
    { titulo: 'La ficha técnica', texto: '<p>Resume en una página lo que dicen los datos satelitales sobre una subcuenca: si ha perdido bosque, cómo está el que queda y qué tan conectado está. Se puede descargar en PDF.</p>' },
    { sel: '.fi-score', titulo: 'La preevaluación', texto: 'Puntaje de 0 a 6,5 que suma señales de deterioro de varias fuentes según reglas transparentes. «Alta» significa <b>prioridad para verificar en campo</b>, no daño confirmado.' },
    { sel: '#fi-map', titulo: 'El mapa', texto: 'Parches de bosque oficial 2021 por importancia para la conectividad, brechas que convendría cerrar y ríos del IGNTG. Los corredores del Almanaque Azul están en su propio mapa, en «Mapas temáticos».' },
    { sel: '.fi-gal-sec', titulo: 'Mapas temáticos', texto: 'Cada mapa muestra una fuente distinta sobre el mismo territorio: cobertura oficial, estado del bosque (JRC), pérdida (Hansen), cambio (ESRI), vigor (NDVI) y dónde coinciden las señales.' },
    { sel: '#fi-indicadores', titulo: 'Comparación con las demás subcuencas', texto: 'Cada indicador dice si esta subcuenca está mejor o peor que las otras. Verde = más favorable; rojo = de las más afectadas.' },
    { sel: '#fi-estructura', titulo: 'Fragmentación', texto: 'Cuántos parches hay, cuánto bosque interior queda (lejos del borde) y qué parches sostienen la red.' },
    { sel: '.fi-actions', titulo: 'Qué hacer', texto: 'Líneas de acción sugeridas a partir de los indicadores, con enlace al simulador para probar escenarios de restauración.' },
    { titulo: 'Recuerde', texto: '<p>Es una <b>evaluación preliminar</b> con datos satelitales. La sección «Confiabilidad e incertidumbre» explica las limitaciones de cada fuente.</p>' },
  ];
  const recorridoFicha = () => window.CHCP_TOUR?.iniciar(PASOS_FICHA, { clave: 'ficha', textoFin: 'Entendido' });
  $('#fi-ayuda')?.addEventListener('click', recorridoFicha);
  setTimeout(() => window.CHCP_TOUR?.invitar('ficha', 'Le explicamos cómo leer la ficha en 1 minuto.', recorridoFicha), 1200);
})();
