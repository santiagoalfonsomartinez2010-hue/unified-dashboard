import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { analizarLibro, resumirParaModelo, ETAPAS } from './index'

/*
  Pruebas del pipeline COMPLETO, de principio a fin, con Excels de verdad
  (se serializan y se vuelven a leer como si el usuario los hubiera subido).

  Cubre los diez escenarios del enunciado: ventas, clientes, proyectos,
  financiero, inventario, varias hojas, datos incompletos, columnas
  desconocidas, fechas y muchos registros.
*/

// Crea un .xlsx en memoria a partir de matrices por hoja
function excel(hojas) {
  const libro = XLSX.utils.book_new()
  for (const [nombre, matriz] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(matriz, { cellDates: true }), nombre)
  }
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' })
}

const analizar = (hojas) => analizarLibro(excel(hojas))
const kpi = (config, fragmento) =>
  config.kpis.find((k) => k.etiqueta.toLowerCase().includes(fragmento.toLowerCase()))
const tiposGrafico = (config) => config.graficos.map((g) => g.tipo)
const textoDe = (config) => JSON.stringify(config).toLowerCase()

// Suma de control calculada a mano sobre los datos de entrada
const sumaDe = (filas, col) => filas.reduce((s, f) => s + f[col], 0)

describe('1. Excel de ventas', () => {
  const filas = Array.from({ length: 48 }, (_, i) => [
    `F-${1000 + i}`,
    ['Acme', 'Globex', 'Initech', 'Umbrella'][i % 4],
    ['Madrid', 'Bilbao', 'Valencia'][i % 3],
    new Date(Date.UTC(2025, i % 12, 15)),
    200 + ((i * 137) % 1800),
    i % 3 === 0 ? 'Pendiente' : 'Cobrado',
  ])

  it('calcula el total exacto sobre todas las filas', async () => {
    const { configuracion, valida } = await analizar({
      Ventas: [['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'], ...filas],
    })
    expect(valida).toBe(true)
    expect(kpi(configuracion, 'total importe').valor).toBe(sumaDe(filas, 4))
  })

  it('propone evolución, comparativa y detalle', async () => {
    const { configuracion } = await analizar({
      Ventas: [['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'], ...filas],
    })
    expect(tiposGrafico(configuracion)).toContain('linea')
    expect(tiposGrafico(configuracion)).toContain('barras')
    expect(tiposGrafico(configuracion)).toContain('tabla')
    expect(configuracion.tipoDashboard).toMatch(/ventas|importes/i)
  })

  it('separa lo pendiente de lo cobrado', async () => {
    const { configuracion } = await analizar({
      Ventas: [['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'], ...filas],
    })
    const pendiente = configuracion.kpis.find((k) => /pendiente/i.test(k.etiqueta))
    const esperado = filas.filter((f) => f[5] === 'Pendiente').reduce((s, f) => s + f[4], 0)
    expect(pendiente.valor).toBe(esperado)
  })
})

describe('2. Excel de clientes (sin cifras)', () => {
  const filas = [
    ['Acme', 'Madrid', 'Activo'],
    ['Globex', 'Bilbao', 'Activo'],
    ['Initech', 'Valencia', 'Baja'],
    ['Umbrella', 'Madrid', 'Activo'],
    ['Stark', 'Bilbao', 'Activo'],
    ['Wayne', 'Madrid', 'Baja'],
  ]

  it('no inventa ingresos ni crecimiento', async () => {
    const { configuracion } = await analizar({ Clientes: [['Cliente', 'Ciudad', 'Estado'], ...filas] })
    const texto = JSON.stringify(configuracion.kpis).toLowerCase()
    expect(texto).not.toMatch(/ingreso|facturado|margen|crecimiento|beneficio/)
    expect(tiposGrafico(configuracion)).not.toContain('linea')
  })

  it('cuenta clientes y los reparte por ciudad y estado', async () => {
    const { configuracion } = await analizar({ Clientes: [['Cliente', 'Ciudad', 'Estado'], ...filas] })
    expect(configuracion.kpis[0].valor).toBe(6)
    const columnas = configuracion.graficos.flatMap((g) => g.procedencia.columnas)
    expect(columnas).toContain('Ciudad')
  })
})

describe('3. Excel de proyectos', () => {
  const filas = [
    ['Obra Mayor', 'En curso', 120000, 135000],
    ['Reforma Sur', 'Completado', 45000, 42000],
    ['Nave Norte', 'En curso', 80000, 81000],
    ['Local Centro', 'Completado', 30000, 28500],
    ['Ampliación', 'Planificado', 60000, 0],
  ]

  it('destaca presupuesto y desviación', async () => {
    const { configuracion } = await analizar({
      Proyectos: [['Proyecto', 'Estado', 'Presupuesto', 'Coste'], ...filas],
    })
    expect(configuracion.tipoDashboard).toMatch(/proyectos|obras/i)
    const desviacion = kpi(configuracion, 'desviación')
    expect(desviacion.valor).toBe(sumaDe(filas, 3) - sumaDe(filas, 2))
    expect(desviacion.procedencia.formula).toBe('SUM(Coste) - SUM(Presupuesto)')
  })
})

describe('4. Excel financiero', () => {
  const filas = Array.from({ length: 24 }, (_, i) => [
    new Date(Date.UTC(2024, i % 12, 1)),
    10000 + i * 250,
    6000 + i * 120,
  ])

  it('calcula beneficio y margen con su fórmula', async () => {
    const { configuracion } = await analizar({
      Finanzas: [['Fecha', 'Ingresos', 'Costes'], ...filas],
    })
    const beneficio = kpi(configuracion, 'beneficio')
    expect(beneficio.valor).toBe(sumaDe(filas, 1) - sumaDe(filas, 2))
    expect(configuracion.tipoDashboard).toBe('Panel financiero')

    const margen = configuracion.kpis.find((k) => k.unidad === '%' && /margen/i.test(k.etiqueta))
    if (margen) expect(margen.valor).toBeGreaterThan(0)
  })
})

describe('5. Excel de inventario', () => {
  const filas = [
    ['Cable 2,5 mm', 'Eléctrico', 3, 12.5],
    ['Tubo cobre 18', 'Fontanería', 6, 22.0],
    ['Cajas registro', 'Eléctrico', 48, 1.2],
    ['Soportes split', 'Clima', 15, 8.75],
    ['Abrazaderas', 'Fontanería', 200, 0.4],
    ['Termostatos', 'Clima', 9, 45.0],
  ]

  it('trata las unidades como cantidad y agrupa por familia', async () => {
    const { configuracion } = await analizar({
      Inventario: [['Material', 'Categoría', 'Unidades', 'Precio'], ...filas],
    })
    expect(configuracion.tipoDashboard).toMatch(/inventario/i)
    const columnas = configuracion.graficos.flatMap((g) => g.procedencia.columnas)
    expect(columnas).toContain('Categoría')
  })
})

describe('6. Excel con varias hojas relacionadas', () => {
  it('detecta la clave compartida entre hojas', async () => {
    const { relaciones, configuracion } = await analizar({
      Clientes: [
        ['Cliente_ID', 'Nombre', 'Ciudad'],
        ['C1', 'Acme', 'Madrid'],
        ['C2', 'Globex', 'Bilbao'],
        ['C3', 'Initech', 'Valencia'],
        ['C4', 'Umbrella', 'Madrid'],
      ],
      Ventas: [
        ['Venta_ID', 'Cliente_ID', 'Importe'],
        ['V1', 'C1', 1200],
        ['V2', 'C2', 800],
        ['V3', 'C1', 450],
        ['V4', 'C3', 300],
        ['V5', 'C2', 900],
      ],
    })

    expect(relaciones).toHaveLength(1)
    expect(relaciones[0].hacia.columna).toBe('Cliente_ID')
    expect(configuracion.fuentes).toHaveLength(2)
  })
})

describe('7. Excel con datos incompletos y sucios', () => {
  it('no se cae, avisa y sigue analizando', async () => {
    const { configuracion, valida } = await analizar({
      Ventas: [
        ['INFORME DE VENTAS', null, null, null],
        [null, null, null, null],
        ['Cliente', 'Fecha', 'Importe', 'Notas'],
        ['Acme', '15/01/2025', '1.200 €', null],
        ['globex', '20/01/2025', '800 €', null],
        ['ACME', 'sin fecha', '450 €', null],
        ['Initech', '05/02/2025', 'pendiente', null],
        ['Umbrella', '12/03/2025', '1.000 €', null],
        ['Stark', '20/04/2025', '600 €', null],
        ['TOTAL', null, '4.050 €', null],
      ],
    })

    expect(valida).toBe(true)
    // La fila de totales no se ha sumado dos veces
    expect(kpi(configuracion, 'total importe').valor).toBe(4050)

    const tipos = configuracion.calidad.problemas.map((p) => p.tipo)
    expect(tipos).toContain('fila-totales')
    expect(tipos).toContain('columnas-vacias')
    expect(tipos).toContain('categorias-equivalentes')
    expect(tipos).toContain('fechas-invalidas')
  })
})

describe('8. Excel con columnas desconocidas', () => {
  it('genera algo útil sin inventarse el significado', async () => {
    const { configuracion, valida } = await analizar({
      Hoja1: [
        ['Columna A', 'Columna B', 'Columna C'],
        ['xq', 'zt', 12],
        ['pl', 'mn', 45],
        ['xq', 'ab', 33],
        ['pl', 'zt', 21],
        ['xq', 'mn', 8],
      ],
    })

    expect(valida).toBe(true)
    expect(configuracion.tipoDashboard).toBe('Panel de datos')
    expect(configuracion.confianza.tipoDashboard).toBeLessThan(0.5)
    // Sigue produciendo un panel utilizable
    expect(configuracion.secciones.length).toBeGreaterThan(0)
    // Pero no le pone etiquetas de negocio que no le constan
    expect(textoDe(configuracion)).not.toMatch(/ingreso|cliente|factura/)
  })
})

describe('9. Excel con fechas en formatos variados', () => {
  it('las interpreta y deduce el orden día/mes de la columna', async () => {
    const { configuracion } = await analizar({
      Citas: [
        ['Fecha', 'Cliente', 'Importe'],
        ['31/01/2025', 'Acme', 100],
        ['15/02/2025', 'Globex', 200],
        ['01/03/2025', 'Initech', 300],
        ['20/04/2025', 'Umbrella', 400],
        ['05/05/2025', 'Stark', 500],
        ['12/06/2025', 'Wayne', 600],
      ],
    })

    const linea = configuracion.graficos.find((g) => g.tipo === 'linea')
    expect(linea).toBeDefined()
    // El 31/01 obliga a leer día/mes: enero debe ser el primer punto
    expect(linea.datos[0].clave).toBe('2025-01')
    expect(linea.datos).toHaveLength(6)
  })

  it('marca como grave el conflicto entre formatos de fecha', async () => {
    const { configuracion } = await analizar({
      Citas: [
        ['Fecha', 'Importe'],
        ['31/01/2025', 100],
        ['01/31/2025', 200],
        ['05/02/2025', 300],
        ['06/02/2025', 400],
      ],
    })
    const problema = configuracion.calidad.problemas.find((p) => p.tipo === 'fechas-ambiguas')
    expect(problema.gravedad).toBe('alta')
  })
})

describe('10. Excel con muchos registros', () => {
  it('procesa 20.000 filas con cifras exactas y en un tiempo razonable', async () => {
    const filas = Array.from({ length: 20000 }, (_, i) => [
      `Cliente ${i % 500}`,
      ['Madrid', 'Bilbao', 'Valencia', 'Sevilla'][i % 4],
      new Date(Date.UTC(2024, i % 12, (i % 28) + 1)),
      (i % 997) + 1,
    ])

    const inicio = Date.now()
    const { configuracion, valida } = await analizar({
      Ventas: [['Cliente', 'Ciudad', 'Fecha', 'Importe'], ...filas],
    })
    const duracion = Date.now() - inicio

    expect(valida).toBe(true)
    // El total sale de las 20.000 filas, no de una muestra
    expect(kpi(configuracion, 'total importe').valor).toBe(sumaDe(filas, 3))
    expect(duracion).toBeLessThan(15000)

    // Y lo que se pinta sigue siendo legible
    const barras = configuracion.graficos.find((g) => g.tipo === 'barras')
    expect(barras.datos.length).toBeLessThanOrEqual(9)
    const tabla = configuracion.graficos.find((g) => g.tipo === 'tabla')
    expect(tabla.datos.length).toBeLessThanOrEqual(8)
  }, 30000)
})

describe('progreso y resumen para el modelo', () => {
  it('va informando de cada etapa por orden', async () => {
    const etapas = []
    await analizarLibro(
      excel({
        Ventas: [
          ['Cliente', 'Importe'],
          ['Acme', 100],
          ['Globex', 200],
        ],
      }),
      { onProgreso: (id) => etapas.push(id) }
    )
    expect(etapas).toEqual(ETAPAS.map((e) => e.id))
  })

  it('el resumen para el modelo lleva las cifras hechas y ninguna fila', async () => {
    const filas = Array.from({ length: 200 }, (_, i) => [`Cliente ${i % 20}`, 100 + i])
    const resultado = await analizar({ Ventas: [['Cliente', 'Importe'], ...filas] })
    const resumen = resumirParaModelo(resultado)

    expect(resumen).toMatch(/CIFRAS YA CALCULADAS Y VALIDADAS/)
    expect(resumen).toMatch(/SUM\(Importe\)/)
    // El prompt no crece con el número de filas: no se vuelca ni un registro
    expect(resumen).not.toMatch(/Cliente 17/)
    expect(resumen.length).toBeLessThan(4000)
  })

  it('un archivo sin tablas no revienta', async () => {
    const { configuracion, avisos, valida } = await analizar({ Vacia: [[null, null]] })
    expect(valida).toBe(false)
    expect(avisos.some((a) => a.tipo === 'sin-tablas')).toBe(true)
    expect(configuracion.secciones).toEqual([])
  })
})
