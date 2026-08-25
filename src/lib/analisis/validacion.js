import { totales } from './agregacion'

/*
  VALIDACIÓN antes de enseñar el dashboard.

  Es la última red de seguridad: todo lo que no se pueda comprobar NO se
  muestra como dato fiable. La comprobación más importante es la de los
  totales, y se hace a propósito por un camino distinto al que los generó:
  se vuelve a recorrer la capa normalizada y se compara el resultado con la
  cifra que iba a salir en pantalla. Si no cuadran, el KPI se retira.

  Devuelve { configuracion (depurada), incidencias, valida }.
*/

// Margen para el redondeo del coma flotante, no para "casi cuadra"
const TOLERANCIA = 1e-6

export function validarConfiguracion(configuracion, modelos) {
  const incidencias = []
  const porTabla = new Map(modelos.map((m) => [m.tabla.id, m]))

  const kpis = configuracion.kpis.filter((k) => validarKpi(k, porTabla, incidencias))
  const graficos = configuracion.graficos.filter((g) => validarGrafico(g, porTabla, incidencias))
  const filtros = configuracion.filtros.filter((f) => validarFiltro(f, incidencias))

  // Las secciones se recomponen a partir de lo que ha sobrevivido
  const idsGraficos = new Set(graficos.map((g) => g.id))
  const secciones = configuracion.secciones
    .map((s) => depurarSeccion(s, kpis, idsGraficos, configuracion))
    .filter((s) => s && s.widgets.length)

  return {
    configuracion: { ...configuracion, kpis, graficos, filtros, secciones },
    incidencias,
    valida: incidencias.every((i) => i.gravedad !== 'alta'),
  }
}

/*
  Un KPI es válido si su cifra existe, es finita y —cuando se puede— vuelve a
  salir al recalcularla desde los datos.
*/
function validarKpi(kpi, porTabla, incidencias) {
  const { valor, procedencia } = kpi

  if (valor === null || valor === undefined || !isFinite(valor)) {
    incidencias.push({
      gravedad: 'alta',
      elemento: kpi.id,
      mensaje: `Se ha descartado "${kpi.etiqueta}": el cálculo no da un número válido.`,
    })
    return false
  }

  const modelo = buscarModelo(porTabla, procedencia?.hoja)
  if (!modelo) return true // sin modelo no hay nada que contrastar

  // Las columnas citadas tienen que existir de verdad en la tabla
  const nombres = new Set(modelo.campos.map((c) => c.columna.nombre))
  for (const columna of procedencia?.columnas || []) {
    if (!nombres.has(columna)) {
      incidencias.push({
        gravedad: 'alta',
        elemento: kpi.id,
        mensaje: `Se ha descartado "${kpi.etiqueta}": hace referencia a la columna "${columna}", que no existe en "${procedencia.hoja}".`,
      })
      return false
    }
  }

  // --- Comprobación de cuadre: se recalcula el total por separado
  if (kpi.tipo === 'suma' && procedencia.columnas.length === 1) {
    const campo = modelo.campos.find((c) => c.columna.nombre === procedencia.columnas[0])
    if (campo) {
      const recalculado = totales(modelo.perfil, campo.indice).suma
      if (Math.abs(recalculado - valor) > Math.max(Math.abs(valor) * TOLERANCIA, TOLERANCIA)) {
        incidencias.push({
          gravedad: 'alta',
          elemento: kpi.id,
          mensaje: `Se ha descartado "${kpi.etiqueta}": el total no coincide al recalcularlo sobre los datos originales.`,
        })
        return false
      }
    }
  }

  if (kpi.tipo === 'cuenta' && valor !== modelo.filas) {
    incidencias.push({
      gravedad: 'alta',
      elemento: kpi.id,
      mensaje: `Se ha descartado "${kpi.etiqueta}": el recuento no coincide con el número de filas.`,
    })
    return false
  }

  // Un porcentaje desbocado casi siempre indica una base mal elegida
  if (kpi.unidad === '%' && Math.abs(valor) > 100000) {
    incidencias.push({
      gravedad: 'media',
      elemento: kpi.id,
      mensaje: `Se ha descartado "${kpi.etiqueta}": el porcentaje resultante (${Math.round(valor)} %) no es creíble.`,
    })
    return false
  }

  return true
}

function validarGrafico(grafico, porTabla, incidencias) {
  const modelo = buscarModelo(porTabla, grafico.procedencia?.hoja)

  if (modelo) {
    const nombres = new Set(modelo.campos.map((c) => c.columna.nombre))
    for (const columna of grafico.procedencia?.columnas || []) {
      if (!nombres.has(columna)) {
        incidencias.push({
          gravedad: 'alta',
          elemento: grafico.id,
          mensaje: `Se ha descartado el gráfico "${grafico.titulo}": usa la columna "${columna}", que no existe.`,
        })
        return false
      }
    }
  }

  if (grafico.tipo === 'tabla') {
    const anchoOk = (grafico.datos || []).every((f) => f.length === grafico.columnas.length)
    if (!anchoOk) {
      incidencias.push({
        gravedad: 'alta',
        elemento: grafico.id,
        mensaje: `Se ha descartado la tabla "${grafico.titulo}": las filas no cuadran con las columnas.`,
      })
      return false
    }
    return (grafico.datos || []).length > 0
  }

  if (grafico.tipo === 'dispersion') {
    return (grafico.datos || []).every((p) => isFinite(p.x) && isFinite(p.y))
  }

  const datos = grafico.datos || []
  if (!datos.length) return false

  if (datos.some((d) => !isFinite(d.valor))) {
    incidencias.push({
      gravedad: 'alta',
      elemento: grafico.id,
      mensaje: `Se ha descartado el gráfico "${grafico.titulo}": contiene valores que no son números.`,
    })
    return false
  }

  /*
    Un donut representa partes de un total: con valores negativos las
    porciones dejan de significar nada (un -20 % no es un trozo de tarta).
    Antes que dibujar algo engañoso, se retira.
  */
  if (grafico.tipo === 'donut') {
    if (datos.some((d) => d.valor < 0)) {
      incidencias.push({
        gravedad: 'media',
        elemento: grafico.id,
        mensaje: `Se ha descartado el reparto "${grafico.titulo}": no se puede repartir un total que incluye valores negativos.`,
      })
      return false
    }
    const total = datos.reduce((s, d) => s + d.valor, 0)
    if (total <= 0) return false
  }

  return true
}

function validarFiltro(filtro, incidencias) {
  if (filtro.tipo === 'fecha') return Boolean(filtro.desde && filtro.hasta)
  if (!filtro.opciones?.length || filtro.opciones.length < 2) {
    incidencias.push({
      gravedad: 'baja',
      elemento: filtro.id,
      mensaje: `Se ha quitado el filtro "${filtro.etiqueta}": no tiene opciones suficientes para filtrar.`,
    })
    return false
  }
  return true
}

/*
  Reconstruye una sección quitando lo que no ha pasado la validación. Si una
  sección se queda sin contenido desaparece: mejor un panel más corto que un
  apartado vacío.
*/
function depurarSeccion(seccion, kpis, idsGraficos, configuracion) {
  if (seccion.id === 'cifras') {
    if (!kpis.length) return null
    return {
      ...seccion,
      widgets: [
        {
          tipo: 'tiles',
          items: kpis.map((k) => ({
            etiqueta: k.etiqueta,
            valor: k.valorFormateado,
            detalle: k.detalle || null,
            color: seccion.widgets[0]?.items?.find((i) => i.etiqueta === k.etiqueta)?.color ?? null,
            procedencia: k.procedencia,
          })),
        },
      ],
    }
  }

  // Las secciones de listas (hallazgos, calidad) no dependen de los gráficos
  const soloListas = seccion.widgets.every((w) => w.tipo === 'lista' || w.tipo === 'texto')
  if (soloListas) return seccion

  const graficosValidos = new Set(
    configuracion.graficos.filter((g) => idsGraficos.has(g.id)).map((g) => g.titulo)
  )
  return { ...seccion, widgets: seccion.widgets.filter((w) => graficosValidos.has(w.titulo)) }
}

function buscarModelo(porTabla, hoja) {
  for (const modelo of porTabla.values()) {
    if (modelo.tabla.hoja === hoja) return modelo
  }
  return null
}
