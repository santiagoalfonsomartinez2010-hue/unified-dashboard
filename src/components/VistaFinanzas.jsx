import { TablaFuente } from './VistaCategoria'
import { resumenFinanzas, formatoEuros } from '../lib/finanzas'
import './Vistas.css'
import './Finanzas.css'

/*
  Apartado "Finanzas": además de las tablas editables, muestra elementos
  visuales calculados de los datos — tiles de total/cobrado/pendiente, un
  gráfico de barras (por mes si hay fechas, o por concepto) y un donut de
  reparto por estado.
*/

const COLOR_ESTADO = {
  cobrado: 'var(--color-verde)',
  pendiente: 'var(--color-rojo)',
  otro: 'var(--color-amarillo)',
}

// Donut SVG genérico (segmentos con color propio) para el reparto por estado
function DonutEstados({ segmentos, total }) {
  let acumulado = 0
  return (
    <div className="fin-donut">
      <svg viewBox="0 0 42 42" className="fin-donut-svg" role="img" aria-label="Reparto por estado">
        {segmentos.map((s) => {
          const pct = total > 0 ? (s.monto / total) * 100 : 0
          const seg = (
            <circle
              key={s.clase}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={COLOR_ESTADO[s.clase]}
              strokeWidth="5.5"
              strokeDasharray={`${Math.max(pct - 1.2, 0.5)} ${100 - Math.max(pct - 1.2, 0.5)}`}
              strokeDashoffset={-acumulado + 25}
            />
          )
          acumulado += pct
          return seg
        })}
      </svg>
      <ul className="fin-donut-leyenda">
        {segmentos.map((s) => (
          <li key={s.clase}>
            <span className="fin-punto" style={{ background: COLOR_ESTADO[s.clase] }} />
            <span className="fin-donut-nombre">{s.etiqueta}</span>
            <span className="fin-donut-cifra">{formatoEuros(s.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Barras horizontales (por mes o por concepto)
function Barras({ datos, titulo }) {
  const max = Math.max(...datos.map((d) => d.monto), 1)
  return (
    <div className="panel-card">
      <h3>{titulo}</h3>
      <div className="fin-barras">
        {datos.map((d, i) => (
          <div className="fin-barra-fila" key={i} title={`${d.etiqueta}: ${formatoEuros(d.monto)}`}>
            <span className="fin-barra-nombre">{d.etiqueta}</span>
            <div className="fin-barra-pista">
              <div className="fin-barra" style={{ width: `${Math.max((d.monto / max) * 100, 2)}%` }} />
            </div>
            <span className="fin-barra-valor">{formatoEuros(d.monto)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VistaFinanzas({ fuentes, onEditarFuente, onQuitarFuente, onNuevaTabla }) {
  const deFinanzas = fuentes.filter(
    (f) => f.estado === 'listo' && f.resultado.categoria === 'finanzas'
  )
  const resumen = resumenFinanzas(deFinanzas)

  // Barras por mes si hay fechas; si no, por concepto (top)
  const usarMeses = resumen.porMes.length >= 2
  const datosBarras = usarMeses ? resumen.porMes : resumen.conceptos
  const cobrado = resumen.porEstado.find((s) => s.clase === 'cobrado')?.monto || 0
  const pendiente = resumen.porEstado.find((s) => s.clase === 'pendiente')?.monto || 0

  return (
    <div className="vista">
      {deFinanzas.length === 0 ? (
        <div className="vista-vacia">
          <h3>Sin datos de finanzas</h3>
          <p>Añade facturas, gastos o ingresos y aquí verás gráficas y totales.</p>
        </div>
      ) : (
        <>
          {resumen.hayImportes && (
            <>
              {/* Tiles */}
              <div className="fin-tiles">
                <div className="fin-tile">
                  <span className="fin-tile-et">TOTAL</span>
                  <b>{formatoEuros(resumen.total)}</b>
                </div>
                {cobrado > 0 && (
                  <div className="fin-tile">
                    <span className="fin-tile-et">COBRADO</span>
                    <b style={{ color: 'var(--color-verde)' }}>{formatoEuros(cobrado)}</b>
                    <span className="fin-tile-pct">
                      {Math.round((cobrado / resumen.total) * 100)}% del total
                    </span>
                  </div>
                )}
                {pendiente > 0 && (
                  <div className="fin-tile">
                    <span className="fin-tile-et">PENDIENTE DE COBRO</span>
                    <b style={{ color: 'var(--color-rojo)' }}>{formatoEuros(pendiente)}</b>
                    <span className="fin-tile-pct">
                      {Math.round((pendiente / resumen.total) * 100)}% del total
                    </span>
                  </div>
                )}
                <div className="fin-tile">
                  <span className="fin-tile-et">REGISTROS</span>
                  <b>{deFinanzas.reduce((s, f) => s + f.resultado.registros.length, 0)}</b>
                  <span className="fin-tile-pct">
                    en {deFinanzas.length} {deFinanzas.length === 1 ? 'tabla' : 'tablas'}
                  </span>
                </div>
              </div>

              {/* Gráficas */}
              <div className="vista-rejilla-2">
                {datosBarras.length > 0 && (
                  <Barras
                    datos={datosBarras}
                    titulo={usarMeses ? 'Importe por mes' : 'Importe por concepto'}
                  />
                )}
                {resumen.porEstado.length > 0 && (
                  <div className="panel-card">
                    <h3>Reparto por estado</h3>
                    <DonutEstados segmentos={resumen.porEstado} total={resumen.total} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tablas editables */}
          {deFinanzas.map((f) => (
            <TablaFuente
              key={f.id}
              fuente={f}
              onEditar={onEditarFuente}
              onQuitar={() => onQuitarFuente(f.id)}
            />
          ))}
        </>
      )}

      <button className="edicion-anadir" type="button" onClick={onNuevaTabla}>
        + Nueva tabla manual en finanzas
      </button>
    </div>
  )
}
