import { describe, it, expect } from 'vitest'
import {
  TIPOS,
  esVacio,
  analizarNumerico,
  analizarBooleano,
  analizarFecha,
  detectarOrdenFecha,
  clasificarValor,
  claveNormalizada,
  detectarMoneda,
  fechaDesdeSerial,
} from './tipos'

describe('esVacio', () => {
  it('trata como vacío los marcadores típicos de "sin dato"', () => {
    for (const v of [null, undefined, '', '   ', '-', '--', 'N/A', '#N/A', 'NULL']) {
      expect(esVacio(v)).toBe(true)
    }
  })

  it('no confunde el cero ni el false con vacío', () => {
    expect(esVacio(0)).toBe(false)
    expect(esVacio(false)).toBe(false)
    expect(esVacio('0')).toBe(false)
  })
})

describe('analizarNumerico', () => {
  it('lee el formato español con miles y decimales', () => {
    expect(analizarNumerico('1.234,56').valor).toBeCloseTo(1234.56)
    expect(analizarNumerico('4.850 €').valor).toBe(4850)
    expect(analizarNumerico('12.500').valor).toBe(12500)
    expect(analizarNumerico('-1.200,50').valor).toBeCloseTo(-1200.5)
  })

  it('lee el formato anglosajón', () => {
    expect(analizarNumerico('1,234.56').valor).toBeCloseTo(1234.56)
    expect(analizarNumerico('$1,200.00').valor).toBe(1200)
  })

  it('detecta moneda y porcentaje', () => {
    expect(analizarNumerico('4.850 €').moneda).toBe('EUR')
    expect(analizarNumerico('$1,200').moneda).toBe('USD')
    const p = analizarNumerico('12%')
    expect(p.valor).toBe(12)
    expect(p.porcentaje).toBe(true)
  })

  it('entiende el negativo contable entre paréntesis', () => {
    expect(analizarNumerico('(1.234)').valor).toBe(-1234)
  })

  it('NO convierte en número lo que es un identificador o una fecha', () => {
    // Este es el caso que rompía el parser antiguo: devolvía -2026
    expect(analizarNumerico('F-2026-014')).toBeNull()
    expect(analizarNumerico('31/12/2025')).toBeNull()
    expect(analizarNumerico('12A')).toBeNull()
    expect(analizarNumerico('1.2.3')).toBeNull()
    expect(analizarNumerico('Madrid')).toBeNull()
    expect(analizarNumerico('')).toBeNull()
  })

  it('rechaza agrupaciones de miles imposibles', () => {
    expect(analizarNumerico('1.23.4')).toBeNull()
    expect(analizarNumerico('1.2345.678')).toBeNull()
  })

  it('trata como decimal lo que no puede ser separador de miles', () => {
    // 12.3456 no es agrupación válida, pero sí un decimal anglosajón correcto
    expect(analizarNumerico('12.3456').valor).toBeCloseTo(12.3456)
  })
})

describe('analizarBooleano', () => {
  it('acepta las formas habituales en español e inglés', () => {
    expect(analizarBooleano('Sí')).toBe(true)
    expect(analizarBooleano('TRUE')).toBe(true)
    expect(analizarBooleano('no')).toBe(false)
    expect(analizarBooleano('Falso')).toBe(false)
    expect(analizarBooleano('quizá')).toBeNull()
  })
})

describe('analizarFecha', () => {
  it('lee ISO y formato español', () => {
    expect(analizarFecha('2025-03-14').iso).toBe('2025-03-14')
    expect(analizarFecha('14/03/2025').iso).toBe('2025-03-14')
    expect(analizarFecha('14-03-2025').iso).toBe('2025-03-14')
    expect(analizarFecha('14.03.2025').iso).toBe('2025-03-14')
  })

  it('respeta el orden mes-día cuando se le indica', () => {
    expect(analizarFecha('03/14/2025', 'mes-dia').iso).toBe('2025-03-14')
  })

  it('lee meses en texto y guarda la precisión', () => {
    expect(analizarFecha('12 de marzo de 2025').iso).toBe('2025-03-12')
    const soloMes = analizarFecha('marzo 2025')
    expect(soloMes.iso).toBe('2025-03-01')
    expect(soloMes.precision).toBe('mes')
    expect(analizarFecha('2024').precision).toBe('anio')
  })

  it('rechaza días que no existen', () => {
    expect(analizarFecha('31/02/2025')).toBeNull()
    expect(analizarFecha('2025-02-30')).toBeNull()
  })

  it('solo lee el número de serie de Excel si se le permite', () => {
    expect(analizarFecha(45000)).toBeNull()
    expect(analizarFecha(45000, 'dia-mes', true).iso).toBe('2023-03-15')
  })

  it('convierte objetos Date', () => {
    expect(analizarFecha(new Date(2025, 0, 31)).iso).toBe('2025-01-31')
  })
})

describe('detectarOrdenFecha', () => {
  it('deduce día-mes cuando algún día pasa de 12', () => {
    const r = detectarOrdenFecha(['05/01/2025', '31/01/2025', '02/02/2025'])
    expect(r.orden).toBe('dia-mes')
    expect(r.ambiguo).toBe(false)
  })

  it('deduce mes-día cuando el segundo componente pasa de 12', () => {
    const r = detectarOrdenFecha(['01/31/2025', '02/05/2025'])
    expect(r.orden).toBe('mes-dia')
    expect(r.ambiguo).toBe(false)
  })

  it('marca la ambigüedad cuando ningún valor la resuelve', () => {
    const r = detectarOrdenFecha(['01/02/2025', '03/04/2025'])
    expect(r.orden).toBe('dia-mes')
    expect(r.ambiguo).toBe(true)
  })

  it('detecta el conflicto si conviven los dos formatos', () => {
    const r = detectarOrdenFecha(['31/01/2025', '01/31/2025'])
    expect(r.ambiguo).toBe(true)
    expect(r.conflicto).toBe(true)
  })
})

describe('clasificarValor', () => {
  it('clasifica cada familia de valores', () => {
    expect(clasificarValor('').tipo).toBe(TIPOS.NULO)
    expect(clasificarValor('Sí').tipo).toBe(TIPOS.BOOLEANO)
    expect(clasificarValor(1234).tipo).toBe(TIPOS.NUMERO)
    expect(clasificarValor('4.850 €').tipo).toBe(TIPOS.MONEDA)
    expect(clasificarValor('12%').tipo).toBe(TIPOS.PORCENTAJE)
    expect(clasificarValor('14/03/2025').tipo).toBe(TIPOS.FECHA)
    expect(clasificarValor('Reformas Marín').tipo).toBe(TIPOS.TEXTO)
  })

  it('un identificador se queda en texto, no en número', () => {
    const r = clasificarValor('F-2026-014')
    expect(r.tipo).toBe(TIPOS.TEXTO)
    expect(r.valor).toBe('F-2026-014')
  })

  it('la moneda viaja junto al valor', () => {
    const r = clasificarValor('4.850 €')
    expect(r.valor).toBe(4850)
    expect(r.moneda).toBe('EUR')
  })
})

describe('utilidades', () => {
  it('detectarMoneda reconoce símbolos y códigos', () => {
    expect(detectarMoneda('1200 EUR')).toBe('EUR')
    expect(detectarMoneda('£30')).toBe('GBP')
    expect(detectarMoneda('30')).toBeNull()
  })

  it('fechaDesdeSerial respeta el epoch de Excel', () => {
    expect(fechaDesdeSerial(1).getUTCFullYear()).toBe(1899)
    expect(fechaDesdeSerial(0)).toBeNull()
  })

  it('claveNormalizada iguala mayúsculas y acentos', () => {
    expect(claveNormalizada(' MADRID ')).toBe('madrid')
    expect(claveNormalizada('Málaga')).toBe(claveNormalizada('MALAGA'))
  })
})
