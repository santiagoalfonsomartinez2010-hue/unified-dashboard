/*
  Detección y coerción de tipos a nivel de VALOR (una celda suelta).

  Es la capa más baja del pipeline de análisis: aquí no se decide qué significa
  una columna, solo qué hay escrito en una celda. El perfilado (perfilado.js)
  agrega estas decisiones celda a celda para decidir el tipo de la columna.

  Reglas de diseño:
   - Estricto por defecto: "F-2026-014" NO es un número, "31/12/2025" NO es un
     número. Preferimos decir "texto" a inventar una cifra.
   - Formato español de serie (1.234,56 €) y también anglosajón (1,234.56).
   - Nunca se modifica el valor original: se devuelve una lectura normalizada
     aparte, y quien llama decide si la usa.
*/

export const TIPOS = {
  NULO: 'nulo',
  BOOLEANO: 'booleano',
  NUMERO: 'numero',
  PORCENTAJE: 'porcentaje',
  MONEDA: 'moneda',
  FECHA: 'fecha',
  TEXTO: 'texto',
}

// Símbolos y códigos de moneda reconocidos → código ISO
const MONEDAS = [
  [/€|\beur\b|\beuros?\b/i, 'EUR'],
  [/\$|\busd\b|\bdólares?\b|\bdolares?\b/i, 'USD'],
  [/£|\bgbp\b|\blibras?\b/i, 'GBP'],
  [/¥|\bjpy\b|\byen(es)?\b/i, 'JPY'],
  [/\bchf\b|\bfrancos?\b/i, 'CHF'],
  [/\bmxn\b/i, 'MXN'],
]

const VERDADERO = ['true', 'verdadero', 'sí', 'si', 'yes', 'x', 'ok']
const FALSO = ['false', 'falso', 'no']

const MESES_ES = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
}

// Espacios "raros" que Excel mete a menudo (fino, duro, separador de miles)
const ESPACIOS = /[\s   ]/g

// ¿La celda está vacía a efectos de análisis?
export function esVacio(v) {
  if (v === null || v === undefined) return true
  if (typeof v === 'number') return false
  if (v instanceof Date) return false
  const s = String(v).replace(ESPACIOS, '')
  // Marcadores habituales de "sin dato" en Excels reales
  return s === '' || s === '-' || s === '--' || s === '#N/A' || s === 'N/A' || s === 'NULL'
}

// Detecta la moneda mencionada en un texto (o null)
export function detectarMoneda(texto) {
  const s = String(texto ?? '')
  for (const [patron, codigo] of MONEDAS) if (patron.test(s)) return codigo
  return null
}

/*
  Analiza una celda que podría ser numérica y devuelve
  { valor, moneda, porcentaje } o null si no es un número de verdad.

  Acepta: 1234 · 1.234,56 · 1,234.56 · -12,5 · (1.234) [negativo contable]
          4.850 € · $1,200.00 · 12% · 1 234,5
  Rechaza: F-2026-014 · 31/12/2025 · 12A · 1.2.3
*/
export function analizarNumerico(entrada) {
  if (typeof entrada === 'number') {
    return isFinite(entrada) ? { valor: entrada, moneda: null, porcentaje: false } : null
  }
  if (entrada instanceof Date) return null
  let s = String(entrada ?? '').trim()
  if (!s) return null

  const moneda = detectarMoneda(s)
  const porcentaje = /%/.test(s)

  // Fuera símbolos de moneda, códigos, porcentaje y espacios
  s = s
    .replace(/[€$£¥]/g, '')
    .replace(/\b(eur|usd|gbp|jpy|chf|mxn|euros?|d[óo]lares?|libras?)\b/gi, '')
    .replace(/%/g, '')
    .replace(ESPACIOS, '')

  // Negativo en notación contable: (1.234) → -1234
  let negativoParentesis = false
  if (/^\(.*\)$/.test(s)) {
    negativoParentesis = true
    s = s.slice(1, -1)
  }

  if (!s || !/\d/.test(s)) return null
  // A partir de aquí solo se admiten dígitos, separadores y un signo delante
  if (!/^[+-]?[\d.,]+$/.test(s)) return null

  const signo = s.startsWith('-') || negativoParentesis ? -1 : 1
  s = s.replace(/^[+-]/, '')

  const comas = (s.match(/,/g) || []).length
  const puntos = (s.match(/\./g) || []).length

  let entera
  let decimal = ''

  if (comas && puntos) {
    // Conviven ambos: el ÚLTIMO en aparecer es el separador decimal
    const decEs = s.lastIndexOf(',') > s.lastIndexOf('.')
    const sepDecimal = decEs ? ',' : '.'
    const sepMiles = decEs ? '.' : ','
    const corte = s.lastIndexOf(sepDecimal)
    entera = s.slice(0, corte)
    decimal = s.slice(corte + 1)
    if (decimal.includes(sepMiles) || !/^\d+$/.test(decimal)) return null
    if (!grupoDeMilesValido(entera, sepMiles)) return null
    entera = entera.split(sepMiles).join('')
  } else if (comas || puntos) {
    const sep = comas ? ',' : '.'
    const trozos = s.split(sep)
    const ultimo = trozos[trozos.length - 1]
    // Un único separador seguido de algo que no son 3 dígitos → es decimal.
    // Con 3 dígitos exactos es ambiguo (1.234 = mil doscientos o 1,234): en
    // formato español manda "miles", que es lo habitual en los Excels de aquí.
    const esDecimal = trozos.length === 2 && ultimo.length !== 3
    if (esDecimal) {
      entera = trozos[0]
      decimal = ultimo
      if (!/^\d*$/.test(entera) || !/^\d+$/.test(decimal)) return null
    } else {
      if (!grupoDeMilesValido(s, sep)) return null
      entera = trozos.join('')
    }
  } else {
    entera = s
  }

  if (!/^\d*$/.test(entera)) return null
  const n = parseFloat(`${entera || '0'}${decimal ? `.${decimal}` : ''}`)
  if (!isFinite(n)) return null
  return { valor: signo * n, moneda, porcentaje }
}

// "1.234.567" → válido; "1.23.4" o "12.3456" → no
function grupoDeMilesValido(texto, sep) {
  const trozos = texto.split(sep)
  if (trozos.length === 1) return /^\d+$/.test(trozos[0])
  if (!/^\d{1,3}$/.test(trozos[0])) return false
  return trozos.slice(1).every((t) => /^\d{3}$/.test(t))
}

// Interpreta booleanos escritos como texto ("Sí", "No", "TRUE"…)
export function analizarBooleano(entrada) {
  if (typeof entrada === 'boolean') return entrada
  const s = String(entrada ?? '').trim().toLowerCase()
  if (VERDADERO.includes(s)) return true
  if (FALSO.includes(s)) return false
  return null
}

// Fecha de Excel (número de serie) → Date. Excel cuenta desde 1899-12-30.
export function fechaDesdeSerial(n) {
  if (typeof n !== 'number' || !isFinite(n)) return null
  // Rango razonable: 1900-01-01 (1) a 2100 (~73050)
  if (n < 1 || n > 73050) return null
  const ms = Math.round((n - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return isNaN(d.getTime()) ? null : d
}

function iso(anio, mes, dia) {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ¿Existe de verdad ese día? (descarta 31/02, 30/02, 31/04…)
function fechaReal(anio, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
}

/*
  Interpreta una celda como fecha.

  `orden` resuelve la ambigüedad DD/MM vs MM/DD y lo decide la COLUMNA entera
  (ver detectarOrdenFecha), no la celda: '31/12' y '12/31' solo se distinguen
  mirando todos los valores juntos.

  Devuelve { iso, ts, precision } o null.
   - precision: 'dia' | 'mes' | 'anio' (para no fingir un día que no existe)
*/
export function analizarFecha(entrada, orden = 'dia-mes', permitirSerial = false) {
  if (entrada instanceof Date) {
    if (isNaN(entrada.getTime())) return null
    return construir(entrada.getFullYear(), entrada.getMonth() + 1, entrada.getDate(), 'dia')
  }
  if (typeof entrada === 'number') {
    if (!permitirSerial) return null
    const d = fechaDesdeSerial(entrada)
    return d ? construir(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 'dia') : null
  }

  const s = String(entrada ?? '').trim()
  if (!s) return null

  // ISO / AAAA-MM-DD / AAAA-MM (con hora opcional detrás)
  let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[T\s].*)?$/)
  if (m) {
    const anio = +m[1]
    const mes = +m[2]
    const dia = m[3] ? +m[3] : 1
    if (!fechaReal(anio, mes, dia)) return null
    return construir(anio, mes, dia, m[3] ? 'dia' : 'mes')
  }

  // DD/MM/AAAA · MM/DD/AAAA · DD-MM-AA · DD.MM.AAAA
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const anio = normalizarAnio(+m[3])
    const [dia, mes] = orden === 'mes-dia' ? [b, a] : [a, b]
    if (!fechaReal(anio, mes, dia)) return null
    return construir(anio, mes, dia, 'dia')
  }

  // MM/AAAA (mes suelto)
  m = s.match(/^(\d{1,2})[-/](\d{4})$/)
  if (m && +m[1] >= 1 && +m[1] <= 12) return construir(+m[2], +m[1], 1, 'mes')

  // "12 de marzo de 2025" · "12 marzo 2025" · "marzo 2025" · "mar-25"
  const texto = s.toLowerCase().replace(/\bde\b/g, ' ').replace(ESPACIOS, ' ').trim()
  m = texto.match(/^(\d{1,2})\s+([a-záéíóú]+)\.?\s+(\d{2,4})$/)
  if (m && MESES_ES[m[2]]) {
    const anio = normalizarAnio(+m[3])
    const mes = MESES_ES[m[2]]
    if (!fechaReal(anio, mes, +m[1])) return null
    return construir(anio, mes, +m[1], 'dia')
  }
  m = texto.match(/^([a-záéíóú]+)\.?[\s-]+(\d{2,4})$/)
  if (m && MESES_ES[m[1]]) return construir(normalizarAnio(+m[2]), MESES_ES[m[1]], 1, 'mes')

  // Año suelto (2024). Solo dentro de un rango creíble.
  m = s.match(/^(\d{4})$/)
  if (m && +m[1] >= 1900 && +m[1] <= 2100) return construir(+m[1], 1, 1, 'anio')

  return null

  function construir(anio, mes, dia, precision) {
    const texto = iso(anio, mes, dia)
    return { iso: texto, ts: Date.UTC(anio, mes - 1, dia), precision }
  }
}

// "25" → 2025, "99" → 1999 (dos dígitos: ventana 1970-2069)
function normalizarAnio(a) {
  if (a >= 100) return a
  return a <= 69 ? 2000 + a : 1900 + a
}

/*
  Decide si una columna con fechas tipo "x/y/AAAA" es día-mes o mes-día
  mirando TODOS sus valores: si algún primer componente pasa de 12, es día;
  si algún segundo componente pasa de 12, es mes-día. Sin evidencia se
  asume día-mes (formato español) y se avisa de que la lectura es ambigua.
*/
export function detectarOrdenFecha(valores) {
  let pruebaDiaMes = 0
  let pruebaMesDia = 0
  for (const v of valores) {
    const m = String(v ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
    if (!m) continue
    const a = +m[1]
    const b = +m[2]
    if (a > 12 && b <= 12) pruebaDiaMes++
    else if (b > 12 && a <= 12) pruebaMesDia++
  }
  if (pruebaDiaMes && !pruebaMesDia) return { orden: 'dia-mes', ambiguo: false }
  if (pruebaMesDia && !pruebaDiaMes) return { orden: 'mes-dia', ambiguo: false }
  // Contradictorio (hay de los dos) o sin pistas: nos quedamos con el formato
  // español, pero marcamos la ambigüedad para que quede registrada.
  return { orden: 'dia-mes', ambiguo: true, conflicto: pruebaDiaMes > 0 && pruebaMesDia > 0 }
}

/*
  Clasifica una celda suelta. `opciones`:
   - orden: orden de fecha decidido para la columna
   - permitirSerial: tratar números como fecha de Excel (solo si la celda
     venía con formato de fecha, lo decide la lectura del libro)
   - permitirFechaTexto: buscar fechas en texto (se apaga en columnas que ya
     sabemos que no son de fecha, por rendimiento)

  Devuelve { tipo, valor, moneda?, precision? } donde `valor` es la lectura
  normalizada (número, ISO de fecha, booleano o cadena).
*/
export function clasificarValor(valor, opciones = {}) {
  const { orden = 'dia-mes', permitirSerial = false } = opciones

  if (esVacio(valor)) return { tipo: TIPOS.NULO, valor: null }

  if (valor instanceof Date) {
    const f = analizarFecha(valor, orden)
    return f ? { tipo: TIPOS.FECHA, valor: f.iso, ts: f.ts, precision: f.precision } : { tipo: TIPOS.NULO, valor: null }
  }

  if (typeof valor === 'boolean') return { tipo: TIPOS.BOOLEANO, valor }

  if (typeof valor === 'number') {
    if (permitirSerial) {
      const f = analizarFecha(valor, orden, true)
      if (f) return { tipo: TIPOS.FECHA, valor: f.iso, ts: f.ts, precision: f.precision }
    }
    return { tipo: TIPOS.NUMERO, valor, moneda: null }
  }

  // Texto: el orden importa. Booleano y fecha van ANTES que número para que
  // "2024" en una columna de fechas no se lea como la cifra 2024.
  const b = analizarBooleano(valor)
  if (b !== null) return { tipo: TIPOS.BOOLEANO, valor: b }

  const f = analizarFecha(valor, orden)
  if (f) return { tipo: TIPOS.FECHA, valor: f.iso, ts: f.ts, precision: f.precision }

  const n = analizarNumerico(valor)
  if (n) {
    if (n.porcentaje) return { tipo: TIPOS.PORCENTAJE, valor: n.valor }
    if (n.moneda) return { tipo: TIPOS.MONEDA, valor: n.valor, moneda: n.moneda }
    return { tipo: TIPOS.NUMERO, valor: n.valor, moneda: null }
  }

  return { tipo: TIPOS.TEXTO, valor: String(valor).trim() }
}

// Familia numérica: todo lo que se puede sumar/promediar
export function esTipoNumerico(tipo) {
  return tipo === TIPOS.NUMERO || tipo === TIPOS.MONEDA || tipo === TIPOS.PORCENTAJE
}

/*
  Clave de comparación para detectar categorías que son "la misma" escritas
  distinto: "Madrid", "madrid", " MADRID " → "madrid". Solo se usa para
  DETECTAR y agrupar en la capa de análisis; los datos originales no se tocan.
*/
export function claveNormalizada(texto) {
  return String(texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}
