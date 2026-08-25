import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extraerTablas, detectarFilaCabecera, leerLibro } from './lectura'

// Atajo: construye un libro en memoria a partir de matrices por hoja
function libroDe(hojas) {
  const libro = XLSX.utils.book_new()
  for (const [nombre, matriz] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(matriz, { cellDates: true }), nombre)
  }
  return libro
}

/*
  Serializa el libro y lo vuelve a leer con leerLibro. Da más rodeo que llamar
  a libroATablas con el objeto en memoria, pero recorre EXACTAMENTE el mismo
  camino que un archivo subido por el usuario (incluida la conversión de las
  fechas, que la hace XLSX.read y no las utilidades de construcción).
*/
function leerComoArchivo(libro) {
  return leerLibro(XLSX.write(libro, { type: 'array', bookType: 'xlsx' }))
}

const nombresDe = (tabla) => tabla.columnas.map((c) => c.nombre)

describe('detección de la cabecera', () => {
  it('encuentra la cabecera aunque no esté en la primera fila', () => {
    const matriz = [
      ['INFORME DE VENTAS 2025', null, null],
      ['Generado el 14/03/2025', null, null],
      [null, null, null],
      ['Cliente', 'Fecha', 'Importe'],
      ['Acme', '01/02/2025', 1200],
      ['Globex', '03/02/2025', 800],
    ]
    const tablas = extraerTablas(matriz, 'Ventas')
    expect(tablas).toHaveLength(1)
    expect(nombresDe(tablas[0])).toEqual(['Cliente', 'Fecha', 'Importe'])
    expect(tablas[0].filas).toHaveLength(2)
    // El título de arriba se conserva como contexto, no como dato
    expect(tablas[0].notas[0]).toContain('INFORME DE VENTAS 2025')
  })

  it('usa el contraste de tipos: texto arriba, números debajo', () => {
    const filas = [0, 1, 2, 3]
    const matriz = [
      ['Producto', 'Unidades'],
      ['Tornillos', 40],
      ['Tuercas', 25],
      ['Arandelas', 90],
    ]
    const { indice } = detectarFilaCabecera(matriz, filas, [0, 1])
    expect(indice).toBe(0)
  })

  it('numera las columnas cuando no hay cabecera reconocible', () => {
    const matriz = [
      ['Acme', 1200],
      ['Globex', 800],
      ['Initech', 300],
    ]
    const [tabla] = extraerTablas(matriz, 'Datos')
    expect(nombresDe(tabla)).toEqual(['Columna 1', 'Columna 2'])
    expect(tabla.filas).toHaveLength(3)
    expect(tabla.avisos.some((a) => a.tipo === 'sin-cabecera')).toBe(true)
  })
})

describe('varias tablas en una hoja', () => {
  it('separa tablas apiladas verticalmente', () => {
    const matriz = [
      ['Cliente', 'Importe'],
      ['Acme', 100],
      ['Globex', 200],
      [null, null],
      [null, null],
      ['Producto', 'Stock'],
      ['Tornillos', 40],
      ['Tuercas', 25],
    ]
    const tablas = extraerTablas(matriz, 'Mixta')
    expect(tablas).toHaveLength(2)
    expect(nombresDe(tablas[0])).toEqual(['Cliente', 'Importe'])
    expect(nombresDe(tablas[1])).toEqual(['Producto', 'Stock'])
  })

  it('separa tablas puestas una al lado de la otra', () => {
    const matriz = [
      ['Cliente', 'Importe', null, null, 'Producto', 'Stock'],
      ['Acme', 100, null, null, 'Tornillos', 40],
      ['Globex', 200, null, null, 'Tuercas', 25],
    ]
    const tablas = extraerTablas(matriz, 'Lado a lado')
    expect(tablas).toHaveLength(2)
    expect(nombresDe(tablas[1])).toEqual(['Producto', 'Stock'])
    expect(tablas[1].filas).toEqual([
      ['Tornillos', 40],
      ['Tuercas', 25],
    ])
  })
})

describe('suciedad típica de los Excel reales', () => {
  it('excluye la fila de totales del pie para no duplicar las sumas', () => {
    const matriz = [
      ['Cliente', 'Importe'],
      ['Acme', 100],
      ['Globex', 200],
      ['TOTAL', 300],
    ]
    const [tabla] = extraerTablas(matriz, 'Ventas')
    expect(tabla.filas).toHaveLength(2)
    expect(tabla.filas.map((f) => f[1])).toEqual([100, 200])
    expect(tabla.avisos.some((a) => a.tipo === 'fila-totales')).toBe(true)
  })

  it('no confunde un cliente llamado "Total Reformas" con un pie de totales', () => {
    const matriz = [
      ['Cliente', 'Importe'],
      ['Acme', 100],
      ['Total Reformas SL', 200],
    ]
    const [tabla] = extraerTablas(matriz, 'Ventas')
    expect(tabla.filas).toHaveLength(2)
  })

  it('descarta columnas completamente vacías', () => {
    const matriz = [
      ['Cliente', 'Notas', 'Importe'],
      ['Acme', null, 100],
      ['Globex', null, 200],
    ]
    const [tabla] = extraerTablas(matriz, 'Ventas')
    expect(nombresDe(tabla)).toEqual(['Cliente', 'Importe'])
    expect(tabla.avisos.some((a) => a.tipo === 'columnas-vacias')).toBe(true)
  })

  it('renombra las columnas duplicadas en vez de perderlas', () => {
    const matriz = [
      ['Importe', 'Importe'],
      [100, 200],
      [150, 250],
    ]
    const [tabla] = extraerTablas(matriz, 'Ventas')
    expect(nombresDe(tabla)).toEqual(['Importe', 'Importe (2)'])
  })

  it('ignora las filas vacías intercaladas', () => {
    const matriz = [
      ['Cliente', 'Importe'],
      ['Acme', 100],
      ['Globex', 200],
    ]
    const [tabla] = extraerTablas(matriz, 'Ventas')
    expect(tabla.filas).toHaveLength(2)
  })
})

describe('lectura de un libro completo', () => {
  it('lee varias hojas y las identifica', () => {
    const libro = libroDe({
      Clientes: [
        ['Cliente_ID', 'Nombre', 'Ciudad'],
        ['C1', 'Acme', 'Madrid'],
        ['C2', 'Globex', 'Bilbao'],
      ],
      Ventas: [
        ['Venta_ID', 'Cliente_ID', 'Importe'],
        ['V1', 'C1', 1200],
        ['V2', 'C2', 800],
      ],
    })
    const { tablas, hojas } = leerComoArchivo(libro)
    expect(hojas.map((h) => h.nombre)).toEqual(['Clientes', 'Ventas'])
    expect(tablas).toHaveLength(2)
    expect(tablas[0].hoja).toBe('Clientes')
    expect(tablas[1].id).toBe('Ventas#0')
  })

  it('replica el valor de las celdas combinadas', () => {
    const hoja = XLSX.utils.aoa_to_sheet([
      ['Ventas 2025', null],
      ['Cliente', 'Importe'],
      ['Acme', 100],
      ['Globex', 200],
    ])
    // "Ventas 2025" ocupa combinada A1:B1
    hoja['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Ventas')

    const { tablas } = leerComoArchivo(libro)
    expect(nombresDe(tablas[0])).toEqual(['Cliente', 'Importe'])
    expect(tablas[0].notas[0]).toBe('Ventas 2025 · Ventas 2025')
  })

  it('conserva las fechas como objetos Date', () => {
    const libro = libroDe({
      Ventas: [
        ['Fecha', 'Importe'],
        [new Date(Date.UTC(2025, 2, 14)), 1200],
        [new Date(Date.UTC(2025, 2, 15)), 800],
      ],
    })
    const { tablas } = leerComoArchivo(libro)
    expect(tablas[0].filas[0][0]).toBeInstanceOf(Date)
  })
})
