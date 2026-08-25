import { claveNormalizada } from './tipos'

/*
  MOTOR DE AGREGACIÓN.

  Este módulo es el que hace que las cifras del dashboard sean ciertas.

  Hasta ahora el panel le mandaba al modelo una muestra de 25 filas y le pedía
  los totales; con 5.000 ventas, el "total facturado" era una estimación sobre
  el 0,5 % de los datos. Aquí se calcula en local y sobre TODAS las filas, y
  el modelo solo decide qué se enseña y cómo se titula.

  Todas las funciones trabajan sobre la capa normalizada del perfilado, de
  modo que "1.200 €", "1200" y "1.200,00" cuentan como el mismo número y
  "Madrid" y "madrid" caen en el mismo grupo.
*/

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// --- Totales de una columna -------------------------------------------------

/*
  Agrega una columna numérica entera. Devuelve
  { suma, cuenta, media, min, max } contando solo los valores válidos.
*/
export function totales(perfil, indiceMetrica) {
  let suma = 0
  let cuenta = 0
  let min = null
  let max = null
  for (const fila of perfil.filasNormalizadas) {
    const v = fila[indiceMetrica]
    if (typeof v !== 'number' || !isFinite(v)) continue
    suma += v
    cuenta++
    if (min === null || v < min) min = v
    if (max === null || v > max) max = v
  }
  return {
    suma: redondear(suma),
    cuenta,
    media: cuenta ? redondear(suma / cuenta) : null,
    min,
    max,
  }
}

// Número de valores distintos de una columna (clientes únicos, productos…)
export function contarDistintos(perfil, indice) {
  const set = new Set()
  for (const fila of perfil.filasNormalizadas) {
    const v = fila[indice]
    if (v === null || v === undefined || v === '') continue
    set.add(typeof v === 'string' ? claveNormalizada(v) : v)
  }
  return set.size
}

// --- Agrupaciones -----------------------------------------------------------

/*
  Agrupa por una dimensión y agrega una métrica.

  - indiceMetrica null → cuenta registros (es lo correcto cuando no hay
    ninguna cifra que sumar: "clientes por ciudad").
  - operacion: 'suma' | 'media' | 'cuenta' | 'min' | 'max'
  - limite: se devuelven los N primeros y, si sobran grupos, se agrupa el
    resto en "Otros" para no dibujar un gráfico ilegible.

  Devuelve { grupos: [{ etiqueta, valor, cuenta }], totalGrupos, hayOtros }
*/
export function agruparPor(perfil, indiceDimension, indiceMetrica = null, opciones = {}) {
  const { operacion = indiceMetrica === null ? 'cuenta' : 'suma', limite = 10, incluirOtros = true } = opciones

  const mapa = new Map()

  for (const fila of perfil.filasNormalizadas) {
    const bruto = fila[indiceDimension]
    if (bruto === null || bruto === undefined || bruto === '') continue

    const clave = typeof bruto === 'string' ? claveNormalizada(bruto) : bruto
    let grupo = mapa.get(clave)
    if (!grupo) {
      grupo = { clave, suma: 0, cuenta: 0, min: null, max: null, formas: new Map() }
      mapa.set(clave, grupo)
    }

    // Se guarda cómo estaba escrito para poder enseñar la forma más habitual
    // en vez de la clave interna en minúsculas.
    if (typeof bruto === 'string') {
      grupo.formas.set(bruto, (grupo.formas.get(bruto) || 0) + 1)
    }

    grupo.cuenta++
    if (indiceMetrica !== null) {
      const v = fila[indiceMetrica]
      if (typeof v === 'number' && isFinite(v)) {
        grupo.suma += v
        grupo.valores = (grupo.valores || 0) + 1
        if (grupo.min === null || v < grupo.min) grupo.min = v
        if (grupo.max === null || v > grupo.max) grupo.max = v
      }
    }
  }

  let grupos = [...mapa.values()].map((g) => ({
    etiqueta: etiquetaDeGrupo(g),
    valor: valorDeGrupo(g, operacion),
    cuenta: g.cuenta,
  }))

  // Una media sin ningún valor válido no es 0: es "no se puede calcular"
  grupos = grupos.filter((g) => g.valor !== null)

  const totalGrupos = grupos.length
  grupos.sort((a, b) => b.valor - a.valor)

  let hayOtros = false
  if (totalGrupos > limite) {
    const visibles = grupos.slice(0, limite)
    const resto = grupos.slice(limite)
    // Agrupar el resto solo tiene sentido si la operación es aditiva: la
    // media o el máximo de "Otros" no significarían nada.
    if (incluirOtros && (operacion === 'suma' || operacion === 'cuenta')) {
      visibles.push({
        etiqueta: 'Otros',
        valor: redondear(resto.reduce((s, g) => s + g.valor, 0)),
        cuenta: resto.reduce((s, g) => s + g.cuenta, 0),
        esOtros: true,
      })
      hayOtros = true
    }
    grupos = visibles
  }

  return { grupos, totalGrupos, hayOtros }
}

function etiquetaDeGrupo(g) {
  if (g.formas.size) {
    // La escritura más repetida gana ("Madrid" antes que "madrid")
    let mejor = null
    let mejorN = -1
    for (const [forma, n] of g.formas) {
      if (n > mejorN) {
        mejorN = n
        mejor = forma
      }
    }
    return mejor
  }
  if (typeof g.clave === 'boolean') return g.clave ? 'Sí' : 'No'
  return String(g.clave)
}

function valorDeGrupo(g, operacion) {
  switch (operacion) {
    case 'cuenta':
      return g.cuenta
    case 'media':
      return g.valores ? redondear(g.suma / g.valores) : null
    case 'min':
      return g.min
    case 'max':
      return g.max
    case 'suma':
    default:
      return g.valores ? redondear(g.suma) : null
  }
}

// --- Dimensiones temporales derivadas --------------------------------------

/*
  De una fecha ISO se derivan año, trimestre, mes, semana y día, que es lo que
  permite preguntar "¿cómo ha ido cada mes?" aunque el Excel solo traiga la
  fecha exacta de cada venta.
*/
export function derivarTiempo(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const anio = +iso.slice(0, 4)
  const mes = +iso.slice(5, 7)
  const dia = +iso.slice(8, 10)
  if (!anio || !mes || !dia) return null
  return {
    anio: String(anio),
    trimestre: `${anio}-T${Math.ceil(mes / 3)}`,
    mes: `${anio}-${String(mes).padStart(2, '0')}`,
    semana: semanaIso(anio, mes, dia),
    dia: iso,
  }
}

// Semana ISO 8601 (la que empieza en lunes), en formato AAAA-Wnn
function semanaIso(anio, mes, dia) {
  const d = new Date(Date.UTC(anio, mes - 1, dia))
  // Jueves de esa semana: define a qué año ISO pertenece
  const diaSemana = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - diaSemana + 3)
  const anioIso = d.getUTCFullYear()
  const primerJueves = new Date(Date.UTC(anioIso, 0, 4))
  const desplazamiento = (primerJueves.getUTCDay() + 6) % 7
  primerJueves.setUTCDate(primerJueves.getUTCDate() - desplazamiento + 3)
  const semana = 1 + Math.round((d - primerJueves) / (7 * 86400000))
  return `${anioIso}-W${String(semana).padStart(2, '0')}`
}

/*
  Elige la granularidad temporal según el periodo que cubren los datos: un
  año de ventas se lee por meses, una semana se lee por días.
*/
export function granularidadRecomendada(rangoFechas) {
  if (!rangoFechas?.min || !rangoFechas?.max) return null
  const dias = (Date.parse(rangoFechas.max) - Date.parse(rangoFechas.min)) / 86400000
  if (!isFinite(dias)) return null
  if (dias <= 1) return null // todo el mismo día: no hay evolución que contar
  if (dias <= 31) return 'dia'
  if (dias <= 120) return 'semana'
  if (dias <= 1100) return 'mes'
  return 'trimestre'
}

const ESCALAS = ['dia', 'semana', 'mes', 'trimestre', 'anio']

/*
  Elige la granularidad mirando los DATOS, no solo el rango.

  El rango por sí solo engaña: cuatro registros mensuales repartidos en tres
  meses caen dentro de "hasta 120 días" y se agruparían por semana, dejando
  una serie con nueve semanas vacías y cuatro con un punto suelto. Aquí se
  prueba cada escala y se elige la más fina que salga DENSA, es decir, en la
  que casi todos los periodos del rango tengan datos.
*/
export function elegirGranularidad(perfil, indiceFecha) {
  const fechas = []
  for (const fila of perfil.filasNormalizadas) {
    const v = fila[indiceFecha]
    if (typeof v === 'string' && v.length >= 10) fechas.push(v)
  }
  if (fechas.length < 2) return null

  const min = fechas.reduce((a, b) => (b < a ? b : a))
  const max = fechas.reduce((a, b) => (b > a ? b : a))
  if (min === max) return null

  for (const escala of ESCALAS) {
    const ocupados = new Set()
    for (const iso of fechas) {
      const partes = derivarTiempo(iso)
      if (partes) ocupados.add(partes[escala])
    }
    if (ocupados.size < 3) continue // con menos de 3 puntos no hay serie
    const total = periodosEnRango(min, max, escala)
    // Densidad: qué parte de los periodos del rango tienen algún dato
    if (total > 0 && ocupados.size / total >= 0.6 && ocupados.size <= 30) return escala
  }

  // Ninguna escala sale densa: se vuelve al criterio por rango, que al menos
  // acota el número de puntos.
  return granularidadRecomendada({ min, max })
}

// Cuántos periodos de esa escala abarca el rango (haya datos o no)
function periodosEnRango(min, max, escala) {
  const a = new Date(`${min}T00:00:00Z`)
  const b = new Date(`${max}T00:00:00Z`)
  const dias = Math.round((b - a) / 86400000)
  switch (escala) {
    case 'dia':
      return dias + 1
    case 'semana':
      return Math.floor(dias / 7) + 1
    case 'mes':
      return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1
    case 'trimestre':
      return (
        (b.getUTCFullYear() - a.getUTCFullYear()) * 4 +
        (Math.floor(b.getUTCMonth() / 3) - Math.floor(a.getUTCMonth() / 3)) +
        1
      )
    case 'anio':
      return b.getUTCFullYear() - a.getUTCFullYear() + 1
    default:
      return 0
  }
}

/*
  Serie temporal: agrega una métrica por periodo, EN ORDEN CRONOLÓGICO
  (a diferencia de agruparPor, que ordena por valor).

  Devuelve { puntos: [{ clave, etiqueta, valor, cuenta }], granularidad }
*/
export function serieTemporal(perfil, indiceFecha, indiceMetrica = null, opciones = {}) {
  const { granularidad = 'mes', operacion = indiceMetrica === null ? 'cuenta' : 'suma' } = opciones
  const mapa = new Map()

  for (const fila of perfil.filasNormalizadas) {
    const partes = derivarTiempo(fila[indiceFecha])
    if (!partes) continue
    const clave = partes[granularidad]
    if (!clave) continue

    let punto = mapa.get(clave)
    if (!punto) {
      punto = { clave, suma: 0, cuenta: 0, valores: 0, min: null, max: null, formas: new Map() }
      mapa.set(clave, punto)
    }
    punto.cuenta++
    if (indiceMetrica !== null) {
      const v = fila[indiceMetrica]
      if (typeof v === 'number' && isFinite(v)) {
        punto.suma += v
        punto.valores++
        if (punto.min === null || v < punto.min) punto.min = v
        if (punto.max === null || v > punto.max) punto.max = v
      }
    }
  }

  const puntos = [...mapa.values()]
    .sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0))
    .map((p) => ({
      clave: p.clave,
      etiqueta: etiquetaDePeriodo(p.clave, granularidad),
      valor: valorDeGrupo(p, operacion),
      cuenta: p.cuenta,
    }))
    .filter((p) => p.valor !== null)

  return { puntos, granularidad }
}

// "2025-03" → "Mar 25"; "2025-T1" → "T1 25"; "2025-W11" → "Sem 11"
export function etiquetaDePeriodo(clave, granularidad) {
  if (granularidad === 'anio') return clave
  if (granularidad === 'trimestre') {
    const [anio, t] = clave.split('-')
    return `${t} ${anio.slice(2)}`
  }
  if (granularidad === 'semana') {
    const [, semana] = clave.split('-W')
    return `Sem ${Number(semana)}`
  }
  if (granularidad === 'mes') {
    const [anio, mes] = clave.split('-')
    return `${MESES_CORTOS[Number(mes) - 1] || mes} ${anio.slice(2)}`
  }
  // día
  const [anio, mes, dia] = clave.split('-')
  return `${Number(dia)} ${MESES_CORTOS[Number(mes) - 1] || mes}`
}

// --- Distribución y relación entre métricas --------------------------------

/*
  Reparte una columna numérica en intervalos para ver CÓMO se distribuye
  (no cuánto suma): responde a "¿la mayoría de mis ventas son pequeñas?".

  Devuelve { intervalos: [{ etiqueta, desde, hasta, cuenta }], total }
*/
export function histograma(perfil, indiceMetrica, opciones = {}) {
  const { intervalos: numIntervalos = 8 } = opciones
  const valores = []
  for (const fila of perfil.filasNormalizadas) {
    const v = fila[indiceMetrica]
    if (typeof v === 'number' && isFinite(v)) valores.push(v)
  }
  if (valores.length < 2) return { intervalos: [], total: 0 }

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  // Todos los valores iguales: no hay distribución que dibujar
  if (min === max) return { intervalos: [], total: valores.length }

  const ancho = (max - min) / numIntervalos
  const cubos = Array.from({ length: numIntervalos }, (_, i) => ({
    desde: min + i * ancho,
    hasta: min + (i + 1) * ancho,
    cuenta: 0,
  }))

  for (const v of valores) {
    // El último intervalo incluye el máximo, para que no se quede fuera
    const i = Math.min(numIntervalos - 1, Math.floor((v - min) / ancho))
    cubos[i].cuenta++
  }

  return {
    intervalos: cubos.map((c) => ({
      ...c,
      desde: redondear(c.desde),
      hasta: redondear(c.hasta),
      etiqueta: `${formatoCorto(c.desde)}–${formatoCorto(c.hasta)}`,
    })),
    total: valores.length,
  }
}

/*
  Pares (x, y) de dos métricas para un gráfico de dispersión. Se limita el
  número de puntos: dibujar 50.000 puntos no se lee mejor y bloquea el
  navegador, así que se toma una muestra repartida por todo el conjunto.
*/
export function pares(perfil, indiceX, indiceY, opciones = {}) {
  const { maximo = 400 } = opciones
  const todos = []
  for (const fila of perfil.filasNormalizadas) {
    const x = fila[indiceX]
    const y = fila[indiceY]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (!isFinite(x) || !isFinite(y)) continue
    todos.push({ x, y })
  }
  if (todos.length <= maximo) return { puntos: todos, total: todos.length, muestreado: false }

  // Muestreo regular (uno de cada N), no los primeros N: así la nube sigue
  // representando todo el rango de datos y no solo el principio del fichero.
  const paso = todos.length / maximo
  const puntos = []
  for (let i = 0; i < maximo; i++) puntos.push(todos[Math.floor(i * paso)])
  return { puntos, total: todos.length, muestreado: true }
}

function formatoCorto(n) {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${redondear(n / 1e6)}M`
  if (abs >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n * 100) / 100)
}

// Evita arrastrar la basura decimal del coma flotante en las sumas
function redondear(n) {
  if (n == null || !isFinite(n)) return n
  return Math.round(n * 1e6) / 1e6
}
