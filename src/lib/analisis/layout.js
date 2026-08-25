import { SEMANTICA } from './semantica'
import {
  agruparPor,
  serieTemporal,
  histograma,
  pares,
  elegirGranularidad,
  contarDistintos,
} from './agregacion'
import { formatearNumero } from './formato'
import { generarInsights, elegirMetricaPrincipal } from './insights'
import { generarKpis } from './metricas'

/*
  SELECCIÓN DE VISUALIZACIONES Y LAYOUT.

  Aquí NO se pregunta "¿qué plantilla uso?", sino "¿qué información hay y cuál
  es la forma más clara de enseñarla?". Cada gráfico tiene que responder una
  pregunta concreta:

    ¿Cómo evoluciona?      → línea
    ¿Quién más / quién menos? → barras
    ¿Cómo se reparte el total? → donut, y solo con pocas categorías
    ¿Cómo se distribuyen?  → histograma
    ¿Se relacionan A y B?  → dispersión
    ¿Qué hay exactamente?  → tabla

  Y hay una regla igual de importante: no repetir. Cinco gráficos del mismo
  dato no informan más, informan menos. Se lleva registro de qué pares
  dimensión/métrica ya se han contado y no se vuelven a dibujar.

  La salida es una CONFIGURACIÓN (datos), no componentes. Quien pinta es la
  capa de interfaz.
*/

const S = SEMANTICA

// Un donut con 30 porciones es ilegible: por encima de esto se usan barras
const MAX_PORCIONES_DONUT = 6
const MAX_BARRAS = 8
const MAX_FILAS_TABLA = 8
const MIN_FILAS_DISPERSION = 20

/*
  Construye la configuración completa del dashboard.

  `modelos` = [modelo] (uno por tabla), `relaciones` = las detectadas.
  Devuelve la estructura del punto 19 de la especificación.
*/
export function generarConfiguracion(modelos, relaciones = []) {
  const utiles = modelos.filter((m) => m.filas > 0)
  if (!utiles.length) {
    return configuracionVacia()
  }

  // Los KPIs y los insights se calculan por tabla y se ponen en común
  const kpis = []
  const insights = []
  for (const modelo of utiles) {
    kpis.push(...generarKpis(modelo))
    insights.push(...generarInsights(modelo))
  }
  kpis.sort((a, b) => b.prioridad - a.prioridad || b.confianza - a.confianza)
  insights.sort((a, b) => b.importancia - a.importancia)

  const graficos = []
  for (const modelo of utiles) graficos.push(...graficosDeModelo(modelo))
  graficos.sort((a, b) => b.prioridad - a.prioridad)

  const filtros = generarFiltros(utiles)
  const { tipo, confianza: confianzaTipo, emoji } = deducirTipoDashboard(utiles)

  const problemas = utiles.flatMap((m) =>
    m.calidad.problemas.map((p) => ({ ...p, hoja: m.tabla.hoja }))
  )

  const configuracion = {
    version: 1,
    tipoDashboard: tipo,
    emoji,
    confianza: {
      tipoDashboard: confianzaTipo,
      // La confianza global se resiente si la interpretación de las columnas
      // es floja o si los datos vienen sucios.
      global: redondear(
        Math.min(
          media(utiles.flatMap((m) => m.campos.map((c) => c.confianza))) || 0.5,
          media(utiles.map((m) => m.calidad.puntuacion)) || 1
        )
      ),
    },
    fuentes: utiles.map((m) => ({
      id: m.tabla.id,
      hoja: m.tabla.hoja,
      titulo: m.tabla.titulo,
      filas: m.filas,
      columnas: m.campos.length,
    })),
    dimensiones: utiles.flatMap((m) =>
      m.dimensiones.map((d) => descripcionCampo(d, m))
    ),
    metricas: utiles.flatMap((m) => m.metricas.map((x) => descripcionCampo(x, m))),
    kpis: seleccionarKpis(kpis),
    graficos,
    filtros,
    insights: insights.slice(0, 6),
    calidad: {
      problemas,
      puntuacion: redondear(media(utiles.map((m) => m.calidad.puntuacion)) ?? 1),
    },
    relaciones,
  }

  configuracion.secciones = componerSecciones(configuracion, utiles)
  return configuracion
}

// --- Elección de gráficos ---------------------------------------------------

/*
  Decide qué gráficos merecen la pena para UNA tabla, evitando contar dos
  veces lo mismo.
*/
function graficosDeModelo(modelo) {
  const graficos = []
  const usados = new Set() // pares "dimensión|métrica" ya contados
  const metrica = elegirMetricaPrincipal(modelo)

  // --- 1. Evolución temporal: la pregunta principal cuando hay fechas
  const temporal = modelo.temporales[0]
  if (temporal) {
    const granularidad = elegirGranularidad(modelo.perfil, temporal.indice)
    if (granularidad) {
      const { puntos } = serieTemporal(modelo.perfil, temporal.indice, metrica ? metrica.indice : null, {
        granularidad,
        operacion: metrica ? 'suma' : 'cuenta',
      })
      // Con menos de 3 puntos una línea no cuenta una evolución
      if (puntos.length >= 3) {
        graficos.push({
          id: `${modelo.tabla.id}:evolucion`,
          tipo: 'linea',
          titulo: metrica
            ? `Evolución de ${etiquetaCorta(metrica)}`
            : `Evolución del número de registros`,
          pregunta: '¿Cómo evoluciona en el tiempo?',
          unidad: metrica?.unidad || null,
          datos: puntos.map((p) => ({ etiqueta: p.etiqueta, valor: p.valor, clave: p.clave })),
          prioridad: 100,
          confianza: Math.min(temporal.confianza, metrica?.confianza ?? 1),
          procedencia: {
            hoja: modelo.tabla.hoja,
            columnas: metrica ? [temporal.columna.nombre, metrica.columna.nombre] : [temporal.columna.nombre],
            formula: `${metrica ? `SUM(${metrica.columna.nombre})` : 'COUNT(filas)'} GROUP BY ${granularidad}(${temporal.columna.nombre})`,
          },
        })
        usados.add(`${temporal.columna.nombre}|${metrica?.columna.nombre ?? ''}`)
      }
    }
  }

  // --- 2. Reparto de un total. Va antes que las barras a propósito: para una
  // columna de pocas categorías (cobrado/pendiente) el donut responde mejor a
  // "cómo se reparte el total", así que se queda esa dimensión y las barras
  // la saltan en vez de dibujar el mismo dato dos veces.
  const paraDonut = modelo.dimensiones.find((d) => {
    if (![S.ESTADO, S.CATEGORIA, S.BOOLEANO].includes(d.semantica)) return false
    const distintos = contarDistintos(modelo.perfil, d.indice)
    return distintos >= 2 && distintos <= MAX_PORCIONES_DONUT
  })
  if (paraDonut) {
    const { grupos } = agruparPor(modelo.perfil, paraDonut.indice, metrica ? metrica.indice : null, {
      limite: MAX_PORCIONES_DONUT,
    })
    if (grupos.length >= 2) {
      graficos.push({
        id: `${modelo.tabla.id}:reparto:${paraDonut.columna.nombre}`,
        tipo: 'donut',
        titulo: `Reparto por ${paraDonut.columna.nombre.toLowerCase()}`,
        pregunta: '¿Cómo se reparte el total?',
        unidad: metrica?.unidad || null,
        datos: grupos,
        prioridad: 80,
        confianza: Math.min(paraDonut.confianza, metrica?.confianza ?? 1),
        procedencia: {
          hoja: modelo.tabla.hoja,
          columnas: metrica ? [paraDonut.columna.nombre, metrica.columna.nombre] : [paraDonut.columna.nombre],
          formula: `${metrica ? `SUM(${metrica.columna.nombre})` : 'COUNT(filas)'} GROUP BY ${paraDonut.columna.nombre}`,
        },
      })
      usados.add(`${paraDonut.columna.nombre}|${metrica?.columna.nombre ?? ''}`)
    }
  }

  // --- 3. Comparación entre categorías (ranking)
  // Para comparar valen tanto las dimensiones (agrupan) como las entidades
  // (no agrupan, pero se rankean: "el producto que más factura").
  const dimensionesOrdenadas = ordenarDimensiones([...modelo.dimensiones, ...modelo.entidades])
  for (const dim of dimensionesOrdenadas) {
    const clave = `${dim.columna.nombre}|${metrica?.columna.nombre ?? ''}`
    if (usados.has(clave)) continue

    const { grupos, totalGrupos } = agruparPor(modelo.perfil, dim.indice, metrica ? metrica.indice : null, {
      limite: MAX_BARRAS,
    })
    // Un solo grupo no compara nada
    if (grupos.length < 2) continue
    // Si todos los grupos valen lo mismo, el gráfico no dice nada
    if (grupos.every((g) => g.valor === grupos[0].valor)) continue

    graficos.push({
      id: `${modelo.tabla.id}:ranking:${dim.columna.nombre}`,
      tipo: 'barras',
      titulo: `${metrica ? capitalizar(etiquetaCorta(metrica)) : 'Registros'} por ${dim.columna.nombre.toLowerCase()}`,
      pregunta: '¿Cómo se comparan entre sí?',
      unidad: metrica?.unidad || null,
      datos: grupos,
      totalGrupos,
      prioridad: 90 - graficos.length * 5,
      confianza: Math.min(dim.confianza, metrica?.confianza ?? 1),
      procedencia: {
        hoja: modelo.tabla.hoja,
        columnas: metrica ? [dim.columna.nombre, metrica.columna.nombre] : [dim.columna.nombre],
        formula: `${metrica ? `SUM(${metrica.columna.nombre})` : 'COUNT(filas)'} GROUP BY ${dim.columna.nombre}`,
      },
    })
    usados.add(clave)

    if (graficos.length >= 4) break
  }

  // --- 4. Distribución: útil cuando hay muchas filas y una sola métrica clara
  if (metrica && modelo.filas >= 30) {
    const { intervalos, total } = histograma(modelo.perfil, metrica.indice)
    if (intervalos.length >= 3) {
      graficos.push({
        id: `${modelo.tabla.id}:distribucion`,
        tipo: 'histograma',
        titulo: `Distribución de ${etiquetaCorta(metrica)}`,
        pregunta: '¿Cómo se reparten los valores?',
        unidad: metrica.unidad,
        datos: intervalos.map((i) => ({ etiqueta: i.etiqueta, valor: i.cuenta })),
        prioridad: 45,
        confianza: metrica.confianza,
        procedencia: {
          hoja: modelo.tabla.hoja,
          columnas: [metrica.columna.nombre],
          formula: `COUNT(filas) por intervalos de ${metrica.columna.nombre} (${total} valores)`,
        },
      })
    }
  }

  // --- 5. Relación entre dos métricas
  if (modelo.metricas.length >= 2 && modelo.filas >= MIN_FILAS_DISPERSION) {
    const [x, y] = modelo.metricas
    const { puntos, total, muestreado } = pares(modelo.perfil, x.indice, y.indice)
    if (puntos.length >= MIN_FILAS_DISPERSION) {
      graficos.push({
        id: `${modelo.tabla.id}:relacion`,
        tipo: 'dispersion',
        titulo: `${capitalizar(etiquetaCorta(x))} frente a ${etiquetaCorta(y)}`,
        pregunta: '¿Se relacionan las dos magnitudes?',
        ejes: { x: x.columna.nombre, y: y.columna.nombre, unidadX: x.unidad, unidadY: y.unidad },
        datos: puntos,
        prioridad: 40,
        confianza: Math.min(x.confianza, y.confianza),
        nota: muestreado ? `Muestra de ${puntos.length} de ${total} registros.` : null,
        procedencia: {
          hoja: modelo.tabla.hoja,
          columnas: [x.columna.nombre, y.columna.nombre],
          formula: `Pares (${x.columna.nombre}, ${y.columna.nombre})`,
        },
      })
    }
  }

  // --- 6. Tabla de detalle: el ranking en cifras exactas
  const tabla = tablaDeDetalle(modelo, metrica)
  if (tabla) graficos.push(tabla)

  return graficos
}

/*
  Tabla con las filas más relevantes. Si hay una métrica, se ordena por ella;
  si no, se enseñan las primeras. Nunca se vuelcan tablas enteras.
*/
function tablaDeDetalle(modelo, metrica) {
  const { perfil, campos } = modelo
  // Columnas que aportan al detalle, en orden de utilidad
  const columnas = campos
    .filter((c) => !['ninguno'].includes(c.rol) || c.semantica === S.IDENTIFICADOR)
    .slice(0, 5)
  if (columnas.length < 2) return null

  const indices = columnas.map((c) => c.indice)
  let filas = perfil.filasNormalizadas.map((f, i) => ({ fila: f, i }))

  if (metrica) {
    filas = filas
      .filter((r) => typeof r.fila[metrica.indice] === 'number')
      .sort((a, b) => b.fila[metrica.indice] - a.fila[metrica.indice])
  }
  filas = filas.slice(0, MAX_FILAS_TABLA)
  if (!filas.length) return null

  return {
    id: `${modelo.tabla.id}:detalle`,
    tipo: 'tabla',
    titulo: metrica ? `Mayores por ${etiquetaCorta(metrica)}` : 'Detalle',
    pregunta: '¿Qué hay exactamente?',
    columnas: columnas.map((c) => c.columna.nombre),
    datos: filas.map((r) =>
      indices.map((j, k) => formatearCelda(r.fila[j], columnas[k]))
    ),
    prioridad: 30,
    confianza: media(columnas.map((c) => c.confianza)),
    procedencia: {
      hoja: modelo.tabla.hoja,
      columnas: columnas.map((c) => c.columna.nombre),
      formula: metrica
        ? `ORDER BY ${metrica.columna.nombre} DESC LIMIT ${MAX_FILAS_TABLA}`
        : `LIMIT ${MAX_FILAS_TABLA}`,
    },
  }
}

function formatearCelda(valor, campo) {
  if (valor === null || valor === undefined) return '—'
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (typeof valor === 'number') return formatearNumero(valor, campo.unidad)
  return String(valor)
}

// Las dimensiones que más dicen van primero
function ordenarDimensiones(dimensiones) {
  const peso = {
    [S.PERSONA]: 6,
    [S.ORGANIZACION]: 6,
    [S.PRODUCTO]: 5,
    [S.PROYECTO]: 5,
    [S.UBICACION]: 4,
    [S.CATEGORIA]: 3,
    [S.ESTADO]: 3,
    [S.BOOLEANO]: 1,
  }
  return [...dimensiones].sort(
    (a, b) => (peso[b.semantica] || 2) - (peso[a.semantica] || 2) || b.confianza - a.confianza
  )
}

// --- Filtros ----------------------------------------------------------------

/*
  Qué dimensiones merecen convertirse en filtro. Una columna con un solo
  valor no filtra nada, y una con 5.000 valores distintos es un desplegable
  inservible.
*/
function generarFiltros(modelos) {
  const filtros = []
  for (const modelo of modelos) {
    for (const dim of modelo.dimensiones) {
      const distintos = contarDistintos(modelo.perfil, dim.indice)
      if (distintos < 2 || distintos > 30) continue
      const { grupos } = agruparPor(modelo.perfil, dim.indice, null, { limite: 30, incluirOtros: false })
      filtros.push({
        id: `${modelo.tabla.id}:${dim.columna.nombre}`,
        tabla: modelo.tabla.id,
        hoja: modelo.tabla.hoja,
        columna: dim.columna.nombre,
        indice: dim.indice,
        tipo: 'categoria',
        etiqueta: dim.columna.nombre,
        opciones: grupos.map((g) => g.etiqueta),
      })
    }
    // Rango de fechas
    for (const temporal of modelo.temporales) {
      if (!temporal.columna.rangoFechas) continue
      filtros.push({
        id: `${modelo.tabla.id}:${temporal.columna.nombre}`,
        tabla: modelo.tabla.id,
        hoja: modelo.tabla.hoja,
        columna: temporal.columna.nombre,
        indice: temporal.indice,
        tipo: 'fecha',
        etiqueta: temporal.columna.nombre,
        desde: temporal.columna.rangoFechas.min,
        hasta: temporal.columna.rangoFechas.max,
      })
    }
  }
  return filtros.slice(0, 8)
}

// --- Tipo de dashboard ------------------------------------------------------

/*
  Deduce de qué va el Excel. Solo sirve para mejorar la interpretación y
  ponerle nombre al panel; si no está claro, se dice "Panel de datos" y no
  pasa nada. Nunca se usa para inventar información que no esté.
*/
function deducirTipoDashboard(modelos) {
  const semanticas = new Set(modelos.flatMap((m) => m.campos.map((c) => c.semantica)))
  const texto = modelos
    .map((m) => `${m.tabla.hoja} ${m.campos.map((c) => c.columna.nombre).join(' ')}`)
    .join(' ')
    .toLowerCase()

  const tiene = (...s) => s.every((x) => semanticas.has(x))

  const reglas = [
    [/inmueble|vivienda|piso|alquiler|inmobiliar/.test(texto), 'Cartera inmobiliaria', '🏠', 0.8],
    [/obra|reforma|construcc/.test(texto) && tiene(S.PROYECTO), 'Control de obras', '🚧', 0.8],
    [tiene(S.PROYECTO, S.PRESUPUESTO), 'Control de proyectos', '📋', 0.85],
    [tiene(S.INGRESO, S.COSTE), 'Panel financiero', '💶', 0.85],
    [/campa[nñ]a|marketing|lead|conversi/.test(texto), 'Panel de marketing', '📣', 0.75],
    [tiene(S.PRODUCTO, S.CANTIDAD) && /stock|inventario|almac/.test(texto), 'Control de inventario', '📦', 0.85],
    [tiene(S.PRODUCTO, S.CANTIDAD), 'Inventario', '📦', 0.6],
    [/n[oó]mina|salario|contrato|emplead|plantilla|rrhh/.test(texto), 'Panel de personal', '👥', 0.8],
    [(tiene(S.INGRESO) || tiene(S.IMPORTE)) && tiene(S.FECHA), 'Panel de ventas', '📈', 0.75],
    [tiene(S.IMPORTE), 'Panel de importes', '💶', 0.6],
    [tiene(S.PERSONA), 'Panel de clientes', '🧑‍💼', 0.6],
  ]

  for (const [condicion, tipo, emoji, confianza] of reglas) {
    if (condicion) return { tipo, emoji, confianza }
  }
  // Sin pistas suficientes: se sigue adelante igual, con un nombre neutro
  return { tipo: 'Panel de datos', emoji: '📊', confianza: 0.3 }
}

// --- Composición del layout -------------------------------------------------

/*
  Monta las secciones en el orden con el que se lee un panel: primero el
  titular, luego las cifras, luego la evolución, las comparaciones y el
  detalle. NO es obligatorio usarlas todas: un Excel de cuatro clientes
  genera un panel corto, y está bien que así sea.
*/
function componerSecciones(config, modelos) {
  const secciones = []
  const graficos = [...config.graficos]
  const tomar = (tipos, n = 99) => {
    const elegidos = []
    for (let i = 0; i < graficos.length && elegidos.length < n; ) {
      if (tipos.includes(graficos[i].tipo)) elegidos.push(graficos.splice(i, 1)[0])
      else i++
    }
    return elegidos
  }

  // 1. Resumen: las cifras que importan
  if (config.kpis.length) {
    secciones.push({
      id: 'cifras',
      titulo: 'Cifras clave',
      icono: config.emoji,
      descripcion: 'Las cifras principales que se pueden calcular con estos datos, con su fórmula.',
      widgets: [
        {
          tipo: 'tiles',
          items: config.kpis.map((k) => ({
            etiqueta: k.etiqueta,
            valor: k.valorFormateado,
            detalle: k.detalle || null,
            color: colorDeKpi(k),
            procedencia: k.procedencia,
          })),
        },
      ],
    })
  }

  // 2. Evolución (solo si hay datos temporales que la sostengan)
  const evolucion = tomar(['linea'], 2)
  if (evolucion.length) {
    secciones.push({
      id: 'evolucion',
      titulo: 'Evolución',
      icono: '📈',
      descripcion: 'Cómo cambian los datos a lo largo del tiempo.',
      widgets: evolucion.map(widgetDeGrafico),
    })
  }

  // 3. Comparaciones y reparto
  const comparativas = tomar(['barras', 'donut'], 4)
  if (comparativas.length) {
    secciones.push({
      id: 'comparativa',
      titulo: 'Comparativa',
      icono: '📊',
      descripcion: 'Quién destaca y cómo se reparte el total.',
      widgets: comparativas.map(widgetDeGrafico),
    })
  }

  // 4. Distribución y relaciones (solo con volumen suficiente)
  const analisis = tomar(['histograma', 'dispersion'], 2)
  if (analisis.length) {
    secciones.push({
      id: 'distribucion',
      titulo: 'Distribución',
      icono: '🔍',
      descripcion: 'Cómo se reparten los valores y si dos magnitudes van juntas.',
      widgets: analisis.map(widgetDeGrafico),
    })
  }

  // 5. Hallazgos: los patrones calculados sobre los datos
  if (config.insights.length) {
    secciones.push({
      id: 'hallazgos',
      titulo: 'Hallazgos',
      icono: '💡',
      descripcion: 'Patrones detectados calculando sobre los datos.',
      widgets: [
        {
          tipo: 'lista',
          titulo: null,
          items: config.insights.map((i) => ({
            texto: i.texto,
            detalle: i.titulo,
            procedencia: i.procedencia,
          })),
        },
      ],
    })
  }

  // 6. Detalle
  const detalle = tomar(['tabla'], 2)
  if (detalle.length) {
    secciones.push({
      id: 'detalle',
      titulo: 'Detalle',
      icono: '📄',
      descripcion: 'Los registros concretos que hay detrás de las cifras.',
      widgets: detalle.map(widgetDeGrafico),
    })
  }

  // 7. Calidad de los datos: solo si hay algo que contar
  const relevantes = config.calidad.problemas.filter((p) => p.gravedad !== 'baja')
  if (relevantes.length) {
    secciones.push({
      id: 'calidad',
      titulo: 'Calidad de los datos',
      icono: '⚠️',
      descripcion: 'Lo que conviene saber sobre el archivo antes de fiarse de las cifras.',
      widgets: [
        {
          tipo: 'lista',
          titulo: null,
          items: relevantes.slice(0, 8).map((p) => ({
            texto: p.mensaje,
            detalle: p.gravedad === 'alta' ? 'Afecta a los cálculos' : 'Aviso',
          })),
        },
      ],
    })
  }

  return secciones
}

// Traduce un gráfico de la configuración al widget que pinta la interfaz
function widgetDeGrafico(g) {
  const base = {
    titulo: g.titulo,
    unidad: g.unidad || null,
    pregunta: g.pregunta,
    procedencia: g.procedencia,
    nota: g.nota || null,
  }
  if (g.tipo === 'tabla') {
    return { ...base, tipo: 'tabla', columnas: g.columnas, filas: g.datos }
  }
  if (g.tipo === 'dispersion') {
    return { ...base, tipo: 'dispersion', ejes: g.ejes, puntos: g.datos }
  }
  return { ...base, tipo: g.tipo, datos: g.datos }
}

/*
  Los KPIs que se enseñan arriba. Se limita el número (una fila de doce cifras
  no se lee) y se evita repetir dos veces la misma información.
*/
function seleccionarKpis(kpis, maximo = 4) {
  const elegidos = []
  const columnasUsadas = new Set()

  for (const k of kpis) {
    if (elegidos.length >= maximo) break
    // No dos cifras construidas sobre exactamente las mismas columnas y la
    // misma operación (el total y la media de lo mismo sí conviven)
    const firma = `${k.tipo}:${(k.procedencia.columnas || []).join(',')}`
    if (columnasUsadas.has(firma)) continue
    columnasUsadas.add(firma)
    elegidos.push(k)
  }
  return elegidos
}

function colorDeKpi(k) {
  if (k.sentido === 'malo') return 'rojo'
  if (k.sentido === 'bueno') return 'verde'
  if (k.tipo === 'estado' && /pendiente/i.test(k.etiqueta)) return 'rojo'
  return null
}

function descripcionCampo(campo, modelo) {
  return {
    hoja: modelo.tabla.hoja,
    columna: campo.columna.nombre,
    semantica: campo.semantica,
    rol: campo.rol,
    unidad: campo.unidad,
    confianza: campo.confianza,
    conflicto: campo.conflicto,
  }
}

function configuracionVacia() {
  return {
    version: 1,
    tipoDashboard: 'Panel vacío',
    emoji: '📊',
    confianza: { global: 0, tipoDashboard: 0 },
    fuentes: [],
    dimensiones: [],
    metricas: [],
    kpis: [],
    graficos: [],
    filtros: [],
    insights: [],
    calidad: { problemas: [], puntuacion: 0 },
    relaciones: [],
    secciones: [],
  }
}

function etiquetaCorta(campo) {
  const mapa = {
    [S.INGRESO]: 'ingresos',
    [S.IMPORTE]: 'importe',
    [S.COSTE]: 'costes',
    [S.BENEFICIO]: 'beneficio',
    [S.PRESUPUESTO]: 'presupuesto',
    [S.PRECIO]: 'precio',
    [S.CANTIDAD]: 'cantidad',
    [S.DURACION]: 'tiempo',
  }
  return mapa[campo.semantica] || campo.columna.nombre.toLowerCase()
}

function capitalizar(t) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function media(lista) {
  const validos = lista.filter((n) => typeof n === 'number' && isFinite(n))
  if (!validos.length) return null
  return validos.reduce((s, n) => s + n, 0) / validos.length
}

function redondear(n) {
  if (n == null || !isFinite(n)) return n
  return Math.round(n * 100) / 100
}
