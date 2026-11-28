/*
 * Intérprete de frases de gasto/ingreso en español ("50 € en gasolina").
 *
 * Archivo COMPARTIDO: lo usa la app del móvil (modo demo y sin conexión) y el
 * backend de Apps Script, que recibe una copia como apps-script/Parser.js
 * (`npm run sync`). Nada de módulos ni APIs del navegador aquí.
 */

var CATEGORIA_OTROS = 'Otros';
var CATEGORIA_INGRESOS = 'Ingresos';
// Gastos que te tiene que devolver la empresa: no cuentan en los presupuestos.
var CATEGORIA_POR_COBRAR = 'Pendiente de cobrar';
var TIPO_POR_COBRAR = 'Por cobrar';
var TIPO_COBRADO = 'Cobrado';
// Dinero extra que se suma a un presupuesto ese mes («400 € para gastar en caprichos»). No es un gasto.
var TIPO_EXTRA = 'Extra';

// Solo se usan para crear la hoja la primera vez y en el modo demo.
// Después, las categorías, presupuestos y palabras clave se cambian en la
// pestaña "Presupuestos" de la hoja de Google.
var CATEGORIAS_POR_DEFECTO = [
  { nombre: 'Supermercado', presupuesto: 300, palabras: ['super', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'eroski', 'hipercor', 'consum', 'ahorramas', 'la compra', 'fruta', 'fruteria', 'carniceria', 'pescaderia', 'panaderia', 'pan', 'leche'] },
  { nombre: 'Transporte', presupuesto: 150, palabras: ['gasolina', 'gasoil', 'gasoleo', 'diesel', 'combustible', 'repostar', 'parking', 'aparcamiento', 'peaje', 'autopista', 'metro', 'bus', 'autobus', 'taxi', 'uber', 'cabify', 'bolt', 'tren', 'renfe', 'cercanias', 'itv', 'taller', 'mecanico', 'neumaticos', 'lavado', 'abono transporte'] },
  { nombre: 'Restaurantes y ocio', presupuesto: 150, palabras: ['restaurante', 'bar', 'cena', 'cenar', 'comer fuera', 'comida fuera',
    'comida', 'comer', 'amigos', 'colegas', 'familia', 'tomar algo', 'almuerzo', 'desayuno', 'cafe', 'cerveza', 'cana', 'copa', 'tapas', 'menu', 'pizza', 'hamburguesa', 'burger', 'kebab', 'sushi', 'glovo', 'just eat', 'cine', 'concierto', 'teatro', 'entradas', 'museo', 'fiesta'] },
  { nombre: 'Casa', presupuesto: 700, palabras: ['alquiler', 'hipoteca', 'luz', 'electricidad', 'agua', 'gas', 'butano', 'internet', 'fibra', 'wifi', 'comunidad', 'ibi', 'seguro hogar', 'ikea', 'leroy merlin', 'muebles', 'ferreteria', 'limpieza', 'fontanero', 'electricista'] },
  { nombre: 'Salud', presupuesto: 60, palabras: ['farmacia', 'medicamentos', 'medicinas', 'medico', 'dentista', 'optica', 'gafas', 'lentillas', 'fisio', 'fisioterapeuta', 'psicologo', 'analisis', 'seguro medico', 'hospital'] },
  { nombre: 'Ropa', presupuesto: 80, palabras: ['ropa', 'zapatos', 'zapatillas', 'camiseta', 'camisa', 'pantalon', 'pantalones', 'vestido', 'chaqueta', 'abrigo', 'zara', 'primark', 'decathlon', 'calcetines'] },
  { nombre: 'Suscripciones', presupuesto: 40, palabras: ['netflix', 'spotify', 'hbo', 'disney', 'amazon prime', 'prime video', 'youtube', 'icloud', 'google one', 'movil', 'telefono', 'gimnasio', 'gym'] },
  { nombre: CATEGORIA_OTROS, presupuesto: 100, palabras: [] }
];

var NUMEROS_EN_PALABRAS = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900, mil: 1000
};

var MONEDAS = ['€', 'euro', 'euros', 'eur', 'pavo', 'pavos'];
var CENTIMOS = ['centimo', 'centimos', 'cents', 'centavos'];

// Palabras que sobran al principio / final del concepto.
var RELLENO_INICIO = ['he', 'me', 'ha', 'han', 'hemos', 'gastado', 'gaste', 'gastar', 'gasto', 'gastos', 'pagado', 'pague', 'pagar', 'pago',
  'apunta', 'apuntame', 'apuntar', 'anota', 'anotame', 'anotar', 'pon', 'ponme', 'acabo', 'de', 'en', 'el', 'la', 'los', 'las', 'lo',
  'un', 'una', 'unos', 'unas', 'por', 'para', 'del', 'al', 'a', 'y', 'con', 'que', 'es', 'son', 'fue', 'ingresado', 'ingresaron',
  'ingreso', 'ingresan', 'cobrado', 'cobre', 'cobro', 'total', 'vale', 'oye', 'hola', 'euro', 'euros', 'extra', 'mas'];
var RELLENO_FINAL = ['en', 'de', 'del', 'por', 'para', 'y', 'con', 'a', 'al', 'el', 'la', 'los', 'las', 'que', 'un', 'una', 'hoy', 'euro', 'euros'];

function normalizar(texto) {
  return String(texto == null ? '' : texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function limpiarBordes(s) {
  return s.replace(/^[^0-9a-z€]+/, '').replace(/[^0-9a-z€]+$/, '');
}

function contiene(lista, valor) {
  return lista.indexOf(valor) >= 0;
}

/** "12,50" -> 12.5 · "1.200" -> 1200 · "1.200,5" -> 1200.5 · "12.5" -> 12.5 */
function convertirNumero(s) {
  if (!/^\d+([.,]\d+)*$/.test(s)) return null;
  var punto = s.indexOf('.') >= 0, coma = s.indexOf(',') >= 0;
  if (punto && coma) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (punto) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  } else if (coma) {
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  var v = parseFloat(s);
  return isFinite(v) ? v : null;
}

function tokenizar(texto) {
  var limpio = String(texto).normalize('NFC')
    .replace(/€/g, ' € ')
    .replace(/(\d)(euros?|eur)\b/gi, '$1 $2');
  return limpio.split(/\s+/).map(function (o) {
    var n = limpiarBordes(normalizar(o));
    return { o: o, n: n, num: convertirNumero(n) };
  }).filter(function (t) { return t.n !== ''; });
}

function valorPalabra(n) {
  return Object.prototype.hasOwnProperty.call(NUMEROS_EN_PALABRAS, n) ? NUMEROS_EN_PALABRAS[n] : null;
}

/** Junta "treinta y cinco" en un único token con num = 35. */
function fusionarNumerosEnPalabras(toks) {
  var salida = [];
  var i = 0;
  while (i < toks.length) {
    if (valorPalabra(toks[i].n) === null) { salida.push(toks[i]); i++; continue; }
    var total = 0, actual = 0, j = i, trasY = false;
    while (j < toks.length) {
      var w = toks[j].n;
      if (w === 'y') {
        var sig = j + 1 < toks.length ? valorPalabra(toks[j + 1].n) : null;
        if (sig !== null && sig < 10 && actual % 100 >= 30 && actual % 10 === 0) { trasY = true; j++; continue; }
        break;
      }
      var val = valorPalabra(w);
      if (val === null) break;
      if (w === 'mil') { total += (actual || 1) * 1000; actual = 0; }
      else if (val < 100 && actual % 100 !== 0 && !trasY) break; // "doce cincuenta" = dos números
      else actual += val;
      trasY = false;
      j++;
    }
    var esUnSuelto = j - i === 1 && /^(un|una|uno)$/.test(toks[i].n) && !(j < toks.length && contiene(MONEDAS, toks[j].n));
    if (esUnSuelto) { salida.push(toks[i]); i++; continue; }
    var trozo = toks.slice(i, j);
    var valor = total + actual;
    salida.push({ o: trozo.map(function (t) { return t.o; }).join(' '), n: String(valor), num: valor, palabra: true });
    i = j;
  }
  return salida;
}

/** Devuelve { valor, usados: {indice: true} } o null si no hay importe. */
function extraerImporte(toks) {
  function num(i) { return i >= 0 && i < toks.length ? toks[i].num : null; }
  function es(i, lista) { return i >= 0 && i < toks.length && contiene(lista, toks[i].n); }
  function entero(j) { var v = num(j); return v !== null && v < 100 && Math.floor(v) === v; }
  function enPalabras(j) { return j >= 0 && j < toks.length && toks[j].palabra === true; }
  // Céntimos tras los euros: "con 50", "y cincuenta" o, pegados, "cincuenta" / "50" (dos cifras).
  // estricto: pegados solo si van en palabras ("doce cincuenta"), para no confundir "20 3 cafés".
  function centimos(i, usados, estricto) {
    if (es(i, ['con', 'y']) && entero(i + 1)) {
      usados[i] = usados[i + 1] = true;
      if (es(i + 2, CENTIMOS)) usados[i + 2] = true;
      return num(i + 1) / 100;
    }
    if (entero(i) && (enPalabras(i) || (!estricto && num(i) >= 10))) {
      usados[i] = true;
      if (es(i + 1, CENTIMOS)) usados[i + 1] = true;
      return num(i) / 100;
    }
    return 0;
  }
  var i, usados;
  // 0) "doce cincuenta euros" (dos números en palabras + moneda) = 12,50 €
  for (i = 0; i < toks.length; i++) {
    if (enPalabras(i) && enPalabras(i + 1) && entero(i + 1) && es(i + 2, MONEDAS)) {
      usados = {}; usados[i] = usados[i + 1] = usados[i + 2] = true;
      return { valor: num(i) + num(i + 1) / 100, usados: usados };
    }
  }
  // 1) número + moneda: "50 €", "12 euros con 50", "15 euros cincuenta", "50 céntimos"
  for (i = 0; i < toks.length; i++) {
    if (num(i) === null) continue;
    if (es(i + 1, MONEDAS)) {
      usados = {}; usados[i] = usados[i + 1] = true;
      return { valor: num(i) + centimos(i + 2, usados, false), usados: usados };
    }
    if (es(i + 1, CENTIMOS)) {
      usados = {}; usados[i] = usados[i + 1] = true;
      return { valor: num(i) / 100, usados: usados };
    }
  }
  // 2) "12 con 50 €"
  for (i = 0; i < toks.length; i++) {
    if (num(i) !== null && es(i + 1, ['con', 'y']) && num(i + 2) !== null && num(i + 2) < 100 && es(i + 3, MONEDAS)) {
      usados = {}; usados[i] = usados[i + 1] = usados[i + 2] = usados[i + 3] = true;
      return { valor: num(i) + num(i + 2) / 100, usados: usados };
    }
  }
  // 3) "€ 50"
  for (i = 0; i < toks.length; i++) {
    if (es(i, MONEDAS) && num(i + 1) !== null) {
      usados = {}; usados[i] = usados[i + 1] = true;
      return { valor: num(i + 1), usados: usados };
    }
  }
  // 4) el primer número que aparezca
  for (i = 0; i < toks.length; i++) {
    if (num(i) !== null) {
      usados = {}; usados[i] = true;
      return { valor: num(i) + centimos(i + 1, usados, true), usados: usados };
    }
  }
  return null;
}

// Palabras del nombre de una categoría que NO sirven como clave («Gastos fijos» no debe atrapar «gastos de envío»).
var PALABRAS_GENERICAS = ['gasto', 'gastos', 'vida', 'otros', 'otras', 'varios', 'varias', 'cosas', 'general', 'compras'];

function clavesDeCategoria(c) {
  var claves = (c.palabras || []).slice();
  claves.push(c.nombre);
  normalizar(c.nombre).split(/[^a-z0-9]+/).forEach(function (p) {
    if (p.length >= 4 && !contiene(PALABRAS_GENERICAS, p)) claves.push(p);
  });
  return claves;
}

/**
 * Raíz sencilla de una palabra para comparar sin fijarse en plural ni en masculino/femenino:
 * amigo, amiga, amigos, amigas -> "amig"; caña, cañas -> "cana"; bar, bares -> "bar".
 * Las palabras cortas (≤ 4 letras) se dejan casi tal cual para no confundir «cine» con «cina».
 */
function raiz(w) {
  if (w.length > 4 && /[^aeiou]es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && /s$/.test(w)) w = w.slice(0, -1);
  if (w.length > 4 && /[aeo]$/.test(w)) w = w.slice(0, -1);
  return w;
}

function raices(textoNorm) {
  return textoNorm.split(/[^a-z0-9&'.]+/).map(function (w) { return limpiarBordes(w); })
    .filter(Boolean).map(raiz);
}

/** ¿Aparece la secuencia de raíces `aguja` seguida dentro de `pajar`? */
function contieneSecuencia(pajar, aguja) {
  if (!aguja.length) return false;
  for (var i = 0; i + aguja.length <= pajar.length; i++) {
    var j = 0;
    while (j < aguja.length && pajar[i + j] === aguja[j]) j++;
    if (j === aguja.length) return true;
  }
  return false;
}

/** Busca la palabra clave más larga que aparezca en el texto (sin importar plural ni género). */
function buscarCategoria(textoNorm, categorias) {
  var texto = raices(textoNorm);
  var mejor = null, mejorPeso = 0;
  categorias.forEach(function (c) {
    clavesDeCategoria(c).forEach(function (k) {
      var kn = limpiarBordes(normalizar(k).trim()).replace(/\s+/g, ' ');
      if (kn.length < 2 || kn.length <= mejorPeso) return;
      if (contieneSecuencia(texto, raices(kn))) {
        mejorPeso = kn.length;
        mejor = c.nombre;
      }
    });
  });
  return mejor;
}

/**
 * Categoría para lo que no encaja con ninguna palabra clave: la de la hoja cuyo nombre empieza por
 * «Otros» (p. ej. «Otros (Imprevistos)»); si no hay ninguna, «Otros» sin presupuesto.
 */
function categoriaResto(categorias) {
  var resto = (categorias || []).filter(function (c) { return /^otros\b/.test(normalizar(String(c.nombre).trim())); })[0];
  return resto ? resto.nombre : CATEGORIA_OTROS;
}

function fechaIsoLocal(d) {
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

function sumarDias(iso, dias) {
  var p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
}

function redondear2(n) {
  return Math.round(n * 100) / 100;
}

/** "2026-12" -> "2027-01" */
function mesSiguiente(mes) {
  var p = mes.split('-').map(Number);
  return p[1] === 12 ? (p[0] + 1) + '-01' : p[0] + '-' + (p[1] < 9 ? '0' : '') + (p[1] + 1);
}

/**
 * Presupuesto acumulado que llega a `mes` en una categoría acumulativa, en cadena mes a mes.
 * Normal: lo que sobra se suma al siguiente y lo que te pasas se resta (puede quedar en negativo).
 * soloNegativo: lo que sobra se ahorra y no pasa; solo se arrastra lo que te pasas.
 * @param {number} base         presupuesto mensual
 * @param {Object} gastoPorMes  {"2026-10": 120.5, ...}  gasto neto del mes (gastos − extras)
 * @param {string} mesInicio    mes desde el que se acumula ("yyyy-mm"): el primero con apuntes,
 *                              o el de «Acumular desde» si es posterior
 * @param {string} mes          mes que se consulta ("yyyy-mm")
 * @param {boolean} soloNegativo
 */
function saldoAcumulado(base, gastoPorMes, mesInicio, mes, soloNegativo) {
  var saldo = 0;
  for (var m = mesInicio; m && m < mes; m = mesSiguiente(m)) {
    saldo += base - (gastoPorMes[m] || 0);
    if (soloNegativo && saldo > 0) saldo = 0;
  }
  return redondear2(saldo);
}

/** «Acumula al mes siguiente» de la hoja -> 'todo' | 'negativo' | 'no'. Acepta las antiguas casillas (TRUE/FALSE). */
function modoAcumula(valor) {
  if (valor === true) return 'todo';
  var v = normalizar(String(valor == null ? '' : valor)).trim();
  if (/negativ/.test(v)) return 'negativo';
  if (/^(si|x|true|1|todo)$/.test(v)) return 'todo';
  return 'no';
}

/** Categoría que se nombra en el texto por su nombre («caprichos», «vida social», «sara»…), no por sus palabras clave. */
function categoriaNombrada(textoNorm, categorias) {
  var texto = raices(textoNorm);
  var mejor = null, peso = 0;
  categorias.forEach(function (c) {
    var nombre = normalizar(c.nombre).replace(/[^a-z0-9]+/g, ' ').trim();
    var frases = [nombre].concat(nombre.split(' ').filter(function (p) { return p.length >= 4 && !contiene(PALABRAS_GENERICAS, p); }));
    frases.forEach(function (f) {
      if (f.length > peso && contieneSecuencia(texto, raices(f))) { peso = f.length; mejor = c.nombre; }
    });
  });
  return mejor;
}

/**
 * ¿Es dinero extra para un presupuesto? «400 € para gastar en caprichos», «150 € extra para vida social»,
 * «añade 400 a caprichos». Sin presupuesto nombrado, «para gastar» va a Caprichos.
 * Devuelve { categoria } (null si no hay a dónde) o null si no es un extra.
 */
function detectarExtra(textoNorm, categorias) {
  var t = ' ' + textoNorm + ' ';
  var nombrada = categoriaNombrada(textoNorm, categorias);
  var paraGastar = /\spara gastar\s/.test(t);
  var masPara = /\s(extra|de mas|mas)\s/.test(t) && /\spara\s/.test(t);
  var anade = /\s(anade|anadir|anadele|suma|sumar|sumale|ingresa|ingresar|aumenta|aumentar)\s/.test(t) && /\s(a|al|en)\s/.test(t);
  if (!(paraGastar || ((masPara || anade) && nombrada))) return null;
  var caprichos = (categorias || []).filter(function (c) { return /^capricho/.test(normalizar(c.nombre)); })[0];
  return { categoria: nombrada || (caprichos ? caprichos.nombre : null) };
}

var PATRON_POR_COBRAR = '(?:^|[\\s,.;:]+)(?:(?:y\\s+)?(?:pendiente\\s+de|a|por)\\s+cobrar(?:\\s+(?:de|a)\\s+la\\s+empresa)?' +
  '|lo\\s+paga\\s+la\\s+empresa|(?:de|para|a)\\s+la\\s+empresa|empresa)(?=$|[\\s,.;:])';

/** "Norauto 33 € para la empresa" -> ["Norauto 33 €", true] */
function separarPorCobrar(texto) {
  texto = String(texto);
  if (texto.search(new RegExp(PATRON_POR_COBRAR, 'i')) < 0) return [texto, false];
  return [texto.replace(new RegExp(PATRON_POR_COBRAR, 'gi'), ' ').replace(/\s+/g, ' ').trim(), true];
}

/** "50 € en gasolina, nota pagado con la cuenta secundaria" -> ["50 € en gasolina", "Pagado con la cuenta secundaria"] */
function separarNota(texto) {
  var m = String(texto).match(/^(.*?)[\s,.;:]+(?:con\s+)?nota[\s,.:;]+(.+)$/i);
  if (!m || !m[1].trim()) return [String(texto), ''];
  var nota = m[2].trim().replace(/[\s.]+$/, '');
  return [m[1], nota.charAt(0).toUpperCase() + nota.slice(1)];
}

/**
 * Interpreta una frase dictada.
 * @param {string} texto  p. ej. "he gastado 12 euros con 50 en el super"
 * @param {{categorias?: Array, hoy?: string}} opciones  hoy en formato yyyy-mm-dd
 * @return {{ok: boolean, tipo?: string, importe?: number, categoria?: string,
 *           concepto?: string, fecha?: string, texto?: string, error?: string}}
 */
function interpretarFrase(texto, opciones) {
  opciones = opciones || {};
  var categorias = opciones.categorias && opciones.categorias.length ? opciones.categorias : CATEGORIAS_POR_DEFECTO;
  var hoy = opciones.hoy || fechaIsoLocal(new Date());
  var original = String(texto == null ? '' : texto).trim();
  if (!original) return { ok: false, error: 'No he oído nada.' };
  var partes = separarNota(original);
  var nota = partes[1];
  var cobrar = separarPorCobrar(partes[0]);
  var porCobrar = cobrar[1];

  var toks = fusionarNumerosEnPalabras(tokenizar(cobrar[0]));
  var importe = extraerImporte(toks);
  if (!importe) {
    return { ok: false, texto: original, error: 'No he pillado el importe. Prueba con algo como «50 € en gasolina».' };
  }
  if (!(importe.valor > 0) || importe.valor > 1000000) {
    return { ok: false, texto: original, error: 'El importe no parece correcto.' };
  }
  var usados = importe.usados;

  // Fecha: "ayer", "anteayer", "antes de ayer"
  var desfase = 0;
  for (var i = 0; i < toks.length; i++) {
    var n = toks[i].n;
    if (n === 'antes' && toks[i + 1] && toks[i + 1].n === 'de' && toks[i + 2] && toks[i + 2].n === 'ayer') {
      desfase = -2; usados[i] = usados[i + 1] = usados[i + 2] = true; i += 2;
    } else if (n === 'anteayer') { desfase = -2; usados[i] = true; }
    else if (n === 'ayer') { desfase = -1; usados[i] = true; }
    else if (n === 'hoy') { usados[i] = true; }
  }

  var normTodo = ' ' + toks.map(function (t) { return t.n; }).join(' ') + ' ';
  var esIngreso = /\s(ingres\w*|cobr\w*|nomina|sueldo|salario|reembolso|devolucion)\s/.test(normTodo) ||
    /\sme (han )?(pagado|pagaron|devuelto|devolvieron)\s/.test(normTodo);
  if (/\sme (han |ha )?(cobrado|cobraron|cobran|cobra)\s/.test(normTodo)) esIngreso = false;
  if (porCobrar) esIngreso = false;

  var extra = porCobrar ? null : detectarExtra(normTodo.trim(), categorias);
  if (extra) {
    if (!extra.categoria) {
      return { ok: false, texto: original, error: '¿A qué presupuesto va el extra? Di, por ejemplo, «400 € para gastar en caprichos».' };
    }
    esIngreso = false;
  }

  var normSinImporte = toks.filter(function (t, idx) { return !usados[idx]; })
    .map(function (t) { return t.n; }).join(' ');
  var categoria = extra ? extra.categoria : porCobrar ? CATEGORIA_POR_COBRAR : esIngreso ? CATEGORIA_INGRESOS
    : (buscarCategoria(normSinImporte, categorias) || categoriaResto(categorias));

  var resto = toks.filter(function (t, idx) { return !usados[idx]; });
  while (resto.length && contiene(RELLENO_INICIO, resto[0].n)) resto.shift();
  while (resto.length && contiene(RELLENO_FINAL, resto[resto.length - 1].n)) resto.pop();
  var concepto = resto.map(function (t) { return t.o; }).join(' ')
    .replace(/^[\s,.;:¡!¿?"'()\-]+|[\s,.;:¡!¿?"'()\-]+$/g, '');
  if (extra) concepto = 'Extra para ' + categoria;
  if (!concepto) concepto = esIngreso ? 'Ingreso' : categoria;
  concepto = concepto.charAt(0).toUpperCase() + concepto.slice(1);

  return {
    ok: true,
    tipo: extra ? TIPO_EXTRA : porCobrar ? TIPO_POR_COBRAR : esIngreso ? 'Ingreso' : 'Gasto',
    importe: redondear2(importe.valor),
    categoria: categoria,
    concepto: concepto,
    fecha: desfase ? sumarDias(hoy, desfase) : hoy,
    nota: nota,
    texto: original
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    interpretarFrase: interpretarFrase,
    normalizar: normalizar,
    convertirNumero: convertirNumero,
    buscarCategoria: buscarCategoria,
    categoriaResto: categoriaResto,
    saldoAcumulado: saldoAcumulado,
    mesSiguiente: mesSiguiente,
    CATEGORIAS_POR_DEFECTO: CATEGORIAS_POR_DEFECTO,
    CATEGORIA_OTROS: CATEGORIA_OTROS,
    CATEGORIA_POR_COBRAR: CATEGORIA_POR_COBRAR,
    TIPO_POR_COBRAR: TIPO_POR_COBRAR,
    TIPO_EXTRA: TIPO_EXTRA,
    modoAcumula: modoAcumula,
    CATEGORIA_INGRESOS: CATEGORIA_INGRESOS
  };
}
