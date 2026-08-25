import { analizarLibro } from './analisis/index'
import { SEMANTICA } from './analisis/semantica'
import { formatearNumero } from './analisis/formato'

/*
  Puente entre el pipeline de análisis y la forma que el panel espera de una
  fuente ({ titulo, categoria, resumen, columnas, registros, eventos,
  metricas }).

  Lo importante de este módulo: un Excel se entiende ENTERO en local. No hace
  falta API key para que sus cifras, sus gráficos y sus apartados sean
  correctos; el modelo de lenguaje solo se usa después para ponerle nombre y
  redactar, y si no está disponible el panel funciona igual.
*/

const S = SEMANTICA

// Cuántas filas se guardan para las tablas de la interfaz. El ANÁLISIS usa
// todas; esto es solo lo que se muestra y lo que se guarda en el panel.
const MAX_REGISTROS_VISIBLES = 200
const MAX_EVENTOS = 40

/*
  Analiza un archivo Excel/CSV con el pipeline local.
  Devuelve { resultado, pipeline } donde `resultado` es la fuente del panel.
*/
export async function analizarExcelLocal(file, opciones = {}) {
  const datos = await file.arrayBuffer()
  const pipeline = await analizarLibro(datos, opciones)
  const { configuracion, modelos } = pipeline

  // La tabla principal es la que más datos aporta: es la que alimenta las
  // vistas de tabla del panel.
  const principal = [...modelos].sort((a, b) => b.filas * b.campos.length - a.filas * a.campos.length)[0]

  return {
    resultado: {
      titulo: tituloLocal(file.name, configuracion, principal),
      categoria: categoriaLocal(configuracion, principal),
      resumen: resumenLocal(configuracion, modelos),
      columnas: principal ? principal.campos.map((c) => c.columna.nombre) : [],
      registros: principal ? registrosVisibles(principal) : [],
      totalRegistros: principal ? principal.filas : 0,
      eventos: eventosDe(modelos),
      metricas: metricasDe(configuracion),
      // El análisis completo viaja con la fuente: es lo que dibuja los
      // apartados, los gráficos y la explicación de cada cifra.
      analisis: configuracion,
      avisos: pipeline.avisos,
      analizadoEnLocal: true,
    },
    pipeline,
  }
}

/*
  Análisis conjunto del panel SIN modelo de lenguaje, a partir de lo que el
  pipeline ya ha calculado para cada hoja de cálculo.

  Sirve para que un usuario sin API key tenga un dashboard completo y correcto:
  apartados, gráficos y cifras salen igual, solo faltan los textos redactados.
  Todo lo que se escribe aquí describe un cálculo; no hay consejos inventados.
*/
export function analisisLocalDePanel(fuentes) {
  const conAnalisis = fuentes.filter((f) => f.resultado?.analisis?.kpis?.length)
  if (!conAnalisis.length) return null

  const principal = conAnalisis[0].resultado.analisis
  const kpis = conAnalisis.flatMap((f) => f.resultado.analisis.kpis).slice(0, 4)
  const insights = conAnalisis.flatMap((f) => f.resultado.analisis.insights || [])

  const secciones = conAnalisis.flatMap((f) =>
    (f.resultado.analisis.secciones || []).map((s) => ({
      ...s,
      id: `${f.id}-${s.id}`,
      titulo: conAnalisis.length > 1 ? `${s.titulo} · ${f.resultado.titulo}` : s.titulo,
      origen: 'local',
      fuenteId: f.id,
    }))
  )

  // El titular resume con cifras, sin adjetivos que no se puedan sostener
  const titular = kpis
    .slice(0, 3)
    .map((k) => `${k.etiqueta}: ${k.valorFormateado}`)
    .join(' · ')

  // Como "conexiones" se usan los hallazgos calculados y las relaciones
  // detectadas entre hojas: son cruces reales, no interpretaciones.
  const conexiones = [
    ...insights
      .filter((i) => ['concentracion', 'subida', 'caida', 'pico', 'reparto'].includes(i.tipo))
      .slice(0, 3)
      .map((i) => ({ titulo: i.titulo, texto: i.texto })),
    ...conAnalisis.flatMap((f) =>
      (f.resultado.analisis.relaciones || []).map((r) => ({
        titulo: 'Hojas relacionadas',
        texto: r.motivo,
      }))
    ),
  ].slice(0, 4)

  /*
    Sin modelo no se dan consejos de negocio: solo se señala lo que hay que
    revisar en los datos, que es una recomendación comprobable. Antes que
    inventar "reclama esta factura", se prefiere no decir nada.
  */
  const sugerencias = conAnalisis
    .flatMap((f) => f.resultado.analisis.calidad.problemas)
    .filter((p) => p.gravedad === 'alta')
    .slice(0, 3)
    .map((p) => `Revisa este punto antes de fiarte de las cifras: ${p.mensaje}`)

  return {
    tipo: principal.tipoDashboard,
    emoji: principal.emoji,
    descripcion: conAnalisis.map((f) => f.resultado.resumen).join(' '),
    titular,
    kpis: kpis.map((k) => ({
      etiqueta: k.etiqueta,
      valor: k.valorFormateado,
      detalle: k.detalle || null,
      procedencia: k.procedencia,
    })),
    conexiones,
    sugerencias,
    secciones,
    generadoEnLocal: true,
  }
}

// Filas para las tablas de la interfaz, con los valores TAL Y COMO los
// escribió el usuario (la capa normalizada es solo para calcular)
function registrosVisibles(modelo) {
  const nombres = modelo.campos.map((c) => c.columna.nombre)
  return modelo.tabla.filas.slice(0, MAX_REGISTROS_VISIBLES).map((fila) => {
    const objeto = {}
    modelo.campos.forEach((campo, j) => {
      const bruto = fila[campo.indice]
      objeto[nombres[j]] = bruto instanceof Date ? bruto.toISOString().slice(0, 10) : bruto ?? ''
    })
    return objeto
  })
}

// Las métricas de la tarjeta de fuente salen de los KPIs ya validados
function metricasDe(configuracion) {
  return configuracion.kpis.slice(0, 4).map((k) => ({
    etiqueta: k.etiqueta,
    valor: k.valorFormateado,
    formula: k.procedencia?.formula || null,
  }))
}

/*
  Eventos para la agenda: una fecha más una etiqueta que diga de qué es.
  Se ordenan por cercanía a hoy, para que la lista de próximos no salga vacía
  cuando el Excel arrastra años de histórico.
*/
function eventosDe(modelos) {
  const eventos = []

  for (const modelo of modelos) {
    const temporal = modelo.temporales[0]
    if (!temporal) continue

    // La etiqueta: el primer nombre propio que haya en la fila
    const etiqueta =
      modelo.campos.find((c) => ['entidad', 'dimension'].includes(c.rol) && c.semantica !== S.ESTADO) ||
      modelo.campos.find((c) => c.rol === 'identificador')
    const metrica = modelo.metricas[0]

    modelo.perfil.filasNormalizadas.forEach((fila) => {
      const fecha = fila[temporal.indice]
      if (typeof fecha !== 'string' || fecha.length < 10) return
      const partes = []
      if (etiqueta) partes.push(String(fila[etiqueta.indice] ?? '').trim())
      if (metrica && typeof fila[metrica.indice] === 'number') {
        partes.push(formatearNumero(fila[metrica.indice], metrica.unidad))
      }
      const texto = partes.filter(Boolean).join(' — ') || modelo.tabla.hoja
      eventos.push({ fecha, titulo: texto })
    })
  }

  const hoy = Date.now()
  return eventos
    .sort((a, b) => Math.abs(Date.parse(a.fecha) - hoy) - Math.abs(Date.parse(b.fecha) - hoy))
    .slice(0, MAX_EVENTOS)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Categoría del panel a partir de lo que se ha detectado
function categoriaLocal(configuracion, modelo) {
  const tipo = configuracion.tipoDashboard || ''
  const porTipo = {
    'Panel financiero': 'finanzas',
    'Panel de ventas': 'finanzas',
    'Panel de importes': 'finanzas',
    'Panel de personal': 'personas',
    'Panel de clientes': 'clientes',
    Inventario: 'inventario',
    'Control de inventario': 'inventario',
    'Control de proyectos': 'operaciones',
    'Control de obras': 'operaciones',
    'Cartera inmobiliaria': 'operaciones',
    'Panel de marketing': 'operaciones',
  }
  if (porTipo[tipo]) return porTipo[tipo]

  if (!modelo) return 'otros'
  const semanticas = new Set(modelo.campos.map((c) => c.semantica))
  if (semanticas.has(S.IMPORTE) || semanticas.has(S.INGRESO) || semanticas.has(S.COSTE)) return 'finanzas'
  if (semanticas.has(S.PRODUCTO) && semanticas.has(S.CANTIDAD)) return 'inventario'
  if (semanticas.has(S.PERSONA)) return 'clientes'
  // Solo fechas y poco más: es una agenda
  if (semanticas.has(S.FECHA) && modelo.metricas.length === 0) return 'agenda'
  return 'otros'
}

function tituloLocal(nombreArchivo, configuracion, modelo) {
  if (modelo?.tabla.notas?.length) {
    const nota = modelo.tabla.notas[0].split(' · ')[0].trim()
    if (nota.length >= 4 && nota.length <= 60) return nota
  }
  if (configuracion.tipoDashboard && configuracion.tipoDashboard !== 'Panel de datos') {
    return configuracion.tipoDashboard
  }
  return nombreArchivo.replace(/\.[^.]+$/, '')
}

// Resumen honesto, construido solo con lo que se ha medido
function resumenLocal(configuracion, modelos) {
  const partes = []
  const totalFilas = modelos.reduce((s, m) => s + m.filas, 0)

  if (modelos.length > 1) {
    partes.push(`${modelos.length} tablas con ${totalFilas.toLocaleString('es-ES')} registros en total.`)
  } else {
    partes.push(`${totalFilas.toLocaleString('es-ES')} registros.`)
  }

  const principales = configuracion.kpis.slice(0, 2).map((k) => `${k.etiqueta}: ${k.valorFormateado}`)
  if (principales.length) partes.push(principales.join('. ') + '.')

  const graves = configuracion.calidad.problemas.filter((p) => p.gravedad === 'alta').length
  if (graves) partes.push(`${graves} aviso(s) importantes sobre la calidad de los datos.`)

  return partes.join(' ')
}
