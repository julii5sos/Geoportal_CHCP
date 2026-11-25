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
  const featureDe = (t) => (t.poligono ? t.poligono.feature : t.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((f) => f.properties.id === t.id));
  const rip50 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 50);
  const rip30 = (t) => (t.riparia?.franjas || []).find((f) => f.ancho_m === 30);
  const icon = window.CHCP_ICON || (() => '');
  /** Encuadra el mapa en el territorio y recuerda cómo hacerlo, para reajustarlo al tamaño de la página al imprimir. */
  /** Vela con blanco lo que queda fuera de un área dibujada, para leer solo lo de adentro. */
  const velo = (m, t, opacidad) => {
    const g = t.poligono.feature.geometry, partes = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const mundo = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    // whenReady: si el mapa aún no tiene vista, el velo espera al primer encuadre.
    m.whenReady(() => {
      L.polygon([mundo, ...partes.map((p) => p[0].map(([x, y]) => [y, x]))], { stroke: false, fillColor: '#ffffff', fillOpacity: opacidad, interactive: false }).addTo(m);
      m._borde?.bringToFront();
    });
  };
  const encuadre = (m, limites, borde) => { m._chcpAjuste = () => m.fitBounds(limites, { padding: [borde, borde] }); m._chcpAjuste(); };
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
    frases.push(`<b>Estado del bosque.</b> ${t.poligono ? 'El área dibujada' : esc(t.nombre)} tiene ${hectares(t.area_ha)}${t.poligono ? ' dentro de la cuenca' : ''}; la cartografía oficial 2021 clasifica el ${pct(s21?.forest_pct, 0)} como bosques y otras tierras boscosas, y JRC identifica ${hectares(t.jrc_ha.tmf_estable)} de bosque húmedo sin perturbación detectada (${pct(t.jrc_ha.tmf_estable / t.area_ha * 100, 0)}).`);
    let cambio = `<b>Cambios recientes.</b> JRC registra ${hectares(t.jrc_ha.tmf_deforestacion)} en estado deforestado y ${hectares(t.jrc_ha.tmf_degradacion)} degradado a 2025`;
    if (ini && fin && ini.jrc_deforestacion_ha != null) { const d = (fin.jrc_deforestacion_ha || 0) - (ini.jrc_deforestacion_ha || 0); cambio += `; entre ${ini.anio} y ${fin.anio} la superficie deforestada ${d > 0.5 ? `aumentó ${hectares(d)}` : d < -0.5 ? `se redujo ${hectares(-d)} (regeneración o reclasificación)` : 'se mantuvo estable'}`; }
    cambio += `. Hansen detecta ${hectares(t.hansen_post_2020_ha)} de pérdida de cobertura arbórea desde 2021${pico && pico.hansen_perdida_ha > 0 ? `, con el mayor valor en ${pico.anio} (${hectares(pico.hansen_perdida_ha)})` : ''}.`;
    frases.push(cambio);
    if (m) {
      frases.push(`<b>Fragmentación.</b> El bosque oficial 2021 forma ${number(m.numero_parches, 0)} parches${t.poligono ? ' dentro del área' : ''}; el mayor ocupa el ${pct(m.indice_parche_mayor_pct, 0)} del ${t.poligono ? 'área' : 'paisaje'} y hay ${number(m.densidad_borde_m_ha, 0)} m de borde por hectárea${mp && !mp.error ? `. Solo el ${pct(mp.porcentaje_bosque_nucleo, 0)} del bosque es interior (a más de 100 m de un borde)${mp.enn_medio_m != null ? ` y los parches están, en promedio, a ${number(mp.enn_medio_m, 0)} m de su vecino más cercano` : ''}` : ''}.`);
      frases.push(`<b>Conectividad estructural.</b> A ${number(r?.umbral_m || st.data.umbral_conectividad_m, 0)} m de distancia, los parches${t.poligono ? ' de la red de la subcuenca que toca el área' : ''} forman ${number(r.numero_componentes, 0)} ${r.numero_componentes === 1 ? 'red continua' : 'redes separadas'}, con ${number(r.numero_parches_aislados, 0)} parche(s) aislado(s)${brechas(t.estructura_2021) ? ` y ${brechas(t.estructura_2021)} brecha(s) candidata(s) a reconexión` : ''}. Es conectividad potencial por cercanía, no movimiento comprobado de fauna.`);
    }
    if (t.ndvi?.ndvi_inicial_medio != null) frases.push(`<b>Vigor de la vegetación.</b> El NDVI medio pasó de ${number(t.ndvi.ndvi_inicial_medio, 2)} en 2020 a ${number(t.ndvi.ndvi_final_medio, 2)} en 2025; ${hectares(t.ndvi.ndvi_disminucion)} muestran un descenso fuerte.`);
    const rp = t.riparia?.poligono;
    if (rp) frases.push(`<b>Ríos.</b> En la franja de 50 m a cada lado de los cauces hay ${hectares(rp.con)} con bosque oficial y ${hectares(rp.sin_suave + rp.sin_empinado)} sin bosque${rp.sin_empinado > 0 ? `, de ellas ${hectares(rp.sin_empinado)} en pendientes de 30 % o más` : ''}.`);
    if (rip30(t)?.bosque_sinia_pct != null) frases.push(`<b>Ríos.</b> Unos ${number(t.riparia.longitud_cauces_km, 0)} km de cauces; el ${pct(rip30(t).bosque_sinia_pct, 0)} de la franja de 30 m a cada lado tiene bosque oficial.`);
    frases.push(`<b>Corredores.</b> ${pct(t.corredores?.porcentaje, 0)} del territorio está dentro de corredores publicados${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}.`);
    if (t.eri?.clase) frases.push(`<b>Resiliencia (ERI, indicativo).</b> Clase ${esc(t.eri.clase)} (${number(t.eri.valor * 100, 0)}/100)${t.eri.componente_limitante_etiqueta ? `; el componente más débil es ${esc(t.eri.componente_limitante_etiqueta.toLowerCase())}` : ''}.`);
    // Todas las fuentes que suman, con sus puntos, para que la suma se pueda comprobar a mano.
    const NOMBRE_FUENTE = { tmf: 'JRC TMF', hansen: 'Hansen GFC', esri: 'ESRI LULC', gedi: 'GEDI', ndvi: 'NDVI Sentinel-2' };
    const suman = Object.keys(NOMBRE_FUENTE).filter((k) => p.senales?.[k]).map((k) => `${NOMBRE_FUENTE[k]} (${number(p.aportes?.[k] ?? 0, 1)})`);
    const lista = suman.length > 1 ? `${suman.slice(0, -1).join(', ')} y ${suman[suman.length - 1]}` : suman[0];
    frases.push(`<b>Preevaluación.</b> ${number(p.puntaje, 1)} de ${number(p.puntaje_maximo, 1)} puntos (prioridad ${esc(p.prioridad)}); prioridad de visita ${esc(p.prioridad_visita || '—')}. ${suman.length ? `Suman puntos: ${esc(lista)}.` : 'Ninguna fuente supera su umbral.'}`);
    const pr = t.id === 'chcp' ? null : puesto(t, 'perdida_reciente_pct_anual');
    if (pr) frases.push(`<b>Frente a las demás subcuencas.</b> Por pérdida reciente en proporción a su bosque ocupa el puesto ${pr.pos} de ${pr.n}: ${tercio(pr)}. Esta comparación distingue mejor entre subcuencas que la prioridad, que en territorios extensos casi siempre es Alta.`);
    return frases;
  }
  function acciones(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, r = e?.metricas_red, out = [];
    if (['Muy alta', 'Alta'].includes(p.prioridad_visita)) out.push({ t: 'Verificación de campo prioritaria', i: 'clipboard', why: `Prioridad de visita ${p.prioridad_visita}: ${(p.fuentes_deterioro || []).join(' y ') || 'varias fuentes'} muestran señales de cambio${t.corredores?.porcentaje > 10 ? ' dentro o cerca de corredores' : ''}.`, how: 'Visitar los sectores con señales coincidentes, registrar fotografías, coordenadas y causa probable (agricultura, pasto, extracción, regeneración).' });
    if (e && (r?.numero_componentes > 1 || brechas(e) > 0 || (mp?.enn_medio_m || 0) > 150)) out.push({ sim: true, t: 'Restauración para reconectar parches', i: 'network', why: `${r.numero_componentes} ${r.numero_componentes === 1 ? 'red' : 'redes separadas'}, ${brechas(e)} ${brechas(e) === 1 ? 'brecha candidata' : 'brechas candidatas'}${mp?.enn_medio_m ? ` y ${number(mp.enn_medio_m, 0)} m de distancia media entre parches` : ''}.`, how: 'Evaluar franjas de restauración en las brechas marcadas en el mapa, priorizando las que unen redes distintas o llevan hacia un corredor.' });
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
    // Área dibujada: las mismas figuras, armadas con los mapas de cada subcuenca que toca.
    if (t.poligono) {
      const porSub = t.poligono.ids.map((id) => st.data.territorios[id]).filter(Boolean).map((x) => ({ x, figs: figurasGaleria(x) }));
      const union = new Map();
      porSub.forEach(({ figs }) => figs.forEach((f) => { if (!union.has(f.id)) union.set(f.id, f); }));
      return [...union.values()].map((f) => ({
        ...f,
        lectura: f.id === 'eri' ? (st.data.capas_mapa || []).find((c) => c.clave === 'eri')?.lectura || f.lectura : f.lectura,
        partes: porSub.map(({ x, figs }) => { const g = figs.find((y) => y.id === f.id); return g && { id: x.id, archivo: g.archivo, limites: g.limites || x.mapas?.limites }; }).filter(Boolean),
      }));
    }
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
    if (t.poligono && n?.ndvi_delta_medio != null) {
      const dp = n.ndvi_delta_medio, partep = t.area_ha ? n.ndvi_disminucion / t.area_ha * 100 : null;
      return `<section class="fi-sec fi-two" id="fi-vigor"><div><h2>${icon('trend', 22)} Vigor de la vegetación · NDVI Sentinel-2</h2>
        <p><b>${dp <= -0.05 ? 'El vigor medio de la vegetación disminuyó de forma apreciable.' : dp >= 0.05 ? 'El vigor medio de la vegetación aumentó.' : 'El vigor medio se mantuvo prácticamente estable.'}</b> Cambio medio del NDVI entre 2020 y 2025: ${dp > 0 ? '+' : ''}${number(dp, 3)}. ${hectares(n.ndvi_disminucion)}${partep == null ? '' : ` (${pct(partep, 1)} del área)`} tuvieron un descenso fuerte (≥ 0.15) partiendo de vegetación vigorosa.</p></div>
        <div><h3>Cómo leer el NDVI</h3><ul class="fi-list"><li>Va de −1 a 1; la vegetación densa y sana suele estar entre 0.6 y 0.9.</li><li>Es la quinta fuente del índice de preevaluación (peso 0.5): solo suma cuando el descenso es extenso.</li><li>Un descenso aislado no prueba deforestación: puede ser cosecha, sequía, quema o nubes residuales. Por eso se contrasta con JRC, Hansen y ESRI en el mapa de señales coincidentes.</li></ul></div></section>`;
    }
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
    if (t.poligono && e?.valor != null) {
      return `<section class="fi-sec fi-two"><div><h2>${icon('shield', 22)} Resiliencia ecológica (ERI)</h2>
        <div class="fi-eri"><b style="background:${e.color}">${number(e.valor * 100, 0)}</b><div><strong>${esc(e.clase)}</strong><p>${esc(e.lectura)}</p></div></div>
        <p class="fi-note">Valor medio de los píxeles del área. Los cuatro componentes del ERI se calculan por subcuenca: véalos en la ficha de ${esc(t.poligono.subcuencas.join(', '))}. Índice indicativo; no modifica la preevaluación.</p></div>
        <div><h3>Qué significa</h3><p>El ERI resume la capacidad del paisaje para mantener y recuperar sus funciones: dosel alto y denso, bosque cercano alrededor, laderas con cobertura y vegetación junto a los ríos. Un valor bajo señala dónde la restauración aportaría más estabilidad.</p></div></section>`;
    }
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
    if (r?.poligono) {
      const q = r.poligono, sin = q.sin_suave + q.sin_empinado, tot = q.con + sin;
      return `<section class="fi-sec"><h2>${icon('sprout', 22)} Ríos y franjas riparias</h2>
        <p>${tot > 0 ? `En la franja de 50 m a cada lado de los cauces que cruzan el área, <b>${pct(q.con / tot * 100, 0)}</b> tiene bosque oficial 2021 (${hectares(q.con)}) y ${hectares(sin)} no tiene bosque.` : 'El área no cruza cauces con franja riparia calculada.'}</p>
        ${sin > 0 ? `<div class="fi-two"><div>${bars([{ l: 'Pendiente < 30 %', v: q.sin_suave, c: '#f4a261' }, { l: 'Pendiente ≥ 30 %', v: q.sin_empinado, c: '#c62828' }], (v) => hectares(v))}</div><div><p class="fi-note">Franja de 50 m sin bosque, por pendiente. Las orillas sin bosque en pendientes fuertes son más susceptibles a erosión. Es una clasificación descriptiva, no un modelo de riesgo.</p></div></div>` : ''}
        <p class="fi-note">Cauces del IGNTG con más de 1 km² de drenaje. No se afirman efectos cuantitativos sobre caudal o calidad del agua sin modelación y validación adicionales.</p></section>`;
    }
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
      <p>${pct(t.corredores?.porcentaje, 1)} ${t.poligono ? 'del área' : 'del territorio'} (${hectares(t.corredores?.area_ha)}) está dentro de corredores biológicos publicados en el Almanaque Azul${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}.${!corr.length && t.corredores?.distancia_mas_cercano_m ? ` El corredor más cercano está a ${number(t.corredores.distancia_mas_cercano_m / 1000, 1)} km.` : ''}</p>
      ${corr.length ? `<table class="fi-table"><thead><tr><th>Corredor</th><th>Categoría de conectividad</th><th>Superficie en la subcuenca</th><th>Condición media</th></tr></thead><tbody>${corr.map((c) => { const n = notas.get(c.nombre) || {}; return `<tr><td><i class="fi-dot" style="background:${COLOR_CORREDOR[c.categoria] || '#7fae00'}"></i>${esc(c.nombre)}</td><td>${esc(c.categoria || '—')}</td><td>${hectares(c.interseccion_ha)}</td><td>${n.cond_promedio == null ? '—' : number(n.cond_promedio, 1)}</td></tr>`; }).join('')}</tbody></table>` : ''}
      ${puntos.length ? `<h3>Puntos críticos dentro ${t.poligono ? 'del área' : 'de la subcuenca'}</h3><ul class="fi-list">${puntos.map((p) => `<li>${esc(p.properties.notas || p.properties.nombre || 'Punto crítico')}</li>`).join('')}</ul>` : `<p class="fi-note">No hay puntos críticos del Almanaque Azul dentro de ${t.poligono ? 'esta área' : 'esta subcuenca'}.</p>`}
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

  // ------------------------------------------------------------ respuesta a la pregunta de la portada
  // Como en Global Forest Watch: la pregunta, una frase que la responde con las cifras clave, un
  // gráfico, un mapa, la advertencia principal y los parámetros usados. Se muestra al llegar desde
  // una tarjeta de la portada (?pregunta=...).
  // La pregunta se lee una vez: al cambiar de territorio la respuesta se actualiza para el nuevo.
  const PREGUNTA = new URLSearchParams(location.search).get('pregunta');
  const PREGUNTAS = {
    perdida: '¿Ha perdido bosque esta zona?',
    coincidencia: '¿Coinciden varias fuentes en la señal de cambio?',
    salud: '¿El bosque que queda está sano?',
    fragmentacion: '¿Qué tan fragmentado está el bosque?',
  };
  const sujeto = (t) => (t.poligono ? 'el área dibujada' : t.id === 'chcp' ? 'la cuenca' : esc(t.nombre));
  const Sujeto = (t) => { const x = sujeto(t); return x.charAt(0).toUpperCase() + x.slice(1); };
  /** Columnas por año (pérdida Hansen), con la rampa oficial y los años de la preevaluación resaltados. */
  function columnas(filas) {
    const W = 560, H = 150, L = 34, B = 20, T = 8, max = techo(Math.max(0.1, ...filas.map((f) => f.v)) * 1.05);
    const ancho = (W - L) / filas.length;
    const y = (v) => T + (1 - v / max) * (H - T - B);
    const barras = filas.map((f, i) => `<rect x="${L + i * ancho + 1}" y="${y(f.v)}" width="${Math.max(1, ancho - 2)}" height="${H - B - y(f.v)}" rx="1.5" fill="${colorHansen(f.anio)}" stroke="rgba(0,0,0,.25)" stroke-width=".5"><title>${f.anio}: ${hectares(f.v)}</title></rect>`).join('');
    const marcas = filas.map((f, i) => ((f.anio % 4 === 1 || i === filas.length - 1) ? `<text x="${L + i * ancho + ancho / 2}" y="${H - 5}" text-anchor="middle">'${String(f.anio).slice(2)}</text>` : '')).join('');
    const eje = [0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W}" y1="${y(max * k)}" y2="${y(max * k)}" class="g"/><text x="${L - 5}" y="${y(max * k) + 3}" text-anchor="end">${number(max * k, max < 10 ? 1 : 0)}</text>`).join('');
    return `<svg class="fi-line fi-cols" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pérdida por año">${eje}${barras}${marcas}</svg>`;
  }
  async function contarCoincidencia(t) {
    if (t.poligono) return t.coincidencia_ha || null;
    try {
      const b = await valoresDe(mapFile(t.id, 'coincidencia.v.png'));
      const px = (t.mapas?.tamano_pixel_m || 0) ** 2 / 10000, c = { 1: 0, 2: 0, 3: 0 };
      for (let i = 0; i < b.v.length; i += 1) if (c[b.v[i]] != null) c[b.v[i]] += px;
      return c;
    } catch (_) { return null; }
  }
  async function responder(t, clave) {
    const sec = document.getElementById('fi-respuesta');
    if (!sec || !PREGUNTAS[clave]) return;
    const p = t.preevaluacion, e = t.estructura_2021, mc = e?.metricas_clase, mr = e?.metricas_red, mp = e?.metricas_paisaje;
    let frase = '', grafico = '', aviso = '', param = '', fig = null, detalle = '';
    if (clave === 'perdida') {
      let porAnio = t.hansen_por_anio || null, base2000 = null;
      if (!porAnio && !t.poligono) {
        try { const est = await (await fetch(window.CHCP.serieFile(`estadisticas/${t.id}.json`))).json(); porAnio = est?.hansen?.perdida_por_anio; base2000 = est?.hansen?.cobertura_arborea_2000_ha; } catch (_) { porAnio = null; }
      }
      const filas = porAnio ? Object.entries(porAnio).map(([a, v]) => ({ anio: Number(a), v: Number(v) || 0 })).filter((f) => f.anio >= 2001).sort((x, y) => x.anio - y.anio) : [];
      const total = filas.reduce((s2, f) => s2 + f.v, 0);
      const reciente = t.hansen_post_2020_ha ?? filas.filter((f) => f.anio >= 2021).reduce((s2, f) => s2 + f.v, 0);
      const pico = filas.filter((f) => f.anio >= 2021).reduce((a, b) => (b.v > (a?.v ?? -1) ? b : a), null);
      const pr = t.id === 'chcp' || t.poligono ? null : puesto(t, 'perdida_reciente_pct_anual');
      frase = `<p>${filas.length ? `Entre ${filas[0].anio} y ${filas[filas.length - 1].anio}, ${sujeto(t)} perdió <b>${hectares(total)}</b> de cobertura arbórea${base2000 ? `, el <b>${pct(total / base2000 * 100, 1)}</b> de la que tenía en 2000` : ''}. ` : ''}En los últimos cinco años (2021–2025) la pérdida fue de <b>${hectares(reciente)}</b>${pico && pico.v > 0 ? `, con el mayor valor en <b>${pico.anio}</b> (${hectares(pico.v)})` : ''}.</p>
        <p>JRC TMF clasifica <b>${hectares(t.jrc_ha.tmf_deforestacion)}</b> como deforestadas y <b>${hectares(t.jrc_ha.tmf_degradacion)}</b> como degradadas a 2025. Es el estado acumulado desde 1990, no solo lo reciente.${pr ? ` Por pérdida reciente en proporción a su bosque, ocupa el <b>puesto ${pr.pos} de ${pr.n}</b> subcuencas: ${tercio(pr)}.` : ''}</p>`;
      grafico = filas.length ? `<h3>Pérdida de cobertura arbórea por año</h3>${columnas(filas)}` : '';
      aviso = 'La pérdida de cobertura arbórea no siempre es deforestación: incluye la cosecha de plantaciones y las perturbaciones naturales. Hansen tampoco descuenta la cobertura que se recupera en el mismo período.';
      param = 'Hansen GFC v1.13, 30 m, copa mayor de 30 % en 2000 | JRC TMF 2025';
      fig = ['hansen_todo', 'hansen']; detalle = '#fi-dinamica';
    } else if (clave === 'coincidencia') {
      const c = await contarCoincidencia(t);
      const dos = c ? (c[2] || 0) + (c[3] || 0) : null;
      frase = c ? `<p>En ${sujeto(t)}, <b>${hectares(dos)}</b> (${pct(dos / t.area_ha * 100, 1)} del ${t.poligono ? 'área' : 'territorio'}) tienen señal de pérdida en dos o más fuentes entre 2021 y 2025, y <b>${hectares(c[3] || 0)}</b> en las tres (JRC, Hansen y ESRI). Otras <b>${hectares(c[1] || 0)}</b> aparecen en una sola fuente.</p><p>Cuantas más fuentes coinciden, más confiable es la señal. ${(p.fuentes_deterioro || []).length >= 2 ? `En la preevaluación, ${esc(`${p.fuentes_deterioro.slice(0, -1).join(', ')} y ${p.fuentes_deterioro[p.fuentes_deterioro.length - 1]}`)} superan su umbral.` : (p.fuentes_deterioro || []).length === 1 ? `En la preevaluación, solo ${esc(p.fuentes_deterioro[0])} supera su umbral.` : 'En la preevaluación, ninguna fuente de pérdida supera su umbral.'}</p>`
        : '<p>El mapa de señales coincidentes de este territorio todavía no está disponible.</p>';
      grafico = c ? `<h3>Superficie según cuántas fuentes coinciden</h3>${bars([{ l: '1 fuente', v: c[1] || 0, c: '#ffe08a' }, { l: '2 fuentes', v: c[2] || 0, c: '#f28e2b' }, { l: '3 fuentes', v: c[3] || 0, c: '#c62828' }], (v) => hectares(v))}` : '';
      aviso = 'La alerta por coincidencia es conservadora: en la evaluación preliminar, 4 de cada 10 alertas se confirmaron en imágenes de 10 m y se escapan cambios pequeños. JRC y Hansen usan las mismas imágenes Landsat, así que no son del todo independientes.';
      param = `Señal de pérdida 2021–2025 de JRC TMF, Hansen GFC y ESRI LULC | malla de ${number(t.mapas?.tamano_pixel_m || t.poligono?.pixel_m || 0, 0)} m | superficies aproximadas`;
      fig = ['coincidencia']; detalle = '#fi-indicadores';
    } else if (clave === 'salud') {
      const n = t.ndvi || {}, d = n.ndvi_delta_medio ?? (n.ndvi_final_medio != null ? n.ndvi_final_medio - n.ndvi_inicial_medio : null);
      const vigor = d == null ? 'no tiene datos de vigor suficientes' : d <= -0.05 ? 'perdió vigor de forma apreciable' : d >= 0.05 ? 'ganó vigor' : 'mantuvo su vigor';
      const g = t.gedi_altura_m;
      frase = `<p>Entre 2020 y 2025, la vegetación de ${sujeto(t)} <b>${vigor}</b>${n.ndvi_inicial_medio != null ? `: el NDVI medio pasó de <b>${number(n.ndvi_inicial_medio, 2)}</b> a <b>${number(n.ndvi_final_medio, 2)}</b>` : d != null ? ` (cambio medio del NDVI ${d > 0 ? '+' : ''}${number(d, 3)})` : ''}.${n.ndvi_disminucion ? ` <b>${hectares(n.ndvi_disminucion)}</b> (${pct(n.ndvi_disminucion / t.area_ha * 100, 1)}) tuvieron un descenso fuerte.` : ''}</p>
        <p>${g == null ? 'GEDI no tiene muestras suficientes de altura del dosel.' : `La altura media del dosel es de <b>${number(g, 1)} m</b> (GEDI): ${g >= 20 ? 'dosel alto, típico de bosque maduro' : g >= 10 ? 'dosel intermedio, de bosque secundario o mezclado' : 'dosel bajo, de bosque joven, rastrojo o zonas abiertas'}.`}${t.eri?.clase ? ` La resiliencia ecológica es <b>${esc(t.eri.clase)}</b> (${number(t.eri.valor * 100, 0)}/100)${t.eri.componente_limitante_etiqueta ? `; su componente más débil es ${esc(t.eri.componente_limitante_etiqueta.toLowerCase())}` : ''}.` : ''}</p>`;
      grafico = n.ndvi_inicial_medio != null ? `<h3>Vigor medio de la vegetación (NDVI)</h3>${bars([{ l: '2020', v: n.ndvi_inicial_medio, c: '#a6d96a' }, { l: '2025', v: n.ndvi_final_medio, c: d < 0 ? '#d8b365' : '#1a9850' }], (v) => number(v, 2))}` : '';
      aviso = 'El NDVI mide el verdor, no el estado del bosque: baja con la cosecha, la sequía o nubes residuales. GEDI mide la altura por muestreo de huellas, no en toda el área.';
      param = 'Sentinel-2, medianas anuales sin nubes de 2020 y 2025 | GEDI L2A | ERI indicativo';
      fig = ['ndvi_cambio', 'ndvi_anio']; detalle = '#fi-vigor';
    } else if (clave === 'fragmentacion') {
      if (mc) {
        const brec = brechas(e);
        frase = `<p>El bosque oficial 2021 de ${sujeto(t)} está dividido en <b>${number(mc.numero_parches, 0)} parches</b>. El mayor ocupa el <b>${pct(mc.indice_parche_mayor_pct, 0)}</b> del ${t.poligono ? 'área' : 'paisaje'}${mp?.porcentaje_bosque_nucleo != null ? ` y solo el <b>${pct(mp.porcentaje_bosque_nucleo, 0)}</b> del bosque es interior (a más de 100 m de un borde)` : ''}.</p>
          <p>A ${number(mr?.umbral_m || st.data.umbral_conectividad_m || 500, 0)} m de distancia, los parches${t.poligono ? ' de la subcuenca que toca el área' : ''} forman <b>${number(mr?.numero_componentes || 0, 0)} ${mr?.numero_componentes === 1 ? 'red continua' : 'redes separadas'}</b>${brec ? `, con <b>${brec === 1 ? 'una brecha candidata' : `${number(brec, 0)} brechas candidatas`}</b> a reconexión` : ''}.${t.id !== 'chcp' && !t.poligono && (mr?.numero_componentes > 1 || brec) ? ' El simulador permite probar dónde restaurar para unirlas.' : ''}</p>`;
        grafico = mp?.area_nucleo?.por_profundidad ? `<h3>Bosque interior según la distancia al borde</h3>${bars(mp.area_nucleo.por_profundidad.map((x) => ({ l: `A más de ${number(x.profundidad_m, 0)} m`, v: x.porcentaje_bosque_nucleo, c: '#1b5e20' })), (v) => pct(v, 0))}` : '';
      } else frase = '<p>La fragmentación de este territorio se mide por subcuenca: elija una subcuenca para ver la respuesta.</p>';
      aviso = 'Es conectividad estructural por cercanía: no demuestra que la fauna se mueva entre parches, y el resultado depende de la distancia de análisis elegida.';
      param = `Bosque oficial SINIA 2021 (MiAMBIENTE) | distancia de ${number(st.data.umbral_conectividad_m || 500, 0)} m | borde de 100 m`;
      fig = ['red']; detalle = '#fi-estructura';
    }
    const f = fig && (st.figuras || []).find((x) => fig.includes(x.id));
    sec.innerHTML = `<div class="fi-resp-txt"><span class="fi-resp-q">Su pregunta</span><h2>${PREGUNTAS[clave]}</h2>${frase}${grafico}
        <div class="fi-resp-aviso">${icon('warning', 18)}<p>${aviso}</p></div><p class="fi-resp-param">${param}</p>
        <p class="no-print"><a href="${detalle}">Ver el detalle en la ficha</a></p></div>
      ${f ? `<figure class="fi-fig fi-resp-map"><figcaption>${esc(f.titulo)}</figcaption><div class="fi-mini" data-rfig="${f.id}"></div>${leyendaFigura(f)}</figure>` : ''}`;
    sinPuntos(sec);
    sec.hidden = false;
    (st.respMapas || []).forEach((m) => m.remove());
    st.respMapas = [];
    if (f) dibujarMinis(t, sec, st.respMapas, '.fi-mini[data-rfig]');
    if (!/^#fi-/.test(location.hash)) sec.scrollIntoView({ block: 'start' });
  }

  // ------------------------------------------------------------ render
  function render(t) {
    const p = t.preevaluacion, e = t.estructura_2021, mp = e?.metricas_paisaje, serie = t.serie_anual || [];
    const toneP = { Alta: 'bad', Media: 'mid', Preventiva: 'mid', Baja: 'good' }[p.prioridad] || 'na';
    const indicadores = IND.map((ind) => { const v = ind.get(t), r = rank(ind, t); return `<div class="fi-ind${v == null ? ' fi-ind-vacio' : ''}" data-tone="${tone(r)}"><span>${esc(ind.label)}</span><b>${fmt(ind, v)}</b><small>${r ? `Más favorable que el ${number(r.good, 0)} % de las ${r.n} subcuencas` : t.poligono ? 'No se calcula para un área dibujada' : (window.CHCP.pendiente().includes('en curso') ? 'Se está calculando' : 'Se calculará en la próxima actualización')}</small><p>${esc(ind.lee)}</p></div>`; }).join('');
    // Colores oficiales de JRC TMF; «Otra cobertura» es blanca en JRC y aquí va en gris muy claro para verse sobre fondo blanco.
    const jrc = [{ l: 'Bosque estable', v: t.jrc_ha.tmf_estable, c: '#005a00' }, { l: 'Degradado', v: t.jrc_ha.tmf_degradacion, c: '#649b23' }, { l: 'Deforestado', v: t.jrc_ha.tmf_deforestacion, c: '#ff870f' }, { l: 'Regeneración', v: t.jrc_ha.tmf_recuperacion, c: '#d2fa3c' }, { l: 'Agua', v: t.jrc_ha.tmf_agua, c: '#008cbe' }, { l: 'Otra cobertura', v: t.jrc_ha.tmf_otra_cobertura, c: '#ececec' }];
    const nucleoTabla = mp && !mp.error ? `<table class="fi-table"><thead><tr><th>Profundidad de borde</th><th>Bosque interior</th><th>% del bosque</th><th>Parches sin interior</th></tr></thead><tbody>${mp.area_nucleo.por_profundidad.map((x) => `<tr><td>${number(x.profundidad_m, 0)} m</td><td>${hectares(x.area_nucleo_ha)}</td><td>${pct(x.porcentaje_bosque_nucleo)}</td><td>${number(x.parches_sin_nucleo, 0)}</td></tr>`).join('')}</tbody></table><p class="fi-note">Sensibilidad: el bosque interior depende de la profundidad de borde elegida; 100 m es una referencia de análisis, no un valor comprobado para una especie.</p>` : `<p class="fi-note">Área núcleo, distancia entre parches, cohesión e IIC se incorporan ${window.CHCP.pendiente()}.</p>`;
    const diic = (mp?.diic_principales || []).slice(0, 6);
    const acc = acciones(t);
    $('#fi-doc').innerHTML = `
      <header class="fi-head">
        <img class="fi-logo" src="${window.CHCP_STATIC ? 'static' : '/static'}/img/emblema.svg" alt="Geoportal CHCP" width="64" height="64">
        <div class="fi-head-txt"><span class="fi-kicker">${t.poligono ? 'Ficha técnica de un área dibujada' : 'Ficha técnica'}</span><h1>${esc(t.nombre)}</h1>
        <dl class="fi-meta">${t.id === 'chcp' ? '' : `<div><dt>${t.poligono ? 'Subcuencas que toca' : 'Forma parte de'}</dt><dd>${esc(t.grupo)}</dd></div>`}<div><dt>Superficie</dt><dd>${hectares(t.area_ha)}</dd></div><div><dt>Datos del</dt><dd>${esc(fechaLarga(st.data.generado))}</dd></div><div><dt>Método</dt><dd>${esc(String(st.data.metodologia || '').split('-').slice(0, 2).join('-'))}</dd></div><div><dt>Proyecto</dt><dd>Clúster Copernicus Centroamérica AFOLU II</dd></div></dl>${t.poligono ? `${window.CHCP.procedencia(st.data, 'C', null, `<span>Malla de ${number(t.poligono.pixel_m, 0)} m</span><span>Error de borde ${number(t.poligono.error_borde * 100, 1)} %</span>`)}${t.poligono.error_borde > 0.10 ? '<p class="fi-aviso-pol"><b>Resultado aproximado:</b> el área es pequeña o irregular para la malla de los mapas (error de borde mayor de 10 %), así que la categoría no es concluyente.</p>' : ''}` : window.CHCP.procedencia(st.data, 'B', t)}</div>
        <div class="fi-score" data-tone="${toneP}"><span>Preevaluación</span><b>${number(p.puntaje, 1)}<small>/ ${number(p.puntaje_maximo, 1)}</small></b><em>${esc(p.prioridad)}</em><small>Visita: ${esc(p.prioridad_visita || '—')}</small>${((r) => (r ? `<a class="fi-score-rel" href="#fi-relativa">Puesto ${r.pos} de ${r.n} en pérdida reciente</a>` : ''))(t.id === 'chcp' ? null : puesto(t, 'perdida_reciente_pct_anual'))}</div>
      </header>
      <section class="fi-resp" id="fi-respuesta" hidden></section>
      <section class="fi-sec"><h2>${icon('info', 22)} En pocas palabras</h2>${diagnostico(t).map((f) => `<p>${f}</p>`).join('')}</section>
      <section class="fi-sec fi-map-sec"><h2>${icon('map', 22)} ${t.poligono ? 'Mapa del área' : t.id === 'chcp' ? 'Mapa de la cuenca' : 'Mapa de la subcuenca'}</h2><div id="fi-map"></div><p class="fi-pending" id="fi-map-nota" hidden></p>
        ${t.id === 'chcp' ? '<div class="fi-legend"><span><i style="background:transparent;border:2px solid #ffffff;outline:1px solid #263238"></i>Límite de la cuenca</span></div><p class="fi-note">Los parches de bosque, las brechas y los ríos se ven en la ficha de cada subcuenca: en toda la cuenca serían demasiado pequeños para leerse.</p>' : `<div class="fi-legend"><span><i style="background:#1b5e20"></i>Parche clave (conectividad alta)</span><span><i style="background:#66bb6a"></i>Parche de importancia media</span><span><i style="background:#c5e1a5"></i>Parche de importancia baja</span><span><i class="dash"></i>Brecha candidata a reconexión</span><span><i style="background:#1f78b4;height:3px"></i>Ríos (${esc(t.mapas?.rios_fuente || 'IGNTG 2022, hidrografía 1:25 000')})</span></div>`}</section>
      <section class="fi-sec fi-gal-sec"><h2>${icon('layers', 22)} Mapas temáticos</h2><p class="fi-note">Cada mapa muestra una fuente distinta sobre el mismo territorio, con los colores que usa cada fuente. Los ríos están en el mapa de la subcuenca y los corredores del Almanaque Azul tienen su propio mapa. El mapa base se cambia con el selector del mapa de arriba.</p>${seccionGaleria(t)}</section>
      <section class="fi-sec" id="fi-indicadores"><h2>${icon('chart', 22)} Indicadores y comparación con las demás subcuencas</h2><p class="fi-note">Verde: mejor que la mayoría de subcuencas; ámbar: intermedio; rojo: entre las más desfavorables. La comparación es relativa a la CHCP, no un umbral normativo.</p><div class="fi-inds">${indicadores}</div></section>
      ${seccionRelativa(t)}
      <section class="fi-sec fi-two fi-dinamica" id="fi-dinamica"><div><h2>${icon('forest', 22)} Estado del bosque en 2025 · JRC</h2>${donut(jrc, hectares(t.area_ha, 0))}
        <h3>Pérdida de cobertura arbórea por año · Hansen</h3>${bars(serie.filter((x) => x.hansen_perdida_ha != null).map((x) => ({ l: String(x.anio), v: x.hansen_perdida_ha, c: colorHansen(x.anio) })), (v) => hectares(v))}</div>
        <div><h2>${icon('trend', 22)} Evolución 2020–2025 · JRC (ha)</h2>${serie.some((x) => x.jrc_deforestacion_ha != null) ? line(serie, [{ k: 'jrc_degradacion_ha', l: 'Degradado', c: '#649b23' }, { k: 'jrc_regeneracion_ha', l: 'Regeneración', c: '#d2fa3c' }, { k: 'jrc_deforestacion_ha', l: 'Deforestado', c: '#ff870f' }]) : '<p class="fi-pending">Sin serie anual para este territorio.</p>'}
        ${serie.some((x) => x.jrc_deforestacion_ha != null) ? '<p class="fi-note">Superficie en cada estado al cierre de cada año. JRC acumula: un píxel deforestado en 2010 sigue contando como deforestado en 2025, por eso las líneas cambian poco. Lo nuevo de cada año se ve mejor en la pérdida anual de Hansen.</p>' : ''}</div></section>
      <section class="fi-sec fi-two"><div><h2>${icon('layers', 22)} Cartografía oficial SINIA</h2>${bars((t.sinia || []).map((s) => ({ l: `Bosque ${s.year}`, v: s.forest_pct, c: '#237A4B' })), (v) => pct(v))}<p class="fi-note">${t.poligono ? 'En un área dibujada se mide la cartografía 2021, que es la base de la fragmentación. Los demás años están en la ficha de cada subcuenca.' : 'Productos independientes con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.'}</p></div>
        <div><h2>${icon('forest', 22)} Árboles y altura del dosel</h2><ul class="fi-list"><li><b>ESRI 2017→2024:</b> ${hectares(t.esri?.esri_salida)} pasaron de árboles a otra clase y ${hectares(t.esri?.esri_ganancia)} de otra clase a árboles; ${hectares(t.esri?.esri_estable)} se mantuvieron con árboles.</li><li><b>Altura media del dosel (GEDI):</b> ${t.gedi_altura_m == null ? 'sin muestras suficientes' : `${number(t.gedi_altura_m, 1)} m`}. ${t.gedi_altura_m == null ? '' : t.gedi_altura_m >= 20 ? 'Dosel alto, típico de bosque maduro.' : t.gedi_altura_m >= 10 ? 'Dosel intermedio: bosque secundario o intervenido.' : 'Dosel bajo: vegetación joven, rastrojo o áreas abiertas.'}</li></ul></div></section>
      ${seccionNdvi(t)}
      ${seccionEri(t)}
      <section class="fi-sec" id="fi-estructura"><h2>${icon('network', 22)} Fragmentación y conectividad · bosque oficial 2021</h2>
        ${e ? `<div class="fi-kv"><div><span>Parches</span><b>${number(e.metricas_clase.numero_parches, 0)}</b></div><div><span>Bosque</span><b>${hectares(e.metricas_clase.area_total_bosque_ha)}</b></div><div><span>Redes separadas</span><b>${number(e.metricas_red.numero_componentes, 0)}</b></div><div><span>Conexiones</span><b>${number(e.metricas_red.numero_aristas, 0)}</b></div><div><span>Aislados</span><b>${number(e.metricas_red.numero_parches_aislados, 0)}</b></div><div><span>Cohesión</span><b>${mp?.cohesion == null ? '—' : number(mp.cohesion, 1)}</b></div><div><span>IIC</span><b>${mp?.iic == null ? '—' : number(mp.iic, 4)}</b></div><div><span>Distancia entre parches</span><b>${mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`}</b></div></div>
        <h3>Bosque interior (área núcleo)</h3>${nucleoTabla}
        ${diic.length ? `<h3>Parches más importantes para la red (dIIC)</h3><table class="fi-table" id="fi-diic-tabla"><thead><tr><th>Parche</th><th>Superficie</th><th>Aporte a la conectividad</th><th>Función</th></tr></thead><tbody>${diic.map((x) => `<tr><td><a href="${enlaceParche(t.id, x.parche_id)}" title="Ver el parche en la Plataforma">#${x.parche_id}</a></td><td>${hectares(x.area_ha)}</td><td>${pct(x.diic_pct)}</td><td>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}</td></tr>`).join('')}</tbody></table><p class="fi-note">dIIC: cuánto bajaría el índice integral de conectividad si se perdiera el parche (Pascual-Hortal y Saura, 2006). Distancia umbral ${number(mp.umbral_m, 0)} m.</p>
        <h3>Dónde están estos parches</h3><div id="fi-diic-map" class="fi-diic-map"></div><p class="fi-note no-print">Los parches resaltados son los de la tabla. Haga clic en uno (o en su número en la tabla) para abrirlo en la Plataforma y acercarse.</p>` : ''}` : '<p>Sin estructura calculada.</p>'}</section>
      <section class="fi-sec" id="fi-2021-2023" hidden></section>
      ${seccionRiparia(t)}
      ${seccionAlmanaque(t)}
      <section class="fi-sec"><h2>${icon('leaf', 22)} Líneas de acción sugeridas</h2><div class="fi-actions">${acc.map((a) => `<div class="fi-action">${icon(a.i, 24)}<div><b>${esc(a.t)}</b><p><em>Por qué:</em> ${esc(a.why)}</p><p><em>Qué hacer:</em> ${esc(a.how)}</p>${a.sim && t.id !== 'chcp' && !t.poligono ? `<p class="no-print"><a href="${window.CHCP_STATIC ? 'restauracion.html' : '/restauracion'}?id=${encodeURIComponent(t.id)}">Simular la restauración en esta subcuenca →</a></p>` : ''}</div></div>`).join('')}</div>${(t.sitios || []).length ? `<h3>Sitios priorizados para verificación de campo</h3><table class="fi-table"><thead><tr><th>Sitio</th><th>Coordenadas</th><th>Superficie con señal</th><th>Fuentes que coinciden</th></tr></thead><tbody>${t.sitios.slice(0, 6).map((x) => `<tr><td>${esc(x.id)}</td><td>${number(x.lat, 5)}, ${number(x.lon, 5)}</td><td>${hectares(x.area_ha)}</td><td>${x.fuentes}</td></tr>`).join('')}</tbody></table><p class="no-print"><a href="${window.CHCP_STATIC ? 'campo.html' : '/campo'}?id=${encodeURIComponent(t.id)}">Ver estado y registrar visitas →</a></p>` : ''}
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
        <p class="fi-note"><b>Exactitud (preliminar, toda la cuenca):</b> con 498 puntos interpretados a ciegas (Olofsson et al., 2014), lo que el mapa llama bosque es bosque en el 95 % de los casos. La alerta de pérdida 2021–2025 por coincidencia de fuentes es conservadora (4 de cada 10 alertas se confirman en imágenes de 10 m y deja pasar cambios pequeños): la pérdida de ${t.poligono ? 'esta área' : 'esta subcuenca'} puede ser mayor que la mapeada y conviene verificarla en campo. Falta la revisión de un segundo intérprete. Detalle en Metodología.</p></section>
      <section class="fi-sec fi-gloss"><h2>${icon('doc', 22)} Glosario breve</h2><dl>
        <dt>Parche</dt><dd>Área continua de bosque.</dd><dt>Borde</dt><dd>Límite entre bosque y otra cobertura; el bosque cercano al borde recibe más perturbaciones.</dd>
        <dt>Bosque interior (núcleo)</dt><dd>Bosque a más de cierta distancia de cualquier borde.</dd><dt>Red / componente</dt><dd>Grupo de parches suficientemente cercanos para considerarse conectados.</dd>
        <dt>IIC / dIIC</dt><dd>Índice de conectividad del paisaje y cuánto aporta cada parche a ella.</dd><dt>NDVI</dt><dd>Índice de vigor de la vegetación calculado con imágenes Sentinel-2.</dd><dt>ERI</dt><dd>Índice indicativo de resiliencia ecológica (0–100).</dd><dt>Franja riparia</dt><dd>Faja de terreno a cada lado de un río o quebrada.</dd><dt>Almanaque Azul</dt><dd>Atlas que publica los corredores de conectividad y puntos críticos usados como referencia.</dd><dt>Conectividad estructural</dt><dd>Basada en la disposición del bosque; no demuestra que la fauna se desplace.</dd></dl></section>
      <footer class="fi-foot"><p>Datos: JRC TMF, Hansen GFC, ESRI LULC, Copernicus Sentinel-2, GEDI, SINIA–MiAMBIENTE y Almanaque Azul. Procesado en Google Earth Engine (proyecto ${esc(st.data.proyecto)}).</p><p>Preevaluación indicativa: no predice deforestación ni certifica cumplimiento.</p></footer>`;
    sinPuntos(document.getElementById('fi-doc'));
    responder(t, PREGUNTA);
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
    dibujarMinis(t, document.getElementById('fi-doc'), st.galeria);
  }
  /** Dibuja los mapas pequeños (.fi-mini[data-fig]) de `raiz` y los agrega a `lista`. */
  function dibujarMinis(t, raiz, lista, selector = '.fi-mini[data-fig]', figuras = st.figuras) {
    const feature = featureDe(t);
    const porId = new Map((figuras || []).map((f) => [f.id, f]));
    $$(selector, raiz).forEach((div) => {
      const f = porId.get(div.dataset.fig || div.dataset.rfig || div.dataset.rb);
      if (!f) return;
      // zoomSnap fino: el territorio llena el recuadro en vez de quedar en el nivel entero anterior.
      const m = L.map(div, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.1 });
      window.CHCP.mapaBase(m, { defecto: 'gris', control: false });
      if (f.tipo === 'png') (f.partes || [{ id: t.id, limites: t.mapas.limites }]).forEach((q) => L.imageOverlay(mapFile(q.id, `${f.id}.png`), q.limites, { opacity: 0.9 }).addTo(m));
      if (f.tipo === 'valores' && f.partes) {
        const presentes = new Set();
        Promise.all(f.partes.map((q) => valoresDe(q.archivo).then((b) => {
          const r = colorearValores(b, f);
          r.presentes.forEach((v) => presentes.add(v));
          L.imageOverlay(r.url, q.limites, { opacity: 0.95, className: 'fi-px' }).addTo(m);
        }).catch(() => null))).then(() => {
          const caja = div.parentElement.querySelector('[data-presentes]');
          if (caja) caja.innerHTML = (f.clases || []).filter((x) => presentes.has(x.valor)).map((x) => `<span><i style="background:${x.color}"></i>${esc(x.etiqueta)}</span>`).join('');
          if (t.poligono) { velo(m, t, 0.85); m._borde?.bringToFront(); }
        });
      } else if (f.tipo === 'valores') {
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
          if (t.poligono) { velo(m, t, 0.6); m._borde?.bringToFront(); }
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
      m._borde = borde;
      encuadre(m, borde.getBounds(), 4);
      // El velo va después del encuadre: Leaflet necesita la vista antes de dibujar el polígono.
      if (t.poligono && !(f.tipo === 'valores' && f.partes)) { velo(m, t, 0.85); borde.bringToFront(); }
      lista.push(m);
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
  /** Parches y brechas de las subcuencas que toca un área dibujada, en una sola colección. */
  async function geometriaPoligono(t) {
    const gs = (await Promise.all(t.poligono.ids.map((id) => api(`/api/v1/panel/geometry/${id}`).catch(() => null)))).filter(Boolean);
    if (!gs.length) throw new Error('sin parches');
    const junta = (k) => ({ type: 'FeatureCollection', features: gs.flatMap((g) => g[k]?.features || []) });
    return { parches: junta('parches'), brechas: junta('brechas'), ruta_corredor: { type: 'FeatureCollection', features: [] } };
  }
  async function drawMap(t) {
    if (st.map) { st.map.remove(); st.map = null; }
    try { st.rios = t.mapas?.rios ? await (await fetch(mapFile(t.id, 'rios.json'))).json() : null; } catch (_) { st.rios = null; }
    if (!st.rios) st.rios = await riosDeLaCuenca(featureDe(t));
    st.esperaGeo = []; st.geoFicha = null;
    drawGallery(t);
    comparacion2021_2023(t);
    const map = L.map('fi-map', { zoomControl: true, preferCanvas: false, zoomSnap: 0.25 });
    st.map = map;
    altoAjustable(document.getElementById('fi-map'), map, 'fi-map-h');
    window.CHCP.mapaBase(map, { defecto: 'satelite' });
    const feature = featureDe(t);
    const area = L.geoJSON(feature, { style: { color: '#ffffff', weight: 3, fill: false } }).addTo(map);
    referencias(map, false, t.id !== 'chcp');
    encuadre(map, area.getBounds(), 12);
    if (t.id === 'chcp') return;  // la cuenca completa no tiene red de parches propia
    try {
      const g = t.poligono ? await geometriaPoligono(t) : await api(`/api/v1/panel/geometry/${t.id}`);
      const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
      L.geoJSON(g.parches, { style: (f) => ({ color: '#0b3d17', weight: 0.6, fillColor: color[f.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.85 }), onEachFeature: (f, l) => l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · importancia ${f.properties.prioridad_conectividad || '—'}`) }).addTo(map);
      L.geoJSON(g.brechas, { style: { color: '#ff5252', weight: 3, dashArray: '6 5' } }).addTo(map);
      L.geoJSON(g.ruta_corredor, { style: { color: '#ffd54f', weight: 2.5, dashArray: '2 4' } }).addTo(map);
      if (t.poligono) { velo(map, t, 0.5); area.bringToFront(); }
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
  /**
   * Bosque oficial 2021 frente a 2023 (MiAMBIENTE, código «Bosques y otras tierras boscosas»),
   * medido igual en los dos mapas (scripts/comparar_bosque_2021_2023.py). Son dos diagnósticos
   * hechos con métodos distintos: la diferencia no se presenta como cambio medido.
   */
  const CLASES_2021_2023 = [
    { valor: 1, color: '#1b5e20', etiqueta: 'Bosque en los dos mapas' },
    { valor: 2, color: '#e8862a', etiqueta: 'Bosque solo en el mapa 2021' },
    { valor: 3, color: '#2c8fc9', etiqueta: 'Bosque solo en el mapa 2023' },
  ];
  async function comparacion2021_2023(t) {
    const sec = document.getElementById('fi-2021-2023');
    if (!sec) return;
    let c;
    try { c = await (await fetch(window.CHCP.cobFile(`comparacion/${t.id}.json`))).json(); } catch (_) { return; }
    if (!c?.anios?.['2021'] || !featureDe(t)) return;
    const a = c.anios['2021'], b = c.anios['2023'];
    const dif = (x, y, dec = 0, unidad = '') => {
      if (x == null || y == null) return '—';
      const d = y - x;
      if (Math.abs(d) < (dec ? 0.05 : 0.5)) return 'Igual';
      return `${d > 0 ? '+' : '−'}${number(Math.abs(d), dec)}${unidad}`;
    };
    const fila = (nombre, k, dec, unidad, nota) => `<tr><th scope="row">${nombre}${nota ? `<small>${nota}</small>` : ''}</th><td>${number(a[k], dec)}${unidad}</td><td>${number(b[k], dec)}${unidad}</td><td>${dif(a[k], b[k], dec, unidad)}</td></tr>`;
    const filas = [
      fila('Bosque', 'bosque_ha', 0, ' ha', 'superficie de cada mapa oficial'),
      fila('Parches de bosque', 'numero_parches', 0, ''),
      fila('Parche más grande', 'parche_mayor_ha', 0, ' ha'),
      fila('Tamaño medio de los parches', 'area_media_parche_ha', 1, ' ha'),
      fila('Parches de menos de 1 ha', 'parches_menores_1ha', 0, ''),
      fila('Redes separadas', 'redes_separadas', 0, '', `parches a ${number(c.umbral_m, 0)} m o menos forman una red`),
      c.corredores_en_area ? fila('Bosque dentro de corredores del Almanaque Azul', 'bosque_corredores_ha', 0, ' ha') : '',
      c.cbm_en_area ? fila('Bosque dentro del Corredor Biológico Mesoamericano', 'bosque_cbm_ha', 0, ' ha') : '',
    ].join('');
    // Lectura en palabras: qué dicen los dos mapas sobre cantidad y fragmentación.
    const db = (b.bosque_ha ?? 0) - (a.bosque_ha ?? 0), ha = (v) => `${number(v, 0)} ha`;
    const cantidad = Math.abs(db) < Math.max(1, (a.bosque_ha || 0) * 0.01)
      ? `los dos mapas muestran casi la misma superficie de bosque (${ha(a.bosque_ha)} en 2021 y ${ha(b.bosque_ha)} en 2023)`
      : `el mapa 2023 muestra ${db > 0 ? 'más' : 'menos'} bosque que el de 2021 (${ha(b.bosque_ha)} frente a ${ha(a.bosque_ha)})`;
    const masParches = b.numero_parches > a.numero_parches, medioMenor = b.area_media_parche_ha < a.area_media_parche_ha;
    const forma = masParches && medioMenor ? 'más dividido: hay más parches y, en promedio, más pequeños'
      : !masParches && !medioMenor && b.numero_parches !== a.numero_parches ? 'menos dividido: hay menos parches y, en promedio, más grandes'
        : 'con una fragmentación parecida';
    const GENERAL = [
      { valor: 1, color: '#237A4B', etiqueta: 'Bosques y otras tierras boscosas' },
      { valor: 2, color: '#D8C49C', etiqueta: 'Otras tierras' },
      { valor: 3, color: '#388FC4', etiqueta: 'Agua' },
    ];
    const leyenda = (clases) => `<div class="fi-legend">${clases.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.etiqueta)}</span>`).join('')}</div>`;
    const mapas = [
      { id: '2021', titulo: 'Mapa oficial 2021', archivo: `mapas/${t.id}/2021_general.v.png`, clases: GENERAL, nota: `${ha(a.bosque_ha)} de bosque en ${number(a.numero_parches, 0)} parches.` },
      { id: '2023', titulo: 'Mapa oficial 2023', archivo: `mapas/${t.id}/2023_general.v.png`, clases: GENERAL, nota: `${ha(b.bosque_ha)} de bosque en ${number(b.numero_parches, 0)} parches.` },
      { id: 'dif', titulo: 'Dónde difieren', archivo: `mapas/${t.id}/bosque_2021_2023.v.png`, clases: CLASES_2021_2023, nota: c.cambio ? `${ha(c.cambio.en_ambos_ha)} coinciden, ${ha(c.cambio.solo_2021_ha)} solo en 2021 y ${ha(c.cambio.solo_2023_ha)} solo en 2023.` : '' },
    ];
    sec.innerHTML = `<h2>${icon('network', 22)} Bosque oficial 2021 y 2023: qué cambia entre los dos mapas</h2>
      <p>${t.id === 'chcp' ? 'En toda la cuenca' : `En ${esc(t.nombre)}`}, ${cantidad}. En 2023 el bosque aparece ${forma}.${c.cambio ? ` Unas ${ha(c.cambio.solo_2021_ha)} que eran bosque en el mapa 2021 no lo son en el de 2023, y otras ${ha(c.cambio.solo_2023_ha)} aparecen como bosque solo en 2023.` : ''}</p>
      <div class="fi-cmp-maps">${mapas.map((m) => `<figure class="fi-fig"><figcaption>${m.titulo}</figcaption><div class="fi-mini" data-cmp="${m.id}"></div>${leyenda(m.clases)}<p class="fi-note">${m.nota}</p></figure>`).join('')}</div>
      <div class="fi-cmp">
        <div><h3>Los dos mapas en cifras</h3><table class="fi-table fi-cmp-t"><thead><tr><th>Indicador</th><th>2021</th><th>2023</th><th>Diferencia</th></tr></thead><tbody>${filas}</tbody></table></div>
        <div class="fi-cmp-leer"><h3>Cómo leerlo</h3>
          <p>Los dos mapas son de MiAMBIENTE y usan la misma categoría, «Bosques y otras tierras boscosas», pero se hicieron con métodos distintos: el de 2021 es un mapa vectorial 1:25.000 y el de 2023 un ráster de 10 m hecho con imágenes Sentinel-2.</p>
          <p>Por eso la diferencia mezcla cambios reales con diferencias de método y no mide pérdida ni ganancia de bosque. Sirve para ver si el bosque oficial se ve más o menos dividido y dónde no coinciden los mapas. Para medir cambio están JRC, Hansen y ESRI, más arriba.</p>
          <p>Más parches y más pequeños indican un bosque más dividido. Menos redes separadas indican que los parches quedan a 500 m o menos unos de otros, la distancia que usa la red de conectividad.</p>
        </div>
      </div>
      <p class="fi-note">Los dos años se midieron igual, sobre un mapa de ${number(c.pixel_m, 0)} m por píxel; por eso los parches no coinciden exactamente con la sección de fragmentación, que usa el mapa vectorial original de 2021. Las superficies de bosque son las de cada mapa oficial; las demás son aproximadas. Los colores de los mapas 2021 y 2023 son los del geoportal, porque MiAMBIENTE no publica simbología para estos productos.</p>`;
    sec.hidden = false;
    const feature = featureDe(t);
    mapas.forEach((mp) => {
      const div = sec.querySelector(`[data-cmp="${mp.id}"]`);
      const m = L.map(div, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.1 });
      window.CHCP.mapaBase(m, { defecto: 'gris', control: false });
      const borde = L.geoJSON(feature, { style: { color: '#263238', weight: 1.6, fill: false }, interactive: false }).addTo(m);
      encuadre(m, borde.getBounds(), 4);
      st.galeria.push(m);
      valoresDe(window.CHCP.cobFile(mp.archivo)).then((v) => {
        const r = colorearValores(v, { clases: mp.clases });
        L.imageOverlay(r.url, c.limites, { opacity: 0.95, className: 'fi-px' }).addTo(m);
        borde.bringToFront();
      }).catch(() => div.insertAdjacentHTML('beforeend', '<p class="fi-mini-vacio">Mapa no disponible todavía.</p>'));
    });
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
    encuadre(m, borde.getBounds(), 10);
  }
  // ------------------------------------------------------------ PDF: resumen y ficha completa
  // El PDF se arma con el cuadro de impresión del navegador. Antes de abrirlo, la página toma el
  // ancho de una hoja A4 y los mapas se reencuadran y terminan de cargar, para que el PDF se vea
  // igual que la ficha en pantalla. El nombre del archivo sale del título del documento.
  const sinAcentos = (x) => String(x).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nombreArchivo = (t, tipo) => `${tipo === 'resumen' ? 'Ficha_resumen' : 'Ficha_tecnica'}_${sinAcentos(t.nombre).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}_Geoportal_CHCP`;
  /** «Título · Fuente» pasa a título con la fuente en letra pequeña, sin el punto separador. */
  function sinPuntos(raiz) {
    $$('h2, h3, figcaption', raiz).forEach((h) => {
      if (!h.innerHTML.includes(' · ')) return;
      h.innerHTML = h.innerHTML.replace(/ · ([^<]*)(<span class="exp-tag"|$)/, ' <small class="fi-fuente">$1</small>$2');
    });
  }
  // Ficha resumen: dos hojas A4 con el diseño de la página. La primera responde «cómo está este
  // territorio» (respuesta corta, preevaluación, tres hallazgos y el mapa principal con escala,
  // norte y localización). La segunda muestra la evidencia (seis mapas de fuentes distintas, los
  // indicadores clave con su fuente y la pérdida por año) y qué conviene hacer.
  // Pesos de cada fuente en la preevaluación MT-2026.7 (tabla de Metodología).
  const PESOS_FUENTE = { tmf: ['JRC TMF', 2], hansen: ['Hansen GFC', 2], esri: ['ESRI LULC', 1.5], gedi: ['GEDI', 0.5], ndvi: ['NDVI Sentinel-2', 0.5] };
  const RESUMEN_MAPAS = [['sinia_2021'], ['jrc_2025'], ['hansen_todo', 'hansen'], ['coincidencia'], ['red', 'ndvi_cambio'], ['corredores']];
  const TITULO_CORTO = {
    sinia_2021: ['Cobertura oficial 2021', 'MiAMBIENTE'], jrc_2025: ['Estado del bosque húmedo 2025', 'JRC TMF'],
    hansen_todo: ['Año de la pérdida arbórea', 'Hansen GFC'], hansen: ['Pérdida arbórea 2021–2025', 'Hansen GFC'],
    coincidencia: ['Señales coincidentes', 'JRC, Hansen y ESRI'], red: ['Parches de bosque y brechas', 'Geoportal CHCP'],
    ndvi_cambio: ['Cambio de vigor 2020–2025', 'NDVI Sentinel-2'], corredores: ['Corredores y puntos críticos', 'Almanaque Azul'],
  };
  const QUE_MIRAR = {
    sinia_2021: 'En verde, el bosque oficial: es la base de la red de parches.',
    jrc_2025: 'En naranja, lo deforestado; en verde medio, lo degradado.',
    hansen_todo: 'De amarillo (2001) a rojo (2025): cuanto más rojo, más reciente.',
    hansen: 'Cada color es un año de pérdida entre 2021 y 2025.',
    coincidencia: 'En rojo, donde coinciden las tres fuentes: la señal más confiable.',
    red: 'Los parches verde oscuro sostienen la red; las líneas rojas son brechas.',
    ndvi_cambio: 'En rojo, menos vigor que en 2020; en verde, más.',
    corredores: 'Corredores publicados y sus puntos críticos.',
  };
  const enumerar = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] || '');
  const haCorto = (v) => hectares(v, (v || 0) < 10 ? 1 : 0);
  /** Capa precalculada (png) del territorio; en un área dibujada, armada con las subcuencas que toca. */
  function figuraCapa(t, k) {
    const c = (st.data.capas_mapa || []).find((x) => x.clave === k);
    if (!c) return null;
    const partes = (t.poligono ? t.poligono.ids : [t.id]).map((id) => st.data.territorios[id]).filter((x) => x?.mapas?.capas?.includes(k)).map((x) => ({ id: x.id, limites: x.mapas.limites }));
    return partes.length ? { id: k, tipo: 'png', titulo: c.titulo, leyenda: leyendaCapa(c), partes } : null;
  }
  /** Anillos exteriores de un Feature, FeatureCollection o geometría. */
  function anillos(g) {
    if (!g) return [];
    if (g.type === 'FeatureCollection') return g.features.flatMap(anillos);
    const geo = g.geometry || g;
    if (geo.type === 'Polygon') return [geo.coordinates[0]];
    if (geo.type === 'MultiPolygon') return geo.coordinates.map((p) => p[0]);
    return [];
  }
  /** Mapa de localización: el territorio dentro de la cuenca, con las subcuencas de fondo. */
  function localizador(t) {
    if (t.id === 'chcp' || !st.territory?.basin) return '';
    const cuenca = anillos(st.territory.basin), pts = cuenca.flat();
    if (!pts.length) return '';
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), W = 120, e = W / ((x1 - x0) * k), H = (y1 - y0) * e;
    const ruta = (rs) => rs.map((r) => { const paso = Math.max(1, Math.floor(r.length / 250)); return `M${r.filter((_, i) => i % paso === 0).map(([x, y]) => `${((x - x0) * k * e).toFixed(1)},${((y1 - y) * e).toFixed(1)}`).join('L')}Z`; }).join('');
    const subcuencas = (st.territory.subbasins?.features || []).map((f) => ruta(anillos(f))).join('');
    return `<svg class="fi-rp-loc" viewBox="-2 -2 ${W + 4} ${(H + 4).toFixed(1)}" aria-label="Localización en la cuenca"><path d="${subcuencas}" class="s"/><path d="${ruta(cuenca)}" class="c"/><path d="${ruta(anillos(featureDe(t)))}" class="a"/></svg>`;
  }
  const NORTE = '<svg class="fi-rp-norte" viewBox="0 0 24 34" aria-label="Norte"><path d="M12 2 L20 24 L12 19 L4 24 Z" fill="#0a221c"/><path d="M12 2 L12 19 L4 24 Z" fill="#5fb04a"/><text x="12" y="33" text-anchor="middle">N</text></svg>';
  /** Columnas pequeñas de 2021 a 2025 para la tarjeta de cambio reciente. */
  function miniColumnas(serie) {
    const f = serie.filter((x) => x.hansen_perdida_ha != null);
    if (!f.length) return '';
    const max = Math.max(1e-9, ...f.map((x) => x.hansen_perdida_ha)), W = 100, H = 26, a = W / f.length;
    return `<svg class="fi-rp-spark" viewBox="0 0 ${W} ${H + 9}" aria-hidden="true">${f.map((x, i) => { const h = Math.max(0.8, x.hansen_perdida_ha / max * H); return `<rect x="${i * a + 2}" y="${H - h}" width="${a - 4}" height="${h}" rx="1" fill="${colorHansen(x.anio)}" stroke="rgba(0,0,0,.25)" stroke-width=".4"/><text x="${i * a + a / 2}" y="${H + 8}" text-anchor="middle">${String(x.anio).slice(2)}</text>`; }).join('')}</svg>`;
  }
  function respuestaCorta(t, acc) {
    const s21 = sinia(t, 2021), p = t.preevaluacion, mc = t.estructura_2021?.metricas_clase, mr = t.estructura_2021?.metricas_red, mp = t.estructura_2021?.metricas_paisaje;
    const perturbado = (t.jrc_ha?.tmf_deforestacion || 0) + (t.jrc_ha?.tmf_degradacion || 0);
    const f = [];
    f.push(`${Sujeto(t)} tiene <b>${pct(s21?.forest_pct, 0)}</b> de su superficie con bosque oficial (MiAMBIENTE, 2021).`);
    f.push(`Entre 2021 y 2025 perdió <b>${haCorto(t.hansen_post_2020_ha)}</b> de cobertura arbórea según Hansen, y JRC suma <b>${haCorto(perturbado)}</b> deforestadas o degradadas desde 1990.`);
    if (mc && mr) f.push(`Su bosque está dividido en ${number(mc.numero_parches, 0)} parches que forman ${number(mr.numero_componentes, 0)} ${mr.numero_componentes === 1 ? 'red continua' : 'redes separadas'}${mp?.porcentaje_bosque_nucleo != null ? `, y el ${pct(mp.porcentaje_bosque_nucleo, 0)} es bosque interior` : ''}.`);
    else if (t.corredores?.porcentaje != null) f.push(`El ${pct(t.corredores.porcentaje, 0)} del territorio está dentro de corredores biológicos publicados.`);
    f.push(`Con ${number(p.puntaje, 1)} de ${number(p.puntaje_maximo, 1)} puntos, la preevaluación le da prioridad <b>${esc(p.prioridad.toLowerCase())}</b>; la primera línea de acción sugerida es ${acc[0] ? `«${esc(acc[0].t.charAt(0).toLowerCase() + acc[0].t.slice(1))}»` : 'el seguimiento anual'}.`);
    return f.join(' ');
  }
  function hallazgos(t) {
    const s21 = sinia(t, 2021), mc = t.estructura_2021?.metricas_clase, mr = t.estructura_2021?.metricas_red, mp = t.estructura_2021?.metricas_paisaje;
    const serie = t.serie_anual || [], pico = serie.filter((x) => x.hansen_perdida_ha != null).reduce((a, b) => (b.hansen_perdida_ha > (a?.hansen_perdida_ha ?? -1) ? b : a), null);
    const tarjetas = [
      { tema: 'Bosque', cifra: pct(s21?.forest_pct, 0), texto: `del ${t.poligono ? 'área' : 'territorio'} es bosque oficial 2021 (${haCorto(s21?.forest_ha)}), según MiAMBIENTE.`, nota: `JRC: ${haCorto(t.jrc_ha?.tmf_estable)} de bosque húmedo sin perturbación detectada.` },
      { tema: 'Cambio reciente', cifra: haCorto(t.hansen_post_2020_ha), texto: 'de cobertura arbórea perdida entre 2021 y 2025, según Hansen GFC.', extra: miniColumnas(serie), nota: pico && pico.hansen_perdida_ha > 0 ? `El año con más pérdida fue ${pico.anio} (${haCorto(pico.hansen_perdida_ha)}).` : 'Sin pérdida detectada en el período.' },
    ];
    if (mc && mr) {
      const b = brechas(t.estructura_2021);
      tarjetas.push({ tema: 'Conectividad', cifra: number(mc.numero_parches, 0), texto: `parches de bosque, que a ${number(mr.umbral_m || st.data.umbral_conectividad_m || 500, 0)} m forman ${number(mr.numero_componentes, 0)} ${mr.numero_componentes === 1 ? 'red continua' : 'redes separadas'}.`, nota: `${mp?.porcentaje_bosque_nucleo != null ? `Bosque interior: ${pct(mp.porcentaje_bosque_nucleo, 0)}. ` : ''}${b ? `${b === 1 ? 'Una brecha candidata' : `${number(b, 0)} brechas candidatas`} a reconexión.` : 'Sin brechas candidatas.'}` });
    } else {
      tarjetas.push({ tema: 'Corredores', cifra: pct(t.corredores?.porcentaje, 0), texto: 'del territorio está dentro de corredores biológicos publicados en el Almanaque Azul.', nota: t.corredores?.intersecta_mesoamericano ? 'Incluye el Corredor Biológico Mesoamericano.' : 'No toca el Corredor Biológico Mesoamericano.' });
    }
    return tarjetas.map((x) => `<article><span>${x.tema}</span><b>${x.cifra}</b><p>${x.texto}</p>${x.extra || ''}<small>${x.nota}</small></article>`).join('');
  }
  function indicadoresClave(t) {
    const s21 = sinia(t, 2021), mc = t.estructura_2021?.metricas_clase, mr = t.estructura_2021?.metricas_red, mp = t.estructura_2021?.metricas_paisaje, n = t.ndvi;
    const rp = t.riparia?.poligono, r30 = rip30(t);
    const filas = [
      ['Bosque oficial 2021', s21 && `${pct(s21.forest_pct, 0)} <small>${haCorto(s21.forest_ha)}</small>`, 'MiAMBIENTE'],
      ['Bosque sin perturbación 2025', t.jrc_ha && haCorto(t.jrc_ha.tmf_estable), 'JRC TMF'],
      ['Deforestado y degradado 2025', t.jrc_ha && haCorto((t.jrc_ha.tmf_deforestacion || 0) + (t.jrc_ha.tmf_degradacion || 0)), 'JRC TMF'],
      ['Pérdida arbórea 2021–2025', t.hansen_post_2020_ha != null && haCorto(t.hansen_post_2020_ha), 'Hansen GFC'],
      ['Árboles a otra clase 2017–2024', t.esri?.esri_salida != null && haCorto(t.esri.esri_salida), 'ESRI LULC'],
      ['Cambio del NDVI 2020–2025', n?.ndvi_delta_medio != null && `${n.ndvi_delta_medio > 0 ? '+' : ''}${number(n.ndvi_delta_medio, 2)}`, 'Sentinel-2'],
      ['Altura media del dosel', t.gedi_altura_m != null && `${number(t.gedi_altura_m, 1)} m`, 'GEDI'],
      ['Parches de bosque', mc && mr && `${number(mc.numero_parches, 0)} <small>en ${number(mr.numero_componentes, 0)} ${mr.numero_componentes === 1 ? 'red' : 'redes'}</small>`, 'Geoportal CHCP'],
      ['Bosque interior (a más de 100 m)', mp?.porcentaje_bosque_nucleo != null && pct(mp.porcentaje_bosque_nucleo, 0), 'Geoportal CHCP'],
      rp ? ['Franja riparia de 50 m con bosque', (rp.con + rp.sin_suave + rp.sin_empinado) > 0 && pct(rp.con / (rp.con + rp.sin_suave + rp.sin_empinado) * 100, 0), 'IGNTG y MiAMBIENTE']
        : ['Franja riparia de 30 m con bosque', r30?.bosque_sinia_pct != null && pct(r30.bosque_sinia_pct, 0), 'MERIT y MiAMBIENTE'],
      ['Dentro de corredores publicados', t.corredores?.porcentaje != null && pct(t.corredores.porcentaje, 0), 'Almanaque Azul'],
      ['Resiliencia ERI (indicativa)', t.eri?.clase && `${esc(t.eri.clase)} <small>${number(t.eri.valor * 100, 0)}/100</small>`, 'Geoportal CHCP'],
    ].filter((x) => x[1]);
    return `<table class="fi-rp-tabla"><thead><tr><th>Indicador</th><th>Valor</th><th>Fuente</th></tr></thead><tbody>${filas.map(([a, b, c]) => `<tr><th scope="row">${a}</th><td>${b}</td><td>${c}</td></tr>`).join('')}</tbody></table>`;
  }
  // Preguntas que responde la ficha, con la estructura de Global Forest Watch: la pregunta, una
  // frase que la responde con las cifras, una tabla o gráfico, la advertencia principal, los
  // parámetros usados y un mapa. Se arman solo las que tienen datos para el territorio.
  const limpiarNombre = (x) => String(x || '').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const aviso = (txt) => `<div class="fi-resp-aviso">${icon('warning', 16)}<p>${txt}</p></div>`;
  /** Mapa pequeño con fondo gris, límite y encuadre, para los mapas propios de las respuestas. */
  function mapaRespuesta(div, t) {
    const m = L.map(div, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.1 });
    window.CHCP.mapaBase(m, { defecto: 'gris', control: false });
    const borde = L.geoJSON(featureDe(t), { style: { color: '#263238', weight: 1.6, fill: false }, interactive: false }).addTo(m);
    m._borde = borde;
    encuadre(m, borde.getBounds(), 6);
    if (t.poligono) velo(m, t, 0.75);
    return m;
  }
  function sitiosDe(t) {
    if (!t.poligono) return t.sitios || [];
    const g = t.poligono.feature.geometry;
    return t.poligono.ids.flatMap((id) => st.data.territorios[id]?.sitios || []).filter((x) => RED?.puntoEnPoligono([x.lon, x.lat], g))
      .sort((a, b) => b.fuentes - a.fuentes || b.area_ha - a.area_ha);
  }
  async function bloquesRespuesta(t) {
    const B = [], suj = sujeto(t), Suj = Sujeto(t);
    const p = t.preevaluacion;
    // 1. Dónde verificar en campo
    const sitios = sitiosDe(t).slice(0, 5);
    if (sitios.length) {
      const tres = sitios.filter((x) => x.fuentes >= 3).length;
      B.push({
        html: `<h2>¿Dónde conviene verificar en campo?</h2>
          <p>La prioridad de visita de ${suj} es <b>${esc((p.prioridad_visita || '—').toLowerCase())}</b>. Estos son los ${sitios.length === 1 ? 'sitio' : `${sitios.length} sitios`} con señal de pérdida 2021–2025 que conviene revisar primero: suman <b>${haCorto(sitios.reduce((s2, x) => s2 + x.area_ha, 0))}</b>${tres ? `, y en ${tres === 1 ? 'uno' : tres} coinciden las tres fuentes` : ''}.</p>
          <table class="fi-rp-tabla"><thead><tr><th>Sitio</th><th>Latitud, longitud</th><th>Superficie</th><th>Fuentes</th></tr></thead><tbody>${sitios.map((x, i) => `<tr><th scope="row">${i + 1}</th><td>${number(x.lat, 5)}, ${number(x.lon, 5)}</td><td>${haCorto(x.area_ha)}</td><td>${x.fuentes} de 3</td></tr>`).join('')}</tbody></table>
          ${aviso('La alerta es conservadora: en la evaluación preliminar de toda la cuenca, 4 de cada 10 alertas se confirmaron en imágenes de 10 m y se escaparon cambios pequeños. La pérdida real puede ser mayor que la mapeada.')}
          <p class="fi-rp-param">Manchas de 0.5 ha o más con señal de JRC, Hansen o ESRI, ordenadas por fuentes coincidentes y superficie | centro de cada mancha en WGS 84</p>`,
        mapa: 'Sitios sobre las señales de pérdida coincidentes',
        leyenda: '<span><i style="background:#ffe08a"></i>1 fuente</span><span><i style="background:#f28e2b"></i>2 fuentes</span><span><i style="background:#c62828"></i>3 fuentes</span><span><i class="num">1</i>Sitio</span>',
        dibujar: (div) => {
          const m = mapaRespuesta(div, t);
          (t.poligono ? t.poligono.ids : [t.id]).forEach((id) => { const x = st.data.territorios[id]; if (x?.mapas?.capas?.includes('coincidencia')) L.imageOverlay(mapFile(id, 'coincidencia.png'), x.mapas.limites, { opacity: 0.9 }).addTo(m); });
          sitios.forEach((x, i) => L.marker([x.lat, x.lon], { icon: L.divIcon({ className: 'fi-rp-sitio', html: String(i + 1), iconSize: [18, 18] }), interactive: false }).addTo(m));
          m._borde.bringToFront();
          return m;
        },
      });
    }
    // 2. Bosque oficial 2021 frente a 2023
    let c = null;
    if (!t.poligono) { try { c = await (await fetch(window.CHCP.cobFile(`comparacion/${t.id}.json`))).json(); } catch (_) { c = null; } }
    if (c?.anios?.['2021'] && c.anios['2023']) {
      const a = c.anios['2021'], b = c.anios['2023'];
      const fila = (n, k, dec, u = '') => { const d = (b[k] ?? 0) - (a[k] ?? 0); return `<tr><th scope="row">${n}</th><td>${number(a[k], dec)}${u}</td><td>${number(b[k], dec)}${u}</td><td>${Math.abs(d) < (dec ? 0.05 : 0.5) ? 'igual' : `${d > 0 ? '+' : '−'}${number(Math.abs(d), dec)}${u}`}</td></tr>`; };
      const masParches = b.numero_parches > a.numero_parches, medioMenor = b.area_media_parche_ha < a.area_media_parche_ha;
      const forma = masParches && medioMenor ? 'más dividido: más parches y más pequeños' : !masParches && !medioMenor && b.numero_parches !== a.numero_parches ? 'menos dividido: menos parches y más grandes' : 'con una fragmentación parecida';
      B.push({
        html: `<h2>¿Cambió el bosque oficial entre 2021 y 2023?</h2>
          <p>El mapa 2023 muestra <b>${haCorto(b.bosque_ha)}</b> de bosque en ${suj}, frente a <b>${haCorto(a.bosque_ha)}</b> en 2021, y el bosque aparece ${forma}.${c.cambio ? ` Coinciden ${haCorto(c.cambio.en_ambos_ha)}; ${haCorto(c.cambio.solo_2021_ha)} son bosque solo en 2021 y ${haCorto(c.cambio.solo_2023_ha)} solo en 2023.` : ''}</p>
          <table class="fi-rp-tabla"><thead><tr><th>Indicador</th><th>2021</th><th>2023</th><th>Diferencia</th></tr></thead><tbody>${fila('Bosque', 'bosque_ha', 0, ' ha')}${fila('Parches', 'numero_parches', 0)}${fila('Tamaño medio del parche', 'area_media_parche_ha', 1, ' ha')}${fila('Redes separadas', 'redes_separadas', 0)}</tbody></table>
          ${aviso('Los dos mapas son de MiAMBIENTE pero se hicieron con métodos distintos (vector 1:25 000 en 2021, ráster de 10 m en 2023). La diferencia mezcla cambios reales con diferencias de método: no mide pérdida ni ganancia.')}
          <p class="fi-rp-param">Categoría «Bosques y otras tierras boscosas» en los dos años | malla común de ${number(c.pixel_m, 0)} m | redes con parches a ${number(c.umbral_m, 0)} m o menos</p>`,
        mapa: 'Dónde difieren los dos mapas',
        leyenda: CLASES_2021_2023.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.etiqueta)}</span>`).join(''),
        figura: { id: 'cmp', tipo: 'valores', archivo: window.CHCP.cobFile(`mapas/${t.id}/bosque_2021_2023.v.png`), limites: c.limites, clases: CLASES_2021_2023 },
      });
    }
    // 3. Resiliencia ecológica (ERI)
    const e = t.eri;
    if (e?.valor != null) {
      const nombres = { integridad_estructural: 'Integridad estructural', conectividad: 'Conectividad local', estabilidad_topografica: 'Estabilidad del relieve', proximidad_riparia: 'Cercanía a ríos' };
      const comp = e.componentes ? Object.entries(e.componentes) : [];
      const debil = comp.length ? comp.slice().sort((x, y) => x[1] - y[1])[0][0] : null;
      const eriFig = figuraCapa(t, 'eri');
      B.push({
        html: `<h2>¿Qué tan resiliente es el paisaje?</h2>
          <p>La resiliencia ecológica de ${suj} es <b>${esc(String(e.clase || '').toLowerCase())}</b>, con <b>${number(e.valor * 100, 0)} de 100</b>.${debil ? ` Su componente más débil es la ${esc(nombres[debil].toLowerCase())} (${number(e.componentes[debil] * 100, 0)}/100): es donde la restauración aportaría más estabilidad.` : ''}</p>
          ${comp.length ? bars(comp.map(([k, v]) => ({ l: nombres[k] || k, v: v * 100, c: k === debil ? '#f28e2b' : '#76b72a' })), (v) => `${number(v, 0)}/100`) : `<p class="fi-rp-sub">Valor medio de los píxeles del área; los componentes se calculan por subcuenca.</p>`}
          ${aviso('Es un índice indicativo: combina dosel, bosque alrededor, pendiente y cercanía a ríos, pero no está calibrado con mediciones de campo y no modifica la preevaluación.')}
          <p class="fi-rp-param">Dynamic World, GEDI, Copernicus DEM y MERIT Hydro | pesos 35, 25, 20 y 20 % | año de referencia ${e.anio_referencia || 2024}</p>`,
        mapa: 'Resiliencia ecológica indicativa (ERI)',
        leyenda: eriFig ? leyendaFigura(eriFig) : '',
        figura: eriFig,
      });
    }
    // 4. Ríos y franjas riparias
    const r = t.riparia, rp = r?.poligono;
    if (rp || r?.sin_bosque_por_pendiente) {
      const ripFig = figuraCapa(t, 'riparia');
      const filas = rp ? [{ l: 'Pendiente < 30 %', v: rp.sin_suave, c: '#f4a261' }, { l: 'Pendiente ≥ 30 %', v: rp.sin_empinado, c: '#c62828' }]
        : r.sin_bosque_por_pendiente.map((x) => ({ l: `Pendiente ${x.pendiente}`, v: x.area_ha, c: /≥ 30/.test(x.pendiente) ? '#c62828' : /15/.test(x.pendiente) ? '#f4a261' : '#ffd08a' }));
      const sin = filas.reduce((s2, x) => s2 + x.v, 0), empinado = filas.find((x) => /≥/.test(x.l))?.v || 0;
      const f30 = rip30(t);
      B.push({
        html: `<h2>¿Tienen bosque las orillas de los ríos?</h2>
          <p>${rp ? `En la franja de 50 m a cada lado de los cauces que cruzan ${suj}, <b>${pct(rp.con / ((rp.con + sin) || 1) * 100, 0)}</b> tiene bosque oficial.` : `${Suj} tiene unos <b>${number(r.longitud_cauces_km, 0)} km de cauces</b>${f30?.bosque_sinia_pct != null ? `, y el <b>${pct(f30.bosque_sinia_pct, 0)}</b> de la franja de 30 m a cada lado tiene bosque oficial` : ''}.`} Hay <b>${haCorto(sin)}</b> de franja de 50 m sin bosque${empinado ? `, de ellas <b>${haCorto(empinado)}</b> en pendientes de 30 % o más, las primeras que conviene revegetar` : ''}.</p>
          <h3>Franja de 50 m sin bosque, por pendiente</h3>${bars(filas, (v) => haCorto(v))}
          ${aviso('Es una clasificación descriptiva, no un modelo de erosión ni de caudal. Los cauces y distancias son aproximados y conviene confirmarlos con la hidrografía local.')}
          <p class="fi-rp-param">${rp ? 'Cauces del IGNTG' : 'Cauces MERIT Hydro (90 m) con drenaje de 1 km² o más'} | franjas de 30 y 50 m a cada lado | bosque oficial SINIA 2021</p>`,
        mapa: 'Franja riparia de 50 m',
        leyenda: ripFig ? leyendaFigura(ripFig) : '',
        figura: ripFig,
      });
    }
    // 5. Corredores y puntos críticos
    const corr = (t.corredores?.lista || []).slice().sort((x, y) => y.interseccion_ha - x.interseccion_ha);
    const feature = featureDe(t);
    const puntos = (st.territory.critical_points?.features || []).filter((q) => feature && RED && RED.puntoEnPoligono(q.geometry.coordinates, feature.geometry || feature.features?.[0]?.geometry));
    if (corr.length || puntos.length) {
      B.push({
        html: `<h2>¿Qué corredores biológicos cruza?</h2>
          <p>El <b>${pct(t.corredores?.porcentaje, 0)}</b> de ${suj} (${haCorto(t.corredores?.area_ha)}) está dentro de ${corr.length === 1 ? 'un corredor publicado' : `${corr.length} corredores publicados`}${t.corredores?.intersecta_mesoamericano ? ', incluido el Corredor Biológico Mesoamericano' : ''}. ${puntos.length ? `Hay <b>${puntos.length === 1 ? 'un punto crítico' : `${puntos.length} puntos críticos`}</b> del Almanaque Azul dentro.` : 'No hay puntos críticos del Almanaque Azul dentro.'}</p>
          <table class="fi-rp-tabla"><thead><tr><th>Corredor</th><th>Conectividad</th><th>Superficie dentro</th></tr></thead><tbody>${corr.slice(0, 6).map((x) => `<tr><th scope="row">${esc(limpiarNombre(x.nombre))}</th><td>${esc(x.categoria || '—')}</td><td>${haCorto(x.interseccion_ha)}</td></tr>`).join('')}</tbody></table>
          ${puntos.length ? `<p class="fi-rp-sub"><b>Puntos críticos:</b> ${esc(puntos.slice(0, 4).map((q) => limpiarNombre(q.properties.notas || q.properties.nombre || 'Punto crítico')).join('; '))}${puntos.length > 4 ? '; y otros en la ficha completa' : ''}.</p>` : ''}
          ${aviso('Las categorías de conectividad y los puntos críticos son los publicados por el Almanaque Azul; el geoportal no los modifica ni los valida en campo.')}
          <p class="fi-rp-param">Almanaque Azul (2024) | superficie calculada sobre el límite de ${t.poligono ? 'el área' : t.id === 'chcp' ? 'la cuenca' : 'la subcuenca'}</p>`,
        mapa: 'Corredores y puntos críticos',
        leyenda: (st.figuras || []).find((f) => f.id === 'corredores')?.leyenda?.replace(/^<div class="fi-legend">|<\/div>$/g, '') || '',
        figura: (st.figuras || []).find((f) => f.id === 'corredores'),
      });
    }
    // 6. Parches clave para la red (dIIC)
    const diic = (t.estructura_2021?.metricas_paisaje?.diic_principales || []).slice(0, 5);
    if (diic.length && st.geoFicha?.id === t.id) {
      const puentes = diic.filter((x) => x.es_puente).length, siguen = diic.slice(1, 3);
      B.push({
        html: `<h2>¿Qué parches sostienen la red de bosque?</h2>
          <p>El parche <b>#${diic[0].parche_id}</b> (${haCorto(diic[0].area_ha)}) sostiene el <b>${pct(diic[0].diic_pct, 0)}</b> de la conectividad del bosque${siguen.length ? `; le ${siguen.length === 1 ? 'sigue el' : 'siguen los'} ${enumerar(siguen.map((x) => `#${x.parche_id} (${pct(x.diic_pct, 0)})`))}` : ''}. Cada porcentaje es lo que bajaría la conectividad si se perdiera ese parche, por eso no se suman.${puentes ? ` ${puentes === 1 ? 'Uno funciona' : `${puentes} funcionan`} como puente entre grupos de bosque: si se pierden, la red se divide.` : ''}</p>
          <table class="fi-rp-tabla"><thead><tr><th>Parche</th><th>Superficie</th><th>Aporte a la conectividad</th><th>Función</th></tr></thead><tbody>${diic.map((x) => `<tr><th scope="row">#${x.parche_id}</th><td>${haCorto(x.area_ha)}</td><td>${pct(x.diic_pct, 1)}</td><td>${x.es_puente ? 'Puente entre grupos' : 'Gran hábitat'}</td></tr>`).join('')}</tbody></table>
          ${aviso('Es conectividad estructural: mide cuánto bajaría la conectividad potencial si se perdiera cada parche, no demuestra que la fauna lo use. El resultado depende de la distancia de análisis.')}
          <p class="fi-rp-param">dIIC (Pascual-Hortal y Saura, 2006) | parches a ${number(t.estructura_2021?.metricas_paisaje?.umbral_m || 500, 0)} m o menos conectados | bosque oficial SINIA 2021</p>`,
        mapa: 'Dónde están los parches clave',
        leyenda: '<span><i style="background:#1b5e20;outline:1.5px solid #ffeb3b"></i>Parche clave (con su número)</span><span><i style="background:#c5e1a5"></i>Otros parches</span>',
        dibujar: (div) => {
          const m = mapaRespuesta(div, t), top = new Set(diic.map((x) => x.parche_id));
          L.geoJSON(st.geoFicha.g.parches, {
            style: (f) => (top.has(f.properties.patch_id) ? { color: '#ffeb3b', weight: 1.2, fillColor: '#1b5e20', fillOpacity: 0.95 } : { color: '#8bc34a', weight: 0.4, fillColor: '#c5e1a5', fillOpacity: 0.6 }),
            onEachFeature: (f, l) => { if (top.has(f.properties.patch_id)) l.bindTooltip(`#${f.properties.patch_id}`, { permanent: true, direction: 'center', className: 'fi-diic-et' }); },
          }).addTo(m);
          m._borde.bringToFront();
          return m;
        },
      });
    }
    return B;
  }
  async function construirResumen(t) {
    const caja = document.getElementById('fi-resumen');
    const p = t.preevaluacion;
    const toneP = { Alta: 'bad', Media: 'mid', Preventiva: 'mid', Baja: 'good' }[p.prioridad] || 'na';
    const figs = RESUMEN_MAPAS.map((ids) => ids.map((i) => (i === 'sinia_2021' ? figuraCapa(t, i) : (st.figuras || []).find((f) => f.id === i))).find(Boolean)).filter(Boolean);
    const acc = acciones(t).slice(0, 3);
    const pr = t.id === 'chcp' || t.poligono ? null : puesto(t, 'perdida_reciente_pct_anual');
    const metodo = String(st.data.metodologia || '').split('-').slice(0, 2).join('-');
    const img = `${window.CHCP_STATIC ? 'static' : '/static'}/img`;
    // Pérdida Hansen por año (2001–2025) para el gráfico de la hoja 2.
    let porAnio = t.hansen_por_anio || null;
    if (!porAnio && !t.poligono) { try { porAnio = (await (await fetch(window.CHCP.serieFile(`estadisticas/${t.id}.json`))).json())?.hansen?.perdida_por_anio; } catch (_) { porAnio = null; } }
    let filasHansen = porAnio ? Object.entries(porAnio).map(([a, v]) => ({ anio: Number(a), v: Number(v) || 0 })).filter((f) => f.anio >= 2001).sort((x, y) => x.anio - y.anio) : [];
    if (!filasHansen.length) filasHansen = (t.serie_anual || []).filter((x) => x.hansen_perdida_ha != null).map((x) => ({ anio: x.anio, v: x.hansen_perdida_ha }));
    const totalHansen = filasHansen.reduce((s2, f) => s2 + f.v, 0);
    const bloques = await bloquesRespuesta(t);
    // Hasta tres respuestas por hoja, repartidas parejo (4 respuestas = 2 + 2, no 3 + 1).
    const hojasResp = Math.ceil(bloques.length / 3), POR_HOJA = Math.ceil(bloques.length / (hojasResp || 1)), hojas = 2 + hojasResp;
    // Suma de la preevaluación: una barra con el peso de cada fuente; las que suman van en color.
    const barra = Object.entries(PESOS_FUENTE).map(([k, [, w]]) => `<i style="flex:${w}" class="${p.senales?.[k] ? 'si' : ''}"></i>`).join('');
    const suman = Object.entries(PESOS_FUENTE).filter(([k]) => p.senales?.[k]).map(([k, [nom]]) => `${nom} ${number(p.aportes?.[k] ?? 0, 1)}`);
    const meta = [
      t.id === 'chcp' ? null : [t.poligono ? 'Subcuencas que toca' : 'Forma parte de', esc(t.grupo)],
      ['Superficie', hectares(t.area_ha)], ['Datos del', esc(fechaLarga(st.data.generado))], ['Método', esc(metodo)],
      t.poligono ? ['Cálculo', `malla de ${number(t.poligono.pixel_m, 0)} m`] : null,
    ].filter(Boolean).map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    const marca = (pag) => `<div class="fi-rp-marca"><img src="${img}/emblema_blanco.svg" alt="" width="34" height="34"><div><b>Geoportal CHCP</b><span>Conectividad ecológica de la Cuenca del Canal de Panamá</span></div><p><b>${t.poligono ? 'Ficha resumen de un área dibujada' : 'Ficha resumen'}</b>${pag > 1 ? `<span>${esc(t.nombre)}</span>` : ''}</p></div>`;
    const pie = (n) => `<footer class="fi-rp-pie"><span>Resultados indicativos calculados con imágenes satelitales y cartografía oficial: orientan la revisión técnica y la visita de campo, no la reemplazan.</span><span>Hoja ${n} de ${hojas}</span></footer>`;
    const leyendaPrincipal = t.id === 'chcp'
      ? '<span><i class="borde"></i>Límite de la cuenca</span><span><i class="sub"></i>Subcuencas</span>'
      : `<span><i style="background:#1b5e20"></i>Parche clave</span><span><i style="background:#66bb6a"></i>Importancia media</span><span><i style="background:#c5e1a5"></i>Importancia baja</span><span><i class="dash"></i>Brecha candidata</span>${st.rios ? '<span><i class="rio"></i>Ríos</span>' : ''}<span><i class="borde"></i>${t.poligono ? 'Área dibujada' : 'Límite de la subcuenca'}</span>`;
    const enLinea = t.poligono ? null : `${location.origin}${location.pathname}?id=${encodeURIComponent(t.id)}`;
    const aviso = t.poligono?.error_borde > 0.10 ? `<p class="fi-rp-aviso"><b>Resultado aproximado:</b> el área es pequeña o irregular para la malla de los mapas (error de borde de ${number(t.poligono.error_borde * 100, 0)} %).</p>` : '';
    caja.innerHTML = `
      <section class="fi-rp">
        <header class="fi-rp-banda">${marca(1)}
          <h1>${esc(t.nombre)}</h1><dl class="fi-rp-meta">${meta}</dl>
        </header>
        <div class="fi-rp-cuerpo">
          <div class="fi-rp-inicio">
            <div class="fi-rp-lead"><h2>En pocas palabras</h2><p>${respuestaCorta(t, acc)}</p>${aviso}</div>
            <div class="fi-rp-score" data-tone="${toneP}"><span>Preevaluación</span><b>${number(p.puntaje, 1)}<small>de ${number(p.puntaje_maximo, 1)}</small></b><em>Prioridad ${esc(p.prioridad.toLowerCase())}</em>
              <div class="fi-rp-barra">${barra}</div><small>${suman.length ? `Suman: ${esc(enumerar(suman))}.` : 'Ninguna fuente supera su umbral.'}</small>
              <small>Visita de campo: ${esc((p.prioridad_visita || '—').toLowerCase())}.${pr ? ` Puesto ${pr.pos} de ${pr.n} en pérdida reciente.` : ''}</small></div>
          </div>
          <div class="fi-rp-hall">${hallazgos(t)}</div>
          <figure class="fi-rp-mapa">
            <div class="fi-rp-lienzo"><div class="fi-mini" id="fi-res-principal"></div>${NORTE}${localizador(t)}</div>
            <figcaption><div class="fi-legend">${leyendaPrincipal}</div><p>${t.poligono ? 'El área dibujada' : t.id === 'chcp' ? 'La cuenca' : 'La subcuenca'} sobre imagen satelital${t.id === 'chcp' ? ', con sus 53 subcuencas. Los parches de bosque se ven en la ficha de cada subcuenca.' : ', con los parches de bosque oficial 2021 según su importancia para la conectividad (dIIC).'}${t.id === 'chcp' ? '' : ' Recuadro: ubicación en la cuenca.'}</p></figcaption>
          </figure>
        </div>
        ${pie(1)}
      </section>
      <section class="fi-rp">
        <header class="fi-rp-banda fi-rp-banda-s">${marca(2)}</header>
        <div class="fi-rp-cuerpo">
          <div class="fi-rp-tit"><h2>La evidencia en seis mapas</h2><p class="fi-rp-sub">Cada mapa es una fuente distinta sobre el mismo ${t.poligono ? 'área' : 'territorio'}, con los colores de esa fuente.</p></div>
          <div class="fi-rp-gal">${figs.map((f) => { const [tit, fu] = TITULO_CORTO[f.id] || [f.titulo, '']; return `<figure><figcaption><b>${esc(tit)}</b><small>${esc(fu)}</small></figcaption><div class="fi-mini" data-fig="${f.id}"></div>${leyendaFigura(f)}<p>${esc(QUE_MIRAR[f.id] || '')}</p></figure>`; }).join('')}</div>
          <div class="fi-rp-datos">
            <div><h2>Indicadores clave</h2>${indicadoresClave(t)}</div>
            <div><h2>Pérdida de cobertura arbórea por año</h2>${filasHansen.length ? `${columnas(filasHansen)}<p class="fi-rp-sub">${filasHansen.length > 5 ? `De ${filasHansen[0].anio} a ${filasHansen[filasHansen.length - 1].anio} se perdieron ${haCorto(totalHansen)}. ` : ''}Hansen GFC incluye la cosecha de plantaciones y no indica la causa.</p>` : '<p class="fi-rp-sub">Sin serie anual para este territorio.</p>'}<div class="fi-rp-leer"><p><b>Cómo se calcula la prioridad.</b> Cada fuente suma puntos si supera su umbral: JRC TMF y Hansen GFC 2, ESRI LULC 1.5, GEDI y NDVI 0.5. Prioridad alta desde 3 puntos.</p><p><b>Qué es la conectividad.</b> Es estructural: los parches a ${number(st.data.umbral_conectividad_m || 500, 0)} m o menos forman una red. No demuestra que la fauna se desplace.</p><p><b>Fuentes.</b> MiAMBIENTE (2021), JRC TMF, Hansen GFC, ESRI LULC, Sentinel-2, GEDI, IGNTG y Almanaque Azul. ${enLinea ? `Ficha completa en línea: <span class="fi-rp-url">${esc(enLinea)}</span>` : 'La ficha completa del área se abre desde la Plataforma del geoportal.'}</p></div></div>
          </div>
          <div><h2>Qué conviene hacer</h2><div class="fi-rp-acc">${acc.map((a) => `<article>${icon(a.i, 20)}<div><b>${esc(a.t)}</b><p>${esc(a.why)}</p><p><em>Qué hacer:</em> ${esc(a.how)}</p></div></article>`).join('')}</div></div>
        </div>
        ${pie(2)}
      </section>
      ${Array.from({ length: hojas - 2 }, (_, h) => `<section class="fi-rp">
        <header class="fi-rp-banda fi-rp-banda-s">${marca(h + 3)}</header>
        <div class="fi-rp-cuerpo">
          ${h === 0 ? `<div class="fi-rp-tit"><h2>Respuestas a las preguntas clave</h2><p class="fi-rp-sub">Cada respuesta trae la cifra, la advertencia principal y los parámetros usados.</p></div>` : ''}
          ${bloques.slice(h * POR_HOJA, (h + 1) * POR_HOJA).map((b, i) => `<article class="fi-rp-resp" data-bloque="${h * POR_HOJA + i}"><div class="fi-rp-resp-txt">${b.html}</div>
            <figure class="fi-rp-resp-map"><figcaption><b>${esc(b.mapa)}</b></figcaption><div class="fi-mini"${b.figura ? ` data-rb="${b.figura.id}"` : ''}></div>${/^<div/.test(b.leyenda || '') ? b.leyenda : `<div class="fi-legend">${b.leyenda || ''}</div>`}</figure></article>`).join('')}
        </div>
        ${pie(h + 3)}
      </section>`).join('')}`;
    caja.hidden = false;
    // Mapas de la hoja 2
    (st.resumen || []).forEach((x) => x.remove());
    st.resumen = [];
    dibujarMinis(t, caja, st.resumen, '.fi-mini[data-fig]', figs);
    // Mapas de las respuestas: los de capas con dibujarMinis y los propios (sitios, parches clave) aparte.
    bloques.forEach((b, i) => {
      const art = caja.querySelector(`[data-bloque="${i}"]`);
      if (b.figura) dibujarMinis(t, art, st.resumen, '.fi-mini[data-rb]', [b.figura]);
      else if (b.dibujar) st.resumen.push(b.dibujar(art.querySelector('.fi-mini')));
    });
    // Mapa principal de la hoja 1, con escala gráfica.
    const map = L.map(document.getElementById('fi-res-principal'), { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.1 });
    window.CHCP.mapaBase(map, { defecto: 'satelite', control: false });
    L.control.scale({ imperial: false, position: 'bottomleft', maxWidth: 130 }).addTo(map);
    // Límite blanco con un filete oscuro debajo: se lee sobre la imagen satelital y sobre el velo.
    const borde = L.featureGroup([
      L.geoJSON(featureDe(t), { style: { color: '#0a221c', weight: 5, opacity: 0.6, fill: false }, interactive: false }),
      L.geoJSON(featureDe(t), { style: { color: '#ffffff', weight: 2.2, fill: false }, interactive: false }),
    ]);
    map._borde = borde;
    encuadre(map, borde.getBounds(), 8);
    if (t.id === 'chcp') L.geoJSON(st.territory.subbasins, { style: { color: '#ffffff', weight: 0.8, opacity: 0.75, fill: false }, interactive: false }).addTo(map);
    if (t.id !== 'chcp' && st.rios) L.geoJSON(st.rios, { style: { color: '#4fc3f7', weight: 1, opacity: 0.9 }, interactive: false }).addTo(map);
    borde.addTo(map);
    const color = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
    const pintar = (g) => {
      L.geoJSON(g.parches, { style: (f) => ({ color: '#0b3d17', weight: 0.5, fillColor: color[f.properties.prioridad_conectividad] || '#9ccc65', fillOpacity: 0.9 }), interactive: false }).addTo(map);
      L.geoJSON(g.brechas, { style: { color: '#ff5252', weight: 2.2, dashArray: '5 4' }, interactive: false }).addTo(map);
      if (t.poligono) velo(map, t, 0.55);
      borde.bringToFront();
    };
    if (t.id !== 'chcp') { if (st.geoFicha?.id === t.id) pintar(st.geoFicha.g); else st.esperaGeo = (st.esperaGeo || []).concat([pintar]); }
    st.resumen.push(map);
  }
  /** Espera a que los mapas terminen de cargar teselas e imágenes (como máximo `ms`). */
  function esperarMapas(mapas, ms = 8000) {
    const pendientes = [];
    mapas.forEach((m) => m.eachLayer((l) => {
      if (l instanceof L.TileLayer && l.isLoading && l.isLoading()) pendientes.push(new Promise((ok) => l.once('load', ok)));
      if (l instanceof L.ImageOverlay && l._image && !l._image.complete) pendientes.push(new Promise((ok) => { l._image.addEventListener('load', ok, { once: true }); l._image.addEventListener('error', ok, { once: true }); }));
    }));
    return Promise.race([Promise.all(pendientes), new Promise((ok) => setTimeout(ok, ms))]);
  }
  const todosLosMapas = () => [st.map, st.mapaDiic, ...(st.galeria || []), ...(st.respMapas || []), ...(st.resumen || [])].filter(Boolean);
  function reencuadrar(mapas) { mapas.forEach((m) => { m.invalidateSize(false); if (m._chcpAjuste) m._chcpAjuste(); }); }
  const cuadro = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  let tituloPantalla = null;
  function modoImpresion(tipo) {
    if (tituloPantalla === null) tituloPantalla = document.title;
    document.documentElement.classList.add('fi-pdf', `fi-pdf-${tipo}`);
    if (st.actual) document.title = nombreArchivo(st.actual, tipo);
  }
  function salirImpresion() {
    document.documentElement.classList.remove('fi-pdf', 'fi-pdf-resumen', 'fi-pdf-completa');
    if (tituloPantalla !== null) { document.title = tituloPantalla; tituloPantalla = null; }
    const caja = document.getElementById('fi-resumen');
    if (caja) caja.hidden = true;
    requestAnimationFrame(() => reencuadrar(todosLosMapas()));
  }
  async function descargar(tipo) {
    if (!st.actual) return;
    modoImpresion(tipo);
    if (tipo === 'resumen') await construirResumen(st.actual);
    await cuadro();
    const mapas = tipo === 'resumen' ? st.resumen : todosLosMapas();
    reencuadrar(mapas);
    window.CHCP.toast?.('Preparando el PDF…');
    await esperarMapas(mapas);
    await cuadro();
    window.print();
  }
  function prepararDescarga() {
    const btn = $('#fi-print'), menu = $('#fi-descarga-m');
    const abrir = (si) => { menu.hidden = !si; btn.setAttribute('aria-expanded', String(si)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); abrir(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
    $$('[data-pdf]', menu).forEach((b) => b.addEventListener('click', () => { abrir(false); descargar(b.dataset.pdf); }));
    $('[data-geo]', menu)?.addEventListener('click', () => {
      abrir(false);
      const t = st.actual, f = t && featureDe(t);
      if (!f) return;
      const geo = { type: 'Feature', properties: { id: t.id, nombre: t.nombre, area_ha: t.area_ha, fuente: f.properties?.fuente || 'Límite de la Cuenca Hidrográfica del Canal de Panamá usado por el Geoportal CHCP' }, geometry: f.geometry || f };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(geo)], { type: 'application/geo+json' }));
      a.download = `${nombreArchivo(t, 'limite').replace(/^Ficha_tecnica/, 'Limite')}.geojson`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    // Ctrl+P sin pasar por el menú: se imprime la ficha completa con el mismo formato.
    window.addEventListener('beforeprint', () => {
      if (document.documentElement.classList.contains('fi-pdf')) return;
      modoImpresion('completa');
      reencuadrar(todosLosMapas());
    });
    window.addEventListener('afterprint', salirImpresion);
  }
  // ------------------------------------------------------------ área dibujada en la Plataforma
  // La Plataforma guarda el análisis del polígono (estimación local, tipo C) en localStorage y
  // abre ficha.html?poligono=1. Aquí se traduce a la misma forma que un territorio, para que la
  // ficha sea la misma con los mismos textos. Lo que no se puede medir en un área dibujada se
  // dice en su sección.
  const CLASES_ERI = [[0.25, 'Muy baja', '#B42318', 'Condición ecológica muy limitada; requiere revisión detallada.'], [0.40, 'Baja', '#F79009', 'Persisten limitaciones importantes en uno o varios componentes.'],
    [0.60, 'Media', '#F2C94C', 'Condición intermedia; conviene revisar los componentes más débiles.'], [0.75, 'Alta', '#76B72A', 'La mayoría de los componentes conserva una condición favorable.'],
    [1.01, 'Muy alta', '#00544D', 'Condición ecológica comparativamente favorable dentro del modelo.']];
  function territorioPoligono(p) {
    const R = p.resultado, a = R.acc, m = R.metricas, f = R.fragmentacion, e = R.estructura || {}, v = R.visita;
    const area = m.area_ha || 0;
    const ids = (p.ids || []).filter((id) => st.data.territorios[id]);
    const nombres = ids.map((id) => st.data.territorios[id].nombre);
    const T = ids.map((id) => st.data.territorios[id]);
    const union = (k) => [...new Set(T.flatMap((x) => x.mapas?.[k] || []))];
    const n = (obj, k) => (obj && obj[k]) || 0;
    const anios = p.jrc_por_anio ? Object.keys(p.jrc_por_anio).map(Number).sort((x, y) => x - y) : [2021, 2022, 2023, 2024, 2025];
    const serie = anios.map((y) => ({ anio: y, ...(p.jrc_por_anio ? { jrc_deforestacion_ha: n(p.jrc_por_anio[y], 3), jrc_degradacion_ha: n(p.jrc_por_anio[y], 2), jrc_regeneracion_ha: n(p.jrc_por_anio[y], 4) } : {}), hansen_perdida_ha: y >= 2001 ? n(a.hansen, y - 2000) : null }));
    const eri = R.eri_medio == null ? null : (() => { const c = CLASES_ERI.find(([max]) => R.eri_medio < max) || CLASES_ERI[4]; return { valor: R.eri_medio, clase: c[1], color: c[2], lectura: c[3] }; })();
    const n100 = f?.area_nucleo?.find((x) => x.profundidad_m === 100);
    const geo = p.geo?.type === 'Feature' ? p.geo : { type: 'Feature', properties: {}, geometry: p.geo?.geometry || p.geo };
    return {
      id: 'poligono', nombre: `Área dibujada de ${hectares(R.area_dibujada_ha)}`, grupo: nombres.join(', '), area_ha: area,
      poligono: { feature: geo, ids, subcuencas: nombres, pixel_m: R.pixel_m, error_borde: R.error_borde, creado: p.creado },
      preevaluacion: { puntaje: R.puntaje, puntaje_maximo: 6.5, prioridad: R.prioridad, prioridad_visita: v.prioridad_visita, puntaje_visita: v.puntaje_integrado,
        senales: R.senales, aportes: R.aportes, fuentes_deterioro: R.consistencia.fuentes_deterioro, consistencia: R.consistencia.nivel },
      jrc_ha: { tmf_estable: n(a.jrc, 1), tmf_degradacion: n(a.jrc, 2), tmf_deforestacion: n(a.jrc, 3), tmf_recuperacion: n(a.jrc, 4), tmf_agua: n(a.jrc, 5), tmf_otra_cobertura: n(a.jrc, 6) },
      hansen_post_2020_ha: m.hansen_post_2020_ha, serie_anual: serie,
      hansen_por_anio: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [2001 + i, n(a.hansen, i + 1)])),
      coincidencia_ha: { 1: n(a.coincidencia, 1), 2: n(a.coincidencia, 2), 3: n(a.coincidencia, 3) },
      esri: { esri_salida: n(a.esri, 1), esri_ganancia: n(a.esri, 2), esri_estable: n(a.esri, 3) },
      gedi_altura_m: R.disponibilidad?.gedi ? m.gedi_altura_media_m : null,
      ndvi: R.ndvi_delta_medio == null ? null : { ndvi_delta_medio: R.ndvi_delta_medio, ndvi_disminucion: m.ndvi_disminucion_ha },
      sinia: [{ year: 2021, forest_ha: n(a.sinia, 1), forest_pct: area ? n(a.sinia, 1) / area * 100 : null }],
      corredores: { porcentaje: R.corredores.porcentaje_aoi_en_corredores, area_ha: a.corredor_ha || 0, intersecta_mesoamericano: R.corredores.intersecta_mesoamericano, lista: [] },
      riparia: { poligono: { con: n(a.riparia, 1), sin_suave: n(a.riparia, 2), sin_empinado: n(a.riparia, 3) } },
      eri,
      estructura_2021: f ? {
        metricas_clase: { numero_parches: f.numero_fragmentos, area_total_bosque_ha: f.area_bosque_ha, indice_parche_mayor_pct: f.indice_fragmento_mayor_pct, densidad_borde_m_ha: f.densidad_borde_m_ha },
        metricas_red: { numero_componentes: e.numero_componentes || 0, numero_parches_aislados: e.aislados ?? null, numero_aristas: null, umbral_m: st.data.umbral_conectividad_m },
        metricas_paisaje: { porcentaje_bosque_nucleo: n100?.porcentaje_bosque_nucleo ?? null, area_nucleo: { por_profundidad: (f.area_nucleo || []).map((x) => ({ ...x, parches_sin_nucleo: null })) }, enn_medio_m: null, cohesion: null, iic: e.iic ?? null, diic_principales: [] },
      } : null,
      mapas: { capas: union('capas'), valores: union('valores'), tamano_pixel_m: R.pixel_m },
      sitios: [],
    };
  }
  function cargarPoligono() {
    try {
      const p = JSON.parse(localStorage.getItem('chcp-poligono') || 'null');
      return p?.resultado ? territorioPoligono(p) : null;
    } catch (_) { return null; }
  }
  function mostrarPoligono(t) {
    st.actual = t;
    const sel = $('#fi-select');
    if (!sel.querySelector('option[value="poligono"]')) sel.insertAdjacentHTML('afterbegin', '<option value="poligono">Área dibujada</option>');
    sel.value = 'poligono';
    document.title = `Ficha técnica del área dibujada, Geoportal CHCP`;
    const sim = $('#fi-sim');
    if (sim) sim.hidden = true;
    render(t);
  }
  function select(id) {
    if (id === 'poligono') { const tp = cargarPoligono(); if (tp) mostrarPoligono(tp); return; }
    const t = st.data.territorios[id];
    if (!t) return;
    st.actual = t;
    $('#fi-select').value = id;
    history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}${PREGUNTA ? `&pregunta=${encodeURIComponent(PREGUNTA)}` : ''}${/^#fi-/.test(location.hash) ? location.hash : ''}`);
    document.title = `Ficha técnica de ${t.nombre}, Geoportal CHCP`;
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
  prepararDescarga();
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const tPol = params.has('poligono') ? cargarPoligono() : null;
  if (tPol) mostrarPoligono(tPol);
  else select(st.data.territorios[id] ? id : (list.find((t) => t.id !== 'chcp') || list[0]).id);

  // ---------------------------------------------------------------- recorrido guiado
  const PASOS_FICHA = [
    { titulo: 'La ficha técnica', texto: '<p>Resume en una página lo que dicen los datos satelitales sobre una subcuenca: si ha perdido bosque, cómo está el que queda y qué tan conectado está. Se puede descargar en PDF de dos formas: un resumen de 2 páginas o la ficha completa.</p>' },
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
