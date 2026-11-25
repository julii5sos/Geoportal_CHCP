/* Plataforma SIG del sitio publicado, organizada por temas (como MapBiomas): a la izquierda
   los temas y «Mi geometría»; en el centro el mapa con su leyenda y la barra de años; a la
   derecha las gráficas del tema para la cuenca, la subcuenca o el polígono elegido.
   Todo sale de resultados precalculados con Earth Engine; no hay Earth Engine en el navegador. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api, mapFile, serieFile } = window.CHCP;
  const icon = window.CHCP_ICON || (() => '');
  const G = window.CHCP_GRAF;
  const PRIO = { Alta: '#d0442c', Media: '#f28e2b', Preventiva: '#fabc20', Baja: '#77cc09' };
  const COLOR_CORREDOR = { Alta: '#1b5e20', Mediana: '#9ccc65', 'Media-baja': '#ffb74d' };
  const BASES = [
    ['gris', 'Gris claro', 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', '#e9ecef'],
    ['satelite', 'Satélite', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '#3d5a40'],
    ['topo', 'Topográfico', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', '#d9e4c8'],
  ];
  const st = { data: null, territory: null, series: null, est: {}, id: 'chcp', map: null, base: null, activas: new Set(['cuenca']), opacidad: 0.85, capas: {}, geo: null, vistaPol: null,
    tema: 'preev', modo: null, colorParches: 'importancia', aux: new Set(), anio: {}, ocultas: {}, comparar: {}, rankClase: {}, analisis: [] };
  const pct = (v, d = 0) => (v == null ? '—' : `${number(v, d)} %`);
  const t = () => st.data.territorios[st.id];
  const conMapas = () => (t()?.mapas?.capas?.length ? t() : st.data.territorios.chcp);
  const enlace = (ruta) => (window.CHCP_STATIC ? `${ruta}.html` : `/${ruta}`);
  const tarjeta = (n, v, s2 = '') => `<div class="pe-m"><span>${n}</span><b>${v}</b>${s2 ? `<small>${s2}</small>` : ''}</div>`;
  const tabla = (cab, filas) => `<table class="fi-table pe-t"><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const NOMBRES_FUENTE = { tmf: 'JRC TMF', hansen: 'Hansen GFC', esri: 'ESRI LULC', gedi: 'GEDI', ndvi: 'NDVI Sentinel-2' };
  // Con un polígono analizado, los mapas salen de las subcuencas que toca (y de la cuenca
  // completa debajo si alguna aún no tiene mapas detallados), recortados al polígono.
  function fuentesMapa() {
    if (!st.vistaPol) return [conMapas()];
    const xs = st.vistaPol.ids.map((id) => st.data.territorios[id]);
    const con = xs.filter((x) => x?.mapas?.capas?.length);
    return con.length === xs.length ? con : [st.data.territorios.chcp, ...con];
  }
  const geoParches = () => (st.vistaPol ? st.vistaPol.geo : st.id !== 'chcp' ? st.geo : null);

  // ------------------------------------------------------------ temas (columna izquierda)
  // Un tema a la vez, como en MapBiomas: cada tema activa su mapa, su leyenda, su barra de
  // años (si tiene serie anual) y sus gráficas en el panel de la derecha.
  const TEMAS = [
    { grupo: 'Cambio de cobertura', items: [
      { k: 'preev', q: '¿Ha perdido bosque esta zona?', t: 'Preevaluación MT-2026.7', i: 'shield', capas: ['r:coincidencia'], d: 'Las cinco fuentes juntas: dónde coinciden las señales de pérdida de JRC, Hansen y ESRI, con NDVI y GEDI como apoyo. Puntaje 0–6,5.' },
      { k: 'jrc', q: '¿Cómo ha cambiado el bosque desde 1990?', t: 'Bosque tropical · JRC TMF', i: 'forest', prod: 'jrc', capas: ['r:jrc_2025'], d: 'Estado del bosque húmedo cada año desde 1990: sin perturbación, degradado, deforestado o en regeneración (Landsat, 30 m).' },
      { k: 'hansen', q: '¿Cuándo se perdió la cobertura arbórea?', t: 'Pérdida arbórea · Hansen', i: 'loss', prod: 'hansen', capas: ['r:hansen'], d: 'Año en que se perdió la cobertura arbórea, 2001–2025 (Landsat, 30 m). El índice usa solo 2021–2025.' },
      { k: 'esri', q: '¿Qué reemplazó a los árboles?', t: 'Cobertura y uso · ESRI', i: 'layers', prod: 'esri', capas: ['r:esri_cambio'], d: 'Clase de cobertura de cada año, 2017–2025 (Sentinel-2, 10 m): árboles, pastizal, cultivos, área construida, agua…' },
      { k: 'ndvi', q: '¿La vegetación está perdiendo vigor?', t: 'Vigor de la vegetación · NDVI', i: 'sprout', prod: 'ndvi', capas: ['r:ndvi_cambio'], d: 'Vigor de la vegetación de cada año, 2017–2025 (Sentinel-2): de sin vegetación activa a vegetación densa.' },
      { k: 'gedi', q: '¿Qué tan alto es el bosque?', t: 'Altura del dosel · GEDI', i: 'trend', capas: ['v:gedi'], d: 'Altura media del dosel (láser GEDI, 100 m). Referencia estructural fija, sin serie anual.' },
    ] },
    { grupo: 'Cobertura oficial', items: [
      { k: 'sinia', q: '¿Qué dice la cartografía oficial?', t: 'Cobertura oficial · SINIA', i: 'polygon', capas: ['r:sinia_2021'], d: 'Bosques y otras tierras boscosas de MiAMBIENTE (2021). Base de la fragmentación y la conectividad.' },
    ] },
    { grupo: 'Paisaje y conectividad', items: [
      { k: 'frag', q: '¿Qué tan fragmentado está el bosque?', t: 'Fragmentación y conectividad', i: 'network', capas: ['parches', 'brechas'], d: 'Parches del bosque oficial 2021, su importancia en la red y las brechas candidatas a reconexión.' },
      { k: 'corr', q: '¿Se conecta con los corredores biológicos?', t: 'Corredores biológicos', i: 'route', capas: ['corredores', 'puntos'], d: 'Corredores del Almanaque Azul, Corredor Biológico Mesoamericano y puntos críticos.' },
      { k: 'rip', q: '¿Hay bosque junto a los ríos?', t: 'Ríos y franjas riparias', i: 'leaf', capas: ['rios', 'r:riparia'], d: 'Bosque en franjas de 30, 50 y 100 m junto a los cauces (hidrografía IGNTG).' },
      { k: 'eri', q: '¿Qué tan resiliente es el paisaje?', t: 'Resiliencia ecológica (ERI)', i: 'sprout', capas: ['r:eri'], d: 'Índice indicativo 0–100 de integridad, conectividad local, relieve y cercanía a ríos.' },
    ] },
  ];
  const TEMA = Object.fromEntries(TEMAS.flatMap((g) => g.items.map((x) => [x.k, x])));
  const AUXILIARES = ['subcuencas', 'corredores', 'puntos', 'rios', 'sitios'];

  // ------------------------------------------------------------ catálogo de capas fijas
  function catalogo() {
    const raster = (st.data.capas_mapa || []).map((c) => ({ k: `r:${c.clave}`, nombre: c.titulo, nota: c.lectura, disponible: fuentesMapa().some((f) => f?.mapas?.capas?.includes(c.clave)), capa: c }));
    return [
      { k: 'subcuencas', nombre: 'Límites de subcuencas', disponible: true, color: '#0a4393' },
      { k: 'corredores', nombre: 'Corredores · Almanaque Azul', disponible: true, color: '#9ccc65' },
      { k: 'puntos', nombre: 'Puntos críticos · Almanaque Azul', disponible: true, color: '#f04438' },
      { k: 'rios', nombre: 'Ríos (IGNTG 2022)', disponible: fuentesMapa().some((f) => f?.mapas?.rios), color: '#1f78b4' },
      { k: 'sitios', nombre: 'Sitios para verificación de campo', disponible: Object.values(st.data.territorios).some((x) => x?.sitios?.length), color: '#6a1b9a' },
      ...raster,
      { k: 'parches', nombre: 'Parches de bosque 2021 por importancia', disponible: !!geoParches(), color: '#1b5e20' },
      { k: 'brechas', nombre: 'Brechas candidatas a reconexión', disponible: !!geoParches(), color: '#ff5252' },
    ];
  }

  // ------------------------------------------------------------ series anuales
  // Territorios cuyas series se usan: la cuenca o subcuenca elegida, o las subcuencas que toca el polígono.
  const idsVista = () => (st.vistaPol ? st.vistaPol.ids : [st.id]);
  const prodInfo = (prod) => st.series?.productos?.[prod];
  function haySerie(prod) {
    if (!prod || !prodInfo(prod)) return false;
    return idsVista().some((id) => st.series.territorios?.[id]?.mapas?.[prod]);
  }
  const ANIO_INICIAL = { jrc: 2025, hansen: 2025, esri: 2024, ndvi: 2025 };
  const anioActual = (prod) => st.anio[prod] ?? ANIO_INICIAL[prod] ?? prodInfo(prod)?.anios?.slice(-1)[0];
  function capasTema() {
    const T = TEMA[st.tema];
    const s = new Set(['cuenca', ...st.aux]);
    if (T.prod && haySerie(T.prod)) s.add(`s:${T.prod}`);
    else (T.capas || []).forEach((c) => s.add(c));
    return s;
  }
  const cacheBytes = new Map();
  function bytesCache(url) {
    if (!cacheBytes.has(url)) cacheBytes.set(url, bytes(url).catch((e) => { cacheBytes.delete(url); throw e; }));
    return cacheBytes.get(url);
  }
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  /** Tabla valor → color para colorear un PNG de valores (null = transparente). */
  function lutSerie(prod, anio) {
    const lut = new Array(256).fill(null), ocultas = st.ocultas[prod] || new Set();
    prodInfo(prod).clases.forEach((c) => {
      if (ocultas.has(c.valor)) return;
      if (prod === 'hansen' && c.valor > anio - 2000) return; // pérdida acumulada hasta el año elegido
      lut[c.valor] = hex(c.color);
    });
    return lut;
  }
  const GEDI_CLASES = [[0, 5, '#edf8e9', 'Menos de 5 m'], [5, 10, '#bae4b3', '5–10 m'], [10, 15, '#74c476', '10–15 m'], [15, 20, '#31a354', '15–20 m'], [20, 99, '#006d2c', '20 m o más']];
  function lutGedi() {
    const c = st.data.codificacion_valores?.gedi, lut = new Array(256).fill(null);
    if (!c) return lut;
    for (let q = 0; q < 255; q += 1) { const v = c.minimo + q * c.paso; const k = GEDI_CLASES.find(([a, b]) => v >= a && v < b); if (k) lut[q] = hex(k[2]); }
    return lut;
  }
  function colorear({ v, w, h }, lut) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (let i = 0; i < v.length; i += 1) { const k = lut[v[i]]; if (k) { const j = i * 4; d[j] = k[0]; d[j + 1] = k[1]; d[j + 2] = k[2]; d[j + 3] = 255; } }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  async function capaSerie(prod) {
    const anio = anioActual(prod), lut = lutSerie(prod, anio), grupo = L.layerGroup();
    for (const id of idsVista()) {
      const meta = st.series.territorios?.[id]?.mapas?.[prod];
      if (!meta) continue;
      const archivo = prod === 'hansen' ? 'hansen.v.png' : `${prod}_${anio}.v.png`;
      try {
        const b = await bytesCache(serieFile(`mapas/${id}/${archivo}`));
        L.imageOverlay(colorear(b, lut), meta.limites, { opacity: st.opacidad, interactive: false, pane: 'rasters', className: 'pe-raster' }).addTo(grupo);
      } catch (_) { /* mapa de ese año aún no calculado */ }
    }
    return grupo;
  }
  async function capaGedi() {
    const grupo = L.layerGroup(), lut = lutGedi();
    for (const f of fuentesMapa().filter((x) => x?.mapas?.valores?.includes('gedi'))) {
      try { const b = await bytesCache(mapFile(f.id, 'gedi.v.png')); L.imageOverlay(colorear(b, lut), f.mapas.limites, { opacity: st.opacidad, interactive: false, pane: 'rasters', className: 'pe-raster' }).addTo(grupo); } catch (_) { /* sin GEDI */ }
    }
    return grupo;
  }
  /** Superficies por año de un producto para la vista actual (territorio o polígono). */
  async function datosSerie(prod) {
    if (!haySerie(prod)) return null;
    if (st.vistaPol) return seriePoligono(prod);
    if (!(st.id in st.est)) st.est[st.id] = await fetch(serieFile(`estadisticas/${st.id}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    return st.est[st.id]?.[prod] || null;
  }

  // ------------------------------------------------------------ mapa
  let turnoDibujo = 0;
  async function dibujar() {
    const turno = ++turnoDibujo;
    const map = st.map;
    st.activas = capasTema();
    const nuevas = {};
    const fuente = conMapas(), fuentes = fuentesMapa();
    const orden = catalogo().filter((c) => c.disponible && st.activas.has(c.k));
    for (const k of [...st.activas].filter((x) => x.startsWith('s:'))) nuevas[k] = await capaSerie(k.slice(2));
    if (st.activas.has('v:gedi')) nuevas['v:gedi'] = await capaGedi();
    if (turno !== turnoDibujo) return; // otra petición más reciente ya está dibujando
    Object.values(st.capas).forEach((l) => map.removeLayer(l));
    st.capas = nuevas;
    Object.values(nuevas).forEach((l) => l.addTo(map));
    for (const c of orden.filter((x) => x.k.startsWith('r:'))) {
      st.capas[c.k] = L.layerGroup(fuentes.filter((f) => f.mapas.capas.includes(c.capa.clave)).map((f) => L.imageOverlay(mapFile(f.id, `${c.capa.clave}.png`), f.mapas.limites, { opacity: st.opacidad, interactive: false, pane: 'rasters', className: 'pe-raster' }))).addTo(map);
    }
    if (st.activas.has('cuenca')) {
      // Solo el contorno de la cuenca (y de la subcuenca elegida). Las 53 subcuencas quedan
      // invisibles: se resaltan al pasar el cursor y se eligen con un clic.
      const grupo = L.layerGroup().addTo(map); st.capas.cuenca = grupo;
      if (!st.vistaPol && !st.activas.has('subcuencas')) {
        const base = { color: '#0a4393', weight: 0, fillOpacity: 0, opacity: 0 };
        L.geoJSON(st.territory.subbasins, { style: base, onEachFeature: (f, l) => { clicSubcuenca(f, l); l.on('mouseover', () => l.setStyle({ weight: 1.5, opacity: 0.9 })); l.on('mouseout', () => l.setStyle(base)); } }).addTo(grupo);
      }
      L.geoJSON(st.territory.basin, { style: { color: '#0a4393', weight: 2.5, fill: false }, interactive: false }).addTo(grupo);
      const elegida = !st.vistaPol && st.id !== 'chcp' && st.territory.subbasins.features.find((x) => x.properties.id === st.id);
      if (elegida) L.geoJSON(elegida, { style: { color: '#f5b700', weight: 3, fill: false }, interactive: false }).addTo(grupo);
    }
    if (st.activas.has('subcuencas')) {
      st.capas.subcuencas = L.geoJSON(st.territory.subbasins, { style: (f) => ({ color: f.properties.id === st.id && !st.vistaPol ? '#ffd54f' : '#0a4393', weight: f.properties.id === st.id && !st.vistaPol ? 3 : 1, fillOpacity: 0 }), onEachFeature: clicSubcuenca }).addTo(map);
    }
    if (st.activas.has('corredores')) st.capas.corredores = L.geoJSON(st.territory.corridors, { style: (f) => { const c = COLOR_CORREDOR[f.properties.categoria_etiqueta] || '#7fae00'; return { color: c, weight: 1.4, fillColor: c, fillOpacity: 0.15 }; }, onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties.nombre)} · conectividad ${esc(f.properties.categoria_etiqueta)}`) }).addTo(map);
    if (st.activas.has('rios')) {
      const grupo = L.layerGroup().addTo(map); st.capas.rios = grupo;
      for (const f of fuentes.filter((x) => x.mapas?.rios)) {
        try { const rios = await (await fetch(mapFile(f.id, 'rios.json'))).json(); L.geoJSON(rios, { style: { color: '#1f78b4', weight: 2 }, interactive: false, pane: 'rasters' }).addTo(grupo); } catch (_) { /* sin ríos */ }
      }
    }
    const geoP = geoParches();
    if (st.activas.has('parches') && geoP) {
      const porRed = st.colorParches === 'red', colorRed = coloresRed(geoP.parches);
      const fill = (p) => (porRed ? colorRed.get(redDe(p)) : COLOR_IMPORTANCIA[p.prioridad_conectividad] || '#9ccc65');
      st.capas.parches = L.geoJSON(geoP.parches, { pane: st.vistaPol ? 'rasters' : 'overlayPane', style: (f) => ({ color: '#0b3d17', weight: 0.6, fillColor: fill(f.properties), fillOpacity: 0.85 }), onEachFeature: (f, l) => l.bindTooltip(`Parche #${f.properties.patch_id} · ${hectares(f.properties.area_ha)} · importancia ${f.properties.prioridad_conectividad || '—'}${porRed ? ` · ${colorRed.get(redDe(f.properties)) === PALETA_RED[0] ? 'red principal' : 'otra red'}` : ''}`) }).addTo(map);
    }
    if (st.activas.has('brechas') && geoP) st.capas.brechas = L.geoJSON(geoP.brechas, { pane: st.vistaPol ? 'rasters' : 'overlayPane', style: { color: '#ff5252', weight: 3, dashArray: '6 5' } }).addTo(map);
    if (st.activas.has('puntos')) st.capas.puntos = L.geoJSON(st.territory.critical_points, { pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f04438', fillOpacity: 1 }), onEachFeature: (f, l) => l.bindTooltip(esc(f.properties.notas || 'Punto crítico'), { maxWidth: 280 }) }).addTo(map);
    if (st.activas.has('sitios')) {
      const sitios = Object.values(st.data.territorios).filter((x) => x && (st.id === 'chcp' || x.id === st.id)).flatMap((x) => (x.sitios || []).map((s) => ({ ...s, sub: x.nombre })));
      st.capas.sitios = L.layerGroup(sitios.map((s) => L.circleMarker([s.lat, s.lon], { radius: 4 + s.fuentes * 2, color: '#fff', weight: 1.2, fillColor: '#6a1b9a', fillOpacity: 0.9 }).bindTooltip(`${esc(s.id)} · ${hectares(s.area_ha)} · ${s.fuentes} fuente(s)`))).addTo(map);
    }
    // Recorte visual: fuera del polígono analizado, o de la subcuenca elegida, todo queda velado.
    const f = !st.vistaPol && st.id !== 'chcp' && st.territory.subbasins.features.find((x) => x.properties.id === st.id);
    if (st.vistaPol || f) {
      const huecos = (st.vistaPol ? P.poligonos(pg.geo) : f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p[0].map(([x, y]) => [y, x]));
      st.capas.mascara = L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], ...huecos], { pane: 'mascara', stroke: false, fillColor: '#eef1f4', fillOpacity: 0.9, interactive: false }).addTo(map);
    }
    const aviso = $('#pe-aviso');
    const hayMapa = orden.some((c) => c.k.startsWith('r:'));
    const reutiliza = !st.vistaPol && st.id !== 'chcp' && fuente.id === 'chcp' && hayMapa;
    const mixto = st.vistaPol && fuentes[0].id === 'chcp' && hayMapa;
    aviso.hidden = !reutiliza && !mixto;
    if (mixto) aviso.innerHTML = `Parte del polígono cae en subcuencas sin mapas detallados: allí se muestra el mapa de la cuenca completa (píxel de ${number(st.data.territorios.chcp.mapas.tamano_pixel_m, 0)} m), solo como referencia visual: esa parte no entra en las cifras. Los mapas detallados se generan ${window.CHCP.pendiente()}.`;
    if (reutiliza) aviso.innerHTML = `Los mapas detallados de ${esc(t().nombre)} aún no se han generado: se muestra el mapa de la cuenca completa (píxel de ${number(fuente.mapas.tamano_pixel_m, 0)} m) recortado a la subcuenca. Se reemplazará por la versión de 10–30 m ${window.CHCP.pendiente()}.`;
    leyenda(orden);
    barraAnios();
  }
  // Mismos colores que el simulador: la red con más bosque en verde y un color por cada otra red.
  const COLOR_IMPORTANCIA = { Alta: '#1b5e20', Media: '#66bb6a', Baja: '#c5e1a5' };
  const PALETA_RED = ['#1b7837', '#2166ac', '#b2182b', '#762a83', '#e08214', '#01665e', '#c51b7d', '#8c510a', '#4d9221', '#35978f', '#5e3c99', '#d6604d'];
  const redDe = (p) => `${p.subcuenca || ''}:${p.componente}`;
  function coloresRed(fc) {
    const area = new Map();
    fc.features.forEach((f) => { const k = redDe(f.properties); area.set(k, (area.get(k) || 0) + (f.properties.area_ha || 0)); });
    const orden = [...area].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return new Map(orden.map((k, i) => [k, i === 0 ? PALETA_RED[0] : PALETA_RED[1 + ((i - 1) % (PALETA_RED.length - 1))]]));
  }
  function clicSubcuenca(f, l) {
    const x = st.data.territorios[f.properties.id];
    l.bindTooltip(`${esc(f.properties.nombre)}${x ? ` · ${number(x.preevaluacion.puntaje, 1)} pts (${esc(x.preevaluacion.prioridad)})` : ''}`, { sticky: true });
    l.on('click', () => { if (!pg.dibujando) seleccionar(f.properties.id); });
  }

  // ------------------------------------------------------------ leyenda flotante
  function leyenda(orden) {
    const T = TEMA[st.tema];
    const prod = T.prod && haySerie(T.prod) ? T.prod : null;
    let cuerpo = '';
    if (prod) {
      const info = prodInfo(prod), ocultas = st.ocultas[prod] || new Set();
      cuerpo = prod === 'hansen'
        ? `<div class="pe-lg"><b>Año de la pérdida</b><div class="fi-ramp"><i style="background:linear-gradient(90deg,${info.clases.map((c) => c.color).join(',')})"></i><span><em>2001</em><em>${anioActual(prod)}</em></span></div><p class="pe-lg-nota">Pérdida acumulada de 2001 hasta el año elegido.</p></div>`
        : `<div class="pe-lg"><b>${esc(info.corto)} · ${anioActual(prod)}</b>${info.clases.map((c) => `<label class="pe-lg-cl"><input type="checkbox" data-cl="${c.valor}" ${ocultas.has(c.valor) ? '' : 'checked'}><i style="background:${c.color}"></i>${esc(c.etiqueta)}</label>`).join('')}<p class="pe-lg-nota">Desmarque una clase para ocultarla en el mapa.</p></div>`;
    } else if (st.tema === 'gedi') {
      cuerpo = `<div class="pe-lg"><b>Altura media del dosel</b>${GEDI_CLASES.map(([, , c, n]) => `<div><i style="background:${c}"></i>${n}</div>`).join('')}</div>`;
    }
    const bloques = orden.filter((c) => !AUXILIARES.includes(c.k) || c.k === 'corredores' || c.k === 'puntos').map((c) => {
      if (c.capa) {
        const ley = c.capa.tipo === 'continuo' ? `<div class="fi-ramp"><i style="background:linear-gradient(90deg,${c.capa.paleta.join(',')})"></i><span>${c.capa.leyenda.map((x) => `<em>${esc(x.etiqueta)}</em>`).join('')}</span></div>` : c.capa.leyenda.map((x) => `<div><i style="background:${x.color}"></i>${esc(x.etiqueta)}</div>`).join('');
        return `<div class="pe-lg"><b>${esc(c.capa.titulo)}</b>${ley}</div>`;
      }
      if (c.k === 'corredores') return `<div class="pe-lg"><b>Corredores (Almanaque Azul)</b>${Object.entries(COLOR_CORREDOR).map(([k, v]) => `<div><i style="background:${v}"></i>${k}</div>`).join('')}</div>`;
      if (c.k === 'parches') {
        const porRed = st.colorParches === 'red';
        const nRedes = porRed ? new Set(geoParches().parches.features.map((f) => redDe(f.properties))).size : 0;
        return `<div class="pe-lg"><b>Parches de bosque 2021</b><div class="pe-lg-modo" role="radiogroup" aria-label="Colorear los parches por"><button type="button" data-cp="importancia" aria-pressed="${!porRed}">Importancia</button><button type="button" data-cp="red" aria-pressed="${porRed}">Red</button></div>
          ${porRed ? `<div><i style="background:${PALETA_RED[0]}"></i>Red principal (la de más bosque)</div>${nRedes > 1 ? `<div><i style="background:linear-gradient(90deg,${PALETA_RED.slice(1, 5).join(',')})"></i>Otras redes: un color por red (${nRedes - 1})</div>` : '<p class="pe-lg-nota">Todo el bosque forma una sola red.</p>'}<p class="pe-lg-nota">Como en el simulador: parches a menos de 500 m forman una red.</p>`
          : `<div><i style="background:${COLOR_IMPORTANCIA.Alta}"></i>Alta</div><div><i style="background:${COLOR_IMPORTANCIA.Media}"></i>Media</div><div><i style="background:${COLOR_IMPORTANCIA.Baja}"></i>Baja</div><p class="pe-lg-nota">Importancia del parche para la conectividad (dIIC).</p>`}</div>`;
      }
      return `<div class="pe-lg"><div><i style="background:${c.color}"></i>${esc(c.nombre)}</div></div>`;
    });
    const aux = catalogo().filter((c) => AUXILIARES.includes(c.k));
    $('#pe-legend').innerHTML = `<button type="button" class="legend-head" aria-expanded="true"><b>${esc(T.t)}</b><i class="chev"></i></button><div class="legend-body">${cuerpo}${bloques.join('')}
      <label class="pe-op">Opacidad <output>${Math.round(st.opacidad * 100)} %</output><input type="range" id="pe-op" min="20" max="100" step="5" value="${st.opacidad * 100}"></label>
      <details class="pe-aux" ${st.aux.size ? 'open' : ''}><summary>Capas auxiliares${st.aux.size ? ` (${st.aux.size})` : ''}</summary>${aux.map((c) => `<label class="pe-lg-cl ${c.disponible ? '' : 'layer-disabled'}"><input type="checkbox" data-aux="${c.k}" ${st.aux.has(c.k) ? 'checked' : ''} ${c.disponible ? '' : 'disabled'}><i style="background:${c.color}"></i>${esc(c.nombre)}</label>`).join('')}</details></div>`;
    $('#pe-legend .legend-head').addEventListener('click', (e) => { const b = e.currentTarget; const o = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', String(!o)); b.nextElementSibling.hidden = o; });
    $$('#pe-legend [data-cl]').forEach((x) => x.addEventListener('change', () => { const s = (st.ocultas[prod] ||= new Set()); const v = Number(x.dataset.cl); x.checked ? s.delete(v) : s.add(v); dibujar(); }));
    $$('#pe-legend [data-cp]').forEach((b) => b.addEventListener('click', () => { st.colorParches = b.dataset.cp; dibujar(); }));
    $$('#pe-legend [data-aux]').forEach((x) => x.addEventListener('change', () => { x.checked ? st.aux.add(x.dataset.aux) : st.aux.delete(x.dataset.aux); dibujar(); }));
    $('#pe-op')?.addEventListener('input', (e) => { st.opacidad = e.target.value / 100; e.target.previousElementSibling.textContent = `${e.target.value} %`; Object.entries(st.capas).forEach(([k, l]) => (k.startsWith('r:') || k.startsWith('s:') || k.startsWith('v:')) && l.eachLayer((x) => x.setOpacity?.(st.opacidad))); });
  }

  // ------------------------------------------------------------ barra de años
  let reproduciendo = null;
  function barraAnios() {
    const T = TEMA[st.tema], barra = $('#pe-anios');
    const prod = T.prod && haySerie(T.prod) ? T.prod : null;
    if (!prod) {
      barra.hidden = !T.prod;
      if (T.prod) barra.innerHTML = `<span class="pe-anios-sin">Serie anual de ${esc(T.t.split('·').pop().trim())}: se genera con el flujo «Series anuales» de GitHub Actions. Mientras tanto el mapa muestra el período fijo del índice.</span>`;
      return;
    }
    const anios = prodInfo(prod).anios, a = anioActual(prod);
    if (barra.dataset.prod !== prod || !$('#pe-anio')) {
      barra.dataset.prod = prod;
      barra.innerHTML = `<button type="button" class="pe-play" id="pe-play" aria-label="Reproducir los años">${icon('play', 16)}</button><span class="pe-anios-ext">${anios[0]}</span><input type="range" id="pe-anio" min="${anios[0]}" max="${anios[anios.length - 1]}" step="1" aria-label="Año"><span class="pe-anios-ext">${anios[anios.length - 1]}</span><output id="pe-anio-v"></output>`;
      $('#pe-anio').addEventListener('input', (e) => { $('#pe-anio-v').textContent = e.target.value; });
      $('#pe-anio').addEventListener('change', (e) => ponerAnio(prod, Number(e.target.value)));
      $('#pe-play').addEventListener('click', () => {
        if (reproduciendo) { clearInterval(reproduciendo); reproduciendo = null; $('#pe-play').classList.remove('on'); return; }
        $('#pe-play').classList.add('on');
        let i = anios[0] === anioActual(prod) || anioActual(prod) === anios[anios.length - 1] ? 0 : anios.indexOf(anioActual(prod));
        reproduciendo = setInterval(() => { if (i >= anios.length) { clearInterval(reproduciendo); reproduciendo = null; $('#pe-play')?.classList.remove('on'); return; } ponerAnio(prod, anios[i], false); i += 1; }, 900);
      });
    }
    barra.hidden = false;
    $('#pe-anio').value = a; $('#pe-anio-v').textContent = a;
  }
  async function ponerAnio(prod, anio, conPanel = true) {
    st.anio[prod] = anio;
    await dibujar();
    if (conPanel) renderPanel(); else actualizarMarcaAnio(prod, anio);
  }
  function actualizarMarcaAnio(prod, anio) {
    $$('#pe-res-b .g-col[data-anio]').forEach((g) => g.classList.toggle('g-atenuada', Number(g.dataset.anio) !== anio));
  }
  // ------------------------------------------------------------ columna de temas
  function renderTemas() {
    $('#pe-temas').innerHTML = TEMAS.map((g) => `<div class="tm-g"><h3>${esc(g.grupo)}</h3>${g.items.map((x) => {
      const serie = x.prod && st.series?.productos?.[x.prod];
      const periodo = serie ? `${serie.anios[0]}–${serie.anios[serie.anios.length - 1]}` : '';
      return `<div class="tm ${x.k === st.tema ? 'on' : ''}"><button type="button" class="tm-b" data-tema="${x.k}" aria-pressed="${x.k === st.tema}">${icon(x.i, 18)}<span>${esc(x.t)}<small class="tm-q">${esc(x.q)}</small>${periodo ? `<small>${periodo}</small>` : ''}</span></button><button type="button" class="tm-i" data-info="${x.k}" aria-label="Qué muestra ${esc(x.t)}" aria-expanded="false">i</button><p class="tm-d" hidden>${esc(x.d)}</p></div>`;
    }).join('')}</div>`).join('');
    $$('#pe-temas [data-tema]').forEach((b) => b.addEventListener('click', () => elegirTema(b.dataset.tema)));
    $$('#pe-temas [data-info]').forEach((b) => b.addEventListener('click', () => { const p = b.nextElementSibling; p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden)); }));
  }
  async function elegirTema(k) {
    if (reproduciendo) { clearInterval(reproduciendo); reproduciendo = null; }
    st.tema = k;
    // Dentro de un análisis de varias preguntas, elegir el tema de una de ellas cambia de pestaña.
    const parte = st.modo?.tipos.find((tp) => temaDe(tp) === k);
    st.modo = parte ? { ...st.modo, actual: parte } : null;
    renderTemas();
    await dibujar();
    renderPanel();
  }

  // ------------------------------------------------------------ panel de la derecha
  const ttl = (n, sub = '') => `<div class="pc-h"><h3>${n}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`;
  const card = (html, cls = '') => `<section class="pc ${cls}">${html}</section>`;
  /** Respuesta directa a la pregunta del tema, antes de las gráficas. */
  const respuesta = (texto) => card(`<span class="pc-resp-q">${esc(TEMA[st.tema].q)}</span><p>${texto}</p>`, 'pc-resp');
  const listaY = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs.join(''));
  const nombreVista = () => (st.vistaPol ? `Polígono de ${hectares(pg.resultado?.area_dibujada_ha ?? P.areaHa(pg.geo), 1)}` : t().nombre);
  let turnoPanel = 0;
  async function renderPanel() {
    const turno = ++turnoPanel;
    const T = TEMA[st.tema], poli = !!st.vistaPol, x = t(), R0 = pg.resultado;
    $('#pe-res-eyebrow').textContent = st.modo ? `Análisis · ${TIPOS[st.modo.actual].t}` : poli ? 'Mi geometría · estimación local' : 'Explorar';
    $('#pe-res-title').textContent = nombreVista();
    $('#pe-res-sub').textContent = poli ? `En ${R0?.subcuencas?.join(', ') || '—'}` : `${hectares(x.area_ha)} · ${x.grupo}`;
    $('#pe-res-b').innerHTML = '<p class="pc-cargando">Preparando las gráficas…</p>';
    let html = '';
    try {
      if (T.prod) html = await panelSerie(T);
      else if (st.tema === 'preev') html = panelPreev();
      else html = await panelOtro(st.tema);
    } catch (err) { html = `<p class="fi-pending">No se pudo preparar este tema: ${esc(err.message)}</p>`; }
    if (turno !== turnoPanel) return;
    const proc = poli && R0 ? window.CHCP.procedencia(st.data, 'C', null, `<span>Malla de ${number(R0.pixel_m, 0)} m · error de borde ${number(R0.error_borde * 100, 1)} %</span>`) : window.CHCP.procedencia(st.data, 'B', x);
    const acciones = poli
      ? `<button class="btn btn-s btn-p" id="pg-ficha-btn" type="button">${icon('doc', 16)} Ficha técnica del área</button><button class="btn btn-s" id="pg-json" type="button">${icon('download', 16)} Resultados (JSON)</button><button class="btn btn-s" id="pg-geo" type="button">${icon('map', 16)} Polígono (GeoJSON)</button>`
      : `<a class="btn btn-s" href="${enlace('ficha')}?id=${encodeURIComponent(x.id)}">${icon('doc', 16)} Ficha técnica</a>${x.id !== 'chcp' ? `<a class="btn btn-s" href="${enlace('restauracion')}?id=${encodeURIComponent(x.id)}">${icon('route', 16)} Simular restauración</a>` : ''}`;
    const partes = st.modo?.tipos?.length > 1 ? `<nav class="pe-nav pe-partes" aria-label="Preguntas de este análisis">${st.modo.tipos.map((tp) => `<button type="button" data-parte="${tp}" aria-current="${tp === st.modo.actual}">${esc(tp === 'comparar' ? `Comparar ${prodInfo(st.modo.prod)?.corto || ''}` : TIPOS[tp].t)}</button>`).join('')}</nav>` : '';
    $('#pe-res-b').innerHTML = `${partes}${proc}${html}<div class="pe-acc pe-acc-fila">${acciones}</div><p class="hint-p small">Evaluación preliminar con datos satelitales: orienta una revisión y no sustituye la verificación de campo.</p>`;
    G.activarTooltips($('#pe-res-b'));
    enlazarPanel();
    $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true;
  }
  function enlazarPanel() {
    $$('#pe-res-b [data-clic] .g-col[data-anio]').forEach((g) => g.addEventListener('click', () => { const prod = TEMA[st.tema].prod; if (prod) ponerAnio(prod, Number(g.dataset.anio)); }));
    $$('#pe-res-b [data-cmp]').forEach((s) => s.addEventListener('change', () => { const prod = TEMA[st.tema].prod; const c = (st.comparar[prod] ||= {}); c[s.dataset.cmp] = Number(s.value); renderPanel(); }));
    $('#pe-rank-cl')?.addEventListener('change', (e) => { st.rankClase[TEMA[st.tema].prod] = Number(e.target.value); renderPanel(); });
    $$('#pe-res-b [data-ir-tema]').forEach((b) => b.addEventListener('click', () => elegirTema(b.dataset.irTema)));
    $$('#pe-res-b [data-parte]').forEach((b) => b.addEventListener('click', () => elegirTema(temaDe(b.dataset.parte))));
    if (st.vistaPol && pg.resultado) {
      const bajar = (nombre, texto, tipo) => { const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([texto], { type: tipo })); el.download = nombre; el.click(); URL.revokeObjectURL(el.href); };
      $('#pg-json')?.addEventListener('click', () => { const { acc, ...resto } = pg.resultado; bajar('analisis_poligono.json', JSON.stringify({ procesamiento: { tipo: 'C', descripcion: 'Estimación local derivada de resultados precalculados (tipo B)', base: st.data.procesamiento, error_borde_estimado: pg.resultado.error_borde, pixel_m: pg.resultado.pixel_m }, metodologia: st.data.metodologia, datos: st.data.generado, poligono: pg.geo, ...resto, series_anuales: pg.series, superficies_ha: { jrc: acc.jrc, hansen_por_anio: acc.hansen, esri: acc.esri, sinia_2021: acc.sinia, coincidencia: acc.coincidencia, riparia: acc.riparia } }, null, 1), 'application/json'); });
      $('#pg-ficha-btn')?.addEventListener('click', () => abrirFichaPoligono());
      $('#pg-geo')?.addEventListener('click', () => bajar('poligono.geojson', JSON.stringify({ type: 'Feature', properties: { area_ha: pg.resultado.area_dibujada_ha }, geometry: pg.geo }), 'application/geo+json'));
    }
  }

  // ---- temas con serie anual
  const PERIODO_COMPARAR = { jrc: [2020, 2025], esri: [2017, 2024], ndvi: [2020, 2025] };
  const CLASE_RANKING = { jrc: 3, esri: 2, ndvi: 5 };
  async function panelSerie(T) {
    const prod = T.prod, datos = await datosSerie(prod);
    if (!datos) return panelSinSerie(T);
    const info = prodInfo(prod), anios = info.anios, anio = anioActual(prod);
    const cabecera = card(`<p class="pc-lectura">${esc(info.lectura)}</p><p class="pc-fuente">${esc(info.fuente)} · ${info.resolucion_m} m. En el índice MT-2026.7: ${esc(info.periodo_indice)}.</p>`, 'pc-intro');
    if (prod === 'hansen') {
      const por = datos.perdida_por_anio || {};
      const reciente = info.anios.filter((a) => a >= 2021).reduce((s2, a) => s2 + (por[a] || 0), 0);
      const maxA = info.anios.reduce((m, a) => ((por[a] || 0) > (por[m] || 0) ? a : m), info.anios[0]);
      return respuesta(`Entre 2021 y 2025 se perdieron <b>${G.ha(reciente)}</b> de cobertura arbórea. Desde 2001, el año con más pérdida fue <b>${maxA}</b> (${G.ha(por[maxA] || 0)}). Hansen no distingue tala de cosecha de plantaciones.`) + cabecera + panelHansen(info, datos);
    }
    const por = datos.por_anio || {};
    const clases = info.clases.filter((c) => anios.some((a) => (por[a]?.[c.valor] || 0) > 0));
    const filasAnio = clases.map((c) => ({ etiqueta: c.etiqueta, color: c.color, valor: por[anio]?.[c.valor] || 0 }));
    const totalAnio = filasAnio.reduce((s, f) => s + f.valor, 0);
    const series = clases.map((c) => ({ etiqueta: c.etiqueta, color: c.color, valores: anios.map((a) => por[a]?.[c.valor] || 0) }));
    const cmp = { a: st.comparar[prod]?.a ?? PERIODO_COMPARAR[prod][0], b: st.comparar[prod]?.b ?? PERIODO_COMPARAR[prod][1] };
    const opciones = (sel) => anios.map((a) => `<option ${a === sel ? 'selected' : ''}>${a}</option>`).join('');
    const filasCmp = clases.map((c) => ({ etiqueta: c.etiqueta, color: c.color, a: por[cmp.a]?.[c.valor] || 0, b: por[cmp.b]?.[c.valor] || 0 }));
    const comparar = card(`${ttl(`Comparar ${cmp.a} y ${cmp.b}`, 'Cuánto cambió cada clase entre los dos años.')}
      <div class="pc-sel"><label>Desde<select data-cmp="a">${opciones(cmp.a)}</select></label><label>Hasta<select data-cmp="b">${opciones(cmp.b)}</select></label></div>
      ${G.mancuernas({ filas: filasCmp, anioA: cmp.a, anioB: cmp.b })}
      ${G.tablaDatos(['Clase', String(cmp.a), String(cmp.b), 'Cambio'], filasCmp.map((f) => [esc(f.etiqueta), G.ha(f.a), G.ha(f.b), `${f.b - f.a >= 0 ? '+' : '−'}${G.ha(Math.abs(f.b - f.a))}`]))}`);
    const clave = info.clases.find((c) => c.valor === CLASE_RANKING[prod]);
    const fa = filasCmp.find((f) => f.etiqueta === clave?.etiqueta);
    const crece = [...filasCmp].filter((f) => f !== fa).sort((p1, p2) => (p2.b - p2.a) - (p1.b - p1.a))[0];
    let html = '';
    if (fa) {
      const d = fa.b - fa.a, rel = fa.a ? d / fa.a * 100 : null;
      html += respuesta(`Entre ${cmp.a} y ${cmp.b}, <b>${esc(fa.etiqueta.toLowerCase())}</b> pasó de ${G.ha(fa.a)} a ${G.ha(fa.b)} (<b>${d >= 0 ? '+' : '−'}${G.ha(Math.abs(d))}</b>${rel == null ? '' : `, ${d >= 0 ? '+' : '−'}${number(Math.abs(rel), 1)} %`}).${crece && crece.b - crece.a > 0 ? ` La clase que más creció fue <b>${esc(crece.etiqueta.toLowerCase())}</b> (+${G.ha(crece.b - crece.a)}).` : ''}`);
    }
    html += cabecera;
    const primero = st.modo?.actual === 'comparar';
    if (primero) html += comparar;
    html += card(`${ttl(`Superficie por clase · ${anio}`, `${G.ha(totalAnio)} con dato. Cambie el año con la barra del mapa o pulsando una columna.`)}${G.barrasClases(filasAnio)}`);
    html += card(`${ttl(`Evolución ${anios[0]}–${anios[anios.length - 1]}`, 'Superficie de cada clase por año.')}
      ${G.serieApilada({ anios, series, marcado: anio, alClic: true })}
      <div class="g-ley">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.etiqueta)}</span>`).join('')}</div>
      ${G.tablaDatos(['Año', ...clases.map((c) => c.etiqueta)], anios.map((a, i) => [a, ...series.map((s) => G.ha(s.valores[i]))]))}`);
    if (prod === 'ndvi' && datos.ndvi_medio) {
      html += card(`${ttl('NDVI medio por año', 'Promedio del territorio (−1 a 1). Una caída puede deberse a cosecha, sequía o nubes.')}${G.linea({ anios, valores: anios.map((a) => datos.ndvi_medio[a]) })}`);
    }
    if (!primero) html += comparar;
    html += await panelRanking(prod, info, anio);
    return html;
  }
  function panelHansen(info, datos) {
    const anios = info.anios, por = datos.perdida_por_anio || {};
    const valores = anios.map((a) => por[a] || 0);
    const reciente = anios.filter((a) => a >= 2021).reduce((s, a) => s + (por[a] || 0), 0);
    const previa = anios.filter((a) => a <= 2020).reduce((s, a) => s + (por[a] || 0), 0);
    const base = datos.cobertura_arborea_2000_ha;
    const maxA = anios.reduce((m, a) => ((por[a] || 0) > (por[m] || 0) ? a : m), anios[0]);
    return card(`${ttl('Pérdida de cobertura arbórea')}
      <div class="pe-ms">${tarjeta('2021–2025 (usada en el índice)', G.ha(reciente), base ? `${pct(reciente / base * 100, 2)} de la cobertura arbórea del año 2000` : '')}${tarjeta('2001–2020', G.ha(previa), 'antes del corte del 31/12/2020')}${tarjeta('Año con más pérdida', String(maxA), G.ha(por[maxA] || 0))}</div>`)
      + card(`${ttl('Pérdida por año', 'En azul, los años que cuenta el índice (2021–2025); en gris, los anteriores al corte del 31/12/2020.')}${G.columnas({ anios, valores, enfasis: (a) => a >= 2021, nota: 'Pérdida Hansen por año' })}${G.tablaDatos(['Año', 'Pérdida'], anios.map((a, i) => [a, G.ha(valores[i])]))}`);
  }
  function panelSinSerie(T) {
    const x = t(), poli = !!st.vistaPol, R0 = pg.resultado;
    const aviso = `<p class="pc-aviso">Las gráficas año por año de esta fuente se generan con el flujo «Series anuales» de GitHub Actions. Mientras tanto se muestran las cifras del período que usa el índice.</p>`;
    if (poli && R0) return aviso + card(SECCIONES_P.cambio(R0));
    if (T.prod === 'jrc') {
      const j = x.jrc_ha || {}, serie = x.serie_anual || [];
      const filas = [['Bosque sin perturbación', j.tmf_estable, '#005a00'], ['Bosque degradado', j.tmf_degradacion, '#649b23'], ['Deforestado', j.tmf_deforestacion, '#ff870f'], ['Regeneración', j.tmf_recuperacion, '#d2fa3c'], ['Agua', j.tmf_agua, '#008cbe'], ['Otra cobertura', j.tmf_otra_cobertura, '#ececec']].map(([etiqueta, valor, color]) => ({ etiqueta, valor: valor || 0, color }));
      return aviso + card(`${ttl('Estado del bosque · 2025')}${G.barrasClases(filas)}`) + (serie.length ? card(`${ttl('Degradado y deforestado por año', 'Clases acumuladas desde 1990.')}${G.serieApilada({ anios: serie.map((r) => r.anio), series: [{ etiqueta: 'Deforestado', color: '#fabc20', valores: serie.map((r) => r.jrc_deforestacion_ha || 0) }, { etiqueta: 'Degradado', color: '#f28e2b', valores: serie.map((r) => r.jrc_degradacion_ha || 0) }] })}<div class="g-ley"><span><i style="background:#fabc20"></i>Deforestado</span><span><i style="background:#f28e2b"></i>Degradado</span></div>`) : '');
    }
    if (T.prod === 'hansen') {
      const serie = (x.serie_anual || []).filter((r) => r.hansen_perdida_ha != null);
      return aviso + card(`${ttl('Pérdida por año (2021–2025)')}${serie.length ? G.columnas({ anios: serie.map((r) => r.anio), valores: serie.map((r) => r.hansen_perdida_ha) }) : '<p class="g-vacio">Sin datos.</p>'}<p class="pc-fuente">Total 2021–2025: ${G.ha(x.hansen_post_2020_ha || 0)}</p>`);
    }
    if (T.prod === 'esri') {
      const e = x.esri || {};
      return aviso + card(`${ttl('Árboles 2017 → 2024')}${G.barrasClases([{ etiqueta: 'Árboles en ambos años', valor: e.esri_estable || 0, color: '#397d49' }, { etiqueta: 'Árboles → otra clase', valor: e.esri_salida || 0, color: '#d7301f' }, { etiqueta: 'Otra clase → árboles', valor: e.esri_ganancia || 0, color: '#2b8cbe' }])}`);
    }
    const n = x.ndvi || {};
    return aviso + card(`${ttl('NDVI 2020 → 2025')}<div class="pe-ms">${tarjeta('NDVI medio 2020', number(n.ndvi_inicial_medio, 2))}${tarjeta('NDVI medio 2025', number(n.ndvi_final_medio, 2))}${tarjeta('Descenso fuerte', G.ha(n.ndvi_disminucion || 0), 'caída ≥ 0,15')}</div>`);
  }
  async function panelRanking(prod, info, anio) {
    if (st.vistaPol || st.id !== 'chcp') return '';
    const clase = st.rankClase[prod] ?? CLASE_RANKING[prod];
    const ids = Object.keys(st.data.territorios).filter((k) => k !== 'chcp' && st.series.territorios?.[k]?.superficies?.includes(prod));
    if (!ids.length) return '';
    await Promise.all(ids.filter((k) => !(k in st.est)).map(async (k) => { st.est[k] = await fetch(serieFile(`estadisticas/${k}.json`)).then((r) => (r.ok ? r.json() : null)).catch(() => null); }));
    const filas = ids.map((k) => {
      const por = st.est[k]?.[prod]?.por_anio?.[anio] || {};
      const total = Object.values(por).reduce((s, v) => s + v, 0);
      return { k, nombre: st.data.territorios[k].nombre, ha: por[clase] || 0, pct: total ? (por[clase] || 0) / total * 100 : 0 };
    }).filter((f) => f.ha > 0).sort((a, b) => b.pct - a.pct).slice(0, 10);
    const c = info.clases.find((x) => x.valor === clase);
    const max = Math.max(...filas.map((f) => f.pct), 1e-9);
    return card(`${ttl('Subcuencas con mayor proporción', `Porcentaje de cada subcuenca en la clase elegida, ${anio}.`)}
      <div class="pc-sel"><label>Clase<select id="pe-rank-cl">${info.clases.map((x) => `<option value="${x.valor}" ${x.valor === clase ? 'selected' : ''}>${esc(x.etiqueta)}</option>`).join('')}</select></label></div>
      <div class="g-barras">${filas.map((f) => `<div class="g-fila" tabindex="0" data-tip="${esc(`<b>${number(f.pct, 1)} %</b> · ${G.ha(f.ha)}<br>${f.nombre}`)}"><span class="g-nombre">${esc(f.nombre)}</span><span class="g-pista"><b style="width:${f.pct / max * 100}%;background:${c?.color || '#0a4393'}"></b></span><span class="g-valor">${number(f.pct, 1)} %</span></div>`).join('') || '<p class="g-vacio">Sin datos para esa clase.</p>'}</div>`);
  }

  // ---- preevaluación: las cinco fuentes con el mismo peso visual
  function panelPreev() {
    const poli = !!st.vistaPol, R0 = pg.resultado, x = t(), U = P.UMBRALES;
    let p, d;
    if (poli && R0) {
      const m = R0.metricas, a = R0.acc;
      p = { puntaje: R0.puntaje, max: 6.5, prioridad: R0.prioridad, visita: R0.visita.prioridad_visita, consistencia: R0.consistencia.nivel, senales: R0.senales, aportes: R0.aportes };
      d = { jrc: [1, 2, 3, 4, 5, 6].map((k) => a.jrc[k] || 0), hansen: [21, 22, 23, 24, 25].map((k) => a.hansen[k] || 0), esri: { salida: a.esri[1] || 0, ganancia: a.esri[2] || 0, estable: a.esri[3] || 0 },
        ndvi: { ini: null, fin: null, delta: R0.ndvi_delta_medio, descenso: m.ndvi_disminucion_ha, valido: m.ndvi_cobertura_valida_pct }, gedi: { altura: R0.disponibilidad?.gedi ? m.gedi_altura_media_m : null, valido: m.gedi_cobertura_valida_pct } };
    } else {
      const e = x.preevaluacion, j = x.jrc_ha || {};
      p = { puntaje: e.puntaje, max: e.puntaje_maximo, prioridad: e.prioridad, visita: e.prioridad_visita, consistencia: e.consistencia, senales: e.senales || {}, aportes: e.aportes || {} };
      const serie = Object.fromEntries((x.serie_anual || []).map((r) => [r.anio, r.hansen_perdida_ha]));
      d = { jrc: [j.tmf_estable, j.tmf_degradacion, j.tmf_deforestacion, j.tmf_recuperacion, j.tmf_agua, j.tmf_otra_cobertura].map((v) => v || 0), hansen: [2021, 2022, 2023, 2024, 2025].map((y) => serie[y] || 0),
        esri: { salida: x.esri?.esri_salida || 0, ganancia: x.esri?.esri_ganancia || 0, estable: x.esri?.esri_estable || 0 },
        ndvi: { ini: x.ndvi?.ndvi_inicial_medio, fin: x.ndvi?.ndvi_final_medio, delta: x.ndvi?.ndvi_delta_medio, descenso: x.ndvi?.ndvi_disminucion || 0 }, gedi: { altura: x.gedi_altura_m } };
    }
    const activas = ['tmf', 'hansen', 'esri', 'ndvi', 'gedi'].filter((k) => p.senales[k]).map((k) => ({ tmf: 'JRC', hansen: 'Hansen', esri: 'ESRI', ndvi: 'NDVI', gedi: 'GEDI' }[k]));
    const resp = respuesta(activas.length
      ? `<b>Hay señales: ${activas.length} de 5 fuentes</b> superan su umbral de pérdida o deterioro (${listaY(activas)}). Prioridad <b>${esc(String(p.prioridad).toLowerCase())}</b> para verificar en campo.`
      : '<b>Sin señales:</b> ninguna de las cinco fuentes supera su umbral de pérdida o deterioro en este período.');
    const JRC_C = [['Sin perturbación', '#005a00'], ['Degradado', '#649b23'], ['Deforestado', '#ff870f'], ['Regeneración', '#d2fa3c'], ['Agua', '#008cbe'], ['Otra cobertura', '#ececec']];  // colores oficiales JRC TMF
    const estado = (k) => (p.senales[k] ? `<span class="pc-estado on"><i class="pc-dot"></i>Señal activa · +${number(p.aportes?.[k] ?? 0, 1)}</span>` : '<span class="pc-estado">Sin señal · +0</span>');
    const fuente = (k, nombre, periodo, umbral, cuerpo, tema) => `<article class="pc-fuente-c ${p.senales[k] ? 'on' : ''}"><header><b>${nombre}</b><small>${periodo}</small>${estado(k)}</header>${cuerpo}<p class="pc-umbral">Se activa con: ${umbral}</p>${tema ? `<button type="button" class="rs-link" data-ir-tema="${tema}">Ver la serie en el mapa</button>` : ''}</article>`;
    const jrcFilas = JRC_C.map(([n, c], i) => ({ etiqueta: n, color: c, valor: d.jrc[i] }));
    const html = `${resp}
      ${card(`<div class="pc-hero"><div><span>Puntaje MT-2026.7</span><b>${number(p.puntaje, 1)}<small> / ${number(p.max, 1)}</small></b></div><em class="pc-prio" style="--c:${PRIO[p.prioridad] || '#90a4ae'}">${esc(p.prioridad)}</em></div>
        <div class="pc-puntos">${Object.entries({ tmf: 'JRC', hansen: 'Hansen', esri: 'ESRI', gedi: 'GEDI', ndvi: 'NDVI' }).map(([k, n]) => `<span class="${p.senales[k] ? 'on' : ''}" title="${n}: ${p.senales[k] ? 'señal activa' : 'sin señal'}"><i style="flex-grow:${{ tmf: 2, hansen: 2, esri: 1.5, gedi: 0.5, ndvi: 0.5 }[k]}"></i>${n}</span>`).join('')}</div>
        <p class="pc-lectura">Prioridad de visita: <b>${esc(p.visita)}</b> · ${esc(p.consistencia)}. Cada fuente suma una sola vez; el mapa muestra dónde coinciden JRC, Hansen y ESRI.</p>`, 'pc-score')}
      <div class="pc-fuentes">
        ${fuente('tmf', 'JRC TMF', 'estado 2025 · 30 m', `deforestado ≥ ${U.jrc_deforestacion_ha} ha o ≥ ${U.jrc_deforestacion_pct} %; degradado ≥ ${U.jrc_degradacion_ha} ha o ≥ ${U.jrc_degradacion_pct} %`, `${G.segmentada(jrcFilas)}<p class="pc-dato"><b>${G.ha(d.jrc[2])}</b> deforestado · <b>${G.ha(d.jrc[1])}</b> degradado <small>(acumulado desde 1990)</small></p>`, 'jrc')}
        ${fuente('hansen', 'Hansen GFC', 'pérdida 2021–2025 · 30 m', `pérdida ≥ ${U.hansen_post_2020_ha} ha`, `${G.columnas({ anios: [2021, 2022, 2023, 2024, 2025], valores: d.hansen, alto: 110, nota: 'Pérdida Hansen 2021–2025' })}<p class="pc-dato"><b>${G.ha(d.hansen.reduce((s, v) => s + v, 0))}</b> perdidas en 2021–2025</p>`, 'hansen')}
        ${fuente('esri', 'ESRI LULC', 'árboles 2017 → 2024 · 10 m', `salida de árboles ≥ ${U.esri_salida_arboles_ha} ha y ≥ ${U.esri_salida_arboles_pct} %`, `${G.barrasClases([{ etiqueta: 'Árboles → otra clase', valor: d.esri.salida, color: '#d7301f' }, { etiqueta: 'Otra clase → árboles', valor: d.esri.ganancia, color: '#2b8cbe' }], { total: d.esri.salida + d.esri.ganancia + d.esri.estable })}<p class="pc-dato">Balance: <b>${d.esri.ganancia - d.esri.salida >= 0 ? '+' : '−'}${G.ha(Math.abs(d.esri.ganancia - d.esri.salida))}</b> de árboles</p>`, 'esri')}
        ${fuente('ndvi', 'NDVI Sentinel-2', '2020 → 2025 · 10 m', `caída ≥ 0,15 desde NDVI ≥ 0,4 en ≥ ${U.ndvi_disminucion_ha} ha y ≥ ${U.ndvi_disminucion_pct} %`, `<div class="pc-par">${d.ndvi.ini != null ? `<span><small>2020</small><b>${number(d.ndvi.ini, 2)}</b></span><i>→</i><span><small>2025</small><b>${number(d.ndvi.fin, 2)}</b></span>` : `<span><small>Cambio medio</small><b>${d.ndvi.delta == null ? '—' : `${d.ndvi.delta > 0 ? '+' : ''}${number(d.ndvi.delta, 3)}`}</b></span>`}<span><small>Descenso fuerte</small><b>${G.ha(d.ndvi.descenso || 0)}</b></span></div>`, 'ndvi')}
        ${fuente('gedi', 'GEDI', 'altura del dosel · 100 m', `altura media < ${U.gedi_dosel_bajo_m} m (con ≥ ${U.gedi_cobertura_minima_pct} % de datos válidos)`, d.gedi.altura == null ? '<p class="pc-dato">Sin cobertura GEDI suficiente.</p>' : `<div class="pc-meter" title="Altura media ${number(d.gedi.altura, 1)} m; umbral ${U.gedi_dosel_bajo_m} m"><i style="width:${Math.min(d.gedi.altura / 30 * 100, 100)}%"></i><b style="left:${U.gedi_dosel_bajo_m / 30 * 100}%"></b></div><p class="pc-dato"><b>${number(d.gedi.altura, 1)} m</b> de altura media · umbral ${U.gedi_dosel_bajo_m} m</p>`, 'gedi')}
      </div>
      ${!poli && x.id !== 'chcp' && x.indicadores_relativos?.valores ? card(`<details><summary><b>Intensidad relativa del cambio</b> <span class="exp-tag">experimental</span></summary>${SECCIONES_T.relativa(x)}</details>`) : ''}`;
    return html;
  }

  // ---- otros temas
  async function panelOtro(k) {
    const poli = !!st.vistaPol, R0 = pg.resultado, x = t();
    if (k === 'frag') {
      if (poli && R0 && R0.fragmentacion === null) { R0.fragmentacion = await fragmentacionPoligono(); }
      return poli && R0 ? card(`${ttl('Fragmentación')}${SECCIONES_P.fragmentacion(R0)}`) + card(`${ttl('Conectividad')}${SECCIONES_P.conectividad(R0)}`)
        : card(`${ttl('Fragmentación del bosque oficial 2021')}${SECCIONES_T.fragmentacion(x)}`) + card(`${ttl('Conectividad estructural')}${SECCIONES_T.conectividad(x)}`);
    }
    if (k === 'corr') return card(`${ttl('Corredores biológicos')}${poli && R0 ? SECCIONES_P.corredores(R0) : SECCIONES_T.corredores(x)}`);
    if (k === 'rip') return card(`${ttl('Franjas riparias')}${poli && R0 ? SECCIONES_P.riparia(R0) : SECCIONES_T.riparia(x)}`);
    if (k === 'eri') return card(`${ttl('Resiliencia ecológica (ERI)')}${poli && R0 ? SECCIONES_P.eri(R0) : SECCIONES_T.eri(x)}`);
    if (k === 'gedi') {
      const altura = poli && R0 ? (R0.disponibilidad?.gedi ? R0.metricas.gedi_altura_media_m : null) : x.gedi_altura_m;
      return card(`${ttl('Altura media del dosel')}${altura == null ? '<p class="g-vacio">Sin cobertura GEDI suficiente.</p>' : `<div class="pc-meter pc-meter-g"><i style="width:${Math.min(altura / 30 * 100, 100)}%"></i><b style="left:${P.UMBRALES.gedi_dosel_bajo_m / 30 * 100}%"></b></div><p class="pc-dato"><b>${number(altura, 1)} m</b> · la línea marca el umbral de dosel bajo (${P.UMBRALES.gedi_dosel_bajo_m} m) del índice</p>`}<p class="pc-fuente">GEDI es un láser espacial con muestras discontinuas; la altura es una referencia estructural, no fecha el cambio.</p>`);
    }
    if (k === 'sinia') {
      if (poli && R0) return card(`${ttl('Cobertura oficial SINIA 2021')}${SECCIONES_P.sinia(R0)}`);
      const s21 = (x.sinia || []).find((s) => s.year === 2021);
      return (s21 ? card(`${ttl('Cobertura oficial SINIA 2021')}${G.barrasClases(s21.classes.map((c) => ({ etiqueta: c.label, color: c.color, valor: c.area_ha })))}`) : '')
        + card(`${ttl('Bosque en los productos oficiales', 'Productos independientes: la diferencia entre años no mide pérdida ni ganancia.')}${SECCIONES_T.sinia(x)}<p><a href="${enlace('coberturas')}">Ver los ocho productos SINIA →</a></p>`);
    }
    return '';
  }

  // ------------------------------------------------------------ «Realizar análisis»
  // Cada tipo responde una pregunta. Se pueden elegir varios a la vez: el panel muestra una
  // pestaña por cada uno y el mapa cambia con la pestaña.
  const TIPOS = {
    preev: { q: '¿Ha perdido bosque esta zona?', t: 'Preevaluación del cambio', i: 'shield', d: 'Las cinco fuentes (JRC, Hansen, ESRI, NDVI y GEDI), su puntaje MT-2026.7 y la prioridad de visita.' },
    comparar: { q: '¿Cómo cambió entre dos años?', t: 'Comparar dos años', i: 'trend', d: 'Elija una fuente y dos años: cuánto cambió cada clase, con su serie completa.' },
    frag: { q: '¿Qué tan fragmentado y conectado está el bosque?', t: 'Fragmentación y conectividad', i: 'network', d: 'Parches del bosque oficial, borde, bosque interior y red de conectividad.' },
    corr: { q: '¿Se conecta con los corredores y los ríos?', t: 'Corredores y ríos', i: 'route', d: 'Corredores biológicos, Corredor Mesoamericano, puntos críticos y franjas riparias.' },
  };
  const temaDe = (tipo, prod = st.modo?.prod) => (tipo === 'comparar' ? prod : tipo);
  const wiz = { paso: 0, tipos: new Set(['preev']), prod: 'jrc', a: 2020, b: 2025, area: 'territorio' };
  const pasosWiz = () => (wiz.tipos.has('comparar') ? ['Preguntas', 'Fuente y años', 'Territorio', 'Revisión'] : ['Preguntas', 'Territorio', 'Revisión']);
  function abrirAsistente(area) {
    wiz.paso = 0;
    wiz.area = area || (st.vistaPol && pg.geo ? 'poligono' : 'territorio');
    $('#pe-modal').hidden = false;
    pintarAsistente();
  }
  function pintarAsistente() {
    const pasos = pasosWiz(), paso = pasos[wiz.paso];
    $('#pe-stp').innerHTML = pasos.map((n, k) => `<li class="${k === wiz.paso ? 'cur' : k < wiz.paso ? 'ok' : ''}"><i>${k < wiz.paso ? '✓' : k + 1}</i>${n}</li>`).join('');
    let html = '';
    if (paso === 'Preguntas') {
      html = `<h3>¿Qué quiere saber?</h3><p class="wz-ayuda">Puede marcar varias preguntas: verá una pestaña de resultados por cada una.</p><div class="wz-tipos">${Object.entries(TIPOS).map(([k, x]) => `<label class="opt wz-t"><input type="checkbox" name="wz-tipo" value="${k}" ${wiz.tipos.has(k) ? 'checked' : ''}>${icon(x.i, 22)}<div><b>${x.q}</b><span><em>${x.t}.</em> ${x.d}</span></div></label>`).join('')}</div>`;
    } else if (paso === 'Fuente y años') {
      const disp = ['jrc', 'esri', 'ndvi'].filter((k) => st.series?.productos?.[k]);
      if (!disp.includes(wiz.prod)) wiz.prod = disp[0] || 'jrc';
      const anios = prodInfo(wiz.prod)?.anios || [];
      if (!anios.includes(wiz.a)) wiz.a = PERIODO_COMPARAR[wiz.prod]?.[0] ?? anios[0];
      if (!anios.includes(wiz.b)) wiz.b = PERIODO_COMPARAR[wiz.prod]?.[1] ?? anios[anios.length - 1];
      html = disp.length ? `<h3>¿Qué fuente y qué años compara?</h3><p class="wz-ayuda">Este paso aparece porque marcó «¿Cómo cambió entre dos años?». Es una pregunta aparte de la preevaluación: muestra cuánto cambió cada clase entre los dos años que elija. Si no la necesita, vuelva atrás y desmárquela.</p><div class="wz-tipos">${disp.map((k) => `<label class="opt"><input type="radio" name="wz-prod" value="${k}" ${wiz.prod === k ? 'checked' : ''}>${icon(TEMA[k].i, 20)}<div><b>${esc(prodInfo(k).nombre)}</b><span>${prodInfo(k).anios[0]}–${prodInfo(k).anios.slice(-1)[0]} · ${prodInfo(k).resolucion_m} m</span></div></label>`).join('')}</div>
        <div class="pc-sel wz-anios"><label>Desde<select id="wz-a">${anios.map((a) => `<option ${a === wiz.a ? 'selected' : ''}>${a}</option>`).join('')}</select></label><label>Hasta<select id="wz-b">${anios.map((a) => `<option ${a === wiz.b ? 'selected' : ''}>${a}</option>`).join('')}</select></label></div>`
        : '<p class="pc-aviso">Las series por año aún no se han generado (flujo «Series anuales» de GitHub Actions). Vuelva atrás y desmarque «¿Cómo cambió entre dos años?» por ahora.</p>';
    } else if (paso === 'Territorio') {
      const poli = wiz.area === 'poligono';
      html = `<h3>¿Dónde?</h3>
        <label class="opt"><input type="radio" name="pe-area" value="territorio" ${!poli ? 'checked' : ''}>${icon('map', 20)}<div><b>Cuenca o subcuenca</b><span>Resultados precalculados con Earth Engine.</span><select id="pe-wiz-terr" class="pe-wiz-sel">${$('#pe-terr').innerHTML}</select></div></label>
        <label class="opt ${pg.geo ? '' : 'layer-disabled'}"><input type="radio" name="pe-area" value="poligono" ${poli ? 'checked' : ''} ${pg.geo ? '' : 'disabled'}>${icon('target', 20)}<div><b>Mi geometría</b><span>${pg.geo ? `Polígono de ${hectares(P.areaHa(pg.geo), 1)}. Estimación local en su navegador.` : 'Dibuje o suba un polígono en la pestaña «Mi geometría».'}</span></div></label>`;
    } else {
      const poli = wiz.area === 'poligono';
      html = `<h3>Revisión</h3><dl class="rev"><dt>Preguntas</dt><dd>${[...wiz.tipos].map((k) => TIPOS[k].q).join('<br>')}</dd>${wiz.tipos.has('comparar') ? `<dt>Comparación</dt><dd>${esc(prodInfo(wiz.prod)?.nombre || '')}, ${Math.min(wiz.a, wiz.b)} y ${Math.max(wiz.a, wiz.b)}</dd>` : ''}<dt>Territorio</dt><dd>${poli ? `Mi geometría (${hectares(P.areaHa(pg.geo), 1)})` : esc(t().nombre)}</dd><dt>Procesamiento</dt><dd>${poli ? 'Estimación local sobre los mapas precalculados' : `Precalculado con Earth Engine (${esc(String(st.data.generado || '').slice(0, 10))})`}</dd></dl>`;
    }
    $('#pe-wiz').innerHTML = html;
    $('#pe-back').hidden = wiz.paso === 0;
    $('#pe-next').textContent = wiz.paso === pasos.length - 1 ? 'Ver resultados' : 'Siguiente';
    $('#pe-next').disabled = (paso === 'Preguntas' && !wiz.tipos.size) || (paso === 'Fuente y años' && !st.series?.productos);
    $$('#pe-wiz [name=wz-tipo]').forEach((r) => r.addEventListener('change', () => { r.checked ? wiz.tipos.add(r.value) : wiz.tipos.delete(r.value); pintarAsistente(); }));
    $$('#pe-wiz [name=wz-prod]').forEach((r) => r.addEventListener('change', () => { wiz.prod = r.value; wiz.a = null; wiz.b = null; pintarAsistente(); }));
    $('#wz-a')?.addEventListener('change', (e) => { wiz.a = Number(e.target.value); });
    $('#wz-b')?.addEventListener('change', (e) => { wiz.b = Number(e.target.value); });
    $$('#pe-wiz [name=pe-area]').forEach((r) => r.addEventListener('change', () => { wiz.area = r.value; }));
    if ($('#pe-wiz-terr')) { $('#pe-wiz-terr').value = st.id; $('#pe-wiz-terr').addEventListener('change', (e) => { st.id = e.target.value; $('#pe-terr').value = st.id; wiz.area = 'territorio'; $$('#pe-wiz [name=pe-area]').forEach((r) => { r.checked = r.value === 'territorio'; }); }); }
  }
  async function ejecutarAsistente() {
    $('#pe-modal').hidden = true;
    const poli = wiz.area === 'poligono';
    const tipos = Object.keys(TIPOS).filter((k) => wiz.tipos.has(k));
    if (wiz.tipos.has('comparar')) st.comparar[wiz.prod] = { a: Math.min(wiz.a, wiz.b), b: Math.max(wiz.a, wiz.b) };
    if (poli) {
      if (!pg.resultado) {
        try { await analizarPoligono(); } catch (err) { $('#pg-busy').hidden = true; mostrarError(`Error al analizar: ${err.message}`); return; }
        if (!pg.resultado) return;
      } else st.vistaPol = st.vistaPol || pg.vista;
      st.map.fitBounds(pg.capa.getBounds(), { padding: [40, 40], maxZoom: 16 });
    } else {
      st.vistaPol = null;
      await seleccionar(st.id, false);
    }
    st.modo = { tipos, actual: tipos[0], prod: wiz.prod, cmp: st.comparar[wiz.prod] };
    st.tema = temaDe(tipos[0]);
    renderTemas();
    await dibujar();
    await renderPanel();
    const nombre = poli ? `Mi geometría (${hectares(P.areaHa(pg.geo), 1)})` : t().nombre;
    const entrada = { modo: { ...st.modo }, poli, id: st.id, nombre };
    const clave = (e) => `${e.poli}|${e.id}|${e.modo.tipos.join()}|${e.modo.prod}`;
    st.analisis = [entrada, ...st.analisis.filter((e) => clave(e) !== clave(entrada))].slice(0, 8);
    renderMisAnalisis();
  }
  function renderMisAnalisis() {
    const caja = $('#pe-mis');
    caja.hidden = !st.analisis.length;
    caja.innerHTML = `<h3>Sus análisis</h3>${st.analisis.map((e, i) => `<div class="mis"><button type="button" data-mis="${i}"><b>${esc(e.nombre)}</b><span>${e.modo.tipos.map((k) => (k === 'comparar' ? `Comparar ${prodInfo(e.modo.prod)?.corto || ''} ${e.modo.cmp?.a}–${e.modo.cmp?.b}` : TIPOS[k].t)).join(' · ')}</span></button><button type="button" class="mis-x" data-mis-x="${i}" aria-label="Quitar">×</button></div>`).join('')}`;
    $$('#pe-mis [data-mis]').forEach((b) => b.addEventListener('click', async () => {
      const e = st.analisis[Number(b.dataset.mis)];
      if (e.poli && !pg.resultado) return;
      if (e.poli) st.vistaPol = pg.vista; else { st.vistaPol = null; await seleccionar(e.id, false); }
      st.modo = { ...e.modo, actual: e.modo.tipos[0] };
      if (e.modo.cmp) st.comparar[e.modo.prod] = { ...e.modo.cmp };
      st.tema = temaDe(st.modo.actual);
      renderTemas(); await dibujar(); renderPanel();
    }));
    $$('#pe-mis [data-mis-x]').forEach((b) => b.addEventListener('click', () => { st.analisis.splice(Number(b.dataset.misX), 1); renderMisAnalisis(); }));
  }

  async function seleccionar(id, conPanel = true) {
    st.id = st.data.territorios[id] ? id : 'chcp';
    $('#pe-terr').value = st.id;
    st.vistaPol = null; st.modo = null;
    st.geo = st.id !== 'chcp' ? await geometria(st.id) : null;
    const f = st.id === 'chcp' ? st.territory.basin : st.territory.subbasins.features.find((x) => x.properties.id === st.id);
    if (f) st.map.fitBounds(L.geoJSON(f).getBounds(), { padding: [20, 20] });
    if (conPanel) { await dibujar(); renderPanel(); }
  }
  // ------------------------------------------------------------ secciones de resultados
  function senalesHtml(senales, aportes, detalle) {
    return `<ul class="pe-sig">${Object.keys(NOMBRES_FUENTE).map((k) => `<li class="${senales[k] ? 'on' : ''}"><b>${senales[k] ? '✓' : '·'} ${NOMBRES_FUENTE[k]}</b> <span>+${senales[k] ? number(aportes?.[k] ?? 0, 1) : '0'}</span><small>${detalle[k] || ''}</small></li>`).join('')}</ul>`;
  }
  const SECCIONES_T = {
    preevaluacion: (x) => { const p = x.preevaluacion; return `<div class="pe-prio" style="border-color:${PRIO[p.prioridad] || '#90a4ae'}"><span>Puntaje MT-2026.7</span><b>${number(p.puntaje, 1)} <small>/ ${number(p.puntaje_maximo, 1)}</small></b><em style="color:${PRIO[p.prioridad]}">${esc(p.prioridad)}</em><small>Prioridad de visita: ${esc(p.prioridad_visita || '—')} · ${esc(p.consistencia || '')}</small></div>
      ${senalesHtml(p.senales || {}, p.aportes, { tmf: `Deforestado ${hectares(x.jrc_ha.tmf_deforestacion, 0)} · degradado ${hectares(x.jrc_ha.tmf_degradacion, 0)} (estado acumulado)`, hansen: `Pérdida 2021–2025: ${hectares(x.hansen_post_2020_ha, 1)}`, esri: `Árboles → otra clase: ${hectares(x.esri?.esri_salida, 1)}`, gedi: x.gedi_altura_m == null ? 'Sin dato' : `Altura media ${number(x.gedi_altura_m, 1)} m`, ndvi: `Descenso fuerte: ${hectares(x.ndvi?.ndvi_disminucion, 1)}` })}
      ${x.id !== 'chcp' ? '<p class="hint-p small">En subcuencas extensas MT-2026.7 tiende a saturarse (ver «Intensidad relativa del cambio»).</p>' : ''}`; },
    cambio: (x) => { const j = x.jrc_ha, a = x.area_ha, serie = x.serie_anual || [];
      return `${tabla(['Estado JRC 2025', 'Superficie', '%'], [['Bosque sin perturbación', j.tmf_estable], ['Degradado', j.tmf_degradacion], ['Deforestado', j.tmf_deforestacion], ['Regeneración', j.tmf_recuperacion], ['Agua', j.tmf_agua], ['Otra cobertura', j.tmf_otra_cobertura]].map(([n, v]) => [n, hectares(v, 0), pct((v || 0) / a * 100, 1)]))}
      ${serie.length ? `<h4 class="pe-h4">Evolución anual</h4>${tabla(['Año', 'Deforestado JRC', 'Degradado JRC', 'Pérdida Hansen'], serie.map((r) => [r.anio, hectares(r.jrc_deforestacion_ha, 0), hectares(r.jrc_degradacion_ha, 0), r.hansen_perdida_ha == null ? '—' : hectares(r.hansen_perdida_ha, 1)]))}` : ''}
      <div class="pe-ms">${tarjeta('ESRI árboles → otra clase', hectares(x.esri?.esri_salida, 1), '2017 → 2024')}${tarjeta('ESRI otra clase → árboles', hectares(x.esri?.esri_ganancia, 1), '2017 → 2024')}${tarjeta('NDVI medio', `${number(x.ndvi?.ndvi_inicial_medio, 2)} → ${number(x.ndvi?.ndvi_final_medio, 2)}`, '2020 → 2025')}${tarjeta('Descenso fuerte de NDVI', hectares(x.ndvi?.ndvi_disminucion, 1), '≥ 0,15')}</div>`; },
    fragmentacion: (x) => { const e = x.estructura_2021; if (!e) return '<p class="fi-pending">Sin estructura calculada para este territorio.</p>'; const c = e.metricas_clase, mp = e.metricas_paisaje;
      return `<div class="pe-ms">${tarjeta('Parches de bosque 2021', number(c.numero_parches, 0))}${tarjeta('Bosque oficial 2021', hectares(c.area_total_bosque_ha, 0))}${tarjeta('Parche mayor', pct(c.indice_parche_mayor_pct, 1), 'del paisaje')}${tarjeta('Densidad de borde', `${number(c.densidad_borde_m_ha, 1)} m/ha`)}${tarjeta('Bosque interior (100 m)', mp?.porcentaje_bosque_nucleo == null ? '—' : pct(mp.porcentaje_bosque_nucleo, 1), 'del bosque')}${tarjeta('Distancia media entre parches', mp?.enn_medio_m == null ? '—' : `${number(mp.enn_medio_m, 0)} m`)}${tarjeta('Cohesión', mp?.cohesion == null ? '—' : number(mp.cohesion, 1), '0–100')}</div>
      ${mp?.area_nucleo?.por_profundidad ? tabla(['Profundidad de borde', 'Bosque interior', '% del bosque'], mp.area_nucleo.por_profundidad.map((r) => [`${r.profundidad_m} m`, hectares(r.area_nucleo_ha, 0), pct(r.porcentaje_bosque_nucleo, 1)])) : `<p class="hint-p small">Área núcleo, distancia entre parches y cohesión: se calculan ${window.CHCP.pendiente()}.</p>`}`; },
    conectividad: (x) => { const e = x.estructura_2021; if (!e) return '<p class="fi-pending">Sin red calculada para este territorio.</p>'; const r = e.metricas_red, mp = e.metricas_paisaje;
      return `<div class="pe-ms">${tarjeta('Redes separadas', number(r.numero_componentes, 0), `umbral ${number(r.umbral_m || st.data.umbral_conectividad_m || 500, 0)} m`)}${tarjeta('Conexiones', number(r.numero_aristas, 0))}${tarjeta('Parches aislados', number(r.numero_parches_aislados, 0))}${tarjeta('IIC', mp?.iic == null ? '—' : number(mp.iic, 4), 'conectividad integral 0–1')}</div>
      ${(mp?.diic_principales || []).length ? tabla(['Parche', 'Superficie', 'Aporte (dIIC)', 'Función'], mp.diic_principales.slice(0, 5).map((d) => [`#${d.parche_id}`, hectares(d.area_ha, 1), pct(d.diic_pct, 1), d.es_puente ? 'Puente' : 'Gran hábitat'])) : ''}
      ${x.id !== 'chcp' ? `<p><a href="${enlace('restauracion')}?id=${encodeURIComponent(x.id)}">Simular dónde restaurar para reconectar →</a></p>` : ''}<p class="hint-p small">Conectividad estructural potencial por cercanía; no demuestra movimiento de fauna.</p>`; },
    corredores: (x) => { const c = x.corredores || {}; const feature = st.territory.subbasins.features.find((f) => f.properties.id === x.id);
      const puntos = feature ? (st.territory.critical_points?.features || []).filter((p) => RED.puntoEnPoligono(p.geometry.coordinates, feature.geometry)).length : (st.territory.critical_points?.features || []).length;
      return `<div class="pe-ms">${tarjeta('Dentro de corredores', pct(c.porcentaje, 1), hectares(c.area_ha, 0))}${tarjeta('Corredor Mesoamericano', c.intersecta_mesoamericano ? 'Sí' : 'No')}${tarjeta('Puntos críticos', number(puntos, 0), 'Almanaque Azul')}</div>
      ${(c.lista || []).length ? tabla(['Corredor', 'Categoría', 'Superficie'], c.lista.map((r) => [esc(r.nombre), esc(r.categoria || '—'), hectares(r.interseccion_ha, 0)])) : ''}`; },
    eri: (x) => { const e = x.eri; if (!e?.componentes) return `<p class="fi-pending">El ERI de este territorio se calcula ${window.CHCP.pendiente()}.</p>`;
      const n = { integridad_estructural: 'Integridad (35 %)', conectividad: 'Conectividad local (25 %)', estabilidad_topografica: 'Estabilidad del relieve (20 %)', proximidad_riparia: 'Cercanía a ríos (20 %)' };
      return `<div class="pe-ms">${tarjeta('ERI', `${number(e.valor * 100, 0)}/100`, esc(e.clase))}${Object.entries(e.componentes).map(([k, v]) => tarjeta(n[k] || k, `${number(v * 100, 0)}/100`)).join('')}</div><p class="hint-p small">Indicativo, sin validación de campo; no modifica la preevaluación.</p>`; },
    riparia: (x) => { const r = x.riparia; if (!r?.franjas) return `<p class="fi-pending">El análisis ripario se calcula ${window.CHCP.pendiente()}.</p>`;
      return `<p>Unos <b>${number(r.longitud_cauces_km, 1)} km</b> de cauces con drenaje ≥ ${r.area_drenaje_minima_km2} km².</p>${tabla(['Franja a cada lado', 'Bosque SINIA 2021', 'Árboles ESRI 2024'], r.franjas.map((f) => [`${f.ancho_m} m`, f.bosque_sinia_pct == null ? '—' : pct(f.bosque_sinia_pct, 1), f.arboles_esri_pct == null ? '—' : pct(f.arboles_esri_pct, 1)]))}${tabla(['Franja de 50 m sin bosque', 'Superficie'], r.sin_bosque_por_pendiente.map((f) => [`Pendiente ${f.pendiente}`, hectares(f.area_ha, 1)]))}<p class="hint-p small">${esc(r.nota)}</p>`; },
    sinia: (x) => `${tabla(['Producto', 'Bosque', '% del territorio'], (x.sinia || []).map((s) => [`SINIA ${s.year}`, hectares(s.forest_ha, 0), pct(s.forest_pct, 1)]))}<p class="hint-p small">Productos con métodos y escalas distintos: la diferencia entre años no mide pérdida ni ganancia.</p>`,
    relativa: (x) => { const b = x.indicadores_relativos; if (!b?.valores || x.id === 'chcp') return '<p class="fi-pending">Disponible por subcuenca.</p>';
      const n = { perdida_reciente_pct_anual: ['Pérdida reciente', '% del bosque/año'], salida_arboles_pct: ['Salida de árboles', '% árboles 2017'], perturbacion_acumulada_pct: ['Perturbación acumulada (legado)', '% del territorio'], descenso_vigor_pct: ['Descenso fuerte de vigor', '% del territorio'] };
      // Puesto entre las subcuencas (1 = mayor intensidad): posición relativa, no categoría de prioridad.
      const subsR = Object.values(st.data.territorios).filter((y) => y && y.id !== 'chcp');
      const puesto = (k) => { const v = b.valores[k], vals = subsR.map((y) => y.indicadores_relativos?.valores?.[k]).filter((z) => z != null); return v == null || !vals.length ? '—' : `${1 + vals.filter((z) => z > v).length} de ${vals.length}`; };
      return `${tabla(['Indicador', 'Subcuenca', 'Puesto (1 = mayor)', 'CHCP', 'Razón'], Object.entries(n).map(([k, [nm, u]]) => [`${nm}<small>${u}</small>`, b.valores[k] == null ? '—' : number(b.valores[k], 2), puesto(k), b.valores_cuenca?.[k] == null ? '—' : number(b.valores_cuenca[k], 2), b.razon_vs_cuenca?.[k] == null ? '—' : `${number(b.razon_vs_cuenca[k], b.razon_vs_cuenca[k] < 1 ? 2 : 1)} ×`]))}<p class="hint-p small"><span class="exp-tag">experimental</span> Para comparar subcuencas entre sí: el puesto ordena las subcuencas de mayor a menor intensidad. Sin umbrales calibrados; no constituye una prioridad validada. Razón &gt; 1 = más intenso que la CHCP.</p>`; },
  };
  const SECCIONES_P = {
    preevaluacion: (R0) => { const m = R0.metricas, v = R0.visita;
      return `${R0.error_borde > 0.10 ? `<p class="rs-warn"><b>Resultado aproximado:</b> error de borde estimado ${number(R0.error_borde * 100, 0)} % (&gt; 10 %); la categoría no es concluyente.</p>` : ''}
      <div class="pe-prio" style="border-color:${PRIO[R0.prioridad] || '#90a4ae'}"><span>Puntaje MT-2026.7${R0.error_borde > 0.10 ? ' · no concluyente' : ''}</span><b>${number(R0.puntaje, 1)} <small>/ 6.5</small></b><em style="color:${PRIO[R0.prioridad]}">${esc(R0.prioridad)}</em><small>Prioridad de visita: ${esc(v.prioridad_visita)} (${number(v.puntaje_integrado, 2)} pts; corredor +${number(v.aporte_corredor, 2)}) · ${esc(R0.consistencia.nivel)}</small></div>
      ${senalesHtml(R0.senales, R0.aportes, { tmf: `Deforestado ${hectares(m.tmf_deforestacion_ha, 2)} · degradado ${hectares(m.tmf_degradacion_ha, 2)}`, hansen: `Pérdida 2021–2025: ${hectares(m.hansen_post_2020_ha, 2)}`, esri: `Árboles → otra clase: ${hectares(m.esri_salida_arboles_ha, 2)} (${pct(m.esri_salida_arboles_pct, 1)})`, gedi: R0.disponibilidad.gedi ? `Altura media ${number(m.gedi_altura_media_m, 1)} m` : 'Sin cobertura GEDI suficiente', ndvi: R0.disponibilidad.ndvi ? `Descenso fuerte ${hectares(m.ndvi_disminucion_ha, 2)}` : 'Cobertura NDVI insuficiente' })}`; },
    cambio: (R0) => { const a = R0.acc, area = R0.metricas.area_ha || 1;
      return `${tabla(['Estado JRC 2025', 'Superficie', '%'], [[1, 'Bosque sin perturbación'], [2, 'Degradado'], [3, 'Deforestado'], [4, 'Regeneración'], [5, 'Agua'], [6, 'Otra cobertura']].map(([k, n]) => [n, hectares(a.jrc[k] || 0, 2), pct((a.jrc[k] || 0) / area * 100, 1)]))}
      ${tabla(['Pérdida Hansen', 'Superficie'], [21, 22, 23, 24, 25].map((y) => [`20${y}`, hectares(a.hansen[y] || 0, 2)]))}
      <div class="pe-ms">${tarjeta('ESRI árboles → otra clase', hectares(a.esri[1] || 0, 2))}${tarjeta('ESRI otra clase → árboles', hectares(a.esri[2] || 0, 2))}${tarjeta('Cambio medio de NDVI', R0.ndvi_delta_medio == null ? '—' : `${R0.ndvi_delta_medio > 0 ? '+' : ''}${number(R0.ndvi_delta_medio, 3)}`)}${tarjeta('Señal en ≥ 2 fuentes', hectares((a.coincidencia[2] || 0) + (a.coincidencia[3] || 0), 2))}</div>`; },
    fragmentacion: (R0) => { const f = R0.fragmentacion;
      if (!f) return `<p class="fi-pending">Los parches de bosque de estas subcuencas se generan ${window.CHCP.pendiente()}.</p>`;
      const ref = f.area_nucleo.find((x) => x.profundidad_m === 100);
      return `${f.sin_parches.length ? `<p class="rs-warn">Sin parches calculados todavía en: ${esc(f.sin_parches.join(', '))}. Esa parte no se incluyó.</p>` : ''}
      <div class="pe-ms">${tarjeta('Bosque oficial 2021', hectares(f.area_bosque_ha, f.area_bosque_ha < 10 ? 2 : 1), `${pct(f.porcentaje_bosque, 1)} del polígono`)}${tarjeta('Fragmentos de bosque', number(f.numero_fragmentos, 0), `${number(f.fragmentos_continuan_fuera, 0)} siguen fuera del polígono`)}${tarjeta('Fragmento mayor', pct(f.indice_fragmento_mayor_pct, 1), `${hectares(f.fragmento_mayor_ha, 1)} · del polígono`)}${tarjeta('Densidad de borde', `${number(f.densidad_borde_m_ha, 1)} m/ha`)}${tarjeta('Bosque interior (100 m)', pct(ref?.porcentaje_bosque_nucleo, 1), 'del bosque')}</div>
      ${tabla(['Profundidad de borde', 'Bosque interior', '% del bosque'], f.area_nucleo.map((r) => [`${r.profundidad_m} m`, hectares(r.area_nucleo_ha, 1), pct(r.porcentaje_bosque_nucleo, 1)]))}
      <p class="hint-p small">Bosque oficial SINIA 2021 en celdas de ${number(f.celda_m, 0)} m. El límite que usted dibujó no se cuenta como borde: el borde y el bosque interior se miden contra el no bosque real, también fuera del polígono. Por eso las cifras no son idénticas a las de la ficha de una subcuenca, donde el límite recorta los parches. La distancia entre parches y la cohesión no se calculan para polígonos porque dependen de ese recorte.</p>`; },
    conectividad: (R0) => { const e = R0.estructura;
      return `<div class="pe-ms">${tarjeta('Parches 2021 que toca', number(e.numero_parches, 0), 'área completa de cada parche')}${tarjeta('Redes entre ellos', number(e.numero_componentes || 0, 0))}${tarjeta('Estado', esc(R0.visita.contexto_estructural.estado))}</div><p class="hint-p small">Contexto de la red de parches que intersecta el polígono; no se extrapolan métricas de la subcuenca completa.</p>`; },
    corredores: (R0) => `<div class="pe-ms">${tarjeta('Dentro de corredores', pct(R0.corredores.porcentaje_aoi_en_corredores, 1), 'Almanaque Azul')}${tarjeta('Corredor Mesoamericano', R0.corredores.intersecta_mesoamericano ? 'Sí' : 'No')}${tarjeta('Aporte a la visita', `+${number(R0.visita.aporte_corredor, 2)}`, 'máx. 1,5')}</div>`,
    eri: (R0) => `<div class="pe-ms">${tarjeta('ERI medio', R0.eri_medio == null ? '—' : `${number(R0.eri_medio * 100, 0)}/100`)}</div><p class="hint-p small">Media de los píxeles del polígono; indicativo.</p>`,
    riparia: (R0) => { const r = R0.acc.riparia; return `<div class="pe-ms">${tarjeta('Franja de 50 m con bosque', hectares(r[1] || 0, 2))}${tarjeta('Sin bosque, pendiente < 30 %', hectares(r[2] || 0, 2))}${tarjeta('Sin bosque, pendiente ≥ 30 %', hectares(r[3] || 0, 2))}</div>`; },
    sinia: (R0) => { const a = R0.acc.sinia, area = R0.metricas.area_ha || 1; return tabla(['SINIA 2021', 'Superficie', '%'], [[1, 'Bosques y otras tierras boscosas'], [2, 'Otras tierras'], [3, 'Cuerpos de agua']].map(([k, n]) => [n, hectares(a[k] || 0, 2), pct((a[k] || 0) / area * 100, 1)])); },
  };

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
    pg.capa = pg.geo ? L.geoJSON(pg.geo, { style: { color: '#ffd400', weight: 3, fillColor: '#ffd400', fillOpacity: 0.04, dashArray: '6 4' }, interactive: false }).addTo(st.map) : null;
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
    const nuevo = guardar && pg.vertices.length >= 3;
    pg.vertices = []; dibujoVista(); mostrarPoligono();
    if (nuevo) poligonoNuevo();
  }
  // Un polígono nuevo deja de mostrar el análisis anterior y abre directamente la elección de análisis.
  /** Superficies por año dentro del polígono, a partir de los mapas por año de cada subcuenca. */
  async function seriePoligono(prod, soloAnios = null) {
    pg.series ||= {};
    const clave = soloAnios ? `${prod}:${soloAnios.join(',')}` : prod;
    if (pg.series[clave]) return pg.series[clave];
    const info = prodInfo(prod);
    const salida = prod === 'hansen' ? { perdida_por_anio: {}, cobertura_arborea_2000_ha: null } : { por_anio: {} };
    for (const id of st.vistaPol.ids) {
      const meta = st.series.territorios?.[id]?.mapas?.[prod];
      const f = st.territory.subbasins.features.find((x) => x.properties.id === id);
      if (!meta || !f) continue;
      const [w, h] = meta.dimensiones;
      const a = P.transformador(meta.limites, w, h);
      const mp = rasterizar(pg.geo, a, w, h), ms = rasterizar(f, a, w, h);
      const lista = []; for (let i = 0; i < w * h; i += 1) if (mp[i * 4 + 3] > 127 && ms[i * 4 + 3] > 127) lista.push(i);
      const dentro = Int32Array.from(lista), haPx = meta.tamano_pixel_m ** 2 / 10000;
      for (const anio of (prod === 'hansen' ? [null] : (soloAnios || info.anios).filter((y) => info.anios.includes(y)))) {
        let b;
        try { b = await bytesCache(serieFile(`mapas/${id}/${prod === 'hansen' ? 'hansen.v.png' : `${prod}_${anio}.v.png`}`)); } catch (_) { continue; }
        const cuenta = new Float64Array(256);
        for (let k = 0; k < dentro.length; k += 1) cuenta[b.v[dentro[k]]] += 1;
        for (let v = 0; v < 255; v += 1) {
          if (!cuenta[v]) continue;
          if (prod === 'hansen') { if (v >= 1) { const y = 2000 + v; salida.perdida_por_anio[y] = (salida.perdida_por_anio[y] || 0) + cuenta[v] * haPx; } } else { const dd = (salida.por_anio[anio] ||= {}); dd[v] = (dd[v] || 0) + cuenta[v] * haPx; }
        }
      }
    }
    pg.series[clave] = salida;
    return salida;
  }
  function poligonoNuevo() {
    pg.resultado = null; pg.series = {}; pg.vista = null;
    if (st.vistaPol) { st.vistaPol = null; st.modo = null; dibujar(); }
    abrirAsistente('poligono');
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
  const cacheGeo = new Map();
  function geometria(id) {
    if (!cacheGeo.has(id)) cacheGeo.set(id, api(`/api/v1/panel/geometry/${id}`).catch(() => null));
    return cacheGeo.get(id);
  }
  // Fragmentación del polígono: el bosque oficial 2021 (parches precalculados de las subcuencas)
  // se rasteriza en una malla UTM 17N con margen exterior, para medir borde y bosque interior
  // contra el no bosque real y no contra el límite dibujado.
  const MARGEN_FRAG_M = 250, MAX_CELDAS_FRAG = 8e6;
  async function fragmentacionPoligono() {
    const pts = P.poligonos(pg.geo).flat(2).map(([lon, lat]) => RED.utm17(lon, lat));
    const x0 = Math.min(...pts.map((q) => q[0])) - MARGEN_FRAG_M, x1 = Math.max(...pts.map((q) => q[0])) + MARGEN_FRAG_M;
    const y0 = Math.min(...pts.map((q) => q[1])) - MARGEN_FRAG_M, y1 = Math.max(...pts.map((q) => q[1])) + MARGEN_FRAG_M;
    let celda = 10;
    while (((x1 - x0) / celda) * ((y1 - y0) / celda) > MAX_CELDAS_FRAG || Math.max(x1 - x0, y1 - y0) / celda > 12000) celda += 5;
    const w = Math.ceil((x1 - x0) / celda), h = Math.ceil((y1 - y0) / celda);
    const a = (lon, lat) => { const [x, y] = RED.utm17(lon, lat); return [(x - x0) / celda, (y1 - y) / celda]; };
    const c = P.caja(pg.geo), g = 0.004; // ≈ 400 m, cubre el margen
    const cercanas = st.territory.subbasins.features.filter((f) => cajasSeCruzan(P.caja(f), [c[0] - g, c[1] - g, c[2] + g, c[3] + g]));
    const conocidas = [], parches = [];
    for (const f of cercanas) { const geo = st.data.territorios[f.properties.id]?.red_disponible === false ? null : await geometria(f.properties.id); if (!geo?.parches) continue; conocidas.push(f); parches.push(...geo.parches.features); }
    if (!conocidas.length) return null;
    const alfa = (rgba) => { const o = new Uint8Array(w * h); for (let i = 0; i < o.length; i += 1) o[i] = rgba[i * 4 + 3] > 127 ? 1 : 0; return o; };
    const dentro = alfa(rasterizar(pg.geo, a, w, h));
    const conocido = alfa(rasterizar({ type: 'FeatureCollection', features: conocidas }, a, w, h));
    const bos = alfa(rasterizar({ type: 'FeatureCollection', features: parches }, a, w, h));
    const bosque = new Uint8Array(w * h);
    for (let i = 0; i < bosque.length; i += 1) bosque[i] = bos[i] ? 1 : conocido[i] ? 0 : 2;
    const r = P.fragmentacion(bosque, dentro, w, h, celda);
    r.sin_parches = cercanas.filter((f) => !conocidas.includes(f) && tocaPoligono(f)).map((f) => f.properties.nombre);
    return r;
  }
  async function analizarPoligono(elegidos = []) {
    pg.resultado = null;
    const codec = st.data.codificacion_valores;
    const cajaP = P.caja(pg.geo);
    const subs = st.territory.subbasins.features.filter((f) => cajasSeCruzan(P.caja(f), cajaP) && tocaPoligono(f));
    const sinDatos = subs.filter((f) => !st.data.territorios[f.properties.id]?.mapas?.valores?.includes('aux'));
    if (!subs.length) { mostrarError('El polígono está fuera de la Cuenca Hidrográfica del Canal de Panamá.'); return; }
    if (!codec || sinDatos.length === subs.length) { mostrarError(`Los mapas de valores para analizar polígonos se generan ${window.CHCP.pendiente()}.`); return; }
    // Tolerancia de borde (auditoría D.6): error relativo esperado por rasterización ≈ perímetro × píxel / (2 × área).
    const pixel = Math.max(...subs.map((f) => st.data.territorios[f.properties.id]?.mapas?.tamano_pixel_m || 0));
    const perimetro = P.poligonos(pg.geo).flat().reduce((s, anillo) => s + anillo.slice(1).reduce((t, p, i) => { const [x1, y1] = RED.utm17(...anillo[i]); const [x2, y2] = RED.utm17(...p); return t + Math.hypot(x2 - x1, y2 - y1); }, 0), 0);
    const errorBorde = perimetro * pixel / (2 * P.areaHa(pg.geo) * 10000);
    if (errorBorde > 0.25) { mostrarError(`Polígono demasiado pequeño o irregular para la malla precalculada (píxel ${number(pixel, 0)} m; error de borde estimado ${number(errorBorde * 100, 0)} %). Para este caso se requiere el análisis directo con Earth Engine en la plataforma completa.`); return; }
    $('#pg-busy').hidden = false;
    const acc = P.nuevoAcumulador();
    const corrColor = (f) => (f.properties?.es_mesoamericano || /mesoamericano/i.test(f.properties?.nombre || '') ? 'rgb(200,0,0)' : 'rgb(100,0,0)');
    const red = { areas: new Map(), aristas: [] };
    const mapaP = { parches: [], brechas: [] };
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
      // Máscara = polígono ∩ subcuenca: cada píxel se cuenta una sola vez aunque las mallas de
      // subcuencas vecinas se solapen (fuera de su subcuenca los mapas no tienen datos válidos).
      const mrgba = rasterizar(pg.geo, a, w, h), srgba = rasterizar(f, a, w, h);
      const mascara = new Uint8Array(w * h); for (let i = 0; i < mascara.length; i += 1) mascara[i] = mrgba[i * 4 + 3] > 127 && srgba[i * 4 + 3] > 127 ? 1 : 0;
      const crgba = rasterizar(st.territory.corridors, a, w, h, corrColor);
      const corr = new Uint8Array(w * h); for (let i = 0; i < corr.length; i += 1) { const r = crgba[i * 4]; corr[i] = crgba[i * 4 + 3] > 127 ? (r > 150 ? 2 : 1) : 0; }
      P.acumular(acc, capas, mascara, corr, (x.mapas.tamano_pixel_m ** 2) / 10000, codec);
      acc.pixeles_m.push(x.mapas.tamano_pixel_m);
      try {
        const g = await geometria(x.id);
        if (!g) throw new Error('sin red');
        mapaP.parches.push(...g.parches.features.map((ft) => ({ ...ft, properties: { ...ft.properties, subcuenca: x.id } }))); mapaP.brechas.push(...(g.brechas?.features || []));
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
    let frag = null;
    if (elegidos.includes('fragmentacion')) {
      $('#pg-paso').textContent = 'Fragmentación del bosque oficial 2021';
      await new Promise((ok) => setTimeout(ok, 30));
      frag = await fragmentacionPoligono();
    }
    pg.series = {};
    st.vistaPol = pg.vista = { ids: subs.map((f) => f.properties.id), geo: mapaP.parches.length ? { parches: { type: 'FeatureCollection', features: mapaP.parches }, brechas: { type: 'FeatureCollection', features: mapaP.brechas } } : null };
    pg.resultado = { ...P.evaluar(acc, estructura), acc, estructura, fragmentacion: frag, error_borde: errorBorde, perimetro_m: perimetro, area_dibujada_ha: P.areaHa(pg.geo), subcuencas: subs.map((f) => f.properties.nombre), sin_datos: sinDatos.map((f) => f.properties.nombre), pixel_m: acc.pixeles_m.length ? Math.max(...acc.pixeles_m) : null };
    $('#pg-busy').hidden = true;
  }
  // ------------------------------------------------------------ ficha del área dibujada
  // Guarda el análisis del polígono y abre la misma ficha técnica que tienen las subcuencas
  // (ficha.html?poligono=1), con sus secciones, textos y descargas en PDF.
  async function abrirFichaPoligono() {
    const R0 = pg.resultado;
    if (!R0 || !pg.geo) return;
    const ventana = window.open('', '_blank');  // se abre ya, durante el clic, para que el navegador no la bloquee
    if (ventana) ventana.document.write('<p style="font:16px system-ui;padding:24px">Preparando la ficha del área dibujada…</p>');
    window.CHCP.toast?.('Preparando la ficha del área dibujada…');
    if (!R0.fragmentacion) { try { R0.fragmentacion = await fragmentacionPoligono(); } catch (_) { /* sin parches */ } }
    let jrc = null;
    try { if (st.series?.productos?.jrc) jrc = await seriePoligono('jrc', [2020, 2021, 2022, 2023, 2024, 2025]); } catch (_) { jrc = null; }
    const paquete = { version: 1, creado: new Date().toISOString(), geo: pg.geo, ids: pg.vista?.ids || [], resultado: R0, jrc_por_anio: jrc?.por_anio || null };
    try { localStorage.setItem('chcp-poligono', JSON.stringify(paquete)); } catch (_) { mostrarError('El navegador no permitió guardar el análisis para abrir la ficha.'); if (ventana) ventana.close(); return; }
    const url = `${enlace('ficha')}?poligono=1`;
    if (ventana) ventana.location.href = url; else window.location.href = url;
  }
  function mostrarError(texto) {
    $('#pe-res-eyebrow').textContent = 'Polígono'; $('#pe-res-title').textContent = 'No se pudo analizar'; $('#pe-res-sub').textContent = '';
    $('#pe-res-b').innerHTML = `<p class="fi-pending">${esc(texto)}</p>`; $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true;
  }
  function iniciarPoligono() {
    $('#pg-draw').addEventListener('click', () => { pg.dibujando = true; pg.vertices = []; $('#pg-drawbar').hidden = false; st.map.doubleClickZoom.disable(); st.map.getContainer().style.cursor = 'crosshair'; dibujoVista(); });
    st.map.on('click', (e) => { if (!pg.dibujando) return; pg.vertices.push(e.latlng); dibujoVista(); $('#pg-clear').disabled = false; });
    st.map.on('dblclick', () => { if (pg.dibujando) terminarDibujo(true); });
    $('#pg-undo').addEventListener('click', () => { pg.vertices.pop(); dibujoVista(); });
    $('#pg-end').addEventListener('click', () => terminarDibujo(true));
    $('#pg-cancel').addEventListener('click', () => terminarDibujo(false));
    $('#pg-clear').addEventListener('click', () => { pg.geo = null; pg.vertices = []; pg.resultado = null; pg.series = {}; pg.vista = null; dibujoVista(); mostrarPoligono(); st.analisis = st.analisis.filter((e) => !e.poli); renderMisAnalisis(); if (st.vistaPol) { st.vistaPol = null; st.modo = null; dibujar(); renderPanel(); } });
    $('#pg-run').addEventListener('click', () => abrirAsistente('poligono'));
    $('#pg-file').addEventListener('change', async (e) => {
      const archivo = e.target.files[0]; if (!archivo) return;
      const texto = await archivo.text();
      let geo = null;
      try { geo = /\.kml$/i.test(archivo.name) ? P.leerKml(texto) : JSON.parse(texto); } catch (_) { geo = null; }
      const partes = geo ? P.poligonos(geo) : [];
      if (!partes.length) { mostrarError('No se encontró ningún polígono en el archivo (use GeoJSON en WGS 84 o KML).'); return; }
      pg.geo = partes.length === 1 ? { type: 'Polygon', coordinates: partes[0] } : { type: 'MultiPolygon', coordinates: partes };
      mostrarPoligono(); e.target.value = ''; poligonoNuevo();
    });
  }


  // ------------------------------------------------------------ inicio
  try {
    [st.data, st.territory, st.series] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory'),
      fetch(serieFile('indice.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null), window.CHCP.consultarActualizacion()]);
  } catch (error) { $('#pe-temas').innerHTML = `<p class="fi-pending">No se pudieron cargar los datos: ${esc(error.message)}</p>`; return; }
  st.map = L.map('smap', { zoomControl: true });
  // Paneles de ancho ajustable: arrastre el borde entre el panel y el mapa.
  { const raiz = document.getElementById('v-plataforma'), inval = () => st.map.invalidateSize();
    window.CHCP.divisor({ panel: document.getElementById('left-panel'), ancla: raiz, borde: 'derecho', clave: 'pe-side', min: 240, max: 560,
      aplicar: (w) => (w ? raiz.style.setProperty('--pe-side-w', `${w}px`) : raiz.style.removeProperty('--pe-side-w')), alCambiar: inval });
    window.CHCP.divisor({ panel: document.getElementById('pe-res'), ancla: raiz, borde: 'izquierdo', clave: 'pe-res', min: 300, max: 900,
      aplicar: (w) => (w ? raiz.style.setProperty('--pe-res-w', `${w}px`) : raiz.style.removeProperty('--pe-res-w')), alCambiar: inval }); }
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
  $('#pe-terr').addEventListener('change', (e) => seleccionar(e.target.value));
  $$('.side-tabs [data-s]').forEach((b) => b.addEventListener('click', () => { $$('.side-tabs [data-s]').forEach((x) => x.setAttribute('aria-selected', String(x === b))); ['capas', 'poligono', 'base'].forEach((k) => { $(`#s-${k}`).hidden = k !== b.dataset.s; }); }));
  $('#pe-run').addEventListener('click', () => abrirAsistente());
  $('#pe-modal-x').addEventListener('click', () => { $('#pe-modal').hidden = true; });
  $('#pe-back').addEventListener('click', () => { wiz.paso = Math.max(0, wiz.paso - 1); pintarAsistente(); });
  $('#pe-next').addEventListener('click', () => { if (wiz.paso < pasosWiz().length - 1) { wiz.paso += 1; pintarAsistente(); } else ejecutarAsistente(); });
  $('#pe-res-close').addEventListener('click', () => { $('#pe-res').classList.add('closed'); $('#pe-reopen').hidden = false; });
  $('#pe-reopen').addEventListener('click', () => { $('#pe-res').classList.remove('closed'); $('#pe-reopen').hidden = true; });
  iniciarPoligono();
  // El panel de resultados se abre y se cierra con una transición: el mapa se reajusta solo.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => st.map.invalidateSize()).observe($('#smap'));
  // Recorrido guiado de la plataforma, con la misma ventanita de invitación del inicio.
  const PASOS_PE = [
    { titulo: 'La Plataforma SIG', texto: '<p>Aquí se responde, con mapas y gráficas, <b>qué le está pasando al bosque</b> de la cuenca, de una subcuenca o de su propia finca.</p><p>Todo sale de datos satelitales precalculados: es una evaluación preliminar.</p>' },
    { sel: '#pe-terr', titulo: '1. ¿Dónde?', texto: 'Elija toda la cuenca o una subcuenca. También puede hacer clic en una subcuenca del mapa.', prueba: 'elija una subcuenca en la lista; el recorrido sigue solo.', accion: { sel: '#pe-terr', evento: 'change' } },
    { sel: '#pe-temas', titulo: '2. ¿Qué quiere saber?', texto: 'Cada tema responde una pregunta: si ha perdido bosque, cómo cambió desde 1990, qué reemplazó a los árboles, si la vegetación pierde vigor, qué tan fragmentado está… La «i» explica la fuente.', prueba: 'pulse «Cobertura y uso · ESRI» u otro tema.', accion: { sel: '#pe-temas', evento: 'click' } },
    { sel: '#pe-legend', titulo: '3. La leyenda', texto: 'Muestra los colores del tema. Desmarque una clase para ocultarla; en «Capas auxiliares» puede añadir ríos, corredores o límites.', prueba: 'desmarque una clase y vea cómo desaparece del mapa.', accion: { sel: '#pe-legend', evento: 'change' } },
    { sel: '#pe-anios', titulo: '4. La barra de años', texto: 'Mueva la barra o pulse reproducir para ver el mapa año por año. Las gráficas marcan el año elegido.', prueba: 'mueva la barra a otro año.', accion: { sel: '#pe-anios', evento: 'change' } },
    { sel: '#pe-res', titulo: '5. Las respuestas', texto: 'Arriba, la respuesta corta; debajo, las gráficas: superficie por clase, evolución, comparación de dos años y las subcuencas más afectadas. Cada gráfica tiene «Ver tabla».' },
    { sel: '.side-tabs [data-s="poligono"]', titulo: '6. Su propia área', texto: 'En «Mi geometría» puede dibujar o subir el polígono de una finca y obtener las mismas gráficas dentro de él, además de su ficha técnica completa con descarga en PDF.', prueba: 'abra la pestaña «Mi geometría».', accion: { sel: '.side-tabs [data-s="poligono"]', evento: 'click' } },
    { sel: '#pe-run', titulo: '7. Realizar análisis', texto: 'Marque una o varias preguntas, elija el territorio y verá una pestaña de resultados por pregunta. Quedan guardadas en «Sus análisis».', prueba: 'pulse «Realizar análisis» y siga los pasos.', accion: { sel: '#pe-run', evento: 'click' } },
  ];
  const recorridoPe = () => window.CHCP_TOUR?.iniciar(PASOS_PE, { clave: 'plataforma', textoFin: 'Entendido' });
  $('#pe-ayuda')?.addEventListener('click', recorridoPe);
  setTimeout(() => window.CHCP_TOUR?.invitar('plataforma', 'Le mostramos cómo usar la plataforma en 1 minuto.', recorridoPe), 1500);
  const params = new URLSearchParams(location.search);
  if (params.has('geometria')) $('.side-tabs [data-s="poligono"]').click();
  if (params.get('tema') && TEMA[params.get('tema')]) st.tema = params.get('tema');
  renderTemas();
  if (params.get('parche') && !params.get('tema')) st.tema = 'frag';
  if (params.get('parche') && TEMA.frag) renderTemas();
  await seleccionar(params.get('id') || location.hash.slice(1) || 'chcp');
  // ?parche=N (desde la ficha): acerca el mapa a ese parche de bosque y lo resalta.
  const nParche = Number(params.get('parche'));
  if (nParche && st.geo?.parches?.features) {
    const f = st.geo.parches.features.find((x) => x.properties.patch_id === nParche);
    if (f) {
      const resalte = L.geoJSON(f, { style: { color: '#ffeb3b', weight: 4, fill: false }, interactive: false }).addTo(st.map);
      st.map.fitBounds(resalte.getBounds(), { padding: [60, 60], maxZoom: 16 });
      resalte.bindTooltip(`Parche #${nParche} · ${hectares(f.properties.area_ha)}`, { permanent: true, direction: 'top' }).openTooltip();
    }
  }
})();
