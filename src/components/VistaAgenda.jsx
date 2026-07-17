import { useState } from 'react'
import { colorCliente } from '../lib/visuales'
import { IconoCerrar, IconoLapiz, IconoMas, IconoCheck } from './Iconos'
import { TablaFuente } from './VistaCategoria'
import './Vistas.css'
import './Edicion.css'

/*
  Apartado "Agenda": todos los eventos de todas las fuentes agrupados por día.
  Totalmente editable a mano: añadir citas nuevas (eligiendo a qué fuente van),
  editar el título o la fecha de cualquier evento, y borrarlos.
*/

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function etiquetaDia(fecha) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const d = new Date(`${fecha}T00:00:00`)
  const dias = Math.round((d - hoy) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

export default function VistaAgenda({ listas, onEditarFuente, onQuitarFuente }) {
  const hoy = new Date().toISOString().slice(0, 10)
  // Las tablas de la categoría "agenda" (citas, horarios…) viven aquí
  const tablasAgenda = listas.filter((f) => f.resultado.categoria === 'agenda')
  const [anadiendo, setAnadiendo] = useState(false)
  const [nuevo, setNuevo] = useState({ fecha: hoy, titulo: '', fuenteId: '' })
  const [editandoClave, setEditandoClave] = useState(null) // `${fuenteId}-${idx}`
  const [edicion, setEdicion] = useState({ fecha: '', titulo: '' })

  // Todos los eventos futuros, con referencia a su fuente e índice original
  const eventos = listas
    .flatMap((f) =>
      (f.resultado.eventos || []).map((e, idx) => ({
        ...e,
        fuente: f.resultado.titulo,
        fuenteId: f.id,
        idx,
      }))
    )
    .filter((e) => e.fecha && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const porDia = []
  for (const e of eventos) {
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo.fecha === e.fecha) ultimo.eventos.push(e)
    else porDia.push({ fecha: e.fecha, eventos: [e] })
  }

  function fuenteDe(id) {
    return listas.find((f) => f.id === id)
  }

  function anadirEvento(e) {
    e.preventDefault()
    const fuente = fuenteDe(nuevo.fuenteId) || listas[0]
    if (!fuente || !nuevo.titulo.trim() || !nuevo.fecha) return
    onEditarFuente(fuente.id, {
      eventos: [...(fuente.resultado.eventos || []), { fecha: nuevo.fecha, titulo: nuevo.titulo.trim() }],
    })
    setNuevo({ fecha: hoy, titulo: '', fuenteId: fuente.id })
    setAnadiendo(false)
  }

  function borrarEvento(ev) {
    const fuente = fuenteDe(ev.fuenteId)
    if (!fuente) return
    onEditarFuente(ev.fuenteId, {
      eventos: fuente.resultado.eventos.filter((_, i) => i !== ev.idx),
    })
  }

  function empezarEdicion(ev) {
    setEditandoClave(`${ev.fuenteId}-${ev.idx}`)
    setEdicion({ fecha: ev.fecha, titulo: ev.titulo })
  }

  function guardarEdicion(ev) {
    const fuente = fuenteDe(ev.fuenteId)
    if (!fuente) return
    onEditarFuente(ev.fuenteId, {
      eventos: fuente.resultado.eventos.map((x, i) =>
        i === ev.idx ? { ...x, fecha: edicion.fecha || x.fecha, titulo: edicion.titulo.trim() || x.titulo } : x
      ),
    })
    setEditandoClave(null)
  }

  return (
    <div className="vista">
      {/* Añadir cita/evento a mano */}
      {listas.length > 0 && (
        <div className="agenda-anadir">
          {!anadiendo ? (
            <button className="edicion-anadir" type="button" onClick={() => setAnadiendo(true)}>
              <IconoMas tam={13} /> Añadir cita o evento
            </button>
          ) : (
            <form className="agenda-form" onSubmit={anadirEvento}>
              <input
                className="edicion-mini"
                type="date"
                value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })}
                required
              />
              <input
                className="edicion-mini agenda-form-titulo"
                type="text"
                placeholder="Ej: Cita con proveedor de material"
                value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
                autoFocus
                required
              />
              <select
                className="edicion-mini"
                value={nuevo.fuenteId || listas[0]?.id}
                onChange={(e) => setNuevo({ ...nuevo, fuenteId: e.target.value })}
                title="Fuente a la que pertenece"
              >
                {listas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.resultado.titulo}
                  </option>
                ))}
              </select>
              <button className="boton-primario" type="submit">
                Añadir
              </button>
              <button
                className="boton-secundario"
                type="button"
                onClick={() => setAnadiendo(false)}
              >
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}

      {eventos.length === 0 ? (
        <div className="vista-vacia">
          <h3>Sin eventos futuros</h3>
          <p>
            Añade una cita con el botón de arriba, o sube fuentes con fechas (calendarios,
            facturas con vencimiento…) y aparecerán aquí ordenadas por día.
          </p>
        </div>
      ) : (
        <div className="agenda">
          {porDia.map((dia) => (
            <div className="agenda-dia" key={dia.fecha}>
              <div className={`agenda-fecha ${dia.fecha === hoy ? 'hoy' : ''}`}>
                <span className="agenda-fecha-etiqueta">{etiquetaDia(dia.fecha)}</span>
                <span className="agenda-fecha-num">{dia.fecha}</span>
              </div>
              <div className="agenda-eventos">
                {dia.eventos.map((ev) => {
                  const clave = `${ev.fuenteId}-${ev.idx}`
                  if (editandoClave === clave) {
                    return (
                      <div className="agenda-evento agenda-evento-editando" key={clave}>
                        <input
                          className="edicion-mini"
                          type="date"
                          value={edicion.fecha}
                          onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })}
                        />
                        <input
                          className="edicion-mini agenda-form-titulo"
                          value={edicion.titulo}
                          onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })}
                        />
                        <button
                          className="boton-primario agenda-guardar"
                          type="button"
                          onClick={() => guardarEdicion(ev)}
                          title="Guardar"
                        >
                          <IconoCheck tam={14} />
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div
                      className="agenda-evento"
                      key={clave}
                      style={{ borderLeftColor: colorCliente(ev.fuente) }}
                    >
                      <div className="agenda-evento-textos">
                        <strong>{ev.titulo}</strong>
                        <span>{ev.fuente}</span>
                      </div>
                      <div className="agenda-evento-botones">
                        <button
                          className="edicion-quitar"
                          type="button"
                          title="Editar"
                          onClick={() => empezarEdicion(ev)}
                        >
                          <IconoLapiz tam={13} />
                        </button>
                        <button
                          className="edicion-quitar"
                          type="button"
                          title="Borrar"
                          onClick={() => borrarEvento(ev)}
                        >
                          <IconoCerrar tam={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tablasAgenda.length > 0 && (
        <div className="agenda-tablas">
          {tablasAgenda.map((f) => (
            <TablaFuente
              key={f.id}
              fuente={f}
              onEditar={onEditarFuente}
              onQuitar={() => onQuitarFuente(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
