(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = (value, digits = 1) => new Intl.NumberFormat('es-PA', {maximumFractionDigits: digits, minimumFractionDigits: digits}).format(Number(value || 0));
  const hectares = (value, digits = 1) => `${number(value, digits)} ha`;

  // Archivos precalculados por territorio (mapas PNG y ríos): estático o servidor.
  const mapFile = (id, file) => (window.CHCP_STATIC ? `datos/mapas/${encodeURIComponent(id)}/${file}` : `/api/v1/panel/maps/${encodeURIComponent(id)}/${file}`);

  const valFile = (ruta) => (window.CHCP_STATIC ? `datos/validacion/${ruta}` : `/api/v1/validacion/${ruta}`);
  // ¿Hay una «Actualizar datos con Earth Engine» en curso? (API pública de GitHub, sin credenciales).
  // `pendiente()` devuelve la frase para los textos de «se calculará…» según la respuesta.
  const REPO_DATOS = 'julii5sos/Geoportal_CHCP';
  let actualizacion = null, actualizacionPromesa = null;
  function consultarActualizacion() {
    if (actualizacionPromesa) return actualizacionPromesa;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 3000) : null;
    actualizacionPromesa = fetch(`https://api.github.com/repos/${REPO_DATOS}/actions/workflows/actualizar-datos.yml/runs?status=in_progress&per_page=1`,
      { headers: { Accept: 'application/vnd.github+json' }, signal: ctl?.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const run = j?.workflow_runs?.[0]; actualizacion = run ? { desde: run.run_started_at, url: run.html_url } : null; return actualizacion; })
      .catch(() => null)
      .finally(() => t && clearTimeout(t));
    return actualizacionPromesa;
  }
  function pendiente(prep = 'en') {
    if (!actualizacion) return `${prep} la próxima actualización de datos con Earth Engine`;
    const d = new Date(actualizacion.desde);
    const hora = d.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit' });
    const dia = d.toDateString() === new Date().toDateString() ? 'hoy' : d.toLocaleDateString('es-PA', { day: 'numeric', month: 'short' });
    return `${prep} la actualización de datos con Earth Engine que está en curso (iniciada ${dia} a las ${hora}); los resultados aparecerán al terminar`;
  }
  const serieFile = (ruta) => (window.CHCP_STATIC ? `datos/series/${ruta}` : `/api/v1/series/${ruta}`);
  const hidroFile = (archivo) => (window.CHCP_STATIC ? `datos/hidrografia/${archivo}` : `/api/v1/hidrografia/${archivo}`);

  // Procedencia visible de cada resultado (auditoría D): tipo A, B o C, fecha y versión.
  const TIPOS_PROCESAMIENTO = { A: 'Calculado con Earth Engine en este momento', B: 'Precalculado con Earth Engine', C: 'Estimación local en su navegador (derivada de resultados precalculados)' };
  function procedencia(datos, tipo = 'B', territorio = null, extra = '') {
    const p = (datos && datos.procesamiento) || {};
    const fecha = String((territorio && territorio.procesado) || p.fecha_procesamiento || (datos && datos.generado) || '').replace('T', ' ').slice(0, 16);
    const version = territorio && territorio.version_datos != null ? `<span>Datos v${escapeHtml(String(territorio.version_datos))}</span>` : '';
    const parcial = datos && datos.estado_actualizacion && !datos.estado_actualizacion.completa ? '<span class="pr-warn">actualización parcial</span>' : '';
    // Cada dato en su propia etiqueta (sin separadores de puntos).
    return `<div class="procedencia" data-tipo="${tipo}"><b>Tipo ${tipo}</b><span>${escapeHtml(TIPOS_PROCESAMIENTO[tipo])}</span><span>Cálculo: ${escapeHtml(fecha || 'sin fecha')}</span>${version}<span>${escapeHtml(p.metodologia || (datos && datos.metodologia) || '')}</span><span>Código ${escapeHtml(String(p.version_codigo || 'no registrado').slice(0, 12))}</span>${extra}${parcial}</div>`;
  }

  async function api(path, options = {}) {
    if (window.CHCP_STATIC) {
      // Sitio estático (GitHub Pages): solo datos precalculados, sin Earth Engine.
      const clean = path.split('?')[0];
      const geometry = clean.match(/^\/api\/v1\/panel\/geometry\/([A-Za-z0-9_-]+)$/);
      const file = geometry ? `datos/subcuencas/${geometry[1]}.json` : window.CHCP_STATIC[clean];
      if (!file) {
        const error = new Error('Disponible solo en la versión completa del geoportal (requiere Earth Engine).');
        error.status = 501;
        throw error;
      }
      const response = await fetch(file);
      if (!response.ok) throw new Error(`No se pudo leer ${file} (${response.status}).`);
      return response.json();
    }
    const response = await fetch(path, {
      ...options,
      headers: {'Content-Type': 'application/json', ...(options.headers || {})},
    });
    const type = response.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(body?.error || `La solicitud falló (${response.status}).`);
      error.status = response.status;
      error.details = body?.details;
      error.supportId = body?.support_id;
      throw error;
    }
    return body;
  }

  function toast(message, kind = 'info') {
    let element = $('.toast');
    if (!element) {
      element = document.createElement('div');
      element.className = 'toast';
      element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.dataset.kind = kind;
    element.hidden = false;
    clearTimeout(element._timer);
    element._timer = setTimeout(() => { element.hidden = true; }, 4500);
  }

  const stateKey = 'chcp.portal-state.v1';
  function readPortalState() {
    try { return JSON.parse(localStorage.getItem(stateKey) || '{}'); }
    catch (_) { return {}; }
  }
  function writePortalState(patch) {
    const next = {...readPortalState(), ...patch, updatedAt: new Date().toISOString()};
    localStorage.setItem(stateKey, JSON.stringify(next));
    return next;
  }

  function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  }

  const burger = $('#burger');
  const links = $('#links');
  burger?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });

  // Abierto con doble clic (file://): el navegador bloquea la lectura de los datos. Se explica
  // qué hacer en lugar de mostrar una página vacía.
  const SITIO_EN_LINEA = 'https://julii5sos.github.io/Geoportal_CHCP/';
  if (location.protocol === 'file:') {
    const avisar = () => {
      if (document.getElementById('chcp-file-aviso')) return;
      const d = document.createElement('div');
      d.id = 'chcp-file-aviso'; d.setAttribute('role', 'alert');
      d.innerHTML = `<b>Esta página se abrió como archivo y el navegador no le deja leer sus datos.</b>
        <span>Ábrala en línea en <a href="${SITIO_EN_LINEA}">${SITIO_EN_LINEA}</a>, o cierre esta pestaña y use
        «Abrir Geoportal (Windows).bat» (o «Abrir Geoportal (Mac o Linux).command») de la carpeta descomprimida.</span>`;
      document.body.prepend(d);
    };
    if (document.body) avisar(); else document.addEventListener('DOMContentLoaded', avisar);
  }

  // ------------------------------------------------------------ mapa base elegible
  // Mapas base de Esri (los mismos de la Plataforma). La elección se recuerda entre páginas.
  const BASES_MAPA = {
    satelite: { nombre: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', atrib: 'Esri World Imagery' },
    gris: { nombre: 'Gris claro', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', atrib: 'Esri Light Gray Canvas' },
    topo: { nombre: 'Topográfico', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', atrib: 'Esri World Topographic Map' },
    calles: { nombre: 'Calles', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', atrib: 'Esri World Street Map' },
  };
  function baseGuardada(defecto) {
    try { const k = localStorage.getItem('chcp-mapa-base'); return BASES_MAPA[k] ? k : defecto; } catch (_) { return defecto; }
  }
  function capaBase(clave) {
    const b = BASES_MAPA[clave] || BASES_MAPA.satelite;
    return L.tileLayer(b.url, { attribution: b.atrib, maxZoom: 18, crossOrigin: true });
  }
  /**
   * Pone el mapa base en `map` y un selector (arriba a la derecha) para cambiarlo. Todos los
   * mapas de la página con selector cambian juntos; la elección se guarda para otras páginas.
   * Opciones: { defecto: 'satelite', control: true }.
   */
  function mapaBase(map, opciones = {}) {
    let clave = baseGuardada(opciones.defecto || 'satelite');
    let capa = capaBase(clave).addTo(map);
    capa.bringToBack();
    const poner = (k) => {
      if (!BASES_MAPA[k] || k === clave) return;
      map.removeLayer(capa); clave = k; capa = capaBase(k).addTo(map); capa.bringToBack();
      if (sel) sel.value = k;
    };
    let sel = null;
    if (opciones.control !== false) {
      const Control = L.Control.extend({ options: { position: 'topright' }, onAdd() {
        const div = L.DomUtil.create('div', 'chcp-base');
        div.innerHTML = `<label><span>Mapa base</span><select aria-label="Mapa base">${Object.entries(BASES_MAPA).map(([k, b]) => `<option value="${k}">${b.nombre}</option>`).join('')}</select></label>`;
        sel = div.querySelector('select'); sel.value = clave;
        L.DomEvent.disableClickPropagation(div); L.DomEvent.disableScrollPropagation(div);
        sel.addEventListener('change', () => {
          try { localStorage.setItem('chcp-mapa-base', sel.value); } catch (_) { /* sin almacenamiento */ }
          document.dispatchEvent(new CustomEvent('chcp-mapa-base', { detail: sel.value }));
        });
        return div;
      } });
      new Control().addTo(map);
    }
    document.addEventListener('chcp-mapa-base', (e) => poner(e.detail));
    return { poner, get clave() { return clave; } };
  }

  // ------------------------------------------------------------ paneles redimensionables
  /**
   * Agrega un tirador para cambiar el tamaño de un panel arrastrando su borde (o con las
   * flechas del teclado; doble clic vuelve al tamaño original). El tamaño se recuerda.
   *   panel     elemento al que se le añade el tirador (queda en su borde)
   *   borde     'derecho' | 'izquierdo' (ancho) o 'inferior' (alto)
   *   aplicar   (px | null) => void: aplica el tamaño (null = el original)
   *   alCambiar () => void: p. ej., map.invalidateSize()
   */
  function divisor({ panel, borde = 'derecho', clave, min = 220, max = 900, aplicar, alCambiar = () => {}, ancla = null }) {
    if (!panel || !aplicar) return;
    const vertical = borde === 'inferior';
    const h = document.createElement('div');
    h.className = `chcp-divisor chcp-divisor-${borde}`;
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', vertical ? 'horizontal' : 'vertical');
    h.setAttribute('aria-label', vertical ? 'Cambiar el alto del mapa' : 'Cambiar el ancho del panel');
    h.title = 'Arrastre para cambiar el tamaño · doble clic: tamaño original';
    h.tabIndex = 0;
    // Con «ancla» (p. ej., el contenedor de la página) el tirador no se desplaza al hacer
    // scroll dentro de un panel con barra propia: se ubica sobre el borde del panel.
    const padre = ancla || panel;
    if (getComputedStyle(padre).position === 'static') padre.style.position = 'relative';
    padre.appendChild(h);
    const ubicar = () => {
      if (!ancla) return;
      const a = ancla.getBoundingClientRect(), r = panel.getBoundingClientRect();
      h.hidden = r.width < 2 || r.height < 2;  // panel cerrado u oculto
      h.style.top = `${r.top - a.top}px`; h.style.bottom = 'auto'; h.style.height = `${r.height}px`;
      h.style.left = `${(borde === 'izquierdo' ? r.left : r.right) - a.left - 6}px`; h.style.right = 'auto';
    };
    if (ancla) { ubicar(); new ResizeObserver(ubicar).observe(panel); window.addEventListener('resize', ubicar); }
    const llave = clave ? `chcp-tam-${clave}` : null;
    let pendienteRaf = 0;
    const avisar = () => { if (pendienteRaf) return; pendienteRaf = requestAnimationFrame(() => { pendienteRaf = 0; ubicar(); alCambiar(); }); };
    const medir = () => { const r = panel.getBoundingClientRect(); return vertical ? r.height : r.width; };
    const poner = (px, guardar) => {
      const v = Math.round(Math.max(min, Math.min(max, px)));
      aplicar(v); h.setAttribute('aria-valuenow', String(v)); avisar();
      if (guardar && llave) { try { localStorage.setItem(llave, String(v)); } catch (_) { /* sin almacenamiento */ } }
    };
    try { const g = llave && Number(localStorage.getItem(llave)); if (g) poner(g, false); } catch (_) { /* sin almacenamiento */ }
    h.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const inicio = vertical ? ev.clientY : ev.clientX, base = medir();
      h.setPointerCapture(ev.pointerId);
      document.body.classList.add(vertical ? 'chcp-arrastrando-y' : 'chcp-arrastrando-x');
      const mover = (e) => { const d = (vertical ? e.clientY : e.clientX) - inicio; poner(borde === 'izquierdo' ? base - d : base + d, false); };
      const soltar = () => {
        h.removeEventListener('pointermove', mover); h.removeEventListener('pointerup', soltar); h.removeEventListener('pointercancel', soltar);
        document.body.classList.remove('chcp-arrastrando-x', 'chcp-arrastrando-y');
        poner(medir(), true);
      };
      h.addEventListener('pointermove', mover); h.addEventListener('pointerup', soltar); h.addEventListener('pointercancel', soltar);
    });
    h.addEventListener('keydown', (ev) => {
      const paso = ev.shiftKey ? 80 : 20;
      const mas = vertical ? 'ArrowDown' : (borde === 'izquierdo' ? 'ArrowLeft' : 'ArrowRight');
      const menos = vertical ? 'ArrowUp' : (borde === 'izquierdo' ? 'ArrowRight' : 'ArrowLeft');
      if (ev.key === mas) { ev.preventDefault(); poner(medir() + paso, true); }
      if (ev.key === menos) { ev.preventDefault(); poner(medir() - paso, true); }
    });
    h.addEventListener('dblclick', () => { aplicar(null); avisar(); if (llave) { try { localStorage.removeItem(llave); } catch (_) { /* sin almacenamiento */ } } });
  }

  window.CHCP = {$, $$, escapeHtml, number, hectares, api, mapFile, valFile, hidroFile, serieFile, consultarActualizacion, pendiente, procedencia, toast, readPortalState, writePortalState, normalizeSearch, mapaBase, BASES_MAPA, divisor};
})();

