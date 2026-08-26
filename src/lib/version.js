/*
  Qué versión de la app se está ejecutando. El objeto lo inyecta Vite en el
  momento de compilar (ver vite.config.js), así que viaja dentro del bundle:
  si lo que ves en pantalla no coincide con el último commit, el despliegue no
  ha entrado todavía o el navegador está sirviendo una copia guardada.
*/

const SELLO = typeof __SELLO_BUILD__ !== 'undefined'
  ? __SELLO_BUILD__
  : { sha: 'dev', rama: 'dev', fecha: '', entorno: 'dev' }

export const sello = SELLO

// Etiqueta corta para la barra lateral: "a1b2c3d · 14:32"
export function etiquetaVersion() {
  const hora = SELLO.fecha
    ? new Date(SELLO.fecha).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  return hora ? `${SELLO.sha} · ${hora}` : SELLO.sha
}

// Detalle completo, para el tooltip
export function detalleVersion() {
  const partes = [`Commit: ${SELLO.sha}`, `Rama: ${SELLO.rama}`, `Entorno: ${SELLO.entorno}`]
  if (SELLO.fecha) {
    partes.push(`Compilado: ${new Date(SELLO.fecha).toLocaleString('es-ES')}`)
  }
  return partes.join('\n')
}
