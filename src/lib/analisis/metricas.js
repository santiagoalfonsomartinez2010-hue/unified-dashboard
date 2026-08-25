import { SEMANTICA, clasificarEstado } from './semantica'
import { totales, contarDistintos, agruparPor, serieTemporal, granularidadRecomendada, etiquetaDePeriodo } from './agregacion'
import { formatearNumero, formatearVariacion } from './formato'

/*
  GENERACIÓN DE KPIs Y MÉTRICAS DERIVADAS.

  Dos reglas que vienen de la especificación y que aquí se cumplen a rajatabla:

   1. Un KPI solo existe si se puede CALCULAR con los datos que hay. No hay
      una lista fija de cuatro cifras que rellenar: si el Excel no tiene
      importes, no habrá "ingresos totales", habrá recuentos. Nunca se inventa.

   2. Todo KPI lleva su PROCEDENCIA (hoja, columnas y fórmula), para que el
      usuario pueda comprobar de dónde sale cada número.

  Cada KPI incluye además `confianza`, heredada de lo segura que sea la
  interpretación de las columnas que intervienen. Con confianza baja el
  layout lo relegará o lo descartará.
*/

const S = SEMANTICA

// Semánticas que representan dinero (se pueden restar entre sí)
const MONETARIAS = [S.IMPORTE, S.INGRESO, S.COSTE, S.PRECIO, S.PRESUPUESTO, S.BENEFICIO]
// Semánticas que nombran "de quién/de qué" es cada fila
const ENTIDADES = [S.PERSONA, S.ORGANIZACION, S.PRODUCTO, S.PROYECTO, S.UBICACION]

// Por debajo de esta confianza una columna no sostiene una cifra destacada
const CONFIANZA_MINIMA = 0.5

/*
  Genera los KPIs posibles de UNA tabla.

  `contexto` = { tabla, perfil, campos, calidad, noFiables }
    - campos: [{ columna, indice, semantica, confianza, rol, unidad }]
  Devuelve una lista de KPIs ordenada por prioridad (mayor primero).
*/
export function generarKpis(contexto) {
  const kpis = []
  const { tabla, perfil, campos } = contexto
  const filas = perfil.filas
  if (!filas) return []

  const utilizables = campos.filter((c) => !esNoFiable(c, contexto))
  const metricas = utilizables.filter((c) => c.rol === 'metrica')
  const dimensiones = utilizables.filter((c) => c.rol === 'dimension')
  const temporales = utilizables.filter((c) => c.rol === 'temporal')
  const estados = utilizables.filter((c) => c.semantica === S.ESTADO)

  const nombreFila = nombreDeRegistro(campos, tabla)

  // --- 1. Cuántos registros hay. Siempre se puede, y en un Excel sin cifras
  // (clientes, ciudad, estado) es LA métrica principal.
  kpis.push({
    id: `${tabla.id}:recuento`,
    etiqueta: capitalizar(nombreFila.plural),
    valor: filas,
    unidad: null,
    valorFormateado: formatearNumero(filas),
    tipo: 'cuenta',
    confianza: 1,
    prioridad: metricas.length ? 40 : 90,
    procedencia: {
      hoja: tabla.hoja,
      columnas: [],
      formula: 'COUNT(filas)',
      explicacion: `Número de filas de la tabla "${tabla.hoja}".`,
    },
  })

  // --- 2. Total de cada métrica monetaria o de cantidad
  for (const m of metricas) {
    const t = totales(perfil, m.indice)
    if (!t.cuenta) continue

    kpis.push({
      id: `${tabla.id}:suma:${m.columna.nombre}`,
      etiqueta: etiquetaDeTotal(m),
      valor: t.suma,
      unidad: m.unidad,
      valorFormateado: formatearNumero(t.suma, m.unidad),
      tipo: 'suma',
      confianza: m.confianza,
      prioridad: MONETARIAS.includes(m.semantica) ? 100 : 70,
      procedencia: {
        hoja: tabla.hoja,
        columnas: [m.columna.nombre],
        formula: `SUM(${m.columna.nombre})`,
        explicacion: `Suma de los ${t.cuenta} valores de "${m.columna.nombre}" en la hoja "${tabla.hoja}".`,
      },
      detalle: t.cuenta < filas ? `${t.cuenta} de ${filas} filas con dato` : null,
    })

    // Media: solo aporta si hay varios valores y no es lo mismo que el total
    if (t.cuenta > 1) {
      kpis.push({
        id: `${tabla.id}:media:${m.columna.nombre}`,
        etiqueta: `${etiquetaDeTotal(m, true)} medio`,
        valor: t.media,
        unidad: m.unidad,
        valorFormateado: formatearNumero(t.media, m.unidad),
        tipo: 'media',
        confianza: m.confianza,
        prioridad: 55,
        procedencia: {
          hoja: tabla.hoja,
          columnas: [m.columna.nombre],
          formula: `SUM(${m.columna.nombre}) / COUNT(${m.columna.nombre})`,
          explicacion: `Media de "${m.columna.nombre}" sobre ${t.cuenta} valores.`,
        },
      })
    }
  }

  // --- 3. Cuántos clientes / productos / ciudades distintos
  for (const d of [...dimensiones, ...utilizables.filter((c) => c.rol === 'identificador')]) {
    if (!ENTIDADES.includes(d.semantica)) continue
    const distintos = contarDistintos(perfil, d.indice)
    // Si cada fila es uno distinto, el dato ya lo cuenta el KPI de recuento
    if (distintos <= 1 || distintos === filas) continue

    kpis.push({
      id: `${tabla.id}:distintos:${d.columna.nombre}`,
      etiqueta: `${capitalizar(etiquetaEntidad(d.semantica, true))} distintos`,
      valor: distintos,
      unidad: null,
      valorFormateado: formatearNumero(distintos),
      tipo: 'distintos',
      confianza: d.confianza,
      prioridad: 65,
      procedencia: {
        hoja: tabla.hoja,
        columnas: [d.columna.nombre],
        formula: `COUNT(DISTINCT ${d.columna.nombre})`,
        explicacion: `Valores distintos en "${d.columna.nombre}" (agrupando mayúsculas y acentos).`,
      },
    })
  }

  // --- 4. Cifras por estado: "pendiente de cobro" es casi siempre el dato
  // que más importa, y solo se puede construir si existe la columna.
  for (const e of estados) {
    kpis.push(...kpisPorEstado(contexto, e, metricas, nombreFila))
  }

  // --- 5. Métricas derivadas (beneficio, margen, ticket medio)
  kpis.push(...metricasDerivadas(contexto, metricas, nombreFila))

  // --- 6. Crecimiento respecto al periodo anterior
  for (const t of temporales) {
    kpis.push(...kpisDeCrecimiento(contexto, t, metricas, nombreFila))
  }

  return kpis
    .filter((k) => k.valor !== null && isFinite(k.valor) && k.confianza >= CONFIANZA_MINIMA)
    .sort((a, b) => b.prioridad - a.prioridad || b.confianza - a.confianza)
}

/*
  Reparto de una métrica (o del recuento) por estado. Se destacan las familias
  reconocidas: lo pendiente y lo completado.
*/
function kpisPorEstado(contexto, campoEstado, metricas, nombreFila) {
  const { tabla, perfil } = contexto
  const salida = []
  const metrica = metricas.find((m) => MONETARIAS.includes(m.semantica)) || null

  const { grupos } = agruparPor(perfil, campoEstado.indice, metrica ? metrica.indice : null, {
    operacion: metrica ? 'suma' : 'cuenta',
    limite: 20,
    incluirOtros: false,
  })
  if (grupos.length < 2) return salida

  const porFamilia = new Map()
  for (const g of grupos) {
    const familia = clasificarEstado(g.etiqueta)
    if (!familia) continue
    const actual = porFamilia.get(familia) || { valor: 0, cuenta: 0, etiquetas: [] }
    actual.valor += g.valor
    actual.cuenta += g.cuenta
    actual.etiquetas.push(g.etiqueta)
    porFamilia.set(familia, actual)
  }

  const titulos = {
    pendiente: metrica ? 'Pendiente' : 'Pendientes',
    completado: metrica ? 'Completado' : 'Completados',
    cancelado: metrica ? 'Cancelado' : 'Cancelados',
    activo: metrica ? 'En curso' : 'En curso',
  }

  for (const [familia, datos] of porFamilia) {
    if (familia === 'cancelado' && datos.cuenta === 0) continue
    salida.push({
      id: `${tabla.id}:estado:${familia}`,
      etiqueta: titulos[familia],
      valor: datos.valor,
      unidad: metrica ? metrica.unidad : null,
      valorFormateado: formatearNumero(datos.valor, metrica ? metrica.unidad : null),
      tipo: 'estado',
      confianza: Math.min(campoEstado.confianza, metrica ? metrica.confianza : 1),
      prioridad: familia === 'pendiente' ? 95 : 60,
      procedencia: {
        hoja: tabla.hoja,
        columnas: metrica ? [metrica.columna.nombre, campoEstado.columna.nombre] : [campoEstado.columna.nombre],
        formula: metrica
          ? `SUM(${metrica.columna.nombre}) WHERE ${campoEstado.columna.nombre} IN (${datos.etiquetas.join(', ')})`
          : `COUNT(filas) WHERE ${campoEstado.columna.nombre} IN (${datos.etiquetas.join(', ')})`,
        explicacion: `${metrica ? `Suma de "${metrica.columna.nombre}"` : 'Recuento de filas'} con estado ${datos.etiquetas.join(' o ')}.`,
      },
      detalle: metrica ? `${datos.cuenta} ${datos.cuenta === 1 ? nombreFila.singular : nombreFila.plural}` : null,
    })
  }

  return salida
}

/*
  Métricas derivadas. Solo se crean cuando la fórmula es VÁLIDA con estos
  datos: existen las columnas necesarias, la interpretación es fiable y no
  hay división por cero.
*/
function metricasDerivadas(contexto, metricas, nombreFila) {
  const { tabla, perfil } = contexto
  const salida = []

  const ingresos = metricas.find((m) => m.semantica === S.INGRESO)
  const costes = metricas.find((m) => m.semantica === S.COSTE)
  const presupuesto = metricas.find((m) => m.semantica === S.PRESUPUESTO)

  // --- Beneficio = Ingresos - Costes
  if (ingresos && costes && mismaUnidad(ingresos, costes)) {
    const ti = totales(perfil, ingresos.indice)
    const tc = totales(perfil, costes.indice)
    const beneficio = redondear(ti.suma - tc.suma)
    const confianza = Math.min(ingresos.confianza, costes.confianza)

    salida.push({
      id: `${tabla.id}:beneficio`,
      etiqueta: 'Beneficio',
      valor: beneficio,
      unidad: ingresos.unidad,
      valorFormateado: formatearNumero(beneficio, ingresos.unidad),
      tipo: 'derivada',
      confianza,
      prioridad: 98,
      sentido: beneficio >= 0 ? 'bueno' : 'malo',
      procedencia: {
        hoja: tabla.hoja,
        columnas: [ingresos.columna.nombre, costes.columna.nombre],
        formula: `SUM(${ingresos.columna.nombre}) - SUM(${costes.columna.nombre})`,
        explicacion: `${formatearNumero(ti.suma, ingresos.unidad)} de "${ingresos.columna.nombre}" menos ${formatearNumero(tc.suma, costes.unidad)} de "${costes.columna.nombre}".`,
      },
    })

    // --- Margen % = Beneficio / Ingresos × 100. Sin ingresos no hay margen.
    if (ti.suma !== 0) {
      const margen = redondear((beneficio / ti.suma) * 100)
      salida.push({
        id: `${tabla.id}:margen`,
        etiqueta: 'Margen',
        valor: margen,
        unidad: '%',
        valorFormateado: formatearNumero(margen, '%'),
        tipo: 'derivada',
        confianza,
        prioridad: 88,
        sentido: margen >= 0 ? 'bueno' : 'malo',
        procedencia: {
          hoja: tabla.hoja,
          columnas: [ingresos.columna.nombre, costes.columna.nombre],
          formula: `(SUM(${ingresos.columna.nombre}) - SUM(${costes.columna.nombre})) / SUM(${ingresos.columna.nombre}) × 100`,
          explicacion: `Beneficio de ${formatearNumero(beneficio, ingresos.unidad)} sobre ${formatearNumero(ti.suma, ingresos.unidad)} de ingresos.`,
        },
      })
    }
  }

  // --- Desviación sobre presupuesto = Coste - Presupuesto
  if (presupuesto && costes && mismaUnidad(presupuesto, costes)) {
    const tp = totales(perfil, presupuesto.indice)
    const tc = totales(perfil, costes.indice)
    const desviacion = redondear(tc.suma - tp.suma)
    salida.push({
      id: `${tabla.id}:desviacion`,
      etiqueta: 'Desviación sobre presupuesto',
      valor: desviacion,
      unidad: presupuesto.unidad,
      valorFormateado: formatearNumero(desviacion, presupuesto.unidad),
      tipo: 'derivada',
      confianza: Math.min(presupuesto.confianza, costes.confianza),
      prioridad: 92,
      sentido: desviacion > 0 ? 'malo' : 'bueno',
      procedencia: {
        hoja: tabla.hoja,
        columnas: [costes.columna.nombre, presupuesto.columna.nombre],
        formula: `SUM(${costes.columna.nombre}) - SUM(${presupuesto.columna.nombre})`,
        explicacion: `Coste real de ${formatearNumero(tc.suma, costes.unidad)} frente a un presupuesto de ${formatearNumero(tp.suma, presupuesto.unidad)}.`,
      },
    })
  }

  // --- Ticket medio = Total / número de registros
  const principal = metricas.find((m) => MONETARIAS.includes(m.semantica))
  if (principal && perfil.filas > 1) {
    const t = totales(perfil, principal.indice)
    if (t.cuenta > 1) {
      const ticket = redondear(t.suma / t.cuenta)
      salida.push({
        id: `${tabla.id}:ticket`,
        etiqueta: `${capitalizar(nombreFila.singular)} media`,
        valor: ticket,
        unidad: principal.unidad,
        valorFormateado: formatearNumero(ticket, principal.unidad),
        tipo: 'derivada',
        confianza: principal.confianza,
        prioridad: 58,
        procedencia: {
          hoja: tabla.hoja,
          columnas: [principal.columna.nombre],
          formula: `SUM(${principal.columna.nombre}) / COUNT(${principal.columna.nombre})`,
          explicacion: `${formatearNumero(t.suma, principal.unidad)} repartidos entre ${t.cuenta} ${nombreFila.plural}.`,
        },
      })
    }
  }

  return salida
}

/*
  Crecimiento del último periodo cerrado frente al anterior.
  Requiere al menos dos periodos y que el anterior no sea cero.
*/
function kpisDeCrecimiento(contexto, campoFecha, metricas, nombreFila) {
  const { tabla, perfil } = contexto
  const granularidad = granularidadRecomendada(campoFecha.columna.rangoFechas)
  if (!granularidad) return []

  const metrica = metricas.find((m) => MONETARIAS.includes(m.semantica)) || null
  const { puntos } = serieTemporal(perfil, campoFecha.indice, metrica ? metrica.indice : null, {
    granularidad,
    operacion: metrica ? 'suma' : 'cuenta',
  })
  // Con dos puntos sueltos no hay evolución que medir: la "variación" entre
  // dos días consecutivos es ruido, no una tendencia. Se exigen tres periodos
  // para que comparar el último con el anterior signifique algo.
  if (puntos.length < 3) return []

  const actual = puntos[puntos.length - 1]
  const anterior = puntos[puntos.length - 2]
  // Sin base con la que comparar, el crecimiento no es un número: es infinito
  if (!anterior.valor) return []

  const variacion = redondear(((actual.valor - anterior.valor) / Math.abs(anterior.valor)) * 100)

  return [
    {
      id: `${tabla.id}:crecimiento`,
      etiqueta: `Variación (${etiquetaDePeriodo(actual.clave, granularidad)})`,
      valor: variacion,
      unidad: '%',
      valorFormateado: formatearVariacion(variacion),
      tipo: 'crecimiento',
      confianza: Math.min(campoFecha.confianza, metrica ? metrica.confianza : 1),
      prioridad: 85,
      sentido: variacion >= 0 ? 'bueno' : 'malo',
      procedencia: {
        hoja: tabla.hoja,
        columnas: metrica ? [metrica.columna.nombre, campoFecha.columna.nombre] : [campoFecha.columna.nombre],
        formula: '(periodo actual − periodo anterior) / periodo anterior × 100',
        explicacion:
          `${etiquetaDePeriodo(actual.clave, granularidad)}: ${formatearNumero(actual.valor, metrica?.unidad)} ` +
          `frente a ${formatearNumero(anterior.valor, metrica?.unidad)} en ${etiquetaDePeriodo(anterior.clave, granularidad)}.`,
      },
      detalle: `frente a ${etiquetaDePeriodo(anterior.clave, granularidad)}`,
    },
  ]
}

// --- Auxiliares -------------------------------------------------------------

function esNoFiable(campo, contexto) {
  if (contexto.noFiables?.has(campo.columna.nombre)) return true
  return campo.confianza < CONFIANZA_MINIMA
}

function mismaUnidad(a, b) {
  // Restar euros de dólares no tiene sentido; si una de las dos no declara
  // moneda se acepta, porque probablemente es el mismo Excel sin símbolos.
  if (a.unidad && b.unidad) return a.unidad === b.unidad
  return true
}

/*
  Cómo llamar a una fila de esta tabla: "facturas", "clientes", "proyectos"…
  Se deduce de lo que representan sus columnas, y si no hay pistas se queda
  en "registros" antes que inventar un nombre de negocio.
*/
function nombreDeRegistro(campos, tabla) {
  const nombres = campos.map((c) => c.columna.nombre).join(' ').toLowerCase()
  const hoja = String(tabla.hoja || '').toLowerCase()
  const texto = `${hoja} ${nombres}`

  const candidatos = [
    [/factura/, 'factura', 'facturas'],
    [/venta|pedido/, 'venta', 'ventas'],
    [/cliente/, 'cliente', 'clientes'],
    [/proyecto|obra/, 'proyecto', 'proyectos'],
    [/emplead|personal|plantilla|n[oó]mina/, 'persona', 'personas'],
    [/gasto/, 'gasto', 'gastos'],
    [/producto|art[ií]culo|material|inventario|stock/, 'artículo', 'artículos'],
    [/cita|reserva|evento|agenda/, 'cita', 'citas'],
    [/inmueble|vivienda|piso|propiedad/, 'inmueble', 'inmuebles'],
    [/campa[nñ]a|lead|contacto/, 'contacto', 'contactos'],
  ]
  for (const [patron, singular, plural] of candidatos) {
    if (patron.test(texto)) return { singular, plural }
  }
  return { singular: 'registro', plural: 'registros' }
}

function etiquetaDeTotal(campo, corto = false) {
  const porSemantica = {
    [S.INGRESO]: corto ? 'Ingreso' : 'Ingresos',
    [S.COSTE]: corto ? 'Coste' : 'Costes',
    [S.PRESUPUESTO]: corto ? 'Presupuesto' : 'Presupuesto total',
    [S.PRECIO]: corto ? 'Precio' : 'Precio total',
    [S.BENEFICIO]: 'Beneficio',
    [S.CANTIDAD]: corto ? 'Volumen' : 'Cantidad total',
    [S.DURACION]: corto ? 'Tiempo' : 'Tiempo total',
  }
  if (porSemantica[campo.semantica]) return porSemantica[campo.semantica]
  // Sin semántica clara se usa el nombre real de la columna: es más honesto
  // que ponerle una etiqueta de negocio que quizá no le corresponde.
  return corto ? campo.columna.nombre : `Total ${campo.columna.nombre.toLowerCase()}`
}

function etiquetaEntidad(semantica, plural = false) {
  const mapa = {
    [S.PERSONA]: ['cliente', 'clientes'],
    [S.ORGANIZACION]: ['empresa', 'empresas'],
    [S.PRODUCTO]: ['producto', 'productos'],
    [S.PROYECTO]: ['proyecto', 'proyectos'],
    [S.UBICACION]: ['ubicación', 'ubicaciones'],
  }
  const par = mapa[semantica] || ['valor', 'valores']
  return plural ? par[1] : par[0]
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function redondear(n) {
  if (n == null || !isFinite(n)) return n
  return Math.round(n * 1e6) / 1e6
}
