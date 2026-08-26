import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
  Sello de compilación. Sirve para saber, mirando la app desplegada, EXACTAMENTE
  qué commit se está sirviendo: al darle a "Redeploy" en Vercel se puede
  comprobar si de verdad ha entrado el código nuevo o se está viendo una copia
  antigua en caché.

  En Vercel las variables VERCEL_GIT_* las inyecta la propia plataforma durante
  el build. En local no existen, así que se pregunta a git.
*/
function ordenGit(orden) {
  try {
    return execSync(orden, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function selloDeBuild() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || ordenGit('git rev-parse HEAD')
  const rama = process.env.VERCEL_GIT_COMMIT_REF || ordenGit('git rev-parse --abbrev-ref HEAD')
  return {
    // 7 caracteres: los mismos que enseña GitHub y el panel de Vercel
    sha: sha ? sha.slice(0, 7) : 'local',
    rama: rama || 'local',
    // Fecha del build, no de la visita: si no cambia tras un redeploy, el
    // navegador está sirviendo el HTML viejo desde caché.
    fecha: new Date().toISOString(),
    entorno: process.env.VERCEL_ENV || 'local',
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __SELLO_BUILD__: JSON.stringify(selloDeBuild()),
  },
  server: {
    port: 5173,
    host: true,
  },
})
