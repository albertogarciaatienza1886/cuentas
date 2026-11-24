/*
 * Modo demo: imita la API de Apps Script guardando todo en este navegador.
 * Se usa mientras el móvil no está conectado a la hoja. Depende de parser.js.
 * Los datos son inventados.
 */
(function () {
  'use strict';

  const CLAVE = 'cuentas.demo2';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const ACUMULAN = ['Ropa', 'Suscripciones'];

  function semilla() {
    const ahora = new Date();
    const y = ahora.getFullYear(), m = ahora.getMonth(), d = ahora.getDate();
    const esteMes = [
      [1, 'Ingreso', 1850, 'Ingresos', 'Nómina'], [1, 'Gasto', 700, 'Casa', 'Alquiler'],
      [2, 'Gasto', 64.3, 'Supermercado', 'Mercadona'], [3, 'Gasto', 50, 'Transporte', 'Gasolina'],
      [4, 'Gasto', 12.99, 'Suscripciones', 'Netflix'], [5, 'Gasto', 10.99, 'Suscripciones', 'Spotify'],
      [6, 'Gasto', 42, 'Restaurantes y ocio', 'Cena con amigos'], [7, 'Gasto', 35, 'Suscripciones', 'Gimnasio'],
      [9, 'Gasto', 38.75, 'Supermercado', 'Lidl'], [10, 'Gasto', 14.2, 'Salud', 'Farmacia'],
      [11, 'Gasto', 9.5, 'Restaurantes y ocio', 'Cañas'], [13, 'Gasto', 55, 'Transporte', 'Gasolina'],
      [14, 'Gasto', 69.99, 'Ropa', 'Zapatillas'], [16, 'Gasto', 71.1, 'Supermercado', 'Mercadona'],
      [17, 'Gasto', 12, 'Transporte', 'Parking'], [18, 'Gasto', 18, 'Restaurantes y ocio', 'Cine'],
      [19, 'Gasto', 15, 'Otros', 'Tintorería']
    ];
    const mesPasado = [
      [1, 'Ingreso', 1850, 'Ingresos', 'Nómina'], [1, 'Gasto', 700, 'Casa', 'Alquiler'],
      [4, 'Gasto', 120, 'Supermercado', 'Mercadona'], [8, 'Gasto', 60, 'Transporte', 'Gasolina'],
      [12, 'Gasto', 30, 'Ropa', 'Camiseta'], [15, 'Gasto', 62.99, 'Suscripciones', 'Netflix y gimnasio'],
      [20, 'Gasto', 48, 'Restaurantes y ocio', 'Cena']
    ];
    const iso = (mes, dia) => fechaIsoLocal(new Date(y, mes, dia));
    let i = 0;
    const mapa = (lista, mes) => lista.map((e) => ({
      id: 'demo' + (i++), fecha: iso(mes, e[0]), tipo: e[1], importe: e[2], categoria: e[3], concepto: e[4]
    }));
    const categorias = JSON.parse(JSON.stringify(CATEGORIAS_POR_DEFECTO))
      .filter((c) => c.nombre !== CATEGORIA_OTROS)
      .map((c) => Object.assign(c, { acumula: ACUMULAN.indexOf(c.nombre) >= 0 }));
    return {
      categorias,
      movimientos: mapa(mesPasado, m - 1).concat(mapa(esteMes.filter((e) => e[0] <= d), m))
    };
  }

  function cargar() {
    try { const d = JSON.parse(localStorage.getItem(CLAVE)); if (d && d.movimientos) return d; } catch (e) { /* nada */ }
    const d = semilla();
    guardar(d);
    return d;
  }
  function guardar(d) { try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) { /* nada */ } }

  // Misma lógica que calcularResumen() del backend, en pequeño.
  function resumen(d, hoy, mesPedido) {
    const mesActual = hoy.slice(0, 7);
    const mes = /^\d{4}-\d{2}$/.test(mesPedido || '') && mesPedido < mesActual ? mesPedido : mesActual;
    const cerrado = mes < mesActual;
    const gastoMesCat = {};
    let mesInicio = '';
    d.movimientos.forEach((m) => {
      const mm = m.fecha.slice(0, 7);
      if (!mesInicio || mm < mesInicio) mesInicio = mm;
      if (m.tipo === 'Ingreso') return;
      gastoMesCat[mm] = gastoMesCat[mm] || {};
      gastoMesCat[mm][m.categoria] = (gastoMesCat[mm][m.categoria] || 0) + m.importe;
    });
    const delMes = d.movimientos.map((m, fila) => Object.assign({ fila }, m)).filter((m) => m.fecha.slice(0, 7) === mes)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.fila - a.fila));
    const gastado = gastoMesCat[mes] || {};
    const categorias = d.categorias.map((c) => {
      const porMes = {};
      Object.keys(gastoMesCat).forEach((m) => { porMes[m] = gastoMesCat[m][c.nombre] || 0; });
      const acumulado = c.acumula ? saldoAcumulado(c.presupuesto, porMes, mesInicio, mes) : 0;
      return { nombre: c.nombre, presupuestoBase: c.presupuesto, acumulado, presupuesto: redondear2(c.presupuesto + acumulado),
        acumula: !!c.acumula, gastado: redondear2(gastado[c.nombre] || 0), palabras: c.palabras };
    });
    Object.keys(gastado).forEach((n) => {
      if (!d.categorias.some((c) => c.nombre === n)) {
        categorias.push({ nombre: n, presupuesto: 0, presupuestoBase: 0, acumulado: 0, gastado: redondear2(gastado[n]), huerfana: true });
      }
    });
    const p = mes.split('-').map(Number);
    const diasMes = new Date(p[0], p[1], 0).getDate();
    return {
      mes, mesActual, cerrado,
      mesInicio: mesInicio && mesInicio < mes ? mesInicio : mes,
      mesNombre: MESES[p[1] - 1] + ' de ' + p[0],
      dia: cerrado ? diasMes : Number(hoy.slice(8, 10)),
      diasMes,
      categorias,
      total: {
        presupuesto: redondear2(categorias.reduce((s, c) => s + c.presupuesto, 0)),
        gastado: redondear2(delMes.filter((m) => m.tipo !== 'Ingreso').reduce((s, m) => s + m.importe, 0))
      },
      ingresos: redondear2(delMes.filter((m) => m.tipo === 'Ingreso').reduce((s, m) => s + m.importe, 0)),
      movimientos: delMes.map((m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, importe: m.importe, categoria: m.categoria, concepto: m.concepto, nota: m.nota || '' }))
    };
  }

  async function llamar(action, datos) {
    await new Promise((r) => setTimeout(r, 400));
    const d = cargar();
    const hoy = datos.hoy || fechaIsoLocal(new Date());
    if (action === 'ping') return { ok: true, demo: true };
    if (action === 'summary') return { ok: true, resumen: resumen(d, hoy, datos.mes) };
    if (action === 'add') {
      const p = interpretarFrase(datos.texto, { categorias: d.categorias, hoy });
      if (!p.ok) return p;
      const mov = { id: datos.idCliente || String(Date.now()), fecha: p.fecha, tipo: p.tipo, importe: p.importe, categoria: p.categoria, concepto: p.concepto, nota: p.nota || '' };
      if (!d.movimientos.some((m) => m.id === mov.id)) d.movimientos.push(mov);
      guardar(d);
      return { ok: true, movimiento: mov, resumen: resumen(d, hoy) };
    }
    if (action === 'undo') {
      const antes = d.movimientos.length;
      d.movimientos = d.movimientos.filter((m) => m.id !== datos.id);
      if (d.movimientos.length === antes) return { ok: false, error: 'No encuentro ese apunte.' };
      guardar(d);
      return { ok: true, resumen: resumen(d, hoy, datos.mes) };
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
      return { ok: true, resumen: resumen(d, hoy, datos.mes) };
    }
    if (action === 'note') {
      const mov = d.movimientos.find((m) => m.id === datos.id);
      if (!mov) return { ok: false, error: 'No encuentro ese apunte.' };
      mov.nota = String(datos.nota || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      guardar(d);
      return { ok: true, nota: mov.nota, resumen: resumen(d, hoy, datos.mes) };
    }
    return { ok: false, error: 'Acción desconocida' };
  }

  window.Mock = { llamar, reiniciar: () => localStorage.removeItem(CLAVE) };
})();
