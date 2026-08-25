import { useState } from 'react'
import { IconoTipoArchivo, IconoCerrar, IconoAlerta, IconoChevron } from './Iconos'
import { infoCategoria } from '../lib/categorias'
import { etiquetaTipoArchivo } from '../lib/parseArchivo'
import './TarjetaFuente.css'

/*
  Tarjeta de una fuente conectada: cabecera con icono y categoría, resumen,
  métricas destacadas y la tabla de registros normalizada, plegada por defecto.
  También pinta los estados intermedios (procesando / error).
*/
export default function TarjetaFuente({ fuente, onQuitar }) {
  const [tablaAbierta, setTablaAbierta] = useState(false)
  const r = fuente.resultado
  const cat = r ? infoCategoria(r.categoria) : null

  return (
    <article className={`tarjeta ${fuente.estado}`}>
      <header className="tarjeta-cabecera">
        <span
          className="tarjeta-icono"
          style={cat ? { color: cat.color, background: `${cat.color}22` } : undefined}
        >
          <IconoTipoArchivo tipo={fuente.tipoArchivo} />
        </span>
        <div className="tarjeta-titulos">
          <strong>{r?.titulo || fuente.nombreArchivo}</strong>
          <span className="tarjeta-meta">
            {etiquetaTipoArchivo(fuente.tipoArchivo)} · {fuente.nombreArchivo}
          </span>
        </div>
        {cat && (
          <span className="tarjeta-categoria" style={{ color: cat.color, borderColor: `${cat.color}55` }}>
            {cat.etiqueta}
          </span>
        )}
        <button className="tarjeta-quitar" type="button" title="Quitar fuente" onClick={onQuitar}>
          <IconoCerrar tam={15} />
        </button>
      </header>

      {fuente.estado === 'procesando' && (
        // Las hojas de cálculo se analizan por etapas en local y van contando
        // por dónde van; el resto de archivos solo pueden decir que esperan.
        <p className="tarjeta-estado procesando">
          ⏳ {fuente.progreso || 'La IA está leyendo y organizando este archivo…'}
        </p>
      )}

      {fuente.estado === 'error' && (
        <p className="tarjeta-estado error">
          <IconoAlerta tam={15} /> {fuente.error || 'No se pudo analizar el archivo.'}
        </p>
      )}

      {fuente.estado === 'listo' && r && (
        <>
          <p className="tarjeta-resumen">{r.resumen}</p>

          {r.metricas.length > 0 && (
            <div className="tarjeta-metricas">
              {r.metricas.map((m, i) => (
                <span className="tarjeta-metrica" key={i}>
                  <b>{m.valor}</b> {m.etiqueta}
                </span>
              ))}
            </div>
          )}

          {r.registros.length > 0 && (
            <>
              <button
                className="tarjeta-toggle"
                type="button"
                onClick={() => setTablaAbierta(!tablaAbierta)}
              >
                <IconoChevron abierto={tablaAbierta} />
                {tablaAbierta ? 'Ocultar tabla' : `Ver tabla (${r.registros.length} filas)`}
              </button>

              {tablaAbierta && (
                <div className="tarjeta-tabla">
                  <table>
                    <thead>
                      <tr>
                        {r.columnas.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.registros.map((fila, i) => (
                        <tr key={i}>
                          {r.columnas.map((c) => (
                            <td key={c}>{String(fila[c] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </article>
  )
}
