import { useEffect, useState } from 'react'
import {
  googleDisponible,
  hayConexionGoogle,
  conectarGoogle,
  desconectarGoogle,
  listarHojasCalculo,
  tokenGoogle,
} from '../lib/google'
import { IconoCerrar, IconoCorreo, IconoCalendario, IconoTabla, IconoGoogle } from './Iconos'
import './ConexionesGoogle.css'

/*
  Modal de conexión oficial con Google: el usuario conecta su cuenta (ventana
  OAuth oficial, permisos de solo lectura) y desde aquí importa sus correos de
  Gmail, sus eventos de Google Calendar y sus hojas de Google Sheets como
  fuentes del panel. Las fuentes importadas se pueden re-sincronizar para que
  el dashboard se mantenga al día.
*/
export default function ConexionesGoogle({ fuentes, onImportar, onCerrar }) {
  const [conectado, setConectado] = useState(hayConexionGoogle())
  const [conectando, setConectando] = useState(false)
  const [hojas, setHojas] = useState(null)
  const [error, setError] = useState(null)

  // Ids de fuentes Google ya importadas, para marcarlas como conectadas
  const importadas = new Set(fuentes.filter((f) => f.origen === 'google').map((f) => f.id))

  useEffect(() => {
    if (conectado && hojas === null) {
      listarHojasCalculo(tokenGoogle())
        .then(setHojas)
        .catch((err) => setError(err.message))
    }
  }, [conectado, hojas])

  async function conectar() {
    setError(null)
    setConectando(true)
    try {
      await conectarGoogle()
      setConectado(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setConectando(false)
    }
  }

  function desconectar() {
    desconectarGoogle()
    setConectado(false)
    setHojas(null)
  }

  function importar(referencia) {
    onImportar(referencia)
    onCerrar()
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal conexiones" onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrar" type="button" onClick={onCerrar} title="Cerrar">
          <IconoCerrar tam={16} />
        </button>

        <span className="modal-icono conexiones-icono">
          <IconoGoogle tam={20} />
        </span>
        <h2>Conecta tu cuenta de Google</h2>
        <p>
          Conexión oficial y de solo lectura con Gmail, Google Calendar y Google Sheets. Tus
          datos se importan como fuentes del panel y puedes re-sincronizarlos cuando quieras
          para tenerlos al día.
        </p>

        {!googleDisponible ? (
          <p className="conexiones-aviso">
            Falta configurar <code>VITE_GOOGLE_CLIENT_ID</code>. Crea un OAuth Client ID (tipo
            "Web application") en console.cloud.google.com, activa las APIs de Gmail, Calendar,
            Sheets y Drive, y añade el dominio de esta app a los orígenes autorizados.
          </p>
        ) : !conectado ? (
          <button
            className="boton-primario conexiones-conectar"
            type="button"
            onClick={conectar}
            disabled={conectando}
          >
            <IconoGoogle tam={16} />
            {conectando ? 'Abriendo la ventana de Google…' : 'Conectar con Google'}
          </button>
        ) : (
          <>
            <div className="conexiones-lista">
              <button
                className="conexiones-item"
                type="button"
                onClick={() => importar({ tipo: 'gmail' })}
              >
                <span className="conexiones-item-icono gmail">
                  <IconoCorreo tam={17} />
                </span>
                <span className="conexiones-item-texto">
                  <strong>Gmail</strong>
                  <span>Correos de los últimos 30 días</span>
                </span>
                <span className="conexiones-item-estado">
                  {importadas.has('google-gmail') ? 'Actualizar' : 'Importar'}
                </span>
              </button>

              <button
                className="conexiones-item"
                type="button"
                onClick={() => importar({ tipo: 'calendar' })}
              >
                <span className="conexiones-item-icono calendar">
                  <IconoCalendario tam={17} />
                </span>
                <span className="conexiones-item-texto">
                  <strong>Google Calendar</strong>
                  <span>Eventos pasados y próximos del calendario principal</span>
                </span>
                <span className="conexiones-item-estado">
                  {importadas.has('google-calendar') ? 'Actualizar' : 'Importar'}
                </span>
              </button>

              <div className="conexiones-hojas">
                <div className="conexiones-hojas-titulo">
                  <span className="conexiones-item-icono sheets">
                    <IconoTabla tam={17} />
                  </span>
                  <strong>Google Sheets</strong>
                </div>
                {hojas === null && !error && (
                  <p className="conexiones-hojas-cargando">Buscando tus hojas de cálculo…</p>
                )}
                {hojas?.length === 0 && (
                  <p className="conexiones-hojas-cargando">
                    No se han encontrado hojas de cálculo en tu Drive.
                  </p>
                )}
                {(hojas || []).map((h) => (
                  <button
                    key={h.id}
                    className="conexiones-hoja"
                    type="button"
                    onClick={() => importar({ tipo: 'sheet', spreadsheetId: h.id, nombre: h.name })}
                  >
                    <span className="conexiones-hoja-nombre">{h.name}</span>
                    <span className="conexiones-item-estado">
                      {importadas.has(`google-sheet-${h.id}`) ? 'Actualizar' : 'Importar'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button className="conexiones-desconectar" type="button" onClick={desconectar}>
              Desconectar la cuenta de Google
            </button>
          </>
        )}

        {error && <p className="conexiones-error">{error}</p>}
      </div>
    </div>
  )
}
