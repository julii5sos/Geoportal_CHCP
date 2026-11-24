(async function () {
  const {api, toast, escapeHtml: esc, writePortalState} = window.CHCP;
  if (!document.getElementById('v-inicio')) return;
  try {
    const territory = await api('/api/v1/territory');
    window.__chcpTerritory = territory;
    llenarAreas(territory);
  } catch (error) {
    toast('No se pudo cargar el límite territorial.', 'error');
  }

  const input = document.getElementById('territory-query');
  const results = document.getElementById('territory-results');
  const status = document.getElementById('territory-search-status');
  const spinner = document.getElementById('territory-search-spinner');
  let choices = [];
  let active = -1;
  let timer;

  function closeResults() {
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function choose(item) {
    writePortalState({territoryId: item.id, territoryName: item.nombre, territoryType: item.tipo});
    // El lugar elegido queda como área de las preguntas, que es el siguiente paso natural.
    elegirArea(item.tipo === 'cuenca' ? 'chcp' : item.id);
    closeResults();
    input.value = item.nombre;
    document.getElementById('in-preguntas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderChoices() {
    if (!choices.length) {
      results.innerHTML = '<div class="territory-no-results">No hay coincidencias. Pruebe con una parte del nombre, por ejemplo «Río» o «Lago».</div>';
      status.textContent = 'No se encontraron territorios reales con ese texto.';
    } else {
      results.innerHTML = choices.map((item, index) => `<button id="territory-option-${index}" type="button" role="option" aria-selected="${index === active}" data-index="${index}"><span>${esc(item.nombre)}</span><small>${esc(item.tipo === 'cuenca' ? 'Cuenca principal' : item.grupo || 'Subcuenca')}</small></button>`).join('');
      status.textContent = `${choices.length} coincidencia${choices.length === 1 ? '' : 's'}. Use las flechas y Enter para seleccionar.`;
      results.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => choose(choices[Number(button.dataset.index)])));
    }
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  async function search() {
    const query = input.value.trim();
    if (query.length < 2) { closeResults(); status.textContent = 'Escriba al menos dos caracteres.'; return; }
    spinner.hidden = false;
    status.textContent = 'Buscando territorios…';
    try {
      const normal = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const response = window.CHCP_STATIC
        ? { results: [{ id: 'chcp', nombre: 'Cuenca Hidrográfica del Canal de Panamá', tipo: 'cuenca' },
            ...(window.__chcpTerritory?.subbasins?.features || []).map((f) => ({ id: f.properties.id, nombre: f.properties.nombre, grupo: f.properties.grupo, tipo: 'subcuenca' }))]
            .filter((item) => normal(item.nombre).includes(normal(query))).slice(0, 12) }
        : await api(`/api/v1/territories/search?q=${encodeURIComponent(query)}`);
      choices = response.results;
      active = choices.length ? 0 : -1;
      renderChoices();
    } catch (error) {
      closeResults();
      status.textContent = 'No fue posible consultar el catálogo territorial.';
    } finally { spinner.hidden = true; }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 180); });
  input.addEventListener('keydown', (event) => {
    if (results.hidden || !choices.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      renderChoices();
      input.setAttribute('aria-activedescendant', `territory-option-${active}`);
    } else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(choices[active]); }
    else if (event.key === 'Escape') closeResults();
  });
  document.addEventListener('click', (event) => { if (!document.getElementById('territory-search').contains(event.target)) closeResults(); });

  // Íconos de línea del geoportal (sin emojis).
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = window.CHCP_ICON?.(el.dataset.icon, el.classList.contains('in-ic') ? 24 : 16) || ''; });

  // ------------------------------------------------------------ preguntas: área y destinos
  function llenarAreas(territory) {
    const sel = document.getElementById('in-area');
    if (!sel) return;
    const subs = territory.subbasins.features.map((f) => f.properties).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    sel.insertAdjacentHTML('beforeend', subs.map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join(''));
    sel.addEventListener('change', () => actualizarDestinos());
    actualizarDestinos();
  }
  function elegirArea(id) {
    const sel = document.getElementById('in-area');
    if (sel && [...sel.options].some((o) => o.value === id)) { sel.value = id; actualizarDestinos(); }
  }
  function actualizarDestinos() {
    const sel = document.getElementById('in-area');
    const id = sel?.value || 'chcp';
    const nombre = id === 'chcp' ? '' : sel.options[sel.selectedIndex].text;
    const S = Boolean(window.CHCP_STATIC);
    const ruta = { ficha: S ? 'ficha.html' : '/ficha', restauracion: S ? 'restauracion.html' : '/restauracion', panel: S ? 'panel.html' : '/panel',
      coberturas: S ? 'coberturas.html' : '/coberturas', platform: S ? 'plataforma.html' : '/platform', exactitud: S ? 'metodologia.html#exactitud' : '/methodology#exactitud' };
    document.querySelectorAll('[data-destino]').forEach((a) => {
      const d = a.dataset.destino;
      let href = ruta[d];
      if (d === 'ficha') href += `?id=${encodeURIComponent(id)}${a.dataset.ancla || ''}`;
      else if (d === 'restauracion') href += `?${id === 'chcp' ? '' : `id=${encodeURIComponent(id)}`}${a.dataset.modo ? `${id === 'chcp' ? '' : '&'}modo=${a.dataset.modo}` : ''}`;
      else if (d === 'panel') href += `#${encodeURIComponent(id === 'chcp' ? 'chcp' : nombre)}`;
      else if (d === 'coberturas' && nombre) href += `#${encodeURIComponent(nombre)}`;
      else if (d === 'platform') {
        const q = new URLSearchParams();
        if (id !== 'chcp') q.set('id', id);
        if (a.dataset.tema) q.set('tema', a.dataset.tema);
        if (a.dataset.geometria) q.set('geometria', '1');
        if ([...q].length) href += `?${q}`;
      }
      a.setAttribute('href', href);
    });
    // El simulador trabaja por subcuenca: con toda la cuenca elegida, abre una de ejemplo.
    document.querySelectorAll('.in-q-dest small.in-nota').forEach((n) => n.remove());
    if (id === 'chcp') document.querySelectorAll('.in-q-dest').forEach((a) => a.insertAdjacentHTML('beforeend', '<small class="in-nota">Se abre con una subcuenca de ejemplo; puede cambiarla allí.</small>'));
  }
  actualizarDestinos();

  // ------------------------------------------------------------ recorrido guiado
  const PASOS = [
    { titulo: 'Bienvenida', texto: '<p>Este geoportal le ayuda a responder una pregunta: <b>¿qué le está pasando al bosque de la Cuenca del Canal?</b></p><p>Combina varias fuentes satelitales con la cartografía oficial para mostrar dónde hay pérdida o degradación, qué tan fragmentado está el bosque y cómo podría reconectarse.</p>' },
    { sel: '.in-globo', titulo: 'La cuenca en el mapa', texto: 'El globo se acerca a la Cuenca del Canal y muestra, año por año desde 2001, dónde se perdió cobertura arbórea según Hansen. Cada punto es un píxel con pérdida.' },
    { sel: '#territory-search', titulo: '1. Elija un lugar', texto: 'Escriba el nombre de una subcuenca o río, o elija toda la cuenca. Lo que elija se usará en las preguntas de abajo.' },
    { sel: '#in-aviso', titulo: 'Es una evaluación preliminar', texto: 'Los resultados vienen de imágenes satelitales y mapas oficiales. Indican <b>dónde conviene mirar primero</b>; la confirmación siempre requiere verificación en campo.' },
    { sel: '#in-preguntas .in-grid', titulo: '2. Elija una pregunta', texto: 'Cada tarjeta es una pregunta concreta y le lleva directo a la herramienta que la responde, ya con el área elegida. Debajo de cada pregunta verá qué fuentes se usan.' },
    { sel: '.in-q-dest', titulo: '3. Explore escenarios', texto: 'El <b>simulador</b> permite probar dónde restaurar para reconectar el bosque, o trazar rutas hacia el Corredor Biológico Mesoamericano. Son escenarios hipotéticos para comparar opciones.' },
    { sel: '#links', titulo: 'Todo está también en el menú', texto: '<b>Panel</b>: indicadores, fichas y coberturas oficiales. <b>Plataforma</b>: mapa SIG, simulador y verificación de campo. <b>Metodología</b>: cómo se calcula cada cosa.' },
    { titulo: '¡Listo!', texto: '<p>Empiece eligiendo un lugar y una pregunta. Si tiene dudas, las <b>preguntas frecuentes</b> están al final de esta página y cada herramienta tiene su propio botón <b>«Cómo se usa»</b>.</p>' },
  ];
  const iniciarRecorrido = () => window.CHCP_TOUR?.iniciar(PASOS, { clave: 'inicio', textoFin: 'Empezar a explorar' });
  document.getElementById('in-tour')?.addEventListener('click', iniciarRecorrido);
  window.CHCP_TOUR?.invitar('inicio', 'Le mostramos en 1 minuto qué puede hacer.', iniciarRecorrido);
})();

/* Portada: las fotos de fondo de «Para qué sirve este geoportal» se alternan
   con un fundido. Sin movimiento si el usuario pidió reducirlo, y en pausa
   cuando la pestaña no está visible. */
(function () {
  const fotos = [...document.querySelectorAll('.in-ini-fondo img')];
  if (fotos.length < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    if (document.hidden) return;
    const vivas = fotos.filter((f) => f.isConnected);
    if (vivas.length < 2) return;
    vivas.forEach((f) => f.classList.remove('on'));
    i = (i + 1) % vivas.length;
    vivas[i].classList.add('on');
  }, 7000);
})();
