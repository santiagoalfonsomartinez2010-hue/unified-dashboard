import { TIPOS, esTipoNumerico, claveNormalizada } from './tipos'

/*
  INTERPRETACIÓN SEMÁNTICA: qué SIGNIFICA cada columna.

  Regla de oro: el nombre es una pista, los valores son la prueba. Si una
  columna se llama "Importe" pero contiene fechas, NO es dinero. Cuando el
  nombre y los valores se contradicen mandan los valores, la confianza baja y
  el desacuerdo queda registrado (`conflicto`) para que el resto del pipeline
  sepa que esa columna no es de fiar para un KPI importante.

  Todo lo que sale de aquí lleva `confianza` (0-1). Con confianza baja el
  dashboard usa la columna para algo genérico, nunca para una cifra destacada.
*/

export const SEMANTICA = {
  IDENTIFICADOR: 'identificador',
  FECHA: 'fecha',
  IMPORTE: 'importe',
  INGRESO: 'ingreso',
  COSTE: 'coste',
  PRECIO: 'precio',
  PRESUPUESTO: 'presupuesto',
  MARGEN: 'margen',
  BENEFICIO: 'beneficio',
  CANTIDAD: 'cantidad',
  PORCENTAJE: 'porcentaje',
  DURACION: 'duracion',
  PERSONA: 'persona',
  ORGANIZACION: 'organizacion',
  UBICACION: 'ubicacion',
  CATEGORIA: 'categoria',
  ESTADO: 'estado',
  PRODUCTO: 'producto',
  PROYECTO: 'proyecto',
  EMAIL: 'email',
  TELEFONO: 'telefono',
  URL: 'url',
  BOOLEANO: 'booleano',
  TEXTO_LIBRE: 'texto_libre',
  DESCONOCIDO: 'desconocido',
}

const S = SEMANTICA

// Familias de tipo compatibles con cada significado. Sirve para descartar la
// pista del nombre cuando los valores no la sostienen.
const COMPATIBLE = {
  [S.IDENTIFICADOR]: ['texto', 'numero'],
  [S.FECHA]: ['fecha'],
  [S.IMPORTE]: ['numerico'],
  [S.INGRESO]: ['numerico'],
  [S.COSTE]: ['numerico'],
  [S.PRECIO]: ['numerico'],
  [S.PRESUPUESTO]: ['numerico'],
  [S.MARGEN]: ['numerico'],
  [S.BENEFICIO]: ['numerico'],
  [S.CANTIDAD]: ['numerico'],
  [S.PORCENTAJE]: ['numerico'],
  [S.DURACION]: ['numerico'],
  [S.PERSONA]: ['texto'],
  [S.ORGANIZACION]: ['texto'],
  [S.UBICACION]: ['texto'],
  [S.CATEGORIA]: ['texto', 'numero', 'booleano'],
  [S.ESTADO]: ['texto', 'booleano'],
  [S.PRODUCTO]: ['texto'],
  [S.PROYECTO]: ['texto'],
  [S.EMAIL]: ['texto'],
  [S.TELEFONO]: ['texto', 'numero'],
  [S.URL]: ['texto'],
  [S.BOOLEANO]: ['booleano'],
  [S.TEXTO_LIBRE]: ['texto'],
  [S.DESCONOCIDO]: ['texto', 'numero', 'numerico', 'fecha', 'booleano'],
}

/*
  Pistas por NOMBRE de columna. El orden importa: gana la primera que encaje,
  por eso "coste" va antes que el genérico "importe".

  Todas las entradas admiten el PLURAL. Parece un detalle y no lo es: una
  columna llamada "Costes" (que es como se escribe de verdad en un Excel) no
  casaba con "\bcoste\b" y acababa interpretada como un recuento cualquiera,
  con lo que el beneficio y el margen dejaban de calcularse.
*/
const PISTAS_NOMBRE = [
  [/\b(m[aá]rgenes|margen|markup)\b/i, S.MARGEN],
  [/\b(beneficios?|ganancias?|profit|resultado neto)\b/i, S.BENEFICIO],
  [/\b(presupuestos?|budget|estimad[oa]s?|previst[oa]s?)\b/i, S.PRESUPUESTO],
  [/\b(costes?|costos?|costs?|gastos?|expenses?|compras?)\b/i, S.COSTE],
  [/\b(ingresos?|ventas?|facturaci[oó]n|facturad[oa]s?|revenue|sales|cobros?|cobrad[oa]s?)\b/i, S.INGRESO],
  [/\b(precios?|pvp|tarifas?|prices?|importe unitario)\b/i, S.PRECIO],
  [/\b(importes?|montos?|totales?|total|subtotal|amount|saldos?|deudas?|pagos?|valor)\b/i, S.IMPORTE],
  [/\b(cantidad(es)?|unidades|uds|stock|existencias|qty|quantity|n[uú]mero de|recuento|piezas)\b/i, S.CANTIDAD],
  [/\b(porcentajes?|pct|ratios?|tasas?|%)\b/i, S.PORCENTAJE],
  [/\b(duraci[oó]n|horas|minutos|tiempo)\b/i, S.DURACION],
  [/\b(fechas?|date|d[ií]as?|alta|baja|vencimientos?|caducidad|inicio|fin|periodo|mes(es)?|a[nñ]os?)\b/i, S.FECHA],
  [/\b(emails?|correos?|e-mail|mail)\b/i, S.EMAIL],
  [/\b(tel[ée]fonos?|m[oó]viles?|m[oó]vil|phone|tlf|contacto telef)\b/i, S.TELEFONO],
  [/\b(urls?|web|enlaces?|links?|sitio)\b/i, S.URL],
  [/\b(estados?|situaci[oó]n|status|fases?|etapas?)\b/i, S.ESTADO],
  [/\b(ciudad(es)?|provincias?|pa[ií]s(es)?|localidad(es)?|municipios?|regi[oó]n|zonas?|direcci[oó]n|c\.?p\.?|c[oó]digo postal|comunidad)\b/i, S.UBICACION],
  [/\b(clientes?|vendedor(es|a|as)?|comerciales?|comercial|emplead[oa]s?|responsables?|personas?|contactos?|usuarios?|pacientes?|alumn[oa]s?|propietari[oa]s?|agentes?)\b/i, S.PERSONA],
  [/\b(empresas?|proveedor(es|a|as)?|compa[nñ][ií]as?|organizaci[oó]n|entidad(es)?|raz[oó]n social)\b/i, S.ORGANIZACION],
  [/\b(productos?|art[ií]culos?|materiales?|material|servicios?|items?)\b/i, S.PRODUCTO],
  [/\b(proyectos?|obras?|expedientes?|campa[nñ]as?|casos?)\b/i, S.PROYECTO],
  [/\b(categor[ií]as?|tipos?|tipo|familias?|segmentos?|grupos?|clases?|canal(es)?|origen)\b/i, S.CATEGORIA],
  [/(^|[\s_-])(id|c[oó]digo|codigo|ref|referencia|clave|sku|nif|cif|dni)([\s_-]|$)/i, S.IDENTIFICADOR],
]

// Vocabulario de estados: si los valores salen de aquí, es una columna de
// estado aunque se llame "Columna 4".
const VOCABULARIO_ESTADO = new Set(
  [
    'pendiente', 'cobrado', 'cobrada', 'pagado', 'pagada', 'impagado', 'vencido', 'vencida',
    'activo', 'activa', 'inactivo', 'inactiva', 'baja', 'alta',
    'abierto', 'abierta', 'cerrado', 'cerrada', 'en curso', 'en proceso', 'en progreso',
    'completado', 'completada', 'finalizado', 'finalizada', 'terminado', 'terminada',
    'cancelado', 'cancelada', 'anulado', 'anulada', 'rechazado', 'rechazada',
    'aprobado', 'aprobada', 'confirmado', 'confirmada', 'enviado', 'enviada',
    'entregado', 'entregada', 'nuevo', 'nueva', 'planificado', 'planificada',
    'borrador', 'parado', 'parada', 'bloqueado', 'bloqueada', 'disponible', 'reservado',
    'vendido', 'vendida', 'alquilado', 'alquilada', 'alquiler', 'venta',
    'si', 'sí', 'no', 'ok', 'ko',
  ].map(claveNormalizada)
)

// Provincias y ciudades españolas frecuentes + países habituales. No pretende
// ser exhaustivo: es una señal más, nunca la única.
const VOCABULARIO_UBICACION = new Set(
  [
    'madrid', 'barcelona', 'valencia', 'sevilla', 'zaragoza', 'malaga', 'murcia', 'palma',
    'bilbao', 'alicante', 'cordoba', 'valladolid', 'vigo', 'gijon', 'granada', 'coruña',
    'a coruña', 'vitoria', 'elche', 'oviedo', 'santander', 'pamplona', 'almeria', 'donostia',
    'san sebastian', 'burgos', 'albacete', 'salamanca', 'huelva', 'lleida', 'tarragona',
    'leon', 'cadiz', 'jaen', 'girona', 'lugo', 'caceres', 'toledo', 'badajoz', 'logroño',
    'santa cruz de tenerife', 'las palmas', 'castellon', 'guadalajara', 'cuenca', 'zamora',
    'espana', 'españa', 'francia', 'portugal', 'italia', 'alemania', 'reino unido',
    'mexico', 'argentina', 'colombia', 'chile', 'peru', 'estados unidos', 'andorra',
  ].map(claveNormalizada)
)

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const RE_URL = /^(https?:\/\/|www\.)\S+$/i
const RE_TELEFONO = /^(\+?\d{1,3}[\s-]?)?(\d[\s-]?){8,13}$/
const RE_CP = /^\d{5}$/
const RE_NOMBRE_PERSONA = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(\s+(d[eao]l?|la|las|los|y|van|de))?(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+){1,3}$/

/*
  Deduce el significado de una columna a partir de su perfil.

  Devuelve:
  { semantica, confianza, rol, unidad, motivo, conflicto }
   - rol: 'metrica' | 'dimension' | 'temporal' | 'identificador' | 'ninguno'
   - conflicto: { nombreSugiere, valoresIndican } cuando se contradicen
*/
export function inferirSemantica(perfil) {
  const familia = familiaDe(perfil.tipo)
  const porNombre = pistaDeNombre(perfil.nombre)
  const porValores = pistaDeValores(perfil, familia)

  let semantica
  let confianza
  let motivo
  let conflicto = null

  const nombreCompatible = porNombre && esCompatible(porNombre, familia)

  if (porNombre && !nombreCompatible) {
    // El caso que exige la especificación: se llama "Importe" pero dentro hay
    // fechas. Mandan los valores y se deja constancia del desacuerdo.
    semantica = porValores.semantica
    confianza = Math.min(porValores.confianza, 0.55)
    motivo = `El nombre sugiere "${porNombre}", pero los valores son de tipo ${perfil.tipo}; se ha hecho caso a los valores.`
    conflicto = { nombreSugiere: porNombre, valoresIndican: porValores.semantica }
  } else if (nombreCompatible && porValores.semantica === porNombre) {
    // Nombre y contenido dicen lo mismo: es el caso más fiable
    semantica = porNombre
    confianza = 0.95
    motivo = 'El nombre de la columna y sus valores coinciden.'
  } else if (nombreCompatible && porValores.fuerte) {
    // Los valores hablan claro (emails, estados conocidos…) y contradicen al
    // nombre dentro del mismo tipo: se prefiere la evidencia directa.
    semantica = porValores.semantica
    confianza = Math.min(porValores.confianza, 0.75)
    motivo = `Los valores encajan con "${porValores.semantica}" pese a que el nombre sugiere "${porNombre}".`
    conflicto = { nombreSugiere: porNombre, valoresIndican: porValores.semantica }
  } else if (nombreCompatible) {
    semantica = porNombre
    confianza = 0.7
    motivo = 'Deducido del nombre de la columna; los valores son compatibles.'
  } else {
    semantica = porValores.semantica
    confianza = porValores.confianza
    motivo = porValores.motivo
  }

  // Una columna con tipos mezclados es menos fiable, diga lo que diga
  if (perfil.tipoMixto) confianza = Math.min(confianza, 0.6)
  // Y si está medio vacía, tampoco
  if (perfil.porcentajeNulos > 40) confianza = Math.min(confianza, 0.5)

  return {
    semantica,
    confianza: Math.round(confianza * 100) / 100,
    rol: decidirRol(semantica, perfil),
    unidad: decidirUnidad(semantica, perfil),
    motivo,
    conflicto,
  }
}

// Familia de tipo para comprobar compatibilidad
function familiaDe(tipo) {
  if (esTipoNumerico(tipo)) return tipo === TIPOS.NUMERO ? 'numero' : 'numerico'
  if (tipo === TIPOS.FECHA) return 'fecha'
  if (tipo === TIPOS.BOOLEANO) return 'booleano'
  return 'texto'
}

function esCompatible(semantica, familia) {
  const permitidas = COMPATIBLE[semantica] || []
  if (permitidas.includes(familia)) return true
  // 'numero' es un caso particular de 'numerico'
  if (familia === 'numero' && permitidas.includes('numerico')) return true
  if (familia === 'numerico' && permitidas.includes('numero')) return true
  return false
}

function pistaDeNombre(nombre) {
  const n = String(nombre || '')
  if (/^columna \d+$/i.test(n)) return null // nombre generado por nosotros
  for (const [patron, semantica] of PISTAS_NOMBRE) if (patron.test(n)) return semantica
  return null
}

/*
  Qué dicen los VALORES, sin mirar el nombre.
  `fuerte` marca las señales que no admiten discusión (un email es un email).
*/
function pistaDeValores(perfil, familia) {
  const muestra = perfil.muestra.filter((v) => typeof v === 'string').map((v) => v.trim())
  const frecuentes = perfil.valoresFrecuentes.map((f) => f.valor).filter((v) => typeof v === 'string')

  if (perfil.esIdentificador) {
    return { semantica: S.IDENTIFICADOR, confianza: 0.8, fuerte: true, motivo: 'Casi todos los valores son distintos y tienen forma de código.' }
  }

  if (familia === 'fecha') {
    return { semantica: S.FECHA, confianza: 0.9, fuerte: true, motivo: 'Los valores son fechas.' }
  }

  if (familia === 'booleano') {
    return { semantica: S.BOOLEANO, confianza: 0.85, fuerte: true, motivo: 'Los valores son sí/no.' }
  }

  if (familia === 'texto') {
    if (proporcion(muestra, (v) => RE_EMAIL.test(v)) > 0.8) {
      return { semantica: S.EMAIL, confianza: 0.95, fuerte: true, motivo: 'Los valores tienen formato de correo electrónico.' }
    }
    if (proporcion(muestra, (v) => RE_URL.test(v)) > 0.8) {
      return { semantica: S.URL, confianza: 0.95, fuerte: true, motivo: 'Los valores son direcciones web.' }
    }
    if (proporcion(muestra, (v) => RE_TELEFONO.test(v)) > 0.8) {
      return { semantica: S.TELEFONO, confianza: 0.85, fuerte: true, motivo: 'Los valores tienen formato de teléfono.' }
    }
    // Estado: pocos valores distintos y salidos del vocabulario conocido
    if (perfil.unicos <= 15 && proporcion(frecuentes, (v) => VOCABULARIO_ESTADO.has(claveNormalizada(v))) > 0.6) {
      return { semantica: S.ESTADO, confianza: 0.85, fuerte: true, motivo: 'Los valores son estados reconocidos (pendiente, cerrado, activo…).' }
    }
    if (proporcion(frecuentes, (v) => VOCABULARIO_UBICACION.has(claveNormalizada(v))) > 0.5) {
      return { semantica: S.UBICACION, confianza: 0.85, fuerte: true, motivo: 'Los valores son ciudades o países conocidos.' }
    }
    if (proporcion(muestra, (v) => RE_CP.test(v)) > 0.8) {
      return { semantica: S.UBICACION, confianza: 0.7, fuerte: false, motivo: 'Los valores parecen códigos postales.' }
    }
    if (perfil.longitudMediaTexto > 60) {
      return { semantica: S.TEXTO_LIBRE, confianza: 0.7, fuerte: false, motivo: 'Los textos son largos: parecen descripciones o notas.' }
    }
    if (perfil.porcentajeUnicos > 70 && proporcion(muestra, (v) => RE_NOMBRE_PERSONA.test(v)) > 0.6) {
      return { semantica: S.PERSONA, confianza: 0.7, fuerte: false, motivo: 'Los valores tienen forma de nombre y apellidos.' }
    }
    if (perfil.esDimension) {
      return { semantica: S.CATEGORIA, confianza: 0.5, fuerte: false, motivo: 'Texto que se repite: sirve para agrupar, aunque no se sabe de qué.' }
    }
    return { semantica: S.DESCONOCIDO, confianza: 0.3, fuerte: false, motivo: 'No hay pistas suficientes sobre qué representa.' }
  }

  // Numérica
  if (perfil.tipo === TIPOS.PORCENTAJE) {
    return { semantica: S.PORCENTAJE, confianza: 0.9, fuerte: true, motivo: 'Los valores llevan el símbolo de porcentaje.' }
  }
  if (perfil.tipo === TIPOS.MONEDA) {
    return { semantica: S.IMPORTE, confianza: 0.9, fuerte: true, motivo: 'Los valores llevan símbolo de moneda.' }
  }
  if (perfil.enteros && perfil.min >= 0 && perfil.max <= 1000000 && !perfil.esIdentificador) {
    return { semantica: S.CANTIDAD, confianza: 0.45, fuerte: false, motivo: 'Números enteros positivos: parecen un recuento.' }
  }
  return { semantica: S.IMPORTE, confianza: 0.35, fuerte: false, motivo: 'Números con decimales: se tratan como una magnitud, sin saber de qué.' }
}

function proporcion(lista, prueba) {
  if (!lista.length) return 0
  return lista.filter(prueba).length / lista.length
}

// Papel que juega la columna al construir el dashboard
const SEMANTICAS_METRICA = [S.IMPORTE, S.INGRESO, S.COSTE, S.PRECIO, S.PRESUPUESTO, S.MARGEN, S.BENEFICIO, S.CANTIDAD, S.PORCENTAJE, S.DURACION]

function decidirRol(semantica, perfil) {
  if (semantica === S.FECHA) return 'temporal'
  if (semantica === S.IDENTIFICADOR) return 'identificador'
  if (SEMANTICAS_METRICA.includes(semantica)) return perfil.esMetrica ? 'metrica' : 'ninguno'
  if ([S.EMAIL, S.URL, S.TELEFONO, S.TEXTO_LIBRE].includes(semantica)) return 'ninguno'
  return perfil.esDimension ? 'dimension' : 'ninguno'
}

function decidirUnidad(semantica, perfil) {
  if (semantica === S.PORCENTAJE || perfil.tipo === TIPOS.PORCENTAJE) return '%'
  if (perfil.moneda) return perfil.moneda
  if ([S.IMPORTE, S.INGRESO, S.COSTE, S.PRECIO, S.PRESUPUESTO, S.BENEFICIO].includes(semantica)) {
    // Sin símbolo explícito no se inventa la moneda: se deja en blanco y el
    // dashboard mostrará la cifra desnuda antes que poner un € que no consta.
    return null
  }
  if (semantica === S.CANTIDAD) return 'uds'
  return null
}

/*
  Clasifica el VALOR de una columna de estado en una familia manejable.
  Permite construir cifras como "pendiente de cobro" sin saber de antemano el
  vocabulario exacto de cada negocio. Devuelve null si no se reconoce, y en
  ese caso el estado se trata como una categoría más.
*/
const FAMILIAS_ESTADO = [
  ['pendiente', ['pendiente', 'impagado', 'impago', 'vencido', 'vencida', 'moroso', 'por cobrar', 'no', 'ko', 'borrador', 'bloqueado', 'bloqueada', 'parado', 'parada']],
  ['completado', ['cobrado', 'cobrada', 'pagado', 'pagada', 'completado', 'completada', 'finalizado', 'finalizada', 'terminado', 'terminada', 'entregado', 'entregada', 'cerrado', 'cerrada', 'vendido', 'vendida', 'si', 'sí', 'ok', 'aprobado', 'aprobada', 'confirmado', 'confirmada']],
  ['cancelado', ['cancelado', 'cancelada', 'anulado', 'anulada', 'rechazado', 'rechazada', 'baja', 'inactivo', 'inactiva']],
  ['activo', ['activo', 'activa', 'en curso', 'en proceso', 'en progreso', 'abierto', 'abierta', 'nuevo', 'nueva', 'planificado', 'planificada', 'alta', 'disponible', 'reservado', 'enviado', 'enviada']],
]

export function clasificarEstado(valor) {
  const v = claveNormalizada(valor)
  if (!v) return null
  for (const [familia, palabras] of FAMILIAS_ESTADO) {
    if (palabras.includes(v)) return familia
  }
  return null
}

// Etiqueta legible para explicar una semántica en la interfaz
export function etiquetaSemantica(semantica) {
  return (
    {
      [S.IDENTIFICADOR]: 'identificador',
      [S.FECHA]: 'fecha',
      [S.IMPORTE]: 'importe',
      [S.INGRESO]: 'ingresos',
      [S.COSTE]: 'costes',
      [S.PRECIO]: 'precio',
      [S.PRESUPUESTO]: 'presupuesto',
      [S.MARGEN]: 'margen',
      [S.BENEFICIO]: 'beneficio',
      [S.CANTIDAD]: 'cantidad',
      [S.PORCENTAJE]: 'porcentaje',
      [S.DURACION]: 'duración',
      [S.PERSONA]: 'persona',
      [S.ORGANIZACION]: 'organización',
      [S.UBICACION]: 'ubicación',
      [S.CATEGORIA]: 'categoría',
      [S.ESTADO]: 'estado',
      [S.PRODUCTO]: 'producto',
      [S.PROYECTO]: 'proyecto',
      [S.EMAIL]: 'correo',
      [S.TELEFONO]: 'teléfono',
      [S.URL]: 'enlace',
      [S.BOOLEANO]: 'sí/no',
      [S.TEXTO_LIBRE]: 'texto libre',
      [S.DESCONOCIDO]: 'sin identificar',
    }[semantica] || semantica
  )
}
