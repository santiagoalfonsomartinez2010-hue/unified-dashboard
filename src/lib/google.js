/*
  Conexión oficial con Google (Gmail, Google Calendar y Google Sheets).

  Usa Google Identity Services (OAuth 2.0 en el navegador): el usuario pulsa
  "Conectar", aparece la ventana oficial de Google, elige su cuenta y concede
  permisos de SOLO LECTURA. El token de acceso vive en sessionStorage (~1 h);
  al caducar, se vuelve a pedir con un clic.

  Requiere VITE_GOOGLE_CLIENT_ID (OAuth Client ID de tipo "Web application"
  creado en console.cloud.google.com, con el dominio de la app en "Authorized
  JavaScript origins" y las APIs de Gmail, Calendar, Sheets y Drive activadas).
*/

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

export const googleDisponible = Boolean(CLIENT_ID)

// Permisos de solo lectura: correos, calendario, hojas de cálculo y listado
// de archivos (para encontrar las hojas de cálculo del usuario).
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
].join(' ')

const CLAVE_TOKEN = 'empleia.panel.google_token'

/* ---------- Carga del script oficial y OAuth ---------- */

let promesaGis = null

function cargarGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (promesaGis) return promesaGis
  promesaGis = new Promise((resolver, rechazar) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolver()
    script.onerror = () => rechazar(new Error('No se pudo cargar el script de Google.'))
    document.head.appendChild(script)
  })
  return promesaGis
}

function leerTokenGuardado() {
  try {
    const crudo = sessionStorage.getItem(CLAVE_TOKEN)
    if (!crudo) return null
    const { token, caduca } = JSON.parse(crudo)
    // Margen de 2 minutos para no usar un token a punto de caducar
    if (Date.now() > caduca - 2 * 60 * 1000) return null
    return token
  } catch {
    return null
  }
}

export function tokenGoogle() {
  return leerTokenGuardado()
}

export function hayConexionGoogle() {
  return Boolean(leerTokenGuardado())
}

/*
  Abre la ventana oficial de Google y devuelve un token de acceso.
  Si ya hay un token válido guardado, lo reutiliza sin abrir nada.
*/
export async function conectarGoogle() {
  if (!CLIENT_ID) {
    throw new Error(
      'Falta VITE_GOOGLE_CLIENT_ID. Crea un OAuth Client ID en console.cloud.google.com y añádelo a las variables de entorno.'
    )
  }
  const guardado = leerTokenGuardado()
  if (guardado) return guardado

  await cargarGis()
  return new Promise((resolver, rechazar) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (respuesta) => {
        if (respuesta.error) {
          rechazar(new Error(`Google denegó la conexión: ${respuesta.error}`))
          return
        }
        try {
          sessionStorage.setItem(
            CLAVE_TOKEN,
            JSON.stringify({
              token: respuesta.access_token,
              caduca: Date.now() + Number(respuesta.expires_in || 3600) * 1000,
            })
          )
        } catch {
          // sin sessionStorage el token vive solo en esta promesa
        }
        resolver(respuesta.access_token)
      },
      error_callback: (err) => {
        rechazar(
          new Error(
            err?.type === 'popup_closed'
              ? 'Has cerrado la ventana de Google sin terminar.'
              : 'No se pudo abrir la ventana de Google.'
          )
        )
      },
    })
    cliente.requestAccessToken()
  })
}

export function desconectarGoogle() {
  const token = leerTokenGuardado()
  try {
    sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    // nada
  }
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {})
  }
}

/* ---------- Peticiones a las APIs de Google ---------- */

async function peticionGoogle(token, url) {
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (respuesta.status === 401) {
    try {
      sessionStorage.removeItem(CLAVE_TOKEN)
    } catch {
      // nada
    }
    throw new Error('La conexión con Google ha caducado. Vuelve a conectar tu cuenta.')
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text()
    throw new Error(`Error de la API de Google (${respuesta.status}): ${detalle.slice(0, 300)}`)
  }
  return respuesta.json()
}

/*
  Gmail: lee los correos de los últimos 30 días (máx. 25) y devuelve un texto
  con remitente, asunto, fecha y el extracto de cada uno, listo para que la IA
  lo normalice como una fuente más del panel.
*/
export async function leerCorreosGmail(token) {
  const lista = await peticionGoogle(
    token,
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=newer_than:30d%20-category:promotions%20-category:social'
  )
  const mensajes = lista.messages || []
  if (mensajes.length === 0) return 'No hay correos en los últimos 30 días.'

  const detalles = []
  // En serie de 5 en 5 para no saturar la API
  for (let i = 0; i < mensajes.length; i += 5) {
    const grupo = mensajes.slice(i, i + 5)
    const resultados = await Promise.all(
      grupo.map((m) =>
        peticionGoogle(
          token,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    )
    detalles.push(...resultados)
  }

  const lineas = detalles.map((d) => {
    const cabeceras = {}
    for (const h of d.payload?.headers || []) cabeceras[h.name.toLowerCase()] = h.value
    const fecha = cabeceras.date ? new Date(cabeceras.date).toISOString().slice(0, 10) : ''
    return `- [${fecha}] De: ${cabeceras.from || '¿?'} | Asunto: ${cabeceras.subject || '(sin asunto)'} | Extracto: ${d.snippet || ''}`
  })
  return `Correos de Gmail de los últimos 30 días (${lineas.length}):\n${lineas.join('\n')}`
}

/*
  Google Calendar: eventos del calendario principal desde hace 30 días hasta
  dentro de 120, como texto normalizable.
*/
export async function leerEventosCalendar(token) {
  const ahora = Date.now()
  const timeMin = new Date(ahora - 30 * 86400000).toISOString()
  const timeMax = new Date(ahora + 120 * 86400000).toISOString()
  const datos = await peticionGoogle(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`
  )
  const eventos = datos.items || []
  if (eventos.length === 0) return 'No hay eventos entre hace 30 días y dentro de 120.'

  const lineas = eventos.map((e) => {
    const fecha = e.start?.date || (e.start?.dateTime || '').slice(0, 10)
    const hora = e.start?.dateTime ? ` ${e.start.dateTime.slice(11, 16)}` : ''
    return `- [${fecha}${hora}] ${e.summary || '(sin título)'}${e.location ? ` @ ${e.location}` : ''}`
  })
  return `Eventos de Google Calendar (${lineas.length}):\n${lineas.join('\n')}`
}

/*
  Google Sheets: lista las hojas de cálculo del usuario (las 10 modificadas
  más recientemente) para que elija cuál conectar.
*/
export async function listarHojasCalculo(token) {
  const datos = await peticionGoogle(
    token,
    "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&orderBy=modifiedTime%20desc&pageSize=10&fields=files(id,name,modifiedTime)"
  )
  return datos.files || []
}

/*
  Lee el contenido de una hoja de cálculo (primera pestaña, hasta 80 filas x
  12 columnas) y lo devuelve como texto tabulado.
*/
export async function leerHojaCalculo(token, spreadsheetId) {
  const meta = await peticionGoogle(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties.title`
  )
  const titulo = meta.properties?.title || 'Hoja de cálculo'
  const pestana = meta.sheets?.[0]?.properties?.title || 'Hoja 1'
  const valores = await peticionGoogle(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${pestana}!A1:L80`)}`
  )
  const filas = valores.values || []
  const texto = filas.map((fila) => fila.join(' | ')).join('\n')
  return {
    titulo,
    texto: `Hoja de cálculo "${titulo}" (pestaña "${pestana}", ${filas.length} filas):\n${texto || '(vacía)'}`,
  }
}
