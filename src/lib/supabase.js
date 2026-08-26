import { createClient } from '@supabase/supabase-js'

/*
  Capa de cuentas y guardado en la nube (Supabase).

  - Autenticación con email + contraseña (crear cuenta / iniciar sesión).
  - Tabla "paneles": cada usuario guarda sus dashboards como JSON, de modo
    que al iniciar sesión en otro dispositivo recupera exactamente lo mismo.

  El esquema SQL con sus políticas RLS está en supabase/schema.sql.
  Si las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no están
  configuradas, la app sigue funcionando en "modo local" (localStorage).
*/

function normalizarUrl(cruda) {
  let url = (cruda || '').trim().replace(/^["']|["']$/g, '')
  if (!url) return ''
  if (!/^https?:\/\//.test(url)) url = `https://${url}`
  // Nos quedamos solo con el origen: si el usuario pega la URL con una ruta
  // (p. ej. https://xxx.supabase.co/rest/v1/), el SDK duplicaría rutas y la
  // API respondería "Invalid path specified in request URL".
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

const URL_SUPABASE = normalizarUrl(import.meta.env.VITE_SUPABASE_URL)
const KEY_SUPABASE = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const supabaseDisponible = Boolean(URL_SUPABASE && KEY_SUPABASE)

export const supabase = supabaseDisponible ? createClient(URL_SUPABASE, KEY_SUPABASE) : null

/* ---------- Autenticación ---------- */

export async function registrarse(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(traducirErrorAuth(error.message))
  return data
}

export async function iniciarSesion(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(traducirErrorAuth(error.message))
  return data
}

// Por si el primer correo de confirmación se pierde (spam, límite de envíos…)
export async function reenviarConfirmacion(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw new Error(traducirErrorAuth(error.message))
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
}

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

// Suscripción a cambios de sesión (login, logout, refresco de token)
export function alCambiarSesion(callback) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => callback(sesion))
  return () => data.subscription.unsubscribe()
}

// Mensajes de error de Supabase traducidos a algo legible en español
function traducirErrorAuth(mensaje) {
  const m = (mensaje || '').toLowerCase()
  // "Load failed" (Safari) / "Failed to fetch" (Chrome): el navegador no pudo
  // conectar con el proyecto de Supabase (URL mal escrita o proyecto pausado)
  if (m.includes('load failed') || m.includes('failed to fetch') || m.includes('networkerror'))
    return 'No se pudo conectar con Supabase. Comprueba que tu proyecto no esté pausado (en supabase.com) y que VITE_SUPABASE_URL sea exactamente la URL del proyecto.'
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (m.includes('already registered')) return 'Ese email ya tiene una cuenta. Inicia sesión.'
  if (m.includes('password should be at least'))
    return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('valid email')) return 'Escribe un email válido.'
  if (m.includes('email not confirmed'))
    return 'Confirma tu email desde el enlace que te hemos enviado y vuelve a intentarlo.'
  if (m.includes('rate limit'))
    return 'Demasiados correos seguidos. Supabase limita los envíos de prueba: espera unos minutos antes de reenviar.'
  return mensaje || 'Error de autenticación.'
}

/* ---------- Paneles guardados en la nube ---------- */

/*
  Cada fila de "paneles" es un dashboard del usuario:
  { id, user_id, nombre, datos: { fuentes, resumen, tipoPanel, tema }, actualizado }
*/

export async function listarPaneles() {
  const { data, error } = await supabase
    .from('paneles')
    .select('id, nombre, actualizado')
    .order('actualizado', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar tus paneles: ${error.message}`)
  return data || []
}

export async function cargarPanel(id) {
  const { data, error } = await supabase
    .from('paneles')
    .select('id, nombre, datos')
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se pudo cargar el panel: ${error.message}`)
  return data
}

export async function crearPanel(nombre, datos = {}) {
  const { data: sesion } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('paneles')
    .insert({ nombre, datos, user_id: sesion?.user?.id })
    .select('id, nombre, datos')
    .single()
  if (error) throw new Error(`No se pudo crear el panel: ${error.message}`)
  return data
}

export async function guardarPanel(id, nombre, datos) {
  const { error } = await supabase
    .from('paneles')
    .update({ nombre, datos, actualizado: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`No se pudo guardar el panel: ${error.message}`)
}

export async function borrarPanel(id) {
  const { error } = await supabase.from('paneles').delete().eq('id', id)
  if (error) throw new Error(`No se pudo borrar el panel: ${error.message}`)
}
