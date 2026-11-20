/* Cuentas — app del móvil. Depende de parser.js (interpretarFrase…) y mock.js (modo demo). */
(function () {
  'use strict';

  const CLAVES = { config: 'cuentas.config', resumen: 'cuentas.resumen', cola: 'cuentas.pendientes' };
  const $ = (sel) => document.querySelector(sel);
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } };

  let config = Object.assign({ api: '', k: '', voz: true, vozApunte: false }, leer(CLAVES.config, {}));
  const configurado = () => Boolean(config.api && config.k);

  /* ───────── Formato ───────── */
  // useGrouping 'always': en es-ES, sin esto 1253 € sale sin punto de millar
  const fmt2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const fmt0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
  const eur = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? fmt0 : fmt2).format(n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoy = () => fechaIsoLocal(new Date());
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pct = (a, b) => (b > 0 ? a / b : 0);
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function fechaCorta(iso) {
    if (iso === hoy()) return 'hoy';
    if (iso === sumarDias(hoy(), -1)) return 'ayer';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  const ICONOS = {
    check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    nube: '<svg viewBox="0 0 24 24"><path d="m2 2 20 20"/><path d="M5.8 8.6A6 6 0 0 0 7 20h10c.7 0 1.3-.1 1.9-.4M21.6 15.6A4.5 4.5 0 0 0 17 9.1h-.6A7 7 0 0 0 9.8 4.2"/></svg>',
    alerta: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    deshacer: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    etiqueta: '<svg viewBox="0 0 24 24"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><path d="M7.5 7.5h.01"/></svg>',
    micro: '<svg viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    lapiz: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
  };

  /* ───────── Avisos ───────── */
  let temporizadorToast;
  function toast(texto, ms = 2600) {
    const t = $('#toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => { t.hidden = true; }, ms);
  }
  const vibrar = (p) => { if (navigator.vibrate) navigator.vibrate(p); };

  /* ───────── Comunicación con la hoja ───────── */
  class ErrorRed extends Error {}

  async function llamar(action, datos = {}) {
    if (!configurado()) return window.Mock.llamar(action, datos);
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), 25000);
    let res;
    try {
      // text/plain evita la petición previa CORS que Apps Script no admite
      res = await fetch(config.api, { method: 'POST', body: JSON.stringify({ ...datos, action, k: config.k }), signal: ctrl.signal });
    } catch (e) {
      throw new ErrorRed(e.name === 'AbortError' ? 'La hoja tarda demasiado en responder' : 'Sin conexión con la hoja');
    } finally {
      clearTimeout(reloj);
    }
    if (!res.ok) throw new ErrorRed('La hoja respondió con un error ' + res.status);
    const texto = await res.text();
    try { return JSON.parse(texto); } catch (e) { throw new ErrorRed('Respuesta inesperada de la hoja'); }
  }

  /* ───────── Resumen en caché ───────── */
  function guardarResumen(r) {
    if (!r) return;
    guardar(CLAVES.resumen, r);
    pintarCabecera(r);
  }
  const resumenCache = () => leer(CLAVES.resumen, null);
  function categoriasCache() {
    const r = resumenCache();
    if (!r || !r.categorias) return CATEGORIAS_POR_DEFECTO;
    // El caché no trae palabras clave: combinamos con las de serie para el modo sin conexión.
    return r.categorias.map((c) => {
      const serie = CATEGORIAS_POR_DEFECTO.find((d) => d.nombre === c.nombre);
      return { nombre: c.nombre, presupuesto: c.presupuesto, palabras: serie ? serie.palabras : [] };
    });
  }

  function estadoCategoria(c, ritmo) {
    if (!c.presupuesto) return c.gastado > 0 ? 'sin' : 'vacio';
    const p = c.gastado / c.presupuesto;
    if (p > 1.005) return 'pasado';
    if (p >= 0.97) return 'agotado'; // p. ej. el alquiler, pagado entero el día 1
    if (p >= 0.5 && p > ritmo + 0.15) return 'ojo';
    return 'bien';
  }

  function pintarCabecera(r) {
    if (!r || !r.total) return;
    const [y, m] = r.mes.split('-').map(Number);
    $('#cabMes').textContent = capital(new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' }));
    $('#cabResumen').textContent = `${eur(r.total.gastado)} de ${eur(r.total.presupuesto)}`;
    const barra = $('#cabBarra');
    const p = pct(r.total.gastado, r.total.presupuesto);
    barra.style.width = Math.min(100, p * 100) + '%';
    barra.className = estadoCategoria({ presupuesto: r.total.presupuesto, gastado: r.total.gastado }, r.dia / r.diasMes);
  }

  /* ───────── Cola sin conexión ───────── */
  const leerCola = () => leer(CLAVES.cola, []);
  function quitarDeCola(id) { guardar(CLAVES.cola, leerCola().filter((x) => x.idCliente !== id)); pintarCola(); }
  function encolar(item) { const c = leerCola(); c.push(item); guardar(CLAVES.cola, c); pintarCola(); }
  function pintarCola() {
    const n = leerCola().length;
    const b = $('#badgeCola');
    b.hidden = n === 0;
    b.textContent = n === 1 ? '1 pendiente' : `${n} pendientes`;
  }

  let vaciando = false;
  async function vaciarCola() {
    if (vaciando || !configurado() || !leerCola().length) return;
    vaciando = true;
    let enviados = 0;
    try {
      for (const item of leerCola()) {
        const r = await llamar('add', item);
        if (r.codigo === 'clave') break;
        quitarDeCola(item.idCliente);
        if (r.ok) { enviados++; guardarResumen(r.resumen); } else toast(`No se pudo apuntar «${item.texto}»: ${r.error}`, 5000);
      }
    } catch (e) { /* seguimos sin conexión: se reintentará */ }
    vaciando = false;
    pintarCola();
    if (enviados) toast(enviados === 1 ? 'Se ha enviado 1 apunte pendiente' : `Se han enviado ${enviados} apuntes pendientes`);
  }

  /* ───────── Voz: hablar ───────── */
  let vozDesbloqueada = false;
  function desbloquearVoz() {
    // iOS solo deja hablar si el primer speak() ocurre dentro de un toque
    if (vozDesbloqueada || !('speechSynthesis' in window)) return;
    speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    vozDesbloqueada = true;
  }
  function vozEspanola() {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => v.lang === 'es-ES' && /google/i.test(v.name)) || vs.find((v) => v.lang === 'es-ES') ||
      vs.find((v) => (v.lang || '').toLowerCase().startsWith('es'));
  }
  function hablar(texto) {
    if (!('speechSynthesis' in window) || !texto) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-ES';
    const v = vozEspanola();
    if (v) u.voice = v;
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }
  const callar = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); };

  function eurosHablados(n) {
    n = Math.abs(n);
    if (n >= 10 || Math.abs(n - Math.round(n)) < 0.005) {
      const e = Math.round(n);
      return e === 1 ? '1 euro' : `${e.toLocaleString('es-ES')} euros`;
    }
    const e = Math.floor(n), c = Math.round((n - e) * 100);
    return e ? `${e} ${e === 1 ? 'euro' : 'euros'} con ${c}` : `${c} céntimos`;
  }
  const listaHablada = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1]);

  function textoHablado(r) {
    const ritmo = r.dia / r.diasMes;
    const quedan = r.total.presupuesto - r.total.gastado;
    const dias = r.diasMes - r.dia + 1;
    let t = `Llevas ${eurosHablados(r.total.gastado)} de ${eurosHablados(r.total.presupuesto)} este mes. `;
    t += quedan >= 0
      ? `Te quedan ${eurosHablados(quedan)} para ${dias === 1 ? 'hoy' : dias + ' días'}. `
      : `Te has pasado del total en ${eurosHablados(quedan)}. `;
    const pasadas = r.categorias.filter((c) => estadoCategoria(c, ritmo) === 'pasado');
    const ojo = r.categorias.filter((c) => estadoCategoria(c, ritmo) === 'ojo');
    if (pasadas.length) t += 'Te has pasado en ' + listaHablada(pasadas.map((c) => `${c.nombre}, por ${eurosHablados(c.gastado - c.presupuesto)}`)) + '. ';
    if (ojo.length) t += 'Ojo con ' + listaHablada(ojo.map((c) => `${c.nombre}, que llevas el ${Math.round(pct(c.gastado, c.presupuesto) * 100)} por ciento`)) + '. ';
    if (!pasadas.length && !ojo.length) t += 'En lo demás, vas bien.';
    return t.trim();
  }

  /* ───────── Voz: escuchar ───────── */
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let escuchando = false;

  function estado(clase) {
    document.body.classList.remove('escuchando', 'enviando');
    if (clase) document.body.classList.add(clase);
  }

  function alternarMicro() {
    desbloquearVoz();
    callar();
    if (escuchando && rec) { rec.stop(); return; }
    if (document.body.classList.contains('enviando')) return;
    if (!Reconocimiento) {
      mostrarFormulario('');
      toast('Este navegador no deja dictar aquí. Escríbelo o usa el micro del teclado.', 4500);
      return;
    }
    $('#formTexto').hidden = true;
    let finales = [];
    let alternativas = [];
    let error = '';
    rec = new Reconocimiento();
    rec.lang = 'es-ES';
    rec.interimResults = true;
    rec.maxAlternatives = 4;
    rec.continuous = false;
    rec.onstart = () => {
      escuchando = true;
      estado('escuchando');
      vibrar(15);
      $('#tarjeta').hidden = true;
      $('#ayuda').hidden = true;
      document.body.classList.remove('con-tarjeta');
      $('#transcripcion').textContent = 'Te escucho…';
    };
    rec.onresult = (e) => {
      let provisional = '';
      finales = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finales.push(r[0].transcript.trim());
        else provisional += r[0].transcript;
      }
      if (e.results.length === 1 && e.results[0].isFinal) alternativas = Array.from(e.results[0]).map((a) => a.transcript.trim());
      $('#transcripcion').textContent = (finales.join(' ') + ' ' + provisional).trim() || 'Te escucho…';
    };
    rec.onerror = (e) => { error = e.error; };
    rec.onend = () => {
      escuchando = false;
      estado('');
      const texto = elegirAlternativa(alternativas.length ? alternativas : [finales.join(' ')]);
      if (texto) { anotar(texto); return; }
      $('#transcripcion').textContent = '';
      const mensajes = {
        'not-allowed': 'Necesito permiso para usar el micrófono. Actívalo en los ajustes del navegador.',
        'service-not-allowed': 'El navegador no deja usar el reconocimiento de voz. Prueba a escribirlo.',
        'network': 'El dictado necesita conexión. Escríbelo y se guardará igualmente.',
        'audio-capture': 'No encuentro el micrófono.',
        'no-speech': 'No te he oído. Toca el micro y habla.'
      };
      if (error === 'aborted') { $('#ayuda').hidden = false; return; }
      mostrarError(mensajes[error] || 'No te he oído. Toca el micro y habla.', '');
    };
    try { rec.start(); } catch (e) { toast('No he podido activar el micro'); }
  }

  /** De las alternativas del reconocedor, la primera en la que se entiende un importe. */
  function elegirAlternativa(alts) {
    const limpias = alts.map((a) => (a || '').trim()).filter(Boolean);
    if (!limpias.length) return '';
    return limpias.find((a) => interpretarFrase(a, { categorias: categoriasCache(), hoy: hoy() }).ok) || limpias[0];
  }

  /* ───────── Apuntar ───────── */
  let actual = null; // { mov, pendiente }

  async function anotar(texto) {
    texto = String(texto || '').trim();
    if (!texto) return;
    $('#formTexto').hidden = true;
    $('#transcripcion').textContent = `«${texto}»`;
    const fecha = hoy();
    const previo = interpretarFrase(texto, { categorias: categoriasCache(), hoy: fecha });
    if (!previo.ok) { mostrarError(previo.error, texto); return; }

    const item = { texto, hoy: fecha, idCliente: nuevoId() };
    estado('enviando');
    try {
      const r = await llamar('add', item);
      estado('');
      if (!r.ok) {
        if (r.codigo === 'clave') { mostrarError(r.error, texto); return; }
        mostrarError(r.error, texto);
        return;
      }
      guardarResumen(r.resumen);
      mostrarApunte(r.movimiento, false);
      vibrar([20, 40, 20]);
      if (config.vozApunte) hablar(`Apuntado: ${eurosHablados(r.movimiento.importe)} en ${r.movimiento.categoria}`);
    } catch (e) {
      estado('');
      if (!(e instanceof ErrorRed)) throw e;
      encolar(item);
      mostrarApunte({ id: item.idCliente, fecha: previo.fecha, tipo: previo.tipo, importe: previo.importe, categoria: previo.categoria, concepto: previo.concepto }, true);
      vibrar(30);
    }
  }

  function mostrarApunte(mov, pendiente) {
    actual = { mov, pendiente };
    const ingreso = mov.tipo === 'Ingreso';
    const r = resumenCache();
    const cat = !pendiente && r && r.categorias ? r.categorias.find((c) => c.nombre === mov.categoria) : null;
    const fecha = mov.fecha !== hoy() ? `<span class="t-fecha">· ${esc(fechaCorta(mov.fecha))}</span>` : '';
    let estadoCat = '';
    if (cat && cat.presupuesto && !ingreso) {
      const ec = estadoCategoria(cat, r.dia / r.diasMes);
      estadoCat = `
        <div class="t-estado"><span>${esc(cat.nombre)} este mes</span><span><b>${eur(cat.gastado)}</b> de ${eur(cat.presupuesto)}</span></div>
        <div class="barra ${ec}"><i style="width:${Math.min(100, pct(cat.gastado, cat.presupuesto) * 100)}%"></i>
          <span class="ritmo" style="left:${(r.dia / r.diasMes) * 100}%"></span></div>`;
    }
    $('#transcripcion').textContent = '';
    pintarTarjeta(`
      <div class="t-cab ${pendiente ? 'pendiente' : ''}">
        ${pendiente ? ICONOS.nube + 'Sin conexión · se enviará solo' : ICONOS.check + (ingreso ? 'Ingreso apuntado' : 'Apuntado')} ${fecha}
      </div>
      <div class="t-importe ${ingreso ? 'ingreso' : ''}">${ingreso ? '+' : ''}${eur(mov.importe)}</div>
      <div class="t-concepto">${esc(mov.concepto)}</div>
      <div class="t-meta"><button class="chip" type="button" data-accion="cambiar" ${pendiente || ingreso ? 'disabled' : ''}>${ICONOS.etiqueta}${esc(mov.categoria)}</button></div>
      ${estadoCat}
      <div class="t-acciones">
        <button class="btn-sec" type="button" data-accion="deshacer">${ICONOS.deshacer}Deshacer</button>
        ${pendiente || ingreso ? '' : `<button class="btn-sec" type="button" data-accion="cambiar">${ICONOS.etiqueta}Categoría</button>`}
      </div>
      <div class="t-categorias" id="selectorCategorias" hidden></div>`);
  }

  function mostrarError(mensaje, texto) {
    actual = null;
    estado('');
    $('#transcripcion').textContent = '';
    pintarTarjeta(`
      <div class="t-cab error">${ICONOS.alerta}No lo he apuntado</div>
      <p class="t-error">${esc(mensaje)}</p>
      ${texto ? `<p class="t-dicho">«${esc(texto)}»</p>` : ''}
      <div class="t-acciones">
        <button class="btn-sec" type="button" data-accion="dictar">${ICONOS.micro}Repetir</button>
        ${texto ? `<button class="btn-sec" type="button" data-accion="corregir" data-texto="${esc(texto)}">${ICONOS.lapiz}Corregir</button>` : ''}
      </div>`);
    vibrar([60, 60, 60]);
  }

  function pintarTarjeta(html) {
    const t = $('#tarjeta');
    t.innerHTML = html;
    t.hidden = false;
    $('#ayuda').hidden = true;
    document.body.classList.add('con-tarjeta');
  }

  function cerrarTarjeta() {
    actual = null;
    $('#tarjeta').hidden = true;
    $('#ayuda').hidden = false;
    document.body.classList.remove('con-tarjeta');
  }

  function mostrarFormulario(texto) {
    const f = $('#formTexto');
    f.hidden = false;
    const i = $('#entradaTexto');
    i.value = texto || '';
    i.focus();
  }

  async function deshacer() {
    if (!actual) return;
    const { mov, pendiente } = actual;
    if (pendiente) { quitarDeCola(mov.id); cerrarTarjeta(); toast('Apunte borrado'); return; }
    try {
      const r = await llamar('undo', { id: mov.id, hoy: hoy() });
      if (!r.ok) { toast(r.error, 4000); return; }
      guardarResumen(r.resumen);
      cerrarTarjeta();
      toast('Apunte borrado');
    } catch (e) { toast('Sin conexión: no he podido borrarlo. Bórralo luego en la hoja.', 4500); }
  }

  function mostrarSelector() {
    if (!actual || actual.pendiente) return;
    const sel = $('#selectorCategorias');
    if (!sel.hidden) { sel.hidden = true; return; }
    const nombres = categoriasCache().map((c) => c.nombre);
    sel.innerHTML = nombres.map((n) =>
      `<button class="chip ${n === actual.mov.categoria ? 'activa' : ''}" type="button" data-categoria="${esc(n)}">${esc(n)}</button>`).join('');
    sel.hidden = false;
  }

  async function cambiarCategoria(nombre) {
    if (!actual || nombre === actual.mov.categoria) { $('#selectorCategorias').hidden = true; return; }
    const mov = actual.mov;
    try {
      const r = await llamar('recategorize', { id: mov.id, categoria: nombre, hoy: hoy() });
      if (!r.ok) { toast(r.error, 4000); return; }
      guardarResumen(r.resumen);
      mostrarApunte(Object.assign({}, mov, { categoria: nombre }), false);
      toast(`Movido a ${nombre}. La próxima vez lo recordaré.`);
    } catch (e) { toast('Sin conexión: no he podido cambiarlo.'); }
  }

  /* ───────── Panel de presupuestos ───────── */
  let panelAbierto = null;

  function abrirPanel(id) {
    if (panelAbierto) cerrarPanel(true);
    $('#' + id).hidden = false;
    panelAbierto = id;
    history.pushState({ panel: id }, '');
  }
  function cerrarPanel(sinHistorial) {
    if (!panelAbierto) return;
    $('#' + panelAbierto).hidden = true;
    if (panelAbierto === 'panelPresupuestos') callar();
    panelAbierto = null;
    if (!sinHistorial && history.state && history.state.panel) history.back();
  }
  window.addEventListener('popstate', () => { if (panelAbierto) cerrarPanel(true); });

  let ultimoResumenHablado = null;
  async function abrirPresupuestos() {
    desbloquearVoz();
    abrirPanel('panelPresupuestos');
    const cache = resumenCache();
    const cuerpo = $('#cuerpoPres');
    if (cache && cache.mes === hoy().slice(0, 7)) pintarPresupuestos(cache, 'Actualizando…');
    else cuerpo.innerHTML = '<div class="cargando">Mirando tus cuentas…</div>';
    try {
      const r = await llamar('summary', { hoy: hoy() });
      if (!r.ok) throw new Error(r.error);
      guardarResumen(r.resumen);
      if (panelAbierto !== 'panelPresupuestos') return;
      pintarPresupuestos(r.resumen, '');
      ultimoResumenHablado = r.resumen;
      if (config.voz) hablar(textoHablado(r.resumen));
    } catch (e) {
      if (panelAbierto !== 'panelPresupuestos') return;
      if (cache) {
        pintarPresupuestos(cache, 'Sin conexión: datos de la última vez' + (leerCola().length ? ' (sin los apuntes pendientes)' : ''));
        ultimoResumenHablado = cache;
        if (config.voz) hablar(textoHablado(cache));
      } else {
        cuerpo.innerHTML = `<div class="cargando">${esc(e.message || 'No he podido leer la hoja')}</div>`;
      }
    }
  }

  function pintarPresupuestos(r, aviso) {
    const ritmo = r.dia / r.diasMes;
    const quedan = r.total.presupuesto - r.total.gastado;
    const dias = r.diasMes - r.dia + 1;
    const estTotal = estadoCategoria({ presupuesto: r.total.presupuesto, gastado: r.total.gastado }, ritmo);
    $('#tituloPres').textContent = r.mesNombre ? capital(r.mesNombre) : 'Este mes';

    const orden = { pasado: 0, ojo: 1, sin: 2, bien: 3, agotado: 4, vacio: 5 };
    const cats = r.categorias.slice().sort((a, b) => {
      const ea = estadoCategoria(a, ritmo), eb = estadoCategoria(b, ritmo);
      return orden[ea] - orden[eb] || pct(b.gastado, b.presupuesto) - pct(a.gastado, a.presupuesto);
    });

    const filas = cats.map((c) => {
      const e = estadoCategoria(c, ritmo);
      let nota;
      if (e === 'pasado') nota = `Te has pasado ${eur(c.gastado - c.presupuesto)}`;
      else if (e === 'sin') nota = 'Sin presupuesto';
      else if (e === 'vacio') nota = 'Sin presupuesto ni gastos';
      else if (e === 'agotado') nota = 'Presupuesto agotado';
      else nota = `Quedan ${eur(c.presupuesto - c.gastado)}` + (e === 'ojo' ? ' · vas rápido' : '');
      return `
        <div class="cat ${e}">
          <div class="cat-fila"><span class="cat-nombre">${esc(c.nombre)}</span>
            <span class="cat-cifras"><b>${eur(c.gastado)}</b> / ${eur(c.presupuesto)}</span></div>
          <div class="barra"><i style="width:${Math.min(100, pct(c.gastado, c.presupuesto) * 100)}%"></i>
            <span class="ritmo" style="left:${ritmo * 100}%"></span></div>
          <div class="cat-nota">${nota}</div>
        </div>`;
    }).join('');

    const movs = (r.ultimos || []).map((m) => {
      const ingreso = m.tipo === 'Ingreso';
      return `
        <div class="mov">
          <div class="mov-txt"><div class="mov-concepto">${esc(m.concepto)}</div>
            <div class="mov-sub">${esc(m.categoria)} · ${esc(fechaCorta(m.fecha))}</div></div>
          <div class="mov-imp ${ingreso ? 'ingreso' : ''}">${ingreso ? '+' : '−'}${eur(m.importe)}</div>
        </div>`;
    }).join('');

    $('#cuerpoPres').innerHTML = `
      ${aviso ? `<p class="aviso-cache">${esc(aviso)}</p>` : ''}
      <div class="total ${estTotal}">
        <div class="total-cifra"><b>${eur(r.total.gastado)}</b><span>de ${eur(r.total.presupuesto)}</span></div>
        <div class="barra gruesa ${estTotal}"><i style="width:${Math.min(100, pct(r.total.gastado, r.total.presupuesto) * 100)}%"></i>
          <span class="ritmo" style="left:${ritmo * 100}%"></span></div>
        <div class="total-linea">Día ${r.dia} de ${r.diasMes} ·
          ${quedan >= 0
            ? `te quedan <b>${eur(quedan)}</b>` + (dias > 1 ? ` (${eur(quedan / dias)}/día)` : '')
            : `<span class="mal">te has pasado <b>${eur(-quedan)}</b></span>`}
        </div>
        ${r.ingresos ? `<div class="total-linea">Ingresos: <span class="ingresos">+${eur(r.ingresos)}</span></div>` : ''}
      </div>
      <p class="leyenda"><i></i> La rayita marca dónde deberías ir según el día del mes.</p>
      <div class="seccion">Por categoría</div>
      ${filas}
      ${movs ? `<div class="seccion">Últimos apuntes</div>${movs}` : ''}`;
  }

  /* ───────── Ajustes y conexión ───────── */
  function guardarConfig(cambios) {
    config = Object.assign(config, cambios);
    guardar(CLAVES.config, config);
    pintarConexion();
  }

  function pintarConexion() {
    const e = $('#estadoConexion');
    e.className = 'estado-conexion ' + (configurado() ? 'ok' : 'demo');
    e.textContent = configurado() ? 'Conectado a tu hoja de Google' : 'Modo demo (sin conectar)';
    $('#bannerDemo').hidden = configurado();
    $('#btnDesconectar').hidden = !configurado();
    $('#optVoz').checked = !!config.voz;
    $('#optVozApunte').checked = !!config.vozApunte;
  }

  /** Acepta el enlace completo (…#api=…&k=…) que genera la hoja. */
  function datosDeEnlace(texto) {
    const t = String(texto || '').trim();
    const i = t.indexOf('#');
    if (i < 0) return null;
    const p = new URLSearchParams(t.slice(i + 1));
    const api = p.get('api'), k = p.get('k');
    if (!api || !k || !/^https:\/\/script\.google(usercontent)?\.com\//.test(api)) return null;
    return { api, k };
  }

  async function conectar(datos) {
    guardarConfig(datos);
    localStorage.removeItem(CLAVES.resumen);
    toast('Conectando con tu hoja…');
    await probarConexion();
  }

  async function probarConexion() {
    try {
      const r = await llamar('summary', { hoy: hoy() });
      if (!r.ok) { toast(r.error, 5000); return false; }
      guardarResumen(r.resumen);
      toast(configurado() ? 'Conectado con tu hoja ✓' : 'Modo demo funcionando');
      vaciarCola();
      return true;
    } catch (e) {
      toast(e.message + '. Revisa la conexión.', 4500);
      return false;
    }
  }

  function leerEnlaceDeLaUrl() {
    const datos = datosDeEnlace(location.href);
    if (!datos) return;
    history.replaceState(null, '', location.pathname + location.search);
    conectar(datos);
  }

  /* ───────── Eventos ───────── */
  $('#btnMicro').addEventListener('click', alternarMicro);
  document.querySelectorAll('[data-abrir-presupuestos]').forEach((b) => b.addEventListener('click', abrirPresupuestos));
  document.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirPanel(b.dataset.abrir)));
  document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarPanel(false)));
  $('#btnRepetirVoz').addEventListener('click', () => { desbloquearVoz(); if (ultimoResumenHablado) hablar(textoHablado(ultimoResumenHablado)); });

  $('#btnEscribir').addEventListener('click', () => {
    const f = $('#formTexto');
    if (f.hidden) mostrarFormulario(''); else f.hidden = true;
  });
  $('#formTexto').addEventListener('submit', (e) => {
    e.preventDefault();
    const i = $('#entradaTexto');
    const v = i.value;
    i.blur();
    anotar(v);
  });

  $('#tarjeta').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-categoria]');
    if (cat) { cambiarCategoria(cat.dataset.categoria); return; }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'deshacer') deshacer();
    else if (accion === 'cambiar') mostrarSelector();
    else if (accion === 'dictar') alternarMicro();
    else if (accion === 'corregir') mostrarFormulario(b.dataset.texto);
  });

  $('#btnConectar').addEventListener('click', () => {
    const datos = datosDeEnlace($('#enlaceConexion').value);
    if (!datos) { toast('Ese enlace no es válido. Cópialo entero desde la hoja.', 4000); return; }
    $('#enlaceConexion').value = '';
    conectar(datos).then(() => cerrarPanel(false));
  });
  $('#btnProbar').addEventListener('click', probarConexion);
  $('#btnDesconectar').addEventListener('click', () => {
    if (!confirm('¿Desconectar este móvil de tu hoja? Podrás volver a conectarlo con el QR.')) return;
    guardarConfig({ api: '', k: '' });
    localStorage.removeItem(CLAVES.resumen);
    toast('Desconectado. Vuelves al modo demo.');
    refrescarCabecera();
  });
  $('#optVoz').addEventListener('change', (e) => guardarConfig({ voz: e.target.checked }));
  $('#optVozApunte').addEventListener('change', (e) => guardarConfig({ vozApunte: e.target.checked }));

  window.addEventListener('online', vaciarCola);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { vaciarCola(); refrescarCabecera(); } });

  async function refrescarCabecera() {
    try { const r = await llamar('summary', { hoy: hoy() }); if (r.ok) guardarResumen(r.resumen); } catch (e) { /* sin conexión */ }
  }

  window.CuentasDebug = { textoHablado, resumenCache, leerCola };

  /* ───────── Arranque ───────── */
  pintarConexion();
  pintarCola();
  pintarCabecera(resumenCache());
  leerEnlaceDeLaUrl();
  if (configurado()) vaciarCola();
  refrescarCabecera();
  if ('speechSynthesis' in window) speechSynthesis.getVoices(); // precarga de voces
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
