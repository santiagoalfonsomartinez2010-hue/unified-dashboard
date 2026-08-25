import { describe, it, expect } from 'vitest'
import { perfilarTabla } from './perfilado'
import {
  totales,
  contarDistintos,
  agruparPor,
  serieTemporal,
  derivarTiempo,
  granularidadRecomendada,
  etiquetaDePeriodo,
} from './agregacion'

function perfilDe(columnas, filas) {
  return perfilarTabla({ columnas: columnas.map((nombre) => ({ nombre })), filas })
}

const VENTAS = perfilDe(
  ['Cliente', 'Ciudad', 'Fecha', 'Importe'],
  [
    ['Acme', 'Madrid', '15/01/2025', '1.200 €'],
    ['Globex', 'Bilbao', '20/01/2025', 800],
    ['Acme', 'madrid', '10/02/2025', 450],
    ['Initech', 'Valencia', '05/02/2025', '1.000 €'],
    ['Globex', 'BILBAO', '12/03/2025', 300],
  ]
)

describe('totales', () => {
  it('suma todas las filas, no una muestra', () => {
    const t = totales(VENTAS, 3)
    expect(t.suma).toBe(3750)
    expect(t.cuenta).toBe(5)
    expect(t.media).toBe(750)
    expect(t.min).toBe(300)
    expect(t.max).toBe(1200)
  })

  it('ignora los valores no numéricos sin falsear la media', () => {
    const p = perfilDe(['Importe'], [[100], ['pendiente'], [300], [null]])
    const t = totales(p, 0)
    expect(t.suma).toBe(400)
    expect(t.cuenta).toBe(2)
    expect(t.media).toBe(200)
  })

  it('cuenta distintos agrupando mayúsculas', () => {
    expect(contarDistintos(VENTAS, 1)).toBe(3)
    expect(contarDistintos(VENTAS, 0)).toBe(3)
  })
})

describe('agrupaciones', () => {
  it('suma una métrica por dimensión y ordena de mayor a menor', () => {
    const { grupos } = agruparPor(VENTAS, 1, 3)
    expect(grupos).toEqual([
      { etiqueta: 'Madrid', valor: 1650, cuenta: 2 },
      { etiqueta: 'Bilbao', valor: 1100, cuenta: 2 },
      { etiqueta: 'Valencia', valor: 1000, cuenta: 1 },
    ])
  })

  it('usa la escritura más frecuente como etiqueta del grupo', () => {
    const p = perfilDe(['Ciudad'], [['madrid'], ['Madrid'], ['Madrid'], ['MADRID']])
    const { grupos } = agruparPor(p, 0)
    expect(grupos[0].etiqueta).toBe('Madrid')
    expect(grupos[0].valor).toBe(4)
  })

  it('cuenta registros cuando no hay métrica que sumar', () => {
    const { grupos } = agruparPor(VENTAS, 0)
    expect(grupos[0]).toEqual({ etiqueta: 'Acme', valor: 2, cuenta: 2 })
  })

  it('agrupa la cola en "Otros" para no dibujar un gráfico ilegible', () => {
    const filas = Array.from({ length: 30 }, (_, i) => [`Cliente ${i}`, 100 - i])
    const p = perfilDe(['Cliente', 'Importe'], filas)
    const { grupos, totalGrupos, hayOtros } = agruparPor(p, 0, 1, { limite: 5 })
    expect(totalGrupos).toBe(30)
    expect(hayOtros).toBe(true)
    expect(grupos).toHaveLength(6)
    expect(grupos[5].etiqueta).toBe('Otros')
    // Nada se pierde por el camino: el total sigue cuadrando
    const suma = grupos.reduce((s, g) => s + g.valor, 0)
    expect(suma).toBe(filas.reduce((s, f) => s + f[1], 0))
  })

  it('no inventa un "Otros" para una media', () => {
    const filas = Array.from({ length: 20 }, (_, i) => [`C${i}`, 100 + i])
    const p = perfilDe(['Cliente', 'Importe'], filas)
    const { grupos, hayOtros } = agruparPor(p, 0, 1, { limite: 5, operacion: 'media' })
    expect(hayOtros).toBe(false)
    expect(grupos).toHaveLength(5)
  })
})

describe('dimensiones temporales derivadas', () => {
  it('descompone una fecha en año, trimestre, mes, semana y día', () => {
    expect(derivarTiempo('2025-03-14')).toEqual({
      anio: '2025',
      trimestre: '2025-T1',
      mes: '2025-03',
      semana: '2025-W11',
      dia: '2025-03-14',
    })
  })

  it('calcula bien la semana ISO en el cambio de año', () => {
    // El 31/12/2024 pertenece a la semana 1 de 2025 según ISO 8601
    expect(derivarTiempo('2024-12-31').semana).toBe('2025-W01')
  })

  it('elige la granularidad según el periodo cubierto', () => {
    expect(granularidadRecomendada({ min: '2025-03-01', max: '2025-03-20' })).toBe('dia')
    expect(granularidadRecomendada({ min: '2025-01-01', max: '2025-03-15' })).toBe('semana')
    expect(granularidadRecomendada({ min: '2024-01-01', max: '2025-06-01' })).toBe('mes')
    expect(granularidadRecomendada({ min: '2019-01-01', max: '2025-06-01' })).toBe('trimestre')
    // Todo en el mismo día: no hay evolución que enseñar
    expect(granularidadRecomendada({ min: '2025-03-01', max: '2025-03-01' })).toBeNull()
  })
})

describe('series temporales', () => {
  it('agrega por mes en orden cronológico, no por tamaño', () => {
    const { puntos } = serieTemporal(VENTAS, 2, 3, { granularidad: 'mes' })
    expect(puntos.map((p) => p.clave)).toEqual(['2025-01', '2025-02', '2025-03'])
    expect(puntos.map((p) => p.valor)).toEqual([2000, 1450, 300])
    expect(puntos[0].etiqueta).toBe('Ene 25')
  })

  it('cuenta registros por periodo si no hay métrica', () => {
    const { puntos } = serieTemporal(VENTAS, 2, null, { granularidad: 'mes' })
    expect(puntos.map((p) => p.valor)).toEqual([2, 2, 1])
  })

  it('etiqueta cada granularidad de forma legible', () => {
    expect(etiquetaDePeriodo('2025-03', 'mes')).toBe('Mar 25')
    expect(etiquetaDePeriodo('2025-T2', 'trimestre')).toBe('T2 25')
    expect(etiquetaDePeriodo('2025-W11', 'semana')).toBe('Sem 11')
    expect(etiquetaDePeriodo('2025-03-14', 'dia')).toBe('14 Mar')
    expect(etiquetaDePeriodo('2025', 'anio')).toBe('2025')
  })
})
