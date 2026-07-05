/*
  Persistencia local de la demo. Sin backend ni base de datos: todo se guarda
  en el localStorage del navegador, de modo que el panel sobrevive a recargas
  pero se puede vaciar con un clic.
*/

const CLAVE_FUENTES = 'empleia.panel.fuentes'
const CLAVE_RESUMEN = 'empleia.panel.resumen'
const CLAVE_API_KEY = 'empleia.panel.gemini_key'
const CLAVE_EXTRAS = 'empleia.panel.extras'

function leer(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? JSON.parse(crudo) : porDefecto
  } catch {
    return porDefecto
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // localStorage lleno o bloqueado: la demo sigue funcionando en memoria
  }
}

export function cargarFuentes() {
  // Las fuentes que se quedaron "procesando" al cerrar la pestaña se descartan
  return leer(CLAVE_FUENTES, []).filter((f) => f.estado !== 'procesando')
}

export function guardarFuentes(fuentes) {
  escribir(CLAVE_FUENTES, fuentes)
}

// La API key de Gemini se puede fijar por .env (VITE_GEMINI_API_KEY) o desde
// la interfaz (se guarda en localStorage). La del .env tiene prioridad.
export function cargarApiKey() {
  const deEnv = (import.meta.env.VITE_GEMINI_API_KEY || '').trim()
  if (deEnv) return deEnv
  try {
    return localStorage.getItem(CLAVE_API_KEY) || ''
  } catch {
    return ''
  }
}

export function guardarApiKey(key) {
  try {
    if (key) localStorage.setItem(CLAVE_API_KEY, key)
    else localStorage.removeItem(CLAVE_API_KEY)
  } catch {
    // sin persistencia; la key vivirá solo en memoria durante la sesión
  }
}

// Extras del panel en modo local: { nombrePanel, tipoPanel, tema }
export function cargarExtras() {
  return leer(CLAVE_EXTRAS, null)
}

export function guardarExtras(extras) {
  escribir(CLAVE_EXTRAS, extras)
}

export function vaciarTodo() {
  try {
    localStorage.removeItem(CLAVE_FUENTES)
    localStorage.removeItem(CLAVE_RESUMEN)
    localStorage.removeItem(CLAVE_EXTRAS)
  } catch {
    // nada que limpiar
  }
}
