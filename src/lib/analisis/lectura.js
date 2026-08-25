import * as XLSX from 'xlsx'
import { esVacio, claveNormalizada, clasificarValor, TIPOS } from './tipos'

/*
  LECTURA INTELIGENTE del Excel: primera etapa del pipeline.

  El objetivo es sacar TABLAS de verdad, no volcar celdas. Un Excel real casi
  nunca es "fila 1 = cabeceras": trae títulos encima, filas en blanco, notas
  al pie, dos tablas en la misma hoja, celdas combinadas y una fila de TOTAL
  al final que, si se suma como si fuera un registro, duplica todas las cifras.

  Aquí NO se interpreta el significado de nada (eso es semantica.js): solo se
  averigua dónde empieza y acaba cada tabla y cómo se llaman sus columnas.

  El grueso del trabajo (`extraerTablas`) es una función pura sobre una matriz
  de celdas, para poder probarla sin fabricar ficheros binarios.
*/

// Tope de seguridad: por encima de esto el navegador sufre y el análisis no
// mejora. Se recortan filas avisando, nunca en silencio.
const MAX_FILAS = 200000

// Palabras con las que suele empezar una fila de totales al pie de una tabla
const PATRON_TOTAL = /^(total(es)?|suma|subtotal|sum|grand total|acumulado)\b/i

/*
  Lee un Excel/CSV completo y devuelve sus tablas.

  { hojas: [{ nombre, filas, columnas }], tablas: [Tabla], avisos: [] }

  Tabla = {
    id, hoja, indiceEnHoja, titulo,
    columnas: [{ nombre, nombreOriginal, indice }],
    filas: [ [celda, ...] ],   // valores CRUDOS, sin normalizar
    notas: [texto],            // filas de preámbulo (títulos, comentarios)
    avisos: [{ tipo, mensaje, ... }]
  }
*/
export function leerLibro(datos) {
  const libro = XLSX.read(datos instanceof Uint8Array ? datos : new Uint8Array(datos), {
    type: 'array',
    // Convierte las celdas con formato de fecha en objetos Date, para no tener
    // que adivinar después si un 45678 es un número o un 15/01/2025.
    cellDates: true,
    raw: true,
  })
  return libroATablas(libro)
}

// Igual que leerLibro pero partiendo de un libro ya abierto (para tests)
export function libroATablas(libro) {
  const tablas = []
  const hojas = []
  const avisos = []

  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja]
    if (!hoja) continue

    let matriz = XLSX.utils.sheet_to_json(hoja, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    })

    if (matriz.length > MAX_FILAS) {
      avisos.push({
        tipo: 'hoja-recortada',
        mensaje: `La hoja "${nombreHoja}" tiene ${matriz.length.toLocaleString('es-ES')} filas; se han analizado las primeras ${MAX_FILAS.toLocaleString('es-ES')}.`,
      })
      matriz = matriz.slice(0, MAX_FILAS)
    }

    // Las celdas combinadas dejan vacías todas menos la de arriba a la
    // izquierda. Se replica su valor por todo el rango para que una cabecera
    // combinada no se lea como una columna sin nombre.
    rellenarCombinadas(matriz, hoja['!merges'])

    hojas.push({ nombre: nombreHoja, filas: matriz.length, columnas: anchoDe(matriz) })

    for (const tabla of extraerTablas(matriz, nombreHoja)) {
      tablas.push({ ...tabla, id: `${nombreHoja}#${tabla.indiceEnHoja}` })
    }
  }

  return { hojas, tablas, avisos }
}

function anchoDe(matriz) {
  return matriz.reduce((max, fila) => Math.max(max, fila?.length || 0), 0)
}

// Replica el valor de cada celda combinada por todo su rango
function rellenarCombinadas(matriz, merges) {
  if (!Array.isArray(merges)) return
  for (const m of merges) {
    const valor = matriz[m.s.r]?.[m.s.c]
    if (esVacio(valor)) continue
    for (let f = m.s.r; f <= m.e.r; f++) {
      if (!matriz[f]) matriz[f] = []
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (esVacio(matriz[f][c])) matriz[f][c] = valor
      }
    }
  }
}

/*
  Parte una matriz de celdas en las tablas que contenga.

  Primero corta en bandas horizontales (separadas por filas vacías) y luego
  cada banda en bandas verticales (separadas por columnas vacías), lo que
  permite detectar dos tablas puestas una al lado de la otra.
*/
export function extraerTablas(matriz, nombreHoja = 'Hoja1') {
  const ancho = anchoDe(matriz)
  if (!ancho) return []

  const tablas = []
  // Los bloques que no llegan a ser una tabla (el título del informe, una
  // nota suelta) no se tiran: se guardan y se cuelgan de la siguiente tabla
  // de verdad como contexto.
  let notasPendientes = []

  for (const banda of bandasDeFilas(matriz, ancho)) {
    for (const bloque of bandasDeColumnas(matriz, banda, ancho)) {
      if (!pareceTabla(bloque)) {
        notasPendientes.push(...textoDeBloque(matriz, bloque))
        continue
      }
      const tabla = construirTabla(matriz, bloque, nombreHoja, tablas.length)
      if (!tabla) {
        notasPendientes.push(...textoDeBloque(matriz, bloque))
        continue
      }
      tabla.notas = [...notasPendientes, ...tabla.notas]
      tabla.titulo = tabla.notas[0] || nombreHoja
      notasPendientes = []
      tablas.push(tabla)
    }
  }
  return tablas
}

/*
  ¿Este bloque es una tabla o es texto suelto? Un título de informe queda
  aislado por la fila en blanco que lleva debajo y, si no se filtra, aparece
  como una "tabla" de una columna y dos filas.
*/
function pareceTabla(bloque) {
  const { filas, columnas } = bloque
  if (columnas.length >= 2) return filas.length >= 2
  // Una sola columna solo cuenta como tabla si es una lista de verdad
  return filas.length >= 4
}

// Vuelca un bloque a líneas de texto legibles (para usarlas como notas)
function textoDeBloque(matriz, bloque) {
  return bloque.filas
    .map((f) =>
      bloque.columnas
        .map((c) => matriz[f]?.[c])
        .filter((v) => !esVacio(v))
        .map((v) => String(v).trim())
        .join(' · ')
    )
    .filter(Boolean)
}

// Índices de filas agrupados en bandas separadas por filas completamente vacías
function bandasDeFilas(matriz, ancho) {
  const bandas = []
  let actual = []
  for (let f = 0; f < matriz.length; f++) {
    const vacia = filaVacia(matriz[f], ancho)
    if (vacia) {
      if (actual.length) bandas.push(actual)
      actual = []
    } else {
      actual.push(f)
    }
  }
  if (actual.length) bandas.push(actual)
  // Una sola fila suelta no es una tabla (suele ser un título o una nota)
  return bandas.filter((b) => b.length >= 2)
}

// Dentro de una banda de filas, agrupa columnas separadas por columnas vacías
function bandasDeColumnas(matriz, filas, ancho) {
  const usadas = []
  for (let c = 0; c < ancho; c++) {
    if (filas.some((f) => !esVacio(matriz[f]?.[c]))) usadas.push(c)
  }
  if (!usadas.length) return []

  const grupos = []
  let actual = [usadas[0]]
  for (let i = 1; i < usadas.length; i++) {
    // Dos o más columnas vacías seguidas separan tablas distintas; una sola
    // suele ser una columna de adorno dentro de la misma tabla.
    if (usadas[i] - usadas[i - 1] > 2) {
      grupos.push(actual)
      actual = []
    }
    actual.push(usadas[i])
  }
  grupos.push(actual)
  return grupos.filter((g) => g.length >= 1).map((columnas) => ({ filas, columnas }))
}

function filaVacia(fila, ancho) {
  if (!fila) return true
  for (let c = 0; c < ancho; c++) if (!esVacio(fila[c])) return false
  return true
}

/*
  Con un bloque ya acotado, decide dónde está la cabecera, qué filas son
  datos y qué hay de sobra (títulos arriba, fila de totales abajo).
*/
function construirTabla(matriz, bloque, nombreHoja, indiceEnHoja) {
  const { filas, columnas } = bloque
  const avisos = []

  const { indice: filaCabecera, confianza } = detectarFilaCabecera(matriz, filas, columnas)

  // Todo lo que quede por encima de la cabecera es preámbulo: títulos del
  // informe, fechas de emisión, notas… Se guarda como contexto (le sirve a la
  // IA para titular el apartado) pero no son datos.
  const notas = []
  const posCabecera = filaCabecera == null ? -1 : filas.indexOf(filaCabecera)
  for (let i = 0; i < (posCabecera === -1 ? 0 : posCabecera); i++) {
    const texto = columnas
      .map((c) => matriz[filas[i]]?.[c])
      .filter((v) => !esVacio(v))
      .map((v) => String(v).trim())
      .join(' · ')
    if (texto) notas.push(texto)
  }

  let filasDatos = posCabecera === -1 ? filas.slice() : filas.slice(posCabecera + 1)
  if (!filasDatos.length) return null

  // Fila de TOTAL al pie: es el error clásico que duplica todas las sumas.
  // Se excluye de los datos y se deja constancia.
  const ultima = filasDatos[filasDatos.length - 1]
  if (esFilaDeTotales(matriz, ultima, filasDatos.slice(0, -1), columnas)) {
    filasDatos = filasDatos.slice(0, -1)
    avisos.push({
      tipo: 'fila-totales',
      mensaje: 'Se ha detectado una fila de totales al final de la tabla y se ha excluido del análisis para no duplicar las sumas.',
    })
  }
  if (!filasDatos.length) return null

  // Nombres de columna: los de la cabecera, o generados si no había
  const nombresCrudos = columnas.map((c, i) => {
    const bruto = filaCabecera == null ? null : matriz[filaCabecera]?.[c]
    return esVacio(bruto) ? `Columna ${i + 1}` : String(bruto).trim().replace(/\s+/g, ' ')
  })
  const nombres = deduplicarNombres(nombresCrudos, avisos)

  const columnasTabla = columnas.map((c, i) => ({
    nombre: nombres[i],
    nombreOriginal: nombresCrudos[i],
    indice: c,
  }))

  // Se descartan las columnas sin ningún dato bajo la cabecera
  const conDatos = columnasTabla.filter((col) =>
    filasDatos.some((f) => !esVacio(matriz[f]?.[col.indice]))
  )
  if (conDatos.length < columnasTabla.length) {
    avisos.push({
      tipo: 'columnas-vacias',
      mensaje: `Se han ignorado ${columnasTabla.length - conDatos.length} columna(s) sin ningún dato.`,
    })
  }
  if (!conDatos.length) return null

  const datos = filasDatos.map((f) => conDatos.map((col) => matriz[f]?.[col.indice] ?? null))

  if (filaCabecera == null) {
    avisos.push({
      tipo: 'sin-cabecera',
      mensaje: 'No se ha reconocido una fila de cabeceras; las columnas se han numerado automáticamente.',
    })
  }

  return {
    hoja: nombreHoja,
    indiceEnHoja,
    titulo: notas[0] || nombreHoja,
    columnas: conDatos.map((c, i) => ({ ...c, posicion: i })),
    filas: datos,
    notas,
    confianzaCabecera: confianza,
    avisos,
  }
}

/*
  Busca la fila de cabeceras. NO se asume que sea la primera.

  Se puntúa cada fila candidata por lo bien que se comporta como cabecera:
  completa, de texto, sin repetidos y —lo que más pesa— distinta en tipo de
  lo que viene debajo. Una fila de texto encima de una columna de números es
  casi con seguridad su cabecera.
*/
export function detectarFilaCabecera(matriz, filas, columnas) {
  const limite = Math.min(filas.length - 1, 15)
  let mejor = null
  let mejorPuntos = 0

  for (let i = 0; i < limite; i++) {
    const f = filas[i]
    const celdas = columnas.map((c) => matriz[f]?.[c])
    const debajo = filas.slice(i + 1, i + 21)

    const noVacias = celdas.filter((v) => !esVacio(v))
    if (noVacias.length < Math.max(2, Math.ceil(columnas.length * 0.5))) continue

    const completa = noVacias.length / columnas.length
    const textos = noVacias.filter((v) => clasificarValor(v).tipo === TIPOS.TEXTO).length / noVacias.length
    const unicos = new Set(noVacias.map((v) => claveNormalizada(v))).size / noVacias.length

    // Una cabecera es texto casi por definición. Si media fila son cifras o
    // fechas, son datos: preferimos numerar las columnas antes que ascender
    // la primera fila de datos a cabecera y perderla para siempre.
    if (textos < 0.6) continue

    // Contraste con los datos: por cada columna, ¿la cabecera es texto y lo de
    // debajo no lo es? Es la señal más fiable de todas.
    let contraste = 0
    let evaluadas = 0
    for (let ci = 0; ci < columnas.length; ci++) {
      const valores = debajo.map((ff) => matriz[ff]?.[columnas[ci]]).filter((v) => !esVacio(v))
      if (!valores.length) continue
      evaluadas++
      const noTexto = valores.filter((v) => clasificarValor(v).tipo !== TIPOS.TEXTO).length / valores.length
      const cabeceraTexto = !esVacio(celdas[ci]) && clasificarValor(celdas[ci]).tipo === TIPOS.TEXTO
      if (cabeceraTexto && noTexto > 0.6) contraste++
    }
    contraste = evaluadas ? contraste / evaluadas : 0

    // Penaliza bajar mucho: si dos filas empatan, gana la de más arriba
    const puntos = completa * 0.3 + textos * 0.25 + unicos * 0.2 + contraste * 0.35 - i * 0.02

    if (puntos > mejorPuntos) {
      mejorPuntos = puntos
      mejor = f
    }
  }

  // Por debajo del umbral preferimos declarar "no hay cabecera" y numerar las
  // columnas antes que ascender una fila de datos a cabecera y perderla.
  if (mejorPuntos < 0.55) return { indice: null, confianza: 0 }
  return { indice: mejor, confianza: Math.min(1, mejorPuntos) }
}

/*
  ¿La última fila es un pie de totales?

  Fiarse solo de la palabra "Total" borra clientes que se llaman "Total
  Reformas SL". Por eso hay dos vías, y hace falta la etiqueta MÁS una de las
  dos confirmaciones:
   - la etiqueta es exactamente "Total" / "Totales" / "Suma"…, o
   - alguna de sus cifras COINCIDE con la suma de esa columna en las filas de
     arriba, que es la prueba de verdad de que es un total.
*/
function esFilaDeTotales(matriz, indiceFila, filasPrevias, columnas) {
  const fila = matriz[indiceFila]
  if (!fila || !filasPrevias.length) return false

  const valores = columnas.map((c) => fila[c])
  const etiqueta = valores.find((v) => !esVacio(v))
  if (etiqueta == null) return false
  const texto = String(etiqueta).trim()
  if (!PATRON_TOTAL.test(texto)) return false

  // Vía rápida: la celda es solo la palabra ("TOTAL", "Total:", "Totales")
  if (/^(total(es)?|suma|subtotal|sum|acumulado)\s*[:.]?$/i.test(texto)) return true

  // Vía de comprobación: ¿alguna cifra cuadra con la suma de su columna?
  for (let ci = 0; ci < columnas.length; ci++) {
    const celda = clasificarValor(valores[ci])
    if (!esNumerica(celda.tipo)) continue
    let suma = 0
    let cuenta = 0
    for (const f of filasPrevias) {
      const v = clasificarValor(matriz[f]?.[columnas[ci]])
      if (esNumerica(v.tipo)) {
        suma += v.valor
        cuenta++
      }
    }
    if (!cuenta) continue
    const tolerancia = Math.max(Math.abs(suma) * 1e-6, 0.01)
    if (Math.abs(suma - celda.valor) <= tolerancia) return true
  }
  return false
}

function esNumerica(tipo) {
  return tipo === TIPOS.NUMERO || tipo === TIPOS.MONEDA || tipo === TIPOS.PORCENTAJE
}

// Evita columnas con el mismo nombre: "Importe", "Importe (2)"…
function deduplicarNombres(nombres, avisos) {
  const vistos = new Map()
  const salida = []
  let repetidas = 0
  for (const n of nombres) {
    const clave = claveNormalizada(n)
    if (vistos.has(clave)) {
      const num = vistos.get(clave) + 1
      vistos.set(clave, num)
      salida.push(`${n} (${num})`)
      repetidas++
    } else {
      vistos.set(clave, 1)
      salida.push(n)
    }
  }
  if (repetidas) {
    avisos.push({
      tipo: 'columnas-duplicadas',
      mensaje: `Hay ${repetidas} columna(s) con el mismo nombre; se han renombrado para poder distinguirlas.`,
    })
  }
  return salida
}
