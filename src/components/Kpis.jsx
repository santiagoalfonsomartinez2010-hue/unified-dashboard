import './Kpis.css'

/*
  Fila de cifras clave (stat tiles estilo Lovable: icono en cuadrado tintado +
  valor grande + etiqueta + detalle). Si la IA ya analizó el panel, muestra
  sus KPIs personalizados; si no, cae a los recuentos básicos.
*/

const ICONOS = ['📈', '💶', '📅', '👥']
const COLORES = [
  { color: '#6366f1', tinte: 'rgba(99, 102, 241, 0.14)' },
  { color: '#10b981', tinte: 'rgba(16, 185, 129, 0.14)' },
  { color: '#f59e0b', tinte: 'rgba(245, 158, 11, 0.14)' },
  { color: '#ec4899', tinte: 'rgba(236, 72, 153, 0.14)' },
]

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
      {lista.slice(0, 4).map((k, i) => {
        const c = COLORES[i % COLORES.length]
        return (
          <div className="kpi" key={k.etiqueta}>
            <span className="kpi-icono" style={{ background: c.tinte, color: c.color }}>
              {k.icono || ICONOS[i % ICONOS.length]}
            </span>
            <div className="kpi-cuerpo">
              <span className="kpi-etiqueta">{k.etiqueta}</span>
              <span className="kpi-valor">{k.valor}</span>
              {k.detalle && <span className="kpi-detalle">{k.detalle}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
