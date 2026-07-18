import { IconoCerrar, IconoPaleta } from './Iconos'
import './Edicion.css'

/*
  Modal "Personalizar": edición manual de la apariencia y la identidad del
  panel. Todo se aplica al instante (y se guarda solo): nombre, emoji,
  modo claro/oscuro y color de acento (paleta o selector libre).
*/

const ACENTOS = [
  '#6366f1', // índigo (por defecto)
  '#2563eb', // azul
  '#16a34a', // verde
  '#0891b2', // cian
  '#d97706', // ámbar
  '#db2777', // rosa
  '#dc2626', // rojo
  '#7c3aed', // violeta
]

const EMOJIS = ['📊', '💈', '🏋️', '🔧', '🍽️', '🛒', '💶', '📚', '🏠', '🐾', '🚗', '🌱']

export default function ModalPersonalizar({ nombre, tema, onNombre, onTema, onCerrar }) {
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal personalizar" onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrar" type="button" onClick={onCerrar} title="Cerrar">
          <IconoCerrar tam={16} />
        </button>

        <span className="modal-icono personalizar-icono">
          <IconoPaleta tam={20} />
        </span>
        <h2>Personalizar el panel</h2>
        <p>Los cambios se aplican al momento y se guardan solos.</p>

        <label className="edicion-etiqueta">Nombre del panel</label>
        <input
          className="edicion-input"
          type="text"
          value={nombre}
          maxLength={60}
          onChange={(e) => onNombre(e.target.value)}
          placeholder="Mi panel"
        />

        <label className="edicion-etiqueta">Emoji del panel</label>
        <div className="personalizar-emojis">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={`personalizar-emoji ${tema.emoji === e ? 'elegido' : ''}`}
              onClick={() => onTema({ ...tema, emoji: tema.emoji === e ? null : e })}
            >
              {e}
            </button>
          ))}
          <input
            className="personalizar-emoji-libre"
            type="text"
            maxLength={4}
            placeholder="Otro…"
            value={tema.emoji && !EMOJIS.includes(tema.emoji) ? tema.emoji : ''}
            onChange={(e) => onTema({ ...tema, emoji: e.target.value.trim() || null })}
            title="Escribe cualquier emoji"
          />
        </div>

        <label className="edicion-etiqueta">Modo de color</label>
        <div className="personalizar-modos">
          <button
            type="button"
            className={tema.modo !== 'claro' ? 'elegido' : ''}
            onClick={() => onTema({ ...tema, modo: 'oscuro' })}
          >
            🌙 Oscuro
          </button>
          <button
            type="button"
            className={tema.modo === 'claro' ? 'elegido' : ''}
            onClick={() => onTema({ ...tema, modo: 'claro' })}
          >
            ☀️ Claro
          </button>
        </div>

        <label className="edicion-etiqueta">Color de acento</label>
        <div className="personalizar-acentos">
          {ACENTOS.map((c) => (
            <button
              key={c}
              type="button"
              className={`personalizar-acento ${tema.acento === c ? 'elegido' : ''}`}
              style={{ background: c }}
              onClick={() => onTema({ ...tema, acento: c })}
              title={c}
            />
          ))}
          <label className="personalizar-acento-libre" title="Elegir cualquier color">
            <input
              type="color"
              value={tema.acento || '#a3e635'}
              onChange={(e) => onTema({ ...tema, acento: e.target.value })}
            />
            +
          </label>
        </div>
      </div>
    </div>
  )
}
