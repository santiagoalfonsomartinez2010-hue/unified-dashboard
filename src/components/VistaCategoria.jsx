import { useState } from 'react'
import { infoCategoria, INFO_CATEGORIAS } from '../lib/categorias'
import { generarInicial, colorCliente } from '../lib/visuales'
import { IconoCerrar, IconoLapiz, IconoCheck, IconoMas } from './Iconos'
import './Vistas.css'
import './Edicion.css'

/*
  Apartado por categoría (Finanzas, Clientes, Personal…): las métricas de las
  fuentes de esa categoría arriba y sus tablas estilo referencia (buscador,
  cabeceras en mayúsculas, avatar con iniciales y pastillas de estado).

  Cada tabla tiene un MODO EDICIÓN completo: editar celdas, añadir/quitar
  filas y columnas, renombrar columnas, editar métricas, renombrar la fuente
  y cambiarla de categoría.
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
  return v.length > 2 && v.length < 40 && /^[A-Za-zÁÉÍÓÚáéíóúÑñ .'-]+$/.test(v)
}

export function TablaFuente({ fuente, onEditar, onQuitar }) {
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState(false)
  const r = fuente.resultado

  // En modo edición se muestran todas las filas (los índices deben coincidir)
  const filtroLimpio = editando ? '' : filtro.trim().toLowerCase()
  const filas = filtroLimpio
    ? r.registros.filter((fila) =>
        r.columnas.some((c) => String(fila[c] ?? '').toLowerCase().includes(filtroLimpio))
      )
    : r.registros

  // La primera columna con pinta de nombre lleva avatar
  const colAvatar = r.columnas.find((c) => r.registros.some((fila) => pareceNombre(fila[c])))

  /* --- Operaciones de edición --- */

  function cambiarCelda(idx, col, valor) {
    onEditar(fuente.id, {
      registros: r.registros.map((fila, i) => (i === idx ? { ...fila, [col]: valor } : fila)),
    })
  }

  function anadirFila() {
    const vacia = Object.fromEntries(r.columnas.map((c) => [c, '']))
    onEditar(fuente.id, { registros: [...r.registros, vacia] })
  }

  function quitarFila(idx) {
    onEditar(fuente.id, { registros: r.registros.filter((_, i) => i !== idx) })
  }

  function renombrarColumna(vieja, nueva) {
    const limpia = nueva.trim()
    if (!limpia || limpia === vieja || r.columnas.includes(limpia)) return
    onEditar(fuente.id, {
      columnas: r.columnas.map((c) => (c === vieja ? limpia : c)),
      registros: r.registros.map((fila) => {
        const nf = { ...fila, [limpia]: fila[vieja] }
        delete nf[vieja]
        return nf
      }),
    })
  }

  function quitarColumna(col) {
    if (r.columnas.length <= 1) return
    onEditar(fuente.id, {
      columnas: r.columnas.filter((c) => c !== col),
      registros: r.registros.map((fila) => {
        const nf = { ...fila }
        delete nf[col]
        return nf
      }),
    })
  }

  function anadirColumna() {
    let n = r.columnas.length + 1
    while (r.columnas.includes(`Columna ${n}`)) n++
    const nueva = `Columna ${n}`
    onEditar(fuente.id, {
      columnas: [...r.columnas, nueva],
      registros: r.registros.map((fila) => ({ ...fila, [nueva]: '' })),
    })
  }

  const metricas = r.metricas || []

  return (
    <div className="tabla-card">
      <div className="tabla-card-cabecera">
        <div>
          {editando ? (
            <input
              className="edicion-mini tabla-edita-titulo"
              value={r.titulo}
              onChange={(e) => onEditar(fuente.id, { titulo: e.target.value })}
              placeholder="Nombre de la tabla"
            />
          ) : (
            <h3>{r.titulo}</h3>
          )}
          <span className="tabla-card-sub">
            {filas.length} de {r.registros.length} registros
          </span>
        </div>

        {editando && (
          <select
            className="edicion-mini tabla-edita-categoria"
            value={r.categoria}
            onChange={(e) => onEditar(fuente.id, { categoria: e.target.value })}
            title="Cambiar de apartado"
          >
            {Object.entries(INFO_CATEGORIAS).map(([clave, info]) => (
              <option key={clave} value={clave}>
                {info.etiqueta}
              </option>
            ))}
          </select>
        )}

        {!editando && r.registros.length > 5 && (
          <input
            className="tabla-buscador"
            type="search"
            placeholder="Buscar…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}

        <button
          className={`boton-secundario tabla-editar ${editando ? 'activo' : ''}`}
          type="button"
          onClick={() => setEditando(!editando)}
        >
          {editando ? <IconoCheck tam={14} /> : <IconoLapiz tam={14} />}
          {editando ? 'Hecho' : 'Editar'}
        </button>

        <button className="tabla-quitar" type="button" title="Quitar fuente" onClick={onQuitar}>
          <IconoCerrar tam={14} />
        </button>
      </div>

      {/* Métricas: pastillas en lectura, editables en modo edición */}
      {editando ? (
        <div className="tabla-edita-metricas">
          {metricas.map((m, i) => (
            <div className="tabla-edita-metrica" key={i}>
              <input
                className="edicion-mini"
                value={m.valor}
                placeholder="Valor"
                onChange={(e) =>
                  onEditar(fuente.id, {
                    metricas: metricas.map((x, j) =>
                      j === i ? { ...x, valor: e.target.value } : x
                    ),
                  })
                }
              />
              <input
                className="edicion-mini"
                value={m.etiqueta}
                placeholder="Etiqueta"
                onChange={(e) =>
                  onEditar(fuente.id, {
                    metricas: metricas.map((x, j) =>
                      j === i ? { ...x, etiqueta: e.target.value } : x
                    ),
                  })
                }
              />
              <button
                className="edicion-quitar"
                type="button"
                title="Quitar métrica"
                onClick={() =>
                  onEditar(fuente.id, { metricas: metricas.filter((_, j) => j !== i) })
                }
              >
                <IconoCerrar tam={14} />
              </button>
            </div>
          ))}
          <button
            className="edicion-anadir"
            type="button"
            onClick={() =>
              onEditar(fuente.id, { metricas: [...metricas, { etiqueta: 'métrica', valor: '0' }] })
            }
          >
            <IconoMas tam={13} /> Añadir métrica
          </button>
        </div>
      ) : (
        metricas.length > 0 && (
          <div className="tabla-metricas">
            {metricas.map((m, i) => (
              <span key={i}>
                <b>{m.valor}</b> {m.etiqueta}
              </span>
            ))}
          </div>
        )
      )}

      {r.registros.length === 0 && !editando ? (
        <p className="tabla-vacia">
          {r.resumen}{' '}
          <button
            className="tabla-vacia-anadir"
            type="button"
            onClick={() => {
              setEditando(true)
              anadirFila()
            }}
          >
            Añadir la primera fila
          </button>
        </p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla-app">
            <thead>
              <tr>
                {r.columnas.map((c) => (
                  <th key={c}>
                    {editando ? (
                      <span className="tabla-edita-col">
                        <input
                          className="edicion-mini"
                          defaultValue={c}
                          onBlur={(e) => renombrarColumna(c, e.target.value)}
                          title="Renombrar columna (al salir del campo)"
                        />
                        <button
                          className="edicion-quitar"
                          type="button"
                          title="Quitar columna"
                          onClick={() => quitarColumna(c)}
                        >
                          <IconoCerrar tam={12} />
                        </button>
                      </span>
                    ) : (
                      c
                    )}
                  </th>
                ))}
                {editando && (
                  <th className="tabla-th-acciones">
                    <button
                      className="edicion-anadir tabla-anadir-col"
                      type="button"
                      title="Añadir columna"
                      onClick={anadirColumna}
                    >
                      <IconoMas tam={12} /> Col.
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={i}>
                  {r.columnas.map((c) => {
                    const valor = String(fila[c] ?? '')
                    if (editando) {
                      return (
                        <td key={c} className="tabla-td-edita">
                          <input
                            className="edicion-mini"
                            value={valor}
                            onChange={(e) => cambiarCelda(i, c, e.target.value)}
                          />
                        </td>
                      )
                    }
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
                  {editando && (
                    <td className="tabla-td-acciones">
                      <button
                        className="edicion-quitar"
                        type="button"
                        title="Quitar fila"
                        onClick={() => quitarFila(i)}
                      >
                        <IconoCerrar tam={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <button className="edicion-anadir tabla-anadir-fila" type="button" onClick={anadirFila}>
          <IconoMas tam={13} /> Añadir fila
        </button>
      )}
    </div>
  )
}

export default function VistaCategoria({ categoria, fuentes, onEditarFuente, onQuitarFuente, onNuevaTabla }) {
  const info = infoCategoria(categoria)
  const deCategoria = fuentes.filter(
    (f) => f.estado === 'listo' && f.resultado.categoria === categoria
  )

  return (
    <div className="vista">
      {deCategoria.length === 0 ? (
        <div className="vista-vacia">
          <h3>Sin fuentes de {info.etiqueta.toLowerCase()}</h3>
          <p>Añade datos de esta categoría o crea una tabla manual.</p>
        </div>
      ) : (
        deCategoria.map((f) => (
          <TablaFuente
            key={f.id}
            fuente={f}
            onEditar={onEditarFuente}
            onQuitar={() => onQuitarFuente(f.id)}
          />
        ))
      )}
      <button className="edicion-anadir" type="button" onClick={onNuevaTabla}>
        + Nueva tabla manual en {info.etiqueta.toLowerCase()}
      </button>
    </div>
  )
}
