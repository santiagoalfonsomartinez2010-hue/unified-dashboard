import { useRef, useState } from 'react'
import { IconoCerrar, IconoMas, IconoChispa, IconoPapelera, IconoTipoArchivo } from './Iconos'
import { inferirTipoArchivo } from '../lib/parseArchivo'
import './AsistenteCreacion.css'

/*
  Asistente de creación de un panel nuevo. En vez de volcar los datos de
  primeras, hace una serie de preguntas tipo formulario (para qué es el
  dashboard, a qué te dedicas, qué quieres ver…) y deja añadir todos los
  archivos de golpe. Al pulsar "Crear panel" se analiza todo a la vez y las
  respuestas (el "perfil") personalizan el análisis de la IA.
*/

const PROPOSITOS = [
  {
    id: 'personal',
    emoji: '🏠',
    titulo: 'Personal',
    texto: 'Gastos de casa, agenda, estudios, hábitos…',
  },
  {
    id: 'trabajo',
    emoji: '💼',
    titulo: 'Para mi trabajo',
    texto: 'Organizar tus tareas, clientes o proyectos.',
  },
  {
    id: 'negocio',
    emoji: '🏪',
    titulo: 'Para mi negocio',
    texto: 'Una peluquería, un gimnasio, una tienda…',
  },
]

const CONTENIDOS = [
  'Calendarios y citas',
  'Tablas y Excels',
  'Gastos y facturas',
  'Clientes',
  'Inventario',
  'Equipo y personas',
  'Documentos y notas',
  'Fotos de pizarras o listas',
]

export default function AsistenteCreacion({ hayApiKey, onPedirApiKey, onCrear, onCerrar, creando }) {
  const [paso, setPaso] = useState(0)
  const [proposito, setProposito] = useState(null)
  const [descripcion, setDescripcion] = useState('')
  const [ayuda, setAyuda] = useState('')
  const [contenidos, setContenidos] = useState([])
  const [nombre, setNombre] = useState('')
  const [archivos, setArchivos] = useState([])
  const inputRef = useRef(null)

  const totalPasos = 4

  function alternarContenido(c) {
    setContenidos((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  function anadirArchivos(lista) {
    const nuevos = Array.from(lista || [])
    if (nuevos.length === 0) return
    setArchivos((prev) => {
      // Evita duplicados por nombre+tamaño
      const claves = new Set(prev.map((a) => `${a.name}-${a.size}`))
      return [...prev, ...nuevos.filter((a) => !claves.has(`${a.name}-${a.size}`))]
    })
  }

  function crear() {
    const perfil = {
      proposito,
      descripcion: descripcion.trim(),
      ayuda: ayuda.trim(),
      contenidos,
    }
    onCrear({
      nombre: nombre.trim() || 'Mi panel',
      perfil,
      archivos,
    })
  }

  const faltaKey = archivos.length > 0 && !hayApiKey

  // Textos del paso 2 según el propósito elegido
  const preguntaDescripcion =
    proposito === 'negocio'
      ? '¿En qué consiste tu negocio?'
      : proposito === 'trabajo'
        ? '¿En qué consiste tu trabajo?'
        : '¿Qué quieres organizar?'
  const placeholderDescripcion =
    proposito === 'negocio'
      ? 'Ej: tengo una peluquería con 3 empleadas, trabajamos con cita previa…'
      : proposito === 'trabajo'
        ? 'Ej: soy electricista autónomo, llevo varias obras a la vez…'
        : 'Ej: los gastos de casa, mis entrenamientos, los apuntes del curso…'

  return (
    <div className="asistente-fondo">
      <div className="asistente">
        {onCerrar && (
          <button className="asistente-cerrar" type="button" onClick={onCerrar} title="Cerrar">
            <IconoCerrar tam={16} />
          </button>
        )}

        <div className="asistente-progreso">
          {Array.from({ length: totalPasos }).map((_, i) => (
            <span key={i} className={i <= paso ? 'lleno' : ''} />
          ))}
        </div>

        {/* Paso 1: propósito */}
        {paso === 0 && (
          <div className="asistente-paso">
            <h2>¿Para qué quieres este dashboard?</h2>
            <p className="asistente-sub">
              Tus respuestas personalizan el panel: la IA analizará tus datos pensando en tu caso.
            </p>
            <div className="asistente-opciones">
              {PROPOSITOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`asistente-opcion ${proposito === p.id ? 'elegida' : ''}`}
                  onClick={() => setProposito(p.id)}
                >
                  <span className="asistente-opcion-emoji">{p.emoji}</span>
                  <strong>{p.titulo}</strong>
                  <span className="asistente-opcion-texto">{p.texto}</span>
                </button>
              ))}
            </div>
            <div className="asistente-botones">
              <span />
              <button
                className="boton-primario"
                type="button"
                disabled={!proposito}
                onClick={() => setPaso(1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Paso 2: descripción y en qué ayuda */}
        {paso === 1 && (
          <div className="asistente-paso">
            <h2>{preguntaDescripcion}</h2>
            <p className="asistente-sub">
              Cuanto más nos cuentes, más útil será el análisis. Puedes escribir como hablas.
            </p>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={placeholderDescripcion}
              rows={3}
            />
            <label className="asistente-etiqueta">¿En qué te va a ayudar este dashboard?</label>
            <textarea
              value={ayuda}
              onChange={(e) => setAyuda(e.target.value)}
              placeholder="Ej: saber cuánto me deben, no olvidarme de ninguna cita, controlar el stock…"
              rows={3}
            />
            <div className="asistente-botones">
              <button className="boton-secundario" type="button" onClick={() => setPaso(0)}>
                Atrás
              </button>
              <button className="boton-primario" type="button" onClick={() => setPaso(2)}>
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Paso 3: qué quiere añadir */}
        {paso === 2 && (
          <div className="asistente-paso">
            <h2>¿Qué quieres añadir al panel?</h2>
            <p className="asistente-sub">Marca todo lo que vayas a usar (puedes cambiarlo luego).</p>
            <div className="asistente-chips">
              {CONTENIDOS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`asistente-chip ${contenidos.includes(c) ? 'elegida' : ''}`}
                  onClick={() => alternarContenido(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="asistente-botones">
              <button className="boton-secundario" type="button" onClick={() => setPaso(1)}>
                Atrás
              </button>
              <button className="boton-primario" type="button" onClick={() => setPaso(3)}>
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Paso 4: nombre + archivos + crear */}
        {paso === 3 && (
          <div className="asistente-paso">
            <h2>Último paso: nombre y datos</h2>
            <p className="asistente-sub">
              Añade todos los archivos que quieras y cuando termines dale a "Crear panel": se
              analizará todo a la vez.
            </p>
            <label className="asistente-etiqueta">Nombre del panel</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={
                proposito === 'negocio'
                  ? 'Ej: Peluquería Sol'
                  : proposito === 'trabajo'
                    ? 'Ej: Mis obras'
                    : 'Ej: Casa y gastos'
              }
              maxLength={60}
            />

            <label className="asistente-etiqueta">Tus datos (Excel, PDF, imágenes, calendarios…)</label>
            <button
              type="button"
              className="asistente-subida"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                anadirArchivos(e.dataTransfer.files)
              }}
            >
              <IconoMas tam={16} /> Añadir archivos (o arrástralos aquí)
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.ics,.json,.txt,.md"
              onChange={(e) => {
                anadirArchivos(e.target.files)
                e.target.value = ''
              }}
            />

            {archivos.length > 0 && (
              <div className="asistente-archivos">
                {archivos.map((a, i) => (
                  <div className="asistente-archivo" key={`${a.name}-${a.size}`}>
                    <IconoTipoArchivo tipo={inferirTipoArchivo(a.name)} tam={15} />
                    <span className="asistente-archivo-nombre">{a.name}</span>
                    <button
                      type="button"
                      title="Quitar"
                      onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <IconoPapelera tam={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {faltaKey && (
              <p className="asistente-aviso">
                Para analizar archivos hace falta tu API key de Gemini (gratuita).{' '}
                <button type="button" onClick={onPedirApiKey}>
                  Ponerla ahora
                </button>
              </p>
            )}

            <div className="asistente-botones">
              <button className="boton-secundario" type="button" onClick={() => setPaso(2)}>
                Atrás
              </button>
              <button
                className="boton-primario"
                type="button"
                disabled={creando || faltaKey}
                onClick={crear}
              >
                <IconoChispa tam={15} />
                {creando
                  ? 'Creando tu panel…'
                  : archivos.length > 0
                    ? `Crear panel y analizar ${archivos.length} ${archivos.length === 1 ? 'archivo' : 'archivos'}`
                    : 'Crear panel vacío'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
