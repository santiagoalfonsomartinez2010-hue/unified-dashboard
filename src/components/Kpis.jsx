import { IconoCerrar, IconoMas } from './Iconos'
import './Kpis.css'
import './Edicion.css'

/*
  Fila de cifras clave (estilo referencia: etiqueta en MAYÚSCULAS, valor
  grande, badge de detalle debajo y un icono arriba a la derecha). Si la IA
  ya analizó el panel, muestra sus KPIs personalizados; si no, los recuentos.

  En modo edición (editable=true) cada KPI se puede cambiar a mano (icono,
  etiqueta, valor y detalle), quitar o añadir uno nuevo — vía onCambiar(kpis).
*/

const ICONOS = ['📈', '💶', '📅', '👥']

// El detalle se pinta verde si suena a positivo, rojo si a negativo
function tonoDetalle(detalle) {
  const t = String(detalle || '').toLowerCase()
  if (/^\+|sube|superan|más|record|récord/.test(t)) return 'positivo'
  if (/^-|pendiente|impago|vencid|baja|falta|reponer|retras/.test(t)) return 'negativo'
  return ''
}

export default function Kpis({ kpis, numFuentes, totalRegistros, numEventos, editable, onCambiar }) {
  const propios = kpis?.length > 0
  const lista = propios
    ? kpis
    : [
        { etiqueta: 'Fuentes conectadas', valor: numFuentes },
        { etiqueta: 'Registros organizados', valor: totalRegistros },
        { etiqueta: 'Próximos eventos', valor: numEventos },
      ]

  function cambiarKpi(i, campo, valor) {
    const nuevos = lista.map((k, j) => (j === i ? { ...k, [campo]: valor } : k))
    onCambiar(nuevos)
  }

  if (editable) {
    return (
      <div className="kpis">
        {lista.slice(0, 4).map((k, i) => (
          <div className="kpi kpi-editando" key={i}>
            <div className="kpi-fila">
              <input
                className="edicion-mini kpi-edita-icono"
                value={k.icono || ICONOS[i % ICONOS.length]}
                maxLength={4}
                onChange={(e) => cambiarKpi(i, 'icono', e.target.value)}
                title="Emoji del KPI"
              />
              <button
                className="edicion-quitar"
                type="button"
                title="Quitar KPI"
                onClick={() => onCambiar(lista.filter((_, j) => j !== i))}
              >
                <IconoCerrar tam={14} />
              </button>
            </div>
            <input
              className="edicion-mini"
              value={k.etiqueta}
              placeholder="Etiqueta"
              onChange={(e) => cambiarKpi(i, 'etiqueta', e.target.value)}
            />
            <input
              className="edicion-mini kpi-edita-valor"
              value={String(k.valor ?? '')}
              placeholder="Valor"
              onChange={(e) => cambiarKpi(i, 'valor', e.target.value)}
            />
            <input
              className="edicion-mini"
              value={k.detalle || ''}
              placeholder="Detalle (ej: +2 esta semana)"
              onChange={(e) => cambiarKpi(i, 'detalle', e.target.value)}
            />
          </div>
        ))}
        {lista.length < 4 && (
          <button
            className="kpi kpi-anadir"
            type="button"
            onClick={() =>
              onCambiar([...lista, { etiqueta: 'Nueva cifra', valor: '0', detalle: '', icono: '✨' }])
            }
          >
            <IconoMas tam={18} /> Añadir KPI
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="kpis">
      {lista.slice(0, 4).map((k, i) => (
        <div className="kpi" key={`${k.etiqueta}-${i}`}>
          <div className="kpi-fila">
            <span className="kpi-etiqueta">{k.etiqueta}</span>
            <span className="kpi-icono">{k.icono || ICONOS[i % ICONOS.length]}</span>
          </div>
          <span className="kpi-valor">{k.valor}</span>
          {k.detalle && <span className={`kpi-detalle ${tonoDetalle(k.detalle)}`}>{k.detalle}</span>}
        </div>
      ))}
    </div>
  )
}
