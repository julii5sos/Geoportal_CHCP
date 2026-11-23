/* Recorrido guiado: resalta un elemento por paso y lo explica en una ventana pequeña.
   Uso: CHCP_TOUR.iniciar([{ sel: '#id', titulo: '…', texto: '…' }, …], { clave: 'inicio' })
   Un paso sin `sel` (o con un elemento que no existe o está oculto) se muestra centrado.
   Teclado: → / Enter siguiente, ← anterior, Esc cerrar. */
(function () {
  let estado = null;

  const visible = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  const guardar = (clave) => { try { localStorage.setItem(`chcp-tour-${clave}`, '1'); } catch (_) { /* sin almacenamiento */ } };
  const visto = (clave) => { try { return localStorage.getItem(`chcp-tour-${clave}`) === '1'; } catch (_) { return false; } };

  function cerrar() {
    if (!estado) return;
    estado.capa.remove();
    window.removeEventListener('resize', estado.reubicar);
    window.removeEventListener('scroll', estado.reubicar, true);
    document.removeEventListener('keydown', estado.teclas);
    if (estado.opciones.clave) guardar(estado.opciones.clave);
    const fin = estado.opciones.alTerminar;
    estado = null;
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
    estado.i = i;
    const { pasos, caja } = estado;
    const paso = pasos[i];
    const el = paso.sel ? document.querySelector(paso.sel) : null;
    if (visible(el)) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center', behavior: 'instant' in window ? 'instant' : 'auto' });
    }
    caja.innerHTML = `
      <div class="tour-cab"><span>Paso ${i + 1} de ${pasos.length}</span><button type="button" class="tour-x" aria-label="Cerrar el recorrido">×</button></div>
      <h3>${paso.titulo}</h3><div class="tour-txt">${paso.texto}</div>
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
    caja.querySelector('.tour-sig').focus({ preventScroll: true });
  }

  function iniciar(pasos, opciones = {}) {
    if (estado) cerrar();
    const capa = document.createElement('div');
    capa.className = 'tour-capa';
    capa.innerHTML = '<div class="tour-foco"></div><div class="tour-caja" role="dialog" aria-modal="true" aria-live="polite"></div>';
    document.body.appendChild(capa);
    estado = { pasos, opciones, i: 0, capa, foco: capa.querySelector('.tour-foco'), caja: capa.querySelector('.tour-caja') };
    estado.reubicar = () => estado && ubicar();
    estado.teclas = (e) => {
      if (e.key === 'Escape') cerrar();
      else if (e.key === 'ArrowRight') { if (estado.i < pasos.length - 1) mostrar(estado.i + 1); }
      else if (e.key === 'ArrowLeft') { if (estado.i > 0) mostrar(estado.i - 1); }
    };
    window.addEventListener('resize', estado.reubicar);
    window.addEventListener('scroll', estado.reubicar, true);
    document.addEventListener('keydown', estado.teclas);
    mostrar(0);
  }

  /** Invitación discreta en la primera visita (no inicia el recorrido sin permiso). */
  function invitar(clave, texto, alAceptar) {
    if (visto(clave) || document.querySelector('.tour-invitacion')) return;
    const inv = document.createElement('div');
    inv.className = 'tour-invitacion';
    inv.innerHTML = `<b>¿Primera vez aquí?</b><span>${texto}</span><div><button type="button" class="btn btn-p">Ver el recorrido</button><button type="button" class="btn btn-s">Ahora no</button></div>`;
    document.body.appendChild(inv);
    const [si, no] = inv.querySelectorAll('button');
    si.addEventListener('click', () => { inv.remove(); alAceptar(); });
    no.addEventListener('click', () => { inv.remove(); guardar(clave); });
  }

  window.CHCP_TOUR = { iniciar, cerrar, visto, marcar: guardar, invitar };
})();
