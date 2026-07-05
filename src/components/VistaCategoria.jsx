import { useState } from 'react'
import { infoCategoria } from '../lib/categorias'
import { generarInicial, colorCliente } from '../lib/visuales'
import { IconoCerrar } from './Iconos'
import './Vistas.css'

/*
  Apartado por categoría (Finanzas, Clientes, Personal…): las métricas de las
  fuentes de esa categoría arriba y sus tablas estilo referencia (buscador,
  cabeceras en mayúsculas, avatar con iniciales y pastillas de estado).
*/

// Valores de celda que se pintan como pastilla de estado
const ESTADOS_POSITIVOS = [
  'pagado', 'pagada', 'cobrado', 'cobrada', 'activo', 'activa', 'completado', 'completada',
  'confirmado', 'confirmada', 'disponible', 'en stock', 'sí', 'si', 'ok', 'entregado', 'alta',
]
const ESTADOS_NEGATIVOS = [
  'impago', 'impagado', 'pendiente', 'vencido', 'vencida', 'no', 'agotado', 'agotada',
  'cancelado', 'cancelada', 'sin stock', 'reponer', 'baja', 'retrasado', 'urgente',
]
const ESTADOS_NEUTROS = ['pausado', 'pausada', 'en curso', 'en proceso', 'parcial', 'revisión']

function tonoEstado(valor) {
  const v = String(valor || '').trim().toLowerCase()
  if (!v || v.length > 22) return null
  if (ESTADOS_POSITIVOS.includes(v)) return 'positivo'
  if (ESTADOS_NEGATIVOS.includes(v)) return 'negativo'
  if (ESTADOS_NEUTROS.includes(v)) return 'neutro'
  return null
}

// ¿La celda parece un nombre (texto sin números) para llevar avatar?
function pareceNombre(valor) {
  const v = String(valor || '').trim()
  return v.length > 2 && v.length < 40 && /^[^\d]+$/.test(v) && v.includes(' ') === true
    ? true
    : v.length > 2 && v.length < 40 && /^[A-Za-zÁÉÍÓÚáéíóúÑñ .'-]+$/.test(v)
}

function TablaFuente({ fuente, onQuitar }) {
  const [filtro, setFiltro] = useState('')
  const r = fuente.resultado
  const filtroLimpio = filtro.trim().toLowerCase()
  const filas = filtroLimpio
    ? r.registros.filter((fila) =>
        r.columnas.some((c) => String(fila[c] ?? '').toLowerCase().includes(filtroLimpio))
      )
    : r.registros

  // La primera columna con pinta de nombre lleva avatar
  const colAvatar = r.columnas.find((c) => r.registros.some((fila) => pareceNombre(fila[c])))

  return (
    <div className="tabla-card">
      <div className="tabla-card-cabecera">
        <div>
          <h3>{r.titulo}</h3>
          <span className="tabla-card-sub">
            {filas.length} de {r.registros.length} registros
          </span>
        </div>
        {r.registros.length > 5 && (
          <input
            className="tabla-buscador"
            type="search"
            placeholder="Buscar…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}
        <button className="tabla-quitar" type="button" title="Quitar fuente" onClick={onQuitar}>
          <IconoCerrar tam={14} />
        </button>
      </div>

      {r.metricas?.length > 0 && (
        <div className="tabla-metricas">
          {r.metricas.map((m, i) => (
            <span key={i}>
              <b>{m.valor}</b> {m.etiqueta}
            </span>
          ))}
        </div>
      )}

      {r.registros.length === 0 ? (
        <p className="tabla-vacia">{r.resumen}</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla-app">
            <thead>
              <tr>
                {r.columnas.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={i}>
                  {r.columnas.map((c) => {
                    const valor = String(fila[c] ?? '')
                    const tono = tonoEstado(valor)
                    return (
                      <td key={c}>
                        {c === colAvatar && pareceNombre(valor) ? (
                          <span className="tabla-persona">
                            <span
                              className="tabla-avatar"
                              style={{ background: colorCliente(valor) }}
                            >
                              {generarInicial(valor)}
                            </span>
                            {valor}
                          </span>
                        ) : tono ? (
                          <span className={`tabla-estado ${tono}`}>{valor}</span>
                        ) : (
                          valor
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function VistaCategoria({ categoria, fuentes, onQuitarFuente }) {
  const info = infoCategoria(categoria)
  const deCategoria = fuentes.filter(
    (f) => f.estado === 'listo' && f.resultado.categoria === categoria
  )

  return (
    <div className="vista">
      {deCategoria.length === 0 ? (
        <div className="vista-vacia">
          <h3>Sin fuentes de {info.etiqueta.toLowerCase()}</h3>
          <p>Añade datos de esta categoría y aparecerán aquí organizados.</p>
        </div>
      ) : (
        deCategoria.map((f) => (
          <TablaFuente key={f.id} fuente={f} onQuitar={() => onQuitarFuente(f.id)} />
        ))
      )}
    </div>
  )
}
