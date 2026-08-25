import { describe, it, expect } from 'vitest'
import { construirModelo } from './modelo'
import { generarKpis } from './metricas'

function kpisDe(columnas, filas, hoja = 'Datos') {
  const tabla = { id: `${hoja}#0`, hoja, columnas: columnas.map((nombre) => ({ nombre })), filas, avisos: [] }
  return generarKpis(construirModelo(tabla))
}

const buscar = (kpis, fragmento) =>
  kpis.find((k) => k.etiqueta.toLowerCase().includes(fragmento.toLowerCase()))

describe('los KPIs dependen de lo que hay en los datos', () => {
  it('un Excel de ventas produce cifras monetarias', () => {
    const kpis = kpisDe(
      ['Factura', 'Cliente', 'Fecha', 'Importe', 'Estado'],
      [
        ['F1', 'Acme', '15/01/2025', 1200, 'Cobrado'],
        ['F2', 'Globex', '20/01/2025', 800, 'Pendiente'],
        ['F3', 'Acme', '10/02/2025', 450, 'Cobrado'],
        ['F4', 'Initech', '05/02/2025', 1000, 'Pendiente'],
        ['F5', 'Globex', '12/03/2025', 300, 'Cobrado'],
      ],
      'Ventas'
    )

    const total = buscar(kpis, 'total importe')
    expect(total.valor).toBe(3750)

    const pendiente = buscar(kpis, 'pendiente')
    expect(pendiente.valor).toBe(1800)
    expect(pendiente.detalle).toBe('2 facturas')
  })

  it('un Excel solo de clientes NO inventa ingresos ni ventas', () => {
    // El escenario del enunciado: Cliente | Ciudad | Estado
    const kpis = kpisDe(
      ['Cliente', 'Ciudad', 'Estado'],
      [
        ['Acme', 'Madrid', 'Activo'],
        ['Globex', 'Bilbao', 'Activo'],
        ['Initech', 'Valencia', 'Baja'],
        ['Umbrella', 'Madrid', 'Activo'],
      ],
      'Clientes'
    )

    const etiquetas = kpis.map((k) => k.etiqueta.toLowerCase()).join(' | ')
    expect(etiquetas).not.toMatch(/ingreso|venta|facturado|crecimiento|margen/)

    expect(buscar(kpis, 'clientes').valor).toBe(4)
    // Y sí puede contar por estado, que es lo que hay
    expect(buscar(kpis, 'en curso')?.valor ?? buscar(kpis, 'cancelado')?.valor).toBeDefined()
  })

  it('un Excel de proyectos destaca presupuesto y desviación', () => {
    const kpis = kpisDe(
      ['Proyecto', 'Estado', 'Presupuesto', 'Coste'],
      [
        ['Obra A', 'En curso', 10000, 12000],
        ['Obra B', 'Completado', 5000, 4500],
        ['Obra C', 'En curso', 8000, 8200],
      ],
      'Proyectos'
    )

    const desviacion = buscar(kpis, 'desviación')
    expect(desviacion.valor).toBe(1700)
    expect(desviacion.sentido).toBe('malo')
    expect(desviacion.procedencia.formula).toBe('SUM(Coste) - SUM(Presupuesto)')
  })
})

describe('métricas derivadas', () => {
  it('calcula beneficio y margen cuando existen ingresos y costes', () => {
    const kpis = kpisDe(
      ['Mes', 'Ingresos', 'Costes'],
      [
        ['Enero', 10000, 6000],
        ['Febrero', 12000, 7000],
      ],
      'Finanzas'
    )

    const beneficio = buscar(kpis, 'beneficio')
    expect(beneficio.valor).toBe(9000)
    expect(beneficio.procedencia.formula).toBe('SUM(Ingresos) - SUM(Costes)')

    const margen = buscar(kpis, 'margen')
    expect(margen.valor).toBeCloseTo(40.909, 2)
    expect(margen.unidad).toBe('%')
  })

  it('NO calcula margen si los ingresos suman cero (división por cero)', () => {
    // Un mes de ingresos anulado por una devolución del mismo importe
    const kpis = kpisDe(
      ['Mes', 'Ingresos', 'Costes'],
      [
        ['Enero', 1000, 600],
        ['Febrero', -1000, 700],
      ],
      'Finanzas'
    )
    expect(buscar(kpis, 'margen')).toBeUndefined()
    // El beneficio sí se puede calcular
    expect(buscar(kpis, 'beneficio').valor).toBe(-1300)
  })

  it('no resta importes en monedas distintas', () => {
    const kpis = kpisDe(
      ['Mes', 'Ingresos', 'Costes'],
      [
        ['Enero', '10.000 €', '6.000 $'],
        ['Febrero', '12.000 €', '7.000 $'],
      ],
      'Finanzas'
    )
    expect(buscar(kpis, 'beneficio')).toBeUndefined()
  })

  it('calcula el importe medio por registro', () => {
    const kpis = kpisDe(
      ['Factura', 'Importe'],
      [
        ['F1', 1000],
        ['F2', 2000],
        ['F3', 3000],
      ],
      'Facturas'
    )
    expect(buscar(kpis, 'factura media').valor).toBe(2000)
  })
})

describe('crecimiento', () => {
  it('compara el último periodo con el anterior', () => {
    const filas = [
      ['15/01/2025', 1000],
      ['20/01/2025', 1000],
      ['10/02/2025', 1000],
      ['15/02/2025', 500],
      ['10/03/2025', 3000],
    ]
    const kpis = kpisDe(['Fecha', 'Importe'], filas, 'Ventas')
    const crecimiento = kpis.find((k) => k.tipo === 'crecimiento')
    // Marzo (3000) frente a febrero (1500) → +100 %
    expect(crecimiento.valor).toBe(100)
    expect(crecimiento.valorFormateado).toBe('+100 %')
  })

  it('no calcula crecimiento con un solo periodo', () => {
    const kpis = kpisDe(
      ['Fecha', 'Importe'],
      [
        ['15/01/2025', 1000],
        ['20/01/2025', 500],
      ],
      'Ventas'
    )
    expect(kpis.find((k) => k.tipo === 'crecimiento')).toBeUndefined()
  })
})

describe('explicabilidad y fiabilidad', () => {
  it('cada KPI dice de dónde sale', () => {
    const kpis = kpisDe(
      ['Cliente', 'Importe'],
      [
        ['Acme', 1200],
        ['Globex', 800],
      ],
      'Ventas'
    )
    for (const k of kpis) {
      expect(k.procedencia.hoja).toBe('Ventas')
      expect(k.procedencia.formula).toBeTruthy()
      expect(k.procedencia.explicacion).toBeTruthy()
    }
    const total = buscar(kpis, 'total importe')
    expect(total.procedencia.formula).toBe('SUM(Importe)')
    expect(total.procedencia.explicacion).toMatch(/Suma de los 2 valores/)
  })

  it('descarta las columnas no fiables por mezclar monedas', () => {
    const kpis = kpisDe(
      ['Cliente', 'Importe'],
      [
        ['Acme', '1.200 €'],
        ['Globex', '800 $'],
        ['Initech', '500 €'],
      ],
      'Ventas'
    )
    // No se suman euros con dólares
    expect(buscar(kpis, 'total importe')).toBeUndefined()
    // Pero el recuento de filas sigue siendo válido
    const recuento = kpis.find((k) => k.tipo === 'cuenta')
    expect(recuento.valor).toBe(3)
  })

  it('no usa para un KPI una columna cuya interpretación es dudosa', () => {
    // "Importe" con fechas dentro: la confianza cae y no genera cifra
    const kpis = kpisDe(
      ['Cliente', 'Importe'],
      [
        ['Acme', '14/03/2025'],
        ['Globex', '15/03/2025'],
        ['Initech', '20/06/2025'],
      ],
      'Ventas'
    )
    expect(buscar(kpis, 'total importe')).toBeUndefined()
  })

  it('siempre queda al menos el recuento de filas', () => {
    const kpis = kpisDe(['Columna 1'], [['xq'], ['zt'], ['pl']], 'Rara')
    expect(kpis.length).toBeGreaterThanOrEqual(1)
    expect(kpis[0].procedencia.formula).toBe('COUNT(filas)')
  })
})
