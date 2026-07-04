import { parsearExcel, leerTexto, archivoABase64 } from './parseArchivo'

/*
  Llamadas a la API de Google Gemini.

  Dos funciones:
   - analizarFuente(file, tipoArchivo, apiKey): analiza UN archivo subido y
     devuelve su contenido normalizado (título, categoría, tabla, eventos,
     métricas) para pintarlo en el panel unificado.
   - generarResumenGlobal(fuentes, apiKey): recibe los resúmenes de todas las
     fuentes ya procesadas y devuelve un análisis conjunto (titular, insights
     y sugerencias).

  ⚠️ SEGURIDAD: al no haber backend, la API key viaja al navegador (va como
  parámetro ?key= en la URL). Úsala solo en esta demo; en producción la
  llamada debería ir en un backend.
*/

// Los modelos 1.5 fueron retirados de la API pública; usamos un modelo 2.x
// actual por defecto. Se puede sobrescribir con VITE_GEMINI_MODEL.
const MODELO = (import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite').trim()
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`

// Categorías fijas en las que el modelo clasifica cada fuente. El panel las
// usa para colorear el gráfico de categorías, así que deben ser un conjunto
// cerrado y pequeño.
export const CATEGORIAS = [
  'finanzas',
  'personas',
  'clientes',
  'inventario',
  'agenda',
  'operaciones',
  'otros',
]

const INSTRUCCION_FUENTE = `Eres el analista de datos de Empleia. Recibes el contenido de UN archivo
(hoja de cálculo, PDF, imagen, calendario o texto) que un negocio quiere ver en su panel unificado.
Devuelve SOLO un JSON válido (sin texto adicional, sin markdown) con esta estructura exacta:
{
  "titulo": "nombre corto y descriptivo del contenido (máx. 6 palabras)",
  "categoria": "finanzas" | "personas" | "clientes" | "inventario" | "agenda" | "operaciones" | "otros",
  "resumen": "1 o 2 frases explicando qué contiene y qué destaca",
  "columnas": ["nombres de las columnas de la tabla normalizada"],
  "registros": [ { ...objetos con exactamente esas columnas... } ],
  "eventos": [ { "fecha": "AAAA-MM-DD", "titulo": "descripción corta" } ],
  "metricas": [ { "etiqueta": "nombre de la cifra", "valor": "valor con su unidad" } ]
}

Reglas:
- "registros": normaliza los datos en una tabla coherente (máximo 40 filas y 6 columnas).
  Si el documento no es tabular (un contrato, una foto de una pizarra…), extrae los datos clave como filas.
- "eventos": citas, vencimientos, entregas o fechas relevantes que aparezcan en el documento (vacío si no hay).
- "metricas": entre 2 y 4 cifras destacadas calculables del contenido (totales, medias, recuentos), con unidad.
- Fechas siempre en formato AAAA-MM-DD. No inventes datos que no estén en el documento.`

const INSTRUCCION_RESUMEN = `Eres el analista jefe de Empleia. Recibes los resúmenes de TODAS las fuentes de datos
que un negocio ha conectado a su panel unificado (tablas, calendarios, documentos…).
Devuelve SOLO un JSON válido (sin texto adicional, sin markdown) con esta estructura exacta:
{
  "titular": "una frase que resuma el estado global del negocio según sus datos",
  "insights": ["entre 3 y 5 observaciones concretas cruzando las distintas fuentes"],
  "sugerencias": ["entre 2 y 3 acciones recomendadas y accionables"]
}
Escribe en español, con cifras concretas cuando existan. No inventes datos que no estén en los resúmenes.`

// Extrae el primer objeto JSON que aparezca en un texto (por si el modelo añade prosa)
function extraerJson(texto) {
  const inicio = texto.indexOf('{')
  const fin = texto.lastIndexOf('}')
  if (inicio === -1 || fin === -1) {
    throw new Error('La respuesta del modelo no contiene un JSON válido')
  }
  return JSON.parse(texto.slice(inicio, fin + 1))
}

// Llamada base a Gemini: system_instruction + partes del usuario → JSON parseado
function llamarGemini(apiKey, instruccion, partes) {
  return llamarGeminiContents(apiKey, instruccion, [{ role: 'user', parts: partes }])
}

/*
  Variante con historial completo de turnos (para el chatbot). "contents" es
  una lista [{ role: 'user' | 'model', parts: [{ text }] }].
*/
export async function llamarGeminiContents(apiKey, instruccion, contents) {
  if (!apiKey) {
    throw new Error(
      'Falta la API key de Gemini. Añádela desde el botón "API key" de la barra lateral (es gratuita en aistudio.google.com).'
    )
  }

  const cuerpo = {
    system_instruction: { parts: [{ text: instruccion }] },
    contents,
    generationConfig: { maxOutputTokens: 8192 },
  }

  // La autenticación va como ?key= en la URL (no en cabeceras).
  const respuesta = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    throw new Error(`Error de la API de Gemini (${respuesta.status}): ${detalle}`)
  }

  const datos = await respuesta.json()
  // El texto de la respuesta está en candidates[0].content.parts[0].text
  const texto = datos?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!texto) {
    throw new Error('La respuesta del modelo no contiene texto')
  }
  return extraerJson(texto)
}

/*
  Analiza un archivo y devuelve el contenido normalizado de la fuente:
  { titulo, categoria, resumen, columnas, registros, eventos, metricas }.
  - tipoArchivo: 'excel' | 'pdf' | 'imagen' | 'calendario' | 'texto'
*/
export async function analizarFuente(file, tipoArchivo, apiKey) {
  // Construimos las "parts" del mensaje según el tipo de archivo. En Gemini,
  // cada archivo binario (PDF/imagen) va como inline_data { mime_type, data }.
  let partes
  if (tipoArchivo === 'excel') {
    const textoTabla = await parsearExcel(file)
    partes = [{ text: `Contenido del archivo "${file.name}" (en JSON por hojas):\n${textoTabla}` }]
  } else if (tipoArchivo === 'calendario' || tipoArchivo === 'texto') {
    const texto = await leerTexto(file)
    partes = [{ text: `Contenido del archivo "${file.name}":\n${texto}` }]
  } else if (tipoArchivo === 'pdf') {
    const { base64 } = await archivoABase64(file)
    partes = [
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: `Analiza este documento "${file.name}".` },
    ]
  } else {
    // Imagen: el modelo la lee por visión/OCR
    const { base64, mediaType } = await archivoABase64(file)
    partes = [
      { inline_data: { mime_type: mediaType, data: base64 } },
      { text: `Analiza esta imagen "${file.name}".` },
    ]
  }

  const resultado = await llamarGemini(apiKey, INSTRUCCION_FUENTE, partes)

  // Validación mínima + valores por defecto para que el panel nunca reviente
  if (!resultado.titulo) resultado.titulo = file.name
  if (!CATEGORIAS.includes(resultado.categoria)) resultado.categoria = 'otros'
  if (!Array.isArray(resultado.columnas)) resultado.columnas = []
  if (!Array.isArray(resultado.registros)) resultado.registros = []
  if (!Array.isArray(resultado.eventos)) resultado.eventos = []
  if (!Array.isArray(resultado.metricas)) resultado.metricas = []
  return resultado
}

/*
  Analiza una fuente que ya viene como texto (correos de Gmail, eventos de
  Google Calendar, una hoja de Google Sheets…). Mismo formato de salida que
  analizarFuente.
*/
export async function analizarFuenteTexto(nombre, texto, apiKey) {
  const resultado = await llamarGemini(apiKey, INSTRUCCION_FUENTE, [
    { text: `Contenido de la fuente conectada "${nombre}":\n${texto}` },
  ])
  if (!resultado.titulo) resultado.titulo = nombre
  if (!CATEGORIAS.includes(resultado.categoria)) resultado.categoria = 'otros'
  if (!Array.isArray(resultado.columnas)) resultado.columnas = []
  if (!Array.isArray(resultado.registros)) resultado.registros = []
  if (!Array.isArray(resultado.eventos)) resultado.eventos = []
  if (!Array.isArray(resultado.metricas)) resultado.metricas = []
  return resultado
}

const INSTRUCCION_TIPO = `Eres el analista de Empleia. Recibes los resúmenes de todas las fuentes de datos
que un usuario ha conectado a su panel. Tu trabajo es deducir QUÉ TIPO DE DASHBOARD está intentando montar:
qué clase de organización o actividad hay detrás de esos datos (una peluquería, un gimnasio, el control de
pagos de un negocio, una tienda con inventario, la gestión de un equipo, las finanzas personales…).
Devuelve SOLO un JSON válido (sin texto adicional, sin markdown) con esta estructura exacta:
{
  "tipo": "nombre corto del tipo de panel, máx. 5 palabras (ej: 'Panel de pagos', 'Gestión de peluquería', 'Control de gimnasio')",
  "emoji": "un único emoji que represente ese tipo",
  "descripcion": "1 frase explicando qué se organiza en este panel y para qué sirve",
  "confianza": "alta" | "media" | "baja"
}
Si las fuentes son demasiado variadas o escasas para saberlo, usa confianza "baja" y un tipo genérico
como "Panel de organización general". Escribe en español.`

/*
  Detecta el tipo de dashboard que el usuario está montando (peluquería,
  gimnasio, pagos…) a partir de todas las fuentes procesadas.
  Devuelve { tipo, emoji, descripcion, confianza }.
*/
export async function detectarTipoPanel(fuentes, apiKey) {
  const descripcion = fuentes
    .map((f, i) => {
      const r = f.resultado
      return `Fuente ${i + 1} — "${r.titulo}" (categoría: ${r.categoria}). ${r.resumen}
Columnas: ${(r.columnas || []).join(', ') || 'ninguna'}. Métricas: ${(r.metricas || [])
        .map((m) => `${m.etiqueta}: ${m.valor}`)
        .join('; ') || 'ninguna'}`
    })
    .join('\n\n')

  const resultado = await llamarGemini(apiKey, INSTRUCCION_TIPO, [
    { text: `Fuentes conectadas al panel:\n\n${descripcion}` },
  ])
  if (!resultado.tipo) throw new Error('No se pudo detectar el tipo de panel')
  if (!resultado.emoji) resultado.emoji = '📊'
  if (!resultado.descripcion) resultado.descripcion = ''
  if (!['alta', 'media', 'baja'].includes(resultado.confianza)) resultado.confianza = 'media'
  return resultado
}

/*
  Genera el resumen global del panel a partir de las fuentes ya procesadas.
  Devuelve { titular, insights: [], sugerencias: [] }.
*/
export async function generarResumenGlobal(fuentes, apiKey) {
  const descripcion = fuentes
    .map((f, i) => {
      const r = f.resultado
      const metricas = (r.metricas || []).map((m) => `${m.etiqueta}: ${m.valor}`).join('; ')
      return `Fuente ${i + 1} — "${r.titulo}" (categoría: ${r.categoria}, ${r.registros.length} registros, ${r.eventos.length} eventos futuros).
Resumen: ${r.resumen}
Métricas: ${metricas || 'ninguna'}`
    })
    .join('\n\n')

  const resultado = await llamarGemini(apiKey, INSTRUCCION_RESUMEN, [
    { text: `Resúmenes de las fuentes conectadas al panel:\n\n${descripcion}` },
  ])

  if (!resultado.titular) throw new Error('El resumen devuelto no tiene la estructura esperada')
  if (!Array.isArray(resultado.insights)) resultado.insights = []
  if (!Array.isArray(resultado.sugerencias)) resultado.sugerencias = []
  return resultado
}
