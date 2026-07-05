import { parsearExcel, leerTexto, archivoABase64 } from './parseArchivo'

/*
  Llamadas a la API de Google Gemini.

  Funciones principales:
   - analizarFuente(file, tipoArchivo, apiKey, perfil): analiza UN archivo y
     devuelve su contenido normalizado (título, categoría, tabla, eventos,
     métricas), teniendo en cuenta el perfil del usuario.
   - analizarPanelCompleto(fuentes, perfil, apiKey): cruza TODAS las fuentes
     con el perfil y devuelve tipo de dashboard, KPIs personalizados,
     conexiones entre fuentes, titular y sugerencias.
   - llamarGeminiContents: llamada con historial de turnos (para el chatbot).

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
  - perfil (opcional): respuestas del asistente de creación, para que la
    normalización se adapte a lo que el usuario quiere ver.
*/
export async function analizarFuente(file, tipoArchivo, apiKey, perfil = null) {
  // Construimos las "parts" del mensaje según el tipo de archivo. En Gemini,
  // cada archivo binario (PDF/imagen) va como inline_data { mime_type, data }.
  const contexto = perfil ? `Contexto del dueño del panel: ${describirPerfil(perfil)}\n` : ''
  let partes
  if (tipoArchivo === 'excel') {
    const textoTabla = await parsearExcel(file)
    partes = [
      { text: `${contexto}Contenido del archivo "${file.name}" (en JSON por hojas):\n${textoTabla}` },
    ]
  } else if (tipoArchivo === 'calendario' || tipoArchivo === 'texto') {
    const texto = await leerTexto(file)
    partes = [{ text: `${contexto}Contenido del archivo "${file.name}":\n${texto}` }]
  } else if (tipoArchivo === 'pdf') {
    const { base64 } = await archivoABase64(file)
    partes = [
      { inline_data: { mime_type: 'application/pdf', data: base64 } },
      { text: `${contexto}Analiza este documento "${file.name}".` },
    ]
  } else {
    // Imagen: el modelo la lee por visión/OCR
    const { base64, mediaType } = await archivoABase64(file)
    partes = [
      { inline_data: { mime_type: mediaType, data: base64 } },
      { text: `${contexto}Analiza esta imagen "${file.name}".` },
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

// Describe el perfil del asistente de creación para inyectarlo en los prompts
function describirPerfil(perfil) {
  if (!perfil) return 'El usuario no ha rellenado el formulario inicial.'
  const partes = []
  if (perfil.proposito)
    partes.push(
      `Propósito del dashboard: ${
        perfil.proposito === 'personal' ? 'uso personal' : perfil.proposito === 'trabajo' ? 'su trabajo' : 'su negocio'
      }.`
    )
  if (perfil.descripcion) partes.push(`Descripción del usuario: "${perfil.descripcion}".`)
  if (perfil.ayuda) partes.push(`En qué quiere que le ayude el dashboard: "${perfil.ayuda}".`)
  if (perfil.contenidos?.length)
    partes.push(`Qué quiere ver en el panel: ${perfil.contenidos.join(', ')}.`)
  return partes.join(' ')
}

const INSTRUCCION_ANALISIS = `Eres el analista jefe de Empleia. Recibes (1) el PERFIL que el usuario rellenó al crear
su dashboard (para qué lo quiere, a qué se dedica, qué quiere ver) y (2) TODAS las fuentes de datos ya normalizadas
(tablas, métricas y eventos). Tu trabajo NO es repetir las tablas: es ENTENDER el conjunto y CRUZAR la información
entre fuentes, personalizándolo todo al perfil del usuario.

Devuelve SOLO un JSON válido (sin texto adicional, sin markdown) con esta estructura exacta:
{
  "tipo": "nombre corto del tipo de dashboard, máx. 5 palabras (ej: 'Panel de pagos', 'Gestión de peluquería')",
  "emoji": "un único emoji que represente ese tipo",
  "descripcion": "1 frase explicando qué organiza este panel y para qué le sirve al usuario",
  "titular": "una frase con el estado global según los datos, con cifras concretas",
  "kpis": [ { "etiqueta": "nombre de la cifra", "valor": "valor con su unidad", "detalle": "matiz corto (ej: 'de 5 facturas', '+2 esta semana')" } ],
  "conexiones": [ { "titulo": "máx. 5 palabras", "texto": "conexión concreta detectada CRUZANDO al menos dos fuentes o datos, con cifras" } ],
  "sugerencias": [ "entre 2 y 4 acciones recomendadas, concretas y accionables, adaptadas al perfil" ]
}

Reglas:
- "kpis": entre 3 y 4 cifras que de verdad importen a ESTE usuario según su perfil (no recuentos triviales de filas).
  Calcula totales, pendientes, medias o próximos vencimientos a partir de los registros.
- "conexiones": entre 2 y 4. Busca relaciones reales: el mismo cliente en dos fuentes, gastos frente a ingresos,
  citas que chocan con disponibilidad del equipo, inventario que afecta a trabajos agendados… Si solo hay una
  fuente, cruza columnas dentro de ella (p. ej. estado de pago por cliente).
- No inventes datos que no estén en las fuentes. Escribe en español, cercano y claro.`

/*
  Análisis inteligente conjunto del panel: cruza TODAS las fuentes con el
  perfil del usuario y devuelve tipo de dashboard, KPIs personalizados,
  conexiones entre fuentes, titular y sugerencias.
*/
export async function analizarPanelCompleto(fuentes, perfil, apiKey) {
  const cuerpo = fuentes
    .map((f, i) => {
      const r = f.resultado
      const registros = (r.registros || []).slice(0, 25)
      return `Fuente ${i + 1} — "${r.titulo}" (categoría: ${r.categoria}, ${(r.registros || []).length} registros en total)
Resumen: ${r.resumen}
Columnas: ${(r.columnas || []).join(', ') || 'ninguna'}
Registros (muestra): ${JSON.stringify(registros)}
Métricas: ${(r.metricas || []).map((m) => `${m.etiqueta}: ${m.valor}`).join('; ') || 'ninguna'}
Eventos: ${(r.eventos || [])
        .slice(0, 15)
        .map((e) => `${e.fecha} ${e.titulo}`)
        .join(' | ') || 'ninguno'}`
    })
    .join('\n\n')

  const resultado = await llamarGemini(apiKey, INSTRUCCION_ANALISIS, [
    {
      text: `PERFIL DEL USUARIO: ${describirPerfil(perfil)}
Fecha de hoy: ${new Date().toISOString().slice(0, 10)}

FUENTES DEL PANEL:

${cuerpo}`,
    },
  ])

  if (!resultado.tipo) resultado.tipo = 'Panel de organización'
  if (!resultado.emoji) resultado.emoji = '📊'
  if (!resultado.descripcion) resultado.descripcion = ''
  if (!resultado.titular) resultado.titular = ''
  if (!Array.isArray(resultado.kpis)) resultado.kpis = []
  if (!Array.isArray(resultado.conexiones)) resultado.conexiones = []
  if (!Array.isArray(resultado.sugerencias)) resultado.sugerencias = []
  resultado.kpis = resultado.kpis
    .filter((k) => k && k.etiqueta && k.valor !== undefined)
    .slice(0, 4)
  resultado.conexiones = resultado.conexiones.filter((c) => c && c.texto).slice(0, 4)
  return resultado
}
