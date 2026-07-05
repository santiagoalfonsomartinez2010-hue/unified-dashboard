import { colorCliente } from '../lib/visuales'
import './Vistas.css'

/*
  Apartado "Agenda": todos los eventos de todas las fuentes agrupados por día,
  con bloques de color por fuente (como el calendario de la referencia).
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

export default function VistaAgenda({ listas }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const eventos = listas
    .flatMap((f) => f.resultado.eventos.map((e) => ({ ...e, fuente: f.resultado.titulo })))
    .filter((e) => e.fecha && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Agrupa por fecha manteniendo el orden
  const porDia = []
  for (const e of eventos) {
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo.fecha === e.fecha) ultimo.eventos.push(e)
    else porDia.push({ fecha: e.fecha, eventos: [e] })
  }

  if (eventos.length === 0) {
    return (
      <div className="vista">
        <div className="vista-vacia">
          <h3>Sin eventos futuros</h3>
          <p>
            Cuando tus fuentes tengan citas, vencimientos o entregas, aparecerán aquí ordenadas
            por día.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="vista">
      <div className="agenda">
        {porDia.map((dia) => (
          <div className="agenda-dia" key={dia.fecha}>
            <div className={`agenda-fecha ${dia.fecha === hoy ? 'hoy' : ''}`}>
              <span className="agenda-fecha-etiqueta">{etiquetaDia(dia.fecha)}</span>
              <span className="agenda-fecha-num">{dia.fecha}</span>
            </div>
            <div className="agenda-eventos">
              {dia.eventos.map((e, i) => (
                <div
                  className="agenda-evento"
                  key={i}
                  style={{ borderLeftColor: colorCliente(e.fuente) }}
                >
                  <strong>{e.titulo}</strong>
                  <span>{e.fuente}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
