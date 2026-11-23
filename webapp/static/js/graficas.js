/* Gráficas SVG/HTML ligeras para la Plataforma SIG (sin bibliotecas externas).
   Especificaciones: barras ≤ 24 px con extremo redondeado de 4 px, separación de 2 px entre
   segmentos, rejilla de 1 px, texto en tinta neutra (nunca del color de la serie), leyenda
   siempre que haya ≥ 2 series, tooltip por marca y tabla equivalente en cada tarjeta. */
(function (raiz) {
  'use strict';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 0) => new Intl.NumberFormat('es-PA', { maximumFractionDigits: d, minimumFractionDigits: d }).format(Number(v || 0));
  const ha = (v) => `${nf(v, v !== 0 && Math.abs(v) < 10 ? 1 : 0)} ha`;
  const compacto = (v) => (Math.abs(v) >= 1e6 ? `${nf(v / 1e6, 1)} M` : Math.abs(v) >= 1e4 ? `${nf(v / 1e3, 0)} mil` : nf(v, 0));

  /** Marcas «bonitas» para el eje: 0 … máximo redondeado. */
  function marcas(max, n = 4) {
    if (!(max > 0)) return [0, 1];
    const paso0 = max / n, e = 10 ** Math.floor(Math.log10(paso0)), f = paso0 / e;
    const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
    const out = []; for (let v = 0; v <= max + paso * 0.001; v += paso) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + paso);
    return out;
  }
  // Rectángulo con las esquinas superiores redondeadas (extremo de dato) y base recta.
  function columna(x, y, w, h, r = 4) {
    if (h <= 0) return '';
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }
  const tip = (html) => `data-tip="${esc(html)}"`;

  /** Barras horizontales ordenadas (parte de un todo): una por clase, mayor primero. */
  function barrasClases(filas, { total } = {}) {
    const suma = total ?? filas.reduce((s, f) => s + (f.valor || 0), 0);
    const max = Math.max(...filas.map((f) => f.valor || 0), 1e-9);
    const orden = [...filas].sort((a, b) => (b.valor || 0) - (a.valor || 0));
    return `<div class="g-barras">${orden.map((f) => {
      const pct = suma ? (f.valor || 0) / suma * 100 : 0;
      return `<div class="g-fila" ${tip(`<b>${ha(f.valor)}</b> · ${nf(pct, 1)} %<br>${esc(f.etiqueta)}`)} tabindex="0">
        <span class="g-nombre"><i style="background:${f.color}"></i>${esc(f.etiqueta)}</span>
        <span class="g-pista"><b style="width:${Math.max((f.valor || 0) / max * 100, f.valor ? 0.8 : 0)}%;background:${f.color}"></b></span>
        <span class="g-valor">${nf(pct, 1)} %<small>${ha(f.valor)}</small></span></div>`;
    }).join('')}</div>`;
  }

  /** Barra segmentada delgada (un todo dividido), sin texto: la lista al lado da las cifras. */
  function segmentada(filas) {
    const suma = filas.reduce((s, f) => s + (f.valor || 0), 0) || 1;
    return `<div class="g-seg">${filas.filter((f) => f.valor > 0).map((f) => `<i style="width:${f.valor / suma * 100}%;background:${f.color}" ${tip(`<b>${nf(f.valor / suma * 100, 1)} %</b> · ${ha(f.valor)}<br>${esc(f.etiqueta)}`)}></i>`).join('')}</div>`;
  }

  /** Columnas apiladas por año (serie temporal por clase). `marcado` resalta un año. */
  function serieApilada({ anios, series, marcado, alto = 190, unidad = 'ha', alClic }) {
    const W = 560, H = alto, m = { l: 44, r: 8, t: 10, b: 24 };
    const totales = anios.map((_, i) => series.reduce((s, c) => s + (c.valores[i] || 0), 0));
    const ticks = marcas(Math.max(...totales, 0));
    const ymax = ticks[ticks.length - 1] || 1;
    const banda = (W - m.l - m.r) / anios.length, bw = Math.min(24, banda * 0.72);
    const y = (v) => m.t + (H - m.t - m.b) * (1 - v / ymax);
    let s = `<svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Serie por año">`;
    ticks.forEach((v) => { s += `<line class="g-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="g-eje" x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${compacto(v)}</text>`; });
    const cada = Math.ceil(anios.length / 9);
    anios.forEach((a, i) => {
      const x = m.l + banda * i + (banda - bw) / 2;
      let base = H - m.b;
      const atenuado = marcado != null && a !== marcado;
      const visibles = series.filter((c) => (c.valores[i] || 0) > 0);
      let g = `<g class="g-col${atenuado ? ' g-atenuada' : ''}" data-anio="${a}" ${tip(`<b>${a}</b><br>${series.map((c) => `<span class="g-tk" style="background:${c.color}"></span>${esc(c.etiqueta)}: <b>${ha(c.valores[i] || 0)}</b>`).join('<br>')}`)} tabindex="0">`;
      g += `<rect class="g-hit" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${H - m.t - m.b}"/>`;
      visibles.forEach((c, k) => {
        const v = c.valores[i] || 0, h = (H - m.t - m.b) * v / ymax;
        const ultimo = k === visibles.length - 1;
        const hh = Math.max(h - (ultimo ? 0 : 2), 0); // 2 px de separación entre segmentos
        base -= h;
        g += ultimo ? `<path d="${columna(x, base, bw, hh)}" fill="${c.color}"/>` : `<rect x="${x}" y="${base + 2}" width="${bw}" height="${hh}" fill="${c.color}"/>`;
      });
      g += '</g>';
      s += g;
      if (i % cada === 0 || i === anios.length - 1 || a === marcado) s += `<text class="g-eje${a === marcado ? ' g-eje-fuerte' : ''}" x="${m.l + banda * i + banda / 2}" y="${H - 7}" text-anchor="middle">${a}</text>`;
    });
    s += `<line class="g-base" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></svg>`;
    return `<div class="g-wrap" ${alClic ? 'data-clic="1"' : ''}>${s}</div>`;
  }

  /** Columnas de una serie; `enfasis(a)` decide qué años van en el color de acento. */
  function columnas({ anios, valores, color = '#0a4393', gris = '#c5cdd8', enfasis = () => true, alto = 170, nota = '' }) {
    const W = 560, H = alto, m = { l: 44, r: 8, t: 10, b: 24 };
    const ticks = marcas(Math.max(...valores, 0));
    const ymax = ticks[ticks.length - 1] || 1;
    const banda = (W - m.l - m.r) / anios.length, bw = Math.min(24, banda * 0.72);
    const y = (v) => m.t + (H - m.t - m.b) * (1 - v / ymax);
    let s = `<svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(nota || 'Columnas por año')}">`;
    ticks.forEach((v) => { s += `<line class="g-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="g-eje" x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${compacto(v)}</text>`; });
    const cada = Math.ceil(anios.length / 9);
    anios.forEach((a, i) => {
      const x = m.l + banda * i + (banda - bw) / 2, v = valores[i] || 0, h = (H - m.t - m.b) * v / ymax;
      s += `<g class="g-col" ${tip(`<b>${ha(v)}</b><br>${a}`)} tabindex="0"><rect class="g-hit" x="${m.l + banda * i}" y="${m.t}" width="${banda}" height="${H - m.t - m.b}"/><path d="${columna(x, H - m.b - h, bw, h)}" fill="${enfasis(a) ? color : gris}"/></g>`;
      if (i % cada === 0 || i === anios.length - 1) s += `<text class="g-eje" x="${m.l + banda * i + banda / 2}" y="${H - 7}" text-anchor="middle">${a}</text>`;
    });
    s += `<line class="g-base" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/></svg>`;
    return `<div class="g-wrap">${s}</div>`;
  }

  /** Línea de una serie continua (p. ej. NDVI medio), con punto final rotulado. */
  function linea({ anios, valores, color = '#01665e', min, max, decimales = 2, alto = 150 }) {
    const W = 560, H = alto, m = { l: 44, r: 40, t: 12, b: 24 };
    const v = valores.map((x) => (x == null ? null : Number(x)));
    const val = v.filter((x) => x != null);
    if (!val.length) return '<p class="g-vacio">Sin datos.</p>';
    const lo = min ?? Math.floor(Math.min(...val) * 10) / 10, hi = max ?? (Math.ceil(Math.max(...val) * 10) / 10 || lo + 0.1);
    const x = (i) => m.l + (W - m.l - m.r) * (anios.length > 1 ? i / (anios.length - 1) : 0.5);
    const y = (z) => m.t + (H - m.t - m.b) * (1 - (z - lo) / ((hi - lo) || 1));
    let s = `<svg class="g-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Línea por año">`;
    [lo, (lo + hi) / 2, hi].forEach((t) => { s += `<line class="g-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="g-eje" x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${nf(t, 2)}</text>`; });
    const pts = v.map((z, i) => (z == null ? null : [x(i), y(z)]));
    let d = ''; pts.forEach((p, i) => { if (p) d += `${d && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]}`; });
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const cada = Math.ceil(anios.length / 9);
    pts.forEach((p, i) => {
      if (p) s += `<g ${tip(`<b>${nf(v[i], decimales)}</b><br>${anios[i]}`)} tabindex="0"><circle cx="${p[0]}" cy="${p[1]}" r="12" fill="transparent"/><circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/></g>`;
      if (i % cada === 0 || i === anios.length - 1) s += `<text class="g-eje" x="${x(i)}" y="${H - 7}" text-anchor="middle">${anios[i]}</text>`;
    });
    const u = pts.map((p, i) => [p, i]).filter(([p]) => p).pop();
    if (u) s += `<text class="g-etq" x="${u[0][0] + 8}" y="${u[0][1] + 4}">${nf(v[u[1]], decimales)}</text>`;
    s += '</svg>';
    return `<div class="g-wrap">${s}</div>`;
  }

  /** Mancuernas: cada clase en el año A (punto hueco) y en el año B (punto lleno). */
  function mancuernas({ filas, anioA, anioB }) {
    const max = Math.max(...filas.flatMap((f) => [f.a || 0, f.b || 0]), 1e-9);
    const orden = [...filas].sort((p, q) => Math.max(q.a || 0, q.b || 0) - Math.max(p.a || 0, p.b || 0));
    return `<div class="g-manc"><div class="g-manc-ley"><span><i class="g-pa"></i>${anioA}</span><span><i class="g-pb"></i>${anioB}</span></div>${orden.map((f) => {
      const pa = (f.a || 0) / max * 100, pb = (f.b || 0) / max * 100, d = (f.b || 0) - (f.a || 0);
      const signo = d > 0 ? '+' : d < 0 ? '−' : '';
      return `<div class="g-fila" tabindex="0" ${tip(`<b>${signo}${ha(Math.abs(d))}</b><br>${esc(f.etiqueta)}<br>${anioA}: ${ha(f.a)} · ${anioB}: ${ha(f.b)}`)}>
        <span class="g-nombre"><i style="background:${f.color}"></i>${esc(f.etiqueta)}</span>
        <span class="g-pista g-pista-manc"><em style="left:${Math.min(pa, pb)}%;width:${Math.abs(pb - pa)}%"></em><b class="g-pa" style="left:${pa}%"></b><b class="g-pb" style="left:${pb}%;background:${f.color}"></b></span>
        <span class="g-valor g-delta">${signo}${ha(Math.abs(d))}</span></div>`;
    }).join('')}</div>`;
  }

  /** Tabla equivalente a una gráfica (la información nunca depende solo del color o del cursor). */
  function tablaDatos(cabecera, filas) {
    return `<details class="g-tabla"><summary>Ver tabla</summary><div class="g-tabla-c"><table class="fi-table"><thead><tr>${cabecera.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  /** Tooltip único por contenedor: lo activan el cursor y el foco del teclado. */
  function activarTooltips(contenedor) {
    let t = document.getElementById('g-tip');
    if (!t) { t = document.createElement('div'); t.id = 'g-tip'; t.setAttribute('role', 'tooltip'); t.hidden = true; document.body.appendChild(t); }
    const mostrar = (el, x, y) => { t.innerHTML = el.getAttribute('data-tip'); t.hidden = false; const r = t.getBoundingClientRect(); t.style.left = `${Math.min(x + 14, innerWidth - r.width - 8)}px`; t.style.top = `${Math.max(8, y - r.height - 10)}px`; };
    contenedor.addEventListener('pointermove', (e) => { const el = e.target.closest('[data-tip]'); if (!el || !contenedor.contains(el)) { t.hidden = true; return; } mostrar(el, e.clientX, e.clientY); });
    contenedor.addEventListener('pointerleave', () => { t.hidden = true; });
    contenedor.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (!el) return; const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top); });
    contenedor.addEventListener('focusout', () => { t.hidden = true; });
  }

  const api = { marcas, barrasClases, segmentada, serieApilada, columnas, linea, mancuernas, tablaDatos, activarTooltips, ha, nf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_GRAF = api;
})(typeof window !== 'undefined' ? window : globalThis);
