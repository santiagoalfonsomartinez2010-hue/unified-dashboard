import { describe, it, expect } from 'vitest'
import { perfilarColumna, perfilarTabla } from './perfilado'
import { TIPOS } from './tipos'

const perfilar = (valores, nombre = 'Columna 1') => perfilarColumna(valores, nombre)

describe('estadísticas básicas', () => {
  it('cuenta nulos, únicos y calcula min/max/media/mediana', () => {
    const p = perfilar([10, 20, 30, 40, null, ''], 'Importe')
    expect(p.total).toBe(6)
    expect(p.nulos).toBe(2)
    expect(p.noNulos).toBe(4)
    expect(p.unicos).toBe(4)
    expect(p.min).toBe(10)
    expect(p.max).toBe(40)
    expect(p.media).toBe(25)
    expect(p.mediana).toBe(25)
    expect(p.suma).toBe(100)
    expect(p.porcentajeNulos).toBeCloseTo(33.33, 1)
  })

  it('detecta outliers sin eliminarlos', () => {
    const valores = [10, 11, 12, 11, 10, 12, 11, 10, 5000]
    const p = perfilar(valores, 'Importe')
    expect(p.outliers).toBe(1)
    expect(p.ejemplosOutliers).toContain(5000)
    // Los datos siguen enteros: se avisa, no se corrige
    expect(p.noNulos).toBe(9)
  })

  it('registra los tipos mezclados y baja la confianza', () => {
    const p = perfilar([10, 20, 'pendiente', 40, 50], 'Importe')
    expect(p.tipo).toBe(TIPOS.NUMERO)
    expect(p.tipoMixto).toBe(true)
    expect(p.confianzaTipo).toBeCloseTo(0.8)
  })

  it('cuenta los números guardados como texto', () => {
    const p = perfilar(['1.200 €', '850 €', '3.000 €'], 'Importe')
    expect(p.tipo).toBe(TIPOS.MONEDA)
    expect(p.numerosComoTexto).toBe(3)
    expect(p.suma).toBe(5050)
    expect(p.moneda).toBe('EUR')
  })

  it('avisa de monedas mezcladas', () => {
    const p = perfilar(['100 €', '200 $', '300 €'], 'Importe')
    expect(p.monedasMezcladas).toEqual(expect.arrayContaining(['EUR', 'USD']))
    expect(p.moneda).toBeNull()
  })

  it('agrupa mayúsculas y acentos al contar valores distintos', () => {
    const p = perfilar(['Madrid', 'madrid', 'MADRID', 'Bilbao'], 'Ciudad')
    expect(p.unicos).toBe(2)
    expect(p.valoresFrecuentes[0].cuenta).toBe(3)
  })

  it('guarda el rango de fechas', () => {
    const p = perfilar(['01/03/2025', '15/01/2025', '20/06/2025'], 'Fecha')
    expect(p.tipo).toBe(TIPOS.FECHA)
    expect(p.rangoFechas).toEqual({ min: '2025-01-15', max: '2025-06-20' })
  })
})

describe('papeles de la columna', () => {
  it('reconoce un identificador de texto con forma de código', () => {
    const p = perfilar(['F-2026-014', 'F-2026-015', 'F-2026-016'], 'Nº factura')
    expect(p.esIdentificador).toBe(true)
    expect(p.esMetrica).toBe(false)
    expect(p.esDimension).toBe(false)
  })

  it('NO toma por identificador una columna de importes casi única', () => {
    // El caso del enunciado: 94 % de valores únicos pero no es un id
    const valores = Array.from({ length: 100 }, (_, i) => 120 + i * 13.5)
    const p = perfilar(valores, 'Importe')
    expect(p.porcentajeUnicos).toBe(100)
    expect(p.esIdentificador).toBe(false)
    expect(p.esMetrica).toBe(true)
  })

  it('no considera métrica una columna de años', () => {
    const p = perfilar([2023, 2024, 2025, 2023, 2024], 'Año')
    expect(p.esMetrica).toBe(false)
    expect(p.esDimension).toBe(true)
  })

  it('no considera métrica una columna constante', () => {
    const p = perfilar([5, 5, 5, 5], 'Valor')
    expect(p.esMetrica).toBe(false)
  })

  it('una columna de texto repetido sirve para agrupar', () => {
    const p = perfilar(['Madrid', 'Bilbao', 'Madrid', 'Madrid', 'Bilbao'], 'Ciudad')
    expect(p.esDimension).toBe(true)
  })

  it('el texto largo no sirve para agrupar', () => {
    const largo = 'Descripción detallada del trabajo realizado en la obra durante el mes'
    const p = perfilar([largo, largo + ' 2', largo + ' 3'], 'Notas')
    expect(p.esDimension).toBe(false)
  })
})

describe('fechas en formato de serie de Excel', () => {
  it('las interpreta cuando el nombre lo sugiere', () => {
    const p = perfilar([45000, 45010, 45020], 'Fecha de venta')
    expect(p.tipo).toBe(TIPOS.FECHA)
  })

  it('NO convierte importes grandes en fechas', () => {
    const p = perfilar([45000, 45010, 45020], 'Importe')
    expect(p.tipo).toBe(TIPOS.NUMERO)
    expect(p.suma).toBe(135030)
  })
})

describe('perfilado de una tabla completa', () => {
  it('devuelve la capa normalizada alineada con las columnas', () => {
    const tabla = {
      columnas: [{ nombre: 'Cliente' }, { nombre: 'Fecha' }, { nombre: 'Importe' }],
      filas: [
        ['Acme', '14/03/2025', '1.200 €'],
        ['Globex', '15/03/2025', '850 €'],
      ],
    }
    const { columnas, filasNormalizadas } = perfilarTabla(tabla)
    expect(columnas.map((c) => c.tipo)).toEqual([TIPOS.TEXTO, TIPOS.FECHA, TIPOS.MONEDA])
    expect(filasNormalizadas[0]).toEqual(['Acme', '2025-03-14', 1200])
    expect(filasNormalizadas[1][2]).toBe(850)
    // El perfil no se queda con una copia de todos los valores
    expect(columnas[0].normalizados).toBeUndefined()
  })
})
