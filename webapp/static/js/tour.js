/* Recorrido guiado: resalta un elemento por paso y lo explica en una ventana pequeña.
   Uso: CHCP_TOUR.iniciar([{ sel: '#id', titulo: '…', texto: '…' }, …], { clave: 'inicio' })
   Un paso sin `sel` (o con un elemento que no existe o está oculto) se muestra centrado.
   El recorrido no bloquea la página: se puede usar la herramienta mientras se lee. Un paso con
   `accion: { sel, evento }` avanza solo cuando el usuario hace eso (p. ej. elige una subcuenca).
   Teclado: → siguiente, ← anterior, Esc cerrar (las flechas no se capturan dentro de un control). */
(function () {
  let estado = null;

  const visible = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const guardar = (clave) => { try { localStorage.setItem(`chcp-tour-${clave}`, '1'); } catch (_) { /* sin almacenamiento */ } };
  const visto = (clave) => { try { return localStorage.getItem(`chcp-tour-${clave}`) === '1'; } catch (_) { return false; } };

  function quitarAccion() {
    if (estado?.accion) { estado.accion.el.removeEventListener(estado.accion.evento, estado.accion.fn, true); estado.accion = null; }
  }
  function cerrar() {
    if (!estado) return;
    quitarAccion();
    clearInterval(estado.intervalo);
    estado.capa.remove();
    window.removeEventListener('resize', estado.reubicar);
    window.removeEventListener('scroll', estado.reubicar, true);
    document.removeEventListener('keydown', estado.teclas);
    if (estado.opciones.clave) guardar(estado.opciones.clave);
    const fin = estado.opciones.alTerminar;
    estado = null;
    document.dispatchEvent(new Event('chcp-tour-fin'));
    if (fin) fin();
  }

  function ubicar() {
    const { pasos, i, foco, caja } = estado;
    const paso = pasos[i];
    const el = paso.sel ? document.querySelector(paso.sel) : null;
    if (visible(el)) {
      const r = el.getBoundingClientRect(), m = 8;
      Object.assign(foco.style, { display: 'block', top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
      const ancho = Math.min(360, window.innerWidth - 24);
      const abajo = r.bottom + 14 + 220 < window.innerHeight;
      const arriba = r.top - 14 - 220 > 0;
      let top = abajo ? r.bottom + 14 : arriba ? r.top - 14 - caja.offsetHeight : Math.max(12, window.innerHeight - caja.offsetHeight - 12);
      let left = Math.min(Math.max(12, r.left), window.innerWidth - ancho - 12);
      if (!abajo && !arriba && r.right + ancho + 24 < window.innerWidth) { left = r.right + 14; top = Math.max(12, Math.min(r.top, window.innerHeight - caja.offsetHeight - 12)); }
      Object.assign(caja.style, { top: `${top}px`, left: `${left}px`, width: `${ancho}px`, transform: 'none' });
    } else {
      foco.style.display = 'none';
      Object.assign(caja.style, { top: '50%', left: '50%', width: `${Math.min(420, window.innerWidth - 24)}px`, transform: 'translate(-50%, -50%)' });
    }
  }

  function mostrar(i) {
    quitarAccion();
    estado.i = i;
    const { pasos, caja } = estado;
    const paso = pasos[i];
    // Aprender haciendo: si el usuario hace la acción del paso, el recorrido avanza solo.
    const elAccion = paso.accion ? document.querySelector(paso.accion.sel) : null;
    if (elAccion) {
      const fn = () => { quitarAccion(); setTimeout(() => { if (!estado || estado.i !== i) return; if (i === pasos.length - 1) cerrar(); else mostrar(i + 1); }, 700); };
      elAccion.addEventListener(paso.accion.evento, fn, true);
      estado.accion = { el: elAccion, evento: paso.accion.evento, fn };
    }
    const el = paso.sel ? document.querySelector(paso.sel) : null;
    if (visible(el)) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
    }
    caja.innerHTML = `
      <div class="tour-cab"><span>Paso ${i + 1} de ${pasos.length}</span><button type="button" class="tour-x" aria-label="Cerrar el recorrido">×</button></div>
      <h3>${paso.titulo}</h3><div class="tour-txt">${paso.texto}</div>${paso.prueba ? `<p class="tour-prueba"><b>Pruébelo:</b> ${paso.prueba}</p>` : ''}
      <div class="tour-pie">
        <div class="tour-puntos">${pasos.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div>${i > 0 ? '<button type="button" class="btn btn-s tour-ant">Anterior</button>' : '<button type="button" class="btn btn-s tour-saltar">Saltar</button>'}
        <button type="button" class="btn btn-p tour-sig">${i === pasos.length - 1 ? (estado.opciones.textoFin || 'Empezar') : 'Siguiente'}</button></div>
      </div>`;
    caja.querySelector('.tour-x').onclick = cerrar;
    caja.querySelector('.tour-saltar')?.addEventListener('click', cerrar);
    caja.querySelector('.tour-ant')?.addEventListener('click', () => mostrar(i - 1));
    caja.querySelector('.tour-sig').onclick = () => (i === pasos.length - 1 ? cerrar() : mostrar(i + 1));
    requestAnimationFrame(ubicar);
    if (!paso.accion) caja.querySelector('.tour-sig').focus({ preventScroll: true });
  }

  function iniciar(pasos, opciones = {}) {
    if (estado) cerrar();
    const capa = document.createElement('div');
    capa.className = 'tour-capa';
    capa.innerHTML = '<div class="tour-foco"></div><div class="tour-caja" role="dialog" aria-modal="false" aria-live="polite"></div>';
    document.body.appendChild(capa);
    estado = { pasos, opciones, i: 0, capa, foco: capa.querySelector('.tour-foco'), caja: capa.querySelector('.tour-caja') };
    estado.reubicar = () => estado && ubicar();
    estado.teclas = (e) => {
      const enControl = e.target.closest?.('input, select, textarea, [contenteditable]') && !estado.caja.contains(e.target);
      if (e.key === 'Escape') cerrar();
      else if (enControl) return;
      else if (e.key === 'ArrowRight') { if (estado.i < pasos.length - 1) mostrar(estado.i + 1); }
      else if (e.key === 'ArrowLeft') { if (estado.i > 0) mostrar(estado.i - 1); }
    };
    window.addEventListener('resize', estado.reubicar);
    window.addEventListener('scroll', estado.reubicar, true);
    document.addEventListener('keydown', estado.teclas);
    // La página cambia mientras el usuario la usa: se reubica el resaltado con frecuencia.
    estado.intervalo = setInterval(() => estado && ubicar(), 500);
    mostrar(0);
  }

  /**
   * Ventanita fija en la esquina que invita al recorrido. Mientras el usuario no lo haya hecho,
   * da un pequeño salto cada pocos segundos para llamar la atención (sin movimiento si el sistema
   * pide reducirlo). La × la reduce a un botón redondo durante la visita.
   */
  function invitar(clave, texto, alAceptar) {
    document.querySelector('.tour-invitacion')?.remove();
    const inv = document.createElement('div');
    inv.className = 'tour-invitacion';
    document.body.appendChild(inv);
    const claveMin = `chcp-tour-min-${clave}`;
    const minimizada = () => { try { return sessionStorage.getItem(claveMin) === '1'; } catch (_) { return false; } };
    const abrir = () => { inv.hidden = true; alAceptar(); };
    const ventana = () => {
      inv.className = `tour-invitacion tour-ventana${visto(clave) ? '' : ' llama'}`;
      inv.innerHTML = `<button type="button" class="tour-v-abrir"><span class="tour-v-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span><span class="tour-v-txt"><b>Recorrido guiado</b><small>${texto}</small></span></button><button type="button" class="tour-v-min" aria-label="Reducir">&times;</button>`;
      inv.querySelector('.tour-v-abrir').addEventListener('click', abrir);
      inv.querySelector('.tour-v-min').addEventListener('click', () => { try { sessionStorage.setItem(claveMin, '1'); } catch (_) { /* sin almacenamiento */ } boton(); });
    };
    const boton = () => {
      inv.className = 'tour-invitacion tour-redondo';
      inv.innerHTML = '<button type="button" class="tour-r-btn" aria-label="Abrir el recorrido guiado" title="Recorrido guiado">?</button>';
      inv.querySelector('button').addEventListener('click', abrir);
    };
    if (minimizada()) boton(); else ventana();
    // Al terminar el recorrido la ventanita vuelve, ya quieta.
    document.addEventListener('chcp-tour-fin', () => { inv.hidden = false; inv.classList.remove('llama'); });
  }

  window.CHCP_TOUR = { iniciar, cerrar, visto, marcar: guardar, invitar };
})();
