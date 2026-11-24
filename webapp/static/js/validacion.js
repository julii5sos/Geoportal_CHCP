/* Página de validación: diseño, avance, resultados (Olofsson et al., 2014), herramienta de
   interpretación ciega y cálculo con un CSV propio. */
(async function () {
  const { $, $$, escapeHtml: esc, number, valFile } = window.CHCP;
  const V = window.CHCP_VALIDACION;
  const st = { indice: null, mapa: null, diseno: null, estratos: null, muestra: [], resultados: null, i: 0, map: null, imagenes: null, series: null, filtro: 'todos' };
  const G = window.CHCP_GRAF;
  const pct = (v, d = 0) => (v == null ? '—' : `${number(v * 100, d)} %`);
  const ha = (v) => `${number(v, 0)} ha`;

  // Ejemplo publicado (Olofsson et al., 2014, sección 5) para entender la lectura de resultados.
  const EJEMPLO = {
    leyenda: [{ codigo: 1, etiqueta: 'Deforestación', color: '#c62828' }, { codigo: 2, etiqueta: 'Ganancia de bosque', color: '#1e88e5' }, { codigo: 3, etiqueta: 'Bosque estable', color: '#2e7d32' }, { codigo: 4, etiqueta: 'No bosque estable', color: '#d7c2a1' }],
    areas: { 1: 18000, 2: 13500, 3: 288000, 4: 580500 },
    conteos: [[66, 0, 5, 4], [0, 55, 8, 12], [1, 0, 153, 11], [2, 1, 9, 313]],
  };

  async function obtener(ruta, tipo = 'json') {
    const r = await fetch(valFile(ruta));
    if (!r.ok) throw new Error(String(r.status));
    return tipo === 'json' ? r.json() : r.text();
  }

  // ------------------------------------------------------------ resultados
  function lecturaClase(f, et) {
    if (f.exactitud_usuario == null) return '';
    const com = Math.round((1 - f.exactitud_usuario) * 100), om = f.exactitud_productor == null ? null : Math.round((1 - f.exactitud_productor) * 100);
    return `<li><b>${esc(et)}:</b> de cada 100 puntos que el mapa marca como «${esc(et.toLowerCase())}», unos ${100 - com} lo son en la referencia (comisión ${com} %).${om == null ? '' : ` El mapa capta ${100 - om} de cada 100 hectáreas reales de esta clase (omisión ${om} %).`} La superficie real se estima entre <b>${ha(Math.max(0, f.area_ajustada - f.area_ajustada_ic))}</b> y <b>${ha(f.area_ajustada + f.area_ajustada_ic)}</b> (mapa: ${ha(f.area_mapa)}).</li>`;
  }
  function renderResultados(r, leyenda, aviso = '') {
    const et = new Map(leyenda.map((c) => [String(c.codigo), c.etiqueta]));
    const color = new Map(leyenda.map((c) => [String(c.codigo), c.color || '#607d8b']));
    const max = Math.max(...r.por_clase.map((f) => Math.max(f.area_mapa, f.area_ajustada + f.area_ajustada_ic)));
    const n = r.matriz_conteos;
    return `${aviso}
      <div class="va-kpis"><div><span>Exactitud global</span><b>${pct(r.exactitud_global, 1)}</b><small>± ${pct(r.exactitud_global_ic, 1)} (IC 95 %)</small></div><div><span>Puntos evaluados</span><b>${number(r.n_total, 0)}</b><small>${number(r.area_total, 0)} ha cartografiadas</small></div></div>
      <table class="fi-table"><thead><tr><th>Clase</th><th>Exactitud de usuario<small>1 − comisión</small></th><th>Exactitud de productor<small>1 − omisión</small></th><th>Superficie del mapa</th><th>Superficie ajustada (IC 95 %)</th></tr></thead><tbody>
      ${r.por_clase.map((f) => `<tr><td><i class="fi-dot" style="background:${color.get(String(f.clase))}"></i>${esc(et.get(String(f.clase)))}<small>n = ${f.n}</small></td><td>${pct(f.exactitud_usuario)} <small>± ${pct(f.exactitud_usuario_ic)}</small></td><td>${pct(f.exactitud_productor)} <small>± ${pct(f.exactitud_productor_ic)}</small></td><td>${ha(f.area_mapa)}</td><td>${ha(f.area_ajustada)} <small>± ${ha(f.area_ajustada_ic)}</small></td></tr>`).join('')}
      </tbody></table>
      <h3>Superficie del mapa frente a superficie ajustada</h3>
      <div class="va-ci">${r.por_clase.map((f) => { const x = (v) => Math.max(0, Math.min(100, v / max * 100)); return `<div><span>${esc(et.get(String(f.clase)))}</span><i><em class="int" style="left:${x(f.area_ajustada - f.area_ajustada_ic)}%;width:${x(f.area_ajustada + f.area_ajustada_ic) - x(f.area_ajustada - f.area_ajustada_ic)}%;background:${color.get(String(f.clase))}55"></em><em class="est" style="left:${x(f.area_ajustada)}%;background:${color.get(String(f.clase))}"></em><em class="mapa" style="left:${x(f.area_mapa)}%"></em></i></div>`; }).join('')}<p class="rs-note"><span class="va-k mapa"></span> superficie del mapa · <span class="va-k est"></span> estimación ajustada · franja = intervalo del 95 %</p></div>
      <h3>Cómo leerlo</h3><ul class="fi-list">${r.por_clase.map((f) => lecturaClase(f, et.get(String(f.clase)))).join('')}</ul>
      <details><summary>Matriz de confusión (puntos)</summary><table class="fi-table va-mat"><thead><tr><th>Mapa ↓ / Referencia →</th>${r.clases.map((c) => `<th>${esc(et.get(String(c)))}</th>`).join('')}<th>Total</th></tr></thead><tbody>${n.map((fila, i) => `<tr><th>${esc(et.get(String(r.clases[i])))}</th>${fila.map((v, j) => `<td class="${i === j ? 'diag' : ''}">${v}</td>`).join('')}<td>${fila.reduce((s, v) => s + v, 0)}</td></tr>`).join('')}</tbody></table>
      <p class="rs-note">La diagonal son aciertos. Fuera de la diagonal: por filas, errores de comisión; por columnas, errores de omisión. Las proporciones se ponderan por la superficie de cada estrato.</p></details>`;
  }
  // Estados que la interfaz distingue (auditoría C.6).
  const PENDIENTE = `<div class="va-pend"><b>Validación temática pendiente: no se dispone de una muestra independiente completa.</b><span>Ningún mapa de esta página tiene todavía exactitud cuantificada para la CHCP. Las superficies del geoportal son superficies de mapa, sin intervalo de confianza.</span></div>`;
  const PRUEBAS = '<p class="va-tag"><span class="t-ok">Pruebas matemáticas</span> Los estimadores reproducen el ejemplo publicado de Olofsson et al. (2014) (pruebas automáticas del repositorio). Esto verifica el cálculo, no la exactitud de los mapas.</p>';
  function ejemplo(destino) {
    const r = V.evaluar([1, 2, 3, 4], EJEMPLO.areas, EJEMPLO.conteos);
    destino.innerHTML = `${PENDIENTE}${PRUEBAS}<details class="va-ej"><summary>Ver un ejemplo didáctico de cómo se leerán los resultados (datos de otro estudio, NO de la CHCP)</summary>${renderResultados(r, EJEMPLO.leyenda, '<p class="rs-warn"><b>Ejemplo didáctico con datos publicados de otro estudio (Olofsson et al., 2014, sección 5). No son resultados de la CHCP.</b></p>')}</details>`;
  }

  // ------------------------------------------------------------ interpretación
  const CLAVE = () => `chcp-validacion-${st.mapa}`;
  function guardarLocal() { try { localStorage.setItem(CLAVE(), JSON.stringify(st.muestra.map((p) => [p.id, p.clase_referencia || '', p.confianza || '', p.notas || '', p.fecha_imagen || '', p.clase_referencia_2 || '', p.interprete_2 || '']))); } catch (_) { /* almacenamiento no disponible */ } }
  function cargarLocal() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE()) || '[]');
      const m = new Map(datos.map(([id, c, conf, n, fi, c2, i2]) => [id, { c, conf, n, fi, c2, i2 }]));
      st.muestra.forEach((p) => { const x = m.get(p.id); if (!x) return; if (!p.clase_referencia) Object.assign(p, { clase_referencia: x.c, confianza: x.conf, notas: x.n, fecha_imagen: x.fi || '' }); if (!p.clase_referencia_2 && x.c2) Object.assign(p, { clase_referencia_2: x.c2, interprete_2: x.i2 || '' }); });
    } catch (_) { /* nada guardado */ }
  }
  function csv() {
    const cols = ['id', 'lon', 'lat', 'clase_referencia', 'confianza', 'fecha_imagen', 'fuente_imagen', 'interprete', 'fecha', 'interprete_2', 'clase_referencia_2', 'clase_final', 'resolucion', 'notas'];
    const q = (v) => (/[",;\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    return [cols.join(','), ...st.muestra.map((p) => cols.map((c) => q(p[c])).join(','))].join('\n');
  }
  function descargar(nombre, texto, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); URL.revokeObjectURL(a.href); }
  const campoClase = () => (st.revisor ? 'clase_referencia_2' : 'clase_referencia');
  /** Recortes Sentinel-2 sin nubes de varios años y series NDVI / radar del punto. */
  const urlChip = (p, a, ir) => valFile(`${st.mapa}/imagenes/${encodeURIComponent(p.id)}_${a}${ir ? '_ir' : ''}.jpg`);
  const BANDAS_NDVI = [{ desde: 0.6, hasta: 1, etiqueta: 'bosque o vegetación densa', color: '#1b7837' }, { desde: 0.2, hasta: 0.6, etiqueta: 'pasto, cultivo, rastrojo', color: '#d8b365' }, { desde: -0.2, hasta: 0.2, etiqueta: 'agua, suelo o construcción', color: '#2166ac' }];
  const BANDAS_VH = [{ desde: -16, hasta: -8, etiqueta: 'típico de bosque', color: '#1b7837' }, { desde: -22, hasta: -16, etiqueta: 'pasto, cultivo o suelo', color: '#d8b365' }, { desde: -32, hasta: -22, etiqueta: 'agua (superficie lisa)', color: '#2166ac' }];
  function panelImagenes(p) {
    if (!st.imagenes) return '<p class="va-sin-img">Las imágenes sin nubes de Sentinel-2 aún no se han preparado para esta muestra (Actions → «Generar muestra de validación» con «Solo preparar las imágenes»).</p>';
    const I = st.imagenes, lado = I.recorte.lado_m, celda = (st.diseno.escala_m / lado) * 100;
    const ir = st.infrarrojo && I.infrarrojo;
    const chips = I.anios_recortes.map((a) => `<figure class="va-chip"><button type="button" class="va-chip-b" data-ampliar aria-label="Ampliar las imágenes"><img src="${urlChip(p, a, ir)}" alt="Sentinel-2 ${a} sin nubes alrededor del punto" loading="lazy" onerror="this.parentNode.classList.add('va-chip-sin')"><i style="width:${celda}%;height:${celda}%"></i></button><figcaption>${a}</figcaption></figure>`).join('');
    const s = st.series?.[p.id];
    const lineas = s ? `<div class="va-series"><div><b>NDVI por año</b><small>Bosque estable ≈ 0,7–0,9. Una caída fuerte <b>y sostenida</b> sugiere desmonte; valores bajos todos los años indican agua, suelo o construcción.</small>${G.linea({ anios: I.anios_series, valores: I.anios_series.map((a) => s.ndvi?.[a] ?? null), min: -0.2, max: 1, alto: 130, bandas: BANDAS_NDVI, marcasY: [0, 0.5, 1] })}</div>
      <div><b>Radar VH por año (dB)</b><small>Atraviesa las nubes. Una caída de más de 3 dB que se mantiene sugiere pérdida de dosel; variaciones menores de 2 dB son ruido. Muy bajo todos los años = agua.</small>${G.linea({ anios: I.anios_series, valores: I.anios_series.map((a) => s.vh?.[a] ?? null), color: '#5e3c99', min: -32, max: -8, decimales: 1, alto: 130, bandas: BANDAS_VH, marcasY: [-30, -20, -10] })}</div></div>` : '';
    const guia = `<details class="va-guia" ${st.guiaVista ? '' : 'open'}><summary>Cómo decidir la clase de este punto</summary><ol>
      <li><b>Recortes 2020 · 2022 · 2025</b> (amplíelos): mire solo el recuadro amarillo. ¿Era bosque en 2020? ¿Sigue siéndolo en 2025?</li>
      <li><b>NDVI</b>: línea en la franja verde todos los años = vegetación densa; baja y se queda baja = posible desmonte; en la franja azul todos los años = agua o suelo.</li>
      <li><b>Radar</b>: línea plana = sin cambio (diferencias menores de 2 dB son ruido); escalón hacia abajo de más de 3 dB que se mantiene = posible pérdida de dosel.</li>
      <li><b>Mapa de abajo</b>: foto de alta resolución de una sola fecha. Sirve para reconocer qué hay (casas, caminos, agua, pasto), no para ver el cambio.</li>
      <li>Si las ayudas no coinciden o no se ve, elija «Sin evidencia suficiente».</li></ol></details>`;
    return `${guia}<div class="va-img"><div class="va-img-bar"><span>Sentinel-2 sin nubes (mediana de cada año), ${lado} m de lado; el recuadro es la celda de ${st.diseno.escala_m} m evaluada.</span>
      ${I.infrarrojo ? `<div class="pe-lg-modo" role="radiogroup" aria-label="Combinación de bandas"><button type="button" data-ir="0" aria-pressed="${!ir}">Color natural</button><button type="button" data-ir="1" aria-pressed="${!!ir}">Infrarrojo</button></div>` : ''}
      <button type="button" class="btn btn-s va-amp" data-ampliar>Ampliar (tecla A)</button></div>
      <div class="va-chips">${chips}</div>${ir ? '<p class="rs-note">Infrarrojo (SWIR · NIR · rojo): vegetación en verde brillante, suelo desnudo o pasto seco en rosado o marrón, <b>agua en negro o azul oscuro</b>.</p>' : ''}${lineas}</div>`;
  }
  /** Vista ampliada: los años lado a lado, grandes, con el mismo recuadro. */
  function ampliar(p) {
    const I = st.imagenes; if (!I) return;
    const celda = (st.diseno.escala_m / I.recorte.lado_m) * 100;
    let ir = !!(st.infrarrojo && I.infrarrojo), sola = null;
    const caja = document.createElement('div');
    caja.className = 'va-lb'; caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-label', 'Imágenes ampliadas');
    const pintar = () => {
      const anios = sola == null ? I.anios_recortes : [sola];
      caja.innerHTML = `<div class="va-lb-c"><header><b>Punto ${esc(p.id)}</b>
        ${I.infrarrojo ? `<div class="pe-lg-modo"><button type="button" data-lir="0" aria-pressed="${!ir}">Color natural</button><button type="button" data-lir="1" aria-pressed="${ir}">Infrarrojo</button></div>` : ''}
        <div class="pe-lg-modo"><button type="button" data-sola="" aria-pressed="${sola == null}">Lado a lado</button>${I.anios_recortes.map((a) => `<button type="button" data-sola="${a}" aria-pressed="${sola === a}">${a}</button>`).join('')}</div>
        <button type="button" class="va-lb-x" aria-label="Cerrar">×</button></header>
        <div class="va-lb-imgs ${sola == null ? '' : 'una'}">${anios.map((a) => `<figure><div><img src="${urlChip(p, a, ir)}" alt="Sentinel-2 ${a}"><i style="width:${celda}%;height:${celda}%"></i></div><figcaption>${a}</figcaption></figure>`).join('')}</div>
        <p class="rs-note">Pulse un año para verlo solo y compare alternando entre años (teclas ← →). Esc para cerrar.</p></div>`;
      caja.querySelector('.va-lb-x').onclick = cerrar;
      caja.querySelectorAll('[data-lir]').forEach((b) => { b.onclick = () => { ir = b.dataset.lir === '1'; st.infrarrojo = ir; pintar(); }; });
      caja.querySelectorAll('[data-sola]').forEach((b) => { b.onclick = () => { sola = b.dataset.sola ? Number(b.dataset.sola) : null; pintar(); }; });
    };
    const teclas = (e) => {
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const xs = I.anios_recortes, n = xs.length, k = xs.indexOf(sola);
        sola = e.key === 'ArrowRight' ? xs[k < 0 ? 0 : (k + 1) % n] : xs[k < 0 ? n - 1 : (k - 1 + n) % n];
        pintar(); e.preventDefault();
      }
    };
    function cerrar() { document.removeEventListener('keydown', teclas, true); caja.remove(); renderInterpretacion(); }
    caja.addEventListener('click', (e) => { if (e.target === caja) cerrar(); });
    document.addEventListener('keydown', teclas, true);
    document.body.appendChild(caja);
    pintar();
  }
  /** Recorridos de revisión. Usan solo lo que el intérprete marcó, nunca la clase del mapa:
   *  la interpretación sigue siendo ciega. «al azar» es un subconjunto fijo de ~10 % de los puntos. */
  const azar = (id) => { let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10) === 0; };
  const FILTROS = {
    todos: { t: 'Todos los puntos', f: () => true },
    pendientes: { t: 'Sin interpretar', f: (x) => !x[campoClase()] },
    perdida: { t: 'Los que marqué como Pérdida', f: (x) => String(x[campoClase()]) === '1' },
    sin_evidencia: { t: 'Los que marqué sin evidencia', f: (x) => String(x[campoClase()]) === '0' },
    azar: { t: 'Revisión al azar (≈ 10 %)', f: (x) => azar(x.id) },
  };
  const enFiltro = () => st.muestra.map((x, j) => (FILTROS[st.filtro].f(x) ? j : -1)).filter((j) => j >= 0);
  function mover(paso) {
    const js = enFiltro();
    if (!js.length) return;
    const sig = paso > 0 ? js.find((j) => j > st.i) : [...js].reverse().find((j) => j < st.i);
    st.i = sig ?? (paso > 0 ? js[0] : js[js.length - 1]);
  }
  function renderInterpretacion() {
    const cont = $('#va-int');
    if (!st.muestra.length) { cont.innerHTML = '<p class="fi-pending">La muestra aún no se ha generado. En GitHub: Actions → «Generar muestra de validación».</p>'; return; }
    const hechos = st.muestra.filter((p) => p[campoClase()]).length;
    const p = st.muestra[st.i];
    cont.innerHTML = `<div class="va-int">
      <div class="va-int-map">${panelImagenes(p)}<div id="va-map"></div><p class="rs-note"><b>Recuadro amarillo:</b> la celda de ${st.diseno.escala_m} m que se clasifica. <b>Círculo:</b> 150 m alrededor, solo como contexto. Imagen de alta resolución Esri de una sola fecha (desconocida): muestra qué hay, no el cambio. Si quiere ver otras fechas, use <a target="_blank" rel="noopener" href="https://earth.google.com/web/@${p.lat},${p.lon},300a,800d,35y,0h,0t,0r">Google Earth</a> o Google Earth Pro con imágenes históricas (<a href="${valFile(`${st.mapa}/muestra.kml`)}" download>KML</a>).</p></div>
      <div class="va-int-form">
        <label class="rs-field va-filtro">Recorrer<select id="va-filtro">${Object.entries(FILTROS).map(([k, v]) => `<option value="${k}" ${st.filtro === k ? 'selected' : ''}>${v.t}${k === 'todos' ? '' : ` (${st.muestra.filter(v.f).length})`}</option>`).join('')}</select></label>
        ${st.filtro !== 'todos' ? `<p class="rs-note">Revise cada punto con las imágenes ampliadas y el infrarrojo; si cambia de opinión, elija la clase correcta (queda guardada). La lista se basa solo en lo que usted marcó, no en el mapa.</p>` : ''}
        <div class="va-prog"><span>Punto <b>${st.i + 1}</b> de ${st.muestra.length} · ${esc(p.id)}</span><i><b style="width:${hechos / st.muestra.length * 100}%"></b></i><small>${hechos} interpretados</small></div>
        <p class="rs-note">${number(p.lat, 5)}, ${number(p.lon, 5)} · el recuadro amarillo es el píxel de ${st.diseno.escala_m} m evaluado.</p>
        <label class="va-rev"><input type="checkbox" id="va-revisor" ${st.revisor ? 'checked' : ''}> Revisión de calidad (segundo intérprete: no ve la clase del primero)</label>
        <div class="va-clases">${[...st.diseno.leyenda, { codigo: 0, etiqueta: 'Sin evidencia suficiente', color: '#b0bec5', guia: 'Nubes, sombra, sin imagen de la fecha adecuada o cobertura ambigua. Se excluye del cálculo y se informa.' }].map((c) => `<button type="button" data-c="${c.codigo}" class="${String(p[campoClase()]) === String(c.codigo) ? 'on' : ''}"><i style="background:${c.color}"></i><b>${esc(c.etiqueta)}</b><small>${esc(c.guia || '')}</small></button>`).join('')}</div>
        <label class="rs-field">Confianza<select id="va-conf"><option value="">—</option>${['alta', 'media', 'baja'].map((x) => `<option ${p.confianza === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="rs-field">Fecha de la imagen usada<input id="va-fecha-img" type="date" value="${esc(p.fecha_imagen || '')}"></label>
        <label class="rs-field">Notas<input id="va-notas" value="${esc(p.notas || '')}" placeholder="Fecha de imagen, dudas, causa del cambio…"></label>
        <label class="rs-field">${st.revisor ? 'Segundo intérprete' : 'Intérprete'}<input id="va-interprete" value="${esc(localStorage.getItem('chcp-interprete') || '')}"></label>
        <div class="va-nav"><button class="btn btn-s" id="va-prev" type="button">← Anterior</button><button class="btn btn-s" id="va-sig-pend" type="button">Siguiente sin interpretar</button><button class="btn btn-p" id="va-next" type="button">Siguiente →</button></div>
        <div class="va-nav"><button class="btn btn-s" id="va-desc" type="button">Descargar muestra.csv</button><label class="btn btn-s va-file">Continuar desde un CSV<input type="file" id="va-cont" accept=".csv" hidden></label></div>
      </div></div>`;
    if (st.map) st.map.remove();
    if (G) G.activarTooltips($('#va-int'));
    const det = $('#va-int .va-guia'); if (det) det.addEventListener('toggle', () => { st.guiaVista = !det.open; });
    $$('#va-int [data-ampliar]').forEach((b) => b.addEventListener('click', () => ampliar(p)));
    $$('#va-int [data-ir]').forEach((b) => b.addEventListener('click', () => { st.infrarrojo = b.dataset.ir === '1'; renderInterpretacion(); }));
    st.map = L.map('va-map', { zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri World Imagery', maxZoom: 19 }).addTo(st.map);
    const m = st.diseno.escala_m / 2, dLat = m / 110540, dLon = m / (111320 * Math.cos(p.lat * Math.PI / 180));
    L.rectangle([[p.lat - dLat, p.lon - dLon], [p.lat + dLat, p.lon + dLon]], { color: '#ffeb3b', weight: 2, fill: false }).addTo(st.map);
    L.circle([p.lat, p.lon], { radius: 150, color: '#fff', weight: 1, dashArray: '3 4', fill: false }).addTo(st.map);
    st.map.setView([p.lat, p.lon], 17);
    const guardar = () => {
      p.confianza = $('#va-conf').value; p.notas = $('#va-notas').value;
      p.fecha_imagen = $('#va-fecha-img').value || p.fecha_imagen || '';
      if (st.revisor) p.interprete_2 = $('#va-interprete').value; else p.interprete = $('#va-interprete').value;
      try { localStorage.setItem('chcp-interprete', $('#va-interprete').value); } catch (_) { /* */ }
      if (p[campoClase()] && !p.fecha) p.fecha = new Date().toISOString().slice(0, 10);
      if (p[campoClase()] && !p.fuente_imagen) p.fuente_imagen = st.imagenes ? 'Sentinel-2 sin nubes (mediana anual) / Sentinel-1' : 'Esri World Imagery / Google Earth';
      guardarLocal();
    };
    $$('.va-clases button').forEach((b) => b.addEventListener('click', () => {
      const actual = st.i; p[campoClase()] = b.dataset.c; guardar();
      if (st.filtro === 'todos') { if (st.i < st.muestra.length - 1) st.i += 1; } else { st.i = actual; mover(1); }
      renderInterpretacion();
    }));
    $('#va-filtro').addEventListener('change', (e) => { guardar(); st.filtro = e.target.value; const js = enFiltro(); if (js.length && !js.includes(st.i)) st.i = js[0]; renderInterpretacion(); });
    ['#va-conf', '#va-notas', '#va-interprete', '#va-fecha-img'].forEach((s) => $(s).addEventListener('change', guardar));
    $('#va-revisor').addEventListener('change', (e) => { st.revisor = e.target.checked; renderInterpretacion(); });
    $('#va-prev').addEventListener('click', () => { guardar(); if (st.filtro === 'todos') st.i = Math.max(0, st.i - 1); else mover(-1); renderInterpretacion(); });
    $('#va-next').addEventListener('click', () => { guardar(); if (st.filtro === 'todos') st.i = Math.min(st.muestra.length - 1, st.i + 1); else mover(1); renderInterpretacion(); });
    $('#va-sig-pend').addEventListener('click', () => { guardar(); const k = st.muestra.findIndex((x, j) => j > st.i && !x[campoClase()]); st.i = k >= 0 ? k : st.muestra.findIndex((x) => !x[campoClase()]); if (st.i < 0) st.i = 0; renderInterpretacion(); });
    $('#va-desc').addEventListener('click', () => { guardar(); descargar('muestra.csv', csv(), 'text/csv'); });
    $('#va-cont').addEventListener('change', async (e) => {
      const filas = V.leerCsv(await e.target.files[0].text());
      const m2 = new Map(filas.map((f) => [f.id, f]));
      st.muestra.forEach((x) => { const f = m2.get(x.id); if (f) ['clase_referencia', 'confianza', 'fecha_imagen', 'fuente_imagen', 'interprete', 'fecha', 'interprete_2', 'clase_referencia_2', 'clase_final', 'resolucion', 'notas'].forEach((k) => { if (f[k]) x[k] = f[k]; }); });
      guardarLocal(); renderInterpretacion();
    });
  }

  // ------------------------------------------------------------ carga por mapa
  function codigoReferencia(valor) {
    const v = String(valor || '').trim().toLowerCase();
    if (['0', 'sin_evidencia', 'sin evidencia', 'sin evidencia suficiente'].includes(v)) return 0;
    const c = st.diseno.leyenda.find((x) => [String(x.codigo), x.clave, x.etiqueta.toLowerCase()].includes(v));
    return c ? c.codigo : null;
  }
  function calcularLocal(filas) {
    if (!st.estratos) return '<p class="rs-warn">Cargue también el archivo <code>estratos.csv</code> de la muestra. No se descarga en esta página para mantener la interpretación ciega; debe usarlo solo quien calcula los resultados, después de interpretar.</p>';
    const pares = filas.map((f) => [st.estratos.get(f.id), codigoReferencia(f.clase_final || f.clase_referencia)]).filter(([a, b]) => a != null && b != null && b !== 0);
    const codigos = st.diseno.leyenda.map((c) => c.codigo);
    const conteos = V.matrizConteos(pares, codigos);
    const insuf = codigos.filter((c, i) => Number(st.diseno.areas_ha[String(c)]) > 0 && conteos[i].reduce((s, v) => s + v, 0) < 2);
    if (insuf.length) return `<p class="rs-warn">${pares.length} puntos interpretados. Faltan al menos 2 por estrato para calcular (${insuf.map((c) => esc(st.diseno.leyenda.find((x) => x.codigo === c).etiqueta)).join(', ')}).</p>`;
    const areas = Object.fromEntries(codigos.map((c) => [c, Number(st.diseno.areas_ha[String(c)])]));
    return renderResultados(V.evaluar(codigos, areas, conteos), st.diseno.leyenda, `<p class="rs-warn"><b>Cálculo local, no publicado.</b> ${pares.length} de ${filas.length} puntos interpretados.</p>`);
  }
  async function cargarMapa(clave) {
    st.mapa = clave; st.i = 0;
    try {
      [st.diseno, st.resultados] = await Promise.all([obtener(`${clave}/diseno.json`), obtener(`${clave}/resultados.json`).catch(() => null)]);
      st.estratos = null;  // interpretación ciega: la clase del mapa no se descarga en esta página
      st.muestra = V.leerCsv(await obtener(`${clave}/muestra.csv`, 'text')).map((f) => ({ ...f, lon: Number(f.lon), lat: Number(f.lat) }));
    } catch (_) { st.diseno = null; st.muestra = []; }
    // Imágenes sin nubes (Sentinel-2) y series NDVI / radar por punto, si ya se prepararon.
    [st.imagenes, st.series] = await Promise.all([obtener(`${clave}/imagenes/indice.json`).catch(() => null), obtener(`${clave}/imagenes/series.json`).catch(() => null)]);
    if (!st.diseno) return;
    cargarLocal();
    const d = st.diseno;
    $('#va-diseno').innerHTML = `<p>${esc(d.descripcion || '')}</p><table class="fi-table"><thead><tr><th>Estrato (clase del mapa)</th><th>Superficie</th><th>Peso</th><th>Puntos</th><th>Interpretados (publicado)</th></tr></thead><tbody>${d.leyenda.map((c) => { const a = Number(d.areas_ha[String(c.codigo)]); const tot = Object.values(d.areas_ha).reduce((s, v) => s + Number(v), 0); return `<tr><td><i class="fi-dot" style="background:${c.color}"></i>${esc(c.etiqueta)}</td><td>${ha(a)}</td><td>${pct(a / tot, 1)}</td><td>${d.n_obtenido?.[String(c.codigo)] ?? d.asignacion[String(c.codigo)]}</td><td>${st.resultados?.por_estrato?.[String(c.codigo)] ?? 0}</td></tr>`; }).join('')}</tbody></table><p class="rs-note">Muestra aleatoria estratificada de ${number(st.muestra.length, 0)} puntos (semilla ${d.semilla}, ${esc(String(d.generado).slice(0, 10))}), error estándar objetivo ${d.error_objetivo}, mínimo ${d.minimo_por_estrato} por estrato. <a href="${valFile(`${clave}/muestra.csv`)}" download>muestra.csv</a> · <a href="${valFile(`${clave}/muestra.kml`)}" download>muestra.kml</a></p>`;
    const r = st.resultados;
    $('#va-estado').innerHTML = r ? `<b>${r.interpretados}</b> de ${r.total_puntos} puntos interpretados${r.completo ? ' · muestra completa' : ''}` : 'Sin interpretaciones publicadas';
    const qc = r?.control_calidad;
    const qcTxt = qc ? `<p class="rs-note">Control de calidad: ${qc.revisados_segundo_interprete} punto(s) revisados por un segundo intérprete${qc.acuerdo_entre_interpretes_pct == null ? '' : ` (acuerdo ${number(qc.acuerdo_entre_interpretes_pct, 0)} %)`}; ${qc.desacuerdos_pendientes} desacuerdo(s) pendiente(s); ${qc.sin_evidencia_excluidos} punto(s) sin evidencia suficiente excluidos; ${qc.puntos_sin_fecha_de_imagen} sin fecha de imagen registrada.</p>` : '';
    if (r?.resultado && r.completo) $('#va-res').innerHTML = `<p class="va-tag"><span class="t-full">Validación independiente completa</span> Muestra completa, revisada y sin desacuerdos pendientes.</p>${qcTxt}` + renderResultados(r.resultado, d.leyenda);
    else if (r?.resultado) {
      const cerrada = qc && r.interpretados + qc.sin_evidencia_excluidos === r.total_puntos && !qc.desacuerdos_pendientes;
      const aviso = cerrada
        ? `<p class="va-tag"><span class="t-pre">Resultados preliminares</span> Muestra interpretada completa (${r.interpretados} de ${r.total_puntos} puntos válidos), por un solo intérprete. Falta la revisión independiente de un segundo intérprete en al menos el 10 % de los puntos: cítense como estimación preliminar, indicando esa limitación.</p>`
        : `${PENDIENTE}<p class="va-tag"><span class="t-pre">Resultados preliminares</span> ${r.interpretados} de ${r.total_puntos} puntos interpretados. No deben citarse como exactitud del mapa hasta completar la muestra y su control de calidad.</p>`;
      $('#va-res').innerHTML = aviso + qcTxt + renderResultados(r.resultado, d.leyenda);
    }
    else { $('#va-res').innerHTML = '<div id="va-ej"></div>'; ejemplo($('#va-ej')); }
    renderInterpretacion();
  }

  // ------------------------------------------------------------ inicio
  try { st.indice = await obtener('indice.json'); } catch (_) { st.indice = { mapas: [] }; }
  if (!st.indice.mapas.length) {
    $('#va-mapa').innerHTML = '<option>Sin muestras generadas</option>';
    $('#va-diseno').innerHTML = '<p class="fi-pending">Todavía no se ha generado ninguna muestra de validación. En GitHub: <b>Actions → «Generar muestra de validación»</b> (elija «senal_perdida»). Tarda unos minutos y crea los puntos a interpretar.</p>';
    $('#va-res').innerHTML = '<div id="va-ej"></div>'; ejemplo($('#va-ej'));
    $('#va-int').innerHTML = '<p class="fi-pending">La herramienta de interpretación aparecerá cuando exista la muestra.</p>';
  } else {
    $('#va-mapa').innerHTML = st.indice.mapas.map((m) => `<option value="${m.mapa}">${esc(m.titulo)}</option>`).join('');
    $('#va-mapa').addEventListener('change', (e) => cargarMapa(e.target.value));
    await cargarMapa(st.indice.mapas[0].mapa);
  }
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'a' && e.key !== 'A') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, select, textarea, [contenteditable]') || document.querySelector('.va-lb')) return;
    const p = st.muestra[st.i];
    if (p && st.imagenes && $('#va-int .va-img')) { e.preventDefault(); ampliar(p); }
  });
  $('#va-archivo').addEventListener('change', async (e) => {
    if (!st.diseno) { $('#va-propio').innerHTML = '<p class="rs-warn">Primero debe existir una muestra generada (diseño y estratos).</p>'; return; }
    const archivos = [...e.target.files];
    let muestra = null;
    for (const a of archivos) {
      const filas = V.leerCsv(await a.text());
      if (filas.length && 'clase_mapa' in filas[0]) st.estratos = new Map(filas.map((f) => [f.id, Number(f.clase_mapa)]));
      else muestra = filas;
    }
    $('#va-propio').innerHTML = muestra ? calcularLocal(muestra) : '<p class="rs-warn">Seleccione el archivo muestra.csv interpretado (y estratos.csv).</p>';
  });
})();
