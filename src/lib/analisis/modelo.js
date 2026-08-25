import { perfilarTabla } from './perfilado'
import { inferirSemantica } from './semantica'
import { analizarCalidad, columnasNoFiables } from './calidad'
import { granularidadRecomendada } from './agregacion'

/*
  MODELO SEMÁNTICO de una tabla: junta en una sola pieza el perfil
  estadístico, el significado de cada columna y el informe de calidad.

  Es lo que consumen las etapas de arriba (métricas, insights, layout), para
  que ninguna tenga que volver a recorrer los datos ni repetir deducciones.

  Un "campo" es una columna ya interpretada:
    { columna (perfil), indice, semantica, confianza, rol, unidad, motivo,
      conflicto }
*/
export function construirModelo(tabla) {
  const perfil = perfilarTabla(tabla)

  const campos = perfil.columnas.map((columna, indice) => ({
    columna,
    indice,
    ...inferirSemantica(columna),
  }))

  const calidad = analizarCalidad(tabla, perfil)
  const noFiables = columnasNoFiables(calidad)

  return {
    tabla,
    perfil,
    campos,
    calidad,
    noFiables,

    // Atajos que se usan una y otra vez más arriba
    metricas: campos.filter((c) => c.rol === 'metrica' && !noFiables.has(c.columna.nombre)),
    dimensiones: campos.filter((c) => c.rol === 'dimension' && !noFiables.has(c.columna.nombre)),
    temporales: campos.filter((c) => c.rol === 'temporal' && !noFiables.has(c.columna.nombre)),
    identificadores: campos.filter((c) => c.rol === 'identificador'),
    // Nombres con demasiada variedad para agrupar, pero válidos para rankear
    entidades: campos.filter((c) => c.rol === 'entidad' && !noFiables.has(c.columna.nombre)),

    filas: perfil.filas,
    granularidad: granularidadDelModelo(campos),
  }
}

// Granularidad temporal del campo de fecha con más recorrido
function granularidadDelModelo(campos) {
  const temporales = campos.filter((c) => c.rol === 'temporal' && c.columna.rangoFechas)
  if (!temporales.length) return null
  for (const t of temporales) {
    const g = granularidadRecomendada(t.columna.rangoFechas)
    if (g) return g
  }
  return null
}
