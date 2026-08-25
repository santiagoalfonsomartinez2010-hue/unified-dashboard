import { TIPOS, esTipoNumerico } from './tipos'

/*
  CALIDAD DE DATOS: qué le pasa a este Excel antes de sacar conclusiones.

  Dos principios que vienen de la especificación:
   1. NUNCA se modifican los datos originales. Aquí solo se DETECTA y se
      informa; la capa normalizada del perfilado es la que se usa para
      calcular, y convive con los datos tal y como los subió el usuario.
   2. Un problema de calidad no debe tumbar el dashboard. Se avisa, se acota
      el impacto (qué columna deja de ser fiable) y el análisis sigue.

  Cada problema lleva `gravedad`:
   - alta:  invalida cálculos (monedas mezcladas, fechas ambiguas en conflicto)
   - media: obliga a matizar (muchos nulos, tipos mezclados, duplicados)
   - baja:  conviene saberlo (outliers, variantes de escritura)
*/

// A partir de aquí la comprobación de filas duplicadas se vuelve cara y deja
// de compensar: se comprueba una parte y se dice claramente.
const MAX_FILAS_DUPLICADOS = 50000

/*
  Analiza la calidad de una tabla ya perfilada.
  Devuelve { problemas: [], puntuacion: 0-1, filasDuplicadas, resumen }
*/
export function analizarCalidad(tabla, perfil) {
  const problemas = []
  const { columnas, filasNormalizadas } = perfil
  const totalFilas = perfil.filas

  if (!totalFilas) {
    return { problemas: [], puntuacion: 0, filasDuplicadas: 0, resumen: 'La tabla no tiene datos.' }
  }

  // --- Avisos que ya venían de la lectura (fila de totales, columnas vacías…)
  for (const aviso of tabla.avisos || []) {
    problemas.push({
      tipo: aviso.tipo,
      gravedad: aviso.tipo === 'fila-totales' ? 'media' : 'baja',
      mensaje: aviso.mensaje,
    })
  }

  for (const col of columnas) {
    // --- Columnas medio vacías
    if (col.porcentajeNulos >= 50) {
      problemas.push({
        tipo: 'columna-vacia',
        gravedad: col.porcentajeNulos >= 90 ? 'alta' : 'media',
        columna: col.nombre,
        mensaje: `"${col.nombre}" está vacía en el ${col.porcentajeNulos.toFixed(0)} % de las filas.`,
        detalle: { porcentajeNulos: col.porcentajeNulos },
      })
    } else if (col.porcentajeNulos >= 20) {
      problemas.push({
        tipo: 'faltan-valores',
        gravedad: 'baja',
        columna: col.nombre,
        mensaje: `"${col.nombre}" no tiene valor en ${col.nulos} de ${col.total} filas.`,
        detalle: { nulos: col.nulos },
      })
    }

    // --- Formatos inconsistentes dentro de la misma columna
    if (col.tipoMixto && col.noNulos > 0) {
      const otros = Object.entries(col.tiposVistos)
        .filter(([t]) => t !== col.tipo && t !== TIPOS.NULO)
        .map(([t, n]) => `${n} de tipo ${t}`)
      problemas.push({
        tipo: 'formato-inconsistente',
        gravedad: 'media',
        columna: col.nombre,
        mensaje: `"${col.nombre}" mezcla formatos: es mayoritariamente ${col.tipo}, pero hay ${otros.join(' y ')}.`,
        detalle: { tiposVistos: col.tiposVistos },
      })
    }

    // --- Fechas que no se han podido interpretar
    if (col.tipo === TIPOS.FECHA) {
      const invalidas = col.noNulos - (col.tiposVistos[TIPOS.FECHA] || 0)
      if (invalidas > 0) {
        problemas.push({
          tipo: 'fechas-invalidas',
          gravedad: 'media',
          columna: col.nombre,
          mensaje: `Se han detectado ${invalidas} valor(es) con formato de fecha incorrecto en "${col.nombre}". Se han excluido del análisis temporal.`,
          detalle: { invalidas },
        })
      }
      // --- Ambigüedad día/mes
      if (col.fechaConflicto) {
        problemas.push({
          tipo: 'fechas-ambiguas',
          gravedad: 'alta',
          columna: col.nombre,
          mensaje: `"${col.nombre}" mezcla fechas en formato día/mes y mes/día. La lectura temporal de esta columna no es fiable.`,
        })
      } else if (col.fechaAmbigua) {
        problemas.push({
          tipo: 'fechas-ambiguas',
          gravedad: 'baja',
          columna: col.nombre,
          mensaje: `En "${col.nombre}" ningún valor permite saber si el formato es día/mes o mes/día; se ha asumido día/mes.`,
        })
      }
    }

    // --- Cifras guardadas como texto
    if (esTipoNumerico(col.tipo) && col.numerosComoTexto > 0) {
      problemas.push({
        tipo: 'numeros-como-texto',
        gravedad: 'baja',
        columna: col.nombre,
        mensaje: `${col.numerosComoTexto} valor(es) de "${col.nombre}" están guardados como texto. Se han convertido a número para poder calcular.`,
        detalle: { cuantos: col.numerosComoTexto },
      })
    }

    // --- Monedas mezcladas: invalida cualquier suma de la columna
    if (col.monedasMezcladas) {
      problemas.push({
        tipo: 'monedas-mezcladas',
        gravedad: 'alta',
        columna: col.nombre,
        mensaje: `"${col.nombre}" mezcla ${col.monedasMezcladas.join(' y ')}. No se pueden sumar sus valores sin un tipo de cambio.`,
        detalle: { monedas: col.monedasMezcladas },
      })
    }

    // --- Categorías que probablemente son la misma
    if (col.variantesEscritura?.length) {
      const ejemplos = col.variantesEscritura
        .slice(0, 3)
        .map((v) => v.formas.join(' / '))
        .join('; ')
      problemas.push({
        tipo: 'categorias-equivalentes',
        gravedad: 'baja',
        columna: col.nombre,
        mensaje: `En "${col.nombre}" hay valores escritos de varias formas que parecen el mismo (${ejemplos}). Se han agrupado para analizar, sin tocar los datos originales.`,
        detalle: { variantes: col.variantesEscritura },
      })
    }

    // --- Valores extremos
    if (col.outliers > 0 && col.esMetrica) {
      problemas.push({
        tipo: 'valores-extremos',
        gravedad: 'baja',
        columna: col.nombre,
        mensaje: `"${col.nombre}" tiene ${col.outliers} valor(es) muy alejados del resto (por ejemplo ${col.ejemplosOutliers.join(', ')}). Pueden ser errores de tecleo o casos reales.`,
        detalle: { outliers: col.outliers, ejemplos: col.ejemplosOutliers },
      })
    }
  }

  // --- Filas repetidas
  const { duplicadas, parcial } = contarFilasDuplicadas(filasNormalizadas)
  if (duplicadas > 0) {
    problemas.push({
      tipo: 'filas-duplicadas',
      gravedad: duplicadas / totalFilas > 0.1 ? 'media' : 'baja',
      mensaje: `Hay ${duplicadas} fila(s) repetidas${parcial ? ' entre las primeras analizadas' : ''}. Se han conservado: podrían ser registros legítimos.`,
      detalle: { duplicadas },
    })
  }

  // --- Registros sin ningún dato aprovechable
  const vacias = filasNormalizadas.filter((f) => f.every((v) => v === null)).length
  if (vacias > 0) {
    problemas.push({
      tipo: 'filas-vacias',
      gravedad: 'baja',
      mensaje: `${vacias} fila(s) no contienen ningún dato.`,
      detalle: { vacias },
    })
  }

  return {
    problemas,
    puntuacion: puntuar(problemas, columnas.length),
    filasDuplicadas: duplicadas,
    resumen: resumir(problemas),
  }
}

/*
  Cuenta filas idénticas comparando la versión normalizada, para que dos filas
  que solo difieren en mayúsculas o en el formato del importe cuenten como
  repetidas.
*/
function contarFilasDuplicadas(filas) {
  const limite = Math.min(filas.length, MAX_FILAS_DUPLICADOS)
  const vistas = new Set()
  let duplicadas = 0
  for (let i = 0; i < limite; i++) {
    const clave = filas[i].map((v) => (v === null ? '' : String(v).toLowerCase())).join('')
    if (vistas.has(clave)) duplicadas++
    else vistas.add(clave)
  }
  return { duplicadas, parcial: filas.length > limite }
}

// Nota global de calidad (1 = impecable). Solo para ordenar avisos y decidir
// cuánta cautela mostrar en la interfaz.
function puntuar(problemas, numColumnas) {
  const peso = { alta: 0.18, media: 0.08, baja: 0.02 }
  const penalizacion = problemas.reduce((s, p) => s + (peso[p.gravedad] || 0), 0)
  // Se relativiza por el tamaño: 3 avisos en 20 columnas no es lo mismo que
  // 3 avisos en 3 columnas.
  const escala = Math.max(1, numColumnas / 6)
  return Math.max(0, Math.min(1, 1 - penalizacion / escala))
}

function resumir(problemas) {
  if (!problemas.length) return 'No se han detectado problemas en los datos.'
  const altas = problemas.filter((p) => p.gravedad === 'alta').length
  const medias = problemas.filter((p) => p.gravedad === 'media').length
  const partes = []
  if (altas) partes.push(`${altas} problema(s) que afectan a los cálculos`)
  if (medias) partes.push(`${medias} aviso(s) importantes`)
  const resto = problemas.length - altas - medias
  if (resto) partes.push(`${resto} detalle(s) menores`)
  return `Se han detectado ${partes.join(', ')}.`
}

/*
  Columnas en las que NO se debe basar una cifra destacada: monedas mezcladas
  o fechas contradictorias hacen que cualquier total sea engañoso.
*/
export function columnasNoFiables(calidad) {
  const fuera = new Set()
  for (const p of calidad.problemas) {
    if (p.gravedad === 'alta' && p.columna) fuera.add(p.columna)
  }
  return fuera
}
