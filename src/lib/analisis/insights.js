import { SEMANTICA } from './semantica'
import { agruparPor, serieTemporal, elegirGranularidad } from './agregacion'
import { formatearNumero } from './formato'

/*
  INSIGHTS: patrones que se DEDUCEN de los datos.

  La regla que gobierna este módulo entero es la del enunciado: un insight es
  un cálculo, nunca una explicación.

    Correcto:   "Las ventas de marzo subieron un 23 % respecto a febrero."
    Incorrecto: "Las ventas subieron porque funcionó la campaña."

  Lo segundo no se puede afirmar con un Excel de ventas delante, así que aquí
  no se escribe. Todos los textos que salen de aquí son descripciones de una
  cifra que se acaba de calcular, y cada uno lleva su procedencia.
*/

const S = SEMANTICA

// Umbrales para no llamar "hallazgo" a cualquier fluctuación
const CONCENTRACION_MINIMA = 0.4 // el líder tiene que pesar de verdad
const VARIACION_MINIMA = 15 // en %
const MIN_GRUPOS = 3
const MIN_FILAS = 5

/*
  Genera los insights de un modelo de tabla.
  Devuelve una lista ordenada por importancia (0-100).
*/
export function generarInsights(modelo) {
  const insights = []
  if (modelo.filas < MIN_FILAS) return insights

  const metricaPrincipal = elegirMetricaPrincipal(modelo)

  insights.push(...insightsDeConcentracion(modelo, metricaPrincipal))
  insights.push(...insightsTemporales(modelo, metricaPrincipal))
  insights.push(...insightsDeReparto(modelo, metricaPrincipal))
  insights.push(...insightsDeCobertura(modelo))

  return insights.sort((a, b) => b.importancia - a.importancia)
}

// La métrica que mejor resume la tabla: primero dinero, luego cantidades
function elegirMetricaPrincipal(modelo) {
  const orden = [S.INGRESO, S.IMPORTE, S.BENEFICIO, S.PRESUPUESTO, S.COSTE, S.PRECIO, S.CANTIDAD]
  for (const semantica of orden) {
    const encontrada = modelo.metricas.find((m) => m.semantica === semantica)
    if (encontrada) return encontrada
  }
  return modelo.metricas[0] || null
}

/*
  ¿Hay un líder claro? ("Reformas Marín concentra el 82 % de la facturación")
  Es de los datos más accionables que se pueden sacar de un Excel, porque
  señala una dependencia.
*/
function insightsDeConcentracion(modelo, metrica) {
  const salida = []
  const dimensiones = [...modelo.dimensiones, ...modelo.entidades].filter((d) =>
    [S.PERSONA, S.ORGANIZACION, S.PRODUCTO, S.PROYECTO, S.UBICACION, S.CATEGORIA].includes(d.semantica)
  )

  for (const dim of dimensiones.slice(0, 3)) {
    const { grupos, totalGrupos } = agruparPor(modelo.perfil, dim.indice, metrica ? metrica.indice : null, {
      limite: 50,
      incluirOtros: false,
    })
    if (totalGrupos < MIN_GRUPOS) continue

    const total = grupos.reduce((s, g) => s + g.valor, 0)
    if (!total) continue

    const lider = grupos[0]
    const cuota = lider.valor / total

    if (cuota >= CONCENTRACION_MINIMA) {
      salida.push({
        id: `${modelo.tabla.id}:concentracion:${dim.columna.nombre}`,
        tipo: 'concentracion',
        titulo: 'Concentración',
        texto:
          `${lider.etiqueta} concentra el ${Math.round(cuota * 100)} % ` +
          `${metrica ? `de ${etiquetaMetrica(metrica)}` : 'de los registros'} ` +
          `(${formatearNumero(lider.valor, metrica?.unidad)} de ${formatearNumero(total, metrica?.unidad)}), ` +
          `sobre un total de ${totalGrupos} ${plural(dim)}.`,
        importancia: Math.round(60 + cuota * 40),
        procedencia: {
          hoja: modelo.tabla.hoja,
          columnas: metrica ? [dim.columna.nombre, metrica.columna.nombre] : [dim.columna.nombre],
          formula: metrica
            ? `SUM(${metrica.columna.nombre}) GROUP BY ${dim.columna.nombre}`
            : `COUNT(filas) GROUP BY ${dim.columna.nombre}`,
        },
      })
    }

    // El primero del ranking, aunque no haya concentración
    if (cuota < CONCENTRACION_MINIMA && metrica) {
      salida.push({
        id: `${modelo.tabla.id}:lider:${dim.columna.nombre}`,
        tipo: 'ranking',
        titulo: `${capitalizar(singular(dim))} destacado`,
        texto: `${lider.etiqueta} encabeza ${etiquetaMetrica(metrica)} con ${formatearNumero(lider.valor, metrica.unidad)}, un ${Math.round(cuota * 100)} % del total.`,
        importancia: 50,
        procedencia: {
          hoja: modelo.tabla.hoja,
          columnas: [dim.columna.nombre, metrica.columna.nombre],
          formula: `SUM(${metrica.columna.nombre}) GROUP BY ${dim.columna.nombre} ORDER BY 1 DESC LIMIT 1`,
        },
      })
    }
  }

  return salida
}

/*
  Evolución: mejor y peor periodo, y el salto más grande entre dos periodos
  consecutivos. Se describe el movimiento; no se explica por qué ocurre.
*/
function insightsTemporales(modelo, metrica) {
  const salida = []
  const temporal = modelo.temporales[0]
  if (!temporal) return salida

  const granularidad = elegirGranularidad(modelo.perfil, temporal.indice)
  if (!granularidad) return salida

  const { puntos } = serieTemporal(modelo.perfil, temporal.indice, metrica ? metrica.indice : null, {
    granularidad,
    operacion: metrica ? 'suma' : 'cuenta',
  })
  if (puntos.length < 3) return salida

  // --- Mejor periodo
  const mejor = puntos.reduce((a, b) => (b.valor > a.valor ? b : a))
  const media = puntos.reduce((s, p) => s + p.valor, 0) / puntos.length
  if (media > 0 && mejor.valor > media * 1.2) {
    salida.push({
      id: `${modelo.tabla.id}:mejor-periodo`,
      tipo: 'pico',
      titulo: 'Mejor periodo',
      texto:
        `${mejor.etiqueta} es el periodo con más ${metrica ? etiquetaMetrica(metrica) : 'registros'}: ` +
        `${formatearNumero(mejor.valor, metrica?.unidad)}, frente a una media de ${formatearNumero(Math.round(media), metrica?.unidad)}.`,
      importancia: 55,
      procedencia: {
        hoja: modelo.tabla.hoja,
        columnas: metrica ? [temporal.columna.nombre, metrica.columna.nombre] : [temporal.columna.nombre],
        formula: `SUM(...) GROUP BY ${granularidad}(${temporal.columna.nombre})`,
      },
    })
  }

  // --- Mayor salto entre dos periodos consecutivos
  let saltoMayor = null
  for (let i = 1; i < puntos.length; i++) {
    const previo = puntos[i - 1]
    const actual = puntos[i]
    if (!previo.valor) continue
    const variacion = ((actual.valor - previo.valor) / Math.abs(previo.valor)) * 100
    if (Math.abs(variacion) < VARIACION_MINIMA) continue
    if (!saltoMayor || Math.abs(variacion) > Math.abs(saltoMayor.variacion)) {
      saltoMayor = { previo, actual, variacion }
    }
  }

  if (saltoMayor) {
    const sube = saltoMayor.variacion > 0
    salida.push({
      id: `${modelo.tabla.id}:salto`,
      tipo: sube ? 'subida' : 'caida',
      titulo: sube ? 'Mayor subida' : 'Mayor caída',
      // Solo el hecho medido: qué cambió, cuánto y entre qué periodos.
      texto:
        `Entre ${saltoMayor.previo.etiqueta} y ${saltoMayor.actual.etiqueta}, ` +
        `${metrica ? etiquetaMetrica(metrica) : 'el número de registros'} ` +
        `${sube ? 'subió' : 'bajó'} un ${Math.abs(Math.round(saltoMayor.variacion))} % ` +
        `(${formatearNumero(saltoMayor.previo.valor, metrica?.unidad)} → ${formatearNumero(saltoMayor.actual.valor, metrica?.unidad)}).`,
      importancia: Math.min(90, 50 + Math.abs(saltoMayor.variacion) / 2),
      procedencia: {
        hoja: modelo.tabla.hoja,
        columnas: metrica ? [temporal.columna.nombre, metrica.columna.nombre] : [temporal.columna.nombre],
        formula: '(periodo − periodo anterior) / periodo anterior × 100',
      },
    })
  }

  return salida
}

// Reparto por estado: cuánto hay pendiente, cuánto cerrado
function insightsDeReparto(modelo, metrica) {
  const salida = []
  const estado = modelo.campos.find((c) => c.semantica === S.ESTADO && !modelo.noFiables.has(c.columna.nombre))
  if (!estado) return salida

  const { grupos, totalGrupos } = agruparPor(modelo.perfil, estado.indice, metrica ? metrica.indice : null, {
    limite: 20,
    incluirOtros: false,
  })
  if (totalGrupos < 2) return salida

  const total = grupos.reduce((s, g) => s + g.valor, 0)
  if (!total) return salida

  const principal = grupos[0]
  salida.push({
    id: `${modelo.tabla.id}:reparto-estado`,
    tipo: 'reparto',
    titulo: 'Reparto por estado',
    texto:
      `El estado "${principal.etiqueta}" reúne ${formatearNumero(principal.valor, metrica?.unidad)} ` +
      `(${Math.round((principal.valor / total) * 100)} % del total), repartido en ${totalGrupos} estados distintos.`,
    importancia: 58,
    procedencia: {
      hoja: modelo.tabla.hoja,
      columnas: metrica ? [estado.columna.nombre, metrica.columna.nombre] : [estado.columna.nombre],
      formula: `GROUP BY ${estado.columna.nombre}`,
    },
  })

  return salida
}

// Avisos sobre la propia cobertura de los datos (no sobre el negocio)
function insightsDeCobertura(modelo) {
  const salida = []
  const temporal = modelo.temporales[0]
  if (temporal?.columna.rangoFechas) {
    const { min, max } = temporal.columna.rangoFechas
    salida.push({
      id: `${modelo.tabla.id}:cobertura`,
      tipo: 'cobertura',
      titulo: 'Periodo cubierto',
      texto: `Los datos van del ${formatearFecha(min)} al ${formatearFecha(max)} (${modelo.filas.toLocaleString('es-ES')} registros).`,
      importancia: 20,
      procedencia: {
        hoja: modelo.tabla.hoja,
        columnas: [temporal.columna.nombre],
        formula: `MIN(${temporal.columna.nombre}), MAX(${temporal.columna.nombre})`,
      },
    })
  }
  return salida
}

// --- Auxiliares -------------------------------------------------------------

function etiquetaMetrica(metrica) {
  const mapa = {
    [S.INGRESO]: 'los ingresos',
    [S.IMPORTE]: 'el importe',
    [S.COSTE]: 'los costes',
    [S.BENEFICIO]: 'el beneficio',
    [S.PRESUPUESTO]: 'el presupuesto',
    [S.PRECIO]: 'el precio',
    [S.CANTIDAD]: 'la cantidad',
  }
  return mapa[metrica.semantica] || `"${metrica.columna.nombre}"`
}

function singular(dim) {
  const mapa = {
    [S.PERSONA]: 'cliente',
    [S.ORGANIZACION]: 'empresa',
    [S.PRODUCTO]: 'producto',
    [S.PROYECTO]: 'proyecto',
    [S.UBICACION]: 'ubicación',
    [S.CATEGORIA]: 'categoría',
  }
  return mapa[dim.semantica] || 'valor'
}

function plural(dim) {
  const uno = singular(dim)
  return uno.endsWith('ón') ? `${uno.slice(0, -2)}ones` : uno.endsWith('a') ? `${uno}s` : `${uno}s`
}

function formatearFecha(iso) {
  const [anio, mes, dia] = String(iso).split('-')
  return `${Number(dia)}/${Number(mes)}/${anio}`
}

function capitalizar(t) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Reexportado para que el layout pueda reutilizar el mismo criterio
export { elegirMetricaPrincipal }
