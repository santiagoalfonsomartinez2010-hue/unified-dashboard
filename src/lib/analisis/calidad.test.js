import { describe, it, expect } from 'vitest'
import { perfilarTabla } from './perfilado'
import { analizarCalidad, columnasNoFiables } from './calidad'

// Construye tabla + perfil + informe de calidad de una sola vez
function analizar(columnas, filas, avisos = []) {
  const tabla = { columnas: columnas.map((nombre) => ({ nombre })), filas, avisos }
  const perfil = perfilarTabla(tabla)
  return { calidad: analizarCalidad(tabla, perfil), perfil }
}

const tipos = (calidad) => calidad.problemas.map((p) => p.tipo)

describe('detección de problemas', () => {
  it('avisa de columnas medio vacías', () => {
    const { calidad } = analizar(
      ['Cliente', 'Teléfono'],
      [
        ['Acme', null],
        ['Globex', null],
        ['Initech', null],
        ['Umbrella', '600111222'],
      ]
    )
    const p = calidad.problemas.find((x) => x.tipo === 'columna-vacia')
    expect(p).toBeDefined()
    expect(p.columna).toBe('Teléfono')
  })

  it('avisa de formatos mezclados en una columna', () => {
    const { calidad } = analizar(
      ['Importe'],
      [[100], [200], ['pendiente'], [400], [500]]
    )
    expect(tipos(calidad)).toContain('formato-inconsistente')
  })

  it('cuenta las fechas mal escritas y dice que se excluyen', () => {
    const { calidad } = analizar(
      ['Fecha'],
      [['01/03/2025'], ['15/01/2025'], ['no consta'], ['31/02/2025'], ['20/06/2025']]
    )
    const p = calidad.problemas.find((x) => x.tipo === 'fechas-invalidas')
    expect(p).toBeDefined()
    expect(p.detalle.invalidas).toBe(2)
    expect(p.mensaje).toMatch(/excluido del análisis temporal/)
  })

  it('marca como grave la mezcla de monedas', () => {
    const { calidad } = analizar(['Importe'], [['100 €'], ['200 $'], ['300 €']])
    const p = calidad.problemas.find((x) => x.tipo === 'monedas-mezcladas')
    expect(p.gravedad).toBe('alta')
    expect(columnasNoFiables(calidad).has('Importe')).toBe(true)
  })

  it('agrupa categorías escritas de varias formas sin tocar los datos', () => {
    const filas = [['Madrid'], ['madrid'], ['MADRID'], ['Bilbao']]
    const { calidad, perfil } = analizar(['Ciudad'], filas)
    const p = calidad.problemas.find((x) => x.tipo === 'categorias-equivalentes')
    expect(p).toBeDefined()
    expect(p.detalle.variantes[0].formas).toEqual(
      expect.arrayContaining(['Madrid', 'madrid', 'MADRID'])
    )
    // Los valores originales siguen intactos en la capa normalizada
    expect(perfil.filasNormalizadas.map((f) => f[0])).toEqual(['Madrid', 'madrid', 'MADRID', 'Bilbao'])
  })

  it('detecta números guardados como texto', () => {
    const { calidad } = analizar(['Importe'], [['1.200'], ['850'], ['3.000']])
    expect(tipos(calidad)).toContain('numeros-como-texto')
  })

  it('detecta filas repetidas comparando la versión normalizada', () => {
    const { calidad } = analizar(
      ['Cliente', 'Importe'],
      [
        ['Acme', '1.200 €'],
        ['ACME', 1200],
        ['Globex', 800],
      ]
    )
    const p = calidad.problemas.find((x) => x.tipo === 'filas-duplicadas')
    expect(p.detalle.duplicadas).toBe(1)
  })

  it('detecta valores extremos sin descartarlos', () => {
    const filas = [[10], [11], [12], [11], [10], [12], [11], [10], [5000]]
    const { calidad, perfil } = analizar(['Importe'], filas)
    expect(tipos(calidad)).toContain('valores-extremos')
    expect(perfil.filas).toBe(9)
  })

  it('marca como grave el conflicto de formato de fecha', () => {
    const { calidad } = analizar(
      ['Fecha'],
      [['31/01/2025'], ['01/31/2025'], ['05/02/2025'], ['06/02/2025']]
    )
    const p = calidad.problemas.find((x) => x.tipo === 'fechas-ambiguas')
    expect(p.gravedad).toBe('alta')
  })

  it('arrastra los avisos de la lectura', () => {
    const { calidad } = analizar(['Cliente'], [['Acme'], ['Globex']], [
      { tipo: 'fila-totales', mensaje: 'Se ha excluido una fila de totales.' },
    ])
    expect(tipos(calidad)).toContain('fila-totales')
  })
})

describe('valoración global', () => {
  it('da nota alta a unos datos limpios', () => {
    const { calidad } = analizar(
      ['Cliente', 'Ciudad', 'Importe'],
      [
        ['Acme', 'Madrid', 1200],
        ['Globex', 'Bilbao', 800],
        ['Initech', 'Madrid', 450],
        ['Umbrella', 'Valencia', 300],
      ]
    )
    expect(calidad.problemas).toHaveLength(0)
    expect(calidad.puntuacion).toBe(1)
    expect(calidad.resumen).toMatch(/No se han detectado problemas/)
  })

  it('baja la nota cuando hay problemas graves', () => {
    const { calidad } = analizar(
      ['Importe'],
      [['100 €'], ['200 $'], [null], [null], ['pendiente']]
    )
    expect(calidad.puntuacion).toBeLessThan(0.8)
    expect(calidad.resumen).toMatch(/afectan a los cálculos/)
  })
})
