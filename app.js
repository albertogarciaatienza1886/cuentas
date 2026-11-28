/* Cuentas — app del móvil. Depende de parser.js (interpretarFrase…) y mock.js (modo demo). */
(function () {
  'use strict';

  const CLAVES = { config: 'cuentas.config', resumen: 'cuentas.resumen', cola: 'cuentas.pendientes' };
  const $ = (sel) => document.querySelector(sel);
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* almacenamiento no disponible */ } };

  let config = Object.assign({ api: '', k: '' }, leer(CLAVES.config, {}));
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
    lapiz: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    papelera: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
    flecha: '<svg class="chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    ciclo: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2"/><path d="M18.5 2v4h-4M5.5 22v-4h4"/></svg>',
    nota: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4Z"/></svg>',
    mas: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
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
    // Las palabras clave vienen de la hoja; si un resumen antiguo no las trae, usamos las de serie.
    return r.categorias.filter((c) => !c.huerfana).map((c) => {
      const serie = CATEGORIAS_POR_DEFECTO.find((d) => d.nombre === c.nombre);
      return { nombre: c.nombre, presupuesto: c.presupuesto, palabras: c.palabras || (serie ? serie.palabras : []) };
    });
  }

  function estadoCategoria(c, ritmo) {
    if (c.huerfana || (!c.presupuesto && !c.acumula)) return c.gastado > 0 ? 'sin' : 'vacio';
    // Acumulativa sin saldo (o en negativo por meses anteriores): todo lo que gastes es pasarte.
    if (c.presupuesto <= 0) return c.gastado > c.presupuesto ? 'pasado' : 'agotado';
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
    const total = { presupuesto: r.total.presupuesto, gastado: r.total.gastado, acumula: true };
    const e = estadoCategoria(total, r.dia / r.diasMes);
    barra.style.width = anchoBarra(total, e) + '%';
    barra.className = e;
  }

  /** % de la barra: llena si te has pasado (también con presupuesto en negativo). */
  const anchoBarra = (c, e) => (e === 'pasado' ? 100 : Math.min(100, pct(c.gastado, c.presupuesto) * 100));

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

  /** Lo que pasa al mes siguiente en las categorías acumulativas (negativo si te pasaste). */
  const sobranteAcumulable = (r) => r.categorias.filter((c) => c.acumula).reduce((s, c) => {
    const resto = c.presupuesto - c.gastado;
    return s + (c.modoAcumula === 'negativo' ? Math.min(0, resto) : resto); // «Solo lo negativo»: lo que sobra se ahorra
  }, 0);
  const acumuladoTotal = (r) => r.categorias.reduce((s, c) => s + (c.acumulado || 0), 0);

  /* ───────── Voz: escuchar ───────── */
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let escuchando = false;

  function estado(clase) {
    document.body.classList.remove('escuchando', 'enviando');
    if (clase) document.body.classList.add(clase);
  }

  function alternarMicro() {
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
    const provisional = { id: item.idCliente, fecha: previo.fecha, tipo: previo.tipo, importe: previo.importe,
      categoria: previo.categoria, concepto: previo.concepto, nota: previo.nota };
    // La tarjeta sale ya con lo que ha entendido el móvil; la hoja lo confirma por detrás (~2 s).
    mostrarApunte(provisional, false, true);
    vibrar([20, 40, 20]);
    const sigueEnPantalla = () => actual && actual.mov.id === item.idCliente && !$('#tarjeta').hidden;
    try {
      const r = await llamar('add', item);
      if (!r.ok) {
        if (sigueEnPantalla()) mostrarError(r.error, texto);
        else toast(`No se pudo apuntar «${texto}»: ${r.error}`, 5000);
        return;
      }
      guardarResumen(r.resumen);
      if (sigueEnPantalla()) mostrarApunte(r.movimiento, false);
    } catch (e) {
      if (!(e instanceof ErrorRed)) throw e;
      encolar(item);
      if (sigueEnPantalla()) mostrarApunte(provisional, true);
      vibrar(30);
    }
  }

  /**
   * Tarjeta del último apunte.
   * pendiente: sin conexión, guardado en la cola · guardando: enviado a la hoja, esperando respuesta.
   */
  function mostrarApunte(mov, pendiente, guardando) {
    actual = { mov, pendiente, guardando: !!guardando };
    const ingreso = mov.tipo === 'Ingreso';
    const extra = mov.tipo === TIPO_EXTRA;
    const r = resumenCache();
    const cat = !pendiente && r && r.categorias ? r.categorias.find((c) => c.nombre === mov.categoria) : null;
    const fecha = mov.fecha !== hoy() ? `<span class="t-fecha">· ${esc(fechaCorta(mov.fecha))}</span>` : '';
    let estadoCat = '';
    if (cat && !cat.huerfana && (cat.presupuesto || cat.acumula || extra) && !ingreso) {
      // Mientras se guarda, el resumen guardado aún no incluye este apunte: se suma a mano.
      const conEste = Object.assign({}, cat, {
        gastado: cat.gastado + (guardando && mov.tipo === 'Gasto' ? mov.importe : 0),
        presupuesto: cat.presupuesto + (guardando && extra ? mov.importe : 0)
      });
      const ec = estadoCategoria(conEste, r.dia / r.diasMes);
      estadoCat = `
        <div class="t-estado"><span>${esc(cat.nombre)} este mes</span><span><b>${eur(conEste.gastado)}</b> de ${eur(conEste.presupuesto)}</span></div>
        <div class="barra ${ec}"><i style="width:${anchoBarra(conEste, ec)}%"></i>
          <span class="ritmo" style="left:${(r.dia / r.diasMes) * 100}%"></span></div>`;
    }
    let cabecera;
    if (pendiente) cabecera = ICONOS.nube + 'Sin conexión · se enviará solo';
    else if (guardando) cabecera = '<span class="giro-mini" aria-hidden="true"></span>Guardando en tu hoja…';
    else cabecera = ICONOS.check + (ingreso ? 'Ingreso apuntado' : extra ? `Sumado a ${esc(mov.categoria)}`
      : mov.tipo === TIPO_POR_COBRAR ? 'Apuntado · lo paga la empresa' : 'Apuntado');
    const bloqueado = guardando ? 'disabled' : '';
    $('#transcripcion').textContent = '';
    pintarTarjeta(`
      <div class="t-cab ${pendiente ? 'pendiente' : guardando ? 'guardando' : ''}">${cabecera} ${fecha}</div>
      <div class="t-importe ${ingreso || extra ? 'ingreso' : ''}">${ingreso || extra ? '+' : ''}${eur(mov.importe)}</div>
      <div class="t-concepto">${esc(mov.concepto)}</div>
      ${mov.nota ? `<div class="t-nota">${ICONOS.nota}${esc(mov.nota)}</div>` : ''}
      <div class="t-meta"><button class="chip" type="button" data-accion="cambiar" ${pendiente || ingreso || guardando ? 'disabled' : ''}>${ICONOS.etiqueta}${esc(mov.categoria)}</button></div>
      ${estadoCat}
      <div class="t-acciones">
        <button class="btn-sec" type="button" data-accion="deshacer" ${bloqueado}>${ICONOS.deshacer}Deshacer</button>
        ${pendiente || ingreso ? '' : `<button class="btn-sec" type="button" data-accion="cambiar" ${bloqueado}>${ICONOS.etiqueta}Categoría</button>`}
        ${pendiente ? '' : `<button class="btn-sec" type="button" data-accion="nota" ${bloqueado}>${ICONOS.lapiz}Nota</button>`}
      </div>
      <div class="t-categorias" id="selectorCategorias" hidden></div>
      <div id="editorNotaTarjeta"></div>`);
  }

  /* ───────── Notas de los apuntes ───────── */
  let editandoNota = null; // id del apunte con el editor de nota abierto en el panel

  function notasSugeridas(excepto) {
    const notas = ['Pagado con la cuenta secundaria'];
    const fuente = (vista && vista.movimientos) || ((resumenCache() || {}).movimientos) || [];
    fuente.forEach((m) => { if (m.nota && notas.indexOf(m.nota) < 0) notas.push(m.nota); });
    return notas.filter((n) => n !== excepto).slice(0, 4);
  }

  function editorNota(m) {
    const sugeridas = notasSugeridas(m.nota);
    return `
      <div class="nota-editor" data-editor-nota="${esc(m.id)}">
        <input type="text" maxlength="200" value="${esc(m.nota || '')}" enterkeyhint="done"
               placeholder="p. ej. Pagado con la cuenta secundaria" aria-label="Nota del apunte">
        ${sugeridas.length ? `<div class="nota-sugerencias">${sugeridas.map((n) =>
          `<button class="chip" type="button" data-nota-rapida="${esc(n)}" data-id="${esc(m.id)}">${esc(n)}</button>`).join('')}</div>` : ''}
        <div class="t-acciones">
          <button class="btn-sec" type="button" data-nota-guardar="${esc(m.id)}">Guardar nota</button>
          ${m.nota ? `<button class="btn-sec peligro" type="button" data-nota-quitar="${esc(m.id)}">Quitar nota</button>` : ''}
        </div>
      </div>`;
  }

  async function guardarNota(id, nota) {
    nota = String(nota || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const mes = panelAbierto === 'panelPresupuestos' && vista ? vista.mes : mesActualIso();
    editandoNota = null;
    const enTarjeta = actual && actual.mov.id === id && !$('#tarjeta').hidden;
    const notaAntes = enTarjeta ? actual.mov.nota : '';
    if (enTarjeta) { actual.mov.nota = nota; mostrarApunte(actual.mov, false); }
    const r = await conCambioInstantaneo({ tipo: 'nota', id, nota }, 'note', { id, nota, hoy: hoy(), mes },
      nota ? 'Nota guardada' : 'Nota quitada', 'No he podido guardar la nota');
    if (!r && enTarjeta && actual && actual.mov.id === id) { actual.mov.nota = notaAntes; mostrarApunte(actual.mov, false); }
  }

  /* ───────── Cambios al instante (se guardan en la hoja por detrás) ───────── */
  const copiar = (o) => JSON.parse(JSON.stringify(o));
  const masRecienteMov = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0);

  /**
   * Copia del resumen con el efecto de una acción ya aplicado, para pintarlo sin esperar a Google.
   * cambio: { tipo: 'borrar' | 'mover' | 'nota' | 'cobrado', id, categoria?, nota? }
   */
  function resumenConCambio(r, cambio) {
    const c = copiar(r);
    c.porCobrar = c.porCobrar || { total: 0, movimientos: [] };
    const iMes = c.movimientos.findIndex((m) => m.id === cambio.id);
    const iCobrar = c.porCobrar.movimientos.findIndex((m) => m.id === cambio.id);
    const m = iMes >= 0 ? c.movimientos[iMes] : iCobrar >= 0 ? c.porCobrar.movimientos[iCobrar] : null;
    if (!m) return c;
    const sumarGasto = (categoria, delta) => {
      const cat = c.categorias.find((x) => normalizar(x.nombre) === normalizar(categoria));
      if (cat) cat.gastado = redondear2(cat.gastado + delta);
      c.total.gastado = redondear2(c.total.gastado + delta);
    };
    const sumarExtra = (categoria, delta) => {
      const cat = c.categorias.find((x) => normalizar(x.nombre) === normalizar(categoria));
      if (cat) {
        cat.extra = redondear2((cat.extra || 0) + delta);
        cat.presupuesto = redondear2(cat.presupuesto + delta);
      }
      c.total.presupuesto = redondear2(c.total.presupuesto + delta);
    };
    const quitar = () => {
      if (iMes >= 0) {
        c.movimientos.splice(iMes, 1);
        if (m.tipo === 'Ingreso') c.ingresos = redondear2(c.ingresos - m.importe);
        else if (m.tipo === TIPO_EXTRA) sumarExtra(m.categoria, -m.importe);
        else sumarGasto(m.categoria, -m.importe);
      } else {
        c.porCobrar.movimientos.splice(iCobrar, 1);
        c.porCobrar.total = redondear2(c.porCobrar.total - m.importe);
      }
    };
    if (cambio.tipo === 'nota') {
      m.nota = cambio.nota;
    } else if (cambio.tipo === 'borrar' || cambio.tipo === 'cobrado') {
      quitar();
    } else if (cambio.tipo === 'mover') {
      const aEmpresa = cambio.categoria === CATEGORIA_POR_COBRAR;
      quitar();
      const nuevo = Object.assign({}, m, {
        categoria: cambio.categoria,
        tipo: aEmpresa ? TIPO_POR_COBRAR : (m.tipo === TIPO_POR_COBRAR ? 'Gasto' : m.tipo)
      });
      if (aEmpresa) {
        c.porCobrar.movimientos.unshift(nuevo);
        c.porCobrar.total = redondear2(c.porCobrar.total + nuevo.importe);
      } else if (nuevo.fecha.slice(0, 7) === c.mes) {
        c.movimientos.push(nuevo);
        c.movimientos.sort(masRecienteMov);
        if (nuevo.tipo === TIPO_EXTRA) sumarExtra(nuevo.categoria, nuevo.importe);
        else sumarGasto(nuevo.categoria, nuevo.importe);
      }
    }
    return c;
  }

  /**
   * Pinta el cambio al momento y lo manda a la hoja. Si la hoja lo rechaza o no hay conexión,
   * vuelve a como estaba y avisa. Devuelve la respuesta de la hoja (o null si falló).
   */
  async function conCambioInstantaneo(cambio, accion, datos, mensajeOk, mensajeError) {
    const antes = panelAbierto === 'panelPresupuestos' ? vista : null;
    if (antes) pintarPresupuestos(resumenConCambio(antes, cambio), '');
    if (mensajeOk) toast(mensajeOk);
    try {
      const r = await llamar(accion, datos);
      if (!r.ok) throw new Error(r.error);
      if (r.resumen && r.resumen.mes === mesActualIso()) guardarResumen(r.resumen);
      if (r.resumen && panelAbierto === 'panelPresupuestos' && vista && vista.mes === r.resumen.mes) pintarPresupuestos(r.resumen, '');
      return r;
    } catch (e) {
      if (antes && panelAbierto === 'panelPresupuestos') pintarPresupuestos(antes, '');
      toast(`${mensajeError}: ${e instanceof ErrorRed ? 'sin conexión' : e.message}`, 4500);
      return null;
    }
  }

  /** Clics dentro de un editor de nota (en la tarjeta o en el panel). Devuelve true si lo ha atendido. */
  function clicEnNota(t) {
    const rapida = t.closest('[data-nota-rapida]');
    if (rapida) { guardarNota(rapida.dataset.id, rapida.dataset.notaRapida); return true; }
    const g = t.closest('[data-nota-guardar]');
    if (g) { guardarNota(g.dataset.notaGuardar, g.closest('[data-editor-nota]').querySelector('input').value); return true; }
    const q = t.closest('[data-nota-quitar]');
    if (q) { guardarNota(q.dataset.notaQuitar, ''); return true; }
    return false;
  }

  document.addEventListener('keydown', (e) => {
    const ed = e.target.closest && e.target.closest('[data-editor-nota]');
    if (ed && e.key === 'Enter') { e.preventDefault(); guardarNota(ed.dataset.editorNota, e.target.value); }
  });

  function enfocarEditorNota(contenedor) {
    const i = contenedor.querySelector('[data-editor-nota] input');
    if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
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
    cerrarTarjeta(); // al instante; si la hoja no puede borrarlo, la tarjeta vuelve
    const r = await conCambioInstantaneo({ tipo: 'borrar', id: mov.id }, 'undo', { id: mov.id, hoy: hoy() },
      'Apunte borrado', 'No he podido borrarlo');
    if (!r) mostrarApunte(mov, false);
  }

  function mostrarSelector() {
    if (!actual || actual.pendiente) return;
    const sel = $('#selectorCategorias');
    if (!sel.hidden) { sel.hidden = true; return; }
    // Un extra se puede pasar a otro presupuesto, pero no a «Pendiente de cobrar».
    const nombres = categoriasCache().map((c) => c.nombre).concat(actual.mov.tipo === TIPO_EXTRA ? [] : [CATEGORIA_POR_COBRAR]);
    sel.innerHTML = nombres.map((n) =>
      `<button class="chip ${n === actual.mov.categoria ? 'activa' : ''}" type="button" data-categoria="${esc(n)}">${esc(n)}</button>`).join('');
    sel.hidden = false;
  }

  async function cambiarCategoria(nombre) {
    if (!actual || nombre === actual.mov.categoria) { $('#selectorCategorias').hidden = true; return; }
    const mov = actual.mov;
    const aEmpresa = nombre === CATEGORIA_POR_COBRAR;
    const tipo = aEmpresa ? TIPO_POR_COBRAR : (mov.tipo === TIPO_POR_COBRAR ? 'Gasto' : mov.tipo);
    mostrarApunte(Object.assign({}, mov, { categoria: nombre, tipo }), false); // al instante
    const r = await conCambioInstantaneo({ tipo: 'mover', id: mov.id, categoria: nombre }, 'recategorize',
      { id: mov.id, categoria: nombre, hoy: hoy() },
      aEmpresa ? 'Pasado a pendiente de cobrar: no cuenta en tus presupuestos' : `Movido a ${nombre}. La próxima vez lo recordaré.`,
      'No he podido cambiarlo');
    if (r) { if (actual && actual.mov.id === mov.id) mostrarApunte(actual.mov, false); } // barra con datos de la hoja
    else if (actual && actual.mov.id === mov.id) mostrarApunte(mov, false);
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
    panelAbierto = null;
    if (!sinHistorial && history.state && history.state.panel) history.back();
  }
  window.addEventListener('popstate', () => { if (panelAbierto) cerrarPanel(true); });

  let vista = null;
  const resumenesVistos = {}; // "yyyy-mm" -> último resumen de ese mes visto en esta sesión            // resumen que se ve ahora en el panel
  let mesMostrado = '';        // "yyyy-mm" pedido (aunque aún no haya llegado)
  let moviendo = null;         // id del apunte con el selector de categoría abierto
  const abiertas = new Set();  // categorías desplegadas

  const mesActualIso = () => hoy().slice(0, 7);
  const dos = (n) => (n < 10 ? '0' : '') + n;
  function mesAnterior(m) { const [y, mm] = m.split('-').map(Number); return mm === 1 ? `${y - 1}-12` : `${y}-${dos(mm - 1)}`; }
  function nombreMes(m) { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); }

  async function abrirPresupuestos() {
    abrirPanel('panelPresupuestos');
    abiertas.clear();
    moviendo = null;
    await cargarMes(mesActualIso());
  }

  async function cargarMes(mes) {
    mesMostrado = mes;
    moviendo = null;
    const cuerpo = $('#cuerpoPres');
    // Lo último que se vio de ese mes sale al instante; luego se refresca con la hoja.
    const cache = mes === mesActualIso() ? resumenCache() : (resumenesVistos[mes] || null);
    if (cache && cache.mes === mes) pintarPresupuestos(cache, 'Actualizando…');
    else {
      pintarNavMes({ mes, mesActual: mesActualIso(), mesInicio: vista ? vista.mesInicio : mes, mesNombre: nombreMes(mes) });
      cuerpo.innerHTML = '<div class="cargando">Mirando tus cuentas…</div>';
    }
    try {
      const r = await llamar('summary', { hoy: hoy(), mes });
      if (!r.ok) throw new Error(r.error);
      if (r.resumen.mes === mesActualIso()) guardarResumen(r.resumen);
      if (panelAbierto !== 'panelPresupuestos' || mesMostrado !== mes) return;
      pintarPresupuestos(r.resumen, '');
    } catch (e) {
      if (panelAbierto !== 'panelPresupuestos' || mesMostrado !== mes) return;
      if (cache) {
        pintarPresupuestos(cache, 'Sin conexión: datos de la última vez' + (leerCola().length ? ' (sin los apuntes pendientes)' : ''));
      } else {
        cuerpo.innerHTML = `<div class="cargando">${esc(e.message || 'No he podido leer la hoja')}</div>`;
      }
    }
  }

  function pintarNavMes(r) {
    // "Noviembre" (año actual) o "Diciembre 2025": cabe entre las flechas.
    const [y, mm] = r.mes.split('-').map(Number);
    const nombre = capital(new Date(y, mm - 1, 1).toLocaleDateString('es-ES', { month: 'long' }));
    $('#tituloPres').textContent = y === Number(mesActualIso().slice(0, 4)) ? nombre : `${nombre} ${y}`;
    $('#btnMesAnterior').disabled = !(r.mesInicio && r.mes > r.mesInicio);
    $('#btnMesSiguiente').disabled = !(r.mes < (r.mesActual || mesActualIso()));
  }

  function filaMovimiento(m, conCategoria) {
    const ingreso = m.tipo === 'Ingreso';
    const porCobrar = m.tipo === TIPO_POR_COBRAR;
    const extra = m.tipo === TIPO_EXTRA;
    const positivo = ingreso || extra;
    // Un gasto se puede pasar a «Pendiente de cobrar»; uno de la empresa, devolver a un presupuesto.
    const cats = (vista ? vista.categorias : categoriasCache()).filter((c) => !c.huerfana)
      .concat(porCobrar || extra ? [] : [{ nombre: CATEGORIA_POR_COBRAR }]);
    const selector = moviendo === m.id ? `
      <div class="mov-chips">${cats.map((c) => `<button class="chip ${normalizar(c.nombre) === normalizar(m.categoria) ? 'activa' : ''}"
        type="button" data-mover-a="${esc(c.nombre)}" data-id="${esc(m.id)}">${esc(c.nombre)}</button>`).join('')}</div>` : '';
    return `
      <div class="mov">
        <div class="mov-txt"><div class="mov-concepto">${esc(m.concepto)}</div>
          <div class="mov-sub">${conCategoria ? esc(m.categoria) + ' · ' : ''}${esc(fechaCorta(m.fecha))}</div>
          ${m.nota ? `<div class="mov-nota">${ICONOS.nota}${esc(m.nota)}</div>` : ''}</div>
        <div class="mov-imp ${positivo ? 'ingreso' : ''}">${positivo ? '+' : '−'}${eur(m.importe)}</div>
        <div class="mov-acciones">
          <button class="mini-btn" type="button" data-nota-editar="${esc(m.id)}" aria-label="${m.nota ? 'Cambiar la nota' : 'Añadir nota'}">${ICONOS.lapiz}</button>
          ${porCobrar ? `<button class="mini-btn ok" type="button" data-cobrado="${esc(m.id)}" aria-label="Marcar como cobrado">${ICONOS.check}</button>` : ''}
          ${ingreso ? '' : `<button class="mini-btn" type="button" data-mover="${esc(m.id)}" aria-label="Cambiar de categoría">${ICONOS.etiqueta}</button>`}
          <button class="mini-btn peligro" type="button" data-borrar="${esc(m.id)}" aria-label="Borrar apunte">${ICONOS.papelera}</button>
        </div>
      </div>${selector}${editandoNota === m.id ? editorNota(m) : ''}`;
  }

  function bloqueCategoria(clase, nombre, cifras, barra, notas, lista) {
    const abierta = abiertas.has(nombre);
    return `
      <div class="cat ${clase} ${abierta ? 'abierta' : ''}">
        <div class="cat-cab" role="button" tabindex="0" data-cat="${esc(nombre)}" aria-expanded="${abierta}">
          <div class="cat-fila"><span class="cat-nombre">${esc(nombre)}</span>
            <span class="cat-cifras">${cifras}${ICONOS.flecha}</span></div>
          ${barra}${notas}
        </div>
        ${abierta ? `<div class="cat-movs">${lista.length ? lista.map((m) => filaMovimiento(m, false)).join('') : '<p class="vacio">Sin apuntes este mes.</p>'}</div>` : ''}
      </div>`;
  }

  function pintarPresupuestos(r, aviso) {
    vista = r;
    resumenesVistos[r.mes] = r;
    pintarNavMes(r);
    const ritmo = r.dia / r.diasMes;
    const quedan = r.total.presupuesto - r.total.gastado;
    const dias = r.diasMes - r.dia + 1;
    const estTotal = estadoCategoria({ presupuesto: r.total.presupuesto, gastado: r.total.gastado, acumula: true }, ritmo);
    const marcaRitmo = r.cerrado ? '' : `<span class="ritmo" style="left:${ritmo * 100}%"></span>`;
    const movimientos = r.movimientos || r.ultimos || [];
    const apuntes = (n) => (n === 1 ? '1 apunte' : `${n} apuntes`);

    const orden = { pasado: 0, ojo: 1, sin: 2, bien: 3, agotado: 4, vacio: 5 };
    const cats = r.categorias.slice().sort((a, b) => {
      const ea = estadoCategoria(a, ritmo), eb = estadoCategoria(b, ritmo);
      return orden[ea] - orden[eb] || pct(b.gastado, b.presupuesto) - pct(a.gastado, a.presupuesto);
    });

    const filas = cats.map((c) => {
      const e = estadoCategoria(c, ritmo);
      const lista = movimientos.filter((m) => m.tipo !== 'Ingreso' && normalizar(m.categoria) === normalizar(c.nombre));
      let nota;
      if (e === 'pasado') nota = `${r.cerrado ? 'Te pasaste' : 'Te has pasado'} ${eur(c.gastado - c.presupuesto)}`;
      else if (e === 'sin') nota = c.huerfana ? 'Sin presupuesto · toca para moverlos' : 'Sin presupuesto';
      else if (e === 'vacio') nota = 'Sin presupuesto ni gastos';
      else if (e === 'agotado') nota = 'Presupuesto agotado';
      else nota = `${r.cerrado ? 'Sobraron' : 'Quedan'} ${eur(c.presupuesto - c.gastado)}` + (e === 'ojo' ? ' · vas rápido' : '');
      let acum = '';
      if (c.acumula) {
        let txt = c.modoAcumula === 'negativo'
          ? 'Lo que sobre se ahorra; si te pasas, se resta del mes siguiente'
          : 'Lo que sobre o te pases pasa al mes siguiente';
        if (c.acumulado > 0) txt = `${eur(c.presupuestoBase)} + ${eur(c.acumulado)} que sobraron antes`;
        else if (c.acumulado < 0) txt = `${eur(c.presupuestoBase)} − ${eur(-c.acumulado)} que te pasaste antes`;
        acum = `<div class="cat-acum ${c.acumulado < 0 ? 'negativo' : ''}">${ICONOS.ciclo}${txt}</div>`;
      }
      if (c.extra > 0) acum += `<div class="cat-extra">${ICONOS.mas}${eur(c.extra)} extra este mes</div>`;
      const barra = `<div class="barra"><i style="width:${anchoBarra(c, e)}%"></i>${marcaRitmo}</div>`;
      return bloqueCategoria(e, c.nombre, `<b>${eur(c.gastado)}</b> / ${eur(c.presupuesto)}`, barra,
        `<div class="cat-nota">${nota} · ${apuntes(lista.length)}</div>${acum}`, lista);
    }).join('');

    const ingresos = movimientos.filter((m) => m.tipo === 'Ingreso');
    const bloqueIngresos = ingresos.length
      ? bloqueCategoria('ingresos-cat', 'Ingresos', `<b class="ingresos">+${eur(r.ingresos)}</b>`, '',
        `<div class="cat-nota">${apuntes(ingresos.length)}</div>`, ingresos)
      : '';

    // Gastos que te devuelve la empresa: de cualquier mes, fuera de los presupuestos.
    const cobrar = r.porCobrar || { total: 0, movimientos: [] };
    const bloqueCobrar = cobrar.movimientos.length
      ? bloqueCategoria('cobrar-cat', CATEGORIA_POR_COBRAR, `<b>${eur(cobrar.total)}</b>`, '',
        `<div class="cat-nota">${apuntes(cobrar.movimientos.length)} · lo paga la empresa, no cuenta en los presupuestos</div>`,
        cobrar.movimientos)
      : '';

    const pasan = sobranteAcumulable(r);
    const acum = acumuladoTotal(r);
    let lineaAcum = '';
    const mesQueViene = esc(nombreMes(mesSiguiente(r.mes)).split(' ')[0]);
    if (r.cerrado && Math.abs(pasan) >= 0.005) {
      lineaAcum = `<div class="total-linea acum">${ICONOS.ciclo} Pasaron a ${mesQueViene}: ` +
        (pasan > 0 ? `<b>${eur(pasan)}</b>` : `<b class="mal">−${eur(-pasan)}</b> (te pasaste)`) + '</div>';
    } else if (!r.cerrado && acum > 0) {
      lineaAcum = `<div class="total-linea acum">${ICONOS.ciclo} Incluye <b>${eur(acum)}</b> que sobraron de meses anteriores</div>`;
    } else if (!r.cerrado && acum < 0) {
      lineaAcum = `<div class="total-linea acum">${ICONOS.ciclo} Descuenta <b class="mal">${eur(-acum)}</b> que te pasaste en meses anteriores</div>`;
    }
    const extras = r.categorias.reduce((s, c) => s + (c.extra || 0), 0);
    if (extras > 0) lineaAcum += `<div class="total-linea acum">${ICONOS.mas} Incluye <b class="ingresos">${eur(extras)}</b> extra este mes</div>`;

    const recientes = r.cerrado ? '' : movimientos.slice(0, 8).map((m) => filaMovimiento(m, true)).join('');

    $('#cuerpoPres').innerHTML = `
      ${aviso ? `<p class="aviso-cache">${esc(aviso)}</p>` : ''}
      <div class="total ${estTotal}">
        <div class="total-cifra"><b>${eur(r.total.gastado)}</b><span>de ${eur(r.total.presupuesto)}</span></div>
        <div class="barra gruesa ${estTotal}"><i style="width:${anchoBarra(r.total, estTotal)}%"></i>${marcaRitmo}</div>
        <div class="total-linea">${r.cerrado
          ? 'Mes cerrado · ' + (quedan >= 0 ? `te sobraron <b>${eur(quedan)}</b>` : `<span class="mal">te pasaste <b>${eur(-quedan)}</b></span>`)
          : `Día ${r.dia} de ${r.diasMes} · ` + (quedan >= 0
            ? `te quedan <b>${eur(quedan)}</b>` + (dias > 1 ? ` (${eur(quedan / dias)}/día)` : '')
            : `<span class="mal">te has pasado <b>${eur(-quedan)}</b></span>`)}
        </div>
        ${lineaAcum}
        ${r.ingresos ? `<div class="total-linea">Ingresos: <span class="ingresos">+${eur(r.ingresos)}</span></div>` : ''}
        ${cobrar.total ? `<div class="total-linea">Pendiente de cobrar a la empresa: <b>${eur(cobrar.total)}</b></div>` : ''}
      </div>
      ${r.cerrado ? '' : '<p class="leyenda"><i></i> La rayita marca dónde deberías ir según el día del mes.</p>'}
      <div class="seccion">Por categoría <span class="seccion-pista">· toca una para ver sus apuntes</span></div>
      ${filas}
      ${bloqueIngresos}
      ${bloqueCobrar}
      ${recientes ? `<div class="seccion">Últimos apuntes</div>${recientes}` : ''}`;
  }

  /** Un apunte de lo que se ve en el panel: del mes o pendiente de cobrar. */
  function apunteDeLaVista(id) {
    if (!vista) return null;
    return (vista.movimientos || []).concat((vista.porCobrar || {}).movimientos || []).find((x) => x.id === id) || null;
  }

  async function marcarCobrado(id) {
    const m = apunteDeLaVista(id);
    if (!m) return;
    vibrar(20);
    await conCambioInstantaneo({ tipo: 'cobrado', id }, 'collected', { id, hoy: hoy(), mes: vista.mes },
      `«${m.concepto}» marcado como cobrado`, 'No he podido marcarlo');
  }

  async function borrarApunte(id) {
    const m = apunteDeLaVista(id);
    if (!m) return;
    if (!confirm(`¿Borrar «${m.concepto}» de ${eur(m.importe)} (${fechaCorta(m.fecha)})?\nSe quita también de la hoja.`)) return;
    vibrar(20);
    if (actual && actual.mov.id === id) cerrarTarjeta();
    await conCambioInstantaneo({ tipo: 'borrar', id }, 'undo', { id, hoy: hoy(), mes: vista.mes },
      'Apunte borrado', 'No he podido borrarlo');
  }

  async function moverApunte(id, categoria) {
    moviendo = null;
    const m = apunteDeLaVista(id);
    if (!m || normalizar(m.categoria) === normalizar(categoria)) { pintarPresupuestos(vista, ''); return; }
    await conCambioInstantaneo({ tipo: 'mover', id, categoria }, 'recategorize', { id, categoria, hoy: hoy(), mes: vista.mes },
      categoria === CATEGORIA_POR_COBRAR ? 'Pasado a pendiente de cobrar: ya no cuenta en tus presupuestos'
        : `Movido a ${categoria}. La próxima vez lo recordaré.`,
      'No he podido moverlo');
  }

  $('#cuerpoPres').addEventListener('click', (e) => {
    const t = e.target;
    if (clicEnNota(t)) return;
    if (t.closest('[data-editor-nota]')) return; // tocar dentro del editor no cierra nada
    const editar = t.closest('[data-nota-editar]');
    if (editar) {
      editandoNota = editandoNota === editar.dataset.notaEditar ? null : editar.dataset.notaEditar;
      moviendo = null;
      pintarPresupuestos(vista, '');
      enfocarEditorNota($('#cuerpoPres'));
      return;
    }
    const borrar = t.closest('[data-borrar]');
    if (borrar) { borrarApunte(borrar.dataset.borrar); return; }
    const cobrado = t.closest('[data-cobrado]');
    if (cobrado) { marcarCobrado(cobrado.dataset.cobrado); return; }
    const destino = t.closest('[data-mover-a]');
    if (destino) { moverApunte(destino.dataset.id, destino.dataset.moverA); return; }
    const mover = t.closest('[data-mover]');
    if (mover) { moviendo = moviendo === mover.dataset.mover ? null : mover.dataset.mover; pintarPresupuestos(vista, ''); return; }
    const cat = t.closest('[data-cat]');
    if (cat) {
      const n = cat.dataset.cat;
      if (abiertas.has(n)) abiertas.delete(n); else abiertas.add(n);
      pintarPresupuestos(vista, '');
    }
  });
  $('#cuerpoPres').addEventListener('keydown', (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cat.click(); }
  });
  $('#btnMesAnterior').addEventListener('click', () => { abiertas.clear(); cargarMes(mesAnterior(mesMostrado)); });
  $('#btnMesSiguiente').addEventListener('click', () => { abiertas.clear(); cargarMes(mesSiguiente(mesMostrado)); });

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
    if (clicEnNota(e.target)) return;
    const cat = e.target.closest('[data-categoria]');
    if (cat) { cambiarCategoria(cat.dataset.categoria); return; }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'deshacer') deshacer();
    else if (accion === 'cambiar') mostrarSelector();
    else if (accion === 'nota' && actual) {
      const caja = $('#editorNotaTarjeta');
      caja.innerHTML = caja.innerHTML ? '' : editorNota(actual.mov);
      enfocarEditorNota(caja);
    }
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

  window.addEventListener('online', vaciarCola);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { vaciarCola(); refrescarCabecera(); } });

  async function refrescarCabecera() {
    try { const r = await llamar('summary', { hoy: hoy() }); if (r.ok) guardarResumen(r.resumen); } catch (e) { /* sin conexión */ }
  }

  window.CuentasDebug = { resumenCache, leerCola };

  /* ───────── Arranque ───────── */
  pintarConexion();
  pintarCola();
  pintarCabecera(resumenCache());
  leerEnlaceDeLaUrl();
  if (configurado()) vaciarCola();
  refrescarCabecera();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
