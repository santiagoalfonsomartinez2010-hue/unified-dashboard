import { useState } from 'react'
import { colorCliente } from '../lib/visuales'
import { IconoCerrar, IconoLapiz, IconoMas, IconoCheck } from './Iconos'
import { TablaFuente } from './VistaCategoria'
import './Vistas.css'
import './Calendario.css'
import './Edicion.css'

/*
  Apartado "Agenda": un calendario mensual interactivo de verdad. Muestra
  todos los eventos de todas las fuentes en su día; se navega por meses, se
  pincha un día para ver/añadir/editar/borrar sus eventos. Debajo siguen las
  tablas de la categoría "agenda".
*/

const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// Fecha local en AAAA-MM-DD (sin líos de zona horaria)
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Devuelve las 6 semanas (42 celdas) que cubren el mes de "ancla", empezando en lunes
function celdasDelMes(ancla) {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1)
  // getDay(): 0=domingo … lo pasamos a 0=lunes
  const desplaz = (primero.getDay() + 6) % 7
  const inicio = new Date(primero)
  inicio.setDate(1 - desplaz)
  const celdas = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio)
    d.setDate(inicio.getDate() + i)
    celdas.push(d)
  }
  return celdas
}

export default function VistaAgenda({ listas, onEditarFuente, onQuitarFuente }) {
  const hoyIso = iso(new Date())
  const tablasAgenda = listas.filter((f) => f.resultado.categoria === 'agenda')

  const [ancla, setAncla] = useState(() => new Date())
  const [diaSel, setDiaSel] = useState(hoyIso)
  const [nuevo, setNuevo] = useState({ titulo: '', fuenteId: '' })
  const [editandoClave, setEditandoClave] = useState(null)
  const [edicion, setEdicion] = useState({ fecha: '', titulo: '' })

  // Todos los eventos, indexados por día
  const eventos = listas.flatMap((f) =>
    (f.resultado.eventos || []).map((e, idx) => ({
      ...e,
      fuente: f.resultado.titulo,
      fuenteId: f.id,
      idx,
    }))
  )
  const porDia = {}
  for (const e of eventos) {
    if (!e.fecha) continue
    ;(porDia[e.fecha] ||= []).push(e)
  }

  const celdas = celdasDelMes(ancla)
  const eventosDelDia = porDia[diaSel] || []

  function fuenteDe(id) {
    return listas.find((f) => f.id === id)
  }

  function cambiarMes(delta) {
    setAncla(new Date(ancla.getFullYear(), ancla.getMonth() + delta, 1))
  }

  function irHoy() {
    setAncla(new Date())
    setDiaSel(hoyIso)
  }

  function anadirEvento(e) {
    e.preventDefault()
    const fuente = fuenteDe(nuevo.fuenteId) || listas[0]
    if (!fuente || !nuevo.titulo.trim()) return
    onEditarFuente(fuente.id, {
      eventos: [...(fuente.resultado.eventos || []), { fecha: diaSel, titulo: nuevo.titulo.trim() }],
    })
    setNuevo({ titulo: '', fuenteId: fuente.id })
  }

  function borrarEvento(ev) {
    const fuente = fuenteDe(ev.fuenteId)
    if (!fuente) return
    onEditarFuente(ev.fuenteId, {
      eventos: fuente.resultado.eventos.filter((_, i) => i !== ev.idx),
    })
  }

  function guardarEdicion(ev) {
    const fuente = fuenteDe(ev.fuenteId)
    if (!fuente) return
    onEditarFuente(ev.fuenteId, {
      eventos: fuente.resultado.eventos.map((x, i) =>
        i === ev.idx
          ? { ...x, fecha: edicion.fecha || x.fecha, titulo: edicion.titulo.trim() || x.titulo }
          : x
      ),
    })
    setEditandoClave(null)
  }

  const fechaSelObj = new Date(`${diaSel}T00:00:00`)
  const etiquetaDiaSel =
    diaSel === hoyIso
      ? 'Hoy'
      : `${DIAS_LARGOS[fechaSelObj.getDay()]} ${fechaSelObj.getDate()} de ${MESES[fechaSelObj.getMonth()]}`

  return (
    <div className="vista">
      <div className="cal-layout">
        {/* Calendario */}
        <div className="cal">
          <div className="cal-cabecera">
            <div className="cal-titulo">
              {MESES[ancla.getMonth()].charAt(0).toUpperCase() + MESES[ancla.getMonth()].slice(1)}{' '}
              {ancla.getFullYear()}
            </div>
            <div className="cal-nav">
              <button type="button" onClick={() => cambiarMes(-1)} title="Mes anterior">
                ‹
              </button>
              <button type="button" className="cal-hoy" onClick={irHoy}>
                Hoy
              </button>
              <button type="button" onClick={() => cambiarMes(1)} title="Mes siguiente">
                ›
              </button>
            </div>
          </div>

          <div className="cal-rejilla cal-cabeceras">
            {DIAS_CORTOS.map((d) => (
              <div key={d} className="cal-dia-cabecera">
                {d}
              </div>
            ))}
          </div>

          <div className="cal-rejilla">
            {celdas.map((d) => {
              const clave = iso(d)
              const delMes = d.getMonth() === ancla.getMonth()
              const evs = porDia[clave] || []
              return (
                <button
                  type="button"
                  key={clave}
                  className={`cal-celda ${delMes ? '' : 'fuera'} ${clave === hoyIso ? 'hoy' : ''} ${
                    clave === diaSel ? 'sel' : ''
                  }`}
                  onClick={() => setDiaSel(clave)}
                >
                  <span className="cal-num">{d.getDate()}</span>
                  <span className="cal-eventos">
                    {evs.slice(0, 3).map((ev, i) => (
                      <span
                        key={i}
                        className="cal-chip"
                        style={{ background: colorCliente(ev.fuente) }}
                        title={ev.titulo}
                      >
                        {ev.titulo}
                      </span>
                    ))}
                    {evs.length > 3 && <span className="cal-mas">+{evs.length - 3}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel del día seleccionado */}
        <div className="cal-dia-panel">
          <h3>{etiquetaDiaSel}</h3>
          <span className="cal-dia-fecha">{diaSel}</span>

          <div className="cal-dia-eventos">
            {eventosDelDia.length === 0 && (
              <p className="cal-dia-vacio">No hay nada este día.</p>
            )}
            {eventosDelDia.map((ev) => {
              const clave = `${ev.fuenteId}-${ev.idx}`
              if (editandoClave === clave) {
                return (
                  <div className="cal-dia-evento editando" key={clave}>
                    <input
                      className="edicion-mini"
                      type="date"
                      value={edicion.fecha}
                      onChange={(e) => setEdicion({ ...edicion, fecha: e.target.value })}
                    />
                    <input
                      className="edicion-mini"
                      value={edicion.titulo}
                      onChange={(e) => setEdicion({ ...edicion, titulo: e.target.value })}
                    />
                    <button
                      className="boton-primario cal-guardar"
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
                  className="cal-dia-evento"
                  key={clave}
                  style={{ borderLeftColor: colorCliente(ev.fuente) }}
                >
                  <div className="cal-dia-evento-txt">
                    <strong>{ev.titulo}</strong>
                    <span>{ev.fuente}</span>
                  </div>
                  <div className="cal-dia-evento-btns">
                    <button
                      className="edicion-quitar"
                      type="button"
                      title="Editar"
                      onClick={() => {
                        setEditandoClave(clave)
                        setEdicion({ fecha: ev.fecha, titulo: ev.titulo })
                      }}
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

          {/* Añadir en el día seleccionado */}
          {listas.length > 0 ? (
            <form className="cal-dia-form" onSubmit={anadirEvento}>
              <input
                className="edicion-mini"
                type="text"
                placeholder="Nueva cita o evento…"
                value={nuevo.titulo}
                onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}
                required
              />
              {listas.length > 1 && (
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
              )}
              <button className="boton-primario cal-dia-anadir" type="submit">
                <IconoMas tam={14} /> Añadir a este día
              </button>
            </form>
          ) : (
            <p className="cal-dia-vacio">Añade una fuente para poder crear eventos.</p>
          )}
        </div>
      </div>

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
