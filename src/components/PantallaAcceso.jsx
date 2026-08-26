import { useState } from 'react'
import { registrarse, iniciarSesion, reenviarConfirmacion, supabaseDisponible } from '../lib/supabase'
import { IconoChispa } from './Iconos'
import './PantallaAcceso.css'

/*
  Pantalla de acceso obligatoria: antes de crear cualquier dashboard hay que
  crear una cuenta o iniciar sesión, para que los paneles se guarden en la
  nube y se puedan abrir desde cualquier dispositivo.

  Si Supabase no está configurado (faltan las variables de entorno), se
  explica y se ofrece continuar en modo local (los datos se quedan solo en
  este navegador).
*/
export default function PantallaAcceso({ onModoLocal, onVolver, modoInicial = 'entrar' }) {
  const [modo, setModo] = useState(modoInicial) // 'entrar' | 'registro'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [avisoRegistro, setAvisoRegistro] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [reenviado, setReenviado] = useState(false)

  async function reenviar() {
    setError(null)
    setReenviando(true)
    try {
      await reenviarConfirmacion(email.trim())
      setReenviado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setReenviando(false)
    }
  }

  async function enviar(e) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      if (modo === 'registro') {
        const { session } = await registrarse(email.trim(), password)
        // Si el proyecto exige confirmar el email, no hay sesión todavía
        if (!session) setAvisoRegistro(true)
      } else {
        await iniciarSesion(email.trim(), password)
      }
      // Al haber sesión, el listener de App cambia de pantalla solo
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="acceso">
      <div className="acceso-tarjeta">
        {onVolver && (
          <button className="acceso-volver" type="button" onClick={onVolver}>
            ← Volver
          </button>
        )}
        <div className="acceso-logo">
          <span className="acceso-logo-cuadro">E</span>
          <div>
            <strong>Empleia</strong>
            <span>Panel Unificado</span>
          </div>
        </div>

        {!supabaseDisponible ? (
          <>
            <h1>Falta configurar las cuentas</h1>
            <p className="acceso-texto">
              Para crear cuenta e iniciar sesión hay que configurar Supabase: añade{' '}
              <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> a las variables
              de entorno y ejecuta <code>supabase/schema.sql</code> en tu proyecto. Mientras
              tanto puedes probar la app en modo local (los datos se quedan en este navegador).
            </p>
            <button className="boton-primario acceso-boton" type="button" onClick={onModoLocal}>
              <IconoChispa tam={16} /> Continuar en modo local
            </button>
          </>
        ) : avisoRegistro ? (
          <>
            <h1>Revisa tu correo</h1>
            <p className="acceso-texto">
              Te hemos enviado un enlace a <strong>{email}</strong> para confirmar tu cuenta.
              Ábrelo y después inicia sesión aquí.
            </p>
            <p className="acceso-texto acceso-texto-tenue">
              Si no te llega, mira en spam/promociones — o pide que se envíe otra vez.
            </p>

            {error && <p className="acceso-error">{error}</p>}
            {reenviado && !error && (
              <p className="acceso-aviso">Correo reenviado. Puede tardar unos minutos.</p>
            )}

            <button
              className="boton-secundario acceso-boton"
              type="button"
              onClick={reenviar}
              disabled={reenviando}
            >
              {reenviando ? 'Enviando…' : 'Reenviar correo de confirmación'}
            </button>
            <button
              className="boton-secundario acceso-boton"
              type="button"
              onClick={() => {
                setAvisoRegistro(false)
                setModo('entrar')
              }}
            >
              Volver a iniciar sesión
            </button>
          </>
        ) : (
          <>
            <h1>{modo === 'registro' ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
            <p className="acceso-texto">
              Tus dashboards se guardan en tu cuenta: entra desde cualquier dispositivo y los
              tendrás siempre contigo.
            </p>

            <div className="acceso-pestanas">
              <button
                type="button"
                className={modo === 'entrar' ? 'activa' : ''}
                onClick={() => {
                  setModo('entrar')
                  setError(null)
                }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={modo === 'registro' ? 'activa' : ''}
                onClick={() => {
                  setModo('registro')
                  setError(null)
                }}
              >
                Crear cuenta
              </button>
            </div>

            <form onSubmit={enviar}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={modo === 'registro' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                  autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                />
              </label>

              {error && <p className="acceso-error">{error}</p>}

              <button
                className="boton-primario acceso-boton"
                type="submit"
                disabled={cargando || !email.trim() || password.length < 6}
              >
                {cargando
                  ? 'Un momento…'
                  : modo === 'registro'
                    ? 'Crear cuenta'
                    : 'Entrar'}
              </button>
            </form>
          </>
        )}
      </div>

      <p className="acceso-pie">
        Sube Excels, PDFs, imágenes y calendarios, y la IA lo organiza todo en un solo
        dashboard.
      </p>
    </div>
  )
}
