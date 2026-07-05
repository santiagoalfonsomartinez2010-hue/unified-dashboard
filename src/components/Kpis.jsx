import './Kpis.css'

/*
  Fila de cifras clave (estilo referencia: etiqueta en MAYÚSCULAS, valor
  grande, badge de detalle debajo y un icono arriba a la derecha). Si la IA
  ya analizó el panel, muestra sus KPIs personalizados; si no, los recuentos.
*/

const ICONOS = ['📈', '💶', '📅', '👥']

// El detalle se pinta verde si suena a positivo, rojo si a negativo
function tonoDetalle(detalle) {
  const t = String(detalle || '').toLowerCase()
  if (/^\+|sube|superan|más|record|récord/.test(t)) return 'positivo'
  if (/^-|pendiente|impago|vencid|baja|falta|reponer|retras/.test(t)) return 'negativo'
  return ''
}

export default function Kpis({ kpis, numFuentes, totalRegistros, numEventos }) {
  const lista =
    kpis?.length > 0
      ? kpis
      : [
          { etiqueta: 'Fuentes conectadas', valor: numFuentes },
          { etiqueta: 'Registros organizados', valor: totalRegistros },
          { etiqueta: 'Próximos eventos', valor: numEventos },
        ]

  return (
    <div className="kpis">
      {lista.slice(0, 4).map((k, i) => (
        <div className="kpi" key={k.etiqueta}>
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
