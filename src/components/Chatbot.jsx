import { useEffect, useRef, useState } from 'react'
import { enviarMensajeChat, describirAccion } from '../lib/chatbot'
import { IconoChispa, IconoCerrar } from './Iconos'
import './Chatbot.css'

/*
  Chatbot flotante del panel. Responde preguntas sobre los datos y aplica
  cambios (tema, nombres, métricas, registros…) devolviendo acciones que la
  app ejecuta con onAcciones(acciones).
*/
export default function Chatbot({ panel, apiKey, onAcciones, onPedirApiKey }) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([
    {
      de: 'bot',
      texto:
        '¡Hola! Soy el asistente de tu panel. Pregúntame por tus datos ("¿cuántos proveedores nuevos han llegado esta semana?") o pídeme cambios ("pon el tema claro", "renombra el panel a Peluquería Sol").',
    },
  ])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const finRef = useRef(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, pensando, abierto])

  async function enviar(e) {
    e.preventDefault()
    const mensaje = texto.trim()
    if (!mensaje || pensando) return
    if (!apiKey) {
      onPedirApiKey()
      return
    }

    const historial = mensajes.filter((m) => !m.error)
    setMensajes((prev) => [...prev, { de: 'usuario', texto: mensaje }])
    setTexto('')
    setPensando(true)
    try {
      const { respuesta, acciones } = await enviarMensajeChat(historial, mensaje, panel, apiKey)
      if (acciones.length > 0) onAcciones(acciones)
      setMensajes((prev) => [...prev, { de: 'bot', texto: respuesta, acciones }])
    } catch (error) {
      setMensajes((prev) => [
        ...prev,
        { de: 'bot', texto: `No he podido responder: ${error.message}`, error: true },
      ])
    } finally {
      setPensando(false)
    }
  }

  return (
    <>
      {!abierto && (
        <button
          className="chatbot-burbuja"
          type="button"
          onClick={() => setAbierto(true)}
          title="Abrir el asistente del panel"
        >
          <IconoChispa tam={17} /> Asistente
        </button>
      )}

      {abierto && (
        <div className="chatbot">
          <div className="chatbot-cabecera">
            <span className="chatbot-cabecera-icono">
              <IconoChispa tam={15} />
            </span>
            <div className="chatbot-cabecera-texto">
              <strong>Asistente del panel</strong>
              <span>{apiKey ? 'Con tu API key de Gemini' : 'Falta la API key'}</span>
            </div>
            <button
              className="chatbot-cerrar"
              type="button"
              onClick={() => setAbierto(false)}
              title="Cerrar"
            >
              <IconoCerrar tam={15} />
            </button>
          </div>

          <div className="chatbot-mensajes">
            {mensajes.map((m, i) => (
              <div key={i} className={`chatbot-mensaje ${m.de} ${m.error ? 'error' : ''}`}>
                <p>{m.texto}</p>
                {m.acciones?.length > 0 && (
                  <div className="chatbot-acciones">
                    {m.acciones.map((a, j) => (
                      <span key={j} className="chatbot-accion">
                        ✓ {describirAccion(a)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pensando && (
              <div className="chatbot-mensaje bot">
                <p className="chatbot-pensando">
                  <span />
                  <span />
                  <span />
                </p>
              </div>
            )}
            <div ref={finRef} />
          </div>

          <form className="chatbot-entrada" onSubmit={enviar}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pregunta o pide un cambio…"
              disabled={pensando}
            />
            <button className="boton-primario" type="submit" disabled={pensando || !texto.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </>
  )
}
