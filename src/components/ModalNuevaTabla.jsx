import { useState } from 'react'
import { IconoCerrar, IconoMas } from './Iconos'
import { INFO_CATEGORIAS } from '../lib/categorias'
import './Edicion.css'

/*
  Modal "Nueva tabla": crea una fuente manual vacía (proveedores, clientes,
  citas, gastos…) sin subir ningún archivo. Se eligen nombre, categoría y
  columnas; después las filas se añaden desde el propio apartado.
*/

const PLANTILLAS = [
  { nombre: 'Proveedores', categoria: 'operaciones', columnas: ['Proveedor', 'Contacto', 'Producto', 'Estado'] },
  { nombre: 'Clientes', categoria: 'clientes', columnas: ['Nombre', 'Teléfono', 'Última visita', 'Estado'] },
  { nombre: 'Citas', categoria: 'agenda', columnas: ['Fecha', 'Hora', 'Cliente', 'Servicio'] },
  { nombre: 'Gastos', categoria: 'finanzas', columnas: ['Concepto', 'Importe', 'Fecha', 'Estado'] },
  { nombre: 'Inventario', categoria: 'inventario', columnas: ['Artículo', 'Cantidad', 'Estado'] },
  { nombre: 'Equipo', categoria: 'personas', columnas: ['Nombre', 'Puesto', 'Turno', 'Salario'] },
]

export default function ModalNuevaTabla({ categoriaInicial, onCrear, onCerrar }) {
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState(categoriaInicial || 'otros')
  const [columnas, setColumnas] = useState('')

  function usarPlantilla(p) {
    setTitulo(p.nombre)
    setCategoria(p.categoria)
    setColumnas(p.columnas.join(', '))
  }

  function crear(e) {
    e.preventDefault()
    onCrear({
      titulo: titulo.trim() || 'Nueva tabla',
      categoria,
      columnas: columnas
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 8),
    })
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrar" type="button" onClick={onCerrar} title="Cerrar">
          <IconoCerrar tam={16} />
        </button>

        <span className="modal-icono">
          <IconoMas tam={20} />
        </span>
        <h2>Nueva tabla manual</h2>
        <p>
          Crea una tabla desde cero — proveedores, clientes, citas, gastos… — y añade las filas
          a mano desde su apartado.
        </p>

        <div className="nuevatabla-plantillas">
          {PLANTILLAS.map((p) => (
            <button key={p.nombre} type="button" onClick={() => usarPlantilla(p)}>
              {p.nombre}
            </button>
          ))}
        </div>

        <form onSubmit={crear}>
          <label className="edicion-etiqueta">Nombre de la tabla</label>
          <input
            className="edicion-input"
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej: Proveedores"
            maxLength={60}
            autoFocus
          />

          <label className="edicion-etiqueta">Categoría (su apartado en el panel)</label>
          <select
            className="edicion-input"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          >
            {Object.entries(INFO_CATEGORIAS).map(([clave, info]) => (
              <option key={clave} value={clave}>
                {info.etiqueta}
              </option>
            ))}
          </select>

          <label className="edicion-etiqueta">Columnas (separadas por comas)</label>
          <input
            className="edicion-input"
            type="text"
            value={columnas}
            onChange={(e) => setColumnas(e.target.value)}
            placeholder="Nombre, Detalle, Estado, Fecha"
          />

          <button className="boton-primario nuevatabla-crear" type="submit">
            <IconoMas tam={15} /> Crear tabla
          </button>
        </form>
      </div>
    </div>
  )
}
