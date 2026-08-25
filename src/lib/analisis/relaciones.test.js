import { describe, it, expect } from 'vitest'
import { perfilarTabla } from './perfilado'
import { detectarRelaciones } from './relaciones'

// Prepara [{ tabla, perfil }] a partir de hojas descritas como matrices
function preparar(hojas) {
  return Object.entries(hojas).map(([hoja, [columnas, ...filas]]) => {
    const tabla = { id: `${hoja}#0`, hoja, columnas: columnas.map((nombre) => ({ nombre })), filas }
    return { tabla, perfil: perfilarTabla(tabla) }
  })
}

describe('detección de relaciones entre hojas', () => {
  it('encuentra la clave compartida del ejemplo Clientes ↔ Ventas', () => {
    const analizadas = preparar({
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

    const relaciones = detectarRelaciones(analizadas)
    expect(relaciones).toHaveLength(1)
    const r = relaciones[0]
    expect(r.desde).toMatchObject({ hoja: 'Ventas', columna: 'Cliente_ID' })
    expect(r.hacia).toMatchObject({ hoja: 'Clientes', columna: 'Cliente_ID' })
    expect(r.tipo).toBe('muchos-a-uno')
    expect(r.cobertura).toBe(1)
    expect(r.confianza).toBeGreaterThan(0.9)
  })

  it('relaciona aunque las columnas no se llamen igual', () => {
    const analizadas = preparar({
      Empleados: [
        ['Codigo', 'Nombre'],
        ['E1', 'Marta'],
        ['E2', 'Andrés'],
        ['E3', 'Lucía'],
        ['E4', 'Iván'],
      ],
      Partes: [
        ['Parte', 'Responsable', 'Horas'],
        ['P1', 'E1', 8],
        ['P2', 'E2', 6],
        ['P3', 'E1', 4],
        ['P4', 'E3', 7],
      ],
    })

    const relaciones = detectarRelaciones(analizadas)
    expect(relaciones).toHaveLength(1)
    expect(relaciones[0].hacia.columna).toBe('Codigo')
    expect(relaciones[0].desde.columna).toBe('Responsable')
  })

  it('NO inventa una relación entre columnas que solo comparten el nombre', () => {
    const analizadas = preparar({
      Clientes: [
        ['Codigo', 'Nombre'],
        ['C1', 'Acme'],
        ['C2', 'Globex'],
        ['C3', 'Initech'],
        ['C4', 'Umbrella'],
      ],
      Productos: [
        ['Codigo', 'Descripcion'],
        ['P1', 'Tornillos'],
        ['P2', 'Tuercas'],
        ['P3', 'Arandelas'],
        ['P4', 'Clavos'],
      ],
    })

    expect(detectarRelaciones(analizadas)).toHaveLength(0)
  })

  it('no relaciona por coincidencias sueltas', () => {
    const analizadas = preparar({
      Clientes: [
        ['Cliente_ID', 'Nombre'],
        ['C1', 'Acme'],
        ['C2', 'Globex'],
        ['C3', 'Initech'],
        ['C4', 'Umbrella'],
      ],
      Otra: [
        ['Ref', 'Texto'],
        ['C1', 'algo'],
        ['X9', 'otra cosa'],
        ['Y7', 'más'],
        ['Z3', 'y más'],
      ],
    })

    // Solo 1 de 4 valores encaja: muy por debajo del umbral
    expect(detectarRelaciones(analizadas)).toHaveLength(0)
  })

  it('no confunde dos columnas de estados con una relación', () => {
    const analizadas = preparar({
      Facturas: [
        ['Factura', 'Estado'],
        ['F1', 'Pendiente'],
        ['F2', 'Cobrado'],
        ['F3', 'Pendiente'],
        ['F4', 'Cobrado'],
      ],
      Pedidos: [
        ['Pedido', 'Estado'],
        ['P1', 'Pendiente'],
        ['P2', 'Cobrado'],
        ['P3', 'Cobrado'],
        ['P4', 'Pendiente'],
      ],
    })

    // "Estado" se repite en ambos lados: no es clave de nada
    expect(detectarRelaciones(analizadas)).toHaveLength(0)
  })

  it('deja una sola relación por par de tablas', () => {
    const analizadas = preparar({
      Clientes: [
        ['Cliente_ID', 'Email'],
        ['C1', 'a@x.com'],
        ['C2', 'b@x.com'],
        ['C3', 'c@x.com'],
        ['C4', 'd@x.com'],
      ],
      Ventas: [
        ['Cliente_ID', 'Email', 'Importe'],
        ['C1', 'a@x.com', 100],
        ['C2', 'b@x.com', 200],
        ['C1', 'a@x.com', 300],
        ['C3', 'c@x.com', 400],
      ],
    })

    const relaciones = detectarRelaciones(analizadas)
    expect(relaciones).toHaveLength(1)
  })
})
