import { useState } from 'react'
import { IconoChispa, IconoAlerta, IconoSincronizar, IconoCerrar, IconoMas } from './Iconos'
import './AnalisisIA.css'
import './Edicion.css'

/*
  Análisis & alertas: la IA cruza TODAS las fuentes con el perfil del usuario
  y devuelve un titular, conexiones detectadas (se muestran como alertas) y
  sugerencias (lista de tareas marcables). Se regenera automáticamente al
  añadir o quitar datos.

  En modo edición (editable=true) todo se puede cambiar a mano: titular,
  alertas (editar/quitar/añadir) y tareas (editar/quitar/añadir propias) —
  vía onEditar({ titular | conexiones | sugerencias }).
*/
export default function AnalisisIA({
  analisis,
  analizando,
  aviso,
  hayFuentes,
  editable,
  onEditar,
  onActualizar,
}) {
  const [hechas, setHechas] = useState({})

  const conexiones = analisis?.conexiones || []
  const sugerencias = analisis?.sugerencias || []

  return (
    <div className="analisis">
      <div className="analisis-cabecera">
        <h3>
          <span className="analisis-icono">
            <IconoChispa tam={15} />
          </span>
          Análisis & alertas
        </h3>
        {hayFuentes && !editable && (
          <button
            className="boton-secundario"
            type="button"
            onClick={onActualizar}
            disabled={analizando}
          >
            <IconoSincronizar tam={14} />
            {analizando ? 'Analizando…' : 'Actualizar'}
          </button>
        )}
      </div>

      {aviso && (
        <p className="analisis-aviso">
          <IconoAlerta tam={15} /> {aviso}
        </p>
      )}

      {analizando && (
        <p className="analisis-cargando">
          ⏳ La IA está cruzando todas tus fuentes para entender el conjunto…
        </p>
      )}

      {!analizando && !analisis && !aviso && !editable && (
        <p className="analisis-cargando">
          {hayFuentes
            ? 'El análisis se generará en cuanto termine el procesado de tus datos.'
            : 'Añade tus datos y la IA los entenderá en conjunto: conexiones, cifras clave y qué hacer.'}
        </p>
      )}

      {/* ----- Modo edición ----- */}
      {editable && !analizando && (
        <>
          <label className="edicion-etiqueta">Titular</label>
          <textarea
            className="edicion-input"
            rows={2}
            value={analisis?.titular || ''}
            placeholder="Escribe el titular del panel…"
            onChange={(e) => onEditar({ titular: e.target.value })}
          />

          <label className="edicion-etiqueta">Alertas y conexiones</label>
          <div className="analisis-edita-lista">
            {conexiones.map((c, i) => (
              <div className="analisis-edita-fila" key={i}>
                <div className="analisis-edita-campos">
                  <input
                    className="edicion-mini"
                    value={c.titulo || ''}
                    placeholder="Título corto"
                    onChange={(e) =>
                      onEditar({
                        conexiones: conexiones.map((x, j) =>
                          j === i ? { ...x, titulo: e.target.value } : x
                        ),
                      })
                    }
                  />
                  <textarea
                    className="edicion-mini"
                    rows={2}
                    value={c.texto || ''}
                    placeholder="Texto de la alerta"
                    onChange={(e) =>
                      onEditar({
                        conexiones: conexiones.map((x, j) =>
                          j === i ? { ...x, texto: e.target.value } : x
                        ),
                      })
                    }
                  />
                </div>
                <button
                  className="edicion-quitar"
                  type="button"
                  title="Quitar alerta"
                  onClick={() => onEditar({ conexiones: conexiones.filter((_, j) => j !== i) })}
                >
                  <IconoCerrar tam={14} />
                </button>
              </div>
            ))}
            <button
              className="edicion-anadir"
              type="button"
              onClick={() =>
                onEditar({ conexiones: [...conexiones, { titulo: '', texto: '' }] })
              }
            >
              <IconoMas tam={13} /> Añadir alerta
            </button>
          </div>

          <label className="edicion-etiqueta">Tareas</label>
          <div className="analisis-edita-lista">
            {sugerencias.map((t, i) => (
              <div className="analisis-edita-fila" key={i}>
                <input
                  className="edicion-mini"
                  value={t}
                  placeholder="Tarea"
                  onChange={(e) =>
                    onEditar({
                      sugerencias: sugerencias.map((x, j) => (j === i ? e.target.value : x)),
                    })
                  }
                />
                <button
                  className="edicion-quitar"
                  type="button"
                  title="Quitar tarea"
                  onClick={() => onEditar({ sugerencias: sugerencias.filter((_, j) => j !== i) })}
                >
                  <IconoCerrar tam={14} />
                </button>
              </div>
            ))}
            <button
              className="edicion-anadir"
              type="button"
              onClick={() => onEditar({ sugerencias: [...sugerencias, 'Nueva tarea'] })}
            >
              <IconoMas tam={13} /> Añadir tarea
            </button>
          </div>
        </>
      )}

      {/* ----- Modo lectura ----- */}
      {analisis && !analizando && !editable && (
        <>
          {analisis.titular && <p className="analisis-titular">{analisis.titular}</p>}

          {conexiones.length > 0 && (
            <div className="analisis-conexiones">
              {conexiones.map((c, i) => (
                <div className="analisis-conexion" key={i}>
                  <span className="analisis-conexion-punto">{i === 0 ? '⚠️' : '⚡'}</span>
                  <div>
                    {c.titulo && <strong>{c.titulo}</strong>}
                    <p>{c.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sugerencias.length > 0 && (
            <div className="analisis-sugerencias">
              <h4>Tareas</h4>
              <ul>
                {sugerencias.map((texto, i) => (
                  <li key={i}>
                    <label className={hechas[i] ? 'hecha' : ''}>
                      <input
                        type="checkbox"
                        checked={Boolean(hechas[i])}
                        onChange={() => setHechas((prev) => ({ ...prev, [i]: !prev[i] }))}
                      />
                      <span>{texto}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analisis.esEjemplo && (
            <p className="analisis-nota">
              Análisis de ejemplo — crea tu propio panel para usar tus datos reales.
            </p>
          )}
        </>
      )}
    </div>
  )
}
