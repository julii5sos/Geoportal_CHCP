/* Portada: globo que gira, viaja a Panamá, se acerca a la Cuenca del Canal y muestra
   la pérdida de cobertura arbórea año por año (Hansen GFC 2001–2025).
   Proyección ortográfica propia (sin librerías). Tierra: puntos precalculados de
   Natural Earth 1:50m (dominio público). Respeta «reducir movimiento». */
(function () {
  const C = window.CHCP;
  const cv = document.getElementById('in-globo');
  if (!C || !cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const cap = document.getElementById('in-globo-cap');
  const btn = document.getElementById('in-globo-rep');
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rad = Math.PI / 180;
  const CENTRO = [-79.68, 9.08];          // centro de la cuenca
  const CAJA = [-80.15, 8.62, -79.21, 9.53]; // lon/lat de la cuenca
  const ANIOS = Array.from({ length: 25 }, (_, i) => 2001 + i);
  const MS_ANIO = 260;

  let W = 0, H = 0, dpr = 1, R0 = 0, Rmax = 0;
  let tierra = [], cuenca = null, subcuencas = [], perdida = null, haAnio = {}, total = 0;
  let vista = { lam: 20, phi: 8, R: 0 };
  let fase = 'carga', t0 = 0, anio = 2000, capa = null, capaHasta = 2000, raf = 0, pausa = false;

  function medir() {
    const caja = cv.parentElement.getBoundingClientRect();
    W = Math.round(caja.width); H = W; dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R0 = W * 0.42;
    Rmax = (W * 0.86) / ((CAJA[2] - CAJA[0]) * rad);
    if (!vista.R) vista.R = R0;
    capa = null; capaHasta = 2000;
  }
  function proy(lon, lat, v = vista) {
    const L = (lon - v.lam) * rad, P = lat * rad, P0 = v.phi * rad;
    const cosc = Math.sin(P0) * Math.sin(P) + Math.cos(P0) * Math.cos(P) * Math.cos(L);
    return [W / 2 + v.R * Math.cos(P) * Math.sin(L), H / 2 - v.R * (Math.cos(P0) * Math.sin(P) - Math.sin(P0) * Math.cos(P) * Math.cos(L)), cosc];
  }
  const suave = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const mezcla = (a, b, x) => a + (b - a) * x;
  const enCuenca = (lon, lat) => lon >= CAJA[0] && lon <= CAJA[2] && lat >= CAJA[1] && lat <= CAJA[3];

  function colorAnio(a) { // amarillo (antiguo) → rojo anaranjado (reciente)
    const x = (a - 2001) / 24;
    return `rgb(255,${Math.round(mezcla(226, 70, x))},${Math.round(mezcla(110, 50, x))})`;
  }

  function anillo(coords, v) {
    ctx.beginPath();
    coords.forEach((ring) => ring.forEach(([lo, la], i) => { const [x, y] = proy(lo, la, v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }));
  }

  function dibujar() {
    ctx.clearRect(0, 0, W, H);
    const v = vista, acerc = Math.min(1, Math.max(0, Math.log(v.R / R0) / Math.log(Rmax / R0)));
    // océano
    // el océano se desvanece al acercarse, para que la cuenca quede sobre el fondo de la página
    const aMar = 1 - Math.min(1, Math.max(0, (acerc - 0.35) / 0.3));
    if (aMar > 0) {
      ctx.beginPath(); ctx.arc(W / 2, H / 2, v.R, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(13,59,128,${aMar})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.18 * aMar})`; ctx.lineWidth = 1; ctx.stroke();
    }
    // tierra en puntos: se apaga al acercarse
    const aTierra = 1 - Math.min(1, Math.max(0, (acerc - 0.55) / 0.3));
    if (aTierra > 0) {
      const s = 1.7;
      for (let i = 0; i < tierra.length; i += 2) {
        const lon = tierra[i] / 10, lat = tierra[i + 1] / 10;
        const [x, y, c] = proy(lon, lat);
        if (c <= 0 || x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
        const propio = enCuenca(lon, lat);
        ctx.fillStyle = propio ? `rgba(143,209,79,${aTierra})` : `rgba(170,200,238,${(0.25 + 0.6 * c) * aTierra})`;
        ctx.fillRect(x - s / 2, y - s / 2, propio ? s * 1.4 : s, propio ? s * 1.4 : s);
      }
    }
    // cuenca y subcuencas: aparecen durante el acercamiento
    const aCuenca = Math.min(1, Math.max(0, (acerc - 0.45) / 0.35));
    if (cuenca && aCuenca > 0) {
      ctx.lineJoin = 'round';
      subcuencas.forEach((g) => { anillo(g, v); ctx.strokeStyle = `rgba(255,255,255,${0.07 * aCuenca})`; ctx.lineWidth = 0.7; ctx.stroke(); });
      anillo(cuenca, v); ctx.fillStyle = `rgba(4,24,60,${0.35 * aCuenca})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * aCuenca})`; ctx.lineWidth = 1.8; ctx.stroke();
    }
    if (capa && fase !== 'giro' && fase !== 'viaje' && fase !== 'zoom') ctx.drawImage(capa, 0, 0, W, H);
    // destello de la pérdida del año en curso: llama la atención y se apaga hasta el tamaño real
    if (fase === 'perdida' && perdida) {
      const dt = performance.now() - t0;
      [anio, anio - 1].forEach((y) => {
        const edad = dt - (y - 2001) * MS_ANIO, a = 1 - edad / (MS_ANIO * 2.2);
        if (a <= 0 || !perdida.pantalla[y]) return;
        ctx.fillStyle = colorAnio(y); ctx.globalAlpha = a * 0.75;
        perdida.pantalla[y].forEach(([px, py]) => ctx.fillRect(px - 1, py - 1, 2, 2));
        ctx.globalAlpha = 1;
      });
    }
  }

  // Píxeles de pérdida (valor = año − 2000) en pantalla, una sola vez al terminar el acercamiento.
  function prepararCapa() {
    if (!perdida) return;
    capa = document.createElement('canvas'); capa.width = W * dpr; capa.height = H * dpr;
    capa._ctx = capa.getContext('2d'); capa._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    capaHasta = 2000;
  }
  function pintarHasta(a) {
    if (!capa || !perdida) return;
    // Tamaño proporcional a la superficie real: la tinta dibujada equivale a las hectáreas de la serie.
    const c2 = capa._ctx, s = perdida.pxDeg * (Rmax * rad) * perdida.escala;
    for (let y = capaHasta + 1; y <= a; y++) {
      c2.fillStyle = colorAnio(y);
      const xy = (perdida.porAnio[y - 2000] || []).map(([lon, lat]) => proy(lon, lat));
      xy.forEach(([px, py]) => c2.fillRect(px - s / 2, py - s / 2, s, s));
      perdida.pantalla[y] = xy;
    }
    capaHasta = a;
  }

  function texto() {
    if (!cap) return;
    if (fase === 'perdida' || fase === 'fin') {
      const acum = ANIOS.filter((x) => x <= anio).reduce((s, x) => s + (haAnio[x] || 0), 0);
      cap.innerHTML = `<b>${anio}</b><span>${C.number(acum, 0)} ha de cobertura arbórea perdidas desde 2001</span><small>Hansen Global Forest Change (Universidad de Maryland). El destello marca dónde se perdió cada año; lo que queda pintado está a escala.</small>`;
    } else {
      cap.innerHTML = '<b>Cuenca del Canal</b><span>342 000 ha de bosques, ríos y lagos que dan agua al Canal de Panamá</span><small>Acercándose…</small>';
    }
  }

  function cuadro(ahora) {
    raf = 0;
    if (pausa) return;
    const dt = ahora - t0;
    if (fase === 'giro') {
      vista.lam = 20 - dt * 0.018; vista.phi = 8;
      if (dt > 2600 && cuenca) { fase = 'viaje'; t0 = ahora; vista._lam0 = vista.lam; }
    } else if (fase === 'viaje') {
      const x = suave(Math.min(1, dt / 1700));
      let d = CENTRO[0] - vista._lam0; d = ((d + 540) % 360) - 180;
      vista.lam = vista._lam0 + d * x; vista.phi = mezcla(8, CENTRO[1], x);
      if (x >= 1) { fase = 'zoom'; t0 = ahora; }
    } else if (fase === 'zoom') {
      const x = suave(Math.min(1, dt / 2600));
      vista.lam = CENTRO[0]; vista.phi = CENTRO[1];
      vista.R = R0 * Math.pow(Rmax / R0, x);
      if (x >= 1) { fase = 'perdida'; t0 = ahora; anio = 2000; prepararCapa(); }
    } else if (fase === 'perdida') {
      const a = Math.min(2025, 2001 + Math.floor(dt / MS_ANIO));
      if (a !== anio) { anio = a; pintarHasta(a); texto(); }
      if (a >= 2025 && dt > 25 * MS_ANIO + 600) { fase = 'fin'; if (btn) btn.hidden = false; }
    }
    if (fase !== 'perdida' && fase !== 'fin') texto();
    dibujar();
    if (fase !== 'fin') raf = requestAnimationFrame(cuadro);
  }

  function final() {
    fase = 'fin'; vista = { lam: CENTRO[0], phi: CENTRO[1], R: Rmax }; anio = 2025;
    prepararCapa(); pintarHasta(2025); texto(); dibujar();
  }
  function empezar() {
    if (btn) btn.hidden = true;
    vista = { lam: 20, phi: 8, R: R0 }; capa = null; capaHasta = 2000;
    if (reducir) { final(); return; }
    fase = 'giro'; t0 = performance.now();
    if (!raf) raf = requestAnimationFrame(cuadro);
  }

  async function cargarPerdida() {
    try {
      const indice = await fetch(C.serieFile('indice.json')).then((r) => r.json());
      const meta = indice.territorios.chcp.mapas.hansen;
      const est = await fetch(C.serieFile('estadisticas/chcp.json')).then((r) => r.json());
      haAnio = Object.fromEntries(Object.entries(est.hansen.perdida_por_anio).map(([k, v]) => [Number(k), v]));
      total = Object.values(haAnio).reduce((s, v) => s + v, 0);
      const img = new Image();
      img.src = C.serieFile('mapas/chcp/hansen.v.png');
      await img.decode();
      const [w, h] = meta.dimensiones, [[s, o], [n, e]] = meta.limites;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dat = g.getImageData(0, 0, w, h).data;
      const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2));
      const y0 = merc(n), y1 = merc(s), porAnio = {};
      for (let r = 0; r < h; r++) {
        const lat = Math.atan(Math.sinh(y0 - ((r + 0.5) / h) * (y0 - y1))) / rad;
        for (let col = 0; col < w; col++) {
          const val = dat[(r * w + col) * 4];
          if (val > 0 && val <= 25) (porAnio[val] = porAnio[val] || []).push([o + ((col + 0.5) / w) * (e - o), lat]);
        }
      }
      const nPx = Object.values(porAnio).reduce((a, v) => a + v.length, 0), haPx = (meta.tamano_pixel_m ** 2) / 1e4;
      perdida = { porAnio, pantalla: {}, pxDeg: (e - o) / w, escala: Math.min(1, Math.sqrt(total / Math.max(nPx * haPx, 1))) };
    } catch (_) { perdida = null; }
  }

  async function iniciar() {
    medir();
    let observado = false;
    const arrancar = () => { if (!observado) { observado = true; empezar(); } };
    try {
      tierra = await fetch(cv.dataset.tierra).then((r) => r.json());
    } catch (_) { tierra = []; }
    if (reducir) { await Promise.all([cargarTerritorio(), cargarPerdida()]); arrancar(); return; }
    arrancar();
    cargarTerritorio();
    cargarPerdida();
  }
  async function cargarTerritorio() {
    try {
      const t = await C.api('/api/v1/territory');
      const g = t.basin.geometry || t.basin;
      cuenca = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
      subcuencas = t.subbasins.features.map((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0])));
    } catch (_) { cuenca = null; }
  }

  btn?.addEventListener('click', empezar);
  document.addEventListener('visibilitychange', () => {
    pausa = document.hidden;
    if (!pausa && fase !== 'fin' && fase !== 'carga' && !raf) { t0 = performance.now() - 0; raf = requestAnimationFrame(cuadro); }
  });
  let rto;
  window.addEventListener('resize', () => { clearTimeout(rto); rto = setTimeout(() => { const f = fase; medir(); if (f === 'fin') final(); else if (f === 'perdida') { vista.R = Rmax; prepararCapa(); pintarHasta(anio); dibujar(); } }, 150); });
  iniciar();
}());
