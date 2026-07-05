import { useState } from 'react'
import { IconoChispa, IconoAlerta, IconoSincronizar } from './Iconos'
import './AnalisisIA.css'

/*
  Análisis & alertas: la IA cruza TODAS las fuentes con el perfil del usuario
  y devuelve un titular, conexiones detectadas (se muestran como alertas) y
  sugerencias (se muestran como una lista de tareas marcables). Se regenera
  automáticamente al añadir o quitar datos.
*/
export default function AnalisisIA({ analisis, analizando, aviso, hayFuentes, onActualizar }) {
  const [hechas, setHechas] = useState({})

  return (
    <div className="analisis">
      <div className="analisis-cabecera">
        <h3>
          <span className="analisis-icono">
            <IconoChispa tam={15} />
          </span>
          Análisis & alertas
        </h3>
        {hayFuentes && (
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

      {!analizando && !analisis && !aviso && (
        <p className="analisis-cargando">
          {hayFuentes
            ? 'El análisis se generará en cuanto termine el procesado de tus datos.'
            : 'Añade tus datos y la IA los entenderá en conjunto: conexiones, cifras clave y qué hacer.'}
        </p>
      )}

      {analisis && !analizando && (
        <>
          {analisis.titular && <p className="analisis-titular">{analisis.titular}</p>}

          {analisis.conexiones?.length > 0 && (
            <div className="analisis-conexiones">
              {analisis.conexiones.map((c, i) => (
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

          {analisis.sugerencias?.length > 0 && (
            <div className="analisis-sugerencias">
              <h4>Tareas</h4>
              <ul>
                {analisis.sugerencias.map((texto, i) => (
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
