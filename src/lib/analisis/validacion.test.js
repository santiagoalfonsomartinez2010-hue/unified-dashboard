import { describe, it, expect } from 'vitest'
import { construirModelo } from './modelo'
import { generarConfiguracion } from './layout'
import { validarConfiguracion } from './validacion'

function preparar(columnas, filas, hoja = 'Ventas') {
  const modelo = construirModelo({
    id: `${hoja}#0`,
    hoja,
    columnas: columnas.map((nombre) => ({ nombre })),
    filas,
    avisos: [],
  })
  return { modelo, configuracion: generarConfiguracion([modelo]) }
}

const VENTAS = [
  ['Acme', '2025-01-15', 1200, 'Cobrado'],
  ['Globex', '2025-02-15', 800, 'Pendiente'],
  ['Initech', '2025-03-15', 450, 'Cobrado'],
  ['Acme', '2025-04-15', 1000, 'Pendiente'],
  ['Globex', '2025-05-15', 300, 'Cobrado'],
  ['Initech', '2025-06-15', 700, 'Cobrado'],
]

describe('cuadre de los totales', () => {
  it('deja pasar un dashboard cuyos números cuadran', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    const { incidencias, valida, configuracion: limpia } = validarConfiguracion(configuracion, [modelo])

    expect(valida).toBe(true)
    expect(incidencias.filter((i) => i.gravedad === 'alta')).toHaveLength(0)
    const total = limpia.kpis.find((k) => k.tipo === 'suma')
    expect(total.valor).toBe(4450)
  })

  it('descarta un KPI cuyo total no coincide con los datos', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    // Se falsea la cifra a mano, como si el cálculo se hubiera corrompido
    const total = configuracion.kpis.find((k) => k.tipo === 'suma')
    total.valor = 999999

    const { incidencias, configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.kpis.find((k) => k.id === total.id)).toBeUndefined()
    expect(incidencias.some((i) => /no coincide al recalcularlo/.test(i.mensaje))).toBe(true)
  })

  it('descarta un recuento que no cuadra con el número de filas', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    const cuenta = configuracion.kpis.find((k) => k.tipo === 'cuenta')
    if (cuenta) {
      cuenta.valor = 500
      const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
      expect(limpia.kpis.find((k) => k.id === cuenta.id)).toBeUndefined()
    }
  })

  it('descarta cifras que no son números', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    configuracion.kpis[0].valor = Infinity

    const { incidencias, configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.kpis).toHaveLength(configuracion.kpis.length - 1)
    expect(incidencias.some((i) => /no da un número válido/.test(i.mensaje))).toBe(true)
  })
})

describe('coherencia de las referencias', () => {
  it('descarta lo que apunta a una columna inexistente', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    configuracion.kpis[0].procedencia.columnas = ['Columna fantasma']

    const { incidencias, configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.kpis).toHaveLength(configuracion.kpis.length - 1)
    expect(incidencias.some((i) => /no existe/.test(i.mensaje))).toBe(true)
  })

  it('descarta una tabla cuyas filas no cuadran con sus columnas', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    const tabla = configuracion.graficos.find((g) => g.tipo === 'tabla')
    tabla.datos = [['solo', 'dos']]

    const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.graficos.find((g) => g.id === tabla.id)).toBeUndefined()
  })
})

describe('gráficos que engañarían', () => {
  it('no reparte un total con valores negativos en un donut', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    const donut = configuracion.graficos.find((g) => g.tipo === 'donut')
    expect(donut).toBeDefined()
    donut.datos = [
      { etiqueta: 'Cobrado', valor: 1000 },
      { etiqueta: 'Devuelto', valor: -300 },
    ]

    const { incidencias, configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.graficos.find((g) => g.id === donut.id)).toBeUndefined()
    expect(incidencias.some((i) => /valores negativos/.test(i.mensaje))).toBe(true)
  })

  it('descarta gráficos con valores no numéricos', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    const barras = configuracion.graficos.find((g) => g.tipo === 'barras')
    barras.datos = [
      { etiqueta: 'A', valor: NaN },
      { etiqueta: 'B', valor: 10 },
    ]

    const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.graficos.find((g) => g.id === barras.id)).toBeUndefined()
  })

  it('quita los filtros que no filtran nada', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    configuracion.filtros.push({
      id: 'falso',
      etiqueta: 'Vacío',
      tipo: 'categoria',
      opciones: ['único'],
    })

    const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.filtros.find((f) => f.id === 'falso')).toBeUndefined()
  })
})

describe('secciones tras la depuración', () => {
  it('una sección que se queda sin contenido desaparece', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    // Se invalidan todos los gráficos de evolución
    for (const g of configuracion.graficos) {
      if (g.tipo === 'linea') g.datos = []
    }

    const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    expect(limpia.secciones.find((s) => s.id === 'evolucion')).toBeUndefined()
    // El resto del panel sobrevive
    expect(limpia.secciones.find((s) => s.id === 'resumen')).toBeDefined()
  })

  it('el resumen refleja solo los KPIs que han sobrevivido', () => {
    const { modelo, configuracion } = preparar(['Cliente', 'Fecha', 'Importe', 'Estado'], VENTAS)
    configuracion.kpis[0].valor = NaN

    const { configuracion: limpia } = validarConfiguracion(configuracion, [modelo])
    const tiles = limpia.secciones.find((s) => s.id === 'resumen').widgets[0]
    expect(tiles.items).toHaveLength(limpia.kpis.length)
    expect(tiles.items.every((i) => i.procedencia)).toBe(true)
  })
})
