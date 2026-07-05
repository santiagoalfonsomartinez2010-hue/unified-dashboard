import { useState } from 'react'
import { IconoLlave, IconoCerrar, IconoChispa } from './Iconos'
import './ModalApiKey.css'

/*
  Modal para introducir la API key de Gemini (se guarda en localStorage).
  Ofrece la alternativa de cargar los datos de ejemplo para ver la demo
  sin ninguna key.
*/
export default function ModalApiKey({ onGuardar, onCerrar, onEjemplo }) {
  const [valor, setValor] = useState('')

  function enviar(e) {
    e.preventDefault()
    const key = valor.trim()
    if (key) onGuardar(key)
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrar" type="button" onClick={onCerrar} title="Cerrar">
          <IconoCerrar tam={16} />
        </button>

        <span className="modal-icono">
          <IconoLlave tam={20} />
        </span>
        <h2>Conecta la IA (Gemini)</h2>
        <p>
          Para analizar tus archivos hace falta una API key de Google Gemini. Es gratuita: se
          crea en un minuto en{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          . Se guarda solo en tu navegador.
        </p>

        <form onSubmit={enviar}>
          <input
            type="password"
            placeholder="Pega aquí tu API key (AIza…)"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoFocus
          />
          <button className="boton-primario" type="submit" disabled={!valor.trim()}>
            Guardar y continuar
          </button>
        </form>

        {onEjemplo && (
          <button className="modal-ejemplo" type="button" onClick={onEjemplo}>
            <IconoChispa tam={14} /> O mira la demo con datos de ejemplo (sin key)
          </button>
        )}
      </div>
    </div>
  )
}
