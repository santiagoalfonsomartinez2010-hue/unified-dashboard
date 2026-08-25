import { describe, it, expect } from 'vitest'
import { perfilarColumna } from './perfilado'
import { inferirSemantica, SEMANTICA } from './semantica'

const semanticaDe = (valores, nombre) => inferirSemantica(perfilarColumna(valores, nombre))

describe('nombre y valores de acuerdo', () => {
  it('da confianza alta cuando ambos coinciden', () => {
    const r = semanticaDe(['1.200 €', '850 €', '3.000 €'], 'Importe')
    expect(r.semantica).toBe(SEMANTICA.IMPORTE)
    expect(r.confianza).toBeGreaterThanOrEqual(0.9)
    expect(r.conflicto).toBeNull()
    expect(r.rol).toBe('metrica')
  })

  it('distingue coste de ingreso por el nombre', () => {
    expect(semanticaDe([100, 200, 300], 'Coste material').semantica).toBe(SEMANTICA.COSTE)
    expect(semanticaDe([100, 200, 300], 'Ingresos').semantica).toBe(SEMANTICA.INGRESO)
    expect(semanticaDe([100, 200, 300], 'Presupuesto').semantica).toBe(SEMANTICA.PRESUPUESTO)
  })

  it('reconoce fechas y las marca como dimensión temporal', () => {
    const r = semanticaDe(['14/03/2025', '15/03/2025', '20/06/2025'], 'Fecha de venta')
    expect(r.semantica).toBe(SEMANTICA.FECHA)
    expect(r.rol).toBe('temporal')
  })
})

describe('mandan los valores sobre el nombre', () => {
  it('una columna llamada "Importe" con fechas NO es dinero', () => {
    // El requisito explícito del enunciado
    const r = semanticaDe(['14/03/2025', '15/03/2025', '20/06/2025'], 'Importe')
    expect(r.semantica).toBe(SEMANTICA.FECHA)
    expect(r.conflicto).toEqual({
      nombreSugiere: SEMANTICA.IMPORTE,
      valoresIndican: SEMANTICA.FECHA,
    })
    // Y la confianza baja para que no se use en un KPI destacado
    expect(r.confianza).toBeLessThanOrEqual(0.55)
  })

  it('una columna llamada "Cliente" con correos se lee como correo', () => {
    const r = semanticaDe(['a@x.com', 'b@y.es', 'c@z.org'], 'Cliente')
    expect(r.semantica).toBe(SEMANTICA.EMAIL)
    expect(r.conflicto).not.toBeNull()
    expect(r.rol).toBe('ninguno')
  })

  it('detecta estados aunque la columna no tenga nombre útil', () => {
    const r = semanticaDe(
      ['Pendiente', 'Cobrado', 'Pendiente', 'Cobrado', 'Cancelado'],
      'Columna 4'
    )
    expect(r.semantica).toBe(SEMANTICA.ESTADO)
    expect(r.rol).toBe('dimension')
  })

  it('detecta ubicaciones por el vocabulario de ciudades', () => {
    const r = semanticaDe(['Madrid', 'Bilbao', 'Valencia', 'Madrid'], 'Columna 2')
    expect(r.semantica).toBe(SEMANTICA.UBICACION)
  })
})

describe('confianza', () => {
  it('baja cuando la columna mezcla tipos', () => {
    const r = semanticaDe([100, 200, 'pendiente', 400, 500], 'Importe')
    expect(r.confianza).toBeLessThanOrEqual(0.6)
  })

  it('baja cuando la columna está medio vacía', () => {
    const r = semanticaDe([100, null, null, null, 500, null], 'Importe')
    expect(r.confianza).toBeLessThanOrEqual(0.5)
  })

  it('es baja cuando no hay ninguna pista', () => {
    const r = semanticaDe(['xq', 'zt', 'pl', 'mn'], 'Columna 3')
    expect(r.confianza).toBeLessThan(0.6)
  })

  it('no declara identificador por unicidad con muy pocas filas', () => {
    // Con 4 filas todo es único: no basta para llamarlo identificador
    const pocas = semanticaDe(['xq1', 'zt9', 'pl4', 'mn2'], 'Columna 3')
    expect(pocas.semantica).not.toBe(SEMANTICA.IDENTIFICADOR)

    // Con datos suficientes y forma de código, sí
    const muchas = semanticaDe(
      Array.from({ length: 20 }, (_, i) => `SKU-${100 + i}`),
      'Columna 3'
    )
    expect(muchas.semantica).toBe(SEMANTICA.IDENTIFICADOR)
  })
})

describe('identificadores y unidades', () => {
  it('marca los identificadores y no los usa como métrica', () => {
    const r = semanticaDe(['C1', 'C2', 'C3'], 'Cliente_ID')
    expect(r.semantica).toBe(SEMANTICA.IDENTIFICADOR)
    expect(r.rol).toBe('identificador')
  })

  it('lleva la moneda como unidad cuando consta en los datos', () => {
    expect(semanticaDe(['100 €', '200 €'], 'Importe').unidad).toBe('EUR')
  })

  it('no se inventa la moneda si no aparece', () => {
    expect(semanticaDe([100, 200, 350], 'Importe').unidad).toBeNull()
  })

  it('el porcentaje lleva su símbolo', () => {
    expect(semanticaDe(['12%', '30%', '8%'], 'Margen').unidad).toBe('%')
  })
})
