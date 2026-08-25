import { leerTexto, archivoABase64 } from './parseArchivo'
import { parseImporte } from './finanzas'
import { analizarExcelLocal } from './fuenteExcel'
import { resumirParaModelo, resumirConfiguracion } from './analisis/index'

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

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

// Google va retirando modelos para las cuentas nuevas (1.5, 2.5-flash-lite,
// incluso 2.5-flash…). Para no depender de un nombre que puede caducar, la app
// PREGUNTA a la propia API key qué modelos tiene disponibles y elige uno sola.
// Se puede forzar uno concreto con VITE_GEMINI_MODEL.
const MODELO_FIJO = (import.meta.env.VITE_GEMINI_MODEL || '').trim()

// Modelo elegido, cacheado en memoria durante la sesión.
let modeloCache = MODELO_FIJO || null

// Orden de preferencia (por subcadena): primero los "flash" (rápidos y en la
// capa gratuita), con los alias "-latest" —que Google mantiene apuntando al
// modelo vigente— por delante.
const PREFERENCIAS_MODELO = [
  'gemini-flash-latest',
  'flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'flash',
  'gemini-pro-latest',
  'pro-latest',
  'gemini-2.5-pro',
  'pro',
]

// Lista los modelos de la cuenta que soportan generateContent (ids sin "models/")
async function listarModelosDisponibles(apiKey) {
  const respuesta = await fetch(`${BASE_URL}/models?key=${apiKey}&pageSize=200`)
  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    throw new Error(`No se pudo consultar los modelos de Gemini (${respuesta.status}): ${detalle}`)
  }
  const datos = await respuesta.json()
  return (datos.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => (m.name || '').replace(/^models\//, ''))
    .filter(Boolean)
}

// Elige el mejor modelo disponible según las preferencias
function elegirModelo(ids) {
  // Descarta modelos no aptos para chat/análisis de texto
  const utiles = ids.filter((id) => !/embedding|aqa|imagen|image|vision|tts|gemma/i.test(id))
  const pool = utiles.length ? utiles : ids
  for (const pref of PREFERENCIAS_MODELO) {
    const encontrado = pool.find((id) => id.includes(pref))
    if (encontrado) return encontrado
  }
  return pool[0]
}

// Devuelve el modelo a usar (fijo por env, o autodescubierto y cacheado)
async function resolverModelo(apiKey) {
  if (modeloCache) return modeloCache
  const ids = await listarModelosDisponibles(apiKey)
  if (ids.length === 0) {
    throw new Error(
      'Tu API key de Gemini no tiene ningún modelo disponible. Crea una nueva en aistudio.google.com/apikey.'
    )
  }
  modeloCache = elegirModelo(ids)
  return modeloCache
}

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
    generationConfig: {
      maxOutputTokens: 16384,
      // Modo JSON nativo de Gemini: obliga al modelo a devolver JSON puro,
      // sin prosa ni vallas de markdown alrededor.
      responseMimeType: 'application/json',
    },
  }

  // Lanza la petición generateContent con el modelo indicado (auth por ?key=)
  const pedir = (modelo) =>
    fetch(`${BASE_URL}/models/${modelo}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })

  let modelo = await resolverModelo(apiKey)
  let respuesta = await pedir(modelo)

  // Si el modelo elegido/cacheado ha dejado de estar disponible (404) y no está
  // forzado por env, se redescubre uno nuevo una vez y se reintenta.
  if (respuesta.status === 404 && !MODELO_FIJO) {
    modeloCache = null
    modelo = await resolverModelo(apiKey)
    respuesta = await pedir(modelo)
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    throw new Error(`Error de la API de Gemini (${respuesta.status}): ${detalle}`)
  }

  const datos = await respuesta.json()
  const candidato = datos?.candidates?.[0]
  // El texto de la respuesta está en candidates[0].content.parts[0].text
  const texto = candidato?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!texto) {
    throw new Error('La respuesta del modelo no contiene texto')
  }
  try {
    return extraerJson(texto)
  } catch {
    // La respuesta se cortó (demasiado larga) o no es JSON. Se adjunta el
    // texto crudo para que quien llama pueda usarlo como respuesta de rescate.
    const err = new Error(
      candidato?.finishReason === 'MAX_TOKENS'
        ? 'La respuesta era demasiado larga y se cortó. Pide el cambio en partes más pequeñas.'
        : 'La respuesta del modelo no contiene un JSON válido'
    )
    err.textoCrudo = texto
    throw err
  }
}

/*
  Analiza un archivo y devuelve el contenido normalizado de la fuente:
  { titulo, categoria, resumen, columnas, registros, eventos, metricas }.
  - tipoArchivo: 'excel' | 'pdf' | 'imagen' | 'calendario' | 'texto'
  - perfil (opcional): respuestas del asistente de creación, para que la
    normalización se adapte a lo que el usuario quiere ver.
*/
export async function analizarFuente(file, tipoArchivo, apiKey, perfil = null, opciones = {}) {
  /*
    Las hojas de cálculo NO se le mandan al modelo. Se analizan enteras en
    local (ver lib/analisis): así los totales salen de todas las filas y no de
    una muestra, y el Excel funciona aunque no haya API key. El modelo entra
    después, y solo para titular y redactar.
  */
  if (tipoArchivo === 'excel') {
    return analizarExcel(file, apiKey, perfil, opciones)
  }

  // Construimos las "parts" del mensaje según el tipo de archivo. En Gemini,
  // cada archivo binario (PDF/imagen) va como inline_data { mime_type, data }.
  const contexto = perfil ? `Contexto del dueño del panel: ${describirPerfil(perfil)}\n` : ''
  let partes
  if (tipoArchivo === 'calendario' || tipoArchivo === 'texto') {
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

const INSTRUCCION_TITULAR_EXCEL = `Eres el analista de datos de Empleia. Un motor de análisis YA ha leído por
completo una hoja de cálculo y ha calculado y validado todas sus cifras. Tu único trabajo es ponerle nombre y
describirla en el lenguaje del usuario.

NO calcules nada. NO inventes cifras. NO contradigas los datos que se te dan: las cifras que aparecen ya están
comprobadas contra el archivo original.

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "titulo": "nombre corto y descriptivo del contenido (máx. 6 palabras)",
  "categoria": "finanzas" | "personas" | "clientes" | "inventario" | "agenda" | "operaciones" | "otros",
  "resumen": "1 o 2 frases explicando qué contiene este archivo y qué destaca, usando las cifras que se te dan"
}`

/*
  Analiza una hoja de cálculo: el pipeline local hace TODO el trabajo de
  datos y el modelo solo aporta el título, la categoría y el resumen.

  Si no hay API key o Gemini falla, se devuelve igualmente el análisis local
  completo con textos generados a partir de las propias cifras: un Excel
  siempre produce un panel correcto, con o sin IA.
*/
async function analizarExcel(file, apiKey, perfil, opciones = {}) {
  const { resultado, pipeline } = await analizarExcelLocal(file, opciones)

  if (!apiKey) return resultado

  try {
    const contexto = perfil ? `Contexto del dueño del panel: ${describirPerfil(perfil)}\n` : ''
    const texto = await llamarGemini(apiKey, INSTRUCCION_TITULAR_EXCEL, [
      {
        text: `${contexto}Archivo: "${file.name}"\n\n${resumirParaModelo(pipeline)}`,
      },
    ])
    if (texto.titulo) resultado.titulo = String(texto.titulo)
    if (CATEGORIAS.includes(texto.categoria)) resultado.categoria = texto.categoria
    if (texto.resumen) resultado.resumen = String(texto.resumen)
  } catch {
    // El análisis local ya es válido: que falle la redacción no puede tumbar
    // un dashboard cuyas cifras están calculadas y validadas.
  }

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
  "sugerencias": [ "entre 2 y 4 acciones recomendadas, concretas y accionables, adaptadas al perfil" ],
  "secciones": [
    {
      "id": "identificador-corto-en-minusculas-sin-espacios",
      "titulo": "nombre del apartado, máx. 3 palabras",
      "icono": "un único emoji",
      "descripcion": "1 frase: qué enseña este apartado y para qué le sirve al usuario",
      "widgets": [ ...entre 1 y 4 bloques visuales, en el orden en que deben verse... ]
    }
  ]
}

Los "widgets" son los bloques visuales de cada sección. Tipos disponibles (elige el que mejor cuente cada dato):
- { "tipo": "tiles", "items": [ { "etiqueta": "...", "valor": "cifra con unidad", "detalle": "matiz corto (opcional)", "color": "verde" | "rojo" | "amarillo" | "acento" (opcional; verde=bien, rojo=alerta) } ] } → fila de cifras grandes (2-4 items)
- { "tipo": "barras", "titulo": "...", "unidad": "€ / uds / … (opcional)", "datos": [ { "etiqueta": "...", "valor": número } ] } → comparar magnitudes (3-8 barras)
- { "tipo": "linea", "titulo": "...", "unidad": "opcional", "datos": [ { "etiqueta": "periodo", "valor": número } ] } → evolución en el tiempo (4-12 puntos, en orden cronológico)
- { "tipo": "donut", "titulo": "...", "unidad": "opcional", "datos": [ { "etiqueta": "...", "valor": número } ] } → repartos de un total (2-5 partes)
- { "tipo": "tabla", "titulo": "...", "columnas": ["..."], "filas": [ ["celda", ...] ] } → ranking o detalle (máx. 8 filas y 4 columnas; elige tú las columnas útiles, no vuelques tablas enteras)
- { "tipo": "lista", "titulo": "...", "items": [ { "texto": "...", "detalle": "matiz corto (opcional)" } ] } → hitos, avisos o pasos (2-6 items)
- { "tipo": "texto", "titulo": "...", "texto": "1-3 frases" } → una observación que merece su propio bloque

Reglas:
- "kpis": entre 3 y 4 cifras que de verdad importen a ESTE usuario según su perfil (no recuentos triviales de filas).
  Calcula totales, pendientes, medias o próximos vencimientos a partir de los registros.
- "conexiones": entre 2 y 4. Busca relaciones reales: el mismo cliente en dos fuentes, gastos frente a ingresos,
  citas que chocan con disponibilidad del equipo, inventario que afecta a trabajos agendados… Si solo hay una
  fuente, cruza columnas dentro de ella (p. ej. estado de pago por cliente).
- "secciones": AQUÍ DISEÑAS TÚ EL DASHBOARD. Decide qué apartados necesita ESTE negocio (entre 2 y 4), en qué
  orden y qué visualización le va mejor a cada dato. No repitas el mismo esquema siempre: una peluquería no
  necesita los mismos apartados que un panel de pagos. Cada sección debe responder una pregunta concreta del
  usuario (¿cuánto me deben?, ¿qué se me echa encima?, ¿qué se está agotando?…), no describir un archivo.
  Calcula todos los valores a partir de los registros. En "barras" y "donut", "valor" es un número SIN unidad
  (la unidad va en su campo). No dupliques dentro de una sección lo que ya cuentan los KPIs de arriba.
- Las fuentes que traen sus cifras YA CALCULADAS Y VALIDADAS vienen marcadas como tales. Para esas: NO recalcules
  nada, NO corrijas sus cifras y NO les diseñes secciones (ya las tienen). Úsalas solo para escribir el titular,
  las conexiones y las sugerencias, copiando sus cifras tal cual. Diseña secciones únicamente para las fuentes
  que llegan con una muestra de registros (PDFs, imágenes, calendarios y textos).
- No inventes datos que no estén en las fuentes. Escribe en español, cercano y claro.`

// Convierte "valor" de un dato de gráfica en número (acepta "4.850 €" por si
// el modelo ignora la regla de devolverlo sin unidad)
function numeroDeDato(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null
  return parseImporte(v)
}

const TIPOS_WIDGET = ['tiles', 'barras', 'linea', 'donut', 'tabla', 'lista', 'texto']

// Sanea las secciones diseñadas por la IA para que el renderizador genérico
// nunca reviente: tipos desconocidos fuera, valores numéricos coercionados,
// longitudes acotadas e ids únicos.
export function validarSecciones(lista) {
  if (!Array.isArray(lista)) return []
  const vistos = new Set()
  const secciones = []
  for (const s of lista.slice(0, 6)) {
    if (!s || typeof s !== 'object') continue
    const titulo = String(s.titulo || '').trim()
    if (!titulo) continue
    let id =
      String(s.id || titulo)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || `seccion-${secciones.length + 1}`
    while (vistos.has(id)) id += '-2'
    vistos.add(id)

    const widgets = []
    for (const w of (Array.isArray(s.widgets) ? s.widgets : []).slice(0, 6)) {
      if (!w || !TIPOS_WIDGET.includes(w.tipo)) continue
      if (w.tipo === 'tiles') {
        const items = (Array.isArray(w.items) ? w.items : [])
          .filter((t) => t && t.etiqueta && t.valor !== undefined)
          .slice(0, 4)
          .map((t) => ({
            etiqueta: String(t.etiqueta),
            valor: String(t.valor),
            detalle: t.detalle ? String(t.detalle) : null,
            color: ['verde', 'rojo', 'amarillo', 'acento'].includes(t.color) ? t.color : null,
          }))
        if (items.length) widgets.push({ tipo: 'tiles', items })
      } else if (w.tipo === 'barras' || w.tipo === 'linea' || w.tipo === 'donut') {
        const datos = (Array.isArray(w.datos) ? w.datos : [])
          .map((d) => d && { etiqueta: String(d.etiqueta ?? '—'), valor: numeroDeDato(d.valor) })
          .filter((d) => d && d.valor != null && d.valor >= 0)
          .slice(0, w.tipo === 'donut' ? 6 : 10)
        if (datos.length >= 2)
          widgets.push({
            tipo: w.tipo,
            titulo: String(w.titulo || ''),
            unidad: w.unidad ? String(w.unidad) : null,
            datos,
          })
      } else if (w.tipo === 'tabla') {
        const columnas = (Array.isArray(w.columnas) ? w.columnas : []).slice(0, 4).map(String)
        const filas = (Array.isArray(w.filas) ? w.filas : [])
          .filter(Array.isArray)
          .slice(0, 8)
          .map((fila) => fila.slice(0, columnas.length).map((c) => String(c ?? '')))
        if (columnas.length && filas.length)
          widgets.push({ tipo: 'tabla', titulo: String(w.titulo || ''), columnas, filas })
      } else if (w.tipo === 'lista') {
        const items = (Array.isArray(w.items) ? w.items : [])
          .map((it) =>
            typeof it === 'string'
              ? { texto: it, detalle: null }
              : it && it.texto
                ? { texto: String(it.texto), detalle: it.detalle ? String(it.detalle) : null }
                : null
          )
          .filter(Boolean)
          .slice(0, 8)
        if (items.length) widgets.push({ tipo: 'lista', titulo: String(w.titulo || ''), items })
      } else if (w.tipo === 'texto') {
        const texto = String(w.texto || '').trim()
        if (texto) widgets.push({ tipo: 'texto', titulo: String(w.titulo || ''), texto })
      }
    }

    if (widgets.length === 0) continue
    secciones.push({
      id,
      titulo: titulo.slice(0, 40),
      icono: typeof s.icono === 'string' ? s.icono.slice(0, 4) : '✨',
      descripcion: String(s.descripcion || ''),
      widgets,
    })
  }
  return secciones
}

/*
  Análisis inteligente conjunto del panel: cruza TODAS las fuentes con el
  perfil del usuario y devuelve tipo de dashboard, KPIs personalizados,
  conexiones entre fuentes, titular, sugerencias y las SECCIONES del
  dashboard diseñadas por la IA (apartados con sus widgets).
*/
export async function analizarPanelCompleto(fuentes, perfil, apiKey) {
  // Apartados que ya ha construido el pipeline local con datos reales. No
  // pasan por validarSecciones: vienen validados por validacion.js, con sus
  // cifras contrastadas contra el archivo original.
  const seccionesLocales = seccionesDeFuentesLocales(fuentes)

  const cuerpo = fuentes
    .map((f, i) => {
      const r = f.resultado
      const cabecera = `Fuente ${i + 1} — "${r.titulo}" (categoría: ${r.categoria}, ${r.totalRegistros ?? (r.registros || []).length} registros en total)`

      // Hoja de cálculo analizada en local: se le dan las conclusiones, no
      // los datos. El prompt no crece aunque el Excel tenga 100.000 filas.
      if (r.analisis) {
        return `${cabecera}
Resumen: ${r.resumen}
${resumirConfiguracion(r.analisis)}
Esta fuente YA tiene sus apartados construidos y sus cifras validadas: no diseñes secciones para ella.`
      }

      const registros = (r.registros || []).slice(0, 25)
      return `${cabecera}
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
  // Delante los apartados calculados en local (cifras contrastadas), detrás
  // los que haya diseñado el modelo para las fuentes que no son hojas de
  // cálculo (PDFs, imágenes, calendarios).
  resultado.secciones = [...seccionesLocales, ...validarSecciones(resultado.secciones)]

  // Los KPIs de cabecera se prefieren calculados: si alguna fuente trae
  // cifras validadas, mandan sobre las que redacte el modelo.
  const kpisLocales = fuentes.flatMap((f) => f.resultado?.analisis?.kpis || [])
  if (kpisLocales.length) {
    resultado.kpis = kpisLocales.slice(0, 4).map((k) => ({
      etiqueta: k.etiqueta,
      valor: k.valorFormateado,
      detalle: k.detalle || null,
      procedencia: k.procedencia,
    }))
  }

  return resultado
}

/*
  Recoge los apartados que el pipeline local ha construido para cada hoja de
  cálculo. Con varias fuentes se prefijan los identificadores y se añade el
  nombre del archivo al título, para que no se pisen entre ellas.
*/
function seccionesDeFuentesLocales(fuentes) {
  const conAnalisis = fuentes.filter((f) => f.resultado?.analisis?.secciones?.length)
  const varias = conAnalisis.length > 1

  return conAnalisis.flatMap((f) =>
    f.resultado.analisis.secciones.map((s) => ({
      ...s,
      id: `${f.id}-${s.id}`,
      titulo: varias ? `${s.titulo} · ${f.resultado.titulo}` : s.titulo,
      origen: 'local',
      fuenteId: f.id,
    }))
  )
}
