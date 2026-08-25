import {
  TIPOS,
  clasificarValor,
  detectarOrdenFecha,
  esTipoNumerico,
  esVacio,
  claveNormalizada,
} from './tipos'

/*
  PERFILADO: qué contiene cada columna, en números.

  Es la base objetiva sobre la que después se decide el significado
  (semantica.js), la calidad (calidad.js) y qué se puede calcular
  (metricas.js). Aquí no hay interpretación: solo estadística.

  El perfilado deja además preparada una "capa normalizada"
  (`filasNormalizadas`): la misma tabla con cada celda ya convertida a número,
  fecha ISO, booleano o texto. Los datos ORIGINALES no se tocan nunca; esta
  capa es solo para analizar y agregar sin volver a parsear en cada cálculo.
*/

// Topes para no reventar la memoria con ficheros enormes. Al superarlos se
// deja de contar exacto y se marca la columna como de cardinalidad alta.
const MAX_DISTINTOS = 50000
const MAX_FRECUENCIAS = 5000
const MUESTRA = 12

/*
  Perfila una tabla completa.
  Devuelve { columnas: [perfil], filasNormalizadas, filas }
*/
export function perfilarTabla(tabla) {
  const filas = tabla.filas
  const total = filas.length
  const columnas = []

  // Matriz normalizada, del mismo tamaño que la original
  const filasNormalizadas = Array.from({ length: total }, () => new Array(tabla.columnas.length).fill(null))

  tabla.columnas.forEach((col, j) => {
    const crudos = filas.map((f) => f[j])
    const perfil = perfilarColumna(crudos, col.nombre, j)
    columnas.push(perfil)
    for (let i = 0; i < total; i++) filasNormalizadas[i][j] = perfil.normalizados[i]
    // Los valores normalizados ya viven en la matriz; fuera del perfil para
    // no duplicar en memoria un array por columna.
    delete perfil.normalizados
  })

  return { columnas, filasNormalizadas, filas: total }
}

/*
  Perfila UNA columna a partir de sus valores crudos.

  Se hace en dos pasadas porque el orden día-mes/mes-día no se puede decidir
  celda a celda: "05/01" es ambiguo hasta que aparece un "31/01" en la misma
  columna. Primero se mira la columna entera, después se clasifica cada celda.
*/
export function perfilarColumna(crudos, nombre, posicion = 0) {
  const total = crudos.length

  // --- Pasada 1: cómo hay que leer esta columna ---
  const { orden, ambiguo, conflicto } = detectarOrdenFecha(crudos)
  const permitirSerial = pareceFechaEnSerial(crudos, nombre)

  // --- Pasada 2: clasificar celda a celda ---
  const conteoTipos = {}
  const normalizados = new Array(total).fill(null)
  const numeros = []
  const monedas = new Set()
  const distintos = new Set()
  const frecuencias = new Map()
  // Escrituras distintas de un mismo valor ("Madrid", "madrid", "MADRID").
  // Se guardan para poder AVISAR de que probablemente son la misma categoría,
  // nunca para corregir el dato original por nuestra cuenta.
  const variantes = new Map()
  const muestra = []
  let nulos = 0
  let numerosComoTexto = 0
  let longitudTexto = 0
  let textos = 0
  let minFecha = null
  let maxFecha = null

  for (let i = 0; i < total; i++) {
    const bruto = crudos[i]
    const c = clasificarValor(bruto, { orden, permitirSerial })

    conteoTipos[c.tipo] = (conteoTipos[c.tipo] || 0) + 1

    if (c.tipo === TIPOS.NULO) {
      nulos++
      continue
    }

    normalizados[i] = c.valor
    if (muestra.length < MUESTRA) muestra.push(bruto)

    if (esTipoNumerico(c.tipo)) {
      numeros.push(c.valor)
      if (c.moneda) monedas.add(c.moneda)
      // Cifra guardada como texto: es un problema de calidad frecuente y hay
      // que poder avisarlo aunque el análisis siga funcionando.
      if (typeof bruto === 'string') numerosComoTexto++
    } else if (c.tipo === TIPOS.FECHA) {
      if (minFecha == null || c.valor < minFecha) minFecha = c.valor
      if (maxFecha == null || c.valor > maxFecha) maxFecha = c.valor
    } else if (c.tipo === TIPOS.TEXTO) {
      textos++
      longitudTexto += c.valor.length
      const clave = claveNormalizada(c.valor)
      if (variantes.size < MAX_FRECUENCIAS || variantes.has(clave)) {
        const set = variantes.get(clave)
        if (set) set.add(c.valor)
        else variantes.set(clave, new Set([c.valor]))
      }
    }

    const clave = typeof c.valor === 'string' ? claveNormalizada(c.valor) : c.valor
    if (distintos.size < MAX_DISTINTOS) distintos.add(clave)
    if (frecuencias.size < MAX_FRECUENCIAS || frecuencias.has(clave)) {
      frecuencias.set(clave, (frecuencias.get(clave) || 0) + 1)
    }
  }

  const noNulos = total - nulos
  const tipo = tipoDominante(conteoTipos)
  const confianzaTipo = noNulos ? (conteoTipos[tipo] || 0) / noNulos : 0
  const cardinalidadAlta = distintos.size >= MAX_DISTINTOS
  const unicos = distintos.size

  const estadisticas = numeros.length ? calcularEstadisticas(numeros) : {}

  const perfil = {
    nombre,
    posicion,
    tipo,
    // Se guardan TODOS los tipos vistos: una columna "mayormente numérica"
    // con un 5 % de texto no es lo mismo que una limpia, y eso condiciona si
    // se puede usar para un KPI.
    tiposVistos: conteoTipos,
    confianzaTipo,
    tipoMixto: confianzaTipo < 0.9 && noNulos > 0,

    total,
    noNulos,
    nulos,
    porcentajeNulos: total ? redondear((nulos / total) * 100, 2) : 0,
    unicos,
    porcentajeUnicos: noNulos ? redondear((unicos / noNulos) * 100, 2) : 0,
    cardinalidadAlta,

    ...estadisticas,
    moneda: monedas.size === 1 ? [...monedas][0] : null,
    monedasMezcladas: monedas.size > 1 ? [...monedas] : null,
    unidad: null, // lo rellena semantica.js al saber qué mide la columna

    ordenFecha: orden,
    fechaAmbigua: tipo === TIPOS.FECHA && ambiguo,
    fechaConflicto: !!conflicto,
    rangoFechas: minFecha ? { min: minFecha, max: maxFecha } : null,

    numerosComoTexto,
    longitudMediaTexto: textos ? redondear(longitudTexto / textos, 1) : 0,
    valoresFrecuentes: topFrecuencias(frecuencias, noNulos),
    variantesEscritura: variantesConflictivas(variantes),
    muestra,
    normalizados,
  }

  // Los papeles que puede jugar la columna en el dashboard
  perfil.esFecha = tipo === TIPOS.FECHA && confianzaTipo >= 0.7
  perfil.esIdentificador = decidirIdentificador(perfil, nombre)
  perfil.esMetrica = decidirMetrica(perfil)
  perfil.esDimension = decidirDimension(perfil)

  return perfil
}

// El tipo no nulo más repetido (los nulos no definen el tipo de la columna)
function tipoDominante(conteo) {
  let mejor = TIPOS.TEXTO
  let mejorN = -1
  for (const [tipo, n] of Object.entries(conteo)) {
    if (tipo === TIPOS.NULO) continue
    if (n > mejorN) {
      mejorN = n
      mejor = tipo
    }
  }
  return mejorN === -1 ? TIPOS.NULO : mejor
}

/*
  Fechas guardadas como número de serie de Excel. Solo se asume cuando el
  nombre de la columna lo sugiere Y los valores caen en el rango de fechas
  creíble: si no, un "Importe" de 45.000 € se convertiría en una fecha de 2023.
*/
function pareceFechaEnSerial(crudos, nombre) {
  if (!/fecha|date|d[ií]a|alta|baja|vencim|caduc|inicio|fin\b/i.test(nombre || '')) return false
  let enRango = 0
  let numeros = 0
  for (const v of crudos) {
    if (typeof v !== 'number') continue
    numeros++
    // ~1990-01-01 a ~2050-01-01 en serie de Excel
    if (v >= 32874 && v <= 54789 && Number.isInteger(v)) enRango++
  }
  return numeros > 0 && enRango / numeros > 0.9
}

function calcularEstadisticas(numeros) {
  const orden = [...numeros].sort((a, b) => a - b)
  const n = orden.length
  const suma = numeros.reduce((s, v) => s + v, 0)
  const media = suma / n
  const q1 = percentil(orden, 0.25)
  const q3 = percentil(orden, 0.75)
  const iqr = q3 - q1
  const varianza = numeros.reduce((s, v) => s + (v - media) ** 2, 0) / n

  // Outliers por el criterio de Tukey (1,5 × rango intercuartílico). Solo se
  // CUENTAN y se muestra un ejemplo: no se eliminan ni se corrigen datos.
  let outliers = 0
  let ejemplos = []
  if (iqr > 0) {
    const bajo = q1 - 1.5 * iqr
    const alto = q3 + 1.5 * iqr
    for (const v of numeros) {
      if (v < bajo || v > alto) {
        outliers++
        if (ejemplos.length < 5) ejemplos.push(v)
      }
    }
  }

  return {
    suma: redondear(suma, 4),
    min: orden[0],
    max: orden[n - 1],
    media: redondear(media, 4),
    mediana: percentil(orden, 0.5),
    desviacion: redondear(Math.sqrt(varianza), 4),
    q1,
    q3,
    enteros: numeros.every((v) => Number.isInteger(v)),
    negativos: numeros.filter((v) => v < 0).length,
    ceros: numeros.filter((v) => v === 0).length,
    outliers,
    ejemplosOutliers: ejemplos,
  }
}

function percentil(ordenados, p) {
  const n = ordenados.length
  if (!n) return null
  const pos = (n - 1) * p
  const bajo = Math.floor(pos)
  const alto = Math.ceil(pos)
  if (bajo === alto) return ordenados[bajo]
  return redondear(ordenados[bajo] + (pos - bajo) * (ordenados[alto] - ordenados[bajo]), 6)
}

function topFrecuencias(mapa, noNulos, limite = 10) {
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([valor, cuenta]) => ({
      valor,
      cuenta,
      porcentaje: noNulos ? redondear((cuenta / noNulos) * 100, 1) : 0,
    }))
}

// Solo interesan los valores escritos de más de una forma
function variantesConflictivas(mapa, limite = 12) {
  const salida = []
  for (const [clave, set] of mapa) {
    if (set.size > 1) salida.push({ clave, formas: [...set].slice(0, 6) })
    if (salida.length >= limite) break
  }
  return salida
}

function redondear(n, decimales) {
  if (n == null || !isFinite(n)) return n
  const f = 10 ** decimales
  return Math.round(n * f) / f
}

// Ojo con las abreviaturas españolas: "Nº", "N.º" y "Núm." son la forma más
// habitual de nombrar una columna de identificadores en un Excel de aquí.
const NOMBRE_ID = /(^|[\s_-])(id|ids|c[oó]digo|codigo|cod|ref|referencia|n[uú]mero|n[uú]m|num|nro|n[ºo°]|n\.[ºo°]|key|clave|matr[ií]cula|nif|cif|dni|iban|sku|ean|isbn)\.?([\s_-]|$)/i

/*
  ¿La columna es un identificador?

  Ojo con el falso positivo obvio: en una tabla de 5.000 ventas la columna
  "Importe" también es única al 94 %, y sumarla tiene sentido mientras que
  contarla no. Por eso a un número no le basta con ser único: tiene que
  parecer un código (entero, sin decimales) y llevar un nombre que lo diga,
  o formar una secuencia correlativa.
*/
function decidirIdentificador(perfil, nombre) {
  if (perfil.noNulos === 0) return false
  const casiUnico = perfil.porcentajeUnicos >= 95 || (perfil.cardinalidadAlta && perfil.porcentajeUnicos >= 90)
  if (!casiUnico) return false
  const nombreLoDice = NOMBRE_ID.test(nombre || '')

  // En una tabla de cuatro filas TODO es único, así que la unicidad sola no
  // prueba nada: con pocos datos hace falta que el nombre lo confirme.
  const suficientesFilas = perfil.noNulos >= 8

  if (perfil.tipo === TIPOS.TEXTO) {
    // Un código es corto; una descripción libre no lo es
    if (perfil.longitudMediaTexto > 40) return false
    if (nombreLoDice) return true
    return suficientesFilas && pareceCodigo(perfil.muestra)
  }

  if (perfil.tipo === TIPOS.NUMERO) {
    if (!perfil.enteros) return false // un importe con decimales no es un id
    if (perfil.negativos > 0) return false
    return nombreLoDice
  }

  return false
}

// Valores tipo "F-2026-014", "C1", "SKU-33": mezcla de letras y dígitos
function pareceCodigo(muestra) {
  const textos = muestra.filter((v) => typeof v === 'string')
  if (!textos.length) return false
  const conPinta = textos.filter((v) => /^[A-Za-z0-9][A-Za-z0-9_.\/-]*$/.test(v.trim()) && /\d/.test(v)).length
  return conPinta / textos.length > 0.8
}

/*
  ¿Se puede sumar/promediar? Una columna numérica que en realidad es un
  identificador o un año no es una métrica: sumar los años no significa nada.
*/
function decidirMetrica(perfil) {
  if (!esTipoNumerico(perfil.tipo)) return false
  if (perfil.esIdentificador) return false
  if (perfil.confianzaTipo < 0.7) return false
  // Constante: no aporta nada a un gráfico
  if (perfil.min === perfil.max) return false
  // Años disfrazados de número (1900-2100, enteros, poca variedad)
  if (perfil.enteros && perfil.min >= 1900 && perfil.max <= 2100 && perfil.unicos <= 60) return false
  return true
}

/*
  ¿Sirve para agrupar? Necesita repetir valores: si cada fila tiene el suyo,
  agrupar por ella da un grupo por fila y no cuenta nada.
*/
function decidirDimension(perfil) {
  if (perfil.noNulos === 0) return false
  if (perfil.esFecha) return true
  if (perfil.tipo === TIPOS.BOOLEANO) return true
  if (perfil.esIdentificador) return false
  if (perfil.tipo === TIPOS.TEXTO) {
    if (perfil.longitudMediaTexto > 60) return false // texto libre / notas
    if (perfil.unicos <= 1) return false
    return perfil.porcentajeUnicos <= 60 || perfil.unicos <= 30
  }
  // Numérica de muy poca variedad (un "Año", una talla, una valoración 1-5)
  if (esTipoNumerico(perfil.tipo)) return perfil.unicos > 1 && perfil.unicos <= 24
  return false
}
