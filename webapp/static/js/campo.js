/* Verificación de campo: sitios priorizados (precálculo) + registros en GitHub Issues
   (etiqueta «verificacion-campo»). El estado de cada sitio es el de su registro más reciente. */
(async function () {
  const { $, $$, escapeHtml: esc, number, hectares, api } = window.CHCP;
  const repoUrl = $('#v-campo').dataset.repo.replace(/\/$/, '');
  const repo = repoUrl.replace(/^https:\/\/github\.com\//, '');
  const COLOR = { Pendiente: '#9e9e9e', Visitado: '#1e88e5', Confirmado: '#c62828', Descartado: '#43a047' };
  const st = { data: null, territory: null, sitios: [], registros: [], map: null, capa: null };

  function campoIssue(body, etiqueta) {
    const m = (body || '').match(new RegExp(`### ${etiqueta}\\s*\\n+([\\s\\S]*?)(?=\\n### |$)`));
    const v = m ? m[1].trim() : '';
    return v === '_No response_' ? '' : v;
  }
  function parsear(issue) {
    const b = issue.body || '';
    const coord = campoIssue(b, 'Coordenadas observadas').match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    return {
      numero: issue.number, url: issue.html_url, autor: issue.user?.login, creado: issue.created_at,
      sitio: campoIssue(b, 'Sitio'), subcuenca: campoIssue(b, 'Subcuenca'), fecha: campoIssue(b, 'Fecha de la visita') || issue.created_at.slice(0, 10),
      estado: campoIssue(b, 'Estado') || 'Visitado', causa: campoIssue(b, 'Causa o situación observada'), confianza: campoIssue(b, 'Confianza'),
      observaciones: campoIssue(b, 'Observaciones'), fotos: (b.match(/!\[[^\]]*\]\(|<img /g) || []).length,
      lat: coord ? Number(coord[1]) : null, lon: coord ? Number(coord[2]) : null, abierto: issue.state === 'open',
    };
  }
  async function leerRegistros() {
    const todos = [];
    for (let pagina = 1; pagina <= 5; pagina += 1) {
      const r = await fetch(`https://api.github.com/repos/${repo}/issues?labels=verificacion-campo&state=all&per_page=100&page=${pagina}`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(r.status === 403 ? 'límite de consultas de GitHub alcanzado; intente en unos minutos' : `GitHub respondió ${r.status}`);
      const lote = await r.json();
      todos.push(...lote.filter((i) => !i.pull_request).map(parsear));
      if (lote.length < 100) break;
    }
    return todos;
  }
  function enlaceFormulario(s) {
    const q = new URLSearchParams({ template: 'verificacion_campo.yml', title: s ? `[Campo] ${s.id} · ${s.subcuenca}` : '[Campo] Sitio nuevo', labels: 'verificacion-campo' });
    if (s) { q.set('sitio', s.id); q.set('subcuenca', s.subcuenca); q.set('coordenadas', `${s.lat}, ${s.lon}`); }
    q.set('fecha', new Date().toISOString().slice(0, 10));
    return `${repoUrl}/issues/new?${q}`;
  }
  function historial(s) { return st.registros.filter((r) => r.sitio === s.id).sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado)); }
  function estado(s) { const h = historial(s); return h.length ? h[0].estado : 'Pendiente'; }

  function render() {
    const sub = $('#cp-select').value, filtro = $('#cp-filtro').value;
    const nuevos = st.registros.filter((r) => !r.sitio && r.lat != null).map((r) => ({ id: `#${r.numero}`, lat: r.lat, lon: r.lon, subcuenca: r.subcuenca || '—', territorio: '', area_ha: null, fuentes: null, nuevo: r }));
    const lista = st.sitios.concat(nuevos).filter((s) => (!sub || s.territorio === sub) && (!filtro || (s.nuevo ? s.nuevo.estado : estado(s)) === filtro));
    const conteo = { Pendiente: 0, Visitado: 0, Confirmado: 0, Descartado: 0 };
    st.sitios.filter((s) => !sub || s.territorio === sub).forEach((s) => { conteo[estado(s)] = (conteo[estado(s)] || 0) + 1; });
    nuevos.forEach((s) => { conteo[s.nuevo.estado] = (conteo[s.nuevo.estado] || 0) + 1; });
    Object.entries(conteo).forEach(([k, v]) => { const el = $(`#cp-n-${k}`); if (el) el.textContent = v; });
    if (st.capa) st.map.removeLayer(st.capa);
    st.capa = L.layerGroup(lista.map((s) => {
      const e = s.nuevo ? s.nuevo.estado : estado(s);
      const m = L.circleMarker([s.lat, s.lon], { radius: s.fuentes ? 5 + s.fuentes * 2 : 6, color: '#fff', weight: 1.5, fillColor: COLOR[e], fillOpacity: 0.95 });
      m.bindTooltip(`${esc(s.id)} · ${e}${s.area_ha ? ` · ${hectares(s.area_ha)}` : ''}`);
      m.on('click', () => { const el = document.getElementById(`cp-${CSS.escape(s.id)}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); } });
      return m;
    })).addTo(st.map);
    if (lista.length) st.map.fitBounds(L.latLngBounds(lista.map((s) => [s.lat, s.lon])).pad(0.15), { maxZoom: 15 });
    $('#cp-list').innerHTML = lista.length ? lista.map((s) => {
      const h = s.nuevo ? [s.nuevo] : historial(s), e = h.length ? h[0].estado : 'Pendiente';
      return `<article class="cp-item" id="cp-${esc(s.id)}"><header><span class="cp-badge" style="background:${COLOR[e]}">${e}</span><b>${esc(s.id)}</b><small>${esc(s.subcuenca)}</small></header>
        ${s.fuentes ? `<p>${hectares(s.area_ha)} con señal de pérdida en <b>${s.fuentes} fuente${s.fuentes > 1 ? 's' : ''}</b>${s.fuentes >= 2 ? ' (alta confianza satelital)' : ''}.</p>` : '<p>Sitio registrado en campo.</p>'}
        ${h.length ? `<ul class="cp-hist">${h.map((r) => `<li><a href="${r.url}" target="_blank" rel="noopener">${esc(r.fecha)} · ${esc(r.estado)}</a>${r.causa ? ` · ${esc(r.causa)}` : ''}${r.fotos ? ` · ${r.fotos} foto(s)` : ''} <small>por ${esc(r.autor || '—')}</small></li>`).join('')}</ul>` : ''}
        <div class="cp-acc">${s.nuevo ? '' : `<a class="btn btn-p" href="${enlaceFormulario(s)}" target="_blank" rel="noopener">Registrar visita</a>`}<a class="btn btn-s" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank" rel="noopener">Cómo llegar</a>${s.territorio ? `<a class="btn btn-s" href="${window.CHCP_STATIC ? 'ficha.html' : '/ficha'}?id=${encodeURIComponent(s.territorio)}">Ficha</a>` : ''}</div></article>`;
    }).join('') : `<p class="fi-pending">${st.sitios.length ? 'No hay sitios con ese filtro.' : 'Los sitios priorizados se generan en la próxima actualización de datos con Earth Engine.'}</p>`;
  }
  function exportar() {
    const cols = ['numero', 'sitio', 'subcuenca', 'fecha', 'estado', 'causa', 'confianza', 'lat', 'lon', 'autor', 'fotos', 'observaciones', 'url'];
    const q = (v) => (/[",;\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const texto = [cols.join(','), ...st.registros.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv' })); a.download = 'verificaciones_campo.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  try {
    [st.data, st.territory] = await Promise.all([api('/api/v1/panel/statistics'), api('/api/v1/territory')]);
  } catch (error) { $('#cp-aviso').textContent = `No se pudieron cargar los datos: ${error.message}`; return; }
  st.map = L.map('cp-map');
  window.CHCP.mapaBase(st.map, { defecto: 'satelite' });
  const sub = L.geoJSON(st.territory.subbasins, { style: { color: '#ffffff', weight: 1, fill: false, opacity: 0.7 }, interactive: false }).addTo(st.map);
  st.map.fitBounds(sub.getBounds());
  const terr = Object.values(st.data.territorios).filter((t) => t && t.id !== 'chcp').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('#cp-select').innerHTML += terr.map((t) => `<option value="${t.id}">${esc(t.nombre)}${t.sitios?.length ? ` (${t.sitios.length})` : ''}</option>`).join('');
  st.sitios = terr.flatMap((t) => (t.sitios || []).map((s) => ({ ...s, territorio: t.id, subcuenca: t.nombre })));
  $('#cp-nuevo').href = enlaceFormulario(null);
  try { st.registros = await leerRegistros(); $('#cp-aviso').textContent = `${st.registros.length} registro(s) de campo leídos de GitHub · ${st.sitios.length} sitios priorizados.`; } catch (error) { $('#cp-aviso').textContent = `No se pudieron leer los registros de campo (${error.message}). Se muestran los sitios como pendientes.`; }
  const q = new URLSearchParams(location.search).get('id');
  if (q && st.data.territorios[q]) $('#cp-select').value = q;
  $('#cp-select').addEventListener('change', render);
  $('#cp-filtro').addEventListener('change', render);
  $('#cp-csv').addEventListener('click', exportar);
  render();
})();
