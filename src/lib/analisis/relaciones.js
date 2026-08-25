import { TIPOS, claveNormalizada } from './tipos'

/*
  RELACIONES entre tablas (normalmente, entre hojas).

  El caso de la especificación: una hoja "Clientes" con Cliente_ID y otra
  "Ventas" con Cliente_ID; detectarlo permite responder "facturación por
  ciudad" aunque la ciudad esté en una hoja y el importe en la otra.

  La regla que manda es la de no inventar: hace falta EVIDENCIA en los datos,
  no que dos columnas se llamen parecido. Dos columnas llamadas "Código" que
  no comparten ni un valor no están relacionadas. Y al revés: dos columnas con
  nombres distintos cuyos valores encajan casi al 100 % sí lo están.

  Se busca la forma clásica muchos-a-uno: una tabla tiene la clave (valores
  únicos) y otra la referencia (valores repetidos contenidos en la primera).
*/

// Mínimos para que el solapamiento signifique algo. Con 2 valores comunes
// cualquier par de columnas parece relacionado.
const MIN_VALORES_CLAVE = 3
const MIN_COBERTURA = 0.7
// Por debajo de esto, coincidir es casi inevitable (por ejemplo dos columnas
// de "sí/no" o de estados con el mismo vocabulario).
const MIN_DISTINTOS_REFERENCIA = 2

/*
  Busca relaciones entre las tablas analizadas.

  `analizadas` = [{ tabla, perfil }] tal y como las produce el pipeline.
  Devuelve [{ desde, hacia, tipo, cobertura, confianza, motivo }]
  donde `hacia` es siempre el lado de la clave única.
*/
export function detectarRelaciones(analizadas) {
  // Índice de valores por columna, calculado una sola vez
  const indices = analizadas.map(({ tabla, perfil }) => ({
    tabla,
    perfil,
    columnas: perfil.columnas.map((col, j) => ({
      col,
      j,
      valores: conjuntoDeValores(perfil.filasNormalizadas, j),
    })),
  }))

  const relaciones = []

  for (let a = 0; a < indices.length; a++) {
    for (let b = 0; b < indices.length; b++) {
      if (a === b) continue
      for (const origen of indices[a].columnas) {
        for (const destino of indices[b].columnas) {
          const rel = evaluarPar(indices[a], origen, indices[b], destino)
          if (rel) relaciones.push(rel)
        }
      }
    }
  }

  // Si el mismo par de tablas encaja por varias columnas, nos quedamos con la
  // mejor: encadenar dos veces las mismas tablas no aporta nada.
  return mejoresPorParDeTablas(relaciones)
}

/*
  ¿La columna `destino` es la clave a la que apunta `origen`?
  Devuelve la relación o null.
*/
function evaluarPar(ladoOrigen, origen, ladoDestino, destino) {
  const { col: colOrigen, valores: vOrigen } = origen
  const { col: colDestino, valores: vDestino } = destino

  // El lado clave tiene que ser realmente una clave: sin repetidos
  if (!colDestino.esIdentificador && colDestino.porcentajeUnicos < 98) return null
  if (vDestino.size < MIN_VALORES_CLAVE) return null

  // Tipos compatibles (no se relaciona una fecha con un nombre)
  if (!tiposCompatibles(colOrigen.tipo, colDestino.tipo)) return null

  // El lado referencia no puede ser una clave también: eso sería uno-a-uno y
  // suele indicar dos listas independientes, no una relación aprovechable.
  if (vOrigen.size < MIN_DISTINTOS_REFERENCIA) return null

  // Cuántos valores del origen existen realmente en la clave
  let dentro = 0
  for (const v of vOrigen) if (vDestino.has(v)) dentro++
  const cobertura = dentro / vOrigen.size
  if (cobertura < MIN_COBERTURA) return null

  // Solaparse por casualidad es fácil cuando hay pocos valores distintos
  if (dentro < MIN_VALORES_CLAVE) return null

  // El nombre no decide, pero refuerza: Cliente_ID ↔ Cliente_ID es más creíble
  const parecido = parecidoDeNombre(colOrigen.nombre, colDestino.nombre)
  let confianza = cobertura * 0.75 + parecido * 0.25
  if (colOrigen.esIdentificador) confianza = Math.min(1, confianza + 0.05)
  if (confianza < 0.6) return null

  return {
    desde: { tabla: ladoOrigen.tabla.id, hoja: ladoOrigen.tabla.hoja, columna: colOrigen.nombre },
    hacia: { tabla: ladoDestino.tabla.id, hoja: ladoDestino.tabla.hoja, columna: colDestino.nombre },
    tipo: 'muchos-a-uno',
    cobertura: Math.round(cobertura * 100) / 100,
    valoresComunes: dentro,
    confianza: Math.round(confianza * 100) / 100,
    motivo:
      `El ${Math.round(cobertura * 100)} % de los valores de "${colOrigen.nombre}" (${ladoOrigen.tabla.hoja}) ` +
      `existen en "${colDestino.nombre}" (${ladoDestino.tabla.hoja}), que no tiene repetidos.`,
  }
}

// Valores distintos de una columna, normalizados para comparar
function conjuntoDeValores(filas, j) {
  const set = new Set()
  for (const fila of filas) {
    const v = fila[j]
    if (v === null || v === undefined || v === '') continue
    set.add(typeof v === 'string' ? claveNormalizada(v) : v)
    if (set.size > 100000) break
  }
  return set
}

function tiposCompatibles(a, b) {
  if (a === b) return true
  // Un id puede venir como texto en una hoja y como número en otra
  const laxo = new Set([TIPOS.TEXTO, TIPOS.NUMERO])
  return laxo.has(a) && laxo.has(b)
}

// 1 si los nombres son el mismo, 0,6 si uno contiene al otro, 0 si nada
function parecidoDeNombre(a, b) {
  const na = claveNormalizada(a).replace(/[_\s-]+/g, '')
  const nb = claveNormalizada(b).replace(/[_\s-]+/g, '')
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.6
  return 0
}

function mejoresPorParDeTablas(relaciones) {
  const mejor = new Map()
  for (const r of relaciones) {
    const clave = `${r.desde.tabla}→${r.hacia.tabla}`
    const actual = mejor.get(clave)
    if (!actual || r.confianza > actual.confianza) mejor.set(clave, r)
  }
  return [...mejor.values()].sort((a, b) => b.confianza - a.confianza)
}
