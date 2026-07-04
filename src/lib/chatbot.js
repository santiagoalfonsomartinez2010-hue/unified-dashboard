import { llamarGeminiContents, CATEGORIAS } from './gemini'

/*
  Chatbot inteligente del panel. Funciona con la API key de Gemini de cada
  usuario y recibe TODO el contenido del dashboard como contexto, así que
  puede:
   - responder preguntas sobre los datos ("¿cuántos proveedores nuevos han
     llegado esta semana?")
   - editar el estilo visual (tema claro/oscuro, color de acento)
   - editar información (renombrar el panel o las fuentes, corregir métricas,
     editar registros, quitar fuentes…)

  El modelo responde SIEMPRE con { respuesta, acciones } y la app aplica las
  acciones sobre el estado. Las acciones no reconocidas se ignoran.
*/

const INSTRUCCION_CHAT = `Eres el asistente del Panel Unificado de Empleia. Hablas SIEMPRE en español, con un tono cercano y claro.
Recibes el estado completo del dashboard del usuario (tipo de panel, tema visual, fuentes con sus tablas, métricas y eventos)
y el historial de la conversación. El usuario puede pedirte dos tipos de cosas:

1) PREGUNTAS sobre sus datos: respóndelas mirando las fuentes (cuenta filas, suma valores, filtra por fechas…).
   Usa la fecha de hoy que se te indica para preguntas como "esta semana" o "este mes". Da cifras concretas.
   Si el dato no está en el panel, dilo claramente y sugiere qué fuente conectar.

2) CAMBIOS en el panel: aplícalos devolviendo acciones. Acciones disponibles:
   - { "tipo": "cambiar_tema", "modo": "oscuro" | "claro" }               → cambia el modo de color
   - { "tipo": "cambiar_acento", "color": "#rrggbb" }                      → cambia el color principal de la interfaz
   - { "tipo": "renombrar_panel", "nombre": "..." }                        → cambia el nombre del dashboard
   - { "tipo": "renombrar_fuente", "id": "...", "titulo": "..." }          → cambia el título de una fuente
   - { "tipo": "cambiar_categoria", "id": "...", "categoria": "..." }      → una de: ${CATEGORIAS.join(', ')}
   - { "tipo": "quitar_fuente", "id": "..." }                              → elimina una fuente del panel
   - { "tipo": "editar_metricas", "id": "...", "metricas": [{ "etiqueta": "...", "valor": "..." }] } → sustituye las métricas de una fuente
   - { "tipo": "editar_registros", "id": "...", "columnas": ["..."], "registros": [{...}] }          → sustituye la tabla de una fuente (máx. 40 filas)
   - { "tipo": "editar_eventos", "id": "...", "eventos": [{ "fecha": "AAAA-MM-DD", "titulo": "..." }] } → sustituye los eventos de una fuente

Reglas:
- Devuelve SOLO un JSON válido (sin markdown, sin texto fuera del JSON) con esta estructura exacta:
  { "respuesta": "tu mensaje al usuario en español", "acciones": [ ...cero o más acciones... ] }
- Usa los "id" de fuente tal y como aparecen en el estado del panel. Nunca inventes ids.
- Para ediciones de registros/métricas/eventos devuelve la lista COMPLETA ya editada (lo que envíes sustituye lo anterior).
- Si el usuario pide un cambio ambiguo, pregunta antes de actuar (acciones: []).
- Si el usuario pide un color ("ponlo verde", "estilo rosa"), tradúcelo a un hex bonito y legible.
- Tras aplicar cambios, cuenta en "respuesta" qué has hecho exactamente.
- No inventes datos que no estén en el panel.`

// Serializa el panel para dárselo como contexto al modelo, truncando las
// tablas largas para no pasarnos de tokens.
function contextoPanel(panel) {
  const fuentes = panel.fuentes
    .filter((f) => f.estado === 'listo')
    .map((f) => {
      const r = f.resultado
      return {
        id: f.id,
        titulo: r.titulo,
        categoria: r.categoria,
        origen: f.origen || 'archivo',
        resumen: r.resumen,
        columnas: r.columnas,
        registros: (r.registros || []).slice(0, 25),
        totalRegistros: (r.registros || []).length,
        metricas: r.metricas,
        eventos: (r.eventos || []).slice(0, 20),
      }
    })

  return JSON.stringify(
    {
      fechaDeHoy: new Date().toISOString().slice(0, 10),
      nombrePanel: panel.nombrePanel,
      tipoPanel: panel.tipoPanel,
      tema: panel.tema,
      resumenGlobal: panel.resumen,
      fuentes,
    },
    null,
    1
  )
}

const TIPOS_ACCION = [
  'cambiar_tema',
  'cambiar_acento',
  'renombrar_panel',
  'renombrar_fuente',
  'cambiar_categoria',
  'quitar_fuente',
  'editar_metricas',
  'editar_registros',
  'editar_eventos',
]

/*
  Envía un mensaje al chatbot. "historial" son los mensajes previos
  [{ de: 'usuario' | 'bot', texto }], "panel" el estado actual del dashboard.
  Devuelve { respuesta, acciones } ya validado.
*/
export async function enviarMensajeChat(historial, mensaje, panel, apiKey) {
  const contents = []

  // El contexto del panel va como primer turno de usuario, seguido de un
  // acuse del modelo, para que el historial real quede limpio.
  contents.push({
    role: 'user',
    parts: [{ text: `Estado actual del dashboard:\n${contextoPanel(panel)}` }],
  })
  contents.push({
    role: 'model',
    parts: [{ text: '{"respuesta":"Entendido, tengo el estado del panel. ¿En qué te ayudo?","acciones":[]}' }],
  })

  for (const m of historial.slice(-12)) {
    contents.push({
      role: m.de === 'usuario' ? 'user' : 'model',
      parts: [{ text: m.texto }],
    })
  }
  contents.push({ role: 'user', parts: [{ text: mensaje }] })

  const resultado = await llamarGeminiContents(apiKey, INSTRUCCION_CHAT, contents)

  const respuesta =
    typeof resultado.respuesta === 'string' && resultado.respuesta.trim()
      ? resultado.respuesta.trim()
      : 'Hecho.'
  const acciones = Array.isArray(resultado.acciones)
    ? resultado.acciones.filter((a) => a && TIPOS_ACCION.includes(a.tipo))
    : []
  return { respuesta, acciones }
}

// Etiqueta legible de cada acción aplicada (para mostrarla en el chat)
export function describirAccion(accion) {
  switch (accion.tipo) {
    case 'cambiar_tema':
      return `Tema ${accion.modo}`
    case 'cambiar_acento':
      return `Color ${accion.color}`
    case 'renombrar_panel':
      return `Panel → "${accion.nombre}"`
    case 'renombrar_fuente':
      return `Fuente → "${accion.titulo}"`
    case 'cambiar_categoria':
      return `Categoría → ${accion.categoria}`
    case 'quitar_fuente':
      return 'Fuente eliminada'
    case 'editar_metricas':
      return 'Métricas editadas'
    case 'editar_registros':
      return 'Tabla editada'
    case 'editar_eventos':
      return 'Eventos editados'
    default:
      return accion.tipo
  }
}
