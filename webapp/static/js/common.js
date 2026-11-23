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
    const version = territorio && territorio.version_datos != null ? ` · datos v${territorio.version_datos}` : '';
    const parcial = datos && datos.estado_actualizacion && !datos.estado_actualizacion.completa ? '<span class="pr-warn">actualización parcial</span>' : '';
    return `<div class="procedencia" data-tipo="${tipo}"><b>Tipo ${tipo}</b><span>${escapeHtml(TIPOS_PROCESAMIENTO[tipo])}</span><span>Cálculo: ${escapeHtml(fecha || 'sin fecha')}${escapeHtml(version)}</span><span>${escapeHtml(p.metodologia || (datos && datos.metodologia) || '')} · código ${escapeHtml(String(p.version_codigo || 'no registrado').slice(0, 12))}</span>${extra}${parcial}</div>`;
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

  window.CHCP = {$, $$, escapeHtml, number, hectares, api, mapFile, valFile, hidroFile, serieFile, consultarActualizacion, pendiente, procedencia, toast, readPortalState, writePortalState, normalizeSearch};
})();

