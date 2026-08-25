import { leerLibro } from './lectura'
import { construirModelo } from './modelo'
import { detectarRelaciones } from './relaciones'
import { generarConfiguracion } from './layout'
import { validarConfiguracion } from './validacion'

/*
  ORQUESTADOR del pipeline de análisis.

  El dashboard NO se genera justo después de leer el Excel: entre medias hay
  que entender qué contiene el archivo. Estas son las etapas, en orden:

    Excel → lectura → estructura → perfilado → interpretación → relaciones
          → calidad → métricas → visualizaciones → validación → dashboard

  Todo ocurre en local: no se manda un solo dato a ninguna API para calcular.
  El modelo de lenguaje entra DESPUÉS y solo para titular y redactar, nunca
  para hacer cuentas (ver gemini.js).
*/

// Etapas tal y como se le enseñan al usuario mientras espera
export const ETAPAS = [
  { id: 'lectura', texto: 'Analizando archivo…' },
  { id: 'estructura', texto: 'Detectando estructura…' },
  { id: 'perfilado', texto: 'Entendiendo los datos…' },
  { id: 'relaciones', texto: 'Buscando relaciones…' },
  { id: 'metricas', texto: 'Creando métricas…' },
  { id: 'visualizaciones', texto: 'Seleccionando visualizaciones…' },
  { id: 'validacion', texto: 'Validando dashboard…' },
]

/*
  Analiza un Excel/CSV ya leído como ArrayBuffer y devuelve la configuración
  del dashboard.

  `onProgreso(etapa, texto)` se llama al empezar cada etapa, para que la
  interfaz pueda ir contando lo que ocurre.

  Devuelve { configuracion, modelos, relaciones, incidencias, avisos, valida }
*/
export async function analizarLibro(datos, opciones = {}) {
  const { onProgreso = () => {} } = opciones
  const avisar = async (id) => {
    const etapa = ETAPAS.find((e) => e.id === id)
    onProgreso(id, etapa?.texto || '')
    // Cede el hilo para que el navegador pueda repintar el estado antes de
    // meterse en la siguiente etapa, que puede ser larga.
    await new Promise((r) => setTimeout(r, 0))
  }

  await avisar('lectura')
  const { tablas, hojas, avisos } = leerLibro(datos)

  await avisar('estructura')
  if (!tablas.length) {
    return {
      configuracion: generarConfiguracion([]),
      modelos: [],
      relaciones: [],
      incidencias: [],
      hojas,
      avisos: [
        ...avisos,
        {
          tipo: 'sin-tablas',
          mensaje: 'No se ha encontrado ninguna tabla de datos en el archivo.',
        },
      ],
      valida: false,
    }
  }

  await avisar('perfilado')
  const modelos = tablas.map((tabla) => construirModelo(tabla))

  await avisar('relaciones')
  const relaciones = modelos.length > 1 ? detectarRelaciones(modelos) : []

  await avisar('metricas')
  await avisar('visualizaciones')
  const configuracionBruta = generarConfiguracion(modelos, relaciones)

  await avisar('validacion')
  const { configuracion, incidencias, valida } = validarConfiguracion(configuracionBruta, modelos)

  return { configuracion, modelos, relaciones, incidencias, hojas, avisos, valida }
}

/*
  Resumen en texto del análisis, pensado para dárselo al modelo de lenguaje.

  Va deliberadamente SIN filas de datos: el modelo no tiene que sumar nada
  (eso ya está hecho y validado), solo ponerle nombre a lo que hay. Así el
  prompt es corto aunque el Excel tenga cien mil registros.
*/
export function resumirParaModelo(resultado) {
  const { configuracion, modelos, relaciones } = resultado
  const partes = []

  partes.push(`TIPO DETECTADO: ${configuracion.tipoDashboard} (confianza ${configuracion.confianza.tipoDashboard}).`)

  for (const modelo of modelos) {
    const columnas = modelo.campos
      .map((c) => {
        const detalles = [c.semantica, c.rol, `confianza ${c.confianza}`]
        if (c.unidad) detalles.push(c.unidad)
        if (c.conflicto) detalles.push(`OJO: el nombre sugería "${c.conflicto.nombreSugiere}"`)
        return `  - "${c.columna.nombre}" (${detalles.join(', ')})`
      })
      .join('\n')
    partes.push(
      `HOJA "${modelo.tabla.hoja}" — ${modelo.filas} filas, ${modelo.campos.length} columnas:\n${columnas}`
    )
  }

  if (relaciones.length) {
    partes.push(
      `RELACIONES DETECTADAS:\n${relaciones.map((r) => `  - ${r.motivo}`).join('\n')}`
    )
  }

  partes.push(
    `CIFRAS YA CALCULADAS Y VALIDADAS (no las recalcules, no las cambies):\n${configuracion.kpis
      .map((k) => `  - ${k.etiqueta}: ${k.valorFormateado} [${k.procedencia.formula}]`)
      .join('\n')}`
  )

  if (configuracion.insights.length) {
    partes.push(
      `HALLAZGOS CALCULADOS:\n${configuracion.insights.map((i) => `  - ${i.texto}`).join('\n')}`
    )
  }

  const problemas = configuracion.calidad.problemas.filter((p) => p.gravedad !== 'baja')
  if (problemas.length) {
    partes.push(`PROBLEMAS DE CALIDAD:\n${problemas.map((p) => `  - ${p.mensaje}`).join('\n')}`)
  }

  return partes.join('\n\n')
}

/*
  Versión reducida del resumen que trabaja SOLO con la configuración, que es
  lo que se guarda con el panel (los modelos, con todas las filas dentro, no
  se persisten). Se usa en el análisis conjunto de varias fuentes.
*/
export function resumirConfiguracion(configuracion) {
  if (!configuracion) return ''
  const partes = []

  partes.push(`Tipo detectado: ${configuracion.tipoDashboard}.`)
  partes.push(
    `Hojas: ${configuracion.fuentes
      .map((f) => `"${f.hoja}" (${f.filas} filas, ${f.columnas} columnas)`)
      .join(', ')}.`
  )

  if (configuracion.metricas?.length) {
    partes.push(
      `Columnas de métrica: ${configuracion.metricas.map((m) => `${m.columna} (${m.semantica})`).join(', ')}.`
    )
  }
  if (configuracion.dimensiones?.length) {
    partes.push(
      `Columnas para agrupar: ${configuracion.dimensiones.map((d) => `${d.columna} (${d.semantica})`).join(', ')}.`
    )
  }

  if (configuracion.kpis?.length) {
    partes.push(
      `Cifras ya calculadas y validadas: ${configuracion.kpis
        .map((k) => `${k.etiqueta} = ${k.valorFormateado} [${k.procedencia?.formula}]`)
        .join('; ')}.`
    )
  }
  if (configuracion.insights?.length) {
    partes.push(`Hallazgos calculados: ${configuracion.insights.map((i) => i.texto).join(' ')}`)
  }

  const graves = (configuracion.calidad?.problemas || []).filter((p) => p.gravedad !== 'baja')
  if (graves.length) {
    partes.push(`Avisos de calidad: ${graves.map((p) => p.mensaje).join(' ')}`)
  }

  return partes.join('\n')
}

export { leerLibro, construirModelo, detectarRelaciones, generarConfiguracion, validarConfiguracion }
