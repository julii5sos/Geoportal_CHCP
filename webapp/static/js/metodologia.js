/* Metodología: exactitud de cada fuente de pérdida por separado (si ya se calculó). */
(function () {
  const C = window.CHCP;
  const cont = document.getElementById('met-fuentes');
  if (!C || !cont) return;
  const pct = (v) => (v == null ? '—' : `${C.number(v * 100, 0)} %`);
  const ic = (v) => (v == null ? '' : ` ± ${C.number(v * 100, 0)}`);
  fetch(C.valFile('senal_perdida/resultados_fuentes.json')).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d || !d.fuentes) return;
    const orden = ['jrc', 'hansen', 'esri', 'ndvi', 'al_menos_1', 'al_menos_2'];
    const filas = orden.filter((k) => d.fuentes[k]).map((k) => {
      const f = d.fuentes[k];
      return `<tr${k.startsWith('al_menos') ? ' class="met-comb"' : ''}><td><b>${C.escapeHtml(f.nombre)}</b></td><td>${pct(f.exactitud_usuario)}${ic(f.exactitud_usuario_ic)}</td><td>${pct(f.exactitud_productor)}${ic(f.exactitud_productor_ic)}</td><td>${f.alertas_en_muestra}</td></tr>`;
    }).join('');
    const indiv = ['jrc', 'hansen', 'esri', 'ndvi'].filter((k) => d.fuentes[k]?.exactitud_productor != null);
    const mejor = indiv.sort((a, b) => d.fuentes[b].exactitud_productor - d.fuentes[a].exactitud_productor)[0];
    const uno = d.fuentes.al_menos_1, dos = d.fuentes.al_menos_2;
    const lectura = mejor && uno && dos
      ? `La fuente que detecta más pérdida por sí sola es <b>${C.escapeHtml(d.fuentes[mejor].nombre)}</b> (${pct(d.fuentes[mejor].exactitud_productor)}). Aceptar la señal de cualquiera de JRC, Hansen y ESRI detecta el ${pct(uno.exactitud_productor)} de la pérdida observada, frente al ${pct(dos.exactitud_productor)} cuando se exige que coincidan dos; a cambio, se confirma una proporción distinta de las alertas (${pct(uno.exactitud_usuario)} frente a ${pct(dos.exactitud_usuario)}). La preevaluación combina las fuentes con pesos en lugar de depender de una sola o de exigir coincidencia.`
      : '';
    cont.innerHTML = `<h3 class="met-sub">¿Qué tan bien detecta la pérdida cada fuente por separado?</h3>
      <p class="met-nota">Con la misma muestra interpretada (${d.n} puntos) se evaluó cada fuente como un mapa de pérdida 2021–2025, con las mismas reglas que usa la preevaluación. Estimadores de Stehman (2014) para muestreo estratificado; intervalos de confianza del 95 %.</p>
      <div class="catalog-table-wrap"><table class="catalog-table"><thead><tr><th>Fuente</th><th>De sus alertas, se confirman</th><th>De la pérdida observada, detecta</th><th>Puntos de la muestra con alerta</th></tr></thead><tbody>${filas}</tbody></table></div>
      ${lectura ? `<p class="met-nota">${lectura}</p>` : ''}`;
    cont.hidden = false;
  }).catch(() => {});
}());
