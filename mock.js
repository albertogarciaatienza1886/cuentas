/*
 * Modo demo: imita la API de Apps Script guardando todo en este navegador.
 * Se usa mientras el móvil no está conectado a la hoja. Depende de parser.js.
 */
(function () {
  'use strict';

  const CLAVE = 'cuentas.demo';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function semilla() {
    const ahora = new Date();
    const y = ahora.getFullYear(), m = ahora.getMonth(), d = ahora.getDate();
    const ejemplos = [
      [1, 'Ingreso', 1850, 'Ingresos', 'Nómina'], [1, 'Gasto', 700, 'Casa', 'Alquiler'],
      [2, 'Gasto', 64.3, 'Supermercado', 'Mercadona'], [3, 'Gasto', 50, 'Transporte', 'Gasolina'],
      [4, 'Gasto', 12.99, 'Suscripciones', 'Netflix'], [5, 'Gasto', 10.99, 'Suscripciones', 'Spotify'],
      [6, 'Gasto', 42, 'Restaurantes y ocio', 'Cena con amigos'], [7, 'Gasto', 35, 'Suscripciones', 'Gimnasio'],
      [9, 'Gasto', 38.75, 'Supermercado', 'Lidl'], [10, 'Gasto', 14.2, 'Salud', 'Farmacia'],
      [11, 'Gasto', 9.5, 'Restaurantes y ocio', 'Cañas'], [13, 'Gasto', 55, 'Transporte', 'Gasolina'],
      [14, 'Gasto', 69.99, 'Ropa', 'Zapatillas'], [16, 'Gasto', 71.1, 'Supermercado', 'Mercadona'],
      [17, 'Gasto', 12, 'Transporte', 'Parking'], [18, 'Gasto', 18, 'Restaurantes y ocio', 'Cine']
    ];
    const iso = (dia) => fechaIsoLocal(new Date(y, m, dia));
    return {
      categorias: JSON.parse(JSON.stringify(CATEGORIAS_POR_DEFECTO)),
      movimientos: ejemplos.filter((e) => e[0] <= d).map((e, i) => ({
        id: 'demo' + i, fecha: iso(e[0]), tipo: e[1], importe: e[2], categoria: e[3], concepto: e[4]
      }))
    };
  }

  function cargar() {
    try { const d = JSON.parse(localStorage.getItem(CLAVE)); if (d && d.movimientos) return d; } catch (e) { /* nada */ }
    const d = semilla();
    guardar(d);
    return d;
  }
  function guardar(d) { try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) { /* nada */ } }

  function resumen(d, hoy) {
    const mes = hoy.slice(0, 7);
    const gastado = {};
    let ingresos = 0, total = 0;
    d.movimientos.filter((m) => m.fecha.slice(0, 7) === mes).forEach((m) => {
      if (m.tipo === 'Ingreso') { ingresos += m.importe; return; }
      gastado[m.categoria] = (gastado[m.categoria] || 0) + m.importe;
      total += m.importe;
    });
    const p = hoy.split('-').map(Number);
    return {
      mes,
      mesNombre: MESES[p[1] - 1] + ' de ' + p[0],
      dia: p[2],
      diasMes: new Date(p[0], p[1], 0).getDate(),
      categorias: d.categorias.map((c) => ({ nombre: c.nombre, presupuesto: c.presupuesto, gastado: redondear2(gastado[c.nombre] || 0) })),
      total: { presupuesto: d.categorias.reduce((s, c) => s + c.presupuesto, 0), gastado: redondear2(total) },
      ingresos: redondear2(ingresos),
      ultimos: d.movimientos.slice(-8).reverse()
    };
  }

  async function llamar(action, datos) {
    await new Promise((r) => setTimeout(r, 450));
    const d = cargar();
    const hoy = datos.hoy || fechaIsoLocal(new Date());
    if (action === 'ping') return { ok: true, demo: true };
    if (action === 'summary') return { ok: true, resumen: resumen(d, hoy) };
    if (action === 'add') {
      const p = interpretarFrase(datos.texto, { categorias: d.categorias, hoy });
      if (!p.ok) return p;
      const mov = { id: datos.idCliente || String(Date.now()), fecha: p.fecha, tipo: p.tipo, importe: p.importe, categoria: p.categoria, concepto: p.concepto };
      if (!d.movimientos.some((m) => m.id === mov.id)) d.movimientos.push(mov);
      guardar(d);
      return { ok: true, movimiento: mov, resumen: resumen(d, hoy) };
    }
    if (action === 'undo') {
      const antes = d.movimientos.length;
      d.movimientos = d.movimientos.filter((m) => m.id !== datos.id);
      if (d.movimientos.length === antes) return { ok: false, error: 'No encuentro ese apunte.' };
      guardar(d);
      return { ok: true, resumen: resumen(d, hoy) };
    }
    if (action === 'recategorize') {
      const mov = d.movimientos.find((m) => m.id === datos.id);
      const cat = d.categorias.find((c) => c.nombre === datos.categoria);
      if (!mov || !cat) return { ok: false, error: 'No encuentro ese apunte o esa categoría.' };
      mov.categoria = cat.nombre;
      const clave = normalizar(mov.concepto).trim();
      d.categorias.forEach((c) => { c.palabras = c.palabras.filter((w) => normalizar(w) !== clave); });
      cat.palabras.push(clave);
      guardar(d);
      return { ok: true, resumen: resumen(d, hoy) };
    }
    return { ok: false, error: 'Acción desconocida' };
  }

  window.Mock = { llamar, reiniciar: () => localStorage.removeItem(CLAVE) };
})();
