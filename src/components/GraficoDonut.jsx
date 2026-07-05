import { infoCategoria } from '../lib/categorias'
import './Graficos.css'

/*
  Donut de registros por categoría (como el "mix de planes" de la referencia):
  anillo SVG + leyenda con valor y porcentaje. El color sigue siempre a la
  categoría (viene de lib/categorias.js).
*/
export default function GraficoDonut({ porCategoria, total }) {
  const entradas = Object.entries(porCategoria)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  if (entradas.length === 0 || total === 0) {
    return <p className="grafico-vacio">Sin registros todavía.</p>
  }

  // Cada segmento del anillo se dibuja con stroke-dasharray sobre un círculo
  const radio = 15.9155 // circunferencia = 100 para trabajar en porcentajes
  let acumulado = 0
  const segmentos = entradas.map(([clave, valor]) => {
    const info = infoCategoria(clave)
    const pct = (valor / total) * 100
    const seg = { clave, info, valor, pct, offset: acumulado }
    acumulado += pct
    return seg
  })

  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" className="donut-svg" role="img" aria-label="Registros por categoría">
        {segmentos.map((s) => (
          <circle
            key={s.clave}
            cx="21"
            cy="21"
            r={radio}
            fill="none"
            stroke={s.info.color}
            strokeWidth="5.5"
            strokeDasharray={`${Math.max(s.pct - 1.2, 0.5)} ${100 - Math.max(s.pct - 1.2, 0.5)}`}
            strokeDashoffset={-s.offset + 25}
            strokeLinecap="butt"
          />
        ))}
        <text x="21" y="20.2" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="21" y="25.4" textAnchor="middle" className="donut-sub">
          registros
        </text>
      </svg>
      <ul className="donut-leyenda">
        {segmentos.map((s) => (
          <li key={s.clave}>
            <span className="donut-punto" style={{ background: s.info.color }} />
            <span className="donut-nombre">{s.info.etiqueta}</span>
            <span className="donut-cifra">
              {s.valor} · {Math.round(s.pct)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
