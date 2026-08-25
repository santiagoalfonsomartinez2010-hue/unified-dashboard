import { describe, it, expect } from 'vitest'
import { construirModelo } from './modelo'
import { generarConfiguracion } from './layout'
import { generarInsights } from './insights'

function modeloDe(columnas, filas, hoja = 'Datos') {
  return construirModelo({
    id: `${hoja}#0`,
    hoja,
    columnas: columnas.map((nombre) => ({ nombre })),
    filas,
    avisos: [],
  })
}

const configDe = (...args) => generarConfiguracion([modeloDe(...args)])
const tiposDeGrafico = (config) => config.graficos.map((g) => g.tipo)
const seccion = (config, id) => config.secciones.find((s) => s.id === id)

// Un año de ventas con cliente, ciudad, fecha, importe y estado
function ventas(n = 60) {
  const clientes = ['Acme', 'Globex', 'Initech', 'Umbrella']
  const ciudades = ['Madrid', 'Bilbao', 'Valencia']
  const estados = ['Cobrado', 'Pendiente']
  return Array.from({ length: n }, (_, i) => [
    `F-${1000 + i}`,
    clientes[i % clientes.length],
    ciudades[i % ciudades.length],
    `2025-${String((i % 12) + 1).padStart(2, '0')}-15`,
    200 + ((i * 137) % 2000),
    estados[i % 2],
  ])
}

describe('selección de gráficos según la pregunta', () => {
  it('con fechas propone una línea de evolución', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const linea = config.graficos.find((g) => g.tipo === 'linea')
    expect(linea).toBeDefined()
    expect(linea.pregunta).toBe('¿Cómo evoluciona en el tiempo?')
    expect(linea.datos.length).toBeGreaterThanOrEqual(3)
  })

  it('sin fechas NO propone ninguna línea', () => {
    const config = configDe(
      ['Cliente', 'Ciudad', 'Estado'],
      [
        ['Acme', 'Madrid', 'Activo'],
        ['Globex', 'Bilbao', 'Activo'],
        ['Initech', 'Valencia', 'Baja'],
        ['Umbrella', 'Madrid', 'Activo'],
        ['Stark', 'Bilbao', 'Activo'],
      ],
      'Clientes'
    )
    expect(tiposDeGrafico(config)).not.toContain('linea')
    expect(tiposDeGrafico(config)).toContain('barras')
  })

  it('usa donut solo con pocas categorías', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const donut = config.graficos.find((g) => g.tipo === 'donut')
    expect(donut.datos.length).toBeLessThanOrEqual(6)
  })

  it('NO dibuja un donut con decenas de categorías', () => {
    const filas = Array.from({ length: 60 }, (_, i) => [`Producto ${i}`, 100 + i])
    const config = configDe(['Producto', 'Importe'], filas, 'Catalogo')
    expect(tiposDeGrafico(config)).not.toContain('donut')
  })

  it('propone histograma y dispersión solo con volumen suficiente', () => {
    const filas = Array.from({ length: 60 }, (_, i) => [
      `P${i}`,
      100 + ((i * 37) % 900),
      50 + ((i * 53) % 400),
    ])
    const config = configDe(['Ref', 'Ingresos', 'Costes'], filas, 'Finanzas')
    expect(tiposDeGrafico(config)).toContain('histograma')
    expect(tiposDeGrafico(config)).toContain('dispersion')

    // Con pocas filas, ninguno de los dos
    const pocas = configDe(
      ['Ref', 'Ingresos', 'Costes'],
      filas.slice(0, 6),
      'Finanzas'
    )
    expect(tiposDeGrafico(pocas)).not.toContain('histograma')
    expect(tiposDeGrafico(pocas)).not.toContain('dispersion')
  })

  it('no compara una dimensión cuyos grupos valen todos lo mismo', () => {
    const filas = Array.from({ length: 12 }, (_, i) => [`Cliente ${i % 3}`, 100])
    const config = configDe(['Cliente', 'Importe'], filas, 'Ventas')
    const barras = config.graficos.find((g) => g.tipo === 'barras')
    expect(barras).toBeUndefined()
  })
})

describe('evitar información redundante', () => {
  it('no repite el mismo par dimensión/métrica en dos gráficos', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const firmas = config.graficos
      .filter((g) => g.tipo === 'barras')
      .map((g) => g.procedencia.columnas.join('|'))
    expect(new Set(firmas).size).toBe(firmas.length)
  })

  it('no cuenta la misma dimensión en barras y en donut a la vez', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    // "Estado" tiene dos valores: le va mejor el donut, y entonces no debe
    // aparecer además como barras.
    const donut = config.graficos.find((g) => g.tipo === 'donut')
    expect(donut.procedencia.columnas).toContain('Estado')

    const dimensionesEnBarras = config.graficos
      .filter((g) => g.tipo === 'barras')
      .flatMap((g) => g.procedencia.columnas)
    expect(dimensionesEnBarras).not.toContain('Estado')
  })

  it('limita los KPIs de cabecera a cuatro', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    expect(config.kpis.length).toBeLessThanOrEqual(4)
  })

  it('agrupa la cola larga en "Otros" en vez de dibujar 60 barras', () => {
    const filas = Array.from({ length: 60 }, (_, i) => [`Producto ${i}`, 100 + i])
    const config = configDe(['Producto', 'Importe'], filas, 'Catalogo')
    const barras = config.graficos.find((g) => g.tipo === 'barras')
    expect(barras.datos.length).toBeLessThanOrEqual(9)
    expect(barras.totalGrupos).toBe(60)
  })
})

describe('layout adaptativo', () => {
  it('un Excel rico genera muchas secciones', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const ids = config.secciones.map((s) => s.id)
    expect(ids).toContain('cifras')
    expect(ids).toContain('evolucion')
    expect(ids).toContain('comparativa')
    expect(ids).toContain('detalle')
  })

  it('un Excel pobre genera un panel corto y sin inventos', () => {
    const config = configDe(
      ['Cliente', 'Ciudad'],
      [
        ['Acme', 'Madrid'],
        ['Globex', 'Bilbao'],
        ['Initech', 'Valencia'],
        ['Umbrella', 'Madrid'],
      ],
      'Clientes'
    )
    const ids = config.secciones.map((s) => s.id)
    expect(ids).not.toContain('evolucion')
    expect(ids).not.toContain('distribucion')
    expect(config.secciones.length).toBeLessThanOrEqual(4)

    const texto = JSON.stringify(config.kpis).toLowerCase()
    expect(texto).not.toMatch(/ingreso|venta|margen|crecimiento/)
  })

  it('las secciones van en el orden en que se lee un panel', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const ids = config.secciones.map((s) => s.id)
    expect(ids.indexOf('cifras')).toBeLessThan(ids.indexOf('evolucion'))
    expect(ids.indexOf('evolucion')).toBeLessThan(ids.indexOf('comparativa'))
    expect(ids.indexOf('comparativa')).toBeLessThan(ids.indexOf('detalle'))
  })
})

describe('filtros dinámicos', () => {
  it('convierte en filtro las dimensiones con pocos valores', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    const columnas = config.filtros.map((f) => f.columna)
    expect(columnas).toContain('Ciudad')
    expect(columnas).toContain('Estado')
    // La fecha aporta un filtro de rango
    expect(config.filtros.find((f) => f.tipo === 'fecha').columna).toBe('Fecha')
  })

  it('no crea filtros de columnas sin valor para filtrar', () => {
    const filas = Array.from({ length: 60 }, (_, i) => [`F-${i}`, `Cliente ${i}`, 100 + i])
    const config = configDe(['Factura', 'Cliente', 'Importe'], filas, 'Ventas')
    const columnas = config.filtros.map((f) => f.columna)
    // 60 clientes distintos no son un desplegable útil; el nº de factura menos
    expect(columnas).not.toContain('Factura')
    expect(columnas).not.toContain('Cliente')
  })
})

describe('tipo de dashboard', () => {
  it('reconoce un panel financiero', () => {
    const config = configDe(
      ['Mes', 'Ingresos', 'Costes'],
      [
        ['Enero', 10000, 6000],
        ['Febrero', 12000, 7000],
        ['Marzo', 9000, 8000],
      ],
      'Finanzas'
    )
    expect(config.tipoDashboard).toBe('Panel financiero')
  })

  it('reconoce control de proyectos', () => {
    const config = configDe(
      ['Proyecto', 'Estado', 'Presupuesto', 'Coste'],
      [
        ['Obra A', 'En curso', 10000, 12000],
        ['Obra B', 'Completado', 5000, 4500],
        ['Obra C', 'En curso', 8000, 8200],
      ],
      'Proyectos'
    )
    expect(config.tipoDashboard).toMatch(/proyectos|obras/i)
  })

  it('sigue adelante con nombre neutro si no hay pistas', () => {
    const config = configDe(
      ['Columna 1', 'Columna 2'],
      [
        ['xq', 'zt'],
        ['pl', 'mn'],
        ['ab', 'cd'],
      ],
      'Hoja1'
    )
    expect(config.tipoDashboard).toBe('Panel de datos')
    expect(config.confianza.tipoDashboard).toBeLessThan(0.5)
    // Y aun así produce algo utilizable
    expect(config.secciones.length).toBeGreaterThan(0)
  })
})

describe('insights: cálculos, nunca causas', () => {
  it('detecta concentración con cifras', () => {
    const filas = [
      ...Array.from({ length: 10 }, (_, i) => ['Reformas Marín', 1000 + i]),
      ['Panadería', 200],
      ['Gimnasio', 150],
      ['Clínica', 100],
    ]
    const insights = generarInsights(modeloDe(['Cliente', 'Importe'], filas, 'Ventas'))
    const concentracion = insights.find((i) => i.tipo === 'concentracion')
    expect(concentracion.texto).toMatch(/Reformas Marín concentra el \d+ %/)
    expect(concentracion.procedencia.formula).toContain('GROUP BY')
  })

  it('describe la variación sin explicar por qué ocurre', () => {
    const filas = [
      ['2025-01-10', 1000],
      ['2025-02-10', 1000],
      ['2025-03-10', 3000],
      ['2025-04-10', 3100],
      ['2025-05-10', 3200],
      ['2025-06-10', 3300],
    ]
    const insights = generarInsights(modeloDe(['Fecha', 'Importe'], filas, 'Ventas'))
    const subida = insights.find((i) => i.tipo === 'subida')
    expect(subida.texto).toMatch(/subió un \d+ %/)

    // Ningún insight puede contener una explicación causal
    for (const i of insights) {
      expect(i.texto).not.toMatch(/\bporque\b|\bdebido a\b|\bgracias a\b|\bse debe a\b/i)
    }
  })

  it('no saca conclusiones de cuatro filas', () => {
    const insights = generarInsights(
      modeloDe(['Cliente', 'Importe'], [['Acme', 100], ['Globex', 200]], 'Ventas')
    )
    expect(insights).toHaveLength(0)
  })
})

describe('explicabilidad', () => {
  it('todos los gráficos dicen de dónde salen', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    for (const g of config.graficos) {
      expect(g.procedencia.hoja).toBe('Ventas')
      expect(g.procedencia.formula).toBeTruthy()
      expect(g.procedencia.columnas.length).toBeGreaterThan(0)
    }
  })

  it('la configuración describe métricas, dimensiones y confianza', () => {
    const config = configDe(
      ['Factura', 'Cliente', 'Ciudad', 'Fecha', 'Importe', 'Estado'],
      ventas(),
      'Ventas'
    )
    expect(config.metricas.map((m) => m.columna)).toContain('Importe')
    expect(config.dimensiones.map((d) => d.columna)).toContain('Ciudad')
    expect(config.confianza.global).toBeGreaterThan(0)
    expect(config.fuentes[0]).toMatchObject({ hoja: 'Ventas', filas: 60 })
  })
})
