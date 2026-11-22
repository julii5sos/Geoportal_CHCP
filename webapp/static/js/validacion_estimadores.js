/* Estimadores de Olofsson et al. (2014) para el navegador: idénticos a chcp/nucleo/validacion.py
   (comprobado en tests/test_validacion.py). Filas = clase del mapa; columnas = referencia. */
(function (raiz) {
  'use strict';
  const Z95 = 1.959964;

  function evaluar(clases, areasMapa, conteos, z = Z95) {
    const q = clases.length;
    const A = clases.map((c) => Number(areasMapa[c]));
    const Atot = A.reduce((s, a) => s + a, 0);
    const W = A.map((a) => a / Atot);
    const ni = conteos.map((f) => f.reduce((s, v) => s + v, 0));
    const p = conteos.map((f, i) => f.map((v) => (ni[i] ? W[i] * v / ni[i] : 0)));
    const pCol = clases.map((_, j) => p.reduce((s, f) => s + f[j], 0));
    const varProp = (i, j) => { if (ni[i] <= 1) return 0; const f = conteos[i][j] / ni[i]; return f * (1 - f) / (ni[i] - 1); };
    let global = 0, varGlobal = 0;
    for (let i = 0; i < q; i += 1) { global += p[i][i]; varGlobal += W[i] ** 2 * varProp(i, i); }
    const porClase = clases.map((c, j) => {
      const ua = ni[j] ? conteos[j][j] / ni[j] : null;
      const varUa = ni[j] ? varProp(j, j) : null;
      let Ncol = 0;
      for (let i = 0; i < q; i += 1) if (ni[i]) Ncol += A[i] / ni[i] * conteos[i][j];
      let pa = null, varPa = null;
      if (Ncol > 0 && ua !== null) {
        pa = pCol[j] ? p[j][j] / pCol[j] : null;
        let t2 = 0;
        for (let i = 0; i < q; i += 1) if (i !== j && ni[i]) t2 += A[i] ** 2 * varProp(i, j);
        varPa = (A[j] ** 2 * (1 - pa) ** 2 * varProp(j, j) + pa ** 2 * t2) / Ncol ** 2;
      }
      let se = 0;
      for (let i = 0; i < q; i += 1) if (ni[i]) se += W[i] ** 2 * varProp(i, j);
      return {
        clase: c, area_mapa: A[j], peso: W[j], n: ni[j],
        exactitud_usuario: ua, exactitud_usuario_ic: varUa === null ? null : z * Math.sqrt(varUa),
        exactitud_productor: pa, exactitud_productor_ic: varPa === null ? null : z * Math.sqrt(varPa),
        area_ajustada: Atot * pCol[j], area_ajustada_ic: z * Math.sqrt(se) * Atot,
      };
    });
    return { clases, n_total: ni.reduce((s, v) => s + v, 0), area_total: Atot, exactitud_global: global, exactitud_global_ic: z * Math.sqrt(varGlobal), matriz_conteos: conteos, matriz_proporciones: p, proporcion_referencia: pCol, por_clase: porClase };
  }

  function matrizConteos(muestras, clases) {
    const idx = new Map(clases.map((c, i) => [String(c), i]));
    const m = clases.map(() => clases.map(() => 0));
    for (const [mapa, ref] of muestras) {
      const i = idx.get(String(mapa)), j = idx.get(String(ref));
      if (i !== undefined && j !== undefined) m[i][j] += 1;
    }
    return m;
  }

  /** CSV sencillo (separador coma o punto y coma, con comillas). */
  function leerCsv(texto) {
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lineas.length) return [];
    const sep = (lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ',';
    const partir = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); };
    const cab = partir(lineas[0]).map((h) => h.toLowerCase());
    return lineas.slice(1).map((l) => Object.fromEntries(partir(l).map((v, i) => [cab[i], v])));
  }

  const api = { evaluar, matrizConteos, leerCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.CHCP_VALIDACION = api;
})(typeof window !== 'undefined' ? window : globalThis);
